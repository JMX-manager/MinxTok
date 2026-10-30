// 物理题图（beta）：把 [[draw:{"type":"physics","scene":"car"}]] 渲染成真正的 SVG 示意图
// 只做“题目配图”，不做动画与计算；所有尺寸按传入的 viewBox 自适应。

const NS = 'http://www.w3.org/2000/svg';

function mk(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}

const INK = 'currentColor';

function line(p, x1, y1, x2, y2, o = {}) {
  const n = mk('line', {
    x1, y1, x2, y2,
    stroke: o.color || INK,
    'stroke-width': o.w || 1.4,
    'stroke-linecap': 'round',
    'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.88 : o.opacity,
  });
  p.appendChild(n);
  return n;
}

function path(p, d, o = {}) {
  const n = mk('path', {
    d,
    fill: o.fill || 'none',
    stroke: o.color || INK,
    'stroke-width': o.w || 1.4,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.88 : o.opacity,
  });
  p.appendChild(n);
  return n;
}

function poly(p, pts, o = {}) {
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ');
  return path(p, d, o);
}

function rect(p, x, y, w, h, r = 0, o = {}) {
  const n = mk('rect', {
    x, y, width: w, height: h, rx: r,
    fill: o.fill || 'none',
    stroke: o.stroke || INK,
    'stroke-width': o.w || 1.4,
    'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.88 : o.opacity,
  });
  p.appendChild(n);
  return n;
}

function circle(p, cx, cy, r, o = {}) {
  const n = mk('circle', {
    cx, cy, r,
    fill: o.fill || 'none',
    stroke: o.stroke || INK,
    'stroke-width': o.w || 1.4,
    'stroke-dasharray': o.dash || null,
    opacity: o.opacity == null ? 0.88 : o.opacity,
  });
  p.appendChild(n);
  return n;
}

function text(p, x, y, str, o = {}) {
  if (str == null || str === '') return null;
  const raw = String(str);
  const cls = /[\u3400-\u9fff]/.test(raw) ? 'fig-zh' : null;
  const n = mk('text', {
    x, y,
    'font-size': o.size || 12,
    'text-anchor': o.anchor || 'middle',
    fill: INK,
    opacity: o.opacity == null ? 0.9 : o.opacity,
    'font-style': o.italic ? 'italic' : null,
    'font-weight': o.bold ? 700 : null,
    class: cls,
  });
  n.textContent = raw;
  p.appendChild(n);
  return n;
}

function arrow(p, x1, y1, x2, y2, o = {}) {
  const head = o.head || 7;
  const a = Math.atan2(y2 - y1, x2 - x1);
  line(p, x1, y1, x2 - Math.cos(a) * head * 0.7, y2 - Math.sin(a) * head * 0.7, o);
  const hx = x2, hy = y2;
  const p1 = `${hx},${hy}`;
  const p2 = `${hx - Math.cos(a - 0.42) * head * 1.6},${hy - Math.sin(a - 0.42) * head * 1.6}`;
  const p3 = `${hx - Math.cos(a + 0.42) * head * 1.6},${hy - Math.sin(a + 0.42) * head * 1.6}`;
  path(p, `M${p1} L${p2} L${p3} Z`, { fill: o.color || INK, opacity: o.opacity == null ? 0.88 : o.opacity });
  return { x: x2, y: y2 };
}

// 尺寸标注：两端短竖线 + 中间文字
function dim(p, x1, y1, x2, y2, label, o = {}) {
  const vert = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  const t = 5;
  line(p, x1, y1, x2, y2, { dash: '4 4', opacity: 0.5, w: 1.1 });
  if (vert) {
    line(p, x1 - t, y1, x1 + t, y1, { opacity: 0.5, w: 1.1 });
    line(p, x2 - t, y2, x2 + t, y2, { opacity: 0.5, w: 1.1 });
  } else {
    line(p, x1, y1 - t, x1, y1 + t, { opacity: 0.5, w: 1.1 });
    line(p, x2, y2 - t, x2, y2 + t, { opacity: 0.5, w: 1.1 });
  }
  if (label) {
    if (vert) text(p, x1 + (o.side === 'left' ? -8 : 10), (y1 + y2) / 2, label, { anchor: o.side === 'left' ? 'end' : 'start', size: 11 });
    else text(p, (x1 + x2) / 2, y1 - 6, label, { size: 11 });
  }
}

function ground(p, x0, x1, y, o = {}) {
  line(p, x0, y, x1, y, { w: 1.6, opacity: 0.9 });
  for (let x = x0 + 4; x < x1; x += 12) line(p, x, y, x - 5, y + 6, { w: 1, opacity: 0.4 });
}

