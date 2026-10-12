# 小蓝莓 Host 模式镜像（阶段 P1）：一个容器 = 完整应用。
#
# 多阶段构建：
#   阶段 1（web）：构建前端 SPA 产物 dist
#   阶段 2（app）：Fastify 后端 + 前端产物打进同一个镜像
# 启动后 http://localhost:3001/ 就是完整 App，不再需要 nginx 或第二个容器。
#
# 构建（在仓库根执行）：
#   docker compose -f deploy/docker-compose.yml up -d --build
# 或单独构建镜像：
#   docker build -f 后端/Dockerfile -t blueberry:host ..

# ---------- 阶段 1：前端构建 ----------
FROM node:20-slim AS web
WORKDIR /web
# 先装依赖利用层缓存（package-lock 变动才重装）
COPY 前端/package.json 前端/package-lock.json ./
RUN npm ci || npm install
COPY 前端/ ./
RUN npm run build

# ---------- 阶段 2：后端运行 ----------
FROM node:20-slim

# better-sqlite3 是原生模块：无预编译二进制时用 node-gyp 现场编译
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装后端依赖（利用 Docker 层缓存），再拷源码
COPY 后端/package*.json ./
RUN npm install

COPY 后端/ ./

# 前端产物：容器内固定落在 /app/web，由 WEB_ROOT 指过去
COPY --from=web /web/dist /app/web

ENV NODE_ENV=production
ENV PORT=3001
ENV WEB_ROOT=/app/web

EXPOSE 3001

# SQLite 数据库与上传图片都落在 /app/data，靠卷持久化
VOLUME ["/app/data"]

CMD ["npm", "start"]
