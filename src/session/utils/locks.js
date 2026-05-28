// 分布式锁管理器
// 实现重试机制、指数退避策略、Redlock算法错误处理等

const crypto = require('crypto');

class DistributedLockManager {
  constructor(options = {}) {
    this.redisNodes = options.redisNodes || [options.redis];
    this.lockTimeout = options.lockTimeout || 30000;
    this.retryCount = options.retryCount || 3;
    this.retryDelay = options.retryDelay || 100;
    this.renewTimers = new Map();
    this.lockInfo = new Map();

    // 初始化Redis连接（如果有）
    if (this.redisNodes && this.redisNodes.length > 0) {
      this.initRedisConnections();
    }
  }

  initRedisConnections() {
    // 初始化Redis连接的占位符
    // 在实际实现中，这里会建立与Redis节点的实际连接
    console.log('Initializing Redis connections for distributed locking...');
  }

  /**
   * 生成唯一的锁值
   */
  generateLockValue() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 获取分布式锁（使用 Redlock 算法）
   */
  async acquireLock(resource, options = {}) {
    const timeout = options.timeout || this.lockTimeout;
    const lockValue = this.generateLockValue();

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        if (this.redisNodes && this.redisNodes.length > 1) {
          // 多节点场景：使用Redlock算法
          const result = await this.acquireRedLock(resource, lockValue, timeout);
          if (result.success) {
            await this.startAutoRenewal(resource, lockValue, timeout);
            return { success: true, lockValue, resource };
          }
        } else {
          // 单节点场景
          const result = await this.acquireSingleLock(resource, lockValue, timeout);
          if (result) {
            await this.startAutoRenewal(resource, lockValue, timeout);
            return { success: true, lockValue, resource };
          }
        }
      } catch (error) {
        console.error(`Attempt ${attempt + 1} to acquire lock failed:`, error);
        if (attempt === this.retryCount - 1) {
          throw error;
        }
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }

    return { success: false, reason: 'Retry attempts exhausted' };
  }

  /**
   * 在单个Redis实例上获取锁
   */
  async acquireSingleLock(resource, lockValue, timeout) {
    try {
      // 这里使用简单的内存存储模拟Redis SET NX EX命令
      // 在实际实现中，这将是真实的Redis调用
      if (!this.lockInfo.has(resource)) {
        this.lockInfo.set(resource, {
          value: lockValue,
          expiresAt: Date.now() + timeout
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error acquiring single lock:', error);
      return false;
    }
  }

  /**
   * 使用Redlock算法在多个Redis实例上获取锁
   */
  async acquireRedLock(resource, lockValue, timeout) {
    const quorum = Math.floor(this.redisNodes.length / 2) + 1;
    let lockedNodes = 0;
    const failures = [];

    for (let i = 0; i < this.redisNodes.length; i++) {
      try {
        const acquired = await this.acquireSingleLock(`${resource}_node${i}`, lockValue, timeout);
        if (acquired) {
          lockedNodes++;
        }
      } catch (error) {
        failures.push(error);
      }
    }

    // 检查是否达到了多数节点锁定的阈值
    if (lockedNodes >= quorum) {
      // 设置总的锁信息
      this.lockInfo.set(resource, {
        value: lockValue,
        expiresAt: Date.now() + timeout,
        nodes: lockedNodes
      });
      return { success: true, lockedNodes, quorum };
    }

    // 如果未能达到多数节点锁定，则释放已获得的锁
    for (let i = 0; i < this.redisNodes.length; i++) {
      await this.releaseLockOnNode(`${resource}_node${i}`, lockValue);
    }

    return { success: false, lockedNodes, quorum, failures };
  }

  /**
   * 在特定节点上释放锁
   */
  async releaseLockOnNode(resource, lockValue) {
    const lock = this.lockInfo.get(resource);
    if (lock && lock.value === lockValue) {
      this.lockInfo.delete(resource);
    }
  }

  /**
   * 释放分布式锁
   */
  async releaseLock(resource, lockValue) {
    try {
      // 停止自动续期
      await this.stopAutoRenewal(resource);

      if (this.redisNodes && this.redisNodes.length > 1) {
        // 多节点场景：释放所有节点上的锁
        let releasedNodes = 0;
        for (let i = 0; i < this.redisNodes.length; i++) {
          await this.releaseLockOnNode(`${resource}_node${i}`, lockValue);
          releasedNodes++;
        }
        return { success: true, releasedNodes };
      } else {
        // 单节点场景：释放锁
        const lock = this.lockInfo.get(resource);
        if (lock && lock.value === lockValue) {
          this.lockInfo.delete(resource);
          return { success: true };
        }
        return { success: false, reason: 'Invalid lock value or lock not found' };
      }
    } catch (error) {
      console.error('Error releasing lock:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 开始自动续期
   */
  async startAutoRenewal(resource, lockValue, timeout) {
    const renewalInterval = timeout / 2; // 每隔一半时间续期一次

    const renew = async () => {
      try {
        const lock = this.lockInfo.get(resource);
        if (lock && lock.value === lockValue && Date.now() < lock.expiresAt) {
          // 延长锁的有效期
          lock.expiresAt = Date.now() + timeout;
        } else {
          // 锁已经过期或被其他进程获取，停止续期
          await this.stopAutoRenewal(resource);
        }
      } catch (error) {
        console.error('Error during lock renewal:', error);
        await this.stopAutoRenewal(resource);
      }
    };

    // 设置定时器进行定期续期
    const timerId = setInterval(renew, renewalInterval);
    this.renewTimers.set(resource, timerId);
  }

  /**
   * 停止自动续期
   */
  async stopAutoRenewal(resource) {
    const timerId = this.renewTimers.get(resource);
    if (timerId) {
      clearInterval(timerId);
      this.renewTimers.delete(resource);
    }
  }

  /**
   * 检查锁的状态
   */
  async checkLockStatus(resource) {
    const lock = this.lockInfo.get(resource);
    if (!lock) {
      return { locked: false };
    }

    const expired = Date.now() > lock.expiresAt;
    return {
      locked: !expired,
      expiresAt: lock.expiresAt,
      remaining: Math.max(0, lock.expiresAt - Date.now())
    };
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 健康检查：检查所有锁的状态
   */
  async healthCheck() {
    const now = Date.now();
    const locks = [];

    for (const [resource, lock] of this.lockInfo.entries()) {
      const expired = now > lock.expiresAt;
      locks.push({
        resource,
        expired,
        timeRemaining: Math.max(0, lock.expiresAt - now)
      });
    }

    return {
      totalLocks: locks.length,
      expiredLocks: locks.filter(lock => lock.expired).length,
      healthyLocks: locks.filter(lock => !lock.expired).length,
      locks
    };
  }

  /**
   * 清理过期的锁
   */
  async cleanupExpired() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [resource, lock] of this.lockInfo.entries()) {
      if (now > lock.expiresAt) {
        this.lockInfo.delete(resource);
        await this.stopAutoRenewal(resource);
        cleanedCount++;
      }
    }

    return { cleaned: cleanedCount };
  }
}

module.exports = DistributedLockManager;