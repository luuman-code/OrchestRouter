@echo off
echo Stopping OrchestRouter Server...
echo.

REM 查找并终止占用端口 3458 的进程
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3458') do (
  echo Terminating process %%a
  taskkill /f /pid %%a 2>nul
)

echo Server stopped.
pause