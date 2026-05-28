/**
 * 重新规划器
 *
 * 根据反馈生成新的任务计划
 */

class Replanner {
  constructor(config = {}) {
    this.config = {
      enableSmartRefinement: config.enableSmartRefinement ?? true,
      maxRefinementRounds: config.maxRefinementRounds || 5,
      priorityAdjustmentFactor: config.priorityAdjustmentFactor || 0.2,
      ...config
    };
  }

  /**
   * 修订计划
   */
  async revisePlan(originalPlan, analysis) {
    const revision = {
      originalPlan,
      analysis,
      revisedPlan: {},
      changes: [],
      confidence: 0,
      recommendation: 'CONTINUE'
    };

    // 根据分析结果生成修订建议
    revision.changes = this.generateRevisionChanges(analysis);

    // 应用修订
    revision.revisedPlan = this.applyRevisions(originalPlan, revision.changes);

    // 评估修订后的计划
    revision.confidence = this.estimateRevisionConfidence(revision);

    // 生成推荐
    revision.recommendation = this.generateRecommendation(revision);

    return revision;
  }

  /**
   * 生成修订变化
   */
  generateRevisionChanges(analysis) {
    const changes = [];

    // 根据根本原因分析生成变化
    if (analysis.rootCauses) {
      for (const rootCause of analysis.rootCauses) {
        if (rootCause.type === 'COMPONENT_CONCENTRATION') {
          changes.push({
            type: 'RESTRUCTURE_COMPONENT',
            target: rootCause.component,
            reason: rootCause.rootCause,
            action: `重新设计和重构 ${rootCause.component} 组件`,
            priority: 'HIGH',
            affectedSubtasks: this.getIdentifiedAffectedSubtasks(rootCause.component)
          });
        } else if (rootCause.type === 'PATTERN_REPETITION') {
          changes.push({
            type: 'IMPROVE_PATTERN',
            target: 'general',
            reason: rootCause.rootCause,
            action: `解决 ${rootCause.rootCause} 问题模式`,
            priority: 'MEDIUM',
            affectedSubtasks: ['all']
          });
        }
      }
    }

    // 根据问题类型生成变化
    if (analysis.issues) {
      for (const issue of analysis.issues) {
        changes.push({
          type: 'ADDRESS_ISSUE',
          target: issue.component || 'general',
          reason: issue.description,
          action: this.generateActionForIssue(issue),
          priority: issue.severity,
          weight: issue.weight || 0.5
        });
      }
    }

    // 根据改进建议生成变化
    if (analysis.improvementSuggestions) {
      for (const suggestion of analysis.improvementSuggestions) {
        changes.push({
          type: 'IMPLEMENT_SUGGESTION',
          target: suggestion.target,
          reason: '反馈分析建议',
          action: suggestion.suggestion,
          priority: suggestion.priority,
          implementationNotes: `优先级: ${suggestion.priority}`
        });
      }
    }

    return changes;
  }

  /**
   * 为特定问题生成行动
   */
  generateActionForIssue(issue) {
    switch (issue.type) {
      case 'UNIT_TEST_FAILURE':
        return `增加单元测试覆盖，修复失败的测试用例 (${issue.count} 个失败)`;

      case 'INTEGRATION_TEST_FAILURE':
        return `解决模块间集成问题，修复集成测试 (${issue.count} 个失败)`;

      case 'E2E_TEST_FAILURE':
        return `修复端到端测试问题，确保用户体验流畅 (${issue.count} 个失败)`;

      case 'LOW_FUNCTIONALITY_QUALITY':
        return `增强功能实现的完整性和正确性`;

      case 'LOW_RELIABILITY_QUALITY':
        return `增强错误处理和异常处理机制`;

      case 'LOW_PERFORMANCE_QUALITY':
        return `优化性能，减少资源消耗`;

      case 'HIGH_RESPONSE_TIME':
        return `优化代码和架构以减少响应时间 (当前: ${issue.value}ms)`;

      case 'HIGH_MEMORY_USAGE':
        return `优化内存使用 (当前: ${issue.value}MB)`;

      case 'HIGH_CPU_USAGE':
        return `优化CPU使用率 (当前: ${issue.value}%)`;

      default:
        return `解决 ${issue.type} 问题: ${issue.description}`;
    }
  }

  /**
   * 识别受影响的子任务
   */
  getIdentifiedAffectedSubtasks(component) {
    // 根据组件名称推断可能受影响的子任务
    const componentToSubtaskMap = {
      'frontend': ['ui-components', 'user-interface', 'client-side'],
      'backend': ['api-endpoints', 'server-logic', 'business-logic'],
      'database': ['data-models', 'db-queries', 'schema-design'],
      'api': ['api-endpoints', 'request-handling', 'response-formatting'],
      'authentication': ['auth-system', 'user-management', 'permission-control'],
      'ui': ['ui-components', 'user-interface', 'styling']
    };

    return componentToSubtaskMap[component] || [component];
  }

