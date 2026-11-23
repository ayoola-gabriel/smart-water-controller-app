// Supabase Edge Function: list-devices
// Returns only devices assigned to the authenticated app user in device_members,
// joined with their latest device_status (never exposing firmware device_registry secrets).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders(req: Request): Record<string, string> {
  const configuredOrigins = Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') ||
    'http://localhost:3000,http://localhost:5173';
  const allowedOrigins = configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  const reqOrigin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(req);
    if (!headers['Access-Control-Allow-Origin']) return new Response('Origin not allowed', { status: 403, headers });
    return new Response('ok', { headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseAnonKey && 'SUPABASE_ANON_KEY',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean);
    console.error('[list-devices] Missing server configuration:', missing.join(', '));
    return jsonResponse(req, 500, { error: 'Server environment is not configured.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(req, 401, { error: 'Missing bearer authorization token.' });
  }

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: memberships, error: memberError } = await adminClient
    .from('device_members')
    .select('device_id, role, device_alias')
    .eq('user_id', user.id);

  if (memberError) {
    console.error('[list-devices] Membership query failed:', memberError.code, memberError.message);
    return jsonResponse(req, 500, { error: 'Failed to load assigned devices.' });
  }

  interface MembershipRow {
    device_id: string;
    role: string;
    device_alias: string | null;
  }

  interface StatusRow {
    device_id: string;
    telemetry: Record<string, unknown> | null;
    wifi_connected: boolean;
    updated_at: string | null;
  }

  const typedMemberships = (memberships ?? []) as MembershipRow[];
  const deviceIds = typedMemberships.map((m) => m.device_id);
  if (deviceIds.length === 0) {
    return jsonResponse(req, 200, { devices: [] });
  }

  const { data: statuses, error: statusError } = await adminClient
    .from('device_status')
    .select('device_id, telemetry, wifi_connected, updated_at')
    .in('device_id', deviceIds);

  if (statusError) {
    console.error('[list-devices] Device status query failed:', statusError.code, statusError.message);
    return jsonResponse(req, 500, { error: 'Failed to load device status.' });
  }

  const typedStatuses = (statuses ?? []) as StatusRow[];
  const statusMap = new Map(typedStatuses.map((s) => [s.device_id, s]));

  const devices = typedMemberships.map((m) => {
    const status = statusMap.get(m.device_id);
    return {
      device_id: m.device_id,
      name: m.device_alias || 'Smart Water Controller',
      role: m.role,
      wifi_connected: status?.wifi_connected ?? false,
      updated_at: status?.updated_at ?? null,
      telemetry: status?.telemetry ?? null,
    };
  });

  return jsonResponse(req, 200, { devices });
});
