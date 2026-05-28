/**
 * MultiTurnConversationManager - 多轮对话管理器
 *
 * 管理多轮对话的上下文，支持任务的暂停、恢复和继续
 *
 * @class MultiTurnConversationManager
 */
class MultiTurnConversationManager {
  constructor(config = {}) {
    // 对话存储: taskId -> conversation context
    this.conversations = new Map();
    // 心跳检测配置
    this.heartbeatInterval = config.heartbeatInterval || 30000; // 30秒
    // 最大保活时间
    this.maxIdleTime = config.maxIdleTime || 3600000; // 1小时
    // 心跳定时器
    this.heartbeatTimers = new Map();
    // 活跃任务列表
    this.activeConversations = new Set();

    console.log('[MultiTurnConversationManager] 初始化完成');
  }

  /**
   * 创建或获取对话上下文
   * @param {string} taskId - 任务ID
   * @returns {Object} 对话上下文
   */
  getOrCreateContext(taskId) {
    if (!this.conversations.has(taskId)) {
      const context = {
        taskId,
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        status: 'active', // active | waiting | completed | abandoned
        metadata: {}
      };
      this.conversations.set(taskId, context);
      this.activeConversations.add(taskId);
      console.log(`[MultiTurnConversationManager] 创建新对话上下文: ${taskId}`);
    }

    const context = this.conversations.get(taskId);
    context.lastActiveAt = Date.now();
    return context;
  }

  /**
   * 获取对话上下文
   * @param {string} taskId - 任务ID
   * @returns {Object|null}
   */
  getContext(taskId) {
    return this.conversations.get(taskId) || null;
  }

  /**
   * 添加消息到对话
   * @param {string} taskId - 任务ID
   * @param {Object} message - 消息对象 { role, content, toolCalls, ... }
   */
  addMessage(taskId, message) {
    const context = this.getOrCreateContext(taskId);
    context.messages.push({
      ...message,
      timestamp: Date.now()
    });
    context.lastActiveAt = Date.now();
    console.log(`[MultiTurnConversationManager] 添加消息到对话 ${taskId}, 消息数: ${context.messages.length}`);
  }

  /**
   * 获取对话历史
   * @param {string} taskId - 任务ID
   * @param {number} limit - 限制返回的消息数
   * @returns {Array}
   */
  getHistory(taskId, limit = null) {
    const context = this.conversations.get(taskId);
    if (!context) {
      return [];
    }

    if (limit && limit > 0) {
      return context.messages.slice(-limit);
    }
    return context.messages;
  }

  /**
   * 更新对话状态
   * @param {string} taskId - 任务ID
   * @param {string} status - 状态
   * @param {Object} metadata - 额外的元数据
   */
  updateStatus(taskId, status, metadata = {}) {
    const context = this.conversations.get(taskId);
    if (!context) {
      console.warn(`[MultiTurnConversationManager] 对话 ${taskId} 不存在`);
      return false;
    }

    context.status = status;
    Object.assign(context.metadata, metadata);
    context.lastActiveAt = Date.now();

    if (status === 'completed' || status === 'abandoned') {
      this.activeConversations.delete(taskId);
      this.stopHeartbeat(taskId);
    }

    console.log(`[MultiTurnConversationManager] 对话 ${taskId} 状态更新: ${status}`);
    return true;
  }

  /**
   * 暂停对话（等待用户继续）
   * @param {string} taskId - 任务ID
   * @param {Object} pauseInfo - 暂停信息
   */
  pauseConversation(taskId, pauseInfo = {}) {
    return this.updateStatus(taskId, 'waiting', { pauseInfo, pausedAt: Date.now() });
  }

  /**
   * 继续对话
   * @param {string} taskId - 任务ID
   * @param {Object} continueInfo - 继续信息
   */
  continueConversation(taskId, continueInfo = {}) {
    const context = this.conversations.get(taskId);
    if (!context) {
      return false;
    }

    if (context.status !== 'waiting') {
      console.warn(`[MultiTurnConversationManager] 对话 ${taskId} 不是等待状态，当前状态: ${context.status}`);
      return false;
    }

    context.status = 'active';
    Object.assign(context.metadata, { continueInfo, continuedAt: Date.now() });
    context.lastActiveAt = Date.now();
    this.activeConversations.add(taskId);

    console.log(`[MultiTurnConversationManager] 对话 ${taskId} 已继续`);
    return true;
  }

