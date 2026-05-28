/**
 * 支持混合式迭代的编排器
 *
 * 集成了所有增强组件的完整编排器实现
 */

const OrchestratorServer = require('./OrchestratorServer');
const OrchestrationFlowEnhancer = require('./integration/OrchestrationFlowEnhancer');
const IterationController = require('./iteration/IterationController');
const EnhancedSessionManager = require('../session/EnhancedSessionManager');
const LevelSwitchManager = require('./iteration/LevelSwitchManager');

class OrchestratorWithHybridIteration extends OrchestratorServer {
  constructor(options = {}) {
    super(options);

    // 从 extensions 配置读取迭代相关配置
    const extensionsConfig = this.config.extensions || {};
    const iterationConfig = extensionsConfig.iteration || {};
    const levelSwitchConfig = extensionsConfig.levelSwitch || {};
    const flowEnhancementConfig = extensionsConfig.flowEnhancement || {};
    const integratorConfig = extensionsConfig.integratorEnhancement || {};
    // 从 decomposer 配置读取分解器增强配置
    const decomposerConfig = this.config.decomposer || {};
    const decomposerEnhancementConfig = decomposerConfig.decomposer_enhancement || {};
    const hybridSemanticConfig = decomposerConfig.hybrid_semantic || {};

    this.options = {
      ...options,
      iteration: {
        enableHybridIteration: options.iteration?.enableHybridIteration ?? iterationConfig.enableHybridIteration ?? true,
        maxIterations: options.iteration?.maxIterations || iterationConfig.maxIterations || 10,
        minQualityScore: options.iteration?.minQualityScore || iterationConfig.minQualityScore || 0.8,
        maxTimeMs: options.iteration?.maxTimeMs || iterationConfig.maxTimeMs || 1800000, // 30分钟
        enableDegradationMode: options.iteration?.enableDegradationMode ?? true, // 启用降级模式
        degradationThreshold: options.iteration?.degradationThreshold || 0.2, // 降级阈值
        ...iterationConfig,
        ...options.iteration
      },
      levelSwitch: {
        ...levelSwitchConfig,
        ...options.levelSwitch
      },
      flowEnhancement: {
        ...flowEnhancementConfig,
        ...options.flowEnhancement
      },
      integrator: {
        ...integratorConfig,
        ...options.integrator
      },
      decomposition: {
        ...decomposerEnhancementConfig,
        ...options.decomposition
      }
    };

    // 初始化降级模式标识
    this.degradedMode = false;

    // 初始化增强组件
    if (this.options.iteration.enableHybridIteration) {
      try {
        this.sessionManager = new EnhancedSessionManager(null, null, options.session || {});
        this.flowEnhancer = new OrchestrationFlowEnhancer({
          ...flowEnhancementConfig,
          execution: options.execution || flowEnhancementConfig.executionEnhancement || {},
          integration: options.integration || integratorConfig,
          decomposition: this.options.decomposition
        });

        this.iterationController = new IterationController(this.options.iteration);
        this.levelSwitchManager = new LevelSwitchManager(this.options.levelSwitch);
      } catch (error) {
        console.warn('初始化增强组件失败，启用降级模式:', error.message);
        this.degradedMode = true;

        // 在降级模式下，仍需初始化基础会话管理器
        try {
          this.sessionManager = new EnhancedSessionManager(null, null, options.session || {});
        } catch (sessionError) {
          console.warn('会话管理器初始化也失败:', sessionError.message);
        }

        // 在降级模式下，仅使用基本功能
        if (this.options.iteration.enableDegradationMode) {
          console.log('已在降级模式下运行');
        } else {
          throw error; // 如果不允许降级，则抛出错误
        }
      }
    } else {
      // 如果不启用混合迭代，则只初始化会话管理器
      this.sessionManager = new EnhancedSessionManager(null, null, options.session || {});
    }
  }