  /**
   * 应用修订
   */
  applyRevisions(originalPlan, changes) {
    // 复制原始计划
    const revisedPlan = JSON.parse(JSON.stringify(originalPlan));

    // 应用每个变化
    for (const change of changes) {
      switch (change.type) {
        case 'RESTRUCTURE_COMPONENT':
          revisedPlan = this.applyRestructureChange(revisedPlan, change);
          break;

        case 'ADDRESS_ISSUE':
          revisedPlan = this.applyIssueAddressChange(revisedPlan, change);
          break;

        case 'IMPLEMENT_SUGGESTION':
          revisedPlan = this.applySuggestionChange(revisedPlan, change);
          break;

        case 'IMPROVE_PATTERN':
          revisedPlan = this.applyPatternImprovementChange(revisedPlan, change);
          break;
      }
    }

    // 重新评估和调整优先级
    revisedPlan = this.adjustPrioritiesBasedOnChanges(revisedPlan, changes);

    // 重新计算复杂度
    revisedPlan = this.updateComplexityEstimates(revisedPlan);

    return revisedPlan;
  }

  /**
   * 应用重构变化
   */
  applyRestructureChange(plan, change) {
    const updatedPlan = { ...plan };

    // 如果计划有子任务，更新相关子任务
    if (updatedPlan.subtasks && Array.isArray(updatedPlan.subtasks)) {
      updatedPlan.subtasks = updatedPlan.subtasks.map(subtask => {
        if (this.isSubtaskAffectedByComponent(subtask, change.target)) {
          return {
            ...subtask,
            priority: this.adjustPriority(subtask.priority, 'HIGH'),
            description: `${subtask.description} (根据${change.reason}进行重构)`,
            actions: [
              ...(subtask.actions || []),
              change.action
            ]
          };
        }
        return subtask;
      });
    }

    // 添加重构任务
    if (!updatedPlan.refactoringTasks) {
      updatedPlan.refactoringTasks = [];
    }

    updatedPlan.refactoringTasks.push({
      component: change.target,
      reason: change.reason,
      action: change.action,
      priority: change.priority,
      created: new Date().toISOString()
    });

    return updatedPlan;
  }

  /**
   * 应用问题解决变化
   */
  applyIssueAddressChange(plan, change) {
    const updatedPlan = { ...plan };

    // 根据问题类型添加相应的处理
    if (updatedPlan.subtasks && Array.isArray(updatedPlan.subtasks)) {
      updatedPlan.subtasks = updatedPlan.subtasks.map(subtask => {
        if (this.isSubtaskRelatedToIssue(subtask, change)) {
          return {
            ...subtask,
            priority: this.adjustPriority(subtask.priority, change.priority),
            additionalRequirements: [
              ...(subtask.additionalRequirements || []),
              change.action
            ]
          };
        }
        return subtask;
      });
    }

    // 记录问题修复任务
    if (!updatedPlan.issueResolutions) {
      updatedPlan.issueResolutions = [];
    }

    updatedPlan.issueResolutions.push({
      issue: change.reason,
      action: change.action,
      priority: change.priority,
      target: change.target,
      created: new Date().toISOString()
    });

    return updatedPlan;
  }

  /**
   * 应用建议变化
   */
  applySuggestionChange(plan, change) {
    const updatedPlan = { ...plan };

    // 如果计划有子任务，更新相关子任务
    if (updatedPlan.subtasks && Array.isArray(updatedPlan.subtasks)) {
      updatedPlan.subtasks = updatedPlan.subtasks.map(subtask => {
        if (change.target === 'general' || this.isSubtaskAffectedByComponent(subtask, change.target)) {
          return {
            ...subtask,
            improvementNotes: [
              ...(subtask.improvementNotes || []),
              change.action
            ]
          };
        }
        return subtask;
      });
    }

    return updatedPlan;
  }

  /**
   * 应用模式改进变化
   */
  applyPatternImprovementChange(plan, change) {
    const updatedPlan = { ...plan };

    // 添加通用改进措施
    if (!updatedPlan.generalImprovements) {
      updatedPlan.generalImprovements = [];
    }

    updatedPlan.generalImprovements.push({
      pattern: change.reason,
      action: change.action,
      priority: change.priority,
      appliedTo: change.affectedSubtasks,
      created: new Date().toISOString()
    });

    return updatedPlan;
  }

  /**
   * 检查子任务是否受组件影响
   */
  isSubtaskAffectedByComponent(subtask, component) {
    if (!subtask.description) return false;

    const lowerDesc = subtask.description.toLowerCase();
    const lowerComponent = component.toLowerCase();

    // 简单的匹配逻辑
    return lowerDesc.includes(lowerComponent) ||
           lowerDesc.includes(component.replace('-', ' '));
  }

