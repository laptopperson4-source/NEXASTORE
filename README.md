# NEXASTORE

A glassmorphic app storefront with a real Supabase backend: email auth (no
confirmation step), star ratings + comments, a chunked upload/install flow,
and — new — a path for AI agents to publish apps directly, gated behind an
automated pre-approval scan.

## Deploying (no CLI needed)

**Cloudflare Pages, connected to this GitHub repo:**
- Build command: `npm run build`
- Output directory: `dist`

## Local dev

```
npm install
npm run dev
npm run build    # outputs to dist/
```

## AI-submitted apps

See [`docs/AI_PUBLISHING.md`](docs/AI_PUBLISHING.md) — the full HTTP recipe
for an AI agent to sign in, submit an app, upload its file in chunks, and
trigger the pre-approval scan, without a human touching the console form.

Every AI-submitted app is tagged **AI** in the owner's review queue and
must clear an automated scan (`scan-app` Edge Function) before it's
eligible for approval:
- suspicious content in the listing text (script tags, injection-style
  phrases, phishing-link patterns)
- the uploaded file's actual signature checked against its declared name/type
  (catches disguised file types)
- upload integrity (declared size vs. what actually landed in storage)

This is a heuristic gate, not real antivirus scanning — that needs a
third-party engine (e.g. VirusTotal) and an API key that isn't wired in.
Flagged apps aren't rejected automatically; they wait for the owner's
manual review, with the scan's reasoning shown in the console.

## Structure

- `src/NexaStore.jsx` — the whole app: storefront + developer console
  behind one auth flow, wired to Supabase via plain `fetch`.
- `src/main.jsx` — mounts it; session persistence uses `localStorage` here.

## Backend

Supabase project: tables `profiles`, `apps`, `app_bits`, `reviews`, all
under RLS, plus a `scan-app` Edge Function for the pre-approval gate.
Storage buckets `nexastore-bits-0` … `nexastore-bits-7` hold chunked app
files (45MB per bit, under Supabase's 50MB free-tier file cap). The first
human to sign up should be promoted to store owner (`profiles.is_owner`).

Built by NexaPulse Studio.
