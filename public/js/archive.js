// 档案页：四个分区 —— 本周概览（可周切换）· 心情滑块 · 本周日记总结 · 本周学习总结
import { state } from './state.js?v=12';
import { getLang } from './i18n.js?v=118';
import { openPage, fillPage, closePage } from './ui.js?v=150';

const L = (zh, en) => (getLang() === 'en' ? en : zh);
const $ = id => document.getElementById(id);

const MODE_NAME = {
  translate: ['翻译', 'Translate'], solve: ['解题', 'Solve'], practice: ['练习', 'Practice'],
  word: ['查词', 'Words'], scene: ['场景应答', 'Scene'], essay: ['作文', 'Writing'],
  mistake: ['错题', 'Mistakes'], dict: ['词典', 'Dictionary'],
};

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function modeName(key) {
  const row = MODE_NAME[key];
  return row ? L(row[0], row[1]) : (key || L('学习', 'Study'));
}

function stat(label, value, sub, go) {
  return `<button type="button" class="arch-stat" ${go ? `data-go="${go}"` : ''}>
    <span class="arch-stat-label">${esc(label)}</span>
    <b>${esc(value)}</b>
    <small>${esc(sub || '')}</small>
  </button>`;
}

function detailHtml(p) {
  if (!p || !p.total) {
    return `<div class="arch-detail-empty">${L('这一段时间还没有心情记录。', 'No mood records for this period yet.')}</div>`;
  }
  const rows = (p.emotions || []).filter(x => x.count > 0).slice(0, 6).map(x => `
    <div class="arch-emo-row">
      <span>${esc(x.label)}</span>
      <i><b style="width:${Math.round(x.share * 100)}%"></b></i>
      <em>${x.count}</em>
    </div>`).join('');
  return `<div class="arch-detail-head">
      <b>${esc(p.label || '')}</b>
      <span>${p.total} ${L('条记录', 'records')} · ${L('心情指数', 'mood index')} ${p.index}</span>
    </div>
    <div class="arch-emo-list">${rows}</div>`;
}

function swapDetail(box, html) {
  if (!box) return;
  box.classList.add('switching');
  clearTimeout(box._swapTimer);
  box._swapTimer = setTimeout(() => {
    box.innerHTML = html;
    box.classList.remove('switching');
  }, 150);
}

function archiveSkeleton() {
  const card = '<div class="arch-skel-card"><i></i><b></b><em></em></div>';
  return `<div class="arch-wrap arch-skel">
    <div class="arch-skel-line w58"></div>
    <div class="arch-skel-stats">${card}${card}${card}${card}</div>
    <div class="arch-skel-section"><div class="arch-skel-line w34"></div><div class="arch-skel-chart"></div></div>
    <div class="arch-skel-section"><div class="arch-skel-line w42"></div><div class="arch-skel-chart short"></div></div>
  </div>`;
}

let cache = null;       // 最近一次接口数据
let scope = 'week';     // week | month
let monthIdx = 0;

function weekPills(d) {
  return (d.weekList || []).map((w, i) => `
    <button type="button" class="arch-week${w.start === d.weekStart ? ' on' : ''}" data-week="${w.start}">
      <b>${esc(w.short || w.label)}</b>
      ${w.isNow ? `<em>${L('本周', 'now')}</em>` : `<em>${i + 1}</em>`}
    </button>`).join('');
}

function statsHtml(d) {
  const wk = d.week || {};
  const c = d.counts || {};
  const range = d.weekRange || '';
  const idx = d.moods && d.moods.week && d.moods.week.index;
  return `
      ${stat(L('对话', 'Chat'), wk.messages || 0, L(`累计 ${c.messages || 0} 条 · ${c.messageDays || 0} 天`, `total ${c.messages || 0} · ${c.messageDays || 0}d`), 'chat')}
      ${stat(L('日记', 'Diary'), wk.diaries || 0, L(`累计 ${c.diaries || 0} 篇 · ${c.diaryDays || 0} 天`, `total ${c.diaries || 0} · ${c.diaryDays || 0}d`), 'diary')}
      ${stat(L('学习', 'Study'), wk.studySessions || 0, L(`累计 ${c.studySessions || 0} 次 · 错题生词 ${wk.studyItems || 0}`, `total ${c.studySessions || 0}`), 'study')}
      ${stat(L('心情标签', 'Mood tags'), wk.moodTags || 0, idx == null ? range : L(`心情指数 ${idx}`, `mood ${idx}`), '')}`;
}

function moodsOfScope(d) {
  return scope === 'week' ? (d.moods && d.moods.weeks) || [] : (d.moods && d.moods.months) || [];
}

