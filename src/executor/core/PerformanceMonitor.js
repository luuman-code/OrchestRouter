/**
 * PerformanceMonitor - 性能监控器
 *
 * 收集执行性能指标，提供性能分析数据
 * 支持滑动窗口统计、实时指标计算
 *
 * @class PerformanceMonitor
 */
class PerformanceMonitor {
  /**
   * 创建性能监控器
   * @param {Object} options - 配置选项
   * @param {number} options.windowSize - 滑动窗口大小（默认 1000）
   */
  constructor(options = {}) {
    this.metrics = {
      executionTimes: [],      // 执行时间数组
      successRates: [],        // 成功率数组
      errorTypes: {},          // 错误类型统计
      throughput: 0,           // 吞吐量（请求/秒）
      concurrencyLevels: [],   // 并发水平
      modelMetrics: {},        // 按模型分类的指标
      hourlyStats: {}          // 小时级别统计
    };

    this.windowSize = options.windowSize || 1000;
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalSuccess = 0;
    this.totalFailures = 0;

    // 当前并发数
    this.currentConcurrency = 0;
    this.maxConcurrency = 0;

    // 模型级别的指标
    this.modelMetrics = new Map();
  }

  /**
   * 记录执行信息
   * @param {Date|number} start - 开始时间
   * @param {Date|number} end - 结束时间
   * @param {boolean} success - 是否成功
   * @param {string} errorType - 错误类型（可选）
   * @param {string} modelId - 模型 ID（可选）
   * @param {Object} extra - 额外指标（可选）
   */
  recordExecution(start, end, success, errorType = null, modelId = null, extra = null) {
    const startTime = start instanceof Date ? start.getTime() : start;
    const endTime = end instanceof Date ? end.getTime() : end;
    const duration = endTime - startTime;

    this.totalRequests++;
    if (success) {
      this.totalSuccess++;
    } else {
      this.totalFailures++;
    }

    // 维护滑动窗口 - 执行时间
    this.metrics.executionTimes.push(duration);
    if (this.metrics.executionTimes.length > this.windowSize) {
      this.metrics.executionTimes.shift();
    }

    // 维护滑动窗口 - 成功率
    this.metrics.successRates.push(success ? 1 : 0);
    if (this.metrics.successRates.length > this.windowSize) {
      this.metrics.successRates.shift();
    }

    // 统计错误类型
    if (errorType && !success) {
      this.metrics.errorTypes[errorType] = (this.metrics.errorTypes[errorType] || 0) + 1;
    }

    // 计算吞吐量（请求数/时间）
    const elapsed = (Date.now() - this.startTime) / 1000; // 秒
    this.metrics.throughput = elapsed > 0 ? this.totalRequests / elapsed : 0;

    // 记录模型级别指标
    if (modelId) {
      this._recordModelMetric(modelId, duration, success, errorType);
    }

    // 记录小时级统计
    this._recordHourlyStat(success, duration);

    // 记录额外指标
    if (extra) {
      this._recordExtraMetrics(extra);
    }
  }

  /**
   * 记录模型级别指标
   * @param {string} modelId - 模型 ID
   * @param {number} duration - 执行时间
   * @param {boolean} success - 是否成功
   * @param {string} errorType - 错误类型
   * @private
   */
  _recordModelMetric(modelId, duration, success, errorType) {
    if (!this.modelMetrics.has(modelId)) {
      this.modelMetrics.set(modelId, {
        executionTimes: [],
        successRates: [],
        errorTypes: {},
        totalRequests: 0,
        totalSuccess: 0,
        totalFailures: 0
      });
    }

    const metric = this.modelMetrics.get(modelId);
    metric.totalRequests++;
    if (success) {
      metric.totalSuccess++;
    } else {
      metric.totalFailures++;
    }

    metric.executionTimes.push(duration);
    if (metric.executionTimes.length > this.windowSize) {
      metric.executionTimes.shift();
    }

    metric.successRates.push(success ? 1 : 0);
    if (metric.successRates.length > this.windowSize) {
      metric.successRates.shift();
    }

    if (errorType && !success) {
      metric.errorTypes[errorType] = (metric.errorTypes[errorType] || 0) + 1;
    }
  }

