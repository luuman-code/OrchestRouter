/**
 * LoadAwareScheduler - 负载感知的任务调度器
 *
 * 基于负载感知的智能调度算法，与模型选择器协同工作，
 * 实现全局最优的资源利用和智能处理模型负载变化
 *
 * @class LoadAwareScheduler
 */
class LoadAwareScheduler {
  /**
   * 创建负载感知调度器
   * @param {ConcurrencyController} concurrencyController - 并发控制器实例
   * @param {PerformanceHistory} performanceHistory - 性能历史记录器实例
   */
  constructor(concurrencyController, performanceHistory = null) {
    this.concurrencyController = concurrencyController;
    this.performanceHistory = performanceHistory;
  }

  /**
   * 根据负载情况调度任务（基础版本）
   *
   * 【修改】严格按照选择器排序顺序，结合负载情况选择模型
   * 注意：此方法已被 adaptiveSchedule 取代，不再被调用，但保留以防万一
   *
   * @param {string} preferredModelId - 首选模型 ID
   * @param {Array} alternatives - 备选模型列表
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 调度选项
   * @returns {Promise<any>} 任务执行结果
   */
  async scheduleTask(preferredModelId, alternatives, taskFunction, options = {}) {
    const {
      timeoutMs = 60000,
      fallbackStrategy = 'wait',
      priority = 'normal'
    } = options;

    // 过滤可用的备选模型
    const availableAlternatives = this.filterAvailableAlternatives(alternatives);

    // 【修改】按选择器排序顺序遍历所有模型
    const allCandidates = [preferredModelId, ...availableAlternatives];
    console.log(`[scheduleTask] 按排序顺序遍历 ${allCandidates.length} 个模型`);

    for (let i = 0; i < allCandidates.length; i++) {
      const modelData = allCandidates[i];
      const modelId = typeof modelData === 'string' ? modelData : (modelData.modelId || modelData.model);
      if (!modelId) continue;

      const isPreferred = i === 0;
      console.log(`[scheduleTask] 检查 ${isPreferred ? '首选' : '备选'}模型 ${modelId} (排序 ${i + 1})`);

      try {
        // 1. 检查负载情况
        const loadInfo = await this.concurrencyController.getLoadInfo(modelId);

        // 2. 负载超过阈值则跳过
        const LOAD_THRESHOLD = 0.9;
        if (loadInfo.loadScore > LOAD_THRESHOLD) {
          console.log(`[scheduleTask]   模型 ${modelId} 负载过高 (${loadInfo.loadScore.toFixed(2)} > ${LOAD_THRESHOLD})，跳过`);
          continue;
        }

        // 3. 尝试获取槽位（原子操作，同时完成负载检查和槽位获取）
        const slotResult = await this.concurrencyController.tryAcquireSlot(modelId);

        if (slotResult) {
          // 成功获取槽位，直接执行业务逻辑
          // 注意：不调用 executeOnModel，因为槽位已经在这里获取了
          console.log(`[scheduleTask] ✓ 选择模型 ${modelId} (负载: ${loadInfo.loadScore.toFixed(2)})`);
          try {
            return await taskFunction(modelId);
          } finally {
            await this.concurrencyController.releaseSlot(modelId);
          }
        } else {
          console.log(`[scheduleTask]   模型 ${modelId} 无法获取槽位 (已满载)，继续检查下一个`);
          continue;
        }
      } catch (error) {
        console.warn(`[scheduleTask]   模型 ${modelId} 检查失败: ${error.message}，继续检查下一个`);
        continue;
      }
    }

    // 【修改】所有模型都无法使用，返回错误
    const errorMsg = `[scheduleTask] 所有候选模型都不可用或无法获取槽位`;
    console.error(errorMsg);
    return {
      success: false,
      error: errorMsg,
      errorCode: 'NO_AVAILABLE_MODEL'
    };
  }

  /**
   * 过滤可用的备选模型
   * @param {Array} alternatives - 备选模型列表
   * @returns {Array} 可用的备选模型
   */
  filterAvailableAlternatives(alternatives = []) {
    return alternatives.filter(alt => {
      const modelId = alt.modelId || alt.model;
      return modelId && typeof modelId === 'string';
    });
  }

