/**
 * RequestTracer - 请求追踪器
 *
 * 跟踪每个请求的执行过程，生成追踪 ID
 * 提供执行过程可见性，支持性能分析和问题排查
 *
 * @class RequestTracer
 */
class RequestTracer {
  /**
   * 创建请求追踪器
   * @param {Object} options - 配置选项
   * @param {boolean} options.enabled - 是否启用追踪（默认 true）
   * @param {number} options.maxTraces - 最大追踪数量（默认 10000）
   * @param {Object} options.logger - 日志记录器（默认 console）
   * @param {number} options.samplingRate - 采样率 0.0-1.0（默认 1.0 表示 100% 采样）
   * @param {boolean} options.samplingEnabled - 是否启用采样（默认 true）
   * @param {Object} options.costController - 成本控制器（可选，用于成本同步）
   */
  constructor(options = {}) {
    this.traces = new Map(); // 追踪 ID -> 追踪信息
    this.enabled = options.enabled ?? true;
    this.maxTraces = options.maxTraces || 10000;
    this.logger = options.logger || console;

    // 采样配置
    this.samplingRate = options.samplingRate || 1.0; // 默认 100% 采样
    this.samplingEnabled = options.samplingEnabled ?? true;

    // 成本控制器（可选）
    this.costController = options.costController || null;
  }

  /**
   * 检查是否应该记录此次追踪（基于采样率）
   * @returns {boolean} 是否应该采样
   */
  shouldSample() {
    if (!this.samplingEnabled) {
      return true; // 如果禁用采样，则总是记录
    }
    return Math.random() < this.samplingRate;
  }

