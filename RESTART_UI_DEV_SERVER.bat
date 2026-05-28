@echo off
echo 正在停止现有 Node 进程...
taskkill /F /IM node.exe 2>nul

echo.
echo 正在进入 UI 目录...
cd /d "C:\Users\LWB\OrchestRouter\ui"

echo.
echo 正在清理缓存...
rd /s /q node_modules\.vite 2>nul
del /f dist\* 2>nul

echo.
echo 正在安装依赖...
npm install

echo.
echo 正在启动开发服务器...
start "OrchestRouter UI Dev Server" cmd /c "npm run dev"

echo.
echo 开发服务器已启动，请访问 http://localhost:5184
echo 如果端口变化，请查看命令行窗口输出
pause