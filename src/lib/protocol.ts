import type { FaultCode, PumpMode, TelemetrySample } from '../types/controller';

export const BLE_DEVICE_NAME = 'Smart Water Controller';
export const BLE_SERVICE_UUID = '7c2e0001-7d5a-4f3b-9b2a-5c2d8f001001';
export const BLE_STATUS_CHAR_UUID = '7c2e0002-7d5a-4f3b-9b2a-5c2d8f001001';
export const BLE_CONTROL_CHAR_UUID = '7c2e0003-7d5a-4f3b-9b2a-5c2d8f001001';
export const BLE_PROFILE_CHAR_UUID = '7c2e0004-7d5a-4f3b-9b2a-5c2d8f001001';
export const BLE_WIFI_CHAR_UUID = '7c2e0005-7d5a-4f3b-9b2a-5c2d8f001001';

const configuredDeviceId = (import.meta.env.VITE_DEFAULT_DEVICE_ID as string | undefined)?.trim();
export const DEFAULT_DEVICE_ID = configuredDeviceId || 'swc-device-001';
export const MAX_COMMAND_TTL_SECONDS = 300;
export const COMMAND_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
export const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;

export type BleControlAction =
  | { type: 'MODE'; mode: 'AUTO' | 'OFF' }
  | { type: 'MANUAL'; pump: boolean }
  | { type: 'CLEAR_FAULT' };

export interface RemoteCommandRequest {
  command_id: string;
  device_id: string;
  issued_at: number;
  expires_at: number;
  mode: PumpMode;
  pump?: boolean;
  clear_fault?: boolean;
}

export function validateCommandId(id: string): boolean {
  return typeof id === 'string' && COMMAND_ID_REGEX.test(id);
}

export function validateDeviceId(id: string): boolean {
  return typeof id === 'string' && DEVICE_ID_REGEX.test(id);
}

export function generateCommandId(prefix = 'cmd'): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'cmd';
  const timePart = Date.now().toString(36);
  const randBytes = new Uint8Array(6);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randBytes);
  } else {
    for (let i = 0; i < randBytes.length; i += 1) {
      randBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const randPart = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${safePrefix}_${timePart}_${randPart}`.slice(0, 64);
}

export function buildRemoteCommandPayload(params: {
  deviceId?: string;
  mode?: PumpMode;
  pump?: boolean;
  clearFault?: boolean;
  ttlSeconds?: number;
  nowUnix?: number;
  commandId?: string;
}): RemoteCommandRequest {
  const device_id = params.deviceId ?? DEFAULT_DEVICE_ID;
  if (!validateDeviceId(device_id)) {
    throw new Error('Invalid device ID format.');
  }

  const command_id = params.commandId ?? generateCommandId('swc');
  if (!validateCommandId(command_id)) {
    throw new Error('command_id must contain only letters, numbers, hyphens, or underscores (max 64 chars).');
  }

  const issued_at =
    typeof params.nowUnix === 'number' && Number.isFinite(params.nowUnix)
      ? Math.floor(params.nowUnix)
      : Math.floor(Date.now() / 1000);

  const requestedTtl = params.ttlSeconds ?? 120;
  const clampedTtl = Math.max(10, Math.min(MAX_COMMAND_TTL_SECONDS, Math.floor(requestedTtl)));
  const expires_at = issued_at + clampedTtl;

  if (params.clearFault) {
    return {
      command_id,
      device_id,
      issued_at,
      expires_at,
      mode: 'OFF',
      clear_fault: true,
    };
  }

  if (!params.mode) throw new Error('A pump mode is required for this remote command.');

  if (params.mode === 'MANUAL') {
    if (typeof params.pump !== 'boolean') {
      throw new Error('MANUAL mode requires a boolean pump value.');
    }
    return {
      command_id,
      device_id,
      issued_at,
      expires_at,
      mode: 'MANUAL',
      pump: params.pump,
    };
  }

  if (params.mode !== 'AUTO' && params.mode !== 'OFF') {
    throw new Error('Unsupported pump mode.');
  }

  return {
    command_id,
    device_id,
    issued_at,
    expires_at,
    mode: params.mode,
  };
}

export function buildBleControlPayload(action: BleControlAction): string {
  switch (action.type) {
    case 'MODE':
      return JSON.stringify({ mode: action.mode });
    case 'MANUAL':
      return JSON.stringify({ mode: 'MANUAL', pump: Boolean(action.pump) });
    case 'CLEAR_FAULT':
      return JSON.stringify({ clearFault: true });
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported BLE control action: ${String(exhaustive)}`);
    }
  }
}

