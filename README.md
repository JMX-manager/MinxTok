# MinxTok 🦞

一个跑在 Cloudflare 上的中文 AI 聊天应用：流式对话、情绪画像、公式与化学式渲染、学习中心、语音输入，全部零框架手写。

> 线上体验：<https://minxtok.pages.dev>
> 当前版本：**6.2.0** ｜ 文档索引：[docs/README.md](docs/README.md) ｜ 变更记录：[docs/HISTORY.md](docs/HISTORY.md) ｜ 路线：[docs/ROADMAP.md](docs/ROADMAP.md)

---

## 它是什么

MinxTok 起初是一个高中生的个人项目：想做一个能陪自己聊天、能讲题、能记住情绪的 Web 应用，顺便把中学阶段最烦的排版问题（公式、上下标、化学方程式、单位）一次性解决掉。

所以它没有用任何前端框架，也不依赖客户端 SDK：

- **前端**：原生 ES Module + 手写 CSS，22 个模块，约 3.3 万行，按需懒加载；
- **后端**：Cloudflare Pages Functions，部署时把 32 个源文件拼成一个 `_worker.js`；
- **数据**：D1（SQLite）存消息与标签，KV 存会话、缓存、额度与计费状态；
- **模型**：任何 OpenAI 兼容接口（默认 DeepSeek）。

一条消息的完整链路：浏览器 → `/api/chat`（SSE 流式）→ 分块解析 → 自研渲染管线（Markdown + 公式 + 化学式）→ 逐字演出。

---

## 主要功能

### 1. 对话

- **SSE 流式**：`text/event-stream`，边生成边渲染；演出刻意慢于生成，保证「一个字一个字落下来」的观感。
- **引用回复 / 追问建议 / 语音条**：追问由后端二次生成，可关闭。
- **长历史折叠**：按天折叠 + 分页加载，首屏只渲染最近 16 条。
- **手势与键盘**：移动端键盘用 `rAF` 每帧跟随，自动贴底可被上滑手势接管。

### 2. 情绪中心

- 每条用户消息都会被后台打上情绪标签（27 档，含专注 / 好奇 / 无聊），批量补录、失败重试、词频仅作兜底。
- 一周聚合：主情绪、九宫格、环形图、六类分组（舒展 / 投入 / 平稳 / 低落 / 紧绷 / 杂项）、一段 AI 解读。
- 所有统计只认用户自己说的话，AI 的分析口吻不会污染画像。

### 3. 内容渲染（项目的重头）

- **公式**：`$...$`、`\[...\]`、裸式子、分式、根号、上下标、箭头、集合与坐标，统一走 SVG 与衬线字体。
- **化学**：`H2SO4`、`Fe²⁺`、`SO₄²⁻` 自动归一成可点击单元，点开是物理性质、化学性质与化合价（142 条本地速查表 + 模型兜底）。
- **单位与量词**：`2 L`、`25 °C`、`5 个`、`第 3 秒` 按语境决定是否用数学字体，天气场景整体退出衬线。
- **代码块 / 表格 / 卡片**：消息可以携带图片、音频、音乐卡、额度礼物卡、学习卡。

### 4. 学习中心

- 刷题、错题本、课程、知识点，题目与解析同样走公式渲染。
- 支持拍照/图片提问（OCR），语音提问（Whisper）。

### 5. 账号、额度与运营

- 手机号 + 短信验证码注册（阿里云号码认证），邮箱登录兼容老账号。
- 每日额度 + 赠送池 + 兑换码；充值走「每日密钥 → 扫码支付页 → 实时到账」。
- 管理端：暂停开关、运行时配置、统计、测试注入。

---

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 托管 | Cloudflare Pages | 静态资源 + Functions 一体，自带 CDN |
| 运行时 | Pages Functions（Workers） | 单文件 `_worker.js`，由构建脚本按依赖顺序拼接 |
| 数据库 | Cloudflare D1 | 17 个迁移，消息、情绪标签、用户、支付、学习 |
| 缓存/状态 | Cloudflare KV | 会话、情绪缓存、支付票据、额度计数 |
| 模型 | OpenAI 兼容 API | 默认 DeepSeek，可换任意兼容服务 |
| 语音 | Workers AI（Whisper） | 语音转文字与文本纠错 |
| 图片/OCR | 视觉模型 + 本地 SVG | 化学装置图、公式渲染全部本地生成 |
| 前端 | 原生 ES Module | 无框架、无构建器、无 npm 运行时依赖 |

---

## 目录结构

```
src/                 后端（32 个模块，Cloudflare Pages Functions）
  index.js           路由入口与鉴权闸门
  chat.js            SSE 流式对话、频控、额度、全站日上限
  emotion.js         情绪打标、聚合、分组、解读
  chem.js            化学式归一化与 142 条性质速查表
  blocks.js          消息块构造（服务端）
  auth.js sms.js webauthn.js   账号体系
  quota.js pay.js gift.js      额度与支付
  study.js drill.js course.js  学习中心
public/              前端
  index.html         入口
  js/app.js          主控制器（约 1.1 万行）
  js/blocks.js       Markdown + 公式 + 化学式渲染管线
  js/dict.js         点词查词与化学式抽屉
  assets/theme.css   设计系统与全部组件样式
scripts/
  build-pages.mjs    把 src/*.js 拼成 dist/_worker.js
  pay-key.mjs        本地复算当日充值密钥
migrations/          D1 迁移（按编号顺序执行）
tests/               Node 原生测试（渲染与块构造）
docs/                运维、历史、路线、UI 规范
```

---

## 本地开始

前置：Node 18+、一个 Cloudflare 账号、一个 OpenAI 兼容模型的 API Key。

