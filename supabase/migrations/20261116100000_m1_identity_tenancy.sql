-- M1: identity, tenancy, audit, RLS helpers (DATABASE_SCHEMA.md section 6, PRD 4.1/4.2, CLAUDE.md section 6).
--
-- Security posture established here and relied on by every later migration:
--   * New tables/sequences/functions are CLOSED to anon/authenticated by default (spike finding: Supabase's
--     default grants are open, including TRUNCATE). Each migration grants exactly what it needs.
--   * Every tenant table: ENABLE + FORCE row level security; authenticated gets SELECT only; writes go
--     through SECURITY DEFINER functions that check authorization themselves (AD-1).
--   * No hard deletes of business records (no DELETE grant or policy; foreign keys are RESTRICT).
--
-- ROLLBACK NOTE (never run on production data without a verified backup; expand/contract applies):
--   drop trigger on_auth_user_created on auth.users; drop function private.handle_new_user();
--   drop table audit_logs, platform_admins, business_members, businesses, profiles; drop schema private cascade;

-- ---------------------------------------------------------------- closed-by-default privileges
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- PUBLIC (which includes anon) receives EXECUTE on new functions unless removed globally for this role.
alter default privileges for role postgres revoke execute on functions from public;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- shared trigger functions
create function private.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create function private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is insert-only', tg_table_name using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- profiles ("users", PRD section 6)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone_e164  text check (phone_e164 ~ '^\+?[0-9]{7,15}$'),   -- contact field only, not a login identity (Z-2)
  email       text check (email is null or char_length(email) <= 254),
  locale      text not null default 'en' check (locale in ('en', 'ny', 'fr')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_row();

-- Every auth user gets a profile. Google supplies full_name or name in the user metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- businesses (workspace = businesses.id)
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),     -- client-generated for offline creation (AD-3)
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  owner_name    text not null check (char_length(btrim(owner_name)) between 1 and 120),
  phone         text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  email         text check (email is null or char_length(email) <= 254),
  location      text not null check (char_length(btrim(location)) between 1 and 200),
  country       char(2) not null default 'MW' check (country ~ '^[A-Z]{2}$'),
  currency      char(3) not null default 'MWK',                  -- FK to currencies added in M2
  business_type text not null check (char_length(btrim(business_type)) between 1 and 60),
  timezone      text not null default 'Africa/Blantyre',
  logo_path     text,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1,
  archived_at   timestamptz,
  archived_by   uuid references public.profiles (id)
);
create trigger businesses_touch before update on public.businesses for each row execute function private.touch_row();

-- ---------------------------------------------------------------- membership
create table public.business_members (
  workspace_id uuid not null references public.businesses (id),
  user_id      uuid not null references public.profiles (id),
  role         text not null check (role in ('owner', 'staff')),
  permissions  jsonb not null default '{}' check (jsonb_typeof(permissions) = 'object'),
  status       text not null default 'active' check (status in ('active', 'removed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  primary key (workspace_id, user_id)
);
-- exactly one active owner per workspace
create unique index business_members_one_active_owner on public.business_members (workspace_id)
  where role = 'owner' and status = 'active';
create index business_members_user_idx on public.business_members (user_id) where status = 'active';
create trigger business_members_touch before update on public.business_members for each row execute function private.touch_row();

-- ---------------------------------------------------------------- platform administrators (no tenant access)
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit log (insert-only, redacted diffs)
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.businesses (id),
  actor_id     uuid references public.profiles (id),
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  diff         jsonb not null default '{}',        -- never holds measurements, phone numbers, tokens (SECURITY.md section 7)
  created_at   timestamptz not null default now(),
  unique (workspace_id, id)
);
create index audit_logs_workspace_time_idx on public.audit_logs (workspace_id, created_at desc);
create trigger audit_logs_no_update_delete before update or delete on public.audit_logs
  for each row execute function private.reject_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.reject_mutation();

create function private.write_audit(p_workspace uuid, p_actor uuid, p_action text, p_entity text, p_entity_id uuid, p_diff jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_logs (workspace_id, actor_id, action, entity, entity_id, diff)
  values (p_workspace, p_actor, p_action, p_entity, p_entity_id, coalesce(p_diff, '{}'));
$$;

-- ---------------------------------------------------------------- RLS helpers (SECURITY.md section 2)
create function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'active');
$$;

-- owners hold every permission; staff hold only keys set to true in permissions
create function private.has_permission(ws uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'owner' or m.permissions -> perm = 'true'::jsonb));
$$;
revoke all on function private.is_member(uuid), private.has_permission(uuid, text) from public, anon;
grant execute on function private.is_member(uuid), private.has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------- RLS: enable + force, explicit minimal grants
alter table public.profiles         enable row level security;  alter table public.profiles         force row level security;
alter table public.businesses       enable row level security;  alter table public.businesses       force row level security;
alter table public.business_members enable row level security;  alter table public.business_members force row level security;
alter table public.platform_admins  enable row level security;  alter table public.platform_admins  force row level security;
alter table public.audit_logs       enable row level security;  alter table public.audit_logs       force row level security;

revoke all on public.profiles, public.businesses, public.business_members, public.platform_admins, public.audit_logs
  from anon, authenticated;
grant select on public.profiles, public.businesses, public.business_members, public.audit_logs to authenticated;
-- platform_admins: no grants, no policies. Not readable through the API.

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy businesses_select_member on public.businesses for select to authenticated
  using ((select private.is_member(id)));
create policy members_select on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission(workspace_id, 'members.manage')));
create policy audit_select_authorised on public.audit_logs for select to authenticated
  using ((select private.has_permission(workspace_id, 'audit.view')));
