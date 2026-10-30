import { consumeQuota } from './quota.js';
// 刷题（v3.20）：按「学科 + 年级 + 难度」生成一组客观题，缓存进 KV，反复刷不重复烧模型
import { corsHeaders, json, uidOk } from './util.js';

const D_SUBJ = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  politics: '政治',
  history: '历史',
  geography: '地理',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
};

// 七档难度（前端 l1–l7），旧的 basic/medium/hard 继续兼容
const D_LEVEL = {
  l1: '易', l2: '较易', l3: '中等', l4: '中等偏难', l5: '较难', l6: '难', l7: '极难',
  basic: '易', medium: '中等', hard: '较难',
};
const D_LEVEL_MIX = {
  l1: '这一组全部是基础题，考单一概念的直接记忆与辨认。',
  l2: '这一组以基础题为主，最多一道需要两步推理。',
  l3: '这一组是常规练习难度：简单 3 道、中等 3 道、稍难 2 道。',
  l4: '这一组中等偏难：简单 1 道、中等 4 道、偏难 3 道，偏难题要绕一个弯。',
  l5: '这一组较难：中等 3 道、较难 4 道、难 1 道，多数题需要两步以上推理或一次转化。',
  l6: '这一组难：较难 3 道、难 4 道、极难 1 道，压轴题要综合两三个知识点。',
  l7: '这一组极难：全部是压轴与竞赛边缘题，需要多步推理、构造或分类讨论。',
};

// 题图可用的场景（复用 public/js/physics.js 的渲染器）
const D_FIG_SCENES = ['incline', 'forces', 'pulley', 'spring', 'circuit', 'lens', 'mirror', 'refraction',
  'person', 'lever', 'pendulum', 'ball', 'conveyor', 'elevator', 'stack', 'float', 'magnet', 'charge',
  'car', 'truck', 'bike', 'train', 'tunnel', 'force2d', 'kinematics', 'projectile', 'prism', 'efield'];

// 化学实验装置图（复用 public/js/chem.js 的渲染器）
const D_CHEM_SCENES = ['o2_kmno4', 'o2_h2o2', 'co2', 'h2', 'filtration', 'evaporation', 'distillation',
  'weighing', 'measure', 'heat_liquid', 'gas_up', 'gas_down', 'titration', 'solution', 'reduce_cuo',
  'multi_tube', 'flask', 'purify', 'flame_test', 'electrolysis', 'fountain', 'silver_mirror', 'gallery'];

const D_TTL = 7 * 24 * 3600;   // 题库过期兜底（长期不用就回收）
const D_BANK_MAX = 60;               // 每个「学科+年级+难度(+章节)」最多存 60 道
const D_BATCH = 6;                   // 每次生成 6 道（快一点，少让人干等）
const D_COUNT_MAX = 15;              // 单次最多发给前端的题数
const DRILL_TIMEOUT = 55000;

function dNorm(v) {
  return String(v == null ? '' : v).trim();
}

const D_TYPE_ZH = { choice: '单选', multi: '多选', indef: '不定项', judge: '判断', fill: '填空' };

// 按前端勾选的题型算一轮的题型配比：每种至少一道，剩下的先给单选再多选
function dTypeMix(types) {
  const want = (Array.isArray(types) ? types : []).filter(t => D_TYPE_ZH[t]);
  const list = want.length ? [...new Set(want)] : ['choice', 'multi', 'judge', 'fill'];
  const mix = {};
  let left = D_BATCH;
  list.forEach(t => { if (left > 0) { mix[t] = 1; left -= 1; } });
  const order = ['choice', 'multi', 'indef', 'judge', 'fill'].filter(t => list.includes(t));
  let k = 0;
  while (left > 0) { const t = order[k % order.length]; mix[t] = (mix[t] || 0) + 1; left -= 1; k += 1; }
  return { list, mix };
}

