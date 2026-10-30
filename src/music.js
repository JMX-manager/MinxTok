// 音乐标记解析：把 [MUSIC]||歌名|歌手| 转成可点击的 QQ 音乐卡片
// 非官方搜索接口，6 秒超时，失败自动降级到搜索页
const MARK = /[\[【]\s*MUSIC\s*[\]】]\s*\|\|\s*([^|\n]+?)\s*\|\s*([^|\n]*?)\s*\|/gi;
// 模型经常漏写结尾那根竖线，或者把标记写成 [MUSIC] 歌名 - 歌手，下面两套兜底正则专门救这种半截标记
const MARK_LOOSE = /[\[【]\s*MUSIC\s*[\]】]\s*\|{0,2}\s*([^|\n《》]{1,30}?)\s*[|｜]\s*([^|\n]*)/gi;
const MARK_DASH = /[\[【]\s*MUSIC\s*[\]】]\s*\|{0,2}\s*([^|\n]{1,30}?)\s*[-－—]\s*([^|\n]{1,24})/i;

function parseMarks(text) {
  const t = String(text || '');
  let ms = [...t.matchAll(MARK)];
  if (!ms.length) ms = [...t.matchAll(MARK_LOOSE)];
  if (!ms.length) {
    const one = t.match(MARK_DASH);
    ms = one ? [one] : [];
  }
  return ms;
}

// 回复里直接把歌名报出来了（《晴天》《起风了》），模型却忘了写标记 —— 拿它当歌名兜底
export function songFromReply(text) {
  const t = String(text || '');
  const m = t.match(/(?:给你放|放一首|放首|来听|听听|听一首|听首|点一首|点首|推荐|换成|换一首|换首)[^《「“"\n]{0,8}[《「“"]([^》」”"\n]{2,24})[》」”"]/);
  if (!m) return '';
  const song = m[1].trim();
  if (!song || isGenericTitle(song)) return '';
  return song;
}
const HOSTS = ['https://c.y.qq.com', 'https://u.y.qq.com'];
const TIMEOUT = 6000;

async function searchQQ(env, q) {
  const cacheKey = `qq:${q}`;
  if (env && env.MINXTOK_KV) {
    const hit = await env.MINXTOK_KV.get(cacheKey, 'json');
    if (hit && hit.songmid) return hit;
  }
  for (const host of HOSTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const url = `${host}/soso/fcgi-bin/client_search_cp?ct=24&aggr=1&cr=1&qqmusic=1&format=json&w=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' },
        signal: ctrl.signal,
      });
      const d = await res.json();
      const list = (d && d.data && d.data.song && d.data.song.list) || [];
      const it = list.find(x => x.songmid);
      if (it) {
        if (env && env.MINXTOK_KV) await env.MINXTOK_KV.put(cacheKey, JSON.stringify(it), { expirationTtl: 7 * 24 * 3600 });
        return it;
      }
    } catch (_) { /* 换下一个域名 */ }
    finally { clearTimeout(timer); }
  }
  // 兜底：QQ 音乐的 musicu 接口（POST，通常不受搜索接口的限制）
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const body = {
      req_0: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: { query: q, num_per_page: 1, page_num: 1 },
      },
    };
    const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 MinxTok',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const d = await res.json();
    const list = (((d.req_0 || {}).data || {}).body || {}).song || {};
    const it = (list.list || [])[0];
    if (it && it.mid) {
      const hit = { songmid: it.mid, songname: it.name || it.title, albummid: (it.album || {}).mid || '' };
      if (env && env.MINXTOK_KV) await env.MINXTOK_KV.put(cacheKey, JSON.stringify(hit), { expirationTtl: 7 * 24 * 3600 });
      return hit;
    }
  } catch (_) { /* 放弃 */ }
  return null;
}

// 单曲查询：给歌名（可空歌手）返回卡片
export async function lookupSong(env, song, artist = '') {
  const keyword = `${song} ${artist}`.trim();
  let url = '';
  let cover = '';
  let pending = true;
  let label = `🎵 去QQ音乐播放：${song}${artist ? ' - ' + artist : ''}`;
  const hit = await searchQQ(env, keyword);
  let finalTitle = song;
  let finalArtist = artist;
  if (hit && hit.songmid && titleMatches(song, hit.songname)) {
    url = `https://y.qq.com/n/ryqq/songDetail/${hit.songmid}`;
    if (hit.albummid) cover = `https://y.qq.com/music/photo_new/T002R300x300M000${hit.albummid}.jpg`;
    // 以接口返回为准，标题=歌名，副标题=歌手
    if (hit.songname) finalTitle = hit.songname;
    if (hit.singer && hit.singer[0] && hit.singer[0].name) finalArtist = hit.singer[0].name;
    label = `🎵 去QQ音乐播放：${finalTitle}${finalArtist ? ' - ' + finalArtist : ''}`;
  }
  if (!url) {
    // 搜不到具体曲目时不要给一张点了没反应的卡，直接落到 QQ 音乐搜索页
    url = `https://y.qq.com/n/ryqq/search?searchKey=${encodeURIComponent(keyword)}`;
    pending = false;
    label = `🎵 在QQ音乐搜索：${finalTitle}${finalArtist ? ' - ' + finalArtist : ''}`;
  }
  return {
    type: 'music', title: finalTitle, artist: finalArtist, cover, url, platform: 'QQ音乐',
    duration: Number(hit && hit.interval) || 0, label, pending,
  };
}

// 判断是不是“英文歌/情歌/慢歌”这类描述，不是具体歌名
export function isGenericTitle(song) {
  const s = String(song || '').trim();
  if (!s) return true;
  if (/^(?:点|来点|放点|听点)?(?:dj|edm|电音|电子|舞曲|打碟)$/i.test(s)) return true;
  if (/(英文歌|中文歌|日文歌|日语歌|韩文歌|韩语歌|粤语歌|老歌|新歌|慢歌|快歌|情歌|儿歌|民歌|摇滚|爵士|民谣|电子|纯音乐|轻音乐|背景音乐|好听的歌|安静的歌|欢快的歌|治愈的歌|随便|都行|一首歌)$/.test(s)) return true;
  if (/^.{0,4}歌$/.test(s) && /(听|首|点|情|老|新|慢|快|英文|中文|粤语|日文|韩语)/.test(s)) return true;
  return false;
}

// 让模型推荐一首歌，返回 {song, artist}
export async function recommendSong(env, hint = '') {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '只输出一行：歌名|歌手。必须是真实存在的歌曲，不要输出“英文歌”“情歌”这类描述。不要解释、不要编号、不要书名号。' },
          { role: 'user', content: hint ? `用户说：${hint}\n按这个需求推荐一首具体的歌。` : '推荐一首当下适合听的歌。' },
        ],
        temperature: 0.9,
        max_tokens: 40,
      }),
    });
    const d = await res.json();
    const line = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const [song, artist] = line.replace(/[《》"']/g, '').split('|').map(s => s.trim());
    if (!song || isGenericTitle(song)) return null;
    return { song, artist: artist || '' };
  } catch (_) {
    return null;
  }
}

