// 助理设置页：资料、性格滑块、助理日记
import { openPage, fillPage, pageLoading, openModal, closeModal, toast, escapeHtml } from './ui.js?v=150';
import { state } from './state.js?v=12';
import { haptic } from './haptics.js?v=12';

const TRAITS = [
  ['sentence', '句子长度', '短句', '展开'],
  ['sweet', '嘴甜程度', '高冷', '嘴甜'],
  ['bossy', '霸道程度', '随和', '强势'],
  ['humor', '幽默程度', '正经', '搞笑'],
  ['sharp', '毒舌程度', '温和', '毒舌'],
  ['emoji', 'Emoji 数量', '少', '多'],
  ['tone', '语气词数量', '少', '多'],
];

const PRESETS = {
  hard: { label: '雷厉风行', traits: { sentence: 20, sweet: 25, bossy: 80, humor: 25, sharp: 55, emoji: 10, tone: 10 } },
  gentle: { label: '温文尔雅', traits: { sentence: 55, sweet: 80, bossy: 10, humor: 40, sharp: 5, emoji: 25, tone: 45 } },
  funny: { label: '风趣幽默', traits: { sentence: 45, sweet: 55, bossy: 25, humor: 95, sharp: 45, emoji: 55, tone: 55 } },
  cold: { label: '冷酷无情', traits: { sentence: 25, sweet: 5, bossy: 65, humor: 5, sharp: 95, emoji: 5, tone: 5 } },
};

const DEFAULTS = {
  name: '虾虾',
  userName: '',
  userBio: '',
  memory: '',
  persona: '一个温暖、灵动、会卖萌的助理',
  traits: { sentence: 45, sweet: 60, bossy: 25, humor: 55, sharp: 20, emoji: 40, tone: 40 },
};

let current = null;
let saving = false;
function vibrate(ms = 8) {
  haptic(ms);
}

function assistantName() {
  return document.documentElement.dataset.assistantName || DEFAULTS.name;
}

function applyIdentity(s) {
  const name = (s && s.name) || DEFAULTS.name;
  document.documentElement.dataset.assistantName = name;
  state.assistant = s || null;
  // 已经渲染在聊天里的旧消息也一起改名，不能只影响之后的新消息
  document.querySelectorAll('.who-name').forEach(el => { el.textContent = name; });
  const input = document.getElementById('input');
  if (input && (!input.value || /说点什么$/.test(input.placeholder || ''))) {
    input.placeholder = `和${name}说点什么`;
  }
}

export async function syncAssistantIdentity() {
  if (!state.uid) return;
  try {
    const r = await fetch(`/api/assistant?uid=${encodeURIComponent(state.uid)}`);
    const d = await r.json();
    if (d && d.settings) applyIdentity(d.settings);
  } catch (_) {}
}

function fmtTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function diaryWhen(x) {
  const ts = Number(x.created_at) || 0;
  if (x.period === 'week') return '最近';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(new Date());
  const day = startOf(new Date(ts));
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return `${diff} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

function diariesHtml(list) {
  if (!list || !list.length) {
    return '<div class="as-empty">它还没写。等你们聊得够多，它会自己记一篇。</div>';
  }
  return list.map(x => `
    <article class="as-diary">
      <div class="as-diary-meta">
        <span class="as-diary-when">${diaryWhen(x)}</span>
        <span class="as-diary-time">${fmtTime(x.created_at)}</span>
      </div>
      <div class="as-diary-text">${escapeHtml(x.content || '')}</div>
    </article>`).join('');
}

function pageHtml(s, diaries) {
  const traits = Object.assign({}, DEFAULTS.traits, s.traits || {});
  const slider = ([key, label, low, high]) => `
    <div class="as-slider" data-slider="${key}">
      <div class="as-slider-head">
        <span>${label}</span>
        <b data-val="${key}">${traits[key]}</b>
      </div>
      <input type="range" min="0" max="100" step="1" value="${traits[key]}" data-trait="${key}" aria-label="${label}" style="--p:${traits[key]}%">
      <div class="as-slider-ends"><span>${low}</span><span>${high}</span></div>
    </div>`;

  return `
    <div class="as-hero">
      <div class="as-hero-name" id="asHeroName">${escapeHtml(s.name || DEFAULTS.name)}</div>
      <div class="as-hero-sub">你的助理 · 改动保存后即时生效</div>
    </div>

    <div class="group">
      <div class="group-title">基础资料</div>
      <div class="panel">
        <div class="as-field">
          <label for="asName">助理名字</label>
          <input id="asName" class="as-input" maxlength="20" value="${escapeHtml(s.name || '')}" placeholder="虾虾">
        </div>
        <div class="as-field">
          <label for="asUserName">我的名字</label>
          <input id="asUserName" class="as-input" maxlength="20" value="${escapeHtml(s.userName || '')}" placeholder="留空就叫「你」">
        </div>
        <div class="as-field">
          <label for="asUserBio">我的简介</label>
          <textarea id="asUserBio" class="as-input as-area" rows="2" maxlength="500" placeholder="让它知道你是谁、在做什么">${escapeHtml(s.userBio || '')}</textarea>
        </div>
        <div class="as-field">
          <label for="asPersona">助理形象</label>
          <textarea id="asPersona" class="as-input as-area" rows="2" maxlength="120" placeholder="一个……的助理">${escapeHtml(s.persona || '')}</textarea>
        </div>
        <div class="as-field">
          <label for="asMemory">助理记忆</label>
          <textarea id="asMemory" class="as-input as-area" rows="4" maxlength="2000" placeholder="它会一直记得的事，比如你的偏好、正在做的事">${escapeHtml(s.memory || '')}</textarea>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="group-title">性格</div>
      <div class="panel as-panel-pad">
        <div class="as-presets">
          ${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="as-preset" data-preset="${k}">${p.label}</button>`).join('')}
        </div>
        <div class="as-preset-tip">点预设会覆盖下面的滑块</div>
        <div class="as-preview" id="asPreview"></div>
        <div class="as-sliders">${TRAITS.map(slider).join('')}</div>
      </div>
    </div>

    <div class="group">
      <div class="group-title">助理日记</div>
      <div class="panel as-panel-pad as-diaries">${diariesHtml(diaries)}</div>
    </div>

    <button class="btn m-press as-save" id="asSave" type="button">保存</button>
  `;
}

function readForm() {
  const val = (id, max) => {
    const el = document.getElementById(id);
    return (el ? el.value : '').replace(/\u0000/g, '').trim().slice(0, max);
  };
  const traits = {};
  document.querySelectorAll('input[data-trait]').forEach(el => {
    traits[el.dataset.trait] = Math.max(0, Math.min(100, Number(el.value) || 0));
  });
  return {
    uid: state.uid,
    name: val('asName', 20) || DEFAULTS.name,
    userName: val('asUserName', 20),
    userBio: val('asUserBio', 500),
    memory: val('asMemory', 2000),
    persona: val('asPersona', 120) || DEFAULTS.persona,
    traits,
  };
}

async function saveAssistant(confirmed) {
  if (saving) return;
  const data = readForm();
  if (!confirmed && data.traits.sharp >= 80) {
    openModal({
      title: '可能有点冒犯',
      body: `
        <div class="as-warn">毒舌拉到 ${data.traits.sharp}，它说话可能会扎人。不是不让，只是提醒你一句。</div>
        <div class="as-warn-actions">
          <button class="btn ghost" id="asWarnCancel" type="button">再想想</button>
          <button class="btn" id="asWarnOk" type="button">就这样</button>
        </div>`,
    });
    requestAnimationFrame(() => {
      const cancel = document.getElementById('asWarnCancel');
      const ok = document.getElementById('asWarnOk');
      if (cancel) cancel.addEventListener('click', () => closeModal());
      if (ok) ok.addEventListener('click', () => { closeModal(); saveAssistant(true); });
    });
    return;
  }

  saving = true;
  const btn = document.getElementById('asSave');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new Error(d.error || 'save_failed');
    applyIdentity(d.settings || data);
    const hero = document.getElementById('asHeroName');
    if (hero) hero.textContent = data.name;
    toast('已保存');
  } catch (_) {
    toast('保存失败，稍后再试');
  } finally {
    saving = false;
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  }
}

function currentTraits() {
  const out = {};
  document.querySelectorAll('input[data-trait]').forEach(el => {
    out[el.dataset.trait] = Math.max(0, Math.min(100, Number(el.value) || 0));
  });
  return out;
}

function band6(v) {
  const n = Math.max(0, Math.min(100, Number(v) || 0));
  return Math.min(5, Math.floor(n / 100 * 6));
}

function nameEmoji(name) {
  const n = String(name || '');
  if (/虾/.test(n)) return '🦞';
  if (/猫/.test(n)) return '🐈';
  if (/兔/.test(n)) return '🐰';
  if (/狐/.test(n)) return '🦊';
  if (/狗|犬/.test(n)) return '🐶';
  if (/熊/.test(n)) return '🐻';
  if (/鸟|雀|鸽/.test(n)) return '🐦';
  if (/鱼/.test(n)) return '🐟';
  return '';
}

