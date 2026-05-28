/**
 * ExecutorConfig - 执行器配置封装
 *
 * 封装配置对象，提供便捷的配置访问方法
 * 支持配置验证和转换
 *
 * @class ExecutorConfig
 */
class ExecutorConfig {
  /**
   * 创建执行器配置
   * @param {Object} rawConfig - 原始配置对象
   */
  constructor(rawConfig) {
    this.rawConfig = rawConfig;
    this.processedConfig = this.processConfig(rawConfig);
  }

  /**
   * 处理配置对象
   * @param {Object} rawConfig - 原始配置
   * @returns {Object} 处理后的配置
   */
  processConfig(rawConfig) {
    const executor = rawConfig.executor || {};

    return {
      // 通用配置
      general: {
        defaultMaxConcurrency: executor.general?.default_max_concurrency || 10,
        defaultTimeout: executor.general?.default_timeout || 60000,
        enableTracing: executor.general?.enable_tracing ?? true,
        enableMonitoring: executor.general?.enable_monitoring ?? true,
        logLevel: executor.general?.log_level || 'info'
      },

      // 并发配置
      concurrency: {
        maxConcurrent: executor.concurrency?.max_concurrent || 50,
        adaptive: executor.concurrency?.adaptive ?? true,
        timeoutMs: executor.concurrency?.timeout_ms || 30000,
        enablePriorityQueue: executor.concurrency?.enable_priority_queue ?? false
      },

      // 重试配置
      retry: {
        maxRetries: executor.retry?.max_retries || 3,
        baseDelay: executor.retry?.base_delay || 1000,
        maxDelay: executor.retry?.max_delay || 60000,
        exponentialBase: executor.retry?.exponential_base || 2.0,
        jitter: executor.retry?.jitter ?? true,
        timeout: executor.general?.default_timeout || 120000,  // 超时时间，从 general 读取
        retryableErrors: executor.retry?.retryable_errors || [
          'TimeoutError',
          'NetworkError',
          'RateLimitError',
          'ServerError',
          'ConnectionError'
        ]
      },

      // 限流配置
      rateLimit: {
        defaultRps: executor.rate_limit?.default_rps || 10,
        burstCapacity: executor.rate_limit?.burst_capacity || 30,
        enableCoordination: executor.rate_limit?.enable_coordination ?? true,
        healthCheckFactor: executor.rate_limit?.health_check_factor || 0.1,
        perModel: executor.rate_limit?.per_model || {}
      },

      // 成本控制配置
      costControl: {
        defaultBudget: executor.cost_control?.default_budget || 100.00,
        safetyMargin: executor.cost_control?.safety_margin || 0.2,
        conservativeEstimation: executor.cost_control?.conservative_estimation ?? true,
        enableRealTimeTracking: executor.cost_control?.enable_real_time_tracking ?? true
      },

      // 追踪配置
      tracing: {
        enabled: executor.tracing?.enabled ?? true,
        logLevel: executor.tracing?.log_level || 'info',
        includeSensitiveData: executor.tracing?.include_sensitive_data ?? false,
        samplingRate: executor.tracing?.sampling_rate ?? 1.0,
        maxTraces: executor.tracing?.max_traces || 10000
      },

      // 监控配置
      monitoring: {
        enabled: executor.monitoring?.enabled ?? true,
        metricsCollection: executor.monitoring?.metrics_collection ?? true,
        performanceLogging: executor.monitoring?.performance_logging ?? true,
        alertThresholds: {
          errorRate: executor.monitoring?.alert_thresholds?.error_rate || 0.05,
          responseTime: executor.monitoring?.alert_thresholds?.response_time || 5000,
          resourceUsage: executor.monitoring?.alert_thresholds?.resource_usage || 0.8
        }
      },

      // 模型特定配置
      modelSpecific: executor.model_specific || {},

      // 降级策略配置
      fallbackStrategy: {
        timeout: {
          enabled: executor.fallback_strategy?.timeout?.enabled ?? true,
          maxAttempts: executor.fallback_strategy?.timeout?.max_attempts || 3,
          timeoutPerAttempt: executor.fallback_strategy?.timeout?.timeout_per_attempt || 30000,
          backoffMultiplier: executor.fallback_strategy?.timeout?.backoff_multiplier || 1.5
        },
        budget: {
          enabled: executor.fallback_strategy?.budget?.enabled ?? true,
          maxCostReduction: executor.fallback_strategy?.budget?.max_cost_reduction || 0.5,
          alternativeSearchDepth: executor.fallback_strategy?.budget?.alternative_search_depth || 5
        },
        availability: {
          enabled: executor.fallback_strategy?.availability?.enabled ?? true,
          retryOnUnavailability: executor.fallback_strategy?.availability?.retry_on_unavailability ?? true,
          maxFallbackModels: executor.fallback_strategy?.availability?.max_fallback_models || 3
        },
        global: {
          maxTotalFallbacks: executor.fallback_strategy?.global?.max_total_fallbacks || 5,
          enableChainedFallbacks: executor.fallback_strategy?.global?.enable_chained_fallbacks ?? true,
          logLevel: executor.fallback_strategy?.global?.log_level || 'info'
        }
      },

      // 健康检查配置
      healthCheck: {
        interval: executor.health_check?.interval || 60000,
        timeout: executor.health_check?.timeout || 5000,
        enabled: executor.health_check?.enabled ?? true
      },

      // 系统协调器配置
      systemCoordinator: {
        cpuThresholdHigh: executor.system_coordinator?.cpu_threshold_high || 0.7,
        cpuThresholdCritical: executor.system_coordinator?.cpu_threshold_critical || 0.9,
        memoryThresholdHigh: executor.system_coordinator?.memory_threshold_high || 0.7,
        memoryThresholdCritical: executor.system_coordinator?.memory_threshold_critical || 0.9,
        checkInterval: executor.system_coordinator?.check_interval || 10000
      },

      // 修复机制配置
      repair: {
        enabled: executor.repair?.enabled ?? true,
        maxLocalRepairAttempts: executor.repair?.max_local_repair_attempts || 3,
        maxCloudRepairAttempts: executor.repair?.max_cloud_repair_attempts || 2,
        repairTimeout: executor.repair?.repair_timeout || 30000,
        localRepairDelay: executor.repair?.local_repair_delay || 1000,
        cloudRepairDelay: executor.repair?.cloud_repair_delay || 3000,
        enableAutoRepair: executor.repair?.enable_auto_repair ?? true,
        defaultRepairModel: executor.repair?.default_repair_model || 'claude-3-5-sonnet-20240620',
        errorClassification: {
          simpleErrorPatterns: executor.repair?.error_classification?.simple_error_patterns || [],
          moderateErrorPatterns: executor.repair?.error_classification?.moderate_error_patterns || [],
          complexErrorPatterns: executor.repair?.error_classification?.complex_error_patterns || []
        }
      }
    };
  }

