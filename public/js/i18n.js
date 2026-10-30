// 双语：中英文切换，所有文案走 data-i18n，新增界面只加词条
const DICT = {
  zh: {
    'nav.chat': '对话',
    'nav.topup': '充值',
    'nav.study': '学习', 'nav.diary': '日记', 'nav.archive': '档案', 'nav.games': '游戏',
    'nav.settings': '设置',
    'nav.assistant': '助理',
    'nav.about': '关于',
    'input.placeholder': '和虾虾说点什么',
    'quota': '剩余 {n} 次',
    'quota.unknown': '额度 —',
    'send': '发送',
    'toast.playing': '正在播放：{title}',
    'toast.opened': '已打开链接',
    'toast.copied': '已复制',
    'toast.error': '出了点问题，稍后再试',
    'stopped': '已停止 ·  ',
    'ocr.empty': '没识别出文字',
    'ocr.failed': '图片识别失败，换一张试试',
    'stt.empty': '没听清，再说一次',
    'stt.failed': '语音识别失败',
    'stt.denied': '麦克风被拦了，用输入法的语音吧',
    'followup.more1': '为什么这么说',
    'followup.more2': '那我该怎么做',
    'followup.more3': '还有别的可能吗',
    'weather.title': '天气',
    'quota.title': '额度',
    'quota.left': '可用额度',
    'quota.placeholder': '输入口令兑换额度',
    'quota.redeem': '兑换',
    'quota.added': '兑换成功，加 {n} 次',
    'quota.failed': '口令无效或已用完',
    'toast.paused': '服务暂停中，请稍后再来',
    'modal.settings': '设置',
    'modal.about': '关于 MinxTok',
    'modal.about.body': 'MinxTok 是明叙的对话站点，虾虾在这里等你。',
    'auth.sub.login': '登录后开始对话',
    'auth.sub.register': '注册一个账号',
    'auth.sub.recover': '输入恢复码，重设密码',
    'auth.ph.id': '手机号',
    'auth.ph.pw': '密码，至少 8 位',
    'auth.ph.new': '新密码，至少 8 位',
    'auth.ph.code': '短信验证码',
    'auth.ph.recovery': '恢复码',
    'auth.code.send': '获取验证码',
    'auth.submit.enter': '进入',
    'auth.submit.create': '创建账号',
    'auth.submit.reset': '重设密码',
    'auth.seg.login': '登录',
    'auth.seg.register': '注册',
    'auth.forgot': '忘记密码',
    'auth.back': '返回登录',
    'auth.or': '或',
    'auth.passkey.login': '使用 Passkey 登录',
    'auth.passkey.register': '使用 Passkey 注册',
    'auth.terms.prefix': '我已阅读并同意',
    'auth.terms.link': '《服务条款与用户协议》',
    'auth.terms.title': '服务条款与用户协议',
    'auth.terms.close': '我已了解',
    'auth.err.terms': '请先阅读并同意《服务条款与用户协议》',
    'auth.err.weak': '密码至少 8 位',
    'auth.err.taken': '这个账号已经注册过了',
    'auth.err.invalid': '填手机号',
    'auth.err.phone': '手机号格式不对',
    'auth.err.code': '验证码错误或已失效',
    'auth.err.freq': '请求频繁，请稍后再试',
    'auth.err.cred': '账号或密码不对',
    'auth.err.net': '网络异常，稍后再试',
    'auth.err.generic': '操作失败，稍后再试',
    'auth.err.recover': '恢复码不对或已用过',
    'auth.err.reset': '重设失败，检查一下填写',
    'auth.err.passkey': '这个浏览器不支持 Passkey',
    'auth.err.passkey.fail': 'Passkey 操作失败，稍后再试',
    'auth.err.email': '先填邮箱',
    'auth.err.mailcfg': '邮件服务还没配置',
    'auth.err.send': '发送失败，稍后再试',
    'auth.err.cancelled': '取消了，或者设备不支持',
    'auth.err.cancelled2': '取消了，或者没有可用的 Passkey',
    'auth.err.passkey.reg': 'Passkey 注册失败',
    'auth.err.passkey.login': 'Passkey 登录失败',
    'settings.lang': '语言',
    'settings.theme': '主题',
    'settings.theme.auto': '自动',
    'settings.appearance': '外观',
    'settings.language': '语言',
    'settings.chat': '对话',
    'settings.status': '服务状态',
    'settings.account': '账号',
    'settings.account.id': '当前账号',
    'settings.account.logout': '退出登录',
    'settings.account.logout.sub': '退出后需要重新登录',
    'settings.data': '数据',
    'settings.followups': '显示追问建议',
    'settings.followups.sub': '关闭后不再显示 AI 推荐的下一个问题',
    'settings.blur': '发送后收起键盘',
    'settings.blur.sub': '点发送后自动失焦，避免选中态停留',
    'settings.haptics': '触感反馈',
    'settings.haptics.sub': '按钮、抽屉、拖动时轻震一下',
    'settings.haptics.test': '试一下',
    'settings.haptics.test.sub': '确认手机是否支持震动',
    'settings.haptics.test.btn': '轻震',
    'settings.haptics.off': '先打开触感反馈',
    'settings.model': '模型',
    'settings.quota': '可用额度',
    'settings.server': '服务',
    'settings.clear': '清除',
    'settings.clear.sub': '只清本机的会话与设置，不影响服务端',
    'settings.cleared': '已清除，刷新后生效',
    'about.intro': 'MinxTok 是一个安静的对话空间。虾虾住在这里，陪你聊天、放歌、看天气，也能联网搜一搜。',
    'about.stack': '技术',
    'about.privacy': '隐私',
    'about.privacy.text': '对话只保存在本站数据库，按设备生成的匿名编号区分，不收集手机号、位置只用于天气与日出日落。',
    'about.privacy.search': '使用联网搜索时，关键词会发送给百度千帆，用于获取公开网页结果。',
    'about.repo': '开源仓库',
    'about.credits': '第三方服务',
    'about.credits.note': '下面这些服务只用于对应功能，密钥只保存在服务端；上游接口调整时功能可能暂时失效。',
    'about.sources': '开源与素材',
    'about.sources.note': '字体与 emoji 的版权归原作者，本站只做界面展示；前端为原生 JavaScript，不依赖第三方框架。',
    'settings.theme.dark': '深色',
    'settings.theme.light': '浅色',
    'settings.fontsize': '字号',
    'settings.fontsize.sub': '调大后全站正文一起变大',
    'settings.fontsize.sample': '虾虾在这里等你，说点什么吧。',
    'settings.fontsize.s': '小',
    'settings.fontsize.m': '标准',
    'settings.fontsize.l': '大',
    'settings.fontsize.xl': '特大',
    'settings.mathfont': '数理字体',
    'settings.mathfont.sub': '开启后公式、化学式和解题说明用衬线，关闭用无衬线',
    'settings.mathfont.serif': '衬线',
    'settings.mathfont.sans': '无衬线',
    'settings.support': '支持',
    'settings.changelog': '更新日志',
    'settings.changelog.sub': '看看每个版本改了什么',
    'settings.view': '查看',
    'settings.feedback': '问题反馈',
    'settings.feedback.sub': '遇到问题或想加什么功能，直接告诉我',
    'settings.feedback.btn': '去反馈',
    'feedback.title': '问题反馈',
    'feedback.hint': '写清楚一点，处理起来更快。',
    'feedback.type.bug': '出问题了',
    'feedback.type.idea': '提建议',
    'feedback.type.other': '其它',
    'feedback.placeholder': '说说发生了什么，当时的操作和看到的结果……',
    'feedback.contact': '联系方式，方便回复你（可不填）',
    'feedback.send': '提交',
    'feedback.sending': '提交中…',
    'feedback.ok': '收到了，我会尽快看',
    'feedback.err.empty': '先写点内容再提交',
    'feedback.err.fail': '提交失败，稍后再试',
    'thinking': '虾虾正在想…',
    'veil.paused': '服务暂停中',
    'empty': '说点什么，虾虾在听。',
    'search.title': '搜索',
    'search.placeholder': '搜聊天记录',
    'search.empty': '没有找到相关内容',
    'mood.title': '情绪中心',
    'mood.hint': '选一个当下的心情，虾虾陪你聊',
    'mood.picked': '好，今天就是「{m}」',
  },
  en: {
    'nav.chat': 'Chat',
    'nav.topup': 'Top up',
    'nav.study': 'Study',
    'nav.diary': 'Diary', 'nav.archive': 'Archive',
    'nav.games': 'Games',
    'nav.settings': 'Settings',
    'nav.assistant': 'Assistant',
    'nav.about': 'About',
    'input.placeholder': 'Say something to Xiaxia',
    'quota': '{n} left',
    'quota.unknown': 'Quota —',
    'send': 'Send',
    'toast.playing': 'Now playing: {title}',
    'toast.opened': 'Link opened',
    'toast.copied': 'Copied',
    'toast.error': 'Something went wrong, try again',
    'stopped': 'Stopped',
    'ocr.empty': 'No text found',
    'ocr.failed': 'OCR failed, try another image',
    'stt.empty': 'Didn\'t catch that',
    'stt.failed': 'Speech recognition failed',
    'stt.denied': 'Microphone blocked, try keyboard voice input',
    'followup.more1': 'Why is that',
    'followup.more2': 'What should I do',
    'followup.more3': 'Any other options',
    'weather.title': 'Weather',
    'quota.title': 'Quota',
    'quota.left': 'Uses left',
    'quota.placeholder': 'Redeem code',
    'quota.redeem': 'Redeem',
    'quota.added': '+{n} added',
    'quota.failed': 'Invalid or used up',
    'toast.paused': 'Service paused, please come back later',
    'modal.settings': 'Settings',
    'modal.about': 'About MinxTok',
    'modal.about.body': 'MinxTok is Mingxu’s chat space. Xiaxia is here for you.',
    'auth.sub.login': 'Log in to start chatting',
    'auth.sub.register': 'Create an account',
    'auth.sub.recover': 'Enter a recovery code to reset your password',
    'auth.ph.id': 'Phone number',
    'auth.ph.pw': 'Password, at least 8 characters',
    'auth.ph.new': 'New password, at least 8 characters',
    'auth.ph.code': 'SMS code',
    'auth.ph.recovery': 'Recovery code',
    'auth.code.send': 'Send code',
    'auth.submit.enter': 'Enter',
    'auth.submit.create': 'Create account',
    'auth.submit.reset': 'Reset password',
    'auth.seg.login': 'Log in',
    'auth.seg.register': 'Sign up',
    'auth.forgot': 'Forgot password',
    'auth.back': 'Back to log in',
    'auth.or': 'or',
    'auth.passkey.login': 'Log in with Passkey',
    'auth.passkey.register': 'Sign up with Passkey',
    'auth.terms.prefix': 'I have read and agree to the ',
    'auth.terms.link': 'Terms of Service',
    'auth.terms.title': 'Terms of Service',
    'auth.terms.close': 'Got it',
    'auth.err.terms': 'Please read and agree to the Terms of Service first',
    'auth.err.weak': 'Password must be at least 8 characters',
    'auth.err.taken': 'This account is already registered',
    'auth.err.invalid': 'Enter a phone number',
    'auth.err.phone': 'Invalid phone number',
    'auth.err.code': 'Wrong or expired code',
    'auth.err.freq': 'Too many requests, try again later',
    'auth.err.cred': 'Incorrect account or password',
    'auth.err.net': 'Network error, please try again later',
    'auth.err.generic': 'Something went wrong, please try again',
    'auth.err.recover': 'Invalid or already-used recovery code',
    'auth.err.reset': 'Reset failed, please check your input',
    'auth.err.passkey': 'This browser does not support Passkey',
    'auth.err.passkey.fail': 'Passkey failed, please try again',
    'auth.err.email': 'Enter your email first',
    'auth.err.mailcfg': 'Email service is not configured',
    'auth.err.send': 'Failed to send, please try again',
    'auth.err.cancelled': 'Cancelled or device not supported',
    'auth.err.cancelled2': 'Cancelled or no Passkey available',
    'auth.err.passkey.reg': 'Passkey registration failed',
    'auth.err.passkey.login': 'Passkey login failed',
    'settings.lang': 'Language',
    'settings.theme': 'Theme',
    'settings.theme.auto': 'Auto',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.chat': 'Chat',
    'settings.status': 'Status',
    'settings.account': 'Account',
    'settings.account.id': 'Signed in as',
    'settings.account.logout': 'Log out',
    'settings.account.logout.sub': 'You will need to sign in again',
    'settings.data': 'Data',
    'settings.followups': 'Show follow-up suggestions',
    'settings.followups.sub': 'Turn off to hide AI-suggested questions',
    'settings.blur': 'Dismiss keyboard after sending',
    'settings.blur.sub': 'Blur input to clear the focus state',
    'settings.haptics': 'Haptics',
    'settings.haptics.sub': 'A light tap for buttons, sheets and dragging',
    'settings.haptics.test': 'Try it',
    'settings.haptics.test.sub': 'Check whether this phone supports vibration',
    'settings.haptics.test.btn': 'Tap',
    'settings.haptics.off': 'Turn haptics on first',
    'settings.model': 'Model',
    'settings.quota': 'Uses left',
    'settings.server': 'Service',
    'settings.clear': 'Clear',
    'settings.clear.sub': 'Only clears this device, not the server',
    'settings.cleared': 'Cleared. Refresh to apply.',
    'about.intro': 'MinxTok is a quiet space.<br>Xiaxia lives here — chat, music, weather, and web search.',
    'about.stack': 'Stack',
    'about.privacy': 'Privacy',
    'about.privacy.text': 'Conversations are stored on this site, keyed by an anonymous device id. No phone number; location is only used for weather and sunrise.',
    'about.privacy.search': 'When you use web search, your query is sent to Baidu Qianfan to fetch public web results.',
    'about.repo': 'Repository',
    'about.credits': 'Third-party services',
    'about.credits.note': 'These services power specific features. Keys stay on the server; a feature may pause if an upstream API changes.',
    'about.sources': 'Open source & assets',
    'about.sources.note': 'Fonts and emoji artwork belong to their original authors and are used for display only. The front end is plain JavaScript with no third-party framework.',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',
    'settings.fontsize': 'Font size',
    'settings.fontsize.sub': 'Scales body text across the site',
    'settings.fontsize.sample': 'Xiaxia is here. Say something.',
    'settings.fontsize.s': 'S',
    'settings.fontsize.m': 'M',
    'settings.fontsize.l': 'L',
    'settings.fontsize.xl': 'XL',
    'settings.mathfont': 'Math & chemistry font',
    'settings.mathfont.sub': 'On: serif for formulas, chemistry and worked solutions. Off: sans',
    'settings.mathfont.serif': 'Serif',
    'settings.mathfont.sans': 'Sans',
    'settings.support': 'Support',
    'settings.changelog': 'Changelog',
    'settings.changelog.sub': "See what changed in each release",
    'settings.view': 'View',
    'settings.feedback': 'Feedback',
    'settings.feedback.sub': 'Report a bug or suggest a feature',
    'settings.feedback.btn': 'Send',
    'feedback.title': 'Feedback',
    'feedback.hint': 'The more detail, the faster the fix.',
    'feedback.type.bug': 'Bug',
    'feedback.type.idea': 'Idea',
    'feedback.type.other': 'Other',
    'feedback.placeholder': 'What happened? Include the steps and what you saw…',
    'feedback.contact': 'Contact for a reply (optional)',
    'feedback.send': 'Submit',
    'feedback.sending': 'Sending…',
    'feedback.ok': 'Got it. I will take a look.',
    'feedback.err.empty': 'Please write something first',
    'feedback.err.fail': 'Failed to send, try again later',
    'thinking': 'Xiaxia is thinking…',
    'veil.paused': 'Service paused',
    'empty': 'Say something. Xiaxia is listening.',
    'search.title': 'Search',
    'search.placeholder': 'Search this chat',
    'search.empty': 'Nothing found',
    'mood.title': 'Mood',
    'mood.hint': 'Pick how you feel, Xiaxia will follow',
    'mood.picked': 'Got it, feeling「{m}」today',
  },
};

