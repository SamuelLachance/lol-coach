@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy_github_pages.ps1"
pause
