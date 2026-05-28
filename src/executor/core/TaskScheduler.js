/**
 * LoadAwareScheduler - 负载感知的任务调度器
 *
 * 从计划中提取的核心逻辑，实现基于负载感知的智能调度算法
 * 与模型选择器协同工作，实现全局最优的资源利用
 */
class LoadAwareScheduler {
  constructor(concurrencyManager, performanceHistory = null) {
    this.concurrencyManager = concurrencyManager;
    this.performanceHistory = performanceHistory;
  }

  /**
   * 自适应调度 - 根据负载和可用性选择最佳模型执行
   * @param {string} preferredModelId - 首选模型
   * @param {Array} alternatives - 备选模型列表
   * @param {Function} taskFunction - 任务函数
   * @param {Object} options - 选项
   * @returns {Promise<any>} 执行结果
   */
  async adaptiveSchedule(preferredModelId, alternatives, taskFunction, options = {}) {
    const { timeoutMs = 60000, taskType = 'general' } = options;

    // 1. 首先尝试在首选模型上执行
    try {
      const slotResult = await this.concurrencyManager.acquireSlotWithAtomicCheck(
        preferredModelId,
        null,
        timeoutMs
      );

      if (slotResult.success) {
        return await this.executeTaskFunction(preferredModelId, taskFunction);
      }
    } catch (error) {
      console.warn(`[LoadAwareScheduler] 首选模型 ${preferredModelId} 槽位获取失败: ${error.message}`);
    }

    // 2. 首选模型不可用，按负载排序尝试备选模型
    const sortedAlternatives = this.sortAlternativesByLoad(alternatives);

    for (const altModel of sortedAlternatives) {
      const altModelId = altModel.modelId || altModel;
      try {
        const altResult = await this.concurrencyManager.acquireSlotWithAtomicCheck(
          altModelId,
          null,
          timeoutMs
        );

        if (altResult.success) {
          return await this.executeTaskFunction(altModelId, taskFunction);
        }
      } catch (error) {
        console.warn(`[LoadAwareScheduler] 备选模型 ${altModelId} 不可用: ${error.message}`);
        continue;
      }
    }

    // 3. 所有模型都获取失败，抛出错误
    throw new Error(`所有模型都不可用：${preferredModelId} 和 ${alternatives.length} 个备选模型`);
  }

  /**
   * 执行任务函数
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数（接收 modelId 参数）
   */
  async executeTaskFunction(modelId, taskFunction) {
    try {
      // 将 modelId 传递给 taskFunction，确保正确的模型被使用
      const result = await taskFunction(modelId);
      return result;
    } finally {
      // 释放槽位
      this.concurrencyManager.releaseSlot(modelId);
    }
  }

  /**
   * 按负载排序备选模型
   */
  sortAlternativesByLoad(alternatives = []) {
    return [...alternatives].sort((a, b) => {
      const loadA = a.loadScore || a.currentLoad || 1;
      const loadB = b.loadScore || b.currentLoad || 1;
      return loadA - loadB;
    });
  }

  async scheduleTask(preferredModelId, alternatives, task) {
    // 首先检查首选模型的负载
    const preferredLoad = await this.concurrencyManager.getLoadInfo(preferredModelId);

    if (preferredLoad.loadScore < 0.7) { // 负载低于70%，优先使用
      return await this.executeOnModel(preferredModelId, task);
    }

    // 首选模型负载较高，考虑备选模型
    for (const altModelId of alternatives) {
      const altLoad = await this.concurrencyManager.getLoadInfo(altModelId);
      if (altLoad.loadScore < 0.5) { // 找到负载低于50%的模型
        return await this.executeOnModel(altModelId, task);
      }
    }

    // 所有模型都负载较高，使用原计划
    return await this.executeOnModel(preferredModelId, task, { fallbackStrategy: 'wait' });
  }

