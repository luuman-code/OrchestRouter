/**
 * @fileoverview QualityFeedbackProcessor - 质量反馈处理器
 *
 * 根据执行质量评估结果影响整合决策
 * 对低质量代码启用特殊处理或自动修复
 */

const { CodeFormatter } = require('../style/formatter');

/**
 * IntegrationDecision - 整合决策
 *
 * @typedef {Object} IntegrationDecision
 * @property {string} taskId - 任务 ID
 * @property {'default'|'strict'|'conservative'|'aggressive'|'audit_required'} strategy - 整合策略
 * @property {'low'|'normal'|'high'} priority - 处理优先级
 * @property {string[]} additionalProcessing - 额外处理步骤
 * @property {number} [qualityScore] - 质量分数
 * @property {string[]} [qualityIssues] - 质量问题
 * @property {'high'|'medium'|'low'|'critical'} [qualityLabel] - 质量等级标签
 * @property {'preserve'|'override'|'conditional'} [mergeOverrideStrategy] - 合并覆盖策略
 * @property {boolean} [auditRequired] - 是否需要人工审核
 */

/**
 * QualityFeedbackProcessor - 质量反馈处理器
 *
 * 根据执行质量评估结果动态调整整合策略
 */
class QualityFeedbackProcessor {
  /**
   * 根据质量评估结果应用整合决策 - 增强版
   * 实现更深入的联动：低质量结果使用保守策略，高质量结果可覆盖低质量结果
   *
   * @static
   * @param {Object[]} associatedResults - 关联结果列表
   * @param {Map<string, ExecutionQuality>} executionQuality - 执行质量映射
   * @param {Object} config - 配置
   * @returns {IntegrationDecision[]} 整合决策列表
   */
  static applyQualityBasedDecisions(associatedResults, executionQuality, config) {
    const decisions = [];
    const qualityThreshold = config?.execution?.quality_threshold || 70;
    const criticalThreshold = config?.execution?.critical_quality_threshold || 40;

    // 按质量分数对结果进行排序，高质量的排在前面
    const resultsWithQuality = associatedResults.map((result) => {
      const quality = executionQuality.get(result.task_id);
      return {
        result,
        quality: quality || { score: 50, issues: [], recommendations: [] } // 默认中等质量
      };
    });

    // 按质量分数降序排列
    resultsWithQuality.sort(
      (a, b) => (b.quality.score || 0) - (a.quality.score || 0)
    );

    // 为每个结果分配决策
    for (const item of resultsWithQuality) {
      const { result, quality } = item;

      const decision = {
        taskId: result.task_id,
        strategy: 'default',
        priority: 'normal',
        additionalProcessing: [],
        qualityScore: quality.score,
        qualityIssues: quality.issues,
        qualityLabel: 'medium',
        mergeOverrideStrategy: 'conditional'
      };

      // 根据质量分数分配质量等级
      if (quality.score >= 90) {
        decision.qualityLabel = 'high';
        decision.strategy = 'aggressive'; // 高质量结果可积极整合
        decision.priority = 'high';
        decision.mergeOverrideStrategy = 'preserve'; // 高质量结果应被保留
      } else if (quality.score >= qualityThreshold) {
        decision.qualityLabel = 'medium';
        decision.strategy = 'default';
        decision.priority = 'normal';
      } else if (quality.score >= criticalThreshold) {
        decision.qualityLabel = 'low';
        decision.strategy = 'conservative'; // 低质量结果使用保守策略
        decision.priority = 'low';
        decision.mergeOverrideStrategy = 'conditional'; // 仅在无冲突时整合
        decision.auditRequired = false;

        // 添加额外处理步骤
        if (quality.issues.some((issue) => issue.includes('syntax'))) {
          decision.additionalProcessing.push('syntax_check');
        }

        if (quality.issues.some((issue) => issue.includes('security'))) {
          decision.additionalProcessing.push('security_scan');
        }

        if (quality.issues.some((issue) => issue.includes('performance'))) {
          decision.additionalProcessing.push('perf_review');
        }
      } else {
        // 严重低质量结果
        decision.qualityLabel = 'critical';
        decision.strategy = 'audit_required'; // 需要人工审核
        decision.priority = 'low';
        decision.mergeOverrideStrategy = 'preserve'; // 不主动覆盖其他结果
        decision.auditRequired = true;

        // 添加所有可能的处理步骤
        decision.additionalProcessing.push('full_audit', 'manual_review');
      }

      decisions.push(decision);
    }

    // 第二次遍历，处理结果间的冲突情况
    // 当低质量结果与高质量结果冲突时，优先保留高质量结果
    const fileToHighQualityTask = new Map();

    // 记录每个文件对应的最佳质量结果
    for (const result of associatedResults) {
      const hints = result.subtask?.integrationHints;
      const targetFile = hints?.targetFile;

      if (targetFile) {
        const quality = executionQuality.get(result.task_id)?.score || 50;

        if (
          !fileToHighQualityTask.has(targetFile) ||
          quality > fileToHighQualityTask.get(targetFile).quality
        ) {
          fileToHighQualityTask.set(targetFile, {
            taskId: result.task_id,
            quality
          });
        }
      }
    }

    // 更新决策以反映文件级别的质量优先级
    for (const decision of decisions) {
      const result = associatedResults.find((r) => r.task_id === decision.taskId);
      if (result) {
        const targetFile = result.subtask?.integrationHints?.targetFile;
        if (targetFile) {
          const bestMatch = fileToHighQualityTask.get(targetFile);
          if (bestMatch && bestMatch.taskId !== decision.taskId) {
            // 这是一个低质量的结果，但与高质量结果竞争同一文件
            decision.mergeOverrideStrategy = 'preserve'; // 不要覆盖高质量结果
            decision.priority = 'low'; // 降低优先级

            if (
              decision.qualityLabel === 'low' ||
              decision.qualityLabel === 'critical'
            ) {
              decision.strategy = 'conservative';
            }
          }
        }
      }
    }

    return decisions;
  }

