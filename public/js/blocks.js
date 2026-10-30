// 前端块渲染器：只负责把数据画出来，点击一律按 action 分发
// 新卡片类型：在这里加一个 case + CSS 类，不改其它逻辑
import { t } from './i18n.js?v=118';
import { escapeHtml } from './ui.js?v=150';

// 线稿图标：统一 24 视框、圆头圆角，跟苹方笔画气质一致
const ICON = {
  article: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h9l4 4v14H6z"/><path d="M9 9h7M9 13h7M9 17h4"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6.5l10-2v11"></path><circle cx="6.5" cy="18" r="2.6"></circle><circle cx="16.5" cy="15.5" r="2.6"></circle></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2.4"></rect><path d="M7.6 9.2h6.2M7.6 12.4h8.8M7.6 15.6h5.2"></path></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.3-2.3a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2"></path><path d="M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.3 2.3a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2"></path></svg>',
};

let quoteHandler = null;
let deleteHandler = null;
export function setQuoteHandler(fn) { quoteHandler = fn; }
export function setDeleteHandler(fn) { deleteHandler = fn; }

function fmtTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}

function stripMusicMarks(t) {
  return String(t || '')
    .replace(/[\[【]\s*MUSIC\s*[\]】][^\n]*/gi, '')
    .replace(/[\[【]\s*MUSIC_LINK\s*[\]】][^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 已知命令 + 结构命令；只自动包裹这些，避免把 Windows 路径之类误当公式
const BARE_MATH_STRUCT = new Set(['frac', 'dfrac', 'tfrac', 'sqrt', 'text', 'textrm', 'textnormal',
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'operatorname', 'mbox', 'overline', 'underline',
  'vec', 'overrightarrow', 'overleftarrow', 'hat', 'widehat', 'tilde', 'widetilde', 'dot', 'ddot',
  'bar', 'binom', 'pmod', 'mathbb', 'begin', 'end', 'left', 'right', 'displaystyle', 'textstyle',
  'sum', 'prod', 'coprod', 'int', 'iint', 'iiint', 'oint', 'oiint', 'oiiint', 'lim', 'liminf', 'limsup',
  'scriptstyle', 'limits', 'nolimits', 'nonumber']);

// 裸 LaTeX：从 \command 起，吃到运算符链结束；遇到普通英文句子会在空格处停下
const BARE_LATEX_RE = /\\[A-Za-z]+(?:\s*(?:\{[^{}]*\}|\([^()\n]*\)|\[[^\[\]\n]*\])){0,2}(?:\s*[\^_]\s*(?:\{[^{}]*\}|[A-Za-z0-9]+)){0,2}(?:\s*[+\-*/=<>≤≥≠≈]\s*(?:\\[A-Za-z]+(?:\s*(?:\{[^{}]*\}|\([^()\n]*\)|\[[^\[\]\n]*\])){0,2}|\([^()\n]*\)|\d+(?:\.\d+)?|[A-Za-z]))*/g;

function looksLikeMath(body) {
  const s = String(body || '').trim();
  if (!s) return false;
  // 单个变量/数字也算公式，避免 $x$ 被当成普通文本把美元符号露出来。
  if (/^[A-Za-z]$/.test(s) || /^\d+(?:\.\d+)?$/.test(s)) return true;
  return /\\[A-Za-z]+|[\^_]\s*[{A-Za-z0-9]|[=<>≤≥≠≈∑∫√∞π%‰]|\d\s*[+\-*/]\s*\d/.test(s);
}

/* 正文里裸写的化学式/算式：只给这些片段套公式节点，中文和普通英文仍是正文字体。
   模型经常把 H₂O、2H₂O₂ → 2H₂O + O₂、2+2=4 直接夹在句子里，不会主动写 [[chem:]]/[[math:]]。 */
const CHEM_ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
const CHEM_SUB = '₀-₉';
const CHEM_SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const CHEM_UNIT = `[A-Z][a-z]?[${CHEM_SUB}0-9]*`;
const CHEM_GROUP = `\\(${CHEM_UNIT}(?:${CHEM_UNIT})*\\)[${CHEM_SUB}0-9]*`;
const CHEM_CHAIN = `(?:${CHEM_UNIT}|${CHEM_GROUP})+`;
const CHEM_TERM = `(?:[0-9${CHEM_SUB}]{0,3})?(?:${CHEM_CHAIN})(?:\\^?[0-9${CHEM_SUB}${CHEM_SUP}]*[+\\-−⁺⁻])?`;
// 每个物质后面可能直接跟 ↑/↓，必须留在同一个片段里，否则整条反应式会只包住前半段
const CHEM_TERM_G = `${CHEM_TERM}[↑↓]?`;
const CHEM_SIDE = `${CHEM_TERM_G}(?:\\s*\\+\\s*${CHEM_TERM_G})*`;
// 反应符号：模型会写 →、->、⇌、=，也会写“—加热→ / —MnO2→”这种箭头带条件的旧式写法
const CHEM_SIGN = `(?:[—–]\\s*[^→\\n]{0,16}?\\s*(?:→|->)|->|→|⇌|=)(?:\\s*\\[[^\\]\\n]*\\])?`;
const CHEM_EQ_INLINE_RE = new RegExp(
  `(^|[^A-Za-z0-9])(${CHEM_SIDE}\\s*${CHEM_SIGN}\\s*${CHEM_SIDE})(?![A-Za-z0-9])`,
  'g');
const CHEM_INLINE_RE = new RegExp(
  `(^|[^A-Za-z0-9])((?:[0-9${CHEM_SUB}]{0,3})?(?:${CHEM_CHAIN}|${CHEM_UNIT}[${CHEM_SUB}0-9]+)(?:\\^?[0-9${CHEM_SUB}${CHEM_SUP}]*[+\\-−⁺⁻])?)(?![A-Za-z0-9])`,
  'g');
// 单个元素符号：氮（N）、N 元素、C 在氧气里 —— 夹在中文中间的裸元素也得进公式字体。
// 只有在整段确实在讲化学（SCI_CUE）时才动手，不然英文里的 A、I 会被当成元素。
const CHEM_BARE_ELEM_RE = new RegExp(
  `([\\u4e00-\\u9fa5（(：:，、])\\s?([A-Z][a-z]?(?:[0-9${CHEM_SUB}]|\\^?[${CHEM_SUP}+\\-−]){0,3})(?=[\\u4e00-\\u9fa5）)，。、；;：:！？\\s]|$)`,
  'g');
// 运算符号集合：除了 ASCII，还要认「−」（U+2212 减号）、各种箭头、±、≡ 这些。
// 少一个符号就会让整段公式掉回正文黑体，看着就是“一半衬线一半没有”。
const MATH_SIGN = '\\+\\-−–—×÷*/=<>≤≥≠≈≡≅≔~±∓⋅·→←↑↓↔⇄⇋⇌⇒⇐⇔⟹⟺⟶⟵↦∴∵≪≫∝⊥∠∥∈∉∋∪∩⊂⊃⊆⊇∀∃∅∑∏∫∬∭∮∂∇∛∜,:';
// 希腊字母/无穷这类可以单独当一项：x→∞、πr²、Δx 不能因为右边不是数字就断掉
const MATH_SYM_ATOM = 'πθαβγδλμσφωΔΣΠΩ∞';
// 上标/下标字符：⁻ ⁺ 不在 CHEM_SUP 里，漏了它 x→0⁻ 的尾巴就掉出去
const MATH_UP = `${CHEM_SUP}⁺⁻`;
// 下标（a₁、Sₙ）：化学先走，这里只兜数学里的下标
const MATH_LOW = `${CHEM_SUB}₊₋ₙₓᵢ`;
const MATH_ATOM = `(?:(?:\\d+(?:\\.\\d+)?|[A-Za-z][${MATH_LOW}]*|[A-Z]{2,3}|[${MATH_SYM_ATOM}]|\\([^()\\n]*\\))[${MATH_UP}${MATH_LOW}]*)`;
// 链的右半边允许带正负号：x→+∞、a≤-b
const MATH_SATOM = `(?:[+\\-−]?\\s*${MATH_ATOM})`;
const MATH_INLINE_RE = new RegExp(
  `(^|[^A-Za-z0-9])(${MATH_ATOM}(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})+)(?![A-Za-z0-9])`,
  'g');
const MATH_IMPLICIT_RE = new RegExp(
  `(^|[^A-Za-z0-9])((?:\\d+(?:\\.\\d+)?[A-Za-z]|[A-Za-z]\\d+)[${MATH_UP}${MATH_LOW}]*(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})+)(?![A-Za-z0-9])`,
  'g');
const MATH_EQ_RE = new RegExp(
  `(^|[^A-Za-z0-9])([A-Za-z0-9.${MATH_UP}${MATH_LOW}${MATH_SIGN}()]+[=<>≤≥≠≈≡][A-Za-z0-9.${MATH_UP}${MATH_LOW}${MATH_SIGN}()]+)(?![A-Za-z0-9])`,
  'g');
const MATH_SUP_RE = new RegExp(`(^|[^A-Za-z0-9])([A-Za-z][${CHEM_SUP}]+)(?![A-Za-z0-9])`, 'g');
// 根号：连后面的运算链一起吃进来，避免 “√x − 1” 只剩半个式子进公式字体
const MATH_SQRT_RE = new RegExp(
  `(^|[^A-Za-z0-9])(√(?:[A-Za-z0-9.]+|\\([^()\\n]*\\))(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})*[${MATH_UP}]*)(?![A-Za-z0-9])`,
  'g');
// 单独一个希腊字母、πr²、Δx 这类
const MATH_GREEK_RE = new RegExp(
  `(^|[^A-Za-z0-9])([${MATH_SYM_ATOM}][A-Za-z0-9${MATH_UP}]*)(?![A-Za-z0-9])`,
  'g');
// 蕴含箭头带式子：⇒ x=1/2、→ x→0（化学式先处理过，不会抢走反应箭头）
const MATH_ARROW_LEAD_RE = new RegExp(
  `(^|[^A-Za-z0-9])([⇒⇐⇔⟹⟺⟶⟵↔↦→←]\\s*${MATH_ATOM}(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})*)(?![A-Za-z0-9])`,
  'g');
// 只有右半边或只有左半边的式子：=1、≥2、x=1+
const MATH_OP_LEAD_RE = new RegExp(
  `(^|[^A-Za-z0-9])?([=<>≤≥≠≈≡]\\s*${MATH_SATOM}(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})*)`,
  'g');
const MATH_OP_TAIL_RE = new RegExp(
  `(^|[^A-Za-z0-9])(${MATH_ATOM}(?:\\s*[${MATH_SIGN}]\\s*${MATH_SATOM})*\\s*[=<>≤≥≠≈≡])`,
  'g');
// 坐标点：(−1,−1)、（−1，−1） —— 括号里没有运算符也认
const MATH_COORD_RE = /(^|[^A-Za-z0-9])([(（][^()（）\n]{0,40}[,，][^()（）\n]{0,40}[)）])(?![A-Za-z0-9])/g;
// x轴、y轴坐标、t 秒：变量后面直接跟数理名词
const MATH_VAR_NOUN_RE = /(?<![A-Za-z0-9])([A-Za-z])(?=轴|坐标|值|方向|分量|范围|区间|图象|图像|的)/g;
// xy、xz 这种两个变量的积（只认这几个组合，免得把英文缩写吃进去）
const MATH_PAIR_RE = /(?<![A-Za-z0-9])(xy|yx|xz|zx|yz|zy|ab|ba|mn|nm|pq|qp)(?![A-Za-z0-9])/g;
// “最低点0、升到1”：数理名词后面的裸数字一定是公式里的数
const MATH_VALUE_RE = new RegExp(`((?:最低点|最高点|最小值|最大值|极小值|极大值|顶点|零点|极值|截距|升到|降到|等于|约为|约等于|取到|得到|增大到|减小到|减到|增加到)\\s*)(\\d+(?:\\.\\d+)?)(?![\\d.]|(?:${'岁|个|元|分|秒|分钟|小时|天|年|月|日|次|人|米|克|度|倍|%|％'}))`, 'g');
// 孤立的数学符号：∴ ∵ ∈ ∪ ∞ ∠ ⊥ 这些本身就该是数理字体
const MATH_SOLO_SYM_RE = new RegExp(`([∴∵∈∉∋∪∩⊂⊃⊆⊇∅∀∃∠⊥∥∞∂∇∑∏∫∬∭∮∛∜→←↑↓↔⇒⇐⇔⟶⟵⟹⟺][${'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉₊₋ₙₓᵢ'}]{0,4})`, 'g');

function isChemInline(s) {
  const raw = String(s || '');
  const body = raw
    .replace(/^[0-9₀-₉]{1,3}/, '')
    .replace(new RegExp(`\\^?[0-9${CHEM_SUB}${CHEM_SUP}]*[+\\-−⁺⁻]$`), '');
  const symbols = body.match(/[A-Z][a-z]?/g) || [];
  if (!symbols.length || !symbols.every(x => CHEM_ELEMENTS.has(x))) return false;
  const hasLower = /[a-z]/.test(body);
  const hasDigit = new RegExp(`[0-9${CHEM_SUB}]`).test(body);
  const hasParen = /[()]/.test(body);
  const hasCharge = /[+\-−⁺⁻]/.test(raw);
  if (!hasLower && !hasDigit && !hasParen && !hasCharge) {
    return ['CO', 'NO', 'KOH'].includes(body);
  }
  return symbols.length > 1 || hasDigit || hasLower || hasParen || hasCharge;
}

// 方程式里的单个物质：允许 “C / S / P” 这种单个元素符号（单独出现时不当化学式处理，避免把英文 I 认成碘）
function isChemTerm(t) {
  const s = String(t || '').trim().replace(/[↑↓]$/, '');
  if (!s) return false;
  if (isChemInline(s)) return true;
  const bare = s.replace(/^[0-9₀-₉]{1,3}/, '');
  return /^[A-Z][a-z]?$/.test(bare) && CHEM_ELEMENTS.has(bare);
}

function isChemEquation(s) {
  // 先把“—条件→”“[条件]”这类写法归一，再按反应符号拆两半（= 也当反应符号）
  const norm = String(s || '')
    .replace(/[—–]\s*[^→\n]{0,16}?\s*(?:→|->)/g, '→')
    .replace(/\[[^\]\n]*\]/g, '')
    .replace(/[↑↓]\s*$/, '');
  const sides = norm.split(/\s*(?:->|→|⇌|=)\s*/);
  if (sides.length !== 2) return false;
  return sides.every(side => side.split(/\s*\+\s*/).every(term => isChemTerm(term)));
}

function isMathInline(s) {
  const raw = String(s || '').trim();
  if (!raw || /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$/.test(raw)) return false;
  if (/^[A-Za-z]{2,}-[A-Za-z]{2,}$/.test(raw)) return false;
  return new RegExp(`[${MATH_SIGN}]|[${MATH_UP}]`).test(raw);
}

function isMathCoord(s) {
  const raw = String(s || '').trim();
  if (!/^[(（].*[,，].*[)）]$/.test(raw)) return false;
  // 中文括号里包着中文说明的不算坐标
  if (/[\u4e00-\u9fa5]/.test(raw)) return false;
  return /[\d−\-+=<>√πθαβγλμ]/.test(raw);
}
function normCoord(s) {
  return String(s || '').replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',');
}

/* 公式里的“散件”补衬线：同一段话里已经有公式了，旁边单蹦的 x、y、0、1
   也该是数理字体，否则看着就是一半衬线一半黑体。 */
const CN_PUNCT = '\\u3001\\u3002\\uff0c\\uff1a\\uff1b\\u201c\\u201d\\uff08\\uff09\\u300a\\u300b\\uff01\\uff1f';
const CN_MEASURE = '岁|个|元|块|角|毛|分|秒|毫秒|分钟|小时|天|周|星期|年|月|日|号|次|遍|人|名|位|家|台|套|辆|架|艘|只|条|张|片|幅|本|册|首|部|集|季|期|届|班|组|队|页|行|字|篇|章|节|课|题|项|种|类|级|步|圈|局|盘|杆|球|关|星|折|成|倍|米|厘米|毫米|千米|公里|里|尺|寸|码|克|千克|公斤|斤|两|吨|升|毫升|卡|千卡|度|摄氏|华氏|℃|℉|%|‰|％|G|M|K|B|k|m|g|kg|cm|mm|km|ml|L';
// 公式首尾的逗号冒号属于句子标点，不能跟着进公式（“一般地,”“时,y=2”）
function trimMathEdge(t) {
  return String(t).replace(/^[\s,:*_~`]+/, '').replace(/[\s,:*_~`]+$/, '');
}
function mapPlain(text, fn) {
  return String(text).split(/(\u0000MATH\d+\u0000)/)
    .map(p => (p && p.indexOf('\u0000') !== 0) ? fn(p) : p).join('');
}
function completeMathContext(text, hold, scene) {
  let seg = String(text);
  // ① 中文旁边的单字母：的x、x轴、把y
  const cnRe = new RegExp(`([\\u4e00-\\u9fa5${CN_PUNCT}])\\s?([A-Za-z])(?![A-Za-z0-9])`, 'g');
  seg = mapPlain(seg, t => t.replace(cnRe, (m, a, v) => a + hold(mathHtml(v))));
  const cnTailRe = new RegExp(`(^|[^A-Za-z0-9])([A-Za-z])(?=[\\u4e00-\\u9fa5${CN_PUNCT}])`, 'g');
  seg = mapPlain(seg, t => t.replace(cnTailRe, (m, lead, v) => lead + hold(mathHtml(v))));
  // ② 运算符旁边的单字母
  seg = mapPlain(seg, t => t.replace(/([=<>≤≥≠≈⇒⇐⇔→←↑↓±×÷−+\-*/^])\s*([A-Za-z])(?![A-Za-z0-9])/g, (m, op, v) => op + hold(mathHtml(v))));
  // ③ 中文旁边的负数字面量：代入后得-4
  const negRe = new RegExp(`([\\u4e00-\\u9fa5${CN_PUNCT}])\\s?([−-]\\d+(?:\\.\\d+)?)(?![\\d.])`, 'g');
  seg = mapPlain(seg, t => t.replace(negRe,
    (m, a, v) => a + hold(mathHtml(v.replace(/^-/, '−')))));
  // ④ 中文旁边的裸数字（后面跟着量词/单位的不动，14 岁还是 14 岁）
  //    而且只有这段真的在讲数学（有“得/等于/代入/顶点/坐标”这类线索）才包，
  //    否则“2026年”“下午 2 点”“30 度”这种日常数字也会被做成衬线，看着就不像聊天了。
  const MATH_CUE = /(得|等于|不等|代入|解得|求|设|即|所以|因此|因为|函数|方程|不等式|坐标|顶点|零点|最小值|最大值|面积|周长|体积|斜率|区间|范围|根|角|平方|立方|绝对值|log|ln|sin|cos|tan)/;
  // 理科语境：这些词一出现，单位本身就是要排版的一部分（0.5 mol/L、30 mL、20%）
  // 用语境判断而不是把毫升/摩尔写进“不衬线清单”——清单永远漏，语境不会。

  const mathMode = scene === 'exercise' || MATH_CUE.test(seg);
  const sciMode = SCI_CUE.test(seg);
  // 天气场景下，中文旁边的裸数字也别当成公式：气温 23 还是 23
  if (scene === 'weather' && !mathMode && !sciMode) return seg;
  if (mathMode || sciMode) {
    // 理科语境里数字后面的单位跟着一起进公式；日常语境照旧按量词表放行
    const tail = '(?![\\d.])';
    const numRe = new RegExp(`([\\u4e00-\\u9fa5])\\s?(\\d+(?:\\.\\d+)?)${tail}(?!\\s?(?:岁|个|元|块|人|名|次|号|年|月|日|天|周|遍|台|套|只|条|张|本|页|题|项|种|类|级|班|组|队))`, 'g');
    seg = mapPlain(seg, t => t.replace(numRe, (m, a, v) => a + hold(mathHtml(v))));
  }
  return seg;
}

// 理科语境：出现这些词，数字后面的单位就是要排版的一部分（0.5 mol/L、30 mL、20%）。
// 用语境判断，而不是把“毫升/摩尔”逐个塞进不进衬线清单——清单永远漏，语境不会。
const SCI_CUE = /(mol|摩尔|浓度|溶液|溶质|溶剂|稀释|滴定|pH|PH|质量分数|体积分数|物质的量|阿伏伽德罗|化学式|化学方程式|离子|沉淀|溶解度|反应物|生成物|相对分子质量|摩尔质量|mL|标准状况|气体体积|催化剂|指示剂|焰色|电解|元素|单质|化合物|化合价|原子|分子|氧化物|氧化|还原)/i;

/* 场景判断器（明轩 2026-10-30）：同一串数字，在两种语境里该不该进公式字体是相反的。
   天气预报的「23℃」「北风3级」是日常读数，排成正文字体才像聊天；
   题目里的「3 s」「2 L」「0.5 mol/L」是物理量，数字连单位整体进公式字体才整齐。
   所以不再靠单张关键词表逐个放行：先给整段判一个场景，再按场景定规则。
   weather → 读数一律不排；exercise → 物理量一律排；daily → 维持原样。 */
const WEATHER_WORDS = /(天气|预报|气温|温度|体感|晴|多云|阴天|小雨|中雨|大雨|雷阵雨|阵雨|降雪|大雪|小雪|大风|风力|风向|风级|南风|北风|东风|西风|雾|霾|湿度|紫外线|冷空气|寒潮|降温|升温|高温|低温|霜冻|空气质量|AQI|穿衣|带伞|防晒|零下)/g;
const EXERCISE_WORDS = /(求|解得|代入|已知|试|计算|多少|位移|路程|加速度|压强|浮力|电流|电压|电阻|功率|做功|重力|摩尔|浓度|溶液|溶质|体积|密度|质量分数|物质的量|实验|测得|示数|读数|图象|图像|如图|函数|方程|零点|极值|最小值|最大值|题|选项|答案|单位|秒内|第\d+秒)/g;

function countHits(re, s) {
  const m = String(s || '').match(re);
  return m ? m.length : 0;
}

// 天气 vs 题目：两边都出现时，谁的证据多听谁的；解题词一条顶两条，别让「温度」把实验题带偏
function detectScene(text) {
  const s = String(text || '');
  const ex = countHits(EXERCISE_WORDS, s);
  const wx = countHits(WEATHER_WORDS, s);
  if (ex >= 2 && ex * 2 > wx) return 'exercise';
  if (ex >= 1 && wx === 0) return 'exercise';
  if (ex * 2 > wx) return 'exercise';
  if (wx > 0) return 'weather';
  if (SCI_CUE.test(s)) return 'exercise';
  return 'daily';
}

function replaceBounded(text, re, fn) {
  return text.replace(re, (m, lead, body) => lead + fn(body || m));
}

// 模型偶尔漏了 $ 包裹，写出裸的 \mathrm{H_2O}；正文里绝不能出现“mathrm”这几个字母。
// 只在非公式区里拆包，公式区里的 \mathrm 交给 mathTextHtml 自己处理。
function stripTexWrappers(text) {
  let s = String(text || '');
  if (!/(?:\\|^|[^A-Za-z])(?:mathrm|text|textrm|textnormal|mathbf|mathit|mathsf|mathtt|operatorname)\s*\{/.test(s)) return s;
  let out = '';
  let inMath = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '$') { inMath = !inMath; out += c; continue; }
    if (inMath) { out += c; continue; }
    const rest = s.slice(i);
    const m = /^\\(?:mathrm|text|textrm|textnormal|mathbf|mathit|mathsf|mathtt|operatorname)\s*\{([^{}]*)\}/.exec(rest);
    if (m) { out += m[1]; i += m[0].length - 1; continue; }
    const g = /^(?:mathrm|text|mathbf|mathit)\s*\{([^{}]*)\}/.exec(rest);
    if (g) { out += g[1]; i += g[0].length - 1; continue; }
    out += c;
  }
  return out;
}

function autoInlineFormulas(text, hold) {
  // 场景按整段判一次：拆块后再判，天气词和题目词会落在不同 chunk 里，前后规则打架
  const scene = detectScene(text);
  return String(text).split(/(\u0000MATH\d+\u0000)/).map(part => {
    if (!part || part.indexOf('\u0000') === 0) return part;
    let n = 0;
    const mh = (html) => { n++; return hold(html); };
    // 化学先走：反应式里的箭头不能被后面的公式规则抢走
    let out = replaceBounded(part, CHEM_EQ_INLINE_RE, (m) => isChemEquation(m) ? hold(chemHtml(m)) : m);
    out = replaceBounded(out, CHEM_INLINE_RE, (m) => isChemInline(m) ? hold(chemHtml(m)) : m);
    if (SCI_CUE.test(out)) {
      out = mapPlain(out, t => t.replace(CHEM_BARE_ELEM_RE, (m, lead, sym) => {
        const bare = sym.replace(new RegExp(`[0-9${CHEM_SUB}${CHEM_SUP}+\\-−]`, 'g'), '');
        if (!/^[A-Z][a-z]?$/.test(bare) || !CHEM_ELEMENTS.has(bare)) return m;
        return lead + hold(chemHtml(sym));
      }));
    }
    // 天气场景：整段在说天气，读数一律按正文排（明轩 2026-10-30 场景判断器）
    // 温度、风力、湿度、空气质量都是日常读数，进了公式字体就像在看试卷
    if (scene === 'weather') {
      // 负号、零下都要一起按住，不然只剩「-5」被当成算式排版（明轩 2026-10-29）
      const TEMP_NUM = '(?:零下\\s*)?(?:[-−~～]\\s*)?\\d+(?:\\.\\d+)?';
      const reT = new RegExp('(' + TEMP_NUM + ')\\s?(℃|℉|°C|°F|摄氏度|华氏度)', 'g');
      const reD = new RegExp('(' + TEMP_NUM + ')\\s?度(?![数角])', 'g');
      const reL = new RegExp('(' + TEMP_NUM + ')\\s?(级|%)', 'g');
      out = mapPlain(out, t => t
        // ℃ 是单个全角字形，安卓上又窄又偏；拆成 ° + C 两个字符，C 走正文的苹方（明轩 2026-10-29）
        .replace(reT, (m) => mh(m.replace(/℃/g, '°C').replace(/℉/g, '°F')))
        .replace(reD, (m) => mh(m))
        .replace(reL, (m) => mh(m)));
    }
    // 题目场景：物理量/化学量连数字带单位整体进公式（明轩 2026-10-30）
    // 「第3秒到第5秒」「2 L」「0.5 mol/L」以前一半衬线一半黑体，就是缺这一道
    if (scene !== 'weather') {
      // 拉丁单位（L、m/s、mol/L）无论如何都连数字一起包：不包的话单位里的字母会被
      // 后面的公式规则单独抓走，「3 m/s」就成了 3 是黑体、m/s 是衬线，看着就断成两截。
      // 中文单位（秒/升/克）只在题目场景包数字，汉字本身永远不排衬线。
      const NUM_PART = '(?:\\d+(?:\\.\\d+)?)(?:\\s*[~～\\-—]\\s*\\d+(?:\\.\\d+)?)?';
      const UNIT_LATIN = 'mol\\/L|mol·L⁻¹|mol\\/kg|g\\/mol|kJ\\/mol|km\\/h|m\\/s²|m\\/s|g\\/cm³|kg\\/m³|g\\/L|kPa|MPa|kHz|kJ|kW|kΩ|Pa|Hz|J|N|W|V|A|Ω|mol|mL|ml|L|kg|mg|g|ms|min|km|cm|mm|m|s|h|℃|°C|℉|°F|%|‰';
      const UNIT_CN = '毫升|升|克|千克|公斤|摩尔|秒|毫秒|分钟|小时|厘米|毫米|千米|公里|米|度';
      const reUL = new RegExp(`(^|[^A-Za-z0-9])(${NUM_PART})\\s?(${UNIT_LATIN})(?![A-Za-z0-9])`, 'g');
      const reUC = new RegExp(`(^|[^A-Za-z0-9])(${NUM_PART})\\s?(${UNIT_CN})`, 'g');
      out = mapPlain(out, t => t
        .replace(reUL, (m, lead, num, unit) => lead + mh(mathHtml((num + unit).replace(/\s/g, ''))))
        .replace(scene === 'exercise' ? reUC : /\u0000^/, (m, lead, num, unit) => lead + mh(mathHtml(num)) + unit));
    }
    // 根号必须走在等号前面：不然 √x−1=1 会被等号规则先切走，√ 孤零零留在黑体里
    out = replaceBounded(out, MATH_SQRT_RE, (m) => mh(mathHtml(m)));
    const wrap = (m) => {
      const core = trimMathEdge(m);
      return (core && isMathInline(core)) ? m.replace(core, mh(mathHtml(core))) : m;
    };
    out = replaceBounded(out, MATH_ARROW_LEAD_RE, wrap);
    out = replaceBounded(out, MATH_EQ_RE, wrap);
    out = replaceBounded(out, MATH_INLINE_RE, wrap);
    out = replaceBounded(out, MATH_IMPLICIT_RE, wrap);
    out = replaceBounded(out, MATH_OP_LEAD_RE, wrap);
    out = replaceBounded(out, MATH_OP_TAIL_RE, wrap);
    out = replaceBounded(out, MATH_COORD_RE, (m) => isMathCoord(m) ? mh(mathHtml(normCoord(m))) : m);
    out = replaceBounded(out, MATH_GREEK_RE, (m) => mh(mathHtml(m)));
    out = replaceBounded(out, MATH_SUP_RE, (m) => mh(mathHtml(m)));
    // 理科单位：0.5 mol/L、30 mL、20 g/mol 这种“数字+单位”必须整体进公式，
    // 否则单位里的 L、g 会被后面的字母规则单独抓走，拆成两半。
    if (SCI_CUE.test(out)) {
      const SCI_UNIT_RE = /(\d+(?:\.\d+)?)\s?(mol\/L|mol·L⁻¹|mol\/kg|g\/mol|kJ\/mol|mol|mL|L|kg|mg|g|℃|°C|%|‰|毫升|摩尔|毫升|升|克)/g;
      out = mapPlain(out, t => t.replace(SCI_UNIT_RE, (m) => mh(mathHtml(m.replace(/\s/g, '')))));
    }
    out = mapPlain(out, t => t.replace(MATH_VAR_NOUN_RE, (m, v) => mh(mathHtml(v))));
    out = mapPlain(out, t => t.replace(MATH_PAIR_RE, (m) => mh(mathHtml(m))));
    out = mapPlain(out, t => t.replace(MATH_VALUE_RE, (m, w, v) => w + mh(mathHtml(v))));
    out = mapPlain(out, t => t.replace(MATH_SOLO_SYM_RE, (m) => mh(mathHtml(m))));
    // 单蹦的字母（h、g、y 这些）、负数一律补衬线：中文里出现基本就是变量
    out = completeMathContext(out, hold, scene);
    return foldChemState(out);
  }).join('');
}

export function renderMarkdown(src) {
  const esc = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // v0.9.4：数学/化学先挖成占位符，正文单独走 markdown，最后再塞回去。
  // 关键：数学产出的 HTML 绝不能再被 markdown / 自动斜体正则碰一次，否则标签会被撕成文字。
  const held = [];
  const hold = (html) => { held.push(html); return `\u0000MATH${held.length - 1}\u0000`; };
  // 公式解析失败绝不能把整条消息打回原文——那会让 [[math:]] 直接裸奔。
  // 单个公式出错就退化成可读文本，其余正文照常渲染。
  const mathSafe = (body, display) => {
    try { return mathHtml(body, display); }
    catch (_) { return `<span class="math">${esc(String(body || ''))}</span>`; }
  };
  const chemSafe = (body) => {
    try { return chemHtml(body); }
    catch (_) { return `<span class="chem">${esc(String(body || ''))}</span>`; }
  };
  // [[math:Na₂O₂]] 这种「整段就是一个化学式」的，按化学式排（正体+下标），顺带变成可点查的 c-mol；
  // 不然会排成斜体数学，看着就不像化学
  const holdFormula = (kind, body) => {
    if (String(kind).toLowerCase() === 'chem') return hold(foldChemState(chemSafe(body)));
    if (bareFormula(body)) return hold(foldChemState(chemSafe(String(body).replace(/[{}]/g, '').replace(/_/g, ''))));
    return hold(mathSafe(body));
  };

  let pre = stripMusicMarks(src);
  // 围栏代码块先挖走：普通代码按 code 块排，画图脚本不再裸奔成一大段。
  // 放在公式解析前面，代码里的 $、\frac、下划线不会被误当公式。
  pre = pre.replace(/```([A-Za-z0-9_+.-]*)[ \t]*\r?\n([\s\S]*?)```/g, (m, lang, code) => {
    const isPlot = /^(py|python|javascript|js|html|matlab|r)$/i.test(lang) &&
      /matplotlib|pyplot|plt\.|numpy|np\.|canvas|getContext|plotly|Chart\.js|function\s+draw|fig\s*=|subplot|scatter|plot\(/i.test(code);
    if (isPlot) {
      return hold('<div class="draw-fallback">这段画图脚本已省略，请用画图卡片重新生成图像。</div>');
    }
    return hold(`<pre class="md-pre"><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(code.replace(/\s+$/, ''))}</code></pre>`);
  });
  // 先清空标签，避免空公式残留
  pre = pre.replace(/\[\[\s*(math|chem)\s*[：:]\s*\]\]/gi, '');
  // 模型偶尔写错标签：[[math]r']]（少了冒号，括号也只开一层）。
  // 先按宽松格式收掉，避免整段公式原样漏到正文里。
  pre = pre.replace(/\[\[\s*(math|chem)\s*\]\s*([\s\S]*?)\s*\]\]/gi,
    (m, kind, body) => holdFormula(kind, body));
  // 正常闭合：允许大小写、空格、全角冒号，正文前后空白一起吃掉
  // 末尾的 ] 可能属于 \right]，不能把公式里的右方括号当标签闭合
  pre = pre.replace(/\[\[\s*(math|chem)\s*[：:]\s*([\s\S]*?)\s*\]\](?!\])/gi, (m, kind, body) => holdFormula(kind, body));
  // 单层方括号 + 缺冒号：[math]r']
  pre = pre.replace(/\[\s*(math|chem)\s*\]\s*([\s\S]+?)\s*\](?!\])/gi,
    (m, kind, body) => holdFormula(kind, body));
  // 模型偶尔只写一层方括号：[math:...]
  pre = pre.replace(/\[\s*(math|chem)\s*[：:]\s*([\s\S]+?)\s*\](?!\])/gi, (m, kind, body) => holdFormula(kind, body));
  // 末尾没闭合（生成中断）：把剩下的内容当公式吃掉，绝不把标签留给用户
  pre = pre.replace(/\[\[\s*(math|chem)\s*[：:]\s*([\s\S]*)$/gi, (m, kind, body) =>
    holdFormula(kind, String(body || '').replace(/\]\]?\s*$/, '')));
  // 兜底：任何残存的标签开头都清掉
  pre = pre.replace(/\[\[\s*(?:math|chem)\s*[：:]\s*/gi, '');
  // 化学 \ce{} 和物理单位 \pu{}：模型偶尔会直接写 LaTeX 命令，别让反斜杠露出来
  pre = pre.replace(/\$\s*\\ce\{([^{}]*)\}\s*\$/g, (m, body) => hold(chemSafe(body)));
  pre = pre.replace(/\\ce\{([^{}]*)\}/g, (m, body) => hold(chemSafe(body)));
  pre = pre.replace(/\\pu\{([^{}]*)\}/g, (m, body) => hold(unitHtml(body)));
  // v0.9.76：模型经常不写 [[math:]]，直接吐 $$...$$、\(...\)、$...$ 或裸 LaTeX。
  // 这里先兜一层常见分隔符，再把已知命令开头的裸公式包成 .math。
  pre = pre
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, body) => hold(mathHtml(body, true)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (m, body) => hold(mathHtml(body, true)))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, body) => hold(mathHtml(body)))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g, (m, lead, body) =>
      looksLikeMath(body) ? lead + hold(mathHtml(body)) : m)
    .replace(/\\begin\{([a-zA-Z*]+)\}[-\s\S]*?\\end\{\1\}/g, (m) => hold(mathHtml(m, true)))
    .replace(BARE_LATEX_RE, (m) => {
      const name = (m.match(/^\\([A-Za-z]+)/) || [])[1] || '';
      if (MATH_SYMBOL_MAP['\\' + name] === undefined && !BARE_MATH_STRUCT.has(name)) return m;
      return hold(mathHtml(m));
    });

  // 先保住 URL/邮箱，避免把链接参数里的 x=1 当成算式。
  pre = pre.replace(/https?:\/\/[^\s<>"'）)】，。；]+/g, (m) => hold(esc(m)));
  pre = pre.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => hold(esc(m)));
  // 手机号/座机/时间/版本号先保住：里面的 “-” “:” 会被当成运算符号包进公式，号码就变衬线了
  pre = pre.replace(/\b1[3-9]\d{9}\b/g, (m) => hold(esc(m)));
  pre = pre.replace(/\b\d{3,4}-\d{3,4}-\d{3,4}\b/g, (m) => hold(esc(m)));
  pre = pre.replace(/\b0\d{2,3}-\d{7,8}\b/g, (m) => hold(esc(m)));
  pre = pre.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, (m) => hold(esc(m)));
  pre = pre.replace(/\bv?\d+\.\d+\.\d+\b/g, (m) => hold(esc(m)));
  // 兜底：正文里没有标签的化学式/算式也识别成数理片段。
  pre = autoInlineFormulas(stripTexWrappers(pre), hold);

  const lines = pre.split('\n');
  const out = [];
  let list = null;

  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\u0000MATH(\d+)\u0000/g, (m, i) => held[Number(i)] || '');

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const heldOnly = /^\u0000MATH(\d+)\u0000$/.exec(line);
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const hr = /^\s*([-*_])\1{2,}\s*$/.exec(line);

    if (heldOnly) {
      if (list) { out.push(`</${list}>`); list = null; }
      out.push(held[Number(heldOnly[1])] || '');
    } else if (hr) {
      if (list) { out.push(`</${list}>`); list = null; }
      out.push('<hr class="md-hr">');
    } else if (h) {
      if (list) { out.push(`</${list}>`); list = null; }
      const lv = h[1].length;
      out.push(`<div class="md-h${lv}">${inline(h[2])}</div>`);
    } else if (ul) {
      if (list !== 'ul') { if (list) out.push(`</${list}>`); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      if (list !== 'ol') { if (list) out.push(`</${list}>`); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else {
      if (list) { out.push(`</${list}>`); list = null; }
      if (line) out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (list) out.push(`</${list}>`);
  let html = out.join('');
  // 状态词合并必须放在占位符还原之后：化学式的 HTML 一直在 held 里，
  // 在 autoInlineFormulas 阶段看到的是占位符，「粉末」还接不上（明轩 2026-10-30）
  html = foldChemState(html);
  // 最后一道保险：正文若还有漏网的标签，至少别把 [[math: 和 ]] 显示出来
  if (/\[\[\s*(?:math|chem)\s*[：:]/i.test(html)) {
    html = html.replace(/\[\[\s*(?:math|chem)\s*[：:]\s*/gi, '').replace(/\]\]/g, '');
  }
  return html;
}



/* ---------- 数理符号 ----------
   两种输入都能吃：
   1) 原生符号直接用：π √ ∑ ∫ ∪ ∩ ⊆ ∅ ∈ ∉ ± × ÷ ≈ ≠ ≤ ≥ ∴ ∵ ∠ ⊥ ∥ ⇒ ⇔ → ↑ ↓ ↑↑ ⇌ ² ³ ₁ ₂
   2) 模型的 [[math:...]] 片段：支持 \frac{}{} \sqrt \sqrt[n]{} ^{} _{} \cup \cap \subset \emptyset 等常用子集
   统一转成纯 HTML + 原生 Unicode，不引第三方库（KaTeX 太重，微信 WebView 也不稳） */
const MATH_SYMBOL_MAP = {
  '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ', '\\lambda': 'λ',
  '\\mu': 'μ', '\\sigma': 'σ', '\\omega': 'ω', '\\rho': 'ρ', '\\epsilon': 'ε', '\\varepsilon': 'ε',
  '\\zeta': 'ζ', '\\eta': 'η', '\\iota': 'ι', '\\kappa': 'κ', '\\nu': 'ν', '\\xi': 'ξ',
  '\\omicron': 'ο', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ',
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ', '\\Pi': 'Π',
  '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
  '\\ell': 'ℓ', '\\hbar': 'ℏ', '\\Re': 'ℜ', '\\Im': 'ℑ', '\\aleph': 'ℵ', '\\wp': '℘',
  '\\otimes': '⊗', '\\oplus': '⊕', '\\odot': '⊙', '\\ast': '∗', '\\star': '⋆', '\\bullet': '•',
  '\\infty': '∞', '\\times': '×', '\\div': '÷', '\\pm': '±', '\\mp': '∓', '\\cdot': '·',
  '\\approx': '≈', '\\neq': '≠', '\\ne': '≠', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
  '\\cup': '∪', '\\cap': '∩', '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
  '\\emptyset': '∅', '\\varnothing': '∅', '\\in': '∈', '\\notin': '∉', '\\ni': '∋',
  '\\forall': '∀', '\\exists': '∃', '\\neg': '¬', '\\land': '∧', '\\lor': '∨',
  '\\because': '∵', '\\therefore': '∴', '\\angle': '∠', '\\perp': '⊥', '\\parallel': '∥',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔', '\\rightarrow': '→', '\\to': '→',
  '\\leftarrow': '←', '\\leftrightarrow': '↔', '\\rightleftharpoons': '⇌', '\\uparrow': '↑', '\\downarrow': '↓',
  '\\langle': '⟨', '\\rangle': '⟩', '\\lvert': '|', '\\rvert': '|', '\\lVert': '‖', '\\rVert': '‖',
  '\\vert': '|', '\\Vert': '‖', '\\mid': '|', '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '{', '\\rbrace': '}',
  '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃', '\\cong': '≅', '\\triangle': '△', '\\triangleq': '≜',
  '\\setminus': '∖', '\\complement': '∁', '\\nsubseteq': '⊈', '\\nsupseteq': '⊉', '\\nparallel': '∦', '\\nmid': '∤',
  '\\leqslant': '≤', '\\geqslant': '≥', '\\ll': '≪', '\\gg': '≫', '\\iff': '⇔', '\\implies': '⇒', '\\impliedby': '⇐',
  '\\mapsto': '↦', '\\longrightarrow': '⟶', '\\longleftarrow': '⟵',
  '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\cot': 'cot', '\\sec': 'sec', '\\csc': 'csc',
  '\\arcsin': 'arcsin', '\\arccos': 'arccos', '\\arctan': 'arctan', '\\sinh': 'sinh', '\\cosh': 'cosh', '\\tanh': 'tanh',
  '\\ln': 'ln', '\\lg': 'lg', '\\log': 'log', '\\lim': 'lim', '\\max': 'max', '\\min': 'min',
  '\\exp': 'exp', '\\det': 'det', '\\gcd': 'gcd', '\\bmod': 'mod', '\\mod': 'mod',
  '\\sum': '∑', '\\prod': '∏', '\\coprod': '∐', '\\int': '∫', '\\iint': '∬', '\\iiint': '∭',
  '\\oint': '∮', '\\oiint': '∯', '\\oiiint': '∰', '\\smallint': '∫',
  '\\partial': '∂', '\\nabla': '∇', '\\propto': '∝',
  '\\degree': '°', '\\circ': '∘', '\\prime': '′', '\\ldots': '…', '\\cdots': '⋯',
  // 大于小于一律走命令，避免和 HTML 尖括号、聊天里的引用符号打架
  '\\gt': '>', '\\lt': '<', '\\geq': '≥', '\\leq': '≤',
  '\\therefore': '∴', '\\because': '∵',
};

// 大型运算符单独处理：积分、求和、连乘、极限要把上下限叠在符号上下
const BIG_OPS = {
  sum: '∑', prod: '∏', coprod: '∐',
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', oiint: '∯', oiiint: '∰', smallint: '∫',
  lim: 'lim', liminf: 'lim inf', limsup: 'lim sup',
};

// 化学专用：反应箭头与条件、电子、电荷
const CHEM_CMDS = {
  '\\rightarrow': '→', '\\to': '→', '\\rightleftharpoons': '⇌', '\\xrightarrow': '→',
  '\\uparrow': '↑', '\\downarrow': '↓', '\\Delta': 'Δ',
};

const MATH_SUPS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ' };
const MATH_SUBS = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', n: 'ₙ', x: 'ₓ' };

function toScript(str, table) {
  const chars = [...String(str)];
  if (chars.every(c => table[c])) return chars.map(c => table[c]).join('');
  return null;
}

// 取花括号里的内容，支持一层嵌套
function readGroup(src, i) {
  if (src[i] !== '{') {
    const ch = src[i] || '';
    return { value: ch, next: i + 1 };
  }
  let depth = 0;
  let out = '';
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; if (depth === 1) continue; }
    if (c === '}') { depth--; if (depth === 0) return { value: out, next: j + 1 }; }
    out += c;
  }
  return { value: out, next: src.length };
}

// 上下标不带花括号时，允许 -1、10、n 这种多字符；不能只吃一个字符
function readScriptGroup(src, i) {
  if (src[i] === '{') return readGroup(src, i);
  const m = /^(?:[-+]?\d+|[A-Za-z])/.exec(src.slice(i));
  if (m) return { value: m[0], next: i + m[0].length };
  return { value: src[i] || '', next: i + 1 };
}

/* ---------- 可伸缩定界符 ----------
   方程组的 {、矩阵的 [ ]、积分的上下限、绝对值 | |、范数 ‖ ‖、尖括号 ⟨ ⟩
   都走 SVG 拉伸；不能用普通字符放大，否则分式一高就错位。 */
const DELIM_ALIASES = {
  '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}',
  '\\langle': '⟨', '\\rangle': '⟩',
  '\\|': '‖',
  '\\lvert': '|', '\\rvert': '|', '\\vert': '|', '\\|': '‖',
  '\\Vert': '‖', '\\lVert': '‖', '\\rVert': '‖',
  '\\lbrack': '[', '\\rbrack': ']', '\\[': '[', '\\]': ']', '\\(': '(', '\\)': ')',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉',
};

const DELIM_PATHS = {
  // 大括号：上下两段圆弧收进中腰，中腰用直线收出一个真正的尖，角不再糊成一团
  '{': 'M8.9 1 C5.6 1 4.7 3.9 4.7 8.6 L4.7 25.4 C4.7 35.8 4.2 42.6 1.3 50 C4.2 57.4 4.7 64.2 4.7 74.6 L4.7 91.4 C4.7 96.1 5.6 99 8.9 99',
  '}': 'M1.1 1 C4.4 1 5.3 3.9 5.3 8.6 L5.3 25.4 C5.3 35.8 5.8 42.6 8.7 50 C5.8 57.4 5.3 64.2 5.3 74.6 L5.3 91.4 C5.3 96.1 4.4 99 1.1 99',
  '(': 'M8.2 1 C2.8 23 2.8 77 8.2 99',
  ')': 'M1.8 1 C7.2 23 7.2 77 1.8 99',
  '[': 'M8 1 H3 V99 H8',
  ']': 'M2 1 H7 V99 H2',
  '|': 'M5 1 V99',
  '‖': 'M3.4 1 V99 M6.6 1 V99',
  '⟨': 'M8 1 L2 50 L8 99',
  '⟩': 'M2 1 L8 50 L2 99',
  '⌊': 'M8 1 V99 H2',
  '⌋': 'M2 1 V99 H8',
  '⌈': 'M2 1 H8 V99',
  '⌉': 'M8 1 H2 V99',
};

function readDelimiter(src, i) {
  if (src[i] === '\\') {
    const m = /^\\(?:[{}|]|lbrace|rbrace|langle|rangle|lvert|rvert|vert|Vert|lVert|rVert|lbrack|rbrack|lfloor|rfloor|lceil|rceil|\[|\])/.exec(src.slice(i));
    if (!m) return null;
    return { ch: DELIM_ALIASES[m[0]] || '', next: i + m[0].length };
  }
  if ('()[]|{}⟨⟩‖⌊⌋⌈⌉'.includes(src[i])) return { ch: src[i], next: i + 1 };
  if (src[i] === '.') return { ch: '', next: i + 1 };
  return null;
}

function delimSvg(ch) {
  const path = DELIM_PATHS[ch];
  if (!path) return '';
  return `<span class="m-delim" aria-hidden="true"><svg viewBox="0 0 10 100" preserveAspectRatio="none" focusable="false"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>`;
}

function findMatchingRight(src, start) {
  let depth = 0;
  for (let j = start; j < src.length;) {
    if (src.startsWith('\\left', j) && !/[A-Za-z]/.test(src[j + 5] || '')) {
      depth++;
      j += 5;
      const d = readDelimiter(src, j);
      if (d) j = d.next;
      continue;
    }
    if (src.startsWith('\\right', j) && !/[A-Za-z]/.test(src[j + 6] || '')) {
      if (depth === 0) {
        const d = readDelimiter(src, j + 6);
        if (d) return { body: src.slice(start, j), close: d.ch, next: d.next };
      } else {
        depth--;
      }
      j += 6;
      const d = readDelimiter(src, j);
      if (d) j = d.next;
      continue;
    }
    j++;
  }
  return null;
}

function delimGroupHtml(open, inner, close) {
  return `<span class="m-delim-group">${delimSvg(open)}<span class="m-delim-body">${inner}</span>${delimSvg(close)}</span>`;
}

/* ---------- 物理单位 ----------
   单位必须是正体，不能走数学斜体；m/s、m/s²、kg·m/s²、N·m、J/(kg·°C)
   这些复合单位先挖成 HTML 占位，免得裸斜杠被当成 \frac 排成分式。 */
const UNIT_ATOMS = ['mm', 'cm', 'dm', 'km', 'nm', 'μm', 'um', 'm',
  'kg', 'mg', 'g', 'ms', 's', 'min', 'h', 'mol', 'cd',
  'mA', 'A', 'mV', 'V', 'kW', 'W', 'kJ', 'J', 'kN', 'N',
  'kPa', 'MPa', 'Pa', 'kHz', 'MHz', 'Hz', 'mL', 'L',
  'Ω', 'ohm', '℃', '°C', 'K'].sort((a, b) => b.length - a.length).join('|');
const UNIT_SUFFIX = '(?:\\^?\\{?[-+]?\\d+\\}?|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?';
const UNIT_TOKEN = `(?:${UNIT_ATOMS})${UNIT_SUFFIX}`;
const UNIT_COMPOUND_RE = new RegExp(`(^|[^A-Za-z])(${UNIT_TOKEN}(?:\\s*(?:[·⋅*×]|\\/)\\s*${UNIT_TOKEN})+)`, 'g');
const UNIT_PAREN_RE = /(?:J|kJ|W|kW|Pa|kPa)\s*\/\s*\([^()]{1,24}\)/g;
const NUMBER_UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_TOKEN})(?![A-Za-z])`, 'g');
// 单位占位符用全局表：\text{m/s} 里会递归解析一次，单靠局部数组会把单位吞掉
const UNIT_STORE = new Map();
let UNIT_SEQ = 0;

function unitHtml(raw) {
  const plain = String(raw || '').replace(/\u0001U(\d+)\u0001/g, (m, id) =>
    String(UNIT_STORE.get(Number(id)) || '').replace(/<[^>]*>/g, ''));
  let s = plain
    .replace(/^\\text\{([\s\S]*)\}$/, '$1')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\cdot/g, '·')
    .replace(/\^\{?([+-]?\d+)\}?/g, (m, n) => toScript(n, MATH_SUPS) || n)
    .replace(/[⋅*×]/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="m-unit">${s}</span>`;
}

