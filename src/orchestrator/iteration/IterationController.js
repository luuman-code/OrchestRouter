/**
 * 迭代控制器
 *
 * 管理 L1/L2/L3 层级迭代流程
 */

class IterationController {
  constructor(config = {}) {
    this.config = {
      maxIterations: config.maxIterations || 8,        // 减少最大迭代次数
      minQualityScore: config.minQualityScore || 0.75, // 稍微降低最低质量分数
      maxTimeMs: config.maxTimeMs || 1200000,          // 减少最大时间到20分钟
      enableHybridIteration: config.enableHybridIteration ?? true,
      l1MaxRetries: config.l1MaxRetries || 2,         // 减少L1重试次数
      l2MaxIterations: config.l2MaxIterations || 3,    // 减少L2迭代次数
      l3MaxIterations: config.l3MaxIterations || 5,    // 减少L3迭代次数
      levelSwitchThreshold: config.levelSwitchThreshold || 0.35, // 稍微提高切换阈值
      earlyTerminationEnabled: config.earlyTerminationEnabled ?? true, // 启用早期终止
      maxHistorySize: config.maxHistorySize || 100, // 【修复】限制历史记录最大条目数
      historyTtlMs: config.historyTtlMs || 3600000,  // 【修复】历史记录保留时间（1小时）
      ...config
    };

    this.iterationHistory = new Map();
  }

