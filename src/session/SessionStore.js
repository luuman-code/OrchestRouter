/**
 * 会话存储接口定义
 * 定义所有会话存储实现必须遵循的接口规范
 */

class SessionStore {
  /**
   * 构造函数
   * @param {Object} options - 存储选项
   */
  constructor(options = {}) {
    if (this.constructor === SessionStore) {
      throw new TypeError('Cannot construct SessionStore instances directly');
    }
  }

  /**
   * 设置会话数据
   * @param {string} sessionId - 会话ID
   * @param {Session} session - 会话对象
   * @returns {Promise<void>}
   */
  async set(sessionId, session) {
    throw new Error('Method "set" must be implemented by subclass');
  }

  /**
   * 获取会话数据
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Session|null>} 会话对象或null（如果不存在）
   */
  async get(sessionId) {
    throw new Error('Method "get" must be implemented by subclass');
  }

  /**
   * 删除会话数据
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(sessionId) {
    throw new Error('Method "delete" must be implemented by subclass');
  }

  /**
   * 获取用户的所有会话
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Session>>} 用户的会话列表
   */
  async getUserSessions(userId) {
    throw new Error('Method "getUserSessions" must be implemented by subclass');
  }

  /**
   * 获取项目的所有会话
   * @param {string} projectId - 项目ID
   * @returns {Promise<Array<Session>>} 项目的会话列表
   */
  async getProjectSessions(projectId) {
    throw new Error('Method "getProjectSessions" must be implemented by subclass');
  }

  /**
   * 清理过期的会话
   * @returns {Promise<number>} 清理的会话数量
   */
  async cleanupExpired() {
    throw new Error('Method "cleanupExpired" must be implemented by subclass');
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<Object>} 统计信息对象
   */
  async getStatistics() {
    throw new Error('Method "getStatistics" must be implemented by subclass');
  }

  /**
   * 关闭存储连接并释放资源
   * @returns {Promise<void>}
   */
  async close() {
    // 默认为空实现，子类可根据需要重写
  }
}

module.exports = SessionStore;