  async executeOnModel(modelId, taskFunction, options = {}) {
    const { fallbackStrategy = 'wait', timeoutMs = 60000 } = options;

    // 尝试立即获取槽位
    if (await this.concurrencyManager.tryAcquireSlot(modelId)) {
      // 将 modelId 传递给 taskFunction，确保使用正确的模型
      return await taskFunction(modelId);
    }

    // 如果无法立即获取槽位，根据策略处理
    if (fallbackStrategy === 'wait') {
      await this.concurrencyManager.acquireSlot(modelId, timeoutMs);
      // 将 modelId 传递给 taskFunction，确保使用正确的模型
      return await taskFunction(modelId);
    } else {
      throw new Error(`Model ${modelId} is at max capacity`);
    }
  }
}

/**
 * TaskScheduler - 任务调度器
 *
 * 负责调度任务的执行顺序和并发控制
 * 支持负载感知调度、备选模型切换等高级功能
 *
 * @class TaskScheduler
 */
class TaskScheduler {
  /**
   * 创建任务调度器
   * @param {ConcurrencyController} concurrencyManager - 并发控制器实例
   * @param {PerformanceHistory} performanceHistory - 性能历史记录器实例
   */
  constructor(concurrencyManager, performanceHistory = null) {
    this.concurrencyManager = concurrencyManager;
    this.performanceHistory = performanceHistory;
    this.taskQueue = [];  // 任务队列
    this.activeTasks = new Set();  // 活跃任务集合
    this.queueLock = new AsyncLock();

    // 【新增 2026-03-29】负载感知调度器
    this.loadAwareScheduler = new LoadAwareScheduler(concurrencyManager, performanceHistory);
  }

  /**
   * 调度任务执行
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 调度选项
   * @returns {Promise<any>} 任务执行结果
   */
  async scheduleTask(modelId, taskFunction, options = {}) {
    let {
      timeoutMs = 60000,
      fallbackStrategy = 'wait',
      priority = 'normal'
    } = options;

    // 根据负载分数调整任务优先级
    const loadScore = await this.concurrencyManager.getLoadInfo(modelId);
    if (loadScore.loadScore > 0.8 && priority === 'normal') {
      priority = 'low'; // 高负载时降低普通任务优先级
    }

    // 尝试直接获取槽位
    if (await this.concurrencyManager.tryAcquireSlot(modelId)) {
      return await this.executeTask(modelId, taskFunction);
    }

    // 槽位不可用，根据策略处理
    switch (fallbackStrategy) {
      case 'wait':
        return await this.waitForSlotAndExecute(modelId, taskFunction, timeoutMs);

      case 'fallback':
        return await this.executeWithFallback(modelId, taskFunction, options);

      case 'reject':
        throw new Error(`Model ${modelId} is at max capacity`);

      default:
        return await this.waitForSlotAndExecute(modelId, taskFunction, timeoutMs);
    }
  }

  /**
   * 等待槽位并执行任务
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数
   * @param {number} timeoutMs - 超时时间
   * @returns {Promise<any>} 任务执行结果
   */
  async waitForSlotAndExecute(modelId, taskFunction, timeoutMs) {
    // 等待槽位
    await this.concurrencyManager.acquireSlot(modelId, timeoutMs);
    return await this.executeTask(modelId, taskFunction);
  }

  /**
   * 执行任务
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数（接收 modelId 参数）
   * @returns {Promise<any>} 任务执行结果
   */
  async executeTask(modelId, taskFunction) {
    this.activeTasks.add(modelId);
    try {
      // 将 modelId 传递给 taskFunction，确保使用正确的模型
      const result = await taskFunction(modelId);
      return result;
    } finally {
      this.activeTasks.delete(modelId);
      await this.concurrencyManager.releaseSlot(modelId);
    }
  }

