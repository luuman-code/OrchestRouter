/**
 * ExecutorFactory - 执行器工厂
 *
 * 提供创建配置好执行器的便捷方法
 * 支持多种环境配置
 *
 * @class ExecutorFactory
 */

// 延迟加载 ExecutorConfigLoader，打破循环依赖
let ExecutorConfigLoader;
let ExecutorConfig;

function getExecutorConfigLoader() {
  if (!ExecutorConfigLoader) {
    ExecutorConfigLoader = require('./ExecutorConfigLoader').ExecutorConfigLoader;
  }
  return ExecutorConfigLoader;
}

function getExecutorConfig() {
  if (!ExecutorConfig) {
    ExecutorConfig = require('./ExecutorConfig').ExecutorConfig;
  }
  return ExecutorConfig;
}

// 延迟加载执行器类，打破循环依赖
function getExecutorClasses() {
  const executorModule = require('../index');
  return {
    ConcurrentExecutor: executorModule.EnhancedConcurrentExecutor || executorModule.ConcurrentExecutor,
    EnhancedConcurrentExecutor: executorModule.EnhancedConcurrentExecutor,
    ModelAwareConcurrentExecutor: executorModule.ModelAwareConcurrentExecutor,
    FullyEnhancedConcurrentExecutor: executorModule.FullyEnhancedConcurrentExecutor
  };
}

class ExecutorFactory {
  /**
   * 创建默认配置的执行器
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<ConcurrentExecutor>} 配置好的执行器
   */
  static async createExecutor(configPath = './config/executor.yaml', options = {}) {
    try {
      // 1. 加载配置（延迟加载）
      const ConfigLoader = getExecutorConfigLoader();
      const ConfigClass = getExecutorConfig();
      const Executors = getExecutorClasses();

      const configLoader = new ConfigLoader(configPath);
      const rawConfig = await configLoader.loadConfig();
      const config = new ConfigClass(rawConfig);

      // 2. 验证配置
      config.validate();

      // 3. 构建执行器选项
      const executorOptions = this.buildExecutorOptions(config, options);

      // 4. 创建执行器实例
      const executor = new Executors.ConcurrentExecutor(executorOptions);

      // 5. 保存配置引用以便后续访问
      executor.config = config;
      executor.configLoader = configLoader;

      console.log('[ExecutorFactory] 执行器创建成功');
      return executor;
    } catch (error) {
      console.error('[ExecutorFactory] 创建执行器失败:', error.message);
      throw error;
    }
  }

  /**
   * 构建执行器选项
   * @param {ExecutorConfig} config - 配置对象
   * @param {Object} options - 额外选项
   * @returns {Object} 执行器选项
   */
  static buildExecutorOptions(config, options = {}) {
    const processedConfig = config.getProcessedConfig();

    return {
      // HTTP 配置
      requestConfig: {
        timeout: processedConfig.general.defaultTimeout,
        retries: processedConfig.retry.maxRetries,
        ...options.requestConfig
      },

      // 重试配置
      retryConfig: {
        maxRetries: processedConfig.retry.maxRetries,
        baseDelay: processedConfig.retry.baseDelay,
        maxDelay: processedConfig.retry.maxDelay,
        exponentialBase: processedConfig.retry.exponentialBase,
        jitter: processedConfig.retry.jitter,
        retryableErrors: processedConfig.retry.retryableErrors,
        ...options.retryConfig
      },

      // 限流配置
      rateLimitConfig: {
        defaultRps: processedConfig.rateLimit.defaultRps,
        defaultBurst: processedConfig.rateLimit.burstCapacity,
        perModel: processedConfig.rateLimit.perModel,
        ...options.rateLimitConfig
      },

      // 追踪配置
      tracingConfig: {
        enabled: processedConfig.tracing.enabled,
        maxTraces: processedConfig.tracing.maxTraces,
        samplingRate: processedConfig.tracing.samplingRate,
        samplingEnabled: processedConfig.tracing.samplingRate < 1.0,
        ...options.tracingConfig
      },

      // 监控配置
      monitoringConfig: {
        enabled: processedConfig.monitoring.enabled,
        windowSize: options.windowSize || 1000,
        ...options.monitoringConfig
      },

      // Fallback 策略配置
      fallback: {
        enabled: processedConfig.fallbackStrategy?.global?.enabled !== false,
        strategy: {
          timeout: processedConfig.fallbackStrategy?.timeout || { enabled: true, maxAttempts: 3, timeoutPerAttempt: 30000 },
          budget: processedConfig.fallbackStrategy?.budget || { enabled: true, maxCostReduction: 0.5 },
          availability: processedConfig.fallbackStrategy?.availability || { enabled: true, retryOnUnavailability: true, maxFallbackModels: 3 }
        }
      },

      // 并发配置
      concurrencyConfig: {
        maxConcurrent: processedConfig.concurrency.maxConcurrent,
        adaptive: processedConfig.concurrency.adaptive,
        timeoutMs: processedConfig.concurrency.timeoutMs,
        ...options.concurrencyConfig
      },

      // 成本控制配置
      costControlConfig: {
        defaultBudget: processedConfig.costControl.defaultBudget,
        safetyMargin: processedConfig.costControl.safetyMargin,
        conservativeEstimation: processedConfig.costControl.conservativeEstimation,
        ...options.costControlConfig
      },

      // 健康检查配置
      healthCheckInterval: processedConfig.healthCheck?.interval || 60000,

      // 共享组件（从外部注入）
      modelRegistry: options.modelRegistry,
      costController: options.costController,
      statusMonitor: options.statusMonitor,

      // 其他选项
      ...options
    };
  }

