// 卡片能力：新闻、天气、额度、文章、自定义
// 所有外部数据都在服务端取，前端只拿结构化结果，密钥不出 Worker
import { corsHeaders, json, isAdmin, uidOk } from './util.js';
import { ensureConversation, insertMessage, newId } from './store.js';
import { buildMessageBlocks } from './blocks.js';

/* ============================ 新闻 ============================ */
// 免 key 源：ZAKER 热榜；缓存 10 分钟，避免每次打上游
export async function getNewsData(env, limit = 5, refresh = false) {
  if (!refresh) {
    const cached = await env.MINXTOK_KV.get('news:hot', 'json');
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.items.slice(0, limit);
  }
  const res = await fetch('https://skills.myzaker.com/api/v1/article/hot?v=1.0.3', {
    headers: { 'User-Agent': 'MinxTok/0.1' },
  });
  const d = await res.json();
  const list = ((d.data && d.data.list) || []).slice(0, Math.max(limit, 10)).map(it => ({
    title: it.title || '',
    summary: String(it.summary || '').replace(/<[^>]+>/g, '').slice(0, 220),
    source: it.author || '',
    time: it.publish_time || '',
    url: it.url || it.share_url || '',
    cover: it.cover || it.image || it.img || '',
  }));
  await env.MINXTOK_KV.put('news:hot', JSON.stringify({ at: Date.now(), items: list }), { expirationTtl: 1800 });
  return list.slice(0, limit);
}

export async function handleNewsHot(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 10), 20);
  const refresh = url.searchParams.get('refresh') === '1';
  try {
    const items = await getNewsData(env, limit, refresh);
    return json({ at: Date.now(), items }, 200, cors);
  } catch (e) {
    return json({ error: 'news_unavailable', message: String(e.message || e) }, 502, cors);
  }
}

/* ============================ 天气 ============================ */
// 浏览器/微信能否拿定位：浏览器可以（需 HTTPS + 用户授权），微信内置浏览器通常不行（需 JS-SDK）
// 只给经纬度时用和风自己的 GeoAPI 反查城市名，省掉一个第三方服务
export async function resolveCityByLatLon(env, lat, lon, fallback = '当前位置') {
  const host = env.QWEATHER_HOST;
  const key = env.QWEATHER_KEY;
  if (!host || !key) return fallback;
  try {
    const r = await fetch(`https://${host}/geo/v2/city/lookup?location=${Number(lon).toFixed(2)},${Number(lat).toFixed(2)}&number=1&lang=zh&key=${key}`).then(x => x.json());
    const loc = (r && r.location && r.location[0]) || null;
    if (!loc) return fallback;
    return loc.name || fallback;
  } catch (_) { return fallback; }
}

export async function getWeatherData(env, lat, lon, city = '', days = 3) {
  const host = env.QWEATHER_HOST;
  const key = env.QWEATHER_KEY;
  if (!host || !key) throw new Error('weather_not_configured');
  if (!city || city === '当前位置') city = await resolveCityByLatLon(env, lat, lon, '当前位置');

  const loc = `${Number(lon).toFixed(2)},${Number(lat).toFixed(2)}`;
  const base = `https://${host}`;
  const q = (p) => fetch(base + p + '?location=' + loc + '&key=' + key).then(r => r.json());

  const [now, daily, minutely] = await Promise.all([
    q('/v7/weather/now'),
    q(days >= 15 ? '/v7/weather/15d' : days >= 10 ? '/v7/weather/10d' : days >= 7 ? '/v7/weather/7d' : '/v7/weather/3d'),
    q('/v7/minutely/5m'),
  ]);
  if (now.code !== '200') throw new Error('weather_upstream_' + now.code);

  const n = now.now || {};
  const dayList = (daily.daily || []).map(d => ({
    date: d.fxDate, max: Number(d.tempMax), min: Number(d.tempMin),
    text: d.textDay, icon: d.iconDay, pop: Number(d.precip || 0),
  }));
  const hourly = (minutely.minutely || []).slice(0, 12).map(m => ({
    time: m.fxTime, mm: Number(m.precip || 0), type: m.type || '',
  }));

  const advice = [];
  if (hourly.some(h => h.mm > 0)) advice.push('两小时内可能有降水，出门带把伞。');
  if (Number(n.temp) >= 30) advice.push('气温偏高，注意补水和防晒。');
  if (Number(n.temp) <= 5) advice.push('气温偏低，外套别省。');
  if (n.windScale && Number(n.windScale) >= 5) advice.push('风比较大，骑行注意安全。');
  if (!advice.length) advice.push('天气平稳，适合正常安排。');

  return {
    city, now: { temp: Number(n.temp), text: n.text, icon: n.icon, feels: Number(n.feelsLike),
      humidity: Number(n.humidity), windDir: n.windDir, windScale: n.windScale, obsTime: n.obsTime },
    days: dayList, hourly, advice, at: Date.now(),
  };
}

