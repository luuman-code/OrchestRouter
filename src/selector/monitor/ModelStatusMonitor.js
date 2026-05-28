/**
 * ModelStatusMonitor - 模型状态监控与降级层（已改进版本）
 *
 * 功能块 E：状态监控与降级层
 * 监控模型状态并实施动态降级策略，已添加分布式锁和错峰执行机制
 */
const EventEmitter = require('events');
const crypto = require('crypto');

class ModelStatusMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.statusMap = new Map(); // 存储模型状态
    this.performanceHistory = new Map(); // 性能历史
    this.healthCheckInterval = null; // 健康检查定时器
    this.modelRegistry = null; // 模型注册表引用，用于获取API配置
    this.healthCheckResults = new Map(); // 存储健康检查结果
    this.currentUsage = new Map(); // 当前活跃请求的计数
    this.healthCheckSchedulers = new Map(); // 健康检查调度器映射

    // 分布式锁相关配置（新增）
    this.distributedLock = config.distributedLock || null; // 分布式锁实例
    this.instanceId = config.instanceId || this.generateInstanceId();
    this.lockTimeout = config.lockTimeout || 30000; // 锁超时时间（30秒）
    this.maxHealthCheckDelay = config.maxHealthCheckDelay || 5000; // 最大健康检查延迟
    this.isChecking = new Map(); // 正在进行健康检查的模型
    this.checkTimestamps = new Map(); // 记录上次检查时间

    // 健康检查配置
    this.healthCheckConfig = new HealthCheckConfig(config.healthCheckOptions || {});

    // 智能调度器
    this.smartScheduler = new SmartHealthCheckScheduler(this);

    this.config = {
      errorRateThreshold: config.errorRateThreshold || 0.3,
      latencyThresholdMs: config.latencyThresholdMs || 300000, // 5分钟延迟阈值
      rateLimitThreshold: config.rateLimitThreshold || 10,
      maxHistorySize: config.maxHistorySize || 100,

      // 速率限制配置（新增）
      rateLimitConfig: {
        globalMaxRequests: config.globalMaxRequests || 100, // 全局最大请求/分钟
        globalCurrentRequests: 0,
        globalLastReset: Date.now(),
        providerLimits: config.providerLimits || { // 每提供商限制
          openai: 60,      // OpenAI默认60次/分钟
          anthropic: 40,   // Anthropic默认40次/分钟
          google: 60,      // Google默认60次/分钟
          azure: 50        // Azure默认50次/分钟
        },
        providerCounters: {} // 记录提供商请求计数
      }
    };
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
            console.warn(`[ModelStatusMonitor] 释放健康检查锁失败:`, error.message);
          }
        }, effectiveTimeout - 1000); // 提前1秒释放

        return true;
      }
      return false;
    } catch (error) {
      console.warn(`[ModelStatusMonitor] 获取健康检查锁失败:`, error.message);
      return false;
    }
  }

  /**
   * 检查是否达到全局速率限制（新增）
   */
  isGlobalRateLimited() {
    const now = Date.now();
    const oneMinute = 60000;

    // 重置计数器（每分钟）
    if (now - this.config.rateLimitConfig.globalLastReset > oneMinute) {
      this.config.rateLimitConfig.globalCurrentRequests = 0;
      this.config.rateLimitConfig.globalLastReset = now;

      // 重置提供商计数器
      for (const provider in this.config.rateLimitConfig.providerCounters) {
        this.config.rateLimitConfig.providerCounters[provider] = 0;
      }
    }

    return this.config.rateLimitConfig.globalCurrentRequests >= this.config.rateLimitConfig.globalMaxRequests;
  }

  /**
   * 检查特定提供商是否达到速率限制（新增）
   */
  isProviderRateLimited(provider) {
    if (!this.config.rateLimitConfig.providerLimits[provider]) {
      return false; // 如果没有限制配置，则不限制
    }

    const providerLimit = this.config.rateLimitConfig.providerLimits[provider];
    const currentCount = this.config.rateLimitConfig.providerCounters[provider] || 0;

    return currentCount >= providerLimit;
  }

  /**
   * 记录一次健康检查请求（新增）
   */
  recordHealthCheckRequest(provider) {
    this.config.rateLimitConfig.globalCurrentRequests++;

    if (!this.config.rateLimitConfig.providerCounters[provider]) {
      this.config.rateLimitConfig.providerCounters[provider] = 0;
    }
    this.config.rateLimitConfig.providerCounters[provider]++;
  }

  /**
   * 设置模型注册表引用
   */
  setModelRegistry(modelRegistry) {
    this.modelRegistry = modelRegistry;
  }

  /**
   * 启动主动健康检查任务（支持固定或智能调度）
   */
  startHealthChecks(intervalMs = null, useSmartScheduling = true) { // 默认启用智能调度
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (useSmartScheduling) {
      // 使用智能调度
      this.healthCheckInterval = setInterval(async () => {
        await this.performSmartHealthChecks();
      }, 30000); // 使用固定的检查频率，但每个模型有独立的调度逻辑
    } else {
      // 使用固定间隔调度
      const actualInterval = intervalMs || this.healthCheckConfig.intervalMs;
      this.healthCheckInterval = setInterval(async () => {
        await this.performHealthChecks();
      }, actualInterval);
    }

    console.log(`主动健康检查已启动，智能调度: ${useSmartScheduling}, 间隔: ${intervalMs || this.healthCheckConfig.intervalMs}ms`);
  }

  /**
   * 执行智能健康检查 - 为每个模型使用不同的调度间隔
   */
  async performSmartHealthChecks() {
    console.log('开始执行智能健康检查...');

    const modelIds = Array.from(this.statusMap.keys());
    const healthCheckPromises = modelIds.map(modelId => {
      // 检查全局和提供商速率限制
      const model = this.modelRegistry?.getModel(modelId);
      const provider = model?.provider || 'default';

      if (this.isGlobalRateLimited() || this.isProviderRateLimited(provider)) {
        console.log(`模型 ${modelId} 跳过健康检查 - 达到速率限制`);
        return Promise.resolve(null);
      }

      // 根据模型的稳定性动态决定是否执行健康检查
      const optimalInterval = this.smartScheduler.calculateOptimalInterval(modelId);
      const lastCheck = this.getModelStatus(modelId).lastChecked;

      if (!lastCheck || (Date.now() - new Date(lastCheck).getTime()) >= optimalInterval) {
        return this.performSingleHealthCheck(modelId);
      } else {
        // 模型最近刚检查过，跳过此次检查
        console.log(`模型 ${modelId} 最近已检查，跳过本次健康检查`);
        return Promise.resolve(null);
      }
    });

    const results = await Promise.allSettled(healthCheckPromises);

    // 处理检查结果
    for (let i = 0; i < results.length; i++) {
      const modelId = modelIds[i];
      const result = results[i];

      if (result.status === 'fulfilled' && result.value !== null) {
        const healthData = result.value;
        this.updateStatusFromHealthCheck(modelId, healthData);
      } else if (result.status === 'rejected') {
        console.error(`模型 ${modelId} 健康检查失败:`, result.reason);
        // 更新状态为不可用
        this.updateStatus(modelId, {
          isAvailable: false,
          errorRate: this.getCurrentErrorRate(modelId) + 0.1, // 增加错误率
          lastChecked: new Date(),
          healthCheckFailure: true
        });
      }
    }

    console.log('智能健康检查完成');
  }

  /**
   * 停止主动健康检查任务
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('主动健康检查已停止');
    }
  }

  /**
   * 执行批量健康检查
   */
  async performHealthChecks() {
    console.log('开始执行主动健康检查...');

    const modelIds = Array.from(this.statusMap.keys());
    const healthCheckPromises = modelIds.map(modelId => this.performSingleHealthCheck(modelId));

    const results = await Promise.allSettled(healthCheckPromises);

    // 处理检查结果
    results.forEach((result, index) => {
      const modelId = modelIds[index];
      if (result.status === 'fulfilled') {
        const healthData = result.value;
        this.updateStatusFromHealthCheck(modelId, healthData);
      } else {
        console.error(`模型 ${modelId} 健康检查失败:`, result.reason);
        // 更新状态为不可用
        this.updateStatus(modelId, {
          isAvailable: false,
          errorRate: this.getCurrentErrorRate(modelId) + 0.1, // 增加错误率
          lastChecked: new Date(),
          healthCheckFailure: true
        });
      }
    });

    console.log('主动健康检查完成');
  }

  /**
   * 执行单个模型的健康检查（改进版）
   * 支持多种检查方式以降低对生产API的依赖
   */
  async performSingleHealthCheck(modelId) {
    // 检查是否达到速率限制
    const model = this.modelRegistry?.getModel(modelId);
    const provider = model?.provider || 'default';

    if (this.isGlobalRateLimited() || this.isProviderRateLimited(provider)) {
      console.log(`模型 ${modelId} 跳过健康检查 - 达到速率限制`);
      return null;
    }

    // 记录请求
    this.recordHealthCheckRequest(provider);

    // 尝试获取分布式锁
    const lockAcquired = await this.acquireHealthCheckLock(modelId);
    if (!lockAcquired) {
      console.log(`模型 ${modelId} 健康检查被跳过（已被其他实例或本地锁定）`);
      return null;
    }

    const startTime = Date.now();
    let success = false;
    let latency = 0;
    let error = null;

    try {
      // 获取模型配置
      if (!this.modelRegistry) {
        throw new Error('模型注册表未设置');
      }

      const model = this.modelRegistry.getModel(modelId);
      if (!model) {
        throw new Error(`模型 ${modelId} 不存在`);
      }

      // 根据模型类型和配置选择健康检查方式
      let healthData;
      if (model.type === 'local') {
        // 本地模型健康检查 - 检查进程状态、内存使用等
        healthData = await this.performLocalHealthCheck(model);
      } else {
        // 云端模型健康检查 - 使用配置化的方式
        healthData = await this.performCloudHealthCheck(model);
      }

      latency = Date.now() - startTime;

      // 记录健康检查结果到调度器
      const resultForScheduler = {
        isAvailable: healthData.success,
        currentLatencyMs: latency
      };
      this.smartScheduler.recordCheckResult(modelId, resultForScheduler);

      return {
        isAvailable: healthData.success,
        currentLatencyMs: latency,
        rateLimitRemaining: healthData.rateLimitRemaining || -1,
        lastChecked: new Date(),
        healthCheckSuccess: healthData.success,
        details: healthData.details
      };

    } catch (err) {
      latency = Date.now() - startTime;
      error = err;

      // 记录失败的健康检查结果
      const resultForScheduler = {
        isAvailable: false,
        currentLatencyMs: latency
      };
      this.smartScheduler.recordCheckResult(modelId, resultForScheduler);

      return {
        isAvailable: false,
        currentLatencyMs: latency,
        errorRate: this.getCurrentErrorRate(modelId) + 0.1,
        lastChecked: new Date(),
        healthCheckSuccess: false,
        errorMessage: err.message
      };
    }
  }

  /**
   * 获取最新的健康检查结果
   */
  getLatestHealthCheckResult(modelId) {
    return this.healthCheckResults.get(modelId) || null;
  }

  /**
   * 获取最近成功的模型列表
   */
  getRecentlySuccessfulModels(thresholdMinutes = 5) {
    const now = new Date();
    const successfulModels = [];

    for (const [modelId, healthResult] of this.healthCheckResults.entries()) {
      const timeDiff = (now - new Date(healthResult.timestamp)) / (1000 * 60); // 分钟
      if (healthResult.isAvailable && timeDiff <= thresholdMinutes) {
        successfulModels.push({
          modelId,
          latency: healthResult.currentLatencyMs,
          lastChecked: healthResult.timestamp
        });
      }
    }

    // 按延迟升序排序
    return successfulModels.sort((a, b) => a.latency - b.latency);
  }

  /**
   * 获取模型状态
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型状态
   */
  getModelStatus(modelId) {
    if (!this.statusMap.has(modelId)) {
      // 返回默认状态（假设模型可用）
      return {
        modelId: modelId,
        isAvailable: true,
        currentLatencyMs: 0,
        errorRate: 0,
        rateLimitRemaining: -1, // -1 表示未知
        lastChecked: new Date(),
        successRate: 1.0,
        totalRequests: 0,
        failedRequests: 0,
        consecutiveSuccesses: 0,
        lastHealthCheckSuccess: null
      };
    }
    return this.statusMap.get(modelId);
  }

  /**
   * 获取当前错误率
   */
  getCurrentErrorRate(modelId) {
    const status = this.getModelStatus(modelId);
    return status.errorRate || 0;
  }

  /**
   * 获取本地模型的当前使用情况
   */
  getCurrentLocalModelUsage(modelId) {
    // 在实际实现中，这里应该检查当前正在处理的请求
    // 为了模拟，我们使用一个简单的计数器
    if (!this.currentUsage) {
      this.currentUsage = new Map();
    }

    return this.currentUsage.get(modelId) || 0;
  }

  /**
   * 标记本地模型开始使用
   */
  markLocalModelStart(modelId) {
    if (!this.currentUsage) {
      this.currentUsage = new Map();
    }

    const current = this.currentUsage.get(modelId) || 0;
    this.currentUsage.set(modelId, current + 1);
  }

  /**
   * 标记本地模型使用结束
   */
  markLocalModelEnd(modelId) {
    if (!this.currentUsage) {
      this.currentUsage = new Map();
    }

    const current = this.currentUsage.get(modelId) || 0;
    if (current > 0) {
      this.currentUsage.set(modelId, current - 1);
    }
  }

  /**
   * 获取模型负载分数（0-1，越低表示负载越低）
   * 对本地模型，负载分数还考虑资源成本因子
   */
  getModelLoadScore(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.getCurrentLocalModelUsage(modelId);

    if (maxConcurrency === 0) {
      return 1; // 满载
    }

    // 基础并发负载分数
    const baseLoadScore = currentUsage / maxConcurrency;

    // 如果模型注册表存在且模型是本地模型，加入资源成本考量
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);

      if (model && model.type === 'local') {
        // 从ModelEvaluator获取资源成本因子
        // 注意：此处需要外部传入ModelEvaluator实例或使用其他机制获取资源成本因子
        // 为了使此功能生效，我们需要某种方式获取资源成本因子

        // 假设有方法可以获取资源成本因子（这可能需要外部传入ModelEvaluator实例）
        // 此处为简化实现，我们使用模型的资源配置作为负载考虑
        if (model.hardwareSpecs) {
          // 考虑GPU内存使用情况
          const gpuLoadFactor = model.hardwareSpecs.gpu ?
            Math.min(1.0, (currentUsage * (model.size || 7)) / (model.hardwareSpecs.gpu.memoryGB || 8)) : 0;

          // 考虑CPU使用情况
          const cpuLoadFactor = model.hardwareSpecs.cpu ?
            Math.min(1.0, (currentUsage * 0.2) / (model.hardwareSpecs.cpu.cores || 4)) : 0;

          // 综合资源负载因子
          const resourceLoadFactor = (gpuLoadFactor + cpuLoadFactor) / 2;

          // 负载分数 = 基础负载 * (1 + 资源负载因子)
          return Math.min(1.0, baseLoadScore * (1 + resourceLoadFactor));
        }

        return Math.min(1.0, baseLoadScore * (1 + (model.size || 7) / 20)); // 简化的模型大小负载考量
      }
    }

    return Math.min(1.0, baseLoadScore);
  }

  /**
   * 获取模型的最大并发数
   */
  getMaxConcurrency(modelId) {
    if (!this.modelRegistry) {
      return 10; // 默认最大并发数
    }

    const model = this.modelRegistry.getModel(modelId);
    if (!model) {
      return 10;
    }

    // 根据模型类型返回不同的默认并发数
    if (model.type === 'local') {
      return model.maxConcurrency || 2;
    }

    // 云端模型根据提供商设置不同的默认并发数
    const defaultConcurrency = {
      'openai': 20,
      'anthropic': 15,
      'google': 20,
      'deepseek': 10,
      'local': 2
    };

    return model.maxConcurrency || defaultConcurrency[model.provider] || 10;
  }

  /**
   * 检查是否有可用并发槽位
   */
  hasAvailableConcurrency(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.getCurrentLocalModelUsage(modelId);
    return currentUsage < maxConcurrency;
  }

  /**
   * 获取模型详细负载状态
   * @param {string} modelId - 模型 ID
   * @returns {Object} 负载状态对象
   */
  getModelLoadStatus(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.getCurrentLocalModelUsage(modelId);
    const availableSlots = maxConcurrency - currentUsage;
    const loadScore = maxConcurrency > 0 ? currentUsage / maxConcurrency : 1;

    return {
      modelId,
      maxConcurrency,
      currentUsage,
      availableSlots,
      loadScore,
      recommendation: this._getModelRecommendation(loadScore)
    };
  }

  /**
   * 根据负载分数生成推荐状态
   * @private
   */
  _getModelRecommendation(loadScore) {
    if (loadScore < 0.3) {
      return 'ready';     // 空闲，可以立即执行
    } else if (loadScore < 0.7) {
      return 'normal';    // 正常负载
    } else if (loadScore < 0.9) {
      return 'busy';      // 繁忙，可能需要等待
    } else {
      return 'overloaded'; // 过载，建议降级或等待
    }
  }

  /**
   * 从健康检查器更新模型状态
   * @param {string} modelId - 模型 ID
   * @param {boolean} isAvailable - 是否可用
   * @param {string} reason - 原因
   */
  updateStatusFromHealthCheck(modelId, isAvailable, reason) {
    this.updateStatus(modelId, {
      isAvailable,
      healthCheckReason: reason,
      lastHealthCheck: new Date().toISOString()
    });
    console.log(`[ModelStatusMonitor] ${modelId}: ${isAvailable ? '✅ 可用' : '❌ 不可用'} - ${reason}`);
  }

  /**
   * 更新模型状态
   * @param {string} modelId - 模型 ID
   * @param {Object} statusUpdate - 状态更新
   */
  updateStatus(modelId, statusUpdate) {
    const currentStatus = this.getModelStatus(modelId);
    const newStatus = {
      ...currentStatus,
      ...statusUpdate,
      lastChecked: new Date()
    };

    this.statusMap.set(modelId, newStatus);

    // 更新性能历史
    this.recordPerformance(modelId, statusUpdate);
  }

  /**
   * 记录性能数据
   * @param {string} modelId - 模型 ID
   * @param {Object} statusUpdate - 状态更新
   */
  recordPerformance(modelId, statusUpdate) {
    if (!this.performanceHistory.has(modelId)) {
      this.performanceHistory.set(modelId, []);
    }
    const history = this.performanceHistory.get(modelId);

    const record = {
      timestamp: new Date(),
      latency: statusUpdate.currentLatencyMs || 0,
      errorRate: statusUpdate.errorRate || 0,
      isAvailable: statusUpdate.isAvailable !== false
    };

    history.push(record);

    // 限制历史记录大小
    if (history.length > this.config.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * 记录请求结果
   * @param {string} modelId - 模型 ID
   * @param {boolean} success - 请求是否成功
   * @param {number} latencyMs - 延迟（毫秒）
   */
  recordRequest(modelId, success, latencyMs = 0) {
    const status = this.getModelStatus(modelId);
    const totalRequests = status.totalRequests + 1;

    // 恢复机制：跟踪连续成功次数
    const consecutiveSuccesses = success
      ? (status.consecutiveSuccesses || 0) + 1
      : 0;

    // 恢复阈值：连续成功多少次后重置错误率
    const recoveryThreshold = 3;

    // 如果连续成功达到阈值，重置错误统计（模型恢复）
    let failedRequests, errorRate;
    if (consecutiveSuccesses >= recoveryThreshold && status.errorRate > 0) {
      console.log(`[ModelStatusMonitor] 模型 ${modelId} 连续成功 ${consecutiveSuccesses} 次，重置错误统计`);
      failedRequests = 0;
      errorRate = 0;
    } else {
      failedRequests = status.failedRequests + (success ? 0 : 1);
      errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;
    }

    // 计算平均延迟（简单移动平均）
    const newLatency = status.currentLatencyMs > 0
      ? (status.currentLatencyMs * 0.9 + latencyMs * 0.1)
      : latencyMs;

    this.updateStatus(modelId, {
      totalRequests,
      failedRequests,
      errorRate,
      currentLatencyMs: newLatency,
      successRate: 1 - errorRate,
      consecutiveSuccesses
    });
  }

  /**
   * 检查模型是否适合使用
   * @param {string} modelId - 模型 ID
   * @param {Object} constraints - 约束条件
   * @returns {Object} 检查结果 {usable: boolean, reason: string}
   */
  isModelUsable(modelId, constraints = {}) {
    const status = this.getModelStatus(modelId);

    // 检查是否可用
    if (!status.isAvailable) {
      return { usable: false, reason: "模型不可用" };
    }

    // 获取模型注册表信息以检查模型类型
    const model = this.modelRegistry?.getModel(modelId);

    // 如果是本地模型，检查并发限制
    if (model && model.type === 'local') {
      const currentUsage = this.getCurrentLocalModelUsage(modelId);
      const maxConcurrency = model.maxConcurrency || 2;

      if (currentUsage >= maxConcurrency) {
        return {
          usable: false,
          reason: `本地模型 ${modelId} 已达到最大并发限制: ${currentUsage}/${maxConcurrency}`
        };
      }
    }

    // 检查错误率
    if (status.errorRate > (constraints?.errorRateThreshold || this.config.errorRateThreshold)) {
      return { usable: false, reason: `错误率过高: ${status.errorRate}` };
    }

    // 检查延迟
    if (status.currentLatencyMs > (constraints?.latencyThresholdMs || (model?.responseTime || 300000))) {
      return { usable: false, reason: `延迟过高: ${status.currentLatencyMs}ms` };
    }

    // 检查速率限制（仅适用于云端模型）
    if (model?.type !== 'local' && status.rateLimitRemaining === 0) {
      return { usable: false, reason: "速率限制已满" };
    }

    return { usable: true, reason: "模型可用" };
  }

  /**
   * 获取所有模型的状态
   * @returns {Array} 所有模型状态列表
   */
  getAllStatuses() {
    return Array.from(this.statusMap.values());
  }

  /**
   * 获取可用模型列表
   * @returns {Array} 可用模型 ID 列表
   */
  getAvailableModels() {
    const result = [];
    for (const [modelId, status] of this.statusMap.entries()) {
      if (this.isModelUsable(modelId).usable) {
        result.push(modelId);
      }
    }
    return result;
  }

  /**
   * 设置模型可用性
   * @param {string} modelId - 模型 ID
   * @param {boolean} available - 是否可用
   */
  setModelAvailability(modelId, available) {
    this.updateStatus(modelId, { isAvailable: available });
    console.log(`[ModelStatusMonitor] 模型 ${modelId} 可用性设置为：${available}`);
  }

  /**
   * 获取性能统计
   * @param {string} modelId - 模型 ID
   * @returns {Object} 性能统计信息
   */
  getPerformanceStats(modelId) {
    const history = this.performanceHistory.get(modelId);

    if (!history || history.length === 0) {
      return {
        modelId,
        avgLatency: 0,
        avgErrorRate: 0,
        totalRecords: 0,
        availability: 1.0
      };
    }

    const totalRecords = history.length;
    const avgLatency = history.reduce((sum, r) => sum + r.latency, 0) / totalRecords;
    const avgErrorRate = history.reduce((sum, r) => sum + r.errorRate, 0) / totalRecords;
    const availableCount = history.filter(r => r.isAvailable).length;
    const availability = availableCount / totalRecords;

    return {
      modelId,
      avgLatency: Math.round(avgLatency * 100) / 100,
      avgErrorRate: Math.round(avgErrorRate * 1000) / 1000,
      totalRecords,
      availability: Math.round(availability * 100) / 100
    };
  }

  /**
   * 清除模型状态
   * @param {string} modelId - 模型 ID
   */
  clearStatus(modelId) {
    this.statusMap.delete(modelId);
    this.performanceHistory.delete(modelId);
    console.log(`[ModelStatusMonitor] 已清除模型 ${modelId} 的状态`);
  }

  /**
   * 清除所有状态
   */
  clearAllStatuses() {
    this.statusMap.clear();
    this.performanceHistory.clear();
    console.log('[ModelStatusMonitor] 已清除所有模型状态');
  }

  /**
   * 导出状态报告
   * @returns {Object} 状态报告
   */
  exportReport() {
    const report = {
      timestamp: new Date().toISOString(),
      models: {}
    };

    for (const [modelId, status] of this.statusMap.entries()) {
      report.models[modelId] = {
        current: status,
        performance: this.getPerformanceStats(modelId)
      };
    }

    return report;
  }

  /**
   * 启动定期检查（可选功能）
   * @param {Function} checkFunction - 检查函数
   * @param {number} intervalMs - 检查间隔（毫秒）
   */
  startPeriodicCheck(checkFunction, intervalMs = 60000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      checkFunction(this);
    }, intervalMs);

    console.log(`[ModelStatusMonitor] 已启动定期检查，间隔：${intervalMs}ms`);
  }

  /**
   * 停止定期检查
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[ModelStatusMonitor] 已停止定期检查');
    }
  }
}

/**
 * 健康检查配置选项
 */
