-- M3: the write API for Phase 1 (AD-1): create_business, update_business, update_profile.
--
-- These are SECURITY DEFINER because the `authenticated` role has no write grants on tenant tables.
-- Because they bypass RLS, each one performs its OWN authorization first (caller identity from the JWT via
-- auth.uid(), membership/permission via private.has_permission) and pins search_path to empty.
-- Validation lives here, not only in the UI (CLAUDE.md section 5). Error codes: 28000 not authenticated,
-- 42501 forbidden, 22023 invalid input, PT409 stale version (concurrent edit; PostgREST returns HTTP 409).
--
-- ROLLBACK NOTE: drop function public.create_business, public.update_business, public.update_profile,
--   private.require_text, private.normalise_phone, private.normalise_email;

create function private.require_text(val text, field text, maxlen integer) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(val);
begin
  if t is null or t = '' then
    raise exception '% is required', field using errcode = '22023';
  end if;
  if char_length(t) > maxlen then
    raise exception '% is too long (maximum % characters)', field, maxlen using errcode = '22023';
  end if;
  return t;
end $$;

-- strips spaces, hyphens and parentheses; accepts an optional leading + and 7 to 15 digits
create function private.normalise_phone(val text, field text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := regexp_replace(coalesce(val, ''), '[\s\-()]', '', 'g');
begin
  if t !~ '^\+?[0-9]{7,15}$' then
    raise exception '% must be a phone number with 7 to 15 digits', field using errcode = '22023';
  end if;
  return t;
end $$;

-- optional: null or blank means "no email"
create function private.normalise_email(val text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(val, ''));
begin
  if t = '' then return null; end if;
  if char_length(t) > 254 or t !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email is not valid' using errcode = '22023';
  end if;
  return lower(t);
end $$;

-- ---------------------------------------------------------------- create_business
-- The client-generated workspace id is the idempotency key: replaying a registration (lost response, retry,
-- offline outbox) by the same user returns the same workspace and writes nothing twice. Another user
-- presenting an existing id is refused without revealing anything about it.
create function public.create_business(
  p_id uuid, p_name text, p_owner_name text, p_phone text, p_email text,
  p_location text, p_country text, p_currency text, p_business_type text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_name text; v_owner text; v_phone text; v_email text; v_location text; v_country text; v_currency text; v_type text;
  v_plan uuid; v_created uuid; v_creator uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_id is null then raise exception 'workspace id is required' using errcode = '22023'; end if;

  v_name     := private.require_text(p_name, 'business name', 120);
  v_owner    := private.require_text(p_owner_name, 'owner name', 120);
  v_phone    := private.normalise_phone(p_phone, 'phone');
  v_email    := private.normalise_email(p_email);
  v_location := private.require_text(p_location, 'location', 200);
  v_type     := private.require_text(p_business_type, 'business type', 60);
  v_country  := upper(btrim(coalesce(p_country, '')));
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'country must be a 2-letter ISO code' using errcode = '22023';
  end if;
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if not exists (select 1 from public.currencies c where c.code = v_currency and c.enabled) then
    raise exception 'currency is not enabled' using errcode = '22023';
  end if;

  insert into public.businesses (id, name, owner_name, phone, email, location, country, currency, business_type, created_by)
  values (p_id, v_name, v_owner, v_phone, v_email, v_location, v_country, v_currency, v_type, uid)
  on conflict (id) do nothing
  returning id into v_created;

  if v_created is null then
    -- id already exists: idempotent replay by the creator, otherwise refuse
    select b.created_by into v_creator from public.businesses b where b.id = p_id;
    if v_creator = uid then return p_id; end if;
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.business_members (workspace_id, user_id, role) values (p_id, uid, 'owner');

  select sp.id into v_plan from public.subscription_plans sp where sp.code = 'free' and sp.active;
  if v_plan is null then raise exception 'free plan is not configured'; end if;
  insert into public.subscriptions (workspace_id, plan_id, status, current_period_start)
  values (p_id, v_plan, 'active', now());

  -- audit diff holds no phone or email (SECURITY.md section 7)
  perform private.write_audit(p_id, uid, 'business.created', 'business', p_id, jsonb_build_object('name', v_name));
  return p_id;
end $$;

-- ---------------------------------------------------------------- update_business
-- Optimistic concurrency: the caller states the version it read; a stale version is rejected, never merged silently.
-- Currency, country and timezone are not editable here (currency is fixed per business, Decision N).
create function public.update_business(
  p_id uuid, p_expected_version integer, p_name text, p_owner_name text, p_phone text, p_email text,
  p_location text, p_business_type text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_name text; v_owner text; v_phone text; v_email text; v_location text; v_type text;
  old public.businesses; changed text[] := '{}'; new_version integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_id is null or not private.has_permission(p_id, 'settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_name     := private.require_text(p_name, 'business name', 120);
  v_owner    := private.require_text(p_owner_name, 'owner name', 120);
  v_phone    := private.normalise_phone(p_phone, 'phone');
  v_email    := private.normalise_email(p_email);
  v_location := private.require_text(p_location, 'location', 200);
  v_type     := private.require_text(p_business_type, 'business type', 60);

  select * into old from public.businesses b where b.id = p_id for update;
  if old.version is distinct from p_expected_version then
    raise exception 'version conflict: the business was changed by someone else' using errcode = 'PT409';
  end if;

  if old.name is distinct from v_name then changed := array_append(changed, 'name'); end if;
  if old.owner_name is distinct from v_owner then changed := array_append(changed, 'owner_name'); end if;
  if old.phone is distinct from v_phone then changed := array_append(changed, 'phone'); end if;
  if old.email is distinct from v_email then changed := array_append(changed, 'email'); end if;
  if old.location is distinct from v_location then changed := array_append(changed, 'location'); end if;
  if old.business_type is distinct from v_type then changed := array_append(changed, 'business_type'); end if;

  update public.businesses b
     set name = v_name, owner_name = v_owner, phone = v_phone, email = v_email, location = v_location, business_type = v_type
   where b.id = p_id
   returning b.version into new_version;

  -- field names only, never values
  perform private.write_audit(p_id, uid, 'business.updated', 'business', p_id, jsonb_build_object('changed', to_jsonb(changed)));
  return new_version;
end $$;

-- ---------------------------------------------------------------- update_profile (caller's own profile only)
create function public.update_profile(p_full_name text, p_phone text, p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_name text; v_phone text; v_locale text := coalesce(nullif(btrim(p_locale), ''), 'en');
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_name := private.require_text(p_full_name, 'full name', 120);
  if btrim(coalesce(p_phone, '')) <> '' then v_phone := private.normalise_phone(p_phone, 'phone'); end if;
  if v_locale not in ('en', 'ny', 'fr') then
    raise exception 'unsupported locale' using errcode = '22023';
  end if;
  update public.profiles set full_name = v_name, phone_e164 = v_phone, locale = v_locale where id = uid;
  if not found then raise exception 'profile not found' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- the approved API surface
revoke all on function
  public.create_business(uuid, text, text, text, text, text, text, text, text),
  public.update_business(uuid, integer, text, text, text, text, text, text),
  public.update_profile(text, text, text)
  from public, anon;
grant execute on function
  public.create_business(uuid, text, text, text, text, text, text, text, text),
  public.update_business(uuid, integer, text, text, text, text, text, text),
  public.update_profile(text, text, text)
  to authenticated;
