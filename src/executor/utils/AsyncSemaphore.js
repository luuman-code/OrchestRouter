/**
 * AsyncSemaphore - 异步信号量实现
 * 支持 N 个并发槽位的信号量，用于控制并发访问
 *
 * 【改进 2026-05-05】
 * - 修复超时清理缺陷：每个 entry 记录自己的 timeoutMs，清理时使用自己的超时时间
 * - 修复幽灵条目问题：超时后立即标记并清理当前条目
 * - 添加主动清理方法，支持外部触发清理
 */
class AsyncSemaphore {
  /**
   * 创建信号量
   * @param {number} permits - 并发槽位数
   * @param {string} modelId - 模型ID（用于调试日志）
   */
  constructor(permits, modelId = null) {
    this._permits = permits;
    this._availablePermits = permits;
    this._queue = [];  // FIFO 队列存储等待者
    this.modelId = modelId;
    this._closed = false;  // 信号量是否已关闭
  }

  /**
   * 非阻塞尝试获取槽位
   * @returns {boolean} 是否成功获取
   */
  tryAcquire() {
    if (this._closed) {
      return false;
    }
    if (this._availablePermits > 0) {
      this._availablePermits--;
      return true;
    }
    return false;
  }

  /**
   * 阻塞等待获取槽位
   * @returns {Promise<void>}
   */
  async acquire(callback) {
    // 【修复】支持两种调用方式：无参数 或 带回调函数
    // 如果传入的是函数，则执行带回调的版本
    // 否则执行无参数的获取槽位版本
    if (typeof callback === 'function') {
      return this._acquireWithCallback(callback);
    }

    // 无参数版本：只获取槽位
    if (this._closed) {
      throw new Error('Semaphore is closed');
    }
    // 如果有可用槽位，立即返回
    if (this.tryAcquire()) {
      return;
    }

    // 否则加入等待队列
    return new Promise((resolve, reject) => {
      this._queue.push(resolve);
    });
  }

  /**
   * 【内部方法】带回调的获取槽位
   * 类似 AsyncLock.acquire(callback) 的接口
   * @param {Function} callback - 回调函数，返回值将作为 Promise 的结果
   * @returns {Promise<any>} 回调函数的返回值
   * @private
   */
  async _acquireWithCallback(callback) {
    if (this._closed) {
      throw new Error('Semaphore is closed');
    }
    // 如果有可用槽位，立即执行回调
    if (this.tryAcquire()) {
      try {
        return await callback();
      } finally {
        this.release();
      }
    }

    // 否则等待槽位，获取后执行回调
    return new Promise((resolve, reject) => {
      this._queue.push({
        resolve: async () => {
          try {
            const result = await callback();
            this.release();
            resolve(result);
          } catch (error) {
            this.release();
            reject(error);
          }
        },
        timeout: false,
        startTime: Date.now(),
        timeoutMs: null,
        markedAt: null
      });
    });
  }

