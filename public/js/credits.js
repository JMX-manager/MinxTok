// 学分开销（v3.24）：学习专用的一套积分，和游戏积分分开算，200 学分换 1 点额度
import { state } from './state.js?v=12';
import { haptic } from './haptics.js';
import { toast, bindWheel } from './ui.js?v=150';

const KEY = 'minxtok.study.credits.v1';
export const CREDIT_PER_QUOTA = 200;
export const CREDIT_DAILY_CAP = 20;
const WHEEL_ITEM = 42;

let wheelValue = 0;

export function creditsLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { total: Math.max(0, Math.round(Number(raw.total) || 0)) };
  } catch (_) { return { total: 0 }; }
}
function save(total) {
  try { localStorage.setItem(KEY, JSON.stringify({ total: Math.max(0, Math.round(total)) })); } catch (_) {}
}

// 加分：老师在课上说得好听、刷题答对，都会进这里
export function creditsAdd(n, why) {
  const add = Math.max(0, Math.round(Number(n) || 0));
  if (!add) return creditsLoad().total;
  const next = creditsLoad().total + add;
  save(next);
  paintBars();
  try { haptic(10); } catch (_) {}
  if (why) toast(`${why} +${add} 学分`);
  return next;
}

function creditsSpend(n) {
  const cost = Math.max(0, Math.round(Number(n) || 0));
  const total = creditsLoad().total;
  if (cost <= 0 || total < cost) return null;
  save(total - cost);
  paintBars();
  return total - cost;
}

function paintBars() {
  const total = creditsLoad().total;
  document.querySelectorAll('[data-credit-total]').forEach(el => { el.textContent = String(total); });
}

/* ---------- 首页那条学分栏（材质和游戏中心的积分栏一致） ---------- */
export function creditsBarHtml() {
  const total = creditsLoad().total;
  return `
    <div class="pts-bar credits-bar">
      <div class="pts-sum"><span>学分</span><b data-credit-total>${total}</b></div>
      <button class="game-btn" id="creditsRedeem" type="button">兑换额度</button>
    </div>
    <div class="pts-modal" id="creditsModal" hidden>
      <div class="pts-sheet">
        <div class="pts-head">兑换额度</div>
        <div class="pts-info" id="creditsInfo"></div>
        <div class="pts-row">兑换数量</div>
        <div class="pts-pick">
          <div class="pts-wheel" id="creditsWheel"></div>
          <div class="pts-wheel-band"></div>
        </div>
        <div class="pts-cost" id="creditsCost">200 学分 → 1 点额度</div>
        <div class="pts-note">200 学分换 1 点额度，每天最多换 20 点。换到的额度优先消耗，用不完一直留着，也不会抬高每日上限</div>
        <div class="pts-acts">
          <button class="game-btn" id="creditsClose" type="button">关闭</button>
          <button class="game-btn" id="creditsGo" type="button">确认兑换</button>
        </div>
      </div>
    </div>`;
}

function wheelMax() {
  const total = creditsLoad().total;
  return Math.max(0, Math.min(CREDIT_DAILY_CAP, Math.floor(total / CREDIT_PER_QUOTA)));
}

function buildWheel() {
  const el = document.getElementById('creditsWheel');
  if (!el) return;
  const max = wheelMax();
  el.innerHTML = Array.from({ length: Math.max(1, max + 1) }, (_, i) =>
    `<button type="button" class="pts-wheel-item" data-v="${i}">${i} 点</button>`).join('');
  const paint = (idxIn) => {
    const idx = Math.max(0, Math.min(max, Number(idxIn) || 0));
    wheelValue = idx;
    el.querySelectorAll('.pts-wheel-item').forEach((b, i) => b.classList.toggle('on', i === idx));
    const cost = document.getElementById('creditsCost');
    if (cost) {
      cost.textContent = max
        ? (idx ? `${CREDIT_PER_QUOTA * idx} 学分 → ${idx} 点额度` : '上下拖动或点击选择数量')
        : '学分不够，先去上课或者刷题攒一攒';
    }
    const go = document.getElementById('creditsGo');
    if (go) {
      const enough = idx > 0 && creditsLoad().total >= CREDIT_PER_QUOTA * idx;
      go.disabled = !enough;
      go.classList.toggle('is-off', !enough);
    }
    const info = document.getElementById('creditsInfo');
    if (info) info.textContent = `当前 ${creditsLoad().total} 学分，最多能换 ${max} 点额度。`;
  };
  // 默认停在第 1 格：停在 0 会让人以为滚轮"点不动/选不中"
  const start = max >= 1 ? 1 : 0;
  el.scrollTop = start * WHEEL_ITEM;
  bindWheel(el, WHEEL_ITEM, (idx) => paint(idx), haptic);
  paint(start);
  el.querySelectorAll('.pts-wheel-item').forEach((b) => {
    b.addEventListener('click', () => {
      el.scrollTo({ top: Number(b.dataset.v) * WHEEL_ITEM, behavior: 'smooth' });
      paint(Number(b.dataset.v));
      haptic(6);
    });
  });
}

function openModal() {
  const m = document.getElementById('creditsModal');
  if (!m) return;
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
  haptic(6);
  buildWheel();
}

function closeModal() {
  const m = document.getElementById('creditsModal');
  if (!m) return;
  // 和游戏那边同一套退场：先模糊散开再收起
  m.classList.add('closing');
  m.classList.remove('open');
  setTimeout(() => { m.hidden = true; m.classList.remove('closing'); }, 200);
}

export function bindCreditsBar() {
  const open = document.getElementById('creditsRedeem');
  if (open) open.addEventListener('click', openModal);
  const close = document.getElementById('creditsClose');
  if (close) close.addEventListener('click', closeModal);
  const modal = document.getElementById('creditsModal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  const go = document.getElementById('creditsGo');
  if (!go) return;
  go.addEventListener('click', async () => {
    const n = Math.max(0, Math.min(CREDIT_DAILY_CAP, Number(wheelValue) || 0));
    if (!n) { toast('先选个数量'); return; }
    const cost = n * CREDIT_PER_QUOTA;
    if (creditsLoad().total < cost) { toast('学分不够'); return; }
    go.disabled = true;
    const old = go.textContent;
    go.textContent = '兑换中…';
    try {
      const r = await fetch('/api/game/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, quota: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        toast(d.error === 'daily_cap' ? '今天已经换满 20 次了' : '兑换失败，稍后再试');
      } else {
        creditsSpend(cost);
        toast(`已兑换 ${d.granted || n} 点额度，兑换池还剩 ${d.poolLeft != null ? d.poolLeft : (d.quota ? d.quota.poolLeft : '—')} 点`);
        if (d.quota) window.dispatchEvent(new CustomEvent('minxtok-quota', { detail: d.quota }));
        openModal();
      }
    } catch (_) { toast('兑换失败，网络不通'); }
    go.disabled = false;
    go.textContent = old;
  });
}
