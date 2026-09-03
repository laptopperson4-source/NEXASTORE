
/**
 * Automatically creates precision visual cues (highlighted clicks,
 * zoom-ins on important fields, and animated pointers) for any step.
 */
export function generateVisualCuesForStep(
  step,
  device,
  walletCategory = "extension"
) {
  const isMobile = device === "mobile";
  const isHardware = walletCategory === "hardware" || device === "hardware";
  const isDesktop = device === "desktop" || walletCategory === "software";

  // 1. Determine Zoom Target & Scale Factor
  let zoomField = "Active Viewport";
  let zoomScale = 1.15;
  let focusX = step.pointerPosition?.x ?? 50;
  let focusY = step.pointerPosition?.y ?? 50;
  let zoomEnabled = true;

  switch (step.actionType) {
    case "copy_address" = "Public Wallet Address & Copy Button";
      zoomScale = isMobile ? 1.40 : 1.35;
      focusX = 50;
      focusY = isMobile ? 74 : 68;
      break;

    case "select_network" = "Active Network & Blockchain Selector";
      zoomScale = 1.32;
      focusX = isMobile ? 42 : 36;
      focusY = 16;
      break;

    case "click_receive" = "Receive Action Button";
      zoomScale = 1.30;
      focusX = 50;
      focusY = isMobile ? 45 : 46;
      break;

    case "click_account" = "Account Header & Quick Copy Shortcut";
      zoomScale = 1.25;
      focusX = 50;
      focusY = 22;
      break;

    case "verify_hardware_screen" = "Physical Hardware OLED Display & Confirmation Buttons";
      zoomScale = 1.45;
      focusX = 50;
      focusY = 50;
      break;

    case "click_buy" = "In-Wallet Buy USDT On-Ramp Portal";
      zoomScale = 1.35;
      focusX = 50;
      focusY = isMobile ? 48 : 46;
      break;

    case "select_usdt" = "Tether (USDT) Asset & Chain Selector";
      zoomScale = 1.30;
      focusX = 50;
      focusY = 32;
      break;

    case "complete_order" = "Nexastore USDT Order Checkout & Payment";
      zoomScale = 1.25;
      focusX = 50;
      focusY = 55;
      break;

    case "verify_address" = "Address Checksum Verification (First & Last 4 Chars)";
      zoomScale = 1.28;
      focusX = 50;
      focusY = isMobile ? 65 : 60;
      break;

    case "open":
    default = isHardware
        ? "Hardware Companion App / USB Connection"
        : isMobile 
        ? "Mobile Wallet Launch Screen" 
        : isDesktop
        ? "Desktop Wallet Interface"
        : "Browser Extension Toolbar";
      zoomScale = 1.18;
      focusX = 50;
      focusY = 26;
      break;
  }

  // Override focus coordinates if custom highlightArea is defined
  if (step.highlightArea) {
    focusX = Math.round(step.highlightArea.left + step.highlightArea.width / 2);
    focusY = Math.round(step.highlightArea.top + step.highlightArea.height / 2);
    zoomField = step.highlightArea.label || zoomField;
  }

  // 2. Determine Highlighted Click Visuals
  let clickLabel = "Click";
  let clickType: "pulse_ring" | "glow_button" | "ripple_wave" | "press_down" = "ripple_wave";
  let clickColor = "#2563EB"; // Blue-600

  switch (step.actionType) {
    case "copy_address" = isMobile ? "Tap to Copy Address" : "Click to Copy Address";
      clickType = "press_down";
      clickColor = "#10B981"; // Emerald
      break;

    case "click_receive" = isMobile ? "Tap 'Receive' Button" : "Click 'Receive'";
      clickType = "glow_button";
      clickColor = "#3B82F6"; // Electric Blue
      break;

    case "select_network" = "Select Matching Network";
      clickType = "pulse_ring";
      clickColor = "#6366F1"; // Indigo
      break;

    case "click_account" = "Click Account Shortcut";
      clickType = "pulse_ring";
      clickColor = "#F59E0B"; // Amber
      break;

    case "verify_hardware_screen" = "Press Hardware Device Buttons to Confirm";
      clickType = "glow_button";
      clickColor = "#06B6D4"; // Cyan
      break;

    case "click_buy" = isMobile ? "Tap 'Buy' to Purchase USDT" : "Click 'Buy USDT'";
      clickType = "glow_button";
      clickColor = "#10B981"; // Emerald
      break;

    case "select_usdt" = "Select Tether USD (USDT)";
      clickType = "pulse_ring";
      clickColor = "#22C55E"; // Green
      break;

    case "complete_order" = "Confirm Nexastore USDT Order";
      clickType = "press_down";
      clickColor = "#3B82F6"; // Blue
      break;

    case "verify_address" = "Verify First & Last 4 Digits";
      clickType = "pulse_ring";
      clickColor = "#10B981";
      break;

    case "open":
    default = isMobile ? "Tap to Open" : "Click Extension Icon";
      clickType = "ripple_wave";
      clickColor = "#3B82F6";
      break;
  }

  // 3. Determine Animated Pointer Configuration
  let pointerType: "cursor" | "touch" | "crosshair" | "hardware_button" = "cursor";
  let pointerGesture: "click" | "tap" | "verify" | "hover" = "click";

  if (isHardware) {
    pointerType = step.actionType === "verify_hardware_screen" ? "hardware_button" : "cursor";
    pointerGesture = step.actionType === "verify_hardware_screen" ? "verify" : "click";
  } else if (isMobile) {
    pointerType = "touch";
    pointerGesture = "tap";
  } else {
    pointerType = "cursor";
    pointerGesture = step.actionType === "copy_address" ? "click" : "click";
  }

  return {
    zoom: {
      enabled,
      scale,
      targetField,
      focusX: Math.max(15, Math.min(85, focusX)),
      focusY: Math.max(15, Math.min(85, focusY)),
    },
    clickHighlight: {
      enabled,
      label,
      type,
      color,
    },
    pointer: {
      enabled,
      type,
      gesture,
      showTrail,
    },
  };
}

