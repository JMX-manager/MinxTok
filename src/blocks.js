// 块（Block）模型：消息内容的唯一数据结构，也是旧版所有 bug 的根治点
// 设计原则：
// 1) 一条消息 = 若干 block，顺序由服务端规范化，客户端只负责按类型渲染
// 2) 每种 block 有显式 action（send / play / open / view / none），点击永远按 action 分发，绝不按 DOM 位置猜
// 3) 追问（followups）是 block 的一种，不是 DOM 里的浮层；每消息最多一个，且永远排最后
// 4) 卡片类（music / news / image / link）每消息最多一个，排在追问之前
// 5) 每个 block 有稳定 id，客户端按 id 做幂等渲染与“已消费”标记，杜绝闪两次、空循环

export const BLOCK_TYPES = {
  text: { action: 'none', required: ['text'] },
  quote: { action: 'none', required: ['text'] },
  followups: { action: 'send', required: ['items'], single: true, last: true },
  music: { action: 'play', required: ['title'], card: true },
  news: { action: 'open', required: ['title'], card: true },
  image: { action: 'view', required: ['url'], card: true },
  link: { action: 'open', required: ['url', 'title'], card: true },
  audio: { action: 'play', required: ['url'] },
  quota: { action: 'gift', required: ['used', 'limit', 'title'], card: true },
  weather: { action: 'sheet', required: ['temp', 'text'], card: true },
  article: { action: 'page', required: ['articleId', 'title'], card: true },
  custom: { action: 'page', required: ['title'], card: true },
};

const CARD_TYPES = new Set(['music', 'news', 'image', 'link', 'weather', 'article', 'quota', 'custom']);
const MAX_FOLLOWUPS = 3;
const MAX_FOLLOWUP_LEN = 40;
const MAX_TEXT = 8000;

