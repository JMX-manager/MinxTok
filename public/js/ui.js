// 通用界面件：抽屉、弹窗、提示、遮罩、骨架。所有浮层只走这里，保证层级与动画一致
import { t } from './i18n.js?v=118';

const $ = (id) => document.getElementById(id);

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 抽屉 ---------- */
const NAV_ORDER = ['chat', 'topup', 'diary', 'archive', 'study', 'games', 'assistant', 'settings', 'about'];
// 这个模块会被不同 ?v= 各加载一次，形成多个实例；状态必须放在 window 上共用，
// 否则 A 实例设的 S.pageBack 在 B 实例的点击处理器里读不到，返回键就被当成菜单键。
const S = (window.__uiState = window.__uiState || {
  activeNav: 'chat', pageBack: null, pageCloseOnly: false, inited: false, modalOnClose: null,
});

function placeDrawerInd() {
  const drawer = $('drawer');
  const ind = $('drawerInd');
  if (!drawer || !ind) return;
  const el = drawer.querySelector(`.item[data-nav="${S.activeNav}"]`);
  if (!el) { ind.style.opacity = '0'; return; }
  const d = drawer.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  ind.style.height = `${r.height}px`;
  ind.style.transform = `translate3d(0, ${r.top - d.top}px, 0)`;
  ind.style.opacity = '1';
}

export function setActiveNav(key, animate = true) {
  S.activeNav = NAV_ORDER.includes(key) ? key : 'chat';
  document.querySelectorAll('.drawer .item[data-nav]').forEach(x => {
    x.classList.toggle('active', x.dataset.nav === S.activeNav);
  });
  const ind = $('drawerInd');
  if (ind) {
    if (!animate) {
      // 抽屉打开前先把选中框放好，别在滑入动画途中做布局测量
      ind.style.transition = 'none';
      placeDrawerInd();
      requestAnimationFrame(() => { ind.style.transition = ''; });
    } else {
      ind.style.transition = '';
      requestAnimationFrame(placeDrawerInd);
    }
  }
}

export function getActiveNav() { return S.activeNav; }

let drawerOpenToken = 0;
let drawerFadeTimer = 0;
let pageCoverTimer = 0;

export function openDrawer() {
  // 手机上 touchend 之后 rAF 会先跑，遮罩一变可点，紧随的 click 就落到遮罩上，
  // 抽屉刚开就被自己关掉（看起来像"菜单键没反应、直接留在主对话"）。
  S.overlayAt = Date.now();
  const token = ++drawerOpenToken;
  clearTimeout(drawerFadeTimer);
  document.body.classList.remove('drawer-closing');
  // 先把背后的模糊/缩放画出来，再启动抽屉的 transform 动画。
  // 模糊本身不参与过渡，避免安卓 WebView 每帧重算大面积 filter。
  document.body.classList.add('drawer-open');
  // 选中框在抽屉滑入前就放好，避免动画途中再做一次布局测量。
  // 原来这里先 placeDrawerInd()、rAF 里又量一次，等于动画开始前多跑一次
  // 强制同步布局，手感就是"按下去要顿一下才动"。
  setActiveNav(S.activeNav, false);
  requestAnimationFrame(() => {
    if (token !== drawerOpenToken) return;
    $('drawer').classList.add('show');
    $('scrim').classList.add('show');
  });
}
export function closeDrawer() {
  drawerOpenToken++;
  $('drawer').classList.remove('show');
  $('scrim').classList.remove('show');
  // 立刻开始淡出，不拖到抽屉滑完；模糊和压暗都在遮罩层上一起淡出。
  document.body.classList.add('drawer-closing');
  document.body.classList.remove('drawer-open');
  clearTimeout(drawerFadeTimer);
  drawerFadeTimer = setTimeout(() => document.body.classList.remove('drawer-closing'), 210);
}

/* ---------- 弹窗 ---------- */


export function openModal({ title, body, onClose }) {
  S.overlayAt = Date.now();
  $('modalTitle').textContent = title || '';
  $('modalBody').innerHTML = body || '';
  $('modalWrap').classList.add('show');
  $('scrim').classList.add('show');
  S.modalOnClose = onClose || null;
}

export function closeModal() {
  $('modalWrap').classList.remove('show');
  if (!$('drawer').classList.contains('show')) $('scrim').classList.remove('show');
  if (S.modalOnClose) { const fn = S.modalOnClose; S.modalOnClose = null; fn(); }
}

/* ---------- 重要提示抽屉（充值到账 / 新版本 / 大型提示） ----------
   明轩要的那种"Apple 抽屉"：从底部升起、顶部圆角加抓手、背景虚化压暗、
   底部一颗「了解」。以前那个居中弹窗大叉 + 顶部几乎贴边，太丑，已废弃。 */
let nsOnOk = null;
let nsDismissible = true;
let nsLastFocus = null;