function rangeHtml(d) {
  const list = moodsOfScope(d);
  if (list.length < 2) return '';
  let idx = list.length - 1;
  if (scope === 'week') {
    idx = Math.max(0, list.findIndex(x => x.start === d.weekStart));
    if (idx < 0) idx = list.length - 1;
  } else {
    idx = Math.min(monthIdx, list.length - 1);
  }
  return `<div class="arch-range-wrap">
    <input class="arch-range" id="archRange" type="range" min="0" max="${list.length - 1}" step="1" value="${idx}"
      aria-label="${L('选择时间段', 'pick a period')}">
    <div class="arch-range-cap">
      <span>${esc(list[0].label)}</span>
      <span>${esc(list[list.length - 1].label)}</span>
    </div>
  </div>`;
}

function renderArchive(d) {
  cache = d;
  const wk = d.week || {};
  const sm = d.summary || {};
  monthIdx = Math.min(monthIdx, Math.max(0, ((d.moods && d.moods.months) || []).length - 1));

  fillPage(`
    <div class="arch-wrap">
    <div class="arch-hero">
      <p>${L('不是成绩单，只是你认真生活过的痕迹。', 'Not a report card — just traces of the life you’ve been living.')}</p>
    </div>

    <section class="arch-section">
      <div class="arch-sec-head">
        <h2>${L('这段时间', 'This stretch')}</h2>
        <span id="archRangeTag">${esc(d.weekRange || '')}${d.isNowWeek ? L(' · 本周', ' · now') : ''}</span>
      </div>
      <div class="arch-weeks" id="archWeeks">${weekPills(d)}</div>
      <div class="arch-stats" id="archStats">${statsHtml(d)}</div>
    </section>

    <section class="arch-section">
      <div class="arch-sec-head"><h2>${L('心情', 'Mood')}</h2><span>${L('拖滑块看别的时间', 'drag to travel')}</span></div>
      <div class="arch-tabs">
        <button type="button" class="arch-tab${scope === 'week' ? ' on' : ''}" data-scope="week">${L('本周心情', 'Weekly mood')}</button>
        <button type="button" class="arch-tab${scope === 'month' ? ' on' : ''}" data-scope="month">${L('本月心情', 'Monthly mood')}</button>
      </div>
      <div id="archRangeHost">${rangeHtml(d)}</div>
      <div class="arch-detail" id="archDetail">${detailHtml(scope === 'week'
        ? Object.assign({}, d.moods && d.moods.week, { label: d.weekRange || '' })
        : moodsOfScope(d)[monthIdx])}</div>
    </section>

    <section class="arch-section">
      <div class="arch-sec-head">
        <h2>${L('本周日记', 'Diary this week')}</h2>
        <span>${L('AI 总结', 'AI digest')} · ${sm.diaryCount || 0} ${L('篇', 'entries')}</span>
      </div>
      <p class="arch-ai${sm.pending ? ' loading' : ''}" id="archDiary">${esc(sm.pending
        ? L('正在读这一周的日记…', 'reading this week…')
        : (sm.diary || d.diaryFallback || L('这周还没写日记。', 'No diary this week yet.')))}</p>
      <div class="arch-chips">${(wk.studyModes || []).length ? '' : ''}</div>
    </section>

    <section class="arch-section">
      <div class="arch-sec-head">
        <h2>${L('本周学习', 'Study this week')}</h2>
        <span>${L('AI 总结', 'AI digest')} · ${sm.studyCount || 0} ${L('次', 'sessions')}</span>
      </div>
      <p class="arch-ai${sm.pending ? ' loading' : ''}" id="archStudy">${esc(sm.pending
        ? L('正在整理这一周的学习…', 'sorting this week…')
        : (sm.study || d.studyFallback || L('这周还没有学习记录。', 'No study this week yet.')))}</p>
      <div class="arch-chips">${(wk.studyModes || []).map(m => `<span>${esc(modeName(m.mode))} · ${m.count}</span>`).join('')}</div>
    </section>
    </div>
  `);

  bindWeek();
  bindScope();
  bindStats();
  scrollSelectedWeek();
  if (sm.pending) loadSummary(d.weekStart);
}

