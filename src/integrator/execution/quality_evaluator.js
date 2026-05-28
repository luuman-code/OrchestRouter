/**
 * @fileoverview ExecutionQualityEvaluator - 执行质量评估器
 *
 * 处理 EnhancedExecutionResult.execution_info
 * 用于错误诊断和质量评估
 */
const ValidationCoordinator = require('../validation/ValidationCoordinator');

/**
 * ExecutionQuality - 执行质量
 *
 * @typedef {Object} ExecutionQuality
 * @property {number} score - 分数 (0-100)
 * @property {string[]} issues - 问题列表
 * @property {string[]} recommendations - 建议列表
 */

/**
 * ExecutionQualityEvaluator - 执行质量评估器
 *
 * 分析 execution_reasons 判断执行健康度，标记低质量结果
 */
class ExecutionQualityEvaluator {
  constructor(options = {}) {
    this.validationCoordinator = new ValidationCoordinator({
      eslintConfigPath: options.eslintConfigPath,
      tsConfigPath: options.tsConfigPath,
      timeout: options.validationTimeout || 5000,
      maxMemory: options.validationMaxMemory || 128 * 1024 * 1024
    });
  }
  /**
   * 评估执行质量
   *
   * @param {Object} result - EnhancedExecutionResult
   * @returns {ExecutionQuality} 执行质量
   */
  async evaluate(result) {
    const issues = [];
    const recommendations = [];

    // 基础分数
    let score = 100;

    // 1. 检查执行是否成功
    if (!result.success) {
      score -= 50;
      issues.push('执行失败');
      recommendations.push('检查任务 prompt 是否清晰明确');
    }

    // 2. 分析 execution_info（如果存在）
    if (result.execution_info) {
      const execInfo = result.execution_info;

      // 检查并发等待时间
      if (execInfo.concurrency_wait_time && execInfo.concurrency_wait_time > 5000) {
        score -= 10;
        issues.push(`并发等待时间过长：${execInfo.concurrency_wait_time}ms`);
        recommendations.push('考虑增加并发槽位数量');
      }

      // 检查限流等待时间
      if (execInfo.rate_limit_wait_time && execInfo.rate_limit_wait_time > 3000) {
        score -= 15;
        issues.push(`限流等待时间过长：${execInfo.rate_limit_wait_time}ms`);
        recommendations.push('降低请求频率或使用更高级别的 API');
      }

      // 检查重试次数
      if (execInfo.retry_count && execInfo.retry_count > 2) {
        score -= 20;
        issues.push(`重试次数过多：${execInfo.retry_count}次`);
        recommendations.push('检查模型可用性或网络稳定性');
      }

      // 检查成本差异
      if (execInfo.cost_variance !== undefined) {
        if (execInfo.cost_variance > 0.01) {
          score -= 5;
          issues.push(`实际成本超出预估：$${execInfo.cost_variance.toFixed(4)}`);
          recommendations.push('优化 prompt 长度或调整模型选择策略');
        }
      }

      // 分析执行原因列表
      if (execInfo.execution_reasons && Array.isArray(execInfo.execution_reasons)) {
        for (const reason of execInfo.execution_reasons) {
          // 检查是否有错误相关的 reason
          if (
            reason.reason &&
            (reason.reason.toLowerCase().includes('error') ||
              reason.reason.toLowerCase().includes('failed') ||
              reason.reason.toLowerCase().includes('timeout'))
          ) {
            score -= 10;
            issues.push(`执行问题：${reason.reason}`);
          }

          // 检查是否有降级相关的 reason
          if (
            reason.reason &&
            (reason.reason.toLowerCase().includes('fallback') ||
              reason.reason.toLowerCase().includes('degraded'))
          ) {
            score -= 5;
            issues.push(`使用了降级策略：${reason.reason}`);
            recommendations.push('检查主策略失败原因');
          }

          // 检查是否有语法/安全/性能相关的问题
          if (
            reason.reason &&
            (reason.reason.toLowerCase().includes('syntax') ||
              reason.reason.toLowerCase().includes('security') ||
              reason.reason.toLowerCase().includes('performance'))
          ) {
            score -= 15;
            issues.push(reason.reason);
            recommendations.push(this.getRecommendationForIssue(reason.reason));
          }
        }
      }
    }

    // 3. 检查 token 使用情况
    if (result.usage) {
      const outputTokens = result.usage.output || 0;
      const inputTokens = result.usage.input || 0;

      // 如果输出 token 过少，可能表示生成内容不完整
      if (outputTokens < 50) {
        score -= 10;
        issues.push('输出 token 过少，可能内容不完整');
        recommendations.push('检查 prompt 是否要求足够的输出细节');
      }

      // 如果输出/输入比例异常，可能表示效率问题
      if (inputTokens > 0 && outputTokens / inputTokens < 0.1) {
        score -= 5;
        issues.push('输出/输入 token 比例过低');
        recommendations.push('优化 prompt 结构，减少不必要的上下文');
      }
    }

    // 4. 检查执行时长
    if (result.duration_ms) {
      if (result.duration_ms > 60000) {
        score -= 15;
        issues.push(`执行时间过长：${(result.duration_ms / 1000).toFixed(1)}s`);
        recommendations.push('考虑分解复杂任务或使用更快的模型');
      } else if (result.duration_ms > 30000) {
        score -= 5;
        issues.push(`执行时间较长：${(result.duration_ms / 1000).toFixed(1)}s`);
      }
    }

    // 5. Perform comprehensive code validation if code is present in result
    if (result.code || result.content || (result.choices && result.choices[0] && result.choices[0].message)) {
      const codeContent = result.code ||
                          result.content ||
                          result.choices[0].message.content ||
                          '';

      if (codeContent && typeof codeContent === 'string' && codeContent.trim() !== '') {
        try {
          // Use validation coordinator to assess code quality
          const validationOptions = {};

          // Determine file type if available
          if (result.filePath) {
            validationOptions.filename = result.filePath;
            if (result.filePath.endsWith('.ts') || result.filePath.endsWith('.tsx')) {
              validationOptions.type = 'typescript';
            } else if (result.filePath.endsWith('.js') || result.filePath.endsWith('.jsx')) {
              validationOptions.type = 'javascript';
            }
          } else {
            // Try to infer type from content
            if (codeContent.includes('import type') || codeContent.includes('export type') ||
                codeContent.includes(': ') || codeContent.includes('interface ') || codeContent.includes('enum ')) {
              validationOptions.type = 'typescript';
            } else if (codeContent.includes('import ') || codeContent.includes('require(')) {
              validationOptions.type = 'javascript';
            }
          }

          const validation = await this.validationCoordinator.validate(codeContent, validationOptions);

          if (!validation.success) {
            // Adjust score based on validation issues
            const errorCount = validation.summary.errorCount || validation.errors.length;
            const warningCount = validation.summary.warningCount || validation.warnings.length;

            // Deduct points for validation failures
            score -= Math.min(errorCount * 5, 30); // Up to 30 points for errors
            score -= Math.min(warningCount * 2, 15); // Up to 15 points for warnings

            // Add validation issues to the issues list
            validation.errors.forEach(error => {
              const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
              issues.push(`代码验证错误: ${errorMsg}`);
            });

            validation.warnings.forEach(warning => {
              const warningMsg = typeof warning === 'string' ? warning : (warning.message || JSON.stringify(warning));
              issues.push(`代码验证警告: ${warningMsg}`);
            });

            // Add recommendations from validation
            validation.suggestions.forEach(suggestion => {
              recommendations.push(`代码改进建议: ${suggestion}`);
            });

            // If code failed validation, ensure score reflects the quality issue
            if (errorCount > 0) {
              recommendations.push('代码存在语法或类型错误，需修复后方可正常运行');
            }
            if (warningCount > 0) {
              recommendations.push('代码存在潜在问题，请按建议改进');
            }
          } else {
            // Code passed validation, add positive note
            recommendations.push('代码通过语法和类型检查，质量良好');
          }
        } catch (validationError) {
          console.error('Error during code validation:', validationError);
          // Add a note about validation failure but don't heavily penalize since the validation itself failed
          issues.push('代码验证过程出现错误，无法完成全面质量检查');
        }
      }
    }

    // 6. 确保分数在 0-100 范围内
    score = Math.max(0, Math.min(100, score));

    // 7. 如果没有问题，添加正面反馈
    if (issues.length === 0) {
      recommendations.push('执行质量良好，保持当前配置');
    }

    return {
      score,
      issues,
      recommendations
    };
  }

  /**
   * 根据问题类型获取建议
   *
   * @private
   * @param {string} issue - 问题描述
   * @returns {string} 建议
   */
  getRecommendationForIssue(issue) {
    const issueLower = issue.toLowerCase();

    if (issueLower.includes('syntax')) {
      return '使用代码格式化工具修复语法错误';
    }
    if (issueLower.includes('security')) {
      return '审查代码中的安全漏洞，如输入验证、敏感数据处理等';
    }
    if (issueLower.includes('performance')) {
      return '优化算法复杂度或减少不必要的计算';
    }

    return '审查并修复相关问题';
  }
}

module.exports = { ExecutionQualityEvaluator };
