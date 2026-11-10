# NexaPay AI Implementation Handoff

Read this file together with the six numbered SQL scripts, the complete current source repository/package, and the separately attached approved widget mockup.

## Mission
Inspect the real NexaPay project, integrate the new Supabase database, update Cloudflare Worker/source code, preserve security/payment rules, test, and deliver a file-by-file report. Do not deploy or make real charges/transfers without explicit approval.

## Product rules
- NexaPay is the payment layer in the NexaPulse ecosystem. Product promise: “Payments without the complexity.”
- Customers should not manually buy USDT, copy wallet addresses, choose networks, scan QR codes, or send crypto manually.
- Every purchase requires explicit customer approval. A saved card is not standing authorization; wallet association is not payment authorization.
- Never store raw card PAN, CVV/CVC, magnetic-stripe data, or full sensitive card credentials. Store only provider token/reference and permitted display metadata (brand, last four, expiry).
- Wallets are provisioned by NexaStore/platform logic. NexaPay associates/verifies wallet reference/address only. Never request or store seed phrases/private keys.
- Resolve the developer's verified, active, allowlisted settlement wallet server-side. Never trust a destination address supplied by the browser at payment time.
- The selected flow has no NexaStore commission; settlement goes to the developer's registered wallet, subject to actual provider and chain capabilities.
- Do not create a customer NexaPay stored-value balance. NexaPay is payment orchestration and settlement, not a custodial wallet.
- SUBMITTED is not SUCCEEDED. Mark success only after independent on-chain verification of chain, recipient, token, amount, and required finality/confirmations.
- Use exact decimal/numeric arithmetic for money, never JavaScript floating-point arithmetic for financial calculations.
- Do not promise “no third party” or “no KYB”. Card acquiring, fiat-to-crypto liquidity, AML/sanctions controls, and licensing obligations depend on providers and jurisdictions.
- No bridging initially. Polygon first; design extensibly for Base, Arbitrum, and Ethereum later.
## A. Inspect before editing
- Read the entire repository/package: frontend widget, Worker entry points/routes, Supabase access layer, migrations, tests, package files, deployment config, environment bindings, and provider adapters.
- Create a concise map of legacy tables/endpoints/statuses/configuration and show how each maps to the new schema before editing.
- Identify and preserve unrelated working behavior. Do not delete data, files, credentials, or features without approval.
- Check whether the six SQL scripts have already been applied. Never rerun destructive SQL blindly.

## B. Database integration
- Review and apply scripts in order: 01_foundation.sql, 02_platforms_customers_wallets.sql, 03_providers_chains_assets_destinations.sql, 04_payment_processing.sql, 05_ledger_webhooks_audit.sql, 06_security_validation.sql.
- Treat these scripts as a proposed foundation, not production-certified schema. Test them against the actual new Supabase project and report migration errors before relying on them.
- Update all queries, RPC calls, types/interfaces, validations, and tests to match the schema that actually exists.
- Do not invent provider IDs, token contract addresses, chain IDs, wallet records, platform IDs, or production values.
- Review composite chain/asset consistency, append-only ledger, atomic posting, RLS, grants, indexes, foreign keys, and updated_at handling. Propose a migration for issues; do not weaken controls silently.

## C. Cloudflare Worker and API
- Keep privileged Supabase access server-side in Cloudflare Workers. Never put service-role keys in browser HTML/JS, public responses, or source control.
- Replace legacy database queries and status handling. Centralize Supabase access and validate every Worker input.
- Review existing routes: /api/health, /api/create-order, /api/order-status, /api/check-payment, /api/webhook. Preserve or version them deliberately and document breaking changes.
- Implement idempotency for order creation, authorization, provider callbacks, acquisition, and settlement. Duplicate requests/webhooks must not create duplicate charges or transfers.
- Use durable outbox/retry patterns for external side effects. Record attempts, provider references, chain transactions, audit events, and reconciliation results.
- Use exact CORS origin allowlists for approved NexaStore origins; no wildcard CORS with credentials. Validate origin, method, content type, payload size, and caller authorization.
- Verify provider webhook signatures, timestamp tolerance, and replay protection. Never trust unsigned callbacks or client-side payment status.
- Never return secrets, sensitive raw provider payloads, internal stack traces, or service-role credentials to the browser.

