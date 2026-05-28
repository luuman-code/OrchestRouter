@echo off
chcp 65001 >nul
echo Starting UI Dev Server...
cd /d "%~dp0ui"
start "UI Dev Server" cmd /c "node ./node_modules/vite/bin/vite.js --port 5173 --host"
echo UI Dev Server starting on http://localhost:5173