function wheel(p, cx, cy, r) {
  circle(p, cx, cy, r, { w: 1.6, fill: 'none' });
  circle(p, cx, cy, r * 0.42, { w: 1.1, opacity: 0.55 });
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ---------------- 运动学 ---------------- */

function car(p, w, h, spec) {
  const y = h - 52;
  ground(p, 26, w - 26, y + 12);
  const x = 78;
  const bodyW = 96;
  path(p, `M${x + 6},${y} L${x + 6},${y - 16} Q${x + 6},${y - 22} ${x + 16},${y - 22}
    L${x + 40},${y - 22} L${x + 52},${y - 36} Q${x + 55},${y - 40} ${x + 62},${y - 40}
    L${x + bodyW - 14},${y - 40} Q${x + bodyW - 4},${y - 40} ${x + bodyW - 4},${y - 30} L${x + bodyW - 4},${y} Z`, { w: 1.6 });
  path(p, `M${x + 56},${y - 36} L${x + 56},${y - 22}`, { w: 1.1, opacity: 0.45 });
  wheel(p, x + 22, y + 2, 9);
  wheel(p, x + bodyW - 20, y + 2, 9);
  arrow(p, x + bodyW + 10, y - 22, x + bodyW + 54, y - 22, { w: 1.5 });
  text(p, x + bodyW + 32, y - 30, spec.v || 'v', { italic: true, size: 12 });
  if (spec.s) dim(p, x + 6, y + 34, x + 6 + num(spec.sPx, 150), y + 34, spec.s);
  text(p, w / 2, h - 12, spec.note || '', { size: 11, opacity: 0.6 });
}

function truck(p, w, h, spec) {
  const y = h - 54;
  ground(p, 22, w - 22, y + 12);
  const x = 46;
  rect(p, x, y - 34, 96, 34, 3, { w: 1.6 });
  path(p, `M${x + 96},${y} L${x + 96},${y - 26} L${x + 118},${y - 26} Q${x + 132},${y - 26} ${x + 136},${y - 14} L${x + 140},${y} Z`, { w: 1.6 });
  path(p, `M${x + 104},${y - 22} L${x + 116},${y - 22} L${x + 122},${y - 8} L${x + 104},${y - 8} Z`, { w: 1.1, opacity: 0.5 });
  wheel(p, x + 22, y + 2, 9);
  wheel(p, x + 74, y + 2, 9);
  wheel(p, x + 120, y + 2, 9);
  arrow(p, x + 146, y - 18, x + 180, y - 18, { w: 1.5 });
  text(p, x + 163, y - 26, spec.v || 'v', { italic: true });
  if (spec.L) dim(p, x, y + 40, x + 140, y + 40, spec.L);
  text(p, w / 2, h - 12, spec.note || '货车在水平路面上行驶', { size: 11, opacity: 0.6 });
}

function bike(p, w, h, spec) {
  const y = h - 56;
  ground(p, 30, w - 30, y + 14);
  const cx0 = 104, cx1 = 208, r = 26;
  line(p, cx0, y + 14, cx1, y + 14, { w: 0, opacity: 0 });
  circle(p, cx0, y, r, { w: 1.6 });
  circle(p, cx1, y, r, { w: 1.6 });
  const hub0 = [cx0, y], hub1 = [cx1, y];
  const pedal = [cx0 + 34, y - 6];
  const seat = [cx0 + 30, y - 46];
  const bar = [cx1 - 14, y - 46];
  line(p, hub0[0], hub0[1], pedal[0], pedal[1], { w: 1.5 });
  line(p, pedal[0], pedal[1], seat[0], seat[1], { w: 1.5 });
  line(p, seat[0], seat[1], hub1[0], hub1[1], { w: 1.5 });
  line(p, hub0[0], hub0[1], seat[0], seat[1], { w: 1.5 });
  line(p, pedal[0], pedal[1], hub1[0], hub1[1], { w: 1.4, opacity: 0.7 });
  line(p, seat[0] - 10, seat[1], seat[0] + 10, seat[1], { w: 2 });
  line(p, bar[0] - 9, bar[1], bar[0] + 9, bar[1], { w: 2 });
  line(p, bar[0], bar[1], hub1[0], hub1[1], { w: 1.5 });
  arrow(p, cx1 + r + 10, y - 26, cx1 + r + 52, y - 26, { w: 1.5 });
  text(p, cx1 + r + 31, y - 34, spec.v || 'v', { italic: true });
  text(p, w / 2, h - 14, spec.note || '自行车沿直线运动', { size: 11, opacity: 0.6 });
}

function train(p, w, h, spec) {
  const y = h - 58;
  const railY = y + 16;
  line(p, 20, railY, w - 20, railY, { w: 1.6 });
  for (let x = 24; x < w - 20; x += 10) line(p, x, railY, x, railY + 5, { w: 1, opacity: 0.45 });
  const x = 40;
  // 车头
  path(p, `M${x},${y} L${x},${y - 30} L${x + 14},${y - 30} L${x + 22},${y - 38} L${x + 44},${y - 38} L${x + 44},${y} Z`, { w: 1.6 });
  wheel(p, x + 10, y + 2, 6);
  wheel(p, x + 32, y + 2, 6);
  // 两节车厢
  [0, 1].forEach((i) => {
    const bx = x + 50 + i * 62;
    rect(p, bx, y - 34, 56, 34, 3, { w: 1.5 });
    [0, 1, 2].forEach((k) => rect(p, bx + 8 + k * 16, y - 28, 10, 10, 2, { w: 1, opacity: 0.5 }));
    wheel(p, bx + 12, y + 2, 5);
    wheel(p, bx + 44, y + 2, 5);
  });
  arrow(p, x + 176, y - 44, x + 216, y - 44, { w: 1.5 });
  text(p, x + 196, y - 52, spec.v || 'v', { italic: true });
  if (spec.L) dim(p, x, y + 40, x + 168, y + 40, spec.L);
  text(p, w / 2, h - 12, spec.note || '火车（车头与车厢）', { size: 11, opacity: 0.6 });
}

function tunnel(p, w, h, spec) {
  const y = h - 52;
  ground(p, 18, w - 18, y + 10);
  const lx = 52, rx = w - 52, top = y - 96;
  // 山体 + 隧道口
  path(p, `M${lx - 22},${y} Q${lx + 18},${top - 18} ${(lx + rx) / 2},${top} Q${rx - 18},${top - 18} ${rx + 22},${y}`, { w: 1.6 });
  const mid = (lx + rx) / 2, halfW = Math.min(56, (rx - lx) / 2 - 26);
  path(p, `M${mid - halfW},${y} L${mid - halfW},${y - 34} Q${mid},${y - 34 - halfW * 1.5} ${mid + halfW},${y - 34} L${mid + halfW},${y}`, { w: 1.5 });
  // 隧道内的车
  const cx = mid - 14;
  rect(p, cx - 20, y - 20, 44, 13, 3, { w: 1.3 });
  path(p, `M${cx - 14},${y - 20} L${cx - 10},${y - 27} L${cx + 12},${y - 27} L${cx + 16},${y - 20}`, { w: 1.2 });
  wheel(p, cx - 12, y - 6, 4);
  wheel(p, cx + 12, y - 6, 4);
  dim(p, mid - halfW, y + 26, mid + halfW, y + 26, spec.L || 'L');
  dim(p, cx - 20, y - 42, cx + 24, y - 42, spec.l || 'l');
  text(p, w / 2, h - 12, spec.note || '车长 l 通过长 L 的隧道', { size: 11, opacity: 0.6 });
}

/* ---------------- 力学 ---------------- */

function incline(p, w, h, spec) {
  const y = h - 46;
  const x0 = 44, x1 = w - 60;
  const ang = Math.max(8, Math.min(70, num(spec.angle, 30))) * Math.PI / 180;
  const topY = y - Math.tan(ang) * (x1 - x0) * 0.62;
  ground(p, 20, w - 20, y);
  path(p, `M${x0},${y} L${x1},${y} L${x1},${topY} Z`, { w: 1.6 });
  // 角度弧
  path(p, `M${x1 - 34},${y} A34,34 0 0 0 ${x1 - 34 * Math.cos(ang)},${y - 34 * Math.sin(ang)}`, { w: 1.1, opacity: 0.6 });
  text(p, x1 - 46, y - 12, spec.angle ? `${spec.angle}°` : 'θ', { size: 11, anchor: 'middle' });
  // 斜面上的物块（贴在斜边中点）
  const t = 0.56;
  const bx = x0 + (x1 - x0) * t + 6;
  const by = y + (topY - y) * (bx - x0) / (x1 - x0);
  const bw = 34, bh = 20;
  const nx = Math.sin(ang), ny = Math.cos(ang);
  const g2 = mk('g', { transform: `translate(${bx},${by}) rotate(${-spec.angle || -(Math.atan2(y - topY, x1 - x0) * 180 / Math.PI)})` });
  p.appendChild(g2);
  rect(g2, -bw / 2, -bh, bw, bh, 2, { w: 1.5 });
  text(g2, 0, -bh / 2 + 4, spec.m || 'm', { size: 11 });
  // 受力箭头
  const cx = bx - nx * bh * 0.5, cy = by - ny * bh * 0.5;
  const show = spec.show || {};
  if (show.G !== false) {
    arrow(p, cx, cy, cx, cy + 40, { w: 1.3 });
    text(p, cx + 14, cy + 40, spec.G || 'G', { size: 11, italic: true });
  }
  if (show.N !== false) {
    arrow(p, cx, cy, cx - nx * 40, cy - ny * 40, { w: 1.3 });
    text(p, cx - nx * 46, cy - ny * 46, spec.N || 'N', { size: 11, italic: true });
  }
  if (show.f) {
    // 默认按“沿斜面下滑”画，摩擦力沿斜面向上
    arrow(p, cx, cy, cx - Math.cos(ang) * 34, cy - Math.sin(ang) * 34, { w: 1.3 });
    text(p, cx - Math.cos(ang) * 42, cy - Math.sin(ang) * 42, spec.f || 'f', { size: 11, italic: true });
  }
  if (show.F) {
    arrow(p, cx, cy, cx - Math.cos(ang) * 40, cy - Math.sin(ang) * 40, { w: 1.3 });
    text(p, cx - Math.cos(ang) * 48, cy - Math.sin(ang) * 48, spec.F || 'F', { size: 11, italic: true });
  }
  // 斜面高度标注，让图更像课本/试卷上的受力图
  line(p, x1, topY, x1, y, { w: 1, dash: '4 3', opacity: 0.35 });
  text(p, x1 + 8, (topY + y) / 2, 'h', { size: 10, italic: true, opacity: 0.55, anchor: 'start' });
  text(p, w / 2, h - 12, spec.note || '物块在斜面上', { size: 11, opacity: 0.6 });
}

function forces(p, w, h, spec) {
  const y = h - 62;
  ground(p, 26, w - 26, y + 10);
  const cx = w / 2 - 10;
  const bw = 62, bh = 40;
  rect(p, cx - bw / 2, y - bh, bw, bh, 3, { w: 1.6 });
  text(p, cx, y - bh / 2 + 4, spec.m || 'm', { size: 11 });
  arrow(p, cx, y - 4, cx, y + 44, { w: 1.4 });
  text(p, cx + 12, y + 40, spec.G || 'mg', { anchor: 'start', italic: true });
  arrow(p, cx, y - bh + 4, cx, y - bh - 42, { w: 1.4 });
  text(p, cx + 12, y - bh - 34, spec.N || 'N', { anchor: 'start', italic: true });
  const show = spec.show || {};
  if (show.f !== false) {
    arrow(p, cx - bw / 2 + 2, y - bh / 2, cx - bw / 2 - 46, y - bh / 2, { w: 1.4 });
    text(p, cx - bw / 2 - 22, y - bh / 2 - 8, spec.f || 'f', { italic: true });
  }
  if (show.F !== false) {
    arrow(p, cx + bw / 2 - 2, y - bh / 2, cx + bw / 2 + 46, y - bh / 2, { w: 1.4 });
    text(p, cx + bw / 2 + 24, y - bh / 2 - 8, spec.F || 'F', { italic: true });
  }
  text(p, w / 2, h - 12, spec.note || '水平面上的物块受力', { size: 11, opacity: 0.6 });
}

function pulley(p, w, h, spec) {
  const top = 40;
  const cx = w / 2;
  line(p, cx - 62, top, cx + 62, top, { w: 2.4 });
  for (let x = cx - 58; x < cx + 62; x += 12) line(p, x, top, x - 6, top - 7, { w: 1, opacity: 0.4 });
  const r = 20;
  circle(p, cx, top + 14 + r, r, { w: 1.6 });
  circle(p, cx, top + 14 + r, 3, { fill: INK, stroke: 'none', opacity: 0.7 });
  line(p, cx, top, cx, top + 14, { w: 1.2, opacity: 0.6 });
  // 绳与两侧物体：左 m1，右 m2
  const py = top + 14 + r;
  line(p, cx - r, py, cx - r, h - 96, { w: 1.4 });
  line(p, cx + r, py, cx + r, h - 128, { w: 1.4 });
  const b1y = h - 96, b2y = h - 128;
  rect(p, cx - r - 26, b1y, 52, 30, 3, { w: 1.5 });
  text(p, cx - r, b1y + 20, spec.m1 || 'm₁', { size: 11 });
  rect(p, cx + r - 26, b2y, 52, 30, 3, { w: 1.5 });
  text(p, cx + r, b2y + 20, spec.m2 || 'm₂', { size: 11 });
  arrow(p, cx - r - 40, b1y + 8, cx - r - 40, b1y + 34, { w: 1.2 });
  text(p, cx - r - 46, b1y + 26, spec.G1 || 'G₁', { anchor: 'end', size: 11 });
  arrow(p, cx + r + 40, b2y + 8, cx + r + 40, b2y + 34, { w: 1.2 });
  text(p, cx + r + 46, b2y + 26, spec.G2 || 'G₂', { anchor: 'start', size: 11 });
  text(p, cx, py - r - 10, spec.note || '定滑轮两端悬挂重物', { size: 11, opacity: 0.6 });
}

function spring(p, w, h, spec) {
  const y = h / 2 + 6;
  const x0 = 44;
  line(p, x0, y - 46, x0, y + 46, { w: 2.4 });
  for (let yy = y - 42; yy < y + 46; yy += 10) line(p, x0 - 6, yy, x0, yy + 5, { w: 1, opacity: 0.4 });
  const len = 96;
  const coils = 7;
  let d = `M${x0},${y}`;
  for (let i = 0; i < coils; i++) {
    const sx = x0 + (len / coils) * i;
    d += ` L${sx + len / coils / 4},${y - 14} L${sx + (len / coils) * 3 / 4},${y + 14}`;
  }
  d += ` L${x0 + len},${y}`;
  path(p, d, { w: 1.5 });
  const bx = x0 + len;
  rect(p, bx, y - 22, 44, 44, 3, { w: 1.6 });
  text(p, bx + 22, y + 4, spec.m || 'm', { size: 11 });
  // 平衡位置虚线 + 振幅标注
  const eq = bx + 22;
  line(p, eq, y - 44, eq, y + 44, { dash: '5 4', opacity: 0.45, w: 1.1 });
  text(p, eq, y - 50, spec.eq || 'O', { size: 11 });
  if (spec.A) dim(p, eq, y + 52, eq + num(spec.aPx, 34), y + 52, spec.A);
  text(p, w / 2, h - 12, spec.note || '弹簧振子（水平）', { size: 11, opacity: 0.6 });
}

/* ---------------- 电学 ---------------- */

function resistor(p, x, y, len, vertical) {
  const n = 5, step = len / (n * 2);
  let d = vertical ? `M${x},${y}` : `M${x},${y}`;
  for (let i = 0; i < n * 2; i++) {
    const off = (i % 2 === 0 ? 1 : -1) * 6;
    if (vertical) d += ` L${x + off},${y + step * (i + 1)}`;
    else d += ` L${x + step * (i + 1)},${y + off}`;
  }
  path(p, d, { w: 1.5 });
}

// 任意方向的电阻锯齿，复杂电路/电桥用
function resistorSeg(p, x1, y1, x2, y2, o = {}) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const steps = 8;
  let d = `M${x1},${y1}`;
  for (let i = 1; i <= steps; i++) {
    const along = L * i / steps;
    const off = (i % 2 ? 1 : -1) * (o.amp || 5.5);
    d += ` L${(x1 + ux * along + nx * off).toFixed(1)},${(y1 + uy * along + ny * off).toFixed(1)}`;
  }
  path(p, d, { w: o.w || 1.5, color: o.color });
  if (o.label) {
    text(p, (x1 + x2) / 2 + nx * 14, (y1 + y2) / 2 + ny * 14 + 4, o.label, { size: 10.5 });
  }
}