export function openNotice(opt = {}) {
  const {
    title = '', sub = '', hero = '', rows = [], note = '',
    button = '了解', ver = '', onOk = null, dismissible = true,
  } = opt;
  const wrap = $('nsWrap');
  if (!wrap) return;
  nsLastFocus = document.activeElement;
  nsOnOk = typeof onOk === 'function' ? onOk : null;
  nsDismissible = dismissible !== false;
  $('nsTitle').textContent = title;
  const subEl = $('nsSub');
  subEl.textContent = sub || '';
  subEl.hidden = !sub;
  const heroEl = $('nsHero');
  heroEl.innerHTML = hero || '';
  heroEl.hidden = !hero;
  $('nsList').innerHTML = (rows || []).map(
    (r) => `<div class="ns-row"><span class="ns-k">${r.k}</span><b class="ns-v">${r.v}</b></div>`
  ).join('');
  $('nsList').hidden = !(rows || []).length;
  const noteEl = $('nsNote');
  noteEl.textContent = note || '';
  noteEl.hidden = !note;
  $('nsBtn').textContent = button || '了解';
  const verEl = $('nsVer');
  verEl.textContent = ver || '';
  verEl.hidden = !ver;

  wrap.hidden = false;
  S.overlayAt = Date.now();
  // 两帧：先让节点参与布局，再挂 .show，过渡才会从"收起"跑到"展开"
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.classList.add('show');
    $('nsPanel').classList.add('show');
  }));
}

let nsTimer = 0;
export function closeNotice(runOk = true) {
  const wrap = $('nsWrap');
  const panel = $('nsPanel');
  if (!wrap || wrap.hidden) return;
  const done = nsOnOk;
  nsOnOk = null;
  // 先收起，等它整块降下去再 hidden；直接 hidden 会把最后半截动画切掉
  wrap.classList.remove('show');
  if (panel) panel.classList.remove('show');
  clearTimeout(nsTimer);
  const hide = () => { wrap.hidden = true; };
  if (panel) {
    let fired = false;
    const onEnd = (e) => {
      if (e.target !== panel || e.propertyName !== 'transform') return;
      if (fired) return;
      fired = true;
      panel.removeEventListener('transitionend', onEnd);
      hide();
    };
    panel.addEventListener('transitionend', onEnd);
  }
  nsTimer = setTimeout(hide, 520);
  if (nsLastFocus && nsLastFocus.focus) { try { nsLastFocus.focus(); } catch (_) {} }
  nsLastFocus = null;
  if (runOk && done) done();
}

export function bindNotice() {
  const btn = $('nsBtn');
  if (btn) btn.addEventListener('click', () => closeNotice(true));
  const wrap = $('nsWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap && nsDismissible) closeNotice(false);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('nsWrap') && !$('nsWrap').hidden && nsDismissible) closeNotice(false);
  });
}

/* ---------- 数量滚轮（积分/学分兑换共用） ----------
   以前靠原生 overflow 滚动 + scroll-snap，在弹层里经常拖不动，
   索性自己接管：touch-action:none 交给 pointer 事件推，抬手再吸附到整格。 */
export function bindWheel(el, itemH, onChange, buzz) {
  if (!el) return;
  el.__wheelItemH = itemH;
  el.__wheelChange = onChange;
  if (el.__wheelBound) return;
  el.__wheelBound = true;
  let dragging = false;
  let startY = 0;
  let startTop = 0;
  let raf = 0;
  let lastIdx = -1;
  const idxAt = () => {
    const h = el.__wheelItemH || 42;
    const n = el.children.length;
    if (!n) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(el.scrollTop / h)));
  };
  const emit = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const i = idxAt();
      if (el.__wheelChange) el.__wheelChange(i);
      if (i !== lastIdx) { lastIdx = i; if (buzz) buzz(5); }
    });
  };
  el.__wheelEmit = emit;
  const snap = (smooth) => {
    const h = el.__wheelItemH || 42;
    const top = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, idxAt() * h));
    if (smooth && el.scrollTo) el.scrollTo({ top, behavior: 'smooth' });
    else el.scrollTop = top;
    emit();
  };
  el.__wheelSnap = snap;
  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button > 0) return;
    dragging = true;
    startY = e.clientY;
    startTop = el.scrollTop;
    el.classList.add('grabbing');
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    el.scrollTop = startTop - (e.clientY - startY);
    emit();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('grabbing');
    snap(true);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    el.scrollTop += e.deltaY;
    emit();
    clearTimeout(el.__wheelSnapT);
    el.__wheelSnapT = setTimeout(() => snap(true), 160);
  }, { passive: false });
  el.addEventListener('scroll', () => { if (!dragging) emit(); }, { passive: true });
}

/* ---------- 全屏页面 ---------- */
// 二级页的返回动作；为 null 表示这是一级页，右上角是菜单（都放在 S 上共用）

