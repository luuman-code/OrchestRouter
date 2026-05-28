/**
 * TaskQueue - 任务队列系统
 *
 * 实现负载感知的任务排队机制，支持多种排队策略：
 * 1. 立即拒绝策略：直接返回错误，适用于实时性要求高的场景
 * 2. 等待策略：等待槽位释放，适用于后台批处理任务
 * 3. 降级策略：切换到备用模型，适用于高可用性要求场景
 *
 * @class TaskQueue
 */
class TaskQueue {
  /**
   * 创建任务队列
   * @param {ConcurrencyController} concurrencyController - 并发控制器实例
   * @param {number} maxSize - 队列最大容量，默认为 1000
   */
  constructor(concurrencyController, maxSize = 1000) {
    this.concurrencyController = concurrencyController;
    this.maxSize = maxSize;
    this.queue = [];
    this.waitingSlots = new Map(); // 存储等待槽位的任务
    this.processingTasks = new Map(); // 存储正在处理的任务
    this.locks = new Map(); // 每个模型的锁
  }

  /**
   * 获取模型锁
   * @param {string} modelId - 模型 ID
   * @returns {Object} 锁对象
   */
  getModelLock(modelId) {
    if (!this.locks.has(modelId)) {
      this.locks.set(modelId, new AsyncLock());
    }
    return this.locks.get(modelId);
  }

  /**
   * 提交任务到队列
   * @param {Object} task - 任务对象
   * @param {string} modelId - 目标模型 ID
   * @param {string} strategy - 排队策略 ('reject', 'wait', 'fallback')
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<Object>} 任务执行结果
   */
  async submit(task, modelId, strategy = 'wait', timeoutMs = 60000) {
    // 检查队列容量
    if (this.queue.length >= this.maxSize) {
      throw new Error(`Task queue is full (max size: ${this.maxSize})`);
    }

    const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueEntry = {
      taskId,
      task,
      modelId,
      strategy,
      timeoutMs,
      timestamp: Date.now(),
      attempts: 0,
      maxRetries: task.maxRetries || 3
    };

    // 立即拒绝策略
    if (strategy === 'reject') {
      const canAcquire = await this.concurrencyController.tryAcquireSlot(modelId);
      if (canAcquire) {
        // 执行任务
        return await this.executeTask(queueEntry);
      } else {
        throw new Error(`Model ${modelId} is at max capacity and reject strategy is used`);
      }
    }

    // 等待策略或降级策略
    if (strategy === 'wait' || strategy === 'fallback') {
      // 检查是否有可用槽位
      const canAcquire = await this.concurrencyController.tryAcquireSlot(modelId);
      if (canAcquire) {
        return await this.executeTask(queueEntry);
      } else {
        // 使用适当的策略处理
        if (strategy === 'wait') {
          return await this.waitForSlotAndExecute(queueEntry);
        } else if (strategy === 'fallback') {
          return await this.handleWithFallback(queueEntry);
        }
      }
    }

    throw new Error(`Unknown strategy: ${strategy}`);
  }

