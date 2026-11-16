-- Registration and update functions (PRD 4.1, AD-1): validation, idempotency, authorization, versioning.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test', '{"full_name":"Alice Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test', '{"full_name":"Bob Other"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.test', '{"full_name":"Carol Staff"}');

-- ===== unauthenticated callers =====
set local role anon;
select throws_ok($$select public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','X','X','+265999000001',null,'L','MW','MWK','tailor')$$,
  '42501', null, 'anon cannot call create_business');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','X','X','+265999000001',null,'L','MW','MWK','tailor')$$,
  '28000', null, 'authenticated role without a user id is rejected');
reset role;

-- ===== A registers =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is(public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Tailors', 'Alice Owner', '+265 999-000 001', 'alice@example.test', 'Area 3, Lilongwe', 'MW', 'MWK', 'tailor'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'create_business returns the workspace id');

select is((select phone from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), '+265999000001', 'phone is normalised');
select is((select currency || '/' || country || '/' || timezone || '/' || status from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'MWK/MW/Africa/Blantyre/active', 'defaults: MWK, MW, Africa/Blantyre, active');
select is((select role || '/' || status from public.business_members where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = '11111111-1111-1111-1111-111111111111'),
  'owner/active', 'creator becomes active owner');
select is((select p.code || '/' || s.status from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'free/active', 'new workspace starts on the free plan');
select is((select count(*)::int from public.audit_logs where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and action = 'business.created'), 1, 'creation is audited');
select ok(not exists (select 1 from public.audit_logs where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and diff::text like '%999%'), 'audit diff does not contain phone numbers');

-- idempotent replay (client UUID is the idempotency key, SYNC_DESIGN)
select is(public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Tailors', 'Alice Owner', '+265999000001', 'alice@example.test', 'Area 3, Lilongwe', 'MW', 'MWK', 'tailor'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'replaying the same registration returns the same id');
select is((select count(*)::int from public.businesses), 1, 'replay creates no second business');
select is((select count(*)::int from public.business_members), 1, 'replay creates no second membership');
select is((select count(*)::int from public.subscriptions), 1, 'replay creates no second subscription');
select is((select count(*)::int from public.audit_logs where action = 'business.created'), 1, 'replay writes no second audit entry');
reset role;

-- another user replaying A's id is rejected and changes nothing
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Hijack','Bob','+265999000002',null,'L','MW','MWK','tailor')$$,
  '42501', null, 'another user cannot claim an existing workspace id');
reset role;
select is((select name from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'A Tailors', 'hijack attempt changed nothing');

-- ===== validation (each must reject with invalid_parameter_value) =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_business(gen_random_uuid(),'','Bob','+265999000002',null,'L','MW','MWK','tailor')$$, '22023', null, 'empty business name rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'   ','Bob','+265999000002',null,'L','MW','MWK','tailor')$$, '22023', null, 'blank business name rejected');
select throws_ok(format($$select public.create_business(gen_random_uuid(),%L,'Bob','+265999000002',null,'L','MW','MWK','tailor')$$, repeat('x', 121)), '22023', null, 'over-long business name rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','','+265999000002',null,'L','MW','MWK','tailor')$$, '22023', null, 'empty owner name rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','not-a-phone',null,'L','MW','MWK','tailor')$$, '22023', null, 'invalid phone rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','+265999000002','no-at-sign','L','MW','MWK','tailor')$$, '22023', null, 'invalid email rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','+265999000002',null,'','MW','MWK','tailor')$$, '22023', null, 'empty location rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','+265999000002',null,'L','malawi','MWK','tailor')$$, '22023', null, 'country must be a 2-letter ISO code');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','+265999000002',null,'L','MW','USD','tailor')$$, '22023', null, 'currency that is not enabled rejected');
select throws_ok($$select public.create_business(gen_random_uuid(),'B','Bob','+265999000002',null,'L','MW','MWK','')$$, '22023', null, 'empty business type rejected');
select throws_ok($$select public.create_business(NULL,'B','Bob','+265999000002',null,'L','MW','MWK','tailor')$$, '22023', null, 'missing workspace id rejected');
select is((select count(*)::int from public.businesses), 0, 'no business exists for B after rejected attempts');
-- script-like input is stored as inert text, never interpreted
select lives_ok($$select public.create_business('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '<script>alert(1)</script>', 'Bob', '+265999000002', null, 'L', 'MW', 'MWK', 'tailor')$$, 'markup in the name is accepted as plain text');
select is((select name from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), '<script>alert(1)</script>', 'markup is stored verbatim (escaping is the UI job, tested in the app)');
reset role;

-- ===== update_business: permission + optimistic version =====
insert into public.business_members (workspace_id, user_id, role, permissions)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', '{}');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'A Tailors & Sons', 'Alice Owner', '+265999000001', null, 'Area 3, Lilongwe', 'tailor'), 2,
  'owner update with the current version succeeds and returns the new version');
select is((select name from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'A Tailors & Sons', 'update applied');
select is((select email from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), null, 'optional email can be cleared');
select throws_ok($$select public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'stale write', 'Alice Owner', '+265999000001', null, 'Area 3, Lilongwe', 'tailor')$$,
  'PT409', null, 'stale version is rejected (concurrent edit)');
select is((select name from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'A Tailors & Sons', 'stale write changed nothing');
select throws_ok($$select public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, '', 'Alice Owner', '+265999000001', null, 'Area 3, Lilongwe', 'tailor')$$,
  '22023', null, 'update validates input too');
select is((select count(*)::int from public.audit_logs where action = 'business.updated'), 1, 'update is audited once');
reset role;

-- staff without permission cannot; with settings.manage they can
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'staff edit', 'Alice Owner', '+265999000001', null, 'Area 3, Lilongwe', 'tailor')$$,
  '42501', null, 'staff without settings.manage is rejected');
reset role;
update public.business_members set permissions = '{"settings.manage": true}' where user_id = '33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is(public.update_business('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'Staff Edited', 'Alice Owner', '+265999000001', null, 'Area 3, Lilongwe', 'tailor'), 3,
  'staff with settings.manage may update');
reset role;

-- ===== update_profile =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.update_profile('Alice B. Owner', '+265 888 111 222', 'en')$$, 'owner updates own profile');
select is((select full_name || '/' || phone_e164 from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice B. Owner/+265888111222', 'profile updated for the caller only');
select throws_ok($$select public.update_profile('', null, 'en')$$, '22023', null, 'empty profile name rejected');
select throws_ok($$select public.update_profile('Alice', 'abc', 'en')$$, '22023', null, 'invalid profile phone rejected');
select throws_ok($$select public.update_profile('Alice', null, 'xx')$$, '22023', null, 'unsupported locale rejected');
reset role;
select is((select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'Bob Other', 'other users profiles are untouched');

-- version trigger bumps on every update
select is((select version from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 3, 'business version increments on each update');

select * from finish();
rollback;
