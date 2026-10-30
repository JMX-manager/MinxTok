// 额度：基础额度 + 永久加成 + 限时赠送 + 申请与兑换码
import { corsHeaders, json, uidOk, getRuntimeConfig, isAdmin, dayKey } from './util.js';
import { getUsage, addUsage } from './store.js';

const QUOTA_CAP = 5000;

// 额度模型（2026-10-28 改，明轩定的）：
//   ① 兑换池 = 学分/游戏积分换来的额度，永久保存，用不完一直留着，绝不并进每日上限；
//   ② 限时包 = 兑换码/赠送/申请批下来的额度，带有效期，同样独立成池；
//   ③ 每日额度 = 站点固定额度，每天重置，只有前两个池子都空了才会动它。
// 扣额度顺序：兑换池 → 限时包（快到期的先扣）→ 每日额度。
export async function quotaState(env, uid) {
  const cfg = await getRuntimeConfig(env);
  const used = await getUsage(env, uid);
  // 老的永久加成（以前兑换直接加到每日上限）统一清零：读到就删，历史余额不再参与计算
  const legacyBonus = Number((await env.MINXTOK_KV.get(`bonus:${uid}`)) || '0');
  if (legacyBonus) {
    try { await env.MINXTOK_KV.delete(`bonus:${uid}`); } catch (_) {}
  }
  const stock = Math.max(0, Number((await env.MINXTOK_KV.get(`stock:${uid}`)) || '0'));
  const raw = (await env.MINXTOK_KV.get(`grants:${uid}`, 'json')) || [];
  const now = Date.now();
  const grants = raw
    .filter(g => g && (!Number(g.exp) || Number(g.exp) > now))
    .map(g => ({
      amount: Number(g.amount || 0),
      exp: Number(g.exp),
      left: g.left == null ? Number(g.amount || 0) : Math.max(0, Number(g.left)),
    }))
    .filter(g => g.left > 0)
    .sort((a, b) => a.exp - b.exp);
  // 过期或用完的顺手清掉，别让 KV 越攒越大
  if (grants.length !== raw.length) {
    try { await env.MINXTOK_KV.put(`grants:${uid}`, JSON.stringify(grants)); } catch (_) {}
  }
  const dailyLimit = Math.min(cfg.dailyQuota, QUOTA_CAP);
  const dailyLeft = Math.max(dailyLimit - used, 0);
  const grantLeft = grants.reduce((s, g) => s + g.left, 0);
  const poolLeft = stock + grantLeft;
  const left = Math.min(dailyLeft + poolLeft, QUOTA_CAP);
  return {
    used, bonus: 0, stock, stockLeft: stock, grants, dailyLimit, dailyLeft, poolLeft,
    grantSum: grantLeft, limit: dailyLimit, left, max: QUOTA_CAP,
  };
}

// 兑换池加额度（学分/积分兑换、充值到账都走这里）
// KV 没有原子自增，写完回读校验，撞了就重试，尽量别丢钱
export async function addStock(env, uid, n) {
  const add = Math.max(0, Math.floor(Number(n) || 0));
  if (!add) return Math.max(0, Number((await env.MINXTOK_KV.get(`stock:${uid}`)) || '0'));
  let next = 0;
  for (let i = 0; i < 3; i++) {
    const cur = Math.max(0, Number((await env.MINXTOK_KV.get(`stock:${uid}`)) || '0'));
    next = cur + add;
    await env.MINXTOK_KV.put(`stock:${uid}`, String(next));
    const chk = Math.max(0, Number((await env.MINXTOK_KV.get(`stock:${uid}`)) || '0'));
    if (chk >= next) return chk;
  }
  return next;
}

