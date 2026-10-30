// 学习中心前端（v0.9.5）
// 首页大块入口 → 二级页。翻译/解题/练习/场景/作文统一改成对话式：
// 底部常驻输入条（箭头发送）、消息气泡、打字机生成动画，并自动保存历史。
import { openPage, fillPage, setPageLevel, setPageTitle, setActiveNav, playPageSwitch } from './ui.js?v=150';
import { state } from './state.js?v=12';
import { renderMarkdown, thinking, linkChem } from './blocks.js?v=172';
import { renderDraw, splitDraw } from './draw.js?v=48';
import { setDrawModule } from './blocks.js?v=172';
import { annotateEnglish } from './dict.js?v=31';
import { haptic } from './haptics.js?v=12';
import { openDrill } from './drill.js?v=59';
import { openCourse, openCourseAt } from './course.js?v=37';
import { guessChapter, stageOfGrade } from './curriculum.js?v=12';
import { creditsBarHtml, bindCreditsBar, creditsAdd } from './credits.js?v=16';
if (typeof setDrawModule === 'function') setDrawModule({ renderDraw, splitDraw });

const MODES = [
  { key: 'translate', name: '翻译', desc: '整句整段，翻得像人话', ph: '这句话翻成日语——今天的风很有夏天的味道' },
  { key: 'solve', name: '解题', desc: '给步骤，几何函数自动配图', ph: '已知抛物线 y = x² − 2x − 3，求顶点坐标和与 x 轴交点' },
  { key: 'practice', name: '练习', desc: '按知识点出题，默认五道', ph: '初二一次函数，中等难度，出五道' },
  { key: 'mistake', name: '错题本', desc: '把踩过的坑存下来', ph: '二次函数配方时忘了提出系数' },
  { key: 'word', name: '生词本', desc: '生词短语，随手记', ph: 'ephemeral · adj. 短暂的' },
  { key: 'scene', name: '场景应答', desc: '选个场景，直接和对方对话', ph: '在便利店店员问我需不需要袋子' },
  { key: 'writing', name: '作文指导', desc: '审题立意，给结构和开头', ph: '题目《那一刻我长大了》，我写的是奶奶生病那天' },
];

const DICT_MODES = new Set(['word', 'mistake', 'scene', 'practice']);

function looksEnglish(text) {
  const s = String(text || '').replace(/\[\[[\s\S]*?\]\]/g, ' ');
  const latin = s.match(/[A-Za-z][A-Za-z'’\-]*/g) || [];
  if (!latin.length) return false;
  const hasArticle = latin.includes('I');
  if (latin.length < 2 && !hasArticle) return false;
  // 纯数学式里的 sin/cos/log 不是英语单词，别给它们加点线
  if (/[=^√∫∑π]/.test(s) && /\b(?:sin|cos|tan|log|ln|lim|max|min|det|sqrt)\b/i.test(s)) return false;
  const cjk = (s.match(/[\u3400-\u9fff]/g) || []).length;
  if (cjk > latin.length * 3 && !hasArticle) return false;
  return latin.some(w => w.length >= 3 || w === 'I' || w === 'a');
}

function readStudyImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') return resolve(raw);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((img.width || 1) * scale));
        c.height = Math.max(1, Math.round((img.height || 1) * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('图片读不出来'));
      img.src = raw;
    };
    reader.onerror = () => reject(new Error('图片读不出来'));
    reader.readAsDataURL(file);
  });
}

function imageButton(afterEl, onPick) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'img-btn';
  btn.setAttribute('aria-label', '发送图片');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 8.4h3.1l1.2-2.1h6.2l1.2 2.1h3.1a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5z"></path><circle cx="12" cy="13.2" r="3.35"></circle></svg>';
  btn.addEventListener('click', () => {
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 260);
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    btn.disabled = true;
    try { await onPick(await readStudyImage(file)); }
    catch (e) { alert(e.message || '图片读不出来'); }
    finally { btn.disabled = false; }
  });
  afterEl.after(btn);
  afterEl.parentElement.appendChild(input);
  return btn;
}

// 学习会话里的图片要单独存成站内 asset，不能把 dataURL 塞进 history JSON（会超长，而且退出就丢）。
async function uploadStudyImage(data) {
  if (!data) return '';
  try {
    const r = await fetch('/api/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, kind: 'img', data }),
    });
    const d = await r.json();
    return d && d.ok && d.url ? d.url : '';
  } catch (_) {
    return '';
  }
}

// 场景应答：英文走生活口语，中文走人际沟通里比较难的场面
const SCENES = {
  en: [
    { id: 'cafe', tag: '生活', title: '咖啡店点单', desc: '点一杯少糖拿铁，店员问你要不要加浓缩', role: '咖啡店店员', userRole: '顾客', opening: 'Hi! What can I get started for you today?' },
    { id: 'directions', tag: '生活', title: '街头问路', desc: '手机没电了，向路人问去地铁站怎么走', role: '路边行人', userRole: '游客', first: 'user', opening: '' },
    { id: 'return', tag: '生活', title: '商店退货', desc: '买错尺码，和店员解释想换一件', role: '服装店店员', userRole: '顾客', opening: 'Hi, how can I help you today?' },
    { id: 'pharmacy', tag: '生活', title: '药店买药', desc: '嗓子疼，向药剂师描述症状', role: '药剂师', userRole: '顾客', opening: 'Good afternoon. What seems to be the problem?' },
    { id: 'hotel', tag: '生活', title: '酒店入住', desc: '到前台办理入住，顺便问早餐时间', role: '酒店前台', userRole: '住客', opening: 'Good evening! Do you have a reservation with us?' },
    { id: 'party', tag: '生活', title: '认识新同学', desc: '在同学聚会上主动和陌生人聊天', role: '同班同学', userRole: '新同学', opening: 'Hey! I don’t think we’ve met. I’m Alex. You’re new here, right?' },
    { id: 'lost', tag: '生活', title: '机场找行李', desc: '行李没到，去服务台说明情况', role: '机场服务台', userRole: '旅客', opening: 'Hi, how can I help you? Did you lose something?' },
    { id: 'repair', tag: '生活', title: '手机维修', desc: '屏幕摔坏了，问维修价格和时间', role: '维修店店员', userRole: '顾客', opening: 'Hi! What’s going on with your phone?' },
    { id: 'restaurant', tag: '生活', title: '餐厅订位', desc: '周五晚上想订四人桌，问有没有靠窗位置', role: '餐厅接待', userRole: '顾客', opening: 'Good evening! How many people are in your party?' },
    { id: 'library', tag: '学习', title: '图书馆借书', desc: '想借一本参考书，问借期和续借规则', role: '图书馆管理员', userRole: '学生', opening: 'Hi there! Are you looking for something specific?' },
    { id: 'doctor', tag: '生活', title: '看医生', desc: '连续几天头疼，向医生描述症状和作息', role: '医生', userRole: '病人', opening: 'Come on in. What brings you here today?' },
    { id: 'interview', tag: '进阶', title: '英文面试', desc: '申请志愿者岗位，回答为什么想加入', role: '面试官', userRole: '申请者', opening: 'Thanks for coming in. Tell me a little about yourself.' },
    { id: 'smalltalk', tag: '生活', title: '电梯闲聊', desc: '和邻居同乘电梯，自然地聊两句天气和周末', role: '邻居', userRole: '你', opening: 'Morning! Some weather we’re having, huh?' },
    { id: 'complain', tag: '进阶', title: '投诉噪音', desc: '楼上深夜太吵，敲门沟通但不把关系弄僵', role: '楼上邻居', userRole: '你', opening: 'Oh, hi… is everything okay?' },
  ],
  zh: [
    { id: 'homework', tag: '进阶', title: '商量补交作业', desc: '作业没交，怎么跟老师解释并争取机会', role: '班主任', userRole: '学生', opening: '你这次作业又没交，是没写，还是遇到什么问题了？' },
    { id: 'club', tag: '进阶', title: '社团面试', desc: '面对学长的追问，说清自己为什么值得加入', role: '社团学长', userRole: '面试新生', opening: '先做个自我介绍吧，说说你为什么想加入我们。' },
    { id: 'misunderstanding', tag: '进阶', title: '化解同学误会', desc: '对方觉得你故意疏远他，你要把话说开', role: '同学', userRole: '你', opening: '你昨天为什么没叫我一起走？是不是对我有意见？' },
    { id: 'refund', tag: '进阶', title: '向店主争取退款', desc: '商品拆封了，但确实有问题，怎么谈', role: '店主', userRole: '顾客', opening: '这件商品你已经拆封了，按规定是不能退的。' },
    { id: 'seat', tag: '进阶', title: '图书馆占座冲突', desc: '位置被占，对方态度不软，怎么处理', role: '同学', userRole: '你', opening: '这个位置我一直坐着，东西还在这儿呢。' },
    { id: 'election', tag: '进阶', title: '班委竞选', desc: '被同学当面质疑，怎么回应才不心虚', role: '同班同学', userRole: '竞选者', opening: '你上来竞选班长，先说说你凭什么觉得自己能胜任？' },
    { id: 'copy', tag: '进阶', title: '拒绝抄作业', desc: '同桌一直要作业，你不想给又不想翻脸', role: '同桌', userRole: '你', opening: '作业借我抄一下，就这一次，老师不会发现的。' },
    { id: 'seatchange', tag: '进阶', title: '和老师谈换座位', desc: '想换座位，但理由要说得让老师接受', role: '老师', userRole: '学生', opening: '你想换座位？现在的座位有什么问题吗？' },
    { id: 'parents', tag: '进阶', title: '和父母谈玩手机', desc: '被说整天玩手机，想好好解释自己的安排', role: '家长', userRole: '你', opening: '你一天到晚抱着手机，作业到底写没写？' },
    { id: 'groupwork', tag: '进阶', title: '小组分工', desc: '组员一直不干活，你要把任务重新说清', role: '组员', userRole: '组长', opening: '我最近真的挺忙的，那些资料你帮我弄一下呗。' },
    { id: 'friendmoney', tag: '进阶', title: '朋友借钱', desc: '朋友开口借钱，你不想借又怕伤感情', role: '朋友', userRole: '你', opening: '最近手头有点紧，你先借我两百，下周就还。' },
    { id: 'teachercrit', tag: '进阶', title: '接受老师批评', desc: '被当众批评后，找老师说明情况并表态', role: '老师', userRole: '学生', opening: '今天课上说你那几句，你心里是不是不服气？' },
    { id: 'apology', tag: '进阶', title: '向朋友道歉', desc: '一句玩笑话说重了，想认真把歉道明白', role: '朋友', userRole: '你', opening: '你昨天那句话，我到现在还挺难受的。' },
    { id: 'stranger', tag: '生活', title: '拒绝陌生人推销', desc: '路边有人推销课程，礼貌拒绝又不纠缠', role: '推销员', userRole: '路人', opening: '同学你好，耽误你两分钟，我们这边有个免费体验课。' },
  ],
};
let sceneLang = 'en';
const CUSTOM_KEY = 'minxtok.scenes.v1';
const SCENE_RULE = {
  en: '英文场景 · 只说英文，数字和符号可以',
  zh: '中文场景 · 只说中文，数字和符号可以',
};

