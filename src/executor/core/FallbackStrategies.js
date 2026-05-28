/**
 * FallbackStrategies - 降级策略集合
 *
 * 为并发执行器提供多种降级策略，确保在不同故障情况下仍能维持服务
 *
 * 策略类型：
 * - TimeoutFallbackStrategy: 超时降级策略
 * - BudgetFallbackStrategy: 预算不足降级策略
 * - UnavailabilityFallbackStrategy: 模型不可用降级策略
 * - UnifiedFallbackManager: 统一降级管理器
 */

/**
 * TimeoutFallbackStrategy - 超时降级策略
 * 当模型响应超时时，使用更轻量的模型或减少复杂度
 */
class TimeoutFallbackStrategy {
  /**
   * 创建超时降级策略管理器
   * @param {Object} modelSelector - 模型选择器
   * @param {Object} costController - 成本控制器
   * @param {Object} concurrencyManager - 并发管理器
   */
  constructor(modelSelector, costController, concurrencyManager) {
    this.modelSelector = modelSelector;
    this.costController = costController;
    this.concurrencyManager = concurrencyManager;
    this.mainExecutor = null;
  }

  /**
   * 设置主执行器
   * @param {Object} mainExecutor - 主执行器
   */
  setMainExecutor(mainExecutor) {
    this.mainExecutor = mainExecutor;
  }

  /**
   * 处理超时错误
   * @param {Object} originalRequest - 原始请求
   * @param {Error} timeoutError - 超时错误
   * @param {Array} availableAlternatives - 可用的备选模型
   * @returns {Promise<Object>} 降级执行结果
   */
  async handleTimeoutError(originalRequest, timeoutError, availableAlternatives = []) {
    const { task, modelId, prompt, estimatedCost } = originalRequest;

    console.log(`Slot acquisition timed out for model ${modelId}, attempting fallback...`);

    // 如果有备选模型，尝试使用备选模型
    if (availableAlternatives && availableAlternatives.length > 0) {
      for (const alt of availableAlternatives) {
        const altModelId = typeof alt === 'string' ? alt : (alt.modelId || alt.model);

        if (!altModelId) {
          continue; // 跳过无效的备选模型
        }

        try {
          // 检查备选模型的预算是否足够
          const altModel = this.modelSelector?.getModelSpec ? this.modelSelector.getModelSpec(altModelId) : null;
          const altEstimatedCost = this.estimateCost(task, altModel, estimatedCost);

          if (this.costController?.canAllocate?.(altEstimatedCost, true)) {
            console.log(`Attempting fallback to model ${altModelId}`);

            // 【修复】计算剩余的备选模型列表
            const remainingAlternatives = availableAlternatives
              .map(a => typeof a === 'string' ? a : (a.modelId || a.model))
              .filter(id => id && id !== altModelId);

            // 执行备选模型的请求
            return {
              success: true,
              fallback: true,
              original_model: modelId,
              fallback_model: altModelId,
              reason: 'original_model_slot_unavailable',
              execution_start: await this.executeWithModel(altModelId, task, prompt, altEstimatedCost, remainingAlternatives)
            };
          }
        } catch (error) {
          console.warn(`Fallback to ${altModelId} failed:`, error.message);
          continue; // 尝试下一个备选模型
        }
      }
    }

    // 如果所有备选模型都不可用，则尝试等待更长时间或返回错误
    return {
      success: false,
      error: timeoutError,
      reason: 'all_models_unavailable',
      alternatives_tried: availableAlternatives
    };
  }

  /**
   * 估算备选模型的成本
   * @param {Object} task - 任务
   * @param {Object} modelSpec - 模型规格
   * @param {number} referenceCost - 参考成本
   * @returns {number} 估算成本
   */
  estimateCost(task, modelSpec, referenceCost) {
    // 根据任务复杂度和模型定价估算成本
    if (modelSpec && modelSpec.pricing) {
      const baseCost = modelSpec.pricing.inputPrice || 0.000015;
      const complexityFactor = this.getTaskComplexityFactor(task);
      return baseCost * complexityFactor;
    }

    // 如果没有模型规格，使用参考成本或默认值
    return referenceCost || 0.001;
  }

