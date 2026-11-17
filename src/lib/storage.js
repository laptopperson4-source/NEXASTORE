import { sbSelect, PLATFORM_TREASURY_WALLET } from './supabase.js';

export const WALLET_KEY = 'nexastore_crypto_wallet';
export const PURCHASES_KEY = 'nexastore_purchases';

export const RECOMMENDED_WALLETS = [
  { id: 'trust', name: 'Trust Wallet', desc: 'Mobile-first, excellent USDT (TRC-20 & ERC-20) support', url: 'https://trustwallet.com/', networks: 'Multi-chain' },
  { id: 'metamask', name: 'MetaMask', desc: 'Browser + mobile. Best for Ethereum & USDT ERC-20', url: 'https://metamask.io/', networks: 'Ethereum, L2s' },
  { id: 'binance', name: 'Binance Web3 Wallet', desc: 'Seamless USDT from Binance exchange balances', url: 'https://www.binance.com/en/web3wallet', networks: 'BSC, Multi' },
  { id: 'coinbase', name: 'Coinbase Wallet', desc: 'Simple onboarding, USDT on multiple networks', url: 'https://www.coinbase.com/wallet', networks: 'Multi-chain' },
  { id: 'phantom', name: 'Phantom', desc: 'Great UX; supports USDT on Solana', url: 'https://phantom.app/', networks: 'Solana + more' },
  { id: 'tonkeeper', name: 'Tonkeeper', desc: 'USDT on TON — fast & low fees', url: 'https://tonkeeper.com/', networks: 'TON' },
];

export function getStoredWallet() {
  try { return JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); } catch { return null; }
}
export function setStoredWallet(w) {
  if (w) localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  else localStorage.removeItem(WALLET_KEY);
}
export function getPurchases() {
  try { return JSON.parse(localStorage.getItem(PURCHASES_KEY) || '{}'); } catch { return {}; }
}
export function markPurchased(appId, userId) {
  const key = userId || 'guest';
  const all = getPurchases();
  if (!all[key]) all[key] = [];
  if (!all[key].includes(appId)) all[key].push(appId);
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(all));
}
export function hasPurchased(appId, userId) {
  const key = userId || 'guest';
  const all = getPurchases();
  return (all[key] || []).includes(appId);
}

export const INSTALLS_KEY = 'nexastore_install_counts_v1';
export function getInstallCounts() {
  try { return JSON.parse(localStorage.getItem(INSTALLS_KEY) || '{}'); } catch { return {}; }
}
export function recordInstall(appId) {
  if (!appId) return;
  const all = getInstallCounts();
  const weekKey = (() => {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  })();
  if (!all[weekKey]) all[weekKey] = {};
  all[weekKey][appId] = (all[weekKey][appId] || 0) + 1;
  const keys = Object.keys(all).sort();
  while (keys.length > 4) { delete all[keys.shift()]; }
  try { localStorage.setItem(INSTALLS_KEY, JSON.stringify(all)); } catch {}
}
export function getWeeklyInstallCount(appId) {
  const all = getInstallCounts();
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  const weekKey = `${d.getFullYear()}-W${week}`;
  return (all[weekKey] && all[weekKey][appId]) || 0;
}
export function sortByTopInstalled(apps) {
  return [...(apps || [])].sort((a, b) => {
    const ia = getWeeklyInstallCount(a.id) + (Number(a.download_count) || Number(a.downloads) || 0);
    const ib = getWeeklyInstallCount(b.id) + (Number(b.download_count) || Number(b.downloads) || 0);
    if (ib !== ia) return ib - ia;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  });
}

export async function resolvePayoutWallet(app) {
  try {
    if (app?.dev_id) {
      const rows = await sbSelect('profiles', `id=eq.${app.dev_id}&select=payout_wallet,email`);
      const w = rows?.[0]?.payout_wallet;
      if (w && String(w).length >= 10) return { address: String(w), source: 'developer' };
    }
  } catch {}
  try {
    const local = localStorage.getItem(`nexastore_payout_${app?.dev_id || ''}`);
    if (local && local.length >= 10) return { address: local, source: 'developer' };
  } catch {}
  return { address: PLATFORM_TREASURY_WALLET, source: 'platform_fallback' };
}

export function formatPrice(price) {
  const p = parseFloat(price) || 0;
  if (p <= 0) return 'Free';
  return `${p.toFixed(2)} USDT`;
}
