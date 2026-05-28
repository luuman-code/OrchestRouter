/**
 * FullyEnhancedConcurrentExecutor - 全面增强的并发执行器
 * 集成所有降级策略和高级功能
 */
const {
  UnifiedFallbackManager
} = require('./FallbackStrategies');

class FullyEnhancedConcurrentExecutor {
  /**
   * 创建全面增强的并发执行器
   * @param {Object} options - 选项
   */
  constructor(options = {}) {
    // Dynamically load ConcurrentExecutor to prevent circular dependency
    const { ConcurrentExecutor } = require('../ConcurrentExecutor');

    // 加载提供商端点配置
    const fs = require('fs');
    const path = require('path');
    const yaml = require('js-yaml');

    let providerEndpoints = {};
    try {
      const configPath = path.join(__dirname, '..', 'config', 'provider-endpoints.yaml');
      if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        providerEndpoints = yaml.load(configFile);
      }
    } catch (error) {
      console.warn(`加载提供商端点配置失败: ${error.message}`);
    }

    // 添加端点配置到选项中，并保留详细日志配置
    const enhancedOptions = {
      ...options,
      providerEndpoints,
      enableDetailedLogging: options.enableDetailedLogging || false,
      debugMode: options.debugMode || false
    };

    // Create an instance of ConcurrentExecutor to delegate to
    this.concurrentExecutor = new ConcurrentExecutor(enhancedOptions);

    // Copy properties from the base executor
    Object.assign(this, this.concurrentExecutor);
    // 修复：重新设置 modelRegistry 以防被 Object.assign 覆盖
    if (options.modelRegistry) {
      this.modelRegistry = options.modelRegistry;
    }


    // 保存引用以便降级使用
    this.modelSelector = options.modelSelector;
    this.statusMonitor = options.statusMonitor;
    this.modelRegistry = options.modelRegistry; // 模型注册表

    // 初始化降级管理器
    this.fallbackManager = new UnifiedFallbackManager(
      this.modelSelector,
      this.costController,
      this.concurrencyController, // 使用控制器而不是管理器
      this.statusMonitor
    );

    // 设置主执行器，以便降级管理器可以委托执行请求
    // 创建一个包装对象，提供 executeRequestWithRetryTracking 方法
    // 【修复】当执行失败时抛出错误，以便 UnifiedFallbackManager 可以捕获并触发备选模型重试
    this.fallbackManager.setMainExecutor({
      executeRequestWithRetryTracking: async (modelId, task, taskId, traceId, executionInfo) => {
        const result = await this.concurrentExecutor.execute({
          task,
          modelId,
          taskId,
          traceId,
          ...executionInfo
        });
        // 如果执行失败，抛出错误以触发 fallback 机制
        if (!result.success) {
          const error = new Error(result.error || 'Execution failed');
          error.result = result;
          throw error;
        }
        return result;
      }
    });

    // 确保内部组件都获得正确的 modelRegistry
    if (options.modelRegistry) {
      if (this.sharedConcurrencyManager && typeof this.sharedConcurrencyManager.setModelRegistry === 'function') {
        this.sharedConcurrencyManager.setModelRegistry(options.modelRegistry);
      }
      if (this.limitConfigManager && typeof this.limitConfigManager.setModelRegistry === 'function') {
        this.limitConfigManager.setModelRegistry(options.modelRegistry);
      }
      if (this.costTracker && typeof this.costTracker.setModelRegistry === 'function') {
        this.costTracker.setModelRegistry(options.modelRegistry);
      }
      if (this.requestBuilder && typeof this.requestBuilder.setModelRegistry === 'function') {
        this.requestBuilder.setModelRegistry(options.modelRegistry);
      }
    }

