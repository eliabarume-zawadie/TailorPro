-- Cross-tenant isolation (PRD 4.2, CLAUDE.md section 6). Real Postgres, running as the `authenticated` role.
-- A = owner of business A, B = owner of business B, C = staff in A, D = platform admin (no tenant access).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test', '{"full_name":"Alice Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test', '{"full_name":"Bob Owner"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.test', '{"full_name":"Carol Staff"}'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.test', '{"full_name":"Dan Admin"}');

-- profiles are created automatically from auth.users
select is((select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice Owner',
  'profile auto-created from auth user metadata');

-- register two businesses through the only supported path
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Tailors', 'Alice Owner', '+265999000001', null, 'Lilongwe', 'MW', 'MWK', 'tailor');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.create_business('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Tailors', 'Bob Owner', '+265999000002', null, 'Blantyre', 'MW', 'MWK', 'tailor');
reset role;

-- staff C joins A with no extra permissions; D becomes platform admin
insert into public.business_members (workspace_id, user_id, role, permissions)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', '{}');
insert into public.platform_admins (user_id) values ('44444444-4444-4444-4444-444444444444');

-- ===== A acts =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.businesses), 1, 'A sees exactly one business');
select is((select count(*)::int from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'A cannot read B business');
select is((select count(*)::int from public.business_members where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'A cannot read B members');
select is((select count(*)::int from public.subscriptions where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'A cannot read B subscription');
select is((select count(*)::int from public.audit_logs where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'A cannot read B audit logs');
select cmp_ok((select count(*)::int from public.audit_logs where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), '>=', 1, 'A owner can read own audit logs');
select is((select count(*)::int from public.profiles), 1, 'A sees only own profile');

select throws_ok($$update public.businesses set name = 'hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$, '42501', null, 'A cannot UPDATE B business directly');
select throws_ok($$update public.businesses set name = 'hacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'A cannot UPDATE own business directly either (functions only)');
select throws_ok($$delete from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$, '42501', null, 'A cannot DELETE B business');
select throws_ok($$insert into public.businesses (name, owner_name, phone, location, business_type, created_by) values ('x','x','+265999','x','x','11111111-1111-1111-1111-111111111111')$$, '42501', null, 'A cannot INSERT a business directly');
select throws_ok($$insert into public.business_members (workspace_id, user_id, role) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','owner')$$, '42501', null, 'A cannot add self to B');
select throws_ok($$update public.business_members set role = 'owner' where user_id = '33333333-3333-3333-3333-333333333333'$$, '42501', null, 'A cannot escalate a member via direct UPDATE');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'A cannot DELETE audit logs');
select throws_ok($$truncate public.businesses$$, '42501', null, 'A cannot TRUNCATE businesses');
select throws_ok($$select public.update_business('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'hacked', 'x', '+265999000009', null, 'x', 'tailor')$$, '42501', null, 'A cannot call update_business on B');
reset role;

-- ===== C (staff of A, no permissions) =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.businesses), 1, 'staff sees the business they belong to');
select is((select count(*)::int from public.audit_logs), 0, 'staff without audit.view cannot read audit logs');
select is((select count(*)::int from public.business_members), 1, 'staff sees only own membership row, not the owner row');
select throws_ok($$select public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'staff edit', 'x', '+265999000009', null, 'x', 'tailor')$$, '42501', null, 'staff without settings.manage cannot update the business');
reset role;

-- removing membership revokes access immediately
update public.business_members set status = 'removed' where user_id = '33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.businesses), 0, 'removed member immediately loses access to the business');
reset role;

-- ===== D (platform admin) has no automatic tenant access =====
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.businesses), 0, 'platform admin cannot read any business');
select is((select count(*)::int from public.audit_logs), 0, 'platform admin cannot read audit logs');
select throws_ok($$select count(*) from public.platform_admins$$, '42501', null, 'platform_admins is not readable through the API');
reset role;

-- ===== anon =====
set local role anon;
select throws_ok($$select count(*) from public.businesses$$, '42501', null, 'anon cannot read businesses');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon cannot read profiles');
reset role;

-- ===== structural rules enforced by the database itself =====
select throws_ok($$insert into public.business_members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','owner')$$,
  '23505', null, 'a workspace cannot have two active owners');
select throws_ok($$update public.audit_logs set action = 'tampered'$$, '42501', null, 'audit_logs is insert-only (UPDATE rejected even for the table owner)');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'audit_logs is insert-only (DELETE rejected even for the table owner)');
select throws_ok($$truncate public.audit_logs$$, '42501', null, 'audit_logs is insert-only (TRUNCATE rejected even for the table owner)');
select throws_ok($$delete from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '23503', null, 'a business with members cannot be hard-deleted');

select * from finish();
rollback;
