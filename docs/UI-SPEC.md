# MinxTok 界面规范（UI-SPEC v1）

> 目的：把动效、层级、组件契约一次写死，后续加功能只复用，不再新写动画与浮层，避免卡顿和历史 bug 重演。

## 1. 文件分工

| 文件 | 职责 | 允许改动的场景 |
|---|---|---|
| `public/assets/theme.css` | 颜色/圆角/间距/阴影/层级变量 + 基础组件 | 只加变量与组件，不改已有类名语义 |
| `public/assets/motion.css` | 全站唯一动画源（keyframes + 工具类） | 只加新动画类 |
| `public/js/ui.js` | 抽屉/弹窗/提示/遮罩/骨架 | 只加通用件 |
| `public/js/blocks.js` | 消息块渲染与 action 分发 | 新卡片类型加一个 case |
| `public/js/i18n.js` | 中英文词条 | 只加词条 |
| `public/js/theme.js` | 深浅色 | 基本不动 |
| `public/js/app.js` | 业务编排 | 只编排，不写动画 |

**铁律：业务文件里禁止出现 `@keyframes`、行内 `transition`、`z-index: 9999`。**

## 2. 层级（z-index）

| 层 | 变量 | 值 | 用途 |
|---|---|---|---|
| 内容 | `--z-base` | 0 | 消息流 |
| 输入区 | `--z-composer` | 20 | 底部输入、额度 |
| 顶栏 | `--z-appbar` | 30 | 磨砂导航 |
| 遮罩 | `--z-scrim` | 40 | 抽屉/弹窗共用 |
| 抽屉 | `--z-drawer` | 50 | 侧边菜单 |
| 弹窗 | `--z-modal` | 60 | 设置/关于 |
| 提示 | `--z-toast` | 70 | 轻提示 |
| 全屏遮盖 | `--z-overlay` | 80 | 暂停/AI 异常 |

新增浮层：先挑层，再用 `.scrim` / `.modal-wrap` / `.m-veil` 现成结构，不许自造。

## 3. 动效清单（全部在 motion.css）

| 类 | 效果 | 用在 |
|---|---|---|
| `.m-fade-up` | 淡入上浮 8px | 消息、列表项 |
| `.m-pop` | Q 弹缩放出现 | 卡片、提示条 |
| `.m-blur-in` | 模糊转清晰 | 主题切换、面板切换 |
| `.m-stagger` | 子项依次延迟出生 | 三条追问 |
| `.m-thinking` | 三点呼吸 | 等待回复 |
| `.m-press` | 按压缩放 | 按钮、卡片、追问 |
| `.m-ripple` | 点按扩散光圈 | 情绪中心按钮 |
| `.m-skeleton` | 骨架微光 | 历史加载 |
| `.m-veil` | 页面级模糊遮罩淡入 | 服务暂停 |
| `.m-spinner` | 旋转加载 | 提交中 |

曲线统一：`--ease-spring`（Q 弹）、`--ease-out`（顺滑）、时长 120/200/320/480ms。
系统开启"减弱动态效果"时全站自动降级（已内置）。

## 4. 组件契约

### 抽屉
```js
openDrawer(); closeDrawer();
```
结构固定：`.drawer > .brand + .item*`，遮罩由 `#scrim` 统一管理。

### 弹窗
```js
openModal({ title, body });
closeModal();
```
**必须有返回按钮（←）和关闭按钮（✕）**，两者都绑 `closeModal`。缺一不可。

### 提示
```js
toast('文本');
```
不阻断操作，1.8 秒自动消失。

### 页面遮罩
```js
setVeil(true, '服务暂停中');
```
用于后端暂停/AI 异常，任何情况下用户都能看到原因。

## 5. 消息块与点击

- 每条消息 = `blocks[]`，服务端规范化后下发
- 点击分发只认 `action`：`send`（追问）/ `play`（音乐）/ `open`（新闻、外链）/ `view`（图片）/ `none`
- 追问点过一次即 `data-used=1` 并整组失效，杜绝重复发送与空循环
- 每类块最多一个：一组追问、一张卡片
- 未知块类型静默丢弃，不占位、不报错

**新卡片接入清单：**
1. `src/blocks.js` 的 `BLOCK_TYPES` 加类型（含 action、必填字段）
2. `public/js/blocks.js` 加一个 `case`
3. `theme.css` 加样式（复用 `.card`）
4. `i18n.js` 加词条
5. 补一条单元测试

## 6. 主题与语言

- 主题：`html[data-theme="dark|light"]`，跟随系统，手动覆盖存 `localStorage.minxtok.theme`
- 语言：所有文案走 `data-i18n` 或 `t('key')`，禁止在 JS 里硬写中文
- 新增文案 → 先加 `zh` 和 `en` 两条，再引用

## 7. 响应式与安全区

- 最大宽度 720px 居中；输入区 `env(safe-area-inset-bottom)`
- 点击热区不小于 38×38
- 文本 `word-break: break-word`，卡片标题单行省略
