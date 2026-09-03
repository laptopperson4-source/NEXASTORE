/**
 * NexaPay — Fiat-to-Crypto Payment Gateway
 * Cloudflare Workers + Supabase + Polygon USDT
 * Settlement: Polygon USDT (crypto-only, non-custodial)
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ─── CREATE ORDER ───────────────────────────────────────────
    if (url.pathname === "/api/create-order" && request.method === "POST") {
      try {
        const { email, amount } = await request.json();

        if (!email || !amount || amount <= 0) {
          return new Response(
            JSON.stringify({ error: "Valid email and amount are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders`,
          {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              user_email: email,
              amount_fiat: amount,
              currency_fiat: "USD",
              status: "pending",
            }),
          }
        );

        if (!supabaseResponse.ok) {
          throw new Error(`Supabase error: ${await supabaseResponse.text()}`);
        }

        const data = await supabaseResponse.json();
        const createdOrder = data[0];

        return new Response(
          JSON.stringify({ success: true, order: createdOrder }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── WEBHOOK (Transak + generic) ────────────────────────────
    if (url.pathname === "/api/webhook" && request.method === "POST") {
      try {
        const payload = await request.json();

        // Transak can send:
        // 1) Direct order object
        // 2) { eventID, webhookData: { ... } }
        // 3) { data: "<JWT>" }  — JWT needs Partner Access Token to decode (advanced)
        // We handle 1 & 2 for MVP; JWT path can be added later.

        let orderData = payload.webhookData || payload.data || payload;
        if (typeof orderData === "string") {
          // Encrypted JWT — acknowledge but skip update until JWT verify is wired
          console.log("Transak JWT webhook received — decoding not configured yet");
          return new Response(JSON.stringify({ received: true, note: "jwt_pending" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Extract partner order id (our Supabase UUID)
        const orderId =
          orderData.partnerOrderId ||
          orderData.partner_order_id ||
          payload.partnerOrderId ||
          payload.partnerContext ||
          payload.metaData?.orderId ||
          payload.metadata?.orderId;

        // Normalize status
        const rawStatus = (
          orderData.status ||
          payload.status ||
          payload.eventID ||
          ""
        ).toString().toUpperCase();

        const isCompleted =
          rawStatus === "COMPLETED" ||
          rawStatus === "ORDER_COMPLETED" ||
          rawStatus === "SUCCESS" ||
          rawStatus === "FULFILLED";

        const isFailed =
          rawStatus === "FAILED" ||
          rawStatus === "CANCELLED" ||
          rawStatus === "ORDER_FAILED" ||
          rawStatus === "REFUNDED" ||
          rawStatus === "EXPIRED";

        if (orderId && (isCompleted || isFailed)) {
          const newStatus = isCompleted ? "completed" : "failed";
          const txId =
            orderData.id ||
            orderData.orderId ||
            payload.id ||
            payload.orderId ||
            null;

          const updateResponse = await fetch(
            `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`,
            {
              method: "PATCH",
              headers: {
                apikey: env.SUPABASE_KEY,
                Authorization: `Bearer ${env.SUPABASE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                status: newStatus,
                onramp_transaction_id: txId,
                updated_at: new Date().toISOString(),
              }),
            }
          );

          if (!updateResponse.ok) {
            throw new Error(`Failed to update order: ${await updateResponse.text()}`);
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── HEALTH ─────────────────────────────────────────────────
    if (url.pathname === "/api/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "nexapay",
          onramp: "transak",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ORDER STATUS ───────────────────────────────────────────
    if (url.pathname === "/api/order-status" && request.method === "GET") {
      try {
        const orderId = url.searchParams.get("id");
        if (!orderId) {
          return new Response(JSON.stringify({ error: "Order ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const supabaseResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`,
          {
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );

        if (!supabaseResponse.ok) {
          throw new Error(`Supabase error: ${await supabaseResponse.text()}`);
        }

        const data = await supabaseResponse.json();
        if (!data || data.length === 0) {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ order: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // ─── CHECK PAYMENT (Polygon USDT watcher helper) ──────────
    // Call this periodically from the frontend. For production,
    // set env POLYGONSCAN_API_KEY (free at polygonscan.com).
    // Without a key we still return ok so polling order-status works.
    if (url.pathname === "/api/check-payment" && request.method === "GET") {
      try {
        const orderId = url.searchParams.get("id");
        const amount = parseFloat(url.searchParams.get("amount") || "0");
        if (!orderId) {
          return new Response(JSON.stringify({ error: "id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch order
        const orderRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`,
          {
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );
        const orders = await orderRes.json();
        if (!orders?.length) {
          return new Response(JSON.stringify({ error: "order not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const order = orders[0];
        if (order.status === "completed") {
          return new Response(JSON.stringify({ status: "completed", order }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Optional: Polygonscan token transfer check
        // USDT on Polygon: 0xc2132D05D31c914a87C6611C10748AEb04B58e8F
        // Wallet: 0xF8720081dc56427AB7851fda9F05754304f0bfb2
        const wallet = "0xF8720081dc56427AB7851fda9F05754304f0bfb2";
        const usdt = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
        const apiKey = env.POLYGONSCAN_API_KEY || "";

        if (apiKey) {
          const expected = amount || Number(order.amount_fiat);
          // amounts are in token units with 6 decimals for USDT
          const minRaw = Math.floor(expected * 0.98 * 1e6); // 2% tolerance
          const maxRaw = Math.floor(expected * 1.02 * 1e6);
          const since = Math.floor(new Date(order.created_at).getTime() / 1000) - 60;

          const apiUrl =
            `https://api.polygonscan.com/api?module=account&action=tokentx` +
            `&contractaddress=${usdt}&address=${wallet}&startblock=0&endblock=99999999` +
            `&sort=desc&apikey=${apiKey}`;

          const chainRes = await fetch(apiUrl);
          const chainData = await chainRes.json();
          const txs = chainData.result || [];

          const match = Array.isArray(txs)
            ? txs.find((tx) => {
                if (tx.to?.toLowerCase() !== wallet.toLowerCase()) return false;
                const val = parseInt(tx.value, 10);
                const ts = parseInt(tx.timeStamp, 10);
                return val >= minRaw && val <= maxRaw && ts >= since;
              })
            : null;

          if (match) {
            await fetch(
              `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`,
              {
                method: "PATCH",
                headers: {
                  apikey: env.SUPABASE_KEY,
                  Authorization: `Bearer ${env.SUPABASE_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  status: "completed",
                  onramp_transaction_id: match.hash,
                  updated_at: new Date().toISOString(),
                }),
              }
            );
            return new Response(
              JSON.stringify({ status: "completed", tx: match.hash }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        return new Response(
          JSON.stringify({ status: order.status, checked: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