  /**
   * 获取任务复杂度因子
   * @param {Object} task - 任务
   * @returns {number} 复杂度因子
   */
  getTaskComplexityFactor(task) {
    // 根据任务类型和长度确定复杂度因子
    if (task.type === 'simple') return 1.0;
    if (task.type === 'moderate') return 2.0;
    if (task.type === 'complex') return 3.0;
    return 1.5; // 默认
  }

  /**
   * 执行单个模型的请求
   * @param {string} modelId - 模型ID
   * @param {Object} task - 任务
   * @param {string} prompt - 提示词
   * @param {number} estimatedCost - 预估成本
   * @param {Array} remainingAlternatives - 剩余的备选模型列表
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithModel(modelId, task, prompt, estimatedCost, remainingAlternatives = []) {
    // 使用主执行器执行请求
    if (this.mainExecutor && typeof this.mainExecutor.executeRequestWithRetryTracking === 'function') {
      const taskId = task?.id || `fallback_${Date.now()}`;
      const traceId = `fallback_${taskId}`;
      // 【修复】当从 FallbackStrategies 调用时，不要再传递 alternatives
      // 因为 FallbackStrategies 已经在处理 fallback 循环
      return await this.mainExecutor.executeRequestWithRetryTracking(
        modelId,
        task,
        taskId,
        traceId,
        { estimatedCost, alternatives: [] }  // 不再传递 remainingAlternatives
      );
    }
    throw new Error(`Timeout fallback: mainExecutor not available for model ${modelId}`);
  }
}

/**
 * BudgetFallbackStrategy - 预算不足降级策略
 * 当预算不足以执行当前模型时，寻找成本更低的替代模型
 */
class BudgetFallbackStrategy {
  /**
   * 创建预算不足降级策略管理器
   * @param {Object} modelSelector - 模型选择器
   * @param {Object} costController - 成本控制器
   */
  constructor(modelSelector, costController) {
    this.modelSelector = modelSelector;
    this.costController = costController;
    this.mainExecutor = null;
  }

  /**
   * 设置主执行器
   * @param {Object} mainExecutor - 主执行器
   */
  setMainExecutor(mainExecutor) {
    this.mainExecutor = mainExecutor;
  }

  /**
   * 处理预算超出的情况
   * @param {Object} originalRequest - 原始请求
   * @returns {Promise<Object>} 降级执行结果
   */
  async handleBudgetExceeded(originalRequest) {
    const { task, modelId, prompt, estimatedCost } = originalRequest;

    console.log(`Budget exceeded for model ${modelId} (estimated cost: $${estimatedCost}), finding cheaper alternative...`);

    // 寻找成本更低的模型
    const cheaperModels = this.findCheaperModels(modelId, estimatedCost);

    if (cheaperModels.length > 0) {
      // 按照成本从低到高排序
      cheaperModels.sort((a, b) => a.estimatedCost - b.estimatedCost);

      for (const cheaperModel of cheaperModels) {
        if (this.costController.canAllocate(cheaperModel.estimatedCost, true)) {
          console.log(`Found cheaper model ${cheaperModel.modelId} with estimated cost $${cheaperModel.estimatedCost}`);

          // 【修复】计算剩余的备选模型列表
          const remainingAlternatives = cheaperModels
            .map(m => m.modelId)
            .filter(id => id !== cheaperModel.modelId);

          // 使用更便宜的模型执行
          return {
            success: true,
            fallback: true,
            original_model: modelId,
            fallback_model: cheaperModel.modelId,
            reason: 'budget_insufficient_for_original_model',
            cost_saved: estimatedCost - cheaperModel.estimatedCost,
            execution_start: await this.executeWithModel(cheaperModel.modelId, task, prompt, cheaperModel.estimatedCost, remainingAlternatives)
          };
        }
      }
    }

    return {
      success: false,
      error: new Error(`Insufficient budget for task and no cheaper alternatives available`),
      reason: 'no_affordable_models_available'
    };
  }

