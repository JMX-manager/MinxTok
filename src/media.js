// 图片识别（OCR）、语音转文字（STT）与日记资源上传
// 图片理解优先走 DeepSeek 视觉；STT 走 Cloudflare Workers AI 的 Whisper
import { corsHeaders, json, uidOk } from './util.js';
import { OCR_PROMPT, SIMPLIFY_SYSTEM } from './prompts.js';

const MAX_IMAGE = 6 * 1024 * 1024;   // 6MB dataURL
const MAX_AUDIO = 12 * 1024 * 1024;  // 12MB 音频

/* ---------------- OCR ---------------- */
// OCR.space 免费接口：默认用公共测试 key，正式用请在环境变量配置 OCR_SPACE_KEY
export async function handleOcr(req, env) {
  const cors = corsHeaders(env);

  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const image = body.image || '';
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return json({ error: 'invalid_image' }, 400, cors);
  }
  if (image.length > MAX_IMAGE) return json({ error: 'image_too_large' }, 413, cors);

  const key = env.OCR_SPACE_KEY || 'helloworld';
  const form = new URLSearchParams({
    apikey: key,
    base64Image: image,
    language: env.OCR_LANG || 'chs',
    OCREngine: '2',
    scale: 'true',
    isTable: 'false',
  });

  try {
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const d = await res.json();
    if (d.IsErroredOnProcessing) {
      return json({ error: 'ocr_upstream', detail: (d.ErrorMessage || []).join('; ').slice(0, 200) }, 502, cors);
    }
    const text = ((d.ParsedResults || [])[0] || {}).ParsedText || '';
    return json({ text: String(text).replace(/\r/g, '').trim(), engine: 'ocr.space' }, 200, cors);
  } catch (e) {
    return json({ error: 'ocr_failed', message: String(e.message || e) }, 502, cors);
  }
}

// OCR.space 纯文字兜底：视觉模型挂了，至少先把截图里的字读出来
async function ocrSpaceText(env, dataUrl) {
  try {
    const form = new URLSearchParams({
      apikey: env.OCR_SPACE_KEY || 'helloworld',
      base64Image: dataUrl,
      language: env.OCR_LANG || 'chs',
      OCREngine: '2',
      scale: 'true',
      isTable: 'false',
    });
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return '';
    const d = await res.json();
    if (d.IsErroredOnProcessing) return '';
    return String(((d.ParsedResults || [])[0] || {}).ParsedText || '').replace(/\r/g, '').trim();
  } catch (_) {
    return '';
  }
}

/* ---------------- 语音转文字 ---------------- */
// Cloudflare 账号 ID 不是密钥（它就写在控制台地址里），但 Pages 的 secret 有时
// 加进项目后不会被正在跑的部署读到，所以这里留一个兜底值，保证语音不会因为
// 一个环境变量没生效就整条挂掉。
const CF_ACCOUNT_FALLBACK = 'YOUR_CLOUDFLARE_ACCOUNT_ID';
function cfAccount(env) {
  return String((env && (env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID)) || '').trim() || CF_ACCOUNT_FALLBACK;
}

// 自检接口：只回布尔值和账号末四位，方便判断到底是哪一环没配
// 0.3 秒静音 wav：拿去当探针，验证新增的大模型转写能不能真的跑通
function silentProbe() {
  const n = Math.round(16000 * 0.3);
  const b = new Uint8Array(44 + n * 2);
  const v = new DataView(b.buffer);
  const ws = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * 2, true);
  return bufToB64(b);
}

export async function handleSttCheck(req, env) {
  const cors = corsHeaders(env);
  const acct = cfAccount(env);
  const out = {
    ok: true,
    hasToken: !!env.CF_AI_TOKEN,
    hasAccountEnv: !!(env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID),
    accountTail: acct ? acct.slice(-4) : '',
    model: STT_MODEL,
  };
  // ?probe=1 真打一次模型，确认大模型版可用；挂了说明会退回老版（不带语种）
  try {
    if (env.CF_AI_TOKEN && new URL(req.url).searchParams.get('probe') === '1') {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${STT_MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: silentProbe(), task: 'transcribe', language: 'zh', vad_filter: true }),
      });
      const d = await res.json();
      out.probe = res.ok && d.success ? 'ok' : 'fail';
      out.probeStatus = res.status;
      if (out.probe === 'fail') out.probeDetail = (d && d.errors) || null;
    }
  } catch (e) {
    out.probe = 'error';
    out.probeDetail = String(e.message || e);
  }
  return json(out, 200, cors);
}

