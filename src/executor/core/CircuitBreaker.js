/**
 * CircuitBreaker - 熔断器
 *
 * 防止对持续失败的服务进行无效调用
 *
 * 三种状态：
 * - CLOSED: 正常状态，请求正常通过
 * - OPEN: 熔断状态，请求快速失败
 * - HALF_OPEN: 半开状态，允许一个试探请求
 *
 * 【修复 2026-04-12】添加状态转换锁，防止高并发下的状态不一致
 *
 * @class CircuitBreaker
 */
class CircuitBreaker {
  /**
   * 创建熔断器
   * @param {Object} config - 配置选项
   * @param {number} config.failureThreshold - 触发熔断的失败次数阈值（默认20次）
   * @param {number} config.timeout - 熔断后保持OPEN状态的时间（毫秒，默认60秒）
   * @param {number} config.resetTimeout - 熔断恢复后等待的试探时间（毫秒，默认30秒）
   * @param {number} config.successThreshold - 半开状态下连续成功的最小数量以恢复正常（默认1次）
   * @param {number} config.halfOpenInterval - 半开状态下探测间隔（毫秒，默认1000ms）
   */
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 20;
    this.timeout = config.timeout || 60000; // 60 秒
    this.resetTimeout = config.resetTimeout || 30000; // 30 秒
    this.successThreshold = config.successThreshold || 1; // 半开状态需要的成功次数
    this.halfOpenInterval = config.halfOpenInterval || 1000; // 半开状态探测间隔

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.successCount = 0; // 半开状态下连续成功的次数
    this.lastAttemptTime = 0; // 上次尝试时间

    // 【修复】添加状态锁，防止高并发下的状态不一致
    this._stateLockPromise = Promise.resolve();
    this._lockResolver = null;
  }

  /**
   * 异步获取锁 - 修复版本
   * 使用正确的 Promise 链来实现互斥
   * @private
   */
  async _acquireLock() {
    // 等待当前锁释放
    await this._stateLockPromise;

    // 创建新的锁
    let releaseLock;
    this._stateLockPromise = new Promise(resolve => {
      releaseLock = resolve;
    });

    // 返回释放函数
    return () => {
      releaseLock();
    };
  }

  /**
   * 执行操作，带熔断保护
   * @param {Function} operation - 要执行的操作（返回Promise）
   * @param {Object} context - 上下文信息
   * @returns {Promise<any>} 操作结果
   */
  async execute(operation, context = {}) {
    if (this.state === 'OPEN') {
      // 检查是否可以进入半开状态
      if (Date.now() >= this.nextAttemptTime) {
        await this.toHalfOpen();
      } else {
        // 仍然处于熔断状态，快速失败
        const error = new Error('Circuit breaker is OPEN');
        error.code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      }
    }

    if (this.state === 'HALF_OPEN') {
      // 在半开状态下，限制并发探测
      if (Date.now() - this.lastAttemptTime < this.halfOpenInterval) {
        const error = new Error('Circuit breaker is HALF_OPEN, wait for next attempt');
        error.code = 'CIRCUIT_BREAKER_HALF_OPEN';
        throw error;
      }
      this.lastAttemptTime = Date.now();
    }

    try {
      const result = await operation();

      // 操作成功
      await this.onSuccess();

      return result;
    } catch (error) {
      // 操作失败
      await this.onError();

      throw error;
    }
  }

  /**
   * 记录失败
   * 【修复】使用锁保护状态更新
   */
  async onError() {
    const release = await this._acquireLock();
    try {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // 如果失败次数达到阈值，打开熔断器
      if (this.failureCount >= this.failureThreshold) {
        console.log(`[CircuitBreaker] 失败次数: ${this.failureCount}/${this.failureThreshold}，触发熔断`);
        await this.toOpen();
      }
    } finally {
      release();
    }
  }

  /**
   * 记录成功
   * 【修复】使用锁保护状态更新
   */
  async onSuccess() {
    const release = await this._acquireLock();
    try {
      if (this.state === 'HALF_OPEN') {
        // 在半开状态下成功
        this.successCount++;

        // 如果连续成功次数达到阈值，关闭熔断器
        if (this.successCount >= this.successThreshold) {
          await this.toClosed();
        }
      } else {
        // 在关闭状态下成功，重置失败计数
        this.failureCount = 0;
        this.successCount = 0;
      }
    } finally {
      release();
    }
  }

  /**
   * 转换到关闭状态
   */
  async toClosed() {
    const release = await this._acquireLock();
    try {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.successCount = 0;
      this.nextAttemptTime = null;
      console.log('[CircuitBreaker] Circuit closed -恢复正常服务');
    } finally {
      release();
    }
  }

  /**
   * 转换到打开状态
   */
  async toOpen() {
    const release = await this._acquireLock();
    try {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.timeout;
      this.successCount = 0;
      console.log(`[CircuitBreaker] Circuit opened - 熔断开启，将持续 ${this.timeout}ms`);
    } finally {
      release();
    }
  }

  /**
   * 转换到半开状态
   */
  async toHalfOpen() {
    const release = await this._acquireLock();
    try {
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      this.lastAttemptTime = 0;
      console.log('[CircuitBreaker] Circuit half-opened - 尝试恢复服务');
    } finally {
      release();
    }
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 状态信息
   */
  getStateInfo() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      isReadyToTry: this.state === 'OPEN' && Date.now() >= this.nextAttemptTime
    };
  }

  /**
   * 强制重置熔断器
   */
  async forceReset() {
    const release = await this._acquireLock();
    try {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.successCount = 0;
      this.lastFailureTime = null;
      this.nextAttemptTime = null;
      console.log('[CircuitBreaker] Circuit forced reset');
    } finally {
      release();
    }
  }

  /**
   * 强制打开熔断器
   */
  async forceOpen() {
    const release = await this._acquireLock();
    try {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.timeout;
      console.log('[CircuitBreaker] Circuit forced open');
    } finally {
      release();
    }
  }

  /**
   * 获取熔断器统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureThreshold: this.failureThreshold,
      totalFailures: this.failureCount, // 累积故障数
      circuitOpenUntil: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null,
      timeToNextAttempt: this.nextAttemptTime ? this.nextAttemptTime - Date.now() : 0
    };
  }
}

module.exports = CircuitBreaker;