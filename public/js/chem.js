// 化学实验装置图：按初高中考试插图风格画成 SVG 线稿
// 坐标系：每个仪器都以「底部中点」为原点向上画（y 为负），组合时用 translate 摆位。
import { LABO_SCENES } from './labo-scenes.js?v=10';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'currentColor';

function mk(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}

function line(p, x1, y1, x2, y2, o = {}) {
  p.appendChild(mk('line', {
    x1, y1, x2, y2,
    stroke: o.color || INK, 'stroke-width': o.w || 1.4,
    'stroke-linecap': 'round', 'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.9 : o.opacity,
  }));
}

function path(p, d, o = {}) {
  p.appendChild(mk('path', {
    d, fill: o.fill || 'none', stroke: o.stroke === null ? 'none' : (o.stroke || INK),
    'stroke-width': o.w || 1.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    'stroke-dasharray': o.dash || null, opacity: o.opacity == null ? 0.9 : o.opacity,
  }));
}

function rect(p, x, y, w, h, r = 0, o = {}) {
  p.appendChild(mk('rect', {
    x, y, width: w, height: h, rx: r,
    fill: o.fill || 'none', stroke: o.stroke === null ? 'none' : (o.stroke || INK),
    'stroke-width': o.w || 1.4, 'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.9 : o.opacity,
  }));
}

function circle(p, cx, cy, r, o = {}) {
  p.appendChild(mk('circle', {
    cx, cy, r, fill: o.fill || 'none',
    stroke: o.stroke === null ? 'none' : (o.stroke || INK),
    'stroke-width': o.w || 1.4, opacity: o.opacity == null ? 0.9 : o.opacity,
  }));
}

function ellipse(p, cx, cy, rx, ry, o = {}) {
  p.appendChild(mk('ellipse', {
    cx, cy, rx, ry, fill: o.fill || 'none',
    stroke: o.stroke === null ? 'none' : (o.stroke || INK),
    'stroke-width': o.w || 1.4, 'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.9 : o.opacity,
  }));
}

function poly(p, pts, o = {}) {
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${round(q[0])} ${round(q[1])}`).join(' ');
  path(p, d, o);
}

function round(v) { return Math.round(v * 100) / 100; }

// 图形里的文字也跟随字号档位。SVG 的 viewBox 不会自动响应 CSS 字号，
// 所以这里读一次 --fs-md，按比例放大/缩小字号；上限 1.22 倍，避免标注互相压住。
function uiTextScale() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--fs-md');
    const fs = parseFloat(raw) || 15;
    return Math.max(0.94, Math.min(1.22, fs / 15));
  } catch (_) { return 1; }
}

function txt(p, x, y, s, o = {}) {
  const raw = String(s == null ? '' : s);
  const cls = o.eq ? 'chem-eq'
    : (/[\u3400-\u9fff]/.test(raw) ? 'chem-lbl' : 'chem-formula');
  const scale = o.scale == null ? uiTextScale() : o.scale;
  const size = Math.max(5, Number(o.size || 9.5) * scale);
  const n = mk('text', {
    x, y, 'font-size': round(size), 'text-anchor': o.anchor || 'middle',
    fill: o.fill || INK, opacity: o.opacity == null ? 0.85 : o.opacity,
    class: cls,
    'font-family': 'inherit',
    'letter-spacing': o.letterSpacing == null ? null : o.letterSpacing,
    'word-spacing': o.wordSpacing == null ? null : o.wordSpacing,
    'textLength': o.textLength == null ? null : o.textLength,
    'lengthAdjust': o.textLength == null ? null : (o.lengthAdjust || 'spacingAndGlyphs'),
  });
  n.textContent = raw;
  p.appendChild(n);
}

// 带指向线的标注：考试卷里“仪器名/试剂名”指向具体位置
function callout(p, tx, ty, lx, ly, s, o = {}) {
  if (!s) return;
  line(p, tx, ty, lx, ly, { w: 0.8, dash: '2 2', opacity: 0.48 });
  circle(p, tx, ty, 1.5, { fill: INK, stroke: null, opacity: 0.65 });
  txt(p, lx + (o.anchor === 'end' ? -2 : 2), ly + 3, s, {
    size: o.size || 9, anchor: o.anchor || 'start', opacity: 0.78,
  });
}

// 液体：淡填充 + 液面线
function liquid(p, d, o = {}) {
  path(p, d, { fill: INK, opacity: o.alpha == null ? 0.13 : o.alpha, stroke: null });
  path(p, d, { w: o.w || 1.2, opacity: 0.75 });
}

// 统一摆位：x,y 是仪器底部中点，s 缩放，r 旋转角
function put(parent, x, y, s, r, fn) {
  const node = mk('g', { transform: `translate(${round(x)} ${round(y)}) rotate(${round(r || 0)}) scale(${round(s || 1)})` });
  parent.appendChild(node);
  fn(node);
  return node;
}

// 导气管：折点用圆角过渡，避免考试图里出现生硬的直角折线
function gasTube(p, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
  for (let i = 1; i < pts.length; i += 1) {
    const cur = pts[i];
    if (i === pts.length - 1) {
      d += ` L${round(cur[0])} ${round(cur[1])}`;
      continue;
    }
    const prev = pts[i - 1], next = pts[i + 1];
    const d1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const d2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.min(o.r || 9, d1 * 0.45, d2 * 0.45);
    const inx = cur[0] - ((cur[0] - prev[0]) / (d1 || 1)) * r;
    const iny = cur[1] - ((cur[1] - prev[1]) / (d1 || 1)) * r;
    const outx = cur[0] + ((next[0] - cur[0]) / (d2 || 1)) * r;
    const outy = cur[1] + ((next[1] - cur[1]) / (d2 || 1)) * r;
    d += ` L${round(inx)} ${round(iny)} Q${round(cur[0])} ${round(cur[1])} ${round(outx)} ${round(outy)}`;
  }
  path(p, d, { w: o.w || 1.35, opacity: o.opacity == null ? 0.9 : o.opacity });
}

// 预拼装场景：LaboBib 的仪器线稿已按坐标摆好，直接塞进 SVG。
// 这样装置本体不再靠临时几何拼，线条风格也更接近考试卷插图。
function laboScene(p, key) {
  const source = LABO_SCENES[key];
  if (!source) return false;
  // 四套气体制备都用试管夹持，先把铁架台画在底层
  if (key === 'o2_kmno4' || key === 'o2_h2o2' || key === 'co2' || key === 'h2') {
    put(p, 58, G, 1, 0, n => INS.stand(n, {
      h: 112,
      parts: [{ kind: 'clamp', dir: 'r', len: 38, y: -52 }],
    }));
  }
  const g = mk('g', { class: 'chem-labo' });
  try {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${NS}">${source}</svg>`, 'image/svg+xml',
    );
    let guard = 0;
    while (doc.documentElement.firstChild && guard < 200) {
      guard += 1;
      const child = doc.documentElement.firstChild;
      g.appendChild(document.importNode(child, true));
      // importNode 不会把节点从原文档移走，必须手动删，否则这里死循环
      doc.documentElement.removeChild(child);
    }
  } catch (_) {
    try { g.innerHTML = source; } catch (_) { return false; }
  }
  if (!g.firstChild) return false;
  p.appendChild(g);
  return true;
}