  /**
   * 创建开发环境执行器
   * @param {Object} options - 额外选项
   * @returns {Promise<ConcurrentExecutor>} 开发环境执行器
   */
  static async createDevelopmentExecutor(options = {}) {
    const devOptions = {
      // 开发环境配置
      requestConfig: {
        timeout: 180000, // 更长的超时（180秒）
        debug: true
      },
      retryConfig: {
        maxRetries: 1, // 较少重试
        baseDelay: 500
      },
      monitoringConfig: {
        windowSize: 100 // 较小的窗口
      },
      ...options
    };

    // 尝试加载开发环境配置
    let configPath = './config/development.yaml';
    try {
      return await this.createExecutor(configPath, devOptions);
    } catch (error) {
      // 如果开发环境配置不存在，使用默认配置
      console.log('[ExecutorFactory] 开发环境配置不存在，使用默认配置');
      return await this.createExecutor('./config/executor.yaml', devOptions);
    }
  }

  /**
   * 创建生产环境执行器
   * @param {Object} options - 额外选项
   * @returns {Promise<ConcurrentExecutor>} 生产环境执行器
   */
  static async createProductionExecutor(options = {}) {
    const prodOptions = {
      // 生产环境配置
      requestConfig: {
        timeout: 60000,
        debug: false
      },
      retryConfig: {
        maxRetries: 5, // 更多重试
        baseDelay: 1000
      },
      monitoringConfig: {
        windowSize: 10000 // 较大的窗口
      },
      ...options
    };

    // 尝试加载生产环境配置
    let configPath = './config/production.yaml';
    try {
      return await this.createExecutor(configPath, prodOptions);
    } catch (error) {
      // 如果生产环境配置不存在，使用默认配置
      console.log('[ExecutorFactory] 生产环境配置不存在，使用默认配置');
      return await this.createExecutor('./config/executor.yaml', prodOptions);
    }
  }

  /**
   * 创建测试环境执行器
   * @param {Object} options - 额外选项
   * @returns {Promise<ConcurrentExecutor>} 测试环境执行器
   */
  static async createTestExecutor(options = {}) {
    const testOptions = {
      // 测试环境配置
      requestConfig: {
        timeout: 30000,
        debug: true
      },
      retryConfig: {
        maxRetries: 0, // 测试环境不重试
        baseDelay: 100
      },
      tracingConfig: {
        enabled: true,
        maxTraces: 1000
      },
      monitoringConfig: {
        windowSize: 100
      },
      ...options
    };

    // 尝试加载测试环境配置
    let configPath = './config/test.yaml';
    try {
      return await this.createExecutor(configPath, testOptions);
    } catch (error) {
      // 如果测试环境配置不存在，使用默认配置
      console.log('[ExecutorFactory] 测试环境配置不存在，使用默认配置');
      return await this.createExecutor('./config/executor.yaml', testOptions);
    }
  }

  /**
   * 从配置创建执行器选项（不创建执行器实例）
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 执行器选项
   */
  static async createExecutorOptions(configPath = './config/executor.yaml', options = {}) {
    const configLoader = new (getExecutorConfigLoader())(configPath);
    const rawConfig = await configLoader.loadConfig();
    const config = new (getExecutorConfig())(rawConfig);

    config.validate();

    return this.buildExecutorOptions(config, options);
  }

  /**
   * 创建配置对象（不创建执行器）
   * @param {string} configPath - 配置文件路径
   * @returns {Promise<ExecutorConfig>} 配置对象
   */
  static async createConfig(configPath = './config/executor.yaml') {
    const configLoader = new (getExecutorConfigLoader())(configPath);
    const rawConfig = await configLoader.loadConfig();
    const config = new (getExecutorConfig())(rawConfig);

    config.validate();

    return config;
  }