function battery(p, x, y) {
  line(p, x - 8, y - 12, x - 8, y + 12, { w: 2.6 });
  line(p, x + 8, y - 7, x + 8, y + 7, { w: 1.8 });
  line(p, x - 8, y - 12, x - 8, y - 12, { opacity: 0 });
}

function circuitBridge(p, w, h, spec) {
  const cy = h / 2 - 2;
  const A = [58, cy], B = [w / 2, cy - 74], C = [w - 58, cy], D = [w / 2, cy + 74];
  line(p, A[0], A[1], B[0], B[1], { w: 1.4 });
  line(p, B[0], B[1], C[0], C[1], { w: 1.4 });
  line(p, C[0], C[1], D[0], D[1], { w: 1.4 });
  line(p, D[0], D[1], A[0], A[1], { w: 1.4 });
  resistorSeg(p, A[0], A[1], B[0], B[1], { label: spec.R1 || 'R₁' });
  resistorSeg(p, B[0], B[1], C[0], C[1], { label: spec.R2 || 'R₂' });
  resistorSeg(p, C[0], C[1], D[0], D[1], { label: spec.R3 || 'R₃' });
  resistorSeg(p, D[0], D[1], A[0], A[1], { label: spec.R4 || 'R₄' });
  // 检流计跨在 B、D 之间
  line(p, B[0], B[1] + 8, D[0], D[1] - 8, { w: 1.2 });
  circle(p, w / 2, cy, 13, { w: 1.4, fill: 'var(--surface, #fff)' });
  text(p, w / 2, cy + 4, spec.G || 'G', { size: 11 });
  // 电源跨在 A、C 外侧
  line(p, A[0], A[1], 26, cy, { w: 1.2 });
  line(p, 26, cy, 26, h - 30, { w: 1.2 });
  line(p, 26, h - 30, w - 26, h - 30, { w: 1.2 });
  line(p, w - 26, h - 30, w - 26, cy, { w: 1.2 });
  line(p, w - 26, cy, C[0], C[1], { w: 1.2 });
  battery(p, w / 2, h - 30);
  text(p, w / 2, h - 44, spec.E || 'E', { size: 11 });
  text(p, w / 2, h - 12, spec.note || '惠斯通电桥', { size: 11, opacity: 0.6 });
}

function circuitMulti(p, w, h, spec) {
  const x0 = 48, x1 = w - 48, yT = 54, yB = h - 74, midX = w / 2;
  path(p, `M${x0},${yT} L${x1},${yT} L${x1},${yB} L${x0},${yB} Z`, { w: 1.5 });
  line(p, midX, yT, midX, yB, { w: 1.5 });
  // 上支路两只电阻
  resistor(p, x0 + 24, yT, 54, false);
  text(p, x0 + 51, yT - 12, spec.R1 || 'R₁');
  resistor(p, midX + 26, yT, 54, false);
  text(p, midX + 53, yT - 12, spec.R2 || 'R₂');
  // 中间支路
  resistor(p, midX, yT + 38, 54, true);
  text(p, midX + 20, yT + 66, spec.R3 || 'R₃', { anchor: 'start' });
  // 下支路：电源 + 开关
  battery(p, x0 + 46, yB);
  text(p, x0 + 28, yB + 4, spec.E || 'E', { anchor: 'end' });
  const sx = x1 - 76;
  circle(p, sx, yB, 2.4, { fill: INK, stroke: 'none' });
  circle(p, sx + 28, yB, 2.4, { fill: INK, stroke: 'none' });
  line(p, sx, yB, sx + 24, yB - 16, { w: 1.5 });
  text(p, sx + 14, yB + 16, spec.K || 'S');
  text(p, w / 2, h - 12, spec.note || '复杂双回路电路', { size: 11, opacity: 0.6 });
}

function circuit(p, w, h, spec) {
  let mode = String(spec.mode || spec.cond || spec.variant || 'series').toLowerCase();
  const hay = `${spec.title || ''} ${spec.note || ''}`;
  if (mode === 'series' && /电桥|惠斯通/.test(hay)) mode = 'bridge';
  else if (mode === 'series' && /复杂|双回路|多回路/.test(hay)) mode = 'multi';
  if (mode === 'bridge' || mode === 'wheatstone' || mode === '电桥') { circuitBridge(p, w, h, spec); return; }
  if (mode === 'multi' || mode === 'complex' || mode === '复杂') { circuitMulti(p, w, h, spec); return; }
  const xa = 70, xb = w - 74;
  const yT = 64, yB = h - 84, yM = (yT + yB) / 2;
  const label = (x, y, str, anchor) => text(p, x, y, str, { size: 11, anchor: anchor || 'middle' });

  if (mode === 'parallel') {
    // 两条并联支路共用左右两条竖导轨
    line(p, xa, yT, xa, yB, { w: 1.4 });
    line(p, xb, yT, xb, yB, { w: 1.4 });
    line(p, xa, yT, xa + 24, yT, { w: 1.4 });
    resistor(p, xa + 24, yT, 62, false);
    line(p, xa + 86, yT, xb, yT, { w: 1.4 });
    label((xa + 86 + xa + 24) / 2, yT - 12, spec.R1 || 'R₁');
    line(p, xa, yM, xa + 44, yM, { w: 1.4 });
    resistor(p, xa + 44, yM, 62, false);
    line(p, xa + 106, yM, xb, yM, { w: 1.4 });
    label(xa + 75, yM - 12, spec.R2 || 'R₂');
    // 电池放在左导轨下段
    battery(p, xa, yB - 22);
    line(p, xa, yB - 44, xa, yB - 34, { w: 1.4 });
    label(xa - 18, yB - 18, spec.E || 'E', 'end');
    // 电流表串在右导轨
    if (spec.A) {
      circle(p, xb, yM + 18, 13, { w: 1.4 });
      text(p, xb, yM + 23, 'A', { size: 12 });
    }
  } else {
    // 串联：一个矩形回路
    path(p, `M${xa},${yT} L${xb},${yT} L${xb},${yB} L${xa},${yB} Z`, { w: 1.4 });
    // 电源（左导轨中段）
    battery(p, xa, yM);
    label(xa - 18, yM + 4, spec.E || 'E', 'end');
    // R1（上边）
    resistor(p, xa + 40, yT, 62, false);
    label(xa + 71, yT - 12, spec.R1 || 'R');
    if (spec.R2) {
      resistor(p, xb, yT + 40, 58, true);
      label(xb + 22, yT + 72, spec.R2, 'start');
    }
    // 开关（上边右侧）
    const sx = xb - 56;
    circle(p, sx, yT, 2.4, { fill: INK, stroke: 'none' });
    circle(p, sx + 30, yT, 2.4, { fill: INK, stroke: 'none' });
    line(p, sx, yT, sx + 26, yT - 17, { w: 1.5 });
    label(sx + 15, yT + 16, spec.K || 'S');
    // 电流表 / 电压表
    if (spec.A) {
      circle(p, xb, yB - 34, 13, { w: 1.4 });
      text(p, xb, yB - 29, 'A', { size: 12 });
    }
    if (spec.V) {
      circle(p, (xa + xb) / 2, yB - 26, 13, { w: 1.4 });
      text(p, (xa + xb) / 2, yB - 21, 'V', { size: 12 });
      line(p, (xa + xb) / 2 - 22, yB - 26, (xa + xb) / 2 - 44, yB, { w: 1, dash: '4 3', opacity: 0.5 });
      line(p, (xa + xb) / 2 + 22, yB - 26, (xa + xb) / 2 + 44, yB, { w: 1, dash: '4 3', opacity: 0.5 });
    }
  }
  text(p, w / 2, h - 14, spec.note || (mode === 'parallel' ? '并联电路' : '串联电路'), { size: 11, opacity: 0.6 });
}

