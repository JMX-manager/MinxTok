// 新用户引导：一页一题、文字模糊形变、兴趣气泡物理场
// 只负责引导层本身；保存后由 app.js 继续恢复会话。
import { state } from './state.js?v=12';
import { getLang, toggleLang } from './i18n.js?v=118';
import { haptic } from './haptics.js?v=12';

const AGENT_DEFAULT = '虾虾';
const MAX_PICKS = 20;
const L = (zh, en) => (getLang() === 'en' ? en : zh);

const GROUPS = [
  { id: 'music', name: '音乐', nameEn: 'Music', mark: '♪', tags: ['流行', '摇滚', '说唱', '民谣', '电子', '古典', '爵士', 'K-pop', 'J-pop', '纯音乐'], tagsEn: ['Pop', 'Rock', 'Hip-hop', 'Folk', 'Electronic', 'Classical', 'Jazz', 'K-pop', 'J-pop', 'Instrumental'] },
  { id: 'movie', name: '电影', nameEn: 'Movies', mark: '◐', tags: ['科幻', '悬疑', '喜剧', '文艺', '动画', '恐怖', '纪录片', '爱情', '动作', '老电影'], tagsEn: ['Sci-fi', 'Mystery', 'Comedy', 'Arthouse', 'Animation', 'Horror', 'Documentary', 'Romance', 'Action', 'Classics'] },
  { id: 'game', name: '游戏', nameEn: 'Games', mark: '◇', tags: ['开放世界', '剧情向', '射击', '解谜', '模拟经营', '独立游戏', '手游', '主机', '竞技', '像素'], tagsEn: ['Open world', 'Story-rich', 'Shooter', 'Puzzle', 'Simulation', 'Indie', 'Mobile', 'Console', 'Competitive', 'Pixel'] },
  { id: 'read', name: '阅读', nameEn: 'Reading', mark: '▤', tags: ['小说', '散文', '诗歌', '历史', '心理学', '科幻文学', '漫画', '哲学', '传记', '网文'], tagsEn: ['Fiction', 'Essays', 'Poetry', 'History', 'Psychology', 'Sci-fi lit', 'Comics', 'Philosophy', 'Biography', 'Web novels'] },
  { id: 'sport', name: '运动', nameEn: 'Sports', mark: '○', tags: ['跑步', '篮球', '足球', '羽毛球', '游泳', '健身', '骑行', '滑板', '徒步', '瑜伽'], tagsEn: ['Running', 'Basketball', 'Football', 'Badminton', 'Swimming', 'Fitness', 'Cycling', 'Skateboarding', 'Hiking', 'Yoga'] },
  { id: 'food', name: '美食', nameEn: 'Food', mark: '◉', tags: ['咖啡', '火锅', '烧烤', '甜品', '日料', '家常菜', '烘焙', '茶', '小吃', '轻食'], tagsEn: ['Coffee', 'Hotpot', 'BBQ', 'Desserts', 'Japanese', 'Home cooking', 'Baking', 'Tea', 'Street food', 'Light meals'] },
  { id: 'tech', name: '科技', nameEn: 'Tech', mark: '⌘', tags: ['AI', '编程', '数码', '硬件', '摄影', '天文', '机器人', '开源', '产品', '网络安全'], tagsEn: ['AI', 'Coding', 'Gadgets', 'Hardware', 'Photography', 'Astronomy', 'Robotics', 'Open source', 'Products', 'Cybersecurity'] },
  { id: 'study', name: '学习', nameEn: 'Study', mark: '✎', tags: ['刷题', '课程', '英语', '数学', '物理', '化学', '生物', '历史', '地理', '作文'], tagsEn: ['Drills', 'Courses', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Writing'] },
  { id: 'travel', name: '旅行', nameEn: 'Travel', mark: '✈', tags: ['海边', '山野', '城市漫步', '古镇', '露营', '公路旅行', '博物馆', '出境', '民宿', '夜景'], tagsEn: ['Seaside', 'Mountains', 'City walks', 'Old towns', 'Camping', 'Road trips', 'Museums', 'Abroad', 'B&Bs', 'Night views'] },
  { id: 'anime', name: '动漫', nameEn: 'Anime', mark: '☆', tags: ['热血', '日常', '恋爱', '悬疑', '国漫', '剧场版', '声优', '手办', 'Cosplay', '经典'], tagsEn: ['Shonen', 'Slice of life', 'Romance', 'Mystery', 'Chinese animation', 'Movies', 'Voice actors', 'Figures', 'Cosplay', 'Classics'] },
  { id: 'life', name: '生活', nameEn: 'Life', mark: '☼', tags: ['养宠', '植物', '收纳', '手工', '穿搭', '香水', '冥想', '追星', '桌游', '早起'], tagsEn: ['Pets', 'Plants', 'Organizing', 'Crafts', 'Fashion', 'Fragrance', 'Meditation', 'Fandom', 'Board games', 'Early rising'] },
];

const AGE_BANDS = [
  [0, 11, '用简单、温柔、具体的话，不说教，也不催你', 'Use simple, gentle, concrete words. No lectures, no rushing.'],
  [12, 17, '像同龄人一样轻快自然，不摆大人架子', 'Talk like a peer: light, natural, no adult voice.'],
  [18, 24, '直接、轻松、有活力，少绕弯子', 'Direct, easy, energetic, and not roundabout.'],
  [25, 34, '自然、利落，不端着，也不说教', 'Natural and crisp, without posturing or lecturing.'],
  [35, 49, '稳一点，少用网络梗和夸张语气', 'Steadier, with fewer memes and less exaggeration.'],
  [50, 64, '耐心、清楚，别堆流行语', 'Patient and clear, without piling on slang.'],
  [65, 200, '慢一点、清楚一点，多留一点回应的时间', 'Slower and clearer, with more room to respond.'],
];

const EMOJI_CYCLE = [
  { src: '/assets/emoji/lobster.png', alt: '🦞' },
  { src: '/assets/emoji/hot_beverage.png', alt: '☕' },
  { src: '/assets/emoji/crescent_moon.png', alt: '🌙' },
  { src: '/assets/emoji/headphone.png', alt: '🎧' },
  { src: '/assets/emoji/open_book.png', alt: '📖' },
  { src: '/assets/emoji/herb.png', alt: '🌿' },
  { src: '/assets/emoji/sparkles.png', alt: '✨' },
];

let root = null;
let stage = null;
let progress = null;
let countEl = null;
let noteEl = null;
let nextBtn = null;
let backBtn = null;
let skipBtn = null;
let currentEl = null;
let stepIndex = 0;
let active = false;
let done = null;
let introTimer = 0;
let emojiSwapTimer = 0;
let bubbleTimer = 0;
let physics = null;
let activeCat = null;
let selected = new Set();
let draftTimer = 0;
let keyboardRaf = 0;
let baseViewportH = 0;
let lastViewportH = 0;
let finishing = false;

const profile = {
  agentName: AGENT_DEFAULT,
  userName: '',
  gender: '',
  birthday: '',
  interests: [],
};

const WHEEL_ITEM_H = 46;
const wheelState = { year: 2000, month: 1, day: 1, touched: false, ready: false, silent: false };

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function groupName(g) {
  return getLang() === 'en' ? (g.nameEn || g.name) : g.name;
}

function tagLabel(tag) {
  if (getLang() !== 'en') return tag;
  for (const g of GROUPS) {
    const i = g.tags.indexOf(tag);
    if (i >= 0) return (g.tagsEn && g.tagsEn[i]) || tag;
  }
  return tag;
}

function genderLabel(key) {
  if (key === '女生') return L('女生', 'Female');
  if (key === '男生') return L('男生', 'Male');
  if (key === '不透露') return L('不透露', 'Prefer not to say');
  return key || '';
}

function buzz(ms = 7) {
  haptic(ms);
}

function ageFromBirthday(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(text + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function ageLine(age) {
  if (age == null) return L('选好生日后，我会按年龄调整说话方式。', 'Once your birthday is set, I’ll adjust how I talk to you by age.');
  const band = AGE_BANDS.find(([lo, hi]) => age >= lo && age <= hi) || AGE_BANDS[0];
  return getLang() === 'en'
    ? `Based on your birthday, you’re ${age}. ${band[3]}.`
    : `按生日算，你 ${age} 岁。${band[2]}。`;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function saveDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(`minxtok.onboardingDraft:${state.uid}`, JSON.stringify({
        agentName: profile.agentName,
        userName: profile.userName,
        gender: profile.gender,
        birthday: profile.birthday,
        interests: [...selected],
      }));
    } catch (_) {}
  }, 120);
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(`minxtok.onboardingDraft:${state.uid}`) || 'null');
    if (!d || typeof d !== 'object') return;
    if (typeof d.agentName === 'string' && d.agentName.trim()) profile.agentName = d.agentName.trim().slice(0, 20);
    if (typeof d.userName === 'string') profile.userName = d.userName.trim().slice(0, 20);
    if (typeof d.gender === 'string') profile.gender = d.gender.slice(0, 10);
    if (typeof d.birthday === 'string') profile.birthday = d.birthday.slice(0, 10);
    if (Array.isArray(d.interests)) selected = new Set(d.interests.filter(x => typeof x === 'string').slice(0, MAX_PICKS));
  } catch (_) {}
}