  /**
   * 查找成本更低的模型
   * @param {string} originalModelId - 原始模型ID
   * @param {number} originalCost - 原始成本
   * @returns {Array} 成本更低的模型列表
   */
  findCheaperModels(originalModelId, originalCost) {
    // 查找成本低于 originalCost 的可用模型
    // 注意：在真实环境中，这里应该从模型选择器获取所有可用模型
    // 为了演示目的，返回一个模拟的列表
    const cheaperModels = [];

    // 这里应该集成实际的模型发现逻辑
    // 模拟几个更便宜的模型
    const mockCheaperModels = [
      { modelId: 'gpt-3.5-turbo', pricing: { inputPrice: 0.000005, outputPrice: 0.000015 } },
      { modelId: 'claude-sonnet', pricing: { inputPrice: 0.000003, outputPrice: 0.000015 } },
      { modelId: 'gemini-pro', pricing: { inputPrice: 0.000004, outputPrice: 0.000012 } }
    ];

    for (const model of mockCheaperModels) {
      const estimatedCost = this.estimateModelCost(model, originalCost);
      if (estimatedCost < originalCost) {
        cheaperModels.push({
          modelId: model.modelId,
          estimatedCost: estimatedCost,
          capabilities: ['text_generation']
        });
      }
    }

    return cheaperModels;
  }

  /**
   * 估算模型成本
   * @param {Object} model - 模型信息
   * @param {number} referenceCost - 参考成本
   * @returns {number} 估算成本
   */
  estimateModelCost(model, referenceCost) {
    // 基于模型定价和能力估算成本
    if (model.pricing) {
      return (model.pricing.inputPrice + model.pricing.outputPrice) * 1000; // 简化的成本计算
    }
    // 默认基于模型类型估算
    if (model.modelId && (model.modelId.includes('mini') || model.modelId.includes('light'))) {
      return referenceCost * 0.5; // 更小的模型成本更低
    }
    return referenceCost * 0.8; // 其他模型假设有一定折扣
  }

  /**
   * 检查模型是否适用
   * @param {Object} candidateModel - 候选模型
   * @param {string} originalModelId - 原始模型ID
   * @returns {boolean} 是否适用
   */
  isModelSuitable(candidateModel, originalModelId) {
    // 检查备选模型是否适合执行原始任务
    // 例如，确保功能兼容性、延迟要求等
    return candidateModel.capabilities && candidateModel.capabilities.includes('text_generation');
  }

  /**
   * 执行单个模型的请求
   * @param {string} modelId - 模型ID
   * @param {Object} task - 任务
   * @param {string} prompt - 提示词
   * @param {number} estimatedCost - 预估成本
   * @param {Array} remainingAlternatives - 剩余的备选模型列表
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithModel(modelId, task, prompt, estimatedCost, remainingAlternatives = []) {
    // 使用主执行器执行请求
    if (this.mainExecutor && typeof this.mainExecutor.executeRequestWithRetryTracking === 'function') {
      const taskId = task?.id || `budget_fallback_${Date.now()}`;
      const traceId = `budget_fallback_${taskId}`;
      // 【修复】当从 FallbackStrategies 调用时，不要再传递 alternatives
      // 因为 FallbackStrategies 已经在处理 fallback 循环
      return await this.mainExecutor.executeRequestWithRetryTracking(
        modelId,
        task,
        taskId,
        traceId,
        { estimatedCost, alternatives: [] }  // 不再传递 remainingAlternatives
      );
    }
    throw new Error(`Budget fallback: mainExecutor not available for model ${modelId}`);
  }
}

/**
 * UnavailabilityFallbackStrategy - 模型不可用降级策略
 * 当模型在执行过程中变为不可用时，使用备选模型重试
 */
class UnavailabilityFallbackStrategy {
  /**
   * 创建模型不可用降级策略管理器
   * @param {Object} modelSelector - 模型选择器
   * @param {Object} statusMonitor - 状态监控器
   * @param {Object} concurrencyController - 并发控制器（用于获取模型负载信息）
   */
  constructor(modelSelector, statusMonitor, concurrencyController = null) {
    this.modelSelector = modelSelector;
    this.statusMonitor = statusMonitor;
    this.concurrencyController = concurrencyController;
    this.mainExecutor = null;
  }

  /**
   * 设置主执行器
   * @param {Object} mainExecutor - 主执行器
   */
  setMainExecutor(mainExecutor) {
    this.mainExecutor = mainExecutor;
  }