// 助手回复里出现这些说法，说明它在给歌，即使没吐标记
export function replySuggestsMusic(text) {
  const t = String(text || '');
  return /(这首|这一首|换一首|再换一首|给你放|听这首|放这首|推荐这首|更柔|更安静|更轻|轻一点|慢一点|温柔一点|这首更)/.test(t);
}


// 歌名相似度：容忍《晴天》vs《晴天 (Live)》，不容忍完全不相干
function normalizeTitle(x) {
  return String(x || '')
    .toLowerCase()
    .replace(/[《》「」“”"'`]/g, '')
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, '')
    .replace(/[\s\-_.·、,，!！?？~～]+/g, '');
}
export function titleMatches(want, got) {
  const a = normalizeTitle(want);
  const b = normalizeTitle(got);
  if (!a || !b) return false;
  if (a === b) return true;
  // 英文歌名大小写/空格差异，或一方包含另一方（Live、Remix 版本）
  return b.includes(a) || a.includes(b);
}

// 正文末尾如果模型又单独留了一行歌名/歌手，出卡后把它去掉，避免重复。
export function stripMusicTail(text, cards) {
  let out = String(text || '');
  if (!cards || !cards.length) return out;
  const escRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const c of cards) {
    if (!c || !c.title) continue;
    const title = escRe(c.title);
    const artist = c.artist ? escRe(c.artist) : '';
    const tail = artist
      ? `(?:\\s*[-—–]\\s*${artist})?`
      : '';
    out = out.replace(new RegExp(`\\n+\\s*《?${title}》?${tail}\\s*[。.!！?？]?\\s*$`, 'i'), '');
  }
  out = out.replace(/\n+\s*《[^》\n]{1,40}》\s*$/, '');
  return out.trim();
}

