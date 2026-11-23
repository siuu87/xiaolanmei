#!/usr/bin/env bash
# 小蓝莓 · 给 VPS 上的 SillyTavern 改登录账号名 + 密码（保留原有角色卡/世界书）
#
# 用法（root 身份，在 VPS 黑窗口贴这一条，把两个参数换成你要的）：
#   curl -fsSL https://gitee.com/siuu/xiaolanmei/raw/main/deploy/st-rename-user.sh \
#     | bash -s -- 新的用户名 新的密码
#
# 说明：
# - ST 的 handle 是账号主键，界面不能改；这里直接改 node-persist 存储键 +
#   用户数据目录名（data/default-user → data/<新用户名>），数据不会丢。
# - 用户名建议只用小写字母、数字、-、_；密码也先用字母数字，避免 shell/YAML 转义问题。
# - 改完会自动同步小蓝莓后端的 ST 连接配置并重启两端。
set -euo pipefail

NEW=${1:-}
PASS=${2:-}
say() { echo; echo "===== $* ====="; }
die() { echo; echo "[FAIL] $*"; exit 1; }

[ -n "$NEW" ] && [ -n "$PASS" ] || die "用法：bash st-rename-user.sh <新用户名> <新密码>"
echo "$NEW" | grep -qE '^[a-z0-9][a-z0-9_-]{1,30}$' || die "用户名只能是小写字母/数字/-/_（2~31 位）"
echo "$PASS" | grep -qE '^[A-Za-z0-9]{6,64}$' || die "密码先用 6~64 位字母数字，避免转义问题"

[ "$(id -u)" = "0" ] || die "请用 root 跑"
ST_DIR=/opt/SillyTavern
OLD=default-user
[ -d "$ST_DIR/data" ] || die "找不到 $ST_DIR/data"
OLD_HASH=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(("user:"+sys.argv[1]).encode()).hexdigest())' "$OLD")
[ -f "$ST_DIR/data/_storage/$OLD_HASH" ] || die "没找到默认账号 $OLD 的存储记录，可能已经改过名了"

say "1/4 备份 data（出问题可回滚）"
BAK="$ST_DIR/data.bak.$(date +%s)"
cp -a "$ST_DIR/data" "$BAK"
echo "备份在：$BAK"

say "2/4 停 ST，改账号存储键和数据目录"
systemctl stop sillytavern
python3 - "$ST_DIR/data/_storage" "$OLD" "$NEW" <<'PY' || die "账号存储改写失败"
import hashlib, json, pathlib, sys
folder = pathlib.Path(sys.argv[1])
old, new = sys.argv[2], sys.argv[3]
changed = 0
for f in list(folder.iterdir()):
    if not f.is_file():
        continue
    try:
        item = json.loads(f.read_text(encoding='utf-8'))
    except Exception:
        continue
    key = item.get('key')
    if key not in (f'user:{old}', f'avatar:{old}'):
        continue
    newkey = key.replace(old, new, 1)
    value = item.get('value')
    if isinstance(value, dict):
        if 'handle' in value:
            value['handle'] = new
        if 'name' in value and value.get('name') in ('User', old):
            value['name'] = new
    item['key'] = newkey
    item['value'] = value
    target = folder / hashlib.sha256(newkey.encode()).hexdigest()
    target.write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
    if target != f:
        f.unlink()
    changed += 1
print(f'已改写 {changed} 个账号存储键')
if changed == 0:
    raise SystemExit(1)
PY
if [ -d "$ST_DIR/data/$OLD" ]; then
  mv "$ST_DIR/data/$OLD" "$ST_DIR/data/$NEW"
  echo "数据目录：$OLD → $NEW"
fi

say "3/4 设新密码并启动 ST"
( cd "$ST_DIR" && node recover.js "$NEW" "$PASS" ) || die "设置密码失败（备份在 $BAK）"
systemctl start sillytavern

say "4/4 同步小蓝莓连接配置 + 体检"
for i in $(seq 1 45); do
  CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:8000/")
  case "$CODE" in 200|302) break ;; esac
  sleep 4
done
echo "ST 首页（200/302 正常）=$CODE"

# 地址必须沿用原来的公网 URL（前端拿它当 iframe src）；只换账号密码。
CFG_FILE=$(mktemp)
if curl -s --max-time 15 http://127.0.0.1:3001/api/st/config >"$CFG_FILE"; then
  python3 - "$CFG_FILE" "$NEW" "$PASS" >"$CFG_FILE.new" <<'PY' || echo "提醒：生成连接配置失败，请到酒馆连接设置手动填"
import json, sys
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({
    'url': cfg.get('url') or 'http://39.107.61.179:8000',
    'user': sys.argv[2],
    'password': sys.argv[3],
    'timeoutMs': cfg.get('timeoutMs') or 10000,
}))
PY
  curl -s --max-time 15 -X PUT http://127.0.0.1:3001/api/st/config \
    -H 'Content-Type: application/json' --data-binary "@$CFG_FILE.new" \
    >/dev/null && echo "小蓝莓连接配置已同步" || echo "提醒：小蓝莓配置同步失败，请到酒馆连接设置手动填"
else
  echo "提醒：读不到小蓝莓连接配置，请到酒馆连接设置手动填"
fi
rm -f "$CFG_FILE" "$CFG_FILE.new"

echo
echo "完成："
echo "  ST 登录用户名：$NEW"
echo "  ST 登录密码：$PASS"
echo "  小蓝莓 → 酒馆 → 连接设置 里也已是同一组账号"
echo "  旧数据备份：$BAK"
