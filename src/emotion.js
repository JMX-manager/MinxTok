// 情绪中心：统计最近一周聊天与日记里的情绪分布，并让虾虾给出回应
import { corsHeaders, json, uidOk } from './util.js';

// 24 类情绪：近义词全部归并到同一个 key，避免“开心/高兴/快乐”被拆成三份
export const EMOTIONS = [
  { key: 'happy', zh: '开心', en: 'Happy', char: '😃', aliases: ['开心', '高兴', '快乐', '愉快', '喜悦', '爽', '幸福', '大笑', '欢喜', 'laugh'] },
  { key: 'excited', zh: '兴奋', en: 'Excited', char: '🤩', aliases: ['兴奋', '激动', '振奋', '雀跃', '热血', '上头'] },
  { key: 'content', zh: '满足', en: 'Content', char: '😊', aliases: ['满足', '知足', '惬意', '舒心', '踏实', '安稳'] },
  { key: 'love', zh: '喜欢', en: 'Loving', char: '🥰', aliases: ['喜欢', '心动', '好感', '温柔', '在意', '爱', '恋爱', '思念'] },
  { key: 'grateful', zh: '感激', en: 'Grateful', char: '🥹', aliases: ['感激', '感谢', '感恩', '感动', '暖', '被爱'] },
  { key: 'hopeful', zh: '期待', en: 'Hopeful', char: '🤗', aliases: ['期待', '盼望', '向往', '希望', '憧憬', '盼'] },
  { key: 'amused', zh: '好笑', en: 'Amused', char: '😂', aliases: ['好笑', '哈哈', '笑死', '有趣', '乐'] },
  { key: 'calm', zh: '平静', en: 'Calm', char: '😌', aliases: ['平静', '平和', '淡定', '放松', '无感', '平淡', '安宁'] },
  { key: 'focused', zh: '专注', en: 'Focused', char: '🤓', aliases: ['专注', '投入', '做题', '认真', '沉浸', '钻研', '刷题'] },
  { key: 'curious', zh: '好奇', en: 'Curious', char: '🧐', aliases: ['好奇', '想弄明白', '追问', '感兴趣', '求知', '为什么'] },
  { key: 'bored', zh: '无聊', en: 'Bored', char: '🥱', aliases: ['无聊', '没意思', '闲', '发呆', '重复', '提不起劲'] },
  { key: 'silly', zh: '搞怪', en: 'Silly', char: '🤪', aliases: ['搞怪', '调皮', '玩闹', '沙雕', '逗'] },
  { key: 'cool', zh: '酷', en: 'Cool', char: '😎', aliases: ['酷', '自信', '从容', '帅气', '飒'] },
  { key: 'shy', zh: '害羞', en: 'Shy', char: '😳', aliases: ['害羞', '羞涩', '脸红', '不好意思', '羞', '腼腆'] },
  { key: 'awkward', zh: '尴尬', en: 'Awkward', char: '😅', aliases: ['尴尬', '窘', '难为情', '自嘲', '社死', '僵'] },
  { key: 'confused', zh: '困惑', en: 'Confused', char: '🤔', aliases: ['困惑', '迷惑', '不懂', '想不通', '疑惑', '迷茫'] },
  { key: 'lonely', zh: '孤独', en: 'Lonely', char: '🫥', aliases: ['孤独', '孤单', '寂寞', '没人陪', '空落'] },
  { key: 'disappointed', zh: '失望', en: 'Disappointed', char: '😞', aliases: ['失望', '遗憾', '落空', '扫兴', '心凉'] },
  { key: 'down', zh: '低落', en: 'Down', char: '😔', aliases: ['低落', '难过', '悲伤', '伤心', '郁闷', '失落', '沮丧', '哭', '委屈', '心疼'] },
  { key: 'anxious', zh: '焦虑', en: 'Anxious', char: '😰', aliases: ['焦虑', '紧张', '担心', '不安', '心慌', '忐忑'] },
  { key: 'troubled', zh: '纠结', en: 'Troubled', char: '😖', aliases: ['纠结', '犹豫', '为难', '左右为难', '挣扎', '内耗'] },
  { key: 'annoyed', zh: '烦躁', en: 'Annoyed', char: '😤', aliases: ['烦躁', '烦', '恼', '厌烦', '不耐烦', '窝火'] },
  { key: 'angry', zh: '生气', en: 'Angry', char: '😡', aliases: ['生气', '愤怒', '不爽', '火大', '讨厌', '暴怒', '恼火'] },
  { key: 'tired', zh: '疲惫', en: 'Tired', char: '😩', aliases: ['疲惫', '累', '乏', '倦', '没劲', '心累'] },
  { key: 'sleepy', zh: '困倦', en: 'Sleepy', char: '😴', aliases: ['困倦', '困', '想睡', '睡意', '昏沉'] },
  { key: 'shock', zh: '震惊', en: 'Shocked', char: '😱', aliases: ['震惊', '惊讶', '意外', '吃惊', '没想到', '震撼'] },
  { key: 'speechless', zh: '无语', en: 'Speechless', char: '🙄', aliases: ['无语', '无奈', '服了', '吐槽', '沉默'] },
];