function loadCustomScenes() {
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(s => s && s.id && s.prompt) : [];
  } catch (_) { return []; }
}

function saveCustomScenes(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(-30))); } catch (_) {}
}

function scenesOf(lang) {
  return [...SCENES[lang], ...loadCustomScenes().filter(s => s.lang === lang)];
}

function modeOf(key) { return MODES.find(m => m.key === key) || MODES[0]; }

function sceneById(id) {
  return scenesOf('en').find(s => s.id === id) || scenesOf('zh').find(s => s.id === id) || null;
}

/* ---------- 首页 ---------- */
function homeHtml() {
  const drill = `
    <button class="study-block" data-open="drill" type="button">
      <span class="sb-name">刷题</span>
      <span class="sb-desc">按学科和年级出题，选择 · 判断 · 填空，带倒计时</span>
    </button>
    <button class="study-block" data-open="course" type="button">
      <span class="sb-name">课程</span>
      <span class="sb-desc">小学到高中按章节选课，挑一位合拍的老师给你讲</span>
    </button>`;
  const blocks = MODES.map(m => `
    <button class="study-block ${m.key === 'writing' ? 'wide' : ''}" data-open="${m.key}">
      <span class="sb-name">${m.name}</span>
      <span class="sb-desc">${m.desc}</span>
    </button>`).join('');
  return `${creditsBarHtml()}<div class="study-grid">${drill}${blocks}</div>`;
}

export function openStudy(fromBack) {
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  if (bodyEl) bodyEl.classList.remove('study-full', 'drill-page');
  // 首页已经是打开状态时（从二级页返回）只换内容 + 换按钮，不重播整页动画，否则会闪
  if (fromBack && page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(null);
    setPageTitle('学习');
    fillPage(homeHtml());
    playPageSwitch('study', 'study', -1);
    bindHome();
    return;
  }
  openPage('学习', homeHtml(), null, 'study');
  bindHome();
}

function bindHome() {
  const body = document.getElementById('pageBody');
  if (!body) return;
  body.querySelectorAll('[data-open]').forEach(b => {
    b.addEventListener('click', () => openTool(b.dataset.open));
  });
  bindCreditsBar();
}

function openTool(key) {
  if (key === 'drill') { openDrill(() => openStudy(true)); return; }
  if (key === 'course') { openCourse(() => openStudy(true)); return; }
  if (key === 'scene') { openSceneHome(); return; }
  const m = modeOf(key);
  const notebook = key === 'mistake' || key === 'word';
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  const back = () => openStudy(true);

  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(back);
    setPageTitle(m.name);
    fillPage(notebook ? notebookHtml(m) : chatHtml(m));
    playPageSwitch('study', 'study', 1);
  } else {
    openPage(m.name, notebook ? notebookHtml(m) : chatHtml(m), back, 'study');
  }

  if (bodyEl) bodyEl.classList.toggle('study-full', !notebook);
  if (notebook) bindNotebook(m);
  else bindChat(m);
}

// 从别处（刷题「详解」）跳进解题，带一段题干自动发出去；返回走调用方给的 onBack
export function openSolveDraft(text, onBack) {
  const m = modeOf('solve');
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  const back = () => {
    if (typeof onBack === 'function') onBack();
    else openStudy(true);
  };
  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(back);
    setPageTitle(m.name);
    fillPage(chatHtml(m));
    playPageSwitch('study', 'study', 1);
  } else {
    openPage(m.name, chatHtml(m), back, 'study');
  }
  if (bodyEl) bodyEl.classList.add('study-full');
  bindChat(m, { prefill: text });
}

/* ---------- 场景应答：先选场景，再进入角色对话 ---------- */
function sceneHomeHtml() {
  const cards = (list) => list.map(s => `
    <div class="scene-cell">
      <button class="study-block scene-block" data-scene="${s.id}" type="button">
        <span class="scene-tag${s.custom ? ' custom' : ''}">${s.custom ? '自定义' : s.tag}</span>
        <span class="sb-name">${esc(s.title)}</span>
        <span class="sb-desc">${esc(s.desc)}</span>
      </button>
      ${s.custom ? `<button class="scene-del" data-scene-del="${s.id}" type="button" aria-label="删除场景">×</button>` : ''}
    </div>`).join('');
  const add = (lang) => `
    <button class="study-block scene-block scene-add" data-scene-add="${lang}" type="button">
      <span class="scene-tag">自定义</span>
      <span class="sb-name">＋ 自己写一个</span>
      <span class="sb-desc">5–50 字描述情境，越具体越入戏</span>
    </button>`;
  return `
    <div class="scene-home">
      <div class="scene-switch" id="sceneSwitch" data-lang="${sceneLang}" role="tablist" aria-label="场景语言">
        <span class="scene-thumb" aria-hidden="true"></span>
        <button type="button" data-lang="en" role="tab">英文场景</button>
        <button type="button" data-lang="zh" role="tab">中文场景</button>
      </div>
      <div class="study-grid scene-grid" data-scene-panel="en" ${sceneLang === 'en' ? '' : 'hidden'}>${cards(scenesOf('en'))}${add('en')}</div>
      <div class="study-grid scene-grid" data-scene-panel="zh" ${sceneLang === 'zh' ? '' : 'hidden'}>${cards(scenesOf('zh'))}${add('zh')}</div>
      <div class="scene-sheet" id="sceneSheet" hidden>
        <div class="scene-sheet-card" role="dialog" aria-modal="true" aria-label="自定义场景">
          <h3>自定义场景</h3>
          <p>写清楚「谁、在哪、要谈什么」，比如：向室友开口，让他别再半夜打游戏。</p>
          <textarea id="scenePrompt" rows="4" maxlength="50" placeholder="5–50 字，描述你想练的情境"></textarea>
          <div class="scene-count"><span id="sceneCount">0</span>/50 · 至少 5 字</div>
          <div class="scene-sheet-err" id="sceneSheetErr"></div>
          <div class="scene-sheet-actions">
            <button class="btn ghost" id="sceneCancel" type="button">取消</button>
            <button class="btn" id="sceneSave" type="button">开始对话</button>
          </div>
        </div>
      </div>
    </div>`;
}

