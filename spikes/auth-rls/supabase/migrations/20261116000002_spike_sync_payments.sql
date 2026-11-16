-- SPIKE ONLY: idempotent, append-only payments with row-lock serialisation (PRD 4.9, 5.4; R-2).
create table public.orders (
  id uuid primary key,
  business_id uuid not null references public.businesses(id),
  customer_id uuid not null references public.customers(id),
  total_minor bigint not null check (total_minor >= 0),
  currency text not null default 'MWK',
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create table public.payments (
  id uuid primary key,
  op_id uuid not null unique,                    -- idempotency key from the device outbox
  business_id uuid not null,
  order_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0),
  kind text not null default 'payment' check (kind in ('payment','refund')),
  needs_review boolean not null default false,   -- R-2: overpaid via sync collision
  recorded_at timestamptz not null default now(),
  foreign key (order_id, business_id) references public.orders(id, business_id)
);
alter table public.orders enable row level security; alter table public.orders force row level security;
alter table public.payments enable row level security; alter table public.payments force row level security;
create policy ord_select on public.orders for select to authenticated using (public.is_member(business_id));
create policy pay_select on public.payments for select to authenticated using (public.is_member(business_id));

create function public.create_order(p_id uuid, p_business uuid, p_customer uuid, p_total bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(p_business) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.orders(id,business_id,customer_id,total_minor) values (p_id,p_business,p_customer,p_total)
    on conflict (id) do nothing;
  return p_id;
end $$;

create function public.record_payment(p_op uuid, p_payment uuid, p_order uuid, p_amount bigint, p_from_sync boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; paid bigint; existing public.payments; flag boolean := false;
begin
  select * into o from public.orders where id = p_order for update;           -- serialises concurrent payments per order
  if not found or not public.is_member(o.business_id) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into existing from public.payments where op_id = p_op;
  if found then return jsonb_build_object('status','duplicate','payment_id',existing.id); end if;  -- safe replay
  if p_amount <= 0 then raise exception 'invalid amount' using errcode='22023'; end if;
  select coalesce(sum(amount_minor),0) into paid from public.payments where order_id = p_order;
  if paid + p_amount > o.total_minor then
    if not p_from_sync then raise exception 'overpayment rejected' using errcode='22023'; end if;
    flag := true;                                                              -- offline collision: record + flag, never drop
  end if;
  insert into public.payments(id,op_id,business_id,order_id,amount_minor,needs_review)
    values (p_payment,p_op,o.business_id,p_order,p_amount,flag);
  return jsonb_build_object('status', case when flag then 'overpaid_needs_review' else 'recorded' end,'payment_id',p_payment);
end $$;

create view public.order_financials with (security_invoker = true) as
  select o.id as order_id, o.business_id, o.total_minor,
         coalesce(sum(p.amount_minor),0) as paid_minor,
         o.total_minor - coalesce(sum(p.amount_minor),0) as balance_minor
  from public.orders o left join public.payments p on p.order_id = o.id
  group by o.id;

revoke all on function public.create_order(uuid,uuid,uuid,bigint), public.record_payment(uuid,uuid,uuid,bigint,boolean) from public, anon;
grant execute on function public.create_order(uuid,uuid,uuid,bigint), public.record_payment(uuid,uuid,uuid,bigint,boolean) to authenticated;
-- FINDING: Supabase default privileges grant ALL (incl. TRUNCATE) on new public tables to anon/authenticated.
-- Revoke explicitly so RLS is not the only barrier. Every product migration must do this.
revoke all on public.orders, public.payments, public.order_financials from anon, authenticated;
grant select on public.orders, public.payments, public.order_financials to authenticated;
