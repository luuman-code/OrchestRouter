/**
 * 学习型选择器
 * 功能块 F: 历史反馈与学习层 (可选增强)
 */
const BayesianPerformanceEstimator = require('./BayesianPerformanceEstimator');

class LearningSelector {
  constructor(config = {}) {
    this.feedbackHistory = [];
    this.modelPerformanceByType = new Map(); // 按任务类型的模型性能
    this.config = {
      persistenceType: config.persistenceType || 'file', // 'file', 'redis', 'database'
      persistencePath: config.persistencePath || './learning-data.json', // 文件路径
      redisConfig: config.redisConfig || null, // Redis配置
      dbConfig: config.dbConfig || null, // 数据库配置
      syncInterval: config.syncInterval || 30000 // 同步间隔，默认30秒
    }; // 持久化配置
    this.complexityAdjustmentEnabled = true; // 是否启用复杂度调整
    this.performanceWindows = new Map(); // 滑动窗口性能统计
    this.bayesianEstimator = new BayesianPerformanceEstimator(); // 贝叶斯性能估计器

    // 初始化持久化存储
    this.initializePersistence();

    // 加载持久化的学习数据
    this.loadPersistentData();
  }

  /**
   * 记录任务反馈（增强版）
   * @param {string} taskId - 任务ID
   * @param {string} taskType - 任务类型
   * @param {string} modelId - 模型ID
   * @param {Object} qualityMetrics - 质量指标对象
   * @param {number} qualityMetrics.overallScore - 整体质量分数 (0-1)
   * @param {number} qualityMetrics.codeQualityScore - 代码质量分数 (0-1)
   * @param {number} qualityMetrics.performanceScore - 性能分数 (0-1)
   * @param {number} qualityMetrics.accuracyScore - 准确性分数 (0-1)
   * @param {number} qualityMetrics.taskComplexity - 任务复杂度 (0-1)
   * @param {Object} additionalContext - 额外上下文信息
   */
  recordFeedback(taskId, taskType, modelId, qualityMetrics, additionalContext = {}) {
    // 确保qualityMetrics是正确的格式
    if (typeof qualityMetrics === 'number') {
      // 向后兼容：如果传入的是数字，转换为对象，需要将其归一化到0-1之间
      const normalizedScore = Math.min(1.0, Math.max(0.0, qualityMetrics / 10.0)); // 假设传入的是0-10分制，需要归一化到0-1
      qualityMetrics = {
        overallScore: normalizedScore,
        codeQualityScore: normalizedScore,
        performanceScore: normalizedScore,
        accuracyScore: normalizedScore,
        taskComplexity: 0.5 // 默认复杂度
      };
    } else if (typeof qualityMetrics === 'object' && qualityMetrics.overallScore) {
      // 如果是对象但是分数不是0-1之间，也进行归一化
      if (qualityMetrics.overallScore > 1.0) {
        qualityMetrics.overallScore = Math.min(1.0, Math.max(0.0, qualityMetrics.overallScore / 10.0));
      }
    }

    // 如果没有提供taskType，尝试从上下文中获取
    if (!taskType && additionalContext.subtask && additionalContext.subtask.type) {
      taskType = additionalContext.subtask.type;
    }

    // 默认任务类型
    if (!taskType) {
      taskType = 'general';
    }

    const feedback = {
      taskId,
      taskType,
      modelId,
      qualityMetrics,
      additionalContext,
      timestamp: new Date(),
      id: this.generateFeedbackId() // 为反馈生成唯一ID
    };

    this.feedbackHistory.push(feedback);

    // 使用贝叶斯估计器更新性能
    this.bayesianEstimator.updatePerformance(taskType, modelId, qualityMetrics);

    // 更新复杂度调整后的性能统计
    this.updateComplexityAdjustedStats(taskType, modelId, qualityMetrics);

    // 更新滑动窗口性能统计
    this.updatePerformanceWindow(taskType, modelId, qualityMetrics);

    // 保持反馈历史记录在合理范围内
    if (this.feedbackHistory.length > 2000) {
      this.feedbackHistory = this.feedbackHistory.slice(-1500); // 保留最新的1500条记录
    }

    // 定期保存到持久化存储
    if (this.feedbackHistory.length % 10 === 0) {
      this.savePersistentData();
    }
  }

