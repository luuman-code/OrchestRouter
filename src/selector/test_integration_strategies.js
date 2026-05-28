/**
 * 规则与学习器集成策略测试
 * 专门测试不同集成策略下的行为差异
 */

const ModelSelector = require('./ModelSelector');

async function testIntegrationStrategies() {
  console.log("=== 规则与学习器集成策略测试 ===\n");

  // 模拟历史反馈数据来展示学习器的效果
  const simulateHistoricalData = (modelSelector, modelPreferences) => {
    // 模拟历史任务反馈
    for (let i = 0; i < 10; i++) {
      const pref = modelPreferences[i % modelPreferences.length];
      modelSelector.recordFeedback(
        `historical-task-${i}`,
        pref.modelId,
        pref.score,
        { subtask: { type: pref.taskType } }
      );
    }

    console.log(`   模拟了 ${modelPreferences.length * 10} 条历史反馈数据`);
  };

  // 测试1: 规则优先策略
  console.log("1. 测试规则优先策略 (rule_priority)：");

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
        min_learning_confidence: 0.9
      }
    }
  };

  const modelSelectorRulePriority = new ModelSelector(rulePriorityConfig);

  // 模拟一些历史数据，偏向使用claude-opus-4-6
  simulateHistoricalData(modelSelectorRulePriority, [
    { taskType: 'logic', modelId: 'claude-opus-4-6', score: 9.0 },
    { taskType: 'logic', modelId: 'claude-sonnet-4-6', score: 8.5 },
    { taskType: 'api', modelId: 'claude-sonnet-4-6', score: 8.7 }
  ]);

  const logicTask = {
    type: 'logic',
    description: '实现复杂的业务逻辑算法',
    id: 'logic-task-rule-priority'
  };

  const result1 = modelSelectorRulePriority.select(logicTask);
  console.log(`   逻辑任务选择: ${result1.selected_model} (规则优先)`);
  console.log(`   原因: ${result1.reason}\n`);

  // 测试2: 学习优先策略
  console.log("2. 测试学习优先策略 (learning_priority)：");

  const learningPriorityConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'learning_priority',
        rule_weight: 0.2,
        learning_weight: 0.8,
        min_learning_confidence: 0.6
      }
    }
  };

  const modelSelectorLearningPriority = new ModelSelector(learningPriorityConfig);

  // 模拟历史数据，明显偏好某个模型
  simulateHistoricalData(modelSelectorLearningPriority, [
    { taskType: 'general', modelId: 'gpt-4o-mini', score: 9.5 },
    { taskType: 'general', modelId: 'gpt-4o-mini', score: 9.3 },
    { taskType: 'general', modelId: 'gpt-4o-mini', score: 9.7 }
  ]);

  const generalTask = {
    type: 'general',
    description: '这是一个普通任务，根据学习历史应选择gpt-4o-mini',
    id: 'general-task-learning-priority'
  };

  const result2 = modelSelectorLearningPriority.select(generalTask);
  console.log(`   通用任务选择: ${result2.selected_model} (学习优先)`);
  console.log(`   原因: ${result2.reason}\n`);

  // 测试3: 混合策略
  console.log("3. 测试混合策略 (hybrid)：");

  const hybridConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'hybrid',
        rule_weight: 0.5,
        learning_weight: 0.5,
        min_learning_confidence: 0.7
      }
    }
  };

  const modelSelectorHybrid = new ModelSelector(hybridConfig);

  // 模拟均衡的历史数据
  simulateHistoricalData(modelSelectorHybrid, [
    { taskType: 'ui', modelId: 'gemini-2.0-flash', score: 9.2 },
    { taskType: 'ui', modelId: 'claude-opus-4-6', score: 8.8 },
    { taskType: 'ui', modelId: 'gpt-4o-mini', score: 8.5 }
  ]);

  const uiTask = {
    type: 'ui',
    description: '设计用户界面组件',
    id: 'ui-task-hybrid'
  };

  const result3 = modelSelectorHybrid.select(uiTask);
  console.log(`   UI任务选择: ${result3.selected_model} (混合策略)`);
  console.log(`   原因: ${result3.reason}\n`);

  // 测试4: 上下文切换策略
  console.log("4. 测试上下文切换策略 (contextual)：");

  const contextualConfig = {
    strategy: {
      quality_first: false,
      enable_learning: true,
      learning_window: 100,
      confidence_threshold: 0.8,
      learning_integration: {
        strategy: 'contextual',
        rule_weight: 0.6,
        learning_weight: 0.4,
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

  // 测试安全相关任务（应优先使用规则）
  const securityTask = {
    type: 'general',
    description: '实现用户身份验证和安全加密功能，这是安全关键任务',
    id: 'security-task-contextual'
  };

  const result4 = modelSelectorContextual.select(securityTask);
  console.log(`   安全任务选择: ${result4.selected_model} (上下文策略 - 安全优先规则)`);
  console.log(`   原因: ${result4.reason}\n`);

  // 测试常规任务（可以使用学习推荐）
  const routineTask = {
    type: 'general',
    description: '执行例行维护和数据更新任务，这是重复性任务',
    id: 'routine-task-contextual'
  };

  const result5 = modelSelectorContextual.select(routineTask);
  console.log(`   常规任务选择: ${result5.selected_model} (上下文策略 - 可能使用学习)`);
  console.log(`   原因: ${result5.reason}\n`);

  // 测试5: 验证不同策略下的决策过程
  console.log("5. 对比不同策略的决策过程：");

  const testTask = {
    type: 'test',
    description: '单元测试编写任务',
    id: 'comparison-task'
  };

  const configs = [
    { name: '规则优先', config: { strategy: { learning_integration: { strategy: 'rule_priority', rule_weight: 0.7, learning_weight: 0.3 } } } },
    { name: '学习优先', config: { strategy: { learning_integration: { strategy: 'learning_priority', rule_weight: 0.3, learning_weight: 0.7 } } } },
    { name: '混合策略', config: { strategy: { learning_integration: { strategy: 'hybrid', rule_weight: 0.5, learning_weight: 0.5 } } } }
  ];

  for (const cfg of configs) {
    const selector = new ModelSelector(cfg.config);
    const result = selector.select(testTask);
    console.log(`   ${cfg.name}: ${result.selected_model} - ${result.reason}`);
  }

  console.log("\n=== 集成策略测试完成 ===");
}

// 运行测试
testIntegrationStrategies().catch(console.error);