// 每页一句说明：顶栏右侧的 ⓘ 用它。key 用页面标题，查不到就按类型给通用说明
// 每个页面一段实打实的说明：是什么 / 能做什么 / 容易踩的点。
// 键用页面标题，子页有自己的键；没命中就回退到父级关键词。
const PAGE_HELP = {
  '学习': {
    what: '学习中心集中提供课程、刷题、翻译、解题、练习、错题本、生词本、场景应答与作文指导，各模块均由同一入口进入。',
    items: [
      '课程按学段、年级、学科、教材与章节组织，以对话形式讲解；刷题按范围、题型与难度生成客观题，并保留作答记录。',
      '翻译、解题、练习与作文指导均为对话式生成，可连续追问；解题与练习在条件允许时会配函数、几何或化学图示。',
      '错题本与生词本保存于账号；场景应答可使用内置情境，也可创建自定义场景。',
      '进入子页后，右上角的说明按钮会切换为该子页的说明。',
    ],
    tip: '各模块的额度消耗与记录方式不同，以子页说明和页面提示为准。',
  },
  '刷题': {
    what: '按学段、年级、学科、教材章节、题型与七档难度生成一组客观题，并记录作答结果。',
    items: [
      '题型包括单选、多选、不定项、判断与填空，可多选；题量为 5、10、15 道，节奏可选每题 30、45、60 秒或不限时。',
      '作答过程中可标记“不会”或“未学”：前者计为错误，后者不计入正确率，也不进入错题本。',
      '作答时可回看上一题；交卷后提供正确答案、解析与易错提示，并可点“存错题本”批量保存错题。',
      '页面右上的说明按钮用于查看规则，卡片内的设置按钮用于调整出题范围。',
    ],
    tip: '同一范围与参数再次出题时会优先复用已有题目，首次生成通常需要等待十余秒。',
  },
  '课程': {
    what: '课程按学段、年级、学科、教材、章节与小节组织，以流式对话完成讲解、例题与追问。',
    items: [
      '选定章节后，可从四位预设教师中选择一位，也可创建自定义教师；教师姓名与风格会写入授课提示。',
      '讲解内容按段落流式生成，可在同一章节内继续追问，上下文沿用当前小节。',
      '章节完成情况与最近学习记录保存在本机浏览器，不跨设备同步。',
      '若从错题本或生词本进入，系统会依据内容推测对应章节；推测失败时回到同学科选课页。',
    ],
    tip: '课程内容由模型生成，涉及教材版本或考试要求时，应以实际教材与教师讲解为准。',
  },
  '翻译': {
    what: '提供整句与整段的翻译，并尽量保留原文语气和上下文。',
    items: [
      '可指定目标语言；未指定时按原文判断。长段落会分段处理。',
      '译文可继续追问，例如用词差异、更自然的表达或更正式的版本。',
    ],
    tip: '专业术语与固定译名，建议同时说明领域或给出参考译法。',
  },
  '解题': {
    what: '面向数学、物理、化学等学科的分步解题，先给思路，再给步骤与结论。',
    items: [
      '几何、函数、受力与实验装置等题目，在适用时会生成图示。',
      '可继续追问某一步的依据、另一种解法或同类题。',
      '结果供学习参考；涉及考试评分标准时，以本校教师要求为准。',
    ],
    tip: '题干中请保留已知条件、单位与所求量，信息越完整，步骤越可靠。',
  },
  '练习': {
    what: '按知识点与难度生成练习题，默认五道，可指定题型与数量。',
    items: [
      '作答后可查看解析；需要时可将错题转入错题本。',
      '与刷题的区别是练习以对话为主，适合围绕一个知识点连续追问。',
    ],
    tip: '说明年级、知识点与难度，出题会更准确。',
  },
  '错题本': {
    what: '保存答错或主动录入的题目，并提供 AI 分析与课程跳转。',
    items: [
      '可输入题干、答案与错因，也可上传图片由 OCR 识别；AI 会整理为题目、答案、解析与易错点。',
      '条目按时间倒序保存于账号，可展开查看、重新分析、跳转对应课程章节或删除。',
      '刷题交卷后可点“存错题本”批量保存本轮错题，单次最多保存 10 道；未保存的错题不会自动进入错题本。',
    ],
    tip: '录入时补充自己的错误答案，分析会更有针对性。',
  },
  '生词本': {
    what: '保存生词、短语与例句，支持音标规范化与点词查询。',
    items: [
      '可手动输入或上传图片；AI 会整理释义、词性、音标与例句。',
      '条目保存于账号，可跳转课程章节；正文中的英文单词可点按查询。',
      '英式与美式音标相同时只显示一条，不同时分别标注。',
    ],
    tip: '连同原句一起记录，比只记单词更容易回忆用法。',
  },
  '场景应答': {
    what: '提供常用生活与考试场景，以角色对话方式练习表达。',
    items: [
      '内置场景按语言分类；也可自定义场景，名称长度为 5 至 50 字，保存在本机。',
      '进入场景后先由对方发话，你输入回答，系统给出示范与点评，可连续多轮。',
      '语言切换会影响示范句与点评语言。',
    ],
    tip: '先自己完整回答一遍，再看示范，练习效果更稳定。',
  },
  '作文指导': {
    what: '面向命题作文与材料作文，提供审题、立意、结构、素材与开头示例。',
    items: [
      '可提交题目、材料、已写段落与目标字数；系统会指出偏题风险与结构问题。',
      '可要求生成提纲、开头、结尾或修改建议，也可继续追问某一段的写法。',
      '生成内容为写作参考，不代替本人完成作文。',
    ],
    tip: '说明文体、字数与考试类型，建议会更贴合要求。',
  },
  '日记': {
    what: '日记支持常见富文本格式、图片与录音，并可按日期回看。',
    paras: [
      '写完后助理会阅读日记并给出评论；评论只针对文字内容，不构成心理或医学建议。',
      '日记保存在账号数据中，不会公开展示；仅在生成评论、搜索与档案总结时读取。',
    ],
    items: [
      '同一天再次打开会接着写；右上角日历可翻看以前的日记。',
      '图片与语音会先转为正文或描述，再交给助理处理。',
    ],
    tip: '涉及隐私的内容可以不写，或先删除再保存。',
  },
  '档案': {
    what: '查看本周概览，以及指定周、月的心情与使用统计。',
    paras: [
      '本周概览统计对话、日记、学习次数与心情标签，可切换周查看。',
      '心情支持本周与本月切换，拖动滑块可查看不同时间段；心情指数与分布只作观察。',
      '助理会围绕日记与学习生成总结和规划建议，内容仅供参考，不具指导性或专业性。',
    ],
    tip: '档案用于回看自己的使用轨迹，不作为评价依据。',
  },
  '情绪中心': {
    what: '提供 24 个心情标签，并通过助理给出情绪说明与疏导建议。',
    paras: [
      '主情绪为一周内占比最高的情绪，其余按占比排列；点击任意情绪可查看对应说明。',
      '饼图用于观察各情绪的占比变化；数据较少时分布会有波动，持续记录后更稳定。',
      '情绪数据保存在账号中，仅用于统计、搜索与助理总结。',
    ],
    tip: '情绪没有好坏之分，这里只帮助识别与记录。',
  },
  '游戏': {
    what: '游戏中心提供 18 款小游戏，均可选择难度，右侧“历史”记录最近战绩。',
    items: [
      '每局结束记录分数与星级，历史按时间倒序排列。',
      '勇往直前与疯狂虾虾中，可使用额度购买复活，每局最多 3 次。',
      '部分游戏的积分可结算为额度：600 积分兑换 1 额度，每日最多兑换 20。',
    ],
    tip: '进入单款游戏后，右上角的说明按钮会显示该游戏的规则。',
  },
  '勇往直前': {
    what: '横版跑酷：持续前进，躲避地刺与飞来的子弹，以距离计分。',
    items: [
      '上滑或空格跳跃，落地后有一小段土狼时间。',
      '高台左侧有斜坡，直接走上去就是一块更高的平地；斜坡上有些金币会换成炸弹，最多两个，跳过去就行。',
      '平台上的红色炸药方块碰到就炸，记得跳开。',
      '每档难度都有达标线：一至五星依次为 400、800、1200、1600、2000 米，达标即三星。',
      '达标后只弹底部提示，不会暂停，接着跑更远；死亡时按已跑距离结算积分。',
      '受伤后短暂无敌，并清除身前的障碍；每局最多复活 3 次。',
    ],
  },
  '疯狂虾虾': {
    what: '在黑暗中走出迷宫，避开追捕的龙虾，找到出口即过关。',
    items: ['熄灯期间只能看清脚下一格，需要依靠记忆行进。', '龙虾的锁定范围随难度扩大；二星为 2 只，四星起为 3 只。', '每 15 秒复活价格提高，每局最多复活 3 次。'],
  },
  '台球': {
    what: '简化 8 球规则，与 AI 对局，先进球者确定花色。',
    items: ['从白球向反方向拖动，距离越远力量越大，松手出杆。', '清完己方 7 颗球后再打 8 号球；8 号球提前进袋或白球同落均判负。', '白球落袋算犯规，交换击球权。'],
  },
  '保龄球': {
    what: '五帧十瓶赛制，球路带旋转，与 AI 比较总瓶数。',
    items: ['按住确定起点，上滑确定力量，左右滑动增加旋转。', '第一球全中直接进入下一帧，否则补第二球。'],
  },
  '全部击毙': {
    what: '俯视射击：与 AI 队友共同清除 5 波敌人，第 5 波出现头目。',
    items: [
      '在画面上按住拖动是摇杆走位，自动瞄准最近敌人开火。',
      '单击画面进入手雷倒计时，角色前方出现爆炸范围；再单击一次立即释放，1.2 秒后也会自动投掷。',
      '商店新增火焰子弹、冰冻子弹、燃烧弹、轻装靴、队友急救和队友护甲，价格逐次上涨。',
      '头目会持续回血、召唤援军，并周期性释放弹幕；小头目会冲锋散射，个别精英敌人也会三连射。',
    ],
    tip: '商店弹窗内可上下滑动找技能，关闭后页面不会跟着滚动。',
  },
  '爆破能手': {
    what: '计算预算购买炸药，依次完成装药、起爆与清运；验收依据破坏率、污染、地基与渣土，共 20 关。',
    items: [
      '先选择炸药，再点击结构块装药；每处还需购买引线。新增精密切割、低震泡沫和温压弹。',
      '装药完成后可开启预览：红色表示必毁，橙色表示受损。',
      '起爆后可花费 ¥110 降尘，每关最多 3 次。',
      '坍塌物理加入横向偏移、旋转和落地回弹，渣土与震动反馈更明显。',
      '清运比例必须达标，否则无法通过验收。',
    ],
    tip: '预算不超过上限即可，没有“必须花够”的要求。',
  },
  '五子棋': { what: '15 路棋盘，与 AI 对局，先连成五子者胜。', items: ['你执黑先行，AI 按难度让子。', '横、竖、斜任意方向连成五子即胜。'] },
  '井字棋': { what: '三子连线的小盘对局。', items: ['你执 X 先行。', '平局也计为一局，并写入历史。'] },
  '2048': { what: '滑动合并数字，一星目标 512，二星目标 1024，三至五星依次为 2048、4096、8192。', items: ['使用方向键或滑动操作。', '512、1024、2048 分别对应一、二、三星；棋盘填满且无法合并时结束。'] },
  '俄罗斯方块': { what: '旋转并拼接方块，消除整行；堆至顶部时结束。', items: ['左右移动，上键旋转，下键加速下落。', '一次消除多行得分更高。'] },
  '贪吃蛇': { what: '吃豆变长，避免撞墙或咬到自己。', items: ['移动速度会随长度增加而提高。'] },
  '乒乓球': { what: '接住来球得分，先达到目标分者获胜。', items: ['未接住即失一分，球速逐球加快。'] },
  '记忆翻牌': { what: '翻开两张牌进行配对，全部配对完成即结束。', items: ['步数越少，评分越高。'] },
  '快问快答': { what: '60 秒内连续作答，答得越快得分越高。', items: ['答对可累积连击加分；答错扣 3 秒并记下错题。', '结算时给出 S 至 D 评级。'] },
  '蜘蛛纸牌': { what: '十列接龙，凑齐 K 到 A 的同花顺后自动收走，收完八组即获胜。', items: ['点击一张牌会选中它及其下方的同花顺子，再点击目标列放下。', '空列可放置任意牌；发牌要求十列均非空。'] },
  '扫雷': { what: '点开格子并避开地雷，数字表示周围八格中的雷数。', items: ['长按或右键可插旗。', '点开地雷即结束。'] },
  '数字华容道': { what: '滑动数字块，按顺序排列。', items: ['步数越少越好。'] },
  '充值': {
    what: '额度按用完的先后扣：先扣兑换额度，再扣限时额度，最后才扣每日额度；页面顶部显示的是总共还剩多少额度。',
    paras: [
      '额度不足时在这里生成充值码，截图发给管理员，扫码付款后额度实时到账；也可以直接输入兑换码。',
      '明叙会在节日与生日期间提供专属额度赠礼。',
    ],
    items: [
      '每日额度按天重置，默认 100，当天用完不会累积到明天。',
      '兑换额度是永久池：学分、积分换来的，扫码充值买的，都进这里，用不完一直留着。',
      '限时额度到期作废，同样不占每日上限。',
      '充值码 30 分钟有效，每人一张，付过即作废，可随时重新生成。',
      '学习中心 200 学分兑换 1 额度，每天最多 20；游戏积分 600 分兑换 1 额度，同样每天最多 20。',
      '兑换码会提示不存在、已过期或已用完。',
    ],
    tip: '先看顶部还剩多少额度，再决定充值还是兑换。',
  },
  '助理设置': {
    what: '修改助理的名称、称呼与性格设定，保存后立即生效。',
    items: ['名称会替换界面中所有“虾虾”字样。', '性格描述会写入系统提示词，影响回复风格。'],
  },
  '设置': {
    what: '字号、主题、语言与账号设置均在此处，改动会即时保存。',
    items: [
      '字号档位会同步作用于正文、页面说明、按钮与图示标注。',
      '语言切换后，界面文案与模型回复会跟随切换。',
      '清空对话只删除聊天记录，日记与学习记录不受影响。',
    ],
  },
  '搜索': {
    what: '支持全站搜索与分类搜索，也可联网检索站外内容。',
    paras: [
      '支持时间范围与情绪范围筛选；情绪分类可在情绪中心查看。',
      '搜索范围包括聊天、日记与学习；联网搜索会检索站外文章与网页，内容可能失实，需要自行辨别。',
      '无法确定关键词时，可使用“按意思搜”，通过向量检索定位大意相近的内容。',
    ],
    items: [
      '结果中的关键词会高亮，点击可直接跳到对应消息或页面。',
      '联网搜索需先输入关键词；站内搜索可配合时间、分类与情绪筛选。',
    ],
    tip: '“按意思搜”适合记得大意、但记不清原话的情况。',
  },
  '关于': {
    what: '查看版本号、更新日志与反馈入口。',
    items: ['更新日志按版本记录改动内容。', '反馈会直接进入后台。'],
  },
  '更新日志': {
    what: '按版本记录功能新增、调整与修复。',
    items: ['条目按时间倒序排列。', '历史版本中的额度、界面与规则可能与当前版本不同。'],
  },
  '问题反馈': {
    what: '提交使用中遇到的问题、异常表现或改进建议。',
    items: ['请尽量写明页面、操作步骤与出现时间。', '涉及账号信息时，不要填写密码或验证码。'],
  },
  '文章': { what: '站内文章页，支持长文阅读与代码块。', items: ['右上角可分享或复制链接。'] },
};