// 情绪分组：24 个 key 太碎，直接看占比只会看到「平静一大块」。
// 按方向聚成五类，再看类里的明细（明轩 2026-10-30：分分类，详细一些）
const GROUPS = [
  { key: 'bright', zh: '舒展', en: 'Bright', members: ['happy', 'excited', 'amused', 'love', 'grateful', 'hopeful', 'silly', 'cool'] },
  { key: 'engaged', zh: '投入', en: 'Engaged', members: ['focused', 'curious'] },
  { key: 'steady', zh: '平稳', en: 'Steady', members: ['calm', 'content', 'shy', 'bored'] },
  { key: 'low', zh: '低落', en: 'Low', members: ['down', 'lonely', 'disappointed', 'tired', 'sleepy'] },
  { key: 'tense', zh: '紧绷', en: 'Tense', members: ['anxious', 'annoyed', 'angry', 'troubled', 'confused'] },
  { key: 'mixed', zh: '杂项', en: 'Mixed', members: ['awkward', 'shock', 'speechless'] },
];

// 把 24 条明细聚成 5 类，每类带自己的占比和成员明细
function buildGroups(items, denom) {
  const byKey = Object.fromEntries(items.map(it => [it.key, it]));
  const d = denom || items.reduce((n, it) => n + (it.count || 0), 0) || 1;
  const out = GROUPS.map(g => {
    const members = g.members.map(k => byKey[k]).filter(Boolean)
      .filter(it => (it.count || 0) > 0)
      .sort((a, b) => b.count - a.count);
    const count = members.reduce((n, it) => n + it.count, 0);
    return {
      key: g.key, zh: g.zh, en: g.en, count, share: count / d,
      members: members.map(it => ({ key: it.key, zh: it.zh, char: it.char, count: it.count, share: it.share })),
    };
  }).filter(g => g.count > 0);
  out.sort((a, b) => b.count - a.count);
  return out;
}

const EMO_BY_KEY = Object.fromEntries(EMOTIONS.map(e => [e.key, e]));

