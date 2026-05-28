/**
 * ConcurrencyManager - 并发管理器
 *
 * 负责管理模型的并发请求，提供负载信息查询接口
 * 职责：仅提供负载感知数据，不直接参与执行流程的槽位控制
 *
 * 注意：实际的槽位获取与释放由执行器负责
 */

class ConcurrencyManager {
  constructor() {
    this.modelRegistry = null; // 模型注册表引用
    this.activeSlots = new Map(); // 当前活跃的槽位 { modelId => count }
    this.waitingQueue = new Map(); // 等待队列 { modelId => Array<resolve> }
    this.slotTimeout = 30000; // 槽位等待超时时间（毫秒）
  }

  /**
   * 设置模型注册表引用
   */
  setModelRegistry(modelRegistry) {
    this.modelRegistry = modelRegistry;
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
   * 获取当前可用槽位数量
   */
  getAvailableSlots(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.activeSlots.get(modelId) || 0;
    return Math.max(0, maxConcurrency - currentUsage);
  }

  /**
   * 检查是否有可用槽位
   */
  hasAvailableSlots(modelId, requiredSlots = 1) {
    return this.getAvailableSlots(modelId) >= requiredSlots;
  }

  /**
   * 获取模型负载分数（0-1，越低表示负载越低）
   * 用于选择器进行负载感知选择
   */
  getLoadScore(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.activeSlots.get(modelId) || 0;

    if (maxConcurrency === 0) {
      return 1; // 满载
    }

    return currentUsage / maxConcurrency;
  }

  /**
   * 获取模型的实时并发使用量
   */
  getCurrentUsage(modelId) {
    return this.activeSlots.get(modelId) || 0;
  }

  /**
   * 获取所有模型的负载状态
   * 供选择器查询使用
   */
  getAllModelsLoadStatus() {
    if (!this.modelRegistry) {
      return [];
    }

    const status = [];
    for (const [modelId] of this.modelRegistry.models) {
      status.push({
        modelId,
        maxConcurrency: this.getMaxConcurrency(modelId),
        currentUsage: this.getCurrentUsage(modelId),
        availableSlots: this.getAvailableSlots(modelId),
        loadScore: this.getLoadScore(modelId),
        recommendation: this._getRecommendation(modelId)
      });
    }

    return status;
  }

  /**
   * 获取单个模型的负载状态
   */
  getModelLoadStatus(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.activeSlots.get(modelId) || 0;
    const availableSlots = maxConcurrency - currentUsage;
    const loadScore = maxConcurrency > 0 ? currentUsage / maxConcurrency : 1;

    return {
      modelId,
      maxConcurrency,
      currentUsage,
      availableSlots,
      loadScore,
      recommendation: this._getRecommendation(modelId, loadScore)
    };
  }

  /**
   * 根据负载分数生成推荐状态
   * @private
   */
  _getRecommendation(modelId, loadScore = null) {
    const score = loadScore !== null ? loadScore : this.getLoadScore(modelId);

    if (score < 0.3) {
      return 'ready';     // 空闲，可以立即执行
    } else if (score < 0.7) {
      return 'normal';    // 正常负载
    } else if (score < 0.9) {
      return 'busy';      // 繁忙，可能需要等待
    } else {
      return 'overloaded'; // 过载，建议降级或等待
    }
  }

  /**
   * 占用槽位（异步，可能需要等待）
   * 注意：此方法主要由执行器调用，选择器不应调用
   */
  async acquireSlot(modelId) {
    return new Promise((resolve, reject) => {
      const tryAcquire = () => {
        const maxConcurrency = this.getMaxConcurrency(modelId);
        const currentUsage = this.activeSlots.get(modelId) || 0;

        if (currentUsage < maxConcurrency) {
          // 有可用槽位
          this.activeSlots.set(modelId, currentUsage + 1);
          console.log(`[ConcurrencyManager] 模型 ${modelId} 占用槽位，当前使用：${currentUsage + 1}/${maxConcurrency}`);
          resolve({
            acquired: true,
            modelId,
            slotNumber: currentUsage + 1,
            totalSlots: maxConcurrency,
            timestamp: new Date()
          });
        } else {
          // 需要等待
          if (!this.waitingQueue.has(modelId)) {
            this.waitingQueue.set(modelId, []);
          }
          this.waitingQueue.get(modelId).push({ resolve, reject });

          // 设置超时
          setTimeout(() => {
            const queue = this.waitingQueue.get(modelId);
            if (queue) {
              const index = queue.findIndex(item => item.resolve === resolve);
              if (index !== -1) {
                queue.splice(index, 1);
                reject(new Error(`等待模型 ${modelId} 槽位超时`));
              }
            }
          }, this.slotTimeout);

          console.log(`[ConcurrencyManager] 模型 ${modelId} 槽位已满，加入等待队列，当前等待：${this.waitingQueue.get(modelId).length}人`);
        }
      };

      tryAcquire();
    });
  }

  /**
   * 快速尝试占用槽位（不等待，立即返回结果）
   * 用于执行器快速判断是否需要等待
   */
  tryAcquireSlot(modelId) {
    const maxConcurrency = this.getMaxConcurrency(modelId);
    const currentUsage = this.activeSlots.get(modelId) || 0;

    if (currentUsage < maxConcurrency) {
      this.activeSlots.set(modelId, currentUsage + 1);
      return {
        acquired: true,
        modelId,
        slotNumber: currentUsage + 1,
        totalSlots: maxConcurrency,
        timestamp: new Date()
      };
    }

    return {
      acquired: false,
      modelId,
      reason: '槽位已满',
      currentUsage,
      maxConcurrency,
      loadScore: maxConcurrency > 0 ? currentUsage / maxConcurrency : 1
    };
  }

  /**
   * 释放槽位
   * 由执行器在任务完成后调用
   */
  releaseSlot(modelId) {
    const currentUsage = this.activeSlots.get(modelId) || 0;

    if (currentUsage > 0) {
      this.activeSlots.set(modelId, currentUsage - 1);
      console.log(`[ConcurrencyManager] 模型 ${modelId} 释放槽位，当前使用：${currentUsage - 1}/${this.getMaxConcurrency(modelId)}`);

      // 唤醒等待队列中的一个请求
      const queue = this.waitingQueue.get(modelId);
      if (queue && queue.length > 0) {
        const nextRequest = queue.shift();
        // 下一个请求会在下一个事件循环中尝试获取槽位
        setTimeout(() => {
          nextRequest.resolve({
            acquired: true,
            modelId,
            fromQueue: true,
            timestamp: new Date()
          });
        }, 0);
      }
    }
  }

  /**
   * 批量获取多个槽位（用于模型链场景）
   */
  async acquireMultipleSlots(modelIds) {
    const results = [];
    for (const modelId of modelIds) {
      try {
        const result = await this.acquireSlot(modelId);
        results.push(result);
      } catch (error) {
        // 如果某个模型获取失败，释放之前获取的所有槽位
        for (const released of results) {
          this.releaseSlot(released.modelId);
        }
        throw error;
      }
    }
    return results;
  }

  /**
   * 批量释放多个槽位
   */
  releaseMultipleSlots(results) {
    for (const result of results) {
      this.releaseSlot(result.modelId);
    }
  }

  /**
   * 获取并发使用统计
   */
  getStatistics() {
    const stats = {
      totalActiveSlots: 0,
      totalWaitingRequests: 0,
      modelsWithWaitQueue: [],
      loadDistribution: {}
    };

    for (const [modelId, count] of this.activeSlots.entries()) {
      stats.totalActiveSlots += count;
      stats.loadDistribution[modelId] = {
        active: count,
        max: this.getMaxConcurrency(modelId),
        waiting: this.waitingQueue.get(modelId)?.length || 0
      };
    }

    for (const [modelId, queue] of this.waitingQueue.entries()) {
      stats.totalWaitingRequests += queue.length;
      if (queue.length > 0) {
        stats.modelsWithWaitQueue.push({
          modelId,
          waitingCount: queue.length
        });
      }
    }

    return stats;
  }

  /**
   * 重置所有槽位（用于紧急情况或系统重启）
   */
  resetAllSlots() {
    this.activeSlots.clear();
    this.waitingQueue.forEach((queue, modelId) => {
      queue.forEach(({ reject }) => {
        reject(new Error('并发管理器已重置，所有等待请求被取消'));
      });
    });
    this.waitingQueue.clear();
    console.log('[ConcurrencyManager] 已重置所有槽位');
  }
}

module.exports = ConcurrencyManager;