function dSysPrompt(subject, grade, level, scope, types) {
  const subjectName = D_SUBJ[subject] || '语文';
  const mix = dTypeMix(types).mix;
  const mixText = Object.keys(mix).map(t => D_TYPE_ZH[t] + ' ' + mix[t] + ' 道').join('、');
  const levelName = D_LEVEL[level] || '中等';
  const lines = [
    `你是中国大陆${grade}（${subjectName}）的在职老师，正在给一名学生出「${levelName}」难度的客观题。`,
    D_LEVEL_MIX[level] || D_LEVEL_MIX.l3,
    `全部题目必须严格贴合${grade}${subjectName}教材与考纲，不超纲、不夹带其他学段内容。`,
    scope && scope.chapter
      ? `本次范围收窄到：${scope.book ? scope.book + ' · ' : ''}${scope.chapter}${scope.section ? ' · ' + scope.section : ''}。只考这个范围内的内容，题干里可以出现这一节的关键概念，但不要考别的小节。`
      : '本次不限章节，按这一册的整体进度出题，各单元都要有点。',
    '输出严格的 JSON，不要 Markdown、不要代码块、不要任何解释文字，格式如下：',
    '{"items":[{"type":"choice","q":"题干","options":["选项一","选项二","选项三"],"answer":0,"why":"解析 50–90 字","tip":"易错提醒 20–40 字","tag":"知识点标签"},',
    '{"type":"multi","q":"题干（多选）","options":["A项","B项","C项","D项"],"answer":[0,2],"why":"解析","tip":"易错提醒","tag":"知识点"},',
    '{"type":"judge","q":"陈述句","answer":true,"why":"解析","tip":"易错提醒","tag":"知识点"},',
    '{"type":"indef","q":"题干（不定项）","options":["A项","B项","C项","D项"],"answer":[1,3],"why":"解析","tip":"易错提醒","tag":"知识点"},',
    '{"type":"fill","q":"含 ___ 的题干","answer":["标准答案","可接受写法"],"why":"解析","tip":"易错提醒","tag":"知识点"}]}',
    `一共出 ${D_BATCH} 道，题型配比：${mixText}。不要出不在此列的题型。`,
    '规则：',
    '1) 单选题 options 给 3 或 4 个（最多 5、最少 2），answer 是正确选项的下标（从 0 开始），干扰项要像样，不能明显凑数；',
    '1b) 多选题 options 固定 4 个，answer 是正确项下标数组（2~3 个，从 0 开始），题干末尾带「多选」；正确答案个数与位置每道都要变，',
    '   不许整组题都是前两项对（严禁八道题答案清一色 A、B）；',
    '1c) 不定项 type 用 indef：options 固定 4 个，正确答案 1~3 个（可能只有一项对，也可能三项对），题干末尾带「不定项」；',
    '2) 判断题 answer 只能是 true 或 false，题干要能一眼判真假，不要模棱两可；',
    '3) 填空题题干用三个下划线 ___ 表示空格，answer 数组第一个是标准答案，其余是等价写法（大小写、中英、单位写法不同都列出）；',
    '3b) 一道题有多个空时，题干里每个空都要写 ___（几个空就写几处），answer 第一个元素按空序用中文分号「；」把每个空的答案连起来，例如「3；-2」；单空题不要写分号；',
    '4) why 是解析，50–90 字：先说这道题考什么，再说为什么这个答案对、别的选项错在哪（或填空为什么填这个），不许写“见课本”这种空话；解析里不要用“A项/选项B”这种字母指代，直接说选项内容里的关键词；',
    '4b) tip 是易错提醒，20–40 字，写学生最容易踩的那个坑（漏条件、单位、时态、概念混用等）；没有就写空字符串；',
    '5) tag 是这道题的知识点，4–12 个字，要具体到能查书，例如「质点的概念」「牛顿第一定律」「manage 的用法」「根的判别式」；',
    '6) 数学式子一律写成 LaTeX 并放在 $ 里，方便网页渲染：根号 $\\sqrt{2}$、分数 $\\dfrac{1}{2}$、幂 $x^{2}-3x+2$、',
    '   角度 $30^\\circ$、单位 $\\mathrm{m/s^2}$；',
    '   化学式和离子一律用 Unicode 下标/上标直接写，不要用 \\mathrm，也不要包 $：H₂O、CO₂、Na⁺、Cl⁻、SO₄²⁻、Ca(OH)₂、2H₂ + O₂ =点燃= 2H₂O；',
    '   任何含反斜杠命令的表达式都必须整段包在 $ 里，题干、选项、解析、易错提醒里都不许出现裸的 \\mathrm / \\text / \\frac；',
    '7) 同一组题不要重复考同一个点，考点要散开。',
    '7b) 如果题目必须有图才说得清（斜面受力、电路、滑轮、透镜、图像题等），加一个 fig 字段：',
    '    {"fig":{"scene":"incline"}}，scene 只能从这些里选：' + D_FIG_SCENES.join('/') + '；不需要图的题不要写 fig。',
    '7c) 化学题要看装置、仪器、操作，就加化学图：{"fig":{"kind":"chem","scene":"o2_kmno4"}}，',
    '    scene 只能从这些里选：' + D_CHEM_SCENES.join('/') + '；',
    '    问「图中仪器名称」「指出装置的错误」「这套装置的作用」这类题必须配图；只考方程式、计算、概念的题不要配图。',
    '    要画单件仪器或几件仪器（辨认仪器、比较仪器）时用 {"kind":"chem","scene":"gallery","items":["酒精灯","烧杯","试管"]}，',
    '    items 里只写仪器名，可写：酒精灯/烧杯/试管/锥形瓶/量筒/集气瓶/水槽/漏斗/长颈漏斗/蒸发皿/玻璃棒/托盘天平/铁架台/圆底烧瓶/温度计/胶头滴管/药匙/冷凝管/滴定管/洗气瓶/干燥管/U形管/广口瓶/坩埚/研钵/试管架/坩埚钳/表面皿/分液漏斗/导气管，最多 10 件。',
  ];
  if (subject === 'english') {
    lines.push(
      '8) 英语这一组要覆盖：语法填空（时态、非谓语、从句连词）、词形变化（构词、单复数、比较级）、词义辨析（近义词区别）、',
      '   短语含义（动词短语、介词短语）、以及「在特定句子里的引申含义」（同一个词在不同语境中的意思）。',
      '9) 英语题干和选项用英文，why 用中文讲清语法点或词义差别。',
    );
  }
  return lines.join('\n');
}

