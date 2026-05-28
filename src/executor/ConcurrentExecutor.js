/**
 * ConcurrentExecutor - 并发执行器主类（优化版）
 *
 * 高并发模型调用管理系统，接收来自 ModelSelector 的模型选择结果，
 * 同时向多个模型发起 API 请求执行子任务。
 *
 * 功能块：
 *   A: AsyncRequester - 异步请求与连接管理
 *   B: ConcurrencyController - 并发控制与调度层
 *   C: RetryManager - 重试与容错层（集成 CircuitBreaker 和 ErrorHandler）
 *   D: TokenUsageParser - Token 解析与成本反馈
 *   E: RateLimiter - 限流与速率控制层
 *   F: RequestTracer & PerformanceMonitor - 请求追踪与监控层
 *   G: CircuitBreaker - 熔断器（防止对持续失败服务的无效调用）
 *   H: ErrorHandler - 错误处理器（统一错误分类和处理策略）
 *
 * @class ConcurrentExecutor
 */
const path = require('path');
const SharedConcurrencyManager = require('./managers/SharedConcurrencyManager');
const ConcurrencyController = require('./core/ConcurrencyController');
const TaskScheduler = require('./core/TaskScheduler');
const AsyncRequester = require('./core/AsyncRequester');
const { RequestBuilder } = require('./core/RequestBuilder');
const RetryManager = require('./core/RetryManager');
const CircuitBreaker = require('./core/CircuitBreaker');
const ErrorHandler = require('./core/ErrorHandler');
const RateLimiter = require('./core/RateLimiter');
const TokenUsageParser = require('./utils/TokenUsageParser');
const { CostTracker } = require('./core/CostTracker');
const { BudgetMonitor } = require('./core/BudgetMonitor');
const { MarkdownCodeCleaner } = require('../integrator/utils/MarkdownCodeCleaner');
const { ResponseConverter } = require('./core/ResponseConverter');
const { CoordinatorRateLimiter } = require('./core/CoordinatorRateLimiter');
const { LimitConfigurationManager } = require('./core/LimitConfigurationManager');
// 协调功能增强组件
const { SystemCoordinator } = require('./core/SystemCoordinator');
// 功能块 F: 请求追踪与监控层
const RequestTracer = require('./core/RequestTracer');
const PerformanceMonitor = require('./core/PerformanceMonitor');
// 负载感知调度器
const LoadAwareScheduler = require('./core/LoadAwareScheduler');
// 性能历史记录器
const PerformanceHistory = require('./core/PerformanceHistory');

// 配置相关
const { ExecutorConfig } = require('./config/ExecutorConfig');
// 适配器加载器
const AdapterLoader = require('./core/AdapterLoader');

// Define ConcurrentExecutor with BaseExecutor functionality integrated
class ConcurrentExecutor {
  /**
   * 创建并发执行器
   * @param {Object} config - 配置选项
   * @param {Object} config.retryConfig - 重试配置
   * @param {Object} config.rateLimitConfig - 限流配置
   * @param {Object} config.requestConfig - 请求配置
   * @param {ModelRegistry} config.modelRegistry - 模型注册表
   * @param {CostController} config.costController - 成本控制器（用于与ModelSelector集成）
   * @param {ConcurrencyManager} config.concurrencyManager - 并发管理器（用于与ModelSelector集成）
   */
  constructor(config = {}) {
    // Initialize BaseExecutor functionality directly in the constructor
    this.options = config;
    this.initialized = false;
    this.name = config.name || this.constructor.name;

    // Execute configuration (BaseExecutor functionality)
    this.configObj = {
      ...config.config,
      enable_validation: config.enableValidation !== false,
      enable_batch_processing: config.enableBatchProcessing !== false,
      max_batch_size: config.maxBatchSize || 100
    };

    console.log('[ConcurrentExecutor] 初始化并发执行器...');

    // 修复：在构造函数开始时就设置 modelRegistry，确保所有内部组件都能正确获取
    this.modelRegistry = config.modelRegistry || null;

    // 流式配置
    this.streamingConfig = config.streamingConfig || {};
    this.flowMonitor = config.flowMonitor || null;

    // 如果有传入的共享组件，优先使用
    if (config.concurrencyManager) {
      this.sharedConcurrencyManager = config.concurrencyManager;
      // 立即设置 modelRegistry
      if (this.modelRegistry) {
        this.sharedConcurrencyManager.setModelRegistry(this.modelRegistry);
      }
    } else {
      // 否则获取共享并发管理器单例，并立即设置 modelRegistry
      this.sharedConcurrencyManager = SharedConcurrencyManager.getInstance(this.modelRegistry);
    }

    // 注入模型注册表到 sharedConcurrencyManager（如果之前没有设置）
    if (config.modelRegistry && this.sharedConcurrencyManager) {
      this.sharedConcurrencyManager.setModelRegistry(config.modelRegistry);
    }

    // 功能块 B: 并发控制与调度层
    this.concurrencyController = new ConcurrencyController(
      this.sharedConcurrencyManager,
      this.modelRegistry
    );

    // 【Bug修复】performanceHistory 必须在 taskScheduler 之前初始化
    // 原来 performanceHistory 在行 218 才被创建，但 taskScheduler 在行 108 就引用了它
    this.performanceHistory = new PerformanceHistory();

    this.taskScheduler = new TaskScheduler(this.concurrencyController, this.performanceHistory);

    // 功能块 A: 异步请求与连接管理
    // 如果启用了详细日志记录，则使用增强版请求器
    const useEnhancedRequester = config.enableDetailedLogging || process.env.DETAILED_API_LOGGING === 'true';
    const RequesterClass = useEnhancedRequester
      ? require('./core/EnhancedAsyncRequester')
      : require('./core/AsyncRequester');

    this.asyncRequester = new RequesterClass({
      ...config.requestConfig,
      enableDetailedLogging: useEnhancedRequester
    });
    // 修改：使用新的OpenAICompatibleRequestBuilder以支持正确的API端点
    const { OpenAICompatibleRequestBuilder } = require('./core/RequestBuilder');
    this.requestBuilder = new OpenAICompatibleRequestBuilder(
      null, // 会在执行时根据模型动态设置
      null, // 会在执行时根据模型动态设置
      config.providerEndpoints?.modelMappings || {}
    );

    // 初始化降级管理器
    // 【Bug修复】确保传入已初始化的变量：
    // - this.costController 未初始化，使用 this.costTracker（已初始化）
    // - this.statusMonitor 未初始化，使用 this.modelStatusMonitor（已初始化）
    // - this.modelSelector 未初始化，传入 null
    const { UnifiedFallbackManager } = require('./core/FallbackStrategies');
    this.fallbackManager = new UnifiedFallbackManager(
      this.modelSelector || null, // 模型选择器（未初始化，传入null）
      this.costController || this.costTracker || null, // 成本控制器
      this.concurrencyController, // 并发控制器
      this.statusMonitor || this.modelStatusMonitor || null // 状态监控器
    );

    // 设置主执行器到降级管理器
    this.fallbackManager.setMainExecutor(this);

    // 创建熔断器（单个实例，用于向后兼容）
    // 注意：现在 RetryManager 会为每个模型创建独立的熔断器
    const circuitBreaker = new CircuitBreaker(config.circuitBreakerConfig || {});

    // 功能块 C: 重试与容错层
    const retryConfig = {
      ...(config.retryConfig || {}),
      circuitBreaker: circuitBreaker,  // 向后兼容：作为默认熔断器
      circuitBreakerConfig: config.circuitBreakerConfig || {},  // 【新增】传递给 RetryManager 用于创建按模型的熔断器
      errorHandler: ErrorHandler
    };

    this.retryManager = new RetryManager(retryConfig);

    // 功能块 D: 成本跟踪与反馈层
    this.tokenUsageParser = new TokenUsageParser();

    // 【修复】从 ModelRegistry 加载 response_format 配置到 TokenUsageParser
    if (this.modelRegistry) {
      this.tokenUsageParser.setModelRegistry(this.modelRegistry);
    }

    // 如果有传入的成本控制器，使用它；否则创建新的
    if (config.costController) {
      this.costTracker = config.costController;
    } else {
      this.costTracker = new CostTracker(null, this.tokenUsageParser, this.modelRegistry);
    }

    this.budgetMonitor = new BudgetMonitor(this.costTracker);

    // 功能块 E: 限流与速率控制层（增强版 - 使用协调限流器）
    this.limitConfigManager = new LimitConfigurationManager({
      modelRegistry: this.modelRegistry
    });
    this.coordinatorRateLimiter = new CoordinatorRateLimiter(
      this.limitConfigManager,
      config.healthCheckInterval || 60000
    );

    // 如果有模型注册表，将其注入到限流配置管理器
    if (this.modelRegistry) {
      this.limitConfigManager.setModelRegistry(this.modelRegistry);
    }

    // 为了向后兼容，仍然保留原始限流器
    this.rateLimiter = new RateLimiter(config.rateLimitConfig || {
      defaultRps: 10,
      defaultBurst: 20
    });

    // 【新增 2026-03-28】模型状态监控器（用于与 ModelSelector 集成）
    this.modelStatusMonitor = config.statusMonitor || null;

    // 如果提供了状态监控器，则设置限流器引用以实现协调
    if (this.modelStatusMonitor && this.coordinatorRateLimiter) {
      this.modelStatusMonitor.setRateLimiter(this.coordinatorRateLimiter);
    }

    // 【新增 2026-03-29】系统协调器（用于系统级资源协调）
    // 优先使用传入的配置，其次使用ExecutorConfig中的配置
    const systemCoordinatorConfig = config.systemCoordinatorConfig ||
      (this.config ? this.config.getSystemCoordinatorConfig() : {});

    this.systemCoordinator = new SystemCoordinator(systemCoordinatorConfig);
    if (this.modelStatusMonitor) {
      this.modelStatusMonitor.setSystemCoordinator(this.systemCoordinator);
    }

    // 将相关的监控组件注册到系统协调器
    if (this.systemCoordinator && this.modelStatusMonitor) {
      this.systemCoordinator.registerMonitor('model-status-monitor', this.modelStatusMonitor);
    }

    // 功能块 F: 请求追踪与监控层
    this.requestTracer = new RequestTracer({
      ...(config.tracingConfig || {}),
      costController: this.costTracker // 关联成本控制器
    });
    this.performanceMonitor = new PerformanceMonitor(config.monitoringConfig || {});

    // 初始化配置
    if (config instanceof ExecutorConfig) {
      this.config = config;
    } else if (typeof config === 'object' && config.executor) {
      this.config = new ExecutorConfig(config.executor);
    } else if (typeof config === 'object') {
      // 提取executor相关配置
      const executorConfig = {
        general: {
          default_max_concurrency: config.defaultMaxConcurrency,
          default_timeout: config.defaultTimeout,
          enable_tracing: config.enableTracing,
          enable_monitoring: config.enableMonitoring,
          log_level: config.logLevel
        },
        concurrency: {
          max_concurrent: config.maxConcurrent,
          adaptive: config.adaptiveConcurrency,
          timeout_ms: config.timeoutMs,
          enable_priority_queue: config.enable_priority_queue // 从传入的config获取该配置项
        },
        retry: config.retryConfig,
        rate_limit: config.rateLimitConfig,
        cost_control: config.costControlConfig,
        tracing: config.tracingConfig,
        monitoring: config.monitoringConfig
      };

      this.config = new ExecutorConfig(executorConfig);
    } else {
      this.config = new ExecutorConfig({});
    }

    // 从配置中获取启用优先级队列的设置，默认为false
    this.enablePriorityQueue = this.config.getConcurrencyConfig().enable_priority_queue || false;

    // 初始化适配器加载器
    // 注意：__dirname 是 C:\Users\LWB\OrchestRouter\src\executor
    // 需要正确指向 C:\Users\LWB\OrchestRouter\config
    const configDir = path.join(__dirname, '../../config');
    this.adapterLoader = new AdapterLoader(configDir);
    this.adapterLoader.initialize();

    // 执行统计
    this.executionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      totalCost: 0,
      totalTokens: { input: 0, output: 0 }
    };