export function buildWifiProvisioningPayload(ssid: string, password: string): string {
  const trimmedSsid = ssid.trim();
  if (!trimmedSsid) {
    throw new Error('Wi-Fi network name (SSID) is required.');
  }
  const encoder = new TextEncoder();
  if (encoder.encode(trimmedSsid).length > 32) {
    throw new Error('Wi-Fi SSID cannot exceed 32 bytes.');
  }
  if (password.length > 0 && (password.length < 8 || password.length > 63)) {
    throw new Error('WPA2/WPA3 Wi-Fi passphrase must be 8 to 63 characters (or empty for an open network).');
  }
  return JSON.stringify({ ssid: trimmedSsid, password });
}

function normalizeMode(rawMode: unknown, pump: boolean): PumpMode {
  if (rawMode === 'AUTO' || rawMode === 'OFF' || rawMode === 'MANUAL') {
    return rawMode;
  }
  return pump ? 'MANUAL' : 'AUTO';
}

function normalizeFault(rawFault: unknown): FaultCode | string | null {
  if (rawFault === null || rawFault === undefined || rawFault === '' || rawFault === false ||
      rawFault === 0 || rawFault === '0' || rawFault === 'NONE') {
    return null;
  }
  if (rawFault === true) {
    return 'FAULT_ACTIVE';
  }
  return String(rawFault);
}

export function parseStatusNotification(
  input: string | Record<string, unknown>,
  options?: { timestampMs?: number; source?: 'ble' | 'cloud'; queued?: boolean }
): TelemetrySample {
  let obj: Record<string, unknown>;
  if (typeof input === 'string') {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Telemetry payload must be a JSON object.');
    }
    obj = parsed as Record<string, unknown>;
  } else {
    obj = input;
  }

  const levelValid = Boolean(obj.levelValid);
  const rawLevel = typeof obj.levelPercent === 'number' && Number.isFinite(obj.levelPercent)
    ? Math.max(0, Math.min(100, obj.levelPercent))
    : null;

  const temperatureValid = Boolean(obj.temperatureValid);
  const rawTemp = typeof obj.temperatureC === 'number' && Number.isFinite(obj.temperatureC)
    ? obj.temperatureC
    : null;

  const rawCurrent = typeof obj.currentA === 'number' && Number.isFinite(obj.currentA)
    ? Math.max(0, obj.currentA)
    : null;

  // BLE uses pump/mode; firmware cloud snapshots use pumpRunning/pumpMode.
  const pump = typeof obj.pump === 'boolean' ? obj.pump : Boolean(obj.pumpRunning);
  const mode = normalizeMode(obj.mode ?? obj.pumpMode, pump);

  const gpsValid = typeof obj.gpsValid === 'boolean' ? obj.gpsValid : undefined;
  const rawGpsLat = obj.gpsLat ?? obj.latitude;
  const rawGpsLon = obj.gpsLon ?? obj.longitude;
  const gpsLat = typeof rawGpsLat === 'number' && Number.isFinite(rawGpsLat) ? rawGpsLat : null;
  const gpsLon = typeof rawGpsLon === 'number' && Number.isFinite(rawGpsLon) ? rawGpsLon : null;
  const waterLevel = typeof obj.waterLevel === 'string' ? obj.waterLevel.toUpperCase() : '';

  return {
    levelValid,
    levelPercent: levelValid ? rawLevel : null,
    low: typeof obj.low === 'boolean' ? obj.low : waterLevel === 'LOW',
    mid: typeof obj.mid === 'boolean' ? obj.mid : waterLevel === 'MID' || waterLevel === 'BETWEEN',
    full: typeof obj.full === 'boolean' ? obj.full : waterLevel === 'FULL',
    pump,
    mode,
    temperatureValid,
    temperatureC: temperatureValid ? rawTemp : null,
    currentA: rawCurrent,
    fault: normalizeFault(obj.fault),
    wifi: typeof obj.wifi === 'boolean' ? obj.wifi : Boolean(obj.wifiConnected),
    gpsValid,
    gpsStatus:
      obj.gpsStatus === 'LOCKED' || obj.gpsStatus === 'SEARCHING' || obj.gpsStatus === 'UNAVAILABLE'
        ? obj.gpsStatus
        : gpsValid
        ? 'LOCKED'
        : undefined,
    gpsLat,
    gpsLon,
    gpsZoneLabel: typeof obj.gpsZoneLabel === 'string' ? obj.gpsZoneLabel : undefined,
    timestampMs:
      typeof options?.timestampMs === 'number'
        ? options.timestampMs
        : typeof obj.timestampMs === 'number'
        ? obj.timestampMs
        : typeof obj.ts === 'number'
        ? obj.ts * 1000
        : typeof obj.timestamp === 'number'
        ? obj.timestamp * 1000
        : Date.now(),
    queued: typeof options?.queued === 'boolean' ? options.queued : Boolean(obj.queued),
    source: options?.source,
  };
}

