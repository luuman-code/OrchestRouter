/**
 * BatchScheduler - 批量任务预调度器
 *
 * 在批量执行前预检查模型槽位，根据可用槽位数自动调整任务分配
 * 功能：
 *   1. 统计所有子任务按模型的分布
 *   2. 查询每个模型的当前槽位使用情况
 *   3. 计算每个模型需要执行的任务数 vs 可用槽位数
 *   4. 将超出槽位的任务（按序号）自动切换到备选模型
 *
 * @class BatchScheduler
 */
class BatchScheduler {
  /**
   * 创建批量调度器
   * @param {Object} options - 选项
   * @param {Object} options.concurrencyController - 并发控制器
   * @param {Object} options.modelRegistry - 模型注册表（可选）
   */
  constructor(options = {}) {
    this.concurrencyController = options.concurrencyController || null;
    this.modelRegistry = options.modelRegistry || null;

    // 调度配置
    this.config = {
      // 槽位预留比例，保留一定比例的槽位给高优先级任务（0-1）
      reservedSlotRatio: options.reservedSlotRatio || 0.1,
      // 负载阈值，超过此阈值时不分配新任务（0-1）
      loadThreshold: options.loadThreshold || 0.9,
      // 是否启用自动降级
      enableAutoFallback: options.enableAutoFallback !== false,
      // 最大重试次数
      maxRetries: options.maxRetries || 3
    };
  }

  /**
   * 设置并发控制器
   * @param {Object} controller - 并发控制器
   */
  setConcurrencyController(controller) {
    this.concurrencyController = controller;
  }

  /**
   * 设置模型注册表
   * @param {Object} registry - 模型注册表
   */
  setModelRegistry(registry) {
    this.modelRegistry = registry;
  }

  /**
   * 预调度批量任务
   * 在执行前调整任务分配，确保不会超出模型槽位
   *
   * @param {Array} executionRequests - 执行请求列表
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 调度结果
   */
  async preScheduleBatch(executionRequests, options = {}) {
    const {
      reservedSlotRatio = this.config.reservedSlotRatio,
      loadThreshold = this.config.loadThreshold,
      enableAutoFallback = this.config.enableAutoFallback
    } = options;

    console.log(`[BatchScheduler] 开始预调度 ${executionRequests.length} 个任务...`);

    // 1. 收集所有模型信息
    const modelUsageMap = this._buildModelUsageMap(executionRequests);

    // 2. 获取每个模型的槽位信息
    const modelSlotInfo = await this._fetchModelSlotInfo(modelUsageMap);

    // 3. 计算每个模型的负载和需要调整的任务
    const adjustmentPlan = this._calculateAdjustmentPlan(
      modelUsageMap,
      modelSlotInfo,
      reservedSlotRatio,
      loadThreshold
    );

    // 4. 如果不需要调整，直接返回原请求
    if (adjustmentPlan.adjustments.length === 0) {
      console.log(`[BatchScheduler] 所有模型槽位充足，无需调整`);
      return {
        adjustedRequests: executionRequests,
        adjustments: [],
        summary: {
          totalTasks: executionRequests.length,
          adjustedTasks: 0,
          modelsInvolved: Object.keys(modelUsageMap)
        }
      };
    }

    // 5. 如果未启用自动降级，直接返回原请求和调整计划（但不应用）
    if (!enableAutoFallback) {
      console.log(`[BatchScheduler] 自动降级已禁用，生成调整计划但不应用`);
      return {
        adjustedRequests: executionRequests,
        adjustments: adjustmentPlan.adjustments,
        summary: {
          totalTasks: executionRequests.length,
          adjustedTasks: 0, // 未实际调整
          modelsInvolved: Object.keys(modelUsageMap)
        }
      };
    }

    // 6. 执行调整
    const adjustedRequests = this._applyAdjustments(
      executionRequests,
      adjustmentPlan,
      enableAutoFallback
    );

    console.log(`[BatchScheduler] 预调度完成，调整了 ${adjustmentPlan.adjustments.length} 个任务`);

    return {
      adjustedRequests,
      adjustments: adjustmentPlan.adjustments,
      summary: {
        totalTasks: executionRequests.length,
        adjustedTasks: adjustmentPlan.adjustments.length,
        modelsInvolved: Object.keys(modelUsageMap)
      }
    };
  }

