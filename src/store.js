// D1 持久化：会话、消息、用量、事件
import { normalizeBlocks } from './blocks.js';
import { dayKey } from './util.js';

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureConversation(env, uid, convId, firstText) {
  let id = convId && /^conv_[A-Za-z0-9]+$/.test(convId) ? convId : newId('conv');

  // 兼容老版本留下的“游客会话”：登录后继续用同一个 convId 时，
  // 会话行的 uid 还是游客 uid，消息却已经写成登录用户 uid。
  // 这会让 /api/conversations 查不到会话，表现就是“历史没了”。
  // 只在原会话没有注册用户、也没有其他注册用户的留言时，才把会话认领给当前用户。
  if (convId && /^conv_[A-Za-z0-9]+$/.test(convId)) {
    const row = await env.DB.prepare('SELECT id,uid FROM conversations WHERE id=?').bind(convId).first();
    if (row) {
      if (row.uid === uid) return convId;
      const oldOwner = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(row.uid).first();
      const foreign = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM messages m JOIN users u ON u.id=m.uid WHERE m.conv_id=? AND m.uid<>?'
      ).bind(convId, uid).first();
      if (!oldOwner && !(foreign && Number(foreign.n) > 0)) {
        const now = Date.now();
        await env.DB.prepare('UPDATE conversations SET uid=?, updated_at=? WHERE id=? AND uid=?')
          .bind(uid, now, convId, row.uid).run();
        await env.DB.prepare('UPDATE messages SET uid=? WHERE conv_id=? AND uid<>?')
          .bind(uid, convId, uid).run();
        return convId;
      }
      // 这个 convId 属于别的注册用户，绝不能复用，换一个新会话
      id = newId('conv');
    }
  }

  const now = Date.now();
  const title = firstText ? firstText.replace(/\s+/g, ' ').slice(0, 30) : '新对话';
  await env.DB.prepare('INSERT OR IGNORE INTO conversations (id,uid,title,created_at,updated_at) VALUES (?,?,?,?,?)')
    .bind(id, uid, title, now, now).run();
  return id;
}

export async function insertMessage(env, { uid, convId, role, blocks }) {
  const id = newId('msg');
  const now = Date.now();
  // 入库前统一规范化：去重、限量、定序，保证脏数据进不了库
  const safeBlocks = normalizeBlocks(blocks);
  await env.DB.prepare('INSERT INTO messages (id,conv_id,uid,role,blocks,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, convId, uid, role, JSON.stringify(safeBlocks), now).run();
  await env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(now, convId).run();
  return { id, convId, role, blocks: safeBlocks, createdAt: now };
}

export async function updateMessageBlocks(env, id, blocks) {
  await env.DB.prepare('UPDATE messages SET blocks=? WHERE id=?')
    .bind(JSON.stringify(normalizeBlocks(blocks)), id).run();
}

export async function listMessages(env, uid, convId, limit = 30, before = 0) {
  // before：只取比这个时间戳更早的，给"上滑加载更早"用
  const res = before > 0
    ? await env.DB.prepare(
      'SELECT id,role,blocks,created_at FROM messages WHERE uid=? AND conv_id=? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).bind(uid, convId, before, limit).all()
    : await env.DB.prepare(
      'SELECT id,role,blocks,created_at FROM messages WHERE uid=? AND conv_id=? ORDER BY created_at DESC LIMIT ?'
    ).bind(uid, convId, limit).all();
  const rows = (res.results || []).slice().reverse();
  // 读取时再规范化一次，兼容历史数据
  return rows.map(r => ({ id: r.id, role: r.role, blocks: normalizeBlocks(JSON.parse(r.blocks)), createdAt: r.created_at }));
}

export async function listConversations(env, uid, limit = 20) {
  const res = await env.DB.prepare(
    'SELECT id,title,created_at,updated_at FROM conversations WHERE uid=? ORDER BY updated_at DESC LIMIT ?'
  ).bind(uid, limit).all();
  return res.results || [];
}

export async function countMessages(env, uid) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE uid=?').bind(uid).first();
  return Number(row && row.n) || 0;
}

export async function getUsage(env, uid, day) {
  const d = day || dayKey();
  const row = await env.DB.prepare('SELECT count FROM usage WHERE uid=? AND day=?').bind(uid, d).first();
  return row ? row.count : 0;
}

export async function bumpUsage(env, uid, day) {
  const d = day || dayKey();
  await env.DB.prepare(
    'INSERT INTO usage (uid,day,count) VALUES (?,?,1) ON CONFLICT(uid,day) DO UPDATE SET count=count+1'
  ).bind(uid, d).run();
  return getUsage(env, uid, d);
}

// 一次加多次额度（小游戏复活扣费），省掉循环写库
export async function addUsage(env, uid, n, day) {
  const d = day || dayKey();
  const k = Math.max(1, Math.floor(Number(n) || 1));
  await env.DB.prepare(
    'INSERT INTO usage (uid,day,count) VALUES (?,?,?) ON CONFLICT(uid,day) DO UPDATE SET count=count+?'
  ).bind(uid, d, k, k).run();
  return getUsage(env, uid, d);
}

export async function logEvent(env, kind, detail) {
  try {
    await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
      .bind(Date.now(), kind, JSON.stringify(detail || {})).run();
  } catch (_) { /* 日志失败不影响主流程 */ }
}


export async function deleteMessage(env, uid, id) {
  await env.DB.prepare('DELETE FROM messages WHERE id=? AND uid=?').bind(id, uid).run();
}
