import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search, Star, X, ArrowLeft, ShieldCheck, ShieldAlert, Sparkles, Users, Loader2, Inbox, Send,
  LayoutDashboard, Package, BarChart3, Settings, Plus, Pencil, Trash2,
  Rocket, EyeOff, Check, TrendingUp, Download, MessageSquare, ThumbsUp, ThumbsDown, Key, Copy
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";

/* ===========================================================
   NexaStore — Supabase wiring (plain fetch, no supabase-js —
   that package isn't available inside artifacts, so this talks
   directly to Supabase's REST/Auth/Storage HTTP APIs).
=========================================================== */
const SUPABASE_URL = "https://mapswtriwoxlscjdakpk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcHN3dHJpd294bHNjamRha3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDM4MDEsImV4cCI6MjEwMTE3OTgwMX0.jkQtVSMwjzkB9NI1txeuk-RTCrxAJX_RXEyNqcdoewY";

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTHAPI = `${SUPABASE_URL}/auth/v1`;
const STORAGEAPI = `${SUPABASE_URL}/storage/v1`;

// A file gets split into bits no larger than this, each uploaded to one of
// N_BUCKETS separate storage buckets round-robin by index — keeps every
// individual object under Supabase's 50MB free-tier per-file cap.
const BIT_SIZE = 45 * 1024 * 1024;
const N_BUCKETS = 8;
function bucketForBit(i) { return `nexastore-bits-${i % N_BUCKETS}`; }