// 用户是否在表达听歌意图
export function musicIntent(text) {
  const t = String(text || '');
  // 直接要歌、换歌、放歌、推荐歌，都算听歌意图
  if (/(听歌|想听|要听|放首歌|放点歌|来首歌|来点音乐|听点|换一首|换首|再来一首|再放一首|再换一首|推荐.{0,6}歌|有没有.{0,6}歌|点歌|整首|music|song)/i.test(t)) return true;
  // “来点 DJ”“更电音的”这类说法很容易被当成歌名，先把意图认出来
  if (/(来点|放点|听点|点些|来些|整点).{0,6}(dj|电音|电子|舞曲|edm|打碟)/i.test(t)) return true;
  if (/(更|再).{0,4}(dj|电音|电子|舞曲|edm|嗨|燃|柔|安静|轻|慢|快)/i.test(t)) return true;
  if (/(dj|电音|电子|舞曲|edm|打碟)/i.test(t) && /(来|放|听|换|点|要|想|整)/.test(t)) return true;
  // “来首什么”“放首啥”这类省略说法
  if (/(来首|放首|换首|听首)/.test(t)) return true;
  return false;
}

// 从用户话里猜歌名（猜不到就返回空）
export function guessSong(text) {
  const t = String(text || '');
  // 类型/风格词不是歌名，避免把“来点 DJ”解析成《点DJ》。
  if (pickedGenre(t)) return '';
  if (/(?:点|来点|放点|听点)(?:音乐|歌|dj|电音|电子|舞曲)$/i.test(t)) return '';
  const m = t.match(/(?:想听|听听|听一首|听首|听|放一首|放首|放|来一首|来首|来)\s*[《"“']?([^《》"”'，。！？\s]{1,24})/);
  if (!m) return '';
  const song = m[1].replace(/[的了呢吧啊呀]$/, '').trim();
  // 泛称不算歌名，避免把“听歌”解析成一首叫《歌》的曲子
  const GENERIC = /^(歌|歌曲|音乐|听歌|点歌|一首|首|什么|啥|哪个|随便|都行|你来|你挑|你选|推荐|点的|点)$/;
  if (GENERIC.test(song) || song.length < 2) return '';
  return song;
}


// 音乐类型/风格/语种/心情关键词：这些不是歌名
const GENRE_WORDS = [
  '摇滚', '流行', '民谣', '说唱', '嘻哈', 'rap', '电音', '电子', '爵士', '蓝调', '古典',
  'dj', 'edm', '舞曲', '打碟', '电子舞曲', '电音舞曲', 'house', 'techno', 'trance', 'dubstep',
  '轻音乐', '纯音乐', '钢琴', '吉他', '古风', '国风', '二次元', '动漫', 'acg', '治愈', '舒缓',
  '抒情', '伤感情歌', '情歌', '安静', '热闹', '轻快', '燃', '嗨', '热血', '温柔', '慢歌', '快歌',
  '老歌', '经典', '怀旧', '粤语', '日语', '英语', '英文', 'kpop', '韩流', 'jpop', '乡村', '乡村音乐',
  '民乐', '戏曲', '儿歌', '睡眠', '助眠', '写作业', '学习', '开车', '跑步', '健身', '下雨天', '夜晚',
  '华语', '港台', '欧美', '方言', '摇滚乐', '重金属', '后摇', '蒸汽波', 'lo-fi', 'lofi', 'chill',
];

// 类型推荐被模型重复时用的兜底池；都是 QQ 音乐能搜到的真实曲目。
const GENRE_FALLBACK = {
  dj: [
    { song: 'Wake Me Up', artist: 'Avicii' },
    { song: 'Faded', artist: 'Alan Walker' },
    { song: 'Closer', artist: 'The Chainsmokers' },
    { song: 'Titanium', artist: 'David Guetta' },
    { song: 'Animals', artist: 'Martin Garrix' },
  ],
  电音: [
    { song: 'Faded', artist: 'Alan Walker' },
    { song: 'Wake Me Up', artist: 'Avicii' },
    { song: 'Levels', artist: 'Avicii' },
    { song: 'Strobe', artist: 'deadmau5' },
    { song: 'Titanium', artist: 'David Guetta' },
  ],
  电子: [
    { song: 'Closer', artist: 'The Chainsmokers' },
    { song: 'Faded', artist: 'Alan Walker' },
    { song: 'Animals', artist: 'Martin Garrix' },
    { song: 'Silence', artist: 'Marshmello' },
  ],
  edm: [
    { song: 'Levels', artist: 'Avicii' },
    { song: 'Animals', artist: 'Martin Garrix' },
    { song: 'Titanium', artist: 'David Guetta' },
  ],
  舞曲: [
    { song: 'Closer', artist: 'The Chainsmokers' },
    { song: 'Wake Me Up', artist: 'Avicii' },
    { song: 'Faded', artist: 'Alan Walker' },
  ],
};

export function genreFallback(genre, recent = []) {
  const key = String(genre || '').toLowerCase();
  const list = GENRE_FALLBACK[key] || (/电音|电子|dj|edm|舞曲/i.test(key) ? GENRE_FALLBACK.dj : null);
  if (!list) return null;
  const hit = list.find(x => !recent.some(r => titleMatches(r.title, x.song)));
  return hit || list[0];
}

// 用户这句话是不是在点“类型/风格”而不是具体歌名
export function pickedGenre(text) {
  const t = String(text || '');
  const low = t.toLowerCase();
  const hit = GENRE_WORDS.find(g => low.includes(g.toLowerCase()));
  if (!hit) return '';
  // 只有带“来/放/换/听/点/要/想/更/再”的句子才是点风格，不是单纯描述。
  return /(来|放|换|听|点|要|想|整|更|再)/.test(t) ? hit : '';
}

// 用户原话里有没有出现“歌手名”特征（唱/的/演唱）
export function pickedArtistHint(text) {
  const t = String(text || '');
  const m = t.match(/([一-龥A-Za-z0-9·\-\.]{1,16})(?:唱的|演唱的|的歌|的)/);
  return m ? m[1].trim() : '';
}

// 按类型推荐一首（让模型挑真实的歌，再用 QQ 音乐校验）
export async function recommendByGenre(env, genre, hint = '') {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '只输出一行：歌名|歌手。必须是真实存在、能在QQ音乐搜到的歌。不要书名号、不要解释、不要编造。' },
          { role: 'user', content: `推荐一首${genre}类型的经典歌曲。${hint ? '用户补充：' + hint : ''}` },
        ],
        temperature: 0.85,
        max_tokens: 40,
      }),
    });
    const d = await res.json();
    const line = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const [song, artist] = line.replace(/[《》"']/g, '').split('|').map(x => x.trim());
    if (!song || isGenericTitle(song)) return null;
    return { song, artist: artist || '' };
  } catch (_) {
    return null;
  }
}

