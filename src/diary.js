// 日记：按天记录，支持手写和“让虾虾根据当天对话代写”
import { corsHeaders, json, uidOk } from './util.js';
import { DIARY_WRITE_SYSTEM, DIARY_COMMENT_SYSTEM, DIARY_MEDIA_NOTE } from './prompts.js';
import { getAssistantSettings } from './assistant.js';

const dayOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'br', 'p', 'div',
  'ul', 'ol', 'li', 'span', 'font', 'img', 'audio', 'button',
]);

const CLASS_RULES = {
  div: new Set(['rt-media', 'rt-audio']),
  span: new Set(['rt-audio-wave', 'rt-audio-dur']),
  button: new Set(['rt-audio-play']),
};

const STYLE_RULES = {
  color: /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|transparent|inherit|currentcolor|var\(--[a-z0-9-]+\))$/i,
  'background-color': /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|transparent|inherit|currentcolor|var\(--[a-z0-9-]+\))$/i,
  'text-decoration': /^(none|underline|line-through)(\s+(solid|dotted|dashed|double|wavy))?$/i,
  'text-decoration-line': /^(none|underline|line-through)(\s+(underline|line-through))*$/i,
  'text-decoration-style': /^(solid|dotted|dashed|double|wavy)$/i,
  'font-weight': /^(normal|bold|[1-9]00)$/i,
  'font-style': /^(normal|italic|oblique)$/i,
  'text-align': /^(left|right|center|justify)$/i,
  width: /^\d{1,3}(\.\d+)?%$/,
  'max-width': /^\d{1,3}(\.\d+)?%$/,
  height: /^auto$/i,
  float: /^(left|right|none)$/i,
  clear: /^(left|right|both|none)$/i,
  display: /^(block|inline-block)$/i,
  'vertical-align': /^(top|middle|bottom|baseline)$/i,
  margin: /^(auto|0|\d{1,3}px)(\s+(auto|0|\d{1,3}px)){0,3}$/i,
  'margin-top': /^(auto|0|\d{1,3}px)$/i,
  'margin-right': /^(auto|0|\d{1,3}px)$/i,
  'margin-bottom': /^(auto|0|\d{1,3}px)$/i,
  'margin-left': /^(auto|0|\d{1,3}px)$/i,
};

