/**
 * 代码修复API模块
 * 处理云端API调用以修复复杂代码错误
 */

const { ConcurrentExecutor } = require('../executor/ConcurrentExecutor');

class CodeRepairAPI {
  constructor(options = {}) {
    this.options = {
      defaultModel: options.defaultModel || 'claude-3-5-sonnet-20240620',
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      batchSize: options.batchSize || 1,
      ...options
    };

    // 初始化执行器
    this.executor = new ConcurrentExecutor({
      retryConfig: {
        maxRetries: this.options.maxRetries,
        baseDelay: 1000,
        exponentialBase: 2.0,
        jitter: true
      },
      rateLimitConfig: {
        defaultRps: 10,
        burstCapacity: 30
      },
      ...options.executorConfig
    });
  }

  /**
   * 修复代码错误
   * @param {string} originalCode - 原始代码
   * @param {Array} errors - 错误列表
   * @param {Object} context - 修复上下文
   * @returns {Promise<Object>} 修复结果
   */
  async repairCode(originalCode, errors, context = {}) {
    try {
      // 构建修复请求
      const repairRequest = this._buildRepairRequest(originalCode, errors, context);

      // 生成修复提示
      const repairPrompt = this._generateRepairPrompt(originalCode, errors, context);

      // 执行修复请求
      const result = await this._executeRepairRequest(repairPrompt, context);

      if (result.success) {
        return {
          success: true,
          fixedCode: result.response || result.code,
          originalCode,
          errors,
          repairPrompt,
          provider: result.provider || 'unknown',
          modelUsed: result.model_used || this.options.defaultModel,
          cost: result.cost || 0,
          tokens: result.tokens || { input: 0, output: 0 },
          executionTime: result.duration_ms
        };
      } else {
        return {
          success: false,
          error: result.error || 'Repair request failed',
          originalCode,
          errors,
          repairPrompt,
          provider: result.provider || 'unknown',
          modelUsed: result.model_used || this.options.defaultModel
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        originalCode,
        errors,
        errorMessage: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * 批量修复代码错误
   * @param {Array} repairTasks - 修复任务数组
   * @returns {Promise<Array>} 修复结果数组
   */
  async batchRepair(repairTasks) {
    const results = [];

    for (const task of repairTasks) {
      const result = await this.repairCode(task.originalCode, task.errors, task.context);
      results.push(result);
    }

    return results;
  }

  /**
   * 构建修复请求
   * @private
   */
  _buildRepairRequest(originalCode, errors, context) {
    return {
      originalCode,
      errors,
      context,
      timestamp: new Date().toISOString(),
      model: context.model || this.options.defaultModel,
      priority: context.priority || 'normal'
    };
  }

  /**
   * 生成修复提示
   * @private
   */
  _generateRepairPrompt(originalCode, errors, context = {}) {
    const errorList = errors.map((error, index) => {
      return `${index + 1}. ${typeof error === 'string' ? error : error.message || JSON.stringify(error)}`;
    }).join('\n');

    const promptTemplate = `你是一个专业的代码修复专家。请仔细分析以下代码并修复其中的所有错误。

## 原始代码
\`\`\`javascript
${originalCode}
\`\`\`

## 检测到的错误
${errorList}

## 修复要求
${context.requirements || '请修复所有错误，保持原有功能不变，返回完整的修复后代码。'}

## 注意事项
1. 保持原有的代码逻辑和功能
2. 只修复报告的错误，不要过度修改
3. 确保修复后的代码可以通过验证
4. 返回完整的修复后代码，而不是代码片段
5. 如有必要，添加适当的注释说明修复内容

请直接提供修复后的完整代码，不要包含其他解释。`;

    return {
      prompt: promptTemplate,
      model: context.model || this.options.defaultModel,
      max_tokens: context.maxTokens || 4000,
      temperature: context.temperature || 0.1
    };
  }

  /**
   * 执行修复请求
   * @private
   */
  async _executeRepairRequest(prompt, context) {
    try {
      // 准备执行请求
      const executionRequest = {
        task: {
          description: prompt.prompt,
          priority: context.priority || 'normal'
        },
        modelId: prompt.model,
        prompt: prompt.prompt,
        traceId: `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        taskId: context.taskId || `repair_task_${Date.now()}`
      };

      // 执行请求
      const result = await this.executor.execute(executionRequest);

      // 提取代码（如果有代码块包装）
      const extractedCode = this._extractCodeFromResponse(result.response || '');

      return {
        ...result,
        code: extractedCode,
        response: result.response || ''
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorMessage: error.message
      };
    }
  }

  /**
   * 从响应中提取代码块
   * @private
   */
  _extractCodeFromResponse(response) {
    // 尝试提取JavaScript代码块
    const jsCodeMatch = response.match(/```(?:javascript|js)?\n([\s\S]*?)\n```/);

    if (jsCodeMatch && jsCodeMatch[1]) {
      return jsCodeMatch[1];
    }

    // 尝试提取其他语言的代码块
    const anyCodeMatch = response.match(/```\n([\s\S]*?)\n```/);
    if (anyCodeMatch && anyCodeMatch[1]) {
      return anyCodeMatch[1];
    }

    // 如果没有找到代码块，返回原始响应
    return response;
  }

  /**
   * 配置API参数
   */
  configure(options) {
    this.options = {
      ...this.options,
      ...options
    };

    if (options.defaultModel) {
      this.options.defaultModel = options.defaultModel;
    }

    if (options.executorConfig) {
      // 更新执行器配置
      this.executor = new ConcurrentExecutor({
        retryConfig: {
          maxRetries: this.options.maxRetries,
          baseDelay: 1000,
          exponentialBase: 2.0,
          jitter: true
        },
        rateLimitConfig: {
          defaultRps: 10,
          burstCapacity: 30
        },
        ...options.executorConfig
      });
    }
  }

  /**
   * 获取当前配置
   */
  getConfig() {
    return { ...this.options };
  }

  /**
   * 设置默认模型
   */
  setDefaultModel(modelName) {
    this.options.defaultModel = modelName;
  }

  /**
   * 测试API连接
   */
  async testConnection() {
    try {
      const testPrompt = {
        prompt: "Say 'API connection test successful'",
        model: this.options.defaultModel,
        max_tokens: 10
      };

      const result = await this._executeRepairRequest(testPrompt, {});

      return {
        success: result.success,
        connected: result.success,
        model: this.options.defaultModel,
        response: result.response || result.error
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.executor && typeof this.executor.cleanup === 'function') {
      await this.executor.cleanup();
    }
  }
}

module.exports = CodeRepairAPI;