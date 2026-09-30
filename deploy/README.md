# 小蓝莓 · 阿里云 VPS 部署（阶段 13）

本目录是**部署脚手架**：把「后端 + 前端」打包成两个容器，用 nginx 托管静态资源并反代 API。
实际开通 VPS、买域名、放行端口仍需你在云控制台操作，这里给出完整步骤。

## 文件清单

| 文件 | 作用 |
|---|---|
| `后端/Dockerfile` | Fastify + SQLite 后端镜像（tsx 跑 TS 源码） |
| `前端/Dockerfile` | 前端 SPA 构建 + nginx 托管 |
| `deploy/nginx.conf` | nginx 站点：SPA 回退 + `/api` 反代 + SSE 不缓冲 |
| `deploy/docker-compose.yml` | 双容器编排 + 数据卷持久化 |

## 一、VPS 准备（阿里云控制台）

1. 买一台 ECS（最低配即可），选 **Linux**（Ubuntu 22.04 / Debian 12 皆可）。
2. **安全组**放行端口：
   - `22`（SSH）
   - `80`（HTTP）
   - `443`（HTTPS，用证书时再放）
   - **后端 3001 不要放行**——它只在内网给 nginx 用，直接暴露会泄露 API。
3. 域名解析：把域名 A 记录指向 VPS 公网 IP（如 `blueberry.example.com`）。
4. SSH 登录：`ssh root@<你的公网IP>`，装 Docker 与 compose 插件：

```bash
curl -fsSL https://get.docker.com | sh
docker compose version   # 确认 compose 插件可用
```

## 二、部署

把本仓库（含前端、后端、deploy）拷到 VPS，在仓库根目录执行：

```bash
# 可选：先用 .env 传入模型服务配置（不传则用 docker-compose 里的默认值）
#   export OPENAI_BASE_URL=http://host.docker.internal:11434/v1
#   export OPENAI_API_KEY=sk-xxx
docker compose -f deploy/docker-compose.yml up -d --build
```

完成后访问 `http://<公网IP>` 即是小蓝莓首页；`/api/health` 应返回 `{"status":"ok",...}`。

> **模型服务说明**：`OPENAI_BASE_URL` 默认 `http://localhost:11434/v1` 在容器里指向容器自身，
> 若 Ollama 跑在 VPS 宿主机，请改成 `http://host.docker.internal:11434/v1` 或宿主机内网 IP；
> 或用云服务（DeepSeek / OpenAI 等）的兼容地址 + Key。Key 只存在后端容器环境变量里，绝不下发前端。

## 三、HTTPS（推荐）

用 certbot 自动签发 Let's Encrypt 证书，并把 nginx 切到 443：

1. 装 certbot：`apt-get install -y certbot`
2. 先确保域名已解析到 VPS，且 80 端口已放行。
3. 签发证书（standalone 模式需临时停掉 80 端口占用，或用 webroot）：

```bash
# webroot 方式（nginx 已占用 80）
certbot certonly --webroot -w /usr/share/nginx/html -d blueberry.example.com
```

4. 编辑 `deploy/nginx.conf`：把 `server { listen 80 ... }` 换成文件底部注释里的 HTTPS 块（443 + 80→443 跳转）。
5. 在 `docker-compose.yml` 里给 frontend 加 `- "443:443"` 并挂载证书目录：

```yaml
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
```

6. 重启：`docker compose -f deploy/docker-compose.yml up -d --force-recreate frontend`

## 四、数据与备份

- SQLite 数据库 + 上传图片都在后端容器 `/app/data`，已挂载到命名卷 `blueberry_data`。
- 备份：`docker run --rm -v blueberry_data:/data -v "$PWD":/backup alpine tar czf /backup/blueberry-$(date +%F).tar.gz -C /data .`
- 迁移到新机器：拷走备份 + 重新 `docker compose up` 即可；双端同步（阶段 14）可用来与本地互备。

## 五、可选的更精简镜像

后端目前用 `tsx` 直接跑 TS（简单可靠）。想省体积可改为编译产物：

1. 后端 `package.json` 加 `"build": "tsc -p tsconfig.json --outDir dist"`、`"start:prod": "node dist/server.js"`。
2. Dockerfile 里 `npm install` → `npm run build` → `CMD ["npm","start:prod"]`，并把 `tsx`/`typescript` 挪到 devDependencies。
