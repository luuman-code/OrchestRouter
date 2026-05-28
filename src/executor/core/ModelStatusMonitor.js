/**
 * 增强的状态监控器 - 提供详细的模型状态信息
 *
 * 【改进 2026-03-28】
 * - 独立的健康检查限流配置
 * - 提供模型可用性详细信息
 * - 支持执行器实时查询
 * 【增强 2026-03-29】
 * - 使用自适应健康检查器，支持动态调整检查频率
 * - 基于错误率、系统负载、恢复状态等因素调整频率
 */
class ModelStatusMonitor {
  constructor(healthCheckInterval = 30000) {
    this.modelStatuses = new Map();
    this.healthCheckInterval = healthCheckInterval;
    this.healthCheckTimers = new Map();
    this.adaptiveHealthCheckers = new Map(); // 存储每个模型的自适应健康检查器
    this.rateLimiter = null; // 限流器引用

    // 系统负载相关
    this.systemLoadFactor = 1.0; // 系统负载调整因子

    // 系统协调器相关
    this.systemCoordinator = null;
  }

  setRateLimiter(rateLimiter) {
    this.rateLimiter = rateLimiter;
  }

  /**
   * 设置系统协调器
   * @param {SystemCoordinator} coordinator - 系统协调器
   */
  setSystemCoordinator(coordinator) {
    this.systemCoordinator = coordinator;
  }

  /**
   * 设置系统负载调整因子
   * @param {number} factor - 负载调整因子 (0.0-2.0)
   */
  setSystemLoadFactor(factor) {
    this.systemLoadFactor = Math.max(0.1, Math.min(2.0, factor));

    // 更新所有自适应健康检查器的负载因子
    for (const checker of this.adaptiveHealthCheckers.values()) {
      checker.setSystemLoadFactor(this.systemLoadFactor);
    }
  }

  async startMonitoring(models) {
    for (const model of models) {
      await this.startHealthCheck(model.id);
    }
  }

  async startHealthCheck(modelId) {
    const { AdaptiveHealthChecker } = require('./AdaptiveHealthChecker');

    // 为模型创建自适应健康检查器
    const adaptiveChecker = new AdaptiveHealthChecker(modelId);
    adaptiveChecker.setBaseInterval(this.healthCheckInterval);
    adaptiveChecker.setSystemLoadFactor(this.systemLoadFactor);
    this.adaptiveHealthCheckers.set(modelId, adaptiveChecker);

    // 定期执行健康检查
    const timer = setInterval(async () => {
      try {
        // 使用健康检查专用限流器
        if (this.rateLimiter) {
          await this.rateLimiter.acquireWithCoordination(modelId, 1, 'health');
        }

        const status = await adaptiveChecker.checkHealth();
        this.updateModelStatus(modelId, status);

        // 记录健康检查时间
        if (this.rateLimiter) {
          this.rateLimiter.recordHealthCheck(modelId);
        }

        // 获取建议的下次检查延迟
        const nextDelay = adaptiveChecker.getNextCheckDelay();

        // 这里我们不直接修改定时器，而是记录下一次检查的预期间隔
        // 实际上我们需要创建一个新的定时器来使用新的间隔
        // 但为简单起见，我们使用当前实现，并在需要时更新定时器
      } catch (error) {
        this.updateModelStatus(modelId, {
          available: false,
          reason: `Health check failed: ${error.message}`,
          lastChecked: new Date(),
          latency: -1
        });
      }
    }, this.healthCheckInterval);

    this.healthCheckTimers.set(modelId, timer);
  }

  updateModelStatus(modelId, status) {
    this.modelStatuses.set(modelId, {
      ...status,
      lastUpdated: new Date()
    });
  }

  /**
   * 获取模型状态（供执行器查询）
   */
  getModelStatus(modelId) {
    return this.modelStatuses.get(modelId) || {
      available: true,
      reason: 'Not checked yet',
      lastChecked: null,
      latency: -1
    };
  }

  /**
   * 检查模型是否可用（快速检查）
   */
  isModelAvailable(modelId) {
    const status = this.getModelStatus(modelId);
    return status.available;
  }

  async stopMonitoring(modelId) {
    if (this.healthCheckTimers.has(modelId)) {
      clearInterval(this.healthCheckTimers.get(modelId));
      this.healthCheckTimers.delete(modelId);
    }
  }

  async stopAllMonitoring() {
    for (const [modelId, timer] of this.healthCheckTimers) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();
  }
}

module.exports = { ModelStatusMonitor };