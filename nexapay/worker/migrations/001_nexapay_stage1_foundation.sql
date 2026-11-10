-- =============================================================================
-- NexaPay Stage 1 — Database foundation (ADDITIVE ONLY)
-- Product: NexaPay | Parent: NexaPulse
--
-- SAFETY
--   • Does NOT drop, rename, truncate, or alter legacy public.orders data.
--   • Does NOT enable real-money execution (schema + RLS only).
--   • Never stores private keys, seed phrases, PAN, or CVV.
--
-- HOW TO APPLY (owner)
--   1. Supabase Dashboard → SQL Editor (NexaPay project or shared project).
--   2. Review this file, then Run.
--   3. Confirm tables exist; keep service_role on the Cloudflare Worker only.
--
-- LIVE ACCESS NOTE
--   This migration was written from repo schema + Stage 1 brief. Live DB was
--   not inspected. If objects already exist with different shapes, resolve
--   conflicts manually before re-running.
-- =============================================================================

create extension if not exists "pgcrypto";

create schema if not exists nexapay;

-- -----------------------------------------------------------------------------
-- Enums (create if missing)
-- -----------------------------------------------------------------------------
do $$ begin
  create type nexapay.payment_intent_status as enum (
    'CREATED',
    'VALIDATING',
    'AWAITING_AUTHORIZATION',
    'AUTHORIZED',
    'EXECUTING',
    'SUBMITTED',
    'CONFIRMING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REQUIRES_ACTION',
    'REVIEW_REQUIRED',
    'REORGED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.payment_attempt_status as enum (
    'CREATED',
    'PREPARING',
    'SUBMITTED',
    'CONFIRMING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'REPLACED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.execution_mode as enum (
    'CUSTOMER_PAID',
    'SPONSORED',
    'HYBRID_FALLBACK'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.chain_family as enum ('EVM', 'OTHER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.wallet_connection_method as enum (
    'INJECTED_EVM',
    'WALLETCONNECT',
    'PLATFORM_PROVISIONED',
    'OTHER'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.verification_status as enum (
    'UNVERIFIED',
    'PENDING',
    'VERIFIED',
    'FAILED',
    'REVOKED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.network_preference as enum (
    'AUTO',
    'SPECIFIC'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.tx_observation_status as enum (
    'OBSERVED',
    'CONFIRMING',
    'CONFIRMED',
    'FINALIZED',
    'FAILED',
    'REORGED',
    'DROPPED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type nexapay.webhook_delivery_status as enum (
    'PENDING',
    'DELIVERING',
    'DELIVERED',
    'FAILED',
    'DEAD'
  );
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- A. Platforms & customers
-- -----------------------------------------------------------------------------
create table if not exists nexapay.platforms (
  id              uuid primary key default gen_random_uuid(),
  platform_key    text not null unique,          -- e.g. nexastore
  display_name    text not null,
  status          text not null default 'active'
                    check (status in ('active', 'disabled')),
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create table if not exists nexapay.platform_customers (
  id                    uuid primary key default gen_random_uuid(),
  platform_id           uuid not null references nexapay.platforms(id),
  external_customer_id  text not null,           -- platform's user id
  email                 text,                    -- optional, not identity PK
  status                text not null default 'active'
                          check (status in ('active', 'disabled', 'blocked')),
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),
  unique (platform_id, external_customer_id)
);

create index if not exists idx_platform_customers_platform
  on nexapay.platform_customers (platform_id);

-- -----------------------------------------------------------------------------
-- B. External / platform-provisioned wallets (public refs only)
-- -----------------------------------------------------------------------------
create table if not exists nexapay.customer_wallets (
  id                         uuid primary key default gen_random_uuid(),
  platform_id                uuid not null references nexapay.platforms(id),
  customer_id                uuid not null references nexapay.platform_customers(id),
  public_address             text not null,      -- normalized (e.g. EIP-55 or lowercase)
  address_normalized         text not null,      -- lowercase for uniqueness
  chain_family               nexapay.chain_family not null default 'EVM',
  connection_method          nexapay.wallet_connection_method not null default 'OTHER',
  wallet_provider            text,               -- metamask | nexastore | walletconnect | ...
  wallet_reference           text,               -- external provider ref if any
  label                      text,
  verification_status        nexapay.verification_status not null default 'UNVERIFIED',
  verified_at                timestamptz,
  ownership_challenge_ref    text,               -- id/hash of verified challenge — not a secret
  status                     text not null default 'active'
                               check (status in ('active', 'revoked')),
  created_at                 timestamptz not null default timezone('utc', now()),
  updated_at                 timestamptz not null default timezone('utc', now()),
  constraint customer_wallets_address_len check (char_length(public_address) between 8 and 128)
);

-- One active wallet address per customer+family
create unique index if not exists uq_customer_wallets_active_addr
  on nexapay.customer_wallets (customer_id, chain_family, address_normalized)
  where status = 'active';

create index if not exists idx_customer_wallets_customer
  on nexapay.customer_wallets (customer_id);

-- -----------------------------------------------------------------------------
-- C. Chains & assets
-- -----------------------------------------------------------------------------
create table if not exists nexapay.supported_chains (
  id                    uuid primary key default gen_random_uuid(),
  chain_key             text not null unique,    -- polygon | base | arbitrum | ethereum
  chain_family          nexapay.chain_family not null default 'EVM',
  chain_id              bigint,                  -- EVM numeric id; null for non-EVM later
  display_name          text not null,
  native_gas_symbol     text not null,           -- POL | ETH | ...
  status                text not null default 'enabled'
                          check (status in ('enabled', 'disabled', 'maintenance')),
  confirmation_policy   jsonb not null default '{}'::jsonb,
  config_version        int not null default 1,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create table if not exists nexapay.supported_assets (
  id                uuid primary key default gen_random_uuid(),
  chain_id          uuid not null references nexapay.supported_chains(id),
  asset_symbol      text not null,               -- display only — not unique alone
  asset_name        text not null,
  contract_address  text,                        -- null = native asset
  contract_normalized text,                      -- lowercase when contract set
  decimals          int not null check (decimals >= 0 and decimals <= 36),
  status            text not null default 'enabled'
                      check (status in ('enabled', 'disabled')),
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_supported_assets_chain_contract
  on nexapay.supported_assets (chain_id, contract_normalized)
  where contract_normalized is not null;

create unique index if not exists uq_supported_assets_native
  on nexapay.supported_assets (chain_id, asset_symbol)
  where contract_address is null;

-- -----------------------------------------------------------------------------
-- D. Company treasury destinations (allowlisted)
-- -----------------------------------------------------------------------------
create table if not exists nexapay.treasury_destinations (
  id                  uuid primary key default gen_random_uuid(),
  destination_key     text not null,             -- e.g. nexastore_treasury
  platform_id         uuid references nexapay.platforms(id), -- null = company-wide
  chain_id            uuid not null references nexapay.supported_chains(id),
  asset_id            uuid not null references nexapay.supported_assets(id),
  destination_address text not null,
  address_normalized  text not null,
  status              text not null default 'active'
                        check (status in ('active', 'disabled')),
  effective_from      timestamptz not null default timezone('utc', now()),
  effective_to        timestamptz,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  unique (destination_key, chain_id, asset_id)
);

create index if not exists idx_treasury_dest_chain
  on nexapay.treasury_destinations (chain_id)
  where status = 'active';

-- -----------------------------------------------------------------------------
-- E. Payment intents, attempts, chain txs
-- -----------------------------------------------------------------------------
create table if not exists nexapay.payment_intents (
  id                        uuid primary key default gen_random_uuid(),
  platform_id               uuid not null references nexapay.platforms(id),
  customer_id               uuid not null references nexapay.platform_customers(id),
  customer_wallet_id        uuid references nexapay.customer_wallets(id),
  treasury_destination_id   uuid references nexapay.treasury_destinations(id),
  asset_id                  uuid not null references nexapay.supported_assets(id),
  -- requested crypto amount (exact); fiat display is metadata only
  amount_crypto             numeric(36, 18) not null check (amount_crypto > 0),
  amount_fiat_display       numeric(18, 2),
  currency_fiat_display     text,
  network_preference        nexapay.network_preference not null default 'AUTO',
  preferred_chain_id        uuid references nexapay.supported_chains(id),
  status                    nexapay.payment_intent_status not null default 'CREATED',
  external_order_reference  text,
  product_reference         text,
  idempotency_key           text not null,
  metadata                  jsonb not null default '{}'::jsonb,
  expires_at                timestamptz,
  authorized_at             timestamptz,
  succeeded_at              timestamptz,
  failed_at                 timestamptz,
  created_at                timestamptz not null default timezone('utc', now()),
  updated_at                timestamptz not null default timezone('utc', now()),
  unique (platform_id, idempotency_key)
);

create index if not exists idx_payment_intents_customer
  on nexapay.payment_intents (customer_id, created_at desc);

create index if not exists idx_payment_intents_status
  on nexapay.payment_intents (status);

-- At most one SUCCEEDED attempt linkage enforced via partial unique on attempts
create table if not exists nexapay.payment_attempts (
  id                        uuid primary key default gen_random_uuid(),
  payment_intent_id         uuid not null references nexapay.payment_intents(id),
  attempt_number            int not null check (attempt_number >= 1),
  chain_id                  uuid not null references nexapay.supported_chains(id),
  asset_id                  uuid not null references nexapay.supported_assets(id),
  source_wallet_id          uuid references nexapay.customer_wallets(id),
  treasury_destination_id   uuid not null references nexapay.treasury_destinations(id),
  execution_mode            nexapay.execution_mode not null default 'CUSTOMER_PAID',
  status                    nexapay.payment_attempt_status not null default 'CREATED',
  failure_code              text,
  failure_message           text,
  estimated_gas_native      numeric(36, 18),
  actual_gas_native         numeric(36, 18),
  gas_asset_symbol          text,
  sponsor_reference         text,
  started_at                timestamptz,
  submitted_at              timestamptz,
  confirmed_at              timestamptz,
  created_at                timestamptz not null default timezone('utc', now()),
  updated_at                timestamptz not null default timezone('utc', now()),
  unique (payment_intent_id, attempt_number)
);

-- Only one successful attempt per intent
create unique index if not exists uq_payment_attempts_one_success
  on nexapay.payment_attempts (payment_intent_id)
  where status = 'SUCCEEDED';

create table if not exists nexapay.blockchain_transactions (
  id                    uuid primary key default gen_random_uuid(),
  payment_attempt_id    uuid not null references nexapay.payment_attempts(id),
  chain_id              uuid not null references nexapay.supported_chains(id),
  asset_id              uuid not null references nexapay.supported_assets(id),
  transaction_hash      text not null,
  tx_hash_normalized    text not null,
  sender_address        text,
  recipient_address     text not null,
  token_contract        text,
  amount                numeric(36, 18) not null check (amount >= 0),
  block_number          bigint,
  block_hash            text,
  confirmation_count    int not null default 0,
  observation_status    nexapay.tx_observation_status not null default 'OBSERVED',
  verified_at           timestamptz,
  submitted_at          timestamptz,
  confirmed_at          timestamptz,
  finalized_at          timestamptz,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),
  unique (chain_id, tx_hash_normalized)
);

create index if not exists idx_blockchain_tx_attempt
  on nexapay.blockchain_transactions (payment_attempt_id);

-- -----------------------------------------------------------------------------
-- F. Authorization records
-- -----------------------------------------------------------------------------
create table if not exists nexapay.authorization_records (
  id                      uuid primary key default gen_random_uuid(),
  payment_intent_id       uuid not null references nexapay.payment_intents(id),
  customer_id             uuid not null references nexapay.platform_customers(id),
  customer_wallet_id      uuid references nexapay.customer_wallets(id),
  authorization_method    text not null,         -- explicit_click | signed_message | ...
  authorization_reference text,                  -- challenge id / request id
  payload_hash            text,                  -- hash of bound intent/amount/destination
  domain                  text,
  chain_id                uuid references nexapay.supported_chains(id),
  nonce                   text,
  amount_crypto           numeric(36, 18),
  status                  text not null default 'approved'
                            check (status in ('approved', 'rejected', 'consumed', 'revoked', 'expired')),
  approved_at             timestamptz,
  expires_at              timestamptz,
  request_metadata        jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_records_intent
  on nexapay.authorization_records (payment_intent_id);

-- -----------------------------------------------------------------------------
-- G. Double-entry ledger (append-only)
-- -----------------------------------------------------------------------------
create table if not exists nexapay.ledger_accounts (
  id              uuid primary key default gen_random_uuid(),
  account_code    text not null unique,          -- e.g. treasury_usdt_polygon
  account_name    text not null,
  account_type    text not null
                    check (account_type in (
                      'TREASURY_ASSET',
                      'CLEARING',
                      'FEE_EXPENSE',
                      'GAS_EXPENSE',
                      'PLATFORM_PAYABLE',
                      'ADJUSTMENT'
                    )),
  asset_id        uuid references nexapay.supported_assets(id),
  platform_id     uuid references nexapay.platforms(id),
  status          text not null default 'active'
                    check (status in ('active', 'disabled')),
  created_at      timestamptz not null default timezone('utc', now())
);

create table if not exists nexapay.ledger_journals (
  id                    uuid primary key default gen_random_uuid(),
  journal_code          text not null unique default encode(gen_random_bytes(12), 'hex'),
  payment_intent_id     uuid references nexapay.payment_intents(id),
  blockchain_tx_id      uuid references nexapay.blockchain_transactions(id),
  description           text,
  posted_at             timestamptz not null default timezone('utc', now()),
  posted_by             text not null default 'system', -- worker service name
  created_at            timestamptz not null default timezone('utc', now())
);

create table if not exists nexapay.ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  journal_id        uuid not null references nexapay.ledger_journals(id),
  account_id        uuid not null references nexapay.ledger_accounts(id),
  asset_id          uuid not null references nexapay.supported_assets(id),
  -- signed amount: debit > 0, credit < 0 OR use entry_side — we use side + positive amount
  entry_side        text not null check (entry_side in ('DEBIT', 'CREDIT')),
  amount            numeric(36, 18) not null check (amount > 0),
  created_at        timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ledger_entries_journal
  on nexapay.ledger_entries (journal_id);

-- No UPDATE/DELETE grants for ledger_entries for app roles (see RLS section).
-- Balancing must be enforced by Worker in one transaction when posting.

-- -----------------------------------------------------------------------------
-- H. Idempotency, webhooks, audit
-- -----------------------------------------------------------------------------
create table if not exists nexapay.idempotency_keys (
  id                  uuid primary key default gen_random_uuid(),
  platform_id         uuid not null references nexapay.platforms(id),
  operation           text not null,             -- create_payment_intent | ...
  idempotency_key     text not null,
  request_hash        text not null,
  resource_type       text,
  resource_id         uuid,
  response_snapshot   jsonb,
  expires_at          timestamptz,
  created_at          timestamptz not null default timezone('utc', now()),
  unique (platform_id, operation, idempotency_key)
);

create table if not exists nexapay.webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  platform_id         uuid not null references nexapay.platforms(id),
  payment_intent_id   uuid references nexapay.payment_intents(id),
  event_type          text not null,             -- payment.succeeded | payment.failed | ...
  payload_version     int not null default 1,
  payload             jsonb not null,            -- no secrets
  delivery_status     nexapay.webhook_delivery_status not null default 'PENDING',
  attempt_count       int not null default 0,
  next_retry_at       timestamptz,
  last_error          text,
  delivered_at        timestamptz,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists idx_webhook_events_pending
  on nexapay.webhook_events (delivery_status, next_retry_at)
  where delivery_status in ('PENDING', 'FAILED');

create table if not exists nexapay.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor           text not null,                 -- worker | system | platform:nexastore
  platform_id     uuid references nexapay.platforms(id),
  action          text not null,
  resource_type   text,
  resource_id     uuid,
  correlation_id  text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audit_logs_created
  on nexapay.audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at helper (schema-local)
-- -----------------------------------------------------------------------------
create or replace function nexapay.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$ begin
  create trigger trg_platforms_updated before update on nexapay.platforms
    for each row execute function nexapay.set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_platform_customers_updated before update on nexapay.platform_customers
    for each row execute function nexapay.set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_customer_wallets_updated before update on nexapay.customer_wallets
    for each row execute function nexapay.set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_payment_intents_updated before update on nexapay.payment_intents
    for each row execute function nexapay.set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger trg_payment_attempts_updated before update on nexapay.payment_attempts
    for each row execute function nexapay.set_updated_at();
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Seed: platforms + chains (NO token contracts invented here)
-- Owner must insert verified USDT contract addresses after confirmation.
-- -----------------------------------------------------------------------------
insert into nexapay.platforms (platform_key, display_name, status)
values ('nexastore', 'NexaStore', 'active')
on conflict (platform_key) do nothing;

insert into nexapay.supported_chains (chain_key, chain_family, chain_id, display_name, native_gas_symbol, status, confirmation_policy)
values
  ('polygon',  'EVM', 137,    'Polygon',  'POL', 'enabled', '{"min_confirmations": 12, "finality": "confirmations"}'::jsonb),
  ('base',     'EVM', 8453,   'Base',     'ETH', 'disabled', '{"min_confirmations": 12, "finality": "confirmations"}'::jsonb),
  ('arbitrum', 'EVM', 42161,  'Arbitrum', 'ETH', 'disabled', '{"min_confirmations": 20, "finality": "confirmations"}'::jsonb),
  ('ethereum', 'EVM', 1,      'Ethereum', 'ETH', 'disabled', '{"min_confirmations": 20, "finality": "confirmations"}'::jsonb)
on conflict (chain_key) do nothing;

-- Placeholder native gas assets only (no ERC-20 contracts — add via 002 seed after verify)
insert into nexapay.supported_assets (chain_id, asset_symbol, asset_name, contract_address, contract_normalized, decimals, status)
select c.id, c.native_gas_symbol, c.native_gas_symbol || ' (native)', null, null, 18, 'enabled'
from nexapay.supported_chains c
where not exists (
  select 1 from nexapay.supported_assets a
  where a.chain_id = c.id and a.contract_address is null and a.asset_symbol = c.native_gas_symbol
);

-- -----------------------------------------------------------------------------
-- RLS: backend-only by default (service_role bypasses RLS)
-- Anon/authenticated get NO direct access to financial tables.
-- -----------------------------------------------------------------------------
alter table nexapay.platforms                 enable row level security;
alter table nexapay.platform_customers        enable row level security;
alter table nexapay.customer_wallets          enable row level security;
alter table nexapay.supported_chains          enable row level security;
alter table nexapay.supported_assets          enable row level security;
alter table nexapay.treasury_destinations     enable row level security;
alter table nexapay.payment_intents           enable row level security;
alter table nexapay.payment_attempts          enable row level security;
alter table nexapay.blockchain_transactions   enable row level security;
alter table nexapay.authorization_records     enable row level security;
alter table nexapay.ledger_accounts           enable row level security;
alter table nexapay.ledger_journals           enable row level security;
alter table nexapay.ledger_entries            enable row level security;
alter table nexapay.idempotency_keys          enable row level security;
alter table nexapay.webhook_events            enable row level security;
alter table nexapay.audit_logs                enable row level security;

-- Optional read-only for authenticated: enabled chains/assets (public catalog)
do $$ begin
  create policy nexapay_chains_read on nexapay.supported_chains
    for select to authenticated
    using (status in ('enabled', 'maintenance'));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy nexapay_assets_read on nexapay.supported_assets
    for select to authenticated
    using (status = 'enabled');
exception when duplicate_object then null;
end $$;

-- No INSERT/UPDATE/DELETE policies for anon/authenticated on payment/ledger tables.
-- Cloudflare Worker must use service_role key.

comment on schema nexapay is 'NexaPay Stage 1 — invisible multi-chain payments; direct-to-treasury; no custodial customer balances';
comment on table nexapay.customer_wallets is 'Public wallet associations only. Platform provisions wallets; NexaPay never stores keys.';
comment on table nexapay.payment_intents is 'Central purchase record. SUCCEEDED only after independent chain verification by Worker.';
comment on table nexapay.ledger_entries is 'Append-only. Post only via trusted Worker with balanced journals.';

-- -----------------------------------------------------------------------------
-- Validation helpers (run manually after apply)
-- -----------------------------------------------------------------------------
-- select tablename from pg_tables where schemaname = 'nexapay' order by 1;
-- select * from nexapay.platforms;
-- select chain_key, chain_id, status from nexapay.supported_chains order by chain_id;
