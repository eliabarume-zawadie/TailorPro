-- Catalog-level security tests (SECURITY.md section 2, spike finding: Supabase default grants are open).
-- These fail the build if any table, grant, or function is more permissive than intended.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- 1. Expected Phase 1 tables exist
select has_table('public', t, t || ' exists')
from unnest(array['profiles','businesses','business_members','platform_admins','audit_logs',
                  'currencies','subscription_plans','subscriptions','platform_settings']) as t;

-- 2. RLS enabled AND forced on every public table
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'every public table has RLS enabled and forced');

-- 3. anon has no table privileges at all in public
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0, 'anon has no privileges on public tables');

-- 4. authenticated has SELECT only (all writes go through functions, AD-1); never TRUNCATE/DELETE/INSERT/UPDATE
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  0, 'authenticated has SELECT only on public tables');

-- 5. platform_admins is invisible to API roles
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'platform_admins' and grantee in ('anon','authenticated')),
  0, 'platform_admins has no API-role grants');

-- 6. Default privileges: a table created later is closed to API roles until explicitly granted
create table public._grant_probe (id int);
select ok(not has_table_privilege('anon', 'public._grant_probe', 'SELECT'), 'new table: anon cannot SELECT by default');
select ok(not has_table_privilege('authenticated', 'public._grant_probe', 'SELECT'), 'new table: authenticated cannot SELECT by default');
select ok(not has_table_privilege('authenticated', 'public._grant_probe', 'TRUNCATE'), 'new table: authenticated cannot TRUNCATE by default');
create function public._exec_probe() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public._exec_probe()', 'EXECUTE'), 'new function: anon cannot EXECUTE by default');
select ok(not has_function_privilege('authenticated', 'public._exec_probe()', 'EXECUTE'), 'new function: authenticated cannot EXECUTE by default');

-- 7. Public functions: anon can execute none; authenticated only the approved API surface
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not like '\_%' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon can execute no public functions');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not like '\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  array['create_business','update_business','update_profile'],
  'authenticated can execute exactly the approved functions');

-- 8. private schema is not reachable by anon
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on schema private');

-- 9. SECURITY DEFINER functions in public pin an empty search_path
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef
      and not coalesce(p.proconfig, '{}') @> array['search_path='] and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  0, 'all SECURITY DEFINER functions pin search_path to empty');

select * from finish();
rollback;