// 扣额度：先扣兑换池，再扣限时包（快过期的先扣），最后才扣每日额度。
// 这样换来的额度用不完就留着，也不会把每日上限顶高。
export async function consumeQuota(env, uid, n = 1) {
  const st = await quotaState(env, uid);
  const needTotal = Math.max(1, Math.floor(Number(n) || 1));
  if (st.left < needTotal) return { ok: false, quota: st };
  let need = needTotal;
  const from = [];
  // ① 兑换池
  if (need > 0 && st.stock > 0) {
    const take = Math.min(st.stock, need);
    const rest = st.stock - take;
    if (rest > 0) await env.MINXTOK_KV.put(`stock:${uid}`, String(rest));
    else await env.MINXTOK_KV.delete(`stock:${uid}`);
    need -= take;
    from.push('stock');
  }
  // ② 限时包：快到期的先扣
  if (need > 0) {
    const grants = st.grants.map(g => ({ ...g }));
    let took = 0;
    for (const g of grants) {
      if (need <= 0) break;
      const take = Math.min(g.left, need);
      g.left -= take;
      need -= take;
      took += take;
    }
    if (took > 0) {
      await env.MINXTOK_KV.put(`grants:${uid}`, JSON.stringify(grants.filter(g => g.left > 0)));
      from.push('grant');
    }
  }
  // ③ 最后才动每日额度
  if (need > 0) {
    await addUsage(env, uid, need);
    from.push('daily');
    need = 0;
  }
  const used = await getUsage(env, uid);
  return { ok: true, used, from: from.length > 1 ? 'mixed' : (from[0] || 'daily'), quota: await quotaState(env, uid) };
}

export async function handleQuota(req, env) {
  const cors = corsHeaders(env);
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const st = await quotaState(env, uid);
  return json(st, 200, cors);
}

// 小游戏复活扣额度：花 3-10 次，服务端二次校验余额，扣完返回最新状态
export async function handleGameSpend(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  const amount = Math.floor(Number(body.amount));
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!Number.isInteger(amount) || amount < 1 || amount > 20) return json({ error: 'invalid_amount' }, 400, cors);
  const res = await consumeQuota(env, uid, amount);
  if (!res.ok) return json({ error: 'quota_exceeded', left: res.quota.left, need: amount }, 402, cors);
  return json({ ok: true, spent: amount, quota: res.quota }, 200, cors);
}

// 游戏积分兑换额度：每天最多 +20，服务端限次，防止客户端刷
export async function handleGameReward(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  const n = Math.floor(Number(body.quota));
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!Number.isInteger(n) || n < 1 || n > 20) return json({ error: 'invalid_amount' }, 400, cors);
  const day = dayKey();
  const key = `gameReward:${uid}:${day}`;
  const used = Number((await env.MINXTOK_KV.get(key)) || '0');
  // 每天最多兑换 20 次额度（按次数和点数同一天封顶）
  if (used + n > 20) return json({ error: 'daily_cap', used, cap: 20 }, 429, cors);
  // 换来的额度进永久兑换池（stock），不抬高每日上限，也不按天作废
  await addStock(env, uid, n);
  await env.MINXTOK_KV.put(key, String(used + n));
  const st = await quotaState(env, uid);
  return json({ ok: true, granted: n, remaining: 20 - used - n, poolLeft: st.poolLeft, quota: st }, 200, cors);
}

