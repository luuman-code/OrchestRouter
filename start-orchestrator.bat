@echo off
cd /d %~dp0
echo Starting OrchestRouter Server...
echo.

REM 启动服务器 - 日志重定向到文件并在当前窗口显示
node src/orchestrator/index.js > server.log 2>&1

pause