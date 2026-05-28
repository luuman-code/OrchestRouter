/**
 * DebugInfoManager - 调试信息管理器
 *
 * 功能块 G：调试与监控层
 * 全程记录调试信息、生成分析报告
 */

class DebugInfoManager {
  constructor(config = {}) {
    this.enabled = config.debug || config.logLevel === 'debug' || false;
    this.maxDebugHistory = config.maxDebugHistory || 100;
    this.debugHistory = [];

    // 性能监控
    this.performanceMetrics = {
      startTime: null,
      taskTimings: [],
      memoryUsage: []
    };

    // 统计信息
    this.stats = {
      tasksProcessed: 0,
      conflictsResolved: 0,
      typesDetected: {},
      templatesUsed: {}
    };
  }

  /**
   * 记录调试信息
   */
  record(debugInfo, context = {}) {
    if (!this.enabled) return;

    const record = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      debugInfo: debugInfo,
      context: context,
      size: JSON.stringify(debugInfo).length
    };

    this.debugHistory.push(record);
    if (this.debugHistory.length > this.maxDebugHistory) {
      this.debugHistory.shift();
    }
  }

  /**
   * 记录类型检测信息
   */
  recordTypeDetection(input, detectedType, confidence, sources = []) {
    if (!this.enabled) return;

    const detectionRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'typeDetection',
      input: input,
      detectedType: detectedType,
      confidence: confidence,
      sources: sources
    };

    this.debugHistory.push(detectionRecord);
    if (this.debugHistory.length > this.maxDebugHistory) {
      this.debugHistory.shift();
    }
  }

  /**
   * 记录语义分析信息
   */
  recordSemanticAnalysis(item1, item2, similarityScore, analysisDetails = {}) {
    if (!this.enabled) return;

    const analysisRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'semanticAnalysis',
      items: [item1, item2],
      similarityScore: similarityScore,
      details: analysisDetails
    };

    this.debugHistory.push(analysisRecord);
    if (this.debugHistory.length > this.maxDebugHistory) {
      this.debugHistory.shift();
    }
  }

  /**
   * 记录冲突解决信息
   */
  recordConflictResolution(conflict, resolutionResult) {
    if (!this.enabled) return;

    const conflictRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'conflictResolution',
      conflict: conflict,
      resolution: resolutionResult
    };

    this.debugHistory.push(conflictRecord);
    if (this.debugHistory.length > this.maxDebugHistory) {
      this.debugHistory.shift();
    }
  }

  /**
   * 记录完整任务处理流程
   */
  recordTaskProcessing(inputTask, outputSubtasks, processingStats = {}) {
    if (!this.enabled) return;

    const taskRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'taskProcessing',
      inputTask: inputTask,
      outputSubtasks: outputSubtasks,
      stats: {
        inputDeliverables: inputTask.deliverables?.length || 0,
        outputSubtasks: outputSubtasks.length,
        processingTime: processingStats.processingTime || 0,
        typesDistribution: this.getTypesDistribution(outputSubtasks),
        ...processingStats
      }
    };

    this.debugHistory.push(taskRecord);
    if (this.debugHistory.length > this.maxDebugHistory) {
      this.debugHistory.shift();
    }
  }

  /**
   * 获取类型分布
   */
  getTypesDistribution(subtasks) {
    const distribution = {};
    subtasks.forEach(task => {
      const type = task.type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    return distribution;
  }

  /**
   * 记录性能指标
   */
  recordPerformance(event, durationMs, additionalData = {}) {
    if (!this.enabled) return;

    const metric = {
      event,
      durationMs,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    this.performanceMetrics.taskTimings.push(metric);

    // 限制历史记录数量
    if (this.performanceMetrics.taskTimings.length > this.maxDebugHistory) {
      this.performanceMetrics.taskTimings.shift();
    }
  }

  /**
   * 记录统计信息
   */
  incrementStat(statName, value = 1) {
    if (statName === 'typesDetected' || statName === 'templatesUsed') {
      // 对象类型统计
      if (!this.stats[statName]) this.stats[statName] = {};
    } else {
      // 数值类型统计
      if (!this.stats[statName]) this.stats[statName] = 0;
      this.stats[statName] += value;
    }
  }

  /**
   * 开始任务计时
   */
  startTiming() {
    if (this.enabled) {
      this.performanceMetrics.startTime = Date.now();
    }
  }

  /**
   * 结束任务计时
   */
  endTiming() {
    if (this.enabled && this.performanceMetrics.startTime) {
      const totalTime = Date.now() - this.performanceMetrics.startTime;
      this.recordPerformance('totalProcessingTime', totalTime);
      this.performanceMetrics.startTime = null;
      return totalTime;
    }
    return 0;
  }

  /**
   * 获取开始时间（用于外部计时）
   */
  getStartTime() {
    return this.performanceMetrics.startTime;
  }

  /**
   * 获取分析报告
   */
  getAnalysisReport() {
    if (!this.enabled) {
      return { enabled: false };
    }

    const stats = {
      totalRecords: this.debugHistory.length,
      avgTagSources: 0,
      avgMatchedRules: 0,
      ruleEffectiveness: {},
      commonWarnings: {},
      ...this.stats
    };

    let totalTagSources = 0, totalMatchedRules = 0;

    this.debugHistory.forEach(record => {
      const debug = record.debugInfo || {};

      // 统计标签来源
      if (debug.tagSources && Array.isArray(debug.tagSources)) {
        totalTagSources += debug.tagSources.length;
      }

      // 统计匹配规则
      if (debug.matchedRules && Array.isArray(debug.matchedRules)) {
        totalMatchedRules += debug.matchedRules.length;

        debug.matchedRules.forEach(rule => {
          const ruleId = rule.ruleId || 'unnamed_rule';
          if (!stats.ruleEffectiveness[ruleId]) {
            stats.ruleEffectiveness[ruleId] = { count: 0, avgConfidence: 0, totalConfidence: 0 };
          }
          stats.ruleEffectiveness[ruleId].count++;
          stats.ruleEffectiveness[ruleId].totalConfidence += rule.confidence || 0;
        });
      }

      // 统计警告
      if (debug.warnings && Array.isArray(debug.warnings)) {
        debug.warnings.forEach(warning => {
          const warningType = warning.type || 'unknown';
          if (!stats.commonWarnings[warningType]) {
            stats.commonWarnings[warningType] = 0;
          }
          stats.commonWarnings[warningType]++;
        });
      }
    });

    stats.avgTagSources = this.debugHistory.length > 0 ? totalTagSources / this.debugHistory.length : 0;
    stats.avgMatchedRules = this.debugHistory.length > 0 ? totalMatchedRules / this.debugHistory.length : 0;

    // 计算平均置信度
    Object.keys(stats.ruleEffectiveness).forEach(ruleId => {
      const rule = stats.ruleEffectiveness[ruleId];
      rule.avgConfidence = rule.count > 0 ? rule.totalConfidence / rule.count : 0;
    });

    // 性能指标
    const performanceReport = this.getPerformanceReport();

    return {
      ...stats,
      ...performanceReport,
      enabled: this.enabled,
      analysisPeriod: this.debugHistory.length > 0 ?
        `${this.debugHistory[0].timestamp} to ${this.debugHistory[this.debugHistory.length - 1].timestamp}` : 'No data'
    };
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    if (this.performanceMetrics.taskTimings.length === 0) {
      return {
        performance: {
          avgDuration: 0,
          maxDuration: 0,
          minDuration: 0,
          totalEvents: 0
        }
      };
    }

    const durations = this.performanceMetrics.taskTimings.map(timing => timing.durationMs);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      performance: {
        avgDuration: sum / durations.length,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        minDuration: durations.length > 0 ? Math.min(...durations) : 0,
        totalEvents: durations.length,
        totalTime: sum
      }
    };
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * 获取当前调试历史
   */
  getDebugHistory() {
    return this.debugHistory;
  }

  /**
   * 清除调试历史
   */
  clearHistory() {
    this.debugHistory = [];
    this.performanceMetrics.taskTimings = [];
    this.stats = {
      tasksProcessed: 0,
      conflictsResolved: 0,
      typesDetected: {},
      templatesUsed: {}
    };
  }

  /**
   * 获取汇总的日志信息
   */
  getLogSummary() {
    if (!this.enabled) {
      return "调试功能未启用";
    }

    const report = this.getAnalysisReport();

    return `
=== 分解器调试摘要 ===
总处理任务数: ${report.tasksProcessed}
冲突解决数: ${report.conflictsResolved}
总调试记录: ${report.totalRecords}
平均标签来源数: ${report.avgTagSources.toFixed(2)}
平均匹配规则数: ${report.avgMatchedRules.toFixed(2)}
性能指标:
  - 平均处理时间: ${report.performance.avgDuration.toFixed(2)}ms
  - 最长处理时间: ${report.performance.maxDuration}ms
  - 最短处理时间: ${report.performance.minDuration}ms
检测到的类型分布: ${Object.entries(report.typesDetected).map(([type, count]) => `${type}(${count})`).join(', ')}
使用的模板分布: ${Object.entries(report.templatesUsed).map(([template, count]) => `${template}(${count})`).join(', ')}
=======================
    `.trim();
  }
}

module.exports = DebugInfoManager;