let lang;
try { lang = localStorage.getItem('minxtok.lang'); } catch (e) { lang = null; }
if (!lang) lang = 'zh';

export function t(key, vars = {}) {
  const s = (DICT[lang] && DICT[lang][key]) || DICT.zh[key] || key;
  let out = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
  // 可见文案里的默认助理名跟着用户自定义名字走（v0.9.75）
  const name = document.documentElement.dataset.assistantName || (lang === 'zh' ? '虾虾' : 'Xiaxia');
  if (name && name !== '虾虾') out = out.replace(/虾虾/g, () => name);
  if (name && name !== 'Xiaxia') out = out.replace(/Xiaxia/g, () => name);
  return out;
}

export function getLang() { return lang; }

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  const input = document.getElementById('input');
  if (input) input.placeholder = t('input.placeholder');
  // 模板里写死的中文也一起过一遍，并挂上监听，后续动态渲染的界面同样会被翻译
  try { translateDom(document.body); watchI18nDom(); } catch (_) {}
}

export function toggleLang() {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('minxtok.lang', lang); } catch (e) { /* 忽略 */ }
  // 语言切换给可见界面一层短促的淡入/轻微缩放，避免文字整块硬切
  const root = document.documentElement;
  root.classList.remove('lang-switching');
  void root.offsetWidth;
  root.classList.add('lang-switching');
  clearTimeout(toggleLang._t);
  toggleLang._t = setTimeout(() => root.classList.remove('lang-switching'), 280);
  applyI18n();
  document.documentElement.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  return lang;
}

