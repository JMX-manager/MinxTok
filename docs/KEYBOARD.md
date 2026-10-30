# 键盘 / 滚动卡顿 技术说明（给外部评审用）

> 项目：MinxTok（纯静态单页聊天应用，Cloudflare Pages）
> 线上：https://minxtok.pages.dev　当前版本 5.1.21（app.js?v=351 / theme.css?v=259）
> 目标读者：外部模型/工程师，请基于此文档给修复方案，不需要看全部 6000 行源码

---

## 1. 运行环境

- 纯 HTML + CSS + 原生 ES module，无 React/Vue、无打包器（前端文件原样部署）。
- 主容器是一个聊天界面（仿微信），目标是长会话（几百条消息）+ 流式输出（SSE 逐字追加）。
- 主要使用场景：
  - **微信内置浏览器（Android，X5/QQBrowser 内核）** ← 卡顿就发生在这里
  - 夸克浏览器（Chromium 内核）← 同一页面**明显流畅**
  - 桌面 Chrome 无问题
- 设备：Android 手机，PRoot 环境无法跑 headless 浏览器，所以**没有本地可视化验证能力**，只能靠代码逻辑 + 真机反馈。

### viewport 配置（index.html）
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, interactive-widget=resizes-content">
```

---

## 2. 渲染容器结构（关键 DOM / CSS）

```html
<body class="">
  <div id="app">                      <!-- 整页高度容器 -->
    <header class="appbar">…</header> <!-- 磨砂顶栏，50px，flex:none -->
    <main class="chat" id="chat">…</main> <!-- 消息滚动区，flex:1 -->
    <div class="composer">…</div>     <!-- 底部输入区，flex:none -->
  </div>
  <div id="page">…</div>              <!-- 二级页面，fixed 全屏，z-index 35 -->
  <div class="scrim"></div>           <!-- 抽屉/弹窗遮罩，带 backdrop-filter -->
</body>
```

CSS（精简后的关键部分）：

```css
html, body {
  height: 100%; min-height: 100%;
  overflow: hidden;            /* 页面本身不滚，只有 .chat 滚 */
  overscroll-behavior: none;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  height: var(--app-height, 100dvh); /* --app-height 现在没有任何 JS 设置了，等于 100dvh */
  max-width: 720px;
  margin: 0 auto;
  position: relative;
  isolation: isolate;          /* 为了让 appbar 的 backdrop-filter 有采样源 */
  background: transparent;     /* 底色在 #app::before 的渐变上 */
}

.appbar {
  position: relative;
  flex: none;
  height: 50px;
  background: rgba(14, 14, 17, 0.28);
  backdrop-filter: blur(24px) saturate(1.9);
  -webkit-backdrop-filter: blur(24px) saturate(1.9);
  border-bottom: 1px solid …;
  z-index: var(--z-appbar);
}

.chat {
  flex: 1;
  min-height: 0;               /* 必须，否则 flex 子项不会收缩 */
  overflow-y: auto;
  margin-top: -50px;           /* 内容从磨砂顶栏下面穿过，才有雾面效果 */
  padding: calc(50px + 16px) 22px 10px;
  scroll-behavior: auto;
  -webkit-overflow-scrolling: touch;
}

.composer {
  position: relative;
  flex: none;
  padding: 22px 16px calc(22px + env(safe-area-inset-bottom));
  /* 注意：故意不按键盘状态改内边距，曾经改过 → 键盘动画期间聊天区窜一下 */
}
```

**要点**：整页只有 `.chat` 一个滚动容器；`#app` 高度 = 视口高度；顶栏和输入区都是 `flex: none`，键盘出现时浏览器缩的是 `.chat`（`resizes-content` 模式下布局视口变矮）。

---

## 3. 滚动控制代码（现在的实现）

```js
// 是否停在底部：用户往上翻时置 false，不再把用户拽回底部
let stickBottom = true;
let stickRaf = 0;
chat.addEventListener('scroll', () => {
  if (stickRaf) return;                       // 合并到一帧，避免每次滚动都读 scrollHeight
  stickRaf = requestAnimationFrame(() => {
    stickRaf = 0;
    const gap = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    stickBottom = gap < 140;
  });
}, { passive: true });

// 「缓动跟随」：每帧吃掉剩余距离的 22%，流式输出时看起来是连续滑动，而非每段硬跳
let followRaf = 0;
function jumpBottom() {                        // 立即到底（强布局一次）
  cancelAnimationFrame(followRaf);
  followRaf = 0;
  chat.scrollTop = chat.scrollHeight;
}
function followStep() {
  followRaf = 0;
  if (!stickBottom) return;
  const gap = (chat.scrollHeight - chat.clientHeight) - chat.scrollTop;
  if (gap <= 0.5) return;
  chat.scrollTop = chat.scrollTop + Math.max(1, gap * 0.22);
  followRaf = requestAnimationFrame(followStep);
}
function scrollBottom(force) {
  if (force) { jumpBottom(); return; }
  if (!stickBottom) return;
  if (!followRaf) followRaf = requestAnimationFrame(followStep);
}
```

### 键盘检测（当前 = 应用最早那版，已回滚到这里）

```js
const input = $('input');

input.addEventListener('focus', () => {
  composer.classList.add('focused');
  scrollBottom();
  [40, 90, 160, 260, 380].forEach(ms => setTimeout(scrollBottom, ms));
});
input.addEventListener('blur', clearFocus);

// 键盘没有系统事件，只能看可视视口高度：变矮就认为键盘起来了
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
    [40, 90, 160, 260].forEach(ms => setTimeout(scrollBottom, ms));
  }
  if (!open) kbOpen = false;      // 收起键盘完全不处理滚动
};
window.addEventListener('resize', onViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewport);
  window.visualViewport.addEventListener('scroll', onViewport);
}
```

