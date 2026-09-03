import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, X, Play, Pause, Volume2, VolumeX, MousePointer2 } from 'lucide-react';

function speak(text, { muted, rate = 1 } = {}) {
  try {
    if (muted || !text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

/** Animated wallet mock + cursor + voiceover player */
export default function TutorialAnimPlayer({ tutorial, onClose, onBack, dark = true }) {
  const steps = tutorial?.steps || [];
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const step = steps[idx] || null;
  const duration = Math.max(2.8, step?.durationSeconds || 3.5);

  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';
  const text = dark ? 'text-white' : 'text-gray-900';
  const sub = dark ? 'text-slate-400' : 'text-gray-500';

  // Voiceover on step change
  useEffect(() => {
    if (!step) return;
    if (playing && !muted) speak(step.narration || step.instruction, { muted, rate: 1 });
    return () => stopSpeech();
  }, [idx, muted]); // eslint-disable-line

  // Auto-advance timeline
  useEffect(() => {
    if (!playing || !step) return;
    let raf = 0;
    let last = performance.now();
    let p = progress;
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      p += dt / duration;
      if (p >= 1) {
        if (idx < steps.length - 1) {
          setIdx((i) => i + 1);
          setProgress(0);
          p = 0;
        } else {
          setPlaying(false);
          setProgress(1);
          stopSpeech();
          return;
        }
      } else {
        setProgress(p);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, duration, steps.length]); // eslint-disable-line

  const pointer = step?.pointerPosition || { x: 50, y: 40 };
  const highlight = step?.highlightArea || null;
  // Animate pointer slightly toward target over the step
  const pointerStyle = useMemo(() => {
    const t = Math.min(1, progress * 1.4);
    const ease = 1 - Math.pow(1 - t, 3);
    // start from center-ish
    const sx = 50, sy = 55;
    const x = sx + (pointer.x - sx) * ease;
    const y = sy + (pointer.y - sy) * ease;
    return { left: `${x}%`, top: `${y}%` };
  }, [pointer.x, pointer.y, progress]);

  const screen = step?.screenView || 'home';
  const action = step?.actionType || 'open';

  if (!tutorial) return null;

  return (
    <div className={`fixed inset-0 z-[170] overflow-auto ${bg}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className={`sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-2 ${dark ? 'bg-[#0a0e27]/border-white/10' : 'bg-white border-gray-100'}`}>
        <button type="button" onClick={onBack || onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <ChevronLeft size={20} className={text} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-[14px] truncate ${text}`}>{tutorial.walletName}</p>
          <p className={`text-[11.5px] truncate ${sub}`}>{tutorial.networkName || 'Polygon (USDT)'}</p>
        </div>
        <button type="button" onClick={() => setMuted((m) => !m)} className={`p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          {muted ? <VolumeX size={18} className={text} /> : <Volume2 size={18} className={text} />}
        </button>
        <button type="button" onClick={onClose} className={`p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <X size={18} className={text} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-4">
        <h1 className={`font-extrabold text-[16px] leading-snug mb-1 ${text}`}>{tutorial.title}</h1>
        <p className={`text-[12.5px] mb-3 ${sub}`}>{tutorial.subtitle || 'USDT on Polygon · NexaStore Checkout'}</p>

        {/* Device canvas */}
        <div className="relative mx-auto w-full max-w-[320px] aspect-[9/16] rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#0f172a] to-[#020617] shadow-2xl overflow-hidden mb-4">
          {/* status bar */}
          <div className="absolute top-0 inset-x-0 h-7 flex items-center justify-between px-5 text-[10px] text-slate-400 z-20">
            <span>9:41</span>
            <span>●●●</span>
          </div>

          {/* wallet chrome */}
          <div className="absolute inset-0 pt-8 px-3 pb-3 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                screen === 'network_modal' || action === 'select_network' ? 'bg-violet-600 text-white ring-2 ring-violet-300' : 'bg-slate-800 text-slate-200'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Polygon
              </div>
              <div className="text-[11px] font-mono text-sky-400 bg-slate-800 px-2 py-1 rounded-lg">
                {tutorial.sampleAddress || '0x71C…3aB9'}
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-500 tracking-wide">TOTAL BALANCE</p>
            <p className="text-center text-3xl font-bold text-white mb-4">$2,845.20</p>

            {/* action row */}
            <div className="flex justify-center gap-6 mb-4">
              {['Send', 'Receive', 'Buy'].map((label) => {
                const active =
                  (label === 'Receive' && (action === 'click_receive' || screen === 'qr_modal')) ||
                  (label === 'Buy' && (action === 'click_buy' || screen === 'buy_usdt_modal'));
                return (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      active ? 'bg-blue-600 text-white ring-2 ring-blue-300 scale-110' : 'bg-slate-800 text-slate-300'
                    }`}>{label[0]}</div>
                    <span className="text-[10px] text-slate-400">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* main panel by screen */}
            <div className="flex-1 rounded-2xl bg-slate-900/80 border border-white/5 p-3 relative overflow-hidden">
              {screen === 'network_modal' && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-white mb-2">Select network</p>
                  {['Polygon', 'Ethereum', 'BSC'].map((n) => (
                    <div key={n} className={`px-3 py-2 rounded-xl text-[13px] ${n === 'Polygon' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{n}</div>
                  ))}
                </div>
              )}
              {(screen === 'qr_modal' || action === 'click_receive') && (
                <div className="flex flex-col items-center py-2">
                  <p className="text-[12px] font-bold text-white mb-2">Receive USDT</p>
                  <div className="w-28 h-28 bg-white rounded-xl mb-2 grid place-items-center text-black text-[10px] font-mono">QR</div>
                  <p className="text-[11px] text-slate-400 text-center break-all px-2">{tutorial.fullSampleAddress || tutorial.sampleAddress}</p>
                </div>
              )}
              {(screen === 'toast_copied' || action === 'copy_address') && (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="bg-emerald-500 text-white text-[13px] font-bold px-4 py-2 rounded-full mb-3">Copied!</div>
                  <p className="text-[12px] text-slate-300 text-center">Address on clipboard — paste at NexaStore checkout</p>
                </div>
              )}
              {(screen === 'buy_usdt_modal' || action === 'click_buy' || action === 'select_usdt') && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-white">Buy USDT</p>
                  <div className="bg-slate-800 rounded-xl px-3 py-2 text-[13px] text-white">Tether (USDT) · Polygon</div>
                  <div className="bg-violet-600 rounded-xl px-3 py-2.5 text-center text-[13px] font-bold text-white">Continue</div>
                </div>
              )}
              {(screen === 'nexastore_checkout' || action === 'complete_order') && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-white">NexaStore checkout</p>
                  <div className="bg-slate-800 rounded-xl px-3 py-2 text-[12px] text-slate-300">Send exact amount · USDT on Polygon</div>
                  <div className="bg-emerald-600 rounded-xl px-3 py-2.5 text-center text-[13px] font-bold text-white">Confirm payment</div>
                </div>
              )}
              {screen === 'home' && !['click_receive','copy_address','click_buy','select_usdt','complete_order'].includes(action) && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px] text-slate-300"><span>USDT</span><span>124.50</span></div>
                  <div className="flex justify-between text-[12px] text-slate-300"><span>ETH</span><span>0.42</span></div>
                  <div className="flex justify-between text-[12px] text-slate-300"><span>MATIC</span><span>38.2</span></div>
                </div>
              )}

              {/* highlight box */}
              {highlight && (
                <div
                  className="absolute border-2 border-violet-400 rounded-lg pointer-events-none animate-pulse"
                  style={{
                    top: `${highlight.top}%`,
                    left: `${highlight.left}%`,
                    width: `${highlight.width}%`,
                    height: `${highlight.height}%`,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                  }}
                  title={highlight.label}
                />
              )}
            </div>
          </div>

          {/* moving cursor */}
          <div
            className="absolute z-30 pointer-events-none transition-none"
            style={{ ...pointerStyle, transform: 'translate(-20%, -10%)' }}
          >
            <div className={`relative ${progress > 0.55 && progress < 0.75 ? 'scale-90' : 'scale-100'} transition-transform`}>
              <MousePointer2 size={28} className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" fill="white" />
              {progress > 0.55 && progress < 0.8 && (
                <span className="absolute -inset-3 rounded-full border-2 border-violet-400 animate-ping opacity-70" />
              )}
            </div>
          </div>

          {/* subtitle */}
          <div className="absolute bottom-3 inset-x-3 z-20">
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-[11.5px] text-white leading-snug">
              {step?.instruction || step?.narration}
            </div>
          </div>
        </div>

        {/* step dots */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {steps.map((_, i) => (
            <button key={i} type="button" onClick={() => { setIdx(i); setProgress(0); setPlaying(true); }}
              className={`w-7 h-7 rounded-full text-[11px] font-bold ${i === idx ? 'bg-violet-600 text-white' : i < idx ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
              {i + 1}
            </button>
          ))}
        </div>

        <div className={`h-1 rounded-full mb-3 overflow-hidden ${dark ? 'bg-white/10' : 'bg-gray-200'}`}>
          <div className="h-full bg-violet-500 transition-[width] duration-100" style={{ width: `${((idx + progress) / Math.max(1, steps.length)) * 100}%` }} />
        </div>

        <div className="flex gap-2.5 mb-4">
          <button type="button" onClick={() => setPlaying((p) => !p)}
            className={`flex-1 py-3 rounded-xl font-semibold text-[13.5px] flex items-center justify-center gap-2 ${dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800'}`}>
            {playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
          </button>
          <button type="button" onClick={() => { if (idx < steps.length - 1) { setIdx(idx + 1); setProgress(0); setPlaying(true); } else onClose?.(); }}
            className="flex-1 py-3 rounded-xl font-bold text-[13.5px] text-white bg-gradient-to-r from-violet-600 to-indigo-600">
            {idx < steps.length - 1 ? 'Next step' : 'Done'}
          </button>
        </div>

        {step && (
          <div className={`rounded-2xl border p-4 mb-3 ${dark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${dark ? 'text-violet-300' : 'text-violet-700'}`}>{step.badgeText || `Step ${idx + 1}`}</p>
            <p className={`font-bold text-[14px] mb-1 ${text}`}>{step.title}</p>
            <p className={`text-[13px] leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{step.instruction}</p>
          </div>
        )}

        {(tutorial.safetyTips || []).length > 0 && (
          <div className={`rounded-2xl border p-4 ${dark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-100'}`}>
            <p className={`font-bold text-[13px] mb-2 ${dark ? 'text-amber-300' : 'text-amber-800'}`}>Safety</p>
            <ul className={`space-y-1 text-[12.5px] ${dark ? 'text-amber-200/90' : 'text-amber-900/80'}`}>
              {tutorial.safetyTips.slice(0, 4).map((tip, i) => (
                <li key={i}>• {tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
