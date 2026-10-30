# 参与贡献

## 提 Issue

- 说清环境（浏览器/系统）、复现步骤、期望结果与实际结果，最好带截图；
- 渲染问题请附上**原始输入文本**（不是截图里的排版），公式/化学式问题尤其需要；
- 不要贴任何密钥、token、手机号、uid。

## 提 PR

1. 一个 PR 只做一件事；
2. 改前端模块**必须**同时递增 `public/index.html` 里对应的 `?v=`，否则线上会读旧缓存；
3. 改 `public/js/*.js`（ES Module）后跑：

   ```bash
   for f in public/js/*.js; do cp "$f" /tmp/c.mjs && node --check /tmp/c.mjs || echo "PARSE_FAIL $f"; done
   ```

   `node --check` 直接跑 `.js` 对含 `import` 的文件不可靠，必须复制成 `.mjs`。
4. 改后端后跑：

   ```bash
   node scripts/build-pages.mjs && node --check dist/_worker.js
   node --test tests/render.test.mjs
   ```

5. 顺手在 `docs/HISTORY.md` 记一条，写清**改了什么、为什么改**。

## 代码风格

- 中文注释，解释「为什么」而不是「做了什么」；
- 不引入前端框架与运行时依赖，能手写就手写；
- 客户端代码禁用正则 lookbehind（老 Safari 会在解析期报语法错误，整包失效）；
- 动画只动 `opacity`/小位移，避免长列表触发重排。

## 提交信息

```
fix(chem): Fe2+ 归一化后仍查不到
feat(emotion): 新增专注/好奇/无聊三档
chore(docs): 补 v7 路线
```