// 档案页标题会跟随语言切换，英文环境也复用同一份说明
PAGE_HELP['Archive'] = PAGE_HELP['档案'];
const PAGE_HELP_FALLBACK = {
  what: '这一页还没写说明。',
  items: ['如果不知道这里能干什么，回聊天里直接问我就行。'],
};

export function helpFor(title) {
  const key = String(title || '').trim();
  if (PAGE_HELP[key]) return PAGE_HELP[key];
  const hit = Object.keys(PAGE_HELP).find((k) => key && (key.includes(k) || k.includes(key)));
  return hit ? PAGE_HELP[hit] : PAGE_HELP_FALLBACK;
}

export function helpHtml(title) {
  const h = helpFor(title);
  const items = (h.items || []).map((x) => `<li>${x}</li>`).join('');
  const paras = (h.paras || []).map((x) => `<p class="page-help-p">${x}</p>`).join('');
  return `<div class="page-help-content">`
    + (h.what ? `<p class="page-help-what">${h.what}</p>` : '')
    + paras
    + (items ? `<ul class="page-help-list">${items}</ul>` : '')
    + (h.tip ? `<div class="page-help-tip"><span class="page-help-tip-label">小提示</span>${h.tip}</div>` : '')
    + `</div>`;
}

// 打开页面。back 传函数 = 这是二级页，右上角显示「返回」并执行 back；不传 = 一级页
// 一级页标题 → 抽屉里对应的菜单项：调用方漏传 nav 时靠这个兜住，选中态不会卡在「对话」
const NAV_BY_TITLE = {
  '充值': 'topup', 'Top up': 'topup', 'Topup': 'topup', 'Recharge': 'topup',
  '日记': 'diary', 'Diary': 'diary',
  '档案': 'archive', 'Archive': 'archive',
  '学习': 'study', 'Study': 'study', '学习中心': 'study',
  '游戏': 'games', 'Games': 'games', '游戏中心': 'games',
  '助理设置': 'assistant', 'Assistant': 'assistant',
  '设置': 'settings', 'Settings': 'settings',
  '关于': 'about', 'About': 'about',
};

