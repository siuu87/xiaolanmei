# 小蓝莓 · 部署说明（阶段 P1：Host 模式）

**默认形态 = 单容器 Host**：后端（Fastify + SQLite）直接托管前端产物，一个端口就是完整应用，
不需要 nginx、不需要第二个容器。这就是「轻量单机 + 独立 Host」的交付形态——
本机、局域网小主机、一台 VPS 都行，数据全在自己机器上，模型随便换。

## 文件清单

| 文件 | 作用 |
|---|---|
| `后端/Dockerfile` | 多阶段镜像：先构建前端 dist，再和 Fastify 后端打进同一个镜像 |
| `deploy/docker-compose.yml` | 单容器编排 + 数据卷持久化（端口 3001） |
| `deploy/nginx.conf` | **可选**：需要 HTTPS/多域名时，用它做反代（见下文） |
| `前端/Dockerfile` | **可选**：旧的「前端独立 nginx」方案，compose 已不再使用，保留备用 |

## 一、本机跑（不用 Docker 也行）

```bash
# 1. 构建前端产物
cd 前端 && npm run build && cd ..

# 2. 启动后端（自动托管 dist，检测到就有「📦 前端产物已托管」日志）
cd 后端 && npm start
```

访问 `http://localhost:3001/` 就是完整 App；`/api/health` 应返回 `{"status":"ok",...}`。
（开发仍是老办法：`前端 npm run dev` + `后端 npm run dev`，5173 代理到 3001，行为不变。）

## 二、Docker 部署（VPS / 小主机）

1. SSH 登机器，装 Docker：
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. 把仓库拷上去，在**仓库根**执行：
   ```bash
   # 可选：模型配置（不传则用 compose 默认值）
   #   export OPENAI_BASE_URL=http://host.docker.internal:11434/v1
   #   export OPENAI_API_KEY=sk-xxx
   docker compose -f deploy/docker-compose.yml up -d --build
   ```
3. 访问 `http://<机器IP>:3001/`。要对外提供服务，把端口映射改成 `"80:3001"`。

> **模型服务**：`OPENAI_BASE_URL` 默认指向 localhost——容器里那是容器自己。
> Ollama 跑在宿主机就填 `http://host.docker.internal:11434/v1`；或用云服务兼容地址 + Key。
> Key 只存在于后端环境变量，绝不下发前端。

## 三、HTTPS（可选，需要域名）

单容器本身不带 TLS，两种做法：

1. **前面加反代**（推荐）：用 `deploy/nginx.conf`（含 SPA 回退 + SSE 不缓冲）或 Caddy，
   把 443 反代到 `blueberry:3001`，证书用 certbot 签。
2. **Tailscale**：只给自己设备用的话最省事，不开公网端口。

## 四、数据与备份

- SQLite + 上传图片都在容器 `/app/data`（命名卷 `blueberry_data`）。
- 备份：`docker run --rm -v blueberry_data:/data -v "$PWD":/backup alpine tar czf /backup/blueberry-$(date +%F).tar.gz -C /data .`
- 换机器：拷走备份 + 重新 `docker compose up` 即完成搬家。