    console.log('[ConcurrentExecutor] 初始化完成');
  }

  // Implement the required methods from BaseExecutor interface
  async initialize() {
    console.log(`[${this.name}] 初始化...`);
    this.initialized = true;
    console.log(`[${this.name}] 初始化完成`);
  }

  /**
   * 执行单个任务
   * @param {Object} executionRequest - 执行请求对象
   * @returns {Promise<Object>} 执行结果
   */
  async execute(executionRequest) {
    // 适配现有的参数结构，兼容现有调用方式
    let selectionResult, task;
    if (arguments.length === 2) {
      // 旧的调用方式：execute(selectionResult, task)
      selectionResult = arguments[0];
      task = arguments[1];
    } else {
      // 新的调用方式：execute(executionRequest)
      // 检查是否传入的是 selectionResult 格式还是 executionRequest 格式
      if (executionRequest.modelId) {
        // executionRequest 格式：直接使用 modelId
        selectionResult = executionRequest;
        task = executionRequest.task || {};
      } else if (executionRequest.selected_model) {
        // selectionResult 格式：使用 selected_model
        selectionResult = executionRequest;
        task = executionRequest.task || {};
      } else {
        // 尝试解构
        ({ selectionResult, task } = executionRequest);
        if (!selectionResult && !task) {
          selectionResult = executionRequest;
          task = executionRequest.task || {};
        }
      }
    }

    // 兼容两种格式：selected_model (selectionResult 格式) 和 modelId (executionRequest 格式)
    const modelId = selectionResult.selected_model || selectionResult.modelId;
    const alternatives = selectionResult.alternatives || [];
    const loadInfo = selectionResult.load_info || selectionResult.loadInfo;
    const estimatedCost = selectionResult.estimated_cost || selectionResult.estimatedCost;
    // 修复：useFallback 也需要兼容两种格式
    const useFallback = selectionResult.useFallback !== undefined
      ? selectionResult.useFallback
      : selectionResult.use_fallback;

    // 如果降级管理器可用且配置了启用降级，使用降级执行
    // 修复：默认不启用降级，除非明确设置 useFallback 为 true
    if (this.fallbackManager && useFallback === true) {
      // 构建符合降级管理器要求的执行请求
      const fallbackRequest = {
        modelId: modelId,
        task: task,
        prompt: task.prompt || task.description || task.content,
        estimatedCost: estimatedCost,
        alternatives: alternatives,
        taskId: selectionResult.task_id || task.id || `task_${Date.now()}`,
        traceId: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      try {
        // 尝试使用降级管理器执行
        return await this.fallbackManager.executeRequestWithRetries(fallbackRequest);
      } catch (error) {
        console.log(`[ConcurrentExecutor] 降级执行失败: ${error.message}，使用标准执行`);
        // 如果降级执行失败，继续使用标准执行逻辑
      }
    }

    const taskId = selectionResult.task_id || task.id || `task_${Date.now()}`;

    // 记录开始时间用于各种等待时间测量
    const startTimestamp = Date.now();
    const executionInfo = {
      concurrency_wait_time: 0,
      rate_limit_wait_time: 0,
      retry_count: 0,
      retry_details: [],
      estimated_cost: estimatedCost || 0,
      actual_cost: 0,
      cost_variance: 0,
      execution_reasons: []
    };

    // 记录初始执行原因
    executionInfo.execution_reasons.push({
      phase: 'init',
      action: 'execution_started',
      reason: 'Task received from queue',
      timestamp: new Date()
    });

    console.log(`[ConcurrentExecutor] 开始执行任务 ${taskId}，模型：${modelId}`);

    this.executionStats.totalRequests++;

    // 1. 预分配成本
    if (estimatedCost && this.costTracker) {
      const allocationStartTime = Date.now();
      const allocationOk = await this.costTracker.preAllocate(taskId, estimatedCost, modelId);
      executionInfo.concurrency_wait_time = Date.now() - allocationStartTime; // 复用此字段记录成本预分配等待时间

      if (!allocationOk) {
        executionInfo.execution_reasons.push({
          phase: 'cost_allocation',
          action: 'allocation_failed',
          reason: 'Insufficient budget',
          timestamp: new Date()
        });

        return {
          task_id: taskId,
          success: false,
          error: 'Insufficient budget',
          model_used: modelId,
          duration_ms: Date.now() - startTimestamp,
          execution_info: executionInfo
        };
      }

      executionInfo.execution_reasons.push({
        phase: 'cost_allocation',
        action: 'allocation_success',
        reason: 'Cost allocated successfully',
        timestamp: new Date()
      });
    }

    // 【新增 2026-03-28】执行前检查模型状态（与 ModelSelector 集成）
    if (this.modelStatusMonitor) {
      const modelStatus = this.modelStatusMonitor.getModelStatus(modelId);
      if (!modelStatus.available) {
        console.log(`[ConcurrentExecutor] 模型 ${modelId} 不可用，状态：${modelStatus.reason}`);

        executionInfo.execution_reasons.push({
          phase: 'model_status_check',
          action: 'execution_blocked',
          reason: `Model ${modelId} is unavailable: ${modelStatus.reason}`,
          timestamp: new Date()
        });

        return {
          task_id: taskId,
          success: false,
          error: `Model ${modelId} is currently unavailable: ${modelStatus.reason}`,
          model_used: modelId,
          duration_ms: Date.now() - startTimestamp,
          execution_info: executionInfo
        };
      }

      executionInfo.execution_reasons.push({
        phase: 'model_status_check',
        action: 'status_checked',
        reason: `Model ${modelId} is available for execution`,
        timestamp: new Date()
      });
    }

    // 2. 开始追踪
    const traceId = await this.requestTracer.startTrace(task, modelId, estimatedCost);

    // 3. 准备请求 - 优化：使用 ModelRegistry 中的显式配置
    const requestConfig = this._buildRequestConfigFromModelRegistry(modelId, task);

    // 功能块 F: 记录并发水平
    this.performanceMonitor.incrementConcurrency();

    let result;
    let error = null;
    const startTime = Date.now();

    // 跟踪槽位是否已获取，用于在finally中正确释放
    // 注意：现在由 LoadAwareScheduler 统一管理槽位获取和释放，不再在这里获取
    let slotAcquired = false;

    try {
      // 4. 获取速率限制许可（记录等待时间）
      const rateLimitStart = Date.now();
      // 【修复】传入超时参数，使用请求超时时间或默认30秒
      const rateLimitTimeout = this.retryManager?.getConfig()?.timeout || 30000;
      await this.coordinatorRateLimiter.acquireWithCoordination(modelId, 1, 'user', rateLimitTimeout);
      executionInfo.rate_limit_wait_time = Date.now() - rateLimitStart;

      // 5. 实际执行请求（带重试）
      // 注意：槽位获取和释放现在由 LoadAwareScheduler.executeOnModel() 统一管理
      // 修复：移除了ConcurrentExecutor内部的槽位获取，避免双重获取导致的信号量泄漏
      const requestStartTime = Date.now();

      // 使用增强的负载感知调度，充分利用备选模型
      // LoadAwareScheduler.executeOnModel() 会自动处理槽位获取和释放
      result = await this.taskScheduler.scheduleTaskWithLoadAwarenessAndAlternatives(
        modelId,
        alternatives || [],
        async (actualModelId) => {
          // 实际执行请求 - 使用从 executeOnModel 传递的正确模型 ID
          return await this._executeRequestWithRetryTrackingOptimized(actualModelId, task, taskId, traceId, executionInfo);
        },
        {
          loadInfo,
          alternatives: this._prepareAlternatives(alternatives, loadInfo),
          fallbackStrategy: 'fallback',
          timeoutMs: this.retryManager.getConfig().timeout,
          taskType: task.type || 'general',
          historicalData: this.performanceHistory || {},
          slotAcquired: false // 告诉 scheduler 需要自己获取槽位
        }
      );

      // 检查是否是错误结果（而不是抛出异常）
      if (result && result.success === false) {
        const duration = Date.now() - startTime;
        this.executionStats.failedRequests++;

        console.error(`[ConcurrentExecutor] 任务 ${taskId} 执行失败：${result.error}`);

        // 记录失败的性能数据
        if (this.performanceHistory) {
          this.performanceHistory.recordExecution(modelId, task.type || 'general', {
            duration,
            success: false,
            cost: 0,
            tokensUsed: 0
          });
        }

        // 结束追踪
        await this.requestTracer.endTrace(traceId, 'failed', null, new Error(result.error));

        // 记录性能指标（失败）
        this.performanceMonitor.recordExecution(
          startTime,
          Date.now(),
          false,
          result.errorCode || 'UNKNOWN_ERROR',
          modelId,
          {
            tokens: null,
            cost: 0,
            concurrency: this.performanceMonitor.currentConcurrency
          }
        );

        // 返回错误结果
        return {
          task_id: taskId,
          success: false,
          error: result.error,
          errorCode: result.errorCode,
          content: null,
          // 【修复】使用实际执行的模型 ID（可能是备选模型）
          model_used: result.model_used || modelId,
          duration_ms: duration,
          retries: executionInfo.retry_count,
          execution_info: executionInfo,
          trace_id: traceId
        };
      }

      const duration = Date.now() - startTime;

      // 【调试】打印原始 result 对象中的 usage 和 cost
      console.log(`[ConcurrentExecutor] 原始 result.usage: ${JSON.stringify(result.usage)}, result.cost: ${JSON.stringify(result.cost)}`);

      // 更新统计
      this.executionStats.successfulRequests++;
      if (result.usage) {
        this.executionStats.totalTokens.input += result.usage.input || 0;
        this.executionStats.totalTokens.output += result.usage.output || 0;
      }

      // 更新实际成本
      if (result.cost && result.usage) {
        await this.costTracker.updateActualCost(taskId, result.cost.total, result.usage, modelId);
        this.executionStats.totalCost += result.cost.total || 0;
        executionInfo.actual_cost = result.cost.total;
        executionInfo.cost_variance = result.cost.total - (estimatedCost || 0);
      }

      // 【新增 2026-03-29】记录性能历史数据
      if (this.performanceHistory) {
        this.performanceHistory.recordExecution(modelId, task.type || 'general', {
          duration,
          success: true,
          cost: result.cost?.total || 0,
          tokensUsed: (result.usage?.input || 0) + (result.usage?.output || 0)
        });
      }

      console.log(`[ConcurrentExecutor] 任务 ${taskId} 执行完成，耗时：${duration}ms`);

      // 功能块 F: 结束请求追踪
      await this.requestTracer.endTrace(traceId, 'success', {
        cost: result.cost,
        duration_ms: duration,
        usage: result.usage,
        model_used: modelId
      });

      // 功能块 F: 记录性能指标
      this.performanceMonitor.recordExecution(
        startTime,
        Date.now(),
        true,
        null,
        modelId,
        {
          tokens: result.usage,
          cost: result.cost.total,
          concurrency: this.performanceMonitor.currentConcurrency
        }
      );

      // 【调试】打印返回结果中的 usage 和 cost
      console.log(`[ConcurrentExecutor] 返回结果: taskId=${taskId}, model_used=${result.model_used || modelId}, usage=${JSON.stringify(result.usage)}, cost=${JSON.stringify(result.cost)}`);

      return {
        task_id: taskId,
        success: true,
        content: result.content,
        // 【关键修复】传递 toolCalls 给整合器（当模型返回工具调用格式时）
        toolCalls: result.toolCalls || null,
        // 【修复】使用实际执行的模型 ID（可能是备选模型）
        model_used: result.model_used || modelId,
        duration_ms: duration,
        cost: result.cost,
        usage: result.usage,
        retries: executionInfo.retry_count,
        // 【新增】执行信息
        execution_info: executionInfo,
        // 功能块 F: 添加追踪信息
        trace_id: traceId
      };
    } catch (err) {
      error = err;
      const duration = Date.now() - startTime;
      this.executionStats.failedRequests++;

      console.error(`[ConcurrentExecutor] 任务 ${taskId} 执行失败：${error.message}`);

      // 【新增 2026-03-29】记录失败的性能历史数据
      if (this.performanceHistory) {
        const duration = Date.now() - startTime;
        this.performanceHistory.recordExecution(modelId, task.type || 'general', {
          duration,
          success: false,
          cost: 0, // 失败任务的成本为0或实际花费的成本
          tokensUsed: 0
        });
      }

      // 功能块 F: 记录错误追踪
      await this.requestTracer.endTrace(traceId, 'failed', null, error);

      // 功能块 F: 记录性能指标（失败）
      const errorType = this._classifyError(error);
      this.performanceMonitor.recordExecution(
        startTime,
        Date.now(),
        false,
        errorType,
        modelId,
        {
          concurrency: this.performanceMonitor.currentConcurrency
        }
      );

      // 功能块 F: 减少并发计数
      this.performanceMonitor.decrementConcurrency();

      // 处理执行失败的情况
      try {
        await this.costTracker.handleExecutionFailure(taskId, estimatedCost);
      } catch (costError) {
        console.error(`[ConcurrentExecutor] 成本跟踪清理失败：${costError.message}`);
      } finally {
        // 确保成本资源清理
        await this.costTracker.ensureCostCleanup(taskId);
      }

      // 如果有备选模型，尝试使用备选模型
      const alternatives = executionRequest.alternatives || [];
      if (alternatives.length > 0) {
        console.log(`[ConcurrentExecutor] 主模型 ${modelId} 执行失败，尝试备选模型`);
        return await this._executeWithFallback(
          modelId,
          executionRequest,
          taskId,
          traceId,
          executionInfo
        );
      }

      // 返回原始错误（如果没有备选模型）
      return {
        task_id: taskId,
        success: false,
        error: error.message,
        model_used: modelId,
        duration_ms: duration,
        retries: executionInfo.retry_count,
        execution_info: executionInfo,
        trace_id: traceId
      };
    } finally {
      // 注意：槽位获取和释放现在由 LoadAwareScheduler.executeOnModel() 统一管理
      // 这里不再需要手动释放槽位，避免双重释放导致的问题
      // decrementConcurrency 已在 try 块中调用
    }
  }

  /**
   * 使用 ModelRegistry 中的显式配置构建请求配置
   * @param {string} modelId - 模型 ID
   * @param {Object} task - 任务对象
   * @returns {Object} 请求配置对象
   * @private
   */
  _buildRequestConfigFromModelRegistry(modelId, task) {
    // 从模型注册表获取模型配置 - 优先使用显式配置
    const modelSpec = this.modelRegistry ? this.modelRegistry.getModel(modelId) : null;

    if (!modelSpec) {
      // 如果模型未在注册表中找到，回退到原有的关键字匹配方式
      console.warn(`[ConcurrentExecutor] 模型 ${modelId} 未在注册表中找到，使用回退机制`);
      // 即使 modelSpec 为空，也要传入 modelRegistry 以便 RequestBuilder 可以尝试其他获取方式
      const requestBuilder = new RequestBuilder({ modelRegistry: this.modelRegistry });
      return requestBuilder.buildRequest(modelId, task, { prompt: task.prompt || task.content });
    }

    // 从模型规格中获取 API 配置
    const apiBaseUrl = modelSpec.api_base_url || this._getDefaultBaseUrl(modelSpec.provider);
    const apiKey = modelSpec.api_key || process.env[modelSpec.api_key_env] || null;

    if (!apiKey) {
      return {
        success: false,
        error: `Missing API key for model ${modelId} from provider ${modelSpec.provider}`,
        errorCode: 'MISSING_API_KEY',
        content: null
      };
    }

    // 选择合适的请求构建器
    const provider = modelSpec.provider;
    const { OpenAICompatibleRequestBuilder } = require('./core/RequestBuilder');

    // 尝试从适配器加载器获取适配器配置
    // 传入 modelSpec 以支持 transformer（自定义配置）和 adapter 字段
    let adapterConfig = null;
    try {
      adapterConfig = this.adapterLoader.getAdapter(provider, modelSpec);
    } catch (e) {
      // 适配器加载失败，使用默认逻辑
    }

    // 根据适配器配置或提供商创建合适的请求构建器
    let requestBuilder;

    // 优先检查模型是否明确配置了 use_anthropic_format
    // 这确保模型的显式配置优先于 providerMapping
    if (modelSpec.use_anthropic_format === true) {
      console.log(`[_buildRequestConfigFromModelRegistry] 使用 Anthropic 格式: modelSpec.use_anthropic_format=true, modelId=${modelId}`);
      const AnthropicRequestBuilderFormat = require('./core/RequestBuilder').AnthropicRequestBuilder;
      const anthropicBuilderFormat = new AnthropicRequestBuilderFormat();
      const anthropicModelSpecFormat = {
        ...modelSpec,
        baseUrl: apiBaseUrl,
        api_key: apiKey
      };
      return anthropicBuilderFormat.build(task, anthropicModelSpecFormat, modelId);
    }

    // 如果有适配器配置，优先使用适配器配置
    if (adapterConfig && adapterConfig.request) {
      const requestFormat = adapterConfig.request.format;

      switch (requestFormat) {
        case 'anthropic':
          // Anthropic 格式 (包括 MiniMax)
          const AnthropicRequestBuilder = require('./core/RequestBuilder').AnthropicRequestBuilder;
          const anthropicBuilder = new AnthropicRequestBuilder();
          const anthropicModelSpec = {
            ...modelSpec,
            baseUrl: apiBaseUrl,
            api_key: apiKey
          };
          return anthropicBuilder.build(task, anthropicModelSpec, modelId);

        case 'gemini':
          // Gemini 格式
          const GeminiRequestBuilder = require('./core/RequestBuilder').GeminiRequestBuilder;
          const geminiBuilder = new (class {
            build(subtask, modelSpecInternal, modelIdInternal) {
              let contents = [];

              if (subtask.messages && Array.isArray(subtask.messages)) {
                contents = subtask.messages.map(msg => ({
                  role: msg.role === 'assistant' ? 'model' : msg.role,
                  parts: [{
                    text: msg.content
                  }]
                }));
              } else {
                const content = subtask.prompt || subtask.description || subtask.content || subtask.query;

                if (!content) {
                  throw new Error('No content provided in subtask');
                }

                contents = [{
                  role: 'user',
                  parts: [{
                    text: content
                  }]
                }];
              }

              const body = {
                contents: contents
              };

              const generationConfig = {};
              if (subtask.temperature !== undefined) generationConfig.temperature = subtask.temperature;
              if (subtask.maxTokens || subtask.max_tokens) generationConfig.maxOutputTokens = subtask.maxTokens || subtask.max_tokens;
              if (subtask.top_p !== undefined) generationConfig.topP = subtask.top_p;
              if (subtask.top_k !== undefined) generationConfig.topK = subtask.top_k;

              if (Object.keys(generationConfig).length > 0) {
                body.generationConfig = generationConfig;
              }

              if (subtask.safetySettings) {
                body.safetySettings = subtask.safetySettings;
              }

              const modelName = modelSpecInternal?.apiModelId || modelIdInternal.replace('gemini-', '');
              const url = `${apiBaseUrl}/models/${modelName}:generateContent?key=${apiKey}`;

              return {
                url,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body
              };
            }
          })();

          return geminiBuilder.build(task, modelSpec, modelId);

        case 'ollama':
          // Ollama 格式
          const OllamaRequestBuilder = require('./core/RequestBuilder').OllamaRequestBuilder;
          const ollamaBuilder = new (class {
            build(subtask, modelSpecInternal, modelIdInternal) {
              let messages = [];

              if (subtask.messages && Array.isArray(subtask.messages)) {
                messages = [...subtask.messages];
              } else {
                const content = subtask.prompt || subtask.description || subtask.content || subtask.query;

                if (!content) {
                  return {
                    success: false,
                    error: 'No content provided in subtask',
                    errorCode: 'NO_CONTENT',
                    content: null
                  };
                }

                messages = [{
                  role: 'user',
                  content: content
                }];
              }

              const body = {
                model: modelSpecInternal?.apiModelId || modelIdInternal.replace('ollama/', ''),
                messages: messages,
                options: {}
              };

              if (subtask.temperature !== undefined) body.options.temperature = subtask.temperature;
              if (subtask.maxTokens || subtask.max_tokens) body.options.num_predict = subtask.maxTokens || subtask.max_tokens;
              if (subtask.top_p !== undefined) body.options.top_p = subtask.top_p;
              if (subtask.top_k !== undefined) body.options.top_k = subtask.top_k;
              if (subtask.frequency_penalty !== undefined) body.options.frequency_penalty = subtask.frequency_penalty;
              if (subtask.presence_penalty !== undefined) body.options.presence_penalty = subtask.presence_penalty;

              if (subtask.seed !== undefined) body.options.seed = subtask.seed;
              if (subtask.num_ctx !== undefined) body.options.num_ctx = subtask.num_ctx;
              if (subtask.num_batch !== undefined) body.options.num_batch = subtask.num_batch;
              if (subtask.tfs_z !== undefined) body.options.tfs_z = subtask.tfs_z;
              if (subtask.typical_p !== undefined) body.options.typical_p = subtask.typical_p;
              if (subtask.repeat_last_n !== undefined) body.options.repeat_last_n = subtask.repeat_last_n;
              if (subtask.repeat_penalty !== undefined) body.options.repeat_penalty = subtask.repeat_penalty;
              if (subtask.penalty_threshold !== undefined) body.options.penalty_threshold = subtask.penalty_threshold;

              if (subtask.stream !== undefined) body.stream = subtask.stream;

              return {
                url: `${apiBaseUrl}/chat`,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body
              };
            }
          })();

          return ollamaBuilder.build(task, modelSpec, modelId);

        case 'openai':
        default:
          // OpenAI 兼容格式
          requestBuilder = new OpenAICompatibleRequestBuilder(apiBaseUrl, modelSpec.api_key_env, {});
          break;
      }
    } else {
      // 没有适配器配置，使用原有的 switch 逻辑作为后备
      switch (provider) {
        case 'openai':
          requestBuilder = new OpenAICompatibleRequestBuilder(apiBaseUrl, modelSpec.api_key_env, {});
          break;
        case 'anthropic':
          // Anthropic/MiniMax 需要特殊处理
          const AnthropicRequestBuilder2 = require('./core/RequestBuilder').AnthropicRequestBuilder;
          const anthropicBuilder2 = new AnthropicRequestBuilder2();
          const anthropicModelSpec2 = {
            ...modelSpec,
            baseUrl: apiBaseUrl,
            api_key: apiKey
          };
          return anthropicBuilder2.build(task, anthropicModelSpec2, modelId);

        case 'gemini':
          // Gemini 需要特殊处理
          const GeminiRequestBuilder2 = require('./core/RequestBuilder').GeminiRequestBuilder;
          const geminiBuilder2 = new (class {
            build(subtask, modelSpecInternal, modelIdInternal) {
              let contents = [];
              if (subtask.messages && Array.isArray(subtask.messages)) {
                contents = subtask.messages.map(msg => ({
                  role: msg.role === 'assistant' ? 'model' : msg.role,
                  parts: [{ text: msg.content }]
                }));
              } else {
                const content = subtask.prompt || subtask.description || subtask.content || subtask.query;
                if (!content) throw new Error('No content provided in subtask');
                contents = [{ role: 'user', parts: [{ text: content }] }];
              }
              const body = { contents };
              const generationConfig = {};
              if (subtask.temperature !== undefined) generationConfig.temperature = subtask.temperature;
              if (subtask.maxTokens || subtask.max_tokens) generationConfig.maxOutputTokens = subtask.maxTokens || subtask.max_tokens;
              if (subtask.top_p !== undefined) generationConfig.topP = subtask.top_p;
              if (subtask.top_k !== undefined) generationConfig.topK = subtask.top_k;
              if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
              if (subtask.safetySettings) body.safetySettings = subtask.safetySettings;
              const modelName = modelSpecInternal?.apiModelId || modelIdInternal.replace('gemini-', '');
              const url = `${apiBaseUrl}/models/${modelName}:generateContent?key=${apiKey}`;
              return { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
            }
          })();
          return geminiBuilder2.build(task, modelSpec, modelId);

        case 'ollama':
          const OllamaRequestBuilder2 = require('./core/RequestBuilder').OllamaRequestBuilder;
          const ollamaBuilder2 = new (class {
            build(subtask, modelSpecInternal, modelIdInternal) {
              let messages = [];
              if (subtask.messages && Array.isArray(subtask.messages)) {
                messages = [...subtask.messages];
              } else {
                const content = subtask.prompt || subtask.description || subtask.content || subtask.query;
                if (!content) return { success: false, error: 'No content provided in subtask', errorCode: 'NO_CONTENT', content: null };
                messages = [{ role: 'user', content }];
              }
              const body = {
                model: modelSpecInternal?.apiModelId || modelIdInternal.replace('ollama/', ''),
                messages,
                options: {}
              };
              if (subtask.temperature !== undefined) body.options.temperature = subtask.temperature;
              if (subtask.maxTokens || subtask.max_tokens) body.options.num_predict = subtask.maxTokens || subtask.max_tokens;
              if (subtask.top_p !== undefined) body.options.top_p = subtask.top_p;
              if (subtask.top_k !== undefined) body.options.top_k = subtask.top_k;
              if (subtask.seed !== undefined) body.options.seed = subtask.seed;
              if (subtask.num_ctx !== undefined) body.options.num_ctx = subtask.num_ctx;
              if (subtask.stream !== undefined) body.stream = subtask.stream;
              return { url: `${apiBaseUrl}/chat`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
            }
          })();
          return ollamaBuilder2.build(task, modelSpec, modelId);

        case 'deepseek':
          // DeepSeek 需要检查是否使用 Anthropic 格式
          console.log(`[DeepSeek Request] provider=${provider}, use_anthropic_format=${modelSpec.use_anthropic_format}, apiBaseUrl=${apiBaseUrl}`);
          if (modelSpec.use_anthropic_format === true) {
            console.log(`[DeepSeek Request] 使用 Anthropic 格式`);
            const AnthropicRequestBuilderDS = require('./core/RequestBuilder').AnthropicRequestBuilder;
            const anthropicBuilderDS = new AnthropicRequestBuilderDS();
            const anthropicModelSpecDS = {
              ...modelSpec,
              baseUrl: apiBaseUrl,
              api_key: apiKey
            };
            return anthropicBuilderDS.build(task, anthropicModelSpecDS, modelId);
          }
          // 否则使用 OpenAI 兼容格式
          console.log(`[DeepSeek Request] 使用 OpenAI 兼容格式`);
          requestBuilder = new OpenAICompatibleRequestBuilder(apiBaseUrl, modelSpec.api_key_env, {});
          break;
        case 'bailian':
        case 'aliyun':
        case 'moonshot':
        case 'zhipu':
        case 'minimax':
          requestBuilder = new OpenAICompatibleRequestBuilder(apiBaseUrl, modelSpec.api_key_env, {});
          break;

        default:
          requestBuilder = new OpenAICompatibleRequestBuilder(apiBaseUrl, modelSpec.api_key_env, {});
          break;
      }
    }

    // 使用获取到的配置构建请求
    return requestBuilder.build(task, modelSpec, modelId);
  }

  /**
   * 优化的请求执行方法（使用 ModelRegistry 中的显式配置）
   * @param {string} modelId - 模型 ID
   * @param {Object} task - 任务对象
   * @param {string} taskId - 任务 ID
   * @param {string} traceId - 追踪 ID
   * @param {Object} executionInfo - 执行信息对象
   * @returns {Promise<Object>} 请求结果
   * @private
   */
  async _executeRequestWithRetryTrackingOptimized(modelId, task, taskId, traceId, executionInfo) {
    console.log(`[_executeRequestWithRetryTrackingOptimized] 开始执行，modelId=${modelId}, taskId=${taskId}`);
    // 从模型注册表获取提供商信息 - 优先使用显式配置
    const modelSpec = this.modelRegistry ? this.modelRegistry.getModel(modelId) : null;
    const provider = this.tokenUsageParser.getProvider(modelId, this.modelRegistry);

    // 功能块 F: 记录请求步骤
    if (traceId) {
      this.requestTracer.addStep(traceId, 'rate_limiting', '等待获取限流令牌');
    }

    let attempt = 0;

    // 【修复】获取超时配置
    const rateLimitTimeout = this.retryManager?.getConfig()?.timeout || 30000;

    // 执行重试逻辑并跟踪重试信息
    // 【修复】移除重复的限流调用 - 限流已在 execute() 主流程中处理
    // 避免双重限流导致死锁或性能问题
    const result = await this.retryManager.executeWithRetry(
      async (attemptNum) => {
        attempt = attemptNum;

        // 注意：此处不再调用限流器，因为 execute() 方法中已经获取了限流许可
        // 避免双重限流导致永久等待

        // 功能块 F: 记录请求步骤
        if (traceId) {
          this.requestTracer.addStep(traceId, 'building_request', '构建请求配置');
        }

        // 使用 ModelRegistry 优化的构建请求方式
        const requestConfig = this._buildRequestConfigFromModelRegistry(modelId, task);

        // 调试：记录实际发送给模型的请求信息
        console.log(`===== 发送给模型的请求信息 =====`);
        console.log(`URL: ${requestConfig.url}`);
        console.log(`实际执行模型: ${modelId}`);
        console.log(`模型规格存在: ${!!modelSpec}`);
        if (modelSpec) {
          console.log(`模型Provider: ${modelSpec.provider}`);
          console.log(`模型API Base URL: ${modelSpec.api_base_url || '未设置'}`);
        }

        // 检查请求体中的内容
        if (requestConfig.body.messages) {
          console.log(`[请求] messages 数量: ${requestConfig.body.messages.length}`);
          requestConfig.body.messages.forEach((msg, idx) => {
            const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            console.log(`  [消息 ${idx}] role: ${msg.role}, content长度: ${msgContent.length}`);
            if (idx === 0) {
              console.log(`  [消息 ${idx}] 内容预览: ${msgContent.substring(0, 200)}...`);
            }
          });
        }

        // 检查 system prompt
        if (requestConfig.body.system) {
          console.log(`[请求] system prompt 长度: ${requestConfig.body.system.length}`);
        } else {
          console.log(`[请求] system prompt: (无)`);
        }
        // 记录 max_tokens 值
        console.log(`[请求] max_tokens: ${requestConfig.body.max_tokens}`);
        console.log(`================================`);

        // 功能块 F: 记录请求步骤
        if (traceId) {
          this.requestTracer.addStep(traceId, 'sending_request', `发送请求到 ${modelId}`);
        }

        // 检查是否启用流式响应
        const streamingEnabled = this.streamingConfig && this.streamingConfig.enabled;

        let response;
        if (streamingEnabled) {
          // 流式请求
          console.log(`[流式执行] 启用流式响应，modelId=${modelId}`);

          // 确保 body 设置了 stream: true
          requestConfig.body.stream = true;

          // 创建工具调用解析器
          const StreamToolCallParser = require('./core/StreamToolCallParser');
          const toolCallParser = new StreamToolCallParser();

          // 用于累积结果的变量
          let accumulatedContent = '';
          let accumulatedThinking = '';
          let accumulatedTools = [];
          let accumulatedUsage = null; // 用于累积流式响应中的 usage 数据

          // 流式请求
          response = await this.asyncRequester.requestStream(
            requestConfig.url,
            'POST',
            requestConfig.headers,
            requestConfig.body,
            {
              onThinkingDelta: (thinking) => {
                accumulatedThinking += thinking;
                // 发送到 SSE
                if (this.flowMonitor) {
                  this.flowMonitor.emitThinkingProgress(
                    taskId || 'unknown',
                    thinking,
                    'reasoning',
                    { modelId }
                  );
                }
              },
              onTextDelta: (text) => {
                accumulatedContent += text;
                // 发送到 SSE
                if (this.flowMonitor) {
                  this.flowMonitor.emitTextDelta(
                    taskId || 'unknown',
                    text,
                    taskId,
                    { modelId }
                  );
                }
              },
              onToolCallDelta: (toolCall) => {
                // toolCall 是完整的工具调用对象 {id, type, name, arguments}
                // 直接添加到累积的 tools 数组
                accumulatedTools.push(toolCall);
                // 发送到 SSE
                if (this.flowMonitor) {
                  this.flowMonitor.emitToolCallProgress(
                    taskId || 'unknown',
                    toolCall,
                    'completed',
                    { modelId, toolCount: accumulatedTools.length }
                  );
                }
              },
              onComplete: (finalData) => {
                console.log(`[流式执行] 流式响应完成`);
              },
              onError: (error) => {
                console.error(`[流式执行] 流式响应错误: ${error.message}`);
              }
            },
            requestConfig.body?.max_tokens ? null : (this.streamingConfig.defaultTimeout || 180000)
          );

          // 流式模式下，将累积的内容转换为标准响应格式
          if (response.ok) {
            const tools = accumulatedTools;

            // 【调试】检查原始 response 中是否有 usage
            console.log(`[流式执行] 原始 response 包含的字段: ${Object.keys(response)}`);
            console.log(`[流式执行] response.data 类型: ${typeof response.data}`);
            if (typeof response.data === 'string') {
              // 检查字符串末尾是否包含 usage
              const lines = response.data.trim().split('\n');
              console.log(`[流式执行] response.data 包含 ${lines.length} 行`);

              // 遍历所有行查找 message_delta 事件（Anthropic 格式）
              for (const line of lines) {
                if (line.startsWith('event:') && line.includes('message_delta')) {
                  // 找到 message_delta 事件，下一行应该有 data:
                  continue;
                }
                if (line.startsWith('data:')) {
                  const jsonStr = line.substring(5).trim();
                  try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'message_delta' && parsed.usage) {
                      console.log(`[流式执行] 发现 message_delta，包含 usage: ${JSON.stringify(parsed.usage)}`);
                      accumulatedUsage = parsed.usage;
                    }
                  } catch (e) {
                    // 不是 JSON，忽略
                  }
                }
              }

              // 也检查最后一行（某些 API 可能只在最后返回 usage）
              const lastLine = response.data.trim().split('\n').pop();
              console.log(`[流式执行] response.data 最后一行: ${lastLine}`);
              try {
                const parsedLast = JSON.parse(lastLine);
                console.log(`[流式执行] 最后一行解析结果: ${JSON.stringify(parsedLast)}`);
                if (parsedLast.type === 'message_delta') {
                  console.log(`[流式执行] 发现 message_delta，包含 usage: ${JSON.stringify(parsedLast.usage)}`);
                  accumulatedUsage = parsedLast.usage;
                }
              } catch (e) {
                // 不是 JSON，忽略
              }
            }

            // 构建模拟的非流式响应结构，符合 _extractContent 期望的格式
            // MiniMax 格式: { content: [{type, text/thinking/tool_use}] }
            const mockResponseData = {
              id: `stream_${Date.now()}`,
              type: 'message',
              role: 'assistant',
              model: modelId,
              content: [],
              usage: accumulatedUsage || null  // 添加累积的 usage 数据
            };

            // 【调试】确认 usage 是否正确添加到 mockResponseData
            if (accumulatedUsage) {
              console.log(`[流式执行] usage 已添加到 mockResponseData: ${JSON.stringify(accumulatedUsage)}`);
            } else {
              console.log(`[流式执行] 警告：未从流式响应中提取到 usage 数据，mockResponseData.usage 为 null`);
            }

            // 添加思考内容
            if (accumulatedThinking) {
              mockResponseData.content.push({
                type: 'thinking',
                thinking: accumulatedThinking
              });
            }

            // 添加文本内容
            if (accumulatedContent) {
              mockResponseData.content.push({
                type: 'text',
                text: accumulatedContent
              });
            }

            //添加工具调用
            if (tools && tools.length > 0) {
              console.log(`[流式执行] 累积到 ${tools.length} 个工具调用`);
              for (const tool of tools) {
                // 【调试】输出原始 tool.arguments 格式
                console.log(`[流式执行] tool.arguments 原始格式: type=${typeof tool.arguments}, value=${typeof tool.arguments === 'string' ? tool.arguments.substring(0, 200) : JSON.stringify(tool.arguments)}`);
                try {
                  // 尝试解析 arguments 为 JSON 对象
                  const parsedInput = JSON.parse(tool.arguments || '{}');
                  mockResponseData.content.push({
                    type: 'tool_use',
                    name: tool.name,
                    input: parsedInput
                  });
                } catch (e) {
                  // JSON 解析失败，使用原始字符串或空对象
                  // 如果 arguments 看起来像 partial JSON，尝试提取有效部分
                  let partialInput = {};
                  if (tool.arguments && typeof tool.arguments === 'string') {
                    console.warn(`[流式执行] 工具 ${tool.name} 的 arguments 解析失败，尝试修复: ${tool.arguments.substring(0, 100)}...`);
                    partialInput = this._tryFixPartialJson(tool.arguments);

                    // 【修复】如果 _tryFixPartialJson 返回空对象，或者返回的对象缺少 file_path，
                    // 都尝试从原始字符串直接提取字段
                    if (Object.keys(partialInput).length === 0 || !partialInput.file_path) {
                      partialInput = this._extractFieldsFromPartialJson(tool.arguments);
                      if (Object.keys(partialInput).length > 0) {
                        console.warn(`[流式执行] 从原始字符串直接提取字段成功: ${JSON.stringify(partialInput)}`);
                      }
                    }
                  }
                  mockResponseData.content.push({
                    type: 'tool_use',
                    name: tool.name,
                    input: partialInput
                  });
                }
              }
              mockResponseData.content.push({
                type: 'thinking',
                thinking: accumulatedThinking
              });
            }

            response = {
              ok: true,
              status: 200,
              data: mockResponseData
            };

            console.log(`[流式执行] 累积内容: 思考=${accumulatedThinking.length}字符, 文本=${accumulatedContent.length}字符, 工具=${tools.length}个`);
          }
        } else {
          // 普通请求（非流式）
          response = await this.asyncRequester.request(
            requestConfig.url,
            'POST',
            requestConfig.headers,
            requestConfig.body
          );
        }

        if (!response.ok) {
          return {
            success: false,
            error: `API 响应失败：${response.status} ${response.data?.error?.message || response.data}`,
            errorCode: 'API_ERROR',
            content: null
          };
        }

        // 功能块 F: 记录请求步骤
        if (traceId) {
          this.requestTracer.addStep(traceId, 'parsing_response', '解析响应数据');
        }

        // 解析响应
        const rawContent = this._extractContent(response.data, provider);

        // 检测空响应
        if (!rawContent || (typeof rawContent === 'string' && rawContent.trim() === '') || (typeof rawContent === 'object' && !rawContent.hasToolCalls)) {
          return {
            success: false,
            error: 'Model returned empty content',
            errorCode: 'EMPTY_RESPONSE',
            content: null
          };
        }

        // 如果是 tool_call 格式，直接使用
        if (typeof rawContent === 'object' && rawContent.hasToolCalls) {
          console.log(`===== 模型返回了 tool_call 格式 =====`);
          console.log(`[响应] tool_calls 数量: ${rawContent.toolCalls.length}`);

          return {
            content: rawContent.textContent, // 保留文本内容用于调试
            toolCalls: rawContent.toolCalls, // 直接返回 tool_calls
            usage: this.tokenUsageParser.parse(response.data, modelId),
            cost: this._calculateCost(this.tokenUsageParser.parse(response.data, modelId), modelId),
            model_used: modelId, // 【修复】记录实际使用的模型
            thinking: null,
            raw_response: response.data
          };
        }

        // 提取代码块 - 从任务中获取目标文件路径以推断语言
        const language = this._inferLanguageFromTask(task);
        const content = this._extractCodeBlocks(rawContent, language);

        const usage = this.tokenUsageParser.parse(response.data, modelId);
        const cost = this._calculateCost(usage, modelId);

        // 调试：记录模型返回的响应信息
        console.log(`===== 模型返回的响应信息 =====`);
        console.log(`模型: ${modelId}`);
        console.log(`[响应] raw_content 长度: ${rawContent ? rawContent.length : 0}`);
        console.log(`[响应] 提取后 content 长度: ${content ? content.length : 0}`);
        console.log(`[响应] content 预览: ${content ? content.substring(0, 300) + '...' : '(空)'}`);

        // 显示 token 使用情况
        if (usage) {
          console.log(`[响应] usage: input=${usage.input || 0}, output=${usage.output || 0}, total=${usage.total || 0}`);
        }

        // 显示成本
        if (cost) {
          console.log(`[响应] cost: $${cost.total || 0}`);
        }

        // 显示 thinking 内容（如果有）
        let thinking = null;
        if (response.data.content && Array.isArray(response.data.content)) {
          const thinkingItem = response.data.content.find(item => item.type === 'thinking');
          if (thinkingItem && thinkingItem.thinking) {
            thinking = thinkingItem.thinking;
            console.log(`[响应] thinking 内容长度: ${thinking.length}`);
          }
        }
        console.log(`================================`);

        // 确认预估成本（任务开始执行）
        try {
          await this.costTracker.confirmEstimate(taskId, cost.total);
        } catch (error) {
          console.warn(`[ConcurrentExecutor] 确认预估成本失败: ${error.message}`);
        }

        return {
          content,
          usage,
          cost,
          model_used: modelId, // 【修复】记录实际使用的模型
          thinking,  // 保存 thinking 内容用于后续检测
          raw_response: response.data
        };
      },
      {
        context: `执行任务 [${modelId}]`,
        taskId: taskId,
        modelId: modelId,  // 【新增】用于按模型隔离的熔断器
        onRetry: (error, attempt, delay) => {
          // 记录重试详情
          executionInfo.retry_details.push({
            attempt,
            error: error.message,
            delay,
            timestamp: new Date()
          });

          executionInfo.retry_count = attempt;

          // 记录重试原因
          executionInfo.execution_reasons.push({
            phase: 'retry',
            action: 'retry_attempt',
            reason: `Retry attempt ${attempt} due to error: ${error.message}`,
            timestamp: new Date()
          });
        }
      }
    );

    // 功能块 F: 记录请求完成步骤
    if (traceId) {
      this.requestTracer.addStep(traceId, 'request_complete', `请求执行完成，总重试次数：${executionInfo.retry_count}`);
    }

    return result;
  }

  /**
   * 获取默认 API 基础 URL
   * @param {string} provider - 提供商
   * @returns {string} 基础 URL
   * @private
   */
  _getDefaultBaseUrl(provider) {
    const baseUrls = {
      'openai': 'https://api.openai.com/v1',
      'anthropic': 'https://api.anthropic.com/v1',
      'gemini': 'https://generativelanguage.googleapis.com/v1beta',
      'ollama': 'http://localhost:11434/api',
      'deepseek': 'https://api.deepseek.com/v1',
      'aliyun': 'https://coding.dashscope.aliyuncs.com/v1',
      'minimax': 'https://api.minimaxi.com/v1',
      'moonshot': 'https://coding.dashscope.aliyuncs.com/v1',
      'zhipu': 'https://coding.dashscope.aliyuncs.com/v1',
      'bailian': 'https://coding.dashscope.aliyuncs.com/v1'
    };
    return baseUrls[provider] || baseUrls['openai'];
  }

  /**
   * 尝试获取槽位
   * @param {string} modelId - 模型 ID
   * @param {Object} executionRequest - 执行请求
   * @param {boolean} options.waitForSlot - 是否等待槽位（默认 false，非阻塞）
   * @param {number} options.slotTimeout - 等待超时时间（默认 30000ms）
   * @returns {Promise<Object>} 槽位获取结果
   * @private
   */
  async _attemptSlotAcquisition(modelId, executionRequest, options = {}) {
    const { waitForSlot = false, slotTimeout = 30000 } = options;
    try {
      let success;
      if (waitForSlot) {
        // 阻塞等待槽位
        success = await this.concurrencyController.acquireSlot(modelId, slotTimeout);
      } else {
        // 非阻塞尝试获取槽位
        success = await this.concurrencyController.tryAcquireSlot(modelId);
      }
      return { success, model: modelId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 流式执行请求
   * 支持 MiniMax SSE 和 DeepSeek 流式响应
   * @param {string} modelId - 模型 ID
   * @param {Object} task - 任务对象
   * @param {string} taskId - 任务 ID
   * @param {Object} options - 选项
   * @param {Function} options.onChunk - 文本块回调
   * @param {Function} options.onToolCall - 工具调用回调
   * @param {Function} options.onThinking - 思考过程回调
   * @param {Function} options.onComplete - 完成回调
   * @param {Function} options.onError - 错误回调
   * @param {Object} abortSignal - 中断信号
   * @returns {Promise<Object>} 执行结果
   * @private
   */
  async _executeRequestStream(modelId, task, taskId, options = {}, abortSignal = null) {
    const { onChunk, onToolCall, onThinking, onComplete, onError } = options;

    console.log(`[_executeRequestStream] 开始流式执行，modelId=${modelId}, taskId=${taskId}`);

    // 从模型注册表获取提供商信息
    const modelSpec = this.modelRegistry ? this.modelRegistry.getModel(modelId) : null;
    const provider = this.tokenUsageParser.getProvider(modelId, this.modelRegistry);

    // 使用 RequestBuilder 构建请求
    const requestConfig = this.requestBuilder.buildRequest(modelId, task, modelSpec);
    const { url, method, headers, body } = requestConfig;

    // 添加流式标记
    body.stream = true;

    // 创建中止信号检查
    const checkAbort = () => {
      if (abortSignal && abortSignal.aborted) {
        throw new Error(`Task ${taskId} aborted: ${abortSignal.reason}`);
      }
    };

    try {
      // 使用 AsyncRequester 的流式请求方法
      const result = await this.asyncRequester.requestStream(
        url,
        method,
        headers,
        body,
        {
          onChunk: (textDelta, type) => {
            checkAbort();

            if (type === 'thinking') {
              // 思考过程
              if (onThinking) {
                onThinking(textDelta);
              }
            } else if (type === 'tool_args') {
              // 工具调用参数（不触发 onChunk）
            } else {
              // 普通文本
              if (onChunk) {
                onChunk(textDelta);
              }
            }
          },
          onToolCall: (toolCall) => {
            checkAbort();
            if (onToolCall) {
              onToolCall(toolCall);
            }
          },
          onComplete: (streamResult) => {
            if (onComplete) {
              onComplete({
                ...streamResult,
                model_used: modelId,
                provider
              });
            }
          },
          onError: (error) => {
            if (onError) {
              onError(error);
            }
          }
        }
      );

      return result;
    } catch (error) {
      console.error(`[_executeRequestStream] 流式执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 使用备选模型执行
   * @param {string} originalModelId - 原始模型 ID
   * @param {Object} executionRequest - 执行请求
   * @param {string} taskId - 任务 ID
   * @param {string} traceId - 追踪 ID
   * @param {Object} executionInfo - 执行信息
   * @returns {Promise<Object>} 执行结果
   * @private
   */
  async _executeWithFallback(originalModelId, executionRequest, taskId, traceId, executionInfo) {
    // 尝试使用备选模型
    const alternatives = executionRequest.alternatives || [];
    for (const alternativeModelId of alternatives) {
      let slotAcquiredForFallback = false;
      try {
        console.log(`[ConcurrentExecutor] 尝试备选模型: ${alternativeModelId}`);

        // 【修复】为备选模型获取并发槽位，确保并发控制一致性
        const slotResult = await this.concurrencyController.tryAcquireSlot(alternativeModelId);
        if (!slotResult.success) {
          console.log(`[ConcurrentExecutor] 备选模型 ${alternativeModelId} 槽位获取失败，尝试下一个备选模型`);
          continue;
        }
        slotAcquiredForFallback = true;

        // 使用备选模型执行
        console.log(`[_executeWithFallback] 开始执行备选模型 ${alternativeModelId}，任务ID: ${taskId}`);

        // 检查备选模型的配置是否有效
        const fallbackModelSpec = this.modelRegistry ? this.modelRegistry.getModel(alternativeModelId) : null;
        if (!fallbackModelSpec) {
          console.warn(`[_executeWithFallback] 备选模型 ${alternativeModelId} 未在注册表中找到配置，跳过该模型`);
          continue;
        }

        const result = await this._executeRequestWithRetryTrackingOptimized(
          alternativeModelId,
          executionRequest.task || {},
          taskId,
          traceId,
          executionInfo
        );

        // 更新执行信息，表明使用了备选模型
        executionInfo.execution_reasons.push({
          phase: 'fallback',
          action: 'used_alternative',
          reason: `Used alternative model ${alternativeModelId} instead of ${originalModelId}`,
          timestamp: new Date()
        });

        return { ...result, fallback_used: true, original_model: originalModelId, model_used: alternativeModelId };
      } catch (error) {
        console.warn(`[ConcurrentExecutor] 备选模型 ${alternativeModelId} 执行失败: ${error.message}`);
        continue;
      } finally {
        // 【修复】确保 fallback 槽位被正确释放
        if (slotAcquiredForFallback) {
          try {
            await this.concurrencyController.releaseSlot(alternativeModelId);
          } catch (releaseError) {
            console.error(`[ConcurrentExecutor] 释放备选模型 ${alternativeModelId} 槽位失败: ${releaseError.message}`);
          }
        }
      }
    }

    // 所有备选模型都失败
    return {
      task_id: taskId,
      success: false,
      error: `All fallback models failed. Original model: ${originalModelId}`,
      model_used: originalModelId,
      execution_info: executionInfo
    };
  }

  /**
   * 从响应提取内容
   * @param {Object} data - 响应数据
   * @param {string} provider - 提供商
   * @returns {string} 提取的内容
   * @private
   */
  _extractContent(data, provider) {
    try {
      // 调试日志
      console.log('[_extractContent] 原始响应数据:', JSON.stringify(data).substring(0, 500));
      console.log('[_extractContent] provider:', provider);

      // ========================================
      // 【核心】使用统一的递归检查提取所有 write_file
      // 递归检查会遍历整个响应对象，确保任何位置的 write_file 都能被找到
      // ========================================
      const writeFiles = this._findWriteFilesRecursive(data);

      if (writeFiles.length > 0) {
        console.log('[_extractContent] 递归检查找到 write_file，数量:', writeFiles.length);
        console.log('[_extractContent] 递归搜索结果:', JSON.stringify(writeFiles.map(r => ({
          name: r.name,
          filePath: r.input?.file_path || r.input?.filePath,
          contentLen: r.input?.content?.length || 0
        }))));

        // 过滤出有效的 write_file（需要有 file_path 或 content）
        const validWriteFiles = writeFiles.filter(wf =>
          wf.input?.file_path || wf.input?.filePath || wf.input?.content
        );

        // 【诊断】检查是否找到了 tool_use 但 input 为空
        const emptyInputWriteFiles = writeFiles.filter(wf =>
          !(wf.input?.file_path || wf.input?.filePath || wf.input?.content)
        );
        if (emptyInputWriteFiles.length > 0) {
          console.warn(`[_extractContent] 警告: 找到 ${emptyInputWriteFiles.length} 个 tool_use 但 input 为空，可能是流式传输导致参数丢失`);
          console.warn(`[_extractContent] 空 input 的 tool_use 示例:`, JSON.stringify(emptyInputWriteFiles[0]));
        }

        if (validWriteFiles.length > 0) {
          console.log('[_extractContent] 有效 write_file 数量:', validWriteFiles.length);
          // 【重要】只返回 tool_calls 结构，不要返回 textContent 字符串
          // 因为返回字符串会导致调用者检测到 !rawContent.hasToolCalls 而报错
          return {
            hasToolCalls: true,
            toolCalls: validWriteFiles
          };
        }
      }

      // ========================================
      // 如果没有找到 write_file，尝试提取纯文本内容
      // ========================================
      const textContent = this._extractTextFallback(data);
      if (textContent) {
        return textContent;
      }

      // 兜底返回原始数据
      return JSON.stringify(data);
    } catch (e) {
      console.error(`[_extractContent] 提取内容失败：${e.message}`, e.stack);
      return '';
    }
  }

  /**
   * 从响应数据中提取纯文本内容（用于没有 write_file 时的兜底）
   * @param {*} data - 响应数据
   * @returns {string} 提取的文本内容
   * @private
   */
  _extractTextFallback(data) {
    // 1. Anthropic 格式 - content 是数组，包含 thinking 和 text 块
    if (data.content && Array.isArray(data.content)) {
      // 提取 text 块内容
      const textContent = data.content
        .filter(item => item.type === 'text')
        .map(item => item.text || '')
        .join('');

      if (textContent) {
        return textContent;
      }

      // 兼容旧格式：直接提取所有文本
      return data.content.map(item => item.text || item.content || '').join('');
    }

    // 2. OpenAI 兼容格式
    if (data.choices && data.choices[0]) {
      const message = data.choices[0].message || {};
      const messageContent = message.content || data.choices[0].delta?.content || '';
      if (messageContent) {
        return MarkdownCodeCleaner.removeThinkingContent(messageContent);
      }
    }

    // 3. Anthropic 旧格式
    if (data.completion) {
      return data.completion;
    }

    // 4. Gemini 格式
    if (data.candidates && data.candidates[0]?.content?.parts) {
      const geminiContent = data.candidates[0].content.parts
        .map(p => p.text || p.content || '')
        .join('');
      if (geminiContent) {
        return MarkdownCodeCleaner.removeThinkingContent(geminiContent);
      }
    }

    // Gemini 格式（流式）
    if (data.text) {
      return MarkdownCodeCleaner.removeThinkingContent(data.text);
    }

    // 5. Ollama 格式
    if (data.response) {
      return data.response;
    }

    if (data.message && data.message.content) {
      return data.message.content;
    }

    // 6. 兜底：尝试从各种可能的字段获取
    if (data.result) return data.result;
    if (data.generated_text) return MarkdownCodeCleaner.removeThinkingContent(data.generated_text);
    if (data.outputs) return data.outputs.join(' ');

    return '';
  }

  /**
   * 递归搜索对象中所有 write_file 相关的内容
   * 确保任何位置的 write_file 都能被找到
   * @param {*} obj - 要搜索的对象
   * @param {string} path - 当前路径（用于调试）
   * @returns {Array} 找到的 write_file 数组
   * @private
   */
  _findWriteFilesRecursive(obj, path = 'root') {
    const results = [];

    if (obj === null || obj === undefined) {
      return results;
    }

    // 如果是字符串，尝试解析为 JSON
    if (typeof obj === 'string') {
      try {
        const parsed = JSON.parse(obj);
        // 递归检查解析后的对象
        return this._findWriteFilesRecursive(parsed, path);
      } catch (e) {
        // 不是有效的 JSON 字符串，返回空
        return results;
      }
    }

    // 如果是数组，遍历每个元素
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const itemResults = this._findWriteFilesRecursive(obj[i], `${path}[${i}]`);
        results.push(...itemResults);
      }
      return results;
    }

    // 如果是对象，检查其属性
    if (typeof obj === 'object') {
      // 标准化 input：可能是字符串（JSON）或对象
      let normalizedInput = obj.input || obj.arguments || {};
      if (typeof normalizedInput === 'string') {
        try {
          normalizedInput = JSON.parse(normalizedInput);
        } catch (e) {
          // 如果不是 JSON 字符串，保持原样
        }
      }

      // 【修改】检测顺序：优先使用正确格式，后备机制兜底
      // 1. 优先检查 type === 'tool_use'（标准格式）
      // 2. 如果 type 不匹配，检查 name === 'write_file'（后备机制）
      // 3. 如果都不匹配，后续会递归检查属性

      // 1. 优先使用正确格式检测
      if (obj.type === 'tool_use' || obj.type === 'tool_call') {
        const filePath = normalizedInput?.file_path || normalizedInput?.filePath || normalizedInput?.path || '';
        const content = normalizedInput?.content || normalizedInput?.code || normalizedInput?.source || '';

        if (filePath || content) {
          results.push({
            type: 'tool_use',
            id: obj.id || `recursive_${Date.now()}`,
            name: obj.name || obj.function?.name || '',
            input: {
              file_path: filePath,
              content: content
            }
          });
        }
        // 【重要】标准格式匹配成功，不再递归检查属性，避免重复
        return results;
      }

      // 2. 后备机制：检查 name === 'write_file'（模型响应格式不规范时使用）
      if (obj.name === 'write_file' || obj.name === 'Write') {
        // 提取 file_path 和 content
        const filePath = normalizedInput?.file_path || normalizedInput?.filePath || normalizedInput?.path || '';
        const content = normalizedInput?.content || normalizedInput?.code || normalizedInput?.source || '';

        if (filePath || content) {
          results.push({
            type: 'tool_use',
            id: obj.id || `recursive_${Date.now()}`,
            name: obj.name,
            input: {
              file_path: filePath,
              content: content
            }
          });
        }
        // 后备机制也 return，避免递归检查属性时重复匹配
        return results;
      }

      // 递归检查所有属性
      for (const key of Object.keys(obj)) {
        const value = obj[key];

        // 【修改】处理字符串字段 - 从文本中提取 tool_use JSON
        // 融入 StreamToolCallParser.parseThinkingForToolCalls 的逻辑
        if (typeof value === 'string') {
          const extractedToolCalls = this._extractToolCallsFromText(value);
          if (extractedToolCalls.length > 0) {
            results.push(...extractedToolCalls);
          }
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          const subResults = this._findWriteFilesRecursive(value, `${path}.${key}`);
          results.push(...subResults);
        }
      }
    }

    return results;
  }

  /**
   * 从文本中提取 tool_use JSON
   * 融入 StreamToolCallParser.parseThinkingForToolCalls 的逻辑
   * @param {string} text - 文本内容
   * @returns {Array} 找到的 tool_use 数组
   * @private
   */
  _extractToolCallsFromText(text) {
    const results = [];

    if (!text || typeof text !== 'string') {
      return results;
    }

    // 尝试匹配 JSON 数组格式: [{"type": "tool_use", ...}]
    const jsonArrayMatch = text.match(/(\[\s*\{\s*"type"\s*:\s*"tool_use"[\s\S]*?\])\s*$/);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.type === 'tool_use' && (item.name === 'write_file' || item.name === 'Write')) {
              results.push({
                type: 'tool_use',
                id: item.id || `text_extract_${Date.now()}_${results.length}`,
                name: item.name || '',
                input: typeof item.input === 'string' ? item.input : JSON.stringify(item.input || {})
              });
            }
          }
          if (results.length > 0) {
            console.log(`[_extractToolCallsFromText] 从文本中提取到 ${results.length} 个 tool_use`);
          }
        }
      } catch (e) {
        // JSON 解析失败，尝试其他方式
      }
    }

    // 如果没找到数组，尝试匹配单个 tool_use 对象
    if (results.length === 0) {
      const singleToolUseMatch = text.match(/\{\s*"type"\s*:\s*"tool_use"\s*,\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"input"\s*:\s*(\{[\s\S]*?\})\s*\}/);
      if (singleToolUseMatch) {
        try {
          const name = singleToolUseMatch[1];
          const inputStr = singleToolUseMatch[2];
          const input = JSON.parse(inputStr);
          results.push({
            type: 'tool_use',
            id: `text_extract_${Date.now()}_${results.length}`,
            name: name,
            input: JSON.stringify(input)
          });
          console.log(`[_extractToolCallsFromText] 从文本中提取到单个 tool_use: ${name}`);
        } catch (e) {
          // 解析失败
        }
      }
    }

    return results;
  }

  /**
   * 从内容中提取代码块
   * @param {string} content - 原始内容
   * @param {string} language - 语言类型
   * @returns {string} 提取的代码块内容
   * @private
   */

  /**
   * 尝试修复不完整的 JSON 字符串
   * 用于处理流式传输时被截断的 JSON
   * @param {string} partialJson - 可能不完整的 JSON 字符串
   * @returns {Object} 修复后的对象
   * @private
   */
  _tryFixPartialJson(partialJson) {
    if (!partialJson || typeof partialJson !== 'string') {
      return {};
    }

    // 尝试直接解析
    try {
      return JSON.parse(partialJson);
    } catch (e) {
      // 直接解析失败，尝试修复
    }

    // 【新增】如果字符串以逗号开头，说明 JSON 被截断，前面的内容可能是 thinking
    // 尝试找到有效的 JSON 对象
    const trimmedPartial = partialJson.trim();
    let startIdx = -1;

    // 查找 { 开始的位置
    if (trimmedPartial.startsWith('{')) {
      startIdx = 0;
    } else {
      // 字符串不以 { 开头，可能被 thinking 内容污染
      // 查找第一个 { 的位置
      startIdx = trimmedPartial.indexOf('{');
    }

    if (startIdx === -1) {
      // 没有找到 {，尝试直接提取字段
      return {};
    }

    // 从结尾反向查找 }
    let endIdx = trimmedPartial.lastIndexOf('}');
    if (endIdx === -1 || endIdx < startIdx) {
      // 尝试补全 }
      endIdx = trimmedPartial.length;
    }

    // 提取可能的 JSON 对象
    let potentialJson = trimmedPartial.substring(startIdx, endIdx + 1);

    // 尝试解析
    try {
      return JSON.parse(potentialJson);
    } catch (e) {
      // 尝试补全缺失的引号或括号
    }

    // 尝试修复常见的 JSON 问题
    // 1. 处理 content 字段中的未转义 } 或 "
    // 2. 处理不完整的键值对
    try {
      // 找到最后一个逗号，这通常是最后一个完整字段的结束
      const lastComma = potentialJson.lastIndexOf(',');
      if (lastComma > 0) {
        // 尝试截取到最后一个逗号的位置
        const truncated = potentialJson.substring(0, lastComma) + '}';
        return JSON.parse(truncated);
      }

      // 尝试修复引号问题
      const fixed = potentialJson
        .replace(/([^"])\s*}/g, '$1"}')  // 尾部引号修复
        .replace(/}\s*}/g, '}}');  // 双括号修复

      return JSON.parse(fixed);
    } catch (e2) {
      // 无法修复，返回空对象
    }

    return {};
  }

  /**
   * 从不完整的 JSON 字符串中直接提取字段
   * 用于处理 arguments 无法被 JSON.parse 解析的情况
   * 例如: , "file_path": "server/database/db.ts"}...
   * @param {string} partialJson - 可能不完整的 JSON 字符串
   * @returns {Object} 提取的字段对象
   * @private
   */
  _extractFieldsFromPartialJson(partialJson) {
    if (!partialJson || typeof partialJson !== 'string') {
      console.warn(`[_extractFieldsFromPartialJson] 输入为空或不是字符串`);
      return {};
    }

    const result = {};

    // 提取 file_path 字段
    const filePathMatch = partialJson.match(/"file_path"\s*:\s*"([^"]+)"/);
    if (filePathMatch) {
      result.file_path = filePathMatch[1];
      console.log(`[_extractFieldsFromPartialJson] 提取到 file_path: ${result.file_path}`);
    } else {
      console.warn(`[_extractFieldsFromPartialJson] 未匹配到 file_path，输入内容: ${partialJson.substring(0, 200)}...`);
    }

    // 提取 content 字段（可能是多行字符串）
    const contentMatch = partialJson.match(/"content"\s*:\s*"([\s\S]*?)"(?=\s*[,}])/);
    if (contentMatch) {
      result.content = contentMatch[1];
    }

    // 提取 language 字段
    const languageMatch = partialJson.match(/"language"\s*:\s*"([^"]+)"/);
    if (languageMatch) {
      result.language = languageMatch[1];
    }

    // 尝试提取其他字符串字段
    const otherFields = partialJson.matchAll(/"(\w+)"\s*:\s*"([^"]*)"/g);
    for (const match of otherFields) {
      const [, key, value] = match;
      if (!result[key] && value) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 从任务中推断语言
   * @param {Object} task - 任务对象
   * @returns {string} 推断的语言类型
   * @private
   */
  _inferLanguageFromTask(task) {
    if (!task || !task.filePath) {
      // 如果没有任务或文件路径，使用默认语言
      return 'javascript';
    }

    const filePath = task.filePath;
    const ext = filePath.split('.').pop()?.toLowerCase();

    const langMap = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'json': 'json',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'html': 'html',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'sh': 'bash',
      'sql': 'sql'
    };

    return langMap[ext] || 'javascript';
  }

  /**
   * 从内容中提取代码块
   * @param {string} content - 原始内容
   * @param {string} language - 语言类型
   * @returns {string} 提取的代码块内容
   * @private
   */
  _extractCodeBlocks(content, language) {
    try {
      // 现代模型直接输出代码，不需要 MarkdownCodeCleaner 提取
      // 直接返回原始内容
      return content;
    } catch (e) {
      console.error(`[_extractCodeBlocks] 代码块提取失败：${e.message}`, e.stack);
      // 发生错误时返回原始内容作为后备
      return content;
    }
  }

  /**
   * 计算成本
   * @param {Object} usage - Token 使用量
   * @param {string} modelId - 模型 ID
   * @returns {Object} 成本信息
   * @private
   */
  _calculateCost(usage, modelId) {
    const model = this.modelRegistry ? this.modelRegistry.getModel(modelId) : null;

    if (!model || !model.pricing) {
      return { input: 0, output: 0, total: 0, isLocal: model?.type === 'local' };
    }

    // 【修复】定价单位是每百万 token，应该用 /1000000 而不是 /1000
    const inputCost = (usage.input / 1000000) * model.pricing.input;
    const outputCost = (usage.output / 1000000) * model.pricing.output;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
      isLocal: model.type === 'local'
    };
  }

  /**
   * 准备备选模型列表
   * @param {Array} alternatives - 备选模型 ID 列表（字符串或对象）
   * @param {Object} loadInfo - 负载信息
   * @returns {Array} 备选模型对象列表
   * @private
   */
  _prepareAlternatives(alternatives, loadInfo) {
    if (!alternatives || alternatives.length === 0) {
      return [];
    }

    return alternatives.map(item => {
      // 处理 item 可能是对象的情况
      const modelId = (typeof item === 'object' && item.modelId) ? item.modelId : item;
      const model = this.modelRegistry ? this.modelRegistry.getModel(modelId) : null;
      return {
        modelId,
        model,
        loadScore: loadInfo?.loadScore || 0.5,
        cost: model?.pricing ? {
          input: model.pricing.input,
          output: model.pricing.output,
          total: (model.pricing.input + model.pricing.output) / 2
        } : null
      };
    });
  }

  /**
   * 错误分类辅助方法
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   * @private
   */
  _classifyError(error) {
    if (!error) return 'UNKNOWN';

    if (error.status === 429) return 'RATE_LIMIT';
    if (error.status >= 500) return 'SERVER_ERROR';
    if (error.status >= 400 && error.status < 500) return 'CLIENT_ERROR';

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('超时')) return 'TIMEOUT';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' || error.code === 'EAI_AGAIN' ||
        error.message.includes('network') || error.message.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    if (error.message.includes('validation failed') ||
        error.message.includes('Invalid ') ||
        error.message.includes('response validation') ||
        error.message.includes('validation')) {
      return 'VALIDATION_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * 批量执行任务（按计划文档第11节规范）
   * 【改进 2026-05-05】分批执行策略，避免大量任务同时竞争槽位
   *
   * @param {Array} executionRequests - 执行请求列表，每个请求包含来自Decomposer和ModelSelector的数据
   * @param {Object} options - 选项
   * @param {boolean} options.waitForSlot - 是否等待槽位（默认 true，同时启动需要等待）
   * @param {number} options.slotTimeout - 槽位等待超时（默认 60000ms）
   * @param {number} options.batchSize - 每批最大并发数（默认根据槽位总数动态计算）
   * @param {boolean} options.enableBatching - 是否启用分批执行（默认 true）
   * @returns {Promise<Array>} 执行结果列表
   */
  async executeBatch(executionRequests, options = {}) {
    const {
      waitForSlot = true,
      slotTimeout = 60000,
      batchSize = null,  // null 表示自动计算
      enableBatching = true
    } = options;

    console.log(`[ConcurrentExecutor] 批量执行 ${executionRequests.length} 个任务，enableBatching=${enableBatching}`);

    // 【改进】如果禁用分批或任务数较少，使用原来的并发执行方式
    if (!enableBatching || executionRequests.length <= 3) {
      return this._executeBatchAllAtOnce(executionRequests, { waitForSlot, slotTimeout });
    }

    // 【改进】分批执行策略
    return this._executeBatchWithBatching(executionRequests, {
      waitForSlot,
      slotTimeout,
      batchSize
    });
  }

  /**
   * 【新增 2026-05-05】一次性执行所有任务（原有逻辑，保留用于小批量场景）
   * @private
   */
  async _executeBatchAllAtOnce(executionRequests, options) {
    const { waitForSlot, slotTimeout } = options;

    console.log(`[ConcurrentExecutor] 小批量执行 ${executionRequests.length} 个任务，同时启动`);

    const promises = executionRequests.map((executionRequest, index) => {
      const request = {
        ...executionRequest,
        waitForSlot,
        slotTimeout
      };

      return this.execute(request)
        .then(result => result)
        .catch(error => {
          console.error(`[ConcurrentExecutor] 任务 ${index} 执行失败: ${error.message}`);
          return {
            success: false,
            taskId: executionRequest.taskId || executionRequest.task?.id || `task_${index}`,
            error: error.message || 'Execution failed',
            errorCode: error.code || 'UNKNOWN_ERROR',
            modelId: executionRequest.modelId
          };
        });
    });

    const allResults = await Promise.all(promises);
    console.log(`[ConcurrentExecutor] 批量执行完成，成功: ${allResults.filter(r => r.success).length}/${allResults.length}`);
    return allResults;
  }

  /**
   * 【新增 2026-05-05】分批执行任务
   * @private
   */
  async _executeBatchWithBatching(executionRequests, options) {
    const { waitForSlot, slotTimeout, batchSize } = options;

    // 计算最优批次大小
    const optimalBatchSize = batchSize || this._calculateOptimalBatchSize(executionRequests);
    const totalBatches = Math.ceil(executionRequests.length / optimalBatchSize);

    console.log(`[ConcurrentExecutor] 分批执行：${executionRequests.length} 个任务，分 ${totalBatches} 批，每批 ${optimalBatchSize} 个`);

    const allResults = [];
    let completedCount = 0;

    // 分批执行
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * optimalBatchSize;
      const endIdx = Math.min(startIdx + optimalBatchSize, executionRequests.length);
      const batchRequests = executionRequests.slice(startIdx, endIdx);

      console.log(`[ConcurrentExecutor] 开始第 ${batchIndex + 1}/${totalBatches} 批，任务索引 ${startIdx}-${endIdx - 1}`);

      const batchStartTime = Date.now();

      // 执行当前批次
      const batchPromises = batchRequests.map((executionRequest, index) => {
        const globalIndex = startIdx + index;
        const request = {
          ...executionRequest,
          waitForSlot,
          slotTimeout
        };

        return this.execute(request)
          .then(result => ({ success: true, result, index: globalIndex }))
          .catch(error => {
            console.error(`[ConcurrentExecutor] 任务 ${globalIndex} 执行失败: ${error.message}`);
            return {
              success: false,
              result: {
                success: false,
                taskId: executionRequest.taskId || executionRequest.task?.id || `task_${globalIndex}`,
                error: error.message || 'Execution failed',
                errorCode: error.code || 'UNKNOWN_ERROR',
                modelId: executionRequest.modelId
              },
              index: globalIndex
            };
          });
      });

      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);
      const batchDuration = Date.now() - batchStartTime;

      // 收集结果
      batchResults.forEach(item => {
        allResults[item.index] = item.success ? item.result : item.result;
      });

      completedCount += batchResults.length;
      const successCount = batchResults.filter(r => r.success).length;

      console.log(`[ConcurrentExecutor] 第 ${batchIndex + 1}/${totalBatches} 批完成，耗时 ${batchDuration}ms，成功 ${successCount}/${batchResults.length}，进度 ${completedCount}/${executionRequests.length}`);

      // 【改进】批次间短暂暂停，让槽位有时间释放和重置
      // 如果不是最后一批，短暂等待
      if (batchIndex < totalBatches - 1 && batchDuration < 1000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[ConcurrentExecutor] 分批执行完成，成功: ${allResults.filter(r => r && r.success).length}/${allResults.length}`);
    return allResults;
  }

  /**
   * 【新增 2026-05-05】计算最优批次大小
   * 根据任务分布的模型和可用槽位计算最优并发数
   * @private
   */
  _calculateOptimalBatchSize(executionRequests) {
    // 统计各模型的并发请求数
    const modelRequestCounts = new Map();
    for (const req of executionRequests) {
      const modelId = req.modelId || req.selected_model || 'default';
      modelRequestCounts.set(modelId, (modelRequestCounts.get(modelId) || 0) + 1);
    }

    // 获取各模型的槽位配置
    let minSlots = Infinity;
    for (const [modelId, count] of modelRequestCounts) {
      const maxConc = this.sharedConcurrencyManager.maxConcurrency?.get(modelId) ||
        this.getModelSpecificConfig(modelId)?.concurrency?.maxConcurrent || 10;
      minSlots = Math.min(minSlots, maxConc);
    }

    // 如果无法确定，使用默认值
    if (minSlots === Infinity) {
      minSlots = 10;
    }

    // 批次大小 = 槽位数 * 模型数，但不超过总任务数
    const estimatedBatchSize = Math.min(
      minSlots * modelRequestCounts.size,
      executionRequests.length
    );

    // 限制最大批次大小，避免单批过大
    const maxBatchSize = Math.max(minSlots * 2, 20);
    const finalBatchSize = Math.min(estimatedBatchSize, maxBatchSize);

    console.log(`[ConcurrentExecutor] 计算批次大小：模型数=${modelRequestCounts.size}，最小槽位=${minSlots}，计算值=${estimatedBatchSize}，最终值=${finalBatchSize}`);

    return Math.max(finalBatchSize, 3);  // 最小批次为 3
  }

  /**
   * 批量执行任务（旧接口，保持向后兼容）
   * @param {Array} tasks - 任务列表
   * @param {Array} selectionResults - 选择结果列表
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 执行结果列表
   */
  async batchExecute(tasks, selectionResults, options = {}) {
    console.warn('[ConcurrentExecutor] batchExecute 方法已弃用，请使用 executeBatch 方法');

    // 构建符合规范的 executionRequests
    const executionRequests = tasks.map((task, i) => ({
      task: task,
      prompt: task.prompt || task.content,
      modelId: selectionResults[i].selected_model,
      estimatedCost: selectionResults[i].estimated_cost,
      loadInfo: selectionResults[i].load_info,
      alternatives: selectionResults[i].alternatives,
      taskId: selectionResults[i].task_id || task.id
    }));

    return this.executeBatch(executionRequests, options);
  }

  /**
   * 获取执行统计
   * @returns {Object} 统计信息
   */
  getStatistics() {
    return {
      execution: { ...this.executionStats },
      concurrency: this.sharedConcurrencyManager.getStatistics(),
      rateLimiter: this.rateLimiter.getAllStatus(),
      errors: this.retryManager.getErrorStats(),
      // 功能块 F: 请求追踪与监控统计
      requestTracer: this.requestTracer.getStats(),
      performanceMonitor: this.performanceMonitor.getStats(),
      // 熔断器状态
      circuitBreaker: this.retryManager.circuitBreaker ? this.retryManager.circuitBreaker.getStats() : null
    };
  }

  /**
   * 重置统计
   */
  resetStatistics() {
    this.executionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      totalCost: 0,
      totalTokens: { input: 0, output: 0 }
    };
  }

  /**
   * 获取限流器状态（用于监控）
   */
  getRateLimiterStatus(modelId) {
    if (this.coordinatorRateLimiter) {
      return this.coordinatorRateLimiter.getLimiterStatus(modelId);
    }
    return null;
  }

  /**
   * 根据模型 ID 获取模型特定配置
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型特定配置
   */
  getModelSpecificConfig(modelId) {
    if (this.config) {
      return this.config.getModelConfig(modelId);
    }
    // 如果没有配置对象，返回默认值
    return {
      concurrency: {
        maxConcurrent: 20,
        timeoutMs: 60000
      },
      retry: {
        maxRetries: 3
      },
      rateLimit: {
        requestsPerSecond: 10,
        burstCapacity: 30
      },
      preferred: false
    };
  }

  /**
   * 重新加载配置
   * @param {Object} newConfig - 新配置对象
   */
  async reloadConfig(newConfig) {
    try {
      // 保存旧配置
      const oldConfig = this.config;

      // 更新配置
      if (newConfig instanceof ExecutorConfig) {
        this.config = newConfig;
      } else if (typeof newConfig === 'object') {
        this.config = new ExecutorConfig({ executor: newConfig });
      }

      // 通知相关组件配置更新
      await this._notifyConfigUpdate(oldConfig, this.config);

      console.log('[ConcurrentExecutor] 配置重新加载成功');
      return { success: true, oldConfig, newConfig: this.config };
    } catch (error) {
      console.error('[ConcurrentExecutor] 重新加载配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 热加载配置（不影响正在运行的任务）
   * @param {Object} newRawConfig - 新的原始配置对象
   * @returns {Promise<Object>} 加载结果
   */
  async hotReloadConfig(newRawConfig) {
    try {
      // 1. 创建新配置但暂不激活
      const newConfig = new ExecutorConfig(newRawConfig);

      // 2. 验证新配置的有效性
      newConfig.validate();

      // 3. 保存旧配置
      const oldConfig = this.config;

      // 4. 激活新配置
      this.config = newConfig;

      // 5. 通知相关组件配置更新
      await this._notifyConfigUpdate(oldConfig, newConfig);

      console.log('[ConcurrentExecutor] 配置热加载成功');
      return { success: true, oldConfig, newConfig };
    } catch (error) {
      console.error('[ConcurrentExecutor] 热加载配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 通知相关组件配置更新
   * @param {Object} oldConfig - 旧配置
   * @param {Object} newConfig - 新配置
   * @private
   */
  async _notifyConfigUpdate(oldConfig, newConfig) {
    const processedConfig = newConfig.getProcessedConfig();

    // 通知重试管理器配置更新
    if (this.retryManager) {
      const newRetryConfig = newConfig.getRetryConfig();
      if (typeof this.retryManager.updateConfig === 'function') {
        this.retryManager.updateConfig(newRetryConfig);
      }
    }

    // 通知限流器配置更新
    if (this.rateLimiter && typeof this.rateLimiter.updateConfig === 'function') {
      const newRateLimitConfig = newConfig.getRateLimitConfig();
      this.rateLimiter.updateConfig(newRateLimitConfig);
    }

    // 通知并发控制器配置更新
    if (this.concurrencyController && typeof this.concurrencyController.updateConfig === 'function') {
      const newConcurrencyConfig = newConfig.getConcurrencyConfig();
      this.concurrencyController.updateConfig(newConcurrencyConfig);
    }
  }

  /**
   * 构建请求配置
   * @param {string} modelId - 模型 ID
   * @param {Object} task - 任务对象
   * @param {string} provider - 提供商
   * @returns {Object} 请求配置
   * @private
   */
  _buildRequestConfig(modelId, task, provider) {
    // 使用优化的方法：优先使用 ModelRegistry 中的显式配置
    return this._buildRequestConfigFromModelRegistry(modelId, task);
  }

  /**
   * 获取模型提供商配置
   * @param {string} modelId - 模型ID
   * @returns {Object} 包含baseUrl、apiKeyEnvVar和modelMappings的对象
   * @deprecated 此方法已废弃，现在优先使用 ModelRegistry 中的显式配置
   */
  _getModelProviderConfig(modelId) {
    console.warn('_getModelProviderConfig 已废弃，优先使用 ModelRegistry 中的显式配置');

    // 加载提供商端点配置
    const fs = require('fs');
    const path = require('path');
    const yaml = require('js-yaml');

    let config = {};
    try {
      const configPath = path.join(__dirname, 'config', 'provider-endpoints.yaml');
      if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(configFile);
      } else {
        // 如果没有配置文件，使用默认配置
        config = {
          endpoints: {
            aliyun: "https://dashscope.aliyuncs.com/v1",
            openai: "https://api.openai.com/v1",
            anthropic: "https://api.anthropic.com/v1",
            gemini: "https://generativelanguage.googleapis.com/v1beta",
            deepseek: "https://api.deepseek.com/v1",
            ollama: "http://localhost:11434/api"
          },
          apiKeys: {
            aliyun: "DASHSCOPE_API_KEY",
            openai: "OPENAI_API_KEY",
            anthropic: "ANTHROPIC_API_KEY",
            gemini: "GEMINI_API_KEY",
            google: "GOOGLE_API_KEY",
            deepseek: "DEEPSEEK_API_KEY"
          },
          modelMappings: {}
        };
      }
    } catch (error) {
      console.warn(`加载提供商端点配置失败: ${error.message}`);
      // 使用默认配置
      config = {
        endpoints: {
          aliyun: "https://coding.dashscope.aliyuncs.com/v1",  // Coding Plan
          minimax: "https://coding.dashscope.aliyuncs.com/v1", // Coding Plan (via aliyun)
          moonshot: "https://coding.dashscope.aliyuncs.com/v1", // Coding Plan (via aliyun)
          zhipu: "https://coding.dashscope.aliyuncs.com/v1", // Coding Plan (via aliyun)
          openai: "https://api.openai.com/v1",
          anthropic: "https://api.anthropic.com/v1",
          gemini: "https://generativelanguage.googleapis.com/v1beta",
          deepseek: "https://api.deepseek.com/v1",
          ollama: "http://localhost:11434/api"
        },
        apiKeys: {
          aliyun: "DASHSCOPE_API_KEY",
          minimax: "DASHSCOPE_API_KEY",  // MiniMax via Coding Plan
          moonshot: "DASHSCOPE_API_KEY", // Moonshot via Coding Plan
          zhipu: "DASHSCOPE_API_KEY",   // Zhipu via Coding Plan
          openai: "OPENAI_API_KEY",
          anthropic: "ANTHROPIC_API_KEY",
          gemini: "GEMINI_API_KEY",
          google: "GOOGLE_API_KEY",
          deepseek: "DEEPSEEK_API_KEY"
        },
        modelMappings: {}
      };
    }

    // 根据模型ID推断提供商（回退到硬编码关键字匹配）
    let provider = 'openai'; // 默认提供商

    if (modelId.includes('qwen') || modelId.includes('Qwen')) {
      provider = 'aliyun';
    } else if (modelId.includes('MiniMax')) {
      provider = 'minimax';
    } else if (modelId.includes('kimi') || modelId.includes('Kimi')) {
      provider = 'moonshot';
    } else if (modelId.includes('glm') || modelId.includes('GLM')) {
      provider = 'zhipu';
    } else if (modelId.includes('deepseek')) {
      provider = 'deepseek';
    } else if (modelId.includes('gpt')) {
      provider = 'openai';
    } else if (modelId.includes('claude')) {
      provider = 'anthropic';
    } else if (modelId.includes('gemini')) {
      provider = 'gemini';
    }

    // 获取端点和API密钥
    const baseUrl = config.endpoints[provider] || config.endpoints.openai;
    const apiKeyEnvVar = config.apiKeys[provider] || 'OPENAI_API_KEY';
    const modelMappings = config.modelMappings || {};

    return {
      baseUrl,
      apiKeyEnvVar,
      modelMappings
    };
  }
}

module.exports = { ConcurrentExecutor };