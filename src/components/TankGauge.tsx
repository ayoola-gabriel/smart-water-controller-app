import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface TankGaugeProps {
  levelValid: boolean;
  levelPercent: number | null;
  low: boolean;
  mid: boolean;
  full: boolean;
  pumpRunning: boolean;
  capacityLiters: number;
}

export function TankGauge({
  levelValid,
  levelPercent,
  low,
  mid,
  full,
  pumpRunning,
  capacityLiters,
}: TankGaugeProps) {
  const safePercent = levelValid && levelPercent !== null ? Math.max(0, Math.min(100, levelPercent)) : 0;
  const estimatedLiters =
    levelValid && levelPercent !== null ? Math.round((safePercent / 100) * capacityLiters) : null;

  const waterFillColor = !levelValid
    ? 'text-slate-400'
    : low
    ? 'from-rose-600 to-rose-500'
    : full
    ? 'from-emerald-600 to-teal-500'
    : 'from-sky-600 to-cyan-500';

  const floatSwitches = [
    { label: 'FULL', active: full, desc: 'Overflow cutoff switch', tone: 'emerald' },
    { label: 'MID', active: mid, desc: 'Nominal reserve switch', tone: 'sky' },
    { label: 'LOW', active: low, desc: 'Refill trigger switch', tone: 'rose' },
  ] as const;

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-6">
      {/* Cutaway Precision Tank Vessel */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-full max-w-[280px] h-[356px] rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 overflow-hidden flex flex-col justify-end">
          {/* Calibration ticks */}
          <div className="absolute inset-y-3 left-2.5 z-20 flex flex-col justify-between pointer-events-none select-none">
            {['100%', '75%', '50%', '25%', '0%'].map((tick) => (
              <div key={tick} className="flex items-center gap-1.5">
                <span className="w-2.5 h-px bg-slate-400/70 dark:bg-slate-500/70" />
                <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">
                  {tick}
                </span>
              </div>
            ))}
          </div>

          {/* Water column */}
          {levelValid ? (
            <div
              className={`relative w-full bg-gradient-to-t ${waterFillColor} transition-all duration-500 ease-out`}
              style={{ height: `${safePercent}%` }}
            >
              {/* Surface meniscus / wave */}
              <div className="absolute -top-2 left-0 w-[200%] h-4 opacity-50 overflow-hidden pointer-events-none">
                <svg
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  className="w-full h-full animate-water-wave fill-white/40"
                >
                  <path d="M0 6 Q 25 0 50 6 T 100 6 T 150 6 T 200 6 L 200 12 L 0 12 Z" />
                </svg>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-100/90 dark:bg-slate-900/90">
              <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Level Sensor Invalid
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ultrasonic / probe reading unavailable
              </p>
            </div>
          )}

          {/* Centered Digital Readout Overlay */}
          {levelValid && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
              <div className="px-4 py-2.5 rounded-lg bg-white/90 dark:bg-slate-950/85 border border-slate-200/80 dark:border-slate-700/80 text-center shadow-sm">
                <div className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {safePercent.toFixed(0)}
                  <span className="text-lg font-medium text-slate-500 dark:text-slate-400 ml-0.5">%</span>
                </div>
                {estimatedLiters !== null && (
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {estimatedLiters.toLocaleString()} / {capacityLiters.toLocaleString()} L
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Float Switch States (LOW / MID / FULL) */}
      <div className="sm:w-52 flex flex-col justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Hardware Float States
          </h3>
          <div className="space-y-2.5">
            {floatSwitches.map((sw) => {
              const activeStyles =
                sw.tone === 'emerald'
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                  : sw.tone === 'rose'
                  ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
                  : 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200';

              return (
                <div
                  key={sw.label}
                  className={`p-3 rounded-lg border transition-colors ${
                    sw.active
                      ? activeStyles
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{sw.label}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                      {sw.active && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      <span>{sw.active ? 'ACTIVE' : 'OPEN'}</span>
                    </span>
                  </div>
                  <p className="text-xs opacity-80 mt-0.5">{sw.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Intake Flow</span>
          <span className={`font-mono font-semibold ${pumpRunning ? 'text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {pumpRunning ? 'FILLING' : 'STATIC'}
          </span>
        </div>
      </div>
    </div>
  );
}
