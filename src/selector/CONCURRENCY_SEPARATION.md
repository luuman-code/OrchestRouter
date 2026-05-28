# 并发控制职责划分文档

## 概述

为避免选择器与执行器之间的重复控制或资源竞争，系统明确划分了并发控制的职责：

| 组件 | 职责 | 具体任务 |
|------|------|----------|
| **选择器 (Selector)** | 负载感知选择 | 提供模型负载信息，在多个可用模型中优先选择负载较低的，返回选择结果时附带负载评分 |
| **执行器 (Executor)** | 槽位获取与释放 | 执行前尝试获取槽位，决定等待或降级，执行后释放槽位 |
| **并发管理器 (ConcurrencyManager)** | 负载数据提供 + 槽位管理原语 | 提供负载查询接口，提供槽位获取/释放的基础方法 |

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        任务提交                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  选择器 (负载感知选择)                                           │
│  1. 获取各模型负载状态 (getLoadScore)                            │
│  2. 在评估中考虑负载因子                                         │
│  3. 返回最佳模型 + 负载信息                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  执行器 (槽位获取与执行)                                         │
│  1. 尝试获取槽位 (acquireSlot)                                   │
│  2. 决策：等待 / 降级 / 拒绝                                     │
│  3. 执行任务                                                     │
│  4. 释放槽位 (releaseSlot)                                       │
└─────────────────────────────────────────────────────────────────┘
```

## 组件说明

### 1. ConcurrencyManager（并发管理器）

位置：`concurrency/ConcurrencyManager.js`

**职责**：
- 提供负载信息查询接口（供选择器使用）
- 提供槽位管理原语（供执行器使用）
- 不直接参与业务逻辑决策

**核心方法**：

```javascript
// 负载查询接口（供选择器使用）
getLoadScore(modelId)              // 获取负载分数 (0-1)
getModelLoadStatus(modelId)        // 获取详细负载状态
getAllModelsLoadStatus()           // 获取所有模型的负载状态

// 槽位管理原语（供执行器使用）
acquireSlot(modelId)               // 异步获取槽位（可能需要等待）
tryAcquireSlot(modelId)            // 快速尝试获取（不等待）
releaseSlot(modelId)               // 释放槽位
```

**使用示例**：

```javascript
const concurrencyManager = new ConcurrencyManager();
concurrencyManager.setModelRegistry(modelRegistry);

// 选择器查询负载
const loadStatus = concurrencyManager.getModelLoadStatus('claude-sonnet-4-6');
console.log(loadStatus);
// 输出: {
//   modelId: 'claude-sonnet-4-6',
//   maxConcurrency: 10,
//   currentUsage: 3,
//   availableSlots: 7,
//   loadScore: 0.3,
//   recommendation: 'normal'
// }
```

### 2. ModelEvaluator（模型评估器）

位置：`core/ModelEvaluator.js`

**职责**：
- 在模型选择过程中考虑负载因素
- 返回选择结果时附带负载信息
- 不直接占用或释放槽位

**返回结果结构**：

```javascript
{
  modelId: 'claude-sonnet-4-6',
  model: {...},
  cost: {...},
  load_info: {                    // 新增：负载信息
    modelId: 'claude-sonnet-4-6',
    maxConcurrency: 10,
    currentUsage: 3,
    availableSlots: 7,
    loadScore: 0.3,
    recommendation: 'normal'      // 'ready' | 'normal' | 'busy' | 'overloaded'
  },
  selectionReason: {...},
  alternatives: [...]
}
```

**使用示例**：

```javascript
const modelEvaluator = new ModelEvaluator(modelRegistry, configManager, statusMonitor);

const selection = modelEvaluator.selectBestModel(task);
console.log(`选择模型：${selection.modelId}`);
console.log(`负载状态：${selection.load_info.recommendation}`);
console.log(`可用槽位：${selection.load_info.availableSlots}`);
```

### 3. TaskExecutor（任务执行器）

位置：`executor/TaskExecutor.js`

**职责**：
- 执行前获取槽位
- 根据配置决定等待策略或降级策略
- 执行任务
- 执行后释放槽位

**降级策略**：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `wait` | 等待槽位可用 | 对特定模型有强依赖的任务 |
| `fallback` | 选择负载较低的替代模型 | 可以灵活选择模型的任务 |
| `reject` | 立即拒绝，返回错误 | 需要快速失败的实时任务 |

**使用示例**：

```javascript
const taskExecutor = new TaskExecutor(concurrencyManager, executor);

// 执行任务（带并发控制）
const result = await taskExecutor.executeWithConcurrencyControl(
  'claude-sonnet-4-6',
  task,
  {
    timeoutMs: 30000,              // 等待槽位超时时间
    fallbackStrategy: 'wait'       // 槽位已满时的策略
  }
);
```

## 完整使用流程

```javascript
// 1. 初始化组件
const modelRegistry = new ModelRegistry(config);
const concurrencyManager = new ConcurrencyManager();
concurrencyManager.setModelRegistry(modelRegistry);

const taskExecutor = new TaskExecutor(
  concurrencyManager,
  actualExecutor  // 实际的 API 调用器
);

const modelEvaluator = new ModelEvaluator(
  modelRegistry,
  configManager,
  statusMonitor
);

// 2. 选择器进行负载感知选择
const selection = modelEvaluator.selectBestModel(task);
console.log(`选择模型：${selection.modelId}`);
console.log(`推荐状态：${selection.load_info.recommendation}`);

// 3. 执行器负责槽位管理和执行
const result = await taskExecutor.executeWithConcurrencyControl(
  selection.modelId,
  task,
  {
    timeoutMs: 30000,
    fallbackStrategy: 'fallback'  // 如果原模型繁忙，使用替代模型
  }
);

console.log(`任务完成：${result.result}`);
```

## 为什么选择器不直接管理槽位？

方案 A（选择器负责并发控制）存在以下问题：

1. **职责混淆**：选择器的职责是评估和选择，而非资源调度
2. **生命周期不匹配**：选择是瞬时操作，而槽位占用贯穿整个执行周期
3. **错误处理复杂**：如果执行失败，需要回溯释放槽位，增加复杂性
4. **难以支持降级策略**：执行器无法根据实时情况决定等待或降级

因此，推荐采用方案 B：**选择器负责负载感知，执行器负责槽位管理**。

## 监控与告警

系统提供以下监控指标：

```javascript
const stats = concurrencyManager.getStatistics();
console.log(stats);
// 输出:
// {
//   totalActiveSlots: 5,           // 当前正在处理的请求总数
//   totalWaitingRequests: 2,       // 正在等待可用槽位的请求数
//   modelsWithWaitQueue: [...],    // 有等待队列的模型列表
//   loadDistribution: {...}        // 每个模型的负载分布
// }
```

当等待请求数超过阈值或平均等待时间过长时，系统应触发告警。

## 测试

运行测试脚本验证职责划分：

```bash
node test_concurrency_separation.js
```

测试验证：
- ✓ 选择器职责：提供负载信息，进行负载感知选择（不占用槽位）
- ✓ 执行器职责：负责槽位获取、任务执行、槽位释放、降级决策
- ✓ 并发管理器职责：提供负载查询接口和槽位管理原语
