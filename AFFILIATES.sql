-- Run on NexaStore Supabase (optional cloud sync for affiliates)
create table if not exists public.affiliates (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  email text,
  code text unique not null,
  payout_wallet text,
  status text default 'pending',
  created_at timestamptz default now()
);
create index if not exists affiliates_status on public.affiliates (status);
alter table public.affiliates enable row level security;
-- Users manage their own row; tighten policies as needed for admin-only reads
