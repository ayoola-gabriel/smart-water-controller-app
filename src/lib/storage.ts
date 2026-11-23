// Platform storage abstraction for non-sensitive UI preferences & bonded BLE device IDs.
// Note: Wi-Fi passwords, firmware credentials, and service_role keys are NEVER stored here.
// On native mobile targets (Capacitor/Cordova), replace the Supabase session storage adapter
// with a Keychain (iOS) / Keystore (Android) plugin.

const THEME_KEY = 'swc_theme';
const BONDED_DEVICES_KEY = 'swc_bonded_ble_devices';

export interface BondedBleMetadata {
  deviceId: string;
  bleDeviceId: string;
  name: string;
  pairedAtMs: number;
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage access restrictions
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage access restrictions
  }
}

export function loadBondedDevices(): BondedBleMetadata[] {
  try {
    const raw = window.localStorage.getItem(BONDED_DEVICES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BondedBleMetadata =>
        Boolean(item) &&
        typeof item.deviceId === 'string' &&
        typeof item.bleDeviceId === 'string' &&
        typeof item.name === 'string'
    );
  } catch {
    return [];
  }
}

export function saveBondedDevice(meta: BondedBleMetadata): void {
  try {
    const existing = loadBondedDevices().filter((d) => d.deviceId !== meta.deviceId);
    existing.unshift(meta);
    window.localStorage.setItem(BONDED_DEVICES_KEY, JSON.stringify(existing.slice(0, 8)));
  } catch {
    // Ignore storage access restrictions
  }
}

export function removeBondedDevice(deviceId: string): void {
  try {
    const filtered = loadBondedDevices().filter((d) => d.deviceId !== deviceId);
    window.localStorage.setItem(BONDED_DEVICES_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage access restrictions
  }
}

export const webSessionStorageAdapter = {
  getItem: (key: string): string | null => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage access restrictions
    }
  },
  removeItem: (key: string): void => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage access restrictions
    }
  },
};
