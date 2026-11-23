import { Bluetooth, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { BLE_DEVICE_NAME } from '../lib/protocol';
import { isWebBluetoothSupported } from '../lib/bleService';

interface PasskeyPairingModalProps {
  open: boolean;
  onClose: () => void;
  onPairRealBle: () => Promise<void>;
  bleBusy: boolean;
  bleError: string | null;
}

export function PasskeyPairingModal({
  open,
  onClose,
  onPairRealBle,
  bleBusy,
  bleError,
}: PasskeyPairingModalProps) {
  if (!open) return null;

  const webBtSupported = isWebBluetoothSupported();

  const handlePair = async () => {
    try {
      await onPairRealBle();
      onClose();
    } catch {
      // The parent provides a user-safe error message.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ble-pairing-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Bluetooth className="w-5 h-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <h2 id="ble-pairing-title" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Connect to Controller
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Bluetooth dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Secure Bluetooth connection</span>
            </div>
            <p>
              Select <strong>{BLE_DEVICE_NAME}</strong> when prompted. If your phone asks for a passkey, enter the code shown on the controller display. The code is not shown in this app.
            </p>
          </div>

          {bleError && (
            <div role="alert" className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{bleError}</span>
            </div>
          )}

          {!webBtSupported && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
              Bluetooth is unavailable in this browser. Use a supported Chromium browser over HTTPS or localhost.
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!webBtSupported || bleBusy}
              onClick={() => void handlePair()}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {bleBusy ? 'Connecting…' : 'Find Controller'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
