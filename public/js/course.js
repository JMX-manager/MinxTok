// 课程（v3.24）：选学段/学科/册/章节 → 选老师（4 位预设 + 量身定做）→ 老师开讲（流式）
// 输入区、历史、配图全部对标学习中心与主聊天，别自成一套
import { state } from './state.js?v=12';
import { openPage, fillPage, setPageLevel, setPageTitle, setActiveNav, playPageSwitch } from './ui.js?v=150';
import { haptic } from './haptics.js';
import { STAGES, subjectsOf, booksOf, unitsOf } from './curriculum.js?v=12';
import { renderDraw, splitDraw } from './draw.js?v=48';
import { creditsAdd } from './credits.js?v=16';
import { renderMarkdown } from './blocks.js?v=173';

const SEL_KEY = 'minxtok.course.sel';
const T_KEY = 'minxtok.course.teacher';
const LOG_KEY = 'minxtok.course.log';
const SEC_KEY = 'minxtok.course.sections.v1';
const MYT_KEY = 'minxtok.course.teachers.v1';

// ---- 四位预设老师 ----
const PRESETS = [
  {
    id: 'lin', name: '林老师', role: '语文老师', emoji: '🌿', tag: '温柔耐心',
    style: '说话慢，先关心情绪再讲知识。学生答错先说「没关系，这个点很多人都会卡」，再一点点带出来。爱举生活里的例子，常用「我们」而不是「你」。',
    pace: '语速偏慢，一次只推进一个点，讲完问一句「跟上了吗」。',
  },
  {
    id: 'zhang', name: '张老师', role: '数学老师', emoji: '📐', tag: '严厉提分',
    style: '教龄二十年的老教师，直给考点，不绕弯子。爱追问「为什么」，讲完一个方法就要求学生复述一遍。发现错误当场指出，但只批评方法不批评人。',
    pace: '节奏快，重点重复两遍，例题掐着步骤讲。',
  },
  {
    id: 'zhe', name: '阿哲', role: '物理老师', emoji: '🎧', tag: '幽默段子手',
    style: '年轻老师，满嘴比喻，喜欢拿游戏、篮球、外卖打比方。重点讲完爱抛个反问逗学生，但该严谨的地方一点不含糊。',
    pace: '轻松快节奏，每节收尾抛一个小问题，学生答不上来就自嘲一句。',
  },
  {
    id: 'su', name: '苏博', role: '化学老师', emoji: '🧪', tag: '学术极客',
    style: '博士出身，喜欢从定义和推导讲起，术语用得准，最爱说「这一步为什么成立」。不喜欢死记硬背，会把背后的道理拆开。',
    pace: '严谨，先给结论再给推导，例子少而精，常用「注意这个前提」。',
  },
];

const SEL_DEFAULT = { stage: '初中', grade: '初二', subject: '数学', book: '', chapter: '', section: '' };

function loadSel() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEL_KEY) || 'null');
    if (raw && raw.stage) return Object.assign({}, SEL_DEFAULT, raw);
  } catch (_) {}
  return Object.assign({}, SEL_DEFAULT);
}
function saveSel() { try { localStorage.setItem(SEL_KEY, JSON.stringify(Sel)); } catch (_) {} }

function loadTeacher() {
  try {
    const raw = JSON.parse(localStorage.getItem(T_KEY) || 'null');
    if (raw && raw.name) return raw;
  } catch (_) {}
  return PRESETS[0];
}
function saveTeacher(t) { try { localStorage.setItem(T_KEY, JSON.stringify(t)); } catch (_) {} }

