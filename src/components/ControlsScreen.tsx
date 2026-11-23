import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Cloud,
  Power,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { ConfirmManualModal } from './ConfirmManualModal';
import { evaluateInterlocks } from '../lib/telemetry';
import type {
  AppUser,
  DeviceSummary,
  PumpMode,
  TelemetrySample,
  TransportChannel,
} from '../types/controller';

interface ControlsScreenProps {
  device: DeviceSummary | null;
  telemetry: TelemetrySample | null;
  user: AppUser | null;
  onSendBleCommand: (action: { type: 'MODE'; mode: 'AUTO' | 'OFF' } | { type: 'MANUAL'; pump: boolean } | { type: 'CLEAR_FAULT' }) => Promise<void>;
  onSendRemoteCommand: (params: { mode?: PumpMode; pump?: boolean; clearFault?: boolean }) => Promise<void>;
  onOpenPairing: () => void;
}

export function ControlsScreen({
  device,
  telemetry,
  user,
  onSendBleCommand,
  onSendRemoteCommand,
  onOpenPairing,
}: ControlsScreenProps) {
  const [preferredTransport, setPreferredTransport] = useState<TransportChannel>('ble');
  const [confirmManualOpen, setConfirmManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!device) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Select a Controller
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pair a controller over BLE or select an authorized device from the Devices screen.
          </p>
        </div>
      </div>
    );
  }

  const canUseBle = device.bleConnected && device.bleBonded;
  const canUseRemote = Boolean(user) && device.role !== 'viewer';
  const activeTransport: TransportChannel =
    preferredTransport === 'ble'
      ? canUseBle
        ? 'ble'
        : canUseRemote
        ? 'remote'
        : 'ble'
      : canUseRemote
      ? 'remote'
      : canUseBle
      ? 'ble'
      : 'remote';

  const manualOnInterlock = evaluateInterlocks(telemetry, 'MANUAL', true);
  const hasFault = Boolean(telemetry?.fault);

  const executeCommand = async (mode: PumpMode, pump?: boolean) => {
    setFeedback(null);
    if (activeTransport === 'ble' && !canUseBle) {
      setFeedback({
        tone: 'error',
        text: 'Bluetooth is not connected. Connect nearby or choose Remote Cloud.',
      });
      return;
    }
    if (activeTransport === 'remote' && !user) {
      setFeedback({
        tone: 'error',
        text: 'Sign in with a Supabase app account to issue remote cloud commands.',
      });
      return;
    }
    if (activeTransport === 'remote' && device.role === 'viewer') {
      setFeedback({
        tone: 'error',
        text: 'Your device role is viewer. Only owners and operators may send remote commands.',
      });
      return;
    }

    setBusy(true);
    try {
      if (activeTransport === 'ble') {
        if (mode === 'MANUAL') {
          await onSendBleCommand({ type: 'MANUAL', pump: Boolean(pump) });
        } else {
          await onSendBleCommand({ type: 'MODE', mode });
        }
        setFeedback({
          tone: 'ok',
          text: 'Request sent. Check the Dashboard for the controller’s reported pump state.',
        });
      } else {
        await onSendRemoteCommand({ mode, pump });
        setFeedback({
          tone: 'ok',
          text: 'Request sent. The pump status will update when the controller reports back.',
        });
      }
    } catch (err) {
      setFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Command failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearFault = async () => {
    setFeedback(null);
    if (activeTransport === 'ble' && !canUseBle) {
      setFeedback({
        tone: 'error',
        text: 'Connect to this controller over Bluetooth first.',
      });
      return;
    }
    if (activeTransport === 'remote' && !canUseRemote) {
      setFeedback({
        tone: 'error',
        text: 'Sign in as a controller owner or operator to clear faults remotely.',
      });
      return;
    }
    setBusy(true);
    try {
      if (activeTransport === 'ble') {
        await onSendBleCommand({ type: 'CLEAR_FAULT' });
        setFeedback({ tone: 'ok', text: 'Fault clear request sent over Bluetooth. Check the Dashboard for the updated status.' });
      } else {
        await onSendRemoteCommand({ clearFault: true });
        setFeedback({ tone: 'ok', text: 'Remote fault clear request queued. The controller will clear it only if its local safety checks pass.' });
      }
    } catch (err) {
      setFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to clear fault.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header & Transport Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Pump Controls
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Choose a pump mode. The controller continues enforcing its built-in safety protections.
          </p>
        </div>

        {/* Transport Selector */}
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 self-start">
          <button
            type="button"
            onClick={() => setPreferredTransport('ble')}
            className={`min-h-[40px] px-4 py-2 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
              activeTransport === 'ble'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Bluetooth className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>Nearby Bluetooth {canUseBle ? '(Connected)' : '(Not connected)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setPreferredTransport('remote')}
            className={`min-h-[40px] px-4 py-2 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
              activeTransport === 'remote'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>Remote Internet {user ? '' : '(Sign in)'}</span>
          </button>
        </div>
      </div>

      {/* Transport readiness & feedback notices */}
      {activeTransport === 'ble' && !canUseBle && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <Bluetooth className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                BLE pairing required for local control
              </p>
              <p className="mt-0.5">
                Connect to the controller nearby over Bluetooth. It works without internet.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPairing}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Pair via BLE
          </button>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            feedback.tone === 'ok'
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
              : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
          }`}
        >
          {feedback.tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Primary Control Pad */}
        <section className="lg:col-span-12 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Operating Mode
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Current mode: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{telemetry?.mode ?? '—'}</span> · Pump: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{telemetry?.pump ? 'ON' : 'OFF'}</span>
              </p>
            </div>
          </div>

          {/* AUTO / OFF Mode Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => executeCommand('AUTO')}
              className={`min-h-[56px] p-4 rounded-xl border text-left transition-colors flex items-center justify-between ${
                telemetry?.mode === 'AUTO'
                  ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-900 dark:text-slate-100'
              }`}
            >
              <div>
                <div className="font-display text-sm font-bold">AUTO Mode</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Float-switch & level thresholds
                </div>
              </div>
              <RotateCcw className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => executeCommand('OFF')}
              className={`min-h-[56px] p-4 rounded-xl border text-left transition-colors flex items-center justify-between ${
                telemetry?.mode === 'OFF'
                  ? 'border-slate-900 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-900 dark:text-slate-100'
              }`}
            >
              <div>
                <div className="font-display text-sm font-bold">OFF Mode</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  De-energize pump contactor
                </div>
              </div>
              <Power className="w-5 h-5 text-slate-600 dark:text-slate-300 shrink-0" aria-hidden="true" />
            </button>
          </div>

          {/* MANUAL Pump Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Manual Pump Override
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Confirmation required for ON
              </span>
            </div>

            {manualOnInterlock.warning && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{manualOnInterlock.warning}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => executeCommand('MANUAL', false)}
                className="min-h-[52px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Power className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <span>MANUAL Pump OFF</span>
              </button>

              <button
                type="button"
                disabled={busy || manualOnInterlock.blocked}
                onClick={() => setConfirmManualOpen(true)}
                className="min-h-[52px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Power className="w-4 h-4" aria-hidden="true" />
                <span>MANUAL Pump ON</span>
              </button>
            </div>
          </div>

          {/* Fault Clear Section */}
          {hasFault && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Fault active: <strong className="font-mono">{telemetry?.fault}</strong></span>
              </div>
              <button
                type="button"
                disabled={busy || (activeTransport === 'ble' ? !canUseBle : !canUseRemote)}
                onClick={handleClearFault}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Clear Fault ({activeTransport === 'ble' ? 'BLE' : 'Internet'})
              </button>
            </div>
          )}
        </section>

      </div>

      <ConfirmManualModal
        open={confirmManualOpen}
        onCancel={() => setConfirmManualOpen(false)}
        onConfirm={() => {
          setConfirmManualOpen(false);
          void executeCommand('MANUAL', true);
        }}
        telemetry={telemetry}
        transport={activeTransport}
        interlockWarning={manualOnInterlock.warning}
      />
    </div>
  );
}
