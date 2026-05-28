const SessionStore = require('../SessionStore');

class HybridStore extends SessionStore {
  constructor(options = {}) {
    super(options);

    // 结合内存、文件和Redis存储的优势
    const MemoryStore = require('./MemoryStore');
    const BatchFileStore = require('./BatchFileStore');

    this.memoryStore = new MemoryStore(options.memoryOptions || {});
    this.fileStore = new BatchFileStore(options.fileOptions?.basePath, {
      ...options.fileOptions,
      compressionThreshold: options.fileOptions?.compressionThreshold || 10 * 1024 * 1024,
      autoCompress: options.fileOptions?.autoCompress
    });

    if (options.redisEnabled) {
      const RedisStore = require('./RedisStore');
      this.redisStore = new RedisStore(options.redisOptions || {});
    } else {
      this.redisStore = null;
    }

    // 存储策略配置
    this.storageStrategy = options.storageStrategy || 'memory-first'; // 'memory-first', 'redis-first', 'file-first'
    this.syncMode = options.syncMode || 'async'; // 'sync', 'async', 'eventual'
    this.failoverEnabled = options.failoverEnabled !== false; // 默认启用故障转移
  }

  async set(sessionId, session) {
    const promises = [];

    // 根据存储策略确定主要存储
    switch (this.storageStrategy) {
      case 'memory-first':
        await this.memoryStore.set(sessionId, session);

        // 异步复制到其他存储
        if (this.syncMode === 'async') {
          if (this.redisStore) {
            promises.push(this.redisStore.set(sessionId, session).catch(err =>
              console.error('Redis存储失败:', err)));
          }
          promises.push(this.fileStore.set(sessionId, session).catch(err =>
            console.error('文件存储失败:', err)));
        }
        break;

      case 'redis-first':
        if (this.redisStore) {
          await this.redisStore.set(sessionId, session);
        }

        // 异步复制到其他存储
        if (this.syncMode === 'async') {
          promises.push(this.memoryStore.set(sessionId, session).catch(err =>
            console.error('内存存储失败:', err)));
          promises.push(this.fileStore.set(sessionId, session).catch(err =>
            console.error('文件存储失败:', err)));
        }
        break;

      case 'file-first':
        await this.fileStore.set(sessionId, session);

        // 异步复制到其他存储
        if (this.syncMode === 'async') {
          promises.push(this.memoryStore.set(sessionId, session).catch(err =>
            console.error('内存存储失败:', err)));
          if (this.redisStore) {
            promises.push(this.redisStore.set(sessionId, session).catch(err =>
              console.error('Redis存储失败:', err)));
          }
        }
        break;
    }

    // 等待所有异步操作完成（非关键路径）
    await Promise.allSettled(promises);
  }

  async get(sessionId) {
    // 按优先级顺序尝试获取
    let session = null;
    let source = '';

    switch (this.storageStrategy) {
      case 'memory-first':
        session = await this.memoryStore.get(sessionId);
        source = 'memory';
        if (!session && this.redisStore) {
          session = await this.redisStore.get(sessionId);
          source = 'redis';
        }
        if (!session) {
          session = await this.fileStore.get(sessionId);
          source = 'file';
        }
        break;

      case 'redis-first':
        if (this.redisStore) {
          session = await this.redisStore.get(sessionId);
          source = 'redis';
        }
        if (!session) {
          session = await this.memoryStore.get(sessionId);
          source = 'memory';
        }
        if (!session) {
          session = await this.fileStore.get(sessionId);
          source = 'file';
        }
        break;

      case 'file-first':
        session = await this.fileStore.get(sessionId);
        source = 'file';
        if (!session) {
          session = await this.memoryStore.get(sessionId);
          source = 'memory';
        }
        if (!session && this.redisStore) {
          session = await this.redisStore.get(sessionId);
          source = 'redis';
        }
        break;
    }

    // 如果在非主要存储中找到，同步回主要存储
    if (session && this.syncMode !== 'readonly') {
      const primarySetPromise = this.set(sessionId, session);
      // 不等待同步操作，作为后台任务
      primarySetPromise.catch(err => console.error('同步回主要存储失败:', err));
    }

    return session;
  }

