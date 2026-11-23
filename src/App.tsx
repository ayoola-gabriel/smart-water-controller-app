import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopNav, type AppScreen } from './components/TopNav';
import { AuthScreen } from './components/AuthScreen';
import { DeviceListScreen } from './components/DeviceListScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ControlsScreen } from './components/ControlsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { PasskeyPairingModal } from './components/PasskeyPairingModal';
import { WebBleControllerClient } from './lib/bleService';
import {
  DEFAULT_DEVICE_ID,
  type BleControlAction,
} from './lib/protocol';
import {
  loadBondedDevices,
  loadThemePreference,
  removeBondedDevice,
  saveBondedDevice,
  saveThemePreference,
} from './lib/storage';
import {
  dispatchRemoteCommand,
  fetchAuthorizedDevices,
  fetchRemoteDeviceStatus,
  fetchRemoteTelemetryHistory,
  getCurrentAppUser,
  getSupabaseClient,
  isSupabaseConfigured,
  signOutAppUser,
} from './lib/supabaseClient';
import type {
  AppUser,
  ControllerProfile,
  DeviceSummary,
  PumpMode,
  TelemetrySample,
} from './types/controller';

const REMOTE_POLL_INTERVAL_MS = 12_000;
const DEFAULT_PROFILE: ControllerProfile = {
  tankName: 'Water Tank',
  tankCapacityLiters: 0,
  lowThresholdPct: 25,
  midThresholdPct: 55,
  fullThresholdPct: 88,
  maxPumpRunSec: 1800,
  overcurrentLimitA: 0,
  dryRunProtection: true,
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [user, setUser] = useState<AppUser | null>(null);
  const [offlineBleMode, setOfflineBleMode] = useState<boolean>(false);
  const [activeScreen, setActiveScreen] = useState<AppScreen>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'dashboard';
      }
    }
    return 'auth';
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [pairingOpen, setPairingOpen] = useState(false);
  const [bleBusy, setBleBusy] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [refreshingRemote, setRefreshingRemote] = useState(false);
  const [clearingFault, setClearingFault] = useState(false);

  // Real Web Bluetooth state
  const bleClientRef = useRef<WebBleControllerClient | null>(null);
  const [realBleConnected, setRealBleConnected] = useState(false);
  const [realBleTelemetry, setRealBleTelemetry] = useState<TelemetrySample | null>(null);
  const [realBleDeviceId, setRealBleDeviceId] = useState<string | null>(null);

  // Real Supabase cloud state
  const [remoteDevices, setRemoteDevices] = useState<DeviceSummary[]>([]);
  const [remoteTelemetry, setRemoteTelemetry] = useState<TelemetrySample | null>(null);
  const [remoteHistory, setRemoteHistory] = useState<TelemetrySample[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(DEFAULT_DEVICE_ID);

  // Sync theme to <html class="dark">
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveThemePreference(theme);
  }, [theme]);

  // Update live telemetry age labels once per second.
  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(clockTimer);
    };
  }, []);

  // Initialize Web Bluetooth client & auto-reconnect bonded device on resume
  useEffect(() => {
    const client = new WebBleControllerClient();
    client.setCallbacks(
      (sample) => {
        setRealBleTelemetry(sample);
        setRealBleConnected(true);
      },
      () => {
        setRealBleConnected(false);
      }
    );
    bleClientRef.current = client;

    // Allow the hosted app shortcut to open directly into the real controller list.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        setOfflineBleMode(true);
      }
    }

    return () => {
      client.disconnect();
    };
  }, []);

  // Check existing Supabase session on mount
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    void getCurrentAppUser().then((found) => {
      if (found) {
        setUser(found);
        setActiveScreen((prev) => (prev === 'auth' ? 'dashboard' : prev));
      }
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || 'user' });
      } else {
        setUser(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshCloudData = useCallback(async () => {
    if (!user || !isSupabaseConfigured()) return;
    setRefreshingRemote(true);
    try {
      const [devs, statusRes, hist] = await Promise.all([
        fetchAuthorizedDevices(),
        fetchRemoteDeviceStatus(selectedDeviceId),
        fetchRemoteTelemetryHistory(selectedDeviceId, 60),
      ]);
      setRemoteDevices(devs);
      if (statusRes.telemetry) {
        setRemoteTelemetry(statusRes.telemetry);
      }
      setRemoteHistory(hist);
    } catch {
      // Keep cached telemetry with age indicator rather than clearing UI
    } finally {
      setRefreshingRemote(false);
    }
  }, [user, selectedDeviceId]);

  // Remote polling every 12s + app resume refresh
  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;
    void refreshCloudData();
    const timer = window.setInterval(() => {
      void refreshCloudData();
    }, REMOTE_POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshCloudData();
        const bonded = loadBondedDevices()[0];
        if (bonded && !bleClientRef.current?.connected) {
          void bleClientRef.current?.reconnectBonded(bonded.bleDeviceId).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, refreshCloudData]);

  // Build the device list from authorized cloud devices and real saved BLE bonds.
  const devices: DeviceSummary[] = useMemo(() => {
    const bondedList = loadBondedDevices();
    const list: DeviceSummary[] = remoteDevices.map((device) => ({ ...device }));

    for (const bonded of bondedList) {
      const existing = list.find((device) => device.device_id === bonded.deviceId);
      if (existing) {
        existing.bleBonded = true;
        continue;
      }
      list.push({
        device_id: bonded.deviceId,
        name: bonded.name,
        role: 'local',
        bleBonded: true,
        bleConnected: false,
        wifiOnline: false,
        cloudOnline: false,
        lastTelemetryAtMs: null,
        latestTelemetry: null,
      });
    }

    // Add real BLE device if connected or bonded separately
    if (realBleConnected && realBleDeviceId) {
      const existing = list.find((device) => device.device_id === DEFAULT_DEVICE_ID);
      if (existing) {
        existing.bleConnected = true;
        existing.bleBonded = true;
        existing.latestTelemetry = realBleTelemetry;
        existing.lastTelemetryAtMs = realBleTelemetry?.timestampMs ?? null;
        existing.wifiOnline = Boolean(realBleTelemetry?.wifi);
      } else {
        list.unshift({
          device_id: DEFAULT_DEVICE_ID,
          name: 'Smart Water Controller (BLE)',
          role: 'local',
          bleBonded: true,
          bleConnected: true,
          wifiOnline: Boolean(realBleTelemetry?.wifi),
          cloudOnline: false,
          lastTelemetryAtMs: realBleTelemetry?.timestampMs ?? null,
          latestTelemetry: realBleTelemetry,
        });
      }
    }

    return list;
  }, [remoteDevices, realBleConnected, realBleDeviceId, realBleTelemetry]);

  const activeDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? devices[0] ?? null,
    [devices, selectedDeviceId]
  );

  const activeTelemetry: TelemetrySample | null = useMemo(() => {
    if (realBleConnected) return realBleTelemetry;
    if (user && isSupabaseConfigured() && remoteTelemetry) {
      return remoteTelemetry;
    }
    return activeDevice?.latestTelemetry ?? null;
  }, [realBleConnected, realBleTelemetry, user, remoteTelemetry, activeDevice]);

  const activeHistory: TelemetrySample[] = useMemo(() => {
    if (user && isSupabaseConfigured()) {
      return remoteHistory;
    }
    return [];
  }, [user, remoteHistory]);

  // Handlers
  const handlePairRealBle = async () => {
    setBleBusy(true);
    setBleError(null);
    try {
      const info = await bleClientRef.current!.scanAndConnect();
      setRealBleDeviceId(info.bleDeviceId);
      setRealBleConnected(true);
      saveBondedDevice({
        deviceId: DEFAULT_DEVICE_ID,
        bleDeviceId: info.bleDeviceId,
        name: info.name,
        pairedAtMs: Date.now(),
      });
      setSelectedDeviceId(DEFAULT_DEVICE_ID);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'BLE pairing failed.';
      setBleError(msg);
      throw err;
    } finally {
      setBleBusy(false);
    }
  };

  const handleReconnectBle = async (deviceId: string) => {
    const bonded = loadBondedDevices().find((entry) => entry.deviceId === deviceId);
    if (bonded) {
      const ok = await bleClientRef.current!.reconnectBonded(bonded.bleDeviceId);
      if (ok) {
        setRealBleDeviceId(bonded.bleDeviceId);
        setRealBleConnected(true);
        setSelectedDeviceId(deviceId);
        return;
      }
    }
    setPairingOpen(true);
  };

  const handleDisconnectBle = () => {
    if (realBleConnected) {
      bleClientRef.current?.disconnect();
      setRealBleConnected(false);
    }
  };

  const handleForgetBle = () => {
    handleDisconnectBle();
    if (activeDevice) {
      removeBondedDevice(activeDevice.device_id);
    }
  };

  const handleSendBleCommand = async (action: BleControlAction) => {
    if (realBleConnected && bleClientRef.current?.paired) {
      await bleClientRef.current.sendControl(action);
      return;
    }
    throw new Error('Connect to the controller over Bluetooth before sending a local command.');
  };

  const handleSendRemoteCommand = async (params: {
    mode?: PumpMode;
    pump?: boolean;
    clearFault?: boolean;
  }) => {
    if (!user || !isSupabaseConfigured()) {
      throw new Error('Sign in to your controller account to send a remote command.');
    }
    await dispatchRemoteCommand({
      deviceId: selectedDeviceId,
      mode: params.mode,
      pump: params.pump,
      clearFault: params.clearFault,
    });
  };

  const handleClearFault = async () => {
    setClearingFault(true);
    try {
      await handleSendBleCommand({ type: 'CLEAR_FAULT' });
    } finally {
      setClearingFault(false);
    }
  };

  const handleSaveProfile = async (next: ControllerProfile) => {
    if (!realBleConnected || !bleClientRef.current?.paired) {
      throw new Error('Connect to the controller over Bluetooth to save its profile.');
    }
    await bleClientRef.current.writeProfile(next);
  };

  const handleReadProfile = async (): Promise<ControllerProfile> => {
    if (!realBleConnected || !bleClientRef.current?.paired) {
      throw new Error('Connect to the controller over Bluetooth to read its profile.');
    }
    const partial = await bleClientRef.current.readProfile();
    return { ...DEFAULT_PROFILE, ...partial };
  };

  const handleProvisionWifi = async (ssid: string, password: string) => {
    if (!realBleConnected || !bleClientRef.current?.paired) {
      throw new Error('Connect to the controller over Bluetooth to provision Wi-Fi.');
    }
    await bleClientRef.current.provisionWifi(ssid, password);
  };

  const handleSignOut = async () => {
    await signOutAppUser();
    setUser(null);
    setOfflineBleMode(false);
    setRemoteDevices([]);
    setActiveScreen('auth');
  };

  const showNav = activeScreen !== 'auth';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {showNav && (
        <TopNav
          activeScreen={activeScreen}
          onNavigate={setActiveScreen}
          user={user}
          offlineMode={offlineBleMode}
          onAuthAction={() => {
            if (user) {
              void handleSignOut();
            } else {
              setActiveScreen('auth');
            }
          }}
          bleConnected={Boolean(activeDevice?.bleConnected)}
          cloudOnline={Boolean(activeDevice?.cloudOnline)}
        />
      )}

      <main className={showNav ? 'pb-20 md:pb-10' : ''}>
        {activeScreen === 'auth' && (
          <AuthScreen
            onAuthenticated={(authedUser) => {
              setUser(authedUser);
              setOfflineBleMode(false);
              setActiveScreen('devices');
            }}
            onContinueOfflineBle={() => {
              setOfflineBleMode(true);
              setActiveScreen('devices');
            }}
          />
        )}

        {activeScreen === 'devices' && (
          <DeviceListScreen
            devices={devices}
            selectedDeviceId={activeDevice?.device_id ?? DEFAULT_DEVICE_ID}
            onSelectDevice={(id) => {
              setSelectedDeviceId(id);
              setActiveScreen('dashboard');
            }}
            onOpenPairing={() => setPairingOpen(true)}
            onReconnectBle={(id) => void handleReconnectBle(id)}
            onRefreshRemote={() => void refreshCloudData()}
            refreshing={refreshingRemote}
            user={user}
            nowMs={nowMs}
          />
        )}

        {activeScreen === 'dashboard' && (
          <DashboardScreen
            device={activeDevice}
            telemetry={activeTelemetry}
            profile={DEFAULT_PROFILE}
            nowMs={nowMs}
            onNavigateControls={() => setActiveScreen('controls')}
            onNavigateHistory={() => setActiveScreen('history')}
            onOpenPairing={() => setPairingOpen(true)}
            onClearFault={() => void handleClearFault()}
            clearingFault={clearingFault}
          />
        )}

        {activeScreen === 'controls' && (
          <ControlsScreen
            device={activeDevice}
            telemetry={activeTelemetry}
            user={user}
            onSendBleCommand={handleSendBleCommand}
            onSendRemoteCommand={handleSendRemoteCommand}
            onOpenPairing={() => setPairingOpen(true)}
          />
        )}

        {activeScreen === 'history' && (
          <HistoryScreen
            samples={activeHistory}
            onRefresh={() => void refreshCloudData()}
            refreshing={refreshingRemote}
          />
        )}

        {activeScreen === 'settings' && (
          <SettingsScreen
            theme={theme}
            onToggleTheme={setTheme}
            device={activeDevice}
            profile={DEFAULT_PROFILE}
            user={user}
            onOpenPairing={() => setPairingOpen(true)}
            onReconnectBle={() => handleReconnectBle(activeDevice?.device_id ?? DEFAULT_DEVICE_ID)}
            onDisconnectBle={handleDisconnectBle}
            onForgetBle={handleForgetBle}
            onSaveProfile={handleSaveProfile}
            onReadProfile={handleReadProfile}
            onProvisionWifi={handleProvisionWifi}
            onSignOut={() => void handleSignOut()}
          />
        )}
      </main>

      <PasskeyPairingModal
        open={pairingOpen}
        onClose={() => {
          setPairingOpen(false);
          setBleError(null);
        }}
        onPairRealBle={handlePairRealBle}
        bleBusy={bleBusy}
        bleError={bleError}
      />
    </div>
  );
}
