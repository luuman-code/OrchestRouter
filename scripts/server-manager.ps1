# OrchestRouter Server Management Script

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action
)

$port = 3458
$processName = "node"
$scriptPath = "src/orchestrator/index.js"

function Start-Server {
    Write-Host "🔍 Checking if server is already running..." -ForegroundColor Yellow

    $existingProcess = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($existingProcess) {
        Write-Host "⚠️  Server is already running on port $port (PID: $($existingProcess.OwningProcess))" -ForegroundColor Yellow
        return
    }

    Write-Host "🚀 Starting OrchestRouter Server..." -ForegroundColor Green
    Start-Process node -ArgumentList $scriptPath

    Start-Sleep -Seconds 3

    $newProcess = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($newProcess) {
        Write-Host "✅ Server started successfully on port $port (PID: $($newProcess.OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to start server" -ForegroundColor Red
    }
}

function Stop-Server {
    Write-Host "🔍 Looking for server process on port $port..." -ForegroundColor Yellow

    $tcpConnection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($tcpConnection) {
        $processId = $tcpConnection.OwningProcess
        Write-Host "🛑 Terminating process $processId..." -ForegroundColor Red
        Stop-Process -Id $processId -Force
        Write-Host "✅ Server stopped successfully" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  No server process found on port $port" -ForegroundColor Cyan
    }
}

function Restart-Server {
    Write-Host "🔄 Restarting OrchestRouter Server..." -ForegroundColor Magenta
    Stop-Server
    Start-Sleep -Seconds 2
    Start-Server
}

function Show-Status {
    $tcpConnection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($tcpConnection) {
        Write-Host "✅ Server is running on port $port (PID: $($tcpConnection.OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "🔴 Server is not running on port $port" -ForegroundColor Red
    }
}

switch ($Action) {
    "start" { Start-Server }
    "stop" { Stop-Server }
    "restart" { Restart-Server }
    "status" { Show-Status }
}