// 充值（人工代充记账）——2026-10-28
// 流程：用户在充值页点「生成充值码」→ 拿到二维码/条形码（30 分钟有效，每人不同）
//       → 截图发给管理员 → 管理员扫码进 /pay.html → 输入当日充值密钥 + 金额 + 支付密码
//       → 到账进兑换池（stock），同时写 payments 流水，用户 App 长轮询实时弹窗。
import { json, corsHeaders, uidOk, dayKey, isAdmin } from './util.js';
import { quotaState, addStock } from './quota.js';

const TOKEN_TTL = 30 * 60 * 1000;   // 充值码有效期 30 分钟
const TOKEN_KEY = (uid) => `paytok:${uid}`;
const TOKEN_IDX = (t) => `paytok:t:${t}`;
const NOTIFY_KEY = (uid) => `paynotify:${uid}`;
const GATE_KEY = (t) => `paygate:${t}`;      // 密钥验证通过才发的进门凭证
const USED_KEY = (t) => `payused:${t}`;      // 已支付过的码，永久作废（留一天做提示）
const FAIL_KEY = (ip) => `payfail:${ip}`;

const MAX_AMOUNT = 999;
const MIN_AMOUNT = 1;
// 去掉 0/O/1/I 这类容易看错的字符
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const payEnc = new TextEncoder();

function payRandHex(bytes) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

// 常数时间比较，避免按位试探
function ctEq(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function hmacBytes(secret, msg) {
  const key = await crypto.subtle.importKey('raw', payEnc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, payEnc.encode(msg));
  return new Uint8Array(sig);
}

// 每天的充值密钥：HMAC(PAY_KEY_SECRET, 日期) 取前 8 位，服务器自己算，谁也查不到明文表
export async function payKeyOfDay(env, day) {
  const secret = String(env.PAY_KEY_SECRET || 'minxtok-pay-default-secret');
  const bytes = await hmacBytes(secret, `minxtok-pay:${day}`);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// 今天的密钥；每天 0:00 后 30 分钟内，昨天的密钥还能用（跨零点扫码不至于卡住）
async function payKeyValid(env, input) {
  const v = String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(v)) return false;
  const today = await payKeyOfDay(env, dayKey());
  if (ctEq(v, today)) return true;
  const now = Date.now();
  // 北京时间 0:00–0:30 宽限
  const cnNow = new Date(now + 8 * 3600 * 1000);
  if (cnNow.getUTCHours() === 0 && cnNow.getUTCMinutes() < 30) {
    const yest = await payKeyOfDay(env, dayKey(new Date(now - 86400000)));
    if (ctEq(v, yest)) return true;
  }
  return false;
}

function payPassword(env) {
  return String(env.PAY_PASSWORD || '002313');
}

// 流水号：MX + 北京时间 yyyyMMddHHmmss + 4 位随机
function orderNo() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `MX${stamp}${p(Math.floor(Math.random() * 10000), 4)}`;
}

// 手机号只留前三后四，中间四位打星
export function payMaskPhone(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length < 7) return '';
  return `${p.slice(0, 3)} **** ${p.slice(-4)}`;
}

// 支付页展示的充值对象：手机号优先，其次邮箱，最后退到账号
export function payDisplayName(row, uid) {
  const phone = payMaskPhone(row && row.phone);
  if (phone) return phone;
  const mail = String((row && row.email) || '').replace(/@.*/, '');
  if (mail && !/^\d{11}$/.test(mail)) return mail.length > 10 ? `${mail.slice(0, 4)}***${mail.slice(-3)}` : mail;
  return `账号 ${String(uid || '').slice(0, 10)}`;
}

/* ---------- ① 生成/续期充值码（要登录） ---------- */
export async function handlePayToken(req, env) {
  const cors = corsHeaders(env);
  const user = req.user;
  const uid = (user && user.id) || new URL(req.url).searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);

  // 旧码作废，保证「每个用户同一时间只有一个有效码」
  const old = await env.MINXTOK_KV.get(TOKEN_KEY(uid), 'json');
  if (old && old.t) { try { await env.MINXTOK_KV.delete(TOKEN_IDX(old.t)); } catch (_) {} }

  const t = payRandHex(16);
  const exp = Date.now() + TOKEN_TTL;
  await env.MINXTOK_KV.put(TOKEN_KEY(uid), JSON.stringify({ t, exp }));
  await env.MINXTOK_KV.put(TOKEN_IDX(t), JSON.stringify({ uid, exp }), { expirationTtl: 3600 });

  const row = await env.DB.prepare('SELECT phone, email FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const phone = payDisplayName(row, uid);
  return json({ ok: true, token: t, exp, phone, ttl: Math.round(TOKEN_TTL / 1000) }, 200, cors);
}

