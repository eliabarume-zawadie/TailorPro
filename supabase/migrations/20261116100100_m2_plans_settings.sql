-- M2: currencies, subscription plans/subscriptions skeleton, platform settings (DATABASE_SCHEMA.md section 6).
--
-- Plan limits are NOT enforced in Phase 1 (Phase 6) and the numbers are NOT approved (R-15): plans are seeded
-- with empty limits and limits_approved = false so nothing can mistake them for real limits.
-- Subscription expiry only changes status; nothing here cascades to or deletes business data (CLAUDE.md section 5.7).
--
-- ROLLBACK NOTE: alter table businesses drop constraint businesses_currency_fkey;
--   drop table subscriptions, subscription_plans, platform_settings, currencies;

create table public.currencies (
  code                char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name                text not null,
  minor_unit_exponent smallint not null check (minor_unit_exponent between 0 and 4),
  enabled             boolean not null default false
);
insert into public.currencies (code, name, minor_unit_exponent, enabled) values ('MWK', 'Malawian kwacha', 2, true);

alter table public.businesses
  add constraint businesses_currency_fkey foreign key (currency) references public.currencies (code);

create table public.platform_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  description text not null,
  updated_at  timestamptz not null default now()
);
-- Decision M / Z-7: image ceilings 5 MB and 5 per order (the per-plan default of 3 is a plan limit, Phase 6).
insert into public.platform_settings (key, value, description) values
  ('image.max_bytes', '5242880', 'Maximum size of one uploaded image, in bytes (Decision M)'),
  ('image.max_per_order', '5', 'Platform ceiling for images per order (Decision M)');

create table public.subscription_plans (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[a-z0-9_]+$'),
  name                text not null,
  limits              jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  limits_approved     boolean not null default false,         -- R-15: placeholder until the owner approves numbers
  price_minor_monthly bigint check (price_minor_monthly >= 0),
  price_minor_annual  bigint check (price_minor_annual >= 0),
  currency            char(3) not null default 'MWK' references public.currencies (code),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             integer not null default 1
);
create trigger subscription_plans_touch before update on public.subscription_plans for each row execute function private.touch_row();
-- PRD section 8 names Free, Solo and Shop; it gives no numbers. Pricing must be validated with Malawi tailors.
insert into public.subscription_plans (code, name) values ('free', 'Free'), ('solo', 'Solo'), ('shop', 'Shop');

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.businesses (id),
  plan_id              uuid not null references public.subscription_plans (id),
  status               text not null check (status in ('trialing', 'active', 'grace', 'expired', 'suspended')),
  billing_period       text check (billing_period in ('monthly', 'annual')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_ends_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  version              integer not null default 1,
  unique (workspace_id),                -- one current subscription per workspace
  unique (workspace_id, id)
);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function private.touch_row();

-- ---------------------------------------------------------------- RLS and explicit grants
alter table public.currencies          enable row level security; alter table public.currencies          force row level security;
alter table public.platform_settings   enable row level security; alter table public.platform_settings   force row level security;
alter table public.subscription_plans  enable row level security; alter table public.subscription_plans  force row level security;
alter table public.subscriptions       enable row level security; alter table public.subscriptions       force row level security;

revoke all on public.currencies, public.platform_settings, public.subscription_plans, public.subscriptions from anon, authenticated;
grant select on public.currencies, public.platform_settings, public.subscription_plans, public.subscriptions to authenticated;

-- system-wide reference data: readable by any signed-in user, writable by no API role
create policy currencies_select on public.currencies for select to authenticated using (enabled);
create policy settings_select on public.platform_settings for select to authenticated using (true);
create policy plans_select on public.subscription_plans for select to authenticated using (active);
-- a workspace's subscription is visible to its members only
create policy subscriptions_select_member on public.subscriptions for select to authenticated
  using ((select private.is_member(workspace_id)));