// 反斜杠在 JSON 里只有少数几种合法转义，而 LaTeX 全是 \\frac \\sqrt \\ne \\theta
// （\\n \\t \\r \\b \\f \\u 还会被当成换行/制表/回车/退格/换页/unicode，静默改坏内容）
// 所以直接把每个反斜杠换成哨兵 \u0001，解析完再换回来，任何 LaTeX 都不会打炸解析。
const D_BS = '\u0001';
function dReviveBs(v) {
  if (typeof v === 'string') return v.split(D_BS).join('\\');
  if (Array.isArray(v)) return v.map(dReviveBs);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = dReviveBs(v[k]);
    return out;
  }
  return v;
}

function dParseJSON(text) {
  let raw = String(text || '').trim();
  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = raw.indexOf('{');
  if (a > 0) raw = raw.slice(a);
  const attempt = txt => { try { return dReviveBs(JSON.parse(txt)); } catch (_) { return null; } };
  let d = attempt(raw);
  if (d) return d;
  const safe = raw.replace(/\\/g, '\\u0001');
  d = attempt(safe);
  if (d) return d;
  d = attempt(safe.replace(/,\s*([}\]])/g, '$1'));
  if (d) return d;
  // 模型被输出上限截断时整段 JSON 不完整 → 逐个把完整的题目对象捞出来
  const items = dSalvageItems(safe).map(dReviveBs);
  return items.length ? { items } : null;
}

// 从（可能被截断的）JSON 文本里逐个抠出完整的对象
function dSalvageItems(s) {
  const out = [];
  const start = s.indexOf('[');
  if (start < 0) return out;
  let depth = 0;
  let inStr = false;
  let escNext = false;
  let objStart = -1;
  for (let i = start + 1; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (escNext) escNext = false;
      else if (c === '\\') escNext = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) objStart = i; depth += 1; continue; }
    if (c === '}') {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        const chunk = s.slice(objStart, i + 1);
        try { out.push(JSON.parse(chunk)); } catch (_) {
          try { out.push(JSON.parse(chunk.replace(/,\s*([}\]])/g, '$1'))); } catch (_2) {}
        }
        objStart = -1;
      }
      if (depth < 0) break;
    }
  }
  return out;
}

function dCleanFig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scene = dNorm(raw.scene || raw.type).toLowerCase();
  // 化学装置图：kind=chem 或 scene 命中化学场景名
  if (D_CHEM_SCENES.includes(scene)) {
    const items = Array.isArray(raw.items)
      ? raw.items.filter(x => typeof x === 'string' && x.trim()).slice(0, 10).map(x => x.trim().slice(0, 12))
      : [];
    const fig = { kind: 'chem', scene };
    if (scene === 'gallery' && items.length) fig.items = items;
    return fig;
  }
  if (!scene || !D_FIG_SCENES.includes(scene)) return null;
  const fig = { scene };
  for (const k of ['uPx', 'dir', 'n', 'series', 'state', 'angle', 'label']) {
    if (raw[k] != null && typeof raw[k] !== 'object') fig[k] = raw[k];
  }
  return fig;
}

