import { Bluetooth, Cloud, RefreshCw, Plus, ChevronRight, Wifi, WifiOff, Shield } from 'lucide-react';
import { computeDataAge } from '../lib/telemetry';
import type { AppUser, DeviceSummary } from '../types/controller';

interface DeviceListScreenProps {
  devices: DeviceSummary[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  onOpenPairing: () => void;
  onReconnectBle: (deviceId: string) => void;
  onRefreshRemote: () => void;
  refreshing: boolean;
  user: AppUser | null;
  nowMs: number;
}

export function DeviceListScreen({
  devices,
  selectedDeviceId,
  onSelectDevice,
  onOpenPairing,
  onReconnectBle,
  onRefreshRemote,
  refreshing,
  user,
  nowMs,
}: DeviceListScreenProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Controllers
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {user
              ? `Authorized remote & local BLE controllers for ${user.email}`
              : 'Local BLE discovery & saved controllers (offline mode)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <button
              type="button"
              onClick={onRefreshRemote}
              disabled={refreshing}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh Cloud</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenPairing}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Pair via BLE</span>
          </button>
        </div>
      </div>

      {/* Device Cards */}
      {devices.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4">
          <Bluetooth className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
          <div className="max-w-md mx-auto space-y-1">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              No controllers paired or assigned
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Connect to a nearby controller over Bluetooth, or sign in to see controllers assigned to your account.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPairing}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Bluetooth className="w-4 h-4" aria-hidden="true" />
            <span>Pair Controller over BLE</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices.map((device) => {
            const isSelected = device.device_id === selectedDeviceId;
            const age = computeDataAge(
              device.lastTelemetryAtMs,
              nowMs,
              device.bleConnected ? 'ble' : 'remote'
            );

            return (
              <div
                key={device.device_id}
                className={`p-5 rounded-xl border transition-colors bg-white dark:bg-slate-900 flex flex-col justify-between gap-5 ${
                  isSelected
                    ? 'border-sky-500 dark:border-sky-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-medium">{device.device_id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 capitalize">
                        <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{device.role}</span>
                      </span>
                    </div>
                    <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                      {device.name}
                    </h2>
                  </div>

                  {device.latestTelemetry?.levelValid && device.latestTelemetry.levelPercent !== null && (
                    <div className="text-right">
                      <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {device.latestTelemetry.levelPercent.toFixed(0)}%
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {device.latestTelemetry.mode} · {device.latestTelemetry.pump ? 'PUMP ON' : 'PUMP OFF'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Connectivity & Age Row */}
                <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">BLE Link</div>
                    <div className={`font-medium inline-flex items-center gap-1.5 ${
                      device.bleConnected
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : device.bleBonded
                        ? 'text-sky-700 dark:text-sky-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      <Bluetooth className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{device.bleConnected ? 'Connected' : device.bleBonded ? 'Bonded' : 'Unpaired'}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Wi-Fi / Cloud</div>
                    <div className={`font-medium inline-flex items-center gap-1.5 ${
                      device.wifiOnline && device.cloudOnline
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}>
                      {device.wifiOnline ? (
                        <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>{device.wifiOnline && device.cloudOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Last Update</div>
                    <div className={`font-mono font-medium ${
                      age.isStale
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {age.label}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {!device.bleConnected && device.bleBonded ? (
                    <button
                      type="button"
                      onClick={() => onReconnectBle(device.device_id)}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
                    >
                      <Bluetooth className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      <span>Reconnect BLE</span>
                    </button>
                  ) : !device.bleConnected ? (
                    <button
                      type="button"
                      onClick={onOpenPairing}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
                    >
                      <Bluetooth className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      <span>Pair BLE</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Cloud className="w-4 h-4" aria-hidden="true" />
                      <span>Connected nearby</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectDevice(device.device_id)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Open Dashboard</span>
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
