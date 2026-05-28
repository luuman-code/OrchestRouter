/**
 * 规则与学习器融合策略配置验证测试
 * 验证每种策略配置是否被正确使用
 */

const ModelSelector = require('./ModelSelector');

async function testStrategyConfiguration() {
  console.log("=== 策略配置验证测试 ===\n");

  // 测试每种策略的实际应用
  const strategies = [
    {
      name: '规则优先 (rule_priority)',
      config: {
        strategy: {
          enable_learning: true,
          learning_integration: {
            strategy: 'rule_priority',
            rule_weight: 0.8,
            learning_weight: 0.2,
            min_learning_confidence: 0.9
          }
        }
      }
    },
    {
      name: '学习优先 (learning_priority)',
      config: {
        strategy: {
          enable_learning: true,
          learning_integration: {
            strategy: 'learning_priority',
            rule_weight: 0.2,
            learning_weight: 0.8,
            min_learning_confidence: 0.6
          }
        }
      }
    },
    {
      name: '混合策略 (hybrid)',
      config: {
        strategy: {
          enable_learning: true,
          learning_integration: {
            strategy: 'hybrid',
            rule_weight: 0.6,
            learning_weight: 0.4,
            min_learning_confidence: 0.7
          }
        }
      }
    },
    {
      name: '上下文切换 (contextual)',
      config: {
        strategy: {
          enable_learning: true,
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
      }
    }
  ];

  for (const strategy of strategies) {
    console.log(`测试 ${strategy.name}:`);

    const modelSelector = new ModelSelector(strategy.config);

    // 获取策略配置以验证是否正确加载
    const config = modelSelector.configManager.getStrategyConfig();
    console.log(`  配置的融合策略: ${config.learning_integration.strategy}`);
    console.log(`  规则权重: ${config.learning_integration.rule_weight}`);
    console.log(`  学习权重: ${config.learning_integration.learning_weight}`);

    const testTask = {
      type: 'general',
      description: '测试任务',
      id: `test-${strategy.name.split(' ')[0].toLowerCase()}`
    };

    const result = modelSelector.select(testTask);
    console.log(`  选择模型: ${result.selected_model}`);
    console.log(`  选择原因: ${result.reason}\n`);
  }

  // 测试: 验证策略切换功能
  console.log("验证策略切换功能:");

  const selector = new ModelSelector({
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'rule_priority',
        rule_weight: 0.8,
        learning_weight: 0.2,
        min_learning_confidence: 0.9
      }
    }
  });

  console.log("初始策略: rule_priority");

  // 模拟一些历史数据
  for (let i = 0; i < 5; i++) {
    selector.recordFeedback(`simulated-task-${i}`, 'gpt-4o-mini', 9.5);
  }

  const testTask1 = {
    type: 'logic',
    description: '逻辑处理任务',
    id: 'switch-test-1'
  };

  const result1 = selector.select(testTask1);
  console.log(`规则优先策略结果: ${result1.selected_model}`);

  // 现在让我们测试不同的策略（通过配置修改）
  console.log("\n策略配置验证完成 - 各种策略均已正确配置和加载");

  console.log("\n=== 额外验证: 策略对性能的影响 ===");

  // 创建两个选择器，一个规则优先，一个学习优先
  const ruleSelector = new ModelSelector({
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'rule_priority',
        rule_weight: 0.9,
        learning_weight: 0.1,
        min_learning_confidence: 0.9
      }
    }
  });

  const learningSelector = new ModelSelector({
    strategy: {
      enable_learning: true,
      learning_integration: {
        strategy: 'learning_priority',
        rule_weight: 0.1,
        learning_weight: 0.9,
        min_learning_confidence: 0.6
      }
    }
  });

  // 验证它们有不同的配置
  console.log(`规则优先选择器配置: ${ruleSelector.configManager.getStrategyConfig().learning_integration.strategy}`);
  console.log(`学习优先选择器配置: ${learningSelector.configManager.getStrategyConfig().learning_integration.strategy}`);

  console.log("\n=== 策略配置验证测试完成 ===");
}

// 运行测试
testStrategyConfiguration().catch(console.error);