/**
 * Decode the firmware's compact BLE status wire packet (not its internal C++
 * structs). Packet v1 is packed, little-endian, and exactly 17 bytes:
 * version, flags, level%, temp in 0.1 C, current in mA, fault, pump mode,
 * latitude/longitude in signed degrees * 1e6.
 */
export function parseBleStatusPacket(
  view: DataView,
  options?: { timestampMs?: number }
): TelemetrySample {
  if (view.byteLength !== 17 || view.getUint8(0) !== 1) {
    throw new Error('Unsupported BLE telemetry packet version or length.');
  }

  const flags = view.getUint8(1);
  const faultNames = [
    null,
    'LEVEL_SENSOR_FAULT',
    'CURRENT_SENSOR_FAULT',
    'LOW_CURRENT_FAULT',
    'OVERCURRENT_TRIP',
    'MAX_RUNTIME_EXCEEDED',
  ] as const;
  const faultCode = view.getUint8(7);
  const modeCode = view.getUint8(8);
  const mode: PumpMode = modeCode === 1 ? 'MANUAL' : modeCode === 2 ? 'OFF' : 'AUTO';
  if (modeCode > 2) throw new Error('Invalid BLE pump mode.');

  const gpsValid = (flags & (1 << 7)) !== 0;
  const levelValid = (flags & (1 << 0)) !== 0;
  const temperatureValid = (flags & (1 << 5)) !== 0;
  return parseStatusNotification({
    levelValid,
    levelPercent: view.getUint8(2),
    low: (flags & (1 << 1)) !== 0,
    mid: (flags & (1 << 2)) !== 0,
    full: (flags & (1 << 3)) !== 0,
    pump: (flags & (1 << 4)) !== 0,
    temperatureValid,
    temperatureC: view.getInt16(3, true) / 10,
    currentA: view.getUint16(5, true) / 1000,
    fault: faultCode === 0 ? 'NONE' : faultNames[faultCode] ?? `FIRMWARE_FAULT_${faultCode}`,
    mode,
    wifi: (flags & (1 << 6)) !== 0,
    gpsValid,
    gpsStatus: gpsValid ? 'LOCKED' : 'SEARCHING',
    gpsLat: gpsValid ? view.getInt32(9, true) / 1_000_000 : null,
    gpsLon: gpsValid ? view.getInt32(13, true) / 1_000_000 : null,
  }, { source: 'ble', timestampMs: options?.timestampMs ?? Date.now() });
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passkey',
  'token',
  'access_token',
  'refresh_token',
  'service_role',
  'service_role_key',
  'anon_key',
  'gpslat',
  'gpslon',
  'latitude',
  'longitude',
]);

export function redactSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveFields(v);
      }
    }
    return out as T;
  }
  return value;
}