/* ---------------- 光学 ---------------- */

function lens(p, w, h, spec) {
  const cy = h / 2 + 4;
  const lx = w / 2;
  const f = 46;
  const u = num(spec.uPx, 74);
  const objH = 36;
  line(p, 16, cy, w - 16, cy, { w: 1.1, dash: '6 4', opacity: 0.4 });
  // 凸透镜本体
  path(p, `M${lx},${cy - 54} Q${lx + 15},${cy} ${lx},${cy + 54} Q${lx - 15},${cy} ${lx},${cy - 54} Z`, { w: 1.5 });
  text(p, lx, cy - 64, '凸透镜', { size: 10, opacity: 0.65 });
  // 焦点标记
  [1, 2].forEach((k) => {
    const px = lx - f * k;
    circle(p, px, cy, 2, { fill: INK, stroke: 'none', opacity: 0.8 });
    text(p, px, cy + 16, k === 1 ? 'F' : '2F', { size: 10, opacity: 0.7 });
    const rx = lx + f * k;
    circle(p, rx, cy, 2, { fill: INK, stroke: 'none', opacity: 0.8 });
    text(p, rx, cy + 16, k === 1 ? "F'" : "2F'", { size: 10, opacity: 0.7 });
  });
  const ox = lx - u;
  arrow(p, ox, cy, ox, cy - objH, { w: 1.5 });
  text(p, ox, cy + 16, '物', { size: 10, opacity: 0.7 });
  // 成像公式 1/v = 1/f - 1/u，放大率 m = -v/u
  const inv = 1 / f - 1 / u;
  const v = inv === 0 ? 1e6 : 1 / inv;
  const real = v > 0;
  const mag = Math.abs(v / u);
  const ih = objH * mag;
  const ix = lx + v;
  const iy = cy + (real ? ih : -ih);
  // 光线一：平行入射 → 过像方焦点 F'
  line(p, ox, cy - objH, lx, cy - objH, { w: 1.2, opacity: 0.8 });
  line(p, lx, cy - objH, ix, iy, { w: 1.2, opacity: 0.65, dash: '5 4' });
  // 光线二：过光心不偏折
  line(p, ox, cy - objH, ix, iy, { w: 1.2, opacity: 0.55, dash: '5 4' });
  if (Number.isFinite(ix) && ix > 12 && ix < w - 12 && mag < 3.4) {
    arrow(p, ix, cy, ix, iy, { w: 1.4, dashed: true, opacity: 0.8, dash: real ? null : '5 4' });
    text(p, ix, iy + (real ? 14 : -10), real ? '像' : '虚像', { size: 10, opacity: 0.7 });
  }
  text(p, w / 2, h - 12, spec.note || (real ? '凸透镜成实像（倒立）' : '凸透镜成虚像（正立放大）'), { size: 11, opacity: 0.6 });
}

function mirror(p, w, h, spec) {
  const cy = h / 2 + 6;
  const mx = w / 2 + 26;
  line(p, mx, 40, mx, h - 50, { w: 2.2 });
  for (let y = 44; y < h - 50; y += 9) line(p, mx, y, mx + 7, y + 5, { w: 1, opacity: 0.45 });
  text(p, mx + 12, 34, '平面镜', { size: 10, opacity: 0.65, anchor: 'start' });
  const ox = 84, oh = 40;
  arrow(p, ox, cy, ox, cy - oh, { w: 1.5 });
  text(p, ox, cy + 16, '物', { size: 10, opacity: 0.7 });
  // 虚像
  const ix = mx + (mx - ox);
  arrow(p, ix, cy, ix, cy - oh, { w: 1.4, dash: '5 4', opacity: 0.6 });
  text(p, ix, cy + 16, '像', { size: 10, opacity: 0.6 });
  // 两条光线
  line(p, ox, cy - oh, mx, cy - oh, { w: 1.2, opacity: 0.8 });
  line(p, mx, cy - oh, ox, cy - oh + 0, { w: 0, opacity: 0 });
  line(p, mx, cy - oh, ox - 26, cy - oh + 52, { w: 1.2, opacity: 0.7 });
  line(p, ox, cy - oh, mx, cy, { w: 1.2, opacity: 0.7 });
  line(p, mx, cy, ox - 26, cy - 46, { w: 1.2, opacity: 0.6 });
  line(p, mx, cy, ix + (ix - mx), cy, { w: 1, dash: '5 4', opacity: 0.45 });
  text(p, w / 2, h - 12, spec.note || '平面镜成像（等大、对称）', { size: 11, opacity: 0.6 });
}

function refraction(p, w, h, spec) {
  const iy = h / 2 + 10;
  const px = w / 2 - 6;
  line(p, 24, iy, w - 24, iy, { w: 1.6 });
  for (let x = 30; x < w - 24; x += 14) line(p, x, iy + 8, x + 8, iy + 8, { w: 1, opacity: 0.25 });
  line(p, px, iy - 78, px, iy + 78, { w: 1, dash: '5 4', opacity: 0.5 });
  const n1 = num(spec.n1, 1), n2 = num(spec.n2, 1.33);
  const i = num(spec.i, 52) * Math.PI / 180;
  const sr = Math.sin(i) * n1 / n2;
  const r = Math.asin(Math.max(-1, Math.min(1, sr)));
  const len = 86;
  // 入射
  const ix0 = px - Math.sin(i) * len, iy0 = iy - Math.cos(i) * len;
  arrow(p, ix0, iy0, px, iy, { w: 1.4 });
  // 反射
  arrow(p, px, iy, px + Math.sin(i) * len * 0.8, iy - Math.cos(i) * len * 0.8, { w: 1.1, opacity: 0.45 });
  // 折射
  arrow(p, px, iy, px + Math.sin(r) * len, iy + Math.cos(r) * len, { w: 1.5 });
  // 角标
  path(p, `M${px},${iy - 26} A26,26 0 0 0 ${px - Math.sin(i) * 26},${iy - Math.cos(i) * 26}`, { w: 1, opacity: 0.55 });
  text(p, px - 20, iy - 32, 'i', { italic: true, size: 11 });
  path(p, `M${px},${iy + 26} A26,26 0 0 1 ${px + Math.sin(r) * 26},${iy + Math.cos(r) * 26}`, { w: 1, opacity: 0.55 });
  text(p, px + 22, iy + 38, 'r', { italic: true, size: 11 });
  text(p, w - 30, iy - 10, spec.medium1 || '空气', { anchor: 'end', size: 10, opacity: 0.6 });
  text(p, w - 30, iy + 22, spec.medium2 || '水', { anchor: 'end', size: 10, opacity: 0.6 });
  text(p, w / 2, h - 12, spec.note || '光从空气斜射入水中', { size: 11, opacity: 0.6 });
}

/* ---------------- 人与常见力学场景 ---------------- */

// 火柴人：头 + 躯干 + 两臂 + 两腿，脚落在 groundY
function stick(p, cx, groundY, hgt) {
  const headR = hgt * 0.11;
  const headY = groundY - hgt + headR;
  circle(p, cx, headY, headR, { w: 1.5 });
  const neckY = headY + headR;
  const hipY = groundY - hgt * 0.42;
  line(p, cx, neckY, cx, hipY, { w: 1.6 });
  // 手臂
  const armY = neckY + hgt * 0.08;
  line(p, cx, armY, cx - hgt * 0.17, armY + hgt * 0.16, { w: 1.4 });
  line(p, cx, armY, cx + hgt * 0.17, armY + hgt * 0.16, { w: 1.4 });
  // 腿
  line(p, cx, hipY, cx - hgt * 0.15, groundY, { w: 1.5 });
  line(p, cx, hipY, cx + hgt * 0.15, groundY, { w: 1.5 });
  return { head: [cx, headY], armY, hipY, neckY };
}

