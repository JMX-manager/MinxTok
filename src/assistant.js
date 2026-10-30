// 助理设置：资料、性格滑块、助理日记（自动、静默生成）
import { corsHeaders, json, uidOk, dayKey } from './util.js';

export const ASSISTANT_DEFAULTS = {
  name: '虾虾',
  userName: '',
  userBio: '',
  memory: '',
  userGender: '',
  userBirthday: '',
  userInterests: [],
  onboarded: false,
  persona: '一个温暖、灵动、会卖萌的助理',
  traits: {
    sentence: 45,
    sweet: 60,
    bossy: 25,
    humor: 55,
    sharp: 20,
    emoji: 40,
    tone: 40,
  },
};

const AS_TRAIT_KEYS = ['sentence', 'sweet', 'bossy', 'humor', 'sharp', 'emoji', 'tone'];

function asClamp(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function asCleanText(v, max) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
}

function asCleanInterests(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw || '[]'); } catch (_) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const text = asCleanText(item, 20);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 24) break;
  }
  return out;
}

export function ageFromBirthday(birthday) {
  const text = String(birthday || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(text + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function isBirthdayToday(birthday, day = dayKey()) {
  const text = String(birthday || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return false;
  const d = new Date(text + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  return text.slice(5) === String(day).slice(5);
}

export function ageLanguage(age) {
  if (age == null) return '';
  if (age < 12) return '用简单、温柔、具体的话，别用成人腔调，也别催';
  if (age < 18) return '像同龄人一样轻快自然，别像老师或家长说教';
  if (age < 25) return '直接、轻松、有活力，少用长辈式叮嘱';
  if (age < 35) return '自然、利落，少绕弯子，也别端着';
  if (age < 50) return '稳重但不古板，少用网络梗和夸张语气';
  if (age < 65) return '耐心、清楚，别堆流行语，别催促';
  return '慢一点、清楚一点，语气温和，多给一点回应的时间';
}

function asCleanTraits(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of AS_TRAIT_KEYS) out[k] = asClamp(src[k] == null ? ASSISTANT_DEFAULTS.traits[k] : src[k]);
  return out;
}

function asNormalizeSettings(row) {
  if (!row) return { ...ASSISTANT_DEFAULTS, userInterests: [], traits: { ...ASSISTANT_DEFAULTS.traits } };
  let traits = {};
  try { traits = JSON.parse(row.traits || '{}'); } catch (_) {}
  return {
    name: row.name || ASSISTANT_DEFAULTS.name,
    userName: row.user_name || '',
    userBio: row.user_bio || '',
    memory: row.memory || '',
    userGender: row.user_gender || '',
    userBirthday: row.user_birthday || '',
    userInterests: asCleanInterests(row.user_interests),
    onboarded: Number(row.onboarded) === 1,
    persona: row.persona || ASSISTANT_DEFAULTS.persona,
    traits: asCleanTraits(traits),
  };
}

export async function getAssistantSettings(env, uid) {
  if (!uidOk(uid)) return asNormalizeSettings(null);
  try {
    const row = await env.DB.prepare(
      'SELECT name,user_name,user_bio,memory,user_gender,user_birthday,user_interests,onboarded,persona,traits FROM assistant_settings WHERE uid=?'
    ).bind(uid).first();
    return asNormalizeSettings(row);
  } catch (_) {
    return asNormalizeSettings(null);
  }
}

// 把设置拼成聊天提示词的一部分；只给模型看，不直接展示
export function assistantPrompt(settings) {
  const s = settings || asNormalizeSettings(null);
  const t = s.traits || {};
  const bits = [];
  if (s.persona) bits.push(`你的形象：${s.persona}。`);
  if (s.userBio) bits.push(`关于对方：${s.userBio}`);
  if (s.memory) bits.push(`你记得的事：${s.memory}`);
  if (s.userGender) bits.push(`对方的性别：${s.userGender}。`);
  const age = ageFromBirthday(s.userBirthday);
  if (age != null) bits.push(`对方今年 ${age} 岁。说话时注意：${ageLanguage(age)}。`);
  if (s.userInterests && s.userInterests.length) {
    bits.push(`对方感兴趣的事：${s.userInterests.join('、')}。可以自然接住这些话题，但不要生硬罗列。`);
  }
  const style = [];
  style.push(t.sentence >= 70 ? '句子可以稍微展开' : t.sentence <= 30 ? '尽量用短句，一两句说完' : '句子长短适中');
  style.push(t.sweet >= 70 ? '嘴甜一点，会夸人' : t.sweet <= 30 ? '别刻意嘴甜' : '自然一点');
  style.push(t.bossy >= 70 ? '可以强势、直接下结论' : t.bossy <= 20 ? '别命令对方' : '态度平和');
  style.push(t.humor >= 70 ? '多开玩笑' : t.humor <= 20 ? '少开玩笑' : '偶尔幽默');
  style.push(t.sharp >= 70 ? '可以毒舌吐槽，但别人身攻击' : t.sharp <= 20 ? '不要毒舌' : '带一点点损');
  style.push(t.emoji >= 70 ? '可以多用 emoji' : t.emoji <= 15 ? '几乎不用 emoji' : '少量 emoji');
  style.push(t.tone >= 70 ? '多用语气词，口语化' : t.tone <= 15 ? '少用语气词' : '语气自然');
  bits.push(`说话风格：${style.join('；')}。`);
  bits.push('接话方式：先接住对方刚说的具体内容；对方提问时先正面回答，再最多追问一个具体问题。不要连环追问，不要每句都问，也不要用一串问题代替回答。');
  bits.push(`emoji 只在合适的地方少量用${/虾/.test(s.name || '') ? '，可以用🦞呼应名字' : '，名字不带“虾”就不要用🦞'}；语气词自然带，别堆“嘛～”“呀～”。`);
  bits.push('几条风格冲突时以自然、自洽为准，不要又冷又黏、又命令又讨好，把风格融成一种语气；滑块风格优先于形象描述。别自称“温柔型”“嘴甜”这类标签，也别解释自己的性格，把性格落在具体措辞里。');
  return bits.join('\n');
}

export async function handleAssistantGet(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const settings = await getAssistantSettings(env, uid);
  let diaries = [];
  try {
    const res = await env.DB.prepare(
      'SELECT id,period,content,created_at FROM assistant_diaries WHERE uid=? ORDER BY created_at DESC LIMIT 8'
    ).bind(uid).all();
    diaries = res.results || [];
  } catch (_) {}
  return json({ settings, diaries }, 200, cors);
}

export async function handleAssistantSave(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const current = await getAssistantSettings(env, uid);
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const name = (has('name') ? asCleanText(body.name, 20) : current.name) || ASSISTANT_DEFAULTS.name;
  const rawTraits = has('traits') ? { ...current.traits, ...(body.traits || {}) } : current.traits;
  const settings = {
    name,
    userName: has('userName') ? asCleanText(body.userName, 20) : current.userName,
    userBio: has('userBio') ? asCleanText(body.userBio, 500) : current.userBio,
    memory: has('memory') ? asCleanText(body.memory, 2000) : current.memory,
    userGender: has('userGender') ? asCleanText(body.userGender, 10) : current.userGender,
    userBirthday: has('userBirthday') ? asCleanText(body.userBirthday, 10) : current.userBirthday,
    userInterests: has('userInterests') ? asCleanInterests(body.userInterests) : current.userInterests,
    onboarded: has('onboarded') ? Boolean(body.onboarded) : current.onboarded,
    persona: (has('persona') ? asCleanText(body.persona, 120) : current.persona) || ASSISTANT_DEFAULTS.persona,
    traits: asCleanTraits(rawTraits),
  };
  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO assistant_settings (uid,name,user_name,user_bio,memory,user_gender,user_birthday,user_interests,onboarded,persona,traits,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(uid) DO UPDATE SET name=excluded.name,user_name=excluded.user_name,user_bio=excluded.user_bio,memory=excluded.memory,user_gender=excluded.user_gender,user_birthday=excluded.user_birthday,user_interests=excluded.user_interests,onboarded=excluded.onboarded,persona=excluded.persona,traits=excluded.traits,updated_at=excluded.updated_at'
    ).bind(uid, settings.name, settings.userName, settings.userBio, settings.memory, settings.userGender, settings.userBirthday, JSON.stringify(settings.userInterests), settings.onboarded ? 1 : 0, settings.persona, JSON.stringify(settings.traits), now).run();
  } catch (e) {
    return json({ error: 'save_failed', message: String(e.message || e) }, 500, cors);
  }
  return json({ ok: true, settings }, 200, cors);
}

function asPlainBlocks(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return (arr || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  } catch (_) { return ''; }
}

// 静默生成：每次聊天顺手检查一次，到点才写，不打断对话
export async function maybeGenerateAssistantDiary(env, uid) {
  if (!uidOk(uid)) return;
  const lockKey = `adlock:${uid}`;
  try {
    if (await env.MINXTOK_KV.get(lockKey)) return;
    await env.MINXTOK_KV.put(lockKey, '1', { expirationTtl: 600 });
  } catch (_) {}

  let last = null;
  try {
    last = await env.DB.prepare(
      'SELECT created_at FROM assistant_diaries WHERE uid=? ORDER BY created_at DESC LIMIT 1'
    ).bind(uid).first();
  } catch (_) { return; }

  const now = Date.now();
  const since7 = now - 7 * 86400000;
  let activeDays = 0;
  let msgCount = 0;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c, COUNT(DISTINCT date(created_at/1000,'unixepoch','+8 hours')) AS d " +
      "FROM messages WHERE uid=? AND role='user' AND created_at>=?"
    ).bind(uid, since7).first();
    msgCount = Number(row && row.c) || 0;
    activeDays = Number(row && row.d) || 0;
  } catch (_) {}

  // 最近聊得多就一天一篇，聊得少就一周一篇
  const daily = msgCount >= 12 || activeDays >= 3;
  const period = daily ? 'day' : 'week';
  if (last) {
    const gap = now - Number(last.created_at || 0);
    if (daily) {
      if (dayKey(new Date(Number(last.created_at))) === dayKey()) return;
    } else if (gap < 6 * 86400000) {
      return;
    }
  }
  if (!msgCount) return;
  if (!last && msgCount < 3) return;

  const since = last ? Number(last.created_at) : (daily ? now - 86400000 : since7);
  let lines = '';
  let newest = 0;
  try {
    const res = await env.DB.prepare(
      'SELECT role,blocks,created_at FROM messages WHERE uid=? AND created_at>=? ORDER BY created_at ASC LIMIT 60'
    ).bind(uid, since).all();
    const rows = res.results || [];
    for (const r of rows) newest = Math.max(newest, Number(r.created_at) || 0);
    lines = rows.map(r => {
      const text = asPlainBlocks(r.blocks);
      return text ? `${r.role === 'user' ? '对方' : '我'}：${text}` : '';
    }).filter(Boolean).join('\n').slice(0, 6000);
  } catch (_) {}
  if (!lines) return;

  const settings = await getAssistantSettings(env, uid);
  // 时间口径跟着“最后一条消息”走：跨过零点但聊的主要是今天，就得说「今天」，
  // 不能因为上一篇文章是昨天写的就把今天的内容写成「昨天」。
  const newestDay = newest ? dayKey(new Date(newest)) : dayKey();
  const todayKey = dayKey();
  const yesterdayKey = dayKey(new Date(now - 86400000));
  const when = daily
    ? (newestDay === todayKey ? '今天' : newestDay === yesterdayKey ? '昨天' : '最近')
    : '最近';
  const system = [
    `你是「${settings.name}」，${settings.persona}。`,
    '写一篇你自己的日记，用第一人称「我」。',
    '提到对方时用「你」，不要用「他」「她」「用户」，也不要用对方的名字。',
    `时间口径是「${when}」，开头要自然出现「${when}」这个词，只写你们真实聊过的事、你的态度和感受，不要编造。`,
    '3 到 6 句，120 到 260 字，像随手记下来的一段话，句子要写完整不要断在半句。',
    '不要标题、日期、引号，不要总结报告，不要解释你在写日记。',
    '只输出日记正文。',
  ].join('\n');

  try {
    const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `这是${when}的对话记录：\n${lines}` },
        ],
        temperature: 0.9,
        max_tokens: 900,
      }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const choice = (data.choices && data.choices[0]) || {};
    let text = ((choice.message && choice.message.content) || '').trim();
    text = text.replace(/^["'“”「」]+|["'“”「」]+$/g, '').replace(/\s+/g, ' ').trim();
    // 被 max_tokens 截断时退到最后一个完整句子，宁可短一点也别留半句
    if (choice.finish_reason === 'length' && text) {
      const m = text.match(/^[\s\S]*[。！？…!?.]/);
      if (m) text = m[0].trim();
    }
    if (!text || text.length < 8) return;
    const id = `ad_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare(
      'INSERT INTO assistant_diaries (id,uid,period,content,created_at) VALUES (?,?,?,?,?)'
    ).bind(id, uid, period, text.slice(0, 2000), now).run();
  } catch (_) {}
}
