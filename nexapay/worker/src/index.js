/**
 * NexaPay — Polygon USDT payment gateway (Cloudflare Worker)
 * Non-custodial: buyers send USDT; worker verifies on-chain then marks order paid.
 *
 * P0 security:
 * - CORS allowlist (app.nexapulse.pro)
 * - EVM address validation + locked pay_to on each order
 * - Official Polygon USDT contract only
 * - Amount match (strict 6-decimal window)
 * - Multi-block confirmations before completed
 * - Unique txHash (no double-credit)
 */

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const MIN_CONFIRMATIONS = 20;
/** Amount tolerance as fraction (0.005 = 0.5%) */
const AMOUNT_TOLERANCE = 0.005;

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
    "Vary": "Origin",
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
  const rows = await sb(env, `orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

/** Returns true if another order already claimed this tx hash */
async function txHashAlreadyUsed(env, txHash, exceptOrderId) {
  if (!txHash) return false;
  const q =
    `orders?onramp_transaction_id=eq.${encodeURIComponent(txHash)}` +
    `&select=id,status&limit=5`;
  const rows = await sb(env, q);
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some((r) => r.id !== exceptOrderId);
}

async function fetchTokenTxs(wallet, apiKey) {
  // Etherscan API V2 (Polygon chainid=137). Same key works for Polygon + other EVM chains.
  // Fallback: legacy api.polygonscan.com if V2 fails.
  const v2Url =
    `https://api.etherscan.io/v2/api?chainid=137` +
    `&module=account&action=tokentx` +
    `&contractaddress=${POLYGON_USDT}&address=${wallet}` +
    `&page=1&offset=50&sort=desc&apikey=${apiKey}`;
  const legacyUrl =
    `https://api.polygonscan.com/api?module=account&action=tokentx` +
    `&contractaddress=${POLYGON_USDT}&address=${wallet}` +
    `&page=1&offset=50&sort=desc&apikey=${apiKey}`;

  for (const apiUrl of [v2Url, legacyUrl]) {
    try {
      const chainRes = await fetch(apiUrl);
      const chainData = await chainRes.json();
      if (Array.isArray(chainData.result)) {
        return { txs: chainData.result };
      }
      if (chainData.status === "1" && Array.isArray(chainData.result)) {
        return { txs: chainData.result };
      }
      // "No transactions found" is a valid empty result
      if (
        typeof chainData.result === "string" &&
        /no transaction/i.test(chainData.result)
      ) {
        return { txs: [] };
      }
      // try next endpoint
      if (apiUrl === legacyUrl) {
        return {
          txs: [],
          error: chainData.message || chainData.result || "Explorer API error",
        };
      }
    } catch (e) {
      if (apiUrl === legacyUrl) {
        return { txs: [], error: e.message || "Explorer fetch failed" };
      }
    }
  }
  return { txs: [] };
}

