@echo off
chcp 65001 >nul
echo Stopping UI Dev Server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo UI Dev Server stopped.
