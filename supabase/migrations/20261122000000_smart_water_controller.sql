-- Smart Water Controller: Secure App-User Access, Device Membership & RLS Migration
-- Keeps ESP32 firmware Auth accounts isolated from app-user Auth accounts.
-- Never grant app users write access to device_status, telemetry_history, or direct insert on device_commands.

create extension if not exists pgcrypto;

-- 1. Existing firmware tables (idempotent guards for clean-room setup)
create table if not exists public.device_registry (
  device_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  label text not null default 'Smart Water Controller',
  created_at timestamptz not null default now()
);

create table if not exists public.device_status (
  device_id text primary key references public.device_registry(device_id) on delete cascade,
  telemetry jsonb not null default '{}'::jsonb,
  wifi_connected boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Existing firmware installations may have created this table before the
-- app-facing telemetry columns were introduced. Reconcile it before use.
alter table public.device_status
  add column if not exists telemetry jsonb not null default '{}'::jsonb,
  add column if not exists wifi_connected boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();
update public.device_status set telemetry = '{}'::jsonb where telemetry is null;
update public.device_status set wifi_connected = false where wifi_connected is null;
update public.device_status set updated_at = now() where updated_at is null;
alter table public.device_status
  alter column telemetry set default '{}'::jsonb,
  alter column telemetry set not null,
  alter column wifi_connected set default false,
  alter column wifi_connected set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.telemetry_history (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.device_registry(device_id) on delete cascade,
  event_id text not null,
  telemetry jsonb not null,
  queued boolean not null default false,
  recorded_at timestamptz not null default now()
);

-- Add columns before building indexes: older firmware installations may have
-- pre-existing telemetry_history tables without the app's timestamp/queue data.
alter table public.telemetry_history
  add column if not exists event_id text,
  add column if not exists telemetry jsonb not null default '{}'::jsonb,
  add column if not exists queued boolean not null default false,
  add column if not exists recorded_at timestamptz not null default now();
update public.telemetry_history set event_id = id::text where event_id is null;
update public.telemetry_history set telemetry = '{}'::jsonb where telemetry is null;
update public.telemetry_history set queued = false where queued is null;
update public.telemetry_history set recorded_at = now() where recorded_at is null;
alter table public.telemetry_history
  alter column event_id set not null,
  alter column telemetry set default '{}'::jsonb,
  alter column telemetry set not null,
  alter column queued set default false,
  alter column queued set not null,
  alter column recorded_at set default now(),
  alter column recorded_at set not null;
create unique index if not exists idx_telemetry_history_device_event
  on public.telemetry_history (device_id, event_id);

create index if not exists idx_telemetry_history_device_time
  on public.telemetry_history (device_id, recorded_at desc);

create table if not exists public.device_commands (
  command_id text primary key check (command_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  device_id text not null references public.device_registry(device_id) on delete cascade,
  issued_at bigint not null,
  expires_at bigint not null check (expires_at > issued_at and (expires_at - issued_at) <= 300),
  mode text not null check (mode in ('AUTO', 'OFF', 'MANUAL')),
  pump boolean,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  ack_reason text,
  acknowledged_at bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_manual_pump_boolean check (
    (mode = 'MANUAL' and pump is not null) or
    (mode in ('AUTO', 'OFF') and pump is null)
  )
);

-- Firmware's earlier schema named the acknowledgement text column `reason`
-- and stores acknowledged_at as Unix seconds. Preserve that wire/database
-- contract while adding the app's ack_reason and created_by fields.
alter table public.device_commands
  add column if not exists ack_reason text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'device_commands'
      and column_name = 'reason'
  ) then
    execute 'update public.device_commands set ack_reason = reason where ack_reason is null';
  end if;
end;
$$;

create index if not exists idx_device_commands_device_status
  on public.device_commands (device_id, status, issued_at desc);

-- 2. New App-User <-> Device Association Table
create table if not exists public.device_members (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.device_registry(device_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  device_alias text,
  created_at timestamptz not null default now(),
  unique (device_id, user_id)
);

create index if not exists idx_device_members_user_id
  on public.device_members (user_id, device_id);

-- 3. Helper membership check (SECURITY DEFINER with locked search_path)
create or replace function public.user_has_device_access(
  target_device_id text,
  allowed_roles text[] default array['owner', 'operator', 'viewer']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.device_members dm
    where dm.device_id = target_device_id
      and dm.user_id = auth.uid()
      and dm.role = any(allowed_roles)
  );
$$;

create or replace function public.is_firmware_device_owner(target_device_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.device_registry dr
    where dr.device_id = target_device_id
      and dr.user_id = auth.uid()
  );
$$;

-- 4. Enable Row Level Security on ALL tables
alter table public.device_registry enable row level security;
alter table public.device_status enable row level security;
alter table public.telemetry_history enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_members enable row level security;

-- Drop any overly broad legacy policies if re-running
drop policy if exists "firmware_select_own_registry" on public.device_registry;
drop policy if exists "app_user_read_own_memberships" on public.device_members;
drop policy if exists "app_user_read_assigned_status" on public.device_status;
drop policy if exists "firmware_upsert_own_status" on public.device_status;
drop policy if exists "firmware_update_own_status" on public.device_status;
drop policy if exists "app_user_read_assigned_history" on public.telemetry_history;
drop policy if exists "firmware_insert_own_history" on public.telemetry_history;
drop policy if exists "app_user_read_assigned_commands" on public.device_commands;
drop policy if exists "firmware_read_own_commands" on public.device_commands;
drop policy if exists "firmware_ack_own_commands" on public.device_commands;

-- 5. device_registry policies (firmware user reads own registration; app users have NO direct access)
create policy "firmware_select_own_registry"
  on public.device_registry
  for select
  to authenticated
  using (user_id = auth.uid());

-- 6. device_members policies (app user reads only their own device assignments)
create policy "app_user_read_own_memberships"
  on public.device_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- 7. device_status policies (app users read assigned devices only; ONLY firmware writes)
create policy "app_user_read_assigned_status"
  on public.device_status
  for select
  to authenticated
  using (public.user_has_device_access(device_id));

create policy "firmware_upsert_own_status"
  on public.device_status
  for insert
  to authenticated
  with check (public.is_firmware_device_owner(device_id));

create policy "firmware_update_own_status"
  on public.device_status
  for update
  to authenticated
  using (public.is_firmware_device_owner(device_id))
  with check (public.is_firmware_device_owner(device_id));

-- 8. telemetry_history policies (app users read assigned devices only; ONLY firmware inserts)
create policy "app_user_read_assigned_history"
  on public.telemetry_history
  for select
  to authenticated
  using (public.user_has_device_access(device_id));

create policy "firmware_insert_own_history"
  on public.telemetry_history
  for insert
  to authenticated
  with check (public.is_firmware_device_owner(device_id));

-- 9. device_commands policies
-- App users can ONLY read commands for their assigned devices.
-- App users CANNOT insert/update/delete device_commands directly (must go through create-command Edge Function).
create policy "app_user_read_assigned_commands"
  on public.device_commands
  for select
  to authenticated
  using (public.user_has_device_access(device_id));

create policy "firmware_read_own_commands"
  on public.device_commands
  for select
  to authenticated
  using (public.is_firmware_device_owner(device_id));

create policy "firmware_ack_own_commands"
  on public.device_commands
  for update
  to authenticated
  using (public.is_firmware_device_owner(device_id))
  with check (public.is_firmware_device_owner(device_id));

-- 10. Privilege hardening: revoke direct table write grants from anon/authenticated where not needed
revoke all on public.device_registry from anon;
revoke insert, update, delete on public.device_status from anon;
revoke insert, update, delete on public.telemetry_history from anon;
revoke insert, update, delete on public.device_commands from anon;
revoke insert, update, delete on public.device_members from anon;
