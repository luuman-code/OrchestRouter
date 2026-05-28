/**
 * @fileoverview OrchestratorCacheManager - 编排器缓存管理器
 *
 * 基于任务指纹的缓存键生成
 * 与现有的缓存机制集成
 * 提供任务级别缓存支持
 * 支持 LLM 语义相似度判断
 */

const crypto = require('crypto');
const { CacheManager } = require('../../integrator/cache/cache_manager');

// 尝试加载 LLM 客户端
let LLMClient = null;
try {
  LLMClient = require('../../decomposer/llm/LLMClient');
} catch (e) {
  console.warn('[OrchestratorCacheManager] LLMClient 不可用，语义相似度功能将被禁用');
}

/**
 * CacheKeyOptions - 缓存键选项
 *
 * @typedef {Object} CacheKeyOptions
 * @property {string} taskId - 任务ID
 * @property {string} taskType - 任务类型
 * @property {string} [userId] - 用户ID
 * @property {string} [sessionId] - 会话ID
 * @property {string} [projectId] - 项目ID
 * @property {string} [inputHash] - 输入内容哈希
 * @property {number} [version] - 缓存版本
 */

/**
 * TaskCacheEntry - 任务缓存条目
 *
 * @typedef {Object} TaskCacheEntry
 * @property {string} key - 缓存键
 * @property {*} value - 缓存值
 * @property {number} timestamp - 时间戳
 * @property {number} ttl - 过期时间（毫秒）
 * @property {string} [hash] - 内容哈希
 * @property {string} taskId - 任务ID
 * @property {string} taskType - 任务类型
 * @property {string} [userId] - 用户ID
 * @property {string} [sessionId] - 会话ID
 */

/**
 * OrchestratorCacheManager - 编排器缓存管理器
 *
 * 提供编排器层面的任务缓存功能
 */
class OrchestratorCacheManager {
  /**
   * 创建编排器缓存管理器
   *
   * @param {Object} [config] - 配置选项
   * @param {boolean} [config.enabled=true] - 是否启用缓存
   * @param {number} [config.defaultTTL=3600000] - 默认过期时间（1小时）
   * @param {number} [config.maxEntries=1000] - 最大缓存条目数
   * @param {boolean} [config.persistenceEnabled=true] - 是否启用持久化
   */
  constructor(config = {}) {
    /** @type {boolean} */
    this.enabled = config.enabled !== false;

    /** @type {number} */
    this.defaultTTL = config.defaultTTL || 3600000; // 1小时默认

    /** @type {number} */
    this.maxEntries = config.maxEntries || 1000;

    /** @type {boolean} */
    this.persistenceEnabled = config.persistenceEnabled !== false;

    // 集成现有的缓存管理器
    this.integratorCacheManager = new CacheManager({
      maxEntries: this.maxEntries,
      ttl: this.defaultTTL,
      persistenceEnabled: this.persistenceEnabled
    });

    // 用于跟踪任务级别的缓存统计
    /** @type {Map<string, number>} */
    this.taskHitCounts = new Map();

    // 用于跟踪缓存键的来源信息
    /** @type {Map<string, Object>} */
    this.cacheKeyMetadata = new Map();

    // ========== LLM 语义相似度相关配置 ==========
    /** @type {Object} */
    this.llmConfig = {
      enabled: config.llm?.enabled !== false, // 是否启用 LLM 相似度判断
      baseUrl: config.llm?.baseUrl || 'http://localhost:11434',
      model: config.llm?.model || 'qwen2.5:3b',
      timeout: config.llm?.timeout || 30000,
      similarityThreshold: config.llm?.similarityThreshold || 0.8 // 相似度阈值
    };

    /** @type {Object} */
    this.llmClient = null;

    // 初始化 LLM 客户端
    if (this.llmConfig.enabled && LLMClient) {
      try {
        this.llmClient = new LLMClient({
          baseUrl: this.llmConfig.baseUrl,
          model: this.llmConfig.model,
          timeout: this.llmConfig.timeout
        });
        console.log(`[OrchestratorCacheManager] LLM 语义相似度功能已启用，使用模型: ${this.llmConfig.model}`);
      } catch (e) {
        console.warn(`[OrchestratorCacheManager] LLM 客户端初始化失败: ${e.message}`);
        this.llmClient = null;
      }
    }

    // 存储任务描述与缓存键的映射（用于 LLM 相似度匹配）
    /** @type {Map<string, Object>} */
    this.taskDescriptionIndex = new Map();

    // 相似度缓存（避免重复调用 LLM）
    /** @type {Map<string, number>} */
    this.similarityCache = new Map();
  }

