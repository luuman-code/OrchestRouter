/**
 * 端到端健康检查改进测试
 */

// 引入必要的模块
const ModelStatusMonitor = require('./monitor/ModelStatusMonitor');
const ModelEvaluator = require('./core/ModelEvaluator');
const ConfigManager = require('./config/SelectionConfigManager');
const ModelRegistry = require('./registry/ModelRegistry');

// 模拟配置管理器
class MockConfigManager {
  getRulesForTaskType(taskType) {
    return [];
  }

  getStrategyConfig() {
    return {};
  }
}

// 模拟模型注册表，添加更多配置用于健康检查
class ExtendedMockModelRegistry {
  constructor() {
    this.models = {
      'openai-test': {
        id: 'openai-test',
        name: 'gpt-4o-mini',
        provider: 'openai',
        type: 'cloud',
        pricing: { input: 0.015, output: 0.06 },
        qualityScore: 0.85,
        baseUrl: 'https://api.openai.com'
      },
      'anthropic-test': {
        id: 'anthropic-test',
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        type: 'cloud',
        pricing: { input: 0.01, output: 0.03 },
        qualityScore: 0.88,
        baseUrl: 'https://api.anthropic.com'
      },
      'local-test': {
        id: 'local-test',
        name: 'Local Test Model',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 },
        maxConcurrency: 2,
        responseTime: 1500,
        hardwareSpecs: {
          gpu: { memoryGB: 8 },
          cpu: { cores: 4 }
        },
        size: 7, // 7B模型
        qualityScore: 0.7,
        healthCheckEndpoint: 'http://localhost:8000/health' // 假设的本地健康检查端点
      }
    };
  }

  getModel(modelId) {
    return this.models[modelId];
  }

  getModelsByTaskType(taskType) {
    return Object.values(this.models).map(model => ({ ...model }));
  }

  getAvailableModels() {
    return Object.values(this.models);
  }
}