function snapshot() {
  if (stepIndex === 4 && !wheelState.touched) profile.birthday = '';
  profile.interests = [...selected];
  saveDraft();
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseBirthday(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > new Date().getFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function fillWheelColumn(el, values) {
  el.innerHTML = values.map(v =>
    `<button type="button" class="ob-wheel-item" data-value="${v}">${v}</button>`
  ).join('');
  el.querySelectorAll('.ob-wheel-item').forEach((btn, idx) => {
    btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "MinxTok Sans", "Helvetica Neue", Arial, sans-serif';
    btn.addEventListener('click', () => {
      el.scrollTo({ top: idx * WHEEL_ITEM_H, behavior: 'smooth' });
    });
  });
}

function markWheelColumn(el, idx) {
  el.querySelectorAll('.ob-wheel-item').forEach((btn, i) => {
    btn.classList.toggle('on', i === idx);
  });
}

function scrollWheelTo(el, idx) {
  const max = Math.max(0, el.children.length - 1);
  const at = Math.max(0, Math.min(max, idx));
  el.scrollTop = at * WHEEL_ITEM_H;
  markWheelColumn(el, at);
}

function rebuildWheelDays(dayEl) {
  const max = daysInMonth(wheelState.year, wheelState.month);
  if (wheelState.day > max) wheelState.day = max;
  fillWheelColumn(dayEl, Array.from({ length: max }, (_, i) => i + 1));
  requestAnimationFrame(() => scrollWheelTo(dayEl, wheelState.day - 1));
}

function setupBirthdayWheel() {
  const yearEl = document.getElementById('obWheelYear');
  const monthEl = document.getElementById('obWheelMonth');
  const dayEl = document.getElementById('obWheelDay');
  const ageEl = document.getElementById('obAge');
  if (!yearEl || !monthEl || !dayEl) return;

  const parsed = parseBirthday(profile.birthday);
  const maxYear = new Date().getFullYear();
  wheelState.touched = !!parsed;
  wheelState.ready = false;
  wheelState.silent = true;
  wheelState.year = parsed ? parsed.year : 2000;
  wheelState.month = parsed ? parsed.month : 1;
  wheelState.day = parsed ? parsed.day : 1;

  const years = [];
  for (let y = 1900; y <= maxYear; y += 1) years.push(y);
  fillWheelColumn(yearEl, years);
  fillWheelColumn(monthEl, Array.from({ length: 12 }, (_, i) => i + 1));
  fillWheelColumn(dayEl, Array.from({ length: daysInMonth(wheelState.year, wheelState.month) }, (_, i) => i + 1));
  // 初始日数按当前年月修正，避免 2 月 30 日这类脏数据
  {
    const max = daysInMonth(wheelState.year, wheelState.month);
    if (wheelState.day > max) wheelState.day = max;
  }

  if (ageEl) {
    ageEl.textContent = parsed
      ? ageLine(ageFromBirthday(profile.birthday))
      : '上下滑动选择，或点「不想说」。';
  }

  requestAnimationFrame(() => {
    scrollWheelTo(yearEl, years.indexOf(wheelState.year));
    scrollWheelTo(monthEl, wheelState.month - 1);
    scrollWheelTo(dayEl, wheelState.day - 1);
    wheelState.ready = true;
    setTimeout(() => { wheelState.silent = false; }, 320);
  });

  let timer = 0;
  const onScroll = (kind) => {
    const el = kind === 'year' ? yearEl : kind === 'month' ? monthEl : dayEl;
    const idx = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
    markWheelColumn(el, idx);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!wheelState.ready || wheelState.silent) return;
      const val = Number(el.children[idx] && el.children[idx].dataset.value);
      if (!val) return;
      if (kind === 'year') wheelState.year = val;
      if (kind === 'month') wheelState.month = val;
      if (kind === 'day') wheelState.day = val;
      if (kind === 'year' || kind === 'month') {
        const max = daysInMonth(wheelState.year, wheelState.month);
        if (wheelState.day > max) {
          wheelState.day = max;
          rebuildWheelDays(dayEl);
        }
      }
      wheelState.touched = true;
      const p = (n) => String(n).padStart(2, '0');
      profile.birthday = `${wheelState.year}-${p(wheelState.month)}-${p(wheelState.day)}`;
      if (ageEl) ageEl.textContent = ageLine(ageFromBirthday(profile.birthday));
      saveDraft();
    }, 80);
  };

  yearEl.addEventListener('scroll', () => onScroll('year'), { passive: true });
  monthEl.addEventListener('scroll', () => onScroll('month'), { passive: true });
  dayEl.addEventListener('scroll', () => onScroll('day'), { passive: true });
}

