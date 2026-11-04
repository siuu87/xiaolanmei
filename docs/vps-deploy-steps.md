# 小蓝莓 · VPS 从零部署步骤清单（给执行 AI / 你自己一步步照做）

> 用途：在一台**全新、从没跑过小蓝莓**的云服务器（阿里云 / 腾讯云 / 任意 Debian/Ubuntu VPS）上，
> 把「小蓝莓」完整跑起来并开放公网 HTTPS 访问。
> 本文是**原子化步骤清单**——每步独立可执行，跑完回报结果，再走下一步。卡住就把报错贴回。
>
> 假设系统：**Ubuntu 22.04 / 24.04（apt 系）**。其它发行版对应改包管理器即可（CentOS 用 `dnf`，Arch 用 `pacman`）。
> 设计参考仓库内的 `docs/vps-connect.md`（本文件是其「拆成一步一动」的可执行版）。

---

## 阶段 0 · 本机侧前置（不用登 VPS）

**0.1 域名（可选但推荐）**：买一个域名，加一条 **A 记录 → VPS 公网 IP**。没有域名也能用，但只能用 `http://IP`（证书不好发，且手机体验差）。
**0.2 安全组 / 防火墙**：在云控制台**放行 22（SSH）、80（HTTP）、443（HTTPS）**。22 不通就永远 ssh 不上——头号连不上原因。

> 做完 0.1 / 0.2 再继续。

---

## 阶段 1 · 登录 VPS

**步骤 1.1｜SSH 登录**
```bash
ssh root@<VPS公网IP>
```
- ✅ 进入 shell 提示符。
- ❌ 超时 / 拒绝 → 检查 IP、安全组 22 是否放行、用户名（Ubuntu 常是 `ubuntu` 而非 `root`，需用 `ssh ubuntu@<IP>` 再 `sudo -i`）。
- 推荐改成密钥登录：`ssh-keygen -t ed25519`（本机 PowerShell）→ `ssh-copy-id root@<IP>`。

---

## 阶段 2 · 系统基础

**步骤 2.1｜更新系统 + 装基础工具**
```bash
apt update && apt upgrade -y
apt install -y git curl python3 python3-venv python3-pip ufw
```
- ✅ 无报错；`git --version` 有输出。

---

## 阶段 3 · 安装 Node 24（关键）

> 后端 `better-sqlite3` 按 **NODE_MODULE_VERSION 137（Node 24）** 编译，**必须用 Node 24**，否则启动报 `ERR_DLOPEN_FAILED`。

**步骤 3.1｜NodeSource 装 Node 24**
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node -v        # 期望 v24.x
npm -v
```
- ✅ `node -v` 输出 `v24.x`。
- ❌ 版本不对 → 重装；装完 `node -v` 仍是旧的，可能系统有旧 node 残留，用 `which node` 看路径并重装/更新 alternatives。

---

## 阶段 4 · 装 pm2（进程守护）

**步骤 4.1｜全局装 pm2**
```bash
npm i -g pm2
pm2 -v
```
- ✅ `pm2 -v` 有版本号。

---

## 阶段 5 · 拉代码 + 装依赖

**步骤 5.1｜克隆仓库**
```bash
cd ~
git clone https://github.com/siuu87/xiaolanmei.git
cd xiaolanmei
git log --oneline -1    # 期望看到 ceeaf54 或更新的提交（含礼物盒 + UI 大改）
```
- ✅ 克隆成功，`git log` 顶端是较新提交。

**步骤 5.2｜装后端依赖**
```bash
cd 后端 && npm i
```
- ✅ 无 `ERR_DLOPEN_FAILED`；`npm i` 结束无致命错误。
- ❌ `ERR_DLOPEN_FAILED` → Node 版本不是 24（回步骤 3 重装）。

**步骤 5.3｜装前端依赖**
```bash
cd ../前端 && npm i
```
- ✅ 无报错。

---

## 阶段 6 · 配置后端环境变量

> API Key 只在后端 `.env`，已被 gitignore，不会进仓库。但 VPS 上要自己保护好。

**步骤 6.1｜生成 .env**
```bash
cd 后端
cp .env.example .env
```
**步骤 6.2｜编辑 .env（用 nano / vim）**
```bash
nano .env
```
按 `.env.example` 里的注释填：
- **LLM 接入**：`BASE_URL` + `API_KEY` + `MODEL_LIST`（聊天/AI 能力必需；不填也能起服务，但聊天会报错）。
- `XINCHAO_URL` / `XINCHAO_TOKEN`：心潮·念（可选；**同一台机器就填 `http://127.0.0.1:18110`**，没起侧车就留空/注释掉）。
- `OMBRE_DASHBOARD_URL` / `OMBRE_DASHBOARD_PASSWORD`：Ombre Brain 记忆中枢（可选，没接就留空 → 界面显示「记忆中枢还没接上」，不报错）。
- `EMOTION_MODEL` 等可按需填（留空 = 复用主模型）。

- ✅ `.env` 保存，`chmod 600 .env`（保护好密钥）。

---

## 阶段 7 · 构建前端

**步骤 7.1｜生产构建**
```bash
cd ../前端
npm run build
```
- ✅ 末尾 `✓ built in Xs`，在 `前端/dist/` 下生成 `index.html` + `assets/`。
- ❌ 报错（`RollupError` / `Transform failed`）→ 把完整报错贴回定位（多半是某个 import 路径/语法）。

---

## 阶段 8 · 用 pm2 启动（后端 + 前端）