/* ---------- 仪器库（初高中实验插图里常见的那些） ---------- */
export const INS = {
  // 酒精灯
  lamp(p) {
    path(p, 'M-11 0 L-8 -15 L8 -15 L11 0 Z');
    line(p, -11.6, 0, 11.6, 0, { w: 1.7 });
    path(p, 'M-4 -15 L-3.4 -20 L3.4 -20 L4 -15');
    line(p, -0.6, -20, -0.6, -24, { w: 1.2 });
    path(p, 'M-0.6 -24 C-4.6 -27.8 -3.4 -32.8 0 -35.8 C3.4 -32.8 4.6 -27.8 0.6 -24 Z', { opacity: 0.85 });
    line(p, -9.2, -6, 9.2, -6, { dash: '2.6 2', opacity: 0.55, w: 1 });
  },
  // 烧杯
  beaker(p, o = {}) {
    const w = o.w || 12, h = o.h || 26, lv = o.level == null ? 0.45 : o.level;
    path(p, `M${-w} 0 L${-w} ${-h} L${w} ${-h} L${w} 0`);
    line(p, -w, -h, -w + 3, -h - 2.6, { w: 1.2 });
    line(p, w, -h, w - 3, -h - 2.6, { w: 1.2 });
    [0.4, 0.62, 0.84].forEach(k => line(p, w - 4.2, -h * k, w, -h * k, { w: 0.9, opacity: 0.6 }));
    if (lv > 0) liquid(p, `M${-w + 1.2} -0.8 L${-w + 1.2} ${-h * lv} L${w - 1.2} ${-h * lv} L${w - 1.2} -0.8 Z`);
  },
  // 试管（口在上，底在下）
  tube(p, o = {}) {
    const r = 3.9, h = o.h || 30, lv = o.level == null ? 0 : o.level;
    path(p, `M${-r} ${-h} L${-r} ${-r} A${r} ${r} 0 0 0 ${r} ${-r} L${r} ${-h}`);
    line(p, -r, -h, r, -h);
    if (lv > 0) {
      const top = -(h - 2) * lv - 2;
      liquid(p, `M${-r + 0.8} ${-r * 0.7} L${-r + 0.8} ${top} L${r - 0.8} ${top} L${r - 0.8} ${-r * 0.7} Z`);
    }
  },
  // 试管夹
  clip(p) {
    path(p, 'M-14 0 L14 0', { w: 2.2 });
    path(p, 'M-2 -5 L-2 5 M2 -5 L2 5', { w: 1.6 });
  },
  // 铁架台：parts = [{kind:'clamp'|'ring', dir:'l'|'r', len, y}]
  stand(p, o = {}) {
    const H = o.h || 96;
    path(p, 'M-24 0 L24 0 L24 -3.4 L-24 -3.4 Z', { w: 1.3 });
    rect(p, -2.2, -H, 4.4, H - 3.4, 0, { fill: INK, opacity: 0.16, w: 1.2 });
    (o.parts || []).forEach(pt => {
      const y = pt.y == null ? -H * 0.6 : pt.y;
      const dir = pt.dir === 'l' ? -1 : 1;
      const len = pt.len || 26;
      if (pt.kind === 'ring') {
        ellipse(p, dir * (4 + len), y, Math.max(6, len * 0.6), 3.4);
        line(p, dir * 2.2, y, dir * (4 + len * 0.4), y, { w: 1.5 });
      } else {
        line(p, dir * 2.2, y, dir * len, y, { w: 1.7 });
        path(p, `M${dir * len} ${y - 4.6} L${dir * (len + 5)} ${y - 4.6} L${dir * (len + 5)} ${y + 4.6} L${dir * len} ${y + 4.6}`, { w: 1.2 });
      }
    });
  },
  // 托盘天平
  balance(p) {
    path(p, 'M-19 0 L19 0 L19 -3 L-19 -3 Z', { w: 1.3 });
    rect(p, -3, -34, 6, 31, 1, { fill: INK, opacity: 0.14 });
    line(p, 0, -34, 0, -45, { w: 1.4 });
    line(p, -25, -45, 25, -45, { w: 1.6 });
    line(p, 0, -44, 0, -36, { w: 1.1 });
    [-1, 1].forEach(d => {
      line(p, d * 25, -45, d * 25, -32, { w: 1.1 });
      path(p, `M${d * 25 - 9} -32 Q${d * 25} -26.4 ${d * 25 + 9} -32`, { w: 1.2 });
    });
  },
  // 普通漏斗
  funnel(p, o = {}) {
    const bw = o.w || 12, bh = o.h || 15, st = o.stem || 11;
    path(p, `M${-bw} ${-(bh + st)} L-1.7 ${-st} L-1.7 0 L1.7 0 L1.7 ${-st} L${bw} ${-(bh + st)}`);
    line(p, -bw, -(bh + st), bw, -(bh + st), { w: 1.2 });
    if (o.filter) path(p, `M${-bw + 2.4} ${-(bh + st) + 2} L-2.2 ${-st - 1.4} L2.2 ${-st - 1.4} L${bw - 2.4} ${-(bh + st) + 2}`, { dash: '3 2', opacity: 0.65, w: 1.1 });
  },
  // 长颈漏斗
  thistle(p, o = {}) {
    const st = o.stem || 34, bw = o.w || 8;
    path(p, `M${-bw} ${-(st + 10)} L-1.7 ${-st} L-1.7 0 L1.7 0 L1.7 ${-st} L${bw} ${-(st + 10)}`);
    line(p, -bw, -(st + 10), bw, -(st + 10), { w: 1.2 });
  },
  // 蒸发皿
  evap(p) {
    path(p, 'M-15 -8 Q0 9 15 -8');
    line(p, -16.6, -9.6, -12.6, -7.4, { w: 1.2 });
    line(p, 16.6, -9.6, 12.6, -7.4, { w: 1.2 });
    path(p, 'M-12.8 -6.6 Q0 6.6 12.8 -6.6', { fill: INK, opacity: 0.1, stroke: null });
  },
  // 玻璃棒
  rod(p, o = {}) {
    const l = o.l || 46, a = (o.a == null ? -28 : o.a) * Math.PI / 180;
    line(p, 0, 0, Math.cos(a) * l, Math.sin(a) * l, { w: 2.2 });
  },
  // 量筒
  cylinder(p, o = {}) {
    const h = o.h || 46, w = o.w || 7, lv = o.level == null ? 0.5 : o.level;
    path(p, `M${-w} -3 L${-w} ${-h} L${w} ${-h} L${w} -3`);
    path(p, `M${-w - 4.4} 0 Q0 3 ${w + 4.4} 0`, { w: 1.4 });
    path(p, `M${-w} -3 Q0 2 ${w} -3`, { w: 1.1 });
    for (let k = 0.2; k < 0.95; k += 0.2) line(p, w - 3.6, -h * k, w, -h * k, { w: 0.9, opacity: 0.6 });
    if (lv > 0) liquid(p, `M${-w + 1} -3 L${-w + 1} ${-h * lv} L${w - 1} ${-h * lv} L${w - 1} -3 Z`);
  },
  // 集气瓶
  gasJar(p, o = {}) {
    const w = o.w || 10, h = o.h || 24;
    path(p, `M${-w} 0 L${-w} ${-h} L-4.2 ${-h} L-4.2 ${-h - 2.8} L4.2 ${-h - 2.8} L4.2 ${-h} L${w} ${-h} L${w} 0`);
    if (o.water) path(p, `M${-w + 1} -1 L${-w + 1} ${-h * 0.5} L${w - 1} ${-h * 0.5} L${w - 1} -1 Z`, { fill: INK, opacity: 0.12, stroke: null });
    if (o.plate) line(p, -w - 2.6, -h - 3.6, w + 2.6, -h - 3.6, { w: 1.6 });
  },
  // 水槽
  basin(p, o = {}) {
    const w = o.w || 34, h = o.h || 15;
    path(p, `M${-w} ${-h} L${w} ${-h} L${w - 3.4} 0 L${-w + 3.4} 0 Z`);
    path(p, `M${-w + 1} ${-h + 3.4} L${w - 1} ${-h + 3.4} L${w - 3} -0.8 L${-w + 3} -0.8 Z`, { fill: INK, opacity: 0.11, stroke: null });
    line(p, -w + 1, -h + 3.4, w - 1, -h + 3.4, { w: 1, opacity: 0.55 });
  },
  // 锥形瓶
  conical(p, o = {}) {
    const h = o.h || 34, lv = o.level == null ? 0.35 : o.level;
    path(p, `M-3.4 ${-h} L-3.4 ${-h + 9} L-14 0 L14 0 L3.4 ${-h + 9} L3.4 ${-h}`);
    line(p, -3.4, -h, 3.4, -h);
    if (lv > 0) {
      const yl = -(h - 9) * lv;
      const wl = 14 * (1 - (h - 9 + yl) / (h - 9));
      path(p, `M-14 -0.8 L14 -0.8 L${wl} ${yl} L${-wl} ${yl} Z`, { fill: INK, opacity: 0.11, stroke: null });
    }
  },
  // 圆底烧瓶
  roundFlask(p, o = {}) {
    const r = o.r || 13, neck = o.neck || 15;
    circle(p, 0, -r - 1.5, r);
    path(p, `M-3.2 ${-2 * r - 1.5} L-3.2 ${-2 * r - 1.5 - neck} L3.2 ${-2 * r - 1.5 - neck} L3.2 ${-2 * r - 1.5}`);
  },
  // 温度计
  thermo(p, o = {}) {
    const h = o.h || 42;
    rect(p, -2, -h, 4, h - 5, 2);
    circle(p, 0, -3.2, 3.6, { fill: INK, opacity: 0.16 });
    line(p, 0, -5.4, 0, -h + 4, { w: 1.1, opacity: 0.7 });
  },
  // 胶头滴管
  dropper(p, o = {}) {
    const h = o.h || 26;
    ellipse(p, 0, -h, 4.4, 5.6);
    path(p, `M-2 ${-h + 5.2} L-1.4 0 L1.4 0 L2 ${-h + 5.2}`);
  },
  // 药匙
  spoon(p) {
    line(p, 0, 0, 13, -8); 
    ellipse(p, 15.5, -9, 4.8, 2.8);
  },
  // 冷凝管
  condenser(p, o = {}) {
    const L2 = o.l || 58;
    rect(p, 0, -9, L2, 18, 4);
    line(p, 0, -3.4, L2, -3.4, { w: 1 });
    line(p, 0, 3.4, L2, 3.4, { w: 1 });
    line(p, -6, 0, 0, 0, { w: 1.4 });
    line(p, L2, 0, L2 + 6, 0, { w: 1.4 });
    line(p, 14, -9, 14, -15, { w: 1.2 });
    line(p, L2 - 14, 9, L2 - 14, 15, { w: 1.2 });
  },
  // 滴定管
  burette(p, o = {}) {
    const h = o.h || 62;
    rect(p, -2.6, -h, 5.2, h - 16, 1);
    for (let k = 0.15; k < 0.85; k += 0.14) line(p, -2.6, -h + h * k, -0.6, -h + h * k, { w: 0.8, opacity: 0.55 });
    path(p, 'M-2.6 -16 L-4.6 -14 L-4.6 -10 L2.6 -10 L2.6 -14');
    line(p, -5, -12, 5, -12, { w: 1.1 });
    path(p, 'M-1.2 -10 L-0.7 0 L0.7 0 L1.2 -10');
  },
  // 硬质玻璃管（两端开口）
  hardTube(p, o = {}) {
    const w = o.w || 46;
    rect(p, -w / 2, -7.6, w, 15.2, 7.6);
  },
  // 橡皮塞
  stopper(p, o = {}) {
    const w = o.w || 4.6;
    path(p, `M${-w} 0 L${-w + 1} -5 L${w - 1} -5 L${w} 0 Z`);
  },
  // 铁圈+石棉网
  net(p, o = {}) {
    const w = o.w || 22;
    rect(p, -w, -3, w * 2, 3.2, 1);
    line(p, -w, -3, w, -3, { w: 1.4 });
  },
  // 洗气瓶：长进短出，除杂/干燥常用
  washBottle(p, o = {}) {
    const w = o.w || 12, h = o.h || 28, lv = o.level == null ? 0.5 : o.level;
    path(p, `M${-w} 0 L${-w} ${-h} L${w} ${-h} L${w} 0`);
    line(p, -w, -h, -4.4, -h - 3.2, { w: 1.2 });
    line(p, w, -h, 4.4, -h - 3.2, { w: 1.2 });
    if (lv > 0) liquid(p, `M${-w + 1.2} -0.8 L${-w + 1.2} ${-h * lv} L${w - 1.2} ${-h * lv} L${w - 1.2} -0.8 Z`);
    // 长导管伸入液面下，短导管只到瓶口
    line(p, -6, -h - 8, -6, -h * lv + 3, { w: 1.2 });
    line(p, -6, -h - 8, -12, -h - 8, { w: 1.2 });
    line(p, 6, -h - 8, 6, -h - 4, { w: 1.2 });
    line(p, 6, -h - 8, 12, -h - 8, { w: 1.2 });
    line(p, -w, -h + 2, w, -h + 2, { w: 1 });
  },
  // 干燥管（球形/直形都兼容）
  dryingTube(p, o = {}) {
    const l = o.l || 34;
    if (o.u) {
      path(p, `M-18 0 L-18 -30 Q-18 -38 0 -38 Q18 -38 18 -30 L18 0`);
      for (let i = -12; i <= 12; i += 6) circle(p, i, -32, 1.1, { fill: INK, stroke: null, opacity: 0.5 });
      line(p, -18, 0, -18, 8, { w: 1.2 });
      line(p, 18, 0, 18, 8, { w: 1.2 });
    } else {
      rect(p, -l / 2, -10, l, 20, 9);
      for (let i = -l / 2 + 5; i < l / 2; i += 7) circle(p, i, 0, 1.2, { fill: INK, stroke: null, opacity: 0.5 });
      line(p, -l / 2, 0, -l / 2 - 8, 0, { w: 1.2 });
      line(p, l / 2, 0, l / 2 + 8, 0, { w: 1.2 });
    }
  },
  // U 形管
  uTube(p, o = {}) {
    INS.dryingTube(p, Object.assign({}, o, { u: true }));
  },
  // 广口瓶
  wideMouth(p, o = {}) {
    const w = o.w || 12, h = o.h || 24;
    path(p, `M${-w} 0 L${-w} ${-h + 3} L${-w + 3} ${-h} L${w - 3} ${-h} L${w} ${-h + 3} L${w} 0`);
    line(p, -w + 3, -h, w - 3, -h, { w: 1.3 });
  },
  // 坩埚
  crucible(p, o = {}) {
    const w = o.w || 12;
    path(p, `M${-w} -18 L${-w + 2} 0 L${w - 2} 0 L${w} -18 Z`);
    line(p, -w - 2, -18, w + 2, -18, { w: 1.6 });
  },
  // 研钵 + 研杵
  mortar(p, o = {}) {
    const w = o.w || 14;
    path(p, `M${-w} -12 Q0 6 ${w} -12 Z`);
    path(p, `M${-w} -12 L${-w + 2} -16 L${w - 2} -16 L${w} -12`);
    line(p, 5, -18, 13, -30, { w: 2.4 });
  },
  // 试管架
  rack(p, o = {}) {
    const w = o.w || 30;
    line(p, -w, 0, w, 0, { w: 1.6 });
    line(p, -w, -18, w, -18, { w: 1.6 });
    line(p, -w + 4, 0, -w + 4, -30, { w: 1.4 });
    line(p, w - 4, 0, w - 4, -30, { w: 1.4 });
    for (let x = -w + 10; x <= w - 10; x += 10) circle(p, x, -18, 2.2, { w: 1 });
  },
  // 坩埚钳
  tongs(p, o = {}) {
    const l = o.l || 34;
    path(p, `M-6 0 L${l} -${l * 0.5} M6 0 L${l} ${l * 0.5}`, { w: 1.8 });
  },
  // 表面皿
  watchGlass(p, o = {}) {
    const w = o.w || 14;
    path(p, `M${-w} 0 Q0 8 ${w} 0`);
  },
  // 分液漏斗
  separatory(p, o = {}) {
    const h = o.h || 30;
    path(p, `M-10 ${-h} L-2 ${-h + 10} L-2 0 L2 0 L2 ${-h + 10} L10 ${-h}`);
    line(p, -10, -h, 10, -h, { w: 1.3 });
    path(p, 'M-3 -2 L-5 0 L5 0 L3 -2', { w: 1.1 });
    line(p, -7, -1, 7, -1, { w: 1.2 });
  },
};

/* ---------- 装置图场景 ---------- */
const G = 200; // 桌面基线

function floorLine(p, w) {
  line(p, 8, G + 1, w - 8, G + 1, { w: 1.2, opacity: 0.5, dash: '1 3' });
}

// 铁架台的夹子夹住试管：arm 从立柱伸向试管
function clampTube(p, x, y, rot, standX) {
  put(p, x, y, 1, rot, n => INS.tube(n, { level: 0.45 }));
  const armY = y - 8;
  const dir = standX > x ? 'r' : 'l';
  const len = Math.abs(standX - x) - 6;
  put(p, standX, G, 1, 0, n => INS.stand(n, { h: G - armY + 20, parts: [{ kind: 'clamp', dir, len: Math.max(12, len), y: -(G - armY) }] }));
}

const SCENES = {
  // 加热高锰酸钾制氧气（排水法收集）
  o2_kmno4(p, w) {
    floorLine(p, w);
    if (laboScene(p, 'o2_kmno4')) return;
    put(p, 225, G, 1, 0, n => INS.basin(n, { w: 34, h: 15 }));
    // 倒扣在水槽里的集气瓶
    put(p, 225, 171, 1, 180, n => INS.gasJar(n, { w: 10, h: 24 }));
    path(p, 'M216 189 L234 189 L234 196.6 L216 196.6 Z', { fill: INK, opacity: 0.12, stroke: null });
    // 试管（口略向下倾斜）+ 铁架台 + 酒精灯
    put(p, 100, 158, 1, 104, n => INS.tube(n, { h: 32 }));
    put(p, 96, G, 1, 0, n => INS.lamp(n));
    // 铁架台放左侧，夹住试管底部；导气管从右侧引出，不再穿过立柱
    put(p, 60, G, 1, 0, n => INS.stand(n, { h: 104, parts: [{ kind: 'clamp', dir: 'r', len: 40, y: -42 }] }));
    // 单孔塞 + 导管
    line(p, 122, 162, 127, 168, { w: 3.4 });
    gasTube(p, [[127, 166], [141, 154], [151, 164], [151, 184], [215, 184], [215, 194], [225, 194]], { r: 8 });
    line(p, 225, 190, 225, 194, { w: 1.2, opacity: 0.7 });
  },
  // 过氧化氢分解制氧气（向上排空气）
  o2_h2o2(p, w) {
    floorLine(p, w);
    if (laboScene(p, 'o2_h2o2')) return;
    put(p, 118, G, 1, 0, n => INS.conical(n, { h: 34, level: 0.32 }));
    put(p, 118, 166, 1, 0, n => INS.stopper(n, { w: 4.8 }));
    put(p, 112, 194, 1, 0, n => INS.thistle(n, { stem: 34, w: 8 }));
    put(p, 126, 168, 1, 0, n => INS.stopper(n, { w: 2.8 }));
    gasTube(p, [[127, 166], [143, 150], [158, 150], [215, 150], [215, 194]], { r: 9 });
    put(p, 215, G, 1, 0, n => INS.gasJar(n, { w: 11, h: 25, plate: true }));
  },
  // 大理石与稀盐酸制二氧化碳（向上排空气）
  co2(p, w) {
    floorLine(p, w);
    if (laboScene(p, 'co2')) return;
    put(p, 118, G, 1, 0, n => INS.conical(n, { h: 34, level: 0.3 }));
    put(p, 118, 166, 1, 0, n => INS.stopper(n, { w: 4.8 }));
    put(p, 112, 194, 1, 0, n => INS.thistle(n, { stem: 34, w: 8 }));
    put(p, 126, 168, 1, 0, n => INS.stopper(n, { w: 2.8 }));
    gasTube(p, [[127, 166], [143, 150], [158, 150], [215, 150], [215, 194]], { r: 9 });
    put(p, 215, G, 1, 0, n => INS.gasJar(n, { w: 11, h: 25, plate: true }));
  },
  // 锌粒与稀硫酸制氢气（向下排空气）
  h2(p, w) {
    floorLine(p, w);
    if (laboScene(p, 'h2')) return;
    put(p, 118, G, 1, 0, n => INS.conical(n, { h: 34, level: 0.3 }));
    put(p, 118, 166, 1, 0, n => INS.stopper(n, { w: 4.8 }));
    put(p, 112, 194, 1, 0, n => INS.thistle(n, { stem: 34, w: 8 }));
    put(p, 126, 168, 1, 0, n => INS.stopper(n, { w: 2.8 }));
    put(p, 215, 166, 1, 180, n => INS.gasJar(n, { w: 11, h: 25 }));
    gasTube(p, [[127, 166], [143, 150], [158, 150], [210, 150], [210, 186], [215, 186]], { r: 9 });
  },
  // 过滤
  filtration(p, w) {
    floorLine(p, w);
    put(p, 150, G, 1, 0, n => INS.stand(n, { h: 108, parts: [{ kind: 'ring', dir: 'r', len: 22, y: -39 }] }));
    put(p, 176, 172, 1, 0, n => INS.funnel(n, { w: 12, h: 15, stem: 11, filter: true }));
    put(p, 176, G, 1, 0, n => INS.beaker(n, { w: 12, h: 24, level: 0.25 }));
    put(p, 234, 176, 0.82, -52, n => INS.beaker(n, { w: 12, h: 22, level: 0.5 }));
    line(p, 226, 154, 190, 145, { w: 2.1 });
    line(p, 190, 145, 183, 152, { w: 2.1 });
  },
  // 蒸发结晶
  evaporation(p, w) {
    floorLine(p, w);
    put(p, 150, G, 1, 0, n => INS.stand(n, { h: 108, parts: [{ kind: 'ring', dir: 'r', len: 20, y: -42 }] }));
    put(p, 174, 158, 1, 0, n => INS.evap(n));
    put(p, 174, G, 1, 0, n => INS.lamp(n));
    line(p, 199, 143, 172, 157, { w: 2.1 });
  },
  // 蒸馏
  distillation(p, w) {
    floorLine(p, w);
    put(p, 84, G, 1, 0, n => INS.stand(n, { h: 96, parts: [{ kind: 'ring', dir: 'r', len: 20, y: -30 }] }));
    put(p, 108, 170, 1, 0, n => INS.roundFlask(n, { r: 14, neck: 14 }));
    put(p, 108, G, 1, 0, n => INS.lamp(n));
    // 温度计：水银球要伸到支管口
    put(p, 108, 127, 1, 0, n => INS.thermo(n, { h: 44 }));
    // 支管 + 冷凝管
    poly(p, [[111, 134], [146, 146]]);
    put(p, 146, 146, 1, 0, n => INS.condenser(n, { l: 96 }));
    poly(p, [[248, 146], [262, 146], [262, 176]]);
    put(p, 262, G, 1, 0, n => INS.conical(n, { h: 30, level: 0.3 }));
    put(p, 108, 127, 1, 0, n => INS.stopper(n, { w: 4.6 }));
  },
  // 托盘天平称量
  weighing(p, w) {
    floorLine(p, w);
    put(p, 150, G, 1, 0, n => INS.balance(n));
    rect(p, 150 - 33, 160, 12, 8, 1);
    line(p, 150 - 27, 158, 150 - 27, 164, { w: 1, opacity: 0.6 });
    path(p, 'M167 158 L183 158 L185 166 L165 166 Z', { w: 1.2 });
    put(p, 196, 172, 1, -160, n => INS.spoon(n));
  },
  // 量筒量取液体（读数）
  measure(p, w) {
    floorLine(p, w);
    put(p, 168, G, 1, 0, n => INS.cylinder(n, { h: 54, w: 8, level: 0.55 }));
    const ly = G - 54 * 0.55;
    line(p, 168, ly, 262, ly, { dash: '4 3', opacity: 0.6, w: 1 });
    ellipse(p, 276, ly - 6, 13, 8);
    circle(p, 276, ly - 6, 3.6, { fill: INK, opacity: 0.2 });
    line(p, 296, ly - 6, 310, ly - 6, { w: 1.2, opacity: 0.7 });
    txt(p, 276, ly + 16, '视线与凹液面最低处相平', { size: 9, opacity: 0.7 });
  },
  // 试管加热液体
  heat_liquid(p, w) {
    floorLine(p, w);
    put(p, 152, 160, 1, -34, n => INS.tube(n, { h: 32, level: 0.42 }));
    put(p, 182, G, 1, 0, n => INS.stand(n, { h: 96, parts: [{ kind: 'clamp', dir: 'l', len: 14, y: -48 }] }));
    put(p, 150, G, 1, 0, n => INS.lamp(n));
  },
  // 向上排空气法
  gas_up(p, w) {
    floorLine(p, w);
    put(p, 220, G, 1, 0, n => INS.gasJar(n, { w: 12, h: 28, plate: true }));
    gasTube(p, [[140, 120], [140, 140], [220, 140], [220, 194]], { r: 9 });
    circle(p, 140, 116, 5.4);
  },
  // 向下排空气法
  gas_down(p, w) {
    floorLine(p, w);
    put(p, 220, 168, 1, 180, n => INS.gasJar(n, { w: 12, h: 28 }));
    gasTube(p, [[140, 120], [140, 140], [198, 140], [198, 198], [220, 198], [220, 190]], { r: 9 });
    circle(p, 140, 116, 5.4);
  },
  // 酸碱中和滴定
  titration(p, w) {
    floorLine(p, w);
    put(p, 120, G, 1, 0, n => INS.stand(n, { h: 104, parts: [{ kind: 'clamp', dir: 'r', len: 44, y: -64 }] }));
    put(p, 166, 166, 1, 0, n => INS.burette(n, { h: 62 }));
    put(p, 166, G, 1, 0, n => INS.conical(n, { h: 32, level: 0.3 }));
  },
  // 配制一定溶质质量分数的溶液
  solution(p, w) {
    floorLine(p, w);
    put(p, 118, G, 1, 0, n => INS.beaker(n, { w: 14, h: 26, level: 0.4 }));
    line(p, 114, 186, 152, 148, { w: 2.1 });
    put(p, 200, G, 1, 0, n => INS.cylinder(n, { h: 48, w: 7, level: 0.6 }));
    put(p, 250, G, 1, 0, n => INS.balance(n));
  },
  // 氢气（或一氧化碳）还原氧化铜
  reduce_cuo(p, w) {
    floorLine(p, w);
    put(p, 180, 150, 1, 0, n => INS.hardTube(n, { w: 92 }));
    put(p, 180, G, 1, 0, n => INS.lamp(n));
    put(p, 120, G, 1, 0, n => INS.stand(n, { h: 76, parts: [{ kind: 'clamp', dir: 'r', len: 20, y: -50 }] }));
    // 氢气从硬质玻璃管左端进入；绕到铁架台上方，避免导管穿过立柱
    poly(p, [[134, 150], [134, 120], [70, 120], [70, 184]]);
    txt(p, 62, 140, 'H₂', { size: 11, opacity: 0.75 });
    poly(p, [[226, 150], [286, 150], [286, 190]]);
    put(p, 286, G, 1, 0, n => INS.beaker(n, { w: 10, h: 18, level: 0.3 }));
  },
  // 多试管实验：试管架上一排试管，可指定加热其中一支
  multi_tube(p, w, spec) {
    floorLine(p, w);
    const n = Math.max(3, Math.min(5, Number(spec.count) || 4));
    const left = 78, right = w - 78;
    put(p, w / 2, G, 1, 0, n => INS.rack(n, { w: (right - left) / 2 + 8 }));
    const labels = Array.isArray(spec.labels) ? spec.labels : [];
    for (let i = 0; i < n; i++) {
      const x = left + (right - left) * (n === 1 ? 0.5 : i / (n - 1));
      const lv = Array.isArray(spec.levels) ? Number(spec.levels[i]) : 0.42;
      put(p, x, G - 10, 0.88, 0, n2 => INS.tube(n2, { h: 30, level: Number.isFinite(lv) ? lv : 0.42 }));
      txt(p, x, G + 15, labels[i] || `${i + 1}`, { size: 9.5, opacity: 0.7 });
      if (Number(spec.heat) === i) put(p, x, G, 0.9, 0, n2 => INS.lamp(n2));
    }
  },
  // 圆底烧瓶装置：铁架台 + 石棉网 + 酒精灯 + 可选冷凝管
  flask(p, w, spec) {
    floorLine(p, w);
    put(p, 126, G, 1, 0, n => INS.stand(n, { h: 104, parts: [{ kind: 'ring', dir: 'r', len: 24, y: -6 }] }));
    put(p, 150, G - 5, 1.15, 0, n => INS.roundFlask(n, { r: 15, neck: 14 }));
    put(p, 150, G, 0.9, 0, n => INS.lamp(n));
    put(p, 150, G - 48, 1, 0, n => INS.stopper(n, { w: 4.8 }));
    if (spec.reflux === true) {
      poly(p, [[156, G - 66], [182, G - 78], [182, G - 46], [214, G - 46]]);
      put(p, 214, G - 46, 0.9, 0, n => INS.condenser(n, { l: 56 }));
    }
  },
  // 复杂除杂：洗气瓶 → 洗气瓶 → 干燥管 → 收集
  purify(p, w, spec) {
    floorLine(p, w);
    const xs = [68, 154, 244, 318];
    put(p, xs[0], G, 0.9, 0, n => INS.washBottle(n, { w: 12, h: 28, level: 0.55 }));
    put(p, xs[1], G, 0.9, 0, n => INS.washBottle(n, { w: 12, h: 28, level: 0.55 }));
    put(p, xs[2], G - 8, 0.9, 0, n => INS.dryingTube(n, { l: 30 }));
    put(p, xs[3], G, 0.85, 0, n => INS.gasJar(n, { w: 10, h: 24, plate: true }));
    // 长进短出：每级从上一级短导管接到下一级长导管
    poly(p, [[20, G - 108], [20, G - 124], [62, G - 124], [62, G - 34]]);
    poly(p, [[74, G - 34], [80, G - 34], [148, G - 34]]);
    // 干燥管两端有侧管，管子要接到侧管口，不能插进管身
    poly(p, [[159, G - 34], [190, G - 34], [210, G - 18], [223.3, G - 8]]);
    poly(p, [[264.7, G - 8], [286, G - 8], [286, G - 28], [318, G - 28], [318, G - 12]]);
    txt(p, xs[0], G - 48, spec.step1 || 'NaOH溶液', { size: 9.5, opacity: 0.7 });
    txt(p, xs[1], G - 48, spec.step2 || '浓H₂SO₄', { size: 9.5, opacity: 0.7 });
    txt(p, xs[2], G - 30, spec.step3 || '干燥剂', { size: 9.5, opacity: 0.7 });
    txt(p, xs[3], G - 42, spec.step4 || '收集', { size: 9.5, opacity: 0.7 });
  },
  // 焰色试验：铂丝蘸取溶液，酒精灯外焰灼烧
  flame_test(p, w, spec) {
    floorLine(p, w);
    put(p, 118, G, 1.1, 0, n => INS.lamp(n));
    // 有色火焰（画在灯焰位置）
    const ion = String(spec.ion || '');
    const hint = String(spec.color || spec.flame || (/(钾|K)/i.test(ion) ? '紫色' : /(铜|Cu)/i.test(ion) ? '绿色' : /(钙|Ca)/i.test(ion) ? '砖红色' : '黄色')).trim();
    const color = hint.startsWith('#') ? hint
      : /紫/.test(hint) ? '#8e44ad'
      : /绿/.test(hint) ? '#2ecc71'
      : /蓝/.test(hint) ? '#3498db'
      : /砖红|红/.test(hint) ? '#c0392b'
      : '#f1c40f';
    const flameName = color === '#8e44ad' ? '紫色' : color === '#2ecc71' ? '绿色'
      : color === '#3498db' ? '蓝色' : color === '#c0392b' ? '砖红色' : '黄色';
    path(p, 'M112 166 C102 158 104 146 118 132 C130 146 132 158 124 166 Z', { fill: color, opacity: 0.55, stroke: color });
    path(p, 'M114 166 C108 160 110 152 118 142 C126 152 128 160 122 166 Z', { fill: color, opacity: 0.35, stroke: null });
    // 铂丝：从右侧夹持，丝端伸进外焰
    line(p, 230, 132, 144, 150, { w: 1.8 });
    circle(p, 144, 150, 2.2, { fill: INK, stroke: null, opacity: 0.7 });
    // 表面皿与待测溶液
    put(p, 254, G, 0.9, 0, n => INS.watchGlass(n, { w: 16 }));
    path(p, 'M240 195 Q254 202 268 195 L266 199 Q254 204 242 199 Z', { fill: INK, opacity: 0.14, stroke: null });
    txt(p, 118, 124, spec.ion || 'Na⁺', { size: 11, opacity: 0.8 });
    txt(p, 118, 136, spec.flame || flameName, { size: 9.5, opacity: 0.7 });
  },
  // 电解：U 形管 + 两支电极 + 直流电源
  electrolysis(p, w, spec) {
    floorLine(p, w);
    const cx = w / 2;
    path(p, `M${cx - 62} ${G - 92} L${cx - 62} ${G - 28} Q${cx - 62} ${G - 6} ${cx} ${G - 6} Q${cx + 62} ${G - 6} ${cx + 62} ${G - 28} L${cx + 62} ${G - 92}`, { w: 1.8 });
    line(p, cx - 68, G - 92, cx - 56, G - 92, { w: 1.6 });
    line(p, cx + 56, G - 92, cx + 68, G - 92, { w: 1.6 });
    // 电极
    line(p, cx - 40, G - 92, cx - 40, G - 40, { w: 2.4 });
    line(p, cx + 40, G - 92, cx + 40, G - 40, { w: 2.4 });
    // 电源
    rect(p, cx - 34, G - 128, 68, 24, 2, { w: 1.4 });
    txt(p, cx, G - 112, spec.E || '直流电源', { size: 9.5 });
    line(p, cx - 40, G - 92, cx - 40, G - 104, { w: 1.4 });
    line(p, cx + 40, G - 92, cx + 40, G - 104, { w: 1.4 });
    line(p, cx - 40, G - 104, cx - 34, G - 104, { w: 1.4 });
    line(p, cx + 34, G - 104, cx + 40, G - 104, { w: 1.4 });
    // 气泡
    for (let i = 0; i < 7; i++) {
      const bx = cx - 48 + (i % 3) * 8, by = G - 50 - Math.floor(i / 3) * 9;
      circle(p, bx, by, 1.5, { w: 0.9, opacity: 0.55 });
    }
    txt(p, cx - 40, G - 32, spec.left || '阴极', { size: 9.5, opacity: 0.7 });
    txt(p, cx + 40, G - 32, spec.right || '阳极', { size: 9.5, opacity: 0.7 });
  },
  // 喷泉实验：倒置烧瓶 + 导管伸入水中，形成喷泉
  fountain(p, w, spec) {
    floorLine(p, w);
    const cx = w / 2;
    put(p, cx, G, 1, 0, n => INS.beaker(n, { w: 26, h: 30, level: 0.58 }));
    // 倒置圆底烧瓶
    path(p, `M${cx - 34} 112 A34,34 0 1,1 ${cx + 34} 112 L${cx + 8} 150 L${cx + 8} 164 L${cx - 8} 164 L${cx - 8} 150 Z`);
    line(p, cx, 164, cx, G - 10, { w: 1.5 });
    line(p, cx - 5, G - 16, cx + 5, G - 16, { w: 1.2 });
    // 瓶内液面与喷泉
    path(p, `M${cx - 30} 120 Q${cx} 132 ${cx + 30} 120 L${cx + 30} 126 Q${cx} 140 ${cx - 30} 126 Z`, { fill: 'var(--accent, #5B8DEF)', opacity: 0.16, stroke: 'none' });
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.36;
      line(p, cx, 142, cx + Math.cos(a) * 22, 142 - Math.abs(Math.sin(a)) * 30, { w: 1, color: 'var(--accent, #5B8DEF)', opacity: 0.5 });
    }
    txt(p, cx, 92, spec.gas || 'NH₃', { size: 11, opacity: 0.8 });
    txt(p, cx + 54, G - 28, spec.liquid || '水', { size: 9.5, opacity: 0.7 });
  },
  // 银镜反应：试管内壁附着一层银，放在温水中水浴
  silver_mirror(p, w, spec) {
    floorLine(p, w);
    const cx = w / 2;
    put(p, cx, G, 1, 0, n => INS.beaker(n, { w: 26, h: 30, level: 0.5 }));
    put(p, cx, G - 8, 1, 0, n => INS.tube(n, { h: 46, level: 0.55 }));
    // 内壁银层
    path(p, `M${cx - 5} ${G - 48} L${cx - 5} ${G - 12} L${cx + 5} ${G - 12} L${cx + 5} ${G - 48}`, { stroke: '#b8b8b8', w: 2.2, opacity: 0.85 });
    txt(p, cx, G - 58, spec.note || '试管内壁出现银镜', { size: 9.5, opacity: 0.75 });
  },
};