/* ---------------- 页面骨架 ---------------- */

function introHtml() {
  return `
    <div class="ob-intro">
      <div class="ob-orb" aria-hidden="true">
        <div class="ob-orb-glow"></div>
        <div class="ob-orb-ring ob-ring-a"></div>
        <div class="ob-emoji-stack" id="obEmojiStack" aria-hidden="true">
          <img class="ob-emoji" src="${EMOJI_CYCLE[0].src}" alt="" draggable="false">
          <img class="ob-emoji" alt="" draggable="false">
        </div>
      </div>
      <div class="ob-kicker">A QUIET PLACE FOR YOU</div>
      <h1 class="ob-h1">MinxTok<em>明叙</em></h1>
      <p class="ob-lede">${L('一个只属于你的空间。', 'A quiet space<br>that belongs to you.')}<br>${L('聊天、日记、音乐、刷题与课程，都在这里。', 'Chat, journal, music, drills, and courses —<br>all here.')}</p>
      <div class="ob-caps" aria-label="MinxTok">
        <span class="ob-cap"><b>◌</b>${L('对话', 'Chat')}</span>
        <span class="ob-cap"><b>▤</b>${L('日记', 'Journal')}</span>
        <span class="ob-cap"><b>♪</b>${L('音乐', 'Music')}</span>
        <span class="ob-cap"><b>✎</b>${L('刷题', 'Drills')}</span>
        <span class="ob-cap"><b>▥</b>${L('课程', 'Courses')}</span>
        <span class="ob-cap"><b>☼</b>${L('天气', 'Weather')}</span>
      </div>
      <p class="ob-privacy">${L('几个小问题，只用来调整聊天方式，不用于其他目的。', 'A few quick questions, only to tune how we talk. Not used for anything else.')}</p>
    </div>`;
}

function textStepHtml(index, title, sub, inputId, value, placeholder, under, opts = {}) {
  return `
    <div class="ob-q">
      <h2 class="ob-h2">${title}</h2>
      <p class="ob-sub">${sub}</p>
      <input id="${inputId}" class="ob-input" type="text" maxlength="${opts.max || 20}"
        autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"
        placeholder="${esc(placeholder)}" value="${esc(value || '')}">
      ${under ? `<div class="ob-under">${under}</div>` : ''}
    </div>`;
}

function genderHtml(index) {
  const opts = [
    ['女生', L('女生', 'Female'), L('她', 'she')],
    ['男生', L('男生', 'Male'), L('他', 'he')],
    ['不透露', L('不透露', 'Prefer not to say'), L('你', 'you')],
  ];
  return `
    <div class="ob-q">
      <h2 class="ob-h2">${L('你的性别', 'Your gender')}</h2>
      <p class="ob-sub">${L('只影响称呼和语气，不会公开展示。', 'Only affects pronouns and tone. Never shown publicly.')}</p>
      <div class="ob-choices" id="obGender">
        ${opts.map(([name, label, pronoun]) => `
          <button type="button" class="ob-choice ${profile.gender === name ? 'on' : ''}" data-gender="${name}">
            <span>${label}</span><small>${pronoun}</small>
          </button>`).join('')}
      </div>
    </div>`;
}

function birthdayHtml(index) {
  return `
    <div class="ob-q ob-q-birthday">
      <h2 class="ob-h2">${L('你的生日', 'Your birthday')}</h2>
      <p class="ob-sub">${L('上下滑动，选到你的生日。', 'Scroll to your birthday.')}</p>
      <div class="ob-wheel-units" aria-hidden="true"><span>${L('年', 'Y')}</span><span>${L('月', 'M')}</span><span>${L('日', 'D')}</span></div>
      <div class="ob-wheel" id="obWheel" role="group" aria-label="${L('选择生日', 'Choose birthday')}">
        <div class="ob-wheel-frame" aria-hidden="true"></div>
        <div class="ob-wheel-col" id="obWheelYear"></div>
        <div class="ob-wheel-col" id="obWheelMonth"></div>
        <div class="ob-wheel-col" id="obWheelDay"></div>
      </div>
      <div class="ob-age" id="obAge">${esc(ageLine(ageFromBirthday(profile.birthday)))}</div>
      <button type="button" class="ob-quiet" id="obNoBirthday">${L('不想说', 'Rather not say')}</button>
    </div>`;
}