/* ---------- 静态中文文案的英文兜底（v2.1） ----------
   很多模板直接写死中文，只靠 data-i18n 覆盖不到。这里在英文模式下
   对「纯静态」文本节点做一次精确替换：内容大段、公式、对话气泡一律跳过，
   切回中文时用保存的原文还原，不会破坏用户数据。 */
const ZH2EN = {
  '返回': 'Back', '取消': 'Cancel', '保存': 'Save', '删除': 'Delete', '删掉': 'Delete',
  '关闭': 'Close', '完成': 'Done', '下一步': 'Next', '上一步': 'Back', '确定': 'OK',
  '知道了': 'Got it', '重开': 'Restart', '开始': 'Start', '发送': 'Send', '搜索': 'Search',
  '充值': 'Top up', '学习': 'Study', '日记': 'Diary', '游戏': 'Games', '设置': 'Settings',
  '档案': 'Profile', '助理': 'Assistant', '关于': 'About', '对话': 'Chat', '历史': 'History',
  '历史记录': 'History', '新对话': 'New chat', '换场景': 'Change scene', '点开继续': 'Tap to resume',
  '加载中…': 'Loading…', '正在翻旧对话': 'Loading past chats', '这里还空着。': 'Nothing here yet.',
  '问过的问题，会一段段留在这里。': 'Your past questions will show up here.',
  '读不到历史，检查一下网络。': 'Cannot load history. Check your network.',
  '读不到，检查网络': 'Cannot load. Check your network', '还没存东西': 'Nothing saved yet',
  'AI 正在整理，稍等': 'AI is organizing, one moment', '重试': 'Retry',
  '加载失败，稍后再试。': 'Load failed, try again later.', '再试一次': 'Try again',
  '没生成出来，再试一次': 'Generation failed, try again', '没生成出来': 'Generation failed',
  '翻译': 'Translate', '解题': 'Solve', '练习': 'Practice', '错题本': 'Mistake book',
  '生词本': 'Word book', '场景应答': 'Scene reply', '作文指导': 'Writing coach',
  '整句整段，翻得像人话': 'Full sentences, natural output',
  '给步骤，几何函数自动配图': 'Step by step, with diagrams',
  '按知识点出题，默认五道': 'Quiz by topic, five by default',
  '把踩过的坑存下来': 'Keep the pitfalls you hit',
  '生词短语，随手记': 'Save words and phrases',
  '选个场景，直接和对方对话': 'Pick a scene and talk',
  '审题立意，给结构和开头': 'Ideas, structure and opening',
  '自定义': 'Custom', '＋ 自己写一个': '+ Write your own', '英文场景': 'English scenes',
  '中文场景': 'Chinese scenes', '自定义场景': 'Custom scene', '开始对话': 'Start',
  '5–50 字描述情境，越具体越入戏': 'Describe the scene in 5–50 chars',
  '点开继续': 'Tap to resume', '还没有日记，写下今天的第一句吧。': 'No diary yet. Write your first line.',
  '按意思搜': 'Search by meaning', '还没有搜过什么': 'No searches yet',
  '可以搜一句话、一个词，或者按情绪和时间筛。': 'Search a sentence, a word, or filter by mood and time.',
  '输入关键词，搜全网': 'Search the web', '没有找到相关内容': 'No results found', '搜索失败': 'Search failed',
  '联网结果会显示标题、站点和摘要。': 'Results show title, site and snippet.',
  '领取': 'Claim', '已领取': 'Claimed', '申请': 'Apply', '申请额度': 'Request quota',
  '兑换': 'Redeem', '兑换码': 'Redeem code', '额度到账': 'Quota added', '额度已到账': 'Quota added',
  '限时额度': 'Limited quota', '可用额度': 'Quota left', '今日剩余次数': 'Remaining today',
  '图片': 'Image', '文字': 'Text', '文字颜色': 'Text color', '高亮': 'Highlight',
  '粗体': 'Bold', '斜体': 'Italic', '下划线': 'Underline', '删除线': 'Strikethrough',
  '发送图片': 'Send image', '图片处理中…': 'Processing image…', '图片读不出来': 'Cannot read image',
  '正在搜索中…': 'Searching…', '图片文字已用OCR识别': 'Text recognized by OCR',
  '还没有战绩，玩一局就会记在这里。': 'No records yet. Play a round.',
  '最佳': 'Best', '已玩': 'Played', '局': 'games', '难度': 'Difficulty', '得分': 'Score',
  '下一块': 'Next piece', '步数': 'Moves', '配对': 'Match', '准备开始': 'Get ready',
  '插旗': 'Flag', '目标': 'Goal', '最高': 'Best', '五子棋': 'Gomoku', '井字棋': 'Tic-tac-toe',
  '你赢了': 'You win', '你输了': 'You lose', '平局': 'Draw', '你执黑，先手': 'You play black, first',
  '你执 X，先手': 'You play X, first', '点重开再来': 'Tap restart to play again',
  '点棋盘落子，横竖斜任意方向连成五子即胜': 'Tap to place. Five in a row wins.',
  '手指滑动，或用方向键移动': 'Swipe or use arrow keys', '三子连线获胜，AI 不会放水': 'Three in a row wins',
  '出关成功': 'Level clear', '上一局结束，得分': 'Last round score', '思考中…': 'Thinking…',
  '剩余 10 雷': '10 mines left', '显示追问': 'Show follow-ups', '正在搜索中…': 'Searching…',
  '删除': 'Delete', '重命名': 'Rename', '复制': 'Copy', '分享': 'Share',
  '引导资料': 'Onboarding', '重新填写引导': 'Edit onboarding', '重新进入': 'Open',
  '保留现有资料，改称呼、生日和兴趣': 'Keep your data, change name, birthday or interests',
  '退出登录': 'Sign out', '清空对话': 'Clear chat', '关于 MinxTok': 'About MinxTok',
  /* v3.1.3 补齐可见界面文案：页面标题、按钮、充值/设置常用项 */
  '页面说明': 'Page guide', '这一页': 'this page',
  '充值': 'Top up', '助理设置': 'Assistant', '场景应答': 'Scenarios', '学习': 'Study',
  '情绪中心': 'Mood center', '搜索': 'Search', '日记': 'Diary', '游戏': 'Games',
  '设置': 'Settings', '关于': 'About', '文章': 'Article', '详情': 'Details',
  '保存': 'Save', '取消': 'Cancel', '确定': 'OK', '重试': 'Retry', '刷新': 'Refresh',
  '返回': 'Back', '关闭': 'Close', '编辑': 'Edit', '提交': 'Submit', '继续': 'Continue',
  '重开': 'Restart', '再来一局': 'Play again', '下一关': 'Next level', '换一批': 'New set',
  '开始': 'Start', '跳过': 'Skip', '登录': 'Log in', '注册': 'Sign up', '获取验证码': 'Get code',
  '忘记密码': 'Forgot password', '进入': 'Enter', '准备中…': 'Preparing…', '加载中…': 'Loading…',
  '已复制': 'Copied', '字数': 'Words', '模型': 'Model', '主题': 'Theme', '字号': 'Text size',
  '可用次数': 'Uses left', '今日剩余次数': 'Left today', '限时额度': 'Bonus quota', '申请额度': 'Request quota',
  '兑换码': 'Redeem code', '输入兑换码': 'Enter code', '自定义次数': 'Custom amount',
  '理由（可选）': 'Reason (optional)', '服务暂停中': 'Service paused', '待发送图片': 'Image to send',
  '对话': 'Chat', '档案': 'Archive', '助理': 'Assistant',
  '兑换中…': 'Redeeming…',
  '先选个数量': 'Pick an amount',
  '兑换失败，网络不通': 'Redeem failed, network is down',
  '兑换数量': 'Quantity',
  '兑换额度': 'Redeem quota',
  '已保存': 'Saved',
  '确认兑换': 'Confirm redeem',
  '保存并退出': 'Save & exit',
  '已暂停': 'Paused',
  '重新开始': 'Restart',
  '你的助理 · 改动保存后即时生效': 'Your assistant · changes apply on save',
  '保存中…': 'Saving…',
  '保存失败，稍后再试': 'Save failed, try again later',
  '再想想': 'Not yet',
  '助理名字': 'Assistant name',
  '助理形象': 'Assistant look',
  '助理日记': 'Assistant journal',
  '助理记忆': 'Assistant memory',
  '基础资料': 'Basics',
  '它还没写。等你们聊得够多，它会自己记一篇。': 'Nothing yet. Once you talk enough, it writes one itself.',
  '就这样': 'That is it',
  '性格': 'Personality',
  '我的名字': 'My name',
  '我的简介': 'About me',
  '点预设会覆盖下面的滑块': 'Presets overwrite the sliders below',
  '学分': 'Credits',
  '学分不够': 'Not enough credits',
  '下一步 · 挑老师': 'Next · pick a teacher',
  '举个例子': 'For example',
  '先选一册教材。': 'Pick a textbook first.',
  '再捏一个不同风格的老师': 'Create another teacher with a different style',
  '学段': 'Stage',
  '已选': 'Selected',
  '年级': 'Grade',
  '开始上课': 'Start class',
  '教材': 'Textbook',
  '整章': 'Whole chapter',
  '新增老师': 'New teacher',
  '正在按教材拆小节…': 'Splitting the chapter…',
  '没拆出来，重试': 'Could not split, retry',
  '科目': 'Subject',
  '继续讲': 'Continue', '换个说法': 'Say it simpler', '总结这节': 'Recap it',
  '再难一点': 'Go deeper', '考点梳理': 'Exam points',

  // 5.3.2：充值页 / 学分兑换页以前整页还是中文，这里补齐
  '当前账号': 'this account', '充值到账': 'Payment received', '兑换成功': 'Redeemed',
  '兑换码不存在': 'Code not found', '已用完': 'Used up', '兑换失败': 'Redeem failed',
  '今天已经换满 20 次了': 'Daily limit reached for today', '兑换失败，稍后再试': 'Redeem failed, try again later',
  '上下滑动选择数量': 'Swipe to pick an amount',
  '积分不够，先玩会儿游戏攒分': 'Not enough points — play a round first',
  '学分不够，先去上课或者刷题攒一攒': 'Not enough credits — take a class or drill first',
  '200 学分换 1 点额度，每天最多换 20 点。换到的额度优先消耗，用不完一直留着，也不会抬高每日上限':
    '200 credits per credit, max 20 a day. Redeemed credits are spent first and never expire.',
  '600 分换 1 点额度，每天最多换 20 点。换到的额度优先消耗，用不完一直留着，也不会抬高每日上限':
    '600 points per credit, max 20 a day. Redeemed credits are spent first and never expire.',
  '200 学分 → 1 点额度': '200 credits → 1 credit', '600 分 → 1 点额度': '600 points → 1 credit',
  '学习学分': 'Study credits', '兑换池': 'Redemption pool',
  '退出会存下进度，回来接着打': 'Progress is saved — pick it up later',
  'AI 分析': 'AI analysis', '本局积分': 'Round points',
  '60 秒内连答，答对越快分越高，连击不断还有加成；答错扣 3 秒，五星会混进冷知识':
    '60 seconds, answer fast for more points, keep the streak for a bonus; a wrong answer costs 3s',
  '已存入积分': 'Points banked',
  '考考我': 'Quiz me',
  '跟谁学': 'Choose a teacher',
  '这个学段暂时没有收录，换一个看看。': 'Nothing for this stage yet, try another.',
  '这章没拆出小节，先按整章讲': 'No sections found, teaching the whole chapter',
  '退出': 'Exit',

  // 5.3.3：新增老师（自定义老师）改成刷题引导版式后，题面和选项也补上英文
  '先给这位老师起个名字': 'Name this teacher',
  '学生怎么称呼他，都由你定。': 'Whatever your student should call them.',
  '你想要什么性格': 'What personality fits',
  '选一个最像的，语气和用词都会跟着变。': 'Pick the closest one; tone and wording follow it.',
  '讲课节奏呢': 'What pace works',
  '听不懂时他会多停一会儿。': 'They slow down when something does not land.',
  '这位老师怎么称呼你': 'How should they address you',
  '直接叫「你」也可以。': 'Plain "you" is fine too.',
  '还有什么特别要求': 'Anything else to add',
  '不说就跳过，之后也能换老师。': 'Skip it if you like; you can switch teachers later.',
  '温柔鼓励': 'Warm', '严厉高效': 'Strict', '幽默风趣': 'Playful', '冷静严谨': 'Precise',
  '讲快一点': 'Faster', '正常就行': 'Normal', '讲慢一点，我怕跟不上': 'Slower',
  '比如：老周、安然老师': 'e.g. Mr. Zhou, Ms. An',
  '比如：多讲例题、少说废话': 'e.g. more worked examples, less filler',
  '名字': 'Name', '性格': 'Tone', '节奏': 'Pace', '称呼': 'Address', '补充': 'Notes',

  // 5.5.0：日记页 + 重要提示抽屉
  '今天想记点什么': 'What happened today',
  '了解': 'Got it',
  '充值到账': 'Top-up received',
  '额度': 'credits',
  '额度已到账，可立即使用': 'Credits are in and ready to use',
  '可以去「充值」里充值或兑换，也可以等明天每日额度自动恢复。': 'Top up or redeem in Recharge, or wait for tomorrow reset.',
  '充值账户': 'Account',
  '充值额度': 'Amount',
  '充值时间': 'Time',
  '订单编号': 'Order ID',
  '支付状态': 'Status',
  '已支付': 'Paid',
  '发现新版本': 'New version available',
  '新版本已发布，重新进入即可加载': 'A new build is out. Reopen to load it.',
  '当前版本': 'Current',
  '最新版本': 'Latest',
  '更新内容': 'What is new',
  '额度快用完了': 'Running low on credits',
  '点击下方按钮重新进入，加载完成后继续使用。': 'Tap the button below to reopen and finish loading.',
  '已失效': 'Expired',
  '今日': 'Today',

  '选一个字母': 'Pick a letter',
  '选完章节再挑小节。': 'Pick a chapter, then a section.',
  '量身定做': 'Custom teacher',
  '上一题': 'Previous',
  '下一题': 'Next',
  '不会': 'No idea',
  '不定项：正确项 1–3 个，可能只有一项对': 'Multiple answer: 1–3 correct options',
  '你答': 'Your answer',
  '再来一组': 'Another set',
  '准备中': 'Preparing',
  '出题失败': 'Could not build the set',
  '刷题': 'Drills',
  '加入错题本': 'Add to mistakes',
  '去学习': 'Study',
  '去学习这一章': 'Study this chapter',
  '存错题本': 'Save to mistakes',
  '已分析': 'Analysed',
  '已加入错题本': 'Added to mistakes',
  '已加入错题本，学习中心 · 错题本可以看': 'Added to mistakes, see Study · Mistakes',
  '已存好': 'Saved',
  '开始出题': 'Build a set',
  '待开始': 'Not started',
  '换范围': 'Change scope',
  '收起': 'Collapse',
  '易错': 'Tricky',
  '未学': 'Not learned',
  '未定球': 'Not decided',
  '本组完成': 'Set complete',
  '正在出题': 'Building questions',
  '正在拆这一章的小节，大概两三秒': 'Splitting the chapter, about two seconds',
  '正确': 'Correct',
  '错误': 'Wrong',
  '没存上，再点一次': 'Not saved, tap again',
  '没有错题，这组很稳。': 'No mistakes, solid set.',
  '继续刷': 'Keep drilling',
  '老师在看题…': 'The teacher is reading…',
  '老师详解': 'Teacher walk-through',
  '老师这题没讲出来，换一位再试。': 'The teacher stalled, try another one.',
  '至少留一个题型': 'Keep at least one type',
  '节奏': 'Pace',
  '范围': 'Scope',
  '解析': 'Explanation',
  '题型': 'Question type',
  '详解 · 让 AI 拆开讲': 'Walk-through · let the AI unpack it',
  '详解没连上，再点一次。': 'Walk-through failed, tap again.',
  '进入对话，接着问老师': 'Open the chat and keep asking',
  '进度已存': 'Progress saved',
  '退出会存下进度，回来接着刷': 'Progress saves on exit',
  '重开一轮': 'Restart set',
  '这次没出成': 'That attempt failed',
  '分析中': 'Analysing',
  '课程': 'Courses',
  'AI 思考中…': 'AI thinking…',
  'AI 赢了': 'AI wins',
  'AI 连成五子，你输了': 'AI got five in a row, you lose',
  '买起爆器': 'Buy a detonator',
  '五子连珠，你赢了': 'Five in a row, you win',
  '会炸毁': 'Will be destroyed',
  '低噪装药': 'Low-noise charge',
  '低震泡沫': 'Low-shock foam',
  '你': 'You',
  '你执黑，先行': 'You play black, first',
  '先把空列填上再发牌': 'Fill the empty columns first',
  '全部击毙': 'All cleared',
  '分数': 'Score',
  '分留到下一局': 'points carry to the next round',
  '化学炸药': 'Chemical charge',
  '去游戏中心兑换额度': 'Redeem quota in Games',
  '发牌': 'Deal',
  '受损，虚线为影响范围；': 'Damaged, dashed line shows blast range',
  '同花顺子才能一起搬': 'Only runs of the same suit move together',
  '和棋': 'Draw',
  '复活后从原地继续，三次用完就只能重开': 'Revive where you died, three revives max',
  '大型聚能': 'Large charge',
  '头目回血，并召唤了两名援军': 'The boss healed and summoned two guards',
  '定向爆破': 'Precision blast',
  '小炸药': 'Small charge',
  '已备起爆器': 'Detonator ready',
  '已恢复上次的牌局': 'Last deal restored',
  '已恢复上次的进度': 'Last progress restored',
  '开始游戏': 'Start game',
  '总积分': 'Total points',
  '手雷 ×2': 'Grenades ×2',
  '扣积分中…': 'Deducting points…',
  '拖屏幕移动，自动瞄准开火；空格/按钮扔手雷': 'Drag to move, auto-aim fires; use the button to throw grenades',
  '撤销': 'Undo',
  '操作': 'Actions',
  '时间到': 'Time is up',
  '暂停': 'Pause',
  '最大': 'Max',
  '清运比例': 'Clearance ratio',
  '温压弹': 'Thermobaric bomb',
  '炸药库': 'Charge store',
  '点在要拆的结构上': 'Tap the structure to blast',
  '点开始，问就是秒答': 'Tap start, answers come instantly',
  '皮肤': 'Skin',
  '盔甲': 'Armour',
  '积分不够': 'Not enough points',
  '积分不够复活': 'Not enough points to revive',
  '积分不够解锁皮肤': 'Not enough points for this skin',
  '管线碰不得，': 'Do not cut the pipes,',
  '精密切割': 'Precision cut',
  '精密小药': 'Precision charge',
  '组数': 'Sets',
  '结算验收': 'Settlement review',
  '继续上次': 'Continue',
  '装备': 'Gear',
  '装好后按': 'When ready, press',
  '装好药按起爆': 'Charge set, press detonate',
  '装药后：': 'After charging:',
  '起爆': 'Detonate',
  '起爆器': 'Detonator',
  '轮到你了': 'Your turn',
  '边界缓冲，快转向': 'Edge buffer, turn early',
  '这是要保的邻居，别在它身上装药': 'Neighbour to protect, do not charge it',
  '这段是管线，装上去就是炸断': 'This is a pipe, charging it cuts it',
  '这里不能落子': 'You cannot place here',
  '退最后一处': 'Undo last',
  '邻近建筑怕冲击波': 'Nearby buildings fear the shockwave',
  '重开一局': 'Restart',
  '队友': 'Teammate',
  '高能炸药': 'High explosive',
  '预算不够买起爆器': 'Not enough budget for a detonator',
  '预算不够付清运，降一点比例': 'Not enough budget for clearance, lower the ratio',
  '预算不够做降尘': 'Not enough budget for dust control',
  '虚手': 'Free hand',
  '为': 'for',
  '充值 ·': 'Top up ·',
  '充值码生成失败，点击重试': 'Could not create the top-up code. Tap to retry',
  '先填兑换码': 'Enter a code first',
  '双指缩放 · 拖动查看': 'Pinch to zoom · drag to pan',
  '图片理解中…': 'Reading the image…',
  '已过期': 'Expired',
  '我已保存': 'I have saved it',
  '请将充值码截图发送给管理员，由其完成入账': 'Send a screenshot of this code to the admin to complete the top-up',
  '正在生成充值码': 'Creating top-up code',
  '正在生成充值码…': 'Creating top-up code',
  '拆开中…': 'Unpacking…',
  '支付时间': 'Paid at',
  '支付流水号': 'Transaction ID',
  '文章没取到，稍后再试。': 'Could not load the article, try later.',
  '正在生成充值码…': 'Creating a top-up code…',
  '稍后再试一次。': 'Try again in a moment.',
  '聊几句就会有': 'It appears after a few chats',
  '还没开始': 'Not started yet',
  '这条太早了，往上翻翻看': 'That is the very first one, scroll up',
  '重新生成': 'Regenerate',
  '小提示': 'Tip',
  '你和一个 AI 队友守五波，第 3 波小头目、第 5 波大头目': 'You and one AI teammate hold five waves; a mini-boss on wave 3, the big one on wave 5',
  '你和一个 AI 队友并肩作战，每波清完弹出补给商店：装备、盔甲、队友、皮肤都能买。积分存档在游戏中心，兑换额度也在那边': 'Fight with an AI teammate; after each wave a supply shop opens for gear, armour, teammates and skins. Points are saved in Games, where you can also redeem quota',
  '写清楚「谁、在哪、要谈什么」，比如：向室友开口，让他别再半夜打游戏。': 'Be specific about who, where and what, e.g. asking a roommate to stop gaming at midnight.',
  '吃豆变长；撞墙前有短暂缓冲，快速转向可以救回来，撞到自己直接结束': 'Eat to grow; walls give a brief buffer so a quick turn saves you, but hitting yourself ends it',
  '在球道上按住选起点，向上滑得越远力量越大，左右滑动带旋转。五帧，每帧两球；第一球全中直接进下一帧，第二球只补剩下的瓶': 'Press on the lane to set the start, slide up for power, slide sideways for spin. Five frames, two balls each; a strike skips to the next frame',
  '小学到高中按章节选课，挑一位合拍的老师给你讲': 'Pick a chapter from primary to high school, then a teacher who suits you',
  '左右拖动接球；接住金色道具会分裂出 2–4 个球，先到目标分获胜': 'Drag sideways to catch; gold items split into two to four balls. First to the target score wins',
  '按在画面上拖出摇杆走迷宫，松手就停；红圆点是龙虾，绿色「出」是出口。路上捡到的东西自己试试就知道，熄灯只黑一两秒': 'Drag anywhere for a joystick, release to stop; the red dot is the lobster, the green 出 is the exit. Lights go out for a second or two',
  '按学科和年级出题，选择 · 判断 · 填空，带倒计时': 'Questions by subject and grade: multiple choice, true or false, fill in the blanks, with a timer',
  '按画面推摇杆：向上跳，向下滑。柱子能踩上去，侧面撞上就被顶出跑道；地上的按钮一踩，顶上尖刺会跟着你砸下来，落稳了再跳过去': 'Push the stick to jump and slide. Land on pillars, not their sides; stepping on a button drops the spikes above, so land firm then jump',
  '棋盘在左，右列上面是下一块预览；下面两排按键左移、右移 / 下移、旋转，最底下一整条是落底': 'Board on the left, next piece on the upper right; the two rows move left and right or down and rotate, the bottom bar drops it',
  '点一张牌选中它和下面的顺子，再点目标列放下；只能压在比它大一点的牌上，空列随便放。同花从 K 排到 A 会自动收走，八组收完就赢': 'Tap a card to pick up it and the run below, tap a column to drop. Only onto one rank higher, freely into an empty column. K to A in a suit clears itself; eight runs wins',
  '点交叉点落子；把对方的气堵光就能提子，双方连续虚手即终局按围空计分': 'Tap intersections; take stones by filling their liberties. Two passes in a row ends the game and area is counted',
  '点格子挖开，点“插旗”切换标记；难度越高棋盘越大、雷也越多': 'Tap to dig, tap flag to mark; higher difficulty means a bigger board and more mines',
  '点空格旁边的数字，或按方向键/滑动，把 1 到 N 按顺序排好': 'Tap the number next to the gap, or use keys and swipes, to put 1 to N in order',
  '翻开两张相同的食物牌，全部配对即完成；难度越高牌越多': 'Flip two matching food cards; clear them all. Higher difficulty means more cards',
  '输入关键词或情绪（比如「开心」），也可以直接点上面的筛选条件。': 'Type a keyword or mood such as happy, or tap the filters above.',
  '这些是后面课程才讲到的点，先记下，等老师讲的时候留意一下。': 'These come up later in the course; note them and watch for them in class.',
  '这十组码只显示一次，抄下来或截图存好。忘记密码时，任意一组可以重设密码。': 'These ten codes show only once; write them down or screenshot them. Any one of them can reset a forgotten password.',
};
const SKIP_SEL = '.msg, .text, .math, .study-ai-text, .dict-pop, pre, code, script, style, textarea, .md-h1, .md-h2, .md-h3';
const ZH_RE = /[\u4e00-\u9fa5]/;

