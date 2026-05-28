/**
 * TokenUsageParser - Token 使用解析器
 *
 * 将不同提供商的 API 响应统一转换为 TokenUsage 对象
 *
 * 【架构设计】
 * - 基于响应格式（response_format）选择解析策略，而非基于 provider
 * - 支持三种基础解析策略：OpenAI 格式、Anthropic 格式、Ollama 格式
 * - 支持自定义解析策略，可通过配置文件加载
 * - 支持从配置中获取模型的响应格式配置
 *
 * 【解析策略】
 * - openai:    usage.prompt_tokens / usage.completion_tokens
 * - anthropic: usage.input_tokens / usage.output_tokens
 * - ollama:    prompt_eval_count / eval_count
 * - gemini:    usageMetadata.promptTokenCount / usageMetadata.candidatesTokenCount
 *
 * @class TokenUsageParser
 */
class TokenUsageParser {
  /**
   * 内置解析策略定义
   * 每个策略定义了如何从响应中提取 input/output/total token
   */
  static BUILT_IN_STRATEGIES = {
    /**
     * OpenAI 格式
     * 字段：usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
     */
    openai: {
      name: 'openai',
      inputField: 'usage.prompt_tokens',
      outputField: 'usage.completion_tokens',
      totalField: 'usage.total_tokens',
      parse: (response, strategy) => {
        const getNestedValue = (obj, path) => {
          return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
        };
        return {
          input: getNestedValue(response, strategy.inputField),
          output: getNestedValue(response, strategy.outputField),
          total: getNestedValue(response, strategy.totalField) ||
                 (getNestedValue(response, strategy.inputField) + getNestedValue(response, strategy.outputField))
        };
      }
    },

    /**
     * Anthropic 格式
     * 字段：usage.input_tokens, usage.output_tokens, usage.total_tokens
     */
    anthropic: {
      name: 'anthropic',
      inputField: 'usage.input_tokens',
      outputField: 'usage.output_tokens',
      totalField: 'usage.total_tokens',
      parse: (response, strategy) => {
        const getNestedValue = (obj, path) => {
          return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
        };
        return {
          input: getNestedValue(response, strategy.inputField),
          output: getNestedValue(response, strategy.outputField),
          total: getNestedValue(response, strategy.totalField) ||
                 (getNestedValue(response, strategy.inputField) + getNestedValue(response, strategy.outputField))
        };
      }
    },

    /**
     * Ollama 格式
     * 字段：prompt_eval_count, eval_count（无 total）
     */
    ollama: {
      name: 'ollama',
      inputField: 'prompt_eval_count',
      outputField: 'eval_count',
      totalField: null,
      parse: (response, strategy) => {
        const getNestedValue = (obj, path) => {
          return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
        };
        const input = getNestedValue(response, strategy.inputField);
        const output = getNestedValue(response, strategy.outputField);
        return {
          input,
          output,
          total: input + output
        };
      }
    },

    /**
     * Gemini 格式
     * 字段：usageMetadata.promptTokenCount, usageMetadata.candidatesTokenCount, usageMetadata.totalTokenCount
     */
    gemini: {
      name: 'gemini',
      inputField: 'usageMetadata.promptTokenCount',
      outputField: 'usageMetadata.candidatesTokenCount',
      totalField: 'usageMetadata.totalTokenCount',
      parse: (response, strategy) => {
        const getNestedValue = (obj, path) => {
          return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
        };
        return {
          input: getNestedValue(response, strategy.inputField),
          output: getNestedValue(response, strategy.outputField),
          total: getNestedValue(response, strategy.totalField) ||
                 (getNestedValue(response, strategy.inputField) + getNestedValue(response, strategy.outputField))
        };
      }
    }
  };

  /**
   * 构造函数
   * @param {Object} config - 配置对象（可选）
   * @param {Object} config.providersConfig - 提供商配置，格式：{ modelId: { response_format: 'openai|anthropic|ollama|gemini' } }
   * @param {Object} config.adapterConfigPath - 适配器配置路径（预留）
   */
  constructor(config = {}) {
    this.config = config;
    this.providersConfig = config.providersConfig || {};
    this.customStrategies = {};  // 自定义解析策略
    this.strategies = { ...TokenUsageParser.BUILT_IN_STRATEGIES };  // 合并内置策略
  }

  /**
   * 从嵌套路径获取值
   * @param {Object} obj - 对象
   * @param {string} path - 路径，如 'usage.prompt_tokens'
   * @returns {*} 值
   */
  getNestedValue(obj, path) {
    if (!path) return 0;
    return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
  }

