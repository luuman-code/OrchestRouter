/**
 * ConfigService - 配置服务
 *
 * 统一管理配置的读取和保存，提供 REST API 供 UI 调用
 */

const fs = require('fs');
const path = require('path');
const SelectionConfigManager = require('../src/selector/config/SelectionConfigManager');
const ModelRegistry = require('../src/selector/registry/ModelRegistry');

class ConfigService {
  constructor(configPath = path.join(__dirname, 'config.json')) {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.selectionConfigManager = new SelectionConfigManager();
    this.modelRegistry = new ModelRegistry();
    // ModelRegistry 会自动从配置文件加载模型，无需手动调用 loadFromUnifiedConfig

    // 从统一配置加载规则
    this.selectionConfigManager.loadFromUnifiedConfig(this.config);

    this.listeners = []; // 配置变更监听器
  }

  /**
   * 加载配置
   */
  loadConfig() {
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.error(`加载配置文件失败: ${error.message}`);
        return this.getDefaultConfig();
      }
    }
    return this.getDefaultConfig();
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      system: {
        host: "127.0.0.1",
        port: 3458,
        debug: false,
        logLevel: "info",
        apiTimeoutMs: 600000,
        maxConcurrency: 10
      },
      Providers: [
        {
          name: "aliyun",
          api_base_url: "https://coding.dashscope.aliyuncs.com/v1",
          api_key_env: "DASHSCOPE_API_KEY",
          api_key: "",
          models: [],
          transformer: "",
          headers: ""
        }
      ],
      selector: {
        default: "aliyun,qwen3-coder-plus",
        background: "aliyun,qwen3-coder-plus",
        think: "aliyun,qwen3-max-2026-01-23",
        longContext: "aliyun,qwen3.5-plus",
        longContextThreshold: 100000,
        webSearch: "aliyun,kimi-k2.5",
        image: "aliyun,qwen3-coder-plus",
        code: "aliyun,qwen3-coder-next",
        reasoning: "deepseek,deepseek-reasoner",
        selectionRules: [] // 新增：选择规则配置
      },
      costControl: {
        dailyBudget: 10.00,
        maxCostPerTask: 0.50,
        qualityFirst: false,
        safetyMargin: 0.2,
        conservativeEstimation: true
      },
      executor: {
        defaultMaxConcurrency: 10,
        defaultTimeout: 60000,
        enableTracing: true,
        enableMonitoring: true,
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          exponentialBase: 2.0,
          jitter: true
        },
        rateLimit: {
          defaultRps: 10,
          burstCapacity: 30
        }
      },
      defaultModels: [] // 新增：默认模型配置
    };
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 验证并确保配置具有必要的结构，防止意外覆写为空配置
      const validatedConfig = this._validateAndMergeConfig(config);

      // 保存配置到文件
      fs.writeFileSync(this.configPath, JSON.stringify(validatedConfig, null, 2), 'utf8');

      // 更新内部配置
      this.config = validatedConfig;

      // 通知监听器配置已更改
      this.emit('configChanged', validatedConfig);

      return true;
    } catch (error) {
      console.error(`保存配置文件失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 验证并合并配置，确保配置结构完整
   */
  _validateAndMergeConfig(newConfig) {
    // 如果新配置为空或不是一个对象，则使用当前配置
    if (!newConfig || typeof newConfig !== 'object' || Object.keys(newConfig).length === 0) {
      console.warn('收到空或无效配置，保持当前配置不变');
      return { ...this.config };
    }

    // 确保所有必需的顶级字段存在
    // 保留所有 $comment_* 元数据注释字段
    const commentFields = Object.keys(newConfig)
      .filter(key => key.startsWith('$comment_'))
      .reduce((obj, key) => ({ ...obj, [key]: newConfig[key] }), {});

    const mergedConfig = {
      // 如果新配置包含 schema 信息，保留它们
      ...(newConfig.$schema && { $schema: newConfig.$schema }),
      ...(newConfig.$comment && { $comment: newConfig.$comment }),
      ...(newConfig.$version && { $version: newConfig.$version }),
      // 保留所有 $comment_* 元数据注释
      ...commentFields,

      // 系统配置
      system: newConfig.system
        ? { ...this.config.system, ...newConfig.system }
        : (this.config.system || this.getDefaultConfig().system),

      // 提供商配置 - 如果提供了新的 Providers 数组且非空，使用新数组；否则保留旧的
      Providers: (Array.isArray(newConfig.Providers) && newConfig.Providers.length > 0)
        ? newConfig.Providers
        : (this.config.Providers || this.getDefaultConfig().Providers),

      // 选择器配置
      selector: newConfig.selector
        ? { ...this.config.selector, ...newConfig.selector }
        : (this.config.selector || this.getDefaultConfig().selector),

      // 成本控制配置
      costControl: newConfig.costControl
        ? { ...this.config.costControl, ...newConfig.costControl }
        : (this.config.costControl || this.getDefaultConfig().costControl),

      // 执行器配置
      executor: newConfig.executor
        ? { ...this.config.executor, ...newConfig.executor }
        : (this.config.executor || this.getDefaultConfig().executor),

      // 默认模型配置（如果存在）
      defaultModels: Array.isArray(newConfig.defaultModels)
        ? newConfig.defaultModels
        : (this.config.defaultModels || this.getDefaultConfig().defaultModels),

      // 分解器配置 - 新增
      decomposer: newConfig.decomposer
        ? { ...this.config.decomposer, ...newConfig.decomposer }
        : (this.config.decomposer || {}),

      // 编排器配置 - 新增
      orchestrator: newConfig.orchestrator
        ? { ...this.config.orchestrator, ...newConfig.orchestrator }
        : (this.config.orchestrator || {}),

      // 熔断器配置 - 新增
      circuit_breaker: newConfig.circuit_breaker
        ? { ...this.config.circuit_breaker, ...newConfig.circuit_breaker }
        : (this.config.circuit_breaker || {}),

      // 会话管理配置 - 新增
      session: newConfig.session
        ? { ...this.config.session, ...newConfig.session }
        : (this.config.session || {}),

      // 重试管理器配置 - 新增
      retry_manager: newConfig.retry_manager
        ? { ...this.config.retry_manager, ...newConfig.retry_manager }
        : (this.config.retry_manager || {}),

      // 限流器配置 - 新增
      rate_limiter: newConfig.rate_limiter
        ? { ...this.config.rate_limiter, ...newConfig.rate_limiter }
        : (this.config.rate_limiter || {}),

      // 学习引擎配置 - 新增
      learning_engine: newConfig.learning_engine
        ? { ...this.config.learning_engine, ...newConfig.learning_engine }
        : (this.config.learning_engine || {}),

      // 编排器扩展配置 - 新增
      orchestrator_extensions: newConfig.orchestrator_extensions
        ? { ...this.config.orchestrator_extensions, ...newConfig.orchestrator_extensions }
        : (this.config.orchestrator_extensions || {}),

      // 整合器配置 - 新增
      integrator: newConfig.integrator
        ? { ...this.config.integrator, ...newConfig.integrator }
        : (this.config.integrator || {}),

      // 流式配置 - 新增
      streaming: newConfig.streaming
        ? { ...this.config.streaming, ...newConfig.streaming }
        : (this.config.streaming || {}),
    };

    return mergedConfig;
  }

  /**
   * 获取完整配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 添加事件监听器
   */
  on(event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  /**
   * 发出事件
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(data));
    }
  }

  /**
   * 获取选择规则
   */
  getSelectionRules() {
    return this.selectionConfigManager.getAllRules();
  }

  /**
   * 添加选择规则
   */
  addRule(rule) {
    try {
      this.selectionConfigManager.addRule(rule);

      // 更新配置中的 selectionRules
      if (!this.config.selector.selectionRules) {
        this.config.selector.selectionRules = [];
      }

      // 检查是否已存在相同任务类型的规则
      const existingIndex = this.config.selector.selectionRules.findIndex(
        r => r.taskTypes.some(taskType => rule.taskTypes.includes(taskType))
      );

      if (existingIndex >= 0) {
        this.config.selector.selectionRules[existingIndex] = { ...this.config.selector.selectionRules[existingIndex], ...rule };
      } else {
        this.config.selector.selectionRules.push(rule);
      }

      // 保存配置
      this.saveConfig(this.config);

      return true;
    } catch (error) {
      console.error(`添加选择规则失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新选择规则
   */
  updateRule(taskType, rule) {
    try {
      const result = this.selectionConfigManager.updateRule(taskType, rule);

      if (result) {
        // 更新配置中的 selectionRules
        const ruleIndex = this.config.selector.selectionRules.findIndex(
          r => r.taskTypes.includes(taskType)
        );

        if (ruleIndex >= 0) {
          this.config.selector.selectionRules[ruleIndex] = { ...this.config.selector.selectionRules[ruleIndex], ...rule };

          // 保存配置
          this.saveConfig(this.config);
        }
      }

      return result;
    } catch (error) {
      console.error(`更新选择规则失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 删除选择规则
   */
  removeRule(taskType) {
    try {
      const result = this.selectionConfigManager.removeRule(taskType);

      if (result) {
        // 从配置中删除 selectionRules
        this.config.selector.selectionRules = this.config.selector.selectionRules.filter(
          r => !r.taskTypes.includes(taskType)
        );

        // 保存配置
        this.saveConfig(this.config);
      }

      return result;
    } catch (error) {
      console.error(`删除选择规则失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取所有模型
   */
  getModels() {
    return this.modelRegistry.exportModels();
  }

  /**
   * 添加模型
   */
  addModel(model) {
    try {
      this.modelRegistry.addModel(model);

      // 更新配置中的 Providers
      // 查找或创建对应的提供商
      let provider = this.config.Providers.find(p => p.name === model.provider);
      if (!provider) {
        provider = {
          name: model.provider,
          api_base_url: '', // 需要根据实际提供商设置
          api_key_env: '',
          api_key: '',
          models: []
        };
        this.config.Providers.push(provider);
      }

      // 添加模型到提供商
      provider.models.push(model);

      // 保存配置
      this.saveConfig(this.config);

      return true;
    } catch (error) {
      console.error(`添加模型失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新模型
   */
  updateModel(modelId, model) {
    try {
      const result = this.modelRegistry.updateModel(modelId, model);

      if (result) {
        // 更新配置中的模型
        for (const provider of this.config.Providers) {
          const modelIndex = provider.models.findIndex(m => m.id === modelId);
          if (modelIndex >= 0) {
            provider.models[modelIndex] = { ...provider.models[modelIndex], ...model };
            break;
          }
        }

        // 保存配置
        this.saveConfig(this.config);
      }

      return result;
    } catch (error) {
      console.error(`更新模型失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 删除模型
   */
  removeModel(modelId) {
    try {
      const result = this.modelRegistry.removeModel(modelId);

      if (result) {
        // 从配置中删除模型
        for (const provider of this.config.Providers) {
          provider.models = provider.models.filter(m => m.id !== modelId);
        }

        // 保存配置
        this.saveConfig(this.config);
      }

      return result;
    } catch (error) {
      console.error(`删除模型失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取适配器配置
   */
  getAdapterConfig() {
    try {
      const adapterIndexPath = path.join(__dirname, 'adapters', 'index.json');
      if (fs.existsSync(adapterIndexPath)) {
        return JSON.parse(fs.readFileSync(adapterIndexPath, 'utf8'));
      }
      return {
        enabled: true,
        defaultAdapter: 'openai-compatible',
        adapters: {},
        providerMapping: {}
      };
    } catch (error) {
      console.error(`获取适配器配置失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 保存适配器配置
   */
  saveAdapterConfig(adapterConfig) {
    try {
      const adapterIndexPath = path.join(__dirname, 'adapters', 'index.json');
      fs.writeFileSync(adapterIndexPath, JSON.stringify(adapterConfig, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`保存适配器配置失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新提供商的适配器映射
   */
  updateProviderAdapter(providerName, adapterName) {
    try {
      const adapterConfig = this.getAdapterConfig();
      if (!adapterConfig) return false;

      adapterConfig.providerMapping[providerName] = adapterName;

      // 同时更新主配置中的 provider adapter 字段
      for (const provider of this.config.Providers) {
        if (provider.name === providerName) {
          provider.adapter = adapterName;
          break;
        }
      }
      this.saveConfig(this.config);

      return this.saveAdapterConfig(adapterConfig);
    } catch (error) {
      console.error(`更新提供商适配器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取单个适配器配置
   */
  getAdapter(providerName) {
    try {
      const adapterConfig = this.getAdapterConfig();
      if (!adapterConfig) return null;

      const adapterName = adapterConfig.providerMapping[providerName] || adapterConfig.defaultAdapter;
      const adapterFile = adapterConfig.adapters[adapterName];

      if (adapterFile) {
        const adapterPath = path.join(__dirname, 'adapters', adapterFile);
        if (fs.existsSync(adapterPath)) {
          return JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
        }
      }
      return null;
    } catch (error) {
      console.error(`获取适配器失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取所有可用的适配器列表
   */
  getAvailableAdapters() {
    try {
      const adapterConfig = this.getAdapterConfig();
      if (!adapterConfig) return [];

      const adapters = [];
      const predefined = ['openai-compatible', 'anthropic-compatible', 'gemini', 'ollama'];

      // 1. 先添加预定义的适配器
      for (const [name, file] of Object.entries(adapterConfig.adapters)) {
        const adapterPath = path.join(__dirname, 'adapters', file);
        if (fs.existsSync(adapterPath)) {
          const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
          adapters.push({
            name,
            file,
            displayName: adapter.name || name,
            format: adapter.request?.format || 'unknown',
            isCustom: false
          });
        }
      }

      // 2. 扫描自定义适配器文件（直接放在 adapters 目录下的 JSON 文件）
      const adaptersDir = path.join(__dirname, 'adapters');
      if (fs.existsSync(adaptersDir)) {
        const files = fs.readdirSync(adaptersDir);
        for (const file of files) {
          if (file.endsWith('.json') && file !== 'index.json') {
            // 提取文件名作为适配器名称（去掉 .json 后缀）
            const name = file.replace('.json', '');

            // 如果不是预定义的适配器，则添加为自定义
            if (!predefined.includes(name) && !adapterConfig.adapters[name]) {
              try {
                const adapterPath = path.join(adaptersDir, file);
                const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
                adapters.push({
                  name,
                  file,
                  displayName: adapter.name || name,
                  format: adapter.request?.format || 'unknown',
                  isCustom: true
                });
              } catch (e) {
                // 忽略解析失败的 JSON 文件
              }
            }
          }
        }
      }

      return adapters;
    } catch (error) {
      console.error(`获取可用适配器失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 创建自定义适配器
   * @param {string} name - 适配器名称
   * @param {object} config - 适配器配置
   */
  createCustomAdapter(name, config) {
    try {
      const adapterPath = path.join(__dirname, 'adapters', `${name}.json`);
      fs.writeFileSync(adapterPath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`创建自定义适配器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 删除自定义适配器
   * @param {string} name - 适配器名称
   */
  deleteCustomAdapter(name) {
    try {
      const predefined = ['openai-compatible', 'anthropic-compatible', 'gemini', 'ollama'];
      if (predefined.includes(name)) {
        console.warn(`不能删除预定义适配器: ${name}`);
        return false;
      }

      const adapterPath = path.join(__dirname, 'adapters', `${name}.json`);
      if (fs.existsSync(adapterPath)) {
        fs.unlinkSync(adapterPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`删除自定义适配器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults() {
    const defaultConfig = this.getDefaultConfig();
    this.saveConfig(defaultConfig);

    // 重新初始化管理器
    this.selectionConfigManager = new SelectionConfigManager();
    this.modelRegistry = new ModelRegistry();
    // ModelRegistry 会自动从配置文件加载模型，无需手动调用 loadFromUnifiedConfig

    // 从默认配置加载规则
    this.selectionConfigManager.loadFromUnifiedConfig(defaultConfig);

    return true;
  }

  /**
   * 获取模型任务矩阵配置（转换为 UI 期望的格式）
   * @returns {Object} 包含 models, dimensions, weights 的对象
   */
  getModelTaskMatrix() {
    const matrix = this.config.model_task_matrix || {};
    const suitabilityMatrix = matrix.suitabilityMatrix || {};

    // 转换 suitabilityMatrix 为 UI 期望的格式
    // UI 期望: { models: [], dimensions: { category: { modelId: { value: score } } } }
    const models = Object.keys(suitabilityMatrix);
    const dimensions = {
      category: {},
      complexity: {},
      priority: {},
      quality: {},
      cost: {}
    };

    // 转换矩阵结构
    for (const modelId of models) {
      const modelData = suitabilityMatrix[modelId];
      for (const dim of ['category', 'complexity', 'priority', 'quality', 'cost']) {
        if (modelData[dim]) {
          dimensions[dim][modelId] = modelData[dim];
        } else {
          dimensions[dim][modelId] = {};
        }
      }
    }

    return {
      models,
      dimensions,
      weights: matrix.dimensionWeights || {
        category: 0.3,
        complexity: 0.25,
        priority: 0.2,
        quality: 0.15,
        cost: 0.1
      },
      dimensionValues: matrix.dimensionValues || {
        category: ['frontend', 'backend', 'infrastructure', 'security', 'quality', 'general'],
        complexity: ['low', 'medium', 'high'],
        priority: [0, 1, 2, 3, 4, 5],
        quality: ['low', 'medium', 'high'],
        cost: ['low', 'medium', 'high']
      }
    };
  }

  /**
   * 更新维度权重
   * @param {Object} weights - 新的权重配置
   * @returns {boolean} 是否成功
   */
  updateDimensionWeights(weights) {
    try {
      if (!this.config.model_task_matrix) {
        this.config.model_task_matrix = {};
      }
      this.config.model_task_matrix.dimensionWeights = weights;
      this.saveConfig(this.config);
      return true;
    } catch (error) {
      console.error(`更新维度权重失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新 suitability 矩阵
   * @param {Object} matrix - 新的 suitability 矩阵
   * @returns {boolean} 是否成功
   */
  updateSuitabilityMatrix(matrix) {
    try {
      if (!this.config.model_task_matrix) {
        this.config.model_task_matrix = {};
      }

      // 将 UI 格式转换为存储格式
      // UI 格式: { models: [], dimensions: { category: { modelId: { value: score } } } }
      // 存储格式: { suitabilityMatrix: { modelId: { category: { value: score } } } }
      const suitabilityMatrix = {};
      const { models, dimensions } = matrix;

      for (const modelId of models) {
        suitabilityMatrix[modelId] = {};
        for (const dim of ['category', 'complexity', 'priority', 'quality', 'cost']) {
          if (dimensions[dim] && dimensions[dim][modelId]) {
            suitabilityMatrix[modelId][dim] = dimensions[dim][modelId];
          } else {
            suitabilityMatrix[modelId][dim] = {};
          }
        }
      }

      this.config.model_task_matrix.suitabilityMatrix = suitabilityMatrix;
      this.saveConfig(this.config);
      return true;
    } catch (error) {
      console.error(`更新 suitability 矩阵失败: ${error.message}`);
      return false;
    }
  }
}

module.exports = ConfigService;