**步骤 8.1｜启动后端（3001）**
```bash
cd ../后端
pm2 start "node --import tsx src/server.ts" --name xiaolan-backend
```
- ✅ `pm2 ls` 里 `xiaolan-backend` 状态 `online`。
- ❌ `online` 秒变 `errored` → `pm2 logs xiaolan-backend` 看报错（多半是 `.env` 没填好或 Node 版本错）。

**步骤 8.2｜启动前端（5173，服务 dist/）**
```bash
cd ../前端
pm2 serve dist 5173 --name xiaolan-frontend --spa
```
- `--spa` 让前端所有路由（/gifts、/notes、/xinchao…）回退到 index.html，刷新不 404。
- ✅ `pm2 ls` 里 `xiaolan-frontend` 状态 `online`。

---

## 阶段 9 · 开机自启

**步骤 9.1｜保存进程 + 注册自启**
```bash
pm2 save
pm2 startup
```
- `pm2 startup` 会**打印一行 `sudo env ... pm2 startup ...` 命令**，把它完整复制执行一遍（否则重启不自动拉起）。
- ✅ 执行后提示 `Setup Complete`。

---

## 阶段 10 · nginx 反代 + HTTPS

**步骤 10.1｜装 nginx + certbot**
```bash
apt install -y nginx
apt install -y certbot python3-certbot-nginx
```

**步骤 10.2｜写 nginx 站点配置**
```bash
nano /etc/nginx/sites-available/xiaolanmei
```
粘贴（把 `your.domain.com` 换成你的域名）：
```nginx
server {
    listen 80;
    server_name your.domain.com;
    # certbot 会自动加 443 + 证书，这里先留 80 让它验签
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
启用并测试：
```bash
ln -s /etc/nginx/sites-available/xiaolanmei /etc/nginx/sites-enabled/
nginx -t          # 期望 syntax is ok
systemctl reload nginx
```

**步骤 10.3｜申请免费证书（自动改 nginx 加 443）**
```bash
certbot --nginx -d your.domain.com
```
- ✅ 提示 `Congratulations`，证书已签发并自动配好 HTTPS 重定向。
- ❌ 域名未解析到本机 / 80 不通 → 先确认 0.1（A 记录已生效）和 0.2（80 放行）。

---

## 阶段 11 · 防火墙

**步骤 11.1｜只放必要端口**
```bash
ufw allow 22,80,443/tcp
ufw enable
ufw status
```
- ✅ `ufw status` 列出 22/80/443 `ALLOW`；**应用端口（5173/3001/侧车）不对外暴露**，只走 nginx 反代。

---

## 阶段 12 · 验证

**步骤 12.1｜本地探活**
```bash
curl -s -o /dev/null -w "front=%{http_code}\n" http://localhost:5173/
curl -s -o /dev/null -w "back=%{http_code}\n" http://localhost:3001/api/health
curl -s http://localhost:3001/api/gifts
```
- ✅ 前两项 `200`；第三项返回 `[]`（说明 gifts 表已建、路由通）。
- ❌ `/api/gifts` 404/500 → 后端没启动或没重启到新代码（`pm2 logs xiaolan-backend`）。

**步骤 12.2｜公网访问**
浏览器开 `https://你的域名`（没域名用 `http://VPS公网IP`）：
- 首页待办卡是新版（磨砂底、勾选划线消除）；
- 聊天顶栏右侧有**发光礼物盒图标** → 进 `/gifts`，能看到 4 件演示礼物，点盒子有层层拆封动效、拆完落纪念架；
- 聊天气泡正常（需 6.2 填了 LLM Key）。

---

## 阶段 13 · 可选侧车（按需，都在 VPS 上用 Node24/Python 起）

- 心潮·念 `xinchao/` → :18110（对应 `XINCHAO_URL`）
- 小食谱 `recipe-nook/` → :8790
- 记忆相册 `remember-me/` → :8787
- PaiVoice `pai-voice/` → :8780（AGPL-3.0，LICENSE 别删）
- 每个侧车按各自 README/启动命令起，再在 nginx 加对应 `location` 反代；**别忘了 ufw 不放行这些端口**。

---

## 阶段 14 · 常见故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 后端启动即 `errored`，日志 `ERR_DLOPEN_FAILED` | Node 不是 24 | 回步骤 3 装 Node 24，重装 `后端 npm i` |
| 公网 502（/api） | 后端没起或端口错 | `pm2 logs xiaolan-backend`；确认 3001 在监听 |
| 页面空白 / 旧界面 | 前端没 build 或没重启 | 回步骤 7 重 build + 步骤 8.2 重启 `xiaolan-frontend` |
| `/api/gifts` 404 | main 没拉到 / 后端没重启 | 确认 `git log` 含 ceeaf54；`pm2 restart xiaolan-backend` |
| HTTPS 证书失败 | 域名没解析 / 80 没开 | 确认 A 记录生效、安全组+ufw 放 80 |
| 聊天报错无回复 | `.env` 没填 LLM Key | 回步骤 6.2 填 `BASE_URL`/`API_KEY`/`MODEL_LIST`，重启后端 |

---

## 以后更新（已部署后的日常）

```bash
ssh root@<IP>
cd ~/xiaolanmei
git pull
# 若 package.json 变了：cd 后端 && npm i && cd ../前端 && npm i
cd 前端 && npm run build
pm2 restart xiaolan-backend xiaolan-frontend
```
前端改了界面**必须 build 再重启**，否则跑的还是旧 `dist/`。

> 卡在哪一步，把报错贴回给原开发者（或本仓库维护者）定位。
