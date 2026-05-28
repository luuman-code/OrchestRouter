/**
 * ExecutionInfoCollector - 执行信息收集器
 *
 * 用于收集和记录执行过程中的各类信息
 */
class ExecutionInfoCollector {
  /**
   * 创建执行信息收集器
   */
  constructor() {
    this.waitTimes = {
      concurrency: [],
      rateLimit: []
    };

    this.retries = [];
    this.costs = {
      estimated: [],
      actual: []
    };

    this.executionPhases = [];
    this.executionInfo = {
      concurrency_wait_time: 0,
      rate_limit_wait_time: 0,
      retry_count: 0,
      retry_details: [],
      estimated_cost: 0,
      actual_cost: 0,
      cost_variance: 0,
      execution_reasons: []
    };
  }

  /**
   * 记录等待时间
   * @param {string} type - 等待类型 ('concurrency' 或 'rateLimit')
   * @param {number} duration - 等待持续时间（毫秒）
   */
  recordWaitTime(type, duration) {
    if (!['concurrency', 'rateLimit'].includes(type)) {
      throw new Error('Invalid wait type. Must be "concurrency" or "rateLimit"');
    }

    this.waitTimes[type].push({
      duration,
      timestamp: new Date()
    });

    // 累加到执行信息中
    if (type === 'concurrency') {
      this.executionInfo.concurrency_wait_time += duration;
    } else if (type === 'rateLimit') {
      this.executionInfo.rate_limit_wait_time += duration;
    }
  }

  /**
   * 记录重试
   * @param {number} attempt - 尝试次数
   * @param {Error} error - 错误对象
   * @param {number} delay - 重试延迟时间（毫秒）
   */
  recordRetry(attempt, error, delay) {
    const retryRecord = {
      attempt,
      error: error.message || error,
      delay,
      timestamp: new Date()
    };

    this.retries.push(retryRecord);
    this.executionInfo.retry_count = Math.max(this.executionInfo.retry_count, attempt);
    this.executionInfo.retry_details.push(retryRecord);
  }

  /**
   * 记录成本
   * @param {number} estimated - 预估成本
   * @param {number} actual - 实际成本
   */
  recordCost(estimated, actual) {
    this.costs.estimated.push(estimated);
    this.costs.actual.push(actual);

    this.executionInfo.estimated_cost += estimated || 0;
    this.executionInfo.actual_cost += actual || 0;
    this.executionInfo.cost_variance = this.executionInfo.actual_cost - this.executionInfo.estimated_cost;
  }

  /**
   * 记录执行阶段
   * @param {string} phase - 执行阶段
   * @param {string} action - 执行动作
   * @param {string} reason - 执行原因
   */
  recordExecutionPhase(phase, action, reason) {
    const phaseRecord = {
      phase,
      action,
      reason,
      timestamp: new Date()
    };

    this.executionPhases.push(phaseRecord);
    this.executionInfo.execution_reasons.push(phaseRecord);
  }

  /**
   * 获取执行信息摘要
   * @returns {Object} 执行信息摘要
   */
  getExecutionInfo() {
    return {
      ...this.executionInfo,
      wait_times: {
        concurrency: [...this.waitTimes.concurrency],
        rateLimit: [...this.waitTimes.rateLimit]
      },
      retries: [...this.retries],
      costs: {
        estimated: [...this.costs.estimated],
        actual: [...this.costs.actual]
      },
      execution_phases: [...this.executionPhases],
      statistics: this.calculateStatistics()
    };
  }

  /**
   * 重置收集器状态
   */
  reset() {
    this.waitTimes = {
      concurrency: [],
      rateLimit: []
    };

    this.retries = [];
    this.costs = {
      estimated: [],
      actual: []
    };

    this.executionPhases = [];
    this.executionInfo = {
      concurrency_wait_time: 0,
      rate_limit_wait_time: 0,
      retry_count: 0,
      retry_details: [],
      estimated_cost: 0,
      actual_cost: 0,
      cost_variance: 0,
      execution_reasons: []
    };
  }

  /**
   * 计算统计信息
   * @returns {Object} 统计信息
   */
  calculateStatistics() {
    const stats = {};

    // 计算等待时间统计
    if (this.waitTimes.concurrency.length > 0) {
      const concurrencyDurations = this.waitTimes.concurrency.map(wt => wt.duration);
      stats.concurrency_wait = {
        count: this.waitTimes.concurrency.length,
        total: concurrencyDurations.reduce((sum, val) => sum + val, 0),
        avg: concurrencyDurations.reduce((sum, val) => sum + val, 0) / concurrencyDurations.length,
        min: Math.min(...concurrencyDurations),
        max: Math.max(...concurrencyDurations)
      };
    }

    if (this.waitTimes.rateLimit.length > 0) {
      const rateLimitDurations = this.waitTimes.rateLimit.map(wt => wt.duration);
      stats.rate_limit_wait = {
        count: this.waitTimes.rateLimit.length,
        total: rateLimitDurations.reduce((sum, val) => sum + val, 0),
        avg: rateLimitDurations.reduce((sum, val) => sum + val, 0) / rateLimitDurations.length,
        min: Math.min(...rateLimitDurations),
        max: Math.max(...rateLimitDurations)
      };
    }

    // 计算重试统计
    if (this.retries.length > 0) {
      stats.retries = {
        count: this.retries.length,
        max_attempts: Math.max(...this.retries.map(r => r.attempt)),
        avg_delay: this.retries.reduce((sum, retry) => sum + retry.delay, 0) / this.retries.length
      };
    }

    // 计算成本统计
    if (this.costs.estimated.length > 0) {
      stats.costs = {
        estimated_total: this.costs.estimated.reduce((sum, val) => sum + val, 0),
        actual_total: this.costs.actual.reduce((sum, val) => sum + val, 0),
        variance_total: this.costs.actual.reduce((sum, val, idx) => sum + (val - (this.costs.estimated[idx] || 0)), 0)
      };
    }

    return stats;
  }

  /**
   * 获取汇总信息
   * @returns {Object} 汇总信息
   */
  getSummary() {
    const stats = this.calculateStatistics();

    return {
      total_tasks: this.executionPhases.length,
      total_retries: this.retries.length,
      total_concurrency_wait_time: this.executionInfo.concurrency_wait_time,
      total_rate_limit_wait_time: this.executionInfo.rate_limit_wait_time,
      total_estimated_cost: this.executionInfo.estimated_cost,
      total_actual_cost: this.executionInfo.actual_cost,
      statistics: stats
    };
  }
}

module.exports = ExecutionInfoCollector;