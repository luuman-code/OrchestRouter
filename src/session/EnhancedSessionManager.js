/**
 * 增强会话管理器
 *
 * 支持迭代历史和混合式迭代的会话管理
 */

const SessionManager = require('./SessionManager');
const fs = require('fs').promises;
const path = require('path');

class EnhancedSessionManager extends SessionManager {
  constructor(store = null, migrationOptions = {}, config = {}) {
    super(store, migrationOptions);

    this.config = {
      maxHistoryEntries: config.maxHistoryEntries || 50,
      enableCompression: config.enableCompression ?? false,
      historyRetentionDays: config.historyRetentionDays || 30,
      ...config
    };

    // 初始化迭代历史存储
    this.iterationHistory = new Map();
  }

  /**
   * 创建新会话并初始化迭代支持
   */
  async createSession(originalTask, userId = null, projectId = null) {
    const session = await super.createSession(originalTask, userId, projectId);

    // 为会话初始化迭代相关信息
    session.iterationData = {
      currentLevel: 'L1', // 默认从L1开始
      iterationCount: 0,
      totalIterations: 0,
      history: [],
      qualityScores: [],
      feedbackHistory: [],
      createdAt: new Date().toISOString()
    };

    // 保存更新后的会话
    await this.updateSession(session.sessionId, { iterationData: session.iterationData });

    return session;
  }

  /**
   * 记录迭代历史
   */
  async recordIteration(sessionId, iterationData) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    // 确保迭代数据存在
    if (!session.iterationData) {
      session.iterationData = {
        currentLevel: 'L1',
        iterationCount: 0,
        totalIterations: 0,
        history: [],
        qualityScores: [],
        feedbackHistory: [],
        createdAt: new Date().toISOString()
      };
    }

    // 添加新的迭代记录
    const iterationRecord = {
      id: this.generateIterationId(),
      level: iterationData.level || session.iterationData.currentLevel,
      timestamp: new Date().toISOString(),
      input: iterationData.input,
      output: iterationData.output,
      feedback: iterationData.feedback,
      qualityScore: iterationData.qualityScore,
      success: iterationData.success,
      duration: iterationData.duration,
      error: iterationData.error
    };

    // 添加到历史记录
    session.iterationData.history.unshift(iterationRecord);

    // 限制历史记录数量
    if (session.iterationData.history.length > this.config.maxHistoryEntries) {
      session.iterationData.history = session.iterationData.history.slice(0, this.config.maxHistoryEntries);
    }

    // 保存质量分数
    if (iterationData.qualityScore !== undefined) {
      session.iterationData.qualityScores.push({
        timestamp: iterationRecord.timestamp,
        score: iterationData.qualityScore,
        level: iterationRecord.level
      });

      // 只保留最近的分数记录
      if (session.iterationData.qualityScores.length > this.config.maxHistoryEntries) {
        session.iterationData.qualityScores = session.iterationData.qualityScores.slice(0, this.config.maxHistoryEntries);
      }
    }

    // 更新迭代计数
    session.iterationData.totalIterations += 1;
    session.iterationData.iterationCount += 1;

    // 更新会话
    await this.updateSession(sessionId, { iterationData: session.iterationData });

    // 同时在本地存储一份副本
    if (!this.iterationHistory.has(sessionId)) {
      this.iterationHistory.set(sessionId, []);
    }
    this.iterationHistory.get(sessionId).unshift(iterationRecord);

