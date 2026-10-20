# 小蓝莓 🫐

两个人的专属 AI 陪伴空间。本地优先、可多端使用（手机 + 电脑）、可自我扩展。

一个会陪你聊天、记备忘录、管待办和课表、一起做饭读书听歌、哄你睡觉，还能自己写代码的温柔陪伴者。

## 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + React Router
- **后端**：Node.js + Fastify + SQLite（better-sqlite3）+ Drizzle ORM
- **AI**：OpenAI 兼容协议（可接入 DeepSeek / Qwen / o 系列等任意网关与模型）
- **原生**：Android（Kotlin + AccessibilityService，真·控手机）
- **部署**：阿里云 VPS + PWA

## 目录结构

```
小蓝莓/
├── 前端/     React 前端（Vite，端口 5173）
├── 后端/     Fastify 后端（代理 API Key、SQLite 数据库，端口 3001）
├── android/  真·控手机的原生 Android 桥（无障碍服务 + SSE 长连接）
├── docs/     说明文档（phone-control.md 等）
├── handoff/  交接说明（给外部设计/编码助手；zip 快照不入库）
├── scripts/  本地辅助脚本（如 start-remember-me.sh）
└── deploy/   部署配置（Docker + Nginx）
```

## 本地运行

### 后端（端口 3001）

```bash
cd 后端
npm install
npm run dev
```

首次使用可在「设置 → 模型站子」里配置 Base URL + API Key + 模型列表。
Key 只存在后端，绝不下发前端。

可选能力（都不配也能正常聊天）：

```bash
# 后端/.env —— 情绪增量分析用的小模型（留空 = 复用主模型）
EMOTION_MODEL=
EMOTION_MAX_TOKENS=100
EMOTION_ANALYZER=on

# 后端/.env —— 心潮·念（取代 Ombre Brain；留空 = 回退本地情绪面板）
XINCHAO_URL=http://127.0.0.1:18110
XINCHAO_TOKEN=

# 后端/.env —— PaiVoice 实时语音（留空/没起 = 回退旧通话浮层）
PAIVOICE_WS_URL=ws://127.0.0.1:8780
```

配好后可用 `GET /api/xinchao/status` 自检心潮；`GET /api/paivoice/status` 探 PaiVoice。

### 可选侧车：心潮·念 / PaiVoice

**心潮·念**（驱力 + 记忆，取代 OB，端口 18110）：

```bash
cd xinchao
node --env-file=.env src/server.js
```

首次部署参考仓库里的 `docs/从这里开始.md`。本项目本地用最小 `.env` 跑通：
`SHADOW_MODE=true`、关闭模型与 OB、开启 Dashboard。内心面板读 `/v1/now` 与 `/v1/state`。

**PaiVoice**（实时语音，端口 8780）：

```bash
cd pai-voice
PAIVOICE_ASR_PROVIDER=mock PAIVOICE_TTS_PROVIDER=mock \
  .venv/Scripts/python.exe realtime-core/server.py
```

mock 只用于跑通链路；真实通话要配 ASR / TTS Key 与回复端 Adapter（见 PaiVoice `docs/`）。
PaiVoice 没起时语音通话自动回退旧浮层。

### 可选侧车：Remember-Me 相册

