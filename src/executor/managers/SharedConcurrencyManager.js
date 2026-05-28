/**
 * SharedConcurrencyManager - 共享并发管理器（单例模式）
 *
 * 与 ModelSelector 共享，统一管理所有模型的并发请求
 * 采用单例模式确保状态一致性，选择器和执行器共享同一实例
 *
 * 【改进 2026-03-28】
 * - 每个模型独立的锁，提高并发性能
 * - 支持测试环境单例重置
 * - 资源清理机制
 * - 测试模式支持
 *
 * 【改进 2026-04-08】
 * - 使用 AsyncSemaphore 替代 AsyncLock，支持真正的并发槽位管理
 * - 每个模型独立的信号量，支持 N 个并发槽位
 *
 * 【改进 2026-05-05】
 * - 移除全局锁，使用每模型独立的锁替代
 * - 解决全局锁导致的并发性能瓶颈问题
 * - 不同模型的操作可以真正并行执行
 *
 * @class SharedConcurrencyManager
 */
const { AsyncSemaphore } = require('../utils/AsyncSemaphore');

class SharedConcurrencyManager {
  // 静态属性
  static instance = null;
  static isInitialized = false;

  constructor() {
    // 单例模式：确保全局唯一实例
    if (SharedConcurrencyManager.instance) {
      return SharedConcurrencyManager.instance;
    }

    // 核心状态
    this.activeSlots = new Map();        // 每个模型当前活动请求数
    this.maxConcurrency = new Map();     // 每个模型最大并发数
    this.modelSettings = new Map();      // 模型配置（定价、特性等）

    // 【改进 2026-04-08】每模型独立的信号量，用于控制并发槽位
    this.semaphores = new Map();              // 每个模型独立的信号量

    // 【改进 2026-05-05】每模型独立的锁，替代全局锁
    this.modelLocks = new Map();              // 每个模型独立的锁（AsyncSemaphore(1)）

    // 统计数据快照（用于 getStatistics，避免长时间锁定）
    this.statsCache = new Map();               // 缓存每个模型的统计数据
    this.statsCacheTime = new Map();           // 缓存时间戳
    this.STATS_CACHE_TTL = 1000;               // 缓存有效期 1 秒

    this.modelRegistry = null;           // 模型注册表引用
    this.isTestMode = false;             // 测试模式标志

    SharedConcurrencyManager.instance = this;
    SharedConcurrencyManager.isInitialized = true;
  }

  /**
   * 获取或创建模型锁（懒加载）
   * 【新增 2026-05-05】每模型独立的锁，替代全局锁
   * @param {string} modelId - 模型 ID
   * @returns {AsyncSemaphore} 模型锁实例
   */
  getModelLock(modelId) {
    if (!this.modelLocks.has(modelId)) {
      this.modelLocks.set(modelId, new AsyncSemaphore(1, `lock_${modelId}`));
    }
    return this.modelLocks.get(modelId);
  }

  /**
   * 获取单例实例
   * @static
   * @param {Object} modelRegistry - 可选的模型注册表，如果提供则立即设置
   * @returns {SharedConcurrencyManager} 单例实例
   */
  static getInstance(modelRegistry) {
    if (!SharedConcurrencyManager.instance) {
      new SharedConcurrencyManager();
    }
    // 如果提供了 modelRegistry，立即设置到单例上
    if (modelRegistry) {
      SharedConcurrencyManager.instance.setModelRegistry(modelRegistry);
    }
    return SharedConcurrencyManager.instance;
  }

  /**
   * 【新增 2026-03-28】重置单例实例 - 主要用于测试环境
   * @static
   */
  static reset() {
    if (SharedConcurrencyManager.instance) {
      SharedConcurrencyManager.instance.cleanup();
      SharedConcurrencyManager.instance = null;
      SharedConcurrencyManager.isInitialized = false;
    }
  }

  /**
   * 【新增 2026-03-28】清理资源
   */
  cleanup() {
    // 清理所有信号量
    this.semaphores.clear();
    // 【改进 2026-05-05】清理所有模型锁
    this.modelLocks.clear();
    this.activeSlots.clear();
    this.maxConcurrency.clear();
    this.modelSettings.clear();
    this.statsCache.clear();
    this.statsCacheTime.clear();
  }

