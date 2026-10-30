// 学习中心的画图渲染器：把 [[draw:{...}]] 里的结构化图元渲染成 SVG
import { renderPhysics, physicsSceneOf, physicsCaption } from './physics.js?v=19';
import { renderChem, chemSceneOf, CHEM_SCENE_ZH } from './chem.js?v=26';
// 支持：直角坐标系 grid / 数轴 axis / 直线 line / 抛物线 parabola / 点 point
//      多边形 polygon（平面几何、立体截面）/ 圆 circle / 角 angle / 标注 label / 函数曲线 func
// 排版：坐标标签、点名、角度用数学衬线斜体，与正文数理排版一致
const NS = 'http://www.w3.org/2000/svg';
const DEF_COLOR = 'var(--accent, #5B8DEF)';

// 安卓没有 Cambria Math / Times New Roman，会退到宋体的伪斜体（机械倾斜），观感很怪。
// 所以把有真斜体的 Georgia、Noto Serif 排在前面，宋体只做最后兜底。
const MATH_FONT = 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, "Cambria Math", serif';

// 平面几何视图：按点集自动取包围盒，等比缩放居中，四周留出标号的空间
function makeFlatView(points, w, h, pad = 42) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < 1e-6) { x0 -= 1; x1 += 1; }
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const spanX = x1 - x0, spanY = y1 - y0;
  // 留白按图形大小比例给，避免标号贴边
  const mx = spanX * 0.18, my = spanY * 0.18;
  x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  const s = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0));
  const cx = (w - (x1 - x0) * s) / 2, cy = (h - (y1 - y0) * s) / 2;
  return {
    box: { x0, x1, y0, y1 },
    toX: (x) => cx + (x - x0) * s,
    toY: (y) => h - cy - (y - y0) * s,
    s,
  };
}

function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}

// 统一坐标系：把数学坐标映射到画布像素
// 统一坐标系：等比缩放 + 居中，格子边长恒定（单位长度一致，不会出现横向格子比纵向窄）
function makeView(spec, w, h, pad = 26) {
  let gx = spec.x, gy = spec.y;
  if (!Array.isArray(gx) || gx.length !== 2) gx = [-6, 6];
  if (!Array.isArray(gy) || gy.length !== 2) gy = (spec.type === 'axis' ? [0, 0] : [-6, 6]);
  const [x0, x1] = gx, [y0, y1] = gy;
  const box = { x0, x1, y0: spec.type === 'axis' ? y0 - 1 : y0, y1: spec.type === 'axis' ? y1 + 1 : y1 };
  const spanX = Math.max(box.x1 - box.x0, 1e-6);
  const spanY = Math.max(box.y1 - box.y0, 1e-6);
  // 数学图默认等比（x、y 单位长度相等）；物理图像量纲不同，可用 aspect:"auto" 各自铺满
  // x/y 跨度差太多时（如 y=x³）等比会把图压成一条窄带，自动改成铺满，图才够大
  const ratio = spanY / spanX;
  const auto = spec.aspect === 'auto' || spec.equal === false ||
    (spec.aspect !== 'equal' && spec.equal !== true && (ratio > 2.2 || ratio < 0.45));
  const sx = (w - pad * 2) / spanX;
  const sy = (h - pad * 2) / spanY;
  const s = Math.min(sx, sy);
  if (auto) {
    const left = pad, bottom = h - pad;
    return {
      box,
      toX: (x) => left + (x - box.x0) * sx,
      toY: (y) => bottom - (y - box.y0) * sy,
      s,
    };
  }
  const cx = (w - spanX * s) / 2;
  const cy = (h - spanY * s) / 2;
  return {
    box,
    toX: (x) => cx + (x - box.x0) * s,
    toY: (y) => h - cy - (y - box.y0) * s,
    s,
  };
}

function evalPoly(a, b, c, x) { return a * x * x + b * x + c; }

// 网格单位长度：模型没给 step 时按视野自动取 1/2/5×10ⁿ，别永远挤成 1
function niceStep(span, target = 9) {
  const raw = Math.abs(span) / target || 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * pow;
}

function drawGrid(svg, v, spec) {
  const { box } = v;
  // step 可写 0.5 / 1 / 2 / 4；两轴量纲不同时可用 xstep / ystep 分开
  const stepX = Number(spec.xstep || spec.step) > 0 ? Number(spec.xstep || spec.step) : niceStep(box.x1 - box.x0);
  const stepY = Number(spec.ystep || spec.step) > 0 ? Number(spec.ystep || spec.step) : niceStep(box.y1 - box.y0);
  const g = el('g', { class: 'd-grid', stroke: 'currentColor', 'stroke-opacity': '.12', 'stroke-width': '1' });
  for (let x = Math.ceil(box.x0 / stepX) * stepX; x <= box.x1 + 1e-9; x += stepX) {
    g.appendChild(el('line', { x1: v.toX(x), y1: v.toY(box.y0), x2: v.toX(x), y2: v.toY(box.y1) }));
  }
  for (let y = Math.ceil(box.y0 / stepY) * stepY; y <= box.y1 + 1e-9; y += stepY) {
    g.appendChild(el('line', { x1: v.toX(box.x0), y1: v.toY(y), x2: v.toX(box.x1), y2: v.toY(y) }));
  }
  svg.appendChild(g);
  // 主轴 + 箭头（两根轴都带箭头，方向符合课本）
  const axis = el('g', { stroke: 'currentColor', 'stroke-opacity': '.55', 'stroke-width': '1.5', fill: 'none', 'stroke-linecap': 'round' });
  const yTop = v.toY(box.y1), xRight = v.toX(box.x1);
  // 物理解题的坐标轴有时不从 0 开始：把轴贴到可见范围边缘，别画到画布外
  const ax = Math.min(Math.max(0, box.x0), box.x1);
  const ay = Math.min(Math.max(0, box.y0), box.y1);
  const axisY = v.toY(ay), axisX = v.toX(ax);
  axis.appendChild(el('line', { x1: v.toX(box.x0), y1: axisY, x2: xRight - 6, y2: axisY }));
  axis.appendChild(el('line', { x1: axisX, y1: v.toY(box.y0), x2: axisX, y2: yTop + 6 }));
  axis.appendChild(el('path', { d: `M${xRight} ${axisY} l-9 -4.2 l0 8.4 z`, fill: 'currentColor', 'fill-opacity': '.55', stroke: 'none' }));
  axis.appendChild(el('path', { d: `M${axisX} ${yTop} l-4.2 9 l8.4 0 z`, fill: 'currentColor', 'fill-opacity': '.55', stroke: 'none' }));
  svg.appendChild(axis);
  // 刻度数字：按像素间距自动隔几个标一个，保证至少 26px；不再左右乱跳
  const pxX = Math.abs(v.toX(box.x0 + 1) - v.toX(box.x0));
  const pxY = Math.abs(v.toY(box.y0 + 1) - v.toY(box.y0));
  const everyX = Math.max(1, Math.ceil(26 / Math.max(1e-6, stepX * pxX)));
  const everyY = Math.max(1, Math.ceil(26 / Math.max(1e-6, stepY * pxY)));
  let k = 0;
  const xLabelY = axisY > v.h - 26 ? axisY - 12 : axisY + 15;
  for (let x = Math.ceil(box.x0 / stepX) * stepX; x <= box.x1 + 1e-9; x += stepX, k++) {
    if (Math.abs(x) < 1e-9 || k % everyX) continue;
    mathLabelText(svg, v.toX(x), xLabelY, String(+x.toFixed(2)), { size: 11, anchor: 'middle', opacity: '.6', bold: false, avoid: false });
  }
  k = 0;
  const yLabelRight = axisX < v.toX(box.x0) + 42;
  for (let y = Math.ceil(box.y0 / stepY) * stepY; y <= box.y1 + 1e-9; y += stepY, k++) {
    if (Math.abs(y) < 1e-9 || k % everyY) continue;
    mathLabelText(svg, yLabelRight ? axisX + 8 : axisX - 9, v.toY(y), String(+y.toFixed(2)), {
      size: 11, anchor: yLabelRight ? 'start' : 'end', opacity: '.6', bold: false, avoid: false,
    });
  }
  // 原点与轴标：O、x、y —— 课本标准写法；物理解题可自定义轴名与单位
  if (box.x0 <= 0 && box.x1 >= 0 && box.y0 <= 0 && box.y1 >= 0) {
    mathLabelText(svg, axisX - 10, axisY + 13, 'O', { size: 11, anchor: 'end', opacity: '.85' });
  }
  const xName = String(spec.xlabel || spec.xname || spec.axisX || spec.xLabel || 'x');
  const yName = String(spec.ylabel || spec.yname || spec.axisY || spec.yLabel || 'y');
  // 带斜杠/点/单位的轴名用正体，别把 m/s² 也排成斜体
  const xUpright = /[\/·]|°|℃/.test(xName);
  const yUpright = /[\/·]|°|℃/.test(yName);
  mathLabelText(svg, v.toX(box.x1) - 2, axisY - 13, xName, { size: 12, anchor: 'end', italic: !xUpright });
  mathLabelText(svg, axisX + 14, v.toY(box.y1) + 4, yName, { size: 12, anchor: 'start', italic: !yUpright });
}

function drawXAxis(svg, v, spec) {
  const { box } = v;
  const y = v.toY(0);
  const g = el('g', { stroke: 'currentColor', 'stroke-opacity': '.6', 'stroke-width': '1.4', fill: 'none' });
  g.appendChild(el('line', { x1: v.toX(box.x0), y1: y, x2: v.toX(box.x1), y2: y }));
  g.appendChild(el('path', { d: `M${v.toX(box.x1)} ${y} l-7 -4 l0 8 z`, fill: 'currentColor', 'fill-opacity': '.6', stroke: 'none' }));
  svg.appendChild(g);
  const steps = spec.step || 1;

  for (let x = Math.ceil(box.x0); x <= Math.floor(box.x1); x += steps) {
    g.appendChild(el('line', { x1: v.toX(x), y1: y - 4, x2: v.toX(x), y2: y + 4, stroke: 'currentColor', 'stroke-opacity': '.6', 'stroke-width': '1.2' }));
    mathLabelText(svg, v.toX(x), y + 19, String(x), { size: 11, anchor: 'middle', opacity: '.7', bold: false });
  }
}

function drawLine(svg, v, item) {
  const { box } = v;
  const color = item.color || DEF_COLOR;
  let p1, p2;
  if (item.through && item.through.length === 2) {
    // 两点式：延长到视野边界
    const [A, B] = item.through;
    const k = (B[1] - A[1]) / ((B[0] - A[0]) || 1e-6);
    p1 = [box.x0, A[1] + k * (box.x0 - A[0])];
    p2 = [box.x1, A[1] + k * (box.x1 - A[0])];
  } else {
    const k = Number(item.k) || 0;
    const b = Number(item.b) || 0;
    p1 = [box.x0, k * box.x0 + b];
    p2 = [box.x1, k * box.x1 + b];
  }
  const attrs = {
    x1: v.toX(p1[0]), y1: v.toY(p1[1]), x2: v.toX(p2[0]), y2: v.toY(p2[1]),
    stroke: color, 'stroke-width': item.width || 2, 'stroke-linecap': 'round',
  };
  if (item.dash) { attrs['stroke-dasharray'] = '7 6'; attrs['stroke-opacity'] = '.75'; }
  svg.appendChild(el('line', attrs));
}

