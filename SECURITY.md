# 安全策略

## 报告漏洞

请**不要**开公开 issue。把复现步骤、影响范围、可能的修复思路发到维护者的 GitHub 主页邮箱（见 profile），标题前缀 `[SECURITY] minxtok`。

- 3 个工作日内确认收到；
- 修复后会在 `docs/HISTORY.md` 记一条（隐去细节），并在 Release 里说明。

## 这个仓库里不会有密钥

- 所有密钥只通过 Cloudflare 的 secret 注入（`wrangler pages secret put`），或本机环境变量临时使用；
- `.gitignore` 已排除 `.env*`、`.dev.vars`、`wrangler.toml`、`*.pem`、`*.key`、`secrets/`；
- 历史上没有、将来也不会把 API Key、`ADMIN_TOKEN`、`PAY_KEY_SECRET`、短信 AK 写进源码；
- 如果你在任意 commit 里看到疑似密钥，请立刻报告，我们会轮换并清理历史。

## 自己部署时必须做的加固

| 项 | 做法 |
| --- | --- |
| 管理端鉴权 | `ADMIN_TOKEN` 用 `openssl rand -hex 32` 生成，只存 secret |
| 全站防刷 | 设 `GLOBAL_DAILY_CAP`，配合 `DAILY_QUOTA` 与 `RATE_PER_MIN` |
| CORS | 上线改成自己的域名，不要留 `*` |
| 模型账单 | 在模型服务商后台设置硬性额度上限，别只靠应用层 |
| 注册入口 | 关闭匿名注册，只留短信/邀请 |
| 数据导出 | D1 备份含用户隐私，按个人信息处理 |
| 支付密钥 | `PAY_KEY_SECRET` 泄露即轮换，旧密钥当天失效 |

## 已知的设计取舍

- 项目面向个人自用，**没有做多租户隔离**，不适合直接做成公共 SaaS；
- 管理接口是 token 门槛而非角色系统，拿到 `ADMIN_TOKEN` 即等于管理员；
- 对话内容会进 D1 原文保存，请自行评估合规要求。