  /**
   * 检查子任务是否与问题相关
   */
  isSubtaskRelatedToIssue(subtask, change) {
    if (!subtask.description) return false;

    const lowerDesc = subtask.description.toLowerCase();

    // 根据变化类型判断关联性
    if (change.reason.toLowerCase().includes('test')) {
      return lowerDesc.includes('test') ||
             lowerDesc.includes('unit') ||
             lowerDesc.includes('integration');
    }

    if (change.reason.toLowerCase().includes('quality')) {
      return lowerDesc.includes('quality') ||
             lowerDesc.includes('code') ||
             lowerDesc.includes('refactor');
    }

    return this.isSubtaskAffectedByComponent(subtask, change.target);
  }

  /**
   * 调整优先级
   */
  adjustPriority(currentPriority, changePriority) {
    const priorityValues = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    const currentVal = priorityValues[currentPriority] || 2;
    const changeVal = priorityValues[changePriority] || 2;

    // 如果变化优先级更高，则提升
    if (changeVal > currentVal) {
      // 找到对应的优先级标签
      for (const [priority, value] of Object.entries(priorityValues)) {
        if (value === changeVal) return priority;
      }
    }

    return currentPriority;
  }

  /**
   * 根据变化调整优先级
   */
  adjustPrioritiesBasedOnChanges(plan, changes) {
    const updatedPlan = { ...plan };

    if (updatedPlan.subtasks && Array.isArray(updatedPlan.subtasks)) {
      updatedPlan.subtasks = updatedPlan.subtasks.map(subtask => {
        let adjustment = 0;

        // 根据影响程度调整优先级
        for (const change of changes) {
          if (this.isSubtaskAffectedByChange(subtask, change)) {
            adjustment += this.getPriorityAdjustmentForChange(change);
          }
        }

        if (adjustment > 0) {
          subtask.priority = this.increasePriority(subtask.priority, adjustment);
        }

        return subtask;
      });
    }

    return updatedPlan;
  }

  /**
   * 检查子任务是否受变化影响
   */
  isSubtaskAffectedByChange(subtask, change) {
    if (change.target === 'general') return true;
    if (change.affectedSubtasks && change.affectedSubtasks.includes('all')) return true;
    if (change.affectedSubtasks && change.affectedSubtasks.includes(subtask.id)) return true;

    return this.isSubtaskAffectedByComponent(subtask, change.target);
  }

  /**
   * 获取变化的优先级调整值
   */
  getPriorityAdjustmentForChange(change) {
    const severityFactor = { 'CRITICAL': 2, 'HIGH': 1.5, 'MEDIUM': 1, 'LOW': 0.5 };
    return severityFactor[change.priority] || 1;
  }

  /**
   * 增加优先级
   */
  increasePriority(currentPriority, factor) {
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const currentIndex = priorities.indexOf(currentPriority);

    if (currentIndex === -1) return currentPriority;

    // 根据因子计算新的索引，但不超过最高优先级
    const newIndex = Math.min(currentIndex + Math.floor(factor) - 1, priorities.length - 1);

    return priorities[newIndex];
  }

  /**
   * 更新复杂度估计
   */
  updateComplexityEstimates(plan) {
    const updatedPlan = { ...plan };

    // 由于添加了更多的要求和注意事项，复杂度可能会增加
    if (updatedPlan.complexity && updatedPlan.complexity.score) {
      // 根据添加的变化数量调整复杂度
      const changeCount = updatedPlan.refactoringTasks?.length || 0 +
                         updatedPlan.issueResolutions?.length || 0 +
                         updatedPlan.generalImprovements?.length || 0;

      updatedPlan.complexity.score = updatedPlan.complexity.score * (1 + changeCount * 0.1);
      updatedPlan.complexity.level = this.estimateComplexityLevel(updatedPlan.complexity.score);
    }

    return updatedPlan;
  }

  /**
   * 估计复杂度等级
   */
  estimateComplexityLevel(score) {
    if (score < 1000) return 'SIMPLE';
    if (score < 3000) return 'MEDIUM';
    if (score < 6000) return 'COMPLEX';
    return 'VERY_COMPLEX';
  }