// 带数字的句子没法整句查表，这里按模式转，免得英文模式里冒出一堆中文数字句
const ZH_PATTERNS = [
  [/^得分\s*(\d+)$/, 'Score $1'],
  [/^总分\s*(\d+)$/, 'Total $1'],
  [/^总积分\s*(\d+)$/, 'Total $1'],
  [/^本局积分\s*(\d+)$/, 'Points $1'],
  [/^已答\s*(\d+)\s*题$/, 'Answered $1'],
  [/^第\s*(\d+(?:\/\d+)?)\s*题$/, 'Q$1'],
  [/^还剩\s*(\d+)\s*次$/, '$1 left'],
  [/^还能发\s*(\d+)\s*次$/, '$1 sends left'],
  [/^生命\s*(\d+)$/, 'Lives $1'],
  [/^分数\s*(\d+)$/, 'Score $1'],
  [/^组数\s*(\d+)$/, 'Sets $1'],
  [/^第\s*(\d+)\s*组$/, 'Set $1'],
  [/^手雷\s*×\s*(\d+)$/, 'Grenades ×$1'],
  [/^考考我（(\d+)\/(\d+)）$/, 'Quiz me ($1/$2)'],
  // 充值页 / 兑换弹窗里的带数字句子
  [/^可用额度 · 每日额度 (\d+)\/(\d+)$/, 'Credits left · daily $1/$2'],
  [/^可用额度 · 每日 (\d+)\/(\d+)$/, 'Credits left · daily $1/$2'],
  [/^兑换额度 (\d+) · 优先扣减，长期有效$/, 'Redeemed $1 · spent first, never expires'],
  [/^充值账户 (.+) · 有效期剩余 (\d+) 分 (\d+) 秒$/, 'Account $1 · valid for $2m $3s'],
  [/^充值账户 (.+) · 已失效$/, 'Account $1 · expired'],
  [/^有效期剩余 (\d+) 分 (\d+) 秒$/, 'Valid for $1m $2s'],
  [/^有效期剩余 (\d+) 秒$/, 'Valid for $1s'],
  [/^(\d{4}-\d{2}-\d{2}) · 今天$/, '$1 · Today'],
  [/^(\d{4}-\d{2}-\d{2}) · 昨天$/, '$1 · Yesterday'],
  [/^现在还能用的只剩 (\d+) 额度了。$/, 'Only $1 credits left.'],
  [/^现在还能用的只剩 (\d+) 额度了。.+$/, 'Only $1 credits left.'],
  [/^(\d+) \/ (\d+) · 名字$/, '$1 / $2 · Name'],
  [/^(\d+) \/ (\d+) · 性格$/, '$1 / $2 · Tone'],
  [/^(\d+) \/ (\d+) · 节奏$/, '$1 / $2 · Pace'],
  [/^(\d+) \/ (\d+) · 称呼$/, '$1 / $2 · Address'],
  [/^(\d+) \/ (\d+) · 补充$/, '$1 / $2 · Notes'],
  [/^其中兑换额度 (\d+)（先用这个，用不完一直留着）$/, 'incl. $1 redeemed (spent first, never expires)'],
  [/^兑换额度 · 剩 (\d+)$/, 'Redeemed · $1 left'],
  [/^限时额度 · 共 (\d+)$/, 'Limited-time · $1 total'],
  [/^· 剩 (\d+)$/, '· $1 left'],
  [/^剩 (\d+) 天 (\d+) 小时 · (.+) 到期$/, '$1d $2h left · expires $3'],
  [/^剩 (\d+) 小时 · (.+) 到期$/, '$1h left · expires $2'],
  [/^剩 (\d+) 分钟$/, '$1 min left'],
  [/^重新生成（(\d+)s）$/, 'Regenerate ($1s)'],
  [/^已兑换 (\d+) 点额度$/, 'Redeemed $1 credit'],
  [/^已兑换 (\d+) 点额度，兑换池还剩 (\d+) 点$/, 'Redeemed $1 credit · $2 left in pool'],
  [/^当前 (\d+) 分，最多可换 (\d+) 点额度（(\d+) 分换 1 点，每天最多 (\d+) 次）$/,
    'Balance $1 pts · up to $2 credits ($3 pts each, $4/day)'],
  [/^当前 (\d+) 分，还差 (\d+) 分才能换 1 点额度$/, 'Balance $1 pts · $2 more for 1 credit'],
  [/^当前 (\d+) 学分，最多能换 (\d+) 点额度。$/, 'Balance $1 credits · up to $2 usable.'],
  [/^(\d+) 学分 → (\d+) 点额度$/, '$1 credits → $2 credit'],
  [/^(\d+) 分 → (\d+) 点额度$/, '$1 pts → $2 credit'],
  [/^(.+?) \+(\d+) 学分$/, '$1 +$2 credits'],
  // 游戏 HUD 的常见组合行
  [/^连击 (\d+) · 答对 (\d+) · 答错 (\d+)$/, 'Streak $1 · $2 right · $3 wrong'],
  [/^第 (\d+)\/(\d+) 波 · 积分 (\d+)$/, 'Wave $1/$2 · $3 pts'],
  [/^步数 (\d+) · (\d+)×(\d+)$/, 'Moves $1 · $2×$3'],
  [/^(\d+) 秒 · (\d+) 分$/, '$1s · $2 pts'],
  [/^第 (\d+) 帧 · 第 (\d+) 球$/, 'Frame $1 · ball $2'],
];
function enFor(raw) {
  const key = String(raw).trim();
  if (!key || key.length > 100) return null;
  if (ZH2EN[key]) return ZH2EN[key];
  for (const [re, rep] of ZH_PATTERNS) {
    if (re.test(key)) return key.replace(re, rep);
  }
  return null;
}