// 概览先出、AI 总结后补：只改那两段文字，不动页面结构，避免跳一下
async function loadSummary(start) {
  const diaryEl = $('archDiary');
  const studyEl = $('archStudy');
  try {
    const r = await fetch(`/api/archive?uid=${encodeURIComponent(state.uid)}&w=${start}&ai=1&_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('summary failed');
    const d = await r.json();
    if (!cache || d.weekStart !== cache.weekStart) return;
    cache.summary = d.summary;
    if (diaryEl && diaryEl.isConnected) {
      diaryEl.textContent = d.summary.diary || d.diaryFallback || L('这周还没写日记。', 'No diary this week yet.');
      diaryEl.classList.remove('loading');
    }
    if (studyEl && studyEl.isConnected) {
      studyEl.textContent = d.summary.study || d.studyFallback || L('这周还没有学习记录。', 'No study this week yet.');
      studyEl.classList.remove('loading');
    }
  } catch (_) {
    if (diaryEl && diaryEl.isConnected) {
      diaryEl.textContent = cache.diaryFallback || L('这周还没写日记。', 'No diary this week yet.');
      diaryEl.classList.remove('loading');
    }
    if (studyEl && studyEl.isConnected) {
      studyEl.textContent = cache.studyFallback || L('这周还没有学习记录。', 'No study this week yet.');
      studyEl.classList.remove('loading');
    }
  }
}

function scrollSelectedWeek() {
  const box = $('archWeeks');
  const on = box && box.querySelector('.arch-week.on');
  if (!box || !on) return;
  const target = on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2;
  box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

function bindWeek() {
  document.querySelectorAll('.arch-week').forEach(btn => {
    btn.addEventListener('click', () => {
      const start = Number(btn.dataset.week);
      if (!start || (cache && start === cache.weekStart)) return;
      document.querySelectorAll('.arch-week').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      selectWeek(start);
    });
  });
}

async function selectWeek(start) {
  const box = $('archStats');
  if (box) box.style.opacity = '.45';
  const tag = $('archRangeTag');
  if (tag) tag.textContent = L('正在翻这一周…', 'flipping…');
  try {
    const r = await fetch(`/api/archive?uid=${encodeURIComponent(state.uid)}&w=${start}&ai=0&_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('archive failed');
    const d = await r.json();
    renderArchive(d);
    if (d.summary && d.summary.pending && d.pending) loadSummary(d.weekStart);
  } catch (_) {
    if (box) box.style.opacity = '1';
    if (tag) tag.textContent = L('这一周没翻开，再试一次', 'could not flip');
  }
}

function bindScope() {
  document.querySelectorAll('.arch-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.scope === scope) return;
      scope = btn.dataset.scope;
      document.querySelectorAll('.arch-tab').forEach(b => b.classList.toggle('on', b.dataset.scope === scope));
      const host = $('archRangeHost');
      if (host && cache) {
        host.innerHTML = rangeHtml(cache);
        bindRange();
      }
      const list = cache ? moodsOfScope(cache) : [];
      const pick = scope === 'week'
        ? Object.assign({}, cache.moods.week, { label: cache.weekRange })
        : list[Math.min(monthIdx, list.length - 1)];
      swapDetail($('archDetail'), detailHtml(pick));
    });
  });
  bindRange();
}

function bindRange() {
  const range = $('archRange');
  if (!range || !cache) return;
  const list = moodsOfScope(cache);
  range.addEventListener('input', () => {
    const i = Number(range.value) || 0;
    const cur = list[i] || {};
    if (scope === 'week') return;
    monthIdx = i;
    swapDetail($('archDetail'), detailHtml(cur));
  });
  range.addEventListener('change', () => {
    const i = Number(range.value) || 0;
    const cur = list[i] || {};
    if (scope === 'week') {
      if (cache && cur.start === cache.weekStart) {
        swapDetail($('archDetail'), detailHtml(Object.assign({}, cache.moods.week, { label: cache.weekRange })));
        return;
      }
      if (cur.start) selectWeek(cur.start);
    } else {
      monthIdx = i;
      swapDetail($('archDetail'), detailHtml(cur));
    }
  });
}

function bindStats() {
  document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      const go = btn.dataset.go;
      if (go === 'chat') { closePage(); return; }
      window.dispatchEvent(new CustomEvent('minxtok:nav', { detail: go }));
    });
  });
}

export async function openArchive() {
  openPage(L('档案', 'Archive'), archiveSkeleton(), null, 'archive');
  try {
    const r = await fetch(`/api/archive?uid=${encodeURIComponent(state.uid)}&ai=0&_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('archive failed');
    const d = await r.json();
    renderArchive(d);
    if (d.summary && d.summary.pending && d.pending) loadSummary(d.weekStart);
  } catch (_) {
    fillPage(`<div class="arch-error">${L('档案暂时没翻开，稍后再试。', 'Couldn’t open the archive. Try again later.')}</div>`);
  }
}
