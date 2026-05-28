/**
 * 问题分类器
 *
 * 分析错误和问题类型，决定使用哪个迭代层级处理
 */

class ProblemClassifier {
  constructor(config = {}) {
    this.config = {
      // 简单错误阈值（使用 L1 快速修复）
      simpleErrorThreshold: config.simpleErrorThreshold || 3,
      // 模块问题阈值（使用 L2 局部改进）
      moduleIssueThreshold: config.moduleIssueThreshold || 10,
      // 严重性阈值（超过则使用 L3 完整迭代）
      severityThreshold: config.severityThreshold || 0.7,
      ...config
    };

    // 错误模式定义
    this.errorPatterns = {
      SYNTAX_ERROR: [
        /unexpected token/i,
        /syntax error/i,
        /missing [;}]/i,
        /unexpected character/i
      ],
      REFERENCE_ERROR: [
        /is not defined/i,
        /cannot read property.*of undefined/i,
        /null.*not an object/i
      ],
      TYPE_ERROR: [
        /is not a function/i,
        /cannot read property/i,
        /undefined is not a function/i
      ],
      IMPORT_ERROR: [
        /cannot find module/i,
        /module.*not found/i,
        /import.*failed/i
      ],
      ASSERTION_ERROR: [
        /assertion failed/i,
        /expected.*but got/i,
        /test.*failed/i
      ]
    };