  /**
   * 记录小时级统计
   * @param {boolean} success - 是否成功
   * @param {number} duration - 执行时间
   * @private
   */
  _recordHourlyStat(success, duration) {
    const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    if (!this.metrics.hourlyStats[hourKey]) {
      this.metrics.hourlyStats[hourKey] = {
        totalRequests: 0,
        totalSuccess: 0,
        totalFailures: 0,
        totalDuration: 0
      };
    }

    const stat = this.metrics.hourlyStats[hourKey];
    stat.totalRequests++;
    if (success) {
      stat.totalSuccess++;
    } else {
      stat.totalFailures++;
    }
    stat.totalDuration += duration;
  }

  /**
   * 记录额外指标
   * @param {Object} extra - 额外指标
   * @private
   */
  _recordExtraMetrics(extra) {
    // 记录 token 使用信息
    if (extra.tokens) {
      if (!this.metrics.tokenUsage) {
        this.metrics.tokenUsage = {
          input: [],
          output: [],
          total: []
        };
      }
      if (extra.tokens.input !== undefined) {
        this.metrics.tokenUsage.input.push(extra.tokens.input);
        if (this.metrics.tokenUsage.input.length > this.windowSize) {
          this.metrics.tokenUsage.input.shift();
        }
      }
      if (extra.tokens.output !== undefined) {
        this.metrics.tokenUsage.output.push(extra.tokens.output);
        if (this.metrics.tokenUsage.output.length > this.windowSize) {
          this.metrics.tokenUsage.output.shift();
        }
      }
      if (extra.tokens.total !== undefined) {
        this.metrics.tokenUsage.total.push(extra.tokens.total);
        if (this.metrics.tokenUsage.total.length > this.windowSize) {
          this.metrics.tokenUsage.total.shift();
        }
      }
    }

    // 记录成本信息
    if (extra.cost !== undefined) {
      if (!this.metrics.costs) {
        this.metrics.costs = [];
      }
      this.metrics.costs.push(extra.cost);
      if (this.metrics.costs.length > this.windowSize) {
        this.metrics.costs.shift();
      }
    }

    // 记录并发水平
    if (extra.concurrency !== undefined) {
      this.metrics.concurrencyLevels.push(extra.concurrency);
      if (this.metrics.concurrencyLevels.length > this.windowSize) {
        this.metrics.concurrencyLevels.shift();
      }
    }
  }

  /**
   * 记录并发水平
   * @param {number} concurrency - 当前并发数
   */
  recordConcurrency(concurrency) {
    this.currentConcurrency = concurrency;
    this.maxConcurrency = Math.max(this.maxConcurrency, concurrency);

    this.metrics.concurrencyLevels.push(concurrency);
    if (this.metrics.concurrencyLevels.length > this.windowSize) {
      this.metrics.concurrencyLevels.shift();
    }
  }

  /**
   * 增加当前并发数
   */
  incrementConcurrency() {
    this.currentConcurrency++;
    this.maxConcurrency = Math.max(this.maxConcurrency, this.currentConcurrency);
    this.recordConcurrency(this.currentConcurrency);
  }

  /**
   * 减少当前并发数
   */
  decrementConcurrency() {
    this.currentConcurrency = Math.max(0, this.currentConcurrency - 1);
    this.recordConcurrency(this.currentConcurrency);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      // 整体统计
      totalRequests: this.totalRequests,
      totalSuccess: this.totalSuccess,
      totalFailures: this.totalFailures,
      overallSuccessRate: this.totalRequests > 0 ? this.totalSuccess / this.totalRequests : 0,

      // 滑动窗口统计
      avgExecutionTime: this._average(this.metrics.executionTimes),
      p50ExecutionTime: this._percentile(this.metrics.executionTimes, 50),
      p95ExecutionTime: this._percentile(this.metrics.executionTimes, 95),
      p99ExecutionTime: this._percentile(this.metrics.executionTimes, 99),
      successRate: this._average(this.metrics.successRates),
      throughput: this.metrics.throughput,
      errorDistribution: { ...this.metrics.errorTypes },

      // 并发统计
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      avgConcurrency: this._average(this.metrics.concurrencyLevels),

      // 运行时间
      uptime: Date.now() - this.startTime,

      // 小时级统计
      hourlyStats: { ...this.metrics.hourlyStats }
    };

