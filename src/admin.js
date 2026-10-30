// 管理接口：状态查询、暂停/恢复、运行时配置、统计、测试注入
import { corsHeaders, json, isAdmin, isPaused, getRuntimeConfig, dayKey, adminGate } from './util.js';
import { quotaState } from './quota.js';
import { buildMessageBlocks } from './blocks.js';
import { insertMessage, ensureConversation } from './store.js';

// 前端轮询：每 5 秒一次，返回暂停状态与剩余额度
export async function handleStatus(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') || '';
  const paused = await isPaused(env);
  let quota = null;
  if (uid && /^[A-Za-z0-9_-]{6,64}$/.test(uid)) {
    // 统一走 quotaState：每日额度按天重置，赠送/兑换单独算池，不并进每日上限
    const qs = await quotaState(env, uid);
    quota = {
      used: qs.used,
      limit: qs.dailyLimit,
      left: qs.left,
      dailyLeft: qs.dailyLeft,
      poolLeft: qs.poolLeft,
    };
  }
  return json({
    paused: !!paused,
    reason: paused ? (paused.reason || '服务暂停中') : null,
    until: paused ? (paused.until || null) : null,
    quota,
    model: env.LLM_MODEL || 'deepseek-chat',
    serverTime: Date.now(),
  }, 200, cors);
}

// 管理端：读全部状态
export async function handleAdminState(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  const paused = await isPaused(env);
  const cfg = await getRuntimeConfig(env);
  return json({ paused: paused || { paused: false }, config: cfg, model: env.LLM_MODEL || 'deepseek-chat' }, 200, cors);
}

// 管理端：暂停（可带时长，到期自动恢复）
export async function handleAdminPause(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch (_) { /* 允许空体 */ }
  const state = {
    paused: true,
    reason: (body.reason || '服务暂停中').slice(0, 100),
    until: body.durationSec ? Date.now() + Number(body.durationSec) * 1000 : null,
    at: Date.now(),
  };
  await env.MINXTOK_KV.put('state:paused', JSON.stringify(state));
  return json({ ok: true, state }, 200, cors);
}

// 管理端：恢复
export async function handleAdminResume(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  await env.MINXTOK_KV.put('state:paused', JSON.stringify({ paused: false, at: Date.now() }));
  return json({ ok: true, paused: false }, 200, cors);
}

// 管理端：改额度/频控（不传则不改）
export async function handleAdminConfig(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'invalid_json' }, 400, cors); }
  const cur = await getRuntimeConfig(env);
  const next = {
    dailyQuota: body.dailyQuota != null ? Number(body.dailyQuota) : cur.dailyQuota,
    ratePerMin: body.ratePerMin != null ? Number(body.ratePerMin) : cur.ratePerMin,
  };
  await env.MINXTOK_KV.put('state:config', JSON.stringify(next));
  return json({ ok: true, config: next }, 200, cors);
}

// 管理端：测试用——向指定会话注入一条消息（带卡片/追问），供界面调试
// 卡片和追问同时存在也只会各保留一个，顺序由服务端裁定
export async function handleAdminTestMessage(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, text, card, followups, conversationId } = body || {};
  if (!uid || !/^[A-Za-z0-9_-]{6,64}$/.test(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const convId = await ensureConversation(env, uid, conversationId, text || '测试消息');
  const blocks = buildMessageBlocks({
    text: text || '',
    followups: Array.isArray(followups) ? followups : [],
    card: card || null,
  });
  const saved = await insertMessage(env, { uid, convId, role: 'assistant', blocks });
  return json({ ok: true, message: saved }, 200, cors);
}

export async function handleAdminStats(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  const day = dayKey();
  const [msgs, convs, usageSum, recentEvents] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM messages WHERE created_at >= ?').bind(Date.now() - 86400000).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM conversations').first(),
    env.DB.prepare('SELECT COALESCE(SUM(count),0) AS c FROM usage WHERE day=?').bind(day).first(),
    env.DB.prepare('SELECT ts,kind,detail FROM events ORDER BY id DESC LIMIT 20').all(),
  ]);
  return json({
    day,
    messages24h: msgs ? msgs.c : 0,
    conversations: convs ? convs.c : 0,
    callsToday: usageSum ? usageSum.c : 0,
    recentEvents: (recentEvents.results || []).map(e => ({ ts: e.ts, kind: e.kind })),
  }, 200, cors);
}