  /**
   * 重写处理请求的方法，加入混合式迭代支持
   */
  async handleOrchestrationRequest(req, res) {
    try {
      const { messages, options = {} } = req.body;
      const requestId = req.headers['x-request-id'] || Date.now().toString();

      // 验证输入
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: 'Invalid input: messages array is required and cannot be empty'
        });
      }

      // 检查是否启用混合迭代
      const enableIteration = options.enableIteration ?? this.options.iteration.enableHybridIteration;

      if (enableIteration) {
        // 使用混合迭代处理
        const result = await this.handleIterativeOrchestration(messages, options, requestId);
        res.json(result);
      } else {
        // 使用原有方式处理
        return super.handleOrchestrationRequest(req, res);
      }
    } catch (error) {
      console.error('处理编排请求时出错:', error);

      // 更好的错误处理
      const errorResponse = {
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      };

      // 在开发环境中返回堆栈跟踪
      if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = error.stack;
      }

      res.status(error.statusCode || 500).json(errorResponse);
    }
  }

  /**
   * 处理迭代式编排
   */
  async handleIterativeOrchestration(messages, options, requestId) {
    console.log(`开始迭代式编排，请求ID: ${requestId}`);
    console.log(`消息数量: ${messages.length}, 会话降级模式: ${this.degradedMode}`);

    // 创建会话
    if (!this.sessionManager || typeof this.sessionManager.createSession !== 'function') {
      throw new Error('Session manager is not properly initialized');
    }

    const session = await this.sessionManager.createSession(
      messages[messages.length - 1]?.content || 'Unknown task',
      options.userId,
      options.projectId
    );

    const context = {
      sessionId: session.sessionId,
      requestId,
      messages,
      options,
      startTime: Date.now()
    };

    try {
      // 检查是否启用了降级模式
      if (this.degradedMode) {
        console.warn(`[${requestId}] 系统处于降级模式，使用简化处理`);
        // 在降级模式下，使用简化的处理流程
        return await this.handleInDegradedMode(messages, options, context);
      }

      // 检查是否所有必需组件都已初始化
      if (!this.iterationController || !this.flowEnhancer || !this.levelSwitchManager) {
        console.warn(`[${requestId}] 组件未完全初始化，使用降级模式`);
        return await this.handleInDegradedMode(messages, options, context);
      }

      // 使用迭代控制器执行迭代流程
      console.log(`[${requestId}] 正在执行迭代流程`);
      const iterationResult = await this.iterationController.executeIteration(
        { messages, options },
        context
      );
      console.log(`[${requestId}] 迭代流程完成，结果: ${iterationResult.success}`);

      // 记录迭代结果到会话
      if (this.sessionManager && typeof this.sessionManager.recordIteration === 'function') {
        await this.sessionManager.recordIteration(session.sessionId, {
          level: iterationResult.level || 'L1', // 使用实际的迭代层级
          input: { messages, options },
          output: iterationResult.finalResult || iterationResult,
          qualityScore: iterationResult.finalResult?.qualityScore || iterationResult.qualityScore || 0.8,
          success: iterationResult.success,
          duration: Date.now() - context.startTime,
          timestamp: new Date().toISOString(),
          iterationCount: iterationResult.iterationCount || 1
        });
      }

      // 返回迭代结果
      const result = {
        success: true,
        iterationResult,
        sessionId: session.sessionId,
        totalDuration: Date.now() - context.startTime,
        degradedMode: this.degradedMode,
        ...iterationResult
      };

      console.log(`[${requestId}] 迭代式编排完成，总耗时: ${result.totalDuration}ms`);
      return result;

    } catch (error) {
      console.error(`[${requestId}] 迭代式编排失败:`, error);
      console.error(`[${requestId}] 错误详情: ${error.message}, 降级模式: ${this.degradedMode}`);

      // 检查错误类型以决定是否触发降级
      if (this.shouldTriggerDegradation(error)) {
        this.degradedMode = true;
        console.warn(`[${requestId}] 触发降级模式`);
      }

      // 记录失败的迭代
      try {
        if (this.sessionManager && typeof this.sessionManager.recordIteration === 'function') {
          await this.sessionManager.recordIteration(session.sessionId, {
            level: 'ERROR',
            input: { messages, options },
            output: { error: error.message },
            qualityScore: 0,
            success: false,
            error: error.message,
            duration: Date.now() - context.startTime,
            timestamp: new Date().toISOString()
          });
        }
      } catch (recordError) {
        console.error(`[${requestId}] 记录迭代失败时出错:`, recordError);
      }

      throw error;
    }
  }

  /**
   * 在降级模式下处理请求
   */
  async handleInDegradedMode(messages, options, context) {
    console.log(`[${context.requestId}] 执行降级模式处理`);

    try {
      // 使用简化流程处理
      const simplifiedResult = {
        success: true,
        finalResult: {
          content: "系统当前处于降级模式，正在执行简化处理",
          qualityScore: 0.5, // 降级模式下的分数
          degraded: true
        },
        level: 'DEGRADED',
        iterationCount: 1
      };

      // 检查sessionManager是否存在再记录
      if (this.sessionManager && typeof this.sessionManager.recordIteration === 'function') {
        try {
          await this.sessionManager.recordIteration(context.sessionId, {
            level: 'DEGRADED',
            input: { messages, options },
            output: simplifiedResult.finalResult,
            qualityScore: simplifiedResult.finalResult.qualityScore,
            success: simplifiedResult.success,
            duration: Date.now() - context.startTime,
            timestamp: new Date().toISOString(),
            degraded: true
          });
        } catch (recordError) {
          console.warn(`[${context.requestId}] 记录降级模式结果时出错:`, recordError.message);
        }
      } else {
        console.warn(`[${context.requestId}] 会话管理器未初始化，跳过记录`);
      }

      return {
        ...simplifiedResult,
        sessionId: context.sessionId,
        totalDuration: Date.now() - context.startTime,
        degradedMode: true
      };
    } catch (error) {
      console.error(`[${context.requestId}] 降级模式处理也失败:`, error);

      // 构建最简响应以避免完全失败
      return {
        success: false,
        error: error.message,
        level: 'DEGRADED_ERROR',
        sessionId: context.sessionId,
        totalDuration: Date.now() - context.startTime,
        degradedMode: true
      };
    }
  }

  /**
   * 判断是否应该触发降级
   */
  shouldTriggerDegradation(error) {
    const degradationTriggers = [
      'ENOTFOUND',           // 网络错误
      'ECONNREFUSED',        // 连接拒绝
      'ECONNRESET',          // 连接重置
      'ETIMEDOUT',           // 超时
      'EMFILE',              // 文件句柄耗尽
      'ENOSPC',              // 磁盘空间不足
      'ENOMEM',              // 内存不足
      'Max retries exceeded' // 重试次数超限
    ];

    return degradationTriggers.some(trigger =>
      error.message && error.message.includes(trigger)
    );
  }

  /**
   * 获取会话状态
   */
  async getSessionStatus(sessionId) {
    const stats = await this.sessionManager.getSessionStats(sessionId);
    const history = await this.sessionManager.getIterationHistory(sessionId, { limit: 5 });

    return {
      sessionId,
      stats,
      recentHistory: history,
      currentIterationInfo: await this.sessionManager.getCurrentIterationInfo(sessionId)
    };
  }

  /**
   * 获取迭代统计数据
   */
  getIterationStats() {
    return {
      ...this.iterationController.getIterationStats(),
      sessionCount: this.sessionManager.getStatistics
        ? this.sessionManager.getStatistics().then(stats => stats.totalSessions).catch(() => 0)
        : 0
    };
  }

  /**
   * 启动服务器，集成混合迭代功能
   */
  async start() {
    // 添加新的API端点
    this.app.post('/v1/orchestrate-iterative', async (req, res) => {
      await this.handleIterativeOrchestrationRequest(req, res);
    });

    this.app.get('/v1/iteration-status/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const status = await this.getSessionStatus(sessionId);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 调用父类的启动方法
    await super.start();

    console.log('已启动支持混合式迭代的编排器');
    console.log(`服务器运行在端口: ${this.options.port}`);
    console.log(`混合迭代功能: ${this.options.iteration.enableHybridIteration ? '开启' : '关闭'}`);
  }

  /**
   * 处理迭代式编排请求的新端点
   */
  async handleIterativeOrchestrationRequest(req, res) {
    try {
      const { messages, options = {} } = req.body;
      const requestId = req.headers['x-request-id'] || Date.now().toString();

      const result = await this.handleIterativeOrchestration(messages, options, requestId);
      res.json(result);
    } catch (error) {
      console.error('处理迭代式编排请求时出错:', error);
      res.status(500).json({
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = OrchestratorWithHybridIteration;