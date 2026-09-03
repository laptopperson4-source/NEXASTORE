/** Default visual cues for tutorial steps */
export function generateVisualCuesForStep(step, device, walletCategory = 'extension') {
  const isMobile = device === 'mobile';
  const isHardware = walletCategory === 'hardware' || device === 'hardware';
  const focusX = step?.pointerPosition?.x ?? 50;
  const focusY = step?.pointerPosition?.y ?? 50;
  let zoomScale = 1.2;
  let zoomField = step?.highlightArea?.label || 'Active area';
  let clickType = 'ripple_wave';
  let pointerType = isMobile ? 'touch' : 'cursor';
  let gesture = 'click';

  switch (step?.actionType) {
    case 'copy_address':
      zoomScale = isMobile ? 1.4 : 1.35;
      clickType = 'pulse_ring';
      gesture = 'click';
      break;
    case 'select_network':
      zoomScale = 1.25;
      clickType = 'glow_button';
      break;
    case 'click_receive':
    case 'click_buy':
      zoomScale = 1.3;
      clickType = 'pulse_ring';
      gesture = isMobile ? 'tap' : 'click';
      break;
    case 'complete_order':
      zoomScale = 1.2;
      clickType = 'glow_button';
      break;
    default:
      break;
  }

  return {
    zoom: {
      enabled: true,
      scale: zoomScale,
      targetField: zoomField,
      focusX,
      focusY,
    },
    clickHighlight: {
      enabled: true,
      label: step?.highlightArea?.label || step?.badgeText || 'Tap here',
      type: clickType,
      color: isHardware ? '#06b6d4' : '#3b82f6',
    },
    pointer: {
      enabled: true,
      type: pointerType,
      gesture,
      showTrail: true,
    },
  };
}

export function enrichTutorialWithVisualCues(tutorial) {
  if (!tutorial?.steps) return tutorial;
  return {
    ...tutorial,
    steps: tutorial.steps.map((s) => ({
      ...s,
      visualCues: s.visualCues || generateVisualCuesForStep(s, tutorial.device, tutorial.walletCategory),
    })),
  };
}

export function computeCameraZoomStyle(visualCues, stepProgress = 0) {
  if (!visualCues?.zoom?.enabled) return {};
  const t = Math.min(1, Math.max(0, stepProgress));
  const scale = 1 + (visualCues.zoom.scale - 1) * t;
  const x = visualCues.zoom.focusX ?? 50;
  const y = visualCues.zoom.focusY ?? 50;
  return {
    transform: `scale(${scale})`,
    transformOrigin: `${x}% ${y}%`,
  };
}