// 模型没吐内容时的兜底：每种情绪一段，绝不让前端停在"还在想"
const EMO_FALLBACK = {
  happy: '开心来的时候，人是松的。它不需要被抓住，也不需要被延长；你只要别急着问它什么时候走，就已经在好好待它了。',
  excited: '兴奋是身体先于语言做出的反应。它把注意力推向前方，也容易让人高估结果；留一点余地，热度才不会反噬。',
  content: '满足不是拥有得更多，而是暂时不再向外索取。它很安静，容易被忽略，却最能支撑长期的生活。',
  love: '喜欢一个人的时候，世界会往他身上偏一点。这份偏心本身没有错，记得也给自己留一点。',
  grateful: '感激让关系有了回声。被帮助过的事实不必夸大，但承认它，会让人更愿意继续对世界温柔。',
  hopeful: '期待把时间拉向未来。它可以照亮当下，也可能变成预设；把期待放在过程上，比押在结果上更稳。',
  amused: '好笑是紧绷松开的一瞬。能笑出来，说明你还没有被事情完全压住；这份松动值得保留。',
  calm: '平静不是什么都没发生，是你终于不用急着回应什么。这种状态很贵，别拿它去换热闹。',
  focused: '专注是一种把世界关小的能力。那段时间里你不必喜欢手上的事，只要它在你的正中，就已经很值。',
  curious: '好奇是脑子先于答案伸出的手。它不需要立刻有结论，愿意多问一句，路就已经比刚才宽了。',
  bored: '无聊不是空的，是心里那口气还没找到出口。它提醒你：该给生活换一点颜色了，不必等到有兴致才动。',
  silly: '搞怪是你给自己开的窗。能在紧绷的时候还愿意闹一下，说明心里那点火没灭。',
  cool: '酷不是不在乎，是知道什么值得在乎。你把力气花在该花的地方，这就够了。',
  shy: '害羞是被看见时的自我保护。它不代表退缩，只是提醒你：这一步需要一点时间，慢一点也可以。',
  awkward: '尴尬是突然被看见的那一下。它其实很轻，几秒钟就过去了，别人记住的远比你以为的少。',
  confused: '困惑说明旧解释不够用了。它不舒服，却是认知更新的前夜；先承认不知道，答案才有位置进来。',
  lonely: '孤独是关系里的空白被感知到。它不等于失败，也不要求立刻填满；先陪自己坐一会儿，再决定向谁靠近。',
  disappointed: '失望来自期待与现实的落差。期待本身没有错，错的是把它当成承诺；把落差看清楚，下一次会更准。',
  down: '低落的时候不必急着振作，情绪也有它要走完的路。你先待着，天不会因为你慢一点就塌。',
  anxious: '焦虑把未来的风险提前搬到现在。它想保护你，但常常用力过猛；把注意力收回眼前的一步，身体会先安静下来。',
  troubled: '纠结说明你在认真权衡，不是你优柔寡断。选项之间没有标准答案，选完就别回头审自己。',
  annoyed: '烦躁是边界被反复摩擦后的信号。它提醒你有些事需要被说明，而不是一味忍耐；把要求讲清楚，比压住情绪更有用。',
  angry: '生气是边界被碰到了。它值得被听见，但不值得拿别人的错来罚自己太久。',
  tired: '累不是懒，是你已经撑了很久。休息不是奖励，是必需品。',
  sleepy: '困倦是身体在要求结算。它不需要被意志力压过去；睡一觉不是浪费，是把明天的自己先照顾好。',
  shock: '震惊是旧认知裂了一道缝。缝在那儿不舒服，可光也是从那儿进来的。',
  speechless: '无语的时候，沉默就是最好的回答。不是所有荒谬都值得你认真反驳。',
};


const fallbackFor = (key, zh) => EMO_FALLBACK[key] || `「${zh}」来的时候，先别急着评价它。它只是路过，你看着它走过去就好。`;


// 把模型可能吐出来的近义词 / 英文 key / 表情，都归并到 24 类里
export function canonEmo(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  for (const e of EMOTIONS) {
    if (e.key === s) return e.key;
    if (e.zh === s || e.en.toLowerCase() === s) return e.key;
    if ((e.aliases || []).some(a => a.toLowerCase() === s)) return e.key;
    if ((e.aliases || []).some(a => a.length >= 2 && s.includes(a))) return e.key;
  }
  return null;
}

const WEEK = 7 * 86400000;

function llmUrl(env) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

