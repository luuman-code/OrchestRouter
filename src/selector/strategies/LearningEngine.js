/**
 * 学习引擎实现
 * 实现基于历史反馈的学习逻辑
 */
const ILearningEngine = require('../interfaces/ILearningEngine');
const LearningSelector = require('../core/LearningSelector');

class LearningEngine extends ILearningEngine {
  constructor(config) {
    super();
    this.learningSelector = new LearningSelector(config);
  }

  recordFeedback(taskId, taskType, modelId, qualityMetrics, additionalContext = {}) {
    this.learningSelector.recordFeedback(taskId, taskType, modelId, qualityMetrics, additionalContext);
  }

  getBestModelForType(taskType, strategy = 'bayesian-weighted') {
    return this.learningSelector.getBestModelForType(taskType, strategy);
  }

  getModelRecommendationConfidence(taskType, modelId) {
    return this.learningSelector.getModelRecommendationConfidence(taskType, modelId);
  }

  exportReport() {
    return this.learningSelector.exportReport();
  }

  /**
   * 将调用委托给内部的学习选择器
   */
  getBayesianPerformanceScore(taskType, modelId) {
    return this.learningSelector.getBayesianPerformanceScore(taskType, modelId);
  }

  getRecentPerformance(taskType, modelId) {
    return this.learningSelector.getRecentPerformance(taskType, modelId);
  }

  setEnabled(enabled) {
    this.learningSelector.setEnabled(enabled);
  }

  clearData(modelId, taskType) {
    this.learningSelector.clearData(modelId, taskType);
  }
}

module.exports = LearningEngine;