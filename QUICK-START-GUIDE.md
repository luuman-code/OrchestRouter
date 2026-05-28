# Claude Code & 编排器 端到端测试 - 快速启动指南

## 一次性设置步骤

### 1. 启动服务器
```bash
# 方法 1: 使用批处理脚本
start-mcp-integration.bat

# 方法 2: 手动启动
# 终端 1:
node start-orchestrator.js

# 终端 2:
node mcp-server.js
```

### 2. 在 Claude Code 中配置 MCP 服务器
1. 打开 Claude Code 设置
2. 进入 MCP 服务器配置
3. 添加新服务器:
   - 名称: `Orchestrator MCP`
   - URI: `http://localhost:3459`
   - 类型: `HTTP`
   - 认证: `None`

### 3. 验证连接
在 Claude Code 中应该能看到:
- MCP 服务器连接状态: `Connected`
- 可用工具: `run-orchestration`
- 工具描述: `Run a task through the orchestrator server and return tool calls`

## Claude Code 使用示例

在 Claude Code 对话中:
```
"请帮我创建一个简单的博客系统，包含文章列表页面、文章详情页面和评论功能。"
```

Claude Code 将:
1. 自动调用 `run-orchestration` 工具
2. MCP 适配器将请求转发到编排器服务器
3. 编排器执行: 分解 → 选择模型 → 并行执行 → 整合
4. 返回工具调用格式结果
5. Claude Code 自动执行 `write_file` 工具
6. 创建相应的文件 (HTML, CSS, JS, etc.)

## 验证测试

### 1. 检查服务器状态
```bash
curl http://localhost:3458/health          # 编排器
curl http://localhost:3459/mcp-server-info # MCP 适配器
curl http://localhost:3459/tools          # 可用工具
```

### 2. 手动测试工具
```bash
node test-mcp-integration.js
```

## 故障排除

### 问题: Claude Code 找不到 MCP 工具
- 检查编排器服务器 (3458) 是否运行
- 检查 MCP 适配器服务器 (3459) 是否运行
- 检查 Claude Code MCP 配置是否正确

### 问题: 工具调用失败
- 检查网络连接
- 检查服务器日志
- 确认防火墙设置

### 问题: 文件未创建
- 检查 Claude Code 的文件访问权限
- 确认工具调用权限设置

## 清理
要停止服务器:
```bash
# Ctrl+C 停止相应的终端进程
# 或使用任务管理器结束 node 进程
```

## 相关文档
- `MCP-INTEGRATION-GUIDE.md` - 详细配置指南
- `END-TO-END-TEST-COMPLETION-REPORT.md` - 完整报告
- `tests/mcp-test-result.json` - 测试结果