  /**
   * 生成任务缓存键
   *
   * @param {CacheKeyOptions} options - 缓存键选项
   * @returns {string} 生成的缓存键
   */
  generateTaskCacheKey(options) {
    if (!options.taskId) {
      throw new Error('taskId is required for cache key generation');
    }

    // 创建一个标识任务唯一性的指纹
    const fingerprint = {
      taskId: options.taskId,
      taskType: options.taskType || 'generic',
      userId: options.userId || 'anonymous',
      sessionId: options.sessionId || 'none',
      projectId: options.projectId || 'default',
      inputHash: options.inputHash || 'no-input',
      version: options.version || 1,
      timestamp: Date.now()
    };

    // 生成稳定的哈希作为缓存键
    const jsonString = JSON.stringify(fingerprint);
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    // 创建有意义的键格式便于调试
    const readablePart = `${fingerprint.taskType}_${fingerprint.taskId}`;
    const key = `${readablePart}_${hash.substring(0, 16)}`;

    // 存储元数据以便后续调试
    this.cacheKeyMetadata.set(key, {
      ...fingerprint,
      createdAt: new Date(),
      key: key
    });

    return key;
  }

  /**
   * 为请求生成缓存键（基于请求内容的指纹）
   *
   * @param {Object} request - 请求对象
   * @returns {string} 生成的缓存键
   */
  generateRequestCacheKey(request) {
    if (!request) {
      return null;
    }

    // 【关键修复】同时从 context 和顶层获取 sessionId
    const sessionId = request.context?.sessionId || request.session_id || 'none';

    // 提取请求的关键特征来生成指纹
    const requestFingerprint = {
      // 任务描述相关的部分
      taskDescription: request.task?.description || request.query || request.prompt || '',

      // 【关键修复】实现计划 - 必须包含，否则不同 tech_stack 会返回相同的缓存结果
      implementationPlan: request.implementation_plan ? {
        tech_stack: request.implementation_plan.tech_stack,
        architecture_patterns: request.implementation_plan.architecture_patterns,
        code_standards: request.implementation_plan.code_standards,
        path_conventions: request.implementation_plan.path_conventions,
        dependencies: request.implementation_plan.dependencies,
        best_practices: request.implementation_plan.best_practices,
        api_conventions: request.implementation_plan.api_conventions,
        shared_modules: request.implementation_plan.shared_modules
      } : null,

      // 配置相关的部分
      config: {
        model: request.model || request.config?.model,
        maxTokens: request.config?.maxTokens,
        temperature: request.config?.temperature,
        topP: request.config?.topP
      },

      // 【关键修复】上下文相关的部分 - 明确包含 sessionId
      context: {
        projectId: request.context?.projectId,
        userId: request.context?.userId,
        sessionId: sessionId
      },

      // 顶层也添加 sessionId 以确保兼容性
      sessionId: sessionId,

      // 输入数据的哈希
      inputDataHash: this.hashInputData(request.input || request.data || {}),

      // 时间戳（可以选择性包含或排除，取决于是否希望时间影响缓存）
      version: request.version || 1
    };

    // 生成哈希键
    const jsonString = JSON.stringify(requestFingerprint, this.stableStringifyReplacer);
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    // 创建可读的键名，包含 sessionId
    const taskDescHash = crypto.createHash('md5')
      .update(requestFingerprint.taskDescription.substring(0, 100))
      .digest('hex')
      .substring(0, 8);

    return `req_${sessionId}_${taskDescHash}_${hash.substring(0, 16)}`;
  }