/* ---------- 仪器图鉴（一排仪器 + 名称） ---------- */
const GALLERY_ORDER = ['lamp', 'beaker', 'tube', 'conical', 'cylinder', 'gasJar', 'basin',
  'funnel', 'thistle', 'evap', 'rod', 'balance', 'stand', 'roundFlask', 'thermo', 'dropper', 'spoon', 'condenser', 'burette',
  'washBottle', 'dryingTube', 'uTube', 'wideMouth', 'crucible', 'mortar', 'rack', 'tongs', 'watchGlass', 'separatory'];

const GALLERY_ALIAS = {
  '酒精灯': 'lamp', '烧杯': 'beaker', '试管': 'tube', '锥形瓶': 'conical', '量筒': 'cylinder',
  '集气瓶': 'gasJar', '水槽': 'basin', '漏斗': 'funnel', '长颈漏斗': 'thistle', '蒸发皿': 'evap',
  '玻璃棒': 'rod', '天平': 'balance', '托盘天平': 'balance', '铁架台': 'stand', '圆底烧瓶': 'roundFlask',
  '温度计': 'thermo', '胶头滴管': 'dropper', '药匙': 'spoon', '冷凝管': 'condenser', '滴定管': 'burette',
  '导气管': 'pipe',
  '洗气瓶': 'washBottle', '干燥管': 'dryingTube', 'U形管': 'uTube', 'U 形管': 'uTube',
  '广口瓶': 'wideMouth', '坩埚': 'crucible', '研钵': 'mortar', '试管架': 'rack',
  '坩埚钳': 'tongs', '表面皿': 'watchGlass', '分液漏斗': 'separatory',
};