// 打乱选项并重映射答案下标（答案可能多项）
// 选项打乱后，解析里的「A项 / 选项B / AC」也要跟着换位置，否则解析会指错选项
function dRemapLetters(text, order) {
  if (!text || !order || !order.length) return text;
  const map = {};
  order.forEach((oldIdx, newIdx) => { map[String.fromCharCode(65 + oldIdx)] = String.fromCharCode(65 + newIdx); });
  let out = String(text);
  out = out.replace(/([A-E])(\s*项)/g, (m, a, tail) => (map[a] || a) + tail);
  out = out.replace(/(选项\s*)([A-E])/g, (m, head, a) => head + (map[a] || a));
  out = out.replace(/(?<![A-Za-z])([A-E]{2,5})(?![A-Za-z])/g, letters =>
    letters.split('').map(a => map[a] || a).join(''));
  return out;
}

function dShuffleOpts(opts, ansList) {
  const order = opts.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k -= 1) {
    const j = Math.floor(Math.random() * (k + 1));
    const t = order[k]; order[k] = order[j]; order[j] = t;
  }
  const options = order.map(k => opts[k]);
  const answers = ansList.map(a => order.indexOf(a)).sort((x, y) => x - y);
  return { options, answers, order };
}

function dCleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = dNorm(raw.type).toLowerCase();
  const q = dNorm(raw.q || raw.question || raw.stem);
  if (!q) return null;
  const why = dNorm(raw.why || raw.explain || raw.analysis).slice(0, 420);
  const tip = dNorm(raw.tip || raw.trap || raw.note).slice(0, 90);
  const tag = dNorm(raw.tag || raw.point).slice(0, 18);
  const fig = dCleanFig(raw.fig);
  const base = { q, why, tip, tag, ...(fig ? { fig } : {}) };

  const pickOpts = () => {
    let opts = Array.isArray(raw.options) ? raw.options : (Array.isArray(raw.opts) ? raw.opts : []);
    opts = opts.map(o => dNorm(typeof o === 'object' ? (o.text || o.label) : o)).filter(Boolean);
    return opts.length >= 2 ? opts.slice(0, 5) : null;
  };

  if (type === 'choice' || type === 'single' || type === 'select') {
    const opts = pickOpts();
    if (!opts) return null;
    let ans = raw.answer;
    if (typeof ans === 'string') {
      const t = ans.trim();
      if (/^[A-Ea-e]$/.test(t)) ans = t.toUpperCase().charCodeAt(0) - 65;
      else ans = opts.findIndex(o => o === t);
    }
    ans = Number(ans);
    if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) return null;
    const { options, answers, order } = dShuffleOpts(opts, [ans]);
    return { ...base, why: dRemapLetters(base.why, order), type: 'choice', options, answer: answers[0] };
  }

  if (type === 'indef' || type === '不定项' || type === 'any' || type === 'multi_any') {
    const opts = pickOpts();
    if (!opts) return null;
    let ans = raw.answer;
    if (typeof ans === 'string') {
      const t = ans.trim();
      if (/^[A-Ea-e]+$/.test(t)) ans = t.toUpperCase().split('').map(c => c.charCodeAt(0) - 65);
      else ans = [opts.findIndex(o => o === t)];
    }
    if (!Array.isArray(ans)) ans = [ans];
    ans = [...new Set(ans.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < opts.length))];
    if (!ans.length || ans.length > 3) return null;
    const { options, answers, order } = dShuffleOpts(opts, ans);
    return { ...base, why: dRemapLetters(base.why, order), type: 'indef', options, answer: answers };
  }

  if (type === 'multi' || type === 'multiple' || type === 'multichoice') {
    const opts = pickOpts();
    if (!opts) return null;
    let ans = raw.answer;
    if (typeof ans === 'string') {
      const t = ans.trim();
      if (/^[A-Ea-e]+$/.test(t)) ans = t.toUpperCase().split('').map(c => c.charCodeAt(0) - 65);
      else ans = [opts.findIndex(o => o === t)];
    }
    if (!Array.isArray(ans)) ans = [ans];
    ans = [...new Set(ans.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < opts.length))];
    if (ans.length < 2) return null;
    const { options, answers, order } = dShuffleOpts(opts, ans);
    return { ...base, why: dRemapLetters(base.why, order), type: 'multi', options, answer: answers };
  }

  if (type === 'judge' || type === 'truefalse' || type === 'tf') {
    let ans = raw.answer;
    if (typeof ans === 'string') {
      const t = ans.trim().toLowerCase();
      ans = ['true', 't', '对', '正确', '√', 'yes', '是'].includes(t) ? true
        : ['false', 'f', '错', '错误', '×', 'no', '否'].includes(t) ? false : null;
    }
    if (typeof ans !== 'boolean') return null;
    return { ...base, type: 'judge', answer: ans };
  }

  if (type === 'fill' || type === 'blank' || type === 'input') {
    let ans = raw.answer;
    if (typeof ans === 'string') ans = [ans];
    if (!Array.isArray(ans)) return null;
    ans = ans.map(dNorm).filter(Boolean).slice(0, 4);
    if (!ans.length) return null;
    return { ...base, type: 'fill', answer: ans };
  }
  return null;
}