  /**
   * 等待槽位并执行任务
   * @param {Object} queueEntry - 队列条目
   * @returns {Promise<Object>} 任务执行结果
   */
  async waitForSlotAndExecute(queueEntry) {
    const { task, modelId, timeoutMs, taskId } = queueEntry;
    const startTime = Date.now();

    // 添加到等待队列
    if (!this.waitingSlots.has(modelId)) {
      this.waitingSlots.set(modelId, []);
    }
    this.waitingSlots.get(modelId).push(queueEntry);

    try {
      // 循环检查槽位可用性
      while (Date.now() - startTime < timeoutMs) {
        const canAcquire = await this.concurrencyController.tryAcquireSlot(modelId);
        if (canAcquire) {
          // 从等待队列中移除
          const waitingQueue = this.waitingSlots.get(modelId);
          const index = waitingQueue.findIndex(entry => entry.taskId === taskId);
          if (index !== -1) {
            waitingQueue.splice(index, 1);
          }

          // 执行任务
          return await this.executeTask(queueEntry);
        }

        // 等待一段时间再检查
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 超时处理
      const waitingQueue = this.waitingSlots.get(modelId);
      if (waitingQueue) {
        const index = waitingQueue.findIndex(entry => entry.taskId === taskId);
        if (index !== -1) {
          waitingQueue.splice(index, 1);
        }
      }

      throw new Error(`Timeout waiting for slot of model ${modelId} for task ${taskId}`);
    } catch (error) {
      // 发生错误时也需从等待队列中移除
      const waitingQueue = this.waitingSlots.get(modelId);
      if (waitingQueue) {
        const index = waitingQueue.findIndex(entry => entry.taskId === taskId);
        if (index !== -1) {
          waitingQueue.splice(index, 1);
        }
      }

      throw error;
    }
  }

  /**
   * 带降级处理的任务执行
   * @param {Object} queueEntry - 队列条目
   * @returns {Promise<Object>} 任务执行结果
   */
  async handleWithFallback(queueEntry) {
    const { task, modelId, timeoutMs, taskId, attempts } = queueEntry;

    // 首先尝试在原始模型上执行
    try {
      const canAcquire = await this.concurrencyController.tryAcquireSlot(modelId);
      if (canAcquire) {
        return await this.executeTask(queueEntry);
      }
    } catch (error) {
      console.warn(`Failed to acquire slot for original model ${modelId}:`, error.message);
    }

    // 尝试备选模型
    if (task.alternatives && Array.isArray(task.alternatives) && task.alternatives.length > 0) {
      // 按负载和成本排序备选模型
      const sortedAlternatives = await this.sortAlternativesByLoadAndCost(task.alternatives);

      for (const alternative of sortedAlternatives) {
        const altModelId = typeof alternative === 'string' ? alternative : alternative.modelId;

        try {
          console.log(`Trying alternative model: ${altModelId}`);

          const canAcquire = await this.concurrencyController.tryAcquireSlot(altModelId);
          if (canAcquire) {
            // 更新队列条目使用备选模型
            const altQueueEntry = {
              ...queueEntry,
              modelId: altModelId,
              originalModelId: modelId
            };

            return await this.executeTask(altQueueEntry);
          }
        } catch (error) {
          console.warn(`Alternative model ${altModelId} also failed:`, error.message);
          continue;
        }
      }
    }

    // 如果已达到最大重试次数，抛出错误
    if (attempts >= queueEntry.maxRetries) {
      throw new Error(`All models unavailable after ${queueEntry.maxRetries} attempts: original ${modelId}, alternatives: ${task.alternatives?.length || 0}`);
    }

    // 增加重试次数并重新加入队列
    queueEntry.attempts += 1;

    // 短暂等待后重试
    await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts), 10000))); // 指数退避

    // 递归调用以尝试再次获取槽位
    return await this.handleWithFallback(queueEntry);
  }

  /**
   * 执行任务
   * @param {Object} queueEntry - 队列条目
   * @returns {Promise<Object>} 任务执行结果
   */
  async executeTask(queueEntry) {
    const { taskId, task, modelId } = queueEntry;

    // 添加到处理中的任务列表
    this.processingTasks.set(taskId, queueEntry);

    try {
      // 这里应该是实际的任务执行逻辑
      // 由于我们不知道具体的执行逻辑，返回一个模拟的执行结果
      console.log(`Executing task ${taskId} on model ${modelId}`);

      // 实际的执行函数应由传入的任务对象提供
      if (task.execute && typeof task.execute === 'function') {
        const result = await task.execute(modelId);
        return {
          success: true,
          taskId,
          modelId,
          result,
          timestamp: Date.now()
        };
      } else {
        // 模拟执行
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400)); // 模拟执行时间

        return {
          success: true,
          taskId,
          modelId,
          result: `Simulated execution result for task ${taskId}`,
          timestamp: Date.now()
        };
      }
    } finally {
      // 从处理中移除
      this.processingTasks.delete(taskId);

      // 释放槽位
      await this.concurrencyController.releaseSlot(modelId);
    }
  }

  /**
   * 按负载和成本排序备选模型
   * @param {Array} alternatives - 备选模型列表
   * @returns {Array} 排序后的备选模型列表
   */
  async sortAlternativesByLoadAndCost(alternatives = []) {
    const enhancedAlternatives = [];

    for (const alt of alternatives) {
      const altModelId = typeof alt === 'string' ? alt : alt.modelId;

      // 获取负载信息
      let loadInfo = { loadScore: 1 }; // 默认值

      try {
        loadInfo = await this.concurrencyController.getLoadInfo(altModelId);
      } catch (error) {
        console.warn(`Could not get load info for alternative model ${altModelId}:`, error.message);
      }

      enhancedAlternatives.push({
        ...alt,
        modelId: altModelId,
        currentLoad: loadInfo.loadScore,
        availableSlots: loadInfo.availableSlots
      });
    }

    return enhancedAlternatives.sort((a, b) => {
      // 首先按负载分数排序（低负载优先）
      const loadScoreA = a.currentLoad !== undefined ? a.currentLoad : 1;
      const loadScoreB = b.currentLoad !== undefined ? b.currentLoad : 1;

      if (loadScoreA !== loadScoreB) {
        return loadScoreA - loadScoreB;
      }

      // 如果负载相近，按可用槽位数排序（更多可用槽位优先）
      const availableSlotsA = a.availableSlots !== undefined ? a.availableSlots : 0;
      const availableSlotsB = b.availableSlots !== undefined ? b.availableSlots : 0;

      if (availableSlotsA !== availableSlotsB) {
        return availableSlotsB - availableSlotsA; // 注意这里是B-A，因为更多可用槽位优先
      }

      // 负载和可用槽位都相近时，按成本排序（低成本优先）
      const costA = a.cost?.total || Infinity;
      const costB = b.cost?.total || Infinity;

      return costA - costB;
    });
  }

  /**
   * 获取队列状态
   * @returns {Object} 队列状态信息
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      waitingSlots: Object.fromEntries(
        Array.from(this.waitingSlots.entries()).map(([modelId, queue]) => [
          modelId,
          queue.length
        ])
      ),
      processingTasks: this.processingTasks.size,
      maxSize: this.maxSize
    };
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
    this.waitingSlots.clear();
    this.processingTasks.clear();
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

  /**
   * 获取锁并执行回调
   * @param {Function} callback - 回调函数
   * @returns {Promise<any>} 回调执行结果
   */
  async acquire(callback) {
    // 等待获取锁
    await this._waitForLock();

    try {
      // 执行回调
      return await callback();
    } finally {
      // 释放锁
      this._release();
    }
  }

  /**
   * 等待锁可用
   * @returns {Promise<void>}
   */
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

  /**
   * 释放锁
   * @returns {void}
   */
  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
    }
  }

  /**
   * 释放锁（外部调用）
   */
  release() {
    this._release();
  }
}

module.exports = TaskQueue;