    // 严重程度权重
    this.severityWeights = {
      SYNTAX_ERROR: 0.3,      // 简单，L1
      REFERENCE_ERROR: 0.5,   // 中等，L1-L2
      TYPE_ERROR: 0.5,        // 中等，L1-L2
      IMPORT_ERROR: 0.4,      // 简单，L1
      ASSERTION_ERROR: 0.8,   // 复杂，L2-L3
      ARCHITECTURE_ISSUE: 1.0 // 严重，L3
    };
  }

  /**
   * 分类问题并决定处理层级
   */
  async classify(problem) {
    const analysis = {
      type: null,
      severity: 0,
      suggestedLevel: null,
      confidence: 0,
      details: {},
      recommendedAction: null
    };

    // 1. 识别错误类型
    analysis.type = this.identifyErrorType(problem);

    // 2. 评估严重程度
    analysis.severity = this.assessSeverity(analysis.type, problem);

    // 3. 确定处理层级
    analysis.suggestedLevel = this.determineHandlingLevel(analysis);

    // 4. 生成推荐操作
    analysis.recommendedAction = this.generateRecommendedAction(analysis, problem);

    // 5. 计算置信度
    analysis.confidence = this.calculateConfidence(analysis);

    return analysis;
  }

  /**
   * 识别错误类型
   */
  identifyErrorType(problem) {
    const message = problem.message || '';
    const stack = problem.stack || '';
    const combinedText = message + ' ' + stack;

    for (const [type, patterns] of Object.entries(this.errorPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(combinedText)) {
          return type;
        }
      }
    }

    // 检查是否为架构问题
    if (this.isArchitectureIssue(problem)) {
      return 'ARCHITECTURE_ISSUE';
    }

    return 'UNKNOWN';
  }

  /**
   * 评估严重程度
   */
  assessSeverity(type, problem) {
    const baseSeverity = this.severityWeights[type] || 0.5;

    // 根据影响范围调整
    const affectedFiles = problem.affectedFiles?.length || 1;
    const scopeMultiplier = Math.min(affectedFiles * 0.1, 0.3);

    // 根据发生频率调整
    const frequency = problem.occurrenceCount || 1;
    const frequencyMultiplier = Math.min(frequency * 0.05, 0.2);

    return Math.min(baseSeverity + scopeMultiplier + frequencyMultiplier, 1.0);
  }

  /**
   * 确定处理层级
   */
  determineHandlingLevel(analysis) {
    const severity = analysis.severity;

    if (severity <= this.config.simpleErrorThreshold) {
      return 'L1'; // 快速修复
    }
    if (severity <= this.config.moduleIssueThreshold) {
      return 'L2'; // 局部改进
    }
    return 'L3'; // 完整迭代
  }

  /**
   * 生成推荐操作
   */
  generateRecommendedAction(analysis, problem) {
    switch (analysis.suggestedLevel) {
      case 'L1':
        return {
          type: 'QUICK_FIX',
          description: '使用 Claude Code 快速修复',
          targetFiles: problem.affectedFiles || [],
          expectedDuration: '< 1 分钟'
        };
      case 'L2':
        return {
          type: 'LOCAL_IMPROVEMENT',
          description: '局部模块改进',
          modules: this.identifyAffectedModules(problem),
          expectedDuration: '1-5 分钟'
        };
      case 'L3':
        return {
          type: 'FULL_ITERATION',
          description: '完整迭代流程',
          reason: analysis.type === 'ARCHITECTURE_ISSUE' ? '架构问题需要系统性改进' : '问题复杂度较高',
          expectedDuration: '5-15 分钟'
        };
    }
  }

  /**
   * 检查是否为架构问题
   */
  isArchitectureIssue(problem) {
    const indicators = [
      'circular dependency',
      'architecture',
      'design pattern',
      'scalability',
      'performance bottleneck',
      'security vulnerability'
    ];

    const text = (problem.message + ' ' + problem.description || '').toLowerCase();
    return indicators.some(indicator => text.includes(indicator));
  }

  /**
   * 识别受影响的模块
   */
  identifyAffectedModules(problem) {
    const modules = new Set();

    if (problem.affectedFiles) {
      for (const file of problem.affectedFiles) {
        // 从文件路径提取模块名
        const parts = file.split('/');
        if (parts.length >= 2) {
          modules.add(parts[parts.length - 2]);
        }
      }
    }

    return Array.from(modules);
  }

  /**
   * 计算置信度
   */
  calculateConfidence(analysis) {
    // 基于错误类型识别的置信度
    if (analysis.type === 'UNKNOWN') {
      return 0.5;
    }

    // 基于严重程度的置信度
    if (analysis.severity > 0.8 || analysis.severity < 0.2) {
      return 0.9;
    }

    return 0.7; // 中等置信度
  }

  /**
   * 批量分类多个问题
   */
  async classifyBatch(problems) {
    const results = await Promise.all(
      problems.map(problem => this.classify(problem))
    );

    // 确定整体处理策略
    const overallLevel = this.determineOverallLevel(results);

    return {
      classifications: results,
      overallLevel,
      summary: this.generateSummary(results)
    };
  }

  /**
   * 确定整体处理层级
   */
  determineOverallLevel(classifications) {
    // 如果有任何 L3 问题，整体使用 L3
    if (classifications.some(c => c.suggestedLevel === 'L3')) {
      return 'L3';
    }
    // 如果有任何 L2 问题，整体使用 L2
    if (classifications.some(c => c.suggestedLevel === 'L2')) {
      return 'L2';
    }
    // 否则使用 L1
    return 'L1';
  }

  /**
   * 生成摘要
   */
  generateSummary(classifications) {
    const summary = {
      totalProblems: classifications.length,
      levelDistribution: {
        L1: classifications.filter(c => c.suggestedLevel === 'L1').length,
        L2: classifications.filter(c => c.suggestedLevel === 'L2').length,
        L3: classifications.filter(c => c.suggestedLevel === 'L3').length
      },
      typeDistribution: {},
      averageSeverity: 0
    };

    // 类型分布
    for (const c of classifications) {
      summary.typeDistribution[c.type] =
        (summary.typeDistribution[c.type] || 0) + 1;
    }

    // 平均严重程度
    summary.averageSeverity = classifications.reduce(
      (sum, c) => sum + c.severity, 0
    ) / classifications.length;

    return summary;
  }
}

module.exports = ProblemClassifier;