  /**
   * 创建配置加载器
   * @param {string} configPath - 配置文件路径
   * @returns {ExecutorConfigLoader} 配置加载器
   */
  static createConfigLoader(configPath = './config/executor.yaml') {
    return new (getExecutorConfigLoader())(configPath);
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  static getDefaultConfig() {
    return {
      executor: {
        general: {
          default_max_concurrency: 10,
          default_timeout: 60000,
          enable_tracing: true,
          enable_monitoring: true,
          log_level: 'info'
        },
        concurrency: {
          max_concurrent: 20,
          adaptive: true,
          timeout_ms: 30000,
          enable_priority_queue: false
        },
        retry: {
          max_retries: 3,
          base_delay: 1000,
          max_delay: 60000,
          exponential_base: 2.0,
          jitter: true
        },
        rate_limit: {
          default_rps: 10,
          burst_capacity: 30,
          enable_coordination: true,
          health_check_factor: 0.1
        },
        cost_control: {
          default_budget: 100.00,
          safety_margin: 0.2,
          conservative_estimation: true,
          enable_real_time_tracking: true
        },
        tracing: {
          enabled: true,
          log_level: 'info',
          include_sensitive_data: false,
          sampling_rate: 1.0,
          max_traces: 10000
        },
        monitoring: {
          enabled: true,
          metrics_collection: true,
          performance_logging: true,
          alert_thresholds: {
            error_rate: 0.05,
            response_time: 5000,
            resource_usage: 0.8
          }
        }
      }
    };
  }

  /**
   * 创建增强的并发执行器
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<EnhancedConcurrentExecutor>} 增强的并发执行器
   */
  static async createEnhancedExecutor(configPath = './config/executor.yaml', options = {}) {
    try {
      const configLoader = new (getExecutorConfigLoader())(configPath);
      const rawConfig = await configLoader.loadConfig();
      const config = new (getExecutorConfig())(rawConfig);

      config.validate();

      const executorOptions = this.buildExecutorOptions(config, options);
      const Executors = getExecutorClasses();
      const executor = new Executors.EnhancedConcurrentExecutor(executorOptions);

      executor.config = config;
      executor.configLoader = configLoader;

      console.log('[ExecutorFactory] 增强的并发执行器创建成功');
      return executor;
    } catch (error) {
      console.error('[ExecutorFactory] 创建增强的并发执行器失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建模型感知的并发执行器
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<ModelAwareConcurrentExecutor>} 模型感知的并发执行器
   */
  static async createModelAwareExecutor(configPath = './config/executor.yaml', options = {}) {
    try {
      const configLoader = new (getExecutorConfigLoader())(configPath);
      const rawConfig = await configLoader.loadConfig();
      const config = new (getExecutorConfig())(rawConfig);

      config.validate();

      const executorOptions = this.buildExecutorOptions(config, options);
      const Executors = getExecutorClasses();
      const executor = new Executors.ModelAwareConcurrentExecutor(executorOptions);

      executor.config = config;
      executor.configLoader = configLoader;

      console.log('[ExecutorFactory] 模型感知的并发执行器创建成功');
      return executor;
    } catch (error) {
      console.error('[ExecutorFactory] 创建模型感知的并发执行器失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建全面增强的并发执行器
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<FullyEnhancedConcurrentExecutor>} 全面增强的并发执行器
   */
  static async createFullyEnhancedExecutor(configPath = './config/executor.yaml', options = {}) {
    try {
      const configLoader = new (getExecutorConfigLoader())(configPath);
      const rawConfig = await configLoader.loadConfig();
      const config = new (getExecutorConfig())(rawConfig);

      config.validate();

      const executorOptions = this.buildExecutorOptions(config, options);
      const Executors = getExecutorClasses();
      const executor = new Executors.FullyEnhancedConcurrentExecutor(executorOptions);

      executor.config = config;
      executor.configLoader = configLoader;

      console.log('[ExecutorFactory] 全面增强的并发执行器创建成功');
      return executor;
    } catch (error) {
      console.error('[ExecutorFactory] 创建全面增强的并发执行器失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据类型创建执行器
   * @param {string} type - 执行器类型 ('basic', 'enhanced', 'model-aware', 'fully-enhanced', 'traced')
   * @param {string} configPath - 配置文件路径
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 对应类型的执行器
   */
  static async createExecutorByType(type, configPath = './config/executor.yaml', options = {}) {
    switch (type.toLowerCase()) {
      case 'basic':
      case 'concurrent':
        return await this.createExecutor(configPath, options);
      case 'enhanced':
        return await this.createEnhancedExecutor(configPath, options);
      case 'model-aware':
        return await this.createModelAwareExecutor(configPath, options);
      case 'fully-enhanced':
        return await this.createFullyEnhancedExecutor(configPath, options);
      case 'traced':
        // TracedExecutor is a subclass of ConcurrentExecutor with additional tracing
        const basicExecutor = await this.createExecutor(configPath, options);
        // We'd need to extend or modify to return a traced version
        return basicExecutor;
      default:
        throw new Error(`Unknown executor type: ${type}. Supported types: basic, enhanced, model-aware, fully-enhanced, traced`);
    }
  }
}

module.exports = { ExecutorFactory };