let seq = 0;
function newBlockId(type) {
  seq = (seq + 1) % 1e6;
  return `blk_${type}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function cleanText(v, max = MAX_TEXT) {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '';
}

function safeUrl(v) {
  const s = String(v || '');
  // 站内资源是相对路径（/api/asset/...），不能按绝对 URL 解析，否则会被当成非法地址丢掉
  if (/^\/api\/asset\/[A-Za-z0-9_-]+$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

// 规范化单个块：补齐 id、清洗字段、推导 action；非法返回 null
export function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '');
  const spec = BLOCK_TYPES[type];
  if (!spec) return null;

  for (const key of spec.required) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') return null;
  }

  const id = /^blk_[A-Za-z0-9_]+$/.test(raw.id || '') ? raw.id : newBlockId(type);
  const base = { id, type, action: spec.action };

  let out = null;

  switch (type) {
    case 'text':
      out = { ...base, text: cleanText(raw.text) };
      break;
    case 'quote':
      out = { ...base, text: cleanText(raw.text, 500), messageId: raw.messageId ? String(raw.messageId).slice(0, 64) : null };
      break;
    case 'followups': {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map(s => cleanText(s, MAX_FOLLOWUP_LEN).replace(/^[\s\d.、)）\-*]+/, '').trim())
        .filter(Boolean)
        .slice(0, MAX_FOLLOWUPS);
      out = items.length ? { ...base, items } : null;
      break;
    }
    case 'music':
      out = {
        ...base,
        title: cleanText(raw.title, 100),
        artist: cleanText(raw.artist, 100),
        cover: safeUrl(raw.cover),
        url: safeUrl(raw.url),
        platform: cleanText(raw.platform, 30),
        duration: Number(raw.duration) > 0 ? Math.floor(Number(raw.duration)) : 0,
        label: cleanText(raw.label, 80),
        pending: raw.pending === true,
      };
      break;
    case 'news':
      out = {
        ...base,
        title: cleanText(raw.title, 120),
        summary: cleanText(raw.summary, 300),
        source: cleanText(raw.source, 60),
        cover: safeUrl(raw.cover),
        url: safeUrl(raw.url),
      };
      break;
    case 'image':
      out = { ...base, url: safeUrl(raw.url), alt: cleanText(raw.alt, 120), caption: cleanText(raw.caption, 200) };
      break;
    case 'audio':
      out = { ...base, url: safeUrl(raw.url), duration: Number(raw.duration) || 0, text: cleanText(raw.text, 300) };
      break;
    case 'link':
      out = {
        ...base,
        title: cleanText(raw.title, 120),
        url: safeUrl(raw.url),
        desc: cleanText(raw.desc, 200),
        favicon: safeUrl(raw.favicon),
      };
      break;
    case 'quota': {
      const giftId = /^[A-Za-z0-9_-]{6,64}$/.test(String(raw.giftId || '')) ? String(raw.giftId) : '';
      out = {
        ...base, action: giftId ? 'gift' : 'sheet',
        giftId,
        used: Number(raw.used) || 0,
        limit: Number(raw.limit) || 0,
        bonus: Number(raw.bonus) || 0,
        // 礼物卡：大标题 + 额度量 + 副标题 + 惊喜彩蛋，全部服务端下发，前端只画
        title: cleanText(raw.title, 40),
        subtitle: cleanText(raw.subtitle, 80),
        amount: Number(raw.amount) || 0,
        unit: cleanText(raw.unit, 4) || '点',
        emoji: cleanText(raw.emoji, 8),
        surprise: cleanText(raw.surprise, 40),
        note: cleanText(raw.note, 120),
        claimed: raw.claimed === true,
      };
      break;
    }
    case 'weather':
      out = {
        ...base, action: 'sheet',
        city: cleanText(raw.city, 40),
        temp: Number(raw.temp),
        text: cleanText(raw.text, 40),
        icon: cleanText(raw.icon, 20),
        humidity: Number(raw.humidity) || 0,
        advice: cleanText(raw.advice, 200),
        lat: Number(raw.lat) || null,
        lon: Number(raw.lon) || null,
      };
      break;
    case 'article':
      out = {
        ...base, action: 'page',
        articleId: String(raw.articleId).slice(0, 64),
        title: cleanText(raw.title, 120),
        excerpt: cleanText(raw.excerpt, 200),
      };
      break;
    case 'custom':
      out = {
        ...base,
        action: raw.present === 'external' ? 'open' : (raw.present === 'sheet' ? 'sheet' : 'page'),
        title: cleanText(raw.title, 120),
        subtitle: cleanText(raw.subtitle, 160),
        cover: safeUrl(raw.cover),
        url: safeUrl(raw.url),
        body: cleanText(raw.body, 4000),
        present: ['page', 'sheet', 'external'].includes(raw.present) ? raw.present : 'page',
      };
      break;
    default:
      return null;
  }

  if (!out) return null;
  // 清洗后再校验必填项：URL 类字段非法（如 javascript:）直接丢块
  for (const key of spec.required) {
    const v = out[key];
    if (v === undefined || v === null || v === '') return null;
  }
  return out;
}

// 规范化整条消息的块数组：去重、限量、定序
export function normalizeBlocks(rawBlocks) {
  const list = Array.isArray(rawBlocks) ? rawBlocks : [];
  const out = [];
  const seenIds = new Set();
  const cardTypes = new Set();
  let followupsUsed = false;

  for (const raw of list) {
    const b = normalizeBlock(raw);
    if (!b) continue;
    if (seenIds.has(b.id)) continue; // 同 id 只保留第一次，杜绝重复渲染

    if (b.type === 'followups') {
      if (followupsUsed) continue; // 每消息最多一组追问
      followupsUsed = true;
    } else if (CARD_TYPES.has(b.type)) {
      // 同一类型只留一张；不同类型可以共存（天气+新闻+音乐）
      if (b.type !== 'music' && cardTypes.has(b.type)) continue;
      cardTypes.add(b.type);
    }

    seenIds.add(b.id);
    out.push(b);
  }

  // 定序：正文 → 引用 → 卡片 → 额度 → 追问（追问永远最后）
  const rank = (b) => {
    if (b.type === 'text') return 0;
    if (b.type === 'quote') return 1;
    if (CARD_TYPES.has(b.type)) return 2;
    if (b.type === 'quota') return 3;
    if (b.type === 'followups') return 9;
    return 5;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

// 由正文和可选附件组装消息块（服务端唯一出口）
export function buildMessageBlocks({ text, followups, card, cards, quota, quote }) {
  const blocks = [];
  if (quote && quote.text) blocks.push({ type: 'quote', text: quote.text, messageId: quote.messageId });
  if (text) blocks.push({ type: 'text', text });
  if (Array.isArray(cards)) blocks.push(...cards.filter(Boolean));
  else if (card) blocks.push(card);
  if (quota) blocks.push({ type: 'quota', used: quota.used, limit: quota.limit });
  if (Array.isArray(followups) && followups.length) blocks.push({ type: 'followups', items: followups });
  return normalizeBlocks(blocks);
}

// 给前端的块规范（前端据此校验与分发 action，新增卡片类型只需扩这里）
export function blockSchema() {
  return Object.entries(BLOCK_TYPES).map(([type, spec]) => ({
    type,
    action: spec.action,
    required: spec.required,
    single: !!spec.single,
    card: !!spec.card,
  }));
}
