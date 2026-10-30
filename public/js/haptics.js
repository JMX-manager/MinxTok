// 全局触感反馈：统一入口，设置页可关
const KEY = 'minxtok.haptics';
let enabled = true;
try {
  const saved = localStorage.getItem(KEY);
  if (saved === '0') enabled = false;
} catch (_) {}

let lastAt = 0;

export function isHapticsOn() {
  return enabled;
}

export function setHaptics(on, test = false) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (_) {}
  if (enabled && test) haptic([45, 40, 45], true);
}

export function haptic(pattern = 8, force = false) {
  if (!enabled) return;
  const now = Date.now();
  if (!force && now - lastAt < 28) return;
  lastAt = now;
  // Android 线性马达对 10ms 以下几乎无感，统一抬到 30ms 起步
  const out = typeof pattern === 'number' ? Math.max(pattern, 30) : pattern;
  try {
    if (navigator.vibrate) navigator.vibrate(out);
  } catch (_) {}
}