class HealthCheckConfig {
  constructor(options = {}) {
    // 健康检查频率配置（默认值）
    this.intervalMs = options.intervalMs || 60000; // 检查间隔毫秒
    this.timeoutMs = options.timeoutMs || 10000;   // 单次检查超时
    this.retries = options.retries || 2;           // 重试次数

    // 请求配置
    this.requestType = options.requestType || 'lightweight-call'; // 'lightweight-call', 'endpoint-check', 'metadata-only'
    this.payloadSize = options.payloadSize || 'minimal'; // 'minimal', 'small', 'normal'

    // 不同提供商的特定配置
    this.providerConfigs = {
      openai: {
        endpoint: options.openaiEndpoint || '/v1/chat/completions', // 可配置为 /health 等
        payload: { model: 'gpt-4o-mini', messages: [{role: 'user', content: 'ping'}], max_tokens: 1 }
      },
      anthropic: {
        endpoint: options.anthropicEndpoint || '/v1/messages',
        payload: { model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{role: 'user', content: 'ping'}] }
      },
      google: {
        endpoint: options.googleEndpoint || '/v1beta/models/model-name:generateContent',
        payload: { contents: [{parts: [{text: 'ping'}]}], generationConfig: {maxOutputTokens: 1} }
      },
      azure: {
        endpoint: options.azureEndpoint || '/chat/completions',
        payload: { model: 'gpt-4', messages: [{role: 'user', content: 'ping'}], max_tokens: 1 }
      }
    };
  }
}

