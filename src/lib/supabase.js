export const SUPABASE_URL = "https://mapswtriwoxlscjdakpk.supabase.co";
export const REST = `${SUPABASE_URL}/rest/v1`;
export const STORAGEAPI = `${SUPABASE_URL}/storage/v1`;
export const AUTHAPI = `${SUPABASE_URL}/auth/v1`;
export const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcHN3dHJpd294bHNjamRha3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDM4MDEsImV4cCI6MjEwMTE3OTgwMX0.jkQtVSMwjzkB9NI1txeuk-RTCrxAJX_RXEyNqcdoewY";
export const PLATFORM_TREASURY_WALLET = "0xF8720081dc56427AB7851fda9F05754304f0bfb2";
export const PAYOUT_MODE = "direct";

export async function sbSelect(table, qs, token) {
  const url = `${REST}/${table}?${qs}`;
  const opts = { headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function sbDownload(bucket, path, token, onProgress) {
  const url = `${STORAGEAPI}/object/${bucket}/${path}`;
  const opts = { headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  let r;
  try { r = await fetch(url, opts); } catch {
    throw new Error("Couldn't reach the server — check your connection and try again.");
  }
  if (!r.ok) {
    throw new Error(r.status === 404 ? "This app's file isn't available yet." : `Download failed (server said ${r.status}).`);
  }
  const total = parseInt(r.headers.get('Content-Length') || '0', 10);
  if (!r.body || !total) {
    const blob = await r.blob();
    onProgress?.(1);
    return blob;
  }
  const reader = r.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    let step;
    try { step = await reader.read(); } catch {
      throw new Error("Connection dropped partway through — please try again.");
    }
    if (step.done) break;
    chunks.push(step.value);
    received += step.value.length;
    onProgress?.(received / total);
  }
  return new Blob(chunks);
}

export function sanitizeFilename(name) {
  return (name || 'app').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'app';
}

export function buildDownloadFilename(app) {
  const rawExt = (app.file_name || '').split('.').pop();
  const looksLikeExt = rawExt && rawExt.length <= 5 && /^[a-z0-9]+$/i.test(rawExt);
  const ext = looksLikeExt ? rawExt.toLowerCase() : ((app.file_type || '').includes('android') ? 'apk' : 'zip');
  return `${sanitizeFilename(app.name)}.${ext}`;
}

export async function sbGetProfile(token) {
  const r = await fetch(`${AUTHAPI}/user`, {
    headers: { "apikey": ANON_KEY, "authorization": `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

export async function sbInsert(table, data, token) {
  const opts = {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json", "Prefer": "return=representation" }
  };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${REST}/${table}`, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function sbDelete(table, match, token) {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const opts = { method: "DELETE", headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${REST}/${table}?${qs}`, opts);
  if (!r.ok) throw new Error(await r.text());
  return true;
}

export async function sbUpdate(table, data, match, token) {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const opts = {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" }
  };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${REST}/${table}?${qs}`, opts);
  if (!r.ok) throw new Error(await r.text());
  const text = await r.text();
  return text ? JSON.parse(text) : true;
}

export async function sbUpload(bucket, path, file, token) {
  const url = `${STORAGEAPI}/object/${bucket}/${path}`;
  const opts = { method: "POST", body: file, headers: { "apikey": ANON_KEY, "Content-Type": file.type || "application/octet-stream" } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function sbSignUp(email, password) {
  const r = await fetch(`${AUTHAPI}/signup`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" }
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error_description || err.msg || err.error || 'Sign up failed');
  }
  return r.json();
}

export async function sbSignIn(email, password) {
  const r = await fetch(`${AUTHAPI}/token?grant_type=password`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" }
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error_description || err.msg || err.error || 'Sign in failed');
  }
  return r.json();
}