  /**
   * 获取备选模型的当前负载分数
   * @param {string} modelId - 模型ID
   * @returns {Promise<number>} 负载分数（0-1，越低表示负载越低）
   */
  async _getModelLoadScore(modelId) {
    try {
      // 优先从 statusMonitor 获取
      if (this.statusMonitor?.getModelLoadScore) {
        return this.statusMonitor.getModelLoadScore(modelId) || 0;
      }
      // 其次从 concurrencyController 获取
      if (this.concurrencyController?.getLoadInfo) {
        const loadInfo = await this.concurrencyController.getLoadInfo(modelId);
        return loadInfo?.loadScore || 0;
      }
      // 最后尝试直接获取信号量信息
      if (this.concurrencyController?.getModelSemaphore) {
        const semaphore = this.concurrencyController.getModelSemaphore(modelId);
        if (semaphore) {
          // 计算负载分数：当前等待数 / 最大并发数
          const currentLoad = semaphore._waiters?.length || 0;
          const maxConcurrency = semaphore._capacity || 10;
          return Math.min(1, currentLoad / maxConcurrency);
        }
      }
    } catch (error) {
      console.warn(`[UnavailabilityFallback] 获取模型 ${modelId} 负载失败:`, error.message);
    }
    return 0.5; // 默认中等负载
  }

  /**
   * 处理模型不可用的情况
   * @param {Object} originalRequest - 原始请求
   * @param {Error} executionError - 执行错误
   * @returns {Promise<Object>} 降级执行结果
   */
  async handleModelUnavailability(originalRequest, executionError) {
    const { task, modelId, prompt, estimatedCost, alternatives: requestAlternatives } = originalRequest;

    console.log(`Model ${modelId} became unavailable during execution:`, executionError.message);

    // 标记模型为不可用状态
    if (this.statusMonitor?.markModelUnavailable) {
      this.statusMonitor.markModelUnavailable(modelId, {
        reason: 'execution_error',
        error: executionError.message,
        timestamp: new Date()
      });
    }

    // 【修复】优先使用原始请求中传递的备选模型，其次使用 getAlternativeModels 获取的备选模型
    // 【修复】同时确保 alternatives 按 score 降序排序
    let alternatives;
    if (requestAlternatives && requestAlternatives.length > 0) {
      // 重新排序：确保按 score 降序排列（分数高的在前）
      const sortedAlternatives = [...requestAlternatives]
        .filter(alt => alt && typeof alt === 'object' && typeof alt.score === 'number')
        .sort((a, b) => (b.score || 0) - (a.score || 0));
      console.log(`[FallbackStrategies] 重新排序后的 alternatives: ${sortedAlternatives.map((a, i) => `${i}:${a.modelId}(${a.score.toFixed(2)})`).join(', ')}`);
      alternatives = sortedAlternatives;
    } else {
      alternatives = await this.getAlternativeModels(task, modelId);
    }

    if (alternatives && alternatives.length > 0) {
      // 【修复】alternatives 可能是对象数组（如 {modelId, cost, ...}）或字符串数组
      // 需要统一处理，提取 modelId
      const altModelIds = alternatives.map(alt => alt.modelId || alt);
      console.log(`Trying alternative models:`, altModelIds);

      // 【新增】获取所有备选模型的负载信息
      const alternativesWithLoad = await Promise.all(
        alternatives.map(async (alt) => {
          const altModelId = alt.modelId || alt;
          const loadScore = await this._getModelLoadScore(altModelId);
          return { alt, modelId: altModelId, loadScore };
        })
      );

      // 【新增】按负载升序排序（负载低的优先），同负载时按 score 降序
      alternativesWithLoad.sort((a, b) => {
        // 负载差异超过 0.1 时，负载低的优先
        if (Math.abs(a.loadScore - b.loadScore) > 0.1) {
          return a.loadScore - b.loadScore;
        }
        // 负载相近 时，按 score 排序（分数高的在前）
        return (b.alt.score || 0) - (a.alt.score || 0);
      });

      console.log(`[FallbackStrategies] 按负载排序后的 alternatives: ${alternativesWithLoad.map((a, i) => `${i}:${a.modelId}(score=${(a.alt.score || 0).toFixed(2)}, load=${a.loadScore.toFixed(2)})`).join(', ')}`);

      // 使用排序后的结果尝试执行
      for (const { alt, modelId: altModelId, loadScore } of alternativesWithLoad) {
        try {
          // 检查备选模型是否可用
          const altModelStatus = this.statusMonitor?.getModelStatus?.(altModelId);
          if (!altModelStatus || altModelStatus.available !== false) {
            console.log(`Attempting retry with alternative model ${altModelId} (load=${loadScore.toFixed(2)})`);

            // 【修复】计算剩余的备选模型列表（排除当前尝试的模型）
            const remainingAlternatives = alternatives
              .map(a => a.modelId || a)
              .filter(id => id !== altModelId);
            console.log(`Remaining alternatives for ${altModelId}:`, remainingAlternatives);

            // 执行备选模型的请求，传递剩余的备选模型列表
            return await this.executeWithModel(altModelId, task, prompt, estimatedCost, remainingAlternatives);
          }
        } catch (altError) {
          console.warn(`Alternative model ${altModelId} also failed:`, altError.message);
          continue; // 尝试下一个备选模型
        }
      }
    }

    return {
      success: false,
      error: executionError,
      reason: 'primary_and_alternatives_unavailable',
      unavailability_cascade: true
    };
  }