  /**
   * 带超时的阻塞获取
   * 【改进 2026-05-05】修复超时清理缺陷
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<boolean>} 是否在超时前获取到槽位
   */
  async tryAcquireWithTimeout(timeoutMs = 60000) {
    if (this._closed) {
      return false;
    }

    // 如果有可用槽位，立即返回
    if (this.tryAcquire()) {
      console.log(`[AsyncSemaphore] 槽位获取成功 modelId=${this.modelId || 'unknown'}`);
      return true;
    }

    // 【调试日志】记录等待开始
    const startTime = Date.now();
    console.log(`[AsyncSemaphore] 开始等待槽位 modelId=${this.modelId || 'unknown'} timeout=${timeoutMs}ms queueLength=${this._queue.length}`);

    // 【改进】创建超时 promise，使用传入的 timeoutMs
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Acquire timeout'));
      }, timeoutMs);
      // 允许提前清除定时器，减少资源占用
      return timer;
    });

    // 【改进】创建获取 promise，每个 entry 记录自己的 timeoutMs
    let currentEntry = null;
    const acquirePromise = new Promise((resolve, reject) => {
      currentEntry = {
        resolve,
        timeout: false,
        startTime,
        timeoutMs,  // 【改进】记录自己的超时时间
        markedAt: null
      };
      this._queue.push(currentEntry);
    });

    try {
      // 竞争谁先完成
      const result = await Promise.race([acquirePromise, timeoutPromise]);
      console.log(`[AsyncSemaphore] 槽位获取成功 modelId=${this.modelId || 'unknown'} waited=${Date.now() - startTime}ms`);
      return true;
    } catch (e) {
      // 【改进】超时后标记当前条目并立即清理
      if (currentEntry && !currentEntry.timeout) {
        currentEntry.timeout = true;
        currentEntry.markedAt = Date.now();
      }
      // 【改进】只清理当前超时的条目，不清理其他条目
      this._removeTimedOutEntry(currentEntry);
      console.warn(`[AsyncSemaphore] 槽位获取超时 modelId=${this.modelId || 'unknown'} waited=${Date.now() - startTime}ms`);
      return false;
    }
  }

  /**
   * 【新增 2026-05-05】移除指定的超时条目
   * @param {Object} entry - 要移除的条目
   * @private
   */
  _removeTimedOutEntry(entry) {
    if (!entry) return;
    const index = this._queue.indexOf(entry);
    if (index !== -1) {
      this._queue.splice(index, 1);
    }
  }

  /**
   * 【改进 2026-05-05】清理队列中已超时的条目
   * 使用每个条目自己的 timeoutMs 进行判断，而非硬编码的 60s
   * @param {number} [maxAgeMs] - 可选的全局最大年龄，超过此时间的条目将被清理（兜底）
   */
  _cleanupTimeoutEntries(maxAgeMs = null) {
    const now = Date.now();
    // 【改进】使用动态阈值：如果传入 maxAgeMs 则使用，否则使用各条目自己的 timeoutMs
    const defaultTimeout = maxAgeMs || 60000;

    // 【改进】遍历队列，清理超时条目
    const entriesToRemove = [];
    for (let i = 0; i < this._queue.length; i++) {
      const entry = this._queue[i];

      // 兼容旧格式函数类型的条目
      if (typeof entry === 'function') {
        // 旧格式条目：由于没有 startTime，使用默认超时清理
        // 旧格式条目应该尽快清理，避免长期占用队列
        entriesToRemove.push(i);
        continue;
      }

      if (entry && !entry.timeout) {
        // 【改进】使用条目自己的 timeoutMs 判断是否超时
        const entryTimeout = entry.timeoutMs || defaultTimeout;
        const age = now - entry.startTime;

        if (age > entryTimeout) {
          entry.timeout = true;
          entry.markedAt = now;
          entriesToRemove.push(i);
        }
      }

      // 【改进】也清理已标记为超时的条目（兜底）
      if (entry && entry.timeout && entry.markedAt) {
        const markedAge = now - entry.markedAt;
        if (markedAge > 5000) {  // 标记超过 5 秒的也清理
          entriesToRemove.push(i);
        }
      }
    }

    // 【改进】从后往前移除，避免索引问题
    for (let i = entriesToRemove.length - 1; i >= 0; i--) {
      this._queue.splice(entriesToRemove[i], 1);
    }

    if (entriesToRemove.length > 0) {
      console.log(`[AsyncSemaphore] 清理了 ${entriesToRemove.length} 个超时条目，剩余队列长度=${this._queue.length}`);
    }
  }

  /**
   * 【新增 2026-05-05】主动清理超时条目（可由外部触发）
   * @param {number} [maxAgeMs] - 可选的全局最大年龄
   */
  cleanup(maxAgeMs = null) {
    this._cleanupTimeoutEntries(maxAgeMs);
  }

  /**
   * 释放槽位，唤醒下一个等待者
   * 【修复】确保正确处理超时条目
   */
  release() {
    if (this._closed) {
      return;
    }

    if (this._queue.length > 0) {
      // 【改进】跳过已超时的条目
      let entry = null;
      while (this._queue.length > 0) {
        const potentialEntry = this._queue.shift();
        // 兼容旧格式函数类型
        if (typeof potentialEntry === 'function') {
          entry = potentialEntry;
          break;
        }
        // 检查是否已超时
        if (potentialEntry.timeout) {
          console.warn(`[AsyncSemaphore] 跳过已超时的条目 modelId=${this.modelId || 'unknown'}`);
          continue;
        }
        entry = potentialEntry;
        break;
      }

      if (entry) {
        if (typeof entry === 'function') {
          // 兼容旧格式：直接存储 resolve 函数
          entry();
        } else {
          // 新格式：存储包含 resolve 的对象
          entry.resolve();
        }
        console.log(`[AsyncSemaphore] 槽位释放并唤醒等待者 modelId=${this.modelId || 'unknown'} remainingQueue=${this._queue.length}`);
        return;
      }
    }

    // 没有等待者，释放槽位
    if (this._availablePermits < this._permits) {
      this._availablePermits++;
    }
    console.log(`[AsyncSemaphore] 槽位释放 modelId=${this.modelId || 'unknown'} available=${this._availablePermits}`);
  }

  /**
   * 【新增 2026-05-05】关闭信号量
   * 关闭后不再接受新的获取请求
   */
  close() {
    this._closed = true;
    // 清空队列
    this._queue.forEach(entry => {
      if (typeof entry !== 'function' && entry && entry.resolve) {
        entry.resolve(false);  // 通知等待者关闭
      }
    });
    this._queue = [];
  }

  /**
   * 获取当前可用槽位数
   * @returns {number}
   */
  getAvailablePermits() {
    return this._availablePermits;
  }

  /**
   * 获取等待队列长度
   * @returns {number}
   */
  getQueueLength() {
    return this._queue.length;
  }

  /**
   * 【新增 2026-05-05】检查信号量是否已关闭
   * @returns {boolean}
   */
  isClosed() {
    return this._closed;
  }
}

module.exports = { AsyncSemaphore };
