/**
 * CostTracker - 成本跟踪器
 * 跟踪实际执行成本并与预估成本对比
 *
 * 【改进】(2026-03-28):
 * - 集成 TokenUsageParser 解析实际 token 使用
 * - 任务失败时扣除预估成本或释放预算
 * - 与 ModelSelector 的成本控制器共享状态
 *
 * 【改进】(成本反馈回路增强):
 * - 从模型注册表统一获取定价信息，消除硬编码
 * - 新增 handlePartialCostUpdate 处理异常时的部分成本更新
 * - 确保任何情况下成本数据的一致性
 */

const TokenUsageParser = require('../utils/TokenUsageParser');
const { MetricsCollector } = require('../../metrics/MetricsCollector');

class CostTracker {
  constructor(costController = null, tokenParser = null, modelRegistry = null, metricsCollector = null) {
    this.costController = costController; // ModelSelector 的成本控制器（共享）
    this.tokenParser = tokenParser || new TokenUsageParser();
    this.modelRegistry = modelRegistry; // 模型注册表（用于获取定价信息）

    // 【修复】MetricsCollector 需要 CostTracker 实例来委托计算成本
    if (metricsCollector) {
      this.metricsCollector = metricsCollector;
      this.metricsCollector.setCostTracker(this);
    } else {
      this.metricsCollector = new MetricsCollector(this); // 传入自身引用
    }

    this.taskCosts = new Map(); // 任务 ID -> 预估成本
    this.actualTokenUsage = new Map(); // 任务 ID -> 实际 token 使用
    this.partialCosts = new Map(); // 任务 ID -> 部分成本（用于异常处理）
  }

  setModelRegistry(modelRegistry) {
    // 设置模型注册表（用于获取定价信息）
    this.modelRegistry = modelRegistry;
  }

  async preAllocate(taskId, estimatedCost, modelId) {
    /**
     * 预分配成本
     * 在执行前先在共享的成本控制器中预留预估成本
     */
    if (this.costController) {
      return this.costController.allocateEstimated(estimatedCost, taskId, modelId);
    }
    return true; // 如果没有成本控制器，默认允许
  }

  async updateActualCost(taskId, actualCost, tokenUsage, modelId) {
    /**
     * 更新实际成本
     * 执行完成后更新到共享的成本控制器
     *
     * 【改进】:tokenUsage 可以是原始响应或已解析的 TokenUsage 对象
     * 【改进】(2026-04-02): 优先从 ModelRegistry 获取提供商信息
     */
    // 如果是原始响应，先解析 token
    const parsedUsage = typeof tokenUsage === 'object' && tokenUsage.input !== undefined
      ? tokenUsage
      : this.tokenParser.parse(tokenUsage, modelId);

    // 缓存实际 token 使用
    this.actualTokenUsage.set(taskId, parsedUsage);

    if (this.costController) {
      return this.costController.updateActualCost(taskId, actualCost, parsedUsage);
    }
  }

  async confirmEstimate(taskId, actualCost) {
    /**
     * 确认预估（任务开始执行时调用）
     * 释放安全边际，从待确认状态转为已确认状态
     */
    if (this.costController) {
      return this.costController.confirmEstimate(taskId, actualCost);
    }
  }

  async handleExecutionFailure(taskId, estimatedCost = null) {
    /**
     * 处理执行失败
     * 如果任务执行失败，需要通知成本控制器释放预占的预算
     *
     * 【改进】(2026-03-28):
     * - 明确失败时的成本处理策略
     * - 可选择扣除部分预估成本（如果已消耗）或完全释放
     */
    if (this.costController) {
      // 策略 2: 扣除部分预估成本（任务已执行但失败，可能已消耗 token）
      // 根据失败阶段决定扣除比例
      return this.costController.handleExecutionFailure(taskId, estimatedCost);
    }

    // 如果没有成本控制器，本地清理
    this.taskCosts.delete(taskId);
    this.actualTokenUsage.delete(taskId);
  }

