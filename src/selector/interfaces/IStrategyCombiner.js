/**
 * 策略组合器接口
 * 定义规则与学习结果合并的接口
 */
class IStrategyCombiner {
  /**
   * 合并规则和学习结果
   * @param {Object} ruleEval - 规则评估结果
   * @param {Object} learningRec - 学习推荐结果
   * @param {Object} subtask - 子任务
   * @param {Object} integrationConfig - 融合配置
   * @returns {Object} 合并后的结果
   */
  merge(ruleEval, learningRec, subtask, integrationConfig) {
    throw new Error('Method not implemented');
  }

  /**
   * 分析任务上下文
   * @param {Object} subtask - 子任务
   * @returns {Object} 上下文分析结果
   */
  analyzeContext(subtask) {
    throw new Error('Method not implemented');
  }
}

module.exports = IStrategyCombiner;