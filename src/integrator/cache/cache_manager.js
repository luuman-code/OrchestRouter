/**
 * @fileoverview CacheManager - 缓存管理器
 *
 * 实现文件内容哈希缓存、依赖图缓存和符号提取缓存
 * 支持内存缓存和持久化缓存
 * 提供增量处理功能，仅处理变更的文件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * CacheEntry - 缓存条目
 *
 * @typedef {Object} CacheEntry
 * @property {string} key - 缓存键
 * @property {*} value - 缓存值
 * @property {number} timestamp - 时间戳
 * @property {string} [hash] - 内容哈希
 * @property {number} [ttl] - 过期时间（毫秒）
 */

/**
 * FileHash - 文件哈希
 *
 * @typedef {Object} FileHash
 * @property {string} filePath - 文件路径
 * @property {string} contentHash - 内容哈希
 * @property {number} mtime - 修改时间
 * @property {number} size - 文件大小
 */

/**
 * CacheConfig - 缓存配置
 *
 * @typedef {Object} CacheConfig
 * @property {number} [maxEntries] - 最大缓存条目数
 * @property {number} [ttl] - 默认过期时间（毫秒）
 * @property {boolean} [persistenceEnabled] - 是否启用持久化
 * @property {string} [persistencePath] - 持久化路径
 */

/**
 * 简单的内存缓存实现
 */
class SimpleCache {
  /**
   * 创建简单缓存
   *
   * @param {CacheConfig} [config] - 配置
   */
  constructor(config = {}) {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    /** @type {number} */
    this.maxEntries = config.maxEntries || 1000;
    /** @type {number} */
    this.defaultTTL = config.ttl || 3600000; // 1 小时
  }

  /**
   * 获取缓存
   *
   * @param {string} key - 缓存键
   * @returns {*|null} 缓存值
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 设置缓存
   *
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {Object} [options] - 选项
   * @param {number} [options.ttl] - 过期时间
   * @param {string} [options.hash] - 内容哈希
   */
  set(key, value, options = {}) {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      hash: options.hash,
      ttl: options.ttl || this.defaultTTL
    });
  }

  /**
   * 删除缓存
   *
   * @param {string} key - 缓存键
   * @returns {boolean} 是否删除成功
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 检查缓存是否存在
   *
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   *
   * @returns {number} 缓存大小
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 获取所有缓存键
   *
   * @returns {string[]} 缓存键列表
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存统计
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const entry of this.cache.values()) {
      if (entry.ttl && now > entry.timestamp + entry.ttl) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      maxEntries: this.maxEntries
    };
  }
}

/**
 * 持久化依赖图缓存
 */
class PersistentDependencyGraphCache {
  /**
   * 创建持久化缓存
   *
   * @param {string} [cachePath] - 缓存路径
   */
  constructor(cachePath = './.cache/dependency_graph.json') {
    /** @type {string} */
    this.cachePath = cachePath;
    /** @type {Object} */
    this.data = {
      version: '1.0',
      timestamp: Date.now(),
      graphs: {}
    };

    // 确保缓存目录存在
    this.ensureCacheDirectory();
    // 加载现有缓存
    this.load();
  }

  /**
   * 确保缓存目录存在
   *
   * @private
   */
  ensureCacheDirectory() {
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载缓存
   *
   * @private
   */
  load() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const content = fs.readFileSync(this.cachePath, 'utf8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      console.warn(`加载依赖图缓存失败：${error.message}`);
      this.data = { version: '1.0', timestamp: Date.now(), graphs: {} };
    }
  }

