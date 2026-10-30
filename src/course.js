// 课程：选章节 + 选老师，老师按风格讲课（流式）
// 和刷题不同，这里不缓存、不建题库，纯粹把「教材章节 + 老师人格」拼成提示词上课
import { corsHeaders, json, uidOk } from './util.js';
import { bumpUsage } from './store.js';
import { consumeQuota } from './quota.js';
import { describeImage } from './media.js';

const C_TIMEOUT = 55000;
const CS_TIMEOUT = 26000;

// 讲课通用排版规则（与学习中心一致，数学/化学走标记）
const C_RULES = [
  '你在 MinxTok 的课程模块里当老师，正在给一个中学生上课。',
  '说话像真人老师，有口头语、有停顿、会追问，不要念课本，不要客服腔。',
  '',
  '【输出格式】',
  '1) 用「一、」「二、」「三、」这种中文小标题分节，每节 3–6 句，别写超长段。',
  '2) 数学式子一律用 $...$ 包裹，分数写 \\frac{a}{b}，根号写 \\sqrt{x}，不用 HTML 和代码块；',
  '2b) 化学式和离子用 Unicode 下标/上标直接写，不要用 \\mathrm、也不要包 $：H₂O、CO₂、Na⁺、SO₄²⁻、Ca(OH)₂；正文里绝不能出现裸的 \\mathrm / \\text 命令。',
  '3) 化学式直接写 H2O、2H2 + O2 =[点燃] 2H2O（条件写方括号里）。',
  '4) 关键点可以用 **加粗**，别整段加粗。',
  '5) 不要复述「你问的是……」，直接开讲。',
  '6) 每讲完 3–4 节就停下来，用一句话问学生要不要继续往下、要不要来道例题、或者要不要被考一下。',
  '7) 不编造教材页码、不以「作为 AI」自居。',
  '',
  '【配图规则】数学几何、物理装置、函数图像这类内容需要配图时，在回答最末尾插入且只插入一段 [[draw: 与 ]] 包裹的 JSON，前端会渲染成 SVG 图。',
  '平面几何用 [[draw:{"type":"solid2d","title":"图注10-24字","items":[{"type":"triangle","points":[[0,0],[5,0],[2,3.6]],"labels":["A","B","C"],"right":true}]}]]',
  '函数图像用 grid；定义域端点写 endpoints:true + open:[左,右] + guides:true；分段函数用 type:"piecewise"，极坐标/螺线用 type:"polar"，参数方程用 type:"parametric"。',
  '物理用 [[draw:{"type":"physics","scene":"incline","title":"图注"}]]，可用 scene：car/truck/bike/train/tunnel/incline/forces/force2d/kinematics/projectile/pulley/spring/circuit/lens/mirror/refraction/prism/efield/person/lever/pendulum/ball/conveyor/elevator/stack/float/magnet/charge；复杂电路加 mode:"bridge"|"multi"，运动学加 mode:"vt"|"xt"。',
  '化学实验装置用 [[draw:{"type":"chem","scene":"o2_kmno4","title":"图注"}]]，可用 scene：o2_kmno4（高锰酸钾制氧气）/o2_h2o2（过氧化氢制氧气）/co2（大理石与稀盐酸）/h2（锌与稀硫酸）/filtration（过滤）/evaporation（蒸发）/distillation（蒸馏）/weighing（托盘天平称量）/measure（量筒读数）/heat_liquid（试管加热液体）/gas_up（向上排空气）/gas_down（向下排空气）/titration（中和滴定）/solution（配制溶液）/reduce_cuo（氢气还原氧化铜）/multi_tube（多试管实验）/flask（烧瓶装置）/purify（洗气除杂）/flame_test（焰色试验）/electrolysis（电解实验）/fountain（喷泉实验）/silver_mirror（银镜反应）；',
  '只想画几件仪器（认仪器、辨仪器）用 [[draw:{"type":"chem","scene":"gallery","items":["酒精灯","烧杯","试管","蒸发皿"]}]]，仪器名可写酒精灯/烧杯/试管/锥形瓶/量筒/集气瓶/水槽/漏斗/长颈漏斗/蒸发皿/玻璃棒/托盘天平/铁架台/圆底烧瓶/温度计/胶头滴管/药匙/冷凝管/滴定管/洗气瓶/干燥管/U形管/广口瓶/坩埚/研钵/试管架/坩埚钳/表面皿/分液漏斗/导气管。',
  '化学实验题只要涉及制取气体、过滤、蒸发、蒸馏、称量、配制溶液、滴定、还原氧化铜、焰色试验、除杂干燥、多试管对比、电解、喷泉、银镜，就必须配一张 chem 装置图，不能只写文字。',
  '图前后必须有文字说明，不能只甩一张图；严禁用 ASCII 拼图，严禁输出画图脚本。',
];

