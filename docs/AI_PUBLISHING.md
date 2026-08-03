# Publishing an app to NexaStore as an AI agent

This is the recipe for an AI agent (a Claude Code session, another Claude
conversation with code execution, or any script) to submit a finished app
to NexaStore end-to-end — no human filling out the console form.

Every step is a plain HTTP call. No SDK required.

```
SUPABASE_URL = https://mapswtriwoxlscjdakpk.supabase.co
ANON_KEY     = <the anon key embedded in nexastore.jsx>
```

## 1. Sign in as the AI publisher account

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
headers: { apikey: ANON_KEY, Content-Type: application/json }
body: { "email": "ai-publisher@nexastore.dev", "password": "<see below>" }
```

Save `access_token` from the response — every following call sends it as
`Authorization: Bearer <access_token>` (plus the `apikey` header on every
call, always the anon key).

The password isn't written here — ask the person running NexaStore for it,
or if you're Claude picking this up mid-project, check whether it's in
memory/notes before asking again.

## 2. Create the app row — mark it as AI-submitted

```
POST {SUPABASE_URL}/rest/v1/apps
headers: { apikey, Authorization, Content-Type: application/json, Prefer: return=representation }
body: {
  "dev_id": "<the AI publisher's user id, from step 1's response>",
  "name": "...", "tagline": "...", "description": "...",
  "category": "Productivity" | "Business" | "Tools" | "Games" | "Social" | "Photography" | "Finance" | "Education",
  "price": 0, "version": "1.0.0", "release_notes": "...",
  "submitted_by": "ai",
  "file_name": "myapp.zip", "file_type": "application/zip",
  "total_size_bytes": <file size>, "bit_count": <ceil(size / 47185920)>,
  "bit_size_bytes": 47185920
}
```

This returns the new app's `id`. Setting `submitted_by: "ai"` automatically
puts it in `scan_status: "pending"` — it can't be approved until it clears
the scan in step 4.

## 3. Upload the file, split into bits

Bits are capped at 45MB (47185920 bytes) each, spread round-robin across
8 storage buckets so no single upload exceeds Supabase's 50MB free-tier
per-file limit.

For each bit `i` (0-indexed):

```
bucket = `nexastore-bits-${i % 8}`
path   = `${app_id}/${i}`

POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
headers: { apikey, Authorization, Content-Type: <file mime type>, x-upsert: true }
body: <raw bytes of this chunk>
```

Then record it:

```
POST {SUPABASE_URL}/rest/v1/app_bits
headers: { apikey, Authorization, Content-Type: application/json, Prefer: return=representation }
body: { "app_id": "...", "bit_index": i, "bucket_id": "...", "storage_path": "...", "size_bytes": <chunk size> }
```

## 4. Trigger the scan

```
POST {SUPABASE_URL}/functions/v1/scan-app
headers: { apikey, Authorization, Content-Type: application/json }
body: { "app_id": "..." }
```

Returns `{ scan_status: "clean" | "flagged", scan_notes: "..." }`. This is
a heuristic check (suspicious text patterns, file-signature mismatch,
upload-integrity check) — not a full antivirus scan, since that needs a
third-party API key that isn't wired in yet. `clean` apps are eligible for
owner approval; `flagged` ones need the owner's manual sign-off in the
console (they'll see your scan_notes explaining why).

## Done

The app now shows up in the owner's review queue, tagged **AI** with its
scan result, same as anything else pending review. Nothing else to do —
approval is the human owner's call, same as a human developer's submission.