function person(p, w, h, spec) {
  const y = h - 60;
  ground(p, 26, w - 26, y);
  const cx = w / 2 - 6;
  const hgt = Math.min(120, h * 0.44);
  const b = stick(p, cx, y, hgt);
  const show = spec.show || {};
  // 重力：从重心向下
  const cyMid = (b.neckY + b.hipY) / 2 - 6;
  if (show.G !== false) {
    arrow(p, cx, cyMid, cx, y + 26, { w: 1.5 });
    text(p, cx + 12, y + 22, spec.G || 'G', { anchor: 'start', italic: true, size: 12 });
  }
  if (show.N !== false) {
    arrow(p, cx, y - 2, cx, y - hgt * 0.5, { w: 1.5, color: 'currentColor' });
    text(p, cx + 12, y - hgt * 0.5 + 4, spec.N || 'N', { anchor: 'start', italic: true, size: 12 });
  }
  if (show.f) {
    arrow(p, cx - hgt * 0.15, y - 8, cx - hgt * 0.15 - 44, y - 8, { w: 1.3 });
    text(p, cx - hgt * 0.15 - 22, y - 16, spec.f || 'f', { size: 12 });
  }
  if (show.F) {
    arrow(p, cx, b.armY, cx + 54, b.armY, { w: 1.4 });
    text(p, cx + 56, b.armY - 6, spec.F || 'F', { anchor: 'start', size: 12 });
  }
  if (spec.m) text(p, cx - 34, b.neckY + 4, spec.m, { anchor: 'end', size: 11 });
  text(p, w / 2, h - 14, spec.note || '人站在水平地面上（受重力与支持力）', { size: 11, opacity: 0.62 });
}

function lever(p, w, h, spec) {
  const y = h - 52;
  ground(p, 24, w - 24, y);
  const fx = w / 2 - 4;             // 支点
  const ang = num(spec.angle, 14) * Math.PI / 180;
  const halfL = Math.min(120, (w - 100) / 2);
  const halfR = halfL;
  // 支点三角
  path(p, `M${fx - 16},${y} L${fx + 16},${y} L${fx},${y - 26} Z`, { w: 1.5 });
  const lx = fx - Math.cos(ang) * halfL, ly = y - 26 - Math.sin(ang) * halfL;
  const rx = fx + Math.cos(ang) * halfR, ry = y - 26 + Math.sin(ang) * halfR;
  line(p, lx, ly, rx, ry, { w: 2.4 });
  // 两端重物
  const bw = 30, bh = 26;
  rect(p, lx - bw / 2, ly + 2, bw, bh, 3, { w: 1.4 });
  text(p, lx, ly + 20, spec.G1 || 'G₁', { size: 11 });
  rect(p, rx - bw / 2, ry + 2, bw, bh, 3, { w: 1.4 });
  text(p, rx, ry + 20, spec.G2 || 'G₂', { size: 11 });
  // 力臂标注
  dim(p, fx, y - 34, lx, y - 34, spec.L1 || 'L₁');
  dim(p, fx, y - 34, rx, y - 34, spec.L2 || 'L₂');
  text(p, fx, y + 14, spec.O || 'O', { size: 11 });
  text(p, w / 2, h - 12, spec.note || '杠杆平衡（F₁L₁ = F₂L₂）', { size: 11, opacity: 0.62 });
}

function pendulum(p, w, h, spec) {
  const top = 52;
  const cx = w / 2;
  const L = Math.min(h - 150, 150);
  const deg = num(spec.angle, 24) * Math.PI / 180;
  const bx = cx + Math.sin(deg) * L;
  const by = top + Math.cos(deg) * L;
  line(p, cx - 60, top, cx + 60, top, { w: 2.4 });
  for (let x = cx - 56; x < cx + 60; x += 12) line(p, x, top, x - 6, top - 7, { w: 1, opacity: 0.4 });
  line(p, cx, top, bx, by, { w: 1.4 });
  circle(p, bx, by, 11, { w: 1.5 });
  text(p, bx, by + 4, spec.m || 'm', { size: 10 });
  // 竖直线 + 角弧
  line(p, cx, top, cx, top + L, { dash: '5 4', opacity: 0.45, w: 1.1 });
  path(p, `M${cx},${top + 40} A40,40 0 0 1 ${cx + Math.sin(deg) * 40},${top + Math.cos(deg) * 40}`, { w: 1, opacity: 0.55 });
  text(p, cx + 30, top + 62, spec.angle ? `${spec.angle}°` : 'θ', { size: 11 });
  arrow(p, bx, by + 12, bx, by + 46, { w: 1.3 });
  text(p, bx + 12, by + 44, spec.G || 'G', { anchor: 'start', italic: true, size: 11 });
  text(p, w / 2, h - 12, spec.note || '单摆（摆长 L，偏角 θ）', { size: 11, opacity: 0.62 });
}

function ball(p, w, h, spec) {
  const y = h - 52;
  ground(p, 26, w - 26, y);
  const r = num(spec.rPx, 22);
  const cx = w / 2 - 40;
  circle(p, cx, y - r, r, { w: 1.6 });
  circle(p, cx, y - r, 3, { fill: INK, stroke: 'none', opacity: 0.5 });
  arrow(p, cx + r + 8, y - r * 1.6, cx + r + 58, y - r * 1.6, { w: 1.5 });
  text(p, cx + r + 33, y - r * 1.6 - 8, spec.v || 'v', { italic: true, size: 12 });
  const show = spec.show || {};
  if (show.f) {
    arrow(p, cx - r - 6, y - r, cx - r - 50, y - r, { w: 1.3 });
    text(p, cx - r - 28, y - r - 8, spec.f || 'f', { size: 11 });
  }
  if (show.G !== false) {
    arrow(p, cx, y - r + 6, cx, y + 30, { w: 1.3 });
    text(p, cx + 12, y + 26, spec.G || 'G', { anchor: 'start', italic: true, size: 11 });
  }
  if (show.N !== false) {
    arrow(p, cx, y - 2, cx, y - r * 2 - 10, { w: 1.3 });
    text(p, cx + 12, y - r * 2 - 12, spec.N || 'N', { anchor: 'start', italic: true, size: 11 });
  }
  text(p, w / 2, h - 12, spec.note || '小球在水平面上滚动', { size: 11, opacity: 0.62 });
}

function conveyor(p, w, h, spec) {
  const y = h - 78;
  const x0 = 44, x1 = w - 44;
  // 两个滚筒 + 带面
  circle(p, x0 + 12, y, 15, { w: 1.5 });
  circle(p, x1 - 12, y, 15, { w: 1.5 });
  line(p, x0 + 12, y - 15, x1 - 12, y - 15, { w: 2 });
  line(p, x0 + 12, y + 15, x1 - 12, y + 15, { w: 2 });
  // 支架
  [[x0 + 12], [x1 - 12]].forEach(([sx]) => line(p, sx, y + 15, sx, y + 40, { w: 1.2, opacity: 0.5 }));
  ground(p, 20, w - 20, y + 40);
  // 带上物块
  const bw = 34, bh = 24;
  const bx = (x0 + x1) / 2 - bw / 2;
  rect(p, bx, y - 15 - bh, bw, bh, 2, { w: 1.5 });
  text(p, bx + bw / 2, y - 15 - bh / 2 + 4, spec.m || 'm', { size: 11 });
  arrow(p, bx + bw + 8, y - 9, bx + bw + 54, y - 9, { w: 1.4 });
  text(p, bx + bw + 31, y - 17, spec.v || 'v', { italic: true, size: 12 });
  if (spec.show && spec.show.f) {
    arrow(p, bx - 8, y - 9, bx - 50, y - 9, { w: 1.2 });
    text(p, bx - 29, y - 17, 'f', { size: 11 });
  }
  text(p, w / 2, h - 12, spec.note || '物块放在水平传送带上', { size: 11, opacity: 0.62 });
}

function elevator(p, w, h, spec) {
  const top = 44, bot = h - 56;
  const cw = Math.min(140, w - 130), cx = w / 2 - 10;
  // 井道
  line(p, cx - cw / 2 - 18, top, cx - cw / 2 - 18, bot, { w: 1.4, opacity: 0.55 });
  line(p, cx + cw / 2 + 18, top, cx + cw / 2 + 18, bot, { w: 1.4, opacity: 0.55 });
  line(p, cx - cw / 2 - 18, top, cx + cw / 2 + 18, top, { w: 1.6 });
  // 钢缆 + 轿厢
  line(p, cx, top, cx, top + 22, { w: 1.6 });
  rect(p, cx - cw / 2, top + 22, cw, bot - top - 22, 4, { w: 1.6 });
  // 厢内的人（小一号）
  const gh = Math.min(78, (bot - top) * 0.42);
  const b = stick(p, cx, bot - 16, gh);
  // 地板支持力 / 重力 / 加速度
  arrow(p, cx + 26, bot - 12, cx + 26, bot - 12 - gh * 0.6, { w: 1.2 });
  text(p, cx + 34, bot - 20 - gh * 0.4, spec.N || 'N', { anchor: 'start', italic: true, size: 11 });
  arrow(p, cx + 26, bot - 20, cx + 26, bot + 20, { w: 1.2 });
  text(p, cx + 34, bot + 16, spec.G || 'G', { anchor: 'start', italic: true, size: 11 });
  const dir = String(spec.dir || 'up') === 'down' ? -1 : 1;
  arrow(p, cx - cw / 2 - 30, (top + bot) / 2, cx - cw / 2 - 30, (top + bot) / 2 - 46 * dir, { w: 1.4 });
  text(p, cx - cw / 2 - 40, (top + bot) / 2 - 12, spec.a || 'a', { anchor: 'end', italic: true, size: 12 });
  text(p, w / 2, h - 14, spec.note || (dir > 0 ? '电梯加速上升' : '电梯加速下降'), { size: 11, opacity: 0.62 });
}

