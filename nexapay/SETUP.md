# NexaPay — Setup & Integration Guide

Crypto-only payment widget. Customers pay in **USDT on Polygon**. Funds go straight to your MetaMask wallet.

**Your live Worker:** `https://nexapay-gateway.laptopperson4.workers.dev`  
**Receiving wallet:** `0xF8720081dc56427AB7851fda9F05754304f0bfb2`

---

## What’s in this package

```
nexapay-release/
├── SETUP.md                 ← this file
├── worker/                  ← Cloudflare Worker (already deployed for you)
│   ├── src/index.js
│   ├── wrangler.toml
│   ├── package.json
│   └── supabase-schema.sql
└── widget/
    └── nexapay-widget.html  ← embeddable checkout widget
```

---

## 1. Host the widget (required)

Upload `widget/nexapay-widget.html` to any static host:

| Host | How |
|------|-----|
| **Cloudflare Pages** | Create project → upload the `widget` folder (or drag the HTML file) |
| Netlify / Vercel | Drag & drop the file or connect a repo |
| Your own server | Put the file on any HTTPS domain |

You will get a public URL, for example:

```
https://nexapay-widget.pages.dev/nexapay-widget.html
```

**Important:** The widget must be served over **HTTPS** (iframes and clipboard work better).

---

## 2. Embed the widget in your store

### Basic embed (fixed amount)

```html
<iframe
  src="https://YOUR_WIDGET_HOST/nexapay-widget.html?amount=49.99"
  title="NexaPay"
  width="400"
  height="560"
  style="border: none; border-radius: 16px; max-width: 100%; background: transparent;"
  allow="clipboard-write"
></iframe>
```

### Dynamic amount (from your product price)

```html
<iframe
  id="nexapay-frame"
  title="NexaPay"
  width="400"
  height="560"
  style="border: none; border-radius: 16px; max-width: 100%;"
  allow="clipboard-write"
></iframe>

<script>
  // Set amount from your product (example: 29.99 USDT)
  const price = 29.99;
  document.getElementById("nexapay-frame").src =
    "https://YOUR_WIDGET_HOST/nexapay-widget.html?amount=" + price;
</script>
```

### Listen for successful payment

```html
<script>
  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "nexapay:success") {
      const orderId = event.data.orderId;
      console.log("Payment completed:", orderId);

      // Your store logic, e.g.:
      // - unlock digital download
      // - mark order as paid in your database
      // - redirect to thank-you page
      // window.location.href = "/thank-you?order=" + orderId;
    }
  });
</script>
```

---

## 3. Customer flow (what they see)

1. Enter email → Continue  
2. Widget shows exact **USDT** amount + QR + your wallet address  
3. Customer sends USDT on **Polygon**  
4. Widget detects payment (or you confirm) → Success screen  
5. Your page receives `nexapay:success` message

---

## 4. Optional — auto-confirm payments (Polygonscan)

Without this, orders stay `pending` until something marks them completed.  
With a free Polygonscan API key, the Worker can detect USDT deposits automatically.

1. Get a free key: https://polygonscan.com/apis  
2. In the `worker` folder:

```powershell
$env:CLOUDFLARE_API_TOKEN = "your_cloudflare_token"
echo "YOUR_POLYGONSCAN_KEY" | npx wrangler secret put POLYGONSCAN_API_KEY
npx wrangler deploy
```

---

## 5. Recommended text for your store

Use this (or similar) on product / checkout pages:

> **Payments are accepted in USDT only (Polygon network).**  
> Don’t have USDT? Buy some with a card on [MoonPay](https://www.moonpay.com/buy) or your preferred exchange, then send the exact amount shown at checkout.

One-tap wallet (optional button on your page):

```html
<a
  href="https://metamask.app.link/dapp/"
  target="_blank"
  rel="noopener"
  style="display:inline-block;padding:10px 16px;background:#7c3aed;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;"
>
  Open MetaMask
</a>
```

(You can also use `https://link.trustwallet.com` or similar deep links.)

---

## 6. API reference (Worker)

Base URL: `https://nexapay-gateway.laptopperson4.workers.dev`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/create-order` | Body: `{ "email": "...", "amount": 49.99 }` |
| GET | `/api/order-status?id=UUID` | Poll order status |
| GET | `/api/check-payment?id=UUID&amount=49.99` | Try to detect on-chain USDT payment |
| POST | `/api/webhook` | Reserved for future on-ramp webhooks |

---

## 7. Checklist

- [x] Supabase `orders` table created  
- [x] Worker deployed + secrets set  
- [ ] Widget HTML hosted on HTTPS  
- [ ] iframe added to store checkout/product page  
- [ ] `postMessage` listener added (optional but recommended)  
- [ ] Polygonscan key added (optional, for auto-confirm)  
- [ ] Store copy updated: “USDT on Polygon only”

---

## Support notes

- **Network must be Polygon.** USDT on Ethereum/Tron/etc. will not be detected and can be lost.  
- Minimum amount in widget config: 5 USDT (changeable in the HTML `CONFIG`).  
- Wallet address is fixed in the widget; change `METAMASK_ADDRESS` in `nexapay-widget.html` if you rotate wallets.
