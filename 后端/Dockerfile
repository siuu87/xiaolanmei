# 小蓝莓后端镜像（Fastify + better-sqlite3 + Drizzle）。
# 个人 VPS 场景优先简单可靠：直接用 tsx 跑 TypeScript 源码，省去编译产物一致性排查。
# 更精简可改为 tsc 编译后 node 运行（见 deploy/README.md）。
FROM node:20-slim

# better-sqlite3 是原生模块：无预编译二进制时用 node-gyp 现场编译
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用 Docker 层缓存），再拷源码
COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# SQLite 数据库与上传图片都落在 /app/data，靠卷持久化
VOLUME ["/app/data"]

CMD ["npm", "start"]
