// 额度礼物卡：统一调配的运营推送 + 口令兑换，两者格式完全一致
// 流程：服务端建卡存 D1（pending）→ 推给用户 → 用户点开看到礼物界面 → 点领取才真正加额度
import { corsHeaders, json, uidOk, isAdmin } from './util.js';
import { quotaState } from './quota.js';
import { newId } from './store.js';

const GIFT_ACTION = 'gift';

// 有惊喜感的默认文案，管理员只给标题和额度，其余自动补齐
const SURPRISES = [
  '🎁 附赠一句：今天的你值得被偏爱',
  '✨ 彩蛋：这次多了 3 次，藏在里面',
  '🍤 虾虾悄悄塞了一份小的',
  '🌙 深夜加量，别熬夜',
  '🎉 拆开还有一层，运气不错',
];

function pickSurprise(seed) {
  const i = Math.abs(String(seed || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % SURPRISES.length;
  return SURPRISES[i];
}

// 建一张礼物卡（不直接加额度，领取时才算）
export async function createGift(env, { uid = null, title, subtitle = '', amount, unit = '额度', emoji = '🎁', surprise = '', note = '', theme = '' }) {
  const id = newId('gift');
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO gift_cards (id,uid,title,subtitle,amount,unit,emoji,surprise,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, uid, String(title || '明叙赠您额度').slice(0, 40), String(subtitle || '').slice(0, 80),
    Number(amount) || 0, String(unit || '额度').slice(0, 4), String(emoji || '🎁').slice(0, 8),
    String(surprise || pickSurprise(id)).slice(0, 40), String(note || '').slice(0, 120), 'pending', now).run();
  return giftBlock({ id, title, subtitle, amount, unit, emoji, surprise, note, theme });
}

// 卡片数据 → block（格式与音乐卡、文章卡同一套）
export function giftBlock(g) {
  return {
    type: 'quota',
    action: GIFT_ACTION,
    giftId: g.id,
    title: g.title || '明叙赠您额度',
    subtitle: g.subtitle || '',
    amount: Number(g.amount) || 0,
    unit: g.unit || '额度',
    emoji: g.emoji || '🎁',
    surprise: g.surprise || '',
    note: g.note || '',
    theme: g.theme || (g.emoji === '🎃' ? 'halloween' : ''),
    // 节日活动卡：进聊天就自动从底部弹出来（口令测试卡不弹，手动点）
    autoOpen: String(g.note || '').indexOf('holiday:') === 0,
    used: 0,
    limit: 0,
  };
}

// 取用户下一张待领的礼物卡（本轮聊完随消息推下去，位置在最后）
export async function pendingGiftFor(env, uid) {
  try {
    // 同一 uid 只留最早一张待领卡，其余重复的（历史遗留）标记掉，避免一直弹同一张
    const rows = await env.DB.prepare(
      "SELECT * FROM gift_cards WHERE (uid=? OR uid IS NULL) AND status='pending' ORDER BY created_at ASC"
    ).bind(uid).all();
    const list = rows.results || [];
    if (!list.length) return null;
    // 全站卡（uid IS NULL）不能只让第一个人领走：给每个用户复制一张个人卡，只发一次
    const global = list.find(r => !r.uid);
    if (global) {
      const seenKey = `giftglobal:${global.id}:${uid}`;
      if (await env.MINXTOK_KV.get(seenKey)) return null;
      const copy = await createGift(env, {
        uid, title: global.title, subtitle: global.subtitle, amount: global.amount,
        unit: global.unit, emoji: global.emoji, surprise: global.surprise, note: global.note,
      });
      await env.MINXTOK_KV.put(seenKey, '1', { expirationTtl: 30 * 86400 });
      return copy;
    }
    const keep = list[0];
    const dup = list.slice(1).map(r => r.id);
    if (dup.length) {
      for (const id of dup) {
        await env.DB.prepare("UPDATE gift_cards SET status='merged' WHERE id=? AND status='pending'").bind(id).run();
      }
    }
    return giftBlock(keep);
  } catch (_) { return null; }
}

// 领取：把额度真正加到用户头上
export async function handleGiftClaim(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, giftId } = body || {};
  if (!uidOk(uid) || !giftId) return json({ error: 'invalid_params' }, 400, cors);

  const row = await env.DB.prepare('SELECT * FROM gift_cards WHERE id=?').bind(giftId).first();
  if (!row) return json({ error: 'not_found' }, 404, cors);
  if (row.uid && row.uid !== uid) return json({ error: 'not_yours' }, 403, cors);
  if (row.status !== 'pending') return json({ error: 'already_claimed' }, 410, cors);

  // 原子闸门：只有把 pending 改成 claimed 成功的那一次请求才继续发额度
  // 重复点击/并发请求到这里会 changes=0，直接返回已领，绝不重复加
  const gate = await env.DB.prepare(
    "UPDATE gift_cards SET status='claimed', claimed_at=? WHERE id=? AND status='pending'"
  ).bind(Date.now(), giftId).run();
  if (!gate || !gate.meta || gate.meta.changes === 0) return json({ error: 'already_claimed' }, 410, cors);

  const exp = Date.now() + 365 * 86400 * 1000;
  const grants = ((await env.MINXTOK_KV.get(`grants:${uid}`, 'json')) || []).filter(g => g && g.exp > Date.now());
  grants.push({ amount: Number(row.amount || 0), exp });
  await env.MINXTOK_KV.put(`grants:${uid}`, JSON.stringify(grants));

  // 领取时揭晓的彩蛋：有就返回，前端用它做「拆开还有一层」的效果
  const bonus = Number(row.amount || 0) > 0 && Math.random() < 0.25 ? Math.max(1, Math.round(Number(row.amount) * 0.1)) : 0;
  if (bonus) {
    grants.push({ amount: bonus, exp });
    await env.MINXTOK_KV.put(`grants:${uid}`, JSON.stringify(grants));
  }
  const st = await quotaState(env, uid);
  return json({ ok: true, added: Number(row.amount || 0), bonus, surprise: row.surprise || '', ...st }, 200, cors);
}

// 管理端：给全站或指定用户推一张礼物卡
export async function handleGiftPush(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid = null, title, subtitle = '', amount = 100, unit = '额度', emoji = '🎁', surprise = '', note = '' } = body || {};
  if (!title) return json({ error: 'missing_title' }, 400, cors);
  if (uid && !uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const g = await createGift(env, { uid, title, subtitle, amount, unit, emoji, surprise, note });
  return json({ ok: true, gift: g }, 200, cors);
}

/* ====================== 节日活动（当天第一次对话自动发卡） ======================
   卡片一生只发一张：note 带 holiday: 前缀，发过/领过都不再建，
   进聊天自动从底部弹出（前端 autoOpen）。 */
const HOLIDAY_EVENTS = [
  {
    key: 'halloween2026',
    title: '万圣节限定福利',
    subtitle: '南瓜灯里藏着的 25 点额度',
    amount: 25,
    unit: '额度',
    emoji: '🎃',
    theme: 'halloween',
    startsAt: Date.parse('2026-10-29T00:00:00+08:00'),
    endsAt: Date.parse('2026-11-02T23:59:59+08:00'),
  },
];

export async function ensureHolidayGift(env, uid) {
  if (!uidOk(uid)) return null;
  const now = Date.now();
  const ev = HOLIDAY_EVENTS.find(e => now >= e.startsAt && now <= e.endsAt);
  if (!ev) return null;
  const note = `holiday:${ev.key}`;
  const exist = await env.DB.prepare(
    'SELECT id FROM gift_cards WHERE uid=? AND note=? LIMIT 1'
  ).bind(uid, note).first();
  if (exist) return null;
  return createGift(env, {
    uid, title: ev.title, subtitle: ev.subtitle, amount: ev.amount,
    unit: ev.unit, emoji: ev.emoji, theme: ev.theme, note,
  });
}

/* ====================== 节日限定口令（写死，不走 KV） ======================
   口令直接匹配就能用，按 expiresAt 自动过期；一人一张，领过的再发不会重复建卡。 */
const PROMO_CODES = {
  pumpkin25: {
    title: '万圣节限定福利',
    subtitle: '南瓜灯里藏着的 25 点额度',
    amount: 25,
    unit: '额度',
    emoji: '🎃',
    theme: 'halloween',
    surprise: '不给糖就捣蛋，额度归你',
    expiresAt: Date.parse('2026-11-02T23:59:59+08:00'),
  },
};

/* ============================ 口令 ============================ */
// 口令 = 几个乱码 + 一句人话，如 sd1%中秋节快乐 / m3x#暑期末班车
// 注册在 KV：giftcode:<口令> → { title, amount, ... }，每个用户限领一次
export async function handleGiftCode(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, code } = body || {};
  if (!uidOk(uid) || !code) return json({ error: 'invalid_params' }, 400, cors);

  const codeText = String(code).trim().replace(/^giftcode:\s*/i, '');
  const key = `giftcode:${codeText}`;
  const promo = PROMO_CODES[codeText.toLowerCase()];
  const c = promo || await env.MINXTOK_KV.get(key, 'json');
  if (!c) return json({ error: 'code_not_found' }, 404, cors);
  if (c.expiresAt && Date.now() > c.expiresAt) return json({ error: 'code_expired' }, 410, cors);
  if (c.claimed && c.claimed.includes(uid)) return json({ error: 'already_claimed' }, 410, cors);
  // 同一个人同一口令只能有一张未领的卡，重复发口令不重复建卡
  // 节日口令：领过就不再发（普通口令走 KV 的 claimed 列表）
  if (promo) {
    const done = await env.DB.prepare(
      "SELECT id FROM gift_cards WHERE uid=? AND note=? AND status='claimed' LIMIT 1"
    ).bind(uid, key).first();
    if (done) return json({ error: 'already_claimed' }, 410, cors);
  }
  const dup = await env.DB.prepare(
    "SELECT id FROM gift_cards WHERE uid=? AND status='pending' AND note=? LIMIT 1"
  ).bind(uid, key).first();
  if (dup) return json({ ok: true, gift: giftBlock({ id: dup.id, title: c.title, subtitle: c.subtitle, amount: c.amount, unit: c.unit, emoji: c.emoji, surprise: c.surprise }) }, 200, cors);

  const g = await createGift(env, {
    uid, title: c.title || '口令奖励', subtitle: c.subtitle || '', amount: c.amount || 50,
    unit: c.unit || '额度', emoji: c.emoji || '🎁', surprise: c.surprise || '', note: key,
    theme: c.theme || '',
  });
  if (!promo) {
    const claimed = Array.isArray(c.claimed) ? c.claimed.slice(-200) : [];
    claimed.push(uid);
    await env.MINXTOK_KV.put(key, JSON.stringify({ ...c, claimed }));
  }
  return json({ ok: true, gift: g }, 200, cors);
}

