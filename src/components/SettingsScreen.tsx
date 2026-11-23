import { useState } from 'react';
import {
  Bluetooth,
  CheckCircle2,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sun,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import { buildWifiProvisioningPayload } from '../lib/protocol';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { AppUser, ControllerProfile, DeviceSummary } from '../types/controller';

interface SettingsScreenProps {
  theme: 'light' | 'dark';
  onToggleTheme: (next: 'light' | 'dark') => void;
  device: DeviceSummary | null;
  profile: ControllerProfile;
  user: AppUser | null;
  onOpenPairing: () => void;
  onReconnectBle: () => Promise<void>;
  onDisconnectBle: () => void;
  onForgetBle: () => void;
  onSaveProfile: (profile: ControllerProfile) => Promise<void>;
  onReadProfile: () => Promise<ControllerProfile>;
  onProvisionWifi: (ssid: string, password: string) => Promise<void>;
  onSignOut: () => void;
}

export function SettingsScreen({
  theme,
  onToggleTheme,
  device,
  profile,
  user,
  onOpenPairing,
  onReconnectBle,
  onDisconnectBle,
  onForgetBle,
  onSaveProfile,
  onReadProfile,
  onProvisionWifi,
  onSignOut,
}: SettingsScreenProps) {
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiStatus, setWifiStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [wifiBusy, setWifiBusy] = useState(false);

  const [draftProfile, setDraftProfile] = useState<ControllerProfile>(profile);
  const [profileStatus, setProfileStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const blePairedConnected = Boolean(device?.bleConnected && device?.bleBonded);

  const handleWifiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWifiStatus(null);
    if (!blePairedConnected) {
      setWifiStatus({
        tone: 'error',
        text: 'Wi-Fi provisioning requires an active, paired, encrypted BLE connection.',
      });
      return;
    }
    try {
      // Validate without logging credentials
      buildWifiProvisioningPayload(ssid, wifiPassword);
    } catch (err) {
      setWifiStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Invalid Wi-Fi credentials.',
      });
      return;
    }

    setWifiBusy(true);
    try {
      await onProvisionWifi(ssid.trim(), wifiPassword);
      // Immediately wipe password from component memory
      setWifiPassword('');
      setWifiStatus({
        tone: 'ok',
        text: `Wi-Fi provisioning payload written to encrypted write-only characteristic for "${ssid.trim()}". Credentials are never stored or readable back.`,
      });
    } catch (err) {
      setWifiStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Failed to provision Wi-Fi.',
      });
    } finally {
      setWifiBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    if (
      draftProfile.lowThresholdPct >= draftProfile.midThresholdPct ||
      draftProfile.midThresholdPct >= draftProfile.fullThresholdPct
    ) {
      setProfileStatus({
        tone: 'error',
        text: 'Thresholds must satisfy LOW < MID < FULL.',
      });
      return;
    }
    setProfileBusy(true);
    try {
      await onSaveProfile(draftProfile);
      setProfileStatus({ tone: 'ok', text: 'Controller profile written over BLE.' });
    } catch (err) {
      setProfileStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to save profile.',
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleReadProfile = async () => {
    setProfileStatus(null);
    setProfileBusy(true);
    try {
      const latest = await onReadProfile();
      setDraftProfile(latest);
      setProfileStatus({ tone: 'ok', text: 'Profile loaded from controller characteristic.' });
    } catch (err) {
      setProfileStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to read profile.',
      });
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Settings & Provisioning
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage BLE bonding, encrypted Wi-Fi provisioning, tank calibration, and account access.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Appearance, BLE Bonding, Account */}
        <div className="lg:col-span-5 space-y-6">
          {/* Theme */}
          <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Display Theme
            </h2>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => onToggleTheme('light')}
                className={`min-h-[44px] px-3 py-2 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Sun className="w-4 h-4" aria-hidden="true" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleTheme('dark')}
                className={`min-h-[44px] px-3 py-2 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Moon className="w-4 h-4" aria-hidden="true" />
                <span>Dark</span>
              </button>
            </div>
          </section>

          {/* BLE Pairing & Reconnect */}
          <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Bluetooth Connection
              </h2>
              <Bluetooth className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div>
                Status:{' '}
                <span className="font-semibold">
                  {device?.bleConnected
                    ? 'Connected'
                    : device?.bleBonded
                    ? 'Paired (not connected)'
                    : 'Not paired'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onOpenPairing}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
              >
                Pair Another Controller
              </button>

              {device?.bleBonded && !device.bleConnected && (
                <button
                  type="button"
                  onClick={() => void onReconnectBle()}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Reconnect
                </button>
              )}

              {device?.bleConnected && (
                <button
                  type="button"
                  onClick={onDisconnectBle}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Disconnect
                </button>
              )}

              {device?.bleBonded && (
                <button
                  type="button"
                  onClick={onForgetBle}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Remove saved device
                </button>
              )}
            </div>
          </section>

          {/* Device Access & Account */}
          <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Account & Device Access
              </h2>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>

            <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
              <div>
                Signed in as: <span className="font-medium text-slate-900 dark:text-slate-100">{user ? user.email : 'Offline BLE Only'}</span>
              </div>
              <div>
                Device role: <span className="font-mono font-semibold">{device?.role ?? 'local'}</span>
              </div>
              <div>
                Supabase backend: <span className="font-mono">{isSupabaseConfigured() ? 'Configured' : 'Not configured'}</span>
              </div>
            </div>

            {user && (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            )}
          </section>

        </div>

        {/* Right Column: Encrypted Wi-Fi Provisioning & Tank Profile */}
        <div className="lg:col-span-7 space-y-6">
          {/* Wi-Fi Provisioning */}
          <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>Controller Wi-Fi</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Send the network name and password securely to the controller. The app does not save the password.
                </p>
              </div>
              <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </div>

            {!blePairedConnected && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200">
                Pair and connect to the controller over BLE first to unlock Wi-Fi provisioning.
              </div>
            )}

            {wifiStatus && (
              <div
                role="status"
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  wifiStatus.tone === 'ok'
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                }`}
              >
                {wifiStatus.tone === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <span>{wifiStatus.text}</span>
              </div>
            )}

            <form onSubmit={handleWifiSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wifi-ssid" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Network Name (SSID)
                </label>
                <input
                  id="wifi-ssid"
                  type="text"
                  maxLength={32}
                  disabled={!blePairedConnected}
                  placeholder="Facility-IoT-24G"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="wifi-pass" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Wi-Fi Passphrase
                </label>
                <input
                  id="wifi-pass"
                  type="password"
                  autoComplete="new-password"
                  maxLength={63}
                  disabled={!blePairedConnected}
                  placeholder="WPA2/WPA3 password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!blePairedConnected || wifiBusy}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {wifiBusy ? 'Sending over BLE…' : 'Send Wi-Fi Credentials (BLE)'}
                </button>
              </div>
            </form>
          </section>

          {/* Controller Profile Settings */}
          <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>Tank Profile & Interlock Thresholds</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Characteristic <span className="font-mono">7c2e0004-…1001</span> (Read / Write UTF-8 JSON over BLE).
                </p>
              </div>

              <button
                type="button"
                disabled={!blePairedConnected || profileBusy}
                onClick={handleReadProfile}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Read from Device</span>
              </button>
            </div>

            {profileStatus && (
              <div
                role="status"
                className={`p-3 rounded-lg border text-xs ${
                  profileStatus.tone === 'ok'
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                }`}
              >
                {profileStatus.text}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tank Label
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={draftProfile.tankName}
                  onChange={(e) => setDraftProfile({ ...draftProfile, tankName: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="prof-cap" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Capacity (Liters)
                </label>
                <input
                  id="prof-cap"
                  type="number"
                  min={100}
                  max={100000}
                  value={draftProfile.tankCapacityLiters}
                  onChange={(e) =>
                    setDraftProfile({ ...draftProfile, tankCapacityLiters: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="prof-low" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  LOW Trigger (%)
                </label>
                <input
                  id="prof-low"
                  type="number"
                  min={5}
                  max={60}
                  value={draftProfile.lowThresholdPct}
                  onChange={(e) =>
                    setDraftProfile({ ...draftProfile, lowThresholdPct: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="prof-mid" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  MID Threshold (%)
                </label>
                <input
                  id="prof-mid"
                  type="number"
                  min={20}
                  max={85}
                  value={draftProfile.midThresholdPct}
                  onChange={(e) =>
                    setDraftProfile({ ...draftProfile, midThresholdPct: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="prof-full" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  FULL Cutoff (%)
                </label>
                <input
                  id="prof-full"
                  type="number"
                  min={50}
                  max={99}
                  value={draftProfile.fullThresholdPct}
                  onChange={(e) =>
                    setDraftProfile({ ...draftProfile, fullThresholdPct: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="prof-amp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Overcurrent Limit (A)
                </label>
                <input
                  id="prof-amp"
                  type="number"
                  step="0.1"
                  min={1}
                  max={30}
                  value={draftProfile.overcurrentLimitA}
                  onChange={(e) =>
                    setDraftProfile({ ...draftProfile, overcurrentLimitA: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draftProfile.dryRunProtection}
                    onChange={(e) =>
                      setDraftProfile({ ...draftProfile, dryRunProtection: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-sky-600"
                  />
                  <span>Dry-run current protection enabled</span>
                </label>

                <button
                  type="submit"
                  disabled={!blePairedConnected || profileBusy}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {profileBusy ? 'Writing…' : 'Write Profile (BLE)'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
