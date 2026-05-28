/**
 * 完整资源感知模型选择测试
 */

// 引入必要的模块
const ModelEvaluator = require('./core/ModelEvaluator');
const ModelRegistry = require('./registry/ModelRegistry');
const ConfigManager = require('./config/SelectionConfigManager');
const ModelStatusMonitor = require('./monitor/ModelStatusMonitor');

// 创建模拟配置管理器
class MockConfigManager {
  getRulesForTaskType(taskType) {
    return [];
  }

  getStrategyConfig() {
    return {};
  }
}

// 创建模拟模型注册表
class MockModelRegistry {
  constructor() {
    this.models = {
      'local-small': {
        id: 'local-small',
        name: 'Local Small Model',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 },
        maxConcurrency: 3,
        responseTime: 1500,
        hardwareSpecs: {
          gpu: { memoryGB: 8 },
          cpu: { cores: 4 }
        },
        size: 7, // 7B模型
        qualityScore: 0.7
      },
      'local-medium': {
        id: 'local-medium',
        name: 'Local Medium Model',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 },
        maxConcurrency: 2,
        responseTime: 2500,
        hardwareSpecs: {
          gpu: { memoryGB: 12 },
          cpu: { cores: 6 }
        },
        size: 13, // 13B模型
        qualityScore: 0.8
      },
      'local-large': {
        id: 'local-large',
        name: 'Local Large Model',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 },
        maxConcurrency: 1,
        responseTime: 5000,
        hardwareSpecs: {
          gpu: { memoryGB: 24 },
          cpu: { cores: 8 }
        },
        size: 70, // 70B模型
        qualityScore: 0.9,
        computeIntensity: 0.8
      },
      'cloud-model': {
        id: 'cloud-model',
        name: 'Cloud Model',
        provider: 'openai',
        type: 'cloud',
        pricing: { input: 0.01, output: 0.03 },
        qualityScore: 0.85
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

async function testCompleteSystem() {
  console.log("=== 完整资源感知模型选择测试 ===\n");

  const mockRegistry = new MockModelRegistry();
  const mockConfig = new MockConfigManager();
  const statusMonitor = new ModelStatusMonitor();

  // 设置模型注册表引用
  statusMonitor.setModelRegistry(mockRegistry);

  const evaluator = new ModelEvaluator(mockRegistry, mockConfig, statusMonitor);

  // 测试不同的任务类型和复杂度
  const testTasks = [
    {
      type: 'simple-task',
      description: '这是一个简单的任务',
      confidence: 0.9
    },
    {
      type: 'complex-task',
      description: '这是一个复杂的逻辑任务，需要处理大量数据和多线程操作',
      confidence: 0.8,
      expectedSize: 400,
      technologies: ['algorithm', 'multithread']
    },
    {
      type: 'ai-task',
      description: '这是一个深度学习任务，需要高性能计算',
      confidence: 0.7,
      technologies: ['machine-learning', 'deep-learning']
    }
  ];

  for (const [index, task] of testTasks.entries()) {
    console.log(`--- 测试任务 ${index + 1}: ${task.type} ---`);

    // 估算token
    const tokenEstimate = evaluator.estimateTokens(task);
    console.log(`Token估算: 输入=${tokenEstimate.input}, 输出=${tokenEstimate.output}`);

    // 计算各模型的资源成本因子
    console.log("\n各模型资源成本因子:");
    for (const modelId of ['local-small', 'local-medium', 'local-large']) {
      const model = mockRegistry.getModel(modelId);
      const resourceFactor = evaluator.calculateResourceCostFactor(model, tokenEstimate);
      console.log(`  ${model.name}: ${resourceFactor.toFixed(3)}`);
    }

    // 进行模型选择
    const result = evaluator.selectBestModel(task);
    console.log(`\n选择结果:`);
    console.log(`  模型: ${result.model.name} (${result.modelId})`);
    console.log(`  类型: ${result.model.type}`);
    console.log(`  分数: ${result.selectionReason.compositeScore.toFixed(3)}`);
    console.log(`  成本: $${result.cost.total.toFixed(6)}`);
    if (result.cost.resourceCostFactor) {
      console.log(`  资源成本因子: ${result.cost.resourceCostFactor.toFixed(3)}`);
    }
    console.log(`  选择原因: ${result.selectionReason.primaryReason}`);
    console.log("");
  }

  // 测试负载评分
  console.log("--- 负载评分测试 ---");
  for (const modelId of ['local-small', 'local-medium', 'local-large', 'cloud-model']) {
    const loadScore = statusMonitor.getModelLoadScore(modelId);
    console.log(`${mockRegistry.getModel(modelId).name}: 负载评分 = ${loadScore.toFixed(3)}`);
  }

  console.log("\n=== 测试完成 ===");
}

// 运行测试
testCompleteSystem().catch(console.error);