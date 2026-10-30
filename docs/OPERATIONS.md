# MinxTok 运维速查（一页）

> 对应线上：**6.2.0（最新稳定版）** ｜ 正式站 https://minxtok.pages.dev
> 关键缓存版本：app `v415` / theme `v308` / blocks `v172` / dict `v31`（`blocks.js` 被 5 处 import，改一次要全改）
> 历史版本看 `HISTORY.md`，索引看 `README.md`，路线看 `ROADMAP.md`。

## 1. 改完代码的标准流程

```bash
cd minxtok
cp public/js/app.js /tmp/check.mjs && node --check /tmp/check.mjs   # ★ ESM 解析自检，必做
node scripts/build-pages.mjs                                        # public/ → dist/_worker.js
node --check dist/_worker.js
npx wrangler pages deploy dist --project-name minxtok --branch main --commit-dirty=true
```

部署后必须验线上：

```bash
curl -s https://minxtok.pages.dev/ | grep -o 'app.js?v=[0-9]*\|theme.css?v=[0-9]*'
curl -s "https://minxtok.pages.dev/js/app.js?v=NN" -o /tmp/L.mjs && node --check /tmp/L.mjs  # 再验一次解析
```

## 2. ★ ESM 解析自检（5.1.16 白屏事故教训）

- `node --check public/js/app.js` 对含 `import` 的模块**不可靠**（会按普通脚本解析/跳过检查），必须**复制成 `.mjs`** 再查。
- 症状：脚本解析失败 → `window.__minxBooted` 永远到不了 → 页面死死停在加载页，看门狗 15 秒后弹「脚本没加载起来：Uncaught SyntaxError: Unexpected token」。
- 批量查：

```bash
for f in public/js/*.js; do cp "$f" /tmp/c.mjs && node --check /tmp/c.mjs || echo "PARSE_FAIL $f"; done
```

- 用 Python 做区间替换时，`s.index(锚点, start)` 命中**第一处**锚点；锚点若在同一函数里重复出现（例：`document.body.classList.remove('kb-anim');` 在 `kbMotion` 与文件尾部各有一份），会把新代码插在半途、留下残块 → 整模块解析失败。改完必须跑上面的自检。

## 3. 版本号与缓存链

- `public/index.html` 里的 `?v=` 必须 bump：`app.js`、`theme.css`、以及被改动的模块。
- **改了内容的模块必须 bump 自己的 `?v=`**，否则老缓存仍会 import 旧 `ui.js?v=`，模块双实例复活（5.1.0 教训）。
- 当前（5.1.16）：`app.js?v=345`、`theme.css?v=254`、`ui.js?v=140`、`i18n.js?v=106`、`theme.js?v=95`、`archive.js?v=10`、`assistant.js?v=15`、`blocks.js?v=147`、`course.js?v=23`、`credits.js?v=4`、`draw.js?v=39`、`drill.js?v=45`、`games.js?v=80`、`haptics.js?v=3`、`onboarding.js?v=17`、`state.js?v=3`、`store.js?v=3`、`study.js?v=95`。
- 每个构建都有独立域名：`https://<hash>.minxtok.pages.dev`，回滚可直接指回旧 hash。

## 4. 后端绑定与密钥

- KV：`minxtok-kv`，namespace `YOUR_KV_NAMESPACE_ID`（wrangler 需 `--namespace-id=` + `--remote`）；绑定名 `MINXTOK_KV`。
- D1：`minxtok-db`，绑定名 `DB`。
- 密钥一律走环境变量或 `wrangler pages secret put`，**不要写进仓库**：`LLM_API_KEY`、`ADMIN_TOKEN`、`PAY_KEY_SECRET`、`ALIYUN_AK_ID`、`ALIYUN_AK_SECRET`。
- Pay key：`PAY_KEY_SECRET=... node scripts/pay-key.mjs`（只在本机跑，密钥不进仓库）。
- 前端不写任何 key/密码；所有密钥只存在 Pages secret 里，前端与仓库都拿不到。

## 5. 关键 KV 键

`paytok:<uid>`、`paytok:t:<token>`（3600）、`paygate:<token>`、`payused:<token>`（86400）、`payfail:<ip>`（600）、`paynotify:<uid>`（3600）、`stock:<uid>`、`sess:<token>`。

## 6. 排障清单

| 症状 | 先查 |
| --- | --- |
| 卡在加载页 / 白屏 | 线上 `app.js` 抓下来 `.mjs` 跑 `node --check`；`/api/session` 是否 401 正常返回 |
| 改了样式没生效 | `index.html` 的 `?v=` 是否 bump；模块自身 `?v=` 是否 bump |
| 事件绑了两次 / 状态错乱 | `ui.js` 是否被两套 `?v=` 加载（状态必须挂 `window.__uiState`） |
| 键盘相关抖动 | 见 `HISTORY.md` 5.1.6–5.1.16（当前为 `resizes-content` 方案，键盘只做一次贴底） |
| 部署 9106 报错 | 改用 `npx wrangler pages deploy dist …`，别用 `deploy-pages.mjs` |

## 7. 红线

- 单次写入工作区文件总量 ≤ 20MB；大文件放 `/tmp`。
- 配置/调度类文件只增量改，不整文件覆盖。
- 记忆文件追加一律 `cat >>`，不要 `write` 覆盖。
- 大更新暂缓，只接明确 bug/小需求。