const NAMES = {
  lamp: '酒精灯', beaker: '烧杯', tube: '试管', conical: '锥形瓶', cylinder: '量筒', gasJar: '集气瓶',
  basin: '水槽', funnel: '漏斗', thistle: '长颈漏斗', evap: '蒸发皿', rod: '玻璃棒', balance: '托盘天平',
  stand: '铁架台', roundFlask: '圆底烧瓶', thermo: '温度计', dropper: '胶头滴管', spoon: '药匙',
  condenser: '冷凝管', burette: '滴定管', hardTube: '硬质玻璃管', stopper: '橡皮塞', pipe: '导气管',
  washBottle: '洗气瓶', dryingTube: '干燥管', uTube: 'U形管', wideMouth: '广口瓶',
  crucible: '坩埚', mortar: '研钵', rack: '试管架', tongs: '坩埚钳', watchGlass: '表面皿',
  separatory: '分液漏斗',
};

function gallery(p, w, h, spec) {
  let ids = Array.isArray(spec.items) ? spec.items.map(x => GALLERY_ALIAS[x] || x).filter(x => INS[x] || x === 'pipe') : [];
  ids = ids.filter((x, i) => ids.indexOf(x) === i);
  if (!ids.length) ids = GALLERY_ORDER.slice(0, 8);
  ids = ids.slice(0, 10);
  const per = Math.ceil(ids.length / 2) > 5 ? 5 : Math.ceil(ids.length / 2);
  const cols = Math.min(5, ids.length);
  const rows = Math.ceil(ids.length / cols);
  const cw = (w - 24) / cols;
  const rh = rows > 1 ? 96 : 150;
  ids.forEach((id, i) => {
    const cx = 12 + cw * (i % cols) + cw / 2;
    const cy = 22 + rh * Math.floor(i / cols) + (rows > 1 ? 46 : 78);
    if (id === 'pipe') {
      poly(p, [[cx - 18, cy], [cx - 2, cy], [cx - 2, cy - 16], [cx + 16, cy - 16]]);
    } else if (INS[id]) {
      const s = rows > 1 ? 0.72 : 0.9;
      put(p, cx, cy, s, 0, n => INS[id](n, {}));
    }
    txt(p, cx, cy + 15, NAMES[id] || id, { size: 9.5, opacity: 0.75 });
  });
  return true;
}

