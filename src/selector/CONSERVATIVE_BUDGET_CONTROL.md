# 保守预估 + 实时反馈预算控制改进

## 问题背景

在实际运行过程中，系统存在以下预算控制时延问题：

1. **预估与实际成本更新时延**：实际成本更新发生在任务完成后，若后续任务在选择时仍使用旧预算，可能导致短暂超支
2. **批量任务并发场景**：当多个任务几乎同时选择模型时，它们可能都使用旧的预算信息
3. **缺乏安全边际**：原始预算控制没有考虑估算误差，容易因实际成本高于预估而超支

## 解决方案

### 1. 保守预估机制

通过引入安全边际系数，在预估成本基础上增加一定比例的缓冲，以应对实际成本可能高于预估的情况：

```javascript
// 启用保守预估（默认启用）
const controller = new CostController(10.00, {
  conservativeEstimation: true,  // 启用保守预估
  safetyMargin: 0.2              // 20% 安全边际
});

// 分配预估成本时自动应用安全边际
const cost = { total: 1.00, isLocal: false };
controller.allocateEstimated(cost, 'task_001', 'gpt-4o-mini');
// 实际承诺预算：$1.00 * (1 + 0.2) = $1.20
```

### 2. 实时反馈循环

实现三阶段预算状态管理：

```
待确认 (pending) → 已确认 (confirmed) → 已完成 (completed)
       ↓                    ↓                   ↓
  占用 committedBudget   释放安全边际       更新实际花费
```

#### 阶段说明

1. **待确认阶段**：任务选择模型后，占用 `committedBudget`（含安全边际）
2. **已确认阶段**：任务开始执行前，释放安全边际，保留预估成本
3. **已完成阶段**：任务执行完成后，用实际成本替换预估成本

### 3. 待确认预估管理

使用 `Map` 结构跟踪待确认预估，支持：

- 超时自动清理（防止任务未执行导致预算被永久占用）
- 手动确认释放安全边际
- 实时查询待确认数量

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `conservativeEstimation` | boolean | `true` | 是否启用保守预估 |
| `safetyMargin` | number | `0.2` | 安全边际系数（0-1 之间） |
| `pendingConfirmTimeout` | number | `30000` | 待确认超时时间（毫秒） |
| `realTimeFeedbackEnabled` | boolean | `true` | 是否启用实时反馈 |

## 使用示例

### 基础使用

```javascript
const CostController = require('./core/CostController');

// 创建控制器（默认配置）
const controller = new CostController(10.00);

// 分配预估成本
const cost = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
controller.allocateEstimated(cost, 'task_001', 'gpt-4o-mini');

// 任务开始执行时确认预估
controller.confirmEstimate('task_001', cost);

// 任务完成后更新实际成本
const actualCost = { total: 0.95, input: 0.38, output: 0.57 };
controller.updateActualCost('task_001', actualCost, { input: 380, output: 570 });
```

### 生产环境配置

```javascript
const controller = new CostController(10.00, {
  conservativeEstimation: true,      // 启用保守预估
  safetyMargin: 0.15,                // 15% 安全边际
  pendingConfirmTimeout: 60000,      // 60 秒超时
  realTimeFeedbackEnabled: true      // 启用实时反馈
});
```

### 获取详细预算状态

```javascript
const status = controller.getDetailedBudgetStatus();
console.log(status);
// 输出:
// {
//   initialBudget: 10.00,
//   spent: 2.50,
//   committedBudget: 1.20,
//   availableBudget: 6.30,
//   remainingBudget: 7.50,
//   budgetUtilization: 0.37,
//   pendingEstimatesCount: 1,
//   conservativeEstimationEnabled: true,
//   safetyMargin: 0.2
// }
```

## API 参考

### 新增方法

| 方法 | 说明 |
|------|------|
| `getAvailableBudget()` | 获取可用预算（考虑已承诺预算） |
| `getDetailedBudgetStatus()` | 获取详细的预算状态 |
| `confirmEstimate(taskId, actualCost)` | 确认预估成本，释放安全边际 |
| `_cleanupPendingEstimates()` | 清理过期的待确认预估 |

### 修改方法

| 方法 | 变更说明 |
|------|----------|
| `canAllocate(cost, useConservative)` | 新增 `useConservative` 参数 |
| `allocateEstimated(cost, taskId, modelId)` | 增加安全边际计算和待确认管理 |
| `updateActualCost(taskId, actualCost, tokenUsage)` | 自动处理待确认到已完成的状态转换 |
| `getBudgetUtilization()` | 计算时包含已承诺预算 |
| `getStatistics()` | 增加保守预估相关统计 |

## 部署建议

### 开发/测试环境
```javascript
{
  conservativeEstimation: true,
  safetyMargin: 0.1,           // 较低安全边际，便于测试
  pendingConfirmTimeout: 5000  // 较短超时，快速发现问题
}
```

### 生产环境
```javascript
{
  conservativeEstimation: true,
  safetyMargin: 0.15,          // 15-20% 安全边际
  pendingConfirmTimeout: 60000 // 60 秒超时
}
```

### 高并发场景
```javascript
{
  conservativeEstimation: true,
  safetyMargin: 0.25,          // 更高安全边际
  pendingConfirmTimeout: 30000 // 较短超时，快速释放预算
}
```

## 预期效果

1. **避免超支**：通过保守预估，在批量任务场景下确保总承诺预算不超过初始预算
2. **实时反馈**：三阶段状态管理确保预算状态实时更新
3. **自动恢复**：过期预估自动清理，防止预算被永久占用
4. **灵活配置**：支持根据不同场景调整安全边际系数

## 测试验证

运行 `test_conservative_budget.js` 验证以下场景：

1. 基础保守预估功能
2. 安全边际防止超支
3. 实时反馈循环
4. 批量任务场景（模拟并发选择）
5. 待确认预估过期清理
6. 禁用保守预估