  /**
   * 【新增 2026-03-28】设置测试模式
   * @param {boolean} isTest - 是否为测试模式
   */
  setTestMode(isTest = true) {
    this.isTestMode = isTest;
  }

  /**
   * 获取或创建模型信号量（懒加载）
   * 注意：如果 maxConcurrency 尚未缓存，可能会触发异步查找
   * @param {string} modelId - 模型 ID
   * @returns {AsyncSemaphore} 模型信号量实例
   */
  getModelSemaphore(modelId) {
    if (!this.semaphores.has(modelId)) {
      // 尝试从缓存获取 maxConcurrency（同步）
      let maxConcurrency = 50; // 默认值
      if (this.maxConcurrency.has(modelId)) {
        maxConcurrency = this.maxConcurrency.get(modelId);
      } else if (this.modelRegistry) {
        // 尝试从 modelRegistry 获取（同步查找）
        const model = this.modelRegistry.getModel(modelId);
        if (model) {
          maxConcurrency = model.maxConcurrency || 10;
        }
      }
      this.semaphores.set(modelId, new AsyncSemaphore(maxConcurrency, modelId));
    }
    return this.semaphores.get(modelId);
  }

  /**
   * 设置模型注册表引用
   * @param {ModelRegistry} modelRegistry - 模型注册表实例
   */
  setModelRegistry(modelRegistry) {
    this.modelRegistry = modelRegistry;
  }

  /**
   * 尝试获取模型槽位（非阻塞）
   * 与 ModelSelector 的 has_available_concurrency 方法配合
   *
   * 【改进 2026-04-08】使用模型独立信号量实现非阻塞获取
   * 【改进 2026-05-05】移除 modelLock，因为 JavaScript 单线程执行，
   *                   Map.get() 和 Map.set() 之间的同步代码不会被打断，
   *                   信号量本身已提供并发控制
   * @param {string} modelId - 模型 ID
   * @returns {Promise<boolean>} 是否成功获取槽位
   */
  async tryAcquireSlot(modelId) {
    const semaphore = this.getModelSemaphore(modelId);
    const acquired = semaphore.tryAcquire();

    if (acquired) {
      // JavaScript 单线程：同步代码原子执行，无需锁
      const current = this.activeSlots.get(modelId) || 0;
      this.activeSlots.set(modelId, current + 1);
      // 异步更新统计缓存（不阻塞主流程）
      this._scheduleStatsCacheUpdate(modelId);
    }
    return acquired;
  }

  /**
   * 获取模型槽位（阻塞等待）
   * 实现与 ModelSelector 协作的槽位获取逻辑
   *
   * 【改进 2026-04-08】使用信号量阻塞等待，支持超时
   * 【改进 2026-05-05】移除 modelLock，理由同上
   * @param {string} modelId - 模型 ID
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<boolean>} 是否成功获取槽位
   */
  async acquireSlot(modelId, timeoutMs = 60000) {
    const semaphore = this.getModelSemaphore(modelId);
    const acquired = await semaphore.tryAcquireWithTimeout(timeoutMs);

    if (acquired) {
      // JavaScript 单线程：同步代码原子执行，无需锁
      const current = this.activeSlots.get(modelId) || 0;
      this.activeSlots.set(modelId, current + 1);
      // 异步更新统计缓存（不阻塞主流程）
      this._scheduleStatsCacheUpdate(modelId);
      return true;
    }

    throw new Error(`Timeout waiting for slot of model ${modelId}`);
  }

  /**
   * 释放模型槽位
   * 必须与 acquire 成对出现，确保资源释放
   *
   * 【改进 2026-04-08】使用信号量释放
   * 【改进 2026-05-05】移除 modelLock，理由同上
   * @param {string} modelId - 模型 ID
   * @returns {Promise<void>}
   */
  async releaseSlot(modelId) {
    const semaphore = this.getModelSemaphore(modelId);
    // JavaScript 单线程：同步代码原子执行，无需锁
    const current = this.activeSlots.get(modelId) || 1;
    this.activeSlots.set(modelId, Math.max(0, current - 1));
    semaphore.release();
    // 异步更新统计缓存（不阻塞主流程）
    this._scheduleStatsCacheUpdate(modelId);
  }