function drawParabola(svg, v, item) {
  const { box } = v;
  const a = Number(item.a) || 1, b = Number(item.b) || 0, c = Number(item.c) || 0;
  const steps = 120;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = box.x0 + ((box.x1 - box.x0) * i) / steps;
    pts.push(`${v.toX(x).toFixed(2)},${v.toY(evalPoly(a, b, c, x)).toFixed(2)}`);
  }
  svg.appendChild(el('polyline', {
    points: pts.join(' '), fill: 'none', stroke: item.color || DEF_COLOR,
    'stroke-width': item.width || 2.2, 'stroke-linejoin': 'round',
  }));
  // 顶点与零点顺手标出来，省得学生自己算
  const vx = -b / (2 * a);
  const vy = evalPoly(a, b, c, vx);
  if (vx >= box.x0 && vx <= box.x1) {
    svg.appendChild(el('circle', { cx: v.toX(vx), cy: v.toY(vy), r: 2.6, fill: item.color || DEF_COLOR }));
  }
  const disc = b * b - 4 * a * c;
  if (disc >= 0) {
    const r = Math.sqrt(disc);
    [-1, 1].forEach(sgn => {
      const x = (-b + sgn * r) / (2 * a);
      if (x >= box.x0 && x <= box.x1) {
        svg.appendChild(el('circle', { cx: v.toX(x), cy: v.toY(0), r: 3, fill: 'currentColor', 'fill-opacity': '.65' }));
      }
    });
  }
}