---

## 4. 症状清单（明轩的真机反馈）

1. **微信里整体卡**：长会话滚动掉帧，键盘升起时更卡；同一页面在夸克浏览器流畅。
2. **键盘升起时聊天区被顶上去、最后几条不在底部**（`resizes-content` 下布局视口变矮，浏览器保持 `scrollTop` 不变，于是内容整体上移）。
3. **顶栏「上一下再下去」**：键盘升起瞬间整个页面有一次纵向位移再回来。
4. （已修）**磨砂度会在键盘升降时变浓变淡**——曾用 `body.kb-anim .appbar { backdrop-filter: blur(8px) }` 做"键盘动画期间降档"，肉眼可见，已整条删除。
5. （已修）**白屏进不去**：一次改动导致 ES module 顶层语法错误，`window.__minxBooted` 永远到不了，卡在加载页。已回滚。

---

## 5. 已经试过并失败的方案（避免重复踩坑）

| 版本 | 做法 | 结果 |
|---|---|---|
| 5.1.6 | 流式分块渲染（定稿区缓存 + 尾巴逐帧重画）、删落字 blur 动画、`content-visibility:auto` 给历史消息 | 流式顺了；但 `content-visibility` 导致容器高度变化时占位高度≠真实高度 → 键盘顶起时滚动位置乱窜、巨卡，**已删除** |
| 5.1.7 | `interactive-widget=resizes-visual` + `@property --app-height` 过渡 + JS 用 `visualViewport.height` 驱动 `#app` 高度 | 该 WebView 的 `vv.height` 抖动，高度过渡反复重启 → 输入区被键盘盖住 + 闪烁 |
| 5.1.8 | 回 `resizes-content`，保留轻量 onViewport | 仍闪 |
| 5.1.9 | 删掉 `body.kb-open .composer { padding-bottom: 22px }`（内边距随键盘变 → flex 重新分配高度 = 窜），键盘判定改双阈值 | 好些，但仍"上窜一下" |
| 5.1.10 | 删 `content-visibility`，`.chat` 加 `overflow-anchor: none` | 乱窜解决；顺带发现滚动锚定会偷偷补偿 `scrollTop` 和缓动跟随打架（后来这条 `overflow-anchor` 也撤了，因为回滚要还原旧行为） |
| 5.1.11 | `body.kb-anim` 键盘动画期间磨砂 24px→8px 降档；键盘升降改缓动跟随 | **降档肉眼可见（磨砂变浓淡）**，已撤 |
| 5.1.12 | 视口变化与贴底放同一帧（`if (stickBottom) jumpBottom()`），视口事件合并进 rAF | 两段位移仍有，"先升到键盘高度再往下滚" |
| 5.1.13 | `navigator.virtualKeyboard.overlaysContent = true` + `geometrychange` + `boundingRect.height` 自己写 `--app-height`/`--kb-top` | 上传时文件被改坏（Python 锚点重复 → 残留代码），整站白屏；**API 方案本身未验证** |
| 5.1.17 | 键盘动画期间**每帧**钉底 `chat.scrollTop = chat.scrollHeight`（420ms 窗口） | 更"忙"，明轩反馈更傻更迟钝 |
| 5.1.18 | 微信 UA 下顶栏/遮罩去 `backdrop-filter` 换实底 | **并没有变流畅** → 说明瓶颈不在磨砂合成（已还原磨砂） |
| 5.1.21 | 完全回滚到应用最早那版（本文档第 3 节代码） | 明轩认为这才是"不卡、导航栏不动"的基线 |

---

## 6. 约束 / 不能动的观感

- 顶栏必须是磨砂玻璃（`backdrop-filter`），明轩不接受换实底。
- `.chat { margin-top: -50px }` 是为了让内容从顶栏下穿过，这是要的视觉效果。
- 不能改输入区外观、不能加输入光标闪烁、不自动聚焦。
- 动观感的改动必须先说明再动。
- 改动必须能被真机验证，且部署前要做 ES module 解析自检（`cp x.js /tmp/x.mjs && node --check /tmp/x.mjs`，直接 `node --check x.js` 会误判通过）。

---

## 7. 想请外部评审回答的问题

1. 在 `interactive-widget=resizes-content` + 单一 `.chat` 滚动容器的结构下，**键盘升起时保持贴底、且不出现"整页先上移再回弹"**的稳妥实现是什么？（是否应该改成 `resizes-visual` + 自己控制高度？还是用 `scrollIntoView` / 固定 `#app` 高度 + `position: fixed` 布局？）
2. `.chat` 的 `margin-top: -50px` 让内容滚过磨砂层，是否会导致 Android WebView 每帧重采样 `backdrop-filter` 从而掉帧？有没有既保留"内容穿过磨砂"观感、又不掉帧的做法（例如给顶栏下方做一层独立的不透明渐变遮罩、或用 `mask-image` 代替 blur）？
3. 长会话 + SSE 流式追加的滚动跟随，业界稳妥做法是 `flex-direction: column-reverse` 反转列表吗？在这个已上线的结构里改造成本多大、有没有副作用（滚动条位置、历史加载、`scrollTop` 语义反转）？
4. 微信 X5 WebView 是否有已知的强制同步布局（forced reflow）放大效应，导致 `scrollHeight` 读取 + `scrollTop` 写入每秒几十次就明显掉帧？如何在不改观感的前提下减少读写次数？
5. 有没有办法检测"键盘正在动画中"（不依赖 `navigator.virtualKeyboard`），从而只在动画期间做最省的动作？