function openSceneHome(dir = 1) {
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  const back = () => openStudy(true);
  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(back);
    setPageTitle('场景应答');
    if (bodyEl) bodyEl.classList.remove('study-full');
    fillPage(sceneHomeHtml());
    playPageSwitch('study', 'study', dir);
  } else {
    openPage('场景应答', sceneHomeHtml(), back, 'study');
  }
  bindSceneHome();
}

function bindSceneHome() {
  const body = document.getElementById('pageBody');
  const sw = document.getElementById('sceneSwitch');
  if (!body || !sw) return;
  const apply = (lang) => {
    sceneLang = lang === 'zh' ? 'zh' : 'en';
    sw.dataset.lang = sceneLang;
    sw.querySelectorAll('button[data-lang]').forEach(b => {
      const on = b.dataset.lang === sceneLang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    body.querySelectorAll('[data-scene-panel]').forEach(p => {
      p.hidden = p.dataset.scenePanel !== sceneLang;
    });
  };
  sw.querySelectorAll('button[data-lang]').forEach(b => {
    b.addEventListener('click', () => apply(b.dataset.lang));
  });
  body.querySelectorAll('[data-scene]').forEach(b => {
    b.addEventListener('click', () => {
      const scene = sceneById(b.dataset.scene);
      if (scene) openScene(scene);
    });
  });
  // 删除自定义场景
  body.querySelectorAll('[data-scene-del]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.sceneDel;
      saveCustomScenes(loadCustomScenes().filter(s => s.id !== id));
      fillPage(sceneHomeHtml());
      bindSceneHome();
    });
  });

  // 自定义场景表单
  const sheet = document.getElementById('sceneSheet');
  const promptEl = document.getElementById('scenePrompt');
  const countEl = document.getElementById('sceneCount');
  const errEl = document.getElementById('sceneSheetErr');
  const closeSheet = () => { if (sheet) sheet.hidden = true; };
  const openSheet = (lang) => {
    if (!sheet) return;
    sheet.dataset.lang = lang;
    sheet.hidden = false;
    if (promptEl) { promptEl.value = ''; promptEl.focus(); }
    if (countEl) countEl.textContent = '0';
    if (errEl) errEl.textContent = '';
  };
  body.querySelectorAll('[data-scene-add]').forEach(b => {
    b.addEventListener('click', () => openSheet(b.dataset.sceneAdd));
  });
  if (promptEl) {
    promptEl.addEventListener('input', () => {
      if (countEl) countEl.textContent = String(Array.from(promptEl.value).length);
      if (errEl) errEl.textContent = '';
    });
  }
  const cancel = document.getElementById('sceneCancel');
  if (cancel) cancel.addEventListener('click', closeSheet);
  if (sheet) sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  const save = document.getElementById('sceneSave');
  if (save) {
    save.addEventListener('click', () => {
      const prompt = String(promptEl ? promptEl.value : '').replace(/\s+/g, ' ').trim();
      const len = Array.from(prompt).length;
      if (len < 5) { if (errEl) errEl.textContent = '再多写几个字，至少 5 字。'; return; }
      if (len > 50) { if (errEl) errEl.textContent = '太长啦，压到 50 字以内。'; return; }
      const lang = sheet && sheet.dataset.lang === 'zh' ? 'zh' : 'en';
      const scene = {
        id: `c${Date.now().toString(36)}`,
        lang,
        custom: true,
        tag: '自定义',
        title: prompt.slice(0, 16),
        desc: prompt,
        prompt,
        role: lang === 'zh' ? '对方' : 'the other person',
        userRole: lang === 'zh' ? '你' : 'you',
        first: 'user',
        opening: '',
      };
      const list = loadCustomScenes();
      list.push(scene);
      saveCustomScenes(list);
      closeSheet();
      sceneLang = lang;
      fillPage(sceneHomeHtml());
      bindSceneHome();
      openScene(scene);
    });
  }
  apply(sceneLang);
}

function sceneChatHtml(scene) {
  const sub = esc(scene.title);
  return `
    <div class="study-wrap" data-mode="scene">
      <div class="study-top">
        <span class="study-top-desc">${sub}</span>
        <span class="study-top-actions">
          <button class="study-hist-btn" id="studyHist" type="button">历史</button>
        </span>
      </div>
      <div class="study-msgs" id="studyMsgs"></div>
      <div class="composer study-composer">
        <div class="bar">
          <div class="row">
          <textarea id="studyInput" rows="1" placeholder="${scene.lang === 'zh' ? '直接说，我来接' : 'Type in English…'}"></textarea>
          </div>
          <button class="send" id="studyGo" aria-label="发送" type="button">
            <svg class="ico-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5.5"></path>
              <path d="M6.8 11.2c1.8-1.7 3.5-3.4 5.2-5.2 1.7 1.8 3.4 3.5 5.2 5.2"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
}

function openScene(scene) {
  const page = document.getElementById('page');
  const bodyEl = document.getElementById('pageBody');
  // 自定义场景自带 lang；以前只按内置列表判断，自定义英文场景会被判成中文，
  // 于是模型全程说中文。
  const isEn = SCENES.en.some(x => x.id === scene.id);
  const isZh = SCENES.zh.some(x => x.id === scene.id);
  const lang = scene.lang === 'en' || scene.lang === 'zh' ? scene.lang : (isZh ? 'zh' : 'en');
  const s = Object.assign({}, scene, { lang });
  const back = () => openSceneHome(-1);
  if (page && page.classList.contains('show')) {
    setActiveNav('study');
    setPageLevel(back);
    setPageTitle(s.title);
    if (bodyEl) bodyEl.classList.add('study-full');
    fillPage(sceneChatHtml(s));
    playPageSwitch('study', 'study', 1);
  } else {
    openPage(s.title, sceneChatHtml(s), back, 'study');
    if (bodyEl) bodyEl.classList.add('study-full');
  }
  bindChat(modeOf('scene'), { scene: s });
}

/* ---------- 对话式工具页 ---------- */
function chatHtml(m) {
  return `
    <div class="study-wrap" data-mode="${m.key}">
      <div class="study-top">
        <span class="study-top-desc">${m.desc}</span>
        <button class="study-hist-btn" id="studyHist" type="button">历史</button>
      </div>
      <div class="study-msgs" id="studyMsgs"></div>
      <div class="composer study-composer">
        <div class="bar">
          <div class="row">
            <textarea id="studyInput" rows="1" placeholder="有不懂的随时问"></textarea>
          </div>
          <button class="send" id="studyGo" aria-label="发送" type="button">
            <svg class="ico-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5.5"></path>
              <path d="M6.8 11.2c1.8-1.7 3.5-3.4 5.2-5.2 1.7 1.8 3.4 3.5 5.2 5.2"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
}

