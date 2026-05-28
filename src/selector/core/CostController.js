/**
 * CostController - 成本控制器
 *
 * 功能块 D：成本控制与监控层
 * 确保选择的模型在预算范围内
 *
 * 改进特性：
 * - 保守预估：使用安全边际系数避免预算超支
 * - 实时反馈：任务完成后立即更新预算状态
 * - 待确认预估管理：跟踪已承诺但尚未确认的成本
 */

class CostController {
  constructor(initialBudget = 10.00, options = {}) {
    this.initialBudget = initialBudget;
    this.spent = 0.0;
    this.committedBudget = 0.0; // 已承诺但尚未确认的预算（保守预估用）
    this.transactionHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000; // 【修复】允许配置最大历史记录数
    this.dynamicAdjustmentEnabled = true; // 启用动态调整功能
    this.costThreshold = 0.8; // 当预算使用率达到 80% 时启用成本优先模式

    // 保守预估配置
    this.conservativeEstimation = options.conservativeEstimation !== false; // 默认启用
    this.safetyMargin = options.safetyMargin || 0.2; // 默认 20% 的安全边际
    this.pendingEstimates = new Map(); // 待确认的预估成本
    this.pendingConfirmTimeout = options.pendingConfirmTimeout || 30000; // 待确认超时时间（30 秒）
    this.realTimeFeedbackEnabled = options.realTimeFeedbackEnabled !== false; // 默认启用实时反馈

    // 清理过期的待确认预估（定期清理）
    this._startCleanupTimer();

    // 【新增】私有方法：清理超出限制的历史记录
    this._cleanupTransactionHistory = () => {
      if (this.transactionHistory.length > this.maxHistorySize) {
        // 保留最新的记录，删除最旧的
        this.transactionHistory = this.transactionHistory.slice(-this.maxHistorySize);
      }
    };
  }

