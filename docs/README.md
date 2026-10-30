# MinxTok 文档索引

| 文档 | 什么时候看 |
| --- | --- |
| [OPERATIONS.md](./OPERATIONS.md) | 出问题、要改代码、要部署、要看目录/接口/额度/排障 |
| [HISTORY.md](./HISTORY.md) | 想知道某个版本改了什么、项目怎么走到今天 |
| [KEYBOARD.md](./KEYBOARD.md) | 要排查/优化键盘与滚动卡顿，或想把问题交给外部评审时（含完整代码片段、失败方案清单、待答问题） |
| [ROADMAP.md](./ROADMAP.md) | 看当前版本冻结决定、v5.00 候选方向与重启条件 |
| [UI-SPEC.md](./UI-SPEC.md) | 改界面前确认文件分工、层级、动效红线 |
| [assistant-settings-spec.md](./assistant-settings-spec.md) | 改助理设置/人格时 |
| [rebuild-plan-v1.md](./rebuild-plan-v1.md) | 了解 10-18 重建期的原始计划（历史资料） |
| [ui-observations.md](./ui-observations.md) | 了解旧站观察与重建设计依据（历史资料） |

## 当前状态

- 线上：https://minxtok.pages.dev
- 版本：**6.2.0（2026-10-30，最新稳定版）**
- 状态：稳定维护；6.2.0 加了全站日调用上限与错误提示分类，6.1.x 完成情绪分档与抽屉打磨；细节见 `HISTORY.md`
- 前端入口：`public/js/app.js`（v415）
- Worker 入口：`src/index.js`
- 构建：`node scripts/build-pages.mjs`
- 部署：`wrangler pages deploy dist --project-name minxtok --branch main`

## 维护约定

1. 先读 `OPERATIONS.md` 的“一页速查”和“故障排查表”；
2. 只改一个子系统，沿依赖链升缓存版本；
3. 构建后必须 `node --check dist/_worker.js`；
4. 部署后用 `curl` 核对线上 query 版本；
5. 发布后补 `CHANGELOG`、`HISTORY.md` 和当天 `memory/` 日记。

> 需要动它时，按手册来，不凭记忆硬改。