  /**
   * 构建模型使用映射
   * @param {Array} executionRequests - 执行请求列表
   * @returns {Map} 模型 -> 任务索引列表
   * @private
   */
  _buildModelUsageMap(executionRequests) {
    const modelUsageMap = new Map();

    executionRequests.forEach((request, index) => {
      const modelId = request.modelId;
      if (!modelId) return;

      if (!modelUsageMap.has(modelId)) {
        modelUsageMap.set(modelId, []);
      }
      modelUsageMap.get(modelId).push(index);
    });

    return modelUsageMap;
  }

  /**
   * 获取每个模型的槽位信息
   * @param {Map} modelUsageMap - 模型使用映射
   * @returns {Promise<Map>} 模型 -> 槽位信息
   * @private
   */
  async _fetchModelSlotInfo(modelUsageMap) {
    const modelSlotInfo = new Map();

    if (!this.concurrencyController) {
      // 如果没有并发控制器，返回默认槽位信息
      for (const modelId of modelUsageMap.keys()) {
        modelSlotInfo.set(modelId, {
          maxConcurrency: 10,
          currentUsage: 0,
          availableSlots: 10,
          loadScore: 0
        });
      }
      return modelSlotInfo;
    }

    // 并发获取所有模型的槽位信息
    const promises = [];
    const modelIds = [];

    for (const modelId of modelUsageMap.keys()) {
      modelIds.push(modelId);
      promises.push(
        this.concurrencyController.getLoadInfo(modelId).catch(err => {
          console.warn(`[BatchScheduler] 获取模型 ${modelId} 槽位信息失败: ${err.message}`);
          return { maxConcurrency: 10, currentUsage: 0, availableSlots: 10, loadScore: 0 };
        })
      );
    }

    const results = await Promise.all(promises);

    modelIds.forEach((modelId, index) => {
      const info = results[index];
      modelSlotInfo.set(modelId, {
        maxConcurrency: info.maxConcurrency || 10,
        currentUsage: info.currentUsage || 0,
        availableSlots: info.availableSlots || (info.maxConcurrency - info.currentUsage) || 10,
        loadScore: info.loadScore || 0
      });
    });

    return modelSlotInfo;
  }

  /**
   * 计算调整计划
   * @param {Map} modelUsageMap - 模型使用映射
   * @param {Map} modelSlotInfo - 模型槽位信息
   * @param {number} reservedSlotRatio - 预留槽位比例
   * @param {number} loadThreshold - 负载阈值
   * @returns {Object} 调整计划
   * @private
   */
  _calculateAdjustmentPlan(modelUsageMap, modelSlotInfo, reservedSlotRatio, loadThreshold) {
    const adjustments = [];
    const modelTaskCounts = new Map();

    // 统计每个模型的任务数
    for (const [modelId, taskIndices] of modelUsageMap.entries()) {
      modelTaskCounts.set(modelId, taskIndices.length);
    }

    // 按任务序号排序，确保序号靠后的任务先被调整
    const sortedModels = Array.from(modelUsageMap.entries()).sort((a, b) => {
      // 获取每个模型的最小任务序号
      const minIndexA = Math.min(...a[1]);
      const minIndexB = Math.min(...b[1]);
      return minIndexA - minIndexB;
    });

    // 计算每个模型需要调整的任务
    for (const [modelId, taskIndices] of sortedModels) {
      const slotInfo = modelSlotInfo.get(modelId);
      const taskCount = taskIndices.length;

      // 计算可用槽位（考虑预留比例）
      const effectiveMaxSlots = Math.floor(
        slotInfo.maxConcurrency * (1 - reservedSlotRatio)
      );
      const availableSlots = Math.min(slotInfo.availableSlots, effectiveMaxSlots);

      // 如果任务数 <= 可用槽位，不需要调整
      if (taskCount <= availableSlots) {
        continue;
      }

      // 需要调整的任务数
      const tasksToAdjust = taskCount - availableSlots;
      console.log(`[BatchScheduler] 模型 ${modelId}: ${taskCount} 个任务, ${availableSlots} 个可用槽位, 需要调整 ${tasksToAdjust} 个`);

      // 获取需要调整的任务索引（按序号从大到小，优先调整后面的）
      const sortedIndices = [...taskIndices].sort((a, b) => b - a);

      for (let i = 0; i < tasksToAdjust; i++) {
        const taskIndex = sortedIndices[i];
        adjustments.push({
          taskIndex,
          originalModel: modelId,
          reason: 'slot_exhausted',
          currentLoad: slotInfo.loadScore,
          requiredSlots: taskCount,
          availableSlots
        });
      }
    }

    return { adjustments, modelTaskCounts, modelSlotInfo };
  }

