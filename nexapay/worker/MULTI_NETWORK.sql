-- Optional columns for multi-network NexaPay (safe to re-run)
alter table public.orders add column if not exists network text;
alter table public.orders add column if not exists chain_id int;
alter table public.orders add column if not exists usdt_contract text;
alter table public.orders add column if not exists confirmations int default 0;