  /**
   * 基于健康检查的降级处理
   * @param {Object} originalRequest - 原始请求
   * @returns {Promise<Object|null>} 降级执行结果或null（如果不使用此策略）
   */
  async handleHealthCheckBasedFallback(originalRequest) {
    const { task, modelId, prompt, estimatedCost } = originalRequest;

    // 在执行前快速健康检查
    const modelStatus = this.statusMonitor?.getModelStatus?.(modelId);

    if (modelStatus && !modelStatus.available) {
      console.log(`Model ${modelId} is marked as unavailable, attempting fallback...`);

      // 获取备选模型并按健康状态排序
      const alternatives = await this.getAlternativeModels(task, modelId);
      const healthyAlternatives = alternatives.filter(altModelId => {
        const status = this.statusMonitor?.getModelStatus?.(altModelId);
        return status && status.available && (status.healthScore > 0.5 || status.healthScore === undefined); // 只选择相对健康的模型
      });

      for (const altModelId of healthyAlternatives) {
        try {
          // 【修复】计算剩余的备选模型列表
          const remainingAlternatives = alternatives.filter(id => id !== altModelId);
          return await this.executeWithModel(altModelId, task, prompt, estimatedCost, remainingAlternatives);
        } catch (error) {
          console.warn(`Fallback model ${altModelId} failed:`, error.message);
          continue;
        }
      }
    }

    return null; // 返回null表示不使用此降级策略
  }

  /**
   * 获取备选模型
   * @param {Object} task - 任务
   * @param {string} originalModelId - 原始模型ID
   * @returns {Promise<Array>} 备选模型列表
   */
  async getAlternativeModels(task, originalModelId) {
    // 尝试从模型选择器获取备选模型
    console.log(`[UnavailabilityFallback] getAlternativeModels called: modelSelector=${this.modelSelector ? 'exists' : 'null/undefined'}, hasMethod=${!!this.modelSelector?.getAlternativeModels}`);

    if (this.modelSelector?.getAlternativeModels) {
      console.log(`[UnavailabilityFallback] Using modelSelector.getAlternativeModels`);
      return await this.modelSelector.getAlternativeModels(task, originalModelId);
    }

    // 如果模型选择器不可用，使用 getGlobalAvailableModels 获取备选模型
    if (this.modelSelector?.getGlobalAvailableModels) {
      console.log(`[UnavailabilityFallback] Using modelSelector.getGlobalAvailableModels`);
      return await this.modelSelector.getGlobalAvailableModels(originalModelId, false);
    }

    // 如果模型选择器完全不可用，返回一个默认列表
    console.log(`[UnavailabilityFallback] Using default fallback list`);
    return [
      'deepseek-chat',
      'deepseek-reasoner',
      'MiniMax-M2.5'
    ];
  }