  /**
   * 清理过期的历史记录
   * @private
   */
  _cleanupHistory() {
    if (this.iterationHistory.size === 0) return;

    const now = Date.now();
    const ttl = this.config.historyTtlMs;
    const maxSize = this.config.maxHistorySize;

    // 1. 清理过期记录
    for (const [id, record] of this.iterationHistory.entries()) {
      if (now - record.timestamp.getTime() > ttl) {
        this.iterationHistory.delete(id);
      }
    }

    // 2. 如果仍然超过最大限制，删除最旧的记录
    if (this.iterationHistory.size > maxSize) {
      const sortedEntries = [...this.iterationHistory.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toDelete = this.iterationHistory.size - maxSize;
      for (let i = 0; i < toDelete; i++) {
        this.iterationHistory.delete(sortedEntries[i][0]);
      }
    }
  }

  /**
   * 执行迭代流程
   */
  async executeIteration(initialRequest, context = {}) {
    const startTime = Date.now();
    let currentRequest = initialRequest;
    let currentContext = { ...context, iterationCount: 0 };
    let iterationResults = [];

    // 首先尝试 L1 快速修复
    if (this.config.enableHybridIteration) {
      const l1Result = await this.executeL1Iteration(currentRequest, currentContext);

      // 【修复】检查 L1 是否成功完成，只有成功完成或需要继续到 L2 时才处理
      const shouldProcessL1Result = (l1Result.completed && l1Result.success) || this.shouldContinueToL2(l1Result);
      if (shouldProcessL1Result) {
        currentRequest = l1Result.updatedRequest || currentRequest;
        currentContext = { ...currentContext, ...l1Result.context };
        iterationResults.push({ level: 'L1', ...l1Result });
      }
    }

    // 根据需要执行 L2 或 L3 迭代
    let finalResult;
    if (this.shouldProceedToL2(currentRequest, currentContext)) {
      const l2Result = await this.executeL2Iteration(currentRequest, currentContext);
      finalResult = l2Result;
      iterationResults.push({ level: 'L2', ...l2Result });
    } else if (this.shouldProceedToL3(currentRequest, currentContext)) {
      const l3Result = await this.executeL3Iteration(currentRequest, currentContext);
      finalResult = l3Result;
      iterationResults.push({ level: 'L3', ...l3Result });
    } else {
      finalResult = { success: true, completed: true, output: currentRequest };
    }

    // 记录迭代历史（先清理过期的）
    this._cleanupHistory();
    const iterationId = this.generateIterationId();
    this.iterationHistory.set(iterationId, {
      id: iterationId,
      initialRequest,
      finalResult,
      iterationResults,
      totalTime: Date.now() - startTime,
      timestamp: new Date()
    });

    return {
      success: finalResult.success,
      iterationId,
      finalResult,
      iterationResults,
      totalIterations: iterationResults.length,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * 执行 L1 迭代（快速修复）
   */
  async executeL1Iteration(request, context) {
    console.log('执行 L1 快速修复迭代...');

    // 使用快速修复处理器
    const QuickFixProcessor = require('../fix/QuickFixProcessor');
    const quickFixProcessor = new QuickFixProcessor();

    try {
      // 分析当前状态并识别需要修复的问题
      const problems = this.analyzeCurrentState(context.currentOutput || request);

      if (problems.length === 0) {
        return {
          completed: true,
          success: true,
          message: '无需修复，当前状态良好',
          output: request
        };
      }

      // 对识别出的问题执行快速修复
      let currentRequest = request;
      let currentContext = { ...context };
      let fixCount = 0;

      for (const problem of problems) {
        if (fixCount >= this.config.l1MaxRetries) {
          break; // 达到最大修复次数
        }

        const fixResult = await quickFixProcessor.executeFix(problem, currentContext);

        if (fixResult.success) {
          fixCount++;
          currentRequest = this.updateRequestWithFix(currentRequest, fixResult.appliedFix);
          currentContext.lastFix = fixResult;
        } else {
          console.warn(`L1 修复失败: ${fixResult.error}`);
          break; // 修复失败，停止 L1 迭代
        }
      }

      return {
        completed: true,
        success: fixCount > 0,
        fixCount,
        updatedRequest: currentRequest,
        context: currentContext,
        message: `L1 迭代完成，执行了 ${fixCount} 次修复`
      };

    } catch (error) {
      console.error('L1 迭代执行失败:', error);
      return {
        completed: false,
        success: false,
        error: error.message,
        message: 'L1 迭代执行失败'
      };
    }
  }

  /**
   * 执行 L2 迭代（局部改进）
   */
  async executeL2Iteration(request, context) {
    console.log('执行 L2 局部改进迭代...');

    let currentRequest = request;
    let currentContext = { ...context, iteration: 0 };
    let iterationCount = 0;

    while (iterationCount < this.config.l2MaxIterations) {
      iterationCount++;
      currentContext.iteration = iterationCount;

      try {
        // 执行单次 L2 迭代
        const iterationResult = await this.executeSingleL2Iteration(currentRequest, currentContext);

        if (iterationResult.completed) {
          return {
            completed: true,
            success: iterationResult.success,
            iterationCount,
            finalOutput: iterationResult.output,
            message: `L2 迭代成功完成，共 ${iterationCount} 次迭代`
          };
        }

        // 更新请求和上下文
        currentRequest = iterationResult.updatedRequest || currentRequest;
        currentContext = { ...currentContext, ...iterationResult.context };

        // 检查是否达到质量要求
        const qualityCheck = await this.checkQuality(currentRequest, currentContext);
        if (qualityCheck.score >= this.config.minQualityScore) {
          return {
            completed: true,
            success: true,
            iterationCount,
            finalOutput: currentRequest,
            qualityScore: qualityCheck.score,
            message: `L2 迭代达到质量要求，共 ${iterationCount} 次迭代`
          };
        }

      } catch (error) {
        console.error(`L2 迭代第 ${iterationCount} 次执行失败:`, error);
        return {
          completed: false,
          success: false,
          iterationCount,
          error: error.message,
          message: `L2 迭代第 ${iterationCount} 次执行失败`
        };
      }
    }

    return {
      completed: true,
      success: false, // 达到最大迭代次数仍未满足质量要求
      iterationCount,
      finalOutput: currentRequest,
      message: `L2 迭代达到最大次数 ${this.config.l2MaxIterations}，未达到质量要求`
    };
  }

  /**
   * 执行 L3 迭代（完整迭代）
   */
  async executeL3Iteration(request, context) {
    console.log('执行 L3 完整迭代...');

    let currentRequest = request;
    let currentContext = { ...context, iteration: 0 };
    let iterationCount = 0;

    while (iterationCount < this.config.l3MaxIterations) {
      iterationCount++;
      currentContext.iteration = iterationCount;

      try {
        // 执行单次 L3 迭代
        const iterationResult = await this.executeSingleL3Iteration(currentRequest, currentContext);

        if (iterationResult.completed) {
          return {
            completed: true,
            success: iterationResult.success,
            iterationCount,
            finalOutput: iterationResult.output,
            message: `L3 迭代成功完成，共 ${iterationCount} 次迭代`
          };
        }

        // 更新请求和上下文
        currentRequest = iterationResult.updatedRequest || currentRequest;
        currentContext = { ...currentContext, ...iterationResult.context };

        // 检查是否达到质量要求
        const qualityCheck = await this.checkQuality(currentRequest, currentContext);
        if (qualityCheck.score >= this.config.minQualityScore) {
          return {
            completed: true,
            success: true,
            iterationCount,
            finalOutput: currentRequest,
            qualityScore: qualityCheck.score,
            message: `L3 迭代达到质量要求，共 ${iterationCount} 次迭代`
          };
        }

      } catch (error) {
        console.error(`L3 迭代第 ${iterationCount} 次执行失败:`, error);
        return {
          completed: false,
          success: false,
          iterationCount,
          error: error.message,
          message: `L3 迭代第 ${iterationCount} 次执行失败`
        };
      }
    }

    return {
      completed: true,
      success: false, // 达到最大迭代次数仍未满足质量要求
      iterationCount,
      finalOutput: currentRequest,
      message: `L3 迭代达到最大次数 ${this.config.l3MaxIterations}，未达到质量要求`
    };
  }

  /**
   * 执行单次 L2 迭代
   */
  async executeSingleL2Iteration(request, context) {
    // 在 L2 中，我们只针对特定模块或功能进行改进
    console.log('执行单次 L2 迭代...');

    // 这里可以集成现有的编排流程，但专注于局部改进
    const OrchestrationFlowEnhancer = require('../integration/OrchestrationFlowEnhancer');
    const flowEnhancer = new OrchestrationFlowEnhancer();

    // 确定需要改进的特定模块
    const targetedModules = this.identifyTargetedModules(request, context);

    // 修改请求以仅关注特定模块
    const targetedRequest = this.createTargetedRequest(request, targetedModules);

    const result = await flowEnhancer.enhancedOrchestrate(targetedRequest, context);

    return {
      completed: result.success,
      success: result.success,
      updatedRequest: result,
      context: { ...context, lastL2Result: result },
      output: result.integration?.files || {}
    };
  }

  /**
   * 执行单次 L3 迭代
   */
  async executeSingleL3Iteration(request, context) {
    // 在 L3 中，我们执行完整的重构或重新规划
    console.log('执行单次 L3 迭代...');

    // 使用重新规划器重新规划任务
    const Replanner = require('../planning/Replanner');
    const replanner = new Replanner();

    // 分析当前实现的问题
    const analysis = await this.analyzeCurrentImplementation(request, context);

    // 根据分析结果重新规划任务
    const revisedPlan = await replanner.revisePlan(request, analysis);

    // 使用修订后的计划执行完整编排
    const OrchestrationFlowEnhancer = require('../integration/OrchestrationFlowEnhancer');
    const flowEnhancer = new OrchestrationFlowEnhancer();

    const result = await flowEnhancer.enhancedOrchestrate(revisedPlan, context);

    return {
      completed: result.success,
      success: result.success,
      updatedRequest: result,
      context: { ...context, lastL3Result: result },
      output: result.integration?.files || {}
    };
  }

  /**
   * 分析当前状态以识别问题
   */
  analyzeCurrentState(currentOutput) {
    // 这里应该实现具体的分析逻辑
    // 返回问题数组，每个问题包含类型、严重性、位置等信息
    const problems = [];

    // 示例：检查常见问题
    if (currentOutput) {
      if (typeof currentOutput === 'object') {
        // 检查输出中的错误或不完整部分
        for (const [key, value] of Object.entries(currentOutput)) {
          if (value && typeof value === 'string') {
            // 检查是否包含错误信息
            if (value.toLowerCase().includes('error') || value.includes('// TODO:') || value.includes('FIXME')) {
              problems.push({
                type: 'INCOMPLETE_IMPLEMENTATION',
                severity: 'MEDIUM',
                location: key,
                description: `在 ${key} 中发现待办事项或错误`,
                message: '发现不完整实现'
              });
            }
          }
        }
      }
    }

    return problems;
  }

  /**
   * 检查质量
   */
  async checkQuality(output, context) {
    // 这里应该集成质量门控
    const QualityGate = require('../quality/QualityGate');
    const qualityGate = new QualityGate();

    const qualityResult = await qualityGate.evaluate(output, context);

    return {
      score: qualityResult.overallScore,
      details: qualityResult.details,
      passed: qualityResult.passed
    };
  }

  /**
   * 确定是否应继续到 L2
   */
  shouldContinueToL2(l1Result) {
    // 如果 L1 没有完全解决问题，或者质量仍然较低，则继续到 L2
    if (!l1Result.completed) return true;

    // 【修复】如果 L1 已完成但失败，需要继续到 L2
    if (l1Result.completed && !l1Result.success) return true;

    // 检查质量分数
    if (l1Result.qualityScore && l1Result.qualityScore < this.config.minQualityScore) {
      return true;
    }

    // 检查是否有严重错误或问题
    if (l1Result.hasCriticalErrors || l1Result.errorCount > 2) {
      return true;
    }

    // 检查迭代历史，避免无限循环
    if (l1Result.iterationCount > this.config.l1MaxRetries) {
      return true; // 转移到L2进行更深入的处理
    }

    return false;
  }

  /**
   * 确定是否应进行 L2
   */
  shouldProceedToL2(request, context) {
    // 如果 L1 已经解决了问题，或者问题比较复杂需要更深度的处理，则进入 L2
    return !context.l1Success || context.requiresDeepImprovement;
  }

  /**
   * 确定是否应进行 L3
   */
  shouldProceedToL3(request, context) {
    // 如果 L1 和 L2 都未能解决问题，或者遇到架构级问题，则进入 L3
    if (context.requiresCompleteRedesign || context.architectureIssues) {
      return true;
    }

    // 检查是否达到了早期终止条件
    if (this.config.earlyTerminationEnabled) {
      // 检查质量改善趋势
      if (context.qualityImprovementTrend && context.qualityImprovementTrend < 0) {
        // 如果质量分数持续下降，考虑提前终止或转移到更高层级
        return true;
      }

      // 检查时间和资源消耗
      const currentTime = Date.now();
      if (context.startTime && (currentTime - context.startTime) > (this.config.maxTimeMs * 0.8)) {
        // 如果接近时间限制但仍有问题，考虑进入L3一次性解决
        return true;
      }
    }

    return false;
  }

  /**
   * 识别目标模块
   */
  identifyTargetedModules(request, context) {
    // 根据请求和上下文信息识别需要重点改进的模块
    const modules = [];

    // 示例逻辑：根据错误信息或质量检查结果确定目标模块
    if (context.lastQualityCheck && context.lastQualityCheck.failedModules) {
      modules.push(...context.lastQualityCheck.failedModules);
    }

    // 如果没有特定的目标模块，可以选择一些常见模块
    if (modules.length === 0) {
      modules.push('frontend', 'backend', 'database');
    }

    return [...new Set(modules)]; // 去重
  }

  /**
   * 创建目标请求
   */
  createTargetedRequest(originalRequest, targetedModules) {
    // 创建仅关注特定模块的请求
    const targetedRequest = { ...originalRequest };

    if (targetedRequest.messages && targetedRequest.messages.length > 0) {
      const lastMessage = targetedRequest.messages[targetedRequest.messages.length - 1];
      const moduleList = targetedModules.join(', ');

      // 修改最后一条消息以聚焦于特定模块
      targetedRequest.messages[targetedRequest.messages.length - 1] = {
        ...lastMessage,
        content: `${lastMessage.content}

重要提醒：本次迭代请重点关注以下模块的改进：${moduleList}。
请优化这些模块的实现，修复已知问题，并提高代码质量。`
      };
    }

    return targetedRequest;
  }

  /**
   * 更新请求与修复
   */
  updateRequestWithFix(originalRequest, fixResult) {
    // 将修复结果应用到原始请求
    // 这里需要根据具体格式实现更新逻辑
    const updatedRequest = { ...originalRequest };

    if (fixResult.appliedFiles) {
      // 如果修复涉及文件修改，在上下文中记录
      updatedRequest.context = {
        ...updatedRequest.context,
        lastAppliedFixes: fixResult.appliedFiles
      };
    }

    return updatedRequest;
  }

  /**
   * 分析当前实现
   */
  async analyzeCurrentImplementation(request, context) {
    // 实现对当前实现的分析
    return {
      issues: [],
      recommendations: [],
      architectureProblems: [],
      performanceBottlenecks: []
    };
  }

  /**
   * 生成迭代ID
   */
  generateIterationId() {
    return `iter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取迭代统计
   */
  getIterationStats() {
    let totalIterations = 0;
    let successfulIterations = 0;
    let avgTime = 0;

    for (const [, record] of this.iterationHistory.entries()) {
      totalIterations++;
      if (record.finalResult.success) {
        successfulIterations++;
      }
      avgTime += record.totalTime;
    }

    avgTime = totalIterations > 0 ? avgTime / totalIterations : 0;

    return {
      totalIterations,
      successfulIterations,
      successRate: totalIterations > 0 ? successfulIterations / totalIterations : 0,
      avgTime,
      historySize: this.iterationHistory.size
    };
  }
}

module.exports = IterationController;