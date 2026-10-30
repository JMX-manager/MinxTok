// MinxTok 前端入口：会话、SSE、状态轮询、块事件分发
import { initTheme, setMode, getMode } from './theme.js?v=104';
import { applyI18n, toggleLang, t, getLang, setTrText, trText } from './i18n.js?v=118';
import { initUi, openDrawer, closeDrawer, openModal, closeModal, openPage, pageLoading, fillPage, setPageTitle, closePage, openSheet, closeSheet, toast, setVeil, helpHtml, openNotice, bindNotice } from './ui.js?v=151';
import { renderMessage, renderBlock, buildWho, thinking, setThinkingLabel, skeletonCard, setQuoteHandler, setDeleteHandler, playFollowIn, appleEmojiHtml, renderMarkdown, markGiftClaimed } from './blocks.js?v=172';
import { setDrawModule } from './blocks.js?v=172';
import { renderDraw, splitDraw } from './draw.js?v=48';
if (typeof setDrawModule === 'function') setDrawModule({ renderDraw, splitDraw });
import { haptic, isHapticsOn, setHaptics } from './haptics.js?v=12';
import { openStudy } from './study.js?v=112';
import { openGames } from './games.js?v=94';
import { openAssistant, syncAssistantIdentity, assistantName } from './assistant.js?v=25';
import { openArchive } from './archive.js?v=20';
import { startOnboarding, maybeStartOnboarding, openOnboardingFromSettings } from './onboarding.js?v=27';
import { state } from './state.js?v=12';
export { state };

const $ = (id) => document.getElementById(id);
const chat = $('chat');

// 微信内置 WebView（X5）合成磨砂极慢：滚动时整层 backdrop-filter 每帧重采样，帧率直接塌。
// 这里打个标记，CSS 侧在微信里退成高不透明度同色系底，静止观感接近，滚动不再重采样。
if (/MicroMessenger/i.test(navigator.userAgent)) document.body.classList.add('wx');

/* ---------- 待发送图片：先确认、识别，再和文字一起发 ---------- */
const pendingImage = {
  data: '',
  desc: '',
  engine: '',
  status: 'idle', // idle | reading | recognizing | ready | ocr | failed
  progress: '',
  seq: 0,
  task: null,
};

function pendingNodes() {
  return {
    box: $('composerPending'),
    thumb: $('pendingThumb'),
    img: $('pendingThumb') && $('pendingThumb').querySelector('img'),
    status: $('pendingStatus'),
    del: $('pendingDelete'),
    cam: $('btnChatImage'),
  };
}

function renderPending() {
  const el = pendingNodes();
  if (!el.box) return;
  const has = !!pendingImage.data;
  el.box.hidden = !has;
  if (el.img) el.img.src = has ? pendingImage.data : '';
  let text = '图片处理中…';
  let cls = '';
  if (pendingImage.status === 'recognizing') text = pendingImage.progress || '正在识别…';
  else if (pendingImage.status === 'ready') text = '已识别，可输入文字一起发送';
  else if (pendingImage.status === 'ocr') { text = '已识别文字，可继续发送'; cls = ''; }
  else if (pendingImage.status === 'failed') { text = '识别失败，可直接发送'; cls = 'warn'; }
  else if (pendingImage.status === 'idle' && has) text = '待发送';
  if (el.status) {
    el.status.textContent = text;
    el.status.className = 'cp-status ' + cls;
  }
  if (el.cam) {
    el.cam.classList.toggle('recognizing', pendingImage.status === 'recognizing');
    el.cam.classList.toggle('ready', pendingImage.status === 'ready' || pendingImage.status === 'ocr');
    el.cam.classList.toggle('failed', pendingImage.status === 'failed');
    el.cam.setAttribute('aria-label', has ? '查看待发送图片' : '发送图片');
  }
}

function resetPending() {
  pendingImage.seq += 1;
  pendingImage.data = '';
  pendingImage.desc = '';
  pendingImage.engine = '';
  pendingImage.status = 'idle';
  pendingImage.progress = '';
  pendingImage.task = null;
  renderPending();
}

async function describeImageOnce(data) {
  const r = await fetch('/api/image/describe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (localStorage.getItem('minxtok.token') || ''),
    },
    body: JSON.stringify({ image: data }),
  });
  const d = await r.json().catch(() => ({}));
  return {
    text: typeof d.text === 'string' ? d.text : '',
    engine: d.engine || '',
  };
}

async function describeImageSmart(data, seq) {
  let img;
  try { img = await loadDiaryImage(data); } catch (_) { return describeImageOnce(data); }
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  // 长截图整体喂给视觉模型会糊/失败，按高度切片，每片保留原宽度
  if (w <= 2200 && h <= 2200) {
    let d = await describeImageOnce(data);
    if (!d.text) d = await describeImageOnce(data);
    return d;
  }
  const tileH = 1800;
  const overlap = 90;
  const tiles = [];
  for (let y = 0; y < h; y += tileH - overlap) {
    const th = Math.min(tileH, h - y);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = th;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, th);
    ctx.drawImage(img, 0, y, w, th, 0, 0, w, th);
    tiles.push(c.toDataURL('image/jpeg', 0.9));
    if (y + th >= h) break;
  }
  const parts = [];
  let engine = 'vision';
  for (let i = 0; i < tiles.length; i++) {
    if (seq !== pendingImage.seq) return { text: '', engine: '' };
    pendingImage.progress = `正在识别长图 ${i + 1}/${tiles.length}…`;
    renderPending();
    let d = await describeImageOnce(tiles[i]);
    if (!d.text) d = await describeImageOnce(tiles[i]);
    if (d.engine === 'ocr') engine = 'ocr';
    if (!d.engine) engine = '';
    if (d.text) parts.push(`第${i + 1}/${tiles.length}段：${d.text}`);
  }
  return { text: parts.join('\n'), engine: parts.length ? engine : '' };
}

async function recognizePending(data) {
  const seq = ++pendingImage.seq;
  pendingImage.status = 'recognizing';
  pendingImage.progress = '';
  renderPending();
  const task = (async () => {
    try {
      const d = await describeImageSmart(data, seq);
      if (seq !== pendingImage.seq) return;
      pendingImage.desc = typeof d.text === 'string' ? d.text : '';
      pendingImage.engine = d.engine || '';
      pendingImage.status = pendingImage.desc
        ? (pendingImage.engine === 'ocr' ? 'ocr' : 'ready')
        : 'failed';
    } catch (_) {
      if (seq === pendingImage.seq) pendingImage.status = 'failed';
    }
    pendingImage.progress = '';
    if (seq === pendingImage.seq) renderPending();
  })();
  pendingImage.task = task;
  await task;
}

function setPendingImage(data) {
  pendingImage.seq += 1;
  pendingImage.data = data;
  pendingImage.desc = '';
  pendingImage.engine = '';
  pendingImage.status = 'idle';
  pendingImage.task = null;
  renderPending();
}

async function sendComposer() {
  if (state.sending) return;
  const input = $('input');
  const text = input.value.trim();
  if (!text && !pendingImage.data) return;
  const extra = {};
  if (pendingImage.data) {
    // 识别还在跑也可以发：先把图丢进消息流，后端会自己补视觉描述。
    // 以前这里死等识别任务、最长卡 20 秒，用户会以为发送坏了。
    extra.image = pendingImage.data;
    if (pendingImage.desc) {
      extra.imageDesc = pendingImage.desc;
      extra.imageEngine = pendingImage.engine || undefined;
    }
  }
  input.value = '';
  input.style.height = 'auto';
  if (extra.image) resetPending();
  // 发送链路独立收口：任何异常都只提示一次，不冒泡成“脚本出错”
  Promise.resolve(sendMessage(text, extra)).catch((e) => {
    console.error(e);
    errToast(t('toast.error'));
  });
}

// 登录态就绪闸门：页面刚打开时 state.uid 还是游客 uid，
// 这时发消息会被后端按 uid 不一致拒绝，导致消息不入库、刷新后像“历史丢了”。
let authReadyResolve = null;
const authReady = new Promise((resolve) => { authReadyResolve = resolve; });

import { store } from './store.js?v=12';

// 统一触感：常用按钮按下时给一次轻反馈，设置里可整体关闭
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .m-press, .switch, .seg button');
  if (el && !el.disabled) haptic(6);
}, { passive: true });



// 任何未捕获错误都提示出来，避免“点了没反应”无从排查
// v0.9.5：同一条错误 8 秒内只提示一次，避免流式渲染出错时刷屏
let lastErrToastAt = 0;
let lastErrToastMsg = '';
function errToast(msg) {
  const now = Date.now();
  if (msg === lastErrToastMsg && now - lastErrToastAt < 8000) return;
  lastErrToastMsg = msg;
  lastErrToastAt = now;
  if (typeof toast === 'function') toast(msg);
}
window.addEventListener('error', (e) => {
  // 捕获阶段也会收到 img/css 等资源加载失败，这些不是脚本错误。
  // 之前发图时图片解码失败就会弹一条“脚本出错：unknown”。
  if (e.target && e.target !== window && e.target.tagName) return;
  const msg = e.message || (e.error && e.error.message) || '';
  if (!msg) return;
  // 跨域脚本报错只有一句 Script error.，拿不到细节，也不该打扰用户
  if (msg === 'Script error.' || msg === 'Script error') return;
  const info = {
    msg,
    src: e.filename || '',
    line: e.lineno || 0,
    col: e.colno || 0,
    stack: (e.error && e.error.stack || '').slice(0, 600),
  };
  console.error('boot error', info);
  try { fetch('/api/log/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info) }); } catch (_) {}
  errToast('脚本出错：' + info.msg);
}, true);
window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandled', e.reason);
  errToast('请求出错：' + (e.reason && e.reason.message || e.reason));
});

/* ---------- 发送 ---------- */
function likelyNeedsWeb(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 300) return false;
  return /(最新|最近|今天|昨天|现在|目前|今年|实时|新闻|热搜|价格|多少钱|股价|汇率|天气|比分|赛程|发布会|上映|票房|新款|发布了|openai|deepseek|iphone|安卓|ios)/i.test(s);
}

/* ---------- 图片查看器：双指缩放 / 拖动 / 返回 ---------- */
function initImageViewer() {
  if (window.__minxImgViewer) return;
  window.__minxImgViewer = true;

  let ov = null;
  let pic = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let startDist = 0;
  let startScale = 1;
  let startTx = 0;
  let startTy = 0;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let originEl = null;
  const pointers = new Map();

  const apply = () => {
    if (pic) pic.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  };

  const reset = () => {
    scale = 1;
    tx = 0;
    ty = 0;
    moved = false;
    if (pic) pic.style.transform = '';
  };

  const close = () => {
    if (!ov) return;
    const from = pic ? pic.getBoundingClientRect() : null;
    const to = originEl && originEl.isConnected ? originEl.getBoundingClientRect() : null;
    if (pic && from && to) {
      const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      const s = Math.max(0.08, to.width / Math.max(1, from.width));
      pic.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.35 },
      ], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    }
    ov.classList.remove('open');
    document.body.classList.remove('viewer-open');
    setTimeout(() => {
      if (ov && !ov.classList.contains('open')) {
        ov.remove();
        ov = null;
        pic = null;
      }
    }, 210);
  };

  const build = () => {
    ov = document.createElement('div');
    ov.className = 'img-viewer';
    ov.innerHTML = `
      <button class="iv-back" type="button" aria-label="返回">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg>
      </button>
      <img alt="">
      <div class="iv-hint">双指缩放 · 拖动查看</div>`;
    document.body.appendChild(ov);
    pic = ov.querySelector('img');
    ov.querySelector('.iv-back').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    ov.addEventListener('wheel', (e) => {
      e.preventDefault();
      const next = Math.max(1, Math.min(6, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      scale = next;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });

    pic.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      moved = false;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pic.setPointerCapture && pic.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        startX = e.clientX - tx;
        startY = e.clientY - ty;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        startScale = scale;
        startTx = tx;
        startTy = ty;
      }
    });

    pic.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const next = startScale * dist / startDist;
        if (next <= 1.03) {
          scale = 1;
          tx = 0;
          ty = 0;
        } else {
          scale = Math.min(6, next);
          tx = startTx;
          ty = startTy;
        }
      } else if (pointers.size === 1 && scale > 1) {
        tx = e.clientX - startX;
        ty = e.clientY - startY;
      }
      apply();
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        startX = p.x - tx;
        startY = p.y - ty;
      }
      if (!pointers.size && scale <= 1.01) reset();
    };
    pic.addEventListener('pointerup', end);
    pic.addEventListener('pointercancel', end);
    pic.addEventListener('dblclick', () => {
      scale = scale > 1.2 ? 1 : 2.2;
      tx = 0;
      ty = 0;
      apply();
    });
  };

  const open = (src, origin) => {
    if (!ov) build();
    originEl = origin || null;
    pic.src = src;
    reset();
    document.body.classList.add('viewer-open');
    const play = () => {
      if (!ov) return;
      ov.classList.add('open');
      const from = originEl && originEl.isConnected ? originEl.getBoundingClientRect() : null;
      const to = pic.getBoundingClientRect();
      if (!from || !to.width) return;
      const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
      const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
      const s = Math.max(0.08, from.width / Math.max(1, to.width));
      pic.animate([
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.25 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
      ], { duration: 430, easing: 'cubic-bezier(.22,1,.36,1)' });
    };
    // 图没解码完时 rect 是 0，动画会直接被 return 掉，看起来就是“啪”一下出现
    const kick = () => requestAnimationFrame(play);
    if (pic.decode) pic.decode().then(kick).catch(kick);
    else setTimeout(kick, 40);
  };
  window.__minxOpenImage = open;

  document.addEventListener('click', (e) => {
    const img = e.target.closest('img.msg-image, img.card');
    if (!img || img.closest('.img-viewer')) return;
    if (!img.src) return;
    e.preventDefault();
    open(img.src, img);
  });
}

/* ---------- 定位：天气要用真实经纬度，别再写死抚顺 ---------- */
function readGeo() {
  try { return JSON.parse(localStorage.getItem('minxtok.geo') || 'null'); } catch (_) { return null; }
}
let geoTask = null;
function ensureGeo(maxAge = 12 * 3600 * 1000) {
  const cur = readGeo();
  if (cur && cur.lat && cur.lon && Date.now() - (cur.at || 0) < maxAge) return Promise.resolve(cur);
  if (geoTask) return geoTask;
  if (!navigator.geolocation) return Promise.resolve(cur);
  geoTask = new Promise((resolve) => {
    let done = false;
    const finish = (g) => { if (done) return; done = true; geoTask = null; resolve(g || cur || null); };
    // 授权弹窗可能一直不点，最多等 6 秒就先用旧值
    setTimeout(() => finish(cur), 6000);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const g = {
            lat: Number(pos.coords.latitude.toFixed(4)),
            lon: Number(pos.coords.longitude.toFixed(4)),
            at: Date.now(),
          };
          try { localStorage.setItem('minxtok.geo', JSON.stringify(g)); } catch (_) {}
          finish(g);
        },
        () => finish(cur),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 10 * 60 * 1000 }
      );
    } catch (_) { finish(cur); }
  });
  return geoTask;
}

async function sendMessage(text, extra = {}) {
  if (state.sending || (!text.trim() && !extra.image && !extra.audio)) return;
  if (state.paused) { toast(t('toast.paused')); return; }

  const token = localStorage.getItem('minxtok.token');
  if (!token) { showAuth(); return; }
  if (!state.authed) {
    await Promise.race([authReady, new Promise((resolve) => setTimeout(resolve, 6000))]);
    if (!state.authed) { showAuth(); toast(t('toast.error')); return; }
  }

  // 额度不在这里动：服务端收到请求立刻扣，回来后统一刷新，避免本地预扣又被轮询改回去
  // 上一条消息上的「搜索 N 篇资料」「图片理解中」留到这条新消息才退场
  chat.querySelectorAll('.msg .web-note:not(.leaving), .msg .img-note:not(.leaving)').forEach((n) => {
    n.classList.add('leaving');
    setTimeout(() => n.remove(), 340);
  });
  state.sending = true;
  $('btnSend').classList.add('stop');
  $('btnSend').disabled = false; // 停止键要能点

  const localBlocks = [];
  if (state.quote) localBlocks.push({ type: 'quote', text: state.quote.text });
  // 引用只服务这一条消息：点发送后立刻清掉输入框上方的引用条，
  // 否则下一条还会带着旧引用发出去。
  if (state.quote) {
    state.quote = null;
    clearQuoteChip(true);
  }
  if (extra.image) localBlocks.push({ type: 'image', url: extra.image });
  if (extra.audio) localBlocks.push({ type: 'audio', url: extra.audio, duration: extra.audioDuration || 1 });
  if (text) localBlocks.push({ type: 'text', text });
  const userEl = renderMessage({ id: 'local_' + Date.now(), role: 'user', blocks: localBlocks });
  chat.appendChild(userEl);
  const localPic = userEl.querySelector('img.msg-image');
  if (localPic) {
    localPic.addEventListener('load', () => scrollBottom(), { once: true });
    if (localPic.complete) setTimeout(scrollBottom, 30);
  }
  // 追问/引用点击后，气泡从那条胶囊的位置飞进聊天区（帧变化）
  if (extra.fromEl && extra.fromEl.getBoundingClientRect) {
    flipInto(userEl, extra.fromEl);
  }
  pinBottom();

  const holder = document.createElement('div');
  holder.className = 'msg assistant m-fade-up';
  // 统一走 buildWho，实时消息也带全「虾虾·时间·引用·删除」四项
  holder.appendChild(buildWho({ id: 'live_' + Date.now(), blocks: [{ type: 'text', text: '' }], createdAt: Date.now() }));
  const body = document.createElement('div');
  body.className = 'body';
  // 服务端在建立 SSE 前就完成检索，meta 来得偏晚。
  // 先按问题类型挂一条“正在搜索中…”，meta/block 到达后再换成真实数量。
  const wantsWeb = !!text && likelyNeedsWeb(text);
  // 「正在搜索中…」那条独立灰行已经撤掉：搜了多少关键词、查了多少篇资料统一写进三个点前面那句（明轩 2026-10-29）
  // 图片理解也搬进三个点那句（stageLabel 的 image 分支），不再单挂一条灰字
  // ── 三个点上方那句「AI 概括」 ────────────────────────────────
  // 明轩 2026-10-29：不许照搬问句（问「氯水为什么要现用现配」就显示「正在理解氯水为什么现用现配」太傻），
  // 要的是「查找现有知识库」「分析氯水的性质」这种抽象动作短语。所以这里只按意图挑固定短语，不回显原话。
  // 具体领域排在通用意图前面：歌名、新闻、视频、识图这些不能被「查/搜/讲讲」抢走
  const STAGE_INTENT = [
    [/歌词|这首歌|放.{0,3}歌|来首|点歌|歌单|音乐|听歌|歌曲|什么歌/, 'music'],
    [/新闻|头条|资讯|热点|时政|最近发生|大事/, 'news'],
    [/视频|短片|影视|剪辑/, 'video'],
    [/识图|图片|截图|照片|提取文字|转成文字|OCR/i, 'ocr'],
    [/翻译|译成|译一下|英文怎么说|日语|英语怎么说/, 'translate'],
    [/定位|位置|附近|导航|多远|怎么走|路线|几公里|坐标/, 'geo'],
    [/总结|小结|归纳|概括/, 'sum'],
    [/整理|梳理|列(?:出|一下)?/, 'sort'],
    [/查|搜|资料|最新|天气|气温|预报|几点|谁|哪|多少钱|价格|政策|消息/, 'look'],
    [/为什么|为啥|原理|原因|过程|如何|解释|理解|区别|关系|性质|成分|方程式|反应|概念|定义|平衡力|受力|压强|浮力|判断|是不是|对不对|吗[？?]?$/, 'why'],
    [/算|计算|求解|解方程|解不等式|得几|多少|几倍|比例/, 'calc'],
    [/计划|规划|安排|行程|去哪|几天/, 'plan'],
    [/写|作文|文案|代码|生成|起草|改一下/, 'draft'],
    [/讲讲|说说|聊聊|谈谈|介绍|是什么|什么是/, 'explain'],
  ];
  // 每个意图一小组同义短语，轮换着用。宁可说「在做什么事」，别说「列式计算」
  // 这种空壳——明轩 2026-10-29 点名要更丰富、更贴题。
  const STAGE_PHRASE = {
    music:   ['正在搜索热门歌曲', '调用QQ音乐歌曲数据库', '匹配这首歌的信息'],
    news:    ['浏览实时新闻资讯', '核对新闻来源', '汇总最新消息'],
    video:   ['浏览相关视频', '解析视频内容', '读取视频信息'],
    ocr:     ['调用OCR提取文字', '核对识别出的文字', '整理图片里的内容'],
    translate: ['翻译中', '逐句对照原文', '校对译文的语气'],
    geo:     ['解析位置信息', '核对地点坐标', '查看周边情况'],
    sum:     ['归纳全部内容', '合并重复要点', '提炼出结论'],
    sort:    ['整理全部内容并回复', '按顺序归类', '理清层次'],
    look:    ['检索相关资料', '比对已有信息', '查找现有知识库'],
    why:     ['理解这个概念', '梳理两者之间的关系', '拆开条件看原理', '判断条件是否成立'],
    calc:    ['逐步化简', '列式计算', '验算结果'],
    plan:    ['排出先后顺序', '规划每一步', '安排时间线'],
    draft:   ['组织措辞', '起草一版', '调整语句'],
    explain: ['理清概念脉络', '把定义对齐', '理一遍来龙去脉'],
    base:    ['正在理清思路', '想想怎么答', '整理一下再答'],
  };
  const STAGE_EN = {
    music:   ['Searching for the song', 'Querying the music library'],
    news:    ['Browsing live news', 'Checking the sources'],
    video:   ['Browsing related videos', 'Reading the video'],
    ocr:     ['Running OCR on the image', 'Checking the extracted text'],
    translate: ['Translating', 'Comparing line by line'],
    geo:     ['Resolving the location', 'Checking the area'],
    sum:     ['Pulling the key points', 'Merging related facts'],
    sort:    ['Sorting everything out', 'Grouping by topic'],
    look:    ['Checking the knowledge base', 'Looking things up'],
    why:     ['Getting the concept straight', 'Tracing how the two relate'],
    calc:    ['Working the numbers', 'Checking the result'],
    plan:    ['Laying out the steps', 'Planning the way'],
    draft:   ['Drafting the wording', 'Shaping the sentences'],
    explain: ['Lining up the concepts', 'Tracing how it works'],
    base:    ['Making sense of the question', 'Working out an answer'],
  };
  let stagePick = 0;
  function stageKind(question) {
    const q = String(question || '');
    for (const [re, kind] of STAGE_INTENT) if (re.test(q)) return kind;
    return 'base';
  }
  function stageLabel(question, stage, count, terms) {
    const zh = getLang() !== 'en';
    // 三点后面本来就是省略号，句子尾部一律不再补「…」（明轩 2026-10-29 要求）
    if (stage === 'web') return zh ? '调用网页搜索工具' : 'Searching the web';
    if (stage === 'read') {
      const n = Number(count) || 0;
      const t = Number(terms) || 0;
      if (n && t) return zh ? `搜索 ${t} 个关键词，参考 ${n} 篇资料` : `${t} search terms, ${n} sources`;
      if (n) return zh ? `参考 ${n} 篇资料` : `${n} sources`;
      if (t) return zh ? `搜索 ${t} 个关键词` : `${t} search terms`;
      return zh ? '查阅资料中' : 'Reading sources';
    }
    if (stage === 'card') return zh ? '正在智能排版' : 'Laying it out';
    if (stage === 'image') return zh ? '正在辨认图片内容' : 'Reading the image';
    const kind = stageKind(question);
    const pool = (zh ? STAGE_PHRASE : STAGE_EN)[kind] || (zh ? STAGE_PHRASE.base : STAGE_EN.base);
    const i = Math.abs(stagePick++) % pool.length;
    return pool[i];
  }

  const dots = thinking(stageLabel(text, extra.image && !extra.imageDesc ? 'image' : (wantsWeb ? 'web' : '')));
  body.appendChild(dots);
  holder.appendChild(body);
  chat.appendChild(holder);
  pinBottom();

  let textBuf = '';
  let textEl = null;
  let settledSrc = '';
  let settledHtml = '';
  let liveHtml = '';
  let livePlainLen = 0; // 上一帧尾巴里已经显出来的字数
  let shownChars = 0;   // 已经「演」出来的字数，落后于 textBuf，模型吐得再快也匀速显字
  let pendingCardType = null;
  let pendingSkeletonTimer = 0;
  let webCount = 0;

  // 流式渲染时，把模型还没写完的 [[math: / [[chem: / [[draw: 片段先藏起来（v0.9.4）
  const liveSafe = (t) => {
    let x = String(t || '');
    // 数学公式不要等整段写完才出现：没闭合的 [[math: / [[chem: 先补一个右括号，
    // 让已经到的符号立即排版，避免“憋半天突然蹦出一大坨”。
    x = x.replace(/\[\[(math|chem):([\s\S]*)$/, (m, kind, body) => {
      if (body.includes(']]')) return m;
      return `[[${kind}:${body}]]`;
    });
    // 写完的画图块先摘掉，别把它后面的文字一起扣住
    x = x.replace(/\[\[draw:[\s\S]*?\]\]/g, '');
    // 还在写入的半截画图 JSON 才需要藏
    x = x.replace(/\[\[draw:[\s\S]*$/, '');
    // 只有"还没闭合"的围栏才截断；闭合了的代码块后面还有正文，不能一起吞
    if (((x.match(/```/g) || []).length) % 2) x = x.slice(0, x.lastIndexOf('```'));
    const cut = x.lastIndexOf('{"type"');
    if (cut > -1 && x.indexOf('}', cut) === -1) x = x.slice(0, cut);
    return x;
  };

  // 立刻把缓冲区里剩下的字一次性画完（骨架卡出场前必须先调它，否则
  // 文字还在慢慢落、骨架卡已经先摆在那儿了）
  const flushStream = (final) => {
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    shownChars = textBuf.length;
    if (!textEl || !textEl.isConnected) return;
    try {
      streamHtml = renderMarkdown(liveSafe(textBuf));
      textEl.innerHTML = streamHtml;
    } catch (_) {
      textEl.textContent = liveSafe(textBuf);
    }
    // 整段重画过了，分块缓存作废，下一帧重新起块
    settledSrc = settledHtml = liveHtml = '';
    livePlainLen = 0;
  };

  // 流式渲染节流：64ms 一帧，最多 15 次/秒。
  // 关键优化：以最后一个空行为界，前面已定稿的部分只 markdown 一次并缓存，
  // 每帧只重画还在长的尾巴。否则两千字的答案等于每秒 30 次全量重排（O(n²)），
  // 主线程被吃掉，滚动和流式一起卡。
  let streamTimer = null;
  let streamHtml = '';
  let lastPaintSrc = null;
  let streamCaret = null;
  // 后台标签页不画：看不见的内容重排纯属白烧 CPU（明轩 2026-10-29 又提卡顿）
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && textEl && textEl.isConnected && streamTimer === null) paintStream();
    });
  }
  const paintStream = () => {
    if (streamTimer || !textEl || !textEl.isConnected) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    // 长回答把重画间隔拉长到 110ms：答案越长，一次 markdown + 重排越贵，
    // 60fps 的刷新率对它没有意义，肉眼也分辨不出 9fps 和 15fps 的区别
    const gapMs = textBuf.length > 1600 ? 110 : 64;
    streamTimer = setTimeout(() => {
      streamTimer = null;
      if (!textEl || !textEl.isConnected) return;
      // 揭示进度：每帧只放一小批（3~24 字），模型一口气吐两百字也是匀速往外走
      const backlog0 = textBuf.length - shownChars;
      if (backlog0 > 0) {
        const step = Math.min(24, Math.max(3, Math.ceil(backlog0 / 8)));
        shownChars = Math.min(textBuf.length, shownChars + step);
      }
      const src = liveSafe(textBuf.slice(0, shownChars));
      // SSE 有时一次只来几个字，没变就别重画（每次重画都是一次整块重排）
      if (src === lastPaintSrc) {
        if (shownChars < textBuf.length) paintStream();
        return;
      }
      lastPaintSrc = src;
      let head = '', tail = src;
      let cut = src.lastIndexOf('\n\n');
      let cutLen = 2;
      // 模型一口气写一大段（中间没有空行）时，退一步按单个换行切，
      // 否则「尾巴」就是整段，每帧全量重排这段，越长越卡
      if (cut <= 0 && src.length > 600) { cut = src.lastIndexOf('\n'); cutLen = 1; }
      // 连着写一大段、既没空行也没换行时，按句子切开：已说完的句子一次性定稿并缓存，
      // 每帧只需要排最后一句，成本不再随答案总长涨（明轩 2026-10-29 还说下滑卡）
      if (cut <= 0 && src.length > 260) {
        let m = -1;
        for (const ch of ['。', '！', '？', '；']) {
          const i = src.lastIndexOf(ch);
          if (i > m) m = i;
        }
        if (m < src.length - 12) {
          const d = src.lastIndexOf('. ');
          if (d > m) m = d + 1;
        }
        if (m > 80) { cut = m + 1; cutLen = 0; }
      }
      if (cut > 0) {
        const h = src.slice(0, cut + cutLen);
        // 切点落在没闭合的代码块里就整段渲染，别把围栏劈成两半
        if (((h.match(/```/g) || []).length) % 2 === 0) { head = h; tail = src.slice(cut + cutLen); }
      }
      if (head !== settledSrc) {
        try { settledHtml = head ? renderMarkdown(head) : ''; } catch (_) { settledHtml = ''; }
        settledSrc = head;
      }
      let tailHtml = '';
      try { tailHtml = tail ? renderMarkdown(tail) : ''; } catch (_) { tailHtml = tail; }
      try {
        const dirty = [...textEl.children].some(n => !n.classList.contains('tz-settled') && !n.classList.contains('tz-live'));
        if (dirty) { textEl.innerHTML = ''; settledHtml = ''; liveHtml = ''; }
        let sEl = textEl.querySelector(':scope > .tz-settled');
        let lEl = textEl.querySelector(':scope > .tz-live');
        if (settledHtml) {
          if (!sEl) {
            sEl = document.createElement('div');
            sEl.className = 'tz-settled';
            textEl.insertBefore(sEl, lEl || null);
          }
          if (sEl.innerHTML !== settledHtml) sEl.innerHTML = settledHtml;
        } else if (sEl) { sEl.remove(); }
        if (!lEl) {
          lEl = document.createElement('div');
          lEl.className = 'tz-live';
          textEl.appendChild(lEl);
        }
        if (tailHtml !== liveHtml) {
          lEl.innerHTML = tailHtml;
          liveHtml = tailHtml;
          // 只给这一帧新到的字上浮现：老字是纯文本节点，重画也不会重播动画
          const nowLen = plainLen(lEl);
          if (nowLen > livePlainLen && livePlainLen > 0) freshWrap(lEl, livePlainLen);
          livePlainLen = nowLen;
        }
        // 光标复用同一个元素，只在宿主变了才挪：每帧新建 + 摘除会白白多两次重排
        const blocks = lEl.querySelectorAll('p, li, h1, h2, h3, blockquote, .md-h1, .md-h2, .md-h3');
        const host = blocks.length ? blocks[blocks.length - 1] : lEl;
        if (!streamCaret) {
          streamCaret = document.createElement('span');
          streamCaret.className = 'stream-caret';
          streamCaret.setAttribute('aria-hidden', 'true');
        }
        if (streamCaret.parentNode !== host) host.appendChild(streamCaret);
      } catch (_) {}
      // DOM 已经改完，这时候再滚一次：一次布局搞定，别在写入前读 scrollHeight
      scrollBottom();
      // 还有没演完的字就自己接着走：不靠 delta 驱动，模型停了动画也能收尾
      if (shownChars < textBuf.length) paintStream();
    }, gapMs);
  };

  const onEvent = (ev) => {
    if (ev.event === 'meta') {
      state.conversationId = ev.data.conversationId;
      store.set('minxtok.conv', state.conversationId);
      // 图片走的是 OCR 兜底：同样只更新气泡那句，不再另起一行灰字
      if (ev.data.image && ev.data.image.fallback) {
        setThinkingLabel(dots, vhZh() ? '按文字读图片' : 'Reading the image as text');
      }
      if (ev.data.web && ev.data.web.count) {
        webCount = Number(ev.data.web.count) || 0;
        if (webCount) {
          const terms = Number(ev.data.web.terms) || 1;
          // 搜了多少关键词、查了多少篇资料，直接搬进三个点前面那句（明轩 2026-10-29）
          setThinkingLabel(dots, stageLabel(text, 'read', webCount, terms));
        }
      }
    } else if (ev.event === 'card_pending') {
      // 骨架卡挂在文字下面（还没文字就先挂在三点下面）
      pendingCardType = ev.data.type;
      setThinkingLabel(dots, stageLabel(text, 'card'));
      // 骨架卡兜底：25 秒还没等到真卡就撤掉，别让一张灰卡永远在那儿转
      clearTimeout(pendingSkeletonTimer);
      pendingSkeletonTimer = setTimeout(() => {
        body.querySelectorAll('.card.skeleton').forEach((n) => n.remove());
      }, 25000);
      if (!body.querySelector('.card.skeleton')) {
        // 骨架卡必须等文字全部落完再出：先 flush 掉缓冲，再等一帧让浏览器画完
        flushStream();
        requestAnimationFrame(() => {
          if (body.querySelector('.card.skeleton')) return;
          const sk = skeletonCard(pendingCardType || 'music');
          if (textEl && textEl.isConnected) textEl.after(sk);
          else body.appendChild(sk);
          scrollBottom();
        });
      }
      scrollBottom();
    } else if (ev.event === 'delta') {
      if (!textEl) {
        textEl = document.createElement('div');
        textEl.className = 'text streaming';
        livePlainLen = 0;
        shownChars = 0;
        const anchor = body.querySelector('.m-thinking') || body.querySelector('.web-note');
        if (anchor) body.insertBefore(textEl, anchor.nextSibling);
        else body.appendChild(textEl);
      }
      textBuf += ev.data.text;
      // v0.9.4：流式过程也走 markdown 渲染，否则 [[math:]] 和画图 JSON 会当场裸奔成代码
      paintStream();
      // 三个点属于虾虾的气泡：文字一出来就让位，不再挂在卡片底下
      if (dots.isConnected) dots.remove();
      // 不再每次 delta 都 scrollBottom：等 paintStream 画完再滚，
      // 否则「读布局 → 写 DOM → 再读布局」来回拉扯，流式最费的就是这个（明轩 2026-10-29）
    } else if (ev.event === 'block') {
      if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
      chat.querySelectorAll('.img-note:not(.leaving)').forEach((n) => {
        n.classList.add('leaving');
        setTimeout(() => n.remove(), 340);
      });
      if (dots.isConnected) dots.remove();
      if (textEl) textEl.classList.remove('streaming');
      pendingCardType = null;
      body.innerHTML = '';
      // 搜索数量、图片说明这些灰字一律不落地：它们在三个点那行说完就够了（明轩 2026-10-29）
      for (const b of ev.data.blocks || []) body.appendChild(renderBlock(b));
      // 追问是随 block 一起来的：这里重新触发一次，保证流式路径上也有入场动画
      const fq = body.querySelector('.followups');
      if (fq && localStorage.getItem('minxtok.followups') !== '0') requestAnimationFrame(() => playFollowIn(fq));
      // 用真实消息重建消息头：引用/删除要绑到服务端 id 上
      const oldWho = holder.querySelector('.who');
      if (oldWho) {
        const nw = buildWho({ id: ev.data.messageId, blocks: ev.data.blocks || [], createdAt: Date.now() });
        holder.replaceChild(nw, oldWho);
      }
      resolvePendingMusic();
      scrollBottom();
    } else if (ev.event === 'followups') {
      // 设置里关了「显示追问」就彻底不画，避免留下隐藏 DOM 和点击残留
      if (localStorage.getItem('minxtok.followups') === '0') return;
      if (!body.querySelector('.followups')) {
        body.appendChild(renderBlock({ type: 'followups', items: ev.data.items }));
        scrollBottom();
      }
    } else if (ev.event === 'done') {
      if (textEl) textEl.classList.remove('streaming');
      updateQuota(ev.data.quota);
      // 收尾清场：骨架卡没换来真卡就删掉，音乐卡再补一次异步解析
      clearTimeout(pendingSkeletonTimer);
      body.querySelectorAll('.card.skeleton').forEach((n) => n.remove());
      resolvePendingMusic();
      // 收尾再贴一次：流式期间末尾常留一两像素，停在那里看着像没到底
      if (stickBottom) scrollBottom();
    } else if (ev.event === 'stop') {
      toast(t('toast.paused'));
    } else if (ev.event === 'error') {
      throw new Error(ev.data.message || 'stream_error');
    }
  };

  // 问天气才值得等定位授权，别的一句话都不拦
  if (/(天气|气温|下雨|降水|带伞|多少度|冷不冷|热不热|穿什么|降温|升温)/.test(String(text || ''))) {
    extra.geo = await ensureGeo();
  }

  try {
    // 用 XHR 而不是 fetch 流：微信内置浏览器会把 fetch 流缓存到最后才吐，骨架卡和逐字都看不到
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      state.currentXhr = xhr;
      xhr.open('POST', '/api/chat');
      xhr.setRequestHeader('Content-Type', 'application/json');
      // XHR 不会被 index.html 的 fetch 包装器覆盖，必须手动带会话 token
      const authToken = localStorage.getItem('minxtok.token');
      if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
      let offset = 0;
      let buf = '';
      xhr.onprogress = () => {
        const chunkText = xhr.responseText.slice(offset);
        offset = xhr.responseText.length;
        buf += chunkText;
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = parseEvent(chunk);
          if (!ev) continue;
          try { onEvent(ev); } catch (err) { reject(err); xhr.abort(); return; }
        }
      };
      xhr.onabort = () => {
        if (dots.isConnected) dots.remove();
        const stopEl = document.createElement('div');
        stopEl.className = 'text';
        stopEl.style.color = 'var(--muted)';
        stopEl.textContent = t('stopped');
        body.appendChild(stopEl);
        resolve();
      };
      xhr.onload = () => {
        if (xhr.status === 423) {
          let reason = t('veil.paused');
          try { reason = JSON.parse(xhr.responseText).reason || reason; } catch (_) { /* 忽略 */ }
          state.paused = true;
          setVeil(true, reason);
        }
        if (xhr.status === 429) {
          let info = {};
          try { info = JSON.parse(xhr.responseText) || {}; } catch (_) { /* 忽略 */ }
          const zh = getLang() === 'zh';
          const msg = info.error === 'quota_exceeded'
            ? (zh ? '今天的额度用完了，明天会自动恢复，也可以去充值或兑换。' : 'Daily quota is used up. It resets tomorrow, or top up in Credits.')
            : info.error === 'daily_cap'
              ? (zh ? '今天全站可用的对话次数已经用完了，明天再来找我吧。' : 'The site-wide daily limit is used up. Come back tomorrow.')
              : (zh ? '说得有点太快了，缓一分钟再试。' : 'A bit too fast. Try again in a minute.');
          toast(msg, 2600);
          resolve();
          return;
        }
        if (xhr.status >= 400 && xhr.status !== 423) {
          reject(new Error('http_' + xhr.status));
          return;
        }
        resolve();
      };
      xhr.onerror = () => reject(new Error('network'));
      const geo = extra.geo || readGeo();
      xhr.send(JSON.stringify({
        uid: state.uid,
        lang: getLang(),
        message: text,
        conversationId: state.conversationId,
        lat: geo && geo.lat,
        lon: geo && geo.lon,
        city: geo && geo.city,
        quote: state.quote ? { text: state.quote.text, messageId: state.quote.messageId } : undefined,
        image: extra.image || undefined,
        imageDesc: extra.image ? (extra.imageDesc || undefined) : undefined,
        imageEngine: extra.image ? (extra.imageEngine || undefined) : undefined,
        imageText: extra.imageText || undefined,
        audio: extra.audio || undefined,
        audioType: extra.audioType || undefined,
        audioDuration: extra.audioDuration || undefined,
      }));
    });
  } catch (e) {
    if (dots.isConnected) dots.remove();
    const errEl = document.createElement('div');
    errEl.className = 'text';
    errEl.style.color = 'var(--danger)';
    errEl.textContent = t('toast.error');
    body.appendChild(errEl);
    console.error(e);
    state.quote = null;
    clearQuoteChip();
  } finally {
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    // 后面还有没演完的字就让泵自己跑完，别跟着请求一起断
    if (textEl && textEl.isConnected && shownChars < textBuf.length) paintStream();
    else if (textEl) textEl.classList.remove('streaming');
    if (stickBottom) { scrollBottom(); setTimeout(() => { if (stickBottom) scrollBottom(); }, 120); }
    state.sending = false;
    state.currentXhr = null;
    $('btnSend').classList.remove('stop');
    $('btnSend').disabled = false;
    $('input').blur();
  }
}

function parseEvent(chunk) {
  const lines = chunk.split('\n');
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try { return { event, data: JSON.parse(data) }; } catch (e) { return null; }
}

let stickBottom = true;
let stickRaf = 0;
let lastGestureAt = 0;
const STICK_GAP = 28;        // 离底超过这么多就算"用户自己翻上去了"
const GESTURE_HOLD = 900;    // 手指抬起后惯性还在滑，这段时间内都算用户操作

// 流式输出时跟不跟底，看的是"用户有没有自己往上滑"，不是看距离。
// 以前只看 gap<140，得往上拖一百多像素才解锁，手指一松又被拉回去 —— 就是那个"大滑才能解除"。
// 每次松手都让之前排好的“稍后再贴底”作废：进页面时有一串 setTimeout 补底，
// 用户正好在这几百毫秒里上滑，就会被下一次补底拽回去，看着像“滑不动、要滑两次”。
let stickEpoch = 0;
// 用户一旦自己动过滚动条，就算“接管”了：进场那串补底、图片撑开、ResizeObserver
// 全都不许再把他往下拽，直到他自己滑回底部（或发消息）为止。
let userTookOver = false;
function releaseStick() {
  stickBottom = false;
  userTookOver = true;
  stickEpoch++;
  if (followRaf) { cancelAnimationFrame(followRaf); followRaf = 0; }
}

// 稍后补底：只在没有新松手的情况下执行
function scrollBottomSoon(ms) {
  const ep = stickEpoch;
  setTimeout(() => { if (ep === stickEpoch && stickBottom && !userTookOver) scrollBottom(); }, ms);
}
// 只有「真的往上翻」才松手。以前 touchmove 一响就松，手指抖一两像素、
// 或者往下拖想看新消息，都会被判成翻旧账，于是偶发地不再自动下滑。
let touchStartY = 0;
chat.addEventListener('touchstart', (e) => {
  lastGestureAt = Date.now();
  touchStartY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
}, { passive: true });
chat.addEventListener('touchmove', (e) => {
  lastGestureAt = Date.now();
  const y = e.touches && e.touches[0] ? e.touches[0].clientY : touchStartY;
  // 上下都算：往上翻是看旧消息，往下拖是往回滚，只要动了就说明用户要自己控制
  if (Math.abs(touchStartY - y) > 6 || e.touches.length > 1) releaseStick();
}, { passive: true });
chat.addEventListener('wheel', (e) => {
  lastGestureAt = Date.now();
  if (e.deltaY < 0) releaseStick();
}, { passive: true });

chat.addEventListener('scroll', () => {
  // 滚动事件每帧都来，读 scrollHeight 会强制同步布局；合并到一帧只做一次
  if (stickRaf) return;
  stickRaf = requestAnimationFrame(() => {
    stickRaf = 0;
    const gap = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    if (gap <= 4) {
      stickBottom = true;                       // 回到底了，继续跟
      userTookOver = false;
    } else if (gap > STICK_GAP && Date.now() - lastGestureAt < GESTURE_HOLD) {
      releaseStick();                           // 用户往上滑了，立刻松手
    }
    // 顺手判断要不要补更早的消息（同一帧只读一次布局，别开第二个监听）
    if (chat.scrollTop <= 90) revealOlder();
  });
}, { passive: true });

// 流式贴底改成「缓动跟随」：不再每来一段内容就硬跳到底，
// 而是每帧吃掉剩余距离的一部分，内容和滚动同时推进，看起来是连续地滑。
// （读 scrollHeight 每帧一次是可以接受的，浏览器本来每帧也要布局一次。）
let followRaf = 0;
function jumpBottom() {
  cancelAnimationFrame(followRaf);
  followRaf = 0;
  chat.scrollTop = chat.scrollHeight;
}
function followStep() {
  followRaf = 0;
  if (!stickBottom || userTookOver) return;
  const max = chat.scrollHeight - chat.clientHeight;
  if (max <= 0) return;
  if (max - chat.scrollTop <= 0.5) return;
  // 一帧跳到位，绝不自己续下一帧：
  // 以前 30% 缓动 + 自我续帧，流式内容一直在长，等于每帧都在读 scrollHeight（强制重排）
  // 再写 scrollTop，主线程被吃干，滚动和输出一起卡（明轩 2026-10-29 说还是卡顿）
  chat.scrollTop = max;
}

// 图片/卡片后加载会把内容顶高，没人调 scrollBottom 就会停在半空
chat.addEventListener('load', (e) => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG') return;
  if (stickBottom) scrollBottom();
}, true);

// 内容自己长高（公式/卡片/字体回流、图片撑开）也要跟。图片 load 只覆盖图片，
// 卡片和 KaTeX 是尺寸变化，没有事件，用 ResizeObserver 兜一层底。
if (window.ResizeObserver) {
  const growRo = new ResizeObserver(() => { if (stickBottom) scrollBottom(); });
  const observeChildren = () => { for (const el of chat.children) growRo.observe(el); };
  observeChildren();
  new MutationObserver(observeChildren).observe(chat, { childList: true });
}

// 切回前台/窗口尺寸变了，贴底也跟着补一次（键盘收起、旋转屏幕都算）
const canAutoJump = () => stickBottom && Date.now() - lastGestureAt > 260;
document.addEventListener('visibilitychange', () => { if (!document.hidden && canAutoJump()) jumpBottom(); });
window.addEventListener('resize', () => { if (canAutoJump()) jumpBottom(); });
// 发消息、点追问这类明确的“我要看新内容”动作，直接重新钉底。
// 不然之前手滑过一下 stickBottom=false，发完消息还停在上一条。
function pinBottom() {
  stickBottom = true;
  userTookOver = false;
  lastGestureAt = 0;
  jumpBottom();
}

function scrollBottom(force) {
  // 用户往上翻看旧消息时别再把他拽回底部，只在贴近底部时跟随
  if (force) { jumpBottom(); return; }
  if (!stickBottom || userTookOver) return;
  // 手指还在屏幕上滑动（刚 touch 过 260ms 内），这一帧别抢滚动条
  if (Date.now() - lastGestureAt < 260) return;
  if (!followRaf) followRaf = requestAnimationFrame(followStep);
}


/* ---------- 额度到账横幅（底部，输入区上方） ---------- */
let bannerTimer = null;
function showQuotaBanner(added, bonus = 0) {
  const n = Number(added) || 0;
  if (n <= 0) return;
  const old = document.getElementById('quotaBanner');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'quotaBanner';
  el.className = 'quota-banner';
  el.innerHTML = `<span class="qb-ico">✦</span>
    <span class="qb-text">额度到账 <b>+${n}</b>${bonus ? ` <i>（含彩蛋 +${bonus}）</i>` : ''}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

function quotaLeft(q) {
  if (!q) return 0;
  if (typeof q.left === 'number' && Number.isFinite(q.left)) return Math.max(q.left, 0);
  if (typeof q.limit === 'number' && typeof q.used === 'number') return Math.max(q.limit - q.used, 0);
  return 0;
}

function paintQuota() {
  const el = $('quota');
  if (!el) return;
  const q = state.quota;
  el.hidden = false;
  if (!q || typeof q.limit !== 'number' || typeof q.used !== 'number') {
    el.classList.add('is-empty');
    el.textContent = t('quota.unknown') || '额度 —';
    return;
  }
  el.classList.remove('is-empty');
  // 服务端返回的 left 才是唯一口径：兑换池 + 限时包 + 每日剩余，扣费时池子先扣。
  // 池子是独立总量，不参与每日上限，所以这里直接显示"还能用多少次"不会乱跳。
  const left = quotaLeft(q);
  // 充值页开着就把大数字一起对齐，两边永远同一个数；说明文字归充值页自己写，别覆盖掉兑换额度那行
  const tb = document.getElementById('tbNum');
  if (tb) tb.textContent = String(left);
  el.textContent = t('quota', { n: left });
}

// 额度只有一个入口：所有来源都写进 state.quota，再由 paintQuota 统一渲染
// 小游戏复活扣额度后，把最新余额同步到顶部徽标
window.addEventListener('minxtok-quota', (e) => { if (e.detail) updateQuota(e.detail); });

function updateQuota(quota) {
  if (!quota || typeof quota.limit !== 'number') return;
  const used = typeof quota.used === 'number' ? quota.used : (state.quota ? state.quota.used : 0);
  const left = typeof quota.left === 'number' ? quota.left : undefined;
  const dailyLeft = typeof quota.dailyLeft === 'number' ? quota.dailyLeft : undefined;
  const poolLeft = typeof quota.poolLeft === 'number' ? quota.poolLeft : undefined;
  const stock = typeof quota.stock === 'number' ? quota.stock : undefined;
  const grantSum = typeof quota.grantSum === 'number' ? quota.grantSum : undefined;
  if (state.quota && state.quota.limit === quota.limit && state.quota.used === used &&
      state.quota.left === left && state.quota.dailyLeft === dailyLeft && state.quota.poolLeft === poolLeft &&
      state.quota.stock === stock && state.quota.grantSum === grantSum) return;
  state.quota = { used, limit: quota.limit, left, dailyLeft, poolLeft, stock, grantSum };
  paintQuota();
}

/* ---------- 状态轮询：暂停就整页遮罩 ---------- */
async function pollStatus() {
  // 应用在后台时不轮询：8 秒一次的网络 + DOM 刷新在后台纯属白烧
  if (document.hidden) return;
  try {
    const res = await fetch(`/api/status?uid=${encodeURIComponent(state.uid)}`, { cache: 'no-store' });
    if (!res.ok) { state.paused = false; setVeil(false); return; }
    const d = await res.json();
    if (d && d.error) { state.paused = false; setVeil(false); return; }
    // 只有明确的 paused=true 才上遮罩；别的任何情况都不许把整页糊住
    state.paused = d.paused === true;
    if (d.model) state.model = d.model;
    setVeil(state.paused, d.reason || t('veil.paused'));
    if (d.quota) updateQuota(d.quota);
    if (d.quota) {
      // 轮询只负责把数字校准，不再自己判断"到账"——到账横幅只由领取/兑换触发的接口弹
      state.lastLimit = d.quota.limit;
      if (d.quota.left <= 10 && !state.lowWarned) {
        state.lowWarned = true;
        openNotice({
          title: trText('额度快用完了'),
          sub: trText(`现在还能用的只剩 ${d.quota.left} 额度了。`),
          note: trText('可以去「充值」里充值或兑换，也可以等明天每日额度自动恢复。'),
          button: trText('了解'),
          ver: 'v' + appVersion(),
        });
      }
    }
  } catch (_) { /* 网络抖动忽略 */ }
}

/* ---------- 充值 ---------- */
async function openTopup() {
  // 先用当前额度快照把页面画出来，网络慢时也不让用户盯着骨架
  const cached = state.quota && typeof state.quota.limit === 'number'
    ? {
      left: state.quota.left != null ? state.quota.left : Math.max(state.quota.limit - (state.quota.used || 0), 0),
      limit: state.quota.limit, dailyLimit: state.quota.limit,
      dailyLeft: Math.max(state.quota.limit - (state.quota.used || 0), 0),
      poolLeft: state.quota.poolLeft || 0, stock: state.quota.stock || 0,
      grantSum: state.quota.grantSum || 0, grants: [],
    }
    : null;
  openPage('充值', cached ? topupHtml(cached) : pageLoading('topup'), null, 'topup');
  try {
    const r = await fetch(`/api/quota?uid=${encodeURIComponent(state.uid)}`);
    const q = await r.json();
    // 先把徽标校准到同一份快照，两边数字不会再各说各话
    if (q && typeof q.limit === 'number') updateQuota(q);
    renderTopup(q, !cached);
  } catch (_) {
    if (!cached) fillPage('<div style="padding:20px;color:var(--muted)">加载失败，稍后再试。</div>');
  }
}

function fmtExp(ts) {
  const left = Number(ts) - Date.now();
  if (left <= 0) return '已过期';
  const h = Math.floor(left / 3600000);
  const d = new Date(Number(ts));
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (h >= 48) return `剩 ${Math.floor(h / 24)} 天 ${h % 24} 小时 · ${ymd} 到期`;
  if (h >= 1) return `剩 ${h} 小时 · ${ymd} 到期`;
  return `剩 ${Math.max(1, Math.floor(left / 60000))} 分钟`;
}

function topupHtml(q) {
  const grants = (q.grants || []).map(g =>
    `<div class="grant-row"><span>${g.amount}${g.left != null && g.left !== g.amount ? ` · 剩 ${g.left}` : ''}</span><span class="g-exp">${fmtExp(g.exp)}</span></div>`).join('');
  const total = q.left != null ? q.left : ((q.dailyLeft != null ? q.dailyLeft : 0) + (q.poolLeft || 0));
  const dailyLeft = q.dailyLeft != null ? q.dailyLeft : (q.limit || 0);
  const stock = q.stock || 0;
  const pool = q.poolLeft || 0;
  return `
    <div class="topup-balance">
      <div class="tb-num" id="tbNum">${total}</div>
      <div class="tb-label" id="tbLabel">可用额度 · 每日 ${dailyLeft}/${q.dailyLimit != null ? q.dailyLimit : q.limit}</div>
      ${pool ? `<div class="tb-label" style="margin-top:2px">兑换额度 ${pool} · 优先扣减，长期有效</div>` : ''}
    </div>
    ${stock ? `<div class="panel" style="padding:10px 14px;margin-bottom:16px"><div class="group-title" style="margin:0">兑换额度 · 剩 ${stock}</div></div>` : ''}
    ${grants ? `<div class="panel" style="padding:10px 14px;margin-bottom:16px"><div class="group-title" style="margin:0 0 8px">限时额度 · 共 ${q.grantSum != null ? q.grantSum : (q.poolLeft || 0)}</div>${grants}</div>` : ''}

    <div class="group">
      <div class="group-title">充值</div>
      <div class="panel pay-panel">
        <div id="payStage" class="pay-stage"><div class="pay-loading">正在生成充值码</div></div>
      </div>
    </div>

    <div class="group">
      <div class="group-title">兑换码</div>
      <div class="panel" style="padding:14px">
        <div class="apply-row">
          <input class="auth-input" id="redeemCode" placeholder="输入兑换码" autocomplete="off">
          <button class="btn" id="redeemBtn">兑换</button>
        </div>
      </div>
    </div>
    <div id="topupMsg" class="diary-msg"></div>`;
}

function renderTopup(q, animate = true) {
  // 内部渲染，避免骨架走完又来一次整页上浮（fillPage 不重播入场）
  fillPage(topupHtml(q));
  paintPayCode();

  // 余额滚动动画
  const num = document.getElementById('tbNum');
  if (num && animate) {
    const target = Number(q.left != null ? q.left : ((q.dailyLeft || 0) + (q.poolLeft || 0))) || 0;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      num.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    num.textContent = '0';
    requestAnimationFrame(step);
  }
}

/* ---------- 充值码：每个用户一张，30 分钟有效 ---------- */
let payCode = null;        // { token, exp, phone }
let payCdTimer = null;
let payRegenAt = 0;        // 重新生成的冷却截止时间
const PAY_REGEN_COOLDOWN = 60000;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(`script[data-src="${src}"]`);
    if (found) {
      if (found.dataset.loaded) resolve();
      else found.addEventListener('load', () => resolve());
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.dataset.src = src;
    el.onload = () => { el.dataset.loaded = '1'; resolve(); };
    el.onerror = () => reject(new Error('load ' + src));
    document.head.appendChild(el);
  });
}

function paintPayCode() {
  const stage = document.getElementById('payStage');
  if (!stage) return;
  if (!payCode || payCode.exp - Date.now() < 60000) { loadPayCode(true); return; }

  const token = payCode.token;
  const short = token.slice(0, 8).toUpperCase();
  stage.classList.add('is-loading');
  stage.innerHTML = `
    <div class="pay-qr"><canvas id="payQr" style="display:none"></canvas><div class="pay-sk pay-sk-qr" id="payQrSk"></div></div>
    <div class="pay-bar"><svg id="payBar" style="display:none"></svg><div class="pay-sk pay-sk-bar" id="payBarSk"></div></div>
    <div class="pay-code">${short}</div>
    <div class="pay-meta">充值账户 <b>${payCode.phone || '当前账号'}</b> · <span id="payCd"></span></div>
    <div class="pay-note">请将充值码截图发送给管理员，由其完成入账</div>
    <button class="btn" id="payRegen" type="button">重新生成</button>`;

  const url = `${location.origin}/pay?t=${token}`;
  loadScriptOnce('/vendor/qr/qrcode.js?v=8').then(() => {
    const cv = document.getElementById('payQr');
    if (!cv || typeof window.qrcode !== 'function') return;
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const box = Math.max(168, Math.min(232, Math.floor((stage.clientWidth || 300) - 44)));
    const quiet = 2;
    const total = n + quiet * 2;
    const unit = Math.max(1, Math.floor(box / total));
    const size = unit * total;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px';
    cv.style.height = size + 'px';
    cv.style.display = 'block';
    const sk = document.getElementById('payQrSk');
    if (sk) sk.remove();
    if (!document.getElementById('payQrSk') && !document.getElementById('payBarSk')) stage.classList.remove('is-loading');
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 深色模式反相：黑底白码，扫起来更稳
    const dark = (document.documentElement.dataset.theme || 'dark') !== 'light';
    g.fillStyle = dark ? '#0e0e11' : '#ffffff';
    g.fillRect(0, 0, size, size);
    g.fillStyle = dark ? '#ffffff' : '#0e0e11';
    const m = size / total;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) g.fillRect(Math.round((x + quiet) * m), Math.round((y + quiet) * m), Math.ceil(m), Math.ceil(m));
      }
    }
  }).catch(() => {});

  loadScriptOnce('/vendor/barcode/code128.min.js?v=10').then(() => {
    const svg = document.getElementById('payBar');
    if (!svg || typeof window.JsBarcode !== 'function') return;
    try {
      const dark = (document.documentElement.dataset.theme || 'dark') !== 'light';
      window.JsBarcode(svg, short, {
        format: 'CODE128', width: 1.5, height: 46, displayValue: false,
        margin: 0,
        lineColor: dark ? '#ffffff' : '#0e0e11',
        background: dark ? '#0e0e11' : '#ffffff',
      });
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.display = 'block';
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      const bsk = document.getElementById('payBarSk');
      if (bsk) bsk.remove();
      if (!document.getElementById('payQrSk') && !document.getElementById('payBarSk')) stage.classList.remove('is-loading');
    } catch (_) {}
  }).catch(() => {});

  startPayCountdown();
}

// 深浅色切换后二维码/条形码要跟着反相，否则黑码压黑底看不见
document.documentElement.addEventListener('themechange', () => {
  if (payCode && document.getElementById('payQr')) paintPayCode();
});

async function loadPayCode(force) {
  const stage = document.getElementById('payStage');
  if (!stage) return;
  if (!force && payCode && payCode.exp - Date.now() > 60000) { paintPayCode(); return; }
  stage.innerHTML = '<div class="pay-loading">正在生成充值码</div>';
  try {
    const r = await fetch('/api/pay/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'token_failed');
    payCode = { token: d.token, exp: d.exp, phone: d.phone };
    payRegenAt = Date.now() + PAY_REGEN_COOLDOWN;
    paintPayCode();
  } catch (_) {
    if (!document.getElementById('payStage')) return;
    stage.innerHTML = '<div class="pay-loading">充值码生成失败，点击重试</div>';
    const box = stage.querySelector('.pay-loading');
    if (box) box.addEventListener('click', () => loadPayCode(true));
  }
}

function startPayCountdown() {
  if (payCdTimer) { clearInterval(payCdTimer); payCdTimer = null; }
  const put = () => {
    const el = document.getElementById('payCd');
    if (!el) { clearInterval(payCdTimer); payCdTimer = null; return; }
    const left = Math.max(0, (payCode ? payCode.exp : 0) - Date.now());
    if (left <= 0) {
      setTrText(el, '已失效');
      const wrap = document.querySelector('.pay-qr');
      if (wrap) wrap.classList.add('is-expired');
      const qr = document.getElementById('payQr');
      if (qr) qr.classList.add('is-expired');
      clearInterval(payCdTimer);
      payCdTimer = null;
      return;
    }
    const m = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    // 同步翻译：英文模式下等监听器去翻会先闪一帧中文
    setTrText(el, `有效期剩余 ${m} 分 ${String(sec).padStart(2, '0')} 秒`);
  };
  const paintRegen = () => {
    const btn = document.getElementById('payRegen');
    if (!btn) return;
    const wait = Math.ceil((payRegenAt - Date.now()) / 1000);
    if (wait > 0) { btn.disabled = true; setTrText(btn, `重新生成（${wait}s）`); }
    else { btn.disabled = false; setTrText(btn, '重新生成'); }
  };
  put();
  paintRegen();
  payCdTimer = setInterval(() => { put(); paintRegen(); }, 1000);
}

/* ---------- 充值到账实时通知 ---------- */
let payWatchOn = false;
// 已处理到的通知时间戳要落盘：明轩说"管理员充值后，无论用户是否退出都要弹窗"。
// 以前 since 用 Date.now() 起算，人在应用外时那笔到账就永远看不到了。
const PAY_SEEN_KEY = 'minxtok.payseen';
function paySeen() {
  const v = Number(localStorage.getItem(PAY_SEEN_KEY) || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function setPaySeen(ts) {
  const n = Number(ts) || 0;
  if (n > paySeen()) { try { localStorage.setItem(PAY_SEEN_KEY, String(n)); } catch (_) {} }
}
let paySince = paySeen();

function startPayWatch() {
  if (payWatchOn || !state.uid) return;
  payWatchOn = true;
  paySince = paySeen();
  const loop = async () => {
    while (payWatchOn) {
      try {
        const r = await fetch(`/api/pay/watch?uid=${encodeURIComponent(state.uid)}&since=${paySince}`);
        if (!r.ok) { await new Promise(res => setTimeout(res, 6000)); continue; }
        const d = await r.json().catch(() => null);
        if (d && d.payment) {
          // 按通知本身的时间推进，避免重复弹；顺带落盘，跨会话也不会重复
          setPaySeen(Number(d.payment.ts) || Number(d.at) || 0);
          paySince = Math.max(paySince, paySeen());
          showPaid(d.payment, d.quota);
        }
      } catch (_) {
        await new Promise(res => setTimeout(res, 6000));
      }
    }
  };
  loop();
}

function showPaid(p, quota) {
  if (quota) updateQuota(quota);
  payCode = null;   // 这串码服务端已经作废，本地也别再画它
  // 充值页开着就顺手刷新一遍，别让兑换额度那行停在旧数字
  if (document.getElementById('tbNum')) setTimeout(() => { try { openTopup(); } catch (_) {} }, 400);
  try { haptic(24); } catch (_) {}
  const amount = Number(p.amount) || 0;
  const at = String(p.at || '').replace('T', ' ');
  const phone = String(p.phone || (payCode && payCode.phone) || '').trim();
  openNotice({
    title: trText('充值到账'),
    sub: trText('额度已到账，可立即使用'),
    rows: [
      { k: trText('充值账户'), v: phone || '—' },
      { k: trText('充值额度'), v: `+${amount}` },
      { k: trText('充值时间'), v: at || '—' },
      { k: trText('订单编号'), v: String(p.id || '—') },
      { k: trText('支付状态'), v: trText('已支付') },
    ],
    button: trText('了解'),
    ver: 'v' + appVersion(),
  });
}

document.getElementById('pageBody').addEventListener('click', async (e) => {
  if (e.target.closest('#payRegen')) {
    if (Date.now() < payRegenAt) return;
    payCode = null;
    loadPayCode(true);
    return;
  }
  if (e.target.closest('#redeemBtn')) {
    const code = ((document.getElementById('redeemCode') || {}).value || '').trim();
    const msg = document.getElementById('topupMsg');
    if (!code) { msg.textContent = '先填兑换码'; return; }
    msg.textContent = '兑换中…';
    const r = await fetch('/api/quota/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, code }),
    });
    const d = await r.json();
    if (d.ok) {
      openNotice({
            title: trText('兑换成功'),
        sub: trText('额度已到账'),
        hero: `+${d.added}<small>${trText('额度')}</small>`,
        rows: [{ k: trText('兑换码'), v: code }],
        button: trText('了解'),
        ver: 'v' + appVersion(),
        onOk: () => { try { openTopup(); } catch (_) {} },
      });
    }
    else msg.textContent = d.error === 'code_not_found' ? '兑换码不存在' : d.error === 'code_expired' ? '已过期' : d.error === 'code_used_up' ? '已用完' : '兑换失败';
    return;
  }
});

/* ---------- 新版本检测 ----------
   明轩定：检测到新版本时用同一套底部抽屉提示，点「了解」重新进入加载新版本。
   版本戳来自 /api/version（构建时写入），跟本次加载记下的值不一样就说明发了新版。 */
const BUILD_KEY = 'minxtok.build';
let loadedBuild = null;
let verWarnedAt = 0;

async function fetchBuild() {
  const r = await fetch('/api/version', { cache: 'no-store' });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return d && d.ok && d.stamp ? { stamp: String(d.stamp), v: String(d.v || '') } : null;
}

async function startVersionWatch() {
  const first = await fetchBuild().catch(() => null);
  if (!first) return;
  loadedBuild = first;
  let cached = '';
  try { cached = localStorage.getItem(BUILD_KEY) || ''; } catch (_) {}
  if (cached !== first.stamp) { try { localStorage.setItem(BUILD_KEY, first.stamp); } catch (_) {} }

  const check = async () => {
    if (document.hidden || !loadedBuild) return;
    const now = await fetchBuild().catch(() => null);
    if (!now || now.stamp === loadedBuild.stamp) return;
    if (now.stamp === verWarnedAt) return;
    verWarnedAt = now.stamp;
    openNotice({
      title: trText('发现新版本'),
      sub: trText('新版本已发布，重新进入即可加载'),
      rows: [
        { k: trText('当前版本'), v: 'v' + appVersion() },
        { k: trText('最新版本'), v: 'v' + (now.v || appVersion()) },
      ],
      note: trText('点击下方按钮重新进入，加载完成后继续使用。'),
      button: trText('了解'),
      ver: 'v' + appVersion(),
      onOk: () => {
        // 带时间戳重新进入：绕开 index.html 的缓存，脚本自带 ?v= 也会一起换新
        const u = new URL(location.href);
        u.searchParams.set('r', String(Date.now()));
        location.replace(u.toString());
      },
    });
  };
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

/* ---------- 日记 ---------- */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function diaryTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
}

const DIARY_COLORS = [
  ['#e5484d', '红'], ['#f97316', '橙'], ['#d97706', '琥珀'], ['#16a34a', '绿'],
  ['#0d9488', '青'], ['#2563eb', '蓝'], ['#7c3aed', '紫'], ['#db2777', '粉'], ['#64748b', '灰'],
];
const DIARY_HIGHLIGHTS = [
  ['rgba(250,204,21,.42)', '黄'], ['rgba(74,222,128,.34)', '绿'], ['rgba(96,165,250,.34)', '蓝'],
  ['rgba(244,114,182,.32)', '粉'], ['rgba(167,139,250,.34)', '紫'], ['rgba(251,146,60,.32)', '橙'],
];

let diaryRange = null;
let diaryToolbarHold = false;
// 还没输入文字时先点亮按钮：把“待生效格式”挂在一个带零宽空格的 span 上，
// 光标放进去后输入的字天然带格式，不依赖 execCommand。
let diaryPending = { bold: false, italic: false, deco: '', strikeThrough: false, color: '', background: '' };
let diaryPendingSpan = null;
let diaryPendingAt = 0;
let diaryRec = null;
let diaryRecStream = null;
let diaryRecChunks = [];
let diaryRecStart = 0;
let diaryRecTimer = 0;
let diaryVoiceBusy = false;
let diarySelectedMedia = null;
let diaryMediaPicked = false;

function diaryEl() { return document.getElementById('diaryText'); }

function diaryEscape(text) {
  return String(text || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function diaryNote(text, bad = false) {
  const box = document.getElementById('diaryMsg');
  if (!box) return;
  box.textContent = text || '';
  box.classList.toggle('bad', !!bad);
}

function diaryNoteAction(text, label, action) {
  const box = document.getElementById('diaryMsg');
  if (!box) return;
  box.textContent = '';
  box.classList.remove('bad');
  const msg = document.createElement('span');
  msg.textContent = text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diary-note-btn';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    diaryNote('');
    action();
  });
  box.append(msg, btn);
}

function diaryIcon(name) {
  const paths = {
    bold: '<path d="M8 4.7h3.9a3.3 3.3 0 0 1 0 6.6H8z"/><path d="M8 11.3h4.8a3.5 3.5 0 0 1 0 7H8z"/>',
    italic: '<path d="M10.2 4.8h6.2"/><path d="M7.6 19.2h6.2"/><path d="M14.3 4.8 9.7 19.2"/>',
    underline: '<path d="M7 4.7v5.1a5 5 0 0 0 10 0V4.7"/><path d="M5.4 20h13.2"/>',
    strike: '<path d="M16.5 7.4c-.9-1.35-2.4-2.1-4.2-2.1-2.15 0-3.7 1.1-3.7 2.8 0 1.45 1 2.3 3.1 2.75l1.75.4c1.95.45 2.95 1.3 2.95 2.75 0 1.7-1.55 2.8-3.7 2.8-1.85 0-3.35-.8-4.25-2.15"/><path d="M4.6 12h14.8"/>',
    dot: '<path d="M7 4.7v5.1a5 5 0 0 0 10 0V4.7"/><path d="M5.4 20h.01M8.7 20h.01M12 20h.01M15.3 20h.01M18.6 20h.01"/>',
    text: '<path d="M5.7 16.7 9.9 4.6h4.2l4.2 12.1"/><path d="M7.5 12.1h9"/><path class="rt-fill" d="M4.8 19.3h14.4a.75.75 0 0 1 0 1.5H4.8a.75.75 0 0 1 0-1.5Z"/>',
    highlight: '<path d="M5 19.8h14"/><path d="M7.9 16.3 14.6 9.6a2.35 2.35 0 0 1 3.32 3.32l-6.7 6.68H7.9z"/><path d="m13.4 5.9 4.7 4.7"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="m4.5 17 4.4-4.4 3.4 3.4 2.8-2.8 4.4 4.3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3M9 21h6"/>',
    upload: '<path d="M12 15.5V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 15.5v2.8a2.7 2.7 0 0 0 2.7 2.7h9.6a2.7 2.7 0 0 0 2.7-2.7v-2.8"/>',
    left: '<path d="M4.5 6h15M4.5 10h9M4.5 14h15M4.5 18h8"/>',
    center: '<path d="M4.5 6h15M7.5 10h9M4.5 14h15M8 18h8"/>',
    right: '<path d="M4.5 6h15M10.5 10h9M4.5 14h15M11.5 18h8"/>',
    inline: '<rect x="3.5" y="5" width="7" height="14" rx="1.8"/><rect x="13.5" y="5" width="7" height="14" rx="1.8"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    trash: '<path d="M5 7h14"/><path d="M9.5 7V4.5h5V7"/><path d="m7.5 7 .9 12.5h7.2L16.5 7"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
  };
  return `<svg class="rt-ico" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function diaryToolbarHtml() {
  const swatches = (list, attr) => list.map(([color, name]) =>
    `<button type="button" class="rt-swatch" ${attr}="${color}" title="${name}" aria-label="${name}" style="--swatch:${color}"></button>`
  ).join('');
  return `
    <div class="diary-format">
      <div class="diary-toolbar" id="diaryToolbar" role="toolbar" aria-label="日记格式">
        <div class="rt-row">
          <button type="button" data-cmd="bold" title="粗体" aria-label="粗体" aria-pressed="false">${diaryIcon('bold')}</button>
          <button type="button" data-cmd="italic" title="斜体" aria-label="斜体" aria-pressed="false">${diaryIcon('italic')}</button>
          <button type="button" data-cmd="underline" title="下划线" aria-label="下划线" aria-pressed="false">${diaryIcon('underline')}</button>
          <button type="button" data-cmd="dot" title="点线下划线" aria-label="点线下划线" aria-pressed="false">${diaryIcon('dot')}</button>
          <button type="button" data-cmd="strikeThrough" title="删除线" aria-label="删除线" aria-pressed="false">${diaryIcon('strike')}</button>
        </div>
        <div class="rt-row">
          <button type="button" class="rt-mark" data-pop="text" title="文字颜色" aria-label="文字颜色" aria-expanded="false" style="--icon-color:#e5484d">${diaryIcon('text')}<i class="rt-caret"></i></button>
          <button type="button" class="rt-mark" data-pop="highlight" title="高亮" aria-label="高亮" aria-expanded="false" style="--icon-color:#facc15">${diaryIcon('highlight')}<i class="rt-caret"></i></button>
          <button type="button" data-action="image" title="插入图片" aria-label="插入图片">${diaryIcon('image')}</button>
          <button type="button" data-action="voice" title="录语音" aria-label="录语音">${diaryIcon('mic')}</button>
          <button type="button" data-action="audioFile" title="上传语音" aria-label="上传语音">${diaryIcon('upload')}</button>
        </div>
        <span id="diaryRecTime" class="rt-rec-time" hidden>00:00</span>
      </div>
      <div class="rt-pop" id="diaryTextPop" data-pop-panel="text" hidden>
        <div class="rt-pop-head">文字颜色</div>
        <div class="rt-swatches">
          <button type="button" class="rt-swatch rt-default" data-color="inherit" title="默认颜色">A</button>
          ${swatches(DIARY_COLORS, 'data-color')}
        </div>
      </div>
      <div class="rt-pop rt-pop-right" id="diaryHighlightPop" data-pop-panel="highlight" hidden>
        <div class="rt-pop-head">高亮</div>
        <div class="rt-swatches">
          <button type="button" class="rt-swatch rt-default" data-highlight="transparent" title="无高亮">×</button>
          ${swatches(DIARY_HIGHLIGHTS, 'data-highlight')}
        </div>
      </div>
    </div>
    <input id="diaryImageInput" type="file" accept="image/*" hidden>
    <input id="diaryAudioInput" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.weba,.webm,.flac,.amr,.3gp,.mp4,.mpeg,.mpga" hidden>`;
}

function diaryImgBarHtml() {
  return `
    <div class="diary-imgbar" id="diaryImgBar" hidden>
      <span class="dib-label">图片</span>
      <button type="button" data-img="left" title="靠左，文字绕在右边" aria-label="靠左">${diaryIcon('left')}</button>
      <button type="button" data-img="center" title="居中" aria-label="居中">${diaryIcon('center')}</button>
      <button type="button" data-img="right" title="靠右，文字绕在左边" aria-label="靠右">${diaryIcon('right')}</button>
      <button type="button" data-img="inline" title="并排排列" aria-label="并排排列">${diaryIcon('inline')}</button>
      <span class="dib-sep" aria-hidden="true"></span>
      <span class="dib-tune">
        <span class="dib-size" id="diaryImgSize">45%</span>
        <input class="dib-range" id="diaryImgRange" type="range" min="20" max="100" step="1" value="45" aria-label="图片大小">
      </span>
      <span class="dib-sep" aria-hidden="true"></span>
      <button type="button" class="dib-del" data-img="delete" title="删除" aria-label="删除">${diaryIcon('trash')}</button>
    </div>`;
}

function diarySelectionNode() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const n = sel.anchorNode;
  return n && n.nodeType === 1 ? n : (n && n.parentElement) || null;
}

function rememberDiaryRange() {
  const el = diaryEl();
  if (!el) { diaryRange = null; return; }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  // 点工具栏时浏览器会把选区收成光标，别用它覆盖真正要操作的选区
  if (r.collapsed && diaryToolbarHold && diaryRange && !diaryRange.collapsed) return;
  if (el.contains(r.commonAncestorContainer)) diaryRange = r.cloneRange();
}

function restoreDiaryRange() {
  const el = diaryEl();
  if (!el) return null;
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return null;
  let saved = diaryRange;
  if ((!saved || saved.collapsed) && sel.rangeCount) {
    const current = sel.getRangeAt(0);
    if (!current.collapsed && el.contains(current.commonAncestorContainer)) saved = current;
  }
  if (saved && el.contains(saved.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(saved);
  } else if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  return sel;
}

function diaryPendingStyleText() {
  const p = diaryPending;
  const parts = [];
  if (p.bold) parts.push('font-weight:700');
  if (p.italic) parts.push('font-style:italic');
  const lines = [];
  if (p.deco) lines.push('underline');
  if (p.strikeThrough) lines.push('line-through');
  if (lines.length) parts.push(`text-decoration-line:${lines.join(' ')}`);
  if (p.deco) parts.push(`text-decoration-style:${p.deco}`);
  if (p.color) parts.push(`color:${p.color}`);
  if (p.background) parts.push(`background-color:${p.background}`);
  return parts.join(';');
}

function diaryPendingActive() {
  return !!diaryPendingStyleText();
}

function diaryResetPending() {
  diaryPending = { bold: false, italic: false, deco: '', strikeThrough: false, color: '', background: '' };
  diaryPendingSpan = null;
}

function diaryCaretRange() {
  const el = diaryEl();
  if (!el) return null;
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return null;
  let range = null;
  if (sel.rangeCount) {
    const r = sel.getRangeAt(0);
    if (el.contains(r.commonAncestorContainer)) range = r.cloneRange();
  }
  if (!range && diaryRange && el.contains(diaryRange.commonAncestorContainer)) {
    range = diaryRange.cloneRange();
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  } else if (!range.collapsed) {
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

function diaryFindPendingSpanAt(node) {
  const root = diaryEl();
  for (let el = node && (node.nodeType === 1 ? node : node.parentElement); el && el !== root; el = el.parentElement) {
    if (el.tagName === 'SPAN' && el.getAttribute('data-rt-pending')) return el;
  }
  return null;
}

// 按当前待生效格式重建一个占位 span；已写字的旧 span 留在原处，
// 光标移到它后面再开新 span，避免新样式套在旧样式里面。
function diaryApplyPendingToCaret() {
  const range = diaryCaretRange();
  if (!range) return;
  diaryPendingAt = Date.now();
  const sel = window.getSelection();
  if (!sel) return;

  const old = diaryPendingSpan && diaryPendingSpan.isConnected ? diaryPendingSpan : null;
  if (old && old.contains(range.startContainer)) {
    const typed = (old.textContent || '').replace(/\u200B/g, '');
    if (typed) {
      const out = document.createRange();
      out.setStartAfter(old);
      out.collapse(true);
      sel.removeAllRanges();
      sel.addRange(out);
    } else {
      const before = document.createRange();
      before.setStartBefore(old);
      before.collapse(true);
      old.remove();
      sel.removeAllRanges();
      sel.addRange(before);
    }
  }
  // 顺手清掉其它空的待生效占位，别让零宽空格攒一堆
  document.querySelectorAll('#diaryText span[data-rt-pending]').forEach(el => {
    if (!(el.textContent || '').replace(/\u200B/g, '')) el.remove();
  });
  diaryPendingSpan = null;

  const style = diaryPendingStyleText();
  if (!style) return;
  const span = document.createElement('span');
  span.setAttribute('data-rt-pending', '1');
  span.setAttribute('style', style);
  span.appendChild(document.createTextNode('\u200B'));
  const live = window.getSelection();
  const caret = live.getRangeAt(0);
  caret.insertNode(span);
  const after = document.createRange();
  after.setStart(span.firstChild, 1);
  after.collapse(true);
  live.removeAllRanges();
  live.addRange(after);
  diaryPendingSpan = span;
  diaryRange = after.cloneRange();
}

function diaryStripPendingZwsp() {
  const span = diaryPendingSpan;
  if (!span || !span.isConnected) return;
  const t = span.firstChild;
  if (t && t.nodeType === 3 && t.data.charCodeAt(0) === 0x200B) {
    t.deleteData(0, 1);
    diaryRange = null;
  }
}

function diaryMaybeClearPending() {
  if (!diaryPendingActive()) return;
  const el = diaryEl();
  if (!el) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return; // 点工具栏/面板，不算离开
  if ((el.textContent || '').replace(/\u200B/g, '').trim() === '') return;
  if (diaryPendingSpan && diaryPendingSpan.isConnected && diaryPendingSpan.contains(r.startContainer)) return;
  if (Date.now() - diaryPendingAt < 600) return;
  diaryResetPending();
  syncDiaryToolbar();
}

function diarySelectedTextNodes(range, root) {
  const nodes = [];
  if (!range || !root) return nodes;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.data || !node.data.length) continue;
    try {
      if (range.intersectsNode(node)) nodes.push(node);
    } catch (_) {}
  }
  return nodes;
}

// 下划线状态必须往祖先找：text-decoration 不会继承到子元素的 computed style，
// 只看文本父节点会把 <u><span>文字</span></u> 里的字判成“没线”，这也是点线/实线反复叠加的根因。
function diaryLineStateAt(node, root) {
  let solid = false;
  let dotted = false;
  for (let el = node && node.nodeType === 3 ? node.parentElement : node; el && el !== root; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const line = cs.textDecorationLine || cs.textDecoration || '';
    if (!/underline/.test(line)) continue;
    if (/dotted/.test(cs.textDecorationStyle || line)) dotted = true;
    else solid = true;
  }
  return { solid, dotted };
}

function diarySelectionLineState() {
  const root = diaryEl();
  const sel = window.getSelection();
  if (!root || !sel || !sel.rangeCount) return { solid: false, dotted: false, count: 0 };
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return { solid: false, dotted: false, count: 0 };
  const nodes = diarySelectedTextNodes(range, root);
  if (!nodes.length) {
    const node = range.startContainer;
    const parent = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!parent || !root.contains(parent)) return { solid: false, dotted: false, count: 0 };
    return Object.assign({}, diaryLineStateAt(parent, root), { count: 1 });
  }
  let solid = true;
  let dotted = true;
  for (const node of nodes) {
    const st = diaryLineStateAt(node, root);
    solid = solid && st.solid;
    dotted = dotted && st.dotted;
  }
  return { solid, dotted, count: nodes.length };
}

// 光标落在某个格式块里时，取这个格式块，供“点一下就能改”使用。
function diaryRunElementAt(node, prop, root) {
  for (let el = node && node.nodeType === 3 ? node.parentElement : node; el && el !== root; el = el.parentElement) {
    if (!el.tagName) continue;
    const tag = el.tagName.toLowerCase();
    if (prop === 'bold' && (tag === 'b' || tag === 'strong')) return el;
    if (prop === 'italic' && (tag === 'i' || tag === 'em')) return el;
    if (prop === 'deco' && tag === 'u') return el;
    const st = el.style;
    if (!st) continue;
    if (prop === 'color' && (st.color || (tag === 'font' && el.getAttribute('color')))) return el;
    if (prop === 'highlight' && st.backgroundColor && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(st.backgroundColor)) return el;
    if (prop === 'deco' && /underline/.test(st.textDecorationLine || st.textDecoration || '')) return el;
    if (prop === 'bold' && /^(bold|[6-9]00)$/.test(st.fontWeight)) return el;
    if (prop === 'italic' && /italic|oblique/.test(st.fontStyle)) return el;
  }
  return null;
}

function diarySelectTextIn(el) {
  if (!el) return false;
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data && node.data.trim()) nodes.push(node);
  }
  if (!nodes.length) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  range.setStart(nodes[0], 0);
  range.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].data.length);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function diarySelectWordAt(range) {
  const node = range && range.startContainer;
  if (!node || node.nodeType !== 3) return false;
  const text = node.data || '';
  if (!text || !text.replace(/\u200B/g, '').length) return false;
  const latin = ch => /[A-Za-z0-9_'\u2019-]/.test(ch);
  let s = Math.min(range.startOffset, text.length);
  let e = s;
  const at = s < text.length ? text[s] : text[s - 1] || '';
  if (at && latin(at)) {
    while (s > 0 && latin(text[s - 1])) s--;
    while (e < text.length && latin(text[e])) e++;
  } else {
    // 中文没有词边界，退回单字，避免一点就染一大片
    if (s >= text.length) s = Math.max(0, text.length - 1);
    e = Math.min(text.length, s + 1);
  }
  if (e <= s) return false;
  range.setStart(node, s);
  range.setEnd(node, e);
  return true;
}

// 统一入口：有选区用选区；只有光标时扩到所在格式块，没格式块就扩到词/单字。
function diaryEnsureTargetRange(prop) {
  const rootEl = diaryEl();
  if (!rootEl) return null;
  const current = window.getSelection();
  const inEditor = current && current.rangeCount
    && rootEl.contains(current.getRangeAt(0).commonAncestorContainer);
  const saved = diaryRange && rootEl.contains(diaryRange.commonAncestorContainer);
  // 既没点进正文、也没有备份选区时，不要自作主张去改最后一个字
  if (!inEditor && !saved) return null;
  const sel = restoreDiaryRange();
  if (!sel || !sel.rangeCount) return null;
  const root = rootEl;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  if (!range.collapsed) return sel;

  let node = range.startContainer;
  if (node.nodeType === 1) {
    const kids = node.childNodes;
    let probe = kids[Math.min(range.startOffset, Math.max(0, kids.length - 1))];
    while (probe && probe.nodeType !== 3) probe = probe.firstChild || probe.nextSibling;
    node = probe || node;
  }
  const run = node && node.nodeType === 3 ? diaryRunElementAt(node, prop, root) : null;
  let ok = false;
  if (run) ok = diarySelectTextIn(run);
  if (!ok) {
    sel.removeAllRanges();
    sel.addRange(range);
    ok = diarySelectWordAt(range);
    if (ok) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  if (!ok) return null;
  diaryRange = sel.getRangeAt(0).cloneRange();
  return sel;
}

// 把选中内容拆出来、清掉旧样式、再按新样式包回去。
// 这种方式不会把新样式套在旧标签里面，实线/点线、颜色反复切换才不会越叠越乱。
function diaryCleanFragment(frag, stripProps, unwrapTags) {
  const tags = unwrapTags || [];
  const els = [...frag.querySelectorAll('*')].reverse();
  for (const el of els) {
    if (!el.parentNode) continue;
    if (stripProps && el.style) stripProps.forEach(p => el.style.removeProperty(p));
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'font' && tags.includes('font')) el.removeAttribute('color');
    const bare = !el.getAttribute('style') && !el.getAttribute('class') && !el.getAttribute('color');
    if (tags.includes(tag) && bare) unwrapDiaryNode(el);
    else if (tag === 'span' && bare) unwrapDiaryNode(el);
  }
}

function diaryWrapFragmentText(frag, styleText) {
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data && node.data.length) nodes.push(node);
  }
  const wrapped = [];
  for (const node of nodes) {
    if (!node.parentNode) continue;
    const span = document.createElement('span');
    span.setAttribute('style', styleText);
    node.parentNode.insertBefore(span, node);
    span.appendChild(node);
    wrapped.push(span);
  }
  return wrapped;
}

function diaryPaintRange(styleText, stripProps, unwrapTags) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0).cloneRange();
  if (range.collapsed) return false;
  const frag = range.extractContents();
  if (!frag.firstChild) return false;
  diaryCleanFragment(frag, stripProps, unwrapTags);
  const wrapped = styleText ? diaryWrapFragmentText(frag, styleText) : [];
  const first = frag.firstChild;
  const last = frag.lastChild;
  range.insertNode(frag);
  const out = document.createRange();
  if (wrapped.length) {
    out.setStartBefore(wrapped[0]);
    out.setEndAfter(wrapped[wrapped.length - 1]);
  } else if (first && last) {
    out.setStartBefore(first);
    out.setEndAfter(last);
  } else {
    return false;
  }
  sel.removeAllRanges();
  sel.addRange(out);
  diaryRange = out.cloneRange();
  return true;
}

function diarySelectionStyles() {
  const root = diaryEl();
  const sel = window.getSelection();
  if (!root || !sel || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  const nodes = diarySelectedTextNodes(range, root);
  if (!nodes.length) {
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    return node && root.contains(node) ? [getComputedStyle(node)] : [];
  }
  return nodes.map(node => getComputedStyle(node.parentElement || node));
}

function diaryNormalizeColor(value) {
  const probe = document.createElement('span');
  probe.style.cssText = `display:none;color:${value};background-color:${value}`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  const bg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return { color, bg };
}

function diarySameColor(a, b) {
  if (!a || !b) return false;
  const ca = diaryNormalizeColor(a);
  const cb = diaryNormalizeColor(b);
  return ca.color === cb.color;
}

function diarySameBackground(a, b) {
  if (!a || !b) return false;
  return diaryNormalizeColor(a).bg === diaryNormalizeColor(b).bg;
}

function diaryIsDotted(style) {
  return /dotted/i.test(String(style.textDecorationStyle || style.textDecoration || ''));
}

function diaryHasLine(style, line) {
  const value = String(style.textDecorationLine || style.textDecoration || '');
  return new RegExp(`(^|\\s)${line}(\\s|$)`, 'i').test(value);
}

function syncDiaryToolbar() {
  const bar = document.getElementById('diaryToolbar');
  if (!bar) return;
  const styles = diarySelectionStyles();
  const liveSel = window.getSelection();
  const liveRoot = diaryEl();
  const inEditor = !!(liveSel && liveSel.rangeCount && liveRoot
    && liveRoot.contains(liveSel.getRangeAt(0).commonAncestorContainer));
  // 没焦点也没待生效格式时保留上一次状态，免得点工具栏时按钮闪灭
  if (!styles.length && !diaryPendingActive() && !inEditor) return;
  const every = (fn) => styles.length > 0 && styles.every(fn);
  let bold = every(s => parseInt(s.fontWeight, 10) >= 600) || (() => {
    try { return document.queryCommandState('bold'); } catch (_) { return false; }
  })();
  let italic = every(s => /italic|oblique/i.test(s.fontStyle)) || (() => {
    try { return document.queryCommandState('italic'); } catch (_) { return false; }
  })();
  const lineState = diarySelectionLineState();
  let underline = lineState.count > 0 && lineState.solid && !lineState.dotted;
  let dot = lineState.count > 0 && lineState.dotted && !lineState.solid;
  let strike = every(s => diaryHasLine(s, 'line-through')) || (() => {
    try { return document.queryCommandState('strikeThrough'); } catch (_) { return false; }
  })();
  // 待生效格式优先：点一下先亮，输入时按这个格式走
  if (diaryPending.bold) bold = true;
  if (diaryPending.italic) italic = true;
  if (diaryPending.strikeThrough) strike = true;
  if (diaryPending.deco === 'solid') { underline = true; dot = false; }
  else if (diaryPending.deco === 'dotted') { dot = true; underline = false; }
  const state = { bold, italic, underline, dot, strikeThrough: strike };
  bar.querySelectorAll('[data-cmd]').forEach(btn => {
    const on = !!state[btn.dataset.cmd];
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const root = diaryEl();
  const rootColor = root ? getComputedStyle(root).color : '';
  const color = styles.length ? styles[0].color : '';
  const sameColor = diaryPending.color
    ? true
    : (every(s => diarySameColor(s.color, color)) && !diarySameColor(color, rootColor));
  const textBtn = bar.querySelector('[data-pop="text"]');
  if (textBtn) {
    textBtn.classList.toggle('on', sameColor);
    textBtn.setAttribute('aria-pressed', sameColor ? 'true' : 'false');
    if (sameColor) textBtn.style.setProperty('--icon-color', diaryPending.color || color);
    else textBtn.style.setProperty('--icon-color', '#e5484d');
  }
  const bg = styles.length ? styles[0].backgroundColor : '';
  const rootBg = root ? getComputedStyle(root).backgroundColor : 'rgba(0,0,0,0)';
  const hasBg = !!bg && !diarySameColor(bg, 'rgba(0,0,0,0)') && !diarySameBackground(bg, rootBg);
  const sameBg = diaryPending.background
    ? true
    : (every(s => diarySameBackground(s.backgroundColor, bg)) && hasBg);
  const highBtn = bar.querySelector('[data-pop="highlight"]');
  if (highBtn) {
    highBtn.classList.toggle('on', sameBg);
    highBtn.setAttribute('aria-pressed', sameBg ? 'true' : 'false');
    if (sameBg) highBtn.style.setProperty('--icon-color', diaryPending.background || bg);
    else highBtn.style.setProperty('--icon-color', '#facc15');
  }
}

function hideDiaryPop() {
  document.querySelectorAll('.rt-pop[data-pop-panel]').forEach(p => { p.hidden = true; });
  document.querySelectorAll('[data-pop]').forEach(b => {
    b.classList.remove('open');
    b.setAttribute('aria-expanded', 'false');
  });
}

function wrapDiarySelection(styleText) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const span = document.createElement('span');
  span.setAttribute('style', styleText);
  try {
    range.surroundContents(span);
  } catch (_) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  return span;
}

function selectDiaryRangeContents(el) {
  if (!el) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  diaryRange = range.cloneRange();
}

const DIARY_CMD_STYLE = {
  bold: 'font-weight:700',
  italic: 'font-style:italic',
  underline: 'text-decoration-line:underline;text-decoration-style:solid',
  strikeThrough: 'text-decoration-line:line-through',
};

function diaryRangeContainsNode(range, node) {
  try {
    const r = document.createRange();
    r.selectNode(node);
    return range.compareBoundaryPoints(Range.START_TO_START, r) <= 0
      && range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
  } catch (_) {
    return false;
  }
}

function diaryCmdActive(cmd) {
  const styles = diarySelectionStyles();
  if (!styles.length) return false;
  if (cmd === 'bold') return styles.every(s => parseInt(s.fontWeight, 10) >= 600);
  if (cmd === 'italic') return styles.every(s => /italic|oblique/i.test(s.fontStyle));
  if (cmd === 'underline') return styles.every(s => diaryHasLine(s, 'underline') && !diaryIsDotted(s));
  if (cmd === 'strikeThrough') return styles.every(s => diaryHasLine(s, 'line-through'));
  return false;
}

function diaryForceOffCmd(cmd, range, root) {
  const tags = {
    bold: ['b', 'strong'],
    italic: ['i', 'em'],
    underline: ['u'],
    strikeThrough: ['s', 'strike', 'del'],
  }[cmd] || [];
  const elements = [...root.querySelectorAll('*')].filter(el => {
    try { return range.intersectsNode(el); } catch (_) { return false; }
  });
  for (const el of elements) {
    if (!el.isConnected || !root.contains(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tags.includes(tag)) {
      // 只拆整段落在选区内的标签，避免误伤旁边没选中的文字
      if (diaryRangeContainsNode(range, el)) unwrapDiaryNode(el);
      continue;
    }
    if (!el.style) continue;
    const remove = () => {
      if (cmd === 'bold') el.style.removeProperty('font-weight');
      if (cmd === 'italic') el.style.removeProperty('font-style');
      if (cmd === 'underline' || cmd === 'strikeThrough') {
        el.style.removeProperty('text-decoration');
        el.style.removeProperty('text-decoration-line');
        el.style.removeProperty('text-decoration-style');
      }
    };
    if (diaryRangeContainsNode(range, el)) {
      remove();
      if (!el.getAttribute('style') && !el.getAttribute('class')) unwrapDiaryNode(el);
    }
  }
  // 选区被一个更大的已格式化标签包住时，用显式反向样式盖掉
  if (diaryCmdActive(cmd)) {
    const sel = window.getSelection();
    if (!sel) return;
    try { sel.removeAllRanges(); sel.addRange(range); } catch (_) { return; }
    const cancel = {
      bold: 'font-weight:400',
      italic: 'font-style:normal',
      underline: 'text-decoration-line:none;display:inline-block',
      strikeThrough: 'text-decoration-line:none;display:inline-block',
    }[cmd];
    const span = wrapDiarySelection(cancel);
    if (span) selectDiaryRangeContents(span);
  }
}

function applyDiaryCmd(cmd) {
  if (cmd === 'underline') { diaryApplyDeco('solid'); return; }
  if (cmd === 'dot') { diaryApplyDeco('dotted'); return; }
  // 待生效状态：再点一次就灭，不碰正文
  if (diaryPending[cmd]) {
    diaryPending[cmd] = false;
    diaryApplyPendingToCaret();
    syncDiaryToolbar();
    return;
  }
  const sel = diaryEnsureTargetRange(cmd);
  if (!sel) {
    // 空正文/空行：先把按钮点亮，等输入时按这个格式走
    diaryPending[cmd] = true;
    diaryApplyPendingToCaret();
    syncDiaryToolbar();
    return;
  }
  const root = diaryEl();
  const before = sel.getRangeAt(0).cloneRange();
  if (diaryCmdActive(cmd)) {
    // 二点取消：不依赖 WebView 的 execCommand 状态，直接改 DOM
    diaryForceOffCmd(cmd, before, root);
    try { sel.removeAllRanges(); sel.addRange(before); } catch (_) {}
  } else {
    const span = wrapDiarySelection(DIARY_CMD_STYLE[cmd]);
    if (!span) { diaryNote('这段文字暂时没法改格式', true); return; }
    selectDiaryRangeContents(span);
  }
  rememberDiaryRange();
  syncDiaryToolbar();
}

function unwrapDiaryNode(node) {
  const parent = node && node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
  if (parent.normalize) parent.normalize();
}

const DIARY_DECO_CSS = {
  solid: 'text-decoration-line:underline;text-decoration-style:solid',
  dotted: 'text-decoration-line:underline;text-decoration-style:dotted',
};

function diaryApplyDeco(kind) {
  const now = window.getSelection();
  const rootNow = diaryEl();
  const hasSelection = !!(now && now.rangeCount && rootNow && !now.getRangeAt(0).collapsed
    && rootNow.contains(now.getRangeAt(0).commonAncestorContainer));
  // 正在用点线/实线打字：点同一种灭，点另一种换线型
  if (!hasSelection && diaryPending.deco) {
    diaryPending.deco = diaryPending.deco === kind ? '' : kind;
    diaryApplyPendingToCaret();
    syncDiaryToolbar();
    return;
  }
  if (!diaryEnsureTargetRange('deco')) {
    diaryPending.deco = kind;
    diaryApplyPendingToCaret();
    syncDiaryToolbar();
    return;
  }
  diaryPending.deco = '';
  const state = diarySelectionLineState();
  // 点线选中时按“实线”= 转成实线；实线选中时按“点线”= 转成点线，不再套娃。
  const target = kind === 'dotted'
    ? ((state.dotted && !state.solid) ? '' : DIARY_DECO_CSS.dotted)
    : ((state.solid && !state.dotted) ? '' : DIARY_DECO_CSS.solid);
  diaryPaintRange(target, ['text-decoration', 'text-decoration-line', 'text-decoration-style'], ['u']);
  rememberDiaryRange();
  syncDiaryToolbar();
}

function applyDiaryColor(value, highlight = false) {
  const sel = diaryEnsureTargetRange(highlight ? 'highlight' : 'color');
  if (!sel) {
    // 空正文/空行：先记成待生效颜色，输入时直接带上
    if (highlight) diaryPending.background = value === 'transparent' ? '' : value;
    else diaryPending.color = value === 'inherit' ? '' : value;
    diaryApplyPendingToCaret();
    hideDiaryPop();
    syncDiaryToolbar();
    return;
  }
  if (highlight) diaryPending.background = '';
  else diaryPending.color = '';
  const styles = diarySelectionStyles();
  if (!styles.length) { diaryNote('这段文字暂时没法上色', true); return; }
  const current = highlight ? styles[0].backgroundColor : styles[0].color;
  const allSame = styles.every(s => highlight
    ? diarySameBackground(s.backgroundColor, current)
    : diarySameColor(s.color, current));
  const isReset = value === 'inherit' || value === 'transparent';
  const clear = isReset || (allSame && (highlight
    ? diarySameBackground(current, value)
    : diarySameColor(current, value)));
  // 清字色时用编辑区字色兜底，避免外层 span 的颜色继续透过来；高亮直接剥掉背景。
  const styleText = highlight
    ? (clear ? '' : `background-color:${value}`)
    : `color:${clear ? 'var(--text)' : value}`;
  if (!diaryPaintRange(styleText, [highlight ? 'background-color' : 'color'], highlight ? [] : ['font'])) {
    diaryNote('这段文字暂时没法上色', true);
    return;
  }
  hideDiaryPop();
  rememberDiaryRange();
  syncDiaryToolbar();
}

function insertDiaryHtml(html) {
  const sel = restoreDiaryRange();
  if (!sel) return null;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const frag = tpl.content;
  const first = frag.firstChild;
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  rememberDiaryRange();
  return first && first.nodeType === 1 ? first : null;
}

function diaryMediaImage(box) {
  return box && box.querySelector ? box.querySelector('img') : null;
}

function diaryMediaMode(box) {
  const float = String(box && box.style.float || '').toLowerCase();
  if (float === 'left' || float === 'right') return float;
  const display = String(box && box.style.display || '').toLowerCase();
  if (display === 'inline-block') return 'inline';
  return 'center';
}

function diaryMediaPct(box, img) {
  return Math.round(parseFloat(box && box.style.width) || parseFloat(img && img.style.width) || 45);
}

function applyDiaryMediaLayout(box, mode) {
  if (!box) return;
  box.style.textAlign = '';
  box.style.float = 'none';
  box.style.display = 'block';
  box.style.verticalAlign = '';
  box.style.margin = '6px auto';
  box.style.clear = 'none';
  if (mode === 'left') {
    box.style.float = 'left';
    box.style.display = 'block';
    box.style.margin = '4px 10px 8px 0';
  } else if (mode === 'right') {
    box.style.float = 'right';
    box.style.display = 'block';
    box.style.margin = '4px 0 8px 10px';
  } else if (mode === 'inline') {
    box.style.display = 'inline-block';
    box.style.verticalAlign = 'top';
    box.style.margin = '4px 6px 6px 0';
  }
}

function clearDiaryMedia() {
  document.querySelectorAll('#diaryText .rt-media.selected').forEach(el => el.classList.remove('selected'));
  diarySelectedMedia = null;
  diaryMediaPicked = false;
  const bar = document.getElementById('diaryImgBar');
  if (bar) bar.hidden = true;
}

function selectDiaryMedia(box, notify = false, picked = true) {
  if (!box || !diaryEl()) return;
  document.querySelectorAll('#diaryText .rt-media.selected').forEach(el => {
    if (el !== box) el.classList.remove('selected');
  });
  diarySelectedMedia = box;
  diaryMediaPicked = !!picked;
  box.classList.add('selected');
  const bar = document.getElementById('diaryImgBar');
  if (!bar) return;
  bar.hidden = false;
  const img = diaryMediaImage(box);
  bar.classList.toggle('audio-only', !img);
  const label = bar.querySelector('.dib-label');
  if (label) label.textContent = img ? '图片' : '语音';
  const size = document.getElementById('diaryImgSize');
  const pct = img ? diaryMediaPct(box, img) : 0;
  if (size) size.textContent = img ? `${pct}%` : '';
  const range = document.getElementById('diaryImgRange');
  if (range && img) range.value = String(pct);
  if (img) {
    if (!box.style.width) box.style.width = `${pct}%`;
    if (!box.style.display && !box.style.float) applyDiaryMediaLayout(box, 'center');
    img.style.width = '100%';
    img.style.height = 'auto';
  }
  const mode = diaryMediaMode(box);
  bar.querySelectorAll('[data-img="left"],[data-img="center"],[data-img="right"],[data-img="inline"]').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.img === mode);
  });
  if (notify) diaryNote(img ? '拖滑杆无级调大小，左/右可让文字绕排' : '点语音可以删除');
}

function flashDiaryLimit(box) {
  if (!box) return;
  box.classList.remove('limit');
  void box.offsetWidth;
  box.classList.add('limit');
  setTimeout(() => box.classList.remove('limit'), 520);
}

function setDiaryMediaWidth(value) {
  const box = diarySelectedMedia;
  const img = diaryMediaImage(box);
  if (!img) return;
  const raw = Number(value);
  const next = Math.round(Math.max(20, Math.min(100, raw)));
  if (raw < 20 || raw > 100) flashDiaryLimit(box);
  box.style.width = `${next}%`;
  img.style.width = '100%';
  img.style.height = 'auto';
  const size = document.getElementById('diaryImgSize');
  if (size) size.textContent = `${next}%`;
  const range = document.getElementById('diaryImgRange');
  if (range) range.value = String(next);
}

function deleteDiaryMedia() {
  const box = diarySelectedMedia;
  if (!box) return;
  box.remove();
  clearDiaryMedia();
  diaryNote('已删除');
  syncDiaryToolbar();
}

function handleDiaryImgAction(action) {
  const box = diarySelectedMedia;
  if (!box) return;
  if (action === 'delete') { deleteDiaryMedia(); return; }
  if (action === 'left' || action === 'center' || action === 'right' || action === 'inline') {
    applyDiaryMediaLayout(box, action);
    const bar = document.getElementById('diaryImgBar');
    if (bar) {
      bar.querySelectorAll('[data-img="left"],[data-img="center"],[data-img="right"],[data-img="inline"]').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.img === action);
      });
    }
    diaryNote('');
  }
}

function readDiaryFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function diaryDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function diaryAudioHtml(url, duration = 0) {
  const bars = Array.from({ length: 22 }, () => '<i></i>').join('');
  return `<div class="rt-media rt-audio" contenteditable="false"><button type="button" class="rt-audio-play" aria-label="播放语音"></button><span class="rt-audio-wave" aria-hidden="true">${bars}</span><span class="rt-audio-dur">${diaryDuration(duration)}</span><audio preload="metadata" src="${diaryEscape(url)}"></audio></div>`;
}

function syncDiaryAudio(audio) {
  const card = audio && audio.closest ? audio.closest('.rt-audio') : null;
  if (!card) return;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  const label = card.querySelector('.rt-audio-dur');
  if (label && duration) label.textContent = diaryDuration(duration * 1000);
  const progress = duration ? Math.min(1, audio.currentTime / duration) : 0;
  card.querySelectorAll('.rt-audio-wave i').forEach((bar, i, all) => {
    bar.classList.toggle('on', i / all.length < progress);
  });
  card.classList.toggle('playing', !audio.paused && !audio.ended);
}

async function toggleDiaryAudio(button) {
  const card = button.closest('.rt-audio');
  const audio = card && card.querySelector('audio');
  if (!audio) return;
  if (audio.paused) {
    document.querySelectorAll('.rt-audio audio').forEach(other => {
      if (other !== audio) other.pause();
    });
    try { await audio.play(); } catch (_) {}
  } else {
    audio.pause();
  }
  syncDiaryAudio(audio);
}

function loadDiaryImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = src;
  });
}

async function diaryImageData(file) {
  const raw = await readDiaryFile(file);
  if (file.type === 'image/svg+xml' || file.size < 700 * 1024) return raw;
  const img = await loadDiaryImage(raw);
  // 截图/题目文字小，压缩太狠会被视觉模型判成“糊”；保留更高分辨率和质量
  const max = 2200;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

async function chatImageData(file) {
  const raw = await readDiaryFile(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return raw;
  const img = await loadDiaryImage(raw);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  // 截图/长图优先保宽度：只按最长边等比缩会把 1080 宽的长截图压成 300 多宽，字全糊。
  // 普通照片限宽 1440，长截图允许保留原宽，最多 12000 高。
  const scale = Math.min(1, 1440 / w, 12000 / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let q = 0.92;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > 5.8 * 1024 * 1024 && q > 0.6) {
    q -= 0.06;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > 6 * 1024 * 1024) throw new Error('图片太大了，换一张小一点的');
  return out;
}

async function uploadDiaryAsset(kind, data) {
  const r = await fetch('/api/asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: state.uid, kind, data }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok || !d.url) throw new Error(d.error || '上传失败');
  return d.url;
}

async function handleDiaryImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { diaryNote('只能插入图片文件', true); return; }
  diaryNote('图片处理中…');
  try {
    const data = await diaryImageData(file);
    if (data.length > 6 * 1024 * 1024) throw new Error('图片太大了，换一张小一点的');
    const url = await uploadDiaryAsset('img', data);
    let ai = '';
    try {
      diaryNote('AI 正在识别图片…');
      const r = await fetch('/api/image/describe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('minxtok.token') || ''),
        },
        body: JSON.stringify({ image: data }),
      });
      const d = await r.json().catch(() => ({}));
      ai = typeof d.text === 'string' ? d.text.trim() : '';
    } catch (_) {}
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // AI 识别结果只留在 alt 里供无障碍/搜索用，不再画在图片下面；
    // 图片靠左浮动，后面输入的文字会一直贴着图片右侧换行，不会掉到图片下面。
    const box = insertDiaryHtml(`<div class="rt-media" contenteditable="false" style="float:left;display:block;width:45%;margin:4px 10px 8px 0"><img src="${url}" alt="${esc((ai || '日记图片').slice(0, 300))}" loading="lazy" style="width:100%;height:auto"></div>&#8203;`);
    if (box) selectDiaryMedia(box, true, false);
    diaryNote('');
  } catch (e) {
    diaryNote(e.message || '图片插入失败', true);
  }
}

async function handleDiaryAudio(file) {
  if (!file) return;
  const audioExt = /\.(mp3|m4a|aac|wav|ogg|oga|opus|weba|webm|flac|amr|3gp|mp4|mpeg|mpga)$/i;
  const name = String(file.name || '');
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(name);
  if ((hasExt && !audioExt.test(name)) || /^video\//i.test(file.type || '')) {
    diaryNote('只支持录音文件（mp3、m4a、wav、ogg、webm 等）', true);
    return;
  }
  if (!/^audio\//i.test(file.type || '') && !audioExt.test(name)) {
    diaryNote('只支持录音文件（mp3、m4a、wav、ogg、webm 等）', true);
    return;
  }
  if (file.size > 12 * 1024 * 1024) { diaryNote('音频太大了，控制在 12MB 以内', true); return; }
  diaryNote('语音上传中…');
  try {
    const data = await readDiaryFile(file);
    const url = await uploadDiaryAsset('aud', data);
    const box = insertDiaryHtml(`${diaryAudioHtml(url)}<p><br></p>`);
    if (box) selectDiaryMedia(box, true, false);
    diaryNote('');
  } catch (e) {
    diaryNote(e.message || '语音插入失败', true);
  }
}

function diaryRecUi(on, busy = false) {
  const btn = document.querySelector('#diaryToolbar [data-action="voice"]');
  const time = document.getElementById('diaryRecTime');
  if (btn) {
    btn.classList.toggle('recording', !!on);
    btn.classList.toggle('busy', !!busy);
    btn.disabled = !!busy;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (time) time.hidden = !on;
}

function diaryStopStream() {
  if (diaryRecStream) {
    diaryRecStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
    diaryRecStream = null;
  }
  if (diaryRecTimer) { clearInterval(diaryRecTimer); diaryRecTimer = 0; }
}

function diaryCancelVoice() {
  if (diaryRec && diaryRec.state === 'recording') {
    diaryRec.onstop = null;
    try { diaryRec.stop(); } catch (_) {}
  }
  diaryRec = null;
  diaryVoiceBusy = false;
  diaryStopStream();
  diaryRecUi(false, false);
}

async function diaryToggleVoice() {
  if (diaryVoiceBusy) return;
  if (diaryRec && diaryRec.state === 'recording') {
    diaryVoiceBusy = true;
    diaryRecUi(false, true);
    try { diaryRec.stop(); } catch (_) { diaryVoiceBusy = false; diaryRecUi(false, false); }
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    const input = document.getElementById('diaryAudioInput');
    if (input) input.click();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mime = types.find(t => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(t)) || '';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    diaryRecStream = stream;
    diaryRecChunks = [];
    diaryRecStart = Date.now();
    rec.ondataavailable = e => { if (e.data && e.data.size) diaryRecChunks.push(e.data); };
    rec.onstop = async () => {
      const duration = Date.now() - diaryRecStart;
      diaryStopStream();
      diaryRec = null;
      diaryVoiceBusy = true;
      diaryRecUi(false, true);
      try {
        const blob = new Blob(diaryRecChunks, { type: rec.mimeType || 'audio/webm' });
        if (!blob.size) throw new Error('没有录到声音');
        if (blob.size > 12 * 1024 * 1024) throw new Error('语音太长了，控制在 12MB 以内');
        const data = await readDiaryFile(blob);
        const url = await uploadDiaryAsset('aud', data);
        const box = insertDiaryHtml(`${diaryAudioHtml(url, duration)}<p><br></p>`);
        if (box) selectDiaryMedia(box, true, false);
        diaryNote(duration < 1000 ? '录音有点短，已经放进日记了' : '');
      } catch (e) {
        diaryNote(e.message || '语音插入失败', true);
      } finally {
        diaryVoiceBusy = false;
        diaryRecUi(false, false);
      }
    };
    diaryRec = rec;
    rec.start(250);
    diaryRecUi(true);
    diaryNote('正在录音，再点一次结束');
    diaryRecTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - diaryRecStart) / 1000);
      const time = document.getElementById('diaryRecTime');
      if (time) time.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      if (sec >= 120 && diaryRec && diaryRec.state === 'recording') {
        diaryVoiceBusy = true;
        try { diaryRec.stop(); } catch (_) {}
      }
    }, 250);
  } catch (e) {
    diaryStopStream();
    diaryRec = null;
    diaryVoiceBusy = false;
    diaryRecUi(false, false);
    const name = String((e && e.name) || '');
    if (/NotAllowed|Permission|Security/i.test(name)) {
      diaryNoteAction('麦克风权限被拒绝了。可以点“重试”再授权；微信不再弹窗时，退出日记页重新进来。', '重试', () => diaryToggleVoice());
    } else if (/NotFound/i.test(name)) {
      diaryNote('没有找到麦克风，可以改用上传语音。', true);
    } else {
      diaryNote('麦克风没打开，稍后再试，或改用上传语音。', true);
    }
  }
}

async function openDiary() {
  diaryCancelVoice();
  diaryRange = null;
  diaryResetPending();
  diarySelectedMedia = null;
  openPage('日记', pageLoading('diary'), null, 'diary');
  try {
    const r = await fetch(`/api/diary?uid=${encodeURIComponent(state.uid)}`);
    const d = await r.json();
    renderDiaryPage(d.entries || []);
  } catch (_) {
    fillPage('<div style="padding:20px;color:var(--muted)">加载失败，稍后再试。</div>');
  }
}

function renderDiaryPage(entries) {
  const list = entries.length ? entries.map(e => `
    <article class="diary-card">
      <div class="diary-meta">${e.day} · ${diaryTime(e.created_at)}</div>
      <div class="diary-content">${e.content || ''}</div>
      ${e.comment ? `<div class="diary-comment"><div class="dc-who">${assistantName()}说</div><div class="dc-text">${diaryEscape(e.comment)}</div></div>` : ''}
    </article>`).join('') : '<div class="diary-empty">还没有日记，写下今天的第一句吧。</div>';

  fillPage(`
    <div class="diary-new">
      <div class="diary-new-head">${todayStr()} · 今天</div>
      ${diaryToolbarHtml()}
      ${diaryImgBarHtml()}
      <div id="diaryText" class="diary-editor" contenteditable="true" data-placeholder="今天想记点什么"></div>
      <button class="btn m-press" id="diarySave" style="width:100%;margin-top:12px">保存</button>
      <div id="diaryMsg" class="diary-msg"></div>
    </div>
    <div class="diary-list">${list}</div>`);
  requestAnimationFrame(() => {
    bindDiaryToolbar();
    syncDiaryToolbar();
  });
}

function bindDiaryToolbar() {
  const bar = document.getElementById('diaryToolbar');
  if (!bar) return;
  bar.querySelectorAll('[data-cmd]').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      // 直接绑到按钮上，避免微信里 pageBody 委托偶发收不到 click
      e.preventDefault();
      e.stopPropagation();
      hideDiaryPop();
      applyDiaryCmd(btn.dataset.cmd);
    });
  });
}

async function saveDiary() {
  const el = diaryEl();
  if (!el) return;
  if (diaryRec && diaryRec.state === 'recording') { diaryNote('先点“停”结束录音，再保存', true); return; }
  clearDiaryMedia();
  // 保存时把“选中/超限提醒”这类临时状态摘掉，别写进日记正文
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.rt-media').forEach(box => box.classList.remove('selected', 'limit'));
  clone.querySelectorAll('span[data-rt-pending]').forEach(span => {
    if (!(span.textContent || '').replace(/\u200B/g, '')) span.remove();
    else span.removeAttribute('data-rt-pending');
  });
  if ((clone.innerHTML || '').includes('\u200B')) clone.innerHTML = clone.innerHTML.replace(/\u200B/g, '');
  const content = (clone.innerHTML || '').trim();
  const plain = (el.textContent || '').replace(/\u200B/g, '').replace(/\u00a0/g, ' ').trim();
  const media = !!el.querySelector('img,audio');
  if (!plain && !media) { diaryNote('内容不能为空'); return; }
  diaryNote('保存中…');
  const r = await fetch('/api/diary', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: state.uid, day: todayStr(), content }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { diaryNote('保存失败', true); return; }
  const list = document.querySelector('.diary-list');
  const card = document.createElement('article');
  card.className = 'diary-card enter';
  card.innerHTML = `
    <div class="diary-meta">${todayStr()} · ${diaryTime(Date.now())}</div>
    <div class="diary-content"></div>
    <div class="diary-comment loading"><div class="dc-who">${assistantName()}说</div><div class="dc-body"><span class="m-thinking"><i></i><i></i><i></i></span></div></div>`;
  card.querySelector('.diary-content').innerHTML = content;
  if (list) list.prepend(card);
  el.innerHTML = '';
  diaryRange = null;
  diaryResetPending();
  diaryNote('');
  syncDiaryToolbar();
  toast('已保存');

  try {
    const cr = await fetch('/api/diary/comment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, day: todayStr(), content }),
    });
    const cd = await cr.json();
    const box = card.querySelector('.diary-comment');
    const body = card.querySelector('.dc-body');
    if (cd.comment && box && body) {
      box.classList.remove('loading');
      body.innerHTML = '';
      const text = document.createElement('div');
      text.className = 'dc-text reveal';
      text.textContent = cd.comment;
      body.appendChild(text);
    } else if (box) {
      box.remove();
    }
  } catch (_) {
    const box = card.querySelector('.diary-comment');
    if (box) box.remove();
  }
}

document.addEventListener('selectionchange', () => {
  if (!diaryEl()) return;
  rememberDiaryRange();
  syncDiaryToolbar();
  diaryMaybeClearPending();
});

const pageBodyEl = document.getElementById('pageBody');

pageBodyEl.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'diaryText') return;
  if (!e.isComposing) diaryStripPendingZwsp();
  if (e.inputType === 'insertParagraph' && diaryPendingActive()) {
    requestAnimationFrame(() => diaryApplyPendingToCaret());
  }
});

pageBodyEl.addEventListener('compositionend', (e) => {
  if (!e.target || e.target.id !== 'diaryText') return;
  setTimeout(diaryStripPendingZwsp, 0);
});

function holdDiarySelection(e) {
  // 触摸/鼠标按下时先把选区存下来；不要 preventDefault，
  // 微信 X5 里拦掉 mousedown 有时会连 click 一起吞掉，表现就是所有格式按钮都没反应。
  if (e.target.id === 'diaryImgRange') return;
  if (e.target.closest('.diary-toolbar, .rt-pop, #diaryImgBar')) {
    diaryToolbarHold = true;
    rememberDiaryRange();
  } else {
    // 只有用户重新点正文/空白处才解除保护，避免延迟的 selectionchange 把选区冲掉
    diaryToolbarHold = false;
  }
}

pageBodyEl.addEventListener('pointerdown', holdDiarySelection);
pageBodyEl.addEventListener('mousedown', holdDiarySelection);
pageBodyEl.addEventListener('touchstart', holdDiarySelection, { passive: true });

pageBodyEl.addEventListener('click', (e) => {
  const audioBtn = e.target.closest('.rt-audio-play');
  if (audioBtn) { toggleDiaryAudio(audioBtn); return; }

  const imgAct = e.target.closest('[data-img]');
  if (imgAct) { handleDiaryImgAction(imgAct.dataset.img); return; }

  const media = e.target.closest('#diaryText .rt-media');
  if (media) { selectDiaryMedia(media); return; }
  if (e.target.closest('#diaryText')) clearDiaryMedia();

  const popBtn = e.target.closest('[data-pop]');
  if (popBtn) {
    const pop = document.getElementById(popBtn.dataset.pop === 'highlight' ? 'diaryHighlightPop' : 'diaryTextPop');
    if (!pop) return;
    document.querySelectorAll('.rt-pop[data-pop-panel]').forEach(p => { if (p !== pop) p.hidden = true; });
    document.querySelectorAll('[data-pop]').forEach(b => {
      if (b !== popBtn) {
        b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
      }
    });
    const opening = pop.hidden;
    pop.hidden = !opening;
    popBtn.classList.toggle('open', opening);
    popBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      rememberDiaryRange();
      // 安卓的复制/粘贴浮层会盖住面板：先把可见选区收掉（选区已备份在 diaryRange），
      // 面板改成贴底的固定面板，避开浮层；点色块时再恢复选区上色。
      const pick = window.getSelection();
      if (pick && diaryRange && !diaryRange.collapsed) {
        try { pick.removeAllRanges(); } catch (_) {}
      }
    } else {
      restoreDiaryRange();
    }
    return;
  }
  const colorBtn = e.target.closest('[data-color]');
  if (colorBtn) { applyDiaryColor(colorBtn.dataset.color, false); return; }
  const hlBtn = e.target.closest('[data-highlight]');
  if (hlBtn) { applyDiaryColor(hlBtn.dataset.highlight, true); return; }
  const cmd = e.target.closest('[data-cmd]');
  if (cmd) { applyDiaryCmd(cmd.dataset.cmd); return; }
  const action = e.target.closest('[data-action]');
  if (action) {
    clearDiaryMedia();
    hideDiaryPop();
    const kind = action.dataset.action;
    if (kind === 'image') {
      restoreDiaryRange();
      const input = document.getElementById('diaryImageInput');
      try { window.__minxHoldViewport && window.__minxHoldViewport(); } catch (_) {}
      if (input) input.click();
    } else if (kind === 'voice') {
      diaryToggleVoice();
    } else if (kind === 'audioFile') {
      restoreDiaryRange();
      const input = document.getElementById('diaryAudioInput');
      try { window.__minxHoldViewport && window.__minxHoldViewport(); } catch (_) {}
      if (input) input.click();
    }
    return;
  }
  if (e.target.closest('#diarySave')) { saveDiary(); return; }
  if (!e.target.closest('.rt-pop')) hideDiaryPop();
  if (!e.target.closest('#diaryText, #diaryImgBar')) clearDiaryMedia();
});

pageBodyEl.addEventListener('play', (e) => {
  if (e.target.tagName === 'AUDIO') syncDiaryAudio(e.target);
}, true);
pageBodyEl.addEventListener('pause', (e) => {
  if (e.target.tagName === 'AUDIO') syncDiaryAudio(e.target);
}, true);
pageBodyEl.addEventListener('ended', (e) => {
  if (e.target.tagName === 'AUDIO') {
    e.target.currentTime = 0;
    syncDiaryAudio(e.target);
  }
}, true);
pageBodyEl.addEventListener('timeupdate', (e) => {
  if (e.target.tagName === 'AUDIO') syncDiaryAudio(e.target);
}, true);
pageBodyEl.addEventListener('loadedmetadata', (e) => {
  if (e.target.tagName === 'AUDIO') syncDiaryAudio(e.target);
}, true);

pageBodyEl.addEventListener('keydown', (e) => {
  if (!diarySelectedMedia) return;
  if (!diaryMediaPicked) { clearDiaryMedia(); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    deleteDiaryMedia();
  }
});

pageBodyEl.addEventListener('input', (e) => {
  if (e.target.id === 'diaryImgRange') {
    setDiaryMediaWidth(e.target.value);
    return;
  }
  if (diarySelectedMedia && e.target.closest && e.target.closest('#diaryText')) clearDiaryMedia();
});

pageBodyEl.addEventListener('change', (e) => {
  if (e.target.id === 'diaryImageInput') {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    handleDiaryImage(file);
  } else if (e.target.id === 'diaryAudioInput') {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    handleDiaryAudio(file);
  }
});

/* ---------- 设置页 / 关于页 ---------- *//* ---------- 设置页 / 关于页 ---------- */
function refreshQuota() {
  // 额度统一在「充值」页展示，设置页不再重复
  return fetch(`/api/status?uid=${encodeURIComponent(state.uid)}`).catch(() => {});
}

function seg(items, active) {
  return `<div class="seg">${items.map(([k, label]) =>
    `<button data-seg="${k}" class="${k === active ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function getFontSize() {
  return localStorage.getItem('minxtok.fs') || 'm';
}

function applyFontSize(v) {
  const val = ['s', 'm', 'l', 'xl'].includes(v) ? v : 'm';
  if (val === 'm') document.documentElement.removeAttribute('data-fs');
  else document.documentElement.setAttribute('data-fs', val);
  return val;
}

function getMathFont() {
  return localStorage.getItem('minxtok.mathfont') === 'sans' ? 'sans' : 'serif';
}

/* 化学式点词开关（明轩 2026-10-30：要在设置里能关） */
function getChemTap() {
  return localStorage.getItem('minxtok.chemtap') !== '0';
}
function getCsBlur() {
  return localStorage.getItem('minxtok.csblur') === '1';
}
function applyCsBlur() {
  document.body.classList.toggle('cs-blur', getCsBlur());
}
function applyChemTap() {
  document.body.classList.toggle('no-chemtap', !getChemTap());
}

function applyMathFont(v) {
  const val = v === 'sans' ? 'sans' : 'serif';
  document.documentElement.setAttribute('data-mathfont', val);
  return val;
}

function settingsPage() {
  const mode = getMode();
  const lang = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  const zh = lang === 'zh';
  const followups = localStorage.getItem('minxtok.followups') !== '0';
  const blur = localStorage.getItem('minxtok.blurAfterSend') !== '0';
  const haptics = isHapticsOn();
  const voiceAuto = localStorage.getItem('minxtok.voice.autosend') === '1';
  const fs = getFontSize();
  const mathfont = getMathFont();
  const dbgOn = localStorage.getItem('minxtok.debug') === '1';
  const fsName = { s: t('settings.fontsize.s'), m: t('settings.fontsize.m'), l: t('settings.fontsize.l'), xl: t('settings.fontsize.xl') }[fs] || '';
  return `
    <div class="group">
      <div class="group-title">${t('settings.appearance')}</div>
      <div class="panel">
        <div class="row">
          <div><div class="k">${t('settings.theme')}</div></div>
          ${seg([['auto', t('settings.theme.auto')], ['dark', t('settings.theme.dark')], ['light', t('settings.theme.light')]], mode)}
        </div>
        <div class="row">
          <div><div class="k">${t('settings.language')}</div></div>
          ${seg([['zh', '中文'], ['en', 'English']], lang)}
        </div>
        <div class="row">
          <div><div class="k">${t('settings.fontsize')}</div></div>
          <div class="v">${fsName}</div>
        </div>
        <div class="row row-seg">
          ${seg([['s', t('settings.fontsize.s')], ['m', t('settings.fontsize.m')], ['l', t('settings.fontsize.l')], ['xl', t('settings.fontsize.xl')]], fs).replace('<div class="seg">', '<div class="seg fs-seg" data-seg-group="fs">')}
        </div>
        <div class="row row-seg">
          <div class="fs-preview" id="fsPreview">${t('settings.fontsize.sample')}</div>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.mathfont')}</div><div class="sub">${t('settings.mathfont.sub')}</div></div>
          <div class="switch ${mathfont === 'serif' ? 'on' : ''}" data-toggle="mathfont" role="switch" aria-checked="${mathfont === 'serif' ? 'true' : 'false'}" aria-label="${t('settings.mathfont')}"></div>
        </div>
      </div>
    </div>
    <div class="group">
      <div class="group-title">${zh ? '聊天与交互' : 'Chat & interaction'}</div>
      <div class="panel">
        <div class="row">
          <div><div class="k">${t('settings.followups')}</div><div class="sub">${t('settings.followups.sub')}</div></div>
          <div class="switch ${followups ? 'on' : ''}" data-toggle="followups"></div>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.blur')}</div><div class="sub">${t('settings.blur.sub')}</div></div>
          <div class="switch ${blur ? 'on' : ''}" data-toggle="blur"></div>
        </div>
        <div class="row">
          <div><div class="k">${zh ? '抽屉背景模糊' : 'Blur behind sheets'}</div><div class="sub">${zh ? '点点词或情绪详情时，背后整屏做磨砂处理；默认不模糊，看着更通透' : 'Frost the page behind formula and emotion sheets. Off by default'}</div></div>
          <div class="switch ${getCsBlur() ? 'on' : ''}" data-toggle="csblur"></div>
        </div>
        <div class="row">
          <div><div class="k">${zh ? '化学式点词' : 'Formula lookup'}</div><div class="sub">${zh ? '点消息里的化学式就能查性质和化合价；关掉之后化学式只是文字' : 'Tap a formula to see its properties and valences; turn off to make formulas plain text'}</div></div>
          <div class="switch ${getChemTap() ? 'on' : ''}" data-toggle="chemtap"></div>
        </div>
        <div class="row">
          <div><div class="k">${zh ? '语音输入后自动发送' : 'Auto-send after voice'}</div><div class="sub">${zh ? '长按说话转成文字后直接发出去，不用再点发送' : 'Send as soon as the recording is transcribed'}</div></div>
          <div class="switch ${voiceAuto ? 'on' : ''}" data-toggle="voicesend"></div>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.haptics')}</div><div class="sub">${t('settings.haptics.sub')}</div></div>
          <div class="row-right">
            <button class="btn ghost m-press" id="btnHapticTest">${t('settings.haptics.test.btn')}</button>
            <div class="switch ${haptics ? 'on' : ''}" data-toggle="haptics"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="group">
      <div class="group-title">${t('settings.account')}</div>
      <div class="panel">
        <div class="row"><div class="k">${t('settings.account.id')}</div><div class="v">${localStorage.getItem('minxtok.email') || '—'}</div></div>
        <div class="row">
          <div><div class="k">${zh ? '重新填写引导' : 'Edit onboarding'}</div><div class="sub">${zh ? '保留现有资料，改称呼、生日和兴趣' : 'Keep your data and change your name, birthday or interests'}</div></div>
          <button class="btn ghost m-press" id="btnOnboarding">${zh ? '打开' : 'Open'}</button>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.clear')}</div><div class="sub">${t('settings.clear.sub')}</div></div>
          <button class="btn ghost m-press" id="btnClear">${t('settings.clear')}</button>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.account.logout')}</div><div class="sub">${t('settings.account.logout.sub')}</div></div>
          <button class="btn ghost m-press" id="btnLogout">${t('settings.account.logout')}</button>
        </div>
        <div class="row"><div class="k">${t('settings.model')}</div><div class="v" id="modelValue">${state.model || '—'}</div></div>
      </div>
    </div>
    <div class="group">
      <div class="group-title">${t('settings.support')}</div>
      <div class="panel">
        <div class="row">
          <div><div class="k">${t('settings.changelog')}</div><div class="sub">${t('settings.changelog.sub')}</div></div>
          <button class="btn ghost m-press" id="btnChangelog">${t('settings.view')}</button>
        </div>
        <div class="row">
          <div><div class="k">${t('settings.feedback')}</div><div class="sub">${t('settings.feedback.sub')}</div></div>
          <button class="btn ghost m-press" id="btnFeedback">${t('settings.feedback.btn')}</button>
        </div>
      </div>
    </div>
    <div class="group">
      <div class="group-title">${zh ? '调试' : 'Debug'}</div>
      <div class="panel">
        <div class="row">
          <div><div class="k">${zh ? '悬浮参数窗' : 'Metrics overlay'}</div><div class="sub">${zh ? '把视口、滚动、顶栏和输入区实时数据浮在页面上，可拖动，可复制' : 'Live viewport, scroll, app bar and composer metrics in a draggable panel'}</div></div>
          <div class="switch ${dbgOn ? 'on' : ''}" data-toggle="debug"></div>
        </div>
      </div>
    </div>`;
}

function openSettings() {
  openPage(t('modal.settings'), settingsPage(), null, 'settings');
}

// 清除本机数据：先确认，再校验登录密码，避免误触
function openClearDataDialog() {
  const zh = getLang() === 'zh';
  openModal({
    title: zh ? '清除本机数据' : 'Clear local data',
    body: `
      <div class="clear-dialog">
        <p class="clear-lead">${zh
          ? '只会清掉这台设备上的会话编号和本机设置，服务端的聊天记录不会被删除。清除后页面会刷新。'
          : 'This only clears the conversation id and local settings on this device. Server-side chat history is not deleted. The page will reload afterwards.'}</p>
        <label class="clear-label" for="clearPwd">${zh ? '输入登录密码确认' : 'Enter your password to confirm'}</label>
        <input id="clearPwd" class="auth-input" type="password" autocomplete="current-password" placeholder="${zh ? '登录密码' : 'Password'}">
        <div class="clear-err" id="clearErr"></div>
        <div class="modal-actions">
          <button class="btn ghost m-press" id="clearCancel" type="button">${zh ? '取消' : 'Cancel'}</button>
          <button class="btn danger m-press" id="clearConfirm" type="button">${zh ? '确认清除' : 'Clear'}</button>
        </div>
      </div>`
  });
  const pwd = document.getElementById('clearPwd');
  const err = document.getElementById('clearErr');
  const btn = document.getElementById('clearConfirm');
  const fail = (msg) => { err.textContent = msg; try { pwd.focus(); } catch (_) {} };
  document.getElementById('clearCancel').addEventListener('click', closeModal);
  const submit = async () => {
    if (btn.disabled) return;
    if (!pwd.value) { fail(zh ? '请输入登录密码' : 'Enter your password'); return; }
    const token = localStorage.getItem('minxtok.token');
    if (!token) { fail(zh ? '请先登录再清除本机数据' : 'Sign in first'); return; }
    btn.disabled = true;
    err.textContent = '';
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ password: pwd.value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        btn.disabled = false;
        fail(d.error === 'no_password'
          ? (zh ? '这个账号没有可用密码，无法执行' : 'This account has no password')
          : (zh ? '密码不对，没有清除' : 'Wrong password. Nothing was cleared.'));
        return;
      }
      ['minxtok.conv', 'minxtok.uid'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      closeModal();
      toast(zh ? '已清除本机数据，正在刷新' : 'Cleared. Reloading.');
      setTimeout(() => location.reload(), 600);
    } catch (_) {
      btn.disabled = false;
      fail(zh ? '网络不稳，稍后再试' : 'Network error. Try again.');
    }
  };
  btn.addEventListener('click', submit);
  pwd.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  setTimeout(() => { try { pwd.focus(); } catch (_) {} }, 60);
}

function appVersion() {
  return (typeof CHANGELOG !== 'undefined' && CHANGELOG[0] && CHANGELOG[0].ver) || '3.0.0';
}

function aboutPage() {
  const lang = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  const zh = lang === 'zh';
  const ver = appVersion();
  const services = [
    ['Cloudflare', zh ? 'Pages · Workers · D1 · KV' : 'Pages · Workers · D1 · KV', 'https://www.cloudflare.com/'],
    ['Cloudflare Workers AI', zh ? 'Whisper 语音转文字' : 'Whisper speech-to-text', 'https://developers.cloudflare.com/workers-ai/'],
    ['DeepSeek', zh ? '对话、推理与视觉理解' : 'Chat, reasoning and vision', 'https://www.deepseek.com/'],
    [zh ? '阿里云' : 'Aliyun', zh ? '号码认证 · 短信验证码' : 'Phone auth · SMS codes', 'https://www.aliyun.com/product/dypns'],
    ['ZAKER', zh ? '新闻热榜' : 'News feed', 'https://www.myzaker.com/'],
    [zh ? '和风天气 QWeather' : 'QWeather', zh ? '天气、降水与生活指数' : 'Weather, precipitation and indices', 'https://www.qweather.com/'],
    [zh ? 'QQ 音乐' : 'QQ Music', zh ? '歌曲检索、封面与跳转（非官方接口）' : 'Song search, covers and links (unofficial endpoint)', 'https://y.qq.com/'],
    [zh ? '百度千帆' : 'Baidu Qianfan', zh ? '联网搜索' : 'Web search', 'https://qianfan.cloud.baidu.com/'],
    [zh ? '有道词典' : 'Youdao Dictionary', zh ? '单词释义与发音' : 'Definitions and pronunciation', 'https://dict.youdao.com/'],
    ['OCR.space', zh ? '图片文字识别' : 'Image text recognition', 'https://ocr.space/'],
  ];
  const sources = [
    ['Node.js', zh ? 'MIT · 构建与本地脚本' : 'MIT · build and local scripts', 'https://nodejs.org/'],
    ['Noto Serif / Noto Serif SC', zh ? 'SIL OFL 1.1 · 数学公式回退字体' : 'SIL OFL 1.1 · math fallback fonts', 'https://fonts.google.com/noto'],
    ['Apple Color Emoji', zh ? '© Apple Inc. · 本地 emoji 图源' : '© Apple Inc. · local emoji artwork', 'https://www.apple.com/'],
    [zh ? 'PingFang SC / MinxTok Sans' : 'PingFang SC / MinxTok Sans', zh ? '© Apple Inc. · 界面字体' : '© Apple Inc. · UI font', 'https://www.apple.com/'],
    [zh ? '本站图标' : 'Site icons', zh ? '自绘 SVG 线稿' : 'Hand-drawn SVG line icons', ''],
  ];
  const creditRows = (list) => list.map(([name, desc, href]) => `
        <div class="row about-credit">
          <div class="k">${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${name}</a>` : name}</div>
          <div class="v">${desc}</div>
        </div>`).join('');
  return `
    <div class="about-hero">
      <div class="name">MinxTok</div>
      <div class="ver">${zh ? '明叙' : 'Mingxu'} · v${ver}</div>
    </div>
    <p class="about-p">${t('about.intro')}</p>
    <div class="group">
      <div class="group-title">${t('about.credits')}</div>
      <p class="about-p about-note">${t('about.credits.note')}</p>
      <div class="panel">${creditRows(services)}</div>
    </div>
    <div class="group">
      <div class="group-title">${t('about.sources')}</div>
      <p class="about-p about-note">${t('about.sources.note')}</p>
      <div class="panel">${creditRows(sources)}</div>
    </div>
    <div class="group">
      <div class="group-title">${t('about.privacy')}</div>
      <p class="about-p">${t('about.privacy.text')}</p>
      <p class="about-p">${t('about.privacy.search')}</p>
    </div>
    <div class="group">
      <div class="group-title">${t('about.repo')}</div>
      <div class="panel">
        <div class="row"><div class="k">GitHub</div><div class="v">JMX-manager/MinxTok</div></div>
      </div>
    </div>`;
}

/* ---------- 更新日志 ---------- */
const CHANGELOG = [
  {
    ver: '6.2.0',
    date: '2026-10-30',
    zh: [
      '情绪中心不再乱跳：只统计你自己说的话，样本少的时候按十二次算，一条困惑不会再顶成百分之百；建议文案也不再每说一句话就重写',
      '化学式补了一批：氢氧化亚铁、四氧化三铁、胆矾、明矾、尿素、重铬酸钾这些常见式子现在点开就有',
      '化学式抽屉的等待改成跟思考动画同一套：文字在前、三个点在后面走，文案后面不再缀省略号',
      '自己这侧的聊天气泡改成纯灰色，去掉了原来那点偏紫的蓝',
    ],
    en: [
      'The emotion centre no longer jumps around: only your own messages count, and small samples are scaled to twelve so a single confused message cannot read as 100 percent; the written note is no longer rewritten on every message',
      'More formulas in the quick table: iron(II) hydroxide, iron(II,III) oxide, blue vitriol, alum, urea and potassium dichromate all open right away now',
      'The formula drawer now waits with the same animation as thinking: label first, dots after, no trailing ellipsis',
      'Your own bubbles are plain grey now, without the faint blue-purple cast',
    ],
  },
  {
    ver: '6.1.4',
    date: '2026-10-30',
    zh: [
      '主聊天改成匀速显字：模型吐得再快也是一小批一小批往外走，生成完了还会把剩下的演完，看得见也跟得上',
      '方程式里的化学式也画上点线了，不再只有单独一个物质才提示',
    ],
    en: [
      'Replies now reveal at a steady pace: fast chunks still come out in small batches, and whatever is left plays out after generation finishes',
      'Formulas inside equations get the dotted hint too, not just stand-alone substances',
    ],
  },
  {
    ver: '6.1.3',
    date: '2026-10-30',
    zh: [
      '文字浮现改成分组出现，节点数封顶，情绪中心点开不再卡；动画只动透明度，更跟手',
      '主聊天流式输出也接上了浮现：新到的字一批批亮起来，已经显示的字不会重播',
    ],
    en: [
      'Text reveal now comes in groups with a capped node count, so opening an emotion no longer stutters; it animates opacity only',
      'Streaming replies in the main chat now reveal the same way, new chunks fade in without replaying older text',
    ],
  },
  {
    ver: '6.1.2',
    date: '2026-10-30',
    zh: [
      '情绪文案回到三段话的长度，不再硬拉长；文字改成一个个浮现，看得见它在出现',
      '情绪详情本地留一份，同一情绪再点开是瞬开，其余几条在后台顺手备好',
      '二价铁、三价铁、硫酸根这些离子都能查了，速查表里补了二十多个常见离子',
      'Fe²⁺ 这种上标写法也能认，不用非写成 Fe2+',
      '设置里新增「化学式点词」开关，关掉之后化学式就只是文字，不画点线也不响应点击',
    ],
    en: [
      'Emotion notes are back to three lines, and the text now appears character by character',
      'Emotion details are kept locally, so reopening one is instant and the rest are warmed up in the background',
      'Ions work now: Fe²⁺, Fe³⁺, SO₄²⁻ and twenty more are in the quick table',
      'Superscript formulas like Fe²⁺ are accepted, no need to type Fe2+',
      'New setting to switch formula lookup off, leaving formulas as plain text',
    ],
  },
  {
    ver: '6.1.1',
    date: '2026-10-30',
    zh: [
      '情绪详情多写一倍：两段、五六句，第一段讲这种情绪从哪来，第二段讲怎么和它相处',
      '能点的化学式带一条虚点线，后缀「粉末/溶液」连在一起也有，一眼知道点得动',
      '价态胶囊里的原子团也排下标了：SO₄、MnO₄、CO₃ 不再露出平数字',
      '查不到时 backend 会自己再问一次，登录过期也会直接说刷新，不再让你瞎点重试',
    ],
    en: [
      'Emotion notes are twice as long: two paragraphs, the first on where the feeling comes from, the second on living with it',
      'Tappable formulas get a dotted underline, suffix included, so it reads as tappable',
      'Ions in the valence chips are subscripted now: SO4 renders as SO₄',
      'A failed lookup retries once on the server, and an expired session says so instead of asking you to tap again',
    ],
  },
  {
    ver: '6.1.0',
    date: '2026-10-30',
    zh: [
      '点化学式改成从底部升起的卡片：底下有一条点线，往下拖就收起',
      '卡片里能装下全部内容，还能自己上下滑，不会再被裁掉半截',
      '查的时候顺手把化合价列出来：每个元素、原子团各是几价',
      '标题只写一遍：物质名和式子一样时，不再把式子重复一次',
      '点开就弹，内容一条条淡入；查不到也不闷着，原地给你一个重试',
      '化学式后面的「溶液/气体/粉末/晶体」现在到处都认，聊天、历史、学习中心一致',
      '情绪中心的文字和色块会一条条进场，不再整屏硬切',
    ],
    en: [
      'Tapping a formula now opens a card from the bottom, with a grip you can drag down to dismiss',
      'The card fits everything and scrolls on its own, so nothing gets cut off',
      'Valences are listed right in the card: what each element and ion is worth',
      'The heading says it once: a formula that is also the name no longer repeats',
      'It opens instantly with the lines fading in one by one, and offers a retry if the lookup fails',
      'State words after a formula (solution, gas, powder, crystal) are recognised everywhere now',
      'The emotion centre fades its lines and tiles in instead of swapping the whole screen',
    ],
  },
  {
    ver: '6.0.7',
    date: '2026-10-30',
    zh: [
      '排版学会看场合了：天气里的气温、风力、湿度按正文排，不再排成公式',
      '题里的物理量整块进公式：2 L、3 m/s、0.5 g/cm³ 不再一半衬线一半黑体',
      '第几秒这类时间点，数字统一排成公式，汉字仍是正文',
      '语音不会再吐一串外语乱码：听不懂就说没听清，请你重说一遍',
      '语音纠错只改错字，模型要是自己另写一句就不采纳',
    ],
    en: [
      'Typesetting now reads the scene: temperatures, wind and humidity in weather replies stay in body text',
      'Physical quantities in questions are set as one block: 2 L, 3 m/s, 0.5 g/cm³ no longer split in half',
      'Second markers like “the 3rd second” get a typeset number while the Chinese stays in body text',
      'Speech input no longer dumps gibberish in another language: if it cannot hear you it asks you to repeat',
      'Transcript fixing only corrects wrong characters, and gives up if the model rewrites the sentence',
    ],
  },
  {
    ver: '6.0.6',
    date: '2026-10-29',
    zh: [
      '情绪中心不再等模型：先秒出统计，那两句话在后台写好，下次打开就是新的',
      '情绪中心不会再卡在灰骨架：没数据、出错都直说，还给一个刷新按钮',
      '主情绪的详情在你打开页面时就悄悄取好了，点进去是秒开',
      '没有逐条打标签的老数据也照常统计，不用再等模型数一遍',
    ],
    en: [
      'The emotion centre no longer waits for the model: stats come back instantly and the closing lines are written in the background',
      'It no longer hangs on a grey skeleton: empty and failed states say so, with a refresh button',
      'The main emotion detail is prefetched when the page opens, so tapping it is instant',
      'Older data without per-message tags is counted locally instead of waiting on the model',
    ],
  },
  {
    ver: '6.0.5',
    date: '2026-10-29',
    zh: [
      '键盘改成跟手：可视视口每变一帧就跟一帧，不再攒防抖也不再补过渡',
      '语音卡的位置在键盘收起 220 毫秒后再对一次，键盘动画没走完时不会算偏',
      '模糊层不再吃进输入条，正好停在输入条上沿',
      '模糊的羽化收到最下面 48 像素，靠输入条那一段就是实的模糊，不再几乎看不见',
    ],
    en: [
      'The keyboard now tracks the visual viewport frame by frame, with no debounce and no extra transition',
      'The voice card re-measures 220ms later, so a keyboard still closing no longer throws it off',
      'The blur layer stops exactly at the top of the composer instead of eating into it',
      'The blur feather is down to the last 48 pixels, so the area near the composer is properly blurred',
    ],
  },
  {
    ver: '6.0.4',
    date: '2026-10-29',
    zh: [
      '零下温度也不排版了：-5℃、零下 3 度这类负温度按日常读数显示',
      '摄氏度写成 °C：以前的 ℃ 是一个挤在一起的全角符号，现在拆成度和 C 两个字符，C 用正文的苹方',
      '键盘终于有过渡了：上一版被后面一条样式把动画盖掉了，这次修好，输入框是升上去的',
      '语音卡出现更早：按下 70 毫秒就立卡，麦克风在按下的瞬间就开始握手',
      '轻点一下不再弹「太短了」，直接还你光标',
    ],
    en: [
      'Sub-zero temperatures stay plain text too: -5℃ and 3 below zero are daily readings, not formulas',
      'Celsius now prints as °C: the single wide ℃ glyph is split into a degree sign and a C in the body typeface',
      'The keyboard transition works again: a later rule was overriding the animation, so the composer now rises',
      'The voice card shows sooner: it appears 70ms after touch, and the microphone handshake starts on touch-down',
      'A quick tap no longer reports "too short"; it just gives you the caret back',
    ],
  },
  {
    ver: '6.0.3',
    date: '2026-10-29',
    zh: [
      '键盘升起来有过渡了：页面高度交给可视视口并加 200 毫秒动画，输入框是被推上去的，不是瞬移',
      '键盘落下去会自动收起输入框的聚焦态，光标和亮点一起消失',
      '语音卡一点就有：手指按住 120 毫秒就立起来，不再等麦克风握手完成',
      '语音卡和输入条之间拉开距离，模糊层下缘加了羽化，不再硬切',
      '流式输出按句子切尾巴，长回答每帧只排最后一句，往下滑更顺',
    ],
    en: [
      'The keyboard now animates in: app height follows the visual viewport with a 200ms transition, so the composer rises instead of jumping',
      'Dismissing the keyboard now clears the input focus state as well',
      'The voice card appears after 120ms of holding, before the microphone handshake finishes',
      'The voice card sits higher, and the blur veil now feathers along its bottom edge',
      'Streaming splits at sentence boundaries, so long answers only relayout the final sentence each frame',
    ],
  },
  {
    ver: '6.0.2',
    date: '2026-10-29',
    zh: [
      '天气里的温度不再排成公式：整段在讲天气、又没在解化学物理题，23℃、降到 9 度就老老实实当日常读数',
      '语音说完不再自己弹键盘：字直接落在输入框里，想改再点',
      '开录时顺手把键盘收掉，按住说话的全过程不会再冒出输入法',
      '流式改成先画完再滚：以前每来一段字先读一遍页面高度再改内容，来回拉扯，这是卡顿的另一半',
      '长回答把重画间隔放宽到 110 毫秒，切到后台就完全不画',
    ],
    en: [
      'Weather temperatures are no longer typeset as formulas: if the reply is about weather and not chemistry or physics, 23℃ and 9 degrees stay plain readings',
      'Finishing dictation no longer opens the keyboard; the words land in the box and you tap to edit',
      'Starting a recording dismisses the keyboard, so no input method pops up while you hold to talk',
      'Streaming now scrolls after painting instead of before: reading the page height on every chunk fought with the DOM writes',
      'Long answers repaint every 110ms, and nothing repaints while the tab is in the background',
    ],
  },
  {
    ver: '6.0.1',
    date: '2026-10-29',
    zh: [
      '流式输出不再卡：贴底改成一帧跳到位，不自己续帧；内容没变不重画；每条消息的排版只在自己那块里算',
      '分数线的长度跟着分母走，2/(1/A+1/B) 里那个 2 下面的横线不会再短一截',
      '麦克风图标改成描边线条，缩小也不糊成一团；取消时的红色是真红',
      '按住说话期间锁住页面滚动，手指滑快了不会被整页上滑吃掉，也不会卡在半路',
      '识别提速：松手先出原话，同音字纠正放到后台跑完再原地替换，不用干等两趟',
      '三个点前面那句话按要求分场景：搜歌、看新闻、看视频、识图、翻译、定位、理解概念各有说法，不再动不动就列式计算',
      '「理一下思路」改成「正在理清思路」',
    ],
    en: [
      'Streaming no longer stutters: following the bottom is a single jump per frame, unchanged text is not repainted, and each message lays out in its own box',
      'Fraction bars now follow the denominator, so the bar under the 2 in 2/(1/A+1/B) is no longer short',
      'The mic icon is a stroked glyph that stays crisp when small, and the cancel state is actually red',
      'Page scrolling is locked while you hold to talk, so a fast swipe no longer gets taken over by the browser',
      'Faster dictation: the raw transcript lands first and homophone fixes swap in later in the background',
      'The line before the three dots is now domain aware: songs, news, video, OCR, translation, location and concepts each get their own wording instead of always "working the numbers"',
      '"Thinking it over" is now "Making sense of the question"',
    ],
  },
  {
    ver: '6.0.0',
    date: '2026-10-29',
    zh: [
      '搜索数量、图片理解这些顶上的灰字全部取消，统一并进气泡里那三个点前面的话',
      '长按说话不再和光标打架：按住期间系统不聚焦、不弹键盘、不立光标，轻点还是正常打字',
      '往上滑先亮红色「松开取消」，松手才真的取消，不会再滑到一半录音就没了',
      '错题本的灰色备注不再露出 [[math:…]] 这样的原始标记，里面的化学式也按公式排',
      '所有化学式都能像英文单词那样点一下：弹框里写这个物质的物理性质、化学性质；后面跟着溶液、气体、粉末、固体的，点词一起带上',
      '麦克风音纹拉开间距并改成中间高两边低的呼吸波形，看着不再挤成一团',
      '收音加了噪声门和更大一档的放大，远场小声也能认出字，杂音不再被一起放大',
      '长句识别提速：说长了自己只补最后那一段，不用整段重跑一遍',
    ],
    en: [
      'The grey rows above a reply are gone; search counts and image notes now live in the line before the three dots',
      'Holding the composer no longer fights the caret: no focus, no keyboard, no caret while you hold, and a tap still types',
      'Swiping up turns the card red straight away and only cancels on release, instead of dropping the recording mid-swipe',
      'Grey notes in the wrong-answer notebook no longer show raw [[math:...]] markers, and formulas inside them are typeset',
      'Every chemical formula is tappable like an English word, opening a card with its physical and chemical properties; a trailing word such as solution, gas or powder is included in the tap target',
      'Wave bars in the mic card are spaced further apart and shaped into a centre-weighted breathing wave',
      'Recording now applies a noise gate and a higher gain, so quiet far-field speech comes through and hiss is not amplified',
      'Long dictation transcribes faster: only the untouched tail is re-run after you release',
    ],
  },
  {
    ver: '5.10.5',
    date: '2026-10-29',
    zh: [
      '搜索了几个关键词、参考了几篇资料，直接写进三个点前面那句里，不再另起一行灰字',
      '三个点前面那句尾部不再加省略号，因为后面本来就有三个点在跳',
      '化学方程式的等号两横画细一档，带条件和不带条件的粗细、间距统一，不再像马克笔',
    ],
    en: [
      'The number of search terms and sources now sits in the line before the three dots instead of a separate grey row',
      'That line no longer ends with an ellipsis, since the three dots already provide one',
      'The equals bars in chemical equations are drawn thinner, with the same thickness and spacing whether or not a condition is attached',
    ],
  },
  {
    ver: '5.10.4',
    date: '2026-10-29',
    zh: [
      '化学方程式的等号位置下调，正好压在数字的中线上，不会再浮得太高',
      '长按输入框准备说话不再变成光标：触摸按下就把系统聚焦和选择手柄掐掉，轻点照旧能打字',
      '语音卡往上滑先变红，等松手才取消，不会滑一半就把录音丢了',
      '语音转文字提速：松手瞬间先把已经识别出的字填进输入框，定稿回来再原地替换，等待感明显变短',
      '远距离/小声说话的识别率提高：录音直接采 16k、去掉低频轰隆、把音量顶到正常水平再送去识别',
      '三个点上方的概括改成抽象动作短语（查找现有知识库、分析问题本质、列式计算……），不再照搬你的问句',
    ],
    en: [
      'The equals sign in chemical equations sits lower now, right on the mid-line of the digits instead of floating high',
      'Holding the input to talk no longer turns into a caret: a touch now suppresses the system focus and selection handles, while a quick tap still types normally',
      'Sliding up on the voice card turns it red first, and the recording is only dropped when you let go',
      'Faster transcription: whatever has already been recognised is placed in the input the moment you release, and replaced in place when the final pass lands',
      'Better accuracy at a distance: audio is captured straight at 16 kHz, low rumble is filtered out and the level is normalised before recognition',
      'The summary line above the three dots now uses abstract action phrases instead of repeating your question back at you',
    ],
  },
  {
    ver: '5.10.3',
    date: '2026-10-29',
    zh: [
      '化学方程式：等号两边留出空隙，不再贴着分子式；点燃、加热、催化剂这些条件改成浮在等号上下，不会再把它顶下去',
      '长按输入框准备说话时，不再唤出光标和键盘，也不会被打断；背景模糊只糊输入框以上，正在打的字还看得清',
      '语音识别完会按原意理顺一遍同音字（「增强绿气」→「讲讲氯气」，「牛多的定律」→「牛顿的定律」），顺手补上标点',
      '三个点上方多了一句 AI 概括，会跟着阶段换词：归纳…／调用网页搜索工具…／查阅 N 篇资料／把结果整理成卡片…，换词时带一层模糊过渡',
    ],
    en: [
      'Chemical equations: the equals sign now keeps a gap from the formulas on both sides, and conditions such as heat, ignition or a catalyst float above or below it instead of pushing it down',
      'Holding the input to talk no longer summons the caret or the keyboard, so recording is not interrupted; the blur only covers everything above the composer, so text being typed stays sharp',
      'After transcription the words are straightened out by meaning, fixing homophones like "boost green gas" for "explain chlorine gas", and punctuation is filled in',
      'The three dots now carry an AI summary line above them that changes with the stage: summarising, calling the web search tool, reading N sources, turning the result into a card, with a soft blur transition between phrases',
    ],
  },
  {
    ver: '5.10.2',
    date: '2026-10-29',
    zh: [
      '长按说话换回最开始那版小卡片：中间一个圆话筒，外面三圈波纹跟着声音往外扩，下边一排音纹跟着音量往左滚',
      '卡片升起来的时候，后面整屏背景一起糊掉，只看得到卡片，看不清底下的字',
      '语音语种钉死了：按界面语言直接告诉模型是中文还是英文，不再让它自己猜（以前短短一句常被猜成英语）',
      '识别完不再拿大模型改写一遍，只把繁体字换成简体，所以既准又快',
      '夹在中文中间的单个元素符号（氮（N）、C 和 O₂ 反应）也补上衬线了',
    ],
    en: [
      'Hold-to-talk is back to the very first little card: a round mic in the middle, three ripples spreading out with your voice, and a row of sound ridges scrolling underneath',
      'While the card is up the whole background is blurred, so only the card reads clearly',
      'The speech language is pinned: the app now tells the model whether it is Chinese or English instead of letting it guess, which used to turn short clips into English',
      'Transcription is no longer rewritten by a large model afterwards; only traditional characters are converted, so it is both more accurate and faster',
      'Single element symbols sitting inside Chinese text, like nitrogen (N) or C reacting with O2, now get the serif treatment too',
    ],
  },
  {
    ver: '5.10.1',
    date: '2026-10-29',
    zh: [
      '长按说话的提示改回浮在输入框上方的那张小卡，底子换成磨砂模糊；说话时三层波纹跟着声音往外扩，五根电平条跟着涨',
      '边说边出字：话一出口两秒就先转一段当草稿显示在卡里，松手再用整段重转一遍，结果直接填进输入框，不再留那三个点',
      '设置里多了「语音输入后自动发送」，打开之后长按说完松手就自己发出去，不用再点发送',
      '打开聊天时历史跟导航栏一起出来：上次的对话先在本机落屏，联网回来只在内容变了的时候才重画，不再先骨架再蹦字',
      '学习中心没生成出答案时不再整段消失：自动改用流式再要一次，还不行就留一条提示加「重试这一次」',
      '语音转写的后台钥匙配错了，这回换成只开了语音权限的子钥匙，长按说话真的能出字了',
    ],
    en: [
      'Hold-to-talk is back to the little card above the composer, now on frosted glass: three ripples spread with your voice and five level bars ride along',
      'Live transcription: after two seconds the first stretch is shown as a draft, and releasing re-runs the whole clip for the final text, which goes straight into the input box with no three-dot spinner',
      'New setting: auto-send after voice. Once on, releasing the hold sends the message for you',
      'History now arrives together with the nav bar: the last conversation is painted from a local copy first, and the network result only repaints when it actually differs',
      'The study centre no longer loses the bubble when no answer comes back: it retries over the stream, and if that fails it leaves a note plus a retry button',
      'The speech token behind transcription was misconfigured; it now uses a scoped key with speech access only, so hold-to-talk really produces text',
    ],
  },
  {
    ver: '5.10.0',
    date: '2026-10-29',
    zh: [
      '衬线改成看语境：出现摩尔、浓度、溶液、滴定这类词，数字后面的单位（0.5 mol/L、30 mL、20%）整体进数理字体；日常的“250 毫升牛奶”照旧不斜',
      '化学式不再带 mathrm：问到的化学式和离子改成 Unicode 下标直接写（H₂O、SO₄²⁻），露出来的 \\mathrm 也会被拆掉',
      '难的化学综合题能出全了：学习中心的输出上限抬到 6000 字、超时放宽到 90 秒，空手而归会自动再要一次',
      '刷题和课程答对给得更多：一题 30 学分，单选 200 学分',
      '场景应答会自己收尾：说了再见或谢谢，就在对话末尾出一张结算卡，写清用过的句子、更地道的说法、语法提醒和得分，学分一起进账；聊满两轮也可以随时点“结束这一轮”',
      '长按输入框就能说话：按住 0.3 秒开始录音，整个输入框会变成一片跟着你说话起伏的海（上滑取消），松手自动转成文字，主聊天和学习中心都能用',
      '为接 SurveyKing 打了底：后端加了带白名单的代理和状态接口，配好域名和令牌就能直接用',
      '随口提一句歌名不会再凭空多一张“虾虾推荐”卡',
    ],
    en: [
      'Math formatting now reads context: with words like mole, concentration or titration the unit joins the number (0.5 mol/L, 30 mL, 20%); everyday "250 ml of milk" stays in the normal face',
      'Chemical formulas no longer carry mathrm: they are written with Unicode subscripts (H₂O, SO₄²⁻), and stray \\mathrm is unwrapped',
      'Hard chemistry problems come out whole: the study output cap is now 6000 tokens with a 90s timeout and one automatic retry',
      'More credits for practice: 30 per drill question, 200 per lesson quiz',
      'Scene practice wraps itself up: a goodbye or thanks brings a settlement card listing the sentences you used, better phrasings, grammar notes and a score, credits included; after two turns you can end it any time',
      'Hold the composer to talk: 0.3s of holding turns the whole input into a sea that rises with your voice; releasing transcribes it (slide up to cancel) in both chat and the study centre',
      'Groundwork for SurveyKing: a whitelisted proxy and status endpoint are in place, ready once the domain and token are set',
      'Mentioning a song in passing no longer spawns a random music card',
    ],
  },
  {
    ver: '5.9.1',
    date: '2026-10-29',
    zh: [
      '日常数字不再变斜体：年份、日期、温度、步数、时长这些跟数学无关的数字退出数理字体，只有真的在讲式子（得、代入、顶点、坐标…）才走衬线',
      '模型知道现在几点了：每轮都把北京时间塞进上下文，问“今天/今年/现在”不会再拿几年前的日期糊弄',
      '联网改成默认就查：除了寒暄、纯情绪和学科题，其余一律先搜一遍再回答；看到搜索结果直接给结论，不许先说“我查一下”然后不查',
      '天气用真实定位：授权后拿手机经纬度去问和风，城市名也由经纬度反查，不再是写死的抚顺',
      '你的气泡跟背景拉开了一点：深色下更亮一档、浅色下更沉一档，再加一条发丝边，不再糊成一片',
    ],
    en: [
      'Everyday numbers are no longer slanted: years, dates, temperatures, step counts and durations stay in the normal face; only real expressions get the math face',
      'The model knows the time now: Beijing time is injected every turn, so "today / this year" no longer comes out as an old date',
      'Search is on by default: everything except greetings, pure feelings and coursework gets looked up first, and the answer comes after the results',
      'Weather uses real location: with permission the coordinates go to QWeather, and the city name is resolved from them instead of a hardcoded 抚顺',
      'Your own bubbles now stand out from the background a bit more in both themes, with a hairline edge',
    ],
  },
  {
    ver: '5.9.0',
    date: '2026-10-29',
    zh: [
      '进场被拖到底部这事彻底按住了：只要你手一动（往上翻或往下拖，超过 6 像素就算），点读、图片加载、公式排版、屏幕旋转这些自动贴底全部停手，不再把你拽回去',
      '想恢复自动跟随也简单：自己滑回最底部，或者直接发一条消息，就重新贴底',
      '切回会话时先清一遍接管状态，所以重新打开聊天还是落在最新一条，不会停在上次翻到的地方',
      '版本号跳到 5.9.0，作为这一轮公式排版和滚动手感的分界线',
    ],
    en: [
      'Entering a chat no longer drags you to the bottom: once you move your finger (6px either way), every auto-scroll source stops — taps, image loads, formula layout, rotation',
      'Auto-follow comes back the moment you scroll to the bottom yourself, or send a message',
      'Opening a conversation clears the takeover state first, so you still land on the newest message',
      'Version jumps to 5.9.0 as the dividing line for this round of formula typography and scrolling feel',
    ],
  },
  {
    ver: '5.6.8',
    date: '2026-10-29',
    zh: [
      '箭头彻底统一：正文里单独出现的 → ⇒ 也换成图形箭头，不会再出现"这个箭头和那个箭头长得不一样"',
      'x→+∞ 这种带正负号的极限写法一次包完，+ 号不再掉在外面',
      '字母补衬线扩大了：只要中文旁边有单个字母，不管是 h、g、y 还是 f，都算变量走数理字体，不用非得写成 y轴',
      '负数字面量也认：代入后得-4、再算得-2 里的 -4 -2 一起进数理字体',
      '修好加粗被吞：**f(x)=1** 这种加粗里的公式以前会把 ** 吸进公式里，星号就露出来了，现在加粗照常生效',
    ],
    en: [
      'Arrows are fully consistent now: a lone → or ⇒ in prose becomes the same drawn arrow',
      'Limit notation with a sign such as x→+∞ stays in one math span',
      'Single letters next to Chinese (h, g, y, f …) are treated as variables even without a word like axis attached',
      'Negative literals are recognised: the -4 and -2 in 代入后得-4 now get the math face',
      'Bold no longer breaks: **f(x)=1** used to swallow the asterisks into the formula, now emphasis renders normally',
    ],
  },
  {
    ver: '5.6.7',
    date: '2026-10-29',
    zh: [
      '根号写含糊的问题从源头治：解题助手的提示词改成“根号必须把被开方式写全”，模型以后只会写 √(x−1) 这种明确写法，不会再出 √x−1 让人猜',
      '只有右半边的式子也认了：=1、≥2、代回得=1 现在整段进数理字体，不再是一半斜体一半黑体',
      '逗号冒号不再吃掉公式：一般地,、时,y=2 这种句读标点留在正文，坐标和比值里的逗号冒号留在公式里，还留了一点空隙',
      '补下标：a₁+a₂=a₃、Sₙ=n(n+1)/2 这类带下标的整条式子现在一次包完',
      '补 ∛ ∜ 立方根符号的衬线',
    ],
    en: [
      'Square roots are now unambiguous at the source: the tutor prompt requires the radicand to be written explicitly, so the model emits √(x−1) instead of √x−1',
      'Half-expressions are recognised too: =1, ≥2, 代回得=1 now render fully in the math face',
      'Commas and colons no longer leak into or out of formulas, and they get a little breathing room inside coordinates and ratios',
      'Subscripts are supported: a₁+a₂=a₃ and Sₙ=n(n+1)/2 stay in one math span',
      'Cube roots ∛ ∜ now get the math face as well',
    ],
  },
  {
    ver: '5.6.6',
    date: '2026-10-29',
    zh: [
      '公式散件补衬线：x轴、y轴、xy、最低点0、升到1 这些单独出现的字母和数字，只要同段里已经在讲公式，也一起走数理字体',
      '箭头统一画成图形：以前 → ⇒ 在不同字体里高低不一，有的贴着下划线，现在一律居中、粗细一致；前后文字也在同一个公式里，高度不再忽高忽低',
      '根号补全：√x−1 以前只是一个光秃秃的 √，现在是有横杠盖住被开方式的全根号',
      '新增识别：(−1,−1) 这类坐标、⇒ 后面跟的式子、x∈(0,1)∪(2,+∞) 这类集合、AB⊥CD、∫₀¹、∠A=30°',
      '手机号、时间、版本号不再被当成公式变成斜体数字',
    ],
    en: [
      'Loose math atoms such as x-axis labels, xy, or a bare 0/1 next to Chinese now match the math face when the same sentence is already math',
      'Arrows are drawn, not typed: → and ⇒ no longer sit at different heights in different fonts, they are always centred with the same weight',
      'Square roots are complete: √x−1 now renders a full radical with the bar over the radicand',
      'New recognition: coordinate pairs like (−1,−1), expressions after ⇒, sets like x∈(0,1)∪(2,+∞), AB⊥CD, ∫₀¹, ∠A=30°',
      'Phone numbers, times and version strings are no longer turned into slanted math digits',
    ],
  },
  {
    ver: '5.6.5',
    date: '2026-10-29',
    zh: [
      '刚进页面时不会再被拽住：以前有一串延时补底，你在那几百毫秒里上滑会被拉回去，现在手指一动就全部作废',
      '公式字体补漏：x→0⁻、x<1.76、f=(x−1)²、x=−1、√2 这些以前漏掉衬线，现在统一走数理字体',
      '统一按 U+2212 减号、箭头、±、≡ 这些符号识别公式，不再只认 ASCII 符号',
    ],
    en: [
      'No more getting pulled back right after opening a chat: the delayed re-pin timers are cancelled by any upward swipe',
      'Math font gaps fixed: x→0⁻, x<1.76, f=(x−1)², x=−1 and √2 now render in the math face',
      'Formula detection now understands U+2212 minus, arrows, ± and ≡, not just ASCII operators',
    ],
  },
  {
    ver: '5.6.4',
    date: '2026-10-29',
    zh: [
      '额度卡弹窗重做：卡片改成实底，文字用主题色，模糊底上不再看不清；只留一层，不会再叠两个',
      '弹窗模糊修好：父层原来带淡入，子层的背景模糊会整个失效，现在模糊是实打实的',
      '发消息、点追问都会重新贴到底，不再停在上一条',
      '键盘收起后自动补到底',
    ],
    en: [
      'Gift popup rebuilt: solid card, readable text, and only one layer at a time',
      'Fixed the missing blur behind popups: the fading parent was cancelling it',
      'Sending a message or tapping a follow-up now re-pins to the bottom',
      'Closing the keyboard re-pins the chat to the bottom',
    ],
  },
  {
    ver: '5.6.3',
    date: '2026-10-29',
    zh: [
      '修偶发不自动下滑：手指轻碰一下就被当成"往上翻"，之后就不跟了。现在只有真的往上拖超过一小段才松手',
      '公式、卡片、字体回流把内容撑高时也会自动补到底，不再停在半空',
      '切回前台、屏幕旋转、键盘收起后都会重新贴底',
    ],
    en: [
      'Fixed the occasional loss of auto-scroll: a tiny finger movement no longer counts as scrolling up',
      'Late layout changes from formulas, cards and fonts now re-pin to the bottom',
      'Returning to the app, rotating the screen and closing the keyboard all re-pin',
    ],
  },
  {
    ver: '5.6.2',
    date: '2026-10-29',
    zh: [
      '节日 emoji 全部换成 Apple 官方图，🎃 不再受手机字体影响，圣诞、春节、情人节、毕业季一整套都备好了',
      '万圣节卡改成活动自动发：活动期间当天第一次聊天，卡片自己从底部升起来，口令 pumpkin25 只留作测试',
      '所有弹层遮罩去掉白底和黑底，只留模糊：兑换弹层、礼物卡、通用抽屉、侧滑抽屉都统一了',
    ],
    en: [
      'Festival emoji now use Apple artwork, so the pumpkin looks the same on every phone',
      'The Halloween card is automatic: the first chat of the day raises it from the bottom; the code stays for testing',
      'Every overlay drops its white or black wash and keeps only the blur',
    ],
  },
  {
    ver: '5.6.1',
    date: '2026-10-29',
    zh: [
      '自动贴底更稳：快到顶的时候直接贴死，不再用缓动一点点蹭，末尾不会停在差几像素的地方',
      '图片或卡片后加载把内容顶高时自动跟上，流式结束再补一次贴底',
      '积分/学分兑换的数量滚轮自己接管手势，弹层里也能拖动，抬手吸附到整格，默认停在 1 点',
      '兑换弹层的遮罩按主题分深浅，浅色模式不再是白蒙蒙一片',
      '万圣节限定额度卡：发送口令 pumpkin25 可领 25 点额度，卡片是南瓜灯配色',
    ],
    en: [
      'Auto-scroll now snaps to the very bottom instead of easing the last few pixels',
      'Late-loading images or cards no longer leave the view short of the bottom',
      'The redeem picker now drives its own drag gesture, snaps on release, and starts at 1',
      'The redeem sheet scrim is theme-aware, so light mode is no longer a white wash',
      'Halloween limited credit card: send the code pumpkin25 to claim 25 credits',
    ],
  },
  {
    ver: '5.6.0',
    date: '2026-10-29',
    zh: [
      '修流式输出时聊天区锁死底部：手指往上滑立刻放手，不用再"大滑一下"才解除',
      '手指抬起后惯性还在滑的那一小段也算用户操作，不会被自动跟随打断',
      '滑回底部就恢复自动跟随，不用手动点',
    ],
    en: [
      'Fixed the chat sticking to the bottom during streaming: a small upward drag now releases it right away',
      'Momentum right after lifting the finger still counts as user scrolling, so auto-follow will not fight it',
      'Scrolling back to the bottom resumes auto-follow automatically',
    ],
  },
  {
    ver: '5.5.1',
    date: '2026-10-29',
    zh: [
      '聊天历史按天折叠：一天以前的消息不再一次全塞进页面，首屏最多十六条，往上滑到顶会自动补八条',
      '服务端历史接口支持 before 分页，更早的消息按需取，不再一次拉五十条渲染',
      '滚动监听合并成一个，同一帧只读一次布局，滚动时少一次强制重排',
      '到账/版本抽屉去掉徽标，标题改成纯文字居中',
    ],
    en: [
      'Chat history folds by day: anything older than a day is not rendered up front, at most 16 bubbles at first, and scrolling to the top loads 8 more',
      'The history API now supports before-based paging, so older messages load on demand',
      'The two scroll listeners are merged into one, so a scroll frame only reads layout once',
      'The notice sheet drops the badge and uses a centered text title',
    ],
  },
  {
    ver: '5.5.0',
    date: '2026-10-29',
    zh: [
      '充值到账提示换成 Apple 式底部抽屉：充值账户、充值额度、充值时间、订单编号、支付状态一行一行列清，底部一颗「了解」，附当前版本号',
      '不管人在不在应用里，管理员充值后回来就能看到这条到账（通知保留 24 小时，已看的不会再弹）',
      '新版本检测：发了新版会自动用同一套抽屉提示，点「了解」重新进入加载',
      '英文模式不再闪中文：充值码倒计时、重新生成倒数改成写入时同步翻译，不再等监听器补一帧',
      '日记页「今天」「今天想记点什么」补齐英文',
      '流畅度：离开游戏页后残留的逐帧循环一律掐断；应用在后台时不再每 8 秒轮询一次状态',
    ],
    en: [
      'Top-up receipts now use an Apple-style bottom sheet: account, amount, time, order ID and payment status on separate rows, one "Got it" button and the current version at the bottom',
      'The receipt is kept for 24 hours, so it is still there when you come back, even if the app was closed when the credits landed',
      'New-version check shows the same sheet: tap "Got it" to reopen and load the new build',
      'No more Chinese flicker in English mode: the top-up countdowns translate at write time instead of waiting for the observer',
      'The diary page now translates "今天" and its placeholder',
      'Smoother overall: game frame loops stop once you leave a game page, and status polling pauses while the app is in the background',
    ],
  },
  {
    ver: '5.3.3',
    date: '2026-10-29',
    zh: [
      '新增老师页换成刷题引导那套版式：顶部步骤条、底部左右箭头、两列大选项，题面和选项左边缘对齐',
      '新增老师页背景改回纯色，不再铺那团会呼吸的渐变雾（模糊换步保留）',
      '刷题引导换步的模糊过渡做实：旧内容模糊上浮、新内容清透进场，200ms 跟换场节奏对齐',
      '浅色主题下充值码骨架不再是黑的：以前选择器挂错了层级，浅色模式也吃到深色骨架',
      '充值页文案改正式：兑换额度改「优先扣减，长期有效」，充值码说明改成「请将充值码截图发送给管理员，由其完成入账」，倒计时改「有效期剩余 12 分 03 秒」',
      '管理员支付页文案全部重写：密钥校验未通过、该充值码已完成支付、支付密码不正确、网络连接异常等，不再出现口语提示',
      '导航栏磨砂恢复：上一版为了省性能把顶栏的模糊关了，观感掉了，这次只从合成层上省',
    ],
    en: [
      'Custom teacher page now uses the drill setup layout: step counter on top, arrows at the bottom, two-column options, and the question lines up with the option edges',
      'Its background is a flat colour again, without the drifting gradient haze (the blur transition stays)',
      'The drill setup step change now really blurs: old content floats out blurred, new content fades in clean, 200ms',
      'The top-up code skeleton is no longer black in light mode; the selector was attached to the wrong element',
      'Top-up copy rewritten in a formal register throughout',
      'The admin payment page copy is formal as well: key verification failed, code already paid, incorrect payment password, network error',
      'The frosted navigation bar is restored; the previous build traded its blur for performance and the look suffered',
    ],
  },
  {
    ver: '5.3.2',
    date: '2026-10-29',
    zh: [
      '自定义老师页：上一版那套缩小排版撤回，恢复引导页原来的字号和控件',
      '老师底部按钮改成按进度推荐：答错了先推「换个说法」，答对了推「再难一点」，讲几轮没考就推「考考我」，讲久了推「总结这节」，最多五颗、横向滑动，推荐的排第一颗',
      '英文模式：充值页、学分兑换弹窗、支付到账弹窗里剩下的中文补齐；带数字的句子（可用额度 5/20、剩 2 天 5 小时、已兑换 3 点额度…）也按句式翻',
      '英文排版：英文下取消中文字距、长句改成优雅换行、设置项不再把单词从中间豁开',
      '流畅度：抽屉打开时提前把整页提到独立合成层，缩放只走 GPU；抽屉期间关掉顶栏和输入区被遮住的模糊层；打开抽屉不再做两次强制布局；英文模式的翻译监听改成只翻改动的那一块，不再每次整页重走',
    ],
    en: [
      'Custom teacher page: the shrunken typography from the last build is reverted to the onboarding look',
      'Teacher action chips now follow your progress: say it simpler after a wrong answer, go deeper after a right one, suggest a quiz once a few turns pass without one, and recap when the lesson runs long. Up to five chips, horizontally scrollable, recommendation first',
      'English mode: the top-up page, credits sheet and payment receipt are fully translated, including numeric sentences such as credits left 5/20, 2d 5h left and redeemed 3 credits',
      'English typesetting: no CJK letter-spacing, graceful line breaking, and settings rows no longer split words mid-way',
      'Smoothness: the app is promoted to its own layer before the drawer scales, the hidden blur layers under the scrim are skipped while it is open, the drawer no longer forces two layout passes, and the English translator only walks the changed subtree instead of the whole page',
    ],
  },
  {
    ver: '5.3.1',
    date: '2026-10-29',
    zh: [
      '错题本：仍带着 [[math:…]] 外壳、\KCl 这种「反斜杠＋元素符号」的反应式现在能读成 KClO₃+6HCl=KCl+3Cl₂↑+3H₂O，不再变成 _3+6= +3_2 的残骸；正文公式里箭头前多写的反斜杠也抹掉',
      '场景应答：顶部去掉「换场景」，只留历史',
      '点词：量宽时先隐藏，量好一次成型，不再先排一版再重排；同一个词不再上下翻面；释义区不再露出右侧滚动条',
      '课程选择页背景：光圈改用固定色相，浅色主题下不再白里透黑',
      '学习学分 / 游戏积分兑换弹窗：背板换成厚模糊，卡片从模糊里对焦弹出、退场时再散开',
      '兑换数量滚轮：去掉 70ms 防抖改逐帧跟手，数字一变补一记轻震',
    ],
    en: [
      'Notebook: expressions still wrapped in [[math:…]] or written as \KCl now read as KClO₃+6HCl=KCl+3Cl₂↑+3H₂O instead of leftover pieces; stray backslashes before arrows in formulas are removed',
      'Scene replies: the swap-scene button is gone from the top bar, history stays',
      'Word lookup: width is measured while hidden so the bubble appears already settled, no second reflow, no flipping above and below, and no scrollbar on the right',
      'Course picker background: the glow now uses fixed hues, so light theme no longer looks dirty',
      'Credits and points redemption sheets: heavy blurred backdrop with the card focusing in on open and dissolving on close',
      'Redemption wheel: per-frame tracking instead of a 70ms debounce, with a light tick whenever the number changes',
    ],
  },
  {
    ver: '5.3.0',
    date: '2026-10-29',
    zh: [
      '英文模式补齐：练题、课程、小游戏、助理、充值、错题本里原来剩下的中文全部补译，分数/倒计时这类带数字的句子也能跟着换',
      '点词：释义是后到的，现在词头先清出来、释义逐行模糊浮现，不再是硬邦邦一整块跳出来',
      '查词提速：手指碰到单词就先发请求，同词只发一次；服务端润色最多等 2.2 秒、只有一条释义时直接跳过，释义还能缓存七天',
      '错题本：从练题收进来的错题，标题和备注里那些 $…$、\frac{}{} 都还原成能读的纯文本，不再顶着一串公式代码',
      '悬浮调试窗：按住标题行可以拖了，手指滑出标题栏也不会丢，位置会记住',
      '震动：所有小游戏都加上触感，输赢平三种结算各有一种手感；练题和课程原有的反馈保留',
      '课程选择页：背景加了缓慢流动的光圈，卡片带模糊浮现，节奏跟引导页一致',
      '自定义老师页：换成和选课页一样的字号与控件高度，中英文排版都跟选课页对齐',
    ],
    en: [
      'English mode filled in: the remaining Chinese across drills, courses, mini games, the assistant, top-ups and the notebook is translated, including lines with live numbers such as scores and timers',
      'Word lookup: the gloss arrives late, so the headword now settles first and each line of the definition blurs in instead of popping in as one block',
      'Faster lookup: a request fires as soon as a finger touches a word and repeats are deduped; server refinement waits at most 2.2 seconds, is skipped for single senses, and glosses cache for a week',
      'Notebook: mistakes collected from drills now show their title and note as readable plain text instead of raw LaTeX',
      'Debug panel: drag it by the title row; it keeps tracking when your finger leaves the header and remembers its position',
      'Haptics: every mini game now gives touch feedback, with distinct patterns for win, lose and draw; drills and courses keep theirs',
      'Course picker: slow drifting glow behind the page with cards blurring in, matching the onboarding rhythm',
      'Custom teacher: same type sizes and control heights as the course picker, aligned in both languages',
    ],
  },
  {
    ver: '5.2.1',
    date: '2026-10-29',
    zh: [
      '台球：改成先判进袋再撞库，袋口判定放宽到「洞口 + 半个球」——以前球心还没压到袋口就被库边弹走，必进球也飞',
      '台球 AI：力度按「到目标球的距离 + 球到袋的距离」算，不再杆杆全力；出杆前先把候选球路试打一遍，只打验得进、白球不摔袋的那一杆；没有必进球时改打安全球',
      '刷题 / 课程：正文自己让出顶栏 50px，第一张卡片不再被压在导航栏底下',
      '学习里的对话练习：顶部那条说明栏挪进顶栏，消息区整页铺满',
    ],
    en: [
      'Pool: pockets are checked before cushion bounce, with the capture radius widened to cup plus half a ball',
      'Pool AI: power now follows the cue-to-object and object-to-pocket distance; each candidate shot is simulated first, and only the one that pots without scratching is played',
      'Drill / Course: content now clears the 50px top bar, so the first card is no longer hidden underneath it',
      'Study chat: the description row moved into the top bar, giving the message list the full page',
    ],
  },
  {
    ver: '5.1.16',
    date: '2026-10-28',
    zh: [
      '修好启动卡在加载页：键盘改造里留了半截重复代码，整个脚本解析失败',
      '启动兜底：脚本真出问题时不再白屏，会给一句提示',
    ],
    en: [
      'Fixed the stuck loading screen: leftover duplicated code in the keyboard rework broke the whole script',
      'Added a startup fallback so a script failure no longer leaves a blank screen',
    ],
  },
  {
    ver: '5.2.0',
    date: '2026-10-29',
    zh: [
      '乒乓球多了黑色炸弹：球撞上去立刻爆炸，谁把球打过去的，对手加一分',
      '贪吃蛇加入 AI 对手：双方同场吃豆，撞到自己或对方都算输，头碰头算平局，结束后按长度结算积分，输了也有分',
      '台球和保龄球的 AI 都调准了：角度误差和出手随机量大幅收窄，能正常进球、打瓶',
      '俄罗斯方块的落底键改成和同排按键一样的材质，不再是一条白条',
      '课程小节加了兜底拆法：模型没拆出来时按章名拆，不再出现「拆不出小节」',
      '刷题的数学、物理、化学正文里的字母数字改用数理字体，语文英语不受影响',
      '游戏名和简介支持英文',
    ],
    en: [
      'Pong now has black bombs: hit one and it explodes, and the side that sent the ball loses the point',
      'Snake now has an AI opponent on the same board; hitting yourself or the rival loses, head-on collisions are a draw, and points are settled by length at the end',
      'The pool and bowling AI aim far more accurately now',
      'The Tetris hard-drop button uses the same material as the other keys instead of a plain white bar',
      'Course sections fall back to splitting the chapter name when the model returns nothing',
      'Letters and digits in math, physics and chemistry drills now use the math font',
      'Game names and descriptions support English',
    ],
  },
  {
    ver: '5.1.26',
    date: '2026-10-28',
    zh: [
      '设置里新增调试开关：打开后浮出一个可拖动的参数窗，视口、滚动、顶栏、输入区数值一目了然，可一键复制',
      '聊天页整体钉在布局视口上，键盘弹起不再整页上跳再掉回',
    ],
    en: [
      'New debug switch in Settings: a draggable metrics overlay with viewport, scroll, app bar and composer values, one tap to copy',
      'The chat page is pinned to the layout viewport, so the keyboard no longer makes the whole page jump',
    ],
  },
  {
    ver: '5.1.12',
    date: '2026-10-28',
    zh: [
      '键盘升起不再"先顶上去再回滚一下"，缩和贴底在同一帧完成',
      '视口变化合并成每帧一次，键盘动画期间不再反复强制布局',
    ],
    en: [
      'Opening the keyboard no longer shifts the page up and then scrolls back down: the resize and the bottom alignment happen in the same frame',
      'Viewport changes are coalesced to one per frame, so the keyboard animation no longer forces layout repeatedly',
    ],
  },
  {
    ver: '5.1.11',
    date: '2026-10-28',
    zh: [
      '键盘升起和收起都改成连续跟随，不再"先滚一半再突然掉下来"',
      '键盘动画期间临时降低顶栏模糊，动画结束后自动恢复，减少掉帧',
      '滚动事件合并到每帧一次，滚动判断不再反复强制布局',
    ],
    en: [
      'The chat now follows the keyboard continuously in both directions instead of jumping halfway',
      'The app bar blur is temporarily lighter while the keyboard animates, then restored automatically',
      'Scroll handling is batched to one check per frame instead of forcing layout repeatedly',
    ],
  },
  {
    ver: '5.1.10',
    date: '2026-10-28',
    zh: [
      '修掉键盘弹起时整页怪异地往上窜、以及随之而来的卡顿',
      '聊天区关掉浏览器自动滚动补偿，滚动位置只由应用自己决定',
    ],
    en: [
      'Fixed the odd upward jump and the lag that came with opening the keyboard',
      'Disabled browser scroll anchoring in the chat so scroll position stays under app control',
    ],
  },
  {
    ver: '5.1.9',
    date: '2026-10-28',
    zh: [
      '键盘升起时聊天区不再往上窜一下',
      '修掉键盘动画过程中偶发的闪动',
    ],
    en: [
      'The chat no longer jumps up when the keyboard opens',
      'Fixed the occasional flicker during the keyboard animation',
    ],
  },
  {
    ver: '5.1.8',
    date: '2026-10-28',
    zh: [
      '键盘改回浏览器托管高度：键盘只把页面顶上去，不再盖住输入区，也不再闪',
      '键盘弹起时只贴一次底，不再连发多次强制滚动',
    ],
    en: [
      'The keyboard is back to browser-managed sizing: it pushes the page up instead of covering the composer, and no longer flickers',
      'When the keyboard opens the chat sticks to the bottom once, without a burst of forced scrolls',
    ],
  },
  {
    ver: '5.1.7',
    date: '2026-10-28',
    zh: [
      '键盘开合改成平滑过渡：高度由应用自己驱动，输入区是长上来、收回去，不再是瞬移',
      '流式贴底改成缓动跟随，不再一段一段往下跳',
    ],
    en: [
      'The keyboard now opens and closes smoothly: the app drives its own height, so the composer grows and shrinks instead of jumping',
      'Auto-scroll while streaming now eases toward the bottom instead of jumping chunk by chunk',
    ],
  },
  {
    ver: '5.1.6',
    date: '2026-10-28',
    zh: [
      '流式输出只重画还在长大的那一段，前面的定稿内容不再每帧重排，长回答不再卡',
      '滚动合并成每帧一次，流式时上下翻不再抢主线程',
      '去掉落字时的模糊动画，屏幕外的消息跳过绘制',
    ],
    en: [
      'Streaming now repaints only the growing tail instead of re-rendering the whole answer every frame',
      'Scroll requests are batched to one per frame, so scrolling stays smooth while streaming',
      'Removed the blur effect on each new chunk, and off-screen messages skip layout and paint',
    ],
  },
  {
    ver: '5.1.5',
    date: '2026-10-28',
    zh: [
      '缩进收回 0.985：整块只轻轻退一点，不再大缩放',
      '去掉大投影和圆角裁剪，抽屉打开不再卡顿',
    ],
    en: [
      'The sink is back to 0.985: the whole app only steps back slightly instead of a big scale',
      'Dropped the heavy shadow and corner clipping, so opening the drawer no longer stutters',
    ],
  },
  {
    ver: '5.1.4',
    date: '2026-10-28',
    zh: [
      '缩进改成整块后退：顶栏和输入区一起缩，收回圆角和投影，边缘不再露缝',
      '修掉日记页骨架阶段点左上角那颗按钮会直接回聊天：没显式给返回动作的页面一律当菜单键',
      '情绪中心恢复原来的关闭语义',
    ],
    en: [
      'The sink now moves the whole app: top bar and composer shrink together, with rounded corners and a shadow so no seam shows',
      'Fixed the diary skeleton page sending you back to chat when tapping the top left button: pages without an explicit back action always treat it as the menu key',
      'The mood page is back to its close behaviour',
    ],
  },
  {
    ver: '5.1.3',
    date: '2026-10-28',
    zh: [
      '缩进回来了，但换成更软的量级：0.95 + 480ms 尾软曲线，聊天和输入区一起后退',
      '情绪中心的骨架页不再把顶栏按钮当关闭用：那里就是菜单键，点了开抽屉',
    ],
    en: [
      'The sink is back with a softer feel: 0.95 over 480ms with a soft tail, chat and composer move back together',
      'The mood page skeleton no longer turns the top bar button into a close action; it is the menu key and opens the drawer',
    ],
  },
  {
    ver: '5.1.2',
    date: '2026-10-28',
    zh: [
      '抽屉打开时不再把内容缩进去：缩放看着生硬，改成只留遮罩的模糊和压暗',
      '抽屉滑入放慢、尾巴更软，收回快一点跟手，一进一出不再顿一下',
      '修掉偶发的「点菜单没反应、直接留在主对话」：遮罩在开门那一瞬间会接住紧随的点击把抽屉自己关掉，现在 340ms 内的遮罩点击不算数',
    ],
    en: [
      'Opening the drawer no longer scales the content in: it looked stiff, so only the scrim blur and dim remain',
      'The drawer slides in slower with a softer tail and closes faster, so it no longer stutters at either end',
      'Fixed the occasional "menu tap does nothing, stuck on main chat": the scrim caught the click right after opening and closed the drawer itself; clicks within 340ms are now ignored',
    ],
  },
  {
    ver: '5.1.1',
    date: '2026-10-28',
    zh: [
      '抽屉打开时不再缩放整页：原来会把顶栏的磨砂糊掉，还在屏幕四周露出一条底色不同的小边',
      '条形码去掉自带的不可选数字，只留下面那串可复制的短码，字体改苹方',
      '设置页从九组压到四组：外观、聊天与交互、账号、支持，字号那几行也收紧了',
    ],
    en: [
      'Opening the drawer no longer scales the whole page: it killed the top bar blur and left a thin strip of a different color around the screen',
      'Barcode drops its own non-selectable digits; only the copyable short code below stays, now in PingFang',
      'Settings collapsed from nine groups to four: appearance, chat, account, support, with the font-size rows tightened',
    ],
  },
  {
    ver: '5.1.0',
    date: '2026-10-28',
    zh: [
      '修好返回键被当成菜单键：界面模块之前被两个不同版本各加载了一次，返回状态各存各的，现在统一共用一份',
      '抽屉选中项不再叠加悬停底色，滑动选中框和文字高亮始终对得上',
      '档案页的时间滑块去掉中间那段重复的日期，只保留首尾两个标签',
      '二维码和条形码出现时从模糊到清晰，不再硬闪出来',
      '额度到账横幅出现和消失都带模糊过渡',
      '用户发出的气泡有了轻微的浮入动画，AI 流式输出改成少数字轻模糊上浮，光标呼吸更柔和',
      '深色模式下二维码与条形码改为黑底白码，切换主题会自动重画',
    ],
    en: [
      'Fixed back turning into the menu button: the UI module was loaded twice under different versions with separate state, now one shared state',
      'Drawer selection no longer stacks a hover tint on top of the sliding indicator',
      'Archive slider drops the duplicated middle date, only the two end labels remain',
      'QR and barcode now fade in from blur instead of snapping in',
      'Quota banner blurs in and out on both ends',
      'Sent bubbles float in softly; streaming now blurs just a few new characters, with a gentler caret',
      'Dark mode draws QR and barcode as white on black, and repaints when the theme changes',
    ],
  },
  {
    ver: '5.0.4',
    date: '2026-10-28',
    zh: [
      '支付页密码框回到六个：之前隐藏输入框被当成第七格，现在它不再参与排版',
      '密钥第一个字母重复显示的问题一并修好，输入框不会再抢格子的位置',
      '格子选中态去掉白色高亮，只留一圈细绿边',
      '二维码骨架去掉外面的白底描边，只显示骨架本身',
      '支付遮罩重做：一层磨砂玻璃从上往下铺满，铺的过程里背景逐渐模糊',
    ],
    en: [
      'The payment page is back to six password cells: the hidden input no longer joins the layout as a seventh',
      'The duplicated first key letter is fixed too, the input no longer steals a cell',
      'Active cells drop the white highlight for a thin green ring',
      'The QR skeleton lost its white frame and outline, only the skeleton shows',
      'Reworked the overlay into a frosted pane that slides down over the page',
    ],
  },
  {
    ver: '5.0.3',
    date: '2026-10-28',
    zh: [
      '充值码加载时先显示骨架，二维码和条形码不再突然出现',
      '支付页的遮罩改成从上方往下铺开，铺开过程中背景逐渐变模糊',
      '密钥和密码的格子去掉多余阴影，点中会有绿色描边，输进去的密码显示成圆点',
      '充值页右上角的说明重写：去掉申请额度那段，改成充值码与兑换说明',
    ],
    en: [
      'Recharge codes now show a skeleton while loading instead of popping in',
      'The payment veil now sweeps down from the top, blurring the background as it spreads',
      'Key and password cells lost the stray shadow, take a green ring when active, and show dots as you type',
      'Rewrote the top-up help panel: the request flow is gone, recharge codes and redemption are documented',
    ],
  },
  {
    ver: '5.0.2',
    date: '2026-10-28',
    zh: [
      '支付页重新设计：静态卡片 + 底部抽屉，只用绿色，字号和留白重排',
      '密钥回来了：进支付页先输 8 位密钥，验证通过才看得到金额',
      '充值码改成一次性，付完立刻作废，刷新页面也只会提示已经付过',
      '所有输入框去掉闪烁光标，也不再自动弹出键盘，页面不再乱跳',
      '额度单位统一改成「额度」，不再叫「次」',
      '支付页用苹方字体，安卓上加载同样的中文字体，字形保持一致',
    ],
    en: [
      'Payment page redesigned: static card plus a bottom sheet, green only, retuned type and spacing',
      'The daily key is back: the payment page now asks for the 8-digit key before showing the amount',
      'Recharge codes are single-use and die the moment they are paid; a refresh shows it was already used',
      'Inputs no longer show a blinking caret or pop the keyboard, so the page stops jumping',
      'Quota is now counted in "quota" instead of "times" everywhere',
      'The payment page uses PingFang with a matching web font so Android looks the same',
    ],
  },
  {
    ver: '5.0.1',
    date: '2026-10-28',
    zh: [
      '重新生成充值码加了 60 秒冷却，防止一直换码',
      '充值页改成：先填数量，点支付后整页模糊，底部抽屉确认金额，再输支付密码',
      '支付页去掉每日密钥输入，只留支付密码，说明文字大幅精简',
      '额度页去掉兑换额度和限时额度的重复说明，界面更干净',
    ],
    en: [
      'Regenerating the recharge code now has a 60-second cooldown',
      'New payment flow: enter the amount, tap pay, the page blurs, a bottom sheet confirms the amount, then the password',
      'The daily key input is gone from the payment page; it now asks only for the payment password',
      'Duplicate explanations on the quota page were removed for a cleaner look',
    ],
  },
  {
    ver: '5.0.0',
    date: '2026-10-28',
    zh: [
      '充值改版：每个用户一张专属充值码（二维码 + 条形码），30 分钟有效，过期点一下重新生成',
      '截图发给管理员，扫码进支付页，输入当天密钥、金额和支付密码即到账',
      '充值额度直接进兑换池，和学分、积分换的一样：永久有效、优先消耗、不抬高每日上限',
      '到账时客户端实时弹窗，带支付流水号与支付时间，点空白处或「知道了」退出',
      '支付页单独做成微信支付风格的独立页面，不再加载整个应用',
      '额度页去掉「申请额度」入口，只留充值码和兑换码',
    ],
    en: [
      'New top-up: every user gets a personal code (QR + barcode) that expires in 30 minutes and can be regenerated',
      'Screenshot it to the admin, scan, then enter the daily key, an amount and the payment password',
      'Top-ups land in the exchange pool exactly like credit-points: permanent, spent first, never raising the daily cap',
      'A real-time popup shows the order number and payment time when the top-up lands',
      'The payment page is a standalone WeChat-Pay-style page and no longer loads the whole app',
      'The request-quota form was removed from the top-up page; only the recharge code and redeem codes remain',
    ],
  },
  {
    ver: '4.1.13',
    date: '2026-10-28',
    zh: [
      '额度模型改版：学分/积分换来的额度进「兑换池」，永久保留、用不完一直留着，不再抬高每日上限',
      '扣费顺序变成兑换池 → 限时额度 → 每日额度，池子没空之前不动每日的 100 次',
      '历史兑换加成统一清零，避免每日上限和兑换余额两边乱跳',
      '顶部徽标和充值页统一显示「总共还能用多少次」，充值页拆出每日额度与兑换额度两行',
    ],
    en: [
      'New quota model: redeemed quota now goes into a permanent pool instead of raising the daily cap',
      'Spending order is pool → limited-time grants → daily quota; the daily 100 is untouched while the pool has credit',
      'All legacy permanent bonuses were cleared so the two numbers stop jumping',
      'Badge and top-up page both show total remaining uses, with the daily and redeemed amounts broken out',
    ],
  },
  {
    ver: '4.1.12',
    date: '2026-10-28',
    zh: [
      '化学方程式：多种条件时催化剂压在等号上方，△/通电/高温写在下方；没有催化剂就都写在上面',
      '化学方程式：等号再加长并抬高一点，条件里的 MnO₂ 也排了下标',
      '情绪中心：小情绪固定八格 4×2 排满，没数据时直接用静态骨架占位',
      '迷宫：道具真正生效——加速更快、隐身时龙虾乱走、分身会跑且到点消失，吃到道具头顶会飘字',
      '所有二级页顶栏换成主聊天同款磨砂玻璃，正文从顶栏下面滚过去',
      '返回键改成点击压扁再回弹，页面关闭只闪一下',
    ],
    en: [
      'Chemistry equations: catalysts now sit above the equals sign while △/electrolysis/high heat go below',
      'Chemistry equations: longer, slightly higher equals sign; formulas in conditions get subscripts',
      'Emotion center: always eight mini emotions in a 4×2 grid, static skeleton when there is no data',
      'Maze: pickups actually work now — faster speed boost, enemies wander while you are invisible, the decoy moves and expires, and pickup text floats above the player',
      'All secondary page headers now use the same frosted glass as the chat bar, with content scrolling underneath',
      'Back button squashes and springs back; closing a page is a quick flash',
    ],
  },
  {
    ver: '4.1.11',
    date: '2026-10-28',
    zh: [
      '化学方程式：等号改成课本式双横线，比原来的字符更长，两侧式子紧贴不再留空档',
      '化学方程式：加热条件统一排成 △，不再直接写“加热”',
      '化学方程式：正文里用 = 写的反应式也会按化学式排版，不再漏成普通文字',
    ],
    en: [
      'Chemistry equations: the equals sign is now drawn as a textbook double rule, longer than the character and flush with both sides',
      'Chemistry equations: heating is shown as △ instead of the word',
      'Chemistry equations: reactions written with = in body text now get chemistry layout instead of staying plain text',
    ],
  },
  {
    ver: '4.1.10',
    date: '2026-10-27',
    zh: [
      '化学装置：修复 LaboBib 场景导入时节点未移除导致的死循环，历史记录不会再因此卡死',
    ],
    en: [
      'Chemistry apparatus: fixed a node-import loop that could freeze history when loading LaboBib scenes',
    ],
  },
  {
    ver: '4.1.9',
    date: '2026-10-27',
    zh: [
      '化学装置：制氧、制二氧化碳、制氢改用 LaboBib 仪器线稿拼装，试管、集气瓶、酒精灯和水槽统一成考试卷风格',
    ],
    en: [
      'Chemistry apparatus: oxygen, carbon dioxide and hydrogen setups now use composed LaboBib glassware for a consistent exam-diagram look',
    ],
  },
  {
    ver: '4.1.8',
    date: '2026-10-27',
    zh: [
      '化学方程式：等号加长，反应条件压低到等号上方合适位置',
    ],
    en: [
      'Chemistry equations: lengthened the equals sign and lowered reaction conditions above it',
    ],
  },
  {
    ver: '4.1.7',
    date: '2026-10-27',
    zh: [
      '快问快答：历史战绩改成整行换行，长文本不再顶出气泡',
      '俄罗斯方块：操作键重做，旋转键去掉文字并单独高亮',
      '数学排版：分式、单位符号统一走衬线字体，不再偶尔漏字体',
      '化学装置：导气管缩短并改成圆角弯折，制氧、制二氧化碳、制氢和排空气法同步调整',
    ],
    en: [
      'Quick quiz: history rows now wrap cleanly inside the result bubble',
      'Tetris: refreshed the control pad; rotate is icon-only and highlighted',
      'Math: fractions and unit symbols consistently use the serif math font',
      'Chemistry: shortened the delivery tubes with rounded bends across the gas-preparation setups',
    ],
  },
  {
    ver: '4.1.6',
    date: '2026-10-27',
    zh: [
      '勇往直前：斜坡金币线上随机最多两个位置会换成炸弹，跳过去即可',
      '勇往直前帮助文案同步：达标只提示不暂停，补充斜坡炸弹说明',
    ],
    en: [
      'Runner: up to two coin slots on the ramp can now be replaced by bombs; jump over them',
      'Runner help text updated for non-pausing clears and ramp bombs',
    ],
  },
  {
    ver: '4.1.5',
    date: '2026-10-27',
    zh: [
      '勇往直前：达标线整体抬高，一至五星依次为 400、800、1200、1600、2000 米',
    ],
    en: [
      'Runner: raised the clear targets to 400 / 800 / 1200 / 1600 / 2000 meters for one to five stars',
    ],
  },
  {
    ver: '4.1.4',
    date: '2026-10-27',
    zh: [
      '勇往直前：达标只弹底部横幅提示，不再暂停，继续跑',
      '勇往直前：修复高台在角色还在平台上时提前消失，导致角色突然掉下去/像被传送的问题',
      '游戏中心：从游戏退回列表后，右上角恢复菜单键，不再一直显示返回',
    ],
    en: [
      'Runner: clearing now only shows a bottom banner and keeps running instead of pausing',
      'Runner: fixed the platform disappearing while the player was still on it, which made the player suddenly fall or appear teleported',
      'Game center: returning from a game to the list now restores the menu button instead of leaving a back arrow',
    ],
  },
  {
    ver: '4.1.3',
    date: '2026-10-27',
    zh: [
      '勇往直前：达标后弹出小面板，可点“继续跑”或“结算”，不再没有继续入口',
      '勇往直前：高台降低，斜坡加长到 240，平台加宽到 200，炸药方块后移，斜坡上铺金币；高台经过时不再生成柱子',
      '勇往直前：高台配色跟随深浅主题，不再是一块突兀的灰块',
    ],
    en: [
      'Runner: clearing now opens a small panel with “keep running” or “settle”, so the continue option is always available',
      'Runner: lowered the platform, lengthened the ramp to 240, widened the platform to 200, moved the explosive crates back, added coins on the ramp, and stopped pillars from spawning while a platform passes',
      'Runner: platform colors now follow the light/dark theme instead of a jarring gray block',
    ],
  },
  {
    ver: '4.1.2',
    date: '2026-10-27',
    zh: [
      '勇往直前：未达标死亡也会按距离结算积分；达标不再弹第一次 0 积分弹窗，改为提示后继续跑，结束时只结算一次',
      '勇往直前：高台改为右侧斜坡，走上去就是更高的平地，不再需要横杆翻越',
      '全部击毙：默认进入改为第一波开始，上次进度单独提供“继续第 X 波”，不再默认接第二波',
    ],
    en: [
      'Runner: failing a run now still awards distance-based points; clearing no longer opens a first zero-point card, so only one settlement appears at the end',
      'Runner: raised sections now use a right-side ramp you can walk up instead of a bar to climb',
      'Squad: entering now starts at wave one by default; saved progress is offered separately as “continue wave X”',
    ],
  },
  {
    ver: '4.1.1',
    date: '2026-10-27',
    zh: [
      '商店购买后不再重播弹窗动画，改为底部小横幅提示“花费 xx 已购买 xx”，并下调装备与皮肤定价',
      '爆破能手关卡卡片的空白头部移除，20 个难度星改为每行 10 颗、两行对齐',
      '勇往直前新增横杆高台：跳上横杆翻上平台，平台上的红色方块碰到会爆炸',
    ],
    en: [
      'Shop purchases no longer replay the modal animation; a small bottom banner reports the cost and item, and prices were lowered',
      'Removed the empty header above the demolition level card and laid out its 20 difficulty stars as two aligned rows of 10',
      'Runner now has bar-and-platform sections: grab the bar to climb up, and avoid the explosive crates on the platform',
    ],
  },
  {
    ver: '4.1.0',
    date: '2026-10-27',
    zh: [
      '游戏结算积分改为按本局表现计算：分数越高积分越多，胜负不再固定',
      '勇往直前增加随难度提高的达标线，达标即三星并可继续跑；死亡时按最终距离结算',
      '全部击毙重做手雷操作与商店滚动，新增火焰子弹、冰冻子弹、燃烧弹、移速和队友强化',
      '头目、小头目与精英敌人加入技能和回血；修复暂停遮罩、商店页面滚动与爆破能手物理和关卡',
    ],
    en: [
      'Game rewards now scale with performance instead of a fixed win or loss amount',
      'Runner now has difficulty-based three-star clear targets, with an option to keep running after clearing',
      'Squad mode gets tap-to-arm grenades, contained shop scrolling, incendiary/ice bullets, movement speed and ally upgrades',
      'Bosses, mini-bosses and elites now use skills and healing; pause blur, shop scroll locking and demolition physics/levels were fixed',
    ],
  },
  {
    ver: '4.0.10',
    date: '2026-10-27',
    zh: [
      '2048 按星级调整目标：一星 512，二星 1024 判胜，三至五星依次为 2048、4096、8192',
      '2048 结算星级改为按最大数字块计算：512 一星、1024 二星、2048 三星，提前达成也会继续升星',
      '2048 说明与首页卡片描述同步更新',
    ],
    en: [
      '2048 targets now follow the star level: one star at 512, two stars win at 1024, then 2048/4096/8192 for three to five stars',
      '2048 result stars are based on the largest tile: 512 for one star, 1024 for two, 2048 for three; reaching a higher tile upgrades the result',
      'Updated the 2048 help copy and home card description',
    ],
  },
  {
    ver: '4.0.9',
    date: '2026-10-27',
    zh: [
      '引导页欢迎页去掉多余的展示表情，只保留头像标记，并收紧名字前后逗号的间距',
      '课程课堂记录按老师分别保存，换老师后从新课堂开始，不再复用上一位老师的对话',
      '修复课程衬线公式基线偏移导致的“飘起来”，流式输出和最终正文都不再残留半个美元符号',
      '移除场景应答输入框上方的小字提示，语言过滤仍然生效，数字和符号可以正常输入',
    ],
    en: [
      'Removed the extra showcase emoji from the onboarding welcome page and tightened the spacing around the name comma',
      'Course history is now keyed by teacher, so switching teachers starts a fresh class instead of reusing the previous conversation',
      'Fixed the serif formula baseline drift in courses, and stray dollar signs no longer appear during streaming or in the final text',
      'Removed the small hint above the scene-reply composer while keeping language filtering and number/symbol input',
    ],
  },
  {
    ver: '4.0.8',
    date: '2026-10-27',
    zh: [
      '说明文档统一改为书面表述，补充学习各模块的适用范围、操作方式与限制，并修正原有表述中的事实错误',
      '化学方程式重排：加热条件置于等号上方并留出间距，反应物与生成物分列等号两侧，行距与字距同步调整',
      '字号档位现在作用于全部正文、说明、按钮与图示标注，衬线公式和界面文字不再出现固定字号',
      '引导页补充刷题、课程与学习方向，兴趣标签上限调整为 20 个，欢迎页修正逗号间距',
      '心情由 12 类扩充至 24 类，新增兴奋、满足、感激、期待、害羞、困惑、孤独、失望、焦虑、烦躁与困倦等状态',
      '学分兑换调整为 200 学分换 1 点额度，每日兑换上限提高至 20 次，游戏积分共用同一上限',
    ],
    en: [
      'Help copy rewritten in formal written Chinese, with clearer scope, operation and limits for every study module and factual corrections',
      'Chemistry equations re-laid out: heating conditions sit above a spaced equals sign, reactants and products align on opposite sides, and line/letter spacing is tuned',
      'Text-size settings now apply to all body text, help copy, buttons and diagram labels; serif formulas no longer use fixed font sizes',
      'Onboarding now covers drills, courses and study interests; the tag limit is 20, and the welcome page has better comma spacing',
      'Moods expanded from 12 to 24, adding excited, content, grateful, hopeful, shy, confused, lonely, disappointed, anxious, annoyed and sleepy',
      'Credit exchange is now 200 credits per quota, with a daily cap of 20 shared with game points',
    ],
  },
  {
    ver: '4.0.7',
    date: '2026-10-27',
    zh: [
      '首页说明抽屉补全情绪中心、搜索、充值、日记、档案五个页面的用法',
      '说明文字改为分段排版，列表和提示块分开，长段落更好读',
      '档案页新增说明入口，解释周概览、周/月心情和 AI 总结的边界',
    ],
    en: [
      'Filled in the Help drawer for Mood Center, Search, Top up, Diary and Archive',
      'Help copy now uses paragraphs, bullet lists and a separate tip block for easier reading',
      'Added an Archive help entry covering weekly overview, weekly/monthly mood and AI summary limits',
    ],
  },
  {
    ver: '4.0.6',
    date: '2026-10-27',
    zh: [
      '课程对话改用统一 Markdown 渲染：独占一行的 **小标题** / *小标题* 会自动显示成标题，不再把星号原样露出来',
      '课程里的分式、根号改用项目内公式排版，不再被 KaTeX 压成小字；中文说明也不会因为误包在 $...$ 里变成衬线',
      '课程和刷题的长公式、长单词加了气泡内换行/横向滚动保护，不再顶出对话框',
    ],
    en: [
      'Course chat now uses the shared Markdown renderer: standalone **headings** / *headings* become real headings instead of showing asterisks',
      'Fractions and roots in courses use the app math layout instead of being shrunk by KaTeX; Chinese prose wrapped in $...$ no longer turns into serif math',
      'Course and drill bubbles now contain long formulas and words with wrapping or horizontal scrolling instead of overflowing',
    ],
  },
  {
    ver: '4.0.5',
    date: '2026-10-27',
    zh: [
      '正文里裸写的化学式和算式会自动识别成数理片段：H₂O、CO₂、NaOH、Ca(OH)₂、SO₄²⁻、2H₂O₂ → 2H₂O + O₂、2+2=4、pH=7、E=mc² 都能用衬线',
      '只给夹在句子里的公式片段换字体，中文说明和普通英文仍是正文字体',
      'URL、邮箱、日期和 CPU/USB/KFC 这类英文缩写不会被误判成公式',
    ],
    en: [
      'Bare chemical formulas and equations inside prose are now detected automatically, including H₂O, CO₂, NaOH, Ca(OH)₂, SO₄²⁻, 2H₂O₂ → 2H₂O + O₂, 2+2=4, pH=7 and E=mc²',
      'Only the embedded formula fragments switch fonts; Chinese descriptions and ordinary English prose keep the body font',
      'URLs, email addresses, dates and English acronyms such as CPU/USB/KFC are left alone',
    ],
  },
  {
    ver: '4.0.4',
    date: '2026-10-27',
    zh: [
      '数理字体只作用于公式、化学式、图形里的字母数字和方程式；中文说明、普通英文句子恢复正文字体，不再整段变衬线',
      '图形里的中文仪器名和说明用正文字体，化学式与物理符号仍用数理字体',
      '英文回答同样只给公式换字体，英文正文不跟着变',
    ],
    en: [
      'The math font now applies only to formulas, chemistry notation, figure labels and equations; Chinese descriptions and ordinary English prose keep the body font',
      'Chinese apparatus names and captions in figures use the body font, while chemical formulas and physics symbols keep the math font',
      'English answers follow the same rule: only formulas switch fonts, not the surrounding prose',
    ],
  },
  {
    ver: '4.0.3',
    date: '2026-10-27',
    zh: [
      '数理字体改成单个开关：开启后公式、化学式和它们下面的说明文字统一用衬线，关闭统一用无衬线，不再出现一半衬线一半黑体',
      '修复数学公式里的数字被单独排成无衬线、图形下方说明不跟随数理字体的问题',
      '更新日志每次打开都会回到顶部，不再停在上一页的滚动位置',
      '化学装置图重画导气管与铁架台：试管夹真正夹住试管、导管从瓶口进入，洗气瓶和干燥管接侧管而不是插进管身',
      '化学图加上考试卷式指向标注：仪器名、试剂名和反应方程式直接标在图上',
      '过滤、蒸发、称量、量取和配制溶液也补齐仪器指向标注，不再只有装置没有名称',
      '物理受力图补上斜面法向的 N、摩擦力方向、力的大小和文字说明；抛体图标出最高点与高度，三棱镜标出白光、红光和紫光',
    ],
    en: [
      'Math font is now one switch: serif for formulas, chemistry and the explanatory text beneath them; sans when off, with no more mixed serif/sans blocks',
      'Fixed numbers inside formulas falling back to sans and figure captions not following the math font',
      'The changelog now starts at the top every time instead of keeping the previous scroll position',
      'Chemistry apparatus connections redrawn: the clamp actually grips the test tube, gas tubes enter through the jar mouth, and wash bottles/drying tubes connect at their side ports',
      'Chemistry figures now use exam-style leader labels for apparatus names, reagents and the reaction equation',
      'Filtration, evaporation, weighing, measuring and solution preparation now carry apparatus leader labels too',
      'Physics force diagrams add the incline normal N, friction direction, force values and captions; projectiles mark the apex and height, and prisms label white, red and violet light',
    ],
  },
  {
    ver: '4.0.2',
    date: '2026-10-27',
    zh: [
      '函数绘图补齐分段函数、极坐标/螺线、参数方程，定义域端点会自动画空心/实心圈和竖向虚线',
      '三角函数、反三角、双曲、取整、符号、max/min 等小众函数都能画，跳跃和渐近线自动断开',
      '物理新增多力受力图、运动学 v-t/x-t 图、抛体轨迹、三棱镜色散、电场线，复杂电路支持电桥和双回路',
      '化学新增多试管、烧瓶、洗气除杂、焰色试验、电解，以及洗气瓶、干燥管、坩埚、研钵、分液漏斗等仪器',
    ],
    en: [
      'Function plots now support piecewise, polar/spiral and parametric curves, with open/closed endpoint dots and dashed domain guides',
      'Trig, inverse trig, hyperbolic, floor/ceil, sign, max/min and other niche functions render correctly, with jumps and asymptotes split',
      'Physics adds multi-force diagrams, v-t/x-t kinematics, projectile paths, prism dispersion and field lines; circuits support bridge and two-loop models',
      'Chemistry adds multiple test tubes, flasks, gas purification, flame tests and electrolysis, plus wash bottles, drying tubes, crucibles, mortars and separatory funnels',
    ],
  },
  {
    ver: '4.0.1',
    date: '2026-10-27',
    zh: [
      '高锰酸钾制氧气这类化学实验题，解题页也会自动配装置图了，和课程、刷题、主聊天保持一致',
      '涉及制取气体、过滤、蒸发、蒸馏、称量、配制溶液、滴定、还原氧化铜的实验题，都会强制配一张 chem 装置图',
      '设置新增「数理字体」：可在衬线（考试卷那种带小脚）和无衬线之间切换，只改数学和化学的字母，正文汉字与普通英文不动',
      '图形里的字母标注跟着数理字体走，化学仪器中文名仍保持正文字体',
    ],
    en: [
      'Chemistry experiment questions such as heating potassium permanganate to make oxygen now get an apparatus figure on the solution page too, matching Courses, Practice and the main chat',
      'Experiment questions involving gas preparation, filtration, evaporation, distillation, weighing, solution preparation, titration or copper oxide reduction always include a chem apparatus figure',
      'Settings gains a Math & chemistry font switch: choose serif (the exam-paper look with small feet) or sans, affecting only letters in math and chemistry while body text stays unchanged',
      'Figure labels follow the same math font, while Chinese instrument names in chemistry diagrams keep the body font',
    ],
  },
  {
    ver: '4.0.0',
    date: '2026-10-26',
    zh: [
      '刷题改用引导页：学段、年级、科目、题型、难度、题量、教材范围、节奏一屏一步，教材和章节可以多选，放不下才分两列',
      '刷题中途退出会弹和游戏一样的暂停窗：继续、重开一轮、保存并退出，下次进来接着刷',
      '新增化学实验装置图：酒精灯、烧杯、试管、锥形瓶、铁架台、托盘天平、漏斗、长颈漏斗、蒸发皿、玻璃棒、量筒、集气瓶、水槽、导气管、冷凝管、滴定管等仪器都能画，还能拼成 15 套常考装置，风格跟考试卷一致',
      '出题按难度和题型分开生成，题量会攒够再开刷；答完立即可看详解，还能点「进入对话」带着这道题去问老师',
      '课程可以拆到小节、随时换老师；错题本的公式正常显示，内容不再顶出屏幕，外部存的错题也能一键生成 AI 分析',
    ],
    en: [
      'Practice now opens with a step-by-step wizard: stage, grade, subject, question types, level, count, textbook scope and pace, one screen per step, with multi-select scopes and two-column layout only when needed',
      'Leaving a practice run shows the same pause sheet as the games: resume, restart, or save and quit, and the next visit continues where you stopped',
      'New chemistry apparatus figures: alcohol lamps, beakers, test tubes, conical flasks, iron stands, balances, funnels, thistle tubes, evaporating dishes, glass rods, measuring cylinders, gas jars, water troughs, delivery tubes, condensers and burettes, combinable into 15 standard setups in exam-paper line-art style',
      'Questions are generated per level and type, and the count is filled up before the run starts; explanations stream in after each answer with a jump into the teacher chat',
      'Courses can be split into sections and teachers swapped anytime; notebook formulas render properly, long content no longer overflows, and saved mistakes can generate an AI analysis in one tap',
    ],
  },
  {
    ver: '3.1.2',
    date: '2026-10-23',
    zh: [
      '游戏区字体跟全站统一：iOS 走系统苹方，Android 和鸿蒙用站内改名字体，canvas 里的字也不再写死 system-ui',
      '头目血条文字挪到血条下方并带上血量，不再压住“第几波 · 积分”那行',
      '降尘按钮改成独占一行，文字不再被裁掉半截',
      '爆破能手装好炸药就先预览：红色块会直接炸毁、橙色块受损、虚线圈是影响范围，数据条多一格“预计破坏”',
      '结算积分按 3.5% 折算留到下一局，也能直接兑换额度，兑换仍受每天 3 次限制',
    ],
    en: [
      'Game screens now follow the site font stack: system PingFang on iOS, the bundled renamed font on Android and HarmonyOS, and canvas text no longer hardcodes system-ui',
      'The boss health label moved below its bar with the exact HP, so it no longer covers the wave and score line',
      'The dust-suppression button now takes a full row, so its label is no longer clipped',
      'Demolition previews the blast before firing: red blocks will be destroyed, amber blocks damaged, dashed circles show each charge radius, and the HUD adds an expected-destruction cell',
      'End-of-game points convert 3.5% into carry-over points for the next run, or can be exchanged for quota, still capped at three exchanges per day',
    ],
  },
  {
    ver: '3.1.1',
    date: '2026-10-23',
    zh: [
      '爆破能手整体降难度：每关预算提高、炸药威力与范围加大、炸药和导火线降价，新增「大型聚能」和花钱降尘，第一关目标从 62% 降到 45%',
      '爆破验收不再卡「预算使用率」，只看破坏率、污染、地基和清运率；结算改成分行显示，不会再出现第二行只剩一个字',
      '全部击毙的 AI 队友改成自己走位：有敌人就拉到中距离绕圈输出，没敌人再跟队，不再贴着你转',
      '全部击毙打完一波不再卡住：商店改成盖在战场上的浮层，开店时暂停渲染，点「继续」立刻接着打',
      '修了摇杆可能卡住页面的问题，切到后台自动暂停渲染',
    ],
    en: [
      'Demolition is easier across the board: bigger budgets, stronger and wider charges, cheaper charges and fuses, a new heavy shaped charge and paid dust suppression, and the first target drops from 62% to 45%',
      'Demolition no longer fails on budget usage, only on destruction, pollution, foundation damage and cleanup; results now render as separate lines instead of one orphaned character',
      'The Kill Them All ally now moves on its own: it keeps mid range and circles enemies, and only follows you when the field is clear',
      'Kill Them All no longer stalls after a wave: the shop is an overlay on the battlefield, rendering pauses while it is open, and Continue resumes instantly',
      'Fixed a joystick issue that could lock the page, and rendering now pauses when the app goes to the background',
    ],
  },
  {
    ver: '3.1.0',
    date: '2026-10-23',
    zh: [
      '台球加了计分板：谁打全色谁打花色、各自还剩几颗球一眼看清；8 号提前落袋、清台后打进 8 号都会写清谁赢谁输、为什么',
      '保龄球改成固定步长物理，球和球瓶不再一抖一抖，撞瓶的动量传递也顺了',
      '新增游戏「全部击毙」：和 AI 队友并肩，敌人会开枪也会扔手雷，第 3 波小头目、第 5 波大头目都带血条，五波通关，积分能买穿甲弹、快枪管、防弹插板、队友补给和手雷',
      '「全部击毙」的积分还能换额度：600 分换 1 点，每天最多 3 点，服务端限次',
      '新增游戏「爆破能手」：预算固定，自己买炸药、导火线、起爆器，拆木桥、砖楼、水塔、石山、化工厂五关；污染、地基损毁、火灾风险、渣土清运比例、预算使用率都达标才算验收通过',
    ],
    en: [
      'Pool now has a scoreboard showing each side group and remaining balls, and every 8-ball finish states who won, who lost and why',
      'Bowling physics moved to a fixed timestep, so the ball and pins no longer judder and momentum transfers cleanly',
      'New game Kill Them All: fight alongside an AI ally against gunmen and grenade throwers, with a mini-boss on wave 3 and a health-bar boss on wave 5, earning points for armor-piercing rounds, a faster barrel, body armor, ally supplies and grenades',
      'Points from Kill Them All can be traded for quota: 600 points per point, up to 3 per day, capped server-side',
      'New game Demolition Expert: a fixed budget for charges, fuses and a detonator across five jobs - bridge, brick block, water tower, rock hill and chemical plant - passing only when pollution, foundation damage, fire risk, debris removal and budget usage all meet the spec',
    ],
  },
  {
    ver: '3.0.0',
    date: '2026-10-23',
    zh: [
      '新增游戏「勇往直前」：横版跑酷，跳过地刺与方块，下滑躲子弹，距离越快分越高，五档难度对应不同生命与出怪节奏',
      '新增游戏「疯狂虾虾」：未探索的迷宫看不见，边摸路边躲龙虾，熄灯一到敌人僵住你能动，捡加速、分身、隐身三样道具逃出口',
      '画图修正：支持 canvas/curves 这套新格式，隐式方程的双曲线、椭圆、圆都能画，渐近线用虚线',
      '长答案输出上限提到 6000 token，不会再说到一半被截断',
      '学习画图不再卡正文：画图块一闭合就先出图，后面的文字继续流',
      '追问改为只在一条都没生成时补一次，不再覆盖已经生成的建议',
    ],
    en: [
      'New game Forward: a side-scrolling runner where you jump spikes and blocks, slide under bullets and bars, and score by distance, with five difficulty tiers changing lives and spawn rhythm',
      'New game Crazy Shrimp: an unexplored maze stays dark, lobsters hunt you while you map it out, blackouts freeze them while you keep moving, and speed, decoy and invisibility pickups help you reach the exit',
      'Drawing fix: the canvas/curves format is now supported, so implicit hyperbolas, ellipses and circles render, with dashed asymptotes',
      'Output limit raised to 6000 tokens so long answers are no longer cut off midway',
      'Study drawings no longer stall the text: the figure appears as soon as its block closes while the rest keeps streaming',
      'Follow-ups now retry only when none were generated, so good suggestions are no longer overwritten',
    ],
  },
  {
    ver: '2.0.0',
    date: '2026-10-22',
    zh: [
      '场景应答扩充到 24 个生活与进阶场景，并支持自定义场景：5–50 字描述情境，保存后随时再练',
      '英语点词修复缩写：U.S.、e.g.、don’t、I’m 这类词现在能整体点开查词',
      '登录页重做：毛玻璃卡片、渐变光晕与更清晰的输入聚焦，手机端自动收起左侧介绍',
      '修复登录页闪屏：未登录时主界面不再露出来，不会再闪到「还没开始聊天」的空页面',
      '新用户默认额度调整为 100',
      '搜索升级：情绪标签与搜索共用同一套同义词，搜「开心 / 喜悦 / 兴奋」都能命中心情；学习记录也并入搜索结果',
      '学习对话改为流式输出，首字更快；等待时显示骨架屏，长答案不再干等',
    ],
    en: [
      'Scenario practice now has 24 everyday and advanced scenes, plus custom scenes described in 5–50 characters and saved for later',
      'Word lookup now handles abbreviations: U.S., e.g., don’t and I’m can be tapped as one word',
      'Redesigned sign-in with a glass card, gradient glow and clearer input focus; the intro column collapses on phones',
      'Fixed the sign-in flash: the main screen stays hidden while signed out, so it no longer leaks the empty chat page',
      'Default quota for new users is now 100',
      'Search upgrade: feelings and search share one synonym map, so queries like happy, joy or excited match tagged moods; study records are included too',
      'Study conversations now stream, with a skeleton while waiting instead of a long blank pause',
    ],
  },
  {
    ver: '0.9.74',
    date: '2026-10-21',
    zh: ['历史抽屉打开时不再让卡片和骨架屏一起动，先渲染再滑动，低端机更稳', '切换历史会先收起抽屉，再让对话淡入，不再瞬间跳变'],
    en: ['The history sheet no longer animates every card and skeleton while sliding in, so it stays smoother on slower phones', 'Switching history now closes the sheet first and fades the conversation in instead of jumping'],
  },
  {
    ver: '0.9.73',
    date: '2026-10-21',
    zh: ['学习历史改成近满屏抽屉，顶部小条可以下滑关闭，点空白处也会降下', '历史记录显示约十个字的 AI 概括，点一条直接接着聊', '新增全局触感反馈，设置页可以关闭，也可以点「轻震」试一下', '抽屉去掉了全屏模糊和多余缩放，滑动更轻快'],
    en: ['Study history is now a near-full-height sheet that can be pulled down from the handle or dismissed by tapping outside', 'History rows show a short AI summary and reopen the conversation in one tap', 'Global haptics are now available, with an on/off switch and a Try button in Settings', 'The sheet drops the full-screen blur and extra scaling for a lighter feel'],
  },
  {
    ver: '0.9.65',
    date: '2026-10-21',
    zh: ['兴趣页改为大分类气泡，点一个分类会破裂成对应子分类', '气泡缩小、边框和模糊减轻，不再出现黑色选中气泡', '气泡出现时直接落在最终位置，不再先堆在中间散开', '修复气泡层级和重叠，拖动时始终在最上层', '生日滚轮改回苹方字体', 'emoji 切换改成双层交叉淡入，取消模糊卡顿', '键盘弹起不再压缩整页高度，减少变形'],
    en: ['The interest step now starts with large category bubbles that burst into their subtopics', 'Bubbles are smaller, with lighter borders and blur, and selected bubbles no longer turn black', 'Bubbles appear directly in their final positions instead of piling up in the center first', 'Bubble stacking and overlap are fixed, and dragged bubbles stay on top', 'The birthday wheel now uses PingFang instead of the title font', 'Emoji switching now crossfades between two layers without the blurry lag', 'The keyboard no longer compresses the whole page height, reducing layout distortion'],
  },
  {
    ver: '0.9.64',
    date: '2026-10-21',
    zh: ['拖动气泡时跟手移动，不再等松手才动', '气泡破裂不再先变黑，整颗一起淡出', '生日滚轮加大，年龄说明更清楚', '引导页不再自动弹键盘，键盘弹起更稳，继续按钮居中', '第一页右上角不再文字重叠，新增「跳过」引导'],
    en: ['Bubbles now follow your finger while dragging instead of waiting for release', 'Popped bubbles fade out as a whole instead of turning black first', 'The birthday wheel is larger and the age hint is easier to read', 'Onboarding no longer opens the keyboard automatically, the keyboard transition is steadier, and the continue button is centered', 'The overlapping text in the top-right of the first page is fixed, and onboarding now has a Skip button'],
  },
  {
    ver: '0.9.63',
    date: '2026-10-21',
    zh: ['首屏 emoji 先预加载再切换，不再闪回旧图或停在原图', '生日改成上下滑动的年月日滚轮，按月份自动校正天数', '改助理名后，聊天里已经显示的旧名字一起更新', '拖动气泡不再误触破裂，破裂动画固定在原位，不会跳到角落'],
    en: ['The intro emoji now preloads before switching, so it no longer flashes back to the previous image', 'Birthday now uses a scrollable year/month/day wheel that keeps the day valid for the selected month', 'Renaming the assistant now updates names already shown in existing chats', 'Dragging a bubble no longer triggers a pop by accident, and the burst animation stays in place instead of jumping to a corner'],
  },
  {
    ver: '0.9.62',
    date: '2026-10-21',
    zh: ['兴趣气泡改成点一下就破，气泡铺满整屏，不再只是小框里挪动', '引导文案和步骤收短，去掉重复的小字和多余提示', '键盘弹起时暂停背景动效与模糊层，输入框更跟手', '首屏 emoji 换成 Apple 表情图片，不再用系统字体', '设置里新增「重新填写引导」，保留原有资料，可改称呼、生日和兴趣'],
    en: ['Interest bubbles now pop on tap and fill the whole screen instead of staying in a small panel', 'Onboarding copy and steps are shorter, with repeated hints removed', 'Background motion and blur pause while the keyboard is up, so typing feels lighter', 'The intro emoji now uses Apple emoji artwork instead of the system font', 'Settings gains “Edit onboarding”, keeping existing data while letting you change your name, birthday and interests'],
  },
  {
    ver: '0.9.61',
    date: '2026-10-21',
    zh: ['新用户注册后进入七步引导：介绍、助理名、称呼、性别、生日、兴趣、欢迎', '引导采用模糊渐显渐隐和背景形变，不是横向翻页', '兴趣有 100 个气泡标签，支持拖动和手机倾斜物理效果', '生日自动推算年龄，资料只用于个性化聊天'],
    en: ['New users now get a seven-step onboarding: intro, assistant name, your name, gender, birthday, interests, welcome', 'Onboarding uses blur fades and a morphing background instead of horizontal pages', 'Interests include 100 bubble tags with drag and tilt physics', 'Birthday infers age, and the data is used only to personalise chat'],
  },
  {
    ver: '0.9.60',
    date: '2026-10-21',
    zh: ['预览里的表情会跟着名字走，不叫虾虾就不再出现🦞', '重新顺了一遍预览句子，语气词、追问和收尾更像正常聊天', '聊天提示词补上接话方式：先回应，再最多追问一个具体问题；风格冲突时以自然、自洽为准'],
    en: ['Preview emoji now follows the assistant name, so 🦞 only appears for a name with 虾', 'Preview wording, tone particles, follow-up, and closing were rewritten to sound like normal chat', 'Chat prompt now asks for one concrete follow-up at most and a coherent blend when sliders conflict'],
  },
  {
    ver: '0.9.59',
    date: '2026-10-21',
    zh: ['句子长度滑块真正控制整句话的长短，低档短、高档长', '每项滑块独立测过，都有六种说法、至少五次变化'],
    en: ['The sentence-length slider now really shortens or lengthens the whole preview', 'Every slider was tested independently with six variants and at least five visible changes'],
  },
  {
    ver: '0.9.58',
    date: '2026-10-21',
    zh: ['七个滑块各拆成六档，每档换一种说法，至少能看到五次变化', '句子长度、语气词、表情数量都单独落到预览里，不再有滑块划了没反应'],
    en: ['Each of the seven sliders now has six bands and at least five visible changes', 'Sentence length, tone particles, and emoji count each affect the preview independently'],
  },
  {
    ver: '0.9.57',
    date: '2026-10-21',
    zh: ['性格预览改成一句真正会说的日常话，标签不再露在外面', '聊天提示词补了一句：别自称性格标签，把性格落在措辞里'],
    en: ['Personality preview is now a real everyday line instead of visible trait labels', 'Chat prompt now explicitly tells it not to name its own traits, but to show them in wording'],
  },
  {
    ver: '0.9.56',
    date: '2026-10-21',
    zh: ['性格预览改成正常说话的句子，并加一个两字标签', '七项滑块各分六档，拖动时预览文字跟着变，不再只在临界点跳'],
    en: ['Personality preview now reads like a normal sentence and shows a two-character label', 'Each slider has six bands, so the preview text moves with it instead of only changing at thresholds'],
  },
  {
    ver: '0.9.55',
    date: '2026-10-21',
    zh: ['助理页去掉左侧表情块，名字改成跟着输入框实时变', '性格区加了一句实时预览，拖滑块就能看到它变成什么样'],
    en: ['Assistant page drops the left emoji block; the name now updates live as you type', 'Personality section gains a live one-line preview that changes as you drag the sliders'],
  },
  {
    ver: '0.9.54',
    date: '2026-10-21',
    zh: ['抽屉里新增「助理」页：名字、你的名字、简介、形象、记忆都能自己改', '七项性格滑块加四套预设，滑动带震动，毒舌拉太满会先提醒一句', '助理日记会自动写：聊得多一天一篇、聊得少一周一篇，静默生成，写在助理页里'],
    en: ['New Assistant page in the drawer: edit its name, your name, bio, persona and memory', 'Seven personality sliders with four presets, haptics while dragging, and a heads-up before maxing out sharpness', 'Assistant diary writes itself: daily when you talk a lot, weekly when you do not, generated silently and shown on the page'],
  },
  {
    ver: '0.9.53',
    date: '2026-10-21',
    zh: ['空日记里先点格式按钮会真正亮起，再点一次就灭，不用先去点空白处', '点亮后直接打字就带格式，粗体、斜体、下划线、点线、删除线、字色、高亮都按亮着的状态走', '有文字时再点同一个按钮仍是取消格式，和新按钮状态不打架'],
    en: ['Format buttons now genuinely latch on an empty diary page, and tapping the same button again turns them off without tapping blank space first', 'Typing right after latching carries the format: bold, italic, underline, dotted underline, strike-through, colour and highlight all follow the lit state', 'With text present the same button still toggles the format off, so the new latch state and the old behaviour stay consistent'],
  },
  {
    ver: '0.9.52',
    date: '2026-10-21',
    zh: ['字色/高亮面板改成贴底固定面板，不再被手机系统的复制粘贴浮层挡住', '不选中也能改：光标点进文字里，直接点颜色、下划线、点线、粗斜体就能改这一段', '下划线与点线改成同一套切换逻辑，实线转点线、点线转实线不再叠加出错', '嵌套格式的判定改成往祖先层查，按钮高亮状态跟实际显示一致'],
    en: ['Colour and highlight panels now dock to the bottom of the screen, clear of the system copy/paste popup', 'Tap-to-format: with the caret inside text, colour, underline, dotted underline, bold and italic apply to that run without selecting first', 'Solid and dotted underlines share one toggle path, so switching between them no longer stacks or doubles up', 'Format state now checks ancestors, keeping toolbar highlights in sync with what is actually shown'],
  },
  {
    ver: '0.9.4',
    date: '2026-10-20',
    zh: ['根号不再露出标签文字：数学排版改为先挖出来占位、正文单独渲染、最后塞回', '根号头按内容拉伸，分式包得住，不再诡异', '分式的斜杠写法自动转成上下两行', '数学字体统一一套，变量斜体、数字正体，字距一致', '主聊天流式过程也走排版，不再当场露出代码和标记', '画图容错大幅加强：中文引号、代码块、漏 type 都能画'],
    en: ['Radical signs no longer leak markup: math is extracted before markdown runs, then restored', 'Radicals stretch to fit their contents, fractions included', 'Slash-written fractions become proper stacked fractions', 'One math font family: italic variables, upright digits, even spacing', 'Main chat now typesets while streaming instead of flashing raw markup', 'Drawing tolerates Chinese quotes, code fences, and missing type fields'],
  },
  {
    ver: '0.9.3',
    date: '2026-10-19',
    zh: ['平面几何、立体几何真的能画了，主聊天里也会把图渲染出来', '函数图支持指定区间，支持把曲线和 x 轴之间填成实心', '解不等式会画解集色带，不再出现代码', '画图规则重写，模型不会再输出程序代码'],
    en: ['Plane and solid geometry now render properly, including inside the main chat', 'Function graphs support a domain and can fill the area between curve and axis', 'Inequalities render a shaded solution band instead of code', 'Drawing rules rewritten so the model stops emitting program code'],
  },
  {
    ver: '0.9.2',
    date: '2026-10-19',
    zh: ['修好了解题点「开始」没反应', '根号头会随内容自动变高，根号里放分式也包得住', '不等式左边不再丢，符号两侧留出间距', '数学里的数字固定正体，不再和衬线斜体打架'],
    en: ['Fixed the Solve button doing nothing when tapped', 'Radical signs now stretch to fit their contents, including fractions', 'No more missing left-hand side in inequalities, operators get proper spacing', 'Numbers in math stay upright instead of clashing with serif italics'],
  },
  {
    ver: '0.9.1',
    date: '2026-10-19',
    zh: ['解题和翻译后面可以接着问了，答案是接着聊不是重新来过', '画图脚本不再漏成代码：没包裹的 JSON 也能认出来并画成图', '化学方程式等号拉长加粗，条件和正文同一行对齐不再下沉', '化学整体改用正文那套字体，不再突兀', 'LaTeX 标点自动换成中文标点'],
    en: ['You can now keep asking follow-up questions after a solution, with full context', 'Drawing scripts no longer leak as raw code: unwrapped JSON is detected and rendered', 'Chemistry equals sign is longer and bolder, conditions align on the same baseline', 'Chemistry now uses the same typeface as body text', 'LaTeX punctuation is converted to proper Chinese punctuation'],
  },
  {
    ver: '0.9.0',
    date: '2026-10-19',
    zh: ['能画三角形和立体几何了（正方体、棱锥、圆柱、圆锥，藏住的棱用虚线）', '坐标系规范了：格子等宽、两轴都有箭头、曲线和交点都落在格上', '集合题、练习题里的数学全部走数学排版，不再露代码', '化学方程式改成等号，条件写在等号上方或下方', '数学里不再出现 > <，统一成规范符号'],
    en: ['Triangles and solid geometry now draw properly, including cubes, pyramids, cylinders and cones with hidden edges dashed', 'Coordinate system normalised: even grid, arrows on both axes, curves land on grid lines', 'Math in sets and practice questions is typeset properly with no raw code', 'Chemistry equations use an equals sign with conditions above or below', 'No more stray > or < inside math, they render as proper symbols'],
  },
  {
    ver: '0.8.9',
    date: '2026-10-19',
    zh: ['几何图的 A B C D 改成数学衬线斜体加粗', '顶点标注会按图形外侧自动让开，不再压线', '坐标轴补上原点 O 和 x、y 轴标', '新增角标记，直角自动画小方框', '安卓上用真斜体，不再是机械倾斜'],
    en: ['Geometry vertex labels A B C D now use bold italic math serif', 'Vertex labels move outward automatically so they no longer sit on the lines', 'Axes now show origin O and x, y labels', 'New angle marker, right angles drawn as a small square', 'Real italics on Android instead of synthetic slant'],
  },
  {
    ver: '0.8.8',
    date: '2026-10-19',
    zh: ['学习画图重做：函数曲线、几何图全部按真坐标画，不再吐代码', '数理公式改标准衬线，字母变量斜体，分式不再往下飘', '化学方程式有了专属排版：下标、电荷、反应条件', '学习板块的公式和图同步换新排版'],
    en: ['Drawing rebuilt: real function curves and geometry from actual coordinates, no more raw code', 'Math now uses standard serif with italic variables; fractions no longer drop below the line', 'Chemistry equations get their own typesetting: subscripts, charges, reaction conditions', 'Study section uses the same new typesetting'],
  },
  {
    ver: '0.8.7',
    date: '2026-10-19',
    zh: ['修好学习页点击报错', '搜索页重做：高亮、结果数、点结果直接跳到那条消息', '情绪中心没数据时也有完整版面，不再只剩一行字', '抽屉展开更跟手，不再拖影', '充值/日记/文章加载完不再多一次上浮动画'],
    en: ['Fixed the script error when tapping Study items', 'Search rebuilt: highlights, result count, tap a result to jump to that message', 'Emotion centre keeps its full layout even without data', 'Drawer opens smoothly now', 'Top up, diary and article pages no longer replay the rise animation after loading'],
  },
  {
    ver: '0.8.6',
    date: '2026-10-19',
    zh: ['修好二级页返回键点不动的问题', '学习页进入和返回都不再闪', '额度不会再减一次加一次，只在真正扣的时候变', '进聊天直接停在最底部', '充值、日记、文章页加载时显示骨架屏'],
    en: ['Fixed the back button on subpages', 'Study no longer flashes when opening or going back', 'Quota no longer bounces down and up; it only moves when actually deducted', 'Chat opens at the very bottom', 'Top up, diary and article pages now load with a skeleton'],
  },
  {
    ver: '0.8.5',
    date: '2026-10-19',
    zh: ['额度改成发送即扣，点停止也算用掉一次', '修掉额度显示两个数字的问题，全站只认一个快照', '二级页返回改成左箭头，学习返回不再闪', '空情绪格固定浅灰，不再呼吸闪动'],
    en: ['Quota is now deducted the moment you send, even if you stop generation', 'Fixed the quota showing two different numbers at once', 'Subpage back is an arrow now, and returning from Study no longer flashes', 'Empty emotion cells stay flat grey instead of shimmering'],
  },
  {
    ver: '0.8.4',
    date: '2026-10-19',
    zh: ['每条消息自动打情绪标签，情绪中心按真实分布统计', '近义词合并：开心/高兴/快乐算一类', '小情绪固定八格，不够用灰骨架补齐且点不开', '学习二级页右上角改成「返回」，回到学习首页', '修掉页面切换时闪一下的问题'],
    en: ['Every message now gets an emotion tag, the emotion center uses the real distribution', 'Synonyms merged: happy/glad/joyful count as one', 'Always eight emotion cells; empty ones show grey placeholders', 'Study subpages now show Back instead of Close', 'Fixed the screen flashing when switching pages'],
  },
  {
    ver: '0.8.3',
    date: '2026-10-19',
    zh: ['修好情绪中心退不出去的问题', '所有二级页都能正常返回', '页面入场动画结束后不再卡住'],
    en: ['Fixed the emotion center getting stuck open', 'Every subpage can now be dismissed', 'Page entrance animation no longer blocks dismissal'],
  },
  {
    ver: '0.8.2',
    date: '2026-10-19',
    zh: ['学习首页去掉图标，只留文字大块', '学习二级页加入入场动效', '修好深色模式下输入框变白的问题', '统一学习页字体排版'],
    en: ['Study home is text-only tiles now', 'Study detail pages got an entrance animation', 'Fixed white input boxes in dark mode', 'Unified typography across study pages'],
  },
  {
    ver: '0.8.1',
    date: '2026-10-19',
    zh: ['学习改成大块入口，点进去是二级页', '修好礼物卡按钮变黑点不进的问题', '额度到账改用底部横幅提示，不再遮住输入框', '深色模式下学习页配色统一'],
    en: ['Study is now tile-based with its own detail pages', 'Fixed the gift card button going black and blocking the tap', 'Quota arrival now uses a bottom banner clear of the composer', 'Study pages now match dark mode'],
  },
  {
    ver: '0.8.0',
    date: '2026-10-19',
    zh: ['学习中心上线：翻译、解题、练习、错题本、生词本、场景应答、作文指导', '解题和练习会自动配图：坐标系、数轴、抛物线、直线、平面几何、立体截面、圆', '错题本和生词本存在自己账号里，随时翻'],
    en: ['Study center: translation, solving, drills, mistake log, vocabulary, scenario replies, essay coaching', 'Solving and drills draw their own figures: coordinate planes, number lines, parabolas, lines, plane and solid geometry, circles', 'Mistake log and vocabulary are saved to your account'],
  },
  {
    ver: '0.7.2',
    date: '2026-10-19',
    zh: ['礼物卡点击真正打开礼物屏（之前被旧额度逻辑拦掉了）', '领取后额度当场刷新，不再跳来跳去', '重复待领卡自动合并，apple emoji 加兜底', '暑期末班车换成票的图标'],
    en: ['Gift cards now actually open the gift screen (old quota handler was swallowing the tap)', 'Quota refreshes instantly on claim instead of jumping around', 'Duplicate pending gifts are merged; Apple emoji has a fallback', 'The summer code now uses a ticket icon'],
  },
  {
    ver: '0.7.1',
    date: '2026-10-19',
    zh: ['礼物卡背景改成预烘焙遮罩，安卓上不再掉帧', '修领了礼物额度不到账、还能重复领的问题', '礼物卡 emoji 全部换成 Apple 原版图像', '口令改成一次惊喜：兑完不追问，话像虾虾说的'],
    en: ['Gift card backdrop reworked to a pre-baked overlay — no more dropped frames on Android', 'Fixed gifts not crediting quota and being claimable twice', 'Gift emoji now use the original Apple artwork', 'Codes are now a one-shot surprise with no follow-up questions'],
  },
  {
    ver: '0.7.0',
    date: '2026-10-19',
    zh: ['额度礼物卡上线：聊天里出一张卡，点开是模糊背景的礼物屏，领取有彩蛋', '支持全站推送：推的卡会等当前这轮生成完再压在消息最下面', '两个口令已就绪：sd1%中秋节快乐、m3x#暑期末班车'],
    en: ['Quota gift cards: a card in chat opens a frosted gift screen with a surprise on claim', 'Broadcast to all users works — the card waits for the current reply to finish and lands at the bottom', 'Two codes are live: sd1%中秋节快乐 and m3x#暑期末班车'],
  },
  {
    ver: '0.6.1',
    date: '2026-10-19',
    zh: ['文章卡是纯本地卡，不会再失败：生成不出来就是可编辑的草稿骨架', '音乐卡查不到时仍退到 QQ 音乐搜索页'],
    en: ['Article cards are fully local and never fail — a draft skeleton is used if generation is unavailable', 'Music cards still fall back to the QQ Music search page'],
  },
  {
    ver: '0.6.0',
    date: '2026-10-19',
    zh: ['新增文章卡：写完直接在聊天里出一张卡，点开就能读全文', '文章的生成节奏跟音乐卡一致，正文说完才出卡'],
    en: ['New article card: generated right in the chat, tap to read the full text', 'Article cards follow the same rhythm as music cards — the card appears after the reply finishes'],
  },
  {
    ver: '0.5.11',
    date: '2026-10-19',
    zh: ['追问动画放慢，节奏更从容', '回答支持原生数理化符号：π √ ∑ ∪ ∩ ⊆ ∅ 和分式、根号、上下标'],
    en: ['Follow-up entrance slowed down', 'Replies now render native math and chemistry notation: π √ ∑ ∪ ∩ ⊆ ∅ plus fractions, radicals and scripts'],
  },
  {
    ver: '0.5.10',
    date: '2026-10-19',
    zh: ['追问入场幅度收敛到比原来稍大一点，力度更自然'],
    en: ['Follow-up entrance dialed back to just slightly stronger than before'],
  },
  {
    ver: '0.5.9',
    date: '2026-10-19',
    zh: ['追问入场动画更足：位移更大、缩放更明显、带回弹', '菜单抽屉加了圆角', '启动时先留启动页，判断已登录就直接进主界面，不再闪一下登录页'],
    en: ['Follow-up entrance has more punch: larger travel, clearer scale, a real bounce', 'The drawer menu now has rounded corners', 'The app now stays on the splash while checking auth, so signed-in users skip the login flash'],
  },
  {
    ver: '0.5.8',
    date: '2026-10-19',
    zh: ['追问入场改为 CSS 强制回流驱动，不再依赖 WAAPI，任何环境都能播放', '消息头四项字色、字号、字重统一'],
    en: ['Follow-up entrance now driven by CSS with a forced reflow, no WAAPI dependency', 'Header items share consistent color, size and weight'],
  },
  {
    ver: '0.5.7',
    date: '2026-10-19',
    zh: ['追问入场动画改为挂载后触发，流式与历史两种路径都能看到', '三条追问依次浮起，收口更柔和'],
    en: ['Follow-up entrance now fires after mount, covering both streaming and restored messages', 'The three suggestions rise in sequence with a softer settle'],
  },
  {
    ver: '0.5.6',
    date: '2026-10-19',
    zh: ['追问入场改用 Web Animations API 驱动，任何系统设置下都能看到', '关闭「显示追问」后会即时清掉已有追问，不再残留隐藏元素'],
    en: ['Follow-up entrance now driven by the Web Animations API, visible under any system setting', 'Turning off follow-ups clears existing ones immediately instead of leaving hidden nodes'],
  },
  {
    ver: '0.5.5',
    date: '2026-10-19',
    zh: ['修复追问入场动画完全不播放的问题', '追问动画收口更稳，不再闪一下'],
    en: ['Fixed follow-up entrance animation not playing at all', 'Follow-up entrance settles cleanly without flicker'],
  },
  {
    ver: '0.5.4',
    date: '2026-10-19',
    zh: ['追问入场改为 Apple 风格：轻微上浮、极短缩放，弹簧收口，去掉模糊与斜切', '三条追问依次浮起，间隔更均匀'],
    en: ['Follow-up entrance now follows Apple\'s style: a short rise with a subtle scale and a spring settle, no blur or skew', 'The three suggestions rise in a steadier sequence'],
  },
  {
    ver: '0.5.3',
    date: '2026-10-19',
    zh: ['追问入场改成一次性弹到位，劲更足，去掉多余回弹', '引用飞入后不再卡一帧', '点击追问：那条胶囊飞到输入区，变成你的消息气泡'],
    en: ['Follow-ups now snap into place in one motion with more punch', 'Fixed the one-frame hitch after the quote animation', 'Tapping a follow-up flies it into the composer as your own message bubble'],
  },
  {
    ver: '0.5.2',
    date: '2026-10-19',
    zh: ['追问跟着回复同时出现，不再二次等待', '追问动画放慢、加大过冲，模糊更轻更短，一条接一条', '追问人称呼应、逻辑衔接、内容贴合本句都做了约束', '实时消息也带全「虾虾·时间·引用·删除」，可用', '点击引用：旧引用条收起，被引用的那条飞到输入框并回弹'],
    en: ['Follow-ups arrive together with the reply', 'Softer, bouncier follow-up animation with lighter blur, cascading one by one', 'Follow-ups now respect person, logic and the current answer', 'Live messages get the full header including quote and delete', 'Tapping quote collapses the old chip and flies the quoted message down into the composer with a bounce'],
  },
  {
    ver: '0.5.1',
    date: '2026-10-19',
    zh: ['修复追问动画被通用动效覆盖、看起来没变化', '追问不再等几秒才出现，跟着回复一起到', '追问不再补“想聊点啥”这种助手口吻的凑数句'],
    en: ['Fixed the follow-up animation being overridden by a generic one', 'Follow-ups arrive with the reply instead of seconds later', 'No more assistant-voiced filler like "what do you want to chat about"'],
  },
  {
    ver: '0.5.0',
    date: '2026-10-19',
    zh: ['追问系统重做：口吻改为用户本人，会学用户的说话方式', '追问紧扣回答内容，不再出现“说详细点”这类空话', '追问弹出改为左上到右下的形变，带运动模糊、自上而下依次出现'],
    en: ['Follow-ups rewritten in the user\'s own voice, adapting to how you talk', 'Suggestions now stick to the answer instead of generic filler', 'Follow-ups morph in from top-left to bottom-right with motion blur, cascading downward'],
  },
  {
    ver: '0.4.4',
    date: '2026-10-19',
    zh: ['修复字号调节点了没反应', '字号放大时气泡、圆角、内边距和输入框一起变大'],
    en: ['Font size control actually works now', 'Bubbles, corner radius, padding and the composer scale with the font size'],
  },
  {
    ver: '0.4.3',
    date: '2026-10-19',
    zh: ['扇区百分比文字统一朝向圆心，小扇区也标得下', '情绪中心加载态换成贴合版式的灰色骨架'],
    en: ['Slice percentages now face the center, including narrow slices', 'Emotion center loading state uses a layout-matched skeleton'],
  },
  {
    ver: '0.4.2',
    date: '2026-10-19',
    zh: ['扇形图恢复百分比标注在扇区内，点击放大照旧', '排版保持大情绪、小情绪、扇形图、虾虾的话', 'Q 弹动画修正，去掉卡顿感'],
    en: ['Slice percentages are back inside the chart', 'Layout order unchanged', 'Bounce animation smoothed out'],
  },
  {
    ver: '0.4.1',
    date: '2026-10-19',
    zh: ['百分比改为点击后折线引出显示', '扇形图移到小情绪与虾虾的话之间', '大情绪回到顶部，大小情绪都有 Q 弹动画与震动'],
    en: ['Percentages now appear via a leader line after tapping a slice', 'Chart moved between the emotion grid and 虾虾 note', 'Hero emotion back on top; both hero and cells bounce with haptics'],
  },
  {
    ver: '0.4.0',
    date: '2026-10-19',
    zh: ['情绪中心新增环形扇形图，入场带运动模糊', '扇区可点击放大，中央显示该块百分比', 'emoji 点击加 Q 弹动画与震动反馈'],
    en: ['Emotion center gets a donut chart with motion-blur entrance', 'Each slice enlarges on tap and shows its own percentage', 'Emoji taps now bounce and vibrate'],
  },
  {
    ver: '0.3.23',
    date: '2026-10-19',
    zh: ['三个点回到它该在的位置：只在虾虾还没开口时转，文字一出就收起', '骨架卡独立挂在文字下方'],
    en: ['Typing dots back to their job: they spin only before the reply starts', 'Card skeleton sits under the text on its own'],
  },
  {
    ver: '0.3.22',
    date: '2026-10-19',
    zh: ['虾虾、时间、引用、删除改为居左，用间隔点分开', '音乐卡恢复骨架占位，三个点留在文字下方继续转', '放歌只放真实匹配的曲目，点类型不再放错歌', '历史恢复更稳，单条消息渲染失败不再整页清空'],
    en: ['Header row left-aligned with dot separators', 'Music card skeleton is back while the dots keep spinning under the text', 'Only verified songs play, genre requests no longer fetch the wrong track', 'History restore is sturdier: one bad message no longer wipes the page'],
  },
  {
    ver: '0.3.21',
    date: '2026-10-19',
    zh: ['虾虾、时间、引用、删除回到虾虾气泡上方', '用户气泡下方只留时间'],
    en: ['Name, time, quote and delete sit above the assistant bubble again', 'User bubbles keep only a timestamp underneath'],
  },
  {
    ver: '0.3.20',
    date: '2026-10-19',
    zh: ['音乐回复按场景分别处理：点名、点类型、随便放、换一首', '点类型时不再把类型当成歌名', '音乐卡后台预取不提前露骨架，文字下方三个点照常转'],
    en: ['Music replies now branch by scene: named, genre, free pick, and switch', 'Genre words are no longer mistaken for song titles', 'Music card preloads quietly while the typing dots keep spinning'],
  },
  {
    ver: '0.3.19',
    date: '2026-10-19',
    zh: ['时间、引用、删除改为每条消息强制渲染', '用户消息同样带消息头'],
    en: ['Time, quote and delete now render on every message', 'User messages carry the header too'],
  },
  {
    ver: '0.3.18',
    date: '2026-10-19',
    zh: ['消息头恢复虾虾、时间、引用、删除四项，固定全部显示', '时间改为按消息真实时间显示', '引用与删除固定在右侧不再被挤掉'],
    en: ['Message header shows name, time, quote and delete every time', 'Time comes from the real message timestamp', 'Quote and delete pinned to the right so they never drop out'],
  },
  {
    ver: '0.3.17',
    date: '2026-10-19',
    zh: ['输入框与发送键彻底分离：框是框，按钮是旁边的独立圆钮', '分离后仍保持同一水平线、位置不变'],
    en: ['Field and send button fully separated: a field plus a standalone round button', 'Still on the same baseline, same position'],
  },
  {
    ver: '0.3.16',
    date: '2026-10-19',
    zh: ['发送键回到输入框内原位', '输入区上下留白回到 22px', '保留顶部的向上淡出羽化'],
    en: ['Send button back inside the field in its original spot', 'Composer vertical padding back to 22px', 'Kept the upward fade at the top'],
  },
  {
    ver: '0.3.15',
    date: '2026-10-19',
    zh: ['发送键保持在右侧原位独立', '输入区上下留白统一'],
    en: ['Send button stays in place on the right, just detached', 'Composer vertical spacing evened out'],
  },
  {
    ver: '0.3.14',
    date: '2026-10-19',
    zh: ['发送与停止键独立成圆形按钮，脱离输入框', '输入区上下留白统一为 24px', '输入区顶部改为真正的向上淡出过渡'],
    en: ['Send and stop are now a standalone round button beside the field', 'Composer vertical padding unified at 24px', 'Proper upward fade at the top of the composer'],
  },
  {
    ver: '0.3.13',
    date: '2026-10-19',
    zh: ['输入区上下内边距统一为 22px', '羽化改用可见的柔光过渡层，不再依赖会被裁掉的遮罩模糊'],
    en: ['Composer vertical padding unified at 22px', 'Feather now uses a visible soft-light layer instead of a masked blur'],
  },
  {
    ver: '0.3.12',
    date: '2026-10-19',
    zh: ['输入框左边距提升到 20px 并强制生效', '输入区上方羽化改为不遮挡胶囊的独立虚化层', '顶栏磨砂加深，背后内容透得更明显'],
    en: ['Composer left inset raised to 20px and enforced', 'Top fade rebuilt as a separate blur layer that never touches the chip', 'Deeper app bar frost so content reads through'],
  },
  {
    ver: '0.3.11',
    date: '2026-10-19',
    zh: ['去掉输入区渐变羽化，不再糊掉额度胶囊', '输入框左边距真正加大到 18px', '顶栏改为覆盖式磨砂，聊天内容从下方穿过'],
    en: ['Removed the composer fade that blurred the quota chip', 'Composer left inset widened to 18px', 'App bar is now an overlay with content scrolling underneath its blur'],
  },
  {
    ver: '0.3.10',
    date: '2026-10-19',
    zh: ['抽屉打开时背后内容虚化，磨砂玻璃真正生效', '抽屉遮罩调淡并去掉二次模糊'],
    en: ['Content blurs behind the drawer so the frosted glass reads', 'Lighter drawer scrim without a second blur'],
  },
  {
    ver: '0.3.9',
    date: '2026-10-19',
    zh: ['输入区上方遮罩收窄到极窄并柔化', '输入条四周内边距统一为 10px', '抽屉打开时背后内容自动虚化，磨砂玻璃真正可见'],
    en: ['Top mask over the composer narrowed and softened', 'Composer padding unified to 10px', 'Background blurs behind the drawer so the frosted glass reads'],
  },
  {
    ver: '0.3.8',
    date: '2026-10-19',
    zh: ['额度胶囊缩小并贴近输入条', '顶栏与导航栏改用中性磨砂，去掉发蓝光晕', '顶部遮罩收窄到 18px 并柔化', '输入框文字左边距对齐'],
    en: ['Smaller quota chip tucked above the composer', 'Neutral frosted glass on app bar and drawer, no blue cast', 'Top mask narrowed to 18px and softened', 'Aligned composer text inset'],
  },
  {
    ver: '0.3.7',
    date: '2026-10-19',
    zh: ['修复输入框左内边距未生效', '真磨砂玻璃：内容层与磨砂层分离，顶栏与导航栏可透出模糊光晕', '额度胶囊恢复常驻显示', '输入区与聊天区之间的黑边收窄并羽化'],
    en: ['Fixed composer left padding', 'True frosted glass: content and blur layers separated on app bar and drawer', 'Quota chip is always visible again', 'Narrowed and feathered the seam between chat and composer'],
  },
  {
    ver: '0.3.6',
    date: '2026-10-19',
    zh: ['发送箭头与停止方块加粗', '去掉消息头部的时间引用', '顶栏标题字距放宽、字重加粗', '统一所有带边框容器的四周内边距'],
    en: ['Bolder send arrow and stop square', 'Removed the timestamp line above messages', 'App bar title tracked out and bolder', 'Unified padding on all bordered containers'],
  },
  {
    ver: '0.3.5',
    date: '2026-10-19',
    zh: ['抽屉导航栏改为磨砂玻璃', '追问胶囊与输入框、发送键整体放大一档', '输入区羽化下移，去掉输入框上方的黑条'],
    en: ['Drawer navigation now frosted glass', 'Suggestion pills, composer and send button scaled up', 'Composer fade lowered and the dark band above it removed'],
  },
  {
    ver: '0.3.4',
    date: '2026-10-19',
    zh: ['输入框收窄并重调内边距与占位文字比重', '发送与停止键重做材质：高光弧面、内嵌厚度、多层投影与外光晕', '顶栏与输入区磨砂玻璃加强'],
    en: ['Narrower composer with retuned padding and placeholder balance', 'Send and stop rebuilt: specular arc, inset depth, layered shadows, outer glow', 'Stronger frosted glass on the app bar and composer'],
  },
  {
    ver: '0.3.3',
    date: '2026-10-19',
    zh: ['追问恢复左对齐，胶囊收小', '主聊天额度胶囊改为行内展示，拿不到数据不再占位', '设置页移除剩余额度，统一在充值页查看', '去掉用户消息下方的时间引用', '顶栏改为磨砂玻璃，标题字号再调小'],
    en: ['Suggestions back to left aligned with smaller pills', 'Composer quota chip is inline and hides without data', 'Removed quota row from Settings; see Top up instead', 'Removed timestamp under user messages', 'App bar now frosted glass with a smaller title'],
  },
  {
    ver: '0.3.2',
    date: '2026-10-19',
    zh: ['发送键与停止键统一为一套材质，深色模式白色、浅色模式黑色', '发送键恢复箭头样式，停止键方块加粗并带圆角', '追问建议改为居中胶囊样式', '顶栏标题字重与字距重新调整'],
    en: ['Send and stop unified as one material: white in dark mode, black in light', 'Arrow restored on send; stop square is bolder with rounded corners', 'Suggestion chips are now centered pills', 'App bar title weight and spacing retuned'],
  },
  {
    ver: '0.3.1',
    date: '2026-10-19',
    zh: ['发送与停止按钮重做立体质感，按下回弹', '发送与停止支持震动反馈'],
    en: ['Send and stop buttons rebuilt with depth and press feedback', 'Haptic feedback on send and stop'],
  },
  {
    ver: '0.3.0',
    date: '2026-10-19',
    zh: ['设置里新增字号调整，小/标准/大/特大四档', '设置里新增更新日志与问题反馈入口', '登录页支持中英文切换', '条款与用户协议可在注册页直接查看，内容补全为十节', '全局改用苹方标准排版：行高、字间距按 iOS 规范重排'],
    en: ['Font size options in Settings: Small / Standard / Large / X-Large', 'Changelog and feedback entries in Settings', 'Chinese/English switch on the sign-in page', 'Terms are viewable on the register form, expanded to ten sections', 'Typography rebuilt on PingFang / iOS metrics: line height and letter spacing'],
  },
  {
    ver: '0.2.0',
    date: '2026-09-28',
    zh: ['对话支持流式输出', '新增日记、情绪中心与搜索', '深色/浅色/自动三种主题', '音乐卡片与天气卡片'],
    en: ['Streaming replies', 'Diary, mood center and search', 'Dark / light / auto themes', 'Music and weather cards'],
  },
  {
    ver: '0.1.0',
    date: '2026-09-10',
    zh: ['首个版本上线：登录注册、对话、额度'],
    en: ['First release: auth, chat, quota'],
  },
];

function changelogPage() {
  const lang = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  return CHANGELOG.map((c) => `
    <div class="group">
      <div class="group-title">v${c.ver} · ${c.date}</div>
      <div class="panel"><div class="cl-list">
        ${(lang === 'zh' ? c.zh : c.en).map(x => `<div class="cl-item">${x}</div>`).join('')}
      </div></div>
    </div>`).join('');
}

/* ---------- 问题反馈 ---------- */
function feedbackPage() {
  const email = localStorage.getItem('minxtok.email') || '';
  return `
    <div class="group">
      <div class="group-title">${t('feedback.title')}</div>
      <div class="panel"><div class="fb-pad">
        <div class="sub" style="margin-bottom:10px">${t('feedback.hint')}</div>
        <div class="seg fb-seg" id="fbType">
          ${[['bug', t('feedback.type.bug')], ['idea', t('feedback.type.idea')], ['other', t('feedback.type.other')]]
            .map(([k, v], i) => `<button data-fb="${k}" class="${i === 0 ? 'on' : ''}">${v}</button>`).join('')}
        </div>
        <textarea class="fb-input" id="fbText" rows="7" placeholder="${t('feedback.placeholder')}"></textarea>
        <input class="fb-input" id="fbContact" value="${email}" placeholder="${t('feedback.contact')}">
        <button class="btn m-press" id="fbSend" style="width:100%;margin-top:12px">${t('feedback.send')}</button>
        <div class="auth-err" id="fbErr"></div>
      </div></div>
    </div>`;
}

async function sendFeedback() {
  const err = document.getElementById('fbErr');
  const btn = document.getElementById('fbSend');
  const text = (document.getElementById('fbText') || {}).value || '';
  const contact = (document.getElementById('fbContact') || {}).value || '';
  const active = document.querySelector('#fbType button.on');
  const type = active ? active.dataset.fb : 'other';
  if (err) err.textContent = '';
  if (!text.trim()) {
    if (err) err.textContent = t('feedback.err.empty');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = t('feedback.sending'); }
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('minxtok.token') || ''}` },
      body: JSON.stringify({ type, text: text.trim(), contact: contact.trim(), ua: navigator.userAgent, page: location.href }),
    });
    if (!res.ok) throw new Error('bad');
    closePage();
    toast(t('feedback.ok'));
  } catch (_) {
    if (err) err.textContent = t('feedback.err.fail');
    if (btn) { btn.disabled = false; btn.textContent = t('feedback.send'); }
  }
}

/* ---------- 音乐卡 JSONP 补全 ---------- */
function qqLookup(song, artist) {
  return new Promise((resolve) => {
    const cb = 'qqcb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const q = encodeURIComponent(`${song} ${artist}`.trim());
    script.src = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&aggr=1&cr=1&qqmusic=1&format=jsonp&callback=${cb}&w=${q}`;
    const timer = setTimeout(() => { cleanup(); resolve(null); }, 6000);
    function cleanup() { clearTimeout(timer); try { delete window[cb]; } catch (_) {} script.remove(); }
    window[cb] = (data) => {
      cleanup();
      try {
        const list = (((data || {}).data || {}).song || {}).list || [];
        const it = list[0];
        resolve(it && it.songmid ? it : null);
      } catch (_) {
        resolve(null);
      }
    };
    script.onerror = () => { cleanup(); resolve(null); };
    document.body.appendChild(script);
  });
}

async function resolvePendingMusic() {
  const cards = [...document.querySelectorAll('.card[data-pending="1"]')];
  for (const card of cards) {
    const song = card.dataset.song || '';
    const artist = card.dataset.artist || '';
    const hit = await qqLookup(song, artist);
    const link = card.querySelector('a') || card;
    if (hit) {
      const url = `https://y.qq.com/n/ryqq/songDetail/${hit.songmid}`;
      card.dataset.action = 'play';
      card.dataset.url = url;
      card.dataset.pending = '';
      if (hit.albummid) {
        const cover = card.querySelector('.cover');
        if (cover) cover.innerHTML = `<img src="https://y.qq.com/music/photo_new/T002R300x300M000${hit.albummid}.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">`;
      }
      card.onclick = null;
    } else {
      card.dataset.pending = '';
      card.dataset.action = 'open';
      card.dataset.url = `https://y.qq.com/n/ryqq/search?searchKey=${encodeURIComponent(song + ' ' + artist)}`;
    }
  }
}

/* ---------- 搜索 ---------- */
const searchState = { q: '', range: 'all', scope: 'all', emotion: '', semantic: false, loaded: false };

function searchTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
}

// 结果里的关键词高亮（先转义再套标记，避免注入）
function highlight(text, q) {
  const safe = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const key = String(q || '').trim();
  if (!key) return safe;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(esc, 'gi'), m => `<mark>${m}</mark>`);
}

function attr(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const EMO_CHIPS = [
  ['', '不限情绪'], ['happy', '开心'], ['excited', '兴奋'], ['content', '满足'],
  ['love', '喜欢'], ['grateful', '感激'], ['hopeful', '期待'], ['amused', '好笑'],
  ['calm', '平静'], ['silly', '搞怪'], ['cool', '酷'], ['shy', '害羞'],
  ['awkward', '尴尬'], ['confused', '困惑'], ['lonely', '孤独'], ['disappointed', '失望'],
  ['down', '低落'], ['anxious', '焦虑'], ['troubled', '纠结'], ['annoyed', '烦躁'],
  ['angry', '生气'], ['tired', '疲惫'], ['sleepy', '困倦'], ['shock', '震惊'],
  ['speechless', '无语'],
];

function syncSearchFilters() {
  const f = document.getElementById('searchFilters');
  if (f) f.hidden = searchState.scope === 'web';
}

function openSearchPage() {
  const chip = (group, value, label, active) =>
    `<button class="chip ${active ? 'on' : ''}" data-group="${group}" data-value="${value}">${label}</button>`;

  openPage('搜索', `
    <div class="search-box" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6.4"/><path d="M16 16l4.2 4.2"/></svg>
      <input id="searchQ" placeholder="搜关键词，或按意思描述" autocomplete="off" value="${(searchState.q || '').replace(/"/g, '&quot;')}">
      <button class="search-clear" id="searchClear" aria-label="clear" hidden>×</button>
    </div>
    <div class="chip-scroll" data-row="scope">
      ${chip('scope', 'all', '全部', searchState.scope === 'all')}
      ${chip('scope', 'chat', '聊天', searchState.scope === 'chat')}
      ${chip('scope', 'diary', '日记', searchState.scope === 'diary')}
      ${chip('scope', 'study', '学习', searchState.scope === 'study')}
      ${chip('scope', 'web', '联网', searchState.scope === 'web')}
    </div>
    <div id="searchFilters">
      <div class="chip-scroll" data-row="range">
        ${chip('range', 'all', '全部时间', searchState.range === 'all')}
        ${chip('range', 'today', '今天', searchState.range === 'today')}
        ${chip('range', '7d', '近七天', searchState.range === '7d')}
        ${chip('range', '30d', '近三十天', searchState.range === '30d')}
      </div>
      <div class="chip-scroll" data-row="emotion">
        ${EMO_CHIPS.map(([v, l]) => chip('emotion', v, l, searchState.emotion === v)).join('')}
      </div>
      <label class="search-toggle">
        <span>按意思搜</span>
        <span class="switch ${searchState.semantic ? 'on' : ''}" id="searchSemantic"></span>
      </label>
    </div>
    <div id="searchResults" class="search-results"></div>`, null, 'chat', { closeOnly: true });

  const input = document.getElementById('searchQ');
  const clear = document.getElementById('searchClear');
  let timer = 0;
  const syncClear = () => { clear.hidden = !input.value.trim(); };
  syncClear();
  input.addEventListener('input', () => {
    searchState.q = input.value.trim();
    syncClear();
    clearTimeout(timer);
    timer = setTimeout(runSearch, 380);
  });
  clear.addEventListener('click', () => {
    input.value = ''; searchState.q = ''; syncClear(); clearTimeout(timer); runSearch(); input.focus();
  });
  document.getElementById('searchSemantic').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('on');
    searchState.semantic = e.currentTarget.classList.contains('on');
    runSearch();
  });

  syncSearchFilters();
  if (searchState.loaded) runSearch();
  else {
    document.getElementById('searchResults').innerHTML =
      '<div class="search-empty">输入关键词或情绪（比如「开心」），也可以直接点上面的筛选条件。</div>';
  }
}

function searchEmptyHtml() {
  return `<div class="search-empty">
    <div class="se-title">还没有搜过什么</div>
    <div class="se-sub">可以搜一句话、一个词，或者按情绪和时间筛。</div>
  </div>`;
}

async function runSearch() {
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (searchState.scope === 'web' && !searchState.q.trim()) {
    searchState.loaded = false;
    box.innerHTML = '<div class="search-empty"><div class="se-title">输入关键词，搜全网</div><div class="se-sub">联网结果会显示标题、站点和摘要。</div></div>';
    return;
  }
  const hasFilter = searchState.q || searchState.emotion || searchState.scope !== 'all' || searchState.range !== 'all';
  if (!hasFilter) {
    searchState.loaded = false;
    box.innerHTML = searchEmptyHtml();
    return;
  }
  box.innerHTML = `<div class="search-skel">${Array.from({ length: 3 }).map(() => `
      <div class="sk-row">
        <div class="m-skeleton" style="height:10px;width:38%;border-radius:4px"></div>
        <div class="m-skeleton" style="height:13px;width:92%;border-radius:4px;margin-top:8px"></div>
        <div class="m-skeleton" style="height:13px;width:66%;border-radius:4px;margin-top:8px"></div>
      </div>`).join('')}</div>`;
  const p = new URLSearchParams({
    uid: state.uid,
    q: searchState.q,
    range: searchState.range,
    scope: searchState.scope,
    emotion: searchState.emotion,
    semantic: searchState.semantic ? '1' : '0',
  });
  try {
    const r = await fetch('/api/search?' + p.toString());
    let d = {};
    try { d = await r.json(); } catch (_) { d = {}; }
    if (!r.ok) {
      const noKey = d.error === 'search_not_configured';
      box.innerHTML = `<div class="search-empty"><div class="se-title">${noKey ? '联网搜索还没配置好' : '联网搜索暂时不可用'}</div>
        <div class="se-sub">${noKey ? '联系虾虾补上千帆密钥。' : '稍后再试一次。'}</div></div>`;
      return;
    }
    const list = d.results || [];
    searchState.loaded = true;
    if (!list.length) {
      box.innerHTML = `<div class="search-empty"><div class="se-title">没有找到相关内容</div>
        <div class="se-sub">${searchState.scope === 'web' ? '换个说法再搜一次。' : '换个说法，或者放宽时间和范围试试。'}</div></div>`;
      return;
    }
    box.innerHTML = `<div class="search-count">找到 ${list.length} 条${searchState.scope === 'web' ? '网页' : ''}</div>` + list.map(x => {
      if (x.type === 'web') {
        return `<a class="search-item search-web" href="${attr(x.url)}" target="_blank" rel="noopener noreferrer">
          <div class="s-title">${highlight(x.title, searchState.q)}</div>
          <div class="s-meta"><span class="s-who">${highlight(x.site || '网页', searchState.q)}</span><span class="s-time">${attr(x.date)}</span></div>
          <div class="s-text">${highlight(x.text, searchState.q)}</div>
        </a>`;
      }
      const who = x.type === 'diary' ? '日记'
        : x.type === 'study' ? ({ translate: '翻译', solve: '解题', practice: '练习', word: '生词', mistake: '错题', scene: '场景', writing: '作文' }[x.mode] || '学习')
        : (x.role === 'user' ? '你' : assistantName());
      const emoLabel = x.emo ? (EMO_CHIPS.find(c => c[0] === x.emo) || [])[1] : '';
      return `<article class="search-item${x.type === 'study' ? ' study-item' : ''}" data-type="${x.type || 'chat'}" data-id="${x.type === 'study' ? '' : (x.id || '')}">
        <div class="s-meta"><span class="s-who">${who}</span>${emoLabel ? `<span class="s-emo">${emoLabel}</span>` : ''}<span class="s-time">${searchTime(x.createdAt)}</span></div>
        <div class="s-text">${highlight(x.text, searchState.q)}</div>
      </article>`;
    }).join('');
  } catch (_) {
    box.innerHTML = '<div class="search-empty"><div class="se-title">搜索失败</div><div class="se-sub">稍后再试一次。</div></div>';
  }
}

// 筛选胶囊：委托 + 只要点的是胶囊就重搜
document.getElementById('pageBody').addEventListener('click', (e) => {
  const c = e.target.closest('.chip[data-group]');
  if (!c) return;
  const group = c.dataset.group;
  if (!group || searchState[group] === c.dataset.value) return;
  searchState[group] = c.dataset.value;
  if (group === 'scope') syncSearchFilters();
  const row = c.closest('.chip-scroll') || c.parentElement;
  row.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
  c.classList.add('on');
  const cw = c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2;
  try { row.scrollTo({ left: Math.max(0, cw), behavior: 'smooth' }); } catch (_) { row.scrollLeft = Math.max(0, cw); }
  runSearch();
});

// 点搜索结果：跳到那条消息并高亮
document.getElementById('pageBody').addEventListener('click', (e) => {
  const item = e.target.closest('.search-item');
  if (!item) return;
  if (item.dataset.type === 'study') { closePage(); openStudy(); return; }
  if (!item.dataset.id) return;
  const id = item.dataset.id;
  closePage();
  setTimeout(() => {
    const el = document.querySelector(`.msg[data-message-id="${id}"]`);
    if (!el) { toast('这条太早了，往上翻翻看'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    el.classList.remove('search-flash');
    void el.offsetWidth;
    el.classList.add('search-flash');
  }, 380);
});

/* ---------- 情绪中心 ---------- */
function emoNode(item, size = 'small') {
  const wrap = document.createElement('span');
  wrap.className = size === 'hero' ? 'emo-hero-img' : 'c-emo';
  const img = document.createElement('img');
  img.src = `/assets/emoji/${item.key}.png`;
  img.alt = item.zh;
  img.onerror = () => {
    img.remove();
    const ch = document.createElement('span');
    ch.className = size === 'hero' ? 'emo-char' : 'c-char';
    ch.textContent = item.char;
    wrap.appendChild(ch);
  };
  wrap.appendChild(img);
  return wrap;
}


/* ---------- 情绪扇形图 ---------- */
const EMO_COLORS = [
  '#f2b93b', '#6fc9a8', '#e98a7a', '#8fb7e8', '#c79ae0',
  '#f0a56b', '#7fcbe0', '#e0c060', '#b5d16a', '#e88bb0',
  '#9aa7e8', '#f08a8a', '#79c7a0', '#c9a06a', '#a0a0b8', '#d8a5c8',
  '#e6b85c', '#7cc6b2', '#e99787', '#96bde9', '#cba6e3',
  '#f2b07b', '#8fd2e5', '#e8ca75',
];

function piePath(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

function renderEmotionPie(items) {
  const NS = 'http://www.w3.org/2000/svg';
  const size = 240, cx = size / 2, cy = size / 2, r1 = 104, r0 = 66;
  const wrap = document.createElement('div');
  wrap.className = 'emo-pie-wrap';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'emo-pie');

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<filter id="emoMotion" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur class="mb" stdDeviation="0" result="b"/>
      <feComposite in="SourceGraphic" in2="b" operator="over"/>
    </filter>`;
  svg.appendChild(defs);

  const list = items.filter(x => (x.share || 0) > 0);
  const main = list[0] || items[0] || { zh: '平静', share: 0 };
  // 视觉权重：真实占比之外给每片一个下限，1% 的小情绪也画得出可点的弧
  // （数字仍按真实占比显示，只调弧长，明轩 2026-10-30：美观为主）
  const FLOOR = list.length > 10 ? 0.045 : 0.055;
  const weights = list.map(x => Math.max(x.share || 0, FLOOR));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const slices = [];

  list.forEach((it, i) => {
    const span = (weights[i] / wsum) * Math.PI * 2;
    const mid = span / 2;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'emo-slice');
    g.style.transformOrigin = `${cx}px ${cy}px`;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', piePath(cx, cy, r0, r1, 0, span - 0.012));
    path.setAttribute('fill', EMO_COLORS[i % EMO_COLORS.length]);
    path.setAttribute('class', 'emo-arc');

    // 百分比标在扇区里，靠环内侧，文字基线朝向圆心
    const pct = document.createElementNS(NS, 'text');
    const pr = r0 + (r1 - r0) * 0.34;
    pct.setAttribute('x', cx + pr * Math.cos(mid));
    pct.setAttribute('y', cy + pr * Math.sin(mid));
    pct.setAttribute('class', 'emo-pct');
    pct.setAttribute('transform', `rotate(${(mid * 180) / Math.PI + 90} ${cx + pr * Math.cos(mid)} ${cy + pr * Math.sin(mid)})`);
    pct.textContent = `${Math.round(it.share * 100)}%`;

    g.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
    g.append(path);
    // 弧太窄就放不下三位数字，硬画会顶出圆环；这种只留颜色，点一下中央再看数
    if (span >= 0.30) g.append(pct);
    svg.appendChild(g);
    slices.push({ g, pct, it, a0: angle, a1: angle + span, mid });
    angle += span;
  });

  // 入场：整盘缩放转出，同时模糊由重到清
  svg.style.filter = 'url(#emoMotion)';
  svg.style.transform = 'scale(0.62) rotate(-28deg)';
  svg.style.opacity = '0';
  requestAnimationFrame(() => {
    svg.style.transition = 'transform .82s cubic-bezier(.2,.9,.16,1), opacity .4s ease';
    svg.style.transform = 'scale(1) rotate(0deg)';
    svg.style.opacity = '1';
    const blur = svg.querySelector('.mb');
    let t0 = null;
    const dur = 780;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const k = Math.min(1, (ts - t0) / dur);
      if (blur) blur.setAttribute('stdDeviation', String((1 - k) * (1 - k) * 7));
      if (k < 1) requestAnimationFrame(step);
      else svg.style.filter = 'none';
    };
    requestAnimationFrame(step);
  });

  const center = document.createElement('div');
  center.className = 'emo-pie-center';
  center.innerHTML = `<div class="pc-name"></div><div class="pc-share"></div>`;
  center.querySelector('.pc-name').textContent = main.zh;
  center.querySelector('.pc-share').textContent = `最近一周 ${Math.round((main.share || 0) * 100)}%`;

  wrap.appendChild(svg);
  wrap.appendChild(center);

  // 点击分块：沿中线顶出并轻微放大，中央显示这一块的百分比
  let active = null;
  const setBase = (s1) => {
    s1.g.style.transform = `rotate(${(s1.a0 * 180) / Math.PI}deg)`;
  };
  slices.forEach((s1) => {
    s1.g.style.cursor = 'pointer';
    s1.g.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = active !== s1;
      if (active) { active.g.classList.remove('on'); setBase(active); }
      active = on ? s1 : null;
      if (on) {
        const out = 9;
        const dx = Math.cos(s1.mid) * out, dy = Math.sin(s1.mid) * out;
        s1.g.style.transform = `rotate(${(s1.a0 * 180) / Math.PI}deg) translate(${dx}px, ${dy}px) scale(1.06)`;
        s1.g.classList.add('on');
        center.querySelector('.pc-name').textContent = s1.it.zh;
        center.querySelector('.pc-share').textContent = `${Math.round(s1.it.share * 100)}%`;
        center.classList.add('pop');
        setTimeout(() => center.classList.remove('pop'), 300);
        haptic(8);
      } else {
        center.querySelector('.pc-name').textContent = main.zh;
        center.querySelector('.pc-share').textContent = `最近一周 ${Math.round((main.share || 0) * 100)}%`;
      }
    });
  });

  return wrap;
}


// 情绪中心加载骨架：按真实版式摆灰块（大情绪 → 小情绪格子 → 扇形 → 建议）
// still=true 时用静态灰块（没有情绪数据时当占位，不做流光呼吸）
function emotionSkeleton(still) {
  const cells = Array.from({ length: 8 }, () => `
    <div class="emo-sk-cell">
      <div class="m-skeleton" style="width:40px;height:40px;border-radius:50%"></div>
      <div class="m-skeleton" style="width:30px;height:9px;border-radius:4px;margin-top:8px"></div>
    </div>`).join('');
  return `
    <div class="emo-sk${still ? ' emo-sk-static' : ''}">
      <div class="emo-sk-hero">
        <div class="m-skeleton" style="width:96px;height:96px;border-radius:50%"></div>
        <div class="m-skeleton" style="width:64px;height:16px;border-radius:5px;margin-top:14px"></div>
        <div class="m-skeleton" style="width:44px;height:10px;border-radius:4px;margin-top:8px"></div>
        <div class="m-skeleton" style="width:88px;height:10px;border-radius:4px;margin-top:10px"></div>
      </div>
      <div class="emo-sk-grid">${cells}</div>
      <div class="emo-sk-pie"><div class="m-skeleton" style="width:240px;height:240px;border-radius:50%"></div></div>
      <div class="emo-sk-advice">
        <div class="m-skeleton" style="width:60px;height:10px;border-radius:4px"></div>
        <div class="m-skeleton" style="width:100%;height:12px;border-radius:4px;margin-top:12px"></div>
        <div class="m-skeleton" style="width:86%;height:12px;border-radius:4px;margin-top:9px"></div>
        <div class="m-skeleton" style="width:58%;height:12px;border-radius:4px;margin-top:9px"></div>
      </div>
    </div>`;
}

// 空数据／出错都要给一句人话，绝不能停在灰骨架上（明轩 2026-10-29：加载不出）
function emotionNotice(text) {
  const wrap = document.createElement('div');
  wrap.className = 'emo-empty';
  const t = document.createElement('div');
  t.className = 'emo-empty-t';
  t.textContent = text;
  const btn = document.createElement('button');
  btn.className = 'btn ghost emo-empty-btn';
  btn.type = 'button';
  btn.textContent = '刷新看看';
  btn.addEventListener('click', () => openEmotionPage());
  wrap.append(t, btn);
  fillPage(wrap);
}

async function openEmotionPage() {
  openPage('情绪中心', emotionSkeleton(), null, 'chat', { closeOnly: true });
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(`/api/emotion/summary?uid=${encodeURIComponent(state.uid)}&_=${Date.now()}`,
      { cache: 'no-store', signal: ctl.signal });
    clearTimeout(tid);
    const d = await r.json();
    if (!r.ok || d.error) { emotionNotice('这次没取到数据，点一下再试。'); return; }
    if (!d.items || !d.items.length || d.empty) { emotionNotice('还没攒够数据，聊几句、写两篇日记，我就有得看了。'); return; }
    renderEmotionPage(d);
  } catch (_) {
    // 内容替换用 fillPage，不重放整页动画，否则会整屏闪一下
    emotionNotice('加载失败，稍后再试。');
  }
}

// 情绪分组：五类方向 + 每类里的明细。平静占七成时，光看饼图等于什么都没说
function renderEmotionGroups(d) {
  const groups = Array.isArray(d && d.groups) ? d.groups.filter(g => (g.share || 0) > 0) : [];
  if (!groups.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'emo-groups';
  const head = document.createElement('div');
  head.className = 'g-head';
  const title = document.createElement('div');
  title.className = 'g-title';
  title.textContent = '分门别类';
  const sub = document.createElement('div');
  sub.className = 'g-sub';
  const n = Number(d.msgs) || 0;
  sub.textContent = n ? `最近一周 ${n} 条，按方向归成五类` : '最近一周，按方向归成五类';
  head.append(title, sub);
  wrap.appendChild(head);

  const bar = document.createElement('div');
  bar.className = 'g-bar';
  groups.forEach(g => {
    const seg = document.createElement('i');
    seg.className = `g-seg g-${g.key}`;
    seg.style.width = `${Math.max(2, Math.round((g.share || 0) * 100))}%`;
    seg.title = `${g.zh} ${Math.round((g.share || 0) * 100)}%`;
    bar.appendChild(seg);
  });
  wrap.appendChild(bar);

  groups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'g-row';
    const top = document.createElement('div');
    top.className = 'g-top';
    const dot = document.createElement('i');
    dot.className = `g-dot g-${g.key}`;
    const nm = document.createElement('span');
    nm.className = 'g-name';
    nm.textContent = g.zh;
    const pct = document.createElement('span');
    pct.className = 'g-pct';
    pct.textContent = `${Math.round((g.share || 0) * 100)}%`;
    top.append(dot, nm, pct);
    const chips = document.createElement('div');
    chips.className = 'g-chips';
    (g.members || []).forEach(m => {
      const chip = document.createElement('span');
      chip.className = 'g-chip';
      chip.textContent = `${m.zh} ${Math.round((m.share || 0) * 100)}%`;
      chips.appendChild(chip);
    });
    row.append(top, chips);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderEmotionPage(d) {
  // 全空或全是 0% 时直接摆静态骨架，别让一屏 0% 看着像坏了
  const raw = (d.items && d.items.length) ? d.items : [];
  const items = raw.filter(x => (x.share || 0) > 0);
  if (!items.length) {
    fillPage(emotionSkeleton(true));
    return;
  }
  const main = items.find(x => x.key === d.main) || items[0] || null;
  // 大情绪 1 个 + 小情绪固定 8 格（4×2），不够的用灰格补齐
  const rest = items.filter(x => !main || x.key !== main.key).slice(0, 8);
  const holes = Math.max(0, 8 - rest.length);

  const hero = document.createElement('div');
  hero.className = 'emo-hero';
  const name = document.createElement('div');
  name.className = 'emo-name';
  const en = document.createElement('div');
  en.className = 'emo-en';
  const share = document.createElement('div');
  share.className = 'emo-share';
  if (main) {
    hero.appendChild(emoNode(main, 'hero'));
    name.textContent = main.zh;
    en.textContent = main.en;
    share.textContent = `最近一周 ${Math.round((main.share || 0) * 100)}%`;
    hero.style.cursor = 'pointer';
    hero.addEventListener('click', () => {
      hero.classList.remove('q-bounce');
      void hero.offsetWidth;
      hero.classList.add('q-bounce');
      setTimeout(() => openEmotionDetail(main), 190);
    });
  } else {
    const ph = document.createElement('div');
    ph.className = 'm-skeleton emo-hero-ph';
    hero.appendChild(ph);
    name.textContent = '还没开始';
    en.textContent = 'No data yet';
    share.textContent = '聊几句就会有';
    hero.classList.add('is-empty');
  }
  hero.append(name, en, share);

  const grid = document.createElement('div');
  grid.className = 'emo-grid';
  rest.forEach(it => {
    const cell = document.createElement('button');
    cell.className = 'emo-cell';
    cell.appendChild(emoNode(it));
    const nm = document.createElement('div');
    nm.className = 'c-name';
    nm.textContent = it.zh;
    const sh = document.createElement('div');
    sh.className = 'c-share';
    sh.textContent = Math.round((it.share || 0) * 100) + '%';
    cell.append(nm, sh);
    cell.addEventListener('click', () => {
      cell.classList.remove('q-bounce');
      void cell.offsetWidth;
      cell.classList.add('q-bounce');
      haptic(6);
      setTimeout(() => openEmotionDetail(it), 190);
    });
    grid.appendChild(cell);
  });

  for (let i = 0; i < holes; i++) {
    const hole = document.createElement('div');
    hole.className = 'emo-cell is-empty';
    hole.innerHTML = `<div class="c-skel"><div class="m-skeleton" style="width:40px;height:40px;border-radius:50%"></div>
      <div class="m-skeleton" style="width:30px;height:9px;border-radius:4px;margin-top:9px"></div></div>`;
    grid.appendChild(hole);
  }

  const advice = document.createElement('div');
  advice.className = 'emo-advice';
  advice.innerHTML = `<div class="a-who">${assistantName()}的话</div><div class="a-text"></div>`;
  typeIn(advice.querySelector('.a-text'), d.advice ||
    (main ? '最近情绪挺平稳的，继续保持。' : '等你多聊几句，我就能看出这一周你被哪些心情围着。'));

  const groups = renderEmotionGroups(d);
  // 饼图只画主情绪 + 八格这九种，它们自己归一到 100%；
  // 全量 27 种全画进去会碎成一片，看不出重点（明轩 2026-10-30）
  const pieItems = [main, ...rest].filter(Boolean);
  const pie = renderEmotionPie(pieItems.length ? pieItems : items);
  const page = document.getElementById('pageBody');
  page.innerHTML = '';
  page.append(hero, grid, pie, advice);
  if (groups) page.append(groups);
  // 文字和色块一起进场（明轩 2026-10-30：以前数据一到整屏硬切，像换了张图）
  // 一条条淡入，顺序按阅读顺序，间隔很短，不拖时间
  [hero, ...Array.from(grid.children), pie, advice, groups].filter(Boolean).forEach((el, i) => {
    if (!el) return;
    el.style.animationDelay = `${Math.min(i * 34, 260)}ms`;
    el.classList.add('emo-in');
  });
  // 预热：主情绪先取，其余几条排后面慢慢取，点哪个都已经是现成的
  const warm = [main, ...rest].filter(Boolean);
  (async () => {
    for (const it of warm.slice(0, 5)) {
      if (emoDetailCached(it.key)) continue;
      try {
        const r = await fetch(`/api/emotion/detail?uid=${encodeURIComponent(state.uid)}&key=${encodeURIComponent(it.key)}`, { cache: 'no-store' });
        const dj = await r.json();
        if (dj && dj.advice) emoDetailSave(it.key, dj.advice);
      } catch (_) {}
    }
  })();
}

/* 文字逐字浮现（明轩 2026-10-30：情绪中心「文字出现没有动画」）
   整块淡入他看不出来，这里按字错开，一眼能看见文字在往里走。 */
function typeIn(el, text, step) {
  const chars = Array.from(String(text || ''));
  el.textContent = '';
  const total = chars.length;
  // 一组几个字：越小组越像逐字，但节点多了浏览器扛不住（明轩 2026-10-30：八十个 span 一起动会卡）
  const size = Math.max(1, Math.ceil(total / 22));
  const groups = [];
  for (let i = 0; i < total; i += size) groups.push(chars.slice(i, i + size).join(''));
  const gap = step || Math.max(16, Math.min(44, Math.round(760 / Math.max(1, groups.length))));
  const frag = document.createDocumentFragment();
  groups.forEach((g, i) => {
    const sp = document.createElement('span');
    sp.className = 'tx-in';
    sp.textContent = g;
    sp.style.animationDelay = `${i * gap}ms`;
    frag.appendChild(sp);
  });
  el.appendChild(frag);
}

/* 流式用：把 root 里从第 from 个字开始的那截套上浮现
   老文字不加类，所以每帧重画也不会重播，只有这帧新到的字在动 */
function plainLen(root) {
  let n = 0;
  const walker = document.createTreeWalker(root, 4, null);
  let t;
  while ((t = walker.nextNode())) {
    if (t.parentNode && t.parentNode.closest && t.parentNode.closest('.stream-caret')) continue;
    n += t.data.length;
  }
  return n;
}

function freshWrap(root, from) {
  const nodes = [];
  const walker = document.createTreeWalker(root, 4, null);
  let t;
  while ((t = walker.nextNode())) {
    if (t.parentNode && t.parentNode.closest && t.parentNode.closest('.stream-caret')) continue;
    nodes.push(t);
  }
  let cur = 0;
  for (const node of nodes) {
    const len = node.data.length;
    const start = cur;
    cur += len;
    if (cur <= from) continue;
    const off = Math.max(0, from - start);
    const target = (off > 0 && off < len) ? node.splitText(off) : node;
    if (!target.data) continue;
    const sp = document.createElement('span');
    sp.className = 'tx-in';
    target.parentNode.replaceChild(sp, target);
    sp.appendChild(target);
  }
}

/* 详情文案本地留一份：同一情绪再点开是瞬开，不用等模型 */
const emoDetailKey = (k) => `minxtok.emo.detail.v2:${k}`;
function emoDetailCached(k) {
  try {
    const raw = localStorage.getItem(emoDetailKey(k));
    if (!raw) return '';
    const d = JSON.parse(raw);
    if (d && d.a && Date.now() - (d.t || 0) < 12 * 3600 * 1000) return d.a;
  } catch (_) {}
  return '';
}
function emoDetailSave(k, a) {
  if (!a) return;
  try { localStorage.setItem(emoDetailKey(k), JSON.stringify({ a, t: Date.now() })); } catch (_) {}
}

async function openEmotionDetail(item) {
  const paint = (txt) => {
    const body = document.getElementById('sheetBody');
    if (!body) return;
    body.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'a-text';
    body.appendChild(p);
    typeIn(p, txt);
  };
  const cached = emoDetailCached(item.key);
  openSheet(`<img class="sheet-emo" src="/assets/emoji/${item.key}.png" alt=""> ${item.zh}`,
    '<div style="display:flex;justify-content:center;padding:16px"><div class="m-thinking"><i></i><i></i><i></i></div></div>');
  // 背景模糊只管情绪这一种抽屉（明轩 2026-10-30）
  const sw = document.getElementById('sheetWrap');
  if (sw) sw.classList.add('emo-sheet');
  if (cached) { paint(cached); return; }
  try {
    const r = await fetch(`/api/emotion/detail?uid=${encodeURIComponent(state.uid)}&key=${encodeURIComponent(item.key)}&_=${Date.now()}`, { cache: 'no-store' });
    const d = await r.json();
    const txt = String(d.advice || `${assistantName()}还在想，晚点再来看看。`);
    if (d && d.advice) emoDetailSave(item.key, d.advice);
    paint(txt);
  } catch (_) {
    const body = document.getElementById('sheetBody');
    if (body) body.textContent = '加载失败，稍后再试。';
  }
}


/* 从某个元素位置飞进来：只动 transform/opacity，跑完立刻清掉，不留最后一帧 */
function flipInto(target, source) {
  const dst = target.getBoundingClientRect();
  const src = source.getBoundingClientRect();
  const dx = src.left - dst.left;
  const dy = src.top - dst.top;
  if (!dst.width || !dst.height) return;
  const sx = Math.max(0.2, Math.min(1.6, src.width / dst.width));
  target.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${Math.max(0.4, src.height / dst.height)})`, opacity: 0.2, borderRadius: '999px' },
      { transform: `translate(${dx * 0.2}px, ${dy * 0.2}px) scale(${(sx + 1) / 2 + 0.06}, 1.04)`, opacity: 1, offset: 0.74 },
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1, borderRadius: '18px' },
    ],
    { duration: 520, easing: 'cubic-bezier(0.16, 1.06, 0.24, 1)', fill: 'none' }
  );
}

/* ---------- 引用 ---------- */
function clearQuoteChip(instant) {
  state.quote = null;
  const old = document.getElementById('quoteChip');
  if (!old) return;
  if (instant) { old.remove(); return; }
  old.classList.add('leaving');
  setTimeout(() => old.remove(), 220);
}

// 引用：只让引用条从输入区底部升上来；不再从原消息位置飞过来
function showQuoteChip(q) {
  const old = document.getElementById('quoteChip');
  if (old) {
    old.classList.add('leaving');
    setTimeout(() => old.remove(), 200);
  }
  state.quote = q;

  const chip = document.createElement('div');
  chip.className = 'quote-chip';
  chip.id = 'quoteChip';
  chip.innerHTML = `<span class="q-text"></span><button class="q-close" aria-label="cancel">✕</button>`;
  chip.querySelector('.q-text').textContent = String(q.text || '').slice(0, 60);
  chip.querySelector('.q-close').addEventListener('click', () => clearQuoteChip());

  const composer = document.querySelector('.composer');
  composer.prepend(chip);

  // 纯底部升起：上升交给 CSS keyframe，不再用 FLIP 从原文位置飞过来
  haptic(8);
  return chip;
}

/* ---------- 历史折叠：一天以前的先收起来，上滑再往上补 ---------- */
const CHAT_KEEP_MS = 24 * 3600 * 1000;   // 一天以内默认展开
const CHAT_MAX_LIVE = 16;                // 首屏最多渲染这么多条，再多就折
const CHAT_CHUNK = 8;                    // 每次往上补几条
let chatOlder = [];        // 内存里还没渲染的旧消息（由旧到新）
let chatHasMore = false;   // 服务端还有更早的
let chatOldestTs = 0;      // 当前已知最老一条的时间
let chatLoadingOlder = false;

function moreEl() {
  const el = document.createElement('div');
  el.className = 'chat-more';
  el.innerHTML = '<span>更早的消息 · 上滑加载</span>';
  el.addEventListener('click', () => { revealOlder(); });
  return el;
}

function syncMore() {
  const el = chat.querySelector('.chat-more');
  if (!el) return;
  const left = chatOlder.length;
  if (!left && !chatHasMore) {
    el.classList.add('done');
    el.querySelector('span').textContent = '已经是最早的消息了';
    return;
  }
  el.classList.remove('done');
  el.querySelector('span').textContent = '更早的消息 · 上滑加载';
}

async function revealOlder() {
  if (chatLoadingOlder) return;
  const el = chat.querySelector('.chat-more');
  if (!chatOlder.length && !chatHasMore) { syncMore(); return; }
  chatLoadingOlder = true;
  if (el) el.classList.add('loading');
  try {
    let chunk = chatOlder.splice(Math.max(chatOlder.length - CHAT_CHUNK, 0), CHAT_CHUNK);
    if (!chunk.length && chatHasMore && state.conversationId) {
      const hr = await fetch(`/api/history?uid=${encodeURIComponent(state.uid)}&conversationId=${encodeURIComponent(state.conversationId)}&limit=${CHAT_CHUNK * 2}&before=${chatOldestTs}`);
      const hd = hr.ok ? await hr.json() : {};
      const older = Array.isArray(hd.messages) ? hd.messages : [];
      chatHasMore = older.length >= CHAT_CHUNK * 2;
      if (older.length) {
        chatOldestTs = Number((older[0] && older[0].createdAt) || chatOldestTs);
        chatOlder = older;
        chunk = chatOlder.splice(Math.max(chatOlder.length - CHAT_CHUNK, 0), CHAT_CHUNK);
      } else {
        chatHasMore = false;
      }
    }
    if (!chunk.length) return;
    const prevH = chat.scrollHeight;
    const prevTop = chat.scrollTop;
    const frag = document.createDocumentFragment();
    for (const m of chunk) {
      try { frag.appendChild(renderMessage(m)); } catch (e) { console.warn('older render failed', m && m.id, e); }
    }
    const mark = chat.querySelector('.chat-more');
    if (mark && mark.parentNode === chat) chat.insertBefore(frag, mark.nextSibling);
    else chat.insertBefore(frag, chat.firstChild);
    // 补完把视口钉在原来那条上，别让人"被跳走"
    chat.scrollTop = prevTop + (chat.scrollHeight - prevH);
    syncMore();
  } finally {
    chatLoadingOlder = false;
    const mark2 = chat.querySelector('.chat-more');
    if (mark2) mark2.classList.remove('loading');
  }
}

/* ---------- 历史恢复 ---------- */
let restoreSeq = 0;
/* ---------- 会话缓存：先落屏，再对网 ---------- */
// 打开聊天时导航栏是瞬间出来的，历史却要等接口，中间会空一下再"蹦"出来。
// 所以上一次的对话存一份在本地，进场先画它，联网拿到结果后只在内容变了时才重画。
const CHAT_CACHE_KEY = 'minxtok.chat.cache';

function readChatCache() {
  try {
    const raw = store.get(CHAT_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !Array.isArray(c.msgs) || !c.msgs.length) return null;
    if (Date.now() - Number(c.at || 0) > 3 * 864e5) return null;
    return c;
  } catch (_) { return null; }
}

function writeChatCache(convId, msgs) {
  if (!convId || !msgs || !msgs.length) return;
  try {
    const slim = msgs.slice(-12).map((m) => {
      const blocks = Array.isArray(m.blocks) ? m.blocks.map((b) => {
        if (!b || typeof b !== 'object') return b;
        if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 1200) return { ...b, text: b.text.slice(0, 1200) + '…' };
        // 本地上传的图片是 data URL，塞进缓存会直接把 5MB 撑爆
        if (b.type === 'image' && typeof b.url === 'string' && b.url.slice(0, 5) === 'data:') return { type: 'text', text: '[图片]' };
        if (b.type === 'audio') return { type: 'text', text: '[语音]' };
        return b;
      }) : m.blocks;
      return { id: m.id, role: m.role, createdAt: m.createdAt, blocks };
    });
    store.set(CHAT_CACHE_KEY, JSON.stringify({ convId, at: Date.now(), msgs: slim }));
  } catch (_) {}
}

async function restoreHistory() {
  const seq = ++restoreSeq;
  chatOlder = [];
  chatHasMore = false;
  chatOldestTs = 0;
  const cached = readChatCache();
  let cachedShown = false;
  if (cached) {
    try {
      chat.innerHTML = '';
      for (const m of cached.msgs) {
        try { chat.appendChild(renderMessage(m)); } catch (_) {}
      }
      cachedShown = chat.querySelector('.msg') !== null;
      if (cachedShown) {
        userTookOver = false;
        stickBottom = true;
        scrollBottom();
        requestAnimationFrame(scrollBottom);
      }
    } catch (_) { cachedShown = false; }
  }
  if (!cachedShown) {
    chat.innerHTML = '<div class="m-skeleton" style="height:14px;width:60%;margin:10px 0"></div>'
      + '<div class="m-skeleton" style="height:14px;width:86%;margin:10px 0"></div>'
      + '<div class="m-skeleton" style="height:14px;width:44%;margin:10px 0"></div>';
  }
  // 历史恢复要稳：任何一步失败都退回欢迎语，但绝不把已渲染的内容清空
  try {
    const cr = await fetch(`/api/conversations?uid=${encodeURIComponent(state.uid)}&limit=20`);
    if (seq !== restoreSeq) return;
    if (!cr.ok) throw new Error('conv_' + cr.status);
    const cd = await cr.json();
    const convs = Array.isArray(cd.conversations) ? cd.conversations : [];
    if (!convs.length) { chat.innerHTML = ''; welcome(); return; }
    const preferredId = state.conversationId || store.get('minxtok.conv');
    const ordered = [];
    const preferred = preferredId ? convs.find((c) => c.id === preferredId) : null;
    if (preferred) ordered.push(preferred);
    for (const c of convs) if (!ordered.some((x) => x.id === c.id)) ordered.push(c);
    let conv = null;
    let list = [];
    for (const candidate of ordered.slice(0, 2)) {
      const hr = await fetch(`/api/history?uid=${encodeURIComponent(state.uid)}&conversationId=${encodeURIComponent(candidate.id)}&limit=50`);
      if (seq !== restoreSeq) return;
      if (!hr.ok) throw new Error('hist_' + hr.status);
      const hd = await hr.json();
      const msgs = Array.isArray(hd.messages) ? hd.messages : [];
      if (msgs.length) { conv = candidate; list = msgs; break; }
      if (!conv) conv = candidate;
    }
    if (!conv) { chat.innerHTML = ''; welcome(); return; }
    state.conversationId = conv.id;
    store.set('minxtok.conv', conv.id);
    if (!cachedShown) chat.innerHTML = '';
    userTookOver = false;
    stickBottom = true;
    if (!list.length) { chat.innerHTML = ''; welcome(); return; }
    // 一天以前的先折起来：一次渲染五十条带公式/图片的气泡，进场和滚动都在抖
    let foldIdx = list.findIndex((m) => Number(m.createdAt || 0) >= Date.now() - CHAT_KEEP_MS);
    if (foldIdx < 0) foldIdx = list.length;
    if (list.length - foldIdx > CHAT_MAX_LIVE) foldIdx = list.length - CHAT_MAX_LIVE;
    chatOlder = list.slice(0, foldIdx);
    chatHasMore = list.length >= 50;
    chatOldestTs = Number((list[0] && list[0].createdAt) || 0);
    const tail = list.slice(foldIdx);
    const sameAsCache = cachedShown && cached && tail.length === cached.msgs.length
      && tail.every((m, i) => String(m.id) === String((cached.msgs[i] || {}).id));
    let rendered = 0;
    if (sameAsCache) {
      // 已经画的就是这一批，直接留用，避免"先骨架后蹦字"
      rendered = tail.length;
    } else {
      chat.innerHTML = '';
      if (foldIdx > 0) chat.appendChild(moreEl());
      for (const m of tail) {
        try { chat.appendChild(renderMessage(m)); rendered++; }
        catch (e) { console.warn('render message failed', m && m.id, e); }
      }
    }
    if (!rendered) { welcome(); return; }
    writeChatCache(conv.id, tail);
    resolvePendingMusic();
    // 图片/卡片撑开高度会有延迟，多补几次，保证落地就在最底部；
    // 但只要用户在这几百毫秒里自己滑过，就一次都不补（不然就是“被拖在底部”）
    if (!userTookOver) {
      scrollBottom();
      requestAnimationFrame(scrollBottom);
      [60, 160, 320, 600].forEach(ms => scrollBottomSoon(ms));
    }
  } catch (e) {
    if (seq !== restoreSeq) return;
    console.warn('restoreHistory failed', e);
    if (!chat.querySelector('.msg')) { chat.innerHTML = ''; welcome(); }
  }
}

function welcome() {
  chat.appendChild(renderMessage({
    id: 'welcome',
    role: 'assistant',
    blocks: [{ type: 'text', text: t('empty') }],
  }));
}

// 在欢迎语后补一个空的对话占位，第一条消息会自动建会话

/* ---------- 外链打开：微信里 window.open 常被拦，改用 a.click / location ---------- */
function openExternal(url) {
  if (!url) return;
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  if (isWeChat) { location.href = url; return; }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- 块事件分发：永远按 action，不按位置 ---------- */
document.addEventListener('block:action', async (e) => {
  const { action, text, block, fromEl } = e.detail || {};
  switch (action) {
    case 'send': sendMessage(text, fromEl ? { fromEl } : {}); break;
    case 'play': openExternal(block.url); break;
    case 'open': openExternal(block.url); break;
    case 'gift': {
      // 旧 quota 逻辑（内联数字 / 弹充值页）还在上面拦着，这里兜住所有礼物卡入口
      if (block && (block.giftId || block.action === 'gift')) openGiftSheet(block);
      break;
    }
    case 'page': {
      if (block.type === 'article') openArticle(block);
      else if (block.type === 'custom') openPage(block.title || '详情', renderMarkdown(block.body || ''), () => closePage());
      break;
    }
    case 'view': openExternal(block.url); break;
    case 'sheet': {
      if (block.type === 'weather') {
        const g = await ensureGeo();
        const lat = (g && g.lat) || block.lat || 41.88;
        const lon = (g && g.lon) || block.lon || 123.92;
        openModal({
          title: t('weather.title'),
          body: '<div style="display:flex;justify-content:center;padding:20px"><div class="m-spinner"></div></div>',
        });
        fetch(`/api/weather?lat=${lat}&lon=${lon}&city=${encodeURIComponent(block.city || '')}`)
          .then(r => r.json())
          .then(w => {
            if (w.error) throw new Error(w.error);
            const days = (w.days || []).map(d =>
              `<div class="row"><div class="k">${d.date}</div><div class="v">${d.text} ${d.min}~${d.max}℃</div></div>`).join('');
            const rainSoon = (w.hourly || []).some(h => h.mm > 0);
            openModal({
              title: `${w.city} · ${w.now.temp}℃ ${w.now.text}`,
              body: `<div class="panel">${days}</div>
                     <p class="about-p" style="margin-top:14px">${rainSoon ? '两小时内可能有降水。' : ''}${(w.advice || []).join(' ')}</p>`,
            });
          })
          .catch(() => { closeModal(); toast(t('toast.error')); });
      } else if (block.type === 'quota') {
        openModal({
          title: t('quota.title'),
          body: `<div style="text-align:center;font-size:26px;color:var(--text);font-weight:600">${block.limit - block.used}</div>
                 <div style="text-align:center;color:var(--muted);font-size:calc(var(--fs-md) * 0.8);margin:6px 0 16px">${t('quota.left')}</div>
                 <div class="search-box"><input id="codeInput" placeholder="${t('quota.placeholder')}" autocomplete="off"></div>
                 <button class="btn" id="btnRedeem" style="width:100%;margin-top:12px">${t('quota.redeem')}</button>`,
        });
        $('btnRedeem').addEventListener('click', async () => {
          const code = $('codeInput').value.trim();
          if (!code) return;
          const r = await fetch('/api/quota/redeem', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: state.uid, code }),
          });
          const d = await r.json();
          if (d.ok) { toast(t('quota.added', { n: d.added })); closeModal(); pollStatus(); }
          else toast(t('quota.failed'));
        });
      }
      break;
    }
    default: break;
  }
});



/* ---------- 额度礼物卡：磨砂礼物屏 ---------- */
function markGiftCardClaimed(block) {
  if (!block) return;
  const el = document.querySelector(`.gift-card[data-block-id="${block.id}"]`);
  if (!el) return;
  el.classList.add('is-claimed');
  el.dataset.action = 'none';
  const btn = el.querySelector('.gift-card-btn');
  if (btn) btn.textContent = '已领取';
}
function openGiftSheet(block) {
  // 自动弹和手点可能撞在一起，先清掉旧的，避免两层叠着一起糊
  document.querySelectorAll('.gift-sheet').forEach(el => el.remove());
  const unit = (block.unit === '点' || !block.unit) ? '额度' : block.unit;
  const wrap = document.createElement('div');
  wrap.className = 'gift-sheet show';
  wrap.innerHTML = `
    <div class="gift-sheet-blur"></div>
    <div class="gift-sheet-card">
      <div class="gift-sheet-emoji">${appleEmojiHtml(block.emoji || '🎁')}</div>
      <div class="gift-sheet-title">${block.title || '明叙赠您额度'}</div>
      <div class="gift-sheet-amount"><b>${Number(block.amount) || 0}</b><span>${unit}</span></div>
      ${block.subtitle ? `<div class="gift-sheet-sub">${block.subtitle}</div>` : ''}
      <button class="btn gift-sheet-btn" id="giftClaimBtn">领取</button>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));

  const close = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 440); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.classList.contains('gift-sheet-blur')) close(); });

  const btn = wrap.querySelector('#giftClaimBtn');
  btn.addEventListener('click', async () => {
    if (!block.giftId) { close(); return; }
    btn.disabled = true;
    btn.textContent = '拆开中…';
    try {
      const r = await fetch('/api/gift/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, giftId: block.giftId }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'fail');
      // 到账后立刻把顶部额度刷成真值，不等下次轮询
      if (typeof d.limit === 'number') {
        updateQuota({ used: d.used, limit: d.limit });
        // 领取是明确的到账事件，横幅只在这里弹一次；lastLimit 交给轮询自己同步，避免双源
        const gained = Number(d.added) || Number(block.amount) || 0;
        const bonus = Number(d.bonus) || 0;
        showQuotaBanner(gained + bonus);
      }
      // 惊喜：额度数字滚动 + 彩蛋揭晓
      const amountEl = wrap.querySelector('.gift-sheet-amount b');
      animateNumber(amountEl, 0, Number(d.added) || Number(block.amount) || 0, 700);
      btn.textContent = '已领取';
      markGiftClaimed(block.giftId);
      markGiftCardClaimed(block);
      if (d.bonus > 0 || d.surprise) {
        const tip = document.createElement('div');
        tip.className = 'gift-sheet-surprise';
        const extra = Number(d.bonus) > 0 ? `<br><b>+${d.bonus}</b> ${unit}` : '';
        tip.innerHTML = `${d.surprise || '✨ 拆开还有一层'}${extra}`;
        wrap.querySelector('.gift-sheet-card').appendChild(tip);
        requestAnimationFrame(() => tip.classList.add('in'));
      }
      setTimeout(close, 1800);
      pollStatus();
    } catch (e) {
      if (String((e && e.message) || '').indexOf('already_claimed') !== -1) {
        markGiftClaimed(block.giftId);
        markGiftCardClaimed(block);
        btn.textContent = '已领取';
        setTimeout(close, 900);
        return;
      }
      btn.disabled = false;
      btn.textContent = '再试一次';
    }
  });
}

// 数字滚动，礼物领取时的那点仪式感
function animateNumber(el, from, to, dur) {
  if (!el) return;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 文章卡 ---------- */
async function openArticle(block) {
  openPage(block.title || '文章', pageLoading('article'), () => closePage());
  try {
    const r = await fetch(`/api/article?id=${encodeURIComponent(block.articleId || '')}`);
    const d = await r.json();
    if (!d.article) throw new Error('not_found');
    const body = renderMarkdown(d.article.content || '');
    setPageTitle(d.article.title || block.title || '文章');
    fillPage(`<div class="article-read">${body}</div>`);
  } catch (_) {
    fillPage('<div style="padding:20px;color:var(--muted)">文章没取到，稍后再试。</div>');
  }
}

/* ---------- 启动 ---------- */
function boot() {
  // 有 token 才先藏住登录页，等 checkAuth 出结果；没 token 直接露登录页，避免永远看不到
  document.body.classList.toggle('auth-pending', !!localStorage.getItem('minxtok.token'));
  initUi();
  bindNotice();
  startVersionWatch().catch(() => {});
  // 恢复“显示追问”偏好
  if (localStorage.getItem('minxtok.followups') === '0') document.body.classList.add('no-followups');
  applyFontSize(getFontSize());
  applyMathFont(getMathFont());
  applyChemTap();
  applyCsBlur();
  applyI18n();
  const versionEl = $('appVersion');
  if (versionEl) versionEl.textContent = 'v' + appVersion();
  syncAssistantIdentity();
  initImageViewer();

  $('btnMenu').addEventListener('click', openDrawer);

  // 页面内交互统一用事件委托，重渲染不会丢事件（之前只能切一次的根因）
  $('pageBody').addEventListener('click', (e) => {
    const fsBtn = e.target.closest('.fs-seg [data-seg]');
    if (fsBtn) {
      const v = applyFontSize(fsBtn.dataset.seg);
      localStorage.setItem('minxtok.fs', v);
      document.querySelectorAll('.fs-seg [data-seg]').forEach(b =>
        b.classList.toggle('on', b.dataset.seg === v));
      const pv = document.getElementById('fsPreview');
      if (pv) {
        pv.classList.remove('fs-demo');
        void pv.offsetWidth;
        pv.classList.add('fs-demo');
      }
      haptic(6);
      return;
    }
    const segBtn = e.target.closest('[data-seg]');
    if (segBtn) {
      const v = segBtn.dataset.seg;
      if (v === 'zh' || v === 'en') {
        const cur = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
        if (cur !== v) toggleLang();
      } else {
        setMode(v);
      }
      openSettings();
      return;
    }
    const fbBtn = e.target.closest('#fbType [data-fb]');
    if (fbBtn) {
      document.querySelectorAll('#fbType [data-fb]').forEach(b => b.classList.toggle('on', b === fbBtn));
      return;
    }
    if (e.target.closest('#btnChangelog')) {
      openPage(t('settings.changelog'), changelogPage(), () => openSettings(), 'settings');
      return;
    }
    if (e.target.closest('#btnOnboarding')) {
      openOnboardingFromSettings();
      return;
    }
    if (e.target.closest('#btnFeedback')) {
      openPage(t('settings.feedback'), feedbackPage(), () => openSettings(), 'settings');
      return;
    }
    if (e.target.closest('#fbSend')) {
      sendFeedback();
      return;
    }
    const sw = e.target.closest('[data-toggle]');
    if (sw) {
      const key = sw.dataset.toggle;
      if (key === 'haptics') {
        const next = !isHapticsOn();
        setHaptics(next, true);
        openSettings();
        return;
      } else if (key === 'mathfont') {
        const next = getMathFont() === 'serif' ? 'sans' : 'serif';
        applyMathFont(next);
        localStorage.setItem('minxtok.mathfont', next);
        haptic(6);
        openSettings();
        return;
      } else if (key === 'debug') {
        const next = localStorage.getItem('minxtok.debug') === '1' ? '0' : '1';
        localStorage.setItem('minxtok.debug', next);
        applyDebugPanel();
        openSettings();
        return;
      } else if (key === 'csblur') {
        localStorage.setItem('minxtok.csblur', getCsBlur() ? '0' : '1');
        applyCsBlur();
        haptic(6);
      } else if (key === 'chemtap') {
        const next = localStorage.getItem('minxtok.chemtap') === '0';
        localStorage.setItem('minxtok.chemtap', next ? '1' : '0');
        applyChemTap();
        haptic(6);
      } else if (key === 'voicesend') {
        const next = localStorage.getItem('minxtok.voice.autosend') === '1';
        localStorage.setItem('minxtok.voice.autosend', next ? '0' : '1');
        haptic(6);
      } else if (key === 'followups') {
        const next = localStorage.getItem('minxtok.followups') === '0';
        localStorage.setItem('minxtok.followups', next ? '1' : '0');
        document.body.classList.toggle('no-followups', !next);
        // 关掉时立即清掉页面上已有的追问，不用等刷新
        if (!next) document.querySelectorAll('.followups').forEach(el => el.remove());
      } else {
        const next = localStorage.getItem('minxtok.blurAfterSend') === '0';
        localStorage.setItem('minxtok.blurAfterSend', next ? '1' : '0');
      }
      openSettings();
      return;
    }
    if (e.target.closest('#btnHapticTest')) {
      if (!isHapticsOn()) { toast(t('settings.haptics.off')); return; }
      haptic([14, 34, 14], true);
      return;
    }
    if (e.target.closest('#btnLogout')) {
      const token = localStorage.getItem('minxtok.token');
      if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      localStorage.removeItem('minxtok.token');
      localStorage.removeItem('minxtok.email');
      closePage();
      showAuth();
      return;
    }
    if (e.target.closest('#btnClear')) {
      openClearDataDialog();
    }
  });

  // 搜索：整页
  $('btnSearch').addEventListener('click', openSearchPage);

  // 情绪中心：最近一周的情绪分布
  $('btnMood').addEventListener('click', openEmotionPage);

  document.querySelectorAll('.drawer .item[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const nav = el.dataset.nav;
      // 点完菜单立即收抽屉，和页面切换同时进行，手感更利索。
      closeDrawer();
      if (nav === 'chat') { closePage(); return; }
      if (nav === 'topup') { openTopup(); return; }
      if (nav === 'diary') { openDiary(); return; }
      if (nav === 'archive') { openArchive(); return; }
      if (nav === 'study') { openStudy(); return; }
      if (nav === 'games') { openGames(); return; }
      if (nav === 'assistant') { openAssistant(); return; }

      if (nav === 'settings') {
        openSettings();
        refreshQuota();
      }

      if (nav === 'about') openPage(t('modal.about'), aboutPage(), null, 'about');
    });
  });

  window.addEventListener('minxtok:nav', (e) => {
    if (e.detail === 'diary') openDiary();
    else if (e.detail === 'study') openStudy();
    else if (e.detail === 'archive') openArchive();
  });

  const input = $('input');
  const composer = document.querySelector('.composer');

  /* ---------- 长按说话：浮层提示卡 + 实时转文字 ---------- */
  const vh = {
    timer: 0, stream: null, ac: null, proc: null, t0: 0, active: false, cancel: false,
    y0: 0, el: null, level: 0, held: false, pulseAt: 0, target: null, raf: 0,
    rate: 16000, chunks: [], samples: 0, cut: 0, live: '', busy: false,
    veil: null, wave: new Array(15).fill(0), suppress: false,
  };

  const vhZh = () => getLang() !== 'en';
  const vhAutoSend = () => store.get('minxtok.voice.autosend') === '1';

  const VH_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.6" width="6" height="11.2" rx="3"/><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0"/><path d="M12 18v3.2"/></svg>';
  const VH_BARS = 15;

  function vhBuild() {
    if (!vh.veil) {
      const veil = document.createElement('div');
      veil.className = 'voice-veil';
      document.body.appendChild(veil);
      vh.veil = veil;
    }
    if (vh.el) return vh.el;
    const box = document.createElement('div');
    box.className = 'voice-hud';
    box.innerHTML = '<div class="vh-stage">'
      + '<span class="vh-ring"></span><span class="vh-ring"></span><span class="vh-ring"></span>'
      + '<span class="vh-core">' + VH_MIC + '</span>'
      + '</div>'
      + '<div class="vh-tip"></div>'
      + '<div class="vh-time">0.0s</div>'
      + '<div class="vh-wave">' + '<i></i>'.repeat(VH_BARS) + '</div>'
      + '<div class="vh-live"></div>';
    document.body.appendChild(box);
    vh.el = box;
    return box;
  }

  // 音纹：最近十几帧的音量从左滚到右，套一层中间高、两边低的包络，
  // 看着是一条有起伏的波，不是一排乱跳的竖线（明轩 2026-10-29 说太挤、呼吸不好看）
  function vhPaintWave() {
    if (!vh.el) return;
    const bars = vh.el.querySelectorAll('.vh-wave i');
    const n = bars.length || 1;
    const mid = (n - 1) / 2;
    for (let i = 0; i < bars.length; i++) {
      const v = vh.wave[i] || 0;
      const env = 0.42 + 0.58 * (1 - Math.abs(i - mid) / (mid || 1));
      const h = 3 + Math.pow(v, 0.68) * 15 * env;
      bars[i].style.height = h.toFixed(1) + 'px';
      bars[i].style.opacity = (0.3 + v * 0.62 * env + 0.08).toFixed(2);
    }
  }

  // 卡片浮在上面那条输入框的正上方（学习中心用的也是同一个实现）
  function vhPlace(box, again) {
    let bottom = 96;
    try {
      const el = vh.target || input;
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      // 卡片离输入框再抬一点，别贴着输入条（明轩 2026-10-29）
      const LIFT = 34;
      if (r && r.top > 0) bottom = Math.max(12, window.innerHeight - r.top + 14) + LIFT;
      const maxB = Math.max(12, window.innerHeight - 210);
      if (bottom > maxB) bottom = maxB;
      // 背景模糊只糊输入框以上：输入框那一块要留着清楚，不然刚打的字看不清
      if (vh.veil) {
        const holder = el.closest('.composer, .study-composer, form') || el;
        const hr = holder.getBoundingClientRect();
        // 模糊就停在输入条上沿，不往下吃进输入条（明轩 2026-10-29：位置老是不对）
        const cut = Math.max(0, Math.min(window.innerHeight, window.innerHeight - hr.top));
        vh.veil.style.bottom = cut + 'px';
      }
    } catch (_) {}
    box.style.bottom = bottom + 'px';
    // 键盘收起动画还没走完时量到的位置偏低，220ms 后再对一次（只补一次，别自己续下去）
    if (!again) {
      clearTimeout(vh.repl);
      vh.repl = setTimeout(() => { try { vhPlace(box, true); } catch (_) {} }, 220);
    }
  }

  function vhSetTip(text) {
    if (!vh.el) return;
    const tip = vh.el.querySelector('.vh-tip');
    if (tip) tip.textContent = text;
  }

  function vhTeardown() {
    try { if (vh.proc) { vh.proc.onaudioprocess = null; vh.proc.disconnect(); } } catch (_) {}
    vh.proc = null;
    try { if (vh.ac) vh.ac.close(); } catch (_) {}
    vh.ac = null;
    try { if (vh.stream) vh.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    vh.stream = null;
    cancelAnimationFrame(vh.raf);
    if (vh.el) vh.el.classList.remove('show', 'cancel');
    if (vh.veil) vh.veil.classList.remove('show');
    clearTimeout(vh.repl);
    try { input.classList.remove('voice-rec'); } catch (_) {}
  }

  function vhTick() {
    if (!vh.active || !vh.el) return;
    const t = vh.el.querySelector('.vh-time');
    if (t) t.textContent = ((Date.now() - vh.t0) / 1000).toFixed(1) + 's';
    vh.raf = requestAnimationFrame(vhTick);
  }

  // 把已经收到的 PCM 取一段出来（按采样点区间），拼成 Float32
  function vhFlat(from, to) {
    const out = new Float32Array(Math.max(0, to - from));
    let pos = 0;
    let o = 0;
    for (let i = 0; i < vh.chunks.length; i++) {
      const ch = vh.chunks[i];
      const end = pos + ch.length;
      if (end > from && pos < to) {
        const a = Math.max(from, pos) - pos;
        const b = Math.min(to, end) - pos;
        out.set(ch.subarray(a, b), o);
        o += b - a;
      }
      pos = end;
      if (pos >= to) break;
    }
    return o === out.length ? out : out.subarray(0, o);
  }

  function pcmToWav(f32, rate) {
    const n = f32.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const ws = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, n * 2, true);
    let off = 44;
    for (let i = 0; i < n; i++) {
      const x = Math.max(-1, Math.min(1, f32[i]));
      v.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      off += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // 远距离说话的原始电平常常只有正常的三分之一，直接丢给 Whisper 就是「听不清」。
  // 这里先去掉直流、砍掉 80Hz 以下的低频轰隆，再把峰值顶到 0.9（最多放大 10 倍），最后软限幅防削波。
  function vhClean(pcm) {
    const n = pcm.length;
    const out = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += pcm[i];
    mean /= n || 1;
    const a = Math.exp(-2 * Math.PI * 80 / vh.rate); // 一阶高通，80Hz
    let prevIn = 0, prevOut = 0;
    for (let i = 0; i < n; i++) {
      const x = pcm[i] - mean;
      const y = a * (prevOut + x - prevIn);
      prevIn = x; prevOut = y;
      out[i] = y;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) { const v = out[i] < 0 ? -out[i] : out[i]; if (v > peak) peak = v; }
    if (peak > 0.0004) {
      // 上限从 10 提到 22：远场说话峰值常常只有 0.004，10 倍也才 0.04，Whisper 直接当空白
      const gain = Math.min(22, 0.92 / peak);
      if (gain > 1) for (let i = 0; i < n; i++) out[i] *= gain;
    }
    // 噪声门：按 20ms 一帧估底噪（取 20% 分位），明显低于底噪的帧压下去，
    // 免得环境噪音被一起放大成「嘈杂」（明轩 2026-10-29）
    const fl = Math.max(1, Math.floor(vh.rate * 0.02));
    const frames = Math.max(1, Math.floor(n / fl));
    const rms = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const st = f * fl;
      const en = Math.min(n, st + fl);
      for (let i = st; i < en; i++) sum += out[i] * out[i];
      rms[f] = Math.sqrt(sum / Math.max(1, en - st));
    }
    const sorted = Array.from(rms).sort((a, b) => a - b);
    const floor = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2))] || 0;
    if (floor > 0.0006) {
      const cut = floor * 1.5;
      for (let f = 0; f < frames; f++) {
        if (rms[f] >= cut) continue;
        const st = f * fl;
        const en = Math.min(n, st + fl);
        const k = 0.25;
        for (let i = st; i < en; i++) out[i] *= k;
      }
    }
    for (let i = 0; i < n; i++) {
      const v = out[i];
      out[i] = v > 0.95 ? 0.95 : (v < -0.95 ? -0.95 : v);
    }
    return out;
  }

  // fix=true 时让后端把听错的同音字按原意纠一遍（只有定稿走，草稿不走，省时间）
  // 松手后异步纠错：只改同音字和标点。返回时如果输入框已经被改过就放弃，绝不覆盖用户输入。
  async function vhFixLater(target, raw) {
    if (!vhZh() || !raw || raw.length < 3) return;
    const mine = String(target.value || '');
    try {
      const r = await fetch('/api/stt/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw, lang: 'zh' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.text || d.text === raw) return;
      if (String(target.value || '') !== mine) return;
      target.value = mine.replace(raw, d.text);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  async function vhTranscribe(from, to, fix) {
    const raw = vhFlat(from, to);
    if (raw.length < vh.rate * 0.25) return '';
    const pcm = vhClean(raw);
    const ctrl = new AbortController();
    const guard = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, fix ? 28000 : 20000);
    try {
      const r = await fetch('/api/stt?lang=' + (vhZh() ? 'zh' : 'en') + (fix ? '&fix=1' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: pcmToWav(pcm, vh.rate),
        signal: ctrl.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.error === 'stt_not_configured') throw new Error(vhZh() ? '语音服务还没配好' : 'Speech service is not configured');
      if (!r.ok || (d && d.error)) throw new Error((d && d.message) || 'stt');
      return String((d && d.text) || '').trim();
    } finally {
      clearTimeout(guard);
    }
  }

  // 边说边出字：每攒够两秒多就送去转一段，先垫个草稿，松手再用整段精修
  function vhFlushPartial() {
    if (vh.busy || !vh.active) return;
    const from = vh.cut;
    const to = vh.samples;
    if (to - from < vh.rate * 1.2) return;
    vh.busy = true;
    vhTranscribe(from, to).then((txt) => {
      vh.cut = to;
      if (!txt) return;
      vh.live = (vh.live ? vh.live + ' ' : '') + txt;
      vh.live = vh.live.slice(-600);
      if (vh.el) {
        const l = vh.el.querySelector('.vh-live');
        if (l) l.textContent = vh.live;
      }
    }).catch(() => { vh.cut = to; }).finally(() => { vh.busy = false; });
  }

  // 手指一按下就去要麦克风：先在后台握手，等真要录时流已经在手上
  function vhWarm() {
    if (vh.mediaPromise) return vh.mediaPromise;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    vh.mediaPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    }).then((st) => {
      if (vh.mediaWanted) return st;
      // 只是点了一下、没真录：把流关掉，别占着麦克风
      try { st.getTracks().forEach(t => t.stop()); } catch (_) {}
      return null;
    }).catch((e) => { vh.mediaErr = e; return null; });
    return vh.mediaPromise;
  }

  async function vhStart() {
    if (vh.active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast(vhZh() ? '这个浏览器不支持录音，改用输入法语音吧' : 'Recording is not supported in this browser');
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      toast(vhZh() ? '这个浏览器不支持录音，改用输入法语音吧' : 'Recording is not supported in this browser');
      return;
    }
    vh.active = true;
    vh.cancel = false;
    vh.draft = null;
    vh.chunks = [];
    vh.samples = 0;
    vh.cut = 0;
    vh.live = '';
    vh.busy = false;
    vh.level = 0;
    vh.t0 = Date.now();
    // 先把光标和选择手柄按下去，别让系统弹复制粘贴菜单；顺手把键盘收掉
    try { window.getSelection && window.getSelection().removeAllRanges(); } catch (_) {}
    try { (vh.target || input).blur(); } catch (_) {}
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (_) {}
    try {
      vh.mediaWanted = true;
      let stream = vh.mediaPromise ? await vh.mediaPromise : null;
      vh.mediaPromise = null;
      if (!stream) {
        if (vh.mediaErr && vh.mediaErr.name) throw vh.mediaErr;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
      }
      if (!vh.active) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} return; }
      vh.stream = stream;
      const ac = vh.ac || new AC();
      vh.ac = ac;
      try { if (ac.state === 'suspended') await ac.resume(); } catch (_) {}
      const src = ac.createMediaStreamSource(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      vh.proc = proc;
      const sink = ac.createGain();
      sink.gain.value = 0;
      const step = ac.sampleRate / vh.rate;
      proc.onaudioprocess = (e) => {
        if (!vh.active) return;
        const inp = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inp.length; i++) sum += inp[i] * inp[i];
        const rms = Math.sqrt(sum / inp.length);
        vh.level = Math.min(1, vh.level * 0.55 + Math.min(1, rms * 5.2) * 0.45);
        // 降到 16k 单声道，够 Whisper 用，传输也小
        const outLen = Math.max(1, Math.floor(inp.length / step));
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const a = Math.floor(i * step);
          const b = Math.min(inp.length, Math.max(a + 1, Math.floor((i + 1) * step)));
          let acc = 0;
          for (let k = a; k < b; k++) acc += inp[k];
          out[i] = acc / (b - a);
        }
        vh.chunks.push(out);
        vh.samples += outLen;
        vh.wave.push(vh.level);
        if (vh.wave.length > VH_BARS) vh.wave.shift();
        if (vh.el) { vh.el.style.setProperty('--lvl', vh.level.toFixed(2)); vhPaintWave(); }
        if (haptic && Date.now() - vh.pulseAt > 480 && vh.level > 0.16) {
          vh.pulseAt = Date.now();
          try { haptic(Math.round(3 + vh.level * 6)); } catch (_) {}
        }
        if (vh.samples - vh.cut >= vh.rate * 1.8) vhFlushPartial();
      };
      src.connect(proc);
      proc.connect(sink);
      sink.connect(ac.destination);
      const box = vhBuild();
      vhPlace(box);
      vhSetTip(vhZh() ? '松手转文字' : 'Release to transcribe');
      const liveEl = box.querySelector('.vh-live');
      if (liveEl) liveEl.textContent = '';
      vh.wave = new Array(VH_BARS).fill(0);
      vhPaintWave();
      box.classList.remove('cancel');
      box.classList.add('show');
      if (vh.veil) vh.veil.classList.add('show');
      try { input.classList.add('voice-rec'); } catch (_) {}
      try { haptic && haptic([8, 22, 8]); } catch (_) {}
      vhTick();
    } catch (e) {
      vh.active = false;
      vhTeardown();
      const name = String((e && e.name) || '');
      toast(/NotAllowed|Permission/i.test(name)
        ? (vhZh() ? '麦克风被拒绝了，去设置里开一下' : 'Microphone permission denied')
        : (vhZh() ? '麦克风没打开，再试一次' : 'Could not open the microphone'));
    }
  }

  function vhStop(cancel) {
    clearTimeout(vh.timer);
    if (!vh.active) { vh.active = false; vhTeardown(); return; }
    vh.cancel = !!cancel;
    vh.active = false;
    const held = Date.now() - vh.t0;
    const total = vh.samples;
    vhTeardown();
    if (cancel) { try { haptic && haptic(18); } catch (_) {} return; }
    // 只是点了一下（想打字）：别弹「太短了」，静默收掉并把光标还回去（明轩 2026-10-29）
    if (held < 280) {
      try { (vh.target || input).focus(); } catch (_) {}
      return;
    }
    if (total < vh.rate * 0.4 || held < 450) {
      toast(vhZh() ? '太短了，按住多说两句' : 'Too short');
      return;
    }
    // 松手瞬间先把手上的草稿塞进输入框，定稿回来再原地替换：字先到，等待感就没了
    if (vh.live) {
      try {
        const target = vh.target || input;
        const before = String(target.value || '').trim();
        target.value = before ? before + ' ' + vh.live : vh.live;
        vh.draft = { before, after: String(target.value) };
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) { vh.draft = null; }
    }
    vhFinish(total);
  }

  async function vhFinish(total) {
    const box = vhBuild();
    vhPlace(box);
    box.classList.add('show');
    if (vh.veil) vh.veil.classList.add('show');
    box.classList.remove('cancel');
    vhSetTip(vhZh() ? '正在转成文字…' : 'Transcribing…');
    try { haptic && haptic(10); } catch (_) {}
    let text = '';
    const dur = total / (vh.rate || 16000);
    try {
      // 短句整段重转（最准）；长句只补最后没转过的尾巴，
      // 否则一句话说二十秒，松手后还要把二十秒重跑一遍，慢得离谱（明轩 2026-10-29 说识别慢）
      // 松手这一下只要 whisper 的原话（不带 fix）：纠错放到后面异步做，
      // 不然一次转写要等「whisper + 大模型」两趟，手都等麻了（明轩 2026-10-29）
      const canTail = vh.live && !vh.busy && dur > 8 && vh.cut > vh.rate * 1.5 && (total - vh.cut) > vh.rate * 0.4;
      if (canTail) {
        const tail = await vhTranscribe(vh.cut, total, false);
        text = (vh.live + (tail ? ' ' + tail : '')).trim();
      } else {
        text = await vhTranscribe(0, total, false);
      }
    } catch (_) { text = ''; }
    if (!text) text = vh.live;
    box.classList.remove('show');
    if (vh.veil) vh.veil.classList.remove('show');
    if (!text) {
      toast(vhZh() ? '没听清，再说一次' : 'Did not catch that');
      return;
    }
    const target = vh.target || input;
    // 识别结果直接进输入框，一个多余的点都不留
    try {
      const d = vh.draft;
      const now = String(target.value || '');
      if (d && now === d.after) {
        // 草稿还没被动过 → 原地换成定稿
        target.value = d.before ? d.before + ' ' + text : text;
      } else if (!d) {
        const cur = now.trim();
        target.value = cur ? cur + ' ' + text : text;
      }
      // d 存在但用户中途改过字 → 别碰他改的内容
      vh.draft = null;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      // 不再 focus()：明轩 2026-10-29 说了，都用语音了就不该再呼出键盘。
      // 字已经在框里，想改再自己点。
      // 原文已经落到输入框，纠错随后台慢慢跑，回来只换字不改意
      vhFixLater(target, text);
    } catch (_) {}
    try { haptic && haptic([6, 16, 6]); } catch (_) {}
    if (vhAutoSend()) {
      setTimeout(() => {
        try {
          if (target === input) { $('btnSend').click(); }
          else {
            const holder = target.closest('.composer, form, .study-composer') || target.parentElement;
            const btn = holder && holder.querySelector('.send');
            if (btn) btn.click();
          }
        } catch (_) {}
      }, 120);
    }
  }

  // 给任意输入框挂上「长按说话」
  function attachVoiceHold(el, opts) {
    if (!el || el.dataset.voiceBound === '1') return;
    el.dataset.voiceBound = '1';
    const hold = 150;
    // 按住录音这段时间，页面本身不许滚：手指滑快了很容易被浏览器当成「整页上滑」，
    // 然后滚动卡在半路，卡片也跟着失灵（明轩 2026-10-29 反馈）。给文档挂个 touchmove 拦截罩。
    const holdScrollBlock = (ev) => { if (ev.cancelable) { try { ev.preventDefault(); } catch (_) {} } };
    const lockScroll = () => {
      document.addEventListener('touchmove', holdScrollBlock, { passive: false });
      try { document.documentElement.classList.add('vh-hold'); } catch (_) {}
    };
    const unlockScroll = () => {
      document.removeEventListener('touchmove', holdScrollBlock);
      try { document.documentElement.classList.remove('vh-hold'); } catch (_) {}
    };
    const release = () => {
      clearTimeout(vh.preview);
      if (!vh.active) vh.mediaWanted = false;
      vh.held = false;
      try { el.classList.remove('voice-hold'); } catch (_) {}
      unlockScroll();
    };
    el.addEventListener('focus', () => {
      // 按住超过 170ms 还没松手，那基本是要说话 → 把光标和键盘收掉，别打断录音；
      // 140ms 内的轻点照常聚焦，打字不受影响（明轩 2026-10-29 反馈）
      if (!vh.suppress) return;
      clearTimeout(el.__vf);
      el.__vf = setTimeout(() => {
        if (!vh.held || vh.active) return;
        if (document.activeElement !== el) return;
        try { el.blur(); } catch (_) {}
        try { const sel = document.getSelection(); if (sel) sel.removeAllRanges(); } catch (_) {}
      }, 170);
    });
    // iOS 上光靠 pointerdown 的 preventDefault 拦不住聚焦/键盘，touchstart 这一道必须补，
    // 代价是轻点不再自动聚焦 → pointerup 里自己补 focus()（明轩 2026-10-29：光标和语音还在打架）
    el.addEventListener('touchstart', (e) => {
      if (e.cancelable) { try { e.preventDefault(); } catch (_) {} }
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      vh.suppress = e.pointerType !== 'mouse';
      vh.target = el;
      vh.y0 = e.clientY;
      vh.held = true;
      vh.downAt = Date.now();
      vh.downX = e.clientX;
      vh.downY = e.clientY;
      // 触摸时直接掐掉默认行为：系统就不会给输入框聚焦、不会立光标、不会弹选择手柄，
      // 长按也就不会派发 pointercancel 把录音取消掉（明轩 2026-10-29 反馈的根因）。
      // 纯点按在 pointerup 里自己 focus() 还回去。
      if (e.pointerType !== 'mouse' && e.cancelable) { try { e.preventDefault(); } catch (_) {} }
      // 再补一道保险：按住这段时间把输入框设成只读，就算系统硬要聚焦也不会弹键盘、不会立光标
      if (e.pointerType !== 'mouse') {
        try { el.readOnly = true; } catch (_) {}
        lockScroll();
      }
      // AudioContext 必须在手指按下这一刻建好并唤醒，晚 300ms 再建会被当自动播放拦掉
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          if (!vh.ac || vh.ac.state === 'closed') {
            // 直接问系统要 16k：浏览器自己做抗混叠重采样，比我们按块平均干净得多，
            // 远场/小声说话时识别率差别很明显（明轩 2026-10-29 反馈「离远了听不清」）
            try { vh.ac = new AC({ sampleRate: 16000 }); } catch (_) { vh.ac = new AC(); }
          }
          if (vh.ac.state === 'suspended') vh.ac.resume();
        }
      } catch (_) {}
      // 麦克风握手也提前到按下这一刻：权限已给过时通常几十毫秒就回来，
      // 等到 150ms 才要，卡片就得干等一轮（明轩 2026-10-29：比以前还慢）
      try { vhWarm(); } catch (_) {}
      try { el.classList.add('voice-hold'); } catch (_) {}
      // 手指还按着就先立卡：以前要等 300ms 定时器 + getUserMedia 回来才见卡片，
      // 麦克风慢一点就要干等一秒，手感像卡死（明轩 2026-10-29）
      clearTimeout(vh.preview);
      vh.preview = setTimeout(() => {
        if (!vh.held || vh.target !== el || vh.el) return;
        const box0 = vhBuild();
        vhPlace(box0);
        vhSetTip(vhZh() ? '准备录音…' : 'Starting…');
        box0.classList.remove('cancel');
        box0.classList.add('show');
        if (vh.veil) vh.veil.classList.add('show');
      }, 70);
      clearTimeout(vh.timer);
      vh.timer = setTimeout(() => { if (vh.held && vh.target === el) vhStart(); }, hold);
    });
    el.addEventListener('pointermove', (e) => {
      if (!vh.held || vh.target !== el) return;
      const willCancel = e.clientY - vh.y0 < -30;
      if (willCancel !== vh.cancel) {
        vh.cancel = willCancel;
        // 还没开始录就往上滑：撤掉 300ms 的启动定时器，别让它先录再取消
        if (willCancel) clearTimeout(vh.timer);
        else if (vh.held && !vh.active) {
          clearTimeout(vh.timer);
          vh.timer = setTimeout(() => { if (vh.held && vh.target === el) vhStart(); }, hold);
        }
        if (willCancel) {
          // 关键：还没到 300ms（卡片还没建）也要立刻给红色反馈，否则手指上滑什么都看不到
          const box = vhBuild();
          vhPlace(box);
          box.classList.add('show', 'cancel');
          if (vh.veil) vh.veil.classList.add('show');
          vhSetTip(vhZh() ? '松开取消' : 'Release to cancel');
        } else if (vh.el) {
          vh.el.classList.remove('cancel');
          if (!vh.active) {
            vh.el.classList.remove('show');
            if (vh.veil) vh.veil.classList.remove('show');
          } else {
            vhSetTip(vhZh() ? '松手转文字' : 'Release to transcribe');
          }
        }
        try { haptic && haptic(10); } catch (_) {}
      }
    });
    el.addEventListener('pointerup', (e) => {
      clearTimeout(vh.timer);
      clearTimeout(el.__vf);
      const wasActive = vh.active && vh.target === el;
      const wasHeld = vh.held;
      const wasSuppress = vh.suppress;
      const dt = Date.now() - (vh.downAt || 0);
      const moved = Math.abs((e.clientX || 0) - (vh.downX || 0)) + Math.abs((e.clientY || 0) - (vh.downY || 0));
      release();
      try { el.readOnly = false; } catch (_) {}
      if (wasActive) vhStop(vh.cancel);
      else {
        // 只上滑没录：把刚才立起来的那张红卡收掉
        if (vh.el) { vh.el.classList.remove('show', 'cancel'); }
        if (vh.veil) vh.veil.classList.remove('show');
        // 我们掐掉了默认行为，轻点要把光标和键盘自己还回去（点按 <350ms、没怎么移动）
        if (wasSuppress && dt < 350 && moved < 12 && !vh.cancel) { try { el.focus(); } catch (_) {} }
      }
      vh.cancel = false;
      vh.suppress = false;
    });
    // 系统把指针抢走（来电、通知栏、选择手柄）不等于用户要取消：
    // 按当前红/不红的状态收尾，别让一次误抢把整句话丢掉
    el.addEventListener('pointercancel', () => {
      clearTimeout(vh.timer);
      clearTimeout(el.__vf);
      const wasActive = vh.active && vh.target === el;
      release();
      try { el.readOnly = false; } catch (_) {}
      if (wasActive) vhStop(vh.cancel);
      else {
        if (vh.el) vh.el.classList.remove('show', 'cancel');
        if (vh.veil) vh.veil.classList.remove('show');
      }
      vh.cancel = false;
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      clearTimeout(vh.timer);
      release();
      if (vh.active && vh.target === el) vhStop(true);
    });
    // 长按不要弹系统菜单/选择手柄
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('selectstart', (e) => { if (vh.held || vh.active) e.preventDefault(); });
    el.addEventListener('longpress', (e) => e.preventDefault());
  }
  window.attachVoiceHold = attachVoiceHold;
  attachVoiceHold(input);

  const clearFocus = () => composer.classList.remove('focused');

  input.addEventListener('focus', () => {
    composer.classList.add('focused');
    // 聚焦瞬间就开始追底，不等视口事件，手感更快
    scrollBottom();
    [40, 90, 160, 260, 380].forEach(ms => scrollBottomSoon(ms));
  });
  input.addEventListener('blur', clearFocus);


  // 键盘没有系统事件，只能看可视视口高度：变矮就认为键盘起来了，把聊天滚到底
  const baseH = window.innerHeight;
  let kbOpen = false;
  const onViewport = () => {
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;
    const offset = vv ? (vv.offsetTop || 0) : 0;
    const kb = baseH - Math.min(window.innerHeight, vh) - offset;
    const open = kb > 80;
    if (open && !kbOpen) {
      kbOpen = true;
      scrollBottom();
      [40, 90, 160, 260].forEach(ms => scrollBottomSoon(ms));
    }
    if (!open) {
      // 键盘落下去，可视高度变高，底部留白一人高 —— 补一次，不然停在上面那条
      if (kbOpen) {
        [0, 60, 180].forEach(ms => setTimeout(() => { if (stickBottom) jumpBottom(); }, ms));
        // 键盘都收了，输入框不该还挂着聚焦态：光标、聚焦高亮一起收掉（明轩 2026-10-29）
        try {
          const ae = document.activeElement;
          if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && !ae.readOnly) ae.blur();
        } catch (_) {}
        clearFocus();
      }
      kbOpen = false;
    }
  };
  window.addEventListener('resize', onViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewport);
    window.visualViewport.addEventListener('scroll', onViewport);
  }

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text && !pendingImage.data) return;
      haptic(8);
      sendComposer();
    }
  });
  const chatPick = $('chatImageInput');
  const chatPickBtn = $('btnChatImage');
  if (chatPick && chatPickBtn) {
    chatPickBtn.addEventListener('click', () => {
      if (state.sending) return;
      if (pendingImage.data) {
        haptic(6);
        if (window.__minxOpenImage) window.__minxOpenImage(pendingImage.data);
        return;
      }
      haptic(6);
      chatPickBtn.classList.remove('flash');
      void chatPickBtn.offsetWidth;
      chatPickBtn.classList.add('flash');
      setTimeout(() => chatPickBtn.classList.remove('flash'), 260);
      chatPick.click();
    });
    chatPick.addEventListener('change', async () => {
      const file = chatPick.files && chatPick.files[0];
      chatPick.value = '';
      if (!file) return;
      chatPickBtn.disabled = true;
      try {
        const image = await chatImageData(file);
        setPendingImage(image);
        await recognizePending(image);
      } catch (e) {
        errToast(e.message || '图片读不出来');
      } finally {
        chatPickBtn.disabled = false;
        if (pendingImage.data) input.focus();
      }
    });
    const thumb = $('pendingThumb');
    if (thumb) thumb.addEventListener('click', () => {
      if (pendingImage.data && window.__minxOpenImage) window.__minxOpenImage(pendingImage.data);
    });
    const del = $('pendingDelete');
    if (del) del.addEventListener('click', () => {
      haptic(6);
      resetPending();
      input.focus();
    });
  }
  $('btnSend').addEventListener('click', () => {
    // 生成中：变成停止键，点一下中断
    if (state.sending) {
      haptic([10, 18, 10]);
      const btn = $('btnSend');
      btn.classList.add('hit');
      setTimeout(() => btn.classList.remove('hit'), 220);
      if (state.currentXhr) { try { state.currentXhr.abort(); } catch (_) {} }
      return;
    }
    const text = input.value.trim();
    if (!text && !pendingImage.data) return;
    haptic(8);
    sendComposer();
  });

  // 有 token 时交给 checkAuth 恢复，避免游客 uid 的旧请求把真实历史覆盖掉
  if (!localStorage.getItem('minxtok.token')) restoreHistory();

  // ?demo=1 展示音乐卡与追问的动效（本地演示，不入库、不占额度）
  if (new URLSearchParams(location.search).get('demo') === '1') {
    chat.appendChild(renderMessage({
      id: 'demo_music',
      role: 'assistant',
      blocks: [
        { id: 'blk_demo_t', type: 'text', text: '明轩，睡前给你放了首歌。听两遍就躺平，别刷手机了。' },
        { id: 'blk_demo_m', type: 'music', title: '晴天', artist: '周杰伦', platform: 'QQ音乐', action: 'play', url: 'https://y.qq.com/' },
        { id: 'blk_demo_f', type: 'followups', action: 'send', items: ['这首歌为什么经典', '再放一首更慢的', '你困的时候听什么'] },
      ],
    }));
    scrollBottom();
  }

  if (localStorage.getItem('minxtok.token')) startStatusPolling();
}

let statusTimer = 0;
function startStatusPolling() {
  if (statusTimer) return;
  pollStatus();
  statusTimer = setInterval(pollStatus, 8000);
}

// 等字体就绪（最多 4 秒），避免系统字体先闪一下再换成苹方
async function waitFont() {
  if (!document.fonts || !document.fonts.load) return;
  // iOS/macOS 自带苹方，直接用系统字体，不必再拉站内那 2.6MB
  try { if (document.fonts.check('15px "PingFang SC"')) return; } catch (_) { /* 忽略 */ }
  try {
    await Promise.race([
      document.fonts.load('15px "MinxTok Sans"', '明轩虾虾'),
      new Promise(r => setTimeout(r, 1200)),
    ]);
  } catch (_) { /* 字体失败也不挡着进站 */ }
}

async function start() {
  // 启动页英文状态轮播
  const words = ['Connecting', 'Loading', 'Handshake', 'Almost done', 'Welcome'];
  const el = document.getElementById('splashText');
  let wi = 0;
  const timer = setInterval(() => {
    if (!el) return;
    wi = Math.min(wi + 1, words.length - 1);
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = words[wi]; el.style.opacity = '1'; }, 120);
  }, 620);

  // 字体最多等 1.2 秒；主题先按缓存落色，定位在后台校正，不挡揭幕
  await waitFont();
  initTheme().catch(() => {});
  clearInterval(timer);
  if (el) { el.textContent = 'Welcome'; el.style.opacity = '1'; }
  requestAnimationFrame(() => document.body.classList.remove('loading'));
  setTimeout(() => {
    const sp = document.getElementById('splash');
    if (sp) sp.remove();
  }, 600);
}

/* ---------- 调试悬浮窗（设置 → 调试 开关控制，可拖动、可复制） ---------- */
let dbgEl = null;
let dbgTimer = 0;
let dbgRaf = 0;
let dbgFrames = 0;
let dbgFps = 0;
let dbgFpsAt = 0;

function dbgVerOf(sel, attr) {
  const el = document.querySelector(sel);
  const url = el ? (el.getAttribute(attr) || '') : '';
  const m = url.match(/[?&]v=(\d+)/);
  return m ? m[1] : '?';
}

function dbgText() {
  const chat = document.getElementById('chat');
  const app = document.getElementById('app');
  const bar = document.querySelector('.appbar');
  const comp = document.querySelector('.composer');
  const vv = window.visualViewport;
  const box = (el) => {
    if (!el) return '—';
    const r = el.getBoundingClientRect();
    return 't' + Math.round(r.top) + ' h' + Math.round(r.height);
  };
  const n = (v) => Math.round(v || 0);
  const out = [];
  out.push('MinxTok  js' + dbgVerOf('script[src*="app.js"]', 'src') + '  css' + dbgVerOf('link[href*="theme.css"]', 'href'));
  out.push('视口 ' + window.innerWidth + 'x' + window.innerHeight + '  dpr' + (window.devicePixelRatio || 1).toFixed(2));
  out.push('vv h' + n(vv && vv.height) + ' top' + n(vv && vv.offsetTop) + ' sc' + ((vv && vv.scale) || 1).toFixed(2));
  out.push('#app ' + box(app));
  out.push('顶栏 ' + box(bar));
  out.push('输入区 ' + box(comp));
  if (chat) out.push('聊天 st' + n(chat.scrollTop) + '  ' + n(chat.scrollHeight) + '/' + n(chat.clientHeight) + '  stick' + (stickBottom ? 1 : 0));
  out.push('fps' + dbgFps + '  ' + (document.documentElement.dataset.theme || '?') + '  body:' + (document.body.className || '-'));
  out.push(new Date().toTimeString().slice(0, 8));
  return out.join('\n');
}

function dbgStop() {
  if (dbgTimer) { clearInterval(dbgTimer); dbgTimer = 0; }
  if (dbgRaf) { cancelAnimationFrame(dbgRaf); dbgRaf = 0; }
  if (dbgEl) { dbgEl.remove(); dbgEl = null; }
}

function applyDebugPanel() {
  if (localStorage.getItem('minxtok.debug') !== '1') { dbgStop(); return; }
  if (dbgEl) return;
  const el = document.createElement('div');
  el.id = 'dbgPanel';
  el.style.cssText = 'position:fixed;z-index:99990;max-width:88vw;padding:8px 10px;border-radius:12px;' +
    'background:rgba(10,10,12,.87);color:#e8e8ea;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'white-space:pre;box-shadow:0 10px 28px -14px rgba(0,0,0,.9);user-select:none;-webkit-user-select:none;touch-action:none';
  const pos = (() => { try { return JSON.parse(localStorage.getItem('minxtok.debug.pos') || '[]'); } catch (e) { return []; } })();
  if (pos && pos.length === 2) { el.style.left = pos[0] + 'px'; el.style.top = pos[1] + 'px'; }
  else { el.style.right = '10px'; el.style.top = '64px'; }
  el.innerHTML =
    '<div id="dbgHead" style="display:flex;gap:10px;align-items:center;margin-bottom:2px;color:#8f8f96;padding-bottom:2px">' +
      '<span style="flex:1;letter-spacing:.5px">DEBUG</span>' +
      '<span id="dbgCopy" style="color:#07c160">复制</span>' +
      '<span id="dbgClose" style="color:#8f8f96">关闭</span>' +
    '</div><div id="dbgBody">…</div>';
  document.body.appendChild(el);
  dbgEl = el;

  const body = el.querySelector('#dbgBody');
  const paint = () => { try { body.textContent = dbgText(); } catch (e) { body.textContent = 'err ' + e.message; } };
  paint();
  dbgTimer = setInterval(paint, 300);

  dbgFpsAt = performance.now();
  dbgFrames = 0;
  const tick = () => {
    dbgFrames += 1;
    const now = performance.now();
    if (now - dbgFpsAt >= 1000) { dbgFps = Math.round(dbgFrames * 1000 / (now - dbgFpsAt)); dbgFrames = 0; dbgFpsAt = now; }
    dbgRaf = requestAnimationFrame(tick);
  };
  dbgRaf = requestAnimationFrame(tick);

  el.querySelector('#dbgClose').addEventListener('click', () => {
    localStorage.setItem('minxtok.debug', '0');
    dbgStop();
    toast('debug off');
  });
  el.querySelector('#dbgCopy').addEventListener('click', () => {
    const text = dbgText();
    const done = () => toast('已复制');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  });

  // 拖动：只有标题行能拖（避免挡住读数）。
  // 以前 pointermove 挂在 head 上，手指一快滑出标题行就丢事件，
  // 表现就是「拖不动」；现在按下后把 move/up 挂到 document。
  const head = el.querySelector('#dbgHead');
  head.style.touchAction = 'none';
  head.style.cursor = 'grab';
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;

  const apply = (cx, cy) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    const nx = Math.min(Math.max(0, ox + cx - sx), Math.max(0, window.innerWidth - w));
    const ny = Math.min(Math.max(0, oy + cy - sy), Math.max(0, window.innerHeight - h));
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    try { localStorage.setItem('minxtok.debug.pos', JSON.stringify([nx, ny])); } catch (_) {}
  };

  const move = (e) => {
    if (!dragging) return;
    const touch = e.touches && e.touches[0];
    const cx = typeof e.clientX === 'number' ? e.clientX : (touch ? touch.clientX : 0);
    const cy = typeof e.clientY === 'number' ? e.clientY : (touch ? touch.clientY : 0);
    if (Math.abs(cx - sx) + Math.abs(cy - sy) > 2) moved = true;
    apply(cx, cy);
    if (e.cancelable) e.preventDefault();
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    head.style.cursor = 'grab';
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', stop, true);
    document.removeEventListener('pointercancel', stop, true);
    document.removeEventListener('touchmove', move, true);
    document.removeEventListener('touchend', stop, true);
  };

  const begin = (e) => {
    if (e.target.closest('#dbgCopy, #dbgClose')) return;
    const touch = e.touches && e.touches[0];
    const cx = typeof e.clientX === 'number' ? e.clientX : (touch ? touch.clientX : 0);
    const cy = typeof e.clientY === 'number' ? e.clientY : (touch ? touch.clientY : 0);
    const r = el.getBoundingClientRect();
    dragging = true;
    moved = false;
    sx = cx; sy = cy; ox = r.left; oy = r.top;
    el.style.left = ox + 'px';
    el.style.top = oy + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    head.style.cursor = 'grabbing';
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', stop, true);
    // 按在标题上不误触下面的内容滚动
    if (e.cancelable) e.preventDefault();
  };

  head.addEventListener('pointerdown', begin);
  head.addEventListener('touchstart', begin, { passive: false });
  // 拖完松手时别把 click 落到下面的按钮上
  head.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
}

window.__minxBooted = true;
start();
/* ---------- 登录 ---------- */
const authEl = document.getElementById('auth');
let authMode = 'login';
let authBusy = false;

function adoptUser(user) {
  if (!user || !user.id) return;
  if (state.uid !== user.id) {
    state.uid = user.id;
    try { store.set('minxtok.uid', user.id); } catch (_) {}
  }
  state.authed = true;
  document.body.classList.add('authed');
  startPayWatch();
  if (authReadyResolve) { try { authReadyResolve(); } catch (_) {} }
}

function syncCodeRow() {
  const show = authMode === 'recover' || authMode === 'register';
  document.getElementById('authCodeRow').style.display = show ? 'flex' : 'none';
}

function applyAuthLang() {
  const recover = authMode === 'recover';
  const lang = getLang();
  const langBtn = document.getElementById('authLang');
  if (langBtn) langBtn.textContent = lang === 'zh' ? 'En' : '中文';
  const titleEl = document.getElementById('authTitle');
  if (titleEl) titleEl.textContent = lang === 'zh'
    ? (recover ? '重设密码' : (authMode === 'login' ? '欢迎回来' : '创建账号'))
    : (recover ? 'Reset password' : (authMode === 'login' ? 'Welcome back' : 'Create account'));
  document.getElementById('authEmail').placeholder = t('auth.ph.id');
  document.getElementById('authPassword').placeholder = t('auth.ph.pw');
  document.getElementById('authNew').placeholder = t('auth.ph.new');
  document.getElementById('authCodeBtn').textContent = t('auth.code.send');
  document.getElementById('authCode').placeholder = recover ? t('auth.ph.recovery') : t('auth.ph.code');
  document.getElementById('authSub').textContent = recover
    ? t('auth.sub.recover')
    : (authMode === 'login' ? t('auth.sub.login') : t('auth.sub.register'));
  document.getElementById('authSubmit').textContent = recover
    ? t('auth.submit.reset')
    : (authMode === 'login' ? t('auth.submit.enter') : t('auth.submit.create'));
  document.getElementById('waBtn').textContent = authMode === 'login' ? t('auth.passkey.login') : t('auth.passkey.register');
  document.getElementById('authForgot').textContent = recover ? t('auth.back') : t('auth.forgot');
  document.querySelectorAll('#authSeg button').forEach(b => {
    b.textContent = b.dataset.mode === 'login' ? t('auth.seg.login') : t('auth.seg.register');
  });
  const orText = document.querySelector('.auth-or span');
  if (orText) orText.textContent = t('auth.or');
  const termsText = document.getElementById('authTermsText');
  if (termsText && termsText.firstChild) termsText.firstChild.nodeValue = t('auth.terms.prefix');
  const termsLinkEl = document.getElementById('authTermsLink');
  if (termsLinkEl) termsLinkEl.textContent = t('auth.terms.link');
  const zh = lang === 'zh';
  const heroH = document.querySelector('.auth-hero h1');
  if (heroH) heroH.innerHTML = zh ? '和虾虾，<br>把今天说清楚。' : 'Talk it out<br>with Xiaxia.';
  const heroP = document.querySelector('.auth-hero p');
  if (heroP) heroP.textContent = zh
    ? '聊天、日记、学习、游戏，都在一个安静的空间里。'
    : 'Chat, journal, study and games, all in one quiet place.';
  const points = document.querySelectorAll('.auth-points span');
  const enPoints = [
    'Remembers your preferences — and what you avoid',
    'Journal, moods and study notes together',
    'Quiet, never pushy, always here',
  ];
  const zhPoints = [
    '记得你的偏好，也记得你怕什么',
    '日记、情绪、学习记录放在一起',
    '不吵，不催，随时可以回来',
  ];
  points.forEach((el, i) => { el.textContent = zh ? zhPoints[i] : enPoints[i]; if (el.textContent) {} });
  const foot = document.querySelector('.auth-foot');
  if (foot) foot.textContent = zh
    ? '继续即表示你同意 MinxTok 的使用方式与隐私说明'
    : 'By continuing, you agree to how MinxTok works and handles privacy.';
}

function setAuthMode(mode) {
  authMode = mode;
  const np = document.getElementById('authNew');
  const codeRow = document.getElementById('authCodeRow');
  const seg = document.getElementById('authSeg');
  const forgot = document.getElementById('authForgot');
  const wa = document.getElementById('waBtn');
  const orEl = document.querySelector('.auth-or');

  const recover = mode === 'recover';
  seg.style.display = recover ? 'none' : 'flex';
  forgot.classList.toggle('hide', recover);
  // Passkey 验签未完善，正式版先下线入口，避免账号接管风险
  wa.style.display = 'none';
  if (orEl) orEl.style.display = 'none';
  document.getElementById('authPassword').style.display = recover ? 'none' : '';
  const termsRow = document.getElementById('authTerms');
  if (termsRow) termsRow.style.display = mode === 'register' ? 'flex' : 'none';
  np.style.display = recover ? 'block' : 'none';
  codeRow.style.display = recover ? 'flex' : 'none';
  document.getElementById('authCodeBtn').style.display = recover ? 'none' : '';
  if (recover) {
    forgot.classList.remove('hide');
  } else {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    const thumb = document.getElementById('authThumb');
    if (thumb) thumb.style.transform = mode === 'register' ? 'translateX(100%)' : 'translateX(0)';
    syncCodeRow();
  }
  applyAuthLang();
  document.getElementById('authErr').textContent = '';
}

function showAuth() {
  document.body.classList.remove('auth-pending');
  // 没登录就不让主界面在下面露出来：登录页淡出/淡入时也不会闪到空聊天页
  document.body.classList.remove('authed');
  authEl.classList.remove('hide');
}
function hideAuth() {
  document.body.classList.remove('auth-pending');
  document.body.classList.add('authed');
  authEl.classList.add('hide');
}

// 登录/注册后的统一入口：新注册用户先走引导，老用户直接恢复会话
async function enterAfterAuth(newUser = false) {
  if (newUser) {
    try { localStorage.setItem(`minxtok.onboardingPending:${state.uid}`, '1'); } catch (_) {}
  }
  restoreHistory();
  startStatusPolling();
  const opened = await maybeStartOnboarding({
    onDone: () => {
      restoreHistory();
      syncAssistantIdentity();
    },
  }, newUser);
  // 引导层是不透明底，先让它接住画面，再淡出登录页，避免中间闪出空聊天
  setTimeout(hideAuth, opened ? 90 : 0);
}

async function authSubmit() {
  if (authBusy) return;
  const identifier = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const err = document.getElementById('authErr');
  const submit = document.getElementById('authSubmit');
  err.textContent = '';
  if (authMode === 'register' && !document.getElementById('authTermsCheck').checked) {
    err.textContent = t('auth.err.terms');
    return;
  }
  authBusy = true;
  submit.disabled = true;
  const release = () => { authBusy = false; submit.disabled = false; };
  try {
    if (authMode === 'recover') {
      const r = await fetch('/api/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          code: document.getElementById('authCode').value.trim(),
          password: document.getElementById('authNew').value,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { err.textContent = d.error === 'invalid_code' ? t('auth.err.recover') : t('auth.err.reset'); release(); return; }
      localStorage.setItem('minxtok.token', d.token);
      if (d.user) adoptUser(d.user);
      release();
      enterAfterAuth(false);
      return;
    }

    const r = await fetch(`/api/auth/${authMode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authMode === 'register'
        ? { phone: identifier, password, code: document.getElementById('authCode').value.trim() }
        : { identifier, password }),
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      err.textContent = d.error === 'invalid_credentials' ? t('auth.err.cred')
        : d.error === 'account_taken' ? t('auth.err.taken')
        : d.error === 'weak_password' ? t('auth.err.weak')
        : d.error === 'invalid_identifier' ? t('auth.err.invalid')
        : d.error === 'phone_required' ? t('auth.err.phone')
        : d.error === 'bad_code' ? t('auth.err.code')
        : d.error === 'too_frequent' ? t('auth.err.freq')
        : t('auth.err.generic');
      release();
      return;
    }
    localStorage.setItem('minxtok.token', d.token);
    localStorage.setItem('minxtok.email', d.user.phone || d.user.email);
    adoptUser(d.user);
    if (authMode === 'register') {
      try { localStorage.setItem(`minxtok.onboardingPending:${state.uid}`, '1'); } catch (_) {}
    }

    const afterTerms = (newUser) => {
    if (d.recovery && d.recovery.length) {
      const list = d.recovery.map(c => `<div style="font-family:ui-monospace,Menlo,monospace;font-size:calc(var(--fs-md) * 0.9333);letter-spacing:1px;padding:3px 0">${c}</div>`).join('');
      openModal({
        title: '恢复码',
        body: `<p style="margin-top:0">这十组码只显示一次，抄下来或截图存好。忘记密码时，任意一组可以重设密码。</p><div style="background:var(--surface-2);border-radius:12px;padding:12px 14px">${list}</div>
               <button class="btn" id="recoveryDone" style="width:100%;margin-top:14px">我已保存</button>`,
      });
      document.getElementById('recoveryDone').addEventListener('click', () => {
        closeModal();
        setAuthMode('login');
        enterAfterAuth(newUser);
      });
    } else {
      setAuthMode('login');
      enterAfterAuth(newUser);
    }
    };

    if (authMode === 'register') {
      afterTerms(true);
    } else {
      afterTerms(false);
    }
    release();
  } catch (_) { err.textContent = t('auth.err.net'); release(); }
}

async function checkAuth() {
  const token = localStorage.getItem('minxtok.token');
  if (!token) { showAuth(); return; }
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      adoptUser(d.user);
      restoreHistory();
      startStatusPolling();
      const opened = await maybeStartOnboarding({
        onDone: () => {
          restoreHistory();
          syncAssistantIdentity();
        },
      });
      setTimeout(hideAuth, opened ? 90 : 0);
    } else { localStorage.removeItem('minxtok.token'); showAuth(); }
  } catch (_) { showAuth(); }
}

document.getElementById('authEmail').addEventListener('input', syncCodeRow);

document.getElementById('authCodeBtn').addEventListener('click', async () => {
  const phone = document.getElementById('authEmail').value.trim();
  const err = document.getElementById('authErr');
  const btn = document.getElementById('authCodeBtn');
  err.textContent = '';
  if (!/^1[3-9]\d{9}$/.test(phone.replace(/[\s-]/g, '').replace(/^(\+86|86)/, ''))) {
    err.textContent = t('auth.err.phone');
    return;
  }
  btn.disabled = true;
  try {
    const r = await fetch('/api/auth/sms/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const d = await r.json();
    if (!r.ok || d.error || d.ok === false) {
      err.textContent = d.msg === '请求频繁，请稍后再试' ? t('auth.err.freq')
        : d.msg || t('auth.err.send');
      btn.disabled = false;
      return;
    }
    let left = 60;
    btn.textContent = left + 's';
    const timer = setInterval(() => {
      left -= 1;
      btn.textContent = left + 's';
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = t('auth.code.send'); }
    }, 1000);
  } catch (_) { err.textContent = t('auth.err.net'); btn.disabled = false; }
});

document.getElementById('authSubmit').addEventListener('click', authSubmit);
document.querySelectorAll('#authSeg button').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
const authLangBtn = document.getElementById('authLang');
if (authLangBtn) authLangBtn.addEventListener('click', () => {
  toggleLang();
  applyAuthLang();
});
document.documentElement.addEventListener('langchange', () => {
  if (authEl && !authEl.classList.contains('hide')) applyAuthLang();
});
const termsLink = document.getElementById('authTermsLink');
if (termsLink) termsLink.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  showTerms();
});
document.getElementById('authPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') authSubmit(); });

/* ---------- 服务条款 ---------- */
const TERMS_ZH = `欢迎使用 MinxTok（明叙）。

一、关于本站
1. MinxTok 是一个个人向的 AI 对话空间，提供与 AI「虾虾」聊天、日记、情绪记录、天气与音乐卡片等功能。
2. 本站目前由个人维护，属于非商业性质的兴趣项目，服务可能因维护、升级或不可抗力临时中断。
3. 注册账号即表示你已阅读并同意本条款；若不同意，请停止注册或使用。

二、账号与安全
1. 请使用真实可用的手机号或邮箱注册，并妥善保管密码与恢复码。
2. 账号仅限本人使用，请勿出租、出借或转让。
3. 密码以加盐哈希形式存储，我们不保存明文密码；Passkey 凭证仅保存在你的设备与浏览器中。
4. 如发现账号被他人使用或存在异常，请立即修改密码并联系管理员。

三、使用规范
1. 不得利用本站从事任何违反法律法规的行为。
2. 不得发布、生成或传播色情、暴力、仇恨、诈骗、侵权等内容。
3. 不得对本站进行爬取、扫描、攻击、逆向或干扰正常运行。
4. 不得批量注册账号、滥用额度或绕过限流机制。
5. 违反上述规范时，我们有权限制功能、暂停或删除账号。

四、AI 生成内容
1. 虾虾的回复由人工智能生成，可能存在错误、偏差或不准确之处，请自行判断，不要将其作为医疗、法律、金融等专业建议。
2. 请勿向 AI 发送身份证号、银行卡号、密码、住址等敏感个人信息。
3. AI 生成内容的版权归属与使用风险由你自行承担；如需引用，请先核实。

五、数据与隐私
1. 对话、日记、情绪记录等数据仅用于向你提供和改进服务。
2. 我们不会出售、出租或公开你的个人内容，除法律法规要求或你明确授权外不向第三方披露。
3. 你可以在站内删除自己的消息与日记，删除后相关数据将从正常访问中移除。
4. 为保障服务安全，我们可能记录必要的访问日志（如时间、IP、错误信息），并按最小必要原则保存。

六、知识产权
1. 本站的界面设计、代码、文字与品牌标识归维护者所有，未经许可不得复制或用于商业用途。
2. 你输入的内容归你所有；你授予本站为提供服务所必需的存储与处理权限。

七、服务变更与终止
1. 我们可能根据实际情况调整功能、额度或停止部分服务，并尽量提前告知。
2. 若你严重违反本条款，我们有权立即暂停或终止你的账号。
3. 你可以随时停止使用本站；账号数据可按站内提供的方式删除。

八、免责声明
1. 本站按「现状」提供服务，不对可用性、连续性或准确性作明示或默示保证。
2. 因网络故障、设备问题、第三方服务中断或不可抗力造成的损失，本站不承担责任。
3. 你因使用本站而产生的任何后果，由你自行承担。

九、条款更新
1. 我们可能适时更新本条款，更新后将在站内公布。
2. 更新后继续使用本站，即视为你接受更新后的条款；如不同意，请停止使用。

十、联系我们
如对本条款有任何疑问，可通过站内反馈或管理员邮箱联系。`;

const TERMS_EN = `Welcome to MinxTok.

1. About
1. MinxTok is a personal AI chat space offering conversations with "Xiaxia", diary, mood tracking, weather and music cards.
2. The site is maintained by an individual as a non-commercial hobby project; service may be interrupted for maintenance, upgrades or reasons beyond our control.
3. By registering, you confirm that you have read and agree to these terms. If you do not agree, please stop registering or using the service.

2. Account & Security
1. Register with a valid phone number or email, and keep your password and recovery codes safe.
2. Accounts are for personal use only; do not rent, lend or transfer them.
3. Passwords are stored as salted hashes, never in plain text. Passkey credentials stay on your device and browser.
4. If you suspect unauthorized use or any anomaly, change your password and contact the administrator immediately.

3. Acceptable Use
1. Do not use the service for anything that violates applicable laws or regulations.
2. Do not publish, generate or spread pornographic, violent, hateful, fraudulent or infringing content.
3. Do not scrape, scan, attack, reverse engineer or otherwise disrupt the service.
4. Do not mass-register accounts, abuse quotas or bypass rate limits.
5. We may restrict features, suspend or delete accounts that violate these rules.

4. AI-generated Content
1. Replies are generated by AI and may be wrong, biased or inaccurate. Use your own judgement and do not rely on them as medical, legal or financial advice.
2. Do not send ID numbers, bank card numbers, passwords, home addresses or other sensitive personal information to the AI.
3. You bear the risks of using AI-generated content; verify before quoting or republishing it.

5. Data & Privacy
1. Conversations, diary entries and mood records are used only to provide and improve the service.
2. We do not sell, rent or publish your personal content, and will not disclose it to third parties except as required by law or with your explicit permission.
3. You can delete your messages and diary entries in the app; deleted data will be removed from normal access.
4. To keep the service secure, we may log necessary access information such as time, IP and error messages, retained on a minimal-necessary basis.

6. Intellectual Property
1. The interface, code, text and branding of this site belong to the maintainer and may not be copied or used commercially without permission.
2. Content you input belongs to you; you grant the site the storage and processing rights necessary to provide the service.

7. Changes & Termination
1. We may adjust features, quotas or discontinue parts of the service, and will try to give notice in advance.
2. We may immediately suspend or terminate accounts that seriously violate these terms.
3. You may stop using the service at any time; account data can be deleted through the options provided in the app.

8. Disclaimer
1. The service is provided "as is", without express or implied warranties of availability, continuity or accuracy.
2. We are not liable for losses caused by network failures, device issues, third-party outages or force majeure.
3. You are responsible for any consequences arising from your use of the service.

9. Updates
1. We may update these terms from time to time and will publish the updated version on the site.
2. Continued use after an update means you accept the revised terms; if you disagree, please stop using the service.

10. Contact
If you have questions about these terms, please reach out through the in-app feedback or the administrator email.`;

function showTerms() {
  const lang = getLang();
  openModal({
    title: t('auth.terms.title'),
    body: `<div class="terms-box">${lang === 'zh' ? TERMS_ZH : TERMS_EN}</div>
      <div class="terms-actions">
        <button class="btn m-press" id="termsClose" style="flex:1">${t('auth.terms.close')}</button>
      </div>`,
  });
  document.getElementById('termsClose').addEventListener('click', closeModal);
}

/* ---------- Passkey ---------- */
const b64uToBuf = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const bufToB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function passkeyRegister() {
  const err = document.getElementById('authErr');
  err.textContent = '';
  if (!document.getElementById('authTermsCheck').checked) {
    err.textContent = t('auth.err.terms');
    return;
  }
  if (!window.PublicKeyCredential) { err.textContent = t('auth.err.passkey'); return; }
  try {
    const identifier = document.getElementById('authEmail').value.trim();
    const begin = await (await fetch('/api/auth/webauthn/register/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })).json();
    if (begin.error) throw new Error(begin.error);

    const cred = await navigator.credentials.create({ publicKey: {
      challenge: b64uToBuf(begin.challenge),
      rp: begin.rp,
      user: { id: b64uToBuf(begin.user.id), name: begin.user.name, displayName: begin.user.displayName },
      pubKeyCredParams: begin.pubKeyCredParams,
      timeout: begin.timeout,
      attestation: begin.attestation,
      authenticatorSelection: begin.authenticatorSelection,
    } });

    const r = cred.response;
    const d = await (await fetch('/api/auth/webauthn/register/finish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cred.id,
        rawId: bufToB64u(cred.rawId),
        clientDataJSON: bufToB64u(r.clientDataJSON),
        attestationObject: bufToB64u(r.attestationObject),
        identifier,
      }),
    })).json();
    if (!d.ok) throw new Error(d.error || 'register_failed');
    localStorage.setItem('minxtok.token', d.token);
    if (d.user) adoptUser(d.user);
    enterAfterAuth(true);
  } catch (e) {
    err.textContent = e.name === 'NotAllowedError' ? t('auth.err.cancelled') : t('auth.err.passkey.reg');
  }
}

async function passkeyLogin() {
  const err = document.getElementById('authErr');
  err.textContent = '';
  if (!window.PublicKeyCredential) { err.textContent = t('auth.err.passkey'); return; }
  try {
    const begin = await (await fetch('/api/auth/webauthn/login/begin', { method: 'POST' })).json();
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: b64uToBuf(begin.challenge),
      rpId: begin.rpId,
      timeout: begin.timeout,
      userVerification: begin.userVerification,
      allowCredentials: [],
    } });
    const r = cred.response;
    const d = await (await fetch('/api/auth/webauthn/login/finish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cred.id,
        rawId: bufToB64u(cred.rawId),
        clientDataJSON: bufToB64u(r.clientDataJSON),
        authenticatorData: bufToB64u(r.authenticatorData),
        signature: bufToB64u(r.signature),
      }),
    })).json();
    if (!d.ok) throw new Error(d.error || 'login_failed');
    localStorage.setItem('minxtok.token', d.token);
    if (d.user) adoptUser(d.user);
    enterAfterAuth(false);
  } catch (e) {
    err.textContent = e.name === 'NotAllowedError' ? t('auth.err.cancelled2') : t('auth.err.passkey.login');
  }
}

document.getElementById('authForgot').addEventListener('click', () => {
  setAuthMode(authMode === 'recover' ? 'login' : 'recover');
});

document.getElementById('waBtn').addEventListener('click', () => {
  if (authMode === 'register') passkeyRegister(); else passkeyLogin();
});

const authParam = new URLSearchParams(location.search).get('mode');
setAuthMode(authParam === 'register' || location.hash === '#register' ? 'register' : 'login');
checkAuth();

setQuoteHandler((q, el) => showQuoteChip(q, el));
setDeleteHandler(async (id, el) => {
  try {
    if (id && !String(id).startsWith('local_')) {
      const r = await fetch(`/api/message/${encodeURIComponent(id)}?uid=${encodeURIComponent(state.uid)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete_failed');
    }
    // 只让这一条模糊淡出；不再重拉整段历史，避免整页清零后闪骨架
    if (!el) return;
    el.classList.add('msg-removing');
    const h = el.offsetHeight;
    if (h) {
      el.style.height = `${h}px`;
      el.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        el.style.height = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
      });
    }
    setTimeout(() => el.remove(), 300);
  } catch (_) { toast(t('toast.error')); }
});
boot();
if (localStorage.getItem('minxtok.debug') === '1') applyDebugPanel();
