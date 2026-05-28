# 模型选择器与编排器集成文档

## 概述

此文档描述了模型选择器与编排器服务器的集成，使编排器能够在任务分解后为每个子任务智能选择最合适的模型。

## 架构变化

### 1. 新增功能模块
- 模型选择器（ModelSelector）现已集成到 OrchestratorServer
- 支持自动初始化并在首次使用时准备就绪
- 与现有分解器功能协同工作

### 2. 工作流程变更

#### 原始流程：
```
Claude Code 请求 → 任务分解（如果需要）→ 转发到 CCR Router
```

#### 集成后流程：
```
Claude Code 请求 → 任务分解 → 为每个子任务选择模型 → 执行子任务 → 整合结果 → 返回
```

## 新增 API 端点

### 1. `/v1/orchestrate` (主要端点)
- 接收 Claude Code 的原始请求
- 自动判断是否需要编排
- 如果是复杂任务：分解 → 选择模型 → 执行
- 如果是简单任务：直接转发到 CCR Router

### 2. `/v1/select-model` (新)
- **方法**: POST
- **用途**: 直接调用模型选择器
- **请求体**:
```json
{
  "subtask": {
    "id": "task-id",
    "type": "ui|api|logic|database|config|test|general",
    "description": "任务描述"
  }
}
```

### 3. `/v1/model-selector-status` (新)
- **方法**: GET
- **用途**: 获取模型选择器的当前状态
- **响应**:
```json
{
  "initialized": true,
  "availableModels": ["model1", "model2", ...],
  "budgetStatus": {...},
  "learningReport": {...}
}
```

## 实现细节

### 1. 模型选择器初始化
```javascript
// 在 OrchestratorServer 构造函数中
this.modelSelector = null;

// 在首次使用时初始化
if (!this.modelSelector) {
  this.modelSelector = new ModelSelector({
    debug: this.config.debug
  });
}
```

### 2. 子任务模型选择
```javascript
async _selectModelsForSubtasks(subtasks) {
  // 为每个子任务选择模型
  const subtasksWithModels = await Promise.all(subtasks.map(async (subtask) => {
    const selectionResult = this.modelSelector.select(subtask);

    return {
      ...subtask,
      selected_model: selectionResult.selected_model,
      selection_reason: selectionResult.reason,
      estimated_cost: selectionResult.estimated_cost,
      // ...
    };
  }));

  return subtasksWithModels;
}
```

### 3. 选择结果整合
- 选择结果整合到最终的编排响应中
- 包含选择原因、预估成本和备选方案
- 提供模型使用统计信息

## 模型选择标准

根据不同任务类型自动选择最合适的模型：

| 任务类型 | 优先模型 | 选择原因 |
|---------|---------|----------|
| `ui` | Gemini 2.0 Flash, Claude Opus 4.6 | 视觉美感和创意生成能力强 |
| `logic` | Claude Sonnet 4.6, Claude Opus 4.6 | 逻辑推理和代码质量好 |
| `api` | Claude Sonnet 4.6, DeepSeek Coder | 性价比高，适合标准化任务 |
| `test` | DeepSeek Coder, Claude Haiku 4.5 | 测试代码模式固定 |
| `model` | Claude Sonnet 4.6, GPT-4o Mini | 理解复杂数据结构能力强 |
| `config` | Claude Haiku 4.5, GPT-4o Mini | 模式化任务，经济型模型 |

## 预算控制

- 继承模型选择器的预算控制功能
- 支持保守预估和实时反馈
- 防止成本超支

## 性能考虑

- 模型选择器采用异步初始化
- 支持并发处理多个子任务
- 结果缓存机制提高重复任务处理速度

## 错误处理

- 如果模型选择失败，自动使用默认模型 (gpt-4o-mini)
- 提供详细的错误信息和回退机制
- 记录选择失败的原因以便调试

## 测试验证

可通过以下方式验证集成：

1. 运行集成测试：`node tests/integration-model-selection-test.js`
2. 访问状态端点：`GET /v1/model-selector-status`
3. 直接调用模型选择：`POST /v1/select-model`
4. 触发完整编排：`POST /v1/orchestrate`

## 部署说明

- 确保编排器服务器有足够的内存处理模型选择器的初始化
- 监控预算使用情况以避免意外成本
- 定期检查学习数据以优化模型选择策略