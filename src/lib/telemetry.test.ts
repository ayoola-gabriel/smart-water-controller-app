import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHistoryGaps,
  computeDataAge,
  evaluateInterlocks,
} from './telemetry';
import type { TelemetrySample } from '../types/controller';

const baseSample: TelemetrySample = {
  levelValid: true,
  levelPercent: 62,
  low: false,
  mid: true,
  full: false,
  pump: false,
  mode: 'AUTO',
  temperatureValid: true,
  temperatureC: 24.5,
  currentA: 0.0,
  fault: null,
  wifi: true,
  timestampMs: 1_760_000_000_000,
};

test('computeDataAge flags stale BLE and remote telemetry accurately', () => {
  const now = 1_760_000_100_000;
  const freshBle = computeDataAge(now - 4_000, now, 'ble');
  assert.equal(freshBle.isStale, false);
  assert.equal(freshBle.severity, 'live');

  const staleBle = computeDataAge(now - 35_000, now, 'ble');
  assert.equal(staleBle.isStale, true);
  assert.equal(staleBle.severity, 'stale');

  const liveRemote = computeDataAge(now - 20_000, now, 'remote');
  assert.equal(liveRemote.isStale, false);

  const staleRemote = computeDataAge(now - 75_000, now, 'remote');
  assert.equal(staleRemote.isStale, true);
});

test('evaluateInterlocks blocks MANUAL ON when fault is active', () => {
  const faulted = evaluateInterlocks(
    { ...baseSample, fault: 'DRY_RUN_LOCKOUT' },
    'MANUAL',
    true
  );
  assert.equal(faulted.blocked, true);

  const fullWarning = evaluateInterlocks(
    { ...baseSample, full: true, levelPercent: 98 },
    'MANUAL',
    true
  );
  assert.equal(fullWarning.blocked, false);
  assert.ok(fullWarning.warning?.includes('FULL'));
});

test('analyzeHistoryGaps detects offline gaps and counts queued samples', () => {
  const t0 = 1_760_000_000_000;
  const samples: TelemetrySample[] = [
    { ...baseSample, timestampMs: t0 },
    { ...baseSample, timestampMs: t0 + 60_000, queued: true },
    // 15 minute offline gap
    { ...baseSample, timestampMs: t0 + 960_000 },
  ];

  const analysis = analyzeHistoryGaps(samples, 60_000);
  assert.equal(analysis.gapCount, 1);
  assert.equal(analysis.queuedCount, 1);
  assert.equal(analysis.entries.length, 4);
  assert.equal(analysis.entries[1].kind, 'gap');
});
