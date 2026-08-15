# 明叙访客门户 · 通道路由

一个**固定地址**的 GitHub Pages 导航页，永久转发到 guest-portal 的**最新可用公网隧道地址**。

## 为什么需要它

guest-portal 用 cpolar 免费版开公网隧道，而免费版分配的域名是**临时随机域名**（如 `5ac27569.r8.cpolar.cn`），每次服务重启都会变，旧地址随即 404。

这个路由页托管在 GitHub Pages 上，**地址永久不变**。朋友只需记住这一个链接，打开它就能看到当前真实可用的入口，一键进入。

## 页面组成

| 文件 | 作用 |
|------|------|
| `index.html` | 导航页本体：显示最新地址 + 一键进入 + 复制/管理后台 |
| `config.js` | **唯一需要改的文件**，存 `LATEST_URL` / `ADMIN_URL` |
| `README.md` | 本说明 |

## 日常更新方法（cpolar 地址变化时）

1. 编辑 `config.js`，把 `LATEST_URL` 改成最新隧道地址（`ADMIN_URL` 对应改）。
2. 可选：顺手更新 `LATEST_UPDATED` 时间。
3. `git add -A && git commit -m "update tunnel" && git push origin main`
4. 等 1~3 分钟，GitHub Pages 自动重新部署，页面显示新地址。

## 首次部署（GitHub Pages）

1. 新建空仓库（例如 `guest-portal-nav`），把本目录三个文件推上去，**分支用 `main`**。
2. 仓库 Settings → Pages → Build and deployment：
   - Source: **Deploy from a branch**
   - Branch: `main` / root（如果用的 GitHub Pages 项目站点，页面在 `/guest-portal-nav/` 下）
3. 部署完成后访问：
   - 用户仓库：`https://<你的用户名>.github.io/guest-portal-nav/`
   - （如放账号主页仓库）`https://<你的用户名>.github.io/`（根）

## 私密性

- 页面**不含**任何登录密钥、admin 随机文件名之外的敏感信息。
- `ADMIN_URL` 依赖随机化文件名做防扫描；若不想在公网暴露，可把 `window.ADMIN_URL` 留空字符串。
- 原 guest-portal 隧道本身仍带 `httpauth` 认证，此处仅做地址路由。