/* ---------- ② 扫码页读充值对象（公开，只认 token） ---------- */
export async function handlePayQuote(req, env) {
  const cors = corsHeaders(env);
  const t = (new URL(req.url).searchParams.get('t') || '').trim();
  if (!/^[a-f0-9]{32}$/.test(t)) return json({ error: 'invalid_token' }, 400, cors);
  if (await env.MINXTOK_KV.get(USED_KEY(t))) return json({ error: 'used' }, 409, cors);
  const idx = await env.MINXTOK_KV.get(TOKEN_IDX(t), 'json');
  if (!idx || !idx.uid) return json({ error: 'invalid_token' }, 404, cors);
  if (Number(idx.exp) <= Date.now()) return json({ error: 'expired' }, 410, cors);
  const gate = await env.MINXTOK_KV.get(GATE_KEY(t), 'json');
  const row = await env.DB.prepare('SELECT phone, email FROM users WHERE id=?').bind(idx.uid).first().catch(() => null);
  return json({
    ok: true,
    phone: payDisplayName(row, idx.uid),
    exp: Number(idx.exp),
    gate: !!(gate && Number(gate.exp) > Date.now()),
  }, 200, cors);
}

/* ---------- ③ 支付（公开，密钥 + 支付密码 + 金额） ---------- */
// 第一关：验证当日密钥，通过才放行到金额页
export async function handlePayGate(req, env) {
  const cors = corsHeaders(env);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const fails = Number((await env.MINXTOK_KV.get(FAIL_KEY(ip))) || '0');
  if (fails >= 5) return json({ error: 'locked', retryAfter: 600 }, 429, cors);

  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const t = String(body.t || '').trim();
  if (!/^[a-f0-9]{32}$/.test(t)) return json({ error: 'invalid_token' }, 400, cors);
  if (await env.MINXTOK_KV.get(USED_KEY(t))) return json({ error: 'used' }, 409, cors);

  const idx = await env.MINXTOK_KV.get(TOKEN_IDX(t), 'json');
  if (!idx || !idx.uid) return json({ error: 'invalid_token' }, 404, cors);
  const left = Math.floor((Number(idx.exp) - Date.now()) / 1000);
  if (left <= 0) return json({ error: 'expired' }, 410, cors);

  if (!(await payKeyValid(env, body.key))) {
    try { await env.MINXTOK_KV.put(FAIL_KEY(ip), String(fails + 1), { expirationTtl: 600 }); } catch (_) {}
    return json({ error: 'bad_key' }, 403, cors);
  }

  const exp = Math.min(Number(idx.exp), Date.now() + 30 * 60 * 1000);
  await env.MINXTOK_KV.put(GATE_KEY(t), JSON.stringify({ ip, exp }), { expirationTtl: Math.max(60, left) });
  return json({ ok: true, exp }, 200, cors);
}

