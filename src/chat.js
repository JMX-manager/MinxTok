// 对话接口：SSE 流式输出、频控、额度、暂停校验、追问生成

import { corsHeaders, json, uidOk, minuteKey, isPaused, getRuntimeConfig, dayKey } from './util.js';
import { streamChat, makeFollowups, systemPrompt } from './llm.js';
import { tagAndSave } from './emotion.js';
import { buildMessageBlocks } from './blocks.js';
import { articleIntent, writeArticle } from './article.js';
import { pendingGiftFor, handleGiftCode, looksLikeGiftCode, ensureHolidayGift } from './gift.js';
import { resolveMusic, lookupSong, musicIntent, guessSong, recommendSong, replySuggestsMusic, pickedGenre, recommendByGenre, genreFallback, titleMatches, stripMusicTail, songFromReply } from './music.js';
import { getWeatherData, getNewsData, summarizeNews } from './cards.js';
import { quotaState, consumeQuota } from './quota.js';
import { saveAsset, describeImageDetailed } from './media.js';
import { getAssistantSettings, assistantPrompt, maybeGenerateAssistantDiary, isBirthdayToday } from './assistant.js';
import { decideWebSearch, qianfanWebSearch, buildWebContext, buildLearnedContext, learnWebResults, recallWebKnowledge } from './web.js';
import {
  ensureConversation, insertMessage, listMessages, listConversations,
  bumpUsage, getUsage, logEvent, updateMessageBlocks, deleteMessage, countMessages,
} from './store.js';

const MAX_INPUT = 4000;

function blocksToText(blocks) {
  return (blocks || []).map(b => {
    if (b.type === 'text') return b.text;
    if (b.type === 'quote') return `（引用：${b.text}）`;
    return '';
  }).filter(Boolean).join('\n');
}


// 追问清洗：人称、长度、空话、跟正文重复、助手招呼语全拦掉
function sanitizeFollowups(list, answer) {
  const BAN = /^(说详细点|展开说说?|再具体点?|详细说说|换个角度(讲讲|说说)?|想聊点啥|聊点啥|需要我(帮忙)?吗|还想知道什么|有什么可以帮|有什么想问|你还有(什么|别的)问题吗)/;
  const ASSIST = /(我可以帮你|需要我|要不要我|我来帮你|有什么可以帮)/;
  const out = [];
  for (const raw of list || []) {
    let x = String(raw || '')
      .replace(/^[\s\d.、)）\-*•]+/, '')
      .replace(/^["'“”「」]+|["'“”「」]+$/g, '')
      .replace(/[，,。；;\s]+$/, '')
      .trim();
    if (!x) continue;
    if (x.length > 18) continue;
    if (BAN.test(x)) continue;
    // 助手招呼口吻：直接丢
    if (ASSIST.test(x)) continue;
    // 第三人称自称：用户不会说"明轩"或"用户"
    if (/明轩|用户|他(?=觉得|说|想)/.test(x)) continue;
    // 跟正文几乎一样的废话；短句可能是对助手提问的直接回答，不能误杀
    const plain = x.replace(/[？?]/g, '');
    if (answer && plain.length >= 6 && answer.includes(plain)) continue;
    if (out.includes(x)) continue;
    out.push(x);
  }
  return out;
}

// 模型不知道今天几号就会瞎猜年份，每轮都把北京时间塞进上下文
function nowNote() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()];
  return `\n【当前时间】${d.getUTCFullYear()}年${p(d.getUTCMonth() + 1)}月${p(d.getUTCDate())}日 ${wk} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}（北京时间 GMT+8）。回答“今天/现在/今年/这周”一律以此为准，不要凭训练数据猜年份。`;
}

