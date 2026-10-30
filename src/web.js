// 主聊天联网：模型主动判断是否需要查网页，查完把结果写进上下文；
// 同时把查到的公开资料存进 web_knowledge，下一次遇到相近问题先翻旧资料。
import { qianfanWebSearch } from './search.js';

const WEB_HINT = /(最新|最近|今天|今日|现在|目前|实时|刚刚|新闻|热点|价格|多少钱|汇率|股价|比分|赛程|排名|政策|规定|发布|上市|发售|天气|气温|下雨|台风|地震|事故|选举|总统|谁|是什么|是啥|查查|查一下|搜一下|搜搜|为什么|怎么样|如何|推荐|哪家|哪个|哪里|有没有|能不能|真的吗|什么来头|干什么的|做什么的|介绍|百科|202[0-9]|20[0-9]{2}年|多少|几月|几号|地址|电话|官网|下载|教程|区别|对比|评测|攻略|签证|机票|酒店|景点|门票|电影|电视剧|剧集|综艺|动漫|纪录片|片单|新片|上映|票房)/;

const WEB_SKIP = /^(你好|嗨|在吗|晚安|早安|午安|谢谢|哈哈|嘿嘿|嗯+|哦+|好+|行|可以|没事|抱抱|想你|爱你|在干嘛|吃了吗)/;
const PERSONAL = /(心情|难过|开心|焦虑|失眠|烦|累|委屈|孤独|失恋|恋爱|感觉|觉得|朋友|爸妈|对象|我为什么|你觉得我|你喜欢我|我爱你)/;
const STUDY = /(题|选|算|公式|方程|代码|bug|报错|作业|作文|翻译|证明|函数|编程|考试|成绩|分数|排名)/;
const FACT_Q = /(是什么|是啥|是谁|查查|查一下|搜一下|为什么|怎么样|如何|多少钱|哪里|哪个|什么时候|多久|区别|原理|定义|意思|什么来头|干什么的|做什么的|介绍|百科|最新|最近|今天|202[0-9])/;
const MOVIE_REC = /(电影|电视剧|剧集|综艺|动漫|纪录片|片单|好看的|推荐|新片|上映|票房)/;

// 明显在问公开事实的，直接查，不再让分类器犹豫；带“我/你”或学科题的交给分类器。
function likelyFactLookup(message) {
  const q = String(message || '').trim();
  if (q.length < 4 || q.length > 300) return false;
  if (STUDY.test(q) || PERSONAL.test(q)) return false;
  // 片单/新片推荐按事实查询处理，避免“我想看最近好看的电影”被“我”挡住
  if (MOVIE_REC.test(q)) return true;
  return FACT_Q.test(q);
}

// 明轩定的新口径：默认就搜，搜一遍好过不搜。
// 只有以下这些明显不需要外部资料的才跳过：寒暄、纯情绪、学科题。
const CHAT_ONLY = /^(你好|您好|嗨|哈喽|hey|hi|hello|在吗|在不在|晚安|早安|午安|谢谢|谢了|多谢|哈哈+|嘿嘿|嗯+|哦+|好+|行|可以|没事|没关系|抱抱|想你|爱你|在干嘛|吃了吗|我是谁|你是谁|你叫什么|你能做什么|你会什么|测试|test)/i;
const EMOTION_ONLY = /(心情|难过|不开心|焦虑|失眠|烦死|好累|很累|委屈|孤独|失恋|崩溃|压力大|想哭|安慰我|抱抱我)/;
const STUDY_ONLY = /(题|选|算|公式|方程|代码|bug|报错|作业|作文|翻译|证明|函数|编程|考试|成绩|分数|背诵|单词|语法|物理|化学|数学|几何|历史|政治|生物|地理)/;

