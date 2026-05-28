/**
 * 编排流程增强集成器
 *
 * 将所有增强组件集成到编排流程中
 */

const ExecutorEnhancer = require('../execution/ExecutorEnhancer');
const IntegratorEnhancer = require('../integration/IntegratorEnhancer');
const DecomposerEnhancer = require('../../decomposer/enhancement/DecomposerEnhancer');

class OrchestrationFlowEnhancer {
  constructor(config = {}) {
    this.executorEnhancer = new ExecutorEnhancer(config.execution || {});
    this.integratorEnhancer = new IntegratorEnhancer(config.integration || {});
    this.decomposerEnhancer = new DecomposerEnhancer(config.decomposition || {});

    this.config = {
      enableExecutionEnhancement: config.enableExecutionEnhancement ?? true,
      enableIntegrationEnhancement: config.enableIntegrationEnhancement ?? true,
      enableDecompositionEnhancement: config.enableDecompositionEnhancement ?? true,
      ...config
    };
  }

  /**
   * 增强的完整编排流程
   */
  async enhancedOrchestrate(request, context = {}) {
    try {
      // 1. 增强分解阶段
      let decompositionResult;
      if (this.config.enableDecompositionEnhancement) {
        console.log('执行增强分解...');
        decompositionResult = await this.decomposerEnhancer.decomposeWithEnhancements(request);
      } else {
        // 使用原有分解逻辑
        decompositionResult = await this.fallbackDecomposition(request);
      }

      // 2. 增强执行阶段
      let executionResults = [];
      if (this.config.enableExecutionEnhancement) {
        console.log('执行增强执行...');
        executionResults = await this.executeEnhancedSubtasks(decompositionResult.subtasks);
      } else {
        // 使用原有执行逻辑
        executionResults = await this.fallbackExecution(decompositionResult.subtasks);
      }

      // 3. 增强整合阶段
      let integrationResult;
      if (this.config.enableIntegrationEnhancement) {
        console.log('执行增强整合...');
        integrationResult = await this.integratorEnhancer.integrateWithEnhancements(
          executionResults,
          {
            ...context,
            projectName: decompositionResult.title || 'Generated Project'
          }
        );
      } else {
        // 使用原有整合逻辑
        integrationResult = await this.fallbackIntegration(executionResults, context);
      }

      return {
        success: true,
        decomposition: decompositionResult,
        execution: executionResults,
        integration: integrationResult,
        enhanced: true,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('增强编排流程执行失败:', error);

      // 返回错误信息，但仍尝试提供部分结果
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        enhanced: true,
        timestamp: new Date()
      };
    }
  }

  /**
   * 执行增强的子任务
   */
  async executeEnhancedSubtasks(subtasks) {
    const results = [];

    for (const subtask of subtasks) {
      try {
        console.log(`执行子任务: ${subtask.description || subtask.id}`);

        // 使用增强执行器执行任务
        const result = await this.executorEnhancer.executeWithEnhancements(
          subtask,
          {
            prompt: subtask.prompt || subtask.description,
            max_tokens: subtask.estimatedTokens || 32000
          }
        );

        results.push({
          ...result,
          taskId: subtask.id,
          originalSubtask: subtask
        });

      } catch (error) {
        console.error(`子任务执行失败 ${subtask.id}:`, error.message);

        // 记录错误但继续处理其他子任务
        results.push({
          taskId: subtask.id,
          originalSubtask: subtask,
          error: error.message,
          success: false,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * 回退分解方法
   */
  async fallbackDecomposition(request) {
    // 简单的回退分解逻辑
    return {
      originalRequest: request,
      subtasks: [{
        id: 'fallback-task',
        description: request.messages?.[0]?.content || request.description || 'Generated task',
        type: 'generic',
        priority: 'MEDIUM'
      }],
      complexity: { score: 1000, level: 'MEDIUM' }
    };
  }

  /**
   * 回退执行方法
   */
  async fallbackExecution(subtasks) {
    const results = [];

    for (const subtask of subtasks) {
      results.push({
        taskId: subtask.id,
        content: `// Generated content for ${subtask.description}\n// This is a placeholder implementation`,
        success: true,
        timestamp: new Date()
      });
    }

    return results;
  }

  /**
   * 回退整合方法
   */
  async fallbackIntegration(executionResults, context) {
    const files = {};

    for (const result of executionResults) {
      if (result.success && result.content) {
        const fileName = result.taskId || `task_${Date.now()}`;
        files[`${fileName}.js`] = {
          content: result.content,
          timestamp: new Date()
        };
      }
    }

    return {
      files,
      status: 'PARTIAL_SUCCESS',
      generatedFiles: Object.keys(files).length
    };
  }

  /**
   * 获取增强状态
   */
  getStatus() {
    return {
      executionEnhanced: this.config.enableExecutionEnhancement,
      integrationEnhanced: this.config.enableIntegrationEnhancement,
      decompositionEnhanced: this.config.enableDecompositionEnhancement,
      components: {
        executor: this.executorEnhancer ? 'READY' : 'NOT_LOADED',
        integrator: this.integratorEnhancer ? 'READY' : 'NOT_LOADED',
        decomposer: this.decomposerEnhancer ? 'READY' : 'NOT_LOADED'
      }
    };
  }
}

module.exports = OrchestrationFlowEnhancer;