// 倒计时这类每秒 textContent 直接刷的文本：等 MutationObserver 的 60ms 去翻，
// 中间那一帧就是中文，看着像"闪一下中文"。给调用方一个同步翻译的入口。
export function trText(zh) {
  if (lang !== 'en') return zh;
  const en = enFor(zh);
  return en || zh;
}

export function setTrText(node, zh) {
  if (!node) return;
  if (lang === 'en') {
    const en = enFor(zh);
    node.textContent = en || zh;
    node.__zh = en ? zh : null;   // 记下原文，切回中文时能还原
  } else {
    node.textContent = zh;
    node.__zh = null;
  }
}

function translateNode(node) {
  const raw = node.nodeValue;
  if (!raw || !ZH_RE.test(raw)) return;
  // 同一个节点会被反复改写（分数、倒计时、进度都是 textContent 直接刷的），
  // 所以按「这段原文译过没有」判断，而不是「这个节点译过没有」，
  // 否则第二次更新就又冒出中文。
  if (node.__zh === raw) return;
  const en = enFor(raw);
  if (!en) return;
  node.__zh = raw;
  node.nodeValue = raw.replace(raw.trim(), en);
}

function translateAttrs(el) {
  ['placeholder', 'aria-label', 'title'].forEach((attr) => {
    const v = el.getAttribute(attr);
    if (!v || !ZH_RE.test(v)) return;
    if (!el.__zhAttr) el.__zhAttr = {};
    if (el.__zhAttr[attr] == null) {
      const en = enFor(v);
      if (!en) return;
      el.__zhAttr[attr] = v;
      el.setAttribute(attr, en);
    }
  });
}

