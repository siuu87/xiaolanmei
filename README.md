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
- **read / library**：书架 + 阅读器（进度、笔记）
- **gallery**：相册 · 图像记忆
- **diary**：日记本
- **goodnight（晚安）**：导入哄睡 / 陪睡音频（mp3 / wav / ogg / webm / aac / m4a / flac）、白 / 粉 / 棕实时白噪音、音量、睡眠定时器（到点自动停）

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

## 说明

- API Key、网关地址等敏感信息只存后端，不回传前端日志或响应。
- 思考链依赖模型是否输出推理内容；普通模型（如 qwen2.5:7b）不会产生思考过程，此时聊天界面只显示普通的「思考中…」。
- 数据默认全部落在本机 `后端/data/blueberry.db`；删除接口为软删（只置 `deleted_at`）。
