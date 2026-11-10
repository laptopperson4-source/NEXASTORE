/**
 * NexaPay — Cloudflare Worker
 *
 * LEGACY path (still active): manual multi-network USDT → public.orders
 *   POST /api/create-order, GET /api/order-status, ...
 *
 * NEW path (Stage 1 schema): payment intents → public.payment_intents etc.
 *   POST /api/payment-intents
 *   GET  /api/payment-intents/:id
 *   POST /api/payment-intents/:id/authorize
 *   POST /api/payment-intents/:id/execute   → LIVE CARD/ON-RAMP BLOCKED until providers configured
 *
 * Rules: no service role in browser; explicit per-purchase approval;
 * SUCCEEDED only after independent verification (not client claim).
 */

const MIN_CONFIRMATIONS = 20;
const AMOUNT_TOLERANCE = 0.005;

/** Official USDT (or BSC-USD) contracts — do not accept lookalikes */
const NETWORKS = {
  polygon: {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    chainIdHex: "0x89",
    usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    decimals: 6,
    nativeSymbol: "POL",
    explorer: "https://polygonscan.com",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    chainIdHex: "0x1",
    usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    nativeSymbol: "ETH",
    explorer: "https://etherscan.io",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    chainIdHex: "0xa4b1",
    usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    decimals: 6,
    nativeSymbol: "ETH",
    explorer: "https://arbiscan.io",
  },
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    chainIdHex: "0x2105",
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    decimals: 6,
    nativeSymbol: "ETH",
    explorer: "https://basescan.org",
  },
  bsc: {
    id: "bsc",
    name: "BNB Smart Chain",
    chainId: 56,
    chainIdHex: "0x38",
    usdt: "0x55d398326f99059ff775485246999027b3197955",
    decimals: 18,
    nativeSymbol: "BNB",
    explorer: "https://bscscan.com",
  },
};

function resolveNetwork(input) {
  if (!input) return NETWORKS.polygon;
  const s = String(input).trim().toLowerCase();
  if (NETWORKS[s]) return NETWORKS[s];
  const byChain = Object.values(NETWORKS).find(
    (n) => String(n.chainId) === s || n.chainIdHex.toLowerCase() === s
  );
  return byChain || NETWORKS.polygon;
}