  /**
   * 清理超出的历史记录
   * @private
   */
  _enforceHistoryLimit() {
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory = this.transactionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 启动定时清理
   * @private
   */
  _startCleanupTimer() {
    this.cleanupInterval = setInterval(() => this._cleanupPendingEstimates(), 60000);
  }

  /**
   * 检查是否可以在预算内执行（考虑保守预估）
   */
  canAllocate(cost, useConservative = true) {
    // 对于本地模型（成本为 0），总是允许分配，但仍需要检查其他限制
    if (cost.isLocal) {
      return true;
    }

    const estimatedCostWithMargin = useConservative && this.conservativeEstimation
      ? cost.total * (1 + this.safetyMargin)
      : cost.total;

    // 检查可用预算：初始预算 - 已花费 - 已承诺预算
    const availableBudget = this.initialBudget - this.spent - this.committedBudget;
    return estimatedCostWithMargin <= availableBudget;
  }

  /**
   * 分配预估成本（带保守预估和实时反馈）
   */
  allocateEstimated(cost, taskId, modelId) {
    // 对于本地模型，虽然成本为 0，但仍需要记录交易历史
    if (this.canAllocate(cost, true)) {
      // 计算带安全边际的预估成本
      const estimatedCostWithMargin = this.conservativeEstimation && !cost.isLocal
        ? cost.total * (1 + this.safetyMargin)
        : cost.total;

      // 仅当非本地模型时增加已承诺预算
      if (!cost.isLocal) {
        this.committedBudget += estimatedCostWithMargin;

        // 记录待确认预估
        this.pendingEstimates.set(taskId, {
          amount: estimatedCostWithMargin,
          timestamp: Date.now(),
          modelId
        });
      }

      this.transactionHistory.push({
        taskId: taskId,
        modelId: modelId,
        estimatedCost: cost,
        estimatedCostWithMargin: estimatedCostWithMargin,
        actualCost: null, // 实际成本尚未知
        timestamp: new Date(),
        status: 'pending', // 状态：待确认
        isLocal: cost.isLocal,
        safetyMarginApplied: this.conservativeEstimation ? this.safetyMargin : 0
      });

      // 【修复】添加记录后检查并清理超出限制的历史
      this._enforceHistoryLimit();

      console.log(`[CostController] 已预分配：$${cost.total.toFixed(6)} (含安全边际：$${estimatedCostWithMargin.toFixed(6)}) 给任务 ${taskId}, 模型 ${modelId}`);
      console.log(`[CostController] 预算状态：已花费 $${this.spent.toFixed(2)}, 已承诺 $${this.committedBudget.toFixed(2)}, 剩余 $${this.getAvailableBudget().toFixed(2)}`);
      return true;
    }

    console.warn(`[CostController] 预算不足：需要 $${cost.total.toFixed(6)} (含安全边际：$${(cost.total * (1 + this.safetyMargin)).toFixed(6)}), 可用 $${this.getAvailableBudget().toFixed(2)}`);
    return false;
  }

  /**
   * 确认预估成本（任务开始执行时调用）
   * 将待确认预估转为已确认，释放安全边际
   */
  confirmEstimate(taskId, actualCost) {
    const pendingEstimate = this.pendingEstimates.get(taskId);
    if (!pendingEstimate) {
      console.warn(`[CostController] 未找到任务 ${taskId} 的待确认预估`);
      return false;
    }

    // 从待确认预算中移除
    this.committedBudget -= pendingEstimate.amount;
    this.pendingEstimates.delete(taskId);

    // 更新交易记录
    const transaction = this.transactionHistory.find(t => t.taskId === taskId);
    if (transaction) {
      transaction.status = 'confirmed'; // 状态：已确认
      transaction.confirmedAt = new Date();
    }

    console.log(`[CostController] 任务 ${taskId} 预估已确认，释放安全边际：$${(pendingEstimate.amount - (actualCost?.total || 0)).toFixed(6)}`);
    return true;
  }

  /**
   * 更新实际成本（运行时动态调整）
   * 与执行器联动，在模型调用完成后更新实际成本
   */
  updateActualCost(taskId, actualCost, tokenUsage) {
    const transaction = this.transactionHistory.find(t => t.taskId === taskId);
    if (transaction) {
      // 如果之前有待确认预估，先处理
      if (this.pendingEstimates.has(taskId)) {
        this.confirmEstimate(taskId, actualCost);
      }

      // 计算实际成本与预估成本的差异
      const estimatedCost = transaction.estimatedCost.total;
      const difference = actualCost.total - estimatedCost;

      // 更新已花费金额（用实际成本替换预估成本）
      this.spent += actualCost.total;

      // 更新交易记录
      transaction.actualCost = actualCost;
      transaction.tokenUsage = tokenUsage;
      transaction.status = 'completed';
      transaction.difference = difference;
      transaction.completedAt = new Date();

      console.log(`[CostController] 任务 ${taskId} 实际成本更新：预估 $${estimatedCost.toFixed(6)} -> 实际 $${actualCost.total.toFixed(6)}, 差异 $${difference.toFixed(6)}`);
      console.log(`[CostController] 预算状态更新：已花费 $${this.spent.toFixed(2)}, 已承诺 $${this.committedBudget.toFixed(2)}, 剩余 $${this.getAvailableBudget().toFixed(2)}`);
      return true;
    }
    console.warn(`[CostController] 未找到任务 ${taskId} 的交易记录，无法更新实际成本`);
    return false;
  }

  /**
   * 获取可用预算（考虑已承诺预算）
   */
  getAvailableBudget() {
    return this.initialBudget - this.spent - this.committedBudget;
  }

  /**
   * 获取剩余预算（不含已承诺预算，用于显示）
   */
  getRemainingBudget() {
    return this.initialBudget - this.spent;
  }

  /**
   * 获取预算使用率
   */
  getBudgetUtilization() {
    if (this.initialBudget === 0) {
      return 0;
    }
    return (this.spent + this.committedBudget) / this.initialBudget;
  }

  /**
   * 获取详细的预算状态
   */
  getDetailedBudgetStatus() {
    return {
      initialBudget: this.initialBudget,
      spent: this.spent,
      committedBudget: this.committedBudget,
      availableBudget: this.getAvailableBudget(),
      remainingBudget: this.getRemainingBudget(),
      budgetUtilization: this.getBudgetUtilization(),
      pendingEstimatesCount: this.pendingEstimates.size,
      conservativeEstimationEnabled: this.conservativeEstimation,
      safetyMargin: this.safetyMargin
    };
  }

  /**
   * 检查是否应启用成本优先模式（动态调整策略）
   * 当剩余预算低于阈值时，返回 true 以切换到成本优先模式
   */
  shouldUseCostPriorityMode() {
    const utilization = this.getBudgetUtilization();
    const availableBudget = this.getAvailableBudget();

    // 如果预算使用率超过阈值或者可用预算低于某个百分比，则启用成本优先模式
    return utilization >= this.costThreshold ||
           (availableBudget / this.initialBudget) < (1 - this.costThreshold);
  }

  /**
   * 重置预算
   */
  resetBudget(newBudget) {
    const oldBudget = this.initialBudget;
    this.initialBudget = newBudget;
    this.spent = 0.0;
    this.committedBudget = 0.0;
    this.pendingEstimates.clear();
    this.transactionHistory = [];

    console.log(`[CostController] 预算已重置：$${oldBudget.toFixed(2)} -> $${newBudget.toFixed(2)}`);
  }

  /**
   * 获取成本调整建议
   * 根据当前预算状况提供选择策略调整建议
   */
  getCostAdjustmentRecommendation() {
    const utilization = this.getBudgetUtilization();
    const availableBudget = this.getAvailableBudget();

    if (utilization >= 0.9 || availableBudget / this.initialBudget <= 0.1) {
      return {
        priority: 'cost',
        thresholdMultiplier: 0.5, // 仅考虑成本最低 50% 的模型
        reason: '预算高度紧张，强制成本优先模式'
      };
    } else if (utilization >= 0.75 || availableBudget / this.initialBudget <= 0.25) {
      return {
        priority: 'balanced-cost',
        thresholdMultiplier: 0.7,
        reason: '预算较紧张，偏向成本优先'
      };
    } else if (utilization >= 0.6 || availableBudget / this.initialBudget <= 0.4) {
      return {
        priority: 'balanced',
        thresholdMultiplier: 0.8,
        reason: '预算中等，平衡成本与质量'
      };
    } else {
      return {
        priority: 'quality',
        thresholdMultiplier: 1.0,
        reason: '预算充足，优先考虑质量'
      };
    }
  }

  /**
   * 增加预算
   */
  addBudget(amount) {
    this.initialBudget += amount;
    console.log(`[CostController] 预算增加：+$${amount.toFixed(2)}, 新预算：$${this.initialBudget.toFixed(2)}`);
  }

  /**
   * 获取交易历史
   */
  getTransactionHistory(limit = 100) {
    return this.transactionHistory.slice(-limit);
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const totalTransactions = this.transactionHistory.length;
    const totalSpent = this.spent;
    const avgCost = totalTransactions > 0 ? totalSpent / totalTransactions : 0;

    // 按模型分组统计
    const costByModel = {};
    for (const tx of this.transactionHistory) {
      if (!costByModel[tx.modelId]) {
        costByModel[tx.modelId] = 0;
      }
      // 使用实际成本或预估成本进行统计
      const costToUse = tx.actualCost ? tx.actualCost.total : tx.estimatedCost.total;
      costByModel[tx.modelId] += costToUse;
    }

    return {
      initialBudget: this.initialBudget,
      spent: this.spent,
      committedBudget: this.committedBudget,
      availableBudget: this.getAvailableBudget(),
      remaining: this.getRemainingBudget(),
      utilization: this.getBudgetUtilization(),
      totalTransactions: totalTransactions,
      averageCost: avgCost,
      costByModel: costByModel,
      pendingEstimatesCount: this.pendingEstimates.size,
      conservativeEstimationEnabled: this.conservativeEstimation,
      safetyMargin: this.safetyMargin
    };
  }

  /**
   * 设置最大历史记录数
   */
  setMaxHistorySize(maxSize) {
    this.maxHistorySize = maxSize;
    if (this.transactionHistory.length > maxSize) {
      this.transactionHistory = this.transactionHistory.slice(-maxSize);
    }
  }

  /**
   * 清理过期的待确认预估
   * @private
   */
  _cleanupPendingEstimates() {
    const now = Date.now();
    const expiredTasks = [];

    for (const [taskId, estimate] of this.pendingEstimates.entries()) {
      if (now - estimate.timestamp > this.pendingConfirmTimeout) {
        expiredTasks.push(taskId);
      }
    }

    for (const taskId of expiredTasks) {
      const estimate = this.pendingEstimates.get(taskId);
      this.committedBudget -= estimate.amount;
      this.pendingEstimates.delete(taskId);

      // 更新交易记录状态
      const transaction = this.transactionHistory.find(t => t.taskId === taskId);
      if (transaction) {
        transaction.status = 'expired';
        console.warn(`[CostController] 任务 ${taskId} 待确认预估已过期，释放安全边际：$${estimate.amount.toFixed(6)}`);
      }
    }

    if (expiredTasks.length > 0) {
      console.log(`[CostController] 清理了 ${expiredTasks.length} 个过期的待确认预估`);
    }
  }

  /**
   * 导出交易历史
   */
  exportHistory(format = 'json') {
    if (format === 'json') {
      return JSON.stringify({
        budget: this.initialBudget,
        spent: this.spent,
        committedBudget: this.committedBudget,
        availableBudget: this.getAvailableBudget(),
        transactions: this.transactionHistory
      }, null, 2);
    } else if (format === 'csv') {
      const headers = ['timestamp', 'taskId', 'modelId', 'estimatedInputCost', 'estimatedOutputCost', 'estimatedTotalCost', 'estimatedWithMargin', 'actualInputCost', 'actualOutputCost', 'actualTotalCost', 'status', 'isLocal', 'safetyMargin'];
      const rows = this.transactionHistory.map(tx => [
        tx.timestamp.toISOString(),
        tx.taskId,
        tx.modelId,
        tx.estimatedCost.input.toFixed(6) || '0.000000',
        tx.estimatedCost.output.toFixed(6) || '0.000000',
        tx.estimatedCost.total.toFixed(6) || '0.000000',
        tx.estimatedCostWithMargin?.toFixed(6) || 'N/A',
        tx.actualCost ? tx.actualCost.input.toFixed(6) : 'N/A',
        tx.actualCost ? tx.actualCost.output.toFixed(6) : 'N/A',
        tx.actualCost ? tx.actualCost.total.toFixed(6) : 'N/A',
        tx.status,
        tx.isLocal ? 'true' : 'false',
        tx.safetyMarginApplied?.toFixed(2) || '0'
      ]);

      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    throw new Error(`不支持的导出格式：${format}`);
  }

  /**
   * 销毁控制器（清理定时器）
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = CostController;