  /**
   * 在指定模型上执行任务
   * @param {string} modelId - 模型 ID
   * @param {Function} taskFunction - 任务执行函数
   * @param {number} timeoutMs - 超时时间
   * @param {Object} options - 执行选项
   * @returns {Promise<any>} 执行结果
   */
  async executeOnModel(modelId, taskFunction, timeoutMs, options = {}) {
    const { fallbackStrategy = 'wait' } = options;
    let slotAcquired = false;

    try {
      // 尝试立即获取槽位
      const tryAcquireResult = await this.concurrencyController.tryAcquireSlot(modelId);

      if (tryAcquireResult) {
        slotAcquired = true;
        // 将 modelId 传递给 taskFunction，确保使用正确的模型
        return await taskFunction(modelId);
      }

      // 如果无法立即获取槽位，根据策略处理
      if (fallbackStrategy === 'wait') {
        await this.concurrencyController.acquireSlot(modelId, timeoutMs);
        slotAcquired = true;
        // 将 modelId 传递给 taskFunction，确保使用正确的模型
        return await taskFunction(modelId);
      } else {
        throw new Error(`Model ${modelId} is at max capacity`);
      }
    } catch (error) {
      console.warn(`Failed to execute on model ${modelId}: ${error.message}`);
      throw error;
    } finally {
      // 确保槽位被正确释放
      if (slotAcquired) {
        try {
          await this.concurrencyController.releaseSlot(modelId);
        } catch (releaseError) {
          console.error(`释放槽位失败 modelId=${modelId}: ${releaseError.message}`);
        }
      }
    }
  }

  /**
   * 基于历史性能数据的自适应调度
   *
   * 【修改】严格按照选择器排序顺序，结合负载情况选择模型
   * 逻辑：
   *   1. 按选择器排序顺序遍历所有模型
   *   2. 对每个模型检查负载情况（能否获取槽位）
   *   3. 负载允许则选择该模型；不允许则继续往下遍历
   *   4. 所有模型都无法使用则任务失败
   *
   * @param {string} preferredModelId - 首选模型 ID
   * @param {Array} alternatives - 备选模型列表（已按选择器排序）
   * @param {Function} taskFunction - 任务执行函数
   * @param {Object} options - 调度选项
   * @returns {Promise<any>} 任务执行结果
   */
  async adaptiveSchedule(preferredModelId, alternatives, taskFunction, options = {}) {
    const {
      timeoutMs = 60000,
      taskType = 'general',
      historicalData = {}
    } = options;

    // 如果有性能历史记录器，使用智能调度
    if (this.performanceHistory) {
      return await this._intelligentAdaptiveSchedule(
        preferredModelId,
        alternatives,
        taskFunction,
        { timeoutMs, taskType, ...options }
      );
    }

    // 【修改】不再重新排序，直接保持 ModelSelector 的排序顺序
    // 只有在 ModelSelector 没有返回排序时，才使用简单的过滤
    const filteredAlternatives = alternatives.filter(alt => {
      const modelId = typeof alt === 'string' ? alt : (alt.modelId || alt.model);
      return !!modelId;
    });

    // 【修改】按选择器排序顺序遍历所有模型，结合负载情况选择
    const allCandidates = [preferredModelId, ...filteredAlternatives];
    console.log(`[LoadAwareScheduler] 按选择器排序顺序遍历 ${allCandidates.length} 个模型`);

    for (let i = 0; i < allCandidates.length; i++) {
      const modelData = allCandidates[i];
      const modelId = typeof modelData === 'string' ? modelData : (modelData.modelId || modelData.model);

      if (!modelId) {
        continue;
      }

      const isPreferred = i === 0;
      console.log(`[LoadAwareScheduler] 检查 ${isPreferred ? '首选' : '备选'}模型 ${modelId} (排序 ${i + 1})`);

      try {
        // 1. 检查负载情况
        const loadInfo = await this.concurrencyController.getLoadInfo(modelId);

        // 2. 负载超过阈值则跳过，继续检查下一个
        const LOAD_THRESHOLD = 0.9;
        if (loadInfo.loadScore > LOAD_THRESHOLD) {
          console.log(`[LoadAwareScheduler]   模型 ${modelId} 负载过高 (${loadInfo.loadScore.toFixed(2)} > ${LOAD_THRESHOLD})，跳过`);
          continue;
        }

        // 3. 尝试获取槽位（原子操作，同时完成负载检查和槽位获取）
        const slotResult = await this.concurrencyController.tryAcquireSlot(modelId);

        if (slotResult) {
          // 成功获取槽位，直接执行业务逻辑
          // 注意：不调用 executeOnModel，因为槽位已经在这里获取了
          console.log(`[LoadAwareScheduler] ✓ 选择模型 ${modelId} (负载: ${loadInfo.loadScore.toFixed(2)})`);
          try {
            return await taskFunction(modelId);
          } finally {
            await this.concurrencyController.releaseSlot(modelId);
          }
        } else {
          // 获取槽位失败（模型已满载），继续检查下一个
          console.log(`[LoadAwareScheduler]   模型 ${modelId} 无法获取槽位 (已满载)，继续检查下一个`);
          continue;
        }
      } catch (error) {
        console.warn(`[LoadAwareScheduler]   模型 ${modelId} 检查失败: ${error.message}，继续检查下一个`);
        continue;
      }
    }

    // 【修改】所有模型都无法使用，返回错误而不是回退
    const errorMsg = `[LoadAwareScheduler] 所有候选模型都不可用或无法获取槽位，任务执行失败`;
    console.error(errorMsg);
    return {
      success: false,
      error: errorMsg,
      errorCode: 'NO_AVAILABLE_MODEL'
    };
  }