export async function handleChat(req, env, ctx) {
  const cors = corsHeaders(env);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const { uid, message, conversationId, quote, nickname, lang, image, imageText, imageDesc, imageEngine, audio, audioType, audioDuration } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if ((typeof message !== 'string' || !message.trim()) && !image && !audio) return json({ error: 'empty_message' }, 400, cors);
  if (typeof message !== 'string') body.message = '';
  if ((message || '').length > MAX_INPUT) return json({ error: 'message_too_long', limit: MAX_INPUT }, 400, cors);

  // 1) 暂停开关：后台一关，前端立刻 423，聊天直接拒绝
  const paused = await isPaused(env);
  if (paused) {
    return json({ error: 'paused', reason: paused.reason || '服务暂停中' }, 423, cors);
  }

  const cfg = await getRuntimeConfig(env);

  // 1.5) 全站日调用上限：Cloudflare 免费额度与模型账单的保险丝
  //      按天计数（KV `cap:<日期>`），超过就温柔拒绝，不打挂整站
  const cap = Number(cfg.globalDailyCap ?? env.GLOBAL_DAILY_CAP ?? 3000);
  if (cap > 0) {
    const capKey = `cap:${dayKey()}`;
    const used = Number((await env.MINXTOK_KV.get(capKey)) || '0');
    if (used >= cap) {
      ctx.waitUntil(logEvent(env, 'daily_cap_hit', { used, cap }));
      return json({ error: 'daily_cap', cap, used }, 429, cors);
    }
    ctx.waitUntil(env.MINXTOK_KV.put(capKey, String(used + 1), { expirationTtl: 172800 }));
  }

  // 2) 频控：每用户每分钟
  const rlKey = `rl:${uid}:${minuteKey()}`;
  const rl = Number((await env.MINXTOK_KV.get(rlKey)) || '0');
  if (rl >= cfg.ratePerMin) {
    ctx.waitUntil(logEvent(env, 'rate_limited', { uid }));
    return json({ error: 'rate_limited', retryAfter: 60, limit: cfg.ratePerMin }, 429, cors);
  }
  ctx.waitUntil(env.MINXTOK_KV.put(rlKey, String(rl + 1), { expirationTtl: 120 }));

  // 3) 每日额度
  const qs = await quotaState(env, uid);
  if (qs.left <= 0) {
    return json({ error: 'quota_exceeded', used: qs.used, limit: qs.limit, left: qs.left }, 429, cors);
  }

  // 4) 扣额度：发送即扣（中途停止也算用掉一次），追问走同一个接口同样计次
  //    先扣当天，当天用完再扣限时总量包
  let chargedUsed = null;
  try { chargedUsed = (await consumeQuota(env, uid)).used; } catch (_) { chargedUsed = null; }

  // 5) 落库用户消息
  const wantMusic = musicIntent(message);
  const pendingSong = wantMusic ? guessSong(message) : '';
  const pendingGenre = wantMusic ? pickedGenre(message) : '';
  const wantsSwitch = /(换一首|换首|再来一首|再放一首|再换一首|换一个|不好听)/.test(message);
  const pendingScene = pendingSong ? 'named' : (pendingGenre ? 'genre' : (wantsSwitch ? 'again' : (wantMusic ? 'follow' : '')));
  const convId = await ensureConversation(env, uid, conversationId, message);
  const userBlocks = [];
  if (quote && quote.text) userBlocks.push({ type: 'quote', text: String(quote.text), messageId: quote.messageId });
  if (image) {
    const url = await saveAsset(env, image, 'img');
    if (url) userBlocks.push({ type: 'image', url, caption: message.slice(0, 120) });
  }
  if (audio) {
    const url = await saveAsset(env, `data:${audioType || 'audio/webm'};base64,${audio}`, 'aud');
    if (url) userBlocks.push({ type: 'audio', url, duration: Number(audioDuration) || 0, text: message.slice(0, 200) });
  }
  if (message) userBlocks.push({ type: 'text', text: message });
  const userSaved = await insertMessage(env, { uid, convId, role: 'user', blocks: userBlocks });
  // 用户这条消息顺手打情绪标签，后台跑，不占聊天时间、失败也不影响
  if (message) ctx.waitUntil(tagAndSave(env, { messageId: userSaved.id, uid, convId, role: 'user', text: message }));
  // 助理日记到点就静默写一篇，不打断聊天
  ctx.waitUntil(maybeGenerateAssistantDiary(env, uid));

  // 5) 天气/新闻意图：后端直接取数，塞进上下文，并附卡片
  const wantsWeather = /(天气|气温|下雨|降水|带伞|多少度|冷不冷|热不热|穿什么)/.test(message);
  const wantsNews = /(新闻|资讯|热点|头条|发生了什么|大事)/.test(message);
  const wantsArticle = articleIntent(message) && message.length > 3;
  // 口令优先：说的话像口令就先兑换，兑换成功本轮末尾附礼物卡
  // 口令是一次性的惊喜，兑换完不走追问、不啰嗦，让礼物卡当主角
  let giftCard = null;
  let giftJustRedeemed = false;
  let giftCodeError = '';
  if (looksLikeGiftCode(message)) {
    const redeemed = await tryRedeemGiftCode(env, uid, message);
    giftCard = redeemed.gift;
    giftJustRedeemed = !!giftCard;
    giftCodeError = redeemed.error || '';
  }
  const extraCards = [];
  let contextNote = '';

  if (wantsWeather) {
    try {
      const lat = Number(body.lat) || 41.88;
      const lon = Number(body.lon) || 123.92;
      const longRange = /(周末|下周|一周|七天|十五天|大后天|这几天|未来)/.test(message);
      const w = await getWeatherData(env, lat, lon, body.city || '', longRange ? 15 : 3);
      const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const daysText = (w.days || []).map((d, i) => {
        const label = i === 0 ? '今天' : i === 1 ? '明天' : i === 2 ? '后天' : '';
        const wd = wk[new Date(d.date + 'T00:00:00Z').getUTCDay()] || '';
        return `${label ? label + '·' : ''}${d.date} ${wd} ${d.text}，${d.min}~${d.max}℃`;
      }).join('；');
      const rainSoon = (w.hourly || []).some(h => h.mm > 0);
      contextNote += `\n【已获取实时天气】${w.city} 当前 ${w.now.temp}℃、${w.now.text}，湿度 ${w.now.humidity}%，体感 ${w.now.feels}℃。未来三天：${daysText}。${rainSoon ? '两小时内有降水。' : ''}建议：${w.advice.join(' ')}。\n这些数据是刚刚查到的，直接据此回答，禁止说查不到或没有联网。用户问周末或具体日期时，就报对应日期那几天的数据，不要只讲今天明天。`;
      extraCards.push({
        type: 'weather', city: w.city, temp: w.now.temp, text: w.now.text, icon: w.now.icon,
        humidity: w.now.humidity, advice: w.advice[0], lat, lon, present: 'sheet',
      });
    } catch (_) { /* 天气失败不影响对话 */ }
  }

  if (wantsNews) {
    try {
      const items = await getNewsData(env, 5);
      if (items.length) {
        contextNote += `\n【已获取今日新闻】${items.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}（${n.source}）`).join('；')}。\n这些是刚取到的真实新闻，挑一条自然聊两句，禁止说查不到新闻或搞不了。`;
        const brief = await summarizeNews(env, items[0]);
        extraCards.push({
          type: 'news', title: '今日资讯', summary: brief, source: items[0].source,
          url: items[0].url, cover: items[0].cover, items: items.slice(0, 5), present: 'open',
        });
      }
    } catch (_) { /* 新闻失败不影响对话 */ }
  }

  // 6) 组装上下文（最近 20 条）
  const history = await listMessages(env, uid, convId, 20);
  const recentSongs = history.slice(-10).flatMap(m =>
    (m.blocks || []).filter(b => b.type === 'music' && b.title).map(b => ({ title: b.title, artist: b.artist || '' }))
  ).slice(-6);
  const recentText = [...new Set(recentSongs.map(s => `${s.title}${s.artist ? ' - ' + s.artist : ''}`))].join('、');

  // 主聊天联网：先让模型判断要不要查，再取千帆结果塞进上下文；查到的资料顺手存下来。
  // 天气、新闻、音乐、文章已有专门链路，不重复查；图片/语音也不在這一轮抢跑。
  // 图片也可以联网：图上有店名、票面、作品名时，先让下面的识图结果进上下文，
  // 再判断要不要查公开资料。纯图片没有文字时 canWeb 仍为 false。
  const canWeb = !!message && !wantsWeather && !wantsNews && !wantMusic && !wantsArticle &&
    !giftJustRedeemed && !audio;
  let webMeta = null;
  if (canWeb) {
    try {
      // 图片预览阶段已经识别出的文字也交给检索调度器，避免“这个是什么”只拿一句空话去搜。
      const webSeed = String(message || '') +
        (typeof imageDesc === 'string' && imageDesc.trim() ? `\n【图片内容】${imageDesc.slice(0, 1200)}` : '');
      const decision = await decideWebSearch(env, webSeed, history.slice(-5));
      if (decision) {
        const results = await qianfanWebSearch(env, decision.query, 10);
        if (results.length) {
          const terms = String(decision.query || '').split(/[\s,，、;；]+/).filter(Boolean).length || 1;
          webMeta = { query: decision.query, results, terms };
          contextNote += buildWebContext(results);
          ctx.waitUntil(learnWebResults(env, uid, decision.query, results));
        }
      }
    } catch (_) { /* 联网失败不影响正常聊天 */ }
    // 这轮没查到新东西时，翻一翻以前学过的资料，作为旧背景。
    if (!webMeta) {
      try {
        const learned = await recallWebKnowledge(env, uid, message);
        if (learned.length) contextNote += buildLearnedContext(learned);
      } catch (_) {}
    }
  }

  let imageMeta = null;
  if (image) {
    const info = typeof imageDesc === 'string'
      ? { text: imageDesc, engine: imageEngine || 'vision', reason: '' }
      : await describeImageDetailed(env, image);
    imageMeta = info;
    if (info.text) {
      contextNote += `\n【用户发来一张图片】画面内容：${info.text.slice(0, 2400)}${imageText ? ' 图中文字：' + imageText.slice(0, 800) : ''}。请只根据这段画面内容回答，不要补充图片里没有的东西。`;
      if (info.engine === 'ocr') contextNote += '\n【图片识别说明】本轮画面内容来自 OCR 文字识别，可能不完整；只根据识别出的文字回答，不要编造画面细节。';
    } else {
      contextNote += '\n【用户发来一张图片，但图片识别没有返回结果】不要猜图片内容，也不要假装看清了。直接简短说明这张图没识别出来，请用户重发清晰图片或描述一下图里有什么。';
    }
  }
  if (audio) contextNote += `\n【用户发来一条语音】转写内容：${message}。直接回答这段语音。`;
  if (giftJustRedeemed) {
    const giftAmount = Number(giftCard && giftCard.amount) || 0;
    contextNote += `\n【用户刚兑了礼物口令】这轮先自然接住：承认对方是拿口令换来的，不要装傻说没有这回事，也不要否认代码。直接告诉对方拿到了 ${giftAmount} 额度，再提醒点开卡片收下。可以学这种口吻但别照抄：『哎呀，这么神秘的口令都被你翻到了，恭喜拿到 ${giftAmount} 额度。』或者高冷一点：『啧，你的 ${giftAmount} 额度，点开收下。』不要问问题，不要解释兑换规则或系统，不要输出音乐标记，全文不超过 50 字。`;
  } else if (giftCodeError === 'already_claimed') {
    contextNote += '\n【用户发来一个已经兑换过的礼物口令】不要否认这个口令存在，也不要装傻。直接说这个口令之前已经领过了，额度卡就在上面的记录里；如果还想要新额度，让对方用新的内测口令。语气自然、简短，不要解释系统，不要问问题。';
  } else if (giftCodeError) {
    contextNote += '\n【用户发来的礼物口令没有兑换成功】如实说这个口令没查到或已过期，不要编造已经发卡；可以提醒对方确认大小写，或换一个新的内测口令。简短自然，不要解释系统。';
  }
  if (pendingScene === 'named') contextNote += `\n【音乐场景：点名点歌】用户想听《${pendingSong}》。回复按“好嘞，来听《${pendingSong}》”的口吻，并在最后一行输出 [MUSIC]||${pendingSong}|歌手|。`;
  if (pendingScene === 'genre') contextNote += `\n【音乐场景：点类型】用户想听${pendingGenre}类型。回复按“好的，来一首${pendingGenre}的”的口吻，不要说出具体歌名，最后一行输出 [MUSIC]||歌名|歌手| 由你挑一首真实的${pendingGenre}歌。`;
  if (pendingScene === 'again') contextNote += `\n【音乐场景：换一首】用户要换。回复按“这首换掉，来听《歌名》”的口吻，说一句区别，最后一行输出 [MUSIC]||歌名|歌手|。`;
  if (pendingScene === 'follow') contextNote += `\n【音乐场景：随便放】用户让你随便放一首。回复按“行，给你放一首<风格>的，先听着”的口吻，最后一行输出 [MUSIC]||歌名|歌手|。`;
  if (recentText && (pendingScene === 'genre' || pendingScene === 'again' || pendingScene === 'follow')) {
    contextNote += `\n【最近放过】${recentText}。这次不要重复这些歌，换一首。`;
  }

  // 前几轮对话：提示词侧重介绍站内功能，追问也优先模仿新用户会问的站内问题
  const early = (await countMessages(env, uid)) < 6;
  if (early) contextNote += '\n【新用户前几轮】对方刚来到 MinxTok。回答时先用一两句自然介绍这里能做什么（聊天、天气、新闻、找歌、写文章、日记、学习答疑、游戏、助理设置），每次只挑跟当前话题最相关的 1–2 项，不要一次列成长清单，也不要像产品说明书。';

  // 生日问候：按北京时间生日当天第一次聊天触发，KV 当天去重，避免每轮重复
  const asSettings = await getAssistantSettings(env, uid);
  const today = dayKey();
  const birthdayKey = `birthday:${uid}:${today}`;
  let birthdayGreet = false;
  if (isBirthdayToday(asSettings.userBirthday, today)) {
    try { birthdayGreet = !(await env.MINXTOK_KV.get(birthdayKey)); } catch (_) { birthdayGreet = true; }
    if (birthdayGreet) contextNote += '\n【今天是用户的生日】本轮回复的第一句先自然、真诚地祝对方生日快乐，可以带上称呼；再顺着当前话题往下聊。不要提系统、日期、资料库或“根据设置”，不要用客服腔，不要长篇。';
  }

  // 带图片的这一轮不塞旧对话：否则模型很容易拿上文旧题套图，
  // 看起来像"没看图、在复读上一轮"。图片本身就是本轮唯一上下文。
  const historyForLlm = image ? [] : history;
  const llmMessages = [
    { role: 'system', content: systemPrompt(nickname || '明轩', asSettings, String(lang || '').toLowerCase() === 'en' ? 'en' : 'zh') + nowNote() + contextNote },
    ...historyForLlm.map(m => ({ role: m.role, content: blocksToText(m.blocks) })).filter(m => m.content),
  ];

  // 6) SSE 流
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event, data) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch (_) { closed = true; }
      };

      try {
        send('meta', {
          conversationId: convId,
          model: env.LLM_MODEL || 'deepseek-chat',
          dailyQuota: cfg.dailyQuota,
          web: webMeta ? { query: webMeta.query, count: webMeta.results.length, terms: webMeta.terms } : null,
          image: imageMeta && imageMeta.engine === 'ocr'
            ? { engine: 'ocr', fallback: true, note: '图片文字已用OCR识别' }
            : null,
        });

        let text = '';
        let tick = 0;
        for await (const delta of streamChat(env, llmMessages)) {
          text += delta;
          send('delta', { text: delta });
          // 每 30 段检查一次暂停开关，后台按了暂停就立刻收口
          if (++tick % 30 === 0) {
            const p = await isPaused(env);
            if (p) { send('stop', { reason: 'paused' }); break; }
          }
        }

        // 文字输出完毕后，再挂骨架卡去查歌（卡片后置，符合“先说话、后出卡”）
        // 标记认宽一点：模型常漏结尾竖线、大小写混写、多一个方括号
        const hasMarker = /\[{1,2}\s*MUSIC\s*\]{1,2}/i.test(text);
        // “更柔/更安静”这类话只有在本轮对话确实在聊歌时才算听歌意图，避免误伤日常聊天
        const musicTopic = history.slice(-8).some(m =>
          (m.blocks || []).some(b => b.type === 'music') ||
          /(听歌|放首|来首|换首|这首歌|歌名|歌手|音乐)/.test(blocksToText(m.blocks))
        );
        const suggest = musicTopic && replySuggestsMusic(text);
        // 模型忘了写标记但回复里已经报了歌名，也算要出卡
        // 只有本轮本来就在聊歌/要歌，回复里报出的歌名才算“要出卡”；
        // 否则随口一句提到歌名就凭空多一张「虾虾推荐」，非常突兀。
        const announced = (wantMusic || musicTopic) ? songFromReply(text) : '';
        const needCard = wantMusic || hasMarker || suggest || !!announced;
        if (needCard) send('card_pending', { type: 'music' });
        if (wantsArticle) send('card_pending', { type: 'article' });

        // 文章：跟音乐卡同一套节奏——正文说完才出卡，卡里只放 id/标题/摘要
        let articleCard = null;
        if (wantsArticle) {
          try { articleCard = await writeArticle(env, uid, message); } catch (_) { articleCard = null; }
        }

        // 音乐标记 → QQ 音乐卡片（后端解析，前端不再拼 URL）
        let music = await resolveMusic(env, text);
        const avoidDup = pendingScene === 'genre' || pendingScene === 'again' || pendingScene === 'follow';
        const duplicate = avoidDup && music.cards.some(c =>
          recentSongs.some(r => titleMatches(r.title, c.title))
        );
        const avoid = recentText ? `\n不要推荐最近放过的：${recentText}` : '';
        // 模型没吐标记但用户明确要听歌：从原话里猜歌名，后端补一张卡
        if (needCard && (!music.cards.length || duplicate)) {
          // 没指定歌名就让模型挑一首，保证有卡片；把助手原话一起给它，贴合“更柔一点”这种要求
          let song = pendingSong;
          let artist = '';
          if (!song && pendingGenre) {
            // 用户点的是类型不是歌名：按类型挑一首真实的歌
            let pick = await recommendByGenre(env, pendingGenre, `${message}${avoid}`);
            if (!pick) pick = genreFallback(pendingGenre, recentSongs);
            if (pick && recentSongs.some(r => titleMatches(r.title, pick.song))) {
              pick = genreFallback(pendingGenre, recentSongs) || pick;
            }
            if (pick) { song = pick.song; artist = pick.artist; }
          }
          if (!song) {
            const pick = await recommendSong(env, `${message}\n它刚才说：${text}${avoid}`);
            if (pick) { song = pick.song; artist = pick.artist; }
          }
          if (song) music = { text: music.text, cards: [await lookupSong(env, song, artist)] };
        }
        music.text = stripMusicTail(music.text || '', music.cards);
        const cardList = [...extraCards, ...music.cards];
        // 骨架卡已经先发下去了，就必须有真卡收尾：查不到也给一张 QQ 音乐搜索卡，
        // 否则用户会看到「有骨架没卡片」，还得再问一句才补。
        if (needCard && !cardList.some((c) => c && c.type === 'music')) {
          // 先按回复里报出的歌名去查真卡，查不到再退到搜索卡
          if (announced) {
            try {
              const hit = await lookupSong(env, announced);
              if (hit) cardList.push(hit);
            } catch (_) { /* 查不到就走下面的搜索卡 */ }
          }
        }
        if (needCard && !cardList.some((c) => c && c.type === 'music')) {
          const key = String(pendingSong || announced || pendingGenre || '').trim()
            || (/[歌音乐曲]/.test(message) ? message.replace(/[\s\S]*?(听|放|来|换)\s*/, '').slice(0, 24).trim() : '')
            || '虾虾推荐';
          cardList.push({
            id: `m_fb_${Date.now().toString(36)}`,
            type: 'music',
            title: key,
            artist: 'QQ音乐',
            action: 'open',
            url: `https://y.qq.com/n/ryqq/search?searchKey=${encodeURIComponent(key)}`,
          });
        }
        if (articleCard) cardList.push(articleCard);
        // 礼物卡固定压在最后：运营推的排在用户兑换的后面，都等这一轮生成完再出
        // 节日活动：当天第一次聊到这儿才建卡，卡片跟这条回复一起出现在最底部
        if (!giftCard) { try { await ensureHolidayGift(env, uid); } catch (_) {} }
        if (!giftCard) { try { giftCard = await pendingGiftFor(env, uid); } catch (_) {} }
        if (giftCard) cardList.push(giftCard);
        const blocks = buildMessageBlocks({ text: music.text, cards: cardList });
        const saved = await insertMessage(env, { uid, convId, role: 'assistant', blocks });
        const total = chargedUsed == null ? (await consumeQuota(env, uid)).used : chargedUsed;

        // 追问必须等正文出来后再生成：这样每一条都能咬住虾虾刚说的内容，
        // 不再提前猜、也不会出现“跟这条不搭”的问题。
        const fqEnabled = String(env.FOLLOWUPS || '1') === '1' && !!text.trim() && !giftJustRedeemed;
        let fItems = [];
        if (fqEnabled) {
          let items = await makeFollowups(env, llmMessages, String(music?.text || text || '').slice(0, 400), { early });
          items = sanitizeFollowups(items, String(music?.text || text || ''));
          // 不够三条再补一轮，仍然只看刚生成的回答；还不行就少给，不硬凑。
          if (items.length < 2) {
            const extra = await makeFollowups(env, llmMessages, String(music?.text || text || '').slice(0, 400), { early });
            for (const x of extra) {
              if (items.length >= 3) break;
              if (!items.includes(x)) items.push(x);
            }
          }
          // 联网/长回答偶尔会一条都生成不出来，导致追问整块消失。
          // 兜底给三条保底追问，宁可普通一点，也不要空着。
          if (!items.length) {
            items = ['展开说说细节', '有具体例子吗', '那我该怎么做'];
          }
          fItems = items.slice(0, 3);
        }

        // 追问跟着 block 一起发下去，用户不用再等一轮
        const finalBlocks = buildMessageBlocks({ text: music.text, cards: cardList, followups: fItems });
        // 虾虾这条也打标签：存的是纯正文，不含卡片和标记
        if (text.trim()) ctx.waitUntil(tagAndSave(env, { messageId: saved.id, uid, convId, role: 'assistant', text: String(text).slice(0, 400) }));
        send('block', {
          messageId: saved.id,
          blocks: finalBlocks,
          web: webMeta ? { query: webMeta.query, count: webMeta.results.length, terms: webMeta.terms } : null,
        });
        // 额度只认 quotaState 一套算法：每日额度按天重置，兑换/赠送走独立池，
        // 不再把赠送池并进每日上限（否则会被误算成“额度滚存”）。
        const st = await quotaState(env, uid);
        send('done', {
          messageId: saved.id,
          conversationId: convId,
          quota: {
            used: st.used,
            limit: st.dailyLimit,
            left: st.left,
            dailyLeft: st.dailyLeft,
            poolLeft: st.poolLeft,
          },
        });
        if (birthdayGreet) ctx.waitUntil(env.MINXTOK_KV.put(birthdayKey, '1', { expirationTtl: 3 * 86400 }));

        if (fItems.length) {
          await updateMessageBlocks(env, saved.id, finalBlocks);
        }
        ctx.waitUntil(logEvent(env, 'chat_ok', { uid, len: text.length }));
      } catch (e) {
        // AI 侧异常：直接推 error，客户端负责提示与重试
        send('error', { message: String((e && e.message) || e).slice(0, 200) });
        ctx.waitUntil(logEvent(env, 'chat_error', { uid, error: String((e && e.message) || e).slice(0, 300) }));
      } finally {
        closed = true;
        try { controller.close(); } catch (_) { /* 已关闭 */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...cors,
    },
  });
}

// 历史消息
export async function handleHistory(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const convId = url.searchParams.get('conversationId');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!convId) return json({ error: 'missing_conversationId' }, 400, cors);
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100);
  const before = Number(url.searchParams.get('before') || 0) || 0;
  const messages = await listMessages(env, uid, convId, limit, before);
  return json({ conversationId: convId, messages }, 200, cors);
}

// 删除消息
export async function handleDeleteMessage(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const id = url.pathname.split('/').pop();
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  await deleteMessage(env, uid, id);
  return json({ ok: true }, 200, cors);
}

// 会话列表
export async function handleConversations(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);
  const conversations = await listConversations(env, uid, limit);
  return json({ conversations }, 200, cors);
}


// 口令兑换：直接复用礼物卡逻辑，返回 block
async function tryRedeemGiftCode(env, uid, message) {
  try {
    const req = new Request('https://x/api/gift/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, code: String(message).trim() }),
    });
    const res = await handleGiftCode(req, env);
    const d = await res.json();
    if (d && d.ok && d.gift) return { gift: d.gift, error: '' };
    return { gift: null, error: (d && d.error) || 'code_error' };
  } catch (_) { return { gift: null, error: 'code_error' }; }
}
