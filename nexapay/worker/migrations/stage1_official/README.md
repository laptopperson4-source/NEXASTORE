# NexaPay Stage 1 — official SQL (owner package)

Run **in order** on a **new** Supabase project (recommended) or isolated schema review:

1. `01_foundation.sql`
2. `02_platforms_customers_wallets.sql`
3. `03_providers_chains_assets_destinations.sql`
4. `04_payment_processing.sql`
5. `05_ledger_webhooks_audit.sql`
6. `06_security_validation.sql`

Then:

```sql
SELECT * FROM public.nexapay_database_health();
```

Every row should show `table_exists = true` and `rls_enabled = true`.

**Do not** put service_role keys in the browser. Worker secrets only.

**Note:** These scripts use `public.*` tables (not the experimental `nexapay` schema from an earlier draft). Prefer this official set.

Legacy `orders` (old gateway) is **not** created or dropped by these scripts — if you still need the manual USDT path, keep the old `orders` table from `supabase-schema.sql` as well.