export function openPage(title, html, back, nav, opts = {}) {
  const wasOpen = $('page').classList.contains('show');
  const prevNav = S.activeNav;
  clearTimeout(pageCoverTimer);
  clearTimeout(closePage._tBody);
  if (!wasOpen) document.body.classList.remove('page-covered');
  document.body.classList.add('page-open');
  // 没给返回动作就一定是菜单键：不再靠 wasOpen 猜。
  // （按 wasOpen 猜会让"从抽屉进来的页"偶尔拿到返回箭头，点一下直接回聊天，
  //   看着就像菜单键不认账——日记骨架页那次就是这么来的。）
  // 真正要"返回上一层"的调用点（文章 / 自定义块 / 更新日志 / 反馈）都显式传了 back。
  S.pageBack = typeof back === 'function' ? back : null;
  S.pageCloseOnly = !!opts.closeOnly;
  const navKey = nav || NAV_BY_TITLE[String(title || '').trim()];
  if (navKey) setActiveNav(navKey);
  $('pageTitle').textContent = title || '';
  // 学习中心的对话页会把 pageBody 改成 flex 布局，换页时必须还原
  $('pageBody').classList.remove('study-full');
  $('pageBody').innerHTML = html || '';
  $('page').classList.add('show');
  // 换页/打开更新日志时回到顶部，避免沿用上一页的滚动位置。
  // 必须等 #page 显示后再设，否则部分 WebView 会把 scrollTop 夹回旧值。
  const toTop = () => {
    if (!$('page').classList.contains('show')) return;
    $('pageBody').scrollTop = 0;
    $('page').scrollTop = 0;
    if (typeof $('page').scrollTo === 'function') $('page').scrollTo(0, 0);
  };
  toTop();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(toTop);
  syncPageBtn();
  if (wasOpen) playPageSwitch(prevNav, nav || prevNav, 1);
  else playPageIn();
  // 页面真正盖住聊天后再撤掉 #app 的滤镜，避免切换瞬间露出没模糊的底层
  pageCoverTimer = setTimeout(() => {
    if ($('page').classList.contains('show') && !$('page').classList.contains('page-closing')) {
      document.body.classList.add('page-covered');
    }
  }, 390);
}