  /**
   * 稳定的字符串化替换函数（确保对象属性排序一致）
   *
   * @private
   * @param {string} key - 键
   * @param {*} value - 值
   * @returns {*} 处理后的值
   */
  stableStringifyReplacer(key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sortedObj = {};
      const keys = Object.keys(value).sort();
      for (const k of keys) {
        sortedObj[k] = value[k];
      }
      return sortedObj;
    }
    return value;
  }

  /**
   * 对输入数据进行哈希计算
   *
   * @private
   * @param {*} data - 输入数据
   * @returns {string} 数据哈希
   */
  hashInputData(data) {
    try {
      const jsonString = JSON.stringify(data, this.stableStringifyReplacer);
      return crypto.createHash('md5').update(jsonString).digest('hex');
    } catch (error) {
      // 如果序列化失败，返回一个默认哈希
      return crypto.createHash('md5').update(String(data)).digest('hex');
    }
  }

  /**
   * 检查缓存中是否存在指定键的值
   *
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否存在
   */
  async has(key) {
    if (!this.enabled || !key) {
      return false;
    }

    // 检查集成器缓存
    const existsInGeneralCache = this.integratorCacheManager.generalCache.has(key);

    return existsInGeneralCache;
  }

  /**
   * 从缓存获取值
   *
   * @param {string} key - 缓存键
   * @returns {Promise<*>} 缓存值，如果不存在则返回 null
   */
  async get(key) {
    if (!this.enabled || !key) {
      return null;
    }

    // 从集成器的通用缓存获取
    const cachedValue = this.integratorCacheManager.generalCache.get(key);

    if (cachedValue !== null) {
      // 更新命中计数
      const hitCount = this.taskHitCounts.get(key) || 0;
      this.taskHitCounts.set(key, hitCount + 1);

      // 记录缓存命中
      this.logCacheOperation('HIT', key, cachedValue);
    }

    return cachedValue;
  }

  /**
   * 设置缓存值
   *
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {Object} [options] - 选项
   * @param {number} [options.ttl] - 过期时间（毫秒）
   * @param {string} [options.taskId] - 任务ID
   * @param {string} [options.taskType] - 任务类型
   * @returns {Promise<void>}
   */
  async set(key, value, options = {}) {
    if (!this.enabled || !key) {
      return;
    }

    const ttl = options.ttl || this.defaultTTL;

    // 使用集成器的通用缓存设置
    this.integratorCacheManager.generalCache.set(key, value, {
      ttl,
      hash: options.hash || this.hashInputData(value)
    });

    // 初始化命中计数
    this.taskHitCounts.set(key, 0);

    // 记录缓存设置
    this.logCacheOperation('SET', key, value);

    // 存储额外的元数据
    if (options.taskId) {
      const metadata = this.cacheKeyMetadata.get(key) || {};
      metadata.taskId = options.taskId;
      metadata.taskType = options.taskType || 'generic';
      metadata.setAt = new Date();
      this.cacheKeyMetadata.set(key, metadata);
    }
  }

  /**
   * 从缓存删除值
   *
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(key) {
    if (!this.enabled || !key) {
      return false;
    }

    // 从集成器缓存删除
    const deletedFromGeneral = this.integratorCacheManager.generalCache.delete(key);

    // 清除相关的计数和元数据
    this.taskHitCounts.delete(key);
    this.cacheKeyMetadata.delete(key);

    if (deletedFromGeneral) {
      this.logCacheOperation('DELETE', key);
    }

    return deletedFromGeneral;
  }

  /**
   * 清空所有缓存
   *
   * @returns {Promise<void>}
   */
  async clearAll() {
    if (!this.enabled) {
      return;
    }

    // 清空集成器缓存
    this.integratorCacheManager.clearAll();

    // 清空本地跟踪数据
    this.taskHitCounts.clear();
    this.cacheKeyMetadata.clear();

    this.logCacheOperation('CLEAR_ALL');
  }

  /**
   * 获取缓存统计信息
   *
   * @returns {Object} 缓存统计信息
   */
  getStats() {
    if (!this.enabled) {
      return {
        enabled: false,
        totalEntries: 0,
        hits: 0,
        misses: 0,
        hitRate: 0
      };
    }

    const generalCacheStats = this.integratorCacheManager.generalCache.getStats();
    const totalHits = Array.from(this.taskHitCounts.values()).reduce((sum, count) => sum + count, 0);

    return {
      enabled: this.enabled,
      totalEntries: generalCacheStats.valid,
      hits: totalHits,
      misses: generalCacheStats.total - generalCacheStats.valid, // Approximation
      hitRate: generalCacheStats.total > 0 ? (generalCacheStats.valid / generalCacheStats.total) : 0,
      maxEntries: generalCacheStats.maxEntries,
      cacheKeys: Array.from(this.taskHitCounts.keys()),
      generalCacheStats
    };
  }

  /**
   * 获取特定任务的缓存统计
   *
   * @param {string} taskId - 任务ID
   * @returns {Object} 任务缓存统计
   */
  getTaskStats(taskId) {
    if (!this.enabled || !taskId) {
      return null;
    }

    const relevantKeys = Array.from(this.cacheKeyMetadata.entries())
      .filter(([_, metadata]) => metadata.taskId === taskId)
      .map(([key, _]) => key);

    const hitCounts = relevantKeys.map(key => ({
      key,
      hits: this.taskHitCounts.get(key) || 0,
      metadata: this.cacheKeyMetadata.get(key)
    }));

    return {
      taskId,
      cacheKeys: relevantKeys,
      totalHits: hitCounts.reduce((sum, item) => sum + item.hits, 0),
      hitDetails: hitCounts
    };
  }

  /**
   * 缓存中间件 - 检查缓存并返回结果或继续处理
   *
   * @param {Object} request - 请求对象
   * @param {Function} processFn - 处理函数
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 缓存结果或处理结果
   */
  async withCache(request, processFn, options = {}) {
    if (!this.enabled) {
      // 如果禁用了缓存，直接执行处理函数
      return await processFn(request);
    }

    // 生成缓存键
    const cacheKey = this.generateRequestCacheKey(request);

    if (!cacheKey) {
      // 如果无法生成缓存键，直接执行处理函数
      return await processFn(request);
    }

    // 尝试从缓存获取
    const cachedResult = await this.get(cacheKey);

    if (cachedResult !== null) {
      // 缓存命中，返回缓存结果
      return {
        ...cachedResult,
        fromCache: true,
        cacheKey
      };
    }

    // 缓存未命中，执行处理函数
    const result = await processFn(request);

    // 如果结果有效，存入缓存
    if (result && !options.skipCacheFor?.(result)) {
      const cacheOptions = {
        ttl: options.ttl || this.defaultTTL,
        taskId: request.taskId || 'generic',
        taskType: request.taskType || 'generic'
      };

      await this.set(cacheKey, result, cacheOptions);
    }

    return {
      ...result,
      fromCache: false,
      cacheKey
    };
  }

  /**
   * 批量操作：获取多个键的缓存值
   *
   * @param {string[]} keys - 缓存键数组
   * @returns {Promise<Object>} 包含命中和未命中的结果
   */
  async batchGet(keys) {
    if (!this.enabled || !keys || keys.length === 0) {
      return { hits: {}, misses: keys };
    }

    const results = {};
    const misses = [];

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) {
        results[key] = value;
      } else {
        misses.push(key);
      }
    }

    return { hits: results, misses };
  }

  /**
   * 批量操作：设置多个键值对
   *
   * @param {Object} keyValuePairs - 键值对对象
   * @param {Object} [options] - 选项
   * @returns {Promise<void>}
   */
  async batchSet(keyValuePairs, options = {}) {
    if (!this.enabled) {
      return;
    }

    const promises = Object.entries(keyValuePairs).map(async ([key, value]) => {
      await this.set(key, value, options);
    });

    await Promise.all(promises);
  }

  /**
   * 记录缓存操作日志
   *
   * @private
   * @param {string} operation - 操作类型
   * @param {string} [key] - 缓存键
   * @param {*} [value] - 缓存值
   */
  logCacheOperation(operation, key, value) {
    // 可以根据需要启用详细的缓存操作日志
    if (process.env.DEBUG_CACHE_OPERATIONS) {
      const valueSize = value ? JSON.stringify(value).length : 0;
      console.log(`[CACHE] ${operation} key: ${key}, size: ${valueSize} bytes`);
    }
  }

  /**
   * 清理过期缓存
   *
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.enabled) {
      return;
    }

    // 让集成器缓存管理器执行清理
    this.integratorCacheManager.cleanup();

    // 清理过期的本地元数据
    const now = Date.now();
    const ttl = this.defaultTTL;

    // 注意：由于我们在 generalCache 中没有直接的过期检查方法，
    // 我们依赖底层缓存的内置过期机制
  }

  // ========== 扩展缓存方法：分解结果、模型选择、复杂度分析 ==========

  /**
   * 缓存任务分解结果
   * @param {Object} request - 请求对象
   * @param {Object} decomposeFn - 分解函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 分解结果
   */
  async withDecompositionCache(request, decomposeFn, options = {}) {
    if (!this.enabled) {
      return await decomposeFn(request);
    }

    // 生成分解结果的缓存键（基于任务描述）
    const cacheKey = this._generateStageCacheKey(request, 'decomposition');

    // 尝试从缓存获取（精确匹配）
    const cachedResult = await this.get(cacheKey);

    if (cachedResult !== null) {
      console.log(`[CACHE] 分解结果命中缓存（精确匹配）: ${cacheKey.substring(0, 30)}...`);
      return {
        ...cachedResult,
        fromCache: true,
        cacheStage: 'decomposition'
      };
    }

    // 缓存未命中，尝试 LLM 语义相似度搜索
    if (this.llmClient) {
      console.log(`[CACHE] 精确匹配未命中，尝试 LLM 语义相似度搜索...`);
      const similarResult = await this.findSimilarCachedTask(request, 'decomposition');

      if (similarResult) {
        console.log(`[CACHE] 通过 LLM 语义相似度找到缓存: 相似度=${similarResult.similarity?.toFixed(2)}`);
        return similarResult;
      }
    }

    // 执行分解
    const result = await decomposeFn(request);

    // 缓存结果
    if (result && result.subtasks && result.subtasks.length > 0) {
      const ttl = options.ttl || this.defaultTTL;
      await this.set(cacheKey, result, { ttl, taskId: 'decomposition', taskType: 'decompose' });
      // 索引任务描述用于后续相似度匹配
      this.indexTaskDescription(request, cacheKey, 'decomposition');
      console.log(`[CACHE] 分解结果已缓存: ${cacheKey.substring(0, 30)}...`);
    }

    return {
      ...result,
      fromCache: false,
      cacheStage: 'decomposition'
    };
  }

  /**
   * 缓存模型选择结果
   * @param {Array} subtasks - 子任务列表
   * @param {Object} complexityAnalysis - 复杂度分析结果
   * @param {Function} selectFn - 模型选择函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 带模型选择的子任务列表
   */
  async withModelSelectionCache(subtasks, complexityAnalysis, selectFn, options = {}) {
    if (!this.enabled || !subtasks || subtasks.length === 0) {
      return await selectFn(subtasks);
    }

    // 【关键修复】从 subtasks 中提取 sessionId
    const sessionId = subtasks[0]?.context?.sessionId || subtasks[0]?.session_id || null;

    // 生成模型选择的缓存键（基于子任务的关键信息）
    const cacheKey = this._generateModelSelectionCacheKey(subtasks, complexityAnalysis, sessionId);

    // 尝试从缓存获取
    const cachedResult = await this.get(cacheKey);

    if (cachedResult !== null) {
      console.log(`[CACHE] 模型选择结果命中缓存: ${cacheKey.substring(0, 30)}...`);

      // 将缓存的结果与原始子任务合并（保留原始子任务的 ID 等信息）
      return subtasks.map((subtask, index) => ({
        ...subtask,
        ...(cachedResult[index] || {}),
        fromCache: true,
        cacheStage: 'model_selection'
      }));
    }

    // 缓存未命中，执行模型选择
    const result = await selectFn(subtasks);

    // 缓存结果（只缓存模型选择相关的信息）
    if (result && result.length > 0) {
      const ttl = options.ttl || this.defaultTTL;
      const selectionOnly = result.map(r => ({
        selected_model: r.selected_model,
        selection_reason: r.selection_reason,
        estimated_cost: r.estimated_cost,
        estimated_tokens: r.estimated_tokens,
        selection_metadata: r.selection_metadata
      }));
      await this.set(cacheKey, selectionOnly, { ttl, taskId: 'model_selection', taskType: 'select' });
      console.log(`[CACHE] 模型选择结果已缓存: ${cacheKey.substring(0, 30)}...`);
    }

    return result.map(r => ({
      ...r,
      fromCache: false,
      cacheStage: 'model_selection'
    }));
  }

  /**
   * 缓存复杂度分析结果
   * @param {Object} request - 请求对象
   * @param {Function} analyzeFn - 分析函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 复杂度分析结果
   */
  async withComplexityCache(request, analyzeFn, options = {}) {
    if (!this.enabled) {
      return await analyzeFn(request);
    }

    // 生成复杂度分析的缓存键
    const cacheKey = this._generateStageCacheKey(request, 'complexity');

    // 尝试从缓存获取（精确匹配）
    const cachedResult = await this.get(cacheKey);

    if (cachedResult !== null) {
      console.log(`[CACHE] 复杂度分析命中缓存（精确匹配）: ${cacheKey.substring(0, 30)}...`);
      return {
        ...cachedResult,
        fromCache: true,
        cacheStage: 'complexity'
      };
    }

    // 缓存未命中，尝试 LLM 语义相似度搜索
    if (this.llmClient) {
      console.log(`[CACHE] 精确匹配未命中，尝试 LLM 语义相似度搜索...`);
      const similarResult = await this.findSimilarCachedTask(request, 'complexity');

      if (similarResult) {
        console.log(`[CACHE] 通过 LLM 语义相似度找到缓存: 相似度=${similarResult.similarity?.toFixed(2)}`);
        return similarResult;
      }
    }

    // 执行分析
    const result = await analyzeFn(request);

    // 缓存结果
    if (result) {
      const ttl = options.ttl || (this.defaultTTL / 2); // 复杂度分析缓存时间短一些
      await this.set(cacheKey, result, { ttl, taskId: 'complexity', taskType: 'analyze' });
      // 索引任务描述用于后续相似度匹配
      this.indexTaskDescription(request, cacheKey, 'complexity');
      console.log(`[CACHE] 复杂度分析已缓存: ${cacheKey.substring(0, 30)}...`);
    }

    return {
      ...result,
      fromCache: false,
      cacheStage: 'complexity'
    };
  }

  /**
   * 生成阶段缓存键（用于分解和复杂度分析）
   * @private
   */
  _generateStageCacheKey(request, stage) {
    // 提取任务描述的哈希
    let taskDesc = '';
    if (request.task?.description) {
      taskDesc = request.task.description;
    } else if (request.prompt) {
      taskDesc = request.prompt;
    } else if (request.query) {
      taskDesc = request.query;
    } else if (typeof request === 'string') {
      taskDesc = request;
    } else {
      taskDesc = JSON.stringify(request);
    }

    const hash = crypto.createHash('sha256').update(taskDesc).digest('hex');

    // 【关键修复】从 context 中获取 sessionId，确保不同会话的缓存隔离
    const sessionId = request.context?.sessionId || request.session_id || 'none';

    return `orch_${stage}_${sessionId}_${hash.substring(0, 16)}`;
  }

  /**
   * 生成模型选择的缓存键
   * @private
   */
  _generateModelSelectionCacheKey(subtasks, complexityAnalysis, sessionId = null) {
    // 基于子任务的关键信息生成缓存键
    const keyInfo = {
      // 【关键修复】添加 sessionId，确保不同会话的缓存隔离
      sessionId: sessionId || subtasks[0]?.context?.sessionId || subtasks[0]?.session_id || 'none',
      subtaskCount: subtasks.length,
      subtaskTypes: subtasks.map(s => s.type || 'general').sort(),
      subtaskDescriptions: subtasks.map(s => (s.description || s.title || '').substring(0, 50)).sort(),
      complexity: complexityAnalysis ? {
        isComplex: complexityAnalysis.isComplex,
        confidence: complexityAnalysis.confidence
      } : null
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyInfo)).digest('hex');
    return `orch_modelsel_${keyInfo.sessionId}_${hash.substring(0, 16)}`;
  }

  // ========== LLM 语义相似度判断方法 ==========

  /**
   * 提取任务描述的核心内容（用于相似度比较）
   * @private
   */
  _extractTaskDescription(request) {
    let taskDesc = '';

    if (request.task?.description) {
      taskDesc = request.task.description;
    } else if (request.task?.title) {
      taskDesc = request.task.title;
    } else if (request.prompt) {
      taskDesc = request.prompt;
    } else if (request.query) {
      taskDesc = request.query;
    } else if (typeof request === 'string') {
      taskDesc = request;
    } else if (request.messages && Array.isArray(request.messages)) {
      // 从 Anthropic API 消息中提取
      const userMessages = request.messages.filter(m => m && m.role === 'user');
      if (userMessages.length > 0) {
        const lastMsg = userMessages[userMessages.length - 1];
        taskDesc = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
      }
    }

    // 规范化：移除多余空格和换行
    return taskDesc.replace(/\s+/g, ' ').trim();
  }

  /**
   * 提取完整的任务信息（用于分层相似度计算）
   * @private
   * @param {Object} request - 请求对象
   * @returns {Object} 任务信息
   */
  _extractFullTaskInfo(request) {
    return {
      description: this._extractTaskDescription(request),
      type: request.task?.type || request.taskType || null,
      deliverables: request.task?.deliverables || request.deliverables || [],
      sessionId: request.sessionId || request.context?.sessionId || null,
      projectId: request.projectId || request.context?.projectId || null,
      userId: request.userId || request.context?.userId || null
    };
  }

  /**
   * 分层相似度计算主方法
   * @private
   * @param {Object} info1 - 任务信息1
   * @param {Object} info2 - 任务信息2
   * @returns {Promise<Object>} 相似度结果
   */
  async _calculateLayerSimilarity(info1, info2) {
    // L1: 精确匹配 (SHA256)
    if (info1.description && info2.description &&
        info1.description === info2.description) {
      return { score: 1.0, layer: 'L1', matched: 'exact', weightedScore: 1.0 };
    }

    // L2: LLM 语义相似度 (权重 85%)
    const llmSimilarity = await this._calculateSemanticSimilarity(
      info1.description, info2.description
    );
    if (llmSimilarity >= 0.8) {
      return { score: llmSimilarity, layer: 'L2', matched: 'llm', weightedScore: llmSimilarity * 0.85 };
    }

    // L3: 关键词重叠 (权重 60%)
    const keywordScore = this._calculateKeywordSimilarity(info1.description, info2.description);
    if (keywordScore >= 0.6) {
      return { score: keywordScore, layer: 'L3', matched: 'keyword', weightedScore: keywordScore * 0.6 };
    }

    // L4: 任务类型 + 交付物 (权重 50%)
    const typeDeliverableScore = this._calculateTypeDeliverableSimilarity(info1, info2);
    if (typeDeliverableScore >= 0.5) {
      return { score: typeDeliverableScore, layer: 'L4', matched: 'type_deliverable', weightedScore: typeDeliverableScore * 0.5 };
    }

    // L5: 上下文关联 (权重 30%)
    const contextScore = this._calculateContextSimilarity(info1, info2);
    if (contextScore >= 0.3) {
      return { score: contextScore, layer: 'L5', matched: 'context', weightedScore: contextScore * 0.3 };
    }

    // 即使没有达到阈值，也返回最佳匹配（用于调试）
    return {
      score: Math.max(llmSimilarity, keywordScore, typeDeliverableScore, contextScore),
      layer: 'none',
      matched: null,
      weightedScore: 0
    };
  }

  /**
   * 提取关键词
   * @private
   * @param {string} text - 文本
   * @returns {string[]} 关键词数组
   */
  _extractKeywords(text) {
    if (!text) return [];

    // 转换为小写并分词
    const words = text.toLowerCase().split(/[\s,，、。.!@#$%^&*()\[\]{}\/\\:;'"<>?]+/);

    // 过滤停用词和短词
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
      'to', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
      'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
      '现在', '现在', '这个', '那个', '这些', '那些', '一个', '什么', '如何', '怎么',
      '请', '帮', '创建', '实现', '需要', '可以', '能够']);

    return words.filter(w => w.length > 1 && !stopWords.has(w));
  }

  /**
   * 计算 Jaccard 相似度
   * @private
   * @param {string[]} set1 - 集合1
   * @param {string[]} set2 - 集合2
   * @returns {number} 相似度分数
   */
  _jaccardSimilarity(set1, set2) {
    if (!set1 || set1.length === 0 || !set2 || set2.length === 0) {
      return 0;
    }

    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    return intersection.size / union.size;
  }

  /**
   * L3: 关键词相似度计算
   * @private
   * @param {string} desc1 - 描述1
   * @param {string} desc2 - 描述2
   * @returns {number} 相似度分数
   */
  _calculateKeywordSimilarity(desc1, desc2) {
    const keywords1 = this._extractKeywords(desc1);
    const keywords2 = this._extractKeywords(desc2);

    return this._jaccardSimilarity(keywords1, keywords2);
  }

  /**
   * L4: 任务类型 + 交付物相似度计算
   * @private
   * @param {Object} info1 - 任务信息1
   * @param {Object} info2 - 任务信息2
   * @returns {number} 相似度分数
   */
  _calculateTypeDeliverableSimilarity(info1, info2) {
    let score = 0;

    // 任务类型匹配 (30%)
    if (info1.type && info2.type && info1.type === info2.type) {
      score += 0.3;
    }

    // 交付物重叠 (70%)
    if (info1.deliverables && info2.deliverables &&
        Array.isArray(info1.deliverables) && Array.isArray(info2.deliverables)) {
      const deliverableScore = this._calculateDeliverableOverlap(
        info1.deliverables, info2.deliverables
      );
      score += deliverableScore * 0.7;
    }

    return score;
  }

  /**
   * 计算交付物重叠度
   * @private
   * @param {string[]} deliverables1 - 交付物列表1
   * @param {string[]} deliverables2 - 交付物列表2
   * @returns {number} 重叠分数
   */
  _calculateDeliverableOverlap(deliverables1, deliverables2) {
    if (!deliverables1 || deliverables1.length === 0 ||
        !deliverables2 || deliverables2.length === 0) {
      return 0;
    }

    // 标准化交付物名称
    const normalize = (items) => items.map(i =>
      String(i).toLowerCase().replace(/[_\-\s]+/g, ' ').trim()
    );

    const norm1 = normalize(deliverables1);
    const norm2 = normalize(deliverables2);

    // 计算 Jaccard 相似度
    return this._jaccardSimilarity(norm1, norm2);
  }

  /**
   * L5: 上下文相似度计算
   * @private
   * @param {Object} info1 - 任务信息1
   * @param {Object} info2 - 任务信息2
   * @returns {number} 相似度分数
   */
  _calculateContextSimilarity(info1, info2) {
    let score = 0;

    // 相同 sessionId (50%)
    if (info1.sessionId && info2.sessionId && info1.sessionId === info2.sessionId) {
      score += 0.5;
    }

    // 相同 projectId (30%)
    if (info1.projectId && info2.projectId && info1.projectId === info2.projectId) {
      score += 0.3;
    }

    // 相同 userId (20%)
    if (info1.userId && info2.userId && info1.userId === info2.userId) {
      score += 0.2;
    }

    return score;
  }

  /**
   * 生成任务描述的哈希（用于快速比较）
   * @private
   */
  _generateDescriptionHash(description) {
    return crypto.createHash('sha256').update(description).digest('hex').substring(0, 16);
  }

  /**
   * 使用 LLM 判断两个任务是否语义相似
   * @param {string} desc1 - 任务描述 1
   * @param {string} desc2 - 任务描述 2
   * @returns {Promise<number>} 相似度分数 (0-1)
   */
  async _calculateSemanticSimilarity(desc1, desc2) {
    // 如果 LLM 不可用，回退到简单的词重叠计算
    if (!this.llmClient) {
      return this._calculateSimpleSimilarity(desc1, desc2);
    }

    // 检查相似度缓存
    const cacheKey = `${this._generateDescriptionHash(desc1)}_${this._generateDescriptionHash(desc2)}`;
    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey);
    }

    try {
      const prompt = `请判断以下两个任务描述是否语义相似。

任务1: ${desc1}

任务2: ${desc2}

请只返回一个 JSON 格式的数字（0-1之间），表示相似度分数。不要返回其他内容。
0 表示完全不相似，1 表示完全相同或非常相似。

JSON格式: { "similarity": 0.85, "reason": "简要说明判断理由" }`;

      const response = await this.llmClient.chat(prompt, {
        temperature: 0.1,
        maxTokens: 256
      });

      // 解析 LLM 响应
      let similarity = 0.5; // 默认值

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          similarity = parseFloat(parsed.similarity) || 0.5;
        }
      } catch (e) {
        // 尝试从文本中提取数字
        const match = response.match(/0?\.?\d+/);
        if (match) {
          similarity = parseFloat(match[0]);
        }
      }

      // 确保相似度在有效范围内
      similarity = Math.max(0, Math.min(1, similarity));

      // 缓存结果（5分钟）
      this.similarityCache.set(cacheKey, similarity);
      setTimeout(() => this.similarityCache.delete(cacheKey), 300000);

      console.log(`[CACHE] LLM 相似度计算: "${desc1.substring(0, 20)}..." vs "${desc2.substring(0, 20)}..." = ${similarity.toFixed(2)}`);

      return similarity;
    } catch (error) {
      console.warn(`[CACHE] LLM 相似度计算失败: ${error.message}`);
      // 回退到简单方法
      return this._calculateSimpleSimilarity(desc1, desc2);
    }
  }

  /**
   * 简单的词重叠相似度计算（回退方法）
   * @private
   */
  _calculateSimpleSimilarity(desc1, desc2) {
    if (!desc1 || !desc2) return 0;

    // 分词
    const words1 = new Set(desc1.toLowerCase().split(/[\s,，、。.]+/).filter(w => w.length > 1));
    const words2 = new Set(desc2.toLowerCase().split(/[\s,，、。.]+/).filter(w => w.length > 1));

    if (words1.size === 0 || words2.size === 0) return 0;

    // 计算 Jaccard 相似度
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;

    console.log(`[CACHE] 简单相似度计算: "${desc1.substring(0, 20)}..." vs "${desc2.substring(0, 20)}..." = ${similarity.toFixed(2)}`);

    return similarity;
  }

  /**
   * 检查是否存在相似的缓存任务
   * @param {Object} request - 请求对象
   * @param {string} stage - 缓存阶段 ('decomposition', 'complexity', 'model_selection')
   * @returns {Promise<Object|null>} 缓存结果或 null
   */
  async findSimilarCachedTask(request, stage = 'decomposition') {
    if (!this.enabled) {
      return null;
    }

    // 提取当前请求的完整信息
    const currentInfo = this._extractFullTaskInfo(request);
    const currentDesc = currentInfo.description;

    if (!currentDesc || currentDesc.length < 5) {
      return null;
    }

    const currentHash = this._generateDescriptionHash(currentDesc);

    // 遍历已有的缓存键，查找相似的任务
    const allKeys = Array.from(this.cacheKeyMetadata.keys());
    let bestMatch = null;
    let bestScore = 0;

    for (const cacheKey of allKeys) {
      const metadata = this.cacheKeyMetadata.get(cacheKey);

      // 跳过不相关的阶段
      if (!cacheKey.includes(`orch_${stage}`)) {
        continue;
      }

      // 跳过自己
      if (cacheKey.includes(currentHash)) {
        continue;
      }

      // 从元数据构建任务信息
      const cachedInfo = {
        description: metadata?.taskDescription || '',
        type: metadata?.taskType || null,
        deliverables: metadata?.deliverables || [],
        sessionId: metadata?.sessionId || null,
        projectId: metadata?.projectId || null,
        userId: metadata?.userId || null
      };

      // 使用分层相似度计算
      const similarityResult = await this._calculateLayerSimilarity(currentInfo, cachedInfo);

      // 检查是否满足各层的阈值
      const passesThreshold = (
        (similarityResult.layer === 'L1' && similarityResult.weightedScore >= 1.0) ||
        (similarityResult.layer === 'L2' && similarityResult.weightedScore >= 0.68) || // 0.8 * 0.85
        (similarityResult.layer === 'L3' && similarityResult.weightedScore >= 0.36) || // 0.6 * 0.6
        (similarityResult.layer === 'L4' && similarityResult.weightedScore >= 0.25) || // 0.5 * 0.5
        (similarityResult.layer === 'L5' && similarityResult.weightedScore >= 0.09)       // 0.3 * 0.3
      );

      if (passesThreshold && similarityResult.weightedScore > bestScore) {
        bestScore = similarityResult.weightedScore;
        bestMatch = {
          cacheKey,
          metadata,
          similarityResult
        };
      }
    }

    if (bestMatch) {
      console.log(`[CACHE] 找到相似缓存任务: ${bestMatch.cacheKey.substring(0, 30)}..., ` +
        `层级: ${bestMatch.similarityResult.layer}, 分数: ${bestMatch.similarityResult.score.toFixed(2)}, ` +
        `加权分数: ${bestMatch.similarityResult.weightedScore.toFixed(2)}`);

      // 获取缓存结果
      const cachedResult = await this.get(bestMatch.cacheKey);
      if (cachedResult !== null) {
        return {
          ...cachedResult,
          fromCache: true,
          cacheKey: bestMatch.cacheKey,
          similarity: bestMatch.similarityResult.score,
          weightedSimilarity: bestMatch.similarityResult.weightedScore,
          matchedLayer: bestMatch.similarityResult.layer,
          matchedDescription: bestMatch.metadata?.taskDescription,
          isSemanticMatch: bestMatch.similarityResult.layer === 'L2'
        };
      }
    }

    // 记录当前任务描述到索引（用于后续相似度匹配）
    const stagePrefix = stage === 'model_selection' ? 'orch_modelsel' : `orch_${stage}`;
    const newCacheKey = `${stagePrefix}_${currentHash}`;
    this.cacheKeyMetadata.set(newCacheKey, {
      taskDescription: currentDesc,
      taskType: currentInfo.type,
      deliverables: currentInfo.deliverables,
      sessionId: currentInfo.sessionId,
      projectId: currentInfo.projectId,
      userId: currentInfo.userId,
      createdAt: new Date(),
      stage: stage
    });

    return null;
  }

  /**
   * 记录任务描述到索引（用于 LLM 相似度匹配）
   * @param {Object} request - 请求对象
   * @param {string} cacheKey - 缓存键
   * @param {string} stage - 缓存阶段
   */
  indexTaskDescription(request, cacheKey, stage = 'decomposition') {
    const fullInfo = this._extractFullTaskInfo(request);
    if (!fullInfo.description) return;

    this.cacheKeyMetadata.set(cacheKey, {
      taskDescription: fullInfo.description,
      taskType: fullInfo.type,
      deliverables: fullInfo.deliverables,
      sessionId: fullInfo.sessionId,
      projectId: fullInfo.projectId,
      userId: fullInfo.userId,
      createdAt: new Date(),
      stage: stage,
      hash: this._generateDescriptionHash(fullInfo.description)
    });
  }

  /**
   * 获取 LLM 相似度功能状态
   * @returns {Object}
   */
  getSimilarityStatus() {
    return {
      enabled: this.llmConfig.enabled,
      clientInitialized: !!this.llmClient,
      model: this.llmConfig.model,
      threshold: this.llmConfig.similarityThreshold,
      indexedTasks: this.cacheKeyMetadata.size,
      cachedSimilarityChecks: this.similarityCache.size,
      layers: {
        L1: { name: 'exact', weight: 1.0, threshold: 1.0 },
        L2: { name: 'llm', weight: 0.85, threshold: 0.68 },
        L3: { name: 'keyword', weight: 0.6, threshold: 0.36 },
        L4: { name: 'type_deliverable', weight: 0.5, threshold: 0.25 },
        L5: { name: 'context', weight: 0.3, threshold: 0.09 }
      }
    };
  }
}

module.exports = { OrchestratorCacheManager };