  async parseAndUpdateCost(taskId, apiResponse, modelId, sessionId = null, executionTime = 0) {
    /**
     * 【新增】解析 API 响应并更新成本
     * 简化调用方的操作，一站式处理
     * 【改进】(2026-04-02): 优先从 ModelRegistry 获取提供商信息
     * 【改进】(2026-04-07): 集成 MetricsCollector 记录指标
     */
    const provider = this.tokenParser.getProvider(modelId, this.modelRegistry);
    const tokenUsage = this.tokenParser.parse(apiResponse, modelId);
    const actualCost = this.calculateCost(modelId, tokenUsage);

    await this.updateActualCost(taskId, actualCost, tokenUsage, modelId);

    // 记录指标（如果提供了会话ID）
    if (sessionId && this.metricsCollector) {
      await this.metricsCollector.recordTask(
        sessionId,
        taskId,
        modelId,
        tokenUsage,
        executionTime,
        { provider }
      );
    }

    return { tokenUsage, actualCost };
  }

  calculateCost(modelId, tokenUsage) {
    // 根据模型 ID 和 token 使用量计算成本
    // 这里需要根据具体模型的定价策略实现
    const pricing = this.getModelPricing(modelId);
    const inputCost = (tokenUsage.input / 1000000) * pricing.inputPrice;
    const outputCost = (tokenUsage.output / 1000000) * pricing.outputPrice;
    return inputCost + outputCost;
  }