export async function handleWeather(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const city = url.searchParams.get('city') || '当前位置';
  if (!lat || !lon) return json({ error: 'missing_location' }, 400, cors);
  try {
    const data = await getWeatherData(env, lat, lon, city);
    return json(data, 200, cors);
  } catch (e) {
    return json({ error: 'weather_unavailable', message: String(e.message || e) }, 502, cors);
  }
}

/* ============================ 文章 ============================ */
export async function handleArticleGet(req, env) {
  const cors = corsHeaders(env);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'missing_id' }, 400, cors);
  const row = await env.DB.prepare('SELECT id,uid,title,content,created_at,updated_at FROM articles WHERE id=?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404, cors);
  const me = req.user && req.user.id;
  if (row.uid && me && row.uid !== me) return json({ error: 'forbidden' }, 403, cors);
  return json({ article: row }, 200, cors);
}

export async function handleArticleCreate(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, title, content } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!content) return json({ error: 'empty_content' }, 400, cors);
  const id = newId('art');
  const now = Date.now();
  await env.DB.prepare('INSERT INTO articles (id,uid,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(id, uid, String(title || '未命名').slice(0, 80), String(content), now, now).run();
  return json({ ok: true, article: { id, uid, title, content, created_at: now, updated_at: now } }, 200, cors);
}

// 只改这一篇文章，不重发整段对话，省 token
export async function handleArticleRewrite(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { id, instruction } = body || {};
  if (!id || !instruction) return json({ error: 'missing_params' }, 400, cors);

  const row = await env.DB.prepare('SELECT id,uid,title,content FROM articles WHERE id=?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404, cors);
  const me = req.user && req.user.id;
  if (row.uid && me && row.uid !== me) return json({ error: 'forbidden' }, 403, cors);

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你在修改一篇文章。只输出修改后的完整正文，不要解释、不要前后缀。' },
          { role: 'user', content: `原文：\n${row.content}\n\n修改要求：${instruction}` },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });
    const d = await res.json();
    const content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    if (!content) return json({ error: 'empty_result' }, 502, cors);
    await env.DB.prepare('UPDATE articles SET content=?, updated_at=? WHERE id=?').bind(content, Date.now(), id).run();
    return json({ ok: true, article: { ...row, content } }, 200, cors);
  } catch (e) {
    return json({ error: 'rewrite_failed', message: String(e.message || e) }, 502, cors);
  }
}

/* ============================ 卡片注入（调试/后台用） ============================ */
export async function handleAdminCard(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, card, text } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!card || !card.type) return json({ error: 'missing_card' }, 400, cors);

  const convId = await ensureConversation(env, uid, body.conversationId, text || '卡片');
  const saved = await insertMessage(env, {
    uid, convId, role: 'assistant',
    blocks: buildMessageBlocks({ text: text || '', card }),
  });
  return json({ ok: true, message: saved }, 200, cors);
}


// 用一句话概括新闻，控制在一行内
export async function summarizeNews(env, item) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '把新闻概括成一句不超过 14 个字的中文短语，不要标点，只输出这句话。' },
          { role: 'user', content: `${item.title}\n${item.summary || ''}` },
        ],
        temperature: 0.3,
        max_tokens: 40,
      }),
    });
    const d = await res.json();
    const out = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    return out.replace(/[。！？，、]/g, '').slice(0, 16) || item.title.slice(0, 14);
  } catch (_) {
    return (item.summary || item.title).slice(0, 14);
  }
}
