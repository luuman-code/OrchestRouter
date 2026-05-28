@echo off
echo Starting OrchestRouter UI Configuration Center...
echo.

echo 1. Starting OrchestRouter backend service...
start "OrchestRouter Backend" cmd /c "cd /d "C:\Users\LWB\OrchestRouter" && node src/orchestrator/index.js"

timeout /t 3 /nobreak >nul

echo.
echo 2. Starting UI Configuration Center...
start "UI Config Center" cmd /c "cd /d "C:\Users\LWB\OrchestRouter\ui" && npm run dev"

echo.
echo Services started!
echo - Backend: http://localhost:3458
echo - UI: Will be available at http://localhost:5180 or similar port
echo.
echo Please open your browser and navigate to the UI address shown above.
pause