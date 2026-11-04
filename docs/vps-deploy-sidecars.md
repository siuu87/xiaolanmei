# VPS 侧车（插件）部署手册

> 接续 `docs/vps-deploy-continue.md`。前置：主后端 `xiaolan-backend` 已在 VPS 上 `pm2` 跑起来（单端口 3001，已验证可访问 `http://39.107.61.179:3001`）。
>
> 本手册把四个「侧车服务」也拉起来：**心潮·念 / 记忆相册 / 小食谱 / PaiVoice 语音**。  
> 它们各自是独立进程，要各自装依赖、各自用 `pm2` 守护，再回填主后端 `.env` 的对应 URL，最后重启主后端。

---

## 先搞懂两类连接（决定哪些端口要公网放行）

| 侧车               | 端口    | 谁连它                   | 公网放行？              |
| ---------------- | ----- | --------------------- | ------------------ |
| 心潮·念 xinchao     | 18110 | **主后端**（服务器内部）        | ❌ 不用（127.0.0.1 即可） |
| 记忆相册 remember-me | 8787  | **主后端**（服务器内部）        | ❌ 不用               |
| 小食谱 recipe-nook  | 8790  | **浏览器**（用户手机直连）       | ✅ 要放行              |
| PaiVoice 语音      | 8780  | **浏览器**（WebSocket 直连） | ✅ 要放行              |

> 浏览器在用户手机上，所以小食谱 / PaiVoice 的地址必须是**公网 IP**（代码已改：小食谱跟随访问域名；PaiVoice 由后端 `.env` 的 `PAIVOICE_WS_URL` 下发）。  
> 心潮·念 / 记忆相册只被同一台 VPS 上的主后端调用，用 `127.0.0.1` 就够了，反而更安全（不暴露端口）。
>
> ⚠️ **本次改了前端代码**（小食谱地址写死 → 跟随域名），所以四个侧车都起来后，主前端必须**重新 `npm run build`** 才能让小食谱在 VPS 上可用。见末尾「收尾」。

---

## 阿里云安全组：先放行两个浏览器侧车端口

控制台 → 实例 → 安全组 → 配置规则 → **入方向** 添加两条：

| 协议      | 端口范围        | 源           |
| ------- | ----------- | ----------- |
| 自定义 TCP | `8790/8790` | `0.0.0.0/0` |
| 自定义 TCP | `8780/8780` | `0.0.0.0/0` |

（18110 / 8787 是内部端口，**不要**放行。）

---

## ① 心潮·念（xinchao，Node，端口 18110）

```bash
cd ~/xiaolanmei/xinchao
npm install
# 生成随机服务令牌（≥32 字符）
SERVICE_TOKEN=$(openssl rand -hex 32)
cp .env.example .env
# 写入最小可用配置
sed -i "s|^SERVICE_TOKEN=.*|SERVICE_TOKEN=$SERVICE_TOKEN|" .env
sed -i "s|^PORT=.*|PORT=18110|" .env
# 模型默认 MODEL_ENABLED=false，不填也能跑（只是没有 AI 主动能力）
pm2 start "node --env-file=.env src/server.js" --name xinchao --cwd ~/xiaolanmei/xinchao
pm2 logs xinchao --lines 15
```

- ✅ 日志里出现 `listening` / 无报错 → 成功。
- 回填主后端 `.env`：
  ```bash
  cd ~/xiaolanmei/后端
  # XINCHAO_TOKEN 必须与上面生成的 SERVICE_TOKEN 完全一致
  sed -i "s|^XINCHAO_URL=.*|XINCHAO_URL=http://127.0.0.1:18110|" .env
  sed -i "s|^XINCHAO_TOKEN=.*|XINCHAO_TOKEN=$SERVICE_TOKEN|" .env
  ```

---

## ② 记忆相册（remember-me，Python，端口 8787）

```bash
cd ~/xiaolanmei/remember-me
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -e ".[standalone]" 2>&1 | tail -20   # 留意有无报错
# 用安装好的 console 脚本（比 -m 更稳，避免 pm2 把 -m 当自己的参数）
pm2 delete remember-me 2>/dev/null
pm2 start ~/xiaolanmei/remember-me/.venv/bin/remember-me --name remember-me -- \
  serve --host 127.0.0.1 --port 8787
pm2 logs remember-me --lines 15
```

- ✅ 日志出现 `host=127.0.0.1 port=8787` → 成功。
- 回填主后端 `.env`：
  ```bash
  cd ~/xiaolanmei/后端
  sed -i "s|^REMEMBER_ME_URL=.*|REMEMBER_ME_URL=http://127.0.0.1:8787|" .env
  ```

---

## ③ 小食谱（recipe-nook，Python，端口 8790，浏览器直连）

```bash
cd ~/xiaolanmei/recipe-nook
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt
# 可选：cp .env.example .env 并填 LLM_BASE_URL/LLM_API_KEY（不填则「估热量」按钮提示未配置，查表照常用）
pm2 start ~/xiaolanmei/recipe-nook/.venv/bin/python --name recipe-nook -- \
  -m uvicorn server:app --host 0.0.0.0 --port 8790
pm2 logs recipe-nook --lines 15
```

