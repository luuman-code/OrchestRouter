#!/bin/bash

# OrchestRouter Server Manager
# Usage: ./server-manager.sh [start|stop|restart|status]

PORT=3458
SCRIPT_PATH="src/orchestrator/index.js"

case "$1" in
    start)
        echo "🔍 Checking if server is already running..."
        if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
            PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
            echo "⚠️  Server is already running on port $PORT (PID: $PID)"
        else
            echo "🚀 Starting OrchestRouter Server..."
            node $SCRIPT_PATH &
            sleep 3
            if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
                PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
                echo "✅ Server started successfully on port $PORT (PID: $PID)"
            else
                echo "❌ Failed to start server"
            fi
        fi
        ;;
    stop)
        echo "🔍 Looking for server process on port $PORT..."
        if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
            PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
            echo "🛑 Terminating process $PID..."
            taskkill /F /PID $PID > nul 2>&1
            echo "✅ Server stopped successfully"
        else
            echo "ℹ️  No server process found on port $PORT"
        fi
        ;;
    restart)
        echo "🔄 Restarting OrchestRouter Server..."
        if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
            PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
            echo "🛑 Terminating process $PID..."
            taskkill /F /PID $PID > nul 2>&1
            sleep 2
        fi
        echo "🚀 Starting OrchestRouter Server..."
        node $SCRIPT_PATH &
        sleep 3
        if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
            NEW_PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
            echo "✅ Server restarted successfully on port $PORT (PID: $NEW_PID)"
        else
            echo "❌ Failed to restart server"
        fi
        ;;
    status)
        if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null; then
            PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}')
            echo "✅ Server is running on port $PORT (PID: $PID)"
        else
            echo "🔴 Server is not running on port $PORT"
        fi
        ;;
    *)
        echo "Usage: $0 [start|stop|restart|status]"
        exit 1
        ;;
esac