function protectUnits(input) {
  const take = (raw) => {
    const id = ++UNIT_SEQ;
    UNIT_STORE.set(id, unitHtml(raw));
    return `\u0001U${id}\u0001`;
  };
  let src = String(input || '');
  src = src.replace(UNIT_PAREN_RE, (m) => take(m));
  src = src.replace(UNIT_COMPOUND_RE, (m, lead, unit) => lead + take(unit));
  src = src.replace(NUMBER_UNIT_RE, (m, num, unit) => num + take(unit));
  return src;
}

// 纯文本片段：只在这里做「单字母斜体 / 数字正体」，结构标签永不参与（v0.9.4）
/* 箭头统一画出来。各字体的 → 高低不一（有的贴着下划线，有的在中间），
   换台机器就变样；用 SVG 画死，横竖都居中、粗细长短一致。 */
const ARROW_SVG = {
  '→': ['h', 'end'], '←': ['h', 'start'], '↔': ['h', 'both'], '⟶': ['h', 'end'], '⟵': ['h', 'start'],
  '⇒': ['h2', 'end'], '⇐': ['h2', 'start'], '⇔': ['h2', 'both'],
  '⇄': ['h', 'both'], '⇋': ['h2', 'both'], '⇌': ['eq', 'end'], '↦': ['h', 'bar'],
  '↑': ['v', 'end'], '↓': ['v', 'start'],
};
function arrowSvg(ch) {
  const spec = ARROW_SVG[ch];
  if (!spec) return '';
  const kind = spec[0], head = spec[1];
  const stroke = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  if (kind === 'v') {
    const hd = head === 'end' ? '<path d="M3.4 8.2 8 3.2 12.6 8.2"/>' : '<path d="M3.4 15.8 8 20.8 12.6 15.8"/>';
    return `<svg class="m-arr m-arr-v" viewBox="0 0 16 24" aria-hidden="true" ${stroke}><path d="M8 20.6V3.6"/>${hd}</svg>`;
  }
  if (kind === 'h2') {
    const hd = head === 'end' ? '<path d="M15.6 1.8 21 8 15.6 14.2"/>'
      : head === 'start' ? '<path d="M8.4 1.8 3 8 8.4 14.2"/>'
      : '<path d="M8.4 1.8 3 8 8.4 14.2"/><path d="M15.6 1.8 21 8 15.6 14.2"/>';
    return `<svg class="m-arr" viewBox="0 0 24 16" aria-hidden="true" ${stroke}><path d="M3 5h18"/><path d="M3 11h18"/>${hd}</svg>`;
  }
  if (kind === 'eq') {
    return `<svg class="m-arr" viewBox="0 0 24 16" aria-hidden="true" ${stroke}><path d="M3 5h13"/><path d="M21 11H8"/><path d="M16 1.8 21 5 16 8.2"/><path d="M8 7.8 3 11 8 14.2"/></svg>`;
  }
  const hd = head === 'end' ? '<path d="M15 3.4 20.6 8 15 12.6"/>'
    : head === 'start' ? '<path d="M9 3.4 3.4 8 9 12.6"/>'
    : '<path d="M9 3.4 3.4 8 9 12.6"/><path d="M15 3.4 20.6 8 15 12.6"/>';
  const bar = head === 'bar' ? '<path d="M21 4.4v7.2"/>' : '';
  return `<svg class="m-arr" viewBox="0 0 24 16" aria-hidden="true" ${stroke}><path d="M3 8h18"/>${hd}${bar}</svg>`;
}

