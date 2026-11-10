-- 05 DOUBLE-ENTRY LEDGER, IDEMPOTENCY, WEBHOOKS, AUDIT, OUTBOX AND RECONCILIATION.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_code text NOT NULL UNIQUE,
 account_name text NOT NULL, account_type text NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','REVENUE','EXPENSE','CLEARING')),
 currency_or_asset text NOT NULL, platform_id uuid REFERENCES public.platforms(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid REFERENCES public.payment_intents(id),
 transaction_type text NOT NULL, description text,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','REVERSED')),
 reference text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.ledger_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ledger_transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id),
 account_id uuid NOT NULL REFERENCES public.ledger_accounts(id), asset_code text NOT NULL,
 debit_amount numeric(78,30) NOT NULL DEFAULT 0 CHECK(debit_amount>=0),
 credit_amount numeric(78,30) NOT NULL DEFAULT 0 CHECK(credit_amount>=0),
 description text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((debit_amount>0 AND credit_amount=0) OR (credit_amount>0 AND debit_amount=0))
);
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid NOT NULL REFERENCES public.platforms(id),
 idempotency_key text NOT NULL, request_hash text NOT NULL, resource_type text, resource_id uuid,
 response_status integer, response_body jsonb,
 status text NOT NULL DEFAULT 'PROCESSING' CHECK(status IN ('PROCESSING','COMPLETED','FAILED')),
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(platform_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid REFERENCES public.payment_providers(id),
 provider_event_id text NOT NULL, event_type text NOT NULL, signature_verified boolean NOT NULL DEFAULT false,
 processing_status text NOT NULL DEFAULT 'RECEIVED' CHECK(processing_status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED')),
 payload jsonb NOT NULL DEFAULT '{}', processing_attempts integer NOT NULL DEFAULT 0,
 error_message text, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(provider_id,provider_event_id)
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid REFERENCES public.platforms(id),
 customer_id uuid REFERENCES public.platform_customers(id),
 actor_type text NOT NULL CHECK(actor_type IN ('customer','platform','system','provider','administrator')),
 actor_reference text, action text NOT NULL, resource_type text, resource_id uuid,
 ip_address inet, user_agent text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_id uuid REFERENCES public.platforms(id),
 payment_intent_id uuid REFERENCES public.payment_intents(id), event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','PROCESSING','DELIVERED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz, delivered_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reconciliation_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid REFERENCES public.payment_intents(id),
 provider_id uuid REFERENCES public.payment_providers(id),
 blockchain_transaction_id uuid REFERENCES public.blockchain_transactions(id),
 reconciliation_type text NOT NULL, internal_reference text, external_reference text,
 internal_amount numeric(78,30), external_amount numeric(78,30), currency_or_asset text,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','MATCHED','MISMATCHED','REVIEW_REQUIRED','RESOLVED')),
 discrepancy jsonb NOT NULL DEFAULT '{}', resolved_at timestamptz, resolution_notes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.post_ledger_transaction(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_count integer; v_bad integer;
BEGIN
 SELECT status INTO v_status FROM public.ledger_transactions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ledger transaction not found'; END IF;
 IF v_status<>'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT journals may be posted'; END IF;
 SELECT count(*) INTO v_count FROM public.ledger_entries WHERE ledger_transaction_id=p_id;
 IF v_count<2 THEN RAISE EXCEPTION 'At least two entries required'; END IF;
 SELECT count(*) INTO v_bad FROM (
   SELECT asset_code FROM public.ledger_entries WHERE ledger_transaction_id=p_id
   GROUP BY asset_code HAVING sum(debit_amount)<>sum(credit_amount)
 ) q;
 IF v_bad>0 THEN RAISE EXCEPTION 'Journal is not balanced per asset'; END IF;
 UPDATE public.ledger_transactions SET status='POSTED',posted_at=now() WHERE id=p_id;
END; $$;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal ON public.ledger_entries(ledger_transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON public.webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON public.reconciliation_records(status);
DROP TRIGGER IF EXISTS ledger_entries_append_only ON public.ledger_entries;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON public.ledger_entries
 FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();
DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON public.audit_logs
 FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();
COMMIT;