    return iterationRecord;
  }

  /**
   * 获取迭代历史
   */
  async getIterationHistory(sessionId, options = {}) {
    const { limit = 20, level = null, sortBy = 'timestamp', order = 'desc' } = options;

    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      return [];
    }

    let history = [...session.iterationData.history];

    // 过滤指定层级
    if (level) {
      history = history.filter(record => record.level === level);
    }

    // 排序
    history.sort((a, b) => {
      const multiplier = order === 'desc' ? -1 : 1;
      if (sortBy === 'timestamp') {
        return multiplier * (new Date(b.timestamp) - new Date(a.timestamp));
      } else if (sortBy === 'qualityScore') {
        return multiplier * ((b.qualityScore || 0) - (a.qualityScore || 0));
      }
      return 0;
    });

    // 限制数量
    return history.slice(0, limit);
  }

  /**
   * 获取会话统计信息
   */
  async getSessionStats(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      return null;
    }

    const history = session.iterationData.history;
    const qualityScores = session.iterationData.qualityScores;

    const stats = {
      sessionId,
      totalIterations: session.iterationData.totalIterations,
      currentIteration: session.iterationData.iterationCount,
      currentLevel: session.iterationData.currentLevel,
      successRate: 0,
      avgQualityScore: 0,
      levelDistribution: {},
      timeMetrics: {
        firstIteration: null,
        lastIteration: null,
        totalDuration: 0
      }
    };

    // 计算成功率
    if (history.length > 0) {
      const successfulIterations = history.filter(iteration => iteration.success).length;
      stats.successRate = successfulIterations / history.length;

      // 计算各层级分布
      for (const iteration of history) {
        stats.levelDistribution[iteration.level] =
          (stats.levelDistribution[iteration.level] || 0) + 1;
      }

      // 计算平均质量分数
      if (qualityScores.length > 0) {
        const totalScore = qualityScores.reduce((sum, record) => sum + (record.score || 0), 0);
        stats.avgQualityScore = totalScore / qualityScores.length;
      }

      // 时间指标
      if (history.length > 0) {
        stats.timeMetrics.firstIteration = history[history.length - 1].timestamp;
        stats.timeMetrics.lastIteration = history[0].timestamp;

        // 估算总耗时（使用每轮平均耗时估算）
        if (history[0].duration) {
          stats.timeMetrics.totalDuration = history.length * history[0].duration;
        }
      }
    }

    return stats;
  }

  /**
   * 更新会话的迭代层级
   */
  async updateIterationLevel(sessionId, newLevel) {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      throw new Error(`Session ${sessionId} not found or has no iteration data`);
    }

    session.iterationData.currentLevel = newLevel;
    session.iterationData.iterationCount = 0; // 重置当前层级的迭代计数

    await this.updateSession(sessionId, { iterationData: session.iterationData });

    return { success: true, newLevel };
  }

  /**
   * 获取会话的当前迭代信息
   */
  async getCurrentIterationInfo(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      return null;
    }

    return {
      currentLevel: session.iterationData.currentLevel,
      iterationCount: session.iterationData.iterationCount,
      totalIterations: session.iterationData.totalIterations,
      recentHistory: session.iterationData.history.slice(0, 5),
      recentQualityScores: session.iterationData.qualityScores.slice(0, 5)
    };
  }

  /**
   * 保存会话到持久化存储
   */
  async saveSessionToFile(sessionId, filePath) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 准备要保存的数据
    const sessionData = {
      ...session,
      savedAt: new Date().toISOString()
    };

    // 如果启用压缩
    let dataToSave = sessionData;
    if (this.config.enableCompression) {
      // 这里可以实现压缩逻辑，比如使用JSON压缩
      dataToSave = JSON.stringify(sessionData);
    } else {
      dataToSave = JSON.stringify(sessionData, null, 2);
    }

    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 写入文件
    await fs.writeFile(filePath, dataToSave);

    return { success: true, filePath };
  }

  /**
   * 从文件加载会话
   */
  async loadSessionFromFile(filePath, sessionId) {
    if (!await this.fileExists(filePath)) {
      throw new Error(`File ${filePath} does not exist`);
    }

    let fileContent = await fs.readFile(filePath, 'utf8');

    // 如果文件是压缩的，进行解压缩
    if (this.config.enableCompression) {
      // 解压缩逻辑
      fileContent = JSON.parse(fileContent);
    } else {
      fileContent = JSON.parse(fileContent);
    }

    // 将文件内容作为会话数据更新
    await this.updateSession(sessionId, fileContent);

    return { success: true, sessionId };
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理会话迭代历史
   */
  async cleanupIterationHistory(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      return { success: true, message: 'No iteration history to cleanup' };
    }

    // 只保留最近的历史记录
    const recentHistory = session.iterationData.history.slice(0, this.config.maxHistoryEntries);
    const recentQualityScores = session.iterationData.qualityScores.slice(0, this.config.maxHistoryEntries);

    session.iterationData.history = recentHistory;
    session.iterationData.qualityScores = recentQualityScores;

    await this.updateSession(sessionId, {
      iterationData: session.iterationData
    });

    return {
      success: true,
      cleanedRecords: session.iterationData.history.length - recentHistory.length
    };
  }

  /**
   * 生成迭代ID
   */
  generateIterationId() {
    return `iter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 导出会话迭代数据
   */
  async exportIterationData(sessionId, format = 'json') {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData) {
      throw new Error(`Session ${sessionId} not found or has no iteration data`);
    }

    const exportData = {
      sessionId,
      task: session.originalTask,
      iterationData: session.iterationData,
      exportedAt: new Date().toISOString(),
      formatVersion: '1.0'
    };

    switch (format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      case 'csv':
        return this.convertToCSV(exportData);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * 将迭代数据转换为CSV格式
   */
  convertToCSV(exportData) {
    const rows = ['level,timestamp,qualityScore,success,duration'];

    for (const iteration of exportData.iterationData.history) {
      const row = [
        iteration.level || '',
        iteration.timestamp || '',
        iteration.qualityScore || '',
        iteration.success || '',
        iteration.duration || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');

      rows.push(row);
    }

    return rows.join('\n');
  }

  /**
   * 获取会话趋势分析
   */
  async getSessionTrendAnalysis(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.iterationData || session.iterationData.qualityScores.length === 0) {
      return null;
    }

    const scores = session.iterationData.qualityScores.map(s => s.score).filter(s => s != null);

    if (scores.length < 2) {
      return {
        trend: 'insufficient_data',
        improvementRate: 0,
        stability: 'unknown'
      };
    }

    // 计算趋势（简单线性回归）
    const n = scores.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += scores[i];
      sumXY += i * scores[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgScore = sumY / n;

    // 计算稳定性（标准差）
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stability = 1 / (1 + Math.sqrt(variance)); // 稳定性越高，方差越小

    return {
      trend: slope > 0.01 ? 'improving' : slope < -0.01 ? 'declining' : 'stable',
      improvementRate: slope,
      stability,
      averageQuality: avgScore,
      lastScore: scores[scores.length - 1]
    };
  }
}

module.exports = EnhancedSessionManager;