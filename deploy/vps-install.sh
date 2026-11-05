#!/usr/bin/env bash
# 小蓝莓 VPS 一键部署（Aliyun Ubuntu 22.04，root，无证书走 HTTP）
# 幂等：重复粘贴运行安全。日志落 /opt/xiaolanmei-install.log，失败后 tail 它排查。
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
LOG=/opt/xiaolanmei-install.log
exec > >(tee -a "$LOG") 2>&1
say(){ echo; echo "===== [$(date +%H:%M:%S)] $* ====="; }

say "1/8 系统依赖"
apt-get update -y -qq
apt-get install -y -qq curl git nginx build-essential python3 ca-certificates >/dev/null
echo ok

say "2/8 Node 24（better-sqlite3 按 Node24 编译，版本必须 v24）"
if ! node -v 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node=$(node -v) npm=$(npm -v)"

say "3/8 pm2"
command -v pm2 >/dev/null || npm i -g pm2 --silent
echo "pm2=$(pm2 -v)"

say "4/8 获取代码（/opt/xiaolanmei）"
# 优先级：已有 git 仓库则 pull > 本地上传包 /root/xiaolanmei-deploy.tar.gz > GitHub 直连 clone
if [ -d /opt/xiaolanmei/.git ]; then
  cd /opt/xiaolanmei && git pull --ff-only || true
elif [ -f /root/xiaolanmei-deploy.tar.gz ]; then
  echo "检测到上传包 /root/xiaolanmei-deploy.tar.gz，解压使用（不走 GitHub）"
  rm -rf /opt/xiaolanmei && mkdir -p /opt/xiaolanmei
  tar xzf /root/xiaolanmei-deploy.tar.gz -C /opt/xiaolanmei
else
  rm -rf /opt/xiaolanmei
  git clone --depth 1 https://github.com/siuu87/xiaolanmei.git /opt/xiaolanmei
  cd /opt/xiaolanmei
fi
ls /opt/xiaolanmei/前端/package.json || { echo "CODE_MISSING：既没有 git 仓库也没有上传包"; exit 1; }
cd /opt/xiaolanmei
grep -c "" 后端/.env 2>/dev/null && echo ".env 密钥文件在" || echo "警告：没有 后端/.env，AI 回复功能将不可用"

say "5/8 后端依赖（better-sqlite3 若无预编译会用本地编译，稍慢）"
cd /opt/xiaolanmei/后端 && npm install --no-audit --no-fund 2>&1 | tail -2

say "6/8 前端构建（tsc + vite build）"
cd /opt/xiaolanmei/前端 && npm install --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | tail -3
ls -la dist/index.html || { echo "BUILD_FAILED"; exit 1; }

say "7/8 pm2 起两个进程（API:3001 + 静态:5173）"
pm2 delete blueberry-api 2>/dev/null
pm2 delete blueberry-web 2>/dev/null
pm2 start "npm run start" --name blueberry-api --cwd /opt/xiaolanmei/后端
pm2 serve /opt/xiaolanmei/前端/dist 5173 --name blueberry-web --spa
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

say "8/8 nginx（80 托管前端 + /api 反代 3001）"
cat > /etc/nginx/sites-available/xiaolanmei <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 10m;

    root /opt/xiaolanmei/前端/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/xiaolanmei /etc/nginx/sites-enabled/xiaolanmei
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

say "体检"
sleep 3
echo "--- API ---"; curl -s -m5 http://127.0.0.1:3001/api/health; echo
curl -s -m5 -o /dev/null -w "web5173=%{http_code}\n" http://127.0.0.1:5173/
curl -s -m5 -o /dev/null -w "nginx80=%{http_code}\n" http://127.0.0.1/
pm2 ls

say "结束：API 有 JSON、nginx80=200 → 浏览器打开 http://39.107.61.179 即可用"
say "AI 回复还需模型密钥：稍后把 后端/.env 放到 /opt/xiaolanmei/后端/.env 并 pm2 restart blueberry-api"
