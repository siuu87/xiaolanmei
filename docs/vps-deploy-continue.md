# 从「已在 VPS 上 git clone 完成」继续部署（单端口最短路径）

> 接续 `docs/vps-deploy-steps.md`。适用现状：已 SSH 登录 VPS（root），已把仓库克隆到 `~/xiaolanmei`，
> 在根目录跑 `npm install` 报 ENOENT（**这是正常的**：根目录没有 package.json，依赖在 `后端/`、`前端/` 子目录里）。
>
> 架构说明：后端 `src/server.ts` 启动时若发现 `前端/dist` 存在，会**直接把前端产物托管在自己端口上**
> （单端口 Host 模式 + SPA fallback，见 `server.ts` 的 Host 化注释）。所以**生产最小部署 = 只跑一个后端进程**，
> 前端、API 同源同端口，无需 nginx 也能完整访问。nginx + 域名 + HTTPS 是后续可选增强。

---

## 步骤 1｜先确认代码版本（最关键，Gitee 镜像可能滞后）

```bash
cd ~/xiaolanmei
git log --oneline -1
```
- ✅ 看到 `ceeaf54`（或更新的提交号）→ 继续。
- ❌ 不是 `ceeaf54`（比如还停在 `70c4456` 或更早）→ Gitee 镜像没同步到最新：
  1. 去 Gitee 仓库网页 → 找「同步 / 强制同步」按钮，从 GitHub `siuu87/xiaolanmei` 的 `main` 同步一次；
  2. 回 VPS：`git pull`；
  3. 重新 `git log --oneline -1` 确认到 `ceeaf54`。
  - **不同步就继续部署 = 礼物盒等新功能全都编译不进去**，后端也没有 `/api/gifts` 路由。

---

## 步骤 2｜确认 Node 版本（必须 v24）

```bash
node -v
```
- ✅ `v24.x` → 直接跳到步骤 3。
- ❌ 不是 24（或 command not found）→ 装 Node 24：
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node -v    # 再确认是 v24.x
```
- 原因：`better-sqlite3` 按 Node 24（NODE_MODULE_VERSION 137）编译，版本不对启动会 `ERR_DLOPEN_FAILED`。

---

## 步骤 3｜装后端依赖

```bash
cd ~/xiaolanmei/后端
npm install
```
- ✅ 无 `ERR_DLOPEN_FAILED`、无致命错误。
- ❌ 若报网络超时，可换国内源：`npm config set registry https://registry.npmmirror.com` 后重跑。

---

## 步骤 4｜装前端依赖

```bash
cd ../前端
npm install
```

---

## 步骤 5｜构建前端

```bash
npm run build
```
- ✅ 末尾出现 `✓ built in Xs`，`前端/dist/index.html` 生成。
- ❌ 进程被 `Killed` → 小内存机器（1G/2G）构建爆内存，加 2G swap：
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  ```
  然后重跑 `npm run build`。

---

## 步骤 6｜准备 .env（可以先不动）

```bash
cd ../后端
cp .env.example .env
```
- **不编辑也能启动**。`.env` 里的 `OPENAI_BASE_URL / OPENAI_API_KEY / DEFAULT_MODEL` 是兜底默认；
  真正的模型站配置之后**直接在网页 App 里填**（设置 → 模型站子），效果一样。
- 侧车（心潮 / OMBRE / PaiVoice）VPS 上没起就保持留空，相关功能会优雅降级，不报错。

---

## 步骤 7｜用 pm2 启动（就一个进程）

```bash
cd ~/xiaolanmei/后端
npm i -g pm2
pm2 start "node --import tsx src/server.ts" --name xiaolan-backend
pm2 ls
```
- ✅ `xiaolan-backend` 状态 `online`，且启动日志里能看到
  `📦 前端产物已托管: .../前端/dist（单端口 Host 模式）`（看日志：`pm2 logs xiaolan-backend --lines 20`）。
- ❌ `online` 秒变 `errored` → `pm2 logs xiaolan-backend` 贴报错。

---

## 步骤 8｜开机自启

```bash
pm2 save
pm2 startup
```
- `pm2 startup` 会**打印一行 `sudo env ... pm2 startup ...`**，把这行完整复制再执行一遍（只执行打印出来的那行）。

---

## 步骤 9｜本机自检

```bash
curl -s -o /dev/null -w "health=%{http_code}\n" http://localhost:3001/api/health   # 期望 200
curl -s http://localhost:3001/api/gifts                                            # 期望 []
curl -s -o /dev/null -w "front=%{http_code}\n" http://localhost:3001/              # 期望 200（前端已托管）
```
- 三项都符合 → 服务端就绪。

---

## 步骤 10｜阿里云安全组放行 3001，然后手机直接开

1. 阿里云控制台 → 实例 → 安全组 → 配置规则 → **入方向添加**：`3001/TCP，源 0.0.0.0/0`。
2. 浏览器 / 手机打开：**`http://39.107.61.179:3001`**
   - 首页待办卡是新版（磨砂底、勾选划线消除）；
   - 聊天顶栏右侧**发光礼物盒** → 点进 `/gifts` 有 4 件演示礼物，点盒子有拆封动效；
   - 刷新任意子页面（如 `/gifts`、`/notes`）不 404（SPA fallback 生效）。

> ⚠️ 3001 直连是**临时便捷做法**。正式长期用建议后续加 nginx（80/443 → 反代 127.0.0.1:3001）+ 域名 + HTTPS，
> 并把 3001 从安全组撤掉，只留 22/80/443。

---

## 步骤 11｜进网页配置 AI（聊天能用）

打开 `http://39.107.61.179:3001` → **设置 → 模型站子** → 填 Base URL + API Key + 模型列表（和本地一样的填法）。
填完聊天就有回复了。

---

## 以后更新代码（日常）

```bash
cd ~/xiaolanmei
git pull                 # Gitee 同步过最新后才有新代码
cd 后端 && npm install   # package.json 变了才需要
cd ../前端 && npm install && npm run build
pm2 restart xiaolan-backend
```
- 前端改了界面**必须重新 `npm run build`**，否则访问的还是旧 dist。
- 拿不准就 `pm2 restart xiaolan-backend` 一把梭。

---

## 常见问题速查

| 现象 | 原因 | 处理 |
|------|------|------|
| `npm install` 根目录报 ENOENT | 正常，根目录无 package.json | 去 `后端/`、`前端/` 里分别装 |
| 后端启动 `ERR_DLOPEN_FAILED` | Node 不是 24 | 步骤 2 重装 Node 24 + 重装后端依赖 |
| `/api/gifts` 404 | 代码版本 < ceeaf54 | 步骤 1 同步 Gitee + git pull + 重启 |
| 页面空白 / 旧界面 | 前端没 build 或没重启 | 步骤 5 重新 build + `pm2 restart xiaolan-backend` |
| build 被 Killed | 内存不足 | 步骤 5 加 swap |
| 聊天无回复 | 模型站没配 | 步骤 11 在网页设置里填 Key |
