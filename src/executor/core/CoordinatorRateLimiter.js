const { RateLimiter } = require('./RateLimiter');

/**
 * 增强的协调限流器 - 支持不同类型请求的限流
 *
 * 【改进 2026-03-28】
 * - 用户请求和健康检查使用独立的限流器
 * - 健康检查使用更低的配额配置，不影响正常服务
 * - 请求类型感知：'user'（用户请求）或 'health'（健康检查）
 */
class CoordinatorRateLimiter {
  constructor(config, healthCheckInterval = 60000) {
    this.userLimiters = new Map();    // 用户请求限流器
    this.healthLimiters = new Map();  // 健康检查限流器
    this.config = config;
    this.healthCheckInterval = healthCheckInterval;
    this.lastHealthCheck = new Map(); // 记录上次健康检查时间
  }

  /**
   * 获取限流许可（支持请求类型）
   * @param {string} modelId - 模型 ID
   * @param {number} tokens - 需要的令牌数
   * @param {string} requestType - 请求类型：'user' 或 'health'
   * @param {number} timeoutMs - 超时时间（毫秒），默认30秒
   */
  async acquireWithCoordination(modelId, tokens = 1, requestType = 'user', timeoutMs = 60000) {
    const startTime = Date.now();

    console.log(`[CoordinatorRateLimiter] 获取限流许可 model=${modelId} tokens=${tokens} type=${requestType} timeout=${timeoutMs}ms`);

    // 避免与健康检查时间冲突（仅用户请求需要）
    if (requestType === 'user') {
      const conflictStart = Date.now();
      await this.avoidHealthCheckConflict(modelId);
      console.log(`[CoordinatorRateLimiter] 健康检查冲突处理耗时 ${Date.now() - conflictStart}ms`);
    }

    // 根据请求类型选择不同限流器
    const limiter = this.getOrCreateLimiter(modelId, requestType);

    try {
      // 【修复】传递超时参数
      const result = await limiter.acquireWithWait(tokens, timeoutMs);
      console.log(`[CoordinatorRateLimiter] 限流许可获取成功 model=${modelId} totalTime=${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      console.error(`[CoordinatorRateLimiter] 限流许可获取失败 model=${modelId} error=${error.message}`);
      throw error;
    }
  }

  /**
   * 避免与健康检查时间冲突（带超时保护）
   * @param {string} modelId - 模型 ID
   * @param {number} maxWaitMs - 最大等待时间（毫秒）
   */
  async avoidHealthCheckConflict(modelId, maxWaitMs = 5000) {
    const now = Date.now();
    const lastCheck = this.lastHealthCheck.get(modelId) || 0;

    // 如果距离上次健康检查太近，稍微延迟一下
    const minInterval = this.healthCheckInterval * 0.1; // 保留 10% 间隔
    const remaining = minInterval - (now - lastCheck);

    if (remaining > 0) {
      const waitTime = Math.min(remaining, maxWaitMs);
      console.log(`[CoordinatorRateLimiter] 等待健康检查间隔 model=${modelId} waitTime=${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * 获取或创建限流器（支持请求类型）
   */
  getOrCreateLimiter(modelId, requestType) {
    let limitersMap;
    let limits;

    if (requestType === 'health') {
      // 健康检查使用独立的限流器
      limitersMap = this.healthLimiters;
      limits = this.config.getHealthCheckLimitsForModel(modelId);
    } else {
      // 用户请求使用标准限流器
      limitersMap = this.userLimiters;
      limits = this.config.getLimitsForModel(modelId);
    }

    if (!limitersMap.has(modelId)) {
      limitersMap.set(modelId, new RateLimiter(
        limits.requestsPerSecond,
        limits.burstCapacity,
        modelId,
        requestType
      ));
    }
    return limitersMap.get(modelId);
  }

  recordHealthCheck(modelId) {
    this.lastHealthCheck.set(modelId, Date.now());
  }

  /**
   * 【新增】获取限流器状态（用于监控）
   */
  getLimiterStatus(modelId) {
    const userLimiter = this.userLimiters.get(modelId);
    const healthLimiter = this.healthLimiters.get(modelId);

    return {
      user: userLimiter ? userLimiter.getTokenStatus() : null,
      health: healthLimiter ? healthLimiter.getTokenStatus() : null
    };
  }

  /**
   * 【配置系统集成】更新配置
   * @param {Object} newConfig - 新配置对象
   */
  updateConfig(newConfig) {
    if (newConfig) {
      this.config = newConfig;
    }

    // 重建所有已存在的限流器以应用新配置
    // 注意：这会影响后续请求，不影响正在等待的请求
    this.userLimiters.clear();
    this.healthLimiters.clear();

    console.log('[CoordinatorRateLimiter] 配置已更新，限流器已重置');
  }
}

module.exports = { CoordinatorRateLimiter };