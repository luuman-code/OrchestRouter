/**
 * RetryManager - 重试管理器
 *
 * 负责处理请求重试、超时处理、错误隔离
 * 实现指数退避、 jitter 等重试策略
 * 支持基于幂等性的重试策略
 * 集成熔断器和错误处理器
 *
 * @class RetryManager
 */
class RetryManager {
  /**
   * 创建重试管理器
   * @param {Object} config - 重试配置
   * @param {number} config.maxRetries - 最大重试次数
   * @param {number} config.baseDelay - 基础延迟时间（毫秒）
   * @param {number} config.maxDelay - 最大延迟时间（毫秒）
   * @param {number} config.timeout - 超时时间（毫秒）
   * @param {boolean} config.useJitter - 是否使用抖动
   * @param {Array} config.retryableErrors - 可重试的错误类型
   * @param {Object} config.baseDelaysByErrorType - 错误类型对应的基延迟配置
   * @param {Object} config.taskTypeConfig - 任务类型配置
   */
  constructor(config = {}) {
    this.maxRetries = config.maxRetries || 3;
    this.baseDelay = config.baseDelay || 1000; // 1 秒
    this.maxDelay = config.maxDelay || 60000; // 60 秒
    this.exponentialBase = config.exponentialBase || 2.0;
    this.jitter = config.jitter || true;
    this.retryableErrors = config.retryableErrors || [
      'TimeoutError',
      'NetworkError',
      'RateLimitError',
      'ServerError',
      'EmptyResponseError'
    ];
    // 新增：错误类型对应的基延迟配置，用于差异化延迟策略
    this.baseDelaysByErrorType = config.baseDelaysByErrorType || {
      'NETWORK_ERROR': 1000,
      'RATE_LIMIT': 5000,  // 更长，因为需要等待限流窗口恢复
      'SERVER_ERROR': 2000,
      'TIMEOUT': 1000
    };
    // 新增：任务类型配置，包含幂等性配置
    this.taskTypeConfig = config.taskTypeConfig || this.getDefaultTaskTypeConfig();

    this.errorStats = new Map(); // 错误统计

    // 【修改】集成按模型隔离的熔断器
    // this.circuitBreaker 改为 this.circuitBreakers Map
    if (config.circuitBreaker) {
      // 兼容：如果是单个熔断器，转换为 Map（默认使用 "default" 键）
      this.circuitBreakers = new Map([['default', config.circuitBreaker]]);
    } else {
      this.circuitBreakers = new Map();
    }

    // 熔断器配置（用于创建新的按模型熔断器）
    this.circuitBreakerConfig = config.circuitBreakerConfig || {
      failureThreshold: 20,  // 触发熔断的失败次数阈值
      timeout: 60000,        // 熔断后保持OPEN状态的时间
      resetTimeout: 30000,   // 熔断恢复后等待的试探时间
      successThreshold: 1,   // 半开状态下连续成功的最小数量
      halfOpenInterval: 1000 // 半开状态下探测间隔
    };

    // 集成错误处理器
    this.errorHandler = config.errorHandler || null;

    // 如果没有传入错误处理器，动态导入
    if (!this.errorHandler) {
      try {
        this.errorHandler = require('./ErrorHandler');
      } catch (e) {
        // 创建一个简单的错误处理器
        this.errorHandler = {
          createStandardizedError: (error, context) => {
            if (typeof error === 'string') {
              error = new Error(error);
            }
            const errorCategory = this._getDefaultErrorCategory(error);
            return {
              originalError: error,
              message: error.message || 'Unknown error',
              stack: error.stack,
              code: error.code,
              status: error.status,
              category: errorCategory,
              isRetriable: ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'RATE_LIMIT'].includes(errorCategory),
              context,
              timestamp: Date.now()
            };
          },
          formatError: (standardizedError) => {
            const { message, category, context, timestamp } = standardizedError;
            const timestampStr = new Date(timestamp).toISOString();
            return `[${timestampStr}] ${context ? context + ': ' : ''}${message} (Category: ${category})`;
          },
          _getDefaultErrorCategory: this._getDefaultErrorCategory.bind(this)
        };
      }
    }
  }

  /**
   * 获取或创建指定模型的熔断器
   * @param {string} modelId - 模型 ID
   * @returns {CircuitBreaker} 熔断器实例
   */
  getCircuitBreakerForModel(modelId) {
    if (!modelId) {
      // 如果没有 modelId，使用默认熔断器
      if (!this.circuitBreakers.has('default')) {
        const CircuitBreaker = require('./CircuitBreaker');
        this.circuitBreakers.set('default', new CircuitBreaker(this.circuitBreakerConfig));
      }
      return this.circuitBreakers.get('default');
    }

    if (!this.circuitBreakers.has(modelId)) {
      // 为新模型创建独立的熔断器
      const CircuitBreaker = require('./CircuitBreaker');
      const modelCircuitBreaker = new CircuitBreaker({
        ...this.circuitBreakerConfig,
        // 可以根据模型动态调整配置，例如：
        // failureThreshold: this.getModelSpecificThreshold(modelId)
      });
      this.circuitBreakers.set(modelId, modelCircuitBreaker);
      console.log(`[RetryManager] 为模型 ${modelId} 创建新的熔断器实例`);
    }

    return this.circuitBreakers.get(modelId);
  }

  /**
   * 获取所有模型的熔断器状态
   * @returns {Object} 各模型的熔断器状态
   */
  getCircuitBreakersState() {
    const state = {};
    for (const [modelId, cb] of this.circuitBreakers.entries()) {
      state[modelId] = cb.getStateInfo();
    }
    return state;
  }

  /**
   * 强制重置指定模型的熔断器
   * @param {string} modelId - 模型 ID（可选，不提供则重置默认熔断器）
   */
  resetCircuitBreaker(modelId = 'default') {
    const cb = this.circuitBreakers.get(modelId);
    if (cb) {
      cb.forceReset();
      console.log(`[RetryManager] 已重置模型 ${modelId} 的熔断器`);
    }
  }

  /**
   * 默认错误分类方法（用于降级）
   * @param {Error} error - 错误对象
   * @returns {string} 错误类别
   */
  _getDefaultErrorCategory(error) {
    if (!error) {
      return 'UNKNOWN';
    }

    if (error.status === 429) {
      return 'RATE_LIMIT';
    } else if (error.status >= 500) {
      return 'SERVER_ERROR';
    } else if (error.status >= 400 && error.status < 500) {
      return 'CLIENT_ERROR';
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('超时')) {
      return 'TIMEOUT';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
               error.code === 'ECONNRESET' || error.code === 'EAI_AGAIN' ||
               error.message.includes('network') || error.message.includes('connection')) {
      return 'NETWORK_ERROR';
    } else if (error.message.includes('validation failed') ||
               error.message.includes('Invalid ') ||
               error.message.includes('response validation') ||
               error.message.includes('validation')) {
      return 'VALIDATION_ERROR';
    }

    return 'UNKNOWN';
  }

  getDefaultTaskTypeConfig() {
    // 不同任务类型有不同的重试策略和幂等性配置
    return {
      "query": {  // 查询操作 - 幂等，可以重试
        allowRetry: true,
        idempotent: true,
        maxRetries: 3
      },
      "read": {   // 读取操作 - 幂等，可以重试
        allowRetry: true,
        idempotent: true,
        maxRetries: 2
      },
      "write": {  // 写入操作 - 非幂等，需谨慎重试
        allowRetry: false,  // 默认不允许
        idempotent: false,  // 默认非幂等
        maxRetries: 0
      },
      "update": { // 更新操作 - 非幂等，需谨慎重试
        allowRetry: false,  // 默认不允许
        idempotent: false,  // 默认非幂等
        maxRetries: 0
      },
      "delete": { // 删除操作 - 非幂等，需谨慎重试
        allowRetry: false,  // 默认不允许
        idempotent: false,  // 默认非幂等
        maxRetries: 0
      },
      "conditional_update": { // 条件更新 - 幂等，可重试
        allowRetry: true,
        idempotent: true,
        maxRetries: 2
      },
      "api_call": { // 一般API调用
        allowRetry: true,
        idempotent: false, // 默认非幂等，用户可自定义
        maxRetries: 2
      }
    };
  }

  /**
   * 执行带重试的操作
   * 支持新旧两种API：兼容旧版(context: {context: '...'}) 和新版(context: {taskType: '...', ...})
   * 集成熔断器和错误处理器
   * @param {Function} operation - 要执行的操作（返回 Promise）
   * @param {Object} context - 操作上下文
   * @param {string} context.taskType - 任务类型 (query, read, write, etc.)
   * @param {string} context.taskId - 任务ID
   * @param {boolean} context.idempotent - 操作是否幂等（可覆盖任务类型配置）
   * @param {string} context.context - 操作上下文（用于日志，用于旧版API兼容）
   * @returns {Promise<any>} 操作结果
   */
  async executeWithRetry(operation, context = {}) {
    // 【修改】如果有熔断器（Map），使用按模型隔离的熔断器执行操作
    if (this.circuitBreakers && this.circuitBreakers.size > 0) {
      // 兼容旧版API: 如果context只有context字段，使用默认配置
      if (context && typeof context === 'object' && Object.keys(context).length === 1 && context.context) {
        // 这是旧版API用法，使用旧版逻辑
        return await this._executeWithRetryLegacy(operation, context);
      }

      // 【修改】获取对应模型的熔断器
      const modelId = context.modelId;
      const circuitBreaker = this.getCircuitBreakerForModel(modelId);

      // 新版API用法，结合熔断器
      return await circuitBreaker.execute(async () => {
        let lastError = null;
        const taskType = context.taskType || "api_call";
        const idempotentOverride = context.idempotent; // 用户可以通过上下文指定操作是否幂等
        const taskContext = context.context || 'operation'; // 兼容旧版的日志输出

        // 获取任务类型配置
        const taskConfig = this.taskTypeConfig[taskType];
        const maxRetriesForTask = this.getMaxRetriesForTask(taskType);

        // 检查任务类型是否允许重试，但如果上下文明确指定了该操作幂等，则允许重试
        const isTaskRetryable = this.isTaskTypeRetryable(taskType);
        const isOperationIdempotent = idempotentOverride !== undefined ? idempotentOverride :
                                      (taskConfig && taskConfig.idempotent) || false;

        // 如果任务类型不允许重试，且操作不是幂等的，则不进行重试
        if (!isTaskRetryable && !isOperationIdempotent) {
          try {
            return await operation();
          } catch (error) {
            // 记录错误
            this.recordError(error);

            // 使用错误处理器处理错误
            const standardizedError = this.errorHandler.createStandardizedError(error, taskContext);
            console.error(this.errorHandler.formatError(standardizedError));

            throw error; // 不重试，直接抛出错误
          }
        }

        for (let attempt = 0; attempt <= maxRetriesForTask; attempt++) {
          try {
            return await operation();
          } catch (error) {
            lastError = error;

            // 记录错误
            this.recordError(error);

            // 使用错误处理器处理错误
            const standardizedError = this.errorHandler.createStandardizedError(error, taskContext);
            console.error(this.errorHandler.formatError(standardizedError));

            // 如果是最后一次尝试或不应该重试，则抛出错误
            if (attempt === maxRetriesForTask || !this.shouldRetry(error, attempt, context)) {
              throw error;
            }

            const delay = this.calculateDelay(attempt, error);
            console.log(`Task ${context.taskId || "unknown"} (${taskType}) Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);

            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        throw lastError;
      }, context);
    } else {
      // 兼容旧版API: 如果context只有context字段，使用默认配置
      if (context && typeof context === 'object' && Object.keys(context).length === 1 && context.context) {
        // 这是旧版API用法，使用旧版逻辑
        return await this._executeWithRetryLegacy(operation, context);
      }

      // 新版API用法
      let lastError = null;
      const taskType = context.taskType || "api_call";
      const idempotentOverride = context.idempotent; // 用户可以通过上下文指定操作是否幂等
      const taskContext = context.context || 'operation'; // 兼容旧版的日志输出

      // 获取任务类型配置
      const taskConfig = this.taskTypeConfig[taskType];
      const maxRetriesForTask = this.getMaxRetriesForTask(taskType);

      // 检查任务类型是否允许重试，但如果上下文明确指定了该操作幂等，则允许重试
      const isTaskRetryable = this.isTaskTypeRetryable(taskType);
      const isOperationIdempotent = idempotentOverride !== undefined ? idempotentOverride :
                                    (taskConfig && taskConfig.idempotent) || false;

      // 如果任务类型不允许重试，且操作不是幂等的，则不进行重试
      if (!isTaskRetryable && !isOperationIdempotent) {
        try {
          return await operation();
        } catch (error) {
          // 记录错误
          this.recordError(error);

          // 使用错误处理器处理错误
          const standardizedError = this.errorHandler.createStandardizedError(error, taskContext);
          console.error(this.errorHandler.formatError(standardizedError));

          throw error; // 不重试，直接抛出错误
        }
      }

      for (let attempt = 0; attempt <= maxRetriesForTask; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;

          // 记录错误
          this.recordError(error);

          // 使用错误处理器处理错误
          const standardizedError = this.errorHandler.createStandardizedError(error, taskContext);
          console.error(this.errorHandler.formatError(standardizedError));

          // 如果是最后一次尝试或不应该重试，则抛出错误
          if (attempt === maxRetriesForTask || !this.shouldRetry(error, attempt, context)) {
            throw error;
          }

          const delay = this.calculateDelay(attempt, error);
          console.log(`Task ${context.taskId || "unknown"} (${taskType}) Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError;
    }
  }

  /**
   * 旧版重试逻辑（用于向后兼容）
   * @private
   */
  async _executeWithRetryLegacy(operation, context = {}) {
    const { context: ctx = 'operation' } = context;
    let lastError;
    let retryCount = 0;

    while (retryCount <= this.maxRetries) {
      try {
        const result = await operation(); // 移除超时包装以保持原逻辑
        if (retryCount > 0) {
          console.log(`[RetryManager] ${ctx} 重试成功，重试次数：${retryCount}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        retryCount++;

        // 记录错误
        this.recordError(error);

        // 判断是否可重试
        if (!this.isRetryableError(error) || retryCount > this.maxRetries) {
          console.error(`[RetryManager] ${ctx} 失败，不可重试或已达最大重试次数：${error.message}`);
          break;
        }

        // 计算延迟时间（使用旧版逻辑）
        const delay = this._calculateDelayLegacy(retryCount);
        console.log(`[RetryManager] ${ctx} 失败，${delay}ms 后重试（第 ${retryCount}/${this.maxRetries} 次）：${error.message}`);

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 所有重试都失败
    throw new Error(`${ctx} 失败（重试 ${retryCount - 1} 次后仍失败）：${lastError.message}`);
  }

  /**
   * 旧版延迟计算逻辑（用于向后兼容）
   * @private
   */
  _calculateDelayLegacy(retryCount) {
    // 指数退避
    const exponentialDelay = this.baseDelay * Math.pow(2, retryCount - 1);
    const delay = Math.min(exponentialDelay, this.maxDelay);

    // 添加 jitter（0-1 之间的随机因子）
    if (this.jitter) {
      const jitter = 0.5 + Math.random() * 0.5; // 0.5-1.0
      return Math.floor(delay * jitter);
    }

    return Math.floor(delay);
  }

  isTaskTypeRetryable(taskType) {
    const taskConfig = this.taskTypeConfig[taskType];
    return taskConfig && taskConfig.allowRetry !== false;
  }

  getMaxRetriesForTask(taskType) {
    const config = this.taskTypeConfig[taskType];
    if (config && config.maxRetries !== undefined) {
      return config.maxRetries;
    }
    return this.maxRetries;
  }

  shouldRetry(error, attempt, context = {}) {
    const taskType = context.taskType || "api_call";
    const idempotentOverride = context.idempotent; // 用户可以通过上下文指定操作是否幂等

    // 获取任务类型配置
    const taskConfig = this.taskTypeConfig[taskType];
    const isOperationIdempotent = idempotentOverride !== undefined ? idempotentOverride :
                                  (taskConfig && taskConfig.idempotent) || false;

    // 检查错误类型是否可重试（检查错误构造函数名、错误代码、错误消息）
    const isErrorRetryable = this.retryableErrors.some(retryableError =>
      error.constructor.name.includes(retryableError) ||
      (error.code && error.code.includes(retryableError)) ||
      error.message.includes(retryableError.toLowerCase())
    );

    // 超时错误不重试，直接让调用方处理备选模型切换
    if (error.timeoutStage || error.errorCategory === 'TIMEOUT' || (error.code && error.code === 'ETIMEDOUT')) {
      console.log(`[RetryManager] 超时错误不重试，触发备选模型切换`);
      return false;
    }

    // 如果操作是幂等的，允许重试，否则还需要检查任务类型的配置
    if (isOperationIdempotent) {
      return isErrorRetryable;
    }

    // 检查是否需要根据任务类型禁用重试
    if (taskConfig && taskConfig.allowRetry === false) {
      return false; // 即使错误类型可重试，也不允许此类型任务重试
    }

    return isErrorRetryable;
  }

  /**
   * 根据超时阶段决定是否重试
   * 连接超时：通常值得重试
   * 发送超时：适度重试
   * 读取超时：谨慎重试，可能服务端已在处理
   */
  shouldRetryByTimeoutStage(error, attempt) {
    const maxRetriesForConnect = this.maxRetries; // 连接超时使用标准重试次数
    const maxRetriesForSend = Math.ceil(this.maxRetries * 0.7); // 发送超时减少重试
    const maxRetriesForRead = Math.ceil(this.maxRetries * 0.4); // 读取超时大幅减少重试

    switch (error.timeoutStage) {
      case 'connect':
        return attempt < maxRetriesForConnect;

      case 'send_headers':
      case 'send_body':
        return attempt < maxRetriesForSend;

      case 'read_headers':
      case 'read_body':
        return attempt < maxRetriesForRead;

      default:
        // 对于未分类的超时，使用保守策略
        return attempt < Math.ceil(this.maxRetries * 0.6);
    }
  }

  calculateDelay(attempt, error) {
    // 根据错误类型确定基础延迟
    let baseDelay = this.baseDelay;
    if (error) {
      const errorCategory = this.getErrorCategory(error);
      if (this.baseDelaysByErrorType[errorCategory]) {
        baseDelay = this.baseDelaysByErrorType[errorCategory];
      }
    }

    let delay = baseDelay * Math.pow(this.exponentialBase, attempt);
    delay = Math.min(delay, this.maxDelay);

    // 如果是超时错误，根据超时阶段调整延迟
    if (error && error.timeoutStage) {
      if (['read_headers', 'read_body'].includes(error.timeoutStage)) {
        // 读取超时时使用更长延迟，因为服务端可能仍在处理
        delay *= 1.5;
      } else if (error.timeoutStage === 'connect') {
        // 连接超时可以使用较短延迟
        delay *= 0.8;
      }
    }

    if (this.jitter) {
      // 添加随机抖动以避免雷鸣群体效应
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  /**
   * 根据错误对象确定错误类别
   */
  getErrorCategory(error) {
    if (error.status === 429) {
      return 'RATE_LIMIT';
    } else if (error.status >= 500) {
      return 'SERVER_ERROR';
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('超时')) {
      return 'TIMEOUT';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
               error.message.includes('network') || error.message.includes('connection')) {
      return 'NETWORK_ERROR';
    } else if (error.message.includes('validation failed') ||
               error.message.includes('Invalid ') ||
               error.message.includes('response validation')) {
      return 'VALIDATION_ERROR';
    }
    return 'UNKNOWN';
  }

  /**
   * 记录错误统计
   * @param {Error} error - 错误对象
   */
  recordError(error) {
    const key = error.name || error.code || 'UnknownError';
    const stats = this.errorStats.get(key) || { count: 0, lastSeen: null };
    stats.count++;
    stats.lastSeen = Date.now();
    this.errorStats.set(key, stats);
  }

  /**
   * 带超时执行的包装器
   * @param {Function} operation - 操作函数
   * @returns {Promise<any>} 操作结果
   */
  async executeWithTimeout(operation) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`操作超时 (${this.config.timeout}ms)`));
      }, this.config.timeout);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * 判断错误是否可重试（兼容旧版本接口）
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否可重试
   */
  isRetryableError(error) {
    // 检查错误代码
    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }

    // 检查错误名称
    if (error.name && this.retryableErrors.includes(error.name)) {
      return true;
    }

    // 检查错误消息
    const message = error.message.toLowerCase();
    const retryableKeywords = [
      'timeout',
      'rate limit',
      'too many requests',
      'connection reset',
      'network',
      'temporarily unavailable'
    ];

    for (const keyword of retryableKeywords) {
      if (message.includes(keyword)) {
        return true;
      }
    }

    return false;
  }



  /**
   * 获取错误统计
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    const stats = {};
    for (const [errorType, data] of this.errorStats.entries()) {
      stats[errorType] = {
        count: data.count,
        lastSeen: data.lastSeen ? new Date(data.lastSeen).toISOString() : null
      };
    }
    return stats;
  }

  /**
   * 重置错误统计
   */
  resetErrorStats() {
    this.errorStats.clear();
  }

  /**
   * 睡眠指定时间
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    if (!newConfig) return;

    // 更新实例上的配置属性
    if (newConfig.maxRetries !== undefined) {
      this.maxRetries = newConfig.maxRetries;
    }
    if (newConfig.baseDelay !== undefined) {
      this.baseDelay = newConfig.baseDelay;
    }
    if (newConfig.maxDelay !== undefined) {
      this.maxDelay = newConfig.maxDelay;
    }
    if (newConfig.exponentialBase !== undefined) {
      this.exponentialBase = newConfig.exponentialBase;
    }
    if (newConfig.jitter !== undefined) {
      this.jitter = newConfig.jitter;
    }
    if (newConfig.retryableErrors !== undefined) {
      this.retryableErrors = newConfig.retryableErrors;
    }
    if (newConfig.baseDelaysByErrorType !== undefined) {
      this.baseDelaysByErrorType = newConfig.baseDelaysByErrorType;
    }
    if (newConfig.taskTypeConfig !== undefined) {
      this.taskTypeConfig = { ...this.taskTypeConfig, ...newConfig.taskTypeConfig };
    }

    // 同时更新 config 对象（如果存在）
    if (this.config) {
      this.config = { ...this.config, ...newConfig };
    } else {
      this.config = newConfig;
    }

    console.log('[RetryManager] 配置已更新');
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      exponentialBase: this.exponentialBase,
      jitter: this.jitter,
      retryableErrors: this.retryableErrors,
      baseDelaysByErrorType: this.baseDelaysByErrorType,
      taskTypeConfig: this.taskTypeConfig,
      timeout: this.config?.timeout || 180000  // 添加 timeout 到返回的配置中
    };
  }
}

module.exports = RetryManager;
