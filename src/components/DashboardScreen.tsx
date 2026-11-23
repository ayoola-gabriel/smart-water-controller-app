import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Clock,
  Cloud,
  Gauge,
  MapPin,
  Power,
  ShieldAlert,
  Sliders,
  Thermometer,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { TankGauge } from './TankGauge';
import { computeDataAge } from '../lib/telemetry';
import type { ControllerProfile, DeviceSummary, TelemetrySample } from '../types/controller';

interface DashboardScreenProps {
  device: DeviceSummary | null;
  telemetry: TelemetrySample | null;
  profile: ControllerProfile;
  nowMs: number;
  onNavigateControls: () => void;
  onNavigateHistory: () => void;
  onOpenPairing: () => void;
  onClearFault: () => void;
  clearingFault: boolean;
}

export function DashboardScreen({
  device,
  telemetry,
  profile,
  nowMs,
  onNavigateControls,
  onNavigateHistory,
  onOpenPairing,
  onClearFault,
  clearingFault,
}: DashboardScreenProps) {
  if (!device) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            No Controller Selected
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pair a controller over BLE or select an authorized device to view live tank telemetry.
          </p>
          <button
            type="button"
            onClick={onOpenPairing}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
          >
            Pair Controller via BLE
          </button>
        </div>
      </div>
    );
  }

  const activeTransport = device.bleConnected ? 'ble' : 'remote';
  const lastUpdatedMs = telemetry?.timestampMs ?? device.lastTelemetryAtMs;
  const age = computeDataAge(lastUpdatedMs, nowMs, activeTransport);
  const formattedLastTime = lastUpdatedMs
    ? new Date(lastUpdatedMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  const faultLabel = telemetry?.fault && telemetry.fault !== 'NONE'
    ? String(telemetry.fault)
    : null;
  const [visibleFault, setVisibleFault] = useState<string | null>(faultLabel);

  useEffect(() => {
    if (faultLabel) {
      setVisibleFault(faultLabel);
      return;
    }
    if (!visibleFault) return;

    const clearedFault = visibleFault;
    const timeout = window.setTimeout(() => {
      setVisibleFault((current) => current === clearedFault ? null : current);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [faultLabel, visibleFault]);

  const hasFault = Boolean(faultLabel);
  const waitingForBleTelemetry = device.bleConnected && !telemetry;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Context Header & Connection Badges */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono font-medium">{device.device_id}</span>
            <span aria-hidden="true">·</span>
            <span>{profile.tankName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Updated {formattedLastTime} ({age.label})</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {device.name}
          </h1>
        </div>

        {/* Explicit Text+Icon Connection Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 ${
              device.bleConnected
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{device.bleConnected ? 'BLE Connected' : device.bleBonded ? 'BLE Bonded (Idle)' : 'BLE Unpaired'}</span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 ${
              device.wifiOnline && device.cloudOnline
                ? 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200'
                : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200'
            }`}
          >
            {device.wifiOnline ? (
              <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{device.wifiOnline && device.cloudOnline ? 'Wi-Fi · Cloud Online' : 'Wi-Fi / Cloud Offline'}</span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium inline-flex items-center gap-1.5 ${
              age.severity === 'live'
                ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Age: {age.label}</span>
          </div>
        </div>
      </div>

      {/* Stale Data Warning Banner */}
      {age.isStale && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {waitingForBleTelemetry ? 'Waiting for controller data' : `Telemetry data is stale (${age.label})`}
              </h2>
              <p className="text-xs text-amber-900 dark:text-amber-200 mt-0.5">
                {waitingForBleTelemetry
                  ? 'Bluetooth is connected, but no status data has arrived yet. Check the controller’s BLE status notifications or disconnect and reconnect.'
                  : 'Values shown are cached from the last received packet and may not reflect current tank level or pump state. Reconnect Bluetooth or restore controller Wi-Fi.'}
              </p>
            </div>
          </div>
          {!device.bleConnected && (
            <button
              type="button"
              onClick={onOpenPairing}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Connect Bluetooth
            </button>
          )}
        </div>
      )}

      {/* Controller Fault Banner */}
      {visibleFault && telemetry && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-rose-950 dark:text-rose-100">
                {hasFault ? 'Controller Fault Active:' : 'Controller Fault Cleared:'}{' '}
                <span className="font-mono">{visibleFault}</span>
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 mt-0.5">
                {hasFault
                  ? 'Hardware safety interlock has stopped the pump. Inspect the system before clearing the fault.'
                  : 'The controller reports that this fault has cleared.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!hasFault || !device.bleConnected || clearingFault}
            onClick={onClearFault}
            title={!device.bleConnected ? 'Connect over paired BLE to clear hardware fault' : 'Send clearFault over BLE'}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {hasFault
              ? clearingFault ? 'Clearing…' : device.bleConnected ? 'Clear Fault (BLE)' : 'Pair BLE to Clear'
              : 'Cleared'}
          </button>
        </div>
      )}

      {/* Primary 2-Column Telemetry Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Water Level Vessel */}
        <section className="lg:col-span-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-start gap-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Tank Water Level
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              Source: {telemetry?.source === 'ble' ? 'Bluetooth' : telemetry ? 'Internet' : 'Waiting'}
            </span>
          </div>

          <TankGauge
            levelValid={Boolean(telemetry?.levelValid)}
            levelPercent={telemetry?.levelPercent ?? null}
            low={Boolean(telemetry?.low)}
            mid={Boolean(telemetry?.mid)}
            full={Boolean(telemetry?.full)}
            pumpRunning={Boolean(telemetry?.pump)}
            capacityLiters={profile.tankCapacityLiters}
          />
        </section>

        {/* Right: Pump State & Sensor Telemetry */}
        <section className="lg:col-span-6 flex flex-col justify-between gap-4">
          {/* Pump Mode & Reported State Hero Card */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Pump & Contactor Status
              </h2>
              <button
                type="button"
                onClick={onNavigateControls}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Controls</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Controller Mode</div>
                <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>{telemetry?.mode ?? '—'}</span>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Reported Pump State</div>
                <div className={`font-mono text-2xl font-bold flex items-center gap-2 ${
                  telemetry?.pump
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  <Power className="w-5 h-5" aria-hidden="true" />
                  <span>{telemetry ? (telemetry.pump ? 'RUNNING' : 'IDLE') : '—'}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pump status is reported by the controller and may take a moment to update after a request.
            </p>
          </div>

          {/* Electrical, Thermal, Fault & GPS Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>Motor Current</span>
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {telemetry?.currentA !== null && telemetry?.currentA !== undefined
                  ? telemetry.currentA.toFixed(2)
                  : '—'}
                <span className="text-xs font-medium text-slate-400 ml-1">A</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Trip limit: {profile.overcurrentLimitA.toFixed(1)} A
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>Temperature</span>
                <Thermometer className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              </div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {telemetry?.temperatureValid && telemetry.temperatureC !== null
                  ? telemetry.temperatureC.toFixed(1)
                  : '—'}
                <span className="text-xs font-medium text-slate-400 ml-1">°C</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {telemetry?.temperatureValid ? 'Probe nominal' : 'Sensor unavailable'}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>Fault State</span>
                <ShieldAlert className={`w-4 h-4 ${hasFault ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} aria-hidden="true" />
              </div>
              <div className={`font-mono text-sm font-bold truncate ${hasFault ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {hasFault ? telemetry?.fault : 'NONE'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {hasFault ? 'Interlock active' : 'All interlocks clear'}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>GPS Status</span>
                <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              </div>
              <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {telemetry?.gpsStatus ?? (telemetry?.gpsValid ? 'LOCKED' : 'UNAVAILABLE')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {telemetry?.gpsZoneLabel || 'Coordinates masked in logs'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
            <span className="text-slate-600 dark:text-slate-400 inline-flex items-center gap-2">
              <Cloud className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span>Remote telemetry refreshes automatically every 12s</span>
            </span>
            <button
              type="button"
              onClick={onNavigateHistory}
              className="font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
            >
              View History
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
