/**
 * 本地模型资源成本因子测试脚本
 */

// 引入必要的模块
const ModelEvaluator = require('./core/ModelEvaluator');
const ModelRegistry = require('./registry/ModelRegistry');
const ConfigManager = require('./config/SelectionConfigManager');

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
      'local-model-1': {
        id: 'local-model-1',
        name: 'Local Model 1',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 }, // 本地模型成本为0
        maxConcurrency: 2,
        responseTime: 2000,
        hardwareSpecs: {
          gpu: { memoryGB: 8 },
          cpu: { cores: 4 }
        },
        size: 7, // 7B模型
        qualityScore: 0.8
      },
      'local-model-large': {
        id: 'local-model-large',
        name: 'Local Large Model',
        provider: 'local',
        type: 'local',
        pricing: { input: 0, output: 0 }, // 本地模型成本为0
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

// 创建模拟状态监控器
class MockStatusMonitor {
  getModelLoadScore(modelId) {
    // 返回一个简单的负载分数
    if (modelId.includes('local')) {
      return 0.3; // 本地模型有一些负载
    }
    return 0.1; // 云端模型负载较低
  }

  hasAvailableConcurrency(modelId) {
    return true;
  }
}

async function testResourceCostCalculation() {
  console.log("=== 本地模型资源成本因子测试 ===\n");

  const mockRegistry = new MockModelRegistry();
  const mockConfig = new MockConfigManager();
  const mockMonitor = new MockStatusMonitor();

  const evaluator = new ModelEvaluator(mockRegistry, mockConfig, mockMonitor);

  // 测试用的子任务
  const testSubtask = {
    type: 'logic',
    description: '这是一个复杂的逻辑任务，需要处理大量数据',
    confidence: 0.9,
    expectedSize: 300, // 预计代码量
    dependencies: ['react', 'lodash'],
    technologies: ['algorithm']
  };

  // 估算token
  const tokenEstimate = evaluator.estimateTokens(testSubtask);
  console.log(`Token估算: 输入=${tokenEstimate.input}, 输出=${tokenEstimate.output}`);

  console.log("\n--- 测试资源成本因子计算 ---");

  // 测试小型本地模型
  const smallLocalModel = mockRegistry.getModel('local-model-1');
  const smallResourceFactor = evaluator.calculateResourceCostFactor(smallLocalModel, tokenEstimate);
  console.log(`小型本地模型 (${smallLocalModel.name}) 资源成本因子: ${smallResourceFactor.toFixed(3)}`);
  console.log(`- GPU内存因子: ${evaluator.calculateGpuMemoryFactor(smallLocalModel, tokenEstimate).toFixed(3)}`);
  console.log(`- CPU因子: ${evaluator.calculateCpuFactor(smallLocalModel, tokenEstimate).toFixed(3)}`);
  console.log(`- 模型大小因子: ${evaluator.calculateModelSizeFactor(smallLocalModel, tokenEstimate).toFixed(3)}`);

  // 测试大型本地模型
  const largeLocalModel = mockRegistry.getModel('local-model-large');
  const largeResourceFactor = evaluator.calculateResourceCostFactor(largeLocalModel, tokenEstimate);
  console.log(`\n大型本地模型 (${largeLocalModel.name}) 资源成本因子: ${largeResourceFactor.toFixed(3)}`);
  console.log(`- GPU内存因子: ${evaluator.calculateGpuMemoryFactor(largeLocalModel, tokenEstimate).toFixed(3)}`);
  console.log(`- CPU因子: ${evaluator.calculateCpuFactor(largeLocalModel, tokenEstimate).toFixed(3)}`);
  console.log(`- 模型大小因子: ${evaluator.calculateModelSizeFactor(largeLocalModel, tokenEstimate).toFixed(3)}`);

  console.log("\n--- 测试成本计算 ---");

  // 使用传统方法计算成本
  const basicCostSmall = evaluator.calculateCost(smallLocalModel, tokenEstimate);
  console.log(`小型本地模型基本成本: 输入=$${basicCostSmall.input.toFixed(6)}, 输出=$${basicCostSmall.output.toFixed(6)}, 总计=$${basicCostSmall.total.toFixed(6)}`);

  const basicCostLarge = evaluator.calculateCost(largeLocalModel, tokenEstimate);
  console.log(`大型本地模型基本成本: 输入=$${basicCostLarge.input.toFixed(6)}, 输出=$${basicCostLarge.output.toFixed(6)}, 总计=$${basicCostLarge.total.toFixed(6)}`);

  // 使用资源感知方法计算成本
  const resourceAwareCostSmall = evaluator.calculateCostWithResourceFactor(smallLocalModel, tokenEstimate);
  console.log(`\n小型本地模型资源感知成本: 输入=$${resourceAwareCostSmall.input.toFixed(6)}, 输出=$${resourceAwareCostSmall.output.toFixed(6)}, 总计=$${resourceAwareCostSmall.total.toFixed(6)}, 有效总计=$${resourceAwareCostSmall.effectiveTotal.toFixed(6)}`);
  console.log(`资源成本因子: ${resourceAwareCostSmall.resourceCostFactor.toFixed(3)}`);

  const resourceAwareCostLarge = evaluator.calculateCostWithResourceFactor(largeLocalModel, tokenEstimate);
  console.log(`大型本地模型资源感知成本: 输入=$${resourceAwareCostLarge.input.toFixed(6)}, 输出=$${resourceAwareCostLarge.output.toFixed(6)}, 总计=$${resourceAwareCostLarge.total.toFixed(6)}, 有效总计=$${resourceAwareCostLarge.effectiveTotal.toFixed(6)}`);
  console.log(`资源成本因子: ${resourceAwareCostLarge.resourceCostFactor.toFixed(3)}`);

  console.log("\n--- 模型选择测试 ---");

  // 使用改进的选择方法
  const result = evaluator.selectBestModel(testSubtask);
  console.log(`选择的模型: ${result.modelId}`);
  console.log(`模型名称: ${result.model.name}`);
  console.log(`成本详情:`, JSON.stringify(result.cost, null, 2));
  console.log(`选择原因:`, result.reason);

  if (result.selectionReason && result.selectionReason.factors.resourceCost) {
    console.log(`资源成本详情: 因子=${result.selectionReason.factors.resourceCost.factor.toFixed(3)}`);
  }

  console.log("\n=== 测试完成 ===");
}

// 运行测试
testResourceCostCalculation().catch(console.error);