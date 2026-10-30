// 站内数据聚合：一把查（额度 / 心情 / 对话 / 日记 / 游戏 / 学习）
// 只给管理员用（助手侧带 ADMIN_TOKEN 调），不下发给普通客户端
import { corsHeaders, json, isAdmin, uidOk } from './util.js';
import { quotaState } from './quota.js';
import { EMOTIONS } from './emotion.js';

const toolStrip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function toolPlainBlocks(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return toolStrip(raw).slice(0, 300);
    return toolStrip(arr.map((b) => b && (b.text || b.content || '')).filter(Boolean).join(' ')).slice(0, 300);
  } catch (_) {
    return toolStrip(raw).slice(0, 300);
  }
}

export async function handleToolOverview(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 8, 1), 30);
  const out = { uid, at: Date.now() };

  // 额度
  try {
    const st = await quotaState(env, uid);
    out.quota = {
      used: st.used, limit: st.limit, left: st.left, bonus: st.bonus, grantSum: st.grantSum,
      grants: (st.grants || []).map((g) => ({
        amount: g.amount,
        exp: g.exp,
        daysLeft: +((g.exp - Date.now()) / 86400000).toFixed(2),
        endsOn: new Date(g.exp).toISOString().slice(0, 10),
      })),
    };
  } catch (_) { out.quota = null; }

  // 最近心情（近 7 天标签分布）
  try {
    const since = Date.now() - 7 * 86400000;
    const rows = await env.DB.prepare(
      'SELECT emo, COUNT(*) AS n FROM message_emotion WHERE uid=? AND created_at>=? GROUP BY emo ORDER BY n DESC'
    ).bind(uid, since).all();
    const counts = {};
    for (const r of rows.results || []) counts[r.emo] = Number(r.n) || 0;
    const items = EMOTIONS.map((e) => ({ key: e.key, zh: e.zh, count: counts[e.key] || 0 }));
    const total = items.reduce((s, x) => s + x.count, 0);
    out.emotion = {
      total,
      top: items.filter((x) => x.count > 0).slice(0, 3)
        .map((x) => ({ key: x.key, zh: x.zh, count: x.count, share: total ? +(x.count / total).toFixed(3) : 0 })),
    };
  } catch (e) { out.emotion = { error: String(e.message || e) }; }

  // 历史对话（最近 N 条）
  try {
    const rows = await env.DB.prepare(
      'SELECT role,blocks,created_at FROM messages WHERE uid=? ORDER BY created_at DESC LIMIT ?'
    ).bind(uid, limit).all();
    out.chat = (rows.results || []).reverse().map((r) => ({
      who: r.role === 'user' ? 'user' : 'assistant',
      at: r.created_at,
      text: toolPlainBlocks(r.blocks),
    }));
  } catch (e) { out.chat = { error: String(e.message || e) }; }

  // 手写日记（最近 3 篇）
  try {
    const rows = await env.DB.prepare(
      'SELECT day,content,mood,updated_at FROM diaries WHERE uid=? ORDER BY day DESC LIMIT 3'
    ).bind(uid).all();
    out.diaries = (rows.results || []).map((r) => ({
      day: r.day, mood: r.mood || '', text: toolStrip(r.content).slice(0, 400),
    }));
  } catch (e) { out.diaries = { error: String(e.message || e) }; }

  // 助理日记（最近 2 篇）
  try {
    const rows = await env.DB.prepare(
      'SELECT period,content,created_at FROM assistant_diaries WHERE uid=? ORDER BY created_at DESC LIMIT 2'
    ).bind(uid).all();
    out.assistantDiaries = (rows.results || []).map((r) => ({
      period: r.period || 'day', at: r.created_at, text: toolStrip(r.content).slice(0, 300),
    }));
  } catch (e) { out.assistantDiaries = { error: String(e.message || e) }; }

  // 学习记录
  try {
    const rows = await env.DB.prepare(
      'SELECT kind,title,note,created_at FROM study_items WHERE uid=? ORDER BY created_at DESC LIMIT ?'
    ).bind(uid, limit).all();
    const counts = await env.DB.prepare(
      'SELECT kind, COUNT(*) AS n FROM study_items WHERE uid=? GROUP BY kind'
    ).bind(uid).all();
    out.study = {
      counts: Object.fromEntries((counts.results || []).map((r) => [r.kind, Number(r.n) || 0])),
      recent: (rows.results || []).map((r) => ({ kind: r.kind, title: r.title, note: toolStrip(r.note).slice(0, 80), at: r.created_at })),
    };
  } catch (e) { out.study = { error: String(e.message || e) }; }

  // 游戏记录（客户端打点写入 events.kind='game'）
  try {
    const rows = await env.DB.prepare(
      "SELECT detail,ts FROM events WHERE kind='game' AND detail LIKE ? ORDER BY ts DESC LIMIT ?"
    ).bind(`%"uid":"${uid}"%`, Math.min(limit, 15)).all();
    out.games = (rows.results || []).map((r) => {
      try {
        const d = JSON.parse(r.detail);
        return { game: d.game, text: toolStrip(d.text).slice(0, 120), at: r.ts };
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (e) { out.games = { error: String(e.message || e) }; }

  return json(out, 200, cors);
}

// 游戏成绩打点：客户端 recordHistory 顺手写一条，供站内数据查询
export async function handleGameLog(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  const game = String(body.game || '').slice(0, 32);
  const text = String(body.text || '').slice(0, 200);
  if (!uidOk(uid) || !game) return json({ error: 'invalid_params' }, 400, cors);
  try {
    await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
      .bind(Date.now(), 'game', JSON.stringify({ uid, game, text })).run();
  } catch (_) { return json({ ok: false }, 200, cors); }
  return json({ ok: true }, 200, cors);
}

// 管理端：查用户（只为助手侧定位 uid，手机号脱敏返回）
export async function handleToolUsers(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
  try {
    const rows = q
      ? await env.DB.prepare('SELECT id,phone,created_at FROM users WHERE phone LIKE ? ORDER BY created_at DESC LIMIT ?').bind(`%${q}%`, limit).all()
      : await env.DB.prepare('SELECT id,phone,created_at FROM users ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    const users = (rows.results || []).map((u) => ({
      uid: u.id,
      phone: String(u.phone || '').replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
      created_at: u.created_at,
    }));
    return json({ users }, 200, cors);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500, cors);
  }
}
