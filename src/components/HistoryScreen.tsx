import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, CloudUpload, RefreshCw, ShieldAlert } from 'lucide-react';
import { analyzeHistoryGaps, formatDurationMs } from '../lib/telemetry';
import type { TelemetrySample } from '../types/controller';

interface HistoryScreenProps {
  samples: TelemetrySample[];
  onRefresh: () => void;
  refreshing: boolean;
}

type HistoryFilter = 'all' | 'queued' | 'faults' | 'pump_on';

export function HistoryScreen({ samples, onRefresh, refreshing }: HistoryScreenProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const analysis = useMemo(() => analyzeHistoryGaps(samples, 60_000), [samples]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return analysis.entries;
    return analysis.entries.filter((entry) => {
      if (entry.kind === 'gap') return true;
      const s = entry.sample!;
      if (filter === 'queued') return Boolean(s.queued);
      if (filter === 'faults') return Boolean(s.fault);
      if (filter === 'pump_on') return s.pump;
      return true;
    });
  }, [analysis.entries, filter]);

  // Chronological samples (oldest -> newest) for SVG sparkline
  const chartPoints = useMemo(() => {
    const valid = [...samples]
      .filter((s) => s.levelValid && s.levelPercent !== null)
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .slice(-24);

    if (valid.length < 2) return null;
    const minT = valid[0].timestampMs;
    const maxT = valid[valid.length - 1].timestampMs || minT + 1;
    const spanT = Math.max(1, maxT - minT);

    const coords = valid.map((s) => {
      const x = 44 + ((s.timestampMs - minT) / spanT) * 900;
      const y = 114 - ((s.levelPercent ?? 0) / 100) * 100;
      return { x, y, sample: s };
    });

    // Split segments when a gap > 150s exists so gaps are visually clear
    const segments: string[] = [];
    let currentPath = '';
    for (let i = 0; i < coords.length; i += 1) {
      const pt = coords[i];
      if (i === 0 || pt.sample.timestampMs - coords[i - 1].sample.timestampMs > 150_000) {
        if (currentPath) segments.push(currentPath);
        currentPath = `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      } else {
        currentPath += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
    }
    if (currentPath) segments.push(currentPath);

    return { segments, coords };
  }, [samples]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Telemetry History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Recorded <span className="font-mono">telemetry_history</span> samples with offline periods and queued buffer status.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Samples Loaded</div>
          <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {samples.length}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Offline Gaps Detected</div>
          <div className={`font-mono text-2xl font-bold mt-1 ${analysis.gapCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {analysis.gapCount}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Queued / Buffered Samples</div>
          <div className={`font-mono text-2xl font-bold mt-1 ${analysis.queuedCount > 0 ? 'text-sky-700 dark:text-sky-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {analysis.queuedCount}
          </div>
        </div>
      </div>

      {/* Level Trend Chart (Breaks line cleanly across offline gaps) */}
      {chartPoints && (
        <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Water Level Trend (%)
            </h2>
            <span className="text-slate-500 dark:text-slate-400">
              Disconnected line segments indicate offline telemetry gaps
            </span>
          </div>
          <div className="w-full h-36">
            <svg viewBox="0 0 960 130" className="w-full h-full overflow-visible" role="img" aria-label="Tank water level history chart">
              {[
                { label: '100%', y: 14 },
                { label: '50%', y: 64 },
                { label: '0%', y: 114 },
              ].map((tick) => (
                <g key={tick.label}>
                  <text
                    x={34}
                    y={tick.y + 4}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
                  >
                    {tick.label}
                  </text>
                  <line
                    x1={44}
                    y1={tick.y}
                    x2={944}
                    y2={tick.y}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeDasharray="4 4"
                  />
                </g>
              ))}
              {chartPoints.segments.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  className="stroke-sky-600 dark:stroke-sky-400"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {chartPoints.coords.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={pt.sample.fault ? 4 : pt.sample.queued ? 3.5 : 2.5}
                  className={
                    pt.sample.fault
                      ? 'fill-rose-600'
                      : pt.sample.queued
                      ? 'fill-amber-500'
                      : 'fill-sky-600 dark:fill-sky-400'
                  }
                />
              ))}
            </svg>
          </div>
        </section>
      )}

      {/* Filter Segmented Bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 w-fit">
        {(
          [
            { id: 'all', label: 'All Samples' },
            { id: 'queued', label: 'Queued Only' },
            { id: 'pump_on', label: 'Pump Running' },
            { id: 'faults', label: 'Faults' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === tab.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* History Table with Explicit Offline Gap Markers */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No matching telemetry samples found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-medium">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Water Level</th>
                  <th className="py-3 px-4">Pump / Mode</th>
                  <th className="py-3 px-4">Temp</th>
                  <th className="py-3 px-4">Current</th>
                  <th className="py-3 px-4">Fault</th>
                  <th className="py-3 px-4">Sync State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.map((entry) => {
                  if (entry.kind === 'gap') {
                    return (
                      <tr
                        key={entry.id}
                        className="bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                      >
                        <td colSpan={7} className="py-2.5 px-4">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>
                              Offline period gap: {formatDurationMs(entry.gapDurationMs ?? 0)} without telemetry
                            </span>
                            <span className="font-mono text-[11px] opacity-80">
                              ({new Date(entry.timestampMs).toLocaleTimeString()} –{' '}
                              {new Date(entry.gapEndMs ?? entry.timestampMs).toLocaleTimeString()})
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const s = entry.sample!;
                  const levelFlag = s.full ? 'FULL' : s.low ? 'LOW' : s.mid ? 'MID' : 'OK';

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                    >
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {new Date(s.timestampMs).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {s.levelValid && s.levelPercent !== null
                          ? `${s.levelPercent.toFixed(0)}% · ${levelFlag}`
                          : 'Invalid'}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <span className={s.pump ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''}>
                          {s.pump ? 'ON' : 'OFF'}
                        </span>
                        <span className="text-slate-400"> · {s.mode}</span>
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {s.temperatureValid && s.temperatureC !== null
                          ? `${s.temperatureC.toFixed(1)} °C`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {s.currentA !== null ? `${s.currentA.toFixed(2)} A` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {s.fault ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{s.fault}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.queued ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-400">
                            <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Queued</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Synced</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
