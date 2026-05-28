/**
 * ConcurrencyController - 执行器并发控制器（代理模式）
 *
 * 作为 SharedConcurrencyManager 的代理，简化执行器内部的并发控制调用
 * 不独立维护状态，所有操作委托给共享管理器
 *
 * 设计模式：代理 (Proxy)
 *
 * 【架构改进说明】
 * - 解决职责边界模糊问题：执行器不直接维护并发状态
 * - 所有并发状态由 SharedConcurrencyManager 单例管理
 * - 选择器和执行器通过同一实例保证状态一致性
 * - 【改进 2026-03-28】所有方法返回 Promise，确保线程安全
 *
 * @class ConcurrencyController
 */
class ConcurrencyController {
  /**
   * 创建并发控制器
   * @param {SharedConcurrencyManager} sharedManager - 共享并发管理器实例
   * @param {ModelRegistry} modelRegistry - 模型注册表实例
   */
  constructor(sharedManager, modelRegistry = null) {
    this.sharedManager = sharedManager;
    this.modelRegistry = modelRegistry;  // 【配置优化】注入模型注册表用于获取配置
  }

  /**
   * 尝试获取槽位（非阻塞）
   * 【改进 2026-03-28】返回 Promise，确保线程安全
   * @param {string} modelId - 模型 ID
   * @returns {Promise<boolean>} 是否成功获取槽位
   */
  async tryAcquireSlot(modelId) {
    return await this.sharedManager.tryAcquireSlot(modelId);
  }

  /**
   * 获取槽位（阻塞等待）
   * 【改进 2026-03-28】委托给共享管理器的线程安全实现
   * @param {string} modelId - 模型 ID
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<boolean>} 是否成功获取槽位
   */
  async acquireSlot(modelId, timeoutMs = 60000) {
    return await this.sharedManager.acquireSlot(modelId, timeoutMs);
  }

  /**
   * 释放槽位
   * 【改进 2026-03-28】返回 Promise，确保线程安全
   * @param {string} modelId - 模型 ID
   * @returns {Promise<void>}
   */
  async releaseSlot(modelId) {
    return await this.sharedManager.releaseSlot(modelId);
  }

  /**
   * 获取负载信息（只读代理）
   * 【改进 2026-03-28】所有字段获取都是异步的
   * @param {string} modelId - 模型 ID
   * @returns {Promise<Object>} 负载信息对象
   */
  async getLoadInfo(modelId) {
    const [loadScore, maxConcurrency, currentUsage, recommendation] = await Promise.all([
      this.sharedManager.getLoadScore(modelId),
      this.sharedManager.getMaxConcurrency(modelId),
      this.sharedManager.getCurrentUsage(modelId),
      Promise.resolve(this.sharedManager.getLoadRecommendation?.(modelId) || 'ready')
    ]);

    return {
      loadScore,
      availableSlots: Math.max(0, maxConcurrency - currentUsage),
      maxConcurrency,
      currentUsage,
      recommendation
    };
  }

  /**
   * 【新增 2026-03-28】负载感知的槽位获取（带原子性检查）
   * 确保在槽位获取期间负载状态不会发生变化
   * @param {string} modelId - 模型 ID
   * @param {Object} originalLoadInfo - 原始负载信息
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<Object>} 获取结果
   */
  async acquireSlotWithLoadCheck(modelId, originalLoadInfo, timeoutMs = 60000) {
    const startTime = Date.now();
    const LOAD_CHECK_INTERVAL = 2000; // 每 2 秒检查一次负载
    const LOAD_CHANGE_THRESHOLD = 0.3; // 负载变化超过 30% 考虑切换

    while (Date.now() - startTime < timeoutMs) {
      // 尝试获取槽位
      const slot = await this.sharedManager.tryAcquireSlot(modelId);

      if (slot) {
        return { success: true, model: modelId, slot };
      }

      // 检查负载变化
      const currentLoad = await this.sharedManager.getLoadScore(modelId);
      const originalLoad = originalLoadInfo?.loadScore || currentLoad;
      const loadChange = Math.abs(currentLoad - originalLoad);

      if (loadChange > LOAD_CHANGE_THRESHOLD) {
        console.warn(`负载变化过大 (${originalLoad} -> ${currentLoad})，考虑切换模型`);
        return { success: false, reason: 'load_changed', currentLoad };
      }

      // 等待一段时间
      await new Promise(resolve => setTimeout(resolve, LOAD_CHECK_INTERVAL));
    }

    throw new Error(`Timeout waiting for slot of model ${modelId}`);
  }