  /**
   * 根据质量评估结果应用整合策略 - 针对文件级别
   * 该方法检查是否某个文件上有多个结果，如果有，优先使用高质量结果
   *
   * @static
   * @param {string} filePath - 文件路径
   * @param {Object[]} fileResults - 文件结果列表
   * @param {Map<string, ExecutionQuality>} executionQuality - 执行质量映射
   * @param {IntegrationDecision[]} decisions - 整合决策列表
   * @returns {IntegrationDecision} 最终决策
   */
  static applyFileLevelQualityStrategy(
    filePath,
    fileResults,
    executionQuality,
    decisions
  ) {
    if (fileResults.length === 1) {
      // 单一结果，直接返回对应的决策
      return decisions.find((d) => d.taskId === fileResults[0].task_id);
    }

    // 多个结果针对同一文件，找出最高质量的结果
    let highestQualityResult = null;
    let highestQualityScore = -1;

    for (const result of fileResults) {
      const quality = executionQuality.get(result.task_id)?.score || 50;
      if (quality > highestQualityScore) {
        highestQualityScore = quality;
        highestQualityResult = result;
      }
    }

    if (highestQualityResult) {
      // 返回最高质量结果的决策，但调整策略以确保它被保留
      const originalDecision = decisions.find(
        (d) => d.taskId === highestQualityResult.task_id
      );
      if (originalDecision) {
        return {
          ...originalDecision,
          mergeOverrideStrategy: 'preserve', // 高质量结果应被保留
          priority: 'high'
        };
      }
    }

    // 如果找不到最佳结果，返回第一个
    return decisions.find((d) => d.taskId === fileResults[0].task_id);
  }

  /**
   * 生成质量审核报告
   * 列出所有需要人工审核的低质量结果
   *
   * @static
   * @param {IntegrationDecision[]} decisions - 整合决策列表
   * @param {Object[]} associatedResults - 关联结果列表
   * @param {Map<string, ExecutionQuality>} executionQuality - 执行质量映射
   * @returns {string} 质量审核报告
   */
  static generateQualityAuditReport(
    decisions,
    associatedResults,
    executionQuality
  ) {
    const auditRequired = decisions.filter((d) => d.auditRequired);
    if (auditRequired.length === 0) {
      return '无需质量审核：所有结果质量分数均在可接受范围内。';
    }

    const reportLines = [
      '=== 质量审核报告 ===',
      '',
      `需要人工审核的低质量结果数量：${auditRequired.length}`,
      ''
    ];

    for (const decision of auditRequired) {
      const result = associatedResults.find((r) => r.task_id === decision.taskId);
      const quality = executionQuality.get(decision.taskId);

      reportLines.push(`任务 ID: ${decision.taskId}`);
      reportLines.push(`  质量分数：${decision.qualityScore}`);
      reportLines.push(`  质量等级：${decision.qualityLabel}`);
      reportLines.push(
        `  目标文件：${result?.subtask?.integrationHints?.targetFile || '未知'}`
      );
      reportLines.push(
        `  问题：${decision.qualityIssues?.join(', ') || '无'}`
      );
      reportLines.push('');
    }

    return reportLines.join('\n');
  }