// 把口语化的问句压成适合搜索引擎的短查询
export function cleanQuery(q) {
  return String(q || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^(帮我|请问|麻烦你?|你能|你能不能|可以|能不能|给我|我想|我想要|你知道|你帮我|你帮我查|查查|搜一下|搜搜|试试)+/g, '')
    .replace(/[？?！!。，,、~～\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function maybeNeedsWeb(message) {
  const q = String(message || '').trim();
  if (q.length < 4 || q.length > 300) return false;
  if (WEB_SKIP.test(q)) return false;
  return WEB_HINT.test(q);
}

function llmEndpoint(env) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function recentText(history, limit) {
  return (history || []).slice(-limit).map((m) => {
    const text = (m.blocks || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    return `${m.role === 'user' ? '用户' : '虾虾'}：${String(text || '').slice(0, 300)}`;
  }).filter((x) => x.length > 4).join('\n');
}

// 让模型只做“要不要查、查什么”的判断，不生成回答。
export async function decideWebSearch(env, message, history) {
  if (String(env.WEB_SEARCH_AUTO || '1') !== '1') return null;
  const q = String(message || '').trim();
  if (q.length < 4 || q.length > 300) return null;
  if (CHAT_ONLY.test(q) || EMOTION_ONLY.test(q) || STUDY_ONLY.test(q)) return null;
  const query = cleanQuery(q) || q.replace(/\s+/g, ' ').slice(0, 60);
  if (!query) return null;
  return { search: true, query };
}

export function buildWebContext(results) {
  const rows = (results || []).slice(0, 10);
  if (!rows.length) return '';
  const lines = rows.map((r, i) => {
    const meta = [r.site, r.date].filter(Boolean).join('，');
    return `${i + 1}. ${r.title}${meta ? `（${meta}）` : ''}\n${String(r.text || '').slice(0, 300)}`;
  }).join('\n');
  return `\n【联网搜索结果（刚刚查到）】\n${lines}\n请优先依据这些结果回答，把它们当成刚刚查到的资料，不要再说自己没联网或查不到。如果用户问“最近/最新/今年/现在”，优先采用日期较新的结果，并在回答里说明时间；不要把多年前的旧片、旧闻当成最近。不要编造结果之外的事实；结果之间矛盾或明显过时，就说明不确定。不要贴出长链接，除非用户明确要来源。`;
}

function shortDate(value) {
  const n = Number(value);
  if (!n) return '';
  try { return new Date(n).toISOString().slice(0, 10); } catch (_) { return ''; }
}

export function buildLearnedContext(rows) {
  const list = (rows || []).slice(0, 3);
  if (!list.length) return '';
  const lines = list.map((r, i) => {
    const meta = [r.site, shortDate(r.date)].filter(Boolean).join('，');
    return `${i + 1}. ${r.title}${meta ? `（${meta}）` : ''}\n${String(r.snippet || '').slice(0, 240)}`;
  }).join('\n');
  return `\n【以前联网学到的资料】\n${lines}\n这些是之前为相近问题查到的旧资料，可以作为背景；如果信息可能过时，先说明，再结合当前问题回答。`;
}

function knowledgeId() {
  return `wk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// 把搜索结果落到站内知识库；失败不影响本轮回答。
export async function learnWebResults(env, uid, query, results) {
  const rows = (results || []).slice(0, 4);
  if (!uid || !rows.length) return;
  const now = Date.now();
  for (const r of rows) {
    if (!r || !r.url) continue;
    try {
      await env.DB.prepare(
        'INSERT INTO web_knowledge (id,uid,query,title,url,snippet,site,created_at) VALUES (?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(uid,url) DO UPDATE SET query=excluded.query,title=excluded.title,snippet=excluded.snippet,site=excluded.site,created_at=excluded.created_at'
      ).bind(
        knowledgeId(), uid, String(query || '').slice(0, 120), String(r.title || '').slice(0, 180),
        String(r.url).slice(0, 500), String(r.text || '').slice(0, 500), String(r.site || '').slice(0, 80), now
      ).run();
    } catch (_) { /* 表没建好时静默跳过 */ }
  }
}

function recallTerms(message) {
  const text = String(message || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ').trim();
  const out = [];
  for (const part of text.split(/\s+/)) {
    if (!part) continue;
    if (/^[A-Za-z0-9]{2,}$/.test(part)) {
      out.push(part.slice(0, 24));
      continue;
    }
    const zh = part.replace(/[A-Za-z0-9]/g, '');
    for (let i = 0; i < zh.length - 1 && out.length < 6; i++) {
      const bg = zh.slice(i, i + 2);
      if (!/^(的|了|是|在|我|你|他|她|它|这|那|有|和|就|都|也|还|吗|呢|吧|啊|呀|什么|怎么|为什|可以|一个|现在|今天|最近)$/.test(bg)) out.push(bg);
    }
  }
  return [...new Set(out)].slice(0, 4);
}

export async function recallWebKnowledge(env, uid, message) {
  const terms = recallTerms(message);
  if (!uid || !terms.length) return [];
  const where = terms.map(() => '(query LIKE ? OR title LIKE ? OR snippet LIKE ?)').join(' OR ');
  const binds = [uid];
  for (const t of terms) {
    const like = `%${t}%`;
    binds.push(like, like, like);
  }
  try {
    const res = await env.DB.prepare(
      `SELECT query,title,url,snippet,site,created_at AS date FROM web_knowledge WHERE uid=? AND (${where}) ORDER BY created_at DESC LIMIT 3`
    ).bind(...binds).all();
    return res.results || [];
  } catch (_) {
    return [];
  }
}
