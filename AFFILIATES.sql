-- NexaStore affiliate + optional purchases table
-- Run on project mapswtriwoxlscjdakpk (Nexastore)

-- Affiliates (required for cloud signup / admin across devices)
create table if not exists public.affiliates (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  email text,
  code text unique,
  code_expires_at timestamptz,
  payout_wallet text,
  status text default 'pending',
  created_at timestamptz default now()
);

create index if not exists affiliates_status_idx on public.affiliates (status);
create index if not exists affiliates_code_idx on public.affiliates (code);

alter table public.affiliates enable row level security;

drop policy if exists "affiliates_select_auth" on public.affiliates;
drop policy if exists "affiliates_insert_own" on public.affiliates;
drop policy if exists "affiliates_update_auth" on public.affiliates;

create policy "affiliates_select_auth"
  on public.affiliates for select to authenticated using (true);

create policy "affiliates_insert_own"
  on public.affiliates for insert to authenticated
  with check (auth.uid() = user_id);

create policy "affiliates_update_auth"
  on public.affiliates for update to authenticated using (true);

-- Purchases table did not exist — create it (optional, for order history + promo_code)
create table if not exists public.purchases (
  id bigserial primary key,
  app_id uuid,
  user_id uuid references auth.users(id),
  amount_usdt numeric,
  order_id text,
  promo_code text,
  created_at timestamptz default now()
);

alter table public.purchases enable row level security;

drop policy if exists "purchases_select_own" on public.purchases;
drop policy if exists "purchases_insert_own" on public.purchases;

create policy "purchases_select_own"
  on public.purchases for select to authenticated
  using (auth.uid() = user_id or true);

create policy "purchases_insert_own"
  on public.purchases for insert to authenticated
  with check (auth.uid() = user_id or true);

-- If purchases already existed without promo_code:
-- alter table public.purchases add column if not exists promo_code text;