  /**
   * 注册自定义解析策略
   * @param {string} name - 策略名称
   * @param {Object} strategy - 策略定义
   * @param {string} strategy.inputField - input 字段路径
   * @param {string} strategy.outputField - output 字段路径
   * @param {string} strategy.totalField - total 字段路径（可选）
   * @param {Function} strategy.parse - 自定义解析函数（可选）
   */
  registerStrategy(name, strategy) {
    if (typeof strategy.parse === 'function') {
      // 完全自定义解析函数
      this.customStrategies[name] = {
        name,
        parse: strategy.parse
      };
    } else {
      // 基于字段定义的自定义策略
      this.customStrategies[name] = {
        name,
        inputField: strategy.inputField,
        outputField: strategy.outputField,
        totalField: strategy.totalField,
        parse: (response, strat) => {
          const input = this.getNestedValue(response, strat.inputField);
          const output = this.getNestedValue(response, strat.outputField);
          const total = strat.totalField
            ? this.getNestedValue(response, strat.totalField)
            : input + output;
          return { input, output, total };
        }
      };
    }
    // 同时注册到 strategies 以便通过名称访问
    this.strategies[name] = this.customStrategies[name];
  }

  /**
   * 从配置文件加载自定义解析策略
   * @param {Object} customConfigs - 自定义策略配置，如 { 'custom-format': { inputField: 'usage.in', outputField: 'usage.out' } }
   */
  loadCustomStrategies(customConfigs) {
    if (!customConfigs) return;
    for (const [name, config] of Object.entries(customConfigs)) {
      this.registerStrategy(name, config);
    }
  }

  /**
   * 设置提供商配置
   * @param {Object} providersConfig - 提供商配置，格式：{ modelId: { response_format: 'openai|anthropic|ollama|gemini' } }
   */
  setProvidersConfig(providersConfig) {
    this.providersConfig = providersConfig || {};
  }

  /**
   * 从 ModelRegistry 加载配置
   * @param {Object} modelRegistry - 模型注册表实例
   * 自动从模型注册表中提取各模型的 response_format 配置
   */
  setModelRegistry(modelRegistry) {
    if (!modelRegistry) return;

    const providersConfig = {};
    const models = modelRegistry.getAllModels ? modelRegistry.getAllModels() : [];

    for (const model of models) {
      if (model.id && model.response_format) {
        providersConfig[model.id] = {
          response_format: model.response_format,
          provider: model.provider
        };
      }
    }

    if (Object.keys(providersConfig).length > 0) {
      this.providersConfig = { ...this.providersConfig, ...providersConfig };
      console.log(`[TokenUsageParser] 从 ModelRegistry 加载了 ${Object.keys(providersConfig).length} 个模型的 response_format 配置`);
    }
  }

  /**
   * 获取模型的响应格式
   * @param {string} modelId - 模型 ID
   * @returns {string|null} 响应格式名称
   */
  getResponseFormat(modelId) {
    // 1. 首先从 providersConfig 中查找
    if (this.providersConfig[modelId]) {
      return this.providersConfig[modelId].response_format || null;
    }

    // 2. 尝试从 modelId 关键字匹配（回退方案）
    return this.extractFormatFromModelId(modelId);
  }

  /**
   * 从模型 ID 提取响应格式（关键字匹配）
   * @param {string} modelId - 模型 ID
   * @returns {string|null} 响应格式
   */
  extractFormatFromModelId(modelId) {
    const lowerModelId = modelId.toLowerCase();

    // Ollama 本地模型
    if (lowerModelId.includes('ollama')) {
      return 'ollama';
    }

    // Gemini
    if (lowerModelId.includes('gemini')) {
      return 'gemini';
    }

    // 默认回退（不猜测）
    return null;
  }

  /**
   * 根据响应格式获取解析策略
   * @param {string} format - 响应格式名称
   * @returns {Object|null} 解析策略
   */
  getStrategy(format) {
    if (!format) return null;
    return this.strategies[format] || null;
  }

