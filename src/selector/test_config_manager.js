/**
 * 验证策略配置传递测试
 */

const SelectionConfigManager = require('./config/SelectionConfigManager');

// 测试配置管理器是否正确处理学习集成配置
console.log("=== 配置管理器测试 ===\n");

// 创建默认配置管理器
const defaultManager = new SelectionConfigManager();
console.log("默认配置:");
console.log("- 融合策略:", defaultManager.getStrategyConfig().learning_integration.strategy);
console.log("- 规则权重:", defaultManager.getStrategyConfig().learning_integration.rule_weight);
console.log("- 学习权重:", defaultManager.getStrategyConfig().learning_integration.learning_weight);
console.log();

// 创建带自定义规则优先配置的管理器
const rulePriorityConfig = {
  strategy: {
    learning_integration: {
      strategy: 'rule_priority',
      rule_weight: 0.8,
      learning_weight: 0.2,
      min_learning_confidence: 0.9
    }
  }
};

const rulePriorityManager = new SelectionConfigManager(rulePriorityConfig);
console.log("规则优先配置:");
console.log("- 融合策略:", rulePriorityManager.getStrategyConfig().learning_integration.strategy);
console.log("- 规则权重:", rulePriorityManager.getStrategyConfig().learning_integration.rule_weight);
console.log("- 学习权重:", rulePriorityManager.getStrategyConfig().learning_integration.learning_weight);
console.log();

// 创建带自定义学习优先配置的管理器
const learningPriorityConfig = {
  strategy: {
    learning_integration: {
      strategy: 'learning_priority',
      rule_weight: 0.2,
      learning_weight: 0.8,
      min_learning_confidence: 0.6
    }
  }
};

const learningPriorityManager = new SelectionConfigManager(learningPriorityConfig);
console.log("学习优先配置:");
console.log("- 融合策略:", learningPriorityManager.getStrategyConfig().learning_integration.strategy);
console.log("- 规则权重:", learningPriorityManager.getStrategyConfig().learning_integration.rule_weight);
console.log("- 学习权重:", learningPriorityManager.getStrategyConfig().learning_integration.learning_weight);
console.log();

console.log("=== 配置管理器测试完成 ===");