function stack(p, w, h, spec) {
  const y = h - 52;
  ground(p, 24, w - 24, y);
  const cx = w / 2;
  const aw = 84, ah = 30, bw = 120, bh = 26;
  rect(p, cx - bw / 2, y - bh, bw, bh, 3, { w: 1.5 });
  text(p, cx, y - bh / 2 + 4, spec.B || 'B', { size: 11 });
  rect(p, cx - aw / 2, y - bh - ah, aw, ah, 3, { w: 1.5 });
  text(p, cx, y - bh - ah / 2 + 4, spec.A || 'A', { size: 11 });
  // A 与 B 之间、B 与地面之间的摩擦
  const show = spec.show || {};
  if (show.f !== false) {
    arrow(p, cx - aw / 2 - 4, y - bh - ah / 2, cx - aw / 2 - 44, y - bh - ah / 2, { w: 1.2 });
    text(p, cx - aw / 2 - 24, y - bh - ah / 2 - 8, spec.f1 || 'f₁', { size: 11 });
    arrow(p, cx + bw / 2 + 4, y - bh / 2, cx + bw / 2 + 40, y - bh / 2, { w: 1.2 });
    text(p, cx + bw / 2 + 22, y - bh / 2 - 8, spec.f2 || 'f₂', { size: 11 });
  }
  if (show.F) {
    arrow(p, cx + aw / 2 + 4, y - bh - ah / 2, cx + aw / 2 + 48, y - bh - ah / 2, { w: 1.3 });
    text(p, cx + aw / 2 + 26, y - bh - ah / 2 - 8, spec.F || 'F', { size: 11 });
  }
  text(p, w / 2, h - 12, spec.note || 'A 叠放在 B 上，B 放在水平地面', { size: 11, opacity: 0.62 });
}

function float(p, w, h, spec) {
  const y = h - 42;
  const water = h - 96;
  // 容器
  line(p, 40, water - 40, 40, y, { w: 1.6 });
  line(p, 40, y, w - 40, y, { w: 1.6 });
  line(p, w - 40, y, w - 40, water - 40, { w: 1.6 });
  // 水面
  line(p, 40, water, w - 40, water, { w: 1.3, opacity: 0.7 });
  for (let x = 46; x < w - 44; x += 16) path(p, `M${x},${water} q4,-4 8,0`, { w: 1, opacity: 0.35 });
  text(p, w - 46, water + 16, spec.medium || '水', { anchor: 'end', size: 10, opacity: 0.6 });
  // 漂浮物
  const bw = Math.min(96, w * 0.3), bh = 26;
  const bx = w / 2 - bw / 2;
  const by = water - bh * 0.55;
  path(p, `M${bx},${by} L${bx + bw},${by} L${bx + bw - 14},${by + bh} L${bx + 14},${by + bh} Z`, { w: 1.5 });
  text(p, bx + bw / 2, by + bh / 2 + 4, spec.m || 'm', { size: 11 });
  // 浮力 / 重力
  arrow(p, bx + bw / 2, by + bh / 2, bx + bw / 2, by - 44, { w: 1.4 });
  text(p, bx + bw / 2 + 12, by - 40, spec.F || 'F浮', { anchor: 'start', size: 11 });
  arrow(p, bx + bw / 2, by + bh / 2, bx + bw / 2, by + bh + 40, { w: 1.4 });
  text(p, bx + bw / 2 + 12, by + bh + 36, spec.G || 'G', { anchor: 'start', size: 11 });
  if (spec.V) {
    text(p, w / 2, h - 12, spec.note || '物体漂浮：F浮 = G', { size: 11, opacity: 0.62 });
  } else {
    text(p, w / 2, h - 12, spec.note || '物体漂浮在水面上', { size: 11, opacity: 0.62 });
  }
}

function magnet(p, w, h, spec) {
  const cy = h / 2 - 6;
  const bw = 84, bh = 34;
  const gap = 46;
  const lx = w / 2 - gap / 2 - bw;
  const rx = w / 2 + gap / 2;
  const draw = (x, N, S) => {
    rect(p, x, cy - bh / 2, bw, bh, 3, { w: 1.6 });
    line(p, x + bw / 2, cy - bh / 2, x + bw / 2, cy + bh / 2, { w: 1.2, opacity: 0.6 });
    text(p, x + bw * 0.25, cy + 5, N, { size: 13, bold: true });
    text(p, x + bw * 0.75, cy + 5, S, { size: 13, bold: true });
  };
  draw(lx, 'N', 'S');
  draw(rx, 'S', 'N');
  // 相互作用箭头
  const repel = String(spec.type2 || spec.pole || '').toLowerCase() === 'repel' || spec.repel;
  if (repel) {
    arrow(p, lx + bw + 4, cy, lx + bw + 28, cy, { w: 1.3 });
    arrow(p, rx - 4, cy, rx - 28, cy, { w: 1.3 });
    text(p, w / 2, cy - bh / 2 - 14, spec.note || '同名磁极相互排斥', { size: 11, opacity: 0.7 });
  } else {
    arrow(p, lx + bw + 4, cy, rx - 4, cy, { w: 1.3 });
    arrow(p, rx - 4, cy, lx + bw + 4, cy, { w: 1.3, opacity: 0.4 });
    text(p, w / 2, cy - bh / 2 - 14, spec.note || '异名磁极相互吸引', { size: 11, opacity: 0.7 });
  }
  text(p, w / 2, h - 14, spec.caption || '两块磁铁之间的相互作用', { size: 11, opacity: 0.6 });
}

function charge(p, w, h, spec) {
  const cy = h / 2 - 4;
  const gap = Math.min(150, w * 0.42);
  const ax = w / 2 - gap / 2, bx = w / 2 + gap / 2;
  const r = 17;
  circle(p, ax, cy, r, { w: 1.6 });
  text(p, ax, cy + 5, spec.q1 || '+q', { size: 12, bold: true });
  circle(p, bx, cy, r, { w: 1.6 });
  text(p, bx, cy + 5, spec.q2 || '−q', { size: 12, bold: true });
  const repel = /同一个|同种|repel/i.test(String(spec.note || '')) || spec.repel;
  const d = r + 10;
  if (repel) {
    arrow(p, ax - d, cy, ax - d - 40, cy, { w: 1.3 });
    arrow(p, bx + d, cy, bx + d + 40, cy, { w: 1.3 });
    text(p, w / 2, cy + 46, spec.note || '同种电荷相互排斥', { size: 11, opacity: 0.7 });
  } else {
    arrow(p, ax + d, cy, ax + d + 34, cy, { w: 1.3 });
    arrow(p, bx - d, cy, bx - d - 34, cy, { w: 1.3 });
    text(p, w / 2, cy + 46, spec.note || '异种电荷相互吸引', { size: 11, opacity: 0.7 });
  }
  if (spec.d) dim(p, ax, cy - r - 22, bx, cy - r - 22, spec.d);
  text(p, w / 2, h - 14, spec.caption || '两个点电荷之间的库仑力', { size: 11, opacity: 0.6 });
}

/* ---------------- 通用受力 / 运动学 / 抛体 / 棱镜 / 电场 ---------------- */

