-- NexaStore managed buyer wallet (public address only — never store private keys server-side)
-- Run in Supabase SQL editor for project mapswtriwoxlscjdakpk

alter table public.profiles
  add column if not exists nexastore_wallet text;

alter table public.profiles
  add column if not exists buyer_wallet text;

comment on column public.profiles.nexastore_wallet is 'Auto-generated EVM address for NexaStore buyer wallet (public only)';
comment on column public.profiles.buyer_wallet is 'Optional alias for checkout; same as nexastore_wallet when auto-created';

-- Allow users to update their own wallet address
-- (adjust policy names if you already have equivalent rules)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'Users update own nexastore wallet'
  ) then
    create policy "Users update own nexastore wallet"
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
exception when others then
  raise notice 'Policy create skipped: %', SQLERRM;
end $$;