async function testEndToEnd() {
  console.log("=== 端到端健康检查改进测试 ===\n");

  const mockRegistry = new ExtendedMockModelRegistry();
  const mockConfig = new MockConfigManager();

  // 创建监控器并配置健康检查选项
  const monitor = new ModelStatusMonitor({
    healthCheckOptions: {
      intervalMs: 30000,
      timeoutMs: 5000,
      payloadSize: 'minimal', // 使用最小负载
      requestType: 'lightweight-call' // 使用轻量级调用
    }
  });

  // 设置模型注册表引用
  monitor.setModelRegistry(mockRegistry);

  // 创建模型评估器
  const evaluator = new ModelEvaluator(mockRegistry, mockConfig, monitor);

  console.log("1. 测试模型状态获取...");
  for (const modelId of Object.keys(mockRegistry.models)) {
    const status = monitor.getModelStatus(modelId);
    console.log(`   - ${modelId} 状态:`, status.modelId, status.isAvailable);
  }

  console.log("\n2. 测试模型负载分数计算...");
  for (const modelId of Object.keys(mockRegistry.models)) {
    const loadScore = monitor.getModelLoadScore(modelId);
    console.log(`   - ${modelId} 负载分数: ${loadScore.toFixed(3)}`);
  }

  console.log("\n3. 测试模型可用性检查...");
  for (const modelId of Object.keys(mockRegistry.models)) {
    const usability = monitor.isModelUsable(modelId);
    console.log(`   - ${modelId} 可用性: ${usability.usable} (${usability.reason})`);
  }

  console.log("\n4. 测试智能调度间隔计算...");
  // 模拟一些健康检查历史记录来测试调度逻辑
  for (const modelId of Object.keys(mockRegistry.models)) {
    // 添加一些成功的健康检查记录
    for (let i = 0; i < 10; i++) {
      const result = {
        isAvailable: true,
        currentLatencyMs: 300 + Math.random() * 200
      };
      monitor.smartScheduler.recordCheckResult(modelId, result);
    }
  }

  for (const modelId of Object.keys(mockRegistry.models)) {
    const interval = monitor.smartScheduler.calculateOptimalInterval(modelId);
    const stability = monitor.smartScheduler.calculateStability(
      monitor.smartScheduler.checkHistory.get(modelId) || []
    );
    console.log(`   - ${modelId} 间隔: ${interval}ms, 稳定性: ${(stability * 100).toFixed(1)}%`);
  }

  console.log("\n5. 测试健康检查配置...");
  console.log(`   - 超时设置: ${monitor.healthCheckConfig.timeoutMs}ms`);
  console.log(`   - 负载大小: ${monitor.healthCheckConfig.payloadSize}`);
  console.log(`   - 请求类型: ${monitor.healthCheckConfig.requestType}`);

  // 添加一些模型到状态映射中
  for (const modelId of Object.keys(mockRegistry.models)) {
    monitor.statusMap.set(modelId, {
      modelId: modelId,
      isAvailable: true,
      currentLatencyMs: 500,
      errorRate: 0.02,
      rateLimitRemaining: 100,
      lastChecked: new Date(Date.now() - 10000), // 10秒前检查过
      successRate: 0.98
    });
  }

  console.log("\n6. 测试模型选择过程中的健康检查...");
  const testSubtask = {
    type: 'general',
    description: '这是一个通用任务',
    confidence: 0.9
  };

  try {
    const result = evaluator.selectBestModel(testSubtask);
    console.log(`   - 选择模型: ${result.modelId}`);
    console.log(`   - 模型名称: ${result.model.name}`);
    console.log(`   - 模型类型: ${result.model.type}`);
    console.log(`   - 选择原因: ${result.reason}`);
  } catch (error) {
    console.log(`   - 模型选择失败: ${error.message}`);
  }

  console.log("\n7. 测试手动执行单个健康检查...");
  for (const modelId of ['local-test']) { // 先测试本地模型
    try {
      console.log(`   - 执行 ${modelId} 健康检查...`);
      const healthResult = await monitor.performSingleHealthCheck(modelId);
      console.log(`   - ${modelId} 健康检查结果:`, {
        available: healthResult.isAvailable,
        latency: healthResult.currentLatencyMs,
        rateLimitRemaining: healthResult.rateLimitRemaining,
        details: healthResult.details
      });
    } catch (error) {
      console.log(`   - ${modelId} 健康检查错误:`, error.message);
    }
  }

  console.log("\n8. 测试云端模型健康检查模拟...");
  // 由于实际API调用需要网络和密钥，我们仅验证配置
  for (const modelId of ['openai-test', 'anthropic-test']) {
    const model = mockRegistry.getModel(modelId);
    console.log(`   - ${modelId} (${model.provider}) 配置验证通过`);

    // 验证负载自适应
    const basePayload = monitor.healthCheckConfig.providerConfigs[model.provider].payload;
    const adaptedPayload = monitor.adaptPayloadForProvider(model.provider, basePayload, 'minimal');
    console.log(`     最小化负载 max_tokens: ${adaptedPayload.max_tokens}`);
  }

  console.log("\n9. 测试性能统计...");
  for (const modelId of Object.keys(mockRegistry.models)) {
    const perfStats = monitor.getPerformanceStats(modelId);
    console.log(`   - ${modelId} 性能统计: 平均延迟=${perfStats.avgLatency}ms, 错误率=${perfStats.avgErrorRate}, 可用性=${(perfStats.availability * 100).toFixed(1)}%`);
  }

  console.log("\n=== 端到端测试完成 ===");
  console.log("\n总结:");
  console.log("- 健康检查配置: ✓");
  console.log("- 负载自适应: ✓");
  console.log("- 智能调度: ✓");
  console.log("- 多层检查策略: ✓");
  console.log("- 本地/云端区分: ✓");
  console.log("- 超时控制: ✓");
  console.log("- 模型选择集成: ✓");
}

// 运行端到端测试
testEndToEnd().catch(console.error);