/**
 * NexaStore AI Publisher Client (JavaScript/Node.js)
 * 
 * Simple library for AI systems to autonomously publish applications to NexaStore.
 * 
 * Usage:
 *   const { NexaStoreClient } = require('./nexastore_client.js');
 *   
 *   const client = new NexaStoreClient('nxs_live_...');
 *   
 *   const appId = await client.submitApp({
 *     name: "MyApp",
 *     tagline: "Brief description",
 *     description: "Full description",
 *     category: "Tools",
 *     appFilePath: "app.apk",
 *     logoPath: "logo.png",
 *     screenshotPaths: ["ss1.png", "ss2.png", "ss3.png"]
 *   });
 *   
 *   console.log(`App published: ${appId}`);
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

class NexaStoreClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://mapswtriwoxlscjdakpk.supabase.co';
    this.bitSize = 47185920; // 45 MB
    this.headers = { 'x-nexastore-key': apiKey };
  }

  fileToDataUrl(filePath) {
    const buffer = fs.readFileSync(filePath);
    const b64 = buffer.toString('base64');
    const mimeType = this.guessMimeType(path.extname(filePath));
    return `data:${mimeType};base64,${b64}`;
  }

  guessMimeType(ext) {
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.apk': 'application/vnd.android.package-archive',
      '.exe': 'application/x-msdownload',
      '.zip': 'application/zip',
      '.aab': 'application/x-gzip',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  async submitApp(options) {
    const {
      name,
      tagline,
      description,
      category,
      appFilePath,
      logoPath = null,
      screenshotPaths = [],
      price = 0,
      version = '1.0.0',
      releaseNotes = '',
    } = options;

    // Validate required fields
    if (!name || !tagline || !description || !category || !appFilePath) {
      throw new Error('Missing required fields: name, tagline, description, category, appFilePath');
    }

    // Validate category
    const validCategories = [
      'Productivity', 'Business', 'Tools', 'Games',
      'Social', 'Photography', 'Finance', 'Education',
    ];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }

    // Validate files exist
    if (!fs.existsSync(appFilePath)) {
      throw new Error(`App file not found: ${appFilePath}`);
    }

    if (screenshotPaths.length > 0) {
      if (screenshotPaths.length < 3) {
        throw new Error('Minimum 3 screenshots required');
      }
      if (screenshotPaths.length > 10) {
        throw new Error('Maximum 10 screenshots allowed');
      }
      for (const p of screenshotPaths) {
        if (!fs.existsSync(p)) {
          throw new Error(`Screenshot not found: ${p}`);
        }
      }
    }

    if (logoPath && !fs.existsSync(logoPath)) {
      throw new Error(`Logo file not found: ${logoPath}`);
    }

    // Get file info
    const fileSize = fs.statSync(appFilePath).size;
    const fileName = path.basename(appFilePath);
    const fileType = this.guessMimeType(path.extname(appFilePath));

    console.log(`📦 Submitting: ${name}`);
    console.log(`   File: ${fileName} (${fileSize.toLocaleString()} bytes)`);

    // Step 1: Create app listing
    console.log('✓ Step 1/3: Creating app listing...');

    const appData = {
      name,
      tagline,
      description,
      category,
      price,
      version,
      release_notes: releaseNotes,
      file_name: fileName,
      file_type: fileType,
      total_size_bytes: fileSize,
    };

    if (logoPath) {
      appData.logo = this.fileToDataUrl(logoPath);
      console.log(`  └─ Logo uploaded: ${path.basename(logoPath)}`);
    }

    if (screenshotPaths.length > 0) {
      appData.screenshots = screenshotPaths.map(p => this.fileToDataUrl(p));
      console.log(`  └─ ${screenshotPaths.length} screenshots uploaded`);
    }

    const createResp = await fetch(`${this.baseUrl}/functions/v1/ai-create-app`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(appData),
    });

    if (!createResp.ok) {
      throw new Error(`Failed to create app: ${await createResp.text()}`);
    }

    const createResult = await createResp.json();
    const appId = createResult.app_id;
    const bitCount = createResult.bit_count;

    console.log(`  └─ App created: ${appId}`);

    // Step 2: Upload file bits
    console.log(`✓ Step 2/3: Uploading app file (${bitCount} chunks)...`);

    const fileBuffer = fs.readFileSync(appFilePath);

    for (let i = 0; i < bitCount; i++) {
      const start = i * this.bitSize;
      const end = Math.min((i + 1) * this.bitSize, fileBuffer.length);
      const chunk = fileBuffer.slice(start, end);

      const uploadResp = await fetch(
        `${this.baseUrl}/functions/v1/ai-upload-bit?app_id=${appId}&bit_index=${i}`,
        {
          method: 'POST',
          headers: this.headers,
          body: chunk,
        }
      );

      if (!uploadResp.ok) {
        throw new Error(`Failed to upload bit ${i}: ${await uploadResp.text()}`);
      }

      const pct = Math.round(((i + 1) / bitCount) * 100);
      console.log(`  └─ Bit ${i + 1}/${bitCount} (${pct}%)`);
    }

    // Step 3: Finalize and scan
    console.log('✓ Step 3/3: Running security scan...');

    const finalResp = await fetch(`${this.baseUrl}/functions/v1/ai-finalize`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId }),
    });

    if (!finalResp.ok) {
      throw new Error(`Failed to finalize: ${await finalResp.text()}`);
    }

    const scanResult = await finalResp.json();
    const scanStatus = scanResult.scan_status || 'unknown';
    const scanNotes = scanResult.scan_notes || '';

    if (scanStatus === 'clean') {
      console.log(`  └─ Security scan: ✓ PASSED`);
    } else if (scanStatus === 'flagged') {
      console.log(`  └─ Security scan: ⚠ FLAGGED`);
      if (scanNotes) {
        console.log(`     ${scanNotes}`);
      }
    } else {
      console.log(`  └─ Security scan: ${scanStatus}`);
    }

    console.log();
    console.log(`✅ App published successfully!`);
    console.log(`   App ID: ${appId}`);
    console.log(`   Status: Pending owner approval`);
    console.log(`   View: https://nexastore-baj.pages.dev`);

    return appId;
  }
}

module.exports = { NexaStoreClient };

// Example usage
if (require.main === module) {
  const apiKey = process.env.NEXASTORE_API_KEY;
  if (!apiKey) {
    console.error('Error: NEXASTORE_API_KEY environment variable not set');
    process.exit(1);
  }

  const client = new NexaStoreClient(apiKey);

  client
    .submitApp({
      name: 'Example App',
      tagline: 'An example application',
      description: 'This is an example app created by an AI system.',
      category: 'Tools',
      appFilePath: 'example.zip',
      logoPath: 'logo.png',
      screenshotPaths: ['screenshot1.png', 'screenshot2.png', 'screenshot3.png'],
    })
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
