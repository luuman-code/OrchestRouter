/**
 * TaskExecutor - 任务执行器
 *
 * 职责：负责槽位获取与释放、任务执行、降级策略决策
 *
 * 与 ConcurrencyManager 的协作关系：
 * - ConcurrencyManager：提供负载信息和槽位管理原语
 * - TaskExecutor：调用原语执行具体的槽位获取、任务执行和槽位释放
 */

class TaskExecutor {
  /**
   * @param {ConcurrencyManager} concurrencyManager - 并发管理器实例
   * @param {Object} executor - 实际的任务执行器（如 API 调用器）
   */
  constructor(concurrencyManager, executor) {
    this.concurrencyManager = concurrencyManager;
    this.executor = executor;

    // 降级策略配置
    this.fallbackStrategies = {
      'wait': this._fallbackWait.bind(this),
      'fallback': this._fallbackSelectAlternative.bind(this),
      'reject': this._fallbackReject.bind(this)
    };

    // 默认配置
    this.defaultTimeoutMs = 30000;
    this.defaultFallbackStrategy = 'wait';
  }

  /**
   * 执行任务（带并发控制）
   * @param {string} modelId - 模型 ID
   * @param {Object} task - 任务对象
   * @param {Object} options - 执行选项
   * @param {number} options.timeoutMs - 等待槽位超时时间（毫秒）
   * @param {string} options.fallbackStrategy - 槽位已满时的策略：'wait' | 'fallback' | 'reject'
   * @param {Function} options.onFallback - 降级时的回调函数，接收 (originalModelId, reason)
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithConcurrencyControl(modelId, task, options = {}) {
    const {
      timeoutMs = this.defaultTimeoutMs,
      fallbackStrategy = this.defaultFallbackStrategy,
      onFallback = null
    } = options;

    const startTime = Date.now();

    try {
      // 步骤 1: 尝试获取槽位
      const slotResult = await this._tryAcquireWithTimeout(modelId, timeoutMs);

      if (!slotResult.acquired) {
        // 步骤 2: 如果无法获取槽位，根据降级策略处理
        console.log(`[TaskExecutor] 模型 ${modelId} 槽位获取失败，使用降级策略：${fallbackStrategy}`);

        if (onFallback) {
          onFallback(modelId, slotResult.reason || '槽位已满');
        }

        return this._handleSlotUnavailable(modelId, task, fallbackStrategy, options);
      }

      console.log(`[TaskExecutor] 模型 ${modelId} 槽位获取成功，开始执行任务...`);

      // 步骤 3: 执行任务
      const result = await this._executeTask(modelId, task);

      // 步骤 4: 释放槽位
      this.concurrencyManager.releaseSlot(modelId);
      console.log(`[TaskExecutor] 模型 ${modelId} 任务执行完成，槽位已释放`);

      return {
        ...result,
        executionTime: Date.now() - startTime,
        modelId,
        slotInfo: slotResult
      };
    } catch (error) {
      // 发生错误时确保释放槽位
      console.error(`[TaskExecutor] 模型 ${modelId} 执行出错，释放槽位：`, error.message);
      this.concurrencyManager.releaseSlot(modelId);
      throw error;
    }
  }

  /**
   * 带超时的槽位获取
   * @private
   */
  async _tryAcquireWithTimeout(modelId, timeoutMs) {
    return Promise.race([
      this.concurrencyManager.acquireSlot(modelId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`等待模型 ${modelId} 槽位超时`)), timeoutMs)
      )
    ]);
  }

  /**
   * 处理槽位不可用的情况
   * @private
   */
  _handleSlotUnavailable(modelId, task, strategy, options) {
    const fallbackHandler = this.fallbackStrategies[strategy];
    if (!fallbackHandler) {
      console.warn(`[TaskExecutor] 未知的降级策略：${strategy}，使用默认的 fallback 策略`);
      return this._fallbackSelectAlternative(modelId, task, options);
    }

    return fallbackHandler(modelId, task, options);
  }

  /**
   * 降级策略：等待
   * @private
   */
  async _fallbackWait(modelId, task, options) {
    console.log(`[TaskExecutor] 降级策略：等待模型 ${modelId} 槽位`);
    try {
      const slotResult = await this.concurrencyManager.acquireSlot(modelId);
      if (slotResult.acquired) {
        const result = await this._executeTask(modelId, task);
        this.concurrencyManager.releaseSlot(modelId);
        return {
          ...result,
          modelId,
          slotInfo: slotResult,
          fallbackUsed: 'wait'
        };
      }
      throw new Error('等待槽位失败');
    } catch (error) {
      throw new Error(`等待槽位失败：${error.message}`);
    }
  }

  /**
   * 降级策略：选择替代模型
   * @private
   */
  async _fallbackSelectAlternative(modelId, task, options) {
    console.log(`[TaskExecutor] 降级策略：选择替代模型`);

    // 获取所有模型的负载状态
    const allModelsStatus = this.concurrencyManager.getAllModelsLoadStatus();

    // 过滤出负载较低且非原模型的模型
    const alternatives = allModelsStatus
      .filter(status => status.modelId !== modelId && status.recommendation !== 'overloaded')
      .sort((a, b) => a.loadScore - b.loadScore); // 按负载分数升序排序

    if (alternatives.length === 0) {
      console.warn(`[TaskExecutor] 没有可用的替代模型，回退到等待策略`);
      return this._fallbackWait(modelId, task, options);
    }

    const bestAlternative = alternatives[0];
    console.log(`[TaskExecutor] 选择替代模型：${bestAlternative.modelId} (负载分数：${bestAlternative.loadScore.toFixed(2)})`);

    // 尝试使用替代模型执行
    return this.executeWithConcurrencyControl(bestAlternative.modelId, task, {
      ...options,
      fallbackStrategy: 'reject' // 替代模型如果也不可用，则直接拒绝
    });
  }

  /**
   * 降级策略：直接拒绝
   * @private
   */
  async _fallbackReject(modelId, task, options) {
    const loadStatus = this.concurrencyManager.getModelLoadStatus(modelId);
    throw new Error(
      `模型 ${modelId} 当前繁忙（负载分数：${loadStatus.loadScore.toFixed(2)}, ` +
      `可用槽位：${loadStatus.availableSlots}/${loadStatus.maxConcurrency}），请稍后重试`
    );
  }

  /**
   * 执行实际任务
   * @private
   */
  async _executeTask(modelId, task) {
    // 实际的执行逻辑由外部传入的 executor 实现
    // 这里提供一个通用的执行框架
    if (!this.executor) {
      throw new Error('未配置任务执行器');
    }

    try {
      const result = await this.executor.execute(modelId, task);
      return {
        success: true,
        result,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * 设置默认超时时间
   */
  setDefaultTimeout(timeoutMs) {
    this.defaultTimeoutMs = timeoutMs;
  }

  /**
   * 设置默认降级策略
   */
  setDefaultFallbackStrategy(strategy) {
    if (!this.fallbackStrategies[strategy]) {
      throw new Error(`未知的降级策略：${strategy}`);
    }
    this.defaultFallbackStrategy = strategy;
  }

  /**
   * 注册自定义降级策略
   */
  registerFallbackStrategy(name, handler) {
    this.fallbackStrategies[name] = handler.bind(this);
  }

  /**
   * 获取并发统计信息
   */
  getConcurrencyStats() {
    return this.concurrencyManager.getStatistics();
  }
}

module.exports = TaskExecutor;
