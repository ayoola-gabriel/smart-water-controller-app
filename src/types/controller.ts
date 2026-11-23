export type PumpMode = 'AUTO' | 'OFF' | 'MANUAL';

export type TransportChannel = 'ble' | 'remote';

export type DeviceRole = 'owner' | 'operator' | 'viewer';

export type FaultCode =
  | 'NONE'
  | 'DRY_RUN_LOCKOUT'
  | 'OVERCURRENT_TRIP'
  | 'SENSOR_TIMEOUT'
  | 'FLOAT_MISMATCH'
  | 'THERMAL_CUTOUT'
  | 'MAX_RUNTIME_EXCEEDED';

export interface TelemetrySample {
  levelValid: boolean;
  levelPercent: number | null;
  low: boolean;
  mid: boolean;
  full: boolean;
  pump: boolean;
  mode: PumpMode;
  temperatureValid: boolean;
  temperatureC: number | null;
  currentA: number | null;
  fault: FaultCode | string | null;
  wifi: boolean;
  gpsValid?: boolean;
  gpsStatus?: 'LOCKED' | 'SEARCHING' | 'UNAVAILABLE';
  gpsLat?: number | null;
  gpsLon?: number | null;
  gpsZoneLabel?: string;
  timestampMs: number;
  queued?: boolean;
  source?: 'ble' | 'cloud';
}

export interface ControllerProfile {
  tankName: string;
  tankCapacityLiters: number;
  lowThresholdPct: number;
  midThresholdPct: number;
  fullThresholdPct: number;
  maxPumpRunSec: number;
  overcurrentLimitA: number;
  dryRunProtection: boolean;
}

export interface DeviceSummary {
  device_id: string;
  name: string;
  role: DeviceRole | 'local';
  bleBonded: boolean;
  bleConnected: boolean;
  wifiOnline: boolean;
  cloudOnline: boolean;
  lastTelemetryAtMs: number | null;
  latestTelemetry: TelemetrySample | null;
}

export interface HistoryTimelineEntry {
  kind: 'sample' | 'gap';
  id: string;
  timestampMs: number;
  sample?: TelemetrySample;
  gapEndMs?: number;
  gapDurationMs?: number;
}

export interface AppUser {
  id: string;
  email: string;
}

export interface DataAgeInfo {
  ageSeconds: number | null;
  label: string;
  severity: 'live' | 'aging' | 'stale' | 'unknown';
  isStale: boolean;
}
