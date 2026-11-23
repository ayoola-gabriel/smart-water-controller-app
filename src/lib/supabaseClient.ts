import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { webSessionStorageAdapter } from './storage';
import {
  buildRemoteCommandPayload,
  parseStatusNotification,
} from './protocol';
import type {
  AppUser,
  DeviceSummary,
  PumpMode,
  TelemetrySample,
} from '../types/controller';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: webSessionStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return clientInstance;
}

export async function signInAppUser(email: string, password: string): Promise<AppUser> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase URL and anon key are not configured in this environment.');
  }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(error?.message || 'Unable to sign in with those credentials.');
  }
  return { id: data.user.id, email: data.user.email || email };
}

export async function signUpAppUser(email: string, password: string): Promise<{
  user: AppUser | null;
  confirmationRequired: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase URL and anon key are not configured in this environment.');
  }
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return {
    user: data.user ? { id: data.user.id, email: data.user.email || email } : null,
    confirmationRequired: !data.session,
  };
}

export async function signOutAppUser(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email || 'user' };
}

export async function fetchAuthorizedDevices(): Promise<DeviceSummary[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client.functions.invoke<{
    devices: Array<{
      device_id: string;
      name: string;
      role: 'owner' | 'operator' | 'viewer';
      wifi_connected: boolean;
      updated_at: string | null;
      telemetry: Record<string, unknown> | null;
    }>;
  }>('list-devices');

  if (!error && data?.devices) {
    return data.devices.map((d) => {
      const updatedMs = d.updated_at ? Date.parse(d.updated_at) : null;
      const sample = d.telemetry
        ? parseStatusNotification(d.telemetry, {
            timestampMs: updatedMs ?? Date.now(),
            source: 'cloud',
          })
        : null;
      return {
        device_id: d.device_id,
        name: d.name || 'Smart Water Controller',
        role: d.role,
        bleBonded: false,
        bleConnected: false,
        wifiOnline: sample?.wifi ?? Boolean(d.wifi_connected),
        cloudOnline: Boolean(updatedMs && Date.now() - updatedMs < 60_000),
        lastTelemetryAtMs: updatedMs,
        latestTelemetry: sample,
      };
    });
  }

  // Fallback to RLS-enforced direct SELECT on device_members + device_status
  const { data: members, error: memberErr } = await client
    .from('device_members')
    .select('device_id, role, device_alias');

  if (memberErr) {
    throw new Error(memberErr.message);
  }

  const deviceIds = (members ?? []).map((m) => m.device_id as string);
  if (deviceIds.length === 0) return [];

  const { data: statuses, error: statusErr } = await client
    .from('device_status')
    .select('device_id, telemetry, wifi_connected, updated_at')
    .in('device_id', deviceIds);

  if (statusErr) {
    throw new Error(statusErr.message);
  }

  const statusMap = new Map((statuses ?? []).map((s) => [s.device_id as string, s]));
  return (members ?? []).map((m) => {
    const st = statusMap.get(m.device_id as string);
    const updatedMs = st?.updated_at ? Date.parse(st.updated_at as string) : null;
    const sample = st?.telemetry
      ? parseStatusNotification(st.telemetry as Record<string, unknown>, {
          timestampMs: updatedMs ?? Date.now(),
          source: 'cloud',
        })
      : null;
    return {
      device_id: m.device_id as string,
      name: (m.device_alias as string) || 'Smart Water Controller',
      role: m.role as 'owner' | 'operator' | 'viewer',
      bleBonded: false,
      bleConnected: false,
      wifiOnline: sample?.wifi ?? Boolean(st?.wifi_connected),
      cloudOnline: Boolean(updatedMs && Date.now() - updatedMs < 60_000),
      lastTelemetryAtMs: updatedMs,
      latestTelemetry: sample,
    };
  });
}

export async function fetchRemoteDeviceStatus(deviceId: string): Promise<{
  telemetry: TelemetrySample | null;
  updatedAtMs: number | null;
  wifiConnected: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await client
    .from('device_status')
    .select('telemetry, wifi_connected, updated_at')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { telemetry: null, updatedAtMs: null, wifiConnected: false };
  }

  const updatedAtMs = data.updated_at ? Date.parse(data.updated_at as string) : Date.now();
  const telemetry = data.telemetry
    ? parseStatusNotification(data.telemetry as Record<string, unknown>, {
        timestampMs: updatedAtMs,
        source: 'cloud',
      })
    : null;

  return {
    telemetry,
    updatedAtMs,
    wifiConnected: telemetry?.wifi ?? Boolean(data.wifi_connected),
  };
}

export async function fetchRemoteTelemetryHistory(
  deviceId: string,
  limit = 60
): Promise<TelemetrySample[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('telemetry_history')
    .select('telemetry, queued, recorded_at')
    .eq('device_id', deviceId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const tsMs = row.recorded_at ? Date.parse(row.recorded_at as string) : Date.now();
    return parseStatusNotification((row.telemetry as Record<string, unknown>) || {}, {
      timestampMs: tsMs,
      source: 'cloud',
      queued: Boolean(row.queued),
    });
  });
}

export async function dispatchRemoteCommand(params: {
  deviceId: string;
  mode?: PumpMode;
  pump?: boolean;
  clearFault?: boolean;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured.');
  }

  const payload = buildRemoteCommandPayload({
    deviceId: params.deviceId,
    mode: params.mode,
    pump: params.pump,
    clearFault: params.clearFault,
  });

  const { data, error } = await client.functions.invoke<{
    command: { command_id?: string };
    error?: string;
  }>('create-command', {
    body: payload,
  });

  if (error || !data?.command) {
    throw new Error(error?.message || data?.error || 'Failed to dispatch remote command.');
  }
}