    // 添加 token 使用统计
    if (this.metrics.tokenUsage) {
      stats.tokenUsage = {
        avgInputTokens: this._average(this.metrics.tokenUsage.input || []),
        avgOutputTokens: this._average(this.metrics.tokenUsage.output || []),
        avgTotalTokens: this._average(this.metrics.tokenUsage.total || []),
        p95InputTokens: this._percentile(this.metrics.tokenUsage.input || [], 95),
        p95OutputTokens: this._percentile(this.metrics.tokenUsage.output || [], 95),
        p95TotalTokens: this._percentile(this.metrics.tokenUsage.total || [], 95)
      };
    }

    // 添加成本统计
    if (this.metrics.costs) {
      stats.costStats = {
        avgCost: this._average(this.metrics.costs),
        totalCost: this.metrics.costs.reduce((sum, c) => sum + c, 0),
        p95Cost: this._percentile(this.metrics.costs, 95),
        maxCost: Math.max(...this.metrics.costs, 0)
      };
    }

    return stats;
  }

  /**
   * 获取指定模型的统计信息
   * @param {string} modelId - 模型 ID
   * @returns {Object|null} 模型统计信息
   */
  getModelStats(modelId) {
    if (!this.modelMetrics.has(modelId)) {
      return null;
    }

    const metric = this.modelMetrics.get(modelId);
    return {
      modelId,
      totalRequests: metric.totalRequests,
      totalSuccess: metric.totalSuccess,
      totalFailures: metric.totalFailures,
      successRate: metric.totalRequests > 0 ? metric.totalSuccess / metric.totalRequests : 0,
      avgExecutionTime: this._average(metric.executionTimes),
      p95ExecutionTime: this._percentile(metric.executionTimes, 95),
      p99ExecutionTime: this._percentile(metric.executionTimes, 99),
      errorDistribution: { ...metric.errorTypes }
    };
  }

  /**
   * 获取所有模型的统计信息
   * @returns {Object} 所有模型的统计信息
   */
  getAllModelStats() {
    const stats = {};
    for (const [modelId, metric] of this.modelMetrics.entries()) {
      stats[modelId] = this.getModelStats(modelId);
    }
    return stats;
  }

  /**
   * 获取错误类型分布
   * @returns {Object} 错误类型分布
   */
  getErrorDistribution() {
    return { ...this.metrics.errorTypes };
  }

  /**
   * 获取吞吐量趋势
   * @param {number} points - 数据点数
   * @returns {Array<number>} 吞吐量数组
   */
  getThroughputTrend(points = 60) {
    // 简单实现：返回最近点的吞吐量
    return [this.metrics.throughput];
  }

  /**
   * 重置所有统计
   */
  reset() {
    this.metrics = {
      executionTimes: [],
      successRates: [],
      errorTypes: {},
      throughput: 0,
      concurrencyLevels: [],
      modelMetrics: {},
      hourlyStats: {}
    };
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalSuccess = 0;
    this.totalFailures = 0;
    this.currentConcurrency = 0;
    this.maxConcurrency = 0;
    this.modelMetrics = new Map();
  }

  /**
   * 计算平均值
   * @param {number[]} arr - 数值数组
   * @returns {number} 平均值
   */
  _average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * 计算百分位数
   * @param {number[]} arr - 数值数组
   * @param {number} percentile - 百分位（0-100）
   * @returns {number} 百分位数值
   * 【优化】使用缓存避免重复排序
   */
  _percentile(arr, percentile, cacheKey = 'default') {
    if (arr.length === 0) return 0;

    // 如果数组很小（< 100），直接排序
    if (arr.length < 100) {
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.floor(sorted.length * percentile / 100);
      return sorted[Math.min(index, sorted.length - 1)];
    }

    // 对于大数组，使用采样近似算法
    // 采样 1000 个元素或全部（取较小者）
    const sampleSize = Math.min(1000, arr.length);
    const step = Math.max(1, Math.floor(arr.length / sampleSize));
    const sampled = [];
    for (let i = 0; i < arr.length; i += step) {
      sampled.push(arr[i]);
    }
    // 确保最后一个元素被包含
    if (sampled[sampled.length - 1] !== arr[arr.length - 1]) {
      sampled.push(arr[arr.length - 1]);
    }

    const sorted = sampled.sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile / 100);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  /**
   * 获取健康状态
   * @returns {Object} 健康状态信息
   */
  getHealthStatus() {
    const stats = this.getStats();
    const health = {
      status: 'healthy',
      issues: []
    };

    // 检查成功率
    if (stats.successRate < 0.9) {
      health.issues.push(`成功率过低：${(stats.successRate * 100).toFixed(1)}%`);
      health.status = 'warning';
    }
    if (stats.successRate < 0.5) {
      health.status = 'critical';
    }

    // 检查平均执行时间
    if (stats.avgExecutionTime > 5000) {
      health.issues.push(`平均执行时间过长：${stats.avgExecutionTime.toFixed(0)}ms`);
      if (health.status === 'healthy') {
        health.status = 'warning';
      }
    }
    if (stats.avgExecutionTime > 30000) {
      health.status = 'critical';
    }

    // 检查吞吐量
    if (stats.throughput < 0.1 && stats.totalRequests > 10) {
      health.issues.push(`吞吐量过低：${stats.throughput.toFixed(2)} 请求/秒`);
      if (health.status === 'healthy') {
        health.status = 'warning';
      }
    }

    return health;
  }

  /**
   * 导出指标为 Prometheus 格式
   * @returns {string} Prometheus 格式的指标
   */
  exportPrometheusMetrics() {
    const stats = this.getStats();
    const lines = [];

    lines.push(`# HELP executor_requests_total Total requests processed`);
    lines.push(`# TYPE executor_requests_total counter`);
    lines.push(`executor_requests_total ${stats.totalRequests}`);

    lines.push(`# HELP executor_requests_success_total Total successful requests`);
    lines.push(`# TYPE executor_requests_success_total counter`);
    lines.push(`executor_requests_success_total ${stats.totalSuccess}`);

    lines.push(`# HELP executor_requests_failed_total Total failed requests`);
    lines.push(`# TYPE executor_requests_failed_total counter`);
    lines.push(`executor_requests_failed_total ${stats.totalFailures}`);

    lines.push(`# HELP executor_request_duration_seconds Request duration in seconds`);
    lines.push(`# TYPE executor_request_duration_seconds summary`);
    lines.push(`executor_request_duration_seconds{quantile="0.5"} ${(stats.p50ExecutionTime / 1000).toFixed(3)}`);
    lines.push(`executor_request_duration_seconds{quantile="0.95"} ${(stats.p95ExecutionTime / 1000).toFixed(3)}`);
    lines.push(`executor_request_duration_seconds{quantile="0.99"} ${(stats.p99ExecutionTime / 1000).toFixed(3)}`);

    lines.push(`# HELP executor_success_rate Success rate (0-1)`);
    lines.push(`# TYPE executor_success_rate gauge`);
    lines.push(`executor_success_rate ${stats.successRate.toFixed(4)}`);

    lines.push(`# HELP executor_throughput_requests_per_second Throughput in requests per second`);
    lines.push(`# TYPE executor_throughput_requests_per_second gauge`);
    lines.push(`executor_throughput_requests_per_second ${stats.throughput.toFixed(2)}`);

    lines.push(`# HELP executor_current_concurrency Current concurrency level`);
    lines.push(`# TYPE executor_current_concurrency gauge`);
    lines.push(`executor_current_concurrency ${stats.currentConcurrency}`);

    return lines.join('\n');
  }
}

module.exports = PerformanceMonitor;
