const CachedFileStore = require('./CachedFileStore');

class BatchFileStore extends CachedFileStore {
  constructor(basePath, options = {}) {
    super(basePath, options);

    this.pendingWrites = new Map();  // 待写入的会话
    this.writeBatchTimeout = options.batchTimeout || 1000;  // 1秒批处理间隔
    this.batchTimer = null;
  }

  async set(sessionId, session) {
    // 更新内存缓存立即生效
    this.cache.set(sessionId, session);

    // 加入待写入队列
    this.pendingWrites.set(sessionId, {
      session,
      timestamp: Date.now()
    });

    // 重置批处理定时器
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // 设置新的批处理定时器
    this.batchTimer = setTimeout(() => {
      this.processBatchWrites();
    }, this.writeBatchTimeout);
  }

  async processBatchWrites() {
    if (this.pendingWrites.size === 0) {
      return;
    }

    // 批量处理写入
    for (const [sessionId, pending] of this.pendingWrites.entries()) {
      try {
        // 直接调用父类的set方法绕过批处理逻辑
        await super.set(sessionId, pending.session);
      } catch (error) {
        console.error(`批量写入会话 ${sessionId} 失败:`, error);
      }
    }

    // 清空待写入队列
    this.pendingWrites.clear();
  }

  async get(sessionId) {
    // 检查是否有待写入的数据
    const pending = this.pendingWrites.get(sessionId);
    if (pending) {
      return pending.session;
    }

    // 从缓存或文件系统获取
    return await super.get(sessionId);
  }

  async close() {
    // 关闭前处理剩余的批处理
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      await this.processBatchWrites();
    }

    await super.close();
  }
}

module.exports = BatchFileStore;