// 右上角按钮：一级页显示叉号，二级页显示「返回」两个字
function syncPageBtn() {
  const btn = $('btnPageClose');
  if (!btn) return;
  btn.classList.toggle('is-back', !!S.pageBack);
  btn.classList.toggle('is-menu', !S.pageBack && !S.pageCloseOnly);
  btn.classList.toggle('is-close', S.pageCloseOnly);
  btn.setAttribute('aria-label', S.pageBack ? 'back' : S.pageCloseOnly ? 'close' : 'menu');
  const help = $('btnPageHelp');
  if (help) help.hidden = !$('pageTitle').textContent;
  btn.innerHTML = S.pageBack
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"></path></svg>'
    : S.pageCloseOnly
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"></path></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15"></path></svg>';
}

// 一级页加载态：按页面类型给出和真实布局同尺寸的骨架，避免换页时跳一下
export function pageLoading(kind = '') {
  const bar = (h, w, mt = 0, r = 4) =>
    `<div class="m-skeleton" style="height:${h}px;width:${w};border-radius:${r}px;margin-top:${mt}px"></div>`;
  const card = (h, mt = 0, r = 16) =>
    `<div class="m-skeleton" style="height:${h}px;border-radius:${r}px;margin-top:${mt}px"></div>`;
  if (kind === 'topup') {
    return `<div class="page-skel">
      ${card(96, 0, 18)}
      <div class="m-skeleton" style="height:13px;width:32%;border-radius:4px;margin:22px 0 10px"></div>
      ${card(138, 0, 14)}
      <div class="m-skeleton" style="height:13px;width:26%;border-radius:4px;margin:22px 0 10px"></div>
      ${card(78, 0, 14)}
    </div>`;
  }
  if (kind === 'diary') {
    return `<div class="page-skel">
      ${card(118, 0, 18)}
      ${[0, 1, 2].map(() => `
        <div class="sk-diary-card">
          ${bar(10, '34%')}
          ${bar(13, '94%', 12)}
          ${bar(13, '72%', 8)}
        </div>`).join('')}
    </div>`;
  }
  if (kind === 'article') {
    return `<div class="page-skel">
      ${bar(21, '88%', 0, 6)}
      ${bar(21, '54%', 10, 6)}
      ${bar(11, '38%', 16)}
      <div class="m-skeleton" style="height:1px;width:100%;margin:18px 0"></div>
      ${[96, 92, 97, 84, 90, 56].map(w => bar(13, w + '%', 12)).join('')}
    </div>`;
  }
  if (kind === 'assistant') {
    return `<div class="page-skel">
      ${[0, 1, 2, 3].map(() => card(58, 14, 14)).join('')}
    </div>`;
  }
  return `<div class="page-skel">
    ${card(74, 0, 18)}
    ${bar(14, '52%', 20)}
    ${bar(14, '88%', 12)}
    ${bar(14, '72%', 12)}
    ${card(52, 22, 16)}
    ${card(52, 12, 16)}
  </div>`;
}

