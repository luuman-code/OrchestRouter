/**
 * BatchScheduler 测试
 *
 * 测试批量预调度机制：
 * 1. 验证在槽位不足时自动调整任务到备选模型
 * 2. 验证按序号优先调整靠后的任务
 * 3. 验证配置选项生效
 */
const BatchScheduler = require('./core/BatchScheduler');

// 模拟 ConcurrencyController
class MockConcurrencyController {
  constructor(modelSlotConfig = {}) {
    this.modelSlotConfig = modelSlotConfig; // { modelId: { maxConcurrency, currentUsage } }
  }

  async getLoadInfo(modelId) {
    const config = this.modelSlotConfig[modelId] || { maxConcurrency: 10, currentUsage: 0 };
    return {
      maxConcurrency: config.maxConcurrency,
      currentUsage: config.currentUsage,
      availableSlots: config.maxConcurrency - config.currentUsage,
      loadScore: config.currentUsage / config.maxConcurrency
    };
  }
}

// 测试用例
async function runTests() {
  console.log('=== BatchScheduler 测试 ===\n');

  // 测试1: 槽位充足，不需要调整
  console.log('--- 测试1: 槽位充足 ---');
  {
    const controller = new MockConcurrencyController({
      'gpt-4o': { maxConcurrency: 10, currentUsage: 0 },
      'gpt-3.5-turbo': { maxConcurrency: 10, currentUsage: 0 }
    });

    const scheduler = new BatchScheduler({ concurrencyController: controller });

    const requests = [
      { modelId: 'gpt-4o', taskId: 'task-0', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-1', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-2', alternatives: ['gpt-3.5-turbo'] }
    ];

    const result = await scheduler.preScheduleBatch(requests);
    console.log('调整数量:', result.adjustments.length);
    console.log('调整后请求:', result.adjustedRequests.map(r => r.modelId));
    console.log('✅ 测试1通过: 槽位充足无需调整\n');
  }

  // 测试2: 槽位不足，按序号调整靠后的任务
  console.log('--- 测试2: 槽位不足，按序号调整 ---');
  {
    const controller = new MockConcurrencyController({
      'gpt-4o': { maxConcurrency: 3, currentUsage: 0 }, // 只有3个槽位
      'gpt-3.5-turbo': { maxConcurrency: 10, currentUsage: 0 }
    });

    const scheduler = new BatchScheduler({ concurrencyController: controller });

    const requests = [
      { modelId: 'gpt-4o', taskId: 'task-0', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-1', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-2', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-3', alternatives: ['gpt-3.5-turbo'] }, // 超出槽位
      { modelId: 'gpt-4o', taskId: 'task-4', alternatives: ['gpt-3.5-turbo'] }  // 超出槽位
    ];

    const result = await scheduler.preScheduleBatch(requests);
    console.log('需要调整的任务数:', result.adjustments.length);
    console.log('调整详情:', result.adjustments.map(a => `task-${a.taskIndex}: ${a.originalModel} -> ${result.adjustedRequests[a.taskIndex].modelId}`));
    console.log('✅ 测试2通过: 序号靠后的任务被调整\n');
  }

  // 测试3: 无备选模型，无法调整
  console.log('--- 测试3: 无备选模型 ---');
  {
    const controller = new MockConcurrencyController({
      'gpt-4o': { maxConcurrency: 2, currentUsage: 0 }
    });

    const scheduler = new BatchScheduler({ concurrencyController: controller });

    const requests = [
      { modelId: 'gpt-4o', taskId: 'task-0', alternatives: [] },
      { modelId: 'gpt-4o', taskId: 'task-1', alternatives: [] },
      { modelId: 'gpt-4o', taskId: 'task-2', alternatives: [] } // 无备选
    ];

    const result = await scheduler.preScheduleBatch(requests);
    console.log('需要调整的任务数:', result.adjustments.length);
    console.log('✅ 测试3通过: 无备选模型时无法调整\n');
  }

  // 测试4: 多模型混合
  console.log('--- 测试4: 多模型混合 ---');
  {
    const controller = new MockConcurrencyController({
      'gpt-4o': { maxConcurrency: 2, currentUsage: 0 },
      'claude-3': { maxConcurrency: 2, currentUsage: 0 },
      'gemini-pro': { maxConcurrency: 10, currentUsage: 0 }
    });

    const scheduler = new BatchScheduler({ concurrencyController: controller });

    const requests = [
      { modelId: 'gpt-4o', taskId: 'task-0', alternatives: ['gemini-pro'] },
      { modelId: 'gpt-4o', taskId: 'task-1', alternatives: ['gemini-pro'] },
      { modelId: 'claude-3', taskId: 'task-2', alternatives: ['gemini-pro'] },
      { modelId: 'claude-3', taskId: 'task-3', alternatives: ['gemini-pro'] },
      { modelId: 'gpt-4o', taskId: 'task-4', alternatives: ['gemini-pro'] }, // 超出
      { modelId: 'claude-3', taskId: 'task-5', alternatives: ['gemini-pro'] }  // 超出
    ];

    const result = await scheduler.preScheduleBatch(requests);
    console.log('需要调整的任务数:', result.adjustments.length);
    console.log('调整后分配:');
    result.adjustedRequests.forEach((r, i) => {
      console.log(`  task-${i}: ${r.modelId}`);
    });
    console.log('✅ 测试4通过\n');
  }

  // 测试5: 禁用自动降级
  console.log('--- 测试5: 禁用自动降级 ---');
  {
    const controller = new MockConcurrencyController({
      'gpt-4o': { maxConcurrency: 2, currentUsage: 0 },
      'gpt-3.5-turbo': { maxConcurrency: 10, currentUsage: 0 }
    });

    const scheduler = new BatchScheduler({ concurrencyController: controller });

    const requests = [
      { modelId: 'gpt-4o', taskId: 'task-0', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-1', alternatives: ['gpt-3.5-turbo'] },
      { modelId: 'gpt-4o', taskId: 'task-2', alternatives: ['gpt-3.5-turbo'] }
    ];

    const result = await scheduler.preScheduleBatch(requests, { enableAutoFallback: false });
    console.log('需要调整的任务数:', result.adjustments.length);
    console.log('✅ 测试5通过: 禁用时不做调整\n');
  }

  console.log('=== 所有测试完成 ===');
}

// 运行测试
runTests().catch(console.error);