## D. Payment lifecycle
- Enforce a server-side state machine: CREATED, VALIDATING, AWAITING_AUTHORIZATION, AUTHORIZED, EXECUTING, SUBMITTED, CONFIRMING, SUCCEEDED, FAILED, CANCELLED, EXPIRED, with REORGED and REVIEW_REQUIRED where needed.
- Disallow illegal transitions. A request must never jump from CREATED to SUCCEEDED.
- Create an intent, validate customer/platform/amount/currency/developer/trusted destination, then obtain explicit customer authorization before charging.
- Authorization must bind to the exact intent, amount, currency, saved payment-method token/reference, and expiry.
- Do not implement live card charging or fiat-to-USDT acquisition against a guessed provider. If provider details are missing, build an adapter boundary and sandbox/mock tests; mark live processing BLOCKED.
- Record fiat charge, acquisition quote/execution, USDT amount, fees, destination, chain transaction hash, confirmations, and outcome as linked records.
- Resolve settlement destination from trusted database records and verify it is active/allowlisted.
- Only mark SUCCEEDED after checking transaction hash on the correct chain, recipient, token contract, amount, and configured finality.
- Handle timeouts, partial failures, duplicate callbacks, reversals, insufficient liquidity, chain congestion, dropped transactions, and reorgs without double charging/paying.

## E. Security and operations
- Enable and inspect RLS on exposed tables. Browser/anon/authenticated roles must not write trusted payment statuses, ledger entries, provider events, or settlement destinations.
- Use least privilege. Keep service-role and provider secrets only in Cloudflare secrets. Never commit .env files or secrets; provide safe .env.example placeholders.
- Redact tokens, personal data, authorization secrets, private keys, seed phrases, and raw secrets from logs.
- Add webhook replay protection, rate limits, payload limits, audit logs, and reconciliation across provider records, internal ledger, and on-chain settlement.
- Correct posted ledger history only through compensating entries; do not edit/delete posted entries.
- Document backups, restore, secret rotation, incident response, and rollout.

## F. Testing and delivery
- Add/update unit, Worker route, database integration, and provider adapter tests.
- Test duplicate idempotency keys/webhooks, invalid signatures, expired approvals, amount tampering, wrong destination/chain/token, under/overpayment, failed charge/acquisition, chain timeout, reorg, and insufficient confirmations.
- Run lint, type-check, build, and tests. Report actual command output; never claim tests passed if not run.
- Deliver changed files, migrations, endpoint/API documentation, exact environment-variable list, test report, known limitations, deployment steps, rollback plan, and file-by-file change summary.
- Do not deploy production, rotate keys, delete data, or make irreversible provider/chain transactions without explicit owner approval.

## Configuration worksheet
Fill non-secret values only. Set secrets directly in Cloudflare secret storage; do not paste them into this file or AI chat.

| Setting | Value |
|---|---|
| Supabase URL | `https://YOUR-PROJECT-REF.supabase.co` |
| Supabase project ref | `YOUR_PROJECT_REF` |
| Supabase anon/public key | `PUBLIC_ANON_KEY_IF_NEEDED` |
| Supabase service-role key | **Set directly as Cloudflare secret** |
| DB password | **Do not enter here** |
| Cloudflare Worker name | `YOUR_WORKER_NAME` |
| Production NexaStore origins | `https://YOUR-STORE-DOMAIN` |
| Development origin | `http://localhost:YOUR_PORT` |
| Initial chain / asset | Polygon / USDT (verify exact contract) |
| Card provider | `TO BE SELECTED` |
| Liquidity provider | `TO BE SELECTED` |
| RPC provider | `TO BE SELECTED` |
| Webhook URL | `https://YOUR-WORKER-DOMAIN/api/webhook` |
| Webhook signing secret | **Set directly as Cloudflare secret** |

