/**
 * ModelAwareConcurrentExecutor - 模型感知的并发执行器
 *
 * Implements model awareness with status checking and reselection functionality
 * Uses composition rather than direct inheritance to avoid circular dependencies
 *
 * 【改进 2026-04-09】集成 BatchScheduler，实现批量预调度机制
 *   - 在批量执行前预检查模型槽位
 *   - 根据可用槽位数自动调整任务分配
 *   - 将超出槽位的任务自动切换到备选模型
 */
const { ModelUnavailableError } = require('./ErrorClasses');
const BatchScheduler = require('./BatchScheduler');

class ModelAwareConcurrentExecutor {
  /**
   * Create model-aware concurrent executor
   * @param {Object} options - Options
   */
  constructor(options = {}) {
    // Dynamically load ConcurrentExecutor to prevent circular dependency
    const { ConcurrentExecutor } = require('../index');

    // Create an instance of ConcurrentExecutor to delegate to
    this.concurrentExecutor = new ConcurrentExecutor(options);

    // Copy properties from the base executor
    Object.assign(this, this.concurrentExecutor);

    // Model status monitor
    this.modelStatusMonitor = options.statusMonitor || options.modelStatusMonitor || null;

    // Model selector reference
    this.modelSelector = options.modelSelector || null;

    // Whether to enable dynamic model reselection
    this.enableDynamicReselection = options.enableDynamicReselection !== false;

    // Reselection policy
    this.reselectionPolicy = {
      maxAttempts: options.reselectionPolicy?.maxAttempts || 3,
      enableCostBased: options.reselectionPolicy?.enableCostBased !== false,
      enablePerformanceBased: options.reselectionPolicy?.enablePerformanceBased !== false,
      fallbackToAnyAvailable: options.reselectionPolicy?.fallbackToAnyAvailable !== false
    };

    // 【新增 2026-04-09】批量预调度器
    // 从 ConcurrentExecutor 获取 concurrencyController 和 modelRegistry
    this.batchScheduler = new BatchScheduler({
      concurrencyController: options.concurrencyController || this.concurrentExecutor?.concurrencyController || null,
      modelRegistry: options.modelRegistry || this.concurrentExecutor?.modelRegistry || null,
      reservedSlotRatio: options.reservedSlotRatio || 0.1,
      loadThreshold: options.loadThreshold || 0.9,
      enableAutoFallback: options.enableAutoFallback !== false
    });

    // 是否启用批量预调度
    this.enableBatchPreSchedule = options.enableBatchPreSchedule !== false;
  }

  /**
   * 设置并发控制器（供外部调用）
   * @param {Object} controller - 并发控制器
   */
  setConcurrencyController(controller) {
    if (this.batchScheduler) {
      this.batchScheduler.setConcurrencyController(controller);
    }
  }

  /**
   * 设置模型注册表（供外部调用）
   * @param {Object} registry - 模型注册表
   */
  setModelRegistry(registry) {
    if (this.batchScheduler) {
      this.batchScheduler.setModelRegistry(registry);
    }
  }

  /**
   * 获取批量调度器
   * @returns {BatchScheduler} 批量调度器实例
   */
  getBatchScheduler() {
    return this.batchScheduler;
  }

  /**
   * 启用/禁用批量预调度
   * @param {boolean} enabled - 是否启用
   */
  setBatchPreScheduleEnabled(enabled) {
    this.enableBatchPreSchedule = enabled;
  }

  /**
   * Execute a single task (override to add model status pre-check)
   * @param {Object} executionRequest - Execution request
   * @returns {Promise<Object>} Execution result
   */
  async execute(executionRequest) {
    const { modelId, task } = executionRequest;

    // Check model availability
    if (this.modelStatusMonitor) {
      const modelStatus = this.modelStatusMonitor.getModelStatus(modelId);

      if (!modelStatus.available) {
        console.log(`[ModelAwareConcurrentExecutor] 模型 ${modelId} 不可用: ${modelStatus.reason}`);

        // If dynamic reselection is enabled, try to reselect a model
        if (this.enableDynamicReselection) {
          const reselectionResult = await this.reselectModel(task, modelId);

          if (reselectionResult.success) {
            console.log(`[ModelAwareConcurrentExecutor] 使用重新选择的模型: ${reselectionResult.newModelId}`);

            // Execute with new model
            return await this.executeWithNewModel(executionRequest, reselectionResult.newModelId);
          } else {
            // All reselection attempts failed, throw exception
            throw new ModelUnavailableError(
              `模型 ${modelId} 不可用且无法重新选择合适的替代模型: ${reselectionResult.error}`,
              modelId
            );
          }
        } else {
          // If not enabling dynamic reselection, throw error directly
          throw new ModelUnavailableError(
            `模型 ${modelId} 不可用: ${modelStatus.reason}`,
            modelId
          );
        }
      }
    }

    // Model is available, execute with original logic
    return await this.concurrentExecutor.execute(executionRequest);
  }

