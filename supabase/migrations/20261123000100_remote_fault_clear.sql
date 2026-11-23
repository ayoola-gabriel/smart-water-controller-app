-- Add an explicit, auditable cloud command flag for remote fault clearing.
-- Existing pump-mode commands default to false and keep their prior behavior.
alter table public.device_commands
  add column if not exists clear_fault boolean not null default false;

update public.device_commands
set clear_fault = false
where clear_fault is null;

alter table public.device_commands
  alter column clear_fault set default false,
  alter column clear_fault set not null;