- ✅ 日志出现 `Uvicorn running on http://0.0.0.0:8790` → 成功。
- **无需改主后端 `.env`**：前端小食谱地址已改为跟随访问域名（VPS 上自动用 `http://39.107.61.179:8790`）。
- 安全组 `8790` 已在上面放行。

---

## ④ PaiVoice 语音（pai-voice，Python，端口 8780，浏览器 WS 直连）

```bash
cd ~/xiaolanmei/pai-voice/realtime-core
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt 2>&1 | tail -20   # 留意有无报错
# ⚠️ 必须 --cwd 到 realtime-core，否则 server.py 相对路径与同目录的 vision 模块都找不到
pm2 delete paivoice 2>/dev/null
PAIVOICE_HOST=0.0.0.0 PAIVOICE_PORT=8780 PAIVOICE_TOKEN=$(openssl rand -hex 16) \
  pm2 start ~/xiaolanmei/pai-voice/realtime-core/.venv/bin/python \
  --name paivoice --cwd ~/xiaolanmei/pai-voice/realtime-core -- server.py
pm2 logs paivoice --lines 15
```

- ✅ 日志出现 `PaiVoice listening on ws://0.0.0.0:8780` → 成功。
- 默认 `PAIVOICE_ASR_PROVIDER/PAIVOICE_TTS_PROVIDER=mock`：服务能起、能握手，但**不会真正识别/合成语音**。要真语音就在 VPS 的 shell 里先 `export` 再启动：
  ```bash
  export PAIVOICE_ASR_PROVIDER=groq
  export GROQ_API_KEY=你的groq_key
  export PAIVOICE_TTS_PROVIDER=elevenlabs
  export ELEVENLABS_API_KEY=你的11labs_key
  export PAIVOICE_ELEVEN_VOICE_ID=声音ID
  ```
- 回填主后端 `.env`（**用公网 IP**，前端才会拿到能连的地址）：
  ```bash
  cd ~/xiaolanmei/后端
  sed -i "s|^PAIVOICE_WS_URL=.*|PAIVOICE_WS_URL=ws://39.107.61.179:8780|" .env
  ```
- 安全组 `8780` 已在上面放行。

---

## 收尾：重启主后端 + 重新构建前端（关键！）

小食谱这次改了前端代码，必须重新 build，否则 VPS 上小食谱还是连 `127.0.0.1`：

```bash
# 1) 拉最新代码（Gitee 已从 GitHub 同步到含 FoodPage 修复的提交后）
cd ~/xiaolanmei && git pull
# 2) 重新构建前端
cd 前端 && npm install && npm run build
# 3) 重启主后端（让它重新读 .env 里新填的 XINCHAO/REMEMBER/PAIVOICE 地址）
pm2 restart xiaolan-backend
# 4) 让所有侧车开机自启
pm2 save
```

---

## 自检清单

```bash
# 主后端 + 前端托管
curl -s -o /dev/null -w "health=%{http_code}\n" http://localhost:3001/api/health
# 各侧车本地探活
curl -s -o /dev/null -w "xinchao=%{http_code}\n"   http://localhost:18110/
curl -s -o /dev/null -w "remember=%{http_code}\n"  http://localhost:8787/
curl -s -o /dev/null -w "recipe=%{http_code}\n"     http://localhost:8790/
# PaiVoice 是 WS，用端口探活
(ss -ltnp 2>/dev/null | grep -E ':8780|:8790|:8787|:18110') || (netstat -ltnp 2>/dev/null | grep -E ':8780|:8790|:8787|:18110')
```

`pm2 ls` 应看到 5 个进程：`xiaolan-backend`、`xinchao`、`remember-me`、`recipe-nook`、`paivoice`，全部 `online`。

---

## 常见问题

| 现象                         | 原因                             | 处理                                                                      |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| 小食谱在手机上打不开（白屏/连自己）         | 前端还是旧 build（写死 127.0.0.1）      | 收尾第 2 步重新 `npm run build` + `pm2 restart xiaolan-backend`               |
| 小食谱提示「侧车未启动」               | 8790 没起 / 安全组没放行               | `pm2 logs recipe-nook`；确认安全组 8790 入方向已开                                 |
| PaiVoice 通话连不上             | `PAIVOICE_WS_URL` 还是 127.0.0.1 | 主后端 `.env` 改成 `ws://39.107.61.179:8780` 后 `pm2 restart xiaolan-backend` |
| 心潮·念起不来 `SERVICE_TOKEN` 报错 | 用了占位值或太短                       | `openssl rand -hex 32` 生成真值，且 `XINCHAO_TOKEN` 与其一致                      |
| remember-me 报缺依赖           | 没装 `[standalone]` extra        | `pip install -e ".[standalone]"`                                        |
| 重启 VPS 后侧车没起来              | 没 `pm2 save`                   | 跑 `pm2 save`；若已丢：`pm2 resurrect` 或重新按本文启动                               |

---

## 以后更新

代码改动（含前端）后，在 VPS 上：

```bash
cd ~/xiaolanmei && git pull
cd 前端 && npm install && npm run build
pm2 restart xiaolan-backend
# 只有侧车自身改了才需各自 restart
```

侧车配置（如换 ASR/TTS Key）改完对应环境变量后 `pm2 restart <名>`。