function newSessionId() {
  return `ss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function mountDrawCard(body, node) {
  const slot = document.createElement('div');
  slot.className = 'draw-slot';
  slot.appendChild(node);
  body.appendChild(slot);
  // 先让 0fr 真正落一帧，再展开到内容高度，卡片才不会硬跳
  requestAnimationFrame(() => requestAnimationFrame(() => slot.classList.add('in')));
}

function bindChat(m, opts = {}) {
  const msgs = document.getElementById('studyMsgs');
  const input = document.getElementById('studyInput');
  const go = document.getElementById('studyGo');
  const hist = document.getElementById('studyHist');
  if (!msgs || !input || !go) return;

  const chat = {
    mode: m.key,
    scene: opts.scene || null,
    sessionId: newSessionId(),
    turns: [],          // [{ q, a }]
    busy: false,
    intro: true,
  };
  const allowDict = DICT_MODES.has(chat.mode);
  msgs._chat = chat;

  const scrollBottom = (smooth) => {
    try {
      msgs.scrollTo({ top: msgs.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    } catch (_) { msgs.scrollTop = msgs.scrollHeight; }
  };

  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, Math.max(24, input.scrollHeight))}px`;
  };

  // 场景应答的语言熔断：英文场景只收英文/数字/符号，中文场景只收中文/数字/符号
  const sceneLangKey = chat.scene ? (chat.scene.lang === 'zh' ? 'zh' : 'en') : '';
  const sceneRule = document.getElementById('sceneRule');
  let ruleTimer = 0;
  const blockRe = sceneLangKey === 'zh'
    ? /[A-Za-zＡ-Ｚａ-ｚ]/g
    : /[^\x20-\x7E\n\u00C0-\u024F\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/g;
  const cleanSceneText = (v) => (sceneLangKey ? String(v || '').replace(blockRe, '') : String(v || ''));
  let composing = false;
  const flashRule = () => {
    if (!sceneRule) return;
    sceneRule.classList.add('warn');
    sceneRule.textContent = sceneLangKey === 'en'
      ? '这里只能打英文、数字和符号，中文对方听不懂。'
      : '这里只能打中文、数字和符号，英文对方听不懂。';
    clearTimeout(ruleTimer);
    ruleTimer = setTimeout(() => {
      sceneRule.classList.remove('warn');
      sceneRule.textContent = SCENE_RULE[sceneLangKey || 'en'];
    }, 1800);
  };

  const addIntro = () => {
    if (chat.turns.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant m-fade-up study-intro';
    const body = document.createElement('div');
    body.className = 'body';
    const bubble = document.createElement('div');
    bubble.className = 'text';
    if (chat.scene) {
      // 问路、点单这类场景本来就该用户先开口，别让 AI 抢话
      if (chat.scene.first === 'user' || !chat.scene.opening) {
        bubble.innerHTML = `<p class="study-intro-hint">这次你先开口。${chat.scene.lang === 'zh' ? '想说什么就直接发。' : 'Try starting the conversation in English.'}</p>`;
      } else {
        bubble.innerHTML = `<p>${esc(chat.scene.opening)}</p>`;
      }
    } else {
      bubble.innerHTML = `<p>${esc(m.desc)}</p><p class="study-intro-hint">直接把问题发给我。比如：${esc(m.ph)}</p>`;
    }
    body.appendChild(bubble);
    wrap.appendChild(body);
    msgs.appendChild(wrap);
    if (allowDict && looksEnglish(bubble.textContent || '')) annotateEnglish(wrap);
  };

  const addUser = (text, image) => {
    const wrap = document.createElement('div');
    wrap.className = 'msg user m-fade-up';
    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (image ? ' has-media' : '');
    if (image) {
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = image;
      img.alt = '';
      bubble.appendChild(img);
    }
    if (text) {
      const p = document.createElement('div');
      p.textContent = text;
      bubble.appendChild(p);
    }
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    if (allowDict && text && looksEnglish(text)) annotateEnglish(wrap);
  };

  const addAssistantShell = () => {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant m-fade-up';
    const body = document.createElement('div');
    body.className = 'body';
    const dots = thinking();
    body.appendChild(dots);
    wrap.appendChild(body);
    msgs.appendChild(wrap);
    return { wrap, body, dots, skel: null };
  };

  const drawSkeleton = () => {
    const sk = document.createElement('div');
    sk.className = 'draw-skel';
    sk.innerHTML = '<div class="m-skeleton ds-svg"></div><div class="m-skeleton ds-cap"></div>';
    return sk;
  };

  const appendDraw = (body, node) => {
    mountDrawCard(body, node);
  };

  // 流式安全：未闭合的 [[math:]]/[[chem:]]/[[draw:]] 和代码块先藏起来
  const liveSafe = (t) => {
    let x = String(t || '');
    // 已经写完的画图块先摘掉（图会单独挂卡片），它后面的文字要继续流出来
    x = x.replace(/\[\[draw:[\s\S]*?\]\]/g, '');
    // 公式没闭合就补右括号，别让半截公式把后面全卡住
    x = x.replace(/\[\[(math|chem):([\s\S]*)$/, (m, k, b) => (b.includes(']]') ? m : `[[${k}:${b}]]`));
    // 只有还没写完的画图 JSON 才需要藏
    x = x.replace(/\[\[draw:[\s\S]*$/, '');
    x = x.replace(/```[\s\S]*$/, '');
    return x;
  };

  // 生成动画：气泡里逐段吐字，收尾时把画图 JSON 拆成真正的图。
  // 图和文字必须按原顺序交错排：脚本夹在两段文字中间时，图就该出现在两段之间，
  // 不能统一挪到最底下（旧实现只挂第一张图，后面的图直接丢了）。
  const renderFinal = (shell, full, bubble) => {
    const parts = splitDraw(full);
    if (!parts.some(p => p.kind === 'draw')) {
      bubble.innerHTML = renderMarkdown(full);
      if (allowDict && looksEnglish(full)) annotateEnglish(shell.body);
      return;
    }
    // 清掉流式阶段临时挂上的图，回头按 parts 顺序重排，避免重复
    shell.body.querySelectorAll('.draw-slot').forEach(n => n.remove());
    shell.drawMounted = false;

    const nodes = [];
    let buf = '';
    const flushText = () => {
      const t = buf.trim();
      buf = '';
      if (!t) return;
      const d = document.createElement('div');
      d.className = 'text';
      try { d.innerHTML = renderMarkdown(t); } catch (_) { d.textContent = t; }
      nodes.push(d);
    };
    for (const part of parts) {
      if (part.kind !== 'draw') { buf += String(part.value || ''); continue; }
      flushText();
      try {
        const node = renderDraw(part.value);
        const svg = node.querySelector('svg');
        if (svg && svg.childElementCount) {
          const slot = document.createElement('div');
          slot.className = 'draw-slot';
          slot.appendChild(node);
          nodes.push(slot);
        }
      } catch (_) { /* 画图失败不影响文字 */ }
    }
    flushText();
    if (!nodes.length) { bubble.innerHTML = renderMarkdown(full); return; }

    bubble.replaceWith(nodes[0]);
    let anchor = nodes[0];
    for (let i = 1; i < nodes.length; i++) {
      anchor.after(nodes[i]);
      anchor = nodes[i];
    }
    // 卡片展开动画统一补一帧，避免和文字重排抢同一帧
    requestAnimationFrame(() => requestAnimationFrame(() => {
      shell.body.querySelectorAll('.draw-slot').forEach(n => n.classList.add('in'));
    }));
    if (allowDict && looksEnglish(full)) annotateEnglish(shell.body);
  };

  const reveal = (shell, answer) => {
    const full = String(answer || '');

    const bubble = document.createElement('div');
    bubble.className = 'text';
    shell.body.appendChild(bubble);
    if (shell.dots.isConnected) shell.dots.remove();
    if (shell.skel && shell.skel.isConnected) shell.skel.remove();

    let i = 0;
    // 图不再提前挂骨架：先把文字完整落完，finish() 里同步渲染 SVG 挂到正文后面。
    // （原来一开始就摆一块灰骨架，用户会看到「字还在打、骨架卡已经杵在那儿」）
    const skel = null;
    const step = Math.max(2, Math.min(36, Math.ceil(full.length / 170)));
    const tick = () => {
      i = Math.min(full.length, i + step);
      try {
        bubble.innerHTML = renderMarkdown(liveSafe(full.slice(0, i)));
      } catch (_) {
        bubble.textContent = liveSafe(full.slice(0, i));
      }
      scrollBottom();
      if (i < full.length) requestAnimationFrame(tick);
      else finish();
    };

    const finish = () => {
      if (skel) skel.remove();
      renderFinal(shell, full, bubble);
    };

    tick();
  };

  // 流式：边收边渲染；网络或上游不给流时退回一次性接口
  const streamInto = async (shell, payload) => {
    const r = await fetch('/api/study/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || '没生成出来');
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    const bubble = document.createElement('div');
    bubble.className = 'text';
    shell.body.appendChild(bubble);
    if (shell.dots.isConnected) shell.dots.remove();
    let buf = '';
    let ans = '';
    let raf = 0;
    const paint = () => {
      const safe = liveSafe(ans);
      try { bubble.innerHTML = renderMarkdown(safe); } catch (_) { bubble.textContent = safe; }
      maybeMountDraw();
      scrollBottom();
    };
    const maybeMountDraw = () => {
      if (shell.drawMounted) return;
      let parts = [];
      try { parts = splitDraw(ans); } catch (_) { return; }
      const part = parts.find(p => p.kind === 'draw');
      if (!part) return;
      try {
        const node = renderDraw(part.value);
        const svg = node.querySelector('svg');
        if (svg && svg.childElementCount) {
          mountDrawCard(shell.body, node);
          shell.drawMounted = true;
        }
      } catch (_) { /* 画图失败不影响文字 */ }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      let got = false;
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
          if (delta) { ans += delta; got = true; }
        } catch (_) { /* 心跳行忽略 */ }
      }
      if (got) {
        if (shell.skel && shell.skel.isConnected) shell.skel.remove();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(paint);
      }
    }
    if (!ans.trim()) throw new Error('没生成出来，再试一次');
    renderFinal(shell, ans, bubble);
    return ans;
  };

  /* ---------- 场景结算：说再见/谢谢或手动点结束时，回头复盘这一轮 ---------- */
  const FAREWELL_RE = /(bye|good\s*bye|see\s+you|see\s+ya|thanks|thank\s+you|that'?s all|i'?m done|再见|拜拜|谢谢|谢了|就到这|先这样|结束吧)/i;
  const swRow = (from, to, why) => `<div class="sw-row"><div class="sw-from">${esc(from)}</div><div class="sw-to">${esc(to)}</div>${why ? `<div class="sw-why">${esc(why)}</div>` : ''}</div>`;
  const paintWrap = (card, sum) => {
    const sec = (title, html) => (html ? `<div class="sw-sec"><h4>${title}</h4>${html}</div>` : '');
    card.classList.remove('loading');
    card.innerHTML = `
      <div class="sw-head"><b>本轮结算</b><span class="sw-score">${Number(sum.score) || 0}<i>分</i></span></div>
      <div class="sw-credits">+${Number(sum.credits) || 0} 学分 · 说了 ${Number(sum.userTurns) || 0} 句</div>
      ${sec('说到的句子', sum.used && sum.used.length ? `<ul>${sum.used.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
      ${sec('更地道的说法', (sum.better || []).map(x => swRow(x.from, x.to, x.why)).join(''))}
      ${sec('语法提醒', (sum.grammar || []).map(x => swRow(x.from, x.to, x.why)).join(''))}
      ${sum.tip ? `<div class="sw-tip">${esc(sum.tip)}</div>` : ''}`;
    try { creditsAdd(Number(sum.credits) || 0, '场景练习'); } catch (_) {}
  };

  const requestWrap = async (shell) => {
    if (chat.wrapped || chat.wrapping) return;
    chat.wrapping = true;
    chat.wrapped = true;
    const card = document.createElement('div');
    card.className = 'scene-wrap loading';
    card.innerHTML = '<div class="sw-head"><b>本轮结算</b><span class="sw-dots"><i></i><i></i><i></i></span></div><div class="sw-credits">正在复盘这一轮…</div>';
    shell.body.appendChild(card);
    scrollBottom();
    try {
      const r = await fetch('/api/study/scene/wrap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, scene: chat.scene || undefined, turns: chat.turns.slice(-12) }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || '结算没出来');
      paintWrap(card, d.summary || {});
    } catch (e) {
      card.classList.remove('loading');
      card.innerHTML = `<div class="sw-head"><b>本轮结算</b></div><div class="sw-credits">${esc(e.message || '结算没出来')}</div>`;
      chat.wrapped = false;
    } finally {
      chat.wrapping = false;
      scrollBottom();
    }
  };

  const endChip = (shell) => {
    if (chat.wrapped) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'scene-end-chip';
    chip.textContent = '结束这一轮 · 看结算';
    chip.addEventListener('click', () => { chip.remove(); requestWrap(shell); });
    shell.body.appendChild(chip);
    scrollBottom();
  };

  const saveSession = () => {
    if (!chat.turns.length) return;
    const title = chat.scene
      ? `${chat.scene.title} · ${String(chat.turns[0].q || '').slice(0, 42)}`
      : String(chat.turns[0].q || '').slice(0, 60);
    fetch('/api/study/session/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: state.uid, id: chat.sessionId, mode: chat.mode,
        title, messages: chat.turns.slice(-40),
      }),
    }).catch(() => {});
  };

  const ask = async (text, image) => {
    let q = String(text || '').trim();
    if (sceneLangKey && q) {
      const cleaned = cleanSceneText(q);
      if (!cleaned.trim()) { flashRule(); return; }
      q = cleaned;
    }
    if ((!q && !image) || chat.busy) return;
    chat.busy = true;
    go.disabled = true;
    input.value = '';
    autoGrow();
    if (chat.intro) {
      chat.intro = false;
      // 场景对话的开场白是对方说的第一句话，不能随着用户发送被删掉
      if (!chat.scene) {
        const intro = msgs.querySelector('.study-intro');
        if (intro) intro.remove();
      }
    }

    addUser(q, image);
    const historyImage = image ? await uploadStudyImage(image) : '';
    const shell = addAssistantShell();
    scrollBottom();

    const history = chat.turns.slice(-6);
    const payload = {
      uid: state.uid, mode: chat.mode, text: q, image: image || undefined,
      scene: chat.scene || undefined,
      followup: history.length > 0, history,
    };
    let streamed = false;
    try {
      // 回到整段生成：先拿到完整答案再统一排版，公式和画图不会边流边跳
      const r = await fetch('/api/study', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || '没生成出来');
      const answer = String(d.answer || '');
      if (!answer.trim()) throw new Error('这次没生成出来，再试一次');
      reveal(shell, answer);
      chat.turns.push({
        q: q || '[图片]',
        a: String(answer || '').slice(0, 4000),
        ...(historyImage ? { image: historyImage } : {}),
      });
      saveSession();
      // 场景应答：说再见/谢谢就自动结算，聊了两轮以上也给个手动结束的入口
      if (chat.scene && chat.turns.length >= 2) {
        const bye = FAREWELL_RE.test(q) || FAREWELL_RE.test(String(answer).slice(0, 400));
        if (bye) requestWrap(shell);
        else endChip(shell);
      }
    } catch (e) {
      if (shell.dots.isConnected) shell.dots.remove();
      if (shell.skel && shell.skel.isConnected) shell.skel.remove();
      // 一次性接口偶尔整段超时（难题解析太长），退到流式再要一次，别让这一问白白消失
      if (!streamed && !(e && e.studyStreamTried)) {
        streamed = true;
        try {
          const ans = await streamInto(shell, payload);
          if (ans && String(ans).trim()) {
            chat.turns.push({ q: q || '[图片]', a: String(ans).slice(0, 4000), ...(historyImage ? { image: historyImage } : {}) });
            saveSession();
            if (chat.scene && chat.turns.length >= 2) {
              const bye = FAREWELL_RE.test(q) || FAREWELL_RE.test(String(ans).slice(0, 400));
              if (bye) requestWrap(shell); else endChip(shell);
            }
            return;
          }
        } catch (_) { /* 流式也不行，走下面的错误提示 */ }
      }
      const err = document.createElement('div');
      err.className = 'text study-err';
      const msg = document.createElement('div');
      msg.style.color = 'var(--danger)';
      msg.textContent = (e && e.message) || '没生成出来，再试一次';
      err.appendChild(msg);
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'scene-end-chip';
      again.style.marginTop = '8px';
      again.textContent = '重试这一次';
      again.addEventListener('click', () => { again.disabled = true; ask(q, image); });
      err.appendChild(again);
      shell.body.appendChild(err);
    } finally {
      chat.busy = false;
      go.disabled = false;
      scrollBottom();
    }
  };

  go.addEventListener('click', () => ask(input.value));
  if (chat.mode !== 'scene') imageButton(input, (image) => {
    if (chat.busy) return;
    const text = input.value.trim();
    input.value = '';
    autoGrow();
    ask(text, image);
  });
  input.addEventListener('focus', autoGrow);
  // 学习中心的输入框同样支持长按说话（app.js 会把实现挂到 window 上）
  try { if (window.attachVoiceHold) window.attachVoiceHold(input); } catch (_) {}
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    input.dispatchEvent(new Event('input'));
  });
  input.addEventListener('input', () => {
    if (sceneLangKey && !composing) {
      const raw = input.value;
      const clean = cleanSceneText(raw);
      if (clean !== raw) {
        input.value = clean;
        try { input.setSelectionRange(clean.length, clean.length); } catch (_) {}
        haptic(4);
        flashRule();
      }
    }
    autoGrow();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(input.value); }
  });
  if (hist) hist.addEventListener('click', () => openHistory(m, chat, msgs, addUser, scrollBottom));

  // 进入时给一个引导气泡
  addIntro();
  scrollBottom();

  // 从刷题「详解」跳过来：输入框先逐字填满（填充动画），再自动发出去
  if (opts && opts.prefill) {
    const text = String(opts.prefill);
    input.value = '';
    autoGrow();
    let k = 0;
    const stepChars = Math.max(3, Math.round(text.length / 22));
    const tick = () => {
      k = Math.min(text.length, k + stepChars);
      input.value = text.slice(0, k);
      autoGrow();
      scrollBottom();
      if (k < text.length) setTimeout(tick, 16);
      else setTimeout(() => { ask(text); }, 220);
    };
    setTimeout(tick, 320);
  }
}

// 把一条完整回答渲染进容器：文字走气泡，画图 JSON 直接出 SVG（历史回放也用它）
function fillAnswerBody(body, answer, allowDict = false) {
  const parts = splitDraw(String(answer || ''));
  if (!parts.some(p => p.kind === 'draw')) {
    const txt = document.createElement('div');
    txt.className = 'text';
    txt.innerHTML = renderMarkdown(String(answer || ''));
    body.appendChild(txt);
    if (allowDict && looksEnglish(answer)) annotateEnglish(body);
    return;
  }
  let textBuf = '';
  const flushText = () => {
    if (!textBuf.trim()) { textBuf = ''; return; }
    const txt = document.createElement('div');
    txt.className = 'text';
    txt.innerHTML = renderMarkdown(textBuf);
    body.appendChild(txt);
    textBuf = '';
  };
  for (const part of parts) {
    if (part.kind === 'draw') {
      flushText();
      try {
        const node = renderDraw(part.value);
        const svg = node.querySelector('svg');
        if (svg && svg.childElementCount) mountDrawCard(body, node);
        else {
          const fb = document.createElement('div');
          fb.className = 'draw-fallback';
          fb.textContent = '这张图没画出来，换个问法我再试一次。';
          body.appendChild(fb);
        }
      } catch (_) { /* 单张图失败不影响整段历史 */ }
    } else {
      textBuf += String(part.value || '');
    }
  }
  flushText();
  if (allowDict && looksEnglish(answer)) annotateEnglish(body);
}

/* ---------- 历史：近满屏底部抽屉 ---------- */
function histCardHtml(it, i) {
  const when = new Date(it.created_at).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `<div class="study-hist-card" role="button" tabindex="0" data-hist-id="${esc(it.id)}" style="--i:${Math.min(i, 8)}">
    <span class="study-hist-summary">${esc(it.summary || it.title || '未命名对话')}</span>
    <span class="study-hist-meta"><span>${when}</span><span>点开继续</span></span>
    <span class="study-hist-arrow" aria-hidden="true">›</span>
    <button class="study-hist-del" type="button" data-del-hist="${esc(it.id)}">删掉</button>
  </div>`;
}

function openHistory(m, chat, msgs, addUser, scrollBottom) {
  document.querySelectorAll('.study-hist-sheet').forEach(x => x.remove());
  const skel = Array.from({ length: 4 }, (_, i) => `<div class="study-hist-skel" style="--i:${i}"></div>`).join('');
  const wrap = document.createElement('div');
  wrap.className = 'study-hist-sheet';
  wrap.innerHTML = `
    <div class="study-hist-backdrop" data-hist-close></div>
    <section class="study-hist-panel" role="dialog" aria-modal="true" aria-label="${esc(m.name)}历史">
      <div class="study-hist-grab" aria-hidden="true"></div>
      <div class="study-hist-head">
        <div class="study-hist-heading">
          <span class="study-hist-kicker">HISTORY</span>
          <h2>${esc(m.name)}</h2>
          <p id="studyHistMeta">正在翻旧对话</p>
        </div>
        <button class="study-hist-new" id="studyHistNew" type="button">新对话</button>
      </div>
      <div class="study-hist-scroll" id="studyHistList">${skel}</div>
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('study-hist-open');

  const panel = wrap.querySelector('.study-hist-panel');
  const meta = wrap.querySelector('#studyHistMeta');
  const list = wrap.querySelector('#studyHistList');
  let closed = false;
  let drag = null;
  let switching = false;
  const close = (after) => {
    if (closed) return;
    closed = true;
    panel.style.transition = '';
    panel.style.transform = '';
    wrap.classList.remove('open');
    wrap.classList.add('closing');
    document.body.classList.remove('study-hist-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    haptic(5);
    setTimeout(() => {
      wrap.remove();
      if (after) after();
    }, 340);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const endDrag = () => {
    if (!drag) return;
    const dy = drag.dy;
    const speed = dy / Math.max(1, performance.now() - drag.start);
    drag = null;
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    panel.style.transition = '';
    if (dy > 88 || (dy > 22 && speed > 0.55)) {
      close();
    } else {
      panel.style.transform = '';
    }
  };
  const moveDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = Math.max(0, e.clientY - drag.y);
    drag.dy = dy;
    const pull = Math.min(dy, 260);
    panel.style.transform = `translate3d(0, ${pull}px, 0)`;
    if (dy > 6) e.preventDefault();
  };
  const startDrag = (e) => {
    if (closed || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest('button')) return;
    drag = { y: e.clientY, start: performance.now(), dy: 0, id: e.pointerId };
    panel.style.transition = 'none';
    window.addEventListener('pointermove', moveDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };
  [panel.querySelector('.study-hist-grab'), panel.querySelector('.study-hist-head')].forEach(el => {
    if (el) el.addEventListener('pointerdown', startDrag);
  });
  wrap.querySelector('[data-hist-close]').addEventListener('click', () => close());
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.classList.add('open');
    haptic(7);
  }));

  const restore = async (id) => {
    try {
      const r = await fetch(`/api/study/session/get?uid=${encodeURIComponent(state.uid)}&id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!d.ok) throw new Error();
      msgs.innerHTML = '';
      chat.turns = Array.isArray(d.messages) ? d.messages : [];
      chat.sessionId = d.id;
      chat.intro = false;
      for (const turn of chat.turns) {
        addUser(turn.q, turn.image);
        const w = document.createElement('div');
        w.className = 'msg assistant';
        const b = document.createElement('div');
        b.className = 'body';
        fillAnswerBody(b, String(turn.a || ''), DICT_MODES.has(chat.mode));
        w.appendChild(b);
        msgs.appendChild(w);
      }
      msgs.classList.remove('study-msgs-swap');
      void msgs.offsetWidth;
      msgs.classList.add('study-msgs-swap');
      msgs.addEventListener('animationend', () => msgs.classList.remove('study-msgs-swap'), { once: true });
      scrollBottom();
    } catch (_) {
      alert('这条历史读不出来');
    }
  };

  const load = async () => {
    if (!list) return;
    try {
      const r = await fetch(`/api/study/session/list?uid=${encodeURIComponent(state.uid)}&mode=${encodeURIComponent(m.key)}`);
      const d = await r.json();
      const items = d.items || [];
      if (meta) meta.textContent = items.length ? `${items.length} 段对话` : '还没有历史对话';
      if (!items.length) {
        list.innerHTML = '<div class="study-hist-empty">这里还空着。<br>问过的问题，会一段段留在这里。</div>';
        return;
      }
      list.innerHTML = items.map(histCardHtml).join('');
      list.querySelectorAll('.study-hist-card').forEach(card => {
        const pick = () => {
          if (switching) return;
          switching = true;
          const id = card.dataset.histId;
          card.classList.add('picked');
          haptic(8);
          close(() => restore(id));
        };
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-del-hist]')) return;
          pick();
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
      });
      list.querySelectorAll('[data-del-hist]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.delHist;
          btn.disabled = true;
          haptic(6);
          await fetch('/api/study/session/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: state.uid, id }),
          });
          const card = btn.closest('.study-hist-card');
          if (card) {
            card.classList.add('removing');
            setTimeout(load, 180);
          } else {
            load();
          }
        });
      });
    } catch (_) {
      list.innerHTML = '<div class="study-hist-empty">读不到历史，检查一下网络。</div>';
    }
  };

  const newBtn = wrap.querySelector('#studyHistNew');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      haptic(8);
      close(() => {
        chat.sessionId = newSessionId();
        chat.turns = [];
        chat.intro = true;
        msgs.innerHTML = '';
        openTool(m.key);
      });
    });
  }

  // 点抽屉外的空白处降下
  panel.addEventListener('click', (e) => e.stopPropagation());
  load();
}

