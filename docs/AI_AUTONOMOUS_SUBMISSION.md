# NexaStore AI Autonomous Submission Guide

This guide explains how an AI system can autonomously publish apps to NexaStore using the provided client libraries.

## Overview

Instead of just describing what app to create, the AI can now:
1. Generate/build the actual app
2. Create a logo (PNG image)
3. Generate screenshots (PNG images)
4. Submit everything to NexaStore automatically
5. Get back an app ID and link

## Prerequisites

- **API Key:** Ask the NexaStore owner for your `nxs_live_...` API key
- **Environment Variable:** Set `NEXASTORE_API_KEY` before running

```bash
export NEXASTORE_API_KEY="nxs_live_your_key_here"
```

Or pass it as an environment variable when running your AI script.

---

## Python Implementation

### 1. Use the Client Library

```python
from nexastore_client import NexaStoreClient

# Initialize
api_key = os.getenv("NEXASTORE_API_KEY")
client = NexaStoreClient(api_key)

# Submit app
app_id = client.submit_app(
    name="MyApp",
    tagline="Brief tagline",
    description="Full description",
    category="Tools",
    app_file_path="build/myapp.zip",  # Path to your built app
    logo_path="assets/logo.png",       # Path to logo image
    screenshot_paths=[
        "assets/screenshot1.png",
        "assets/screenshot2.png",
        "assets/screenshot3.png",
    ],
    price=0,
    version="1.0.0",
    release_notes="Initial release"
)

print(f"✅ Published! App ID: {app_id}")
```

### 2. Example: AI Creating a Complete App

```python
import os
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
from nexastore_client import NexaStoreClient

def create_app_assets():
    """AI creates the app, logo, and screenshots."""
    
    # 1. Build the app (example: create a simple ZIP)
    print("🔨 Building app...")
    subprocess.run(["zip", "-r", "myapp.zip", "src/"], check=True)
    
    # 2. Generate logo using PIL
    print("🎨 Generating logo...")
    img = Image.new('RGB', (512, 512), color='#01875F')
    draw = ImageDraw.Draw(img)
    draw.ellipse([50, 50, 462, 462], fill='#1A73E8', outline='white', width=8)
    img.save('logo.png')
    
    # 3. Generate screenshots (these would be more complex in reality)
    print("📸 Generating screenshots...")
    for i in range(3):
        img = Image.new('RGB', (1080, 1920), color=(50 + i*30, 100, 150))
        draw = ImageDraw.Draw(img)
        draw.text((500, 900), f"Screenshot {i+1}", fill='white')
        img.save(f'screenshot{i+1}.png')

def main():
    # Create all assets
    create_app_assets()
    
    # Submit to NexaStore
    api_key = os.getenv("NEXASTORE_API_KEY")
    client = NexaStoreClient(api_key)
    
    app_id = client.submit_app(
        name="AI-Generated App",
        tagline="An app created entirely by AI",
        description="This application was autonomously created and published by an AI system.",
        category="Tools",
        app_file_path="myapp.zip",
        logo_path="logo.png",
        screenshot_paths=[
            "screenshot1.png",
            "screenshot2.png",
            "screenshot3.png",
        ]
    )
    
    print(f"\n🎉 Success!")
    print(f"App ID: {app_id}")
    print(f"View at: https://nexastore-baj.pages.dev")

if __name__ == "__main__":
    main()
```

---

## JavaScript/Node.js Implementation

### 1. Use the Client Library

```javascript
const { NexaStoreClient } = require('./nexastore_client.js');

const client = new NexaStoreClient(process.env.NEXASTORE_API_KEY);

(async () => {
  const appId = await client.submitApp({
    name: "MyApp",
    tagline: "Brief tagline",
    description: "Full description",
    category: "Tools",
    appFilePath: "build/myapp.zip",
    logoPath: "assets/logo.png",
    screenshotPaths: [
      "assets/screenshot1.png",
      "assets/screenshot2.png",
      "assets/screenshot3.png",
    ],
    price: 0,
    version: "1.0.0",
    releaseNotes: "Initial release"
  });

  console.log(`✅ Published! App ID: ${appId}`);
})();
```

### 2. Example: AI Creating a Complete App

