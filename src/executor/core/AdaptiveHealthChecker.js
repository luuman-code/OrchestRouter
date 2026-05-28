/**
 * AdaptiveHealthChecker - 自适应健康检查器
 *
 * 【新增 2026-03-28】
 * 根据错误率、系统负载、模型恢复情况等因素动态调整健康检查频率
 *
 * 健康检查频率动态调整策略:
 * - 系统负载正常: 1.0倍基础频率
 * - 系统负载高: 0.5倍基础频率
 * - 系统负载关键: 0.2倍基础频率
 * - 错误率>50%: 0.3倍基础频率（加速检查以监控恢复）
 * - 错误率>20%: 0.5倍基础频率
 * - 模型恢复中: 1.5倍基础频率（加速确认恢复）
 */
class AdaptiveHealthChecker {
  constructor(modelId, requester = null) {
    this.modelId = modelId;
    this.requester = requester || require('./AsyncRequester').AsyncRequester;

    // 基础健康检查器
    this.baseHealthChecker = new (require('./HealthChecker').HealthChecker)(modelId, requester);

    // 历史记录
    this.checkHistory = [];
    this.maxHistorySize = 20; // 保留最近20次检查的历史

    // 动态调整参数
    this.baseInterval = 30000; // 基础间隔30秒
    this.currentInterval = this.baseInterval; // 当前间隔

    // 调整因子
    this.systemLoadFactor = 1.0; // 系统负载调整因子
    this.errorRateFactor = 1.0; // 错误率调整因子
    this.recoveryFactor = 1.0; // 恢复状态调整因子

    // 状态标志
    this.isRecovering = false; // 是否正在恢复
    this.lastRecoveryTime = null; // 最后恢复时间
    this.lastFailureTime = null; // 最后失败时间
  }

  /**
   * 设置基础健康检查间隔
   * @param {number} interval - 基础检查间隔（毫秒）
   */
  setBaseInterval(interval) {
    this.baseInterval = interval;
    this.currentInterval = interval;
  }

  /**
   * 设置系统负载调整因子
   * @param {number} factor - 负载调整因子 (0.0-2.0)
   */
  setSystemLoadFactor(factor) {
    this.systemLoadFactor = Math.max(0.1, Math.min(2.0, factor));
  }

  /**
   * 记录检查结果
   * @param {Object} result - 检查结果
   */
  recordCheckResult(result) {
    // 添加时间戳和结果到历史记录
    this.checkHistory.push({
      timestamp: Date.now(),
      available: result.available,
      latency: result.latency,
      error: result.error
    });

    // 保持历史记录大小在限制范围内
    if (this.checkHistory.length > this.maxHistorySize) {
      this.checkHistory.shift();
    }

    // 更新状态标志
    this.updateStateFlags(result);
  }

  /**
   * 更新状态标志
   * @param {Object} result - 检查结果
   */
  updateStateFlags(result) {
    if (result.available) {
      // 模型恢复
      if (this.lastFailureTime && !this.isRecovering) {
        this.isRecovering = true;
        this.lastRecoveryTime = Date.now();
      }
      this.lastFailureTime = null;
    } else {
      // 模型失败
      this.lastFailureTime = Date.now();
      this.isRecovering = false;
    }
  }

  /**
   * 计算错误率调整因子
   * @param {number} timeWindow - 时间窗口（毫秒）
   * @returns {number} 错误率调整因子
   */
  calculateErrorRateFactor(timeWindow = 300000) { // 5分钟窗口
    const now = Date.now();
    const recentChecks = this.checkHistory.filter(check =>
      now - check.timestamp <= timeWindow
    );

    if (recentChecks.length === 0) {
      return 1.0;
    }

    const errorCount = recentChecks.filter(check => !check.available).length;
    const errorRate = errorCount / recentChecks.length;

    // 根据错误率设置调整因子
    if (errorRate >= 0.5) {
      return 0.3; // 错误率超过50%，降低检查频率以减少负载
    } else if (errorRate >= 0.2) {
      return 0.5; // 错误率超过20%，适度降低检查频率
    } else if (errorRate === 0 && this.isRecovering) {
      return 1.5; // 正在恢复且无错误，增加检查频率以确认恢复
    }

    return 1.0; // 正常情况
  }

  /**
   * 计算下一个健康检查的时间间隔
   * @returns {number} 下一次检查的间隔时间（毫秒）
   */
  calculateNextInterval() {
    // 获取各个因素的调整因子
    this.errorRateFactor = this.calculateErrorRateFactor();

    // 如果不是在恢复状态，重置恢复因子
    if (!this.isRecovering) {
      this.recoveryFactor = 1.0;
    } else {
      // 如果正在恢复，但已经有段时间了，逐渐降低检查频率
      if (this.lastRecoveryTime) {
        const timeSinceRecovery = Date.now() - this.lastRecoveryTime;
        if (timeSinceRecovery > 300000) { // 5分钟后恢复正常频率
          this.recoveryFactor = 1.0;
        }
      }
    }

    // 综合所有调整因子
    const combinedFactor = this.systemLoadFactor * this.errorRateFactor * this.recoveryFactor;

    // 计算调整后的间隔
    const adjustedInterval = Math.max(5000, Math.min(300000, this.baseInterval / combinedFactor));

    this.currentInterval = adjustedInterval;
    return adjustedInterval;
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    const totalChecks = this.checkHistory.length;
    const availableCount = this.checkHistory.filter(check => check.available).length;
    const availabilityRate = totalChecks > 0 ? availableCount / totalChecks : 1.0;

    // 计算平均延迟
    const successfulChecks = this.checkHistory.filter(check => check.latency > 0);
    const avgLatency = successfulChecks.length > 0
      ? successfulChecks.reduce((sum, check) => sum + check.latency, 0) / successfulChecks.length
      : 0;

    return {
      modelId: this.modelId,
      totalChecks,
      availabilityRate,
      avgLatency,
      currentInterval: this.currentInterval,
      isRecovering: this.isRecovering,
      systemLoadFactor: this.systemLoadFactor,
      errorRateFactor: this.errorRateFactor,
      recoveryFactor: this.recoveryFactor,
      lastCheckTime: this.checkHistory.length > 0 ? this.checkHistory[this.checkHistory.length - 1].timestamp : null
    };
  }

  /**
   * 执行健康检查
   * @returns {Promise<Object>} 检查结果
   */
  async checkHealth() {
    try {
      // 执行基础健康检查
      const result = await this.baseHealthChecker.checkHealth();

      // 记录检查结果
      this.recordCheckResult(result);

      return result;
    } catch (error) {
      // 记录错误结果
      const errorResult = {
        available: false,
        reason: error.message,
        lastChecked: new Date(),
        latency: -1,
        error: error
      };

      this.recordCheckResult(errorResult);
      throw error;
    }
  }

  /**
   * 获取推荐的下次检查延迟时间
   * @returns {number} 推荐延迟时间（毫秒）
   */
  getNextCheckDelay() {
    return this.calculateNextInterval();
  }

  /**
   * 重置健康检查状态
   */
  reset() {
    this.checkHistory = [];
    this.currentInterval = this.baseInterval;
    this.systemLoadFactor = 1.0;
    this.errorRateFactor = 1.0;
    this.recoveryFactor = 1.0;
    this.isRecovering = false;
    this.lastRecoveryTime = null;
    this.lastFailureTime = null;
  }
}

module.exports = { AdaptiveHealthChecker };