  /**
   * 智能自适应调度（使用性能历史记录）
   *
   * 【修改】严格按照选择器排序顺序，结合负载情况选择模型
   * 逻辑：
   *   1. 按选择器排序顺序遍历所有模型（不依赖性能历史重新排序）
   *   2. 对每个模型检查负载情况（能否获取槽位）
   *   3. 负载允许则选择该模型；不允许则继续往下遍历
   *   4. 所有模型都无法使用则任务失败
   *
   * @private
   */
  async _intelligentAdaptiveSchedule(preferredModelId, alternatives, taskFunction, options = {}) {
    const {
      timeoutMs = 60000,
      taskType = 'general'
    } = options;

    // 【修改】保持 ModelSelector 的排序顺序，不依赖性能历史重新排序
    // 构建候选模型列表
    const allCandidates = [preferredModelId];
    const seen = new Set([preferredModelId]);

    for (const alt of alternatives) {
      const modelId = typeof alt === 'string' ? alt : (alt.modelId || alt.model);
      if (modelId && !seen.has(modelId)) {
        allCandidates.push(modelId);
        seen.add(modelId);
      }
    }

    console.log(`[_intelligentAdaptiveSchedule] 按选择器排序顺序遍历 ${allCandidates.length} 个模型`);

    // 【修改】按选择器排序顺序遍历，结合负载情况选择
    for (let i = 0; i < allCandidates.length; i++) {
      const modelId = allCandidates[i];
      const isPreferred = i === 0;

      console.log(`[LoadAwareScheduler] 检查 ${isPreferred ? '首选' : '备选'}模型 ${modelId} (排序 ${i + 1})`);

      try {
        // 1. 检查负载情况
        const loadInfo = await this.concurrencyController.getLoadInfo(modelId);

        // 2. 负载超过阈值则跳过
        const LOAD_THRESHOLD = 0.9;
        if (loadInfo.loadScore > LOAD_THRESHOLD) {
          console.log(`[LoadAwareScheduler]   模型 ${modelId} 负载过高 (${loadInfo.loadScore.toFixed(2)} > ${LOAD_THRESHOLD})，跳过`);
          continue;
        }

        // 3. 尝试获取槽位（原子操作，同时完成负载检查和槽位获取）
        const slotResult = await this.concurrencyController.tryAcquireSlot(modelId);

        if (slotResult) {
          // 成功获取槽位，直接执行业务逻辑
          // 注意：不调用 executeOnModel，因为槽位已经在这里获取了
          console.log(`[LoadAwareScheduler] ✓ 选择模型 ${modelId} (负载: ${loadInfo.loadScore.toFixed(2)})`);
          try {
            return await taskFunction(modelId);
          } finally {
            await this.concurrencyController.releaseSlot(modelId);
          }
        } else {
          // 获取槽位失败（模型已满载），继续检查下一个
          console.log(`[LoadAwareScheduler]   模型 ${modelId} 无法获取槽位 (已满载)，继续检查下一个`);
          continue;
        }
      } catch (error) {
        console.warn(`[LoadAwareScheduler]   模型 ${modelId} 检查失败: ${error.message}，继续检查下一个`);
        continue;
      }
    }

    // 【修改】所有模型都无法使用，返回错误而不是回退
    const errorMsg = `[_intelligentAdaptiveSchedule] 所有候选模型都不可用或无法获取槽位，任务执行失败`;
    console.error(errorMsg);
    return {
      success: false,
      error: errorMsg,
      errorCode: 'NO_AVAILABLE_MODEL'
    };
  }

