// Passkey（WebAuthn）：免密码登录
// 说明：注册时记录凭据 ID 与用户；登录时校验 challenge、origin 与凭据归属。
// 试用版暂不做签名验签，正式启用前应补上公钥验签。
import { corsHeaders, json } from './util.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64u = (s) => Uint8Array.from(
  atob(String(s).replace(/-/g, '+').replace(/_/g, '/')),
  c => c.charCodeAt(0)
);

const rand = (n = 32) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
};

const rpId = (req) => new URL(req.url).hostname;

function parseClientData(b64) {
  try {
    const txt = new TextDecoder().decode(unb64u(b64));
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function originOk(clientData, req) {
  if (!clientData || !clientData.origin) return false;
  try {
    return new URL(clientData.origin).hostname === rpId(req);
  } catch (_) {
    return false;
  }
}

/* ---------------- 注册 ---------------- */
export async function handleWaRegisterBegin(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { /* 允许空体 */ }
  const identifier = String(body.identifier || '').trim().toLowerCase();

  const challenge = b64u(rand(32));
  const userId = b64u(rand(16));
  await env.MINXTOK_KV.put(`wa:reg:${challenge}`, JSON.stringify({ identifier, userId, at: Date.now() }), { expirationTtl: 300 });

  return json({
    challenge,
    rp: { name: 'MinxTok', id: rpId(req) },
    user: { id: userId, name: identifier || 'minxtok-user', displayName: identifier || 'MinxTok User' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  }, 200, cors);
}

export async function handleWaRegisterFinish(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const clientData = parseClientData(body.clientDataJSON);
  if (!clientData || clientData.type !== 'webauthn.create') return json({ error: 'bad_client_data' }, 400, cors);
  if (!originOk(clientData, req)) return json({ error: 'bad_origin' }, 400, cors);

  const pending = await env.MINXTOK_KV.get(`wa:reg:${clientData.challenge}`, 'json');
  if (!pending) return json({ error: 'challenge_expired' }, 400, cors);
  await env.MINXTOK_KV.delete(`wa:reg:${clientData.challenge}`);

  const credId = String(body.id || body.rawId || '');
  if (!credId) return json({ error: 'missing_credential' }, 400, cors);

  const exists = await env.DB.prepare('SELECT user_id FROM webauthn_credentials WHERE id=?').bind(credId).first();
  if (exists) return json({ error: 'credential_exists' }, 409, cors);

  const userId = pending.userId;
  const identifier = pending.identifier || `${userId}@passkey.local`;
  const email = identifier.includes('@') ? identifier : `${identifier}@phone.local`;
  const now = Date.now();

  const userRow = identifier.includes('@')
    ? await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()
    : await env.DB.prepare('SELECT id FROM users WHERE phone=?').bind(identifier).first();

  let uid = userRow && userRow.id;
  if (!uid) {
    uid = `u_${userId.slice(0, 8)}`;
    await env.DB.prepare('INSERT INTO users (id,email,phone,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)')
      .bind(uid, email, identifier.includes('@') ? null : identifier, 'passkey', 'passkey', now).run();
  }

  await env.DB.prepare('INSERT INTO webauthn_credentials (id,user_id,created_at) VALUES (?,?,?)')
    .bind(credId, uid, now).run();

  const token = b64u(rand(24)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  await env.MINXTOK_KV.put(`sess:${token}`, JSON.stringify({ id: uid, email, at: now }), { expirationTtl: 30 * 24 * 3600 });
  return json({ ok: true, token, user: { id: uid, email } }, 200, cors);
}

/* ---------------- 登录 ---------------- */
export async function handleWaLoginBegin(req, env) {
  const cors = corsHeaders(env);
  const challenge = b64u(rand(32));
  await env.MINXTOK_KV.put(`wa:login:${challenge}`, JSON.stringify({ at: Date.now() }), { expirationTtl: 300 });
  return json({
    challenge,
    rpId: rpId(req),
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: [],
  }, 200, cors);
}

export async function handleWaLoginFinish(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const clientData = parseClientData(body.clientDataJSON);
  if (!clientData || clientData.type !== 'webauthn.get') return json({ error: 'bad_client_data' }, 400, cors);
  if (!originOk(clientData, req)) return json({ error: 'bad_origin' }, 400, cors);

  const pending = await env.MINXTOK_KV.get(`wa:login:${clientData.challenge}`, 'json');
  if (!pending) return json({ error: 'challenge_expired' }, 400, cors);
  await env.MINXTOK_KV.delete(`wa:login:${clientData.challenge}`);

  const credId = String(body.id || body.rawId || '');
  const cred = await env.DB.prepare('SELECT user_id FROM webauthn_credentials WHERE id=?').bind(credId).first();
  if (!cred) return json({ error: 'credential_unknown' }, 404, cors);

  const user = await env.DB.prepare('SELECT id,email,phone FROM users WHERE id=?').bind(cred.user_id).first();
  if (!user) return json({ error: 'user_missing' }, 404, cors);

  const token = b64u(rand(24)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  await env.MINXTOK_KV.put(`sess:${token}`, JSON.stringify({ id: user.id, email: user.email, at: Date.now() }), { expirationTtl: 30 * 24 * 3600 });
  return json({ ok: true, token, user: { id: user.id, email: user.email, phone: user.phone || null } }, 200, cors);
}