export const CHEM_SCENES = ['o2_kmno4', 'o2_h2o2', 'co2', 'h2', 'filtration', 'evaporation',
  'distillation', 'weighing', 'measure', 'heat_liquid', 'gas_up', 'gas_down', 'titration',
  'solution', 'reduce_cuo', 'multi_tube', 'flask', 'purify', 'flame_test', 'electrolysis',
  'fountain', 'silver_mirror', 'gallery'];

export const CHEM_SCENE_ZH = {
  o2_kmno4: '加热高锰酸钾制氧气（排水法）', o2_h2o2: '过氧化氢分解制氧气', co2: '大理石与稀盐酸制二氧化碳',
  h2: '锌与稀硫酸制氢气', filtration: '过滤', evaporation: '蒸发', distillation: '蒸馏',
  weighing: '托盘天平称量', measure: '量筒量取液体读数', heat_liquid: '试管加热液体',
  gas_up: '向上排空气法', gas_down: '向下排空气法', titration: '酸碱中和滴定',
  solution: '配制溶液', reduce_cuo: '氢气还原氧化铜', multi_tube: '多试管实验',
  flask: '烧瓶实验装置', purify: '气体除杂与干燥', flame_test: '焰色试验',
  electrolysis: '电解实验', fountain: '喷泉实验', silver_mirror: '银镜反应', gallery: '常见实验仪器',
};

const CHEM_SCENE_ALIAS = {
  '高锰酸钾制氧气': 'o2_kmno4', '加热高锰酸钾': 'o2_kmno4',
  '过氧化氢制氧气': 'o2_h2o2', '双氧水制氧气': 'o2_h2o2',
  '二氧化碳': 'co2', '制二氧化碳': 'co2', '氢气': 'h2', '制氢气': 'h2',
  '过滤': 'filtration', '蒸发': 'evaporation', '蒸馏': 'distillation',
  '称量': 'weighing', '量筒读数': 'measure', '加热液体': 'heat_liquid',
  '向上排空气': 'gas_up', '向下排空气': 'gas_down', '滴定': 'titration',
  '配制溶液': 'solution', '还原氧化铜': 'reduce_cuo',
  '多试管': 'multi_tube', '试管实验': 'multi_tube', '烧瓶': 'flask',
  '除杂': 'purify', '气体除杂': 'purify', '焰色': 'flame_test', '焰色实验': 'flame_test',
  '焰色反应': 'flame_test', '电解': 'electrolysis', '电解实验': 'electrolysis',
  '喷泉': 'fountain', '喷泉实验': 'fountain', '银镜': 'silver_mirror', '银镜反应': 'silver_mirror',
};

