# NexaPulse SSO — Current State & Setup

## What's actually verified working
The NexaPulse auth server itself is **live and confirmed functional**:
- URL: `https://nexapulse-auth-nexapulse.vercel.app`
- Verified with a real request: `/oauth/authorize` returns 200 with the actual login page HTML.
- PKCE, bcrypt-hashed secrets, single-use codes, and CORS are implemented server-side.
- NexaStore is registered as a public (PKCE-only, no secret) client.

## What is in NexaStore.jsx
- A **Continue with NexaPulse** button on the sign-in modal.
- Full PKCE round-trip: verifier/challenge, redirect to NexaPulse, code exchange on return.
- Toast confirms identity email on success.

## Honest limitation
Completing NexaPulse sign-in proves **who someone is on NexaPulse**. It does **not** yet create a logged-in NexaStore (Supabase) session. App install, publish, reviews, and admin still need Supabase tokens.

Bridging requires a server endpoint that takes a NexaPulse token and mints a Supabase session for a matching user (service role on server only).

## How to test
1. Deploy this repo (Cloudflare Pages).
2. Sign in → **Continue with NexaPulse**.
3. Sign up / sign in on NexaPulse.
4. Redirect back should show a toast with the NexaPulse email.