  /**
   * 验证配置
   * @returns {boolean} 验证是否通过
   * @throws {Error} 如果配置无效
   */
  validate() {
    const config = this.processedConfig;

    // 验证并发配置
    if (config.concurrency.maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }
    if (config.concurrency.timeoutMs < 1000) {
      throw new Error('timeoutMs must be at least 1000ms');
    }

    // 验证重试配置
    if (config.retry.maxRetries < 0) {
      throw new Error('maxRetries must be non-negative');
    }
    if (config.retry.baseDelay < 0) {
      throw new Error('baseDelay must be non-negative');
    }
    if (config.retry.exponentialBase <= 1) {
      throw new Error('exponentialBase must be greater than 1');
    }

    // 验证限流配置
    if (config.rateLimit.defaultRps < 0) {
      throw new Error('defaultRps must be non-negative');
    }
    if (config.rateLimit.burstCapacity < 1) {
      throw new Error('burstCapacity must be at least 1');
    }

    // 验证成本控制配置
    if (config.costControl.defaultBudget < 0) {
      throw new Error('defaultBudget must be non-negative');
    }
    if (config.costControl.safetyMargin < 0 || config.costControl.safetyMargin > 1) {
      throw new Error('safetyMargin must be between 0 and 1');
    }

    // 验证追踪配置
    if (config.tracing.samplingRate < 0 || config.tracing.samplingRate > 1) {
      throw new Error('samplingRate must be between 0 and 1');
    }

    // 验证监控配置
    if (config.monitoring.alertThresholds.errorRate < 0 || config.monitoring.alertThresholds.errorRate > 1) {
      throw new Error('errorRate threshold must be between 0 and 1');
    }

    console.log('[ExecutorConfig] 配置验证通过');
    return true;
  }

