@echo off
REM 停止编排器和 MCP 服务器

echo 🛑 停止编排器和 MCP 服务器
echo ==============================

echo 🔍 查找相关进程...
echo.

REM 查找并终止编排器服务器进程
echo 📡 搜索编排器服务器进程...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| findstr start-orchestrator') do (
    echo ✋ 终止编排器服务器进程 PID: %%i
    taskkill /f /pid %%i 2>nul
)

REM 查找并终止 MCP 服务器进程
echo 🌐 搜索 MCP 适配器服务器进程...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| findstr mcp-server') do (
    echo ✋ 终止 MCP 服务器进程 PID: %%i
    taskkill /f /pid %%i 2>nul
)

REM 查找并终止所有相关的 Node.js 进程（如果有其他相关进程名称）
echo 📋 搜索其他相关 Node.js 进程...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| findstr ":345"') do (
    echo ✋ 终止相关进程 PID: %%i
    taskkill /f /pid %%i 2>nul
)

echo.
echo ✅ 服务器已停止
echo.
echo 🧹 清理完成
echo.

REM 验证进程已停止
echo 🔍 验证停止状态...
echo.
echo 当前 Node.js 进程:
tasklist /fi "imagename eq node.exe" | findstr node.exe

echo.
echo 💡 提示: 您可以使用 start-mcp-integration.bat 重新启动服务器
echo.
pause