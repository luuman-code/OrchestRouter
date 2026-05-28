/**
 * AdvancedModelStatusMonitor - 高级模型状态监控与降级层
 *
 * 功能块 E：状态监控与降级层（高级版）
 * 负责监控模型API状态，处理错误降级和重试机制，支持分布式锁和错峰执行
 */
const EventEmitter = require('events');
const crypto = require('crypto');

class AdvancedModelStatusMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.models = new Map(); // 存储模型状态
    this.healthCheckIntervals = new Map(); // 存储健康检查定时器
    this.statusHistory = new Map(); // 存储历史状态用于降级决策

    // 配置选项
    this.errorRateThreshold = options.errorRateThreshold || 0.3; // 错误率阈值
    this.latencyThresholdMs = options.latencyThresholdMs || 300000; // 5分钟延迟阈值
    this.rateLimitThreshold = options.rateLimitThreshold || 10; // 限流阈值
    this.checkInterval = options.checkInterval || 60000; // 默认检查间隔
    this.enableRateLimitProtection = options.enableRateLimitProtection !== false; // 是否启用限流保护

    // 分布式锁相关配置
    this.distributedLock = options.distributedLock || null; // 分布式锁实例
    this.instanceId = options.instanceId || this.generateInstanceId();
    this.lockTimeout = options.lockTimeout || 30000; // 锁超时时间（30秒）

    // 错峰健康检查配置
    this.healthCheckOffset = options.healthCheckOffset || 0; // 健康检查偏移量
    this.maxHealthCheckDelay = options.maxHealthCheckDelay || 5000; // 最大健康检查延迟
    this.isChecking = new Map(); // 正在进行健康检查的模型
    this.checkTimestamps = new Map(); // 记录上次检查时间

    // 请求队列和限流控制器
    this.requestQueue = [];
    this.activeRequests = 0;
    this.maxConcurrentRequests = options.maxConcurrentRequests || 5;
    this.requestDelay = options.requestDelay || 100; // 请求间隔

    // 速率限制配置
    this.rateLimitConfig = {
      globalMaxRequests: options.globalMaxRequests || 100, // 全局最大请求/分钟
      globalCurrentRequests: 0,
      globalLastReset: Date.now(),
      providerLimits: options.providerLimits || { // 每提供商限制
        openai: 60,      // OpenAI默认60次/分钟
        anthropic: 40,   // Anthropic默认40次/分钟
        google: 60,      // Google默认60次/分钟
        azure: 50        // Azure默认50次/分钟
      },
      providerCounters: {} // 记录提供商请求计数
    };

    console.log(`[AdvancedModelStatusMonitor] 初始化完成，实例ID: ${this.instanceId}`);
  }

  /**
   * 生成唯一的实例ID
   */
  generateInstanceId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * 设置分布式锁
   */
  setDistributedLock(lockInstance) {
    this.distributedLock = lockInstance;
  }

  /**
   * 使用分布式锁执行健康检查
   */
  async acquireHealthCheckLock(modelId, timeout = null) {
    if (!this.distributedLock) {
      // 如果没有分布式锁，使用本地检查标志和时间窗口
      const checkKey = `${modelId}_checking`;
      const timeWindow = 30000; // 30秒时间窗口
      const currentTime = Date.now();

      // 检查是否在时间窗口内已有检查
      const lastCheck = this.checkTimestamps.get(modelId);
      if (lastCheck && (currentTime - lastCheck) < timeWindow) {
        return false; // 时间窗口内已有检查
      }

      // 检查本地是否正在进行检查
      if (this.isChecking.has(checkKey)) {
        return false; // 正在检查中
      }

      this.isChecking.set(checkKey, true);
      this.checkTimestamps.set(modelId, currentTime);

      // 设置短暂的本地锁（防止同一实例内并发检查）
      setTimeout(() => {
        this.isChecking.delete(checkKey);
      }, 5000); // 5秒后释放本地锁

      return true;
    }

    // 使用分布式锁
    try {
      const effectiveTimeout = timeout || this.lockTimeout;
      const lockKey = `health_check_lock:${modelId}`;
      const lockValue = `${this.instanceId}:${Date.now()}`;

      const acquired = await this.distributedLock.acquire(lockKey, lockValue, effectiveTimeout);
      if (acquired) {
        // 设置锁的清理定时器
        setTimeout(async () => {
          try {
            await this.distributedLock.release(lockKey, lockValue);
          } catch (error) {
            console.warn(`[AdvancedModelStatusMonitor] 释放健康检查锁失败:`, error.message);
          }
        }, effectiveTimeout - 1000); // 提前1秒释放

        return true;
      }
      return false;
    } catch (error) {
      console.warn(`[AdvancedModelStatusMonitor] 获取健康检查锁失败:`, error.message);
      return false;
    }
  }

  /**
   * 检查是否达到全局速率限制
   */
  isGlobalRateLimited() {
    const now = Date.now();
    const oneMinute = 60000;

    // 重置计数器（每分钟）
    if (now - this.rateLimitConfig.globalLastReset > oneMinute) {
      this.rateLimitConfig.globalCurrentRequests = 0;
      this.rateLimitConfig.globalLastReset = now;

      // 重置提供商计数器
      for (const provider in this.rateLimitConfig.providerCounters) {
        this.rateLimitConfig.providerCounters[provider] = 0;
      }
    }

    return this.rateLimitConfig.globalCurrentRequests >= this.rateLimitConfig.globalMaxRequests;
  }

  /**
   * 检查特定提供商是否达到速率限制
   */
  isProviderRateLimited(provider) {
    if (!this.rateLimitConfig.providerLimits[provider]) {
      return false; // 如果没有限制配置，则不限制
    }

    const providerLimit = this.rateLimitConfig.providerLimits[provider];
    const currentCount = this.rateLimitConfig.providerCounters[provider] || 0;

    return currentCount >= providerLimit;
  }

  /**
   * 记录一次健康检查请求
   */
  recordHealthCheckRequest(provider) {
    this.rateLimitConfig.globalCurrentRequests++;

    if (!this.rateLimitConfig.providerCounters[provider]) {
      this.rateLimitConfig.providerCounters[provider] = 0;
    }
    this.rateLimitConfig.providerCounters[provider]++;
  }

  /**
   * 注册模型
   */
  registerModel(modelId, healthCheckConfig = {}) {
    const defaultConfig = {
      healthCheckEndpoint: null,
      healthCheckHeaders: {},
      healthCheckPayload: { ping: true },
      healthCheckTimeout: 5000,
      healthCheckInterval: this.checkInterval,
      // 错峰执行相关
      healthCheckJitter: Math.random() * this.maxHealthCheckDelay, // 随机抖动
      healthCheckDelay: Math.random() * this.maxHealthCheckDelay, // 随机延迟
      lastChecked: 0,
      provider: 'default' // 默认提供商
    };

    const config = { ...defaultConfig, ...healthCheckConfig };

    this.models.set(modelId, {
      id: modelId,
      status: 'unknown', // unknown, available, degraded, unavailable
      lastCheck: null,
      errorRate: 0,
      avgLatency: 0,
      remainingQuota: null,
      consecutiveErrors: 0,
      config: config,
      errorHistory: [],
      latencyHistory: [],
      provider: config.provider
    });

    // 启动健康检查定时器，应用错峰策略
    this.startHealthCheckInterval(modelId, config);

    console.log(`[AdvancedModelStatusMonitor] 已注册模型: ${modelId}, 提供商: ${config.provider}, 健康检查间隔: ${config.healthCheckInterval}ms, 抖动: ${config.healthCheckJitter}ms`);
  }

  /**
   * 启动健康检查定时器（应用错峰策略）
   */
  startHealthCheckInterval(modelId, config) {
    // 清除现有定时器
    if (this.healthCheckIntervals.has(modelId)) {
      clearInterval(this.healthCheckIntervals.get(modelId));
    }

    // 计算错峰时间
    const effectiveInterval = config.healthCheckInterval + config.healthCheckJitter;
    const checkFunction = async () => {
      // 检查全局和提供商速率限制
      if (this.isGlobalRateLimited() || this.isProviderRateLimited(config.provider)) {
        console.log(`[AdvancedModelStatusMonitor] 模型 ${modelId} 跳过健康检查 - 达到速率限制`);
        return;
      }

      await this.performHealthCheck(modelId);
    };

    // 错峰执行：随机延迟启动
    const initialDelay = config.healthCheckDelay || (Math.random() * this.maxHealthCheckDelay);
    setTimeout(() => {
      // 立即执行一次检查
      checkFunction();

      // 然后定期执行
      const intervalId = setInterval(checkFunction, effectiveInterval);
      this.healthCheckIntervals.set(modelId, intervalId);
    }, initialDelay);

    console.log(`[AdvancedModelStatusMonitor] 为模型 ${modelId} 启动错峰健康检查，初始延迟: ${initialDelay}ms`);
  }

  /**
   * 执行健康检查（带分布式锁保护和速率限制）
   */
  async performHealthCheck(modelId) {
    const modelState = this.models.get(modelId);
    if (!modelState) {
      console.warn(`[AdvancedModelStatusMonitor] 未找到模型: ${modelId}`);
      return;
    }

    // 尝试获取分布式锁
    const lockAcquired = await this.acquireHealthCheckLock(modelId);
    if (!lockAcquired) {
      console.log(`[AdvancedModelStatusMonitor] 模型 ${modelId} 健康检查被跳过（已被其他实例或本地锁定）`);
      return;
    }

    // 检查速率限制
    if (this.isGlobalRateLimited() || this.isProviderRateLimited(modelState.provider)) {
      console.log(`[AdvancedModelStatusMonitor] 模型 ${modelId} 跳过健康检查 - 达到速率限制`);
      return;
    }

    // 记录请求
    this.recordHealthCheckRequest(modelState.provider);

    console.log(`[AdvancedModelStatusMonitor] 开始检查模型 ${modelId} 的健康状态...`);

    const startTime = Date.now();
    let success = false;
    let latency = 0;
    let errorMessage = null;

    try {
      // 检查是否启用了限流保护
      if (this.enableRateLimitProtection) {
        // 限流控制：添加请求到队列
        await this.enqueueRequest();
      }

      // 执行健康检查
      const config = modelState.config;
      if (config.healthCheckEndpoint) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.healthCheckTimeout);

        const response = await fetch(config.healthCheckEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.healthCheckHeaders
          },
          body: JSON.stringify(config.healthCheckPayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        success = response.ok;
        latency = Date.now() - startTime;

        if (!success) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        } else {
          // 解析响应以获取剩余配额等信息
          try {
            const data = await response.json();
            if (data.quota !== undefined) {
              modelState.remainingQuota = data.quota;
            }
          } catch (parseError) {
            // 忽略解析错误
          }
        }
      } else {
        // 如果没有健康检查端点，标记为可用
        success = true;
        latency = 0;
      }
    } catch (error) {
      success = false;
      latency = Date.now() - startTime;
      errorMessage = error.message;
    } finally {
      // 减少活跃请求数
      if (this.enableRateLimitProtection) {
        this.decrementActiveRequests();
      }
    }

    // 更新模型状态
    this.updateModelState(modelId, success, latency, errorMessage);

    // 发出事件
    this.emit('healthCheckCompleted', {
      modelId,
      success,
      latency,
      timestamp: new Date(),
      errorMessage
    });

    console.log(`[AdvancedModelStatusMonitor] 模型 ${modelId} 健康检查完成: ${success ? 'OK' : 'ERROR'}, Latency: ${latency}ms`);
  }

  /**
   * 将请求加入队列（限流控制）
   */
  async enqueueRequest() {
    return new Promise((resolve) => {
      const request = { resolve };
      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  /**
   * 处理请求队列
   */
  async processQueue() {
    while (this.activeRequests < this.maxConcurrentRequests && this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      this.activeRequests++;

      // 添加延迟以避免突发请求
      setTimeout(() => {
        request.resolve();
      }, this.requestDelay);
    }
  }

  /**
   * 减少活跃请求数
   */
  decrementActiveRequests() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    // 处理队列中的下一个请求
    setImmediate(() => this.processQueue());
  }

  /**
   * 更新模型状态
   */
  updateModelState(modelId, success, latency, errorMessage) {
    const modelState = this.models.get(modelId);
    if (!modelState) return;

    const now = new Date();
    modelState.lastCheck = now;

    // 更新延迟历史
    modelState.latencyHistory.push({ timestamp: now, latency });
    if (modelState.latencyHistory.length > 10) {
      modelState.latencyHistory.shift();
    }

    // 计算平均延迟
    const recentLatencies = modelState.latencyHistory.slice(-5);
    if (recentLatencies.length > 0) {
      const totalLatency = recentLatencies.reduce((sum, entry) => sum + entry.latency, 0);
      modelState.avgLatency = totalLatency / recentLatencies.length;
    }

    if (success) {
      // 成功：重置错误计数
      modelState.consecutiveErrors = 0;
      modelState.errorHistory.push({ timestamp: now, success: true });

      // 确定状态
      if (modelState.avgLatency > this.latencyThresholdMs) {
        modelState.status = 'degraded';
      } else {
        modelState.status = 'available';
      }
    } else {
      // 失败：增加错误计数
      modelState.consecutiveErrors++;
      modelState.errorHistory.push({
        timestamp: now,
        success: false,
        error: errorMessage
      });

      // 计算错误率
      const recentErrors = modelState.errorHistory.slice(-20); // 最近20次检查
      const failedChecks = recentErrors.filter(e => !e.success).length;
      modelState.errorRate = failedChecks / recentErrors.length;

      // 根据错误率和连续错误数确定状态
      if (modelState.errorRate > this.errorRateThreshold || modelState.consecutiveErrors > 5) {
        modelState.status = 'unavailable';
      } else if (modelState.consecutiveErrors > 2) {
        modelState.status = 'degraded';
      }
    }

    // 限制历史记录大小
    if (modelState.errorHistory.length > 50) {
      modelState.errorHistory = modelState.errorHistory.slice(-50);
    }
  }

  /**
   * 检查模型是否可用
   */
  isModelUsable(modelId, thresholds = {}) {
    const modelState = this.models.get(modelId);
    if (!modelState) {
      return { usable: false, reason: 'Model not registered' };
    }

    const errorThreshold = thresholds.errorRateThreshold || this.errorRateThreshold;
    const latencyThreshold = thresholds.latencyThresholdMs || this.latencyThresholdMs;
    const rateLimitThreshold = thresholds.rateLimitThreshold || this.rateLimitThreshold;

    // 检查状态
    if (modelState.status === 'unavailable') {
      return { usable: false, reason: 'Model is unavailable' };
    }

    // 检查错误率
    if (modelState.errorRate > errorThreshold) {
      return { usable: false, reason: `High error rate: ${(modelState.errorRate * 100).toFixed(1)}%` };
    }

    // 检查延迟
    if (modelState.avgLatency > latencyThreshold) {
      return { usable: false, reason: `High latency: ${modelState.avgLatency}ms` };
    }

    // 检查剩余配额
    if (modelState.remainingQuota !== null && modelState.remainingQuota < rateLimitThreshold) {
      return { usable: false, reason: `Low quota: ${modelState.remainingQuota} remaining` };
    }

    return { usable: true, reason: 'Model is healthy' };
  }

  /**
   * 记录请求结果（用于性能跟踪）
   */
  recordRequest(modelId, success, latencyMs = 0) {
    const modelState = this.models.get(modelId);
    if (!modelState) {
      console.warn(`[AdvancedModelStatusMonitor] 未找到模型: ${modelId}`);
      return;
    }

    const now = new Date();

    if (success) {
      // 请求成功
      modelState.consecutiveErrors = 0;
      modelState.errorHistory.push({ timestamp: now, success: true });
    } else {
      // 请求失败
      modelState.consecutiveErrors++;
      modelState.errorHistory.push({ timestamp: now, success: false });
    }

    // 更新延迟
    if (latencyMs > 0) {
      modelState.latencyHistory.push({ timestamp: now, latency: latencyMs });
      if (modelState.latencyHistory.length > 10) {
        modelState.latencyHistory.shift();
      }

      // 重新计算平均延迟
      const recentLatencies = modelState.latencyHistory.slice(-5);
      if (recentLatencies.length > 0) {
        const totalLatency = recentLatencies.reduce((sum, entry) => sum + entry.latency, 0);
        modelState.avgLatency = totalLatency / recentLatencies.length;
      }
    }

    // 重新计算错误率
    const recentErrors = modelState.errorHistory.slice(-20);
    const failedChecks = recentErrors.filter(e => !e.success).length;
    modelState.errorRate = failedChecks / recentErrors.length;

    // 根据最新数据更新状态
    if (modelState.status === 'available') {
      if (modelState.errorRate > this.errorRateThreshold || modelState.consecutiveErrors > 5) {
        modelState.status = 'unavailable';
        this.emit('statusChange', { modelId, oldStatus: 'available', newStatus: 'unavailable' });
      } else if (modelState.avgLatency > this.latencyThresholdMs || modelState.consecutiveErrors > 2) {
        modelState.status = 'degraded';
        this.emit('statusChange', { modelId, oldStatus: 'available', newStatus: 'degraded' });
      }
    } else if (modelState.status === 'degraded') {
      if (modelState.errorRate > this.errorRateThreshold || modelState.consecutiveErrors > 5) {
        modelState.status = 'unavailable';
        this.emit('statusChange', { modelId, oldStatus: 'degraded', newStatus: 'unavailable' });
      } else if (modelState.errorRate < 0.1 && modelState.consecutiveErrors === 0) {
        modelState.status = 'available';
        this.emit('statusChange', { modelId, oldStatus: 'degraded', newStatus: 'available' });
      }
    } else if (modelState.status === 'unavailable') {
      if (modelState.errorRate < 0.2 && modelState.consecutiveErrors < 3) {
        modelState.status = 'degraded';
        this.emit('statusChange', { modelId, oldStatus: 'unavailable', newStatus: 'degraded' });
      } else if (modelState.errorRate < 0.1 && modelState.consecutiveErrors === 0) {
        modelState.status = 'available';
        this.emit('statusChange', { modelId, oldStatus: 'unavailable', newStatus: 'available' });
      }
    }
  }

  /**
   * 获取模型状态
   */
  getModelStatus(modelId) {
    const modelState = this.models.get(modelId);
    if (!modelState) {
      return null;
    }

    return {
      id: modelState.id,
      status: modelState.status,
      lastCheck: modelState.lastCheck,
      errorRate: modelState.errorRate,
      avgLatency: modelState.avgLatency,
      remainingQuota: modelState.remainingQuota,
      consecutiveErrors: modelState.consecutiveErrors,
      config: modelState.config,
      provider: modelState.provider
    };
  }

  /**
   * 更新模型状态
   */
  updateStatus(modelId, statusUpdate) {
    const modelState = this.models.get(modelId);
    if (!modelState) {
      console.warn(`[AdvancedModelStatusMonitor] 未找到模型: ${modelId}`);
      return false;
    }

    const oldStatus = modelState.status;

    if (statusUpdate.status !== undefined) {
      modelState.status = statusUpdate.status;
    }

    if (statusUpdate.errorRate !== undefined) {
      modelState.errorRate = statusUpdate.errorRate;
    }

    if (statusUpdate.avgLatency !== undefined) {
      modelState.avgLatency = statusUpdate.avgLatency;
    }

    if (statusUpdate.remainingQuota !== undefined) {
      modelState.remainingQuota = statusUpdate.remainingQuota;
    }

    if (statusUpdate.consecutiveErrors !== undefined) {
      modelState.consecutiveErrors = statusUpdate.consecutiveErrors;
    }

    // 如果状态发生变化，发出事件
    if (oldStatus !== modelState.status) {
      this.emit('statusChange', {
        modelId,
        oldStatus,
        newStatus: modelState.status
      });
    }

    return true;
  }

  /**
   * 获取所有模型状态
   */
  getAllModelStatus() {
    const statuses = {};
    for (const [modelId, modelState] of this.models.entries()) {
      statuses[modelId] = this.getModelStatus(modelId);
    }
    return statuses;
  }

  /**
   * 导出监控报告
   */
  exportReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalModels: this.models.size,
      statusDistribution: {
        available: 0,
        degraded: 0,
        unavailable: 0,
        unknown: 0
      },
      rateLimitInfo: {
        globalCurrentRequests: this.rateLimitConfig.globalCurrentRequests,
        globalMaxRequests: this.rateLimitConfig.globalMaxRequests,
        globalRemaining: this.rateLimitConfig.globalMaxRequests - this.rateLimitConfig.globalCurrentRequests,
        providerLimits: this.rateLimitConfig.providerLimits,
        providerCounts: this.rateLimitConfig.providerCounters
      },
      modelDetails: {}
    };

    for (const [modelId, modelState] of this.models.entries()) {
      const statusCount = report.statusDistribution[modelState.status] || 0;
      report.statusDistribution[modelState.status] = statusCount + 1;

      report.modelDetails[modelId] = {
        status: modelState.status,
        provider: modelState.provider,
        lastCheck: modelState.lastCheck,
        errorRate: modelState.errorRate,
        avgLatency: modelState.avgLatency,
        consecutiveErrors: modelState.consecutiveErrors,
        remainingQuota: modelState.remainingQuota
      };
    }

    return report;
  }

  /**
   * 清理资源
   */
  destroy() {
    // 清除所有健康检查定时器
    for (const intervalId of this.healthCheckIntervals.values()) {
      clearInterval(intervalId);
    }
    this.healthCheckIntervals.clear();

    console.log('[AdvancedModelStatusMonitor] 已清理所有资源');
  }

  /**
   * 获取速率限制统计
   */
  getRateLimitStats() {
    return {
      globalRequests: this.rateLimitConfig.globalCurrentRequests,
      globalMax: this.rateLimitConfig.globalMaxRequests,
      globalRemaining: this.rateLimitConfig.globalMaxRequests - this.rateLimitConfig.globalCurrentRequests,
      providerUsage: { ...this.rateLimitConfig.providerCounters },
      providerLimits: { ...this.rateLimitConfig.providerLimits }
    };
  }
}

module.exports = AdvancedModelStatusMonitor;