// 刷题（v3.21）：题库优先秒出、多选/判断/填空、不会与未学标记、暂停续做、详解跳转、公式渲染
import { state } from './state.js?v=12';
import { openPage, fillPage, setPageLevel, setPageTitle, setActiveNav, playPageSwitch, toast } from './ui.js?v=150';
import { haptic } from './haptics.js';
import { renderPhysics } from './physics.js?v=19';
import { renderChem } from './chem.js?v=26';
import { openCourseAt } from './course.js?v=37';
import { guessChapter, stageOfGrade, booksOf, unitsOf } from './curriculum.js?v=12';
import { creditsAdd } from './credits.js?v=16';

const KEY = 'minxtok.drill.v1';
const RUN_KEY = 'minxtok.drill.run.v2';

const SUBJECTS = [
  { key: 'chinese', name: '语文', stages: ['p', 'j', 'h'] },
  { key: 'math', name: '数学', stages: ['p', 'j', 'h'] },
  { key: 'english', name: '英语', stages: ['p', 'j', 'h'] },
  { key: 'politics', name: '政治', stages: ['j', 'h'] },
  { key: 'history', name: '历史', stages: ['j', 'h'] },
  { key: 'geography', name: '地理', stages: ['j', 'h'] },
  { key: 'physics', name: '物理', stages: ['j', 'h'] },
  { key: 'chemistry', name: '化学', stages: ['j', 'h'] },
  { key: 'biology', name: '生物', stages: ['j', 'h'] },
];

const STAGES = [
  { key: 'p', name: '小学', grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'] },
  { key: 'j', name: '初中', grades: ['初一', '初二', '初三'] },
  { key: 'h', name: '高中', grades: ['高一', '高二', '高三'] },
  { key: 'xsc', name: '小升初', base: 'p', grades: ['六年级'] },
  { key: 'zk', name: '中考', base: 'j', grades: ['初三'] },
  { key: 'gk', name: '高考', base: 'h', grades: ['高三'] },
];

// 考试档：挂到对应学段的年级行末（六年级→小升初，初三→中考，高三→高考）
const EXAMS = { p: 'xsc', j: 'zk', h: 'gk' };

const COUNTS = [5, 10, 15];
const SECS = [30, 45, 60, 0];
// 七档难度（明轩定）：易 / 较易 / 中等 / 中等偏难 / 较难 / 难 / 极难
const LEVELS = [
  { key: 'l1', name: '易' },
  { key: 'l2', name: '较易' },
  { key: 'l3', name: '中等' },
  { key: 'l4', name: '中等偏难' },
  { key: 'l5', name: '较难' },
  { key: 'l6', name: '难' },
  { key: 'l7', name: '极难' },
];
const TYPE_NAME = { choice: '单选', multi: '多选', indef: '不定项', judge: '判断', fill: '填空' };
function isMulti(it) { return !!it && (it.type === 'multi' || it.type === 'indef'); }

function stageOf(key) { return STAGES.find(s => s.key === key) || STAGES[1]; }
function baseStage(key) { const st = STAGES.find(s => s.key === key); return (st && st.base) || key; }
function subjOf(key) { return SUBJECTS.find(s => s.key === key) || SUBJECTS[1]; }
function subjectsOf(stage) { const b = baseStage(stage); return SUBJECTS.filter(s => s.stages.includes(b)); }
function levelName(key) { const l = LEVELS.find(x => x.key === key); return l ? l.name : '中等'; }

function loadSettings() {
  const def = {
    stage: 'j', grade: '初二', subject: 'math', level: 'l3', count: 10, secs: 45,
    book: '', chapter: '', section: '',
    types: { choice: true, multi: true, indef: false, judge: true, fill: true },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...def, ...raw };
    const LMAP = { basic: 'l1', medium: 'l3', hard: 'l5' };
    if (LMAP[out.level]) out.level = LMAP[out.level];
    out.types = { ...def.types, ...(raw && raw.types) };
    if (!STAGES.some(s => s.key === out.stage)) out.stage = def.stage;
    if (!stageOf(out.stage).grades.includes(out.grade)) out.grade = stageOf(out.stage).grades[0];
    if (!SUBJECTS.some(s => s.key === out.subject && s.stages.includes(out.stage))) out.subject = subjectsOf(out.stage)[0].key;
    if (!LEVELS.some(l => l.key === out.level)) out.level = def.level;
    if (!COUNTS.includes(out.count)) out.count = def.count;
    if (!SECS.includes(out.secs)) out.secs = def.secs;
    if (typeof out.book !== 'string') out.book = '';
    if (typeof out.chapter !== 'string') out.chapter = '';
    if (typeof out.section !== 'string') out.section = '';
    return out;
  } catch (_) { return def; }
}

let S = loadSettings();
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }

let run = null;
let busy = false;

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 公式渲染（KaTeX 本地包，加载失败就退回纯文本） ---------- */
function tex(src, display) {
  const k = window.katex;
  if (!k || !k.renderToString) return esc(src).replace(/_{2,}/g, '____');
  try {
    // 行内 \frac 在 KaTeX 里是 scriptstyle，容易小到看不清；刷题里统一抬成 \dfrac。
    const body = display ? src : String(src || '').replace(/\\frac(?![A-Za-z])/g, '\\dfrac');
    return k.renderToString(body, { throwOnError: false, displayMode: !!display, strict: false, trust: false });
  } catch (_) {
    return esc(src);
  }
}

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

// 纯文本段：普通文本照旧，遇到裸 LaTeX 命令就地渲染
function plainHtml(chunk, plain) {
  let out = '';
  const emit = t => {
    if (!t) return;
    // 先切出拉丁字母/数字/算式片段，再逐段转义：直接在转义后的 HTML 上正则会把 &amp; 里的字母包进去
    const runs = String(t).split(/([A-Za-z0-9][A-Za-z0-9+\-*/=<>±×÷·.,()\[\]{}'′°%^]*)/);
    let h = runs.map((piece, i) => (i % 2 ? `<span class="mrun">${esc(piece)}</span>` : esc(piece))).join('');
    if (!plain) h = h.replace(/_{2,}/g, '<span class="drill-blank"></span>');
    out += h.replace(/\n/g, '<br>');
  };
  let cur = 0;
  while (cur < chunk.length) {
    const idx = chunk.indexOf('\\', cur);
    if (idx < 0) { emit(chunk.slice(cur)); break; }
    const bc = texCmdAt(chunk, idx);
    if (!bc) { emit(chunk.slice(cur, idx + 1)); cur = idx + 1; continue; }
    emit(chunk.slice(cur, idx));
    out += tex(bc.src, false);
    cur = bc.end;
  }
  return out;
}

function mathLike(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^[A-Za-z]$/.test(t) || /^\d+(?:\.\d+)?$/.test(t)) return true;
  if (/[\u3400-\u9fff]/.test(t) && !/\\[A-Za-z]+|[=<>≤≥≠≈\^_]/.test(t)) return false;
  return /\\[A-Za-z]+|[\^_]\s*[{A-Za-z0-9]|[=<>≤≥≠≈∑∫√∞π]|\d\s*[+\-*/]\s*\d/.test(t);
}

// 把 $...$ / $$...$$ / \(...\) 里的内容交给 KaTeX，其余按普通文本处理
function rich(text, plain) {
  let s = String(text == null ? '' : text);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, m1) => `$${m1}$`).replace(/\\\[([\s\S]+?)\\\]/g, (m, m1) => `$$${m1}$$`);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const dm = /^\$\$([\s\S]+?)\$\$/.exec(rest);
    if (dm) {
      out += mathLike(dm[1]) ? tex(dm[1], true) : plainHtml(dm[1], plain);
      i += dm[0].length;
      continue;
    }
    const im = /^\$([^$\n]+?)\$/.exec(rest);
    if (im) {
      out += mathLike(im[1]) ? tex(im[1], false) : plainHtml(im[1], plain);
      i += im[0].length;
      continue;
    }
    // 普通文本：累积到下一个 $ 之前
    let next = s.indexOf('$', i + 1);
    if (next < 0) next = s.length;
    out += plainHtml(s.slice(i, next), plain);
    i = next;
  }
  return out;
}

function renderQ(text) { return rich(text); }
// 详解这种长文按行排：### / **加粗整行** 当小标题，行内加粗照常
function richMd(text) {
  const line = (raw) => {
    const h = /^\s*#{1,4}\s+(.+?)\s*$/.exec(raw);
    if (h) return `<div class="ddp-h">${rich(h[1])}</div>`;
    const b = /^\s*\*\*(.+?)\*\*\s*[:：]?\s*$/.exec(raw);
    if (b) return `<div class="ddp-h">${rich(b[1])}</div>`;
    let out = '';
    let rest = raw;
    const re = /\*\*(.+?)\*\*/;
    let m;
    while ((m = re.exec(rest))) {
      out += rich(rest.slice(0, m.index)) + `<b>${rich(m[1])}</b>`;
      rest = rest.slice(m.index + m[0].length);
    }
    return out + rich(rest);
  };
  return String(text || '').split('\n').map(line).join('<br>');
}
// 填空题有几个空：题干里 ___ 的段数
function blankRuns(q) { return (String(q || '').match(/_{2,}/g) || []).length; }
// 多空填空：每个空就是题干里那条横线本身，点它直接填
function fillStemHtml(q) {
  const parts = String(q || '').split(/_{2,}/);
  if (parts.length < 2) return renderQ(q);
  let out = '';
  parts.forEach((p, k) => {
    out += renderQ(p);
    if (k < parts.length - 1) {
      out += `<input class="qblank" data-bi="${k}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${k === parts.length - 2 ? 'done' : 'next'}">`;
    }
  });
  return out;
}
// answer 里多空答案的拆分（按空序）
function splitFillAnswer(a) {
  return String(a || '').split(/[;；]+|\s*\/\s*/).map(normFill).filter(Boolean);
}
function renderOpt(text) { return rich(text); }

/* ---------- 进度存档 ---------- */
function saveRunState() {
  if (!run || run.done) return;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({
      subject: run.subject, grade: run.grade, level: run.level,
      items: run.items, i: run.i, right: run.right, wrong: run.wrong,
      notes: run.notes, unlearned: run.unlearned, startedAt: run.startedAt,
      chapter: run.chapter || '', section: run.section || '',
      left: run.keepLeft || run.left || 0,
      savedAt: Date.now(),
    }));
  } catch (_) {}
}

