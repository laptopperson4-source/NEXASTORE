# NexaPay / NexaStore — Full Work Report

**Author:** Grok (implementation assistant)  
**Last updated:** 2026-11-10  
**Repo:** https://github.com/laptopperson4-source/NEXASTORE  
**Related commits (approx):** `464b4d8` (auto wallet), `d5858ce` (draft `nexapay` schema), `ed8dc34` (official Stage 1 SQL + payment-intent Worker)

This document records **what was done**, **why**, **how to use it**, and **what was deliberately not done**.

---

## 1. Context and goals

### 1.1 Product goal
NexaPay is being redesigned from a **manual USDT send** flow into **invisible crypto payments**:

- Customer reviews a purchase and **approves once**.
- Backend handles card → USDT → on-chain settlement.
- Customer should not copy addresses, pick networks, or send tokens by hand.

### 1.2 Fixed product rules (from owner briefs)
| Rule | Meaning |
|------|---------|
| Platform provisions wallets | NexaStore creates/links wallets; **NexaPay does not** create keys |
| No keys in database | Only public addresses / provider token refs |
| No raw card data in Supabase | Tokenized payment-method references only |
| Explicit approval per purchase | Saved card ≠ standing charge permission |
| Destination server-side | Never trust a free-typed payout address from the browser |
| SUCCEEDED only after verification | Not from frontend animation or client-supplied status |
| Settlement | Allowlisted developer/platform destinations (handoff: developer wallet) |
| No customer stored balance | Orchestration + settlement, not a custodial balance product |
| Live money | Blocked until real providers are configured |

### 1.3 What “auto MetaMask wallet” actually is
MetaMask cannot be “created” for a user by an API.

What was implemented earlier on **NexaStore**:

- Generate an **EVM keypair** (same address style as MetaMask).
- Encrypt private key **on device** (password-based); never upload seed/private key to Supabase.
- Save **public address** on profile / link as checkout wallet.
- Show recovery phrase **once** (backup modal).

Under the **new** NexaPay model that wallet is still valid as a **platform-provisioned** `customer_wallets` row. The **happy path no longer requires** the buyer to open MetaMask and send USDT; that is backend orchestration once providers exist.

---

## 2. Access limitations (honest)

| Capability | Status |
|------------|--------|
| Read/write GitHub NEXASTORE | Yes (with token you provided earlier) |
| Live Supabase dashboard / query production DB | **No** |
| Create a new Supabase project for you | **No** — you must create it |
| Cloudflare dashboard / `wrangler secret` on your account | **No** — you deploy |
| Apply SQL on your project | **No** — you run scripts in SQL Editor |

All database work is delivered as **files to run**. All Worker work is **code in the repo** for you to deploy.

---

## 3. Work completed — by phase

### Phase A — NexaStore auto wallet (buyer convenience foundation)

**Commit direction:** `464b4d8`  
**Files (main):** `src/NexaStore.jsx`, `NEXASTORE_WALLET.sql`

**What it does:**
1. On signup (and sometimes returning login), call `ensureNexaStoreWallet`.
2. Load `ethers` from CDN (UMD) to create a random wallet.
3. Encrypt private key with the user’s password (PBKDF2 + AES-GCM); store blob in `localStorage` (`nexastore_managed_wallet_v1`).
4. Set linked checkout wallet (`nexastore_crypto_wallet` legacy key).
5. Attempt to write **public address only** to `profiles.nexastore_wallet` / `buyer_wallet` (columns from `NEXASTORE_WALLET.sql`).
6. Show `WalletBackupModal` with address + recovery phrase once.

**How to enable DB columns (NexaStore project):**
```sql
-- From NEXASTORE_WALLET.sql
alter table public.profiles add column if not exists nexastore_wallet text;
alter table public.profiles add column if not exists buyer_wallet text;
```

**How it fits NexaPay later:**
Platform registers the same public address into `public.customer_wallets` when creating a payment intent (Worker accepts optional `wallet_address`).

---

### Phase B — Draft schema in `nexapay` schema (experimental)

**Commit direction:** `d5858ce`  
**Files:** `nexapay/worker/migrations/001_nexapay_stage1_foundation.sql`, `README_STAGE1.md`

**What it does:**
- Additive tables under schema **`nexapay.*`** (platforms, wallets, intents, ledger, etc.).
- Seeded chain rows (Polygon/Base/Arbitrum/Ethereum) without inventing USDT contracts.
- RLS enabled; browser roles not given write access to money tables.

**Status:** Superseded as the **preferred** package by the owner’s official `01`–`06` scripts that use **`public.*`**. Keep the draft for reference; **run the official set** on a new NexaPay project.

---

### Phase C — Official Stage 1 SQL (owner package) integrated into repo

