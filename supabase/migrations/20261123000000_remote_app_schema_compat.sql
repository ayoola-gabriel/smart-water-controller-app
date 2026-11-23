-- Reconcile pre-existing firmware tables with the columns required by the
-- remote app. CREATE TABLE IF NOT EXISTS in the initial migration does not
-- modify tables that were created by older firmware setup scripts.
alter table public.device_status
  add column if not exists telemetry jsonb not null default '{}'::jsonb,
  add column if not exists wifi_connected boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.telemetry_history
  add column if not exists telemetry jsonb not null default '{}'::jsonb,
  add column if not exists queued boolean not null default false,
  add column if not exists recorded_at timestamptz not null default now();

-- The membership table is app-specific and may not exist in an existing
-- firmware-only Supabase project.
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

alter table public.device_members enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'device_members'
      and policyname = 'app_user_read_own_memberships'
  ) then
    create policy "app_user_read_own_memberships"
      on public.device_members
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end;
$$;

grant select on public.device_members to authenticated;
revoke insert, update, delete on public.device_members from anon, authenticated;