  /**
   * 执行单个模型的请求
   * @param {string} modelId - 模型ID
   * @param {Object} task - 任务
   * @param {string} prompt - 提示词
   * @param {number} estimatedCost - 预估成本
   * @param {Array} remainingAlternatives - 剩余的备选模型列表（用于传递到执行器）
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithModel(modelId, task, prompt, estimatedCost, remainingAlternatives = []) {
    // 使用主执行器执行请求
    if (this.mainExecutor && typeof this.mainExecutor.executeRequestWithRetryTracking === 'function') {
      const taskId = task?.id || `unavail_fallback_${Date.now()}`;
      const traceId = `unavail_fallback_${taskId}`;
      // 【修复】当从 FallbackStrategies 调用时，不要再传递 alternatives
      // 因为 FallbackStrategies 已经在处理 fallback 循环
      // 如果传递 alternatives，会导致 adaptiveSchedule 再次尝试所有模型
      // 从而造成同一个任务被多个模型重复执行
      return await this.mainExecutor.executeRequestWithRetryTracking(
        modelId,
        task,
        taskId,
        traceId,
        { estimatedCost, alternatives: [] }  // 不再传递 remainingAlternatives
      );
    }
    throw new Error(`Unavailability fallback: mainExecutor not available for model ${modelId}`);
  }
}

/**
 * UnifiedFallbackManager - 统一降级管理器
 * 整合各种降级策略，按优先级顺序处理
 */
class UnifiedFallbackManager {
  /**
   * 创建统一降级管理器
   * @param {Object} modelSelector - 模型选择器
   * @param {Object} costController - 成本控制器
   * @param {Object} concurrencyManager - 并发管理器
   * @param {Object} statusMonitor - 状态监控器
   */
  constructor(modelSelector, costController, concurrencyManager, statusMonitor) {
    this.timeoutFallback = new TimeoutFallbackStrategy(modelSelector, costController, concurrencyManager);
    this.budgetFallback = new BudgetFallbackStrategy(modelSelector, costController);
    this.unavailabilityFallback = new UnavailabilityFallbackStrategy(modelSelector, statusMonitor, concurrencyManager);

    // 降级策略优先级
    this.fallbackOrder = [
      'budget_exceeded',
      'timeout_error',
      'model_unavailable',
      'execution_error'
    ];
  }

  /**
   * 处理降级
   * @param {Object} request - 请求
   * @param {string} errorType - 错误类型
   * @param {Error} originalError - 原始错误
   * @param {Object} additionalContext - 额外上下文
   * @returns {Promise<Object>} 降级处理结果
   */
  async handleFallback(request, errorType, originalError, additionalContext = {}) {
    switch (errorType) {
      case 'timeout_error':
        return await this.timeoutFallback.handleTimeoutError(
          request,
          originalError,
          additionalContext.alternatives || []
        );

      case 'budget_exceeded':
        return await this.budgetFallback.handleBudgetExceeded(request);

      case 'model_unavailable':
      case 'execution_error':
        return await this.unavailabilityFallback.handleModelUnavailability(request, originalError);

      default:
        console.warn(`Unknown error type: ${errorType}, no fallback strategy`);
        return {
          success: false,
          error: originalError,
          reason: 'unknown_error_no_fallback'
        };
    }
  }