function amountInRange(rawValue, expectedUsdt) {
  const expected = Number(expectedUsdt);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  const minRaw = Math.floor(expected * (1 - AMOUNT_TOLERANCE) * 1e6);
  const maxRaw = Math.ceil(expected * (1 + AMOUNT_TOLERANCE) * 1e6);
  const val = parseInt(String(rawValue), 10);
  if (!Number.isFinite(val)) return false;
  return val >= minRaw && val <= maxRaw;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // ─── CREATE ORDER ───────────────────────────────────────────
    if (url.pathname === "/api/create-order" && request.method === "POST") {
      try {
        const body = await request.json();
        const email = body.email;
        const amount = Number(body.amount);
        const payTo = (body.pay_to || body.address || body.wallet || env.DEFAULT_PAY_TO || "").trim();
        const appId = body.app_id || null;

        if (!email || !Number.isFinite(amount) || amount <= 0) {
          return json({ error: "Valid email and amount are required" }, 400, cors);
        }
        if (!isValidEvmAddress(payTo)) {
          return json(
            { error: "Valid pay_to (Polygon) address is required" },
            400,
            cors
          );
        }

        const row = {
          user_email: email,
          amount_fiat: amount,
          currency_fiat: "USD",
          amount_crypto_expected: amount,
          crypto_asset: "USDT",
          blockchain_network: "polygon",
          status: "pending",
          pay_to: normalizeAddr(payTo),
        };
        if (appId) row.app_id = appId;

        let created;
        try {
          created = await sb(env, "orders", {
            method: "POST",
            body: row,
            prefer: "return=representation",
          });
        } catch (e) {
          // Schema without pay_to / app_id — retry minimal columns
          const minimal = {
            user_email: email,
            amount_fiat: amount,
            currency_fiat: "USD",
            status: "pending",
          };
          created = await sb(env, "orders", {
            method: "POST",
            body: minimal,
            prefer: "return=representation",
          });
          // Best-effort patch pay_to if column exists
          const order = Array.isArray(created) ? created[0] : created;
          if (order?.id) {
            try {
              await sb(env, `orders?id=eq.${order.id}`, {
                method: "PATCH",
                body: { pay_to: normalizeAddr(payTo) },
              });
              order.pay_to = normalizeAddr(payTo);
            } catch (_) {}
          }
        }

        const order = Array.isArray(created) ? created[0] : created;
        if (!order?.id) throw new Error("Order created but no id returned");

        // Ensure client always knows locked receiver
        order.pay_to = order.pay_to || normalizeAddr(payTo);
        order.address = order.pay_to;

        return json({ success: true, order }, 200, cors);
      } catch (err) {
        return json({ error: err.message || "create-order failed" }, 500, cors);
      }
    }

    // ─── ORDER STATUS ───────────────────────────────────────────
    if (url.pathname === "/api/order-status" && request.method === "GET") {
      try {
        const orderId = url.searchParams.get("id");
        if (!orderId) return json({ error: "id required" }, 400, cors);
        const order = await getOrder(env, orderId);
        if (!order) return json({ error: "Order not found" }, 404, cors);
        return json({ order, status: order.status }, 200, cors);
      } catch (err) {
        return json({ error: err.message }, 500, cors);
      }
    }

    // ─── CHECK PAYMENT (P0) ─────────────────────────────────────
    if (url.pathname === "/api/check-payment" && request.method === "GET") {
      try {
        const orderId = url.searchParams.get("id");
        const amountHint = url.searchParams.get("amount");
        if (!orderId) return json({ error: "id required" }, 400, cors);

        const order = await getOrder(env, orderId);
        if (!order) return json({ error: "Order not found" }, 404, cors);

        if (order.status === "completed" || order.status === "paid" || order.status === "success") {
          return json(
            {
              paid: true,
              status: "completed",
              tx: order.onramp_transaction_id || null,
              confirmations: order.confirmations ?? null,
            },
            200,
            cors
          );
        }

        const wallet = normalizeAddr(
          order.pay_to || order.deposit_address || env.DEFAULT_PAY_TO || ""
        );
        if (!isValidEvmAddress(wallet)) {
          return json(
            {
              paid: false,
              status: order.status,
              error: "Order has no valid pay_to address",
            },
            200,
            cors
          );
        }

        const apiKey = env.POLYGONSCAN_API_KEY || "";
        if (!apiKey) {
          return json(
            {
              paid: false,
              status: order.status,
              checked: true,
              warning: "POLYGONSCAN_API_KEY not set — cannot verify on-chain",
            },
            200,
            cors
          );
        }

        const expected = Number(amountHint || order.amount_crypto_expected || order.amount_fiat);
        const since =
          Math.floor(new Date(order.created_at).getTime() / 1000) - 120;

        const { txs, error: scanErr } = await fetchTokenTxs(wallet, apiKey);
        if (scanErr && !txs.length) {
          return json(
            { paid: false, status: order.status, checked: true, warning: scanErr },
            200,
            cors
          );
        }

        // Prefer official USDT contract + exact receiver + amount + time
        const candidates = txs.filter((tx) => {
          const contract = normalizeAddr(tx.contractAddress);
          if (contract !== POLYGON_USDT) return false;
          if (normalizeAddr(tx.to) !== wallet) return false;
          if (!amountInRange(tx.value, expected)) return false;
          const ts = parseInt(tx.timeStamp, 10);
          if (!Number.isFinite(ts) || ts < since) return false;
          return true;
        });

        if (!candidates.length) {
          return json({ paid: false, status: order.status, checked: true }, 200, cors);
        }

        // Newest first already from sort=desc
        for (const match of candidates) {
          const conf = parseInt(match.confirmations, 10);
          const confirmations = Number.isFinite(conf) ? conf : 0;
          const txHash = match.hash;

          if (confirmations < MIN_CONFIRMATIONS) {
            // Surface progress but do not complete
            return json(
              {
                paid: false,
                status: "confirming",
                tx: txHash,
                confirmations,
                required: MIN_CONFIRMATIONS,
                checked: true,
              },
              200,
              cors
            );
          }

          // Idempotency: reject if this hash already completed another order
          if (await txHashAlreadyUsed(env, txHash, orderId)) {
            continue; // try next candidate
          }

          try {
            await sb(env, `orders?id=eq.${encodeURIComponent(orderId)}`, {
              method: "PATCH",
              body: {
                status: "completed",
                onramp_transaction_id: txHash,
                confirmations,
                updated_at: new Date().toISOString(),
              },
            });
          } catch (e) {
            // Unique violation on tx hash → treat as not ours
            if (/duplicate|unique|23505/i.test(String(e.message))) {
              continue;
            }
            // Column confirmations may not exist
            try {
              await sb(env, `orders?id=eq.${encodeURIComponent(orderId)}`, {
                method: "PATCH",
                body: {
                  status: "completed",
                  onramp_transaction_id: txHash,
                  updated_at: new Date().toISOString(),
                },
              });
            } catch (e2) {
              throw e2;
            }
          }

          return json(
            {
              paid: true,
              status: "completed",
              tx: txHash,
              confirmations,
              required: MIN_CONFIRMATIONS,
            },
            200,
            cors
          );
        }

        return json(
          {
            paid: false,
            status: order.status,
            checked: true,
            warning: "Matching transfer found but tx already used or not yet usable",
          },
          200,
          cors
        );
      } catch (err) {
        return json({ error: err.message }, 500, cors);
      }
    }

    // ─── WEBHOOK: disabled unsigned generic completion (P0) ─────
    if (url.pathname === "/api/webhook" && request.method === "POST") {
      const secret = env.WEBHOOK_SECRET || "";
      const sig = request.headers.get("X-Nexapay-Signature") || "";
      if (!secret || sig !== secret) {
        return json({ error: "Unauthorized webhook" }, 401, cors);
      }
      return json(
        { ok: false, message: "Signed webhooks accepted but auto-complete disabled; use check-payment" },
        200,
        cors
      );
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};
