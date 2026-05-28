/**
 * 优化版ModelSelector测试
 */
const ModelSelector = require('./optimized/ModelSelector');

async function testOptimizedModelSelector() {
  console.log("=== 优化版ModelSelector测试 ===\n");

  // 创建选择器实例
  const config = {
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'hybrid',  // 测试混合策略
        rule_weight: 0.6,
        learning_weight: 0.4,
        min_learning_confidence: 0.7
      }
    }
  };

  const selector = new ModelSelector(config);
  console.log("✓ 优化版选择器创建成功\n");

  // 测试基本模型选择
  console.log("1. 测试基本模型选择:");
  const testTask = {
    type: 'general',
    description: '这是一个通用任务，用于测试模型选择功能',
    id: 'test-task-optimized'
  };

  const result = selector.select(testTask);
  console.log(`   选择模型: ${result.selected_model}`);
  console.log(`   选择原因: ${result.reason}`);
  console.log(`   预估成本: $${result.estimated_cost.toFixed(6)}\n`);

  // 测试规则优先策略
  console.log("2. 测试规则优先策略:");
  const rulePriorityConfig = {
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'rule_priority',
        rule_weight: 0.8,
        learning_weight: 0.2,
        min_learning_confidence: 0.9
      }
    }
  };

  const rulePrioritySelector = new ModelSelector(rulePriorityConfig);
  const rulePriorityResult = rulePrioritySelector.select(testTask);
  console.log(`   选择模型: ${rulePriorityResult.selected_model}`);
  console.log(`   选择原因: ${rulePriorityResult.reason}\n`);

  // 测试学习优先策略
  console.log("3. 测试学习优先策略:");
  const learningPriorityConfig = {
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'learning_priority',
        rule_weight: 0.2,
        learning_weight: 0.8,
        min_learning_confidence: 0.6
      }
    }
  };

  const learningPrioritySelector = new ModelSelector(learningPriorityConfig);
  const learningPriorityResult = learningPrioritySelector.select(testTask);
  console.log(`   选择模型: ${learningPriorityResult.selected_model}`);
  console.log(`   选择原因: ${learningPriorityResult.reason}\n`);

  // 测试反馈记录功能
  console.log("4. 测试反馈记录功能:");
  selector.recordFeedback('test-feedback-1', 'gpt-4o-mini', 8.5, {
    subtask: { type: 'general' },
    quality: 'good',
    context: 'general-purpose-task'
  });
  console.log("   ✓ 反馈记录成功\n");

  // 获取学习报告
  console.log("5. 获取学习报告:");
  const learningReport = selector.getLearningReport();
  if (learningReport) {
    console.log(`   总反馈数: ${learningReport.totalFeedback}`);
    console.log(`   模型类型数: ${learningReport.totalModelTypes}`);
  } else {
    console.log("   学习功能未启用");
  }

  console.log("\n=== 优化版ModelSelector测试完成 ===");
}

// 运行测试
testOptimizedModelSelector().catch(console.error);