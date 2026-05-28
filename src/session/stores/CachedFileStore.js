const FileStore = require('./FileStore');
const { LRUCache } = require('lru-cache'); // 需要安装 lru-cache 包

class CachedFileStore extends FileStore {
  constructor(basePath = './session-data', options = {}) {
    // 兼容两种调用方式： basePath 作为第一个参数或 options.basePath
    const opts = typeof basePath === 'string'
      ? { basePath, ...options }
      : basePath;
    super(opts);

    // 内存缓存配置
    this.cache = new LRUCache({
      max: options.cacheMax || 100,           // 最大缓存条目
      ttl: options.cacheTtl || 300000,        // 5分钟过期时间
      allowStale: false,
      updateAgeOnGet: true,
      maxSize: options.cacheMaxSize || 50 * 1024 * 1024, // 50MB最大内存使用
      sizeCalculation: (value) => {
        // 计算缓存项的大小
        return JSON.stringify(value).length;
      }
    });

    // 缓存统计
    this.cacheStats = {
      hits: 0,
      misses: 0,
      hitRate: 0
    };
  }

  async set(sessionId, session) {
    // 先设置到父类（文件存储）
    await super.set(sessionId, session);

    // 同步到缓存
    this.cache.set(sessionId, session);
  }

  async get(sessionId) {
    // 先从缓存获取
    const cached = this.cache.get(sessionId);
    if (cached) {
      this.cacheStats.hits++;
      this.updateHitRate();
      return cached;
    }

    // 缓存未命中，从文件系统获取
    this.cacheStats.misses++;

    const session = await super.get(sessionId);
    if (session) {
      // 存入缓存
      this.cache.set(sessionId, session);
    }

    this.updateHitRate();
    return session;
  }

  async delete(sessionId) {
    // 从缓存中删除
    this.cache.delete(sessionId);

    // 从文件系统删除
    return await super.delete(sessionId);
  }

  updateHitRate() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    this.cacheStats.hitRate = total > 0 ? this.cacheStats.hits / total : 0;
  }

  async getStatistics() {
    const baseStats = await super.getStatistics();
    return {
      ...baseStats,
      cacheStats: this.cacheStats,
      cacheSize: this.cache.size,
      cacheMaxSize: this.cache.max
    };
  }
}

module.exports = CachedFileStore;