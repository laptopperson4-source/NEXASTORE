# NexaPay Stage 1 — apply guide

## Can the AI create your Supabase project?
**No.** Only you can create a project in the Supabase dashboard.

### Option A — dedicated NexaPay project (recommended)
1. https://supabase.com/dashboard → **New project** → name `nexapay`
2. Wait until healthy
3. **SQL Editor** → paste `001_nexapay_stage1_foundation.sql` → Run
4. **Settings → API**: copy `Project URL` + `service_role` key into Cloudflare Worker secrets:
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (service_role only — never in the browser)

### Option B — same project as NexaStore
Run the same SQL on `mapswtriwoxlscjdakpk` (after unpausing). Tables live in schema **`nexapay`**, so they do not replace legacy `public.orders`.

## Legacy `orders`
Left untouched. Old worker paths can keep using `public.orders` until Stage 2+ cutover.

## Auto-created NexaStore wallets — still valid?
**Yes, as platform wallet provisioning — with limits.**

| Stage 1 rule | How auto-wallets fit |
|--------------|----------------------|
| NexaPay does **not** create wallets | NexaStore (platform) creates them; NexaPay only stores **public** rows in `nexapay.customer_wallets` |
| No private keys in Supabase | Only `public_address` + verification metadata in NexaPay DB |
| Invisible crypto / direct treasury | **Customer wallet is not the payout rail** for the new pipeline. Card → USDT → **treasury** is backend-orchestrated |
| Ownership verification | Connecting/generating an address ≠ spend auth; Stage 2+ adds signature challenge |

So: keep generating/linking addresses on NexaStore for identity and future gas/smart-account flows, **register the public address** into `customer_wallets` with `connection_method = PLATFORM_PROVISIONED`. Do **not** upload seed phrases or private keys to Supabase.

Under the **new** NexaPay flow, buyers no longer need to manually send USDT from that wallet for the happy path — the wallet association supports the platform model, not “MetaMask send” checkout.

## After apply — owner checklist
1. Insert verified USDT contract rows into `nexapay.supported_assets` (do not invent addresses).
2. Insert `nexapay.treasury_destinations` for Polygon (and later chains) with your real treasury addresses.
3. Point Worker `SUPABASE_URL` / `SUPABASE_KEY` at this project.
4. Do not enable real charges until provider adapters exist (Stage 2+).