  /**
   * 解析 API 响应中的 token 使用信息
   *
   * 【解析流程】
   * 1. 从响应中提取 modelId
   * 2. 根据 modelId 获取对应的响应格式
   * 3. 根据响应格式选择对应的解析策略
   * 4. 使用策略解析响应并提取 token
   * 5. 如果解析结果为 0 且有其他可能格式，自动尝试其他格式
   *
   * @param {Object} response - API 响应对象
   * @param {string} modelId - 模型 ID（可选，如果 response 中有 model 字段则可以不传）
   * @param {Object} options - 额外选项
   * @param {string} options.format - 直接指定响应格式（优先级最高）
   * @param {boolean} options.autoDetect - 是否自动检测格式（默认 true）
   * @param {Array} options.fallbackFormats - 备用格式列表（当主格式解析结果为 0 时尝试）
   * @returns {Object} TokenUsage 对象 { input: number, output: number, total: number, format: string }
   */
  parse(response, modelId = null, options = {}) {
    // 优先级：options.format > modelId > response.model
    const effectiveModelId = modelId || response.model;
    const specifiedFormat = options.format;
    const autoDetect = options.autoDetect !== false;  // 默认启用自动检测
    const fallbackFormats = options.fallbackFormats || [];

    let format = specifiedFormat;
    let strategy = null;

    // 如果直接指定了格式，直接使用
    if (format) {
      strategy = this.getStrategy(format);
    }

    // 否则根据 modelId 获取格式
    if (!strategy) {
      format = this.getResponseFormat(effectiveModelId);
      strategy = this.getStrategy(format);
    }

    // 如果找不到策略，记录警告并返回空结果
    if (!strategy) {
      console.warn(`[TokenUsageParser] Unknown response format for model '${effectiveModelId}', format='${format}'. Available strategies: ${Object.keys(this.strategies).join(', ')}`);
      return {
        input: 0,
        output: 0,
        total: 0,
        format: format || 'unknown',
        modelId: effectiveModelId,
        warning: `Unknown response format: ${format}`
      };
    }

    // 使用策略解析
    try {
      const result = strategy.parse(response, strategy);

      // 自动检测：如果解析结果全为 0，尝试其他可能的格式
      if (autoDetect && result.input === 0 && result.output === 0) {
        const possibleFormats = this.getPossibleFormatsForModel(effectiveModelId, format);
        for (const altFormat of possibleFormats) {
          if (altFormat === format) continue;
          const altStrategy = this.getStrategy(altFormat);
          if (altStrategy) {
            const altResult = altStrategy.parse(response, altStrategy);
            if (altResult.input > 0 || altResult.output > 0) {
              console.log(`[TokenUsageParser] Auto-detected format '${altFormat}' for model '${effectiveModelId}' (original: '${format}')`);
              return {
                ...altResult,
                format: altStrategy.name,
                modelId: effectiveModelId,
                strategy: altStrategy.name,
                autoDetected: true
              };
            }
          }
        }
      }

      return {
        ...result,
        format: strategy.name,
        modelId: effectiveModelId,
        strategy: strategy.name
      };
    } catch (error) {
      console.error(`[TokenUsageParser] Parse error for model '${effectiveModelId}' with format '${format}':`, error.message);
      return {
        input: 0,
        output: 0,
        total: 0,
        format: strategy.name,
        modelId: effectiveModelId,
        error: error.message
      };
    }
  }

  /**
   * 获取模型可能的响应格式列表
   * @param {string} modelId - 模型 ID
   * @param {string} currentFormat - 当前使用的格式
   * @returns {Array<string>} 可能的格式列表
   */
  getPossibleFormatsForModel(modelId, currentFormat) {
    const allFormats = ['openai', 'anthropic', 'ollama', 'gemini'];
    const possibleFormats = new Set();

    // 添加当前格式
    if (currentFormat) {
      possibleFormats.add(currentFormat);
    }

    // 添加配置中指定的格式
    const configuredFormat = this.getResponseFormat(modelId);
    if (configuredFormat) {
      possibleFormats.add(configuredFormat);
    }

    // 一些常见的模型可能返回多种格式
    const modelLower = modelId.toLowerCase();

    // DeepSeek 可能返回 OpenAI 或 Anthropic 格式
    if (modelLower.includes('deepseek')) {
      possibleFormats.add('openai');
      possibleFormats.add('anthropic');
    }

    // MiniMax 通常是 Anthropic 格式
    if (modelLower.includes('minimax')) {
      possibleFormats.add('anthropic');
    }

    // OpenAI 系列是 OpenAI 格式
    if (modelLower.includes('gpt') || modelLower.includes('openai')) {
      possibleFormats.add('openai');
    }

    // Anthropic 系列是 Anthropic 格式
    if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
      possibleFormats.add('anthropic');
    }

    // Gemini 是 Gemini 格式
    if (modelLower.includes('gemini')) {
      possibleFormats.add('gemini');
    }

