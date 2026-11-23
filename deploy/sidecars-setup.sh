#!/usr/bin/env bash
# 小蓝莓 · VPS 侧车一键安装（心潮 / 记忆相册 / 小食谱 / PaiVoice）
#
# 用法（root 身份）：
#   curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/sidecars-setup.sh | bash
#
# 说明：
# - 幂等，可重复跑；只补 .env 的键，不覆盖用户已有密钥。
# - 全部用 systemd 常驻，**不用 pm2** —— deploy/update.sh 会 pm2 delete all。
# - 心潮 18110 / 记忆相册 8787 只给主后端内部用（不公网放行）；
#   小食谱 8790 / PaiVoice 8780 由手机浏览器直连，需在云安全组放行。
# - 日志：/var/log/xiaolanmei-sidecars.log
set -uo pipefail

APP_DIR=/opt/xiaolanmei
LOG=/var/log/xiaolanmei-sidecars.log
exec > >(tee -a "$LOG") 2>&1
say() { echo; echo "===== $* ====="; }
die() { echo; echo "[FAIL] $*"; echo "完整日志：$LOG"; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 跑"
[ -f "$APP_DIR/后端/package.json" ] || die "找不到 $APP_DIR —— 请先跑 deploy/vps-install-lite.sh / update.sh"

IP=$(curl -s -m 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || true)
[ -n "${IP:-}" ] || IP=$(curl -s -m 5 https://ifconfig.me 2>/dev/null || true)
[ -n "${IP:-}" ] || IP='<你的公网IP>'

# 通用：设置/补写 KEY=VALUE 到 .env（保留已有非目标行）
set_env() {
  python3 - "$1" "$2" "$3" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); key, val = sys.argv[2], sys.argv[3]
lines = p.read_text(encoding='utf-8').splitlines() if p.exists() else []
out, done = [], False
for line in lines:
    if line.strip().startswith(key + '=') or line.strip().startswith('#' + key + '='):
        if not done:
            out.append(f'{key}={val}'); done = True
        continue
    out.append(line)
if not done:
    out.append(f'{key}={val}')
p.write_text('\n'.join(out) + '\n', encoding='utf-8')
PY
}

say "1/6 心潮·念（Node，18110，仅内部）"
XD="$APP_DIR/xinchao"
[ -f "$XD/package.json" ] || die "缺 $XD"
( cd "$XD" && npm install --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -2 )
[ -f "$XD/.env" ] || cp "$XD/.env.example" "$XD/.env"
XC_TOKEN=$(python3 -c 'import secrets;print(secrets.token_hex(32))')
if grep -q '^SERVICE_TOKEN=replace-with-a-random-secret' "$XD/.env"; then
  set_env "$XD/.env" SERVICE_TOKEN "$XC_TOKEN"
else
  XC_TOKEN=$(grep -E '^SERVICE_TOKEN=' "$XD/.env" | head -1 | cut -d= -f2-)
fi
mkdir -p "$XD/state" "$XD/configs"
set_env "$XD/.env" PORT 18110
# 默认路径是 Docker 的 /app/...，裸机跑必须改到仓库内
python3 - "$XD/.env" "$XD" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); root = sys.argv[2]
s = p.read_text(encoding='utf-8')
s = s.replace('/app/state/', root + '/state/').replace('/app/configs/', root + '/configs/')
p.write_text(s, encoding='utf-8')
PY
echo "心潮 token 已就位（只写在服务端 .env）"

say "2/6 记忆相册（Python，8787，仅内部）"
RD="$APP_DIR/remember-me"
[ -f "$RD/pyproject.toml" ] && HAVE_PROJECT=1 || HAVE_PROJECT=0
if [ "$HAVE_PROJECT" = "1" ]; then
  python3 -m venv "$RD/.venv" 2>/dev/null || true
  "$RD/.venv/bin/pip" install -q -U pip 2>&1 | tail -2
  "$RD/.venv/bin/pip" install -q -e ".[standalone]" 2>&1 | tail -5
  [ -x "$RD/.venv/bin/remember-me" ] || echo "提醒：remember-me 控制台脚本没生成，稍后看 systemd 日志"
else
  echo "跳过：找不到 $RD/pyproject.toml"
fi

say "3/6 小食谱（Python，8790，浏览器直连）"
FD="$APP_DIR/recipe-nook"
[ -f "$FD/requirements.txt" ] || die "缺 $FD/requirements.txt"
python3 -m venv "$FD/.venv" 2>/dev/null || true
"$FD/.venv/bin/pip" install -q -U pip 2>&1 | tail -2
"$FD/.venv/bin/pip" install -q -r "$FD/requirements.txt" 2>&1 | tail -5