function force2d(p, w, h, spec) {
  const cx = num(spec.cx, w / 2);
  const cy = num(spec.cy, h / 2 + 8);
  const surface = String(spec.surface || 'ground');
  const body = String(spec.body || 'block');
  const inclineDeg = surface === 'incline' ? Math.max(8, Math.min(70, num(spec.angle, 30))) : 0;
  let bodyY = cy, bodyAngle = 0;
  if (surface === 'ground' || surface === 'incline') {
    const y = h - 46;
    ground(p, 20, w - 20, y);
    if (surface === 'incline') {
      const ang = inclineDeg * Math.PI / 180;
      const x0 = 42, x1 = w - 54;
      const topY = y - Math.tan(ang) * (x1 - x0) * 0.62;
      path(p, `M${x0},${y} L${x1},${y} L${x1},${topY} Z`, { w: 1.6 });
      text(p, x1 - 42, y - 12, `${inclineDeg}°`, { size: 11 });
      path(p, `M${x1 - 34},${y} A34,34 0 0 0 ${x1 - 34 * Math.cos(ang)},${y - 34 * Math.sin(ang)}`, { w: 1, opacity: 0.45 });
      // 物块要贴在斜面上，而不是悬在三角形上方
      const half = body === 'ball' ? num(spec.rPx, 20) : num(spec.bh, 38) / 2;
      // 物块旋转后，底面中心会向斜面下方偏一点；按接触点处的斜面高度计算，才不会悬空
      const contactX = cx + half * Math.sin(ang);
      const contactY = y - (y - topY) * (contactX - x0) / (x1 - x0);
      if (spec.cy == null) bodyY = contactY - half * Math.cos(ang) - 1;
      bodyAngle = -inclineDeg;
    }
  }
  if (body === 'ball') circle(p, cx, bodyY, num(spec.rPx, 20), { w: 1.6 });
  else {
    const bw = num(spec.bw, 54), bh = num(spec.bh, 38);
    const box = rect(p, cx - bw / 2, bodyY - bh / 2, bw, bh, 3, { w: 1.6 });
    if (bodyAngle) box.setAttribute('transform', `rotate(${bodyAngle} ${cx} ${bodyY})`);
    text(p, cx, bodyY + 4, spec.m || 'm', { size: 11 });
  }
  const slidingUp = /上滑|向上|沿斜面向上/.test(`${spec.motion || ''} ${spec.title || ''} ${spec.note || ''}`);
  const fAngle = surface === 'incline'
    ? (slidingUp ? 180 + inclineDeg : inclineDeg)
    : 180;
  const pullAngle = surface === 'incline'
    ? (slidingUp ? inclineDeg : 180 + inclineDeg)
    : 0;
  const list = Array.isArray(spec.forces) && spec.forces.length ? spec.forces : [
    { label: spec.G || 'G', angle: -90, mag: 1.25, name: '重力' },
    { label: spec.N || 'N', angle: 90 + inclineDeg, mag: 1.15, name: '支持力' },
    { label: spec.f || 'f', angle: fAngle, mag: 0.85, name: surface === 'incline' ? (slidingUp ? '摩擦力（沿斜面向下）' : '摩擦力（沿斜面向上）') : '摩擦力' },
    ...(spec.F ? [{ label: spec.F, angle: pullAngle, mag: 1.0, name: '拉力' }] : []),
  ];
  const base = num(spec.scale, 40);
  list.forEach((f, i) => {
    if (!f || f.show === false) return;
    const ang = (f.angle != null ? num(f.angle, 0) : (f.dir === 'down' ? -90 : f.dir === 'up' ? 90 : f.dir === 'left' ? 180 : 0)) * Math.PI / 180;
    const len = Math.max(10, num(f.mag, 1) * base);
    const ex = cx + Math.cos(ang) * len, ey = bodyY - Math.sin(ang) * len;
    arrow(p, cx, bodyY, ex, ey, { w: f.width || 1.5, dash: f.dash, opacity: f.opacity });
    const label = (f.label || ['G', 'N', 'f', 'F'][i] || '') + (f.value != null ? `=${f.value}` : '');
    if (label) {
      const tx = cx + Math.cos(ang) * (len + 13);
      const ty = bodyY - Math.sin(ang) * (len + 13);
      text(p, tx, ty + 4, label, { size: 12, italic: true, bold: true, anchor: ang > Math.PI / 2 || ang < -Math.PI / 2 ? 'end' : 'start' });
    }
  });
  if (spec.net) {
    const n = spec.net;
    arrow(p, cx, bodyY, cx + num(n.x, 0) * base, bodyY - num(n.y, 0) * base, { w: 1.8, dash: '6 4', color: 'var(--accent, #5B8DEF)' });
    text(p, cx + num(n.x, 0) * base + 8, bodyY - num(n.y, 0) * base - 8, n.label || 'F合', { size: 11, italic: true });
  }
  if (spec.legend !== false && !spec.note) {
    const forceName = { G: '重力', N: '支持力', f: '摩擦力', F: '拉力', T: '拉力' };
    const legend = list.filter(f => f && f.show !== false)
      .map(f => `${f.label || ''}${f.name || (forceName[f.label] ? ' ' + forceName[f.label] : '')}`).filter(Boolean).join('   ');
    if (legend) text(p, w / 2, h - 27, legend, { size: 9.5, opacity: 0.52 });
  }
  text(p, w / 2, h - 11, spec.note || '受力分析（各力从同一作用点画出）', { size: 11, opacity: 0.6 });
}