function attrValue(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs || '');
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function cleanStyle(attrs) {
  const css = attrValue(attrs, 'style');
  const out = [];
  for (const part of css.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim().replace(/["<>]/g, '');
    const rule = STYLE_RULES[prop];
    if (rule && rule.test(val)) out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

function cleanClass(attrs, tag) {
  const allowed = CLASS_RULES[tag];
  if (!allowed) return '';
  return [...new Set(
    attrValue(attrs, 'class').split(/\s+/).filter(name => allowed.has(name))
  )].join(' ');
}

function assetSrc(attrs, kind) {
  const src = attrValue(attrs, 'src');
  const ok = kind === 'img'
    ? /^\/api\/asset\/[A-Za-z0-9_-]+$/.test(src)
    : /^\/api\/asset\/[A-Za-z0-9_-]+$/.test(src);
  return ok ? src : '';
}

function escapeAttr(text) {
  return String(text || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sanitize(html) {
  let s = String(html || '').slice(0, 60000);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // 图片下方的 AI 识别提示词不再展示，保存时直接丢掉，正文里不留脏字
  s = s.replace(/<div[^>]*class\s*=\s*["'][^"']*rt-ai-note[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  // 先把带内容的危险标签整段删掉，再清掉残留开标签
  s = s.replace(/<\s*(script|style|iframe|object|embed|template|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed|template|svg|math)\b[^>]*>/gi, '');

  s = s.replace(/<\s*(\/?)\s*([a-z][a-z0-9]*)([^>]*)>/gi, (match, closing, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return `</${tag}>`;
    if (tag === 'br') return '<br>';

    if (tag === 'img') {
      const src = assetSrc(attrs, 'img');
      if (!src) return '';
      const alt = escapeAttr(attrValue(attrs, 'alt').slice(0, 120) || '日记图片');
      const style = cleanStyle(attrs);
      return `<img src="${src}" alt="${alt}" loading="lazy" contenteditable="false"${style ? ` style="${escapeAttr(style)}"` : ''}>`;
    }
    if (tag === 'audio') {
      const src = assetSrc(attrs, 'aud');
      if (!src) return '';
      return `<audio controls preload="metadata" src="${src}" contenteditable="false"></audio>`;
    }
    if (tag === 'font') {
      const color = attrValue(attrs, 'color');
      return STYLE_RULES.color.test(color) ? `<font color="${escapeAttr(color)}">` : '<font>';
    }

    let out = `<${tag}`;
    const cls = cleanClass(attrs, tag);
    if (cls) out += ` class="${cls}"`;
    if (tag === 'div' && (cls.includes('rt-media') || cls.includes('rt-audio'))) {
      out += ' contenteditable="false"';
    }
    if (tag === 'button') {
      out += ' type="button"';
      const label = attrValue(attrs, 'aria-label').slice(0, 30);
      if (label) out += ` aria-label="${escapeAttr(label)}"`;
    }
    const style = cleanStyle(attrs);
    if (style) out += ` style="${escapeAttr(style)}"`;
    return out + '>';
  });

  return s.trim().slice(0, 30000);
}

function hasMedia(html) {
  return /<(img|audio)\b/i.test(String(html || ''));
}

function plainText(html) {
  return sanitize(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function handleDiaryList(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100);
  const res = await env.DB.prepare(
    'SELECT id,day,content,mood,comment,created_at,updated_at FROM diaries WHERE uid=? ORDER BY day DESC LIMIT ?'
  ).bind(uid, limit).all();
  return json({ entries: res.results || [] }, 200, cors);
}

export async function handleDiarySave(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, day } = body;
  const content = sanitize(body.content).trim();
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!dayOk(day)) return json({ error: 'invalid_day' }, 400, cors);
  if (!plainText(content) && !hasMedia(content)) return json({ error: 'empty_content' }, 400, cors);

  const now = Date.now();
  const exists = await env.DB.prepare('SELECT id FROM diaries WHERE uid=? AND day=?').bind(uid, day).first();
  if (exists) {
    await env.DB.prepare('UPDATE diaries SET content=?, mood=?, updated_at=? WHERE id=?')
      .bind(content, String(body.mood || '').slice(0, 20), now, exists.id).run();
    return json({ ok: true, id: exists.id, updated: true }, 200, cors);
  }
  const id = `d_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await env.DB.prepare('INSERT INTO diaries (id,uid,day,content,mood,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, uid, day, content, String(body.mood || '').slice(0, 20), now, now).run();
  return json({ ok: true, id, created: true }, 200, cors);
}

export async function handleDiaryDelete(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const id = url.pathname.split('/').pop();
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  await env.DB.prepare('DELETE FROM diaries WHERE id=? AND uid=?').bind(id, uid).run();
  return json({ ok: true }, 200, cors);
}

// 让模型根据当天对话写一篇日记
export async function handleDiaryAi(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, day } = body;
  if (!uidOk(uid) || !dayOk(day)) return json({ error: 'invalid_params' }, 400, cors);

  const start = new Date(`${day}T00:00:00+08:00`).getTime();
  const end = start + 86400000;
  const res = await env.DB.prepare(
    'SELECT role,blocks FROM messages WHERE uid=? AND created_at>=? AND created_at<? ORDER BY created_at ASC LIMIT 80'
  ).bind(uid, start, end).all();

  const lines = (res.results || []).map(r => {
    let text = '';
    try { text = (JSON.parse(r.blocks) || []).filter(b => b.type === 'text').map(b => b.text).join(' '); } catch (_) {}
    return text ? `${r.role === 'user' ? '明轩' : '虾虾'}：${text}` : '';
  }).filter(Boolean).join('\n').slice(0, 4000);

  if (!lines) return json({ error: 'no_conversation' }, 404, cors);

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: String(body.lang || '') === 'en' ? DIARY_WRITE_SYSTEM + '\n\nWrite the diary entirely in English.' : DIARY_WRITE_SYSTEM },
          { role: 'user', content: `这是当天的对话记录：\n${lines}` },
        ],
        temperature: 0.8,
        max_tokens: 1400,
      }),
    });
    const d = await r.json();
    const text = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    if (!text) return json({ error: 'empty_result' }, 502, cors);
    return json({ text }, 200, cors);
  } catch (e) {
    return json({ error: 'ai_failed', message: String(e.message || e) }, 502, cors);
  }
}


// 虾虾对日记的评价
export async function handleDiaryComment(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, day } = body;
  const html = String(body.content || '');
  const content = plainText(html);
  const media = hasMedia(html);
  if (!uidOk(uid) || !dayOk(day) || (!content && !media)) return json({ error: 'invalid_params' }, 400, cors);

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: DIARY_COMMENT_SYSTEM.replace(/虾虾/g, (await getAssistantSettings(env, uid)).name) + (String(body.lang || '') === 'en' ? '\n\nReply entirely in English.' : '') },
          { role: 'user', content: `${content || '（这篇日记只有图片或语音，没有写文字。）'}${media ? '\n' + DIARY_MEDIA_NOTE : ''}` },
        ],
        temperature: 0.85,
        max_tokens: 800,
      }),
    });
    const d = await r.json();
    const choice = (d.choices && d.choices[0]) || {};
    let comment = ((choice.message && choice.message.content) || '').trim();
    // 模型被 max_tokens 截断时，宁可停在最后一个完整句子，也不留半句
    if (choice.finish_reason === 'length' && comment) {
      const m = comment.match(/^[\s\S]*[。！？…!?.]/);
      if (m) comment = m[0].trim();
    }
    if (comment) {
      await env.DB.prepare('UPDATE diaries SET comment=? WHERE uid=? AND day=?').bind(comment, uid, day).run();
    }
    return json({ comment }, 200, cors);
  } catch (e) {
    return json({ error: 'comment_failed', message: String(e.message || e) }, 502, cors);
  }
}
