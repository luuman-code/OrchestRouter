/**
 * @fileoverview ProgressTracker - 进度追踪器
 *
 * 提供任务进度百分比计算、当前阶段状态描述、预计剩余时间估算、WebSocket推送支持
 */

/**
 * ProgressEvent - 进度事件
 *
 * @typedef {Object} ProgressEvent
 * @property {string} id - 事件ID
 * @property {string} taskId - 任务ID
 * @property {number} progress - 进度百分比 (0-100)
 * @property {string} stage - 当前阶段
 * @property {string} status - 当前状态
 * @property {Object} [details] - 详细信息
 * @property {number} timestamp - 时间戳
 */

/**
 * ProgressStage - 进度阶段
 *
 * @typedef {Object} ProgressStage
 * @property {string} name - 阶段名称
 * @property {number} weight - 阶段权重 (0-100)
 * @property {string} description - 阶段描述
 * @property {string} status - 当前状态 ('pending', 'running', 'completed', 'failed')
 * @property {number} startTime - 开始时间
 * @property {number} endTime - 结束时间
 * @property {Object} [metrics] - 指标数据
 */

/**
 * ProgressTracker - 进度追踪器
 *
 * 追踪任务执行进度并提供相关信息
 */
class ProgressTracker {
  /**
   * 创建进度追踪器
   */
  constructor() {
    /** @type {Map<string, ProgressEvent>} */
    this.progressEvents = new Map();

    /** @type {Map<string, ProgressStage[]>} */
    this.taskStages = new Map();

    /** @type {Map<string, {startTime: number, estimatedDuration: number}>} */
    this.taskTimings = new Map();

    /** @type {Map<string, Function[]>} */
    this.eventListeners = new Map();

    /** @type {Set<string>} */
    this.activeTasks = new Set();

    // 默认阶段配置
    /** @type {ProgressStage[]} */
    this.defaultStages = [
      { name: 'initializing', weight: 5, description: '初始化中' },
      { name: 'analyzing', weight: 15, description: '分析中' },
      { name: 'processing', weight: 50, description: '处理中' },
      { name: 'validating', weight: 15, description: '验证中' },
      { name: 'finalizing', weight: 10, description: '收尾中' },
      { name: 'completed', weight: 5, description: '完成' }
    ];
  }

  /**
   * 开始追踪任务
   *
   * @param {string} taskId - 任务ID
   * @param {Object} [options] - 选项
   * @param {ProgressStage[]} [options.stages] - 自定义阶段
   * @param {string} [options.initialStage] - 初始阶段
   * @returns {void}
   */
  startTask(taskId, options = {}) {
    const stages = options.stages || this.defaultStages.map(stage => {
      return {
        ...stage,
        status: stage.name === (options.initialStage || 'initializing') ? 'running' : 'pending',
        startTime: stage.name === (options.initialStage || 'initializing') ? Date.now() : null,
        endTime: null,
        metrics: {}
      };
    });

    this.taskStages.set(taskId, stages);
    this.taskTimings.set(taskId, {
      startTime: Date.now(),
      estimatedDuration: null
    });
    this.activeTasks.add(taskId);

    // 触发初始进度事件
    this._emitProgressEvent(taskId, {
      progress: 0,
      stage: options.initialStage || 'initializing',
      status: 'started'
    });
  }