function kinematics(p, w, h, spec) {
  const x0 = 58, x1 = w - 28, y0 = h - 46, y1 = 30;
  const mode = String(spec.mode || spec.graph || 'vt').toLowerCase();
  const isXt = mode === 'xt' || mode === 'x-t' || mode === '位移';
  const yName = isXt ? 'x/m' : 'v/(m·s⁻¹)';
  const pts = Array.isArray(spec.points) ? spec.points.map(q => {
    if (Array.isArray(q)) return [Number(q[0]), Number(q[1])];
    return [Number(q.t || q.x), Number(q.v != null ? q.v : q.y)];
  }).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])) : [];
  if (!pts.length) {
    const u = num(spec.u, 0), a = num(spec.a, 2), T = Math.max(0.1, num(spec.T, 5));
    for (let i = 0; i <= 20; i++) {
      const t = T * i / 20;
      const y = isXt ? u * t + 0.5 * a * t * t : u + a * t;
      pts.push([t, y]);
    }
  }
  const tMax = Math.max(...pts.map(q => q[0]), 1e-6);
  const vals = pts.map(q => q[1]);
  let yMin = Math.min(...vals, 0), yMax = Math.max(...vals, 1);
  if (yMax - yMin < 1e-6) yMax = yMin + 1;
  const padY = (yMax - yMin) * 0.16;
  yMin = yMin < 0 ? yMin - padY : 0; yMax += padY;
  const X = t => x0 + (t / tMax) * (x1 - x0 - 12);
  const Y = y => y0 - ((y - yMin) / (yMax - yMin)) * (y0 - y1 - 10);
  const baseY = Y(0);
  line(p, x0, baseY, x1, baseY, { w: 1.5 });
  line(p, x0, y0, x0, y1, { w: 1.5 });
  arrow(p, x0, baseY, x1 + 2, baseY, { w: 1.2 });
  arrow(p, x0, y0, x0, y1 - 2, { w: 1.2 });
  text(p, x1 - 4, baseY + 18, 't/s', { size: 11, anchor: 'end' });
  text(p, x0 - 8, y1 + 2, yName, { size: 11, anchor: 'end' });
  text(p, x0 - 8, baseY + 14, 'O', { size: 10, anchor: 'end' });
  // 坐标轴外的辅助虚线
  [0, tMax / 2, tMax].forEach((t, i) => {
    if (i === 0) return;
    line(p, X(t), baseY, X(t), Y(pts.reduce((best, q) => Math.abs(q[0] - t) < Math.abs(best[0] - t) ? q : best, pts)[1]), { dash: '4 4', opacity: 0.35, w: 1 });
    text(p, X(t), baseY + 16, String(+t.toFixed(1)), { size: 10, opacity: 0.65 });
  });
  const d = 'M' + pts.map(q => `${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(' L');
  if (spec.area) {
    path(p, `${d} L${X(pts[pts.length - 1][0])} ${baseY} L${X(pts[0][0])} ${baseY} Z`, { fill: INK, opacity: 0.12, stroke: null });
  }
  path(p, d, { w: 2, color: 'var(--accent, #5B8DEF)' });
  pts.forEach((q, i) => {
    if (i !== 0 && i !== pts.length - 1 && i % 5 !== 0) return;
    circle(p, X(q[0]), Y(q[1]), 2.2, { fill: INK, stroke: null, opacity: 0.7 });
  });
  text(p, w / 2, h - 12, spec.note || (isXt ? '位移—时间图像' : '速度—时间图像'), { size: 11, opacity: 0.6 });
}

function projectile(p, w, h, spec) {
  const y = h - 46, x0 = 42;
  ground(p, 20, w - 20, y);
  const ang = Math.max(5, Math.min(85, num(spec.angle, 45))) * Math.PI / 180;
  const v0 = num(spec.v0, 1), g = num(spec.g, 10);
  const range = Math.max(40, Math.min(w - 100, num(spec.rangePx, 240)));
  // 默认让轨迹最高点与初速度方向一致：H = R·tanθ/4
  const H = Math.max(20, Math.min(y - 24, spec.hPx != null ? num(spec.hPx, 120) : range * Math.tan(ang) / 4));
  // 用抛物线参数式画轨迹，起点在左下，落点在右侧
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    pts.push([x0 + range * k, y - 4 * H * k * (1 - k)]);
  }
  path(p, 'M' + pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L'), { w: 2, dash: '6 4', color: 'var(--accent, #5B8DEF)' });
  arrow(p, x0, y, x0 + range * 0.22, y - range * 0.22 * Math.tan(ang), { w: 1.5 });
  text(p, x0 + 10, y - 12, spec.v0Label || 'v₀', { size: 11, italic: true });
  path(p, `M${x0 + 32},${y} A32,32 0 0 0 ${x0 + 32 * Math.cos(ang)},${y - 32 * Math.sin(ang)}`, { w: 1, opacity: 0.55 });
  text(p, x0 + 40, y - 18, `${num(spec.angle, 45)}°`, { size: 10 });
  line(p, x0, y, x0 + range, y, { dash: '4 4', opacity: 0.35, w: 1 });
  text(p, x0 + range / 2, y + 17, spec.rangeLabel || '水平射程', { size: 10, opacity: 0.65 });
  // 最高点与最大高度，让轨迹图更像考试卷上的标注图
  const apexX = x0 + range / 2, apexY = y - H;
  line(p, apexX, apexY, apexX, y, { dash: '4 4', opacity: 0.35, w: 1 });
  circle(p, apexX, apexY, 2, { fill: INK, stroke: null, opacity: 0.7 });
  text(p, apexX + 8, apexY + 4, spec.apexLabel || '最高点', { size: 9.5, anchor: 'start', opacity: 0.7 });
  text(p, apexX - 8, apexY + (H > 60 ? 38 : 20), 'H', { size: 10, italic: true, opacity: 0.65 });
  text(p, w / 2, h - 12, spec.note || '斜抛运动轨迹（虚线为轨迹）', { size: 11, opacity: 0.6 });
}

function prism(p, w, h, spec) {
  const cx = w / 2, cy = h / 2 + 18, s = Math.min(w, h) * 0.28;
  const A = [cx, cy - s], B = [cx - s * 0.92, cy + s * 0.62], C = [cx + s * 0.92, cy + s * 0.62];
  poly(p, [A, B, C], { w: 1.8 });
  const inY = cy - s * 0.12;
  const inX = cx - s * 1.55;
  line(p, inX, inY, cx - s * 0.15, inY, { w: 1.8 });
  arrow(p, inX, inY, cx - s * 0.18, inY, { w: 1.4 });
  const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#8e44ad'];
  colors.forEach((c, i) => {
    const dy = (i - (colors.length - 1) / 2) * 7;
    line(p, cx + s * 0.16, inY + dy * 0.4, cx + s * 1.55, inY + dy * 2.2, { w: 1.4, color: c });
  });
  text(p, cx, cy + s * 0.45, '三棱镜', { size: 10, opacity: 0.65 });
  text(p, inX - 4, inY - 12, spec.incident || '白光', { size: 9.5, anchor: 'end', opacity: 0.7 });
  text(p, cx + s * 1.58, inY - 16, spec.redLabel || '红', { size: 9.5, anchor: 'start', opacity: 0.65 });
  text(p, cx + s * 1.58, inY + 25, spec.violetLabel || '紫', { size: 9.5, anchor: 'start', opacity: 0.65 });
  text(p, w / 2, h - 12, spec.note || '白光经三棱镜色散', { size: 11, opacity: 0.6 });
}

function efield(p, w, h, spec) {
  const cy = h / 2 + 4;
  const ax = w * 0.3, bx = w * 0.7, r = 18;
  const qa = spec.q1 || '+', qb = spec.q2 || '−';
  circle(p, ax, cy, r, { w: 1.6 });
  circle(p, bx, cy, r, { w: 1.6 });
  text(p, ax, cy + 5, qa, { size: 16, bold: true });
  text(p, bx, cy + 5, qb, { size: 16, bold: true });
  const qaPos = !/[−-]/.test(qa), qbPos = !/[−-]/.test(qb);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const drawRadial = (cx0, positive) => {
      const near = cx0 + Math.cos(a) * (r + 4), ny = cy + Math.sin(a) * (r + 4);
      const far = cx0 + Math.cos(a) * (r + 34), fy = cy + Math.sin(a) * (r + 34);
      if (positive) arrow(p, near, ny, far, fy, { w: 1, opacity: 0.45 });
      else arrow(p, far, fy, near, ny, { w: 1, opacity: 0.45 });
    };
    drawRadial(ax, qaPos);
    drawRadial(bx, qbPos);
  }
  text(p, w / 2, h - 12, spec.note || '等量异种点电荷的电场线', { size: 11, opacity: 0.6 });
}

const SCENES = {
  car, truck, bike, train, tunnel,
  incline, forces, pulley, spring,
  circuit,
  lens, mirror, refraction,
  person, lever, pendulum, ball, conveyor, elevator, stack, float, magnet, charge,
  force2d, kinematics, projectile, prism, efield,
};

const SCENE_ALIAS = {
  '小车': 'car', '汽车': 'car', '轿车': 'car', '车': 'car', 'automobile': 'car',
  '货车': 'truck', '卡车': 'truck', 'truck': 'truck',
  '自行车': 'bike', '单车': 'bike', 'bicycle': 'bike',
  '火车': 'train', '列车': 'train', '高铁': 'train',
  '隧道': 'tunnel',
  '受力分析': 'force2d', '多力受力分析': 'force2d', '受力': 'forces', '物块': 'forces', 'force': 'forces',
  '斜面': 'incline', '斜面小车': 'incline', '斜坡': 'incline',
  '滑轮': 'pulley', '定滑轮': 'pulley', '动滑轮': 'pulley',
  '弹簧': 'spring', '弹簧振子': 'spring',
  '电路': 'circuit', '串联': 'circuit', '并联': 'circuit', '电学': 'circuit',
  '复杂电路': 'circuit', '双回路': 'circuit', '电桥': 'circuit', '惠斯通电桥': 'circuit',
  '凸透镜': 'lens', '透镜': 'lens', '成像': 'lens',
  '平面镜': 'mirror', '镜面反射': 'mirror', '反射': 'mirror',
  '折射': 'refraction', '光的折射': 'refraction',
  '人': 'person', '人站': 'person', '人站在地面': 'person', '人的受力': 'person', 'person': 'person', '人物': 'person',
  '杠杆': 'lever', '杠杆平衡': 'lever', 'lever': 'lever',
  '单摆': 'pendulum', '摆': 'pendulum', '摆球': 'pendulum',
  '小球': 'ball', '滚球': 'ball', '球': 'ball', 'ball': 'ball',
  '传送带': 'conveyor', '传送': 'conveyor',
  '电梯': 'elevator', '升降机': 'elevator', '升降电梯': 'elevator',
  '叠放': 'stack', '叠块': 'stack', '木块叠放': 'stack', '两个木块': 'stack',
  '浮力': 'float', '漂浮': 'float', '船': 'float', '木块漂浮': 'float',
  '磁铁': 'magnet', '磁极': 'magnet', '磁场': 'magnet',
  '电场线': 'efield', '点电荷电场线': 'efield', '电场': 'efield', '等量异种电荷': 'efield',
  '电荷': 'charge', '点电荷': 'charge', '库仑力': 'charge',
  '受力分析图': 'force2d', '多力平衡': 'force2d', '三力平衡': 'force2d', '共点力': 'force2d',
  '运动学': 'kinematics', '速度时间图像': 'kinematics', 'v-t图像': 'kinematics', '位移时间图像': 'kinematics',
  '平抛': 'projectile', '抛体': 'projectile', '斜抛': 'projectile', '平抛运动': 'projectile',
  '三棱镜': 'prism', '色散': 'prism', '棱镜': 'prism',
};

const SCENE_NAME = {
  car: '小车运动', truck: '货车运动', bike: '自行车运动', train: '火车运行', tunnel: '车过隧道',
  incline: '斜面上的物块', forces: '受力分析', pulley: '滑轮组', spring: '弹簧振子',
  circuit: '电路图', lens: '凸透镜成像', mirror: '平面镜成像', refraction: '光的折射',
  person: '人站在地面受力', lever: '杠杆', pendulum: '单摆', ball: '小球滚动',
  conveyor: '传送带', elevator: '电梯', stack: '叠放木块', float: '物体漂浮',
  magnet: '磁铁相互作用', charge: '点电荷',
  force2d: '多力受力分析', kinematics: '运动学图像', projectile: '抛体运动',
  prism: '三棱镜色散', efield: '点电荷电场线',
};

export function physicsSceneOf(spec) {
  if (!spec) return '';
  const raw = String(spec.scene || spec.kind || spec.name || '').trim();
  const key = raw.toLowerCase();
  if (raw) {
    const hit = SCENES[key] ? key : (SCENE_ALIAS[raw] || SCENE_ALIAS[key] || '');
    if (hit) return hit;
  }
  // scene 写错或没写，就从 title / note 里捞关键词（“人站在地面受力分析” → person）
  const hay = `${spec.title || ''} ${spec.note || ''} ${spec.caption || ''}`;
  if (!hay.trim()) return '';
  for (const word of Object.keys(SCENE_ALIAS)) {
    if (hay.includes(word)) return SCENE_ALIAS[word];
  }
  return '';
}

export function physicsCaption(spec) {
  const key = physicsSceneOf(spec);
  const name = SCENE_NAME[key] || '物理';
  return /(图|像)$/.test(name) ? name : name + '示意图';
}

// 在给定 svg 上画一整张图
export function renderPhysics(svg, w, h, spec) {
  const key = physicsSceneOf(spec);
  const fn = SCENES[key];
  if (!fn) {
    text(svg, w / 2, h / 2, '这张物理图暂时画不出来', { size: 12, opacity: 0.6 });
    return false;
  }
  const g = mk('g', {});
  svg.appendChild(g);
  fn(g, w, h, spec || {});
  return true;
}
