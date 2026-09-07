-- Run on Nexastore (mapswtriwoxlscjdakpk)
-- Safe to re-run: drops policies first

-- Affiliates accounts
create table if not exists public.affiliates (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  email text,
  code text,
  code_expires_at timestamptz,
  payout_wallet text,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.affiliates enable row level security;
drop policy if exists "affiliates_select_auth" on public.affiliates;
drop policy if exists "affiliates_insert_own" on public.affiliates;
drop policy if exists "affiliates_update_auth" on public.affiliates;
create policy "affiliates_select_auth" on public.affiliates for select to authenticated using (true);
create policy "affiliates_insert_own" on public.affiliates for insert to authenticated with check (auth.uid() = user_id);
create policy "affiliates_update_auth" on public.affiliates for update to authenticated using (true);

-- Optional per-app codes table
create table if not exists public.affiliate_codes (
  id bigserial primary key,
  code text not null,
  app_id uuid,
  user_id uuid references auth.users(id),
  expires_at timestamptz,
  created_at timestamptz default now()
);
alter table public.affiliate_codes enable row level security;
drop policy if exists "aff_codes_select" on public.affiliate_codes;
drop policy if exists "aff_codes_insert" on public.affiliate_codes;
create policy "aff_codes_select" on public.affiliate_codes for select to authenticated using (true);
create policy "aff_codes_insert" on public.affiliate_codes for insert to authenticated with check (auth.uid() = user_id);

-- Purchases (was missing — caused your earlier error)
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
create policy "purchases_select_own" on public.purchases for select to authenticated using (true);
create policy "purchases_insert_own" on public.purchases for insert to authenticated with check (true);
