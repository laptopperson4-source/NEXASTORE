-- 02 PLATFORMS, CUSTOMERS AND PLATFORM-PROVISIONED WALLETS.
BEGIN;
CREATE TABLE IF NOT EXISTS public.platforms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 description text, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','disabled')),
 callback_url text, allowed_origins text[] NOT NULL DEFAULT '{}',
 configuration jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL REFERENCES public.platforms(id),
 external_customer_id text NOT NULL, email text, display_name text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(platform_id,external_customer_id), UNIQUE(id,platform_id)
);
CREATE TABLE IF NOT EXISTS public.customer_wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL, customer_id uuid NOT NULL,
 wallet_provider text, wallet_reference text, public_address text NOT NULL,
 chain_family text NOT NULL DEFAULT 'EVM',
 wallet_type text NOT NULL DEFAULT 'external' CHECK(wallet_type IN ('external','embedded','smart_account')),
 ownership_verification_status text NOT NULL DEFAULT 'pending'
 CHECK(ownership_verification_status IN ('pending','verified','failed','not_required')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','revoked')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,platform_id) REFERENCES public.platform_customers(id,platform_id),
 UNIQUE(id,platform_id), UNIQUE(platform_id,public_address)
);
CREATE INDEX IF NOT EXISTS idx_customers_platform ON public.platform_customers(platform_id);
CREATE INDEX IF NOT EXISTS idx_wallets_customer ON public.customer_wallets(customer_id);
COMMIT;
