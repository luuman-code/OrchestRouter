#!/bin/bash
# 测试脚本 - 验证自定义模型提供商功能

echo "=== 测试自定义模型提供商功能 ==="
echo

# 检查后端服务器是否运行
echo "1. 检查后端服务器状态..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3458/health 2>/dev/null)
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "   ✓ 后端服务器运行正常 (状态码: $BACKEND_STATUS)"
else
    echo "   ✗ 后端服务器未运行 (状态码: $BACKEND_STATUS)"
    echo "   提示: 运行 'node src/orchestrator/OrchestratorServer.js' 启动后端服务器"
fi

# 检查前端服务器是否运行
echo
echo "2. 检查前端服务器状态..."
FRONTEND_PORT=""
for port in {5173..5200}; do
    if curl -s -o /dev/null -w "" http://localhost:$port 2>/dev/null; then
        FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port 2>/dev/null)
        if [ "$FRONTEND_STATUS" != "404" ] && [ "$FRONTEND_STATUS" != "000" ]; then
            FRONTEND_PORT=$port
            break
        fi
    fi
done

if [ -n "$FRONTEND_PORT" ]; then
    echo "   ✓ 前端服务器运行正常 (端口: $FRONTEND_PORT)"
    echo "   访问地址: http://localhost:$FRONTEND_PORT"
else
    echo "   ✗ 前端服务器未运行"
    echo "   提示: 在 ui/ 目录下运行 'npm run dev' 启动前端服务器"
fi

echo
echo "3. 测试配置API端点..."
CONFIG_RESPONSE=$(curl -s http://localhost:3458/config 2>/dev/null)
if [ $? -eq 0 ]; then
    PROVIDER_COUNT=$(echo $CONFIG_RESPONSE | python -c "import sys, json; print(len(json.load(sys.stdin)['Providers']))" 2>/dev/null)
    if [ -n "$PROVIDER_COUNT" ]; then
        echo "   ✓ 配置API工作正常"
        echo "   ✓ 当前配置中有 $PROVIDER_COUNT 个提供商"
    else
        echo "   ✓ 配置API可达"
    fi
else
    echo "   ✗ 配置API无法访问"
fi

echo
echo "=== 测试完成 ==="
echo
echo "要使用增强的模型提供商功能:"
echo "1. 确保后端服务器运行在端口 3458"
echo "2. 启动前端服务器 (通常在 5173-5200 端口之间)"
echo "3. 访问前端页面并转到 '模型提供商' 标签页"
echo "4. 您现在可以:"
echo "   - 使用预设模板添加提供商 (原有的功能)"
echo "   - 点击 '添加自定义' 按钮创建完全自定义的提供商"
echo "   - 配置供应商转换器和自定义请求头"