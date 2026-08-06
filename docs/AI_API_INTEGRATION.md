# NexaStore AI Publishing API — Complete Integration Guide

This document describes how any AI model or automated system can publish apps directly to NexaStore without human intervention. The API is stateless, requires only one static key, and handles file chunking, scanning, and submission end-to-end.

**Latest Update (v2):** The API now supports optional logo and screenshot submission directly in the `ai-create-app` call, so you can publish fully-featured app listings with all metadata in one step.

## Authentication

All requests use a single static API key sent as a header:

```
x-nexastore-key: <API_KEY>
```

The key is opaque to you — ask the NexaStore owner for the current one. Keys can be revoked independently; if a key stops working, request a fresh one.

## Configuration

```
SUPABASE_URL = https://mapswtriwoxlscjdakpk.supabase.co
BIT_SIZE = 47185920 bytes (45 MB)
N_BUCKETS = 8
```

Files larger than `BIT_SIZE` are split into chunks and uploaded to separate storage buckets round-robin (`nexastore-bits-0` through `nexastore-bits-7`). This stays under Supabase's 50MB per-file free-tier cap.

## The Three-Step Submission Flow

### Step 1: Create the app listing

**Endpoint:** `POST {SUPABASE_URL}/functions/v1/ai-create-app`

**Headers:**
```
x-nexastore-key: <API_KEY>
Content-Type: application/json
```

**Request body:**
```json
{
  "name": "MyApp",
  "tagline": "A brief one-liner (max 80 chars)",
  "description": "Full description of what the app does",
  "category": "Tools",
  "price": 0,
  "version": "1.0.0",
  "release_notes": "Initial release",
  "file_name": "myapp.apk",
  "file_type": "application/vnd.android.package-archive",
  "total_size_bytes": 5242880,
  "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "screenshots": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  ]
}
```

**Parameters:**
- `name` — app name (required)
- `tagline` — one-line description shown on cards (required, max 80 chars)
- `description` — full description (required)
- `category` — one of: `Productivity`, `Business`, `Tools`, `Games`, `Social`, `Photography`, `Finance`, `Education` (required)
- `price` — USD price, 0 for free (optional, default 0)
- `version` — semantic version string (optional, default "1.0.0")
- `release_notes` — what's new in this version (optional)
- `file_name` — the uploaded file's name, e.g. "app.apk" or "app.zip" (required)
- `file_type` — MIME type (optional, default "application/octet-stream")
- `total_size_bytes` — exact size of the file in bytes (required)
- `logo` — optional app logo as base64 data URL (PNG, JPG, WebP; max 2MB). Example: `data:image/png;base64,...`
- `screenshots` — optional array of 3-10 screenshot data URLs (PNG, JPG, WebP; max 2MB each). Screenshots must be provided as base64 data URLs

**Response:**
```json
{
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "bit_count": 2,
  "bit_size_bytes": 47185920
}
```

Save `app_id` — you need it for the next steps. `bit_count` tells you how many chunks to upload.

The app starts in `scan_status: "pending"` and `status: "pending"` — it can't be approved until it passes the scan in step 3.

---

### Step 2: Upload the file in bits

Split your file into chunks of up to `bit_size_bytes`. For each chunk, in order:

**Endpoint:** `POST {SUPABASE_URL}/functions/v1/ai-upload-bit?app_id=<app_id>&bit_index=<i>`

**Query parameters:**
- `app_id` — from step 1 response
- `bit_index` — 0-indexed chunk number (0, 1, 2, ...)

**Headers:**
```
x-nexastore-key: <API_KEY>
Content-Type: <file MIME type>
```

**Body:** raw bytes of this chunk (binary data, not JSON)

**Example (pseudocode):**
```
for i in range(bit_count):
  start = i * BIT_SIZE
  end = min((i + 1) * BIT_SIZE, file_size)
  chunk = file_bytes[start:end]
  
  POST ai-upload-bit?app_id=550e8400-e29b-41d4-a716-446655440000&bit_index=i
    headers: {x-nexastore-key, Content-Type: application/octet-stream}
    body: chunk
```

**Response (each bit):**
```json
{
  "ok": true,
  "bit_index": 0,
  "size_bytes": 47185920
}
```

Upload them sequentially or in parallel — the function is idempotent (uploading the same bit twice overwrites safely).

---

### Step 3: Finalize — trigger the pre-approval scan

**Endpoint:** `POST {SUPABASE_URL}/functions/v1/ai-finalize`

**Headers:**
```
x-nexastore-key: <API_KEY>
Content-Type: application/json
```

**Request body:**
```json
{
  "app_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "scan_status": "clean",
  "scan_notes": ""
}
```

`scan_status` will be one of:
- `clean` — passed all checks, eligible for owner approval
- `flagged` — heuristic scan found suspicious patterns (see `scan_notes`); won't be approved automatically, but owner can review and approve manually

The scan checks:
- listing text for script tags, `eval()` calls, injection-style phrases
- file signature (magic bytes) against declared file type — catches disguised binaries
- upload integrity — declared size vs. actual chunks uploaded

If `flagged`, the owner will see the app in their review queue with your scan notes displayed.

---

# Complete Workflow Example (Python)

