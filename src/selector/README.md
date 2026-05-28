# Model Selector (模型选择器) V1

智能模型选择器 - 根据任务类型、成本、质量等因素为子任务选择最合适的 LLM 模型。

## 实现状态

### 功能块完成情况

| 功能块 | 名称 | 状态 | 文件 |
|--------|------|------|------|
| A | 模型注册与管理层 | ✅ 完成 | `registry/ModelRegistry.js` |
| B | 配置与策略层 | ✅ 完成 | `config/SelectionConfigManager.js` |
| C | 模型评估与选择层 | ✅ 完成 | `core/ModelEvaluator.js` |
| D | 成本控制与监控层 | ✅ 完成 | `core/CostController.js` |
| E | 状态监控与降级层 | ✅ 完成 | `monitor/ModelStatusMonitor.js` |
| F | 历史反馈与学习层 | ✅ 完成 | `core/LearningSelector.js` |
| 主类 | ModelSelector | ✅ 完成 | `ModelSelector.js` |

### 实现计划对照

根据 `plans/02-model-selector-plan.md` 的实现步骤：

- [x] **阶段 1：基础框架**
  - [x] 创建模块目录结构
  - [x] 定义模型数据类和注册中心
  - [x] 编写模型配置文件
  - [x] 实现 Provider 抽象层

- [x] **阶段 2：规则选择器**
  - [x] 实现基于规则的选择逻辑
  - [x] 编写前端/后端任务选择规则
  - [x] 实现备选模型降级逻辑

- [x] **阶段 3：成本与预算**
  - [x] 实现 Token 估算器
  - [x] 实现成本计算器
  - [x] 实现预算控制器

- [x] **阶段 4：动态策略**
  - [x] 实现模型状态监控
  - [x] 实现动态降级策略
  - [x] 实现学习型选择器

- [x] **阶段 5：测试与优化**
  - [x] 编写单元测试
  - [x] 集成测试（与 Decomposer V4 联调）
  - [x] 性能优化

## 目录结构

```
src/selector/
├── index.js                    # 模块入口
├── ModelSelector.js            # 主类
├── package.json                # 包配置
├── README.md                   # 本文档
├── test.js                     # 功能测试
├── test-integration.js         # 集成测试
├── registry/
│   ├── ModelRegistry.js        # 模型注册中心
│   └── models.yaml             # 模型配置
├── config/
│   ├── SelectionConfigManager.js  # 配置管理器
│   └── selector-config.yaml       # 选择器配置
├── core/
│   ├── ModelEvaluator.js       # 模型评估器
│   ├── CostController.js       # 成本控制器
│   └── LearningSelector.js     # 学习型选择器
└── monitor/
    └── ModelStatusMonitor.js   # 状态监控器
```

## 快速开始

```javascript
const ModelSelector = require('./ModelSelector');

// 创建选择器实例
const selector = new ModelSelector({
  daily_budget: 10.00,
  max_cost_per_task: 0.50
});

// 为子任务选择模型
const subtask = {
  id: 'task_001',
  type: 'ui',
  description: '创建登录页面组件'
};

const result = selector.select(subtask);
console.log(`选择模型：${result.selected_model}`);
console.log(`原因：${result.reason}`);
console.log(`预计成本：$${result.estimated_cost}`);
```

## 与 Decomposer V4 集成

```javascript
const decomposer = require('./decomposer/index.js');
const selector = new ModelSelector(config);

// 1. 分解任务
const decomposition = await decomposer.decompose(task);

// 2. 为每个子任务选择模型
for (const subtask of decomposition.subtasks) {
  const selection = selector.select(subtask);
  subtask.assignedModel = selection.selected_model;
  subtask.estimatedCost = selection.estimated_cost;
}

// 3. 执行任务
// executor.execute(subtask, model=subtask.assignedModel);
```

## 可用模型

当前注册的默认模型：

| 模型 ID | 提供商 | 质量评分 | 适用任务类型 |
|--------|--------|---------|-------------|
| claude-opus-4-6 | Anthropic | 9.5 | ui, logic, api, complex-tasks |
| claude-sonnet-4-6 | Anthropic | 9.0 | logic, api, refactoring, debugging |
| claude-haiku-4-5 | Anthropic | 7.5 | logic, api, test, config |
| gemini-2.0-flash | Google | 8.5 | ui, style, creative |
| gpt-4o | OpenAI | 8.8 | ui, logic, api, test, creative |
| gpt-4o-mini | OpenAI | 8.0 | ui, logic, api, test |
| deepseek-coder | DeepSeek | 7.5 | logic, api, test |

## 任务类型映射

| 任务类型 | 首选模型 | 备选模型 |
|---------|---------|---------|
| ui | claude-opus-4-6, gemini-2.0-flash | gpt-4o-mini |
| style | gemini-2.0-flash, claude-opus-4-6 | gpt-4o-mini |
| logic | claude-opus-4-6, claude-sonnet-4-6 | deepseek-coder |
| api | claude-sonnet-4-6, deepseek-coder | gpt-4o-mini |
| test | deepseek-coder, claude-haiku-4-5 | gpt-4o-mini |
| model | claude-sonnet-4-6, gpt-4o-mini | deepseek-coder |
| general | gpt-4o-mini, claude-sonnet-4-6 | claude-haiku-4-5 |

## API 参考

### ModelSelector

```javascript
// 选择模型
select(subtask, additionalConstraints)

// 批量选择
batchSelect(subtasks)

// 记录反馈
recordFeedback(taskId, modelId, qualityScore, additionalMetrics)

// 更新预算
updateBudget(newBudget)

// 获取预算状态
getBudgetStatus()

// 获取模型状态
getModelStatus(modelId)

// 获取系统报告
getStatusReport()
```

## 运行测试

```bash
# 运行功能测试
node test.js

# 运行集成测试
node test-integration.js
```

## 配置

编辑 `config/selector-config.yaml` 自定义选择策略：

```yaml
selector:
  max_cost_per_task: 0.50
  daily_budget: 10.00
  quality_first: false

  fallback:
    max_fallback_depth: 2
    error_rate_threshold: 0.3
    latency_threshold_ms: 5000
```

## 特性

- **智能选择**：基于任务类型、质量评分和成本综合评估
- **成本控制**：实时预算监控和预警
- **动态降级**：根据模型可用性自动切换备选方案
- **学习优化**：记录历史反馈，持续优化选择策略
- **与 Decomposer V4 完全兼容**：无缝集成

## 许可证

MIT