const ACTIONS = {
  start: '第一次讲这个章节。先交代这一章要解决什么问题，再按小标题讲 3–4 节，讲完停下来问学生。',
  more: '学生说继续。接着上次没讲完的地方往下讲 3–4 节，不要重复已经讲过的内容。',
  example: '学生想听例题。给一道典型例题 + 分步讲解 + 一句「这题的关键是……」，不要给答案了事。',
  quiz: [
    '学生要你考他。只出 1 道单选题，题干写清楚，下面列 A. B. C. D. 四个选项，每题只考一个小点。',
    '不要在正文里写答案、不要写解析、不要说「答案是」。',
    '正文写完后，另起两行，严格按这个格式输出（前端靠它判分）：',
    '[[ans: 正确选项字母]]',
    '[[why: 不超过 30 字的一句话解析]]',
  ].join('\n'),
  ask: '学生在提问。直接回答他的问题，别跑题，回答完顺手把话题接回这一章。',
  simple: '学生没听懂。换一种说法把这节的核心再讲一遍：用更日常的比喻、句子短一点，别堆术语，最后用一句话收口。',
  summary: '学生要收个尾。用 3–5 条把这一节的主线串起来，每条一句话，最后补一句「记住这句就够了」。',
  harder: '学生想往深里走。在本节最吃分的那一点上给一个更难的变式或者易错陷阱，先讲思路再给结论。',
  exam: '学生想知道考什么。给 3–4 条考点：常考形式 + 最容易错的地方，别写成知识点清单。',
};

// 小节拆分：只让模型按教材目录把一章拆成小节，不参与讲课，成本很小
function cleanSections(raw) {
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    let s = String(item == null ? '' : item).replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 40) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

function parseSections(text) {
  // 模型爱套 ```json 围栏，先剥掉再解析
  const src = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/,'').trim();
  if (!src) return [];
  try {
    const j = JSON.parse(src);
    if (j && Array.isArray(j.sections)) return cleanSections(j.sections);
  } catch (_) {}
  const m = src.match(/\[[\s\S]*?\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return cleanSections(arr);
    } catch (_) {}
  }
  return cleanSections(src.split('\n').map(x => x.replace(/^[\s\d.、()（）一二三四五六七八九十-]+/, '')));
}