  /**
   * 更新任务进度
   *
   * @param {string} taskId - 任务ID
   * @param {Object} update - 更新信息
   * @param {string} [update.stage] - 当前阶段
   * @param {number} [update.progress] - 进度百分比
   * @param {string} [update.status] - 状态
   * @param {Object} [update.details] - 详细信息
   * @param {Object} [update.metrics] - 指标数据
   * @returns {void}
   */
  updateProgress(taskId, update) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Task ${taskId} is not active, cannot update progress`);
      return;
    }

    const stages = this.taskStages.get(taskId) || [];
    const timing = this.taskTimings.get(taskId);

    // 更新阶段信息
    if (update.stage) {
      const stageIndex = stages.findIndex(stage => stage.name === update.stage);
      if (stageIndex !== -1) {
        const currentStage = stages[stageIndex];

        // 如果阶段状态是第一次变为 running，记录开始时间
        if (update.status === 'running' && !currentStage.startTime) {
          currentStage.startTime = Date.now();
        }

        // 如果阶段完成，记录结束时间
        if (update.status === 'completed' && !currentStage.endTime) {
          currentStage.endTime = Date.now();
        }

        // 更新状态
        currentStage.status = update.status || currentStage.status;
        currentStage.metrics = { ...currentStage.metrics, ...update.metrics };
      }
    }

    // 计算当前总体进度
    let calculatedProgress = update.progress;
    if (calculatedProgress === undefined) {
      calculatedProgress = this._calculateOverallProgress(stages);
    }

    // 估计剩余时间
    let estimatedRemainingTime = null;
    if (timing && timing.startTime) {
      const elapsed = Date.now() - timing.startTime;
      if (calculatedProgress > 0 && calculatedProgress < 100) {
        const totalTimeEstimate = (elapsed / calculatedProgress) * 100;
        estimatedRemainingTime = Math.max(0, totalTimeEstimate - elapsed);
      }
    }

    // 创建进度事件
    const progressEvent = {
      id: this._generateId(),
      taskId,
      progress: Math.min(100, Math.max(0, calculatedProgress)),
      stage: update.stage || this._getCurrentStage(stages),
      status: update.status || 'running',
      details: update.details,
      estimatedRemainingTime,
      timestamp: Date.now()
    };

    // 存储进度事件
    this.progressEvents.set(progressEvent.id, progressEvent);

    // 触发进度事件
    this._emitProgressEvent(taskId, progressEvent);

    // 如果进度达到100%，结束任务
    if (progressEvent.progress >= 100) {
      this.completeTask(taskId);
    }
  }

  /**
   * 计算总体进度
   *
   * @private
   * @param {ProgressStage[]} stages - 阶段列表
   * @returns {number} 总体进度 (0-100)
   */
  _calculateOverallProgress(stages) {
    let totalWeight = 0;
    let completedWeight = 0;

    for (const stage of stages) {
      totalWeight += stage.weight;

      if (stage.status === 'completed') {
        completedWeight += stage.weight;
      } else if (stage.status === 'running') {
        // 对于正在运行的阶段，可以给一个部分进度（可以根据具体情况调整）
        // 这里假设正在运行的阶段完成了其权重的一半
        completedWeight += stage.weight * 0.5;
      }
    }

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }

  /**
   * 获取当前阶段名称
   *
   * @private
   * @param {ProgressStage[]} stages - 阶段列表
   * @returns {string} 当前阶段名称
   */
  _getCurrentStage(stages) {
    // 返回第一个非完成的阶段，如果没有则返回最后一个
    const runningStage = stages.find(stage => stage.status === 'running');
    if (runningStage) {
      return runningStage.name;
    }

    const pendingStage = stages.find(stage => stage.status === 'pending');
    if (pendingStage) {
      return pendingStage.name;
    }

    // 如果都完成了，返回最后完成的那个
    const completedStages = stages.filter(stage => stage.status === 'completed');
    return completedStages.length > 0 ? completedStages[completedStages.length - 1].name : 'initializing';
  }

  /**
   * 完成任务
   *
   * @param {string} taskId - 任务ID
   * @param {Object} [result] - 任务结果
   * @returns {void}
   */
  completeTask(taskId, result) {
    if (!this.activeTasks.has(taskId)) {
      return;
    }

    const stages = this.taskStages.get(taskId) || [];

    // 将所有未完成的阶段标记为完成
    for (const stage of stages) {
      if (stage.status !== 'completed' && stage.status !== 'failed') {
        stage.status = 'completed';
        if (!stage.endTime) {
          stage.endTime = Date.now();
        }
      }
    }

    // 更新任务状态
    this.activeTasks.delete(taskId);

    // 发送完成事件
    const timing = this.taskTimings.get(taskId);
    const completedEvent = {
      id: this._generateId(),
      taskId,
      progress: 100,
      stage: 'completed',
      status: 'completed',
      result,
      duration: timing ? (Date.now() - timing.startTime) : null,
      timestamp: Date.now()
    };

    this.progressEvents.set(completedEvent.id, completedEvent);
    this._emitProgressEvent(taskId, completedEvent);
  }

  /**
   * 失败任务
   *
   * @param {string} taskId - 任务ID
   * @param {string} error - 错误信息
   * @returns {void}
   */
  failTask(taskId, error) {
    if (!this.activeTasks.has(taskId)) {
      return;
    }

    const stages = this.taskStages.get(taskId) || [];

    // 将当前运行阶段标记为失败
    for (const stage of stages) {
      if (stage.status === 'running') {
        stage.status = 'failed';
        stage.endTime = Date.now();
        break;
      }
    }

    // 更新任务状态
    this.activeTasks.delete(taskId);

    // 发送失败事件
    const failedEvent = {
      id: this._generateId(),
      taskId,
      progress: this._calculateOverallProgress(stages),
      stage: this._getCurrentStage(stages),
      status: 'failed',
      error,
      timestamp: Date.now()
    };

    this.progressEvents.set(failedEvent.id, failedEvent);
    this._emitProgressEvent(taskId, failedEvent);
  }

  /**
   * 获取任务进度信息
   *
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 进度信息
   */
  getProgress(taskId) {
    if (!this.taskStages.has(taskId)) {
      return null;
    }

    const stages = this.taskStages.get(taskId);
    const timing = this.taskTimings.get(taskId);
    const currentProgress = this._calculateOverallProgress(stages);
    const currentStage = this._getCurrentStage(stages);

    // 计算剩余时间估计
    let estimatedRemainingTime = null;
    if (timing && timing.startTime) {
      const elapsed = Date.now() - timing.startTime;
      if (currentProgress > 0 && currentProgress < 100) {
        const totalTimeEstimate = (elapsed / currentProgress) * 100;
        estimatedRemainingTime = Math.max(0, totalTimeEstimate - elapsed);
      }
    }

    return {
      taskId,
      progress: currentProgress,
      stage: currentStage,
      isActive: this.activeTasks.has(taskId),
      stages: stages.map(stage => ({
        name: stage.name,
        description: stage.description,
        weight: stage.weight,
        status: stage.status,
        startTime: stage.startTime,
        endTime: stage.endTime,
        metrics: stage.metrics,
        elapsedTime: stage.startTime ? (stage.endTime ? stage.endTime - stage.startTime : Date.now() - stage.startTime) : null
      })),
      timing: {
        startTime: timing?.startTime,
        estimatedDuration: timing?.estimatedDuration,
        estimatedRemainingTime,
        elapsed: timing ? (Date.now() - timing.startTime) : null
      },
      timestamp: Date.now()
    };
  }

  /**
   * 获取批量进度信息
   *
   * @param {string[]} taskIds - 任务ID列表
   * @returns {Object} 批量进度信息
   */
  getBatchProgress(taskIds) {
    const results = {};

    for (const taskId of taskIds) {
      results[taskId] = this.getProgress(taskId);
    }

    return results;
  }

  /**
   * 订阅进度事件
   *
   * @param {string} taskId - 任务ID
   * @param {Function} listener - 监听器函数
   * @returns {Function} 取消订阅函数
   */
  subscribe(taskId, listener) {
    if (!this.eventListeners.has(taskId)) {
      this.eventListeners.set(taskId, []);
    }

    const listeners = this.eventListeners.get(taskId);
    listeners.push(listener);

    // 返回取消订阅函数
    return () => {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * 取消订阅进度事件
   *
   * @param {string} taskId - 任务ID
   * @param {Function} listener - 监听器函数
   * @returns {boolean} 是否成功取消
   */
  unsubscribe(taskId, listener) {
    if (!this.eventListeners.has(taskId)) {
      return false;
    }

    const listeners = this.eventListeners.get(taskId);
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * 触发进度事件
   *
   * @private
   * @param {string} taskId - 任务ID
   * @param {ProgressEvent} event - 进度事件
   * @returns {void}
   */
  _emitProgressEvent(taskId, event) {
    const listeners = this.eventListeners.get(taskId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in progress event listener:', error);
        }
      }
    }
  }

  /**
   * 获取活跃任务列表
   *
   * @returns {string[]} 活跃任务ID列表
   */
  getActiveTasks() {
    return Array.from(this.activeTasks);
  }

  /**
   * 获取最近的进度事件
   *
   * @param {string} [taskId] - 任务ID（可选，如果不提供则获取所有任务的事件）
   * @param {number} [limit] - 限制数量
   * @returns {ProgressEvent[]} 进度事件列表
   */
  getRecentEvents(taskId, limit = 10) {
    let events = Array.from(this.progressEvents.values());

    if (taskId) {
      events = events.filter(event => event.taskId === taskId);
    }

    // 按时间戳降序排列并限制数量
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * 清理完成的任务
   *
   * @param {number} retentionMs - 保留时间（毫秒）
   * @returns {number} 清理的任务数量
   */
  cleanup(retentionMs = 3600000) { // 默认保留1小时
    const now = Date.now();
    let cleanedCount = 0;

    // 清理过期的进度事件
    for (const [id, event] of this.progressEvents.entries()) {
      if (now - event.timestamp > retentionMs) {
        this.progressEvents.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 生成唯一ID
   *
   * @private
   * @returns {string} 唯一ID
   */
  _generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * 重置进度追踪器
   *
   * @returns {void}
   */
  reset() {
    this.progressEvents.clear();
    this.taskStages.clear();
    this.taskTimings.clear();
    this.eventListeners.clear();
    this.activeTasks.clear();
  }
}

module.exports = { ProgressTracker };