say "4/6 PaiVoice（Python，8780，浏览器 WS 直连）"
PD="$APP_DIR/pai-voice/realtime-core"
[ -f "$PD/server.py" ] || die "缺 $PD/server.py"
python3 -m venv "$PD/.venv" 2>/dev/null || true
"$PD/.venv/bin/pip" install -q -U pip 2>&1 | tail -2
"$PD/.venv/bin/pip" install -q -r "$PD/requirements.txt" 2>&1 | tail -5
PV_TOKEN=$(python3 -c 'import secrets;print(secrets.token_hex(16))')

say "5/6 写 systemd 单元并启动（不用 pm2）"
NODE_BIN=$(command -v node 2>/dev/null || true); NODE_BIN=$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
[ -x "$NODE_BIN" ] || die "找不到 node"

cat >/etc/systemd/system/xinchao.service <<UNIT
[Unit]
Description=Xinchao Nian sidecar
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$XD
Environment=NODE_ENV=production
ExecStart=$NODE_BIN --env-file=$XD/.env $XD/src/server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/xinchao.log
StandardError=append:/var/log/xinchao.log
[Install]
WantedBy=multi-user.target
UNIT

if [ "$HAVE_PROJECT" = "1" ]; then
cat >/etc/systemd/system/remember-me.service <<UNIT
[Unit]
Description=Remember-Me sidecar
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$RD
ExecStart=$RD/.venv/bin/remember-me serve --host 127.0.0.1 --port 8787
Restart=always
RestartSec=5
StandardOutput=append:/var/log/remember-me.log
StandardError=append:/var/log/remember-me.log
[Install]
WantedBy=multi-user.target
UNIT
fi

cat >/etc/systemd/system/recipe-nook.service <<UNIT
[Unit]
Description=Recipe Nook sidecar
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$FD
ExecStart=$FD/.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8790
Restart=always
RestartSec=5
StandardOutput=append:/var/log/recipe-nook.log
StandardError=append:/var/log/recipe-nook.log
[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/paivoice.service <<UNIT
[Unit]
Description=PaiVoice realtime sidecar
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$PD
Environment=PAIVOICE_HOST=0.0.0.0
Environment=PAIVOICE_PORT=8780
Environment=PAIVOICE_TOKEN=$PV_TOKEN
ExecStart=$PD/.venv/bin/python server.py
Restart=always
RestartSec=5
StandardOutput=append:/var/log/paivoice.log
StandardError=append:/var/log/paivoice.log
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
for S in xinchao recipe-nook paivoice; do
  systemctl enable "$S" >/dev/null 2>&1 || true
  systemctl restart "$S"
done
[ "$HAVE_PROJECT" = "1" ] && { systemctl enable remember-me >/dev/null 2>&1 || true; systemctl restart remember-me; }

say "6/6 回填主后端 .env + 重启 + 体检"
BE="$APP_DIR/后端/.env"
[ -f "$BE" ] || cp "$APP_DIR/后端/.env.example" "$BE"
set_env "$BE" XINCHAO_URL http://127.0.0.1:18110
set_env "$BE" XINCHAO_TOKEN "$XC_TOKEN"
set_env "$BE" XINCHAO_TIMEOUT_MS 3000
[ "$HAVE_PROJECT" = "1" ] && set_env "$BE" REMEMBER_ME_URL http://127.0.0.1:8787
set_env "$BE" PAIVOICE_WS_URL "ws://${IP}:8780"
systemctl restart xiaolanmei

for i in $(seq 1 40); do
  C1=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:18110/ || true)
  C2=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/ || true)
  C3=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/ || true)
  P1=$(ss -ltn 2>/dev/null | grep -c ':8780 ' || true)
  case "$C1$C2$C3" in
    200*|302*) : ;;
  esac
  if [ "$C1" != "000" ] && [ "$C2" != "000" ] && [ "$P1" -ge 1 ]; then break; fi
  echo "等侧车就绪… ${i}/40（心潮=$C1 食谱=$C2 相册=$C3 语音端口=$P1）"
  sleep 3
done

echo
echo "===== 体检结果 ====="
printf 'xiaolanmei=%s\n' "$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health || true)"
printf 'xinchao_api=%s\n' "$(curl -s -m 8 http://127.0.0.1:3001/api/xinchao/status || true)"
printf 'recipe=%s\n' "$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/ || true)"
printf 'remember=%s\n' "$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/ || true)"
printf 'paivoice_api=%s\n' "$(curl -s -m 8 http://127.0.0.1:3001/api/paivoice/status || true)"
echo
echo "systemctl："; systemctl is-active xinchao recipe-nook paivoice 2>/dev/null
echo
echo "还要做：云控制台安全组放行 TCP 8790（小食谱）和 8780（PaiVoice）；"
echo "18110 / 8787 是内部端口，不要放行。"
echo "日志：tail -f /var/log/xinchao.log /var/log/recipe-nook.log /var/log/paivoice.log"