/**
 * 智能健康检查调度器 - 根据模型可用性和历史表现调整检查频率
 */
class SmartHealthCheckScheduler {
  constructor(statusMonitor) {
    this.statusMonitor = statusMonitor;
    this.checkHistory = new Map(); // 存储各模型的检查历史
    this.baseInterval = 60000; // 默认检查间隔
    this.maxInterval = 300000; // 最大检查间隔（5分钟）
    this.minInterval = 10000;  // 最小检查间隔（10秒）
  }

  /**
   * 计算特定模型的健康检查间隔
   */
  calculateOptimalInterval(modelId) {
    const status = this.statusMonitor.getModelStatus(modelId);
    const history = this.checkHistory.get(modelId) || [];

    // 根据模型稳定性调整检查频率
    if (history.length < 5) {
      // 新模型或数据不足，使用基础频率
      return this.baseInterval;
    }

    // 分析历史稳定性
    const recentStability = this.calculateStability(history.slice(-10));

    if (recentStability > 0.95) {
      // 模型非常稳定，延长检查间隔
      return Math.min(this.maxInterval, this.baseInterval * 2);
    } else if (recentStability < 0.8) {
      // 模型不稳定，缩短检查间隔
      return Math.max(this.minInterval, this.baseInterval / 2);
    } else {
      // 中等稳定性，使用标准间隔
      return this.baseInterval;
    }
  }

  /**
   * 计算模型稳定性
   */
  calculateStability(recentChecks) {
    if (recentChecks.length === 0) return 1.0;

    const successfulChecks = recentChecks.filter(check => check.success).length;
    return successfulChecks / recentChecks.length;
  }

  /**
   * 记录健康检查结果
   */
  recordCheckResult(modelId, result) {
    if (!this.checkHistory.has(modelId)) {
      this.checkHistory.set(modelId, []);
    }

    const history = this.checkHistory.get(modelId);
    history.push({
      timestamp: new Date(),
      success: result.isAvailable,
      latency: result.currentLatencyMs
    });

    // 保留最近100次检查记录
    if (history.length > 100) {
      history.shift();
    }
  }
}

module.exports = ModelStatusMonitor;