# NexaPay implementation report (Stage 1 handoff)

**Date:** 2026-11-10  
**Scope:** Integrate official SQL + Worker payment-intent API. **No production deploy. No real charges.**

## Architecture / impact assessment

### Legacy (still supported)
| Piece | Role |
|--------|------|
| `public.orders` | Manual multi-network USDT payment verification |
| `POST /api/create-order` | Create legacy order |
| `GET/POST /api/order-status` | Poll + verify on-chain USDT transfer |
| Widget / NexaStore embed | Still can use legacy path until cutover |

### New (Stage 1 schema + API stubs)
| Piece | Role |
|--------|------|
| Scripts `01`–`06` in `worker/migrations/stage1_official/` | Platforms, customers, wallets, methods, intents, attempts, acquisition, chain txs, ledger, RLS |
| `POST /api/payment-intents` | Create intent + idempotency (requires `platforms` row) |
| `POST /api/payment-intents/:id/authorize` | Explicit approval bound to amount/currency |
| `POST /api/payment-intents/:id/execute` | **LIVE_PROCESSING_BLOCKED** until provider secrets + adapters |
| `GET /api/health` | Reports `live_processing: BLOCKED` when providers missing |

### Settlement model note
Handoff states settlement to **developer registered wallet** (allowlisted). Official SQL table is `settlement_destinations` with `destination_type` including `developer_wallet`. Worker resolves destination **server-side** only — never from a free-typed client address at pay time.

### Auto-created NexaStore wallets
Still valid as **platform-provisioned** `customer_wallets` rows (`public_address` only). NexaPay does not store keys. New invisible flow does not require the buyer to send USDT manually.

## Missing information (owner)
- [ ] New Supabase project URL + service_role in Cloudflare secrets
- [ ] Confirm SQL 01–06 applied (`SELECT * FROM nexapay_database_health()`)
- [ ] Insert `platforms` row for `nexastore`
- [ ] Verified Polygon USDT contract + active `settlement_destinations`
- [ ] Card provider + liquidity provider selection (not guessed)
- [ ] Production origin allowlist
- [ ] Explicit approval to implement live adapters / deploy

## Files changed
- `nexapay/worker/migrations/stage1_official/01_foundation.sql` … `06_security_validation.sql`
- `nexapay/worker/migrations/stage1_official/README.md`
- `nexapay/worker/src/index.js` — payment-intent routes; live execute blocked
- `nexapay/NexaPay_AI_Implementation_Handoff.md` — owner brief copy
- `nexapay/IMPLEMENTATION_REPORT.md` — this file

## Environment (Worker)
| Name | Type |
|------|------|
| `SUPABASE_URL` | var |
| `SUPABASE_KEY` | secret (service_role) |
| `ALLOWED_ORIGINS` | var (comma-separated) |
| `POLYGONSCAN_API_KEY` | secret (legacy verify) |
| `CARD_PROVIDER_SECRET_KEY` | secret — required for live execute |
| `LIQUIDITY_PROVIDER_SECRET_KEY` | secret — required for live execute |

## Tests
Not run in CI here (no Wrangler/Supabase credentials in this environment).  
Owner should: apply SQL → `nexapay_database_health()` → `wrangler deploy` → `GET /api/health` → create intent → authorize → execute (expect 503 BLOCKED).

## Rollback
- Leave legacy `/api/create-order` in place.
- Stop using payment-intent routes; do not drop new tables (additive).
- Point Worker secrets back to previous project if needed.

## Explicitly NOT done (per handoff)
- Live card charge / on-ramp
- Production deploy
- Invented contract addresses or provider IDs
- Service role in frontend