// 考试卷式指向标注：x/y 是仪器或试剂位置，lx/ly 是文字位置
const CHEM_CALLOUTS = {
  o2_kmno4: [
    { x: 100, y: 190, lx: 24, ly: 102, text: '高锰酸钾' },
    { x: 40, y: 158, lx: 14, ly: 132, text: '铁架台' },
    { x: 100, y: 190, lx: 24, ly: 232, text: '酒精灯' },
    { x: 190, y: 150, lx: 198, ly: 118, text: '导气管' },
    { x: 260, y: 140, lx: 312, ly: 128, text: '集气瓶', anchor: 'end' },
    { x: 260, y: 190, lx: 312, ly: 224, text: '水槽', anchor: 'end' },
  ],
  o2_h2o2: [
    { x: 100, y: 190, lx: 24, ly: 228, text: 'H₂O₂溶液' },
    { x: 100, y: 150, lx: 24, ly: 118, text: '试管' },
    { x: 190, y: 135, lx: 198, ly: 110, text: '导气管' },
    { x: 260, y: 180, lx: 312, ly: 150, text: '集气瓶', anchor: 'end' },
  ],
  co2: [
    { x: 100, y: 190, lx: 24, ly: 228, text: '稀盐酸/大理石' },
    { x: 100, y: 150, lx: 24, ly: 118, text: '试管' },
    { x: 190, y: 135, lx: 198, ly: 110, text: '导气管' },
    { x: 260, y: 180, lx: 312, ly: 150, text: '集气瓶', anchor: 'end' },
  ],
  h2: [
    { x: 100, y: 190, lx: 24, ly: 228, text: '锌粒/稀硫酸' },
    { x: 100, y: 150, lx: 24, ly: 118, text: '试管' },
    { x: 190, y: 155, lx: 198, ly: 118, text: '导气管' },
    { x: 260, y: 175, lx: 312, ly: 156, text: '集气瓶', anchor: 'end' },
  ],
  purify: [
    { x: 62, y: 166, lx: 24, ly: 108, text: '长进短出' },
    { x: 244, y: 184, lx: 244, ly: 226, text: '干燥管' },
  ],
  filtration: [
    { x: 176, y: 160, lx: 220, ly: 112, text: '漏斗' },
    { x: 176, y: 188, lx: 220, ly: 226, text: '烧杯' },
    { x: 200, y: 150, lx: 238, ly: 176, text: '玻璃棒' },
    { x: 150, y: 160, lx: 106, ly: 104, text: '铁架台', anchor: 'end' },
  ],
  distillation: [
    { x: 108, y: 160, lx: 36, ly: 222, text: '圆底烧瓶' },
    { x: 108, y: 112, lx: 36, ly: 84, text: '温度计' },
    { x: 200, y: 146, lx: 210, ly: 104, text: '冷凝管' },
    { x: 262, y: 180, lx: 316, ly: 222, text: '锥形瓶', anchor: 'end' },
    { x: 108, y: 184, lx: 36, ly: 250, text: '酒精灯' },
  ],
  gas_up: [
    { x: 220, y: 185, lx: 274, ly: 222, text: '集气瓶' },
    { x: 180, y: 140, lx: 230, ly: 112, text: '导气管' },
  ],
  gas_down: [
    { x: 220, y: 185, lx: 274, ly: 222, text: '集气瓶' },
    { x: 180, y: 140, lx: 230, ly: 112, text: '导气管' },
  ],
  flame_test: [
    { x: 118, y: 184, lx: 36, ly: 232, text: '酒精灯' },
    { x: 144, y: 150, lx: 190, ly: 112, text: '铂丝' },
    { x: 254, y: 194, lx: 300, ly: 228, text: '待测溶液' },
  ],
  electrolysis: [
    { x: 140, y: 150, lx: 86, ly: 112, text: '石墨电极' },
    { x: 180, y: 180, lx: 244, ly: 226, text: 'U形管' },
  ],
  fountain: [
    { x: 180, y: 120, lx: 230, ly: 92, text: '烧瓶' },
    { x: 180, y: 180, lx: 236, ly: 224, text: '烧杯' },
    { x: 180, y: 170, lx: 128, ly: 224, text: '导管' },
  ],
  silver_mirror: [
    { x: 180, y: 170, lx: 226, ly: 140, text: '试管' },
    { x: 180, y: 190, lx: 236, ly: 198, text: '温水浴' },
  ],
  reduce_cuo: [
    { x: 180, y: 142, lx: 180, ly: 104, text: '硬质玻璃管' },
    { x: 180, y: 150, lx: 120, ly: 180, text: 'CuO' },
    { x: 286, y: 184, lx: 330, ly: 224, text: '澄清石灰水', anchor: 'end' },
    { x: 180, y: 184, lx: 226, ly: 224, text: '酒精灯' },
  ],
  multi_tube: [
    { x: 282, y: 188, lx: 330, ly: 226, text: '试管架', anchor: 'end' },
  ],
  heat_liquid: [
    { x: 152, y: 160, lx: 36, ly: 226, text: '试管' },
    { x: 182, y: 152, lx: 232, ly: 112, text: '铁架台' },
    { x: 150, y: 184, lx: 36, ly: 250, text: '酒精灯' },
  ],
  flask: [
    { x: 150, y: 170, lx: 40, ly: 222, text: '圆底烧瓶' },
    { x: 126, y: 170, lx: 70, ly: 112, text: '铁架台', anchor: 'end' },
    { x: 150, y: 184, lx: 40, ly: 250, text: '酒精灯' },
  ],
  titration: [
    { x: 166, y: 150, lx: 220, ly: 110, text: '滴定管' },
    { x: 166, y: 184, lx: 220, ly: 224, text: '锥形瓶' },
    { x: 120, y: 136, lx: 70, ly: 104, text: '铁架台', anchor: 'end' },
  ],
  evaporation: [
    { x: 174, y: 152, lx: 220, ly: 108, text: '蒸发皿' },
    { x: 174, y: 184, lx: 220, ly: 232, text: '酒精灯' },
    { x: 150, y: 160, lx: 108, ly: 104, text: '铁架台', anchor: 'end' },
    { x: 186, y: 150, lx: 238, ly: 142, text: '玻璃棒' },
  ],
  weighing: [
    { x: 150, y: 170, lx: 218, ly: 118, text: '托盘天平' },
    { x: 182, y: 162, lx: 218, ly: 184, text: '砝码' },
    { x: 196, y: 172, lx: 238, ly: 224, text: '药匙' },
  ],
  measure: [
    { x: 168, y: 158, lx: 218, ly: 110, text: '量筒' },
  ],
  solution: [
    { x: 118, y: 188, lx: 40, ly: 230, text: '烧杯' },
    { x: 140, y: 170, lx: 96, ly: 120, text: '玻璃棒' },
    { x: 200, y: 180, lx: 238, ly: 120, text: '量筒' },
    { x: 250, y: 180, lx: 310, ly: 230, text: '托盘天平', anchor: 'end' },
  ],
};

const CHEM_EQ = {
  o2_kmno4: '2KMnO₄ —△→ K₂MnO₄ + MnO₂ + O₂↑',
  o2_h2o2: '2H₂O₂ —MnO₂→ 2H₂O + O₂↑',
  co2: 'CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑',
  h2: 'Zn + H₂SO₄ → ZnSO₄ + H₂↑',
  reduce_cuo: 'H₂ + CuO —△→ Cu + H₂O',
  electrolysis: '2H₂O —通电→ 2H₂↑ + O₂↑',
  fountain: 'NH₃ + H₂O ⇌ NH₃·H₂O',
  silver_mirror: 'CH₃CHO + 2Ag(NH₃)₂OH —△→ CH₃COONH₄ + 2Ag↓ + 3NH₃ + H₂O',
};

function drawCallouts(p, w, h, key, spec) {
  const list = Array.isArray(spec.callouts) ? spec.callouts : (CHEM_CALLOUTS[key] || []);
  list.forEach(c => {
    if (!c || !c.text) return;
    const x = Number(c.x), y = Number(c.y), lx = Number(c.lx), ly = Number(c.ly);
    if (![x, y, lx, ly].every(Number.isFinite)) return;
    // 230 高的刷题画布上，原坐标里的 ly=250 会被裁掉；把标注整体夹回画布内。
    const safeY = Math.max(10, Math.min(ly, (Number(h) || 300) - 6));
    callout(p, x, y, lx, safeY, c.text, {
      anchor: c.anchor || 'start', size: c.size || 9,
    });
  });
}

/* 方程式排版：反应物靠右、生成物靠左，中间固定留出等号与条件的位置。
   旧版把整串文字居中，条件三角和等号挤在一起，长式还会顶到画布外。 */
function eqCharWidth(ch) {
  if (/\s/.test(ch)) return 0.3;
  if (/[A-Z]/.test(ch)) return 0.64;
  if (/[a-z]/.test(ch)) return 0.5;
  if (/[0-9]/.test(ch)) return 0.5;
  if (/[₀-₉₊₋]/.test(ch)) return 0.38;
  if (/[\u3400-\u9fff]/.test(ch)) return 1;
  if ('+⇌=→↑↓·'.includes(ch)) return 0.62;
  return 0.46;
}