function hdrs(token, extra) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`, ...(extra || {}) };
}

async function sbSelect(table, qs, token) {
  const res = await fetch(`${REST}/${table}?${qs}`, { headers: hdrs(token) });
  if (!res.ok) return [];
  return res.json();
}
async function sbInsert(table, body, token) {
  const res = await fetch(`${REST}/${table}`, {
    method: "POST",
    headers: hdrs(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || "Request failed");
  return Array.isArray(data) ? data[0] : data;
}
async function sbUpdate(table, qs, body, token) {
  const res = await fetch(`${REST}/${table}?${qs}`, {
    method: "PATCH",
    headers: hdrs(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || "Request failed");
  return data;
}
async function sbDelete(table, qs, token) {
  const res = await fetch(`${REST}/${table}?${qs}`, { method: "DELETE", headers: hdrs(token) });
  return res.ok;
}
async function sbUpsertReview(body, token) {
  const res = await fetch(`${REST}/reviews`, {
    method: "POST",
    headers: hdrs(token, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || "Couldn't save review");
  return data;
}
async function sbScanApp(appId, token) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-app`, {
    method: "POST",
    headers: hdrs(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ app_id: appId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "Scan failed");
  return data; // { app_id, scan_status, scan_notes }
}
async function sbRpc(fn, body, token) {
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: "POST",
    headers: hdrs(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return res.ok;
}
async function sbUpload(bucket, path, blob, token) {
  const res = await fetch(`${STORAGEAPI}/object/${bucket}/${path}`, {
    method: "POST",
    headers: hdrs(token, { "x-upsert": "true", "Content-Type": blob.type || "application/octet-stream" }),
    body: blob,
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error("Upload failed: " + t); }
  return true;
}
async function sbUploadLogo(appId, logoBlob, token) {
  const path = `${appId}/logo`;
  const res = await fetch(`${STORAGEAPI}/object/nexastore-logos/${path}`, {
    method: "POST",
    headers: hdrs(token, { "x-upsert": "true", "Content-Type": logoBlob.type || "image/png" }),
    body: logoBlob,
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error("Logo upload failed: " + t); }
  return `${SUPABASE_URL}/storage/v1/object/public/nexastore-logos/${path}`;
}
async function sbGetScreenshots(appId, token) {
  return sbSelect("app_screenshots", `app_id=eq.${appId}&select=*&order=screenshot_index`, token);
}
async function sbUploadScreenshots(appId, screenshotDataUrls, token) {
  // screenshotDataUrls is an array of data URLs (base64)
  for (let i = 0; i < screenshotDataUrls.length; i++) {
    const dataUrl = screenshotDataUrls[i];
    if (!dataUrl.startsWith('data:')) continue; // Skip if already a URL (from edit)
    
    // Convert data URL to blob
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let j = 0; j < n; j++) u8arr[j] = bstr.charCodeAt(j);
    const blob = new Blob([u8arr], { type: mime });
    
    // Upload to storage
    const path = `${appId}/${i}`;
    const res = await fetch(`${STORAGEAPI}/object/nexastore-screenshots/${path}`, {
      method: "POST",
      headers: hdrs(token, { "x-upsert": "true", "Content-Type": mime }),
      body: blob,
    });
    if (!res.ok) throw new Error("Screenshot upload failed");
    
    // Store metadata in app_screenshots table
    const url = `${SUPABASE_URL}/storage/v1/object/public/nexastore-screenshots/${path}`;
    await sbUpsert("app_screenshots", `app_id=eq.${appId}&screenshot_index=eq.${i}`, {
      app_id: appId,
      screenshot_index: i,
      screenshot_url: url,
    }, token);
  }
}
async function sbDownload(bucket, path, token) {
  const res = await fetch(`${STORAGEAPI}/object/${bucket}/${path}`, { headers: hdrs(token) });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

async function authSignUp(email, password) {
  const res = await fetch(`${AUTHAPI}/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Sign up failed");
  return data;
}
async function authSignIn(email, password) {
  const res = await fetch(`${AUTHAPI}/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Sign in failed");
  return data;
}
async function authGetUser(token) {
  const res = await fetch(`${AUTHAPI}/user`, { headers: hdrs(token) });
  if (!res.ok) return null;
  return res.json();
}
async function authRefresh(refreshToken) {
  const res = await fetch(`${AUTHAPI}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  return res.json();
}
async function authSignOut(token) {
  try { await fetch(`${AUTHAPI}/logout`, { method: "POST", headers: hdrs(token) }); } catch {}
}
async function authUpdatePassword(token, newPassword) {
  const res = await fetch(`${AUTHAPI}/user`, {
    method: "PUT",
    headers: hdrs(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Couldn't update password");
  return data;
}

// Session persistence uses the artifact's own window.storage (never
// localStorage/sessionStorage) — personal, not shared, so it's private
// to whoever is using this artifact. "Remember me" unchecked keeps the
// session in a plain in-memory variable instead, so it doesn't survive
// a reload of the artifact.
let memorySession = null;
const SESSION_KEY = "nexastore-auth-session";
async function loadStoredSession() {
  if (memorySession) return memorySession;
  try { const res = await window.storage.get(SESSION_KEY, false); return res ? JSON.parse(res.value) : null; }
  catch { return null; }
}
async function saveStoredSession(session, remember = false) {
  memorySession = null;
  if (session && !remember) {
    memorySession = session;
    try { await window.storage.delete(SESSION_KEY, false); } catch {}
    return;
  }
  try {
    if (session) await window.storage.set(SESSION_KEY, JSON.stringify(session), false);
    else await window.storage.delete(SESSION_KEY, false);
  } catch {}
}

function mapApp(row) {
  return {
    id: row.id,
    devId: row.dev_id,
    name: row.name,
    developer: (row.profiles && row.profiles.display_name) || "NexaStore developer",
    category: row.category,
    shortDescription: row.tagline,
    description: row.description,
    price: Number(row.price) || 0,
    version: row.version,
    releaseNotes: row.release_notes,
    status: row.status,
    rating: Number(row.rating_avg) || 0,
    ratingCount: row.rating_count || 0,
    installs: row.installs_count || 0,
    createdAt: row.created_at,
    fileName: row.file_name,
    fileType: row.file_type,
    totalSizeBytes: row.total_size_bytes,
    bitCount: row.bit_count,
    submittedBy: row.submitted_by || "human",
    scanStatus: row.scan_status || "clean",
    scanNotes: row.scan_notes || "",
    logoUrl: row.logo_url || "",
  };
}

/* ---------------------------------------------------------
   Config
--------------------------------------------------------- */
const STORE_NAME = "NexaStore";
const CATEGORIES = ["All", "Productivity", "Business", "Tools", "Games", "Social", "Photography", "Finance", "Education"];
const CONSOLE_CATEGORIES = ["Productivity", "Business", "Tools", "Games", "Social", "Photography", "Finance", "Education"];
const ICON_GRADIENTS = [
  ["#01875F", "#00C88C"], ["#1A73E8", "#4FA1FF"], ["#EA4335", "#FF7A6E"],
  ["#F9AB00", "#FFCB4D"], ["#7C4DFF", "#B49CFF"], ["#00ACC1", "#66E0F0"],
];

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}
function gradientFor(id) {
  const [a, b] = ICON_GRADIENTS[hashString(id) % ICON_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
function formatInstalls(n) {
  if (n >= 1000000) return `${Math.floor(n / 1000000)}M+`;
  if (n >= 10000) return `${Math.floor(n / 1000)}K+`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K+`;
  return `${n}`;
}
function formatInstallsShort(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function formatBytes(n) {
  if (!n) return "0MB";
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)}GB` : `${mb.toFixed(1)}MB`;
}

/* ---------------------------------------------------------
   NexaStore logo — geometric "N" monogram, SVG
--------------------------------------------------------- */
function NexaLogo({ size = 32, radius = 9 }) {
  const gid = useMemo(() => `nexaGrad-${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#01875F" />
          <stop offset="100%" stopColor="#1A73E8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx={radius} fill={`url(#${gid})`} />
      <path d="M12.5 28.5V11.5H15.9L26.4 25V11.5H29.5V28.5H26.1L15.6 15V28.5H12.5Z" fill="#fff" />
    </svg>
  );
}

/* ---------------------------------------------------------
   Small shared pieces
--------------------------------------------------------- */
function Stars({ value, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5" style={{ color: "#F9AB00" }}>
      <Star size={size} fill="#F9AB00" strokeWidth={0} />
      <span className="text-sm text-gray-700 ml-0.5">{value.toFixed(1)}</span>
    </div>
  );
}
function AppIcon({ app, size = 56, radius = 14 }) {
  if (app.logoUrl) {
    return (
      <img src={app.logoUrl} alt={app.name} 
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: radius }} />
    );
  }
  return (
    <div className="flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, borderRadius: radius, background: gradientFor(app.id), fontSize: size * 0.4 }}>
      {app.name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
function StatusBadge({ status }) {
  const styles = {
    approved: { background: "#E6F4EA", color: "#01875F" },
    pending: { background: "#FEF7E0", color: "#B06000" },
    rejected: { background: "#FCE8E6", color: "#C5221F" },
  }[status] || { background: "#F1F3F4", color: "#5F6368" };
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={styles}>{status}</span>;
}
function SourceBadge({ source }) {
  if (source !== "ai") return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Human</span>;
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit" style={{ background: "#EDE7FF", color: "#7C4DFF" }}><Sparkles size={11} /> AI</span>;
}
function ScanBadge({ status }) {
  const styles = {
    clean: { background: "#E6F4EA", color: "#01875F", label: "Scan clean" },
    pending: { background: "#FEF7E0", color: "#B06000", label: "Scanning…" },
    flagged: { background: "#FCE8E6", color: "#C5221F", label: "Flagged" },
  }[status] || { background: "#F1F3F4", color: "#5F6368", label: status };
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit" style={{ background: styles.background, color: styles.color }}>
    {status === "flagged" ? <ShieldAlert size={11} /> : status === "pending" ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />} {styles.label}
  </span>;
}

/* ---------------------------------------------------------
   AI API key generation — client-side SHA-256, only the hash
   is ever sent to the server; the plaintext key is shown once.
--------------------------------------------------------- */
async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `nxs_live_${b64}`;
}

function AppCard({ app, onOpen }) {
  return (
    <button onClick={() => onOpen(app)} className="flex flex-col text-left gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors w-40 shrink-0">
      <AppIcon app={app} size={64} radius={16} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{app.name}</p>
        <p className="text-xs text-gray-500 truncate">{app.category}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Star size={11} fill="#F9AB00" strokeWidth={0} />
          <span className="text-xs text-gray-600">{app.rating.toFixed(1)}</span>
          {app.price > 0 ? <span className="text-xs text-gray-600 ml-1">${app.price.toFixed(2)}</span> : <span className="text-xs text-gray-600 ml-1">Free</span>}
        </div>
      </div>
    </button>
  );
}
function AppRow({ title, apps, onOpen }) {
  if (!apps.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-medium text-gray-900 mb-2 px-1">{title}</h2>
      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {apps.map((a) => <AppCard key={a.id} app={a} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
function Hero({ apps, onOpen }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (apps.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % apps.length), 5000);
    return () => clearInterval(t);
  }, [apps.length]);
  if (!apps.length) return null;
  const app = apps[idx % apps.length];
  return (
    <div className="relative rounded-2xl overflow-hidden mb-8 cursor-pointer" style={{ background: gradientFor(app.id) }} onClick={() => onOpen(app)}>
      <div className="flex items-center gap-6 p-8 md:p-10">
        <div className="flex items-center justify-center text-white font-bold shrink-0 bg-white/15 backdrop-blur-sm" style={{ width: 88, height: 88, borderRadius: 20, fontSize: 36 }}>
          {app.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80 mb-1">Featured</p>
          <h2 className="text-2xl md:text-3xl font-semibold truncate">{app.name}</h2>
          <p className="text-sm opacity-90 mt-1 line-clamp-1 max-w-xl">{app.shortDescription}</p>
          <div className="flex items-center gap-3 mt-3 text-sm opacity-90">
            <span className="flex items-center gap-1"><Star size={13} fill="white" strokeWidth={0} />{app.rating.toFixed(1)}</span>
            <span>{formatInstalls(app.installs)} installs</span>
          </div>
        </div>
      </div>
      {apps.length > 1 && (
        <div className="flex gap-1.5 justify-center pb-4">
          {apps.map((_, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }} className="h-1.5 rounded-full transition-all"
              style={{ width: i === idx ? 18 : 6, background: "rgba(255,255,255,0.9)", opacity: i === idx ? 1 : 0.5 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Auth modal + header auth chip
--------------------------------------------------------- */
function AuthModal({ onClose, onSignIn, onSignUp }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signin") await onSignIn(email, password, remember);
      else await onSignUp(email, password, remember);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <NexaLogo size={28} radius={8} />
          <span className="text-sm font-medium text-gray-500">{mode === "signin" ? "Sign in to NexaStore" : "Create your NexaStore account"}</span>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("signin")} className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={mode === "signin" ? { background: "#01875F", color: "#fff" } : { background: "#F1F3F4", color: "#5F6368" }}>Sign in</button>
          <button onClick={() => setMode("signup")} className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={mode === "signup" ? { background: "#01875F", color: "#fff" } : { background: "#F1F3F4", color: "#5F6368" }}>Sign up</button>
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
          className="w-full mb-2 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password"
          className="w-full mb-2 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        <label className="flex items-center gap-2 mb-3 text-xs text-gray-600 select-none cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-gray-300" style={{ accentColor: "#01875F" }} />
          Remember me on this device
        </label>
        {err && <p className="text-xs mb-2" style={{ color: "#C5221F" }}>{err}</p>}
        {notice && <p className="text-xs mb-2" style={{ color: "#01875F" }}>{notice}</p>}
        <button onClick={submit} disabled={busy || !email || !password}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "#01875F" }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <p className="text-xs text-gray-400 mt-3 text-center">No email confirmation needed — you're in as soon as you sign up.</p>
      </div>
    </div>
  );
}

function ChangePasswordModal({ session, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (password.length < 6) { setErr("Password needs to be at least 6 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      await authUpdatePassword(session.access_token, password);
      setOk(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <NexaLogo size={28} radius={8} />
          <span className="text-sm font-medium text-gray-500">Change password</span>
        </div>
        {ok ? (
          <>
            <p className="text-sm text-gray-700 mb-4 flex items-center gap-1.5"><Check size={14} style={{ color: "#01875F" }} /> Password updated.</p>
            <button onClick={onClose} className="w-full py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: "#01875F" }}>Done</button>
          </>
        ) : (
          <>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" type="password"
              className="w-full mb-2 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" type="password"
              className="w-full mb-3 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
            {err && <p className="text-xs mb-2" style={{ color: "#C5221F" }}>{err}</p>}
            <button onClick={submit} disabled={busy || !password || !confirm}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ background: "#01875F" }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Update password
            </button>
          </>
        )}
      </div>
    </div>
  );
}


function HeaderAuth({ session, profile, onOpenAuth, onOpenConsole, onSignOut, onChangePassword }) {
  const [open, setOpen] = useState(false);
  if (!session) {
    return (
      <button onClick={onOpenAuth} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium text-white shrink-0"
        style={{ background: "linear-gradient(135deg,#01875F,#1A73E8)" }}>
        Sign in
      </button>
    );
  }
  const label = (profile && profile.display_name) || session.user.email;
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50">
        <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-semibold" style={{ background: "#01875F" }}>
          {label.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm hidden sm:inline max-w-[120px] truncate">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-30">
            {profile && profile.is_owner && (
              <div className="px-3 py-1.5 text-xs text-gray-400">NexaStore owner</div>
            )}
            <button onClick={() => { setOpen(false); onOpenConsole(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700">
              <LayoutDashboard size={14} /> Dev console
            </button>
            <button onClick={() => { setOpen(false); onChangePassword(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700">
              <Key size={14} /> Change password
            </button>
            <button onClick={() => { setOpen(false); onSignOut(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600">
              <X size={14} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   App detail view
--------------------------------------------------------- */
function AppDetail({ app, session, profile, onBack, onInstall }) {
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [screenshots, setScreenshots] = useState([]);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [reviewErr, setReviewErr] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installErr, setInstallErr] = useState("");
  const [dlProgress, setDlProgress] = useState(null);

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    const rows = await sbSelect("reviews", `app_id=eq.${app.id}&select=*,profiles(display_name)&order=created_at.desc`, session && session.access_token);
    setReviews(rows.map((r) => ({
      name: (r.profiles && r.profiles.display_name) || "NexaStore user",
      rating: r.rating, text: r.comment, date: r.created_at,
    })));
    setLoadingReviews(false);
  }, [app.id, session]);

  const loadScreenshots = useCallback(async () => {
    try {
      const rows = await sbGetScreenshots(app.id, session && session.access_token);
      setScreenshots(rows.map((r) => r.screenshot_url));
    } catch {
      setScreenshots([]);
    }
  }, [app.id, session]);

  useEffect(() => { loadReviews(); loadScreenshots(); }, [loadReviews, loadScreenshots]);

  const handleInstall = async () => {
    setInstalling(true); setInstallErr(""); setDlProgress(null);
    try {
      const bits = await sbSelect("app_bits", `app_id=eq.${app.id}&select=*&order=bit_index`, session && session.access_token);
      if (!bits.length) throw new Error("This app doesn't have an installable file yet.");
      const parts = [];
      for (let i = 0; i < bits.length; i++) {
        setDlProgress({ done: i, total: bits.length });
        const blob = await sbDownload(bits[i].bucket_id, bits[i].storage_path, session && session.access_token);
        parts.push(blob);
      }
      setDlProgress({ done: bits.length, total: bits.length });
      const full = new Blob(parts, { type: app.fileType || "application/octet-stream" });
      const url = URL.createObjectURL(full);
      const a = document.createElement("a");
      a.href = url; a.download = app.fileName || app.name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setInstalled(true);
      await sbRpc("increment_install", { p_app_id: app.id }, session && session.access_token);
      onInstall(app.id);
    } catch (e) {
      setInstallErr(e.message);
    } finally {
      setInstalling(false);
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true); setReviewErr("");
    try {
      await sbUpsertReview({ app_id: app.id, user_id: session.user.id, rating: reviewRating, comment: reviewText.trim() }, session.access_token);
      setReviewText("");
      await loadReviews();
    } catch (e) {
      setReviewErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 pb-16">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 py-4">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex flex-col sm:flex-row gap-5 items-start">
        <AppIcon app={app} size={96} radius={22} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">{app.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{app.developer}</p>
          <div className="flex items-center flex-wrap gap-4 mt-3 text-sm text-gray-700">
            <Stars value={app.rating} />
            <span className="text-gray-400">·</span>
            <span>{formatInstalls(app.installs)} installs</span>
            <span className="text-gray-400">·</span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{app.category}</span>
            <span className="text-gray-400">·</span>
            <span className="text-xs text-gray-500">{formatBytes(app.totalSizeBytes)}</span>
          </div>
          <button onClick={handleInstall} disabled={installing || installed}
            className="mt-4 px-6 py-2 rounded-full text-sm font-medium text-white transition-colors disabled:opacity-100 flex items-center gap-2"
            style={{ background: installed ? "#1A73E8" : "#01875F" }}>
            {installing ? <Loader2 size={14} className="animate-spin" /> : null}
            {installed ? "Installed ✓" : installing ? "Installing…" : app.price > 0 ? `Buy $${app.price.toFixed(2)}` : "Install"}
          </button>
          {dlProgress && !installed && (
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-xs">
              <div className="h-full rounded-full" style={{ width: `${Math.round((dlProgress.done / dlProgress.total) * 100)}%`, background: "#01875F", transition: "width 0.2s ease" }} />
            </div>
          )}
          {installErr && <p className="text-xs mt-2" style={{ color: "#C5221F" }}>{installErr}</p>}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto mt-8 pb-2">
        {screenshots && screenshots.length > 0 ? (
          screenshots.map((url, i) => (
            <img key={i} src={url} alt={`screenshot ${i + 1}`} className="shrink-0 rounded-xl object-cover" style={{ width: 160, height: 300 }} />
          ))
        ) : (
          // Fallback to gradient placeholders if no screenshots
          Array.from({ length: 4 }, (_, i) => {
            const rand = seededRandom(hashString(app.id) + 1 + i);
            const [a, b] = ICON_GRADIENTS[Math.floor(rand() * ICON_GRADIENTS.length)];
            return (
              <div key={i} className="shrink-0 rounded-xl" style={{ width: 160, height: 300, background: `linear-gradient(160deg, ${a}, ${b})` }} />
            );
          })
        )}
      </div>

      <section className="mt-8">
        <h3 className="text-base font-medium text-gray-900 mb-2">About this app</h3>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{app.description}</p>
      </section>

      {app.releaseNotes && (
        <section className="mt-6">
          <h3 className="text-base font-medium text-gray-900 mb-2">What's new</h3>
          <p className="text-xs text-gray-500 mb-1">Version {app.version}</p>
          <p className="text-sm text-gray-700 leading-relaxed">{app.releaseNotes}</p>
        </section>
      )}

      <section className="mt-8 border-t border-gray-100 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-gray-900">Ratings & reviews</h3>
          <Stars value={app.rating} size={16} />
        </div>

        {session ? (
          <form onSubmit={submitReview} className="mb-6 p-4 rounded-xl bg-gray-50 space-y-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setReviewRating(n)}>
                  <Star size={18} fill={n <= reviewRating ? "#F9AB00" : "none"} stroke={n <= reviewRating ? "#F9AB00" : "#C4C7C5"} />
                </button>
              ))}
            </div>
            <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share your thoughts about this app" rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F] resize-none" />
            {reviewErr && <p className="text-xs" style={{ color: "#C5221F" }}>{reviewErr}</p>}
            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium text-white disabled:opacity-60" style={{ background: "#01875F" }}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post review
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500 mb-6 p-4 rounded-xl bg-gray-50">Sign in from the header to leave a star rating and review.</p>
        )}

        <div className="space-y-4">
          {loadingReviews ? (
            <p className="text-sm text-gray-400 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-gray-400 flex items-center gap-1.5"><Inbox size={15} /> No reviews yet — be the first.</p>
          ) : reviews.map((r, i) => (
            <div key={i} className="border-b border-gray-50 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                  {r.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <div className="flex items-center gap-1.5">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={11} fill={n <= r.rating ? "#F9AB00" : "none"} stroke={n <= r.rating ? "#F9AB00" : "#C4C7C5"} />)}
                    </div>
                    <span className="text-xs text-gray-400">{timeAgo(r.date)}</span>
                  </div>
                </div>
              </div>
              {r.text && <p className="text-sm text-gray-700 mt-2">{r.text}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------
   Storefront
--------------------------------------------------------- */
function StoreFront({ session, profile, onOpenConsole, onOpenAuth, onSignOut, onChangePassword }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await sbSelect("apps", "select=*,profiles(display_name)&status=eq.approved&order=created_at.desc", null);
    setApps(rows.map(mapApp));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      const matchesCategory = category === "All" || a.category === category;
      const matchesQuery = !query.trim() || a.name.toLowerCase().includes(query.toLowerCase()) || a.developer.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [apps, category, query]);

  const topCharts = useMemo(() => [...filtered].sort((a, b) => b.installs - a.installs).slice(0, 10), [filtered]);
  const newReleases = useMemo(() => [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10), [filtered]);
  const topRated = useMemo(() => [...filtered].filter((a) => a.rating >= 4).sort((a, b) => b.rating - a.rating).slice(0, 10), [filtered]);

  const handleInstall = (appId) => {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, installs: a.installs + 1 } : a)));
    setSelected((s) => (s && s.id === appId ? { ...s, installs: s.installs + 1 } : s));
  };

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Segoe UI', Roboto, -apple-system, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => setSelected(null)}>
            <NexaLogo size={32} radius={9} />
            <span className="text-lg font-medium hidden sm:inline">{STORE_NAME}</span>
          </div>
          <div className="flex-1 relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search apps"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-full bg-gray-100 border border-transparent focus:bg-white focus:border-gray-200 focus:outline-none transition-colors" />
          </div>
          <div className="hidden md:flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <ShieldCheck size={14} /> Verified publisher listings
          </div>
          <button onClick={onOpenConsole} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#01875F,#1A73E8)" }}>
            <LayoutDashboard size={14} /> Dev console
          </button>
          <HeaderAuth session={session} profile={profile} onOpenAuth={onOpenAuth} onOpenConsole={onOpenConsole} onSignOut={onSignOut} onChangePassword={onChangePassword} />
        </div>
        {!selected && (
          <div className="max-w-6xl mx-auto px-4 md:px-8 flex gap-1 overflow-x-auto pb-2">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className="px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors"
                style={category === c ? { background: "#E6F4EA", color: "#01875F", fontWeight: 500 } : { color: "#5F6368" }}>{c}</button>
            ))}
          </div>
        )}
      </header>

      {selected ? (
        <AppDetail app={selected} session={session} profile={profile} onBack={() => setSelected(null)} onInstall={handleInstall} />
      ) : (
        <main className="max-w-6xl mx-auto px-4 md:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Loading catalog…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users size={36} className="text-gray-300 mb-3" />
              <p className="text-gray-900 font-medium">{apps.length === 0 ? "No apps published yet" : "No apps match your search"}</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                {apps.length === 0 ? "Publish your first app from the dev console and it will appear here once approved." : "Try a different search term or category."}
              </p>
            </div>
          ) : (
            <>
              <Hero apps={topCharts.slice(0, 5)} onOpen={setSelected} />
              <AppRow title="Top charts" apps={topCharts} onOpen={setSelected} />
              <AppRow title="New releases" apps={newReleases} onOpen={setSelected} />
              <AppRow title="Top rated" apps={topRated} onOpen={setSelected} />
              <AppRow title={category === "All" ? "All apps" : category} apps={filtered} onOpen={setSelected} />
            </>
          )}
        </main>
      )}
    </div>
  );
}

/* ===========================================================
   Developer console
=========================================================== */
function StatCard({ label, value, icon: Icon, trend }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex-1 min-w-[150px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <Icon size={15} className="text-gray-400" />
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {trend && <p className="text-xs mt-1" style={{ color: "#01875F" }}>{trend}</p>}
    </div>
  );
}
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full transition-colors"
      style={active ? { background: "#E6F4EA", color: "#01875F", fontWeight: 500 } : { color: "#3C4043" }}>
      <Icon size={17} /> {label}
    </button>
  );
}
function buildInstallSeries(app) {
  const days = 14;
  const rand = seededRandom(hashString(app.id));
  const total = app.installs || 0;
  let remaining = total;
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const share = i === 0 ? remaining : Math.round((total / days) * (0.5 + rand()));
    const val = i === 0 ? remaining : Math.min(share, remaining);
    remaining -= val;
    points.push({ day: `Day ${days - i}`, installs: Math.max(val, 0) });
  }
  let running = 0;
  return points.map((p) => { running += p.installs; return { day: p.day, installs: running }; });
}

function emptyForm() {
  return { id: null, name: "", category: CONSOLE_CATEGORIES[0], shortDescription: "", description: "", price: 0, version: "1.0.0", releaseNotes: "", status: null };
}

/* ---------------------------------------------------------
   App form (create / edit) — with real file chunked upload
--------------------------------------------------------- */
function AppForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(initial?.logoUrl || null);
  const [screenshots, setScreenshots] = useState(initial?.screenshots || []);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isEdit = !!form.id;

  const valid = form.name.trim() && form.shortDescription.trim() && form.description.trim() && (isEdit || file) && screenshots.length >= 3;

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!valid) return;
    if (screenshots.length < 3) { setErr("Please upload at least 3 screenshots"); return; }
    setErr(""); setSaving(true); setProgress(null);
    try {
      await onSave({ ...form, price: Number(form.price) || 0 }, file, setProgress, logo, screenshots);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft size={16} /> Back to all apps</button>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{isEdit ? "Edit listing" : "Submit a new app"}</h2>
      <p className="text-sm text-gray-500 mb-6">
        {isEdit ? "Changes go back into review before they go live." : "Any file format — APK, AAB, EXE, or a zipped PWA build. Large files split into bits automatically."}
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600">App name</label>
          <input value={form.name} onChange={set("name")} placeholder="e.g. TaskFlow"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Category</label>
            <select value={form.category} onChange={set("category")}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F] bg-white">
              {CONSOLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Price (USD, 0 = free)</label>
            <input type="number" min="0" step="0.01" value={form.price} onChange={set("price")}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Short description <span className="text-gray-400">({form.shortDescription.length}/80)</span></label>
          <input value={form.shortDescription} maxLength={80} onChange={set("shortDescription")} placeholder="One line shown on cards and search"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Full description</label>
          <textarea value={form.description} onChange={set("description")} rows={5} placeholder="Describe what your app does"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F] resize-none" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">App logo (optional)</label>
          <div className="mt-1 flex items-start gap-3">
            {logoPreview ? (
              <div className="relative">
                <img src={logoPreview} alt="logo preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                <button type="button" onClick={() => { setLogo(null); setLogoPreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">×</button>
              </div>
            ) : null}
            <div className="flex-1">
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 2097152) { setErr("Logo must be under 2MB"); return; }
                    setLogo(f);
                    const reader = new FileReader();
                    reader.onload = (evt) => setLogoPreview(evt.target?.result);
                    reader.readAsDataURL(f);
                  }
                }}
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 w-full cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, or WebP. Max 2MB. Square recommended (512x512+).</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Version</label>
            <input value={form.version} onChange={set("version")} placeholder="1.0.0"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Release notes</label>
            <input value={form.releaseNotes} onChange={set("releaseNotes")} placeholder="What changed in this version"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
          </div>
        </div>

        {!isEdit ? (
          <div>
            <label className="text-xs font-medium text-gray-600">App file</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById("nexa-file-input").click()}
              className="mt-1 border-2 border-dashed rounded-xl p-6 text-center text-sm cursor-pointer transition-colors"
              style={dragOver ? { borderColor: "#01875F", background: "#E6F4EA" } : { borderColor: "#E0E0E0" }}
            >
              {file ? (
                <p className="text-gray-700 font-medium">{file.name} — {formatBytes(file.size)} · {Math.max(1, Math.ceil(file.size / BIT_SIZE))} bit{Math.ceil(file.size / BIT_SIZE) > 1 ? "s" : ""}</p>
              ) : (
                <p className="text-gray-500">Drop your app file here, or click to browse</p>
              )}
              <input id="nexa-file-input" type="file" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">File: {form.fileName || "unchanged"} — the app file can't be replaced after submission. Delete and resubmit to swap it.</p>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">Screenshots (minimum 3) <span className="text-gray-400">({screenshots.length})</span></label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {screenshots.map((ss, i) => (
              <div key={i} className="relative group">
                <img src={ss} alt={`screenshot ${i + 1}`} className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                <button type="button" onClick={() => setScreenshots((s) => s.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
              </div>
            ))}
            {screenshots.length < 10 && (
              <label className="aspect-video rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-[#01875F] hover:bg-[#E6F4EA] transition-colors">
                <input type="file" accept="image/*" multiple onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  for (const f of files) {
                    if (f.size > 2097152) { setErr("Screenshot must be under 2MB"); return; }
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      setScreenshots((s) => [...s.slice(0, 9), evt.target?.result].filter(Boolean));
                    };
                    reader.readAsDataURL(f);
                  }
                }} className="hidden" />
                <div className="text-center text-xs text-gray-400">
                  <p className="font-medium">Add screenshot</p>
                </div>
              </label>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Max 10 screenshots. 2MB each.</p>
        </div>

        {err && <p className="text-xs" style={{ color: "#C5221F" }}>{err}</p>}

        {progress && (
          <div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, background: "#01875F", transition: "width 0.2s ease" }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Uploading bit {progress.done} of {progress.total}…</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button disabled={!valid || saving} onClick={submit}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50" style={{ background: "#01875F" }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            {isEdit ? "Save & resubmit for review" : "Submit for review"}
          </button>
          {!valid && <span className="text-xs text-gray-400">Fill in name, both descriptions{isEdit ? "" : ", choose a file"}, and upload 3+ screenshots</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   App detail / statistics page (console side)
--------------------------------------------------------- */
function AppStatsPage({ app, isOwner, profile, onBack, onEdit, onDelete, onApprove, onReject, onRescan, onOverrideScan }) {
  const series = useMemo(() => buildInstallSeries(app), [app]);
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    let cancelled = false;
    sbSelect("reviews", `app_id=eq.${app.id}&select=*,profiles(display_name)&order=created_at.desc`, null).then((rows) => {
      if (!cancelled) setReviews(rows.map((r) => ({ name: (r.profiles && r.profiles.display_name) || "NexaStore user", rating: r.rating, text: r.comment })));
    });
    return () => { cancelled = true; };
  }, [app.id]);

  const ratingBreakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => { counts[r.rating - 1]++; });
    return counts.reverse().map((c, i) => ({ star: `${5 - i}★`, count: c }));
  }, [reviews]);

  return (
    <div className="max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"><ArrowLeft size={16} /> Back to all apps</button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <AppIcon app={app} size={64} radius={16} />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{app.name}</h2>
            <p className="text-sm text-gray-500">{app.developer} · {app.category}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={app.status} />
              {isOwner && <SourceBadge source={app.submittedBy} />}
              {isOwner && <ScanBadge status={app.scanStatus} />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {app.devId === profile.id && (
            <>
              <button onClick={() => onEdit(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700"><Pencil size={13} /> Edit</button>
              <button onClick={() => onDelete(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-red-100 text-red-600"><Trash2 size={13} /> Delete</button>
            </>
          )}
          {isOwner && app.devId !== profile.id && (
            <button onClick={() => onDelete(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-red-100 text-red-600"><Trash2 size={13} /> Delete</button>
          )}
          {isOwner && app.status === "pending" && (
            <>
              {app.scanStatus === "pending" && (
                <button onClick={() => onRescan(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700"><Loader2 size={13} /> Check scan</button>
              )}
              {app.scanStatus === "flagged" && (
                <button onClick={() => onOverrideScan(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700">Clear scan flag manually</button>
              )}
              <button onClick={() => onApprove(app)} disabled={app.scanStatus !== "clean"}
                title={app.scanStatus === "clean" ? "Approve" : "Needs a clean scan before approval"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full text-white disabled:opacity-40" style={{ background: "#01875F" }}>
                <ThumbsUp size={13} /> Approve
              </button>
              <button onClick={() => onReject(app)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-red-100 text-red-600"><ThumbsDown size={13} /> Reject</button>
            </>
          )}
        </div>
      </div>

      {isOwner && app.scanStatus === "flagged" && app.scanNotes && (
        <div className="mb-6 p-3 rounded-xl flex items-start gap-2" style={{ background: "#FCE8E6" }}>
          <ShieldAlert size={15} style={{ color: "#C5221F" }} className="mt-0.5 shrink-0" />
          <p className="text-sm" style={{ color: "#C5221F" }}>{app.scanNotes}</p>
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-8">
        <StatCard label="Total installs" value={formatInstallsShort(app.installs || 0)} icon={Download} />
        <StatCard label="Average rating" value={(app.rating || 0).toFixed(1)} icon={Star} />
        <StatCard label="Reviews" value={reviews.length} icon={MessageSquare} />
        <StatCard label="File size" value={formatBytes(app.totalSizeBytes)} icon={Package} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Cumulative installs (last 14 days, simulated)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F4" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#5F6368" }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: "#5F6368" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E8EAED" }} />
              <Line type="monotone" dataKey="installs" stroke="#01875F" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Rating breakdown</h3>
          {reviews.length === 0 ? <p className="text-sm text-gray-400 py-16 text-center">No reviews yet</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ratingBreakdown} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="star" type="category" tick={{ fontSize: 11, fill: "#5F6368" }} width={30} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E8EAED" }} />
                <Bar dataKey="count" fill="#1A73E8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Recent reviews</h3>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-gray-400">No reviews yet.</p>}
          {reviews.slice(0, 5).map((r, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{r.name}</span>
                <div className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={11} fill={n <= r.rating ? "#F9AB00" : "none"} stroke={n <= r.rating ? "#F9AB00" : "#C4C7C5"} />)}</div>
              </div>
              {r.text && <p className="text-sm text-gray-600 mt-1">{r.text}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   All apps list
--------------------------------------------------------- */
function AllApps({ apps, isOwner, profile, onCreate, onOpen, onDelete, onApprove, onReject }) {
  const [query, setQuery] = useState("");
  const filtered = apps.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isOwner ? "Search all apps" : "Search your apps"}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        </div>
        <button onClick={onCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white shrink-0" style={{ background: "#01875F" }}>
          <Plus size={15} /> Submit app
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-900 font-medium mb-1">{apps.length === 0 ? (isOwner ? "Nothing submitted yet" : "No apps yet") : "No matches"}</p>
          <p className="text-sm">{apps.length === 0 ? (isOwner ? "Submissions will show up here for review." : "Submit your first app to get started.") : "Try a different search."}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="py-2.5 px-4 font-medium">App</th>
                {isOwner && <th className="py-2.5 px-4 font-medium">Developer</th>}
                <th className="py-2.5 px-4 font-medium">Category</th>
                {isOwner && <th className="py-2.5 px-4 font-medium">Source</th>}
                {isOwner && <th className="py-2.5 px-4 font-medium">Scan</th>}
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Rating</th>
                <th className="py-2.5 px-4 font-medium">Installs</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(a)}>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <AppIcon app={a} size={32} radius={8} />
                      <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{a.name}</p></div>
                    </div>
                  </td>
                  {isOwner && <td className="py-2.5 px-4 text-gray-600">{a.developer}</td>}
                  <td className="py-2.5 px-4 text-gray-600">{a.category}</td>
                  {isOwner && <td className="py-2.5 px-4"><SourceBadge source={a.submittedBy} /></td>}
                  {isOwner && <td className="py-2.5 px-4"><ScanBadge status={a.scanStatus} /></td>}
                  <td className="py-2.5 px-4"><StatusBadge status={a.status} /></td>
                  <td className="py-2.5 px-4 text-gray-600"><span className="flex items-center gap-1"><Star size={11} fill="#F9AB00" strokeWidth={0} />{(a.rating || 0).toFixed(1)}</span></td>
                  <td className="py-2.5 px-4 text-gray-600">{formatInstallsShort(a.installs || 0)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {a.devId === profile.id && a.status !== "approved" && (
                        <button onClick={() => onDelete(a)} title="Delete" className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                      )}
                      {isOwner && a.status === "pending" && (
                        <>
                          <button onClick={() => onApprove(a)} disabled={a.scanStatus !== "clean"} title={a.scanStatus === "clean" ? "Approve" : "Needs a clean scan before approval"}
                            className="text-gray-400 hover:text-[#01875F] disabled:opacity-30 disabled:hover:text-gray-400"><ThumbsUp size={15} /></button>
                          <button onClick={() => onReject(a)} title="Reject" className="text-gray-400 hover:text-red-600"><ThumbsDown size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Dashboard
--------------------------------------------------------- */
function Dashboard({ apps, isOwner }) {
  const totalInstalls = apps.reduce((s, a) => s + (a.installs || 0), 0);
  const rated = apps.filter((a) => a.ratingCount > 0);
  const avgRating = rated.length ? rated.reduce((s, a) => s + a.rating, 0) / rated.length : 0;
  const pending = apps.filter((a) => a.status === "pending").length;

  const installsByApp = apps.slice().sort((a, b) => (b.installs || 0) - (a.installs || 0)).slice(0, 6)
    .map((a) => ({ name: a.name.length > 10 ? a.name.slice(0, 10) + "…" : a.name, installs: a.installs || 0 }));

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Dashboard</h2>
      <p className="text-sm text-gray-500 mb-6">{isOwner ? "Overview across every app submitted to NexaStore." : "Overview across your submitted apps."}</p>

      <div className="flex gap-3 flex-wrap mb-6">
        <StatCard label={isOwner ? "Total apps" : "Your apps"} value={apps.length} icon={Package} />
        <StatCard label="Awaiting review" value={pending} icon={Loader2} />
        <StatCard label="Total installs" value={formatInstallsShort(totalInstalls)} icon={Download} />
        <StatCard label="Average rating" value={avgRating ? avgRating.toFixed(1) : "—"} icon={Star} />
      </div>

      {apps.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Installs by app</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={installsByApp}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5F6368" }} />
              <YAxis tick={{ fontSize: 11, fill: "#5F6368" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E8EAED" }} />
              <Bar dataKey="installs" fill="#01875F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   AI API keys panel (owner only)
--------------------------------------------------------- */
function AiKeysPanel({ session }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await sbSelect("ai_api_keys", "select=*&order=created_at.desc", session.access_token);
    setKeys(rows);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const generate = async () => {
    const key = randomApiKey();
    const hash = await sha256Hex(key);
    await sbInsert("ai_api_keys", { label: label.trim() || "AI publisher key", key_hash: hash }, session.access_token);
    setNewKey(key);
    setLabel("");
    await refresh();
  };

  const revoke = async (id) => {
    await sbUpdate("ai_api_keys", `id=eq.${id}`, { revoked: true }, session.access_token);
    await refresh();
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">AI publishing keys</h2>
      <p className="text-sm text-gray-500 mb-6">
        Hand one of these to any AI agent (a Claude session, a script) instead of an email/password —
        it's all they need to submit apps straight into your review queue. See <code>docs/AI_PUBLISHING.md</code> for the exact calls.
      </p>

      {newKey && (
        <div className="mb-6 p-4 rounded-xl border" style={{ background: "#EDE7FF", borderColor: "#D8CCFF" }}>
          <p className="text-sm font-medium text-gray-900 mb-1">Copy this now — it won't be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border border-gray-200 overflow-x-auto whitespace-nowrap">{newKey}</code>
            <button onClick={copyKey} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-white shrink-0" style={{ background: "#7C4DFF" }}>
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-gray-500 mt-2">Done, dismiss this</button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Claude Code, weekend project)"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#01875F]" />
        <button onClick={generate} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white shrink-0" style={{ background: "#01875F" }}>
          <Key size={14} /> Generate key
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Loading keys…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-400">No keys yet — generate one above to let an AI agent publish apps.</p>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{k.label}</p>
                <p className="text-xs text-gray-400">
                  Created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              {k.revoked ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Revoked</span>
              ) : (
                <button onClick={() => revoke(k.id)} className="text-xs font-medium px-3 py-1 rounded-full border border-red-100 text-red-600">Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function DevConsole({ session, profile, onBackToStore }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [activeApp, setActiveApp] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (!session) onBackToStore(); }, [session, onBackToStore]);

  const isOwner = !!(profile && profile.is_owner);

  const refresh = useCallback(async () => {
    if (!session || !profile) return;
    setLoading(true);
    const qs = isOwner
      ? "select=*,profiles(display_name)&order=created_at.desc"
      : `select=*,profiles(display_name)&dev_id=eq.${profile.id}&order=created_at.desc`;
    const rows = await sbSelect("apps", qs, session.access_token);
    setApps(rows.map(mapApp));
    setLoading(false);
  }, [session, profile, isOwner]);

  useEffect(() => { refresh(); }, [refresh]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleSave = async (form, file, setProgress, logo, screenshots) => {
    const token = session.access_token;
    if (form.id) {
      const updates = {
        name: form.name, tagline: form.shortDescription, description: form.description,
        category: form.category, price: form.price, version: form.version,
        release_notes: form.releaseNotes, status: "pending",
      };
      if (logo) {
        updates.logo_url = await sbUploadLogo(form.id, logo, token);
      }
      await sbUpdate("apps", `id=eq.${form.id}`, updates, token);
      flash("Changes saved — resubmitted for review");
    } else {
      const bitCount = Math.max(1, Math.ceil(file.size / BIT_SIZE));
      const appRow = await sbInsert("apps", {
        dev_id: profile.id, name: form.name, tagline: form.shortDescription, description: form.description,
        category: form.category, price: form.price, version: form.version, release_notes: form.releaseNotes,
        file_name: file.name, file_type: file.type || "application/octet-stream",
        total_size_bytes: file.size, bit_count: bitCount, bit_size_bytes: BIT_SIZE,
      }, token);

      if (logo) {
        const logoUrl = await sbUploadLogo(appRow.id, logo, token);
        await sbUpdate("apps", `id=eq.${appRow.id}`, { logo_url: logoUrl }, token);
      }

      for (let i = 0; i < bitCount; i++) {
        setProgress({ done: i, total: bitCount });
        const chunk = file.slice(i * BIT_SIZE, (i + 1) * BIT_SIZE);
        const bucket = bucketForBit(i);
        const path = `${appRow.id}/${i}`;
        await sbUpload(bucket, path, chunk, token);
        await sbInsert("app_bits", { app_id: appRow.id, bit_index: i, bucket_id: bucket, storage_path: path, size_bytes: chunk.size }, token);
      }
      setProgress({ done: bitCount, total: bitCount });
      
      if (screenshots && screenshots.length > 0) {
        await sbUploadScreenshots(appRow.id, screenshots, token);
      }
      
      flash("App submitted for review");
    }
    await refresh();
    setView("apps");
    setActiveApp(null);
  };

  const handleDelete = async (app) => {
    await sbDelete("apps", `id=eq.${app.id}`, session.access_token);
    await refresh();
    setView("apps");
    setActiveApp(null);
    flash("App deleted");
  };

  const handleApprove = async (app) => {
    await sbUpdate("apps", `id=eq.${app.id}`, { status: "approved" }, session.access_token);
    await refresh();
    setActiveApp((a) => (a && a.id === app.id ? { ...a, status: "approved" } : a));
    flash("App approved — now live in the store");
  };
  const handleReject = async (app) => {
    await sbUpdate("apps", `id=eq.${app.id}`, { status: "rejected" }, session.access_token);
    await refresh();
    setActiveApp((a) => (a && a.id === app.id ? { ...a, status: "rejected" } : a));
    flash("App rejected");
  };

  const handleRescan = async (app) => {
    try {
      const result = await sbScanApp(app.id, session.access_token);
      await refresh();
      setActiveApp((a) => (a && a.id === app.id ? { ...a, scanStatus: result.scan_status, scanNotes: result.scan_notes } : a));
      flash(result.scan_status === "clean" ? "Scan came back clean" : "Scan flagged this app");
    } catch (e) {
      flash("Scan failed: " + e.message);
    }
  };
  const handleOverrideScan = async (app) => {
    await sbUpdate("apps", `id=eq.${app.id}`, { scan_status: "clean", scan_notes: `${app.scanNotes} [manually cleared by owner]`.trim() }, session.access_token);
    await refresh();
    setActiveApp((a) => (a && a.id === app.id ? { ...a, scanStatus: "clean" } : a));
    flash("Scan flag cleared");
  };

  const openStats = (app) => { setActiveApp(app); setView("stats"); };
  const openEdit = (app) => { setActiveApp(app); setView("form"); };
  const openCreate = () => { setActiveApp(null); setView("form"); };

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-[#F8F9FA] text-gray-900" style={{ fontFamily: "'Segoe UI', Roboto, -apple-system, sans-serif" }}>
      <aside className="w-56 shrink-0 bg-white border-r border-gray-100 p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 mb-6 cursor-pointer" onClick={onBackToStore}>
          <NexaLogo size={32} radius={9} />
          <div>
            <p className="text-sm font-medium leading-tight">{STORE_NAME}</p>
            <p className="text-xs text-gray-400 leading-tight">{isOwner ? "Owner console" : "Developer console"}</p>
          </div>
        </div>
        <NavItem icon={LayoutDashboard} label="Dashboard" active={view === "dashboard"} onClick={() => { setView("dashboard"); setActiveApp(null); }} />
        <NavItem icon={Package} label={isOwner ? "Review queue" : "My apps"} active={view === "apps" || view === "form" || view === "stats"} onClick={() => { setView("apps"); setActiveApp(null); }} />
        {isOwner && <NavItem icon={Key} label="AI keys" active={view === "aikeys"} onClick={() => { setView("aikeys"); setActiveApp(null); }} />}
        <NavItem icon={BarChart3} label="Statistics" active={false} onClick={() => flash("Per-app stats live inside each app")} />
        <NavItem icon={Settings} label="Settings" active={false} onClick={() => flash("Nothing to configure yet")} />
        <div className="flex-1" />
        <NavItem icon={ArrowLeft} label="View store" active={false} onClick={onBackToStore} />
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-x-hidden">
        {toast && (
          <div className="fixed top-4 right-4 z-30 flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
            <Check size={14} /> {toast}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Loading console…</div>
        ) : view === "dashboard" ? (
          <Dashboard apps={apps} isOwner={isOwner} />
        ) : view === "apps" ? (
          <AllApps apps={apps} isOwner={isOwner} profile={profile} onCreate={openCreate} onOpen={openStats} onDelete={handleDelete} onApprove={handleApprove} onReject={handleReject} />
        ) : view === "aikeys" && isOwner ? (
          <AiKeysPanel session={session} />
        ) : view === "form" ? (
          <AppForm initial={activeApp ? { ...activeApp, shortDescription: activeApp.shortDescription, releaseNotes: activeApp.releaseNotes } : emptyForm()}
            onCancel={() => { setView(activeApp ? "stats" : "apps"); }} onSave={handleSave} />
        ) : view === "stats" && activeApp ? (
          <AppStatsPage app={apps.find((a) => a.id === activeApp.id) || activeApp} isOwner={isOwner} profile={profile}
            onBack={() => { setView("apps"); setActiveApp(null); }} onEdit={openEdit} onDelete={handleDelete}
            onApprove={handleApprove} onReject={handleReject} onRescan={handleRescan} onOverrideScan={handleOverrideScan} />
        ) : null}
      </main>
    </div>
  );
}

/* ===========================================================
   NexaStore — top level: auth session + store/console switch
=========================================================== */
export default function NexaStoreApp() {
  const [view, setView] = useState("store");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pendingConsole, setPendingConsole] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await loadStoredSession();
      if (stored && stored.access_token) {
        let token = stored.access_token;
        let user = await authGetUser(token);
        if (!user && stored.refresh_token) {
          const refreshed = await authRefresh(stored.refresh_token);
          if (refreshed && refreshed.access_token) {
            token = refreshed.access_token;
            await saveStoredSession(refreshed);
            user = await authGetUser(token);
          }
        }
        if (user) {
          const sess = { access_token: token, refresh_token: stored.refresh_token, user };
          setSession(sess);
          const rows = await sbSelect("profiles", `id=eq.${user.id}&select=*`, token);
          setProfile(rows[0] || null);
        } else {
          await saveStoredSession(null);
        }
      }
    })();
  }, []);

  const loadProfileFor = async (userId, token) => {
    const rows = await sbSelect("profiles", `id=eq.${userId}&select=*`, token);
    setProfile(rows[0] || null);
  };

  const doSignIn = async (email, password, remember) => {
    const data = await authSignIn(email, password);
    await saveStoredSession(data, remember);
    setSession(data);
    await loadProfileFor(data.user.id, data.access_token);
    if (pendingConsole) { setView("console"); setPendingConsole(false); }
  };

  const doSignUp = async (email, password, remember) => {
    const data = await authSignUp(email, password);
    if (data.access_token) {
      await saveStoredSession(data, remember);
      setSession(data);
      await new Promise((r) => setTimeout(r, 500));
      await loadProfileFor(data.user.id, data.access_token);
      if (pendingConsole) { setView("console"); setPendingConsole(false); }
    } else {
      throw new Error("Account created. If sign-in doesn't work immediately, ask the store owner to confirm email confirmation is switched off.");
    }
  };

  const doSignOut = async () => {
    if (session && session.access_token) await authSignOut(session.access_token);
    await saveStoredSession(null);
    setSession(null);
    setProfile(null);
    setView("store");
  };

  const openConsole = () => {
    if (session) setView("console");
    else { setPendingConsole(true); setShowAuth(true); }
  };

  return (
    <>
      {view === "store" ? (
        <StoreFront
          session={session} profile={profile}
          onOpenConsole={openConsole}
          onOpenAuth={() => { setPendingConsole(false); setShowAuth(true); }}
          onSignOut={doSignOut}
          onChangePassword={() => setShowChangePassword(true)}
        />
      ) : (
        <DevConsole session={session} profile={profile} onBackToStore={() => setView("store")} />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSignIn={doSignIn} onSignUp={doSignUp} />}
      {showChangePassword && <ChangePasswordModal session={session} onClose={() => setShowChangePassword(false)} />}
    </>
  );
}