function interestsHtml(index) {
  return `
    <div class="ob-q ob-q-interests">
      <div class="ob-bubble-top">
        <button type="button" class="ob-bubble-back" id="obBubbleBack" aria-label="${L('上一步', 'Back')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"></path></svg>
        </button>
        <div class="ob-bubble-heading">
          <button type="button" class="ob-bubble-all" id="obBubbleAll" hidden>‹ ${L('全部', 'All')}</button>
          <span class="ob-bubble-title" id="obBubbleTitle">${L('选一个方向', 'Pick a direction')}</span>
        </div>
        <div class="ob-count" id="obBubbleCount">${L('已选', 'Picked')} ${selected.size}</div>
        <button type="button" class="ob-lang ob-lang-bubble" id="obLangBubble">${getLang() === 'en' ? '中文' : 'En'}</button>
        <button type="button" class="ob-skip ob-skip-bubble" id="obSkipBubble">${L('跳过', 'Skip')}</button>
      </div>
      <div class="ob-bubble-stage" id="obBubbleStage">
        <div class="ob-bubble-field" id="obBubbleField"></div>
        <div class="ob-bubble-hint" id="obBubbleHint">${L('点大泡泡，进入一个方向', 'Tap a big bubble to open a direction')}</div>
      </div>
      <div class="ob-bubble-bottom">
        <div class="ob-picked" id="obPicked"></div>
        <button type="button" class="ob-bubble-next" id="obBubbleNext">${L('继续', 'Continue')}</button>
      </div>
    </div>`;
}

function welcomeHtml() {
  return `
    <div class="ob-welcome">
      <div class="ob-welcome-mark" aria-hidden="true">✦</div>
      <div class="ob-kicker">WELCOME TO MINXTOK</div>
      <h1 class="ob-h1 ob-h1-welcome">${L('你好', 'Hello')}<span class="ob-comma">${L('，', ',')}</span><span id="obWelcomeName">${L('朋友', 'friend')}</span></h1>
      <p class="ob-lede">${L('我是', 'I’m')} <b id="obWelcomeAgent">${esc(profile.agentName || AGENT_DEFAULT)}</b>${L('。以后你可以在这里聊天、写日记、放歌、刷题，也可以什么都不做。', '. You can chat, journal, play music, or drill questions here — or do nothing at all.')}</p>
      <div class="ob-summary" id="obSummary"></div>
    </div>`;
}

function stepHtml(i) {
  if (i === 0) return introHtml();
  if (i === 1) return textStepHtml('', L('助理叫什么', 'What should I be called?'), L('它会用这个名字回应你。', 'This is the name I’ll answer to.'), 'obAgentName', profile.agentName, L('虾虾', 'Xiaxia'));
  if (i === 2) return textStepHtml('', L('怎么称呼你', 'What should I call you?'), L('不用真名，顺口就好。', 'No need for a real name — anything that feels right.'), 'obUserName', profile.userName, L('你的名字或昵称', 'Your name or nickname'));
  if (i === 3) return genderHtml('');
  if (i === 4) return birthdayHtml('');
  if (i === 5) return interestsHtml('');
  return welcomeHtml();
}

/* ---------------- 步骤切换 ---------------- */

function stopExtras() {
  if (introTimer) { clearInterval(introTimer); introTimer = 0; }
  if (emojiSwapTimer) { clearTimeout(emojiSwapTimer); emojiSwapTimer = 0; }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = 0; }
  destroyPhysics();
}

