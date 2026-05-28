/**
 * 基于规则的引擎实现
 * 实现规则选择逻辑
 */
const IRuleEngine = require('../interfaces/IRuleEngine');

class RuleBasedEngine extends IRuleEngine {
  constructor(modelRegistry, configManager) {
    super();
    this.modelRegistry = modelRegistry;
    this.configManager = configManager;
  }

  selectBestModel(subtask) {
    const taskType = subtask.type || 'general';
    const rules = this.configManager.getRulesForTaskType(taskType);

    // 如果没有匹配的规则，使用通用规则
    if (rules.length === 0) {
      const generalRules = this.configManager.getRulesForTaskType('general');
      if (generalRules.length > 0) {
        return this.evaluateRule(generalRules[0], subtask);
      }
      // 如果连通用规则都没有，返回第一个可用模型
      const allModels = this.modelRegistry.getAvailableModels();
      if (allModels.length > 0) {
        const firstModel = allModels[0];
        return {
          modelId: firstModel.id,
          model: firstModel,
          cost: this.calculateCost(firstModel, subtask),
          reason: '使用第一个可用模型',
          score: 0.5
        };
      }
    }

    // 使用第一个匹配的规则
    return this.evaluateRule(rules[0], subtask);
  }

  evaluateRule(rule, subtask) {
    // 选择首选模型中的第一个可用模型
    for (const modelId of rule.preferredModels) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.status === 'available') {
        return {
          modelId: model.id,
          model: model,
          cost: this.calculateCost(model, subtask),
          reason: rule.reason,
          score: rule.weight || 1.0
        };
      }
    }

    // 如果首选模型都不可用，使用备选模型
    for (const modelId of rule.fallbackModels || []) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.status === 'available') {
        return {
          modelId: model.id,
          model: model,
          cost: this.calculateCost(model, subtask),
          reason: `${rule.reason} (降级使用)`,
          score: (rule.weight || 1.0) * 0.7
        };
      }
    }

    // 如果规则中没有可用模型，返回第一个可用模型
    const availableModels = this.modelRegistry.getAvailableModels();
    if (availableModels.length > 0) {
      const fallbackModel = availableModels[0];
      return {
        modelId: fallbackModel.id,
        model: fallbackModel,
        cost: this.calculateCost(fallbackModel, subtask),
        reason: '规则模型不可用，使用默认模型',
        score: 0.3
      };
    }

    // 没有任何可用模型
    return {
      modelId: null,
      model: null,
      cost: { input: Infinity, output: Infinity, total: Infinity },
      reason: '没有可用模型',
      score: 0
    };
  }

  calculateCost(model, subtask) {
    // 使用默认token估算
    const defaultTokenEstimate = { input: 500, output: 1200 };
    const inputCost = (defaultTokenEstimate.input / 1000) * model.pricing.input;
    const outputCost = (defaultTokenEstimate.output / 1000) * model.pricing.output;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
      isLocal: model.type === 'local'
    };
  }

  addRule(rule) {
    this.configManager.addRule(rule);
  }

  getAllRules() {
    return this.configManager.getAllRules();
  }
}

module.exports = RuleBasedEngine;