  /**
   * 获取并发配置
   * @returns {Object} 并发配置
   */
  getConcurrencyConfig() {
    return this.processedConfig.concurrency;
  }

  /**
   * 获取重试配置
   * @returns {Object} 重试配置
   */
  getRetryConfig() {
    return this.processedConfig.retry;
  }

  /**
   * 获取限流配置
   * @returns {Object} 限流配置
   */
  getRateLimitConfig() {
    return this.processedConfig.rateLimit;
  }

  /**
   * 获取追踪配置
   * @returns {Object} 追踪配置
   */
  getTracingConfig() {
    return this.processedConfig.tracing;
  }

  /**
   * 获取监控配置
   * @returns {Object} 监控配置
   */
  getMonitoringConfig() {
    return this.processedConfig.monitoring;
  }

  /**
   * 获取成本控制配置
   * @returns {Object} 成本控制配置
   */
  getCostControlConfig() {
    return this.processedConfig.costControl;
  }

  /**
   * 获取降级策略配置
   * @returns {Object} 降级策略配置
   */
  getFallbackStrategyConfig() {
    return this.processedConfig.fallbackStrategy;
  }

  /**
   * 获取健康检查配置
   * @returns {Object} 健康检查配置
   */
  getHealthCheckConfig() {
    return this.processedConfig.healthCheck;
  }

  /**
   * 获取系统协调器配置
   * @returns {Object} 系统协调器配置
   */
  getSystemCoordinatorConfig() {
    return this.processedConfig.systemCoordinator;
  }

  /**
   * 获取模型特定配置
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型特定配置
   */
  getModelConfig(modelId) {
    const modelSpecific = this.processedConfig.modelSpecific || {};
    const modelConfig = modelSpecific[modelId];

    if (!modelConfig) {
      // 返回默认配置
      return {
        concurrency: {
          maxConcurrent: this.processedConfig.concurrency.maxConcurrent,
          timeoutMs: this.processedConfig.general.defaultTimeout
        },
        retry: {
          maxRetries: this.processedConfig.retry.maxRetries,
          timeout: this.processedConfig.retry.timeout
        },
        rateLimit: {
          requestsPerSecond: this.processedConfig.rateLimit.defaultRps,
          burstCapacity: this.processedConfig.rateLimit.burstCapacity
        },
        preferred: false
      };
    }

    return {
      concurrency: {
        maxConcurrent: modelConfig.max_concurrency || this.processedConfig.concurrency.maxConcurrent,
        timeoutMs: modelConfig.timeout || this.processedConfig.general.defaultTimeout
      },
      retry: {
        maxRetries: modelConfig.retry_attempts || this.processedConfig.retry.maxRetries,
        timeout: this.processedConfig.retry.timeout
      },
      rateLimit: {
        requestsPerSecond: modelConfig.rate_limit?.requests_per_second || this.processedConfig.rateLimit.defaultRps,
        burstCapacity: modelConfig.rate_limit?.burst_capacity || this.processedConfig.rateLimit.burstCapacity
      },
      preferred: modelConfig.preferred ?? false
    };
  }

  /**
   * 获取 HTTP 配置
   * @returns {Object} HTTP 配置
   */
  getHttpConfig() {
    return {
      timeout: this.processedConfig.general.defaultTimeout,
      retries: this.processedConfig.retry.maxRetries
    };
  }

  /**
   * 获取原始配置
   * @returns {Object} 原始配置对象
   */
  getRawConfig() {
    return this.rawConfig;
  }

  /**
   * 获取处理后的配置
   * @returns {Object} 处理后的配置
   */
  getProcessedConfig() {
    return this.processedConfig;
  }

  /**
   * 获取修复机制配置
   * @returns {Object} 修复机制配置
   */
  getRepairConfig() {
    return this.processedConfig.repair;
  }
}

module.exports = { ExecutorConfig };
