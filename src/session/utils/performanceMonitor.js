/**
 * 会话性能监控工具
 */

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // 默认启用
    this.metrics = new Map(); // 存储各项指标
    this.histograms = new Map(); // 存储直方图数据
    this.timers = new Map(); // 存储定时器
    this.startTime = Date.now();
  }

  /**
   * 记录计数器指标
   * @param {string} name - 指标名称
   * @param {number} value - 增加的数值，默认为1
   */
  counter(name, value = 1) {
    if (!this.enabled) return;

    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }

  /**
   * 记录测量值
   * @param {string} name - 指标名称
   * @param {number} value - 测量值
   */
  gauge(name, value) {
    if (!this.enabled) return;

    this.metrics.set(name, value);
  }

  /**
   * 记录直方图数据
   * @param {string} name - 指标名称
   * @param {number} value - 测量值
   */
  histogram(name, value) {
    if (!this.enabled) return;

    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name).push(value);
  }

  /**
   * 开始计时
   * @param {string} name - 计时器名称
   */
  startTimer(name) {
    if (!this.enabled) return;

    this.timers.set(name, Date.now());
  }

  /**
   * 结束计时并记录耗时
   * @param {string} name - 计时器名称
   * @returns {number} 耗时（毫秒）
   */
  endTimer(name) {
    if (!this.enabled) return 0;

    const startTime = this.timers.get(name);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.histogram(`${name}.duration`, duration);
      this.timers.delete(name);
      return duration;
    }
    return 0;
  }

  /**
   * 测量函数执行时间
   * @param {string} name - 指标名称
   * @param {Function} fn - 要测量的函数
   * @returns {*} 函数执行结果
   */
  async timer(name, fn) {
    if (!this.enabled) return await fn();

    this.startTimer(name);
    try {
      const result = await fn();
      return result;
    } finally {
      this.endTimer(name);
    }
  }

  /**
   * 获取统计摘要
   * @returns {Object} 统计摘要
   */
  getStats() {
    if (!this.enabled) {
      return { enabled: false };
    }

    const stats = {
      uptime: Date.now() - this.startTime,
      counters: {},
      gauges: {},
      histograms: {}
    };

    // 处理计数器
    for (const [name, value] of this.metrics.entries()) {
      if (name.includes('.count') || name.includes('.counter')) {
        stats.counters[name] = value;
      } else {
        stats.gauges[name] = value;
      }
    }

    // 处理直方图
    for (const [name, values] of this.histograms.entries()) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((acc, val) => acc + val, 0);

        stats.histograms[name] = {
          count: sorted.length,
          sum: sum,
          avg: sum / sorted.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)]
        };
      }
    }

    return stats;
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.metrics.clear();
    this.histograms.clear();
    this.timers.clear();
    this.startTime = Date.now();
  }
}

// 创建全局性能监控实例
const globalPerformanceMonitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  globalPerformanceMonitor
};