    // 修复：初始化 config 对象，默认禁用降级功能
    // 只有当明确设置 fallback.enabled: true 时才启用降级
    this.config = {
      fallback: {
        enabled: options.fallback?.enabled === true // 默认 false，必须显式启用
      },
      ...options
    };
  }

  /**
   * 执行单个任务（支持全面降级）
   * @param {Object} executionRequest - 执行请求
   * @returns {Promise<Object>} 执行结果
   */
  async execute(executionRequest) {
    const { task, modelId, prompt, estimatedCost, useFallback } = executionRequest;
    const taskId = task?.id || Date.now().toString();

    console.log(`Starting execution for task ${taskId} using model ${modelId}, useFallback=${useFallback}, alternatives=${JSON.stringify(executionRequest.alternatives || [])}`);

    // 【修复】只有当明确设置 useFallback: true 时才使用降级管理器，不要自动启用
    // 之前的逻辑会在 config.fallback.enabled=true 且 useFallback=undefined 时自动启用 fallback
    const shouldUseFallback = useFallback === true;

    console.log(`[Fallback] shouldUseFallback=${shouldUseFallback}, config.fallback.enabled=${this.config?.fallback?.enabled}`);

    if (shouldUseFallback && this.fallbackManager) {
      return await this.fallbackManager.executeWithFallbackSupport(executionRequest);
    }

    // 否则使用原有的执行逻辑
    return await this.concurrentExecutor.execute(executionRequest);
  }

  /**
   * 批量执行任务（支持批量降级和真正并发执行）
   * 【修复】使用 Promise.all 实现真正的并发执行
   * @param {Array} batchRequests - 批量请求
   * @param {Object} options - 选项
   * @param {boolean} options.waitForSlot - 是否等待槽位（默认 true）
   * @param {number} options.slotTimeout - 槽位等待超时（默认 60000ms）
   * @returns {Promise<Array>} 执行结果数组
   */
  async executeBatch(batchRequests, options = {}) {
    const { waitForSlot = true, slotTimeout = 60000 } = options;

    console.log(`[FullyEnhancedConcurrentExecutor] 批量执行 ${batchRequests.length} 个任务，所有任务将同时启动`);

    // 【修复】使用 Promise.all 实现真正的并发执行
    const promises = batchRequests.map((request, index) => {
      // 为每个请求添加槽位等待选项
      const requestWithOptions = {
        ...request,
        waitForSlot,
        slotTimeout
      };

      return this.execute(requestWithOptions)
        .then(result => result)
        .catch(error => {
          console.error(`[FullyEnhancedConcurrentExecutor] 任务 ${index} 执行失败: ${error.message}`);
          return {
            task_id: request.task?.id || `task_${index}`,
            success: false,
            error: error.message,
            errorCode: error.code || 'UNKNOWN_ERROR',
            model_used: request.modelId
          };
        });
    });

    // 等待所有任务完成（无论成功或失败）
    const allResults = await Promise.all(promises);

    console.log(`[FullyEnhancedConcurrentExecutor] 批量执行完成，成功: ${allResults.filter(r => r && r.success).length}/${allResults.length}`);
    return allResults;
  }

  /**
   * 执行单个任务的核心方法（重写以支持额外功能）
   * @param {Object} executionRequest - 执行请求
   * @param {string} taskId - 任务ID
   * @param {string} traceId - 追踪ID
   * @param {Object} executionInfo - 执行信息
   * @returns {Promise<Object>} 执行结果
   */
  async _executeSingleTask(executionRequest, taskId, traceId, executionInfo) {
    const { modelId, task, estimatedCost } = executionRequest;
    const startTime = Date.now();

    try {
      // 获取速率限制许可（记录等待时间）
      const rateLimitStart = Date.now();
      await this.rateLimiter.acquireWithCoordination(modelId);
      executionInfo.rate_limit_wait_time = Date.now() - rateLimitStart;

      // 实际执行请求（带重试）
      const result = await this.taskScheduler.scheduleTaskWithLoadAwarenessAndAlternatives(
        modelId,
        executionRequest.alternatives || [],
        async (actualModelId) => {
          // 实际执行请求 - 使用从 executeOnModel 传递的正确模型 ID
          return await this._executeRequestWithRetryTracking(actualModelId, task, taskId, traceId, executionInfo);
        },
        {
          loadInfo: executionRequest.loadInfo,
          alternatives: this._prepareAlternatives(executionRequest.alternatives || [], executionRequest.loadInfo),
          fallbackStrategy: 'none', // 已经在上级处理了降级
          timeoutMs: this.retryManager.getConfig().timeout,
          taskType: task.type
        }
      );

      // 记录性能历史
      if (this.performanceHistory) {
        const duration = Date.now() - startTime;
        this.performanceHistory.recordExecution(modelId, task.type || 'general', {
          duration,
          success: result.success,
          cost: result.cost?.total || 0,
          tokensUsed: (result.usage?.input || 0) + (result.usage?.output || 0)
        });
      }

      return result;
    } catch (error) {
      // 记录执行失败到性能历史
      if (this.performanceHistory) {
        const duration = Date.now() - startTime;
        this.performanceHistory.recordExecution(modelId, task.type || 'general', {
          duration,
          success: false,
          cost: 0,
          tokensUsed: 0
        });
      }

      throw error;
    }
  }

  /**
   * Delegate all other method calls to the underlying ConcurrentExecutor
   */
  async initialize() {
    return await this.concurrentExecutor.initialize();
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

module.exports = FullyEnhancedConcurrentExecutor;