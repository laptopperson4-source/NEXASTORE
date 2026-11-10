-- 04 PAYMENT INTENTS, ATTEMPTS, AUTHORIZATION, ACQUISITION AND CHAIN TRANSACTIONS.
BEGIN;
CREATE TABLE IF NOT EXISTS public.payment_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL REFERENCES public.platforms(id),
 customer_id uuid NOT NULL, external_order_reference text NOT NULL, product_reference text,
 product_description text, payment_method_id uuid, customer_wallet_id uuid, settlement_destination_id uuid,
 fiat_amount numeric(30,10) NOT NULL CHECK(fiat_amount>0), fiat_currency char(3) NOT NULL,
 expected_crypto_amount numeric(78,30), actual_crypto_amount numeric(78,30), asset_id uuid, chain_id uuid,
 status text NOT NULL DEFAULT 'CREATED' CHECK(status IN
 ('CREATED','VALIDATING','AWAITING_AUTHORIZATION','AUTHORIZED','PROCESSING_FIAT','FIAT_CAPTURED',
 'ACQUIRING_CRYPTO','CRYPTO_AVAILABLE','EXECUTING','SUBMITTED','CONFIRMING','SUCCEEDED',
 'FAILED','CANCELLED','EXPIRED','REVIEW_REQUIRED','REVERSED')),
 idempotency_key text NOT NULL, expires_at timestamptz, authorized_at timestamptz,
 succeeded_at timestamptz, failed_at timestamptz, failure_code text, failure_reason text,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,platform_id) REFERENCES public.platform_customers(id,platform_id),
 FOREIGN KEY(payment_method_id,platform_id) REFERENCES public.customer_payment_methods(id,platform_id),
 FOREIGN KEY(customer_wallet_id,platform_id) REFERENCES public.customer_wallets(id,platform_id),
 FOREIGN KEY(settlement_destination_id,platform_id) REFERENCES public.settlement_destinations(id,platform_id),
 FOREIGN KEY(asset_id,chain_id) REFERENCES public.supported_assets(id,chain_id),
 UNIQUE(platform_id,external_order_reference), UNIQUE(platform_id,idempotency_key), UNIQUE(id,platform_id)
);
CREATE TABLE IF NOT EXISTS public.payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id),
 provider_id uuid REFERENCES public.payment_providers(id), provider_transaction_reference text,
 attempt_number integer NOT NULL CHECK(attempt_number>0),
 operation_type text NOT NULL CHECK(operation_type IN ('card_authorization','card_capture','card_void','card_refund','other')),
 fiat_amount numeric(30,10) NOT NULL CHECK(fiat_amount>0), fiat_currency char(3) NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','AUTHORIZED','CAPTURED','DECLINED','FAILED','CANCELLED','REVERSED')),
 failure_code text, failure_reason text, provider_response jsonb NOT NULL DEFAULT '{}',
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(payment_intent_id,attempt_number)
);
CREATE TABLE IF NOT EXISTS public.crypto_acquisitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id),
 payment_attempt_id uuid REFERENCES public.payment_attempts(id), provider_id uuid REFERENCES public.payment_providers(id),
 provider_transaction_reference text, fiat_amount numeric(30,10) NOT NULL CHECK(fiat_amount>0),
 fiat_currency char(3) NOT NULL, crypto_asset_id uuid NOT NULL REFERENCES public.supported_assets(id),
 crypto_amount_requested numeric(78,30), crypto_amount_received numeric(78,30),
 exchange_rate numeric(38,18), provider_fee numeric(30,10),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED','REVERSED')),
 provider_response jsonb NOT NULL DEFAULT '{}', started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.blockchain_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id),
 acquisition_id uuid REFERENCES public.crypto_acquisitions(id),
 chain_id uuid NOT NULL REFERENCES public.supported_chains(id), asset_id uuid NOT NULL REFERENCES public.supported_assets(id),
 transaction_hash text, sender_address text, recipient_address text NOT NULL,
 amount numeric(78,30) NOT NULL CHECK(amount>0), nonce numeric(78,0), block_number numeric(78,0),
 confirmation_count integer NOT NULL DEFAULT 0 CHECK(confirmation_count>=0),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUBMITTED','CONFIRMING','CONFIRMED','FAILED','REPLACED','REORGED')),
 replacement_transaction_hash text, submitted_at timestamptz, confirmed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_tx_hash ON public.blockchain_transactions(chain_id,transaction_hash)
 WHERE transaction_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.authorization_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id),
 customer_id uuid NOT NULL REFERENCES public.platform_customers(id), authorization_method text NOT NULL,
 authorization_reference text, approved_amount numeric(30,10) NOT NULL CHECK(approved_amount>0),
 approved_currency char(3) NOT NULL, destination_reference uuid REFERENCES public.settlement_destinations(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','REVOKED')),
 approved_at timestamptz, expires_at timestamptz, request_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intents_customer ON public.payment_intents(customer_id);
CREATE INDEX IF NOT EXISTS idx_intents_status ON public.payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_attempts_intent ON public.payment_attempts(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_intent ON public.crypto_acquisitions(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_chain_transactions_intent ON public.blockchain_transactions(payment_intent_id);
COMMIT;