function mathTextHtml(t) {
  // 未知 LaTeX 命令不要在正文里留反斜杠；保留命令名，至少能读
  t = String(t).replace(/\\([A-Za-z]+)/g, '$1').replace(/\\\s/g, ' ');
  // 运算符号单独包成 .m-op，左右留白；紧跟左括号/行首的正负号按一元符号处理
  const OPS = '=<>≤≥≠≈≡≅≔∈∉∪∩⊆⊂⊃⊇⇒⇐⇔⟹⟺⟶⟵→←↔⇄⇋⇌↦↑↓∴∵≪≫∝⊥∠∥±∓×÷·+−~\\-,:';
  const pieces = String(t).split(new RegExp(`([${OPS}])`));
  let prev = '';
  return pieces.map((seg) => {
    if (!seg) return '';
    if (seg.length === 1 && OPS.includes(seg)) {
      if (ARROW_SVG[seg]) { prev = seg; return arrowSvg(seg); }
      if (seg === ',' || seg === ':') { prev = seg; return `<span class="m-sep">${seg}</span>`; }
      const unary = (seg === '+' || seg === '-' || seg === '−') && (!prev || /[([{=<>≤≥≠≈+×÷·,;:]/.test(prev));
      prev = seg;
      return `<span class="m-op${unary ? ' m-unary' : ''}">${seg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
    }
    const last = seg.trimEnd().slice(-1);
    if (last) prev = last;
    const esc = seg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/([A-Za-z]+)|(\d+(?:\.\d+)?)/g, (m, word, num) => {
      if (num) return `<span class="m-num-r">${num}</span>`;
      if (word.length === 1) return `<span class="m-var">${word}</span>`;
      const FN = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'lg', 'log', 'lim', 'max', 'min', 'exp', 'det', 'gcd', 'mod'];
      if (FN.includes(word)) return `<span class="m-fn">${word}</span>`;
      return `<span class="m-var">${word}</span>`;
    });
  }).join('');
}

// 把源码切成「结构 / 文本」两部分，结构部分原样输出，文本部分交给 mathTextHtml
function mathParts(input) {
  let src = protectUnits(input);
  // Unicode √（模型常直接写 √x−1）转成结构根号：只有这样才会画出一条盖住被开方式的横杠
  src = src.replace(/√\s*(\{[^{}]*\}|\([^()]*\)|[A-Za-z0-9]+(?:\.[0-9]+)?)/g, (m, g) => `\\sqrt{${unparen(g)}}`);
  // 裸斜杠分式：27/x^3 → \frac{27}{x^3}，反复几轮处理 a/b/c（v0.9.4）
  for (let k = 0; k < 3; k++) {
    const next = src.replace(
      /(\([^()/]*\)|\{[^{}/]*\}|[A-Za-z0-9]+(?:\^\{?[A-Za-z0-9]+\}?)?)\s*\/\s*(\([^()/]*\)|\{[^{}/]*\}|[A-Za-z0-9]+(?:\^\{?[A-Za-z0-9]+\}?)?)/g,
      (m, x, y) => `\\frac{${unparen(x)}}{${unparen(y)}}`);
    if (next === src) break;
    src = next;
  }
  // 只清理固定大小的括号命令；\left / \right 留到主循环里配对成可伸缩定界符
  src = src.replace(/\\(?:bigg|Bigg|big|Big)[lr]?(?![a-zA-Z])/g, '');
  src = src.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|nonumber)\b/g, '');
  src = src.replace(/\\\{/g, '{').replace(/\\\}/g, '}')
    .replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  // 间距与转义字符：\, \; \quad \qquad 等不再当正文代码
  src = src.replace(/\\[,;:!]/g, (m) => (m === '\\!' ? '' : (m === '\\,' ? '\u2009' : ' ')));
  src = src.replace(/\\q?quad/g, '  ')
    .replace(/\\([%&#_{}$])/g, '$1');
  src = src.replace(/\\[a-zA-Z]+/g, (m) => {
    if (BIG_OPS[m.slice(1)] !== undefined) return m;
    return MATH_SYMBOL_MAP[m] !== undefined ? MATH_SYMBOL_MAP[m] : m;
  });

  const parts = [];
  const pushText = (t) => { if (t) parts.push({ k: 't', v: t }); };
  const pushHtml = (h) => parts.push({ k: 'h', v: h });
  let i = 0, buf = '';
  const flush = () => { pushText(buf); buf = ''; };

  while (i < src.length) {
    const rest = src.slice(i);

    // 已挖走的物理单位：直接塞正体 HTML，不再参与分式/斜体
    const um = /^\u0001U(\d+)\u0001/.exec(rest);
    if (um) {
      flush();
      pushHtml(UNIT_STORE.get(Number(um[1])) || '');
      i += um[0].length;
      continue;
    }

    // \pu{5 m/s} / \ce{H2O} 直接写在 [[math:...]] 里也要能认
    const pm = /^\\(pu|ce)\s*/.exec(rest);
    if (pm) {
      flush();
      i += pm[0].length;
      const g = readGroup(src, i);
      i = g.next;
      pushHtml(pm[1] === 'ce' ? chemHtml(g.value) : unitHtml(g.value));
      continue;
    }

    // 可伸缩定界符：\left( ... \right)、\left\{ ... \right.、\left| ... \right|
    const lm = /^\\left(?![A-Za-z])/.exec(rest);
    if (lm) {
      const open = readDelimiter(src, i + 5);
      if (!open) { i += 5; continue; }
      const match = findMatchingRight(src, open.next);
      if (!match) { i = open.next; continue; }
      flush();
      pushHtml(delimGroupHtml(open.ch, mathInner(match.body), match.close));
      i = match.next;
      continue;
    }
    if (/^\\right(?![A-Za-z])/.test(rest)) { i += 6; continue; }
    if (/^\\middle(?![A-Za-z])/.test(rest)) { i += 7; continue; }

    // 大型运算符：积分、求和、连乘、极限，把 _ / ^ 叠在符号上下
    const opm = /^\\(liminf|limsup|iiint|oiiint|oiint|iint|smallint|int|oint|sum|prod|coprod|lim)(?![A-Za-z])/.exec(rest);
    if (opm) {
      flush();
      const opName = opm[1];
      i += opm[0].length;
      let sub = '', sup = '';
      for (let k = 0; k < 3; k++) {
        while (src[i] === ' ') i++;
        if (src[i] !== '_' && src[i] !== '^') break;
        const isSup = src[i] === '^';
        const g = readScriptGroup(src, i + 1);
        i = g.next;
        if (isSup) sup = g.value; else sub = g.value;
      }
      const isLim = opName.startsWith('lim');
      const main = isLim ? mathTextHtml(BIG_OPS[opName]) : BIG_OPS[opName];
      pushHtml(`<span class="m-bigop${isLim ? ' m-bigop-fn' : ''}${/int|oint/.test(opName) ? ' m-bigop-int' : ''}">`
        + `${sup ? `<span class="m-bigop-sup">${mathInner(sup)}</span>` : ''}`
        + `<span class="m-bigop-main">${main}</span>`
        + `${sub ? `<span class="m-bigop-sub">${mathInner(sub)}</span>` : ''}</span>`);
      continue;
    }

    // 换行（矩阵/多行式子残留的 \\）
    if (src[i] === '\\' && src[i + 1] === '\\') {
      flush(); pushHtml('<span class="m-br"></span>'); i += 2; continue;
    }

    // 环境：cases / aligned / matrix / array（只求可读，不追求完整排版）
    let m = /^\\begin\{([a-zA-Z*]+)\}/.exec(rest);
    if (m) {
      flush();
      const env = m[1];
      i += m[0].length;
      if (env === 'array') { const spec = readGroup(src, i); i = spec.next; }
      const endTag = `\\end{${env}}`;
      const end = src.indexOf(endTag, i);
      const body = end < 0 ? src.slice(i) : src.slice(i, end);
      i = end < 0 ? src.length : end + endTag.length;
      const rows = body.split(/\\\\/).map((r) => r
        .replace(/^\s*\[[^\]]*\]\s*/, '')
        .trim()).filter(Boolean);
      const cls = `m-env m-${env.replace(/[^a-zA-Z0-9]/g, '')}`;
      const rowHtml = (r) => r.split('&').map((cell) => {
        const c = cell.trim();
        return `<span class="m-env-cell">${c ? mathInner(c) : '&nbsp;'}</span>`;
      }).join('<span class="m-env-gap"></span>');
      const rowsHtml = rows.map((r) => `<span class="m-env-row">${rowHtml(r)}</span>`).join('');
      // 方程组/分段函数用真正的可伸缩大括号；不能再拿 border-left 冒充
      if (/^d?cases$/.test(env)) {
        pushHtml(`<span class="m-env m-cases">${delimSvg('{')}<span class="m-env-rows">${rowsHtml}</span></span>`);
      } else {
        pushHtml(`<span class="${cls}">${rowsHtml}</span>`);
      }
      continue;
    }
    if (/^\\end\{[^}]*\}/.test(rest)) { i += rest.match(/^\\end\{[^}]*\}/)[0].length; continue; }

    // 文本/字体命令：\text{中文}、\mathrm{d}、\mathbf{v} 等
    m = /^\\(text|textrm|textnormal|mathrm|mathbf|mathit|mathsf|mathtt|operatorname|mbox)\s*/.exec(rest);
    if (m) {
      flush();
      i += m[0].length;
      const g = readGroup(src, i); i = g.next;
      const cmd = m[1];
      const cls = cmd === 'operatorname' ? 'm-fn'
        : cmd === 'mathrm' ? 'm-rm'
        : cmd === 'mathbf' ? 'm-rm m-bold'
        : cmd === 'mathit' ? 'm-rm m-italic'
        : cmd === 'mathsf' ? 'm-text m-sans'
        : cmd === 'mathtt' ? 'm-text m-mono'
        : 'm-text';
      pushHtml(`<span class="${cls}">${mathInner(g.value)}</span>`);
      continue;
    }

    // 上划线、向量、帽子等重音
    m = /^\\(overline|underline|vec|overrightarrow|overleftarrow|hat|widehat|tilde|widetilde|dot|ddot|bar)\s*/.exec(rest);
    if (m) {
      flush();
      i += m[0].length;
      const g = readGroup(src, i); i = g.next;
      const cmd = m[1];
      const cls = cmd === 'vec' || cmd === 'overrightarrow' ? 'm-vec'
        : cmd === 'overleftarrow' ? 'm-overleft'
        : cmd === 'hat' || cmd === 'widehat' ? 'm-hat'
        : cmd === 'tilde' || cmd === 'widetilde' ? 'm-tilde'
        : cmd === 'dot' || cmd === 'ddot' ? 'm-dot'
        : cmd === 'underline' ? 'm-underline'
        : 'm-overline';
      pushHtml(`<span class="${cls}">${mathInner(g.value)}</span>`);
      continue;
    }

    // 组合数
    m = /^\\binom\s*/.exec(rest);
    if (m) {
      flush(); i += m[0].length;
      const a = readGroup(src, i); i = a.next;
      const b = readGroup(src, i); i = b.next;
      pushHtml(`<span class="m-bin"><span class="m-bin-paren">(</span><span class="m-bin-stack"><span class="m-bin-top">${mathInner(a.value)}</span><span class="m-bin-bot">${mathInner(b.value)}</span></span><span class="m-bin-paren">)</span></span>`);
      continue;
    }

    // 模运算
    m = /^\\pmod\s*/.exec(rest);
    if (m) {
      flush(); i += m[0].length;
      const g = readGroup(src, i); i = g.next;
      pushHtml(`<span class="m-pmod">(mod ${mathInner(g.value)})</span>`);
      continue;
    }

    // 数集 \mathbb{R} → ℝ
    m = /^\\mathbb\s*/.exec(rest);
    if (m) {
      flush(); i += m[0].length;
      const g = readGroup(src, i); i = g.next;
      const BB = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' };
      const txt = String(g.value).replace(/[A-Za-z]/g, (c) => BB[c] || c);
      pushHtml(`<span class="m-bb">${mathTextHtml(txt)}</span>`);
      continue;
    }

    // 分式
    m = /^\\(?:d|t)?frac/.exec(rest);
    if (m) {
      flush();
      i += m[0].length;
      const x = readGroup(src, i); i = x.next;
      const y = readGroup(src, i); i = y.next;
      pushHtml(`<span class="m-frac"><span class="m-num">${mathInner(x.value)}</span><span class="m-den">${mathInner(y.value)}</span></span>`);
      continue;
    }

    // 根号（含 n 次根）
    m = /^\\sqrt/.exec(rest);
    if (m) {
      flush();
      i += 5;
      let idx = '';
      if (src[i] === '[') {
        const close = src.indexOf(']', i);
        if (close > -1) { idx = src.slice(i + 1, close); i = close + 1; }
      }
      const g = readGroup(src, i); i = g.next;
      // 类名只用 m-sqrt / m-sqrt-n 这种纯连字符，绝不再拼进任何变量
      pushHtml(`<span class="m-sqrt${idx ? ' m-sqrt-n' : ''}">${idx ? `<span class="m-idx">${mathInner(idx)}</span>` : ''}<span class="m-radic"></span><span class="m-rad">${mathInner(g.value)}</span></span>`);
      continue;
    }

    // 上下标
    if (src[i] === '^' || src[i] === '_') {
      const isSup = src[i] === '^';
      const g = readScriptGroup(src, i + 1);
      i = g.next;
      const asScript = toScript(g.value, isSup ? MATH_SUPS : MATH_SUBS);
      if (asScript) { buf += asScript; continue; }
      flush();
      pushHtml(`<${isSup ? 'sup' : 'sub'}>${mathInner(g.value)}</${isSup ? 'sup' : 'sub'}>`);
      continue;
    }

    buf += src[i];
    i += 1;
  }
  flush();
  return parts;
}

function unparen(t) {
  const s = String(t).trim();
  if ((s.startsWith('(') && s.endsWith(')')) || (s.startsWith('{') && s.endsWith('}'))) return s.slice(1, -1);
  return s;
}

// 反斜杠写在箭头符号前面（\↑、\→）是模型常犯的小错，公式里会漏出一个孤零零的 \
function stripStraySlash(t) {
  return String(t).replace(/\\(?=\s*[↑↓←→⇌⇋↔⇄])/g, '');
}

function mathInner(input) {
  return mathParts(stripStraySlash(input)).map(p => (p.k === 'h' ? p.v : mathTextHtml(p.v))).join('');
}

function mathHtml(expr, block = false) {
  return `<span class="math${block ? ' math-block' : ''}">${mathInner(expr)}</span>`;
}

/* 反应条件统一成课本写法：单独的“加热”一律排成 △，其他条件原样保留 */
function normCond(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, '');
  if (/^(加强热|高温加热|高温煅烧)$/.test(flat)) return '高温';
  if (/^(加热|受热|微热|加热条件|加热反应|加热至|△加热|加热△)$/.test(flat)) return '△';
  return raw;
}

/* 条件分栏：催化剂（MnO2、V2O5、浓硫酸…）压在等号上方；
   △ / 通电 / 高温 / 点燃这些写在等号下方；整条只有一个非催化剂条件时，仍写在等号上方 */
function isCatalystCond(t) {
  if (!t) return false;
  if (/^催化剂$/.test(t)) return true;
  if (/^(浓硫酸|浓H2SO4)$/i.test(t)) return true;
  return /^[A-Za-z0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹().·+\-]+$/.test(t) && /[A-Za-z]/.test(t);
}

function condParts(text) {
  const tokens = String(text == null ? '' : text)
    .split(/[\/｜|、,，;；]+/)
    .map(x => normCond(x))
    .filter(Boolean);
  const cat = tokens.filter(isCatalystCond);
  const other = tokens.filter(t => !isCatalystCond(t));
  if (!cat.length) return { up: other.join('、'), down: '' };
  return { up: cat.join('、'), down: other.join('、') };
}

// 条件里的化学式（MnO2、V2O5）把数字排成下标，和两侧式子保持同一套写法
function condHtml(t) {
  return String(t == null ? '' : t).replace(/([A-Za-z)])([0-9]+)/g, '$1<sub>$2</sub>');
}

// 整段只是一个化学式（H2O、Na₂O₂、Fe3+、Ca(OH)2）而不是公式：交给化学排版
function bareFormula(body) {
  let t = String(body || '').replace(/[{}]/g, '').replace(/\\[a-zA-Z]+/g, '').replace(/\s+/g, '');
  if (!t || t.length > 24) return false;
  t = t.replace(/_/g, '');
  if (!/^[0-9]*[A-Z]/.test(t)) return false;
  if (!/^[0-9A-Za-z₀-₉⁰-⁹⁺⁻+\-()\[\]·.]*$/.test(t)) return false;
  const els = t.match(/[A-Z][a-z]?/g) || [];
  if (!els.length) return false;
  if (!els.every(e => CHEM_ELEMENTS.has(e) || CHEM_ELEMENTS.has(e[0]))) return false;
  // 单元素没数字（N、O）当变量处理，不动它；有数字（O2、Cl2）或两个以上元素才当化学式
  const digits = /[0-9₀-₉]/;
  if (els.length === 1 && !digits.test(t.replace(/^[0-9]+/, ''))) return false;
  return true;
}

/* 化学方程式：把 [[chem:...]] 渲染成专属排版
   支持：元素+下标（H2O → H₂O）、电荷（SO4^2-）、反应箭头 ^→ 与箭头上条件（用 [条件] 写在箭头后）
   例：2H2 + O2 -[点燃]-> 2H2O */
export function chemHtml(input) {
  let src = String(input || '')
    .replace(/\\rightleftharpoons/g, '⇌')
    .replace(/\\rightarrow|\\to/g, '→')
    .replace(/<=>/g, '⇌')
    // 兼容模型常写的“—△→ / —MnO₂→ / —通电→”，统一成等号上方条件
    .replace(/[—–]\s*([^→\n]{1,16}?)\s*(?:→|->)/g, '=[$1] ')
    .replace(/-\[([^\]]+)\]->/g, '=[$1] ')
    .replace(/->/g, '→')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = [];

  // 反应符号识别：= 等号；== 或 ⇌ 可逆；-> → 一律显示成等号（课本习惯）
  // 条件写在方括号里：=[点燃]  或  =[点燃/生成水]（斜杠前是上方，后是下方）
  // 注意：不要在这里吃反应物末尾的“-”，否则 OH-、Cl- 的电荷会被误当成箭头的一部分。
  const scan = /\s*(={1,2}|→|⇌)\s*(?:\[([^\]]*)\])?\s*/g;
  let last = 0, m;
  while ((m = scan.exec(src))) {
    const before = src.slice(last, m.index);
    if (before.trim()) out.push(molHtml(before));
    const rawSym = m[1];
    const sym = (rawSym === '==' || rawSym === '⇌') ? '⇌' : '=';
    const cnd = String(m[2] || '').trim();
    if (cnd) {
      const { up, down } = condParts(cnd);
      const bar = sym === '='
        ? '<span class="c-arrow c-eq c-eqbar" aria-label="＝"></span>'
        : `<span class="c-arrow c-eq">${sym}</span>`;
      out.push(`<span class="c-cond">${up ? `<span class="c-txt">${condHtml(up)}</span>` : ''}` +
        bar +
        `${down ? `<span class="c-below">${condHtml(down)}</span>` : ''}</span>`);
    } else {
      out.push(sym === '='
        ? '<span class="c-op c-eq c-eqbar" aria-label="＝"></span>'
        : `<span class="c-op c-eq">${sym}</span>`);
    }
    last = m.index + m[0].length;
  }
  const tail = src.slice(last);
  if (tail.trim()) out.push(molHtml(tail));
  return `<span class="m-chem">${out.join('')}</span>`;
}

// 分子式：元素大写开头 + 下标 + 电荷上标；系数与加号照原样
// 每个物质各包一层 .c-mol（data-f 是干净式子）：点它就能查物理性质 / 化学性质
function molHtml(raw) {
  const parts = [];
  let seg = '', i = 0, elements = 0, plain = '';
  const flush = () => {
    if (seg) {
      const key = plain.replace(/[↑↓\s"]/g, '');
      parts.push(key ? `<span class="c-mol" data-f="${key}">${seg}</span>` : seg);
    }
    seg = ''; plain = ''; elements = 0;
  };
  while (i < raw.length) {
    const ch = raw[i];
    if (/[A-Z]/.test(ch)) {
      let sym = ch; i++;
      if (i < raw.length && /[a-z]/.test(raw[i])) { sym += raw[i]; i++; }
      elements++;
      plain += sym;
      seg += `<span class="c-el">${sym}</span>`;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < raw.length && /[0-9]/.test(raw[i])) { num += raw[i]; i++; }
      // 方程式最前面的 2H2O、3O2 是系数，不是下标；元素后面的才是下标。
      const prev = raw[i - num.length - 1] || '';
      const next = raw[i] || '';
      const atStart = !prev || /[\s(+]/.test(prev);
      // Fe3+ / Cu2+：单一元素后面的数字是电荷；NH4+ 这种多元素里的数字仍是下标。
      const sign = raw[i] === '+' || raw[i] === '-';
      const afterSign = raw[i + 1] || '';
      plain += num;
      if (sign && elements === 1 && (!afterSign || /[\s=+→⇌,;]/.test(afterSign))) {
        plain += raw[i];
        seg += `<sup>${num}${raw[i] === '-' ? '−' : '+'}</sup>`;
        i++;
      } else if (atStart && /[A-Z(]/.test(next)) seg += `<span class="c-coef">${num}</span>`;
      else seg += `<sub>${num}</sub>`;
      continue;
    }
    if (ch === '^') {
      let val = '', j = i + 1;
      if (raw[j] === '{') {
        const g = readGroup(raw, j);
        val = g.value;
        j = g.next;
      } else {
        while (j < raw.length && /[0-9+\-−＋]/.test(raw[j])) { val += raw[j]; j++; }
      }
      val = String(val || '').replace(/[−–—]/g, '-').replace(/＋/g, '+');
      plain += val || '+';
      seg += `<sup>${val || '+'}</sup>`;
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-') {
      const prev = raw[i - 1] || '';
      const next = raw[i + 1] || '';
      const bareCharge = /[A-Za-z0-9)\]]/.test(prev) && (!next || /[\s=+→⇌,;]/.test(next));
      if (bareCharge) {
        plain += ch;
        seg += `<sup>${ch === '-' ? '−' : '+'}</sup>`;
      } else if (ch === '+') {
        // 加号是反应物之间的连接符：先把上一个物质封口
        flush();
        parts.push('<span class="c-op">+</span>');
      } else {
        plain += ch;
        seg += '−';
      }
      i++;
      continue;
    }
    if (ch === ' ') { plain += ' '; seg += ' '; i++; continue; }
    if (ch === '(' || ch === ')') { plain += ch; seg += `<span class="c-op">${ch}</span>`; i++; continue; }
    plain += ch; seg += ch; i++;
  }
  flush();
  return parts.join('');
}

/* 状态词并进化学式（明轩 2026-10-30）
   以前这条只在学习中心调 linkChem() 时才生效，聊天、历史、刷题各有各的路径，
   于是「Na₂O₂粉末」在聊天里点开只有 Na₂O₂，「中文后缀不识别」就是这里漏的。
   现在直接在渲染出的 HTML 上合并：凡是 .c-mol 后面紧跟状态词，就地并进去，
   所有渲染面（聊天/历史/学习/课程/刷题）一次同步，谁也不用再单独记得调 linkChem。 */
const CHEM_STATE_WORD = '(?:\\s?)(?:的)?(?:稀|浓|饱和|澄清|石灰)?(?:水溶液|溶液|气体|粉末|固体|晶体|蒸气|液体|块状|粉末状|浊液|悬浊液)';
const CHEM_STATE_HEAD = new RegExp('^' + CHEM_STATE_WORD);

export function foldChemState(html) {
  const s = String(html || '');
  if (s.indexOf('class="c-mol"') < 0) return s;
  let out = '', i = 0;
  while (i < s.length) {
    const at = s.indexOf('<span class="c-mol"', i);
    if (at < 0) { out += s.slice(i); break; }
    const openEnd = s.indexOf('>', at);
    if (openEnd < 0) { out += s.slice(i); break; }
    // 找这个 span 的配对闭合标签（内容里还有 c-el / sub 等嵌套 span）
    let depth = 0, close = -1;
    const tag = /<span\b|<\/span>/g;
    tag.lastIndex = at;
    let t;
    while ((t = tag.exec(s))) {
      if (t[0] === '</span>') { if (--depth === 0) { close = t.index; break; } } else depth++;
    }
    if (close < 0) { out += s.slice(i); break; }
    const head = s.slice(at, openEnd + 1);
    const inner = s.slice(openEnd + 1, close);
    // 化学式外面还套着 .m-chem，闭合标签得先跳过，才看得见后面的「粉末」
    let p = close + 7, closes = '';
    while (s.startsWith('</span>', p)) { closes += '</span>'; p += 7; }
    const m = /data-s=/.test(head) ? null : s.slice(p).match(CHEM_STATE_HEAD);
    if (!m) { out += s.slice(i, close + 7); i = close + 7; continue; }
    const st = m[0];
    out += s.slice(i, at) + head.replace('class="c-mol"', `class="c-mol" data-s="${st.trim().replace(/^的/, '')}"`)
      + inner + `<span class="c-tail">${st.trim()}</span>` + '</span>' + closes;
    i = p + st.length;
  }
  return out;
}

/* 化学式点词：把紧跟其后的「溶液 / 气体 / 粉末 / 固体 …」并进同一个可点单元，
   点「Na₂O₂粉末」等于点 Na₂O₂，弹框里带上这个状态。 */
const CHEM_STATE_RE = /^(?:的)?(?:稀|浓|饱和|澄清)?(?:水溶液|石灰水|溶液|气体|粉末|固体|晶体|蒸气|液体|块状|粉末状)/;
export function linkChem(root) {
  if (!root || !root.querySelectorAll) return root;
  const mols = root.querySelectorAll('.c-mol:not([data-linked])');
  for (const mol of mols) {
    mol.dataset.linked = '1';
    let next = mol.nextSibling;
    while (next && next.nodeType === 3 && !String(next.nodeValue || '').trim()) next = next.nextSibling;
    if (!next || next.nodeType !== 3) continue;
    const txt = String(next.nodeValue || '');
    const m = txt.match(CHEM_STATE_RE);
    if (!m) continue;
    const tail = document.createElement('span');
    tail.className = 'c-tail';
    tail.textContent = m[0];
    mol.appendChild(tail);
    mol.dataset.s = m[0].replace(/^的/, '');
    next.nodeValue = txt.slice(m[0].length);
  }
  return root;
}

function sepDot() {
  const d = document.createElement('span');
  d.className = 'who-sep';
  d.textContent = '·';
  return d;
}

function buildTime(msg) {
  const t = document.createElement('div');
  t.className = 'msg-time';
  t.textContent = fmtTime(msg && (msg.createdAt || msg.created_at) || Date.now());
  return t;
}

export function buildWho(msg, name) {
  const who = document.createElement('div');
  who.className = 'who';

  const nameEl = document.createElement('span');
  nameEl.className = 'who-name';
  nameEl.textContent = document.documentElement.dataset.assistantName || '虾虾';
  who.appendChild(nameEl);

  who.appendChild(sepDot());

  const timeEl = document.createElement('span');
  timeEl.className = 'who-time';
  timeEl.textContent = fmtTime(msg && (msg.createdAt || msg.created_at) || Date.now());
  who.appendChild(timeEl);

  who.appendChild(sepDot());

  const actions = document.createElement('span');
  actions.className = 'msg-actions';

  const plain = ((msg && msg.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  const q = document.createElement('button');
  q.className = 'msg-action';
  q.type = 'button';
  q.textContent = '引用';
  q.addEventListener('click', (e) => {
    e.stopPropagation();
    if (quoteHandler) quoteHandler({ text: plain.slice(0, 500), messageId: msg && msg.id }, q);
  });
  actions.appendChild(q);
  actions.appendChild(sepDot());

  const del = document.createElement('button');
  del.className = 'msg-action danger';
  del.type = 'button';
  del.textContent = '删除';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    if (deleteHandler) deleteHandler(msg && msg.id, who.parentElement);
  });
  actions.appendChild(del);

  who.appendChild(actions);
  return who;
}

export function renderMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${msg.role === 'user' ? 'user' : 'assistant'} m-fade-up`;
  wrap.dataset.messageId = msg.id || '';

  if (msg.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if ((msg.blocks || []).some(b => b.type === 'image' || b.type === 'audio')) bubble.classList.add('has-media');
    for (const b of msg.blocks || []) {
      if (b.type === 'quote') {
        const q = document.createElement('div');
        q.className = 'quote';
        q.textContent = b.text;
        bubble.appendChild(q);
      } else if (b.type === 'text') {
        const p = document.createElement('div');
        p.textContent = b.text;
        bubble.appendChild(p);
      } else if (b.type === 'image') {
        const img = document.createElement('img');
        img.className = 'msg-image';
        img.src = b.url;
        img.alt = b.alt || '';
        img.loading = 'lazy';
        bubble.appendChild(img);
      } else if (b.type === 'audio') {
        bubble.appendChild(renderVoiceBar(b));
      }
    }
    wrap.appendChild(bubble);
    wrap.appendChild(buildTime(msg));
    return wrap;
  }

  wrap.appendChild(buildWho(msg));

  const body = document.createElement('div');
  body.className = 'body';
  for (const b of msg.blocks || []) body.appendChild(renderBlock(b));
  wrap.appendChild(body);
  return wrap;
}

function renderVoiceBar(block) {
  const bar = document.createElement('div');
  bar.className = 'voice-bar';
  bar.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10-6.5-10-6.5z"/></svg>
    <span class="dur">${Math.max(1, Math.round(block.duration || 1))}″</span>
    <span class="wave">${'<i></i>'.repeat(9)}</span>`;
  let audioEl = null;
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audioEl) audioEl = new Audio(block.url);
    if (audioEl.paused) { audioEl.play(); bar.classList.add('playing'); }
    else { audioEl.pause(); bar.classList.remove('playing'); }
    audioEl.onended = () => bar.classList.remove('playing');
  });
  return bar;
}

// 画图工具懒加载（blocks.js 与 study.js 都要用，但不能静态互引）
let _drawMod = null;
function drawMod() { return _drawMod; }
export function setDrawModule(mod) { _drawMod = mod; }

function splitDrawSafe(text) {
  const m = drawMod();
  if (m && m.splitDraw) { try { return m.splitDraw(text); } catch (_) {} }
  return [{ kind: 'text', value: text }];
}

function renderDrawSafe(spec) {
  const m = drawMod();
  if (m && m.renderDraw) return m.renderDraw(spec);
  const d = document.createElement('div');
  d.className = 'draw-fallback';
  d.textContent = '这张图没画出来。';
  return d;
}

export function renderBlock(block) {
  const type = block.type;
  switch (type) {
    case 'text': {
      const el = document.createElement('div');
      el.className = 'text';
      el.dataset.blockId = block.id;
      // v0.9.3：主聊天里模型偶尔直接吐出画图 JSON，这里也拆出来画成图，不再当代码显示
      const parts = splitDrawSafe(block.text);
      if (parts.some(x => x.kind === 'draw')) {
        for (const part of parts) {
          if (part.kind === 'draw') {
            try { el.appendChild(renderDrawSafe(part.value)); } catch (_) {}
          } else if (String(part.value || '').trim()) {
            const d = document.createElement('div');
            d.innerHTML = renderMarkdown(part.value);
            el.appendChild(d);
          }
        }
      } else {
        el.innerHTML = renderMarkdown(block.text);
      }
      // 化学式后面跟着「粉末/溶液/气体」这类词，一起算作可点单元
      try { linkChem(el); } catch (_) {}
      return el;
    }
    case 'quote': {
      const el = document.createElement('div');
      el.className = 'quote';
      el.dataset.blockId = block.id;
      el.textContent = block.text;
      return el;
    }
    case 'followups': return renderFollowups(block);
    case 'music': return renderCard(block, ICON.music, block.title, block.artist || block.platform || '', block.cover);
    case 'news': return renderCard(block, ICON.news, block.title, block.summary || block.source || '');
    case 'article': return renderCard(block, ICON.article, block.title, block.excerpt || '文章');
    case 'link': return renderCard(block, ICON.link, block.title, block.desc || '');
    case 'image': {
      const el = document.createElement('img');
      el.className = 'card';
      el.dataset.blockId = block.id;
      el.src = block.url;
      el.alt = block.alt || '';
      el.style.width = '100%';
      el.style.objectFit = 'cover';
      return el;
    }
    case 'quota': {
      // 礼物卡：点开是磨砂礼物界面，跟微信礼物第二屏一个路数
      if (block.action === 'gift' || block.title) return renderGiftCard(block);
      const el = document.createElement('div');
      el.className = 'quota-inline';
      el.dataset.blockId = block.id;
      el.textContent = `${block.used} / ${block.limit}`;
      el.style.cssText = 'font-size:calc(var(--fs-md) * 0.8);color:var(--muted);margin-top:8px';
      return el;
    }
    default: {
      // 未知类型：静默降级，绝不抛错、绝不占位
      const el = document.createElement('div');
      el.hidden = true;
      return el;
    }
  }
}

function hiddenFollowups() {
  const el = document.createElement('div');
  el.hidden = true;
  return el;
}

function renderFollowups(block) {
  const list = document.createElement('div');
  list.className = 'followups';
  list.dataset.blockId = block.id;
  list.dataset.action = 'send';

  // 不再补固定例句：给几条就渲染几条，绝不用“再说详细一点”这类空话凑数
  const items = [...(block.items || [])].map(x => String(x || '').trim()).filter(Boolean).slice(0, 3);
  if (!items.length) return hiddenFollowups();

  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'followup m-press';
    btn.type = 'button';
    btn.dataset.action = 'send';
    btn.dataset.blockId = block.id;
    // 居中胶囊：文字 + 尾部小箭头
    const label = document.createElement('span');
    label.textContent = item;
    btn.appendChild(label);
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '\u2197';
    btn.appendChild(arrow);
    // 关键：发送动作绑定在按钮自己身上，点了只发这一条，发过就封掉
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.used === '1') return;
      // 点中的那条飞向输入框变成自己的气泡，其余两条原地收起
      list.querySelectorAll('.followup').forEach((x) => {
        x.dataset.used = '1';
        if (x !== btn) x.classList.add('leaving');
      });
      document.dispatchEvent(new CustomEvent('block:action', {
        detail: { action: 'send', text: item, blockId: block.id, messageId: list.dataset.messageId || null, fromEl: btn },
      }));
    });
    // 动画在挂载后由 playFollowIn() 统一启动（元素还没进 DOM 时调用 animate 不保证播放）
    btn.dataset.finIndex = String(i);
    list.appendChild(btn);
  });
  // 下一帧再跑，保证元素已经在文档里、有布局
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => playFollowIn(list));
  else setTimeout(() => playFollowIn(list), 0);
  return list;
}

// 三条依次浮起：用 CSS 类驱动，不依赖 WAAPI（WAAPI 在部分微信 WebView 里静默不播）
// 先把元素设为不可见，强制回流读出起始态，再加类播放，保证浏览器一定看到"变化"
export function playFollowIn(root) {
  const nodes = [...(root || document).querySelectorAll('.followup')];
  nodes.forEach((el, i) => {
    el.classList.remove('fin');
    el.style.animationDelay = (i * 80) + 'ms';
    el.style.visibility = 'hidden';
    void el.offsetHeight; // 强制回流，让浏览器认定起始状态已生效
    el.style.visibility = '';
    el.classList.add('fin');
  });
}



// emoji → Apple 官方图像（本地已下载，不依赖系统字体，安卓也长一样）
const APPLE_EMOJI = {
  '🎁': 'gift', '🌕': 'moon', '🌝': 'moon', '🥮': 'mooncake', '🎉': 'party', '✨': 'sparkles',
  '🚌': 'bus', '🦐': 'shrimp', '🦞': 'shrimp', '🧧': 'envelope', '🎫': 'ticket', '⭐': 'star',
  '🌟': 'glow', '🎊': 'confetti', '🎆': 'fireworks', '🍭': 'lollipop', '🍫': 'chocolate',
  '👑': 'crown', '💵': 'money', '🪙': 'coin', '🔑': 'key', '🍵': 'tea', '☕': 'coffee',
  '🎂': 'cake', '🍀': 'clover', '💎': 'gem', '🎈': 'balloon', '🧸': 'bear', '🚀': 'rocket',
  '🌙': 'crescent', '🐇': 'rabbit',
  // 节日表情一律用 Apple 官方图（安卓/微信里不会变成本地字体）
  '🎃': '1f383', '👻': '1f47b', '⚡': '26a1',
  '🦇': '1f987', '🍬': '1f36c', '🧟': '1f9df', '🧛': '1f9db', '🧙': '1f9d9',
  '🔮': '1f52e', '🦴': '1f9b4', '🪦': '1faa6', '🎇': '1f387',
  '🎄': '1f384', '🎅': '1f385', '⛄': '26c4', '🔔': '1f514', '🎀': '1f380',
  '🧦': '1f9e6', '🦌': '1f98c', '🍾': '1f37e',
  '🧨': '1f9e8', '🏮': '1f3ee', '🐉': '1f409', '🐲': '1f432', '🥟': '1f95f',
  '🍊': '1f34a', '🥳': '1f973', '🪅': '1fa85',
  '🌹': '1f339', '💐': '1f490', '💝': '1f49d', '💌': '1f48c',
  '🌾': '1f33e', '🏆': '1f3c6', '🥂': '1f942', '🍰': '1f370', '🥇': '1f947',
  '🎓': '1f393', '📚': '1f4da', '🧠': '1f9e0', '💡': '1f4a1', '🔥': '1f525',
};

export function appleEmojiHtml(ch, cls = '') {
  const key = APPLE_EMOJI[ch];
  const raw = escapeHtml(ch || '🎁');
  if (!key) return `<span class="apple-emoji-fallback ${cls}">${raw}</span>`;
  return `<img class="apple-emoji ${cls}" src="/assets/apple/${key}.png" alt="${raw}" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'apple-emoji-fallback ${cls}',textContent:'${raw}'}))">`;
}

/* ---------- 额度礼物卡 ---------- */
const CLAIMED_GIFTS_KEY = 'minxtok.claimedGifts';
function readClaimedGifts() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAIMED_GIFTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}
export function markGiftClaimed(giftId) {
  if (!giftId) return;
  try {
    const list = readClaimedGifts();
    if (list.indexOf(giftId) === -1) {
      list.push(giftId);
      localStorage.setItem(CLAIMED_GIFTS_KEY, JSON.stringify(list.slice(-200)));
    }
  } catch (_) {}
}
function isGiftClaimed(giftId) {
  return !!giftId && readClaimedGifts().indexOf(giftId) !== -1;
}
function renderGiftCard(block) {
  const claimed = block.claimed === true || isGiftClaimed(block.giftId);
  const unit = (block.unit === '点' || !block.unit) ? '额度' : block.unit;
  const fest = block.theme === 'halloween' || block.emoji === '🎃';
  const el = document.createElement('div');
  el.className = 'gift-card m-pop' + (claimed ? ' is-claimed' : '') + (fest ? ' is-halloween' : '');
  el.dataset.blockId = block.id;
  el.dataset.giftId = block.giftId || '';
  el.dataset.action = claimed ? 'none' : 'gift';
  el.innerHTML = `
    <div class="gift-card-glow"></div>
    <div class="gift-card-inner">
      ${fest ? '<div class="gift-card-tag">万圣节限定</div>' : ''}
      <div class="gift-card-emoji">${appleEmojiHtml(block.emoji || '🎁')}</div>
      <div class="gift-card-title">${escapeHtml(block.title || '明叙赠您额度')}</div>
      <div class="gift-card-amount">${Number(block.amount) || 0}<span>${escapeHtml(unit)}</span></div>
      ${block.subtitle ? `<div class="gift-card-sub">${escapeHtml(block.subtitle)}</div>` : ''}
      <div class="gift-card-btn">${claimed ? '已领取' : '点开收下'}</div>
    </div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (claimed) return;
    document.dispatchEvent(new CustomEvent('block:action', {
      detail: { action: 'gift', block, blockId: block.id },
    }));
  });
  // 节日活动卡：不用点，进聊天自己从底部升起来。一张卡只自动弹一次，重进历史不再烦人
  if (block.autoOpen && !claimed && block.giftId) {
    const k = 'minxtok.gift.auto.' + block.giftId;
    let shown = false;
    try { shown = localStorage.getItem(k) === '1'; } catch (_) {}
    if (!shown) {
      try { localStorage.setItem(k, '1'); } catch (_) {}
      setTimeout(() => {
        if (el.classList.contains('is-claimed')) return;
        document.dispatchEvent(new CustomEvent('block:action', {
          detail: { action: 'gift', block, blockId: block.id },
        }));
      }, 480);
    }
  }
  return el;
}

function renderCard(block, icon, title, sub, cover) {
  const el = document.createElement('div');
  el.className = 'card m-pop';
  el.dataset.blockId = block.id;
  el.dataset.action = block.action || 'open';
  const coverHtml = cover
    ? `<div class="cover"><img src="${escapeHtml(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
    : `<div class="cover">${icon}</div>`;
  el.innerHTML = `
    ${coverHtml}
    <div class="meta">
      <div class="t">${escapeHtml(title || '')}</div>
      <div class="s">${escapeHtml(sub || '')}</div>
    </div>`;
  if (block.type === 'music' && block.pending) {
    el.dataset.pending = '1';
    el.dataset.song = title || '';
    el.dataset.artist = sub || '';
  }

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('block:action', {
      detail: { action: block.action, block, blockId: block.id },
    }));
  });
  return el;
}

