/**
 * RateLimiter - 限流器
 *
 * 实现令牌桶算法，支持多模型速率限制
 * 用于控制 API 请求速率，避免触发模型的速率限制
 *
 * 【改进 2026-03-28】支持请求类型区分，为健康检查和用户请求使用不同的限流配置
 *
 * @class RateLimiter
 */
const { AsyncSemaphore } = require('../utils/AsyncSemaphore');

class RateLimiter {
  /**
   * 创建限流器
   * 支持两种模式：
   * 1. 传统模式：使用配置对象（向后兼容）
   * 2. 新模式：使用参数（rate, capacity, modelId, requestType）
   */
  constructor(configOrRate, capacity, modelId, requestType = 'user') {
    // 检查第一个参数是否为配置对象（传统模式）
    if (typeof configOrRate === 'object' && configOrRate !== null && configOrRate !== undefined) {
      // 传统模式 - 保持向后兼容
      const config = configOrRate || {};
      this.config = {
        defaultRps: config.defaultRps || 10,
        defaultBurst: config.defaultBurst || 20,
        modelLimits: config.modelLimits || {},
        ...config
      };

      // 每个模型的令牌桶
      this.buckets = new Map();

      // 全局限流器
      this.globalBucket = this._createBucket(
        this.config.defaultRps,
        this.config.defaultBurst
      );

      // 标记为传统模式
      this.isLegacyMode = true;
    } else {
      // 新模式 - 请求类型区分
      this.rate = configOrRate; // 令牌生成速率（个/秒）
      this.capacity = capacity; // 桶容量
      this.modelId = modelId;
      this.requestType = requestType; // 'user' 或 'health'
      this.tokens = capacity; // 当前令牌数
      this.lastRefill = Date.now(); // 上次补充令牌时间
      this.isLegacyMode = false;

      // 创建信号量（互斥，1个槽位）
      this.lock = new AsyncSemaphore(1, this.modelId);
      // 【优化】用于阻塞等待的信号量
      this._waitSemaphore = new AsyncSemaphore(0, this.modelId);
      // 【优化】等待令牌的数量
      this._waiters = 0;
      // 【修复】启动定期令牌补充定时器
      this._startTokenReplenishTimer();
    }
  }

  /**
   * 【修复】启动定期令牌补充定时器
   * 确保即使没有新请求触发，也能唤醒等待者
   * 优化：只在有等待者时才运行定时器
   * @private
   */
  _startTokenReplenishTimer() {
    // 每100ms检查一次令牌补充和等待者唤醒
    this._replenishInterval = setInterval(() => {
      // 【优化】只有当有等待者时才处理
      if (this._waiters > 0) {
        this.lock.acquire().then(() => {
          try {
            this._notifyWaitersIfNeeded();
          } finally {
            this.lock.release();
          }
        }).catch(() => {});
      }
      // 【优化】如果没有等待者，可以考虑暂停定时器（但不停止，以支持后续请求）
    }, 100);

    // 确保定时器不会阻止进程退出
    this._replenishInterval.unref();
  }

  /**
   * 停止定期补充定时器（用于清理）
   */
  stopReplenishTimer() {
    if (this._replenishInterval) {
      clearInterval(this._replenishInterval);
      this._replenishInterval = null;
    }
  }

  /**
   * 【新增】销毁方法，清理所有资源
   * 确保定时器被正确停止
   */
  destroy() {
    this.stopReplenishTimer();
    // 清理其他资源
    if (this.lock) {
      this.lock = null;
    }
    if (this._waitSemaphore) {
      this._waitSemaphore = null;
    }
  }

  // 传统模式私有方法
  _createBucket(rps, burst) {
    return {
      tokens: burst,
      capacity: burst,
      refillRate: rps,
      lastRefill: Date.now()
    };
  }

  _getBucket(modelId) {
    if (!this.isLegacyMode) {
      throw new Error("getBucket is only available in legacy mode");
    }

    if (!this.buckets.has(modelId)) {
      const limits = this.config.modelLimits[modelId] || {};
      const rps = limits.rps || this.config.defaultRps;
      const burst = limits.burst || this.config.defaultBurst;

      this.buckets.set(modelId, this._createBucket(rps, burst));
    }

    return this.buckets.get(modelId);
  }