// 自己捏的老师可以存好几位，跟自定义场景一个道理：存在列表里，随时挑一个用
function loadMyTeachers() {
  try {
    const arr = JSON.parse(localStorage.getItem(MYT_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(t => t && t.id && t.name) : [];
  } catch (_) { return []; }
}
function saveMyTeachers(list) {
  try { localStorage.setItem(MYT_KEY, JSON.stringify(list.slice(-12))); } catch (_) {}
}

// 小节：第一次拆完就存本地，同一章不再重复问模型
function secKeyOf(chapter) {
  return [Sel.stage, Sel.subject, Sel.book, chapter || ''].join('|');
}
function loadSecCache() {
  try { return JSON.parse(localStorage.getItem(SEC_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function sectionsFor(chapter) {
  if (!chapter) return [];
  const v = loadSecCache()[secKeyOf(chapter)];
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
}
function cacheSections(key, list) {
  try {
    const all = loadSecCache();
    all[key] = list;
    localStorage.setItem(SEC_KEY, JSON.stringify(all));
  } catch (_) {}
}
// 兜底拆节：模型没拆出来时，直接把章名按「与/和/、」这类连接词切开。
// 语文里「词语积累与词语解释」这种栏目型章节十次有两次会返回空，不能让用户卡在这儿
function localSections(chapter) {
  const t = String(chapter || '').trim();
  if (!t) return [];
  const parts = t
    .split(/[、，,；;＋+\/]|与|和|及|·/)
    .map(x => x.trim())
    .filter(x => x.length >= 2 && x.length <= 20);
  const uniq = Array.from(new Set(parts));
  return uniq.length >= 2 ? uniq.slice(0, 8) : [];
}

let secSeq = 0;
async function fetchSections(chapter) {
  if (!chapter || sectionsFor(chapter).length) return;
  const key = secKeyOf(chapter);
  const my = ++secSeq;
  S.secLoading = true;
  S.secFor = chapter;
  if (S.step === 'pick') renderAt(scrollTopNow());
  let list = [];
  try {
    const r = await fetch('/api/course/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: state.uid,
        stage: Sel.stage, grade: Sel.grade, subject: Sel.subject, book: Sel.book, chapter,
      }),
    });
    const d = await r.json();
    if (d && d.ok && Array.isArray(d.sections)) {
      list = d.sections.filter(x => typeof x === 'string' && x.trim()).slice(0, 8);
    }
  } catch (_) {}
  if (!list.length) list = localSections(chapter);
  if (list.length) cacheSections(key, list);
  if (my !== secSeq) return;
  S.secLoading = false;
  S.secFor = '';
  S.secErr = list.length ? '' : chapter;
  if (S.step === 'pick') renderAt(scrollTopNow());
}

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function saveLog(all) {
  try {
    const keys = Object.keys(all);
    // 只留最近 6 个章节，防止 localStorage 撑爆
    if (keys.length > 6) keys.slice(0, keys.length - 6).forEach(k => delete all[k]);
    localStorage.setItem(LOG_KEY, JSON.stringify(all));
  } catch (_) {}
}

const Sel = loadSel();
let Teacher = loadTeacher();
let S = { step: 'pick', custom: null, qIdx: 0, busy: false, secLoading: false, secFor: '', secErr: '' };
let liveSeq = 0;

// 老版本只存一位 id 为 custom 的老师，迁进多老师列表，别让它凭空消失
function migrateTeacher() {
  if (!Teacher || Teacher.id !== 'custom' || !Teacher.name) return;
  const t = Object.assign({}, Teacher, { id: 'cu' + Date.now().toString(36), custom: true });
  const mine = loadMyTeachers();
  mine.push(t);
  saveMyTeachers(mine);
  Teacher = t;
  saveTeacher(t);
}
migrateTeacher();

function scrollTopNow() {
  const b = document.getElementById('pageBody');
  return b ? b.scrollTop : 0;
}
// 选章/选小节会整页重绘，滚回原位，不然每点一下都弹回顶部
function renderAt(top) {
  render();
  const b = document.getElementById('pageBody');
  if (b) b.scrollTop = top || 0;
}

/* 课程界面的 emoji 一律用 Apple 图片，别让系统字体画成方脸 */
const EMOJI_SRC = {
  '🌿': 'herb', '📐': 'triangular_ruler', '🎧': 'headphone', '🧪': 'test_tube',
  '✨': 'sparkles', '👩‍🏫': 'woman_teacher', '➕': 'heavy_plus_sign', '＋': 'heavy_plus_sign',
};
function avaHtml(ch) {
  const raw = ch || '👩‍🏫';
  const file = EMOJI_SRC[raw];
  if (!file) return esc(raw);
  return `<img class="c-emoji" src="/assets/emoji/${file}.png" alt="${esc(raw)}" draggable="false" decoding="async">`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 把模型输出渲染成安全 HTML：$...$ 走 KaTeX，**粗体**保留，其余转义
// 正文里裸出现的 LaTeX 命令（模型漏了 $ 包裹）：「\mathrm{Na}^+」
function texCmdAt(s, i) {
  const m = /^\\(mathrm|text|textrm|textnormal|mathbf|mathit|mathsf|mathtt|operatorname)\s*/.exec(s.slice(i));
  if (!m) return null;
  let k = i + m[0].length;
  if (s[k] !== '{') return null;
  let depth = 0, p = k;
  for (; p < s.length; p++) {
    if (s[p] === '{') depth++;
    else if (s[p] === '}') { depth--; if (!depth) break; }
  }
  if (depth) return null;
  const body = s.slice(k + 1, p);
  let j = p + 1, extra = '';
  for (let g = 0; g < 6; g++) {
    const sm = /^([_^])(?:\{([^{}]*)\}|([A-Za-z0-9+\-]))/.exec(s.slice(j));
    if (!sm) break;
    extra += sm[1] + '{' + (sm[2] != null ? sm[2] : sm[3]) + '}';
    j += sm[0].length;
  }
  return { src: '\\' + m[1] + '{' + body + '}' + extra, end: j };
}

function mathOut(src) {
  try {
    if (window.katex) return window.katex.renderToString(src, { throwOnError: false, displayMode: false });
  } catch (_) {}
  return '<code>' + esc(src) + '</code>';
}

function rich(text) {
  let src = String(text || '');
  // 模型偶尔漏掉闭合的 $，成对公式要保留，只清掉最后那个落单的美元符号
  if ((src.match(/\$/g) || []).length % 2 === 1) {
    const i = src.lastIndexOf('$');
    if (i >= 0) src = src.slice(0, i) + src.slice(i + 1);
  }
  // 模型偶尔把中文说明也塞进 $...$；这种不是公式，去掉美元符号按正文排。
  src = src.replace(/\$([^$\n]+)\$/g, (m, body) =>
    /[\u3400-\u9fff]/.test(body) && !/[\\^_=<>≤≥≠≈+\-*/]/.test(body) ? body : m);
  // 模型常把「一、」「二、」写成独占一行的 **小标题** 或 *小标题*。
  // 先转成 Markdown 标题，交给统一渲染器；行内加粗不受影响。
  src = src
    .replace(/^[ \t]*\*\*([^*\n]+)\*\*[ \t]*[:：]?[ \t]*$/gm, '### $1')
    .replace(/^[ \t]*\*([^*\n]+)\*[ \t]*[:：]?[ \t]*$/gm, '### $1');
  return renderMarkdown(src);
}

// 渲染一段回答：文字走气泡、[[draw:]] 直接出 SVG；streaming 时先藏没写完的图
function renderBody(el, text, streaming) {
  if (!el) return;
  let src = String(text || '');
  if (streaming) {
    const i = src.lastIndexOf('[[');
    if (i >= 0 && src.indexOf(']]', i) < 0) src = src.slice(0, i);
    // 流式阶段公式还没闭合时，别把半个 $ 先露出来；成对的 $ 不能误删
    const dollars = (src.match(/\$/g) || []).length;
    if (dollars % 2 === 1) src = src.slice(0, src.lastIndexOf('$'));
  }
  if (!src.trim()) { el.innerHTML = '<span class="c-typing"><i></i><i></i><i></i></span>'; return; }
  const parts = splitDraw(src);
  if (!parts.some(p => p.kind === 'draw')) {
    el.innerHTML = rich(src);
    return;
  }
  el.innerHTML = '';
  for (const part of parts) {
    if (part.kind === 'draw') {
      try {
        const node = renderDraw(part.value);
        const svg = node && node.querySelector ? node.querySelector('svg') : null;
        if (svg && svg.childElementCount) {
          const box = document.createElement('div');
          box.className = 'c-fig';
          box.appendChild(node);
          el.appendChild(box);
        }
      } catch (_) { /* 一张图失败不影响整段 */ }
    } else {
      const d = document.createElement('div');
      d.className = 'c-text';
      d.innerHTML = rich(String(part.value || ''));
      el.appendChild(d);
    }
  }
}

function chapterKey() {
  // 同一章节换了老师，对话要重新开始；不能把上一位老师的课堂记录接着用
  return [Sel.stage, Sel.subject, Sel.book, Sel.chapter, Teacher && Teacher.id ? Teacher.id : ''].join('|') + (Sel.section ? '|' + Sel.section : '');
}

/* ---------------- 第一步：选课 ---------------- */
function stageChips() {
  return STAGES.map(s => `<button class="c-chip${Sel.stage === s.key ? ' on' : ''}" data-stage="${s.key}">${s.key}</button>`).join('');
}
function gradeChips() {
  const st = STAGES.find(x => x.key === Sel.stage) || STAGES[0];
  return st.grades.map(g => `<button class="c-chip${Sel.grade === g ? ' on' : ''}" data-grade="${g}">${g}</button>`).join('');
}
function subjectChips() {
  return subjectsOf(Sel.stage).map(s => `<button class="c-sub${Sel.subject === s ? ' on' : ''}" data-subject="${s}">${s}</button>`).join('');
}
function bookChips() {
  const list = booksOf(Sel.stage, Sel.subject);
  if (!list.length) return '<p class="c-empty">这个学段暂时没有收录，换一个看看。</p>';
  return list.map(b => `<button class="c-book${Sel.book === b.b ? ' on' : ''}" data-book="${esc(b.b)}"><b>${esc(b.b)}</b><i>${esc(b.g)} · ${b.u.length} 章</i></button>`).join('');
}
function unitList() {
  const list = unitsOf(Sel.stage, Sel.subject, Sel.book);
  if (!list.length) return '<p class="c-empty">先选一册教材。</p>';
  return list.map((u, k) => `<button class="c-unit${Sel.chapter === u ? ' on' : ''}" data-unit="${esc(u)}"><span>${k + 1}</span><b>${esc(u)}</b></button>`).join('');
}

function secChipsHtml() {
  if (!Sel.chapter) return '<p class="c-empty">选完章节再挑小节。</p>';
  if (S.secLoading && S.secFor === Sel.chapter) return '<p class="c-empty c-sec-loading"><i></i>正在按教材拆小节…</p>';
  const list = sectionsFor(Sel.chapter);
  const whole = `<button class="c-sec-btn${Sel.section ? '' : ' on'}" data-sec="" type="button">整章</button>`;
  if (!list.length) {
    return whole + (S.secErr === Sel.chapter
      ? '<button class="c-sec-btn c-sec-retry" data-secre="1" type="button">没拆出来，重试</button>'
      : '<span class="c-sec-none">这章没拆出小节，先按整章讲</span>');
  }
  return whole + list.map(s => `<button class="c-sec-btn${Sel.section === s ? ' on' : ''}" data-sec="${esc(s)}" type="button">${esc(s)}</button>`).join('');
}

function pickHtml() {
  const canNext = !!(Sel.stage && Sel.subject && Sel.book && Sel.chapter);
  return `
    <div class="c-sec">
      <h4 class="c-label">学段</h4>
      <div class="c-chips">${stageChips()}</div>
      <h4 class="c-label">年级</h4>
      <div class="c-chips">${gradeChips()}</div>
      <h4 class="c-label">科目</h4>
      <div class="c-subs">${subjectChips()}</div>
      <h4 class="c-label">教材</h4>
      <div class="c-books">${bookChips()}</div>
      <h4 class="c-label">章节${Sel.book ? '' : '（先选教材）'}</h4>
      <div class="c-units">${unitList()}</div>
      <h4 class="c-label">小节${Sel.chapter ? '' : '（先选章节）'}</h4>
      <div class="c-secs">${secChipsHtml()}</div>
    </div>
    <div class="c-foot">
      <button class="c-primary" id="cNext"${canNext ? '' : ' disabled'}>下一步 · 挑老师</button>
    </div>`;
}

/* ---------------- 第二步：选老师 ---------------- */
function teacherCards() {
  const cur = Teacher.id || '';
  const preset = PRESETS.map(t => `
    <button class="c-tcard${cur === t.id ? ' on' : ''}" data-teacher="${t.id}">
      <span class="c-ava">${avaHtml(t.emoji)}</span>
      <b>${t.name}</b>
      <em>${t.tag}</em>
      <i>${t.style.slice(0, 26)}…</i>
    </button>`).join('');
  const mine = loadMyTeachers().map(t => `
    <div class="c-twrap">
      <button class="c-tcard${cur === t.id ? ' on' : ''}" data-teacher="${esc(t.id)}" type="button">
        <span class="c-ava">${avaHtml(t.emoji || '✨')}</span>
        <b>${esc(t.name)}</b>
        <em>${esc(t.tag || '我自己定的')}</em>
        <i>${esc(String(t.style || '').slice(0, 26))}…</i>
      </button>
      <button class="c-tdel" data-tdel="${esc(t.id)}" type="button" aria-label="删掉这位老师">×</button>
    </div>`).join('');
  const add = `
    <button class="c-tcard c-tcard-custom" data-teacher="custom" type="button">
      <span class="c-ava">${avaHtml('➕')}</span>
      <b>新增老师</b>
      <em>量身定做</em>
      <i>再捏一个不同风格的老师</i>
    </button>`;
  return preset + mine + add;
}

function teacherHtml() {
  return `
    <div class="c-sec">
      <h4 class="c-label">已选</h4>
      <div class="c-picked" id="cBackPick">
        <span>${esc(Sel.stage)} · ${esc(Sel.grade)} · ${esc(Sel.subject)}</span>
        <b>${esc(Sel.book)} · ${esc(Sel.chapter)}${Sel.section ? ' · ' + esc(Sel.section) : ''}</b>
      </div>
      <h4 class="c-label">跟谁学</h4>
      <div class="c-tcards">${teacherCards()}</div>
    </div>
    <div class="c-foot">
      <button class="c-primary" id="cStart">开始上课</button>
    </div>`;
}

/* ---------------- 量身定做：和明叙引导页同材质 ---------------- */
const CUSTOM_Q = [
  { k: 'name', name: '名字', en: 'NAME', q: '先给这位老师起个名字', sub: '学生怎么称呼他，都由你定。', hint: '比如：老周、安然老师', type: 'text', def: '老师' },
  { k: 'tone', name: '性格', en: 'TONE', q: '你想要什么性格', sub: '选一个最像的，语气和用词都会跟着变。', type: 'pick', opts: ['温柔鼓励', '严厉高效', '幽默风趣', '冷静严谨'] },
  { k: 'pace', name: '节奏', en: 'PACE', q: '讲课节奏呢', sub: '听不懂时他会多停一会儿。', type: 'pick', opts: ['讲快一点', '正常就行', '讲慢一点，我怕跟不上'] },
  { k: 'call', name: '称呼', en: 'ADDRESS', q: '这位老师怎么称呼你', sub: '直接叫「你」也可以。', type: 'text', def: '你' },
  { k: 'extra', name: '补充', en: 'NOTES', q: '还有什么特别要求', sub: '不说就跳过，之后也能换老师。', hint: '比如：多讲例题、少说废话', type: 'text', def: '' },
];

const OB_ARROW_R = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M5 12h13M12.5 5.2 19.8 12l-7.3 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OB_ARROW_L = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M19 12H6M11.5 5.2 4.2 12l7.3 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 5.3.3：改成刷题引导那套（底部左右箭头 + 眉标 + 两列大选项），
// 背景走纯色、不再铺引导页那团渐变雾；换步仍然是模糊过渡。
function customHtml() {
  const c = S.custom || {};
  const idx = Math.min(S.qIdx || 0, CUSTOM_Q.length - 1);
  const q = CUSTOM_Q[idx];
  const pct = Math.round(((idx + 1) / CUSTOM_Q.length) * 100);
  const last = idx === CUSTOM_Q.length - 1;
  return `
    <div class="c-dw dw" id="cCustom">
      <div class="dw-top">
        <span class="dw-kicker">${idx + 1} / ${CUSTOM_Q.length} · ${esc(q.name || '')}</span>
        <span class="dw-brand">${esc(q.en || 'TEACHER')}</span>
      </div>
      <div class="ob-progress dw-prog"><i style="width:${pct}%"></i></div>
      <div class="ob-stage dw-stage">
        <div class="ob-step dw-step" id="cObStep">
          <p class="dw-eyebrow">${esc(q.en || '')}</p>
          <h2 class="ob-h2 dw-h2">${esc(q.q)}</h2>
          <p class="ob-sub">${esc(q.sub || '')}</p>
          ${q.type === 'pick'
            ? `<div class="dw-list">${q.opts.map((o, i) => `<button type="button" class="dw-opt${c[q.k] === o ? ' on' : ''}" data-opt="${esc(o)}" style="--i:${i}"><span class="dw-opt-t">${esc(o)}</span><span class="dw-opt-mark" aria-hidden="true"></span></button>`).join('')}</div>`
            : `<input class="ob-input c-dw-input" id="cObInput" type="text" maxlength="24" value="${esc(c[q.k] || '')}" placeholder="${esc(q.hint || q.def || '')}" autocomplete="off">`}
        </div>
      </div>
      <div class="dw-bar">
        <button type="button" class="dw-arrow back" id="cObBack" aria-label="${idx === 0 ? '退出' : '上一步'}">${OB_ARROW_L}</button>
        <button type="button" class="dw-arrow next wide" id="cObNext">${last ? '完成' : '下一步'}${OB_ARROW_R}</button>
      </div>
    </div>`;
}

function buildCustom(c) {
  const tone = c.tone || '温柔鼓励';
  const map = {
    温柔鼓励: { role: '老师', style: '先肯定再纠正，说话带温度，用生活里的例子讲，常用「我们一起来」。', tag: '温柔鼓励', emoji: '🌿' },
    严厉高效: { role: '提分教练', style: '直给考点，不绕弯，讲完要求复述一遍，错就当场指出但只批评方法。', tag: '严厉高效', emoji: '📐' },
    幽默风趣: { role: '老师', style: '满嘴比喻，拿游戏和日常打比方，重点讲完爱抛反问逗人。', tag: '幽默风趣', emoji: '🎧' },
    冷静严谨: { role: '老师', style: '从定义和推导讲起，术语准确，先给结论再给推导。', tag: '冷静严谨', emoji: '🧪' },
  };
  const m = map[tone] || map['温柔鼓励'];
  const paceMap = { '讲快一点': '节奏快，重点重复两遍，别拖。', '讲慢一点，我怕跟不上': '语速慢，一节只讲一个点，讲完确认一次。', '正常就行': '节奏适中，讲完一节停一下。' };
  return {
    id: 'custom',
    name: c.name || '老师',
    role: m.role,
    emoji: m.emoji,
    tag: m.tag,
    style: m.style + (c.extra ? ` 学生特别要求：${c.extra}。` : ''),
    pace: paceMap[c.pace] || '节奏适中。',
    call: c.call || '你',
    custom: true,
  };
}

/* ---------------- 第三步：上课 ---------------- */
// 单选题：模型在正文尾部给了 [[ans:B]] / [[why:解析]]，前端在本地判分，
// 只有选对才发学分
function parseQuiz(text) {
  const src = String(text || '');
  const am = src.match(/\[\[\s*ans\s*[:：]\s*([A-Da-d])\s*\]\]/);
  if (!am) return null;
  const wm = src.match(/\[\[\s*why\s*[:：]([\s\S]*?)\]\]/);
  return { ans: am[1].toUpperCase(), why: wm ? wm[1].replace(/\s+/g, ' ').trim().slice(0, 60) : '', pick: '' };
}
function stripQuiz(text) {
  return String(text || '')
    .replace(/\[\[\s*ans\s*[:：][^\]]*\]\]/g, '')
    .replace(/\[\[\s*why\s*[:：][\s\S]*?\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function quizHtml(q, qi) {
  if (!q || !q.ans) return '';
  const done = !!q.pick;
  const opts = ['A', 'B', 'C', 'D'].map(k => {
    const cls = done ? (k === q.ans ? ' ok' : (k === q.pick ? ' bad' : '')) : '';
    return `<button class="c-qopt${cls}" data-qopt="${k}" data-qi="${qi}" type="button"${done ? ' disabled' : ''}>${k}</button>`;
  }).join('');
  const res = done
    ? `<p class="c-qres ${q.pick === q.ans ? 'ok' : 'bad'}">${q.pick === q.ans ? '答对了，+200 学分' : `正确答案 ${q.ans}`}${q.why ? ' · ' + esc(q.why) : ''}</p>`
    : '<p class="c-qhint">选一个字母</p>';
  return `<div class="c-quiz">${opts}</div>${res}`;
}

function bubble(who, text, img, quiz, qi) {
  const media = img ? `<img class="c-shot" src="${esc(img)}" alt="">` : '';
  return `<div class="c-msg ${who}">
    ${who === 't' ? `<span class="c-mava">${avaHtml(Teacher.emoji)}</span>` : ''}
    <div class="c-bub">${media}<div class="c-body">${text === null ? '' : rich(text)}</div>${who === 't' ? quizHtml(quiz, qi) : ''}</div>
  </div>`;
}

const ACT_TEXT = {
  more: '继续讲', example: '举个例子', quiz: '考考我',
  simple: '换个说法', summary: '总结这节', harder: '再难一点', exam: '考点梳理',
};

// 底部动作条按这一章的进度实时挑：答错了先换说法，答对了往深里走，
// 讲了几轮还没考就推考试，讲久了就该收尾。推荐那颗永远排第一。
function actChipsHtml() {
  const log = loadLog()[chapterKey()] || [];
  const n = log.length;
  const last = log[n - 1] || {};
  const quizzes = log.filter(t => t.quiz);
  const wrong = quizzes.filter(t => t.quiz.pick && t.quiz.pick !== t.quiz.ans).length;
  const right = quizzes.filter(t => t.quiz.pick && t.quiz.pick === t.quiz.ans).length;
  const lastWrong = !!(last.quiz && last.quiz.pick && last.quiz.pick !== last.quiz.ans);
  const lastRight = !!(last.quiz && last.quiz.pick && last.quiz.pick === last.quiz.ans);

  let rec = 'more';
  if (!n) rec = 'more';
  else if (lastWrong) rec = 'simple';
  else if (lastRight) rec = right >= 2 ? 'harder' : 'more';
  else if (n >= 6) rec = 'summary';
  else if (n >= 3 && !quizzes.length) rec = 'quiz';
  else if (n >= 3) rec = 'example';
  else rec = 'more';

  const pref = [];
  if (n) pref.push('more');
  if (n >= 2) pref.push('example');
  if (n >= 1) pref.push('quiz');
  if (n >= 2 || wrong) pref.push('simple');
  if (right) pref.push('harder');
  if (n >= 4) pref.push('summary');
  if (n >= 3) pref.push('exam');

  const order = [rec, ...pref];
  const list = [];
  for (const k of order) if (ACT_TEXT[k] && !list.includes(k)) list.push(k);
  for (const k of ['more', 'example', 'quiz', 'simple', 'summary', 'harder', 'exam']) {
    if (list.length >= 5) break;
    if (!list.includes(k)) list.push(k);
  }
  return list.slice(0, 5).map((k, i) => {
    let label = ACT_TEXT[k];
    // 进度直接写在按钮上，一眼看得出考过几次、对几道
    if (k === 'quiz' && quizzes.length) label = `考考我（${right}/${quizzes.length}）`;
    if (k === 'summary' && n >= 4) label = '总结这节';
    return `<button class="c-act${i === 0 ? ' rec' : ''}" data-act="${k}" type="button">${label}</button>`;
  }).join('');
}

// 讲完一轮就把按钮刷成新的推荐，不用整页重绘
function refreshActs() {
  const el = document.getElementById('cActs');
  if (el) el.innerHTML = actChipsHtml();
}

function classHtml() {
  const log = loadLog()[chapterKey()] || [];
  const msgs = log.map((t, i) => (t.q || t.img ? bubble('m', t.q || '', t.img) : '') + bubble('t', t.a || '', '', t.quiz, i)).join('');
  const empty = !log.length;
  return `
    <div class="c-classhead">
      <div class="c-chinfo">
        <b>${esc(Sel.chapter)}</b>
        <span>${esc(Sel.grade)}${esc(Sel.subject)} · ${esc(Sel.book)}${Sel.section ? ' · ' + esc(Sel.section) : ''}</span>
      </div>
      <button class="c-tinfo" id="cChangeTeacher" type="button">
        <span class="c-mava sm">${avaHtml(Teacher.emoji)}</span>
        <em>${esc(Teacher.name)}</em>
      </button>
    </div>
    <div class="c-thread" id="cThread">${msgs}${empty ? `<div class="c-welcome">${bubble('t', `我是${Teacher.name}，这节讲《${Sel.chapter}${Sel.section ? ' · ' + Sel.section : ''}》。准备好了我们就开始。`)}</div>` : ''}</div>
    <div class="c-acts" id="cActs">${actChipsHtml()}</div>
    <div class="composer study-composer">
      <div class="bar">
        <div class="row">
          <textarea id="cInput" rows="1" placeholder="问老师一句…"></textarea>
        </div>
        <button class="send" id="cSend" type="button" aria-label="发送">
          <svg class="ico-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5.5"></path><path d="M6.8 11.2c1.8-1.7 3.5-3.4 5.2-5.2 1.7 1.8 3.4 3.5 5.2 5.2"></path></svg>
        </button>
      </div>
    </div>`;
}

function html() {
  if (S.step === 'teacher') return teacherHtml();
  if (S.step === 'custom') return customHtml();
  if (S.step === 'class') return classHtml();
  return pickHtml();
}

/* ---------------- 交互 ---------------- */
function threadEl() { return document.getElementById('cThread'); }

function scrollEnd(smooth) {
  const th = threadEl();
  if (!th) return;
  const top = th.scrollHeight;
  if (smooth && th.scrollTo) th.scrollTo({ top, behavior: 'smooth' });
  else th.scrollTop = top;
}

async function streamLesson(action, text) {
  if (S.busy) return;
  S.busy = true;
  haptic(8);
  const log = loadLog();
  const key = chapterKey();
  const arr = log[key] || [];
  const th = threadEl();
  const acts = document.getElementById('cActs');
  if (acts) acts.classList.add('dim');
  const qText = action === 'ask' ? String(text || '') : '';
  let liveId = '';
  if (th) {
    const welcome = th.querySelector('.c-welcome');
    if (welcome) welcome.remove();
    if (qText) th.insertAdjacentHTML('beforeend', bubble('m', qText));
    liveId = 'cLive' + (++liveSeq);
    th.insertAdjacentHTML('beforeend', `<div class="c-msg t" id="${liveId}"><span class="c-mava">${avaHtml(Teacher.emoji)}</span><div class="c-bub"><div class="c-body" id="${liveId}b"></div></div></div>`);
    renderBody(document.getElementById(liveId + 'b'), '', true);
    scrollEnd(false);
  }
  let acc = '';
  let raf = 0;
  const paint = (streaming) => {
    raf = 0;
    renderBody(document.getElementById(liveId + 'b'), acc, streaming);
    scrollEnd(false);
  };
  try {
    const res = await fetch('/api/course/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: state.uid,
        stage: Sel.stage, grade: Sel.grade, subject: Sel.subject, book: Sel.book, chapter: Sel.chapter,
        section: Sel.section || '',
        teacher: Teacher, action, text: qText,
        history: arr.slice(-4).map(t => ({ q: t.q || '', a: t.a || '' })),
      }),
    });
    if (!res.ok || !res.body) throw new Error('上课失败，再试一次');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() || '';
      for (const ch of chunks) {
        for (const line of ch.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const d = j.choices && j.choices[0] && j.choices[0].delta;
            if (d && d.content) acc += d.content;
          } catch (_) {}
        }
      }
      if (!raf) raf = requestAnimationFrame(() => paint(true));
    }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const finalText = acc.trim();
    if (!finalText) throw new Error('这次老师没说出来，再点一次');
    const quiz = action === 'quiz' ? parseQuiz(finalText) : null;
    const shown = quiz ? stripQuiz(finalText) : finalText;
    arr.push({ act: action, q: qText, a: shown, quiz: quiz || undefined, at: Date.now() });
    log[key] = arr;
    saveLog(log);
    // 学分只在单选题答对时给，讲课本身不刷学分
    if (quiz && th) renderCourse(false);
    else renderBody(document.getElementById(liveId + 'b'), finalText, false);
  } catch (e) {
    const el = document.getElementById(liveId + 'b');
    if (el) el.innerHTML = `<span class="c-err">${esc(e.message || '出错了')}</span>`;
    haptic([12, 40, 12]);
  } finally {
    S.busy = false;
    const a2 = document.getElementById('cActs');
    if (a2) { a2.classList.remove('dim'); a2.innerHTML = actChipsHtml(); }
    scrollEnd(true);
  }
}

let obTimer = 0;

function obTransition(after) {
  const step = document.getElementById('cObStep');
  if (step) step.classList.add('leaving');
  clearTimeout(obTimer);
  obTimer = setTimeout(() => {
    after();
    render();
    requestAnimationFrame(() => {
      const next = document.getElementById('cObStep');
      if (next) next.classList.add('in');
    });
  }, 240);
}

// 第一步往回走就是退出（跟刷题引导的箭头语义一致）
function customBack() {
  const idx = S.qIdx || 0;
  if (idx <= 0) { S.step = 'teacher'; haptic(8); render(); return; }
  if (CUSTOM_Q[idx].type === 'text') {
    const inp = document.getElementById('cObInput');
    S.custom[CUSTOM_Q[idx].k] = (inp && inp.value.trim()) || CUSTOM_Q[idx].def || '';
  }
  haptic(6);
  obTransition(() => { S.qIdx = idx - 1; });
}

function customAdvance() {
  const idx = S.qIdx || 0;
  const q = CUSTOM_Q[idx];
  if (q.type === 'text') {
    const inp = document.getElementById('cObInput');
    S.custom[q.k] = (inp && inp.value.trim()) || q.def || '';
  }
  if (idx < CUSTOM_Q.length - 1) {
    haptic(6);
    obTransition(() => { S.qIdx = idx + 1; });
  } else {
    haptic(12);
    obTransition(() => {
      const t = buildCustom(S.custom || {});
      t.id = 'cu' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
      t.custom = true;
      const mine = loadMyTeachers();
      mine.push(t);
      saveMyTeachers(mine);
      Teacher = t;
      saveTeacher(Teacher);
      S.step = 'teacher';
    });
  }
}

function stepBack() {
  if (S.step === 'class') return () => { S.step = 'teacher'; S.busy = false; render(); };
  if (S.step === 'teacher') return () => { S.step = 'pick'; render(); };
  if (S.step === 'custom') return () => { S.step = 'teacher'; render(); };
  return backToStudy;
}

function bind() {
  const body = document.getElementById('pageBody');
  if (!body) return;
  body.onclick = e => {
    const st = e.target.closest('[data-stage]');
    if (st) {
      Sel.stage = st.dataset.stage;
      const gs = (STAGES.find(x => x.key === Sel.stage) || STAGES[0]).grades;
      if (!gs.includes(Sel.grade)) Sel.grade = gs[0];
      const subs = subjectsOf(Sel.stage);
      if (!subs.includes(Sel.subject)) Sel.subject = subs[0];
      Sel.book = ''; Sel.chapter = '';
      saveSel(); haptic(6); render(); return;
    }
    const gd = e.target.closest('[data-grade]');
    if (gd) { Sel.grade = gd.dataset.grade; saveSel(); haptic(6); render(); return; }
    const sj = e.target.closest('[data-subject]');
    if (sj) { Sel.subject = sj.dataset.subject; Sel.book = ''; Sel.chapter = ''; saveSel(); haptic(6); render(); return; }
    const bk = e.target.closest('[data-book]');
    if (bk) { Sel.book = bk.dataset.book; Sel.chapter = ''; saveSel(); haptic(6); render(); return; }
    const un = e.target.closest('[data-unit]');
    if (un) {
      Sel.chapter = un.dataset.unit;
      Sel.section = '';
      S.secErr = '';
      saveSel();
      haptic(10);
      const top = scrollTopNow();
      renderAt(top);
      fetchSections(Sel.chapter);
      return;
    }
    const sc = e.target.closest('[data-sec]');
    if (sc) { Sel.section = sc.dataset.sec || ''; saveSel(); haptic(6); renderAt(scrollTopNow()); return; }
    if (e.target.closest('[data-secre]')) { S.secErr = ''; haptic(6); fetchSections(Sel.chapter); return; }

    if (e.target.closest('#cNext')) { S.step = 'teacher'; haptic(8); render(); return; }
    if (e.target.closest('#cBackPick')) { S.step = 'pick'; render(); return; }
    if (e.target.closest('#cChangeTeacher')) { S.step = 'teacher'; render(); return; }

    const tc = e.target.closest('[data-teacher]');
    if (tc) {
      const id = tc.dataset.teacher;
      if (id === 'custom') { S.custom = {}; S.qIdx = 0; S.step = 'custom'; haptic(8); render(); return; }
      const p = PRESETS.find(x => x.id === id) || loadMyTeachers().find(x => x.id === id);
      if (p) { Teacher = p; saveTeacher(p); haptic(6); render(); }
      return;
    }
    const td = e.target.closest('[data-tdel]');
    if (td) {
      const id = td.dataset.tdel;
      saveMyTeachers(loadMyTeachers().filter(t => t.id !== id));
      if (Teacher.id === id) { Teacher = PRESETS[0]; saveTeacher(Teacher); }
      haptic(8);
      render();
      return;
    }
    if (e.target.closest('#cStart')) {
      S.step = 'class'; haptic(10); render();
      setTimeout(() => {
        const log = loadLog()[chapterKey()] || [];
        if (!log.length) streamLesson('start');
        else scrollEnd(false);
      }, 60);
      return;
    }

    // 量身定做
    const opt = e.target.closest('[data-opt]');
    if (opt) { S.custom[CUSTOM_Q[S.qIdx || 0].k] = opt.dataset.opt; customAdvance(); return; }
    if (e.target.closest('#cObNext')) { customAdvance(); return; }
    if (e.target.closest('#cObBack')) { customBack(); return; }

    const qo = e.target.closest('[data-qopt]');
    if (qo) {
      const log = loadLog();
      const key = chapterKey();
      const item = (log[key] || [])[Number(qo.dataset.qi)];
      if (!item || !item.quiz || item.quiz.pick) return;
      item.quiz.pick = qo.dataset.qopt;
      saveLog(log);
      const ok = item.quiz.pick === item.quiz.ans;
      if (ok) creditsAdd(200, '答对了');
      haptic(ok ? [8, 24, 8] : 16);
      renderAt(scrollTopNow());
      return;
    }

    const act = e.target.closest('[data-act]');
    if (act) { streamLesson(act.dataset.act); return; }
    if (e.target.closest('#cSend')) { sendFromInput(); return; }
  };

  body.oninput = e => {
    if (e.target && e.target.id === 'cInput') {
      const t = e.target;
      t.style.height = 'auto';
      t.style.height = Math.min(120, t.scrollHeight) + 'px';
    }
  };

  body.onkeydown = e => {
    if (e.target && e.target.id === 'cObInput' && e.key === 'Enter') { e.preventDefault(); customAdvance(); return; }
    if (e.target && e.target.id === 'cInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromInput(); }
  };
}

function sendFromInput() {
  const inp = document.getElementById('cInput');
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  streamLesson('ask', v);
}

let backToStudy = null;
let lastStep = '';

function renderCourse(animate) {
  const page = document.getElementById('page');
  const wasOpen = !!(page && page.classList.contains('show'));
  const switching = wasOpen && !!lastStep && lastStep !== S.step;
  const htmlStr = html();
  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageTitle('课程');
    fillPage(htmlStr);
    if (animate) playPageSwitch('study', 'study', 1);
  } else {
    openPage('课程', htmlStr, backToStudy, 'study');
  }
  const bodyEl = document.getElementById('pageBody');
  if (bodyEl) {
    bodyEl.classList.remove('drill-page', 'study-full');
    bodyEl.classList.add('course-page');
    bodyEl.classList.toggle('course-full', S.step === 'class');
    bodyEl.classList.toggle('course-custom', S.step === 'custom');
    if (switching) {
      bodyEl.classList.remove('c-swap');
      void bodyEl.offsetWidth;
      bodyEl.classList.add('c-swap');
    }
  }
  lastStep = S.step;
  setPageLevel(stepBack());
  bind();
  if (S.step === 'class') scrollEnd(false);
  if (S.step === 'custom') {
    requestAnimationFrame(() => {
      const el = document.getElementById('cObStep');
      if (el) el.classList.add('in');
    });
  }
}

function render(animate) { renderCourse(!!animate); }

export function openCourse(onBack) {
  backToStudy = () => {
    S.busy = false;
    lastStep = '';
    const bodyEl = document.getElementById('pageBody');
    if (bodyEl) bodyEl.classList.remove('course-page', 'course-full');
    if (typeof onBack === 'function') onBack();
  };
  if (!S.step) S.step = 'pick';
  if (!subjectsOf(Sel.stage).includes(Sel.subject)) {
    const subs = subjectsOf(Sel.stage);
    if (subs[0]) { Sel.subject = subs[0]; Sel.book = ''; Sel.chapter = ''; }
  }
  if (!Sel.book) {
    const list = booksOf(Sel.stage, Sel.subject);
    const near = list.find(x => x.g === Sel.grade) || list[0];
    if (near) Sel.book = near.b;
  }
  renderCourse(true);
}

// 供刷题/错题本跳转：直接落到指定章节，并从选老师开始
export function openCourseAt({ stage, grade, subject, book, chapter, action, ask } = {}) {
  if (stage) Sel.stage = stage;
  if (subject) Sel.subject = subject;
  if (grade) Sel.grade = grade;
  if (book) Sel.book = book;
  if (chapter) Sel.chapter = chapter;
  Sel.section = '';
  saveSel();
  S.step = chapter ? 'teacher' : 'pick';
  render(!!document.getElementById('page'));
  if (chapter && !sectionsFor(chapter).length) fetchSections(chapter);
  if (chapter && action) {
    setTimeout(() => {
      S.step = 'class';
      render();
      // action='ask' 时把要问的话一起带进去，刷题详解点「进入对话」就靠这个接上
      streamLesson(action, ask || '');
    }, 120);
  }
}
