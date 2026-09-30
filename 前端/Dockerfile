# 小蓝莓前端镜像：构建 SPA 后用 nginx 托管静态资源。
# nginx 站点配置由 deploy/nginx.conf 在运行时挂载（SPA 回退 + /api 反代）。
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
