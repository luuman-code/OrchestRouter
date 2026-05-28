/**
 * AsyncLock - 异步锁实现
 * 基于 AsyncSemaphore(1) 的互斥锁实现，保持向后兼容
 *
 * 【修复】添加状态跟踪防止双重释放
 */
const { AsyncSemaphore } = require('./AsyncSemaphore');

class AsyncLock {
  constructor() {
    this._semaphore = new AsyncSemaphore(1);
    this._owned = false; // 【修复】跟踪锁是否被当前上下文持有
  }

  /**
   * 获取锁并执行回调
   * @param {Function} callback - 回调函数
   * @returns {Promise<any>} 回调执行结果
   */
  async acquire(callback) {
    await this._semaphore.acquire();
    this._owned = true; // 【修复】标记锁已被持有
    try {
      return await callback();
    } finally {
      this._owned = false; // 【修复】先标记为未持有
      this._semaphore.release();
    }
  }

  /**
   * 释放锁
   * 【修复】检查锁是否被当前上下文持有，避免误释放
   */
  release() {
    // 如果锁没有被当前上下文持有，不执行释放
    // 这避免了回调内部已释放锁后，finally块再次释放的问题
    if (this._owned) {
      this._owned = false;
      this._semaphore.release();
    }
    // 如果锁不在当前上下文持有状态下，忽略释放操作
    // 这允许回调内部手动释放后，finally块不会产生双重释放
  }
}

module.exports = { AsyncLock };