  /**
   * 带备选模型切换的执行
   * @param {string} originalModelId - 原始模型 ID
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 选项
   * @returns {Promise<any>} 任务执行结果
   */
  async executeWithFallback(originalModelId, taskFunction, options) {
    // 获取备选模型列表（通常来自 ModelSelector 的选择结果）
    const { alternatives = [], loadInfo, timeoutMs = 60000 } = options;

    // 首先尝试在原始模型上执行（使用负载感知的槽位获取）
    try {
      const slotResult = await this.concurrencyManager.acquireSlotWithAtomicCheck(
        originalModelId,
        loadInfo,
        timeoutMs
      );

      if (slotResult.success) {
        return await this.executeTask(originalModelId, taskFunction);
      }
    } catch (error) {
      console.warn(`在原始模型 ${originalModelId} 上获取槽位失败：${error.message}`);
    }

    // 主选模型失败，按优先级尝试备选模型
    const sortedAlternatives = this.sortAlternativesByLoadAndCost(alternatives);

    for (const alternative of sortedAlternatives) {
      try {
        const altResult = await this.concurrencyManager.acquireSlotWithAtomicCheck(
          alternative.modelId,
          { loadScore: alternative.currentLoad || alternative.loadScore },
          timeoutMs
        );

        if (altResult.success) {
          return await this.executeTask(alternative.modelId, taskFunction);
        }
      } catch (error) {
        console.warn(`备选模型 ${alternative.modelId} 不可用：${error.message}`);
        continue;
      }
    }

    // 所有模型都不可用
    throw new Error(`所有可用模型都不可用：原始模型 ${originalModelId} 和 ${alternatives.length} 个备选模型`);
  }

