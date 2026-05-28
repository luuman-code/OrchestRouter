/**
 * BudgetMonitor - 预算监控器
 * 监控预算使用情况，提供预算预警
 */

class BudgetMonitor {
  constructor(costController) {
    this.costController = costController;
    this.warningThreshold = 0.8; // 80% 预算使用率警告
    this.alertThreshold = 0.95;  // 95% 预算使用率警报
  }

  async checkBudgetBeforeExecution(estimatedCost) {
    /**
     * 执行前检查预算
     * 与 ModelSelector 的成本控制器协调
     */
    if (!this.costController) return true;

    const utilization = this.costController.getBudgetUtilization();

    if (utilization > this.alertThreshold) {
      console.warn(`Budget alert: ${Math.round(utilization * 100)}% of budget used`);
      // 可能需要采取紧急措施
      return false;
    } else if (utilization > this.warningThreshold) {
      console.warn(`Budget warning: ${Math.round(utilization * 100)}% of budget used`);
      // 记录日志，可能需要调整策略
    }

    // 检查是否能在预算内执行
    return this.costController.canAllocate(estimatedCost, true);
  }

  getBudgetStatus() {
    if (!this.costController) {
      return { budgetUsed: 0, budgetRemaining: Infinity, utilization: 0 };
    }

    return this.costController.getDetailedBudgetStatus();
  }
}

module.exports = { BudgetMonitor };