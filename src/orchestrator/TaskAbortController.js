/**
 * TaskAbortController - 任务中断控制器
 *
 * 管理任务的中断信号，支持强制终止正在执行的任务
 *
 * @class TaskAbortController
 */
class TaskAbortController {
  constructor() {
    // 存储所有活跃任务的终止信号
    this.abortSignals = new Map();
    // 存储任务与执行请求的映射
    this.taskExecutions = new Map();
    // 存储已终止任务的历史
    this.abortedTasks = new Map();
    // 最大历史记录数
    this.maxHistorySize = 500;
  }

  /**
   * 创建任务的终止信号
   * @param {string} taskId - 任务ID
   * @returns {Object} 终止信号对象 { aborted: boolean, abort: Function }
   */
  createAbortSignal(taskId) {
    // 如果已存在，返回现有的信号
    if (this.abortSignals.has(taskId)) {
      return this.abortSignals.get(taskId);
    }

    const signal = {
      aborted: false,
      abort: null,
      reason: null,
      timestamp: null
    };

    // 创建 abort 函数
    signal.abort = (reason = 'User cancelled') => {
      signal.aborted = true;
      signal.reason = reason;
      signal.timestamp = Date.now();

      // 通知所有注册的回调
      const callbacks = this.taskExecutions.get(taskId);
      if (callbacks) {
        callbacks.forEach(cb => {
          try {
            cb(signal);
          } catch (e) {
            console.error(`[TaskAbortController] abort callback error for task ${taskId}:`, e);
          }
        });
      }
    };

    this.abortSignals.set(taskId, signal);
    return signal;
  }

  /**
   * 注册任务的执行回调
   * @param {string} taskId - 任务ID
   * @param {Function} callback - 中断时执行的回调函数
   */
  registerCallback(taskId, callback) {
    if (!this.taskExecutions.has(taskId)) {
      this.taskExecutions.set(taskId, new Set());
    }
    this.taskExecutions.get(taskId).add(callback);
  }

  /**
   * 注销任务的执行回调
   * @param {string} taskId - 任务ID
   * @param {Function} callback - 要移除的回调函数
   */
  unregisterCallback(taskId, callback) {
    const callbacks = this.taskExecutions.get(taskId);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * 获取任务的终止信号
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 终止信号对象
   */
  getAbortSignal(taskId) {
    return this.abortSignals.get(taskId) || null;
  }

  /**
   * 检查任务是否已被终止
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  isAborted(taskId) {
    const signal = this.abortSignals.get(taskId);
    return signal ? signal.aborted : false;
  }

  /**
   * 中断任务
   * @param {string} taskId - 任务ID
   * @param {string} reason - 中断原因
   * @returns {boolean} 是否成功中断
   */
  abortTask(taskId, reason = 'User cancelled') {
    const signal = this.abortSignals.get(taskId);

    if (!signal) {
      console.warn(`[TaskAbortController] No abort signal found for task ${taskId}`);
      return false;
    }

    if (signal.aborted) {
      console.warn(`[TaskAbortController] Task ${taskId} already aborted`);
      return false;
    }

    signal.abort(reason);
    console.log(`[TaskAbortController] Task ${taskId} aborted: ${reason}`);

    // 记录到历史
    this.abortedTasks.set(taskId, {
      taskId,
      reason,
      timestamp: signal.timestamp,
      duration: signal.timestamp ? Date.now() - signal.timestamp : 0
    });

    // 清理历史
    this._cleanupHistory();

    return true;
  }

  /**
   * 移除任务的终止信号
   * @param {string} taskId - 任务ID
   */
  removeAbortSignal(taskId) {
    this.abortSignals.delete(taskId);
    this.taskExecutions.delete(taskId);
  }

  /**
   * 获取已终止任务的历史
   * @param {string} taskId - 任务ID
   * @returns {Object|null}
   */
  getAbortedTaskInfo(taskId) {
    return this.abortedTasks.get(taskId) || null;
  }

  /**
   * 获取所有活跃任务数
   * @returns {number}
   */
  getActiveTaskCount() {
    return this.abortSignals.size;
  }

  /**
   * 获取已终止任务历史数
   * @returns {number}
   */
  getHistorySize() {
    return this.abortedTasks.size;
  }

  /**
   * 清理过期的历史记录
   * @private
   */
  _cleanupHistory() {
    if (this.abortedTasks.size <= this.maxHistorySize) {
      return;
    }

    const entries = [...this.abortedTasks.entries()]
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    const toDelete = entries.slice(this.maxHistorySize);
    for (const [taskId] of toDelete) {
      this.abortedTasks.delete(taskId);
    }
  }

  /**
   * 清理所有数据
   */
  clear() {
    this.abortSignals.clear();
    this.taskExecutions.clear();
    this.abortedTasks.clear();
  }
}

// 单例模式
let instance = null;

TaskAbortController.getInstance = function() {
  if (!instance) {
    instance = new TaskAbortController();
  }
  return instance;
};

module.exports = TaskAbortController;
