/**
 * SimpleDistributedLock - 简单的分布式锁实现
 * 用于测试和演示目的，在生产环境中应使用 Redis、Zookeeper 或其他分布式锁服务
 */
class SimpleDistributedLock {
  constructor(options = {}) {
    this.locks = new Map(); // 存储锁信息
    this.ttlMultiplier = options.ttlMultiplier || 1.5; // TTL倍数
    this.cleanupInterval = options.cleanupInterval || 30000; // 清理间隔

    // 启动清理定时器
    this.startCleanupTimer();
  }

  /**
   * 获取锁
   */
  async acquire(key, value, timeoutMs = 30000) {
    const lockInfo = this.locks.get(key);

    // 检查锁是否已经存在且未过期
    if (lockInfo) {
      const now = Date.now();

      // 如果锁已经过期，删除它并继续
      if (lockInfo.expireTime < now) {
        this.locks.delete(key);
      } else {
        // 锁仍有效，无法获取
        return false;
      }
    }

    // 设置新的锁
    const expireTime = Date.now() + timeoutMs;
    this.locks.set(key, {
      value: value,
      expireTime: expireTime
    });

    return true;
  }

  /**
   * 释放锁
   */
  async release(key, value) {
    const lockInfo = this.locks.get(key);

    if (lockInfo && lockInfo.value === value) {
      this.locks.delete(key);
      return true;
    }

    return false;
  }

  /**
   * 强制释放锁（忽略值）
   */
  async forceRelease(key) {
    this.locks.delete(key);
    return true;
  }

  /**
   * 获取锁状态
   */
  isLocked(key) {
    const lockInfo = this.locks.get(key);
    if (!lockInfo) {
      return false;
    }

    // 检查是否过期
    if (Date.now() > lockInfo.expireTime) {
      this.locks.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 清理过期的锁
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, lockInfo] of this.locks.entries()) {
      if (lockInfo.expireTime < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.locks.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`[SimpleDistributedLock] 清理了 ${expiredKeys.length} 个过期的锁`);
    }
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.cleanupInterval);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 获取所有锁信息（调试用途）
   */
  getAllLocks() {
    const now = Date.now();
    const locksInfo = {};

    for (const [key, lockInfo] of this.locks.entries()) {
      locksInfo[key] = {
        value: lockInfo.value,
        expireTime: lockInfo.expireTime,
        ttl: Math.max(0, lockInfo.expireTime - now),
        expired: lockInfo.expireTime < now
      };
    }

    return locksInfo;
  }
}

module.exports = SimpleDistributedLock;