/**
 * ModelRegistry - 模型注册中心
 *
 * 功能块 A：模型注册与管理层
 * 负责统一管理所有可用模型的元数据信息
 */

const fs = require('fs');
const path = require('path');

class ModelRegistry {
  constructor(config = {}) {
    this.models = new Map();  // 存储模型信息
    this.providers = new Map();  // 存储提供商信息
    this.config = config;
    this.loadModels();
  }

  /**
   * 加载模型配置
   */
  loadModels() {
    // 从配置文件加载模型
    this.loadModelsFromConfigFile();
  }

  /**
   * 从配置文件加载模型
   */
  loadModelsFromConfigFile() {
    // 1. 优先尝试加载统一配置文件（类似 CCR Router 格式）
    if (this._tryLoadUnifiedConfig()) {
      return;
    }

    // 2. 回退到 YAML 配置文件
    const configPaths = [
      path.join(__dirname, 'models.yaml'),
      path.join(__dirname, '..', 'config', 'models.yaml'),
      path.join(__dirname, '..', '..', 'config', 'selector', 'models.yaml')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const yaml = require('js-yaml');
          const content = fs.readFileSync(configPath, 'utf8');
          const config = yaml.load(content);

          if (config && config.models) {
            for (const modelConfig of config.models) {
              this.registerModel(modelConfig);
            }
          }
          break;
        } catch (error) {
          console.warn(`加载模型配置文件失败 ${configPath}: ${error.message}`);
        }
      }
    }
  }

  /**
   * 尝试加载统一配置文件
   * @returns {boolean} 是否成功加载
   * @private
   */
  _tryLoadUnifiedConfig() {
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'config', 'config.json'),  // src/selector/../../config/config.json
      path.join(process.cwd(), 'config', 'config.json'),  // 当前工作目录/config/config.json
      path.join(process.cwd(), 'config.json'),  // 当前工作目录/config.json
      path.join(__dirname, '..', '..', '..', 'config', 'config.json')  // 备用路径
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);

          // 检查是否是统一配置格式（包含 Providers 数组）
          if (config.Providers && Array.isArray(config.Providers)) {
            this._loadModelsFromUnifiedConfig(config);
            return true;
          }
        } catch (error) {
          console.warn(`解析统一配置文件失败 ${configPath}: ${error.message}`);
        }
      }
    }

    return false;
  }

  /**
   * 从统一配置文件中加载模型
   * @param {Object} config - 统一配置对象
   * @private
   */
  _loadModelsFromUnifiedConfig(config) {
    let loadedCount = 0;

    for (const provider of config.Providers) {
      const providerName = provider.name;
      const apiBaseUrl = provider.api_base_url;
      const apiKeyEnv = provider.api_key_env;
      const apiKey = provider.api_key;
      const useAnthropicFormat = provider.use_anthropic_format;

      // 调试日志
      if (providerName === 'minimax') {
        console.log(`[ModelRegistry] minimax provider: use_anthropic_format=${useAnthropicFormat}, typeof=${typeof useAnthropicFormat}`);
      }

      if (!provider.models || !Array.isArray(provider.models)) {
        continue;
      }

      for (const modelConfig of provider.models) {
        // 将统一格式转换为 ModelRegistry 格式
        const model = {
          id: modelConfig.id,
          name: modelConfig.name || modelConfig.id,
          provider: providerName,
          type: modelConfig.type || 'cloud',
          capabilities: modelConfig.capabilities || [],
          strengths: modelConfig.strengths || [],
          pricing: modelConfig.pricing || { input: 0, output: 0 },
          speed: modelConfig.speed || 'medium',
          context_limit: modelConfig.context_limit || 32768,
          quality_score: modelConfig.quality_score || 7.0,
          available: modelConfig.available !== false,
          max_concurrency: modelConfig.max_concurrency || 10,
          response_time: modelConfig.response_time || 5000,
          // 存储 API 相关信息
          api_model_id: modelConfig.api_model_id || modelConfig.id,
          api_base_url: apiBaseUrl,
          api_key_env: apiKeyEnv,
          api_key: apiKey,
          // 支持 Anthropic 格式
          use_anthropic_format: useAnthropicFormat === true,
          // 响应格式 (用于 TokenUsageParser)
          response_format: modelConfig.response_format || provider.response_format || null,
          // 最大输出 tokens 数
          max_output_tokens: modelConfig.max_output_tokens || null,
          metadata: {
            ...modelConfig.metadata,
            loadedFrom: 'unified-config'
          }
        };

        this.registerModel(model);
        loadedCount++;
      }
    }

    // 如果配置中还有单独的 defaultModels 字段，也加载它们
    if (config.defaultModels && Array.isArray(config.defaultModels)) {
      for (const modelConfig of config.defaultModels) {
        this.registerModel(modelConfig);
        loadedCount++;
      }
    }

    console.log(`[ModelRegistry] 从统一配置加载了 ${loadedCount} 个模型`);
  }

  /**
   * 从统一配置加载模型（公共方法）
   */
  loadFromUnifiedConfig(providers) {
    let loadedCount = 0;

    // 加载 providers 配置中的模型
    if (Array.isArray(providers)) {
      for (const provider of providers) {
        const providerName = provider.name;
        const apiBaseUrl = provider.api_base_url;
        const apiKeyEnv = provider.api_key_env;
        const apiKey = provider.api_key;

        if (!provider.models || !Array.isArray(provider.models)) {
          console.log(`[ModelRegistry] 提供商 ${providerName} 没有 models 数组或为空，跳过`);
          continue;
        }

        console.log(`[ModelRegistry] 提供商 ${providerName} 有 ${provider.models.length} 个模型`);
        for (const modelConfig of provider.models) {
          // 调试：检查 modelConfig 中的 max_output_tokens
          console.log(`[ModelRegistry] 正在处理模型: ${modelConfig.id}, max_output_tokens in modelConfig: ${modelConfig.max_output_tokens}`);
          // 将统一格式转换为 ModelRegistry 格式
          const model = {
            id: modelConfig.id,
            name: modelConfig.name || modelConfig.id,
            provider: providerName,
            type: modelConfig.type || 'cloud',
            capabilities: modelConfig.capabilities || [],
            strengths: modelConfig.strengths || [],
            pricing: modelConfig.pricing || { input: 0, output: 0 },
            speed: modelConfig.speed || 'medium',
            context_limit: modelConfig.context_limit || 32768,
            quality_score: modelConfig.quality_score || 7.0,
            available: modelConfig.available !== false,
            max_concurrency: modelConfig.max_concurrency || 10,
            response_time: modelConfig.response_time || 5000,
            // 存储 API 相关信息
            api_model_id: modelConfig.api_model_id || modelConfig.id,
            api_base_url: apiBaseUrl,
            api_key_env: apiKeyEnv,
            api_key: apiKey,
            // 支持 Anthropic 格式
            use_anthropic_format: provider.use_anthropic_format === true,
            // 最大输出 tokens 数
            max_output_tokens: modelConfig.max_output_tokens || null,
            metadata: {
              ...modelConfig.metadata,
              loadedFrom: 'unified-config'
            }
          };

          this.registerModel(model);
          loadedCount++;
        }
      }
    }

    // 如果有单独的 defaultModels，也要加载
    if (providers.defaultModels && Array.isArray(providers.defaultModels)) {
      for (const modelConfig of providers.defaultModels) {
        this.registerModel(modelConfig);
        loadedCount++;
      }
    }

    console.log(`[ModelRegistry] 从统一配置加载/更新了 ${loadedCount} 个模型`);
  }

  /**
   * 添加模型
   */
  addModel(modelData) {
    if (!modelData.id) {
      throw new Error('模型必须包含 id');
    }

    // 验证必填字段
    if (!modelData.name) {
      modelData.name = modelData.id;
    }
    if (!modelData.provider) {
      throw new Error('模型必须包含 provider');
    }

    this.registerModel(modelData);
    console.log(`[ModelRegistry] 添加了模型: ${modelData.id}`);
  }

  /**
   * 更新模型
   */
  updateModel(modelId, updates) {
    const model = this.getModel(modelId);
    if (!model) {
      return false;
    }

    // 更新模型属性
    Object.assign(model, updates);
    console.log(`[ModelRegistry] 更新了模型: ${modelId}`);
    return true;
  }

  /**
   * 删除模型
   */
  removeModel(modelId) {
    const result = this.unregisterModel(modelId);
    if (result) {
      console.log(`[ModelRegistry] 删除了模型: ${modelId}`);
    }
    return result;
  }

  /**
   * 导出所有模型（供 UI 读取）
   */
  exportModels() {
    return this.getAllModels();
  }

  /**
   * 注册模型
   */
  registerModel(modelData) {
    // 支持 cost 和 pricing 两种字段，确保 UI 可以访问 cost 字段
    const costData = modelData.cost || modelData.pricing || { input: 0, output: 0 };
    const pricingData = modelData.pricing || modelData.cost || { input: 0, output: 0 };

    const model = {
      id: modelData.id,
      name: modelData.name,
      provider: modelData.provider,
      type: modelData.type || 'cloud',  // 新增字段：模型类型（cloud/local）
      capabilities: modelData.capabilities || [],
      strengths: modelData.strengths || [],
      pricing: pricingData,
      cost: costData,  // 添加 cost 字段以兼容 UI
      speed: modelData.speed || 'medium',
      contextLimit: modelData.context_limit || modelData.contextLimit || 128000,
      qualityScore: modelData.quality_score || modelData.qualityScore || 7.0,
      available: modelData.available !== false,
      description: modelData.description || '',
      // API 相关信息（从统一配置文件加载）
      api_key: modelData.api_key || null,  // API 密钥（直接从配置文件读取）
      api_key_env: modelData.api_key_env || null,  // API 密钥环境变量名
      api_base_url: modelData.api_base_url || null,  // API 基础 URL
      api_model_id: modelData.api_model_id || modelData.id,  // API 调用时使用的模型 ID
      use_anthropic_format: modelData.use_anthropic_format === true,  // 是否使用 Anthropic 兼容格式
      response_format: modelData.response_format || null,  // 响应格式 (openai/anthropic/ollama/gemini)，用于 TokenUsageParser 选择解析策略
      max_output_tokens: modelData.max_output_tokens || null,  // 最大输出 tokens 数
      // 本地模型的特殊属性
      hardwareSpecs: modelData.hardware_specs || modelData.hardwareSpecs || {}, // 硬件规格（用于本地模型）
      maxConcurrency: modelData.max_concurrency || modelData.maxConcurrency || (modelData.type === 'local' ? 2 : 10), // 最大并发数
      responseTime: modelData.response_time || modelData.responseTime || (modelData.type === 'local' ? 2000 : 5000), // 预期响应时间（毫秒）
      metadata: modelData.metadata || {}
    };

    this.models.set(model.id, model);
    console.log(`[ModelRegistry] 已注册模型：${model.id}, max_output_tokens: ${model.max_output_tokens}`);
  }

  /**
   * 获取模型
   */
  getModel(modelId) {
    // 处理 modelId 可能是对象的情况（提取 modelId 属性）
    if (modelId && typeof modelId === 'object' && modelId.modelId) {
      modelId = modelId.modelId;
    }

    // 确保 modelId 是字符串
    if (typeof modelId !== 'string') {
      return null;
    }

    // 首先尝试直接查找
    let model = this.models.get(modelId);

    // 如果找不到且模型 ID 包含逗号（provider,model 格式），尝试提取实际模型名
    if (!model && modelId && modelId.includes(',')) {
      const [, actualModelId] = modelId.split(',');
      if (actualModelId) {
        model = this.models.get(actualModelId.trim());
      }
    }

    return model;
  }

  /**
   * 获取所有模型
   */
  getAllModels() {
    return Array.from(this.models.values());
  }

  /**
   * 获取可用的模型
   */
  getAvailableModels() {
    return Array.from(this.models.values()).filter(model => model.available);
  }

  /**
   * 根据任务类型筛选模型
   */
  getModelsByTaskType(taskType) {
    return this.getAvailableModels().filter(model =>
      model.capabilities.includes(taskType)
    );
  }

  /**
   * 根据提供商筛选模型
   */
  getModelsByProvider(provider) {
    return this.getAvailableModels().filter(model =>
      model.provider === provider
    );
  }

  /**
   * 获取性价比最高的模型（按质量/成本比）
   */
  getBestValueModels(taskType) {
    const candidates = this.getModelsByTaskType(taskType);

    return candidates.map(model => {
      const avgPrice = (model.pricing.input + model.pricing.output) / 2;
      const valueScore = model.qualityScore / (avgPrice * 1000);
      return { ...model, valueScore };
    }).sort((a, b) => b.valueScore - a.valueScore);
  }

  /**
   * 获取质量最高的模型
   */
  getHighestQualityModels(taskType) {
    return this.getModelsByTaskType(taskType)
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * 获取速度最快的模型
   */
  getFastestModels(taskType) {
    const speedOrder = { 'fast': 1, 'medium': 2, 'slow': 3 };
    return this.getModelsByTaskType(taskType)
      .sort((a, b) => speedOrder[a.speed] - speedOrder[b.speed]);
  }

  /**
   * 更新模型状态
   */
  updateModelStatus(modelId, status) {
    const model = this.models.get(modelId);
    if (model) {
      if (status.available !== undefined) {
        model.available = status.available;
      }
      return true;
    }
    return false;
  }

  /**
   * 注销模型
   */
  unregisterModel(modelId) {
    return this.models.delete(modelId);
  }

  /**
   * 导出模型配置
   */
  exportConfig(format = 'json') {
    const models = this.getAllModels();

    if (format === 'json') {
      return JSON.stringify({ models }, null, 2);
    } else if (format === 'yaml') {
      const yaml = require('js-yaml');
      return yaml.dump({ models });
    }

    throw new Error(`不支持的导出格式：${format}`);
  }
}

module.exports = ModelRegistry;
