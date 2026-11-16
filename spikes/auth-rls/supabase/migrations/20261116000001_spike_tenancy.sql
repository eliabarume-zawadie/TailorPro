-- SPIKE ONLY: minimal tenancy + RLS to prove the pattern. Not the product schema.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.business_members (
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','staff')),
  primary key (business_id, user_id)
);
create table public.customers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  full_name text not null,
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.businesses force row level security;
alter table public.business_members force row level security;
alter table public.customers force row level security;

create function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m where m.business_id = b and m.user_id = (select auth.uid()));
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

create policy biz_select on public.businesses for select to authenticated using (public.is_member(id));
create policy mem_select on public.business_members for select to authenticated using (user_id = (select auth.uid()));
create policy cust_select on public.customers for select to authenticated using (public.is_member(business_id));
create policy cust_insert on public.customers for insert to authenticated with check (public.is_member(business_id));
create policy cust_update on public.customers for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
-- no delete policy: customers are archived, never deleted (CLAUDE.md §5)

-- Business registration is the only way to create a tenant; no direct insert grants.
create function public.register_business(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); bid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.businesses(name, created_by) values (p_name, uid) returning id into bid;
  insert into public.business_members(business_id, user_id, role) values (bid, uid, 'owner');
  return bid;
end $$;
revoke all on function public.register_business(text) from public, anon;
grant execute on function public.register_business(text) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.businesses, public.business_members to authenticated;
grant select, insert, update on public.customers to authenticated;
