// Supabase Edge Function: create-command
// Validates the signed-in app user's JWT, checks device_members authorization ('owner' | 'operator'),
// validates pump/fault-clear commands and <= 300s expiry, and inserts via service_role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COMMAND_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_TTL_SECONDS = 300;

function corsHeaders(req: Request): Record<string, string> {
  const configuredOrigins = Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') ||
    'http://localhost:3000,http://localhost:5173';
  const allowedOrigins = configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  const reqOrigin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowedOrigins.includes(reqOrigin)) headers['Access-Control-Allow-Origin'] = reqOrigin;
  return headers;
}

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

function generateCommandId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `swc_${Date.now().toString(36)}_${rand}`.slice(0, 64);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(req);
    if (!headers['Access-Control-Allow-Origin']) return new Response('Origin not allowed', { status: 403, headers });
    return new Response('ok', { headers });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(req, 500, { error: 'Server environment is not configured.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(req, 401, { error: 'Missing bearer authorization token.' });
  }

  // 1. Verify the caller's Supabase Auth JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse(req, 401, { error: 'Invalid or expired user session.' });
  }

  // 2. Parse & validate payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Request body must be valid JSON.' });
  }

  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : 'swc-device-001';
  if (!DEVICE_ID_REGEX.test(deviceId)) {
    return jsonResponse(req, 400, { error: 'Invalid device_id format.' });
  }

  const commandId =
    typeof body.command_id === 'string' && body.command_id.trim()
      ? body.command_id.trim()
      : generateCommandId();

  if (!COMMAND_ID_REGEX.test(commandId)) {
    return jsonResponse(req, 400, {
      error: 'command_id must contain only letters, numbers, hyphens, or underscores (max 64 chars).',
    });
  }

  const clearFault = body.clear_fault === true;
  if (Object.prototype.hasOwnProperty.call(body, 'clear_fault') && typeof body.clear_fault !== 'boolean') {
    return jsonResponse(req, 400, { error: 'clear_fault must be a boolean.' });
  }

  // The table requires a valid mode for every row. OFF is a harmless placeholder
  // for a clear-only command; firmware handles clear_fault without changing mode.
  const mode = clearFault ? 'OFF' : body.mode;
  if (mode !== 'AUTO' && mode !== 'OFF' && mode !== 'MANUAL') {
    return jsonResponse(req, 400, { error: 'mode must be AUTO, OFF, or MANUAL.' });
  }

  let pumpValue: boolean | null = null;
  if (!clearFault && mode === 'MANUAL') {
    if (typeof body.pump !== 'boolean') {
      return jsonResponse(req, 400, { error: 'MANUAL mode requires a boolean pump field.' });
    }
    pumpValue = body.pump;
  }

  const requestedTtl =
    typeof body.ttl_seconds === 'number' && Number.isFinite(body.ttl_seconds)
      ? Math.floor(body.ttl_seconds)
      : 120;
  const ttlSeconds = Math.max(10, Math.min(MAX_TTL_SECONDS, requestedTtl));

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;

  // 3. Privileged service_role client (server-side only)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Check authorization in device_members
  const { data: membership, error: memberError } = await adminClient
    .from('device_members')
    .select('role')
    .eq('device_id', deviceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return jsonResponse(req, 500, { error: 'Failed to verify device membership.' });
  }

  if (!membership || (membership.role !== 'owner' && membership.role !== 'operator')) {
    return jsonResponse(req, 403, {
      error: 'You are not authorized to send control commands to this device.',
    });
  }

  // 4. Insert command server-side
  const { data: inserted, error: insertError } = await adminClient
    .from('device_commands')
    .insert({
      command_id: commandId,
      device_id: deviceId,
      issued_at: issuedAt,
      expires_at: expiresAt,
      mode,
      pump: pumpValue,
      clear_fault: clearFault,
      status: 'pending',
      created_by: user.id,
    })
    .select('command_id, device_id, issued_at, expires_at, mode, pump, clear_fault, status, ack_reason, acknowledged_at')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return jsonResponse(req, 409, { error: 'Duplicate command_id; generate a fresh command_id.' });
    }
    return jsonResponse(req, 500, { error: 'Unable to queue remote command.' });
  }

  return jsonResponse(req, 201, {
    command: inserted,
    note: clearFault
      ? 'Fault clear request queued for firmware validation (~5s). Confirm the fault state in telemetry.'
      : 'Command queued for firmware poll (~5s). Confirm physical pump state via device_status telemetry.',
  });
});
