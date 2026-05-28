@echo off
chcp 65001 >nul
echo ========================================
echo   强制关闭所有 OrchestRouter 服务器
echo ========================================
echo.

:: 关闭编排器服务器 (端口 3458)
echo [1/4] 正在关闭编排器服务器 (端口 3458)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3458" ^| findstr "LISTENING"') do (
    echo   发现进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
        echo   进程 %%a 已不存在或无法终止
    ) else (
        echo   已终止进程 %%a
    )
)
echo   编排器服务器已关闭
echo.

:: 关闭 UI 服务器 (端口 5173-5180 范围)
echo [2/4] 正在关闭 UI 服务器 (端口 5173-5180)...
for %%p in (5173 5174 5175 5176 5177 5178 5179 5180) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p" ^| findstr "LISTENING"') do (
        echo   发现端口 %%p 的进程 PID: %%a
        taskkill /F /PID %%a >nul 2>&1
        if errorlevel 1 (
            echo   进程 %%a 已不存在或无法终止
        ) else (
            echo   已终止进程 %%a
        )
    )
)
echo   UI 服务器已关闭
echo.

:: 清理可能的 node 子进程
echo [3/4] 正在清理 node 进程...
taskkill /F /FI "WINDOWTITLE eq OrchestRouter*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq UI Config*" >nul 2>&1
echo   node 进程已清理
echo.

:: 等待端口释放
echo [4/4] 等待端口释放...
timeout /t 2 /nobreak >nul
echo.

:: 验证是否还有监听端口
echo ========================================
echo   验证结果
echo ========================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3458" ^| findstr "LISTENING"') do (
    echo [警告] 端口 3458 仍有进程监听：PID %%a
)
for %%p in (5173 5174 5175 5176 5177 5178 5179 5180) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p" ^| findstr "LISTENING"') do (
        echo [警告] 端口 %%p 仍有进程监听：PID %%a
    )
)
echo.
echo 所有服务器已关闭完成！
echo ========================================
pause
