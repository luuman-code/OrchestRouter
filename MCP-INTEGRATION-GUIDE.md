# Claude Code & 编排器端到端测试指南

## 概述

本指南介绍如何设置 MCP (Model Context Protocol) 适配器，实现 Claude Code 与编排器服务器的直接集成，从而进行真正的端到端测试。

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │ ──► │  MCP 适配器      │ ──► │   编排器服务器   │
│                 │     │  (mcp-server.js) │     │   (现有)        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       │                       │                        │
   工具调用请求              转换协议                   HTTP 请求
       │                       │                        │
   ←───────────────────────────┼────────────────────────←┘
   工具调用响应            返回工具调用格式            编排结果
```

## 设置步骤

### 1. 启动编排器服务器

```bash
# 确保编排器服务器正在运行（端口 3458）
node start-orchestrator.js
```

### 2. 启动 MCP 适配器服务器

```bash
# 启动 MCP 适配器（端口 3459）
node mcp-server.js
```

### 3. 配置 Claude Code

在 Claude Code 中配置 MCP 服务器：

1. **打开 Claude Code 设置**
2. **进入 MCP 配置部分**
3. **添加新的 MCP 服务器**：
   ```
   Name: Orchestrator MCP
   URI: http://localhost:3459
   Type: HTTP
   Authentication: None
   ```

### 4. 验证连接

在 Claude Code 中应该能看到：
- MCP 服务器连接成功
- 可用工具：`run-orchestration`
- 可用资源：`orchestration-task`

## 使用示例

### Claude Code 中的对话示例

```
用户: "帮我创建一个简单的 Web 应用，包含首页、样式和交互功能"

Claude Code:
[使用工具: run-orchestration]
输入:
{
  "task": {
    "title": "Web 应用创建",
    "description": "创建一个包含首页、样式和交互功能的简单 Web 应用",
    "deliverables": [
      {
        "id": "home-page",
        "description": "创建主页面",
        "type": "ui",
        "filePath": "web/index.html"
      },
      {
        "id": "styles",
        "description": "创建样式文件",
        "type": "style",
        "filePath": "web/style.css"
      },
      {
        "id": "script",
        "description": "创建交互脚本",
        "type": "logic",
        "filePath": "web/script.js"
      }
    ]
  },
  "options": {
    "enableDecomposition": true,
    "enableModelSelection": true,
    "enableExecution": true
  }
}

编排器服务器:
- 接收任务请求
- 执行分解 → 选择模型 → 执行 → 整合
- 返回工具调用格式响应

Claude Code:
[接收工具调用]:
[
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "web/index.html",
      "content": "<!DOCTYPE html>..."
    }
  },
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "web/style.css",
      "content": "body { ... }"
    }
  },
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "web/script.js",
      "content": "console.log(...)"
    }
  }
]

Claude Code:
- 自动执行 write_file 工具
- 创建相应文件
- 向用户显示结果
```

## MCP 端点

### 资源端点
- `GET /resources` - 列出可用资源
- `GET /resources/{name}` - 获取资源详情

### 工具端点
- `GET /tools` - 列出可用工具
- `GET /tools/{name}` - 获取工具详情
- `POST /tools/{name}` - 执行工具

### 服务信息
- `GET /mcp-server-info` - 获取服务器信息

## 验证测试

### 1. 检查 MCP 服务器状态

```bash
curl http://localhost:3459/mcp-server-info
```

### 2. 检查可用工具

```bash
curl http://localhost:3459/tools
```

### 3. 手动测试工具调用

```bash
curl -X POST http://localhost:3459/tools/run-orchestration \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "title": "测试任务",
      "description": "简单的测试任务",
      "deliverables": [
        {
          "id": "test",
          "description": "创建测试文件",
          "type": "general",
          "filePath": "test.txt"
        }
      ]
    }
  }'
```

## 端口说明

- **3456**: CCR Router (已配置)
- **3458**: 编排器服务器 (已配置)
- **3459**: MCP 适配器服务器 (新增)

## 故障排除

### 连接问题
- 确保编排器服务器 (3458) 正在运行
- 检查防火墙设置
- 验证网络连接

### 工具不显示
- 重启 Claude Code
- 检查 MCP 配置
- 确认服务器响应格式

## 安全注意事项

- MCP 服务器当前使用无认证模式 (仅用于本地测试)
- 生产环境应配置适当的认证
- 限制服务器访问权限

## 结论

完成以上配置后，您就可以在 Claude Code 中直接使用编排器的强大功能：
- 任务自动分解
- 模型智能选择
- 代码并行生成
- 结果自动整合
- 文件自动创建

这实现了真正的端到端自动化测试流程。