  /**
   * 估计修订置信度
   */
  estimateRevisionConfidence(revision) {
    const { changes, analysis } = revision;

    // 基础置信度
    let confidence = 0.5;

    // 更多的变化可能意味着更全面的修订
    confidence += Math.min(changes.length * 0.05, 0.2); // 最多增加20%

    // 分析质量影响置信度
    if (analysis.confidence) {
      confidence = (confidence + analysis.confidence) / 2;
    }

    // 根据问题严重性调整
    if (analysis.priorityRankings && analysis.priorityRankings.length > 0) {
      const avgPriority = analysis.priorityRankings.reduce((sum, item) => sum + item.priority, 0) /
                         analysis.priorityRankings.length;
      confidence = (confidence + avgPriority) / 2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成推荐
   */
  generateRecommendation(revision) {
    const { changes, analysis } = revision;

    if (changes.length === 0) {
      return 'NO_CHANGES_NEEDED';
    }

    // 根据总体评估和变化数量确定推荐
    if (analysis.overallAssessment === 'CRITICAL_ISSUES' || analysis.overallAssessment === 'SIGNIFICANT_ISSUES') {
      return 'MAJOR_REVISION_REQUIRED';
    }

    if (changes.length > 5) {
      return 'SUBSTANTIAL_REVISION';
    }

    if (changes.length > 2) {
      return 'MODERATE_REVISION';
    }

    return 'MINOR_REVISION';
  }

  /**
   * 创建新的规划
   */
  async createNewPlanFromScratch(analysis, context = {}) {
    // 基于分析结果和上下文创建全新的规划
    const newPlan = {
      id: `revised-${Date.now()}`,
      timestamp: new Date().toISOString(),
      basedOnAnalysis: analysis,
      context,
      subtasks: [],
      complexity: { score: 1000, level: 'MEDIUM' },
      timeline: { estimatedDuration: 'flexible' },
      dependencies: [],
      riskFactors: [],
      successCriteria: []
    };

    // 根据分析结果生成新的子任务
    newPlan.subtasks = this.generateSubtasksFromAnalysis(analysis);

    // 评估新计划的可行性
    newPlan.feasibility = this.assessFeasibility(newPlan);

    return newPlan;
  }

  /**
   * 从分析生成子任务
   */
  generateSubtasksFromAnalysis(analysis) {
    const subtasks = [];

    // 根据根本原因生成核心修复任务
    if (analysis.rootCauses) {
      for (const rootCause of analysis.rootCauses) {
        subtasks.push({
          id: `fix-${rootCause.type}-${Date.now()}`,
          description: rootCause.rootCause,
          type: 'correction',
          priority: 'HIGH',
          effort: this.estimateEffortFromSeverity(rootCause.probability > 0.5 ? 'HIGH' : 'MEDIUM'),
          dependencies: []
        });
      }
    }

    // 根据问题生成具体的修复子任务
    if (analysis.issues) {
      for (const issue of analysis.issues.slice(0, 10)) { // 限制最多10个问题转换为子任务
        subtasks.push({
          id: `resolve-${issue.type}-${Date.now()}`,
          description: `解决 ${issue.type} 问题: ${issue.description}`,
          type: 'resolution',
          priority: issue.severity,
          effort: this.estimateEffortFromSeverity(issue.severity),
          targetComponent: issue.component
        });
      }
    }

    // 根据改进建议生成优化子任务
    if (analysis.improvementSuggestions) {
      for (const suggestion of analysis.improvementSuggestions.slice(0, 5)) { // 限制最多5个建议转换
        subtasks.push({
          id: `implement-${suggestion.target}-${Date.now()}`,
          description: suggestion.suggestion,
          type: 'improvement',
          priority: suggestion.priority,
          effort: this.estimateEffortFromPriority(suggestion.priority)
        });
      }
    }

    return subtasks;
  }

  /**
   * 从严重性估计工作量
   */
  estimateEffortFromSeverity(severity) {
    const effortMapping = {
      'CRITICAL': 'XL',
      'HIGH': 'L',
      'MEDIUM': 'M',
      'LOW': 'S'
    };

    return effortMapping[severity] || 'M';
  }

  /**
   * 从优先级估计工作量
   */
  estimateEffortFromPriority(priority) {
    const effortMapping = {
      'CRITICAL': 'L',
      'HIGH': 'M',
      'MEDIUM': 'S',
      'LOW': 'XS'
    };

    return effortMapping[priority] || 'M';
  }

  /**
   * 评估可行性
   */
  assessFeasibility(plan) {
    const assessment = {
      technical: 0.7,
      timeline: 0.7,
      resources: 0.7,
      risk: 0.3,
      overall: 0.5,
      concerns: [],
      recommendations: []
    };

    // 评估技术可行性
    if (plan.subtasks.length > 20) {
      assessment.technical = 0.5;
      assessment.concerns.push('子任务过多，可能难以管理');
    }

    // 评估时间线可行性
    if (plan.complexity?.score > 8000) {
      assessment.timeline = 0.4;
      assessment.concerns.push('复杂度很高，需要更多时间');
    }

    // 计算整体可行性
    assessment.overall = (
      assessment.technical +
      assessment.timeline +
      assessment.resources
    ) / 3;

    // 生成建议
    if (assessment.overall < 0.5) {
      assessment.recommendations.push('建议分解为多个阶段实现');
    }

    return assessment;
  }
}

module.exports = Replanner;