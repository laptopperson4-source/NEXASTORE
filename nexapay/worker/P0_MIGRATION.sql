-- Run on the Supabase project used by NexaPay worker (orders table)

alter table public.orders add column if not exists pay_to text;
alter table public.orders add column if not exists confirmations integer;
alter table public.orders add column if not exists amount_crypto_expected numeric(18, 6);
alter table public.orders add column if not exists crypto_asset varchar(10) default 'USDT';
alter table public.orders add column if not exists blockchain_network varchar(50) default 'polygon';
alter table public.orders add column if not exists app_id text;

-- One settlement tx cannot complete two orders
create unique index if not exists orders_onramp_tx_unique
  on public.orders (onramp_transaction_id)
  where onramp_transaction_id is not null and onramp_transaction_id <> '';
