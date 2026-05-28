/**
 * BayesianPerformanceEstimator - 贝叶斯性能估计器
 * 用于基于历史反馈进行贝叶斯性能估计
 */
class BayesianPerformanceEstimator {
  constructor() {
    // 存储每个任务类型-模型组合的贝叶斯参数
    // 结构: { [taskType-modelId]: { alpha, beta, sampleCount, lastUpdated } }
    this.estimates = new Map();

    // 默认的先验参数 (alpha=1, beta=1 表示均匀分布)
    this.defaultAlpha = 1;
    this.defaultBeta = 1;
  }

  /**
   * 更新性能估计
   * @param {string} taskType - 任务类型
   * @param {string} modelId - 模型ID
   * @param {Object} qualityMetrics - 质量指标
   */
  updatePerformance(taskType, modelId, qualityMetrics) {
    const key = `${taskType}-${modelId}`;
    const overallScore = qualityMetrics.overallScore;

    // 确保整体评分在0-1范围内
    const normalizedScore = Math.max(0, Math.min(1, overallScore));

    if (!this.estimates.has(key)) {
      // 初始化为默认先验参数
      this.estimates.set(key, {
        alpha: this.defaultAlpha,
        beta: this.defaultBeta,
        sampleCount: 0,
        lastUpdated: new Date()
      });
    }

    const estimate = this.estimates.get(key);

    // 更新alpha (成功次数)
    estimate.alpha += normalizedScore;
    // 更新beta (失败次数)
    estimate.beta += (1 - normalizedScore);
    // 更新样本数
    estimate.sampleCount++;
    // 更新时间
    estimate.lastUpdated = new Date();
  }

  /**
   * 获取性能估计
   * @param {string} taskType - 任务类型
   * @param {string} modelId - 模型ID
   * @returns {Object} 性能估计结果 {mean, confidence, lowerBound, upperBound}
   */
  getPerformance(taskType, modelId) {
    const key = `${taskType}-${modelId}`;

    if (!this.estimates.has(key)) {
      // 如果没有数据，返回先验估计
      return {
        mean: this.defaultAlpha / (this.defaultAlpha + this.defaultBeta),
        confidence: 0.1, // 低置信度
        lowerBound: 0,
        upperBound: 1
      };
    }

    const estimate = this.estimates.get(key);
    const total = estimate.alpha + estimate.beta;
    const mean = estimate.alpha / total;

    // 使用Beta分布的性质计算置信区间
    // 这里使用近似方法：mean ± 1.96 * std_dev
    const variance = (estimate.alpha * estimate.beta) / (total * total * (total + 1));
    const stdDev = Math.sqrt(variance);

    // 置信度随样本数增加
    const confidence = Math.min(0.95, 0.1 + 0.85 * (estimate.sampleCount / (estimate.sampleCount + 10)));

    // 计算置信区间
    const marginOfError = 1.96 * stdDev;
    const lowerBound = Math.max(0, mean - marginOfError);
    const upperBound = Math.min(1, mean + marginOfError);

    return {
      mean,
      confidence,
      lowerBound,
      upperBound,
      sampleCount: estimate.sampleCount
    };
  }

  /**
   * 获取所有估计数据用于持久化
   */
  getDataForPersistence() {
    const serialized = {};
    for (const [key, value] of this.estimates.entries()) {
      serialized[key] = { ...value, lastUpdated: value.lastUpdated.toISOString() };
    }
    return serialized;
  }

  /**
   * 从持久化数据恢复
   */
  setDataFromPersistence(data) {
    this.estimates.clear();
    for (const [key, value] of Object.entries(data)) {
      this.estimates.set(key, {
        ...value,
        lastUpdated: new Date(value.lastUpdated)
      });
    }
  }
}

module.exports = BayesianPerformanceEstimator;