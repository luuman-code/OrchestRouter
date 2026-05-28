/**
 * 健康检查改进测试脚本
 */

// 引入必要的模块
const ModelStatusMonitor = require('./monitor/ModelStatusMonitor');

// 模拟模型注册表
class MockModelRegistry {
  constructor() {
    this.models = {
      'openai-model': {
        id: 'openai-model',
        name: 'gpt-4o-mini',
        provider: 'openai',
        type: 'cloud',
        pricing: { input: 0.01, output: 0.03 },
        qualityScore: 0.85
      },
      'anthropic-model': {
        id: 'anthropic-model',
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        type: 'cloud',
        pricing: { input: 0.01, output: 0.03 },
        qualityScore: 0.88
      },
      'local-model': {
        id: 'local-model',
        name: 'Local Model',
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
        qualityScore: 0.7
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

async function testHealthCheckImprovements() {
  console.log("=== 健康检查改进测试 ===\n");

  const mockRegistry = new MockModelRegistry();
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

  console.log("1. 测试健康检查配置...");
  console.log(`   - 基础间隔: ${monitor.healthCheckConfig.intervalMs}ms`);
  console.log(`   - 超时时间: ${monitor.healthCheckConfig.timeoutMs}ms`);
  console.log(`   - 负载大小: ${monitor.healthCheckConfig.payloadSize}`);
  console.log(`   - 请求类型: ${monitor.healthCheckConfig.requestType}`);

  console.log("\n2. 测试API密钥获取...");
  for (const modelId of Object.keys(mockRegistry.models)) {
    const model = mockRegistry.getModel(modelId);
    const apiKey = monitor.getApiKeyForProvider(model.provider);
    console.log(`   - ${modelId} (${model.provider}): ${apiKey ? '已配置' : '未配置'}`);
  }

  console.log("\n3. 测试负载自适应...");
  for (const modelId of ['openai-model', 'anthropic-model']) {
    const model = mockRegistry.getModel(modelId);
    const basePayload = monitor.healthCheckConfig.providerConfigs[model.provider].payload;

    const minimalPayload = monitor.adaptPayloadForProvider(model.provider, basePayload, 'minimal');
    const smallPayload = monitor.adaptPayloadForProvider(model.provider, basePayload, 'small');

    console.log(`   - ${modelId} 最小负载 max_tokens: ${minimalPayload.max_tokens}`);
    console.log(`   - ${modelId} 小负载 max_tokens: ${smallPayload.max_tokens}`);
  }

  console.log("\n4. 测试请求头构建...");
  for (const modelId of ['openai-model', 'anthropic-model', 'local-model']) {
    const model = mockRegistry.getModel(modelId);
    const headers = monitor.buildHeadersForProvider(model.provider);
    console.log(`   - ${modelId} (${model.provider}) 请求头:`, Object.keys(headers));
  }

  console.log("\n5. 测试端点获取...");
  for (const provider of ['openai', 'anthropic', 'google', 'azure']) {
    const endpoint = monitor.getHealthEndpoint(provider);
    console.log(`   - ${provider}: ${endpoint || '无'}`);
  }

  console.log("\n6. 测试智能调度...");
  // 添加一些模型到状态映射中以便测试调度
  for (const modelId of Object.keys(mockRegistry.models)) {
    monitor.statusMap.set(modelId, {
      modelId: modelId,
      isAvailable: true,
      currentLatencyMs: 500,
      errorRate: 0.05,
      rateLimitRemaining: 100,
      lastChecked: new Date(),
      successRate: 0.95
    });
  }

  // 模拟一些历史数据以测试调度算法
  for (const modelId of ['openai-model', 'local-model']) {
    // 添加几个成功检查的历史记录
    for (let i = 0; i < 5; i++) {
      const result = { isAvailable: true, currentLatencyMs: 400 + i * 10 };
      monitor.smartScheduler.recordCheckResult(modelId, result);
    }
  }

  for (const modelId of Object.keys(mockRegistry.models)) {
    const optimalInterval = monitor.smartScheduler.calculateOptimalInterval(modelId);
    console.log(`   - ${modelId} 最优检查间隔: ${optimalInterval}ms`);
  }

  console.log("\n7. 测试本地模型健康检查...");
  const localModel = mockRegistry.getModel('local-model');
  try {
    const localHealth = await monitor.performLocalHealthCheck(localModel);
    console.log(`   - 本地模型健康状态:`, localHealth);
  } catch (error) {
    console.log(`   - 本地模型健康检查错误:`, error.message);
  }

  console.log("\n8. 测试云端模型健康检查配置...");
  for (const modelId of ['openai-model', 'anthropic-model']) {
    const model = mockRegistry.getModel(modelId);
    const config = monitor.getHealthCheckConfigForProvider(model.provider);
    console.log(`   - ${modelId} 配置端点:`, config.providerConfigs[model.provider].endpoint);
  }

  console.log("\n=== 测试完成 ===");

  // 显示一些内部配置
  console.log("\n配置详情:");
  console.log("- HealthCheckConfig:", JSON.stringify(monitor.healthCheckConfig, null, 2));
}

// 运行测试
testHealthCheckImprovements().catch(console.error);