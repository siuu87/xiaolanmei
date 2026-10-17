@echo off
cd /d %~dp0
if not exist .venv (
  echo 创建虚拟环境...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
echo 安装依赖（首次较慢）...
pip install -r requirements.txt
if not exist .env (
  copy .env.example .env
  echo 已生成 .env，可按需填 LLM 估热量用的 key（可不填）
)
echo 启动小食谱（recipe-nook）于 http://127.0.0.1:8790/
uvicorn server:app --port 8790
pause
