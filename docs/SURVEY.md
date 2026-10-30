# SurveyKing 接入（5.10.0 打底）

MinxTok 只做薄代理，问卷数据仍在 SurveyKing。

## 需要准备的两样

1. `SURVEYKING_BASE` —— SurveyKing 部署地址，如 `https://survey.example.com`（不带结尾斜杠）。
2. `SURVEYKING_TOKEN` —— 后台生成、用于 API 的令牌（代理会放在 `X-Access-Token` 头里）。

配到 Cloudflare Pages → Settings → Environment variables（production）。
配完不用改代码：`GET /api/survey/status` 会从 `configured:false` 变成 `true`。

## 已实现的接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/survey/status` | 是否已配置，前端据此决定显示入口还是提示未配置 |
| GET/POST | `/api/survey/proxy?path=/api/xxx` | 白名单转发，只允许 `/api/` `/survey/` `/s/` `/js/` 开头 |

白名单在 `src/survey.js` 的 `ALLOW_PREFIX`，需要放宽就改这里，不要去掉前缀校验。

## 还没做的

- 前端入口（放设置里还是学习中心，等明轩定）。
- 具体问卷的内容与 id，需要 SurveyKing 那边建好问卷后给出。