// 不改内容只改层级（真页面切二级用）：null = 一级页叉号，函数 = 二级页左箭头
export function setPageLevel(back) {
  S.pageBack = typeof back === 'function' ? back : null;
  S.pageCloseOnly = false;
  syncPageBtn();
}

export function setPageTitle(title) {
  $('pageTitle').textContent = title || '';
  const help = $('btnPageHelp');
  if (help) help.hidden = !title;
}

// 页面内容原地替换但保持当前层级（情绪中心骨架→数据、加载失败→内容都用它，避免按钮跳变）
export function fillPage(html) {
  // fillPage 只换内容；学习对话页需要保留 flex 类，由 study.js 自己管理
  $('pageBody').innerHTML = html || '';
}

// 整页入场：整页从基准位放大收口 + 模糊淡入 + 内容错峰。每次 openPage 都重放
export function playPageIn() {
  const page = $('page');
  const body = $('pageBody');
  if (!page || !body) return;
  page.classList.remove('page-in', 'page-closing', 'page-switch');
  void page.offsetWidth;
  page.classList.add('page-in');
  // 动画跑完必须摘掉，否则 fill:both 会一直压着 transform，关闭时滑不出去
  page.addEventListener('animationend', function onEnd(e) {
    if (e.target !== page) return;
    page.removeEventListener('animationend', onEnd);
    page.classList.remove('page-in');
    body.classList.remove('body-in');
    kidsClear();
  });

  body.classList.remove('body-in');
  body.querySelectorAll('.m-stagger').forEach(x => x.classList.remove('m-stagger'));
  void body.offsetHeight;
  // 直接子元素逐个错峰，深度一层就够，二级容器里的不再叠
  const kids = [...body.children];
  kids.forEach((el, i) => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    el.style.animationDelay = `${60 + i * 45}ms`;
  });
  body.classList.add('body-in');
  function kidsClear() {
    [...body.children].forEach(el => { el.style.animation = ''; el.style.animationDelay = ''; });
  }
}

// 页面内容切换：不再左右平移，内容从基准位轻微放大 + 模糊淡入
export function playPageSwitch(prev, next, dirOverride) {
  const page = $('page');
  const body = $('pageBody');
  if (!page || !body) return;
  page.classList.remove('page-in', 'page-closing', 'page-switch');
  body.classList.remove('body-in');
  void page.offsetWidth;
  page.classList.add('page-switch');
  clearTimeout(playPageSwitch._t);
  playPageSwitch._t = setTimeout(() => page.classList.remove('page-switch'), 380);
}

