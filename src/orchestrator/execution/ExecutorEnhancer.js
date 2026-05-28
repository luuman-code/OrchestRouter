/**
 * 执行器增强组件
 *
 * 增强执行器能力，解决超时、截断、验证等问题
 */
const ValidationCoordinator = require('../../../../src/integrator/validation/ValidationCoordinator');

class ExecutorEnhancer {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 2,      // 减少重试次数以提高响应速度
      defaultTimeout: config.defaultTimeout || 20000, // 降低默认超时时间，更快响应
      maxTokensBase: config.maxTokensBase || 32000,
      retryDelay: config.retryDelay || 500,    // 减少重试延迟
      ...config
    };

    // Initialize validation coordinator with options from config
    this.validationCoordinator = new ValidationCoordinator({
      eslintConfigPath: config.eslintConfigPath,
      tsConfigPath: config.tsConfigPath,
      timeout: config.validationTimeout || 5000,
      maxMemory: config.validationMaxMemory || 128 * 1024 * 1024
    });
  }

  /**
   * 执行带增强功能的任务
   */
  async executeWithEnhancements(task, modelConfig) {
    const enhancedConfig = this.enhanceModelConfig(modelConfig);

    // 执行任务并处理可能的异常
    let result = await this.executeTaskWithRetry(task, enhancedConfig);

    // 检查结果是否被截断
    if (this.isTruncated(result)) {
      result = await this.handleTruncation(task, result, enhancedConfig);
    }

    // 验证代码质量
    if (this.needsValidation(result)) {
      result = await this.validateAndFix(result);
    }

    return result;
  }

  /**
   * 增强模型配置
   */
  enhanceModelConfig(config) {
    return {
      ...config,
      timeout: this.config.defaultTimeout,
      max_tokens: this.estimateRequiredTokens(config.prompt),
      temperature: config.temperature || 0.7
    };
  }

  /**
   * 带重试的任务执行
   */
  async executeTaskWithRetry(task, config) {
    let lastError;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`执行任务，尝试次数: ${attempt + 1}`);
        const result = await this.executeSingleTask(task, config);

        // 检查是否成功完成
        if (this.isSuccessfulCompletion(result)) {
          return result;
        }

        console.warn(`任务执行未完整完成，尝试: ${attempt + 1}`);
      } catch (error) {
        lastError = error;
        console.warn(`任务执行失败，尝试: ${attempt + 1}, 错误: ${error.message}`);

        if (attempt < this.config.maxRetries) {
          // 等待后重试
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }
    }

    throw new Error(`任务执行失败，已重试 ${this.config.maxRetries} 次: ${lastError?.message}`);
  }

  /**
   * 估计所需的tokens数量
   */
  estimateRequiredTokens(prompt) {
    // 根据提示词长度和复杂度估算所需tokens
    const baseTokens = this.config.maxTokensBase;
    const promptLength = prompt.length;

    // 对于复杂的任务，增加token预算
    if (prompt.includes('复杂') || prompt.includes('详细') || prompt.includes('完整')) {
      return Math.min(baseTokens * 2, 64000); // 最大64000 tokens
    }

    // 根据提示词长度调整
    if (promptLength > 1000) {
      return Math.min(baseTokens * 1.5, 64000);
    }

    return baseTokens;
  }

  /**
   * 检查结果是否被截断
   */
  isTruncated(result) {
    // 检查API返回的finish_reason是否为length（表示达到最大token限制）
    if (result.choices && result.choices[0] && result.choices[0].finish_reason === 'length') {
      return true;
    }

    // 检查代码是否在明显不完整的位置结束
    const content = result.content || result.choices?.[0]?.message?.content || '';
    return this.hasIncompleteIndicators(content);
  }

  /**
   * 检查内容是否有不完整指示符
   */
  hasIncompleteIndicators(content) {
    // 检查是否有未闭合的括号、引号等
    const incompletePatterns = [
      /\{[^}]*$/,           // 未闭合的大括号
      /\([^)]*$/,           // 未闭合的小括号
      /\[[^\]]*$/,          // 未闭合的中括号
      /"[^"]*$/,            // 未闭合的双引号
      /'[^']*$/,            // 未闭合的单引号
      /\/\*[^*]*\*+([^/*][^*]*\*+)*$/, // 未闭合的多行注释
      /function\s+\w+\s*\([^)]*$/, // 未完成的函数定义
      /class\s+\w+\s*{[^}]*$/,      // 未完成的类定义
      /return\s+[^;]*$/,            // 未完成的return语句
    ];

    return incompletePatterns.some(pattern => pattern.test(content));
  }

  /**
   * 处理截断情况
   */
  async handleTruncation(task, truncatedResult, config) {
    console.log('检测到结果截断，正在续写...');

    // 构造续写请求
    const continuationPrompt = this.buildContinuationPrompt(task, truncatedResult);

    const continuationConfig = {
      ...config,
      prompt: continuationPrompt,
      max_tokens: config.max_tokens, // 保持相同的token预算
    };

    // 执行续写
    const continuationResult = await this.executeSingleTask(task, continuationConfig);

    // 合并原始结果和续写结果
    return this.mergeResults(truncatedResult, continuationResult);
  }

  /**
   * 构建续写提示
   */
  buildContinuationPrompt(task, truncatedResult) {
    const originalPrompt = task.prompt || task.messages?.map(m => m.content).join('\n') || '';
    const truncatedContent = truncatedResult.content ||
                           truncatedResult.choices?.[0]?.message?.content || '';

    return `${originalPrompt}

上面的任务请求需要继续完成，之前的部分内容如下：

${truncatedContent}

请继续完成剩余部分，注意保持代码的一致性和完整性。确保所有括号、引号都正确闭合，所有函数和类都完整实现。`;
  }

  /**
   * 合并结果
   */
  mergeResults(original, continuation) {
    const originalContent = original.content || original.choices?.[0]?.message?.content || '';
    const continuationContent = continuation.content || continuation.choices?.[0]?.message?.content || '';

    return {
      ...original,
      content: originalContent + continuationContent,
      choices: [{
        ...original.choices?.[0],
        message: {
          ...original.choices?.[0]?.message,
          content: originalContent + continuationContent
        }
      }],
      // 标记为已续写
      isContinued: true,
      originalFinishReason: original.choices?.[0]?.finish_reason
    };
  }

  /**
   * 验证结果是否需要进一步验证
   */
  needsValidation(result) {
    return result && (result.content || result.choices?.[0]?.message?.content);
  }

  /**
   * 验证和修复结果
   */
  async validateAndFix(result) {
    const content = result.content || result.choices?.[0]?.message?.content || '';

    // 基本代码验证 using new validation coordinator
    const validation = await this.validateCodeWithCoordinator(content);

    if (!validation.success) {
      console.log('代码验证发现问题:', validation.errors);

      // Try to extract corrected code from validation suggestions if possible
      const fixedContent = this.attemptAutoFix(content, validation.errors);

      return {
        ...result,
        content: fixedContent,
        choices: [{
          ...result.choices?.[0],
          message: {
            ...result.choices?.[0]?.message,
            content: fixedContent
          }
        }],
        validationResults: validation,
        validationIssues: validation.errors,
        wasAutoFixed: true
      };
    }

    return result;
  }

  /**
   * 验证代码 using the new validation coordinator
   */
  async validateCodeWithCoordinator(content) {
    try {
      // Determine code type based on content and try to validate with coordinator
      const options = {};

      // Infer code type from content
      if (content.includes('import type') || content.includes('export type') ||
          content.includes(': ') || content.includes('interface ') || content.includes('enum ')) {
        options.type = 'typescript';
      } else if (content.includes('import ') || content.includes('require(')) {
        options.type = 'javascript';
      }

      // Perform comprehensive validation using the new coordinator
      const validation = await this.validationCoordinator.validate(content, options);
      return validation;
    } catch (error) {
      console.error('Error during coordinated validation:', error);
      // Fallback to basic validation
      return {
        success: false,
        errors: [{ type: 'validation-error', message: `Validation failed: ${error.message}`, error: error }],
        warnings: [],
        suggestions: [],
        results: {},
        summary: { totalValidators: 0, successfulValidators: 0, failedValidators: 0, errorCount: 1, warningCount: 0 }
      };
    }
  }

  /**
   * 验证代码 (existing basic validation kept for compatibility)
   */
  validateCode(content) {
    const issues = [];

    // 检查空导入语句
    const emptyImportRegex = /import\s*{\s*}\s*from\s+['"][^'"]+['"]/g;
    if (emptyImportRegex.test(content)) {
      issues.push({
        type: 'EMPTY_IMPORT',
        message: '检测到空导入语句',
        position: content.match(emptyImportRegex).index
      });
    }

    // 检查绝对路径引用
    const absolutePathRegex = /(['"])C:[\\/][^'"]+?\.(js|ts|jsx|tsx)['"]/g;
    const absoluteMatches = content.match(absolutePathRegex);
    if (absoluteMatches) {
      for (const match of absoluteMatches) {
        issues.push({
          type: 'ABSOLUTE_PATH',
          message: `检测到绝对路径引用: ${match}`,
          position: content.indexOf(match)
        });
      }
    }

    // 检查未闭合结构
    const unmatched = this.findUnmatchedBrackets(content);
    if (unmatched.length > 0) {
      issues.push(...unmatched);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 查找未匹配的括号
   */
  findUnmatchedBrackets(content) {
    const issues = [];
    const stack = [];
    const pairs = { '{': '}', '[': ']', '(': ')' };
    const opening = new Set(['{', '[', '(']);
    const closing = new Set(['}', ']', ')']);

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (opening.has(char)) {
        stack.push({ char, index: i });
      } else if (closing.has(char)) {
        const last = stack.pop();
        if (!last || pairs[last.char] !== char) {
          issues.push({
            type: 'UNMATCHED_BRACKET',
            message: `未匹配的括号: ${char} 在位置 ${i}`,
            position: i
          });
        }
      }
    }

    // 报告未闭合的括号
    while (stack.length > 0) {
      const item = stack.pop();
      issues.push({
        type: 'UNCLOSED_BRACKET',
        message: `未闭合的括号: ${item.char} 从位置 ${item.index} 开始`,
        position: item.index
      });
    }

    return issues;
  }

  /**
   * 尝试自动修复
   */
  attemptAutoFix(content, issues) {
    let fixedContent = content;

    // 修复空导入
    fixedContent = fixedContent.replace(/import\s*{\s*}\s*from\s+['"][^'"]+['"]/g, '');

    // 修复绝对路径 - 替换为相对路径
    fixedContent = fixedContent.replace(/(['"])C:[\\/][^'"]+?\.(js|ts|jsx|tsx)(['"])/g, (match, p1, ext, p2) => {
      // 简单替换为相对路径
      return p1 + './placeholder.' + ext + p2;
    });

    // 尝试闭合未匹配的括号（简单的处理方式）
    const unmatchedIssues = issues.filter(i => i.type === 'UNCLOSED_BRACKET');
    for (const issue of unmatchedIssues) {
      // 根据括号类型添加闭合符号
      const bracketType = content[issue.position];
      let closingBracket = '';

      switch(bracketType) {
        case '{': closingBracket = '}'; break;
        case '[': closingBracket = ']'; break;
        case '(': closingBracket = ')'; break;
      }

      if (closingBracket) {
        fixedContent = fixedContent + closingBracket;
      }
    }

    return fixedContent;
  }

  /**
   * 检查是否成功完成
   */
  isSuccessfulCompletion(result) {
    if (!result) return false;

    // 检查API返回状态
    if (result.choices && result.choices[0] && result.choices[0].finish_reason) {
      return result.choices[0].finish_reason !== 'length'; // 不是因为长度限制而结束
    }

    return true;
  }

  /**
   * 执行单个任务
   */
  async executeSingleTask(task, config) {
    // 这里应该集成实际的模型调用逻辑
    // 为了演示目的，这里返回一个模拟的结果
    console.log(`执行任务: ${task.description || task.prompt?.substring(0, 50) || '未知任务'}`);

    // 模拟API调用
    return await new Promise(resolve => {
      setTimeout(() => {
        resolve({
          content: task.mockContent || 'Generated content',
          choices: [{
            message: { content: task.mockContent || 'Generated content' },
            finish_reason: 'stop' // 或 'length' 如果截断
          }]
        });
      }, 100);
    });
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ExecutorEnhancer;