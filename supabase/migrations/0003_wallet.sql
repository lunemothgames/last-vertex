-- Paid gems and purchases (IAP-PLAN.md step 1). Paid gems never live in saves.data: only server code changes them.
-- Free gems stay in the device save. Players can only READ their own rows here; every write goes through the
-- functions below. grant_purchase / refund_purchase are for the purchase webhook (service role) only.

-- what each store product gives; the webhook only sends the product id, the amounts are decided here
create table public.products (
  id        text primary key,               -- Play product id
  gems      int     not null default 0 check (gems >= 0),
  ad_pass   boolean not null default false,
  starter   boolean not null default false
);
insert into public.products (id, gems, ad_pass, starter) values
  ('gems_100',      100, false, false),
  ('gems_550',      550, false, false),
  ('gems_1200',    1200, false, false),
  ('ad_pass',         0, true,  false),
  ('starter_pack',  300, false, true);

create table public.wallet (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  paid_gems   bigint      not null default 0,  -- may go below zero after a refund; spending is blocked until positive
  updated_at  timestamptz not null default now()
);

create table public.entitlements (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  ad_pass         boolean     not null default false,
  starter_bought  boolean     not null default false,
  updated_at      timestamptz not null default now()
);

-- one row per store transaction: the unique id makes a grant happen at most once, however often the webhook repeats
create table public.purchases (
  tx_id        text primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  product_id   text        not null references public.products(id),
  gems         int         not null,          -- copied from products at grant time
  status       text        not null default 'granted' check (status in ('granted','refunded')),
  created_at   timestamptz not null default now(),
  refunded_at  timestamptz
);
create index purchases_user on public.purchases(user_id);

alter table public.products     enable row level security;
alter table public.wallet       enable row level security;
alter table public.entitlements enable row level security;
alter table public.purchases    enable row level security;

grant select on public.products, public.wallet, public.entitlements, public.purchases to authenticated;
create policy "products: read"         on public.products     for select to authenticated using (true);
create policy "own wallet: read"       on public.wallet       for select to authenticated using (auth.uid() = user_id);
create policy "own entitlements: read" on public.entitlements for select to authenticated using (auth.uid() = user_id);
create policy "own purchases: read"    on public.purchases    for select to authenticated using (auth.uid() = user_id);

-- spend n paid gems; atomic, never below zero. Returns the new balance.
create or replace function public.spend_paid(n int) returns bigint
language plpgsql security definer set search_path = '' as $$
declare left_ bigint;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if n is null or n <= 0 then raise exception 'bad amount'; end if;
  update public.wallet set paid_gems = paid_gems - n, updated_at = now()
    where user_id = auth.uid() and paid_gems >= n
    returning paid_gems into left_;
  if not found then raise exception 'not enough gems'; end if;
  return left_;
end $$;

-- credit one store transaction. Repeating the same tx_id changes nothing. Returns true if this call granted it.
create or replace function public.grant_purchase(p_tx text, p_user uuid, p_product text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare pr public.products%rowtype;
begin
  select * into pr from public.products where id = p_product;
  if not found then raise exception 'unknown product %', p_product; end if;
  insert into public.purchases (tx_id, user_id, product_id, gems) values (p_tx, p_user, p_product, pr.gems)
    on conflict (tx_id) do nothing;
  if not found then return false; end if;
  if pr.gems > 0 then
    insert into public.wallet (user_id, paid_gems) values (p_user, pr.gems)
      on conflict (user_id) do update set paid_gems = public.wallet.paid_gems + excluded.paid_gems, updated_at = now();
  end if;
  if pr.ad_pass or pr.starter then
    insert into public.entitlements (user_id, ad_pass, starter_bought) values (p_user, pr.ad_pass, pr.starter)
      on conflict (user_id) do update set
        ad_pass        = public.entitlements.ad_pass or excluded.ad_pass,
        starter_bought = public.entitlements.starter_bought or excluded.starter_bought,
        updated_at     = now();
  end if;
  return true;
end $$;

-- undo a granted transaction (refund / chargeback). Repeats and unknown ids change nothing. Returns true if this call refunded it.
-- starter_bought stays true after a refund so the one-time offer is not shown again.
create or replace function public.refund_purchase(p_tx text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare pu public.purchases%rowtype;
begin
  update public.purchases set status = 'refunded', refunded_at = now()
    where tx_id = p_tx and status = 'granted'
    returning * into pu;
  if not found then return false; end if;
  if pu.gems > 0 then
    update public.wallet set paid_gems = paid_gems - pu.gems, updated_at = now() where user_id = pu.user_id;
  end if;
  if pu.product_id = 'ad_pass' then
    update public.entitlements set ad_pass = false, updated_at = now() where user_id = pu.user_id;
  end if;
  return true;
end $$;

revoke all on function public.spend_paid(int) from public, anon;
grant execute on function public.spend_paid(int) to authenticated;
revoke all on function public.grant_purchase(text, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_purchase(text) from public, anon, authenticated;
grant execute on function public.grant_purchase(text, uuid, text) to service_role;
grant execute on function public.refund_purchase(text) to service_role;

-- delete_my_account() needs no change: deleting the auth user cascades to wallet, entitlements and purchases.