// 申请额度
export async function handleApply(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const uid = body.uid;
  const amount = Number(body.amount);
  const reason = String(body.reason || '').slice(0, 200);
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 2000) return json({ error: 'invalid_amount' }, 400, cors);

  const id = `qr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await env.DB.prepare('INSERT INTO quota_requests (id,uid,amount,reason,status,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, uid, amount, reason, 'pending', Date.now()).run();

  // 可选的实时通知：配置 NOTIFY_WEBHOOK 后，把申请推过去
  if (env.NOTIFY_WEBHOOK) {
    try {
      await fetch(env.NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `MinxTok 额度申请：${amount} 次\n账号：${uid}\n理由：${reason || '未填写'}\n编号：${id}`,
        }),
      });
    } catch (_) { /* 通知失败不影响申请 */ }
  }
  return json({ ok: true, id }, 200, cors);
}

// 管理端：看待处理与历史
export async function handleRequests(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  const res = await env.DB.prepare('SELECT id,uid,amount,reason,status,created_at FROM quota_requests ORDER BY created_at DESC LIMIT 50').all();
  return json({ requests: res.results || [] }, 200, cors);
}

// 管理端：批准/拒绝
export async function handleDecide(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { id, approve, ttlSec } = body;
  const row = await env.DB.prepare('SELECT id,uid,amount,status FROM quota_requests WHERE id=?').bind(id).first();
  if (!row || row.status !== 'pending') return json({ error: 'not_found' }, 404, cors);

  // 先原子占位，双击/并发只会有一次 changes=1，避免重复发额度
  const gate = await env.DB.prepare(
    "UPDATE quota_requests SET status=?, decided_at=? WHERE id=? AND status='pending'"
  ).bind(approve ? 'approved' : 'rejected', Date.now(), id).run();
  if (!gate || !gate.meta || gate.meta.changes === 0) return json({ error: 'already_decided' }, 410, cors);

  if (approve) {
    const grants = ((await env.MINXTOK_KV.get(`grants:${row.uid}`, 'json')) || []).filter(g => g && g.exp > Date.now());
    const exp = Date.now() + (Number(ttlSec) > 0 ? Number(ttlSec) * 1000 : 30 * 86400 * 1000);
    grants.push({ amount: row.amount, exp, left: Number(row.amount || 0) });
    await env.MINXTOK_KV.put(`grants:${row.uid}`, JSON.stringify(grants));
  }
  return json({ ok: true }, 200, cors);
}

// 兑换码：支持限时额度
export async function handleRedeem(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, code } = body || {};
  if (!uidOk(uid) || !code) return json({ error: 'invalid_params' }, 400, cors);

  const key = `code:${String(code).trim().toUpperCase()}`;
  const c = await env.MINXTOK_KV.get(key, 'json');
  if (!c) return json({ error: 'code_not_found' }, 404, cors);
  if (c.expiresAt && Date.now() > c.expiresAt) return json({ error: 'code_expired' }, 410, cors);
  if (c.maxUses && (c.used || 0) >= c.maxUses) return json({ error: 'code_used_up' }, 410, cors);
  const claimKey = `redeemed:${key}:${uid}`;
  if (await env.MINXTOK_KV.get(claimKey)) return json({ error: 'already_redeemed' }, 410, cors);

  const grants = ((await env.MINXTOK_KV.get(`grants:${uid}`, 'json')) || []).filter(g => g && g.exp > Date.now());
  const exp = Date.now() + (Number(c.ttlSec) > 0 ? Number(c.ttlSec) * 1000 : 365 * 86400 * 1000);
  grants.push({ amount: Number(c.value || 0), exp, left: Number(c.value || 0) });
  await env.MINXTOK_KV.put(`grants:${uid}`, JSON.stringify(grants));
  await env.MINXTOK_KV.put(claimKey, '1', { expirationTtl: 365 * 86400 });
  await env.MINXTOK_KV.put(key, JSON.stringify({ ...c, used: (c.used || 0) + 1 }));

  const st = await quotaState(env, uid);
  return json({ ok: true, added: Number(c.value || 0), ttlSec: c.ttlSec || 0, ...st }, 200, cors);
}

// 管理端：生成兑换码
export async function handleCreateCode(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { value = 100, ttlSec = 0, maxUses = 1, count = 1 } = body || {};

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = [];
  for (let i = 0; i < Math.min(Number(count) || 1, 20); i++) {
    let code = '';
    for (let j = 0; j < 10; j++) code += chars[Math.floor(Math.random() * chars.length)];
    const payload = { value: Number(value), ttlSec: Number(ttlSec) || 0, maxUses: Number(maxUses) || 1, used: 0, createdAt: Date.now() };
    await env.MINXTOK_KV.put(`code:${code}`, JSON.stringify(payload));
    codes.push(code);
  }
  return json({ ok: true, codes }, 200, cors);
}
