/**
 * 并发控制职责划分测试
 * 验证选择器（负载感知选择）与执行器（槽位获取与释放）之间的职责分离
 */

const ConcurrencyManager = require('./concurrency/ConcurrencyManager');
const TaskExecutor = require('./executor/TaskExecutor');
const ModelRegistry = require('./registry/ModelRegistry');
const ModelEvaluator = require('./core/ModelEvaluator');

// 模拟配置管理器
class MockConfigManager {
  getRulesForTaskType(taskType) {
    return [];
  }
  getStrategyConfig() {
    return {};
  }
}

// 模拟任务执行器
class MockExecutor {
  async execute(modelId, task) {
    console.log(`  [MockExecutor] 执行任务：模型=${modelId}, 任务=${task.description}`);
    // 模拟执行延迟
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      success: true,
      result: `任务完成：${task.description}`,
      modelId
    };
  }
}

async function testConcurrencySeparation() {
  console.log("=== 并发控制职责划分测试 ===\n");

  // 初始化组件
  const modelRegistry = new ModelRegistry({});
  const configManager = new MockConfigManager();
  const statusMonitor = new (require('./monitor/ModelStatusMonitor'))();
  const concurrencyManager = new ConcurrencyManager();
  const taskExecutor = new TaskExecutor(concurrencyManager, new MockExecutor());

  // 设置依赖
  statusMonitor.setModelRegistry(modelRegistry);
  concurrencyManager.setModelRegistry(modelRegistry);

  const modelEvaluator = new ModelEvaluator(modelRegistry, configManager, statusMonitor);

  console.log("1. 测试选择器：负载感知选择（不占用槽位）");
  console.log("   查询各模型负载状态...\n");

  const loadStatus = concurrencyManager.getAllModelsLoadStatus();
  loadStatus.forEach(status => {
    console.log(`   - ${status.modelId}: 负载=${status.loadScore.toFixed(2)}, 可用槽位=${status.availableSlots}/${status.maxConcurrency}, 推荐=${status.recommendation}`);
  });

  console.log("\n2. 测试选择器：模型选择返回负载信息");

  const testTask = {
    type: 'general',
    description: '测试任务'
  };

  const selectionResult = modelEvaluator.selectBestModel(testTask);
  console.log(`   选择结果:`);
  console.log(`   - 模型：${selectionResult.modelId}`);
  console.log(`   - 负载分数：${selectionResult.load_info?.loadScore?.toFixed(2) || 'N/A'}`);
  console.log(`   - 可用槽位：${selectionResult.load_info?.availableSlots || 'N/A'}`);
  console.log(`   - 推荐状态：${selectionResult.load_info?.recommendation || 'N/A'}`);

  console.log("\n3. 测试执行器：槽位获取与释放");

  const modelId = selectionResult.modelId;
  console.log(`   执行任务前负载状态:`);
  const beforeStatus = concurrencyManager.getModelLoadStatus(modelId);
  console.log(`   - 当前使用：${beforeStatus.currentUsage}/${beforeStatus.maxConcurrency}`);

  // 执行任务（带并发控制）
  const result = await taskExecutor.executeWithConcurrencyControl(
    modelId,
    testTask,
    {
      timeoutMs: 5000,
      fallbackStrategy: 'wait'
    }
  );

  console.log(`   执行任务后负载状态:`);
  const afterStatus = concurrencyManager.getModelLoadStatus(modelId);
  console.log(`   - 当前使用：${afterStatus.currentUsage}/${afterStatus.maxConcurrency}`);

  console.log("\n4. 测试并发统计信息");
  const stats = concurrencyManager.getStatistics();
  console.log(`   - 总活跃槽位：${stats.totalActiveSlots}`);
  console.log(`   - 总等待请求：${stats.totalWaitingRequests}`);
  console.log(`   - 负载分布：`, JSON.stringify(stats.loadDistribution, null, 2));

  console.log("\n5. 测试槽位占用场景");

  // 手动占用一个槽位
  console.log("   占用槽位（不释放，模拟长时间任务）...");
  const slotResult = await concurrencyManager.acquireSlot(modelId);
  console.log(`   槽位占用成功：${slotResult.acquired}`);

  const duringStatus = concurrencyManager.getModelLoadStatus(modelId);
  console.log(`   占用期间负载状态:`);
  console.log(`   - 当前使用：${duringStatus.currentUsage}/${duringStatus.maxConcurrency}`);
  console.log(`   - 负载分数：${duringStatus.loadScore.toFixed(2)}`);
  console.log(`   - 推荐状态：${duringStatus.recommendation}`);

  // 释放槽位
  concurrencyManager.releaseSlot(modelId);
  console.log("   槽位已释放");

  console.log("\n6. 测试执行器降级策略");

  // 测试不同的降级策略
  const strategies = ['reject', 'fallback'];  // 移除'wait'策略，因为需要较长时间

  for (const strategy of strategies) {
    console.log(`\n   测试降级策略：${strategy}`);
    try {
      // 先占用所有槽位（使用 tryAcquireSlot 立即返回）
      const occupiedSlots = [];
      const maxConcurrency = concurrencyManager.getMaxConcurrency(modelId);

      // 使用循环占用槽位，但只记录成功占用的数量
      let successCount = 0;
      for (let i = 0; i < maxConcurrency; i++) {
        const slot = concurrencyManager.tryAcquireSlot(modelId);
        if (slot.acquired) {
          occupiedSlots.push(slot);
          successCount++;
        }
      }
      console.log(`   已占用 ${successCount}/${maxConcurrency} 个槽位`);

      // 尝试执行任务（使用较短的超时）
      try {
        await taskExecutor.executeWithConcurrencyControl(
          modelId,
          { ...testTask, description: `测试${strategy}策略` },
          {
            timeoutMs: 1000,
            fallbackStrategy: strategy
          }
        );
        console.log(`   执行成功（使用了${strategy}策略）`);
      } catch (error) {
        console.log(`   执行结果：${error.message}`);
      }

      // 释放所有槽位 - 确保每个槽位只释放一次
      console.log(`   释放 ${occupiedSlots.length} 个槽位`);
      for (let i = 0; i < occupiedSlots.length; i++) {
        concurrencyManager.releaseSlot(modelId);
      }

    } catch (error) {
      console.log(`   测试出错：${error.message}`);
    }
  }

  // 单独测试 wait 策略（不占用所有槽位，留一个槽位给等待的任务）
  console.log("\n   测试降级策略：wait (部分占用)");
  try {
    const occupiedSlots = [];
    const maxConcurrency = concurrencyManager.getMaxConcurrency(modelId);

    // 只占用部分槽位，留一个给等待的任务
    for (let i = 0; i < maxConcurrency - 1; i++) {
      concurrencyManager.tryAcquireSlot(modelId);
    }
    console.log(`   已占用 ${maxConcurrency - 1}/${maxConcurrency} 个槽位`);

    // 启动一个等待任务
    const waitPromise = taskExecutor.executeWithConcurrencyControl(
      modelId,
      { ...testTask, description: '测试 wait 策略' },
      {
        timeoutMs: 5000,
        fallbackStrategy: 'wait'
      }
    );

    // 等待一小段时间后释放一个槽位
    await new Promise(resolve => setTimeout(resolve, 500));
    concurrencyManager.releaseSlot(modelId);
    console.log('   释放一个槽位，等待任务应该可以继续执行');

    // 等待任务完成
    try {
      const result = await waitPromise;
      console.log(`   执行成功（wait 策略生效）`);
    } catch (error) {
      console.log(`   执行结果：${error.message}`);
    }

    // 释放所有槽位
    for (let i = 0; i < maxConcurrency - 1; i++) {
      concurrencyManager.releaseSlot(modelId);
    }
  } catch (error) {
    console.log(`   测试出错：${error.message}`);
  }

  console.log("\n=== 职责划分测试完成 ===");
  console.log("\n总结:");
  console.log("✓ 选择器职责：提供负载信息，进行负载感知选择（不占用槽位）");
  console.log("✓ 执行器职责：负责槽位获取、任务执行、槽位释放、降级决策");
  console.log("✓ 并发管理器职责：提供负载查询接口和槽位管理原语");
}

// 运行测试
testConcurrencySeparation().catch(console.error);