```javascript
const { NexaStoreClient } = require('./nexastore_client.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Canvas = require('canvas');

async function createAppAssets() {
  console.log("🔨 Building app...");
  // Build app logic here
  fs.writeFileSync('myapp.zip', Buffer.from('PK...')); // Simplified

  console.log("🎨 Generating logo...");
  const canvas = Canvas.createCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#01875F';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#1A73E8';
  ctx.beginPath();
  ctx.arc(256, 256, 200, 0, Math.PI * 2);
  ctx.fill();
  
  const out = fs.createWriteStream('logo.png');
  canvas.pngStream().pipe(out);
  
  console.log("📸 Generating screenshots...");
  for (let i = 1; i <= 3; i++) {
    const canvas = Canvas.createCanvas(1080, 1920);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${50 + i*30}, 100, 150)`;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.fillText(`Screenshot ${i}`, 400, 900);
    
    const out = fs.createWriteStream(`screenshot${i}.png`);
    canvas.pngStream().pipe(out);
  }
}

async function main() {
  await createAppAssets();

  const client = new NexaStoreClient(process.env.NEXASTORE_API_KEY);

  const appId = await client.submitApp({
    name: "AI-Generated App",
    tagline: "An app created entirely by AI",
    description: "This application was autonomously created and published by an AI system.",
    category: "Tools",
    appFilePath: "myapp.zip",
    logoPath: "logo.png",
    screenshotPaths: [
      "screenshot1.png",
      "screenshot2.png",
      "screenshot3.png",
    ]
  });

  console.log(`\n🎉 Success!`);
  console.log(`App ID: ${appId}`);
  console.log(`View at: https://nexastore-baj.pages.dev`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

---

## Full Workflow for AI Systems

When tasked to create and publish an app:

### Step 1: Plan
```
Think about:
- What app should I create?
- Who is the target user? (Nigerians, low bandwidth)
- What category fits best?
- What features matter most?
```

### Step 2: Build
```
- Develop/generate the actual application
- Create installable file (APK, EXE, ZIP)
- Build logo (PNG, 512x512+)
- Generate 3-10 screenshots
```

### Step 3: Submit
```python
from nexastore_client import NexaStoreClient

client = NexaStoreClient(os.getenv("NEXASTORE_API_KEY"))
app_id = client.submit_app(...)  # With all your created assets
```

### Step 4: Confirm
```
Print the app ID and link for the user:
✅ App published: {app_id}
View at: https://nexastore-baj.pages.dev
Status: Pending owner approval
```

---

## API Key Management

- **Keep it secret** — don't commit to GitHub
- **Use environment variables** — `NEXASTORE_API_KEY`
- **Rotate if exposed** — ask NexaStore owner to revoke old key
- **One key per AI system** — different systems can have different keys

---

## Error Handling

The client libraries raise exceptions with clear messages:

```python
try:
    app_id = client.submit_app(...)
except ValueError as e:
    print(f"Validation error: {e}")  # Invalid input
except requests.RequestException as e:
    print(f"API error: {e}")          # Network/API failure
```

Common errors:
- `Missing required fields` — Fill in all metadata
- `Minimum 3 screenshots required` — Upload 3+ screenshots
- `Invalid API key` — Check `NEXASTORE_API_KEY` environment variable
- `App file not found` — Verify file paths exist

---

## Testing Locally

### Python
```bash
export NEXASTORE_API_KEY="nxs_live_your_key"
python3 nexastore_client.py
```

### JavaScript
```bash
export NEXASTORE_API_KEY="nxs_live_your_key"
npm install node-fetch
node nexastore_client.js
```

---

## Next Steps

1. **Get API Key** — Ask NexaStore owner
2. **Download Client** — Use Python or JavaScript version
3. **Implement** — Use the examples above in your AI system
4. **Build & Test** — Create a test app and submit
5. **Deploy** — Run in production, submit real apps

Once you get the app ID back, the NexaStore owner will review and approve it, then it appears on the store for users to install.

---

## What Happens After Submission

1. **App Created** — Listed as "Pending" with scan status
2. **Security Scan** — Runs automatically, takes ~10 seconds
3. **Owner Review** — NexaStore owner sees it in their console
4. **Approved/Rejected** — Owner decides whether to approve
5. **Live** — Once approved, users can find and install it

Your AI will know the app ID immediately after submission, so you can provide that to users even before approval.

---

## Example Full AI Workflow Output

```
📦 Submitting: AI Calculator
   File: calculator.apk (8.5 MB)
✓ Step 1/3: Creating app listing...
  └─ Logo uploaded: logo.png
  └─ 3 screenshots uploaded
  └─ App created: 550e8400-e29b-41d4-a716-446655440000

✓ Step 2/3: Uploading app file (1 chunks)...
  └─ Bit 1/1 (100%)

✓ Step 3/3: Running security scan...
  └─ Security scan: ✓ PASSED

✅ App published successfully!
   App ID: 550e8400-e29b-41d4-a716-446655440000
   Status: Pending owner approval
   View: https://nexastore-baj.pages.dev
```

Done! Your AI can now autonomously publish apps.
