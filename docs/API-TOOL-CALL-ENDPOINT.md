# 编排器 API 工具调用端点测试说明

## 概述

编排器服务器提供了一个特殊的 API 端点，用于将整合器的输出转换为 Claude Code 可直接使用的工具调用格式。这使得 Claude Code 能够自动创建和读写文件，实现完整的代码库操作。

## API 端点

### 工具调用端点
- **路径**: `/v1/orchestrate-tool-calls` 或 `/orchestrate-tool-calls`
- **方法**: `POST`
- **功能**: 将编排器的整合结果转换为 Anthropic 工具调用格式

## 请求格式

```json
{
  "task": {
    "title": "任务标题",
    "description": "任务详细描述",
    "deliverables": [
      {
        "id": "任务ID",
        "description": "具体描述",
        "type": "类型（ui/api/model/style/test/config/logic/database/general）",
        "filePath": "预期输出文件路径"
      }
    ]
  },
  "options": {
    "enableDecomposition": true,
    "enableModelSelection": true,
    "enableExecution": true
  },
  "outputFormat": "tool_call"
}
```

## 响应格式

```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "write_file_randomId",
      "name": "write_file",
      "input": {
        "file_path": "path/to/file.js",
        "content": "file content...",
        "language": "javascript"
      }
    },
    {
      "type": "tool_use",
      "id": "bash_randomId",
      "name": "bash",
      "input": {
        "command": "mkdir -p path/to",
        "description": "创建目录命令"
      }
    }
  ]
}
```

## 支持的工具调用类型

1. **write_file** - 创建或覆盖文件
2. **edit_file** - 编辑现有文件
3. **bash** - 执行 shell 命令

## 使用示例

### 简单测试请求
```bash
curl -X POST http://localhost:3458/v1/orchestrate-tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "title": "创建测试文件",
      "description": "创建一个简单的测试文件",
      "deliverables": [
        {
          "id": "test-file",
          "description": "创建一个简单的测试文件",
          "type": "general",
          "filePath": "test/example.txt"
        }
      ]
    },
    "options": {
      "enableDecomposition": true,
      "enableExecution": true
    },
    "outputFormat": "tool_call"
  }'
```

### 复杂应用请求
```bash
curl -X POST http://localhost:3458/v1/orchestrate-tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "title": "创建Web应用",
      "description": "创建一个包含前端和后端的简单Web应用",
      "deliverables": [
        {
          "id": "frontend-app",
          "description": "React前端应用组件",
          "type": "ui",
          "filePath": "src/App.jsx"
        },
        {
          "id": "backend-server",
          "description": "Express后端服务器",
          "type": "api",
          "filePath": "server.js"
        },
        {
          "id": "package-json",
          "description": "项目依赖配置文件",
          "type": "config",
          "filePath": "package.json"
        }
      ]
    },
    "options": {
      "enableDecomposition": true,
      "enableModelSelection": true,
      "enableExecution": true
    },
    "outputFormat": "tool_call"
  }'
```

## 响应分析

编排器的工具调用端点会生成以下类型的工具调用：

- **文件创建调用**: `write_file` 工具调用，用于创建新文件
- **文件编辑调用**: `edit_file` 工具调用，用于修改现有文件
- **命令执行调用**: `bash` 工具调用，用于执行系统命令

## Claude Code 集成

Claude Code 可以直接消费这些工具调用：

1. 接收工具调用响应
2. 识别 `write_file` 调用并创建相应文件
3. 识别 `edit_file` 调用并更新文件内容
4. 识别 `bash` 调用并执行系统命令

## 优势

1. **自动化文件操作**: Claude Code 可以直接根据编排器输出创建和修改文件
2. **标准化输出格式**: 统一的工具调用格式便于处理
3. **端到端集成**: 从任务分析到文件创建的完整自动化流程
4. **安全操作**: 工具调用格式确保操作的安全性和可控性

## 验证测试

运行测试验证工具调用功能：

```bash
node tests/api-tool-call-test.js
```

该测试会验证:
- 端点可用性
- 响应格式正确性
- 工具调用生成情况
- 复杂任务处理能力