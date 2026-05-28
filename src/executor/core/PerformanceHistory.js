/**
 * PerformanceHistory - 性能历史记录器
 *
 * 记录模型执行的历史性能数据，用于自适应调度决策
 * 收集任务执行时间、成功率等指标，识别不同类型任务的最佳模型
 *
 * @class PerformanceHistory
 */
class PerformanceHistory {
  constructor() {
    this.history = new Map(); // 存储性能数据: {modelId}_{taskType} -> [metrics]
    this.maxRecordsPerKey = 100; // 每个键最多存储的记录数
  }

  /**
   * 记录任务执行结果
   * @param {string} modelId - 模型 ID
   * @param {string} taskType - 任务类型
   * @param {Object} metrics - 性能指标
   * @param {number} metrics.duration - 执行耗时（毫秒）
   * @param {boolean} metrics.success - 是否成功
   * @param {number} metrics.cost - 成本
   * @param {number} metrics.tokensUsed - 使用的 token 数量
   */
  recordExecution(modelId, taskType, metrics) {
    const key = `${modelId}_${taskType}`;
    if (!this.history.has(key)) {
      this.history.set(key, []);
    }

    const records = this.history.get(key);
    records.push({
      timestamp: Date.now(),
      duration: metrics.duration,
      success: metrics.success,
      cost: metrics.cost,
      tokensUsed: metrics.tokensUsed
    });

    // 限制记录数量，保留最新的记录
    if (records.length > this.maxRecordsPerKey) {
      records.splice(0, records.length - this.maxRecordsPerKey);
    }
  }

  /**
   * 获取模型的平均性能指标
   * @param {string} modelId - 模型 ID
   * @param {string} taskType - 任务类型
   * @returns {Object} 平均性能指标
   */
  getAverageMetrics(modelId, taskType) {
    const key = `${modelId}_${taskType}`;
    const records = this.history.get(key) || [];

    if (records.length === 0) {
      return {
        avgDuration: null,
        successRate: null,
        avgCost: null,
        avgTokensUsed: null,
        totalExecutions: 0
      };
    }

    const total = records.reduce((sum, record) => {
      sum.duration += record.duration;
      sum.success += record.success ? 1 : 0;
      sum.cost += record.cost || 0;
      sum.tokensUsed += record.tokensUsed || 0;
      return sum;
    }, { duration: 0, success: 0, cost: 0, tokensUsed: 0 });

    return {
      avgDuration: total.duration / records.length,
      successRate: total.success / records.length,
      avgCost: total.cost / records.length,
      avgTokensUsed: total.tokensUsed / records.length,
      totalExecutions: records.length
    };
  }

  /**
   * 获取最近的性能趋势
   * @param {string} modelId - 模型 ID
   * @param {string} taskType - 任务类型
   * @param {number} lastN - 最近 N 条记录
   * @returns {Array} 最近的性能记录
   */
  getRecentMetrics(modelId, taskType, lastN = 10) {
    const key = `${modelId}_${taskType}`;
    const records = this.history.get(key) || [];
    return records.slice(-lastN);
  }

  /**
   * 获取推荐使用的最佳模型
   * @param {string} taskType - 任务类型
   * @param {Array} candidateModels - 候选模型列表
   * @returns {Array} 按推荐程度排序的模型列表
   */
  getRecommendedModels(taskType, candidateModels) {
    const recommendations = [];

    for (const modelId of candidateModels) {
      const metrics = this.getAverageMetrics(modelId, taskType);

      // 计算综合评分（结合成功率、速度和成本）
      let score = 0;
      if (metrics.successRate !== null) {
        score += metrics.successRate * 100; // 成功率权重
      }

      if (metrics.avgDuration !== null) {
        // 响应时间评分：越快得分越高，使用倒数形式
        score += (1000 / (metrics.avgDuration + 100)); // 避免除零，增加基础值
      }

      if (metrics.avgCost !== null) {
        // 成本评分：成本越低越好，使用负值表示惩罚
        score -= metrics.avgCost * 10; // 成本权重
      }

      recommendations.push({
        modelId,
        score,
        metrics
      });
    }

    // 按分数降序排列
    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * 清除过期记录
   * @param {number} maxAgeMs - 最大年龄（毫秒）
   */
  cleanupExpired(maxAgeMs = 24 * 60 * 60 * 1000) { // 默认保留24小时内的数据
    const now = Date.now();

    for (const [key, records] of this.history.entries()) {
      const filtered = records.filter(record => (now - record.timestamp) <= maxAgeMs);
      if (filtered.length !== records.length) {
        this.history.set(key, filtered);
      }
    }
  }

  /**
   * 获取所有记录的摘要
   * @returns {Object} 性能历史摘要
   */
  getSummary() {
    const summary = {};

    for (const [key, records] of this.history.entries()) {
      if (records.length > 0) {
        const parts = key.split('_');
        const modelId = parts.slice(0, -1).join('_'); // 处理模型ID中可能包含下划线的情况
        const taskType = parts[parts.length - 1];

        if (!summary[modelId]) {
          summary[modelId] = {};
        }

        summary[modelId][taskType] = this.getAverageMetrics(modelId, taskType);
      }
    }

    return summary;
  }
}

module.exports = PerformanceHistory;