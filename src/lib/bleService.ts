import {
  BLE_CONTROL_CHAR_UUID,
  BLE_DEVICE_NAME,
  BLE_PROFILE_CHAR_UUID,
  BLE_SERVICE_UUID,
  BLE_STATUS_CHAR_UUID,
  BLE_WIFI_CHAR_UUID,
  buildBleControlPayload,
  buildWifiProvisioningPayload,
  parseBleStatusPacket,
  parseStatusNotification,
  type BleControlAction,
} from './protocol';
import type { ControllerProfile, TelemetrySample } from '../types/controller';

// Minimal Web Bluetooth typings for TypeScript without external @types/web-bluetooth dependency
interface WebBluetoothCharacteristic extends EventTarget {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<WebBluetoothCharacteristic>;
  stopNotifications(): Promise<WebBluetoothCharacteristic>;
}

interface WebBluetoothService {
  getCharacteristic(uuid: string): Promise<WebBluetoothCharacteristic>;
}

interface WebBluetoothServer {
  connected: boolean;
  connect(): Promise<WebBluetoothServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<WebBluetoothService>;
}

interface WebBluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: WebBluetoothServer;
}

interface WebBluetoothNavigator {
  getAvailability?: () => Promise<boolean>;
  getDevices?: () => Promise<WebBluetoothDevice[]>;
  requestDevice(options: {
    filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
    optionalServices?: string[];
  }): Promise<WebBluetoothDevice>;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export async function checkBluetoothAvailability(): Promise<{
  supported: boolean;
  available: boolean;
  reason?: string;
}> {
  if (!isWebBluetoothSupported()) {
    return {
      supported: false,
      available: false,
      reason: 'Web Bluetooth is unavailable in this browser or context (requires Chrome/Edge/Bluefy over HTTPS).',
    };
  }
  const bt = (navigator as unknown as { bluetooth: WebBluetoothNavigator }).bluetooth;
  if (typeof bt.getAvailability === 'function') {
    try {
      const available = await bt.getAvailability();
      if (!available) {
        return {
          supported: true,
          available: false,
          reason: 'Bluetooth adapter is disabled or unavailable on this device.',
        };
      }
    } catch {
      // Proceed cautiously if getAvailability is restricted by permissions policy
    }
  }
  return { supported: true, available: true };
}

export class WebBleControllerClient {
  private device: WebBluetoothDevice | null = null;
  private statusChar: WebBluetoothCharacteristic | null = null;
  private controlChar: WebBluetoothCharacteristic | null = null;
  private profileChar: WebBluetoothCharacteristic | null = null;
  private wifiChar: WebBluetoothCharacteristic | null = null;
  private isPaired = false;
  private onTelemetryCb: ((sample: TelemetrySample) => void) | null = null;
  private onDisconnectCb: ((reason: string) => void) | null = null;
  private notificationListener: ((ev: Event) => void) | null = null;
  private disconnectListener: (() => void) | null = null;

  private decodeStatusValue(view: DataView, timestampMs = Date.now()): TelemetrySample {
    // Firmware Revision 6 sends a 17-byte, versioned binary packet. Retain
    // JSON fallback for already-flashed devices running older firmware.
    if (view.byteLength > 0 && view.getUint8(0) === 1) {
      return parseBleStatusPacket(view, { timestampMs });
    }
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const text = new TextDecoder('utf-8').decode(bytes).trim();
    if (!text) throw new Error('Empty BLE status value.');
    return parseStatusNotification(text, { source: 'ble', timestampMs });
  }

  get connected(): boolean {
    return Boolean(this.device?.gatt?.connected);
  }

  get paired(): boolean {
    return this.isPaired && this.connected;
  }

  get deviceInfo(): { id: string; name: string } | null {
    if (!this.device) return null;
    return { id: this.device.id, name: this.device.name || BLE_DEVICE_NAME };
  }

  setCallbacks(
    onTelemetry: (sample: TelemetrySample) => void,
    onDisconnect: (reason: string) => void
  ): void {
    this.onTelemetryCb = onTelemetry;
    this.onDisconnectCb = onDisconnect;
  }