  /**
   * 【新增 2026-05-05】调度异步统计缓存更新
   * 使用 setTimeout 避免阻塞主流程
   * @param {string} modelId - 模型 ID
   * @private
   */
  _scheduleStatsCacheUpdate(modelId) {
    // 使用 setTimeout 将缓存更新放到下一个事件循环，避免阻塞
    setTimeout(() => {
      this._updateStatsCache(modelId);
    }, 0);
  }

  /**
   * 获取模型最大并发数
   * 与 ModelSelector 共享相同的并发限制逻辑
   * 【配置优化】：从模型注册表统一获取配置，而非硬编码
   * @param {string} modelId - 模型 ID
   * @returns {Promise<number>} 最大并发数
   */
  async getMaxConcurrency(modelId) {
    if (this.maxConcurrency.has(modelId)) {
      return this.maxConcurrency.get(modelId);
    }

    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model) {
        // 从模型注册表获取配置
        return model.maxConcurrency || 10;
      }
    }

    // 默认值
    return 10;
  }

  /**
   * 获取负载分数 (0-1)，0 表示空闲，1 表示满载
   * 与 ModelSelector 的负载感知机制配合
   *
   * 【改进 2026-04-08】读取操作无需加锁，Map 的读取是安全的
   * 【改进 2026-05-05】移除全局锁，直接读取状态
   * @param {string} modelId - 模型 ID
   * @returns {Promise<number>} 负载分数
   */
  async getLoadScore(modelId) {
    // 【改进】直接读取状态，Map 的读取是安全的
    const maxConcurrency = this.maxConcurrency.get(modelId) || 10;
    const currentUsage = this.activeSlots.get(modelId) || 0;

    if (maxConcurrency === 0) return 1.0;
    return Math.min(currentUsage / maxConcurrency, 1.0);
  }

  /**
   * 【改进 2026-03-28】线程安全的当前使用量查询
   * 【改进 2026-05-05】移除全局锁，Map 读取是安全的
   * @param {string} modelId - 模型 ID
   * @returns {Promise<number>} 当前使用量
   */
  async getCurrentUsage(modelId) {
    // 【改进】直接读取状态，Map 的读取是安全的
    return this.activeSlots.get(modelId) || 0;
  }

  /**
   * 【新增 2026-05-05】更新统计缓存
   * @param {string} modelId - 模型 ID
   * @private
   */
  _updateStatsCache(modelId) {
    const usage = this.activeSlots.get(modelId) || 0;
    const max = this.maxConcurrency.get(modelId) || 10;
    this.statsCache.set(modelId, {
      currentUsage: usage,
      maxConcurrency: max,
      loadScore: max > 0 ? Math.min(usage / max, 1.0) : 1.0,
      availableSlots: Math.max(0, max - usage),
      recommendation: this._getLoadRecommendationInternal(usage, max)
    });
    this.statsCacheTime.set(modelId, Date.now());
  }

  /**
   * 【新增 2026-05-05】内部负载推荐计算（不依赖实例状态）
   * @param {number} usage - 当前使用量
   * @param {number} max - 最大并发数
   * @returns {string} 推荐状态
   * @private
   */
  _getLoadRecommendationInternal(usage, max) {
    const loadScore = max > 0 ? usage / max : 1;
    if (loadScore < 0.3) return 'ready';
    if (loadScore < 0.7) return 'normal';
    if (loadScore < 0.9) return 'busy';
    return 'overloaded';
  }

  /**
   * 【改进 2026-03-28】线程安全的统计数据获取
   * 【改进 2026-05-05】使用缓存机制避免频繁遍历加锁
   * @returns {Promise<Object>} 统计数据
   */
  async getStatistics() {
    const now = Date.now();
    const stats = {};
    const needUpdate = [];

    // 先从缓存获取，同时检查哪些需要更新
    for (const [modelId, usage] of this.activeSlots.entries()) {
      const cacheTime = this.statsCacheTime.get(modelId);
      if (cacheTime && (now - cacheTime < this.STATS_CACHE_TTL)) {
        // 使用缓存
        stats[modelId] = this.statsCache.get(modelId);
      } else {
        // 需要更新
        needUpdate.push(modelId);
      }
    }

    // 批量更新需要刷新缓存的数据（异步，不阻塞）
    if (needUpdate.length > 0) {
      // 使用 Promise.all 并行更新每个模型的缓存（每个模型有独立的锁）
      await Promise.all(needUpdate.map(modelId => this._updateStatsCacheAsync(modelId)));
    }

    // 再次获取（可能从缓存，可能刚更新）
    for (const modelId of needUpdate) {
      stats[modelId] = this.statsCache.get(modelId);
    }

    return stats;
  }

  /**
   * 【新增 2026-05-05】异步更新统计缓存
   * 移除 modelLock，因为 JavaScript 单线程执行，Map 写入是原子的
   * @param {string} modelId - 模型 ID
   * @private
   */
  async _updateStatsCacheAsync(modelId) {
    // 缓存更新本身就是轻量级操作，直接调用即可
    this._updateStatsCache(modelId);
  }

  /**
   * 【新增 2026-03-28】线程安全的模型注册
   * 【改进 2026-05-05】移除 modelLock，Map.set() 是幂等的
   * @param {string} modelId - 模型 ID
   * @param {number} maxConcurrency - 最大并发数
   * @returns {Promise<void>}
   */
  async registerModel(modelId, maxConcurrency) {
    // Map.set() 对同一 key 是幂等的，无需锁
    this.maxConcurrency.set(modelId, maxConcurrency);
    // 确保模型信号量存在（懒加载）
    this.getModelSemaphore(modelId);
    // 异步更新统计缓存
    this._scheduleStatsCacheUpdate(modelId);
  }

  /**
   * 【新增 2026-03-28】更新当前使用量（内部使用）
   * 【改进 2026-05-05】移除 modelLock，直接更新即可
   * @param {string} modelId - 模型 ID
   * @param {number} usage - 使用量
   * @returns {Promise<void>}
   */
  async updateCurrentUsage(modelId, usage) {
    // JavaScript 单线程：同步代码原子执行
    this.activeSlots.set(modelId, Math.max(0, usage));
    // 异步更新统计缓存
    this._scheduleStatsCacheUpdate(modelId);
  }

  /**
   * 获取负载推荐状态
   * @param {string} modelId - 模型 ID
   * @returns {string} 推荐状态
   */
  getLoadRecommendation(modelId) {
    const loadScore = this.activeSlots.has(modelId) && this.maxConcurrency.has(modelId)
      ? (this.activeSlots.get(modelId) || 0) / (this.maxConcurrency.get(modelId) || 10)
      : 0;

    if (loadScore < 0.3) return 'ready';
    if (loadScore < 0.7) return 'normal';
    if (loadScore < 0.9) return 'busy';
    return 'overloaded';
  }

  /**
   * 从模型 ID 提取提供商
   * 【改进】(2026-04-02): 优先从模型注册表获取提供商信息
   * @param {string} modelId - 模型 ID
   * @returns {string} 提供商名称
   */
  getProvider(modelId) {
    // 优先从模型注册表获取
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.provider) {
        return model.provider;
      }
    }

    // 回退到关键字匹配
    if (modelId.includes('gpt') || modelId.includes('openai')) return 'openai';
    if (modelId.includes('claude') || modelId.includes('anthropic')) return 'anthropic';
    if (modelId.includes('gemini') || modelId.includes('google')) return 'gemini';
    if (modelId.includes('ollama')) return 'ollama';
    if (modelId.includes('deepseek')) return 'deepseek';
    if (modelId.includes('qwen')) return 'aliyun';
    if (modelId.includes('minimax')) return 'minimax';
    if (modelId.includes('kimi') || modelId.includes('moonshot')) return 'moonshot';
    if (modelId.includes('glm') || modelId.includes('zhipu')) return 'zhipu';
    if (modelId.includes('bailian')) return 'bailian';
    return 'openai';
  }

  /**
   * @deprecated 已废弃，请使用 getProvider 方法
   */
  extractProvider(modelId) {
    return this.getProvider(modelId);
  }
}

module.exports = SharedConcurrencyManager;
