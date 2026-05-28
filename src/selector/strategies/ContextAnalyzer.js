/**
 * 任务上下文分析器
 * 分析任务描述以确定上下文特征
 */
class ContextAnalyzer {
  /**
   * 分析任务上下文
   * @param {Object} subtask - 子任务对象
   * @returns {Object} 上下文分析结果
   */
  analyzeContext(subtask) {
    const description = subtask.description || '';
    const taskType = subtask.type || '';

    return {
      securityCritical: this.containsSecurityKeywords(description),
      highUncertainty: (subtask.confidence && subtask.confidence < 0.6) || this.containsUncertaintyKeywords(description),
      repetitiveTask: this.containsRepetitiveKeywords(description),
      performanceSensitive: this.containsPerformanceKeywords(description)
    };
  }

  /**
   * 检查是否包含安全关键词
   */
  containsSecurityKeywords(description) {
    const securityKeywords = [
      'security', 'secure', 'authentication', 'authorization',
      'crypto', 'encryption', 'password', 'auth', 'oauth',
      '安全', '认证', '授权', '加密', '密码', 'SSL', 'TLS',
      'certificate', 'certificates', 'certificate_validation'
    ];
    return securityKeywords.some(keyword =>
      description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查是否包含不确定性关键词
   */
  containsUncertaintyKeywords(description) {
    const uncertaintyKeywords = [
      'uncertain', 'experimental', 'prototype', 'research',
      'test', 'experiment', 'alpha', 'beta', 'draft',
      '尝试', '实验', '原型', '研究', '测试', '草案', '概念验证'
    ];
    return uncertaintyKeywords.some(keyword =>
      description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查是否包含重复性关键词
   */
  containsRepetitiveKeywords(description) {
    const repetitiveKeywords = [
      'repeat', 'routine', 'regular', 'maintenance', 'update',
      'maintenance', 'routine', '重复', '常规', '例行',
      '维护', '更新', '日常', '批量', '定时', 'cron', 'schedule'
    ];
    return repetitiveKeywords.some(keyword =>
      description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查是否包含性能关键词
   */
  containsPerformanceKeywords(description) {
    const performanceKeywords = [
      'performance', 'optimize', 'efficiency', 'speed',
      'fast', 'quick', 'latency', 'throughput', 'response_time',
      '性能', '优化', '效率', '速度', '快速', '延迟', '吞吐量',
      '响应时间', '并发', '吞吐率', 'QPS', 'TPS'
    ];
    return performanceKeywords.some(keyword =>
      description.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}

module.exports = ContextAnalyzer;