  async scanAndConnect(): Promise<{ bleDeviceId: string; name: string }> {
    const availability = await checkBluetoothAvailability();
    if (!availability.supported || !availability.available) {
      throw new Error(availability.reason || 'Bluetooth is not available.');
    }

    const bt = (navigator as unknown as { bluetooth: WebBluetoothNavigator }).bluetooth;
    let selected: WebBluetoothDevice;
    try {
      selected = await bt.requestDevice({
        filters: [{ name: BLE_DEVICE_NAME }, { services: [BLE_SERVICE_UUID] }],
        optionalServices: [BLE_SERVICE_UUID],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('cancel')) {
        throw new Error('BLE device selection was cancelled.');
      }
      throw new Error(`BLE discovery failed: ${msg}`);
    }

    await this.connectDevice(selected);
    this.isPaired = true;
    return {
      bleDeviceId: selected.id,
      name: selected.name || BLE_DEVICE_NAME,
    };
  }

  async reconnectBonded(bleDeviceId?: string): Promise<boolean> {
    if (!isWebBluetoothSupported()) return false;
    const bt = (navigator as unknown as { bluetooth: WebBluetoothNavigator }).bluetooth;
    if (typeof bt.getDevices !== 'function') return false;

    const permitted = await bt.getDevices();
    const target = bleDeviceId
      ? permitted.find((d) => d.id === bleDeviceId)
      : permitted.find((d) => d.name === BLE_DEVICE_NAME);

    if (!target) return false;
    await this.connectDevice(target);
    this.isPaired = true;
    return true;
  }

  private async connectDevice(device: WebBluetoothDevice): Promise<void> {
    this.cleanupListeners();
    this.device = device;

    if (!device.gatt) {
      throw new Error('Selected BLE device does not expose a GATT server.');
    }

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);

    this.statusChar = await service.getCharacteristic(BLE_STATUS_CHAR_UUID);
    this.controlChar = await service.getCharacteristic(BLE_CONTROL_CHAR_UUID);
    this.profileChar = await service.getCharacteristic(BLE_PROFILE_CHAR_UUID);
    this.wifiChar = await service.getCharacteristic(BLE_WIFI_CHAR_UUID);

    this.disconnectListener = () => {
      this.statusChar = null;
      this.controlChar = null;
      this.profileChar = null;
      this.wifiChar = null;
      this.onDisconnectCb?.('BLE connection closed by controller or moved out of range.');
    };
    device.addEventListener('gattserverdisconnected', this.disconnectListener);

    // Attach the listener before enabling notifications so the first status
    // packet cannot arrive in the gap between startNotifications and listener setup.
    this.notificationListener = (event: Event) => {
      const target = event.target as WebBluetoothCharacteristic | null;
      if (!target?.value) return;
      try {
        const value = target.value;
        const sample = this.decodeStatusValue(value);
        this.onTelemetryCb?.(sample);
      } catch (err) {
        // Never log the payload (it can contain location data); retain the
        // parser error so browser diagnostics can identify a bad BLE frame.
        console.warn(
          'Unable to decode controller BLE status notification:',
          err instanceof Error ? err.message : 'invalid status frame'
        );
      }
    };

    this.statusChar.addEventListener('characteristicvaluechanged', this.notificationListener);
    await this.statusChar.startNotifications();

    // Read after subscribing; notifications continue to provide the live stream.
    try {
      const initialView = await this.statusChar.readValue();
      this.onTelemetryCb?.(this.decodeStatusValue(initialView));
    } catch (err) {
      // The next periodic notification is still expected to supply live status.
      console.info(
        'Initial BLE status read unavailable; waiting for notifications:',
        err instanceof Error ? err.message : 'read failed'
      );
    }
  }

  private async writeUtf8(char: WebBluetoothCharacteristic | null, json: string): Promise<void> {
    if (!this.connected || !char) {
      throw new Error('Controller is not connected over BLE.');
    }
    const bytes = new TextEncoder().encode(json);
    if (typeof char.writeValueWithResponse === 'function') {
      await char.writeValueWithResponse(bytes);
    } else {
      await char.writeValue(bytes);
    }
  }

  async sendControl(action: BleControlAction): Promise<void> {
    if (!this.paired) {
      throw new Error('Authenticated BLE pairing is required before sending pump commands.');
    }
    const payload = buildBleControlPayload(action);
    await this.writeUtf8(this.controlChar, payload);
  }

  async readProfile(): Promise<Partial<ControllerProfile>> {
    if (!this.paired || !this.profileChar) {
      throw new Error('Pair and connect over BLE to read controller profile.');
    }
    const view = await this.profileChar.readValue();
    const raw = new TextDecoder('utf-8').decode(view.buffer);
    return JSON.parse(raw) as Partial<ControllerProfile>;
  }

  async writeProfile(profile: ControllerProfile): Promise<void> {
    if (!this.paired) {
      throw new Error('Pair and connect over BLE to update controller profile.');
    }
    await this.writeUtf8(this.profileChar, JSON.stringify(profile));
  }

  async provisionWifi(ssid: string, password: string): Promise<void> {
    // Write-only characteristic: never read back, never logged
    if (!this.paired) {
      throw new Error('Wi-Fi credentials require an active, paired, encrypted BLE session.');
    }
    const payload = buildWifiProvisioningPayload(ssid, password);
    await this.writeUtf8(this.wifiChar, payload);
  }

  disconnect(): void {
    this.cleanupListeners();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  private cleanupListeners(): void {
    if (this.statusChar && this.notificationListener) {
      this.statusChar.removeEventListener('characteristicvaluechanged', this.notificationListener);
    }
    if (this.device && this.disconnectListener) {
      this.device.removeEventListener('gattserverdisconnected', this.disconnectListener);
    }
    this.notificationListener = null;
    this.disconnectListener = null;
  }
}