  /**
   * 结束对话
   * @param {string} taskId - 任务ID
   * @param {Object} endInfo - 结束信息
   */
  endConversation(taskId, endInfo = {}) {
    return this.updateStatus(taskId, 'completed', { endInfo, endedAt: Date.now() });
  }

  /**
   * 放弃对话
   * @param {string} taskId - 任务ID
   * @param {Object} abandonInfo - 放弃信息
   */
  abandonConversation(taskId, abandonInfo = {}) {
    return this.updateStatus(taskId, 'abandoned', { abandonInfo, abandonedAt: Date.now() });
  }

  /**
   * 启动心跳检测
   * @param {string} taskId - 任务ID
   */
  startHeartbeat(taskId) {
    if (this.heartbeatTimers.has(taskId)) {
      return;
    }

    const timer = setInterval(() => {
      const context = this.conversations.get(taskId);
      if (!context) {
        this.stopHeartbeat(taskId);
        return;
      }

      const idleTime = Date.now() - context.lastActiveAt;
      if (idleTime > this.maxIdleTime) {
        console.log(`[MultiTurnConversationManager] 对话 ${taskId} 超过最大空闲时间，自动放弃`);
        this.abandonConversation(taskId, { reason: 'idle_timeout', idleTime });
        this.stopHeartbeat(taskId);
      }
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(taskId, timer);
    console.log(`[MultiTurnConversationManager] 对话 ${taskId} 心跳检测已启动`);
  }

  /**
   * 停止心跳检测
   * @param {string} taskId - 任务ID
   */
  stopHeartbeat(taskId) {
    const timer = this.heartbeatTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(taskId);
    }
  }

  /**
   * 发送心跳
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  heartbeat(taskId) {
    const context = this.conversations.get(taskId);
    if (!context) {
      return false;
    }

    context.lastActiveAt = Date.now();
    context.metadata.lastHeartbeat = Date.now();
    return true;
  }

  /**
   * 检查对话是否活跃
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  isActive(taskId) {
    const context = this.conversations.get(taskId);
    return context && context.status === 'active';
  }

  /**
   * 检查对话是否等待继续
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  isWaiting(taskId) {
    const context = this.conversations.get(taskId);
    return context && context.status === 'waiting';
  }

  /**
   * 获取所有活跃对话
   * @returns {Array}
   */
  getActiveConversations() {
    return Array.from(this.activeConversations).map(taskId => {
      const context = this.conversations.get(taskId);
      return {
        taskId,
        status: context?.status,
        messageCount: context?.messages.length || 0,
        lastActiveAt: context?.lastActiveAt,
        createdAt: context?.createdAt
      };
    });
  }

  /**
   * 删除对话上下文
   * @param {string} taskId - 任务ID
   */
  deleteContext(taskId) {
    this.stopHeartbeat(taskId);
    this.activeConversations.delete(taskId);
    this.conversations.delete(taskId);
    console.log(`[MultiTurnConversationManager] 删除对话上下文: ${taskId}`);
  }

  /**
   * 清理所有对话
   */
  clear() {
    for (const taskId of this.heartbeatTimers.keys()) {
      this.stopHeartbeat(taskId);
    }
    this.conversations.clear();
    this.activeConversations.clear();
    console.log('[MultiTurnConversationManager] 已清理所有对话');
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalConversations: this.conversations.size,
      activeConversations: this.activeConversations.size,
      byStatus: {}
    };

    for (const context of this.conversations.values()) {
      const status = context.status;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    }

    return stats;
  }
}

// 单例模式
let instance = null;

MultiTurnConversationManager.getInstance = function(config) {
  if (!instance) {
    instance = new MultiTurnConversationManager(config);
  }
  return instance;
};

module.exports = MultiTurnConversationManager;