  /**
   * 【新增 2026-03-28】按负载和成本排序备选模型
   * 优先选择负载更低、成本更低的模型
   * @param {Array} alternatives - 备选模型列表
   * @returns {Array} 排序后的备选模型列表
   */
  sortAlternativesByLoadAndCost(alternatives = []) {
    // 过滤掉无效的备选模型
    const validAlternatives = alternatives.filter(alt => alt && alt.modelId);

    return [...validAlternatives].sort((a, b) => {
      // 首先按评分排序（高评分优先）- 这是最重要的排序依据
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // 高分在前
      }

      // 评分相同时，按排名排序
      const rankA = a.rank ?? 99;
      const rankB = b.rank ?? 99;

      if (rankA !== rankB) {
        return rankA - rankB; // 排名靠前在前
      }

      // 最后按负载排序（低负载优先）
      const loadScoreA = a.currentLoad ?? a.loadScore ?? 1;
      const loadScoreB = b.currentLoad ?? b.loadScore ?? 1;

      return loadScoreA - loadScoreB;
    });
  }

  /**
   * 【新增 2026-03-28】负载感知的任务调度
   * 在调度任务时考虑当前模型负载
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 选项
   * @returns {Promise<any>} 任务执行结果
   */
  async scheduleTaskWithLoadAwareness(modelId, taskFunction, options = {}) {
    const {
      timeoutMs = 60000,
      fallbackStrategy = 'wait',
      priority = 'normal',
      loadInfo = null  // 来自 ModelSelector 的负载信息
    } = options;

    // 根据负载分数和优先级调整调度策略
    const currentLoadInfo = await this.concurrencyManager.getLoadInfo(modelId);
    const currentLoad = currentLoadInfo.loadScore;

    // 如果负载很高且任务优先级不高，考虑推迟或使用备选模型
    if (currentLoad > 0.8 && priority === 'normal') {
      if (options.alternatives && options.alternatives.length > 0) {
        // 如果有备选模型，尝试使用负载较低的备选模型
        return await this.executeWithFallback(modelId, taskFunction, options);
      }
    }

    // 尝试直接获取槽位（使用负载感知方式）
    if (loadInfo) {
      try {
        const slotResult = await this.concurrencyManager.acquireSlotWithAtomicCheck(
          modelId,
          loadInfo,
          timeoutMs
        );

        if (slotResult.success) {
          return await this.executeTask(modelId, taskFunction);
        }
      } catch (error) {
        console.warn(`负载感知槽位获取失败：${error.message}`);
      }
    } else {
      // 如果没有负载信息，回退到常规方式
      if (await this.concurrencyManager.tryAcquireSlot(modelId)) {
        return await this.executeTask(modelId, taskFunction);
      }
    }

    // 槽位不可用，根据策略处理
    switch (fallbackStrategy) {
      case 'wait':
        return await this.waitForSlotAndExecute(modelId, taskFunction, timeoutMs);

      case 'fallback':
        return await this.executeWithFallback(modelId, taskFunction, options);

      case 'reject':
        throw new Error(`Model ${modelId} is at max capacity`);

      default:
        return await this.waitForSlotAndExecute(modelId, taskFunction, timeoutMs);
    }
  }

  /**
   * 获取当前活跃任务数
   * @returns {number} 活跃任务数
   */
  getActiveTaskCount() {
    return this.activeTasks.size;
  }

  /**
   * 获取任务队列长度
   * @returns {number} 队列长度
   */
  getQueueLength() {
    return this.taskQueue.length;
  }

  /**
   * 【新增 2026-03-29】集成负载感知的任务调度
   * 与 ModelSelector 的负载感知选择协同工作
   * @param {string} preferredModelId - 首选模型 ID
   * @param {Array} alternatives - 备选模型数组
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 调度选项
   * @returns {Promise<any>} 任务执行结果
   */
  async scheduleTaskWithLoadAwarenessAndAlternatives(preferredModelId, alternatives, taskFunction, options = {}) {
    const {
      timeoutMs = 60000,
      fallbackStrategy = 'fallback',
      priority = 'normal',
      taskType = 'general',
      historicalData = {}
    } = options;

    // 调试日志：记录传入参数的状态
    const alternativesFromArg = Array.isArray(alternatives) ? alternatives.length : `type=${typeof alternatives}`;
    const alternativesFromOptions = Array.isArray(options.alternatives) ? options.alternatives.length : `type=${typeof options.alternatives}`;
    console.log(`[TaskScheduler] 入参: preferredModelId=${preferredModelId}, alternatives=${alternativesFromArg}, options.alternatives=${alternativesFromOptions}`);

    // 修复：如果第二个参数 alternatives 为空，尝试从 options.alternatives 获取
    let effectiveAlternatives = alternatives;
    if (!effectiveAlternatives || effectiveAlternatives.length === 0) {
      effectiveAlternatives = options.alternatives || [];
    }

    // 调试日志：记录 alternatives 的最终状态
    const alternativesStatus = Array.isArray(effectiveAlternatives)
      ? `length=${effectiveAlternatives.length}`
      : `type=${typeof effectiveAlternatives}, value=${JSON.stringify(effectiveAlternatives).substring(0, 100)}`;
    console.log(`[TaskScheduler] scheduleTaskWithLoadAwarenessAndAlternatives: preferredModelId=${preferredModelId}, effectiveAlternatives=${alternativesStatus}`);

    // 使用负载感知调度器
    try {
      // 如果有备选模型，使用完整的负载感知调度逻辑
      if (effectiveAlternatives && effectiveAlternatives.length > 0) {
        return await this.loadAwareScheduler.adaptiveSchedule(
          preferredModelId,
          effectiveAlternatives,
          taskFunction,
          {
            timeoutMs,
            taskType,
            fallbackStrategy,
            historicalData
          }
        );
      } else {
        // 如果没有备选模型，使用标准调度
        return await this.scheduleTaskWithLoadAwareness(preferredModelId, taskFunction, options);
      }
    } catch (error) {
      console.warn(`Load-aware scheduling failed, falling back to standard scheduling: ${error.message}`);
      // 如果负载感知调度失败，回退到标准调度
      return await this.scheduleTask(preferredModelId, taskFunction, options);
    }
  }
}

/**
 * AsyncLock - 异步锁实现
 */
class AsyncLock {
  constructor() {
    this._locked = false;
    this._queue = [];
  }

  async acquire(callback) {
    await this._waitForLock();
    try {
      return await callback();
    } finally {
      this._release();
    }
  }

  _waitForLock() {
    return new Promise((resolve) => {
      if (!this._locked) {
        this._locked = true;
        resolve();
      } else {
        this._queue.push(resolve);
      }
    });
  }

  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
    }
  }

  release() {
    this._release();
  }
}

module.exports = TaskScheduler;