**Commit direction:** `ed8dc34`  
**Source:** Files you attached (`01_foundation.sql` … `06_security_validation.sql` + handoff).

**Installed at:**
```text
nexapay/worker/migrations/stage1_official/
  01_foundation.sql
  02_platforms_customers_wallets.sql
  03_providers_chains_assets_destinations.sql
  04_payment_processing.sql
  05_ledger_webhooks_audit.sql
  06_security_validation.sql
  07_seed_nexastore_platform.sql   ← added helper seed
  README.md
```

**Also copied:**
- `nexapay/NexaPay_AI_Implementation_Handoff.md`
- `nexapay/IMPLEMENTATION_REPORT.md` (shorter report)
- This file: `nexapay/FULL_WORK_REPORT.md`

#### What each official script does

| Script | Purpose |
|--------|---------|
| **01** | `pgcrypto`; `set_updated_at()`; `prevent_mutation()` for append-only tables |
| **02** | `platforms`, `platform_customers`, `customer_wallets` (public address only, composite FKs) |
| **03** | `payment_providers`, `customer_payment_methods` (tokens only), `supported_chains`, `supported_assets`, `settlement_destinations`, `gas_policies` |
| **04** | `payment_intents`, `payment_attempts`, `crypto_acquisitions`, `blockchain_transactions`, `authorization_records` + lifecycle statuses |
| **05** | Ledger (`ledger_accounts`, `ledger_transactions`, `ledger_entries`), `post_ledger_transaction()`, idempotency, webhooks, audit, outbox, reconciliation; append-only triggers |
| **06** | Enable RLS on all listed tables; **REVOKE** from `anon`/`authenticated`; grants to `service_role`; `nexapay_database_health()` |
| **07** | Seed platform row `nexastore` |

**Legacy `public.orders`:** not created and not dropped by these scripts. Old manual USDT path can coexist if you also keep the old orders schema.

---

### Phase D — Cloudflare Worker API for payment intents

**File:** `nexapay/worker/src/index.js`  
**Deployed Worker name (historical):** `nexapay-gateway` → `https://nexapay-gateway.blacknick517.workers.dev` (re-deploy after pull).

#### Legacy routes (unchanged behavior)
| Method | Path | Role |
|--------|------|------|
| POST | `/api/create-order` | Create `orders` row for manual USDT |
| GET/POST | `/api/order-status` | Verify on-chain USDT + confirmations |
| (other existing) | health/check as before | |

#### New routes
| Method | Path | Role |
|--------|------|------|
| POST | `/api/payment-intents` | Create intent + customer upsert + optional wallet link + idempotency |
| GET | `/api/payment-intents/:id` | Safe public status fields only |
| POST | `/api/payment-intents/:id/authorize` | Explicit approval; binds amount + currency |
| POST | `/api/payment-intents/:id/execute` | **Blocked** unless provider secrets exist; even then adapters not fully implemented → no fake SUCCEEDED |
| GET | `/api/health` | `{ live_processing: "BLOCKED" \| "ADAPTERS_PENDING", ... }` |

#### Execute policy (critical)
```text
if CARD_PROVIDER_SECRET_KEY and LIQUIDITY_PROVIDER_SECRET_KEY missing
  → HTTP 503 LIVE_PROCESSING_BLOCKED
  → authorization may already be recorded
  → NO charge, NO USDT buy, NO chain send, NO status SUCCEEDED
```

#### Create-intent inputs (JSON body examples)
```json
{
  "platform_key": "nexastore",
  "external_customer_id": "<supabase user uuid>",
  "external_order_reference": "<unique order id>",
  "idempotency_key": "<unique key>",
  "fiat_amount": 2.00,
  "fiat_currency": "USD",
  "product_reference": "<app id>",
  "product_description": "App name",
  "email": "user@example.com",
  "wallet_address": "0x...",
  "wallet_provider": "nexastore",
  "developer_reference": "<dev id for settlement lookup>"
}
```
Settlement address is **not** taken from the client as a free-form pay-to; Worker looks up `settlement_destinations` by `developer_reference` when provided.

---

## 4. How to apply everything (owner runbook)

### Step 1 — Create Supabase project (recommended: dedicated NexaPay)
1. https://supabase.com/dashboard → **New project** → name e.g. `nexapay`.
2. Wait until the project is healthy (not paused).

### Step 2 — Run SQL in order
SQL Editor → paste each file → Run:

1. `01_foundation.sql`  
2. `02_platforms_customers_wallets.sql`  
3. `03_providers_chains_assets_destinations.sql`  
4. `04_payment_processing.sql`  
5. `05_ledger_webhooks_audit.sql`  
6. `06_security_validation.sql`  
7. `07_seed_nexastore_platform.sql`  