  /**
   * 对低质量结果应用矫正措施
   *
   * @static
   * @param {CodeFile} codeFile - 代码文件
   * @param {ExecutionQuality} quality - 执行质量
   * @param {Object} config - 配置
   * @returns {CodeFile} 矫正后的文件
   */
  static applyCorrectiveActions(codeFile, quality, config) {
    let correctedFile = { ...codeFile };

    // 对于低质量结果，应用矫正器
    if (quality.score < (config?.execution?.quality_threshold || 70)) {
      // 应用语法修复
      if (quality.issues.some((issue) => issue.includes('syntax'))) {
        correctedFile = this.applySyntaxCorrection(correctedFile, config);
      }

      // 应用安全修复
      if (quality.issues.some((issue) => issue.includes('security'))) {
        correctedFile = this.applySecurityCorrection(correctedFile, config);
      }

      // 应用性能优化
      if (quality.issues.some((issue) => issue.includes('performance'))) {
        correctedFile = this.applyPerformanceCorrection(correctedFile, config);
      }
    }

    return correctedFile;
  }

  /**
   * 语法修正
   *
   * @private
   * @static
   * @param {CodeFile} file - 文件
   * @param {Object} config - 配置
   * @returns {CodeFile} 修正后的文件
   */
  static applySyntaxCorrection(file, config) {
    // 使用适当的代码格式化工具修正语法
    const formatter = new CodeFormatter(config?.formatting || {});
    return {
      ...file,
      content: formatter.formatFile({
        path: file.path,
        content: file.content,
        language: file.language
      }).formattedContent
    };
  }

  /**
   * 安全修正
   *
   * @private
   * @static
   * @param {CodeFile} file - 文件
   * @param {Object} config - 配置
   * @returns {CodeFile} 修正后的文件
   */
  static applySecurityCorrection(file, config) {
    // 应用安全扫描和修复规则
    // 这里可以实现基本的安全修复逻辑
    let content = file.content;

    // 检查并修复常见的安全问题
    // 1. 检查是否有硬编码的敏感信息
    const sensitivePatterns = [
      /password\s*=\s*['"][^'"]+['"]/gi,
      /api_key\s*=\s*['"][^'"]+['"]/gi,
      /secret\s*=\s*['"][^'"]+['"]/gi,
      /token\s*=\s*['"][^'"]+['"]/gi
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        console.warn(`检测到潜在的敏感信息硬编码：${pattern}`);
        // 添加注释提醒
        content = `// SECURITY WARNING: Review hardcoded sensitive values\n${content}`;
        break;
      }
    }

    // 2. 检查是否有 eval 使用
    if (/eval\s*\(/.test(content)) {
      console.warn('检测到 eval 使用，可能存在安全风险');
      content = `// SECURITY WARNING: Review eval() usage for potential injection\n${content}`;
    }

    return {
      ...file,
      content
    };
  }

  /**
   * 性能修正
   *
   * @private
   * @static
   * @param {CodeFile} file - 文件
   * @param {Object} config - 配置
   * @returns {CodeFile} 修正后的文件
   */
  static applyPerformanceCorrection(file, config) {
    // 应用性能优化规则
    let content = file.content;

    // 检查常见的性能问题
    // 1. 检查是否有在循环中重复创建对象的情况
    if (/for\s*\([^)]*\)\s*{[^}]*\[\s*\]/.test(content)) {
      console.warn('检测到可能在循环中创建数组的情况');
      content = `// PERFORMANCE NOTE: Consider moving array creation outside loop\n${content}`;
    }

    return {
      ...file,
      content
    };
  }
}

module.exports = { QualityFeedbackProcessor };
