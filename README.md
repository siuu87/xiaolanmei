# 小蓝莓 🫐

AI 陪伴聊天应用。本地优先、可多端使用（手机 + 电脑）、可自我扩展。

## 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + React Router
- **后端**：Node.js + Fastify + SQLite（better-sqlite3）+ Drizzle ORM
- **部署**：阿里云 VPS + PWA（阶段 13）

## 目录结构

```
小蓝莓/
├── 前端/     React 前端（Vite）
├── 后端/     Fastify 后端（代理 API Key、SQLite 数据库）
└── deploy/   部署配置（Docker + Nginx，阶段 13）
```

## 本地运行

### 后端（端口 3001）

```bash
cd 后端
cp .env.example .env   # 可选，用默认值即可
npm install
npm run dev
```

### 前端（端口 5173）

```bash
cd 前端
npm install
npm run dev
```

前端 `/api/*` 会自动代理到后端 `http://localhost:3001`。

## 验证骨架

```bash
curl http://localhost:3001/api/health
```

浏览器打开 http://localhost:5173 ，侧边栏切换「首页 / 聊天 / 设置」三页；设置页可切换浅色/深色主题。

## 开发进度

当前：**阶段 0 项目骨架**（已完成前端 3 页 + 后端建库 + health 检查）。

完整开发计划见计划文件，按 P0 → P1 → P2 逐步实现，每次一个模块。
