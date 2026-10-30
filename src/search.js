// 搜索：关键词、时间、情绪、按意思（先用模型扩展同义词再匹配）
import { corsHeaders, json, uidOk } from './util.js';
import { EMOTIONS } from './emotion.js';

const RANGE = { today: 1, '7d': 7, '30d': 30, all: 3650 };

// 情绪筛选：直接复用情绪中心的 24 类与全部别名，保证「标签里有的情绪，搜索一定找得到」
const EMO_WORDS = Object.fromEntries(EMOTIONS.map(e => [
  e.key,
  [...new Set([e.key, e.zh, e.en.toLowerCase(), ...(e.aliases || [])])],
]));
// 反向索引：搜「开心 / 喜悦 / 兴奋」都能落到 happy
const EMO_BY_WORD = new Map();
for (const e of EMOTIONS) {
  for (const w of EMO_WORDS[e.key]) {
    const k = String(w || '').toLowerCase();
    if (k && !EMO_BY_WORD.has(k)) EMO_BY_WORD.set(k, e.key);
  }
}

function emotionsInQuery(q) {
  const text = String(q || '').toLowerCase().trim();
  if (!text) return [];
  const hits = new Set();
  for (const [word, key] of EMO_BY_WORD) {
    if (word.length >= 2 && text.includes(word)) hits.add(key);
  }
  const exact = EMO_BY_WORD.get(text);
  if (exact) hits.add(exact);
  return [...hits];
}

function strip(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// 联网搜索：百度千帆 AI 搜索。密钥只放在 Worker 环境变量里。
const QF_ENDPOINT = 'https://qianfan.baidubce.com/v2/ai_search/web_search';

export async function qianfanWebSearch(env, q, topK) {
  const key = env.BAIDU_QIANFAN_API_KEY || env.QIANFAN_API_KEY;
  if (!key) { const e = new Error('missing_key'); e.code = 'missing_key'; throw e; }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
  let res;
  try {
    res = await fetch(QF_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        messages: [{ role: 'user', content: q }],
        search_source: 'baidu_search_v2',
        resource_type_filter: [{ type: 'web', top_k: Math.max(1, Math.min(10, topK || 8)) }],
      }),
      signal: ctl ? ctl.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) { const e = new Error('upstream'); e.code = 'upstream'; throw e; }
  const data = await res.json().catch(() => ({}));
  const refs = Array.isArray(data.references) ? data.references : [];
  return refs.map((r) => {
    const url = String((r && r.url) || '');
    if (!/^https?:\/\//i.test(url)) return null;
    let site = String((r && r.website) || '');
    if (!site) { try { site = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { site = ''; } }
    return {
      type: 'web',
      title: strip((r && r.title) || site || url).slice(0, 180),
      url,
      text: strip((r && (r.content || r.snippet)) || '').slice(0, 320),
      site,
      date: String((r && r.date) || ''),
    };
  }).filter(Boolean);
}

async function expand(env, q) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '把用户的意思扩展成 6 个可能出现在聊天里的中文关键词，用逗号分隔，只输出关键词。' },
          { role: 'user', content: q },
        ],
        temperature: 0.4,
        max_tokens: 80,
      }),
    });
    const d = await res.json();
    const t = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '');
    return t.split(/[，,、\s]+/).map(x => x.trim()).filter(Boolean).slice(0, 6);
  } catch (_) {
    return [];
  }
}