  /**
   * 应用调整
   * @param {Array} executionRequests - 执行请求
   * @param {Object} adjustmentPlan - 调整计划
   * @param {boolean} enableAutoFallback - 是否启用自动降级
   * @returns {Array} 调整后的请求
   * @private
   */
  _applyAdjustments(executionRequests, adjustmentPlan, enableAutoFallback) {
    // 深拷贝请求
    const adjustedRequests = executionRequests.map(req => ({ ...req }));

    // 按任务序号排序调整列表（从小到大）
    const sortedAdjustments = [...adjustmentPlan.adjustments].sort(
      (a, b) => a.taskIndex - b.taskIndex
    );

    // 跟踪每个模型已经分配的任务数
    const modelAssignedCount = new Map();

    for (const adjustment of sortedAdjustments) {
      const request = adjustedRequests[adjustment.taskIndex];
      if (!request) continue;

      const alternatives = request.alternatives || [];

      if (!enableAutoFallback || alternatives.length === 0) {
        console.log(`[BatchScheduler] 任务 ${adjustment.taskIndex} 无法调整（无备选模型）`);
        continue;
      }

      // 找到最佳的备选模型
      const fallbackModel = this._findBestFallbackModel(
        alternatives,
        adjustment,
        modelAssignedCount
      );

      if (fallbackModel) {
        console.log(
          `[BatchScheduler] 任务 ${adjustment.taskIndex}: ${adjustment.originalModel} -> ${fallbackModel}`
        );

        // 记录原始模型
        request.originalModelId = request.modelId;
        // 更新模型
        request.modelId = fallbackModel;
        // 记录调整信息
        request._adjusted = true;
        request._adjustmentReason = 'slot_exhausted';
        request._adjustedAt = Date.now();

        // 更新计数器
        const count = modelAssignedCount.get(fallbackModel) || 0;
        modelAssignedCount.set(fallbackModel, count + 1);
      } else {
        console.log(`[BatchScheduler] 任务 ${adjustment.taskIndex} 找不到合适的备选模型`);
      }
    }

    return adjustedRequests;
  }

  /**
   * 查找最佳的备选模型
   * @param {Array} alternatives - 备选模型列表
   * @param {Object} adjustment - 调整信息
   * @param {Map} modelAssignedCount - 模型已分配任务数
   * @returns {string|null} 最佳备选模型ID
   * @private
   */
  _findBestFallbackModel(alternatives, adjustment, modelAssignedCount) {
    if (!alternatives || alternatives.length === 0) {
      return null;
    }

    // 处理 alternatives 可能是字符串数组或对象数组
    const altModels = alternatives.map(alt => {
      if (typeof alt === 'string') {
        return { modelId: alt };
      }
      return alt;
    });

    // 尝试找到负载最低且有可用槽位的模型
    for (const alt of altModels) {
      const modelId = alt.modelId || alt;

      // 检查是否已经有太多任务分配给这个模型
      const assignedCount = modelAssignedCount.get(modelId) || 0;

      // 简单检查：已经有大量任务分配则跳过
      if (assignedCount > 5) {
        continue;
      }

      return modelId;
    }

    // 如果所有模型都满了，返回第一个备选
    return altModels[0]?.modelId || altModels[0];
  }

  /**
   * 获取调度统计信息
   * @returns {Object} 统计信息
   */
  getStatistics() {
    return {
      config: this.config,
      hasConcurrencyController: !!this.concurrencyController,
      hasModelRegistry: !!this.modelRegistry
    };
  }
}

module.exports = BatchScheduler;
