import type {
  DataAgeInfo,
  HistoryTimelineEntry,
  PumpMode,
  TelemetrySample,
  TransportChannel,
} from '../types/controller';

export function computeDataAge(
  lastUpdatedMs: number | null,
  nowMs: number,
  transport: TransportChannel | 'none' = 'remote'
): DataAgeInfo {
  if (lastUpdatedMs === null || !Number.isFinite(lastUpdatedMs)) {
    return {
      ageSeconds: null,
      label: 'No telemetry received',
      severity: 'unknown',
      isStale: true,
    };
  }

  const ageSeconds = Math.max(0, Math.floor((nowMs - lastUpdatedMs) / 1000));
  const agingThreshold = transport === 'ble' ? 15 : 35;
  const staleThreshold = transport === 'ble' ? 30 : 60;

  let label: string;
  if (ageSeconds < 5) {
    label = 'Just now';
  } else if (ageSeconds < 60) {
    label = `${ageSeconds}s ago`;
  } else if (ageSeconds < 3600) {
    const mins = Math.floor(ageSeconds / 60);
    const secs = ageSeconds % 60;
    label = secs > 0 ? `${mins}m ${secs}s ago` : `${mins}m ago`;
  } else {
    const hrs = Math.floor(ageSeconds / 3600);
    const mins = Math.floor((ageSeconds % 3600) / 60);
    label = mins > 0 ? `${hrs}h ${mins}m ago` : `${hrs}h ago`;
  }

  if (ageSeconds >= staleThreshold) {
    return { ageSeconds, label, severity: 'stale', isStale: true };
  }
  if (ageSeconds >= agingThreshold) {
    return { ageSeconds, label, severity: 'aging', isStale: false };
  }
  return { ageSeconds, label, severity: 'live', isStale: false };
}

export function evaluateInterlocks(
  telemetry: TelemetrySample | null,
  targetMode: PumpMode,
  targetPump?: boolean
): { blocked: boolean; warning: string | null } {
  if (!telemetry) {
    return {
      blocked: false,
      warning: 'No live telemetry available. Firmware will enforce hardware interlocks upon receipt.',
    };
  }

  if (telemetry.fault && (targetMode === 'MANUAL' && targetPump)) {
    return {
      blocked: true,
      warning: `Active controller fault (${telemetry.fault}) blocks MANUAL pump ON. Clear fault or inspect hardware first.`,
    };
  }

  if (targetMode === 'MANUAL' && targetPump && telemetry.full) {
    return {
      blocked: false,
      warning: 'Tank FULL float switch is active. Firmware overflow interlock may immediately reject or stop the pump.',
    };
  }

  if (targetMode === 'MANUAL' && targetPump && !telemetry.levelValid) {
    return {
      blocked: false,
      warning: 'Level sensor reading is currently invalid. Firmware safety interlock may prevent operation.',
    };
  }

  return { blocked: false, warning: null };
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export function analyzeHistoryGaps(
  samples: TelemetrySample[],
  expectedIntervalMs = 60_000
): { entries: HistoryTimelineEntry[]; gapCount: number; queuedCount: number } {
  if (samples.length === 0) {
    return { entries: [], gapCount: 0, queuedCount: 0 };
  }

  // Sort newest-first for timeline display
  const sorted = [...samples].sort((a, b) => b.timestampMs - a.timestampMs);
  const entries: HistoryTimelineEntry[] = [];
  const gapThresholdMs = expectedIntervalMs * 2.5;
  let gapCount = 0;
  let queuedCount = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current.queued) {
      queuedCount += 1;
    }

    entries.push({
      kind: 'sample',
      id: `sample-${current.timestampMs}-${i}`,
      timestampMs: current.timestampMs,
      sample: current,
    });

    if (i < sorted.length - 1) {
      const older = sorted[i + 1];
      const deltaMs = current.timestampMs - older.timestampMs;
      if (deltaMs > gapThresholdMs) {
        gapCount += 1;
        entries.push({
          kind: 'gap',
          id: `gap-${older.timestampMs}-${current.timestampMs}`,
          timestampMs: older.timestampMs,
          gapEndMs: current.timestampMs,
          gapDurationMs: deltaMs,
        });
      }
    }
  }

  return { entries, gapCount, queuedCount };
}