// 管理端：注册一个口令
export async function handleGiftCodeCreate(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { code, title, subtitle = '', amount = 50, unit = '额度', emoji = '🎁', surprise = '', expiresAt = 0 } = body || {};
  if (!code || !title) return json({ error: 'missing_params' }, 400, cors);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return json({ error: 'invalid_amount' }, 400, cors);
  const payload = { title, subtitle, amount: amt, unit, emoji, surprise, claimed: [], expiresAt: Number(expiresAt) || 0, createdAt: Date.now() };
  await env.MINXTOK_KV.put(`giftcode:${String(code).trim()}`, JSON.stringify(payload));
  return json({ ok: true, code }, 200, cors);
}

// 内置口令：短乱码 + 一句人话，开箱即用
export const BUILTIN_CODES = [
  { code: 'sd1%中秋节快乐', title: '月光正好，这份给你', amount: 150, emoji: '🥮', subtitle: '被虾虾偷偷塞进来的，收好' },
  { code: 'm3x#暑期末班车', title: '暑假最后一班车', amount: 100, emoji: '🎫', subtitle: '开学前，多陪你一会' },
];

// 聊天里说的话像口令 → 去 KV 里查
export function looksLikeGiftCode(message) {
  const m = String(message || '').trim();
  if (m.length < 4 || m.length > 30) return false;
  // 带点乱码味（数字/符号混杂）或明确说"口令"
  if (/(口令|兑换码)/.test(m)) return true;
  if (/^giftcode:\s*\S+/i.test(m)) return true;
  return /^[A-Za-z0-9]{1,6}[^ ]{0,24}$/.test(m) && /[0-9]/.test(m);
}