// 通用函数曲线：item.f 是表达式字符串，例如 "x^2-2x-3" 或 "sqrt(x+1)" / "sin(x)"
// 把学生/模型写的各种式子归一：全角符号、上标、y= 前缀、不等式、|x|、隐式乘法
function normalizeExpr(expr) {
  let s = String(expr || '')
    .replace(/[−–—]/g, '-')
    .replace(/[×⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([0-9a-z])/g, 'sqrt($1)')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!s) return '';
  s = s.replace(/[{}]/g, '')
    .replace(/\barcsin\(/g, 'asin(').replace(/\barccos\(/g, 'acos(').replace(/\barctan\(/g, 'atan(')
    .replace(/\blg\(/g, 'log10(');
  // y=x²-2x-3 / f(x)=... / v=...
  s = s.replace(/^[a-z]\([a-z]\)=/, '').replace(/^[a-z]=/, '');
  // 不等式只画边界函数；等号取右边
  if (/[<>]/.test(s)) s = s.split(/[<>]/)[0];
  else if (s.includes('=')) s = s.split('=').pop();
  // |x| -> abs(x)，支持 |x-2|
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');
  // 隐式乘法：2x、2(x+1)、x(x+1)、(x+1)(x-2)、(x+1)x、2sqrt(x)
  s = s
    .replace(/(^|[^a-z0-9])([0-9])(x|\()/g, (m, pre, num, t) => `${pre}${num}*${t}`)
    .replace(/(^|[^a-z0-9])([0-9])(sqrt|abs|cbrt|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|ln|log|log2|log10|exp|floor|ceil|round|sign|sgn|max|min|pow|pi|e)/g, (m, pre, num, fn) => `${pre}${num}*${fn}`)
    .replace(/(^|[^a-z])(x|\))(\()/g, (m, pre, a, b) => `${pre}${a}*${b}`)
    .replace(/(\))(x|[0-9])/g, '$1*$2')
    .replace(/([0-9x)])(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|abs|cbrt|ln|log|exp|floor|ceil)/g, '$1*$2');
  return s;
}

function compileFn(expr, varName = 'x') {
  const src = normalizeExpr(expr);
  if (!src) return null;
  if (!/^[0-9x+\-*/().,^a-z|]+$/.test(src)) return null;
  const js = src
    .replace(/\^/g, '**')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/cbrt\(/g, 'Math.cbrt(')
    .replace(/abs\(/g, 'Math.abs(')
    // 一次替换三角函数名，避免 asin/acos/atan/sinh/cosh/tanh 里的 sin/cos/tan 被二次替换
    .replace(/\b(sinh|cosh|tanh|asin|acos|atan|sin|cos|tan)\(/g, (m, name) => `Math.${name}(`)
    .replace(/floor\(/g, 'Math.floor(')
    .replace(/ceil\(/g, 'Math.ceil(')
    .replace(/round\(/g, 'Math.round(')
    .replace(/sign\(/g, 'Math.sign(')
    .replace(/sgn\(/g, 'Math.sign(')
    .replace(/max\(/g, 'Math.max(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/pow\(/g, 'Math.pow(')
    .replace(/log2\(/g, 'Math.log2(')
    .replace(/log10\(/g, 'Math.log10(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/exp\(/g, 'Math.exp(')
    .replace(/pi/g, 'Math.PI')
    .replace(/(^|[^a-z])e(?![a-z])/g, '$1Math.E');
  try {
    // 不拿单个 x 试值：sqrt(x-2)、ln(x) 在测试点可能刚好没定义，
    // 以前会因此把合法函数判死，整张图直接不画。
    return new Function(varName, `with(Math){return ${js};}`);
  } catch (_) { return null; }
}

// 双曲线：(x-cx)²/a² − (y-cy)²/b² = 1，orient:"v" 时上下开口。
// 以前模型写成 hyperbola 图元时前端不认，整张图就空白。
function hyperbolaParams(item) {
  let a = Math.abs(Number(item.a != null ? item.a : item.A)) || 0;
  let b = Math.abs(Number(item.b != null ? item.b : item.B)) || 0;
  let vertical = item.orient === 'v' || item.orient === 'vertical' || item.vertical === true;
  const eq = String(item.eq || item.equation || item.expr || item.f || '');
  if ((!a || !b) && eq) {
    // 兼容 x^2/4 - y^2/9 = 1 这种写法
    const mx = eq.match(/x\s*\^?\s*2\s*\/\s*([\d.]+)/i);
    const my = eq.match(/y\s*\^?\s*2\s*\/\s*([\d.]+)/i);
    if (mx && my) {
      const ax = Math.sqrt(Number(mx[1]) || 1);
      const by = Math.sqrt(Number(my[1]) || 1);
      const lead = eq.trim().charAt(0).toLowerCase();
      if (lead === 'y') { vertical = true; a = by; b = ax; }
      else { a = ax; b = by; }
    }
  }
  return { a: a || 1, b: b || 1, vertical };
}

function drawHyperbola(svg, v, item) {
  const parsed = hyperbolaParams(item);
  const a = parsed.a;
  const b = parsed.b;
  const cx = Number(item.cx != null ? item.cx : item.x0) || 0;
  const cy = Number(item.cy != null ? item.cy : item.y0) || 0;
  const vertical = parsed.vertical;
  const box = v.box;
  const parts = [];
  if (vertical) {
    const f = (sgn) => `${cy}${sgn}${a}*sqrt(1+(x-(${cx}))^2/${b}^2)`;
    parts.push({ f: f('+'), domain: [box.x0, box.x1] });
    parts.push({ f: f('-'), domain: [box.x0, box.x1] });
  } else {
    const f = (sgn) => `${cy}${sgn}${b}*sqrt((x-(${cx}))^2/${a}^2-1)`;
    const leftHi = cx - a;
    const rightLo = cx + a;
    if (rightLo < box.x1) {
      parts.push({ f: f('+'), domain: [rightLo, box.x1] });
      parts.push({ f: f('-'), domain: [rightLo, box.x1] });
    }
    if (leftHi > box.x0) {
      parts.push({ f: f('+'), domain: [box.x0, leftHi] });
      parts.push({ f: f('-'), domain: [box.x0, leftHi] });
    }
  }
  parts.forEach((p) => drawFunc(svg, v, {
    type: 'func', f: p.f, domain: p.domain, color: item.color, width: item.width,
  }));
  // 渐近线：虚线，默认画，asym:false 可关
  if (item.asym !== false) {
    const k = vertical ? a / b : b / a;
    [-1, 1].forEach((sgn) => {
      drawLine(svg, v, { k: sgn * k, b: cy - sgn * k * cx, dash: true });
    });
  }
}

function endpointOpen(item, side) {
  const pick = (v) => v == null ? null : !!v;
  const direct = side === 'left'
    ? pick(item.leftOpen != null ? item.leftOpen : item.openLeft)
    : pick(item.rightOpen != null ? item.rightOpen : item.openRight);
  if (direct != null) return direct;
  const o = item.open;
  if (o === true) return true;
  if (typeof o === 'string') {
    const s = o.toLowerCase();
    return s === 'both' || s === 'all' || s === side || (side === 'left' ? s === 'start' : s === 'end');
  }
  if (Array.isArray(o)) return !!o[side === 'left' ? 0 : 1];
  const c = item.closed;
  if (c === true) return false;
  if (typeof c === 'string') {
    const s = c.toLowerCase();
    return !(s === 'both' || s === 'all' || s === side || (side === 'left' ? s === 'start' : s === 'end'));
  }
  if (Array.isArray(c)) return !c[side === 'left' ? 0 : 1];
  return false;
}

// 定义域端点：空心/实心圈 + 可选竖向虚线，考试卷上标“含/不含端点”就靠它
function drawDomainMark(svg, v, x, fn, item, side) {
  let y;
  try { y = fn(x); } catch (_) { return; }
  if (!Number.isFinite(y) || Math.abs(y) > 1e7) return;
  const px = v.toX(x), py = v.toY(y);
  if (px < -20 || px > (v.w || 360) + 20) return;
  const open = endpointOpen(item, side);
  const color = item.color || DEF_COLOR;
  if (item.guides !== false) {
    svg.appendChild(el('line', {
      x1: px, y1: v.toY(0), x2: px, y2: py,
      stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 4', 'stroke-opacity': '.32',
    }));
  }
  svg.appendChild(el('circle', {
    cx: px, cy: py, r: item.endR || 3.7,
    fill: open ? 'var(--surface, #fff)' : color,
    stroke: color, 'stroke-width': open ? 1.8 : 0,
  }));
}

function drawCurveEndDot(svg, v, px, py, item, side) {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  const open = endpointOpen(item, side);
  const color = item.color || DEF_COLOR;
  if (item.guides !== false) {
    svg.appendChild(el('line', {
      x1: px, y1: v.toY(0), x2: px, y2: py,
      stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 4', 'stroke-opacity': '.32',
    }));
  }
  svg.appendChild(el('circle', {
    cx: px, cy: py, r: item.endR || 3.7,
    fill: open ? 'var(--surface, #fff)' : color,
    stroke: color, 'stroke-width': open ? 1.8 : 0,
  }));
}

function drawFunc(svg, v, item) {
  const fn = compileFn(item.f || item.expr || '');
  if (!fn) return;
  const box = v.box;
  let lo = box.x0, hi = box.x1;
  // 支持 domain:[a,b] 只画一段（v0.9.3）
  if (Array.isArray(item.domain) && item.domain.length === 2) {
    lo = Math.max(lo, Number(item.domain[0]));
    hi = Math.min(hi, Number(item.domain[1]));
  }
  if (!(hi > lo)) return;
  const ranges = [];
  let cursor = lo;
  const breaks = Array.isArray(item.breaks)
    ? item.breaks.map(Number).filter(n => Number.isFinite(n) && n > lo && n < hi).sort((a, b) => a - b)
    : [];
  for (const b of breaks) {
    if (b > cursor) ranges.push([cursor, b]);
    cursor = b;
  }
  if (cursor < hi) ranges.push([cursor, hi]);
  if (!ranges.length) ranges.push([lo, hi]);
  const yr = Array.isArray(item.range) && item.range.length === 2
    ? [Number(item.range[0]), Number(item.range[1])]
    : null;
  // 采样时必须在「断点」处断开：√(x²-3x-4) 在 (-1,4) 没有定义，
  // 以前把所有有限点连成一条折线，中间那段会被一条直线补上，
  // 整条曲线看起来就像个抛物线。现在按不连续点切成多段分别画。
  // 同理处理 1/x、tan(x)、ln(x) 这类跳变。
  const N = 900;
  const plotH = Math.max(1, Math.abs(v.toY(box.y1) - v.toY(box.y0)));
  const maxJump = Math.max(plotH * 0.42, 46); // px，超过就视为断点
  const segments = [];
  for (const [ra, rb] of ranges) {
    let cur = [];
    let prevPy = null;
    for (let i = 0; i <= N; i++) {
      const x = ra + ((rb - ra) * i) / N;
      let y;
      try { y = fn(x); } catch (_) { y = NaN; }
      if (!Number.isFinite(y) || Math.abs(y) > 1e7 || (yr && (y < yr[0] || y > yr[1]))) {
        if (cur.length >= 2) segments.push(cur);
        cur = [];
        prevPy = null;
        continue;
      }
      const py = v.toY(y);
      if (prevPy !== null && Math.abs(py - prevPy) > maxJump) {
        // 跳过渐近线/定义域缺口，不要用直线把两段接起来
        if (cur.length >= 2) segments.push(cur);
        cur = [];
      }
      cur.push([v.toX(x), py]);
      prevPy = py;
    }
    if (cur.length >= 2) segments.push(cur);
  }
  if (!segments.length) return;
  const color = item.color || DEF_COLOR;
  const d = segments.map(pts =>
    'M' + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L')
  ).join(' ');

  // 实心填充：fill:"down" 填到 x 轴下方一侧，fill:"up" 填到上方（v0.9.3 解不等式用）
  let fill = item.fill;
  if (fill === true) fill = 'down';
  if (!fill && (item.shade || item.fillTo)) fill = item.shade || item.fillTo;
  if (fill === 'x' || fill === 'axis') fill = 'down';
  // 二元不等式 y > f(x) / y < f(x)：填满曲线上方/下方的整个半平面，
  // 不是只填曲线和 x 轴之间那一小条。
  if (!fill && item.op) fill = /^(>|>=|≥|gt|ge|above)$/i.test(String(item.op).trim()) ? 'up' : 'down';
  if (fill) {
    const dir = (fill === 'up' || fill === 'above' || fill === 'inside') ? 'up'
      : (fill === 'down' || fill === 'below') ? 'down' : '';
    if (dir) {
      const area = halfPlanePath(v, fn, dir, lo, hi);
      if (area) svg.appendChild(el('path', {
        d: area, fill: color, 'fill-opacity': String((item.alpha == null ? 0.16 : item.alpha)), stroke: 'none',
      }));
    } else {
      // 旧语义：只填曲线与 x 轴之间（积分/面积题用）
      const baseY = v.toY(0);
      for (const pts of segments) {
        if (pts.length < 2) continue;
        const area = `M${pts[0][0].toFixed(2)} ${baseY.toFixed(2)} L` +
          pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L') +
          ` L${pts[pts.length - 1][0].toFixed(2)} ${baseY.toFixed(2)} Z`;
        svg.appendChild(el('path', {
          d: area, fill: color, 'fill-opacity': String((item.alpha == null ? 0.16 : item.alpha)), stroke: 'none',
        }));
      }
    }
  }
  if (item.dash) {
    svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': item.width || 2,
      'stroke-dasharray': '6 5', 'stroke-linecap': 'round' }));
  } else {
    svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': item.width || 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  if (item.label) {
    const longest = segments.slice().sort((a, b) => b.length - a.length)[0];
    const p = longest[Math.floor(longest.length * 0.72)];
    mathLabelText(svg, p[0] + 8, p[1] - 8, item.label, { size: 12, color });
  }
  // 只有明确标了端点/开闭时才画圈，避免把“截取视野”误标成定义域端点
  const showEnds = item.noEnds !== true && (item.endpoints === true || item.open != null || item.closed != null ||
    item.leftOpen != null || item.rightOpen != null);
  if (showEnds && Array.isArray(item.domain) && item.domain.length === 2) {
    drawDomainMark(svg, v, Number(item.domain[0]), fn, item, 'left');
    drawDomainMark(svg, v, Number(item.domain[1]), fn, item, 'right');
  }
}

// 分段函数：每段独立采样，段与段之间不连线；端点默认画圈（可在 piece 里用 open 控制空心）
function drawPiecewise(svg, v, item) {
  const pieces = Array.isArray(item.pieces) ? item.pieces
    : (Array.isArray(item.cases) ? item.cases : (Array.isArray(item.items) ? item.items : []));
  const marks = new Map();
  pieces.forEach((pc, i) => {
    if (!pc || (!pc.f && !pc.expr)) return;
    const fItem = {
      type: 'func',
      f: pc.f || pc.expr,
      domain: pc.domain || pc.x,
      color: pc.color || item.color,
      width: pc.width || item.width,
      dash: pc.dash,
      label: pc.label,
      open: pc.open,
      closed: pc.closed,
      leftOpen: pc.leftOpen,
      rightOpen: pc.rightOpen,
      endpoints: pc.endpoints !== false,
      guides: pc.guides !== false,
      endR: pc.endR || item.endR,
      noEnds: true,
    };
    drawFunc(svg, v, fItem);
    if (pc.endpoints === false) return;
    // 分段边界可能被两段共用：同一坐标只留一个圈，实心优先于空心
    const dom = Array.isArray(fItem.domain) && fItem.domain.length === 2 ? fItem.domain.map(Number) : null;
    const fn = compileFn(fItem.f);
    if (!dom || !fn) return;
    ['left', 'right'].forEach((side) => {
      const x = side === 'left' ? dom[0] : dom[1];
      let y; try { y = fn(x); } catch (_) { return; }
      if (!Number.isFinite(y) || Math.abs(y) > 1e7) return;
      const key = `${x.toFixed(6)}|${y.toFixed(6)}`;
      const open = endpointOpen(fItem, side);
      const prev = marks.get(key);
      if (prev) {
        prev.open = prev.open && open;
        prev.guides = prev.guides || fItem.guides;
      } else {
        marks.set(key, { x, fn, open, guides: fItem.guides, color: fItem.color, endR: fItem.endR });
      }
    });
  });
  marks.forEach((m) => drawDomainMark(svg, v, m.x, m.fn, {
    color: m.color, guides: m.guides, endR: m.endR, open: m.open,
  }, 'left'));
}

// 极坐标曲线：r = f(θ)，默认 θ∈[0,2π]；螺旋用 theta:[0,6π] 或 turns:3
function drawPolar(svg, v, item) {
  const raw = String(item.r || item.f || item.expr || '1')
    .replace(/θ/g, 't').replace(/\btheta\b/gi, 't');
  const fn = compileFn(raw, 't');
  if (!fn) return;
  let tr = Array.isArray(item.theta) ? item.theta
    : (Array.isArray(item.t) ? item.t : null);
  if (!tr && Number(item.turns) > 0) tr = [0, Number(item.turns) * Math.PI * 2];
  if (!tr) tr = [0, Math.PI * 2];
  const a = Number(tr[0]), b = Number(tr[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
  const N = 1600, segments = [];
  let cur = [];
  for (let i = 0; i <= N; i++) {
    const t = a + ((b - a) * i) / N;
    let r;
    try { r = fn(t); } catch (_) { r = NaN; }
    if (!Number.isFinite(r) || Math.abs(r) > 1e6) {
      if (cur.length >= 2) segments.push(cur);
      cur = [];
      continue;
    }
    cur.push([v.toX(r * Math.cos(t)), v.toY(r * Math.sin(t))]);
  }
  if (cur.length >= 2) segments.push(cur);
  if (!segments.length) return;
  const color = item.color || DEF_COLOR;
  const d = segments.map(pts =>
    'M' + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L')
  ).join(' ');
  svg.appendChild(el('path', {
    d, fill: 'none', stroke: color, 'stroke-width': item.width || 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': item.dash ? '6 5' : null,
  }));
  if (item.label) {
    const longest = segments.slice().sort((x, y) => y.length - x.length)[0];
    const p = longest[Math.floor(longest.length * 0.6)];
    mathLabelText(svg, p[0] + 8, p[1] - 8, item.label, { size: 12, color });
  }
  if (item.endpoints === true || item.open != null || item.closed != null) {
    [[a, 'left'], [b, 'right']].forEach(([t, side]) => {
      let r; try { r = fn(t); } catch (_) { return; }
      if (Number.isFinite(r)) drawCurveEndDot(svg, v, v.toX(r * Math.cos(t)), v.toY(r * Math.sin(t)), item, side);
    });
  }
}

// 参数方程：x=f(t), y=g(t)，适合圆、椭圆、利萨茹图、摆线
function drawParametric(svg, v, item) {
  const fx = compileFn(item.x || item.fx || 'cos(t)', 't');
  const fy = compileFn(item.y || item.fy || 'sin(t)', 't');
  if (!fx || !fy) return;
  const tr = Array.isArray(item.t) ? item.t : (Array.isArray(item.theta) ? item.theta : [0, Math.PI * 2]);
  const a = Number(tr[0]), b = Number(tr[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
  const N = 1400, segments = [];
  let cur = [];
  for (let i = 0; i <= N; i++) {
    const t = a + ((b - a) * i) / N;
    let x, y;
    try { x = fx(t); y = fy(t); } catch (_) { x = NaN; y = NaN; }
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) {
      if (cur.length >= 2) segments.push(cur);
      cur = [];
      continue;
    }
    cur.push([v.toX(x), v.toY(y)]);
  }
  if (cur.length >= 2) segments.push(cur);
  if (!segments.length) return;
  const color = item.color || DEF_COLOR;
  const d = segments.map(pts =>
    'M' + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L')
  ).join(' ');
  svg.appendChild(el('path', {
    d, fill: item.fill ? color : 'none', 'fill-opacity': item.fill ? String(item.alpha == null ? 0.12 : item.alpha) : '0',
    stroke: color, 'stroke-width': item.width || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': item.dash ? '6 5' : null,
  }));
}

// 极坐标/参数方程没给 x、y 范围时，自动按曲线包围盒取景，避免螺线被 [-6,6] 切掉
function autoRangeForCurve(spec) {
  const pts = [];
  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e5 && Math.abs(y) < 1e5) pts.push([x, y]);
  };
  if (spec.type === 'polar' || spec.type === 'spiral') {
    const raw = String(spec.r || spec.f || spec.expr || '1').replace(/θ/g, 't').replace(/\btheta\b/gi, 't');
    const fn = compileFn(raw, 't');
    if (!fn) return null;
    let tr = Array.isArray(spec.theta) ? spec.theta : (Array.isArray(spec.t) ? spec.t : null);
    if (!tr && Number(spec.turns) > 0) tr = [0, Number(spec.turns) * Math.PI * 2];
    if (!tr) tr = [0, Math.PI * 2];
    const a = Number(tr[0]), b = Number(tr[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    for (let i = 0; i <= 720; i++) {
      const t = a + (b - a) * i / 720;
      let r; try { r = fn(t); } catch (_) { continue; }
      push(r * Math.cos(t), r * Math.sin(t));
    }
  } else if (spec.type === 'parametric') {
    const fx = compileFn(spec.x || spec.fx || 'cos(t)', 't');
    const fy = compileFn(spec.y || spec.fy || 'sin(t)', 't');
    if (!fx || !fy) return null;
    const tr = Array.isArray(spec.t) ? spec.t : (Array.isArray(spec.theta) ? spec.theta : [0, Math.PI * 2]);
    const a = Number(tr[0]), b = Number(tr[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    for (let i = 0; i <= 720; i++) {
      const t = a + (b - a) * i / 720;
      let x, y; try { x = fx(t); y = fy(t); } catch (_) { continue; }
      push(x, y);
    }
  } else if (spec.type === 'piecewise') {
    const pieces = spec.pieces || spec.cases || [];
    for (const pc of pieces) {
      const dom = pc && (pc.domain || pc.x);
      if (!pc || !Array.isArray(dom) || dom.length !== 2) continue;
      const fn = compileFn(pc.f || pc.expr || '');
      if (!fn) continue;
      const a = Number(dom[0]), b = Number(dom[1]);
      for (let i = 0; i <= 120; i++) {
        const x = a + (b - a) * i / 120;
        let y; try { y = fn(x); } catch (_) { continue; }
        push(x, y);
      }
    }
  }
  if (pts.length < 2) return null;
  let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
  let y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const padX = Math.max((x1 - x0) * 0.12, 0.8), padY = Math.max((y1 - y0) * 0.12, 0.8);
  return { x: [x0 - padX, x1 + padX], y: [y0 - padY, y1 + padY] };
}

// 把采样点夹在画布上下边界内，曲线跑出视野时仍能正确表示"整片半平面"
function clampY(v, py) {
  const top = v.toY(v.box.y1), bottom = v.toY(v.box.y0);
  return Math.max(Math.min(top, bottom) - 0.5, Math.min(Math.max(top, bottom) + 0.5, py));
}

function sampleCurve(v, fn, lo, hi, N = 300) {
  const out = [];
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const y = fn(x);
    if (!Number.isFinite(y)) continue;
    out.push([v.toX(x), clampY(v, v.toY(y))]);
  }
  return out;
}

// y > f(x)：曲线以上整片填满；y < f(x)：曲线以下整片填满
function halfPlanePath(v, fn, dir, lo, hi) {
  const box = v.box;
  lo = Math.max(Number(lo), box.x0);
  hi = Math.min(Number(hi), box.x1);
  if (!(hi > lo)) { lo = box.x0; hi = box.x1; }
  const pts = sampleCurve(v, fn, lo, hi);
  if (pts.length < 2) return null;
  const edge = dir === 'up' ? v.toY(box.y1) : v.toY(box.y0);
  const left = v.toX(lo), right = v.toX(hi);
  const first = pts[0], last = pts[pts.length - 1];
  return `M${left.toFixed(1)} ${edge.toFixed(1)} L${first[0].toFixed(1)} ${first[1].toFixed(1)} L` +
    pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') +
    ` L${right.toFixed(1)} ${edge.toFixed(1)} Z`;
}

// 两条曲线之间填色（f 在上、g 在下都行，按实际采样画闭合多边形）
function betweenPath(v, f, g, lo, hi) {
  const box = v.box;
  lo = Math.max(Number(lo), box.x0);
  hi = Math.min(Number(hi), box.x1);
  if (!(hi > lo)) { lo = box.x0; hi = box.x1; }
  const a = sampleCurve(v, f, lo, hi);
  const b = sampleCurve(v, g, lo, hi);
  if (a.length < 2 || b.length < 2) return null;
  return 'M' + a.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') +
    ' L' + b.slice().reverse().map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z';
}

// x > f(y)：横向半平面
function halfPlanePathX(v, fn, dir, lo, hi) {
  const box = v.box;
  lo = Math.max(Number(lo), box.y0);
  hi = Math.min(Number(hi), box.y1);
  if (!(hi > lo)) { lo = box.y0; hi = box.y1; }
  const N = 300, pts = [];
  for (let i = 0; i <= N; i++) {
    const y = lo + ((hi - lo) * i) / N;
    const x = fn(y);
    if (!Number.isFinite(x)) continue;
    // 夹到坐标框左右边界，别把填充画到画布外
    const leftEdge = v.toX(box.x0), rightEdge = v.toX(box.x1);
    const px = Math.max(Math.min(leftEdge, rightEdge) - 0.5, Math.min(Math.max(leftEdge, rightEdge) + 0.5, v.toX(x)));
    pts.push([px, v.toY(y)]);
  }
  if (pts.length < 2) return null;
  const edge = dir === 'right' ? v.toX(box.x1) : v.toX(box.x0);
  const first = pts[0], last = pts[pts.length - 1];
  return `M${edge.toFixed(1)} ${v.toY(lo).toFixed(1)} L${first[0].toFixed(1)} ${first[1].toFixed(1)} L` +
    pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') +
    ` L${edge.toFixed(1)} ${v.toY(hi).toFixed(1)} Z`;
}

// 二元不等式区域：y > f(x)、y < f(x)、x > f(y)、f < y < g
function isInclusive(op) {
  return /≤|≥|<=|>=|\b(?:le|ge|leq|geq)\b/i.test(String(op || ''));
}

function prettyExpr(expr) {
  return String(expr || '')
    .replace(/^[a-z]\s*=\s*/i, '')
    .replace(/\*/g, '')
    .replace(/\^2/g, '²').replace(/\^3/g, '³')
    .replace(/pi/g, 'π');
}

function regionFormula(item) {
  const map = { '<=': '≤', '>=': '≥', le: '≤', ge: '≥', leq: '≤', geq: '≥', lt: '<', gt: '>', '<': '<', '>': '>', '≤': '≤', '≥': '≥' };
  const raw = String(item.op || item.ineq || '<=').trim().toLowerCase();
  const op = map[raw] || '≤';
  const f = prettyExpr(item.f || item.expr || item.y || '');
  if (item.g) return `${f} ${op} y ${op} ${prettyExpr(item.g)}`;
  if (item.axis === 'x' || item.form === 'x') return `x ${op} ${f}`;
  return `y ${op} ${f}`;
}

function drawRegion(svg, v, item) {
  const raw = String(item.op || item.ineq || '>').trim();
  const up = /^(>|>=|≥|gt|ge|above|up)$/i.test(raw);
  // ≤ / ≥ / <= / >= 都是实线；只有严格 > / < 才虚线
  const solidEdge = isInclusive(raw);
  const color = item.color || DEF_COLOR;
  let d = null;
  let edge = null;

  if (item.axis === 'x' || item.form === 'x') {
    // 横向区域 x = f(y)，自变量是 y
    const fn = compileFn(item.f || item.expr || '', 'y');
    if (!fn) return;
    const yr = Array.isArray(item.y) ? item.y : (Array.isArray(item.domain) ? item.domain : [v.box.y0, v.box.y1]);
    d = halfPlanePathX(v, fn, up ? 'right' : 'left', Number(yr[0]), Number(yr[1]));
    edge = { fn, lo: Number(yr[0]), hi: Number(yr[1]), axis: 'y' };
  } else if (item.g) {
    const f = compileFn(item.f || item.expr || '');
    const g = compileFn(item.g);
    if (!f || !g) return;
    const xr = Array.isArray(item.x) ? item.x : (Array.isArray(item.domain) ? item.domain : [v.box.x0, v.box.x1]);
    d = betweenPath(v, f, g, Number(xr[0]), Number(xr[1]));
    edge = { fn: f, fn2: g, lo: Number(xr[0]), hi: Number(xr[1]), axis: 'x' };
  } else {
    const fn = compileFn(item.f || item.expr || item.y || '');
    if (!fn) return;
    const xr = Array.isArray(item.x) ? item.x : (Array.isArray(item.domain) ? item.domain : [v.box.x0, v.box.x1]);
    d = halfPlanePath(v, fn, up ? 'up' : 'down', Number(xr[0]), Number(xr[1]));
    edge = { fn, lo: Number(xr[0]), hi: Number(xr[1]), axis: 'x' };
  }

  if (!d) return;
  svg.appendChild(el('path', {
    d, fill: color, 'fill-opacity': String(item.alpha == null ? 0.16 : item.alpha), stroke: 'none',
  }));
  // 边界线：region 只填色不画线时，图上就只剩一片色块，学生看不出是哪条抛物线。
  // 严格不等式用虚线，含等号用实线。
  if (item.stroke !== false && edge) {
    strokeCurve(svg, v, edge.fn, edge.lo, edge.hi, item, solidEdge, edge.axis);
    if (edge.fn2) strokeCurve(svg, v, edge.fn2, edge.lo, edge.hi, item, solidEdge, edge.axis);
  }
  // 图上直接写解析式，别只给一片色块让学生猜
  if (item.showExpr !== false) {
    const text = item.label || item.exprLabel || regionFormula(item);
    if (text) {
      mathLabelText(svg, v.toX(v.box.x0) + 14, v.toY(v.box.y1) + 18, text, {
        size: 12.5, anchor: 'start', avoid: false,
      });
    }
  }
}

function strokeCurve(svg, v, fn, lo, hi, item, solid, axis = 'x') {
  const N = 260, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = lo + ((hi - lo) * i) / N;
    const val = fn(t);
    if (!Number.isFinite(val)) continue;
    const px = axis === 'y' ? v.toX(val) : v.toX(t);
    const py = axis === 'y' ? v.toY(t) : v.toY(val);
    pts.push([px, py]);
  }
  if (pts.length < 2) return;
  const p = el('path', {
    d: 'M' + pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L'),
    fill: 'none', stroke: item.color || DEF_COLOR,
    'stroke-width': item.width || 2.2, 'stroke-linejoin': 'round', 'stroke-opacity': '.95',
  });
  if (!solid) p.setAttribute('stroke-dasharray', '6 4');
  svg.appendChild(p);
}

// 解集色带：把 x 轴上一段区间填成实心（解不等式用，v0.9.3）
function drawArea(svg, v, item) {
  // area 里带了函数表达式，就是在画二元不等式的平面区域
  if (item.f || item.expr) { drawRegion(svg, v, item); return; }
  const rawOp = String(item.op || item.range || 'between').trim();
  let op = ({ '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le', '≥': 'ge', '≤': 'le' })[rawOp] || rawOp;
  let from, to;
  if (Array.isArray(item.from)) {
    from = Number(item.from[0]); to = Number(item.from[1]);
    // 给了两个端点却写 < / >，实际想画的是这两点之间的解集
    if (op === 'lt' || op === 'le' || op === 'gt' || op === 'ge') {
      op = 'between';
    }
  } else if (item.from != null) {
    from = Number(item.from);
    to = item.to != null ? Number(item.to) : v.box.x1;
  } else {
    return;
  }
  if (!Number.isFinite(from)) return;
  if (!Number.isFinite(to)) to = v.box.x1;
  const y0 = v.toY(v.box.y0), y1 = v.toY(v.box.y1);
  const ranges = [];
  if (op === 'between') ranges.push([from, to]);
  else if (op === 'gt' || op === 'ge') ranges.push([from, v.box.x1]);
  else if (op === 'lt' || op === 'le') ranges.push([v.box.x0, from]);
  const color = item.color || DEF_COLOR;
  for (const [a, b] of ranges) {
    const x1 = v.toX(Math.max(a, v.box.x0)), x2 = v.toX(Math.min(b, v.box.x1));
    if (!(x2 > x1)) continue;
    svg.appendChild(el('rect', {
      x: x1, y: Math.min(y0, y1), width: x2 - x1, height: Math.abs(y0 - y1),
      fill: color, 'fill-opacity': String((item.alpha == null ? 0.14 : item.alpha)), stroke: 'none',
    }));
    // 边界线：大于/小于画虚线，含等于画实线
    if (op === 'ge' || op === 'le' || op === 'between') {
      for (const edge of [a, b]) {
        const ex = v.toX(edge);
        if (ex < v.toX(v.box.x0) || ex > v.toX(v.box.x1)) continue;
        svg.appendChild(el('line', { x1: ex, y1: Math.min(y0, y1), x2: ex, y2: Math.max(y0, y1),
          stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '5 4', 'stroke-opacity': '.75' }));
      }
    }
  }
  if (item.label) {
    const cx = v.toX((Math.max(ranges[0] ? ranges[0][0] : 0, v.box.x0) + Math.min(ranges[0] ? ranges[0][1] : 0, v.box.x1)) / 2);
    mathLabelText(svg, cx, v.toY(0) - 12, item.label, { size: 12, color });
  }
}

// 竖直参考线
function drawVLine(svg, v, item) {
  const color = item.color || DEF_COLOR;
  svg.appendChild(el('line', {
    x1: v.toX(item.x), y1: v.toY(v.box.y0), x2: v.toX(item.x), y2: v.toY(v.box.y1),
    stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': item.dash === false ? 'none' : '6 5', 'stroke-opacity': '.8',
  }));
  if (item.label) mathLabelText(svg, v.toX(item.x) + 6, v.toY(v.box.y1) + 14, item.label, { size: 11, color, anchor: 'start' });
}

function drawPoint(svg, v, item) {
  const color = item.color || 'currentColor';
  const raw = String(item.style || item.fill || item.point || '').toLowerCase();
  // 空心点：不等式端点、分段函数断点、区间开端点都靠它。
  // 模型会写 hollow / open / unfilled / filled:false 各种说法，这里一次认全。
  const hollow = item.hollow === true || item.open === true || item.unfilled === true ||
    item.filled === false || /hollow|open|empty|unfilled|空心/.test(raw);
  if (hollow) {
    // 先用背景色盖住底下的线，再描边，点心里不会漏出坐标轴
    svg.appendChild(el('circle', {
      cx: v.toX(item.x), cy: v.toY(item.y), r: item.r || 3.6,
      fill: 'var(--surface, #fff)', stroke: color, 'stroke-width': item.width || 1.8,
    }));
  } else {
    svg.appendChild(el('circle', { cx: v.toX(item.x), cy: v.toY(item.y), r: item.r || 3.2, fill: color }));
  }
  if (item.label) {
    const dir = item.labelDir || 'ne';
    const off = {
      ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
      n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
    }[dir] || [1, -1];
    const R = item.labelGap || 13;
    mathLabelText(svg, v.toX(item.x) + off[0] * R, v.toY(item.y) + off[1] * R, item.label, {
      anchor: off[0] > 0 ? 'start' : (off[0] < 0 ? 'end' : 'middle'),
    });
  }
}

// 数学标注统一：衬线 + 真斜体 + 加粗 + 背景衬底（白/底色描边），保证压线也认得出
export function mathLabelText(svg, x, y, text, opts = {}) {
  const size = opts.size || 13;
  const anchor = opts.anchor || 'middle';
  // 标签防重叠：零点、顶点、端点常常挤在一个坐标上，自动往四周挪，
  // 找不到空位就选重叠面积最小的位置。
  if (opts.avoid !== false) {
    const boxes = svg.__labelBoxes || (svg.__labelBoxes = []);
    const measure = (px, py, an) => {
      let w = 0;
      for (const ch of String(text)) w += (ch.charCodeAt(0) > 255 ? size : size * 0.62);
      const h = size * 1.3;
      const x0 = an === 'start' ? px : an === 'end' ? px - w : px - w / 2;
      return { x0, x1: x0 + w, y0: py - h / 2, y1: py + h / 2 };
    };
    const hit = (a, b) => a.x0 < b.x1 + 2 && a.x1 > b.x0 - 2 && a.y0 < b.y1 + 2 && a.y1 > b.y0 - 2;
    const step = size * 1.35;
    const cands = [[0, 0], [0, -step], [0, step], [step, 0], [-step, 0],
      [step, -step], [-step, -step], [step, step], [-step, step],
      [0, -step * 2], [0, step * 2], [step * 2, 0], [-step * 2, 0]];
    let best = [0, 0], bestScore = Infinity;
    for (const [dx, dy] of cands) {
      const box = measure(x + dx, y + dy, anchor);
      let score = 0;
      for (const b of boxes) if (hit(box, b)) score++;
      if (score === 0) { best = [dx, dy]; bestScore = 0; break; }
      if (score < bestScore) { bestScore = score; best = [dx, dy]; }
    }
    x += best[0]; y += best[1];
    boxes.push(measure(x, y, anchor));
  }
  const t = el('text', {
    x, y,
    fill: opts.color || 'currentColor',
    'fill-opacity': opts.opacity || '.95',
    'font-size': size,
    'font-style': opts.italic === false ? 'normal' : 'italic',
    'font-weight': opts.bold === false ? '500' : '700',
    'font-family': MATH_FONT,
    'text-anchor': anchor,
    'dominant-baseline': opts.baseline || 'middle',
    stroke: opts.halo === false ? 'none' : 'var(--surface, #fff)',
    'stroke-width': opts.halo === false ? 0 : 3,
    'stroke-linejoin': 'round',
    'paint-order': 'stroke',
  });
  t.textContent = text;
  svg.appendChild(t);
  return t;
}

function drawPolygon(svg, v, item) {
  const points = item.points || [];
  const pts = points.map(([x, y]) => `${v.toX(x)},${v.toY(y)}`).join(' ');
  svg.appendChild(el('polygon', {
    points: pts, fill: item.fill || 'currentColor', 'fill-opacity': (item.alpha == null ? 0.1 : item.alpha),
    stroke: item.color || DEF_COLOR, 'stroke-width': item.width || 2, 'stroke-linejoin': 'round',
  }));
  // 图形中心（像素系），用来决定标注往哪个方向让开
  const cx = points.reduce((a, p) => a + v.toX(p[0]), 0) / (points.length || 1);
  const cy = points.reduce((a, p) => a + v.toY(p[1]), 0) / (points.length || 1);
  (item.labels || []).forEach((lbl, i) => {
    const p = points[i];
    if (!p || !lbl) return;
    let px = v.toX(p[0]), py = v.toY(p[1]);
    let dx = px - cx, dy = py - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // 几乎在中心（退化图形）就默认右上
    if (len < 1) { dx = 0.7; dy = -0.7; }
    const R = item.labelGap || 15;
    let ax = px + dx * R, ay = py + dy * R;
    const anchor = dx > 0.35 ? 'start' : (dx < -0.35 ? 'end' : 'middle');
    mathLabelText(svg, ax, ay, lbl, { anchor });
  });
}

// 三角形：画边 + 顶点标号 + 可选直角/等长标记
function drawTriangle(svg, v, item) {
  const pts = item.points || [];
  if (pts.length < 3) return;
  drawPolygon(svg, v, Object.assign({}, item, { alpha: (item.alpha == null ? 0 : item.alpha), fill: item.fill || 'none' }));
  const [A, B, C] = pts;
  // 直角：勾在中间那个顶点
  const idx = item.right === true ? 1 : (Number.isInteger(item.right) ? item.right : -1);
  if (idx >= 0 && pts.length >= 3) {
    const P = pts[idx], Q = pts[(idx + 1) % 3], R = pts[(idx + 2) % 3];
    const ux = v.toX(Q[0]) - v.toX(P[0]), uy = v.toY(Q[1]) - v.toY(P[1]);
    const wx = v.toX(R[0]) - v.toX(P[0]), wy = v.toY(R[1]) - v.toY(P[1]);
    const lu = Math.hypot(ux, uy) || 1, lw = Math.hypot(wx, wy) || 1;
    const k = Math.min(lu, lw) * 0.16;
    const p1 = [v.toX(P[0]) + ux / lu * k, v.toY(P[1]) + uy / lu * k];
    const p2 = [p1[0] + wx / lw * k, p1[1] + wy / lw * k];
    const p3 = [v.toX(P[0]) + wx / lw * k, v.toY(P[1]) + wy / lw * k];
    svg.appendChild(el('path', {
      d: `M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]} L${p3[0]} ${p3[1]}`,
      fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.6', 'stroke-width': 1.2,
    }));
  }
  // 等边：三条边中点各画一道小竖线
  const eq = item.equal || item.ticks;
  if (eq) {
    const marks = Array.isArray(eq) ? eq : [1, 1, 1];
    for (let i = 0; i < 3; i++) {
      const n = Number(marks[i] || 0);
      if (!n) continue;
      const P = pts[i], Q = pts[(i + 1) % 3];
      const mx = (v.toX(P[0]) + v.toX(Q[0])) / 2, my = (v.toY(P[1]) + v.toY(Q[1])) / 2;
      let dx = v.toX(Q[0]) - v.toX(P[0]), dy = v.toY(Q[1]) - v.toY(P[1]);
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      for (let j = 0; j < n; j++) {
        const off = (j - (n - 1) / 2) * 4;
        const bx = mx + dx / l * off, by = my + dy / l * off;
        svg.appendChild(el('line', {
          x1: bx - nx * 5, y1: by - ny * 5, x2: bx + nx * 5, y2: by + ny * 5,
          stroke: 'currentColor', 'stroke-opacity': '.65', 'stroke-width': 1.3,
        }));
      }
    }
  }
}

function drawCircle(svg, v, item) {
  const cx = v.toX(item.x || 0), cy = v.toY(item.y || 0), r = (item.r || 1) * v.s;
  svg.appendChild(el('circle', {
    cx, cy, r, fill: item.fill || 'none',
    'fill-opacity': item.fill ? String((item.alpha == null ? 0.14 : item.alpha)) : '0',
    stroke: item.color || DEF_COLOR, 'stroke-width': item.width || 2,
    'stroke-dasharray': item.dash ? '6 5' : null,
  }));
  // 圆心与小圆点（v0.9.4：以前圆只画个圈，连 O 都没有）
  svg.appendChild(el('circle', { cx, cy, r: 2.2, fill: item.color || DEF_COLOR }));
  if (item.label) mathLabelText(svg, cx + 9, cy + 9, item.label, { size: 12, color: item.color || DEF_COLOR, anchor: 'start' });
  if (item.radius) {
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: cx + r, y2: cy,
      stroke: item.color || DEF_COLOR, 'stroke-width': 1.4, 'stroke-dasharray': '5 4', 'stroke-opacity': '.7' }));
  }
}

// 向量：带箭头 + 标签
function drawVector(svg, v, item) {
  const from = item.from || [0, 0], to = item.to || [1, 1];
  const x1 = v.toX(from[0]), y1 = v.toY(from[1]), x2 = v.toX(to[0]), y2 = v.toY(to[1]);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = 8;
  const color = item.color || DEF_COLOR;
  svg.appendChild(el('line', {
    x1, y1, x2: x2 - Math.cos(ang) * head * 0.6, y2: y2 - Math.sin(ang) * head * 0.6,
    stroke: color, 'stroke-width': item.width || 2, 'stroke-linecap': 'round',
  }));
  svg.appendChild(el('path', {
    d: `M${x2} ${y2} L${x2 - head * Math.cos(ang - 0.32)} ${y2 - head * Math.sin(ang - 0.32)} L${x2 - head * Math.cos(ang + 0.32)} ${y2 - head * Math.sin(ang + 0.32)} Z`,
    fill: color,
  }));
  if (item.label) {
    mathLabelText(svg, (x1 + x2) / 2 + Math.sin(ang) * 12, (y1 + y2) / 2 - Math.cos(ang) * 12, item.label, { size: 12 });
  }
}

function drawLabel(svg, v, item) {
  mathLabelText(svg, v.toX(item.x || 0), v.toY(item.y || 0), item.text || '', {
    anchor: item.anchor || 'middle',
    color: item.color || 'currentColor',
  });
}

/* ---------------- 立体几何 ----------------
   等轴测投影：把 (x,y,z) 投到屏幕。z 是竖直方向，x 向右后，y 向右前。
   用固定的 30° 轴测，观感接近课本插图；被挡住的棱自动画虚线（按顶点到观察者的深度判断）。 */
// 两轴用不同倾角，避免正方体沿体对角线看时 A 与 C1 投影重合。
// 25°/50° 接近课本斜二测，但不会把前后顶点叠在一起。
const ANG_X = 25 * Math.PI / 180;
const ANG_Y = 50 * Math.PI / 180;
const COS_X = Math.cos(ANG_X), SIN_X = Math.sin(ANG_X);
const COS_Y = Math.cos(ANG_Y), SIN_Y = Math.sin(ANG_Y);

function isoProject(p) {
  const [x, y, z] = p;
  return [x * COS_X - y * COS_Y, x * SIN_X + y * SIN_Y - z];
}

function solidGeom(item) {
  const shape = shapeOf(item);
  const size = item.size || [4, 4, 4];
  const [a, b, c] = size;
  if (shape === 'cube' || shape === 'cuboid') {
    const v = [
      [0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0],
      [0, 0, c], [a, 0, c], [a, b, c], [0, b, c],
    ];
    const e = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const f = [
      [0, 1, 2, 3], [4, 5, 6, 7],
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
    ];
    return { verts: v, edges: e, faces: f };
  }
  if (shape === 'prism') {
    const n = item.n || 3;
    const r = item.r || 2;
    const h = Number(item.h) || c;
    const verts = [], edges = [];
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n + Math.PI / 2;
      verts.push([r * Math.cos(t), r * Math.sin(t), 0]);
    }
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n + Math.PI / 2;
      verts.push([r * Math.cos(t), r * Math.sin(t), h]);
    }
    for (let i = 0; i < n; i++) {
      edges.push([i, (i + 1) % n], [i + n, (i + 1) % n + n], [i, i + n]);
    }
    const faces = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => i + n)];
    for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
    return { verts, edges, faces };
  }
  if (shape === 'pyramid') {
    const n = item.n || 4;
    const r = item.r || 2;
    const h = Number(item.h) || c;
    const verts = [], edges = [];
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n + Math.PI / 2;
      verts.push([r * Math.cos(t), r * Math.sin(t), 0]);
    }
    verts.push([0, 0, h]);
    const apex = n;
    for (let i = 0; i < n; i++) {
      edges.push([i, (i + 1) % n], [i, apex]);
    }
    const faces = [Array.from({ length: n }, (_, i) => i)];
    for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, apex]);
    return { verts, edges, faces };
  }
  return { verts: [], edges: [] };
}

function drawSolid(svg, v, item) {
  const shape = shapeOf(item);

  // 球：外轮廓 + 赤道 + 一条经线；圆心点单独画出来
  if (shape === 'sphere') {
    const r = Math.abs(Number(item.r) || Number(item.size && item.size[0]) || 2) || 2;
    const viewS = makeFlatView([[-r, -r], [r, r]], v.w, v.h, 46);
    const cx = viewS.toX(0), cy = viewS.toY(0), rr = r * viewS.s;
    const ry = rr * 0.32;
    svg.appendChild(el('circle', { cx, cy, r: rr, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.8', 'stroke-width': 1.9 }));
    svg.appendChild(el('path', {
      d: `M ${cx - rr} ${cy} A ${rr} ${ry} 0 0 1 ${cx + rr} ${cy}`,
      fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.28', 'stroke-width': 1.3, 'stroke-dasharray': '5 4',
    }));
    svg.appendChild(el('path', {
      d: `M ${cx - rr} ${cy} A ${rr} ${ry} 0 0 0 ${cx + rr} ${cy}`,
      fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.7', 'stroke-width': 1.7,
    }));
    svg.appendChild(el('ellipse', {
      cx, cy, rx: rr * 0.32, ry: rr, fill: 'none', stroke: 'currentColor',
      'stroke-opacity': '.26', 'stroke-width': 1.3, 'stroke-dasharray': '4 4',
    }));
    svg.appendChild(el('circle', { cx, cy, r: 2.4, fill: 'currentColor', stroke: 'none' }));
    const labels = item.labels || [];
    mathLabelText(svg, cx + 12, cy + 4, labels[0] || 'O', { size: 12 });
    return;
  }

  // 圆柱/圆锥没有多面体顶点，必须先单独建投影视图；
  // 否则会被下面的 verts 空值判断直接 return 掉。
  if (shape === 'cylinder' || shape === 'cone') {
    const r = Number(item.r) || 2;
    const h = Number(item.h) || (item.size ? Number(item.size[2]) || Number(item.size[1]) || 4 : 4);
    const flatC = [[-r, 0], [r, 0], [-r, h], [r, h]];
    const viewC = makeFlatView(flatC, v.w, v.h, 46);
    const cx = viewC.toX(0), cyTop = viewC.toY(h), cyBot = viewC.toY(0);
    const rx = r * viewC.s, ry = r * viewC.s * 0.32;
    const col = 'currentColor';
    if (shape === 'cylinder') {
      svg.appendChild(el('ellipse', { cx, cy: cyTop, rx, ry, fill: 'none', stroke: col, 'stroke-opacity': '.55', 'stroke-width': 1.8 }));
      svg.appendChild(el('path', {
        d: `M ${cx - rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cyBot}`,
        fill: 'none', stroke: col, 'stroke-opacity': '.26', 'stroke-width': 1.3, 'stroke-dasharray': '5 4',
      }));
      svg.appendChild(el('path', {
        d: `M ${cx - rx} ${cyBot} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cyBot}`,
        fill: 'none', stroke: col, 'stroke-opacity': '.7', 'stroke-width': 1.7,
      }));
      svg.appendChild(el('line', { x1: cx - rx, y1: cyTop, x2: cx - rx, y2: cyBot, stroke: col, 'stroke-opacity': '.8', 'stroke-width': 1.8 }));
      svg.appendChild(el('line', { x1: cx + rx, y1: cyTop, x2: cx + rx, y2: cyBot, stroke: col, 'stroke-opacity': '.8', 'stroke-width': 1.8 }));
      svg.appendChild(el('line', { x1: cx, y1: cyTop, x2: cx, y2: cyBot, stroke: col, 'stroke-opacity': '.3', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
      svg.appendChild(el('circle', { cx, cy: cyTop, r: 2.2, fill: col, stroke: 'none' }));
      svg.appendChild(el('circle', { cx, cy: cyBot, r: 2.2, fill: col, stroke: 'none' }));
    } else {
      svg.appendChild(el('path', {
        d: `M ${cx - rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cyBot}`,
        fill: 'none', stroke: col, 'stroke-opacity': '.26', 'stroke-width': 1.3, 'stroke-dasharray': '5 4',
      }));
      svg.appendChild(el('path', {
        d: `M ${cx - rx} ${cyBot} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cyBot}`,
        fill: 'none', stroke: col, 'stroke-opacity': '.7', 'stroke-width': 1.7,
      }));
      svg.appendChild(el('line', { x1: cx, y1: cyTop, x2: cx - rx, y2: cyBot, stroke: col, 'stroke-opacity': '.85', 'stroke-width': 1.8 }));
      svg.appendChild(el('line', { x1: cx, y1: cyTop, x2: cx + rx, y2: cyBot, stroke: col, 'stroke-opacity': '.85', 'stroke-width': 1.8 }));
      svg.appendChild(el('line', { x1: cx, y1: cyTop, x2: cx, y2: cyBot, stroke: col, 'stroke-opacity': '.32', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
      svg.appendChild(el('line', { x1: cx, y1: cyBot, x2: cx + rx, y2: cyBot, stroke: col, 'stroke-opacity': '.4', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
      svg.appendChild(el('circle', { cx, cy: cyBot, r: 2.4, fill: col, stroke: 'none' }));
      svg.appendChild(el('circle', { cx, cy: cyTop, r: 2.2, fill: col, stroke: 'none' }));
    }
    (item.labels || []).forEach((lbl, i) => {
      if (!lbl) return;
      if (i === 0 && shape === 'cone') mathLabelText(svg, cx + 12, cyBot + 4, lbl, { size: 12 });
      else mathLabelText(svg, cx, [cyBot, cyTop][i] - 12, lbl, { size: 12 });
    });
    if (!item.labels || !item.labels.length) {
      if (shape === 'cone') {
        mathLabelText(svg, cx + 12, cyBot + 4, 'O', { size: 12 });
        mathLabelText(svg, cx, cyTop - 12, 'P', { size: 12 });
      } else {
        mathLabelText(svg, cx + 12, cyBot + 4, 'O', { size: 12 });
        mathLabelText(svg, cx + 12, cyTop + 4, 'O1', { size: 12 });
      }
    }
    return;
  }

  // custom 顶点直接给
  let verts = item.custom || item.vertices, edges = item.edges || item.lines;
  let geomFaces = item.faces;
  if (!verts) {
    const geom = solidGeom(item);
    verts = geom.verts;
    edges = geom.edges;
    geomFaces = geomFaces || geom.faces;
  }
  if (!verts || !verts.length) return;

  const flat = verts.map(isoProject);
  const view = makeFlatView(flat, v.w, v.h, 46);

  // 隐藏面判断：用三维面法向和视线方向判断正/背面，
  // 只有两侧面都是背面的棱才画虚线。二维叉积在等轴测下会误判。
  const faces = geomFaces || autoFaces(verts, edges);
  const faceEdge = new Map();
  const center = verts.reduce((a, p) => [a[0] + p[0] / verts.length, a[1] + p[1] / verts.length, a[2] + p[2] / verts.length], [0, 0, 0]);
  // 正交投影的视线方向 = 屏幕两轴基向量的叉积
  const viewDir = [COS_Y, COS_X, Math.sin(ANG_X + ANG_Y)];
  for (const f of faces) {
    if (!f || f.length < 3) continue;
    const A = verts[f[0]], B = verts[f[1]], C = verts[f[2]];
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-9) continue;
    const fc = f.reduce((a, i) => [a[0] + verts[i][0] / f.length, a[1] + verts[i][1] / f.length, a[2] + verts[i][2] / f.length], [0, 0, 0]);
    const outward = [fc[0] - center[0], fc[1] - center[1], fc[2] - center[2]];
    if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) n = [-n[0], -n[1], -n[2]];
    const front = n[0] * viewDir[0] + n[1] * viewDir[1] + n[2] * viewDir[2] > 0;
    for (let i = 0; i < f.length; i++) {
      const k = key(f[i], f[(i + 1) % f.length]);
      const rec = faceEdge.get(k) || { front: false };
      rec.front = rec.front || front;
      faceEdge.set(k, rec);
    }
  }
  const hidden = new Set();
  for (const [k, rec] of faceEdge) if (!rec.front) hidden.add(k);

  for (const [i, j] of edges) {
    const isHidden = hidden.has(key(i, j));
    const p1 = flat[i], p2 = flat[j];
    svg.appendChild(el('line', {
      x1: view.toX(p1[0]), y1: view.toY(p1[1]), x2: view.toX(p2[0]), y2: view.toY(p2[1]),
      stroke: 'currentColor', 'stroke-opacity': isHidden ? '.28' : '.8', 'stroke-width': isHidden ? 1.3 : 1.9,
      'stroke-dasharray': isHidden ? '5 4' : 'none', 'stroke-linecap': 'round',
    }));
  }

  // 正方体/长方体没给顶点名时补课本默认的 ABCD-A1B1C1D1，避免只有图没有字
  let labels = item.labels;
  if ((!labels || !labels.length) && (shape === 'cube' || shape === 'cuboid')) {
    labels = ['A', 'B', 'C', 'D', 'A1', 'B1', 'C1', 'D1'];
  }
  (labels || []).forEach((lbl, i) => {
    const p = flat[i];
    if (!p || !lbl) return;
    mathLabelText(svg, view.toX(p[0]), view.toY(p[1]) - 12, lbl, { size: 12 });
  });
}

function key(i, j) { return i < j ? `${i}-${j}` : `${j}-${i}`; }

// 从棱自动凑出三角面（够用来判遮挡）
function autoFaces(verts, edges) {
  const adj = new Map();
  for (const [i, j] of edges) {
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i).add(j); adj.get(j).add(i);
  }
  const faces = [], seen = new Set();
  for (const [i, nbrs] of adj) {
    const arr = [...nbrs];
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) {
        const j = arr[a], k = arr[b];
        if (!adj.get(j).has(k)) continue;
        const f = [i, j, k].sort((x, y) => x - y);
        const sig = f.join(',');
        if (seen.has(sig)) continue;
        seen.add(sig);
        faces.push([i, j, k]);
      }
    }
  }
  return faces;
}

// 规格兜底：模型偶尔把 type 写成中文、或干脆不写，按字段推断（v0.9.4）
const TYPE_ALIAS = {
  hollowpoint: 'point', openpoint: 'point', '空心点': 'point', '开点': 'point',
  '坐标系': 'grid', '坐标': 'grid', '函数': 'grid', '函数图像': 'grid', '图像': 'grid',
  '数轴': 'axis', '三角形': 'solid2d', '平面几何': 'solid2d', '几何': 'solid2d',
  '立体': 'solid', '立体几何': 'solid', '三维': 'solid', '圆': 'solid2d',
  '分段函数': 'piecewise', '分段': 'piecewise', '极坐标': 'polar', '螺线': 'polar', '螺旋': 'polar',
  '参数方程': 'parametric', 'function': 'func', 'param': 'parametric', 'spiral': 'polar',
};
const SHAPE_ALIAS = {
  '正方体': 'cube', '立方体': 'cube', '长方体': 'cuboid',
  '棱柱': 'prism', '三棱柱': 'prism', '四棱柱': 'prism',
  '棱锥': 'pyramid', '三棱锥': 'pyramid', '四棱锥': 'pyramid',
  '圆柱': 'cylinder', '圆锥': 'cone',
  '球': 'sphere', '球体': 'sphere', '圆球': 'sphere',
};

const KNOWN_SHAPES = ['cube', 'cuboid', 'prism', 'pyramid', 'cylinder', 'cone', 'sphere'];


// 解析隐式方程：x^2/4-y^2/9=1 这类，够用的圆锥曲线都认
function parseConicExpr(expr) {
  let e = String(expr || '').replace(/\s+/g, '').replace(/²/g, '^2').replace(/−/g, '-').replace(/＝/g, '=');
  e = e.replace(/^[a-z]\s*[:=]\s*/i, '');
  let m;
  if ((m = e.match(/^x\^2\/([\d.]+)-y\^2\/([\d.]+)=1$/))) {
    return { type: 'hyperbola', a: Math.sqrt(+m[1]), b: Math.sqrt(+m[2]) };
  }
  if ((m = e.match(/^y\^2\/([\d.]+)-x\^2\/([\d.]+)=1$/))) {
    return { type: 'hyperbola', orient: 'v', a: Math.sqrt(+m[1]), b: Math.sqrt(+m[2]) };
  }
  if ((m = e.match(/^x\^2\/([\d.]+)\+y\^2\/([\d.]+)=1$/))) {
    return { type: 'ellipse', a: Math.sqrt(+m[1]), b: Math.sqrt(+m[2]) };
  }
  if ((m = e.match(/^x\^2\+y\^2=([\d.]+)$/))) {
    const r = Math.sqrt(+m[1]);
    return { type: 'ellipse', a: r, b: r };
  }
  return null;
}

// 椭圆/圆拆成上下两支函数，复用现成的采样器
function ellipseBranches(a, b, cx = 0, cy = 0) {
  return [1, -1].map((sign) => ({
    type: 'func',
    f: `${cy}${sign > 0 ? '+' : '-'}${b}*sqrt(1-((x-(${cx}))^2)/(${a * a}))`,
    domain: [cx - a, cx + a],
  }));
}

function convertCurve(c) {
  if (!c || typeof c !== 'object') return null;
  const t = String(c.type || '').trim().toLowerCase();
  const color = c.color;
  const width = c.width;
  const dash = !!c.dash;
  if (t === 'line') {
    const from = Array.isArray(c.from) ? c.from : null;
    const to = Array.isArray(c.to) ? c.to : null;
    if (from && to) return { type: 'line', through: [from, to], color, width, dash };
    if (c.k != null) return { type: 'line', k: c.k, b: c.b, color, width, dash };
    return null;
  }
  if (t === 'implicit' || t === 'conic' || t === 'equation' || t === 'curve') {
    const con = parseConicExpr(c.expr || c.eq || c.equation || c.f);
    if (!con) return null;
    if (con.type === 'ellipse') return ellipseBranches(con.a, con.b);
    return Object.assign(con, { color, width });
  }
  if (t === 'func' || t === 'function') {
    return {
      type: 'func', f: c.expr || c.f, domain: c.domain, color, width, dash,
      open: c.open, closed: c.closed, leftOpen: c.leftOpen, rightOpen: c.rightOpen,
      endpoints: c.endpoints, guides: c.guides, range: c.range, breaks: c.breaks,
      label: c.label, endR: c.endR,
    };
  }
  if (t === 'polar' || t === 'spiral') {
    return { type: 'polar', r: c.r || c.f || c.expr, theta: c.theta || c.t, turns: c.turns, color, width, dash };
  }
  if (t === 'parametric' || t === 'param') {
    return { type: 'parametric', x: c.x || c.fx, y: c.y || c.fy, t: c.t || c.theta, color, width, dash };
  }
  if (t === 'piecewise' || t === 'pieces') {
    return { type: 'piecewise', pieces: c.pieces || c.cases, color, width };
  }
  if (t === 'parabola') return Object.assign({ type: 'parabola' }, c);
  if (t === 'point' && c.x != null) {
    return {
      type: 'point', x: c.x, y: c.y, label: c.label, color,
      hollow: c.hollow, open: c.open, filled: c.filled, style: c.style, r: c.r,
    };
  }
  if ((t === 'hollowpoint' || t === 'openpoint') && c.x != null) {
    return { type: 'point', x: c.x, y: c.y, label: c.label, color, hollow: true, r: c.r };
  }
  if (t === 'circle' && c.r != null) return { type: 'circle', x: c.x || 0, y: c.y || 0, r: c.r, color };
  return null;
}

function shapeOf(item) {
  if (!item || typeof item !== 'object') return 'cube';
  const raw = String(item.shape || item.type || 'cube').trim();
  const out = SHAPE_ALIAS[raw] || SHAPE_ALIAS[raw.toLowerCase()] || raw.toLowerCase();
  return out === 'solid' ? 'cube' : out;
}

function normalizeSpec(spec) {
  // 有的调用方把画图 JSON 原样当字符串传进来，先自己解析一遍
  if (typeof spec === 'string') {
    let raw = spec.trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
    try { spec = JSON.parse(raw); } catch (_) {
      try { spec = JSON.parse(raw.replace(/[，：]/g, (c) => (c === '，' ? ',' : ':')).replace(/,\s*([}\]])/g, '$1')); } catch (_) { return null; }
    }
  }
  if (!spec || typeof spec !== 'object') return null;
  // 有些模型会直接吐一个图元数组，没有外层 {type,items}
  if (Array.isArray(spec)) spec = { items: spec };
  let s = Object.assign({}, spec);
  // 新 schema：{canvas:[-8,8,-8,8], grid:true, axes:true, curves:[...]}
  if (Array.isArray(s.curves)) {
    const items = [];
    for (const c of s.curves) {
      const out = convertCurve(c);
      if (Array.isArray(out)) items.push(...out);
      else if (out) items.push(out);
    }
    const cv = Array.isArray(s.canvas) && s.canvas.length >= 4 ? s.canvas : null;
    const hasDash = items.some((i) => i.type === 'line' && i.dash);
    const cooked = items.map((i) => (i.type === 'hyperbola' && hasDash ? Object.assign({}, i, { asym: false }) : i));
    return normalizeSpec({
      type: 'grid',
      x: cv ? [cv[0], cv[1]] : undefined,
      y: cv ? [cv[2], cv[3]] : undefined,
      grid: s.grid,
      title: s.title,
      items: cooked,
    });
  }
  if (typeof s.shape === 'string') {
    s.shape = shapeOf({ shape: s.shape });
  }
  if (typeof s.type === 'string') {
    const t = s.type.trim().toLowerCase();
    const rawType = s.type.trim();
    s.type = TYPE_ALIAS[s.type.trim()] || TYPE_ALIAS[t] || t;
    if (SHAPE_ALIAS[rawType] || SHAPE_ALIAS[t]) {
      s.shape = s.shape || SHAPE_ALIAS[rawType] || SHAPE_ALIAS[t];
      s.type = 'solid';
    } else if (KNOWN_SHAPES.includes(s.type)) {
      s.shape = s.shape || s.type;
      s.type = 'solid';
    }
  }
  // 没有 type：按拥有的字段推断
  // 模型有时把双曲线直接写在顶层，补一层 grid，免得整张图被判无效
  if (s.type === 'hyperbola' || s.type === 'conic' || s.type === '双曲线') {
    const it = Object.assign({}, s, { type: 'hyperbola' });
    const hp = hyperbolaParams(it);
    const span = Math.max(6, hp.a * 4, hp.b * 4);
    return normalizeSpec({
      type: 'grid',
      x: Array.isArray(s.x) ? s.x : [-span, span],
      y: Array.isArray(s.y) ? s.y : [-span, span],
      title: s.title,
      items: [it],
    });
  }
  if (!s.type) {
    if (s.items && s.items.length) {
      const it = s.items[0] || {};
      s.type = ['func', 'piecewise', 'polar', 'parametric', 'parabola', 'line', 'area', 'region', 'point', 'vline'].includes(it.type) ? 'grid' : 'solid2d';
    } else if (s.shape || s.vertices || s.custom) s.type = 'solid';
    else if (s.f || s.expr) s.type = 'grid';
    else if (s.points) s.type = 'solid2d';
    // 只写了 scene 的物理图：别当成无效 JSON 丢掉
    else if (s.scene) s.type = 'physics';
    else return null;
  }
  if (s.type === 'solid2d' && !s.items) {
    if (Array.isArray(s.points)) s.items = [{ type: s.points.length === 3 ? 'triangle' : 'polygon', points: s.points, labels: s.labels }];
  }
  // 子图元类型也用中文时归一
  if (Array.isArray(s.items)) {
    s.items = s.items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const o = Object.assign({}, it);
      const alias = { '点': 'point', '线': 'line', '线段': 'line', '圆': 'circle', '三角形': 'triangle', '多边形': 'polygon', '函数': 'func', '抛物线': 'parabola', '双曲线': 'hyperbola', '角': 'angle', '向量': 'vector', '标注': 'label', '文字': 'label', '分段函数': 'piecewise', '极坐标': 'polar', '螺线': 'polar', '参数方程': 'parametric' };
      if (o.type && alias[String(o.type).trim()]) o.type = alias[String(o.type).trim()];
      if (typeof o.shape === 'string') o.shape = shapeOf({ shape: o.shape });
      if (typeof o.type === 'string') {
        const rawType = o.type.trim();
        const lowerType = rawType.toLowerCase();
        if (SHAPE_ALIAS[rawType] || SHAPE_ALIAS[lowerType]) {
          o.shape = o.shape || SHAPE_ALIAS[rawType] || SHAPE_ALIAS[lowerType];
          o.type = 'solid';
        } else if (KNOWN_SHAPES.includes(lowerType)) {
          o.shape = o.shape || lowerType;
          o.type = 'solid';
        }
      }
      return o;
    });
  }
  return s;
}

const SHAPE_NAME = {
  cube: '正方体', cuboid: '长方体', prism: '棱柱', pyramid: '棱锥',
  cylinder: '圆柱', cone: '圆锥', sphere: '球',
};

function defaultCaption(spec) {
  const first = (spec.items && spec.items[0]) || spec;
  const shape = shapeOf(first);
  if (SHAPE_NAME[shape]) return `${SHAPE_NAME[shape]}示意图`;
  if (spec.type === 'piecewise') return '分段函数图像';
  if (spec.type === 'polar' || spec.type === 'spiral') return '极坐标曲线';
  if (spec.type === 'parametric') return '参数方程曲线';
  if (spec.type === 'grid' || spec.type === 'func' || spec.type === 'parabola' || spec.type === 'hyperbola') return '函数图像';
  if (spec.type === 'axis') return '数轴示意图';
  if (spec.type === 'physics') return physicsCaption(spec);
  return '几何示意图';
}

// 主入口：把一段 draw JSON 渲染成 SVG 元素
export function renderDraw(rawSpec, width = 360, height = 300) {
  const wrap = document.createElement('div');
  wrap.className = 'draw-box';
  const spec = normalizeSpec(rawSpec);
  if (!spec) return wrap;
  if (!Array.isArray(spec.x) || !Array.isArray(spec.y)) {
    // 顶层曲线和 grid 里的曲线都要取景，否则螺线/参数曲线会被默认 [-6,6] 切掉
    let auto = autoRangeForCurve(spec);
    if (!auto && Array.isArray(spec.items)) {
      for (const it of spec.items) {
        const one = autoRangeForCurve(it);
        if (!one) continue;
        if (!auto) auto = one;
        else {
          auto.x = [Math.min(auto.x[0], one.x[0]), Math.max(auto.x[1], one.x[1])];
          auto.y = [Math.min(auto.y[0], one.y[0]), Math.max(auto.y[1], one.y[1])];
        }
      }
    }
    if (auto) {
      if (!Array.isArray(spec.x)) spec.x = auto.x;
      if (!Array.isArray(spec.y)) spec.y = auto.y;
    }
  }

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: 'auto',
    style: 'display:block;color:var(--text)',
    preserveAspectRatio: 'xMidYMid meet',
    'font-family': MATH_FONT,
  });

  // 一张图可能有多个子图元，统一平铺
  const items = spec.items && spec.items.length ? spec.items : [spec];
  const ITEM_KINDS = ['func', 'piecewise', 'polar', 'parametric', 'parabola', 'hyperbola', 'conic', 'line', 'area', 'region', 'inequality', 'point', 'vline'];
  let kind = spec.type;
  // 顶层直接给 func/region 时也要补坐标轴，不能只画一条悬空的线
  if (ITEM_KINDS.includes(kind)) kind = 'grid';
  if (!kind) kind = items.some(i => ITEM_KINDS.includes(i.type)) ? 'grid' : 'solid2d';
  const w = width, h = height;

  // 化学实验装置图：整图，自己管坐标
  if (spec.type === 'chem') {
    renderChem(svg, w, h, spec);
    wrap.appendChild(svg);
    const capText = spec.title || spec.caption || CHEM_SCENE_ZH[chemSceneOf(spec)] || '';
    if (capText) {
      const cap = document.createElement('div');
      cap.className = 'draw-cap';
      cap.textContent = capText;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  // 物理题图（beta）：一张整图，自己管坐标
  if (spec.type === 'physics' || (spec.scene && !spec.items)) {
    const ok = renderPhysics(svg, w, h, spec);
    wrap.appendChild(svg);
    const capText = spec.title || spec.caption || (ok ? physicsCaption(spec) : '');
    if (capText) {
      const cap = document.createElement('div');
      cap.className = 'draw-cap';
      cap.textContent = capText;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  // 立体几何单独走一套（自带投影与视图）
  if (kind === 'solid' || items.some(i => i.type === 'solid' || i.shape)) {
    const vSolid = { w, h };
    for (const it of (items.length ? items : [spec])) {
      if (it && (it.type === 'solid' || it.shape || (it === spec && kind === 'solid'))) {
        drawSolid(svg, vSolid, it === spec ? spec : it);
      }
    }
    wrap.appendChild(svg);
    const caption = spec.title || spec.caption || defaultCaption(spec);
    if (caption) {
      const cap = document.createElement('div');
      cap.className = 'draw-cap';
      cap.textContent = caption;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  // 平面几何：按所有点自动取景，不画网格
  const PLAT = ['triangle', 'polygon', 'circle', 'vector', 'point', 'label', 'angle'];
  const isFlat = (kind === 'solid2d' || kind === 'flat' || items.every(i => PLAT.includes(i.type))) && kind !== 'grid' && kind !== 'axis';
  let v;
  if (isFlat) {
    const pts = [];
    for (const it of items) {
      if (it.points) it.points.forEach(p => pts.push(p));
      if (it.type === 'point' || it.type === 'circle' || it.type === 'angle') pts.push([it.x || 0, it.y || 0]);
      if (it.type === 'vector') { pts.push(it.from || [0, 0]); pts.push(it.to || [1, 1]); }
      if (it.type === 'label') pts.push([it.x || 0, it.y || 0]);
      if (it.type === 'circle') {
        const r = it.r || 1;
        pts.push([(it.x || 0) - r, (it.y || 0) - r], [(it.x || 0) + r, (it.y || 0) + r]);
      }
    }
    v = makeFlatView(pts.length > 1 ? pts : [[0, 0], [1, 1]], w, h);
  } else {
    v = makeView(Object.assign({}, spec, { type: kind, x: spec.x || [-6, 6], y: spec.y || [-6, 6] }), w, h);
  }
  v.w = w; v.h = h;

  if (kind === 'grid') drawGrid(svg, v, spec);
  if (kind === 'axis') drawXAxis(svg, v, spec);

  // 所有函数曲线、区域和辅助线都裁进坐标系矩形，
  // 避免 y=x³、tan(x) 这类函数把线画到画布外或盖住坐标轴标号。
  let plotRoot = svg;
  if (kind === 'grid' || kind === 'axis') {
    const xA = Math.min(v.toX(v.box.x0), v.toX(v.box.x1));
    const xB = Math.max(v.toX(v.box.x0), v.toX(v.box.x1));
    const yA = Math.min(v.toY(v.box.y0), v.toY(v.box.y1));
    const yB = Math.max(v.toY(v.box.y0), v.toY(v.box.y1));
    const clipId = `dclip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const defs = el('defs');
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('rect', {
      x: xA - 0.5, y: yA - 0.5,
      width: Math.max(0, xB - xA + 1), height: Math.max(0, yB - yA + 1),
    }));
    defs.appendChild(clip);
    svg.insertBefore(defs, svg.firstChild);
    plotRoot = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(plotRoot);
  }

  for (const it of items) {
    if (!it || !it.type) continue;
    if (it.type === 'grid') { continue; }
    if (it.type === 'axis') { drawXAxis(plotRoot, v, it); continue; }
    if (it.type === 'line') { drawLine(plotRoot, v, it); continue; }
    if (it.type === 'parabola') { drawParabola(plotRoot, v, it); continue; }
    if (it.type === 'hyperbola' || it.type === 'conic') { drawHyperbola(plotRoot, v, it); continue; }
    if (it.type === 'func') { drawFunc(plotRoot, v, it); continue; }
    if (it.type === 'piecewise') { drawPiecewise(plotRoot, v, it); continue; }
    if (it.type === 'polar' || it.type === 'spiral') { drawPolar(plotRoot, v, it); continue; }
    if (it.type === 'parametric' || it.type === 'param') { drawParametric(plotRoot, v, it); continue; }
    if (it.type === 'point') { drawPoint(plotRoot, v, it); continue; }
    if (it.type === 'area') { drawArea(plotRoot, v, it); continue; }
    if (it.type === 'region' || it.type === 'inequality') { drawRegion(plotRoot, v, it); continue; }
    if (it.type === 'vline') { drawVLine(plotRoot, v, it); continue; }
    if (it.type === 'polygon') { drawPolygon(plotRoot, v, it); continue; }
    if (it.type === 'triangle') { drawTriangle(plotRoot, v, it); continue; }
    if (it.type === 'vector') { drawVector(plotRoot, v, it); continue; }
    if (it.type === 'circle') { drawCircle(plotRoot, v, it); continue; }
    if (it.type === 'angle') { drawAngle(plotRoot, v, it); continue; }
    if (it.type === 'label') { drawLabel(plotRoot, v, it); continue; }
  }

  wrap.appendChild(svg);
  const caption = spec.title || spec.caption || defaultCaption(spec);
  if (caption) {
    const cap = document.createElement('div');
    cap.className = 'draw-cap';
    cap.textContent = caption;
    wrap.appendChild(cap);
  }
  return wrap;
}

// 把文本里的 [[draw:{...}]] 抽出来，正文与图分开渲染。
// 注意：不能用非贪婪正则 /\[\[draw:\s*([\s\S]*?)\]\]/ —— 图里只要有数组
// （points:[[0,0],[5,0]]）就会先撞上内层的 ]]，JSON 被截断，整段漏成代码。
function scanObject(text, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function splitDraw(text) {
  const heldCode = [];
  let src = String(text || '');
  // 非画图代码块先整体护住，别让 Python/JS 脚本里的 {} 被误认成画图 JSON
  src = src.replace(/```([A-Za-z0-9_+.-]*)[ \t]*\r?\n([\s\S]*?)```/g, (m, lang, body) => {
    const drawish = /\b(type|items|shape|points|f|expr)\b/.test(body);
    if (/^(json|javascript|js)$/i.test(lang) && drawish) return m;
    heldCode.push(m);
    return `\u0002CODE${heldCode.length - 1}\u0002`;
  });
  // 画图 JSON 外面的 json/js 围栏可以拆，Python/HTML 已经护住
  src = src.replace(/```(?:json|javascript|js)?\s*/gi, '').replace(/```/g, '');
  // 模型常把 LaTeX 标点当正文写出来，顺手清掉
  src = src.replace(/\\dots|\\cdots|\\ldots/g, '…').replace(/\\[,;:! ]/g, ' ');
  // 中文引号 / 全角标点统一成 ASCII，否则裸 JSON 扫描认不出 "type"（v0.9.4）
  src = src.replace(/[“”＂]/g, '"').replace(/[‘’]/g, "'")
    .replace(/［/g, '[').replace(/］/g, ']').replace(/｛/g, '{').replace(/｝/g, '}')
    .replace(/，/g, ',').replace(/：/g, ':');

  // 全角冒号、单层方括号、大小写混写都认，别让一个标点把整张图吞了
  src = src.replace(/[\[［]{1,2}\s*[Dd][Rr][Aa][Ww]\s*[：:]\s*/g, '[[draw:');

  const out = [];
  let cursor = 0;
  const pushText = (t) => {
    if (!t) return;
    for (const p of splitBareJson(t)) {
      if (p.kind === 'text') {
        p.value = String(p.value).replace(/\u0002CODE(\d+)\u0002/g, (_, i) => heldCode[Number(i)] || '');
      }
      out.push(p);
    }
  };

  while (cursor < src.length) {
    const open = src.indexOf('[[draw:', cursor);
    if (open < 0) { pushText(src.slice(cursor)); break; }
    pushText(src.slice(cursor, open));

    const brace = src.indexOf('{', open + 7);
    if (brace < 0) { out.push({ kind: 'text', value: src.slice(open) }); break; }
    const end = scanObject(src, brace);
    if (end < 0) { out.push({ kind: 'text', value: src.slice(open) }); break; }

    let after = end + 1;
    while (after < src.length && /\s/.test(src[after])) after++;
    // 正常是 ]]，个别模型会多写一个 ]；一起吃掉，避免留下孤立括号
    let closeN = 0;
    while (src[after] === ']' && closeN < 4) { after++; closeN++; }

    const spec = normalizeSpec(parseLoose(src.slice(brace, end + 1)));
    const ok = looksDrawable(spec);
    if (ok) out.push({ kind: 'draw', value: spec });
    else out.push({ kind: 'text', value: src.slice(open, after) });
    cursor = after;
  }
  return out;
}

// ② 没包裹、裸写 JSON 的也认（v0.9.1 新增）
const DRAW_TYPES = ['grid', 'axis', 'func', 'piecewise', 'polar', 'parametric', 'line', 'parabola', 'hyperbola', 'conic', 'point', 'polygon',
  'triangle', 'circle', 'angle', 'label', 'solid', 'solid2d', 'vector', 'area', 'vline',
  'region', 'inequality', 'physics', 'chem'];

// 一个 JSON 到底算不算“图”：type 在白名单里、有 items/shape/points/f，
// 或者写了 physics 的 scene（漏了 type 也认）
function looksDrawable(spec) {
  if (!spec) return false;
  if (DRAW_TYPES.includes(spec.type)) return true;
  if (Array.isArray(spec.items) && spec.items.length) return true;
  if (spec.shape || spec.points || spec.f) return true;
  if (spec.scene && (physicsSceneOf(spec) || CHEM_SCENE_ZH[String(spec.scene).toLowerCase()])) return true;
  if (spec.type === 'chem') return true;
  return false;
}

function splitBareJson(text) {
  const src = String(text || '');
  const out = [];
  let cursor = 0;
  let search = 0;
  // 不再只认 "type" 双引号写法：逐个大括号扫描，裸 key、单引号、
  // 只有 shape 没有 type 的球/棱柱脚本都能被认出来。
  while (search < src.length) {
    const start = src.indexOf('{', search);
    if (start < 0) break;
    const end = scanObject(src, start);
    if (end < 0) break;
    const spec = normalizeSpec(parseLoose(src.slice(start, end + 1)));
    if (!looksDrawable(spec)) { search = start + 1; continue; }
    const before = src.slice(cursor, start);
    if (before.trim()) out.push({ kind: 'text', value: before });
    out.push({ kind: 'draw', value: spec });
    cursor = end + 1;
    search = end + 1;
  }
  if (cursor < src.length) {
    const rest = src.slice(cursor);
    if (rest.trim()) out.push({ kind: 'text', value: rest });
  }
  return out.length ? out : [{ kind: 'text', value: text }];
}

// JSON 容错解析：去尾逗号、补括号、单引号、裸 key
function parseLoose(body) {
  let t = String(body || '').trim()
    .replace(/^json\s*/i, '')
    // 模型常输出中文引号、全角逗号冒号，先归一（v0.9.4）
    .replace(/[“”＂]/g, '"').replace(/[‘’]/g, "'")
    .replace(/，/g, ',').replace(/：/g, ':').replace(/［/g, '[').replace(/］/g, ']')
    .replace(/｛/g, '{').replace(/｝/g, '}')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":');
  for (let k = 0; k < 4; k++) {
    try { return JSON.parse(t); } catch (_) {
      const openC = (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
      const openB = (t.match(/\[/g) || []).length - (t.match(/\]/g) || []).length;
      if (openC <= 0 && openB <= 0) return null;
      t += ']'.repeat(Math.max(0, openB)) + '}'.repeat(Math.max(0, openC));
    }
  }
  return null;
}