function loadRunState() {
  try {
    const d = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (!d || !Array.isArray(d.items) || !d.items.length) return null;
    if (Date.now() - (d.savedAt || 0) > 7 * 24 * 3600 * 1000) return null;
    return d;
  } catch (_) { return null; }
}

function clearRunState() { try { localStorage.removeItem(RUN_KEY); } catch (_) {} }

function adoptSaved(d) {
  run = {
    subject: d.subject, grade: d.grade, level: d.level,
    items: d.items, i: Math.min(d.i || 0, d.items.length - 1),
    right: d.right || 0, wrong: d.wrong || [], notes: d.notes || {},
    unlearned: d.unlearned || [], startedAt: d.startedAt || Date.now(),
    chapter: d.chapter || '', section: d.section || '',
    paused: true, done: false, timer: null, left: 0, keepLeft: d.left || 0,
    locked: false, leftAt: 0, detailOpen: false,
  };
}

/* ---------- 页面骨架 ---------- */
const CV_STAGE = { p: '小学', j: '初中', h: '高中' };
function cvStage() { return CV_STAGE[baseStage(S.stage)] || '初中'; }
function cvBooks() {
  const sj = D_SUBJ_ZH[S.subject] || '数学';
  try { return booksOf(cvStage(), sj, S.grade) || []; } catch (_) { return []; }
}
// 教材/章节/小节都支持多选，用顿号拼成一条字符串存（沿用原来的单字符串结构）
// 存多选不能用「、」——「时、分、秒」「一元二次函数、方程和不等式」这类章节名本身就带顿号，
// 存进去再拆开就散架，表现为点第一项点不动（存的值永远对不上）。
const SEL_SEP = '||';
const SEL_SHOW = '、';
// 旧数据里是顿号拼的，靠已知书名/章节名做最长匹配还原
function legacyResolve(v) {
  const sj = D_SUBJ_ZH[S.subject] || '数学';
  const pool = [];
  try {
    booksOf(cvStage(), sj).forEach(bk => {
      pool.push(bk.b);
      (unitsOf(cvStage(), sj, bk.b) || []).forEach(u => pool.push(u));
    });
  } catch (_) {}
  pool.sort((a, b) => b.length - a.length);
  const out = [];
  let rest = String(v);
  let guard = 0;
  while (rest && guard++ < 60) {
    const hit = pool.find(x => x && rest.indexOf(x) === 0);
    if (!hit) return null;
    out.push(hit);
    rest = rest.slice(hit.length);
  }
  return out.length ? out : null;
}
function splitSel(v) {
  const raw = String(v || '');
  if (!raw) return [];
  if (raw.indexOf(SEL_SEP) >= 0) return raw.split(SEL_SEP).map(x => x.trim()).filter(Boolean);
  if (raw.indexOf(SEL_SHOW) < 0) return [raw.trim()].filter(Boolean);
  return legacyResolve(raw) || raw.split(SEL_SHOW).map(x => x.trim()).filter(Boolean);
}
function joinSel(a) { return a.join(SEL_SEP); }
// 给人看 / 交给服务端时还原成顿号
function selText(v) { return splitSel(v).join(SEL_SHOW); }
function bookList() { return splitSel(S.book); }
function chapList() { return splitSel(S.chapter); }
function secList() { return splitSel(S.section); }
// 只有「一本教材 + 一章」时才拆小节，多选时这一步跳过
function secTarget() {
  const ch = chapList();
  const bs = bookList();
  if (ch.length !== 1 || bs.length > 1) return null;
  return { book: bs[0] || '', chapter: ch[0] };
}
function cvUnits() {
  const sj = D_SUBJ_ZH[S.subject] || '数学';
  const bs = bookList();
  const books = bs.length ? bs : cvBooks().map(x => x.b);
  const out = [];
  books.forEach(b => {
    try {
      (unitsOf(cvStage(), sj, b) || []).forEach(u => { if (u && !out.includes(u)) out.push(u); });
    } catch (_) {}
  });
  return out;
}
function scopeText(stage, grade, subject, book, chapter, section) {
  return [stageOf(stage).name, grade, subjOf(subject).name, selText(book), selText(chapter), selText(section)].filter(Boolean).join(' · ');
}
function chip(attr, val, label, on) {
  return `<button type="button" class="dp-chip${on ? ' on' : ''}" ${attr}="${esc(val)}">${esc(label)}</button>`;
}

// 引导页：先定范围再出题，卡片只在真正开刷之后才出现
/* ---------- 引导页：和 MinxTok 引导页同款的分步选择 ---------- */
let wizIdx = 0;
let wizSeq = 0;
let secPending = false;

const STEP_EN = {
  stage: 'STAGE', grade: 'GRADE', subject: 'SUBJECT', book: 'BOOK', chapter: 'CHAPTER',
  section: 'SECTION', types: 'TYPE', level: 'LEVEL', count: 'COUNT', secs: 'PACE', review: 'READY',
};
const STAGE_EN = { p: 'Primary', j: 'Junior', h: 'Senior' };
const SUBJ_EN = {
  chinese: 'Chinese', math: 'Math', english: 'English', physics: 'Physics',
  chemistry: 'Chemistry', biology: 'Biology', politics: 'Politics', history: 'History',
  geography: 'Geography', morality: 'Civics', science: 'Science',
};

const ARROW_R = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M5 12h13M12.5 5.2 19.8 12l-7.3 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_L = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M19 12H6M11.5 5.2 4.2 12l7.3 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 一步里的一行：竖向排列、整行可点、右侧可带英文小注
function opt(attr, val, label, en, on, i) {
  return `<button type="button" class="dw-opt${on ? ' on' : ''}" ${attr}="${esc(val)}" style="--i:${i}">`
    + `<span class="dw-opt-t">${esc(label)}</span>`
    + (en ? `<span class="dw-opt-e">${esc(en)}</span>` : '')
    + '<span class="dw-opt-mark" aria-hidden="true"></span></button>';
}

function stepBody(id, h, sub, inner) {
  return `<p class="dw-eyebrow">${STEP_EN[id] || ''}</p>`
    + `<h2 class="ob-h2 dw-h2">${h}</h2>`
    + (sub ? `<p class="ob-sub">${sub}</p>` : '')
    + inner;
}

