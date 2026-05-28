/**
 * CostController - 成本控制器
 *
 * 用于管理预算和成本控制，在模型选择器和执行器之间共享，
 * 确保在整个系统中统一的成本管理和预算控制。
 */
class CostController {
  /**
   * 创建成本控制器
   * @param {number} budget - 总预算
   * @param {Object} options - 选项
   * @param {boolean} options.conservativeEstimation - 是否使用保守估计
   * @param {number} options.safetyMargin - 安全边际 (0-1)
   * @param {Function} options.onBudgetExceeded - 预算超出时的回调
   */
  constructor(budget, options = {}) {
    this.totalBudget = budget;
    this.spentBudget = 0;
    this.options = {
      conservativeEstimation: options.conservativeEstimation || false,
      safetyMargin: options.safetyMargin || 0.1,
      onBudgetExceeded: options.onBudgetExceeded || null,
      ...options
    };

    // 预估成本跟踪
    this.estimatedCosts = new Map(); // taskId -> cost
    this.pendingConfirmations = new Map(); // taskId -> cost
  }

  /**
   * 检查是否可以分配指定金额的成本
   * @param {number} amount - 要分配的成本金额
   * @param {boolean} includeSafetyMargin - 是否包含安全边际
   * @returns {boolean} 是否可以分配
   */
  canAllocate(amount, includeSafetyMargin = true) {
    const margin = includeSafetyMargin ? this.options.safetyMargin : 0;
    const adjustedBudget = this.totalBudget * (1 - margin);
    return (this.spentBudget + (this.getPendingCost() || 0) + amount) <= adjustedBudget;
  }

  /**
   * 预分配成本
   * @param {string} taskId - 任务ID
   * @param {number} estimatedCost - 预估成本
   * @returns {boolean} 是否预分配成功
   */
  preAllocate(taskId, estimatedCost) {
    if (!this.canAllocate(estimatedCost)) {
      return false;
    }

    // 记录预估成本
    this.estimatedCosts.set(taskId, estimatedCost);
    this.pendingConfirmations.set(taskId, estimatedCost);
    return true;
  }

  /**
   * 确认预估成本，将其计入待确认队列
   * @param {string} taskId - 任务ID
   * @param {number} confirmedCost - 确认的成本
   */
  confirmEstimate(taskId, confirmedCost) {
    if (this.pendingConfirmations.has(taskId)) {
      const originalEstimate = this.pendingConfirmations.get(taskId);

      // 从待确认队列中移除
      this.pendingConfirmations.delete(taskId);

      // 如果实际成本与预估不同，更新预估
      if (confirmedCost !== originalEstimate) {
        this.estimatedCosts.set(taskId, confirmedCost);
      }
    }
  }

  /**
   * 更新实际成本
   * @param {string} taskId - 任务ID
   * @param {number} actualCost - 实际成本
   * @param {Object} usageDetails - 使用详情
   * @param {string} modelId - 模型ID
   */
  updateActualCost(taskId, actualCost, usageDetails, modelId) {
    // 如果之前预分配了成本，需要调整
    if (this.estimatedCosts.has(taskId)) {
      const previousEstimate = this.estimatedCosts.get(taskId);
      this.spentBudget = this.spentBudget - previousEstimate + actualCost;
      this.estimatedCosts.set(taskId, actualCost);
    } else {
      this.spentBudget += actualCost;
    }

    // 确保预算不会因舍入误差而变成负数
    this.spentBudget = Math.max(0, this.spentBudget);
  }

  /**
   * 处理部分成本更新（失败情况下的处理）
   * @param {string} taskId - 任务ID
   * @param {Object} partialUsage - 部分使用信息
   * @param {string} modelId - 模型ID
   * @param {string} failureStage - 失败阶段
   */
  handlePartialCostUpdate(taskId, partialUsage, modelId, failureStage) {
    // 根据失败阶段估算可能的成本
    let estimatedCost = 0;

    if (partialUsage && partialUsage.input) {
      // 使用实际输入量估算成本
      const modelSpec = this.getModelSpec(modelId);
      if (modelSpec && modelSpec.pricing) {
        estimatedCost = (partialUsage.input / 1000) * modelSpec.pricing.input;
        if (partialUsage.output) {
          estimatedCost += (partialUsage.output / 1000) * modelSpec.pricing.output;
        }
      }
    }

    if (estimatedCost > 0) {
      // 更新实际成本
      this.updateActualCost(taskId, estimatedCost, partialUsage, modelId);
    }
  }

  /**
   * 获取待确认的成本总额
   * @returns {number} 待确认成本
   */
  getPendingCost() {
    let pending = 0;
    for (const cost of this.pendingConfirmations.values()) {
      pending += cost;
    }
    return pending;
  }

  /**
   * 获取剩余预算
   * @param {boolean} includeSafetyMargin - 是否包含安全边际
   * @returns {number} 剩余预算
   */
  getRemainingBudget(includeSafetyMargin = true) {
    const margin = includeSafetyMargin ? this.options.safetyMargin : 0;
    const adjustedBudget = this.totalBudget * (1 - margin);
    return Math.max(0, adjustedBudget - this.spentBudget - this.getPendingCost());
  }

  /**
   * 获取预算使用百分比
   * @returns {number} 预算使用百分比 (0-1)
   */
  getBudgetUsagePercentage() {
    if (this.totalBudget === 0) return 1;
    return Math.min(1, (this.spentBudget + this.getPendingCost()) / this.totalBudget);
  }

  /**
   * 清理任务的成本记录
   * @param {string} taskId - 任务ID
   */
  cleanupTask(taskId) {
    if (this.estimatedCosts.has(taskId)) {
      this.estimatedCosts.delete(taskId);
    }
    if (this.pendingConfirmations.has(taskId)) {
      this.pendingConfirmations.delete(taskId);
    }
  }

  /**
   * 获取模型规格（模拟方法，实际使用时应从模型注册表获取）
   * @param {string} modelId - 模型ID
   * @returns {Object} 模型规格
   */
  getModelSpec(modelId) {
    // 这里应从实际的模型注册表获取，此处为模拟实现
    const defaultPricing = {
      input: 0.0001,  // $0.10/M tokens
      output: 0.0003  // $0.30/M tokens
    };

    return {
      pricing: defaultPricing
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalBudget: this.totalBudget,
      spentBudget: this.spentBudget,
      pendingCost: this.getPendingCost(),
      remainingBudget: this.getRemainingBudget(),
      budgetUsagePercentage: this.getBudgetUsagePercentage(),
      taskCount: this.estimatedCosts.size
    };
  }

  /**
   * 重置控制器
   */
  reset() {
    this.spentBudget = 0;
    this.estimatedCosts.clear();
    this.pendingConfirmations.clear();
  }
}

module.exports = { CostController };