  _refillBucket(bucket) {
    if (!this.isLegacyMode) {
      throw new Error("refillBucket is only available in legacy mode");
    }

    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // 转换为秒

    const newTokens = elapsed * bucket.refillRate;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  // 传统模式的获取令牌方法
  _tryAcquireLegacy(modelId, tokens = 1) {
    if (!this.isLegacyMode) {
      throw new Error("tryAcquireLegacy is only available in legacy mode");
    }

    const bucket = this._getBucket(modelId);
    this._refillBucket(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  async _acquireLegacy(modelId, tokens = 1, timeoutMs = 10000) {
    if (!this.isLegacyMode) {
      throw new Error("acquireLegacy is only available in legacy mode");
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this._tryAcquireLegacy(modelId, tokens)) {
        return true;
      }

      // 等待一小段时间后重试
      await this._sleep(50);
    }

    return false;
  }

  // 新模式的获取令牌方法
  async _acquireNew(tokens = 1, timeout = 5000) {
    if (this.isLegacyMode) {
      throw new Error("_acquireNew is only available in new mode");
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this._tryAcquireNew(tokens)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Rate limit exceeded for model ${this.modelId} (${this.requestType})`);
  }

  async _tryAcquireNew(tokens = 1) {
    if (this.isLegacyMode) {
      throw new Error("_tryAcquireNew is only available in new mode");
    }

    await this.lock.acquire();
    try {
      // 补充令牌并唤醒等待者
      this._notifyWaitersIfNeeded();

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return true;
      }
      return false;
    } finally {
      this.lock.release();
    }
  }

  /**
   * 【优化】通知等待者令牌已补充
   * 每次补充令牌后调用此方法唤醒等待者
   * @private
   */
  _notifyWaitersIfNeeded() {
    // 补充令牌
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const newTokens = timePassed * this.rate;

    if (newTokens > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }

    // 如果有等待者且令牌充足，唤醒它们
    while (this._waiters > 0 && this.tokens >= 1) {
      this._waiters--;
      this._waitSemaphore.release();
      this.tokens--;
      console.log(`[RateLimiter] 唤醒等待者 model=${this.modelId || 'unknown'} remainingWaiters=${this._waiters}`);
    }
  }

  /**
   * 【修复】显式释放令牌（任务执行完成后调用）
   * @param {number} tokens - 要释放的令牌数
   */
  releaseTokens(tokens = 1) {
    this.tokens = Math.min(this.capacity, this.tokens + tokens);
    console.log(`[RateLimiter] 释放令牌 model=${this.modelId || 'unknown'} released=${tokens} current=${this.tokens}`);
    // 释放后尝试唤醒等待者
    this._notifyWaitersIfNeeded();
  }

  /**
   * 【优化】带阻塞等待的获取令牌
   * 【修复 P5】使用 try-finally 确保 _waiters 计数配对
   * @param {number} tokens - 需要获取的令牌数
   * @param {number} timeoutMs - 超时时间（毫秒），默认30秒
   * @returns {Promise<boolean>} 是否成功获取
   */
  async _waitForToken(tokens, timeoutMs) {
    let acquired = false;
    try {
      // 使用信号量等待，阻塞而非忙轮询
      await this._waitSemaphore.tryAcquireWithTimeout(timeoutMs);
      acquired = true;
      return true;
    } catch (e) {
      // 超时
      return false;
    } finally {
      // 【修复 P5】无论成功或失败，都减少等待计数
      // 注意：成功时 acquired=true，由调用方减少计数（因为调用方先 ++）
      // 但如果这里也减少，就会导致双重递减
      // 所以我们把减少操作放在调用方统一处理
      if (!acquired && this._waiters > 0) {
        this._waiters--;
      }
    }
  }

  /**
   * 【改进】减少等待时间以提高并发效率
   * 【修复 P5】统一 _waiters 计数管理
   * @param {number} tokens - 需要获取的令牌数
   * @param {number} timeoutMs - 超时时间（毫秒），默认30秒
   */
  async _acquireWithWaitNew(tokens = 1, timeoutMs = 60000) {
    if (this.isLegacyMode) {
      throw new Error("_acquireWithWaitNew is only available in new mode");
    }

    const startTime = Date.now();
    const modelId = this.modelId || 'unknown';

    console.log(`[RateLimiter] 开始等待令牌 model=${modelId} tokens=${tokens} timeout=${timeoutMs}ms`);

    // 【优化】获取令牌，如果不够则阻塞等待
    while (!(await this._tryAcquireNew(tokens))) {
      // 【检查超时】
      if (Date.now() - startTime > timeoutMs) {
        console.error(`[RateLimiter] 等待令牌超时 model=${modelId} waited=${Date.now() - startTime}ms`);
        // 【修复 P5】不在这里递减，由 _waitForToken 的 finally 统一处理
        throw new Error(`Rate limiter wait timeout for model ${modelId} (${timeoutMs}ms)`);
      }
      // 【优化】阻塞等待而非忙轮询
      this._waiters++;
      const waitResult = await this._waitForToken(tokens, timeoutMs - (Date.now() - startTime));
      // 【修复 P5】成功时减少计数（失败时 _waitForToken 已处理）
      if (waitResult) {
        this._waiters--;  // 成功获取，移除等待标记
      }
      if (!waitResult) {
        console.error(`[RateLimiter] 等待令牌超时 model=${modelId} waited=${Date.now() - startTime}ms`);
        throw new Error(`Rate limiter wait timeout for model ${modelId} (${timeoutMs}ms)`);
      }
    }

    console.log(`[RateLimiter] 令牌获取成功 model=${modelId} waited=${Date.now() - startTime}ms`);
  }

  /**
   * 【新增】获取当前令牌状态
   */
  getTokenStatus() {
    if (this.isLegacyMode) {
      throw new Error("getTokenStatus is only available in new mode");
    }

    return {
      tokens: this.tokens,
      capacity: this.capacity,
      rate: this.rate,
      requestType: this.requestType
    };
  }

  // 公共API - 根据模式路由到正确的实现
  tryAcquire(modelIdOrTokens, tokens = 1) {
    if (this.isLegacyMode) {
      // 在传统模式下，第一个参数是modelId
      return this._tryAcquireLegacy(modelIdOrTokens, tokens);
    } else {
      // 在新模式下，第一个参数是tokens
      return this._tryAcquireNew(modelIdOrTokens);
    }
  }

  async acquire(modelIdOrTokens, tokensOrTimeout, timeoutOrUndefined) {
    if (this.isLegacyMode) {
      // 传统模式: acquire(modelId, tokens, timeoutMs)
      const modelId = modelIdOrTokens;
      const tokenCount = tokensOrTimeout !== undefined ? tokensOrTimeout : 1;
      const timeoutMs = timeoutOrUndefined !== undefined ? timeoutOrUndefined : 10000;

      return await this._acquireLegacy(modelId, tokenCount, timeoutMs);
    } else {
      // 新模式: acquire(tokens, timeout)
      const tokenCount = modelIdOrTokens !== undefined ? modelIdOrTokens : 1;
      const timeout = tokensOrTimeout !== undefined ? tokensOrTimeout : 5000;

      return await this._acquireNew(tokenCount, timeout);
    }
  }

  /**
   * 带超时的获取令牌方法
   * 【修复 P5】统一 _waiters 计数管理
   * @param {number} tokens - 需要获取的令牌数
   * @param {number} timeoutMs - 超时时间（毫秒），默认30秒
   */
  async acquireWithWait(tokens = 1, timeoutMs = 60000) {
    if (this.isLegacyMode) {
      throw new Error("acquireWithWait is only available in new mode");
    }

    const startTime = Date.now();
    const modelId = this.modelId || 'unknown';

    console.log(`[RateLimiter] 开始等待令牌 model=${modelId} tokens=${tokens} timeout=${timeoutMs}ms`);

    // 【优化】获取令牌，如果不够则阻塞等待
    while (!(await this._tryAcquireNew(tokens))) {
      // 【检查超时】
      if (Date.now() - startTime > timeoutMs) {
        console.error(`[RateLimiter] 等待令牌超时 model=${modelId} waited=${Date.now() - startTime}ms`);
        // 【修复 P5】不在这里递减，由 _waitForToken 的 finally 统一处理
        throw new Error(`Rate limiter wait timeout for model ${modelId} (${timeoutMs}ms)`);
      }
      // 【优化】阻塞等待而非忙轮询
      this._waiters++;
      const waitResult = await this._waitForToken(tokens, timeoutMs - (Date.now() - startTime));
      // 【修复 P5】成功时减少计数（失败时 _waitForToken 已处理）
      if (waitResult) {
        this._waiters--;  // 成功获取，移除等待标记
      }
      if (!waitResult) {
        console.error(`[RateLimiter] 等待令牌超时 model=${modelId} waited=${Date.now() - startTime}ms`);
        throw new Error(`Rate limiter wait timeout for model ${modelId} (${timeoutMs}ms)`);
      }
    }

    console.log(`[RateLimiter] 令牌获取成功 model=${modelId} waited=${Date.now() - startTime}ms`);
  }

  // 传统模式的方法
  async execute(modelId, operation, options = {}) {
    if (!this.isLegacyMode) {
      throw new Error("execute is only available in legacy mode");
    }

    const { tokens = 1, timeoutMs = 10000 } = options;

    // 等待获取令牌
    const acquired = await this._acquireLegacy(modelId, tokens, timeoutMs);

    if (!acquired) {
      throw new Error(`等待令牌超时：模型 ${modelId}`);
    }

    // 执行操作
    return await operation();
  }

  getWaitTime(modelId) {
    if (!this.isLegacyMode) {
      throw new Error("getWaitTime is only available in legacy mode");
    }

    const bucket = this._getBucket(modelId);
    this._refillBucket(bucket);

    if (bucket.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - bucket.tokens;
    const waitTime = (tokensNeeded / bucket.refillRate) * 1000;
    return Math.ceil(waitTime);
  }

  getStatus(modelId) {
    if (!this.isLegacyMode) {
      throw new Error("getStatus is only available in legacy mode");
    }

    const bucket = this._getBucket(modelId);
    this._refillBucket(bucket);

    return {
      modelId,
      availableTokens: bucket.tokens,
      capacity: bucket.capacity,
      refillRate: bucket.refillRate,
      waitTime: this.getWaitTime(modelId),
      isLimited: bucket.tokens < 1
    };
  }

  getAllStatus() {
    if (!this.isLegacyMode) {
      throw new Error("getAllStatus is only available in legacy mode");
    }

    const status = {
      global: this.getStatus('global'),
      models: {}
    };

    for (const modelId of this.buckets.keys()) {
      status.models[modelId] = this.getStatus(modelId);
    }

    return status;
  }

  updateModelLimits(modelId, limits) {
    if (!this.isLegacyMode) {
      throw new Error("updateModelLimits is only available in legacy mode");
    }

    this.config.modelLimits[modelId] = {
      ...this.config.modelLimits[modelId],
      ...limits
    };

    // 如果桶已存在，更新其配置
    if (this.buckets.has(modelId)) {
      const bucket = this.buckets.get(modelId);
      bucket.refillRate = limits.rps || bucket.refillRate;
      bucket.capacity = limits.burst || bucket.capacity;
    }
  }

  reset(modelId) {
    if (!this.isLegacyMode) {
      throw new Error("reset is only available in legacy mode");
    }

    if (modelId) {
      if (this.buckets.has(modelId)) {
        const limits = this.config.modelLimits[modelId] || {};
        const burst = limits.burst || this.config.defaultBurst;
        const bucket = this.buckets.get(modelId);
        bucket.tokens = burst;
        bucket.lastRefill = Date.now();
      }
    } else {
      // 重置所有限流器
      this.buckets.clear();
      this.globalBucket = this._createBucket(
        this.config.defaultRps,
        this.config.defaultBurst
      );
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 同时支持解构导入和直接类导入（向后兼容）
module.exports = RateLimiter; // 直接类导入（传统方式）
module.exports.RateLimiter = RateLimiter; // 解构导入