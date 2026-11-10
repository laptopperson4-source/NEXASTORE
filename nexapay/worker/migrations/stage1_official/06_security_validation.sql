-- 06 RLS, PERMISSIONS AND FINAL VALIDATION.
-- Browser roles receive no direct table access. Worker service role stays server-side.
BEGIN;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'platforms','platform_customers','customer_wallets','payment_providers','customer_payment_methods',
 'supported_chains','supported_assets','settlement_destinations','gas_policies','payment_intents',
 'payment_attempts','crypto_acquisitions','blockchain_transactions','authorization_records',
 'ledger_accounts','ledger_transactions','ledger_entries','idempotency_keys','webhook_events',
 'audit_logs','outbox_events','reconciliation_records'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
CREATE OR REPLACE FUNCTION public.nexapay_database_health()
RETURNS TABLE(table_name text,table_exists boolean,rls_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH expected(name) AS (VALUES
 ('platforms'),('platform_customers'),('customer_wallets'),('payment_providers'),
 ('customer_payment_methods'),('supported_chains'),('supported_assets'),
 ('settlement_destinations'),('gas_policies'),('payment_intents'),('payment_attempts'),
 ('crypto_acquisitions'),('blockchain_transactions'),('authorization_records'),
 ('ledger_accounts'),('ledger_transactions'),('ledger_entries'),('idempotency_keys'),
 ('webhook_events'),('audit_logs'),('outbox_events'),('reconciliation_records'))
 SELECT e.name,c.oid IS NOT NULL,coalesce(c.relrowsecurity,false)
 FROM expected e LEFT JOIN pg_class c ON c.relname=e.name AND c.relnamespace='public'::regnamespace
 ORDER BY e.name;
$$;
REVOKE ALL ON FUNCTION public.nexapay_database_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nexapay_database_health() TO service_role;
COMMIT;
-- After all scripts succeed, run:
-- SELECT * FROM public.nexapay_database_health();
-- Every row should report table_exists=true and rls_enabled=true.
