// 问题反馈：前端提交，管理端可查
import { corsHeaders, json, isAdmin } from './util.js';

function rid() {
  return 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 把 user_scripts 之类的引号问题绕开：只用参数绑定
export async function handleFeedbackCreate(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const text = String(body.text || '').trim().slice(0, 4000);
  if (text.length < 2) return json({ error: 'too_short' }, 400, cors);
  const type = ['bug', 'idea', 'other'].includes(body.type) ? body.type : 'other';
  const contact = String(body.contact || '').trim().slice(0, 120);
  const ua = String(body.ua || '').slice(0, 300);
  const page = String(body.page || '').slice(0, 300);
  const uid = String(body.uid || '').slice(0, 64) || null;

  let account = null;
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token) {
    try {
      const row = await env.DB.prepare('SELECT account FROM users WHERE token=?').bind(token).first();
      if (row) account = row.account || null;
    } catch (_) {}
  }

  const id = rid();
  try {
    await env.DB.prepare(
      'INSERT INTO feedback (id,uid,account,type,text,contact,ua,page,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id, uid, account, type, text, contact, ua, page, Date.now()).run();
  } catch (e) {
    return json({ error: 'db', detail: String(e && e.message || e).slice(0, 200) }, 500, cors);
  }
  return json({ ok: true, id }, 200, cors);
}

export async function handleFeedbackList(req, env) {
  const cors = corsHeaders(env);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
  const res = await env.DB.prepare(
    'SELECT id,uid,account,type,text,contact,ua,page,created_at FROM feedback ORDER BY created_at DESC LIMIT 200'
  ).all();
  return json({ items: res.results || [] }, 200, cors);
}