```bash
git clone https://github.com/<you>/minxtok.git
cd minxtok

# 1) 建 KV 与 D1（记下输出的 id，填进 wrangler.toml）
npx wrangler kv namespace create MINXTOK_KV
npx wrangler d1 create minxtok-db

# 2) 建表
npx wrangler d1 execute minxtok-db --remote --file migrations/0001_init.sql
#    后续迁移按编号继续执行

# 3) 构建（把 src 拼成单文件 worker）
node scripts/build-pages.mjs
node --check dist/_worker.js

# 4) 部署
npx wrangler pages deploy dist --project-name minxtok --branch main
```

本地跑测试：

```bash
node --test tests/render.test.mjs
```

> 前端是纯 ES Module，直接改 `public/` 即可，无需打包；但**改完必须递增 `public/index.html` 里的 `?v=`**，否则浏览器会继续用旧缓存。

---

## 配置

所有密钥只通过环境变量或 `wrangler pages secret put` 注入，仓库里不存任何明文。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_API_KEY` | ✅ | 模型 API Key（secret） |
| `LLM_BASE_URL` | ✅ | 兼容接口地址，如 `https://api.deepseek.com` |
| `LLM_MODEL` | ✅ | 模型名，如 `deepseek-chat` |
| `ADMIN_TOKEN` | ✅ | 管理端与内部工具鉴权（secret，随机长串） |
| `MINXTOK_KV` / `DB` | ✅ | KV 与 D1 绑定（见 `wrangler.toml.example`） |
| `DAILY_QUOTA` |  | 每人每天额度，默认 100 |
| `RATE_PER_MIN` |  | 每人每分钟消息数，默认 15 |
| `GLOBAL_DAILY_CAP` |  | **全站每日总调用上限**，默认 3000，建议按预算设 |
| `CORS_ORIGIN` |  | 允许的来源，默认 `*`，上线建议改成自己的域名 |
| `PAY_KEY_SECRET` |  | 充值密钥的 HMAC 密钥（只在本机用，不进仓库） |
| `ALIYUN_AK_ID` / `ALIYUN_AK_SECRET` |  | 阿里云短信（secret） |
| `CF_ACCOUNT_ID` / `CF_AI_TOKEN` |  | Workers AI（语音转写） |

复制 `wrangler.toml.example` 为 `wrangler.toml` 并填入自己的 KV / D1 id；`wrangler.toml` 已加入 `.gitignore`，避免误提交。

---

## 安全说明（重要）

这个项目是给个人自用设计的，**上线前请至少做完下面几件事**：

1. **绝不提交密钥**。`.env`、`.dev.vars`、`wrangler.toml`、私钥文件都在 `.gitignore` 里；提交前跑一遍 `git diff --cached` 自己看。
2. **`ADMIN_TOKEN` 必须是随机长串**（`openssl rand -hex 32`），它是 `/api/admin/*` 的唯一门槛。
3. **设死全站上限**。`GLOBAL_DAILY_CAP` 是防刷保险丝；另配合 `DAILY_QUOTA`（每人）与 `RATE_PER_MIN`（每分钟）三层限流。
4. **收紧 CORS**。默认 `*` 只适合本地调试，上线改成自己的域名。
5. **充值密钥会过期**。`PAY_KEY_SECRET` 泄露等于充值体系失守，泄露后立刻轮换（旧密钥当日失效）。
6. **不要开放匿名注册**。注册需要短信验证或邀请，否则额度会被陌生账号刷完。
7. **模型 Key 按预算限流**。免费额度和账单上限，去服务商后台设一把硬上限，别只依赖应用层。
8. **数据库里有用户隐私**。`messages` 存原始对话，导出/备份时按个人信息处理；本项目不内置任何审计日志上传。

发现安全问题请走 [SECURITY.md](SECURITY.md)，不要开公开 issue。

---

## 源码公开意味着什么

公开的是**实现**，不是**门钥匙**：

| 公开的东西 | 不公开的东西 |
| --- | --- |
| 前端全部代码、页面结构、交互逻辑 | 模型 API Key、`ADMIN_TOKEN`、支付密钥、短信 AK |
| 后端路由、参数形状、限流策略 | D1 里的对话数据、用户资料 |
| 情绪/渲染/打标的做法 | Cloudflare 账号与部署权限 |

前端代码本来就会随浏览器下发，任何人都能看，开源不会让这部分多风险一点。真正的门票只有三个：模型 Key、`ADMIN_TOKEN`、`PAY_KEY_SECRET`，它们都只存在 Cloudflare 的 secret 或你本机。

**唯一新增的风险是「知道内情的人更多了」**，所以 6.2.1 起补了两道闸：管理端按 IP 计失败次数（十分钟 10 次即锁），短信接口单 IP 每小时 5 条。剩下的靠 `GLOBAL_DAILY_CAP`、每人额度、每分钟限流三层兜底。

如果有人把这份代码部署到自己域名，那是他的站，不是你的站。官方站只有 <https://minxtok.pages.dev> 一个，看到别的域名打着 MinxTok 名义收钱、要验证码，一律是冒充。

**建议你在 Cloudflare 后台再做一件事**：给 `/api/admin/*` 加一条 WAF 规则（只允许你自己的 IP，或直接 401），这是代码之外最便宜的一层保险。

## 项目状态与边界

- 这是**个人项目**，按「够用就好」维护，不承诺 API 稳定，也不做多租户隔离。
- 代码注释是中文的，`docs/HISTORY.md` 是作者一路踩坑的原始记录，读起来像流水账，但排障很管用。
- 欢迎 Issue 与 PR，但请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## License

[MIT](LICENSE) © 2026 MinxTok

第三方素材说明见 [docs/CREDITS.md](docs/CREDITS.md)（Apple emoji 图片版权归 Apple Inc.，仅作界面展示用）。