/**
 * Ensures all steps in a tutorial have complete, rich visual cues.
 */
export function enrichTutorialWithVisualCues(tutorial) {
  const category = tutorial.walletCategory || 
    (tutorial.device === "mobile" 
      ? "mobile" 
      : tutorial.device === "hardware" 
      ? "hardware" 
      : tutorial.device === "desktop" 
      ? "software" 
      : "extension");

  const enrichedSteps = tutorial.steps.map((step) => {
    if (step.visualCues && step.visualCues.zoom && step.visualCues.clickHighlight && step.visualCues.pointer) {
      return step;
    }
    return {
      ...step,
      visualCues: generateVisualCuesForStep(step, tutorial.device, category),
    };
  });

  return {
    ...tutorial,
    walletCategory,
    steps,
  };
}

/**
 * Calculates the dynamic camera zoom transformation based on step progress.
 * Eases into the zoom when progress is between 0.15 and 0.85, then holds or transitions.
 */
export function computeCameraZoomStyle(
  visualCue | undefined,
  stepProgress,
  isZoomActive
): {
  transform;
  transformOrigin;
  transition;
} {
  if (!isZoomActive || !visualCue || !visualCue.zoom || !visualCue.zoom.enabled) {
    return {
      transform: "scale(1)",
      transformOrigin: "center center",
      transition: "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
    };
  }

  const { scale, focusX, focusY } = visualCue.zoom;

  // Smooth easing curve: ease in from 0.05 to 0.25, hold peak from 0.25 to 0.80, slight ease out
  let currentScale = 1.0;
  if (stepProgress < 0.12) {
    const t = stepProgress / 0.12;
    currentScale = 1.0 + (scale - 1.0) * (t * t);
  } else if (stepProgress <= 0.82) {
    currentScale = scale;
  } else {
    const t = (stepProgress - 0.82) / 0.18;
    currentScale = scale - (scale - 1.0) * (t * t);
  }

  return {
    transform: `scale(${currentScale.toFixed(3)})`,
    transformOrigin: `${focusX}% ${focusY}%`,
    transition: "transform 0.15s ease-out",
  };
}