const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const STT_MODEL_LEGACY = '@cf/openai/whisper';

// ArrayBuffer → base64，分块拼，避免 fromCharCode 一次塞太多参数爆栈
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let out = '';
  const CH = 0x2000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(out);
}

// 只认繁体字表：命中了才去调模型转简体，没命中就直接返回，省一次 LLM 往返也避免被改写
const TRAD_ONLY = /[這個們說話時間點沒麼樣為會來時後裡發現實際應該東頭開關無線電視機關於]|[㐀-䶿]/;

// whisper 的经典翻车：音频一糊就自说自话（「请用简体中文字幕」「字幕由…提供」），
// 或者干脆把语种猜成冰岛语吐一串乱码（明轩 2026-10-30 实测两次都这样）。
// 这种结果宁可当没听清让明轩重说一遍，也不能把垃圾塞进输入框。
const STT_JUNK = /(请用简体中文|简体中文字幕|字幕由|字幕组|谢谢观看|感谢观看|请不吝点赞|订阅频道|转发打赏|明镜与点点)/;
const CJK_RE = /[\u4e00-\u9fa5]/g;
const LATIN_RE = /[A-Za-z\u00c0-\u024f]/g;

function sttSuspect(text, lang) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (lang !== 'zh') return false;
  if (STT_JUNK.test(t)) return true;
  const cjk = (t.match(CJK_RE) || []).length;
  if (!cjk) return true; // 中文语音却一个汉字都没有：语种猜飞了
  const latin = (t.match(LATIN_RE) || []).length;
  if (latin > cjk * 2) return true; // 拉丁字母/冰岛语字母压倒性多，也是猜飞了
  return false;
}