  getModelPricing(modelId) {
    /**
     * 从模型注册表获取定价信息
     * 【改进】消除硬编码，统一从模型注册表读取定价
     *
     * 配置文件中定价字段为 pricing.input 和 pricing.output（每百万 token 价格）
     */
    const defaultPricing = {
      inputPrice: 0.000015,  // 每百万 token 输入价格（默认）
      outputPrice: 0.000030   // 每百万 token 输出价格（默认）
    };

    // 优先从模型注册表获取定价
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.pricing) {
        // 配置文件中字段为 input/output，转换为 inputPrice/outputPrice
        return {
          inputPrice: model.pricing.input || model.pricing.inputPrice || defaultPricing.inputPrice,
          outputPrice: model.pricing.output || model.pricing.outputPrice || defaultPricing.outputPrice
        };
      }
    }

    // 降级：使用硬编码定价（仅作为临时降级方案）
    // TODO: 未来版本移除硬编码，强制要求模型注册表提供定价
    if (modelId.includes('gpt-4')) {
      return { inputPrice: 0.00003, outputPrice: 0.00006 };
    } else if (modelId.includes('claude-3') || modelId.includes('claude-sonnet')) {
      return { inputPrice: 0.000003, outputPrice: 0.000015 };
    } else if (modelId.includes('gemini-2.0')) {
      return { inputPrice: 0.0000075, outputPrice: 0.000015 };
    } else if (modelId.includes('gpt-4o-mini')) {
      return { inputPrice: 0.000015, outputPrice: 0.000060 };
    }

    return defaultPricing;
  }

  async handlePartialCostUpdate(taskId, partialTokenUsage, modelId, failureStage) {
    /**
     * 【新增】处理异常时的部分成本更新
     *
     * 使用场景：
     * 1. 请求已发出但响应失败（如网络中断）- 可能已消耗 input token
     * 2. 响应解析失败 - 可能已消耗完整 token
     * 3. 执行过程中超时 - 根据阶段估算已消耗成本
     *
     * @param {string} taskId - 任务 ID
     * @param {Object} partialTokenUsage - 部分 token 使用信息（可能不完整）
     * @param {string} modelId - 模型 ID
     * @param {string} failureStage - 失败阶段：'before_request' | 'during_request' | 'after_response' | 'parsing_failed'
     * @returns {Object} { deductedCost, reason }
     */
    const pricing = this.getModelPricing(modelId);
    let deductedCost = 0;
    let reason = '';

    switch (failureStage) {
      case 'before_request':
        // 请求未发出，无成本消耗
        deductedCost = 0;
        reason = 'Task failed before request was sent, no cost deducted';
        break;

      case 'during_request':
        // 请求进行中失败，估算部分 input token 成本
        // 假设平均 input token 的 50% 已消耗
        const estimatedInputCost = (partialTokenUsage?.input || 100) * 0.5 / 1000000 * pricing.inputPrice;
        deductedCost = estimatedInputCost;
        reason = 'Task failed during request, estimated 50% input token cost deducted';
        break;

      case 'after_response':
        // 响应已返回，完整成本已消耗
        if (partialTokenUsage && partialTokenUsage.input !== undefined && partialTokenUsage.output !== undefined) {
          deductedCost = this.calculateCost(modelId, partialTokenUsage);
          reason = 'Task failed after response, full cost deducted';
        } else {
          // 如果 token 使用信息不完整，按最坏情况估算
          deductedCost = (partialTokenUsage?.input || 500) / 1000000 * pricing.inputPrice +
                         (partialTokenUsage?.output || 100) / 1000000 * pricing.outputPrice;
          reason = 'Task failed after response with incomplete token info, estimated cost deducted';
        }
        break;

      case 'parsing_failed':
        // 解析失败，假设完整成本已消耗但无法精确计算
        // 使用预估成本作为参考
        const estimatedCost = this.taskCosts.get(taskId) || 0;
        deductedCost = estimatedCost * 0.8; // 按预估成本的 80% 扣除
        reason = 'Parsing failed, 80% of estimated cost deducted as fallback';
        break;

      default:
        deductedCost = 0;
        reason = 'Unknown failure stage, no cost deducted';
    }

    // 记录部分成本
    this.partialCosts.set(taskId, {
      taskId,
      deductedCost,
      reason,
      failureStage,
      timestamp: Date.now()
    });

    // 通知成本控制器
    if (this.costController && deductedCost > 0) {
      await this.costController.handlePartialCost(taskId, deductedCost, reason);
    }

    // 清理本地状态
    this.taskCosts.delete(taskId);
    this.actualTokenUsage.delete(taskId);

    return { deductedCost, reason };
  }

  getActualTokenUsage(taskId) {
    /**
     * 获取任务的实际 token 使用
     */
    return this.actualTokenUsage.get(taskId);
  }

  getPartialCosts(taskId) {
    /**
     * 【新增】获取任务的部分成本记录（用于调试和审计）
     */
    return this.partialCosts.get(taskId);
  }

  async ensureCostCleanup(taskId) {
    /**
     * 【新增 2026-03-28】确保成本相关资源得到清理
     *
     * 在异常情况下，确保所有相关的成本跟踪数据被正确清理，
     * 避免内存泄漏和数据不一致
     *
     * @param {string} taskId - 任务 ID
     */
    try {
      // 检查是否有待处理的预估成本，若有则释放
      if (this.taskCosts.has(taskId)) {
        if (this.costController) {
          // 通知成本控制器清理相关资源
          await this.costController.releaseUnconfirmed(taskId);
        }
        this.taskCosts.delete(taskId);
      }

      // 检查是否有缓存的 token 使用信息，若有则清理
      if (this.actualTokenUsage.has(taskId)) {
        this.actualTokenUsage.delete(taskId);
      }

      // 检查是否有部分成本记录，若有则可能需要处理
      if (this.partialCosts.has(taskId)) {
        const partialRecord = this.partialCosts.get(taskId);

        // 如果没有通过标准途径处理成本（如在 finally 块中），这里补充处理
        if (this.costController && partialRecord && partialRecord.deductedCost > 0) {
          // 成本可能已经被处理过了，但我们仍然尝试确保一致性
          await this.costController.handlePartialCost(
            taskId,
            partialRecord.deductedCost,
            partialRecord.reason + ' (ensured by cleanup)'
          );
        }

        this.partialCosts.delete(taskId);
      }

      console.debug(`[CostTracker] Cleaned up cost resources for task ${taskId}`);
    } catch (error) {
      console.warn(`[CostTracker] Error during cost cleanup for task ${taskId}:`, error.message);

      // 如果清理过程中出错，至少删除本地缓存以避免内存泄漏
      this.taskCosts.delete(taskId);
      this.actualTokenUsage.delete(taskId);
      this.partialCosts.delete(taskId);
    }
  }
}

module.exports = { CostTracker };