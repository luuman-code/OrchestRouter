@echo off
chcp 65001 >nul
echo ========================================
echo   启动 OrchestRouter 所有服务器
echo ========================================
echo.

:: 启动编排器服务器
echo [1/2] 正在启动编排器服务器...
start "OrchestRouter Backend" cmd /k "cd /d %~dp0 && node src/orchestrator/index.js"
echo   编排器服务器启动中 (端口 3458)...
timeout /t 3 /nobreak >nul

:: 启动 UI 服务器
echo [2/2] 正在启动 UI 服务器...
start "UI Config Center" cmd /k "cd /d %~dp0ui && npm run dev"
echo   UI 服务器启动中...
echo.

echo ========================================
echo   服务器启动完成！
echo   - 编排器服务器：http://localhost:3458
echo   - UI 服务器：http://localhost:5173 (或相近端口)
echo ========================================
echo.
echo 提示：按任意键关闭此窗口，服务器将在新窗口中继续运行
pause >nul
