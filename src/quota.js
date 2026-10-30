// 额度：余额制（注册礼 20 + 管理员发放/充值 + 兑换码），用完即停
import { corsHeaders, json, uidOk, getRuntimeConfig, isAdmin, dayKey, adminGate } from './util.js';
import { getUsage, addUsage } from './store.js';

const QUOTA_CAP = 5000;

// 额度模型（2026-10-30 改，明轩定的「余额制」）：
//   ① 不再每天自动补额度。余额只减不增，用完就停，等管理员手动发放。
//   ② 余额 = 兑换池(stock) + 限时包(grants)。这两个池子对用户就是同一个余额，扣的时候先扣快到期的。
//   ③ 只有三种情况会让余额增加：注册礼（20）、管理员发放/充值到账、兑换码。
//   ④ 学习中心（对话/刷题/老师）和游戏都要扣，且任何玩法都不能把额度赚回来。
export const SIGNUP_QUOTA = 20;

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
  const grantLeft = grants.reduce((s, g) => s + g.left, 0);
  const balance = Math.min(stock + grantLeft, QUOTA_CAP);
  const dailyQuota = Math.min(cfg.dailyQuota, QUOTA_CAP);
  return {
    used,
    bonus: 0,
    stock,
    stockLeft: stock,
    grants,
    // 每日额度已经取消，这几个字段只为兼容老前端保留，一律报 0
    dailyLimit: 0,
    dailyLeft: 0,
    dailyQuota,
    balanceMode: true,
    poolLeft: stock + grantLeft,
    grantSum: grantLeft,
    limit: balance,
    left: balance,
    balance,
    max: QUOTA_CAP,
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

// 扣额度：先扣快到期的限时包，再扣永久池。余额不够就整次失败，不做任何透支。
export async function consumeQuota(env, uid, n = 1) {
  const st = await quotaState(env, uid);
  const needTotal = Math.max(1, Math.floor(Number(n) || 1));
  if (st.left < needTotal) return { ok: false, quota: st, need: needTotal };
  let need = needTotal;
  const from = [];
  // ① 限时包：快到期的先扣
  if (need > 0 && st.grants.length) {
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
  // ② 永久池
  if (need > 0 && st.stock > 0) {
    const take = Math.min(st.stock, need);
    const rest = st.stock - take;
    if (rest > 0) await env.MINXTOK_KV.put(`stock:${uid}`, String(rest));
    else await env.MINXTOK_KV.delete(`stock:${uid}`);
    need -= take;
    from.push('stock');
  }
  // 两步之间被别人抢走余额，就老实失败，别把负数写进余额
  if (need > 0) return { ok: false, quota: await quotaState(env, uid), need: needTotal };
  try { await addUsage(env, uid, needTotal); } catch (_) {}
  return { ok: true, used: await getUsage(env, uid), from: from.join('+') || 'stock', quota: await quotaState(env, uid) };
}

// 注册礼：新人上线先给 20，用完等管理员发
export async function grantSignupQuota(env, uid) {
  try { await addStock(env, uid, SIGNUP_QUOTA); } catch (_) {}
  return SIGNUP_QUOTA;
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

// 游戏积分兑换额度：2026-10-30 起关闭。额度只能由管理员发放或充值到账，
// 任何玩法都不许把额度赚回来（否则就成了刷额度入口）。
export async function handleGameReward(req, env) {
  const cors = corsHeaders(env);
  return json({ error: 'reward_disabled', message: '积分兑换额度已关闭' }, 410, cors);
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
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
  const res = await env.DB.prepare('SELECT id,uid,amount,reason,status,created_at FROM quota_requests ORDER BY created_at DESC LIMIT 50').all();
  return json({ requests: res.results || [] }, 200, cors);
}

// 管理端：批准/拒绝
export async function handleDecide(req, env) {
  const cors = corsHeaders(env);
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
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
    // 不填有效期就是永久发放（直接进余额），填了才走限时包
    if (Number(ttlSec) > 0) {
      const grants = ((await env.MINXTOK_KV.get(`grants:${row.uid}`, 'json')) || []).filter(g => g && g.exp > Date.now());
      grants.push({ amount: row.amount, exp: Date.now() + Number(ttlSec) * 1000, left: Number(row.amount || 0) });
      await env.MINXTOK_KV.put(`grants:${row.uid}`, JSON.stringify(grants));
    } else {
      await addStock(env, row.uid, Number(row.amount || 0));
    }
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
  if (!(await adminGate(req, env))) return json({ error: 'unauthorized' }, 401, cors);
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
