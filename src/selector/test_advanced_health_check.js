/**
 * 健康检查分布式锁和错峰执行改进测试
 */
const AdvancedModelStatusMonitor = require('./monitor/AdvancedModelStatusMonitor');
const SimpleDistributedLock = require('./utils/SimpleDistributedLock');

async function testHealthCheckImprovements() {
  console.log("=== 健康检查分布式锁和错峰执行改进测试 ===\n");

  // 创建分布式锁实例
  const distributedLock = new SimpleDistributedLock();

  // 创建高级监控器实例
  const monitor = new AdvancedModelStatusMonitor({
    distributedLock: distributedLock,
    instanceId: 'test-instance-1',
    checkInterval: 10000, // 10秒检查间隔
    maxHealthCheckDelay: 2000, // 最大2秒延迟
    globalMaxRequests: 50, // 全局最大50次/分钟
    providerLimits: {
      openai: 30,      // OpenAI限制30次/分钟
      anthropic: 20,   // Anthropic限制20次/分钟
      google: 25       // Google限制25次/分钟
    }
  });

  console.log("1. 注册多个模型进行测试:");

  // 注册几个测试模型，分别代表不同的提供商
  const testModels = [
    { id: 'gpt-4o-mini', provider: 'openai', endpoint: null },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', endpoint: null },
    { id: 'gemini-2.0-flash', provider: 'google', endpoint: null },
    { id: 'gpt-4o', provider: 'openai', endpoint: null }
  ];

  testModels.forEach(model => {
    monitor.registerModel(model.id, {
      healthCheckEndpoint: model.endpoint,
      provider: model.provider
    });
    console.log(`   已注册模型: ${model.id} (提供商: ${model.provider})`);
  });

  console.log("\n2. 检查速率限制统计:");
  const rateLimitStats = monitor.getRateLimitStats();
  console.log(`   全局请求数: ${rateLimitStats.globalRequests}/${rateLimitStats.globalMax}`);
  console.log(`   全局剩余: ${rateLimitStats.globalRemaining}`);
  console.log(`   提供商限制:`, rateLimitStats.providerLimits);
  console.log(`   提供商使用:`, rateLimitStats.providerUsage);

  console.log("\n3. 检查模型状态:");
  const allStatus = monitor.getAllModelStatus();
  for (const [modelId, status] of Object.entries(allStatus)) {
    console.log(`   ${modelId}: ${status.status} (提供商: ${status.provider})`);
  }

  console.log("\n4. 模拟健康检查过程:");
  console.log("   - 应用分布式锁，防止单个实例重复检查");
  console.log("   - 应用错峰执行，避免多个实例同时检查");
  console.log("   - 应用速率限制，防止API限流");

  // 模拟一些请求
  console.log("\n5. 模拟记录健康检查请求:");
  ['openai', 'anthropic', 'google', 'openai'].forEach(provider => {
    monitor.recordHealthCheckRequest(provider);
    console.log(`   记录 ${provider} 提供商的健康检查请求`);
  });

  console.log("\n6. 更新速率限制统计:");
  const updatedStats = monitor.getRateLimitStats();
  console.log(`   更新后全局请求数: ${updatedStats.globalRequests}/${updatedStats.globalMax}`);
  console.log(`   更新后提供商使用:`, updatedStats.providerUsage);

  console.log("\n7. 模拟速率限制检查:");
  console.log(`   全局速率限制: ${monitor.isGlobalRateLimited()}`);
  console.log(`   OpenAI速率限制: ${monitor.isProviderRateLimited('openai')}`);
  console.log(`   Anthropic速率限制: ${monitor.isProviderRateLimited('anthropic')}`);

  console.log("\n8. 测试分布式锁功能:");
  const lockResult1 = await monitor.acquireHealthCheckLock('test-model-1');
  console.log(`   尝试获取 'test-model-1' 锁: ${lockResult1}`);

  // 尝试再次获取同一模型的锁
  const lockResult2 = await monitor.acquireHealthCheckLock('test-model-1');
  console.log(`   再次尝试获取 'test-model-1' 锁: ${lockResult2} (应为false)`);

  // 获取不同模型的锁
  const lockResult3 = await monitor.acquireHealthCheckLock('test-model-2');
  console.log(`   尝试获取 'test-model-2' 锁: ${lockResult3}`);

  console.log("\n9. 检查监控报告:");
  const report = monitor.exportReport();
  console.log(`   报告时间: ${report.timestamp}`);
  console.log(`   模型总数: ${report.totalModels}`);
  console.log(`   状态分布:`, report.statusDistribution);
  console.log(`   速率限制信息:`, {
    globalCurrent: report.rateLimitInfo.globalCurrentRequests,
    globalMax: report.rateLimitInfo.globalMaxRequests,
    globalRemaining: report.rateLimitInfo.globalRemaining,
    providerLimits: report.rateLimitInfo.providerLimits
  });

  console.log("\n10. 模拟大量并发健康检查测试:");
  // 创建第二个监控器实例（模拟另一个实例）
  const monitor2 = new AdvancedModelStatusMonitor({
    distributedLock: distributedLock,
    instanceId: 'test-instance-2',
    checkInterval: 10000,
    maxHealthCheckDelay: 2000,
    globalMaxRequests: 50,
    providerLimits: {
      openai: 30,
      anthropic: 20,
      google: 25
    }
  });

  // 注册相同的模型到第二个实例
  testModels.forEach(model => {
    monitor2.registerModel(model.id, {
      healthCheckEndpoint: model.endpoint,
      provider: model.provider
    });
  });

  console.log("   同时使用两个监控器实例测试分布式锁效果...");

  // 同时对相同模型发起健康检查
  const promises = [
    monitor.performHealthCheck('gpt-4o-mini'),
    monitor2.performHealthCheck('gpt-4o-mini'), // 与上面是同一模型，应被锁阻塞
    monitor.performHealthCheck('claude-sonnet-4-6'),
    monitor2.performHealthCheck('gemini-2.0-flash')
  ];

  await Promise.allSettled(promises);
  console.log("   并发健康检查完成");

  console.log("\n=== 健康检查改进测试完成 ===");
}

// 运行测试
testHealthCheckImprovements().catch(console.error);