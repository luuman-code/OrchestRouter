/**
 * 学习引擎接口
 * 定义基于历史反馈的学习接口
 */
class ILearningEngine {
  /**
   * 记录任务反馈
   * @param {string} taskId - 任务ID
   * @param {string} taskType - 任务类型
   * @param {string} modelId - 模型ID
   * @param {Object} qualityMetrics - 质量指标
   * @param {Object} additionalContext - 额外上下文
   */
  recordFeedback(taskId, taskType, modelId, qualityMetrics, additionalContext = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取最佳模型
   * @param {string} taskType - 任务类型
   * @param {string} strategy - 策略名称
   * @returns {string|null} 推荐的模型ID
   */
  getBestModelForType(taskType, strategy = 'bayesian-weighted') {
    throw new Error('Method not implemented');
  }

  /**
   * 获取模型推荐置信度
   * @param {string} taskType - 任务类型
   * @param {string} modelId - 模型ID
   * @returns {number} 置信度 (0-1)
   */
  getModelRecommendationConfidence(taskType, modelId) {
    throw new Error('Method not implemented');
  }

  /**
   * 导出学习报告
   * @returns {Object} 学习报告
   */
  exportReport() {
    throw new Error('Method not implemented');
  }
}

module.exports = ILearningEngine;