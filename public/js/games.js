// 游戏中心（v0.9.11）
// 首页卡片排布沿用学习中心；五子棋、2048、井字棋，支持难度与进度保存。
import { openPage, fillPage, setPageLevel, setPageTitle, setActiveNav, playPageSwitch, toast, bindWheel } from './ui.js?v=150';
import { state } from './state.js?v=12';
import { haptic } from './haptics.js';

// 游戏区统一字体：优先苹方，canvas 文字和 DOM 用同一套，避免两套字看着割裂
const GAME_FONT = '"PingFang SC","MinxTok Sans",-apple-system,BlinkMacSystemFont,"HarmonyOS Sans SC","Noto Sans CJK SC","Noto Sans SC","Helvetica Neue","Microsoft YaHei",system-ui,sans-serif';
const gameFont = (size, weight = 400) => `${weight} ${size}px ${GAME_FONT}`;

const GAMES = [
  { key: 'runner', name: '勇往直前', desc: '一直往前跑，达标即三星，达标后还能继续刷距离' , nameEn: 'Run Forward', descEn: 'Keep running; hit the target for three stars and keep going for distance' },
  { key: 'maze', name: '疯狂虾虾', desc: '摸黑闯迷宫，躲开龙虾追捕，找出口' , nameEn: 'Shrimp in the Dark', descEn: 'Feel your way through the maze, dodge the lobster and find the exit' },
  { key: 'pool', name: '台球', desc: '8 球规则，和 AI 对局，进袋算账' , nameEn: 'Pool', descEn: 'Eight-ball rules against the AI; potted balls count' },
  { key: 'bowling', name: '保龄球', desc: '五帧十瓶，带旋转的球路，和 AI 比总分' , nameEn: 'Bowling', descEn: 'Five frames, ten pins, spin on the ball, total score against the AI' },
  { key: 'squad', name: '全部击毙', desc: '和 AI 队友并肩，清波次、打头目，积分换装备' , nameEn: 'Clear Them All', descEn: 'Fight alongside an AI squad, clear waves, down the boss, trade points for gear' },
  { key: 'demolition', name: '爆破能手', desc: '算好预算和炸药，拆桥拆楼，别留下污染和渣土' , nameEn: 'Demolition Pro', descEn: 'Budget the explosives, bring the structure down without leaving debris' },
  { key: 'gomoku', name: '五子棋', desc: '15 路棋盘，先连成五子胜' , nameEn: 'Gomoku', descEn: 'Fifteen lines; first to five in a row wins' },
  { key: '2048', name: '2048', desc: '滑动合并，一星 512 起' , nameEn: '2048', descEn: 'Slide and merge; 512 earns one star' },
  { key: 'ttt', name: '井字棋', desc: '三子连线，和 AI 下一盘' , nameEn: 'Tic-Tac-Toe', descEn: 'Three in a row against the AI' },
  { key: 'tetris', name: '俄罗斯方块', desc: '旋转拼块，消行得分' , nameEn: 'Tetris', descEn: 'Rotate the pieces, clear lines, score points' },
  { key: 'snake', name: '贪吃蛇', desc: '吃豆变长，别撞墙' , nameEn: 'Snake', descEn: 'Eat, grow, and race an AI snake without crashing' },
  { key: 'pong', name: '乒乓球', desc: '接球得分，先到目标分胜' , nameEn: 'Pong', descEn: 'Return the ball; first to the target score wins' },
  { key: 'rush', name: '快问快答', desc: '60 秒连答，答得越快分越高，五星全是冷知识' , nameEn: 'Quick Quiz', descEn: 'Sixty seconds of questions; faster answers score higher' },
  { key: 'spider', name: '蜘蛛纸牌', desc: '十列接龙，凑齐 K 到 A 同花就收走，八副全部收完为赢' , nameEn: 'Spider Solitaire', descEn: 'Ten columns; build K to A in suit to clear every stack' },
  { key: 'go', name: '围棋', desc: '9 路小棋盘，提子围空，和 AI 下一局' , nameEn: 'Go', descEn: 'Nine-by-nine board; capture and surround against the AI' },
  { key: 'memory', name: '记忆翻牌', desc: '翻开配对，步数越少越好' , nameEn: 'Memory', descEn: 'Flip and match pairs in as few moves as possible' },
  { key: 'minesweeper', name: '扫雷', desc: '点开格子，避开地雷' , nameEn: 'Minesweeper', descEn: 'Open cells without hitting a mine' },
  { key: 'klotski', name: '数字华容道', desc: '滑动数字，按顺序排好' , nameEn: 'Sliding Puzzle', descEn: 'Slide the tiles back into order' },
];

const DIFF_PREFIX = 'minxtok.game.';
const diffKey = (key) => DIFF_PREFIX + key + '.difficulty';
const stateKey = (key) => DIFF_PREFIX + key + '.state';
const historyKey = (key) => DIFF_PREFIX + key + '.history';
const DEFAULT_DIFF = { tetris: 2, snake: 2, pong: 2, memory: 2, quiz: 2, minesweeper: 2, klotski: 2, squad: 2, demolition: 6, go: 2 };
const HISTORY_LIMIT = 20;
const DEFAULTS_MIGRATION = 'minxtok.game.defaults.v2';

// v0.9.78：俄罗斯方块/贪吃蛇等新游戏的旧默认 3 星偏难，首次升级统一降到 2 星。
// 只迁移一次，之后玩家自己选的难度不再覆盖。
try {
  if (!safeGet(DEFAULTS_MIGRATION)) {
    ['tetris', 'snake', 'pong', 'memory', 'quiz'].forEach((key) => {
      if (safeGet(diffKey(key)) === '3') safeSet(diffKey(key), String(DEFAULT_DIFF[key] || 2));
    });
    safeSet(DEFAULTS_MIGRATION, '1');
  }
} catch (_) {}

const PAD_ICONS = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 14.5 12 8l6.5 6.5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 9.5 12 16l6.5-6.5"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 5v6h-6"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/></svg>',
};

function padBtn(act, icon, label, cls = '') {
  return `<button class="pad-btn ${cls}" type="button" data-act="${act}" aria-label="${label}">${PAD_ICONS[icon]}</button>`;
}
function padBtnLabel(act, icon, label, text, cls = '') {
  return `<button class="pad-btn pad-label ${cls}" type="button" data-act="${act}" aria-label="${label}">${PAD_ICONS[icon]}<span>${text}</span></button>`;
}

// 记忆翻牌用图：动物、水果、蔬菜、熟食各自成局，同局只抽同一类；不把水果/蔬菜和动物混在一起。
const MEM_ANIMALS = [
  'animal-ant', 'animal-bee', 'animal-bird', 'animal-butterfly', 'animal-camel',
  'animal-cat', 'animal-chicken', 'animal-cow', 'animal-crab', 'animal-crocodile',
  'animal-dog', 'animal-dolphin', 'animal-duck', 'animal-elephant', 'animal-fish',
  'animal-flamingo', 'animal-hedgehog', 'animal-kangaroo', 'animal-ladybug', 'animal-llama',
  'animal-lobster', 'animal-monkey', 'animal-mouse', 'animal-octopus', 'animal-otter',
  'animal-owl', 'animal-parrot', 'animal-peacock', 'animal-penguin', 'animal-pig',
  'animal-rabbit', 'animal-shark', 'animal-shrimp', 'animal-skunk', 'animal-sloth',
  'animal-snail', 'animal-snake', 'animal-squid', 'animal-tiger', 'animal-turtle',
];
const MEM_FOODS = [
  'food-bacon', 'food-baguette', 'food-bento', 'food-burrito', 'food-cake',
  'food-cheese', 'food-chickenleg', 'food-chocolate', 'food-cookie', 'food-croissant',
  'food-cupcake', 'food-curry', 'food-dango', 'food-donut', 'food-dumpling',
  'food-egg', 'food-fortunecookie', 'food-friedshrimp', 'food-fries', 'food-hamburger',
  'food-hotdog', 'food-icecream', 'food-meat', 'food-oden', 'food-pancakes',
  'food-pie', 'food-pizza', 'food-popcorn', 'food-pretzel', 'food-ramen',
  'food-rice', 'food-sandwich', 'food-spaghetti', 'food-steak', 'food-stew',
  'food-sushi', 'food-taco', 'food-takeout', 'food-waffle',
];
const MEM_FRUITS = [
  'fruit-apple', 'fruit-banana', 'fruit-blueberries', 'fruit-cherries', 'fruit-coconut',
  'fruit-grapes', 'fruit-greenapple', 'fruit-kiwi', 'fruit-lemon', 'fruit-lime',
  'fruit-mango', 'fruit-melon', 'fruit-olive', 'fruit-peach', 'fruit-pear',
  'fruit-pineapple', 'fruit-strawberry', 'fruit-tangerine', 'fruit-watermelon',
];
const MEM_VEGGIES = [
  'veg-avocado', 'veg-beans', 'veg-bellpepper', 'veg-broccoli', 'veg-brownmushroom',
  'veg-carrot', 'veg-corn', 'veg-cucumber', 'veg-eggplant', 'veg-garlic',
  'veg-ginger', 'veg-hotpepper', 'veg-leafygreens', 'veg-mushroom', 'veg-onion',
  'veg-peapod', 'veg-potato', 'veg-pumpkin', 'veg-salad', 'veg-sweetpotato',
  'veg-tomato',
];
const MEM_SYMBOLS = MEM_ANIMALS.concat(MEM_FOODS, MEM_FRUITS, MEM_VEGGIES);
const MEM_CATEGORIES = [MEM_ANIMALS, MEM_FOODS, MEM_FRUITS, MEM_VEGGIES];
let memoryPreload = null;
function preloadMemoryAssets() {
  if (memoryPreload || typeof Image !== 'function') return memoryPreload;
  memoryPreload = Promise.all(MEM_SYMBOLS.map(sym => new Promise(resolve => {
    const img = new Image();
    img.loading = 'eager';
    img.decoding = 'async';
    img.onload = () => {
      if (img.decode) img.decode().catch(() => {}).then(resolve, resolve);
      else resolve();
    };
    img.onerror = resolve;
    img.src = `/assets/emoji-memory/${sym}.png`;
  })));
  return memoryPreload;
}

const MINE_ICONS = {
  bomb: '/assets/emoji-mine/bomb.png',
  flag: '/assets/emoji-mine/flag.png',
  cross: '/assets/emoji-mine/cross.png',
};
let minePreload = null;
function preloadMineAssets() {
  if (minePreload || typeof Image !== 'function') return minePreload;
  minePreload = Promise.all(Object.values(MINE_ICONS).map(src => new Promise(resolve => {
    const img = new Image();
    img.loading = 'eager';
    img.decoding = 'async';
    img.onload = () => {
      if (img.decode) img.decode().catch(() => {}).then(resolve, resolve);
      else resolve();
    };
    img.onerror = resolve;
    img.src = src;
  })));
  return minePreload;
}

const gamesEn = () => document.documentElement.lang !== 'zh-CN';
const gName = (g) => (gamesEn() && g.nameEn ? g.nameEn : g.name);
const gDesc = (g) => (gamesEn() && g.descEn ? g.descEn : g.desc);
function gameOf(key) { return GAMES.find(g => g.key === key) || GAMES[0]; }

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
function loadState(key) {
  const raw = safeGet(stateKey(key));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}
function saveState(key, state) {
  try { safeSet(stateKey(key), JSON.stringify(state)); } catch (_) {}
}
function readDifficulty(key) {
  const fallback = DEFAULT_DIFF[key] || 3;
  const n = Number(safeGet(diffKey(key)) || fallback);
  return Number.isFinite(n) ? Math.max(1, n) : fallback;
}
let activeGameKey = '';
let resultSig = '';

// 结算积分不再固定：按本局表现分给基础分，再按分数的平方根增长，避免刷一局小游戏就把额度刷爆
function performancePoints(raw, type) {
  const n = Math.max(0, Number(raw) || 0);
  const base = type === 'win' ? 70 : type === 'draw' ? 40 : 25;
  const cap = type === 'win' ? 260 : type === 'draw' ? 160 : 110;
  const scale = type === 'win' ? 4.2 : type === 'draw' ? 3.1 : 2.6;
  return Math.round(base + Math.min(cap, Math.sqrt(n) * scale));
}

// 结算卡：胜负一眼看清，三颗星评表现，顺带把这局的积分记进总池
function setGameResult(text, type, extra) {
  const el = document.getElementById('gameResult');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.innerHTML = '';
    el.textContent = '';
    el.className = 'game-result';
    el.dataset.text = '';
    resultSig = '';
    return;
  }
  const same = !el.hidden && el.dataset.text === text;
  if (!same) {
    // 结算三种结果给三种手感：赢是短促两下，平局一段，输是闷一下
    if (type === 'win') haptic([30, 55, 30, 55, 60], true);
    else if (type === 'lose') haptic([90, 60, 40], true);
    else haptic([45, 45, 45], true);
  }
  const stars = Math.max(0, Math.min(3, (extra && typeof extra.stars === 'number') ? extra.stars : (type === 'win' ? 3 : type === 'draw' ? 2 : type === 'lose' ? 1 : 2)));
  const title = type === 'win' ? '胜利' : type === 'lose' ? '失败' : type === 'draw' ? '平局' : '结算';
  const sig = `${activeGameKey}|${text}`;
  let gain = 0;
  if (!same && sig !== resultSig && !(extra && extra.noPoints)) {
    gain = Math.max(0, Math.round(
      typeof (extra && extra.points) === 'number' ? extra.points
        : extra && Number.isFinite(extra.score) ? performancePoints(extra.score, type)
          : (type === 'win' ? 150 : type === 'draw' ? 90 : type === 'lose' ? 45 : 60),
    ));
    if (gain) ptsAdd(activeGameKey || 'misc', gain);
    resultSig = sig;
  }
  const total = ptsLoad().total;
  const starHtml = [0, 1, 2].map((i) =>
    `<span class="gr-star${i < stars ? ' on' : ''}" style="animation-delay:${(i * 110) + 80}ms">★</span>`).join('');
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const r = 46 + Math.random() * 54;
    return `<i class="gr-spark" style="--sx:${Math.round(Math.cos(a) * r)}px;--sy:${Math.round(Math.sin(a) * r)}px;animation-delay:${180 + i * 26}ms"></i>`;
  }).join('');
  const shown = gain || (typeof (extra && extra.points) === 'number' ? Math.round(extra.points)
    : typeof (extra && extra.bank) === 'number' ? Math.round(extra.bank) : 0);
  el.className = 'game-result scored' + (type ? ' ' + type : '');
  el.innerHTML = `
    <div class="gr-card">
      ${type === 'win' ? sparks : ''}
      <div class="gr-stars">${starHtml}</div>
      <div class="gr-title">${title}</div>
      <div class="gr-score"><b data-gr="score">0</b><span>本局积分</span></div>
      <div class="gr-text">${text}</div>
      ${extra && extra.detail ? `<div class="gr-detail">${extra.detail}</div>` : ''}
      <div class="gr-pts">${gain ? `+<b>${gain}</b> 积分` : extra && typeof extra.bank === 'number' ? `已存入 <b>${Math.round(extra.bank)}</b> 积分` : '本局已结算'} · 总积分 <b>${total}</b></div>
      <div class="gr-btns">
        ${extra && typeof extra.revive === 'function' ? `<button class="game-btn gr-revive" type="button" data-gr="revive">${extra.reviveLabel || '复活'}</button>` : ''}
        ${extra && typeof extra.continue === 'function' ? `<button class="game-btn" type="button" data-gr="continue">${extra.continueLabel || '继续'}</button>` : ''}
        <button class="game-btn" type="button" data-gr="again">再来一局</button>
      </div>
    </div>`;
  el.dataset.text = text;
  el.hidden = false;
  // 分数从零滚上去，别让数字直接跳
  const scoreEl = el.querySelector('[data-gr="score"]');
  if (scoreEl) {
    const target = Math.max(0, shown);
    const t0 = performance.now();
    const step = (t) => {
      if (!scoreEl.isConnected) return;
      const p = Math.min(1, (t - t0) / 620);
      scoreEl.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) gRaf(step);
    };
    gRaf(step);
  }
  const again = el.querySelector('[data-gr="again"]');
  if (again) again.addEventListener('click', () => {
    const btn = document.getElementById('gameReset');
    if (btn) btn.click();
  });
  const rv = el.querySelector('[data-gr="revive"]');
  if (rv && extra && typeof extra.revive === 'function') rv.addEventListener('click', () => extra.revive());
  const ct = el.querySelector('[data-gr="continue"]');
  if (ct && extra && typeof extra.continue === 'function') ct.addEventListener('click', () => {
    el.hidden = true;
    extra.continue();
  });
  if (!same) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (type) flashGame(type);
  }
}

function gameStage() {
  return document.querySelector('.game-wrap');
}

// 难度切换时整块游戏区轻微模糊退场再恢复，避免“切了但没变”的错觉
function gameSwap() {
  const stage = gameStage();
  if (!stage) return;
  stage.classList.remove('game-swap');
  void stage.offsetWidth;
  stage.classList.add('game-swap');
  setTimeout(() => stage.classList.remove('game-swap'), 460);
}

// 胜利/失败时在游戏区盖一层带模糊的光晕，随后自动消失
function flashGame(type) {
  const stage = gameStage();
  if (!stage || (type !== 'win' && type !== 'lose')) return;
  const old = stage.querySelector('.game-flash');
  if (old) old.remove();
  const flash = document.createElement('div');
  flash.className = 'game-flash ' + type;
  stage.appendChild(flash);
  setTimeout(() => flash.remove(), 900);
}

function pulseTap(el) {
  if (!el) return;
  el.classList.remove('tap');
  void el.offsetWidth;
  el.classList.add('tap');
  setTimeout(() => el.classList.remove('tap'), 240);
}

// 所有游戏内按钮、格子、棋盘点击都有一拍轻微下压和模糊
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.game-wrap .pad-btn, .game-wrap .game-star, .game-wrap .game-btn, .game-wrap .mem-card, .game-wrap .mine-cell, .game-wrap .quiz-opt, .game-wrap .klotski-block, .game-wrap .ttt-cell, .game-wrap .g2048-board, .game-wrap canvas');
  if (!el || el.disabled) return;
  pulseTap(el);
}, { passive: true });

function loadHistory(key) {
  const raw = safeGet(historyKey(key));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => x && typeof x === 'object').slice(0, HISTORY_LIMIT) : [];
  } catch (_) { return []; }
}

function fmtHistoryDate(ts) {
  const d = new Date(Number(ts) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function bestHistory(key, list) {
  const pool = key === 'minesweeper' ? list.filter(x => x.win !== false) : list;
  const nums = pool.map(x => Number(x.score)).filter(Number.isFinite);
  if (!nums.length) return null;
  return key === 'memory' || key === 'minesweeper' || key === 'klotski' ? Math.min(...nums) : Math.max(...nums);
}

function historyInner(key) {
  const list = loadHistory(key);
  if (!list.length) return '<div class="gh-empty">还没有战绩，玩一局就会记在这里。</div>';
  const best = bestHistory(key, list);
  const unit = key === 'memory' || key === 'klotski' ? '步'
    : key === 'minesweeper' ? '秒'
    : key === 'pong' ? '球' : '分';
  const recent = list.slice(0, 3).map(it => `
    <span class="gh-item"><b>${it.text || it.result || '—'}</b><em>${fmtHistoryDate(it.at)}</em></span>`).join('');
  return `
    <div class="gh-top">
      <span>最佳 <b>${best === null ? '—' : `${best} ${unit}`}</b></span>
      <span>已玩 <b>${list.length}</b> 局</span>
    </div>
    <div class="gh-recent">${recent}</div>`;
}

function historyHtml(key) {
  return `<div class="game-history" id="gameHistory">${historyInner(key)}</div>`;
}

function renderHistory(key) {
  const el = document.getElementById('gameHistory');
  if (el) el.innerHTML = historyInner(key);
}

function recordHistory(key, entry) {
  const list = loadHistory(key);
  list.unshift(Object.assign({ at: Date.now() }, entry));
  safeSet(historyKey(key), JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  renderHistory(key);
  // 顺手给服务端留一条成绩，助手侧才查得到「游戏记录」
  try {
    const g = GAMES.find(x => x.key === key);
    fetch('/api/game/log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, game: key, text: `${g ? g.name : key} · ${entry.text || ''}`.slice(0, 180) }),
    }).catch(() => {});
  } catch (_) { /* 打点失败不影响游戏 */ }
}

// 本地进度：写入做一点节流，退出/切页时强制落盘
function makeSaver(key, snapshot, wait = 320) {
  let timer = 0;
  const write = () => { timer = 0; saveState(key, snapshot()); };
  const save = (force = false) => {
    if (force) { clearTimeout(timer); write(); return; }
    if (timer) return;
    timer = setTimeout(write, wait);
  };
  return save;
}

function bindLifecycle(el, save) {
  if (!el) return;
  const onHide = () => { if (document.visibilityState === 'hidden') save(true); };
  const onPageHide = () => save(true);
  const body = document.getElementById('pageBody');
  let observer = null;
  const cleanup = () => {
    save(true);
    if (observer) observer.disconnect();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onHide);
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onHide);
  if (body && window.MutationObserver) {
    observer = new MutationObserver(() => {
      if (!el.isConnected) cleanup();
    });
    observer.observe(body, { childList: true, subtree: true });
  }
}

function difficultyHtml(count = 5) {
  return `
    <div class="game-difficulty${count > 5 ? ' many' : ''}${count >= 20 ? ' ten' : ''}" id="gameDifficulty" role="group" aria-label="难度">
      <span class="game-difficulty-label">难度</span>
      ${Array.from({ length: count }, (_, i) => i + 1).map(n => `
        <button class="game-star" type="button" data-level="${n}" aria-label="${n} 星" aria-pressed="false">☆</button>
      `).join('')}
    </div>`;
}

function initDifficulty(key, onChange) {
  const wrap = document.getElementById('gameDifficulty');
  const stars = wrap ? Array.from(wrap.querySelectorAll('.game-star')) : [];
  // 星数由页面决定（爆破能手二十关），存下来的等级不能超过它
  let level = Math.max(1, Math.min(stars.length || 5, readDifficulty(key)));
  const paint = () => {
    stars.forEach((btn, i) => {
      const on = i < level;
      btn.textContent = on ? '★' : '☆';
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(i + 1 === level));
    });
  };
  paint();
  stars.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const next = i + 1;
      if (next === level) return;
      level = next;
      safeSet(diffKey(key), String(level));
      paint();
      btn.classList.remove('star-pop');
      void btn.offsetWidth;
      btn.classList.add('star-pop');
      setTimeout(() => btn.classList.remove('star-pop'), 360);
      gameSwap();
      if (onChange) onChange(level);
    });
  });
  return { get: () => level };
}

function homeHtml() {
  const blocks = GAMES.map((g, i) => `
    <button class="study-block ${i === GAMES.length - 1 && GAMES.length % 2 ? 'wide' : ''}" data-game="${g.key}">
      <span class="sb-name">${gName(g)}</span>
      <span class="sb-desc">${gDesc(g)}</span>
    </button>`).join('');
  const wallet = ptsLoad();
  // 积分总池只在这里看总数和兑换；各游戏内部只花自己那份
  return `
    <div class="pts-bar">
      <div class="pts-sum"><span>总积分</span><b id="ptsTotal">${wallet.total}</b></div>
    </div>
    <div class="study-grid">${blocks}</div>
    <div class="pts-modal" id="ptsModal" hidden>
      <div class="pts-sheet">
        <div class="pts-head">兑换额度</div>
        <div class="pts-info" id="ptsModalInfo"></div>
        <div class="pts-row">兑换数量</div>
        <div class="pts-pick">
          <div class="pts-wheel" id="ptsWheel"></div>
          <div class="pts-wheel-band"></div>
        </div>
        <div class="pts-cost" id="ptsCost">600 分 → 1 点额度</div>
        <div class="pts-note">600 分换 1 点额度，每天最多换 20 点。换到的额度优先消耗，用不完一直留着，也不会抬高每日上限</div>
        <div class="pts-acts">
          <button class="game-btn" id="ptsClose" type="button">关闭</button>
          <button class="game-btn" id="ptsGo" type="button">确认兑换</button>
        </div>
      </div>
    </div>`;
}

// 所有小游戏共用一个轻触反馈：手指落下就有 6ms 的细震，
// 单个游戏不用各自去挂（canvas 里再写一遍容易漏）
document.addEventListener('pointerdown', (e) => {
  if (!e.target || !e.target.closest || !activeGameKey) return;
  // 只要人在某个小游戏页（结算卡在就说明在游戏里），任何一次触碰都给反馈
  if (!document.getElementById('gameResult')) return;
  if (e.target.closest('input, textarea, select, .dbg')) return;
  haptic(6);
}, { passive: true });

export function openGames(fromBack) {
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  // 第一次进游戏中心就把食物图全部拉进缓存，记忆翻牌不会翻一张白一下
  preloadMemoryAssets();
  preloadMineAssets();
  if (bodyEl) bodyEl.classList.remove('study-full');
  if (fromBack && page && page.classList.contains('show')) {
    setActiveNav('games');
    // 退回游戏列表就是一级页，右上角恢复菜单键，和其他一级页一致
    setPageLevel(null);
    setPageTitle('游戏');
    fillPage(homeHtml());
    playPageSwitch('games', 'games', -1);
    bindHome();
    return;
  }
  openPage('游戏', homeHtml(), null, 'games');
  bindHome();
}

function bindHome() {
  const body = document.getElementById('pageBody');
  if (!body) return;
  body.querySelectorAll('[data-game]').forEach(b => {
    b.addEventListener('click', () => openGame(b.dataset.game));
  });
  const openBtn = document.getElementById('ptsRedeem');
  if (openBtn) openBtn.addEventListener('click', openPointsModal);
  const close = document.getElementById('ptsClose');
  const modal = document.getElementById('ptsModal');
  if (close) close.addEventListener('click', closePointsModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closePointsModal(); });
  const go = document.getElementById('ptsGo');
  if (go) go.addEventListener('click', async () => {
    const n = Math.max(0, Math.min(PTS_DAILY_CAP, Number(ptsWheelValue) || 0));
    if (!n) { toast('先选个数量'); return; }
    const cost = n * PTS_PER_QUOTA;
    if (ptsLoad().total < cost) { toast('积分不够'); openPointsModal(); return; }
    go.disabled = true;
    const old = go.textContent;
    go.textContent = '兑换中…';
    try {
      const r = await fetch('/api/game/reward', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, quota: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        toast(d.error === 'daily_cap' ? '今天已经换满 20 次了' : '兑换失败，稍后再试');
      } else {
        ptsSpendTotal(cost);
        const totalEl = document.getElementById('ptsTotal');
        if (totalEl) totalEl.textContent = String(ptsLoad().total);
        toast(`已兑换 ${d.granted || n} 点额度`);
        if (d.quota) window.dispatchEvent(new CustomEvent('minxtok-quota', { detail: d.quota }));
        openPointsModal();
      }
    } catch (_) { toast('兑换失败，网络不通'); }
    go.disabled = false;
    go.textContent = old;
  });
}

// 退出游戏先弹暂停窗，别让人一键点没
function requestExit() {
  const wrap = document.querySelector('.game-wrap');
  const mask = document.querySelector('.game-pause');
  // 点返回先弹暂停菜单，菜单里再决定继续、重开还是退出
  if (mask) {
    if (mask.hidden && typeof wrap.__pause === 'function') { wrap.__pause(true); return; }
    if (!mask.hidden) return;
  }
  thawFrames();
  openGames(true);
}

// 顶栏三段：说明 → 控件行（控件在左，调节按钮固定贴右）→ 难度
function mountTopBar() {
  const wrap = document.querySelector('.game-wrap');
  if (!wrap || wrap.querySelector('.game-top')) return;
  // 爆破能手只留自己的介绍卡
  if (wrap.querySelector('.demo-stage')) return;
  const tip = wrap.querySelector('.game-tip');
  const head = wrap.querySelector('.game-head');
  const status = wrap.querySelector('.game-status, .g2048-scores, .sp-hud');
  const diff = wrap.querySelector('.game-difficulty');
  if (!status) return;
  const top = document.createElement('div');
  top.className = 'game-top';
  if (tip) top.appendChild(tip);
  const row = document.createElement('div');
  row.className = 'game-top-row';
  row.appendChild(status);
  // 撤销、插旗这类调节按钮单独占右边一格，永远不跟着换行
  const acts = document.createElement('div');
  acts.className = 'game-top-acts';
  if (head) {
    const box = head.querySelector('.game-head-actions') || head;
    Array.from(box.children).forEach((el) => {
      if (el.tagName === 'BUTTON' && !el.hidden) acts.appendChild(el);
    });
  }
  if (acts.children.length) row.appendChild(acts);
  top.appendChild(row);
  if (diff) top.appendChild(diff);
  wrap.insertBefore(top, wrap.firstChild);
  if (head) head.hidden = true;
  watchStatusWrap(status);
}

// 状态换行时让被挤下去的胶囊带一点动态模糊，画面本身不能被顶着上下抖
function watchStatusWrap(status) {
  if (!status || status.__wrapWatch || typeof ResizeObserver === 'undefined') return;
  status.__wrapWatch = true;
  const lineOf = new WeakMap();
  let queued = false;
  const mark = () => {
    queued = false;
    if (!status.isConnected) { ro.disconnect(); return; }
    // 掉到第二行就锁住，只有第一行留出足够余量才允许回来，避免数字一变就上下跳
    const kids = Array.from(status.children);
    if (kids.length) {
      const rows = new Set(kids.map((k) => k.offsetTop)).size;
      if (rows > 1) {
        if (!status.classList.contains('wrap-lock')) status.classList.add('wrap-lock');
      } else if (status.classList.contains('wrap-lock')) {
        const used = kids.reduce((a, k) => a + k.offsetWidth, 0) + 6 * (kids.length - 1);
        if (status.clientWidth - used > 34) status.classList.remove('wrap-lock');
      }
    }
    const moved = [];
    for (const chip of status.children) {
      const y = chip.offsetTop;
      const prev = lineOf.get(chip);
      if (prev !== undefined && prev !== y) moved.push(chip);
      lineOf.set(chip, y);
    }
    for (const chip of moved) {
      chip.classList.remove('wrap-blur');
      void chip.offsetWidth;
      chip.classList.add('wrap-blur');
      setTimeout(() => chip.classList.remove('wrap-blur'), 360);
    }
  };
  const ro = new ResizeObserver(() => { if (!queued) { queued = true; gRaf(mark); } });
  ro.observe(status);
}

async function openGame(key) {
  // 玩一次扣一额度（2026-10-30 起），余额不够就进不去
  const pay = await spendQuota(1);
  if (!pay.ok) {
    toast(pay.error === 'quota_exceeded' ? '额度用完了，联系管理员发放' : '额度扣不动，稍后再试');
    return;
  }
  // 上一轮退出时可能停在暂停态，进游戏一律先解除
  gamePaused = false;
  document.body.classList.remove('game-paused');
  document.body.classList.remove('squad-shop-open');
  document.querySelectorAll('.game-pause').forEach((m) => m.remove());
  const g = gameOf(key);
  if (key === 'maze') preloadItemEmoji();
  if (key === 'memory') preloadMemoryAssets();
  if (key === 'minesweeper') preloadMineAssets();
  const page = document.getElementById('page');
  const back = () => requestExit();
  if (page && page.classList.contains('show')) {
    setActiveNav('games');
    setPageLevel(back);
    setPageTitle(gName(g));
    fillPage(gameHtml(g));
    playPageSwitch('games', 'games', 1);
  } else {
    openPage(gName(g), gameHtml(g), back, 'games');
  }
  bindGame(g.key);
  mountTopBar();
}

function gameHtml(g) {
  if (g.key === 'tetris') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">得分 0</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="tetris-stage">
        <canvas id="tetrisCanvas" class="tetris-canvas" width="220" height="440" aria-label="俄罗斯方块棋盘"></canvas>
        <div class="tetris-side">
          <div class="tetris-next-label">下一块</div>
          <canvas id="tetrisNext" width="84" height="84" aria-label="下一块"></canvas>
          <div class="tetris-pad tetris-pad-side">
            ${padBtn('left', 'left', '左移')}
            ${padBtn('right', 'right', '右移')}
            ${padBtn('down', 'down', '下移')}
            ${padBtn('rotate', 'rotate', '旋转')}
            ${padBtnLabel('drop', 'drop', '直接落下', '落底')}
          </div>
        </div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">棋盘在左，右列上面是下一块预览；下面两排按键左移、右移 / 下移、旋转，最底下一整条是落底</div>
      ${historyHtml('tetris')}
    </div>`;
  if (g.key === 'snake') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">得分 0</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="snake-stage">
        <canvas id="snakeCanvas" class="snake-canvas" width="360" height="360" aria-label="贪吃蛇棋盘"></canvas>
      </div>
      <div class="game-pad snake-pad">
        <div class="pad-cross">
          ${padBtn('up', 'up', '向上', 'pad-up')}
          ${padBtn('left', 'left', '向左', 'pad-left')}
          ${padBtn('down', 'down', '向下', 'pad-down')}
          ${padBtn('right', 'right', '向右', 'pad-right')}
        </div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">吃豆变长；撞墙前有短暂缓冲，快速转向可以救回来，撞到自己直接结束</div>
      ${historyHtml('snake')}
    </div>`;
  if (g.key === 'pong') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">0 : 0</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="pong-stage">
        <canvas id="pongCanvas" class="pong-canvas" width="640" height="420" aria-label="乒乓球球场"></canvas>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">左右拖动接球；接住金色道具会分裂出 2–4 个球，先到目标分获胜</div>
      ${historyHtml('pong')}
    </div>`;
  if (g.key === 'rush') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">60 秒 · 0 分</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml(5)}
      <div class="rush-stage">
        <div class="rush-bar"><i id="rushBar"></i></div>
        <div class="rush-q" id="rushQ">点开始，问就是秒答</div>
        <div class="rush-opts" id="rushOpts"></div>
        <div class="rush-stats" id="rushStats">连击 0 · 答对 0 · 答错 0</div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">60 秒内连答，答对越快分越高，连击不断还有加成；答错扣 3 秒，五星会混进冷知识</div>
      ${historyHtml('rush')}
    </div>`;
  if (g.key === 'spider') return `
    <div class="game-wrap">
      <div class="game-head" style="justify-content:flex-end">
        <button class="game-btn" id="gameSpiderUndo" type="button">撤销</button>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml(5)}
      <div class="sp-stage">
        <div class="sp-hud">
          <span>组数 <b id="spDone">0</b>/8</span>
          <span>步数 <b id="spMoves">0</b></span>
          <span>分数 <b id="spScore">500</b></span>
        </div>
        <div class="sp-board" id="spBoard"></div>
        <div class="sp-bar">
          <button class="game-btn" id="spDeal" type="button">发牌</button>
          <div class="sp-stock" id="spStock">还能发 5 次</div>
        </div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">点一张牌选中它和下面的顺子，再点目标列放下；只能压在比它大一点的牌上，空列随便放。同花从 K 排到 A 会自动收走，八组收完就赢</div>
      ${historyHtml('spider')}
    </div>`;
  if (g.key === 'go') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">你执黑，先行</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml(5)}
      <div class="go-stage">
        <canvas id="goCanvas" class="go-canvas" width="360" height="360" aria-label="九路围棋棋盘"></canvas>
      </div>
      <div class="pk-acts">
        <button class="game-btn" id="goPass" type="button">虚手</button>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">点交叉点落子；把对方的气堵光就能提子，双方连续虚手即终局按围空计分</div>
      ${historyHtml('go')}
    </div>`;
  if (g.key === 'memory') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="g2048-scores">
          <span>步数 <b id="memMoves">0</b></span>
          <span>配对 <b id="memPairs">0</b></span>
        </div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="memory-board" id="memoryBoard"></div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">翻开两张相同的食物牌，全部配对即完成；难度越高牌越多</div>
      ${historyHtml('memory')}
    </div>`;
  if (g.key === 'minesweeper') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">剩余 10 雷</div>
        <div class="game-head-actions">
          <button class="game-btn" id="mineFlagMode" type="button" aria-pressed="false">插旗</button>
          <button id="gameReset" type="button" hidden></button>
        </div>
      </div>
      ${difficultyHtml()}
      <div class="mine-board" id="mineBoard"></div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">点格子挖开，点“插旗”切换标记；难度越高棋盘越大、雷也越多</div>
      ${historyHtml('minesweeper')}
    </div>`;
  if (g.key === 'klotski') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">步数 0 · 4×4</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="klotski-board" id="klotskiBoard"></div>
      <div class="game-pad klotski-pad">
        <div class="pad-cross">
          ${padBtn('up', 'up', '向上', 'pad-up')}
          ${padBtn('left', 'left', '向左', 'pad-left')}
          ${padBtn('down', 'down', '向下', 'pad-down')}
          ${padBtn('right', 'right', '向右', 'pad-right')}
        </div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">点空格旁边的数字，或按方向键/滑动，把 1 到 N 按顺序排好</div>
      ${historyHtml('klotski')}
    </div>`;
  if (g.key === 'gomoku') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">你执黑，先手</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="gomoku-board"><canvas id="gomokuCanvas"></canvas></div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">点棋盘落子，横竖斜任意方向连成五子即胜</div>
      ${historyHtml('gomoku')}
    </div>`;
  if (g.key === '2048') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="g2048-scores">
          <span>得分 <b id="g2048Score">0</b></span>
          <span>目标 <b id="g2048Target">512</b></span>
          <span>最大 <b id="g2048Best">2</b></span>
        </div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="g2048-board" id="g2048Board" tabindex="0" aria-label="2048 棋盘"></div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip" id="g2048Tip">手指滑动，或用方向键移动</div>
      ${historyHtml('2048')}
    </div>`;
  if (g.key === 'runner') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">得分 0 · 0 米 · 金币 0 · 已过 0 关 · 生命 4</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="runner-stage">
        <canvas id="runnerCanvas" class="runner-canvas" width="360" height="300" aria-label="勇往直前跑道"></canvas>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">按画面推摇杆：向上跳，向下滑。柱子能踩上去，侧面撞上就被顶出跑道；地上的按钮一踩，顶上尖刺会跟着你砸下来，落稳了再跳过去</div>
      ${historyHtml('runner')}
    </div>`;
  if (g.key === 'maze') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">生命 3 · 熄灯倒计时</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="maze-stage">
        <canvas id="mazeCanvas" class="maze-canvas" width="360" height="360" aria-label="疯狂虾虾迷宫"></canvas>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">按在画面上拖出摇杆走迷宫，松手就停；红圆点是龙虾，绿色「出」是出口。路上捡到的东西自己试试就知道，熄灯只黑一两秒</div>
      ${historyHtml('maze')}
    </div>`;
  if (g.key === 'pool') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">轮到你｜你：还没定球 · AI：还没定球</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="pool-stage">
        <canvas id="poolCanvas" class="pool-canvas" width="360" height="240" aria-label="台球桌"></canvas>
      </div>
      <div class="pool-board" id="poolBoard">
        <div class="pb-row" id="pbRowMe"><span class="pb-tag">你</span><span class="pb-group" id="pbGroupMe">未定球</span><span class="pb-left" id="pbLeftMe">15 球待定</span></div>
        <div class="pb-row" id="pbRowAi"><span class="pb-tag">AI</span><span class="pb-group" id="pbGroupAi">未定球</span><span class="pb-left" id="pbLeftAi">15 球待定</span></div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">规则很简单：第一次进球决定你是全色（1-7）还是花色（9-15），把自己那 7 颗全打进，最后才打 8 号。谁先清完自己的球再进 8 号谁赢；8 号提前落袋直接判负。白球落袋算犯规换人</div>
      ${historyHtml('pool')}
    </div>`;
  if (g.key === 'bowling') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">第 1 帧 · 你 · 你 0 : 0 AI</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="bowl-stage">
        <canvas id="bowlCanvas" class="bowl-canvas" width="360" height="400" aria-label="保龄球道"></canvas>
      </div>
      <div class="bowl-board">
        <div class="bb-side" id="bbMe"><span class="bb-name">你</span><b id="bbMeScore">0</b><i id="bbMeMarks"></i></div>
        <div class="bb-frame" id="bbFrame">第 1 帧 · 第 1 球</div>
        <div class="bb-side ai" id="bbAi"><span class="bb-name">AI</span><b id="bbAiScore">0</b><i id="bbAiMarks"></i></div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">在球道上按住选起点，向上滑得越远力量越大，左右滑动带旋转。五帧，每帧两球；第一球全中直接进下一帧，第二球只补剩下的瓶</div>
      ${historyHtml('bowling')}
    </div>`;
  if (g.key === 'squad') return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">第 1/5 波 · 积分 0</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="squad-stage">
        <canvas id="squadCanvas" class="squad-canvas" width="360" height="440" aria-label="全部击毙战场"></canvas>
        <div class="squad-start" id="squadStart">
          <div class="ss-card">
            <div class="ss-title">全部击毙</div>
            <div class="ss-sub">你和一个 AI 队友守五波，第 3 波小头目、第 5 波大头目</div>
            <button class="game-btn" id="squadStartBtn" type="button">开始游戏</button>
            <button class="game-btn" id="squadResumeBtn" type="button" hidden>继续上次</button>
          </div>
        </div>
      </div>
      <div class="squad-shop" id="squadShop" hidden></div>
      <div class="squad-actions">
        <button class="game-btn" id="squadGrenade" type="button">手雷 ×2</button>
        <span class="squad-hint">拖屏幕移动，自动瞄准开火；空格/按钮扔手雷</span>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">你和一个 AI 队友并肩作战，每波清完弹出补给商店：装备、盔甲、队友、皮肤都能买。积分存档在游戏中心，兑换额度也在那边</div>
      ${historyHtml('squad')}
    </div>`;
  if (g.key === 'demolition') return `
    <div class="game-wrap">
      <div class="game-head demo-head">
        <div class="game-status" id="gameStatus" hidden></div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      <div class="demo-intro" id="demoIntro">
        <div class="di-head" id="diHead"></div>
        <div class="di-text" id="diText"></div>
        <div class="di-tags" id="diTags"></div>
        <div class="demo-levels">${difficultyHtml(20)}</div>
      </div>
      <div class="demo-stage">
        <canvas id="demoCanvas" class="demo-canvas" width="360" height="360" aria-label="爆破现场"></canvas>
      </div>
      <div class="demo-tools" id="demoTools">
        <div class="demo-tool-title">炸药库</div>
        <button class="demo-tool on" type="button" data-charge="nano"><b>精密小药</b><span>¥45 · 威力28</span></button>
        <button class="demo-tool" type="button" data-charge="small"><b>小炸药</b><span>¥60 · 威力52</span></button>
        <button class="demo-tool" type="button" data-charge="quiet"><b>低噪装药</b><span>¥150 · 威力88</span></button>
        <button class="demo-tool" type="button" data-charge="shaped"><b>定向爆破</b><span>¥130 · 威力96</span></button>
        <button class="demo-tool" type="button" data-charge="chem"><b>化学炸药</b><span>¥95 · 威力120</span></button>
        <button class="demo-tool" type="button" data-charge="high"><b>高能炸药</b><span>¥210 · 威力150</span></button>
        <button class="demo-tool" type="button" data-charge="heavy"><b>大型聚能</b><span>¥380 · 威力240</span></button>
        <button class="demo-tool" type="button" data-charge="cutter"><b>精密切割</b><span>¥140 · 威力74</span></button>
        <button class="demo-tool" type="button" data-charge="foam"><b>低震泡沫</b><span>¥190 · 威力108</span></button>
        <button class="demo-tool" type="button" data-charge="thermo"><b>温压弹</b><span>¥300 · 威力210</span></button>
        <div class="demo-tool-title">操作</div>
        <button class="demo-tool demo-undo" type="button" id="demoUndo"><b>撤销</b><span>退最后一处</span></button>
        <button class="demo-tool" type="button" id="demoDet"><b>起爆器</b><span>¥120 一次性</span></button>
        <button class="demo-tool demo-fire" type="button" id="demoFire"><b>起爆</b><span>装好后按</span></button>
      </div>
      <div class="demo-bar">
        <div class="demo-hud" id="demoHud"></div>
        <div class="demo-legend">装药后：<i class="lg-doom"></i>会炸毁 <i class="lg-hurt"></i>受损，虚线为影响范围；<i class="lg-pipe"></i>管线碰不得，<i class="lg-keep"></i>邻近建筑怕冲击波</div>
      </div>
      <div class="demo-settle" id="demoSettle" hidden>
        <label class="demo-row">清运比例 <input type="range" id="demoRemoval" min="0" max="100" step="5" value="60"><b id="demoRemovalVal">60%</b></label>
        <div class="demo-row" id="demoCleanCost">清运费用 ¥0</div>
        <div class="demo-row demo-settle-btns">
          <button class="game-btn demo-dust" type="button" id="demoDust">降尘 ¥110 · 剩3</button>
          <button class="game-btn" type="button" id="demoSettleBtn">结算验收</button>
        </div>
      </div>
      <div class="game-result" id="gameResult" hidden></div>

      ${historyHtml('demolition')}
    </div>`;
  return `
    <div class="game-wrap">
      <div class="game-head">
        <div class="game-status" id="gameStatus">你执 X，先手</div>
        <button id="gameReset" type="button" hidden></button>
      </div>
      ${difficultyHtml()}
      <div class="ttt-grid" id="tttGrid">
        ${Array.from({ length: 9 }, (_, i) => `<button class="ttt-cell" data-i="${i}" type="button" aria-label="第 ${i + 1} 格"></button>`).join('')}
        <svg class="ttt-line" id="tttLine" viewBox="0 0 3 3" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0" pathLength="1"></line></svg>
      </div>
      <div class="game-result" id="gameResult" hidden></div>
      <div class="game-tip">三子连线获胜，AI 不会放水</div>
      ${historyHtml('ttt')}
    </div>`;
}

/* ---------- 暂停 / 退出存档 ---------- */
const PAUSE_FLAG = 'minxtok.game.paused';
// 有的游戏用 rAF，有的用定时器；暂停时统一挂一个总闸
let gamePaused = false;
const realRaf = window.requestAnimationFrame.bind(window);

/* 游戏循环统一入口。
   以前离开游戏页时那些 frame/loop 还在每帧跑（有的还叠着两个循环），
   CPU 一直烧，聊天和滑动就掉帧。这里排下一帧前先确认游戏页还在。
   暂停时 window.requestAnimationFrame 已被 freezeFrames 替换成"扣住回调"，
   所以暂停分支要原样交给它，不能自己判活。 */
function gRaf(cb) {
  if (framesFrozen) return window.requestAnimationFrame(cb);
  if (!document.querySelector('.game-wrap')) return 0;
  return realRaf(function (t) {
    if (!document.querySelector('.game-wrap')) return;
    cb(t);
  });
}
let heldRaf = null;
let framesFrozen = false;

function freezeFrames() {
  if (framesFrozen) return;
  framesFrozen = true;
  window.requestAnimationFrame = (cb) => { heldRaf = cb; return 0; };
}
function thawFrames() {
  if (!framesFrozen) return;
  framesFrozen = false;
  window.requestAnimationFrame = realRaf;
  const cb = heldRaf;
  heldRaf = null;
  if (cb) realRaf(cb);
}

function mountPause(key, onSave) {
  const wrap = document.querySelector('.game-wrap');
  if (!wrap) return;
  if (typeof onSave === 'function') wrap.__save = onSave;
  const oldMask = document.querySelector('.game-pause');
  if (oldMask) oldMask.remove();
  const mask = document.createElement('div');
  mask.className = 'game-pause';
  mask.hidden = true;
  mask.style.animation = '';
  mask.innerHTML = `<div class="gp-card">
      <div class="gp-title">已暂停</div>
      <div class="gp-sub">退出会存下进度，回来接着打</div>
      <div class="gp-acts">
        <button class="game-btn" type="button" data-gp="resume">继续</button>
        <button class="game-btn" type="button" data-gp="again">重开一局</button>
        <button class="game-btn" type="button" data-gp="quit">保存并退出</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const apply = (on) => {
    gamePaused = on;
    if (on) {
      freezeFrames();
      mask.hidden = false;
      mask.classList.remove('closing');
      document.body.classList.add('game-paused');
      safeSet(PAUSE_FLAG, key);
    } else {
      thawFrames();
      mask.hidden = true;
      mask.classList.remove('closing');
      document.body.classList.remove('game-paused');
      safeSet(PAUSE_FLAG, '');
    }
  };
  wrap.__pause = apply;
  mask.querySelector('[data-gp="resume"]').addEventListener('click', () => apply(false));
  mask.querySelector('[data-gp="again"]').addEventListener('click', () => {
    apply(false);
    const r = wrap.querySelector('#gameReset');
    if (r) r.click();
  });
  mask.querySelector('[data-gp="quit"]').addEventListener('click', () => {
    if (typeof wrap.__save === 'function') wrap.__save();
    safeSet(PAUSE_FLAG, '');
    // 总闸必须归零，否则回来之后俄罗斯方块、贪吃蛇的定时器一辈子不触发
    gamePaused = false;
    thawFrames();
    document.body.classList.remove('game-paused');
    mask.remove();
    openGames(true);
  });
  // 退到别的页面时别把整站动画冻住
  const watch = setInterval(() => {
    if (!mask.isConnected || !document.querySelector('.game-wrap')) {
      thawFrames();
      document.body.classList.remove('game-paused');
      mask.remove();
      clearInterval(watch);
    }
  }, 500);
}

// 顶栏状态统一拆成卡片：一行的，绝不换行，横着滑
function cardifyStatus(el) {
  if (!el || el.__chips) return;
  el.__chips = true;
  let raw = el.textContent || '';
  Object.defineProperty(el, 'textContent', {
    configurable: true,
    get() { return raw; },
    set(v) {
      raw = v == null ? '' : String(v);
      const parts = raw.split(/\s*[·｜|]\s*/).filter(Boolean);
      el.innerHTML = parts.map((p) => {
        const m = p.match(/^(\D{1,7}?)\s+(.+)$/);
        if (m) return `<span class="gh-chip"><i>${m[1]}</i><b>${m[2]}</b></span>`;
        return `<span class="gh-chip"><b>${p}</b></span>`;
      }).join('');
    },
  });
  if (raw) el.textContent = raw;
}

// 结算弹窗点空白处就收起来
document.addEventListener('click', (e) => {
  const mask = e.target.closest && e.target.closest('.game-result.scored');
  if (!mask || e.target !== mask) return;
  mask.hidden = true;
}, false);

function bindGame(key) {
  activeGameKey = key;
  resultSig = '';
  cardifyStatus(document.getElementById('gameStatus'));
  if (key === 'runner') bindRunner();
  else if (key === 'maze') bindMaze();
  else if (key === 'pool') bindPool();
  else if (key === 'bowling') bindBowling();
  else if (key === 'squad') bindSquad();
  else if (key === 'demolition') bindDemolition();
  else if (key === 'gomoku') bindGomoku();
  else if (key === '2048') bind2048();
  else if (key === 'tetris') bindTetris();
  else if (key === 'snake') bindSnake();
  else if (key === 'pong') bindPong();
  else if (key === 'go') bindGo();
  else if (key === 'rush') bindRush();
  else if (key === 'spider') bindSpider();
  else if (key === 'memory') bindMemory();
  else if (key === 'minesweeper') bindMinesweeper();
  else if (key === 'klotski') bindKlotski();
  else bindTtt();
  setTimeout(() => mountPause(key), 60);
}

/* ---------------- 五子棋 ---------------- */
function bindGomoku() {
  const canvas = document.getElementById('gomokuCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const N = 15;
  let board = Array.from({ length: N }, () => Array(N).fill(0)); // 1 黑（你）2 白（AI）
  let over = false;
  let busy = false;
  let last = null;
  let gen = 0;
  let result = null;
  let winCells = null;
  let turn = 1;
  let recorded = false;
  let preview = null;   // 第一次点的位置：只出半透明预览子
  let lastBy = 0;       // 1=你 2=AI，只有 AI 的落子打点

  const showResult = (text, type, extra) => {
    result = text ? { text, type: type || '', stars: extra && extra.stars } : null;
    setGameResult(text, type, Object.assign({ score: type === 'win' ? 1 : 0 }, extra || {}));
    if (text && type && !recorded) {
      recorded = true;
      recordHistory('gomoku', { text: `${type === 'win' ? '胜' : '负'} · ${text}`, result: text });
    }
  };
  const persist = () => saveState('gomoku', { board, last, over, result, turn });

  const draw = () => {
    if (!canvas.isConnected) {
      window.removeEventListener('resize', draw);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 棋盘必须按正方形画：宽高取较小值，避免竖屏被拉伸后
    // 斜向间距和横竖间距看起来不一样。
    const size = Math.min(rect.width, rect.height);
    if (canvas.width !== Math.round(size * dpr) || canvas.height !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cell = size / N;
    const start = cell / 2;
    const end = size - cell / 2;

    const css = getComputedStyle(document.documentElement);
    const line = (css.getPropertyValue('--line-strong') || '#999').trim();
    const lineSoft = (css.getPropertyValue('--line') || '#ccc').trim();
    const accent = (css.getPropertyValue('--accent') || '#d97706').trim();

    ctx.lineWidth = 1;
    ctx.strokeStyle = lineSoft;
    for (let i = 0; i < N; i++) {
      const p = start + i * cell;
      ctx.beginPath(); ctx.moveTo(start, p); ctx.lineTo(end, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, start); ctx.lineTo(p, end); ctx.stroke();
    }
    ctx.fillStyle = line;
    [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(start + x * cell, start + y * cell, Math.max(1.6, cell * 0.075), 0, Math.PI * 2);
      ctx.fill();
    });

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = board[y][x];
      const isPreview = !v && preview && preview[0] === x && preview[1] === y;
      if (!v && !isPreview) continue;
      const cx = start + x * cell, cy = start + y * cell;
      const r = cell * 0.42;
      if (isPreview) {
        ctx.globalAlpha = .32;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#1c1c1e';
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.beginPath();
      ctx.arc(cx + 1.2, cy + 1.6, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = v === 1 ? '#1c1c1e' : '#f5f5f2';
      ctx.fill();
      ctx.strokeStyle = v === 1 ? '#000' : 'rgba(0,0,0,.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (winCells && winCells.length >= 2) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2.2, cell * 0.085);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      winCells.forEach(([x, y]) => {
        const cx = start + x * cell, cy = start + y * cell;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (last && lastBy === 2) {
      const cx = start + last[0] * cell, cy = start + last[1] * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2.2, cell * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
  };

  const inBoard = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
  const countLine = (x, y, color) => {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let best = 1;
    for (const [dx, dy] of dirs) {
      let c = 1;
      for (const s of [1, -1]) {
        let i = 1;
        while (true) {
          const nx = x + dx * i * s, ny = y + dy * i * s;
          if (!inBoard(nx, ny) || board[ny][nx] !== color) break;
          c++; i++;
        }
      }
      if (c > best) best = c;
    }
    return best;
  };

  const findWinCells = (x, y, color) => {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      const cells = [[x, y]];
      for (const s of [1, -1]) {
        let i = 1;
        while (true) {
          const nx = x + dx * i * s, ny = y + dy * i * s;
          if (!inBoard(nx, ny) || board[ny][nx] !== color) break;
          cells.push([nx, ny]); i++;
        }
      }
      if (cells.length >= 5) {
        cells.sort((a, b) => (a[0] * dx + a[1] * dy) - (b[0] * dx + b[1] * dy));
        return cells;
      }
    }
    return null;
  };

  const findAnyWin = () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (board[y][x]) {
        const cells = findWinCells(x, y, board[y][x]);
        if (cells) return cells;
      }
    }
    return null;
  };

  const pointScore = (x, y, color) => {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let total = 0;
    for (const [dx, dy] of dirs) {
      let c = 1, open = 0;
      for (const s of [1, -1]) {
        let i = 1;
        while (true) {
          const nx = x + dx * i * s, ny = y + dy * i * s;
          if (!inBoard(nx, ny) || board[ny][nx] !== color) break;
          c++; i++;
        }
        const nx = x + dx * i * s, ny = y + dy * i * s;
        if (inBoard(nx, ny) && board[ny][nx] === 0) open++;
      }
      if (c >= 5) total += 1e7;
      else if (c === 4) total += open === 2 ? 1e6 : open === 1 ? 1e5 : 0;
      else if (c === 3) total += open === 2 ? 1e4 : open === 1 ? 1e3 : 0;
      else if (c === 2) total += open === 2 ? 500 : open === 1 ? 100 : 0;
      else if (c === 1) total += open === 2 ? 10 : 0;
    }
    return total;
  };

  const candidates = () => {
    const out = [];
    let any = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (board[y][x]) any = true;
    if (!any) return [[7, 7]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (board[y][x]) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (inBoard(nx, ny) && board[ny][nx]) { near = true; break; }
      }
      if (near) out.push([x, y]);
    }
    return out;
  };

  const reset = () => {
    board = Array.from({ length: N }, () => Array(N).fill(0));
    gen++;
    over = false;
    busy = false;
    last = null;
    lastBy = 0;
    preview = null;
    winCells = null;
    turn = 1;
    recorded = false;
    showResult('', '');
    statusEl.textContent = '你执黑，先手';
    draw();
    persist();
  };

  const diff = initDifficulty('gomoku', () => reset());

  const aiMove = () => {
    if (over) return;
    busy = true;
    const my = ++gen;
    statusEl.textContent = 'AI 思考中…';
    setTimeout(() => {
      if (!canvas.isConnected || over || my !== gen) { busy = false; return; }
      const list = candidates();
      const scored = [];
      for (const [x, y] of list) {
        board[y][x] = 2;
        const winMe = countLine(x, y, 2) >= 5;
        board[y][x] = 0;
        board[y][x] = 1;
        const winOpp = countLine(x, y, 1) >= 5;
        board[y][x] = 0;
        let s = pointScore(x, y, 2) * 1.15 + pointScore(x, y, 1) * 0.95;
        if (winMe) s += 1e12;
        else if (winOpp) s += 1e11;
        s += (7 - Math.abs(x - 7)) + (7 - Math.abs(y - 7));
        scored.push({ x, y, s });
      }
      if (!scored.length) {
        over = true;
        turn = 1;
        statusEl.textContent = '和棋';
        showResult('棋盘下满，平局', '');
        busy = false;
        persist();
        return;
      }
      scored.sort((a, b) => b.s - a.s);
      const level = diff.get();
      let pick;
      if (level <= 1) {
        pick = scored[Math.floor(Math.random() * scored.length)];
      } else {
        const poolSize = level === 2 ? 8 : level === 3 ? 5 : level === 4 ? 2 : 1;
        const pool = scored.slice(0, Math.min(poolSize, scored.length));
        pick = pool[Math.floor(Math.random() * pool.length)];
      }
      board[pick.y][pick.x] = 2;
      last = [pick.x, pick.y];
      lastBy = 2;
      const combo = findWinCells(pick.x, pick.y, 2);
      if (combo) winCells = combo;
      draw();
      turn = 1;
      if (combo) {
        over = true;
        statusEl.textContent = 'AI 连成五子，你输了';
        showResult('AI 连成五子，你输了', 'lose');
      } else {
        statusEl.textContent = '轮到你了';
      }
      busy = false;
      persist();
    }, 140);
  };

  const play = (x, y) => {
    if (over || busy || board[y][x]) return;
    board[y][x] = 1;
    last = [x, y];
    lastBy = 1;
    preview = null;
    turn = 2;
    const combo = findWinCells(x, y, 1);
    if (combo) winCells = combo;
    draw();
    if (combo) {
      over = true;
      turn = 1;
      statusEl.textContent = '五子连珠，你赢了';
      showResult('五子连珠，你赢了', 'win');
      persist();
      return;
    }
    persist();
    aiMove();
  };

  const onTap = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.min(rect.width, rect.height);
    const offsetX = (rect.width - size) / 2;
    const offsetY = (rect.height - size) / 2;
    const cell = size / N;
    const x = Math.round((e.clientX - rect.left - offsetX) / cell - 0.5);
    const y = Math.round((e.clientY - rect.top - offsetY) / cell - 0.5);
    if (!inBoard(x, y)) return;
    if (board[y][x]) return;
    // 先出半透明预览子，再点同一个位置才真正落子，避免误触
    if (!preview || preview[0] !== x || preview[1] !== y) {
      preview = [x, y];
      draw();
      persist();
      return;
    }
    play(x, y);
  };

  canvas.addEventListener('click', onTap);
  resetBtn.addEventListener('click', () => reset());
  window.addEventListener('resize', draw);

  const saved = loadState('gomoku');
  const valid = saved && Array.isArray(saved.board) && saved.board.length === N
    && saved.board.every(row => Array.isArray(row) && row.length === N);
  if (valid) {
    board = saved.board.map(row => row.map(v => (v === 1 || v === 2 ? v : 0)));
    last = Array.isArray(saved.last) && saved.last.length === 2 ? saved.last : null;
    over = !!saved.over;
    recorded = over;
    turn = saved.turn === 2 ? 2 : 1;
    winCells = over ? findAnyWin() : null;
    if (saved.result && saved.result.text) showResult(saved.result.text, saved.result.type);
    else if (over) showResult('上一局已结束，退回菜单可以重开一局', '');
    statusEl.textContent = over ? '上一局已结束，退回菜单可以重开一局' : (turn === 2 ? 'AI 思考中…' : '继续上一局，轮到你');
  } else {
    statusEl.textContent = '你执黑，先手';
  }
  gRaf(draw);
  if (turn === 2 && !over) setTimeout(aiMove, 220);
}

/* ---------------- 2048 ---------------- */
function bind2048() {
  const boardEl = document.getElementById('g2048Board');
  const scoreEl = document.getElementById('g2048Score');
  const bestEl = document.getElementById('g2048Best');
  const targetEl = document.getElementById('g2048Target');
  const resetBtn = document.getElementById('gameReset');
  if (!boardEl) return;
  const SIZE = 4;
  let grid = Array(SIZE * SIZE).fill(0);
  let score = 0;
  let over = false;
  let won = false;
  let result = null;
  let best = 0;
  let recorded = false;
  try { best = Number(localStorage.getItem('minxtok.2048best') || 0) || 0; } catch (_) {}

  const starFor = (max) => max >= 2048 ? 3 : max >= 1024 ? 2 : max >= 512 ? 1 : 0;
  const showResult = (text, type, extra) => {
    result = text ? { text, type: type || '', stars: extra && extra.stars } : null;
    setGameResult(text, type, Object.assign({ score }, extra || {}));
    if (text && type && !recorded) {
      recorded = true;
      recordHistory('2048', { score, text: `得分 ${score}` });
    }
  };
  const persist = () => saveState('2048', { grid, score, over, won, result });

  const cells = Array.from({ length: 16 }, () => {
    const d = document.createElement('div');
    d.className = 'g2048-cell';
    boardEl.appendChild(d);
    return d;
  });

  const empty = () => {
    const out = [];
    grid.forEach((v, i) => { if (!v) out.push(i); });
    return out;
  };

  const addTile = () => {
    const es = empty();
    if (!es.length) return;
    const i = es[Math.floor(Math.random() * es.length)];
    const level = diff.get();
    const fourChance = [0.10, 0.20, 0.25, 0.40, 0.50][level - 1];
    grid[i] = Math.random() < (Number.isFinite(fourChance) ? fourChance : 0.25) ? 4 : 2;
  };

  const render = () => {
    for (let i = 0; i < 16; i++) {
      const v = grid[i];
      const el = cells[i];
      el.textContent = v || '';
      el.className = 'g2048-cell' + (v ? ` v${v > 2048 ? 'super' : v}` : '');
    }
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      try { localStorage.setItem('minxtok.2048best', String(best)); } catch (_) {}
    }
    // 这栏要的是场上最大的块，不是最高分
    bestEl.textContent = grid.reduce((m, v) => Math.max(m, v || 0), 0) || 2;
    // 星级对应目标：一星 512，二星 1024，三至五星 2048 / 4096 / 8192
    const target = [512, 1024, 2048, 4096, 8192][diff.get() - 1] || 1024;
    if (targetEl) targetEl.textContent = target;
    const max = grid.reduce((m, v) => Math.max(m, v || 0), 0);
    const stars = starFor(max);
    if (!won && max >= target) {
      won = true;
      showResult(`凑出 ${target}，你赢了`, 'win', { stars: Math.max(1, stars) });
    } else if (won && stars > ((result && result.stars) || 0)) {
      // 赢下目标后继续合出更大的块，星级跟着升，不重复记分
      showResult(`凑出 ${max}，${['', '一', '二', '三'][stars]}星通关`, 'win', { stars, noPoints: true });
    }
    persist();
  };

  const slide = (line) => {
    const vals = line.filter(v => v);
    const out = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) {
        const v = vals[i] * 2;
        out.push(v);
        gained += v;
        i++;
      } else out.push(vals[i]);
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained };
  };

  const canMove = () => {
    if (empty().length) return true;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const v = grid[y * SIZE + x];
      if (x + 1 < SIZE && grid[y * SIZE + x + 1] === v) return true;
      if (y + 1 < SIZE && grid[(y + 1) * SIZE + x] === v) return true;
    }
    return false;
  };

  const move = (dir) => {
    if (over) return;
    const before = grid.join(',');
    let gained = 0;
    for (let i = 0; i < SIZE; i++) {
      const idx = [];
      for (let j = 0; j < SIZE; j++) {
        if (dir === 'left') idx.push(i * SIZE + j);
        else if (dir === 'right') idx.push(i * SIZE + (SIZE - 1 - j));
        else if (dir === 'up') idx.push(j * SIZE + i);
        else idx.push((SIZE - 1 - j) * SIZE + i);
      }
      const line = idx.map(k => grid[k]);
      const r = slide(line);
      gained += r.gained;
      idx.forEach((k, j) => { grid[k] = r.line[j]; });
    }
    if (grid.join(',') === before) return;
    score += gained;
    addTile();
    render();
    if (!canMove()) {
      over = true;
      const max = grid.reduce((m, v) => Math.max(m, v || 0), 0);
      const stars = starFor(max);
      showResult(won ? `这局结束，得分 ${score}` : `走不动了，得分 ${score}，退回菜单可以重开一局`, won ? 'win' : 'lose', { stars, noPoints: won });
      persist();
    }
  };

  let reset;
  const diff = initDifficulty('2048', () => reset(true));
  reset = (fromDifficulty) => {
    grid = Array(SIZE * SIZE).fill(0);
    score = 0;
    over = false;
    won = false;
    recorded = false;
    showResult('', '');
    const level = diff.get();
    const startCount = level === 1 ? 4 : level === 2 ? 3 : 2;
    for (let i = 0; i < startCount; i++) addTile();
    render();
    if (fromDifficulty) persist();
    boardEl.focus({ preventScroll: true });
  };

  let sx = 0, sy = 0, tracking = false;
  boardEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY; tracking = true;
  }, { passive: true });
  boardEl.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  boardEl.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (!map[e.key]) return;
    e.preventDefault();
    move(map[e.key]);
  });

  resetBtn.addEventListener('click', () => reset(false));

  const saved = loadState('2048');
  if (saved && Array.isArray(saved.grid) && saved.grid.length === 16) {
    grid = saved.grid.map(v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0));
    score = Number.isFinite(saved.score) ? saved.score : 0;
    over = !!saved.over;
    won = !!saved.won;
    recorded = over;
    result = saved.result && typeof saved.result.text === 'string' ? saved.result : null;
    render();
    if (result) {
      const max = grid.reduce((m, v) => Math.max(m, v || 0), 0);
      showResult(result.text, result.type, { stars: Number.isFinite(result.stars) ? result.stars : starFor(max), noPoints: true });
    }
    else if (over) {
      const max = grid.reduce((m, v) => Math.max(m, v || 0), 0);
      showResult(won ? `上一局结束，得分 ${score}` : `上一局走不动了，得分 ${score}`, won ? 'win' : 'lose', { stars: starFor(max), noPoints: true });
    }
    persist();
  } else {
    reset(false);
  }
}

/* ---------------- 井字棋 ---------------- */
function bindTtt() {
  const gridEl = document.getElementById('tttGrid');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!gridEl || !statusEl) return;
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M29 29 L71 71 M71 29 L29 71"/></svg>';
  const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="22"/></svg>';
  let b = Array(9).fill('');
  let over = false;
  let busy = false;
  let gen = 0;
  let result = null;
  let turn = 'X';
  let recorded = false;

  const showResult = (text, type) => {
    result = text ? { text, type: type || '' } : null;
    setGameResult(text, type, { score: type === 'win' ? 1 : 0 });
    if (text && type && !recorded) {
      recorded = true;
      recordHistory('ttt', { text, result: text });
    }
  };
  const persist = () => saveState('ttt', { b, over, result, turn });

  const winCombo = (x) => {
    for (const combo of LINES) {
      const [a, c, d] = combo;
      if (x[a] && x[a] === x[c] && x[a] === x[d]) return combo;
    }
    return null;
  };
  const winner = (x) => {
    const combo = winCombo(x);
    if (combo) return x[combo[0]];
    return x.every(v => v) ? 'draw' : '';
  };

  const lineEl = document.getElementById('tttLine');
  const line = lineEl ? lineEl.querySelector('line') : null;
  const clearWin = () => {
    if (lineEl) lineEl.classList.remove('show');
    gridEl.querySelectorAll('.ttt-cell.win').forEach(el => el.classList.remove('win'));
  };
  const showWin = (combo, who) => {
    if (!combo || !lineEl || !line) return;
    lineEl.classList.remove('show');
    lineEl.classList.toggle('you', who === 'X');
    lineEl.classList.toggle('ai', who === 'O');
    const p = (i) => [i % 3 + 0.5, Math.floor(i / 3) + 0.5];
    const [x1, y1] = p(combo[0]);
    const [x2, y2] = p(combo[2]);
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    void lineEl.getBoundingClientRect();
    lineEl.classList.add('show');
    combo.forEach(i => {
      const cell = gridEl.querySelector(`.ttt-cell[data-i="${i}"]`);
      if (cell) {
        cell.classList.add('win');
        cell.classList.toggle('you', who === 'X');
        cell.classList.toggle('ai', who === 'O');
      }
    });
  };

  const render = () => {
    gridEl.querySelectorAll('.ttt-cell').forEach((el, i) => {
      const v = b[i];
      if (el.dataset.mark !== (v || '')) {
        el.innerHTML = v === 'X' ? X_SVG : v === 'O' ? O_SVG : '';
        el.dataset.mark = v || '';
      }
      el.classList.toggle('x', v === 'X');
      el.classList.toggle('o', v === 'O');
      el.disabled = !!v || over || busy;
      el.setAttribute('aria-label', v ? `第 ${i + 1} 格 ${v}` : `第 ${i + 1} 格`);
    });
  };

  const minimax = (state, isAI, depth) => {
    const w = winner(state);
    if (w === 'O') return 10 - depth;
    if (w === 'X') return depth - 10;
    if (w === 'draw') return 0;
    let best = isAI ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (state[i]) continue;
      state[i] = isAI ? 'O' : 'X';
      const s = minimax(state, !isAI, depth + 1);
      state[i] = '';
      best = isAI ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  };

  const after = () => {
    const combo = winCombo(b);
    const w = combo ? b[combo[0]] : (b.every(v => v) ? 'draw' : '');
    over = false;
    turn = 'X';
    if (w === 'X') { over = true; statusEl.textContent = '你赢了'; showResult('你赢了', 'win'); }
    else if (w === 'O') { over = true; statusEl.textContent = 'AI 赢了'; showResult('AI 赢了', 'lose'); }
    else if (w === 'draw') { over = true; statusEl.textContent = '平局'; showResult('平局', ''); }
    else { statusEl.textContent = '轮到你了'; showResult('', ''); }
    render();
    if (combo) showWin(combo, b[combo[0]]);
    persist();
  };

  const aiMove = () => {
    if (over) return;
    busy = true;
    const my = ++gen;
    statusEl.textContent = 'AI 思考中…';
    setTimeout(() => {
      if (!gridEl.isConnected || over || my !== gen) { busy = false; return; }
      const empty = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      let choice = -1;
      const level = diff.get();
      const randomChance = level === 1 ? 1 : level === 2 ? 0.55 : level === 3 ? 0.35 : level === 4 ? 0.15 : 0;
      if (empty.length && randomChance && Math.random() < randomChance) {
        choice = empty[Math.floor(Math.random() * empty.length)];
      } else {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
          if (b[i]) continue;
          b[i] = 'O';
          const s = minimax(b, false, 0);
          b[i] = '';
          if (s > best) { best = s; choice = i; }
        }
      }
      if (choice >= 0) b[choice] = 'O';
      busy = false;
      after();
    }, 150);
  };

  let reset;
  const diff = initDifficulty('ttt', () => reset());
  reset = () => {
    gen++;
    b = Array(9).fill('');
    over = false;
    busy = false;
    turn = 'X';
    recorded = false;
    clearWin();
    showResult('', '');
    statusEl.textContent = '你执 X，先手';
    render();
    persist();
  };

  gridEl.querySelectorAll('.ttt-cell').forEach(el => {
    el.addEventListener('click', () => {
      if (over || busy) return;
      const i = Number(el.dataset.i);
      if (b[i]) return;
      b[i] = 'X';
      render();
      if (winCombo(b)) { after(); return; }
      turn = 'O';
      persist();
      aiMove();
    });
  });

  resetBtn.addEventListener('click', () => reset());

  const saved = loadState('ttt');
  if (saved && Array.isArray(saved.b) && saved.b.length === 9) {
    b = saved.b.map(v => (v === 'X' || v === 'O' ? v : ''));
    over = false;
    recorded = !!saved.result;
    const resumeTurn = saved.turn === 'O' ? 'O' : 'X';
    after();
    if (resumeTurn === 'O' && !over) { turn = 'O'; persist(); aiMove(); }
  } else {
    render();
  }
}

/* ---------------- 俄罗斯方块 ---------------- */
function bindTetris() {
  const canvas = document.getElementById('tetrisCanvas');
  const nextCanvas = document.getElementById('tetrisNext');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !nextCanvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const nctx = nextCanvas.getContext('2d');
  const COLS = 10, ROWS = 20, CELL = 22;
  const PIECES = [
    { color: '#7ad0ff', cells: [[1, 1, 1, 1]] },
    { color: '#ffd66b', cells: [[1, 1], [1, 1]] },
    { color: '#c79bff', cells: [[0, 1, 0], [1, 1, 1]] },
    { color: '#8ee6a8', cells: [[0, 1, 1], [1, 1, 0]] },
    { color: '#ff9c9c', cells: [[1, 1, 0], [0, 1, 1]] },
    { color: '#8fb8ff', cells: [[1, 0, 0], [1, 1, 1]] },
    { color: '#ffbe7a', cells: [[0, 0, 1], [1, 1, 1]] },
  ];
  const empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(''));
  let board = empty();
  let piece = null;
  let nextPiece = null;
  let score = 0;
  let over = false;
  let timer = null;
  let level = 2;
  let resultText = '';
  let recorded = false;

  const clone = (m) => m.map(row => row.slice());
  const rotate = (m) => m[0].map((_, i) => m.map(row => row[i]).reverse());
  const pickPiece = () => {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    return { cells: clone(p.cells), color: p.color };
  };
  const collide = (cells, px, py) => {
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
      if (!cells[y][x]) continue;
      const nx = px + x, ny = py + y;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
    return false;
  };
  const spawn = () => {
    piece = nextPiece || pickPiece();
    nextPiece = pickPiece();
    piece.x = Math.floor((COLS - piece.cells[0].length) / 2);
    piece.y = 0;
    drawNext();
    if (collide(piece.cells, piece.x, piece.y)) gameOver();
  };
  const merge = () => {
    piece.cells.forEach((row, y) => row.forEach((v, x) => {
      if (v && piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.color;
    }));
  };
  const clearLines = () => {
    let lines = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(''));
        lines++;
        y++;
      }
    }
    if (lines) score += [0, 100, 300, 500, 800][lines] * (level >= 4 ? 2 : 1);
  };
  const updateStatus = () => {
    if (statusEl) statusEl.textContent = `得分 ${score}`;
  };
  const snapshot = () => ({
    board: clone(board),
    piece: piece ? { cells: clone(piece.cells), color: piece.color, x: piece.x, y: piece.y } : null,
    nextPiece: nextPiece ? { cells: clone(nextPiece.cells), color: nextPiece.color } : null,
    score, over, result: resultText,
  });
  const save = makeSaver('tetris', snapshot, 320);
  bindLifecycle(canvas, save);

  const gameOver = () => {
    over = true;
    piece = null;
    clearInterval(timer);
    timer = null;
    resultText = `这局结束，得分 ${score}，退回菜单可以重开一局`;
    const tetCost = revivePts('tetris', Math.round(score / 10));
    setGameResult(resultText, 'lose', {
      score,
      noPoints: true,
      reviveLabel: `复活 · ${tetCost} 积分`,
      revive: () => {
        if (!ptsSpendTotal(tetCost)) { toast('积分不够复活'); return; }
        // 拆掉最下面六行，留口气接着堆
        for (let y = Math.max(0, ROWS - 6); y < ROWS; y++) board[y] = Array(COLS).fill('');
        over = false;
        recorded = false;
        resultText = '';
        piece = null;
        setGameResult('', '');
        spawn();
        restartTimer();
        updateStatus();
        render();
        save(true);
      },
    });
    updateStatus();
    if (!recorded) {
      recorded = true;
      recordHistory('tetris', { score, text: `得分 ${score}` });
    }
    save(true);
  };
  const restartTimer = () => {
    clearInterval(timer);
    if (over) return;
    // 低难度保持宽松，高难度明显加速
    const speed = Math.max(120, 920 - (level - 1) * 180);
    timer = setInterval(() => {
      if (!canvas.isConnected) { clearInterval(timer); return; }
      if (gamePaused || over) return;
      step(false);
    }, speed);
  };
  const step = (manual) => {
    if (over || !piece || gamePaused) return;
    if (!collide(piece.cells, piece.x, piece.y + 1)) {
      piece.y++;
    } else {
      merge();
      clearLines();
      spawn();
    }
    updateStatus();
    render();
    if (manual) restartTimer();
    save();
  };
  const move = (dx) => {
    if (over || !piece) return;
    if (!collide(piece.cells, piece.x + dx, piece.y)) {
      piece.x += dx;
      render();
      save();
    }
  };
  const doRotate = () => {
    if (over || !piece) return;
    const next = rotate(piece.cells);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collide(next, piece.x + kick, piece.y)) {
        piece.cells = next;
        piece.x += kick;
        render();
        save();
        return;
      }
    }
  };
  const hardDrop = () => {
    if (over || !piece) return;
    let gy = piece.y;
    while (!collide(piece.cells, piece.x, gy + 1)) gy++;
    piece.y = gy;
    merge();
    clearLines();
    spawn();
    updateStatus();
    render();
    restartTimer();
    save();
  };

  const roundRect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  const drawCell = (c, x, y, color, alpha = 1) => {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    roundRect(c, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 4);
    c.fill();
    c.globalAlpha = 1;
  };
  const render = () => {
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (board[y][x]) drawCell(ctx, x * CELL, y * CELL, board[y][x]);
    }
    if (piece) {
      let ghostY = piece.y;
      while (!collide(piece.cells, piece.x, ghostY + 1)) ghostY++;
      if (ghostY > piece.y) piece.cells.forEach((row, y) => row.forEach((v, x) => {
        if (v) drawCell(ctx, (piece.x + x) * CELL, (ghostY + y) * CELL, piece.color, 0.16);
      }));
      piece.cells.forEach((row, y) => row.forEach((v, x) => {
        if (v) drawCell(ctx, (piece.x + x) * CELL, (piece.y + y) * CELL, piece.color);
      }));
    }
  };
  const drawNext = () => {
    nctx.clearRect(0, 0, 84, 84);
    if (!nextPiece) return;
    const m = nextPiece.cells;
    const s = 16;
    const ox = (84 - m[0].length * s) / 2;
    const oy = (84 - m.length * s) / 2;
    m.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      nctx.fillStyle = nextPiece.color;
      roundRect(nctx, ox + x * s + 1.5, oy + y * s + 1.5, s - 3, s - 3, 3);
      nctx.fill();
    }));
  };

  const reset = () => {
    board = empty();
    score = 0;
    over = false;
    resultText = '';
    recorded = false;
    piece = null;
    setGameResult('', '');
    nextPiece = pickPiece();
    spawn();
    updateStatus();
    render();
    restartTimer();
    save(true);
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('tetris', (n) => { level = n; reset(); });
  level = diff.get();

  const pad = document.querySelector('.tetris-pad');
  if (pad) pad.addEventListener('contextmenu', (e) => e.preventDefault());
  document.querySelectorAll('.tetris-pad .pad-btn').forEach(btn => btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    if (act === 'left') move(-1);
    else if (act === 'right') move(1);
    else if (act === 'rotate') doRotate();
    else if (act === 'down') step(true);
    else if (act === 'drop') hardDrop();
  }));

  let sx = 0, sy = 0, tracking = false;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; });
  canvas.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) { doRotate(); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy > 0) step(true);
  });
  const onKey = (e) => {
    if (!canvas.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); doRotate(); }
    else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); hardDrop(); }
  };
  window.addEventListener('keydown', onKey);

  const saved = loadState('tetris');
  const validBoard = saved && Array.isArray(saved.board) && saved.board.length === ROWS
    && saved.board.every(row => Array.isArray(row) && row.length === COLS);
  const validShape = (p) => p && Array.isArray(p.cells) && p.cells.length
    && p.cells.every(row => Array.isArray(row) && row.length)
    && typeof p.color === 'string';
  const validPiece = (p) => validShape(p) && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (validBoard) {
    board = saved.board.map(row => row.map(v => (typeof v === 'string' ? v : '')));
    piece = validPiece(saved.piece) ? {
      cells: saved.piece.cells.map(row => row.map(v => (v ? 1 : 0))),
      color: saved.piece.color, x: saved.piece.x, y: saved.piece.y,
    } : null;
    nextPiece = validShape(saved.nextPiece) ? {
      cells: saved.nextPiece.cells.map(row => row.map(v => (v ? 1 : 0))),
      color: saved.nextPiece.color,
    } : null;
    score = Number.isFinite(saved.score) ? saved.score : 0;
    over = !!saved.over;
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    drawNext();
    if (!over && !piece) spawn();
    if (!over && !nextPiece) { nextPiece = pickPiece(); drawNext(); }
    updateStatus();
    render();
    if (over) setGameResult(resultText || `上一局结束，得分 ${score}，退回菜单可以重开一局`, 'lose', { score });
    else restartTimer();
    save(true);
  } else {
    reset();
  }
}

/* ---------------- 贪吃蛇 ---------------- */
function bindSnake() {
  const canvas = document.getElementById('snakeCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const N = 20, CELL = 18;
  const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  let snake = [];
  let dir = { x: 1, y: 0 };
  let queued = null;
  let aiSnake = [];
  let aiDir = { x: -1, y: 0 };
  let food = { x: 0, y: 0 };
  let score = 0;
  let over = false;
  let timer = null;
  let level = 2;
  let resultText = '';
  let recorded = false;
  let edge = null;

  const same = (a, b) => a.x === b.x && a.y === b.y;
  const occupied = () => {
    const set = new Set();
    snake.forEach(s => set.add(s.x + ',' + s.y));
    aiSnake.forEach(s => set.add(s.x + ',' + s.y));
    return set;
  };
  const vacant = () => {
    const occ = occupied();
    const free = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!occ.has(x + ',' + y)) free.push({ x, y });
    }
    return free;
  };
  const placeFood = () => {
    const free = vacant();
    food = free.length ? free[Math.floor(Math.random() * free.length)] : { x: -1, y: -1 };
  };
  const snapshot = () => ({
    snake: snake.map(s => ({ x: s.x, y: s.y })),
    ai: aiSnake.map(s => ({ x: s.x, y: s.y })),
    dir: Object.assign({}, dir),
    aiDir: Object.assign({}, aiDir),
    queued,
    food: Object.assign({}, food),
    score, over, result: resultText,
  });
  const save = makeSaver('snake', snapshot, 320);
  bindLifecycle(canvas, save);

  const pointsFor = (len) => Math.max(2, Math.round(len * 2));

  const finish = (kind, why) => {
    if (over) return;
    over = true;
    edge = null;
    clearTimeout(timer);
    timer = null;
    const len = snake.length;
    const aiLen = aiSnake.length;
    const pts = pointsFor(len);
    resultText = kind === 'win'
      ? `${why} · 你赢了 · 你的长度 ${len}，对手 ${aiLen}`
      : kind === 'draw'
        ? `${why} · 平局 · 双方长度 ${len}`
        : `${why} · 你的长度 ${len}，对手 ${aiLen} · 得 ${pts} 积分`;
    const rvCost = revivePts('snake', pts);
    setGameResult(resultText, kind === 'win' ? 'win' : kind === 'draw' ? '' : 'lose', {
      score: pts,
      reviveLabel: kind === 'lose' ? `复活 · ${rvCost} 积分` : undefined,
      revive: kind === 'lose' ? () => {
        if (!ptsSpendTotal(rvCost)) { toast('积分不够复活'); return; }
        const cx = Math.floor(N / 2), cy = Math.floor(N / 2);
        snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        dir = { x: 1, y: 0 };
        queued = null;
        edge = null;
        over = false;
        recorded = false;
        resultText = '';
        if (!aiSnake.length) spawnAi();
        paint();
        setGameResult('', '');
        render();
        save(true);
        schedule(700);
      } : undefined,
    });
    if (!recorded) {
      recorded = true;
      recordHistory('snake', { score: pts, text: `长度 ${len} · 对手 ${aiLen}` });
    }
    save(true);
  };

  const paint = () => {
    statusEl.textContent = gamesEn()
      ? `You ${snake.length} · AI ${aiSnake.length} · length scores points`
      : `你 ${snake.length} · 对手 ${aiSnake.length} · 长度换积分`;
  };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const cellOf = (s, fill, radius) => {
    ctx.fillStyle = fill;
    roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, radius);
    ctx.fill();
  };
  const render = () => {
    ctx.clearRect(0, 0, N * CELL, N * CELL);
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fillRect(0, 0, N * CELL, N * CELL);
    if (food.x >= 0) {
      ctx.fillStyle = '#ff9c9c';
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    aiSnake.forEach((s, i) => cellOf(s, i === 0 ? '#ffb072' : 'rgba(255,176,114,.55)', 5));
    snake.forEach((s, i) => cellOf(s, i === 0 ? '#8fb8ff' : 'rgba(143,184,255,.62)', 5));
    if (edge) {
      ctx.strokeStyle = 'rgba(255,120,120,.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, N * CELL - 3, N * CELL - 3);
    }
  };
  const speedNow = () => Math.max(140, 300 - (level - 1) * 35);
  const graceMs = () => [520, 420, 330, 250, 180][level - 1] || 420;
  const schedule = (wait) => {
    clearTimeout(timer);
    if (over) return;
    const delay = typeof wait === 'number' ? wait : speedNow();
    timer = setTimeout(() => {
      if (!canvas.isConnected) return;
      if (gamePaused) { schedule(140); return; }
      tick();
    }, delay);
  };

  // 对手走位：先排除会死的方向，再按「离食物近 + 留出的空地问」挑一个
  const aiPickDir = () => {
    if (!aiSnake.length) return aiDir;
    const head = aiSnake[0];
    const bad = new Set();
    snake.forEach(s => bad.add(s.x + ',' + s.y));
    aiSnake.slice(0, aiSnake.length - 1).forEach(s => bad.add(s.x + ',' + s.y));
    const room = (from) => {
      const seen = new Set([from.x + ',' + from.y]);
      const q = [from];
      let n = 0;
      while (q.length && n < 80) {
        const c = q.shift();
        n += 1;
        for (const d of DIRS) {
          const p = { x: c.x + d.x, y: c.y + d.y };
          const k = p.x + ',' + p.y;
          if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N) continue;
          if (bad.has(k) || seen.has(k)) continue;
          seen.add(k);
          q.push(p);
        }
      }
      return n;
    };
    const opt = [];
    for (const d of DIRS) {
      if (d.x === -aiDir.x && d.y === -aiDir.y) continue;
      const p = { x: head.x + d.x, y: head.y + d.y };
      if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N) continue;
      if (bad.has(p.x + ',' + p.y)) continue;
      const dist = food.x >= 0 ? Math.abs(p.x - food.x) + Math.abs(p.y - food.y) : 0;
      opt.push({ d, sc: -dist * 3 + Math.min(room(p), 80) * 2.4 });
    }
    if (!opt.length) return aiDir;
    // 低星对手会犯迷糊，偶尔随便挑一个安全方向
    const sloppy = [0.5, 0.32, 0.18, 0.08, 0.02][level - 1] || 0.3;
    if (Math.random() < sloppy) return opt[Math.floor(Math.random() * opt.length)].d;
    opt.sort((a, b) => b.sc - a.sc);
    return opt[0].d;
  };

  const tick = () => {
    if (over) return;
    const now = Date.now();
    if (edge && now >= edge.until) {
      finish('lose', '没来得及转向，撞墙了');
      render();
      return;
    }
    if (queued) {
      if (queued.x !== -dir.x || queued.y !== -dir.y) dir = queued;
      queued = null;
    }
    aiDir = aiPickDir();

    const ph = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const ah = aiSnake.length ? { x: aiSnake[0].x + aiDir.x, y: aiSnake[0].y + aiDir.y } : null;

    // 两颗头进同一格 —— 平局
    if (ah && same(ph, ah)) {
      finish('draw', '头碰头');
      render();
      return;
    }

    const out = ph.x < 0 || ph.y < 0 || ph.x >= N || ph.y >= N;
    if (out) {
      if (!edge) {
        edge = { x: dir.x, y: dir.y, until: now + graceMs() };
        statusEl.textContent = '边界缓冲，快转向';
        render();
        save();
        schedule(Math.min(speedNow(), Math.max(60, edge.until - Date.now())));
        return;
      }
      finish('lose', '撞墙了');
      render();
      return;
    }
    edge = null;

    const pSelf = snake.slice(0, Math.max(1, snake.length - 1)).some(s => same(s, ph));
    const pHitAi = aiSnake.some(s => same(s, ph));
    const aiOut = !!ah && (ah.x < 0 || ah.y < 0 || ah.x >= N || ah.y >= N);
    const aiSelf = !!ah && (
      aiSnake.slice(0, Math.max(1, aiSnake.length - 1)).some(s => same(s, ah)) ||
      snake.some(s => same(s, ah))
    );
    const pDead = pSelf || pHitAi;
    const aDead = aiOut || aiSelf;

    if (pDead && aDead) { finish('draw', '同时撞上'); render(); return; }
    if (pDead) { finish('lose', pHitAi ? '撞到对手身上了' : '撞到自己了'); render(); return; }
    if (aDead) { finish('win', aiOut ? '对手撞墙了' : '对手撞到蛇身上了'); render(); return; }

    snake.unshift(ph);
    const eatP = same(ph, food);
    if (eatP) score += 10;
    else snake.pop();

    if (ah) {
      aiSnake.unshift(ah);
      const eatA = same(ah, food);
      if (!eatA) aiSnake.pop();
    }
    if (eatP || (ah && same(ah, food))) placeFood();

    paint();
    render();
    save();
    schedule();
  };
  const turn = (x, y) => {
    if (over) return;
    if (x === -dir.x && y === -dir.y) return;
    if (edge) {
      if (x === edge.x && y === edge.y) return;
      edge = null;
      queued = { x, y };
      clearTimeout(timer);
      tick();
      return;
    }
    queued = { x, y };
    save();
  };

  const spawnAi = () => {
    const y = N - 5;
    aiSnake = [{ x: N - 4, y }, { x: N - 3, y }, { x: N - 2, y }];
    aiDir = { x: -1, y: 0 };
  };
  const reset = () => {
    clearTimeout(timer);
    edge = null;
    snake = [{ x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }];
    dir = { x: 1, y: 0 };
    queued = null;
    score = 0;
    over = false;
    resultText = '';
    recorded = false;
    spawnAi();
    setGameResult('', '');
    paint();
    placeFood();
    render();
    schedule();
    save(true);
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('snake', (n) => { level = n; reset(); });
  level = diff.get();

  const pad = document.querySelector('.snake-pad');
  if (pad) pad.addEventListener('contextmenu', (e) => e.preventDefault());
  document.querySelectorAll('.snake-pad .pad-btn').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.act;
    if (a === 'up') turn(0, -1);
    else if (a === 'down') turn(0, 1);
    else if (a === 'left') turn(-1, 0);
    else if (a === 'right') turn(1, 0);
  }));

  let sx = 0, sy = 0, tracking = false;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; });
  canvas.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
  });
  const onKey = (e) => {
    if (!canvas.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); turn(0, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); turn(0, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); turn(1, 0); }
  };
  window.addEventListener('keydown', onKey);

  const saved = loadState('snake');
  const validSnake = saved && Array.isArray(saved.snake) && saved.snake.length
    && saved.snake.every(s => s && Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.y >= 0 && s.x < N && s.y < N);
  if (validSnake) {
    snake = saved.snake.map(s => ({ x: s.x, y: s.y }));
    dir = saved.dir && Number.isFinite(saved.dir.x) && Number.isFinite(saved.dir.y) ? { x: saved.dir.x, y: saved.dir.y } : { x: 1, y: 0 };
    queued = saved.queued && Number.isFinite(saved.queued.x) && Number.isFinite(saved.queued.y) ? { x: saved.queued.x, y: saved.queued.y } : null;
    food = saved.food && Number.isInteger(saved.food.x) && Number.isInteger(saved.food.y) ? { x: saved.food.x, y: saved.food.y } : { x: 0, y: 0 };
    score = Number.isFinite(saved.score) ? saved.score : 0;
    over = !!saved.over;
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    if (Array.isArray(saved.ai) && saved.ai.length
      && saved.ai.every(s => s && Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.y >= 0 && s.x < N && s.y < N)) {
      aiSnake = saved.ai.map(s => ({ x: s.x, y: s.y }));
      aiDir = saved.aiDir && Number.isFinite(saved.aiDir.x) && Number.isFinite(saved.aiDir.y) ? { x: saved.aiDir.x, y: saved.aiDir.y } : { x: -1, y: 0 };
    } else spawnAi();
    paint();
    render();
    if (over) setGameResult(resultText || `上一局结束，你的长度 ${snake.length}`, snake.length ? '' : 'lose', { score: pointsFor(snake.length) });
    else schedule();
    save(true);
  } else {
    reset();
  }
}


/* ---------------- 乒乓球 ---------------- */
function bindPong() {
  const canvas = document.getElementById('pongCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 640, H = 420;
  const MAX_BALLS = 4;
  const WIN_SCORES = [3, 5, 7, 9, 11];
  // 1 星 AI 会明显漏球，5 星才是完整实力
  const AI_CFG = [
    { speed: 92, err: 100 },
    { speed: 150, err: 66 },
    { speed: 220, err: 36 },
    { speed: 300, err: 16 },
    { speed: 440, err: 3 },
  ];
  let playerX = W / 2;
  let aiX = W / 2;
  let balls = [];
  let playerScore = 0;
  let aiScore = 0;
  let over = false;
  let raf = 0;
  let lastTs = 0;
  let level = 2;
  let serveTimer = null;
  let resultText = '';
  let recorded = false;
  let pointerActive = false;
  let powerup = null;
  let nextPowerupAt = Date.now() + 6500;
  let aiErr = 0;
  let serveAt = 0;
  // 黑色炸弹：球撞上去就炸，把球「传」过去的那一方丢分
  let bombs = [];
  let blasts = [];
  let nextBombAt = Date.now() + 4200;

  const rand = (a, b) => a + Math.random() * (b - a);
  const playerW = () => 116;
  const aiW = () => [58, 76, 92, 108, 124][level - 1] || 76;
  const paddleH = 12;
  const ballSpeed = () => Math.min(470, 280 + level * 32);
  const aiCfg = () => AI_CFG[level - 1] || AI_CFG[1];
  const winScore = () => WIN_SCORES[level - 1] || 7;
  const newBall = (x, y, vx, vy) => ({ x, y, vx, vy, r: 9, last: null });
  const newAiErr = () => (Math.random() * 2 - 1) * aiCfg().err;

  const snapshot = () => ({
    playerX, aiX,
    balls: balls.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, last: b.last })),
    powerup: powerup ? { x: powerup.x, y: powerup.y, until: powerup.until } : null,
    bombs: bombs.map(m => ({ x: m.x, y: m.y })),
    playerScore, aiScore, over, result: resultText, level,
  });
  const save = makeSaver('pong', snapshot, 400);
  bindLifecycle(canvas, save);

  const resetBall = (toward) => {
    serveAt = 0;
    const angle = rand(-0.45, 0.45);
    const speed = ballSpeed();
    balls = [newBall(
      W / 2,
      H / 2,
      Math.sin(angle) * speed,
      Math.cos(angle) * speed * (toward > 0 ? 1 : -1)
    )];
    aiErr = newAiErr();
  };
  const showScore = () => {
    statusEl.textContent = `${playerScore} : ${aiScore} · 先到 ${winScore()} 分`;
  };
  const serveIn = (delay) => {
    clearTimeout(serveTimer);
    serveAt = Date.now() + delay;
    showScore();
    serveTimer = setTimeout(() => {
      if (!canvas.isConnected || over || balls.length) return;
      resetBall(1);
      save();
    }, delay);
  };
  const finish = () => {
    if (over) return;
    over = true;
    serveAt = 0;
    balls = [];
    powerup = null;
    bombs = [];
    clearTimeout(serveTimer);
    const won = playerScore >= winScore();
    resultText = won ? `你赢了 ${playerScore}:${aiScore}` : `你输了 ${playerScore}:${aiScore}`;
    const pgCost = revivePts('pong', playerScore * 10);
    setGameResult(resultText, won ? 'win' : 'lose', won ? { score: playerScore * 10 } : {
      score: playerScore * 10,
      noPoints: true,
      reviveLabel: `复活 · ${pgCost} 积分`,
      revive: () => {
        if (!ptsSpendTotal(pgCost)) { toast('积分不够复活'); return; }
        // 比分留着，接着把这一局打完
        over = false;
        recorded = false;
        resultText = '';
        balls = [];
        powerup = null;
        bombs = [];
        blasts = [];
        setGameResult('', '');
        showScore();
        serveIn(1400);
        if (!raf) { lastTs = 0; raf = gRaf(frame); }
        save(true);
      },
    });
    if (!recorded) {
      recorded = true;
      recordHistory('pong', { score: playerScore, text: resultText });
    }
    save(true);
  };
  const award = (who) => {
    if (over) return;
    if (who === 'player') playerScore++;
    else aiScore++;
    showScore();
    save();
    if (playerScore >= winScore() || aiScore >= winScore()) {
      finish();
      return;
    }
    if (!balls.length) {
      clearTimeout(serveTimer);
      serveAt = 0;
      serveTimer = setTimeout(() => {
        if (!canvas.isConnected || over || balls.length) return;
        resetBall(1);
        save();
      }, 620);
    }
  };
  const splitBall = (i) => {
    const b = balls[i];
    if (!b) return;
    powerup = null;
    nextPowerupAt = Date.now() + rand(8000, 12000);
    const room = MAX_BALLS - (balls.length - 1);
    const count = Math.min(room, 2 + Math.floor(Math.random() * 3));
    if (count < 2) {
      b.vx *= 1.12;
      b.vy *= 1.12;
      return;
    }
    const dir = Math.atan2(b.vy, b.vx);
    const speed = Math.min(520, Math.hypot(b.vx, b.vy));
    const out = [];
    for (let k = 0; k < count; k++) {
      const a = dir + (k - (count - 1) / 2) * 0.44 + rand(-0.1, 0.1);
      out.push(newBall(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed));
    }
    balls.splice(i, 1, ...out);
  };
  const spawnBomb = () => {
    if (over || !balls.length) return;
    // 别贴着上下球拍生成，否则一出现就必炸
    bombs = [{
      x: rand(76, W - 76),
      y: rand(H * 0.30, H * 0.70),
      r: 15,
      born: Date.now(),
    }];
    nextBombAt = Date.now() + rand(6000, 9000);
  };
  const spawnPowerup = () => {
    if (powerup || over) return;
    powerup = {
      x: rand(78, W - 78),
      y: rand(105, H - 105),
      until: Date.now() + 5200,
    };
  };
  const updateAI = (dt) => {
    const threat = balls
      .filter(b => b.vy < 0)
      .sort((a, b) => a.y - b.y)[0];
    const half = aiW() / 2;
    let target = W / 2;
    if (threat) target = threat.x + aiErr;
    target = Math.max(half, Math.min(W - half, target));
    const cur = aiX + half;
    const maxStep = aiCfg().speed * dt;
    const delta = target - cur;
    if (Math.abs(delta) > 1) aiX += Math.max(-maxStep, Math.min(maxStep, delta));
    aiX = Math.max(0, Math.min(W - aiW(), aiX));
  };

  // 只判断横向是否落在拍面内；null 表示没碰到，0 也是有效命中（正中）。
  const paddleHit = (px, half, ballObj) => {
    if (ballObj.x + ballObj.r < px - half || ballObj.x - ballObj.r > px + half) return null;
    return (ballObj.x - px) / half;
  };
  const step = (dt) => {
    if (over) return;
    const now = Date.now();
    if (!powerup && now >= nextPowerupAt && balls.length) spawnPowerup();
    if (!bombs.length && now >= nextBombAt) spawnBomb();
    if (powerup && now >= powerup.until) {
      powerup = null;
      nextPowerupAt = now + rand(7000, 11000);
    }
    updateAI(dt);

    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }

      if (powerup && Math.hypot(b.x - powerup.x, b.y - powerup.y) < b.r + 21) {
        splitBall(i);
        break;
      }

      if (bombs.length) {
        const bm = bombs[0];
        if (Math.hypot(b.x - bm.x, b.y - bm.y) < b.r + bm.r) {
          blasts.push({ x: bm.x, y: bm.y, at: Date.now() });
          bombs = [];
          balls.splice(i, 1);
          // 谁把球打到炸弹上，谁的对家加分
          award(b.last === 'player' ? 'ai' : 'player');
          if (over) return;
          continue;
        }
      }

      if (b.vy < 0) {
        const line = 26 + paddleH + b.r;
        const hit = paddleHit(aiX + aiW() / 2, aiW() / 2, b);
        if (hit !== null && prevY >= line && b.y <= line) {
          b.y = line + 0.5;
          b.vy = Math.abs(b.vy);
          b.vx = Math.max(-540, Math.min(540, b.vx + hit * 110));
          b.last = 'ai';
        }
      } else {
        const line = H - 26 - paddleH - b.r;
        const hit = paddleHit(playerX + playerW() / 2, playerW() / 2, b);
        if (hit !== null && prevY <= line && b.y >= line) {
          b.y = line - 0.5;
          b.vy = -Math.abs(b.vy);
          b.vx = Math.max(-540, Math.min(540, b.vx + hit * 120));
          b.last = 'player';
        }
      }

      if (b.y < -24) {
        balls.splice(i, 1);
        award('player');
      } else if (b.y > H + 24) {
        balls.splice(i, 1);
        award('ai');
      }
      if (over) return;
    }
    save();
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = gameFont(24, 600);
    ctx.textAlign = 'center';
    // 上方是 AI 的半场，下方的分数才是你的，别把两块记分牌摆反
    ctx.fillText(`${aiScore}`, W / 2 - 38, H / 2 - 18);
    ctx.fillText(`${playerScore}`, W / 2 + 38, H / 2 + 34);
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.font = gameFont(12, 500);
    ctx.fillText(`先到 ${winScore()} 分`, W / 2, 17);

    ctx.fillStyle = '#8fb8ff';
    roundRectPath(ctx, playerX, H - 26 - paddleH, playerW(), paddleH, 6);
    ctx.fill();
    ctx.fillStyle = '#ffbe7a';
    roundRectPath(ctx, aiX, 26, aiW(), paddleH, 6);
    ctx.fill();

    if (powerup) {
      const left = Math.max(0, (powerup.until - Date.now()) / 5200);
      ctx.save();
      ctx.globalAlpha = 0.35 + left * 0.65;
      ctx.shadowColor = '#ffd66b';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffd66b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, 20 + Math.sin(Date.now() / 180) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,214,107,.16)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd66b';
      ctx.font = gameFont(17, 700);
      ctx.fillText('×', powerup.x, powerup.y + 6);
      ctx.restore();
    }

    bombs.forEach(bm => {
      const pulse = 1 + Math.sin(Date.now() / 150) * 0.06;
      ctx.save();
      ctx.shadowColor = 'rgba(255,80,70,.55)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#111114';
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, bm.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,86,72,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, bm.r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = gameFont(13, 700);
      ctx.fillText('!', bm.x, bm.y + 4.5);
      ctx.restore();
    });
    const now = Date.now();
    blasts = blasts.filter(x => now - x.at < 460);
    blasts.forEach(x => {
      const k = (now - x.at) / 460;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#ff6a5c';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(x.x, x.y, 12 + k * 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = 'rgba(255,120,90,.5)';
      ctx.beginPath();
      ctx.arc(x.x, x.y, 10 + k * 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.fillStyle = '#f5f5f2';
    balls.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!balls.length && !over) {
      const wait = serveAt > Date.now() ? Math.ceil((serveAt - Date.now()) / 1000) : 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = gameFont(15, 600);
      ctx.fillText(wait ? `准备发球 · ${wait}` : '准备发球…', W / 2, H / 2 + 70);
    }
  };

  const frame = (ts) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); raf = 0; return; }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.034, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    step(dt);
    draw();
    raf = gRaf(frame);
  };
  const onPointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    playerX = ((e.clientX - rect.left) / rect.width) * W - playerW() / 2;
    playerX = Math.max(0, Math.min(W - playerW(), playerX));
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    pointerActive = true;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    onPointer(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (pointerActive) onPointer(e); });
  canvas.addEventListener('pointerup', () => { pointerActive = false; });
  canvas.addEventListener('pointercancel', () => { pointerActive = false; });

  const reset = () => {
    playerScore = 0;
    aiScore = 0;
    over = false;
    resultText = '';
    recorded = false;
    playerX = W / 2 - playerW() / 2;
    aiX = W / 2 - aiW() / 2;
    powerup = null;
    bombs = [];
    blasts = [];
    nextBombAt = Date.now() + 4200;
    nextPowerupAt = Date.now() + 6500;
    setGameResult('', '');
    clearTimeout(serveTimer);
    serveIn(1600);
    save(true);
    if (!raf) { lastTs = 0; raf = gRaf(frame); }
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('pong', (n) => { level = n; reset(); });
  level = diff.get();
  playerX = W / 2 - playerW() / 2;
  aiX = W / 2 - aiW() / 2;

  const saved = loadState('pong');
  if (saved && Number.isFinite(saved.playerScore) && Number.isFinite(saved.aiScore)) {
    playerScore = Math.max(0, Math.min(winScore(), Math.floor(saved.playerScore)));
    aiScore = Math.max(0, Math.min(winScore(), Math.floor(saved.aiScore)));
    playerX = Number.isFinite(saved.playerX) ? saved.playerX : W / 2 - playerW() / 2;
    aiX = Number.isFinite(saved.aiX) ? saved.aiX : W / 2 - aiW() / 2;
    playerX = Math.max(0, Math.min(W - playerW(), playerX));
    aiX = Math.max(0, Math.min(W - aiW(), aiX));
    over = !!saved.over;
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    if (Array.isArray(saved.balls)) {
      balls = saved.balls
        .filter(b => b && [b.x, b.y, b.vx, b.vy].every(Number.isFinite))
        .slice(0, MAX_BALLS)
        .map(b => Object.assign(newBall(b.x, b.y, b.vx, b.vy), { last: b.last === 'player' || b.last === 'ai' ? b.last : null }));
    }
    if (Array.isArray(saved.bombs)) {
      bombs = saved.bombs
        .filter(m => m && Number.isFinite(m.x) && Number.isFinite(m.y))
        .slice(0, 1)
        .map(m => ({ x: m.x, y: m.y, r: 15, born: Date.now() }));
    }
    if (saved.powerup && Number.isFinite(saved.powerup.x) && Number.isFinite(saved.powerup.y)
      && Number.isFinite(saved.powerup.until) && saved.powerup.until > Date.now()) {
      powerup = { x: saved.powerup.x, y: saved.powerup.y, until: saved.powerup.until };
    }
    if (!balls.length && !over) serveIn(1600);
    showScore();
    if (over) setGameResult(resultText || `上一局结束，${playerScore}:${aiScore}`, playerScore >= winScore() ? 'win' : 'lose', { score: playerScore * 10 });
    save(true);
  } else {
    playerScore = 0;
    aiScore = 0;
    playerX = W / 2 - playerW() / 2;
    aiX = W / 2 - aiW() / 2;
    serveIn(3000);
  }
  lastTs = 0;
  raf = gRaf(frame);
}
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ---------------- 记忆翻牌 ---------------- */
function bindMemory() {
  const boardEl = document.getElementById('memoryBoard');
  const movesEl = document.getElementById('memMoves');
  const pairsEl = document.getElementById('memPairs');
  const resetBtn = document.getElementById('gameReset');
  if (!boardEl) return;
  // Apple 风格动物/熟食图；同一局只从同一个类别里抽，不混水果蔬菜。
  let cards = [];
  let open = [];
  let moves = 0;
  let pairs = 0;
  let over = false;
  let busy = false;
  let level = 2;
  let resultText = '';
  let recorded = false;
  let cols = 4;

  const pairCount = () => [8, 12, 15, 21, 32][level - 1] || 8;
  const MEM_COLS = [4, 4, 5, 7, 8];
  const snapshot = () => ({ cards, open, moves, pairs, over, result: resultText });
  const save = makeSaver('memory', snapshot, 220);
  bindLifecycle(boardEl, save);

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const build = () => {
    const total = pairCount();
    cols = MEM_COLS[level - 1] || 4;
    const usable = MEM_CATEGORIES.filter(list => list.length >= total);
    const category = usable[Math.floor(Math.random() * usable.length)] || MEM_ANIMALS;
    const picked = shuffle(category.slice()).slice(0, total);
    cards = shuffle(picked.concat(picked).map((sym, i) => ({ id: i, sym, matched: false })));
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    boardEl.innerHTML = cards.map((c, i) =>
      `<button class="mem-card" type="button" data-i="${i}" aria-label="第 ${i + 1} 张牌"><img src="/assets/emoji-memory/${c.sym}.png" alt="" draggable="false" loading="eager" decoding="sync"></button>`).join('');
    boardEl.querySelectorAll('.mem-card').forEach(el => {
      el.addEventListener('click', () => flip(Number(el.dataset.i)));
    });
  };
  const render = () => {
    if (!movesEl || !pairsEl) return;
    movesEl.textContent = moves;
    pairsEl.textContent = `${pairs}/${cards.length / 2}`;
    boardEl.querySelectorAll('.mem-card').forEach((el, i) => {
      const c = cards[i];
      if (!c) return;
      const shown = c.matched || open.includes(i);
      el.classList.toggle('flipped', shown);
      el.classList.toggle('matched', c.matched);
      el.disabled = c.matched;
    });
    save();
  };
  const finish = () => {
    over = true;
    resultText = `全部配对，用了 ${moves} 步`;
    setGameResult(resultText, 'win', { points: Math.max(60, 220 - moves * 2) });
    if (!recorded) {
      recorded = true;
      recordHistory('memory', { score: moves, text: `${moves} 步` });
    }
    save(true);
  };
  const flip = (i) => {
    if (over || busy || !cards[i] || cards[i].matched || open.includes(i)) return;
    open.push(i);
    if (open.length === 1) { render(); return; }
    busy = true;
    moves++;
    const [a, b] = open;
    if (cards[a].sym === cards[b].sym) {
      cards[a].matched = true;
      cards[b].matched = true;
      pairs++;
      open = [];
      render();
      setTimeout(() => {
        if (!boardEl.isConnected) return;
        busy = false;
        if (pairs === cards.length / 2) finish();
      }, 360);
    } else {
      render();
      setTimeout(() => {
        if (!boardEl.isConnected) return;
        open = [];
        busy = false;
        render();
      }, 720);
    }
  };
  const reset = () => {
    open = [];
    moves = 0;
    pairs = 0;
    over = false;
    busy = false;
    resultText = '';
    recorded = false;
    setGameResult('', '');
    build();
    render();
    save(true);
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('memory', (n) => { level = n; reset(); });
  level = diff.get();
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  const saved = loadState('memory');
  const valid = saved && Array.isArray(saved.cards) && saved.cards.length >= 12
    && saved.cards.length % 2 === 0
    && saved.cards.length / 2 === pairCount()
    && saved.cards.every(c => c && typeof c.sym === 'string' && MEM_SYMBOLS.includes(c.sym) && typeof c.matched === 'boolean');
  if (valid) {
    cards = saved.cards.map(c => ({ id: c.id, sym: c.sym, matched: !!c.matched }));
    open = Array.isArray(saved.open) ? saved.open.filter(i => Number.isInteger(i) && i >= 0 && i < cards.length).slice(0, 1) : [];
    moves = Number.isFinite(saved.moves) ? saved.moves : 0;
    pairs = Number.isFinite(saved.pairs) ? saved.pairs : cards.filter(c => c.matched).length / 2;
    over = !!saved.over;
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    cols = MEM_COLS[level - 1] || 4;
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    boardEl.innerHTML = cards.map((c, i) => `<button class="mem-card" type="button" data-i="${i}" aria-label="第 ${i + 1} 张牌"><img src="/assets/emoji-memory/${c.sym}.png" alt="" draggable="false" loading="eager" decoding="sync"></button>`).join('');
    boardEl.querySelectorAll('.mem-card').forEach(el => el.addEventListener('click', () => flip(Number(el.dataset.i))));
    render();
    if (over) setGameResult(resultText || `全部配对，用了 ${moves} 步`, 'win', { points: Math.max(60, 220 - moves * 2) });
    save(true);
  } else {
    reset();
  }
}

/* ---------------- 快速问答 ---------------- */
const QUIZ_BANK = [
  // 科学
  { cat: '科学', d: 1, q: '太阳是什么星？', options: ['恒星', '行星', '卫星', '彗星'], ans: '恒星' },
  { cat: '科学', d: 1, q: '水的化学式是？', options: ['H₂O', 'CO₂', 'O₂', 'NaCl'], ans: 'H₂O' },
  { cat: '科学', d: 1, q: '植物光合作用会释放什么？', options: ['氧气', '二氧化碳', '氮气', '氢气'], ans: '氧气' },
  { cat: '科学', d: 1, q: '标准大气压下水的沸点是？', options: ['100℃', '0℃', '50℃', '212℃'], ans: '100℃' },
  { cat: '科学', d: 2, q: '声音不能在什么中传播？', options: ['真空', '空气', '水', '钢铁'], ans: '真空' },
  { cat: '科学', d: 2, q: '人体最大的器官是？', options: ['皮肤', '肝脏', '肺', '心脏'], ans: '皮肤' },
  { cat: '科学', d: 2, q: '血液中运输氧气的是？', options: ['红细胞', '白细胞', '血小板', '血浆'], ans: '红细胞' },
  { cat: '科学', d: 2, q: '鲸鱼属于哪一类动物？', options: ['哺乳动物', '鱼类', '两栖动物', '爬行动物'], ans: '哺乳动物' },
  { cat: '科学', d: 3, q: '地球大气中含量最多的气体是？', options: ['氮气', '氧气', '二氧化碳', '氩气'], ans: '氮气' },
  { cat: '科学', d: 3, q: '光年是什么单位？', options: ['距离', '时间', '速度', '亮度'], ans: '距离' },
  { cat: '科学', d: 3, q: '元素周期表的第一个元素是？', options: ['氢', '氦', '碳', '氧'], ans: '氢' },
  { cat: '科学', d: 3, q: '蝙蝠主要靠什么定位？', options: ['超声波', '磁场', '气味', '红外线'], ans: '超声波' },
  { cat: '科学', d: 3, q: '声音在空气中的传播速度约为？', options: ['340 米/秒', '30 万千米/秒', '1000 米/秒', '34 米/秒'], ans: '340 米/秒' },
  { cat: '科学', d: 4, q: '成年人体内大约有多少块骨头？', options: ['206 块', '106 块', '306 块', '156 块'], ans: '206 块' },
  { cat: '科学', d: 4, q: '植物光合作用的主要场所是？', options: ['叶绿体', '线粒体', '细胞核', '液泡'], ans: '叶绿体' },
  { cat: '科学', d: 4, q: '酸雨主要与哪种气体有关？', options: ['二氧化硫', '氧气', '氮气', '甲烷'], ans: '二氧化硫' },
  { cat: '科学', d: 4, q: '光在真空中的速度约为？', options: ['30 万千米/秒', '340 米/秒', '3 万千米/秒', '300 千米/秒'], ans: '30 万千米/秒' },
  { cat: '科学', d: 4, q: '人体最大的细胞是？', options: ['卵细胞', '红细胞', '神经细胞', '白细胞'], ans: '卵细胞' },
  { cat: '科学', d: 5, q: '臭氧层的主要作用是？', options: ['吸收紫外线', '吸收氧气', '制造降水', '反射可见光'], ans: '吸收紫外线' },
  { cat: '科学', d: 5, q: '人体细胞中 ATP 主要在哪个结构产生？', options: ['线粒体', '细胞核', '核糖体', '高尔基体'], ans: '线粒体' },
  { cat: '科学', d: 5, q: '元素周期表中，原子序数等于？', options: ['质子数', '中子数', '电子层数', '相对原子质量'], ans: '质子数' },
  { cat: '科学', d: 5, q: '光属于哪一类波？', options: ['横波', '纵波', '机械波', '声波'], ans: '横波' },
  { cat: '科学', d: 5, q: '长期缺乏维生素 C 会引发？', options: ['坏血病', '夜盲症', '佝偻病', '脚气病'], ans: '坏血病' },
  { cat: '科学', d: 5, q: 'DNA 双螺旋结构模型的提出者是？', options: ['沃森和克里克', '孟德尔和摩尔根', '达尔文和拉马克', '居里夫妇'], ans: '沃森和克里克' },
  { cat: '科学', d: 5, q: '电流的国际单位是？', options: ['安培', '伏特', '瓦特', '欧姆'], ans: '安培' },
  { cat: '科学', d: 5, q: '温室效应增强主要与哪种气体增加有关？', options: ['二氧化碳', '氮气', '氧气', '氦气'], ans: '二氧化碳' },
  // 百科
  { cat: '百科', d: 1, q: '中国最长的河流是？', options: ['长江', '黄河', '珠江', '黑龙江'], ans: '长江' },
  { cat: '百科', d: 1, q: '世界上面积最大的洋是？', options: ['太平洋', '大西洋', '印度洋', '北冰洋'], ans: '太平洋' },
  { cat: '百科', d: 1, q: '世界最高峰是？', options: ['珠穆朗玛峰', '乔戈里峰', '勃朗峰', '乞力马扎罗山'], ans: '珠穆朗玛峰' },
  { cat: '百科', d: 1, q: '地球唯一的天然卫星是？', options: ['月球', '火星', '金星', '太阳'], ans: '月球' },
  { cat: '百科', d: 1, q: '奥运五环一共有几个环？', options: ['5 个', '4 个', '6 个', '7 个'], ans: '5 个' },
  { cat: '百科', d: 1, q: '中国国旗上有几颗星？', options: ['5 颗', '4 颗', '6 颗', '1 颗'], ans: '5 颗' },
  { cat: '百科', d: 1, q: '指南针通常指向？', options: ['南北', '东西', '上下', '左右'], ans: '南北' },
  { cat: '百科', d: 1, q: '熊猫主要吃什么？', options: ['竹子', '肉类', '鱼', '坚果'], ans: '竹子' },
  { cat: '百科', d: 2, q: '《本草纲目》的作者是？', options: ['李时珍', '华佗', '张仲景', '扁鹊'], ans: '李时珍' },
  { cat: '百科', d: 2, q: '《西游记》的作者是？', options: ['吴承恩', '施耐庵', '罗贯中', '曹雪芹'], ans: '吴承恩' },
  { cat: '百科', d: 2, q: '中国面积最大的省级行政区是？', options: ['新疆', '西藏', '内蒙古', '青海'], ans: '新疆' },
  { cat: '百科', d: 2, q: '世界上最小的鸟是？', options: ['蜂鸟', '麻雀', '燕子', '黄鹂'], ans: '蜂鸟' },
  { cat: '百科', d: 2, q: '世界上人口最多的大洲是？', options: ['亚洲', '非洲', '欧洲', '南美洲'], ans: '亚洲' },
  { cat: '百科', d: 2, q: '太阳系中最大的行星是？', options: ['木星', '土星', '地球', '海王星'], ans: '木星' },
  { cat: '百科', d: 2, q: '彩虹通常有几种主要颜色？', options: ['7 种', '5 种', '6 种', '8 种'], ans: '7 种' },
  { cat: '百科', d: 2, q: '计算机二进制只有哪两个数字？', options: ['0 和 1', '1 和 2', '0 和 9', '2 和 3'], ans: '0 和 1' },
  { cat: '百科', d: 2, q: '电灯通常被认为是谁发明的？', options: ['爱迪生', '牛顿', '爱因斯坦', '特斯拉'], ans: '爱迪生' },
  { cat: '百科', d: 2, q: '相对论的提出者是？', options: ['爱因斯坦', '牛顿', '达尔文', '伽利略'], ans: '爱因斯坦' },
  { cat: '百科', d: 3, q: '中国四大发明不包括？', options: ['地动仪', '造纸术', '指南针', '火药'], ans: '地动仪' },
  { cat: '百科', d: 3, q: '“卧薪尝胆”与哪位历史人物有关？', options: ['勾践', '项羽', '刘邦', '曹操'], ans: '勾践' },
  { cat: '百科', d: 3, q: '一年中白昼最长的节气是？', options: ['夏至', '冬至', '春分', '秋分'], ans: '夏至' },
  { cat: '百科', d: 3, q: '第一个登上月球的人是？', options: ['阿姆斯特朗', '加加林', '杨利伟', '奥尔德林'], ans: '阿姆斯特朗' },
  { cat: '百科', d: 3, q: '长江发源于哪一地区？', options: ['青藏高原', '云贵高原', '内蒙古高原', '黄土高原'], ans: '青藏高原' },
  { cat: '百科', d: 3, q: '联合国总部设在？', options: ['纽约', '日内瓦', '巴黎', '伦敦'], ans: '纽约' },
  { cat: '百科', d: 4, q: '恐龙灭绝大约发生在多少年前？', options: ['6600 万年前', '660 万年前', '6 亿年前', '1 万年前'], ans: '6600 万年前' },
  { cat: '百科', d: 4, q: '世界上最深的海沟是？', options: ['马里亚纳海沟', '波多黎各海沟', '爪哇海沟', '日本海沟'], ans: '马里亚纳海沟' },
  { cat: '百科', d: 4, q: '中国第一位获得诺贝尔科学奖项的是？', options: ['屠呦呦', '杨振宁', '李政道', '钱学森'], ans: '屠呦呦' },
  { cat: '百科', d: 4, q: '地球自转一周大约需要？', options: ['24 小时', '12 小时', '365 天', '30 天'], ans: '24 小时' },
  { cat: '百科', d: 5, q: '世界上面积最小的国家是？', options: ['梵蒂冈', '摩纳哥', '圣马力诺', '列支敦士登'], ans: '梵蒂冈' },
  { cat: '百科', d: 5, q: '人类基因组主要储存在哪里？', options: ['细胞核', '细胞膜', '细胞质', '核糖体'], ans: '细胞核' },
  { cat: '百科', d: 5, q: '联合国安理会常任理事国有几个？', options: ['5 个', '4 个', '6 个', '7 个'], ans: '5 个' },
  { cat: '百科', d: 5, q: '中国四大名著不包括？', options: ['《聊斋志异》', '《红楼梦》', '《西游记》', '《水浒传》'], ans: '《聊斋志异》' },
  { cat: '百科', d: 5, q: '世界上最大的沙漠是？', options: ['撒哈拉沙漠', '塔克拉玛干沙漠', '戈壁沙漠', '阿拉伯沙漠'], ans: '撒哈拉沙漠' },
  { cat: '百科', d: 5, q: '中国最长的古代运河是？', options: ['京杭大运河', '苏伊士运河', '巴拿马运河', '灵渠'], ans: '京杭大运河' },
  { cat: '百科', d: 5, q: '欧盟总部设在？', options: ['布鲁塞尔', '巴黎', '柏林', '日内瓦'], ans: '布鲁塞尔' },
  { cat: '百科', d: 5, q: '第一个进入太空的人是？', options: ['加加林', '阿姆斯特朗', '杨利伟', '格伦'], ans: '加加林' },
  { cat: '百科', d: 5, q: '莎士比亚四大悲剧不包括？', options: ['《罗密欧与朱丽叶》', '《哈姆雷特》', '《奥赛罗》', '《麦克白》'], ans: '《罗密欧与朱丽叶》' },
];

// v0.9.84：题库扩容；每题仍是四选一，难度 1–5 逐级加深
[
  // 科学补充
  ['科学', 1, '地球绕着什么转？', ['太阳', '月亮', '火星', '北极星'], '太阳'],
  ['科学', 1, '水在 0℃ 会变成？', ['冰', '水蒸气', '氧气', '酒精'], '冰'],
  ['科学', 1, '人体呼吸需要吸入？', ['氧气', '氮气', '二氧化碳', '氢气'], '氧气'],
  ['科学', 1, '彩虹一般出现在？', ['雨后', '夜里', '沙漠', '海底'], '雨后'],
  ['科学', 1, '哪种动物会冬眠？', ['青蛙', '老虎', '大象', '企鹅'], '青蛙'],
  ['科学', 1, '太阳从哪个方向升起？', ['东方', '西方', '南方', '北方'], '东方'],
  ['科学', 2, '月食发生时，地球位于？', ['太阳和月亮之间', '月亮和太阳之间', '太阳和火星之间', '月亮和火星之间'], '太阳和月亮之间'],
  ['科学', 2, '人体正常体温约为？', ['37℃', '27℃', '47℃', '17℃'], '37℃'],
  ['科学', 2, '哪种气体支持燃烧？', ['氧气', '二氧化碳', '氮气', '氦气'], '氧气'],
  ['科学', 2, '鱼主要用什么呼吸？', ['鳃', '肺', '皮肤', '气囊'], '鳃'],
  ['科学', 2, '磁铁同名磁极会？', ['排斥', '吸引', '消失', '变热'], '排斥'],
  ['科学', 2, '水蒸气遇冷会？', ['凝结', '燃烧', '爆炸', '发光'], '凝结'],
  ['科学', 3, '地球自转产生？', ['昼夜交替', '四季变化', '潮汐', '月相'], '昼夜交替'],
  ['科学', 3, '四季变化主要由什么引起？', ['地轴倾斜', '地球自转', '月亮公转', '潮汐'], '地轴倾斜'],
  ['科学', 3, 'pH 小于 7 通常表示？', ['酸性', '碱性', '中性', '盐'], '酸性'],
  ['科学', 3, '人体消化食物的主要场所是？', ['小肠', '胃', '食道', '大肠'], '小肠'],
  ['科学', 3, '哪种能源属于可再生能源？', ['风能', '煤炭', '石油', '天然气'], '风能'],
  ['科学', 3, '云主要由什么组成？', ['水滴和冰晶', '灰尘', '氧气', '二氧化碳'], '水滴和冰晶'],
  ['科学', 4, '元素符号 Fe 表示？', ['铁', '氟', '金', '银'], '铁'],
  ['科学', 4, '人体缺少哪种元素容易贫血？', ['铁', '钙', '碘', '锌'], '铁'],
  ['科学', 4, '光合作用主要吸收哪种气体？', ['二氧化碳', '氧气', '氮气', '氢气'], '二氧化碳'],
  ['科学', 4, '声音在哪种介质中传播最快？', ['钢铁', '空气', '水', '真空'], '钢铁'],
  ['科学', 4, '地球公转一周大约需要？', ['365 天', '24 小时', '30 天', '12 小时'], '365 天'],
  ['科学', 4, '原子核由什么组成？', ['质子和中子', '电子和质子', '电子和中子', '分子'], '质子和中子'],
  ['科学', 5, '真空中光速会？', ['保持不变', '随光源变化', '随观察者变化', '变为零'], '保持不变'],
  ['科学', 5, '细胞有氧呼吸的主要场所是？', ['线粒体', '叶绿体', '核糖体', '液泡'], '线粒体'],
  ['科学', 5, '元素周期表按什么排序？', ['原子序数', '相对原子质量', '密度', '熔点'], '原子序数'],
  ['科学', 5, '电磁波中波长最长的是？', ['无线电波', '可见光', 'X 射线', '伽马射线'], '无线电波'],
  ['科学', 5, '臭氧层位于大气哪一层？', ['平流层', '对流层', '中间层', '热层'], '平流层'],
  ['科学', 5, '牛顿第一定律又称？', ['惯性定律', '万有引力定律', '作用力反作用力定律', '能量守恒定律'], '惯性定律'],
  ['科学', 5, '普朗克常数的单位是？', ['J·s', 'N·m', 'W/s', 'C·V'], 'J·s'],
  ['科学', 5, '人体内体积最大的细胞是？', ['卵细胞', '神经细胞', '肌细胞', '红细胞'], '卵细胞'],
  ['科学', 5, '国际单位制中“秒”的基准跃迁来自？', ['铯-133', '氢-1', '碳-12', '铀-235'], '铯-133'],
  ['科学', 5, '日地系统的 L1 拉格朗日点位于？', ['地球与太阳之间', '地球背光侧', '月球轨道上', '太阳背面'], '地球与太阳之间'],
  ['科学', 5, 'DNA 双螺旋的直径约为？', ['2 纳米', '2 微米', '0.2 纳米', '20 纳米'], '2 纳米'],
  ['科学', 5, '20℃ 空气中声速约为？', ['343 m/s', '240 m/s', '480 m/s', '1020 m/s'], '343 m/s'],
  ['科学', 5, 'ABO 血型由什么决定？', ['红细胞表面抗原', '血浆蛋白', '白细胞数量', '血小板形状'], '红细胞表面抗原'],
  ['科学', 5, '傅里叶变换把时域信号变到？', ['频域', '空域', '相位域', '幅值域'], '频域'],
  ['科学', 5, '海洋最深处的海沟是？', ['马里亚纳海沟', '波多黎各海沟', '汤加海沟', '日本海沟'], '马里亚纳海沟'],
  ['科学', 5, '绝对零度对应多少摄氏度？', ['-273.15℃', '-100℃', '-459℃', '0℃'], '-273.15℃'],
  ['科学', 5, '一颗恒星的光谱型 O 型说明它？', ['温度极高', '温度极低', '正在坍缩', '是白矮星'], '温度极高'],
  ['百科', 5, '《神曲》分为几部？', ['3 部', '2 部', '4 部', '12 部'], '3 部'],
  ['百科', 5, '国际单位制七个基本单位中不含？', ['牛顿', '开尔文', '摩尔', '坎德拉'], '牛顿'],
  ['百科', 5, '巴赫《平均律键盘曲集》共几卷？', ['2 卷', '1 卷', '3 卷', '4 卷'], '2 卷'],
  ['百科', 5, '明治维新开始于哪一年？', ['1868 年', '1853 年', '1889 年', '1904 年'], '1868 年'],
  ['百科', 5, '世界上面积最小的国家是？', ['梵蒂冈', '摩纳哥', '圣马力诺', '列支敦士登'], '梵蒂冈'],
  ['百科', 5, '《格尔尼卡》的作者是？', ['毕加索', '达利', '米罗', '马蒂斯'], '毕加索'],
  ['百科', 5, '第一个踏上月球的人是？', ['阿姆斯特朗', '奥尔德林', '加加林', '格里森'], '阿姆斯特朗'],
  // 百科补充
  ['百科', 1, '中国的首都是？', ['北京', '上海', '广州', '南京'], '北京'],
  ['百科', 1, '一年有几个月？', ['12 个', '10 个', '24 个', '365 个'], '12 个'],
  ['百科', 1, '太阳系有几颗行星？', ['8 颗', '7 颗', '9 颗', '10 颗'], '8 颗'],
  ['百科', 1, '中国的国宝动物是？', ['熊猫', '老虎', '丹顶鹤', '金丝猴'], '熊猫'],
  ['百科', 1, '春节是农历几月几日？', ['正月初一', '八月十五', '五月初五', '九月初九'], '正月初一'],
  ['百科', 1, '奥运会通常每几年举办一次？', ['4 年', '2 年', '3 年', '5 年'], '4 年'],
  ['百科', 2, '中国最长的城墙是？', ['长城', '故宫', '大运河', '兵马俑'], '长城'],
  ['百科', 2, '世界上面积最大的高原是？', ['巴西高原', '青藏高原', '云贵高原', '蒙古高原'], '巴西高原'],
  ['百科', 2, '《水浒传》的作者是？', ['施耐庵', '罗贯中', '吴承恩', '曹雪芹'], '施耐庵'],
  ['百科', 2, '中国有几个直辖市？', ['4 个', '3 个', '5 个', '6 个'], '4 个'],
  ['百科', 2, '世界上最大的哺乳动物是？', ['蓝鲸', '大象', '长颈鹿', '犀牛'], '蓝鲸'],
  ['百科', 2, '太阳系中离太阳最近的行星是？', ['水星', '金星', '地球', '火星'], '水星'],
  ['百科', 3, '中国四大古都中位于陕西的是？', ['西安', '洛阳', '南京', '北京'], '西安'],
  ['百科', 3, '“床前明月光”的作者是？', ['李白', '杜甫', '白居易', '王维'], '李白'],
  ['百科', 3, '世界上面积最大的国家是？', ['俄罗斯', '加拿大', '中国', '美国'], '俄罗斯'],
  ['百科', 3, '中国有多少个省级行政区？', ['34 个', '31 个', '23 个', '36 个'], '34 个'],
  ['百科', 3, '第一次世界大战爆发于哪一年？', ['1914 年', '1918 年', '1939 年', '1945 年'], '1914 年'],
  ['百科', 3, '世界上最大的岛屿是？', ['格陵兰岛', '新几内亚岛', '加里曼丹岛', '马达加斯加岛'], '格陵兰岛'],
  ['百科', 4, '中国历史上第一个统一的封建王朝是？', ['秦朝', '汉朝', '唐朝', '周朝'], '秦朝'],
  ['百科', 4, '《蒙娜丽莎》的作者是？', ['达·芬奇', '梵高', '毕加索', '莫奈'], '达·芬奇'],
  ['百科', 4, '美国独立宣言发表于哪一年？', ['1776 年', '1789 年', '1865 年', '1914 年'], '1776 年'],
  ['百科', 4, '世界上最大的半岛是？', ['阿拉伯半岛', '印度半岛', '中南半岛', '斯堪的纳维亚半岛'], '阿拉伯半岛'],
  ['百科', 4, '诺贝尔奖不设哪个奖项？', ['数学奖', '物理奖', '化学奖', '和平奖'], '数学奖'],
  ['百科', 4, '中国第一部诗歌总集是？', ['《诗经》', '《楚辞》', '《乐府诗集》', '《唐诗三百首》'], '《诗经》'],
  ['百科', 5, '联合国成立于哪一年？', ['1945 年', '1919 年', '1950 年', '1939 年'], '1945 年'],
  ['百科', 5, '2023 年后世界人口最多的国家是？', ['印度', '中国', '美国', '印度尼西亚'], '印度'],
  ['百科', 5, '欧洲联盟的通用货币是？', ['欧元', '美元', '英镑', '法郎'], '欧元'],
  ['百科', 5, '中国最大的岛屿是？', ['台湾岛', '海南岛', '崇明岛', '舟山岛'], '台湾岛'],
  ['百科', 5, '《时间简史》的作者是？', ['霍金', '爱因斯坦', '牛顿', '达尔文'], '霍金'],
  ['百科', 5, '世界上最大的珊瑚礁群是？', ['大堡礁', '马尔代夫珊瑚礁', '红海珊瑚礁', '加勒比珊瑚礁'], '大堡礁'],
].forEach(([cat, d, q, options, ans]) => QUIZ_BANK.push({ cat, d, q, options, ans }));

// v1.0.0：继续补题，保持四选一，难度 1–5 递进
[
  ['科学', 1, '月亮本身会发光吗？', ['不会，反射太阳光', '会，自己发光', '只在满月发光', '只在日食时发光'], '不会，反射太阳光'],
  ['科学', 1, '哪种动物属于哺乳动物？', ['海豚', '鲨鱼', '企鹅', '章鱼'], '海豚'],
  ['科学', 1, '水结成冰时体积会？', ['变大', '变小', '不变', '消失'], '变大'],
  ['科学', 1, '植物生长主要需要哪种能量？', ['太阳光', '声音', '风力', '磁场'], '太阳光'],
  ['科学', 1, '下列哪种材料容易导电？', ['铜', '木头', '塑料', '玻璃'], '铜'],
  ['科学', 1, '雷雨天我们先看到闪电还是先听到雷声？', ['先看到闪电', '先听到雷声', '同时', '不一定'], '先看到闪电'],
  ['科学', 2, '人体呼吸时呼出的气体中明显增加的是？', ['二氧化碳', '氧气', '氮气', '氢气'], '二氧化碳'],
  ['科学', 2, '晴天时影子最短通常出现在？', ['正午', '清晨', '傍晚', '午夜'], '正午'],
  ['科学', 2, '下列哪种动物是卵生？', ['企鹅', '海豚', '蝙蝠', '鲸'], '企鹅'],
  ['科学', 2, '把食盐放进水里会？', ['溶解', '燃烧', '结冰', '发光'], '溶解'],
  ['科学', 2, '使用杠杆时，动力臂越长通常越？', ['省力', '费力', '不省力', '没变化'], '省力'],
  ['科学', 2, '能成正立缩小虚像的镜子是？', ['凸面镜', '凹面镜', '平面镜', '放大镜'], '凸面镜'],
  ['科学', 3, '地球内部温度最高的圈层是？', ['地核', '地幔', '地壳', '岩石圈'], '地核'],
  ['科学', 3, '声音的音调主要由什么决定？', ['频率', '振幅', '响度', '音色'], '频率'],
  ['科学', 3, '空气中氧气约占体积的？', ['21%', '78%', '50%', '5%'], '21%'],
  ['科学', 3, '长期缺乏维生素 A 容易导致？', ['夜盲症', '坏血病', '佝偻病', '脚气病'], '夜盲症'],
  ['科学', 3, '哪种气体燃烧后主要生成水？', ['氢气', '二氧化碳', '氮气', '氦气'], '氢气'],
  ['科学', 3, '植物主要通过哪个结构吸收水分？', ['根', '叶', '花', '果实'], '根'],
  ['科学', 4, '元素符号 Ca 表示？', ['钙', '碳', '铜', '铬'], '钙'],
  ['科学', 4, '电功率的国际单位是？', ['瓦特', '安培', '伏特', '欧姆'], '瓦特'],
  ['科学', 4, '血液中主要负责凝血的是？', ['血小板', '红细胞', '白细胞', '血浆'], '血小板'],
  ['科学', 4, '地球磁场主要帮助我们抵御？', ['太阳风', '地震', '潮汐', '降雨'], '太阳风'],
  ['科学', 4, '下列哪一现象说明光沿直线传播？', ['影子', '彩虹', '海市蜃楼', '色散'], '影子'],
  ['科学', 4, '人体最大的消化腺是？', ['肝脏', '胰腺', '唾液腺', '胃腺'], '肝脏'],
  ['科学', 5, '热力学第一定律的本质是？', ['能量守恒', '动量守恒', '质量守恒', '电荷守恒'], '能量守恒'],
  ['科学', 5, '原子中带负电的粒子是？', ['电子', '质子', '中子', '原子核'], '电子'],
  ['科学', 5, '相对论的提出者是？', ['爱因斯坦', '牛顿', '伽利略', '麦克斯韦'], '爱因斯坦'],
  ['科学', 5, '生态系统中的分解者主要是？', ['细菌和真菌', '绿色植物', '食草动物', '食肉动物'], '细菌和真菌'],
  ['科学', 5, '下列哪种波不能在没有介质的真空中传播？', ['声波', '光波', '无线电波', '微波'], '声波'],
  ['科学', 5, '正常人类体细胞有多少对染色体？', ['23 对', '22 对', '24 对', '46 对'], '23 对'],
  ['百科', 1, '中国国旗上有几颗星？', ['5 颗', '4 颗', '6 颗', '1 颗'], '5 颗'],
  ['百科', 1, '世界上人口最多的大洲是？', ['亚洲', '非洲', '欧洲', '南美洲'], '亚洲'],
  ['百科', 1, '太阳系中体积最大的行星是？', ['木星', '地球', '火星', '土星'], '木星'],
  ['百科', 1, '世界上最大的沙漠是？', ['撒哈拉沙漠', '塔克拉玛干沙漠', '戈壁沙漠', '阿拉伯沙漠'], '撒哈拉沙漠'],
  ['百科', 1, '下列哪个城市不是中国直辖市？', ['杭州', '北京', '上海', '重庆'], '杭州'],
  ['百科', 1, '春节又称？', ['农历新年', '中秋节', '端午节', '重阳节'], '农历新年'],
  ['百科', 2, '世界最高峰是？', ['珠穆朗玛峰', '乔戈里峰', '干城章嘉峰', '洛子峰'], '珠穆朗玛峰'],
  ['百科', 2, '中国四大发明不包括？', ['地动仪', '造纸术', '指南针', '火药'], '地动仪'],
  ['百科', 2, '《西游记》的作者是？', ['吴承恩', '施耐庵', '罗贯中', '曹雪芹'], '吴承恩'],
  ['百科', 2, '澳大利亚的首都是？', ['堪培拉', '悉尼', '墨尔本', '布里斯班'], '堪培拉'],
  ['百科', 2, '奥运五环代表？', ['五大洲', '五个国家', '五种运动', '五届奥运会'], '五大洲'],
  ['百科', 2, '中国最大的淡水湖是？', ['鄱阳湖', '洞庭湖', '太湖', '青海湖'], '鄱阳湖'],
  ['百科', 3, '古代丝绸之路通常以哪里为起点？', ['长安', '洛阳', '开封', '杭州'], '长安'],
  ['百科', 3, '美国第一任总统是？', ['华盛顿', '林肯', '杰斐逊', '罗斯福'], '华盛顿'],
  ['百科', 3, '世界最深的海沟是？', ['马里亚纳海沟', '波多黎各海沟', '爪哇海沟', '日本海沟'], '马里亚纳海沟'],
  ['百科', 3, '中国农历八月十五是什么节日？', ['中秋节', '端午节', '元宵节', '重阳节'], '中秋节'],
  ['百科', 3, '欧洲最高峰是？', ['厄尔布鲁士峰', '勃朗峰', '马特霍恩峰', '少女峰'], '厄尔布鲁士峰'],
  ['百科', 3, '世界上面积最小的国家是？', ['梵蒂冈', '摩纳哥', '圣马力诺', '列支敦士登'], '梵蒂冈'],
  ['百科', 4, '文艺复兴最早发源于？', ['意大利', '法国', '英国', '德国'], '意大利'],
  ['百科', 4, '中国最后一个封建王朝是？', ['清朝', '明朝', '元朝', '宋朝'], '清朝'],
  ['百科', 4, '第一次工业革命最早开始于？', ['英国', '美国', '法国', '德国'], '英国'],
  ['百科', 4, '《命运交响曲》的作者是？', ['贝多芬', '莫扎特', '巴赫', '肖邦'], '贝多芬'],
  ['百科', 4, '世界上流经国家最多的河流是？', ['多瑙河', '尼罗河', '长江', '亚马逊河'], '多瑙河'],
  ['百科', 4, '中国第一部纪传体通史是？', ['《史记》', '《汉书》', '《资治通鉴》', '《春秋》'], '《史记》'],
  ['百科', 5, '联合国安理会常任理事国有几个？', ['5 个', '4 个', '6 个', '10 个'], '5 个'],
  ['百科', 5, '诺贝尔和平奖在哪个城市颁发？', ['奥斯陆', '斯德哥尔摩', '哥本哈根', '赫尔辛基'], '奥斯陆'],
  ['百科', 5, '人类首次登上月球的年份是？', ['1969 年', '1959 年', '1979 年', '1989 年'], '1969 年'],
  ['百科', 5, '中国首次载人航天任务是？', ['神舟五号', '神舟一号', '嫦娥一号', '天宫一号'], '神舟五号'],
  ['百科', 5, '《蒙娜丽莎》收藏于哪座博物馆？', ['卢浮宫', '大英博物馆', '大都会艺术博物馆', '乌菲兹美术馆'], '卢浮宫'],
  ['百科', 5, '世界上海拔最高的高原是？', ['青藏高原', '巴西高原', '黄土高原', '云贵高原'], '青藏高原'],
].forEach(([cat, d, q, options, ans]) => QUIZ_BANK.push({ cat, d, q, options, ans }));

const QUIZ_RECENT_KEY = 'minxtok.game.quiz.recent.v1';
function readQuizRecent() {
  try {
    const arr = JSON.parse(safeGet(QUIZ_RECENT_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch (_) { return []; }
}
function rememberQuiz(text) {
  if (!text) return;
  const arr = readQuizRecent().filter(x => x !== text);
  arr.unshift(text);
  safeSet(QUIZ_RECENT_KEY, JSON.stringify(arr.slice(0, 80)));
}

/* ---------------- 扫雷 ---------------- */
function bindMinesweeper() {
  const boardEl = document.getElementById('mineBoard');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  const flagBtn = document.getElementById('mineFlagMode');
  if (!boardEl || !statusEl) return;
  // 每档棋盘和雷数都明显增加，不再只是 8×8 换 9×9
  const CFG = [[8, 8, 10], [10, 10, 16], [12, 12, 26], [14, 14, 40], [16, 16, 58]];
  let rows = 8, cols = 8, mines = 8;
  let cells = [];
  let started = false, over = false, win = false;
  let flags = 0, baseElapsed = 0, startedAt = 0, timer = null;
  let level = 2, resultText = '', recorded = false, flagMode = false;

  const elapsedNow = () => baseElapsed + (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
  const snapshot = () => ({
    rows, cols, mines,
    cells: cells.map(row => row.map(c => ({ mine: c.mine, open: c.open, flag: c.flag, near: c.near }))),
    started, over, win, flags, elapsed: elapsedNow(), result: resultText,
  });
  const save = makeSaver('minesweeper', snapshot, 320);
  bindLifecycle(boardEl, save);

  const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };
  const updateStatus = () => {
    if (over) {
      statusEl.textContent = `${win ? '完成' : '踩雷'} · ${elapsedNow()} 秒`;
    } else {
      statusEl.textContent = `剩余 ${Math.max(0, mines - flags)} 雷 · ${elapsedNow()} 秒`;
    }
  };
  const startTimer = () => {
    stopTimer();
    updateStatus();
    timer = setInterval(() => {
      if (!boardEl.isConnected) { stopTimer(); return; }
      updateStatus();
    }, 1000);
  };
  const updateFlagBtn = () => {
    if (!flagBtn) return;
    flagBtn.textContent = flagMode ? '挖开' : '插旗';
    flagBtn.classList.toggle('on', flagMode);
    flagBtn.setAttribute('aria-pressed', String(flagMode));
  };
  const render = () => {
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    boardEl.innerHTML = cells.map((row, r) => row.map((c, x) => {
      let cls = 'mine-cell';
      let text = '';
      let icon = '';
      if (c.open) {
        cls += ' open';
        if (c.mine) { cls += ' mine boom'; icon = 'bomb'; }
        else if (c.near) { cls += ' n' + c.near; text = String(c.near); }
      } else if (c.flag) {
        cls += ' flag';
        icon = 'flag';
      }
      if (over) {
        if (c.mine && !c.open) { cls += ' mine'; icon = 'bomb'; }
        if (c.flag && !c.mine) { cls += ' wrong'; icon = 'cross'; }
      }
      const body = icon ? `<img class="mine-icon" src="${MINE_ICONS[icon]}" alt="" draggable="false" loading="eager" decoding="sync">` : text;
      return `<button class="${cls}" type="button" data-r="${r}" data-c="${x}" ${over ? 'disabled' : ''} aria-label="第 ${r + 1} 行第 ${x + 1} 列">${body}</button>`;
    }).join('')).join('');
    updateFlagBtn();
    updateStatus();
  };
  const buildBlank = () => {
    const cfg = CFG[level - 1] || CFG[1];
    rows = cfg[0]; cols = cfg[1]; mines = cfg[2];
    cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, open: false, flag: false, near: 0 })));
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const placeMines = (sr, sc) => {
    const spots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) continue;
      spots.push({ r, c });
    }
    shuffle(spots).slice(0, mines).forEach(({ r, c }) => { cells[r][c].mine = true; });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cells[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && cells[rr][cc].mine) n++;
      }
      cells[r][c].near = n;
    }
    started = true;
    baseElapsed = 0;
    startedAt = Date.now();
    startTimer();
  };
  const openFlood = (sr, sc) => {
    const stack = [[sr, sc]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const cell = cells[r] && cells[r][c];
      if (!cell || cell.open || cell.flag || cell.mine) continue;
      cell.open = true;
      if (cell.near === 0) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) stack.push([rr, cc]);
        }
      }
    }
  };
  const finishGame = (isWin) => {
    over = true;
    win = isWin;
    stopTimer();
    baseElapsed = elapsedNow();
    startedAt = 0;
    resultText = isWin ? `扫雷完成，用时 ${baseElapsed} 秒` : `踩到雷了，用时 ${baseElapsed} 秒`;
    const msCost = revivePts('minesweeper', baseElapsed);
    const msScore = Math.max(0, Math.round(900 / Math.max(1, baseElapsed + 6)));
    setGameResult(resultText, isWin ? 'win' : 'lose', isWin ? { score: msScore } : {
      score: msScore,
      noPoints: true,
      reviveLabel: `排雷复活 · ${msCost} 积分`,
      revive: () => {
        if (!ptsSpendTotal(msCost)) { toast('积分不够复活'); return; }
        // 踩中的那颗雷拆掉，算作已排，接着扫
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const cell = cells[r][c];
          if (cell.open && cell.mine) { cell.mine = false; cell.open = true; mines = Math.max(0, mines - 1); }
        }
        over = false;
        win = false;
        started = true;
        resultText = '';
        startedAt = performance.now();
        setGameResult('', '');
        startTimer();
        render();
        save(true);
        checkWin();
      },
    });
    if (!recorded) {
      recorded = true;
      recordHistory('minesweeper', { score: baseElapsed, text: `${isWin ? '通关' : '失败'} ${baseElapsed} 秒`, win: isWin });
    }
    render();
    save(true);
  };
  const checkWin = () => {
    let opened = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cells[r][c].open && !cells[r][c].mine) opened++;
    }
    if (opened === rows * cols - mines) finishGame(true);
  };
  const reveal = (r, c) => {
    if (over) return;
    const cell = cells[r] && cells[r][c];
    if (!cell || cell.flag || cell.open) return;
    if (!started) placeMines(r, c);
    if (cell.mine) {
      cell.open = true;
      finishGame(false);
      return;
    }
    openFlood(r, c);
    render();
    save();
    checkWin();
  };
  const toggleFlag = (r, c) => {
    if (over) return;
    const cell = cells[r] && cells[r][c];
    if (!cell || cell.open) return;
    cell.flag = !cell.flag;
    flags += cell.flag ? 1 : -1;
    render();
    save();
  };
  const reset = () => {
    stopTimer();
    started = false; over = false; win = false;
    flags = 0; baseElapsed = 0; startedAt = 0;
    resultText = ''; recorded = false; flagMode = false;
    setGameResult('', '');
    buildBlank();
    render();
    save(true);
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  flagBtn && flagBtn.addEventListener('click', () => { flagMode = !flagMode; updateFlagBtn(); });
  boardEl.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.mine-cell');
    if (!b) return;
    e.preventDefault();
    toggleFlag(Number(b.dataset.r), Number(b.dataset.c));
  });
  boardEl.addEventListener('click', (e) => {
    const b = e.target.closest('.mine-cell');
    if (!b) return;
    const r = Number(b.dataset.r), c = Number(b.dataset.c);
    if (flagMode) toggleFlag(r, c);
    else reveal(r, c);
  });
  const diff = initDifficulty('minesweeper', (n) => { level = n; reset(); });
  level = diff.get();

  const saved = loadState('minesweeper');
  const valid = saved && Array.isArray(saved.cells)
    && Number.isInteger(saved.rows) && Number.isInteger(saved.cols) && Number.isInteger(saved.mines)
    && saved.rows === (CFG[level - 1] || CFG[1])[0]
    && saved.cols === (CFG[level - 1] || CFG[1])[1]
    && saved.mines === (CFG[level - 1] || CFG[1])[2]
    && saved.rows > 0 && saved.cols > 0
    && saved.cells.length === saved.rows
    && saved.cells.every(row => Array.isArray(row) && row.length === saved.cols
      && row.every(c => c && typeof c.mine === 'boolean' && typeof c.open === 'boolean' && typeof c.flag === 'boolean'));
  if (valid) {
    rows = saved.rows; cols = saved.cols; mines = saved.mines;
    cells = saved.cells.map(row => row.map(c => ({ mine: !!c.mine, open: !!c.open, flag: !!c.flag, near: Number(c.near) || 0 })));
    started = !!saved.started; over = !!saved.over; win = !!saved.win;
    flags = Number.isFinite(saved.flags) ? saved.flags : cells.flat().filter(c => c.flag).length;
    baseElapsed = Number.isFinite(saved.elapsed) ? saved.elapsed : 0;
    startedAt = started && !over ? Date.now() : 0;
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    render();
    if (started && !over) startTimer();
    if (over) setGameResult(resultText || `${win ? '完成' : '踩雷'}，用时 ${baseElapsed} 秒`, win ? 'win' : 'lose', {
      score: Math.max(0, Math.round(900 / Math.max(1, baseElapsed + 6))),
    });
    save(true);
  } else {
    reset();
  }
}

/* ---------------- 数字华容道 ---------------- */
const KLOTSKI_LEVELS = [
  { n: 3 }, // 8 个数字
  { n: 4 }, // 15 个数字
  { n: 5 }, // 24 个数字
  { n: 6 }, // 35 个数字
  { n: 7 }, // 48 个数字
];

function bindKlotski() {
  const boardEl = document.getElementById('klotskiBoard');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!boardEl || !statusEl) return;
  let n = 4;
  let tiles = [];
  let moves = 0;
  let over = false;
  let level = 2;
  let resultText = '';
  let recorded = false;

  const sizeFor = () => (KLOTSKI_LEVELS[level - 1] || KLOTSKI_LEVELS[1]).n;
  const solved = () => {
    const total = n * n;
    for (let i = 0; i < total - 1; i++) if (tiles[i] !== i + 1) return false;
    return tiles[total - 1] === 0;
  };
  const blankIndex = () => tiles.indexOf(0);
  const neighbors = (i) => {
    const r = Math.floor(i / n), c = i % n;
    const out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  };
  const scramble = () => {
    const total = n * n;
    tiles = Array.from({ length: total }, (_, i) => i === total - 1 ? 0 : i + 1);
    let blank = total - 1;
    let last = -1;
    const count = Math.max(160, total * 24);
    for (let k = 0; k < count; k++) {
      const opts = neighbors(blank).filter(x => x !== last);
      const pick = opts[Math.floor(Math.random() * opts.length)];
      tiles[blank] = tiles[pick];
      tiles[pick] = 0;
      last = blank;
      blank = pick;
    }
    if (solved()) scramble();
  };

  const snapshot = () => ({ n, tiles: tiles.slice(), moves, over, result: resultText });
  const save = makeSaver('klotski', snapshot, 260);
  bindLifecycle(boardEl, save);

  const render = () => {
    const win = over && solved();
    statusEl.textContent = win ? `完成 · ${moves} 步` : `步数 ${moves} · ${n}×${n}`;
    boardEl.style.setProperty('--klotski-n', n);
    boardEl.style.setProperty('--klotski-font', `${Math.min(20, Math.max(10, Math.round(330 / n)))}px`);
    boardEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${n}, 1fr)`;
    boardEl.style.aspectRatio = '1';
    boardEl.innerHTML = tiles.map((v, i) => v
      ? `<button class="klotski-block" type="button" data-i="${i}" aria-label="数字 ${v}">${v}</button>`
      : '<span class="klotski-blank" aria-hidden="true"></span>'
    ).join('') + (win ? `<div class="klotski-win"><b>出关成功</b><span>${moves} 步</span></div>` : '');
  };
  const checkWin = () => {
    if (over || !solved()) return;
    over = true;
    resultText = `出关成功，用了 ${moves} 步`;
    setGameResult(resultText, 'win', { points: Math.max(60, 240 - moves * 2) });
    if (!recorded) {
      recorded = true;
      recordHistory('klotski', { score: moves, text: `${moves} 步` });
    }
    render();
    save(true);
  };
  const moveTile = (i) => {
    if (over || !Number.isInteger(i)) return;
    const blank = blankIndex();
    const br = Math.floor(blank / n), bc = blank % n;
    const r = Math.floor(i / n), c = i % n;
    if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return;
    tiles[blank] = tiles[i];
    tiles[i] = 0;
    moves++;
    render();
    save();
    checkWin();
  };
  const slideFrom = (dx, dy) => {
    if (over) return;
    const blank = blankIndex();
    const br = Math.floor(blank / n), bc = blank % n;
    const tr = br - dy, tc = bc - dx;
    if (tr < 0 || tr >= n || tc < 0 || tc >= n) return;
    moveTile(tr * n + tc);
  };
  const reset = () => {
    n = sizeFor();
    moves = 0;
    over = false;
    resultText = '';
    recorded = false;
    scramble();
    setGameResult('', '');
    render();
    save(true);
  };

  resetBtn && resetBtn.addEventListener('click', reset);
  document.querySelectorAll('.klotski-pad .pad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.act;
      if (a === 'up') slideFrom(0, -1);
      else if (a === 'down') slideFrom(0, 1);
      else if (a === 'left') slideFrom(-1, 0);
      else if (a === 'right') slideFrom(1, 0);
    });
  });
  let suppressClickUntil = 0;
  let sx = 0, sy = 0, swipeId = null;
  boardEl.addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) return;
    const b = e.target.closest('.klotski-block');
    if (!b) return;
    moveTile(Number(b.dataset.i));
  });
  boardEl.style.touchAction = 'none';
  boardEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.klotski-block');
    if (!b) return;
    swipeId = e.pointerId;
    sx = e.clientX; sy = e.clientY;
  });
  boardEl.addEventListener('pointerup', (e) => {
    if (swipeId === null) return;
    swipeId = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    suppressClickUntil = Date.now() + 360;
    if (Math.abs(dx) > Math.abs(dy)) slideFrom(dx > 0 ? 1 : -1, 0);
    else slideFrom(0, dy > 0 ? 1 : -1);
  });
  boardEl.addEventListener('pointercancel', () => { swipeId = null; });
  const onKey = (e) => {
    if (!boardEl.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); slideFrom(0, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); slideFrom(0, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); slideFrom(-1, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); slideFrom(1, 0); }
  };
  window.addEventListener('keydown', onKey);

  const diff = initDifficulty('klotski', (n) => { level = n; reset(); });
  level = diff.get();
  n = sizeFor();

  const saved = loadState('klotski');
  const valid = saved && saved.n === n && Array.isArray(saved.tiles)
    && saved.tiles.length === n * n
    && saved.tiles.every(v => Number.isInteger(v) && v >= 0 && v < n * n)
    && new Set(saved.tiles).size === n * n;
  if (valid) {
    tiles = saved.tiles.slice();
    moves = Number.isFinite(saved.moves) ? saved.moves : 0;
    over = !!saved.over && solved();
    resultText = typeof saved.result === 'string' ? saved.result : '';
    recorded = over;
    render();
    if (over) setGameResult(resultText || `出关成功，用了 ${moves} 步`, 'win', { points: Math.max(60, 240 - moves * 2) });
    save(true);
  } else {
    reset();
  }
}

/* ---------------- 街机小游戏公共配色（适配深/浅色） ---------------- */
function arcadeTheme() {
  const light = document.documentElement.dataset.theme === 'light';
  if (light) {
    return {
      light: true,
      bg1: '#ffffff', bg2: '#e9f0fa',
      star: 'rgba(37,99,235,.16)',
      floor: 'rgba(37,99,235,.08)', floorLine: '#8fb0d8', floorDash: 'rgba(37,99,235,.18)',
      player: '#2563eb', playerEye: '#ffffff',
      spike: '#dc2626', block: '#c2760a', bar: '#7c3aed', bullet: '#b45309', bulletTrail: 'rgba(180,83,9,.18)',
      plat: '#d7e2f2', platEdge: 'rgba(37,99,235,.28)',
      danger: 'rgba(220,38,38,', text: '#0f1115', sub: '#5b6472',
      mazeBg: '#f5f8fd', wall: '#c2cfe2', wallEdge: 'rgba(37,99,235,.10)',
      floorTile: '#ffffff', trail: 'rgba(37,99,235,.10)',
      enemy: '#e11d48', enemyEye: '#ffffff',
      exit: '#16a34a', exitText: '#ffffff',
      dark: 'rgba(9,14,24,.55)',
    };
  }
  return {
    light: false,
    bg1: '#0a1220', bg2: '#0d1a2c',
    star: 'rgba(150,190,255,.18)',
    floor: 'rgba(120,170,255,.16)', floorLine: 'rgba(150,200,255,.55)', floorDash: 'rgba(120,170,255,.10)',
    player: '#8fb8ff', playerEye: '#eaf2ff',
    spike: '#ff8f8f', block: 'rgba(255,190,120,.9)', bar: 'rgba(180,160,255,.9)', bullet: '#ffe27a', bulletTrail: 'rgba(255,226,122,.25)',
    plat: 'rgba(84,120,170,.38)', platEdge: 'rgba(150,200,255,.65)',
    danger: 'rgba(255,90,90,', text: '#dce8ff', sub: 'rgba(220,232,255,.66)',
    mazeBg: '#06090f', wall: 'rgba(122,160,220,.34)', wallEdge: 'rgba(122,160,220,.10)',
    floorTile: 'rgba(140,180,255,.10)', trail: 'rgba(140,180,255,.24)',
    enemy: '#ff6b6b', enemyEye: '#2a0d0d',
    exit: '#4ade80', exitText: '#05140c',
    dark: 'rgba(2,4,8,.68)',
  };
}

/* ---------------- 勇往直前（横版跑酷） ---------------- */
function bindRunner() {
  const canvas = document.getElementById('runnerCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const GROUND = H - 58;
  const GRAV = 1700;
  const JUMP_V = 560;
  const PLAT_Y = GROUND - 68;


  const LEVELS = {
    1: { speed: 148, spawn: 1.5, slideChance: 0.10, ramp: 4, lives: 5, pillar: 46 },
    2: { speed: 170, spawn: 1.42, slideChance: 0.16, ramp: 5, lives: 4, pillar: 54 },
    3: { speed: 194, spawn: 1.3, slideChance: 0.22, ramp: 6.2, lives: 3, pillar: 60 },
    4: { speed: 220, spawn: 1.16, slideChance: 0.28, ramp: 8.5, lives: 2, pillar: 66 },
    5: { speed: 248, spawn: 1.02, slideChance: 0.34, ramp: 10, lives: 1, pillar: 70 },
  };
  const TARGETS = { 1: 400, 2: 800, 3: 1200, 4: 1600, 5: 2000 };

  let level = 2;
  let P = LEVELS[level];
  let T = arcadeTheme();
  let themeAt = 0;
  let running = false;
  let over = false;
  let recorded = false;
  let raf = 0;
  let lastT = 0;
  let speed = 0;
  let dist = 0;
  let passed = 0;
  let lives = 4;
  let invuln = 0;
  let spawnIn = 0;
  let flash = 0;
  let obs = [];       // 需要下滑躲的（子弹、横杆）和落地的尖刺
  let pillars = [];   // 柱子：能踩上去，侧面撞上就出局
  let plats = [];     // 高台：左侧斜坡走上去，平台上的小方块会炸
  let buttons = [];   // 地面按钮：踩了顶上掉尖刺
  let drops = [];     // 正在下落的尖刺
  let coins = [];     // 金币就是积分，一枚 +10
  let impacts = [];   // 尖刺落地的尘土，纯表现
  let coinGot = 0;
  let targetMeters = TARGETS[2];
  let cleared = false;
  let awarded = 0;
  let hudAt = 0;
  let crashKind = '';
  const player = { x: 76, y: GROUND, vy: 0, w: 24, h: 38, slide: 0, air: false, onPillar: null, onPlat: null };
  let dying = false;
  let lastGroundAt = 0;
  let revives = 3;

  const score = () => Math.floor(dist / 10) + passed * 5 + coinGot * 10;
  const meters = () => Math.floor(dist / 10);
  const showClear = () => toast(`达标 ${targetMeters} 米，三星到手，继续跑`);
  const pTop = () => (player.slide > 0 ? 16 : player.h);
  const feet = () => player.y;
  const surfaceTop = (p) => GROUND - p.h;
  const terrainAt = (x) => {
    for (const p of plats) {
      const top = p.x + p.rampW;
      if (x >= top && x <= top + p.w) return { p, y: p.y };
      if (x >= p.x && x < top) {
        const t = (x - p.x) / p.rampW;
        return { p, y: GROUND - t * (GROUND - p.y) };
      }
    }
    return { p: null, y: GROUND };
  };

  const paintHud = (force) => {
    const now = performance.now();
    if (!force && now - hudAt < 180) return;
    hudAt = now;
    statusEl.textContent = `得分 ${score()} · ${meters()}/${targetMeters} 米${cleared ? ' 已达标' : ''} · 金币 ${coinGot} · 生命 ${lives}`;
  };

  const reset = () => {
    P = LEVELS[level] || LEVELS[2];
    targetMeters = TARGETS[level] || TARGETS[2];
    running = true;
    over = false;
    saveState('runner', {});
    recorded = false;
    speed = P.speed;
    dist = 0;
    passed = 0;
    lives = P.lives;
    invuln = 1.2;
    spawnIn = 1.1;
    flash = 0;
    obs = [];
    pillars = [];
    plats = [];
    buttons = [];
    drops = [];
    impacts = [];
    coins = [];
    coinGot = 0;
    cleared = false;
    awarded = 0;
    crashKind = '';
    dying = false;
    player.x = 76;
    player.y = GROUND; player.vy = 0; player.slide = 0; player.air = false; player.onPillar = null; player.onPlat = null;
    lastGroundAt = performance.now();
    canvas.reviveShown = false;
    setGameResult('', '');
    paintHud(true);
  };

  const onGround = () => player.onPillar || !player.air || player.y >= GROUND - 0.6;
  const jump = () => {
    if (over || !running) return;
    if (onGround() || performance.now() - lastGroundAt < 110) {
      player.vy = -JUMP_V;
      player.slide = 0;
      player.air = true;
      player.onPillar = null;
      player.onPlat = null;
      lastGroundAt = 0;
    }
  };
  const slide = () => {
    if (over || !running) return;
    if (!onGround()) { player.vy = Math.max(player.vy, 480); return; }
    player.slide = 0.66;
  };

  const pushCoins = (x, y, n) => {
    for (let i = 0; i < n; i += 1) {
      coins.push({ x: x + i * 24, y: y - Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 12, r: 7, vx: speed, got: false });
    }
  };

  const spawnPlatform = () => {
    const p = {
      x: W + 40, y: PLAT_Y, w: 200, rampW: 240, vx: speed, passed: false,
      crates: [{ dx: 140, boom: false }, { dx: 185, boom: false }],
      bombs: [],
    };
    plats.push(p);
    // 斜坡金币线上随机挑最多两个位置换成炸弹
    const slots = [];
    for (let i = 0; i < 5; i += 1) slots.push(0.15 + i * 0.175);
    const bombN = Math.random() < 0.72 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
    const bombIdx = new Set();
    while (bombIdx.size < bombN) bombIdx.add(Math.floor(Math.random() * slots.length));
    bombIdx.forEach((i) => p.bombs.push({ t: slots[i], boom: false }));
    // 剩下的位置照旧铺金币，越往上越高
    slots.forEach((t, i) => {
      if (bombIdx.has(i)) return;
      coins.push({
        x: p.x + p.rampW * t,
        y: GROUND - (GROUND - p.y) * t - 16,
        r: 7, vx: speed, got: false,
      });
    });
    pushCoins(p.x + p.rampW + 10, p.y - 16, 3);
  };

  const spawn = () => {
    // 高台经过时不再生成柱子/按钮/子弹，免得斜坡上突然顶出一根柱子
    if (plats.length) {
      spawnIn = P.spawn * 0.7;
      return;
    }
    const incoming = pillars.some((p) => p.x + p.w > W - 130)
      || buttons.some((b) => b.x + b.w > W - 130)
      || obs.some((o) => o.x + o.w > W - 130);
    // 高台是稀客：一次只来一个，从左侧斜坡走上去
    if (!incoming && passed > 2 && Math.random() < 0.16) {
      spawnPlatform();
      spawnIn = P.spawn * 1.45 * (0.9 + Math.random() * 0.25);
      return;
    }
    const r = Math.random();
    const bus = obs.some((o) => o.kind === 'spike' && o.x > W - 240);
    let kind = 'pillar';
    if (r > 0.82 && !bus && passed > 1) kind = 'button';
    else if (r > 0.82 - P.slideChance) kind = 'bullet';
    if (r < 0.42) kind = 'pillar';

    if (kind === 'pillar') {
      const h = Math.round(P.pillar * (0.62 + Math.random() * 0.5));
      const w = 24 + Math.round(Math.random() * 8);
      const p = { x: W + 40, w, h, vx: speed };
      pillars.push(p);
      // 柱子顶上的金币，跳上去就能吃到
      if (Math.random() < 0.6) {
        coins.push({ x: p.x + w / 2, y: surfaceTop(p) - 14, r: 7, vx: speed, got: false });
      }
    } else if (kind === 'button') {
      buttons.push({ x: W + 40, w: 38, vx: speed, used: false });
    } else if (kind === 'bullet') {
      obs.push({ kind, x: W + 60, y: GROUND - 46, w: 20, h: 20, vx: speed + 46 });
    }
    // 柱子/尖刺一类的，落地后玩家要留出反应距离，空隙按速度收放
    const gapScale = Math.max(0.66, P.speed / speed);
    spawnIn = P.spawn * gapScale * (0.85 + Math.random() * 0.4);
    // 金币贴着地面飘，别再跟空中的子弹撞在同一层
    pushCoins(W + 78, GROUND - (16 + Math.random() * 10), 3 + Math.floor(Math.random() * 2));
  };

  const gameOver = (why) => {
    if (recorded) return;
    over = true;
    running = false;
    saveState('runner', {});
    crashKind = why || '';
    const head = cleared ? `已达标 ${targetMeters} 米` : why === 'side' ? '撞柱子上了' : why === 'spike' ? '被尖刺砸中了' : why === 'crate' ? '被平台上的炸药方块炸到了' : why === 'rampBomb' ? '被斜坡上的炸弹炸到了' : '撞上了';
    const cost = revivePts('runner', meters());
    const stars = cleared ? 3 : Math.max(0, Math.min(2, Math.floor((meters() / targetMeters) * 2)));
    // 积分按整局表现结算；复活后只补发新增的部分，避免重复记分
    const want = performancePoints(score(), cleared ? 'win' : 'lose');
    const delta = Math.max(0, want - awarded);
    if (delta > 0) awarded = want;
    const extra = { stars, score: score(), bank: awarded };
    if (delta > 0) extra.points = delta;
    else extra.noPoints = true;
    if (revives > 0) {
      extra.reviveLabel = `复活 · ${cost} 积分（还剩 ${revives} 次）`;
      extra.revive = () => {
        if (!ptsSpendTotal(cost)) { toast('积分不够复活'); return; }
        revives -= 1;
        lives = P.lives;
        invuln = 2.5;
        obs = []; pillars = []; plats = []; buttons = []; drops = []; impacts = [];
        spawnIn = 1.6;
        dying = false;
        player.x = 76;
        player.y = GROUND; player.vy = 0; player.air = false; player.onPillar = null; player.onPlat = null;
        over = false;
        running = true;
        recorded = false;
        flash = 0;
        setGameResult('', '');
        paintHud(true);
      };
    }
    setGameResult(`${head}，跑了 ${meters()} 米，得分 ${score()}`, cleared ? 'win' : 'lose', extra);
    if (!recorded) {
      recorded = true;
      recordHistory('runner', { score: score(), text: `${meters()} 米 · 得分 ${score()}` });
    }
  };

  const hurt = (why) => {
    if (invuln > 0) return;
    lives -= 1;
    invuln = 2.2;
    flash = 0.35;
    if (lives <= 0) gameOver(why);
  };

  const hitBox = (o) => {
    const ph = pTop();
    const py = feet() - ph;
    return player.x - player.w / 2 < o.x + o.w && player.x + player.w / 2 > o.x && py < o.y + o.h && py + ph > o.y;
  };

  const update = (dt) => {
    speed = Math.min(P.speed + 190, speed + P.ramp * dt);
    dist += speed * dt;
    if (!cleared && meters() >= targetMeters) {
      cleared = true;
      showClear();
      paintHud(true);
    }
    spawnIn -= dt;
    if (spawnIn <= 0) spawn();
    if (player.slide > 0) player.slide = Math.max(0, player.slide - dt);
    if (invuln > 0) invuln = Math.max(0, invuln - dt);
    if (flash > 0) flash = Math.max(0, flash - dt);

    // ---- 竖直物理 ----
    const prevY = player.y;
    const surf = terrainAt(player.x);
    if (player.onPillar) {
      const p = player.onPillar;
      if (p.x < player.x + player.w / 2 && p.x + p.w > player.x - player.w / 2) {
        player.y = surfaceTop(p);
        player.vy = 0;
        player.air = false;
      } else {
        player.onPillar = null;
        player.air = true;
        player.vy = 0;
      }
    } else {
      // 站在斜坡/平台上时贴着地面走；走出平台边缘才真正下落
      if (!player.air && !surf.p && player.onPlat && surf.y > player.y + 10) {
        player.air = true;
        player.onPlat = null;
        player.vy = 0;
      } else if (!player.air) {
        player.y = surf.y;
        player.vy = 0;
        player.onPlat = surf.p;
      }
      if (player.air) {
        player.vy += GRAV * dt;
        player.y += player.vy * dt;
        if (player.y >= surf.y) {
          if (surf.p) player.onPlat = surf.p;
          player.y = surf.y; player.vy = 0; player.air = false;
          lastGroundAt = performance.now();
        }
      }
    }

    // ---- 物体前移 ----
    for (const o of obs) {
      o.x -= o.vx * dt;
      if (!o.passed && o.kind !== 'spike' && o.x + o.w < player.x - player.w / 2) { o.passed = true; passed += 1; }
      if (!o.passed && o.kind === 'spike' && o.x + o.w < player.x - player.w / 2) { o.passed = true; passed += 1; }
    }
    obs = obs.filter((o) => o.x + o.w > -40);
    for (const p of pillars) {
      p.x -= p.vx * dt;
      if (!p.passed && p.x + p.w < player.x - player.w / 2) { p.passed = true; passed += 1; }
    }
    pillars = pillars.filter((p) => p.x + p.w > -60);
    for (const p of plats) {
      p.x -= p.vx * dt;
      if (!p.passed && p.x + p.rampW + p.w < player.x - player.w / 2) { p.passed = true; passed += 1; }
    }
    plats = plats.filter((p) => p.x + p.rampW + p.w > -60);
    if (player.onPlat && !plats.includes(player.onPlat)) player.onPlat = null;
    for (const b of buttons) b.x -= b.vx * dt;
    buttons = buttons.filter((b) => b.x + b.w > -40);
    for (const c of coins) c.x -= c.vx * dt;
    for (const im of impacts) im.t -= dt;
    impacts = impacts.filter((im) => im.t > 0);

    // ---- 高台斜坡：金币位换成的炸弹 ----
    for (const p of plats) {
      for (const b of p.bombs) {
        if (b.boom) continue;
        const bx = p.x + p.rampW * b.t;
        const by = GROUND - (GROUND - p.y) * b.t - 8;
        const py = feet();
        const ph = pTop();
        if (player.x + player.w / 2 > bx - 8 && player.x - player.w / 2 < bx + 8
          && py > by - 8 && py - ph < by + 8) {
          b.boom = true;
          impacts.push({ x: bx, y: by, t: 0.4, dur: 0.4, crate: true });
          flash = Math.max(flash, 0.4);
          player.onPlat = null;
          player.onPillar = null;
          player.vy = -260;
          player.air = true;
          hurt('rampBomb');
        }
      }
    }

    // ---- 高台：平台上的爆炸方块 ----
    for (const p of plats) {
      for (const c of p.crates) {
        if (c.boom) continue;
        const cx = p.x + p.rampW + c.dx;
        const cy = p.y - 14;
        const py1 = feet() - pTop();
        const py2 = feet();
        if (player.x + player.w / 2 > cx && player.x - player.w / 2 < cx + 13
          && py2 > cy && py1 < cy + 14) {
          c.boom = true;
          impacts.push({ x: cx + 6, t: 0.4, dur: 0.4, crate: true });
          flash = Math.max(flash, 0.4);
          player.onPlat = null;
          player.onPillar = null;
          player.vy = -280;
          player.air = true;
          hurt('crate');
        }
      }
    }

    // ---- 柱子：踩上去 or 侧撞 ----
    for (const p of pillars) {
      const overlapX = p.x < player.x + player.w / 2 && p.x + p.w > player.x - player.w / 2;
      if (!overlapX) continue;
      const top = surfaceTop(p);
      const comingDown = player.vy >= 0;
      const aboveTop = prevY <= top + 8 || (player.y - player.vy * dt) <= top + 8;
      if (!player.onPillar && comingDown && aboveTop && player.y >= top - 2) {
        player.y = top;
        player.vy = 0;
        player.air = false;
        player.onPillar = p;
      } else if (player.y > top + 8) {
        // 侧面撞上：被柱子顶住，往后拖出画面再判失败
        if (!dying) {
          dying = true;
          over = true;
          running = false;
          const t0 = performance.now();
          const dragOut = () => {
            player.x -= 8;
            if (player.x > -46 && performance.now() - t0 < 520) gRaf(dragOut);
            else gameOver('side');
          };
          gRaf(dragOut);
        }
        return;
      }
    }

    // ---- 金币 ----
    const cy = feet() - (player.slide > 0 ? 9 : 19);
    for (const c of coins) {
      if (c.got) continue;
      if (Math.hypot(c.x - player.x, c.y - cy) < c.r + 22) { c.got = true; coinGot += 1; }
    }
    coins = coins.filter((c) => c.x > -30 && !c.got);

    // ---- 按钮 -> 顶上掉尖刺（落点跟着角色走）----
    for (const b of buttons) {
      if (b.used) continue;
      // 只有真的站在按钮上（脚踩地、没在跳、没站柱子上）才算踩下
      const onPad = !!onGround() && player.y >= GROUND - 2;
      if (onPad && player.x + player.w / 2 > b.x && player.x - player.w / 2 < b.x + b.w && !player.onPillar) {
        b.used = true;
        // 前方固定位置砸下一根尖刺，落点不再跟着你跑，跳开或滑过去都能躲
        drops.push({ x: player.x, y: -30, vy: 0, done: false });
      }
    }
    // 天降尖刺：落点随世界一起往前滚，落地就消失
    for (const d of drops) {
      // 落点就是踩按钮那一刻你站的位置，不跟着画面滚，也不追着你走
      d.vy += 900 * dt;
      d.y += d.vy * dt;
      if (d.y >= GROUND - 26) {
        d.done = true;
        impacts.push({ x: d.x, t: 0.26 });
        // 站在落点上才被砸，跳起来躲开就没事
        if (invuln <= 0 && !player.air && Math.abs(player.x - d.x) < 22 && !player.onPillar) hurt('spike');
      }
    }
    drops = drops.filter((d) => !d.done);

    // ---- 撞判定 ----
    if (invuln <= 0) {
      for (const o of obs) {
        if (hitBox(o)) {
          hurt(o.kind === 'spike' ? 'spike' : 'hit');
          for (const x of obs) if (x.x > player.x - 60 && x.x < player.x + 240) x.x = -999;
          break;
        }
      }
    }
    paintHud();
  };

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.closePath();
  };

  // 尖朝下：这是从顶上砸下来的东西，别画成地上的三角
  const spikeShape = (x, y, w, h) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.closePath();
    ctx.fill();
  };

  let joyActive = false;
  let joyBX = W - 48, joyBY = H - 74, joyDX = 0, joyDY = 0;

  const render = () => {
    const now = performance.now();
    if (now - themeAt > 500) { themeAt = now; T = arcadeTheme(); }

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, T.bg1);
    g.addColorStop(1, T.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = T.star;
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 53 - dist * 0.05) % (W + 40) + W + 40) % (W + 40) - 20;
      const y = 18 + ((i * 37) % 150);
      ctx.fillRect(x, y, 2, 2);
    }

    // 地面
    ctx.fillStyle = T.floor;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = T.floorLine;
    ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = T.floorDash;
    for (let i = 0; i < 40; i += 1) {
      const x = ((i * 41 - dist) % (W + 40) + W + 40) % (W + 40) - 20;
      ctx.fillRect(x, GROUND + 12, 12, 2);
    }

    // 高台：左侧是斜坡，走上去就是一块更高的平地
    for (const p of plats) {
      ctx.fillStyle = T.plat || T.block2 || '#a8b0c4';
      ctx.beginPath();
      ctx.moveTo(p.x, GROUND);
      ctx.lineTo(p.x + p.rampW, p.y);
      ctx.lineTo(p.x + p.rampW + p.w, p.y);
      ctx.lineTo(p.x + p.rampW + p.w, GROUND + 8);
      ctx.lineTo(p.x, GROUND + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = T.platEdge || 'rgba(255,255,255,.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, GROUND);
      ctx.lineTo(p.x + p.rampW, p.y);
      ctx.lineTo(p.x + p.rampW + p.w, p.y);
      ctx.stroke();
      for (const b of p.bombs) {
        if (b.boom) continue;
        const bx = p.x + p.rampW * b.t;
        const by = GROUND - (GROUND - p.y) * b.t - 8;
        ctx.fillStyle = '#2b303b';
        ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        ctx.beginPath(); ctx.arc(bx - 2.5, by - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx + 5, by - 6);
        ctx.lineTo(bx + 9, by - 11);
        ctx.stroke();
        ctx.fillStyle = '#ffb020';
        ctx.beginPath(); ctx.arc(bx + 9, by - 12, 2, 0, Math.PI * 2); ctx.fill();
      }
      for (const c of p.crates) {
        if (c.boom) continue;
        const cx = p.x + p.rampW + c.dx;
        const cy = p.y - 14;
        ctx.fillStyle = '#e0554b';
        rr(cx, cy, 13, 14, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.42)';
        ctx.fillRect(cx + 3, cy + 3, 7, 2);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(cx + 7, cy - 1, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 柱子
    for (const p of pillars) {
      const top = surfaceTop(p);
      const pg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      pg.addColorStop(0, T.block || '#8b93a8');
      pg.addColorStop(0.55, T.block2 || '#a8b0c4');
      pg.addColorStop(1, T.block || '#8b93a8');
      ctx.fillStyle = pg;
      rr(p.x, top, p.w, p.h, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.26)';
      rr(p.x, top, p.w, 5, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.20)';
      ctx.fillRect(p.x + 4, top + 12, p.w - 8, 2);
      ctx.fillRect(p.x + 4, top + 24, p.w - 8, 2);
    }

    // 地面按钮
    for (const b of buttons) {
      ctx.fillStyle = b.used ? 'rgba(120,130,150,.5)' : '#e0554b';
      rr(b.x, GROUND - 7, b.w, 9, 3);
      ctx.fill();
      ctx.fillStyle = b.used ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.75)';
      ctx.fillRect(b.x + 5, GROUND - 4, b.w - 10, 2);
    }

    // 下落中的尖刺：底下一条提示线，玩家知道它砸哪儿
    for (const d of drops) {
      ctx.strokeStyle = 'rgba(224,85,75,.35)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + 26);
      ctx.lineTo(d.x, GROUND);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.spike || '#d9534f';
      spikeShape(d.x - 12, d.y, 24, 26);
      ctx.fillStyle = T.bg2;
      ctx.fillRect(d.x - 5, d.y + 26, 10, 3);
    }

    // 尖刺落地的尘土
    for (const im of impacts) {
      const p = 1 - im.t / (im.dur || 0.26);
      const iy = im.y !== undefined ? im.y : (im.crate ? PLAT_Y - 6 : GROUND - 3);
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.5;
      ctx.fillStyle = im.crate ? '#f08a3c' : (T.spike || '#d9534f');
      ctx.beginPath();
      ctx.ellipse(im.x, iy, (im.crate ? 8 : 6) + p * (im.crate ? 30 : 22), 3 + p * (im.crate ? 7 : 4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 金币
    for (const c of coins) {
      const bob = Math.sin(now / 260 + c.x * 0.1) * 1.6;
      ctx.fillStyle = '#f5c542';
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,10,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, c.r - 1.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(c.x - c.r * 0.3, c.y + bob - c.r * 0.32, c.r * 0.26, 0, Math.PI * 2); ctx.fill();
    }

    // 障碍
    for (const o of obs) {
      if (o.kind === 'spike') {
        ctx.fillStyle = T.spike || '#d9534f';
        spikeShape(o.x, o.y, o.w, o.h);
        ctx.fill();
      } else if (o.kind === 'bar') {
        ctx.fillStyle = T.bar || '#c98b3a';
        rr(o.x, o.y, o.w, o.h, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.fillRect(o.x + 3, o.y + o.h - 5, o.w - 6, 3);
      } else {
        ctx.fillStyle = T.bulletTrail || 'rgba(255,180,80,.35)';
        ctx.fillRect(o.x - 18, o.y + o.h / 2 - 3, 18, 6);
        ctx.fillStyle = T.bullet || '#ffb347';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 人物
    const ph = pTop();
    const py = feet() - ph;
    const blink = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.fillStyle = T.player || '#59c0a0';
    rr(player.x - player.w / 2, py, player.w, ph, 8);
    ctx.fill();
    ctx.fillStyle = T.playerEye || '#0b1a14';
    ctx.beginPath();
    ctx.arc(player.x + 6, py + 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 摇杆（只在画布里，上下两个方向）
    const jx = joyActive ? joyBX : W - 48;
    const jy = joyActive ? joyBY : H - 74;
    ctx.globalAlpha = joyActive ? 0.9 : 0.42;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(jx, jy - 34);
    ctx.lineTo(jx, jy + 34);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    ctx.arc(jx, jy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(jx, jy + joyDY * 26, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = gameFont(10, 700);
    ctx.textAlign = 'center';
    ctx.fillText('跳', jx, jy - 40);
    ctx.fillText('滑', jx, jy + 50);
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;

    if (flash > 0) {
      ctx.fillStyle = (T.danger || 'rgba(217,83,79,') + (flash * 0.5) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  const loop = (t) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (running && !over) update(dt);
    render();
    raf = gRaf(loop);
  };

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  let downAt = 0;
  let dragged = false;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    joyActive = true;
    joyBX = Math.max(42, Math.min(W - 42, p.x));
    joyBY = Math.max(50, Math.min(H - 50, p.y));
    joyDX = 0; joyDY = 0;
    downAt = performance.now();
    dragged = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!joyActive) return;
    const p = point(e);
    joyDY = Math.max(-1, Math.min(1, (p.y - joyBY) / 34));
    joyDX = 0;
    if (Math.abs(joyDY) > 0.18) dragged = true;
    if (joyDY < -0.3) jump();
    else if (joyDY > 0.3) player.slide = Math.max(player.slide, 0.12);
  });
  const release = () => {
    if (!joyActive) return;
    joyActive = false;
    joyDX = 0; joyDY = 0;
    if (!dragged && performance.now() - downAt < 260) jump();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const onKey = (e) => {
    if (!canvas.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); jump(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); slide(); }
  };
  window.addEventListener('keydown', onKey);

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('runner', (n) => { level = n; reset(); });
  level = diff.get();

  // 先取存档再开新局，reset() 会顺手把旧档清掉
  const savedRun = loadState('runner');
  reset();
  mountPause('runner', () => {
    if (over) return;
    saveState('runner', { dist, passed, coinGot, lives, level });
  });
  if (savedRun && Number(savedRun.dist) > 40) {
    dist = Number(savedRun.dist) || 0;
    passed = Number(savedRun.passed) || 0;
    coinGot = Number(savedRun.coinGot) || 0;
    lives = Math.max(1, Number(savedRun.lives) || P.lives);
    level = Math.max(1, Math.min(5, Number(savedRun.level) || level));
    P = LEVELS[level] || P;
    targetMeters = TARGETS[level] || TARGETS[2];
    cleared = meters() >= targetMeters;
    invuln = 2;
    spawnIn = 1.4;
    paintHud(true);
    toast('已恢复上次的进度');
  }
  gRaf(loop);
}


/* ---------------- 疯狂虾虾（迷宫逃脱） ---------------- */
const ITEM_IMG = {};
function preloadItemEmoji() {
  [['speed', '/assets/apple/26a1.png'], ['clone', '/assets/apple/1f465.png'], ['ghost', '/assets/apple/1f47b.png']]
    .forEach(([k, src]) => {
      if (ITEM_IMG[k]) return;
      const im = new Image();
      im.src = src;
      ITEM_IMG[k] = im;
    });
}

function bindMaze() {
  const canvas = document.getElementById('mazeCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 360;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const LEVELS = {
    1: { n: 5, enemies: 1, step: 620, cycle: 12, dark: 1.4, items: 4, loops: 0.22 },
    2: { n: 6, enemies: 2, step: 570, cycle: 11, dark: 1.6, items: 4, loops: 0.20 },
    3: { n: 7, enemies: 2, step: 510, cycle: 10, dark: 1.8, items: 5, loops: 0.18 },
    4: { n: 8, enemies: 3, step: 460, cycle: 9, dark: 2.0, items: 5, loops: 0.16 },
    5: { n: 9, enemies: 3, step: 410, cycle: 8, dark: 2.2, items: 6, loops: 0.14 },
  };

  let level = 2;
  let P = LEVELS[level];
  let T = arcadeTheme();
  let themeAt = 0;
  let N = 13;
  let cell = 26;
  let grid = [];
  let visited = new Set();
  let player = { x: 1, y: 1 };
  let exit = { x: 1, y: 1 };
  let enemies = [];
  let items = [];
  let lives = 3;
  let revives = 3;
  let over = false;
  let won = false;
  let recorded = false;
  let raf = 0;
  let lastT = 0;
  let elapsed = 0;
  let moveCd = 0;
  let invuln = 0;
  let speedUntil = 0;
  let invisUntil = 0;
  let clone = null;
  let blackout = false;
  let phaseT = 0;
  let stepAcc = 0;
  let now = 0;
  let hudAt = 0;
  let hint = '';
  let lightMap = new Map();
  let popup = null;   // 吃到道具时在角色头顶飘一行字，效果不再只是 HUD 里的小字

  const K = (x, y) => x + ',' + y;
  const id = (x, y) => y * N + x;
  const open = (x, y) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && !grid[id(x, y)];

  const farTile = (fromX, fromY, min) => {
    const pool = [];
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        if (!grid[id(x, y)] && Math.abs(x - fromX) + Math.abs(y - fromY) >= min) pool.push({ x, y });
      }
    }
    if (!pool.length) return { x: 1, y: 1 };
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const build = () => {
    N = P.n * 2 + 1;
    cell = Math.floor((W - 12) / N);
    grid = new Array(N * N).fill(true);
    grid[id(1, 1)] = false;
    const stack = [[1, 1]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]].sort(() => Math.random() - 0.5);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && grid[id(nx, ny)]) {
          grid[id(cx + dx / 2, cy + dy / 2)] = false;
          grid[id(nx, ny)] = false;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }

    // 打通一部分墙，做出多岔路与环路，不再只有一条独木桥
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        if (!grid[id(x, y)]) continue;
        if (x % 2 === 0 && y % 2 === 0) continue; // 保留柱子
        if (Math.random() < P.loops) grid[id(x, y)] = false;
      }
    }

    player = { x: 1, y: 1 };
    exit = { x: N - 2, y: N - 2 };
    visited = new Set([K(1, 1)]);

    enemies = [];
    for (let i = 0; i < P.enemies; i++) {
      const t = farTile(1, 1, Math.max(4, Math.floor(N * 0.4)));
      enemies.push({ x: t.x, y: t.y, last: null, stun: 0 });
    }

    items = [];
    const kinds = ['speed', 'clone', 'invis'];
    for (let i = 0; i < P.items; i++) {
      const t = farTile(1, 1, 2);
      if (items.some((it) => it.x === t.x && it.y === t.y)) { i -= 1; continue; }
      if (t.x === exit.x && t.y === exit.y) { i -= 1; continue; }
      items.push({ x: t.x, y: t.y, kind: kinds[i % kinds.length] });
    }

    blackout = false;
    phaseT = P.cycle;
    stepAcc = 0;
    elapsed = 0;
    moveCd = 0;
    invuln = 0;
    speedUntil = 0;
    invisUntil = 0;
    clone = null;
    popup = null;
    hint = '';
  };

  const bfsStep = (from, tx, ty) => {
    const prev = new Map();
    const q = [from];
    prev.set(K(from.x, from.y), null);
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur.x === tx && cur.y === ty) {
        let node = cur;
        while (prev.get(K(node.x, node.y))) {
          const p = prev.get(K(node.x, node.y));
          if (p.x === from.x && p.y === from.y) return { x: node.x, y: node.y };
          node = p;
        }
        return { x: node.x, y: node.y };
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!open(nx, ny) || prev.has(K(nx, ny))) continue;
        prev.set(K(nx, ny), cur);
        q.push({ x: nx, y: ny });
      }
    }
    return null;
  };

  const randomStep = (e) => {
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy }))
      .filter((p) => open(p.x, p.y) && !(p.x === exit.x && p.y === exit.y));
    const fresh = opts.filter((p) => !e.last || p.x !== e.last.x || p.y !== e.last.y);
    const pool = fresh.length ? fresh : opts;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const scatterEnemies = (min) => {
    for (const e of enemies) {
      const t = farTile(player.x, player.y, min);
      e.x = t.x;
      e.y = t.y;
      e.last = null;
      e.stun = 1.2;
    }
  };

  const caught = () => {
    if (invuln > 0 || invisUntil > now || won) return;
    lives -= 1;
    player = { x: 1, y: 1 };
    invuln = 2.6;
    hint = '被龙虾抓住了';
    scatterEnemies(5);
    if (lives <= 0) {
      over = true;
      const mzCost = revivePts('maze', elapsed);
      setGameResult(`被抓走了，坚持 ${Math.floor(elapsed)} 秒`, 'lose', revives > 0 ? {
        score: Math.floor(elapsed), noPoints: true,
        reviveLabel: `复活 · ${mzCost} 积分（还剩 ${revives} 次）`,
        revive: () => {
          if (!ptsSpendTotal(mzCost)) { toast('积分不够复活'); return; }
          revives -= 1;
          lives = 2;
          over = false;
          player = { x: 1, y: 1 };
          invuln = 3;
          blackout = false;
          phaseT = P.cycle;
          scatterEnemies(5);
          setGameResult('', '');
          hud(true);
        },
      } : { score: Math.floor(elapsed) });
      if (!recorded) {
        recorded = true;
        recordHistory('maze', { score: Math.floor(elapsed), text: `坚持 ${Math.floor(elapsed)} 秒` });
      }
    }
  };

  const enemyTick = () => {
    if (over || won) return;
    // 隐身时龙虾失去目标，只能乱走；有分身就去追分身
    const blind = now < invisUntil && !clone;
    const target = clone || (blind ? null : player);
    for (const e of enemies) {
      if (e.stun > 0) continue;
      const d = target ? Math.abs(e.x - target.x) + Math.abs(e.y - target.y) : 99;
      let next = null;
      if (target && d <= 7) next = bfsStep(e, target.x, target.y);
      if (!next) next = randomStep(e);
      if (next) {
        e.last = { x: e.x, y: e.y };
        e.x = next.x;
        e.y = next.y;
      }
    }
    // 分身只负责吸引火力，倒计时结束后要清掉，否则"被抓"永远不再判定
    if (!clone && now >= invisUntil) {
      for (const e of enemies) {
        if (e.x === player.x && e.y === player.y) { caught(); break; }
      }
    }
  };

  const pickItem = () => {
    const i = items.findIndex((it) => it.x === player.x && it.y === player.y);
    if (i < 0) return;
    const it = items[i];
    items.splice(i, 1);
    if (it.kind === 'speed') {
      speedUntil = now + 5000;
      hint = '加速 5 秒';
    } else if (it.kind === 'invis') {
      invisUntil = now + 4000;
      hint = '隐身 4 秒，龙虾找不到你';
    } else {
      clone = { x: player.x, y: player.y, until: now + 6000, stepAt: 0 };
      hint = '分身 6 秒，龙虾会去追它';
    }
    popup = { text: hint, until: now + 1400, x: player.x, y: player.y };
  };

  const move = (dx, dy) => {
    if (over || won) return;
    if (now < moveCd) return;
    const nx = player.x + dx, ny = player.y + dy;
    if (!open(nx, ny)) return;
    player = { x: nx, y: ny };
    moveCd = now + (now < speedUntil ? 62 : 120);
    visited.add(K(nx, ny));
    pickItem();
    if (nx === exit.x && ny === exit.y) {
      won = true;
      setGameResult(`逃出来了，用时 ${elapsed.toFixed(1)} 秒`, 'win', {
        score: Math.floor(1000 / Math.max(1, elapsed)),
      });
      if (!recorded) {
        recorded = true;
        recordHistory('maze', { score: Math.floor(1000 / Math.max(1, elapsed)), text: `逃出迷宫 · ${elapsed.toFixed(1)} 秒` });
      }
    }
  };

  const computeLight = () => {
    lightMap = new Map();
    const lim = blackout ? 0 : 2;
    lightMap.set(K(player.x, player.y), 0);
    const q = [{ x: player.x, y: player.y }];
    let h = 0;
    while (h < q.length) {
      const c = q[h++];
      const cd = lightMap.get(K(c.x, c.y));
      if (cd >= lim) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const k = K(nx, ny);
        if (lightMap.has(k)) continue;
        lightMap.set(k, cd + 1);
      }
    }
  };

  const hud = (force) => {
    if (!force && now - hudAt < 160) return;
    hudAt = now;
    const tags = [];
    if (now < speedUntil) tags.push('加速');
    if (now < invisUntil) tags.push('隐身');
    if (clone && clone.until > now) tags.push('分身');
    const phase = blackout ? `熄灯 ${Math.ceil(phaseT)}s` : `${Math.ceil(phaseT)}s 后熄灯`;
    statusEl.textContent = `生命 ${lives} · 用时 ${elapsed.toFixed(1)} 秒 · ${phase}${tags.length ? ' · ' + tags.join('/') : ''}`;
  };

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const render = () => {
    const t = performance.now();
    if (t - themeAt > 500) { themeAt = t; T = arcadeTheme(); }
    ctx.fillStyle = T.mazeBg;
    ctx.fillRect(0, 0, W, H);
    computeLight();
    const ox = (W - cell * N) / 2;
    const oy = (H - cell * N) / 2;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = ox + x * cell, py = oy + y * cell;
        if (grid[id(x, y)]) {
          ctx.fillStyle = T.wall;
          rr(px + 1, py + 1, cell - 2, cell - 2, 4);
          ctx.fill();
        } else {
          ctx.fillStyle = visited.has(K(x, y)) ? T.trail : T.floorTile;
          if (!T.light) {
            rr(px + 1, py + 1, cell - 2, cell - 2, 4);
            ctx.fill();
          } else {
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          }
        }
      }
    }

    // 出口
    const ex = ox + exit.x * cell, ey = oy + exit.y * cell;
    const pulse = 0.55 + 0.45 * Math.sin(now / 320);
    ctx.fillStyle = T.exit;
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    rr(ex + 2, ey + 2, cell - 4, cell - 4, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.exitText;
    ctx.font = gameFont(Math.floor(cell * 0.55), 600);
    ctx.textAlign = 'center';
    ctx.fillText('出', ex + cell / 2, ey + cell / 2 + cell * 0.18);
    ctx.textAlign = 'start';

    // 道具图标用 Apple emoji 原图（本地 PNG），不再依赖系统字体渲染
    for (const it of items) {
      const img = ITEM_IMG[it.kind];
      const px = ox + it.x * cell, py = oy + it.y * cell;
      // 会呼吸的光环，免得在暗处根本看不见道具
      const glow = 0.35 + 0.25 * Math.sin(now / 260 + it.x + it.y);
      ctx.beginPath();
      ctx.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = T.light ? `rgba(37,99,235,${0.1 + glow * 0.16})` : `rgba(150,200,255,${0.1 + glow * 0.2})`;
      ctx.fill();
      if (!img || !img.complete || !img.naturalWidth) continue;
      const u = cell * 0.78;
      ctx.drawImage(img, px + (cell - u) / 2, py + (cell - u) / 2, u, u);
    }

    if (clone && clone.until > now) {
      const px = ox + clone.x * cell, py = oy + clone.y * cell;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = T.player;
      ctx.beginPath();
      ctx.arc(px + cell / 2, py + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const e of enemies) {
      const px = ox + e.x * cell, py = oy + e.y * cell;
      const near = Math.abs(e.x - player.x) + Math.abs(e.y - player.y) <= 4;
      ctx.fillStyle = e.stun > 0 ? (T.light ? '#f9a8b6' : 'rgba(255,150,150,.55)') : T.enemy;
      ctx.beginPath();
      ctx.arc(px + cell / 2, py + cell / 2, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.enemyEye;
      ctx.beginPath();
      ctx.arc(px + cell * 0.38, py + cell * 0.44, cell * 0.07, 0, Math.PI * 2);
      ctx.arc(px + cell * 0.62, py + cell * 0.44, cell * 0.07, 0, Math.PI * 2);
      ctx.fill();
      if (near) {
        ctx.strokeStyle = T.enemy;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, cell * 0.46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const px = ox + player.x * cell, py = oy + player.y * cell;
    const blink = invuln > 0 && Math.floor(invuln * 10) % 2 === 0;
    const ghost = now < invisUntil;
    ctx.globalAlpha = ghost ? 0.32 : blink ? 0.4 : 1;
    ctx.fillStyle = now < invisUntil ? (T.light ? 'rgba(37,99,235,.55)' : 'rgba(160,200,255,.55)') : T.player;
    ctx.beginPath();
    ctx.arc(px + cell / 2, py + cell / 2, cell * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.light ? '#ffffff' : '#f0f6ff';
    ctx.beginPath();
    ctx.arc(px + cell * 0.40, py + cell * 0.44, cell * 0.07, 0, Math.PI * 2);
    ctx.arc(px + cell * 0.62, py + cell * 0.44, cell * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 吃到道具：头顶飘一行字，1.4 秒淡出
    if (popup && popup.until > now) {
      const k = Math.max(0, Math.min(1, (popup.until - now) / 1400));
      const tx = ox + popup.x * cell + cell / 2;
      const ty = oy + popup.y * cell - (1 - k) * 16;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.fillStyle = T.light ? '#1d2b4a' : '#eaf2ff';
      ctx.font = gameFont(Math.max(9, Math.floor(cell * 0.4)), 600);
      ctx.textAlign = 'center';
      ctx.fillText(popup.text, tx, ty);
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }

    if (blackout) {
      const cx = px + cell / 2, cy = py + cell / 2;
      const g = ctx.createRadialGradient(cx, cy, cell * 0.5, cx, cy, cell * 2.4);
      g.addColorStop(0, 'rgba(4,8,16,0)');
      g.addColorStop(1, T.dark);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  };

  const drawJoy = () => {
    if (!joy.on) return;
    ctx.strokeStyle = 'rgba(255,255,255,.42)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(joy.ox, joy.oy, 4, joy.ox, joy.oy, 44);
    g.addColorStop(0, 'rgba(255,255,255,.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(125,160,255,.75)';
    ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 30, joy.oy + joy.dy * 30, 18, 0, Math.PI * 2); ctx.fill();
  };

  const loop = (t) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const dt = lastT ? Math.min(0.06, (t - lastT) / 1000) : 0;
    lastT = t;
    now = performance.now();
    if (!over && !won) {
      elapsed += dt;
      if (moveCd > 0) moveCd = Math.max(0, moveCd - dt * 1000);
      if (joy.on) {
        const ax = Math.abs(joy.dx), ay = Math.abs(joy.dy);
        if (Math.max(ax, ay) > 0.4) {
          if (ax >= ay) move(joy.dx > 0 ? 1 : -1, 0);
          else move(0, joy.dy > 0 ? 1 : -1);
        }
      }
      if (invuln > 0) invuln = Math.max(0, invuln - dt);
      for (const e of enemies) if (e.stun > 0) e.stun = Math.max(0, e.stun - dt);
      // 分身到点就散，散之前自己也会挪两步，看起来像真的在跑
      if (clone && clone.until <= now) clone = null;
      if (clone && now - (clone.stepAt || 0) > 460) {
        clone.stepAt = now;
        const cs = randomStep(clone);
        if (cs) { clone.x = cs.x; clone.y = cs.y; }
      }

      phaseT -= dt;
      if (phaseT <= 0) {
        blackout = !blackout;
        phaseT = blackout ? P.dark : P.cycle;
      }
      stepAcc += dt;
      if (stepAcc >= P.step / 1000) {
        stepAcc = 0;
        enemyTick();
      }
      hud();
    }
    render();
    drawJoy();
    raf = gRaf(loop);
  };

  const reset = () => {
    P = LEVELS[level] || LEVELS[2];
    lives = 3;
    over = false;
    won = false;
    recorded = false;
    if (canvas) canvas.reviveShown = false;
    build();
    setGameResult('', '');
    hud(true);
  };

  // 摇杆和「全部击毙」同一套：按住哪里，圆心就落在哪里
  let joy = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (over || won) return;
    const p = pointAt(e);
    joy = { on: true, ox: p.x, oy: p.y, dx: 0, dy: 0, id: e.pointerId };
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!joy.on) return;
    const p = pointAt(e);
    let dx = p.x - joy.ox, dy = p.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 44) { dx = (dx / d) * 44; dy = (dy / d) * 44; }
    joy.dx = dx / 44; joy.dy = dy / 44;
  });
  const joyUp = () => {
    if (joy.id != null && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(joy.id); } catch (_) {}
    }
    joy.on = false; joy.dx = 0; joy.dy = 0; joy.id = null;
  };
  canvas.addEventListener('pointerup', joyUp);
  canvas.addEventListener('pointercancel', joyUp);

  const onKey = (e) => {
    if (!canvas.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(0, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(0, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move(1, 0); }
  };
  window.addEventListener('keydown', onKey);

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('maze', (n) => { level = n; reset(); });
  level = diff.get();

  reset();
  gRaf(loop);
}
/* ---------------- 全部击毙（合作射击） ---------------- */
function bindSquad() {
  const canvas = document.getElementById('squadCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  const shopEl = document.getElementById('squadShop');
  const startEl = document.getElementById('squadStart');
  const startBtn = document.getElementById('squadStartBtn');
  const resumeBtn = document.getElementById('squadResumeBtn');
  let started = false;
  const grenadeBtn = document.getElementById('squadGrenade');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 440, PAD = 12;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const LEVELS = {
    1: { hp: 0.85, dmg: 0.85, speed: 0.92, count: 0.8 },
    2: { hp: 1, dmg: 1, speed: 1, count: 1 },
    3: { hp: 1.25, dmg: 1.18, speed: 1.08, count: 1.18 },
    4: { hp: 1.55, dmg: 1.38, speed: 1.16, count: 1.36 },
    5: { hp: 1.9, dmg: 1.6, speed: 1.25, count: 1.55 },
  };
  const WAVES = 5;
  const BASE = {
    grunt: { hp: 34, speed: 48, r: 10, dmg: 6, range: 150, cd: 1.5, score: 12, color: '#e11d48' },
    bomber: { hp: 54, speed: 38, r: 11, dmg: 0, range: 185, cd: 2.9, score: 20, color: '#c2760a' },
    mini: { hp: 200, speed: 34, r: 16, dmg: 9, range: 160, cd: 1.2, score: 70, color: '#7c3aed' },
    boss: { hp: 540, speed: 26, r: 24, dmg: 11, range: 190, cd: 1.0, score: 240, color: '#9f1239' },
  };

  let level = 2;
  let T = arcadeTheme();
  let themeAt = 0;
  let raf = 0, lastT = 0;
  let over = false, shopOpen = false, recorded = false;
  let wave = 1, score = 0, wavePlan = [], spawnLeft = 0, spawnT = 0, spawnCd = 0.8;
  let enemies = [], pbul = [], ebul = [], grens = [], fx = [];
  let player = { x: W / 2, y: H - 96, r: 11, hp: 100, max: 100, aim: -Math.PI / 2 };
  let ally = { x: W / 2 - 44, y: H - 64, r: 10, hp: 80, max: 80, down: 0, seed: Math.random() * 6 };
  let stats = {
    dmg: 15, rate: 0.36, speed: 152, allyDmg: 11, allyRate: 0.55, grenade: 2,
    fire: 0, ice: 0, incendiary: 0, allyRegen: 0,
  };
  let bought = {
    dmg: 0, rate: 0, armor: 0, ally: 0, scope: 0,
    fire: 0, ice: 0, incendiary: 0, speed: 0, allyHeal: 0, allyHp: 0,
  };
  let armorLv = 0, droneDmgLv = 0, drones = [];
  let aimG = null;   // 手雷落点预览：先画范围，再点一次才扔
  let skinId = safeGet('minxtok.squad.skin') || 'blue';
  const SKINS = [
    { id: 'blue', name: '深空蓝', color: '#4f8cff', cost: 0 },
    { id: 'lava', name: '熔岩橙', color: '#ff7a3d', cost: 90 },
    { id: 'aurora', name: '极光青', color: '#2ee6c5', cost: 120 },
    { id: 'ghost', name: '幽灵白', color: '#e8eefc', cost: 160 },
  ];
  const skinColor = () => (SKINS.find((k) => k.id === skinId) || SKINS[0]).color;
  let fireT = 0, allyT = 0, grenadeCd = 0;
  let joy = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
  let keys = {};
  let bossRef = null;
  let hudAt = 0;

  const costOf = (item) => Math.round(item.base * (1 + ((item.lv || bought[item.id] || 0) * 0.4)));
  const shopCatalog = () => {
    const gear = [
      { id: 'dmg', name: '穿甲弹', desc: '你的伤害 +15%', base: 30 },
      { id: 'rate', name: '快枪管', desc: '你的射速 +12%', base: 34 },
      { id: 'scope', name: '战术瞄具', desc: '伤害再 +10%，压枪更稳', base: 60 },
      { id: 'fire', name: '火焰子弹', desc: '命中附加 2.2 秒灼烧', base: 70, cap: 1, lv: stats.fire },
      { id: 'ice', name: '冰冻子弹', desc: '命中减速 45%，持续 1.8 秒', base: 70, cap: 1, lv: stats.ice },
      { id: 'incendiary', name: '燃烧弹', desc: '手雷爆炸后留下灼烧', base: 85, cap: 1, lv: stats.incendiary },
      { id: 'speed', name: '轻装靴', desc: '移动速度 +8%', base: 48, cap: 3, lv: bought.speed },
      { id: 'grenade', name: '战术手雷', desc: '补一颗手雷，范围爆炸', base: 50 },
    ];
    const armor = [
      { id: 'vest', name: '防弹插板', desc: '生命上限 +25 并回满', base: 30 },
      { id: 'plate', name: `陶瓷护甲 Lv.${armorLv}`, desc: '受到伤害 -12%，最多 3 层', base: 70, cap: 3, lv: armorLv },
      { id: 'medkit', name: '急救包', desc: '立刻回满生命', base: 28 },
    ];
    const mate = [
      { id: 'drone', name: `火力无人机 ×${drones.length}`, desc: '停在肩侧跟着走、自动索敌，最多 2 架', base: 90, cap: 2, lv: drones.length },
      { id: 'droneDmg', name: `无人机强化 Lv.${droneDmgLv}`, desc: '无人机伤害 +30%', base: 65, cap: 3, lv: droneDmgLv },
      { id: 'ally', name: '队友补给', desc: '队友伤害 +20%', base: 45 },
      { id: 'allyHeal', name: '队友急救', desc: '回满队友并持续缓回，最多 3 层', base: 55, cap: 3, lv: bought.allyHeal },
      { id: 'allyHp', name: '队友护甲', desc: '队友生命上限 +28 并回满', base: 55, cap: 3, lv: bought.allyHp },
    ];
    return { gear, armor, mate, all: [...gear, ...armor, ...mate] };
  };

  const paintHud = (force) => {
    const now = performance.now();
    if (!force && now - hudAt < 160) return;
    hudAt = now;
    statusEl.textContent = `第 ${wave}/${WAVES} 波 · 积分 ${score} · 血 ${Math.max(0, Math.round(player.hp))}`;
    if (grenadeBtn) {
      grenadeBtn.textContent = aimG ? `释放 ${Math.max(0, aimG.t).toFixed(1)}s`
        : grenadeCd > 0 ? `手雷 ${grenadeCd.toFixed(1)}s` : `手雷 ×${stats.grenade}`;
      grenadeBtn.disabled = grenadeCd > 0 || stats.grenade <= 0 || over || shopOpen;
    }
  };

  const addFx = (x, y, r, color) => fx.push({ x, y, r, color, t: 0 });

  const reset = () => {
    stopLoop();
    const bank = document.querySelector('.score-bank');
    if (bank) bank.remove();
    wave = 1; score = takeCarry('squad');
    enemies = []; pbul = []; ebul = []; grens = []; fx = [];
    player = { x: W / 2, y: H - 96, r: 11, hp: 100, max: 100, aim: -Math.PI / 2 };
    ally = { x: W / 2 - 44, y: H - 64, r: 10, hp: 80, max: 80, down: 0, seed: Math.random() * 6 };
    stats = {
      dmg: 15, rate: 0.36, speed: 152, allyDmg: 11, allyRate: 0.55, grenade: 2,
      fire: 0, ice: 0, incendiary: 0, allyRegen: 0,
    };
    bought = {
      dmg: 0, rate: 0, armor: 0, ally: 0, scope: 0,
      fire: 0, ice: 0, incendiary: 0, speed: 0, allyHeal: 0, allyHp: 0,
    };
    armorLv = 0; droneDmgLv = 0; drones = [];
    fireT = 0; allyT = 0; grenadeCd = 0;
    over = false; shopOpen = false; recorded = false; bossRef = null;
    aimG = null;
    joy = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
    if (shopEl) { shopEl.hidden = true; shopEl.innerHTML = ''; }
    document.body.classList.remove('squad-shop-open');
    setGameResult('', '');
    startWave();
    paintHud(true);
    // 没点「开始游戏」之前不跑，别让人一进页面就被打
    if (started) startLoop();
    else if (startEl) {
      startEl.hidden = false;
      if (resumeBtn) resumeBtn.hidden = true;
    }
  };

  const startWave = () => {
    const L = LEVELS[level] || LEVELS[2];
    wavePlan = [];
    const base = Math.max(4, Math.round((5 + level * 2 + (wave - 1) * 2) * L.count));
    for (let i = 0; i < base; i += 1) wavePlan.push(i % 5 === 4 ? 'bomber' : 'grunt');
    if (wave === 3) wavePlan.push('mini');
    if (wave === WAVES) wavePlan.push('boss');
    spawnLeft = wavePlan.length;
    spawnT = 0.5;
    spawnCd = Math.max(0.55, 0.9 - level * 0.06);
    paintHud(true);
  };

  const spawnOne = (kind, at) => {
    const L = LEVELS[level] || LEVELS[2];
    const b = BASE[kind];
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (at) { x = at.x; y = at.y; }
    else if (side === 0) { x = PAD + Math.random() * (W - PAD * 2); y = PAD + 16; }
    else if (side === 1) { x = W - PAD - 12; y = PAD + 40 + Math.random() * (H - 160); }
    else if (side === 2) { x = PAD + Math.random() * (W - PAD * 2); y = H - PAD - 10; }
    else { x = PAD + 12; y = PAD + 40 + Math.random() * (H - 160); }
    const hpScale = L.hp * (1 + (wave - 1) * 0.09);
    const elite = kind === 'grunt' && Math.random() < 0.18;
    const e = {
      kind, x, y, r: b.r,
      hp: b.hp * hpScale * (elite ? 1.65 : 1), max: b.hp * hpScale * (elite ? 1.65 : 1),
      speed: b.speed * L.speed, dmg: b.dmg * L.dmg,
      range: b.range, cd: 0.6 + Math.random() * 0.8,
      score: b.score + (elite ? 10 : 0), color: elite ? '#f97316' : b.color,
      burstT: 1.6, skillT: 4.2 + Math.random() * 2, flash: 0,
      burn: 0, slowT: 0, elite, dashT: 0,
    };
    enemies.push(e);
    if (kind === 'boss') bossRef = e;
  };

  const nearestEnemy = (x, y, maxD) => {
    let best = null, bd = maxD || 9999;
    for (const e of enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  const shootAt = (sx, sy, ang, dmg, owner) => {
    const sp = owner === 'player' ? 430 : owner === 'ally' ? 400 : 175 + level * 8;
    pbul.push({
      x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg, owner, r: 3,
      fire: owner === 'player' && stats.fire ? 1 : 0,
      ice: owner === 'player' && stats.ice ? 1 : 0,
    });
  };

  const enemyShoot = (e, tx, ty) => {
    const ang = Math.atan2(ty - e.y, tx - e.x) + (Math.random() - 0.5) * 0.12;
    ebul.push({ x: e.x, y: e.y, vx: Math.cos(ang) * (175 + level * 8), vy: Math.sin(ang) * (175 + level * 8), dmg: e.dmg, r: 3.4 });
  };
  const enemyBurst = (e, count, spread) => {
    const base = Math.atan2(player.y - e.y, player.x - e.x);
    for (let i = 0; i < count; i += 1) {
      const ang = base + (i - (count - 1) / 2) * (spread || 0.16);
      ebul.push({
        x: e.x, y: e.y, vx: Math.cos(ang) * (190 + level * 9), vy: Math.sin(ang) * (190 + level * 9),
        dmg: e.dmg * 0.8, r: 3.4,
      });
    }
  };

  const throwGrenade = (x, y, tx, ty, owner, dmg, radius) => {
    grens.push({ x, y, sx: x, sy: y, tx, ty, t: 0, dur: 0.85, owner, dmg, r: radius || 44 });
  };

  const hitPlayer = (raw) => {
    if (player.hp <= 0) return;
    // 陶瓷护甲每层减 12%，叠满三层也不至于无敌
    const dmg = Math.max(1, raw * (1 - Math.min(0.42, armorLv * 0.12)));
    player.hp -= dmg;
    if (player.hp <= 0) {
      player.hp = 0;
      over = true;
      const reviveCostPts = 400;
      if (!recorded) {
        recorded = true;
        recordHistory('squad', { score, text: `第 ${wave} 波 · ${score} 分` });
        mountBank('squad', score);
      }
      setGameResult(`全员阵亡｜第 ${wave} 波 · 积分 ${score}`, 'lose', {
        score, noPoints: true, bank: score,
        reviveLabel: `复活 · ${reviveCostPts} 积分`,
        revive: () => {
          if (!ptsSpendTotal(reviveCostPts)) { toast('积分不够复活'); return; }
          player.hp = Math.round(player.max * 0.6);
          over = false;
          ebul = []; grens = [];
          for (const e of enemies) { e.hp = Math.max(1, e.hp); }
          setGameResult('', '');
          paintHud(true);
          startLoop();
        },
      });
      shopEl.hidden = true;
      document.body.classList.remove('squad-shop-open');
    }
  };

  const hitAlly = (dmg) => {
    if (ally.down > 0 || ally.hp <= 0) return;
    ally.hp -= dmg;
    if (ally.hp <= 0) { ally.hp = 0; ally.down = 6; }
  };

  const explode = (x, y, r, dmg, owner) => {
    addFx(x, y, r, owner === 'player' ? '#f59e0b' : '#ef4444');
    if (owner === 'player') {
      for (const e of enemies) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < r + e.r) {
          // 越靠中心越疼，正中心直接送走
          if (d < r * 0.34) e.hp = 0;
          else e.hp -= dmg * Math.max(0.3, 1 - d / (r + e.r));
          e.flash = 0.12;
          if (stats.incendiary) e.burn = Math.max(e.burn, 2.6);
        }
      }
    } else {
      if (Math.hypot(player.x - x, player.y - y) < r + player.r) hitPlayer(dmg);
      if (ally.down <= 0 && Math.hypot(ally.x - x, ally.y - y) < r + ally.r) hitAlly(dmg);
    }
  };

  const killReward = (e) => {
    score += e.score;
    if (e.kind === 'boss') {
      over = true;
      if (!recorded) {
        recorded = true;
        recordHistory('squad', { score, text: `通关 · ${score} 分` });
        mountBank('squad', score);
      }
      setGameResult(`通关！最终积分 ${score}`, 'win', { score, noPoints: true, bank: score });
      shopEl.hidden = true;
      document.body.classList.remove('squad-shop-open');
    }
  };

  const openShop = () => {
    shopOpen = true;
    document.body.classList.add('squad-shop-open');
    aimG = null;
    joy.on = false; joy.dx = 0; joy.dy = 0; joy.id = null;
    player.hp = Math.min(player.max, player.hp + 16);
    ally.down = 0;
    ally.hp = Math.min(ally.max, ally.hp + 20);
    renderShop();
    if (shopEl.dataset.seen) shopEl.classList.add('no-anim');
    else shopEl.dataset.seen = '1';
    shopEl.hidden = false;
    if (shopEl) shopEl.scrollTop = 0;
    paintHud(true);
  };

  const renderShop = () => {
    if (!shopEl) return;
    const { gear, armor, mate } = shopCatalog();
    const card = (item) => {
      const cost = costOf(item);
      const maxed = item.cap && (item.lv || 0) >= item.cap;
      const off = score < cost || maxed;
      return `<button class="squad-buy" type="button" data-buy="${item.id}" ${off ? 'disabled' : ''}>
        <span class="sb-name">${item.name}</span>
        <span class="sb-desc">${maxed ? '已满级' : item.desc}</span>
        <span class="sb-cost">${maxed ? '满' : cost + ' 分'}</span>
      </button>`;
    };
    const skins = SKINS.map((k) => {
      const owned = safeGet(`minxtok.squad.skin.${k.id}`) === '1' || k.cost === 0;
      const on = k.id === skinId;
      return `<button class="squad-buy squad-skin${on ? ' on' : ''}" type="button" data-skin="${k.id}" ${on ? 'disabled' : ''}>
        <span class="sk-chip" style="--sk:${k.color}"></span>
        <span class="sb-name">${k.name}</span>
        <span class="sb-desc">${on ? '使用中' : owned ? '点击换上' : '解锁皮肤'}</span>
        <span class="sb-cost">${on ? '—' : owned ? '已拥有' : k.cost + ' 分'}</span>
      </button>`;
    }).join('');
    shopEl.innerHTML = `
      <div class="shop-panel">
      <div class="squad-shop-head">第 ${wave} 波清完　积分 <b>${score}</b></div>
      <div class="shop-sec"><span>装备</span></div>
      <div class="squad-shop-grid">${gear.map(card).join('')}</div>
      <div class="shop-sec"><span>盔甲</span></div>
      <div class="squad-shop-grid">${armor.map(card).join('')}</div>
      <div class="shop-sec"><span>队友</span></div>
      <div class="squad-shop-grid">${mate.map(card).join('')}</div>
      <div class="shop-sec"><span>皮肤</span></div>
      <div class="squad-shop-grid squad-skins">${skins}</div>
      <button class="game-btn squad-next" type="button" id="squadNext">继续第 ${wave + 1} 波</button>
      </div>`;
    shopEl.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buy;
        const pool = shopCatalog().all;
        const item = pool.find((x) => x.id === id);
        if (!item) return;
        const cost = costOf(item);
        if (score < cost) return;
        if (item.cap && (item.lv || 0) >= item.cap) return;
        score -= cost;
        if (id === 'dmg') { stats.dmg *= 1.15; bought.dmg += 1; }
        else if (id === 'rate') { stats.rate = Math.max(0.14, stats.rate * 0.88); bought.rate += 1; }
        else if (id === 'scope') { stats.dmg *= 1.10; bought.scope += 1; }
        else if (id === 'fire') { stats.fire = 1; bought.fire = 1; }
        else if (id === 'ice') { stats.ice = 1; bought.ice = 1; }
        else if (id === 'incendiary') { stats.incendiary = 1; bought.incendiary = 1; }
        else if (id === 'speed') { stats.speed *= 1.08; bought.speed += 1; }
        else if (id === 'vest') { player.max += 25; player.hp = player.max; bought.armor += 1; }
        else if (id === 'plate') armorLv = Math.min(3, armorLv + 1);
        else if (id === 'medkit') player.hp = player.max;
        else if (id === 'drone') drones.push({ ang: Math.random() * 6.28, x: player.x, y: player.y - 40, cd: 0 });
        else if (id === 'droneDmg') droneDmgLv = Math.min(3, droneDmgLv + 1);
        else if (id === 'ally') { stats.allyDmg *= 1.2; ally.max += 12; ally.hp = ally.max; bought.ally += 1; }
        else if (id === 'allyHeal') {
          stats.allyRegen += 1.6;
          ally.hp = ally.max;
          bought.allyHeal += 1;
        }
        else if (id === 'allyHp') { ally.max += 28; ally.hp = ally.max; bought.allyHp += 1; }
        else if (id === 'grenade') { stats.grenade += 1; bought.grenade = (bought.grenade || 0) + 1; }
        refreshShop();
        showShopToast(`花费 ${cost} 已购买 ${item.name}`);
        paintHud(true);
      });
    });
    shopEl.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = SKINS.find((x) => x.id === btn.dataset.skin);
        if (!k || k.id === skinId) return;
        const owned = safeGet(`minxtok.squad.skin.${k.id}`) === '1' || k.cost === 0;
        if (!owned) {
          if (score < k.cost) { toast('积分不够解锁皮肤'); return; }
          score -= k.cost;
          safeSet(`minxtok.squad.skin.${k.id}`, '1');
          showShopToast(`花费 ${k.cost} 已购买 ${k.name}`);
        }
        skinId = k.id;
        safeSet('minxtok.squad.skin', k.id);
        refreshShop();
        paintHud(true);
      });
    });
    const next = shopEl.querySelector('#squadNext');
    if (next) next.addEventListener('click', () => {
      shopEl.hidden = true;
      shopOpen = false;
      document.body.classList.remove('squad-shop-open');
      wave += 1;
      startWave();
      paintHud(true);
      startLoop();
    });
  };

  // 买完只刷新按钮和余额，不重建整个商店，避免每次都弹一遍
  const refreshShop = () => {
    if (!shopEl) return;
    const { all } = shopCatalog();
    shopEl.querySelectorAll('[data-buy]').forEach((btn) => {
      const item = all.find((x) => x.id === btn.dataset.buy);
      if (!item) return;
      const cost = costOf(item);
      const maxed = item.cap && (item.lv || 0) >= item.cap;
      btn.disabled = score < cost || maxed;
      const name = btn.querySelector('.sb-name');
      const desc = btn.querySelector('.sb-desc');
      const costEl = btn.querySelector('.sb-cost');
      if (name) name.textContent = item.name;
      if (desc) desc.textContent = maxed ? '已满级' : item.desc;
      if (costEl) costEl.textContent = maxed ? '满' : `${cost} 分`;
    });
    const head = shopEl.querySelector('.squad-shop-head');
    if (head) head.innerHTML = `第 ${wave} 波清完　积分 <b>${score}</b>`;
    shopEl.querySelectorAll('[data-skin]').forEach((btn) => {
      const k = SKINS.find((x) => x.id === btn.dataset.skin);
      if (!k) return;
      const owned = safeGet(`minxtok.squad.skin.${k.id}`) === '1' || k.cost === 0;
      const on = k.id === skinId;
      btn.disabled = on;
      btn.classList.toggle('on', on);
      const desc = btn.querySelector('.sb-desc');
      const costEl = btn.querySelector('.sb-cost');
      if (desc) desc.textContent = on ? '使用中' : owned ? '点击换上' : '解锁皮肤';
      if (costEl) costEl.textContent = on ? '—' : owned ? '已拥有' : `${k.cost} 分`;
    });
    const next = shopEl.querySelector('#squadNext');
    if (next) next.textContent = `继续第 ${wave + 1} 波`;
  };

  let shopToastTimer = 0;
  const showShopToast = (text) => {
    if (!shopEl) return;
    let node = shopEl.querySelector('.squad-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'squad-toast';
      shopEl.appendChild(node);
    }
    node.textContent = text;
    node.classList.add('on');
    clearTimeout(shopToastTimer);
    shopToastTimer = setTimeout(() => node.classList.remove('on'), 1700);
  };

  const update = (dt) => {
    if (over || shopOpen) return;
    if (aimG) {
      aimG.t -= dt;
      if (aimG.t <= 0) releaseGrenade();
    }
    let mx = 0, my = 0;
    if (joy.on) { mx = joy.dx; my = joy.dy; }
    if (keys.ArrowLeft || keys.a || keys.A) mx -= 1;
    if (keys.ArrowRight || keys.d || keys.D) mx += 1;
    if (keys.ArrowUp || keys.w || keys.W) my -= 1;
    if (keys.ArrowDown || keys.s || keys.S) my += 1;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    player.x = Math.max(PAD + player.r, Math.min(W - PAD - player.r, player.x + mx * stats.speed * dt));
    player.y = Math.max(PAD + 40, Math.min(H - PAD - player.r, player.y + my * stats.speed * dt));

    // 队友跟随 + 自动开火
    if (ally.down > 0) {
      ally.down = Math.max(0, ally.down - dt);
      if (ally.down === 0) {
        ally.hp = ally.max * 0.6;
        ally.x = player.x - 30;
        ally.y = player.y + 26;
        ally.seed = Math.random() * 6;
      }
    } else {
      if (stats.allyRegen > 0 && ally.hp < ally.max) {
        ally.hp = Math.min(ally.max, ally.hp + stats.allyRegen * dt);
      }
      // 队友自己找位置：有敌人就拉到中距离绕圈，没敌人再跟队
      const foe = nearestEnemy(ally.x, ally.y, 300);
      let vx = 0, vy = 0;
      if (foe) {
        const dx = foe.x - ally.x, dy = foe.y - ally.y;
        const d = Math.hypot(dx, dy) || 1;
        const keep = 118;
        const radial = d > keep + 18 ? 1 : d < keep - 26 ? -0.9 : 0;
        const strafe = Math.sin(performance.now() / 780 + ally.seed) * 0.85;
        vx = (dx / d) * radial + (-dy / d) * strafe;
        vy = (dy / d) * radial + (dx / d) * strafe;
      } else {
        const dx = player.x - ally.x, dy = player.y - ally.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 96) { vx = dx / d; vy = dy / d; }
      }
      const pd = Math.hypot(player.x - ally.x, player.y - ally.y) || 1;
      if (pd < 30) { vx += (ally.x - player.x) / pd; vy += (ally.y - player.y) / pd; }
      const vl = Math.hypot(vx, vy);
      if (vl > 0.01) {
        const sp = stats.speed * 0.95 * Math.min(1, vl);
        ally.x = Math.max(PAD + ally.r, Math.min(W - PAD - ally.r, ally.x + (vx / vl) * sp * dt));
        ally.y = Math.max(PAD + 34, Math.min(H - PAD - ally.r, ally.y + (vy / vl) * sp * dt));
      }
      allyT -= dt;
      if (allyT <= 0) {
        const ae = nearestEnemy(ally.x, ally.y, 330);
        if (ae) {
          const ang = Math.atan2(ae.y - ally.y, ae.x - ally.x);
          shootAt(ally.x, ally.y, ang, stats.allyDmg, 'ally');
          allyT = stats.allyRate;
        }
      }
    }

    // 玩家自动瞄准最近敌人
    const pe = nearestEnemy(player.x, player.y, 340);
    if (pe) player.aim = Math.atan2(pe.y - player.y, pe.x - player.x);
    fireT -= dt;
    if (fireT <= 0 && pe) {
      const spread = (Math.random() - 0.5) * 0.05;
      shootAt(player.x + Math.cos(player.aim) * 12, player.y + Math.sin(player.aim) * 12, player.aim + spread, stats.dmg, 'player');
      fireT = stats.rate;
    }
    grenadeCd = Math.max(0, grenadeCd - dt);

    // 刷怪
    if (spawnLeft > 0) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnOne(wavePlan[wavePlan.length - spawnLeft] || 'grunt');
        spawnLeft -= 1;
        spawnT = spawnCd;
      }
    }

    // 敌人移动与攻击
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      e.cd -= dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.burn > 0) {
        e.burn = Math.max(0, e.burn - dt);
        e.hp -= (e.kind === 'boss' ? 8 : 10) * dt;
        e.flash = Math.max(e.flash, 0.05);
      }
      if (e.slowT > 0) e.slowT = Math.max(0, e.slowT - dt);
      if (e.dashT > 0) e.dashT = Math.max(0, e.dashT - dt);
      if (e.kind === 'boss') {
        // 头目会自己回血，血量越低回得越快，还会定期召唤援军
        if (e.hp < e.max * 0.72) e.hp = Math.min(e.max, e.hp + e.max * 0.014 * dt);
        e.skillT -= dt;
        if (e.skillT <= 0) {
          e.hp = Math.min(e.max, e.hp + e.max * 0.07);
          addFx(e.x, e.y, 38, '#22c55e');
          spawnOne('grunt', { x: e.x - 26, y: e.y + 24 });
          spawnOne('grunt', { x: e.x + 26, y: e.y + 24 });
          e.skillT = 6.2;
          toast('头目回血，并召唤了两名援军');
        }
      } else if (e.kind === 'mini') {
        e.skillT -= dt;
        if (e.skillT <= 0) {
          enemyBurst(e, 3, 0.18);
          e.dashT = 0.8;
          e.skillT = 5.2;
        }
      } else if (e.elite) {
        e.skillT -= dt;
        if (e.skillT <= 0) {
          enemyBurst(e, 3, 0.16);
          e.skillT = 4.4;
        }
      }
      // 无人机：固定停在肩侧跟着走，别绕圈转得眼晕
      for (let di = 0; di < drones.length; di += 1) {
        const d = drones[di];
        const offX = di === 0 ? -24 : 24;
        const offY = -34 - (di === 0 ? 0 : 6);
        const k = Math.min(1, dt * 7);
        d.x += (player.x + offX - d.x) * k;
        d.y += (player.y + offY - d.y) * k;
        d.cd -= dt;
        if (d.cd <= 0) {
          const foe = nearestEnemy(d.x, d.y, 320);
          if (foe) {
            shootAt(d.x, d.y, Math.atan2(foe.y - d.y, foe.x - d.x), 7 + droneDmgLv * 5, 'ally');
            d.cd = 0.8;
          } else d.cd = 0.2;
        }
      }

      const tgt = player.hp > 0 ? player : ally;
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const charge = e.dashT > 0 ? 2.15 : 1;
      const slow = e.slowT > 0 ? 0.55 : 1;
      if (d > e.range * 0.72) {
        e.x += (dx / d) * e.speed * slow * charge * dt;
        e.y += (dy / d) * e.speed * slow * charge * dt;
      } else {
        e.x += (-dy / d) * e.speed * slow * 0.28 * dt;
        e.y += (dx / d) * e.speed * slow * 0.28 * dt;
      }
      e.x = Math.max(PAD + e.r, Math.min(W - PAD - e.r, e.x));
      e.y = Math.max(PAD + 30, Math.min(H - PAD - e.r, e.y));
      if (e.kind === 'bomber') {
        if (e.cd <= 0 && d < 300) {
          throwGrenade(e.x, e.y, tgt.x, tgt.y, 'enemy', 16 * (LEVELS[level] || LEVELS[2]).dmg);
          e.cd = 3.1;
        }
      } else if (e.kind === 'boss') {
        if (e.burstT <= 0) {
          for (let i = 0; i < 12; i += 1) {
            const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.1;
            ebul.push({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, dmg: e.dmg * 0.8, r: 3.6 });
          }
          e.burstT = 2.7;
        }
        if (e.cd <= 0 && d < 330) { enemyShoot(e, tgt.x, tgt.y); e.cd = 1.1; }
      } else if (e.cd <= 0 && d < 330) {
        enemyShoot(e, tgt.x, tgt.y);
        e.cd = e.kind === 'mini' ? 1.15 : 1.6;
      }
    }

    // 玩家/队友子弹
    for (let i = pbul.length - 1; i >= 0; i -= 1) {
      const b = pbul[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      for (const e of enemies) {
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          if (b.owner === 'player' || b.owner === 'ally') e.hp -= b.dmg;
          e.flash = 0.12;
          if (b.fire) e.burn = Math.max(e.burn, 2.2);
          if (b.ice) e.slowT = Math.max(e.slowT, 1.8);
          hit = true;
          break;
        }
      }
      if (hit || b.x < 0 || b.x > W || b.y < 0 || b.y > H) pbul.splice(i, 1);
    }

    // 敌方子弹
    for (let i = ebul.length - 1; i >= 0; i -= 1) {
      const b = ebul[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      if (Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
        hitPlayer(b.dmg);
        hit = true;
      } else if (ally.down <= 0 && Math.hypot(ally.x - b.x, ally.y - b.y) < ally.r + b.r) {
        hitAlly(b.dmg);
        hit = true;
      }
      if (hit || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) ebul.splice(i, 1);
    }

    // 手雷
    for (let i = grens.length - 1; i >= 0; i -= 1) {
      const g = grens[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      g.x = g.sx + (g.tx - g.sx) * k;
      g.y = g.sy + (g.ty - g.sy) * k - Math.sin(k * Math.PI) * 34;
      if (g.t >= g.dur) {
        explode(g.tx, g.ty, g.r, g.dmg, g.owner);
        grens.splice(i, 1);
      }
    }

    // 清理死亡敌人
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (e.hp <= 0) {
        addFx(e.x, e.y, e.r + 8, e.color);
        killReward(e);
        if (e === bossRef) bossRef = null;
        enemies.splice(i, 1);
      }
    }

    for (let i = fx.length - 1; i >= 0; i -= 1) {
      fx[i].t += dt;
      if (fx[i].t > 0.35) fx.splice(i, 1);
    }

    if (!over && !shopOpen && spawnLeft === 0 && enemies.length === 0) {
      if (wave >= WAVES) {
        over = true;
        if (!recorded) {
          recorded = true;
          recordHistory('squad', { score, text: `通关 · ${score} 分` });
          mountBank('squad', score);
        }
        setGameResult(`通关！最终积分 ${score}`, 'win', { score, noPoints: true, bank: score });
        document.body.classList.remove('squad-shop-open');
      } else {
        openShop();
      }
    }
    paintHud(false);
  };

  const render = () => {
    const t = performance.now();
    if (t - themeAt > 500) { themeAt = t; T = arcadeTheme(); }
    const C = T.light ? {
      bg: '#f6f9ff', grid: 'rgba(37,99,235,.08)', edge: '#c7d7ee',
      player: '#2563eb', ally: '#0f9d58', text: '#0f1115', sub: '#5b6472',
      ebul: '#dc2626', pbul: '#1d4ed8', hp: '#16a34a', hpBg: 'rgba(15,23,42,.12)',
      boss: '#9f1239', grenade: '#b45309',
    } : {
      bg: '#070d18', grid: 'rgba(120,170,255,.10)', edge: 'rgba(120,170,255,.25)',
      player: '#8fb8ff', ally: '#4ade80', text: '#dce8ff', sub: 'rgba(220,232,255,.66)',
      ebul: '#ff8f8f', pbul: '#a5c8ff', hp: '#4ade80', hpBg: 'rgba(150,180,255,.18)',
      boss: '#ff6b6b', grenade: '#ffd166',
    };
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD - 4, PAD + 26, W - PAD * 2 + 8, H - PAD * 2 - 22);

    // 手雷落点
    for (const g of grens) {
      const k = Math.min(1, g.t / g.dur);
      const tx = g.sx + (g.tx - g.sx) * Math.max(0, k - 0.18);
      const ty = g.sy + (g.ty - g.sy) * Math.max(0, k - 0.18);
      ctx.strokeStyle = `rgba(255,190,90,${0.45 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(g.x, g.y); ctx.stroke();
      ctx.fillStyle = C.grenade;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.t * 12);
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(239,68,68,.5)';
      ctx.beginPath(); ctx.arc(g.tx, g.ty, g.r, 0, Math.PI * 2); ctx.stroke();
    }

    // 敌人
    for (const e of enemies) {
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      if (e.kind === 'mini' || e.kind === 'boss') {
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.hp < e.max) {
        const w = e.r * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * Math.max(0, e.hp / e.max), 3);
      }
    }

    // 玩家与队友
    const drawMan = (m, color, isAlly) => {
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.arc(m.x + 1.5, m.y + 2, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(m.x, m.y, isAlly && ally.down > 0 ? m.r * 0.7 : m.r, 0, Math.PI * 2); ctx.fill();
      if (!(isAlly && ally.down > 0)) {
        const ang = isAlly ? Math.atan2(nearestEnemy(m.x, m.y, 260)?.y - m.y || 0, nearestEnemy(m.x, m.y, 260)?.x - m.x || 1) : player.aim;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(ang) * (m.r + 9), m.y + Math.sin(ang) * (m.r + 9));
        ctx.stroke();
      }
    };
    if (aimG) {
      const g = ctx.createRadialGradient(aimG.x, aimG.y, aimG.r * 0.1, aimG.x, aimG.y, aimG.r);
      g.addColorStop(0, 'rgba(239,68,68,.34)');
      g.addColorStop(0.55, 'rgba(245,158,11,.20)');
      g.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(aimG.x, aimG.y, aimG.r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255,190,90,.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(aimG.x, aimG.y, aimG.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.arc(aimG.x, aimG.y, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,140,.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(aimG.x, aimG.y, aimG.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, aimG.t / 1.2)));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,140,.55)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(aimG.x, aimG.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffe4a8';
      ctx.font = gameFont(12, 700);
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.max(0, aimG.t).toFixed(1)}s`, aimG.x, aimG.y - aimG.r - 9);
      ctx.textAlign = 'left';
    }
    drawMan(player, skinColor(), false);
    drawMan(ally, C.ally, true);
    for (const d of drones) {
      ctx.save();
      ctx.shadowColor = 'rgba(120,200,255,.85)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(d.x, d.y, 5.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(120,200,255,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(d.x, d.y, 8.2, 0, Math.PI * 2); ctx.stroke();
    }

    // 子弹
    for (const b of pbul) {
      ctx.fillStyle = b.owner === 'ally' ? C.ally : C.pbul;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of ebul) {
      ctx.fillStyle = C.ebul;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }

    // 爆炸
    for (const f of fx) {
      const k = f.t / 0.35;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 顶部状态
    const barW = 120;
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(PAD, PAD, barW, 7);
    ctx.fillStyle = C.hp;
    ctx.fillRect(PAD, PAD, barW * Math.max(0, player.hp / player.max), 7);
    ctx.fillStyle = C.text;
    ctx.font = gameFont(11);
    ctx.textAlign = 'left';
    ctx.fillText(`你 ${Math.max(0, Math.round(player.hp))}`, PAD, PAD + 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.sub;
    ctx.fillText(`队友 ${ally.down > 0 ? '倒地 ' + ally.down.toFixed(1) + 's' : Math.max(0, Math.round(ally.hp))}`, PAD + barW, PAD + 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.fillText(`第 ${wave}/${WAVES} 波 · ${score} 分`, W / 2, PAD + 40);

    // Boss 血条
    if (bossRef && bossRef.hp > 0) {
      const bw = W - PAD * 2;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(PAD, 62, bw, 7);
      ctx.fillStyle = C.boss;
      ctx.fillRect(PAD, 62, bw * Math.max(0, bossRef.hp / bossRef.max), 7);
      ctx.fillStyle = C.text;
      ctx.font = gameFont(10, 600);
      ctx.fillText(`头目 ${Math.max(0, Math.ceil(bossRef.hp))}/${bossRef.max}`, W / 2, 84);
    }

    // 摇杆
    if (joy.on) {
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 42, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(125,160,255,.35)';
      ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 30, joy.oy + joy.dy * 30, 18, 0, Math.PI * 2); ctx.fill();
    }
  };

  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const startLoop = () => {
    if (raf > 0 || !canvas.isConnected) return;
    lastT = 0;
    raf = gRaf(loop);
  };
  const loop = (t) => {
    raf = 0;
    if (!canvas.isConnected) return;
    const dt = lastT ? Math.min(0.04, (t - lastT) / 1000) : 0;
    lastT = t;
    update(dt);
    render();
    if (!over && !shopOpen) raf = gRaf(loop);
  };

  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  canvas.style.touchAction = 'none';
  let tap = { x: 0, y: 0, t: 0, moved: false };
  canvas.addEventListener('pointerdown', (e) => {
    if (over || shopOpen) return;
    const p = pointAt(e);
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    joy = { on: true, ox: p.x, oy: p.y, dx: 0, dy: 0, id: e.pointerId };
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!joy.on) return;
    const p = pointAt(e);
    let dx = p.x - joy.ox, dy = p.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) tap.moved = true;
    if (d > 42) { dx = (dx / d) * 42; dy = (dy / d) * 42; }
    joy.dx = dx / 42; joy.dy = dy / 42;
  });
  const joyUp = () => {
    if (joy.id != null && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(joy.id); } catch (_) {}
    }
    joy.on = false; joy.dx = 0; joy.dy = 0; joy.id = null;
  };
  canvas.addEventListener('pointerup', (e) => {
    const wasTap = !tap.moved && performance.now() - tap.t < 320;
    joyUp();
    // 单击空白处（也就是摇杆区域）进入手雷倒计时，再单击立即释放
    if (wasTap && !over && !shopOpen) useGrenade();
  });
  canvas.addEventListener('pointercancel', joyUp);

  const onKey = (e) => {
    if (!canvas.isConnected) { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[e.key] = true;
    if (e.key === ' ') useGrenade();
  };
  const onKeyUp = (e) => { keys[e.key] = false; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  const GRENADE_R = 78;
  const releaseGrenade = () => {
    if (!aimG || over || shopOpen || stats.grenade <= 0) return;
    throwGrenade(player.x, player.y, aimG.x, aimG.y, 'player', 78, aimG.r);
    aimG = null;
    stats.grenade -= 1;
    grenadeCd = 8;
    paintHud(true);
  };
  const useGrenade = () => {
    if (over || shopOpen || stats.grenade <= 0) return;
    if (aimG) { releaseGrenade(); return; }
    if (grenadeCd > 0) return;
    // 摇杆还在推动时不让扔，先松手定位
    if (joy.on && (Math.abs(joy.dx) > 0.06 || Math.abs(joy.dy) > 0.06)) {
      toast('松开摇杆定住再扔手雷');
      return;
    }
    // 第一次点：角色前方铺出爆炸范围，给 1.2 秒倒计时
    const ang = player.aim || -Math.PI / 2;
    const dist = 118;
    const cx = Math.max(GRENADE_R * 0.6, Math.min(W - GRENADE_R * 0.6, player.x + Math.cos(ang) * dist));
    const cy = Math.max(GRENADE_R * 0.6, Math.min(H - GRENADE_R * 0.6, player.y + Math.sin(ang) * dist));
    aimG = { x: cx, y: cy, r: GRENADE_R, t: 1.2 };
    toast('1.2 秒后自动投掷，再点一次立即释放');
    paintHud(true);
  };
  grenadeBtn && grenadeBtn.addEventListener('click', useGrenade);
  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('squad', (n) => { level = n; reset(); });
  level = diff.get();
  reset();
  // 上次退到一半的进度，能接上就接上
  let saved = null;
  try { saved = JSON.parse(safeGet('minxtok.game.save.squad') || 'null'); } catch (_) { saved = null; }
  const applySaved = (s) => {
    wave = Math.min(WAVES, s.wave || 1);
    score = s.score || 0;
    Object.assign(stats, s.stats || {});
    Object.assign(bought, s.bought || {});
    armorLv = s.armorLv || 0;
    droneDmgLv = s.droneDmgLv || 0;
    drones = Array.from({ length: s.droneCount || 0 }, (_, i) => ({ ang: i * 2, x: player.x, y: player.y - 40, cd: 0 }));
    if (s.skinId) skinId = s.skinId;
    player.max = s.pmax || player.max;
    player.hp = player.max;
    ally.max = s.amax || ally.max;
    ally.hp = ally.max;
    enemies = []; ebul = []; grens = [];
    startWave();
    paintHud(true);
  };
  if (saved && saved.wave) {
    if (startBtn) startBtn.textContent = '重新开始';
    if (resumeBtn) {
      resumeBtn.hidden = false;
      resumeBtn.textContent = `继续第 ${Math.min(WAVES, saved.wave)} 波`;
    }
    const sub = startEl && startEl.querySelector('.ss-sub');
    if (sub) sub.textContent = `上次退到第 ${Math.min(WAVES, saved.wave)} 波 · 积分 ${saved.score || 0}，可继续或重新开始`;
  }
  const saveRun = () => {
    if (over) return;
    try {
      localStorage.setItem('minxtok.game.save.squad', JSON.stringify({
        wave, score, stats, bought, armorLv, droneDmgLv, droneCount: drones.length,
        skinId, pmax: player.max, amax: ally.max,
      }));
    } catch (_) {}
  };
  if (startBtn && startEl) startBtn.addEventListener('click', () => {
    started = true;
    startEl.hidden = true;
    if (saved) {
      try { localStorage.removeItem('minxtok.game.save.squad'); } catch (_) {}
      saved = null;
    }
    startLoop();
  });
  if (resumeBtn && startEl) resumeBtn.addEventListener('click', () => {
    if (!saved) return;
    applySaved(saved);
    started = true;
    startEl.hidden = true;
    resumeBtn.hidden = true;
    startLoop();
  });
  mountPause('squad', saveRun);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (!over && !shopOpen) startLoop();
  });
}

/* ---------------- 爆破能手（拆除模拟） ---------------- */
function bindDemolition() {
  const canvas = document.getElementById('demoCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  const hudEl = document.getElementById('demoHud');
  const toolsEl = document.getElementById('demoTools');
  const settleEl = document.getElementById('demoSettle');
  const fireBtn = document.getElementById('demoFire');
  const detBtn = document.getElementById('demoDet');
  const removalEl = document.getElementById('demoRemoval');
  const removalVal = document.getElementById('demoRemovalVal');
  const cleanCostEl = document.getElementById('demoCleanCost');
  const settleBtn = document.getElementById('demoSettleBtn');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 360, GROUND = 306;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const MAT = {
    wood: { hp: 26, color: '#c08a4e', light: '#d8a86a', name: '木' },
    brick: { hp: 58, color: '#b45a44', light: '#cf7a60', name: '砖' },
    concrete: { hp: 84, color: '#9aa4b2', light: '#b7c0cc', name: '砼' },
    rock: { hp: 70, color: '#7b8794', light: '#98a4b2', name: '岩' },
    metal: { hp: 96, color: '#7c8fa8', light: '#9cb0c8', name: '钢' },
  };
  const CHARGES = {
    nano: { name: '精密小药', price: 45, power: 28, radius: 30, poll: 0, noise: 14 },
    small: { name: '小炸药', price: 60, power: 52, radius: 48, poll: 0, noise: 30 },
    shaped: { name: '定向爆破', price: 130, power: 96, radius: 58, poll: 2, noise: 52 },
    quiet: { name: '低噪装药', price: 150, power: 88, radius: 56, poll: 3, noise: 24 },
    high: { name: '高能炸药', price: 210, power: 150, radius: 70, poll: 5, noise: 88 },
    chem: { name: '化学炸药', price: 95, power: 120, radius: 76, poll: 22, noise: 76 },
    heavy: { name: '大型聚能', price: 380, power: 240, radius: 92, poll: 9, noise: 132 },
    cutter: { name: '精密切割', price: 140, power: 74, radius: 36, poll: 0, noise: 8 },
    foam: { name: '低震泡沫', price: 190, power: 108, radius: 54, poll: 2, noise: 12 },
    thermo: { name: '温压弹', price: 300, power: 210, radius: 88, poll: 16, noise: 118 },
  };
  const FUSE = 10;
  const DET_PRICE = 120;
  const CLEAN_PER_TON = 35;
  const DUST_PRICE = 110;

  const mk = (x, y, w, h, mat, opt) => {
    const hp = MAT[mat].hp;
    return { x, y, w, h, mat, hp, max: hp, gone: false, ...(opt || {}) };
  };
  // 埋在结构里的管线：炸断就验收不通过
  const pipeRun = (x, y, n, vertical) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push(vertical
        ? mk(x, y + i * 14, 10, 14, 'metal', { pipe: true })
        : mk(x + i * 14, y, 14, 10, 'metal', { pipe: true }));
    }
    return out;
  };
  // 旁边的保护建筑：立在地上，冲击波打坏就失败
  const keepHouse = (x) => [
    mk(x, GROUND - 22, 34, 22, 'brick', { keep: true }),
    mk(x + 5, GROUND - 42, 24, 20, 'brick', { keep: true }),
    mk(x + 8, GROUND - 54, 18, 12, 'concrete', { keep: true }),
  ];

  const bridge = () => {
    const b = [];
    for (let i = 0; i < 10; i += 1) b.push(mk(58 + i * 25, 178, 24, 14, 'wood'));
    for (let r = 0; r < 6; r += 1) {
      b.push(mk(78, 194 + r * 19, 16, 18, 'concrete'));
      b.push(mk(266, 194 + r * 19, 16, 18, 'concrete'));
    }
    return b;
  };
  const building = () => {
    const b = [];
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        b.push(mk(130 + c * 26, 168 + r * 34, 25, 33, r === 0 ? 'concrete' : 'brick'));
      }
    }
    return b;
  };
  const tower = () => {
    const b = [];
    for (let r = 0; r < 4; r += 1) {
      b.push(mk(168, 126 + r * 20, 28, 19, 'metal'));
    }
    for (let r = 0; r < 5; r += 1) {
      b.push(mk(180, 206 + r * 20, 16, 19, 'concrete'));
    }
    for (let i = 0; i < 3; i += 1) b.push(mk(150 + i * 24, 112, 23, 13, 'metal'));
    return b;
  };
  const hill = () => {
    const b = [];
    for (let r = 0; r < 5; r += 1) {
      const n = 7 - r;
      for (let i = 0; i < n; i += 1) {
        b.push(mk(120 + i * 22 + r * 11, 300 - (r + 1) * 20, 21, 19, 'rock'));
      }
    }
    return b;
  };
  const factory = () => {
    const b = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 4; c += 1) b.push(mk(112 + c * 26, 206 + r * 33, 25, 32, 'concrete'));
    }
    for (let i = 0; i < 3; i += 1) {
      for (let r = 0; r < 2; r += 1) b.push(mk(222 + i * 26, 250 + r * 28, 24, 27, 'metal'));
    }
    return b;
  };

  const wall = () => {
    const b = [];
    for (let c = 0; c < 12; c += 1) {
      b.push(mk(42 + c * 23, 236, 22, 68, c % 4 === 0 ? 'concrete' : 'brick'));
    }
    for (let c = 0; c < 4; c += 1) b.push(mk(96 + c * 46, 214, 44, 20, 'metal'));
    return b;
  };
  const chimney = () => {
    const b = [];
    for (let r = 0; r < 9; r += 1) {
      const w = 34 - r * 1.4;
      b.push(mk(178 - w / 2, 292 - (r + 1) * 20, w, 19, r < 3 ? 'concrete' : 'brick'));
    }
    for (let c = 0; c < 3; c += 1) b.push(mk(74 + c * 30, 272, 28, 32, 'rock'));
    return b;
  };
  const twin = () => {
    const b = [];
    for (let side = 0; side < 2; side += 1) {
      const x0 = side ? 206 : 96;
      for (let r = 0; r < 5; r += 1) {
        b.push(mk(x0, 282 - (r + 1) * 22, 56, 21, r % 2 ? 'concrete' : 'brick'));
      }
      for (let i = 0; i < 2; i += 1) b.push(mk(x0 + 8 + i * 24, 128, 22, 14, 'metal'));
    }
    b.push(mk(96, 282, 166, 16, 'rock'));
    return b;
  };
  const pit = () => {
    const b = [];
    for (let c = 0; c < 11; c += 1) b.push(mk(38 + c * 26, 300, 25, 22, 'rock'));
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 6; c += 1) b.push(mk(70 + c * 30, 278 - r * 24, 28, 22, r === 2 ? 'concrete' : 'brick'));
    }
    return b;
  };
  const steel = () => {
    const b = [];
    for (let r = 0; r < 6; r += 1) {
      b.push(mk(84, 292 - (r + 1) * 22, 14, 21, 'metal'));
      b.push(mk(256, 292 - (r + 1) * 22, 14, 21, 'metal'));
      if (r < 5) b.push(mk(98, 270 - r * 22, 158, 10, 'metal'));
    }
    for (let c = 0; c < 4; c += 1) b.push(mk(104 + c * 40, 292, 38, 18, 'concrete'));
    return b;
  };

  const LEVELS = {
    1: {
      name: '旧木桥', budget: 1500, target: 0.45, pollMax: 32, foundMax: 65, removalMin: 45, make: bridge,
      intro: '城郊河道上的废弃木桥，两头是乡道，桥下还有一条供水干管。只拆桥面，别把干管震裂，也别把河堤一起掀了。',
    },
    2: {
      name: '三层砖楼', budget: 1900, target: 0.58, pollMax: 30, foundMax: 65, removalMin: 48, make: () => {
        const b = building();
        b.push(...pipeRun(120, 200, 4, true));
        b.push(...keepHouse(262, 262));
        return b;
      },
      noiseMax: 300,
      intro: '老城区临街砖楼，左侧墙里走的是燃气立管，右侧 3 米是还没腾退的邻家小楼。楼体可以整片倒，管线和邻居不能碰。',
    },
    3: {
      name: '老水塔', budget: 2100, target: 0.62, pollMax: 26, foundMax: 65, removalMin: 50, make: tower,
      noiseMax: 340,
      intro: '厂区自备水塔，塔基和地下管廊连着，钢架拆完要保证塔身按预定方向倒，不能砸向配电房。',
    },
    4: {
      name: '小石山', budget: 2200, target: 0.62, pollMax: 34, foundMax: 70, removalMin: 50, make: hill,
      noiseMax: 380,
      intro: '场地平整剩下的岩石堆，硬度高、体积大。用药量得算准，震动传得远，附近民房对噪声敏感，白天也只给你一档额度。',
    },
    5: {
      name: '化工厂房', budget: 2700, target: 0.68, pollMax: 20, foundMax: 60, removalMin: 55, make: () => {
        const b = factory();
        b.push(...pipeRun(100, 240, 5, false));
        b.push(...keepHouse(296, 268));
        return b;
      },
      noiseMax: 280,
      intro: '停产化工厂的主车间，墙面残留在管线里的化学品最怕高温。左侧横穿的是物料管，右侧是未清空的储罐区。',
    },
    6: {
      name: '老城墙', budget: 2900, target: 0.66, pollMax: 30, foundMax: 62, removalMin: 55, make: wall,
      noiseMax: 320,
      intro: '明代城墙的一段，外包砖内填土。城里是居民区，倒塌方向必须朝外侧空地，砖块飞溅和震动都要压住。',
    },
    7: {
      name: '砖烟囱', budget: 3100, target: 0.72, pollMax: 24, foundMax: 58, removalMin: 58, make: () => {
        const b = chimney();
        b.push(...keepHouse(286, 272));
        return b;
      },
      noiseMax: 260,
      intro: '热电厂废弃砖烟囱，高 30 米，底部有烟道。定向倒塌要清出倒向，右侧的仓库还在用，冲击波不能把它推裂。',
    },
    8: {
      name: '双塔', budget: 3400, target: 0.74, pollMax: 22, foundMax: 58, removalMin: 60, make: () => {
        const b = twin();
        b.push(...pipeRun(88, 250, 3, true));
        b.push(...keepHouse(170, 262));
        return b;
      },
      noiseMax: 240,
      intro: '两栋并排的旧住宅塔楼，中间只隔 8 米，下面埋着市政管线。要一栋一栋放倒，中间的保护楼一步都不能伤。',
    },
    9: {
      name: '基坑', budget: 3700, target: 0.76, pollMax: 28, foundMax: 66, removalMin: 60, make: pit,
      noiseMax: 300,
      intro: '深基坑边的临时支护和堆载区，拆除时坑壁一旦失稳整片会塌。爆破震动就是坑壁的催命符。',
    },
    10: {
      name: '钢架厂房', budget: 4100, target: 0.8, pollMax: 18, foundMax: 55, removalMin: 65, make: () => {
        const b = steel();
        b.push(...pipeRun(70, 220, 4, true));
        b.push(...keepHouse(292, 276));
        return b;
      },
      noiseMax: 210,
      intro: '重型钢架厂房，节点全是高强螺栓，靠炸断柱脚让整体失稳。旁边是变电站，噪声和冲击波都卡得最死。',
    },
    11: {
      name: '河堤旧桥', budget: 4300, target: 0.78, pollMax: 22, foundMax: 58, removalMin: 62, make: () => {
        const b = bridge();
        b.push(...pipeRun(110, 250, 4, true));
        b.push(...keepHouse(300, 270));
        return b;
      },
      noiseMax: 260,
      intro: '河道整治后的第二座旧桥，桥台下面还压着新铺的供水管。桥面可以整段落水，河堤和管线不能伤。',
    },
    12: {
      name: '连片车间', budget: 4500, target: 0.8, pollMax: 20, foundMax: 58, removalMin: 64, make: () => {
        const b = factory();
        b.push(...pipeRun(96, 236, 5, false));
        b.push(...keepHouse(292, 266));
        return b;
      },
      noiseMax: 250,
      intro: '三跨连片车间，屋架彼此咬合，拆一跨会带着邻跨一起倒。先切缝，再分段起爆，别让整片拍下来。',
    },
    13: {
      name: '高烟囱', budget: 4700, target: 0.82, pollMax: 18, foundMax: 55, removalMin: 66, make: () => {
        const b = chimney();
        b.push(...keepHouse(288, 272));
        b.push(...pipeRun(88, 258, 3, true));
        return b;
      },
      noiseMax: 220,
      intro: '百米高烟囱，筒壁薄、重心高，倒向窗口只有十二米。切口要对称，起爆顺序错一秒就会坐塌。',
    },
    14: {
      name: '双塔连廊', budget: 5000, target: 0.84, pollMax: 18, foundMax: 54, removalMin: 68, make: () => {
        const b = twin();
        b.push(...pipeRun(84, 248, 4, true));
        b.push(...keepHouse(174, 260));
        return b;
      },
      noiseMax: 210,
      intro: '两栋塔楼中间加了一道连廊，结构互相拉扯。先断连廊，再让两栋各自向空地倒，顺序反了就会一起砸向保护楼。',
    },
    15: {
      name: '钢架总攻', budget: 5400, target: 0.86, pollMax: 16, foundMax: 52, removalMin: 70, make: () => {
        const b = steel();
        b.push(...pipeRun(66, 216, 5, true));
        b.push(...keepHouse(292, 274));
        b.push(...keepHouse(42, 274));
        return b;
      },
      noiseMax: 190,
      intro: '最后一次总攻：两侧都是不能碰的变电站和民居，中间钢架必须原地坐塌。药量、顺序、噪声，一项都不能错。',
    },
    16: {
      name: '断桥残段', budget: 5700, target: 0.88, pollMax: 18, foundMax: 50, removalMin: 72, make: () => {
        const b = bridge();
        b.push(...pipeRun(120, 252, 5, true));
        b.push(...keepHouse(298, 270));
        b.push(...keepHouse(34, 270));
        return b;
      },
      noiseMax: 180,
      intro: '主桥已经拆掉一半，只剩两段引桥和河堤。残段受力不均，任何一处先倒都会把另一段拽进河里。',
    },
    17: {
      name: '厂房群', budget: 6000, target: 0.9, pollMax: 16, foundMax: 50, removalMin: 74, make: () => {
        const b = factory();
        b.push(...pipeRun(88, 232, 5, false));
        b.push(...pipeRun(120, 200, 4, true));
        b.push(...keepHouse(298, 266));
        return b;
      },
      noiseMax: 170,
      intro: '四座厂房共用一条地下管廊，屋架和管线交错。必须逐跨切缝，先让中间塌，再让两侧向空地倒。',
    },
    18: {
      name: '双烟囱', budget: 6300, target: 0.9, pollMax: 15, foundMax: 48, removalMin: 76, make: () => {
        const b = chimney();
        b.push(...keepHouse(286, 272));
        b.push(...keepHouse(38, 272));
        b.push(...pipeRun(94, 256, 3, true));
        return b;
      },
      noiseMax: 160,
      intro: '两座并排高烟囱，中间只有一道检修平台。倒向必须错开，先倒一座再倒另一座，平台不能把两座绑在一起。',
    },
    19: {
      name: '连廊双塔', budget: 6600, target: 0.92, pollMax: 14, foundMax: 48, removalMin: 78, make: () => {
        const b = twin();
        b.push(...pipeRun(78, 244, 5, true));
        b.push(...keepHouse(168, 258));
        b.push(...keepHouse(300, 258));
        return b;
      },
      noiseMax: 150,
      intro: '超高层双塔，连廊里还有正在使用的管线。先切连廊，再让两栋向相反方向倒，保护楼和管线都得毫发无伤。',
    },
    20: {
      name: '终局拆解', budget: 7200, target: 0.94, pollMax: 12, foundMax: 46, removalMin: 80, make: () => {
        const b = steel();
        b.push(...pipeRun(60, 212, 6, true));
        b.push(...pipeRun(286, 212, 4, true));
        b.push(...keepHouse(296, 272));
        b.push(...keepHouse(34, 272));
        return b;
      },
      noiseMax: 140,
      intro: '终局：两侧保护建筑、两条主干管线、一整片钢架。只有一次机会，药量、顺序、震动全部算准，才能原地拆完。',
    },
  };

  let level = 2;
  let L = LEVELS[level] || LEVELS[2];
  let T = arcadeTheme();
  let themeAt = 0;
  let blocks = [];
  let totalArea = 1;
  let destroyedArea = 0;
  let money = 0, spent = 0, pollution = 0, foundation = 0, debris = 0, fireRisk = 0;
  let noise = 0, pipesBroken = 0, keepHurt = 0;
  let placed = [];
  let dustLeft = 3;
  let sel = 'nano';
  let hasDet = false;
  let fired = false, settled = false, recorded = false;
  let fx = [];
  let impacts = [];
  let raf = 0, lastT = 0;
  let hudAt = 0;

  const destruction = () => destroyedArea / totalArea;

  // 装好药后先算一遍：哪些块会直接炸毁，哪些只会受损
  const previewBlast = () => {
    const doom = new Set();
    const hurt = new Set();
    let area = 0;
    if (!placed.length || fired) return { frac: 0, doom, hurt };
    for (const b of blocks) {
      if (b.gone) continue;
      let dmg = 0;
      for (const c of placed) {
        const spec = CHARGES[c.type];
        const dx = b.x + b.w / 2 - c.x, dy = b.y + b.h / 2 - c.y;
        const d = Math.hypot(dx, dy);
        if (d <= spec.radius) dmg += spec.power * (1 - d / spec.radius);
      }
      if (dmg >= b.hp) { doom.add(b); area += b.w * b.h; }
      else if (dmg > 0) hurt.add(b);
    }
    return { frac: area / Math.max(1, totalArea), doom, hurt };
  };

  const paintHud = (force) => {
    const now = performance.now();
    if (!force && now - hudAt < 140) return;
    hudAt = now;
    if (hudEl) {
      const cells = [
        ['预算', `¥${money}`],
        ['已花', `¥${spent}`],
        ['装药', `${placed.length} 处`],
        ['预计破坏', `${Math.round(previewBlast().frac * 100)}%`],
        ['当前破坏', `${Math.round(destruction() * 100)}%`],
        ['污染', `${Math.round(pollution)}/${L.pollMax}`],
        ['地基', `${Math.round(foundation)}/${L.foundMax}`],
        ['噪声', L.noiseMax ? `${Math.round(noise)}/${L.noiseMax}` : '不限'],
      ];
      hudEl.innerHTML = cells.map(([k, v]) => `<div class="dh-cell"><span>${k}</span><b>${v}</b></div>`).join('');
    }
    const liveScore = Math.round(destruction() * 100);
    statusEl.innerHTML = `<span class="gs-level">第 ${level} 关 · ${L.name}</span>`
      + `<span class="gs-points">积分 ${liveScore}</span>`;
    if (detBtn) {
      detBtn.innerHTML = hasDet
        ? '<b>已备起爆器</b><span>装好药按起爆</span>'
        : `<b>买起爆器</b><span>¥${DET_PRICE} 一次性</span>`;
      detBtn.disabled = hasDet;
    }
    if (fireBtn) fireBtn.disabled = fired || !placed.length || !hasDet;
    const dustBtn = document.getElementById('demoDust');
    if (dustBtn) {
      dustBtn.textContent = `降尘 ¥${DUST_PRICE} · 剩${dustLeft}`;
      dustBtn.disabled = !fired || settled || dustLeft <= 0 || money < DUST_PRICE;
    }
    if (toolsEl) {
      toolsEl.querySelectorAll('[data-charge]').forEach((b) => {
        const c = CHARGES[b.dataset.charge];
        if (c) {
          const cost = c.price + FUSE;
          b.innerHTML = `<b>${c.name}</b><span>¥${cost} · 威力${c.power}</span><span class="dt-sub">噪声${c.noise} · 污染${c.poll}</span>`;
          b.classList.toggle('poor', !fired && money < cost);
        }
        b.classList.toggle('on', b.dataset.charge === sel);
        b.disabled = fired;
      });
      const un = document.getElementById('demoUndo');
      if (un) un.disabled = fired || !placed.length;
    }
  };

  const reset = () => {
    const bank = document.querySelector('.score-bank');
    if (bank) bank.remove();
    L = LEVELS[level] || LEVELS[2];
    blocks = L.make();
    totalArea = blocks.reduce((s, b) => s + b.w * b.h, 0) || 1;
    destroyedArea = 0;
    money = L.budget; spent = 0; pollution = 0; foundation = 0; debris = 0; fireRisk = 0;
    noise = 0; pipesBroken = 0; keepHurt = 0;
    placed = []; sel = 'nano'; hasDet = false; dustLeft = 3;
    fired = false; settled = false; recorded = false; fx = []; impacts = [];
    if (settleEl) settleEl.hidden = true;
    if (removalEl) removalEl.value = '60';
    if (settleBtn) settleBtn.disabled = false;
    setGameResult('', '');
    const diHead = document.getElementById('diHead');
    const diText = document.getElementById('diText');
    const diTags = document.getElementById('diTags');
    if (diHead) diHead.textContent = `第 ${level} 关 · ${L.name}`;
    if (diText) diText.textContent = L.intro || '';
    if (diTags) {
      diTags.innerHTML = `<span>破坏 ≥ ${Math.round(L.target * 100)}%</span><span>污染 ≤ ${L.pollMax}</span>`
        + `<span>地基 ≤ ${L.foundMax}</span><span>清运 ≥ ${L.removalMin}%</span>`
        + (L.noiseMax ? `<span>噪声 ≤ ${L.noiseMax}</span>` : '');
    }
    paintHud(true);
  };

  const buyDetonator = () => {
    if (hasDet || fired) return;
    if (money < DET_PRICE) { toast('预算不够买起爆器'); return; }
    money -= DET_PRICE; spent += DET_PRICE; hasDet = true;
    paintHud(true);
  };

  const placeCharge = (e) => {
    if (fired || settled) return;
    const p = pointAt(e);
    let hit = null;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const b = blocks[i];
      if (b.gone) continue;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { hit = b; break; }
    }
    if (!hit) { toast('点在要拆的结构上'); return; }
    if (hit.pipe) { toast('这段是管线，装上去就是炸断'); return; }
    if (hit.keep) { toast('这是要保的邻居，别在它身上装药'); return; }
    const spec = CHARGES[sel];
    const cost = spec.price + FUSE;
    if (money < cost) { toast(`预算不够，一处要 ¥${cost}`); return; }
    money -= cost; spent += cost;
    placed.push({ x: p.x, y: p.y, type: sel, block: hit });
    paintHud(true);
  };

  const undo = () => {
    if (fired || settled || !placed.length) return;
    const c = placed.pop();
    const back = CHARGES[c.type].price + FUSE;
    money += back; spent = Math.max(0, spent - back);
    paintHud(true);
  };

  const detonate = () => {
    if (fired || !placed.length || !hasDet) return;
    for (const c of placed) {
      const spec = CHARGES[c.type];
      pollution += spec.poll;
      noise += spec.noise || Math.round(spec.power * 0.55);
      if (spec.poll >= 20) fireRisk += 10;
      if (spec.power >= 90) fireRisk += 4;
      fx.push({ x: c.x, y: c.y, r: spec.radius, t: 0, poll: spec.poll });
      for (const b of blocks) {
        if (b.gone) continue;
        const dx = b.x + b.w / 2 - c.x, dy = b.y + b.h / 2 - c.y;
        const d = Math.hypot(dx, dy);
        if (d > spec.radius) continue;
        const f = 1 - d / spec.radius;
        b.hp -= spec.power * f;
        if (b.hp <= 0 && !b.gone) {
          b.gone = true;
          destroyedArea += b.w * b.h;
          debris += (b.w * b.h) / 900;
          if (b.pipe) pipesBroken += 1;
          if (b.keep) keepHurt += 1;
        } else if (b.keep && !b.keepHit && b.hp < b.max * 0.72) {
          b.keepHit = true;
          keepHurt += 1;
        }
      }
      const gd = Math.max(0, GROUND - c.y);
      foundation += spec.power * 0.12 * Math.max(0, 1 - gd / 150);
    }
    foundation = Math.min(100, foundation);
    pollution = Math.round(pollution);
    noise = Math.round(noise);
    fireRisk = Math.min(100, fireRisk);
    collapse();
    fired = true;
    if (settleEl) { settleEl.hidden = false; }
    updateClean();
    paintHud(true);
  };

  // 失去支撑的块会往下掉，掉出画面就当塌完了
  const collapse = () => {
    // 埋在墙里的管线不参与坍塌（它跟着结构走，结构炸没了算炸断）
    const alive = blocks.filter(b => !b.gone && !b.fall && !b.pipe);
    const supported = new Set();
    for (const b of alive) if (b.y + b.h >= GROUND - 3) supported.add(b);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of alive) {
        if (supported.has(b)) continue;
        for (const o of alive) {
          if (!supported.has(o) || o === b) continue;
          if (Math.abs(o.y - (b.y + b.h)) < 5 && o.x < b.x + b.w - 3 && o.x + o.w > b.x + 3) {
            supported.add(b);
            grew = true;
            break;
          }
        }
      }
    }
    for (const b of alive) {
      if (supported.has(b)) continue;
      b.fall = true;
      b.vy = 0;
      destroyedArea += b.w * b.h;
      debris += (b.w * b.h) / 900;
      if (b.pipe) pipesBroken += 1;
      if (b.keep) keepHurt += 1;
    }
  };

  const showLines = (lines, type) => {
    const el = document.getElementById('gameResult');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = lines.map((l, i) => `<div class="gr-line${i === 0 ? ' gr-title' : ''}">${l}</div>`).join('');
    el.className = `game-result ${type} pop`;
    flashGame(type);
    void el.offsetWidth;
  };

  const dust = () => {
    if (!fired || settled || dustLeft <= 0) return;
    if (money < DUST_PRICE) { toast('预算不够做降尘'); return; }
    money -= DUST_PRICE; spent += DUST_PRICE;
    dustLeft -= 1;
    pollution = Math.max(0, pollution - 7);
    paintHud(true);
  };

  const cleanCost = () => {
    const pct = Number(removalEl ? removalEl.value : 0) || 0;
    return Math.ceil(debris * (pct / 100) * CLEAN_PER_TON);
  };

  const updateClean = () => {
    if (!removalEl) return;
    const pct = Number(removalEl.value) || 0;
    if (removalVal) removalVal.textContent = `${pct}%`;
    if (cleanCostEl) cleanCostEl.textContent = `清运费用 ¥${cleanCost()}（渣土 ${debris.toFixed(1)} 吨）`;
  };

  const settle = () => {
    if (!fired || settled) return;
    const pct = Number(removalEl ? removalEl.value : 0) || 0;
    const cost = cleanCost();
    if (cost > money) { toast('预算不够付清运，降一点比例'); return; }
    money -= cost; spent += cost;
    settled = true;
    const dest = destruction();
    const spendRatio = spent / L.budget;
    const fails = [];
    if (dest < L.target) fails.push(`破坏 ${Math.round(dest * 100)}%，没到 ${Math.round(L.target * 100)}%`);
    if (pollution > L.pollMax) fails.push(`污染 ${pollution}，超过 ${L.pollMax}`);
    if (foundation > L.foundMax) fails.push(`地基损毁 ${Math.round(foundation)}，超过 ${L.foundMax}`);
    if (debris > 0 && pct < L.removalMin) fails.push(`清运只有 ${pct}%，至少要 ${L.removalMin}%`);
    if (fireRisk >= 60) fails.push('火灾风险过高');
    if (pipesBroken > 0) fails.push(`炸断管线 ${pipesBroken} 处`);
    if (keepHurt > 0) fails.push(`冲击波损伤邻近建筑 ${keepHurt} 处`);
    if (L.noiseMax && noise > L.noiseMax) fails.push(`噪声 ${noise}，超过 ${L.noiseMax}`);
    const pass = fails.length === 0;
    let stars = 0;
    if (pass) {
      stars = 1;
      if (pct >= 60 && pollution <= L.pollMax * 0.85) stars = 2;
      if (dest >= L.target + 0.12 && pct >= 80 && pollution <= L.pollMax * 0.6) stars = 3;
    }
    const carryIn = peekCarry('demolition');
    const score = Math.round(dest * 100) + Math.round(pct * 0.4) + Math.round((1 - Math.min(1, pollution / Math.max(1, L.pollMax))) * 20) - Math.round(foundation * 0.2) + carryIn;
    const lines = pass
      ? [
        `验收通过 · ${stars} 星`,
        `破坏 ${Math.round(dest * 100)}% · 污染 ${pollution} · 地基 ${Math.round(foundation)}`,
        `清运 ${pct}% · 花费 ¥${spent}/${L.budget}`,
      ]
      : ['验收不通过', ...fails];
    flashGame(pass ? 'win' : 'lose');
    if (!recorded) {
      recorded = true;
      recordHistory('demolition', { score: pass ? Math.max(1, score) : 0, text: `第 ${level} 关 · ${pass ? '通过' : '未通过'}` });
    }
    if (settleBtn) settleBtn.disabled = true;
    if (pass) {
      takeCarry('demolition');
    }
    if (pass && score > 0) mountBank('demolition', score);
    setGameResult(
      pass ? `第 ${level} 关验收通过` : `第 ${level} 关验收不通过`,
      pass ? 'win' : 'lose',
      {
        stars,
        score,
        noPoints: pass,
        bank: pass ? score : 0,
        detail: pass
          ? `破坏 ${Math.round(dest * 100)}% · 污染 ${pollution} · 地基 ${Math.round(foundation)}<br>清运 ${pct}% · 花费 ¥${spent}/${L.budget}`
          : fails.slice(0, 3).join('<br>'),
      },
    );
    paintHud(true);
  };

  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const render = () => {
    const t = performance.now();
    if (t - themeAt > 500) { themeAt = t; T = arcadeTheme(); }
    const light = T.light;
    ctx.fillStyle = light ? '#eef4fd' : '#070d18';
    ctx.fillRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, light ? '#dce9fb' : '#0a1730');
    sky.addColorStop(1, light ? '#f7fbff' : '#0d1a2c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);
    ctx.fillStyle = light ? '#c9b48e' : '#231a10';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = light ? 'rgba(80,60,30,.28)' : 'rgba(220,190,140,.18)';
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

    const pv = previewBlast();
    for (const b of blocks) {
      if (b.gone) continue;
      const m = MAT[b.mat];
      const ratio = Math.max(0, b.hp / b.max);
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      ctx.save();
      if (b.fall || b.tilt) {
        ctx.translate(bcx, bcy);
        ctx.rotate(b.tilt || 0);
        ctx.translate(-bcx, -bcy);
      }
      ctx.fillStyle = light ? m.light : m.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.pipe) {
        ctx.fillStyle = 'rgba(56,160,220,.55)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = 'rgba(120,220,255,.95)';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      } else if (b.keep) {
        ctx.strokeStyle = 'rgba(245,190,80,.95)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.6;
        ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(245,190,80,.16)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      } else {
        ctx.strokeStyle = light ? 'rgba(60,50,40,.35)' : 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      }
      if (pv.doom.has(b)) {
        ctx.fillStyle = 'rgba(239,68,68,.34)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = 'rgba(255,140,140,.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      } else if (pv.hurt.has(b)) {
        ctx.fillStyle = 'rgba(245,158,11,.20)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      if (ratio < 1) {
        ctx.strokeStyle = `rgba(20,20,20,${0.15 + (1 - ratio) * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.2);
        ctx.lineTo(b.x + b.w * 0.55, b.y + b.h * 0.6);
        ctx.lineTo(b.x + b.w * 0.4, b.y + b.h * 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const c of placed) {
      if (!fired) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(239,68,68,.42)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(c.x, c.y, CHARGES[c.type].radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      const blink = 0.55 + 0.45 * Math.sin(performance.now() / 180);
      ctx.fillStyle = `rgba(239,68,68,${blink})`;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.stroke();
    }

    for (const f of fx) {
      const k = Math.min(1, f.t / 0.5);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.poll >= 20 ? '#84cc16' : '#f59e0b';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k * 0.9), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const im of impacts) {
      const k = Math.max(0, im.t / 0.32);
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = light ? '#8b7355' : '#c9b48e';
      ctx.beginPath();
      ctx.ellipse(im.x, im.y, 26 * (1 - k * 0.4), 4 + 5 * (1 - k), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (debris > 0 && settled) {
      ctx.fillStyle = 'rgba(90,80,70,.55)';
      for (let i = 0; i < 12; i += 1) {
        ctx.fillRect(60 + i * 20, GROUND + 8 + (i % 3) * 6, 14, 4);
      }
    }
  };

  const loop = (t) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < 0.6);
    for (const im of impacts) im.t -= dt;
    impacts = impacts.filter((im) => im.t > 0);
    // 坍塌物理：没支撑的块自由落体，带一点旋转感（直接画斜）
    for (const b of blocks) {
      if (!b.fall) continue;
      b.vy += 1100 * dt;
      if (b.vx == null) b.vx = (Math.random() - 0.5) * 46;
      b.vx += (b.x < W / 2 ? -9 : 9) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.tilt = (b.tilt || 0) + dt * (b.vx > 0 ? 1.8 : -1.8);
      if (!b.hitGround && b.y + b.h >= GROUND + 4) {
        b.hitGround = true;
        b.vy *= -0.24;
        b.vx *= 0.45;
        impacts.push({ x: b.x + b.w / 2, y: GROUND, t: 0.32 });
      }
      if (b.y > H + 60) { b.fall = false; b.gone = true; }
    }
    render();
    raf = gRaf(loop);
  };

  // 画布允许竖向滚动：手指上下滑是翻页，轻轻一点才算装药
  canvas.style.touchAction = 'pan-y';
  let pressX = 0, pressY = 0, pressT = 0, pressing = false;
  canvas.addEventListener('pointerdown', (e) => {
    pressing = true;
    pressX = e.clientX; pressY = e.clientY; pressT = performance.now();
  });
  canvas.addEventListener('pointercancel', () => { pressing = false; });
  canvas.addEventListener('pointerup', (e) => {
    if (!pressing) return;
    pressing = false;
    const moved = Math.hypot(e.clientX - pressX, e.clientY - pressY);
    const held = performance.now() - pressT;
    if (moved > 12 || held > 900) return;  // 滑动/长按不算点击
    placeCharge(e);
  });
  if (toolsEl) {
    toolsEl.querySelectorAll('[data-charge]').forEach((b) => {
      b.addEventListener('click', () => {
        if (fired) return;
        sel = b.dataset.charge;
        paintHud(true);
      });
    });
  }
  const undoBtn = document.getElementById('demoUndo');
  undoBtn && undoBtn.addEventListener('click', undo);
  detBtn && detBtn.addEventListener('click', buyDetonator);
  fireBtn && fireBtn.addEventListener('click', detonate);
  removalEl && removalEl.addEventListener('input', updateClean);
  settleBtn && settleBtn.addEventListener('click', settle);
  const dustBtn = document.getElementById('demoDust');
  dustBtn && dustBtn.addEventListener('click', dust);
  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('demolition', (n) => { level = n; reset(); });
  level = diff.get();
  reset();
  gRaf(loop);
}

/* ---------------- 额度复活（勇往直前 / 疯狂虾虾） ---------------- */
// 复活统一走总积分，价码 180~480，输一把只给 45 分，所以复活是真要掏钱的决定
function revivePts(kind, progress) {
  return Math.max(180, Math.min(480, Math.round(reviveCost(kind, progress) * 60)));
}

function reviveCost(kind, progress) {
  const step = kind === 'runner' ? 250 : 15;
  const raw = 3 + Math.floor(progress / step);
  return Math.max(3, Math.min(10, raw));
}

async function spendQuota(amount) {
  try {
    const r = await fetch('/api/game/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, amount }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      const left = typeof d.left === 'number' ? d.left : null;
      return { ok: false, error: d.error || 'failed', left };
    }
    if (d.quota) window.dispatchEvent(new CustomEvent('minxtok-quota', { detail: d.quota }));
    return { ok: true, quota: d.quota };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

// 复活统一花总积分：不再动额度，额度只留给聊天用
function mountRevive(host, { cost, left, onBuy }) {
  const old = host.querySelector('.game-revive');
  if (old) old.remove();
  const ptCost = Math.max(100, Math.round(cost * 120));
  const box = document.createElement('div');
  box.className = 'game-revive';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'game-btn rv-btn';
  btn.textContent = `花 ${ptCost} 积分复活（还能复活 ${left} 次）`;
  const hint = document.createElement('div');
  hint.className = 'rv-hint';
  hint.textContent = '复活后从原地继续，三次用完就只能重开';
  box.appendChild(btn);
  box.appendChild(hint);
  host.appendChild(box);

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const wallet = ptsLoad();
    if (wallet.total < ptCost) {
      btn.textContent = `积分不足（还差 ${ptCost - wallet.total}）`;
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    btn.textContent = '扣积分中…';
    if (!ptsSpendTotal(ptCost)) {
      btn.disabled = false;
      btn.textContent = `花 ${ptCost} 积分复活（还能复活 ${left} 次）`;
      return;
    }
    toast(`已花 ${ptCost} 积分复活`);
    box.remove();
    onBuy();
  });
  return box;
}

const CARRY_RATE = 0.035;

function peekCarry(key) {
  try {
    const n = Number(localStorage.getItem(`minxtok.carry.${key}`) || 0);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  } catch (_) { return 0; }
}
function takeCarry(key) {
  const n = peekCarry(key);
  try { localStorage.removeItem(`minxtok.carry.${key}`); } catch (_) {}
  return n;
}
function addCarry(key, n) {
  const add = Math.max(0, Math.round(n));
  if (!add) return 0;
  try { localStorage.setItem(`minxtok.carry.${key}`, String(peekCarry(key) + add)); } catch (_) {}
  return add;
}

/* ---------- 统一积分钱包 ----------
   所有游戏的积分进同一个总池，看得见总数；但每个游戏只花自己那份
   （自己打出来的分只能加强自己）。跨游戏唯一的用途是兑换额度，
   而且兑换只在游戏中心的单独窗口里做，游戏内不再放兑换按钮。 */
const PTS_KEY = 'minxtok.points.v2';
const PTS_PER_QUOTA = 600;
const PTS_DAILY_CAP = 20;

function ptsLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(PTS_KEY) || '{}');
    return {
      total: Math.max(0, Math.round(Number(raw.total) || 0)),
      byGame: raw.byGame && typeof raw.byGame === 'object' ? raw.byGame : {},
    };
  } catch (_) { return { total: 0, byGame: {} }; }
}
function ptsSave(p) { try { localStorage.setItem(PTS_KEY, JSON.stringify(p)); } catch (_) {} }
function ptsAdd(key, n) {
  const add = Math.max(0, Math.round(n));
  const p = ptsLoad();
  if (!add) return p;
  p.total += add;
  p.byGame[key] = Math.max(0, Math.round(Number(p.byGame[key]) || 0)) + add;
  ptsSave(p);
  return p;
}
function ptsOf(key) { return Math.max(0, Math.round(Number(ptsLoad().byGame[key]) || 0)); }
// 只能花本游戏的分：别的游戏挣的分动不了
function ptsSpendGame(key, n) {
  const cost = Math.max(0, Math.round(n));
  const p = ptsLoad();
  const own = Math.max(0, Math.round(Number(p.byGame[key]) || 0));
  if (cost <= 0 || own < cost) return null;
  p.byGame[key] = own - cost;
  p.total = Math.max(0, p.total - cost);
  ptsSave(p);
  return p;
}
function ptsSpendTotal(n) {
  const cost = Math.max(0, Math.round(n));
  const p = ptsLoad();
  if (cost <= 0 || p.total < cost) return null;
  p.total -= cost;
  let left = cost;
  Object.keys(p.byGame).sort((a, b) => (p.byGame[b] || 0) - (p.byGame[a] || 0)).forEach((k) => {
    if (left <= 0) return;
    const take = Math.min(Math.max(0, p.byGame[k] || 0), left);
    p.byGame[k] -= take;
    left -= take;
  });
  ptsSave(p);
  return p;
}

let ptsWheelValue = 0;
const PTS_WHEEL_ITEM = 42;

function buildPtsWheel(can) {
  const el = document.getElementById('ptsWheel');
  if (!el) return;
  const max = Math.max(0, Math.min(PTS_DAILY_CAP, Math.floor(can || 0)));
  el.innerHTML = Array.from({ length: max + 1 }, (_, i) =>
    `<button type="button" class="pts-wheel-item" data-v="${i}">${i} 点</button>`).join('');
  const paint = (idxIn) => {
    const idx = Math.max(0, Math.min(max, Number(idxIn) || 0));
    ptsWheelValue = idx;
    el.querySelectorAll('.pts-wheel-item').forEach((b, i) => b.classList.toggle('on', i === idx));
    const costEl = document.getElementById('ptsCost');
    if (costEl) {
      costEl.textContent = max
        ? (idx ? `${PTS_PER_QUOTA * idx} 分 → ${idx} 点额度` : '上下滑动选择数量')
        : '积分不够，先玩会儿游戏攒分';
    }
    const go = document.getElementById('ptsGo');
    if (go) {
      const enough = idx > 0 && ptsLoad().total >= PTS_PER_QUOTA * idx;
      go.disabled = !enough;
      go.classList.toggle('is-off', !enough);
    }
  };
  // 自己接管拖拽（原生滚动在弹层里偶发拖不动），抬手吸附到整格
  const start = max >= 1 ? 1 : 0;
  el.scrollTop = start * PTS_WHEEL_ITEM;
  bindWheel(el, PTS_WHEEL_ITEM, (idx) => paint(idx), haptic);
  paint(start);
  el.onclick = (e) => {
    const b = e.target.closest('.pts-wheel-item');
    if (!b) return;
    const v = Number(b.dataset.v);
    const idx = Math.round(el.scrollTop / PTS_WHEEL_ITEM);
    // 点当前选中那格 → 变成直接输入数字
    if (v === idx && !el._typing) { beginWheelInput(el, v, max, paint); return; }
    el.scrollTo({ top: v * PTS_WHEEL_ITEM, behavior: 'smooth' });
    paint(v);
    haptic(6);
  };
}

// 滚轮停在哪个数字上，再点一下这个数字就能直接用键盘输
function beginWheelInput(el, value, max, done) {
  if (el._typing) return;
  el._typing = true;
  const item = el.querySelector(`.pts-wheel-item[data-v="${value}"]`);
  if (!item) { el._typing = false; return; }
  item.innerHTML = `<input class="pts-wheel-input" type="number" inputmode="numeric" min="0" max="${max}" value="${value}" />`;
  const input = item.querySelector('input');
  setTimeout(() => { input.focus(); input.select(); }, 20);
  const finish = (commit) => {
    if (!commit) { el._typing = false; rebuild(); return; }
    const v = Math.max(0, Math.min(max, Math.round(Number(input.value) || 0)));
    el._typing = false;
    rebuild();
    el.scrollTop = v * PTS_WHEEL_ITEM;
    done(v);
  };
  const rebuild = () => { el._typing = false; buildPtsWheel(max); };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function openPtsModalEl() {
  return document.getElementById('ptsModal');
}

function closePointsModal() {
  const modal = openPtsModalEl();
  if (!modal || modal.hidden) return;
  modal.classList.add('closing');
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove('closing', 'show');
  }, 170);
}

function openPointsModal() {
  const modal = document.getElementById('ptsModal');
  if (!modal) return;
  const p = ptsLoad();
  const can = Math.min(PTS_DAILY_CAP, Math.floor(p.total / PTS_PER_QUOTA));
  const totalEl = document.getElementById('ptsTotal');
  if (totalEl) totalEl.textContent = String(p.total);
  const info = document.getElementById('ptsModalInfo');
  if (info) {
    info.textContent = can
      ? `当前 ${p.total} 分，最多可换 ${can} 点额度（${PTS_PER_QUOTA} 分换 1 点，每天最多 ${PTS_DAILY_CAP} 次）`
      : `当前 ${p.total} 分，还差 ${PTS_PER_QUOTA - p.total} 分才能换 1 点额度`;
  }
  buildPtsWheel(can);
  const go = document.getElementById('ptsGo');
  if (go) go.disabled = !can;
  modal.hidden = false;
  modal.classList.remove('closing');
  void modal.offsetWidth;
  modal.classList.add('show');
  gRaf(() => {
    buildPtsWheel(can);
    const sheet = modal.querySelector('.pts-sheet');
    if (sheet) { sheet.style.animation = 'none'; void sheet.offsetWidth; sheet.style.animation = ''; }
  });
}

// 结算卡片：积分进统一钱包，同时留 3.5% 折算到下一局
function mountBank(key, points) {
  const host = gameStage();
  if (!host) return null;
  const old = host.querySelector('.score-bank');
  if (old) old.remove();
  const pts = Math.max(0, Math.round(points));
  if (!pts) return null;
  const gain = addCarry(key, pts * CARRY_RATE);
  const wallet = ptsAdd(key, pts);
  const box = document.createElement('div');
  box.className = 'score-bank';
  box.innerHTML = `<div class="sbk-head">本局积分 <b>${pts}</b></div>`
    + `<div class="sbk-sub">已按 ${(CARRY_RATE * 100).toFixed(1)}% 折算，<b>${gain}</b> 分留到下一局</div>`
    + `<div class="sbk-sub">总积分 <b>${wallet.total}</b> · 本游戏可用 <b>${ptsOf(key)}</b></div>`;
  const row = document.createElement('div');
  row.className = 'sbk-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'game-btn sbk-ex';
  btn.textContent = '去游戏中心兑换额度';
  row.appendChild(btn);
  box.appendChild(row);
  host.appendChild(box);
  btn.addEventListener('click', () => {
    openGames(true);
    setTimeout(openPointsModal, 380);
  });
  return box;
}

/* ---------------- 台球：8 球 ---------------- */
function bindPool() {
  const canvas = document.getElementById('poolCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 240;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const RAIL = 18;
  const L = RAIL + 2, R = W - RAIL - 2, T = RAIL + 2, B = H - RAIL - 2;
  const BR = 5.4;
  const POCKETS = [[L, T], [W / 2, T], [R, T], [L, B], [W / 2, B], [R, B]];
  const POCKET_R = 11.5;
  const FELT = '#1f7a4d';

  const COLORS = ['#f0c02c', '#2f6fd0', '#cf3d3d', '#7a4bd0', '#e08b2d', '#2f9e63', '#8f2f3f', '#1b1b1b',
    '#f0c02c', '#2f6fd0', '#cf3d3d', '#7a4bd0', '#e08b2d', '#2f9e63', '#8f2f3f'];

  let level = 2;
  let T2 = arcadeTheme();
  let themeAt = 0;
  let balls = [];
  let turn = 'me';
  let group = { me: null, ai: null };
  let aim = null;
  let moving = false;
  let over = false;
  let recorded = false;
  let aiTimer = 0;
  let msg = '';
  let shotPotted = [];
  let foul = false;
  let raf = 0;
  let lastT = 0;

  const other = (t) => (t === 'me' ? 'ai' : 'me');

  const placeRack = () => {
    balls = [];
    const cue = { x: L + 62, y: H / 2, vx: 0, vy: 0, r: BR, num: 0, color: '#f7f7f2', stripe: false, active: true };
    balls.push(cue);
    // 三角摆球：8 号在中间
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    const startX = R - 58;
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= row; i++) {
        const num = order[k++];
        balls.push({
          x: startX + row * (BR * 1.78),
          y: H / 2 + (i - row / 2) * (BR * 2.05),
          vx: 0, vy: 0, r: BR, num,
          color: COLORS[num - 1],
          stripe: num > 8,
          active: true,
        });
      }
    }
  };

  const alive = () => balls.filter((b) => b.active && b.num > 0);
  const cueBall = () => balls[0];
  const groupOf = (b) => (b.num === 8 ? 'eight' : b.num < 8 ? 'solid' : 'stripe');

  const groupText = (g) => (g === 'solid' ? '全色 1-7' : g === 'stripe' ? '花色 9-15' : '未定球');
  const leftOf = (who) => {
    const g = group[who];
    if (!g) return `${alive().length} 球待定`;
    const n = alive().filter((b) => groupOf(b) === g).length;
    return n ? `剩 ${n} 球` : '清台，打 8 号';
  };
  const paintStatus = () => {
    const tip = over ? '本局结束' : turn === 'me' ? '轮到你' : 'AI 出杆中';
    statusEl.textContent = `${tip}｜你：${groupText(group.me)} · AI：${groupText(group.ai)}${msg ? ' · ' + msg : ''}`;
    const gMe = document.getElementById('pbGroupMe');
    const gAi = document.getElementById('pbGroupAi');
    const lMe = document.getElementById('pbLeftMe');
    const lAi = document.getElementById('pbLeftAi');
    if (gMe) gMe.textContent = groupText(group.me);
    if (gAi) gAi.textContent = groupText(group.ai);
    if (lMe) lMe.textContent = leftOf('me');
    if (lAi) lAi.textContent = leftOf('ai');
    const rMe = document.getElementById('pbRowMe');
    const rAi = document.getElementById('pbRowAi');
    if (rMe) rMe.classList.toggle('on', !over && turn === 'me');
    if (rAi) rAi.classList.toggle('on', !over && turn === 'ai');
  };

  const shoot = (dx, dy, power) => {
    const c = cueBall();
    const len = Math.hypot(dx, dy) || 1;
    const v = 250 + power * 520;
    c.vx = (dx / len) * v;
    c.vy = (dy / len) * v;
    moving = true;
    aim = null;
    shotPotted = [];
    foul = false;
    msg = '';
  };

  const overlapPath = (x1, y1, x2, y2, ignore) => {
    for (const b of balls) {
      if (!b.active || b === ignore) continue;
      if (b === cueBall()) continue;
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((b.x - x1) * dx + (b.y - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + dx * t, py = y1 + dy * t;
      if (Math.hypot(b.x - px, b.y - py) < BR * 2.1) return true;
    }
    return false;
  };

  // 距离→力度：阻尼是指数衰减，速度与已走距离近似线性（v = v0 - λx）
  const LAMBDA = 0.906;
  const powerFor = (dCue, dP, cutCos) => {
    const vTarget = Math.max(140, LAMBDA * dP * 1.15);
    const vHit = vTarget / Math.max(0.34, cutCos);
    const v0 = vHit + LAMBDA * dCue;
    return Math.max(0.1, Math.min(1, (v0 - 250) / 520));
  };

  // 试打：克隆一份球台跑一遍，看这一杆能不能把目标球送进袋、白球会不会摔袋
  const simShot = (ang, power, targetNum) => {
    const savedBalls = balls;
    const savedPotted = shotPotted;
    balls = savedBalls.map((b) => ({ ...b }));
    shotPotted = [];
    const c = balls[0];
    const v = 250 + power * 520;
    c.vx = Math.cos(ang) * v;
    c.vy = Math.sin(ang) * v;
    let scratch = false, potted = false;
    try {
      for (let i = 0; i < 360; i++) {
        let any = false;
        for (let k = 0; k < 4; k++) any = step(1 / 240) || any;
        const nums = shotPotted.map((b) => b.num);
        if (nums.includes(0)) scratch = true;
        if (nums.includes(targetNum)) potted = true;
        if (!any) break;
      }
    } finally {
      balls = savedBalls;
      shotPotted = savedPotted;
    }
    return { potted, scratch };
  };

  const aiShoot = () => {
    const c = cueBall();
    const myGroup = group.ai || (alive().length ? groupOf(alive()[0]) : 'solid');
    let targets = alive().filter((b) => groupOf(b) === myGroup);
    if (!targets.length) targets = alive().filter((b) => b.num === 8);
    if (!targets.length) targets = alive();

    const err = [0.028, 0.016, 0.008, 0.0035, 0.0012][level - 1] || 0.006;
    const cands = [];

    for (const b of targets) {
      for (const p of POCKETS) {
        const dP0 = Math.hypot(p[0] - b.x, p[1] - b.y);
        if (dP0 < POCKET_R) continue;
        const toP = Math.atan2(p[1] - b.y, p[0] - b.x);
        const gx = b.x - Math.cos(toP) * BR * 2.02;
        const gy = b.y - Math.sin(toP) * BR * 2.02;
        if (gx < L + BR || gx > R - BR || gy < T + BR || gy > B - BR) continue;
        const aCue = Math.atan2(gy - c.y, gx - c.x);
        let cut = Math.abs(aCue - toP) % (Math.PI * 2);
        if (cut > Math.PI) cut = Math.PI * 2 - cut;
        const cutDeg = (cut * 180) / Math.PI;
        if (cutDeg > 84) continue;
        if (overlapPath(b.x, b.y, p[0], p[1], b)) continue;
        if (overlapPath(c.x, c.y, gx, gy, b)) continue;
        const dCue = Math.hypot(gx - c.x, gy - c.y);
        const score = dCue * 1.05 + dP0 * 0.7 + cutDeg * 2.2 + (cutDeg > 62 ? 160 : 0);
        cands.push({ score, ang: aCue, dCue, dP: dP0, cutCos: Math.cos(cut), ball: b });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    if (cands.length > 9) cands.length = 9;

    // 一路都堵死时放宽条件再找一遍：不查路径、允许大角度，交给试打去筛
    if (!cands.length && level >= 2) {
      for (const b of targets) {
        for (const p of POCKETS) {
          const dP0 = Math.hypot(p[0] - b.x, p[1] - b.y);
          if (dP0 < POCKET_R) continue;
          const toP = Math.atan2(p[1] - b.y, p[0] - b.x);
          const gx = b.x - Math.cos(toP) * BR * 2.02;
          const gy = b.y - Math.sin(toP) * BR * 2.02;
          if (gx < L + BR || gx > R - BR || gy < T + BR || gy > B - BR) continue;
          const aCue = Math.atan2(gy - c.y, gx - c.x);
          let cut = Math.abs(aCue - toP) % (Math.PI * 2);
          if (cut > Math.PI) cut = Math.PI * 2 - cut;
          const cutDeg = (cut * 180) / Math.PI;
          if (cutDeg > 88) continue;
          const dCue = Math.hypot(gx - c.x, gy - c.y);
          cands.push({ score: dCue * 1.05 + dP0 * 0.7 + cutDeg * 3 + 200, ang: aCue, dCue, dP: dP0, cutCos: Math.cos(cut), ball: b, loose: true });
        }
      }
      cands.sort((a, b) => a.score - b.score);
      if (cands.length > 6) cands.length = 6;
    }

    // 5 星会用「试打」挑最稳的一杆；低星只按几何分，保留人情味
    let pick = cands[0] || null;
    if (cands.length && level >= 2) {
      const trialN = level >= 4 ? 5 : 2;
      const scoreCap = cands[0].score * 1.9 + 40;
      let safe = null;
      for (let i = 0; i < Math.min(trialN, cands.length); i++) {
        const cd = cands[i];
        if (i > 0 && cd.score > scoreCap) break;
        const pw = powerFor(cd.dCue, cd.dP, cd.cutCos);
        const r = simShot(cd.ang, pw, cd.ball.num);
        cd.verified = r.potted && !r.scratch;
        cd.scratch = r.scratch;
        if (cd.verified) { pick = cd; break; }
        if (!r.scratch && !safe) safe = cd;
      }
      // 没有必进球就选一杆不摔袋的，别把白球送进洞
      if (!pick.verified && safe) pick = safe;
    }

    if (!pick) {
      // 没有能进的球：找一颗能正面顶到的自家球，用刚够碰到的力度推过去，
      // 白球尽量停在台面中间，别一杆撞进袋
      let bestPlain = null;
      for (const b of targets) {
        if (overlapPath(c.x, c.y, b.x, b.y, b)) continue;
        const d = Math.hypot(b.x - c.x, b.y - c.y);
        const score = d + Math.hypot(b.x - W / 2, b.y - H / 2) * 0.4;
        if (!bestPlain || score < bestPlain.score) {
          bestPlain = { score, ang: Math.atan2(b.y - c.y, b.x - c.x), d, ball: b };
        }
      }
      if (!bestPlain) {
        const b = targets[Math.floor(Math.random() * targets.length)] || alive()[0];
        bestPlain = { ang: Math.atan2(b.y - c.y, b.x - c.x), d: Math.hypot(b.x - c.x, b.y - c.y), ball: b };
      }
      const pw = Math.max(0.12, Math.min(0.55, (LAMBDA * bestPlain.d * 1.45 - 250) / 520));
      // 保险：先试打一遍，白球会摔袋就换个更轻的力度/换颗球
      if (level >= 2 && !simShot(bestPlain.ang, pw, bestPlain.ball ? bestPlain.ball.num : 0).scratch) {
        const jitter = (Math.random() - 0.5) * 2 * err;
        shoot(Math.cos(bestPlain.ang + jitter), Math.sin(bestPlain.ang + jitter), pw);
        return;
      }
      const soft = Math.max(0.1, pw * 0.75);
      const jitter = (Math.random() - 0.5) * 2 * err;
      shoot(Math.cos(bestPlain.ang + jitter), Math.sin(bestPlain.ang + jitter), soft);
      return;
    }

    const power = powerFor(pick.dCue, pick.dP, pick.cutCos);
    const jitter = (Math.random() - 0.5) * 2 * err;
    shoot(Math.cos(pick.ang + jitter), Math.sin(pick.ang + jitter), power);
  };

  const resolveShot = () => {
    const c = cueBall();
    if (shotPotted.includes(c)) {
      foul = true;
      c.active = true;
      c.x = L + 62; c.y = H / 2; c.vx = 0; c.vy = 0;
      shotPotted = shotPotted.filter((b) => b !== c);
    }

    const pottedNums = shotPotted.map((b) => b.num);
    const potted8 = pottedNums.includes(8);

    const who = turn === 'me' ? '你' : 'AI';
    if (potted8) {
      const shooterGroup = group[turn];
      const remaining = shooterGroup ? alive().filter((b) => groupOf(b) === shooterGroup).length : 0;
      const cleared = shooterGroup && remaining === 0;
      const win = cleared && !foul;
      const reason = win
        ? `${who}把自己的球全部清完，最后打进 8 号，赢下这局`
        : foul
          ? `${who}打进 8 号时白球也落袋，犯规判负`
          : shooterGroup
            ? `${who}提前打进 8 号，自己还剩 ${remaining} 颗球没清，判负`
            : `${who}还没定球就打进 8 号，判负`;
      endGame(win ? (turn === 'me' ? 'win' : 'lose') : (turn === 'me' ? 'lose' : 'win'), reason);
      return;
    }

    let justAssigned = '';
    if (!group[turn] && pottedNums.length) {
      const first = shotPotted.find((b) => b.num !== 8);
      if (first) {
        const g = groupOf(first);
        group[turn] = g;
        group[other(turn)] = g === 'solid' ? 'stripe' : 'solid';
        justAssigned = `${who}打进 ${first.num} 号，${who === '你' ? '你' : 'AI'} 是${g === 'solid' ? '全色 1-7' : '花色 9-15'}`;
      }
    }

    const shooterGroup = group[turn];
    const own = shotPotted.filter((b) => groupOf(b) === shooterGroup).length;
    const enemy = shotPotted.length - own;

    if (foul) {
      msg = '白球落袋，犯规换人';
      turn = other(turn);
    } else if (own > 0 && enemy === 0) {
      msg = `${justAssigned ? justAssigned + '，' : ''}进了 ${own} 颗自己的球，继续出杆`;
    } else if (own > 0 && enemy > 0) {
      msg = `${justAssigned ? justAssigned + '，' : ''}自己的和对方的都进了，换人`;
      turn = other(turn);
    } else if (shotPotted.length === 0) {
      msg = '没进球，换人';
      turn = other(turn);
    } else {
      msg = '打进对方的球，换人';
      turn = other(turn);
    }

    if (turn === 'ai') aiTimer = 760;
    paintStatus();
  };

  const endGame = (result, text) => {
    over = true;
    moving = false;
    setGameResult(text, result, { score: result === 'win' ? 1 : 0 });
    if (!recorded) {
      recorded = true;
      recordHistory('pool', { score: result === 'win' ? 1 : 0, text });
    }
    msg = '';
    paintStatus();
  };

  const step = (dt) => {
    let anyMoving = false;
    for (const b of balls) {
      if (!b.active) continue;
      if (Math.abs(b.vx) + Math.abs(b.vy) < 3) { b.vx = 0; b.vy = 0; continue; }
      anyMoving = true;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const damp = Math.pow(0.985, dt * 60);
      b.vx *= damp;
      b.vy *= damp;

      // 先判进袋，再撞库：袋口判定半径 = 洞口 + 半个球。
      // 原来先撞库、且只认 9.5px，球心还没压到袋口就被库边弹走，必进球也会飞。
      let dropped = false;
      for (const p of POCKETS) {
        if (Math.hypot(b.x - p[0], b.y - p[1]) < POCKET_R + BR * 0.96) {
          b.active = false;
          b.vx = 0; b.vy = 0;
          shotPotted.push(b);
          dropped = true;
          break;
        }
      }
      if (dropped) continue;

      if (b.x - b.r < L) { b.x = L + b.r; b.vx = Math.abs(b.vx) * 0.82; }
      if (b.x + b.r > R) { b.x = R - b.r; b.vx = -Math.abs(b.vx) * 0.82; }
      if (b.y - b.r < T) { b.y = T + b.r; b.vy = Math.abs(b.vy) * 0.82; }
      if (b.y + b.r > B) { b.y = B - b.r; b.vy = -Math.abs(b.vy) * 0.82; }
    }

    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.active) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d > 0 && d < min) {
          const nx = dx / d, ny = dy / d;
          const push = (min - d) / 2;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const p = (a.vx * nx + a.vy * ny) - (b.vx * nx + b.vy * ny);
          if (p > 0) {
            a.vx -= p * nx * 0.94; a.vy -= p * ny * 0.94;
            b.vx += p * nx * 0.94; b.vy += p * ny * 0.94;
          }
        }
      }
    }
    return anyMoving;
  };

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const render = () => {
    const t = performance.now();
    if (t - themeAt > 500) { themeAt = t; T2 = arcadeTheme(); }

    ctx.fillStyle = T2.light ? '#e9e2d4' : '#2a2118';
    ctx.fillRect(0, 0, W, H);

    // 木边
    ctx.fillStyle = T2.light ? '#b98a52' : '#5a4026';
    rr(2, 2, W - 4, H - 4, 12);
    ctx.fill();

    // 台面
    ctx.fillStyle = FELT;
    rr(L - 6, T - 6, R - L + 12, B - T + 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    rr(L - 6, T - 6, R - L + 12, (B - T + 12) / 2, 6);
    ctx.fill();

    for (const p of POCKETS) {
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(p[0], p[1], POCKET_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // 瞄准线
    if (aim && turn === 'me' && !moving && !over) {
      const c = cueBall();
      const len = Math.hypot(aim.dx, aim.dy) || 1;
      const ux = aim.dx / len, uy = aim.dy / len;
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + ux * 200, c.y + uy * 200);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.beginPath();
      ctx.arc(c.x + ux * 200, c.y + uy * 200, BR, 0, Math.PI * 2);
      ctx.fill();
      // 球杆
      ctx.strokeStyle = '#e6d3a3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - ux * (16 + aim.power * 22), c.y - uy * (16 + aim.power * 22));
      ctx.lineTo(c.x - ux * (76 + aim.power * 22), c.y - uy * (76 + aim.power * 22));
      ctx.stroke();
    }

    for (const b of balls) {
      if (!b.active) continue;
      ctx.beginPath();
      ctx.arc(b.x + 1.5, b.y + 2, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      if (b.stripe) {
        ctx.fillStyle = '#f6f6f0';
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - b.r, b.y - b.r * 0.55, b.r * 2, b.r * 1.1);
        ctx.restore();
      } else {
        ctx.fillStyle = b.color;
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  let shotClock = 0;
  const loop = (t) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (moving) {
      // 子步进，避免高速穿球
      const sub = 4;
      let anyMoving = false;
      for (let s = 0; s < sub; s++) anyMoving = step(dt / sub) || anyMoving;
      if (!anyMoving) {
        moving = false;
        resolveShot();
      }
    } else if (!over) {
      shotClock += dt * 1000;
      if (turn === 'ai' && aiTimer > 0) {
        aiTimer -= dt * 1000;
        if (aiTimer <= 0 && !over) { aiShoot(); }
      }
    }
    render();
    raf = gRaf(loop);
  };

  const reset = () => {
    placeRack();
    turn = 'me';
    group = { me: null, ai: null };
    over = false;
    recorded = false;
    moving = false;
    aim = null;
    msg = '';
    aiTimer = 0;
    setGameResult('', '');
    paintStatus();
  };

  let dragStart = null;
  canvas.style.touchAction = 'none';
  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (turn !== 'me' || moving || over) return;
    dragStart = pointAt(e);
    aim = { dx: 0, dy: 0, power: 0 };
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const p = pointAt(e);
    const c = cueBall();
    const dx = c.x - p.x, dy = c.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    aim = { dx: dx / len, dy: dy / len, power: Math.min(1, len / 130) };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!dragStart) return;
    const a = aim;
    dragStart = null;
    if (!a || a.power < 0.12) { aim = null; return; }
    shoot(a.dx, a.dy, a.power);
  });

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('pool', (n) => { level = n; reset(); });
  level = diff.get();
  reset();
  gRaf(loop);
}

/* ---------------- 保龄球 ---------------- */
function bindBowling() {
  const canvas = document.getElementById('bowlCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  const W = 360, H = 400;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const LANE_L = 100, LANE_R = 260;
  const PIN_R = 6.5;
  const BALL_R = 9;
  const HEAD_Y = 96;
  const FOUL_Y = 330;
  const FRAMES = 5;

  let level = 2;
  let T3 = arcadeTheme();
  let themeAt = 0;
  let pins = [];
  let ball = null;
  let turn = 'me';
  let frame = 1;
  let roll = 1;
  let scoreMe = 0, scoreAi = 0;
  let over = false;
  let recorded = false;
  let moving = false;
  let aiTimer = 0;
  let aim = null;
  let dragStart = null;
  let raf = 0;
  let lastT = 0;
  let msg = '';
  let rollBase = 0;
  let laneGrad = null;
  let laneGradLight = null;
  const framesMe = new Array(FRAMES).fill(0);
  const framesAi = new Array(FRAMES).fill(0);

  const rack = () => {
    pins = [];
    const order = [7, 8, 9, 10, 4, 5, 6, 2, 3, 1];
    let k = 0;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        pins.push({
          x: W / 2 + (i - row / 2) * (PIN_R * 2.5),
          y: HEAD_Y + row * (PIN_R * 2.6),
          vx: 0, vy: 0, down: false, r: PIN_R,
        });
        k++;
      }
    }
  };

  const standing = () => pins.filter((p) => !p.down).length;

  const marks = (arr) => arr.map((v) => (v > 0 ? String(v) : '·')).join(' ');
  const paintStatus = () => {
    // 状态栏只留关键信息，太长会换行把球道顶下去
    statusEl.textContent = `${scoreMe} : ${scoreAi}${msg ? ' · ' + msg : ''}`;
    const meEl = document.getElementById('bbMeScore');
    const aiEl = document.getElementById('bbAiScore');
    const fEl = document.getElementById('bbFrame');
    const mMe = document.getElementById('bbMeMarks');
    const mAi = document.getElementById('bbAiMarks');
    if (meEl) meEl.textContent = String(scoreMe);
    if (aiEl) aiEl.textContent = String(scoreAi);
    if (mMe) mMe.textContent = marks(framesMe);
    if (mAi) mAi.textContent = marks(framesAi);
    if (fEl) {
      fEl.textContent = over
        ? '本局结束'
        : `第 ${Math.min(frame, FRAMES)} 帧 · ${turn === 'me' ? '你' : 'AI'} · 第 ${roll} 球`;
    }
    const meSide = document.getElementById('bbMe');
    const aiSide = document.getElementById('bbAi');
    if (meSide) meSide.classList.toggle('on', turn === 'me' && !over);
    if (aiSide) aiSide.classList.toggle('on', turn === 'ai' && !over);
  };

  const throwBall = (startX, power, spin) => {
    // 轻瞄准辅助：朝最近站瓶靠一点点，剩单瓶时也能瞄准
    const live = pins.filter((p) => !p.down);
    if (live.length) {
      let near = live[0], nd = Infinity;
      for (const p of live) { const dd = Math.abs(p.x - startX); if (dd < nd) { nd = dd; near = p; } }
      startX += Math.max(-8, Math.min(8, (near.x - startX) * 0.5));
      startX = Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, startX));
    }
    ball = { x: startX, y: FOUL_Y, vx: spin * 90, vy: -(420 + power * 380), r: BALL_R, hook: spin * 150 };
    moving = true;
    msg = '';
  };

  const aiThrow = () => {
    // 窄一半的落点误差 + 更小的旋转量：AI 打不准的问题就是这两项加了太多随机
    const err = [12, 9, 6, 3, 1.2][level - 1] || 6;
    const startX = W / 2 + (Math.random() - 0.5) * 2 * err;
    const spin = (Math.random() - 0.5) * 0.9 * ([0.45, 0.34, 0.24, 0.14, 0.06][level - 1] || 0.24);
    const power = 0.72 + Math.random() * 0.2;
    throwBall(Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, startX)), power, spin);
  };

  const endRoll = () => {
    const down = Math.max(0, (10 - standing()) - rollBase);
    rollBase = 10 - standing();
    if (turn === 'me') { scoreMe += down; framesMe[Math.min(FRAMES, frame) - 1] += down; }
    else { scoreAi += down; framesAi[Math.min(FRAMES, frame) - 1] += down; }

    const strike = down === 10 && roll === 1;
    if (!strike && roll === 1 && standing() > 0) {
      roll = 2;
      moving = false;
      ball = null;
      msg = `第一球倒了 ${down} 个`;
      paintStatus();
      if (turn === 'ai') aiTimer = 700;
    } else {
      // 换人/换帧
      if (turn === 'me') {
        turn = 'ai';
        aiTimer = 800;
      } else {
        frame += 1;
        turn = 'me';
        if (frame > FRAMES) {
          over = true;
          const win = scoreMe > scoreAi;
          const tie = scoreMe === scoreAi;
          setGameResult(tie ? `平局，${scoreMe} 比 ${scoreAi}` : win ? `你赢了，${scoreMe} 比 ${scoreAi}` : `差一点，${scoreMe} 比 ${scoreAi}`, tie ? '' : win ? 'win' : 'lose', { score: scoreMe });
          if (!recorded) {
            recorded = true;
            recordHistory('bowling', { score: scoreMe, text: `${scoreMe} : ${scoreAi}` });
          }
          paintStatus();
          return;
        }
      }
      roll = 1;
      rack();
      rollBase = 0;
      ball = null;
      moving = false;
    }
    paintStatus();
  };

  // 固定步长物理，速度只受摩擦影响，避免球在球道上前后抖
  const step = (dt) => {
    if (!ball) return;
    const ox = ball.x, oy = ball.y;
    ball.vx += ball.hook * dt;
    ball.hook *= Math.pow(0.94, dt * 60);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const damp = Math.pow(0.994, dt * 60);
    ball.vx *= damp;
    ball.vy *= damp;

    if (ball.x < LANE_L + ball.r || ball.x > LANE_R - ball.r) {
      ball.x = Math.max(LANE_L + ball.r, Math.min(LANE_R - ball.r, ball.x));
      ball.vx = 0;
      ball.hook = 0;
    }

    // 扫掠判定：按这一帧走过的线段算最近距离，球再快也不会从瓶身上穿过去
    const sx = ball.x - ox, sy = ball.y - oy;
    const len2 = sx * sx + sy * sy || 1;
    for (const p of pins) {
      if (p.down) continue;
      let tt = ((p.x - ox) * sx + (p.y - oy) * sy) / len2;
      tt = Math.max(0, Math.min(1, tt));
      const cx = ox + sx * tt, cy = oy + sy * tt;
      const dd = Math.hypot(p.x - cx, p.y - cy);
      // 多给 1.5px 容差：擦到边也算碰，不再出现"明明很正却没倒"
      if (dd < p.r + ball.r + 1.5) {
        const nx = dd ? (p.x - cx) / dd : 0;
        const ny = dd ? (p.y - cy) / dd : -1;
        const sp = Math.hypot(ball.vx, ball.vy);
        p.vx = nx * sp * 0.62;
        p.vy = ny * sp * 0.62;
        p.down = true;
        p.fall = 0;
        ball.vx *= 0.92;
        ball.vy *= 0.92;
      }
    }

    // 倒下的瓶继续滑动，撞到还站着的瓶就把动量传过去
    for (const p of pins) {
      if (!p.down) continue;
      p.fall = Math.min(1, (p.fall || 0) + dt * 5);
      if (Math.abs(p.vx) + Math.abs(p.vy) < 4) { p.vx = 0; p.vy = 0; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.92, dt * 60);
      p.vy *= Math.pow(0.92, dt * 60);
      for (const q of pins) {
        if (q === p || q.down) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < p.r + q.r) {
          q.down = true;
          q.fall = 0;
          q.vx = p.vx * 0.62;
          q.vy = p.vy * 0.62;
        }
      }
    }

    if (ball.y < HEAD_Y - 34) {
      ball = null;
      moving = false;
      endRoll();
    }
  };

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const render = () => {
    const t = performance.now();
    if (t - themeAt > 500) { themeAt = t; T3 = arcadeTheme(); }

    ctx.fillStyle = T3.light ? '#f1f4f9' : '#0a0f18';
    ctx.fillRect(0, 0, W, H);

    // 球道（渐变缓存，避免每帧重建造成肉眼可见的抖）
    if (!laneGrad || laneGradLight !== T3.light) {
      laneGradLight = T3.light;
      laneGrad = ctx.createLinearGradient(0, HEAD_Y - 60, 0, H);
      laneGrad.addColorStop(0, T3.light ? '#e8c48a' : '#8a6437');
      laneGrad.addColorStop(1, T3.light ? '#f3ddb4' : '#b98b52');
    }
    ctx.fillStyle = laneGrad;
    ctx.fillRect(LANE_L, HEAD_Y - 70, LANE_R - LANE_L, H - HEAD_Y + 70);
    // AI 的回合整条球道压一层冷色，谁的场一眼就看出来
    if (turn === 'ai') {
      ctx.fillStyle = 'rgba(90,130,200,.20)';
      ctx.fillRect(LANE_L, HEAD_Y - 70, LANE_R - LANE_L, H - HEAD_Y + 70);
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.font = gameFont(13, 700);
      ctx.textAlign = 'center';
      ctx.fillText('AI 球道', W / 2, HEAD_Y - 44);
      ctx.textAlign = 'start';
    }

    // 球道木纹
    ctx.strokeStyle = 'rgba(120,80,30,.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = LANE_L + ((LANE_R - LANE_L) / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, HEAD_Y - 70);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // 沟槽
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(LANE_L - 14, HEAD_Y - 70, 14, H - HEAD_Y + 70);
    ctx.fillRect(LANE_R, HEAD_Y - 70, 14, H - HEAD_Y + 70);

    // 犯规线
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.moveTo(LANE_L, FOUL_Y);
    ctx.lineTo(LANE_R, FOUL_Y);
    ctx.stroke();

    // 助走区压暗一点，和球道分开
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(LANE_L, FOUL_Y + 6, LANE_R - LANE_L, H - FOUL_Y - 6);
    // 球道箭头
    ctx.fillStyle = 'rgba(90,60,20,.35)';
    for (let i = -2; i <= 2; i += 1) {
      const ax = W / 2 + i * 22;
      const ay = FOUL_Y - 34 - Math.abs(i) * 12;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 6);
      ctx.lineTo(ax + 4, ay + 4);
      ctx.lineTo(ax - 4, ay + 4);
      ctx.closePath();
      ctx.fill();
    }
    // 球道两侧的边线
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath();
    ctx.moveTo(LANE_L + 1, HEAD_Y - 70); ctx.lineTo(LANE_L + 1, H);
    ctx.moveTo(LANE_R - 1, HEAD_Y - 70); ctx.lineTo(LANE_R - 1, H);
    ctx.stroke();

    for (const p of pins) {
      if (p.down) {
        const f = p.fall || 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(0.5 + f * 0.5);
        ctx.fillStyle = `rgba(200,200,200,${0.20 + 0.25 * (1 - f)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * (1.15 + 0.2 * (1 - f)), p.r * (0.75 - 0.25 * (1 - f)), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 1, p.y + 2, p.r, p.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbfbf7';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.32, p.y - p.r * 0.34, p.r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d33';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 瞄准虚线
    if (aim && turn === 'me' && !moving) {
      ctx.strokeStyle = 'rgba(37,99,235,.6)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(aim.x, FOUL_Y);
      ctx.lineTo(aim.x + aim.spin * 70, HEAD_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (ball) {
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.ellipse(ball.x + 2, ball.y + 3, ball.r, ball.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 2, ball.x, ball.y, ball.r);
      g.addColorStop(0, '#7aa2ff');
      g.addColorStop(1, '#1d3fa8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(4,10,30,.55)';
      [[-2.6, -2], [0.4, -3.2], [2.8, -1.6]].forEach(([hx, hy]) => {
        ctx.beginPath();
        ctx.arc(ball.x + hx, ball.y + hy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.arc(ball.x - ball.r * 0.34, ball.y - ball.r * 0.36, ball.r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  let acc = 0;
  const loop = (t) => {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (moving) {
      acc += dt;
      let guard = 0;
      while (acc >= 1 / 120 && guard < 10) { step(1 / 120); acc -= 1 / 120; guard += 1; }
      if (!moving) acc = 0;
    } else {
      acc = 0;
    }
    if (!over && !moving && turn === 'ai' && aiTimer > 0) {
      aiTimer -= dt * 1000;
      if (aiTimer <= 0) aiThrow();
    }
    render();
    raf = gRaf(loop);
  };

  const reset = () => {
    rack();
    turn = 'me';
    frame = 1;
    roll = 1;
    rollBase = 0;
    scoreMe = 0; scoreAi = 0;
    framesMe.fill(0); framesAi.fill(0);
    over = false;
    recorded = false;
    moving = false;
    ball = null;
    aim = null;
    aiTimer = 0;
    msg = '';
    setGameResult('', '');
    paintStatus();
  };

  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (turn !== 'me' || moving || over) return;
    dragStart = pointAt(e);
    aim = { x: Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, dragStart.x)), spin: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const p = pointAt(e);
    aim = {
      x: Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, dragStart.x)),
      spin: Math.max(-1, Math.min(1, (p.x - dragStart.x) / 90)),
    };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!dragStart) return;
    const p = pointAt(e);
    const dy = dragStart.y - p.y;
    const a = aim;
    dragStart = null;
    if (!a || dy < 20) { aim = null; return; }
    const power = Math.min(1, dy / 150);
    aim = null;
    throwBall(a.x, power, a.spin);
  });

  resetBtn && resetBtn.addEventListener('click', reset);
  const diff = initDifficulty('bowling', (n) => { level = n; reset(); });
  level = diff.get();
  reset();
  gRaf(loop);
}

/* ---------------- 快问快答 ---------------- */
function bindRush() {
  const qEl = document.getElementById('rushQ');
  const optsEl = document.getElementById('rushOpts');
  const barEl = document.getElementById('rushBar');
  const statsEl = document.getElementById('rushStats');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  if (!qEl || !optsEl) return;

  const TOTAL = [80, 70, 60, 50, 40];
  let level = 2;
  let limitMs = 60000;
  let deadline = 0;
  let score = 0, streak = 0, best = 0, right = 0, wrong = 0;
  let wrongLog = [];
  let over = false, locked = false, recorded = false, banked = false;
  let q = null, qAt = 0, raf = 0, seeded = 0;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const mathQ = () => {
    let a, b, c, ans, text;
    if (level <= 2) {
      a = rnd(6, 40); b = rnd(6, 40);
      if (Math.random() < 0.5) { ans = a + b; text = `${a} + ${b} = ?`; }
      else { if (a < b) [a, b] = [b, a]; ans = a - b; text = `${a} − ${b} = ?`; }
    } else if (level === 3) {
      a = rnd(3, 13); b = rnd(3, 13); ans = a * b; text = `${a} × ${b} = ?`;
    } else if (level === 4) {
      if (Math.random() < 0.5) {
        b = rnd(3, 9); ans = rnd(6, 18); a = b * ans; text = `${a} ÷ ${b} = ?`;
      } else {
        a = rnd(11, 26); b = rnd(3, 9); c = rnd(5, 40); ans = a * b - c; text = `${a} × ${b} − ${c} = ?`;
      }
    } else {
      const k = rnd(1, 3);
      if (k === 1) {
        a = rnd(8, 18); b = rnd(4, 12); c = rnd(3, 9); ans = (a + b) * c; text = `(${a} + ${b}) × ${c} = ?`;
      } else if (k === 2) {
        b = rnd(4, 9); ans = rnd(7, 15); a = b * ans; c = rnd(2, 8); ans *= c; text = `${a} ÷ ${b} × ${c} = ?`;
      } else {
        a = rnd(9, 19); b = rnd(6, 40); ans = a * a - b; text = `${a}² − ${b} = ?`;
      }
    }
    const set = new Set([ans]);
    while (set.size < 4) {
      const v = ans + (Math.random() < 0.5 ? -1 : 1) * rnd(1, Math.max(3, Math.round(Math.abs(ans) * 0.2) + 2));
      if (v !== ans && v >= 0) set.add(v);
    }
    return { cat: '数学', text, ans, options: shuffle([...set]) };
  };

  const bankQ = () => {
    let pool = QUIZ_BANK.filter(x => x.cat !== '数学' && x.d <= level);
    if (level >= 5) pool = QUIZ_BANK.filter(x => x.cat !== '数学' && x.d >= 4);
    if (level === 4) pool = pool.filter(x => x.d >= 3);
    if (!pool.length) pool = QUIZ_BANK.filter(x => x.cat !== '数学');
    const item = pool[rnd(0, pool.length - 1)];
    return { cat: item.cat, text: item.q, ans: item.ans, options: shuffle(item.options.slice()) };
  };

  const nextQ = () => {
    q = Math.random() < 0.5 ? mathQ() : bankQ();
    qAt = performance.now();
    locked = false;
    qEl.innerHTML = `<span class="rush-cat">${q.cat}</span>${q.text}`;
    optsEl.innerHTML = q.options.map((v, i) =>
      `<button class="rush-opt" type="button" data-i="${i}">${v}</button>`).join('');
    optsEl.querySelectorAll('.rush-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => answer(q.options[i], btn));
    });
  };

  const paintStats = () => {
    const total = right + wrong;
    const acc = total ? Math.round((right / total) * 100) : 100;
    if (statsEl) statsEl.textContent = `连击 ${streak} · 答对 ${right} · 答错 ${wrong} · 正确率 ${acc}% · 最高连击 ${best}`;
  };

  // 答对时分数从按钮上飘出来
  const floatAt = (btn, text, ok) => {
    const stage = optsEl.parentElement;
    if (!stage || !btn) return;
    const a = btn.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `rush-float ${ok ? 'up' : 'down'}`;
    el.textContent = text;
    el.style.left = `${a.left - b.left + a.width / 2}px`;
    el.style.top = `${a.top - b.top}px`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 700);
  };

  const finish = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    optsEl.innerHTML = '';
    qEl.textContent = '时间到';
    const total = right + wrong;
    const acc = total ? Math.round((right / total) * 100) : 100;
    const grade = score >= 220 ? 'S' : score >= 160 ? 'A' : score >= 100 ? 'B' : score >= 50 ? 'C' : 'D';
    let text = `评级 ${grade} · ${score} 分 · 答对 ${right} 题 · 正确率 ${acc}% · 最高连击 ${best}`;
    if (wrongLog.length) text += ` · 错题：${wrongLog.slice(0, 2).map(w => `${w.q}→${w.ans}`).join('；')}`;
    const rshCost = revivePts('rush', score);
    if (score > 0 && !banked) {
      banked = true;
      mountBank('rush', score);
    }
    setGameResult(text, score >= 120 ? 'win' : score >= 60 ? '' : 'lose', {
      score,
      noPoints: true,
      bank: score,
      ...(score >= 60 ? {} : {
      reviveLabel: `复活 · ${rshCost} 积分（+20 秒）`,
      revive: () => {
        if (!ptsSpendTotal(rshCost)) { toast('积分不够复活'); return; }
        over = false;
        locked = false;
        recorded = false;
        limitMs = Math.max(limitMs, 20000);
        deadline = performance.now() + 20000;
        setGameResult('', '');
        paintStats();
        nextQ();
        cancelAnimationFrame(raf);
        raf = gRaf(loop);
      },
      }),
    });
    if (!recorded) {
      recorded = true;
      recordHistory('rush', { score, text });
    }
    if (statusEl) statusEl.textContent = `结束 · ${score} 分`;
  };

  const answer = (value, btn) => {
    if (locked || over) return;
    locked = true;
    const ok = String(value) === String(q.ans);
    const spent = performance.now() - qAt;
    if (btn) btn.classList.add(ok ? 'correct' : 'wrong');
    if (!ok) {
      const idx = q.options.findIndex(v => String(v) === String(q.ans));
      const rightBtn = idx >= 0 ? optsEl.querySelector(`[data-i="${idx}"]`) : null;
      if (rightBtn) rightBtn.classList.add('correct');
      wrong += 1;
      wrongLog.push({ q: q.text, ans: q.ans });
      streak = 0;
      deadline -= 3000;
      floatAt(btn, '−3s', false);
    } else {
      right += 1;
      streak += 1;
      best = Math.max(best, streak);
      const gain = 10 + streak * 3 + (spent < 2200 ? 6 : spent < 4000 ? 3 : 0);
      score += gain;
      floatAt(btn, `+${gain}`, true);
    }
    optsEl.querySelectorAll('.rush-opt').forEach(el => { el.disabled = true; });
    paintStats();
    const my = ++seeded;
    setTimeout(() => {
      if (over || my !== seeded || !qEl.isConnected) return;
      nextQ();
    }, ok ? 260 : 620);
  };

  const loop = () => {
    if (!qEl.isConnected) { cancelAnimationFrame(raf); return; }
    raf = gRaf(loop);
    const now = performance.now();
    const leftMs = Math.max(0, deadline - now);
    if (barEl) {
      const pct = (leftMs / limitMs) * 100;
      barEl.style.width = `${pct}%`;
      barEl.classList.toggle('low', pct < 25);
    }
    if (statusEl) statusEl.textContent = `${Math.ceil(leftMs / 1000)} 秒 · ${score} 分`;
    if (leftMs <= 0) finish();
  };

  const start = () => {
    cancelAnimationFrame(raf);
    limitMs = (TOTAL[level - 1] || 60) * 1000;
    deadline = performance.now() + limitMs;
    score = 0; streak = 0; best = 0; right = 0; wrong = 0; wrongLog = [];
    over = false; locked = false; recorded = false; banked = false;
    seeded += 1;
    setGameResult('', '');
    paintStats();
    nextQ();
    raf = gRaf(loop);
  };

  resetBtn && resetBtn.addEventListener('click', start);
  const diff = initDifficulty('rush', (n) => { level = n; start(); });
  level = diff.get();
  start();
}

/* ---------------- 围棋（9 路） ---------------- */

/* ---------------- 蜘蛛纸牌 ---------------- */
function bindSpider() {
  const boardEl = document.getElementById('spBoard');
  if (!boardEl) return;
  const statusEl = document.getElementById('gameStatus');
  const stockEl = document.getElementById('spStock');
  const dealBtn = document.getElementById('spDeal');
  const undoBtn = document.getElementById('gameSpiderUndo');
  const resetBtn = document.getElementById('gameReset');

  const SUITS = [['♠', 0], ['♥', 1], ['♦', 1], ['♣', 0]];
  const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const SUIT_COUNT = [1, 1, 2, 4, 4];
  let level = 2;
  let cols = [], stock = [], done = 0, moves = 0, score = 0;
  let over = false, recorded = false, sel = null;
  let hist = [];

  const rankOf = (v) => RANK[v] || String(v);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const buildDeck = (n) => {
    const suits = n === 1 ? [SUITS[0]] : n === 2 ? SUITS.slice(0, 2) : SUITS;
    const copies = Math.round(8 / suits.length);
    const deck = [];
    for (const [s, red] of suits) {
      for (let c = 0; c < copies; c += 1) for (let v = 1; v <= 13; v += 1) deck.push({ s, red, v, down: true });
    }
    return shuffle(deck);
  };

  const snap = () => {
    hist.push(JSON.stringify({ cols, stock, done, moves, score }));
    if (hist.length > 50) hist.shift();
  };

  const paintStatus = () => {
    if (statusEl) statusEl.textContent = `${done}/8 组 · ${score} 分 · 走了 ${moves} 步`;
  };

  const isRun = (ci, j) => {
    const col = cols[ci];
    if (!col || j < 0 || j >= col.length) return false;
    if (col[j].down) return false;
    for (let k = j; k < col.length - 1; k += 1) {
      if (col[k].s !== col[k + 1].s || col[k].v !== col[k + 1].v + 1) return false;
    }
    return true;
  };

  const render = () => {
    const doneEl = document.getElementById('spDone');
    const movesEl = document.getElementById('spMoves');
    const scoreEl = document.getElementById('spScore');
    if (doneEl) doneEl.textContent = String(done);
    if (movesEl) movesEl.textContent = String(moves);
    if (scoreEl) scoreEl.textContent = String(score);
    boardEl.innerHTML = cols.map((col, i) => {
      const cards = col.map((c, j) => {
        const picked = sel && sel.col === i && j >= sel.from;
        const face = c.down ? 'down' : (c.red ? 'red' : 'blk');
        return `<div class="sp-card ${face}${picked ? ' sel' : ''}" data-col="${i}" data-idx="${j}">`
          + `<span class="sp-r">${c.down ? '' : rankOf(c.v)}</span><span class="sp-s">${c.down ? '' : c.s}</span></div>`;
      }).join('');
      return `<div class="sp-col${col.length ? '' : ' empty'}" data-col="${i}">${cards}</div>`;
    }).join('');
    if (stockEl) stockEl.textContent = `还能发 ${Math.floor(stock.length / 10)} 次`;
    if (dealBtn) dealBtn.disabled = over || stock.length < 10 || cols.some(c => !c.length);
    if (undoBtn) undoBtn.disabled = !hist.length;
    paintStatus();
  };

  const collect = () => {
    let got = false;
    for (let i = 0; i < cols.length; i += 1) {
      const col = cols[i];
      if (col.length < 13) continue;
      const tail = col.slice(-13);
      const suit = tail[0].s;
      let ok = true;
      for (let k = 0; k < 13; k += 1) {
        if (tail[k].down || tail[k].s !== suit || tail[k].v !== 13 - k) { ok = false; break; }
      }
      if (!ok) continue;
      col.splice(col.length - 13, 13);
      done += 1;
      score += 100;
      got = true;
      if (col.length) col[col.length - 1].down = false;
    }
    return got;
  };

  const finish = () => {
    if (over) return;
    over = true;
    saveState('spider', {});
    sel = null;
    const text = `收完 8 组 · ${score} 分 · ${moves} 步`;
    mountBank('spider', score);
    setGameResult(text, 'win', { points: Math.max(120, Math.round(score * 0.7)), noPoints: true, bank: score });
    if (!recorded) {
      recorded = true;
      recordHistory('spider', { score, text });
    }
    render();
  };

  const saveGame = () => {
    if (over) return;
    saveState('spider', { cols, stock, done, moves, score, level });
  };
  const begin = () => {
    const deck = buildDeck(SUIT_COUNT[level - 1] || 2);
    cols = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < 54; i += 1) cols[i % 10].push(deck.pop());
    cols.forEach((c) => { if (c.length) c[c.length - 1].down = false; });
    stock = deck;
    done = 0; moves = 0; score = 500; over = false; recorded = false; sel = null; hist = [];
    setGameResult('', '');
    render();
    saveGame();
  };

  const tryMove = (to) => {
    if (!sel) return;
    const from = sel.col;
    if (from === to) { sel = null; render(); return; }
    const moving = cols[from].slice(sel.from);
    const dest = cols[to];
    const top = moving[0];
    const destTop = dest.length ? dest[dest.length - 1] : null;
    if (destTop && (destTop.down || destTop.v !== top.v + 1)) {
      toast(top.v >= 13 ? 'K 只能放进空列' : `只能压在 ${rankOf(top.v + 1)} 上`);
      return;
    }
    snap();
    cols[from].splice(sel.from, moving.length);
    dest.push(...moving);
    if (cols[from].length) cols[from][cols[from].length - 1].down = false;
    moves += 1;
    score = Math.max(0, score - 1);
    sel = null;
    collect();
    render();
    if (done >= 8) finish();
  };

  boardEl.addEventListener('click', (e) => {
    if (over) return;
    const colEl = e.target.closest('.sp-col');
    if (!colEl) return;
    const ci = Number(colEl.dataset.col);
    const cardEl = e.target.closest('.sp-card');
    if (sel) {
      if (cardEl) {
        const j = Number(cardEl.dataset.idx);
        if (ci === sel.col && j >= sel.from) { sel = null; render(); return; }
      }
      tryMove(ci);
      return;
    }
    if (!cardEl) return;
    const j = Number(cardEl.dataset.idx);
    if (!isRun(ci, j)) { toast('同花顺子才能一起搬'); return; }
    sel = { col: ci, from: j };
    render();
  });

  const dealStock = () => {
    if (over || stock.length < 10) return;
    if (cols.some(c => !c.length)) { toast('先把空列填上再发牌'); return; }
    snap();
    for (let i = 0; i < 10; i += 1) {
      const c = stock.pop();
      c.down = false;
      cols[i].push(c);
    }
    moves += 1;
    collect();
    render();
    if (done >= 8) finish();
  };

  const undo = () => {
    const raw = hist.pop();
    if (!raw) return;
    try {
      const st = JSON.parse(raw);
      cols = st.cols; stock = st.stock; done = st.done; moves = st.moves; score = st.score;
    } catch (_) { return; }
    sel = null;
    over = false;
    setGameResult('', '');
    render();
  };

  if (dealBtn) dealBtn.addEventListener('click', dealStock);
  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (resetBtn) resetBtn.addEventListener('click', begin);
  const diff = initDifficulty('spider', (n) => { level = n; begin(); });
  level = diff.get();
  const savedSp = loadState('spider');
  begin();
  mountPause('spider', saveGame);
  if (savedSp && Array.isArray(savedSp.cols) && savedSp.cols.length === 10
      && savedSp.cols.some((c) => c && c.length) && !(savedSp.done >= 8)) {
    cols = savedSp.cols;
    stock = Array.isArray(savedSp.stock) ? savedSp.stock : [];
    done = savedSp.done || 0;
    moves = savedSp.moves || 0;
    score = Number(savedSp.score) || 500;
    level = Math.max(1, Math.min(5, savedSp.level || level));
    hist = [];
    over = false;
    sel = null;
    render();
    toast('已恢复上次的牌局');
  }
}

function bindGo() {
  const canvas = document.getElementById('goCanvas');
  const statusEl = document.getElementById('gameStatus');
  const resetBtn = document.getElementById('gameReset');
  const passBtn = document.getElementById('goPass');
  if (!canvas || !statusEl) return;
  const ctx = canvas.getContext('2d');
  // 星数越多棋盘越大：9 路 → 13 路 → 19 路
  const SIZE_OF = [9, 9, 13, 13, 19];
  let N = 9;
  const AI_CFG = {
    1: { noise: 7.5, cap: 8, def: 0.4 },
    2: { noise: 3.4, cap: 14, def: 1.0 },
    3: { noise: 2.0, cap: 19, def: 1.4 },
    4: { noise: 1.0, cap: 25, def: 1.9 },
    5: { noise: 0.35, cap: 33, def: 2.5 },
  };
  let level = 2;
  const cfg = () => AI_CFG[level] || AI_CFG[2];
  let board = new Array(N * N).fill(0);
  let turn = 1;            // 1 黑（你）2 白（AI）
  let over = false;
  let passes = 0;
  let koPoint = -1;
  let lastMove = -1;
  let capBlack = 0;        // 黑方提子数
  let capWhite = 0;
  let busy = false;
  let recorded = false;

  const idx = (x, y) => y * N + x;
  const neighbors = (i) => {
    const x = i % N, y = Math.floor(i / N);
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < N - 1) out.push(i + 1);
    if (y > 0) out.push(i - N);
    if (y < N - 1) out.push(i + N);
    return out;
  };
  const groupOf = (b, i) => {
    const color = b[i];
    const seen = new Set([i]);
    const stack = [i];
    const libs = new Set();
    while (stack.length) {
      const cur = stack.pop();
      for (const n of neighbors(cur)) {
        if (b[n] === 0) libs.add(n);
        else if (b[n] === color && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return { stones: [...seen], libs };
  };
  const tryPlay = (b, i, color) => {
    if (i < 0 || b[i] !== 0 || i === koPoint) return null;
    const next = b.slice();
    next[i] = color;
    const opp = color === 1 ? 2 : 1;
    const captured = [];
    for (const n of neighbors(i)) {
      if (next[n] !== opp) continue;
      const g = groupOf(next, n);
      if (!g.libs.size) {
        for (const s of g.stones) next[s] = 0;
        captured.push(...g.stones);
      }
    }
    const own = groupOf(next, i);
    if (!own.libs.size) return null; // 自杀手，禁
    const newKo = (captured.length === 1 && own.stones.length === 1 && own.libs.size === 1) ? captured[0] : -1;
    return { board: next, captured, ko: newKo };
  };
  const legalMoves = (b, color) => {
    const out = [];
    for (let i = 0; i < N * N; i += 1) {
      if (b[i] !== 0) continue;
      const r = tryPlay(b, i, color);
      if (r) out.push({ i, ...r });
    }
    return out;
  };
  const scoreArea = (b) => {
    let black = 0, white = 0;
    const seen = new Set();
    for (let i = 0; i < N * N; i += 1) {
      if (b[i] === 1) black += 1;
      else if (b[i] === 2) white += 1;
      else if (!seen.has(i)) {
        const stack = [i];
        seen.add(i);
        const region = [];
        let touchBlack = false, touchWhite = false;
        while (stack.length) {
          const cur = stack.pop();
          region.push(cur);
          for (const n of neighbors(cur)) {
            if (b[n] === 0) {
              if (!seen.has(n)) { seen.add(n); stack.push(n); }
            } else if (b[n] === 1) touchBlack = true;
            else touchWhite = true;
          }
        }
        if (touchBlack && !touchWhite) black += region.length;
        else if (touchWhite && !touchBlack) white += region.length;
      }
    }
    return { black, white };
  };

  const draw = () => {
    if (!canvas.isConnected) { window.removeEventListener('resize', draw); return; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.min(rect.width, rect.height);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    const s = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);
    const c = s / (N + 1);
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.fillStyle = dark ? '#2a2620' : '#e7c88f';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = dark ? 'rgba(235,225,205,.55)' : 'rgba(60,40,20,.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i += 1) {
      const p = c * (i + 1);
      ctx.beginPath(); ctx.moveTo(c, p); ctx.lineTo(c * N, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, c); ctx.lineTo(p, c * N); ctx.stroke();
    }
    // 星位
    ctx.fillStyle = ctx.strokeStyle;
    const edge = N >= 13 ? 3 : 2;
    const mid = (N - 1) / 2;
    const pts = N >= 13
      ? [[edge, edge], [N - 1 - edge, edge], [edge, N - 1 - edge], [N - 1 - edge, N - 1 - edge], [mid, mid],
         [edge, mid], [N - 1 - edge, mid], [mid, edge], [mid, N - 1 - edge]]
      : [[edge, edge], [N - 1 - edge, edge], [edge, N - 1 - edge], [N - 1 - edge, N - 1 - edge], [mid, mid]];
    for (const [x, y] of pts) {
      ctx.beginPath(); ctx.arc(c * (x + 1), c * (y + 1), Math.max(1.8, c * 0.09), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < N * N; i += 1) {
      if (!board[i]) continue;
      const x = c * ((i % N) + 1), y = c * (Math.floor(i / N) + 1), r = c * 0.44;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
      if (board[i] === 1) { g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#0b0b0b'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c9'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (lastMove >= 0 && board[lastMove]) {
      const x = c * ((lastMove % N) + 1), y = c * (Math.floor(lastMove / N) + 1);
      ctx.strokeStyle = board[lastMove] === 1 ? '#ff6b6b' : '#d64545';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, c * 0.16, 0, Math.PI * 2); ctx.stroke();
    }
  };

  const paint = () => {
    statusEl.textContent = over
      ? '对局结束'
      : `你执黑 · 提子 ${capBlack} / 被提 ${capWhite} · ${turn === 1 ? '轮到你' : 'AI 思考中'}`;
    draw();
  };

  const finish = (reason) => {
    over = true;
    const { black, white } = scoreArea(board);
    const text = `${reason} 黑 ${black} : 白 ${white}`;
    const type = black > white ? 'win' : black < white ? 'lose' : 'draw';
    setGameResult(text, type, { score: black });
    if (!recorded) {
      recorded = true;
      recordHistory('go', { score: black, text });
    }
    paint();
  };

  const aiMove = () => {
    if (over) return;
    let moves = legalMoves(board, 2);
    if (!moves.length) {
      passes += 1;
      if (passes >= 2) { finish('双方虚手'); return; }
      turn = 1;
      paint();
      return;
    }
    // 19 路棋盘候选太多，先随机抽一批，手机上不至于卡成PPT
    if (moves.length > 110) moves = moves.sort(() => Math.random() - 0.5).slice(0, 110);
    let best = null;
    let bestScore = -Infinity;
    for (const m of moves) {
      const c = cfg();
      let sc = m.captured.length * c.cap;
      const g = groupOf(m.board, m.i);
      sc += g.libs.size * c.def;
      if (g.libs.size === 1) sc -= 11;
      for (const n of neighbors(m.i)) {
        if (board[n] === 2) sc += 1.6;
        else if (board[n] === 0) sc += 0.5;
      }
      const x = m.i % N, y = Math.floor(m.i / N);
      const cc = (N - 1) / 2;
      sc -= (Math.abs(x - cc) + Math.abs(y - cc)) * (N >= 13 ? 0.14 : 0.22);
      sc += Math.random() * cfg().noise;
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    board = best.board;
    capWhite += best.captured.length;
    koPoint = best.ko;
    lastMove = best.i;
    passes = 0;
    turn = 1;
    paint();
  };

  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    const c = r.width / (N + 1);
    const x = Math.round((e.clientX - r.left) / c) - 1;
    const y = Math.round((e.clientY - r.top) / c) - 1;
    if (x < 0 || y < 0 || x >= N || y >= N) return -1;
    return idx(x, y);
  };

  canvas.addEventListener('click', (e) => {
    if (over || busy || turn !== 1) return;
    const i = pointAt(e);
    if (i < 0) return;
    const r = tryPlay(board, i, 1);
    if (!r) { toast('这里不能落子'); return; }
    board = r.board;
    capBlack += r.captured.length;
    koPoint = r.ko;
    lastMove = i;
    passes = 0;
    turn = 2;
    paint();
    busy = true;
    setTimeout(() => { aiMove(); busy = false; }, 240);
  });

  passBtn && passBtn.addEventListener('click', () => {
    if (over || busy) return;
    passes += 1;
    if (passes >= 2) { finish('双方虚手'); return; }
    turn = 2;
    paint();
    busy = true;
    setTimeout(() => { aiMove(); busy = false; }, 220);
  });

  const newGame = () => {
    board = new Array(N * N).fill(0);
    turn = 1; over = false; passes = 0; koPoint = -1; lastMove = -1;
    capBlack = 0; capWhite = 0; busy = false; recorded = false;
    setGameResult('', '');
    paint();
  };

  resetBtn && resetBtn.addEventListener('click', newGame);

  const diff = initDifficulty('go', (n) => {
    level = n;
    const size = SIZE_OF[n - 1] || 9;
    if (size !== N) { N = size; newGame(); }
  });
  level = diff.get();
  N = SIZE_OF[level - 1] || 9;

  window.addEventListener('resize', draw);
  newGame();
}