// 加载中的卡片占位：灰色闪光，等真实卡片到了再替换
export function skeletonCard(type = 'music') {
  const el = document.createElement('div');
  el.className = 'card skeleton m-pop';
  el.dataset.pending = type;
  el.innerHTML = `
    <div class="cover m-skeleton" style="width:46px;height:46px;border-radius:10px"></div>
    <div class="meta">
      <div class="m-skeleton" style="width:62%;max-width:150px;height:13px;border-radius:4px"></div>
      <div class="m-skeleton" style="width:38%;max-width:96px;height:11px;border-radius:4px;margin-top:8px"></div>
    </div>`;
  return el;
}

export function thinking(label) {
  const el = document.createElement('div');
  el.className = 'm-thinking';
  el.innerHTML = '<span class="th-label"></span><span class="th-dots"><i></i><i></i><i></i></span>';
  if (label) setThinkingLabel(el, label);
  return el;
}

// 三个点上方的「AI 概括」：换词时先糊掉再清晰，不同阶段给不同的句子
export function setThinkingLabel(el, text) {
  if (!el || !el.querySelector) return;
  const lab = el.querySelector('.th-label');
  if (!lab) return;
  const next = String(text || '').trim();
  if (lab.dataset.v === next) return;
  lab.dataset.v = next;
  clearTimeout(el.__thT);
  lab.classList.remove('th-in');
  if (!lab.textContent) {
    lab.textContent = next;
    void lab.offsetWidth;
    lab.classList.add('th-in');
    return;
  }
  lab.classList.add('th-out');
  el.__thT = setTimeout(() => {
    lab.textContent = next;
    lab.classList.remove('th-out');
    void lab.offsetWidth;
    lab.classList.add('th-in');
  }, 150);
}
