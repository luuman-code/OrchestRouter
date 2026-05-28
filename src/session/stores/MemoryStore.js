const SessionStore = require('../SessionStore');

class MemoryStore extends SessionStore {
  constructor(options = {}) {
    super(options);
    this.store = new Map();
    this.maxSessions = options.maxSessions || 100;
    this.ttl = options.ttl || 3600000; // 默认 1 小时过期
    this.maxSessionSize = options.maxSessionSize || 50 * 1024 * 1024; // 默认单个会话最大50MB
    this.cleanupInterval = options.cleanupInterval || 300000; // 默认每5分钟清理一次
    this.startCleanupTimer();
  }

  startCleanupTimer() {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpired();
    }, this.cleanupInterval);
  }

  // 按用户/项目隔离获取会话
  async getUserSessions(userId) {
    const userSessions = [];
    for (const [sessionId, entry] of this.store.entries()) {
      if (entry.data.userId === userId) {
        userSessions.push(entry.data);
      }
    }
    return userSessions;
  }

  // 按项目隔离获取会话
  async getProjectSessions(projectId) {
    const projectSessions = [];
    for (const [sessionId, entry] of this.store.entries()) {
      if (entry.data.projectId === projectId) {
        projectSessions.push(entry.data);
      }
    }
    return projectSessions;
  }

  async set(sessionId, session) {
    // 检查单个会话大小限制
    const sessionSize = session.calculateStorageSize();
    if (sessionSize > this.maxSessionSize) {
      throw new Error(`Session size ${sessionSize} exceeds maximum allowed size ${this.maxSessionSize}`);
    }

    // 如果接近达到最大会话数，尝试清理过期会话
    if (this.store.size >= this.maxSessions * 0.9) {
      await this.cleanupExpired();
    }

    // 如果仍然超过限制，则执行LRU淘汰
    if (this.store.size >= this.maxSessions) {
      await this.evictOldest();
    }

    this.store.set(sessionId, {
      data: session,
      lastAccessed: Date.now()
    });
  }

  async get(sessionId) {
    const entry = this.store.get(sessionId);
    if (!entry) return null;

    if (Date.now() - entry.lastAccessed > this.ttl) {
      this.store.delete(sessionId);
      return null;
    }

    entry.lastAccessed = Date.now();

    // 如果数据被压缩，在返回前解压
    if (entry.data.storageStats && entry.data.storageStats.compressed) {
      await entry.data.decompressData();
    }

    return entry.data;
  }

  async delete(sessionId) {
    return this.store.delete(sessionId);
  }

  async evictOldest() {
    let oldestEntry = null;
    let oldestTime = Date.now();

    for (const [sessionId, entry] of this.store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestEntry = sessionId;
      }
    }

    if (oldestEntry) {
      this.store.delete(oldestEntry);
    }
  }

  async cleanupExpired() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, entry] of this.store.entries()) {
      if (now - entry.lastAccessed > this.ttl) {
        this.store.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // 关闭存储，清理定时器
  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // 获取统计信息
  async getStatistics() {
    return {
      totalSessions: this.store.size,
      maxSessions: this.maxSessions,
      ttl: this.ttl,
      maxSessionSize: this.maxSessionSize
    };
  }
}

module.exports = MemoryStore;