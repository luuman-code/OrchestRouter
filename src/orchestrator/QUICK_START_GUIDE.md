# 快速入门：模型选择器与编排器集成

## 启动服务器

```bash
# 启动编排器服务器
node start-orchestrator.js
```

服务器将在端口 3458 上运行。

## 基本使用

### 1. 检查服务器状态
```bash
curl http://localhost:3458/health
```

### 2. 检查模型选择器状态
```bash
curl http://localhost:3458/v1/model-selector-status
```

### 3. 直接选择模型
```bash
curl -X POST http://localhost:3458/v1/select-model \
  -H "Content-Type: application/json" \
  -d '{
    "subtask": {
      "id": "test-task-1",
      "type": "ui",
      "description": "创建一个现代化的用户界面"
    }
  }'
```

### 4. 完整编排流程
发送一个复杂任务给编排器，它会自动：
- 检测任务复杂度
- 分解任务
- 为每个子任务选择合适的模型
- 返回包含模型选择结果的完整信息

```bash
curl -X POST http://localhost:3458/v1/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "开发一个任务管理应用，包含任务列表页面、任务创建API和用户认证功能"
      }
    ],
    "model": "claude-3-5-sonnet",
    "max_tokens": 4096
  }'
```

## 响应格式

### 模型选择响应
```json
{
  "task_id": "test-task-1",
  "selected_model": "claude-sonnet-4-6",
  "reason": "UI 设计需要较强的视觉美感和创意生成能力",
  "estimated_cost": 0.015,
  "estimated_tokens": {"input": 500, "output": 1200},
  "alternatives": ["gpt-4o-mini", "claude-opus-4-6"],
  "cost_breakdown": {
    "input": 0.0075,
    "output": 0.0075,
    "total": 0.015,
    "isLocal": false
  },
  "timestamp": "2026-03-28T00:00:00.000Z"
}
```

### 编排响应（包含模型选择）
```json
{
  "orchestrated": true,
  "subtasks": [
    {
      "id": "subtask-1",
      "type": "ui",
      "title": "任务列表页面",
      "description": "创建任务列表的用户界面",
      "selected_model": "gemini-2.0-flash",
      "selection_reason": "UI 设计需要较强的视觉美感和创意生成能力",
      "estimated_cost": 0.012,
      "estimated_tokens": {"input": 450, "output": 900}
    }
  ],
  "modelSelections": [
    {
      "taskId": "subtask-1",
      "selectedModel": "gemini-2.0-flash",
      "reason": "UI 设计需要较强的视觉美感和创意生成能力",
      "estimatedCost": 0.012
    }
  ],
  "metadata": {
    "modelSelectionCompleted": true,
    "selectedModels": ["gemini-2.0-flash", "claude-sonnet-4-6"]
  }
}
```

## 任务类型映射

| 类型 | 说明 | 典型任务 |
|------|------|----------|
| `ui` | 用户界面 | 页面设计、布局、样式、视觉元素 |
| `api` | 接口开发 | REST API、端点、请求处理 |
| `logic` | 业务逻辑 | 算法、计算、决策流程 |
| `database` | 数据库 | 表结构、查询优化、存储过程 |
| `config` | 配置 | 设置文件、环境变量、部署配置 |
| `test` | 测试 | 单元测试、集成测试、验收测试 |
| `general` | 通用 | 其他未分类任务 |

## 故障排除

### 模型选择器未初始化
- 确保服务器启动时没有错误
- 检查依赖项是否完整安装
- 查看服务器日志中的错误信息

### 预算控制问题
- 检查 `costControl` 配置参数
- 确认预算设置合理
- 查看预算使用统计信息

### 任务类型识别不准确
- 可以显式指定 `type` 字段
- 调整关键词匹配规则
- 考虑使用更详细的描述