  /**
   * 保存缓存
   *
   * @private
   */
  save() {
    try {
      this.data.timestamp = Date.now();
      fs.writeFileSync(this.cachePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.warn(`保存依赖图缓存失败：${error.message}`);
    }
  }

  /**
   * 获取依赖图
   *
   * @param {string} projectId - 项目 ID
   * @returns {Object|null} 依赖图
   */
  get(projectId) {
    return this.data.graphs[projectId] || null;
  }

  /**
   * 设置依赖图
   *
   * @param {string} projectId - 项目 ID
   * @param {Object} graph - 依赖图
   */
  set(projectId, graph) {
    this.data.graphs[projectId] = {
      graph,
      timestamp: Date.now()
    };
    this.save();
  }

  /**
   * 删除依赖图
   *
   * @param {string} projectId - 项目 ID
   * @returns {boolean} 是否删除成功
   */
  delete(projectId) {
    if (this.data.graphs[projectId]) {
      delete this.data.graphs[projectId];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 清空缓存
   */
  clear() {
    this.data.graphs = {};
    this.save();
  }

  /**
   * 清理过期缓存（超过 7 天）
   *
   * @param {number} [maxAge=604800000] - 最大年龄（毫秒）
   */
  cleanup(maxAge = 604800000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [projectId, data] of Object.entries(this.data.graphs)) {
      if (now - data.timestamp > maxAge) {
        delete this.data.graphs[projectId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.save();
      console.log(`清理了 ${cleaned} 个过期依赖图缓存`);
    }
  }
}

/**
 * 符号提取缓存
 */
class SymbolExtractionCache {
  /**
   * 创建符号提取缓存
   *
   * @param {CacheConfig} [config] - 配置
   */
  constructor(config = {}) {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    /** @type {Map<string, FileHash>} */
    this.fileHashes = new Map();
    /** @type {number} */
    this.maxEntries = config.maxEntries || 500;
  }

  /**
   * 计算文件哈希
   *
   * @param {string} content - 文件内容
   * @returns {string} 文件哈希
   */
  computeHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 检查文件是否变更
   *
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {boolean} 是否变更
   */
  hasFileChanged(filePath, content) {
    const currentHash = this.computeHash(content);
    const cachedHash = this.fileHashes.get(filePath);

    if (!cachedHash) return true;
    return cachedHash.contentHash !== currentHash;
  }

  /**
   * 获取符号
   *
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Object|null} 符号信息
   */
  get(filePath, content) {
    // 检查文件是否变更
    if (this.hasFileChanged(filePath, content)) {
      return null;
    }

    const hash = this.computeHash(content);
    const entry = this.cache.get(`${filePath}:${hash}`);

    if (!entry) return null;

    // 检查是否过期
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(`${filePath}:${hash}`);
      return null;
    }

    return entry.value;
  }

  /**
   * 设置符号
   *
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {Object} symbols - 符号信息
   * @param {Object} [options] - 选项
   * @param {number} [options.ttl] - 过期时间
   */
  set(filePath, content, symbols, options = {}) {
    const hash = this.computeHash(content);

    // 更新文件哈希
    this.fileHashes.set(filePath, {
      filePath,
      contentHash: hash,
      mtime: Date.now(),
      size: content.length
    });

    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(`${filePath}:${hash}`, {
      key: `${filePath}:${hash}`,
      value: symbols,
      timestamp: Date.now(),
      hash,
      ttl: options.ttl || 3600000
    });
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.fileHashes.clear();
  }

  /**
   * 获取缓存统计
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      symbolsCacheSize: this.cache.size,
      fileHashesSize: this.fileHashes.size,
      maxEntries: this.maxEntries
    };
  }
}

/**
 * CacheManager - 缓存管理器
 *
 * 统一管理所有缓存
 */
class CacheManager {
  /**
   * 创建缓存管理器
   *
   * @param {CacheConfig} [config] - 配置
   */
  constructor(config = {}) {
    /** @type {CacheConfig} */
    this.config = {
      persistenceEnabled: config.persistenceEnabled !== false,
      persistencePath: config.persistencePath || './.cache/integrator.json',
      ...config
    };

    /** @type {SimpleCache} */
    this.generalCache = new SimpleCache(config);

    /** @type {PersistentDependencyGraphCache} */
    this.dependencyGraphCache = new PersistentDependencyGraphCache(
      config.persistencePath ? path.join(path.dirname(config.persistencePath), 'dependency_graph.json') : undefined
    );

    /** @type {SymbolExtractionCache} */
    this.symbolCache = new SymbolExtractionCache(config);

    /** @type {Map<string, FileHash>} */
    this.fileHashTracker = new Map();
  }

  /**
   * 跟踪文件路径变更
   *
   * @param {string} oldPath - 旧路径
   * @param {string} newPath - 新路径
   */
  trackPathChange(oldPath, newPath) {
    const hash = this.fileHashTracker.get(oldPath);
    if (hash) {
      this.fileHashTracker.set(newPath, hash);
      this.fileHashTracker.delete(oldPath);
      // 同时更新符号缓存中的文件哈希
      this.symbolCache.fileHashes.set(newPath, { ...hash, filePath: newPath });
    }
  }

  /**
   * 检测文件删除
   *
   * @param {string[]} currentFiles - 当前文件列表
   * @returns {string[]} 已删除的文件列表
   */
  detectDeletedFiles(currentFiles) {
    const deletedFiles = [];

    for (const [cachedPath] of this.fileHashTracker.entries()) {
      if (!currentFiles.includes(cachedPath)) {
        deletedFiles.push(cachedPath);
        this.fileHashTracker.delete(cachedPath);
        this.symbolCache.fileHashes.delete(cachedPath);
      }
    }

    return deletedFiles;
  }

  /**
   * 增量处理 - 仅处理变更的文件
   *
   * @param {Map<string, Object>} files - 文件列表
   * @param {Function} processor - 处理函数
   * @returns {Promise<Object>} 处理结果
   */
  async processIncremental(files, processor) {
    const results = new Map();
    const changedFiles = [];
    const unchangedFiles = [];

    // 检测变更
    for (const [filePath, file] of files.entries()) {
      const content = file.content;
      const currentHash = this.computeFileHash(content);

      if (this.fileHashTracker.has(filePath)) {
        const cachedHash = this.fileHashTracker.get(filePath).contentHash;
        if (cachedHash === currentHash) {
          unchangedFiles.push(filePath);
          continue;
        }
      }

      changedFiles.push(filePath);
    }

    console.log(`增量处理：${changedFiles.length} 个文件变更，${unchangedFiles.length} 个文件未变更`);

    // 处理变更的文件
    for (const filePath of changedFiles) {
      const file = files.get(filePath);
      const result = await processor(file);
      results.set(filePath, result);

      // 更新哈希跟踪
      this.fileHashTracker.set(filePath, {
        filePath,
        contentHash: this.computeFileHash(file.content),
        mtime: Date.now(),
        size: file.content.length
      });
    }

    // 检测并处理删除的文件
    const currentFiles = Array.from(files.keys());
    const deletedFiles = this.detectDeletedFiles(currentFiles);
    if (deletedFiles.length > 0) {
      console.log(`检测到 ${deletedFiles.length} 个文件已删除`);
    }

    return {
      results,
      changedFiles,
      unchangedFiles,
      deletedFiles
    };
  }

  /**
   * 计算文件哈希
   *
   * @private
   * @param {string} content - 文件内容
   * @returns {string} 文件哈希
   */
  computeFileHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 获取缓存统计
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      generalCache: this.generalCache.getStats(),
      dependencyGraphCache: {
        graphsCount: Object.keys(this.dependencyGraphCache.data.graphs).length
      },
      symbolCache: this.symbolCache.getStats(),
      fileHashTrackerSize: this.fileHashTracker.size
    };
  }

  /**
   * 清空所有缓存
   */
  clearAll() {
    this.generalCache.clear();
    this.dependencyGraphCache.clear();
    this.symbolCache.clear();
    this.fileHashTracker.clear();
    console.log('所有缓存已清空');
  }

  /**
   * 清理过期缓存
   *
   * @param {Object} [options] - 选项
   * @param {number} [options.maxAge] - 最大年龄（毫秒）
   */
  cleanup(options = {}) {
    this.dependencyGraphCache.cleanup(options.maxAge || 604800000);
    console.log('缓存清理完成');
  }
}

module.exports = {
  CacheManager,
  SimpleCache,
  PersistentDependencyGraphCache,
  SymbolExtractionCache
};
