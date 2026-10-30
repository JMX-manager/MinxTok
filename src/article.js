// 文章卡：纯本地卡，不依赖任何外部接口，永远不会失败
// 内容由 LLM 生成后存 D1 的 articles 表，卡片只带 articleId + 标题 + 摘要
// 生成失败时退成"草稿卡"：照样发卡、点开可读，不吞卡、不报错
import { buildMessageBlocks } from './blocks.js';

const ART_TIMEOUT = 45000;

async function generate(env, topic, style, length) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ART_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: [
              '你是一位中文写作者。写完整的文章，只输出正文，不要任何解释、开场白、结尾总结语。',
              '正文用 Markdown：一级标题用 #，小节用 ##，段落之间空行。',
              `文风：${style}。`,
              `篇幅大约 ${length} 字。`,
              '数理化内容直接用符号写清楚，不要写成文字描述。',
            ].join('\n'),
          },
          { role: 'user', content: topic },
        ],
        temperature: 0.8,
        max_tokens: 4000,
      }),
      signal: ctrl.signal,
    });
    const d = await res.json();
    return ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// 写文章：本地卡，永远有结果。有模型内容就是真文章，没有就是草稿骨架
export async function writeArticle(env, uid, topic, opts = {}) {
  const style = opts.style || '自然、克制，不用夸张的形容词和网络流行语';
  const length = Number(opts.length) > 0 ? Number(opts.length) : 900;
  let content = await generate(env, topic, style, length);
  const title = pickTitle(topic, content);
  let excerpt = makeExcerpt(content);
  if (!content) {
    content = draftBody(topic);
    excerpt = '点开写第一段';
  }
  return saveAndBuild(env, uid, title, content, excerpt);
}

// 草稿正文：给个能直接往下写的骨架，绝不给空
function draftBody(topic) {
  const t = String(topic || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return [
    `# ${t || '未命名'}`,
    '',
    '## 一',
    '',
    '这里开始写。',
    '',
    '## 二',
    '',
    '',
    '## 三',
    '',
    '',
  ].join('\n');
}

// 独立存库 + 组块，聊天和后台注入共用
export async function saveAndBuild(env, uid, title, content, excerpt) {
  const id = 'art_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO articles (id,uid,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(id, uid, String(title || '未命名').slice(0, 80), String(content), now, now).run();
  return {
    type: 'article',
    articleId: id,
    title: String(title || '未命名').slice(0, 80),
    excerpt: String(excerpt || '').slice(0, 120),
  };
}

// 从 Markdown 里挑标题：优先一级标题，其次首行，再退到主题
function pickTitle(topic, content) {
  const h1 = /^#\s+(.+)$/m.exec(content);
  if (h1) return h1[1].trim().slice(0, 40);
  const first = String(content || '').split('\n').map(s => s.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
  if (first && first.length <= 40) return first;
  return String(topic || '未命名').replace(/[。！？，\n].*$/s, '').slice(0, 30);
}

// 摘要取正文头一段，去掉 Markdown 标记
function makeExcerpt(content) {
  const plain = String(content || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 110);
}

// 文章意图判断：必须是“明确要写”才算；只提“作文/文章”不算，避免考试分数、作文分析也弹文章卡。
export function articleIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  const noun = '(文章|作文|稿子|长文|推文|软文|书评|影评)';
  const action = '(写|生成|来|整|弄|润色|续写|起草|拟|编)';
  // 作文分数、批改、跑题、素材技巧这类是在聊考试/写作方法，不是让生成文章
  if (new RegExp('(?:作文|文章)[^。！？\\n]{0,8}(?:扣|得分|分数|满分|多少分|没写|写不完|跑题|偏题|审题|题目|要求|判|批|改|错|丢分)').test(m)) return false;
  if (/(技巧|模板|素材|范文|怎么写|如何写|写作方法|怎么提高)/.test(m) && !/(帮我写|给我写|写一篇|写个|生成|来一篇|整一篇)/.test(m)) return false;
  if (new RegExp(action + '[^。！？\\n]{0,10}' + noun).test(m)) return true;
  return false;
}

// 把文章卡拼进这一轮回复
export async function attachArticle(env, uid, topic, text) {
  const card = await writeArticle(env, uid, topic);
  return buildMessageBlocks({ text, card });
}