  /**
   * Reselect model
   * @param {Object} task - Task object
   * @param {string} failedModelId - Failed model ID
   * @returns {Promise<Object>} Reselection result
   */
  async reselectModel(task, failedModelId) {
    try {
      // Check if we have a model selector
      if (!this.modelSelector) {
        return {
          success: false,
          error: 'No model selector available for reselection'
        };
      }

      // Get model selection context
      const selectionContext = {
        task: task,
        preferredModel: failedModelId,
        excludeModels: [failedModelId], // Exclude known failed models
        requirements: {
          costEffective: this.reselectionPolicy.enableCostBased,
          performant: this.reselectionPolicy.enablePerformanceBased
        }
      };

      // Try multiple reselection attempts
      for (let attempt = 1; attempt <= this.reselectionPolicy.maxAttempts; attempt++) {
        try {
          // Call model selector for reselection
          const selectionResult = await this.modelSelector.selectBestModel(selectionContext);

          if (selectionResult && selectionResult.selected_model) {
            const newModelId = selectionResult.selected_model;

            // Check if the newly selected model is available
            if (this.modelStatusMonitor) {
              const newModelStatus = this.modelStatusMonitor.getModelStatus(newModelId);

              if (newModelStatus.available) {
                console.log(`[ModelAwareConcurrentExecutor] 成功重新选择模型: ${newModelId}, 尝试: ${attempt}`);

                return {
                  success: true,
                  newModelId: newModelId,
                  selectionDetails: selectionResult,
                  attempts: attempt
                };
              } else {
                console.log(`[ModelAwareConcurrentExecutor] 重新选择的模型 ${newModelId} 也不可用: ${newModelStatus.reason}`);
                continue; // Try next
              }
            } else {
              // If no status monitor, assume selected model is available
              return {
                success: true,
                newModelId: newModelId,
                selectionDetails: selectionResult,
                attempts: attempt
              };
            }
          }
        } catch (error) {
          console.warn(`[ModelAwareConcurrentExecutor] 重新选择尝试 ${attempt} 失败:`, error.message);
          continue;
        }
      }

      // If basic reselection fails, try more relaxed strategy
      if (this.reselectionPolicy.fallbackToAnyAvailable) {
        const availableModels = this.getAvailableModels();

        if (availableModels.length > 0) {
          // Select first available model as fallback
          const fallbackModelId = availableModels[0];

          console.log(`[ModelAwareConcurrentExecutor] 使用后备策略，选择模型: ${fallbackModelId}`);

          return {
            success: true,
            newModelId: fallbackModelId,
            selectionDetails: { selected_model: fallbackModelId, reason: 'fallback_to_available' },
            attempts: this.reselectionPolicy.maxAttempts + 1
          };
        }
      }

      // All attempts failed
      return {
        success: false,
        error: `所有重新选择尝试 (${this.reselectionPolicy.maxAttempts}) 都失败了`
      };
    } catch (error) {
      console.error(`[ModelAwareConcurrentExecutor] 重新选择模型时出错:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute with new model
   * @param {Object} originalRequest - Original request
   * @param {string} newModelId - New model ID
   * @returns {Promise<Object>} Execution result
   */
  async executeWithNewModel(originalRequest, newModelId) {
    // Create execution request with new model
    const newRequest = {
      ...originalRequest,
      modelId: newModelId,
      originalModelId: originalRequest.modelId, // Keep original model ID for tracking
      execution_info: {
        ...originalRequest.execution_info,
        model_reselcted_from: originalRequest.modelId,
        model_reselcted_to: newModelId,
        reselection_occurred: true
      }
    };

    try {
      // Execute task
      const result = await this.concurrentExecutor.execute(newRequest);

      // Mark in result that model was reselected
      result.model_selection_updated = true;
      result.original_model = originalRequest.modelId;
      result.actual_model_used = newModelId;

      return result;
    } catch (error) {
      // If execution with new model also fails, throw appropriate error
      throw new Error(`执行任务时失败，即使使用了新选择的模型 ${newModelId}: ${error.message}`);
    }
  }

  /**
   * Get all available models list
   * @returns {Array<string>} Available model ID list
   */
  getAvailableModels() {
    if (!this.modelStatusMonitor) {
      return [];
    }

    // Get all model statuses
    const allModelStatuses = this.modelStatusMonitor.getAllModelStatuses();

    // Return list of available models
    return Object.keys(allModelStatuses).filter(modelId => {
      const status = allModelStatuses[modelId];
      return status.available;
    });
  }

  /**
   * Set model selector
   * @param {Object} selector - Model selector instance
   */
  setModelSelector(selector) {
    this.modelSelector = selector;
  }

  /**
   * Set status monitor
   * @param {Object} monitor - Model status monitor instance
   */
  setStatusMonitor(monitor) {
    this.modelStatusMonitor = monitor;
  }

  /**
   * Check if model is available
   * @param {string} modelId - Model ID
   * @returns {boolean} Whether model is available
   */
  isModelAvailable(modelId) {
    if (!this.modelStatusMonitor) {
      // If no monitor, assume model is available
      return true;
    }

    const status = this.modelStatusMonitor.getModelStatus(modelId);
    return status.available;
  }

  /**
   * Get model status
   * @param {string} modelId - Model ID
   * @returns {Object} Model status
   */
  getModelStatus(modelId) {
    if (!this.modelStatusMonitor) {
      return { available: true, reason: 'no_monitor', lastChecked: new Date() };
    }

    return this.modelStatusMonitor.getModelStatus(modelId);
  }

  /**
   * Update reselection policy
   * @param {Object} newPolicy - New policy
   */
  updateReselectionPolicy(newPolicy) {
    this.reselectionPolicy = { ...this.reselectionPolicy, ...newPolicy };
  }

  /**
   * Execute batch of tasks (override to apply model-aware logic)
   * 【改进 2026-04-09】集成批量预调度机制
   * @param {Array} batchRequests - Batch requests
   * @param {Object} options - 执行选项
   * @param {boolean} options.enablePreSchedule - 是否启用预调度（默认 true）
   * @param {number} options.reservedSlotRatio - 预留槽位比例
   * @param {number} options.loadThreshold - 负载阈值
   * @returns {Promise<Array>} Execution results array
   */
  async executeBatch(batchRequests, options = {}) {
    const {
      enablePreSchedule = this.enableBatchPreSchedule,
      reservedSlotRatio,
      loadThreshold
    } = options;

    // Step 1: 批量预调度（可选）
    let adjustedRequests = batchRequests;
    let scheduleResult = null;

    if (enablePreSchedule && this.batchScheduler && batchRequests.length > 0) {
      try {
        scheduleResult = await this.batchScheduler.preScheduleBatch(batchRequests, {
          reservedSlotRatio,
          loadThreshold,
          enableAutoFallback: true
        });
        adjustedRequests = scheduleResult.adjustedRequests;

        // 记录调整日志
        if (scheduleResult.adjustments.length > 0) {
          console.log(`[ModelAwareConcurrentExecutor] 批量预调度完成: ${scheduleResult.adjustments.length} 个任务被调整`);
        }
      } catch (error) {
        console.warn(`[ModelAwareConcurrentExecutor] 批量预调度失败，使用原始请求: ${error.message}`);
      }
    }

    // Step 2: 执行任务（使用并发执行器的批量执行）
    const results = await this.concurrentExecutor.executeBatch(adjustedRequests, options);

    // Step 3: 在结果中标记调整信息
    if (scheduleResult && scheduleResult.adjustments.length > 0) {
      results.forEach((result, index) => {
        const adjustment = scheduleResult.adjustments.find(a => a.taskIndex === index);
        if (adjustment) {
          result.pre_scheduled = true;
          result.original_model_id = adjustment.originalModel;
          result.adjusted_model_id = adjustedRequests[index]?.modelId;
          result.adjustment_reason = adjustment.reason;
        }
      });
    }

    return results;
  }

  /**
   * Delegate all other method calls to the underlying ConcurrentExecutor
   */
  async initialize() {
    return await this.concurrentExecutor.initialize();
  }

  async executeTask(executionRequest) {
    return await this.concurrentExecutor.execute(executionRequest);
  }

  async cleanup() {
    return await this.concurrentExecutor.cleanup();
  }

  getStatistics() {
    return this.concurrentExecutor.getStatistics();
  }

  resetStatistics() {
    return this.concurrentExecutor.resetStatistics();
  }

  validateExecutionRequest(request) {
    return this.concurrentExecutor.validateExecutionRequest(request);
  }

  getConfig() {
    return this.concurrentExecutor.getConfig();
  }

  async reloadConfig(newConfig) {
    return await this.concurrentExecutor.reloadConfig(newConfig);
  }

  async executeWithUpstreamIntegration(subtask, selection, options = {}) {
    return await this.concurrentExecutor.executeWithUpstreamIntegration(subtask, selection, options);
  }

  async executeBatchWithUpstreamIntegration(decomposerResults, selectorResults, options = {}) {
    return await this.concurrentExecutor.executeBatchWithUpstreamIntegration(decomposerResults, selectorResults, options);
  }

  async destroy() {
    return await this.concurrentExecutor.destroy();
  }
}

module.exports = ModelAwareConcurrentExecutor;