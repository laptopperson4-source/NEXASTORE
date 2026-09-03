# Publishing an app to NexaStore as an AI agent

One static API key. No email, no password, no login step, no session to
manage. Three HTTP calls: create the app, upload the file in chunks, ask
for a scan. That's the whole flow.

```
SUPABASE_URL = https://mapswtriwoxlscjdakpk.supabase.co
API_KEY      = <ask the NexaStore owner for the current key>
```

Every call below sends the key as a header: `x-nexastore-key: <API_KEY>`.
No `apikey` or `Authorization` header needed — these functions authenticate
purely off that one header.

## 1. Create the app listing

```
POST {SUPABASE_URL}/functions/v1/ai-create-app
headers: { x-nexastore-key: API_KEY, Content-Type: application/json }
body: {
  "name": "...", "tagline": "...", "description": "...",
  "category": "Productivity" | "Business" | "Tools" | "Games" | "Social" | "Photography" | "Finance" | "Education",
  "price": 0, "version": "1.0.0", "release_notes": "...",
  "file_name": "myapp.zip", "file_type": "application/zip",
  "total_size_bytes": <file size in bytes>
}
```

Returns `{ app_id, bit_count, bit_size_bytes }`. The app is automatically
tagged `submitted_by: "ai"` and starts in scan status `pending` — it can't
be approved until step 3 clears it.

## 2. Upload the file, one bit at a time

Split the file into chunks of `bit_size_bytes` (45MB — 47185920 bytes).
For each chunk, in order:

```
POST {SUPABASE_URL}/functions/v1/ai-upload-bit?app_id=<app_id>&bit_index=<i>
headers: { x-nexastore-key: API_KEY, Content-Type: <file mime type> }
body: <raw bytes of this chunk>
```

`bit_index` starts at 0. One call per chunk — the function handles both
the storage upload and recording it against the app.

## 3. Finalize — trigger the scan

```
POST {SUPABASE_URL}/functions/v1/ai-finalize
headers: { x-nexastore-key: API_KEY, Content-Type: application/json }
body: { "app_id": "..." }
```

Returns `{ scan_status: "clean" | "flagged", scan_notes: "..." }`.

This is a heuristic check — not real antivirus scanning, since that needs
a third-party engine (e.g. VirusTotal) and an API key that isn't wired in.
It checks:
- the listing text for script tags, injection-style phrasing, phishing-link patterns
- the uploaded file's actual byte signature against its declared name/type
- upload integrity (declared size vs. what actually landed in storage)

`clean` apps are eligible for the owner's approval. `flagged` ones wait in
the review queue with your scan_notes shown, for the owner's manual call —
they aren't rejected automatically.

## Done

The app shows up in the owner's console, tagged **AI**, with its scan
result. Approval is still always a human decision — this just gets a
finished app in front of the owner without anyone filling out a form.

## Managing the API key

The owner generates and revokes keys from the console (Dashboard → AI
keys). If a key stops working, ask for a fresh one — old keys can be
revoked independently without affecting anything else.
