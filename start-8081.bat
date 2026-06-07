@echo off
cd /d "%~dp0"
echo Dev local port 8081 — pas pour l acces public
powershell -NoProfile -ExecutionPolicy Bypass -Command "python scripts/serve_public.py --config config/server.json --port 8081"
pause
