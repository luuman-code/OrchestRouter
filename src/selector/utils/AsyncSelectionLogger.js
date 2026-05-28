/**
 * AsyncSelectionLogger - 异步选择日志处理器
 *
 * 用于处理详细的selectionReason日志，减少对主业务流程的影响
 */

class AsyncSelectionLogger {
  constructor(config = {}) {
    this.logQueue = [];
    this.isProcessing = false;
    this.processingDelay = config.processingDelay || 0; // 处理延迟，默认为0
    this.batchSize = config.batchSize || 1; // 批处理大小
    this.logger = config.logger || console; // 日志记录器，默认为console
  }

  /**
   * 添加选择日志到队列
   */
  async logSelection(selectionData) {
    // 将日志添加到队列
    this.logQueue.push({
      timestamp: Date.now(),
      selectionData
    });

    // 如果尚未开始处理，则启动处理
    if (!this.isProcessing) {
      this.processLogQueue();
    }
  }

  /**
   * 处理日志队列
   */
  async processLogQueue() {
    this.isProcessing = true;

    while (this.logQueue.length > 0) {
      // 根据批量大小处理日志
      const batch = this.logQueue.splice(0, this.batchSize);

      for (const logEntry of batch) {
        try {
          // 实际的日志记录操作
          this.logger.info('ModelSelection', {
            taskId: logEntry.selectionData.task_id,
            selectedModel: logEntry.selectionData.selected_model,
            selectionReason: logEntry.selectionData.selectionReason, // 已经过ModelEvaluator处理的裁剪版
            estimatedCost: logEntry.selectionData.estimated_cost,
            timestamp: logEntry.timestamp
          });
        } catch (error) {
          // 如果日志记录失败，不要让错误影响主流程
          console.warn(`[AsyncSelectionLogger] 记录选择日志时发生错误: ${error.message}`);
        }
      }

      // 为避免阻塞主线程，短暂暂停
      if (this.processingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.processingDelay));
      } else {
        // 让出控制权给事件循环
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    this.isProcessing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueSize: this.logQueue.length,
      isProcessing: this.isProcessing,
      batchSize: this.batchSize,
      processingDelay: this.processingDelay
    };
  }

  /**
   * 清空队列
   */
  clearQueue() {
    this.logQueue = [];
  }
}

module.exports = AsyncSelectionLogger;