function eqWidth(s, size) {
  let n = 0;
  for (const ch of String(s || '')) n += eqCharWidth(ch);
  return n * size;
}

function parseEquationLine(line) {
  const s = String(line || '').trim();
  let m = s.match(/^(.*?)\s*⇌\s*(.*)$/);
  if (m) return { left: m[1].trim(), sign: '⇌', right: m[2].trim(), cond: '' };
  m = s.match(/^(.*?)\s*[—–-]{1,2}\s*([^→]{0,16}?)\s*→\s*(.*)$/);
  if (m) return { left: m[1].trim(), sign: '=', right: m[3].trim(), cond: m[2].trim() };
  m = s.match(/^(.*?)\s*=\s*\[([^\]]*)\]\s*(.*)$/);
  if (m) return { left: m[1].trim(), sign: '=', right: m[3].trim(), cond: m[2].trim() };
  m = s.match(/^(.*?)\s*(?:=|→)\s*(.*)$/);
  if (m) return { left: m[1].trim(), sign: '=', right: m[2].trim(), cond: '' };
  return null;
}

// 反应条件：课本里“加热”写成 △，其他条件原样保留
function normCondText(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, '');
  if (/^(加强热|高温加热|高温煅烧)$/.test(flat)) return '高温';
  if (/^(加热|受热|微热|加热条件|加热反应|加热至|△加热|加热△)$/.test(flat)) return '△';
  return raw;
}

// 催化剂写在等号上方，△/通电/高温写在下方；只有一个非催化剂条件时仍写在上面
function isCatalystCond(t) {
  if (!t) return false;
  if (/^催化剂$/.test(t)) return true;
  if (/^(浓硫酸|浓H2SO4)$/i.test(t)) return true;
  return /^[A-Za-z0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹().·+\-]+$/.test(t) && /[A-Za-z]/.test(t);
}

function condPartsText(text) {
  const tokens = String(text == null ? '' : text)
    .split(/[\/｜|、,，;；]+/)
    .map(x => normCondText(x))
    .filter(Boolean);
  const cat = tokens.filter(isCatalystCond);
  const other = tokens.filter(t => !isCatalystCond(t));
  if (!cat.length) return { up: other.join('、'), down: '' };
  return { up: cat.join('、'), down: other.join('、') };
}

// 条件里的化学式带下标（MnO₂），SVG 里用 tspan 压下去
function condTxt(p, x, y, s, o = {}) {
  const raw = String(s || '');
  if (!raw) return;
  const n = mk('text', {
    x, y, 'font-size': round(o.size || 7), 'text-anchor': o.anchor || 'middle',
    fill: INK, opacity: o.opacity == null ? 0.7 : o.opacity, class: 'chem-eq',
  });
  const parts = raw.split(/([A-Za-z)])([0-9]+)/g);
  // split 后：普通段 / 字母 / 数字 交替出现
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    if (seg == null || seg === '') continue;
    if (i % 3 === 2) {
      const sub = mk('tspan', { 'baseline-shift': 'sub', 'font-size': round((o.size || 7) * 0.74) });
      sub.textContent = seg;
      n.appendChild(sub);
    } else {
      n.appendChild(document.createTextNode(seg));
    }
  }
  p.appendChild(n);
}

function drawEquation(p, w, h, key, spec) {
  if (spec.equation === false) return;
  const raw = spec.equation != null ? spec.equation : CHEM_EQ[key];
  if (!raw) return;
  const source = Array.isArray(raw) ? raw : String(raw).split(/\n/);
  let lines = source.map(x => String(x).trim()).filter(Boolean);
  if (lines.length === 1 && lines[0].length > 38) {
    const cut = lines[0].indexOf('→');
    if (cut > 0) lines = [lines[0].slice(0, cut + 1), lines[0].slice(cut + 1).trim()];
  }
  lines = lines.slice(0, 3);
  const scale = uiTextScale();
  const parsedLines = lines.map(parseEquationLine);
  const condLines = parsedLines.map(x => (x && x.cond ? condPartsText(x.cond) : { up: '', down: '' }));
  const anyDown = condLines.some(c => c.down);
  const anyCond = condLines.some(c => c.up || c.down);
  // 等号上方/下方都有条件时行距要再放宽，避免压到上一行或下一行
  const lineH = (anyDown ? 31 : anyCond ? 25 : 18) * scale;
  const baseY = (Number(h) || 300) - 14 - (lines.length - 1) * lineH;
  const baseSize = 9.4 * scale;
  const condSize = Math.max(5.4, baseSize * 0.72);
  // 等号两侧留出的宽度按条件文字宽度算（上下取宽的那条），等号横线再把它填满，不留空档
  let gap = 16 * Math.max(0.94, scale);
  condLines.forEach(c => {
    const cw = Math.max(eqWidth(c.up, condSize), eqWidth(c.down, condSize));
    if (cw) gap = Math.max(gap, cw / 2 + 6 * scale);
  });
  lines.forEach((rawLine, i) => {
    const y = baseY + i * lineH;
    const parsed = parsedLines[i];
    if (!parsed) {
      const size = Math.min(9.4 * scale, (w - 18) / Math.max(1, eqWidth(rawLine, 1)));
      txt(p, w / 2, y, rawLine.replace(/\s+/g, ' '), {
        size: Math.max(6.8, size), scale: 1, opacity: 0.82, eq: true,
        letterSpacing: 0.2, wordSpacing: 2.6,
      });
      return;
    }
    let size = 9.4 * scale;
    const avail = Math.max(40, w / 2 - gap - 10);
    const widest = Math.max(eqWidth(parsed.left, size), eqWidth(parsed.right, size));
    if (widest > avail) size = Math.max(6.8, size * (avail / widest));
    const textOpts = {
      size, scale: 1, opacity: 0.84, eq: true,
      letterSpacing: 0.15, wordSpacing: 2.8,
    };
    if (parsed.left) txt(p, w / 2 - gap, y, parsed.left, { ...textOpts, anchor: 'end' });
    if (parsed.sign === '=') {
      // 等号直接画两条横线：横线从反应物末尾连到生成物开头，不再是一个短字符夹在两段空隙里
      const x1 = w / 2 - gap - 1;
      const x2 = w / 2 + gap + 1;
      const barW = Math.max(1, size * 0.095);
      line(p, x1, y - size * 0.5, x2, y - size * 0.5, { w: barW, opacity: 0.92 });
      line(p, x1, y - size * 0.3, x2, y - size * 0.3, { w: barW, opacity: 0.92 });
    } else {
      txt(p, w / 2, y + 0.3, parsed.sign, {
        ...textOpts, size: size * 1.04, opacity: 0.95, anchor: 'middle',
        textLength: size * 1.5,
      });
    }
    if (parsed.right) txt(p, w / 2 + gap, y, parsed.right, { ...textOpts, anchor: 'start' });
    const cp = condLines[i] || { up: '', down: '' };
    if (cp.up) {
      condTxt(p, w / 2, y - Math.max(8.6 * scale, size * 0.88 + 1.4 * scale), cp.up, {
        size: Math.max(5.4, size * 0.72), opacity: 0.72,
      });
    }
    if (cp.down) {
      condTxt(p, w / 2, y + Math.max(7.4 * scale, size * 0.92), cp.down, {
        size: Math.max(5.4, size * 0.72), opacity: 0.72,
      });
    }
  });
}

export function chemSceneOf(spec) {
  const s = spec || {};
  const k = String(s.scene || s.type || '').trim().toLowerCase();
  if (CHEM_SCENES.includes(k)) return k;
  const zh = CHEM_SCENE_ALIAS[String(s.scene || '').trim()];
  if (zh) return zh;
  // 模型只给了标题/说明时，也尽量认出装置，而不是退回仪器总览
  const hay = `${s.title || ''} ${s.note || ''} ${s.reagent || ''}`;
  if (hay.trim()) {
    const words = Object.keys(CHEM_SCENE_ALIAS).sort((a, b) => b.length - a.length);
    for (const word of words) if (hay.includes(word)) return CHEM_SCENE_ALIAS[word];
  }
  return 'gallery';
}

export function renderChem(svg, w, h, spec) {
  const key = chemSceneOf(spec);
  const fn = SCENES[key];
  const g = mk('g', {});
  svg.appendChild(g);
  // 场景函数签名是 (p, w, spec)，不要把 h 当 spec 传进去
  if (fn) {
    fn(g, w, spec || {});
    drawCallouts(g, w, h, key, spec || {});
    drawEquation(g, w, h, key, spec || {});
    return true;
  }
  gallery(g, w, h, spec || {});
  return true;
}
