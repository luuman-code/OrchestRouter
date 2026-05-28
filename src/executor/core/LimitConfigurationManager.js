/**
 * LimitConfigurationManager - 限流配置管理器
 * 区分用户请求和健康检查的限流配置
 *
 * 【新增 2026-03-28】
 * - 为健康检查提供更保守的限流配置
 * - 避免健康检查抢占用户请求的速率配额
 *
 * 【配置系统集成】
 * - 支持从模型注册表获取配置
 * - 支持从 ExecutorConfig 获取配置
 */
class LimitConfigurationManager {
  /**
   * 创建限流配置管理器
   * @param {Object} options - 选项
   * @param {Object} options.modelRegistry - 模型注册表（可选）
   * @param {Object} options.config - ExecutorConfig 实例（可选）
   */
  constructor(options = {}) {
    this.modelLimits = new Map();
    this.modelRegistry = options.modelRegistry || null;
    this.config = options.config || null;
  }

  /**
   * 设置模型注册表
   * @param {Object} modelRegistry - 模型注册表
   */
  setModelRegistry(modelRegistry) {
    this.modelRegistry = modelRegistry;
  }

  /**
   * 设置配置对象
   * @param {ExecutorConfig} config - 配置对象
   */
  setConfig(config) {
    this.config = config;
  }

  /**
   * 获取用户请求的限流配置
   * @param {string} modelId - 模型 ID
   * @returns {Object} 限流配置
   */
  getLimitsForModel(modelId) {
    // 1. 优先使用自定义配置
    if (this.modelLimits.has(modelId)) {
      return this.modelLimits.get(modelId).userLimits;
    }

    // 2. 如果有关联的配置对象，从配置对象获取
    if (this.config) {
      const modelConfig = this.config.getModelConfig(modelId);
      if (modelConfig && modelConfig.rateLimit) {
        return {
          requestsPerSecond: modelConfig.rateLimit.requestsPerSecond,
          burstCapacity: modelConfig.rateLimit.burstCapacity
        };
      }

      // 从全局配置获取
      const rateLimitConfig = this.config.getRateLimitConfig();
      if (rateLimitConfig && rateLimitConfig.per_model && rateLimitConfig.per_model[modelId]) {
        const modelSpecific = rateLimitConfig.per_model[modelId];
        return {
          requestsPerSecond: modelSpecific.requests_per_second || modelSpecific.requestsPerMinute / 60 || 10,
          burstCapacity: modelSpecific.burst || modelSpecific.burstCapacity || 20
        };
      }
    }

    // 3. 如果有模型注册表，从注册表获取
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.rateLimit) {
        return {
          requestsPerSecond: model.rateLimit.requestsPerSecond || 10,
          burstCapacity: model.rateLimit.burstCapacity || 20
        };
      }
    }

    // 4. 返回默认配置
    return this.getDefaultUserLimits(modelId);
  }

  /**
   * 获取健康检查的限流配置（更保守）
   * @param {string} modelId - 模型 ID
   * @returns {Object} 限流配置
   */
  getHealthCheckLimitsForModel(modelId) {
    // 1. 优先使用自定义配置
    if (this.modelLimits.has(modelId)) {
      return this.modelLimits.get(modelId).healthLimits;
    }

    // 2. 如果有配置对象，基于用户配置计算健康检查配置
    if (this.config) {
      const userLimits = this.getLimitsForModel(modelId);
      const rateLimitConfig = this.config.getRateLimitConfig();
      const healthCheckFactor = rateLimitConfig?.healthCheckFactor || 0.1;
      return {
        requestsPerSecond: Math.max(1, Math.floor(userLimits.requestsPerSecond * healthCheckFactor)),
        burstCapacity: Math.max(1, Math.floor(userLimits.burstCapacity * healthCheckFactor))
      };
    }

    // 3. 返回默认健康检查配置
    return this.getDefaultHealthCheckLimits(modelId);
  }

  /**
   * 设置自定义限流配置
   */
  setModelLimits(modelId, userLimits, healthLimits) {
    this.modelLimits.set(modelId, { userLimits, healthLimits });
  }

  getDefaultUserLimits(modelId) {
    // 根据模型类型返回默认用户请求限流
    // 【改进】(2026-04-02): 优先从 ModelRegistry 获取提供商信息
    const provider = this.getProvider(modelId);
    const defaultUserLimits = {
      'openai': { requestsPerSecond: 10, burstCapacity: 20 },
      'anthropic': { requestsPerSecond: 8, burstCapacity: 15 },
      'gemini': { requestsPerSecond: 5, burstCapacity: 10 },
      'ollama': { requestsPerSecond: 20, burstCapacity: 40 },
      'deepseek': { requestsPerSecond: 10, burstCapacity: 20 },
      'aliyun': { requestsPerSecond: 10, burstCapacity: 20 },
      'minimax': { requestsPerSecond: 10, burstCapacity: 20 },
      'moonshot': { requestsPerSecond: 10, burstCapacity: 20 },
      'zhipu': { requestsPerSecond: 10, burstCapacity: 20 },
      'bailian': { requestsPerSecond: 10, burstCapacity: 20 }
    };

    return defaultUserLimits[provider] || { requestsPerSecond: 10, burstCapacity: 20 };
  }

  getDefaultHealthCheckLimits(modelId) {
    // 健康检查使用更保守的限制（不影响正常服务）
    // 【改进】(2026-04-02): 优先从 ModelRegistry 获取提供商信息
    const provider = this.getProvider(modelId);
    const defaultHealthLimits = {
      'openai': { requestsPerSecond: 1, burstCapacity: 2 },
      'anthropic': { requestsPerSecond: 1, burstCapacity: 2 },
      'gemini': { requestsPerSecond: 1, burstCapacity: 2 },
      'ollama': { requestsPerSecond: 2, burstCapacity: 5 },
      'deepseek': { requestsPerSecond: 1, burstCapacity: 2 },
      'aliyun': { requestsPerSecond: 1, burstCapacity: 2 },
      'minimax': { requestsPerSecond: 1, burstCapacity: 2 },
      'moonshot': { requestsPerSecond: 1, burstCapacity: 2 },
      'zhipu': { requestsPerSecond: 1, burstCapacity: 2 },
      'bailian': { requestsPerSecond: 1, burstCapacity: 2 }
    };

    return defaultHealthLimits[provider] || { requestsPerSecond: 1, burstCapacity: 2 };
  }

  /**
   * 获取提供商信息（优先从 ModelRegistry 获取）
   * @param {string} modelId - 模型 ID
   * @returns {string} 提供商名称
   */
  getProvider(modelId) {
    // 优先从 ModelRegistry 获取
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.provider) {
        return model.provider;
      }
    }

    // 回退到关键字匹配
    if (modelId.includes('gpt')) return 'openai';
    if (modelId.includes('claude')) return 'anthropic';
    if (modelId.includes('gemini')) return 'gemini';
    if (modelId.includes('ollama')) return 'ollama';
    if (modelId.includes('deepseek')) return 'deepseek';
    if (modelId.includes('qwen')) return 'aliyun';
    if (modelId.includes('minimax')) return 'minimax';
    if (modelId.includes('kimi') || modelId.includes('moonshot')) return 'moonshot';
    if (modelId.includes('glm') || modelId.includes('zhipu')) return 'zhipu';
    if (modelId.includes('bailian')) return 'bailian';
    return 'openai';
  }
}

module.exports = { LimitConfigurationManager };