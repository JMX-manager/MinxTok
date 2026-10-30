// 账号体系：手机号 + 短信验证码注册，手机号/老邮箱账号 + 密码登录
// 邮箱注册与邮箱验证码已下线；已有账号数据不动，仍可用邮箱 + 密码登录
import { grantSignupQuota } from './quota.js';
import { corsHeaders, json } from './util.js';
import { checkSmsCode, phoneOk, normalizePhone } from './sms.js';

const SESSION_TTL = 30 * 24 * 3600;
const ITER = 100000;

function randHex(n = 16) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function hash(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITER, hash: 'SHA-256' },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
const isPhone = (v) => phoneOk(String(v || '').trim());

function tokenFrom(req) {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export async function currentUser(req, env) {
  const token = tokenFrom(req);
  if (!token) return null;
  const sess = await env.MINXTOK_KV.get(`sess:${token}`, 'json');
  if (!sess) return null;
  return sess;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => chars[x % chars.length]).join('');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function issueRecoveryCodes(env, uid) {
  const codes = [];
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    const code = genCode();
    codes.push(code);
    await env.DB.prepare('INSERT INTO recovery_codes (user_id,code_hash,used,created_at) VALUES (?,?,0,?)')
      .bind(uid, await sha256(code), now).run();
  }
  return codes;
}

/* ---------------- 注册 ---------------- */
export async function handleRegister(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const rawId = String(body.phone || body.identifier || '').trim();
  const password = String(body.password || '');
  const code = String(body.code || '').trim();
  const phone = normalizePhone(rawId);
  if (!phoneOk(phone)) return json({ error: 'phone_required' }, 400, cors);
  if (password.length < 8) return json({ error: 'weak_password' }, 400, cors);
  if (!/^\d{4,8}$/.test(code)) return json({ error: 'bad_code' }, 400, cors);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE phone=?').bind(phone).first();
  if (exists) return json({ error: 'account_taken' }, 409, cors);

  // 核验接口免费，但不通过就不能建号
  const verified = await checkSmsCode(env, phone, code);
  if (!verified.ok) return json({ error: 'bad_code', msg: verified.msg }, 400, cors);

  const email = `${phone}@phone.local`;
  const id = 'u_' + randHex(8);
  const salt = randHex(16);
  const pwd = await hash(password, salt);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id,email,phone,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, email, phone || null, pwd, salt, now).run();

  // 新人礼：注册即送 20 额度，用完等管理员发放（2026-10-30 定）
  try { await grantSignupQuota(env, id); } catch (_) {}

  const token = randHex(24);
  await env.MINXTOK_KV.put(`sess:${token}`, JSON.stringify({ id, email, at: now }), { expirationTtl: SESSION_TTL });
  const recovery = await issueRecoveryCodes(env, id);
  return json({ ok: true, token, user: { id, email, phone: phone || null }, recovery }, 200, cors);
}

/* ---------------- 登录 ---------------- */
export async function handleLogin(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const rawId = String(body.identifier || body.email || body.phone || '').trim();
  const password = String(body.password || '');
  if (!password) return json({ error: 'invalid_credentials' }, 400, cors);

  const row = isPhone(rawId)
    ? await env.DB.prepare('SELECT id,email,phone,password_hash,salt FROM users WHERE phone=?').bind(rawId).first()
    : await env.DB.prepare('SELECT id,email,phone,password_hash,salt FROM users WHERE email=?').bind(rawId.toLowerCase()).first();
  if (!row) return json({ error: 'invalid_credentials' }, 401, cors);
  const pwd = await hash(password, row.salt);
  if (pwd !== row.password_hash) return json({ error: 'invalid_credentials' }, 401, cors);

  const token = randHex(24);
  await env.MINXTOK_KV.put(`sess:${token}`, JSON.stringify({ id: row.id, email: row.email, at: Date.now() }), { expirationTtl: SESSION_TTL });
  return json({ ok: true, token, user: { id: row.id, email: row.email, phone: row.phone || null } }, 200, cors);
}

/* ---------------- 校验当前账号密码 ---------------- */
export async function handleVerifyPassword(req, env) {
  const cors = corsHeaders(env);
  const user = await currentUser(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const password = String(body.password || '');
  if (!password) return json({ error: 'invalid_password' }, 400, cors);
  const row = await env.DB.prepare('SELECT password_hash,salt FROM users WHERE id=?').bind(user.id).first();
  if (!row || !row.password_hash || !row.salt) return json({ error: 'no_password' }, 400, cors);
  const pwd = await hash(password, row.salt);
  if (pwd !== row.password_hash) return json({ error: 'invalid_password' }, 401, cors);
  return json({ ok: true }, 200, cors);
}

/* ---------------- 当前用户 / 退出 ---------------- */
export async function handleMe(req, env) {
  const cors = corsHeaders(env);
  const user = await currentUser(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  return json({ ok: true, user: { id: user.id, email: user.email, phone: user.phone || null } }, 200, cors);
}

export async function handleLogout(req, env) {
  const cors = corsHeaders(env);
  const token = tokenFrom(req);
  if (token) await env.MINXTOK_KV.delete(`sess:${token}`);
  return json({ ok: true }, 200, cors);
}

/* ---------------- 恢复码重置密码 ---------------- */
export async function handleRecover(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const rawId = String(body.identifier || '').trim();
  const code = String(body.code || '').trim().toUpperCase();
  const password = String(body.password || '');
  if (!rawId || !code || password.length < 8) return json({ error: 'invalid_params' }, 400, cors);

  const row = isPhone(rawId)
    ? await env.DB.prepare('SELECT id FROM users WHERE phone=?').bind(rawId).first()
    : await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(rawId.toLowerCase()).first();
  if (!row) return json({ error: 'invalid_params' }, 400, cors);

  const h = await sha256(code);
  const rc = await env.DB.prepare('SELECT rowid FROM recovery_codes WHERE user_id=? AND code_hash=? AND used=0')
    .bind(row.id, h).first();
  if (!rc) return json({ error: 'invalid_code' }, 401, cors);

  const salt = randHex(16);
  const pwd = await hash(password, salt);
  await env.DB.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').bind(pwd, salt, row.id).run();
  await env.DB.prepare('UPDATE recovery_codes SET used=1 WHERE rowid=?').bind(rc.rowid).run();

  const token = randHex(24);
  await env.MINXTOK_KV.put(`sess:${token}`, JSON.stringify({ id: row.id, at: Date.now() }), { expirationTtl: SESSION_TTL });
  return json({ ok: true, token, user: { id: row.id } }, 200, cors);
}