export async function handleSearch(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);

  const q = (url.searchParams.get('q') || '').trim();
  const scope = url.searchParams.get('scope') || 'all';
  const range = url.searchParams.get('range') || 'all';
  const emotion = url.searchParams.get('emotion') || '';
  const semantic = url.searchParams.get('semantic') === '1';

  if (scope === 'web') {
    if (!q) return json({ error: 'missing_query' }, 400, cors);
    try {
      const results = await qianfanWebSearch(env, q, 8);
      return json({ results, terms: [q], source: 'qianfan' }, 200, cors);
    } catch (e) {
      const code = e && e.code === 'missing_key' ? 'search_not_configured' : 'search_failed';
      return json({ error: code }, e && e.code === 'missing_key' ? 503 : 502, cors);
    }
  }

  const days = RANGE[range] || RANGE.all;
  const since = Date.now() - days * 86400000;

  let terms = [];
  if (emotion && EMO_WORDS[emotion]) terms = EMO_WORDS[emotion].slice();
  if (q) terms.push(q);
  if (q && semantic) terms = terms.concat(await expand(env, q));
  terms = [...new Set(terms.filter(Boolean))].slice(0, 10);

  const results = [];

  // 搜索框里直接写情绪词（比如「开心」）也要能命中被打过情绪标签的消息
  const emoFilters = new Set();
  if (emotion && EMO_WORDS[emotion]) emoFilters.add(emotion);
  for (const k of emotionsInQuery(q)) emoFilters.add(k);

  if (scope === 'all' || scope === 'chat') {
    // 这个用户被打了这些情绪标签的消息 id，直接参与命中
    const taggedIds = new Set();
    const emoOf = new Map();
    for (const key of emoFilters) {
      try {
        const t = await env.DB.prepare(
          'SELECT message_id FROM message_emotion WHERE uid=? AND emo=? AND created_at>=? LIMIT 600'
        ).bind(uid, key, since).all();
        for (const r of t.results || []) {
          taggedIds.add(r.message_id);
          if (!emoOf.has(r.message_id)) emoOf.set(r.message_id, key);
        }
      } catch (_) { /* 表还没建也不影响 */ }
    }
    const rows = await env.DB.prepare(
      'SELECT id,role,blocks,created_at FROM messages WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 400'
    ).bind(uid, since).all();
    for (const r of rows.results || []) {
      let text = '';
      try { text = strip((JSON.parse(r.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join(' ')); } catch (_) {}
      if (!text) continue;
      const hit = !terms.length || terms.some(t => text.includes(t)) || taggedIds.has(r.id);
      if (hit) results.push({ type: 'chat', id: r.id, role: r.role, text: text.slice(0, 160), createdAt: r.created_at, emo: emoOf.get(r.id) || '' });
    }
  }

  if (scope === 'all' || scope === 'diary') {
    const rows = await env.DB.prepare(
      'SELECT id,day,content,created_at FROM diaries WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 200'
    ).bind(uid, since).all();
    for (const r of rows.results || []) {
      const text = strip(r.content);
      if (!text) continue;
      const hit = !terms.length || terms.some(t => text.includes(t));
      if (hit) results.push({ type: 'diary', id: r.id, day: r.day, text: text.slice(0, 160), createdAt: r.created_at });
    }
  }

  // 学习中心：错题、生词、历史对话也进同一张结果表
  if (scope === 'all' || scope === 'study') {
    try {
      const rows = await env.DB.prepare(
        'SELECT id,kind,title,content,created_at FROM study_items WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 200'
      ).bind(uid, since).all();
      for (const r of rows.results || []) {
        const kind = String(r.kind || '');
        const isSession = kind.startsWith('session:');
        const text = strip(r.content);
        const title = String(r.title || '');
        const hay = `${title} ${text}`;
        const hit = !terms.length || terms.some(t => hay.includes(t));
        if (!hit) continue;
        results.push({
          type: 'study',
          id: r.id,
          kind,
          mode: isSession ? kind.slice(8) : kind,
          title: title.slice(0, 80),
          text: (isSession ? title : text).slice(0, 160),
          createdAt: r.created_at,
        });
      }
    } catch (_) { /* 旧库没有 study_items 时忽略 */ }
  }

  results.sort((a, b) => b.createdAt - a.createdAt);
  return json({ results: results.slice(0, 60), terms }, 200, cors);
}