### Suggested Worker configuration
`SUPABASE_URL` (variable); `SUPABASE_SERVICE_ROLE_KEY` (secret); `SUPABASE_ANON_KEY` (only if needed); `CARD_PROVIDER_SECRET_KEY` (secret); `CARD_PROVIDER_WEBHOOK_SECRET` (secret); `LIQUIDITY_PROVIDER_SECRET_KEY` (secret); `LIQUIDITY_PROVIDER_WEBHOOK_SECRET` (secret); `RPC_URL`/`RPC_API_KEY` (secret if private); `APP_ORIGIN_ALLOWLIST` (variable); `ENVIRONMENT` (variable). The AI must inspect the real Worker and give exact setup steps.

## Required assets
1. This handoff.
2. SQL scripts `01_foundation.sql` through `06_security_validation.sql`, in order.
3. Complete current NexaPay source ZIP/repository.
4. Approved widget mockup image, attached separately (not embedded in this document).
5. If available: secret-redacted Worker config, database health output, provider API docs/sandbox details, and NexaStore integration/API documentation.

## Widget
Only the checkout widget, no portal/dashboard. Follow the mockup. Keep it premium, minimal, uncluttered, with soft rounded icons and restrained shadows. Use accurate Visa/Mastercard marks. No raw card/CVV inputs or payment selector if using the agreed saved-token flow. Keep CSS/JS in one standalone HTML file if that remains the agreed delivery format. No secrets in browser code.

## Suggested API responsibilities
- `POST /api/payment-intents`: idempotent intent creation and validation.
- `GET /api/payment-intents/:id`: safe authorized status.
- `POST /api/payment-intents/:id/authorize`: explicit approval for exact amount/currency/intent.
- `POST /api/payment-intents/:id/execute`: idempotent server-side execution.
- `POST /api/webhooks/:provider`: signature/replay verification and durable event processing.
- `GET /api/health`: non-sensitive readiness.
Preserve or version existing routes deliberately and document the final contract.

## Acceptance checklist
- [ ] All six SQL scripts reviewed and applied to the intended new Supabase project; migration result recorded.
- [ ] Expected tables, RLS, policies, grants, and indexes verified against the real database.
- [ ] Worker uses the new Supabase project; no stale active URL/key references remain.
- [ ] No service-role key, provider secret, webhook secret, DB password, private key, or seed phrase in frontend, Git, logs, or API responses.
- [ ] Every purchase requires explicit authorization; saved card cannot be charged without fresh approval for that exact payment.
- [ ] Duplicate requests/webhooks cannot cause duplicate charges, acquisitions, ledger postings, or settlements.
- [ ] Destination is resolved from trusted records and allowlisted.
- [ ] SUCCEEDED is impossible before provider and blockchain verification/finality.
- [ ] Ledger postings are balanced, atomic, auditable; corrections use compensating entries.
- [ ] Unconfigured provider integrations are clearly marked sandbox/mock or blocked, never falsely live.
- [ ] Widget matches mockup, remains minimal, and contains no privileged credentials or raw-card handling.
- [ ] Lint, type-check, build, automated tests, and sandbox checks have actual recorded results.
- [ ] Rollback plan, deployment steps, environment list, known limitations, and file-by-file change report delivered.

## Execution prompt
Act as the senior engineer implementing NexaPay. Read this entire handoff, all supplied SQL scripts, the complete source repository, and the attached approved widget mockup before editing. First return an architecture/impact assessment and list missing information. Then implement database integration and Worker changes in small, reviewable steps. Preserve unrelated functionality. Use new Supabase values only in secure configuration; never place service-role keys or provider secrets in browser code, source files, committed .env files, logs, or this report. Do not guess providers, token contract addresses, chain IDs, wallet destinations, or credentials. If a live integration cannot be verified, build a clean adapter boundary and sandbox tests, and clearly mark live processing BLOCKED. Enforce explicit per-purchase authorization, idempotency, server-side destination resolution, signed webhooks, balanced append-only ledger posting, audit/reconciliation, and on-chain finality verification. Run tests and report exact results. Before production deployment, irreversible actions, or real charges/transfers, stop and request my approval. Deliver all changed files, migrations, API documentation, configuration instructions, test report, rollback plan, and a file-by-file change summary.

## Owner notes
- New Supabase project created on:
- SQL scripts applied by:
- Widget mockup filename:
- Source package filename:
- Approved card provider:
- Approved liquidity/on-ramp provider:
- Approved RPC provider:
- Deployment approval (yes/no):
- Additional notes:
