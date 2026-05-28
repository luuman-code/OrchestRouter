#!/usr/bin/env node

/**
 * 编排器与并发执行器集成模块
 *
 * 将任务分解、模型选择和并发执行整合为一个完整的流程
 * 实现从子任务到模型执行的端到端编排
 */

const { ConcurrentExecutor, TracedExecutor } = require('../executor/ConcurrentExecutor');
const FullyEnhancedConcurrentExecutor = require('../executor/core/FullyEnhancedConcurrentExecutor');
const { ExecutorFactory } = require('../executor/config');
const { ProgressTracker } = require('./utils/ProgressTracker');
const { MetricsCollector } = require('../metrics/MetricsCollector');

class OrchestratorExecutorIntegration {
  constructor(options = {}) {
    this.options = options;
    this.debug = options.debug || false;
    this.executor = null;
    this.modelRegistry = options.modelRegistry || null;
    // 从 modelSelector 提取 statusMonitor（如果提供）
    this.statusMonitor = options.modelSelector?.statusMonitor || null;

    // Flow monitor for SSE events
    this.flowMonitor = options.flowMonitor || null;
    this.orchestrationId = options.orchestrationId || null;

    // 从统一配置读取执行器配置
    this.executorConfig = options.executor || {};
    this.extensionsConfig = options.extensions || {};

    // 流式配置
    this.streamingConfig = options.streaming || {};

    // Debug: 详细输出 options 内容
    this._log(`OrchestratorExecutorIntegration 构造函数参数: ${JSON.stringify(Object.keys(options))}`);

    this.metricsCollector = options.metricsCollector || null;

    // 模型状态广播器
    this.modelStatusBroadcaster = options.modelStatusBroadcaster || null;
    this.availableModels = [];

    // 注册到广播器
    if (this.modelStatusBroadcaster) {
      this.modelStatusBroadcaster.register('OrchestratorExecutorIntegration', (statusMap) => {
        this.updateModelStatus(statusMap);
      });
    }

    // Debug: 检查 metricsCollector 是否被传递
    this._log(`编排器执行器集成模块初始化完成 - metricsCollector: ${!!this.metricsCollector}, statusMonitor: ${!!this.statusMonitor}`);

    // Initialize progress tracking
    this.progressTracker = options.progressTracker || new ProgressTracker();
    this.trackProgress = options.trackProgress !== false; // Enable by default
  }

  /**
   * 更新模型状态（接收广播的状态更新）
   */
  updateModelStatus(statusMap) {
    if (!statusMap) {
      this.availableModels = [];
      return;
    }
    const available = Object.entries(statusMap)
      .filter(([modelId, status]) => status.available)
      .map(([modelId]) => modelId);
    this.availableModels = available;
    console.log(`[OrchestratorExecutorIntegration] 可用模型已更新: ${available.length} 个`);
  }

  /**
   * 日志方法
   */
  _log(message, level = 'info') {
    if (level === 'debug' && !this.debug) return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [OrchestratorExecutor] [${level}] ${message}`);
  }

  /**
   * Resolve model ID with proper fallback mechanism
   */
  _resolveModelId(subtask) {
    if (subtask.selected_model) {
      return subtask.selected_model;
    }

    // Log warning for missing model
    this._log(`警告：子任务 ${subtask.id} 未指定模型，使用配置默认值`, 'warn');

    // Return default model from configuration
    return this._getDefaultModel();
  }

  /**
   * Get default model from configuration or environment
   */
  _getDefaultModel() {
    // Check environment variable first
    const envDefaultModel = process.env.DEFAULT_MODEL;
    if (envDefaultModel) {
      return envDefaultModel;
    }

    // Check model registry for a suitable default
    if (this.modelRegistry && Array.isArray(this.modelRegistry.models)) {
      // Try to find a reasonable default model
      const defaultModel = this.modelRegistry.models.find(model =>
        model.id.includes('gpt') || model.id.includes('qwen') || model.id.includes('MiniMax')
      );
      if (defaultModel) {
        return defaultModel.id;
      }

      // If no preferred model found, return the first available
      if (this.modelRegistry.models.length > 0) {
        return this.modelRegistry.models[0].id;
      }
    }

    // Fallback to a standard model
    return 'MiniMax-M2.5';
  }

  /**
   * 【新增】根据模型负载均衡执行请求
   * 确保没有模型被分配超过其最大并发数的任务
   * 【修复】即使所有模型状态为不可用，也强制分散任务以避免槽位竞争
   * 【改进】负载均衡时使用 alternatives 列表选择最适合任务的模型，而非简单轮询
   * @param {Array} executionRequests - 执行请求数组
   * @returns {Array} 均衡后的执行请求数组
   */
  _balanceModelDistribution(executionRequests) {
    this._log('开始模型负载均衡...');

    // 【新增】不适合编程的模型列表（对话模型、角色扮演模型等）
    const excludeFromBalancing = ['MiniMax M2-her', 'M2-her', 'MiniMax-M2-her'];

    // 1. 统计每个模型的任务数量
    const modelTaskCounts = new Map();
    const modelMaxConcurrency = new Map();

    for (const request of executionRequests) {
      const modelId = request.modelId;
      modelTaskCounts.set(modelId, (modelTaskCounts.get(modelId) || 0) + 1);

      // 获取模型的最大并发数
      if (!modelMaxConcurrency.has(modelId) && this.modelRegistry) {
        const model = this.modelRegistry.getModel ? this.modelRegistry.getModel(modelId) : null;
        if (model) {
          modelMaxConcurrency.set(modelId, model.maxConcurrency || 50);
        } else {
          modelMaxConcurrency.set(modelId, 50); // 默认值
        }
      } else if (!modelMaxConcurrency.has(modelId)) {
        modelMaxConcurrency.set(modelId, 50);
      }
    }

    // 2. 找出需要重新分配的模型（检查是否超过最大并发数）
    const overloadedModels = [];
    for (const [modelId, count] of modelTaskCounts) {
      const maxCon = modelMaxConcurrency.get(modelId) || 10;
      if (count > maxCon) {
        overloadedModels.push({ modelId, count, maxCon, excess: count - maxCon });
        this._log(`模型 ${modelId} 任务数 ${count} 超过最大并发数 ${maxCon}，需要重新分配`, 'warn');
      }
    }

    // 【修复】即使没有模型超过并发限制，如果只有1-2个模型承载所有任务，也需要分散
    const uniqueModels = Array.from(modelTaskCounts.keys());
    const needsDistribution = overloadedModels.length > 0 ||
      (uniqueModels.length <= 3 && executionRequests.length > uniqueModels.length * 2);

    if (!needsDistribution && uniqueModels.length >= 3) {
      this._log(`模型负载均衡完成，分布良好: ${uniqueModels.length} 个模型`);
      return executionRequests;
    }

    // 3. 获取所有可用模型（用于重新分配）
    const availableModels = [];

    // 首先尝试从 statusMonitor 获取可用模型
    if (this.statusMonitor && typeof this.statusMonitor.getAvailableModels === 'function') {
      const monitorAvailable = this.statusMonitor.getAvailableModels();
      if (monitorAvailable && monitorAvailable.length > 0) {
        availableModels.push(...monitorAvailable);
      }
    }

    // 如果没有可用模型记录，使用配置中的模型列表
    if (availableModels.length === 0) {
      availableModels.push(
        'MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed',
        'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed',
        'MiniMax-M2', 'deepseek-chat', 'deepseek-reasoner'
      );
      this._log('警告：statusMonitor无可用模型列表，使用配置中的默认模型', 'warn');
    }

    // 【新增】过滤掉不适合编程的模型
    const filteredAvailableModels = availableModels.filter(m => !excludeFromBalancing.includes(m));

    // 确保至少有几个模型可用
    if (filteredAvailableModels.length < 3) {
      filteredAvailableModels.push('MiniMax-M2.5', 'deepseek-chat');
    }

    // 4. 重新分配任务 - 【改进】优先使用 alternatives 列表按评分选择最适合的模型
    const balancedRequests = [...executionRequests];
    let reassignedCount = 0;

    /**
     * 【新增】从任务的 alternatives 列表中选择最适合的模型
     * 按评分排序，选择任务适配度最高的模型
     * @param {Object} task - 任务对象
     * @param {string} originalModel - 原始模型ID
     * @param {Array} currentCounts - 当前各模型任务数
     * @returns {string|null} 最佳备选模型ID
     */
    const selectBestAlternative = (task, originalModel, currentCounts) => {
      const alternatives = task.alternatives || [];

      // 按 score 降序排序（分数越高越适合）
      const sortedAlternatives = [...alternatives]
        .filter(alt => {
          // 排除原始模型
          const altModelId = alt.modelId || alt;
          if (altModelId === originalModel) return false;
          // 排除不适合编程的模型
          if (excludeFromBalancing.includes(altModelId)) return false;
          return true;
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      // 选择评分最高且负载未满的模型
      for (const alt of sortedAlternatives) {
        const altModelId = alt.modelId || alt;
        const altTaskCount = currentCounts.get(altModelId) || 0;
        const altMaxCon = modelMaxConcurrency.get(altModelId) || 10;

        if (altTaskCount < altMaxCon) {
          return altModelId;
        }
      }

      // 如果 alternatives 没有合适的，使用 filteredAvailableModels 列表
      return null;
    };

    if (overloadedModels.length > 0) {
      // 重新分配超过并发限制的任务
      for (const overloaded of overloadedModels) {
        const { modelId, excess } = overloaded;
        let reassigned = 0;

        // 找到该模型的所有任务，保留 maxCon 个，其余重新分配
        let modelTaskIndices = [];
        for (let i = 0; i < balancedRequests.length; i++) {
          if (balancedRequests[i].modelId === modelId) {
            modelTaskIndices.push(i);
          }
        }

        // 重新分配多余的任务
        for (let i = 0; i < modelTaskIndices.length && reassigned < excess; i++) {
          const taskIndex = modelTaskIndices[i];
          const originalModel = balancedRequests[taskIndex].modelId;

          // 【改进】优先使用 alternatives 列表选择最佳模型
          let selectedAltModel = selectBestAlternative(
            balancedRequests[taskIndex],
            originalModel,
            modelTaskCounts
          );

          // 如果 alternatives 没有合适的选择，使用 availableModels 列表
          if (!selectedAltModel) {
            for (const altModel of filteredAvailableModels) {
              if (altModel === originalModel) continue;

              const altTaskCount = modelTaskCounts.get(altModel) || 0;
              const altMaxCon = modelMaxConcurrency.get(altModel) || 10;

              if (altTaskCount < altMaxCon) {
                selectedAltModel = altModel;
                break;
              }
            }
          }

          if (selectedAltModel) {
            this._log(`重新分配任务 ${taskIndex}: ${originalModel} -> ${selectedAltModel}`, 'info');
            balancedRequests[taskIndex] = {
              ...balancedRequests[taskIndex],
              modelId: selectedAltModel,
              alternatives: balancedRequests[taskIndex].alternatives?.length > 0
                ? balancedRequests[taskIndex].alternatives
                : filteredAvailableModels.filter(m => m !== selectedAltModel)
            };
            modelTaskCounts.set(selectedAltModel, modelTaskCounts.get(selectedAltModel) + 1);
            modelTaskCounts.set(originalModel, modelTaskCounts.get(originalModel) - 1);
            reassignedCount++;
            reassigned++;
          }
        }
      }
    } else if (uniqueModels.length <= 2 && executionRequests.length > 5) {
      // 如果没有模型超过限制但只有1-2个模型承载所有任务，强制分散
      this._log(`只有 ${uniqueModels.length} 个模型承载 ${executionRequests.length} 个任务，强制分散...`, 'warn');

      let modelIndex = 0;
      for (let i = 0; i < balancedRequests.length; i++) {
        const currentModel = balancedRequests[i].modelId;
        const currentCount = modelTaskCounts.get(currentModel) || 0;

        // 如果当前模型任务过多，分配一些到其他模型
        if (currentCount > Math.ceil(executionRequests.length / filteredAvailableModels.length)) {
          // 【改进】优先使用 alternatives 列表选择最佳模型
          let selectedAltModel = selectBestAlternative(
            balancedRequests[i],
            currentModel,
            modelTaskCounts
          );

          // 如果 alternatives 没有合适的选择，使用 availableModels 列表
          if (!selectedAltModel) {
            selectedAltModel = filteredAvailableModels[modelIndex % filteredAvailableModels.length];
          }

          if (selectedAltModel && selectedAltModel !== currentModel) {
            this._log(`分散任务 ${i}: ${currentModel} -> ${selectedAltModel}`, 'info');
            balancedRequests[i] = {
              ...balancedRequests[i],
              modelId: selectedAltModel,
              alternatives: balancedRequests[i].alternatives?.length > 0
                ? balancedRequests[i].alternatives
                : filteredAvailableModels.filter(m => m !== selectedAltModel)
            };
            modelTaskCounts.set(currentModel, currentCount - 1);
            modelTaskCounts.set(selectedAltModel, (modelTaskCounts.get(selectedAltModel) || 0) + 1);
            reassignedCount++;
          }
          modelIndex++;
        }
      }
    }

    // 5. 记录均衡结果
    const newModelDistribution = new Map();
    for (const request of balancedRequests) {
      newModelDistribution.set(
        request.modelId,
        (newModelDistribution.get(request.modelId) || 0) + 1
      );
    }

    this._log(`模型负载均衡完成，重新分配了 ${reassignedCount} 个任务`);
    this._log(`新模型分布: ${JSON.stringify(Object.fromEntries(newModelDistribution))}`);

    return balancedRequests;
  }

  /**
   * 初始化执行器
   */
  async initializeExecutor(configPath = null) {
    this._log('初始化并发执行器...');

    try {
      if (configPath) {
        // 使用配置工厂创建执行器
        this.executor = await ExecutorFactory.createExecutor(configPath, {
          modelRegistry: this.modelRegistry
        });
      } else {
        // 从统一配置读取执行器配置（优先使用配置文件的值，否则使用默认值）
        const retryConfig = this.executorConfig.retry || {};
        const rateLimitConfig = this.executorConfig.rate_limit || {};
        const circuitBreakerConfig = this.executorConfig.circuit_breaker || {};
        const timeoutConfig = {
          apiCallTimeout: this.executorConfig.general?.default_timeout || 180000,
          slotAcquisitionTimeout: 60000,
          defaultTimeout: this.executorConfig.general?.default_timeout || 180000
        };

        const defaultConfig = {
          retryConfig: {
            maxRetries: retryConfig.max_retries ?? 3,
            baseDelay: retryConfig.base_delay ?? 1000,
            exponentialBase: retryConfig.exponential_base ?? 2.0,
            jitter: retryConfig.jitter ?? true
          },
          rateLimitConfig: {
            defaultRps: rateLimitConfig.default_rps ?? 10,
            burstCapacity: rateLimitConfig.burst_capacity ?? 30
          },
          // 熔断器配置：从 config.json 读取
          circuitBreakerConfig: {
            failureThreshold: circuitBreakerConfig.failureThreshold ?? 20,
            timeout: circuitBreakerConfig.timeout ?? 60000,
            resetTimeout: circuitBreakerConfig.resetTimeout ?? 30000,
            successThreshold: circuitBreakerConfig.successThreshold ?? 1,
            halfOpenInterval: circuitBreakerConfig.halfOpenInterval ?? 1000
          },
          // 超时配置：API 调用超时 180 秒，槽位获取超时 60 秒
          timeoutConfig: timeoutConfig,
          modelRegistry: this.modelRegistry,
          // 【修复】添加 fallback 配置映射，确保备选模型重试机制正常工作
          fallback: this.executorConfig.fallback_strategy || {
            enabled: true,  // 启用 fallback 功能
            strategy: {
              timeout: { enabled: true, maxAttempts: 3, timeoutPerAttempt: 30000 },
              budget: { enabled: true, maxCostReduction: 0.5 },
              availability: { enabled: true, retryOnUnavailability: true, maxFallbackModels: 3 }
            }
          }
        };

        // 使用 FullyEnhancedConcurrentExecutor 以获得所有功能
        // 将超时配置传递给请求器
        const executorConfig = {
          ...defaultConfig,
          enableDetailedLogging: true,  // 启用详细API日志记录
          debugMode: process.env.DEBUG_MODE === 'true',
          requestConfig: {
            timeout: defaultConfig.timeoutConfig?.apiCallTimeout || 180000,
            maxSockets: 100,
            keepAliveTimeout: 60000,
            enableDetailedLogging: true  // 在请求器级别也启用详细日志
          },
          // 流式配置
          streamingConfig: this.streamingConfig,
          flowMonitor: this.flowMonitor
        };
        this.executor = new FullyEnhancedConcurrentExecutor(executorConfig);
      }

      this._log('并发执行器初始化完成');
      return this.executor;
    } catch (error) {
      this._log(`执行器初始化失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 执行子任务列表（支持并发执行）
   */
  async executeSubtasks(subtasksWithModels, orchestrationId = null) {
    if (!this.executor) {
      await this.initializeExecutor();
    }

    // Use provided orchestrationId or fall back to instance-level one
    const orchId = orchestrationId || this.orchestrationId;

    // 为每个子任务附加 sessionId（如果尚未设置）
    subtasksWithModels = subtasksWithModels.map((subtask, index) => {
      if (!subtask.sessionId) {
        return {
          ...subtask,
          sessionId: orchId || `session_${Date.now()}_${index}`
        };
      }
      return subtask;
    });

    this._log(`开始执行 ${subtasksWithModels.length} 个子任务`);
    this._log(`[executeSubtasks] 子任务 1 sessionId: ${subtasksWithModels[0]?.sessionId || 'undefined'}`, 'debug');

    // Generate a unique task ID for progress tracking
    const taskId = `execute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start progress tracking if enabled
    if (this.trackProgress) {
      this.progressTracker.startTask(taskId, {
        initialStage: 'preparing',
        stages: [
          { name: 'preparing', weight: 10, description: '准备执行请求' },
          { name: 'executing', weight: 70, description: '执行子任务' },
          { name: 'integrating', weight: 15, description: '整合结果' },
          { name: 'completing', weight: 5, description: '完成' }
        ]
      });

      // Update preparation progress
      this.progressTracker.updateProgress(taskId, {
        stage: 'preparing',
        progress: 25,
        status: 'running',
        details: { message: `准备执行 ${subtasksWithModels.length} 个子任务`, totalTasks: subtasksWithModels.length }
      });
    }

    // 发射批次开始事件
    if (this.flowMonitor && orchId) {
      this.flowMonitor.emitPhaseEvent(orchId, 'execution', 'batch_start', 'running', {
        subtaskCount: subtasksWithModels.length
      });
    }

    // 准备执行请求
    // 支持两种格式：selection_metadata.alternatives 或顶层 alternatives
    const executionRequests = subtasksWithModels.map((subtask, index) => {
      const alternatives = subtask.selection_metadata?.alternatives || subtask.alternatives || [];
      return {
        task: subtask,
        modelId: this._resolveModelId(subtask),
        prompt: subtask.prompt || subtask.description || subtask.task || subtask.content,
        traceId: `exec_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        taskId: subtask.id || `subtask_${index}`,
        estimatedCost: subtask.estimated_cost,
        alternatives: alternatives,
        // 【修复】不要在有 alternatives 时自动启用 fallback，fallback 应该在明确需要时使用
        useFallback: subtask.useFallback === true
      };
    });

    // 调试：显示完整 prompt 信息（包括 systemPrompt 和 prompt）
    this._log(`===== 发送给模型的完整 prompt 信息 =====`);
    this._log(`准备了 ${executionRequests.length} 个执行请求`);

    // 显示第一个请求的详细信息
    if (executionRequests.length > 0) {
      const firstReq = executionRequests[0];
      const systemPrompt = firstReq.task?.systemPrompt || '';
      const userPrompt = firstReq.prompt || '';
      const taskId = firstReq.taskId || 'unknown';
      const modelId = firstReq.modelId || 'unknown';

      this._log(`--- 任务 #1 (${taskId}) ---`);
      this._log(`模型: ${modelId}`);

      // 显示 systemPrompt
      if (systemPrompt) {
        this._log(`[SYSTEM PROMPT] (${systemPrompt.length} 字符):`);
        this._log('='.repeat(60));
        this._log(systemPrompt);
        this._log('='.repeat(60));
      } else {
        this._log(`[SYSTEM PROMPT]: (空)`);
      }

      // 显示 user prompt
      if (userPrompt) {
        this._log(`[USER PROMPT] (${userPrompt.length} 字符):`);
        this._log('='.repeat(60));
        this._log(userPrompt);
        this._log('='.repeat(60));
      } else {
        this._log(`[USER PROMPT]: (空)`);
      }

      // 检查约束是否包含在 systemPrompt 中
      const hasImportConstraint = systemPrompt.includes('IMPORT RULES') ||
                                  systemPrompt.includes('MANDATORY RULES');
      const hasSharedContext = systemPrompt.includes('SHARED CONTEXT');
      this._log(`[约束检查] 含 IMPORT/MANDATORY RULES: ${hasImportConstraint}, 含 SHARED CONTEXT: ${hasSharedContext}`);
    }
    this._log(`=========================================`);

    // 【新增】在执行前进行模型负载均衡
    const balancedRequests = this._balanceModelDistribution(executionRequests);

    if (this.trackProgress) {
      this.progressTracker.updateProgress(taskId, {
        stage: 'preparing',
        progress: 50,
        status: 'running',
        details: { message: '执行请求准备完成', preparedTasks: executionRequests.length }
      });
    }

    try {
      if (this.trackProgress) {
        this.progressTracker.updateProgress(taskId, {
          stage: 'executing',
          progress: 60,
          status: 'running',
          details: { message: '开始批量执行子任务', totalTasks: executionRequests.length }
        });
      }

      // 批量执行任务
      const startTime = Date.now();
      const results = await this.executor.executeBatch(balancedRequests);
      const executionDuration = Date.now() - startTime;

      this._log(`完成 ${results.length} 个子任务的执行，耗时 ${executionDuration}ms`);

      // 发射批次完成事件
      if (this.flowMonitor && orchId) {
        this.flowMonitor.emitPhaseEvent(orchId, 'execution', 'batch_complete', 'completed', {
          totalCompleted: results.length,
          duration: executionDuration
        });
      }

      if (this.trackProgress) {
        this.progressTracker.updateProgress(taskId, {
          stage: 'executing',
          progress: 85,
          status: 'running',
          details: { message: `完成 ${results.length} 个子任务的执行`, completedTasks: results.length }
        });
      }

      // 整合结果并记录指标
      const executionResults = results.map((result, index) => {
        // 发射子任务完成事件
        if (this.flowMonitor && orchId) {
          this.flowMonitor.emitPhaseEvent(orchId, 'execution', 'subtask_complete', 'running', {
            subtaskIndex: index,
            subtaskId: result.task_id || originalSubtask?.id || `subtask_${index}`,
            success: result.success,
            duration_ms: result.duration_ms
          });
        }

        const originalSubtask = subtasksWithModels[index];

        // 并发执行时，整体时间消耗取决于最慢的任务
        // 使用所有任务中的最大执行时间作为整体时间消耗
        const maxTaskTime = results.length > 0 ? Math.max(...results.map(r => r.duration_ms || 0)) : 0;

        // 如果有CostTracker和指标收集器，记录指标
        const costTracker = balancedRequests[index]?.task?.costTracker ||
                          balancedRequests[index]?.task?.cost_tracker ||
                          this.options?.costTracker;

        // 调试日志：检查 metricsCollector 是否存在
        if (!this.metricsCollector) {
          this._log('警告：metricsCollector 未初始化，无法记录指标', 'warn');
        } else if (!result.success) {
          this._log(`任务 ${result.task_id} 执行失败，不记录指标`, 'debug');
        } else if (!result.usage) {
          this._log(`任务 ${result.task_id} 没有 usage 数据，使用默认值记录指标`, 'debug');
        }

        if (this.metricsCollector && result.success) {
          // 从结果中提取必要的信息
          const modelId = result.model_used || balancedRequests[index].modelId;
          const sessionId = originalSubtask.sessionId || 'unknown-session';
          const taskIdentifier = balancedRequests[index].taskId || `task_${index}`;

          this._log(`[recordTask] originalSubtask.sessionId: ${originalSubtask.sessionId || 'undefined'}, 使用：${sessionId}`, 'debug');

          // 【调试】打印 result 中的完整数据
          this._log(`[DEBUG-recordTask] result.task_id=${result.task_id}, result.success=${result.success}, result.model_used=${result.model_used}`, 'debug');
          this._log(`[DEBUG-recordTask] result.usage=${JSON.stringify(result.usage)}, result.cost=${JSON.stringify(result.cost)}`, 'debug');
          this._log(`[DEBUG-recordTask] balancedRequests[${index}].modelId=${balancedRequests[index].modelId}`, 'debug');

          // 如果有 usage 数据，则使用它；否则创建一个基本的使用数据结构
          let tokenUsage = result.usage || {
            input: 0,
            output: 0,
            total: 0,
            provider: 'unknown',
            details: {}
          };

          this._log(`[DEBUG-recordTask] 最终 tokenUsage=${JSON.stringify(tokenUsage)}`, 'debug');

          // 计算成本，如果有则使用，否则基于 token 使用情况估算
          let costValue = result.cost?.total || 0;

          this._log(`[DEBUG-recordTask] 初始 costValue=${costValue}`, 'debug');

          // 如果没有成本数据，但有 token 使用数据，可以简单估算
          if (costValue === 0 && (tokenUsage.input > 0 || tokenUsage.output > 0)) {
            // 简单估算：假设每 1000 tokens 成本 $0.001
            const estimatedCost = ((tokenUsage.input + tokenUsage.output) / 1000) * 0.001;
            costValue = estimatedCost;
            this._log(`[DEBUG-recordTask] 基于 token 估算 costValue=${costValue}`, 'debug');
          }

          // 调用CostTracker的parseAndUpdateCost方法，这会自动记录到MetricsCollector
          // 在 additionalInfo 中包含 sessionId 以便在任务记录中保留会话信息
          try {
            this._log(`[DEBUG-recordTask] 调用 metricsCollector.recordTask, sessionId=${sessionId}, taskIdentifier=${taskIdentifier}, modelId=${modelId}, tokenUsage=${JSON.stringify(tokenUsage)}, costValue=${costValue}`, 'debug');
            this.metricsCollector.recordTask(
              sessionId,
              taskIdentifier,  // 使用特定任务ID而不是全局ID
              modelId,
              tokenUsage,
              result.duration_ms || maxTaskTime,  // 使用每个任务自己的执行时间
              {
                cost: costValue,
                sessionId: sessionId  // 在任务记录中保留会话ID信息
              }
            );
            this._log(`[DEBUG-recordTask] metricsCollector.recordTask 调用完成`, 'debug');
          } catch (err) {
            console.warn('[OrchestratorExecutorIntegration] Error recording metrics:', err.message);
          }
        }

        return {
          ...result,
          original_subtask_id: originalSubtask.id,
          original_description: originalSubtask.description,
          model_used: result.model_used || balancedRequests[index].modelId,
          execution_order: index,
          execution_time_ms: result.duration_ms || maxTaskTime
        };
      });

      // 记录执行反馈到状态监控器
      for (const execResult of executionResults) {
        const modelId = execResult.model_used;
        const success = execResult.success;
        const latencyMs = execResult.duration_ms || 0;

        if (this.statusMonitor?.recordRequest) {
          this.statusMonitor.recordRequest(modelId, success, latencyMs);
        }
      }

      if (this.trackProgress) {
        this.progressTracker.updateProgress(taskId, {
          stage: 'integrating',
          progress: 95,
          status: 'running',
          details: { message: '整合执行结果', resultCount: executionResults.length }
        });
      }

      const finalResult = {
        success: true,
        execution_results: executionResults,
        total_executed: executionResults.length,
        successful_executions: executionResults.filter(r => r.success).length,
        failed_executions: executionResults.filter(r => !r.success).length,
        execution_summary: {
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          total_duration_ms: 0 // 这里可以根据实际执行时间来计算
        },
        progressTracking: {
          taskId: taskId,
          tracked: this.trackProgress
        }
      };

      if (this.trackProgress) {
        this.progressTracker.updateProgress(taskId, {
          stage: 'completing',
          progress: 100,
          status: 'completed',
          result: finalResult,
          details: { message: '子任务执行完成', summary: finalResult.execution_summary }
        });
      }

      return finalResult;
    } catch (error) {
      this._log(`执行子任务时出错: ${error.message}`, 'error');

      if (this.trackProgress) {
        this.progressTracker.failTask(taskId, error.message);
      }

      throw error;
    }
  }

  /**
   * 执行完整的编排流程（分解 + 选择 + 执行）
   */
  async executeFullOrchestration(decompositionResult) {
    this._log('开始完整编排流程执行');

    const { subtasks, modelSelections } = decompositionResult;

    if (!subtasks || subtasks.length === 0) {
      this._log('没有子任务需要执行', 'warn');
      return {
        success: true,
        message: '没有子任务需要执行',
        results: []
      };
    }

    // 将子任务与模型选择结果关联
    const subtasksWithModels = subtasks.map((subtask, index) => {
      const modelSelection = modelSelections ? modelSelections[index] : null;

      return {
        ...subtask,
        selected_model: subtask.selected_model || (modelSelection && modelSelection.selectedModel) || this._getDefaultModel(),
        estimated_cost: subtask.estimated_cost || (modelSelection && modelSelection.estimatedCost) || 0.03,
        selection_reason: subtask.selection_reason || (modelSelection && modelSelection.reason) || 'default_selection'
      };
    });

    this._log(`准备执行 ${subtasksWithModels.length} 个带模型选择的子任务`);

    // 执行子任务
    const executionResults = await this.executeSubtasks(subtasksWithModels);

    // 整合完整的编排结果
    const fullResult = {
      ...decompositionResult,
      execution_results: executionResults,
      orchestration_status: 'completed',
      completed_at: new Date().toISOString(),
      summary: {
        total_subtasks: subtasks.length,
        total_executions: executionResults.total_executed,
        successful_executions: executionResults.successful_executions,
        failed_executions: executionResults.failed_executions
      }
    };

    this._log(`完整编排流程完成，成功执行 ${executionResults.successful_executions}/${executionResults.total_executed} 个任务`);

    return fullResult;
  }

  /**
   * 执行单个子任务
   */
  async executeSingleSubtask(subtaskWithModel) {
    if (!this.executor) {
      await this.initializeExecutor();
    }

    this._log(`执行单个子任务: ${subtaskWithModel.description.substring(0, 50)}...`);

    const executionRequest = {
      task: subtaskWithModel,
      modelId: this._resolveModelId(subtaskWithModel),
      prompt: subtaskWithModel.prompt || subtaskWithModel.description || subtaskWithModel.task || subtaskWithModel.content,
      traceId: `single_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskId: subtaskWithModel.id || `single_task_${Date.now()}`,
      estimatedCost: subtaskWithModel.estimated_cost || 0.03,
      alternatives: subtaskWithModel.selection_metadata?.alternatives || []
    };

    try {
      const result = await this.executor.execute(executionRequest);

      this._log(`子任务执行完成: ${result.success ? '成功' : '失败'}`);

      return {
        ...result,
        original_subtask_id: subtaskWithModel.id,
        original_description: subtaskWithModel.description,
        execution_type: 'single_task_execution'
      };
    } catch (error) {
      this._log(`执行单个子任务失败: ${error.message}`, 'error');

      return {
        success: false,
        error: error.message,
        original_subtask_id: subtaskWithModel.id,
        original_description: subtaskWithModel.description,
        execution_type: 'single_task_execution',
        execution_error: true
      };
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.executor && typeof this.executor.cleanup === 'function') {
      await this.executor.cleanup();
      this._log('执行器资源已清理');
    }
  }
}

module.exports = OrchestratorExecutorIntegration;