export async function handleStt(req, env) {
  const cors = corsHeaders(env);
  if (!env.CF_AI_TOKEN) return json({ error: 'stt_not_configured', part: 'token' }, 500, cors);

  // 明轩反馈"老是识别成别的语言"：whisper 默认自己猜语种，短句常被猜成英语。
  // 大模型版支持 language 参数，前端按当前界面语言传过来，钉死中文/英文。
  let lang = 'zh';
  let wantFix = false;
  try {
    const sp = new URL(req.url).searchParams;
    lang = String(sp.get('lang') || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
    wantFix = sp.get('fix') === '1';
  } catch (_) {}

  const type = req.headers.get('content-type') || 'audio/wav';
  let buf;
  try { buf = await req.arrayBuffer(); } catch { return json({ error: 'invalid_audio' }, 400, cors); }
  if (!buf || buf.byteLength < 1000) return json({ error: 'audio_too_short' }, 400, cors);
  if (buf.byteLength > MAX_AUDIO) return json({ error: 'audio_too_large' }, 413, cors);

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cfAccount(env)}/ai/run/${STT_MODEL}`;
  const payload = {
    audio: bufToB64(buf),
    task: 'transcribe',
    language: lang,
    vad_filter: true,
    condition_on_previous_text: false,
    initial_prompt: lang === 'zh'
      // 提示词只放术语，不放指令（明轩 2026-10-30：「讲讲氯水的性质」被识别成「请用简体中文字幕」——
      // whisper 会把提示词里的整句话原样回吐，写成「请用简体中文转写」就是自己给自己挖坑）
      ? '氯水、氯气、次氯酸、盐酸、氢氧化钠、碳酸钙、化合价、摩尔质量、物质的量、化学方程式、加速度、位移、压强、浮力、电流、电压、电阻。'
      : 'School subjects: maths, physics, chemistry.',
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok || !d.success) {
      // 大模型版挂掉时退回老 whisper（它不能指定语种，但比一个字都没有强）
      return await sttLegacy(env, buf, type, cors);
    }
    const r = d.result || {};
    const info = r.transcription_info || {};
    let text = String(r.text || '').trim();
    if (sttSuspect(text, lang)) {
      const retry = await sttRetry(env, buf);
      if (!sttSuspect(retry, lang)) text = retry;
      else return json({ text: '', unclear: true, raw: text.slice(0, 40) }, 200, cors);
    }
    if (lang === 'zh' && TRAD_ONLY.test(text)) text = await toSimplified(env, text);
    const fixed = wantFix ? await fixTranscript(env, text, lang) : '';
    return json({
      text: fixed || text,
      raw: fixed ? text : undefined,
      fixed: !!(fixed && fixed !== text),
      lang: info.language || lang,
      prob: info.language_probability || 0,
    }, 200, cors);
  } catch (e) {
    try { return await sttLegacy(env, buf, type, cors); } catch (_) {}
    return json({ error: 'stt_failed', message: String(e.message || e) }, 502, cors);
  }
}

async function sttRetry(env, buf) {
  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cfAccount(env)}/ai/run/${STT_MODEL}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: bufToB64(buf), task: 'transcribe', language: 'zh', vad_filter: true }),
    });
    const d = await res.json();
    if (!res.ok || !d.success) return '';
    return String((d.result && d.result.text) || '').trim();
  } catch (_) {
    return '';
  }
}

async function sttLegacy(env, buf, type, cors) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccount(env)}/ai/run/${STT_MODEL_LEGACY}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': type },
      body: buf,
    }
  );
  const d = await res.json();
  if (!res.ok || !d.success) {
    return json({ error: 'stt_upstream', detail: (d && d.errors) || res.status }, 502, cors);
  }
  const raw = ((d.result && d.result.text) || '').trim();
  const text = TRAD_ONLY.test(raw) ? await toSimplified(env, raw) : raw;
  return json({ text, lang: '', prob: 0 }, 200, cors);
}

/* 语音转写的语义纠错：同音字/近音字听错（"增强绿气"→"讲讲氯气"）、漏标点，
   交给小模型按原意修一遍。只改错字和标点，绝不改写、不扩写、不解释。 */
const STT_FIX_SYSTEM = `你是一个中文语音转写纠错器。输入是一段手机语音识别结果，常见问题是同音字/近音字听错、断句缺失。
规则：
1. 只修听错的字词，让它变成说话人本来想说的正常句子，例如「增强绿气的化学性质」→「讲讲氯气的化学性质」，「西医说说牛多的定律」→「细细说说牛顿的定律」。
2. 保留说话人的语气和口语习惯，不要改成书面语，不要扩写，不要解释，不要加引号。
3. 补上合理的标点，一句话结束用句号或问号。
4. 如果原文已经通顺，原样返回，一个字都不要动。
5. 只输出纠错后的句子本身。`;

async function fixTranscript(env, text, lang) {
  const src = String(text || '').trim();
  // 太短（一两个字）没什么可纠，英文不走中文纠错
  if (!src || src.length < 3 || lang !== 'zh') return '';
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const ctrl = new AbortController();
  const guard = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, 7000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: STT_FIX_SYSTEM },
          { role: 'user', content: src },
        ],
        temperature: 0,
        max_tokens: Math.min(400, src.length * 2 + 60),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return '';
    const d = await res.json();
    let out = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    // 模型偶尔带「纠错后：」这类前缀或包一层引号，剥掉
    out = out.replace(/^(纠错后的?句子|纠错结果|结果|修订后)[:：]\s*/, '').trim();
    out = out.replace(/^["'「『](.*)["'」』]$/s, '$1').trim();
    if (!out) return '';
    // 长度暴涨说明模型在瞎扩写，宁可信原文
    if (out.length > src.length * 2.2 + 20) return '';
    // 跟原文一个共同字都没有，说明它自己写了一段，不是纠错
    const srcSet = new Set(src.replace(/\s/g, ''));
    if (!Array.from(out.replace(/\s/g, '')).some(c => srcSet.has(c))) return '';
    return out;
  } catch (_) {
    return '';
  } finally {
    clearTimeout(guard);
  }
}

/* 纯文本纠错接口：前端松手先拿原文秒出字，再单独来这儿换一版纠错后的。
   跟 /api/stt?fix=1 相比只省掉一次 whisper，快一整截（明轩 2026-10-29 说识别太慢）。 */
export async function handleSttFix(request, env, cors) {
  if (!env.LLM_API_KEY) return json({ ok: false, error: 'no_llm' }, 200, cors);
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const src = String((body && body.text) || '').trim().slice(0, 600);
  const lang = (body && body.lang) === 'en' ? 'en' : 'zh';
  if (!src) return json({ ok: false, error: 'empty' }, 200, cors);
  if (src.length < 3 || lang !== 'zh') return json({ ok: false, error: 'skip', text: src }, 200, cors);
  const fixed = await fixTranscript(env, src, lang);
  if (!fixed || fixed === src) return json({ ok: false, error: 'same', text: src }, 200, cors);
  return json({ ok: true, text: fixed, raw: src }, 200, cors);
}

/* ---------------- 资源存取（图片/语音） ---------------- */
const ASSET_TTL = 7 * 24 * 3600;

export async function saveAsset(env, dataUrl, kind, ttl = ASSET_TTL) {
  // 录音常见 dataURL 是 data:audio/webm;codecs=opus;base64,...
  // 不能只匹配 [^;]+;base64，否则带 codecs 参数的音频会被判成 save_failed
  const m = /^data:([^,]+);base64,([\s\S]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const id = `${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await env.MINXTOK_KV.put(`asset:${id}`, JSON.stringify({ type: m[1], data: m[2] }), { expirationTtl: ttl });
  return `/api/asset/${id}`;
}

// 日记里的图片/语音：只存文件，不交给 AI 识别；保留一年，避免日记里的媒体七天就失效
export async function handleAssetUpload(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, kind, data } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (kind !== 'img' && kind !== 'aud') return json({ error: 'invalid_kind' }, 400, cors);
  if (typeof data !== 'string') return json({ error: 'invalid_data' }, 400, cors);
  const prefix = kind === 'img' ? 'data:image/' : 'data:audio/';
  if (!data.startsWith(prefix)) return json({ error: 'invalid_type' }, 400, cors);
  if (data.length > (kind === 'img' ? MAX_IMAGE : MAX_AUDIO)) {
    return json({ error: kind === 'img' ? 'image_too_large' : 'audio_too_large' }, 413, cors);
  }
  const url = await saveAsset(env, data, kind, 365 * 24 * 3600);
  if (!url) return json({ error: 'save_failed' }, 500, cors);
  return json({ ok: true, url }, 200, cors);
}