function cleanEnv(v) {
  if (v == null) return "";
  return String(v).trim().replace(/^["']|["']$/g, "").replace(/\r/g, "").trim();
}

function supabaseBase(env) {
  let base = cleanEnv(env.SUPABASE_URL);
  if (!base) throw new Error("SUPABASE_URL secret is missing");
  base = base.replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) {
    throw new Error(
      "SUPABASE_URL must look like https://YOURPROJECT.supabase.co (no path, no quotes). Got: " +
        base.slice(0, 80)
    );
  }
  return base;
}

function supabaseKey(env) {
  const key = cleanEnv(env.SUPABASE_KEY);
  if (!key) throw new Error("SUPABASE_KEY secret is missing");
  return key;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.nexapulse.pro",
  "https://nexastore-baj.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function isValidEvmAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

function normalizeAddr(addr) {
  return String(addr || "").trim().toLowerCase();
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = allowed.length ? allowed : DEFAULT_ALLOWED_ORIGINS;
  const allowOrigin = list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sb(env, path, { method = "GET", body, prefer } = {}) {
  const base = supabaseBase(env);
  const key = supabaseKey(env);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const url = `${base}/rest/v1/${path}`;
  let r;
  try {
    r = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Supabase at ${base} (${e.message || e}). Re-check SUPABASE_URL secret.`
    );
  }
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`Supabase ${r.status}: ${msg}`);
  }
  return data;
}

async function getOrder(env, orderId) {
  const rows = await sb(
    env,
    `orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function txHashAlreadyUsed(env, txHash, exceptOrderId) {
  if (!txHash) return false;
  const q =
    `orders?onramp_transaction_id=eq.${encodeURIComponent(txHash)}` +
    `&select=id,status&limit=5`;
  const rows = await sb(env, q);
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some((r) => r.id !== exceptOrderId);
}

async function fetchTokenTxs(wallet, apiKey, network) {
  const contract = network.usdt;
  const chainId = network.chainId;
  const v2Url =
    `https://api.etherscan.io/v2/api?chainid=${chainId}` +
    `&module=account&action=tokentx` +
    `&contractaddress=${contract}&address=${wallet}` +
    `&page=1&offset=80&sort=desc&apikey=${apiKey}`;

  try {
    const chainRes = await fetch(v2Url);
    const chainData = await chainRes.json();
    if (Array.isArray(chainData.result)) {
      return { txs: chainData.result };
    }
    if (chainData.status === "1" && Array.isArray(chainData.result)) {
      return { txs: chainData.result };
    }
    if (
      typeof chainData.result === "string" &&
      /no transaction/i.test(chainData.result)
    ) {
      return { txs: [] };
    }
    return {
      txs: [],
      error: chainData.message || chainData.result || "Explorer API error",
    };
  } catch (e) {
    return { txs: [], error: e.message || "Explorer fetch failed" };
  }
}

function amountMatches(rawValue, expectedUsdt, decimals) {
  const expected = Number(expectedUsdt);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  const raw = BigInt(String(rawValue || "0"));
  const scale = 10n ** BigInt(decimals);
  // Compare as numbers with tolerance
  const actual = Number(raw) / Number(scale);
  if (!Number.isFinite(actual)) return false;
  const lo = expected * (1 - AMOUNT_TOLERANCE);
  const hi = expected * (1 + AMOUNT_TOLERANCE);
  return actual >= lo && actual <= hi;
}


/* =============================================================================
 * Stage 1+ payment intents (new schema). Live fiat/crypto acquisition BLOCKED
 * until CARD_* and LIQUIDITY_* secrets + provider adapters are configured.
 * ========================================================================== */

const INTENT_STATUSES = new Set([
  'CREATED','VALIDATING','AWAITING_AUTHORIZATION','AUTHORIZED','PROCESSING_FIAT',
  'FIAT_CAPTURED','ACQUIRING_CRYPTO','CRYPTO_AVAILABLE','EXECUTING','SUBMITTED',
  'CONFIRMING','SUCCEEDED','FAILED','CANCELLED','EXPIRED','REVIEW_REQUIRED','REVERSED',
]);

function liveProvidersConfigured(env) {
  return Boolean(
    cleanEnv(env.CARD_PROVIDER_SECRET_KEY) &&
    cleanEnv(env.LIQUIDITY_PROVIDER_SECRET_KEY)
  );
}

async function sbInsert(env, table, row) {
  const data = await sb(env, table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
  return Array.isArray(data) ? data[0] : data;
}

async function sbPatch(env, table, filter, row) {
  return sb(env, `${table}?${filter}`, {
    method: 'PATCH',
    body: row,
    prefer: 'return=representation',
  });
}

async function getIntent(env, id) {
  const rows = await sb(
    env,
    `payment_intents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function findIdempotency(env, platformId, key) {
  const rows = await sb(
    env,
    `idempotency_keys?platform_id=eq.${encodeURIComponent(platformId)}&idempotency_key=eq.${encodeURIComponent(key)}&select=*&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

/** Map legacy create-order body → still uses orders table (unchanged). */

async function handleCreatePaymentIntent(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }

  const platformKey = String(body.platform_key || 'nexastore').trim();
  const externalCustomerId = String(body.external_customer_id || body.customer_id || '').trim();
  const externalOrder = String(body.external_order_reference || body.order_id || '').trim();
  const idempotencyKey = String(
    body.idempotency_key || request.headers.get('Idempotency-Key') || ''
  ).trim();
  const fiatAmount = body.fiat_amount;
  const fiatCurrency = String(body.fiat_currency || 'USD').trim().toUpperCase().slice(0, 3);
  const productReference = body.product_reference || body.app_id || null;
  const productDescription = body.product_description || body.description || null;

  if (!externalCustomerId) return json({ error: 'external_customer_id required' }, 400, cors);
  if (!externalOrder) return json({ error: 'external_order_reference required' }, 400, cors);
  if (!idempotencyKey) return json({ error: 'idempotency_key required' }, 400, cors);
  if (fiatAmount == null || Number(fiatAmount) <= 0) {
    return json({ error: 'fiat_amount must be a positive number' }, 400, cors);
  }

  // Resolve platform
  let platforms = await sb(
    env,
    `platforms?slug=eq.${encodeURIComponent(platformKey)}&select=id,slug,status&limit=1`
  ).catch(() => null);
  // schema uses slug in official SQL; also try name
  if (!platforms || !platforms.length) {
    platforms = await sb(
      env,
      `platforms?name=eq.${encodeURIComponent(platformKey)}&select=id,slug,status,name&limit=1`
    ).catch(() => []);
  }
  const platform = Array.isArray(platforms) ? platforms[0] : null;
  if (!platform) {
    return json({
      error: 'Platform not registered. Insert nexastore into public.platforms first.',
      hint: "insert into platforms (name, slug) values ('NexaStore','nexastore');",
    }, 400, cors);
  }
  if (platform.status && platform.status !== 'active') {
    return json({ error: 'Platform disabled' }, 403, cors);
  }

  const existingIdem = await findIdempotency(env, platform.id, idempotencyKey).catch(() => null);
  if (existingIdem?.resource_id) {
    const existing = await getIntent(env, existingIdem.resource_id);
    if (existing) {
      return json({ payment_intent: publicIntent(existing), idempotent_replay: true }, 200, cors);
    }
  }

  // Upsert platform customer
  let customers = await sb(
    env,
    `platform_customers?platform_id=eq.${platform.id}&external_customer_id=eq.${encodeURIComponent(externalCustomerId)}&select=*&limit=1`
  );
  let customer = Array.isArray(customers) ? customers[0] : null;
  if (!customer) {
    customer = await sbInsert(env, 'platform_customers', {
      platform_id: platform.id,
      external_customer_id: externalCustomerId,
      email: body.email || null,
      display_name: body.display_name || null,
      status: 'active',
      metadata: {},
    });
  }

  // Optional wallet association (public address only)
  let customerWalletId = body.customer_wallet_id || null;
  if (!customerWalletId && body.wallet_address && isValidEvmAddress(body.wallet_address)) {
    const addr = body.wallet_address.trim();
    let wallets = await sb(
      env,
      `customer_wallets?platform_id=eq.${platform.id}&public_address=eq.${encodeURIComponent(addr)}&select=id&limit=1`
    ).catch(() => []);
    let w = Array.isArray(wallets) ? wallets[0] : null;
    if (!w) {
      w = await sbInsert(env, 'customer_wallets', {
        platform_id: platform.id,
        customer_id: customer.id,
        public_address: addr,
        chain_family: 'EVM',
        wallet_type: body.wallet_type || 'external',
        wallet_provider: body.wallet_provider || 'platform',
        ownership_verification_status: 'pending',
        status: 'active',
        metadata: {},
      });
    }
    customerWalletId = w.id;
  }

  // Settlement destination: server-side only — never trust client address
  let settlementDestinationId = body.settlement_destination_id || null;
  if (!settlementDestinationId && body.developer_reference) {
    const dests = await sb(
      env,
      `settlement_destinations?platform_id=eq.${platform.id}&developer_reference=eq.${encodeURIComponent(body.developer_reference)}&status=eq.active&verification_status=eq.verified&select=id&limit=1`
    ).catch(() => []);
    settlementDestinationId = Array.isArray(dests) && dests[0] ? dests[0].id : null;
  }

  const intentRow = {
    platform_id: platform.id,
    customer_id: customer.id,
    external_order_reference: externalOrder,
    product_reference: productReference,
    product_description: productDescription,
    payment_method_id: body.payment_method_id || null,
    customer_wallet_id: customerWalletId,
    settlement_destination_id: settlementDestinationId,
    fiat_amount: Number(fiatAmount),
    fiat_currency: fiatCurrency,
    expected_crypto_amount: body.expected_crypto_amount != null ? Number(body.expected_crypto_amount) : null,
    asset_id: body.asset_id || null,
    chain_id: body.chain_id || null,
    status: 'AWAITING_AUTHORIZATION',
    idempotency_key: idempotencyKey,
    expires_at: body.expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata: {
      source: 'nexapay_worker',
      client_meta: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    },
  };

  let intent;
  try {
    intent = await sbInsert(env, 'payment_intents', intentRow);
  } catch (e) {
    // unique violation → fetch existing
    const again = await sb(
      env,
      `payment_intents?platform_id=eq.${platform.id}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`
    ).catch(() => []);
    if (Array.isArray(again) && again[0]) {
      return json({ payment_intent: publicIntent(again[0]), idempotent_replay: true }, 200, cors);
    }
    throw e;
  }

  try {
    await sbInsert(env, 'idempotency_keys', {
      platform_id: platform.id,
      idempotency_key: idempotencyKey,
      request_hash: await sha256hex(JSON.stringify({
        externalCustomerId, externalOrder, fiatAmount, fiatCurrency, productReference,
      })),
      resource_type: 'payment_intent',
      resource_id: intent.id,
      response_status: 201,
      status: 'COMPLETED',
    });
  } catch { /* best effort */ }

  try {
    await sbInsert(env, 'audit_logs', {
      platform_id: platform.id,
      customer_id: customer.id,
      actor_type: 'system',
      actor_reference: 'nexapay-worker',
      action: 'payment_intent.created',
      resource_type: 'payment_intent',
      resource_id: intent.id,
      metadata: { external_order_reference: externalOrder },
    });
  } catch { /* best effort */ }

  return json({ payment_intent: publicIntent(intent) }, 201, cors);
}

function publicIntent(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    fiat_amount: row.fiat_amount,
    fiat_currency: row.fiat_currency,
    expected_crypto_amount: row.expected_crypto_amount,
    product_reference: row.product_reference,
    product_description: row.product_description,
    external_order_reference: row.external_order_reference,
    expires_at: row.expires_at,
    authorized_at: row.authorized_at,
    succeeded_at: row.succeeded_at,
    failed_at: row.failed_at,
    failure_code: row.failure_code,
    created_at: row.created_at,
    // never expose internal provider secrets
  };
}

async function sha256hex(s) {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleAuthorizePaymentIntent(request, env, cors, intentId) {
  let body = {};
  try {
    body = await request.json();
  } catch { /* empty ok */ }

  const intent = await getIntent(env, intentId);
  if (!intent) return json({ error: 'Payment intent not found' }, 404, cors);

  if (['SUCCEEDED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(intent.status)) {
    return json({ error: `Intent is terminal (${intent.status})`, payment_intent: publicIntent(intent) }, 409, cors);
  }
  if (intent.expires_at && new Date(intent.expires_at).getTime() < Date.now()) {
    await sbPatch(env, 'payment_intents', `id=eq.${intent.id}`, {
      status: 'EXPIRED',
      failed_at: new Date().toISOString(),
      failure_code: 'expired',
    }).catch(() => {});
    return json({ error: 'Payment intent expired' }, 410, cors);
  }
  if (!['CREATED', 'VALIDATING', 'AWAITING_AUTHORIZATION'].includes(intent.status)) {
    // already authorized or further — idempotent return
    if (['AUTHORIZED', 'PROCESSING_FIAT', 'FIAT_CAPTURED', 'ACQUIRING_CRYPTO', 'CRYPTO_AVAILABLE', 'EXECUTING', 'SUBMITTED', 'CONFIRMING'].includes(intent.status)) {
      return json({ payment_intent: publicIntent(intent), already_authorized: true }, 200, cors);
    }
    return json({ error: `Cannot authorize from status ${intent.status}` }, 409, cors);
  }

  // Bind approval to exact amount/currency/intent
  const approvedAmount = body.approved_amount != null ? Number(body.approved_amount) : Number(intent.fiat_amount);
  const approvedCurrency = String(body.approved_currency || intent.fiat_currency).toUpperCase();
  if (Math.abs(approvedAmount - Number(intent.fiat_amount)) > 0.0000001) {
    return json({ error: 'approved_amount does not match intent' }, 400, cors);
  }
  if (approvedCurrency !== String(intent.fiat_currency).toUpperCase()) {
    return json({ error: 'approved_currency does not match intent' }, 400, cors);
  }

  await sbInsert(env, 'authorization_records', {
    payment_intent_id: intent.id,
    customer_id: intent.customer_id,
    authorization_method: body.authorization_method || 'explicit_click',
    authorization_reference: body.authorization_reference || null,
    approved_amount: approvedAmount,
    approved_currency: approvedCurrency,
    destination_reference: intent.settlement_destination_id,
    status: 'APPROVED',
    approved_at: new Date().toISOString(),
    expires_at: intent.expires_at,
    request_metadata: { user_agent: request.headers.get('User-Agent') || null },
  }).catch(() => {});

  const updated = await sbPatch(env, 'payment_intents', `id=eq.${intent.id}`, {
    status: 'AUTHORIZED',
    authorized_at: new Date().toISOString(),
  });
  const row = Array.isArray(updated) ? updated[0] : intent;

  return json({ payment_intent: publicIntent(row || { ...intent, status: 'AUTHORIZED' }) }, 200, cors);
}

async function handleExecutePaymentIntent(request, env, cors, intentId) {
  const intent = await getIntent(env, intentId);
  if (!intent) return json({ error: 'Payment intent not found' }, 404, cors);

  if (intent.status === 'SUCCEEDED') {
    return json({ payment_intent: publicIntent(intent), already_succeeded: true }, 200, cors);
  }
  if (intent.status !== 'AUTHORIZED' && intent.status !== 'PROCESSING_FIAT') {
    return json({
      error: 'Intent must be AUTHORIZED before execute',
      status: intent.status,
      payment_intent: publicIntent(intent),
    }, 409, cors);
  }

  if (!liveProvidersConfigured(env)) {
    // Record blocked attempt — do not fake SUCCEEDED
    try {
      await sbInsert(env, 'payment_attempts', {
        payment_intent_id: intent.id,
        attempt_number: 1,
        operation_type: 'card_authorization',
        fiat_amount: intent.fiat_amount,
        fiat_currency: intent.fiat_currency,
        status: 'FAILED',
        failure_code: 'PROVIDERS_NOT_CONFIGURED',
        failure_reason: 'Live card/on-ramp blocked until CARD_PROVIDER_SECRET_KEY and LIQUIDITY_PROVIDER_SECRET_KEY are set',
        completed_at: new Date().toISOString(),
      });
    } catch { /* table may not exist on legacy-only DB */ }

    return json({
      error: 'LIVE_PROCESSING_BLOCKED',
      message: 'Card acquiring and fiat-to-USDT providers are not configured. Authorization was recorded; no charge was made.',
      payment_intent: publicIntent(intent),
      next_steps: [
        'Select card + liquidity providers',
        'Set Cloudflare secrets CARD_PROVIDER_SECRET_KEY and LIQUIDITY_PROVIDER_SECRET_KEY',
        'Implement provider adapters, then re-enable execute',
      ],
    }, 503, cors);
  }

  // Future: card capture → acquisition → chain settlement → SUCCEEDED
  return json({
    error: 'LIVE_PROCESSING_NOT_IMPLEMENTED',
    message: 'Provider adapters not implemented. No charge performed.',
    payment_intent: publicIntent(intent),
  }, 501, cors);
}

async function handleGetPaymentIntent(env, cors, intentId) {
  const intent = await getIntent(env, intentId);
  if (!intent) return json({ error: 'Payment intent not found' }, 404, cors);
  return json({ payment_intent: publicIntent(intent) }, 200, cors);
}


export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/networks" && request.method === "GET") {
      return json(
        {
          networks: Object.values(NETWORKS).map((n) => ({
            id: n.id,
            name: n.name,
            chainId: n.chainId,
            chainIdHex: n.chainIdHex,
            usdt: n.usdt,
            decimals: n.decimals,
            nativeSymbol: n.nativeSymbol,
            explorer: n.explorer,
          })),
          default: "polygon",
        },
        200,
        cors
      );
    }

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      try {
        const body = await request.json();
        const amount = Number(body.amount);
        const payTo = (body.pay_to || body.address || body.wallet || env.DEFAULT_PAY_TO || "").trim();
        const network = resolveNetwork(body.network || body.chain || body.chain_id || "polygon");
        const appId = body.app_id || body.appId || null;
        const email = body.email || body.receipt_email || null;

        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "Valid amount is required" }, 400, cors);
        }
        if (!isValidEvmAddress(payTo)) {
          return json(
            { error: "Valid pay_to (EVM) address is required" },
            400,
            cors
          );
        }

        const row = {
          amount,
          status: "pending",
          pay_to: normalizeAddr(payTo),
          network: network.id,
          chain_id: network.chainId,
          usdt_contract: network.usdt,
          confirmations: 0,
        };
        if (appId) row.app_id = appId;
        if (email) row.email = email;

        let order;
        try {
          const inserted = await sb(env, "orders", {
            method: "POST",
            body: row,
            prefer: "return=representation",
          });
          order = Array.isArray(inserted) ? inserted[0] : inserted;
        } catch (e) {
          // Schema without network columns — retry minimal
          const minimal = {
            amount,
            status: "pending",
            pay_to: normalizeAddr(payTo),
          };
          if (appId) minimal.app_id = appId;
          try {
            const inserted = await sb(env, "orders", {
              method: "POST",
              body: minimal,
              prefer: "return=representation",
            });
            order = Array.isArray(inserted) ? inserted[0] : inserted;
            order.pay_to = order.pay_to || normalizeAddr(payTo);
          } catch (e2) {
            throw e2;
          }
        }

        order.pay_to = order.pay_to || normalizeAddr(payTo);
        order.address = order.pay_to;
        order.network = network.id;
        order.chain_id = network.chainId;
        order.usdt_contract = network.usdt;
        order.decimals = network.decimals;
        order.network_name = network.name;
        order.native_symbol = network.nativeSymbol;
        order.explorer = network.explorer;
        order.chain_id_hex = network.chainIdHex;

        return json({ order }, 200, cors);
      } catch (err) {
        return json({ error: err.message || "create-order failed" }, 500, cors);
      }
    }

    if (
      (url.pathname === "/api/order-status" || url.pathname === "/api/check-payment") &&
      request.method === "GET"
    ) {
      try {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400, cors);
        let order = await getOrder(env, id);
        if (!order) return json({ error: "Order not found" }, 404, cors);

        const network = resolveNetwork(
          order.network || order.chain_id || url.searchParams.get("network") || "polygon"
        );
        const payTo = normalizeAddr(
          order.pay_to || order.deposit_address || env.DEFAULT_PAY_TO || ""
        );
        if (!isValidEvmAddress(payTo)) {
          return json(
            { error: "Order has no valid pay_to address", order },
            400,
            cors
          );
        }

        if (order.status === "completed" || order.status === "paid") {
          return json(
            {
              order: {
                ...order,
                network: network.id,
                network_name: network.name,
              },
              paid: true,
            },
            200,
            cors
          );
        }

        const apiKey = cleanEnv(env.POLYGONSCAN_API_KEY || env.ETHERSCAN_API_KEY);
        if (!apiKey) {
          return json(
            {
              order,
              paid: false,
              error: "Explorer API key not configured on worker",
            },
            200,
            cors
          );
        }

        const { txs, error: txErr } = await fetchTokenTxs(payTo, apiKey, network);
        if (txErr && (!txs || !txs.length)) {
          return json({ order, paid: false, explorer_error: txErr }, 200, cors);
        }

        const expected = Number(order.amount);
        const usdtLower = network.usdt.toLowerCase();
        const candidates = (txs || []).filter((tx) => {
          if (normalizeAddr(tx.to) !== payTo) return false;
          if (normalizeAddr(tx.contractAddress || tx.contractaddress) !== usdtLower)
            return false;
          const dec = Number(tx.tokenDecimal || network.decimals);
          return amountMatches(tx.value, expected, dec);
        });

        if (!candidates.length) {
          return json(
            {
              order: {
                ...order,
                network: network.id,
                network_name: network.name,
              },
              paid: false,
              pending: true,
            },
            200,
            cors
          );
        }

        // Prefer highest confirmation count
        candidates.sort(
          (a, b) => Number(b.confirmations || 0) - Number(a.confirmations || 0)
        );
        const best = candidates[0];
        const conf = Number(best.confirmations || 0);
        const txHash = best.hash || best.transactionHash;

        if (await txHashAlreadyUsed(env, txHash, order.id)) {
          return json(
            {
              order,
              paid: false,
              error: "This transaction was already used for another order",
            },
            200,
            cors
          );
        }

        // Update confirmations
        try {
          await sb(env, `orders?id=eq.${encodeURIComponent(order.id)}`, {
            method: "PATCH",
            body: {
              confirmations: conf,
              onramp_transaction_id: txHash || undefined,
            },
          });
        } catch {}

        if (conf < MIN_CONFIRMATIONS) {
          order.confirmations = conf;
          order.onramp_transaction_id = txHash;
          return json(
            {
              order: {
                ...order,
                network: network.id,
                network_name: network.name,
              },
              paid: false,
              pending: true,
              confirmations: conf,
              required: MIN_CONFIRMATIONS,
              txHash,
            },
            200,
            cors
          );
        }

        // Mark completed
        try {
          await sb(env, `orders?id=eq.${encodeURIComponent(order.id)}`, {
            method: "PATCH",
            body: {
              status: "completed",
              confirmations: conf,
              onramp_transaction_id: txHash,
            },
          });
        } catch (e) {
          return json({ error: e.message, order }, 500, cors);
        }

        order = await getOrder(env, id);
        return json(
          {
            order: {
              ...order,
              network: network.id,
              network_name: network.name,
            },
            paid: true,
            txHash,
            confirmations: conf,
          },
          200,
          cors
        );
      } catch (err) {
        return json({ error: err.message || "order-status failed" }, 500, cors);
      }
    }

    // ----- New payment-intent API (Stage 1 schema) -----
    if (url.pathname === "/api/payment-intents" && request.method === "POST") {
      try {
        return await handleCreatePaymentIntent(request, env, cors);
      } catch (err) {
        return json({ error: err.message || "create payment intent failed" }, 500, cors);
      }
    }

    const intentMatch = url.pathname.match(
      /^\/api\/payment-intents\/([0-9a-fA-F-]{36})(\/authorize|\/execute)?$/
    );
    if (intentMatch) {
      const intentId = intentMatch[1];
      const action = intentMatch[2] || "";
      try {
        if (request.method === "GET" && !action) {
          return await handleGetPaymentIntent(env, cors, intentId);
        }
        if (request.method === "POST" && action === "/authorize") {
          return await handleAuthorizePaymentIntent(request, env, cors, intentId);
        }
        if (request.method === "POST" && action === "/execute") {
          return await handleExecutePaymentIntent(request, env, cors, intentId);
        }
      } catch (err) {
        return json({ error: err.message || "payment intent error" }, 500, cors);
      }
    }

    if (url.pathname === "/api/health" || url.pathname === "/health") {
      return json(
        {
          ok: true,
          service: "nexapay-gateway",
          legacy_orders: true,
          payment_intents: true,
          live_providers: liveProvidersConfigured(env),
          live_processing: liveProvidersConfigured(env) ? "ADAPTERS_PENDING" : "BLOCKED",
        },
        200,
        cors
      );
    }

    return json({ error: "Not found", path: url.pathname }, 404, cors);
  },
};