export async function handlePayDo(req, env) {
  const cors = corsHeaders(env);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = String(req.headers.get('User-Agent') || '').slice(0, 200);

  // 试错限流：同一 IP 十分钟最多错 5 次
  const fails = Number((await env.MINXTOK_KV.get(FAIL_KEY(ip))) || '0');
  if (fails >= 5) return json({ error: 'locked', retryAfter: 600 }, 429, cors);

  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const bumpFail = async () => {
    try { await env.MINXTOK_KV.put(FAIL_KEY(ip), String(fails + 1), { expirationTtl: 600 }); } catch (_) {}
  };

  const t = String(body.t || '').trim();
  if (!/^[a-f0-9]{32}$/.test(t)) return json({ error: 'invalid_token' }, 400, cors);
  if (await env.MINXTOK_KV.get(USED_KEY(t))) return json({ error: 'used' }, 409, cors);
  const idx = await env.MINXTOK_KV.get(TOKEN_IDX(t), 'json');
  if (!idx || !idx.uid) return json({ error: 'invalid_token' }, 404, cors);
  if (Number(idx.exp) <= Date.now()) return json({ error: 'expired' }, 410, cors);

  // 必须先在 /api/pay/gate 过密钥关；没凭证的话，body 里带正确密钥也能补一张
  const gate = await env.MINXTOK_KV.get(GATE_KEY(t), 'json');
  if (!gate || Number(gate.exp) <= Date.now()) {
    if (!(await payKeyValid(env, body.key))) { await bumpFail(); return json({ error: 'need_key' }, 403, cors); }
    await env.MINXTOK_KV.put(GATE_KEY(t), JSON.stringify({ ip, exp: Number(idx.exp) }), { expirationTtl: 1800 });
  }
  if (!ctEq(String(body.pass || ''), payPassword(env))) { await bumpFail(); return json({ error: 'bad_password' }, 403, cors); }

  const amount = Math.floor(Number(body.amount));
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    return json({ error: 'bad_amount', min: MIN_AMOUNT, max: MAX_AMOUNT }, 400, cors);
  }

  const uid = idx.uid;
  const now = Date.now();
  let id = orderNo();
  try {
    await env.DB.prepare('INSERT INTO payments (id,uid,amount,key_day,ip,ua,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, uid, amount, dayKey(), ip, ua, now).run();
  } catch (e) {
    // 流水号撞了（同一秒 + 同随机数），换一个再来一次
    id = orderNo();
    await env.DB.prepare('INSERT INTO payments (id,uid,amount,key_day,ip,ua,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, uid, amount, dayKey(), ip, ua, now).run();
  }
  const stock = await addStock(env, uid, amount);

  // 一次性：这串码付过就作废，刷新页面也不能再用
  try {
    await env.MINXTOK_KV.delete(TOKEN_IDX(t));
    await env.MINXTOK_KV.delete(GATE_KEY(t));
    await env.MINXTOK_KV.put(USED_KEY(t), '1', { expirationTtl: 86400 });
    const cur = await env.MINXTOK_KV.get(TOKEN_KEY(uid), 'json');
    if (cur && cur.t === t) await env.MINXTOK_KV.delete(TOKEN_KEY(uid));
  } catch (_) {}

  // 用户端长轮询读这条通知，弹窗用。带上手机号，弹窗里「充值账户」才有着落
  const payRow = await env.DB.prepare('SELECT phone, email FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const note = {
    id,
    amount,
    phone: payDisplayName(payRow, uid),
    ts: now,
    at: new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' '),
  };
  // 24 小时：明轩要求"不管人退没退出应用，回来都要看到这条到账"
  try { await env.MINXTOK_KV.put(NOTIFY_KEY(uid), JSON.stringify(note), { expirationTtl: 86400 }); } catch (_) {}

  return json({ ok: true, id, amount, ts: now, at: note.at, stock }, 200, cors);
}

/* ---------- ④ 用户端实时通知（长轮询，最多挂 12 秒） ---------- */
export async function handlePayWatch(req, env) {
  const cors = corsHeaders(env);
  const user = req.user;
  const url = new URL(req.url);
  const uid = (user && user.id) || url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const since = Number(url.searchParams.get('since') || 0) || 0;
  const deadline = Date.now() + 12000;
  while (true) {
    const note = await env.MINXTOK_KV.get(NOTIFY_KEY(uid), 'json').catch(() => null);
    if (note && Number(note.ts) > since) {
      // 老通知里没有 phone（5.5.0 之前的），读库补上，别让弹窗里「充值账户」是横杠
      if (!note.phone) {
        const row = await env.DB.prepare('SELECT phone, email FROM users WHERE id=?').bind(uid).first().catch(() => null);
        note.phone = payDisplayName(row, uid);
      }
      const quota = await quotaState(env, uid).catch(() => null);
      return json({ ok: true, payment: note, quota, at: Date.now() }, 200, cors);
    }
    if (Date.now() >= deadline) return json({ ok: true, payment: null, at: Date.now() }, 200, cors);
    await new Promise(r => setTimeout(r, 1200));
  }
}

/* ---------- ⑤ 管理端：查当天密钥（ADMIN_TOKEN） ---------- */
export async function handleAdminPayKey(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  const key = await payKeyOfDay(env, dayKey());
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS sum FROM payments WHERE key_day=?"
  ).bind(dayKey()).first().catch(() => null);
  return json({ ok: true, day: dayKey(), key, count: (stats && stats.n) || 0, sum: (stats && stats.sum) || 0 }, 200, cors);
}
