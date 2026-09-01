-- Foundation: staff auth, roles, and the event header.
--
-- This project owns its own Supabase project, so nothing from the attendance
-- system is assumed to exist. Everything the consumption domain depends on
-- (profiles, events, role helpers) is created here.

create extension if not exists pgcrypto;

-- Role names are upper snake case only. The attendance database carried legacy
-- lowercase values ('admin', 'viewer') alongside the new ones because the roles
-- were bolted on by a later migration. A fresh database has no reason to keep
-- both casings, so every policy here matches exactly one spelling.
do $$
begin
  create type public.staff_role as enum (
    'ADMIN',
    'CONSUMPTION_MANAGER',
    'WAREHOUSE_OPERATOR',
    'AREA_PIC',
    'PICKUP_OPERATOR',
    'MANAGEMENT'
  );
exception
  when duplicate_object then null;
end $$;

-- Profiles are provisioned by an admin, not auto-created on signup. A signed-in
-- user with no profile row therefore has no role and no data access at all,
-- which keeps an accidental public signup from reading operational data.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  description text,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'completed')),
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_events_code_unique
  on public.events(code)
  where code is not null;

create unique index if not exists idx_events_single_active
  on public.events((status))
  where status = 'active';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

-- Role helpers.
--
-- These are security definer so they can read profiles without tripping the
-- policies defined on profiles itself: the owner bypasses RLS, so there is no
-- policy recursion. The `is_active` filter means deactivating a staff member
-- revokes every policy and RPC check immediately, without touching their row's
-- role or their auth user.
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;

create or replace function public.current_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role()::text
$$;

revoke all on function public.current_role_text() from public;
grant execute on function public.current_role_text() to authenticated;

create or replace function public.has_consumption_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_text() = any(p_roles), false)
$$;

revoke all on function public.has_consumption_role(text[]) from public;
grant execute on function public.has_consumption_role(text[]) to authenticated;

-- Callers with no auth.uid() (service_role, SQL editor, cron) pass the role
-- gate so maintenance and seeding still work. That is only safe because the
-- consumption RPCs are granted to `authenticated` and never to `anon`.
create or replace function public.assert_consumption_role(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not public.has_consumption_role(p_roles) then
    raise exception 'insufficient permission' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_consumption_role(text[]) from public;
grant execute on function public.assert_consumption_role(text[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;

-- Every signed-in user may read their own profile. The proxy and the client
-- both resolve the current role through this policy, so removing it locks the
-- whole app out even for admins.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all
on public.profiles
for all
to authenticated
using (public.current_role_text() = 'ADMIN')
with check (public.current_role_text() = 'ADMIN');

drop policy if exists events_select_staff on public.events;
create policy events_select_staff
on public.events
for select
to authenticated
using (public.current_staff_role() is not null);

drop policy if exists events_write_manager on public.events;
create policy events_write_manager
on public.events
for all
to authenticated
using (public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER'))
with check (public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER'));

revoke all on table public.profiles from anon;
revoke all on table public.events from anon;