function emojiFor(index, name) {
  const mascot = nameEmoji(name);
  if (!mascot) return ['', '☕', '🍵', '✨', '☕✨', '🍵✨'][index];
  return ['', mascot, '☕', mascot + '✨', '☕✨', '🍵✨'][index];
}

function chatSample(traits, name) {
  const t = Object.assign({}, DEFAULTS.traits, traits || {});
  const iS = band6(t.sentence), iSweet = band6(t.sweet), iBossy = band6(t.bossy);
  const iHumor = band6(t.humor), iSharp = band6(t.sharp), iEmoji = band6(t.emoji), iTone = band6(t.tone);

  const greeting = `回来啦${emojiFor(iEmoji, name)}，`;

  const humor = [
    '',
    '今天看着还行',
    '看你这脸色，今天挺折腾',
    '看你这脸色，像刚打完一场仗',
    '看你这脸色，像被生活按在地上摩擦过',
    '看你这脸色，像刚打完一场硬仗，还输了',
  ][iHumor];
  const sharp = [
    '',
    '今天辛苦了。',
    '今天没出什么岔子吧？',
    '今天又是谁惹你了？',
    '又碰上什么糟心事了？',
    '别摆臭脸，谁又欠你了？',
  ][iSharp];
  let remark = '';
  if (humor && sharp) remark = `${humor}，${sharp}`;
  else if (humor) remark = `${humor}。`;
  else if (sharp) remark = sharp;

  const invite = [
    '想说什么就说，',
    '想说什么就跟我说说，',
    '要不跟我说说今天的事，',
    '跟我说说今天怎么回事，',
    '坐下，跟我讲讲今天怎么回事，',
    '坐下，把今天的事从头说一遍，',
  ][iBossy];

  const care = [
    '水在桌上，自己倒',
    '水在桌上，自己拿',
    '先喝口水',
    '先喝口水，润润嗓子',
    '我去给你倒杯水',
    '我去给你倒杯热的',
  ][iSweet] + ['。', '吧。', '呀。', '哦。', '啦。', '哈。'][iTone];

  const closing = ['', '你说。', '我在。', '你慢慢说。', '你慢慢说，我不催你。', '不着急，你慢慢说，我一直在听。'][iS];
  const parts = [greeting];
  if (iS >= 2 && remark) parts.push(remark);
  parts.push(invite);
  parts.push(care);
  if (closing) parts.push(closing);
  return parts.join('');
}

function updatePreview() {
  const el = document.getElementById('asPreview');
  if (!el) return;
  const input = document.getElementById('asName');
  const name = (input ? input.value : '').trim() || DEFAULTS.name;
  el.textContent = `“${chatSample(currentTraits(), name)}”`;
}

function bind() {
  const nameInput = document.getElementById('asName');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const hero = document.getElementById('asHeroName');
      if (hero) hero.textContent = nameInput.value.trim() || DEFAULTS.name;
      updatePreview();
    });
  }

  document.querySelectorAll('input[data-trait]').forEach(el => {
    el.addEventListener('input', () => {
      const key = el.dataset.trait;
      const out = document.querySelector(`[data-val="${key}"]`);
      if (out) out.textContent = el.value;
      el.style.setProperty('--p', el.value + '%');
      document.querySelectorAll('[data-preset]').forEach(x => x.classList.remove('on'));
      updatePreview();
      vibrate(8);
    });
  });

  document.querySelectorAll('[data-preset]').forEach(el => {
    el.addEventListener('click', () => {
      const p = PRESETS[el.dataset.preset];
      if (!p) return;
      document.querySelectorAll('[data-preset]').forEach(x => x.classList.toggle('on', x === el));
      for (const [key, val] of Object.entries(p.traits)) {
        const input = document.querySelector(`input[data-trait="${key}"]`);
        if (input) input.value = val;
        const out = document.querySelector(`[data-val="${key}"]`);
        if (out) out.textContent = val;
        if (input) input.style.setProperty('--p', val + '%');
      }
      updatePreview();
      vibrate(12);
    });
  });

  const save = document.getElementById('asSave');
  if (save) save.addEventListener('click', () => saveAssistant(false));
}

export async function openAssistant() {
  openPage('助理设置', pageLoading('assistant'), null, 'assistant');
  try {
    const r = await fetch(`/api/assistant?uid=${encodeURIComponent(state.uid)}`);
    const d = await r.json();
    const s = d.settings || DEFAULTS;
    current = s;
    applyIdentity(s);
    fillPage(pageHtml(s, d.diaries || []));
    requestAnimationFrame(() => { bind(); updatePreview(); });
  } catch (_) {
    fillPage('<div style="padding:20px;color:var(--muted)">加载失败，稍后再试。</div>');
  }
}

export { assistantName };
