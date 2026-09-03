import React, { useMemo, useState } from "react";
import { 
  Copy, 
  CheckCircle2, 
  QrCode, 
  ShieldAlert, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Repeat, 
  ExternalLink,
  ChevronDown,
  Info,
  Layers,
  Sparkles,
  ZoomIn,
  ZoomOut,
  MousePointer,
  ShieldCheck,
  Cpu,
  Monitor,
  Smartphone,
  Compass,
  Check,
  AlertTriangle,
  CreditCard,
  Coins,
  ShoppingCart,
  Store
} from "lucide-react";
import { generateQrMatrix } from './qr.js';
import { generateVisualCuesForStep } from './visualCues.js';



export default function VideoPlayerCanvas({
  tutorial,
  currentStepIndex,
  stepProgress,
  isPlaying,
  isSubtitlesOn,
  containerRef,
  zoomEnabled = true,
  onToggleZoom,
  clickHighlightsEnabled = true,
  onToggleClickHighlights,
  pointerEnabled = true,
  onTogglePointer
}) {
  const currentStep = tutorial.steps[currentStepIndex] || tutorial.steps[0];
  const walletCategory = tutorial.walletCategory || (
    tutorial.device === "mobile" 
      ? "mobile" 
      : tutorial.device === "hardware" 
      ? "hardware" 
      : tutorial.device === "desktop" 
      ? "software" 
      : "extension"
  );
  
  const isMobile = walletCategory === "mobile";
  const isHardware = walletCategory === "hardware";
  const isDesktop = walletCategory === "software";
  const isExtension = walletCategory === "extension";

  // Ensure step has visual cues
  const visualCues = useMemo(() => {
    return currentStep.visualCues || generateVisualCuesForStep(currentStep, tutorial.device, walletCategory);
  }, [currentStep, tutorial.device, walletCategory]);

  // Generate QR matrix for current address
  const qrMatrix = useMemo(() => {
    return generateQrMatrix(tutorial.fullSampleAddress || tutorial.sampleAddress, 23);
  }, [tutorial.fullSampleAddress, tutorial.sampleAddress]);

  // Determine active modals based on step
  const showNetworkDropdown = currentStep.screenView === "network_modal" || currentStep.actionType === "select_network";
  const showQrModal = currentStep.screenView === "qr_modal" || currentStep.actionType === "click_receive";
  const showCopiedToast = currentStep.screenView === "toast_copied" || currentStep.actionType === "copy_address";
  const showHardwareScreen = isHardware && (currentStep.screenView === "hardware_device_screen" || currentStep.actionType === "verify_hardware_screen");
  const showBuyModal = currentStep.screenView === "buy_usdt_modal" || currentStep.actionType === "click_buy";
  const showCheckoutModal = currentStep.screenView === "nexastore_checkout" || currentStep.actionType === "complete_order";

  // Compute smooth camera zoom transform
  const zoomStyle = useMemo(() => {
    if (!zoomEnabled || !visualCues.zoom?.enabled) {
      return {
        transform: "scale(1)",
        transformOrigin: "center center",
        transition: "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)"
      };
    }

    const { scale, focusX, focusY } = visualCues.zoom;
    // Smooth ease in between 0.12 and 0.85
    let currentScale = 1.0;
    if (stepProgress < 0.15) {
      const t = stepProgress / 0.15;
      currentScale = 1.0 + (scale - 1.0) * (t * t);
    } else if (stepProgress <= 0.85) {
      currentScale = scale;
    } else {
      const t = (stepProgress - 0.85) / 0.15;
      currentScale = scale - (scale - 1.0) * (t * t);
    }

    return {
      transform: `scale(${currentScale.toFixed(3)})`,
      transformOrigin: `${focusX}% ${focusY}%`,
      transition: "transform 0.12s ease-out"
    };
  }, [zoomEnabled, visualCues.zoom, stepProgress]);

  // Determine click pulse intensity based on step progress
  const isClickMoment = stepProgress >= 0.25 && stepProgress <= 0.75;

  return (
    <div className="relative flex flex-col items-center justify-center w-full min-h-[560px] md:min-h-[610px] bg-slate-950/90 rounded-2xl border border-slate-800 p-2 sm:p-5 overflow-hidden shadow-2xl">
      {/* Background ambient glow matching wallet category */}
      <div 
        className="absolute -top-28 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 pointer-events-none transition-colors duration-700"
        style={{
          background: isHardware 
            ? "#06B6D4" 
            : isDesktop 
            ? "#7E3AF2" 
            : isMobile 
            ? "#10B981" 
            : "#3B82F6"
        }}
      />

      {/* Floating Visual Cues HUD Control Bar */}
      <div className="w-full max-w-[480px] flex items-center justify-between px-3 py-1.5 mb-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-300 select-none backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 font-semibold text-slate-200">
            {isHardware ? (
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            ) : isDesktop ? (
              <Monitor className="w-3.5 h-3.5 text-purple-400" />
            ) : isMobile ? (
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Compass className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="capitalize">{walletCategory}</span> Guide
          </span>
          <span className="text-slate-600">|</span>
          <span className="truncate max-w-[140px] sm:max-w-[200px] text-slate-400 font-mono text-[10px]">
            {tutorial.walletName}
          </span>
        </div>

        {/* Visual Cues Toggles */}
        <div className="flex items-center gap-1.5">
          {/* Smart Zoom Toggle */}
          <button
            type="button"
            onClick={onToggleZoom}
            title="Toggle Smart Field Zoom-in"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
              zoomEnabled 
                ? "bg-blue-600/20 text-blue-300 border border-blue-500/40" 
                : "bg-slate-800/60 text-slate-500 border border-slate-700/60"
            }`}
          >
            <ZoomIn className="w-3 h-3" />
            <span className="hidden sm:inline">Zoom</span>
            <span className="text-[9px] opacity-75">{zoomEnabled ? "ON" : "OFF"}</span>
          </button>

          {/* Highlighted Clicks Toggle */}
          <button
            type="button"
            onClick={onToggleClickHighlights}
            title="Toggle Highlighted Clicks"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
              clickHighlightsEnabled 
                ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40" 
                : "bg-slate-800/60 text-slate-500 border border-slate-700/60"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">Clicks</span>
            <span className="text-[9px] opacity-75">{clickHighlightsEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* Screen container target for video export and playback */}
      <div
        id="video-screen-canvas"
        ref={containerRef}
        className={`relative transition-all duration-300 overflow-hidden ${
          isMobile 
            ? "w-[305px] sm:w-[330px] h-[550px] sm:h-[580px] rounded-[36px] p-2.5 border-[5px] border-slate-800 bg-slate-900 shadow-2xl shadow-black/80 ring-1 ring-slate-700/50 flex flex-col" 
            : isHardware
            ? "w-full max-w-[460px] h-[540px] sm:h-[560px] rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-2xl shadow-black/90 flex flex-col"
            : isDesktop
            ? "w-full max-w-[460px] h-[540px] sm:h-[560px] rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-2xl shadow-black/90 flex flex-col"
            : "w-full max-w-[420px] sm:max-w-[440px] h-[540px] sm:h-[560px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/90 flex flex-col"
        }`}
      >
        {/* DESKTOP BROWSER TOP BAR (Extension View) */}
        {isExtension && (
          <div className="bg-slate-950 px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none shrink-0 z-20">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="px-3 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono flex items-center gap-1 max-w-[190px] truncate">
              <span>chrome-extension://{tutorial.walletName.toLowerCase().replace(/[^a-z0-9]/g, '')}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{tutorial.walletName}</span>
            </div>
          </div>
        )}

        {/* DESKTOP APPLICATION WINDOW TITLEBAR (Software / Hardware Companion View) */}
        {(isDesktop || isHardware) && (
          <div className="bg-slate-950 px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none shrink-0 z-20">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-semibold text-slate-300 ml-1.5">
                {isHardware ? "Ledger Live Desktop" : tutorial.walletName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              {isHardware ? (
                <span className="flex items-center gap-1 text-cyan-400 font-sans font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  USB Connected
                </span>
              ) : (
                <span>v2.9.1 · Mainnet</span>
              )}
            </div>
          </div>
        )}

        {/* MOBILE STATUS BAR & DYNAMIC ISLAND (Mobile View) */}
        {isMobile && (
          <div className="relative pt-1 pb-2 flex items-center justify-between px-3 text-white text-[11px] font-semibold select-none shrink-0 z-20">
            <span>9:41</span>
            <div className="w-20 h-5 bg-black rounded-full mx-auto -mt-1 flex items-center justify-center gap-1 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-800" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">5G</span>
              <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-emerald-400 rounded-2xs" />
              </div>
            </div>
          </div>
        )}

        {/* ZOOMABLE INNER VIEWPORT CONTAINER */}
        <div 
          className="relative flex-1 bg-slate-950 rounded-lg overflow-hidden flex flex-col border border-slate-800/60 select-none origin-center"
          style={zoomStyle}
        >
          {/* Active Field Zoom HUD Badge (Shows what field is being magnified) */}
          {zoomEnabled && visualCues.zoom?.enabled && (
            <div className="absolute top-2 right-2 z-30 px-2 py-1 rounded bg-slate-950/90 border border-blue-500/40 text-[9px] font-semibold text-blue-300 flex items-center gap-1 shadow-lg pointer-events-none backdrop-blur-xs">
              <ZoomIn className="w-2.5 h-2.5 text-blue-400" />
              <span className="truncate max-w-[150px]">{visualCues.zoom.targetField}</span>
              <span className="text-slate-400 font-mono">({visualCues.zoom.scale}x)</span>
            </div>
          )}

          {/* HARDWARE WALLET DUAL-VERIFICATION VIEW (Ledger / Trezor) */}
          {isHardware && showHardwareScreen ? (
            <div className="flex-1 p-3 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
              <div className="w-full max-w-sm flex flex-col items-center gap-3">
                {/* Security Audit Badge */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Physical Device OLED Screen Verification</span>
                </div>

                {/* PHYSICAL HARDWARE DEVICE MOCKUP (Ledger Nano) */}
                <div className="relative w-full bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-4 border-2 border-cyan-500/50 shadow-2xl shadow-cyan-950/60 flex flex-col items-center gap-3">
                  {/* Physical Device Swivel Plate Header */}
                  <div className="w-full flex items-center justify-between text-[10px] text-slate-400 font-mono border-b border-slate-700/60 pb-2">
                    <span className="font-bold text-slate-200">LEDGER NANO X</span>
                    <span className="text-cyan-400 font-sans font-semibold">● SECURE ELEMENT</span>
                  </div>

                  {/* OLED HIGH-CONTRAST SCREEN */}
                  <div className="w-full bg-black rounded-lg p-3 border border-cyan-400/40 font-mono text-center flex flex-col items-center gap-1.5 shadow-inner">
                    <span className="text-[10px] tracking-wider text-cyan-400 font-bold uppercase">
                      Verify Address ({tutorial.networkName})
                    </span>
                    <div className="w-full bg-cyan-950/40 border border-cyan-500/30 rounded py-1 px-2 text-cyan-200 text-[11px] font-bold tracking-tight select-all">
                      {tutorial.fullSampleAddress || tutorial.sampleAddress}
                    </div>
                    <span className="text-[9px] text-slate-400">
                      Match character-by-character with computer screen
                    </span>
                  </div>

                  {/* PHYSICAL HARDWARE BUTTONS WITH ANIMATED PRESS CUES */}
                  <div className="w-full flex items-center justify-between px-2 pt-1">
                    <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                      clickHighlightsEnabled && isClickMoment
                        ? "bg-cyan-500 text-black border-cyan-300 shadow-md shadow-cyan-500/50 scale-105"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    }`}>
                      ← Left Button
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                      <span>Press Both to Approve</span>
                    </div>

                    <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                      clickHighlightsEnabled && isClickMoment
                        ? "bg-cyan-500 text-black border-cyan-300 shadow-md shadow-cyan-500/50 scale-105"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    }`}>
                      Right Button →
                    </div>
                  </div>
                </div>

                {/* Anti-Malware Warning Banner */}
                <div className="w-full bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 text-slate-300 text-[11px] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    <strong className="text-white">Why verify on screen?</strong> Malware on a compromised PC can modify your clipboard. Your hardware screen is the immutable single source of truth.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* STANDARD / DESKTOP / MOBILE / EXTENSION VIEW */
            <>
              {/* Top Wallet Navigation Bar */}
              <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
                {/* Network Selector Pill */}
                <div 
                  id="wallet-network-pill"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    showNetworkDropdown
                      ? "border-blue-400 bg-blue-600/25 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-500/50"
                      : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate max-w-[120px]">{tutorial.networkName}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>

                {/* Wallet Avatar / Account Selector */}
                <div 
                  id="wallet-account-header"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    currentStep.actionType === "click_account"
                      ? "border-amber-400 bg-amber-500/25 text-white ring-2 ring-amber-500/50 shadow-md shadow-amber-500/20"
                      : "border-transparent bg-slate-800/50 text-slate-300"
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {tutorial.walletName[0]}
                  </div>
                  <span className="text-xs font-semibold">{tutorial.sampleAddress}</span>
                  <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
              </div>

              {/* Wallet Main Balance & Actions View */}
              <div className="flex-1 p-3.5 sm:p-4 flex flex-col justify-between overflow-y-auto">
                {/* Portfolio Balance Display */}
                <div className="text-center pt-1.5 pb-2.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                    Total Balance
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
                    $2,845.20
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span>+$84.15 (+3.05%)</span>
                  </div>
                </div>

                {/* Quick Action Buttons Row */}
                <div className="grid grid-cols-4 gap-2 py-1.5">
                  <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-slate-400">Send</span>
                  </div>

                  {/* THE "RECEIVE" BUTTON (Primary Highlight Target) */}
                  <div 
                    id="wallet-receive-btn"
                    className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      currentStep.actionType === "click_receive" || showQrModal
                        ? "scale-105"
                        : ""
                    }`}
                  >
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      currentStep.actionType === "click_receive"
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/50 ring-4 ring-blue-500/40 border border-blue-300"
                        : "bg-blue-600/20 border border-blue-500/40 text-blue-300"
                    }`}>
                      <ArrowDownLeft className="w-4 h-4" />
                      {/* Highlight Pulse Ring when active */}
                      {clickHighlightsEnabled && currentStep.actionType === "click_receive" && isClickMoment && (
                        <span className="absolute -inset-1 rounded-full border-2 border-blue-400 animate-ping" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold ${
                      currentStep.actionType === "click_receive" ? "text-blue-400" : "text-slate-300"
                    }`}>
                      Receive
                    </span>
                  </div>

                  {/* BUY USDT BUTTON (Active target for Buy USDT steps) */}
                  <div 
                    id="wallet-buy-usdt-btn"
                    className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      currentStep.actionType === "click_buy" || showBuyModal
                        ? "scale-105"
                        : ""
                    }`}
                  >
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      currentStep.actionType === "click_buy" || showBuyModal
                        ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/50 ring-4 ring-emerald-500/40 border border-emerald-300 font-bold"
                        : "bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                    }`}>
                      <CreditCard className="w-4 h-4" />
                      {/* Highlight Pulse Ring when active */}
                      {clickHighlightsEnabled && currentStep.actionType === "click_buy" && isClickMoment && (
                        <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-ping" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold ${
                      currentStep.actionType === "click_buy" || showBuyModal ? "text-emerald-400" : "text-slate-300"
                    }`}>
                      Buy USDT
                    </span>
                  </div>

                  {/* NEXASTORE CHECKOUT BUTTON */}
                  <div 
                    id="wallet-checkout-btn"
                    className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      currentStep.actionType === "complete_order" || showCheckoutModal
                        ? "scale-105"
                        : "opacity-75"
                    }`}
                  >
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      currentStep.actionType === "complete_order" || showCheckoutModal
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/50 ring-4 ring-blue-500/40 border border-blue-300"
                        : "bg-slate-800 border border-slate-700 text-slate-300"
                    }`}>
                      <ShoppingCart className="w-4 h-4" />
                      {clickHighlightsEnabled && currentStep.actionType === "complete_order" && isClickMoment && (
                        <span className="absolute -inset-1 rounded-full border-2 border-blue-400 animate-ping" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold ${
                      currentStep.actionType === "complete_order" || showCheckoutModal ? "text-blue-400" : "text-slate-400"
                    }`}>
                      Pay Nexastore
                    </span>
                  </div>
                </div>

                {/* Tokens Asset List */}
                <div className="space-y-1.5 my-1">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-1">
                    <span>Assets ({tutorial.networkName})</span>
                    <span className="text-emerald-400 font-medium normal-case">Nexastore: USDT Only</span>
                  </div>

                  {/* Primary USDT Asset Item */}
                  <div 
                    id="asset-item-usdt"
                    className={`p-2 rounded-xl transition-all flex items-center justify-between border ${
                      currentStep.actionType === "select_usdt" || currentStep.actionType === "click_buy"
                        ? "bg-emerald-950/40 border-emerald-400/80 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10"
                        : "bg-slate-900/80 border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-xs">
                        ₮
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Tether USD (USDT)</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Nexastore
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">100.00 USDT</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-white">$100.00</div>
                      <div className="text-[10px] text-emerald-400 font-mono">Ready to Pay</div>
                    </div>
                  </div>

                  {/* Native Gas Token */}
                  <div className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/50 flex items-center justify-between opacity-80">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                        {tutorial.networkName.substring(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{tutorial.networkName}</div>
                        <div className="text-[10px] text-slate-400">0.05 {tutorial.networkName.substring(0, 3)} (Gas Reserve)</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-300">$15.20</div>
                      <div className="text-[9px] text-slate-400 font-mono">Network Fee</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* OVERLAY MODAL: Network Selection Dropdown */}
          {showNetworkDropdown && (
            <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  Select Network
                </span>
                <span className="text-[10px] text-slate-400">Match sender chain</span>
              </div>
              <div className="mt-3 space-y-1.5 overflow-y-auto">
                <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/50 flex items-center justify-between text-white">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold">{tutorial.networkName}</span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">Active</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-slate-400 opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    <span className="text-xs">Arbitrum One</span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-slate-400 opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    <span className="text-xs">Base Mainnet</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY MODAL: QR Code & Full Address View */}
          {showQrModal && !showHardwareScreen && (
            <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col p-3 sm:p-4 animate-in fade-in zoom-in-95 duration-200 justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white">Receive {tutorial.networkName}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono border border-blue-500/20">
                  Public Key
                </span>
              </div>

              {/* QR Code Graphic Representation */}
              <div className="my-auto flex flex-col items-center">
                <div className="p-2.5 bg-white rounded-xl shadow-xl flex items-center justify-center">
                  <div className="grid grid-cols-23 gap-0 w-32 h-32 sm:w-36 sm:h-36">
                    {qrMatrix.map((row, rIdx) => 
                      row.map((cell, cIdx) => (
                        <div 
                          key={`${rIdx}-${cIdx}`}
                          className={cell ? "bg-slate-950" : "bg-white"}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* The Full Address & Copy Button Field (Key Zoom Target!) */}
                <div 
                  id="wallet-address-container"
                  className={`mt-3 w-full bg-slate-900 p-2.5 rounded-xl border transition-all ${
                    currentStep.actionType === "copy_address"
                      ? "border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20"
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>Your Public Address</span>
                    <span className="text-emerald-400 font-medium">Safe to share</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] sm:text-[11px] text-white break-all flex-1 select-all bg-slate-950/80 p-1.5 rounded border border-slate-800">
                      {tutorial.fullSampleAddress || tutorial.sampleAddress}
                    </span>
                    <button 
                      type="button"
                      id="wallet-copy-action-btn"
                      className={`p-2 rounded-lg border transition-all shrink-0 ${
                        currentStep.actionType === "copy_address"
                          ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/40 scale-105"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-amber-400/90 text-center flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  <ShieldAlert className="w-3 h-3 shrink-0" />
                  <span>Only send {tutorial.networkName} assets to this address.</span>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY MODAL: In-Wallet Buy USDT (Nexastore Payment On-Ramp) */}
          {showBuyModal && !showHardwareScreen && (
            <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col p-3.5 sm:p-4 animate-in fade-in zoom-in-95 duration-200 justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-slate-950">
                    ₮
                  </div>
                  <span className="text-xs font-bold text-white">Buy Tether (USDT)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                  Nexastore Checkout
                </span>
              </div>

              <div className="my-auto space-y-2.5">
                {/* Important Notice */}
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white">Nexastore Exclusive Payment:</strong>
                    Nexastore only supports USDT for all purchases. Buy USDT here to fund your checkout order.
                  </div>
                </div>

                {/* Amount calculator */}
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>You Pay</span>
                    <span className="text-white font-bold text-sm">$100.00 USD</span>
                  </div>
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>You Receive (~1:1)</span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">100.00 USDT</span>
                  </div>
                  <div className="text-[10px] text-slate-500 text-right">
                    Network: <span className="text-slate-300 font-semibold">{tutorial.networkName}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block px-1">
                    Select Payment Method
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="p-2 rounded-lg bg-slate-900 border border-emerald-500/50 text-[10px] text-white flex items-center gap-1.5 font-medium">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Debit / Credit Card</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Apple / Google Pay</span>
                    </div>
                  </div>
                </div>

                {/* Confirm Action Button */}
                <div 
                  id="buy-usdt-confirm-btn"
                  className="p-3 rounded-xl bg-emerald-500 text-slate-950 border border-emerald-400 font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 scale-[1.01]"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Buy 100.00 USDT Now</span>
                </div>
                <div className="text-[9px] text-slate-500 text-center">
                  Instant settlement via MoonPay / Transak / Stripe Web3 On-Ramp
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY MODAL: Nexastore Checkout Screen */}
          {showCheckoutModal && !showHardwareScreen && (
            <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col p-3.5 sm:p-4 animate-in fade-in zoom-in-95 duration-200 justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-slate-950">N</div>
                  <span className="text-xs font-bold text-white">NexaPay</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20">
                  USDT · Polygon
                </span>
              </div>

              <div className="my-auto space-y-2.5">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Send exactly</span>
                  <div className="text-2xl font-black text-emerald-400 mt-0.5">2.00 USDT</div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-300 mt-1 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                    <span>Amount locked by NexaStore app price</span>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3 flex justify-center">
                  <div className="w-24 h-24 bg-slate-200 rounded-lg grid place-items-center text-[10px] font-mono text-slate-700">QR CODE</div>
                </div>

                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-left">
                  <span className="text-[10px] text-slate-400 block mb-1">Wallet address (Polygon)</span>
                  <span className="font-mono text-[9px] text-emerald-400 break-all select-all bg-slate-950 p-1.5 rounded block border border-slate-800">
                    0xF8720081dc56427AB7851fda9F05754304f0bfb2
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 text-center font-semibold">
                  Send USDT on Polygon only. Other networks = lost funds.
                </div>

                <div className="p-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Waiting for payment…</span>
                </div>
              </div>
            </div>
          )}

          {/* TOAST NOTIFICATION: Address Copied Success! */}
          {showCopiedToast && (
            <div className="absolute top-12 left-4 right-4 bg-emerald-500 text-slate-950 px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-between shadow-xl shadow-emerald-500/30 border border-emerald-400 z-30 animate-in slide-in-from-top-3 duration-200">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>Address copied to clipboard!</span>
              </div>
              <span className="text-[10px] font-mono opacity-80 truncate max-w-[100px]">{tutorial.sampleAddress}</span>
            </div>
          )}

          {/* DYNAMIC HIGHLIGHTED CLICKS WAVE & SPOTLIGHT */}
          {clickHighlightsEnabled && isClickMoment && (
            <div
              className="absolute z-35 pointer-events-none transition-all duration-300"
              style={{
                top: `${currentStep.pointerPosition?.y ?? 50}%`,
                left: `${currentStep.pointerPosition?.x ?? 50}%`,
                transform: "translate(-50%, -50%)"
              }}
            >
              {/* Expanding Ripple Ring */}
              <div 
                className="w-14 h-14 rounded-full animate-ping opacity-75 border-2"
                style={{ borderColor: visualCues.clickHighlight?.color || "#3B82F6" }}
              />
              <div 
                className="absolute inset-1 rounded-full animate-pulse opacity-50"
                style={{ background: visualCues.clickHighlight?.color || "#3B82F6" }}
              />
            </div>
          )}

          {/* ANIMATED POINTER CURSOR */}
          {pointerEnabled && (
            <div
              id="video-animated-pointer"
              className="absolute z-40 transition-all duration-500 pointer-events-none"
              style={{
                top: `${currentStep.pointerPosition?.y ?? 50}%`,
                left: `${currentStep.pointerPosition?.x ?? 50}%`,
                transform: `translate(-50%, -50%) scale(${isClickMoment ? 0.90 : 1.0})`
              }}
            >
              {/* Motion Trail Beacon */}
              <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-blue-400/80 animate-ping" />

              {/* Pointer Graphic: Touch reticle for Mobile, Crosshair/Finger for Hardware, Arrow for Desktop */}
              {isMobile ? (
                <div className="relative flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-blue-500/30 border-2 border-white shadow-xl shadow-blue-500/60 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  </div>
                  {/* Floating Action Tag */}
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/90 text-[9px] font-bold text-blue-300 border border-blue-500/50 shadow-lg">
                    {visualCues.clickHighlight?.label || currentStep.title}
                  </div>
                </div>
              ) : isHardware && currentStep.actionType === "verify_hardware_screen" ? (
                <div className="relative flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/30 border-2 border-cyan-300 shadow-xl shadow-cyan-500/60 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="absolute top-11 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/90 text-[9px] font-bold text-cyan-300 border border-cyan-400/50 shadow-lg">
                    Verify Both Buttons
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Glowing Mouse Cursor Icon */}
                  <svg className="w-6 h-6 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] filter" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 2l16 11-7.5 1.5 4.5 7.5-2.5 1.5-4.5-7.5-6 6V2z" />
                  </svg>
                  {/* Floating Action Tag */}
                  <div className="absolute top-7 left-3 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/90 text-[9px] font-bold text-blue-300 border border-blue-500/50 shadow-lg">
                    {visualCues.clickHighlight?.label || currentStep.title}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MOBILE HOME INDICATOR BAR (Mobile View) */}
        {isMobile && (
          <div className="pt-2 pb-0.5 flex justify-center select-none shrink-0 z-20">
            <div className="w-28 h-1 bg-slate-600 rounded-full" />
          </div>
        )}
      </div>

      {/* SYNCHRONIZED SUBTITLES / CAPTION OVERLAY */}
      {isSubtitlesOn && (
        <div 
          id="tutorial-subtitle-bar"
          className="mt-3.5 w-full max-w-xl bg-slate-900/95 border border-slate-700/80 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-xs flex items-start gap-2.5 transition-all"
        >
          <div className="px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-mono font-bold shrink-0 mt-0.5">
            Step {currentStep.stepNumber}/{tutorial.steps.length}
          </div>
          <div className="flex-1">
            <p className="text-xs sm:text-sm font-medium text-white leading-snug">
              {currentStep.instruction}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 italic">
              "{currentStep.narration}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