```python
import requests
import base64
import os

API_KEY = "nxs_live_<your-key>"
BASE_URL = "https://mapswtriwoxlscjdakpk.supabase.co"
BIT_SIZE = 47185920

def headers():
    return {"x-nexastore-key": API_KEY, "Content-Type": "application/json"}

def headers_binary():
    return {"x-nexastore-key": API_KEY}

def file_to_data_url(path, mime_type="image/png"):
    """Convert a file to a data URL for logo/screenshot submission."""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime_type};base64,{b64}"

# Step 1: Create app listing WITH logo and screenshots
app_data = {
    "name": "MyGameEngine",
    "tagline": "A high-performance game engine",
    "description": "Features include real-time rendering, physics, and AI support.",
    "category": "Tools",
    "price": 0,
    "version": "1.0.0",
    "release_notes": "Initial release with core features",
    "file_name": "game_engine.zip",
    "file_type": "application/zip",
    "total_size_bytes": os.path.getsize("game_engine.zip"),
    # Optional: include logo and screenshots as base64
    "logo": file_to_data_url("app_logo.png", "image/png"),
    "screenshots": [
        file_to_data_url("screenshot1.png", "image/png"),
        file_to_data_url("screenshot2.png", "image/png"),
        file_to_data_url("screenshot3.png", "image/png"),
    ]
}

resp = requests.post(
    f"{BASE_URL}/functions/v1/ai-create-app",
    json=app_data,
    headers=headers()
)
resp.raise_for_status()
result = resp.json()
app_id = result["app_id"]
bit_count = result["bit_count"]
print(f"Created app {app_id}, {bit_count} bits to upload, logo and screenshots stored")

# Step 2: Upload bits
with open("game_engine.zip", "rb") as f:
    file_data = f.read()

for i in range(bit_count):
    start = i * BIT_SIZE
    end = min((i + 1) * BIT_SIZE, len(file_data))
    chunk = file_data[start:end]
    
    resp = requests.post(
        f"{BASE_URL}/functions/v1/ai-upload-bit?app_id={app_id}&bit_index={i}",
        data=chunk,
        headers=headers_binary()
    )
    resp.raise_for_status()
    print(f"Uploaded bit {i}")

# Step 3: Finalize and scan
resp = requests.post(
    f"{BASE_URL}/functions/v1/ai-finalize",
    json={"app_id": app_id},
    headers=headers()
)
resp.raise_for_status()
scan_result = resp.json()
print(f"Scan result: {scan_result['scan_status']}")
if scan_result['scan_notes']:
    print(f"Notes: {scan_result['scan_notes']}")
```

---

## Error Handling

All responses follow the same pattern:

**Success (2xx):**
```json
{
  "app_id": "...",
  "scan_status": "clean",
  ...
}
```

**Error (4xx/5xx):**
```json
{
  "error": "Human-readable error message"
}
```

Common errors:
- `"invalid or revoked API key"` — (401) Check your key with the NexaStore owner
- `"name, tagline, description, file_name, total_size_bytes are required"` — (400) Missing required field in step 1
- `"app_id and bit_index query params required"` — (400) Missing query params in step 2
- `"storage upload failed: ..."` — (500) File chunk upload issue; retry
- `"bit record failed: ..."` — (500) Database insert issue; shouldn't happen but retry if it does

---

## Integration Into a Game Engine

To give your game engine the ability to publish to NexaStore:

1. **Expose these three endpoints** as engine API calls or console commands, parameterized by the app metadata and file path.

2. **Handle chunking client-side** — split the build output into `BIT_SIZE` chunks before uploading.

3. **Provide the API key as a secret** — either environment variable, config file, or passed at runtime (don't hardcode it).

4. **Convert images to base64** — when sending logo/screenshots, encode them as data URLs:
   ```python
   import base64
   
   def file_to_data_url(file_path, mime_type="image/png"):
       with open(file_path, "rb") as f:
           b64 = base64.b64encode(f.read()).decode()
       return f"data:{mime_type};base64,{b64}"
   
   # Usage:
   logo_data_url = file_to_data_url("app_logo.png", "image/png")
   screenshot_data_urls = [
       file_to_data_url(f"screenshot{i}.png", "image/png")
       for i in range(1, 4)
   ]
   ```

5. **Poll or wait for scan results** — after step 3, the app is in the review queue. The owner will approve/reject; you can optionally query the `/rest/v1/apps?id=eq.<app_id>` endpoint (authenticated with the same API key as a query parameter: `?apikey=<ANON_KEY>`) to check status if you need to report back.

---

## What Happens After Submission

1. **Scan gate** — the `ai-finalize` call runs the heuristic checks and sets `scan_status`.
2. **Owner review queue** — your app appears in the NexaStore console, tagged **AI**, with scan status visible.
3. **Approval** — the owner manually approves (if scan is clean) or rejects.
4. **Live** — once approved, your app appears in the public store immediately.

That's it. No further involvement needed from you unless the owner requests changes.

---

## Changelog & Updates

The API is stable and backward-compatible. Breaking changes (if any) will come with a new endpoint version (`v2`, etc.) — this is `v1`.

Current API version: **1.0**  
Last updated: August 2026
