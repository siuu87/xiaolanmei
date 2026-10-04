# 小蓝莓 🫐

两个人的专属 AI 陪伴空间。本地优先、可多端使用（手机 + 电脑）、可自我扩展。

一个会陪你聊天、记备忘录、管待办和课表、一起做饭读书、还能自己写代码的温柔陪伴者。

## 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + React Router
- **后端**：Node.js + Fastify + SQLite（better-sqlite3）+ Drizzle ORM
- **AI**：OpenAI 兼容协议（可接入 DeepSeek / Qwen / o 系列等任意网关与模型）
- **部署**：阿里云 VPS + PWA

## 目录结构

```
小蓝莓/
├── 前端/     React 前端（Vite，端口 5173）
├── 后端/     Fastify 后端（代理 API Key、SQLite 数据库，端口 3001）
└── deploy/   部署配置（Docker + Nginx）
```

## 本地运行

### 后端（端口 3001）

```bash
cd 后端
npm install
npm run dev
```

首次使用可在「我 → 设置」里配置模型站子（Base URL + API Key + 模型列表）。
Key 只存在后端，绝不下发前端。

### 前端（端口 5173）

```bash
cd 前端
npm install
npm run dev
```

前端 `/api/*` 会自动代理到后端 `http://localhost:3001`。

## 功能总览

底部四个 Tab：**首页 / 聊天 / 星空 / 我**。

### 首页
- 待办（TodoCard）、课程表（CourseCard）、经期关怀提示（PeriodHint）
- 纪念日（AnniversaryCard，可置顶）、灵感便签、Token 用量统计
- 日历、健康状态指示

### 聊天（Claude 风格）
- 流式回复 + Markdown 渲染
- **思考链**：接入带推理能力的模型（DeepSeek-R1 / Qwen3 / o1 等）时，实时展示模型的推理过程，可折叠
- 工具调用：联网搜索 / 读网页、长期记忆（memo）、智能编程（读写文件、跑命令、git）
- 多模态：发图识图（截图课表自动录入）、语音输入、表情包、语音通话占位
- 树形分支：重新生成 / 编辑并重发 / 回滚 / 分支切换 / 删除
- 左侧抽屉：插件 / 角色 / 世界书 / 工作区 / 技能

### 星空
- **一起读**：书架 + 阅读器（进度、笔记）
- **今天吃什么**：日常正餐 / 治愈甜品 / 抽盲盒，含食材替代建议与芒果过敏提醒

### 我
- 模型站子管理、深浅色主题
- 世界书、MCP、技能、记忆、提示词、同步、编程工作区
- 日记本、纪念日、备忘录、蓝莓信箱等详情页入口

## 校验

```bash
# 后端
cd 后端 && npm run typecheck

# 前端
cd 前端 && npm run build   # 含 tsc --noEmit
```

浏览器打开 http://localhost:5173 即可使用。

## 说明

- API Key、网关地址等敏感信息只存后端，不回传前端日志或响应。
- 思考链依赖模型是否输出推理内容；普通模型（如 qwen2.5:7b）不会产生思考过程，此时聊天界面只显示普通的「思考中…」。
