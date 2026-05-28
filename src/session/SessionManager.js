const Session = require('./Session');
const MemoryStore = require('./stores/MemoryStore');
const SessionStore = require('./SessionStore');
const DependencyGraph = require('./DependencyGraph');
const SessionMigrationService = require('./services/SessionMigrationService');
const crypto = require('crypto');

class SessionManager {
  constructor(store = null, migrationOptions = {}) {
    // 如果没有提供存储实例，创建一个内存存储
    this.store = store || new MemoryStore();

    // 生成唯一的会话管理器ID
    this.managerId = crypto.randomUUID();

    // 初始化会话迁移服务
    this.migrationService = new SessionMigrationService(this, migrationOptions.migration);
  }

  /**
   * 创建新会话
   * @param {string} originalTask - 原始任务描述
   * @param {string} userId - 用户ID（可选）
   * @param {string} projectId - 项目ID（可选）
   * @returns {Promise<Session>} 新创建的会话实例
   */
  async createSession(originalTask, userId = null, projectId = null) {
    // 生成唯一会话ID
    const sessionId = this.generateSessionId();

    // 创建新会话实例
    const session = new Session(sessionId, originalTask, userId, projectId);

    // 保存到存储中
    await this.store.set(sessionId, session);

    return session;
  }

  /**
   * 根据会话ID获取会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Session|null>} 会话实例或null（如果不存在）
   */
  async getSession(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    return await this.store.get(sessionId);
  }

  /**
   * 更新会话数据
   * @param {string} sessionId - 会话ID
   * @param {Object} data - 要更新的数据
   * @returns {Promise<Session>} 更新后的会话实例
   */
  async updateSession(sessionId, data) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    // 获取当前会话
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    // 检查是否传入了新的依赖图数据
    if (data.dependencyGraph && typeof data.dependencyGraph === 'object' && !(data.dependencyGraph instanceof DependencyGraph)) {
      // 如果传入的是导出的图数据，需要重建DependencyGraph实例
      const tempGraphData = data.dependencyGraph;
      if (tempGraphData && typeof tempGraphData === 'object') {
        data.dependencyGraph = new DependencyGraph();
        data.dependencyGraph.import(tempGraphData);
      } else {
        // 如果tempGraphData无效，则创建一个空的DependencyGraph
        data.dependencyGraph = new DependencyGraph();
      }
    }

    // 更新会话数据
    session.update(data);

    // 保存到存储中
    await this.store.set(sessionId, session);

    return session;
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteSession(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    return await this.store.delete(sessionId);
  }

  /**
   * 获取用户的会话列表
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Session>>} 用户的会话列表
   */
  async getUserSessions(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return await this.store.getUserSessions(userId);
  }

  /**
   * 获取项目的会话列表
   * @param {string} projectId - 项目ID
   * @returns {Promise<Array<Session>>} 项目的会话列表
   */
  async getProjectSessions(projectId) {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    return await this.store.getProjectSessions(projectId);
  }

  /**
   * 生成唯一会话ID
   * @returns {string} 唯一会话ID
   */
  generateSessionId() {
    // 生成基于时间戳和随机值的会话ID，增加额外的安全性
    const timestamp = Date.now().toString(36);
    const randomValue = crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('sha256')
      .update(timestamp + randomValue + this.managerId)
      .digest('hex');

    // 取前16位作为会话ID
    return hash.substring(0, 16);
  }

  /**
   * 清理过期会话
   * @returns {Promise<number>} 清理的会话数量
   */
  async cleanupExpiredSessions() {
    // MemoryStore内部已有定时清理机制
    // FileStore和其他存储可能需要特殊处理
    if (typeof this.store.cleanupExpired === 'function') {
      return await this.store.cleanupExpired();
    }
    return 0;
  }

  /**
   * 获取会话统计信息
   * @returns {Promise<Object>} 统计信息对象
   */
  async getStatistics() {
    const stats = {
      managerId: this.managerId,
      storeType: this.store.constructor.name,
      totalSessions: 0
    };

    // 获取存储统计信息（如果可用）
    if (typeof this.store.getStatistics === 'function') {
      const storeStats = await this.store.getStatistics();
      Object.assign(stats, storeStats);
    }

    return stats;
  }

  /**
   * 导出会话数据
   * @param {string} sessionId - 会话ID
   * @param {object} options - 导出选项
   * @returns {Promise<string>} 导出的会话数据
   */
  async exportSession(sessionId, options = {}) {
    return await this.migrationService.exportSession(sessionId, options);
  }

  /**
   * 导入会话数据
   * @param {string} exportedDataString - 导出的会话数据字符串
   * @param {object} options - 导入选项
   * @returns {Promise<string>} 新的会话ID
   */
  async importSession(exportedDataString, options = {}) {
    return await this.migrationService.importSession(exportedDataString, options);
  }
}

module.exports = SessionManager;