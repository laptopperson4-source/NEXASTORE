# Faster Google indexing — NexaStore checklist

Sitemaps **do not guarantee** indexing. They help discovery and freshness. Speed comes from clean signals + Search Console actions.

## What we optimized in-repo

1. **One primary sitemap** — `https://app.nexapulse.pro/sitemap.xml`
2. **Only 200 / canonical / public URLs** (no affiliates, no widgets)
3. **`<lastmod>` with full ISO-8601 + timezone** (Google uses this more than priority/changefreq)
4. **Dropped reliance on priority/changefreq** (Google largely ignores them)
5. **robots.txt** allows JS/CSS/images (needed for SPA rendering) and points to the single sitemap
6. **Image hint** on homepage for rich results discovery

## Do this in Google Search Console (highest impact)

1. Open [Search Console](https://search.google.com/search-console) → property **app.nexapulse.pro** (and **nexapulse.pro** if verified).
2. **Sitemaps** → submit: `sitemap.xml` (remove old broken entries if they error).
3. **URL Inspection** → for each priority URL, **Request indexing** once:
   - `https://app.nexapulse.pro/`
   - `https://app.nexapulse.pro/about/`
   - `https://app.nexapulse.pro/app/hi-note/`
   - `https://app.nexapulse.pro/app/nexadocs/`
4. Do **not** spam Request indexing on the same URL the same day — quota is limited and repeats do not help.
5. After real content updates, bump `<lastmod>` on changed URLs and re-submit the sitemap once.

## Also helps crawl speed (outside these files)

- Keep **HTTPS**, fast TTFB (Cloudflare is fine).
- Strong **internal links** between about / payments / app pages.
- Real content on app landing pages (not empty shells).
- **Backlinks** from X, Product Hunt, forums — discovery is often faster via links than sitemap alone.
- Fix any **Soft 404** in Coverage report (SPA routes that return 200 with empty “not found” text can confuse Google).

## Validate

```
https://app.nexapulse.pro/robots.txt
https://app.nexapulse.pro/sitemap.xml
```

Both must return **200** and not be blocked.
