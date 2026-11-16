#!/usr/bin/env bash
# 小蓝莓 · 一键更新（服务器上已经装过，只想更新到最新代码，用这个）
#
# 用法（root 身份，在服务器黑窗口里）：
#   curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/update.sh | bash
#
# 它按顺序做六件事：
#   1 找到项目目录
#   2 备份 后端/data（数据不动，只复制一份到 /root）
#   3 停掉旧的一套 —— 11-05 那版是 nginx(80) + pm2(3001/5173)，
#     不清理的话 80 端口一直被老进程占着，新代码起来了也访问不到
#   4 拉 Gitee 最新代码（强制对齐，本地改动一律丢弃；.env 与 data 不受影响）
#   5 装依赖 + 重新构建前端
#   6 重写 systemd 单元、重启、体检（顺便把公网 IP 打出来）
#
# 幂等：重复跑安全。日志：/var/log/xiaolanmei-update.log
set -uo pipefail

APP_DIR=/opt/xiaolanmei
PORT=80
LOG=/var/log/xiaolanmei-update.log
NODE_ROOT=/usr/local/lib/node24
GITEE=https://gitee.com/siuu/xiaolanmei.git
NPM_REG=https://registry.npmmirror.com

mkdir -p /opt
exec > >(tee -a "$LOG") 2>&1

say() { echo; echo "===== $* ====="; }
die() { echo; echo "[FAIL] $*"; echo "完整日志：$LOG"; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 跑"

say "1/6 找项目"
[ -f "$APP_DIR/前端/package.json" ] || die "找不到 $APP_DIR/前端 —— 这台机器还没装过，请先跑 vps-install-lite.sh"
cd "$APP_DIR" || die "进不去 $APP_DIR"
echo "目录：$APP_DIR"

say "2/6 备份数据（不动原数据，只复制一份）"
if [ -d "$APP_DIR/后端/data" ]; then
  BK=/root/xlm-data-$(date +%m%d-%H%M)
  cp -a "$APP_DIR/后端/data" "$BK" && echo "已备份：$BK"
else
  echo "没有 data 目录，跳过（首次启动会自动建）"
fi

say "3/6 停掉旧的一套（pm2 / nginx / 占端口的老进程）"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete all >/dev/null 2>&1 || true
  pm2 save --force >/dev/null 2>&1 || true
  systemctl disable --now pm2-root >/dev/null 2>&1 || true
  echo "pm2 老进程已清"
else
  echo "没有 pm2，跳过"
fi
if systemctl list-unit-files 2>/dev/null | grep -q '^nginx\.service'; then
  systemctl disable --now nginx >/dev/null 2>&1 || true
  echo "nginx 已停并取消开机启动（80 交给应用自己）"
else
  echo "没有 nginx，跳过"
fi
systemctl stop xiaolanmei >/dev/null 2>&1 || true
sleep 1
for P in 80 3001 5173; do
  for PID in $(ss -ltnp 2>/dev/null | grep ":$P " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    [ "$PID" = "$$" ] && continue
    kill -9 "$PID" 2>/dev/null && echo "已结束占用 :$P 的进程 $PID"
  done
done
echo "端口腾空"

say "4/6 拉最新代码（Gitee）"
git remote set-url origin "$GITEE" >/dev/null 2>&1 || git remote add origin "$GITEE"
git fetch --depth 1 origin main 2>&1 | tail -2
git reset --hard origin/main >/dev/null 2>&1 || die "代码同步失败（网络？）"
echo "当前版本：$(git log --oneline -1)"

say "5/6 装依赖 + 构建（2~5 分钟，没有输出是正常的）"
if [ -x "$NODE_ROOT/bin/node" ]; then
  ln -sf "$NODE_ROOT/bin/node" /usr/local/bin/node
  ln -sf "$NODE_ROOT/bin/npm" /usr/local/bin/npm
  ln -sf "$NODE_ROOT/bin/npx" /usr/local/bin/npx
fi
# systemd 不认 PATH，ExecStart 必须是绝对路径；不同机器的 node 装在哪儿都不一样，
# 所以这里探一次真身（之前硬写 /usr/local/lib/node24 时，旧机器上服务起不来、日志还是空的）
NODE_BIN=$(command -v node 2>/dev/null || true)
[ -n "${NODE_BIN:-}" ] || die "找不到 node，先跑 vps-install-lite.sh"
NODE_BIN=$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
[ -x "$NODE_BIN" ] || die "node 路径不可执行：$NODE_BIN"
echo "node：$NODE_BIN（$(node -v)）"
node -v | grep -q '^v24' || die "Node 版本是 $(node -v)，必须是 v24（better-sqlite3 只按 24 编译）"
if ! command -v gcc >/dev/null 2>&1; then
  echo "补装编译工具（better-sqlite3 兜底）"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y -qq build-essential python3 >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q gcc gcc-c++ make python3 >/dev/null 2>&1 || true
  else
    yum install -y -q gcc gcc-c++ make python3 >/dev/null 2>&1 || true
  fi
fi
( cd "$APP_DIR/后端" && npm install --registry="$NPM_REG" --no-audit --no-fund 2>&1 | tail -2 )
[ -f "$APP_DIR/后端/node_modules/tsx/dist/cli.mjs" ] || die "后端依赖没装全"
( cd "$APP_DIR/前端" && npm install --registry="$NPM_REG" --no-audit --no-fund 2>&1 | tail -2 )
( cd "$APP_DIR/前端" && npm run build 2>&1 | tail -3 )
[ -f "$APP_DIR/前端/dist/index.html" ] || die "前端构建失败（看上面 tsc / vite 的报错）"

say "6/6 重启服务 + 体检"
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
ExecStart=$NODE_BIN $APP_DIR/后端/node_modules/tsx/dist/cli.mjs src/server.ts
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
sleep 5
if ! systemctl is-active --quiet xiaolanmei; then
  echo "--- systemd 状态 ---"
  systemctl status xiaolanmei --no-pager -l 2>&1 | tail -14
  echo "--- journal（systemd 侧） ---"
  journalctl -u xiaolanmei -n 20 --no-pager 2>/dev/null | tail -20
  echo "--- 应用日志 ---"
  tail -20 /var/log/xiaolanmei.log 2>/dev/null
  echo "--- 前台手动试跑 10 秒（真报错都在这里） ---"
  ( cd "$APP_DIR/后端" && PORT=$PORT timeout 10 "$NODE_BIN" node_modules/tsx/dist/cli.mjs src/server.ts 2>&1 | tail -25 )
  die "服务没起来（上面是真报错，整段发我）"
fi

echo "--- 健康检查 ---"
curl -s -m 8 "http://127.0.0.1:$PORT/api/health"; echo
curl -s -m 8 -o /dev/null -w "首页=%{http_code}\n" "http://127.0.0.1:$PORT/"
echo "--- 新接口（应返回 JSON 数组，不是 Not Found）---"
BOOKS=$(curl -s -m 8 "http://127.0.0.1:$PORT/api/diary/books")
echo "${BOOKS:0:180}"

IP=$(curl -s -m 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null)
say "完成"
echo "版本：$(git log --oneline -1)"
case "$BOOKS" in
  \[*) echo "新日记模块：正常" ;;
  *)   echo "新日记模块：异常（返回的不是数组）—— 把上面这行发我" ;;
esac
echo "公网访问：http://${IP:-<你的ECS公网IP>}/  （安全组需放行 TCP $PORT）"
echo
echo "以后就这一条命令更新："
echo "  curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/update.sh | bash"
echo
echo "看日志： tail -f /var/log/xiaolanmei.log"
