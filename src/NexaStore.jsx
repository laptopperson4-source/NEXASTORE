import React, { useState, useEffect, useMemo } from 'react';
import StudioTutorialPlayer from './StudioTutorialPlayer.jsx';
import { Search, Download, Home, Compass, Grid, TrendingUp, Bell, Package, Heart, ChevronRight, Zap, Wrench, Code, X, Gamepad2, Play, DollarSign, Star, CheckSquare, Eye, EyeOff, LogOut, Crown, Upload, Image as ImageIcon, FileArchive, Share2, User, ArrowLeft, Trash2, ShieldCheck, AlertCircle, CheckCircle2, Loader2, Wallet, ExternalLink, Lock, BarChart3, Pencil, BookOpen, ChevronLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SUPABASE_URL = "https://mapswtriwoxlscjdakpk.supabase.co";
const REST = `${SUPABASE_URL}/rest/v1`;
const STORAGEAPI = `${SUPABASE_URL}/storage/v1`;
const AUTHAPI = `${SUPABASE_URL}/auth/v1`;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcHN3dHJpd294bHNjamRha3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDM4MDEsImV4cCI6MjEwMTE3OTgwMX0.jkQtVSMwjzkB9NI1txeuk-RTCrxAJX_RXEyNqcdoewY";

async function sbSelect(table, qs, token) {
  const url = `${REST}/${table}?${qs}`;
  const opts = { headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbDownload(bucket, path, token, onProgress) {
  const url = `${STORAGEAPI}/object/${bucket}/${path}`;
  const opts = { headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;

  let r;
  try {
    r = await fetch(url, opts);
  } catch {
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
    try {
      step = await reader.read();
    } catch {
      throw new Error("Connection dropped partway through — please try again.");
    }
    if (step.done) break;
    chunks.push(step.value);
    received += step.value.length;
    onProgress?.(received / total);
  }
  return new Blob(chunks);
}

function sanitizeFilename(name) {
  return (name || 'app').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'app';
}

function buildDownloadFilename(app) {
  const rawExt = (app.file_name || '').split('.').pop();
  const looksLikeExt = rawExt && rawExt.length <= 5 && /^[a-z0-9]+$/i.test(rawExt);
  const ext = looksLikeExt ? rawExt.toLowerCase() : ((app.file_type || '').includes('android') ? 'apk' : 'zip');
  return `${sanitizeFilename(app.name)}.${ext}`;
}

async function sbGetProfile(token) {
  const r = await fetch(`${AUTHAPI}/user`, {
    headers: { "apikey": ANON_KEY, "authorization": `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

async function sbInsert(table, data, token) {
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

async function sbDelete(table, match, token) {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const opts = { method: "DELETE", headers: { "apikey": ANON_KEY } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${REST}/${table}?${qs}`, opts);
  if (!r.ok) throw new Error(await r.text());
  return true;
}

async function sbUpdate(table, data, match, token) {
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
async function sbUpload(bucket, path, file, token) {
  const url = `${STORAGEAPI}/object/${bucket}/${path}`;
  const opts = { method: "POST", body: file, headers: { "apikey": ANON_KEY, "Content-Type": file.type || "application/octet-stream" } };
  if (token) opts.headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbSignUp(email, password) {
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

async function sbSignIn(email, password) {
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

async function sbRefresh(refreshToken) {
  const r = await fetch(`${AUTHAPI}/token?grant_type=refresh_token`, {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" }
  });
  if (!r.ok) return null;
  return r.json();
}

const AUTH_STORAGE_KEY = 'nexastore_auth';
function saveAuthSession(data) {
  // data: { access_token, refresh_token, expires_at?, expires_in? }
  if (!data?.access_token) return;
  const expiresAt = data.expires_at
    || (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : null);
  const payload = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: expiresAt,
  };
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem('token', data.access_token); // backward compat
  } catch {}
}
function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const token = localStorage.getItem('token');
  return token ? { access_token: token, refresh_token: null, expires_at: null } : null;
}
function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem('token');
  } catch {}
}
async function restoreSession() {
  const saved = loadAuthSession();
  if (!saved?.access_token) return null;
  // Try current access token
  let user = await sbGetProfile(saved.access_token);
  if (user) return { token: saved.access_token, user, session: saved };
  // Refresh if possible
  if (saved.refresh_token) {
    const refreshed = await sbRefresh(saved.refresh_token);
    if (refreshed?.access_token) {
      saveAuthSession(refreshed);
      user = await sbGetProfile(refreshed.access_token);
      if (user) return { token: refreshed.access_token, user, session: refreshed };
    }
  }
  clearAuthSession();
  return null;
}


/* ============================================
   SHARED: Logo, banners, icon maps, themes
   ============================================ */
function NexaLogo({ size = 40 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F43F8E" />
          <stop offset="45%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#lg-${id})`} />
      <path d="M12 28.5V11.5L14.6 11.5L27 28.2V11.8" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const BANNERS = ['/banner-usdt.png', '/banner-discover.png', '/banner-gaming.png', '/banner-developer.png'];

/* ============================================
   USDT PAYMENTS + CRYPTO WALLET (client-side)
   Prices are in USDT. Purchases are tracked in
   localStorage (and best-effort to a purchases
   table if it exists on Supabase).
   ============================================ */
const WALLET_KEY = 'nexastore_crypto_wallet';
const PURCHASES_KEY = 'nexastore_purchases';

const RECOMMENDED_WALLETS = [
  { id: 'trust', name: 'Trust Wallet', desc: 'Mobile-first, excellent USDT (TRC-20 & ERC-20) support', url: 'https://trustwallet.com/', networks: 'Multi-chain', tutorialId: 'trust-btc-mob' },
  { id: 'metamask', name: 'MetaMask', desc: 'Browser + mobile. Best for Ethereum & USDT ERC-20', url: 'https://metamask.io/', networks: 'Ethereum, L2s', tutorialId: 'metamask-eth-ext' },
  { id: 'binance', name: 'Binance Web3 Wallet', desc: 'Seamless USDT from Binance exchange balances', url: 'https://www.binance.com/en/web3wallet', networks: 'BSC, Multi', tutorialId: null },
  { id: 'coinbase', name: 'Coinbase Wallet', desc: 'Simple onboarding, USDT on multiple networks', url: 'https://www.coinbase.com/wallet', networks: 'Multi-chain', tutorialId: 'coinbase-eth-mob' },
  { id: 'phantom', name: 'Phantom', desc: 'Great UX; supports USDT on Solana', url: 'https://phantom.app/', networks: 'Solana + more', tutorialId: 'phantom-sol-ext' },
  { id: 'tonkeeper', name: 'Tonkeeper', desc: 'USDT on TON — fast & low fees', url: 'https://tonkeeper.com/', networks: 'TON', tutorialId: null },
];

let _tutorialsCache = null;
async function loadTutorials() {
  if (_tutorialsCache) return _tutorialsCache;
  try {
    const r = await fetch('/tutorials.json');
    if (!r.ok) throw new Error('failed');
    _tutorialsCache = await r.json();
  } catch {
    _tutorialsCache = [];
  }
  return _tutorialsCache;
}
function findTutorial(tutorials, tutorialId, walletName) {
  if (!tutorials?.length) return null;
  if (tutorialId) {
    const hit = tutorials.find(t => t.id === tutorialId);
    if (hit) return hit;
  }
  if (walletName) {
    const q = walletName.toLowerCase();
    return tutorials.find(t => (t.walletName || '').toLowerCase().includes(q) || q.includes((t.walletName || '').toLowerCase())) || null;
  }
  return null;
}


function getStoredWallet() {
  try { return JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); } catch { return null; }
}
function setStoredWallet(w) {
  if (w) localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  else localStorage.removeItem(WALLET_KEY);
}
function getPurchases() {
  try { return JSON.parse(localStorage.getItem(PURCHASES_KEY) || '{}'); } catch { return {}; }
}
function markPurchased(appId, userId) {
  const key = userId || 'guest';
  const all = getPurchases();
  if (!all[key]) all[key] = [];
  if (!all[key].includes(appId)) all[key].push(appId);
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(all));
}
function hasPurchased(appId, userId) {
  const key = userId || 'guest';
  const all = getPurchases();
  return (all[key] || []).includes(appId);
}
function formatPrice(price) {
  const p = parseFloat(price) || 0;
  if (p <= 0) return 'Free';
  return `${p.toFixed(2)} USDT`;
}

const DEV_PROFILES_KEY = 'nexastore_dev_profiles';
function getLocalDevProfile(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(DEV_PROFILES_KEY) || '{}');
    return all[userId] || null;
  } catch { return null; }
}
function setLocalDevProfile(userId, data) {
  try {
    const all = JSON.parse(localStorage.getItem(DEV_PROFILES_KEY) || '{}');
    all[userId] = { ...(all[userId] || {}), ...data };
    localStorage.setItem(DEV_PROFILES_KEY, JSON.stringify(all));
  } catch {}
}
function mergeDevProfile(profile) {
  if (!profile?.id) return profile;
  const local = getLocalDevProfile(profile.id);
  if (!local) return profile;
  return {
    ...profile,
    developer_name: profile.developer_name || local.developer_name || null,
    company_name: profile.company_name || local.company_name || null,
    is_developer: profile.is_developer || local.is_developer || false,
  };
}
function isDeveloperAccount(profile) {
  if (!profile) return false;
  return !!(profile.is_developer || profile.developer_name || profile.company_name);
}
function publicDevName(profile) {
  if (!profile) return '';
  return (profile.developer_name || profile.company_name || '').trim();
}

async function enrichAppsWithDevelopers(apps) {
  if (!apps || !apps.length) return apps || [];
  const ids = [...new Set(apps.map(a => a.dev_id).filter(Boolean))];
  if (!ids.length) return apps;
  let byId = {};
  try {
    const profs = await sbSelect('profiles', `id=in.(${ids.join(',')})&select=id,email,developer_name,company_name`);
    for (const pr of (profs || [])) {
      byId[pr.id] = pr.developer_name || pr.company_name || (pr.email ? pr.email.split('@')[0] : null);
    }
  } catch {
    for (const id of ids) {
      const local = getLocalDevProfile(id);
      if (local?.developer_name) byId[id] = local.developer_name;
    }
  }
  for (const id of ids) {
    if (!byId[id]) {
      const local = getLocalDevProfile(id);
      if (local?.developer_name) byId[id] = local.developer_name;
    }
  }
  return apps.map(a => ({
    ...a,
    developer_name: a.developer_name || byId[a.dev_id] || null,
  }));
}

function BannerCarousel({ rounded = 'rounded-[28px]', maxHeight = '360px', dotBottom = 'bottom-5' }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(p => (p + 1) % BANNERS.length), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={`w-full ${rounded} overflow-hidden relative bg-slate-900`} style={{ aspectRatio: '1774/887', maxHeight }}>
      {BANNERS.map((src, i) => (
        <img key={src} src={src} alt="NexaStore banner"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className={`absolute ${dotBottom} left-1/2 -translate-x-1/2 flex gap-1.5`}>
        {BANNERS.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? 'bg-white w-6' : 'bg-white/45 w-1.5'}`} />
        ))}
      </div>
    </div>
  );
}

/* ============================================
   LOGO-DERIVED GRADIENT — ported and validated from a Python prototype.
   Reads a logo image's real colors, picks out a genuine cool+hot pair if
   both are present, or generates a well-matched partner color (via a
   color-theory lookup, not a blind hue rotation) when the logo is a single
   color family. Falls back to null (caller uses the preset palette) for
   grayscale/monochrome logos or on any load/CORS failure.
   ============================================ */
const _logoGradientCache = new Map();

function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function _hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const _isWarmHue = (hue) => hue < 65 || hue >= 340;

function _warmPartnerFor(coolHue) {
  if (coolHue < 150) return 14;
  if (coolHue < 210) return 28;
  if (coolHue < 270) return 42;
  return 50;
}

function _coolPartnerFor(warmHue) {
  if (warmHue >= 340 || warmHue < 20) return 200;
  if (warmHue < 45) return 215;
  return 258;
}

function extractLogoGradient(imageUrl) {
  if (!imageUrl) return Promise.resolve(null);
  if (_logoGradientCache.has(imageUrl)) return Promise.resolve(_logoGradientCache.get(imageUrl));

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let warmSin = 0, warmCos = 0, warmTotal = 0;
        let coolSin = 0, coolCos = 0, coolTotal = 0;

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const [h, s, l] = _rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (l < 0.13 || l > 0.93 || s < 0.18) continue;
          const rad = (h * Math.PI) / 180;
          if (_isWarmHue(h)) {
            warmSin += s * Math.sin(rad); warmCos += s * Math.cos(rad); warmTotal += s;
          } else {
            coolSin += s * Math.sin(rad); coolCos += s * Math.cos(rad); coolTotal += s;
          }
        }

        const combined = warmTotal + coolTotal;
        const warmHue = warmTotal > 0 ? ((Math.atan2(warmSin, warmCos) * 180) / Math.PI + 360) % 360 : null;
        const coolHue = coolTotal > 0 ? ((Math.atan2(coolSin, coolCos) * 180) / Math.PI + 360) % 360 : null;

        const MIN_SHARE = 0.12;
        const hasWarm = warmHue !== null && combined > 0 && warmTotal / combined > MIN_SHARE;
        const hasCool = coolHue !== null && combined > 0 && coolTotal / combined > MIN_SHARE;

        let finalWarm, finalCool;
        if (hasWarm && hasCool) { finalWarm = warmHue; finalCool = coolHue; }
        else if (hasCool) { finalCool = coolHue; finalWarm = _warmPartnerFor(coolHue); }
        else if (hasWarm) { finalWarm = warmHue; finalCool = _coolPartnerFor(warmHue); }
        else { resolve(null); return; }

        const hot = _hslToHex(finalWarm, 0.80, 0.52);
        const cool = _hslToHex(finalCool, 0.75, 0.46);
        resolve({ cool, hot, css: `linear-gradient(135deg, ${cool} 0%, ${hot} 100%)` });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });

  _logoGradientCache.set(imageUrl, promise);
  promise.then((r) => _logoGradientCache.set(imageUrl, r));
  return promise;
}

function useLogoGradient(logoUrl) {
  const cached = logoUrl && _logoGradientCache.get(logoUrl);
  const [gradient, setGradient] = useState(cached && !(cached instanceof Promise) ? cached : null);
  useEffect(() => {
    let cancelled = false;
    if (!logoUrl) { setGradient(null); return; }
    extractLogoGradient(logoUrl).then((r) => { if (!cancelled) setGradient(r); });
    return () => { cancelled = true; };
  }, [logoUrl]);
  return gradient;
}

const categoryIconMap = {
  Tools: Wrench, Games: Gamepad2, Entertainment: Play, Finance: DollarSign,
  Productivity: Zap, Developer: Code, Business: Package, Education: CheckSquare,
};

const cardThemes = [
  { grad: 'from-violet-400 to-purple-600', icon: 'text-violet-600', btn: 'bg-violet-700 hover:bg-violet-800' },
  { grad: 'from-blue-400 to-indigo-600', icon: 'text-indigo-600', btn: 'bg-indigo-700 hover:bg-indigo-800' },
  { grad: 'from-orange-400 to-red-500', icon: 'text-orange-600', btn: 'bg-orange-600 hover:bg-orange-700' },
  { grad: 'from-emerald-400 to-teal-600', icon: 'text-emerald-600', btn: 'bg-emerald-700 hover:bg-emerald-800' },
  { grad: 'from-pink-400 to-fuchsia-600', icon: 'text-fuchsia-600', btn: 'bg-fuchsia-700 hover:bg-fuchsia-800' },
];

const smallIconThemes = [
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-orange-400 to-amber-500',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-pink-400 to-fuchsia-600',
  'bg-gradient-to-br from-blue-400 to-indigo-600',
];

const pastelCategories = [
  { name: 'Tools', icon: Wrench, bg: 'bg-violet-100', color: 'text-violet-600' },
  { name: 'Games', icon: Gamepad2, bg: 'bg-blue-100', color: 'text-blue-600' },
  { name: 'Entertainment', icon: Play, bg: 'bg-rose-100', color: 'text-rose-500' },
  { name: 'Finance', icon: DollarSign, bg: 'bg-orange-100', color: 'text-orange-500' },
  { name: 'Productivity', icon: Zap, bg: 'bg-emerald-100', color: 'text-emerald-600' },
  { name: 'Developer', icon: Code, bg: 'bg-indigo-100', color: 'text-indigo-600' },
];

function AuthModal({ onClose, onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const result = isSignUp ? await sbSignUp(email, password) : await sbSignIn(email, password);
      const session = result.session || result;
      const token = session?.access_token || result.access_token;
      if (!token) {
        if (isSignUp) {
          setInfo('Account created! If email confirmation is required, check your inbox — otherwise just sign in now.');
          setIsSignUp(false);
        } else {
          throw new Error('Sign in did not return a session. Please try again.');
        }
        return;
      }
      onAuth(session.access_token ? session : { access_token: token, refresh_token: result.refresh_token, expires_in: result.expires_in });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-gray-900">{isSignUp ? 'Create account' : 'Sign in'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-600 text-[13px] font-medium">{error}</p>}
          {info && <p className="text-emerald-600 text-[13px] font-medium">{info}</p>}

          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 text-[14px]">
            {loading ? 'Please wait…' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setInfo(''); }} className="w-full mt-4 text-violet-600 hover:text-violet-700 text-[13px] font-semibold">
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
}

function FileDropField({ label, hint, icon: Icon, accept, multiple, onChange, files, dark }) {
  const count = multiple ? (files ? files.length : 0) : (files ? 1 : 0);
  return (
    <label className={`block border-2 border-dashed rounded-2xl p-4 cursor-pointer transition-colors ${dark ? 'border-white/15 hover:border-violet-400/50 hover:bg-white/5' : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${dark ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
          <Icon size={18} className={dark ? 'text-violet-400' : 'text-violet-600'} strokeWidth={2.1} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13.5px] font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
          <p className={`text-[12px] ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{count > 0 ? `${count} file${count > 1 ? 's' : ''} selected` : hint}</p>
        </div>
        <Upload size={16} className={dark ? 'text-slate-500' : 'text-gray-400'} />
      </div>
      <input type="file" accept={accept} multiple={multiple} onChange={onChange} className="hidden" />
    </label>
  );
}


function TutorialViewer({ tutorial, onClose, onBack, dark }) {
  // AI Studio–style animated wallet UI (cursor, highlights, voiceover)
  return (
    <StudioTutorialPlayer
      tutorial={tutorial}
      onClose={onClose}
      onBack={onBack}
      dark={dark !== false}
    />
  );
}

function TutorialHub({ onClose, onOpenTutorial, dark, initialTutorials }) {
  const [tutorials, setTutorials] = useState(initialTutorials || []);
  const [loading, setLoading] = useState(!initialTutorials);
  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  const card = dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100';

  useEffect(() => {
    if (initialTutorials?.length) return;
    let cancelled = false;
    setLoading(true);
    loadTutorials().then(list => {
      if (!cancelled) { setTutorials(list); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [initialTutorials]);

  const groups = useMemo(() => {
    const g = {};
    for (const t of tutorials) {
      const key = t.device || 'other';
      if (!g[key]) g[key] = [];
      g[key].push(t);
    }
    return g;
  }, [tutorials]);

  const deviceLabel = { extension: 'Browser extensions', mobile: 'Mobile wallets', hardware: 'Hardware wallets', software: 'Desktop / software', other: 'Other' };

  return (
    <div className={`fixed inset-0 z-[165] overflow-auto ${bg}`} style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3 ${dark ? 'bg-[#0a0e27] border-white/10' : 'bg-white border-gray-100'}`}>
        <button type="button" onClick={onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <ArrowLeft size={20} className={text} />
        </button>
        <div>
          <p className={`font-bold text-[15px] ${text}`}>USDT & wallet tutorials</p>
          <p className={`text-[11.5px] ${subtext}`}>Step-by-step guides for NexaStore checkout</p>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {loading && <p className={`text-[13px] text-center py-10 ${subtext}`}>Loading tutorials…</p>}
        {!loading && tutorials.length === 0 && (
          <p className={`text-[13px] text-center py-10 ${subtext}`}>No tutorials available.</p>
        )}
        {Object.keys(groups).map(key => (
          <div key={key}>
            <p className={`text-[12px] font-bold uppercase tracking-wider mb-2.5 ${subtext}`}>{deviceLabel[key] || key}</p>
            <div className="space-y-2">
              {groups[key].map(tut => (
                <button key={tut.id} type="button" onClick={() => onOpenTutorial(tut)}
                  className={`w-full text-left rounded-xl border px-3.5 py-3 flex items-start gap-3 hover:opacity-90 ${card}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${dark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold text-[13.5px] ${text}`}>{tut.walletName}</p>
                    <p className={`text-[12px] mt-0.5 line-clamp-2 ${subtext}`}>{tut.title}</p>
                    <p className={`text-[11px] mt-1 font-medium ${dark ? 'text-violet-300' : 'text-violet-600'}`}>
                      {(tut.steps || []).length} steps · Video · {tut.networkName || 'USDT'}
                    </p>
                  </div>
                  <ChevronRight size={16} className={`mt-1 flex-shrink-0 ${subtext}`} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WalletSetupModal({ onClose, onConnected, dark, onOpenTutorial }) {
  const [address, setAddress] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const bg = dark ? 'bg-[#12172f]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  const card = dark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-100';
  const inputCls = dark
    ? 'w-full px-3.5 py-2.5 rounded-xl bg-white/10 text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-[13.5px]'
    : 'w-full px-3.5 py-2.5 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-[13.5px]';

  const connect = () => {
    setError('');
    const addr = address.trim();
    if (!selected) { setError('Pick a recommended wallet first.'); return; }
    if (!addr || addr.length < 10) { setError('Enter a valid wallet address from your wallet app.'); return; }
    const wallet = { provider: selected.id, name: selected.name, address: addr, connectedAt: Date.now() };
    setStoredWallet(wallet);
    onConnected?.(wallet);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`${bg} rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-auto shadow-2xl`}>
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10" style={{ background: dark ? '#12172f' : '#fff' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <Wallet size={18} className="text-white" />
            </div>
            <div>
              <p className={`font-bold text-[15px] ${text}`}>Create a crypto account</p>
              <p className={`text-[11.5px] ${subtext}`}>Required to buy apps on NexaStore (USDT only)</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}><X size={18} className={text} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className={`rounded-2xl border px-4 py-3 ${dark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
            <p className="text-[13px] font-semibold flex items-center gap-1.5"><DollarSign size={15} /> NexaStore accepts <span className="font-extrabold">USDT only</span> for now</p>
            <p className={`text-[12px] mt-1 ${dark ? 'text-emerald-300/80' : 'text-emerald-700/80'}`}>Pick a wallet below, open it, then paste your address (or demo-connect for testing).</p>
          </div>

          <div>
            <p className={`text-[12.5px] font-bold uppercase tracking-wide mb-2.5 ${subtext}`}>Recommended wallets</p>
            <div className="space-y-2">
              {RECOMMENDED_WALLETS.map(w => (
                <button key={w.id} type="button" onClick={() => setSelected(w)}
                  className={`w-full text-left rounded-xl border px-3.5 py-3 transition-all ${selected?.id === w.id
                    ? (dark ? 'border-violet-400 bg-violet-500/20 ring-1 ring-violet-400/40' : 'border-violet-500 bg-violet-50 ring-1 ring-violet-200')
                    : `${card} hover:border-violet-300`}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-bold text-[13.5px] ${text}`}>{w.name}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${dark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>Recommended</span>
                      </div>
                      <p className={`text-[12px] mt-0.5 ${subtext}`}>{w.desc}</p>
                      <p className={`text-[11px] mt-1 font-medium ${dark ? 'text-violet-300' : 'text-violet-600'}`}>{w.networks}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <a href={w.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-lg ${dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}>
                        Open <ExternalLink size={12} />
                      </a>
                      {w.tutorialId && onOpenTutorial && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTutorial(w.tutorialId, w.name); }}
                          className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-lg ${dark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                          <BookOpen size={12} /> Tutorial
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`text-[12.5px] font-semibold ${subtext}`}>Your wallet address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… or T… or Solana address"
              className={`${inputCls} mt-1.5`} />
          </div>

          {error && <p className="text-red-500 text-[13px] font-medium">{error}</p>}

          <div className="pt-1 pb-2">
            <button type="button" onClick={connect}
              className="w-full py-3 rounded-xl font-bold text-[13.5px] text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90">
              Connect wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ app, session, profile, wallet, onClose, onPaid, onNeedWallet, onOpenTutorials, onOpenTutorial, dark }) {
  const price = parseFloat(app.price) || 0;
  const email = (profile && profile.email) || '';
  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';

  // NexaPay: self-hosted USDT (Polygon) widget + worker
  const widgetSrc = '/nexapay-widget.html?amount=' + encodeURIComponent(price.toFixed(2)) + (email ? ('&email=' + encodeURIComponent(email)) : '');

  useEffect(() => {
    function onMessage(event) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'nexapay:success') {
        const orderId = data.orderId;
        // Reject if paid amount was tampered with (must match developer-set price)
        const paid = parseFloat(data.amount);
        if (isFinite(paid) && Math.abs(paid - price) > 0.02) {
          console.warn('NexaPay amount mismatch — ignoring success', paid, price);
          return;
        }
        markPurchased(app.id, profile && profile.id);
        try {
          if (session && profile) {
            sbInsert('purchases', {
              app_id: app.id,
              user_id: profile.id,
              amount_usdt: price,
              nexapay_order_id: orderId || null,
              wallet_address: (wallet && wallet.address) || null,
              wallet_provider: (wallet && wallet.provider) || 'nexapay',
              status: 'completed',
            }, session).catch(function () {});
          }
        } catch (e) {}
        onPaid && onPaid(app, orderId);
        onClose && onClose();
      }
    }
    window.addEventListener('message', onMessage);
    return function () { window.removeEventListener('message', onMessage); };
  }, [app, session, profile, wallet, price, onPaid, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-3 sm:p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={bg + " rounded-2xl w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2 flex-shrink-0">
          <div className="min-w-0">
            <p className={"font-bold text-[15px] truncate " + text}>Pay for {app.name}</p>
            <p className={"text-[12px] " + subtext}>NexaPay · USDT on Polygon</p>
          </div>
          <button onClick={onClose} className={"p-1.5 rounded-lg flex-shrink-0 " + (dark ? 'hover:bg-white/10' : 'hover:bg-gray-100')}>
            <X size={18} className={text} />
          </button>
        </div>

        <div className={"mx-4 mb-2 rounded-xl px-3 py-2 flex items-center gap-2.5 flex-shrink-0 " + (dark ? 'bg-white/5' : 'bg-gray-50')}>
          {app.logo_url ? (
            <img src={app.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600" />
          )}
          <div className="flex-1 min-w-0">
            <p className={"font-semibold text-[13px] truncate " + text}>{app.name}</p>
            <p className={"text-[11px] " + subtext}>{app.category}</p>
          </div>
          <div className="text-right">
            <p className="font-extrabold text-[15px] text-emerald-500">{price.toFixed(2)}</p>
            <p className={"text-[10px] font-semibold " + subtext}>USDT</p>
          </div>
        </div>

        {(() => {
          const linked = wallet && RECOMMENDED_WALLETS.find(w => w.id === wallet.provider || w.name === wallet.name);
          if (wallet && linked) {
            return (
              <div className={"mx-4 mb-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 flex-shrink-0 border " + (dark ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-50 border-emerald-100')}>
                <Wallet size={16} className="text-emerald-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={"text-[12px] font-semibold " + (dark ? 'text-emerald-300' : 'text-emerald-800')}>{wallet.name} · NexaStore wallet</p>
                  <p className={"text-[11px] truncate " + subtext}>{wallet.address}</p>
                </div>
                <a href={linked.url} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90">
                  Open {wallet.name} <ExternalLink size={12} />
                </a>
              </div>
            );
          }
          if (wallet) {
            return (
              <div className={"mx-4 mb-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 flex-shrink-0 border " + (dark ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-50 border-emerald-100')}>
                <Wallet size={16} className="text-emerald-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={"text-[12px] font-semibold " + (dark ? 'text-emerald-300' : 'text-emerald-800')}>{wallet.name} · NexaStore wallet</p>
                  <p className={"text-[11px] truncate " + subtext}>{wallet.address}</p>
                </div>
              </div>
            );
          }
          return (
            <button type="button" onClick={onNeedWallet}
              className={"mx-4 mb-2 w-auto rounded-xl border-2 border-dashed px-3 py-2.5 text-[12.5px] font-semibold flex items-center justify-center gap-2 " + (dark ? 'border-violet-400/40 text-violet-300 hover:bg-violet-500/10' : 'border-violet-300 text-violet-600 hover:bg-violet-50')}>
              <Wallet size={15} /> Connect NexaStore wallet to open it here
            </button>
          );
        })()}

        <div className="flex-1 min-h-0 px-2 pb-2">
          <iframe
            title="NexaPay"
            src={widgetSrc}
            className="w-full border-0 rounded-xl"
            style={{ height: '520px', maxHeight: '70vh', background: 'transparent' }}
            allow="clipboard-write"
          />
        </div>

        <div className="px-4 pb-3 space-y-2">
          {(wallet?.provider || wallet?.name) && onOpenTutorial && (
            <button type="button"
              onClick={() => {
                const w = RECOMMENDED_WALLETS.find(x => x.id === wallet.provider || x.name === wallet.name);
                onOpenTutorial(w?.tutorialId || null, wallet.name);
              }}
              className={"w-full text-[12px] font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 " + (dark ? 'bg-white/10 text-violet-300' : 'bg-violet-50 text-violet-700')}>
              <BookOpen size={13} /> How to pay with {wallet.name}
            </button>
          )}
          {onOpenTutorials && (
            <button type="button" onClick={onOpenTutorials}
              className={"w-full text-[12px] font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 " + (dark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
              Browse all wallet tutorials
            </button>
          )}
          <p className={"text-[11px] text-center " + subtext}>
            Powered by NexaPay · Send USDT on Polygon to complete payment
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ session, profile, wallet, onConnectWallet, onDisconnectWallet, onOpenAdmin, onOpenDeveloper, onOpenTutorials, onOpenTutorial, onSignOut, onOpenAuth, dark }) {
  const purchases = profile ? (getPurchases()[profile.id] || []) : [];
  const bg = dark ? 'bg-transparent' : 'bg-transparent';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  const card = dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100 shadow-sm';
  const chip = dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700';

  if (!session || !profile) {
    return (
      <div className={`${bg} max-w-2xl mx-auto px-1 py-6`}>
        <div className={`rounded-2xl border p-6 text-center ${card}`}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <User size={26} className="text-white" />
          </div>
          <p className={`font-bold text-[16px] ${text} mb-1`}>Your profile</p>
          <p className={`text-[13px] ${subtext} mb-5`}>Sign in to manage your account, crypto wallet, and purchases.</p>
          <button onClick={onOpenAuth} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px]">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${bg} max-w-2xl mx-auto space-y-5 pb-8`}>
      {/* Account header */}
      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${card}`}>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xl flex-shrink-0">
          {(profile.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-extrabold text-[16px] ${text} truncate`}>{publicDevName(profile) || profile.email?.split('@')[0] || 'User'}</p>
          <p className={`text-[13px] ${subtext} truncate`}>{profile.email}</p>
          {isDeveloperAccount(profile) && (
            <p className={`text-[11.5px] mt-0.5 font-semibold ${dark ? 'text-violet-300' : 'text-violet-600'}`}>Developer · {publicDevName(profile)}</p>
          )}
        </div>
        {profile.is_owner && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-violet-500/15 text-violet-500">Owner</span>
        )}
      </div>

      {/* Crypto account CTA — primary message */}
      <div className={`rounded-2xl border overflow-hidden ${dark ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-teal-600/10' : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50'}`}>
        <div className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Wallet size={20} className="text-white" />
            </div>
            <div>
              <p className={`font-extrabold text-[15px] leading-snug ${dark ? 'text-emerald-200' : 'text-emerald-900'}`}>
                Create a crypto account now if you ever plan to buy anything from NexaStore
              </p>
              <p className={`text-[12.5px] mt-1.5 ${dark ? 'text-emerald-300/80' : 'text-emerald-800/80'}`}>
                NexaStore accepts <span className="font-bold">USDT only</span>. Connect a wallet once — then you can unlock premium apps anytime.
              </p>
            </div>
          </div>

          {wallet ? (
            <div className={`rounded-xl px-3.5 py-3 flex items-center gap-3 mb-3 ${dark ? 'bg-black/20' : 'bg-white/80 border border-emerald-100'}`}>
              <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-bold ${text}`}>{wallet.name} connected</p>
                <p className={`text-[11.5px] truncate ${subtext}`}>{wallet.address}</p>
              </div>
              <button onClick={onDisconnectWallet} className={`text-[12px] font-semibold px-2.5 py-1.5 rounded-lg ${dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={onConnectWallet}
              className="w-full py-3 rounded-xl font-bold text-[14px] text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 flex items-center justify-center gap-2">
              <Wallet size={16} /> Create crypto account
            </button>
          )}
        </div>
      </div>

      {/* Recommended wallets catalog */}
      <div>
        <p className={`text-[12px] font-bold uppercase tracking-wider mb-2.5 ${subtext}`}>Recommended wallets</p>
        <p className={`text-[13px] mb-3 ${subtext}`}>Open one of these to create or manage your USDT wallet, then connect it above.</p>
        <div className="space-y-2">
          {RECOMMENDED_WALLETS.map(w => (
            <div key={w.id} className={`rounded-xl border px-3.5 py-3 flex items-start gap-3 ${card}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${dark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
                <Wallet size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-bold text-[13.5px] ${text}`}>{w.name}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${dark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>Recommended</span>
                </div>
                <p className={`text-[12px] mt-0.5 ${subtext}`}>{w.desc}</p>
                <p className={`text-[11px] mt-1 font-medium ${dark ? 'text-violet-300' : 'text-violet-600'}`}>{w.networks}</p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <a href={w.url} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg ${chip} hover:opacity-80`}>
                  Open <ExternalLink size={12} />
                </a>
                {w.tutorialId && onOpenTutorial && (
                  <button type="button" onClick={() => onOpenTutorial(w.tutorialId, w.name)}
                    className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg ${dark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                    <BookOpen size={12} /> Tutorial
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Purchases summary */}
      <div className={`rounded-2xl border p-5 ${card}`}>
        <p className={`font-bold text-[14px] ${text} mb-1`}>Your purchases</p>
        <p className={`text-[12.5px] ${subtext} mb-3`}>
          {purchases.length === 0
            ? 'No paid apps yet. When you buy with USDT, they’ll show up here.'
            : `${purchases.length} app${purchases.length === 1 ? '' : 's'} unlocked with USDT.`}
        </p>
        {purchases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {purchases.map(id => (
              <span key={id} className={`text-[11px] font-mono px-2 py-1 rounded-md ${chip}`}>{String(id).slice(0, 8)}…</span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {onOpenTutorials && (
          <button onClick={onOpenTutorials}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border ${card} hover:opacity-90`}>
            <span className={`flex items-center gap-3 font-semibold text-[14px] ${text}`}>
              <BookOpen size={18} className="text-violet-500" /> Wallet & USDT tutorials
            </span>
            <ChevronRight size={17} className={subtext} />
          </button>
        )}
        <button onClick={onOpenDeveloper}
          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border ${card} hover:opacity-90`}>
          <span className={`flex items-center gap-3 font-semibold text-[14px] ${text}`}>
            <Code size={18} className="text-violet-500" /> {isDeveloperAccount(profile) ? 'Developer Console' : 'Become a Developer'}
          </span>
          <ChevronRight size={17} className={subtext} />
        </button>
        {profile.is_owner && (
          <button onClick={onOpenAdmin}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border ${card} hover:opacity-90`}>
            <span className={`flex items-center gap-3 font-semibold text-[14px] ${text}`}>
              <ShieldCheck size={18} className="text-violet-500" /> Admin Dashboard
            </span>
            <ChevronRight size={17} className={subtext} />
          </button>
        )}
        <button onClick={onSignOut}
          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border ${dark ? 'border-red-500/30 bg-red-500/10' : 'border-red-100 bg-red-50'} hover:opacity-90`}>
          <span className="flex items-center gap-3 font-semibold text-[14px] text-red-500">
            <LogOut size={18} /> Sign out
          </span>
          <ChevronRight size={17} className="text-red-400" />
        </button>
      </div>
    </div>
  );
}

function DevConsole({ session, profile, onClose, onPublished, dark, showToast, onProfileUpdated }) {
  const [tab, setTab] = useState('overview');
  const [myApps, setMyApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', tagline: '', description: '', category: 'Tools', price: '0', version: '1.0.0', releaseNotes: '' });
  const [appFile, setAppFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingApp, setEditingApp] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', tagline: '', description: '', category: 'Tools', price: '0', version: '1.0.0', releaseNotes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupCompany, setSetupCompany] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState('');
  const hasDevAccount = isDeveloperAccount(profile);

  const set = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });
  const setEdit = (field) => (e) => setEditForm({ ...editForm, [field]: e.target.value });

  const loadMyApps = async () => {
    setAppsLoading(true);
    try {
      const rows = await sbSelect('apps', `dev_id=eq.${profile.id}&select=*&order=created_at.desc`, session);
      setMyApps(rows || []);
    } catch {
      setMyApps([]);
    } finally {
      setAppsLoading(false);
    }
  };

  useEffect(() => {
    if (hasDevAccount) loadMyApps();
    else setAppsLoading(false);
  }, [session, profile?.id, hasDevAccount]);

  const createDevAccount = async (e) => {
    e.preventDefault();
    setSetupError('');
    const name = setupName.trim();
    const company = setupCompany.trim();
    if (!name) {
      setSetupError('Enter the name that will be shown on your apps (company or personal brand).');
      return;
    }
    setSetupBusy(true);
    try {
      const payload = {
        developer_name: name,
        company_name: company || name,
        is_developer: true,
      };
      setLocalDevProfile(profile.id, payload);
      try {
        await sbUpdate('profiles', payload, { id: profile.id }, session);
      } catch {
        // Column may not exist yet on Supabase — local profile still works
      }
      const next = mergeDevProfile({ ...profile, ...payload });
      onProfileUpdated?.(next);
      showToast?.('Developer account created', 'success');
    } catch (err) {
      setSetupError(err.message || 'Could not create developer account.');
    } finally {
      setSetupBusy(false);
    }
  };


  const statusCounts = useMemo(() => {
    const c = { approved: 0, pending: 0, rejected: 0, other: 0 };
    for (const a of myApps) {
      const s = (a.status || 'other').toLowerCase();
      if (s in c) c[s]++; else c.other++;
    }
    return c;
  }, [myApps]);

  const chartData = useMemo(() => [
    { name: 'Live', value: statusCounts.approved, color: '#10b981' },
    { name: 'Pending', value: statusCounts.pending, color: '#f59e0b' },
    { name: 'Rejected', value: statusCounts.rejected, color: '#ef4444' },
    { name: 'Other', value: statusCounts.other, color: '#8b5cf6' },
  ], [statusCounts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim() || !formData.tagline.trim() || !formData.description.trim()) {
      setError('Please fill in name, tagline, and description.');
      return;
    }
    if (!appFile) { setError('An app file is required.'); return; }
    if (!logoFile) { setError('A logo image is required.'); return; }
    if (screenshots.length < 3) { setError('At least 3 screenshots are required.'); return; }

    setLoading(true);
    let appId = null;
    try {
      setStep('Creating listing…');
      const inserted = await sbInsert('apps', {
        name: formData.name.trim(),
        tagline: formData.tagline.trim(),
        description: formData.description.trim(),
        category: formData.category,
        price: parseFloat(formData.price) || 0,
        version: formData.version.trim() || '1.0.0',
        release_notes: formData.releaseNotes.trim(),
        file_name: appFile.name,
        file_type: appFile.type || 'application/octet-stream',
        total_size_bytes: appFile.size,
        status: 'pending',
        dev_id: profile.id,
        developer_name: publicDevName(profile) || null,
      }, session);
      appId = inserted[0].id;

      setStep('Uploading logo…');
      await sbUpload('nexastore-logos', `${appId}/logo.png`, logoFile, session);
      const logoUrl = `${STORAGEAPI}/object/public/nexastore-logos/${appId}/logo.png`;
      await sbUpdate('apps', { logo_url: logoUrl }, { id: appId }, session).catch(() => {});

      setStep('Uploading screenshots…');
      for (let i = 0; i < screenshots.length; i++) {
        await sbUpload('nexastore-screenshots', `${appId}/${i}.png`, screenshots[i], session);
        const ssUrl = `${STORAGEAPI}/object/public/nexastore-screenshots/${appId}/${i}.png`;
        await sbInsert('app_screenshots', { app_id: appId, screenshot_index: i, screenshot_url: ssUrl }, session);
      }

      setStep('Uploading app file…');
      const CHUNK_SIZE = 45 * 1024 * 1024;
      const chunks = [];
      for (let offset = 0; offset < appFile.size; offset += CHUNK_SIZE) {
        chunks.push(appFile.slice(offset, offset + CHUNK_SIZE));
      }
      for (let i = 0; i < chunks.length; i++) {
        await sbUpload('nexastore-bits', `${appId}/${i}.bit`, chunks[i], session);
        await sbInsert('app_bits', { app_id: appId, bit_index: i, bucket_id: 'nexastore-bits', storage_path: `${appId}/${i}.bit`, size_bytes: chunks[i].size }, session);
      }

      setSuccess('Submitted! Your app is pending review before it goes live.');
      setStep('');
      setFormData({ name: '', tagline: '', description: '', category: 'Tools', price: '0', version: '1.0.0', releaseNotes: '' });
      setAppFile(null); setLogoFile(null); setScreenshots([]);
      onPublished?.();
      await loadMyApps();
      setTab('apps');
      showToast?.('App submitted for review', 'success');
    } catch (err) {
      if (appId) {
        await sbDelete('app_bits', { app_id: appId }, session).catch(() => {});
        await sbDelete('app_screenshots', { app_id: appId }, session).catch(() => {});
        await sbDelete('apps', { id: appId }, session).catch(() => {});
      }
      setError(err.message + (appId ? ' — the incomplete listing was removed, please try again.' : ''));
      setStep('');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (app) => {
    setEditingApp(app);
    setEditForm({
      name: app.name || '',
      tagline: app.tagline || '',
      description: app.description || '',
      category: app.category || 'Tools',
      price: String(app.price ?? 0),
      version: app.version || '1.0.0',
      releaseNotes: app.release_notes || '',
    });
  };

  const saveEdit = async () => {
    if (!editingApp) return;
    setEditSaving(true);
    try {
      await sbUpdate('apps', {
        name: editForm.name.trim(),
        tagline: editForm.tagline.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        price: parseFloat(editForm.price) || 0,
        version: editForm.version.trim() || '1.0.0',
        release_notes: editForm.releaseNotes.trim(),
      }, { id: editingApp.id }, session);
      showToast?.('App updated', 'success');
      setEditingApp(null);
      await loadMyApps();
      onPublished?.();
    } catch (e) {
      showToast?.(e.message || 'Update failed', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-400';
  const border = dark ? 'border-white/10' : 'border-gray-100';
  const card = dark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-100';
  const inputCls = `w-full px-4 py-2.5 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500 ${dark ? 'bg-white/5 border border-white/10 text-white placeholder-slate-500' : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'publish', label: 'Publish', icon: Upload },
    { id: 'apps', label: 'My apps', icon: Package },
  ];

  const statusBadge = (status) => {
    const s = (status || '').toLowerCase();
    const cls = s === 'approved' ? 'bg-emerald-500/15 text-emerald-500' : s === 'pending' ? 'bg-amber-500/15 text-amber-500' : s === 'rejected' ? 'bg-red-500/15 text-red-500' : 'bg-gray-500/15 text-gray-400';
    return <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${cls}`}>{status || 'unknown'}</span>;
  };

  if (!hasDevAccount) {
    return (
      <div className={`fixed inset-0 z-50 overflow-auto ${bg}`} style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className={`sticky top-0 ${bg} border-b ${border} px-4 py-3 flex items-center gap-3 z-10`}>
          <button onClick={onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${text}`}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className={`font-bold text-[15px] ${text} leading-tight`}>Create developer account</p>
            <p className={`text-[11.5px] ${subtext}`}>Required before you can publish on NexaStore</p>
          </div>
        </div>
        <div className="max-w-md mx-auto px-4 py-8">
          <div className={`rounded-2xl border p-5 ${card}`}>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4">
              <Code size={22} className="text-white" />
            </div>
            <p className={`font-extrabold text-[16px] ${text} mb-1`}>Become a NexaStore developer</p>
            <p className={`text-[13px] ${subtext} mb-5 leading-relaxed`}>
              Choose the name shoppers will see on your apps — your company name or a public brand name.
            </p>
            <form onSubmit={createDevAccount} className="space-y-3.5">
              <div>
                <label className={`text-[12px] font-semibold ${subtext}`}>Display name (shown publicly) *</label>
                <input
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="e.g. NexaPulse Studio"
                  className={`${inputCls} mt-1.5`}
                  maxLength={80}
                />
              </div>
              <div>
                <label className={`text-[12px] font-semibold ${subtext}`}>Company / organization (optional)</label>
                <input
                  value={setupCompany}
                  onChange={(e) => setSetupCompany(e.target.value)}
                  placeholder="Legal or trading name"
                  className={`${inputCls} mt-1.5`}
                  maxLength={120}
                />
              </div>
              <p className={`text-[12px] ${subtext}`}>
                This name appears under your apps in the store. You can publish, track status, and edit listings after setup.
              </p>
              {setupError && <p className="text-red-500 text-[13px] font-medium">{setupError}</p>}
              <button type="submit" disabled={setupBusy}
                className="w-full py-3 rounded-xl font-bold text-[14px] text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-90 disabled:opacity-50">
                {setupBusy ? 'Creating…' : 'Create developer account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 overflow-auto ${bg}`} style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`sticky top-0 ${bg} border-b ${border} px-4 py-3 flex items-center gap-3 z-10`}>
        <button onClick={onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${text}`}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[15px] ${text} leading-tight`}>Developer Console</p>
          <p className={`text-[11.5px] ${subtext}`}>{publicDevName(profile) || 'Your developer dashboard'} · charts, publish & edit</p>
        </div>
      </div>

      <div className={`sticky top-[57px] z-10 ${bg} border-b ${border} px-4`}>
        <div className="max-w-3xl mx-auto flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === id ? 'border-violet-500 text-violet-500' : `border-transparent ${subtext}`}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total apps', value: myApps.length, color: 'text-violet-500' },
                { label: 'Live', value: statusCounts.approved, color: 'text-emerald-500' },
                { label: 'Pending', value: statusCounts.pending, color: 'text-amber-500' },
                { label: 'Rejected', value: statusCounts.rejected, color: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border p-4 ${card}`}>
                  <p className={`text-[11.5px] font-semibold uppercase tracking-wide ${subtext}`}>{s.label}</p>
                  <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{appsLoading ? '—' : s.value}</p>
                </div>
              ))}
            </div>

            <div className={`rounded-2xl border p-4 ${card}`}>
              <p className={`font-bold text-[14px] ${text} mb-3`}>Apps by status</p>
              {appsLoading ? (
                <p className={`text-[13px] ${subtext} py-10 text-center`}>Loading chart…</p>
              ) : myApps.length === 0 ? (
                <div className="text-center py-10">
                  <p className={`text-[13px] ${subtext} mb-3`}>No apps yet — publish your first one.</p>
                  <button onClick={() => setTab('publish')} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-xl font-semibold text-[13px]">Publish an app</button>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={dark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'} />
                      <XAxis dataKey="name" tick={{ fill: dark ? '#94a3b8' : '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: dark ? '#94a3b8' : '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: 'none', background: dark ? '#12172f' : '#fff', color: dark ? '#fff' : '#111' }} />
                      <Bar dataKey="value" radius={[8, 8, 4, 4]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <button onClick={() => setTab('publish')} className="w-full py-3 rounded-xl font-bold text-[14px] text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-90 flex items-center justify-center gap-2">
              <Upload size={16} /> Publish a new app
            </button>
          </div>
        )}

        {tab === 'publish' && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <input type="text" placeholder="App name" value={formData.name} onChange={set('name')} className={inputCls} />
            <input type="text" placeholder="Tagline (short, one line)" value={formData.tagline} onChange={set('tagline')} className={inputCls} />
            <textarea placeholder="Description" value={formData.description} onChange={set('description')} className={`${inputCls} h-24 resize-none`} />

            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              <select value={formData.category} onChange={set('category')} className={inputCls}>
                {Object.keys(categoryIconMap).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="relative">
                <input type="number" min="0" step="0.01" placeholder="0.00 = free" value={formData.price} onChange={set('price')} className={`${inputCls} pr-14`} />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold ${dark ? 'text-emerald-400' : 'text-emerald-600'}`}>USDT</span>
              </div>
            </div>
            <p className={`text-[11.5px] -mt-1 ${subtext}`}>Set a USDT price to enable a paywall. Buyers pay once, then can install forever.</p>

            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              <input type="text" placeholder="Version (e.g. 1.0.0)" value={formData.version} onChange={set('version')} className={inputCls} />
              <input type="text" placeholder="Release notes" value={formData.releaseNotes} onChange={set('releaseNotes')} className={inputCls} />
            </div>

            <FileDropField label="App file" hint="APK, ZIP, or EXE" icon={FileArchive} accept=".apk,.zip,.exe,.aab,.dmg" onChange={(e) => setAppFile(e.target.files?.[0] || null)} files={appFile} dark={dark} />
            <FileDropField label="Logo" hint="Square image, PNG or JPG" icon={ImageIcon} accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} files={logoFile} dark={dark} />
            <FileDropField label="Screenshots" hint="At least 3 images" icon={ImageIcon} accept="image/*" multiple onChange={(e) => setScreenshots(Array.from(e.target.files || []))} files={screenshots} dark={dark} />

            {error && <p className="text-red-500 text-[13px] font-medium">{error}</p>}
            {success && <p className="text-emerald-500 text-[13px] font-medium">{success}</p>}
            {step && !error && <p className="text-violet-500 text-[13px] font-medium">{step}</p>}

            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 text-[14px]">
              {loading ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}

        {tab === 'apps' && (
          <div className="space-y-3">
            {appsLoading && <p className={`text-center py-10 text-[13px] ${subtext}`}>Loading your apps…</p>}
            {!appsLoading && myApps.length === 0 && (
              <div className={`rounded-2xl border p-8 text-center ${card}`}>
                <p className={`font-bold ${text} mb-1`}>No published apps yet</p>
                <p className={`text-[13px] ${subtext} mb-4`}>Upload your first app from the Publish tab.</p>
                <button onClick={() => setTab('publish')} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-xl font-semibold text-[13px]">Go to Publish</button>
              </div>
            )}
            {myApps.map(app => (
              <div key={app.id} className={`rounded-2xl border p-4 ${card}`}>
                {editingApp?.id === app.id ? (
                  <div className="space-y-2.5">
                    <input className={inputCls} value={editForm.name} onChange={setEdit('name')} placeholder="Name" />
                    <input className={inputCls} value={editForm.tagline} onChange={setEdit('tagline')} placeholder="Tagline" />
                    <textarea className={`${inputCls} h-20 resize-none`} value={editForm.description} onChange={setEdit('description')} placeholder="Description" />
                    <div className="grid grid-cols-2 gap-2">
                      <select className={inputCls} value={editForm.category} onChange={setEdit('category')}>
                        {Object.keys(categoryIconMap).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="relative">
                        <input type="number" min="0" step="0.01" className={`${inputCls} pr-14`} value={editForm.price} onChange={setEdit('price')} />
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold ${dark ? 'text-emerald-400' : 'text-emerald-600'}`}>USDT</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inputCls} value={editForm.version} onChange={setEdit('version')} placeholder="Version" />
                      <input className={inputCls} value={editForm.releaseNotes} onChange={setEdit('releaseNotes')} placeholder="Release notes" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setEditingApp(null)} className={`flex-1 py-2.5 rounded-xl font-semibold text-[13px] ${dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}>Cancel</button>
                      <button type="button" onClick={saveEdit} disabled={editSaving} className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50">{editSaving ? 'Saving…' : 'Save changes'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {app.logo_url ? (
                      <img src={app.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-bold text-[14px] truncate ${text}`}>{app.name}</p>
                        {statusBadge(app.status)}
                      </div>
                      <p className={`text-[12px] ${subtext} truncate`}>{app.tagline || app.category}</p>
                      <p className={`text-[12px] mt-0.5 font-semibold ${(parseFloat(app.price) || 0) > 0 ? 'text-emerald-500' : subtext}`}>
                        {formatPrice(app.price)} · v{app.version || '1.0.0'}
                      </p>
                    </div>
                    <button type="button" onClick={() => startEdit(app)} className={`p-2 rounded-lg flex-shrink-0 ${dark ? 'hover:bg-white/10 text-white' : 'hover:bg-gray-100 text-gray-700'}`} title="Edit">
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-stretch px-4 w-full max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`pointer-events-auto rounded-xl px-4 py-3 shadow-lg flex items-start gap-2.5 text-[13.5px] font-medium ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white'}`} style={{ fontFamily: "'Inter', sans-serif" }}>
          {t.type === 'error' && <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
          {t.type === 'success' && <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="flex-shrink-0 opacity-80 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, dark }) {
  const bg = dark ? 'bg-[#12172f]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  return (
    <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`${bg} rounded-2xl p-5 w-full max-w-sm`}>
        <p className={`font-bold text-[15px] ${text} mb-1.5`}>{title}</p>
        <p className={`text-[13px] ${subtext} mb-5`}>{message}</p>
        <div className="flex gap-2.5">
          <button onClick={onCancel} className={`flex-1 py-2.5 rounded-xl font-semibold text-[13.5px] ${dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-colors`}>
            Cancel
          </button>
          <button onClick={onConfirm} className={`flex-1 py-2.5 rounded-xl font-semibold text-[13.5px] text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StarPicker({ value, onChange, size = 22 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Star size={size} className={n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
        </button>
      ))}
    </div>
  );
}

function AdminDashboard({ session, profile, onClose, dark, showToast }) {
  const [allApps, setAllApps] = useState([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const apps = await sbSelect('apps', 'select=*&order=created_at.desc', session);
      setAllApps(apps || []);
    } catch (e) {
      setError('Could not load apps — ' + e.message);
    }
    try {
      const reviews = await sbSelect('app_reviews', 'select=id', session).catch(() => []);
      setTotalReviews((reviews || []).length);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleApprove = async (app) => {
    setBusyId(app.id);
    setError('');
    try {
      await sbUpdate('apps', { status: 'approved' }, { id: app.id }, session);
      await loadData();
      showToast?.(`${app.name} approved`, 'success');
    } catch (e) {
      setError('Approve failed — ' + e.message);
      showToast?.('Approve failed — ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const app = pendingDelete;
    setPendingDelete(null);
    if (!app) return;
    setBusyId(app.id);
    setError('');
    try {
      await sbDelete('app_reviews', { app_id: app.id }, session).catch(() => {});
      await sbDelete('wishlists', { app_id: app.id }, session).catch(() => {});
      await sbDelete('app_screenshots', { app_id: app.id }, session).catch(() => {});
      await sbDelete('app_bits', { app_id: app.id }, session).catch(() => {});
      await sbDelete('apps', { id: app.id }, session);
      await loadData();
      showToast?.(`${app.name} deleted`, 'success');
    } catch (e) {
      setError('Delete failed — ' + e.message);
      showToast?.('Delete failed — ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = allApps.filter(a => a.status === 'pending');
  const approved = allApps.filter(a => a.status === 'approved');

  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  const border = dark ? 'border-white/10' : 'border-gray-100';
  const card = dark ? 'bg-white/5' : 'bg-gray-50';
  const hoverBtn = dark ? 'hover:bg-white/10' : 'hover:bg-gray-100';

  return (
    <div className={`fixed inset-0 z-50 overflow-auto ${bg}`} style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`sticky top-0 ${bg} border-b ${border} px-4 py-3 flex items-center gap-3 z-10`}>
        <button onClick={onClose} className={`p-2 -ml-2 rounded-lg ${hoverBtn} ${text}`}>
          <ArrowLeft size={20} />
        </button>
        <p className={`font-bold text-[15px] ${text}`}>Admin Dashboard</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        {error && <p className="text-red-500 text-[13px] font-medium mb-4">{error}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className={`rounded-2xl p-4 ${card}`}>
            <p className={`text-2xl font-extrabold ${text}`}>{allApps.length}</p>
            <p className={`text-[12px] ${subtext}`}>Total Apps</p>
          </div>
          <div className={`rounded-2xl p-4 ${card}`}>
            <p className="text-2xl font-extrabold text-amber-500">{pending.length}</p>
            <p className={`text-[12px] ${subtext}`}>Pending Review</p>
          </div>
          <div className={`rounded-2xl p-4 ${card}`}>
            <p className="text-2xl font-extrabold text-emerald-500">{approved.length}</p>
            <p className={`text-[12px] ${subtext}`}>Approved</p>
          </div>
          <div className={`rounded-2xl p-4 ${card}`}>
            <p className={`text-2xl font-extrabold ${text}`}>{totalReviews}</p>
            <p className={`text-[12px] ${subtext}`}>Total Reviews</p>
          </div>
        </div>

        {loading && <p className={`text-[13px] ${subtext}`}>Loading…</p>}

        {!loading && (
          <div className="mb-9">
            <h2 className={`font-bold text-[15px] ${text} mb-3`}>Pending Review ({pending.length})</h2>
            {pending.length === 0 && <p className={`text-[13px] ${subtext}`}>Nothing waiting on review.</p>}
            <div className="space-y-2">
              {pending.map(app => (
                <div key={app.id} className={`flex items-center gap-3 p-3 rounded-xl ${card}`}>
                  <SmallAppBadge app={app} size="w-11 h-11" themeClass={smallIconThemes[0]} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-[13.5px] ${text} truncate`}>{app.name}</p>
                    <p className={`text-[12px] ${subtext} truncate`}>{app.category} · v{app.version || '1.0.0'}</p>
                  </div>
                  <button disabled={busyId === app.id} onClick={() => handleApprove(app)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold text-[12.5px] disabled:opacity-50 hover:bg-emerald-700 transition-colors">
                    {busyId === app.id ? '…' : 'Approve'}
                  </button>
                  <button disabled={busyId === app.id} onClick={() => setPendingDelete(app)} className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold text-[12.5px] disabled:opacity-50 hover:bg-red-700 transition-colors">
                    Reject
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && (
          <div>
            <h2 className={`font-bold text-[15px] ${text} mb-3`}>All Apps ({allApps.length})</h2>
            {allApps.length === 0 && <p className={`text-[13px] ${subtext}`}>No apps yet.</p>}
            <div className="space-y-2">
              {allApps.map((app, i) => (
                <div key={app.id} className={`flex items-center gap-3 p-3 rounded-xl ${card}`}>
                  <SmallAppBadge app={app} size="w-10 h-10" themeClass={smallIconThemes[(i + 1) % smallIconThemes.length]} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-[13.5px] ${text} truncate`}>{app.name}</p>
                    <p className={`text-[12px] ${subtext} truncate`}>{app.category}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0 ${app.status === 'approved' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                    {app.status}
                  </span>
                  <button disabled={busyId === app.id} onClick={() => setPendingDelete(app)} className={`p-2 rounded-lg ${hoverBtn} text-red-500 flex-shrink-0`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.name}"?`}
          message="This permanently removes the app, its screenshots, reviews, and file. This can't be undone."
          confirmLabel="Delete"
          danger
          dark={dark}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function AppDetailModal({ app, session, profile, onClose, onInstall, onOpenAuth, dark, installState, showToast, owned }) {
  const [screenshots, setScreenshots] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [devName, setDevName] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [myReviewText, setMyReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistId, setWishlistId] = useState(null);
  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingDetail(true);
      try {
        const ss = await sbSelect('app_screenshots', `app_id=eq.${app.id}&order=screenshot_index`).catch(() => []);
        if (!cancelled) setScreenshots(ss || []);
      } catch {}
      try {
        const rv = await sbSelect('app_reviews', `app_id=eq.${app.id}&order=created_at.desc`).catch(() => []);
        if (!cancelled) setReviews(rv || []);
      } catch {}
      if (app.dev_id) {
        try {
          const profs = await sbSelect('profiles', `id=eq.${app.dev_id}&select=email,developer_name,company_name`).catch(() => []);
          if (!cancelled && profs?.[0]) {
            const nm = profs[0].developer_name || profs[0].company_name || (profs[0].email ? profs[0].email.split('@')[0] : '');
            if (nm) setDevName(nm);
            else {
              const local = getLocalDevProfile(app.dev_id);
              if (local?.developer_name) setDevName(local.developer_name);
            }
          }
        } catch {}
      }
      if (session && profile) {
        try {
          const w = await sbSelect('wishlists', `app_id=eq.${app.id}&user_id=eq.${profile.id}`, session).catch(() => []);
          if (!cancelled && w?.[0]) { setInWishlist(true); setWishlistId(w[0].id); }
        } catch {}
      }
      if (!cancelled) setLoadingDetail(false);
    }
    load();
    return () => { cancelled = true; };
  }, [app.id, session, profile]);

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const distribution = [5, 4, 3, 2, 1].map(star => reviews.filter(r => r.rating === star).length);
  const maxDist = Math.max(1, ...distribution);
  const myExistingReview = profile ? reviews.find(r => r.user_id === profile.id) : null;

  const handleSubmitReview = async () => {
    if (!myRating) { setReviewError('Pick a star rating first.'); return; }
    setSubmittingReview(true);
    setReviewError('');
    try {
      await sbInsert('app_reviews', { app_id: app.id, user_id: profile.id, rating: myRating, review_text: myReviewText.trim() || null }, session);
      const rv = await sbSelect('app_reviews', `app_id=eq.${app.id}&order=created_at.desc`);
      setReviews(rv || []);
      setMyRating(0);
      setMyReviewText('');
    } catch (e) {
      setReviewError(e.message.toLowerCase().includes('duplicate') ? "You've already reviewed this app." : e.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleWishlist = async () => {
    if (!session) { onOpenAuth(); return; }
    try {
      if (inWishlist && wishlistId) {
        await sbDelete('wishlists', { id: wishlistId }, session);
        setInWishlist(false);
        setWishlistId(null);
      } else {
        const inserted = await sbInsert('wishlists', { app_id: app.id, user_id: profile.id }, session);
        setInWishlist(true);
        setWishlistId(inserted[0].id);
      }
    } catch (e) {
      showToast?.("Couldn't update your wishlist — please try again.", 'error');
    }
  };

  const handleShare = async () => {
    const shareData = { title: app.name, text: app.tagline, url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setShareLabel('Copied!');
        setTimeout(() => setShareLabel('Share'), 1500);
      } catch {}
    }
  };

  const Icon = categoryIconMap[app.category] || Package;
  const theme = cardThemes[0];
  const sizeMB = app.total_size_bytes ? (app.total_size_bytes / 1024 / 1024).toFixed(1) : null;
  const isInstalling = installState?.appId === app.id;
  const installPct = isInstalling ? Math.round((installState.progress || 0) * 100) : 0;

  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const subtext = dark ? 'text-slate-400' : 'text-gray-500';
  const card = dark ? 'bg-white/5' : 'bg-gray-50';
  const border = dark ? 'border-white/10' : 'border-gray-100';
  const chipBg = dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700';
  const divider = dark ? 'bg-white/10' : 'bg-gray-200';

  return (
    <div className={`fixed inset-0 z-50 overflow-auto ${bg}`} style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`sticky top-0 ${bg} border-b ${border} px-4 py-3 flex items-center gap-3 z-10`}>
        <button onClick={onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${text}`}>
          <ArrowLeft size={20} />
        </button>
        <span className={`font-bold text-[15px] ${text} truncate`}>{app.name}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-24 h-24 rounded-3xl overflow-hidden flex-shrink-0 shadow-sm">
            {app.logo_url ? (
              <img src={app.logo_url} alt={app.name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${theme.grad} flex items-center justify-center`}>
                <Icon size={36} className="text-white" strokeWidth={2} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h1 className={`text-2xl font-extrabold ${text} leading-tight mb-1`}>{app.name}</h1>
            {devName && <p className="text-violet-500 font-semibold text-[13.5px] mb-1">{devName}</p>}
            {app.tagline && <p className={`text-[13px] ${subtext}`}>{app.tagline}</p>}
          </div>
        </div>

        <div className="flex items-center gap-6 mb-5 flex-wrap">
          <div>
            <p className={`font-bold text-[15px] ${text} flex items-center gap-1`}>
              {avgRating ? avgRating.toFixed(1) : 'New'} {avgRating && <Star size={13} className="fill-yellow-400 text-yellow-400" />}
            </p>
            <p className={`text-[11.5px] ${subtext}`}>{reviews.length ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''}` : 'No reviews yet'}</p>
          </div>
          <div className={`w-px h-8 ${divider}`} />
          <div>
            <p className={`font-bold text-[15px] ${text}`}>{app.category}</p>
            <p className={`text-[11.5px] ${subtext}`}>Category</p>
          </div>
          {sizeMB && (
            <>
              <div className={`w-px h-8 ${divider}`} />
              <div>
                <p className={`font-bold text-[15px] ${text}`}>{sizeMB} MB</p>
                <p className={`text-[11.5px] ${subtext}`}>Size</p>
              </div>
            </>
          )}
          <>
            <div className={`w-px h-8 ${divider}`} />
            <div>
              <p className={`font-bold text-[15px] ${(parseFloat(app.price) || 0) > 0 ? 'text-emerald-500' : text}`}>
                {formatPrice(app.price)}
              </p>
              <p className={`text-[11.5px] ${subtext}`}>Price</p>
            </div>
          </>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => !isInstalling && onInstall(app)} disabled={isInstalling}
            className={`relative flex-1 overflow-hidden text-white py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity ${
              (parseFloat(app.price) || 0) > 0 && !owned
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                : 'bg-gradient-to-r from-blue-600 to-violet-600'
            }`}>
            {isInstalling && <div className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-150" style={{ width: `${installPct}%` }} />}
            <span className="relative flex items-center gap-2">
              {isInstalling
                ? <><Loader2 size={16} className="animate-spin" /> {installPct}%</>
                : (parseFloat(app.price) || 0) > 0 && !owned
                  ? <><Lock size={16} /> Buy · {formatPrice(app.price)}</>
                  : <><Download size={17} strokeWidth={2.3} /> Install</>}
            </span>
          </button>
          <button onClick={handleShare} className={`px-4 py-3 rounded-xl font-semibold text-[13px] flex items-center gap-1.5 ${chipBg} hover:opacity-80 transition-opacity`}>
            <Share2 size={16} strokeWidth={2.2} /> {shareLabel}
          </button>
          <button onClick={handleWishlist} className={`px-4 py-3 rounded-xl font-semibold text-[13px] flex items-center gap-1.5 transition-colors ${inWishlist ? 'bg-pink-500 text-white' : chipBg}`}>
            <Heart size={16} strokeWidth={2.2} className={inWishlist ? 'fill-white' : ''} /> {inWishlist ? 'Saved' : 'Save'}
          </button>
        </div>

        {(app.version || app.release_notes) && (
          <p className={`text-[12px] ${subtext} mt-3 mb-6`}>
            {app.version && `Version ${app.version}`}{app.version && app.release_notes ? ' — ' : ''}{app.release_notes}
          </p>
        )}

        {screenshots.length > 0 && (
          <div className="mb-8 -mx-4 md:mx-0">
            <div className="flex gap-3 overflow-x-auto px-4 md:px-0 pb-2">
              {screenshots.map((ss, i) => (
                <img key={i} src={ss.screenshot_url} alt="" className="max-h-60 max-w-none w-auto h-auto rounded-2xl flex-shrink-0" />
              ))}
            </div>
          </div>
        )}

        {app.description && (
          <div className="mb-8">
            <h2 className={`font-bold text-[15px] ${text} mb-2`}>About this app</h2>
            <p className={`text-[13.5px] leading-relaxed whitespace-pre-line ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{app.description}</p>
          </div>
        )}

        <div className="mb-8">
          <h2 className={`font-bold text-[15px] ${text} mb-4`}>Ratings and reviews</h2>

          <div className="flex items-start gap-8 mb-6 flex-wrap">
            <div className="text-center">
              <p className={`text-5xl font-bold ${text}`}>{avgRating ? avgRating.toFixed(1) : '—'}</p>
              <div className="flex gap-0.5 justify-center my-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} size={14} className={avgRating && n <= Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : (dark ? 'text-white/20' : 'text-gray-200')} />
                ))}
              </div>
              <p className={`text-[12px] ${subtext}`}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex-1 min-w-[180px] space-y-1.5 pt-1.5">
              {[5, 4, 3, 2, 1].map((star, idx) => (
                <div key={star} className="flex items-center gap-2">
                  <span className={`text-[11px] w-2.5 ${subtext}`}>{star}</span>
                  <div className={`flex-1 h-1.5 rounded-full ${dark ? 'bg-white/10' : 'bg-gray-100'} overflow-hidden`}>
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(distribution[idx] / maxDist) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {session && profile && !myExistingReview && (
            <div className={`rounded-2xl p-4 mb-5 ${card}`}>
              <p className={`font-semibold text-[13.5px] ${text} mb-2.5`}>Rate this app</p>
              <div className="mb-3"><StarPicker value={myRating} onChange={setMyRating} /></div>
              <textarea value={myReviewText} onChange={(e) => setMyReviewText(e.target.value)} placeholder="Share your thoughts (optional)"
                className={`w-full px-3 py-2 rounded-xl text-[13px] h-16 resize-none mb-2.5 focus:outline-none ${dark ? 'bg-white/10 text-white placeholder-slate-500' : 'bg-white border border-gray-200 text-gray-800'}`} />
              {reviewError && <p className="text-red-500 text-[12px] mb-2">{reviewError}</p>}
              <button onClick={handleSubmitReview} disabled={submittingReview} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-xl font-semibold text-[13px] disabled:opacity-50">
                {submittingReview ? 'Posting…' : 'Post review'}
              </button>
            </div>
          )}
          {!session && (
            <button onClick={onOpenAuth} className="text-[13px] font-semibold text-violet-500 mb-5">Sign in to leave a review</button>
          )}
          {myExistingReview && (
            <p className={`text-[12.5px] ${subtext} mb-5`}>You've already reviewed this app.</p>
          )}

          <div className="space-y-4">
            {!loadingDetail && reviews.length === 0 && <p className={`text-[13px] ${subtext}`}>No reviews yet — be the first!</p>}
            {reviews.map((r) => (
              <div key={r.id} className={`pb-4 border-b ${border}`}>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-white" strokeWidth={2.3} />
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star key={n} size={11} className={n <= r.rating ? 'fill-yellow-400 text-yellow-400' : (dark ? 'text-white/15' : 'text-gray-200')} />
                      ))}
                    </div>
                  </div>
                  <span className={`text-[11px] ${subtext}`}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.review_text && <p className={`text-[13px] ${dark ? 'text-slate-300' : 'text-gray-600'} ml-10`}>{r.review_text}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app, index, onOpen, onInstall, installState, owned, dark }) {
  const fallbackTheme = cardThemes[index % cardThemes.length];
  const Icon = categoryIconMap[app.category] || Package;
  const installing = installState?.appId === app.id;
  const pct = installing ? Math.round((installState.progress || 0) * 100) : 0;
  const price = parseFloat(app.price) || 0;
  const isPaid = price > 0;
  const unlocked = !isPaid || owned;
  const rating = app.rating || app.avg_rating || null;
  const developerName = app.developer_name || app.company_name || app.dev_name || null;

  const titleCls = dark ? 'text-white' : 'text-gray-900';
  const subCls = dark ? 'text-slate-400' : 'text-gray-500';
  const ratingCls = dark ? 'text-slate-300' : 'text-gray-700';

  const btnLabel = installing
    ? <><Loader2 size={12} className="animate-spin" /> {pct}%</>
    : unlocked
      ? 'Install'
      : <><Lock size={11} /> {price.toFixed(2)}</>;

  return (
    <div className="flex flex-col items-stretch group">
      <button type="button" onClick={() => onOpen(app)} className="text-left flex flex-col items-stretch">
        {/* Square logo — Play Store style */}
        <div className={`w-full aspect-square max-w-[120px] mx-auto rounded-[22%] overflow-hidden shadow-sm bg-gradient-to-br ${fallbackTheme.grad} flex items-center justify-center`}>
          {app.logo_url ? (
            <img src={app.logo_url} alt={app.name} className="w-full h-full object-cover" />
          ) : (
            <Icon size={36} className="text-white" strokeWidth={2} />
          )}
        </div>
        <div className="mt-2.5 px-0.5 min-w-0">
          <h3 className={`font-medium text-[13px] sm:text-[13.5px] leading-snug line-clamp-2 ${titleCls}`}>{app.name}</h3>
          {developerName && (
            <p className={`text-[11.5px] mt-0.5 truncate ${subCls}`}>{developerName}</p>
          )}
          <div className={`flex items-center gap-1 mt-1 text-[11.5px] ${ratingCls}`}>
            {rating ? (
              <>
                <span className="font-medium tabular-nums">{Number(rating).toFixed(1)}</span>
                <Star size={11} className="fill-gray-500 text-gray-500" style={dark ? { fill: '#94a3b8', color: '#94a3b8' } : undefined} />
              </>
            ) : (
              <span className={subCls}>New</span>
            )}
            {isPaid && (
              <span className={`ml-1 font-semibold ${dark ? 'text-emerald-400' : 'text-emerald-600'}`}>{price.toFixed(2)} USDT</span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => !installing && onInstall(app)}
        disabled={installing}
        className={`relative mt-2.5 w-full overflow-hidden py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
          dark
            ? 'bg-white/10 text-white hover:bg-white/15'
            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
        }`}
      >
        {installing && <div className="absolute inset-y-0 left-0 bg-violet-500/30 transition-all duration-150" style={{ width: `${pct}%` }} />}
        <span className="relative flex items-center justify-center gap-1">{btnLabel}</span>
      </button>
    </div>
  );
}

function SmallAppBadge({ app, size, themeClass }) {
  const Icon = categoryIconMap[app.category] || Package;
  if (app.logo_url) {
    return (
      <div className={`${size} rounded-xl overflow-hidden flex-shrink-0 bg-white`}>
        <img src={app.logo_url} alt={app.name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${size} rounded-xl ${themeClass} flex items-center justify-center flex-shrink-0`}>
      <Icon size={16} className="text-white" strokeWidth={2.2} />
    </div>
  );
}

function StarRating({ value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Star size={13} className="fill-yellow-400 text-yellow-400" />
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function EmptyLibraryState({ view, session, onOpenAuth, onOpenDeveloper, dark }) {
  const map = {
    myapps: { icon: Gamepad2, title: 'No apps published yet', body: 'Apps you publish will show up here once approved.', cta: 'Publish an app' },
    installed: { icon: CheckSquare, title: 'Nothing installed yet', body: 'Apps you install from NexaStore will appear here.' },
    downloads: { icon: Download, title: 'No downloads yet', body: 'Your download history will show up here.' },
    wishlist: { icon: Heart, title: 'Your wishlist is empty', body: 'Save apps you want to try later.' },
    library: { icon: Package, title: 'Nothing here yet', body: '' },
  };
  const copy = map[view] || map.library;
  const Icon = copy.icon;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
        <Icon size={28} className={dark ? 'text-slate-400' : 'text-gray-400'} strokeWidth={2} />
      </div>
      <p className={`font-bold mb-1 ${dark ? 'text-white' : 'text-gray-900'}`}>{copy.title}</p>
      <p className={`text-[13px] max-w-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{copy.body}</p>
      {!session ? (
        <button onClick={onOpenAuth} className="mt-5 bg-gradient-to-r from-blue-600 to-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px]">
          Sign in
        </button>
      ) : copy.cta ? (
        <button onClick={onOpenDeveloper} className="mt-5 bg-gradient-to-r from-blue-600 to-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px]">
          {copy.cta}
        </button>
      ) : null}
    </div>
  );
}

/* ============================================
   DESKTOP — light theme (md and up)
   ============================================ */
function DesktopSidebar({ view, setView }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'categories', label: 'Categories', icon: Grid },
    { id: 'charts', label: 'Top Charts', icon: TrendingUp },
    { id: 'updates', label: 'Updates', icon: Bell },
  ];
  const libraryItems = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'myapps', label: 'My Apps', icon: Gamepad2 },
    { id: 'installed', label: 'Installed', icon: CheckSquare },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'wishlist', label: 'Wishlist', icon: Heart },
  ];

  return (
    <aside className="w-[272px] bg-white border-r border-gray-100 h-screen sticky top-0 flex flex-col">
      <div className="px-6 pt-6 pb-5 flex items-center gap-2.5">
        <NexaLogo size={38} />
        <span className="text-[19px] font-extrabold text-gray-900 tracking-tight">NexaStore</span>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-auto">
        {navItems.map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => setView(id)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${view === id ? 'bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-[0_4px_14px_rgba(99,102,241,0.35)]' : 'text-gray-600 hover:bg-gray-50 font-medium'}`}>
            <span className="flex items-center gap-3 text-[15px]">
              <Icon size={19} strokeWidth={2.2} />
              {label}
            </span>
            {badge && <span className="bg-pink-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{badge}</span>}
          </button>
        ))}
        <div className="pt-5 mt-5 border-t border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 px-4 mb-2 tracking-wider">LIBRARY</p>
          {libraryItems.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-[15px] ${view === id ? 'bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-[0_4px_14px_rgba(99,102,241,0.35)]' : 'text-gray-600 hover:bg-gray-50 font-medium'}`}>
              <Icon size={19} strokeWidth={2.2} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="p-4">
        <div className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2.5">
            <Crown size={17} className="fill-yellow-300 text-yellow-300" strokeWidth={2} />
            <span className="font-bold text-[13px]">NexaStore</span>
            <span className="bg-white/25 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide">PREMIUM</span>
          </div>
          <p className="text-[12.5px] text-white/90 mb-4 leading-snug">Go premium and unlock exclusive perks.</p>
          <button className="w-full bg-white text-violet-700 font-bold py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-[13.5px] flex items-center justify-center gap-1">
            Upgrade Now <ChevronRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function DesktopRightSidebar({ topApps, latestApps, onOpenConsole }) {
  const [activeTab, setActiveTab] = useState('Apps');
  return (
    <aside className="hidden lg:flex flex-col w-[320px] bg-white border-l border-gray-100 p-6 gap-7 h-screen overflow-auto sticky top-0">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-extrabold text-gray-900">Top Charts</h3>
          <button className="text-blue-600 text-[13px] font-semibold hover:text-blue-700">View all</button>
        </div>
        <div className="flex gap-5 mb-4 border-b border-gray-100">
          {['Apps', 'Games', 'Tools'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-2.5 text-[13.5px] font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="space-y-3.5">
          {topApps.slice(0, 5).map((app, i) => {
            return (
              <div key={app.id} onClick={() => onOpenApp(app)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                <span className="text-[13px] font-bold text-gray-300 w-4">{i + 1}</span>
                <SmallAppBadge app={app} size="w-10 h-10" themeClass={smallIconThemes[i % smallIconThemes.length]} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13.5px] text-gray-900 truncate leading-tight">{app.name}</p>
                  <p className="text-[12px] text-gray-400 truncate">{app.category}</p>
                </div>
                <StarRating value={app.rating} />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-[17px] font-extrabold text-gray-900">Latest Updates</h3>
          <button className="text-blue-600 text-[13px] font-semibold hover:text-blue-700">View all</button>
        </div>
        <div className="space-y-3.5">
          {latestApps.slice(0, 4).map((app, i) => {
            return (
              <div key={app.id} onClick={() => onOpenApp(app)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                <SmallAppBadge app={app} size="w-9 h-9" themeClass={smallIconThemes[(i + 2) % smallIconThemes.length]} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13.5px] text-gray-900 truncate leading-tight">{app.name}</p>
                  <p className="text-[12px] text-gray-400">Version {app.version || '1.0.0'}</p>
                </div>
                <button onClick={(e) => e.stopPropagation()} className="text-blue-600 font-bold text-[13px] hover:text-blue-700">Update</button>
              </div>
            );
          })}
        </div>
      </div>

    </aside>
  );
}

function DesktopApp({ view, setView, session, profile, filteredApps, search, setSearch, loading, handleInstall, categories, onOpenAuth, onSignOut, onOpenDeveloper, onOpenApp, onOpenAdmin, installState, isOwned, wallet, onConnectWallet, onDisconnectWallet, onOpenTutorials, onOpenTutorial }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [wishlistApps, setWishlistApps] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const libraryViews = ['myapps', 'installed', 'downloads', 'wishlist'];
  const viewTitles = { discover: 'Discover', charts: 'Top Charts', categories: 'Categories', updates: 'Updates', profile: 'Profile' };

  useEffect(() => {
    if (view !== 'wishlist' || !session || !profile) return;
    let cancelled = false;
    setWishlistLoading(true);
    sbSelect('wishlists', `user_id=eq.${profile.id}&select=id,apps(*)`, session)
      .then(rows => { if (!cancelled) setWishlistApps((rows || []).map(r => r.apps).filter(Boolean)); })
      .catch(() => { if (!cancelled) setWishlistApps([]); })
      .finally(() => { if (!cancelled) setWishlistLoading(false); });
    return () => { cancelled = true; };
  }, [view, session, profile]);

  return (
    <div className="hidden md:flex min-h-screen bg-white w-full">
      <DesktopSidebar view={view} setView={setView} />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
          <div className="px-8 py-4 flex items-center gap-6">
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for apps, games, tools and more..."
                  className="w-full bg-gray-100 pl-5 pr-11 py-3 rounded-full text-[14px] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800" />
                <Search size={18} strokeWidth={2.3} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Download size={20} strokeWidth={2.1} />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} strokeWidth={2.1} />
              </button>
              {session && profile ? (
                <div className="relative">
                  <button onClick={() => setShowProfileMenu(v => !v)} className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {profile.email.charAt(0).toUpperCase()}
                  </button>
                  {showProfileMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-lg p-3 z-30">
                      <p className="text-[13px] text-gray-500 px-2 pb-2 truncate">{profile.email}</p>
                      <button onClick={() => { setView('profile'); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13.5px] font-semibold text-gray-800 flex items-center gap-2">
                        <User size={15} /> Profile
                      </button>
                      {profile.is_owner && (
                        <button onClick={() => { onOpenAdmin(); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13.5px] font-semibold text-violet-600 flex items-center gap-2">
                          <ShieldCheck size={15} /> Admin Dashboard
                        </button>
                      )}
                      <button onClick={() => { onSignOut(); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13.5px] font-semibold text-red-600 flex items-center gap-2">
                        <LogOut size={15} /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={onOpenAuth} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:opacity-90 transition-opacity text-[13.5px]">
                  Sign in
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto flex">
          <div className="flex-1 px-8 py-6">
            {view === 'home' && (
              <>
                <div className="mb-9">
                  <BannerCarousel />
                </div>

                <div className="mb-10">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[19px] font-extrabold text-gray-900">Recommended for You</h2>
                    <button onClick={() => setView('discover')} className="text-blue-600 font-semibold hover:text-blue-700 text-[13.5px]">View all</button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
                    {filteredApps.slice(0, 5).map((app, i) => (
                      <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} />
                    ))}
                  </div>
                </div>

                <div className="mb-10">
                  <h2 className="text-[19px] font-extrabold text-gray-900 mb-5">Top Categories</h2>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                    {categories.map(({ name, icon: Icon, count, bg, color }) => (
                      <button key={name} onClick={() => { setSelectedCategory(name); setView('categories'); }} className="flex flex-col items-center gap-2.5 py-4 rounded-2xl hover:bg-gray-50 transition-colors">
                        <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center`}>
                          <Icon size={24} className={color} strokeWidth={2.1} />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-[13.5px] text-gray-900">{name}</p>
                          <p className="text-[11.5px] text-gray-400">{count} apps</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[19px] font-extrabold text-gray-900">New &amp; Updated</h2>
                    <button onClick={() => setView('updates')} className="text-blue-600 font-semibold hover:text-blue-700 text-[13.5px]">View all</button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
                    {filteredApps.slice(5, 10).map((app, i) => (
                      <AppCard key={app.id} app={app} index={i + 2} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {(view === 'discover' || view === 'charts') && (
              <div>
                <h2 className="text-[19px] font-extrabold text-gray-900 mb-5">{viewTitles[view]}</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
                  {filteredApps.map((app, i) => (
                    <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} />
                  ))}
                </div>
              </div>
            )}

            {view === 'categories' && (
              <div>
                <h2 className="text-[19px] font-extrabold text-gray-900 mb-5">Categories</h2>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-9">
                  {categories.map(({ name, icon: Icon, count, bg, color }) => (
                    <button key={name} onClick={() => setSelectedCategory(selectedCategory === name ? null : name)}
                      className={`flex flex-col items-center gap-2.5 py-4 rounded-2xl transition-colors ${selectedCategory === name ? 'bg-violet-50 ring-2 ring-violet-400' : 'hover:bg-gray-50'}`}>
                      <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center`}>
                        <Icon size={24} className={color} strokeWidth={2.1} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[13.5px] text-gray-900">{name}</p>
                        <p className="text-[11.5px] text-gray-400">{count} apps</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
                  {(selectedCategory ? filteredApps.filter(a => a.category === selectedCategory) : filteredApps).map((app, i) => (
                    <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} />
                  ))}
                </div>
              </div>
            )}

            {view === 'updates' && (
              <div>
                <h2 className="text-[19px] font-extrabold text-gray-900 mb-5">Updates</h2>
                <div className="space-y-2">
                  {filteredApps.map((app, i) => {
                    return (
                      <div key={app.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50">
                        <SmallAppBadge app={app} size="w-11 h-11" themeClass={smallIconThemes[i % smallIconThemes.length]} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[14px] text-gray-900 truncate">{app.name}</p>
                          <p className="text-[12.5px] text-gray-400">Version {app.version || '1.0.0'}</p>
                        </div>
                        <button className="text-blue-600 font-bold text-[13.5px] hover:text-blue-700">Update</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'profile' && (
              <div>
                <h2 className="text-[19px] font-extrabold text-gray-900 mb-5">Profile</h2>
                <ProfileView
                  session={session}
                  profile={profile}
                  wallet={wallet}
                  onConnectWallet={onConnectWallet}
                  onDisconnectWallet={onDisconnectWallet}
                  onOpenAdmin={onOpenAdmin}
                  onOpenDeveloper={onOpenDeveloper}
                  onOpenTutorials={onOpenTutorials}
                  onOpenTutorial={onOpenTutorial}
                  onSignOut={onSignOut}
                  onOpenAuth={onOpenAuth}
                  dark={false}
                />
              </div>
            )}

            {libraryViews.includes(view) && (
              <div>
                <h2 className="text-[19px] font-extrabold text-gray-900 mb-5 capitalize">{view === 'myapps' ? 'My Apps' : view}</h2>
                {view === 'wishlist' && wishlistLoading && (
                  <p className="text-center py-16 text-gray-400 text-sm">Loading your wishlist…</p>
                )}
                {view === 'wishlist' && !wishlistLoading && wishlistApps.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
                    {wishlistApps.map((app, i) => (
                      <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} />
                    ))}
                  </div>
                ) : (!(view === 'wishlist' && wishlistLoading) && (
                  <EmptyLibraryState view={view} session={session} onOpenAuth={onOpenAuth} onOpenDeveloper={onOpenDeveloper} dark={false} />
                ))}
              </div>
            )}

            {loading && view !== 'categories' && view !== 'profile' && <p className="text-center py-16 text-gray-400 text-sm">Loading apps…</p>}
            {!loading && filteredApps.length === 0 && !libraryViews.includes(view) && view !== 'profile' && <p className="text-center py-16 text-gray-400 text-sm">No apps found</p>}
          </div>

          <DesktopRightSidebar topApps={filteredApps} latestApps={filteredApps} onOpenConsole={onOpenDeveloper} />
        </div>
      </main>
    </div>
  );
}

/* ============================================
   MOBILE — dark theme (below md)
   ============================================ */
function MobileCategoryChip({ name, icon: Icon, count, bg, color }) {
  return (
    <button className="flex flex-col items-center gap-2 py-2">
      <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center`}>
        <Icon size={22} className={color} strokeWidth={2.2} />
      </div>
      <div className="text-center">
        <p className="font-bold text-[12.5px] text-white leading-tight">{name}</p>
        <p className="text-[11px] text-slate-400">{count} apps</p>
      </div>
    </button>
  );
}

function MobileBottomNav({ view, setView }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'categories', label: 'Categories', icon: Grid },
    { id: 'charts', label: 'Top Charts', icon: TrendingUp },
    { id: 'updates', label: 'Updates', icon: Bell },
    { id: 'library', label: 'Library', icon: Gamepad2 },
  ];
  const libraryDetailViews = ['myapps', 'installed', 'downloads', 'wishlist', 'profile'];
  const activeTab = libraryDetailViews.includes(view) ? 'library' : view;
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#0c1129]/95 backdrop-blur border-t border-white/10 flex z-30 md:hidden">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => setView(id)} className="flex-1 py-2.5 flex flex-col items-center gap-1 relative">
          <Icon size={20} strokeWidth={2.2} className={activeTab === id ? 'text-violet-400' : 'text-slate-500'} />
          <span className={`text-[10px] font-semibold ${activeTab === id ? 'text-violet-400' : 'text-slate-500'}`}>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function MobileApp({ view, setView, session, profile, filteredApps, search, setSearch, loading, handleInstall, categories, onOpenAuth, onSignOut, onOpenDeveloper, onOpenApp, onOpenAdmin, installState, isOwned, wallet, onConnectWallet, onDisconnectWallet, onOpenTutorials, onOpenTutorial }) {
  const [chartTab, setChartTab] = useState('Apps');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [wishlistApps, setWishlistApps] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const libraryDetailViews = ['myapps', 'installed', 'downloads', 'wishlist', 'profile'];
  const libraryMenu = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'myapps', label: 'My Apps', icon: Gamepad2 },
    { id: 'installed', label: 'Installed', icon: CheckSquare },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'wishlist', label: 'Wishlist', icon: Heart },
  ];

  useEffect(() => {
    if (view !== 'wishlist' || !session || !profile) return;
    let cancelled = false;
    setWishlistLoading(true);
    sbSelect('wishlists', `user_id=eq.${profile.id}&select=id,apps(*)`, session)
      .then(rows => { if (!cancelled) setWishlistApps((rows || []).map(r => r.apps).filter(Boolean)); })
      .catch(() => { if (!cancelled) setWishlistApps([]); })
      .finally(() => { if (!cancelled) setWishlistLoading(false); });
    return () => { cancelled = true; };
  }, [view, session, profile]);

  return (
    <div className="md:hidden min-h-screen w-full" style={{ background: '#0a0e27' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <NexaLogo size={34} />
          <span className="text-[17px] font-extrabold text-white tracking-tight">NexaStore</span>
        </div>
        <div className="flex items-center gap-3.5">
          <button className="text-white/90">
            <Bell size={21} strokeWidth={2} />
          </button>
          {session && profile ? (
            <div className="relative">
              <button onClick={() => setShowProfileMenu(v => !v)} className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                {profile.email.charAt(0).toUpperCase()}
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-lg p-3 z-30">
                  <p className="text-[12.5px] text-gray-500 px-2 pb-2 truncate">{profile.email}</p>
                  <button onClick={() => { setView('profile'); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13px] font-semibold text-gray-800 flex items-center gap-2">
                    <User size={14} /> Profile
                  </button>
                  {profile.is_owner && (
                    <button onClick={() => { onOpenAdmin(); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13px] font-semibold text-violet-600 flex items-center gap-2">
                      <ShieldCheck size={14} /> Admin Dashboard
                    </button>
                  )}
                  <button onClick={() => { onSignOut(); setShowProfileMenu(false); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 text-[13px] font-semibold text-red-600 flex items-center gap-2">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={onOpenAuth} className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-3.5 py-1.5 rounded-full font-semibold text-[12.5px]">
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search size={17} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for apps, games, tools..."
            className="w-full bg-white/10 pl-11 pr-4 py-3 rounded-full text-[13.5px] placeholder-slate-400 text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      </div>

      {view === 'home' && (
        <>
          <div className="px-4 mb-7">
            <BannerCarousel rounded="rounded-2xl" maxHeight="220px" dotBottom="bottom-3" />
          </div>

          <div className="px-4 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-extrabold text-white">Recommended for You</h2>
              <button onClick={() => setView('charts')} className="text-violet-400 text-[12.5px] font-semibold">See all</button>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {filteredApps.slice(0, 4).map((app, i) => (
                <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} dark={true} />
              ))}
            </div>
          </div>

          <div className="px-4 mb-7">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-extrabold text-white">Top Categories</h2>
              <button onClick={() => setView('categories')} className="text-violet-400 text-[12.5px] font-semibold">See all</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {categories.map((cat) => (
                <button key={cat.name} onClick={() => { setSelectedCategory(cat.name); setView('categories'); }}>
                  <MobileCategoryChip {...cat} />
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 mb-8">
            <div className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 rounded-2xl p-5 relative overflow-hidden">
              <div className="relative z-10 max-w-[70%]">
                <div className="flex items-center gap-2 mb-2.5">
                  <Crown size={16} className="fill-yellow-300 text-yellow-300" strokeWidth={2} />
                  <span className="font-bold text-[13px] text-white">NexaStore</span>
                  <span className="bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-md text-[9.5px] font-extrabold tracking-wide">PREMIUM</span>
                </div>
                <p className="text-[12.5px] text-white/90 mb-4 leading-snug">Go premium and unlock exclusive perks.</p>
                <button className="bg-white text-violet-700 font-bold py-2 px-4 rounded-xl text-[12.5px] flex items-center gap-1">
                  Upgrade Now <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              </div>
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex gap-1.5 opacity-90">
                <div className="w-11 h-11 rounded-xl bg-white/25 rotate-12" />
                <div className="w-9 h-9 rounded-xl bg-white/20 -rotate-6 mt-4" />
              </div>
            </div>
          </div>

          <div className="px-4 mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-extrabold text-white">Top Charts</h2>
              <button onClick={() => setView('charts')} className="text-violet-400 text-[12.5px] font-semibold">See all</button>
            </div>
            <div className="bg-white/5 rounded-full p-1 flex mb-4 w-fit">
              {['Apps', 'Games', 'Tools'].map(tab => (
                <button key={tab} onClick={() => setChartTab(tab)}
                  className={`px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${chartTab === tab ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white' : 'text-slate-400'}`}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredApps.slice(0, 5).map((app, i) => {
                return (
                  <div key={app.id} onClick={() => onOpenApp(app)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                    <span className="text-[13px] font-bold text-slate-500 w-4">{i + 1}</span>
                    <SmallAppBadge app={app} size="w-10 h-10" themeClass={smallIconThemes[i % smallIconThemes.length]} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[13.5px] text-white truncate leading-tight">{app.name}</p>
                      <p className="text-[11.5px] text-slate-400 truncate">{app.category}</p>
                    </div>
                    {app.rating ? (
                      <span className="text-yellow-400 text-[12.5px] font-semibold flex items-center gap-1">
                        <Star size={12} className="fill-yellow-400" /> {app.rating}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === 'categories' && (
        <div className="px-4 mb-8">
          <h2 className="text-[16px] font-extrabold text-white mb-4">Categories</h2>
          <div className="grid grid-cols-3 gap-1 mb-6">
            {categories.map((cat) => (
              <button key={cat.name} onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                className={`rounded-2xl ${selectedCategory === cat.name ? 'bg-white/10 ring-1 ring-violet-400' : ''}`}>
                <MobileCategoryChip {...cat} />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5">
            {(selectedCategory ? filteredApps.filter(a => a.category === selectedCategory) : filteredApps).map((app, i) => (
              <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} dark={true} />
            ))}
          </div>
        </div>
      )}

      {view === 'charts' && (
        <div className="px-4 mb-8">
          <h2 className="text-[16px] font-extrabold text-white mb-4">Top Charts</h2>
          <div className="space-y-3">
            {filteredApps.map((app, i) => {
              return (
                <div key={app.id} onClick={() => onOpenApp(app)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                  <span className="text-[13px] font-bold text-slate-500 w-4">{i + 1}</span>
                  <SmallAppBadge app={app} size="w-10 h-10" themeClass={smallIconThemes[i % smallIconThemes.length]} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13.5px] text-white truncate leading-tight">{app.name}</p>
                    <p className="text-[11.5px] text-slate-400 truncate">{app.category}</p>
                  </div>
                  {app.rating ? (
                    <span className="text-yellow-400 text-[12.5px] font-semibold flex items-center gap-1">
                      <Star size={12} className="fill-yellow-400" /> {app.rating}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'updates' && (
        <div className="px-4 mb-8">
          <h2 className="text-[16px] font-extrabold text-white mb-4">Updates</h2>
          <div className="space-y-3">
            {filteredApps.map((app, i) => {
              return (
                <div key={app.id} onClick={() => onOpenApp(app)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                  <SmallAppBadge app={app} size="w-10 h-10" themeClass={smallIconThemes[i % smallIconThemes.length]} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13.5px] text-white truncate leading-tight">{app.name}</p>
                    <p className="text-[11.5px] text-slate-400">Version {app.version || '1.0.0'}</p>
                  </div>
                  <button onClick={(e) => e.stopPropagation()} className="text-violet-400 font-bold text-[12.5px]">Update</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'library' && (
        <div className="px-4 mb-8">
          <h2 className="text-[16px] font-extrabold text-white mb-4">Library</h2>
          <div className="space-y-2">
            {libraryMenu.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <span className="flex items-center gap-3 text-white font-semibold text-[14px]">
                  <Icon size={19} strokeWidth={2.1} className="text-violet-400" />
                  {label}
                </span>
                <ChevronRight size={17} className="text-slate-500" />
              </button>
            ))}

          </div>
        </div>
      )}

      {view === 'profile' && (
        <div className="px-4 mb-8">
          <button onClick={() => setView('library')} className="text-violet-400 text-[12.5px] font-semibold mb-3 flex items-center gap-1">
            <ChevronRight size={14} strokeWidth={2.5} className="rotate-180" /> Library
          </button>
          <h2 className="text-[16px] font-extrabold text-white mb-4">Profile</h2>
          <ProfileView
            session={session}
            profile={profile}
            wallet={wallet}
            onConnectWallet={onConnectWallet}
            onDisconnectWallet={onDisconnectWallet}
            onOpenAdmin={onOpenAdmin}
            onOpenDeveloper={onOpenDeveloper}
            onOpenTutorials={onOpenTutorials}
            onOpenTutorial={onOpenTutorial}
            onSignOut={onSignOut}
            onOpenAuth={onOpenAuth}
            dark={true}
          />
        </div>
      )}

      {libraryDetailViews.includes(view) && view !== 'profile' && (
        <div className="px-4 mb-8">
          <button onClick={() => setView('library')} className="text-violet-400 text-[12.5px] font-semibold mb-3 flex items-center gap-1">
            <ChevronRight size={14} strokeWidth={2.5} className="rotate-180" /> Library
          </button>
          {view === 'wishlist' && wishlistLoading && (
            <p className="text-center py-10 text-slate-500 text-sm">Loading your wishlist…</p>
          )}
          {view === 'wishlist' && !wishlistLoading && wishlistApps.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {wishlistApps.map((app, i) => (
                <AppCard key={app.id} app={app} index={i} onOpen={onOpenApp} onInstall={handleInstall} installState={installState} owned={isOwned?.(app)} dark={true} />
              ))}
            </div>
          ) : (!(view === 'wishlist' && wishlistLoading) && (
            <EmptyLibraryState view={view} session={session} onOpenAuth={onOpenAuth} onOpenDeveloper={onOpenDeveloper} dark={true} />
          ))}
        </div>
      )}

      {loading && view === 'home' && <p className="text-center py-10 text-slate-500 text-sm">Loading apps…</p>}
      {!loading && filteredApps.length === 0 && !libraryDetailViews.includes(view) && view !== 'library' && view !== 'profile' && <p className="text-center py-10 text-slate-500 text-sm">No apps found</p>}

      <div className="h-20" />
      <MobileBottomNav view={view} setView={setView} />
    </div>
  );
}

/* ============================================
   MAIN
   ============================================ */
export default function NexaStore() {
  const [view, setView] = useState('home');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [allApps, setAllApps] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [installState, setInstallState] = useState(null);
  const [wallet, setWallet] = useState(() => getStoredWallet());
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [payApp, setPayApp] = useState(null);
  const [ownedTick, setOwnedTick] = useState(0); // force re-render after purchase
  const [showTutorialHub, setShowTutorialHub] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState(null);

  const openTutorialHub = () => setShowTutorialHub(true);
  const openTutorialById = async (tutorialId, walletName) => {
    const list = await loadTutorials();
    const tut = findTutorial(list, tutorialId, walletName);
    if (tut) {
      setActiveTutorial(tut);
      setShowTutorialHub(false);
    } else {
      setShowTutorialHub(true);
      showToast('Tutorial not found for that wallet — browse the full list.', 'info');
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const apps = await sbSelect('apps', 'status=eq.approved&select=*&order=created_at.desc&limit=50');
        setAllApps(await enrichAppsWithDevelopers(apps || []));
      } catch (e) {
        console.error('Failed to load apps:', e);
      } finally {
        setLoading(false);
      }
    }
    init();

    restoreSession().then(async (restored) => {
      if (!restored) return;
      setSession(restored.token);
      try {
        const profiles = await sbSelect('profiles', `id=eq.${restored.user.id}`, restored.token);
        setProfile(mergeDevProfile(profiles?.[0] || { id: restored.user.id, email: restored.user.email, is_owner: false }));
      } catch (e) {
        setProfile(mergeDevProfile({ id: restored.user.id, email: restored.user.email, is_owner: false }));
      }
    });
  }, []);

  const filteredApps = useMemo(() => {
    return allApps.filter(app => app.name.toLowerCase().includes(search.toLowerCase()));
  }, [allApps, search]);

  const categories = useMemo(() => {
    return pastelCategories.map(cat => ({
      ...cat,
      count: allApps.filter(a => a.category === cat.name).length,
    }));
  }, [allApps]);

  const showToast = (message, type = 'info', duration = 4500) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  };
  const dismissToast = (id) => setToasts(t => t.filter(x => x.id !== id));

  const isOwned = (app) => {
    const price = parseFloat(app?.price) || 0;
    if (price <= 0) return true;
    return hasPurchased(app.id, profile?.id);
  };

  const doDownload = async (app) => {
    setInstallState({ appId: app.id, progress: 0 });
    try {
      const bits = await sbSelect('app_bits', `app_id=eq.${app.id}&select=*&order=bit_index`, session);
      if (!bits.length) {
        showToast("This app doesn't have an installable file yet.", 'error');
        setInstallState(null);
        return;
      }

      const totalSize = bits.reduce((s, b) => s + (b.size_bytes || 0), 0) || app.total_size_bytes || 0;
      let doneSoFar = 0;
      const parts = [];

      for (const bit of bits) {
        const bitSize = bit.size_bytes || (totalSize / bits.length) || 0;
        const blob = await sbDownload(bit.bucket_id, bit.storage_path, session, (frac) => {
          const overall = totalSize > 0 ? (doneSoFar + frac * bitSize) / totalSize : frac;
          setInstallState({ appId: app.id, progress: Math.min(overall, 0.99) });
        });
        doneSoFar += bitSize || blob.size;
        parts.push(blob);
      }

      const full = new Blob(parts, { type: app.file_type || 'application/octet-stream' });
      const url = URL.createObjectURL(full);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildDownloadFilename(app);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setInstallState({ appId: app.id, progress: 1 });
      showToast(`${app.name} downloaded`, 'success');
      setTimeout(() => setInstallState(null), 1000);
    } catch (e) {
      setInstallState(null);
      showToast(e.message || 'Download failed — please try again.', 'error');
    }
  };

  const handleInstall = async (app) => {
    const price = parseFloat(app.price) || 0;
    if (price > 0 && !isOwned(app)) {
      if (!session) {
        setShowAuthModal(true);
        showToast('Sign in to purchase premium apps.', 'info');
        return;
      }
      // Open NexaPay checkout (USDT on Polygon). Wallet setup is optional and available in Profile.
      setPayApp(app);
      return;
    }
    await doDownload(app);
  };

  const handleAuth = (sessionOrToken) => {
    const session = typeof sessionOrToken === 'string'
      ? { access_token: sessionOrToken }
      : sessionOrToken;
    const token = session.access_token;
    saveAuthSession(session);
    setSession(token);
    sbGetProfile(token).then(async (user) => {
      if (user) {
        try {
          const profiles = await sbSelect('profiles', `id=eq.${user.id}`, token);
          setProfile(mergeDevProfile(profiles?.[0] || { id: user.id, email: user.email, is_owner: false }));
        } catch (e) {
          setProfile(mergeDevProfile({ id: user.id, email: user.email, is_owner: false }));
        }
      }
    });
  };

  const handleSignOut = () => {
    clearAuthSession();
    setSession(null);
    setProfile(null);
  };

  const openDeveloper = () => {
    if (!session) { setShowAuthModal(true); return; }
    setShowDevConsole(true);
  };

  const refreshApps = async () => {
    try {
      const apps = await sbSelect('apps', 'status=eq.approved&select=*&order=created_at.desc&limit=50');
      setAllApps(await enrichAppsWithDevelopers(apps || []));
    } catch (e) {
      console.error('Failed to refresh apps:', e);
    }
  };

  const shared = {
    view, setView, session, profile, filteredApps, search, setSearch, loading, handleInstall,
    categories, onOpenAuth: () => setShowAuthModal(true), onSignOut: handleSignOut, onOpenDeveloper: openDeveloper,
    onOpenApp: (app) => setSelectedApp(app), onOpenAdmin: () => setShowAdmin(true),
    installState, showToast, isOwned,
    wallet,
    onConnectWallet: () => setShowWalletModal(true),
    onDisconnectWallet: () => {
      setStoredWallet(null);
      setWallet(null);
      showToast('Wallet disconnected', 'info');
    },
    onOpenTutorials: openTutorialHub,
    onOpenTutorial: openTutorialById,
  };
  void ownedTick;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <MobileApp {...shared} />
      <DesktopApp {...shared} />
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuth={handleAuth} />}
      {showDevConsole && session && profile && (
        <>
          <div className="md:hidden">
            <DevConsole session={session} profile={profile} onClose={() => setShowDevConsole(false)} onPublished={refreshApps} dark={true} showToast={showToast} onProfileUpdated={setProfile} />
          </div>
          <div className="hidden md:block">
            <DevConsole session={session} profile={profile} onClose={() => setShowDevConsole(false)} onPublished={refreshApps} dark={false} showToast={showToast} onProfileUpdated={setProfile} />
          </div>
        </>
      )}
      {showAdmin && session && profile && profile.is_owner && (
        <>
          <div className="md:hidden">
            <AdminDashboard session={session} profile={profile} onClose={() => { setShowAdmin(false); refreshApps(); }} dark={true} showToast={showToast} />
          </div>
          <div className="hidden md:block">
            <AdminDashboard session={session} profile={profile} onClose={() => { setShowAdmin(false); refreshApps(); }} dark={false} showToast={showToast} />
          </div>
        </>
      )}
      {selectedApp && (
        <>
          <div className="md:hidden">
            <AppDetailModal app={selectedApp} session={session} profile={profile} onClose={() => setSelectedApp(null)} onInstall={handleInstall} onOpenAuth={() => setShowAuthModal(true)} dark={true} installState={installState} showToast={showToast} owned={isOwned(selectedApp)} />
          </div>
          <div className="hidden md:block">
            <AppDetailModal app={selectedApp} session={session} profile={profile} onClose={() => setSelectedApp(null)} onInstall={handleInstall} onOpenAuth={() => setShowAuthModal(true)} dark={false} installState={installState} showToast={showToast} owned={isOwned(selectedApp)} />
          </div>
        </>
      )}
      {showWalletModal && (
        <WalletSetupModal
          dark
          onClose={() => setShowWalletModal(false)}
          onConnected={(w) => {
            setWallet(w);
            showToast(`Connected ${w.name}`, 'success');
          }}
          onOpenTutorial={openTutorialById}
        />
      )}
      {payApp && !showWalletModal && !showTutorialHub && !activeTutorial && (
        <PaymentModal
          app={payApp}
          session={session}
          profile={profile}
          wallet={wallet}
          dark
          onClose={() => setPayApp(null)}
          onNeedWallet={() => setShowWalletModal(true)}
          onOpenTutorials={openTutorialHub}
          onOpenTutorial={openTutorialById}
          onPaid={(app) => {
            setOwnedTick(t => t + 1);
            showToast(`Purchased ${app.name} — starting download…`, 'success');
            setPayApp(null);
            setTimeout(() => doDownload(app), 400);
          }}
        />
      )}
      {showTutorialHub && !activeTutorial && (
        <TutorialHub
          dark
          onClose={() => setShowTutorialHub(false)}
          onOpenTutorial={(tut) => { setActiveTutorial(tut); setShowTutorialHub(false); }}
        />
      )}
      {activeTutorial && (
        <TutorialViewer
          dark
          tutorial={activeTutorial}
          onBack={() => { setActiveTutorial(null); setShowTutorialHub(true); }}
          onClose={() => { setActiveTutorial(null); setShowTutorialHub(false); }}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
