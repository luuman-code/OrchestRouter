/**
 * UnifiedConfigLoader - 统一配置加载器
 *
 * 支持两种配置格式：
 * 1. 新的统一配置文件（类似 CCR Router 格式）- config.json 或 unified-config.json
 * 2. 旧的分离配置文件（向后兼容）- models.yaml + provider-endpoints.yaml
 *
 * 优先使用统一配置文件，如果不存在则回退到分离配置文件
 *
 * @class UnifiedConfigLoader
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class UnifiedConfigLoader {
  /**
   * 创建配置加载器
   * @param {Object} options - 配置选项
   * @param {string} options.configPath - 配置文件路径
   * @param {string} options.fallbackDir - 回退配置文件目录
   */
  constructor(options = {}) {
    this.options = {
      configPath: options.configPath || path.join(__dirname, 'config.json'),
      fallbackDir: options.fallbackDir || path.join(__dirname, '..', 'src')
    };

    this.config = null;
    this.loadedFrom = null; // 'unified' 或 'split'
  }

  /**
   * 加载配置（主方法）
   * @returns {Object} 配置对象
   */
  loadConfig() {
    // 尝试加载统一配置文件
    const unifiedConfig = this._tryLoadUnifiedConfig();

    if (unifiedConfig) {
      this.config = unifiedConfig;
      this.loadedFrom = 'unified';
      console.log('[UnifiedConfigLoader] 已从统一配置文件加载:', this.options.configPath);
      return this.config;
    }

    // 回退到分离配置文件
    console.log('[UnifiedConfigLoader] 未找到统一配置文件，尝试加载分离配置文件...');
    const splitConfig = this._tryLoadSplitConfig();

    if (splitConfig) {
      this.config = this._convertSplitToUnified(splitConfig);
      this.loadedFrom = 'split';
      console.log('[UnifiedConfigLoader] 已从分离配置文件加载并转换');
      return this.config;
    }

    throw new Error('无法加载任何配置文件');
  }

  /**
   * 尝试加载统一配置文件
   * @returns {Object|null} 配置对象
   * @private
   */
  _tryLoadUnifiedConfig() {
    const possiblePaths = [
      this.options.configPath,
      path.join(__dirname, 'unified-config.json'),
      path.join(__dirname, '..', 'config.json'),
      path.join(__dirname, '..', 'unified-config.json'),
      path.join(process.cwd(), 'config.json'),
      path.join(process.cwd(), 'unified-config.json')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);

          // 验证基本结构
          if (config.Providers && Array.isArray(config.Providers)) {
            console.log(`[UnifiedConfigLoader] 找到统一配置文件：${configPath}`);
            this.options.configPath = configPath;
            return config;
          }
        } catch (error) {
          console.warn(`[UnifiedConfigLoader] 解析 ${configPath} 失败：${error.message}`);
        }
      }
    }

    return null;
  }

  /**
   * 尝试加载分离配置文件
   * @returns {Object|null} 配置对象
   * @private
   */
  _tryLoadSplitConfig() {
    const modelsPath = path.join(this.options.fallbackDir, 'selector', 'registry', 'models.yaml');
    const providerPath = path.join(this.options.fallbackDir, 'executor', 'config', 'provider-endpoints.yaml');

    let models = null;
    let providers = null;

    try {
      if (fs.existsSync(modelsPath)) {
        const content = fs.readFileSync(modelsPath, 'utf8');
        models = yaml.load(content);
      }
    } catch (error) {
      console.warn(`[UnifiedConfigLoader] 加载 models.yaml 失败：${error.message}`);
    }

    try {
      if (fs.existsSync(providerPath)) {
        const content = fs.readFileSync(providerPath, 'utf8');
        providers = yaml.load(content);
      }
    } catch (error) {
      console.warn(`[UnifiedConfigLoader] 加载 provider-endpoints.yaml 失败：${error.message}`);
    }

    if (models && providers) {
      return { models, providers };
    }

    return null;
  }

  /**
   * 将分离配置文件转换为统一格式
   * @param {Object} splitConfig - 分离配置
   * @returns {Object} 统一格式配置
   * @private
   */
  _convertSplitToUnified(splitConfig) {
    const { models, providers } = splitConfig;

    // 构建提供商分组
    const providerGroups = {};

    // 从 models.yaml 中提取模型并按 provider 分组
    if (models && models.models) {
      for (const model of models.models) {
        const providerName = model.provider;
        if (!providerGroups[providerName]) {
          providerGroups[providerName] = {
            name: providerName,
            api_base_url: providers.endpoints?.[providerName] || '',
            api_key_env: providers.apiKeys?.[providerName] || '',
            models: []
          };
        }

        // 转换模型格式
        const apiModelId = providers.modelMappings?.[model.id] || model.id;

        providerGroups[providerName].models.push({
          id: model.id,
          name: model.name || model.id,
          api_model_id: apiModelId,
          capabilities: model.capabilities || [],
          strengths: model.strengths || [],
          pricing: model.pricing || { input: 0, output: 0 },
          context_limit: model.context_limit || 32768,
          quality_score: model.quality_score || 7.0,
          speed: model.speed || 'medium',
          max_concurrency: model.max_concurrency || 10,
          response_time: model.response_time || 5000,
          type: model.type || 'cloud',
          available: model.available !== false
        });
      }
    }

    // 构建统一配置
    const unifiedConfig = {
      Providers: Object.values(providerGroups),
      selector: {
        default: 'auto'
      },
      costControl: {
        dailyBudget: 10.00,
        maxCostPerTask: 0.50,
        qualityFirst: false
      },
      executor: {
        defaultMaxConcurrency: 10,
        defaultTimeout: 60000,
        enableTracing: true,
        enableMonitoring: true
      },
      _convertedFromSplit: true,
      _originalModelsPath: path.join(this.options.fallbackDir, 'selector', 'registry', 'models.yaml'),
      _originalProviderPath: path.join(this.options.fallbackDir, 'executor', 'config', 'provider-endpoints.yaml')
    };

    return unifiedConfig;
  }

  /**
   * 获取所有提供商
   * @returns {Array} 提供商列表
   */
  getProviders() {
    if (!this.config) {
      this.loadConfig();
    }
    return this.config.Providers || [];
  }

  /**
   * 获取所有模型
   * @returns {Array} 所有模型列表（扁平化）
   */
  getAllModels() {
    if (!this.config) {
      this.loadConfig();
    }

    const allModels = [];
    for (const provider of this.config.Providers || []) {
      for (const model of provider.models || []) {
        allModels.push({
          ...model,
          provider: provider.name,
          api_base_url: provider.api_base_url,
          api_key_env: provider.api_key_env,
          api_key: provider.api_key
        });
      }
    }
    return allModels;
  }

  /**
   * 获取指定提供商的模型
   * @param {string} providerName - 提供商名称
   * @returns {Array} 模型列表
   */
  getModelsByProvider(providerName) {
    const provider = this.config.Providers?.find(p => p.name === providerName);
    return provider?.models || [];
  }

  /**
   * 获取指定模型
   * @param {string} modelId - 模型 ID
   * @returns {Object|null} 模型信息
   */
  getModel(modelId) {
    for (const provider of this.config.Providers || []) {
      const model = provider.models?.find(m => m.id === modelId);
      if (model) {
        return {
          ...model,
          provider: provider.name,
          api_base_url: provider.api_base_url,
          api_key_env: provider.api_key_env,
          api_key: provider.api_key
        };
      }
    }
    return null;
  }

  /**
   * 获取系统配置
   * @returns {Object} 系统配置
   */
  getSystemConfig() {
    return this.config.system || {
      host: '127.0.0.1',
      port: 3458,
      debug: false,
      logLevel: 'info',
      apiTimeoutMs: 600000,
      maxConcurrency: 10
    };
  }

  /**
   * 获取选择器配置
   * @returns {Object} 选择器配置
   */
  getSelectorConfig() {
    return this.config.selector || {};
  }

  /**
   * 获取执行器配置
   * @returns {Object} 执行器配置
   */
  getExecutorConfig() {
    return this.config.executor || {};
  }

  /**
   * 获取成本控制配置
   * @returns {Object} 成本控制配置
   */
  getCostControlConfig() {
    return this.config.costControl || {};
  }

  /**
   * 获取当前配置来源
   * @returns {string} 'unified' 或 'split'
   */
  getLoadedFrom() {
    return this.loadedFrom;
  }

  /**
   * 保存配置到统一格式文件
   * @param {string} outputPath - 输出文件路径
   */
  saveConfig(outputPath) {
    if (!this.config) {
      throw new Error('未加载任何配置');
    }

    const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
    const content = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(absolutePath, content, 'utf8');
    console.log(`[UnifiedConfigLoader] 配置已保存到：${absolutePath}`);
  }

  /**
   * 导出为旧格式（分离配置文件）
   * @param {string} modelsOutputPath - models.yaml 输出路径
   * @param {string} providersOutputPath - provider-endpoints.yaml 输出路径
   */
  exportToSplitFormat(modelsOutputPath, providersOutputPath) {
    if (!this.config) {
      throw new Error('未加载任何配置');
    }

    // 导出 models.yaml
    const models = {
      models: this.getAllModels().map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        type: m.type || 'cloud',
        capabilities: m.capabilities,
        strengths: m.strengths,
        pricing: m.pricing,
        speed: m.speed,
        context_limit: m.context_limit,
        quality_score: m.quality_score,
        available: m.available !== false,
        max_concurrency: m.max_concurrency,
        response_time: m.response_time
      }))
    };

    // 导出 provider-endpoints.yaml
    const endpoints = {};
    const apiKeys = {};
    const modelMappings = {};

    for (const provider of this.config.Providers || []) {
      endpoints[provider.name] = provider.api_base_url;
      if (provider.api_key_env) {
        apiKeys[provider.name] = provider.api_key_env;
      }
      for (const model of provider.models || []) {
        if (model.api_model_id && model.api_model_id !== model.id) {
          modelMappings[model.id] = model.api_model_id;
        }
      }
    }

    const providers = {
      endpoints,
      apiKeys,
      modelMappings
    };

    // 保存文件
    const modelsAbsolute = path.isAbsolute(modelsOutputPath) ? modelsOutputPath : path.resolve(process.cwd(), modelsOutputPath);
    const providersAbsolute = path.isAbsolute(providersOutputPath) ? providersOutputPath : path.resolve(process.cwd(), providersOutputPath);

    fs.writeFileSync(modelsAbsolute, yaml.dump(models), 'utf8');
    fs.writeFileSync(providersAbsolute, yaml.dump(providers), 'utf8');

    console.log(`[UnifiedConfigLoader] 已导出分离配置文件:`);
    console.log(`  - models.yaml: ${modelsAbsolute}`);
    console.log(`  - provider-endpoints.yaml: ${providersAbsolute}`);
  }
}

module.exports = { UnifiedConfigLoader };
