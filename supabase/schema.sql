-- NT Power Monitor authentication, approvals, and shared station configuration.
-- Run once in Supabase SQL Editor after the project is active.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and char_length(username) between 3 and 30),
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_configs (
  station_id text primary key,
  electrical_config jsonb not null default '{}'::jsonb,
  infrastructure_config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor text not null default 'system',
  action text not null,
  target text,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists station_configs_updated_by_idx on public.station_configs(updated_by);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'approved'
  );
$$;

create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'approved'
  );
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_approved() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;

create or replace function public.handle_new_power_monitor_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
begin
  new_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1)));
  insert into public.profiles (id, username, role, status)
  values (new.id, new_username, 'user', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_power_monitor_user() from public, anon, authenticated;
drop trigger if exists on_power_monitor_auth_user_created on auth.users;
create trigger on_power_monitor_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_power_monitor_user();

alter table public.profiles enable row level security;
alter table public.station_configs enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.station_configs from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
grant select, update(status, updated_at) on public.profiles to authenticated;
grant select, insert, update on public.station_configs to authenticated;
grant select, update on public.profiles to service_role;
grant select, insert, update on public.station_configs to service_role;
grant select, insert on public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

drop policy if exists "Service role can manage audit logs" on public.audit_logs;
create policy "Service role can manage audit logs"
  on public.audit_logs for all to service_role
  using (true)
  with check (true);

drop policy if exists "Users can read own profile or admins can read all" on public.profiles;
create policy "Users can read own profile or admins can read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Only admins can update profile status" on public.profiles;
create policy "Only admins can update profile status"
  on public.profiles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Approved users can read shared station configs" on public.station_configs;
create policy "Approved users can read shared station configs"
  on public.station_configs for select to authenticated
  using ((select private.is_approved()));

drop policy if exists "Admins can insert station configs" on public.station_configs;
create policy "Admins can insert station configs"
  on public.station_configs for insert to authenticated
  with check ((select private.is_admin()) and updated_by = (select auth.uid()));

drop policy if exists "Admins can update station configs" on public.station_configs;
create policy "Admins can update station configs"
  on public.station_configs for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()) and updated_by = (select auth.uid()));