  /**
   * 生成反馈ID
   */
  generateFeedbackId() {
    return `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新复杂度调整后的性能统计
   */
  updateComplexityAdjustedStats(taskType, modelId, qualityMetrics) {
    const key = `${taskType}-${modelId}`;
    const complexity = qualityMetrics.taskComplexity || 0.5;
    const overallScore = qualityMetrics.overallScore;

    if (!this.modelPerformanceByType.has(key)) {
      this.modelPerformanceByType.set(key, {
        modelId,
        taskType,
        totalWeightedScore: overallScore,
        totalWeightedCount: 1,
        adjustedAvgScore: overallScore,
        sampleCount: 1,
        confidence: 0.1, // 初始置信度较低
        lastUpdated: new Date(),
        minScore: overallScore,
        maxScore: overallScore
      });
    } else {
      const stats = this.modelPerformanceByType.get(key);

      // 复杂度调整：更难的任务结果权重更高
      const difficultyWeight = 0.7 + (complexity * 0.6); // 权重范围0.7-1.3

      stats.totalWeightedScore += overallScore * difficultyWeight;
      stats.totalWeightedCount += difficultyWeight;
      stats.sampleCount++;

      // 计算复杂度调整后的平均分
      stats.adjustedAvgScore = stats.totalWeightedScore / stats.totalWeightedCount;

      // 更新置信度（样本越多，置信度越高，但有上限）
      stats.confidence = Math.min(0.95, 0.1 + (Math.log(stats.sampleCount + 1) / 5));

      // 更新极值
      stats.minScore = Math.min(stats.minScore, overallScore);
      stats.maxScore = Math.max(stats.maxScore, overallScore);

      stats.lastUpdated = new Date();
    }
  }

  /**
   * 更新滑动窗口性能统计
   */
  updatePerformanceWindow(taskType, modelId, qualityMetrics) {
    const key = `${taskType}-${modelId}`;
    if (!this.performanceWindows.has(key)) {
      this.performanceWindows.set(key, []);
    }

    const window = this.performanceWindows.get(key);
    const windowEntry = {
      score: qualityMetrics.overallScore,
      timestamp: new Date(),
      complexity: qualityMetrics.taskComplexity || 0.5
    };

    window.push(windowEntry);

    // 保持窗口大小，保留最近100个反馈
    if (window.length > 100) {
      window.shift();
    }
  }

  /**
   * 获取基于贝叶斯估计的性能评分
   */
  getBayesianPerformanceScore(taskType, modelId) {
    return this.bayesianEstimator.getPerformance(taskType, modelId);
  }

  /**
   * 根据历史表现获取最适合某任务类型的模型（增强版）
   * 结合多种评分策略
   */
  getBestModelForType(taskType, strategy = 'bayesian-weighted') {
    const allEntries = Array.from(this.modelPerformanceByType.entries());

    // 过滤特定任务类型的条目
    const relevantEntries = allEntries
      .filter(([key, stats]) => stats.taskType === taskType)
      .map(([key, stats]) => stats);

    if (relevantEntries.length === 0) {
      return null;
    }

    let bestModel;

    switch (strategy) {
      case 'bayesian-weighted':
        // 使用贝叶斯估计的加权评分
        bestModel = relevantEntries
          .map(stats => {
            const bayesianScore = this.getBayesianPerformanceScore(stats.taskType, stats.modelId);
            // 结合置信度进行调整
            const adjustedScore = bayesianScore.mean * (0.8 + 0.2 * bayesianScore.confidence);
            return { ...stats, combinedScore: adjustedScore };
          })
          .sort((a, b) => b.combinedScore - a.combinedScore)[0];
        break;

      case 'complexity-adjusted':
        // 使用复杂度调整后的平均评分
        bestModel = relevantEntries
          .sort((a, b) => b.adjustedAvgScore - a.adjustedAvgScore)[0];
        break;

      case 'recent-performance':
        // 考虑近期表现的评分
        bestModel = relevantEntries
          .map(stats => {
            const recentWindow = this.getRecentPerformance(stats.taskType, stats.modelId);
            const recentAvg = recentWindow.length > 0 ?
              recentWindow.reduce((sum, entry) => sum + entry.score, 0) / recentWindow.length : 0;

            // 结合长期和短期表现
            const longTermWeight = Math.min(1.0, stats.sampleCount / 10); // 样本数越多样本权重越大
            const combinedScore = (stats.adjustedAvgScore * longTermWeight + recentAvg * (1 - longTermWeight));

            return { ...stats, combinedScore };
          })
          .sort((a, b) => b.combinedScore - a.combinedScore)[0];
        break;

      default:
        // 默认使用复杂度调整后的平均评分
        bestModel = relevantEntries
          .sort((a, b) => b.adjustedAvgScore - a.adjustedAvgScore)[0];
    }

    return bestModel ? bestModel.modelId : null;
  }

  /**
   * 获取模型在特定任务类型上的近期表现
   */
  getRecentPerformance(taskType, modelId) {
    const key = `${taskType}-${modelId}`;
    return this.performanceWindows.get(key) || [];
  }

  /**
   * 获取任务类型的所有可用模型及其性能
   */
  getAllModelsPerformanceForType(taskType) {
    const allEntries = Array.from(this.modelPerformanceByType.entries());
    return allEntries
      .filter(([key, stats]) => stats.taskType === taskType)
      .map(([key, stats]) => {
        const bayesianScore = this.getBayesianPerformanceScore(stats.taskType, stats.modelId);
        return {
          ...stats,
          bayesianMean: bayesianScore.mean,
          bayesianConfidence: bayesianScore.confidence,
          bayesianLowerBound: bayesianScore.lowerBound,
          bayesianUpperBound: bayesianScore.upperBound
        };
      })
      .sort((a, b) => b.adjustedAvgScore - a.adjustedAvgScore);
  }

  /**
   * 初始化持久化存储
   */
  initializePersistence() {
    switch(this.config.persistenceType) {
      case 'redis':
        // 初始化Redis客户端
        if (this.config.redisConfig) {
          try {
            const Redis = require('ioredis');
            this.redisClient = new Redis(this.config.redisConfig);
          } catch (error) {
            console.warn('Redis初始化失败，降级到文件存储:', error.message);
            this.config.persistenceType = 'file';
          }
        }
        break;
      case 'database':
        // 初始化数据库连接（示例为MongoDB）
        if (this.config.dbConfig) {
          try {
            const { MongoClient } = require('mongodb');
            this.dbClient = new MongoClient(this.config.dbConfig.url);
          } catch (error) {
            console.warn('数据库初始化失败，降级到文件存储:', error.message);
            this.config.persistenceType = 'file';
          }
        }
        break;
      case 'file':
      default:
        // 文件存储无需特殊初始化
        break;
    }
  }

  /**
   * 保存学习数据到持久化存储
   */
  async savePersistentData() {
    const dataToSave = {
      feedbackHistory: this.feedbackHistory,
      modelPerformanceByType: this.mapToObject(this.modelPerformanceByType),
      performanceWindows: this.mapToObject(this.performanceWindows),
      bayesianData: this.bayesianEstimator.getDataForPersistence(),
      timestamp: new Date()
    };

    try {
      switch(this.config.persistenceType) {
        case 'redis':
          if (this.redisClient) {
            await this.redisClient.set('learning-data', JSON.stringify(dataToSave));
          }
          break;
        case 'database':
          if (this.dbClient) {
            await this.dbClient.connect();
            const db = this.dbClient.db(this.config.dbConfig.databaseName);
            const collection = db.collection(this.config.dbConfig.collectionName || 'learning_data');

            // 替换现有文档或插入新文档
            await collection.replaceOne(
              { _id: 'learning-data' },
              dataToSave,
              { upsert: true }
            );
          }
          break;
        case 'file':
        default:
          const fs = require('fs').promises;
          await fs.writeFile(this.config.persistencePath, JSON.stringify(dataToSave, null, 2));
          break;
      }
    } catch (error) {
      console.error(`保存学习数据失败 (${this.config.persistenceType}):`, error);
    }
  }

  /**
   * 从持久化存储加载学习数据
   */
  async loadPersistentData() {
    try {
      let data = null;

      switch(this.config.persistenceType) {
        case 'redis':
          if (this.redisClient) {
            const redisData = await this.redisClient.get('learning-data');
            if (redisData) {
              data = JSON.parse(redisData);
            }
          }
          break;
        case 'database':
          if (this.dbClient) {
            await this.dbClient.connect();
            const db = this.dbClient.db(this.config.dbConfig.databaseName);
            const collection = db.collection(this.config.dbConfig.collectionName || 'learning_data');

            data = await collection.findOne({ _id: 'learning-data' });
          }
          break;
        case 'file':
        default:
          const fs = require('fs').promises;
          const fileData = await fs.readFile(this.config.persistencePath, 'utf8');
          data = JSON.parse(fileData);
          break;
      }

      if (data) {
        this.feedbackHistory = data.feedbackHistory || [];
        this.modelPerformanceByType = this.objectToMap(data.modelPerformanceByType || {});
        this.performanceWindows = this.objectToMap(data.performanceWindows || {});

        if (data.bayesianData) {
          this.bayesianEstimator.setDataFromPersistence(data.bayesianData);
        }

        console.log(`从 ${this.config.persistenceType} 存储加载了 ${this.feedbackHistory.length} 条学习数据`);
      } else {
        throw new Error('No data found');
      }
    } catch (error) {
      console.log(`未找到 ${this.config.persistenceType} 持久化学习数据，将创建新的学习记录`);
      // 如果数据不存在或解析失败，初始化为空数据
      this.feedbackHistory = [];
      this.modelPerformanceByType = new Map();
      this.performanceWindows = new Map();
    }
  }

  /**
   * Map转Object（用于JSON序列化）
   */
  mapToObject(map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Object转Map（用于反序列化）
   */
  objectToMap(obj) {
    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
      map.set(key, value);
    }
    return map;
  }

  /**
   * 清理过期数据
   */
  cleanupOldData(maxAgeDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // 过滤掉过期的反馈记录
    this.feedbackHistory = this.feedbackHistory.filter(
      fb => new Date(fb.timestamp) > cutoffDate
    );

    // 清理过期的性能窗口
    for (const [key, window] of this.performanceWindows.entries()) {
      const filteredWindow = window.filter(
        entry => new Date(entry.timestamp) > cutoffDate
      );
      if (filteredWindow.length === 0) {
        this.performanceWindows.delete(key);
      } else {
        // 更新窗口为过滤后的数据
        const newWindow = [];
        for (const entry of filteredWindow) {
          newWindow.push(entry);
        }
        // 替换窗口内容
        this.performanceWindows.set(key, newWindow);
      }
    }

    console.log(`清理了过期的学习数据，保留了 ${this.feedbackHistory.length} 条反馈记录`);
  }

  /**
   * 导出完整的学习报告
   */
  exportCompleteReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalFeedback: this.feedbackHistory.length,
      modelPerformanceByType: this.mapToObject(this.modelPerformanceByType),
      performanceWindows: this.mapToObject(this.performanceWindows),
      bayesianSummary: this.getBayesianSummary(),
      totalTasksProcessed: this.feedbackHistory.length
    };

    return report;
  }

  /**
   * 获取贝叶斯分析摘要
   */
  getBayesianSummary() {
    const summary = {};
    for (const [key, stats] of this.modelPerformanceByType.entries()) {
      const bayesianScore = this.getBayesianPerformanceScore(stats.taskType, stats.modelId);
      summary[key] = bayesianScore;
    }
    return summary;
  }

  /**
   * 清除学习数据
   */
  clearAllData() {
    this.feedbackHistory = [];
    this.modelPerformanceByType.clear();
    this.performanceWindows.clear();

    // 重置贝叶斯估计器
    this.bayesianEstimator = new BayesianPerformanceEstimator();

    console.log('[LearningSelector] 已清除所有学习数据');
  }

  /**
   * 获取模型推荐置信度
   */
  getModelRecommendationConfidence(taskType, modelId) {
    const bayesianScore = this.getBayesianPerformanceScore(taskType, modelId);
    return bayesianScore ? bayesianScore.confidence : 0;
  }

  /**
   * 获取性能趋势分析
   */
  getPerformanceTrends(taskType, modelId) {
    const recentPerformance = this.getRecentPerformance(taskType, modelId);
    if (recentPerformance.length < 2) {
      return { trend: 'insufficient_data', change: 0 };
    }

    const recentChunkSize = Math.ceil(recentPerformance.length / 2);
    const recentPart = recentPerformance.slice(-recentChunkSize);
    const earlierPart = recentPerformance.slice(-recentChunkSize * 2, -recentChunkSize);

    const recentAvg = recentPart.reduce((sum, entry) => sum + entry.score, 0) / recentPart.length;
    const earlierAvg = earlierPart.reduce((sum, entry) => sum + entry.score, 0) / earlierPart.length;

    const change = recentAvg - earlierAvg;
    let trend;
    if (change > 0.1) trend = 'improving_significantly';
    else if (change > 0.05) trend = 'improving';
    else if (change < -0.1) trend = 'declining_significantly';
    else if (change < -0.05) trend = 'declining';
    else trend = 'stable';

    return { trend, change, recentAvg, earlierAvg };
  }

  /**
   * 获取反馈历史
   * @param {number} limit - 返回记录数量限制
   * @returns {Array} 反馈历史
   */
  getFeedbackHistory(limit = 100) {
    return this.feedbackHistory.slice(-limit);
  }

  /**
   * 设置学习功能启用状态
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * 清除学习数据
   * @param {string} modelId - 模型 ID（可选）
   * @param {string} taskType - 任务类型（可选）
   */
  clearData(modelId = null, taskType = null) {
    if (modelId && taskType) {
      // 清除特定模型和任务类型的数据
      const key = `${taskType}-${modelId}`;
      this.modelPerformanceByType.delete(key);

      // 清除反馈历史中的相关条目
      this.feedbackHistory = this.feedbackHistory.filter(fb =>
        !(fb.modelId === modelId && fb.taskType === taskType)
      );

      // 清除性能窗口中的相关条目
      this.performanceWindows.delete(key);
    } else if (modelId) {
      // 清除特定模型的所有数据
      const entriesToDelete = [];
      for (const [key, stats] of this.modelPerformanceByType.entries()) {
        if (stats.modelId === modelId) {
          entriesToDelete.push(key);
        }
      }
      for (const key of entriesToDelete) {
        this.modelPerformanceByType.delete(key);
        this.performanceWindows.delete(key);
      }

      // 清除反馈历史中的相关条目
      this.feedbackHistory = this.feedbackHistory.filter(fb => fb.modelId !== modelId);
    } else if (taskType) {
      // 清除特定任务类型的所有数据
      const entriesToDelete = [];
      for (const [key, stats] of this.modelPerformanceByType.entries()) {
        if (stats.taskType === taskType) {
          entriesToDelete.push(key);
        }
      }
      for (const key of entriesToDelete) {
        this.modelPerformanceByType.delete(key);
        this.performanceWindows.delete(key);
      }

      // 清除反馈历史中的相关条目
      this.feedbackHistory = this.feedbackHistory.filter(fb => fb.taskType !== taskType);
    } else {
      // 清除所有数据
      this.clearAllData();
    }

    // 重新保存数据
    this.savePersistentData();
  }

  /**
   * 导出学习报告
   * @returns {Object} 学习报告
   */
  exportReport() {
    return {
      timestamp: new Date().toISOString(),
      totalFeedback: this.feedbackHistory.length,
      totalModelTypes: this.modelPerformanceByType.size,
      performanceSummary: Array.from(this.modelPerformanceByType.entries()).map(([key, stats]) => ({
        key,
        modelId: stats.modelId,
        taskType: stats.taskType,
        adjustedAvgScore: stats.adjustedAvgScore,
        sampleCount: stats.sampleCount,
        confidence: stats.confidence,
        minScore: stats.minScore,
        maxScore: stats.maxScore
      }))
    };
  }
}

module.exports = LearningSelector;