export async function handleAsset(req, env) {
  const cors = corsHeaders(env);
  const id = new URL(req.url).pathname.split('/').pop();
  const raw = await env.MINXTOK_KV.get(`asset:${id}`, 'json');
  if (!raw) return new Response('not found', { status: 404, headers: cors });
  const bin = Uint8Array.from(atob(raw.data), c => c.charCodeAt(0));
  return new Response(bin, {
    headers: { 'Content-Type': raw.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400', ...cors },
  });
}


/* ---------------- 图片理解：DeepSeek 视觉，Workers AI 兜底 ---------------- */
export async function visionDebug(env, dataUrl) {
  if (!env.LLM_API_KEY) return { ok: false, tries: [{ error: 'missing_llm_api_key' }] };
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  // DeepSeek 主接口；失败时只换模型/清晰度，不再重复打第二个地址，避免拖慢整轮识别。
  const url = `${base}/chat/completions`;
  // 主对话和识图统一到原生视觉模型（v4f / deepseek-v4-flash），
  // VISION_MODEL 优先；再退回 deepseek-flash 与实验模型，避免单个别名抖动。
  const models = [...new Set([env.VISION_MODEL, 'deepseek-v4-flash', 'deepseek-flash', 'deepseek-v4-flash-vision-exp'].filter(Boolean))]
    .filter(m => !/^deepseek-(chat|reasoner|v4-pro)$/i.test(m));
  const prompt = [
    '你是识图和文字转写助手。只写图片里真实看得到的内容，不要猜测、不要编造。',
    '用中文尽量详细地描述画面主体、场景、人物/物体、布局和关键细节。',
    '如果图中有任何文字（包括票据、菜单、招牌、截图、公式、英文、数字、符号），必须另起一段以“【图中文字】”开头，逐字转写全部看得清的文字；保留原文语言、大小写、数字和符号，不要翻译、不要概括、不要省略。',
    '文字很多时按原图顺序分行列出；看不清的字写“[看不清]”。没有文字就写“【图中文字】无”。',
  ].join('\n');
  // 只留两次尝试：原图清晰度失败再退 high，别为了兜底连着打四轮把用户晾在那儿
  const attempts = [
    { model: models[0], detail: 'original' },
    { model: models[1] || models[0], detail: 'high' },
  ].filter(x => x.model);
  const tries = [];
  for (const { model, detail } of attempts) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl, detail } },
              ],
            }],
            temperature: 0.1,
            // v4f/deepseek-flash 会先消耗 reasoning tokens；1100 常被思考过程吃光，
            // 导致 HTTP 200 但 content 为空，前端看起来就是“识图挂了”。
            max_tokens: 3200,
          }),
          // 单次识别最多等 25 秒，卡住的请求直接放弃换下一次，避免整页干等
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
          tries.push({ url, model, detail, status: res.status, body: (await res.text()).slice(0, 300) });
          continue;
        }
        const d = await res.json();
        const content = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (typeof content === 'string' && content.trim()) {
          return { ok: true, content: content.trim(), url, model, tries };
        }
        if (Array.isArray(content)) {
          const text = content.map(x => (typeof x === 'string' ? x : x && x.text) || '').join('').trim();
          if (text) return { ok: true, content: text, url, model, tries };
        }
        tries.push({ url, model, detail, status: res.status, body: JSON.stringify(d).slice(0, 300) });
      } catch (e) {
        tries.push({ url, model, detail, error: String(e && e.message || e).slice(0, 200) });
      }
  }
  return { ok: false, tries };
}

