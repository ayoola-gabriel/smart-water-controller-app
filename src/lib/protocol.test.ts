import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBleControlPayload,
  buildRemoteCommandPayload,
  buildWifiProvisioningPayload,
  generateCommandId,
  parseStatusNotification,
  redactSensitiveFields,
  validateCommandId,
} from './protocol';

test('generateCommandId produces valid alphanumeric/hyphen/underscore IDs <= 64 chars', () => {
  for (let i = 0; i < 10; i += 1) {
    const id = generateCommandId('swc');
    assert.ok(id.length <= 64);
    assert.equal(validateCommandId(id), true);
  }
  assert.equal(validateCommandId('invalid id!'), false);
  assert.equal(validateCommandId('a'.repeat(65)), false);
});

test('buildRemoteCommandPayload clamps expiry <= 300s and enforces MANUAL pump boolean', () => {
  const nowUnix = 1_760_000_000;
  const manualOn = buildRemoteCommandPayload({
    deviceId: 'swc-device-001',
    mode: 'MANUAL',
    pump: true,
    ttlSeconds: 999,
    nowUnix,
  });
  assert.equal(manualOn.device_id, 'swc-device-001');
  assert.equal(manualOn.issued_at, nowUnix);
  assert.equal(manualOn.expires_at, nowUnix + 300);
  assert.equal(manualOn.mode, 'MANUAL');
  assert.equal(manualOn.pump, true);

  const autoCmd = buildRemoteCommandPayload({
    mode: 'AUTO',
    ttlSeconds: 90,
    nowUnix,
  });
  assert.equal(autoCmd.expires_at - autoCmd.issued_at, 90);
  assert.equal('pump' in autoCmd, false);

  assert.throws(() => {
    buildRemoteCommandPayload({ mode: 'MANUAL', nowUnix });
  });
});

test('buildBleControlPayload generates exact firmware JSON payloads', () => {
  assert.equal(buildBleControlPayload({ type: 'MODE', mode: 'AUTO' }), '{"mode":"AUTO"}');
  assert.equal(buildBleControlPayload({ type: 'MODE', mode: 'OFF' }), '{"mode":"OFF"}');
  assert.equal(buildBleControlPayload({ type: 'MANUAL', pump: false }), '{"mode":"MANUAL","pump":false}');
  assert.equal(buildBleControlPayload({ type: 'MANUAL', pump: true }), '{"mode":"MANUAL","pump":true}');
  assert.equal(buildBleControlPayload({ type: 'CLEAR_FAULT' }), '{"clearFault":true}');
});

test('buildWifiProvisioningPayload validates SSID and passphrase lengths', () => {
  const payload = buildWifiProvisioningPayload('HomeTankNet', 'supersecret123');
  assert.deepEqual(JSON.parse(payload), { ssid: 'HomeTankNet', password: 'supersecret123' });

  assert.throws(() => buildWifiProvisioningPayload('', 'supersecret123'));
  assert.throws(() => buildWifiProvisioningPayload('HomeTankNet', 'short'));
});

test('parseStatusNotification normalizes BLE telemetry JSON cleanly', () => {
  const parsed = parseStatusNotification(
    JSON.stringify({
      levelValid: true,
      levelPercent: 74.5,
      low: false,
      mid: true,
      full: false,
      pump: true,
      mode: 'MANUAL',
      temperatureValid: true,
      temperatureC: 26.4,
      currentA: 4.82,
      fault: 'NONE',
      wifi: true,
    }),
    { timestampMs: 123456789, source: 'ble' }
  );

  assert.equal(parsed.levelValid, true);
  assert.equal(parsed.levelPercent, 74.5);
  assert.equal(parsed.mid, true);
  assert.equal(parsed.pump, true);
  assert.equal(parsed.mode, 'MANUAL');
  assert.equal(parsed.fault, null);
  assert.equal(parsed.wifi, true);
  assert.equal(parsed.source, 'ble');
});


test('redactSensitiveFields masks passwords, tokens, and GPS coordinates', () => {
  const redacted = redactSensitiveFields({
    ssid: 'PlantNet',
    password: 'my-secret-password',
    gpsLat: 37.7749,
    gpsLon: -122.4194,
    nested: { refresh_token: 'abc' },
  });
  assert.equal(redacted.ssid, 'PlantNet');
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.gpsLat, '[REDACTED]');
  assert.equal(redacted.gpsLon, '[REDACTED]');
  assert.equal(redacted.nested.refresh_token, '[REDACTED]');
});
