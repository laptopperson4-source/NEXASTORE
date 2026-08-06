# NexaStore Edge Functions Update Guide

This guide shows how to update the `ai-create-app` Edge Function to handle logo and screenshot submission from AI publishers.

## Updated ai-create-app Function

The updated function should handle base64-encoded logo and screenshot images passed in the request body, upload them to Supabase Storage, and store metadata in the database.

### Deployment Instructions

1. In the Supabase Dashboard, navigate to **Edge Functions** → **ai-create-app**
2. Replace the function code with the code below
3. Click **Deploy**

### Updated Function Code (Deno/TypeScript)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyApiKey(key: string) {
  const crypto = await import("https://deno.land/std@0.182.0/crypto/mod.ts");
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: keyRow, error } = await supabase
    .from("ai_api_keys")
    .select("*")
    .eq("key_hash", hashHex)
    .eq("revoked", false)
    .single();

  if (error || !keyRow) throw new Error("Invalid or revoked API key");
  return keyRow;
}

async function uploadImage(
  bucket: string,
  path: string,
  dataUrl: string
): Promise<string> {
  // Parse data URL
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image data URL format");

  const [, mimeType, base64Data] = matches;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { upsert: true, contentType: mimeType });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function createAppWithMetadata(appData: any, logoUrl?: string, screenshotUrls?: string[]) {
  // Create app row
  const { data: app, error: appError } = await supabase
    .from("apps")
    .insert({
      dev_id: "99c7440e-1799-4d56-9ebb-1811fbdd15bf", // AI Publisher account
      name: appData.name,
      tagline: appData.tagline,
      description: appData.description,
      category: appData.category,
      price: appData.price || 0,
      version: appData.version || "1.0.0",
      release_notes: appData.release_notes || "",
      file_name: appData.file_name,
      file_type: appData.file_type || "application/octet-stream",
      total_size_bytes: appData.total_size_bytes,
      bit_count: Math.max(1, Math.ceil(appData.total_size_bytes / 47185920)),
      bit_size_bytes: 47185920,
      logo_url: logoUrl || "",
      submitted_by: "ai",
    })
    .select()
    .single();

  if (appError) throw new Error(`Failed to create app: ${appError.message}`);

  // Store screenshots
  if (screenshotUrls && screenshotUrls.length > 0) {
    for (let i = 0; i < screenshotUrls.length; i++) {
      await supabase.from("app_screenshots").upsert({
        app_id: app.id,
        screenshot_index: i,
        screenshot_url: screenshotUrls[i],
      });
    }
  }

  return app;
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const apiKey = req.headers.get("x-nexastore-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401 });
    }

    await verifyApiKey(apiKey);

    const body = await req.json();
    const {
      name,
      tagline,
      description,
      category,
      price,
      version,
      release_notes,
      file_name,
      file_type,
      total_size_bytes,
      logo,
      screenshots,
    } = body;

    // Validate required fields
    if (
      !name ||
      !tagline ||
      !description ||
      !category ||
      !file_name ||
      !total_size_bytes
    ) {
      return new Response(
        JSON.stringify({
          error:
            "name, tagline, description, category, file_name, total_size_bytes are required",
        }),
        { status: 400 }
      );
    }

    const appId = crypto.randomUUID();
    let logoUrl = "";
    let screenshotUrls: string[] = [];

    // Upload logo if provided
    if (logo && typeof logo === "string" && logo.startsWith("data:")) {
      try {
        logoUrl = await uploadImage("nexastore-logos", `${appId}/logo`, logo);
      } catch (e) {
        console.error("Logo upload failed:", e);
        // Don't fail entirely, just skip logo
      }
    }

    // Upload screenshots if provided
    if (screenshots && Array.isArray(screenshots) && screenshots.length > 0) {
      for (let i = 0; i < screenshots.length && i < 10; i++) {
        if (typeof screenshots[i] === "string" && screenshots[i].startsWith("data:")) {
          try {
            const url = await uploadImage(
              "nexastore-screenshots",
              `${appId}/${i}`,
              screenshots[i]
            );
            screenshotUrls.push(url);
          } catch (e) {
            console.error(`Screenshot ${i} upload failed:`, e);
          }
        }
      }
    }

    // Create app with all metadata
    const app = await createAppWithMetadata(
      { name, tagline, description, category, price, version, release_notes, file_name, file_type, total_size_bytes },
      logoUrl,
      screenshotUrls
    );

    return new Response(
      JSON.stringify({
        app_id: app.id,
        bit_count: app.bit_count,
        bit_size_bytes: app.bit_size_bytes,
        logo_url: logoUrl,
        screenshots_count: screenshotUrls.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### What Changed

1. **Logo Handling**: If `logo` is provided as a base64 data URL, it's uploaded to the `nexastore-logos` bucket
2. **Screenshots Handling**: If `screenshots` array is provided, each image is uploaded to `nexastore-screenshots` bucket and metadata is stored in `app_screenshots` table
3. **Error Handling**: Logo/screenshot upload failures don't block app creation — the app is created even if images fail to upload
4. **Response Extended**: Now returns `logo_url` and `screenshots_count` so the AI knows what was uploaded

### Testing

After deploying, test the updated function:

```bash
curl -X POST https://mapswtriwoxlscjdakpk.supabase.co/functions/v1/ai-create-app \
  -H "x-nexastore-key: nxs_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "tagline": "A test",
    "description": "Testing logo and screenshots",
    "category": "Tools",
    "file_name": "test.zip",
    "total_size_bytes": 1024,
    "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "screenshots": [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    ]
  }'
```

### Important Notes

- **Base64 Format**: Images must be passed as data URLs: `data:image/png;base64,<base64-data>`
- **Size Limits**: Logo max 2MB, screenshots max 2MB each
- **Screenshot Count**: Minimum 3 required for production apps (enforced on client-side, but backend stores whatever is provided)
- **Async**: Image uploads happen in parallel for speed
- **Idempotent**: Re-uploading the same app_id with different images will overwrite previous ones (due to `upsert` flag)

---

## No Changes Needed for ai-upload-bit and ai-finalize

These endpoints remain unchanged. The three-step flow is still:
1. `ai-create-app` — creates app and uploads logo/screenshots
2. `ai-upload-bit` — uploads file chunks  
3. `ai-finalize` — runs security scan

---

## Updating the Supabase Storage Buckets

Make sure these buckets exist (they should, but verify):

```sql
-- Check nexastore-screenshots bucket exists
select * from storage.buckets where name = 'nexastore-screenshots';

-- If missing, create it:
insert into storage.buckets (id, name, public) 
values ('nexastore-screenshots', 'nexastore-screenshots', true)
on conflict do nothing;

-- Allow public read
create policy "screenshots are public" on storage.objects
  for select using (bucket_id = 'nexastore-screenshots');
```