function renderStep(next = 1) {
  stopExtras();
  const old = currentEl;
  if (old) {
    // 旧页先摘掉 id，避免新页同 id 时 getElementById 抓到正在退场的旧节点
    old.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    old.classList.remove('in');
    old.classList.add('leaving');
    setTimeout(() => { try { old.remove(); } catch (_) {} }, 650);
  }

  const el = document.createElement('section');
  el.className = 'ob-step';
  el.dataset.step = String(stepIndex);
  el.innerHTML = stepHtml(stepIndex);
  stage.appendChild(el);
  currentEl = el;
  if (root) root.classList.toggle('is-bubbles', stepIndex === 5);

  const total = 7;
  progress.style.width = `${((stepIndex + 1) / total) * 100}%`;
  if (countEl) countEl.textContent = `${String(stepIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  backBtn.classList.toggle('hide', stepIndex === 0);
  nextBtn.textContent = stepIndex === 0 ? L('开始', 'Start') : stepIndex === 6 ? L('进入 MinxTok', 'Enter MinxTok') : L('继续', 'Continue');
  noteEl.textContent = '';

  bindStep();
  updateNext();
  requestAnimationFrame(() => {
    el.classList.add('in');
    stage.classList.remove('morph');
    void stage.offsetWidth;
    stage.classList.add('morph');
  });

  if (stepIndex === 0) startIntroEmoji();
  if (stepIndex === 5) {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubbleTimer = 0; initBubbles(); }, 120);
  }
  if (stepIndex === 6) updateWelcome();
}

function bindStep() {
  if (stepIndex === 1) {
    const input = document.getElementById('obAgentName');
    if (input) {
      input.addEventListener('input', () => {
        profile.agentName = input.value.trim().slice(0, 20);
        updateNext();
        saveDraft();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goNext(); });
    }
  }
  if (stepIndex === 2) {
    const input = document.getElementById('obUserName');
    if (input) {
      input.addEventListener('input', () => {
        profile.userName = input.value.trim().slice(0, 20);
        updateNext();
        saveDraft();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goNext(); });
    }
  }
  if (stepIndex === 3) {
    document.querySelectorAll('#obGender [data-gender]').forEach(btn => {
      btn.addEventListener('click', () => {
        profile.gender = btn.dataset.gender;
        document.querySelectorAll('#obGender [data-gender]').forEach(x => x.classList.toggle('on', x === btn));
        buzz(6);
        saveDraft();
      });
    });
  }
  if (stepIndex === 4) {
    const age = document.getElementById('obAge');
    setupBirthdayWheel();
    const skip = document.getElementById('obNoBirthday');
    if (skip) skip.addEventListener('click', () => {
      profile.birthday = '';
      wheelState.touched = false;
      if (age) age.textContent = '没关系，我会按普通方式跟你说话。';
      saveDraft();
      buzz(5);
    });
  }
  if (stepIndex === 5) {
    const bubbleBack = document.getElementById('obBubbleBack');
    const bubbleNext = document.getElementById('obBubbleNext');
    const bubbleSkip = document.getElementById('obSkipBubble');
    const bubbleAll = document.getElementById('obBubbleAll');
    const bubbleLang = document.getElementById('obLangBubble');
    if (bubbleBack) bubbleBack.addEventListener('click', goBack);
    if (bubbleNext) bubbleNext.addEventListener('click', goNext);
    if (bubbleSkip) bubbleSkip.addEventListener('click', () => finish(true));
    if (bubbleLang) bubbleLang.addEventListener('click', switchOnboardingLang);
    if (bubbleAll) bubbleAll.addEventListener('click', () => {
      if (!activeCat) return;
      activeCat = null;
      updateBubbleMode();
      if (physics) physics.showGroups();
      buzz(5);
    });
    renderPicked();
  }
  if (stepIndex === 6) updateWelcome();
}

function updateNext() {
  if (!nextBtn) return;
  if (stepIndex === 1) {
    nextBtn.disabled = !profile.agentName.trim();
    nextBtn.textContent = L('继续', 'Continue');
  } else if (stepIndex === 6) {
    nextBtn.disabled = false;
    nextBtn.textContent = L('进入 MinxTok', 'Enter MinxTok');
  } else {
    nextBtn.disabled = false;
    nextBtn.textContent = stepIndex === 0 ? L('开始', 'Start') : L('继续', 'Continue');
  }
}

function goNext() {
  if (nextBtn && nextBtn.disabled) return;
  if (stepIndex === 0) {
    stepIndex = 1;
    renderStep(1);
    return;
  }
  if (stepIndex === 1 && !profile.agentName.trim()) return;
  if (stepIndex < 6) {
    snapshot();
    stepIndex += 1;
    renderStep(1);
    return;
  }
  finish();
}

function goBack() {
  if (stepIndex <= 0) return;
  snapshot();
  stepIndex -= 1;
  renderStep(-1);
}

function startIntroEmoji() {
  const stack = document.getElementById('obEmojiStack');
  if (!stack) return;
  const imgs = [...stack.querySelectorAll('.ob-emoji')];
  if (imgs.length < 2) return;
  const order = [...EMOJI_CYCLE].sort(() => Math.random() - 0.5);
  let i = 0;
  let slot = 0;
  order.forEach(item => {
    const img = new Image();
    img.src = item.src;
  });

  imgs[0].src = order[0].src;
  imgs[0].alt = '';
  imgs[0].classList.add('active');
  imgs[1].classList.remove('active');
  stack.style.setProperty('--emoji-tilt', '-2deg');
  stack.style.setProperty('--emoji-scale', '1');

  const schedule = () => {
    introTimer = setTimeout(advance, 1750 + Math.random() * 650);
  };

  const advance = async () => {
    if (!document.body.contains(stack)) { clearTimeout(introTimer); introTimer = 0; return; }
    const next = order[(i + 1) % order.length];
    const incoming = imgs[1 - slot];
    const outgoing = imgs[slot];
    incoming.classList.remove('active');
    incoming.src = next.src;
    incoming.alt = '';
    try {
      if (incoming.decode) await incoming.decode();
    } catch (_) {}
    if (!document.body.contains(stack)) return;
    stack.style.setProperty('--emoji-tilt', `${(Math.random() * 8 - 4).toFixed(1)}deg`);
    stack.style.setProperty('--emoji-scale', (0.97 + Math.random() * 0.07).toFixed(3));
    requestAnimationFrame(() => {
      incoming.classList.add('active');
      outgoing.classList.remove('active');
      slot = 1 - slot;
      i = (i + 1) % order.length;
      schedule();
    });
  };

  schedule();
}

/* ---------------- 兴趣气泡 ---------------- */

function renderPicked() {
  const box = document.getElementById('obPicked');
  if (!box) return;
  if (!selected.size) {
    box.innerHTML = `<span class="ob-picked-empty">${L('选几个你常聊的，之后还可以改', 'Pick a few things you talk about. You can change them later.')}</span>`;
    return;
  }
  box.innerHTML = [...selected].map(tag => `
    <button type="button" class="ob-picked-chip" data-remove="${esc(tag)}">
      <span>${esc(tagLabel(tag))}</span><i>×</i>
    </button>`).join('');
  box.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      selected.delete(btn.dataset.remove);
      renderPicked();
      if (physics) physics.refreshSelected();
      saveDraft();
      buzz(4);
    });
  });
}

function updateCount() {
  const el = document.getElementById('obBubbleCount');
  if (el) el.textContent = `${L('已选', 'Picked')} ${selected.size}/${MAX_PICKS}`;
}

function applyOnboardingLang() {
  const langText = getLang() === 'en' ? '中文' : 'En';
  document.querySelectorAll('#obLang, #obLangBubble').forEach(b => { b.textContent = langText; });
  const skip = document.getElementById('obSkip');
  if (skip) skip.textContent = L('跳过', 'Skip');
  const skipBubble = document.getElementById('obSkipBubble');
  if (skipBubble) skipBubble.textContent = L('跳过', 'Skip');
  const all = document.getElementById('obBubbleAll');
  if (all) all.textContent = `‹ ${L('全部', 'All')}`;
  const bubbleNext = document.getElementById('obBubbleNext');
  if (bubbleNext) bubbleNext.textContent = L('继续', 'Continue');
  const back = document.getElementById('obBack');
  if (back) back.setAttribute('aria-label', L('上一步', 'Back'));
}

function switchOnboardingLang() {
  snapshot();
  toggleLang();
  applyOnboardingLang();
  renderStep(1);
}

function updateBubbleMode() {
  const title = document.getElementById('obBubbleTitle');
  const all = document.getElementById('obBubbleAll');
  const hint = document.getElementById('obBubbleHint');
  const group = activeCat ? GROUPS.find(g => g.id === activeCat) : null;
  if (title) title.textContent = group ? groupName(group) : L('选一个方向', 'Pick a direction');
  if (all) all.hidden = !group;
  if (hint) hint.textContent = group
    ? L('点小泡泡，选你常聊的', 'Tap a small bubble to pick what you talk about')
    : L('点大泡泡，进入一个方向', 'Tap a big bubble to open a direction');
}

function toggleTag(tag) {
  if (selected.has(tag)) {
    selected.delete(tag);
    profile.interests = [...selected];
    renderPicked();
    updateCount();
    if (physics) physics.refreshSelected();
    saveDraft();
    buzz(3);
    return 'remove';
  } else if (selected.size >= MAX_PICKS) {
    const hint = document.getElementById('obBubbleHint');
    if (hint) {
      hint.textContent = L(`最多选 ${MAX_PICKS} 个，先去掉一个吧`, `Up to ${MAX_PICKS}. Remove one first.`);
      hint.classList.add('warn');
      setTimeout(() => hint.classList.remove('warn'), 1200);
    }
    return false;
  } else {
    selected.add(tag);
  }
  profile.interests = [...selected];
  renderPicked();
  updateCount();
  if (physics) physics.refreshSelected();
  saveDraft();
  buzz(5);
  return 'add';
}

function initBubbles() {
  destroyPhysics();
  const field = document.getElementById('obBubbleField');
  if (!field) return;
  activeCat = null;
  physics = createPhysics(field, 'groups');
  physics.mount();
  updateBubbleMode();
  updateCount();
}

function createPhysics(field, initialMode = 'groups') {
  const bubbles = [];
  let raf = 0;
  let alive = true;
  let w = 0;
  let h = 0;
  let tiltX = 0;
  let tiltY = 0;
  let dragging = null;
  let pointer = null;
  let mode = initialMode;
  let group = null;
  let items = [];
  let switching = false;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function measure() {
    const r = field.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
  }

  function itemsFor(nextMode, nextGroup) {
    if (nextMode === 'groups') {
      return GROUPS.map(g => ({ key: g.id, label: g.name, mark: g.mark, type: 'group', group: g }));
    }
    return (nextGroup ? nextGroup.tags : GROUPS[0].tags).map(tag => ({ key: tag, label: tag, type: 'tag', group: nextGroup }));
  }

  function radiusFor(count) {
    const fit = Math.sqrt((w * h) / Math.max(1, count * 4.6));
    const base = mode === 'groups' ? clamp(fit, 40, 48) : clamp(fit, 32, 44);
    return Math.round(base);
  }

  function layout(count) {
    let r = radiusFor(count);
    // 随机撒点后做几轮排斥，避免整齐网格感，同时尽量不重叠。
    const margin = r + 7;
    const positions = Array.from({ length: count }, () => ({
      x: margin + Math.random() * Math.max(1, w - margin * 2),
      y: margin + Math.random() * Math.max(1, h - margin * 2),
    }));
    const minDist = r * 2 + 5;
    for (let pass = 0; pass < 90; pass++) {
      let moved = false;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            if (dist < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = Math.hypot(dx, dy); }
            const push = (minDist - dist) * 0.52;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            moved = true;
          }
        }
      }
      positions.forEach(p => {
        p.x = clamp(p.x, margin, Math.max(margin, w - margin));
        p.y = clamp(p.y, margin, Math.max(margin, h - margin));
      });
      if (!moved) break;
    }
    return { r, positions };
  }

  function spawn() {
    measure();
    field.innerHTML = '';
    bubbles.length = 0;
    items = itemsFor(mode, group);
    if (!items.length) return;
    const { r, positions } = layout(items.length);

    items.forEach((item, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `ob-bubble is-${item.type}`;
      if (item.type === 'tag' && item.label.length >= 4) el.classList.add('is-long');
      el.dataset.key = item.key;
      el.innerHTML = item.type === 'group'
        ? `<span class="ob-bubble-in"><span class="ob-bubble-mark">${esc(item.mark)}</span><span class="ob-bubble-label">${esc(item.label)}</span></span>`
        : `<span class="ob-bubble-in">${esc(item.label)}</span>`;
      const d = r * 2;
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      if (item.type === 'tag' && selected.has(item.key)) el.classList.add('on');
      field.appendChild(el);

      const pos = positions[i];
      const b = {
        el, item, key: item.key, type: item.type, r,
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        rot: (Math.random() - 0.5) * 7,
        drag: false, bursting: false, moved: false, pointerId: null,
        suppressClickUntil: 0, ox: 0, oy: 0,
      };
      el.style.transform = `translate3d(${b.x - r}px, ${b.y - r}px, 0) rotate(${b.rot}deg)`;
      el.style.opacity = '0';
      el.style.transition = `opacity 260ms ease ${i * 16}ms`;
      const inner = el.querySelector('.ob-bubble-in');
      if (inner) inner.style.animationDelay = `${i * 18}ms`;
      requestAnimationFrame(() => { if (alive) el.style.opacity = '1'; });
      bubbles.push(b);

      el.addEventListener('click', (e) => {
        if (b.moved || b.bursting || performance.now() < b.suppressClickUntil) return;
        e.preventDefault();
        e.stopPropagation();
        if (b.type === 'group') {
          enterGroup(b);
          return;
        }
        const result = toggleTag(b.key);
        if (result === 'add') burstBubble(b);
        else if (result === false) {
          b.el.classList.add('nope');
          setTimeout(() => b.el.classList.remove('nope'), 320);
        }
      });
      el.addEventListener('pointerdown', (e) => {
        b.drag = true;
        b.moved = false;
        b.pointerId = e.pointerId;
        b.suppressClickUntil = 0;
        b.ox = e.clientX;
        b.oy = e.clientY;
        dragging = b;
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
      });
      el.addEventListener('pointermove', (e) => {
        if (!b.drag || e.pointerId !== b.pointerId) return;
        const dx = e.clientX - b.ox;
        const dy = e.clientY - b.oy;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          b.moved = true;
          b.suppressClickUntil = performance.now() + 700;
        }
        b.ox = e.clientX;
        b.oy = e.clientY;
        b.x = clamp(b.x + dx, b.r, w - b.r);
        b.y = clamp(b.y + dy, b.r, h - b.r);
        b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0) rotate(${b.rot}deg)`;
        b.vx = 0;
        b.vy = 0;
      });
      const endDrag = (e) => {
        if (!b.drag) return;
        if (e && e.pointerId != null && b.pointerId != null && e.pointerId !== b.pointerId) return;
        b.drag = false;
        dragging = null;
        b.pointerId = null;
        el.classList.remove('dragging');
        if (b.moved) b.suppressClickUntil = performance.now() + 500;
        setTimeout(() => { b.moved = false; }, 520);
      };
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      el.addEventListener('lostpointercapture', endDrag);
    });
  }

  function enterGroup(b) {
    if (switching || !b || b.type !== 'group') return;
    switching = true;
    activeCat = b.key;
    group = b.item.group;
    updateBubbleMode();
    updateCount();
    b.bursting = true;
    b.el.classList.add('burst');
    b.el.style.pointerEvents = 'none';
    bubbles.forEach(x => {
      if (x === b) return;
      x.el.classList.add('pop');
      x.el.style.pointerEvents = 'none';
    });
    setTimeout(() => {
      if (!alive) return;
      mode = 'tags';
      switching = false;
      spawn();
    }, 360);
  }

  function showGroups() {
    if (switching || mode === 'groups') return;
    switching = true;
    bubbles.forEach(b => {
      b.el.classList.add('pop');
      b.el.style.pointerEvents = 'none';
    });
    setTimeout(() => {
      if (!alive) return;
      mode = 'groups';
      group = null;
      switching = false;
      spawn();
    }, 280);
  }

  function burstBubble(b) {
    if (b.bursting) return;
    b.bursting = true;
    b.el.classList.add('burst');
    b.el.style.pointerEvents = 'none';
    setTimeout(() => {
      if (!alive) return;
      const idx = bubbles.indexOf(b);
      if (idx >= 0) bubbles.splice(idx, 1);
      b.el.remove();
    }, 460);
  }

  function tick() {
    if (!alive) return;
    measure();
    const gx = tiltX * 0.055;
    const gy = tiltY * 0.055;
    const gravity = 0.028;
    for (const b of bubbles) {
      if (b.drag || b.bursting) continue;
      b.vx = (b.vx + gx) * 0.992;
      b.vy = clamp((b.vy + gy + gravity) * 0.992, -3.2, 3.6);
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.55; }
      if (b.x > w - b.r) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.55; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.55; }
      if (b.y > h - b.r) { b.y = h - b.r; b.vy = -Math.abs(b.vy) * 0.55; }
      b.rot = clamp(b.rot + b.vx * 0.22, -9, 9);
      b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0) rotate(${b.rot}deg)`;
    }
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], b = bubbles[j];
        if (a.bursting || b.bursting) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r + 5;
        if (dist >= min) continue;
        const nx = dx / dist, ny = dy / dist;
        const push = (min - dist) * 0.5;
        if (!a.drag) { a.x -= nx * push; a.y -= ny * push; a.vx -= nx * 0.06; a.vy -= ny * 0.06; }
        if (!b.drag) { b.x += nx * push; b.y += ny * push; b.vx += nx * 0.06; b.vy += ny * 0.06; }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function onOrient(e) {
    const gamma = clamp(Number(e.gamma) || 0, -45, 45) / 45;
    const beta = clamp((Number(e.beta) || 0) - 35, -45, 45) / 45;
    tiltX = gamma;
    tiltY = beta;
  }

  function onPointer(e) {
    if (dragging) return;
    const r = field.getBoundingClientRect();
    tiltX = clamp((e.clientX - r.left) / Math.max(1, r.width) - 0.5, -0.5, 0.5) * 0.65;
    tiltY = clamp((e.clientY - r.top) / Math.max(1, r.height) - 0.5, -0.5, 0.5) * 0.65;
  }

  return {
    mount() {
      mode = 'groups';
      group = null;
      switchToGroupsNow();
      raf = requestAnimationFrame(tick);
      window.addEventListener('deviceorientation', onOrient, true);
      field.addEventListener('pointermove', onPointer);
    },
    showGroups,
    refreshSelected() {
      bubbles.forEach(b => {
        if (b.type === 'tag') b.el.classList.toggle('on', selected.has(b.key));
      });
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOrient, true);
      field.removeEventListener('pointermove', onPointer);
      field.innerHTML = '';
    },
  };

  function switchToGroupsNow() {
    items = itemsFor('groups', null);
    spawn();
  }
}

function destroyPhysics() {
  if (physics) {
    try { physics.destroy(); } catch (_) {}
    physics = null;
  }
}

async function enableTilt(btn) {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') {
        btn.textContent = '没有拿到感应权限';
        return;
      }
    }
    btn.textContent = '倾斜感应已开启';
    btn.classList.add('done');
    setTimeout(() => btn.classList.add('hide'), 900);
    buzz(8);
  } catch (_) {
    btn.textContent = '这台设备不支持倾斜';
  }
}

/* ---------------- 欢迎页 ---------------- */

function updateWelcome() {
  const nameEl = document.getElementById('obWelcomeName');
  const agentEl = document.getElementById('obWelcomeAgent');
  const summary = document.getElementById('obSummary');
  if (nameEl) nameEl.textContent = profile.userName || L('朋友', 'friend');
  if (agentEl) agentEl.textContent = profile.agentName || AGENT_DEFAULT;
  if (!summary) return;
  const age = ageFromBirthday(profile.birthday);
  const tags = [...selected];
  const rows = [];
  if (age != null) rows.push(`<span class="ob-summary-key">${L('年龄', 'Age')}</span><span>${L(`${age} 岁`, `${age}`)}</span>`);
  if (profile.gender) rows.push(`<span class="ob-summary-key">${L('称呼', 'Call you')}</span><span>${esc(profile.gender === '不透露' ? L('直接叫你「你」', 'just “you”') : genderLabel(profile.gender))}</span>`);
  rows.push(`<span class="ob-summary-key">${L('兴趣', 'Interests')}</span><span>${tags.length ? tags.map(t => esc(tagLabel(t))).join(L('、', ', ')) : L('还没选，之后可以补', 'nothing yet — you can add later')}</span>`);
  summary.innerHTML = `<div class="ob-summary-title">✦ ${L('我记住的', 'What I remember')}</div>${rows.map(r => `<div class="ob-summary-row">${r}</div>`).join('')}`;
}

/* ---------------- 保存与启动 ---------------- */

async function finish(skipped = false) {
  if (!nextBtn || finishing) return;
  finishing = true;
  nextBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;
  nextBtn.textContent = skipped ? L('正在进入…', 'Entering…') : L('正在保存…', 'Saving…');
  const payload = {
    uid: state.uid,
    name: profile.agentName.trim() || AGENT_DEFAULT,
    userName: profile.userName.trim(),
    userGender: profile.gender,
    userBirthday: profile.birthday,
    userInterests: [...selected],
    onboarded: true,
  };
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || 'save_failed');
    try {
      localStorage.setItem('minxtok.onboardingDone', '1');
      localStorage.removeItem(`minxtok.onboardingPending:${state.uid}`);
      localStorage.removeItem(`minxtok.onboardingDraft:${state.uid}`);
    } catch (_) {}
    document.documentElement.dataset.assistantName = payload.name;
    stopExtras();
    teardownViewport();
    root.classList.remove('show');
    active = false;
    document.body.classList.remove('ob-open');
    setTimeout(() => {
      root.hidden = true;
      if (typeof done === 'function') done();
      done = null;
    }, 520);
  } catch (e) {
    finishing = false;
    nextBtn.disabled = false;
    nextBtn.textContent = L('再试一次', 'Try again');
    if (skipBtn) skipBtn.disabled = false;
    noteEl.textContent = L('没有保存上，检查一下网络，再试一次。', 'Couldn’t save. Check your connection and try again.');
  }
}

function syncViewport() {
  keyboardRaf = 0;
  if (!active || !root) return;
  const vv = window.visualViewport;
  const h = (vv && vv.height) || window.innerHeight;
  if (!h || h < 120) return;
  const nextH = Math.round(h);
  const focused = document.activeElement && document.activeElement.closest &&
    document.activeElement.closest('#onboarding');
  const keyboard = !!focused && h < Math.max(240, baseViewportH * 0.78);
  root.classList.toggle('ob-keyboard', keyboard);
  if (Math.abs(nextH - lastViewportH) < 2) return;
  lastViewportH = nextH;
  root.style.setProperty('--ob-vh', `${nextH}px`);
}

function scheduleViewport() {
  if (keyboardRaf) return;
  keyboardRaf = requestAnimationFrame(syncViewport);
}

function setupViewport() {
  teardownViewport();
  baseViewportH = Math.max(
    window.innerHeight || 0,
    (window.visualViewport && window.visualViewport.height) || 0
  );
  if (root) root.style.setProperty('--ob-vh', `${baseViewportH}px`);
  window.addEventListener('resize', scheduleViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleViewport, { passive: true });
  }
  if (root) {
    root.addEventListener('focusin', scheduleViewport);
    root.addEventListener('focusout', scheduleViewport);
  }
  lastViewportH = 0;
  syncViewport();
}

function teardownViewport() {
  window.removeEventListener('resize', scheduleViewport);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', scheduleViewport);
  }
  if (root) {
    root.removeEventListener('focusin', scheduleViewport);
    root.removeEventListener('focusout', scheduleViewport);
    root.classList.remove('ob-keyboard');
    root.style.removeProperty('--ob-vh');
  }
  if (keyboardRaf) { cancelAnimationFrame(keyboardRaf); keyboardRaf = 0; }
  lastViewportH = 0;
}

export function startOnboarding(opts = {}) {
  if (active) return false;
  root = document.getElementById('onboarding');
  stage = document.getElementById('obStage');
  progress = document.getElementById('obProgress');
  countEl = document.getElementById('obCount');
  noteEl = document.getElementById('obNote');
  nextBtn = document.getElementById('obNext');
  backBtn = document.getElementById('obBack');
  skipBtn = document.getElementById('obSkip');
  if (!root || !stage || !nextBtn) return false;

  active = true;
  finishing = false;
  if (skipBtn) skipBtn.disabled = false;
  done = opts.onDone || null;
  stepIndex = 0;
  selected = new Set();
  profile.agentName = AGENT_DEFAULT;
  profile.userName = '';
  profile.gender = '';
  profile.birthday = '';
  profile.interests = [];

  if (opts.data) {
    const d = opts.data;
    if (typeof d.name === 'string' && d.name.trim()) profile.agentName = d.name.trim().slice(0, 20);
    if (typeof d.userName === 'string') profile.userName = d.userName.trim().slice(0, 20);
    if (typeof d.userGender === 'string') profile.gender = d.userGender.slice(0, 10);
    if (typeof d.userBirthday === 'string') profile.birthday = d.userBirthday.slice(0, 10);
    if (Array.isArray(d.userInterests)) {
      selected = new Set(d.userInterests.filter(x => typeof x === 'string').slice(0, MAX_PICKS));
    }
  } else {
    loadDraft();
  }

  if (!nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', goNext);
    backBtn.addEventListener('click', goBack);
  }
  if (skipBtn && !skipBtn.dataset.bound) {
    skipBtn.dataset.bound = '1';
    skipBtn.addEventListener('click', () => finish(true));
  }
  const langBtn = document.getElementById('obLang');
  if (langBtn && !langBtn.dataset.bound) {
    langBtn.dataset.bound = '1';
    langBtn.addEventListener('click', switchOnboardingLang);
  }
  applyOnboardingLang();

  root.hidden = false;
  document.body.classList.add('ob-open');
  setupViewport();
  requestAnimationFrame(() => root.classList.add('show'));
  renderStep(1);
  return true;
}

export async function openOnboardingFromSettings(opts = {}) {
  if (active) return false;
  let data = null;
  try {
    const r = await fetch(`/api/assistant?uid=${encodeURIComponent(state.uid)}`);
    if (r.ok) {
      const d = await r.json();
      data = d && d.settings ? d.settings : null;
    }
  } catch (_) {}
  startOnboarding(Object.assign({}, opts, { data: data }));
  return true;
}

export async function maybeStartOnboarding(opts = {}, force = false) {
  if (active) return false;
  let pending = force;
  try { pending = pending || localStorage.getItem(`minxtok.onboardingPending:${state.uid}`) === '1'; } catch (_) {}
  if (!pending && state.uid) {
    // 换设备登录时 localStorage 里没有标记，用服务端的 onboarded 再确认一次
    try {
      const r = await fetch(`/api/assistant?uid=${encodeURIComponent(state.uid)}`);
      if (r.ok) {
        const d = await r.json();
        pending = !!(d && d.settings && d.settings.onboarded === false);
      }
    } catch (_) {}
  }
  if (!pending) return false;
  return startOnboarding(opts);
}

export function onboardingOpen() {
  return active;
}
