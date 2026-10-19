#!/usr/bin/env bash
# 启动 Remember-Me 侧车（图像记忆 / 相册 Dashboard）
# 用法：bash scripts/start-remember-me.sh
# 默认地址 http://127.0.0.1:8787/dashboard ，可用 REMEMBER_ME_PORT 覆盖端口。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIDECAR="$ROOT/remember-me"
PORT="${REMEMBER_ME_PORT:-8787}"

if [ ! -d "$SIDECAR/.venv" ]; then
  echo "✗ 没找到 remember-me/.venv"
  echo "  先安装："
  echo "    cd remember-me"
  echo "    python -m venv .venv"
  echo "    .venv/Scripts/python.exe -m pip install -e \".[standalone]\""
  exit 1
fi

cd "$SIDECAR"
exec ".venv/Scripts/python.exe" -m remember_me serve \
  --data-root .data --host 127.0.0.1 --port "$PORT"