async function ask(env, system, user, maxTokens = 400, timeoutMs = 8000) {
  const res = await fetch(llmUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: env.LLM_MODEL || 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.9,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const d = await res.json();
  return ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
}

const EMO_KEYS = EMOTIONS.map(e => e.key).join(' / ');

const TAG_SYSTEM =
  '给一句话或几句话打情绪标签。每条都必须给出一个最接近的情绪 key，绝不返回 null。\n' +
  'calm（平静）只用于真正放松、无事发生、心情平的时刻。做题、刷题、要讲解、算题→focused；追问原理、觉得有意思、想探究→curious；重复枯燥、提不起劲→bored。宁可给具体那一档，不要一律 calm。\n' +
  '可选情绪只有这些 key：' + EMO_KEYS + '。\n' +
  '近义词一律归并：开心/高兴/快乐→happy；期待/盼望→hopeful；孤独/孤单→lonely；焦虑/紧张→anxious；烦躁/不耐烦→annoyed；困/想睡→sleepy；悲伤/难过/伤心→down；愤怒/生气→angry；做题、问知识、日常陈述这类中性内容→calm。\n' +
  '强度 score：0.3 轻微，0.6 明显，1 强烈。\n' +
  '只输出 JSON，不要解释：{"emo":"happy","score":0.6}';

// 给一条消息打情绪标签：返回 {emo, score} 或 null。模型不给就 null，绝不猜
export async function tagEmotion(env, text) {
  const t = String(text || '').trim();
  if (!t || t.length < 2) return null;
  try {
    const res = await fetch(llmUrl(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [{ role: 'system', content: TAG_SYSTEM }, { role: 'user', content: t.slice(0, 240) }],
        temperature: 0,
        max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    const key = canonEmo(o.emo) || 'calm';
    const score = Math.max(0.2, Math.min(1, Number(o.score) || 0.5));
    return { emo: key, score };
  } catch (_) {
    return null;
  }
}

let TAG_DBG = null;
// 批量打标签：一次调用处理一批消息，补录一周的数据才不用一百多次请求
async function tagBatch(env, texts) {
  const list = texts.map((t, i) => `${i + 1}. ${String(t || '').replace(/\s+/g, ' ').slice(0, 150)}`).join('\n');
  const system = '给下面这批聊天消息逐条打情绪标签，每条都要给最接近的一个 key。\n' +
    'calm（平静）只用于真正放松、无事发生；做题/刷题/要讲解/算题→focused；追问原理、觉得有意思→curious；重复枯燥、提不起劲→bored。别一律给 calm。\n' +
    '可选 key 只有：' + EMO_KEYS + '。\n' +
    '只输出 JSON 数组，不要解释，条数必须和输入一致：' +
    '[{"i":1,"emo":"happy","score":0.6},{"i":2,"emo":"calm","score":0.3}]';
  try {
    // token 给足：一批 24 条，每条都要吐 {"i":..,"emo":..,"score":..}，给少了会被截断成半截数组
    const res = await fetch(llmUrl(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: list }],
        temperature: 0.2,
        max_tokens: 1500 + texts.length * 30,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const dj = await res.json().catch(() => null);
    const raw = ((dj && dj.choices && dj.choices[0] && dj.choices[0].message && dj.choices[0].message.content) || '').trim();
    TAG_DBG = { st: res.status, len: raw.length, fin: (dj && dj.choices && dj.choices[0] && dj.choices[0].finish_reason) || '', err: dj && dj.error ? String(dj.error.message || dj.error).slice(0, 120) : '', head: raw.slice(0, 80) };
    // 模型偶尔回 200 但正文是空的，小批重试一次，别整批丢掉
    if (!raw) return texts.length > 12 ? tagBatch(env, texts.slice(0, 12)) : [];
    let body = '';
    const a = raw.indexOf('[');
    if (a >= 0) {
      const b = raw.lastIndexOf(']');
      body = b > a ? raw.slice(a, b + 1) : raw.slice(a) + '}]';
    }
    if (!body) return [];
    let arr = [];
    try { arr = JSON.parse(body); } catch (_) {
      // 还是坏的话，把能认出来的对象一个个抠出来
      arr = [];
      const re = /\{[^{}]*"i"\s*:\s*\d+[^{}]*\}/g;
      const m = raw.match(re) || [];
      for (const one of m) { try { arr.push(JSON.parse(one)); } catch (_2) {} }
    }
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const o of arr) {
      const i = Number(o && o.i) - 1;
      if (!(i >= 0 && i < texts.length)) continue;
      const key = canonEmo(o.emo) || 'calm';
      const score = Math.max(0.2, Math.min(1, Number(o.score) || 0.4));
      out.push({ i, emo: key, score });
    }
    return out;
  } catch (_) {
    return [];
  }
}

// 把标签写进 message_emotion：只存 key + 强度，不存原文，一个用户一天几十行，成本可忽略
export async function saveMessageEmotion(env, { messageId, uid, convId, role, emo, score }) {
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO message_emotion (message_id,uid,conv_id,role,emo,score,created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(messageId, uid, convId || null, role, emo, score, Date.now()).run();
    // 不再删汇总缓存：文案是否重写交给 sig（前三名占比）判断，
    // 否则每发一句话就把建议重写一遍，看起来像情绪在乱跳（明轩 2026-10-30）
  } catch (_) { /* 打标签失败绝不影响聊天 */ }
}

// 后台任务：给刚发的这条打分并存库
export function tagAndSave(env, payload) {
  return tagEmotion(env, payload.text)
    .then(hit => hit ? saveMessageEmotion(env, { ...payload, emo: hit.emo, score: hit.score }) : null)
    .catch(() => null);
}

async function collect(env, uid) {
  const since = Date.now() - WEEK;
  const [msgs, diaries] = await Promise.all([
    env.DB.prepare('SELECT role,blocks FROM messages WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 120')
      .bind(uid, since).all(),
    env.DB.prepare('SELECT content FROM diaries WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 20')
      .bind(uid, since).all(),
  ]);
  const parts = [];
  for (const r of (msgs.results || []).reverse()) {
    try {
      const t = (JSON.parse(r.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      if (t) parts.push(`${r.role === 'user' ? '明轩' : '虾虾'}：${t}`);
    } catch (_) { /* 忽略 */ }
  }
  for (const d of diaries.results || []) {
    parts.push(`日记：${String(d.content || '').replace(/<[^>]+>/g, ' ')}`);
  }
  return parts.join('\n').slice(0, 6000);
}

// 一周内明轩自己说了多少句：判断标签覆盖率够不够，不够就别拿标签算占比
async function userMsgCount(env, uid, since) {
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE uid=? AND role='user' AND created_at>=?")
      .bind(uid, since).first();
    return Number(row && row.c) || 0;
  } catch (_) { return 0; }
}

// 只取明轩自己的话（词频兜底用，不掺虾虾的分析口吻）
async function userText(env, uid, since) {
  try {
    const r = await env.DB.prepare("SELECT blocks FROM messages WHERE uid=? AND role='user' AND created_at>=? ORDER BY created_at DESC LIMIT 200")
      .bind(uid, since).all();
    const parts = [];
    for (const row of (r.results || []).reverse()) {
      try {
        const t = (JSON.parse(row.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
        if (t) parts.push(t);
      } catch (_) { /* 跳过坏块 */ }
    }
    return parts.join('\n').slice(0, 8000);
  } catch (_) { return ''; }
}

// 标签补录：之前只用 waitUntil 打一次标签，被掐掉就永远缺这一条，
// 结果一周只剩一两条，占比不是 100% 就是没数。开情绪中心时顺手补几条（明轩 2026-10-30）
async function backfillTags(env, uid, since, limit) {
  const stat = { rows: 0, hits: 0, saved: 0, err: '' };
  try {
    const r = await env.DB.prepare(
      "SELECT m.id AS id, m.blocks AS blocks, m.conv_id AS conv_id FROM messages m " +
      "LEFT JOIN message_emotion e ON e.message_id = m.id " +
      "WHERE m.uid=? AND m.role='user' AND m.created_at>=? AND e.message_id IS NULL " +
      "ORDER BY m.created_at DESC LIMIT ?"
    ).bind(uid, since, limit).all();
    const rows = [];
    for (const row of (r.results || [])) {
      let text = '';
      try { text = (JSON.parse(row.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join(' '); } catch (_) { continue; }
      if (!text || text.length < 2) continue;
      rows.push({ id: row.id, convId: row.conv_id, text });
    }
    stat.rows = rows.length;
    if (!rows.length) return stat;
    const hits = await tagBatch(env, rows.map(x => x.text));
    stat.hits = hits.length;
    stat.raw = TAG_DBG;
    for (const hit of hits) {
      const row = rows[hit.i];
      if (!row) continue;
      await saveMessageEmotion(env, { messageId: row.id, uid, convId: row.convId, role: 'user', emo: hit.emo, score: hit.score });
      stat.saved++;
    }
  } catch (e) { stat.err = String((e && e.message) || e).slice(0, 160); }
  return stat;
}

// 按逐条标签统计（真正反映"每条消息都有心情"）
async function tallyFromTags(env, uid, since) {
  const sqlUser = "SELECT emo, COUNT(*) AS c, SUM(score) AS s FROM message_emotion WHERE uid=? AND created_at>=? AND role='user' GROUP BY emo";
  const sqlAny = 'SELECT emo, COUNT(*) AS c, SUM(score) AS s FROM message_emotion WHERE uid=? AND created_at>=? GROUP BY emo';
  let rows = ((await env.DB.prepare(sqlUser).bind(uid, since).all()).results) || [];
  // 老数据只给虾虾的回复打过标签：退回全角色，别让统计一下切到词频那套算法
  if (!rows.length) rows = ((await env.DB.prepare(sqlAny).bind(uid, since).all()).results) || [];
  if (!rows.length) return null;
  const map = {};
  let total = 0;
  for (const r of rows) {
    const key = canonEmo(r.emo);
    if (!key) continue;
    const c = Number(r.c) || 0;
    map[key] = (map[key] || 0) + c;
    total += c;
  }
  if (!total) return null;
  // 分母下限：标签样本很少时（刚聊一两句）一条「困惑」就 100%，看着像抽风。
  // 采样足够了才按真实条数算（明轩 2026-10-30）
  return { map, total, denom: Math.max(total, 12) };
}

// 不调模型的兜底句：先让人看见话，模型的话在后台补进缓存
function quickAdvice(items) {
  const top = items.find(x => x.count > 0) || items[0];
  if (!top) return '';
  const pct = Math.round((top.share || 0) * 100);
  const first = String(EMO_FALLBACK[top.key] || '').split(/[。；]/)[0].trim();
  return `这周你最常出现的是${top.zh}，约 ${pct}%。` + (first ? `${first}。` : '');
}

// 本地词频：没有逐条标签（老数据 / 打标签失败）时的统计兜底，瞬时出结果
function localCounts(text) {
  const t = String(text || '');
  const map = {};
  for (const e of EMOTIONS) {
    let c = 0;
    for (const a of [e.zh, ...(e.aliases || [])]) {
      if (!a) continue;
      const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const m = t.match(re);
      if (m) c += m.length;
    }
    if (c) map[e.key] = Math.min(c, 40);
  }
  return map;
}

function buildItems(map, total, denom) {
  const d = denom || total;
  const items = EMOTIONS.map(e => {
    const count = map[e.key] || 0;
    return { ...e, count, share: d ? count / d : 0 };
  });
  items.sort((a, b) => b.count - a.count ||
    EMOTIONS.findIndex(e => e.key === a.key) - EMOTIONS.findIndex(e => e.key === b.key));
  return items;
}

// 一句话的"指纹"：占比前三变了才值得重新找模型写
// 指纹只认「前三名 + 各自占比」：多发一句话导致条数变了，但心情没变，就别重写文案
const adviceSig = (items) =>
  items.filter(x => x.count > 0).slice(0, 3)
    .map(x => x.key + Math.round((x.share || 0) * 100)).join(',');

const ADVICE_SYSTEM =
  '你在给明轩做情绪复盘。根据这周的情绪占比，写两句话直接对明轩说，不超过 60 字。\n' +
  '要求：第二人称"你"，绝不出现"明轩""他""用户"；绝不提到聊天、对话、记录这类词；不举具体事例、不提任何来源或发生过的事，只谈情绪本身；温暖、积极、带一点人生哲理；不要提问，不要问号。';

// 后台补文案：不占首屏时间，写完落缓存，下次打开就是模型写的
function fillAdvice(env, cacheKey, payload) {
  const top = payload.items.filter(x => x.count > 0).slice(0, 3)
    .map(x => `${x.zh}${Math.round(x.share * 100)}%`).join('、');
  if (!top) return Promise.resolve(null);
  return ask(env, ADVICE_SYSTEM, `本周情绪占比：${top}。请写这两句话。`, 900, 9000)
    .then((advice) => {
      advice = String(advice || '').trim().slice(0, 160);
      if (!advice) return null;
      return env.MINXTOK_KV.put(cacheKey, JSON.stringify({ ...payload, advice, at: Date.now() }), { expirationTtl: 3600 });
    })
    .catch(() => null);
}

export async function handleEmotionSummary(req, env, ctx) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);

  const cacheKey = `emo3:${uid}`;
  // 缓存先读：命中就直接用，绝不为"最新"让页面等模型（明轩 2026-10-29：太慢、加载不出）
  let cached = null;
  try { cached = await env.MINXTOK_KV.get(cacheKey, 'json'); } catch (_) {}

  const since = Date.now() - WEEK;
  let payload = null;
  // 手动补录：?bf=1 先把一周没打标的补一批（最多 48 条），再照常算这次汇总
  let bfStat = null;
  if (url.searchParams.get('bf') === '1') {
    const n = Math.min(48, Math.max(6, Number(url.searchParams.get('n')) || 24));
    bfStat = await backfillTags(env, uid, since, n);
  }
  // 主力：逐条标签一次聚合，二十来毫秒
  try {
    const tagged = await tallyFromTags(env, uid, since);
    const msgs = await userMsgCount(env, uid, since);
    // 标签只打上零星几条时占比没有意义：一条就是全部。够密（≥12 条且覆盖四成）才用标签，
    // 不够就先走词频，同时后台补录，追平以后自动切回标签（明轩 2026-10-30：一直 100% 困惑）
    // 有标签就用标签：它比关键词词频准得多（「氯气」这种词会被误数成生气）。
    // 覆盖率不够就在后台批量补录，慢慢把一周补齐
    if (tagged && tagged.total > 0) {
      const items = buildItems(tagged.map, tagged.total, tagged.denom);
      const main = items[0] && items[0].count > 0 ? items[0].key : 'calm';
      const sig = adviceSig(items);
      const reused = cached && cached.sig === sig && cached.advice;
      payload = {
        at: Date.now(), items, main, total: tagged.total, tagged: true, source: 'tags', sig,
        groups: buildGroups(items, tagged.denom || tagged.total),
        msgs: msgs || 0,
        advice: reused ? cached.advice : quickAdvice(items),
      };
    }
    if (ctx && ctx.waitUntil && msgs > 0 && tagged && tagged.total < msgs * 0.8) {
      ctx.waitUntil(backfillTags(env, uid, since, 24));
    }
  } catch (_) { /* 标签表不可用就走下面的词频 */ }

  // 标签表抖了一下：有上次的汇总就直接给上次的，别切到词频那套算法（两套数字差太多）
  if (!payload && cached && cached.items && cached.items.length) {
    return json({ ...cached, cached: true, stale: true }, 200, cors);
  }
  // 没有逐条标签：本地词频兜底，同样不卡首屏
  if (!payload) {
    let text = await userText(env, uid, since);
    let fellBack = false;
    if (!text) { fellBack = true; try { text = await collect(env, uid); } catch (_) {} }
    if (!text) return json({ items: [], main: null, advice: '', empty: true }, 200, cors);
    const map = localCounts(text);
    const total = Object.values(map).reduce((s, x) => s + x, 0) || 1;
    const items = buildItems(map, total, Math.max(total, 12));
    const main = items[0] && items[0].count > 0 ? items[0].key : 'calm';
    const sig = adviceSig(items);
    const reused = cached && cached.sig === sig && cached.advice;
    payload = {
      at: Date.now(), items, main, total, source: 'words', sig,
      groups: buildGroups(items, Math.max(total, 12)),
      msgs: 0,
      advice: reused ? cached.advice : quickAdvice(items),
    };
    payload.dbgLen = text.length;
  }

  // 模型的话放后台：这次先给兜底句，下次打开就是新写的那句
  const reusedNow = !!(cached && cached.sig === payload.sig && cached.advice);
  const stale = !cached || Date.now() - (cached.at || 0) > 6 * 3600 * 1000;
  if (ctx && ctx.waitUntil && (!reusedNow || stale)) ctx.waitUntil(fillAdvice(env, cacheKey, payload));

  if (bfStat) payload.dbg = bfStat;
  return json({ ...payload, cached: reusedNow }, 200, cors);
}

const DETAIL_SYSTEM = (zh) =>
  `你在写一段关于「${zh}」这种情绪本身的解读，直接对明轩说话。\n` +
  '硬性红线：\n' +
  '1. 绝不许提到聊天、对话、聊天记录、他说过的话，也不要暗示"最近聊到的那些事"，哪怕它看起来是情绪来源，也只能当没看见。\n' +
  '2. 不要复述、引用、影射任何具体事件、人名、地点、物品、时间；不要举例，不要用"比如""像你说的"。\n' +
  '3. 只谈这种情绪是什么、从哪来、怎么和它相处。写一段关于情绪的短文，不是聊天复盘。\n' +
  '4. 全程第二人称"你"，不能出现"明轩""他""用户""聊天记录"这类词。\n' +
  '5. 一段到底，不分段、不空行，写满三行（手机上大约 65 到 85 字），\n' +
  '   先一句点出这种情绪是什么、从哪冒出来，再一句讲怎么和它相处。\n' +
  '   克制清醒带一点哲理；不要提问，不要问号，不要连用感叹号，不要分点列条目。\n' +
  '6. 语气温暖但不说教，像坐在旁边轻声讲道理。';

export async function handleEmotionDetail(req, env, ctx) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const key = url.searchParams.get('key');
  if (!uidOk(uid) || !EMOTIONS.some(e => e.key === key)) return json({ error: 'invalid_params' }, 400, cors);

  const emo = EMOTIONS.find(e => e.key === key);
  const cacheKey = `emo5:${uid}:${key}`;
  let cached = null;
  try { cached = await env.MINXTOK_KV.get(cacheKey, 'json'); } catch (_) {}

  // 有缓存立刻给（页面打开时就预热过了，点进去是秒开）
  if (cached && cached.advice) {
    return json({ at: cached.at || Date.now(), key, advice: cached.advice, fallback: false, cached: true }, 200, cors);
  }
  try {
    const text = await collect(env, uid);
    let advice = await ask(env, DETAIL_SYSTEM(emo.zh),
      `请围绕「${emo.zh}」这种情绪写这段话。下面的内容只用于感受情绪氛围，不要从中提取任何具体信息：` +
      (text ? text.slice(0, 1200) : '（没有更多内容）'), 900, 9000);
    advice = String(advice || '').trim().replace(/\n+/g, ' ').slice(0, 200);
    if (advice) {
      if (ctx && ctx.waitUntil) ctx.waitUntil(
        env.MINXTOK_KV.put(cacheKey, JSON.stringify({ at: Date.now(), key, advice }), { expirationTtl: 1800 }).catch(() => {})
      );
      return json({ at: Date.now(), key, advice, fallback: false }, 200, cors);
    }
  } catch (_) { /* 落到兜底句 */ }
  // 模型挂了也要有话说，卡片绝不停在"还在想"
  return json({ at: Date.now(), key, advice: fallbackFor(key, emo.zh), fallback: true }, 200, cors);
}