相册页优先展示 [Remember-Me](https://github.com/peanutsuee/Remember-Me) 的 Dusk Archive Dashboard。
把仓库放到 `remember-me/` 并装好依赖后：

```bash
cd remember-me
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[standalone]"
cd ..
bash scripts/start-remember-me.sh        # 默认 http://127.0.0.1:8787
```

侧车没起时相册自动回退本地相册，旧数据不受影响。

> 注意：`better-sqlite3` 原生模块按 Node 24（NODE_MODULE_VERSION 137）编译，需用 Node 24 启动。

### 前端（端口 5173）

```bash
cd 前端
npm install
npm run dev
```

前端 `/api/*` 会自动代理到后端 `http://localhost:3001`。

## 功能总览

结构：**聊天是常驻底座**，其余页面以整页覆盖层叠在对话上；移动端用抽屉导航，桌面端用侧边栏。
主要入口：**聊天 / together / 酒馆小手机 / 首页看板 / 设置**。

### 聊天
- 流式回复 + Markdown 渲染
- **多图消息**：接入 [PhotoStack](https://github.com/Wren036/PhotoStack) 的微信式堆叠照片卡
  （三张守恒 / 探边 / 跟手翻页 / 快甩），点开整页看大图
- **时间感知**：送模型前给每条消息动态渲染 `[Tue 2026-08-11 17:32:10 CST · +9h 44m]`，
  存档保持干净、重复渲染幂等；`MESSAGE_TIMESTAMPS=off` 可关
- **情绪与内心**：每轮开流前用轻量模型分析最近 4 条消息（80/20 加权）→ 四维状态机
  （占有欲与醋意 / 紧绷与情欲 / 克制与自控 / 示弱与委屈）平滑累积 → 把数值翻译成**行为策略**
  注入主模型；**内心**面板（点聊天顶栏名字 / 名字旁小红点）展示心潮的此刻与 11 股驱力
  （心潮没起时回退六条本地情绪数值）
- **心潮·念（Xinchao·Nian）**：自托管的「驱力 + 记忆」引擎。每轮开流前拉 `/v1/now`
  注入 `[心潮 · 此刻]`，流结束后把「她说 / 他回」写回 `/v1/conversation-event`；
  **内心面板有六个页签：此刻 / 驱力 / 情绪 / 时间线 / 小屋 / 内核**（心潮没起时回退本地情绪面板）。
  取代原来的 Ombre Brain 专线
- **PaiVoice 实时语音**：语音通话走独立 `/paivoice` 页面（自托管实时语音层，AGPL-3.0，
  独立于主包），以**可拖拽悬浮窗**呈现，可收起成小条且不断线，支持打断、断线接回、
  实时字幕与静音；PaiVoice 没起时自动回退原通话浮层。
  视频通话仍走旧浮层（PaiVoice 的画面是「给回复端看」，不是双向视频流）
- **思考链**：接入带推理能力的模型（DeepSeek-R1 / Qwen3 / o1 等）时，实时展示推理过程，可折叠
- 工具调用：联网搜索 / 读网页、长期记忆（memo）、**灵感待办池**、**开源项目关注清单**、智能编程（读写文件、跑命令、git）、**真·控手机**
- 多模态：发图识图（截图课表自动录入）、语音输入、表情包
- 树形分支：重新生成 / 编辑并重发 / 回滚 / 分支切换 / 删除
- 主抽屉（移动端）：伴侣档案（纪念日 / 双头像）· 日常生活（日历 / 心情 / 待办 / Token / 收信匣）· 模块卡 · 工具箱（插件 / 手机感知 / 工作区 / 技能 / 开源项目）

### 首页（看板）
- 今日心情（MOOD，只填「我」的；AI 心情由系统随机时刻抓到日历）
- 日历（农历 / 休班 / 经期 / 心情点）、待办、课程表、纪念日、Token 用量、深夜来信
- 经期关怀提示（PeriodHint）

### together（两个人的回忆与生活）
- **watch**：电视 + 片单
- **listen**：一起听（网易云式滚动歌词 + 播放器）
- **read / library**：书架 + 阅读器（双人独立进度、划线、双人留言）。
  书架支持本地文本 / 网页正文导入；番茄可导入书名、作者、封面与**全量目录**
  （正文有字体混淆，需外部下载器导出后粘贴）。进度会标记 `local / pending`，
  不谎报「已同步」
- **gallery**：相册 · 图像记忆。优先接入 [Remember-Me](https://github.com/peanutsuee/Remember-Me)
  的 Dusk Archive Dashboard；侧车没起时自动回退本地相册
- **diary**：日记本
- **goodnight（MIDNIGHT FM）**：四个台的深夜电台 ——
  FM 90.6 故事台（直接读「一起读」书架里的小说正文）、FM 97.3 夜话台（关灯后的第一人称随笔）、
  FM 104.1 音乐台（雨 / 风 / 炉火 / 白粉棕噪音 + 自己导入的哄睡音频）、
  隐藏枕话台（心跳底噪 + 低声耳语）。切台先放程序化 BGM，后台生成广播稿 + Web Speech 朗读；
  可随时递纸条，让白起在下一段自然回应；保留睡眠定时器与 Wake Lock

### 酒馆小手机（tavern）
- 角色卡 / 世界书 / 人设卡（SillyTavern 风格）
- 小世界：朋友圈、聊天、通讯录等

### 其他
- **灵感待办池**（`/wishlist`）：灵感 ↔ 待办二态，回车即记；AI 也能直接往里写
- **今天吃什么**：recipe-nook 外部侧车（食材替代 / 过敏提醒）
- 纪念日、课程表、备忘录、蓝莓信箱、日记本等详情页
- 设置：模型站子、深浅色主题、MCP、技能、记忆、提示词、同步、编程工作区

> **「世界书」已并入「他的资料 → 语言风格与输出」**：世界设定与说话方式都写成风格条目，
> 按「前 / 中 / 后」插入 system 提示词。抽屉工具箱里不再有独立世界书入口。
> （酒馆的 `tavern_worldbook` 是角色卡专属的独立功能，仍然保留。）

### 真·控手机
- 后端 `phoneControl`：SSE 下发指令 + `POST result` 回报（reqId ↔ Promise 关联）
- 9 个 `phone_*` 内置工具：读界面 / 截图 / home / back / scroll（免确认）；tap / swipe / input / open_app（需确认）
- `android/`：Kotlin 原生桥（`PhoneAgentService` + `AccessibilityAgent` + `PhoneAccessibilityService`）
- 详见 `docs/phone-control.md`

## 校验

```bash
# 后端类型检查
cd 后端 && npm run typecheck

# 后端单测（node:test，借 tsx 跑 TS）
cd 后端 && node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts

# 前端构建（含 tsc --noEmit）
cd 前端 && npm run build
```

浏览器打开 http://localhost:5173 即可使用。

## 更新日志

最近的可见变更见 [CHANGELOG.md](./CHANGELOG.md)。
约定：**每次推送到远端前，先更新 `CHANGELOG.md` 与本文件的功能总览**，再执行上传。

## 说明

- API Key、网关地址等敏感信息只存后端，不回传前端日志或响应。
- 思考链依赖模型是否输出推理内容；普通模型（如 qwen2.5:7b）不会产生思考过程，此时聊天界面只显示普通的「思考中…」。
- 数据默认全部落在本机 `后端/data/blueberry.db`；删除接口为软删（只置 `deleted_at`）。