/* ---------- 错题本 / 生词本（AI 版） ---------- */
function notebookHtml(m) {
  const isWord = m.key === 'word';
  const ph = isWord
    ? '输入单词或短语，多个用逗号隔开；也可以贴原句，让 AI 按语境解释'
    : '把错题、你的答案、正确答案写在这里，越全分析越准';
  const btn = isWord ? 'AI 解析并存入生词本' : 'AI 分析并存入错题本';
  return `
    <div class="group">
      <div class="panel">
        <div class="row nb-row">
          <textarea class="input study-area nb-area" id="studyText" placeholder="${ph}"></textarea>
          <button class="btn" id="studySave" style="width:100%">${btn}</button>
        </div>
      </div>
      <div id="studyAI" class="study-ai"></div>
      <div class="study-hist-head">历史记录</div>
      <div id="studyList" class="study-list"><div class="study-empty">加载中…</div></div>
    </div>`;
}

// 错题本/生词本 → 课程：按内容猜章节，猜不到就落到同学科的选课页
function jumpToCourse(item, isWord) {
  const text = [item && item.title, item && item.note, item && item.content].filter(Boolean).join(' ');
  let g = null;
  try { g = guessChapter(text, isWord ? { subject: '英语' } : {}); } catch (_) {}
  try { haptic(8); } catch (_) {}
  if (g && g.chapter) {
    openCourseAt({ stage: g.stage, grade: g.grade, subject: g.subject, book: g.book, chapter: g.chapter, action: 'start' });
  } else {
    openCourseAt({ subject: isWord ? '英语' : undefined });
  }
}

