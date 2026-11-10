-- 03 PROVIDERS, TOKENIZED PAYMENT METHODS, CHAINS, ASSETS AND SETTLEMENT DESTINATIONS.
-- Insert only verified chain IDs and token contract addresses.
BEGIN;
CREATE TABLE IF NOT EXISTS public.payment_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_name text NOT NULL,
 provider_type text NOT NULL CHECK(provider_type IN ('card_acquirer','card_tokenization','crypto_onramp','liquidity','blockchain_rpc','wallet_infrastructure','other')),
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment IN ('sandbox','production')),
 status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','maintenance')),
 public_configuration jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_name,provider_type,environment)
);
CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL, customer_id uuid NOT NULL,
 provider_id uuid REFERENCES public.payment_providers(id), provider_customer_reference text,
 provider_payment_method_reference text NOT NULL, method_type text NOT NULL DEFAULT 'card',
 card_brand text, last_four char(4), expiry_month smallint CHECK(expiry_month BETWEEN 1 AND 12),
 expiry_year smallint CHECK(expiry_year BETWEEN 2000 AND 2200),
 verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','failed')),
 is_default boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','revoked','expired')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,platform_id) REFERENCES public.platform_customers(id,platform_id),
 UNIQUE(id,platform_id), UNIQUE(provider_id,provider_payment_method_reference)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_method ON public.customer_payment_methods(customer_id)
 WHERE is_default AND status='active';
CREATE TABLE IF NOT EXISTS public.supported_chains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id numeric(78,0) NOT NULL UNIQUE,
 chain_name text NOT NULL, chain_family text NOT NULL DEFAULT 'EVM', native_asset text,
 explorer_url text, rpc_provider_id uuid REFERENCES public.payment_providers(id),
 required_confirmations integer NOT NULL DEFAULT 1 CHECK(required_confirmations>0),
 finality_configuration jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','maintenance')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supported_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id uuid NOT NULL REFERENCES public.supported_chains(id),
 asset_symbol text NOT NULL, asset_name text NOT NULL, contract_address text NOT NULL,
 decimals smallint NOT NULL CHECK(decimals BETWEEN 0 AND 36), is_stablecoin boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,contract_address), UNIQUE(id,chain_id)
);
CREATE TABLE IF NOT EXISTS public.settlement_destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL REFERENCES public.platforms(id),
 developer_reference text NOT NULL, chain_id uuid NOT NULL, asset_id uuid NOT NULL,
 destination_address text NOT NULL,
 destination_type text NOT NULL DEFAULT 'developer_wallet'
 CHECK(destination_type IN ('developer_wallet','platform_wallet','merchant_wallet','other')),
 verification_status text NOT NULL DEFAULT 'pending'
 CHECK(verification_status IN ('pending','verified','rejected')),
 status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','revoked')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(asset_id,chain_id) REFERENCES public.supported_assets(id,chain_id),
 UNIQUE(id,platform_id)
);
CREATE TABLE IF NOT EXISTS public.gas_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid REFERENCES public.platforms(id),
 chain_id uuid NOT NULL REFERENCES public.supported_chains(id), policy_name text NOT NULL,
 policy_mode text NOT NULL CHECK(policy_mode IN ('customer_paid','platform_sponsored','nexapay_sponsored','hybrid')),
 configuration jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