export async function handleCourseSections(req, env) {
  const cors = corsHeaders(env);
  if (!env.LLM_API_KEY) return json({ error: 'llm_failed', message: '小节没拆出来' }, 502, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, stage, grade, subject, book, chapter } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const ch = String(chapter || '').trim().slice(0, 60);
  if (!ch) return json({ error: 'empty_chapter' }, 400, cors);

  const info = [
    `学段年级：${String(stage || '').slice(0, 6)}${String(grade || '').slice(0, 8)}`,
    `学科：${String(subject || '').slice(0, 10)}`,
    `教材册次：${String(book || '').slice(0, 30)}`,
    `章节：${ch}`,
  ].join('\n');
  const subj = String(subject || '');
  // 语文是「单元 → 课文」，英语是「Unit → Section」，其他学科才是知识点小节，
  // 一句 prompt 通吃会让语文整章拆不出来
  // 栏目型章节（词语积累、综合性学习、写作）不是单元，要拆的是它自己的子栏目
  const column = /词语|语言|写作|综合性|整本书|诵读|梳理|探究/.test(ch);
  const guide = /语文/.test(subj)
    ? column
      ? '这一章节自己的子栏目，形如「词语积累」「词语解释」「词语运用」，不要写别的单元的课文'
      : '这一单元里的课文篇目，按教材顺序，形如「1 沁园春·长沙」「2 红烛」，只写篇名不带作者'
    : /英语/.test(subj)
      ? '教材里的 Section / Reading / Grammar 小节，形如「Section A 1a-2d」「Reading」'
      : /历史|地理|政治|道法|道德与法治|生物/.test(subj)
        ? '教材里的课或框题，形如「第1课 中华文明的起源」'
        : '知识点小节，形如「1.1 集合的概念」「2.3 匀变速直线运动的位移」';
  const messages = [
    { role: 'system', content: '你是教材目录助手。只输出 JSON，不要解释、不要代码块、不要多余文字。' },
    {
      role: 'user',
      content: `${info}\n\n请按教材目录写出${guide}。\n只输出 {"sections":["...","..."]} 这种 JSON。\n要求：3–8 条；用教材原名，不要书名号，不要写单元名本身；每条不超过 20 字；学科是语文或英语时用篇目/课次原名，别硬套「1.1」编号。章节名本身若是栏目（如「词语积累与词语解释」「综合性学习」），就按它的组成部分拆，不要返回空数组。只有确认真没有可拆内容时才返回 \"sections\":[]。`,
    },
  ];

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  // 拆好的小节进 KV，全站共用，同一章谁都不用再等第二次
  const cacheKey = 'cs:v1:' + [stage, subject, book, ch].join('|').slice(0, 160);
  try {
    const hit = await env.MINXTOK_KV?.get(cacheKey, 'json');
    if (hit && Array.isArray(hit.sections) && hit.sections.length) {
      return json({ ok: true, sections: hit.sections.slice(0, 8) }, 200, cors);
    }
  } catch (_) {}

  // 推理模式下 max_tokens 给小了会把预算全花在思考上，content 返回空字符串 —— 这就是「拆不出」的真因。
  // 所以：预算给足，且推理模型失败后回落 deepseek-chat（非思考模式，稳定吐 JSON）
  const envModel = env.LLM_MODEL || 'deepseek-chat';
  // DeepSeek 的推理档（v4-flash / reasoner）在非流式 + 小预算下经常只思考不输出，
  // 目录这种死任务用非思考档更快更稳，所以 deepseek 上先走 chat
  const models = envModel === 'deepseek-chat'
    ? ['deepseek-chat']
    : /deepseek\.com/.test(base) ? ['deepseek-chat', envModel] : [envModel];
  let sections = [];
  const fails = [];
  outer:
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CS_TIMEOUT);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: attempt ? 0.1 : 0.2,
            max_tokens: 1500,
            stream: false,
          }),
          signal: ctrl.signal,
        });
        const raw = await res.text();
        let d = {};
        try { d = JSON.parse(raw); } catch (_) {}
        const msg = (d && d.choices && d.choices[0] && d.choices[0].message) || {};
        const content = msg.content || '';
        sections = parseSections(content);
        if (!sections.length) {
          const err = (d && d.error && d.error.message) || '';
          fails.push(`${model}#${attempt + 1} http${res.status} len=${content.length} reason=${String(msg.reasoning_content || '').length} ${err} ${raw.slice(0, 60)}`);
        }
      } catch (e) {
        fails.push(`${model}#${attempt + 1} throw ${String((e && e.message) || e).slice(0, 60)}`);
      } finally {
        clearTimeout(timer);
      }
      if (sections.length) break outer;
    }
  }

  if (!sections.length) {
    try {
      await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
        .bind(Date.now(), 'cs_err', (`chapter=${ch} | ` + fails.join(' ; ')).slice(0, 500)).run();
    } catch (_) {}
    return json({ ok: false, sections: [], message: '小节没拆出来' }, 200, cors);
  }
  try {
    await env.MINXTOK_KV?.put(cacheKey, JSON.stringify({ sections }), { expirationTtl: 2592000 });
  } catch (_) {}
  return json({ ok: true, sections }, 200, cors);
}