export function closePage() {
  const page = $('page');
  S.pageBack = null;
  S.pageCloseOnly = false;
  // 页面收回时让聊天区从底部轻轻长回来，而不是突然露出来
  const app = $('app');
  // 抽屉正在收回时 #app 已经在做 0.94→1 的过渡，再叠 appRise 会打架、抖一下
  if (app && !document.body.classList.contains('drawer-closing')) {
    app.classList.remove('app-rise');
    void app.offsetWidth;
    app.classList.add('app-rise');
    clearTimeout(closePage._appRise);
    closePage._appRise = setTimeout(() => app.classList.remove('app-rise'), 420);
  }
  clearTimeout(pageCoverTimer);
  document.body.classList.remove('page-covered');
  const pb = $('pageBody');
  if (pb) pb.classList.remove('study-full');
  syncPageBtn();
  if (!page) return;
  const body = $('pageBody');
  // 关闭前先撤掉入场动画/延时，否则 fill 状态会把整页钉在原地，看起来"退不出去"
  page.classList.remove('page-in');
  page.classList.add('page-closing');
  if (body) {
    body.classList.remove('body-in');
    [...body.children].forEach(el => { el.style.animation = ''; el.style.animationDelay = ''; });
  }
  page.classList.remove('show');
  page.classList.remove('page-switch');
  clearTimeout(playPageSwitch._t);
  // 页面滑出的这段时间继续保留页面模糊，滑完再撤 page-open；
  // 这样下面已经恢复的 #app 模糊和页面模糊能接上，不会闪一下。
  clearTimeout(closePage._tBody);
  closePage._tBody = setTimeout(() => {
    if (!page.classList.contains('show')) document.body.classList.remove('page-open');
  }, 420);
  // 滑出结束后把关闭标记摘掉，否则下次开门时 page-closing 会压掉入场动画
  clearTimeout(closePage._t);
  closePage._t = setTimeout(() => page.classList.remove('page-closing'), 420);
  setActiveNav('chat');
}

/* ---------- 底部抽屉 ---------- */
export function openSheet(title, html) {
  $('sheetTitle').innerHTML = title || '';
  $('sheetBody').innerHTML = html || '';
  const wrap = $('sheetWrap');
  wrap.classList.remove('emo-sheet');
  wrap.classList.add('show');
}

export function closeSheet() {
  // 只摘 .show，让遮罩 420ms 淡掉、面板同时降到底，动画走完再彻底移除
  const wrap = $('sheetWrap');
  if (!wrap) return;
  wrap.classList.remove('show');
}

/* ---------- 提示 ---------- */
export function toast(msg, ms = 1800) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast m-pop';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------- 页面级遮罩（暂停/AI 异常） ---------- */
export function setVeil(on, text) {
  const v = $('veil');
  if (text) $('veilText').textContent = text;
  v.classList.toggle('show', !!on);
}

/* ---------- 骨架屏 ---------- */
export function skeleton(n = 3) {
  return Array.from({ length: n }).map(() => `
    <div class="msg assistant" style="gap:10px">
      <div class="m-skeleton" style="width:56px;height:10px"></div>
      <div class="m-skeleton" style="width:86%;height:14px"></div>
      <div class="m-skeleton" style="width:64%;height:14px"></div>
    </div>`).join('');
}


export function initUi() {
  if (S.inited) return; // 防重复挂监听：重复注册会让返回键一次点出两个结果（先返回、再弹抽屉）
  S.inited = true;
  $('scrim').addEventListener('click', () => {
    // 刚打开的那一下不算点击，否则抽屉/弹窗会被自己的遮罩瞬间关掉
    if (Date.now() - (S.overlayAt || 0) < 340) return;
    closeDrawer();
    closeModal();
  });
  $('btnModalClose').addEventListener('click', closeModal);
  // 用委托挂在 document 上：syncPageBtn 会重写按钮内容，直接绑在按钮上的监听会被冲掉
  // ⓘ 也走委托：直接绑在按钮上时，只要按钮被重写过一次监听就没了，点了没反应
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#btnPageHelp')) return;
    const title = ($('pageTitle') || {}).textContent || '';
    openSheet(`${title || '这一页'} · 说明`, helpHtml(title));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btnPageClose')) return;
    // 返回键点下去压扁再弹回，按钮本身就有反馈；页面只做一次快速淡出
    const b = e.target.closest('#btnPageClose');
    b.classList.remove('pb-pop');
    void b.offsetWidth;
    b.classList.add('pb-pop');
    setTimeout(() => b.classList.remove('pb-pop'), 520);
    if (S.pageBack) { const fn = S.pageBack; fn(); return; }
    if (S.pageCloseOnly) { closePage(); return; }
    if ($('page').classList.contains('show')) { openDrawer(); return; }
    closePage();
  });
  $('sheetWrap').addEventListener('click', (e) => { if (e.target.id === 'sheetWrap') closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });
}

export function settingsBody() {
  return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>${t('settings.lang')}</span>
        <button class="btn ghost m-press" id="setLang">${document.documentElement.lang === 'zh-CN' ? '中文' : 'English'}</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span>${t('settings.theme')}</span>
        <div style="display:flex;gap:6px">
          <button class="btn ghost m-press" data-mode="auto">${t('settings.theme.auto')}</button>
          <button class="btn ghost m-press" data-mode="dark">${t('settings.theme.dark')}</button>
          <button class="btn ghost m-press" data-mode="light">${t('settings.theme.light')}</button>
        </div>
      </div>
    </div>`;
}