function resumeRows() {
  const d = loadRunState();
  if (!d) return '';
  const at = new Date(d.savedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="dw-hist-h"><span>历史</span></div>
    <button type="button" class="dw-histrow" data-wresume="1">
      <span class="dw-histrow-t">${esc(d.grade + subjOf(d.subject).name)} · 第 ${d.i + 1} / ${d.items.length} 题</span>
      <span class="dw-histrow-m">上次没刷完 · 已答对 ${d.right} 道 · ${esc(at)}</span>
    </button>`;
}

function reviewBody() {
  const types = Object.keys(TYPE_NAME).filter(k => S.types[k]).map(k => TYPE_NAME[k]).join(' · ');
  return stepBody('review', '就这样出题', '', `
    <div class="dw-sum">
      <div class="dw-sum-row"><span>范围</span><b>${esc(scopeText(S.stage, S.grade, S.subject, S.book, S.chapter, S.section))}</b></div>
      <div class="dw-sum-row"><span>题型</span><b>${esc(types || '单选')}</b></div>
      <div class="dw-sum-row"><span>难度</span><b>${esc(levelName(S.level))}</b></div>
      <div class="dw-sum-row"><span>节奏</span><b>${S.count} 道 · ${S.secs ? S.secs + ' 秒/题' : '不限时'}</b></div>
    </div>
    <div class="dw-hist">${resumeRows()}</div>`);
}

function wizSteps() {
  const base = baseStage(S.stage);
  const examKey = EXAMS[base] || '';
  const examStage = examKey ? stageOf(examKey) : null;
  const isExam = !!examStage && S.stage === examKey;
  const out = [];

  out.push({
    id: 'stage', name: '学段', h: '从哪个学段开始', sub: '换了学段，科目和教材会一起换。',
    body: stepBody('stage', '从哪个学段开始', '换了学段，科目和教材会一起换。',
      `<div class="dw-list">${'pjh'.split('').map((k, i) => {
        const st = stageOf(k);
        return opt('data-wstage', st.key, st.name, STAGE_EN[k], base === st.key, i);
      }).join('')}</div>`),
  });

  out.push({
    id: 'grade', name: '年级', h: '现在读到哪一年', sub: '',
    body: stepBody('grade', '现在读到哪一年', '', `<div class="dw-list">${
      stageOf(base).grades.map((g, i) => opt('data-wgrade', g, g, '', !isExam && g === S.grade, i)).join('')
    }${examStage ? opt('data-wexam', examKey, examStage.name, '', isExam, stageOf(base).grades.length) : ''}</div>`),
  });

  out.push({
    id: 'subject', name: '科目', h: '想刷哪一科', sub: '',
    body: stepBody('subject', '想刷哪一科', '', `<div class="dw-list">${
      subjectsOf(S.stage).map((sj, i) => opt('data-wsubject', sj.key, sj.name, SUBJ_EN[sj.key] || '', sj.key === S.subject, i)).join('')
    }</div>`),
  });

  const books = cvBooks();
  const pickedBooks = bookList();
  out.push({
    id: 'book', name: '教材', h: '用哪本教材', sub: '可以多选，不选就是整科。',
    body: stepBody('book', '用哪本教材', '可以多选，不选就是整科。', `<div class="dw-list">${
      books.map((b, i) => opt('data-wbook', b.b, b.b, '', pickedBooks.includes(b.b), i)).join('')
    }</div>`),
  });

  const units = cvUnits();
  const pickedChaps = chapList();
  out.push({
    id: 'chapter', name: '章节', h: '刷到哪一章', sub: '可以多选，不选就是整本。',
    body: stepBody('chapter', '刷到哪一章', '可以多选，不选就是整本。', `<div class="dw-list">${
      units.map((u, i) => opt('data-wchap', u, u, '', pickedChaps.includes(u), i)).join('')
    }</div>`),
  });

  const tgt = secTarget();
  if (tgt) {
    const list = sectionsOf(tgt.book, tgt.chapter);
    const picked = secList();
    out.push({
      id: 'section', name: '小节', h: '再细一点', sub: '可以多选，不选就是整章。',
      body: stepBody('section', '再细一点', '可以多选，不选就是整章。', list.length
        ? `<div class="dw-list">${list.map((x, i) => opt('data-wsec', x, x, '', picked.includes(x), i)).join('')}</div>`
        : '<div class="dw-wait"><i class="dw-spin"></i><span>正在拆这一章的小节，大概两三秒</span></div>'),
    });
  }

  out.push({
    id: 'types', name: '题型', h: '要哪些题型', sub: '可以多选，至少留一个。',
    body: stepBody('types', '要哪些题型', '可以多选，至少留一个。', `<div class="dw-list">${
      Object.keys(TYPE_NAME).map((k, i) => opt('data-wtype', k, TYPE_NAME[k], k === 'indef' ? 'Any of' : '', !!S.types[k], i)).join('')
    }</div>`),
  });

  out.push({
    id: 'level', name: '难度', h: '这一组刷多难', sub: '',
    body: stepBody('level', '这一组刷多难', '', `<div class="dw-list">${
      LEVELS.map((l, i) => opt('data-wlevel', l.key, l.name, '', l.key === S.level, i)).join('')
    }</div>`),
  });

  out.push({
    id: 'count', name: '题量', h: '刷几道', sub: '',
    body: stepBody('count', '刷几道', '', `<div class="dw-list">${
      COUNTS.map((n, i) => opt('data-wcount', String(n), n + ' 道', '', S.count === n, i)).join('')
    }</div>`),
  });

  out.push({
    id: 'secs', name: '节奏', h: '每题给多久', sub: '到点自动判。',
    body: stepBody('secs', '每题给多久', '到点自动判。', `<div class="dw-list">${
      SECS.map((x, i) => opt('data-wsecs', String(x), x ? x + ' 秒' : '不限时', '', S.secs === x, i)).join('')
    }</div>`),
  });

  out.push({ id: 'review', name: '确认', h: '', sub: '', body: reviewBody() });
  return out;
}

function nextBtnHtml(last) {
  return last ? `<span>开始出题</span>${ARROW_R}` : ARROW_R;
}

function wizHtml() {
  const steps = wizSteps();
  if (wizIdx > steps.length - 1) wizIdx = steps.length - 1;
  if (wizIdx < 0) wizIdx = 0;
  const st = steps[wizIdx];
  const pct = Math.round(((wizIdx + 1) / steps.length) * 100);
  const last = wizIdx >= steps.length - 1;
  return `
    <div class="drill-pick dw" id="drillPick">
      <div class="dw-top">
        <span class="dw-kicker" id="dwKicker">${wizIdx + 1} / ${steps.length} · ${st.name}</span>
        <span class="dw-brand" id="dwBrand">${STEP_EN[st.id] || 'DRILL'}</span>
      </div>
      <div class="ob-progress dw-prog"><i id="dwProgFill" style="width:${pct}%"></i></div>
      <div class="ob-stage dw-stage">
        <div class="ob-step dw-step in" id="dwStep">${st.body}</div>
      </div>
      <div class="dw-bar">
        <button type="button" class="dw-arrow back" id="dwBack"${wizIdx === 0 ? ' disabled' : ''} aria-label="上一步">${ARROW_L}</button>
        <button type="button" class="dw-arrow next${last ? ' wide' : ''}" id="dwNext" aria-label="下一步">${nextBtnHtml(last)}</button>
      </div>
    </div>`;
}

function paintWiz() {
  const host = document.getElementById('drillPick');
  if (!host) return;
  host.outerHTML = wizHtml();
  requestAnimationFrame(fitList);
}

// 一列能放完就一行一个；放不下排两列；两列还塞不进就压紧凑，尽量不出现滚动
function fitList() {
  const step = document.getElementById('dwStep');
  if (!step) return;
  const list = step.querySelector('.dw-list');
  if (!list || !list.children.length) return;
  // 直接看这一步要不要滚动：不滚就一行一个（贯穿整条），滚了才拆两列
  const full = () => step.scrollHeight > step.clientHeight + 1;
  list.classList.remove('dense');
  list.style.gridTemplateColumns = '1fr';
  if (!full()) return;
  list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  if (!full()) return;
  list.classList.add('dense');
}

// 换一步：旧内容模糊上浮退场，新内容清透进场（跟明叙引导页同一套手感）
function wizRender(animate) {
  const steps = wizSteps();
  if (wizIdx > steps.length - 1) wizIdx = steps.length - 1;
  if (wizIdx < 0) wizIdx = 0;
  const st = steps[wizIdx];
  const step = document.getElementById('dwStep');
  if (!step) { paintWiz(); return; }
  const pct = Math.round(((wizIdx + 1) / steps.length) * 100);
  const fill = document.getElementById('dwProgFill');
  if (fill) fill.style.width = pct + '%';
  const last = wizIdx >= steps.length - 1;
  const kicker = document.getElementById('dwKicker');
  if (kicker) kicker.textContent = `${wizIdx + 1} / ${steps.length} · ${st.name}`;
  const brand = document.getElementById('dwBrand');
  if (brand) brand.textContent = STEP_EN[st.id] || 'DRILL';
  const next = document.getElementById('dwNext');
  if (next) {
    next.innerHTML = nextBtnHtml(last);
    next.classList.toggle('wide', last);
  }
  const back = document.getElementById('dwBack');
  if (back) back.disabled = wizIdx === 0;

  if (!animate) {
    step.innerHTML = st.body;
    step.classList.remove('leaving');
    step.classList.add('in');
    requestAnimationFrame(fitList);
    return;
  }
  const token = ++wizSeq;
  step.classList.remove('in');
  step.classList.add('leaving');
  setTimeout(() => {
    if (token !== wizSeq || !step.isConnected) return;
    step.innerHTML = st.body;
    step.classList.remove('leaving');
    void step.offsetWidth;
    step.classList.add('in');
    step.scrollTop = 0;
    requestAnimationFrame(fitList);
  }, 195);
}

function wizGo(d) {
  const steps = wizSteps();
  const next = Math.max(0, Math.min(steps.length - 1, wizIdx + d));
  if (next === wizIdx) return;
  wizIdx = next;
  wizRender(true);
  if (steps[wizIdx] && steps[wizIdx].id === 'section' && !sectionsOf(secTarget().book, secTarget().chapter).length) loadSections();
}

/* ---------- 小节：按「册|学科|章节」存本地，跟课程页共用同一套接口 ---------- */
const SEC_KEY = 'minxtok.drill.sec.v1';
let secSeq = 0;
function secCache() {
  try { return JSON.parse(localStorage.getItem(SEC_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function secKeyOf(book, chapter) { return [S.stage, S.subject, book || '', chapter || ''].join('|'); }
function sectionsOf(book, chapter) {
  const v = chapter ? secCache()[secKeyOf(book, chapter)] : null;
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
}
function cacheSections(book, chapter, list) {
  try {
    const all = secCache();
    all[secKeyOf(book, chapter)] = list;
    localStorage.setItem(SEC_KEY, JSON.stringify(all));
  } catch (_) {}
}
async function loadSections() {
  const tgt = secTarget();
  if (!tgt) return;
  if (sectionsOf(tgt.book, tgt.chapter).length) return; // 缓存已有，wizSteps 渲染时就带出来了
  const my = ++secSeq;
  secPending = true;
  try {
    const r = await fetch('/api/course/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, stage: CV_STAGE[baseStage(S.stage)] || '初中', grade: S.grade, subject: D_SUBJ_ZH[S.subject] || '数学', book: tgt.book, chapter: tgt.chapter }),
    });
    const d = await r.json().catch(() => ({}));
    const list = (d && d.ok && Array.isArray(d.sections)) ? d.sections.filter(x => typeof x === 'string' && x.trim()).slice(0, 8) : [];
    if (list.length) cacheSections(tgt.book, tgt.chapter, list);
    if (my !== secSeq) return;
  } catch (_) {}
  if (my !== secSeq) return;
  secPending = false;
  const st = wizSteps()[wizIdx];
  if (st && st.id === 'section') wizRender(true);
}

function cardShell() {
  return `
    <div class="drill-scopebar" id="drillScopeBar" hidden>
      <span class="dsb-text" id="dsbText"></span>
    </div>
    <div class="drill-stage-wrap">
      <div class="drill-card" id="drillCard" hidden>
        <div class="drill-head">
          <span class="drill-idx" id="drillIdx">待开始</span>
          <span class="drill-clock" id="drillClock" hidden>45</span>
          <button type="button" class="drill-pause" id="drillPause" aria-label="暂停" hidden>暂停</button>
        </div>
        <div class="drill-caps">
          <span class="drill-tag" id="drillTag" hidden></span>
          <span class="drill-tag lv" id="drillLv" hidden></span>
        </div>
        <div class="drill-bar" id="drillBar" hidden><i id="drillBarFill"></i></div>
        <div class="drill-body" id="drillBody"></div>
      </div>
      <div class="drill-detail-panel" id="drillDetailPanel" hidden></div>
      <p class="drill-hint" id="drillHint"></p>
    </div>`;
}

function pageHtml() { return wizHtml() + cardShell(); }

// 等待出题时轮播的小句子：知识点 / 名言 / 趣味，别让人干等
const LOAD_TIPS = [
  '质点模型是理想化的物理模型，忽略形状大小，只留质量和位置。',
  '家是一个集合，你也是一个集合，什么都可以是集合——因为没有两片一模一样的叶子。集合的互异性就是这个意思。',
  '空集是任何集合的子集，做题时最容易漏掉它。',
  '摩擦力方向与相对运动（趋势）方向相反，不是与运动方向相反。',
  '一元二次方程先看判别式，比配方快得多。',
  'instructor 是教练，camper 是营员，成对记记得更牢。',
  '比喻要有本体和喻体，借代只换个名字，别混。',
  '质量守恒定律不因反应条件改变，配平前后原子数目一样。',
  '细胞是生命活动的基本单位，除病毒外都由细胞构成。',
  '学而不思则罔，思而不学则殆。',
  '不积跬步，无以至千里；不积小流，无以成江海。',
  '做题先圈关键词，再看选项，能省一半时间。',
  '错第二次的题，才值得抄进错题本。',
  '睡前过一遍，比多刷十道更管用。',
  '函数三要素：定义域、值域、对应关系，缺一个都不算同一个函数。',
  '基本不等式取等条件常常是解题的暗门，写完回头看一眼。',
  '过去完成时说的是「过去的过去」，先把两个过去的时间点摆开。',
  '电流表要串联，电压表要并联，接错表不是没读数就是烧表。',
  '氧化还原反应的实质是电子转移，先找化合价变化最快。',
  '光合作用与呼吸作用的中间产物别混，CO₂ 的去路是分水岭。',
  '历史题先定时空，再谈原因和影响，时间错位最容易失分。',
  '地理成因题按「位置—大气—地形—水文」顺着推，比硬背稳。',
  '政治大题先亮观点，再分点给依据，最后落回材料。',
  '文言文断句先抓主谓，再看虚词，最后看句式的对称。',
  '数学压轴别急着算，先写一句「由题意可得」，把条件摆清。',
  '做错的题如果想不起当时怎么想的，说明那道还没真会。',
  '一次专注 25 分钟，比坐两小时滑手机强。',
  '把一道题讲给同桌听懂，等于自己做对三道。',
];
let tipTimer = null;
function stopTips() {
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
}
function startTips() {
  stopTips();
  let k = Math.floor(Math.random() * LOAD_TIPS.length);
  const paint = () => {
    const em = document.getElementById('drillTip');
    if (!em) { stopTips(); return; }
    em.textContent = LOAD_TIPS[k % LOAD_TIPS.length];
    k += 1;
  };
  paint();
  tipTimer = setInterval(paint, 2400);
}

function skeletonHtml() {
  const sj = subjOf(S.subject).name;
  return `
    <div class="drill-loading">
      <span class="drill-spinner" aria-hidden="true"></span>
      <b>正在出题</b>
      <em>${esc(S.grade + sj)} · ${esc((LEVELS.find(l => l.key === S.level) || LEVELS[1]).name)} · 第一次出这一组要等十几秒，之后就快了</em>
      <p class="drill-tip" id="drillTip"></p>
    </div>`;
}

/* ---------- 运行一局 ---------- */
function startRun(list, meta) {
  run = {
    subject: (meta && meta.subject) || S.subject,
    grade: (meta && meta.grade) || S.grade,
    level: (meta && meta.level) || S.level,
    items: list, i: 0, right: 0, wrong: [], notes: {}, unlearned: [],
    chapter: (meta && meta.chapter) || '', section: (meta && meta.section) || '',
    startedAt: Date.now(), paused: false, done: false,
    timer: null, left: 0, locked: false, leftAt: 0, detailOpen: false,
  };
  clearRunState();
  saveRunState();
  const panel = document.getElementById('drillDetailPanel');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  paintQuestion();
}

// 同一时刻只允许一个出题请求：切科目时旧请求直接掐掉，
// 否则后台补题会堆在同一域名上，把浏览器的并发连接占满，整页就像卡死。
let reqCtrl = null;
function abortReq() {
  if (reqCtrl) { try { reqCtrl.abort(); } catch (_) {} reqCtrl = null; }
}
async function drillPost(payload, timeoutMs = 45000) {
  abortReq();
  const ctrl = new AbortController();
  reqCtrl = ctrl;
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
  try {
    const res = await fetch('/api/study/drill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error((d && d.message) || '出题失败');
    return d;
  } finally {
    clearTimeout(timer);
    if (reqCtrl === ctrl) reqCtrl = null;
  }
}

function scopePayload(extra) {
  return Object.assign({
    uid: state.uid, subject: S.subject, grade: S.grade, level: S.level,
    book: selText(S.book) || undefined, chapter: selText(S.chapter) || undefined, section: selText(S.section) || undefined,
    types: Object.keys(S.types).filter(k => S.types[k]),
  }, extra || {});
}

async function fetchQuestions(refresh) {
  return drillPost(scopePayload({ count: S.count, refresh: refresh ? 1 : undefined }), 45000);
}

// 后台补题：一次只跑一个，同一组合 60 秒内不重复补
let fillAt = 0;
let fillKey = '';
function fillBank() {
  const key = [S.subject, S.grade, S.level, selText(S.book), selText(S.chapter), selText(S.section)].join(' > ');
  if (fillKey === key && Date.now() - fillAt < 60000) return;
  if (reqCtrl) return;
  fillKey = key;
  fillAt = Date.now();
  drillPost(scopePayload({ action: 'fill' }), 60000).catch(() => {});
}

// 预热：选完科目就悄悄攒一批，点「开始出题」时大概率秒出
let warmAt = 0;
function warmBank() {
  if (!S.subject || !S.grade) return;
  if (Date.now() - warmAt < 25000) return;
  if (reqCtrl) return;
  warmAt = Date.now();
  drillPost(scopePayload({ action: 'fill' }), 60000).catch(() => {});
}

function filterTypes(items) {
  const only = Object.keys(S.types).filter(k => S.types[k]);
  if (!only.length) return items;
  const kept = items.filter(it => only.includes(it.type));
  return kept.length >= 3 ? kept : items;
}

async function beginRun(refresh) {
  if (busy) return;
  busy = true;
  const body = document.getElementById('drillBody');
  const idx = document.getElementById('drillIdx');
  const pause = document.getElementById('drillPause');
  stopTimer();
  run = null;
  if (pause) pause.hidden = true;
  if (idx) idx.textContent = '准备中';
  // 上一轮的知识点标签、难度、倒计时、进度条必须一起清掉，不然新题卡头还挂着旧信息
  const tag0 = document.getElementById('drillTag');
  if (tag0) { tag0.hidden = true; tag0.textContent = ''; }
  const lv0 = document.getElementById('drillLv');
  if (lv0) { lv0.hidden = true; lv0.textContent = ''; }
  const caps0 = document.querySelector('.drill-caps');
  if (caps0) caps0.hidden = true;
  const clock0 = document.getElementById('drillClock');
  if (clock0) { clock0.hidden = true; clock0.textContent = ''; clock0.classList.remove('urgent'); }
  const bar0 = document.getElementById('drillBar');
  if (bar0) { bar0.hidden = true; bar0.classList.remove('urgent'); }
  const fill0 = document.getElementById('drillBarFill');
  if (fill0) fill0.style.width = '0%';
  setSlim(true);
  if (body) body.innerHTML = skeletonHtml();
  startTips();
  try {
    let d = await fetchQuestions(refresh);
    const items = filterTypes(d.items || []);
    const seen = new Set(items.map(x => String(x.q || '').trim().slice(0, 90)));
    // 服务端一次只出一批，要 10 道只给 6 道；不够就再要一轮，凑够再开刷
    let rounds = 0;
    while (items.length < S.count && rounds++ < 2 && !(d && d.full)) {
      let more = null;
      try { more = await fetchQuestions(false); } catch (_) { break; }
      const got = filterTypes((more && more.items) || []);
      let added = 0;
      got.forEach(it => {
        const k = String(it.q || '').trim().slice(0, 90);
        if (!k || seen.has(k)) return;
        seen.add(k); items.push(it); added += 1;
      });
      d = more || d;
      if (!added) break;
    }
    if (!items.length) throw new Error('这组题没出出来');
    items.length = Math.min(items.length, S.count);
    startRun(items, { subject: d.subject, grade: d.grade, level: d.level, chapter: d.chapter || selText(S.chapter), section: d.section || selText(S.section) });
    if (!d.full) fillBank();
  } catch (e) {
    if (body) {
      body.innerHTML = `
        <div class="drill-error">
          <b>这次没出成</b>
          <em>${esc(e && e.message ? e.message : '网络不太顺')}</em>
          <button type="button" class="drill-primary" id="drillRetry">重试</button>
        </div>`;
      const r = document.getElementById('drillRetry');
      if (r) r.addEventListener('click', () => beginRun(true));
    }
    if (idx) idx.textContent = '出题失败';
  } finally {
    stopTips();
    busy = false;
  }
}

function stopTimer() {
  if (run && run.timer) { clearInterval(run.timer); run.timer = null; }
}

function paintClock() {
  const clock = document.getElementById('drillClock');
  const bar = document.getElementById('drillBar');
  const fill = document.getElementById('drillBarFill');
  if (!run) return;
  if (!S.secs) {
    if (clock) clock.hidden = true;
    if (bar) bar.hidden = true;
    return;
  }
  if (clock) {
    clock.hidden = false;
    clock.textContent = String(Math.max(0, Math.ceil(run.left)));
    clock.classList.toggle('urgent', run.left <= 8);
  }
  if (bar && fill) {
    bar.hidden = false;
    fill.style.width = `${Math.max(0, (run.left / S.secs) * 100).toFixed(1)}%`;
    bar.classList.toggle('urgent', run.left <= 8);
  }
}

function tick() {
  if (!run || run.paused) return;
  const card = document.getElementById('drillCard');
  if (!card) { stopTimer(); return; }
  run.left -= 0.1;
  paintClock();
  if (run.left <= 0) {
    stopTimer();
    if (!run.locked) answerTimeout();
  }
}

function startTimer() {
  stopTimer();
  if (!run) return;
  if (!S.secs) { run.left = 0; paintClock(); return; }
  const keep = Number(run.keepLeft);
  run.keepLeft = 0;
  run.left = keep > 0.3 ? Math.min(keep, S.secs) : S.secs;
  paintClock();
  run.timer = setInterval(tick, 100);
}

/* ---------- 渲染题目 ---------- */
function figHtml(it) {
  return it && it.fig ? '<div class="drill-fig" id="drillFig"></div>' : '';
}

function mountFig(it) {
  if (!it || !it.fig) return;
  const host = document.getElementById('drillFig');
  if (!host) return;
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 230');
    svg.setAttribute('class', 'drill-fig-svg');
    host.appendChild(svg);
    if (it.fig && it.fig.kind === 'chem') renderChem(svg, 360, 230, { ...it.fig, type: 'chem' });
    else renderPhysics(svg, 360, 230, { ...it.fig, type: 'physics' });
  } catch (_) { host.remove(); }
}

function paintQuestion() {
  const it = run.items[run.i];
  const body = document.getElementById('drillBody');
  const idx = document.getElementById('drillIdx');
  const tag = document.getElementById('drillTag');
  const pause = document.getElementById('drillPause');
  if (!body || !it) return;
  run.locked = false;
  run.paused = false;
  run.detailOpen = false;
  run.leftAt = Date.now();
  setSlim(false);
  body.classList.remove('answered');
  const clock0 = document.getElementById('drillClock');
  if (clock0) { clock0.hidden = true; clock0.textContent = ''; }
  const bar0 = document.getElementById('drillBar');
  if (bar0) { bar0.hidden = true; bar0.classList.remove('urgent'); }
  const fill0 = document.getElementById('drillBarFill');
  if (fill0) fill0.style.width = '0%';
  if (pause) pause.hidden = false;
  if (idx) idx.textContent = `第 ${run.i + 1} / ${run.items.length} 题`;
  if (tag) { tag.hidden = !it.tag; tag.textContent = it.tag || ''; }
  const lv = document.getElementById('drillLv');
  if (lv) { lv.hidden = false; lv.textContent = levelName(run.level); }
  const caps = document.querySelector('.drill-caps');
  if (caps) caps.hidden = false;

  let answerArea = '';
  if (it.type === 'choice') {
    answerArea = `<div class="drill-opts">${it.options.map((o, k) => `
      <button type="button" class="drill-opt" data-pick="${k}"><span class="drill-key">${String.fromCharCode(65 + k)}</span><span class="drill-opt-txt">${renderOpt(o)}</span></button>`).join('')}</div>`;
  } else if (isMulti(it)) {
    const mhint = it.type === 'indef' ? '<p class="drill-mhint">不定项：正确项 1–3 个，可能只有一项对</p>' : '';
    answerArea = `${mhint}<div class="drill-opts multi">${it.options.map((o, k) => `
      <button type="button" class="drill-opt" data-multi="${k}"><span class="drill-key">${String.fromCharCode(65 + k)}</span><span class="drill-opt-txt">${renderOpt(o)}</span></button>`).join('')}</div>
      <div class="drill-multi-bar"><button type="button" class="drill-primary" id="drillSubmit" disabled>${it.type === 'indef' ? '提交答案' : '提交多选'}</button></div>`;
  } else if (it.type === 'judge') {
    answerArea = `<div class="drill-opts judge">
      <button type="button" class="drill-opt" data-pick="1"><span class="drill-key">√</span><span class="drill-opt-txt">正确</span></button>
      <button type="button" class="drill-opt" data-pick="0"><span class="drill-key">×</span><span class="drill-opt-txt">错误</span></button>
    </div>`;
  } else if (blankRuns(it.q) >= 2) {
    answerArea = `<div class="drill-fill multi-blank">
      <button type="button" class="drill-primary" id="drillSubmit">提交</button>
    </div>`;
  } else {
    answerArea = `<div class="drill-fill">
      <input id="drillInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="填答案，回车提交" enterkeyhint="done">
      <button type="button" class="drill-primary" id="drillSubmit">提交</button>
    </div>`;
  }

  const extra = `<div class="drill-extra">
    <button type="button" class="drill-extra-btn" data-extra="dontknow">不会</button>
    <button type="button" class="drill-extra-btn" data-extra="unlearned">未学</button>
  </div>`;

  body.classList.remove('q-in');
  // 数学/物理/化学的正文片段要走数理字体（衬线），语文英语保持正文字体
  body.classList.toggle('mathy', ['math', 'physics', 'chemistry'].indexOf(S.subject) >= 0);
  body.innerHTML = `
    <div class="drill-q">${it.type === 'fill' && blankRuns(it.q) >= 2 ? fillStemHtml(it.q) : renderQ(it.q)}</div>
    ${figHtml(it)}
    ${answerArea}
    ${extra}
    <div class="drill-why" id="drillWhy" hidden></div>
    <div class="drill-foot" id="drillFoot" hidden>
      <button type="button" class="drill-prev" id="drillPrev" hidden>上一题</button>
      <button type="button" class="drill-next" id="drillNext">下一题</button>
    </div>`;

  mountFig(it);
  void body.offsetWidth;
  body.classList.add('q-in');

  // 第 2 题起就把「上一题」摆出来，以前要答完才出现，等于没有
  const foot0 = document.getElementById('drillFoot');
  if (foot0 && run.i > 0) {
    foot0.hidden = false;
    const prev0 = document.getElementById('drillPrev');
    if (prev0) prev0.hidden = false;
  }

  if (isMulti(it)) {
    const chosen = new Set();
    const submit = document.getElementById('drillSubmit');
    body.querySelectorAll('[data-multi]').forEach(b => {
      b.addEventListener('click', () => {
        if (run.locked) return;
        const k = Number(b.dataset.multi);
        if (chosen.has(k)) { chosen.delete(k); b.classList.remove('on'); }
        else { chosen.add(k); b.classList.add('on'); }
        try { haptic(8); } catch (_) {}
        if (submit) submit.disabled = chosen.size < 1;
      });
    });
    if (submit) submit.addEventListener('click', () => {
      if (run.locked) return;
      judgeAnswer([...chosen].sort((a, b) => a - b), null);
    });
  } else if (it.type === 'choice' || it.type === 'judge') {
    body.querySelectorAll('[data-pick]').forEach(b => {
      b.addEventListener('click', () => {
        if (run.locked) return;
        const val = it.type === 'judge' ? b.dataset.pick === '1' : Number(b.dataset.pick);
        judgeAnswer(val, b);
      });
    });
  } else if (blankRuns(it.q) >= 2) {
    const boxes = [...body.querySelectorAll('.qblank')];
    const submit = document.getElementById('drillSubmit');
    const go = () => {
      if (run.locked) return;
      judgeAnswer(boxes.map(b => String(b.value || '')), null);
    };
    if (submit) submit.addEventListener('click', go);
    boxes.forEach((b, k) => {
      b.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const nx = boxes[k + 1];
        if (nx) { try { nx.focus({ preventScroll: true }); } catch (_) { nx.focus(); } }
        else go();
      });
    });
    const firstB = boxes[0];
    if (firstB) setTimeout(() => { try { firstB.focus({ preventScroll: true }); } catch (_) {} }, 80);
  } else {
    const input = document.getElementById('drillInput');
    const submit = document.getElementById('drillSubmit');
    const go = () => {
      if (run.locked) return;
      judgeAnswer(String((input && input.value) || ''), null);
    };
    if (submit) submit.addEventListener('click', go);
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); go(); }
      });
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (_) {} }, 60);
    }
  }
  startTimer();
}

function fmtCorrect(it) {
  if (isMulti(it)) return it.answer.map(k => `${String.fromCharCode(65 + k)}. ${it.options[k]}`).join('；');
  if (it.type === 'choice') return `${String.fromCharCode(65 + it.answer)}. ${it.options[it.answer]}`;
  if (it.type === 'judge') return it.answer ? '正确' : '错误';
  return it.answer.join(' / ');
}

function fmtMine(it, val, expired) {
  if (expired) return '（超时）';
  if (it.type === 'fill') {
    if (Array.isArray(val)) {
      const t = val.map(x => String(x || '').trim()).join(' / ');
      return t || '（没填）';
    }
    return String(val || '（没填）');
  }
  if (it.type === 'judge') return val ? '正确' : '错误';
  if (isMulti(it)) {
    const arr = Array.isArray(val) ? val : [];
    if (!arr.length) return '（没选）';
    return arr.map(k => `${String.fromCharCode(65 + k)}. ${it.options[k] || ''}`).join('；');
  }
  return `${String.fromCharCode(65 + Number(val))}. ${it.options[Number(val)] || ''}`;
}

function normFill(v) {
  return String(v || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .replace(/[。．.,，;；!！?？'"“”‘’]/g, '')
    .toLowerCase();
}

function isRight(it, val, expired) {
  if (expired) return false;
  if (it.type === 'choice') return Number(val) === it.answer;
  if (it.type === 'judge') return Boolean(val) === Boolean(it.answer);
  if (isMulti(it)) {
    const arr = [...new Set((Array.isArray(val) ? val : []).map(Number))].sort((a, b) => a - b);
    return arr.length === it.answer.length && arr.every((v, k) => v === it.answer[k]);
  }
  if (Array.isArray(val)) {
    const got = val.map(normFill);
    return it.answer.some(a => {
      const need = splitFillAnswer(a);
      if (need.length === got.length) return need.every((x, k) => x === got[k]);
      // 答案没按空拆开时，退化成整串比较
      return normFill(need.join('')) === normFill(got.join(''));
    });
  }
  return it.answer.some(a => normFill(a) === normFill(val));
}

// 把「已作答」的视觉状态画出来（judgeAnswer 与返回恢复共用）
function paintAnswered(it, val, expired, ok, skipped) {
  const body = document.getElementById('drillBody');
  const why = document.getElementById('drillWhy');
  const foot = document.getElementById('drillFoot');
  if (!body) return;
  body.classList.add('answered');

  if (isMulti(it)) {
    const picked = new Set(Array.isArray(val) ? val.map(Number) : []);
    const right = new Set(it.answer);
    body.querySelectorAll('[data-multi]').forEach(b => {
      const k = Number(b.dataset.multi);
      b.classList.remove('on');
      if (right.has(k)) b.classList.add('right');
      else if (picked.has(k)) b.classList.add('wrong');
      b.disabled = true;
    });
  } else if (it.type === 'choice' || it.type === 'judge') {
    body.querySelectorAll('[data-pick]').forEach(b => {
      const v = it.type === 'judge' ? b.dataset.pick === '1' : Number(b.dataset.pick);
      const right = it.type === 'judge' ? v === it.answer : v === it.answer;
      const chosen = !skipped && val != null && v === (it.type === 'judge' ? Boolean(val) : Number(val));
      b.classList.remove('on');
      if (right) b.classList.add('right');
      else if (chosen) b.classList.add('wrong');
      b.disabled = true;
    });
  } else {
    const input = document.getElementById('drillInput');
    if (input) {
      input.disabled = true;
      if (!skipped) input.classList.add(ok ? 'right' : 'wrong');
    }
    const boxes = [...body.querySelectorAll('.qblank')];
    if (boxes.length) {
      const vals = Array.isArray(val) ? val : [];
      boxes.forEach((b, k) => {
        const want = vals[k] == null ? '' : String(vals[k]);
        const got = String(b.value || '');
        if (got || want) b.value = got || want;
        b.disabled = true;
        if (!skipped) b.classList.add(ok ? 'right' : 'wrong');
      });
    }
    const submit = document.getElementById('drillSubmit');
    if (submit) submit.disabled = true;
  }

  body.querySelectorAll('.drill-extra-btn').forEach(b => { b.disabled = true; });

  if (why) {
    const cls = skipped === 'unlearned' ? 'skip' : (ok ? 'ok' : 'no');
    const head = skipped === 'unlearned'
      ? `已记下「未学」 · 正确答案：${rich(fmtCorrect(it), true)}`
      : skipped === 'dontknow'
        ? `不会没关系 · 正确答案：${rich(fmtCorrect(it), true)}`
        : (ok ? '答对了' : `${expired ? '超时' : '答错'}，正确答案：${rich(fmtCorrect(it), true)}`);
    why.hidden = false;
    why.innerHTML = `
      <div class="drill-judge ${cls}">${head}</div>
      ${it.why ? `<div class="drill-exp"><span class="drill-exp-k">解析</span><p>${rich(it.why)}</p></div>` : ''}
      ${it.tip ? `<div class="drill-tip2"><span class="drill-exp-k">易错</span>${rich(it.tip, true)}</div>` : ''}
      <button type="button" class="drill-detail" id="drillDetail">详解 · 让 AI 拆开讲</button>
      <div class="drill-links">
        <button type="button" class="drill-link" id="drillGoStudy">去学习这一章</button>
        <button type="button" class="drill-link" id="drillAddMistake">加入错题本</button>
      </div>`;
  }
  if (foot) {
    foot.hidden = false;
    const next = document.getElementById('drillNext');
    if (next) next.textContent = run.i + 1 >= run.items.length ? '看结果' : '下一题';
    const prev = document.getElementById('drillPrev');
    if (prev) prev.hidden = run.i === 0;
  }
  setTimeout(() => {
    const next = document.getElementById('drillNext');
    if (next && next.scrollIntoView) {
      try { next.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
    }
  }, 90);
}

function judgeAnswer(val, btn, expired = false, skipped = '') {
  const it = run && run.items[run.i];
  if (!it || run.locked) return;
  run.locked = true;
  stopTimer();

  const ok = skipped ? false : isRight(it, val, expired);
  if (ok) {
    run.right += 1;
    try { haptic(12); } catch (_) {}
    try { creditsAdd(30, '答对一题'); } catch (_) {}
  } else if (skipped === 'unlearned') {
    run.unlearned.push({ q: it.q, tag: it.tag || '', right: fmtCorrect(it), why: it.why || '', type: it.type });
    try { haptic(6); } catch (_) {}
  } else {
    run.wrong.push({
      q: it.q, tag: it.tag || '',
      mine: skipped === 'dontknow' ? '不会' : fmtMine(it, val, expired),
      right: fmtCorrect(it), why: it.why || '', tip: it.tip || '', type: it.type,
    });
    try { haptic(45); } catch (_) {}
  }

  run.notes[run.i] = { val: skipped ? null : val, expired, ok, skipped };
  paintAnswered(it, val, expired, ok, skipped);
  saveRunState();
  // 以前这里 0.9 秒自动跳、答错挂 100 秒定时器，解析看不完，还会在换题后突然帮你翻页
  // 现在一律手点「下一题」
}

function answerTimeout() {
  const it = run && run.items[run.i];
  if (!it || run.locked) return;
  judgeAnswer(null, null, true);
}

function gotoQuestion(k) {
  if (!run || k < 0 || k >= run.items.length) return;
  run.i = k;
  saveRunState();
  if (run.notes[run.i]) { restoreQuestion(); return; }
  paintQuestion();
}

function closeDetailIfOpen() {
  const panel = document.getElementById('drillDetailPanel');
  if (panel && !panel.hidden) closeDetail();
}

function nextQuestion() {
  if (!run) return;
  closeDetailIfOpen();
  if (run.i + 1 >= run.items.length) { showResult(); return; }
  gotoQuestion(run.i + 1);
}

function prevQuestion() {
  if (!run || run.i <= 0) return;
  gotoQuestion(run.i - 1);
}

/* ---------- 结算 ---------- */
function showResult() {
  stopTimer();
  run.done = true;
  clearRunState();
  const total = run.items.length;
  const right = run.right;
  const un = run.unlearned.length;
  const denom = Math.max(1, total - un);
  const rate = Math.round((right / denom) * 100);
  const used = Math.round((Date.now() - run.startedAt) / 1000);
  const body = document.getElementById('drillBody');
  const idx = document.getElementById('drillIdx');
  const tag = document.getElementById('drillTag');
  const clock = document.getElementById('drillClock');
  const bar = document.getElementById('drillBar');
  const pause = document.getElementById('drillPause');
  if (idx) idx.textContent = '本组完成';
  if (tag) tag.hidden = true;
  const lvCap = document.getElementById('drillLv');
  if (lvCap) lvCap.hidden = true;
  const capsEl = document.querySelector('.drill-caps');
  if (capsEl) capsEl.hidden = true;
  if (clock) clock.hidden = true;
  if (bar) bar.hidden = true;
  if (pause) pause.hidden = true;

  const wrongHtml = run.wrong.length
    ? `<div class="drill-wrongs">${run.wrong.map(w => `
        <div class="drill-wrong">
          <div class="drill-wrong-q">${renderQ(w.q)}</div>
          <div class="drill-wrong-row"><span class="k">你答</span><span class="v bad">${rich(w.mine)}</span></div>
          <div class="drill-wrong-row"><span class="k">正确</span><span class="v">${renderOpt(w.right)}</span></div>
          ${w.why ? `<div class="drill-wrong-why">${rich(w.why)}</div>` : ''}
          ${w.tip ? `<div class="drill-wrong-tip">易错：${rich(w.tip, true)}</div>` : ''}
        </div>`).join('')}</div>`
    : '<p class="drill-empty">没有错题，这组很稳。</p>';

  const unHtml = un
    ? `<div class="drill-unlearned"><b>未学 ${un} 道</b><em>这些是后面课程才讲到的点，先记下，等老师讲的时候留意一下。</em>
        <div class="drill-chips">${run.unlearned.map(u => `<span>${esc(u.tag || String(u.q).slice(0, 10))}</span>`).join('')}</div></div>`
    : '';

  if (body) {
    body.innerHTML = `
      <div class="drill-score">
        <b>${rate}<em>%</em></b>
        <span>${right} / ${denom} 对${un ? ` · 未学 ${un} 道不计分` : ''}</span>
      </div>
      <div class="drill-meta">用时 ${Math.floor(used / 60)} 分 ${used % 60} 秒</div>
      ${unHtml}
      <div class="drill-result-h">错题 ${run.wrong.length} 道</div>
      ${wrongHtml}
      <div class="drill-result-btns">
        <button type="button" class="drill-primary" id="drillAgain">再来一组</button>
        <button type="button" class="drill-ghost" id="drillNewScope">换范围</button>
        ${run.wrong.length ? '<button type="button" class="drill-ghost" id="drillSaveWrong">存错题本</button>' : ''}
      </div>`;
  }
  saveSession(right, denom, used);
}

async function saveMistakes() {
  if (!run || !run.wrong.length) return;
  const items = run.wrong.slice(0, 10).map(w => ({
    kind: 'mistake',
    title: String(w.tag || '刷题错题').slice(0, 40),
    content: `${w.q}\n\n我答：${w.mine}\n正确答案：${w.right}`,
    note: w.why || '',
  }));
  try {
    await fetch('/api/study/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, items }),
    });
    const b = document.getElementById('drillSaveWrong');
    if (b) { b.textContent = '已存好'; b.disabled = true; }
  } catch (_) {}
}

function saveSession(right, total, used) {
  const sj = subjOf(run.subject).name;
  fetch('/api/study/session/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: state.uid, id: `sd_${Date.now().toString(36)}`, mode: 'drill',
      title: `${run.grade}${sj} · ${right}/${total} · ${Math.floor(used / 60)}分${used % 60}秒`,
      messages: [],
    }),
  }).catch(() => {});
}

/* ---------- 详解：卡片里展开，换老师不换页，收起就回到刚才那道题 ---------- */
const D_TEACHERS = [
  { id: 'lin', name: '林老师', emoji: '🌿', role: '老师', style: '温柔耐心，先接住情绪再讲清道理，多用生活化的比喻', pace: '慢一点，一步一步来，讲完确认听懂' },
  { id: 'zhang', name: '张老师', emoji: '📐', role: '老师', style: '严厉提分型，直接点出易错点和得分点，不绕弯', pace: '快，先给结论再补推导' },
  { id: 'zhe', name: '阿哲', emoji: '🎧', role: '老师', style: '幽默段子手，用段子和例子把抽象概念讲活', pace: '中速，讲一段插一句玩笑' },
  { id: 'su', name: '苏博', emoji: '🧪', role: '老师', style: '学术极客，追根究底讲原理和来龙去脉', pace: '中速，偏爱严谨推导' },
];
const D_T_KEY = 'minxtok.drill.teacher.v1';
let dTeacherId = (() => { try { return localStorage.getItem(D_T_KEY) || 'lin'; } catch (_) { return 'lin'; } })();
function dTeacherOf(id) { return D_TEACHERS.find(t => t.id === id) || D_TEACHERS[0]; }

let dCtrl = null;
function stopDetail() { if (dCtrl) { try { dCtrl.abort(); } catch (_) {} dCtrl = null; } }

function detailPrompt(it) {
  const lines = [it.q];
  if (it.type === 'choice' || isMulti(it)) it.options.forEach((o, k) => lines.push(`${String.fromCharCode(65 + k)}. ${o}`));
  lines.push(`正确答案：${fmtCorrect(it)}`);
  if (it.why) lines.push(`题库解析：${it.why}`);
  lines.push('请把这道题拆开讲：先点出考的是哪个知识点，再一步一步讲为什么这么做，最后给一个同类小例子。长度控制在一屏能读完。');
  return lines.join('\n');
}

async function streamDetail(it) {
  const host = document.getElementById('ddpBody');
  if (!host || !run) return;
  stopDetail();
  const t = dTeacherOf(dTeacherId);
  host.innerHTML = '<div class="ddp-wait"><span class="drill-spinner"></span><em>老师在看题…</em></div>';
  const ctrl = new AbortController();
  dCtrl = ctrl;
  let text = '';
  try {
    const res = await fetch('/api/course/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: state.uid,
        stage: stageOf(S.stage).name, grade: run.grade, subject: subjOf(run.subject).name,
        book: selText(S.book), chapter: selText(S.chapter) || '这道题', section: selText(S.section),
        teacher: { name: t.name, role: t.role, style: t.style, pace: t.pace, call: '你' },
        action: 'ask', text: detailPrompt(it), history: [],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error('no_stream');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split('\n\n');
      buf = blocks.pop() || '';
      for (const b of blocks) {
        for (const line of b.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const j = JSON.parse(raw);
            const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (d) { text += d; host.innerHTML = richMd(text); }
          } catch (_) {}
        }
      }
    }
    if (!text) host.innerHTML = '<p class="ddp-fail">老师这题没讲出来，换一位再试。</p>';
  } catch (_) {
    if (!text) host.innerHTML = '<p class="ddp-fail">详解没连上，再点一次。</p>';
  }
}

function openDetail(it) {
  const panel = document.getElementById('drillDetailPanel');
  if (!panel || !run) return;
  stopTimer();
  run.keepLeft = run.left;
  run.paused = true;
  run.detailOpen = true;
  saveRunState();
  panel.hidden = false;
  panel.innerHTML = `
    <div class="ddp-head">
      <b>老师详解</b>
      <button type="button" class="ddp-x" data-ddp-close="1">收起</button>
    </div>
    <div class="ddp-teachers">${D_TEACHERS.map(t => `<button type="button" class="ddp-t${t.id === dTeacherId ? ' on' : ''}" data-ddp-t="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join('')}</div>
    <div class="ddp-body" id="ddpBody"></div>
    <div class="ddp-foot"><button type="button" class="ddp-go" data-ddp-chat="1">进入对话，接着问老师</button></div>`;
  streamDetail(it);
  try { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
}

function closeDetail() {
  stopDetail();
  const panel = document.getElementById('drillDetailPanel');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  if (!run) return;
  run.detailOpen = false;
  if (!run.locked) { run.paused = false; startTimer(); }
}

// 详解 → 课程对话：把这道题原样带过去，老师接着讲，能一直追问
function goChatFromDetail() {
  const it = run && run.items[run.i];
  if (!it) return;
  const subject = D_SUBJ_ZH[run.subject] || '';
  const stage = stageOfGrade(run.grade);
  const text = `这道题我还想再问：${it.q || ''}${it.why ? `\n（参考解析：${it.why}）` : ''}`.slice(0, 1200);
  const base = { stage: stage || undefined, grade: run.grade, subject: subject || undefined };
  let g = null;
  try { g = guessChapter(`${it.q || ''} ${it.why || ''} ${it.tag || ''}`, { stage, subject, grade: run.grade }) || guessChapter(`${it.q || ''}`, { subject }); } catch (_) {}
  try { haptic(10); } catch (_) {}
  closeDetail();
  if (g && g.chapter) {
    openCourseAt(Object.assign({}, base, {
      stage: g.stage, grade: g.grade || run.grade, subject: g.subject, book: g.book,
      chapter: g.chapter, action: 'ask', ask: text,
    }));
  } else {
    openCourseAt(Object.assign({}, base, { action: 'ask', ask: text }));
  }
}

function bindDetail() {
  const panel = document.getElementById('drillDetailPanel');
  if (!panel || panel.dataset.bind === '1') return;
  panel.dataset.bind = '1';
  panel.addEventListener('click', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-ddp-close]')) { closeDetail(); return; }
    if (t.closest('[data-ddp-chat]')) { goChatFromDetail(); return; }
    const tb = t.closest('[data-ddp-t]');
    if (tb) {
      dTeacherId = tb.getAttribute('data-ddp-t');
      try { localStorage.setItem(D_T_KEY, dTeacherId); } catch (_) {}
      panel.querySelectorAll('[data-ddp-t]').forEach(b => b.classList.toggle('on', b.getAttribute('data-ddp-t') === dTeacherId));
      const it = run && run.items[run.i];
      if (it) streamDetail(it);
    }
  });
}

/* ---------- 引导页 ⇄ 答题卡 ---------- */
function paintScopeBar() {
  const el = document.getElementById('dsbText');
  if (!el) return;
  el.textContent = scopeText(S.stage, S.grade, S.subject, S.book, S.chapter, S.section);
}

function enterRun() {
  const pb = document.getElementById('pageBody');
  if (pb) { pb.classList.remove('mode-pick'); pb.classList.add('mode-run'); }
  const card = document.getElementById('drillCard');
  if (card) card.hidden = false;
  const bar = document.getElementById('drillScopeBar');
  if (bar) bar.hidden = false;
  paintScopeBar();
}

function backToPick() {
  stopTimer();
  stopTips();
  closePauseSheet();
  abortReq();
  run = null;
  clearRunState();
  const pb = document.getElementById('pageBody');
  if (pb) { pb.classList.remove('mode-run'); pb.classList.add('mode-pick'); }
  const card = document.getElementById('drillCard');
  if (card) card.hidden = true;
  const bar = document.getElementById('drillScopeBar');
  if (bar) bar.hidden = true;
  const panel = document.getElementById('drillDetailPanel');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  const body = document.getElementById('drillBody');
  if (body) body.innerHTML = '';
  const idx0 = document.getElementById('drillIdx');
  if (idx0) idx0.textContent = '待开始';
  const tag0 = document.getElementById('drillTag');
  if (tag0) { tag0.hidden = true; tag0.textContent = ''; }
  const lv0 = document.getElementById('drillLv');
  if (lv0) { lv0.hidden = true; lv0.textContent = ''; }
  const caps0 = document.querySelector('.drill-caps');
  if (caps0) caps0.hidden = true;
  const clock0 = document.getElementById('drillClock');
  if (clock0) { clock0.hidden = true; clock0.textContent = ''; }
  const bar0 = document.getElementById('drillBar');
  if (bar0) bar0.hidden = true;
  const hint0 = document.getElementById('drillHint');
  if (hint0) hint0.textContent = '';
  wizIdx = 0;
  paintWiz();
}

// 选完范围点「出题」：引导页先模糊淡出，再换成答题卡，别硬切
async function startFlow() {
  if (busy) return;
  const pick = document.getElementById('drillPick');
  if (pick) pick.classList.add('pick-out');
  await new Promise(r => setTimeout(r, 190));
  enterRun();
  beginRun(false);
}

/* ---------- 恢复已答状态 ---------- */
function restoreQuestion() {
  if (!run) return;
  const it = run.items[run.i];
  const n = run.notes[run.i];
  paintQuestion();
  if (n) {
    paintAnswered(it, n.val, n.expired, n.ok, n.skipped || '');
    run.locked = true;
    stopTimer();
  }
}

/* ---------- 绑定 ---------- */
const D_SUBJ_ZH = {
  chinese: '语文', math: '数学', english: '英语', politics: '政治', history: '历史',
  geography: '地理', physics: '物理', chemistry: '化学', biology: '生物',
};

// 刷题 → 课程：按题干和解析猜章节，猜不到就让用户自己选，别硬跳错地方
function goStudyFromDrill() {
  const it = run && run.items[run.i];
  if (!it) return;
  const subject = D_SUBJ_ZH[run.subject] || '';
  const stage = stageOfGrade(run.grade);
  const text = `${it.q || ''} ${it.why || ''} ${it.tag || ''}`;
  let g = null;
  try { g = guessChapter(text, { stage, subject, grade: run.grade }) || guessChapter(text, { subject }); } catch (_) {}
  try { haptic(8); } catch (_) {}
  if (g && g.chapter) {
    openCourseAt({ stage: g.stage, grade: g.grade || run.grade, subject: g.subject, book: g.book, chapter: g.chapter, action: 'start' });
  } else {
    openCourseAt({ stage: stage || undefined, grade: run.grade, subject: subject || undefined });
  }
}

// 刷题 → 错题本：存成 study_items(kind=mistake)，回去就能在错题本里看到
async function addMistakeFromDrill(btn) {
  const it = run && run.items[run.i];
  if (!it || !btn) return;
  btn.disabled = true;
  const title = String(it.q || '错题').slice(0, 120);
  const content = [
    `错题：${it.q || ''}`,
    `正确答案：${fmtCorrect(it)}`,
    it.why ? `解析：${it.why}` : '',
  ].filter(Boolean).join('\n');
  try {
    const r = await fetch('/api/study/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, kind: 'mistake', title, content: content.slice(0, 8000), note: '' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error('save_failed');
    btn.textContent = '已加入错题本';
    try { haptic(12); } catch (_) {}
    toast('已加入错题本，学习中心 · 错题本可以看');
  } catch (_) {
    btn.disabled = false;
    toast('没存上，再点一次');
  }
}

function bindStatic() {
  const card = document.getElementById('drillCard');
  if (card) {
    card.addEventListener('click', async e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#drillNext')) { nextQuestion(); return; }
      if (t.closest('#drillPrev')) { prevQuestion(); return; }
      if (t.closest('#drillPause')) { pauseRun(); return; }
      if (t.closest('#drillAgain')) { beginRun(false); return; }
      if (t.closest('#drillNewScope')) { backToPick(); return; }
      if (t.closest('#drillSaveWrong')) { saveMistakes(); return; }
      const extra = t.closest('[data-extra]');
      if (extra) {
        if (!run || run.locked) return;
        judgeAnswer(null, null, false, extra.dataset.extra);
        return;
      }
      if (t.closest('#drillDetail')) {
        const it = run && run.items[run.i];
        if (it) openDetail(it);
      }
      if (t.closest('#drillGoStudy')) { goStudyFromDrill(); return; }
      if (t.closest('#drillAddMistake')) { addMistakeFromDrill(t.closest('#drillAddMistake')); return; }
    });
  }
  bindDetail();
}

function bindPicker() {
  const body = document.getElementById('pageBody');
  if (!body || body.dataset.picker === '1') return;
  body.dataset.picker = '1';
  body.addEventListener('click', e => {
    if (!body.classList.contains('drill-page')) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const tap = () => { try { haptic(6); } catch (_) {} };
    // 选中就地改高亮：只重画这两行的状态，不给整页重放入场动画
    const paintOn = el => {
      const host = document.getElementById('dwStep');
      if (!host) return;
      host.querySelectorAll('.dw-opt').forEach(x => x.classList.toggle('on', x === el));
    };
    const after = el => { saveSettings(); paintOn(el); };
    // 多选组：点完按数据重画这一步（不重播入场动画），状态绝不会残留
    const repaintStep = () => {
      const step = document.getElementById('dwStep');
      if (!step) return;
      const top = step.scrollTop;
      const st = wizSteps()[wizIdx];
      if (!st) return;
      step.innerHTML = st.body;
      step.scrollTop = top;
      fitList();
    };

    const back = t.closest('#dwBack');
    if (back) { tap(); if (wizIdx > 0) { wizIdx -= 1; wizRender(true); const st = wizSteps()[wizIdx]; if (st && st.id === 'section') loadSections(); } return; }
    if (t.closest('#dwNext')) {
      tap();
      const steps = wizSteps();
      if (wizIdx >= steps.length - 1) { startFlow(); return; }
      wizGo(1);
      return;
    }
    if (t.closest('[data-wresume]')) { tap(); resumeRun(); return; }
    if (t.closest('#drillResume')) { tap(); resumeRun(); return; }
    if (t.closest('#drillRestart')) { tap(); clearRunState(); backToPick(); return; }

    if (t.closest('[data-wstage]')) {
      tap();
      const k = t.closest('[data-wstage]').dataset.wstage;
      if (S.stage === k) { wizRender(false); return; }
      abortReq();
      S.stage = k;
      S.grade = stageOf(k).grades[0];
      S.book = ''; S.chapter = ''; S.section = ''; secPending = false;
      const subs = subjectsOf(k);
      if (!subs.some(x => x.key === S.subject)) S.subject = subs[0].key;
      after(t.closest('[data-wstage]'));
      return;
    }
    if (t.closest('[data-wexam]')) {
      tap();
      const k = t.closest('[data-wexam]').dataset.wexam;
      const st = STAGES.find(x => x.key === k);
      abortReq();
      S.stage = k;
      if (st) S.grade = st.grades[0];
      S.book = ''; S.chapter = ''; S.section = ''; secPending = false;
      const subs = subjectsOf(k);
      if (!subs.some(x => x.key === S.subject)) S.subject = subs[0].key;
      after(t.closest('[data-wexam]'));
      return;
    }
    if (t.closest('[data-wgrade]')) {
      tap();
      const g = t.closest('[data-wgrade]').dataset.wgrade;
      abortReq();
      S.stage = baseStage(S.stage);
      S.grade = g;
      S.book = ''; S.chapter = ''; S.section = ''; secPending = false;
      after(t.closest('[data-wgrade]'));
      return;
    }
    if (t.closest('[data-wsubject]')) {
      tap();
      const k = t.closest('[data-wsubject]').dataset.wsubject;
      if (S.subject !== k) {
        abortReq();
        S.subject = k;
        S.book = ''; S.chapter = ''; S.section = ''; secPending = false;
      }
      after(t.closest('[data-wsubject]'));
      return;
    }
    if (t.closest('[data-wbook]')) {
      tap();
      const el = t.closest('[data-wbook]');
      const v = el.dataset.wbook || '';
      const list = bookList();
      const i = list.indexOf(v);
      if (i < 0) list.push(v); else list.splice(i, 1);
      abortReq();
      S.book = joinSel(list);
      // 教材变动后，把不在新范围里的章节剔掉
      const units = cvUnits();
      S.chapter = joinSel(chapList().filter(x => units.includes(x)));
      if (!secTarget()) S.section = '';
      saveSettings();
      repaintStep();
      return;
    }
    if (t.closest('[data-wchap]')) {
      tap();
      const el = t.closest('[data-wchap]');
      const v = el.dataset.wchap || '';
      const before = secTarget();
      const list = chapList();
      const i = list.indexOf(v);
      if (i < 0) list.push(v); else list.splice(i, 1);
      abortReq();
      S.chapter = joinSel(list);
      const now = secTarget();
      if (!now || !before || now.chapter !== before.chapter || now.book !== before.book) {
        S.section = ''; secPending = false;
      }
      saveSettings();
      repaintStep();
      if (secTarget()) loadSections();
      return;
    }
    if (t.closest('[data-wsec]')) {
      tap();
      const el = t.closest('[data-wsec]');
      const v = el.dataset.wsec || '';
      const list = secList();
      const i = list.indexOf(v);
      if (i < 0) list.push(v); else list.splice(i, 1);
      S.section = joinSel(list);
      saveSettings();
      repaintStep();
      return;
    }
    if (t.closest('[data-wtype]')) {
      tap();
      const k = t.closest('[data-wtype]').dataset.wtype;
      const on = !S.types[k];
      const left = Object.keys(S.types).filter(x => S.types[x] && x !== k).length;
      if (!on && left === 0) { toast('至少留一个题型'); return; }
      S.types[k] = on;
      saveSettings();
      const el = t.closest('[data-wtype]');
      if (el) el.classList.toggle('on', on);
      return;
    }
    if (t.closest('[data-wlevel]')) {
      tap();
      S.level = t.closest('[data-wlevel]').dataset.wlevel;
      after(t.closest('[data-wlevel]'));
      return;
    }
    if (t.closest('[data-wcount]')) {
      tap();
      S.count = Number(t.closest('[data-wcount]').dataset.wcount);
      after(t.closest('[data-wcount]'));
      return;
    }
    if (t.closest('[data-wsecs]')) {
      tap();
      S.secs = Number(t.closest('[data-wsecs]').dataset.wsecs);
      after(t.closest('[data-wsecs]'));
      return;
    }
  });
}

// 换学段后重画选择条（学科数量会变）
function refill() { paintWiz(); }

function showIdle() { wizIdx = 0; paintWiz(); }

function setSlim(on) {
  const card = document.getElementById('drillCard');
  if (card) card.classList.toggle('slim', !!on);
}


/* ---------- 暂停 / 继续 ---------- */
function pauseRun() {
  if (!run || run.done || run.paused) return;
  stopTimer();
  run.keepLeft = run.left;
  run.paused = true;
  saveRunState();
  const body = document.getElementById('drillBody');
  const pause = document.getElementById('drillPause');
  const clock = document.getElementById('drillClock');
  const bar = document.getElementById('drillBar');
  if (pause) pause.hidden = true;
  if (clock) clock.hidden = true;
  if (bar) bar.hidden = true;
  const saved = loadRunState();
  if (body) {
    body.innerHTML = `
      <div class="drill-paused">
        <b>已暂停</b>
        <em>第 ${run.i + 1} / ${run.items.length} 题 · 已答对 ${run.right} 道</em>
        <div class="drill-resume-btns">
          <button type="button" class="drill-primary" id="drillResume">继续刷</button>
          <button type="button" class="drill-ghost" id="drillRestart">重新开始</button>
        </div>
      </div>`;
    if (saved) run.savedAt = saved.savedAt;
  }
}

function resumeRun() {
  if (!run) {
    const saved = loadRunState();
    if (!saved) { showIdle(); return; }
    adoptSaved(saved);
    S.subject = saved.subject || S.subject;
    S.grade = saved.grade || S.grade;
    S.level = saved.level || S.level;
    saveSettings();
  }
  enterRun();
  run.paused = false;
  if (run.notes[run.i]) { restoreQuestion(); return; }
  paintQuestion();
}

/* ---------- 入口 ---------- */
function renderDrillPage(animate) {
  const page = document.getElementById('page');
  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(exitDrill);
    setPageTitle('刷题');
    fillPage(pageHtml());
    if (animate) playPageSwitch('study', 'study', 1);
  } else {
    openPage('刷题', pageHtml(), exitDrill, 'study');
  }
  const bodyEl = document.getElementById('pageBody');
  if (bodyEl) {
    bodyEl.classList.remove('study-full', 'mode-run');
    bodyEl.classList.add('drill-page', 'mode-pick');
  }
  const card = document.getElementById('drillCard');
  if (card) card.hidden = true;
  const bar = document.getElementById('drillScopeBar');
  if (bar) bar.hidden = true;
  bindStatic();
  bindPicker();
  bindDetail();
}

let backToStudy = null;

export function openDrill(onBack) {
  stopTimer();
  backToStudy = () => {
    stopTimer();
    stopTips();
    closePauseSheet();
    const bodyEl = document.getElementById('pageBody');
    if (bodyEl) bodyEl.classList.remove('drill-page');
    if (typeof onBack === 'function') onBack();
  };
  S = loadSettings();
  wizIdx = 0;
  wizSeq += 1;
  run = null;
  renderDrillPage(true);
  // 上次存了进度就直接接着刷，不再走引导页
  const saved = loadRunState();
  if (saved) resumeRun();
}

// 退出刷题：跟游戏里一模一样的暂停弹窗（复用 .game-pause / .gp-card / .game-btn）
function openPauseSheet() {
  let mask = document.getElementById('drillPauseMask');
  if (!mask) {
    mask = document.createElement('div');
    mask.className = 'game-pause';
    mask.id = 'drillPauseMask';
    mask.hidden = true;
    mask.innerHTML = `<div class="gp-card">
        <div class="gp-title">已暂停</div>
        <div class="gp-sub">退出会存下进度，回来接着刷</div>
        <div class="gp-acts">
          <button class="game-btn" type="button" data-gp="resume">继续</button>
          <button class="game-btn" type="button" data-gp="again">重开一轮</button>
          <button class="game-btn" type="button" data-gp="quit">保存并退出</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    // 点卡片外的空白不收，跟游戏一致
    mask.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gp]');
      if (!b) return;
      const k = b.dataset.gp;
      closePauseSheet();
      if (k === 'resume') { resumeRun(); return; }
      if (k === 'again') { clearRunState(); backToPick(); return; }
      toast('进度已存');
      backToStudy();
    });
  }
  mask.hidden = false;
  mask.style.animation = '';
  void mask.offsetWidth;
  mask.style.animation = 'maskIn .18s ease-out both';
}

function closePauseSheet() {
  const m = document.getElementById('drillPauseMask');
  if (m) m.hidden = true;
}

function exitDrill() {
  if (!run || run.done) { backToStudy(); return; }
  const m = document.getElementById('drillPauseMask');
  if (m && !m.hidden) return;
  // 只存档不重画卡片：pauseRun() 会先把题目区换成暂停面板，弹窗淡入前会闪一下
  stopTimer();
  run.keepLeft = run.left;
  run.paused = true;
  saveRunState();
  openPauseSheet();
}