function teacherPrompt(t) {
  const x = t || {};
  const name = String(x.name || '林老师').slice(0, 12);
  const style = String(x.style || '').slice(0, 300);
  const pace = String(x.pace || '').slice(0, 120);
  const call = String(x.call || '你').slice(0, 8);
  const lines = [`你的身份：${name}，学生的${String(x.role || '老师').slice(0, 20)}。`];
  if (style) lines.push(`你的讲课风格：${style}`);
  if (pace) lines.push(`讲课节奏与要求：${pace}`);
  lines.push(`称呼学生：${call === '你' ? '直接叫「你」，不叫名字' : `叫「${call}」`}。`);
  lines.push('风格要贯穿全程：用词、比喻、追问方式都要像这个人，不要中途变成另一个人。');
  return lines.join('\n');
}

export async function handleCourseStream(req, env) {
  const cors = corsHeaders(env);
  if (!env.LLM_API_KEY) return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, stage, grade, subject, book, chapter, section, teacher, action, text, history, image } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const act = ACTIONS[action] ? action : 'start';
  const ch = String(chapter || '').trim().slice(0, 60);
  const sec = String(section || '').trim().slice(0, 30);
  if (!ch) return json({ error: 'empty_chapter' }, 400, cors);

  const ctx = [
    `学段年级：${String(stage || '').slice(0, 6)}${String(grade || '').slice(0, 8)}`,
    `学科：${String(subject || '').slice(0, 10)}`,
    `教材册次：${String(book || '').slice(0, 30)}`,
    `当前章节：${ch}`,
    ...(sec ? [`本节小节：${sec}`] : []),
  ].join('\n');

  const sys = [C_RULES.join('\n'), teacherPrompt(teacher), '【本次课程信息】\n' + ctx, '【本次任务】\n' + ACTIONS[act]].join('\n\n');

  const messages = [{ role: 'system', content: sys }];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-4)) {
      if (!turn) continue;
      const q = String(turn.q || '').slice(0, 400);
      const a = String(turn.a || '').slice(0, 1400);
      if (q) messages.push({ role: 'user', content: q });
      if (a) messages.push({ role: 'assistant', content: a });
    }
  }
  let imageNote = '';
  if (image) {
    try {
      const desc = await describeImage(env, image);
      imageNote = desc
        ? `\n\n【学生附了一张图】${String(desc).slice(0, 2400)}。优先讲图里的题，别拿上下文旧内容硬套。`
        : '\n\n【学生附了一张图，但没认出来】别猜图里内容，直接请他重发或说说图里有什么。';
    } catch (_) {
      imageNote = '\n\n【学生附了一张图，识别失败】别猜内容，请他重发。';
    }
  }
  const ask = act === 'ask' ? String(text || '').slice(0, 600) + imageNote : (imageNote ? ('看图讲讲。' + imageNote) : '');
  messages.push({
    role: 'user',
    content: ask
      ? `学生问：${ask}`
      : (act === 'start'
        ? `开始讲「${ch}」${sec ? `里的「${sec}」这一小节` : '这一章'}。`
        : act === 'example'
          ? `来道「${sec || ch}」的例题。`
          : act === 'quiz'
            ? `考考我「${sec || ch}」。`
            : `继续讲「${sec || ch}」。`),
  });

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  // 和老师对话也要额度，一次一条
  if (uid) {
    const q = await consumeQuota(env, uid, 1);
    if (!q.ok) return json({ error: 'quota_exceeded', left: q.quota ? q.quota.left : 0, message: '额度已用完，请联系管理员发放' }, 402, cors);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), C_TIMEOUT);
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages,
        temperature: 0.75,
        max_tokens: 2400,
        stream: true,
      }),
      signal: ctrl.signal,
    });
  } catch (_) {
    clearTimeout(timer);
    return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);
  }
  // 流一旦开始就放开超时，让上游自己收尾
  setTimeout(() => clearTimeout(timer), 0);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