  /**
   * 开始追踪
   * @param {Object} task - 任务对象
   * @param {string} modelId - 模型 ID
   * @param {number} estimatedCost - 预估成本
   * @returns {Promise<string|null>} 追踪 ID，如果未启用追踪或采样未命中则返回 null
   */
  async startTrace(task, modelId, estimatedCost = null) {
    if (!this.enabled) {
      return null;
    }

    // 检查是否应该采样此次追踪
    if (!this.shouldSample()) {
      // 即使不记录追踪，仍然返回一个虚拟 traceId 以保持接口一致性
      return `sampled-out-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const traceId = this.generateTraceId();
    const trace = {
      traceId,
      taskId: task.id || task.taskId || `task_${Date.now()}`,
      modelId,
      startTime: new Date(),
      estimatedCost,
      status: 'running',
      steps: [],
      metadata: {
        taskType: task.type || 'unknown',
        priority: task.priority || 'normal'
      }
    };

    this.addStep(traceId, 'started', 'Request started');
    this.traces.set(traceId, trace);

    // 限制追踪数量（移除最旧的追踪）
    if (this.traces.size > this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      this.traces.delete(oldestKey);
    }

    return traceId;
  }

  /**
   * 结束追踪
   * @param {string} traceId - 追踪 ID
   * @param {string} status - 状态（'success', 'failed', 'cancelled'）
   * @param {Object} result - 执行结果（可选）
   * @param {Error} error - 错误信息（可选）
   * @returns {Promise<void>}
   */
  async endTrace(traceId, status, result = null, error = null) {
    if (!this.enabled) {
      return;
    }

    // 如果是采样出去的追踪（虚拟 traceId），直接返回
    if (traceId && traceId.startsWith('sampled-out-')) {
      return;
    }

    if (!this.traces.has(traceId)) {
      return;
    }

    const trace = this.traces.get(traceId);
    trace.endTime = new Date();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = status;
    trace.error = error ? {
      message: error.message,
      stack: error.stack,
      code: error.code
    } : null;

    if (result) {
      trace.actualCost = result.cost;
      trace.durationMs = result.duration_ms;
      trace.tokensUsed = result.usage;
      trace.responseModel = result.model_used;
    }

    this.addStep(traceId, 'completed', `Request completed with status: ${status}`);

    // 记录重要追踪（失败或慢请求）
    if (status === 'failed' || trace.duration > 10000) {
      const logLevel = status === 'failed' ? 'error' : 'warn';
      this.logger[logLevel](`[${logLevel === 'error' ? '失败' : '慢'}] 请求追踪:`, {
        traceId,
        taskId: trace.taskId,
        modelId: trace.modelId,
        duration: trace.duration,
        status,
        error: trace.error
      });
    }

    // 与成本控制器同步数据（如果已关联）
    if (this.costController && result && traceId) {
      try {
        await this._syncWithCostController(traceId, result);
      } catch (syncError) {
        this.logger.warn(`与成本控制器同步失败：${syncError.message}`);
      }
    }
  }

  /**
   * 添加追踪步骤
   * @param {string} traceId - 追踪 ID
   * @param {string} step - 步骤名称
   * @param {string} message - 步骤描述
   * @param {Object} extra - 额外信息（可选）
   */
  addStep(traceId, step, message, extra = null) {
    if (!this.traces.has(traceId)) {
      return;
    }

    const trace = this.traces.get(traceId);
    trace.steps.push({
      timestamp: new Date(),
      step,
      message,
      extra
    });
  }

  /**
   * 生成追踪 ID
   * @returns {string} 追踪 ID
   */
  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取追踪信息
   * @param {string} traceId - 追踪 ID
   * @returns {Object|null} 追踪信息，不存在则返回 null
   */
  getTrace(traceId) {
    return this.traces.get(traceId) || null;
  }

  /**
   * 获取最近的追踪记录
   * @param {number} limit - 最大数量（默认 100）
   * @returns {Array<Object>} 追踪记录数组
   */
  getRecentTraces(limit = 100) {
    return Array.from(this.traces.values()).slice(-limit);
  }

  /**
   * 获取指定任务的所有追踪
   * @param {string|number} taskId - 任务 ID
   * @returns {Array<Object>} 追踪记录数组
   */
  getTracesByTaskId(taskId) {
    const traces = [];
    for (const trace of this.traces.values()) {
      if (trace.taskId === taskId) {
        traces.push(trace);
      }
    }
    return traces;
  }

  /**
   * 获取指定模型的所有追踪
   * @param {string} modelId - 模型 ID
   * @returns {Array<Object>} 追踪记录数组
   */
  getTracesByModelId(modelId) {
    const traces = [];
    for (const trace of this.traces.values()) {
      if (trace.modelId === modelId) {
        traces.push(trace);
      }
    }
    return traces;
  }

  /**
   * 获取失败状态的追踪
   * @param {number} limit - 最大数量（默认 100）
   * @returns {Array<Object>} 失败追踪记录数组
   */
  getFailedTraces(limit = 100) {
    const failed = [];
    for (const trace of this.traces.values()) {
      if (trace.status === 'failed') {
        failed.push(trace);
        if (failed.length >= limit) {
          break;
        }
      }
    }
    return failed;
  }

  /**
   * 获取慢请求追踪
   * @param {number} thresholdMs - 慢请求阈值（毫秒，默认 5000）
   * @param {number} limit - 最大数量（默认 100）
   * @returns {Array<Object>} 慢请求追踪记录数组
   */
  getSlowTraces(thresholdMs = 5000, limit = 100) {
    const slow = [];
    for (const trace of this.traces.values()) {
      if (trace.duration && trace.duration > thresholdMs) {
        slow.push(trace);
        if (slow.length >= limit) {
          break;
        }
      }
    }
    return slow;
  }

  /**
   * 获取追踪统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const traces = Array.from(this.traces.values());
    const total = traces.length;
    const running = traces.filter(t => t.status === 'running').length;
    const success = traces.filter(t => t.status === 'success').length;
    const failed = traces.filter(t => t.status === 'failed').length;

    const durations = traces
      .filter(t => t.duration !== undefined && t.duration !== null)
      .map(t => t.duration);

    return {
      total,
      running,
      success,
      failed,
      successRate: total > 0 ? success / total : 0,
      avgDuration: durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0,
      p95Duration: durations.length > 0
        ? this._percentile(durations, 95)
        : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0
    };
  }

  /**
   * 计算百分位数
   * @param {number[]} arr - 数值数组
   * @param {number} percentile - 百分位（0-100）
   * @returns {number} 百分位数值
   * @private
   */
  _percentile(arr, percentile) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile / 100);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  /**
   * 与成本控制器同步数据
   * @param {string} traceId - 追踪 ID
   * @param {Object} result - 执行结果
   * @private
   */
  async _syncWithCostController(traceId, result) {
    if (!this.costController) return;

    try {
      // 如果有 taskId 和成本信息，同步到成本控制器
      const trace = this.traces.get(traceId);
      if (trace && trace.taskId && result.cost) {
        // 通知成本控制器更新实际成本
        if (typeof this.costController.updateActualCost === 'function') {
          await this.costController.updateActualCost(
            trace.taskId,
            result.cost.total || result.cost,
            result.usage,
            trace.modelId
          );
        }
      }
    } catch (error) {
      this.logger.warn(`同步成本数据失败：${error.message}`);
    }
  }

  /**
   * 清除所有追踪记录
   */
  clearTraces() {
    this.traces.clear();
  }

  /**
   * 启用追踪
   */
  enable() {
    this.enabled = true;
  }

  /**
   * 禁用追踪
   */
  disable() {
    this.enabled = false;
  }

  /**
   * 设置采样率
   * @param {number} rate - 采样率（0.0-1.0）
   */
  setSamplingRate(rate) {
    this.samplingRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    return {
      enabled: this.enabled,
      maxTraces: this.maxTraces,
      samplingRate: this.samplingRate,
      samplingEnabled: this.samplingEnabled,
      currentTraceCount: this.traces.size
    };
  }
}

module.exports = RequestTracer;
