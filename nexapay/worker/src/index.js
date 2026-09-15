/**
 * NexaPay — multi-network USDT payment gateway (Cloudflare Worker)
 * Non-custodial: buyers send USDT; worker verifies on-chain then marks order paid.
 *
 * Supported EVM networks: Polygon, Ethereum, Arbitrum, Base, BSC
 *
 * P0 security:
 * - CORS allowlist
 * - EVM address validation + locked pay_to on each order
 * - Official USDT contract per chain only
 * - Amount match (strict window, correct decimals)
 * - Multi-block confirmations before completed
 * - Unique txHash (no double-credit)
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
    usdt: "0xfde4c96c8593536e31f126d2f3f4e1f5cbb7bd8c",
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

    return json({ error: "Not found", path: url.pathname }, 404, cors);
  },
};
