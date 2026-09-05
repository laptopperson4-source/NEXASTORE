/**
 * Build-time SEO generator for NexaStore.
 * Fetches approved apps → sitemap.xml + static crawlable HTML pages.
 * Run: node scripts/generate-seo.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const SITE = process.env.NEXASTORE_SITE_URL || 'https://nexastore-baj.pages.dev';
const SUPABASE_URL = process.env.NEXASTORE_SUPABASE_URL || 'https://mapswtriwoxlscjdakpk.supabase.co';
const ANON =
  process.env.NEXASTORE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcHN3dHJpd294bHNjamRha3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDM4MDEsImV4cCI6MjEwMTE3OTgwMX0.jkQtVSMwjzkB9NI1txeuk-RTCrxAJX_RXEyNqcdoewY';

function slugify(name) {
  return String(name || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'app';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isNexaPulse(app) {
  const blob = `${app.developer_name || ''} ${app.company_name || ''} ${app.name || ''}`.toLowerCase();
  return blob.includes('nexapulse') || blob.includes('nexa pulse');
}

function pageShell({ title, description, canonical, body, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <link rel="icon" href="/favicon.png" />
  <style>
    body{font-family:Inter,system-ui,sans-serif;margin:0;background:#0a0e27;color:#e2e8f0;line-height:1.5}
    a{color:#a78bfa}
    .wrap{max-width:720px;margin:0 auto;padding:32px 20px}
    .card{background:#12172f;border:1px solid #ffffff14;border-radius:16px;padding:20px;margin:16px 0}
    .btn{display:inline-block;background:linear-gradient(90deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700}
    h1{font-size:1.75rem;margin:0 0 8px}
    .muted{color:#94a3b8;font-size:0.95rem}
    .logo{width:72px;height:72px;border-radius:16px;object-fit:cover;background:#312e81}
  </style>
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
  <div class="wrap">
    ${body}
    <p class="muted" style="margin-top:40px">© NexaStore · Apps by independent developers including NexaPulse Studios</p>
  </div>
</body>
</html>`;
}

async function fetchApps() {
  const url = `${SUPABASE_URL}/rest/v1/apps?status=eq.approved&select=id,name,tagline,description,category,price,logo_url,dev_id,created_at&order=created_at.desc&limit=100`;
  const res = await fetch(url, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function enrichDevelopers(apps) {
  const ids = [...new Set(apps.map(a => a.dev_id).filter(Boolean))];
  if (!ids.length) return apps;
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,email,developer_name,company_name`;
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) return apps;
    const profs = await res.json();
    const byId = {};
    for (const pr of profs || []) {
      byId[pr.id] = pr.developer_name || pr.company_name || (pr.email ? pr.email.split('@')[0] : null);
    }
    return apps.map(a => ({ ...a, developer_name: byId[a.dev_id] || a.developer_name || null }));
  } catch {
    return apps;
  }
}

async function main() {
  let apps = [];
  try {
    apps = await fetchApps();
    apps = await enrichDevelopers(apps);
    console.log(`[seo] fetched ${apps.length} approved apps`);
  } catch (e) {
    console.warn('[seo] catalog fetch failed, writing baseline sitemap only:', e.message);
  }

  const urls = [
    { loc: `${SITE}/`, priority: '1.0' },
    { loc: `${SITE}/studio/nexapulse/`, priority: '0.9' },
  ];

  // Per-app static pages under /app/<slug>/
  for (const app of apps) {
    const slug = slugify(app.name);
    const dir = path.join(publicDir, 'app', slug);
    fs.mkdirSync(dir, { recursive: true });
    const canonical = `${SITE}/app/${slug}/`;
    const spaLink = `${SITE}/?app=${encodeURIComponent(app.id)}`;
    const desc =
      (app.tagline || app.description || `${app.name} on NexaStore`).replace(/\s+/g, ' ').trim().slice(0, 160);
    const price = typeof app.price === 'number' ? app.price : parseFloat(app.price) || 0;
    const studio = isNexaPulse(app) ? 'NexaPulse Studios' : app.developer_name || 'NexaStore developer';

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: app.name,
      description: desc,
      applicationCategory: app.category || 'UtilitiesApplication',
      operatingSystem: 'Android, Windows, Web',
      offers: {
        '@type': 'Offer',
        price: price.toFixed(2),
        priceCurrency: 'USD',
      },
      author: { '@type': 'Organization', name: studio },
      url: canonical,
    });

    const body = `
    <p class="muted"><a href="/">NexaStore</a> · ${escapeHtml(app.category || 'App')}</p>
    <div style="display:flex;gap:16px;align-items:center;margin:16px 0">
      ${app.logo_url ? `<img class="logo" src="${escapeHtml(app.logo_url)}" alt="" />` : `<div class="logo"></div>`}
      <div>
        <h1>${escapeHtml(app.name)}</h1>
        <p class="muted">by ${escapeHtml(studio)}${price > 0 ? ` · ${price.toFixed(2)} USDT` : ' · Free'}</p>
      </div>
    </div>
    <div class="card">
      <p>${escapeHtml(app.tagline || '')}</p>
      <p class="muted" style="white-space:pre-wrap">${escapeHtml((app.description || '').slice(0, 2000))}</p>
    </div>
    <p><a class="btn" href="${escapeHtml(spaLink)}">Open in NexaStore</a></p>
    <p class="muted"><a href="/studio/nexapulse/">More from NexaPulse Studios</a></p>`;

    fs.writeFileSync(
      path.join(dir, 'index.html'),
      pageShell({
        title: `${app.name} · NexaStore`,
        description: desc,
        canonical,
        body,
        jsonLd,
      })
    );
    urls.push({ loc: canonical, priority: '0.8' });
  }

  // NexaPulse studio page
  const pulse = apps.filter(isNexaPulse);
  const studioApps = pulse.length ? pulse : apps; // if none tagged yet, list all so page isn't empty
  const studioBody = `
    <p class="muted"><a href="/">NexaStore</a></p>
    <h1>NexaPulse Studios</h1>
    <p class="muted">Apps from NexaPulse Studios on NexaStore. Buy with USDT on Polygon.</p>
    ${studioApps
      .map((app) => {
        const slug = slugify(app.name);
        const price = typeof app.price === 'number' ? app.price : parseFloat(app.price) || 0;
        return `<div class="card">
          <h2 style="margin:0 0 6px;font-size:1.15rem"><a href="/app/${slug}/">${escapeHtml(app.name)}</a></h2>
          <p class="muted">${escapeHtml(app.tagline || app.category || '')}${price > 0 ? ` · ${price.toFixed(2)} USDT` : ' · Free'}</p>
          <p><a href="/?app=${encodeURIComponent(app.id)}">Open in NexaStore</a></p>
        </div>`;
      })
      .join('\n') || '<p class="muted">No apps listed yet.</p>'}
  `;

  fs.mkdirSync(path.join(publicDir, 'studio', 'nexapulse'), { recursive: true });
  fs.writeFileSync(
    path.join(publicDir, 'studio', 'nexapulse', 'index.html'),
    pageShell({
      title: 'NexaPulse Studios · NexaStore',
      description: 'Apps by NexaPulse Studios on NexaStore — tools and utilities, USDT on Polygon.',
      canonical: `${SITE}/studio/nexapulse/`,
      body: studioBody,
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'NexaPulse Studios',
        url: `${SITE}/studio/nexapulse/`,
        parentOrganization: { '@type': 'Organization', name: 'NexaStore', url: SITE },
      }),
    })
  );

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
  console.log(`[seo] wrote sitemap with ${urls.length} URLs + studio page + ${apps.length} app pages`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