export async function handleVisionDebug(req, env) {
  const cors = corsHeaders(env);
  if (!env.VISION_DEBUG_KEY || req.headers.get('x-debug-key') !== env.VISION_DEBUG_KEY) {
    return json({ error: 'not_found' }, 404, cors);
  }
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const image = body.image || '';
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return json({ error: 'invalid_image' }, 400, cors);
  }
  if (image.length > MAX_IMAGE) return json({ error: 'image_too_large' }, 413, cors);
  return json(await visionDebug(env, image), 200, cors);
}

async function deepseekVision(env, dataUrl) {
  const r = await visionDebug(env, dataUrl);
  return r.ok ? r.content : '';
}

function visionUnavailableReason(probe) {
  const tries = (probe && probe.tries) || [];
  if (tries.some(t => t.error === 'missing_llm_api_key')) return 'missing_key';
  for (const t of tries) {
    if (t.status === 402) return 'balance';
    if (t.status === 429) return 'rate_limit';
    if (t.status === 502 || t.status === 503 || t.status === 504) return 'busy';
    if (t.error) return 'network';
  }
  return 'failed';
}

// 详细版：把识别引擎和失败原因一起交给上层，前端才能显示“Vision 暂不可用，使用 OCR”
export async function describeImageDetailed(env, dataUrl) {
  // OCR 与视觉识别互不依赖：先并行发起，视觉成功就直接用视觉结果，
  // 失败时 OCR 往往已经跑完，省掉一次完整往返（识别更快，质量不变）。
  const ocrP = ocrSpaceText(env, dataUrl).catch(() => '');
  const probe = await visionDebug(env, dataUrl);
  if (probe.ok) {
    let text = probe.content;
    // 视觉模型经常只写画面、漏掉长文字；识别结果偏短时把并行跑完的 OCR 补上，
    // 保证截图里的文字不被吃掉。OCR 已经在跑，等它通常只多几十毫秒。
    if (String(text).length < 320) {
      const ocrText = await Promise.race([ocrP, new Promise(r => setTimeout(() => r(''), 4000))]);
      const clean = String(ocrText || '').trim();
      if (clean && !String(text).includes(clean.slice(0, 20))) {
        text += `\n【图中文字补充】${clean.slice(0, 1500)}`;
      }
    }
    return { text, engine: 'vision', reason: '' };
  }
  const ocrText = await ocrP;
  if (ocrText) {
    return {
      text: `图中文字：${ocrText.slice(0, 1200)}`,
      engine: 'ocr',
      reason: visionUnavailableReason(probe),
    };
  }
  if (!env.CF_AI_TOKEN) {
    return { text: '', engine: 'none', reason: visionUnavailableReason(probe) };
  }
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return { text: '', engine: 'none', reason: visionUnavailableReason(probe) };
  const bytes = Array.from(atob(m[2]), c => c.charCodeAt(0));
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccount(env)}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: OCR_PROMPT, image: bytes, max_tokens: 400 }),
      }
    );
    if (!res.ok) return { text: '', engine: 'none', reason: visionUnavailableReason(probe) };
    const d = await res.json();
    const text = String(((d.result || {}).response) || '').trim();
    return { text, engine: text ? 'workers' : 'none', reason: visionUnavailableReason(probe) };
  } catch (_) {
    return { text: '', engine: 'none', reason: visionUnavailableReason(probe) };
  }
}

export async function describeImage(env, dataUrl) {
  return (await describeImageDetailed(env, dataUrl)).text;
}

export async function handleImageDescribe(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const image = body.image || '';
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return json({ error: 'invalid_image' }, 400, cors);
  }
  if (image.length > MAX_IMAGE) return json({ error: 'image_too_large' }, 413, cors);
  const out = await describeImageDetailed(env, image);
  return json({ ok: true, ...out }, 200, cors);
}

/* ---------------- 繁转简（轻量后处理） ---------------- */
export async function toSimplified(env, text) {
  if (!text) return '';
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: SIMPLIFY_SYSTEM },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: Math.min(400, text.length + 80),
      }),
    });
    const d = await res.json();
    const out = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    return out.trim() || text;
  } catch (_) {
    return text;
  }
}
