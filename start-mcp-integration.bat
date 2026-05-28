@echo off
REM MCP 集成启动脚本
REM 同时启动编排器服务器和 MCP 适配器服务器

echo 🚀 启动 MCP 集成环境
echo ========================

REM 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 未安装或不在 PATH 中
    pause
    exit /b 1
)

echo ✅ Node.js 版本正常

REM 检查编排器服务器是否已运行
echo.
echo 🔍 检查编排器服务器状态...
curl -s http://localhost:3458/health >nul 2>&1
if errorlevel 1 (
    echo ⚠️  编排器服务器未运行，正在启动...

    REM 启动编排器服务器
    echo.
    echo 📡 启动编排器服务器 (端口 3458)...
    start "Orchestrator Server" cmd /c "node start-orchestrator.js"

    echo ⏳ 等待编排器服务器启动 (10 秒)...
    timeout /t 10 /nobreak >nul

    REM 验证编排器服务器启动
    curl -s http://localhost:3458/health >nul 2>&1
    if errorlevel 1 (
        echo ❌ 编排器服务器启动失败
        pause
        exit /b 1
    )
    echo ✅ 编排器服务器已启动
) else (
    echo ✅ 编排器服务器已运行
)

REM 启动 MCP 适配器服务器
echo.
echo 🌐 启动 MCP 适配器服务器 (端口 3459)...
start "MCP Adapter Server" cmd /c "node mcp-server.js"

echo ⏳ 等待 MCP 适配器启动 (5 秒)...
timeout /t 5 /nobreak >nul

REM 验证 MCP 服务器
curl -s http://localhost:3459/mcp-server-info >nul 2>&1
if errorlevel 1 (
    echo ❌ MCP 适配器服务器启动失败
    pause
    exit /b 1
) else (
    echo ✅ MCP 适配器服务器已启动
)

echo.
echo ========================================
echo    MCP 集成环境已准备就绪
echo ========================================
echo.
echo 📊 服务器状态:
echo    • 编排器服务器: http://localhost:3458
echo    • MCP 适配器:    http://localhost:3459
echo.
echo 🛠️  可用工具:
echo    • run-orchestration: 执行编排任务
echo.
echo 📋 要在 Claude Code 中使用:
echo    1. 配置 MCP 服务器连接到 http://localhost:3459
echo    2. Claude Code 将能调用 run-orchestration 工具
echo    3. 工具将转发请求到编排器并返回工具调用结果
echo.
echo 📄 更多信息: MCP-INTEGRATION-GUIDE.md
echo.

REM 显示服务器进程
echo 🖥️  运行中的进程:
wmic process where "CommandLine like '%start-orchestrator%' or CommandLine like '%mcp-server%'" get ProcessId,CommandLine

echo.
pause