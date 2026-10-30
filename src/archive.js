// 档案：把对话、日记、学习和情绪整理成可回看的一页
import { corsHeaders, json, uidOk } from './util.js';

const ARCH_WEEK = 7 * 86400000;
const ARCH_DAY = 86400000;

// 情绪不是好坏二元，但做趋势时需要一根能比较的标尺：0 低，100 高
const VALENCE = {
  happy: 1, love: 0.92, cool: 0.72, silly: 0.7, calm: 0.62,
  shock: 0.38, awkward: 0.34, speechless: 0.28,
  troubled: 0.22, tired: 0.2, down: 0.16, angry: 0.1,
};

const EMO_LABEL = {
  happy: '开心', awkward: '尴尬', calm: '平静', love: '喜欢',
  silly: '搞怪', cool: '酷', down: '低落', troubled: '纠结',
  angry: '生气', shock: '震惊', speechless: '无语', tired: '疲惫',
};

function startOfWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // 周一是一周开始
  return d.getTime() - diff * ARCH_DAY;
}

function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function weekLabel(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function monthLabel(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月`;
}

function summarize(emotions, total, scoreSum) {
  if (!total) return { total: 0, index: null, top: null, topLabel: '', emotions: [] };
  const list = Object.entries(emotions)
    .map(([key, count]) => ({
      key,
      label: EMO_LABEL[key] || key,
      count,
      share: count / total,
    }))
    .sort((a, b) => b.count - a.count);
  return {
    total,
    index: Math.round((scoreSum / total) * 100),
    top: list[0] ? list[0].key : null,
    topLabel: list[0] ? list[0].label : '',
    emotions: list,
  };
}

function bucketRows(rows, buckets, keyOf) {
  const map = new Map(buckets.map(b => [b.key, { count: {}, total: 0, scoreSum: 0 }]));
  for (const row of rows) {
    const key = keyOf(Number(row.created_at) || 0);
    const bucket = map.get(key);
    if (!bucket) continue;
    const emo = String(row.emo || '');
    if (!Object.prototype.hasOwnProperty.call(VALENCE, emo)) continue;
    const score = Math.max(0.1, Math.min(1, Number(row.score) || 0.5));
    bucket.count[emo] = (bucket.count[emo] || 0) + 1;
    bucket.total += 1;
    bucket.scoreSum += VALENCE[emo] * score;
  }
  return buckets.map(b => {
    const raw = map.get(b.key) || { count: {}, total: 0, scoreSum: 0 };
    return { ...b, ...summarize(raw.count, raw.total, raw.scoreSum) };
  });
}


// ---------- v3.19 档案大升级 ----------

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function logArchErr(env, kind, detail) {
  try {
    await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
      .bind(Date.now(), 'arch_ai_err', JSON.stringify({ kind, detail: String(detail || '').slice(0, 300) })).run();
  } catch (_) {}
}

async function askLLM(env, system, user, maxTokens = 400) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.75,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      await logArchErr(env, `llm ${res.status}`, t);
      return '';
    }
    const d = await res.json();
    const out = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    if (!out) await logArchErr(env, 'llm empty', JSON.stringify(d).slice(0, 160));
    return out;
  } catch (e) {
    await logArchErr(env, 'llm throw', String(e && e.message || e));
    return '';
  } finally {
    clearTimeout(timer);
  }
}

const DIARY_SYS = [
  '你在给一个高中生写「本周日记总结」。只输出一段中文，不写标题、不用 Markdown、不列条目。',
  '先判断这周日记是叙事为主还是抒情为主：',
  'A 叙事为主：写清这周发生了什么（人物、事件、结果），80–140 字，像熟人帮你回忆这一周。',
  'B 抒情为主：不要复述事件，直接总结这周的情绪状态、反复出现的情绪线索，再给一条具体可做的建议，80–140 字。',
  '语气温和克制，不说教，不喊口号，不用“加油”“相信自己”这类空话。不要编造日记里没有的事。',
].join('\n');

const MODE_ZH = {
  translate: '翻译', solve: '解题', practice: '练习', word: '查词',
  scene: '场景应答', essay: '作文', mistake: '错题', dict: '词典', drill: '刷题',
};

const STUDY_SYS = [
  '你在给一个高中生写「本周学习总结」。只输出一段中文，严格控制在 60–100 字（中文字符数），不写标题、不用 Markdown、不列条目、不编号。',
  '超过 100 字就算没写完，宁可只讲一两个点。不要罗列全部生词，挑最该记住的。',
  '内容按这个优先级挑重点：错题暴露的知识漏洞、解题时用到的方法、生词/短语的掌握情况。',
  '写具体一点（哪个知识点、哪类题、哪种方法），不要写“继续保持”“多练习”这种空话。没有某类数据就跳过它，别硬凑。',
].join('\n');

function weekRangeLabel(start, end) {
  const f = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  return `${f(start)}–${f(end - ARCH_DAY)}`;
}

// 模型偶尔会超字数：按句号收到上限内，别把一坨塞进卡片
function clampText(text, max) {
  const t = String(text || '').trim();
  if (!t || t.length <= max) return t;
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'));
  if (cut >= max * 0.5) return head.slice(0, cut + 1);
  const stop = Math.max(head.lastIndexOf('，'), head.lastIndexOf('；'), head.lastIndexOf('、'), head.lastIndexOf(' '));
  if (stop >= max * 0.5) return head.slice(0, stop) + '。';
  return head.replace(/[\s，、,；;]+$/, '') + '。';
}

async function aiCache(env, key, build, ttl = 21600) {
  try {
    const hit = await env.MINXTOK_KV.get(key);
    if (hit) return JSON.parse(hit);
  } catch (_) {}
  const built = await build();
  try {
    await env.MINXTOK_KV.put(key, JSON.stringify(built), { expirationTtl: ttl });
  } catch (_) {}
  return built;
}

export async function handleArchive(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);

  const now = Date.now();
  const weekStart = startOfWeek(now);
  const thisMonth = startOfMonth(now);

  // 周列表：从注册那一周一直排到本周
  let regTs = weekStart;
  try {
    const u = await env.DB.prepare('SELECT created_at FROM users WHERE id=?').bind(uid).first();
    regTs = Number(u && u.created_at) || weekStart;
  } catch (_) {}
  const firstWeek = startOfWeek(Math.min(regTs, weekStart));
  const weekN = Math.max(1, Math.min(60, Math.round((weekStart - firstWeek) / ARCH_WEEK) + 1));
  const weekList = Array.from({ length: weekN }, (_, i) => {
    const start = firstWeek + i * ARCH_WEEK;
    return {
      key: String(start),
      start,
      end: start + ARCH_WEEK,
      label: weekRangeLabel(start, start + ARCH_WEEK),
      short: weekLabel(start),
      isNow: start === weekStart,
    };
  });

  // 月列表：注册那个月到本月
  const firstMonth = startOfMonth(Math.min(regTs, now));
  const monthList = [];
  for (let d = new Date(firstMonth); d.getTime() <= thisMonth; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const start = d.getTime();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    monthList.push({ key: String(start), start, end: next, label: monthLabel(start), isNow: start === thisMonth });
  }

  // 选中周（前端传 w = 那一周的任意时间戳）
  let selStart = weekStart;
  const qw = Number(url.searchParams.get('w'));
  if (qw > 0) {
    const aligned = startOfWeek(qw);
    if (aligned >= firstWeek && aligned <= weekStart) selStart = aligned;
  }
  const selEnd = selStart + ARCH_WEEK;
  const since = Math.min(firstWeek, firstMonth);

  const [
    convRow, msgRow, diaryRow, studyRow, itemRow,
    weekMsgRow, weekDiaryRow, weekStudyRows, weekMoodRow, recentStudy, emotionRows,
    diaryRows, weekItems,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM conversations WHERE uid=?').bind(uid).first(),
    env.DB.prepare(
      "SELECT COUNT(*) AS c, COUNT(DISTINCT date(created_at/1000, 'unixepoch', '+8 hours')) AS days FROM messages WHERE uid=?"
    ).bind(uid).first(),
    env.DB.prepare('SELECT COUNT(*) AS c, COUNT(DISTINCT day) AS days FROM diaries WHERE uid=?').bind(uid).first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM study_items WHERE uid=? AND kind LIKE 'session:%'").bind(uid).first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM study_items WHERE uid=? AND kind IN ('mistake','word')").bind(uid).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM messages WHERE uid=? AND created_at>=? AND created_at<?').bind(uid, selStart, selEnd).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM diaries WHERE uid=? AND created_at>=? AND created_at<?').bind(uid, selStart, selEnd).first(),
    env.DB.prepare(
      "SELECT kind, COUNT(*) AS c FROM study_items WHERE uid=? AND kind LIKE 'session:%' AND created_at>=? AND created_at<? GROUP BY kind ORDER BY c DESC"
    ).bind(uid, selStart, selEnd).all(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM message_emotion WHERE uid=? AND created_at>=? AND created_at<?').bind(uid, selStart, selEnd).first(),
    env.DB.prepare(
      "SELECT id, kind, title, note, created_at FROM study_items WHERE uid=? AND kind LIKE 'session:%' ORDER BY created_at DESC LIMIT 5"
    ).bind(uid).all(),
    env.DB.prepare(
      'SELECT emo, score, created_at FROM message_emotion WHERE uid=? AND created_at>=? ORDER BY created_at DESC LIMIT 20000'
    ).bind(uid, since).all(),
    env.DB.prepare(
      'SELECT day, content, mood, created_at FROM diaries WHERE uid=? AND created_at>=? AND created_at<? ORDER BY created_at'
    ).bind(uid, selStart, selEnd).all(),
    env.DB.prepare(
      "SELECT kind, title, content, note, created_at FROM study_items WHERE uid=? AND created_at>=? AND created_at<? AND kind IN ('mistake','word') ORDER BY created_at DESC LIMIT 40"
    ).bind(uid, selStart, selEnd).all(),
  ]);

  const weekBuckets = bucketRows(emotionRows.results || [], weekList, ts => String(startOfWeek(ts)));
  const monthBuckets = bucketRows(emotionRows.results || [], monthList, ts => String(startOfMonth(ts)));

  const studyModes = (weekStudyRows.results || []).map(r => ({
    mode: String(r.kind || '').replace(/^session:/, ''),
    count: Number(r.c) || 0,
  }));
  const weekStudyCount = studyModes.reduce((sum, x) => sum + x.count, 0);

  const weekMoods = (emotionRows.results || []).filter(r => {
    const ts = Number(r.created_at) || 0;
    return ts >= selStart && ts < selEnd;
  });
  const weekMoodSum = weekMoods.reduce((acc, r) => {
    const emo = String(r.emo || '');
    if (!Object.prototype.hasOwnProperty.call(VALENCE, emo)) return acc;
    const score = Math.max(0.1, Math.min(1, Number(r.score) || 0.5));
    acc.count[emo] = (acc.count[emo] || 0) + 1;
    acc.total += 1;
    acc.scoreSum += VALENCE[emo] * score;
    return acc;
  }, { count: {}, total: 0, scoreSum: 0 });
  const weekMood = summarize(weekMoodSum.count, weekMoodSum.total, weekMoodSum.scoreSum);

  // ---- AI：本周日记 / 本周学习 ----
  const diaries = (diaryRows.results || []).map(r => ({
    day: String(r.day || ''),
    mood: String(r.mood || ''),
    text: stripTags(r.content).slice(0, 900),
  })).filter(x => x.text);
  const studyItems = (weekItems.results || []).map(r => ({
    kind: String(r.kind || ''),
    title: String(r.title || '').slice(0, 60),
    note: stripTags(r.note || '').slice(0, 200),
  }));

  const cacheKey = `arch:${uid}:${selStart}`;
  // 先出页面、后出 AI：ai=0 只读缓存（不生成），ai=1 才真跑模型
  const withAI = url.searchParams.get('ai') !== '0';
  if (!withAI) {
    let hit = null;
    try {
      const raw = await env.MINXTOK_KV.get(cacheKey);
      if (raw) hit = JSON.parse(raw);
    } catch (_) {}
    if (hit && hit.diary !== undefined) {
      return json(buildPayload({ ai: hit, pending: false }), 200, cors);
    }
    return json(buildPayload({ ai: { diary: '', study: '', diaryMode: '' }, pending: true }), 200, cors);
  }
  const ai = await aiCache(env, cacheKey, async () => {
    const diaryText = diaries.slice(0, 7).map(d => `【${d.day}】${d.text}`).join('\n\n');
    const studyText = [
      studyItems.length ? `错题/生词：\n${studyItems.map(x => `- [${x.kind === 'word' ? '生词' : '错题'}] ${x.title}${x.note ? '：' + x.note : ''}`).join('\n')}` : '',
      studyModes.length ? `本周学习动作：${studyModes.map(m => `${MODE_ZH[m.mode] || '学习'} ${m.count} 次`).join('、')}` : '',
      weekMood.total ? `本周情绪标签 ${weekMood.total} 条，主调是「${weekMood.topLabel}」` : '',
    ].filter(Boolean).join('\n');

    let [diaryOut, studyOut] = await Promise.all([
      diaries.length
        ? askLLM(env, DIARY_SYS, `这是我这周的日记：\n\n${diaryText}`, 1500)
        : Promise.resolve(''),
      studyText
        ? askLLM(env, STUDY_SYS, studyText, 1500)
        : Promise.resolve(''),
    ]);

    // 超字数就请它重写一次，实在压不下来再截断
    if (studyOut.length > 125 && studyText) {
      const shorter = await askLLM(
        env,
        STUDY_SYS,
        `${studyText}\n\n上一次的总结写了 ${studyOut.length} 字，太长了。这次只讲最关键的一两点，压到 80 字以内。`,
        1200
      );
      if (shorter) studyOut = shorter;
    }

    return {
      diary: clampText(diaryOut, 170),
      diaryMode: diaries.length ? (/抒情|情绪|心情|难过|开心地|感慨/.test(diaryText) ? 'emotion' : 'narrative') : 'empty',
      study: clampText(studyOut, 125),
    };
  }, 21600);

  return json(buildPayload({ ai, pending: false }), 200, cors);

  function buildPayload({ ai: a, pending }) {
    const sm = a || { diary: '', study: '', diaryMode: '' };
    const diaryFallback = diaries.length
      ? `这周写了 ${diaries.length} 篇日记，共 ${diaries.reduce((s, d) => s + d.text.length, 0)} 字。`
      : '这周还没写日记，想写的时候再写就好。';
    const studyFallback = weekStudyCount || studyItems.length
      ? `本周学习 ${weekStudyCount} 次${studyItems.length ? `，收藏了 ${studyItems.length} 条错题与生词` : ''}。`
      : '这周还没有学习记录，挑一个薄弱点开始就不算晚。';
    return {
    pending: !!pending,
    diaryFallback,
    studyFallback,
    at: now,
    weekStart: selStart,
    weekRange: weekRangeLabel(selStart, selEnd),
    isNowWeek: selStart === weekStart,
    counts: {
      conversations: Number(convRow && convRow.c) || 0,
      messages: Number(msgRow && msgRow.c) || 0,
      messageDays: Number(msgRow && msgRow.days) || 0,
      diaries: Number(diaryRow && diaryRow.c) || 0,
      diaryDays: Number(diaryRow && diaryRow.days) || 0,
      studySessions: Number(studyRow && studyRow.c) || 0,
      studyItems: Number(itemRow && itemRow.c) || 0,
    },
    weekList,
    monthList: monthList.map(m => ({ start: m.start, end: m.end, label: m.label, isNow: m.isNow })),
    week: {
      messages: Number(weekMsgRow && weekMsgRow.c) || 0,
      diaries: Number(weekDiaryRow && weekDiaryRow.c) || 0,
      studySessions: weekStudyCount,
      studyItems: studyItems.length,
      moodTags: weekMood.total,
      studyModes,
    },
    moods: {
      weeks: weekBuckets.map(b => ({ start: b.start, label: b.label, total: b.total, index: b.index, topLabel: b.topLabel, emotions: b.emotions })),
      months: monthBuckets.map(b => ({ start: b.start, label: b.label, total: b.total, index: b.index, topLabel: b.topLabel, emotions: b.emotions })),
      week: weekMood,
      weekStart: selStart,
    },
    summary: {
      diary: sm.diary || '',
      diaryMode: sm.diaryMode || (diaries.length ? 'narrative' : 'empty'),
      diaryCount: diaries.length,
      study: sm.study || '',
      studyCount: weekStudyCount,
      studyItems: studyItems.length,
      pending: !sm.diary && !sm.study,
    },
    thisWeek: {
      messages: Number(weekMsgRow && weekMsgRow.c) || 0,
      diaries: Number(weekDiaryRow && weekDiaryRow.c) || 0,
      studySessions: weekStudyCount,
      studyModes,
      summary: '',
    },
    weeks: weekBuckets,
    months: monthBuckets,
    recentStudy: (recentStudy.results || []).map(r => ({
      id: r.id,
      mode: String(r.kind || '').replace(/^session:/, ''),
      title: r.title || '未命名对话',
      createdAt: r.created_at,
    })),
    };
  }
}
