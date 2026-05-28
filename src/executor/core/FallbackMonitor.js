/**
 * FallbackMonitor - 降级监控器
 * 跟踪降级事件并提供监控报告
 */
class FallbackMonitor {
  /**
   * 创建降级监控器
   * @param {Function} alertCallback - 告警回调函数
   */
  constructor(alertCallback) {
    this.alertCallback = alertCallback;
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      fallback_attempts: 0,
      successful_fallbacks: 0,
      failed_fallbacks: 0,
      fallback_by_type: {
        timeout: 0,
        budget: 0,
        unavailability: 0
      },
      fallback_by_model: {},
      fallback_chain_depth: [] // 记录降级链条深度
    };
  }

  /**
   * 记录降级事件
   * @param {string} fallbackType - 降级类型
   * @param {boolean} success - 是否成功
   * @param {string} originalModel - 原始模型
   * @param {string} fallbackModel - 降级模型
   */
  recordFallback(fallbackType, success, originalModel, fallbackModel) {
    this.stats.fallback_attempts++;
    this.stats.fallback_by_type[fallbackType] = (this.stats.fallback_by_type[fallbackType] || 0) + 1;

    // 记录涉及的模型
    this.stats.fallback_by_model[originalModel] = (this.stats.fallback_by_model[originalModel] || 0) + 1;
    this.stats.fallback_by_model[fallbackModel] = (this.stats.fallback_by_model[fallbackModel] || 0) + 1;

    if (success) {
      this.stats.successful_fallbacks++;
    } else {
      this.stats.failed_fallbacks++;
    }

    // 检查是否需要告警
    this.checkAlertConditions();
  }

  /**
   * 记录请求
   * @param {boolean} success - 请求是否成功
   */
  recordRequest(success) {
    this.stats.total_requests++;
    if (success) {
      this.stats.successful_requests++;
    }
  }

  /**
   * 检查告警条件
   */
  checkAlertConditions() {
    // 如果降级失败率过高，发出告警
    if (this.stats.fallback_attempts > 0) {
      const fallbackFailureRate = this.stats.failed_fallbacks / this.stats.fallback_attempts;
      if (fallbackFailureRate > 0.3) {  // 30%失败率告警
        this.alertCallback && this.alertCallback({
          type: 'high_fallback_failure_rate',
          rate: fallbackFailureRate,
          message: `Fallback failure rate is ${Math.round(fallbackFailureRate * 100)}%, which exceeds threshold`,
          timestamp: new Date()
        });
      }
    }

    // 如果总体成功率过低，发出告警
    if (this.stats.total_requests > 10) {  // 至少有10个请求才计算总体成功率
      const overallSuccessRate = this.stats.successful_requests / this.stats.total_requests;
      if (overallSuccessRate < 0.7) {  // 70%成功率以下告警
        this.alertCallback && this.alertCallback({
          type: 'low_overall_success_rate',
          rate: overallSuccessRate,
          message: `Overall success rate is ${Math.round(overallSuccessRate * 100)}%, which is below threshold`,
          timestamp: new Date()
        });
      }
    }

    // 如果降级率过高，发出告警
    if (this.stats.total_requests > 10) {
      const fallbackRate = this.stats.fallback_attempts / this.stats.total_requests;
      if (fallbackRate > 0.4) {  // 40%的请求需要降级则告警
        this.alertCallback && this.alertCallback({
          type: 'high_fallback_rate',
          rate: fallbackRate,
          message: `Fallback rate is ${Math.round(fallbackRate * 100)}%, which indicates potential infrastructure issues`,
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * 获取降级报告
   * @returns {Object} 降级报告
   */
  getFallbackReport() {
    const report = {
      ...this.stats,
      success_rate: this.stats.total_requests > 0 ? this.stats.successful_requests / this.stats.total_requests : 0,
      fallback_success_rate: this.stats.fallback_attempts > 0 ? this.stats.successful_fallbacks / this.stats.fallback_attempts : 0,
      timestamp: new Date(),
      trends: this.calculateTrends()
    };

    return report;
  }

  /**
   * 计算趋势
   * @returns {Object} 趋势数据
   */
  calculateTrends() {
    // 这里可以实现更复杂的时间序列分析
    // 简单示例：返回最近的比率
    return {
      recent_success_rate: this.stats.total_requests > 0 ? this.stats.successful_requests / this.stats.total_requests : 0,
      recent_fallback_success_rate: this.stats.fallback_attempts > 0 ? this.stats.successful_fallbacks / this.stats.fallback_attempts : 0,
      most_common_fallback_type: this.getMostCommonFallbackType(),
      most_affected_models: this.getMostAffectedModels()
    };
  }

  /**
   * 获取最常见的降级类型
   * @returns {string} 最常见的降级类型
   */
  getMostCommonFallbackType() {
    let maxCount = 0;
    let maxType = '';
    for (const [type, count] of Object.entries(this.stats.fallback_by_type)) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    }
    return maxType;
  }

  /**
   * 获取受影响最多的模型
   * @returns {Array} 受影响的模型列表
   */
  getMostAffectedModels() {
    const modelEntries = Object.entries(this.stats.fallback_by_model);
    modelEntries.sort((a, b) => b[1] - a[1]); // 按降级次数降序排列
    return modelEntries.slice(0, 5); // 返回前5个
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      fallback_attempts: 0,
      successful_fallbacks: 0,
      failed_fallbacks: 0,
      fallback_by_type: {
        timeout: 0,
        budget: 0,
        unavailability: 0
      },
      fallback_by_model: {},
      fallback_chain_depth: []
    };
  }
}

module.exports = FallbackMonitor;