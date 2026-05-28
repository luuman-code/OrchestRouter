/**
 * 规则与学习器融合策略测试
 * 验证不同融合策略下的模型选择行为
 */

const ModelSelector = require('./ModelSelector');
const ModelRegistry = require('./registry/ModelRegistry');
const SelectionConfigManager = require('./config/SelectionConfigManager');

async function testRuleLearningIntegration() {
  console.log("=== 规则与学习器融合策略测试 ===\n");

  // 测试1: 验证混合策略
  console.log("1. 测试混合策略 (hybrid)：");

  const hybridConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'hybrid',
        rule_weight: 0.6,
        learning_weight: 0.4,
        min_learning_confidence: 0.7
      }
    }
  };

  const modelSelectorHybrid = new ModelSelector(hybridConfig);
  const subtask1 = {
    type: 'general',
    description: '这是一个常规的编程任务',
    id: 'test-task-1'
  };

  const result1 = modelSelectorHybrid.select(subtask1);
  console.log(`   选择结果: ${result1.selected_model}`);
  console.log(`   原因: ${result1.reason}`);
  console.log(`   成本: $${result1.estimated_cost.toFixed(6)}\n`);

  // 测试2: 验证规则优先策略
  console.log("2. 测试规则优先策略 (rule_priority)：");

  const rulePriorityConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'rule_priority',
        rule_weight: 0.8,
        learning_weight: 0.2,
        min_learning_confidence: 0.7
      }
    }
  };

  const modelSelectorRulePriority = new ModelSelector(rulePriorityConfig);
  const subtask2 = {
    type: 'logic',
    description: '实现一个复杂的逻辑函数',
    id: 'test-task-2'
  };

  const result2 = modelSelectorRulePriority.select(subtask2);
  console.log(`   选择结果: ${result2.selected_model}`);
  console.log(`   原因: ${result2.reason}`);
  console.log(`   成本: $${result2.estimated_cost.toFixed(6)}\n`);

  // 测试3: 验证学习优先策略
  console.log("3. 测试学习优先策略 (learning_priority)：");

  const learningPriorityConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'learning_priority',
        rule_weight: 0.3,
        learning_weight: 0.7,
        min_learning_confidence: 0.7
      }
    }
  };

  const modelSelectorLearningPriority = new ModelSelector(learningPriorityConfig);
  const subtask3 = {
    type: 'api',
    description: '创建REST API端点',
    id: 'test-task-3'
  };

  const result3 = modelSelectorLearningPriority.select(subtask3);
  console.log(`   选择结果: ${result3.selected_model}`);
  console.log(`   原因: ${result3.reason}`);
  console.log(`   成本: $${result3.estimated_cost.toFixed(6)}\n`);

  // 测试4: 验证上下文切换策略
  console.log("4. 测试上下文切换策略 (contextual)：");

  const contextualConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'contextual',
        rule_weight: 0.5,
        learning_weight: 0.5,
        min_learning_confidence: 0.7,
        contextual_switching: {
          enabled: true,
          conditions: {
            high_uncertainty_tasks: true,
            security_critical: true,
            repetitive_tasks: true,
            performance_sensitive: true
          }
        }
      }
    }
  };

  const modelSelectorContextual = new ModelSelector(contextualConfig);

  // 测试安全相关的任务
  const securitySubtask = {
    type: 'general',
    description: '实现用户认证和加密安全相关功能',
    id: 'security-task'
  };

  const securityResult = modelSelectorContextual.select(securitySubtask);
  console.log(`   安全任务选择结果: ${securityResult.selected_model}`);
  console.log(`   原因: ${securityResult.reason}`);
  console.log(`   成本: $${securityResult.estimated_cost.toFixed(6)}\n`);

  // 测试重复性任务
  const repetitiveSubtask = {
    type: 'general',
    description: '例行维护和重复性更新任务',
    id: 'repetitive-task'
  };

  const repetitiveResult = modelSelectorContextual.select(repetitiveSubtask);
  console.log(`   重复任务选择结果: ${repetitiveResult.selected_model}`);
  console.log(`   原因: ${repetitiveResult.reason}`);
  console.log(`   成本: $${repetitiveResult.estimated_cost.toFixed(6)}\n`);

  // 测试5: 模拟反馈学习过程
  console.log("5. 测试学习反馈记录：");

  // 模拟几个任务的执行结果
  const mockResults = [
    { taskId: 'task-1', modelId: result1.selected_model, qualityScore: 8.5 },
    { taskId: 'task-2', modelId: result2.selected_model, qualityScore: 7.8 },
    { taskId: 'task-3', modelId: result3.selected_model, qualityScore: 9.2 }
  ];

  for (const result of mockResults) {
    modelSelectorHybrid.recordFeedback(result.taskId, result.modelId, result.qualityScore);
    console.log(`   记录反馈: 任务 ${result.taskId}, 模型 ${result.modelId}, 评分 ${result.qualityScore}`);
  }

  console.log("\n6. 获取学习报告：");
  const report = modelSelectorHybrid.getLearningReport();
  if (report) {
    console.log(`   总反馈数: ${report.totalFeedback}`);
    console.log(`   模型类型数: ${report.totalModelTypes}`);
    if (report.performanceSummary.length > 0) {
      console.log(`   最佳性能模型示例: ${report.performanceSummary[0].modelId} (评分: ${report.performanceSummary[0].adjustedAvgScore.toFixed(2)})`);
    }
  }

  console.log("\n=== 规则与学习器融合测试完成 ===");
}

// 运行测试
testRuleLearningIntegration().catch(console.error);