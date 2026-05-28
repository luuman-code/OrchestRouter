/**
 * ConfigValidator - 配置验证器
 *
 * 实现配置验证规则，确保配置的完整性和有效性
 */

class ConfigValidator {
  /**
   * 验证选择规则
   */
  static validateSelectionRule(rule) {
    const errors = [];

    if (!rule.taskTypes || !Array.isArray(rule.taskTypes) || rule.taskTypes.length === 0) {
      errors.push('规则必须包含非空的 taskTypes 数组');
    }

    if (!rule.preferredModels || !Array.isArray(rule.preferredModels)) {
      errors.push('规则必须包含 preferredModels 数组');
    }

    if (rule.fallbackModels && !Array.isArray(rule.fallbackModels)) {
      errors.push('fallbackModels 必须是数组');
    }

    if (rule.weight !== undefined && (typeof rule.weight !== 'number' || rule.weight < 0 || rule.weight > 2)) {
      errors.push('weight 必须是 0-2 之间的数字');
    }

    if (rule.reason && typeof rule.reason !== 'string') {
      errors.push('reason 必须是字符串');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证模型配置
   */
  static validateModel(model) {
    const errors = [];

    if (!model.id || typeof model.id !== 'string') {
      errors.push('模型必须包含有效的 id');
    }

    if (!model.name || typeof model.name !== 'string') {
      errors.push('模型必须包含有效的 name');
    }

    if (!model.provider || typeof model.provider !== 'string') {
      errors.push('模型必须包含有效的 provider');
    }

    if (model.pricing) {
      if (typeof model.pricing !== 'object') {
        errors.push('pricing 必须是对象');
      } else {
        if (typeof model.pricing.input !== 'number' || model.pricing.input < 0) {
          errors.push('pricing.input 必须是非负数');
        }
        if (typeof model.pricing.output !== 'number' || model.pricing.output < 0) {
          errors.push('pricing.output 必须是非负数');
        }
      }
    }

    if (model.context_limit !== undefined && (typeof model.context_limit !== 'number' || model.context_limit <= 0)) {
      errors.push('context_limit 必须是正数');
    }

    if (model.quality_score !== undefined && (typeof model.quality_score !== 'number' || model.quality_score < 0 || model.quality_score > 10)) {
      errors.push('quality_score 必须是 0-10 之间的数字');
    }

    if (model.capabilities && !Array.isArray(model.capabilities)) {
      errors.push('capabilities 必须是数组');
    }

    if (model.strengths && !Array.isArray(model.strengths)) {
      errors.push('strengths 必须是数组');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证任务类型
   */
  static validateTaskType(taskType) {
    const predefinedTaskTypes = [
      'ui', 'style', 'logic', 'api', 'test', 'model', 'config', 'general',
      'reasoning', 'coding', 'chat', 'search', 'data-processing', 'analysis'
    ];

    // 检查是否是预定义类型或自定义类型（以字母开头，可包含字母、数字、连字符、下划线）
    const isValidFormat = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(taskType);

    return {
      isValid: predefinedTaskTypes.includes(taskType) || isValidFormat,
      isPredefined: predefinedTaskTypes.includes(taskType)
    };
  }

  /**
   * 验证整个配置
   */
  static validateConfig(config) {
    const errors = [];

    if (config.selector && config.selector.selectionRules && Array.isArray(config.selector.selectionRules)) {
      for (let i = 0; i < config.selector.selectionRules.length; i++) {
        const rule = config.selector.selectionRules[i];
        const ruleValidation = this.validateSelectionRule(rule);

        if (!ruleValidation.isValid) {
          errors.push(`规则[${i}]验证失败: ${ruleValidation.errors.join(', ')}`);
        }
      }
    }

    if (config.defaultModels && Array.isArray(config.defaultModels)) {
      for (let i = 0; i < config.defaultModels.length; i++) {
        const model = config.defaultModels[i];
        const modelValidation = this.validateModel(model);

        if (!modelValidation.isValid) {
          errors.push(`默认模型[${i}]验证失败: ${modelValidation.errors.join(', ')}`);
        }
      }
    }

    if (config.Providers && Array.isArray(config.Providers)) {
      for (let i = 0; i < config.Providers.length; i++) {
        const provider = config.Providers[i];

        if (provider.models && Array.isArray(provider.models)) {
          for (let j = 0; j < provider.models.length; j++) {
            const model = provider.models[j];
            const modelValidation = this.validateModel(model);

            if (!modelValidation.isValid) {
              errors.push(`提供商[${i}].模型[${j}]验证失败: ${modelValidation.errors.join(', ')}`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证模型ID唯一性
   */
  static validateModelIdsUniqueness(allModels) {
    const seenIds = new Set();
    const duplicateIds = [];

    for (const model of allModels) {
      if (seenIds.has(model.id)) {
        if (!duplicateIds.includes(model.id)) {
          duplicateIds.push(model.id);
        }
      } else {
        seenIds.add(model.id);
      }
    }

    return {
      isValid: duplicateIds.length === 0,
      duplicateIds
    };
  }

  /**
   * 验证首选/备选模型是否存在于模型注册中心
   */
  static validateModelReferences(rule, availableModels) {
    const errors = [];
    const availableModelIds = new Set(availableModels.map(m => m.id));

    if (rule.preferredModels) {
      for (const modelId of rule.preferredModels) {
        if (!availableModelIds.has(modelId)) {
          errors.push(`首选模型 "${modelId}" 不存在于模型注册中心`);
        }
      }
    }

    if (rule.fallbackModels) {
      for (const modelId of rule.fallbackModels) {
        if (!availableModelIds.has(modelId)) {
          errors.push(`备选模型 "${modelId}" 不存在于模型注册中心`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = ConfigValidator;