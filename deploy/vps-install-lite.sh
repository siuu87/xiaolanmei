#!/usr/bin/env bash
# 小蓝莓 · 一台全新 ECS 直接上线（Ubuntu / Alibaba Cloud Linux / CentOS 通用）
#
# 用法（在服务器上，root 身份）：
#   curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/vps-install-lite.sh | bash
#
# 做的事：装依赖 → 装 Node 24 → 拉 Gitee 代码 → 装两端依赖 → 构建前端 →
#         systemd 常驻 → 后端在 80 端口同时托管页面和接口（不需要 nginx）。
# 幂等：重复跑安全。日志：/var/log/xiaolanmei-install.log
set -uo pipefail

APP_DIR=/opt/xiaolanmei
PORT=80
LOG=/var/log/xiaolanmei-install.log
NODE_ROOT=/usr/local/lib/node24
mkdir -p /opt
exec > >(tee -a "$LOG") 2>&1

say() { echo; echo "===== $* ====="; }
die() { echo; echo "[FAIL] $*"; echo "完整日志：$LOG"; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 跑（阿里云控制台「远程连接」进去默认就是 root）"

say "1/7 系统依赖"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq >/dev/null 2>&1
  apt-get install -y -qq curl git xz-utils ca-certificates tar >/dev/null 2>&1
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q curl git xz tar ca-certificates >/dev/null 2>&1
else
  yum install -y -q curl git xz tar ca-certificates >/dev/null 2>&1
fi
echo "ok（$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown}")）"

say "2/7 Node 24（better-sqlite3 只认 24；走国内镜像）"
if node -v 2>/dev/null | grep -q '^v24'; then
  echo "已有 $(node -v)，跳过"
else
  case "$(uname -m)" in
    aarch64|arm64) A=arm64 ;;
    *)             A=x64 ;;
  esac
  V=$(curl -fsSL --max-time 25 https://registry.npmmirror.com/-/binary/node/latest-v24.x/SHASUMS256.txt \
      | sed -n 's/.*node-\(v24[0-9.]*\)-linux.*/\1/p' | head -1)
  [ -n "${V:-}" ] || V=v24.19.0
  echo "安装 $V ($A)"
  ok=0
  for TRY in "$V|https://registry.npmmirror.com/-/binary/node" \
             "v24.19.0|https://registry.npmmirror.com/-/binary/node" \
             "$V|https://nodejs.org/dist"; do
    TV=${TRY%%|*}; TBASE=${TRY##*|}; PKG="node-$TV-linux-$A.tar.xz"
    if curl -fL --max-time 300 -o "/tmp/$PKG" "$TBASE/$TV/$PKG"; then V=$TV; ok=1; break; fi
  done
  [ "$ok" = 1 ] || die "Node 下载失败（三个源都不通）"
  PKG="node-$V-linux-$A.tar.xz"
  rm -rf "$NODE_ROOT" && mkdir -p "$NODE_ROOT"
  tar -xJf "/tmp/$PKG" -C "$NODE_ROOT" --strip-components=1 || die "Node 解包失败"
  ln -sf "$NODE_ROOT/bin/node" /usr/local/bin/node
  ln -sf "$NODE_ROOT/bin/npm"  /usr/local/bin/npm
  ln -sf "$NODE_ROOT/bin/npx"  /usr/local/bin/npx
  echo "node=$(node -v) npm=$(npm -v)"
fi

say "3/7 代码（Gitee 优先）"
if [ -d "$APP_DIR/.git" ]; then
  ( cd "$APP_DIR" && git pull --ff-only ) || echo "pull 失败，用现有代码继续"
else
  rm -rf "$APP_DIR"
  git clone --depth 1 https://gitee.com/siuu/xiaolanmei.git "$APP_DIR" \
    || git clone --depth 1 https://github.com/siuu87/xiaolanmei.git "$APP_DIR" \
    || die "拉代码失败（Gitee / GitHub 都不通）"
fi
[ -f "$APP_DIR/前端/package.json" ] || die "代码不完整：$APP_DIR/前端 不在"

say "4/7 小内存机器先加 2G swap（构建前端会吃内存）"
MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 8000)
if [ "${MEM:-8000}" -lt 3800 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null 2>&1 && swapon /swapfile 2>/dev/null
  grep -q '^/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "加了 2G swap（内存 ${MEM}MB）"
else
  echo "内存 ${MEM}MB，不需要"
fi

say "5/7 装依赖（后端）"
cd "$APP_DIR/后端" || die "进不去 后端 目录"
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -3
[ -f node_modules/tsx/dist/cli.mjs ] || die "后端依赖没装全"

say "6/7 构建前端产物"
cd "$APP_DIR/前端" || die "进不去 前端 目录"
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -3
npm run build 2>&1 | tail -4
[ -f dist/index.html ] || die "前端构建失败（看上面 tsc/vite 的报错）"

say "7/7 systemd 常驻 + 启动"
cat >/etc/systemd/system/xiaolanmei.service <<UNIT
[Unit]
Description=Xiaolanmei (Fastify + SQLite, serves web dist)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/后端
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_ROOT/bin/node $APP_DIR/后端/node_modules/tsx/dist/cli.mjs src/server.ts
Restart=always
RestartSec=3
StandardOutput=append:/var/log/xiaolanmei.log
StandardError=append:/var/log/xiaolanmei.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable xiaolanmei >/dev/null 2>&1
systemctl restart xiaolanmei
sleep 4

say "体检"
curl -s -m 6 http://127.0.0.1:$PORT/api/health; echo
curl -s -m 6 -o /dev/null -w "首页=%{http_code}\n" "http://127.0.0.1:$PORT/"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
say "完成"
echo "本机地址：http://$IP:$PORT/"
echo "公网访问：http://<你的ECS公网IP>:$PORT/   ← 安全组要放行 $PORT 端口"
echo
echo "常用命令："
echo "  看状态   systemctl status xiaolanmei"
echo "  看日志   tail -f /var/log/xiaolanmei.log"
echo "  重启     systemctl restart xiaolanmei"
echo "  更新代码 cd $APP_DIR && git pull && cd 前端 && npm run build && systemctl restart xiaolanmei"
echo
echo "想让他真的会说话：把模型 Key 写进 $APP_DIR/后端/.env（OPENAI_BASE_URL / OPENAI_API_KEY），再 systemctl restart xiaolanmei"
