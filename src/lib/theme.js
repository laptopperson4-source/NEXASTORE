import { useState } from 'react';

export const THEME = {
  light: {
    page: 'bg-[#F7F8FA]',
    surface: 'bg-[#FCFEFF]',
    surfaceAlt: 'bg-[#F3F4F6]',
    card: 'bg-[#FCFEFF] border-gray-200/80',
    cardSoft: 'bg-[#F3F4F6] border-gray-200/70',
    border: 'border-gray-200/80',
    text: 'text-gray-900',
    textMuted: 'text-gray-500',
    textFaint: 'text-gray-400',
    input: 'bg-[#F3F4F6] text-gray-900 placeholder-gray-400 border border-gray-200 focus:ring-2 focus:ring-violet-500/40',
    hover: 'hover:bg-[#EEF0F4]',
    logoBg: 'bg-[#FCFEFF]',
  },
  dark: {
    page: 'bg-[#0a0e27]',
    surface: 'bg-[#12172f]',
    surfaceAlt: 'bg-white/5',
    card: 'bg-white/5 border-white/10',
    cardSoft: 'bg-white/[0.04] border-white/10',
    border: 'border-white/10',
    text: 'text-white',
    textMuted: 'text-slate-400',
    textFaint: 'text-slate-500',
    input: 'bg-white/10 text-white placeholder-slate-500 border border-white/10 focus:ring-2 focus:ring-violet-500/50',
    hover: 'hover:bg-white/10',
    logoBg: 'bg-[#FCFEFF]',
  },
};

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('nexastore_theme');
      if (saved === 'dark' || saved === 'light') return saved === 'dark';
    } catch {}
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    return false;
  });
  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      try { localStorage.setItem('nexastore_theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  };
  const t = dark ? THEME.dark : THEME.light;
  return { dark, toggleTheme, t };
}