export function translateDom(root = document.body) {
  if (!root) return;
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  if (lang === 'en') {
    nodes.forEach(translateNode);
    root.querySelectorAll?.('[placeholder], [aria-label], [title]').forEach(translateAttrs);
  } else {
    // 切回中文：把之前替换过的节点按原文还原
    nodes.forEach((n) => { if (n.__zh != null) { n.nodeValue = n.__zh; n.__zh = null; } });
    root.querySelectorAll?.('[placeholder], [aria-label], [title]').forEach((el) => {
      if (!el.__zhAttr) return;
      Object.keys(el.__zhAttr).forEach((k) => el.setAttribute(k, el.__zhAttr[k]));
      el.__zhAttr = null;
    });
  }
}

let domObserver = null;
export function watchI18nDom() {
  if (domObserver || typeof MutationObserver === 'undefined') return;
  let timer = null;
  // 只翻改动过的那一小块。以前每次都是整页重走一遍 TreeWalker，
  // 流式打字时每秒十几次全量遍历，主线程就被这件事吃掉了（掉帧元凶之一）。
  let dirty = new Set();
  domObserver = new MutationObserver((records) => {
    if (lang !== 'en') return;
    for (const r of records) {
      if (r.type === 'characterData') { if (r.target.parentElement) dirty.add(r.target.parentElement); continue; }
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) dirty.add(n);
        else if (n.nodeType === 3 && n.parentElement) dirty.add(n.parentElement);
      }
      if (r.type === 'attributes' && r.target.nodeType === 1) dirty.add(r.target);
    }
    if (!dirty.size || timer) return;
    timer = setTimeout(() => {
      timer = null;
      const roots = dirty;
      dirty = new Set();
      for (const el of roots) if (el.isConnected) translateDom(el);
    }, 60);
  });
  domObserver.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'],
  });
}
