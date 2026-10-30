// 通用工具：CORS、JSON 响应、校验、暂停开关、管理员鉴权

export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(obj, status = 200, cors = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

// uid 只允许字母数字下划线短横，长度 6~64
export function uidOk(uid) {
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(uid);
}

// Workers 默认跑在 UTC，直接 toISOString 会把北京时间 0:00–8:00 算到前一天。
// 全站按北京时间切日，额度、统计、日记代写都跟明轩的手机一致。
const CN_OFFSET = 8 * 60 * 60 * 1000;
const cnTime = (d = new Date()) => new Date(d.getTime() + CN_OFFSET);
export const dayKey = (d = new Date()) => cnTime(d).toISOString().slice(0, 10);
export const minuteKey = (d = new Date()) => cnTime(d).toISOString().slice(0, 16);

// 暂停开关：KV 里 state:paused = {paused:true, reason, until}
export async function isPaused(env) {
  const s = await env.MINXTOK_KV.get('state:paused', 'json');
  if (!s || !s.paused) return null;
  if (s.until && Date.now() > s.until) return null;
  return s;
}

// 运行时配置（额度、频控）存 KV，管理端可改，改完立即生效
export async function getRuntimeConfig(env) {
  const c = (await env.MINXTOK_KV.get('state:config', 'json')) || {};
  return {
    dailyQuota: c.dailyQuota ?? Number(env.DAILY_QUOTA || 100),
    ratePerMin: c.ratePerMin ?? Number(env.RATE_PER_MIN || 15),
    globalDailyCap: c.globalDailyCap ?? Number(env.GLOBAL_DAILY_CAP || 3000),
  };
}

// 管理员鉴权：常量时间比较，避免时序泄漏
export function isAdmin(req, env) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const secret = env.ADMIN_TOKEN || '';
  if (!secret || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// 管理端闸门：先验 token，失败按 IP 计数。同一 IP 十分钟错 10 次就锁，防暴力猜 ADMIN_TOKEN。
export async function adminGate(req, env) {
  if (isAdmin(req, env)) return true;
  const ip = req.headers.get('CF-Connecting-IP') || (req.headers.get('CF-Connecting-IPv6') || 'unknown');
  const key = `adm:f:${ip}`;
  try {
    const n = Number((await env.MINXTOK_KV.get(key)) || '0');
    if (n >= 10) return false;
    await env.MINXTOK_KV.put(key, String(n + 1), { expirationTtl: 600 });
  } catch (_) {}
  return false;
}

// 每日额度上限：只算站点配置的固定日额（2026-10-28 起不再叠加任何兑换加成）。
// 兑换/赠送额度是独立总量池（stock + grants），扣费时先扣池子，池子空了才动每日额度。
export async function getLimit(env, uid) {
  const cfg = await getRuntimeConfig(env);
  const limit = Math.min(cfg.dailyQuota, 5000);
  return { limit, bonus: 0, grants: [], grantSum: 0, dailyQuota: cfg.dailyQuota };
}