// 给用户听歌时的回复话题：三种不同场景，回复要跟着变
export const MUSIC_REPLY_STYLES = {
  named: '用户点名要听一首具体的歌。回复必须是“好嘞，来听《歌名》”这个意思的口吻，自然一点，可以在前后加一句贴合歌的短句。',
  genre: '用户只说类型没说歌名。回复必须是“好的，来一首<类型>的”这个意思的口吻，不要出现具体歌名。',
  follow: '用户没说类型也没说歌名，是让你随便放（比如“想听点歌”“来首”）。回复要像“行，给你放一首<风格>的，先听着”，可以点一下为什么挑这首。',
  again: '用户要换一首。回复要像“这首换掉，来听《歌名》”，顺口说一句区别（更慢/更轻/更燃）。',
};

// 解析整段文本，返回清理后的文本 + 音乐卡片数组
export async function resolveMusic(env, text) {
  const matches = parseMarks(text);
  if (!matches.length) return { text: text || '', cards: [] };

  const cards = [];
  for (const m of matches) {
    const song = m[1].trim();
    const artist = m[2].trim();
    if (!song || isGenericTitle(song)) continue;
    const keyword = `${song} ${artist}`;

    let url = '';
    let cover = '';
    let pending = true;
    let label = `🎵 去QQ音乐播放：${song} - ${artist}`;

    const hit = await searchQQ(env, keyword);
    // 严格校验：搜不到就算失败，不拿一首不相干的歌凑数
    if (hit && hit.songmid && titleMatches(song, hit.songname)) {
      url = `https://y.qq.com/n/ryqq/songDetail/${hit.songmid}`;
      // 官方图床：专辑 mid → 300x300 封面
      if (hit.albummid) cover = `https://y.qq.com/music/photo_new/T002R300x300M000${hit.albummid}.jpg`;
      label = `🎵 去QQ音乐播放：${song} - ${artist}`;
    }

    if (isGenericTitle(song)) continue;
    // 没搜到就不出卡，宁可没有也不能放错歌
    if (!url) continue;

    cards.push({
      type: 'music',
      title: song,
      artist,
      cover,
      url,
      platform: 'QQ音乐',
      duration: Number(hit && hit.interval) || 0,
      label, pending,
    });
  }

  let cleaned = String(text || '').replace(MARK, '').replace(/\n{3,}/g, '\n\n').trim();
  // 模型有时会把“来点DJ”直接写成《点DJ》，这不是歌名，正文里也清掉。
  cleaned = cleaned.replace(/《([^》\n]{1,20})》/g, (all, name) => (
    isGenericTitle(String(name || '').trim()) ? '' : all
  )).replace(/\n{3,}/g, '\n\n').trim();
  if (cards.length) cleaned = stripMusicTail(cleaned, cards);
  return { text: cleaned, cards };
}
