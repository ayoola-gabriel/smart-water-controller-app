import { AlertTriangle, Power, X } from 'lucide-react';
import type { TelemetrySample, TransportChannel } from '../types/controller';

interface ConfirmManualModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  telemetry: TelemetrySample | null;
  transport: TransportChannel;
  interlockWarning: string | null;
}

export function ConfirmManualModal({
  open,
  onCancel,
  onConfirm,
  telemetry,
  transport,
  interlockWarning,
}: ConfirmManualModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-manual-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 id="confirm-manual-title" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Confirm Manual Pump ON
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            You are about to energize the water pump in <span className="font-semibold">MANUAL</span> mode via{' '}
            <span className="font-mono font-medium">{transport === 'ble' ? 'Local BLE' : 'Remote Cloud'}</span>.
          </p>

          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Reported Water Level</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {telemetry?.levelValid && telemetry.levelPercent !== null
                  ? `${telemetry.levelPercent.toFixed(0)}%`
                  : 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Payload</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {`{"mode":"MANUAL","pump":true}`}
              </span>
            </div>
          </div>

          {interlockWarning && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs text-amber-900 dark:text-amber-200">
              {interlockWarning}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Controller hardware protections (overflow float, dry-run, overcurrent, and max-runtime interlocks) remain active and cannot be bypassed.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Power className="w-4 h-4" aria-hidden="true" />
              <span>Confirm Pump ON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