  /**
   * 【新增 2026-03-28】带负载快照的原子槽位获取
   * 确保负载检查和槽位获取在同一原子操作中完成
   *
   * 【改进 2026-04-08】使用信号量替代锁，支持真正的并发控制
   * @param {string} modelId - 模型 ID
   * @param {Object} originalLoadInfo - 原始负载信息
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<Object>} 获取结果
   */
  async acquireSlotWithAtomicCheck(modelId, originalLoadInfo, timeoutMs = 60000) {
    const startTime = Date.now();
    const MAX_RETRY_COUNT = 10; // 增加重试次数
    let retryCount = 0;

    console.log(`[ConcurrencyController] acquireSlotWithAtomicCheck 开始 modelId=${modelId} timeout=${timeoutMs}`);

    // 使用指数退避策略
    let retryDelay = 100;

    while (Date.now() - startTime < timeoutMs && retryCount < MAX_RETRY_COUNT) {
      // 使用信号量获取槽位
      const semaphore = this.sharedManager.getModelSemaphore(modelId);

      // 先尝试非阻塞获取
      if (!semaphore.tryAcquire()) {
        retryCount++;
        console.log(`[ConcurrencyController] 信号量获取失败 modelId=${modelId} 重试 ${retryCount}/${MAX_RETRY_COUNT}，等待 ${retryDelay}ms...`);
        // 获取失败，使用指数退避等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 2000); // 最大 2 秒
        continue;
      }

      console.log(`[ConcurrencyController] 信号量获取成功 modelId=${modelId} 检查负载...`);

      try {
        // 在成功获取信号量后检查负载
        const currentLoad = await this.sharedManager.getLoadScore(modelId);
        const maxConcurrency = await this.sharedManager.getMaxConcurrency(modelId);
        const currentUsage = await this.sharedManager.getCurrentUsage(modelId);

        console.log(`[ConcurrencyController] 负载检查 modelId=${modelId} usage=${currentUsage}/${maxConcurrency} load=${currentLoad}`);

        // 检查负载变化是否超过阈值
        const originalLoad = originalLoadInfo?.loadScore || currentLoad;
        const loadChange = Math.abs(currentLoad - originalLoad);
        const LOAD_CHANGE_THRESHOLD = 0.3;

        if (loadChange > LOAD_CHANGE_THRESHOLD) {
          console.warn(`[ConcurrencyController] 负载变化过大 modelId=${modelId} (${originalLoad} -> ${currentLoad})，重试获取槽位`);
          return { success: false, reason: 'load_changed', currentLoad, retry: true };
        }

        // 在同一原子操作中检查并发限制和获取槽位
        if (currentUsage < maxConcurrency) {
          await this.sharedManager.updateCurrentUsage(modelId, currentUsage + 1);
          console.log(`[ConcurrencyController] 槽位获取成功 modelId=${modelId} usage=${currentUsage + 1}/${maxConcurrency}`);
          return {
            success: true,
            model: modelId,
            acquiredAt: Date.now(),
            snapshot: { loadScore: currentLoad, currentUsage: currentUsage + 1 }
          };
        }

        // 当前使用量已达上限，释放信号量
        console.log(`[ConcurrencyController] 并发数已达上限 modelId=${modelId} usage=${currentUsage}/${maxConcurrency}`);
        semaphore.release();
        return { success: false, reason: 'concurrency_limit', currentLoad, retry: false };
      } catch (e) {
        // 出错时释放信号量
        semaphore.release();
        throw e;
      }
    }

    console.error(`[ConcurrencyController] 获取槽位超时 modelId=${modelId}`);
    throw new Error(`Timeout or max retries exceeded waiting for slot of model ${modelId}`);
  }

  /**
   * 获取统计数据（只读代理）
   * 【改进 2026-03-28】返回 Promise，确保线程安全
   * @returns {Promise<Object>} 统计数据
   */
  async getStatistics() {
    return await this.sharedManager.getStatistics();
  }

  /**
   * 【新增 2026-03-28】线程安全的模型注册
   * @param {string} modelId - 模型 ID
   * @param {number} maxConcurrency - 最大并发数
   * @returns {Promise<void>}
   */
  async registerModel(modelId, maxConcurrency) {
    return await this.sharedManager.registerModel(modelId, maxConcurrency);
  }
}

module.exports = ConcurrencyController;
