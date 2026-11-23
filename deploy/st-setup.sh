#!/usr/bin/env bash
# 小蓝莓 · VPS 一键安装 SillyTavern（给酒馆整页 iframe 用）
#
# 用法（root 身份，在服务器黑窗口里贴这一条）：
#   curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/st-setup.sh | bash
#
# 它做六件事：
#   1 确认 Node 24   2 拉 ST release 分支   3 装依赖
#   4 改配置：对外监听 0.0.0.0:8000 / 关白名单 / 开 Basic Auth / 允许被 iframe 嵌入
#   5 systemd 常驻   6 体检 + 打印小蓝莓里要填的地址账号
#
# 注意：脚本改不了云厂商的「安全组」，必须自己去控制台放行 TCP 8000。
# 日志：/var/log/sillytavern-setup.log
set -uo pipefail

ST_DIR=/opt/SillyTavern
PORT=8000
ST_USER=user
LOG=/var/log/sillytavern-setup.log

exec > >(tee -a "$LOG") 2>&1
say() { echo; echo "===== $* ====="; }
die() { echo; echo "[FAIL] $*"; echo "完整日志：$LOG"; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 跑"

IP=$(curl -s -m 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || true)
[ -n "${IP:-}" ] || IP=$(curl -s -m 5 https://ifconfig.me 2>/dev/null || true)
[ -n "${IP:-}" ] || IP='<你的公网IP>'

say "1/6 确认 Node"
NODE_BIN=$(command -v node 2>/dev/null || true)
[ -n "$NODE_BIN" ] || die "找不到 node —— 先跑小蓝莓的 vps-install-lite.sh 装 Node 24"
NODE_BIN=$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
[ -x "$NODE_BIN" ] || die "node 不可执行：$NODE_BIN"
echo "node：$NODE_BIN（$(node -v)）"
node -v | grep -q '^v24' || echo "提醒：ST 建议 Node 20+，当前 $(node -v) 一般也能跑；出问题先换 24"

say "2/6 拉 ST release 分支"
if [ -f "$ST_DIR/server.js" ]; then
  ( cd "$ST_DIR" && git fetch --depth 1 origin release && git reset --hard origin/release ) || die "ST 更新失败"
else
  git clone -b release --depth 1 https://github.com/SillyTavern/SillyTavern.git "$ST_DIR" \
    || die "GitHub 拉不下来；可先挂代理，或手动把 ST release 分支放到 $ST_DIR 后重跑"
fi
echo "ST 版本：$(cd "$ST_DIR" && git log --oneline -1)"

say "3/6 装依赖（2~5 分钟，没输出正常）"
( cd "$ST_DIR" && npm install --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -3 )
[ -f "$ST_DIR/server.js" ] || die "依赖没装全：$ST_DIR/server.js 不存在"

say "4/6 改配置：对外监听 / Basic Auth / 允许 iframe"
# ST release 分支不跟踪根目录 config.yaml（首次启动才生成），模板在 default/config.yaml。
# 直接改一个不存在的文件会静默失败，所以先按需从模板生成。
if [ ! -f "$ST_DIR/config.yaml" ]; then
  [ -f "$ST_DIR/default/config.yaml" ] || die "找不到 ST 默认配置模板 $ST_DIR/default/config.yaml"
  cp "$ST_DIR/default/config.yaml" "$ST_DIR/config.yaml"
  echo "已用 default/config.yaml 生成 config.yaml"
fi
PASS=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
python3 - "$PASS" "$ST_DIR/config.yaml" <<'PY' || die "config.yaml 改写失败"
import pathlib, re, sys
pw = sys.argv[1]
p = pathlib.Path(sys.argv[2])
s = p.read_text(encoding='utf-8')
s = re.sub(r'^listen:.*$', 'listen: true', s, flags=re.M)
s = re.sub(r'^port:.*$', 'port: 8000', s, flags=re.M)
s = re.sub(r'^whitelistMode:.*$', 'whitelistMode: false', s, flags=re.M)
s = re.sub(r'^basicAuthMode:.*$', 'basicAuthMode: true', s, flags=re.M)
i = s.find('basicAuthUser:')
if i >= 0:
    tail = s[i:]
    tail = re.sub(r'(\n[ \t]+username:).*', r'\1 user', tail, count=1)
    tail = re.sub(r'(\n[ \t]+password:).*', lambda m: m.group(1) + ' ' + pw, tail, count=1)
    s = s[:i] + tail
# 服务器没有桌面，别让 ST 尝试打开浏览器
i = s.find('browserLaunch:')
if i >= 0:
    tail = s[i:]
    tail = re.sub(r'(\n[ \t]+enabled:).*', r'\1 false', tail, count=1)
    s = s[:i] + tail
p.write_text(s, encoding='utf-8')
PY
python3 - "$ST_DIR/src/server-main.js" <<'PY' || die "server-main.js 的 iframe 允许配置改写失败"
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
if 'frameguard:' not in s:
    s = s.replace('app.use(helmet({\n', 'app.use(helmet({\n    frameguard: false,\n', 1)
    p.write_text(s, encoding='utf-8')
PY
grep -E '^(listen|port|whitelistMode|basicAuthMode):' "$ST_DIR/config.yaml"
grep -n 'frameguard' "$ST_DIR/src/server-main.js" | head -2

say "5/6 systemd 常驻"
cat >/etc/systemd/system/sillytavern.service <<UNIT
[Unit]
Description=SillyTavern
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ST_DIR
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $ST_DIR/server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/sillytavern.log
StandardError=append:/var/log/sillytavern.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable sillytavern >/dev/null 2>&1
systemctl restart sillytavern

say "6/6 防火墙提示 + 体检（ST 首次启动要编译前端，最多等 3 分钟）"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi '^Status: active'; then
  ufw allow "$PORT/tcp" >/dev/null 2>&1 && echo "ufw 已放行 $PORT"
else
  echo "本机 ufw 未启用；云厂商安全组仍需手动放行 TCP $PORT"
fi
CODE=000
READY=0
for i in $(seq 1 45); do
  CODE=$(curl -s -m 5 -u "$ST_USER:$PASS" -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
  case "$CODE" in
    200|302) READY=1; break ;;
  esac
  if ! systemctl is-active --quiet sillytavern; then
    echo "--- systemd 状态 ---"; systemctl status sillytavern --no-pager -l 2>&1 | tail -14
    echo "--- 应用日志 ---"; tail -30 /var/log/sillytavern.log 2>/dev/null
    die "ST 进程退出了（上面是真报错）"
  fi
  echo "等待 ST 就绪… ${i}/45（HTTP ${CODE}）"
  sleep 4
done
if [ "$READY" != "1" ]; then
  tail -30 /var/log/sillytavern.log 2>/dev/null
  die "等了 3 分钟 ST 仍没响应（HTTP ${CODE}）"
fi
curl -s -m 8 -o /dev/null -w "ST 未认证首页（401 正常）=%{http_code}\n" "http://127.0.0.1:$PORT/"
echo "ST 带认证首页（200/302 正常）=$CODE"

say "完成：小蓝莓里填这些"
echo "酒馆 → 右上角连接设置："
echo "  地址：http://${IP}:${PORT}"
echo "  用户名：${ST_USER}"
echo "  密码：${PASS}"
echo
echo "还要做三件事："
echo "  1. 云控制台安全组放行 TCP ${PORT}（脚本改不了）"
echo "  2. 先用浏览器直接开 http://${IP}:${PORT} 完成 ST 自己的首次注册/设密码"
echo "  3. 回小蓝莓酒馆页填上面的地址账号；iframe 弹登录框时用同一套账号密码"
echo
echo "ST 日志：tail -f /var/log/sillytavern.log"
echo "重跑本脚本：curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/st-setup.sh | bash"
