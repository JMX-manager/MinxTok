// 轻量查词：前端点英文单词时走这里，代理有道词典并按句子收敛义项。
// 返回 1-2 条常用释义 + 一个很短的英文例句，避免把整页词典数据发给手机。
import { corsHeaders, json } from './util.js';

const CACHE_TTL = 60 * 60 * 24 * 14;

function cleanWord(value) {
  const w = String(value || '').trim().toLowerCase().replace(/[’‘]/g, "'");
  // 允许词内点号：u.s. / e.g. / i.e. 这类缩写；纯符号、超长仍然拒掉
  if (!/^[a-z][a-z'.\- ]{0,48}$/.test(w)) return '';
  if (!/[a-z]/.test(w)) return '';
  return w.replace(/\s+/g, ' ');
}

function cleanCtx(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function cleanDef(value, max = 220) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function shortDef(value) {
  return cleanDef(value, 180)
    .split(/[；;]/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('；')
    .slice(0, 80);
}

function parseEntries(d) {
  const out = [];
  const seen = new Set();
  const push = (pos, def) => {
    const p = String(pos || '').trim().toLowerCase().slice(0, 24);
    const d0 = cleanDef(def, 220);
    if (!d0) return;
    const key = `${p}|${d0}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ pos: p, def: d0 });
  };

  const ecWord = d && d.ec && Array.isArray(d.ec.word) ? d.ec.word[0] : null;
  for (const group of (ecWord && ecWord.trs) || []) {
    for (const tr of (group && group.tr) || []) {
      const raw = tr && tr.l && tr.l.i;
      const line = Array.isArray(raw) ? raw[0] : raw;
      if (!line) continue;
      const s = String(line).trim();
      const m = s.match(/^([a-z][a-z./ ]{0,18}\.)\s*(.+)$/i);
      push(m ? m[1] : '', m ? m[2] : s);
    }
  }

  if (!out.length) {
    const eeWord = d && d.ee && d.ee.word;
    const groups = Array.isArray(eeWord) ? eeWord : eeWord ? [eeWord] : [];
    for (const group of groups) {
      for (const tr of (group && group.trs) || []) {
        const raw = tr && tr.tr && tr.tr[0] && tr.tr[0].l && tr.tr[0].l.i;
        if (raw) push(tr.pos || '', raw);
      }
    }
  }

  if (!out.length) {
    const web = d && d.web_trans && d.web_trans['web-translation'];
    const list = Array.isArray(web) ? web : [];
    for (const item of list) {
      const trans = item && item.trans;
      if (!Array.isArray(trans)) continue;
      for (const tr of trans) {
        if (tr && tr.value) push('', tr.value);
      }
    }
  }

  return out.slice(0, 6);
}

function parseExample(d) {
  const part = d && d.blng_sents_part;
  const pairs = part && Array.isArray(part['sentence-pair']) ? part['sentence-pair'] : [];
  const list = pairs
    .map(x => cleanDef(x && (x['sentence-eng'] || x.sentence), 160))
    .filter(x => x && /\s/.test(x))
    .sort((a, b) => a.length - b.length);
  return list[0] || '';
}

function dictLlmUrl(env) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

async function refineWithContext(env, word, ctx, candidates) {
  if (!ctx || !candidates.length || !env.LLM_API_KEY) return null;
  // 只有一条候选就没有歧义可选，别浪费一次大模型往返
  if (candidates.length < 2) return null;
  const ctl = new AbortController();
  // 点词要的是秒开：润色最多等 2.2 秒，超时就用候选释义顶上
  const timer = setTimeout(() => ctl.abort(), 2200);
  try {
    const list = candidates.slice(0, 5)
      .map((e, i) => `${i + 1}. ${e.pos ? e.pos + ' ' : ''}${e.def}`)
      .join('\n');
    const res = await fetch(dictLlmUrl(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      signal: ctl.signal,
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              '你在做极简英汉词典。根据句子判断单词在句中的意思，只给 1-2 条释义。\n' +
              '规则：\n' +
              '1. 第一条给这个词最常见的释义；\n' +
              '2. 如果句中意思不是这个常见义，必须在第二条补上句中义；即使第一个候选释义里用分号带了很多义项，也不能把句中义丢掉；如果句中义就是常见义，只给一条；\n' +
              '3. 优先参考候选释义，可合并，不要编造；每条释义不超过 28 个汉字；\n' +
              '4. 词性用 adj./n./v./adv./prep. 这类缩写；\n' +
              '5. 再给一个非常短、自然的英文例句，必须包含该词，不超过 12 个单词，不要翻译。\n' +
              '只输出 JSON，不要解释：{"entries":[{"pos":"adj.","def":"..."}],"example":"..."}',
          },
          {
            role: 'user',
            content: `单词：${word}\n句子：${ctx}\n候选释义：\n${list}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    const out = JSON.parse(m[0]);
    const entries = (Array.isArray(out.entries) ? out.entries : [])
      .map(it => ({
        pos: String((it && it.pos) || '').trim().toLowerCase().slice(0, 24),
        def: cleanDef(it && it.def, 80),
      }))
      .filter(it => it.def)
      .slice(0, 2);
    if (!entries.length) return null;
    return { entries, example: cleanDef(out.example, 120) };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fallback(d, candidates) {
  return {
    entries: candidates.slice(0, 2).map(it => ({ pos: it.pos, def: shortDef(it.def) })),
    example: parseExample(d),
  };
}

export async function handleDict(request, env, ctx) {
  const cors = corsHeaders(env);
  const url = new URL(request.url);
  const word = cleanWord(url.searchParams.get('word'));
  const context = cleanCtx(url.searchParams.get('ctx'));
  if (!word) return json({ error: 'invalid_word' }, 400, cors);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = cache
    ? new Request(`https://minxtok.local/dict/v4/${encodeURIComponent(word)}/${encodeURIComponent(context)}`)
    : null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...cors } });
  }

  let upstream;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    upstream = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        'Referer': 'https://dict.youdao.com/',
        'Accept': 'application/json,text/plain,*/*',
      },
    });
    clearTimeout(timer);
  } catch (_) {
    return json({ error: 'dict_timeout' }, 504, cors);
  }
  if (!upstream.ok) return json({ error: 'dict_failed' }, 502, cors);

  let data;
  try { data = await upstream.json(); } catch (_) { return json({ error: 'dict_bad_json' }, 502, cors); }

  const ecWord = data && data.ec && Array.isArray(data.ec.word) ? data.ec.word[0] : null;
  const simpleWord = data && data.simple && Array.isArray(data.simple.word) ? data.simple.word[0] : null;
  const phonetic = String((ecWord && (ecWord.usphone || ecWord.ukphone)) || (simpleWord && (simpleWord.usphone || simpleWord.ukphone)) || '').trim();
  const candidates = parseEntries(data);
  const refined = await refineWithContext(env, word, context, candidates);
  const picked = refined || fallback(data, candidates);
  const payload = {
    ok: picked.entries.length > 0,
    word,
    phonetic,
    entries: picked.entries,
    example: picked.example || parseExample(data),
  };
  // 词义基本不变，让浏览器放心缓存；带上下文（用户原句）的只在本地缓存，别进中间层
  const cc = context ? 'private, max-age=604800' : 'public, max-age=604800';
  const res = json(payload, 200, { ...cors, 'Cache-Control': cc });

  if (cache) {
    const copy = res.clone();
    const cachePut = cache.put(cacheKey, copy).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cachePut);
  }
  return res;
}