  /**
   * 根据历史性能数据对备选模型进行排序
   * @param {string} preferredModelId - 首选模型 ID
   * @param {Array} alternatives - 备选模型列表
   * @param {string} taskType - 任务类型
   * @param {Object} historicalData - 历史性能数据
   * @returns {Array} 排序后的备选模型
   */
  rankAlternativesByHistoricalPerformance(preferredModelId, alternatives, taskType, historicalData) {
    const allModels = [preferredModelId, ...alternatives];

    return allModels.sort((a, b) => {
      const modelA = typeof a === 'string' ? a : (a.modelId || a.model);
      const modelB = typeof b === 'string' ? b : (b.modelId || b.model);

      // 从历史数据获取性能指标
      const perfA = historicalData[`${modelA}_${taskType}`] || {};
      const perfB = historicalData[`${modelB}_${taskType}`] || {};

      // 首先按成功率排序（如果有数据）
      if (perfA.successRate !== undefined && perfB.successRate !== undefined) {
        if (perfA.successRate !== perfB.successRate) {
          return perfB.successRate - perfA.successRate; // 高成功率优先
        }
      }

      // 然后按平均响应时间排序（如果有数据）
      if (perfA.avgResponseTime !== undefined && perfB.avgResponseTime !== undefined) {
        return perfA.avgResponseTime - perfB.avgResponseTime; // 响应更快优先
      }

      // 最后按成本排序（如果可用）
      if (perfA.cost !== undefined && perfB.cost !== undefined) {
        return perfA.cost - perfB.cost; // 成本更低优先
      }

      // 如果没有历史数据，使用默认排序
      return 0;
    });
  }

  /**
   * 判断是否应该使用某个模型执行特定任务
   * @param {string} modelId - 模型 ID
   * @param {Object} loadInfo - 负载信息
   * @param {string} taskType - 任务类型
   * @param {Object} historicalData - 历史性能数据
   * @returns {boolean} 是否应该使用该模型
   */
  shouldUseModelForTask(modelId, loadInfo, taskType, historicalData) {
    // 基础负载判断
    if (loadInfo.loadScore > 0.9) {
      return false; // 负载过高，不使用
    }

    // 根据任务类型判断
    const modelCapabilities = historicalData[`${modelId}_capabilities`] || {};
    if (modelCapabilities[taskType] === false) {
      return false; // 模型不支持此任务类型
    }

    // 考虑负载均衡
    if (loadInfo.loadScore > 0.7 && taskType !== 'urgent') {
      // 高负载时，除非是紧急任务，否则寻找其他模型
      return false;
    }

    return true;
  }

  /**
   * 【新增 2026-03-29】带负载检查的槽位获取（实时负载验证）
   * 在等待槽位过程中定期检查负载变化，避免选择结果过时
   *
   * @param {string} modelId - 模型 ID
   * @param {Object} originalLoadInfo - 原始负载信息
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<Object>} 获取结果
   */
  async acquireSlotWithLoadCheck(modelId, originalLoadInfo, timeoutMs = 60000) {
    const startTime = Date.now();
    const LOAD_CHECK_INTERVAL = 2000; // 每 2 秒检查一次负载
    const LOAD_CHANGE_THRESHOLD = 0.3; // 负载变化超过 30% 考虑切换

    while (Date.now() - startTime < timeoutMs) {
      // 尝试获取槽位
      const slot = await this.concurrencyController.tryAcquireSlot(modelId);

      if (slot) {
        return { success: true, model: modelId, slot };
      }

      // 检查负载变化
      const currentLoad = await this.concurrencyController.getLoadInfo(modelId);
      const originalLoad = originalLoadInfo?.loadScore || currentLoad.loadScore;
      const loadChange = Math.abs(currentLoad.loadScore - originalLoad);

      if (loadChange > LOAD_CHANGE_THRESHOLD) {
        console.warn(`负载变化过大 (${originalLoad} -> ${currentLoad.loadScore})，考虑切换模型`);
        return { success: false, reason: 'load_changed', currentLoad: currentLoad.loadScore };
      }

      // 等待一段时间
      await new Promise(resolve => setTimeout(resolve, LOAD_CHECK_INTERVAL));
    }

    throw new Error(`Timeout waiting for slot of model ${modelId}`);
  }

