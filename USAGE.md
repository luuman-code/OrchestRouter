# OrchestRouter 混合迭代编排器使用指南

## 简介

OrchestRouter 是一个支持混合式迭代的弹性任务分解系统，集成了多层处理能力和智能决策机制。

## 核心概念

### 三层迭代架构 (L1/L2/L3)

- **L1 (快速修复)**: 用于处理简单问题，如语法错误、拼写错误等
- **L2 (局部改进)**: 用于处理功能缺失、单元测试失败等问题
- **L3 (完整迭代)**: 用于处理架构调整、质量不达标等复杂问题

### 智能决策机制

系统根据以下因素自动选择合适的处理层级：

- 问题类型 (语法错误、功能缺失、架构问题等)
- 质量评分
- 错误率
- 历史迭代表现

## 安装与配置

### 安装

```bash
npm install
```

### 基本配置

```javascript
const OrchestratorWithHybridIteration = require('./src/orchestrator/OrchestratorWithHybridIteration');

const orchestrator = new OrchestratorWithHybridIteration({
  port: 3000,
  iteration: {
    enableHybridIteration: true,           // 启用混合迭代
    maxIterations: 8,                     // 最大迭代次数
    minQualityScore: 0.75,                // 最低质量分数
    maxTimeMs: 1200000,                   // 最大执行时间 (20分钟)
    enableDegradationMode: true,          // 启用降级模式
    degradationThreshold: 0.2             // 降级阈值
  },
  execution: {
    maxRetries: 2,                       // 最大重试次数
    defaultTimeout: 20000,               // 默认超时时间
    retryDelay: 500                      // 重试延迟
  },
  levelSwitch: {
    l1ToL2Threshold: 0.4,                // L1到L2切换阈值
    l2ToL3Threshold: 0.3,                // L2到L3切换阈值
    l3ToL2Threshold: 0.75,               // L3到L2切换阈值
    l2ToL1Threshold: 0.85,               // L2到L1切换阈值
    maxL1FailuresBeforeUpgrade: 2         // L1最大失败次数后升级
  }
});
```

## API 接口

### 迭代式编排接口

```
POST /v1/orchestrate-iterative
```

#### 请求体参数

```json
{
  "messages": [
    {
      "role": "user",
      "content": "任务描述"
    }
  ],
  "options": {
    "userId": "用户ID",
    "projectId": "项目ID",
    "enableIteration": true
  }
}
```

#### 响应格式

```json
{
  "success": true,
  "iterationResult": {
    "level": "L1",
    "finalResult": "...",
    "qualityScore": 0.8,
    "success": true
  },
  "sessionId": "会话ID",
  "totalDuration": 12345,
  "degradedMode": false
}
```

### 会话状态查询

```
GET /v1/iteration-status/:sessionId
```

## 主要功能组件

### 1. 执行器增强 (ExecutorEnhancer)

- 超时重试机制
- 结果截断检测和续写
- 代码验证和自动修复
- 动态 token 数量调整

### 2. 整合器增强 (IntegratorEnhancer)

- 异常处理和错误传播
- 输出完整性检查
- 依赖冲突检测
- 绝对路径转换为相对路径
- 必要文件自动生成

### 3. 问题分类器 (ProblemClassifier)

- 问题类型识别 (语法错误、功能缺失等)
- 推荐处理层级 (L1/L2/L3)
- 推荐修复操作

### 4. 快速修复处理器 (QuickFixProcessor)

- L1 层级的快速修复
- Claude Code 集成
- 修复验证

### 5. 迭代控制器 (IterationController)

- L1/L2/L3 迭代流程管理
- 迭代终止条件
- 层级切换逻辑

### 6. 质量门控 (QualityGate)

- 多维度质量评估 (功能性、可靠性、可用性等)
- 质量分数计算
- 问题检测和建议

### 7. 测试验证器 (TestValidator)

- 单元测试执行
- 集成测试执行
- 端到端测试执行
- 代码覆盖率检查

### 8. 反馈分析器 (FeedbackAnalyzer)

- 测试结果分析
- 质量结果分析
- 性能问题识别
- 改进建议生成

### 9. 重新规划器 (Replanner)

- 任务重规划
- 子任务调整
- 优先级重排序

### 10. 增强会话管理器 (EnhancedSessionManager)

- 迭代历史记录
- 会话统计信息
- 趋势分析

### 11. 层级切换管理器 (LevelSwitchManager)

- 层级切换决策
- 稳定性检查
- 切换合理性评估

## 优化特性

### 参数调优
- L1/L2/L3 阈值已优化以平衡效率和质量
- 层级切换条件考虑了质量趋势和稳定性
- 质量评分权重调整以重视可靠性

### 性能优化
- L1 响应速度提升 (减少重试和延迟)
- 迭代终止条件优化 (避免不必要迭代)
- 反馈分析准确性改进

### 稳定性改进
- 全面的错误处理机制
- 自动降级模式
- 详细的日志和监控

## 最佳实践

### 1. 配置建议

- 对于简单任务，可适当提高 L1 阈值以减少不必要的升级
- 根据项目复杂度调整最小质量分数
- 在生产环境中启用降级模式

### 2. 监控要点

- 关注迭代成功率
- 监控质量分数趋势
- 跟踪 L1/L2/L3 的使用比例

### 3. 故障排除

- 降级模式激活表示系统组件故障
- 高 L3 使用率可能表示需求描述不够详细
- 连续失败可能表示需要人工介入

## 示例

```javascript
// 创建任务
const task = {
  messages: [{
    role: 'user',
    content: '创建一个简单的待办事项应用，包含添加和删除功能'
  }],
  options: {
    userId: 'user123',
    projectId: 'project456'
  }
};

// 发送请求
const response = await fetch('http://localhost:3000/v1/orchestrate-iterative', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(task)
});

const result = await response.json();
console.log('迭代结果:', result);
```

## 故障恢复

当系统检测到故障时：
1. 自动切换到降级模式
2. 使用简化处理流程
3. 记录故障详情
4. 发送告警通知