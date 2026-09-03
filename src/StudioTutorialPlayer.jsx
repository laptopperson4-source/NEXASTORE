import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, X, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import VideoPlayerCanvas from './VideoPlayerCanvas.jsx';

function speak(text, muted) {
  try {
    if (muted || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}
function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

/** Full AI-Studio-style player: wallet chrome, cursor, highlights, voiceover */
export default function StudioTutorialPlayer({ tutorial, onClose, onBack, dark = true }) {
  const steps = tutorial?.steps || [];
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [subs, setSubs] = useState(true);
  const step = steps[idx];
  const duration = Math.max(2.5, step?.durationSeconds || 3.5);
  const text = dark ? 'text-white' : 'text-gray-900';
  const sub = dark ? 'text-slate-400' : 'text-gray-500';
  const bg = dark ? 'bg-[#0a0e27]' : 'bg-white';

  useEffect(() => {
    if (playing && step && !muted) speak(step.narration || step.instruction, muted);
    return () => stopSpeech();
  }, [idx, muted]); // eslint-disable-line

  useEffect(() => {
    if (!playing || !step) return;
    let raf = 0;
    let last = performance.now();
    let p = 0;
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      p += dt / duration;
      if (p >= 1) {
        if (idx < steps.length - 1) {
          setIdx(i => i + 1);
          setProgress(0);
          p = 0;
        } else {
          setPlaying(false);
          setProgress(1);
          stopSpeech();
          return;
        }
      } else setProgress(p);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, duration, steps.length]);

  if (!tutorial) return null;

  return (
    <div className={`fixed inset-0 z-[170] overflow-auto ${bg}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className={`sticky top-0 z-20 border-b px-4 py-3 flex items-center gap-2 ${dark ? 'bg-[#0a0e27] border-white/10' : 'bg-white border-gray-100'}`}>
        <button type="button" onClick={onBack || onClose} className={`p-2 -ml-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <ArrowLeft size={20} className={text} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-[14px] truncate ${text}`}>{tutorial.walletName}</p>
          <p className={`text-[11.5px] truncate ${sub}`}>{tutorial.networkName || 'Polygon (USDT)'} · NexaStore</p>
        </div>
        <button type="button" onClick={() => setMuted(m => !m)} className={`p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          {muted ? <VolumeX size={18} className={text} /> : <Volume2 size={18} className={text} />}
        </button>
        <button type="button" onClick={onClose} className={`p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <X size={18} className={text} />
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-4">
        <div className="mb-3">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{tutorial.subtitle}</p>
          <h1 className={`font-extrabold text-[17px] leading-snug ${text}`}>{tutorial.title}</h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-2 sm:p-4">
          <VideoPlayerCanvas
            tutorial={tutorial}
            currentStepIndex={idx}
            stepProgress={progress}
            isPlaying={playing}
            isSubtitlesOn={subs}
            zoomEnabled
            clickHighlightsEnabled
            pointerEnabled
          />
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 mb-2">
          {steps.map((_, i) => (
            <button key={i} type="button" onClick={() => { setIdx(i); setProgress(0); setPlaying(true); }}
              className={`w-7 h-7 rounded-full text-[11px] font-bold ${i === idx ? 'bg-blue-600 text-white' : i < idx ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="h-1 rounded-full bg-white/10 mb-3 overflow-hidden max-w-md mx-auto">
          <div className="h-full bg-blue-500 transition-[width] duration-100" style={{ width: `${((idx + progress) / Math.max(1, steps.length)) * 100}%` }} />
        </div>

        <div className="flex gap-2 max-w-md mx-auto">
          <button type="button" onClick={() => setPlaying(p => !p)}
            className="flex-1 py-3 rounded-xl font-semibold text-[13.5px] bg-white/10 text-white flex items-center justify-center gap-2">
            {playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
          </button>
          <button type="button" onClick={() => setSubs(s => !s)}
            className="px-4 py-3 rounded-xl font-semibold text-[13px] bg-white/10 text-white">
            {subs ? 'Subs on' : 'Subs off'}
          </button>
          <button type="button" onClick={() => {
            if (idx < steps.length - 1) { setIdx(idx + 1); setProgress(0); setPlaying(true); }
            else onClose?.();
          }} className="flex-1 py-3 rounded-xl font-bold text-[13.5px] text-white bg-blue-600">
            {idx < steps.length - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
