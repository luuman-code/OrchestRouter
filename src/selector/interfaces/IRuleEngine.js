/**
 * 规则引擎接口
 * 定义模型选择规则的标准接口
 */
class IRuleEngine {
  /**
   * 根据任务类型获取最佳模型
   * @param {Object} subtask - 子任务对象
   * @returns {Object} 规则评估结果
   */
  selectBestModel(subtask) {
    throw new Error('Method not implemented');
  }

  /**
   * 添加选择规则
   * @param {Object} rule - 规则对象
   */
  addRule(rule) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取所有规则
   * @returns {Array} 规则数组
   */
  getAllRules() {
    throw new Error('Method not implemented');
  }
}

module.exports = IRuleEngine;