  /**
   * 执行带有全面降级支持的任务
   * @param {Object} executionRequest - 执行请求
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithFallbackSupport(executionRequest) {
    const { task, modelId, prompt, estimatedCost, alternatives } = executionRequest;
    const taskId = task.id || Date.now().toString();

    console.log(`Starting execution for task ${taskId} using model ${modelId}`);

    // 1. 预分配成本 - 如果预算不足，先尝试更便宜的模型
    if (estimatedCost && this.budgetFallback.costController) {
      if (!this.budgetFallback.costController.canAllocate(estimatedCost, true)) {
        const budgetFallbackResult = await this.handleFallback(
          executionRequest,
          'budget_exceeded',
          new Error('Insufficient budget')
        );

        if (budgetFallbackResult.success) {
          return budgetFallbackResult.execution_start;
        } else if (budgetFallbackResult.reason === 'no_affordable_models_available') {
          return {
            task_id: taskId,
            success: false,
            error: 'No affordable models available',
            model_used: modelId,
            fallback_applied: true,
            fallback_result: budgetFallbackResult
          };
        }
      }

      // 成本预分配
      try {
        const allocationOk = await this.budgetFallback.costController.allocateEstimated(estimatedCost, taskId, modelId);
        if (!allocationOk) {
          return {
            task_id: taskId,
            success: false,
            error: 'Insufficient budget after initial check',
            model_used: modelId
          };
        }
      } catch (costError) {
        console.error('Cost allocation failed:', costError.message);
        return {
          task_id: taskId,
          success: false,
          error: costError.message,
          model_used: modelId
        };
      }
    }

    // 2. 执行模型不可用预检查
    if (this.unavailabilityFallback.statusMonitor) {
      const healthFallbackResult = await this.unavailabilityFallback.handleHealthCheckBasedFallback(executionRequest);
      if (healthFallbackResult) {
        return healthFallbackResult;
      }
    }

    // 3. 获取并发槽位
    try {
      if (this.timeoutFallback.concurrencyManager) {
        await this.timeoutFallback.concurrencyManager.acquireSlot(modelId, 60000);
      }
    } catch (timeoutError) {
      if (timeoutError.message.includes('Timeout') || timeoutError.message.includes('timeout')) {
        const timeoutFallbackResult = await this.handleFallback(
          executionRequest,
          'timeout_error',
          timeoutError,
          { alternatives: alternatives || [] }
        );

        if (timeoutFallbackResult.success) {
          return timeoutFallbackResult.execution_start;
        } else {
          return {
            task_id: taskId,
            success: false,
            error: timeoutFallbackResult.error?.message || timeoutError.message,
            model_used: modelId,
            fallback_applied: timeoutFallbackResult.fallback,
            fallback_result: timeoutFallbackResult
          };
        }
      } else {
        throw timeoutError; // 其他错误直接抛出
      }
    }

    // 4. 执行请求（这里简化，实际会包含重试逻辑）
    let executionResult;
    try {
      executionResult = await this.executeRequestWithRetries(executionRequest);
    } catch (executionError) {
      // 模型可能在执行过程中变为不可用，尝试降级
      const unavailabilityFallbackResult = await this.handleFallback(
        executionRequest,
        'execution_error',
        executionError
      );

      if (unavailabilityFallbackResult.success) {
        return unavailabilityFallbackResult;
      } else {
        return {
          task_id: taskId,
          success: false,
          error: executionError.message,
          model_used: modelId,
          fallback_applied: unavailabilityFallbackResult.unavailability_cascade
        };
      }
    }

    return executionResult;
  }

  /**
   * 设置主执行器（用于委托实际请求执行）
   * @param {Object} mainExecutor - 主执行器
   */
  setMainExecutor(mainExecutor) {
    this.mainExecutor = mainExecutor;

    // 将主执行器传递给各个降级策略
    if (this.timeoutFallback?.setMainExecutor) {
      this.timeoutFallback.setMainExecutor(mainExecutor);
    }
    if (this.budgetFallback?.setMainExecutor) {
      this.budgetFallback.setMainExecutor(mainExecutor);
    }
    if (this.unavailabilityFallback?.setMainExecutor) {
      this.unavailabilityFallback.setMainExecutor(mainExecutor);
    }

    console.log('[FallbackStrategies] 主执行器已传递给所有降级策略');
  }

  /**
   * 执行带重试的请求
   * @param {Object} executionRequest - 执行请求
   * @returns {Promise<Object>} 执行结果
   */
  async executeRequestWithRetries(executionRequest) {
    // 如果设置了主执行器，则委托给主执行器执行
    if (this.mainExecutor && typeof this.mainExecutor.executeRequestWithRetryTracking === 'function') {
      return await this.mainExecutor.executeRequestWithRetryTracking(
        executionRequest.modelId,
        executionRequest.task,
        executionRequest.taskId,
        executionRequest.traceId,
        executionRequest.executionInfo
      );
    }

    // 否则抛出错误，表示需要实现真正的执行逻辑
    throw new Error("executeRequestWithRetries: main executor not set or method not implemented");
  }
}

module.exports = {
  TimeoutFallbackStrategy,
  BudgetFallbackStrategy,
  UnavailabilityFallbackStrategy,
  UnifiedFallbackManager
};