async function dGenBatch(env, subject, grade, level, scope, types) {
  if (!env.LLM_API_KEY) return [];
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const envModel = env.LLM_MODEL || 'deepseek-chat';
  // DeepSeek 的推理档在非流式下会把 token 全花在 reasoning 上、content 返回空
  // （events 表里的 drill empty 就是这么来的，一等 30 秒还出不来题）。
  // 出题是死任务，先走非思考档，空了再回落配置里的模型。
  const models = envModel === 'deepseek-chat'
    ? ['deepseek-chat']
    : /deepseek\.com/.test(base) ? ['deepseek-chat', envModel] : [envModel];
  const messages = [
    { role: 'system', content: dSysPrompt(subject, grade, level, scope, types) },
    { role: 'user', content: `请出这一组题：${grade}${D_SUBJ[subject]}，${D_LEVEL[level]}难度${scope && scope.chapter ? `，范围 ${scope.chapter}${scope.section ? ' · ' + scope.section : ''}` : ''}。只输出 JSON。` },
  ];

  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DRILL_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.65,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
        signal: ctrl.signal,
      });
      const d = await res.json();
      const txt = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
      if (!txt) {
        await dLogErr(env, 'drill empty', `${model} ${JSON.stringify(d).slice(0, 180)}`);
        continue;
      }
      const parsed = dParseJSON(txt);
      const arr = parsed && Array.isArray(parsed.items) ? parsed.items : [];
      if (!arr.length) await dLogErr(env, 'drill parse', `${model} ${txt.length}B :: ${txt.slice(0, 260)}`);
      const fr = (d.choices && d.choices[0] && d.choices[0].finish_reason) || '?';
      const usage = d.usage || {};
      if (arr.length < D_BATCH) {
        await dLogErr(env, 'drill short', `${model} arr=${arr.length}/${D_BATCH} fr=${fr} txt=${txt.length} usage=${JSON.stringify(usage)}`);
      }
      const out = [];
      for (const it of arr) {
        const q = dCleanItem(it);
        if (q && !out.some(o => o.q === q.q)) out.push(q);
      }
      if (out.length < 4) await dLogErr(env, 'drill clean', `${model} ${out.length}/${arr.length}`);
      if (out.length) return out;
    } catch (e) {
      await dLogErr(env, 'drill throw', `${model} ${String(e && e.message || e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

async function dLogErr(env, kind, detail) {
  try {
    await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
      .bind(Date.now(), 'drill_err', JSON.stringify({ kind, detail: String(detail || '').slice(0, 300) })).run();
  } catch (_) {}
}

/* ---------- 题库：每个「学科+年级+难度」攒最多 100 道，随刷随补 ---------- */
function dBankKey(subject, grade, level, scope, typeTag) {
  const tag = scope && (scope.chapter || scope.section)
    ? ':' + [scope.book || '', scope.chapter || '', scope.section || ''].join('/').replace(/\s+/g, '').slice(0, 60)
    : '';
  return `drillbank:v3:${subject}:${grade}:${level}${typeTag || ''}${tag}`;
}

function dDedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || !it.q) continue;
    const k = dNorm(it.q).replace(/\s+/g, '').slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function dLoadBank(env, key, legacyKey) {
  let raw = null;
  try { raw = await env.MINXTOK_KV.get(key, 'json'); } catch (_) {}
  let items = raw && Array.isArray(raw.items) ? raw.items : [];
  if (!items.length && legacyKey) {
    // 兼容 v3.20 的旧缓存
    try {
      const old = await env.MINXTOK_KV.get(legacyKey, 'json');
      if (old && Array.isArray(old.items)) items = old.items;
    } catch (_) {}
  }
  return dDedupe(items).slice(-D_BANK_MAX);
}

async function dSaveBank(env, key, items) {
  const list = dDedupe(items).slice(-D_BANK_MAX);
  try {
    await env.MINXTOK_KV.put(key, JSON.stringify({ items: list, at: Date.now() }), { expirationTtl: D_TTL });
  } catch (_) {}
  return list;
}

// 洗牌但保持「新题优先」：把题库后半段（较新）掺进前半段一起打乱
function dPick(items, count) {
  const arr = items.slice();
  for (let k = arr.length - 1; k > 0; k -= 1) {
    const j = Math.floor(Math.random() * (k + 1));
    const t = arr[k]; arr[k] = arr[j]; arr[j] = t;
  }
  return arr.slice(0, count);
}

export async function handleDrill(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);

  const subject = dNorm(body.subject).toLowerCase();
  const grade = dNorm(body.grade).slice(0, 12);
  const level = dNorm(body.level).toLowerCase();
  if (!D_SUBJ[subject]) return json({ error: 'invalid_subject' }, 400, cors);
  if (!grade) return json({ error: 'invalid_grade' }, 400, cors);
  const lv = D_LEVEL[level] ? level : 'medium';
  const count = Math.min(D_COUNT_MAX, Math.max(3, Number(body.count) || 10));
  const types = (Array.isArray(body.types) ? body.types : []).map(t => dNorm(t).toLowerCase())
    .filter(t => D_TYPE_ZH[t]);
  const typeTag = types.length ? ':' + [...new Set(types)].sort().join(',') : '';
  const scope = {
    book: dNorm(body.book).slice(0, 24) || '',
    chapter: dNorm(body.chapter).slice(0, 40) || '',
    section: dNorm(body.section).slice(0, 60) || '',
  };
  if (!scope.chapter) scope.section = '';
  const key = dBankKey(subject, grade, lv, scope, typeTag);
  const legacyKey = scope.chapter ? null : `drillbank:v2:${subject}:${grade}:${lv}`;

  // 出一套题算一次额度（后台补题不算，那个不是用户主动要的）
  if (body.action !== 'fill') {
    const q = await consumeQuota(env, uid, 1);
    if (!q.ok) return json({ error: 'quota_exceeded', left: q.quota ? q.quota.left : 0, message: '额度已用完，请联系管理员发放' }, 402, cors);
  }

  // 补题模式：只往题库里加一批，不返回题目
  if (body.action === 'fill') {
    let bank = await dLoadBank(env, key, legacyKey);
    if (bank.length >= D_BANK_MAX) return json({ ok: true, added: 0, size: bank.length, full: true }, 200, cors);
    const before = bank.length;
    // 只跑一轮：两轮串着跑会把浏览器连接占死，切科目就像卡住
    const fresh = await dGenBatch(env, subject, grade, lv, scope, types);
    if (fresh.length) bank = await dSaveBank(env, key, bank.concat(fresh));
    return json({ ok: true, added: bank.length - before, size: bank.length, full: bank.length >= D_BANK_MAX }, 200, cors);
  }

  let bank = body.refresh ? [] : await dLoadBank(env, key, legacyKey);

  // 题库不够就先补：模型一次常只写 4~6 道，最多补两轮，总时长压在 55 秒内
  // 只补一轮，先把首屏速度守住；剩下的由前端后台 fill 慢慢攒
  if (bank.length < count) {
    const fresh = await dGenBatch(env, subject, grade, lv, scope, types);
    if (fresh.length) bank = await dSaveBank(env, key, bank.concat(fresh));
  }

  if (!bank.length) {
    return json({ error: 'gen_failed', message: '这组题没出出来，再试一次' }, 502, cors);
  }

  const items = dPick(bank, count);
  return json({
    ok: true,
    subject,
    subjectName: D_SUBJ[subject],
    grade,
    level: lv,
    book: scope.book,
    chapter: scope.chapter,
    section: scope.section,
    total: bank.length,
    bankSize: bank.length,
    full: bank.length >= D_BANK_MAX,
    partial: bank.length < count,
    items,
  }, 200, cors);
}