    // Ollama 是 Ollama 格式
    if (modelLower.includes('ollama')) {
      possibleFormats.add('ollama');
    }

    // Bailian/Qwen 是 OpenAI 格式
    if (modelLower.includes('qwen') || modelLower.includes('bailian') || modelLower.includes('aliyun')) {
      possibleFormats.add('openai');
    }

    return Array.from(possibleFormats);
  }

  /**
   * 解析 API 响应（兼容旧接口）
   * @param {Object} response - API 响应对象
   * @param {string} provider - 提供商名称（已废弃，仅作兼容）
   * @returns {Object} TokenUsage 对象
   * @deprecated 请使用 parse(response, modelId) 替代
   */
  parseLegacy(response, provider) {
    // 尝试从 provider 名称推断格式
    const formatMap = {
      'openai': 'openai',
      'anthropic': 'anthropic',
      'ollama': 'ollama',
      'gemini': 'gemini',
      'deepseek': 'openai',    // DeepSeek 默认使用 OpenAI 格式
      'aliyun': 'openai',
      'bailian': 'openai',
      'moonshot': 'openai',
      'zhipu': 'openai'
    };

    const format = formatMap[provider] || 'openai';
    return this.parse(response, null, { format });
  }

  // ==================== 保留旧方法以兼容 ====================

  /**
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseOpenAI(response) {
    return this.parse(response, null, { format: 'openai' });
  }

  /**
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseAnthropic(response) {
    return this.parse(response, null, { format: 'anthropic' });
  }

  /**
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseOllama(response) {
    return this.parse(response, null, { format: 'ollama' });
  }

  /**
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseGemini(response) {
    return this.parse(response, null, { format: 'gemini' });
  }

  /**
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseDeepSeek(response) {
    // DeepSeek 可能返回两种格式，尝试自动检测
    if (response.usage?.input_tokens !== undefined) {
      return this.parse(response, null, { format: 'anthropic' });
    }
    return this.parse(response, null, { format: 'openai' });
  }

  /**
   * 从模型 ID 提取提供商（保留旧接口）
   * @param {string} modelId - 模型 ID
   * @returns {string} 提供商名称
   * @deprecated 优先使用 extractProviderFromRegistry
   */
  extractProvider(modelId) {
    const lowerModelId = modelId.toLowerCase();

    if (lowerModelId.includes('gpt') || lowerModelId.includes('openai')) return 'openai';
    if (lowerModelId.includes('claude') || lowerModelId.includes('anthropic')) return 'anthropic';
    if (lowerModelId.includes('gemini') || lowerModelId.includes('google')) return 'gemini';
    if (lowerModelId.includes('ollama')) return 'ollama';
    if (lowerModelId.includes('deepseek')) return 'deepseek';
    if (lowerModelId.includes('qwen')) return 'aliyun';
    if (lowerModelId.includes('minimax')) return 'minimax';
    if (lowerModelId.includes('kimi') || lowerModelId.includes('moonshot')) return 'moonshot';
    if (lowerModelId.includes('glm') || lowerModelId.includes('zhipu')) return 'zhipu';
    return 'openai';
  }

  /**
   * 从 ModelRegistry 获取提供商信息
   * @param {string} modelId - 模型 ID
   * @param {Object} modelRegistry - 模型注册表实例
   * @returns {string|null} 提供商名称
   */
  extractProviderFromRegistry(modelId, modelRegistry) {
    if (!modelRegistry) return null;

    const modelSpec = modelRegistry.getModel?.(modelId) ||
                      this.providersConfig?.[modelId];
    return modelSpec?.provider || null;
  }

  /**
   * 通用解析方法，自动检测提供商
   * @param {Object} response - API 响应
   * @param {string} modelId - 模型 ID
   * @returns {Object} TokenUsage 对象
   * @deprecated 使用 parse(response, modelId) 替代
   */
  parseAuto(response, modelId) {
    return this.parse(response, modelId);
  }

  /**
   * 获取提供商（兼容旧接口）
   * @param {string} modelId - 模型 ID
   * @param {Object} modelRegistry - 模型注册表实例
   * @returns {string} 提供商名称
   */
  getProvider(modelId, modelRegistry = null) {
    if (modelRegistry) {
      const provider = this.extractProviderFromRegistry(modelId, modelRegistry);
      if (provider) return provider;
    }
    return this.extractProvider(modelId);
  }
}

module.exports = TokenUsageParser;
