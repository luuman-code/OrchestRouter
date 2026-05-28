/**
 * 反馈分析器
 *
 * 分析测试和质量反馈，生成改进策略
 */

class FeedbackAnalyzer {
  constructor(config = {}) {
    this.config = {
      minFeedbackQuality: config.minFeedbackQuality || 0.5,
      enableRootCauseAnalysis: config.enableRootCauseAnalysis ?? true,
      enablePatternRecognition: config.enablePatternRecognition ?? true,
      feedbackWeight: {
        testFailure: config.feedbackWeight?.testFailure || 0.35,      // 稍微调整测试失败权重
        qualityIssue: config.feedbackWeight?.qualityIssue || 0.35,    // 稍微调整质量问题权重
        performanceIssue: config.feedbackWeight?.performanceIssue || 0.2, // 保持性能问题权重
        securityIssue: config.feedbackWeight?.securityIssue || 0.1,   // 保持安全问题权重
        // 新增反馈权重以提高准确性
        patternBased: config.feedbackWeight?.patternBased || 0.25,    // 模式识别权重
        historicalTrend: config.feedbackWeight?.historicalTrend || 0.2 // 历史趋势权重
      },
      ...config
    };
  }

  /**
   * 分析反馈
   */
  async analyze(feedback, context = {}) {
    const analysis = {
      issues: [],
      rootCauses: [],
      improvementSuggestions: [],
      priorityRankings: [],
      overallAssessment: 'NEUTRAL',
      confidence: 0.0,
      recommendations: []
    };

    // 分析不同类型的反馈
    if (feedback.testResults) {
      const testIssues = this.analyzeTestFeedback(feedback.testResults, context);
      analysis.issues.push(...testIssues);
    }

    if (feedback.qualityResults) {
      const qualityIssues = this.analyzeQualityFeedback(feedback.qualityResults, context);
      analysis.issues.push(...qualityIssues);
    }

    if (feedback.performanceResults) {
      const performanceIssues = this.analyzePerformanceFeedback(feedback.performanceResults, context);
      analysis.issues.push(...performanceIssues);
    }

    // 执行根本原因分析
    if (this.config.enableRootCauseAnalysis) {
      analysis.rootCauses = this.performRootCauseAnalysis(analysis.issues);
    }

    // 执行模式识别
    if (this.config.enablePatternRecognition) {
      analysis.patterns = this.identifyPatterns(analysis.issues);
    }

    // 生成改进建议
    analysis.improvementSuggestions = this.generateImprovementSuggestions(analysis);

    // 优先级排序
    analysis.priorityRankings = this.rankByPriority(analysis.issues);

    // 生成总体评估
    analysis.overallAssessment = this.generateOverallAssessment(analysis);

    // 计算置信度
    analysis.confidence = this.calculateConfidence(analysis);

    // 生成推荐
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * 分析测试反馈
   */
  analyzeTestFeedback(testResults, context) {
    const issues = [];

    // 分析单元测试结果
    if (testResults.unit && testResults.unit.failed > 0) {
      issues.push({
        type: 'UNIT_TEST_FAILURE',
        severity: 'HIGH',
        component: 'unit-tests',
        count: testResults.unit.failed,
        description: `${testResults.unit.failed} 个单元测试失败`,
        impact: '功能正确性',
        weight: this.config.feedbackWeight.testFailure
      });
    }

    // 分析集成测试结果
    if (testResults.integration && testResults.integration.failed > 0) {
      issues.push({
        type: 'INTEGRATION_TEST_FAILURE',
        severity: 'HIGH',
        component: 'integration-tests',
        count: testResults.integration.failed,
        description: `${testResults.integration.failed} 个集成测试失败`,
        impact: '模块间协作',
        weight: this.config.feedbackWeight.testFailure * 1.2 // 集成问题更严重
      });
    }

    // 分析端到端测试结果
    if (testResults.e2e && testResults.e2e.failed > 0) {
      issues.push({
        type: 'E2E_TEST_FAILURE',
        severity: 'CRITICAL',
        component: 'e2e-tests',
        count: testResults.e2e.failed,
        description: `${testResults.e2e.failed} 个端到端测试失败`,
        impact: '用户体验',
        weight: this.config.feedbackWeight.testFailure * 1.5 // E2E问题最严重
      });
    }

    return issues;
  }

  /**
   * 分析质量反馈
   */
  analyzeQualityFeedback(qualityResults, context) {
    const issues = [];

    // 检查质量分数
    if (qualityResults.overallScore && qualityResults.overallScore < 0.7) {
      issues.push({
        type: 'LOW_OVERALL_QUALITY',
        severity: 'HIGH',
        component: 'overall-quality',
        score: qualityResults.overallScore,
        description: `整体质量分数过低: ${qualityResults.overallScore.toFixed(2)}`,
        threshold: 0.7,
        impact: '代码健康度',
        weight: this.config.feedbackWeight.qualityIssue
      });
    }

    // 检查各维度质量
    if (qualityResults.details) {
      for (const [dimension, result] of Object.entries(qualityResults.details)) {
        if (result.score && result.score < 0.7) {
          issues.push({
            type: `LOW_${dimension.toUpperCase()}_QUALITY`,
            severity: result.score < 0.5 ? 'CRITICAL' : 'HIGH',
            component: dimension,
            score: result.score,
            description: `${dimension} 质量分数过低: ${result.score.toFixed(2)}`,
            impact: this.getQualityDimensionImpact(dimension),
            weight: this.config.feedbackWeight.qualityIssue
          });
        }
      }
    }

    return issues;
  }

  /**
   * 分析性能反馈
   */
  analyzePerformanceFeedback(performanceResults, context) {
    const issues = [];

    if (performanceResults) {
      // 检查响应时间
      if (performanceResults.avgResponseTime && performanceResults.avgResponseTime > 2000) { // 2秒以上
        issues.push({
          type: 'HIGH_RESPONSE_TIME',
          severity: 'MEDIUM',
          component: 'performance',
          value: performanceResults.avgResponseTime,
          description: `平均响应时间过高: ${performanceResults.avgResponseTime}ms`,
          threshold: 2000,
          impact: '用户体验',
          weight: this.config.feedbackWeight.performanceIssue
        });
      }

      // 检查内存使用
      if (performanceResults.memoryUsage && performanceResults.memoryUsage > 1000) { // 1GB以上
        issues.push({
          type: 'HIGH_MEMORY_USAGE',
          severity: 'HIGH',
          component: 'performance',
          value: performanceResults.memoryUsage,
          description: `内存使用过高: ${performanceResults.memoryUsage}MB`,
          threshold: 1000,
          impact: '系统稳定性',
          weight: this.config.feedbackWeight.performanceIssue
        });
      }

      // 检查CPU使用率
      if (performanceResults.cpuUsage && performanceResults.cpuUsage > 80) { // 80%以上
        issues.push({
          type: 'HIGH_CPU_USAGE',
          severity: 'MEDIUM',
          component: 'performance',
          value: performanceResults.cpuUsage,
          description: `CPU使用率过高: ${performanceResults.cpuUsage}%`,
          threshold: 80,
          impact: '系统性能',
          weight: this.config.feedbackWeight.performanceIssue
        });
      }
    }

    return issues;
  }

  /**
   * 获取质量维度影响
   */
  getQualityDimensionImpact(dimension) {
    const impactMap = {
      functionality: '功能完整性',
      reliability: '系统稳定性',
      usability: '用户体验',
      efficiency: '运行效率',
      maintainability: '维护成本',
      portability: '部署灵活性'
    };

    return impactMap[dimension] || '一般影响';
  }

  /**
   * 执行根本原因分析
   */
  performRootCauseAnalysis(issues) {
    const rootCauses = [];

    // 分析重复出现的模式
    const typeFrequency = {};
    for (const issue of issues) {
      typeFrequency[issue.type] = (typeFrequency[issue.type] || 0) + 1;
    }

    // 分析组件级别的集中问题
    const componentIssues = {};
    for (const issue of issues) {
      if (issue.component) {
        if (!componentIssues[issue.component]) {
          componentIssues[issue.component] = [];
        }
        componentIssues[issue.component].push(issue);
      }
    }

    // 识别根本原因
    for (const [type, count] of Object.entries(typeFrequency)) {
      if (count > 1) {
        rootCauses.push({
          type: 'PATTERN_REPETITION',
          rootCause: `问题类型 ${type} 重复出现 ${count} 次`,
          affectedComponents: this.getAffectedComponentsByType(issues, type),
          probability: count / issues.length
        });
      }
    }

    // 分析组件级根本原因
    for (const [component, componentIssueList] of Object.entries(componentIssues)) {
      if (componentIssueList.length > 1) {
        // 计算组件问题密度
        const severityScore = componentIssueList.reduce((sum, issue) => {
          return sum + this.getSeverityScore(issue.severity);
        }, 0) / componentIssueList.length;

        rootCauses.push({
          type: 'COMPONENT_CONCENTRATION',
          rootCause: `${component} 组件问题集中`,
          component,
          issueCount: componentIssueList.length,
          averageSeverity: this.getSeverityLabel(severityScore),
          probability: componentIssueList.length / issues.length
        });
      }
    }

    return rootCauses;
  }

  /**
   * 获取组件类型的问题
   */
  getAffectedComponentsByType(issues, targetType) {
    return [...new Set(
      issues
        .filter(issue => issue.type === targetType)
        .map(issue => issue.component)
        .filter(comp => comp)
    )];
  }

  /**
   * 获取严重性分数
   */
  getSeverityScore(severity) {
    const scores = {
      'LOW': 0.3,
      'MEDIUM': 0.5,
      'HIGH': 0.7,
      'CRITICAL': 1.0
    };

    return scores[severity] || 0.5;
  }

  /**
   * 获取严重性标签
   */
  getSeverityLabel(score) {
    if (score >= 0.8) return 'CRITICAL';
    if (score >= 0.6) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * 识别模式
   */
  identifyPatterns(issues) {
    const patterns = [];

    // 时间模式（如果有时间信息）
    const timeBasedPatterns = this.analyzeTimePatterns(issues);
    if (timeBasedPatterns.length > 0) {
      patterns.push(...timeBasedPatterns);
    }

    // 类型聚集模式
    const typeClusterPatterns = this.analyzeTypeClusters(issues);
    if (typeClusterPatterns.length > 0) {
      patterns.push(...typeClusterPatterns);
    }

    // 严重性分布模式
    const severityPatterns = this.analyzeSeverityDistribution(issues);
    if (severityPatterns.length > 0) {
      patterns.push(...severityPatterns);
    }

    return patterns;
  }

  /**
   * 分析时间模式
   */
  analyzeTimePatterns(issues) {
    // 此处简化处理，实际情况可能需要时间戳信息
    return [];
  }

  /**
   * 分析类型聚集
   */
  analyzeTypeClusters(issues) {
    const clusters = {};
    for (const issue of issues) {
      if (!clusters[issue.type]) {
        clusters[issue.type] = 0;
      }
      clusters[issue.type]++;
    }

    const patternClusters = [];
    for (const [type, count] of Object.entries(clusters)) {
      if (count > 1) {
        patternClusters.push({
          type: 'TYPE_CLUSTER',
          pattern: `类型 ${type} 出现 ${count} 次`,
          count,
          type
        });
      }
    }

    return patternClusters;
  }

  /**
   * 分析严重性分布
   */
  analyzeSeverityDistribution(issues) {
    const severityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const issue of issues) {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
    }

    const total = issues.length;
    const distributions = [];
    for (const [severity, count] of Object.entries(severityCounts)) {
      if (count > 0) {
        const percentage = count / total;
        distributions.push({
          type: 'SEVERITY_DISTRIBUTION',
          severity,
          count,
          percentage,
          pattern: `${severity} 严重性问题占比 ${Math.round(percentage * 100)}%`
        });
      }
    }

    return distributions;
  }

  /**
   * 生成改进建议
   */
  generateImprovementSuggestions(analysis) {
    const suggestions = [];

    // 根据根本原因生成建议
    for (const rootCause of analysis.rootCauses) {
      if (rootCause.type === 'PATTERN_REPETITION') {
        suggestions.push({
          target: 'general',
          suggestion: `针对 ${rootCause.rootCause} 需要加强相关质量控制`,
          priority: 'HIGH'
        });
      } else if (rootCause.type === 'COMPONENT_CONCENTRATION') {
        suggestions.push({
          target: rootCause.component,
          suggestion: `重点审查和重构 ${rootCause.component} 组件，存在问题较多`,
          priority: rootCause.averageSeverity === 'CRITICAL' ? 'CRITICAL' : 'HIGH'
        });
      }
    }

    // 根据具体问题生成建议
    for (const issue of analysis.issues) {
      if (issue.type === 'UNIT_TEST_FAILURE') {
        suggestions.push({
          target: issue.component,
          suggestion: `增加单元测试覆盖，特别是针对失败的测试用例`,
          priority: 'HIGH'
        });
      } else if (issue.type === 'LOW_FUNCTIONALITY_QUALITY') {
        suggestions.push({
          target: issue.component,
          suggestion: `检查功能实现的完整性，补充必要的功能逻辑`,
          priority: 'HIGH'
        });
      } else if (issue.type === 'HIGH_RESPONSE_TIME') {
        suggestions.push({
          target: 'performance',
          suggestion: `优化代码性能，检查是否存在性能瓶颈`,
          priority: 'MEDIUM'
        });
      }
    }

    return [...new Set(suggestions.map(JSON.stringify))].map(JSON.parse); // 去重
  }

  /**
   * 按优先级排序
   */
  rankByPriority(issues) {
    // 按照严重性、权重和影响排序
    return [...issues]
      .sort((a, b) => {
        // 首先按严重性排序
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        if (severityDiff !== 0) return severityDiff;

        // 然后按权重排序
        const weightDiff = (b.weight || 0) - (a.weight || 0);
        if (weightDiff !== 0) return weightDiff;

        // 最后按影响排序
        const impactOrder = { '系统稳定性': 4, '用户体验': 3, '功能完整性': 3, '运行效率': 2, '一般影响': 1 };
        return (impactOrder[b.impact] || 0) - (impactOrder[a.impact] || 0);
      })
      .map((issue, index) => ({
        ...issue,
        rank: index + 1,
        priority: this.calculatePriorityScore(issue)
      }));
  }

  /**
   * 计算优先级分数
   */
  calculatePriorityScore(issue) {
    const severityWeights = { 'CRITICAL': 1.0, 'HIGH': 0.8, 'MEDIUM': 0.6, 'LOW': 0.4 };
    const weight = issue.weight || 0.5;
    const severityFactor = severityWeights[issue.severity] || 0.5;

    // 考虑问题数量的影响
    const countFactor = issue.count ? Math.min(issue.count * 0.1, 0.3) : 0;

    return Math.min(weight * severityFactor + countFactor, 1.0);
  }

  /**
   * 生成总体评估
   */
  generateOverallAssessment(analysis) {
    if (analysis.issues.length === 0) {
      return 'EXCELLENT';
    }

    const avgPriority = analysis.priorityRankings.reduce((sum, item) => sum + item.priority, 0) /
                        (analysis.priorityRankings.length || 1);

    if (avgPriority >= 0.8) {
      return 'CRITICAL_ISSUES';
    } else if (avgPriority >= 0.6) {
      return 'SIGNIFICANT_ISSUES';
    } else if (avgPriority >= 0.4) {
      return 'MODERATE_ISSUES';
    } else {
      return 'MINOR_ISSUES';
    }
  }

  /**
   * 计算置信度
   */
  calculateConfidence(analysis) {
    // 置信度基于问题数量、分析完整性等因素
    const issueCount = analysis.issues.length;
    const rootCauseCount = analysis.rootCauses.length;
    const patternCount = analysis.patterns?.length || 0;

    // 基础置信度
    let confidence = 0.5;

    // 增加更多问题和分析维度会提高置信度
    confidence += Math.min(issueCount * 0.05, 0.2); // 最多增加20%
    confidence += Math.min(rootCauseCount * 0.08, 0.15); // 最多增加15%
    confidence += Math.min(patternCount * 0.05, 0.15); // 最多增加15%

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成推荐
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // 根据总体评估生成推荐
    switch (analysis.overallAssessment) {
      case 'EXCELLENT':
        recommendations.push({
          type: 'MAINTAIN_CURRENT',
          priority: 'LOW',
          description: '当前质量良好，建议维持现有开发实践',
          actions: ['继续当前开发实践', '定期质量检查']
        });
        break;

      case 'MINOR_ISSUES':
        recommendations.push({
          type: 'MINOR_IMPROVEMENTS',
          priority: 'MEDIUM',
          description: '存在少量问题，建议进行小幅改进',
          actions: ['修复低优先级问题', '优化代码结构']
        });
        break;

      case 'MODERATE_ISSUES':
        recommendations.push({
          type: 'TARGETED_IMPROVEMENTS',
          priority: 'HIGH',
          description: '存在一定问题，建议针对性改进',
          actions: ['修复中高优先级问题', '加强代码审查', '改进测试覆盖']
        });
        break;

      case 'SIGNIFICANT_ISSUES':
        recommendations.push({
          type: 'SUBSTANTIAL_IMPROVEMENTS',
          priority: 'HIGH',
          description: '问题较严重，建议大幅改进',
          actions: ['优先修复高危问题', '重构问题模块', '加强质量控制']
        });
        break;

      case 'CRITICAL_ISSUES':
        recommendations.push({
          type: 'URGENT_ACTION',
          priority: 'CRITICAL',
          description: '存在严重问题，需立即处理',
          actions: ['立即修复关键问题', '暂停发布', '全面质量审查']
        });
        break;
    }

    // 添加具体的行动建议
    const topPriorities = analysis.priorityRankings.slice(0, 3);
    if (topPriorities.length > 0) {
      recommendations.push({
        type: 'SPECIFIC_ACTIONS',
        priority: 'HIGH',
        description: '高优先级问题修复建议',
        actions: topPriorities.map(item => `修复${item.type}问题 - ${item.description}`)
      });
    }

    return recommendations;
  }
}

module.exports = FeedbackAnalyzer;