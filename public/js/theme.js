// 主题：跟随日出日落自动切换，也支持手动锁定深/浅色
// 位置来源：浏览器定位（授权后）→ 缓存 → 默认抚顺
const MODE_KEY = 'minxtok.themeMode';   // auto | dark | light
const GEO_KEY = 'minxtok.geo';          // {lat, lon, at}
const DEFAULT_GEO = { lat: 41.88, lon: 123.92 }; // 抚顺

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } };

export function getMode() {
  const m = read(MODE_KEY);
  return m === 'dark' || m === 'light' ? m : 'auto';
}

export function currentTheme() {
  return document.documentElement.dataset.theme || 'dark';
}

// 日出日落（NOAA 简化算法，城市级精度足够）
export function sunTimes(lat, lon, date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const N = Math.floor((date - start) / 86400000);
  const rad = Math.PI / 180;
  const dec = -23.44 * rad * Math.cos((2 * Math.PI * (N + 10)) / 365);
  const cosH = -Math.tan(lat * rad) * Math.tan(dec);
  if (cosH <= -1) return { sunrise: 0, sunset: 24 };  // 极昼
  if (cosH >= 1) return { sunrise: 12, sunset: 12 };  // 极夜
  const H = Math.acos(cosH) / rad;
  const tz = -date.getTimezoneOffset() / 60;
  const noonUTC = 12 - lon / 15;
  return { sunrise: noonUTC - H / 15 + tz, sunset: noonUTC + H / 15 + tz };
}

function autoThemeByGeo(geo) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const { sunrise, sunset } = sunTimes(geo.lat, geo.lon, now);
  return h >= sunrise && h < sunset ? 'light' : 'dark';
}

function cachedGeo() {
  try {
    const g = JSON.parse(read(GEO_KEY) || 'null');
    if (g && typeof g.lat === 'number' && Date.now() - g.at < 6 * 3600 * 1000) return g;
  } catch (e) { /* 忽略 */ }
  return null;
}

function requestGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        const geo = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
        write(GEO_KEY, JSON.stringify(geo));
        resolve(geo);
      },
      () => { clearTimeout(timer); resolve(null); },
      { timeout: 3500, maximumAge: 6 * 3600 * 1000 }
    );
  });
}

export function applyTheme(mode, animate = false) {
  document.documentElement.dataset.theme = mode;
  const meta = document.getElementById('metaTheme');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0a0b' : '#f6f6f7');

  const app = document.getElementById('app');
  if (animate && app) {
    app.classList.remove('m-blur-in');
    void app.offsetWidth;
    app.classList.add('m-blur-in');
    setTimeout(() => app.classList.remove('m-blur-in'), 500);
  }
}

// 根据当前模式算出该用哪套配色
export function resolveTheme(geo) {
  const mode = getMode();
  if (mode === 'dark' || mode === 'light') return mode;
  const g = geo || cachedGeo() || DEFAULT_GEO;
  return autoThemeByGeo(g);
}

export function setMode(mode) {
  write(MODE_KEY, mode);
  switchThemeSmooth(resolveTheme());
  document.documentElement.dispatchEvent(new CustomEvent('themechange', { detail: mode }));
}

// 深浅色切换：不再让整页每个元素各自跑颜色过渡（安卓 WebView 会大面积重绘），
// 改用一层旧底色盖住 -> 瞬间换主题 -> 旧底色淡出，视觉上是交叉溶解。
let themeVeilTimer = 0;
function switchThemeSmooth(next) {
  const oldVeil = document.getElementById('themeVeil');
  if (oldVeil) oldVeil.remove();
  const oldBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    || (currentTheme() === 'dark' ? '#0a0a0b' : '#f6f6f7');
  const veil = document.createElement('div');
  veil.id = 'themeVeil';
  veil.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:200', 'pointer-events:none',
    `background:${oldBg}`, 'opacity:1', 'will-change:opacity',
    'transition:opacity 260ms cubic-bezier(.4,0,.2,1)',
  ].join(';');
  document.body.appendChild(veil);

  const root = document.documentElement;
  root.classList.add('theme-switching');
  applyTheme(next, false);

  // 等新主题落地一帧后再开始淡出；切换期间禁用全站 transition，避免重绘卡顿
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      veil.style.opacity = '0';
      root.classList.remove('theme-switching');
    });
  });
  clearTimeout(themeVeilTimer);
  themeVeilTimer = setTimeout(() => veil.remove(), 320);
}

// 启动：先按缓存/时间落一版，拿到定位后再校正；整个过程在启动页背后完成
export async function initTheme() {
  applyTheme(resolveTheme(), false);
  // 定位不挡启动：先用缓存/抚顺落色，拿到精确位置再静默校正
  requestGeo().then((geo) => {
    if (geo && getMode() === 'auto') applyTheme(resolveTheme(geo), false);
  }).catch(() => {});

  // 每 5 分钟校正一次（跨过日出/日落会自然切换）
  setInterval(() => {
    if (getMode() !== 'auto') return;
    applyTheme(resolveTheme(), false);
  }, 5 * 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getMode() === 'auto') applyTheme(resolveTheme(), false);
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  setMode(next);
  return next;
}