### Step 3 — Health check
```sql
SELECT * FROM public.nexapay_database_health();
```
Expect every expected table: `table_exists = true`, `rls_enabled = true`.

### Step 4 — Seed real chain/asset/destination (you supply verified values)
Do **not** invent contract addresses. Example pattern only:

```sql
-- After you verify values from official docs / explorers:
-- INSERT supported_chains (chain_id 137, Polygon, active)
-- INSERT supported_assets (USDT contract on that chain, decimals 6, active)
-- INSERT settlement_destinations (platform nexastore, developer_reference, verified, active)
```

### Step 5 — Point the Worker at the new project
From `nexapay/worker`:

```powershell
npx wrangler secret put SUPABASE_URL
# value: https://YOUR-REF.supabase.co

npx wrangler secret put SUPABASE_KEY
# value: service_role key (server only)

npx wrangler deploy
```

Optional:
```powershell
npx wrangler secret put POLYGONSCAN_API_KEY   # legacy order-status
# Do NOT set card/liquidity secrets until providers are chosen and adapters exist
```

### Step 6 — Smoke test
```text
GET  https://nexapay-gateway.<your-subdomain>.workers.dev/api/health
POST /api/payment-intents   (with real platform + idempotency key)
POST /api/payment-intents/:id/authorize
POST /api/payment-intents/:id/execute   → expect 503 BLOCKED until providers configured
```

### Step 7 — NexaStore profile wallet columns (store project)
Run `NEXASTORE_WALLET.sql` on the **store** Supabase project if auto-wallet address persistence is desired.

---

## 5. Security summary

| Control | Implementation |
|---------|----------------|
| No service role in browser | Worker-only secret |
| RLS on payment tables | Script 06; revoke anon/authenticated |
| Append-only ledger/audit | `prevent_mutation` triggers |
| Idempotent intent create | `idempotency_keys` + unique `(platform_id, idempotency_key)` |
| Authorization bound to amount | authorize handler rejects mismatches |
| Live money gated | execute blocked without provider secrets; no fake success |
| CORS | Allowlist (`ALLOWED_ORIGINS` or defaults including `app.nexapulse.pro`) |

---

## 6. What was intentionally NOT done

- Creating or accessing your live Supabase project  
- Deploying to Cloudflare from this environment  
- Real card charges or fiat→USDT purchases  
- Choosing/implementing a specific card or liquidity vendor  
- Inventing USDT contract addresses or treasury/developer addresses  
- Removing the legacy manual USDT `orders` path  
- Redesigning the full NexaStore checkout UI to payment-intents only  
- Cross-chain bridges  
- Claiming tests passed without running them against your credentials  

---

## 7. File map (quick index)

```text
nexapay/
  FULL_WORK_REPORT.md                 ← this document
  IMPLEMENTATION_REPORT.md            ← shorter Stage 1 report
  NexaPay_AI_Implementation_Handoff.md
  README.md / SETUP.md
  worker/
    src/index.js                      ← legacy + new intent API
    wrangler.toml
    supabase-schema.sql               ← legacy orders only
    migrations/
      001_nexapay_stage1_foundation.sql   ← experimental nexapay.* schema
      stage1_official/                    ← USE THESE
        01 … 07 + README.md
  widget/
    nexapay-widget.html

NEXASTORE_WALLET.sql                  ← store profiles wallet columns
src/NexaStore.jsx                     ← auto wallet + store UI
```

---

## 8. Mapping: old flow vs new flow

| Step | Legacy manual USDT | New intent pipeline |
|------|--------------------|---------------------|
| Start | create-order | create payment intent |
| Pay UX | User sends USDT in wallet | User taps Approve only |
| Money in | User already holds USDT | Card → acquisition (future) |
| Settlement | User → developer address | Backend → allowlisted destination |
| Success | Confirmations on tx hash | Independent verification → SUCCEEDED |
| Unlock app | Client/order status | Platform trusts Worker/outbox event |

---

## 9. Recommended next steps (ordered)

1. Create NexaPay Supabase project; run **01–07**; run health function.  
2. Re-deploy Worker with new `SUPABASE_URL` / `SUPABASE_KEY`.  
3. Confirm `/api/health` and intent create → authorize → execute **503**.  
4. Register verified chain, USDT asset, settlement destinations.  
5. Choose card + liquidity providers; then implement adapters (separate task).  
6. Point NexaStore paid checkout at payment-intents API; keep legacy as fallback until cutover.  
7. Only then request approval for production live processing.

---

## 10. One-line summary

**Delivered:** official Stage 1 database scripts in-repo, Worker routes for payment intents with **explicit authorize** and **hard block on live execute**, plus NexaStore auto EVM wallet provisioning that remains compatible as public wallet association — **without** claiming live payments work until you configure providers and approve go-live.
EOF