  async delete(sessionId) {
    const promises = [
      this.memoryStore.delete(sessionId),
      this.fileStore.delete(sessionId)
    ];

    if (this.redisStore) {
      promises.push(this.redisStore.delete(sessionId));
    }

    // 并行删除所有存储中的会话
    const results = await Promise.allSettled(promises);

    // 返回是否至少在一个存储中成功删除
    return results.some(result => result.status === 'fulfilled' && result.value === true);
  }

  async getUserSessions(userId) {
    // 从所有存储获取用户会话，去重
    const allSessions = new Map();

    // 从内存存储获取
    const memorySessions = await this.memoryStore.getUserSessions(userId);
    memorySessions.forEach(session => allSessions.set(session.sessionId, session));

    // 从文件存储获取
    const fileSessions = await this.fileStore.getUserSessions(userId);
    fileSessions.forEach(session => allSessions.set(session.sessionId, session));

    // 从Redis存储获取
    if (this.redisStore) {
      try {
        const redisSessions = await this.redisStore.getUserSessions(userId);
        redisSessions.forEach(session => allSessions.set(session.sessionId, session));
      } catch (error) {
        if (this.failoverEnabled) {
          console.warn('Redis获取用户会话失败，将继续使用其他存储:', error.message);
        } else {
          throw error;
        }
      }
    }

    return Array.from(allSessions.values());
  }

  async getProjectSessions(projectId) {
    // 从所有存储获取项目会话，去重
    const allSessions = new Map();

    // 从内存存储获取
    const memorySessions = await this.memoryStore.getProjectSessions(projectId);
    memorySessions.forEach(session => allSessions.set(session.sessionId, session));

    // 从文件存储获取
    const fileSessions = await this.fileStore.getProjectSessions(projectId);
    fileSessions.forEach(session => allSessions.set(session.sessionId, session));

    // 从Redis存储获取
    if (this.redisStore) {
      try {
        const redisSessions = await this.redisStore.getProjectSessions(projectId);
        redisSessions.forEach(session => allSessions.set(session.sessionId, session));
      } catch (error) {
        if (this.failoverEnabled) {
          console.warn('Redis获取项目会话失败，将继续使用其他存储:', error.message);
        } else {
          throw error;
        }
      }
    }

    return Array.from(allSessions.values());
  }

  async cleanupExpired() {
    const results = await Promise.allSettled([
      this.memoryStore.cleanupExpired(),
      this.fileStore.cleanupExpired(),
      this.redisStore ? this.redisStore.cleanupExpired() : Promise.resolve(0)
    ]);

    // 返回总共清理的会话数
    return results.reduce((total, result) => {
      if (result.status === 'fulfilled') {
        return total + (result.value || 0);
      }
      return total;
    }, 0);
  }

  async getStatistics() {
    const stats = {
      storageStrategy: this.storageStrategy,
      syncMode: this.syncMode,
      failoverEnabled: this.failoverEnabled
    };

    try {
      stats.memoryStore = await this.memoryStore.getStatistics();
    } catch (error) {
      stats.memoryStore = { error: error.message };
    }

    try {
      stats.fileStore = await this.fileStore.getStatistics();
    } catch (error) {
      stats.fileStore = { error: error.message };
    }

    if (this.redisStore) {
      try {
        stats.redisStore = await this.redisStore.getStatistics();
      } catch (error) {
        stats.redisStore = { error: error.message };
      }
    }

    return stats;
  }

  async close() {
    await Promise.allSettled([
      this.memoryStore.close(),
      this.fileStore.close(),
      this.redisStore ? this.redisStore.close() : Promise.resolve()
    ]);
  }
}

module.exports = HybridStore;