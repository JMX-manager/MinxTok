# MinxTok · 明叙 重建规划 v1（草案）

> 起草：2026-10-18　状态：待明轩拍板
> 依据：旧站截图（docs/ui-observations.md）、旧 RESEARCH-PLAN 五期大纲、明轩新要求（源码在工作区、弃用 cpolar）

## 0. 目标与非目标

**目标**
- 从零重写，不复用旧代码，避免继承旧 bug
- 源码全部落在项目根目录，随时可看、可拷、可迁移
- 对话体验对齐旧站：深色极简、虾虾人设、引用、追问建议、额度

**非目标（本期不做）**
- 多用户/注册登录（先单用户或简单口令）
- 复杂富媒体编辑器

## 1. 技术选型（建议）

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | 原生 HTML + CSS + ES Modules，无框架 | 零构建、源码可读、手机端轻 |
| 渲染 | `renderers/` 每类块一个模块 | 与旧规划一致，便于扩展 |
| 后端 | Node.js（内置 http 或 Fastify） | 与网关同运行时，部署简单 |
| 存储 | 单文件 JSON → 后期可换 SQLite | 先跑通，避免依赖编译 |
| 流式 | SSE（`text/event-stream`） | 兼容性好，比 WebSocket 简单 |
| 安全 | 后端持 key，前端零密钥；DOMPurify 白名单 | 旧站最大隐患 |

## 2. 目录结构

```
minxtok/
├── docs/                # 规划、截图观察、决策记录
├── public/
│   ├── index.html
│   ├── assets/          # css、图标
│   └── js/
│       ├── app.js       # 入口、路由、状态
│       ├── api.js       # 后端请求 + SSE
│       ├── blocks.js    # Block 模型与校验
│       └── renderers/   # text / quote / music / news / image / link / quota
├── server/
│   ├── index.js         # HTTP 服务、静态托管、/api/chat
│   ├── llm.js           # 模型调用与流式转换
│   ├── quota.js         # 额度计数
│   └── store.js         # 会话与消息持久化
├── data/                # 运行时数据（git 忽略）
└── README.md            # 启动、备份、迁移说明
```

## 3. 核心设计

### 3.1 消息模型（第一天就用 Block 数组）

```json
{
  "id": "msg_...",
  "role": "assistant",
  "createdAt": 1792300000000,
  "blocks": [
    { "type": "text", "text": "金明，想犯困呀……" },
    { "type": "followups", "items": ["数虾真有用吗", "还能聊点啥", "你困时听什么歌"] }
  ]
}
```

- 旧站把追问、引用、卡片塞在 DOM 里，才长出「追问三连」bug。新站一律进数据。
- 块类型：`text` `quote` `music` `news` `image` `link` `quota` `followups`
- 前端渲染器按 `type` 分发，未知类型降级为纯文本（前向兼容）

### 3.2 接口

- `POST /api/chat` → SSE 流：`event: delta` / `event: block` / `event: done`
- `GET /api/history` → 消息列表
- `POST /api/quote` → 引用上下文
- `GET /api/quota` → 剩余次数

### 3.3 安全

- API Key 只在服务端 `.env`（600 权限），不进 git、不进前端
- 所有富文本过白名单（DOMPurify 或自写最小集）
- 单条输入长度上限、请求频控
- 服务仅监听 127.0.0.1，由隧道反代

## 4. 实施阶段

- **P0 骨架（0.5 天）**：目录、静态页、深色主题、假数据渲染
- **P1 对话闭环（1 天）**：SSE + 后端模型调用 + Block 渲染 + 追问块
- **P2 数据与额度（1 天）**：持久化、历史加载、额度计数、引用
- **P3 卡片能力（1~2 天）**：音乐卡、新闻卡、图片、外链、额度卡
- **P4 打磨（1 天）**：空状态、错误重试、移动端适配、README、备份脚本

每期结束给明轩一个可访问地址 + 变更说明，验收后再进下一期。

## 5. 部署（弃用 cpolar）

候选：
1. **Cloudflare Tunnel**（推荐）：免费、稳定、支持命名隧道+自定义域名；quick tunnel 可零账号起手
2. ngrok：免费额度够用，需账号 token
3. frp：需要一台公网服务器，成本高
4. 纯静态托管（GitHub Pages/Vercel）：后端跑不了 AI 调用，不适合

默认方案：本地 Node 服务 + Cloudflare Tunnel；隧道地址写入 `data/public-url.txt`，重启自动更新。

## 6. 待明轩拍板

1. 仓库：`jmx-manager` 下新建私有仓库？仓库名？
2. 凭据：GitHub 细粒度 PAT（contents 读写）还是 SSH deploy key？
3. 部署：Cloudflare Tunnel 是否可以（需注册账号，免费）？
4. 后端语言：Node 还是 Python？
5. 额度规则：总次数（如旧站剩余 N 次）还是每日重置？