  /**
   * 【新增 2026-03-29】执行带模型切换的任务
   * 当主选模型负载变化时，尝试切换到备选模型
   *
   * @param {Object} executionRequest - 执行请求对象
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithModelSwitching(executionRequest) {
    const { modelId, alternatives, loadInfo, taskFunction, timeoutMs } = executionRequest;

    // 尝试在主选模型上执行
    const result = await this.acquireSlotWithLoadCheck(modelId, loadInfo, timeoutMs);

    if (result.success) {
      return await this.executeOnModel(modelId, taskFunction, timeoutMs);
    }

    // 主选模型失败，检查备选模型
    if (result.reason === 'load_changed' && alternatives && alternatives.length > 0) {
      for (const alt of alternatives) {
        const altModelId = alt.modelId || alt.model;
        if (!altModelId) continue;

        const altLoad = await this.concurrencyController.getLoadInfo(altModelId);
        if (altLoad.loadScore < result.currentLoad) {
          console.log(`切换到负载更低的备选模型：${altModelId}, 负载：${altLoad.loadScore}`);
          return await this.executeOnModel(altModelId, taskFunction, timeoutMs);
        }
      }
    }

    // 没有合适的备选模型，返回错误
    return {
      success: false,
      error: `无法获取模型槽位：${modelId}, 当前负载：${result.currentLoad}`
    };
  }

  /**
   * 【新增 2026-03-29】使用备选模型执行
   * 按负载和成本综合排序备选模型，依次尝试执行
   *
   * @param {Object} executionRequest - 执行请求对象
   * @param {Array} alternatives - 备选模型列表
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithAlternativeModels(executionRequest, alternatives = []) {
    const { modelId, loadInfo, taskFunction, timeoutMs } = executionRequest;

    // 预先获取所有备选模型的负载信息
    const alternativeLoadInfos = await Promise.all(
      alternatives.map(async (alt) => {
        const modelId = alt.modelId || alt.model;
        const loadInfo = await this.concurrencyController.getLoadInfo(modelId);
        return {
          ...alt,
          currentLoad: alt.currentLoad || loadInfo.loadScore,
          loadInfo: loadInfo
        };
      })
    );

    // 按负载和成本综合排序备选模型
    const sortedAlternatives = alternativeLoadInfos.sort((a, b) => {
      const loadScoreA = a.currentLoad;
      const loadScoreB = b.currentLoad;

      // 如果负载差异不大，则考虑成本
      if (Math.abs(loadScoreA - loadScoreB) < 0.1) {
        return (a.cost?.total || Infinity) - (b.cost?.total || Infinity);
      }

      return loadScoreA - loadScoreB;
    });

    // 尝试每个备选模型
    for (const alternative of sortedAlternatives) {
      try {
        const altModelId = alternative.modelId || alternative.model;
        console.log(`尝试备选模型：${altModelId}, 负载：${alternative.currentLoad || 'unknown'}`);

        const altResult = await this.acquireSlotWithAtomicCheck(
          altModelId,
          { loadScore: alternative.currentLoad }
        );

        if (altResult.success) {
          return await this.executeOnModel(altModelId, taskFunction, timeoutMs, {
            originalModel: modelId
          });
        }
      } catch (error) {
        console.warn(`备选模型 ${alternative.modelId || alternative.model} 不可用：${error.message}`);
        continue;
      }
    }

    // 所有模型都不可用，返回错误
    return {
      success: false,
      error: `所有可用模型都不可用：原始模型 ${modelId} 和 ${alternatives.length} 个备选模型`,
      originalError: `主选模型 ${modelId} 负载过高`
    };
  }

  /**
   * 【新增 2026-03-29】带实时验证的执行
   * 在获取槽位后再次验证负载状态，确保数据未过时
   *
   * @param {Object} executionRequest - 执行请求对象
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithRealTimeValidation(executionRequest) {
    const { modelId, alternatives, loadInfo, taskFunction, timeoutMs } = executionRequest;

    try {
      // 1. 获取槽位，同时获取最新的负载快照
      const slotResult = await this.acquireSlotWithAtomicCheck(modelId, loadInfo, timeoutMs);

      if (slotResult.success) {
        // 2. 在实际执行前再次验证负载状态（快速检查）
        const verificationLoad = await this.concurrencyController.getLoadInfo(modelId);
        const loadDrift = Math.abs(verificationLoad.loadScore - slotResult.snapshot.loadScore);

        if (loadDrift > 0.1) { // 负载变化超过 10%，认为过时
          console.warn(`负载变化超过阈值，释放槽位并重新评估：${slotResult.snapshot.loadScore} -> ${verificationLoad.loadScore}`);

          // 释放刚刚获取的槽位
          await this.concurrencyController.releaseSlot(modelId);

          // 尝试切换到更适合的模型
          return await this.executeWithModelSwitching({
            ...executionRequest,
            loadInfo: { ...loadInfo, loadScore: verificationLoad.loadScore }
          });
        }

        // 3. 执行实际的模型调用
        return await this.executeOnModel(modelId, taskFunction, timeoutMs, {
          loadSnapshot: slotResult.snapshot
        });
      }
    } catch (error) {
      console.error(`执行过程中出错：${error.message}`);

      // 确保槽位被正确释放
      try {
        await this.concurrencyController.releaseSlot(modelId);
      } catch (releaseError) {
        console.error(`释放槽位时出错：${releaseError.message}`);
      }

      // 尝试使用备选模型
      return await this.executeWithAlternativeModels(executionRequest, alternatives);
    }
  }

  /**
   * 【新增 2026-03-29】带原子性检查的槽位获取
   * 确保负载检查和槽位获取在同一原子操作中完成
   *
   * @param {string} modelId - 模型 ID
   * @param {Object} originalLoadInfo - 原始负载信息
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<Object>} 获取结果
   */
  async acquireSlotWithAtomicCheck(modelId, originalLoadInfo, timeoutMs = 60000) {
    const startTime = Date.now();
    const MAX_RETRY_COUNT = 3;
    let retryCount = 0;

    while (Date.now() - startTime < timeoutMs && retryCount < MAX_RETRY_COUNT) {
      // 获取模型锁以确保操作的原子性
      const modelLock = this.concurrencyController.sharedManager.getModelLock(modelId);

      let updateSucceeded = false;
      let slotToRelease = null;

      const result = await modelLock.acquire(async () => {
        // 在锁保护下同时检查负载和获取槽位
        const currentLoad = await this.concurrencyController.sharedManager.getLoadScore(modelId);
        const maxConcurrency = await this.concurrencyController.sharedManager.getMaxConcurrency(modelId);
        const currentUsage = await this.concurrencyController.sharedManager.getCurrentUsage(modelId);

        // 检查负载变化是否超过阈值
        const originalLoad = originalLoadInfo?.loadScore || currentLoad;
        const loadChange = Math.abs(currentLoad - originalLoad);
        const LOAD_CHANGE_THRESHOLD = 0.3;

        if (loadChange > LOAD_CHANGE_THRESHOLD) {
          console.warn(`负载变化过大 (${originalLoad} -> ${currentLoad})，重试获取槽位`);
          return { success: false, reason: 'load_changed', currentLoad, retry: true };
        }

        // 在同一原子操作中检查并发限制和获取槽位
        if (currentUsage < maxConcurrency) {
          try {
            // 【修复 P4】先更新，记录成功状态
            await this.concurrencyController.sharedManager.updateCurrentUsage(modelId, currentUsage + 1);
            updateSucceeded = true;
            slotToRelease = modelId;  // 记录需要释放的槽位
            return {
              success: true,
              model: modelId,
              acquiredAt: Date.now(),
              snapshot: { loadScore: currentLoad, currentUsage: currentUsage + 1 }
            };
          } catch (error) {
            // 【修复 P4】如果更新失败，标记失败并重试
            console.error(`更新槽位失败: ${error.message}`);
            return { success: false, reason: 'update_failed', currentLoad, retry: true };
          }
        }

        return { success: false, reason: 'concurrency_limit', currentLoad, retry: true };
      });

      // 【修复 P4】如果 callback 成功但状态更新失败，需要释放已增加的槽位
      if (result.success && !updateSucceeded && slotToRelease) {
        console.warn(`[LoadAwareScheduler] 检测到槽位泄露，执行回滚`);
        try {
          const currentUsage = await this.concurrencyController.sharedManager.getCurrentUsage(modelId);
          await this.concurrencyController.sharedManager.updateCurrentUsage(modelId, Math.max(0, currentUsage - 1));
        } catch (rollbackError) {
          console.error(`[LoadAwareScheduler] 回滚失败: ${rollbackError.message}`);
        }
      }

      if (result.success && updateSucceeded) {
        return result;
      }

      if (result.retry) {
        retryCount++;
        // 指数退避延迟
        await new Promise(resolve =>
          setTimeout(resolve, Math.min(100 * Math.pow(2, retryCount), 1000))
        );
      } else {
        break; // 不需要重试，直接退出
      }
    }

    throw new Error(`Timeout or max retries exceeded waiting for slot of model ${modelId}`);
  }
}

module.exports = LoadAwareScheduler;