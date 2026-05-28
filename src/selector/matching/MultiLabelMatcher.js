/**
 * MultiLabelMatcher - 多标签匹配引擎
 * 基于任务类型和模型能力进行精细化匹配
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

class MultiLabelMatcher {
  constructor(options = {}) {
    // 优先使用传入的配置对象（来自 config.json），其次从 yaml 文件加载
    if (options.config && (options.config.model_capabilities || options.config.type_to_capabilities)) {
      // 来自 config.json 的配置
      this.config = options.config;
      this.modelCapabilities = this.config.model_capabilities || this.config.modelCapabilities || {};
      this.typeToCapabilities = this.config.type_to_capabilities || this.config.typeToCapabilities || {};
      this.matching = this.config.matching || {};
      this.capabilityWeights = this.matching.capabilityWeights || {};
    } else {
      // 从 yaml 文件加载配置（向后兼容）
      this.config = this._loadConfig(options.configPath);
      this.modelCapabilities = this.config.modelCapabilities || {};
      this.typeToCapabilities = this.config.typeToCapabilities || {};
      this.matching = this.config.matching || {};
      this.capabilityWeights = this.matching.capabilityWeights || {};
    }
  }

  /**
   * 加载配置
   */
  _loadConfig(configPath) {
    const defaultPath = path.join(__dirname, '../../decomposer/config/default-config.yaml');

    let configFile = configPath || defaultPath;

    const possiblePaths = [
      configFile,
      path.join(__dirname, configFile),
      path.join(process.cwd(), configFile),
      path.join(process.cwd(), 'src/decomposer/config/default-config.yaml')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          return yaml.load(content);
        } catch (e) {
          console.warn(`Failed to load config from ${p}:`, e.message);
        }
      }
    }

    return this._getDefaultConfig();
  }

  /**
   * 获取默认配置
   */
  _getDefaultConfig() {
    return {
      modelCapabilities: {},
      typeToCapabilities: {},
      matching: {
        minConfidence: 0.3,
        combinationStrategy: 'weighted'
      }
    };
  }

  /**
   * 获取默认模型能力 - 根据模型名称推断能力
   * @param {string} modelId - 模型ID
   * @returns {Object} 能力对象
   */
  _getDefaultCapabilities(modelId) {
    const modelName = modelId.toLowerCase();

    // 根据模型名称关键词推断能力
    let capabilities = {
      code: 0.7,
      logic: 0.7,
      reasoning: 0.7,
      ui: 0.6,
      api: 0.6,
      test: 0.6,
      style: 0.5,
      security: 0.5,
      database: 0.5
    };

    // 根据模型类型调整
    if (modelName.includes('coder') || modelName.includes('code')) {
      capabilities.code = 0.9;
      capabilities.api = 0.8;
    }
    if (modelName.includes('reasoner') || modelName.includes('reason')) {
      capabilities.reasoning = 0.9;
      capabilities.logic = 0.8;
    }
    if (modelName.includes('chat')) {
      capabilities.code = 0.7;
      capabilities.logic = 0.7;
    }
    if (modelName.includes('mini') || modelName.includes('fast') || modelName.includes('speed')) {
      // 快速模型
      capabilities.code = Math.min(capabilities.code + 0.1, 0.9);
    }
    if (modelName.includes('her') || modelName.includes('vision')) {
      capabilities.ui = 0.8;
      capabilities.multi_modal = 0.8;
    }

    // 对于 MiniMax 系列
    if (modelName.includes('minimax')) {
      if (modelName.includes('2.7')) {
        capabilities.code = 0.85;
        capabilities.reasoning = 0.85;
      } else if (modelName.includes('2.5')) {
        capabilities.code = 0.8;
        capabilities.reasoning = 0.8;
      }
    }

    // 对于 DeepSeek 系列
    if (modelName.includes('deepseek')) {
      if (modelName.includes('reasoner')) {
        capabilities.reasoning = 0.9;
      } else {
        capabilities.code = 0.75;
      }
    }

    return capabilities;
  }

  /**
   * 计算任务与模型的匹配度
   * @param {Array} taskTypes - 任务类型数组 [{type, confidence}]
   * @param {string|Object} modelIdOrCapabilities - 模型ID或能力对象
   * @returns {Object} 匹配结果 {score, details}
   */
  calculateMatchScore(taskTypes, modelIdOrCapabilities) {
    // 获取模型能力
    let modelCapabilities;
    if (typeof modelIdOrCapabilities === 'string') {
      modelCapabilities = this.modelCapabilities[modelIdOrCapabilities];
      // 如果找不到精确匹配，使用默认能力映射
      if (!modelCapabilities) {
        modelCapabilities = this._getDefaultCapabilities(modelIdOrCapabilities);
      }
    } else {
      modelCapabilities = modelIdOrCapabilities;
    }

    if (!taskTypes || taskTypes.length === 0) {
      return { score: 0.5, details: { reason: 'No task types provided, using default' } };
    }

    // 计算每个类型的匹配分数
    const typeScores = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const taskType of taskTypes) {
      const typeName = taskType.type;
      const confidence = taskType.confidence || 1.0;

      // 获取该类型所需的能力
      const requiredCapabilities = this.typeToCapabilities[typeName];
      if (!requiredCapabilities) {
        continue;
      }

      // 计算与模型能力的匹配
      let typeScore = 0;
      let typeWeight = 0;

      for (const [cap, weight] of Object.entries(requiredCapabilities)) {
        const modelCap = modelCapabilities[cap] || 0;
        const capabilityWeight = this.capabilityWeights[cap] || 1.0;

        // 加权匹配
        typeScore += modelCap * weight * capabilityWeight;
        typeWeight += weight * capabilityWeight;
      }

      if (typeWeight > 0) {
        const normalizedScore = typeScore / typeWeight;
        typeScores.push({
          type: typeName,
          confidence,
          score: normalizedScore
        });

        // 加权总分数（考虑任务类型的置信度）
        totalScore += normalizedScore * confidence;
        totalWeight += confidence;
      }
    }

    // 计算最终分数
    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

    return {
      score: finalScore,
      details: {
        typeScores,
        taskTypes: taskTypes.length,
        strategy: this.matching.combinationStrategy
      }
    };
  }

  /**
   * 从多个模型中选择最佳模型
   * @param {Array} taskTypes - 任务类型数组
   * @param {Array} availableModels - 可用模型ID数组
   * @returns {Object} 最佳匹配结果 {model, score, details}
   */
  selectBestModel(taskTypes, availableModels) {
    if (!availableModels || availableModels.length === 0) {
      return { model: null, score: 0, details: { error: 'No available models' } };
    }

    if (availableModels.length === 1) {
      const match = this.calculateMatchScore(taskTypes, availableModels[0]);
      return {
        model: availableModels[0],
        score: match.score,
        details: match.details
      };
    }

    // 计算所有模型的匹配度
    const results = availableModels.map(modelId => {
      const match = this.calculateMatchScore(taskTypes, modelId);
      return {
        model: modelId,
        score: match.score,
        details: match.details
      };
    });

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results[0];
  }

  /**
   * 获取模型能力
   * @param {string} modelId - 模型ID
   */
  getModelCapabilities(modelId) {
    return this.modelCapabilities[modelId] || null;
  }

  /**
   * 获取所有模型
   */
  getAllModels() {
    return Object.keys(this.modelCapabilities);
  }

  /**
   * 获取类型所需能力
   * @param {string} type - 任务类型
   */
  getRequiredCapabilitiesForType(type) {
    return this.typeToCapabilities[type] || null;
  }

  /**
   * 验证能力对象是否有效
   * @param {Object} capabilities - 能力对象
   */
  validateCapabilities(capabilities) {
    if (!capabilities || typeof capabilities !== 'object') {
      return { valid: false, error: 'Capabilities must be an object' };
    }

    for (const [cap, value] of Object.entries(capabilities)) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        return { valid: false, error: `Invalid capability value for ${cap}: ${value}` };
      }
    }

    return { valid: true };
  }

  /**
   * 添加自定义模型能力
   * @param {string} modelId - 模型ID
   * @param {Object} capabilities - 能力对象
   */
  addModelCapabilities(modelId, capabilities) {
    const validation = this.validateCapabilities(capabilities);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    this.modelCapabilities[modelId] = capabilities;
  }

  /**
   * 获取匹配配置
   */
  getMatchingConfig() {
    return this.matching;
  }
}

module.exports = MultiLabelMatcher;