// 存进来的内容可能是 $...$、\(...\)、或者裸的 \mathrm{...}，统一换成 [[math:]] 再排
function toMathTags(t) {
  let s = String(t == null ? '' : t);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, g) => `[[math:${g}]]`);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, g) => `[[math:${g}]]`);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, g) => `[[math:${g}]]`);
  s = s.replace(/\$([^$\n]+?)\$/g, (m, g) => `[[math:${g}]]`);
  s = s.replace(/\\(mathrm|text|textrm|mathbf|mathit|mathsf|mathtt|operatorname|frac|sqrt|vec|overline)\s*(\{[^{}]*\}(?:\s*[_^]\{?[^{}\s]*\}?)*)/g,
    (m, cmd, body) => `[[math:\\${cmd}${body}]]`);
  return s;
}

// 卡片标题只放一行纯文本：把 $...$、\(...\)、\frac{}{} 这些还原成能读的样子，
// 免得从刷题收进来的错题在标题里裸奔成一串公式代码
function plainLatex(t) {
  let s = String(t == null ? '' : t);
  // 全角括号先归一，否则 ［［math:…］］ 这种认不出来
  s = s.replace(/［/g, '[').replace(/］/g, ']');
  // 模型有时把整段包成 [[math:...]]/[[chem:...]]，标题里得先把壳剥掉；
  // 标题存的时候会被截断，没闭合的壳也要吃掉，不然就露出 [[math:Na₂O₂（明轩 2026-10-29 的截图就是这个）
  s = s.replace(/\[\[(?:math|chem|unit|m|latex)\s*[：:]\s*([\s\S]*?)(?:\]\]|$)/gi, '$1');
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, '$1').replace(/\$([^$\n]+?)\$/g, '$1');
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, '');
  s = s.replace(/\\ce\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:mathrm|text|textrm|mathbf|mathit|operatorname|textnormal)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1');
  s = s.replace(/\\(?:left|right|,|;|!|quad|qquad)/g, '');
  // \KCl / \HCl 这种「反斜杠+元素符号」的写法很常见，
  // 以前整段删掉，反应式就变成 _3+6= +3_2 这种残骸；保留字母即可
  s = s.replace(/\\([A-Za-z]+)/g, '$1');
  s = s.replace(/\\/g, '');
  s = s.replace(/[{}]/g, '');
  // 最后再兜一遍：任何漏网的 [[math: / ]] 壳都不许出现在灰字里
  s = s.replace(/\[\[\s*(?:math|chem|unit|m|latex)\s*[：:]?\s*/gi, '').replace(/\]\]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function bindNotebook(m) {
  const listEl = document.getElementById('studyList');
  const aiEl = document.getElementById('studyAI');
  const textEl = document.getElementById('studyText');
  const saveBtn = document.getElementById('studySave');
  if (!listEl || !saveBtn || !aiEl || !textEl) return;
  const isWord = m.key === 'word';
  let nbImage = null;
  imageButton(textEl, (image) => {
    nbImage = image;
    if (!textEl.value.trim()) textEl.placeholder = '图片已添加，点下面按钮让 AI 分析';
  });

  const load = async () => {
    try {
      const r = await fetch(`/api/study/list?uid=${encodeURIComponent(state.uid)}&kind=${m.key}`);
      const d = await r.json();
      renderList(d.items || []);
    } catch (_) {
      listEl.innerHTML = '<div class="study-empty">读不到，检查网络</div>';
    }
  };

  const renderList = (items) => {
    if (!items.length) { listEl.innerHTML = '<div class="study-empty">还没存东西</div>'; return; }
    listEl.innerHTML = '';
    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'study-item study-nb-item';
      card.innerHTML = `
        <div class="study-item-title">${esc(plainLatex(it.title))}</div>
        ${it.note ? `<div class="study-item-note">${esc(plainLatex(it.note))}</div>` : ''}
        <div class="study-item-body"></div>
        <div class="study-item-foot"><span>${new Date(it.created_at).toLocaleDateString('zh-CN')}</span>
        <span class="nb-acts">${isWord ? '' : `<button class="study-ai-btn" data-ai="${it.id}" type="button">AI 分析</button>`}
        <button class="study-go" data-go="${it.id}" type="button">去学习</button>
        <button class="study-del" data-del="${it.id}" type="button">删掉</button></span></div>`;
      // 灰色备注里带公式的，也按公式排；纯文本兜底成 plainLatex
      const noteEl = card.querySelector('.study-item-note');
      if (noteEl && it.note) {
        const nt = toMathTags(it.note);
        let nh = '';
        try { nh = renderMarkdown(nt); } catch (_) { nh = ''; }
        if (nh && !/\[\[\s*(?:math|chem)/i.test(nh)) { noteEl.innerHTML = nh; try { linkChem(noteEl); } catch (_) {} }
      }
      const body = card.querySelector('.study-item-body');
      if (it.content) {
        const content = isWord ? normalizeWordPhonetics(it.content) : toMathTags(it.content);
        try { body.innerHTML = renderMarkdown(content); } catch (_) { body.textContent = content; }
        if (isWord || looksEnglish(content)) annotateEnglish(body);
        card.classList.add('has-body');
        if (!isWord) card.classList.add('open');
        card.addEventListener('click', (e) => {
          if (e.target.closest('.study-del')) return;
          // 点单词是要查词，不是折叠卡片：以前这里把卡片收起来，
          // 词的位置没了，查词框就跳到左上角，看起来像条目“消失”。
          if (e.target.closest('.dict-word, .dict-pop, a, button')) return;
          card.classList.toggle('open');
        });
      }
      listEl.appendChild(card);
    });
    // 外部存进来的错题只有题干和答案，没有分析：这里按同一套四段结构现生成，写回这条记录
    listEl.querySelectorAll('[data-ai]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = items.find(x => String(x.id) === String(b.dataset.ai));
        if (!item || b.disabled) return;
        const old = b.textContent;
        b.disabled = true;
        b.textContent = '分析中';
        try {
          const r = await fetch('/api/study', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: state.uid, mode: 'mistake', text: `错题：${item.content || item.title}` }),
          });
          const d = await r.json();
          if (!d.ok || !d.answer) throw new Error('fail');
          const merged = `${item.content || ''}\n\n---\n\n${String(d.answer)}`;
          await fetch('/api/study/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: state.uid, id: item.id, content: merged.slice(0, 16000) }),
          });
          b.textContent = '已分析';
          load();
        } catch (_) {
          b.disabled = false;
          b.textContent = old || 'AI 分析';
          b.classList.add('is-error');
        }
      });
    });

    listEl.querySelectorAll('[data-go]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = items.find(x => String(x.id) === String(b.dataset.go));
        if (item) jumpToCourse(item, isWord);
      });
    });
    listEl.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/study/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: state.uid, id: b.dataset.del }),
        });
        load();
      });
    });
  };

  // 逐字渲染，和聊天页同一套观感；未闭合的 [[math:]] 先藏住，避免闪标签
  const safeSlice = (t) => String(t || '')
    .replace(/\[\[(?:math|chem|draw):[\s\S]*$/, '')
    .replace(/```[\s\S]*$/, '');
  const typeInto = (el, text, done) => {
    const full = String(text || '');
    let i = 0;
    const step = Math.max(2, Math.min(32, Math.ceil(full.length / 150)));
    const tick = () => {
      i = Math.min(full.length, i + step);
      const part = safeSlice(full.slice(0, i));
      try { el.innerHTML = renderMarkdown(part); } catch (_) { el.textContent = part; }
      if (i < full.length) requestAnimationFrame(tick);
      else {
        if (isWord || looksEnglish(text)) annotateEnglish(el);
        if (done) done();
      }
    };
    tick();
  };

  const analyze = async () => {
    const raw = textEl.value.trim();
    if (!raw && !nbImage) { textEl.focus(); return; }
    const firstLine = raw.split('\n')[0].trim();
    const title = (firstLine || (nbImage ? (isWord ? '图片生词' : '图片错题') : (isWord ? '生词' : '错题'))).slice(0, 80);
    const text = isWord ? raw : `错题：${raw || '请看图片'}`;

    saveBtn.disabled = true;
    aiEl.innerHTML = '<div class="study-ai-card"><div class="study-ai-loading">AI 正在整理，稍等</div></div>';
    const card = aiEl.querySelector('.study-ai-card');
    const loadingEl = card.querySelector('.study-ai-loading');
    const dot = thinking();
    card.appendChild(dot);
    try {
      const r = await fetch('/api/study', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, mode: m.key, text, image: nbImage || undefined }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || '没生成出来');
      nbImage = null;
      if (dot.isConnected) dot.remove();
      if (loadingEl) { loadingEl.textContent = 'AI 整理完成'; loadingEl.classList.add('is-done'); }
      const answer = isWord ? normalizeWordPhonetics(d.answer) : String(d.answer || '');
      const bodyEl = document.createElement('div');
      bodyEl.className = 'study-ai-text text';
      card.appendChild(bodyEl);
      // 先存完整内容再打字：以前要等逐字动画跑完才存，
      // 中途切走/后台标签页会停在半截，看起来“AI 整理的不全”。
      fetch('/api/study/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, kind: m.key, title, content: answer.slice(0, 16000), note: '' }),
      }).then(() => load()).catch(() => {});
      // 存完顺手给个课程入口：错题对应哪一章，点一下就去听
      try {
        const g = guessChapter(`${title} ${raw}`, isWord ? { subject: '英语' } : {});
        if (g && g.chapter) {
          const go = document.createElement('button');
          go.type = 'button';
          go.className = 'study-ai-go';
          go.textContent = `去看「${g.chapter}」这一章`;
          go.addEventListener('click', () => openCourseAt({ stage: g.stage, grade: g.grade, subject: g.subject, book: g.book, chapter: g.chapter, action: 'start' }));
          card.appendChild(go);
        }
      } catch (_) {}
      typeInto(bodyEl, answer, () => {});
      textEl.value = '';
    } catch (e) {
      if (dot.isConnected) dot.remove();
      if (loadingEl) { loadingEl.textContent = 'AI 整理失败'; loadingEl.classList.add('is-error'); }
      const err = document.createElement('div');
      err.className = 'study-ai-err';
      err.textContent = e.message || '没生成出来，再试一次';
      card.appendChild(err);
    } finally {
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', analyze);
  textEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
  });

  load();
}

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 生词本音标：英/美相同只留一个；不同用 BrE /.../ · NAmE /.../，不出现中文“英/美”标签
function normalizeWordPhonetics(value) {
  const phon = String.raw`(?:\/[^\/\n]+\/|\[[^\]\n]+\])`;
  const label = String.raw`(?:英式音标|美式音标|英式|美式|英|美|BrE|NAmE)`;
  const tidy = (p) => String(p || '').replace(/\s+/g, ' ').trim();
  let s = String(value == null ? '' : value);
  s = s.replace(/\*\*(英式音标|美式音标|英式|美式|英|美|BrE|NAmE)\*\*/gi, '$1');
  s = s.replace(/\*\*((?:英式音标|美式音标|英式|美式|英|美|BrE|NAmE))\s*[:：]\s*\*\*/gi, '$1：');
  const pair = new RegExp(`(${label})\\s*[:：]?\\s*(${phon})\\s*(?:[·•|,，;；/]|\\s+)\\s*(${label})\\s*[:：]?\\s*(${phon})`, 'gi');
  s = s.replace(pair, (_m, l1, p1, l2, p2) => {
    const a = tidy(p1);
    const b = tidy(p2);
    const firstIsBr = /^(?:英|BrE)/i.test(l1);
    const br = firstIsBr ? a : b;
    const am = firstIsBr ? b : a;
    return br === am ? br : `BrE ${br} · NAmE ${am}`;
  });
  // 只剩一个音标时，把中文“英/美”标签去掉；BrE/NAmE 只在不构成成对音标时去
  const cnLabel = String.raw`(?:英式音标|美式音标|英式|美式|英|美)`;
  s = s.replace(new RegExp(`(?:${cnLabel})\\s*[:：]\\s*(${phon})`, 'gi'), '$1');
  s = s.replace(new RegExp(`(?:${cnLabel})\\s+(${phon})`, 'gi'), '$1');
  if (!/\bNAmE\b/i.test(s)) s = s.replace(new RegExp(`\\bBrE\\b\\s*[:：]?\\s*(${phon})`, 'gi'), '$1');
  if (!/\bBrE\b/i.test(s)) s = s.replace(new RegExp(`\\bNAmE\\b\\s*[:：]?\\s*(${phon})`, 'gi'), '$1');
  return s;
}
