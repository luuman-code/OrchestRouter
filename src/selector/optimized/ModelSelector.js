/**
 * ModelSelector - 模型选择器主类（优化版）
 *
 * 采用策略模式重构，降低各功能模块间的耦合
 * 功能块：
 *   A: ModelRegistry - 模型注册与管理层
 *   B: SelectionConfigManager - 配置与策略层
 *   C: RuleBasedEngine - 规则引擎层
 *   D: CostController - 成本控制与监控层
 *   E: ModelStatusMonitor - 状态监控与降级层
 *   F: LearningEngine - 学习引擎层（可选）
 */
const ModelRegistry = require('../registry/ModelRegistry');
const SelectionConfigManager = require('../config/SelectionConfigManager');
const RuleBasedEngine = require('../strategies/RuleBasedEngine');
const LearningEngine = require('../strategies/LearningEngine');
const StrategyCombiner = require('../strategies/StrategyCombiner');
const CostController = require('../core/CostController');
const ModelStatusMonitor = require('../monitor/ModelStatusMonitor');

class ModelSelector {
  constructor(config = {}) {
    console.log('[ModelSelector] 初始化模型选择器（优化版）...');

    // 功能块 B: 配置与策略层
    this.configManager = new SelectionConfigManager(config);

    // 功能块 A: 模型注册与管理层
    this.modelRegistry = new ModelRegistry(config);

    // 功能块 C: 规则引擎层（取代原来的ModelEvaluator）
    this.ruleEngine = new RuleBasedEngine(this.modelRegistry, this.configManager);

    // 功能块 D: 成本控制与监控层
    const initialBudget = this.configManager.getConstraint('dailyBudget', 10.00);
    this.costController = new CostController(initialBudget);

    // 功能块 E: 状态监控与降级层
    this.statusMonitor = new ModelStatusMonitor({
      errorRateThreshold: this.configManager.getFallbackStrategy('errorRateThreshold'),
      latencyThresholdMs: this.configManager.getFallbackStrategy('latencyThresholdMs'),
      rateLimitThreshold: this.configManager.getFallbackStrategy('rateLimitThreshold')
    });

    // 策略组合器
    this.strategyCombiner = new StrategyCombiner(this.modelRegistry);

    // 功能块 F: 学习引擎层（可选）
    const learningConfig = this.configManager.getStrategyConfig();
    if (learningConfig.enableLearning) {
      // 从配置中提取持久化相关设置
      const persistenceConfig = {
        persistenceType: learningConfig.persistenceType || 'file',
        persistencePath: learningConfig.persistencePath || './learning-data.json',
        redisConfig: learningConfig.redisConfig || null,
        dbConfig: learningConfig.dbConfig || null,
        syncInterval: learningConfig.syncInterval || 30000,
        learningWindow: learningConfig.learningWindow,
        enabled: learningConfig.enableLearning,
        learning_integration: learningConfig.learning_integration  // 传递融合策略配置
      };

      this.learningEngine = new LearningEngine(persistenceConfig);
      console.log('[ModelSelector] 学习引擎已启用，持久化类型：' + persistenceConfig.persistenceType);
    }

    console.log('[ModelSelector] 初始化完成（优化版）');
  }

  /**
   * 为单个子任务选择模型
   * @param {Object} subtask - 子任务对象
   * @param {Object} additionalConstraints - 额外约束条件
   * @returns {Object} 模型选择结果
   */
  select(subtask, additionalConstraints = {}) {
    // 【修复】支持 types 数组（多标签），同时保持对 type 单值的向后兼容
    const types = subtask.types || [];
    const taskType = types.length > 0 ? types[0].type : (subtask.type || 'general');
    const taskId = subtask.id || `task_${Date.now()}`;

    console.log(`[ModelSelector] 开始为任务 "${taskId}" (类型：${taskType}, 多标签: ${types.map(t => t.type).join(', ')}) 选择模型...`);

    // 步骤 1: 规则引擎评估 - 获取基于规则的选择
    const ruleBasedEvaluation = this.ruleEngine.selectBestModel(subtask);

    // 获取配置中的集成策略
    const integrationConfig = this.configManager.getStrategyConfig().learning_integration || {};
    const strategy = integrationConfig.strategy || 'hybrid';

    // 步骤 2: 如果启用了学习功能，考虑历史表现
    let learningRecommendation = null;
    if (this.learningEngine && strategy !== 'rule_priority') { // 如果是规则优先，则不查询学习推荐
      learningRecommendation = this.learningEngine.getBestModelForType(
        taskType,
        'bayesian-weighted'
      );

      // 检查学习器置信度
      if (learningRecommendation) {
        const confidence = this.learningEngine.getModelRecommendationConfidence(
          taskType,
          learningRecommendation
        );

        const minConfidence = integrationConfig.min_learning_confidence || 0.7;
        if (confidence < minConfidence) {
          learningRecommendation = null; // 置信度过低，忽略学习推荐
        }
      }
    }

    // 步骤 3: 根据融合策略合并规则和学习结果
    let evaluation;

    if (this.learningEngine && strategy !== 'disabled') {
      evaluation = this.strategyCombiner.merge(
        ruleBasedEvaluation,
        learningRecommendation,
        subtask,
        integrationConfig
      );
    } else {
      // 如果未启用学习或禁用融合，则仅使用规则评估
      evaluation = ruleBasedEvaluation;
    }

    // 步骤 4: 成本验证（功能块 D）
    if (!this.costController.canAllocate(evaluation.cost)) {
      console.warn(`[ModelSelector] 预算不足：需要 $${evaluation.cost.total.toFixed(6)}, 剩余 $${this.costController.getRemainingBudget().toFixed(2)}`);

      // 寻找成本更低的替代模型
      const cheaperAlternatives = this.findCheaperAlternatives(
        evaluation.modelId,
        this.getAllAlternativeModels(evaluation.modelId, taskType),
        evaluation.cost.total
      );

      if (cheaperAlternatives.length > 0) {
        const bestAlternative = cheaperAlternatives[0];
        console.log(`[ModelSelector] 选择更经济的替代方案：${bestAlternative.modelId}`);

        return this.createSelectionResult(
          taskId,
          bestAlternative.modelId,
          `预算不足，选择更经济的替代方案：${bestAlternative.reason}`,
          bestAlternative.cost,
          this.estimateTokenUsage(subtask),
          cheaperAlternatives.map(a => a.modelId),
          evaluation.modelId
        );
      } else {
        console.warn('[ModelSelector] 没有成本更低的替代方案，继续使用原选择但请注意预算');
      }
    }

    // 步骤 5: 状态检查（功能块 E）
    const usability = this.statusMonitor.isModelUsable(
      evaluation.modelId,
      this.configManager.getFallbackStrategy()
    );

    if (!usability.usable) {
      console.warn(`[ModelSelector] 模型 ${evaluation.modelId} 不可用：${usability.reason}`);

      // 使用备选模型
      const availableAlternatives = this.findAvailableAlternatives(
        this.getAllAlternativeModels(evaluation.modelId, taskType)
      );

      if (availableAlternatives.length > 0) {
        const bestAlternative = availableAlternatives[0];
        console.log(`[ModelSelector] 主选模型不可用，使用替代方案：${bestAlternative.modelId}`);

        return this.createSelectionResult(
          taskId,
          bestAlternative.modelId,
          `主选模型不可用：${usability.reason}, 使用替代方案`,
          bestAlternative.cost,
          this.estimateTokenUsage(subtask),
          availableAlternatives.map(a => a.modelId),
          evaluation.modelId
        );
      } else {
        console.warn('[ModelSelector] 所有备选模型均不可用，使用原选择但需注意');
      }
    }

    // 返回最终选择
    const result = this.createSelectionResult(
      taskId,
      evaluation.modelId,
      evaluation.reason,
      evaluation.cost,
      this.estimateTokenUsage(subtask),
      this.getAllAlternativeModels(evaluation.modelId, taskType).map(a => a.modelId),
      null // original_choice 为 null 表示没有降级
    );

    // 记录选择原因（如果配置启用）
    if (this.configManager.getMonitoringConfig('logSelectionReason')) {
      console.log(`[ModelSelector] 最终选择：${result.selected_model}, 原因：${result.reason}`);
    }

    return result;
  }

  /**
   * 获取所有替代模型
   */
  getAllAlternativeModels(currentModelId, taskType) {
    // 获取当前模型
    const currentModel = this.modelRegistry.getModel(currentModelId);

    // 获取该任务类型的规则
    const rules = this.configManager.getRulesForTaskType(taskType);

    if (rules.length > 0) {
      // 使用规则中的备选模型
      const rule = rules[0];
      const allPreferred = rule.preferredModels || [];
      const allFallback = rule.fallbackModels || [];

      // 合并所有模型ID并去重
      const allModelIds = [...new Set([...allPreferred, ...allFallback])];

      return allModelIds
        .filter(id => id !== currentModelId)
        .map(id => {
          const model = this.modelRegistry.getModel(id);
          return {
            modelId: id,
            model: model,
            cost: this.estimateModelCost(model),
            reason: `规则备选模型`
          };
        })
        .filter(item => item.model && item.model.status === 'available');
    } else {
      // 如果没有规则，返回所有可用模型（排除当前模型）
      return this.modelRegistry.getAvailableModels()
        .filter(model => model.id !== currentModelId)
        .map(model => ({
          modelId: model.id,
          model: model,
          cost: this.estimateModelCost(model),
          reason: `可用模型`
        }));
    }
  }

  /**
   * 估算模型成本
   */
  estimateModelCost(model) {
    const defaultTokenEstimate = { input: 500, output: 1200 };
    const inputCost = (defaultTokenEstimate.input / 1000) * model.pricing.input;
    const outputCost = (defaultTokenEstimate.output / 1000) * model.pricing.output;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
      isLocal: model.type === 'local'
    };
  }

  /**
   * 估算Token使用量
   */
  estimateTokenUsage(subtask) {
    // 基于任务描述长度估算
    const description = subtask.description || '';
    const baseInputTokens = 500;
    const baseOutputTokens = 1200;

    // 根据描述长度调整
    const lengthMultiplier = Math.max(0.5, Math.min(2.0, description.length / 1000));

    return {
      input: Math.round(baseInputTokens * lengthMultiplier),
      output: Math.round(baseOutputTokens * lengthMultiplier),
      total: Math.round((baseInputTokens + baseOutputTokens) * lengthMultiplier)
    };
  }

  /**
   * 寻找成本更低的替代模型
   * @private
   */
  findCheaperAlternatives(currentModelId, alternatives, maxCost) {
    return alternatives
      .filter(alt => alt.cost && alt.cost.total < maxCost)
      .sort((a, b) => a.cost.total - b.cost.total);
  }

  /**
   * 寻找可用的替代模型
   * @private
   */
  findAvailableAlternatives(alternatives) {
    return alternatives
      .map(alt => {
        if (!alt.modelId) return null;

        const usability = this.statusMonitor.isModelUsable(
          alt.modelId,
          this.configManager.getFallbackStrategy()
        );
        return { ...alt, usable: usability.usable, reason: usability.reason };
      })
      .filter(alt => alt && alt.usable);
  }

  /**
   * 创建选择结果对象
   * @private
   */
  createSelectionResult(taskId, modelId, reason, cost, tokenEstimate, alternatives, originalChoice) {
    return {
      task_id: taskId,
      selected_model: modelId,
      reason: reason,
      estimated_cost: cost.total,
      estimated_tokens: tokenEstimate,
      alternatives: alternatives,
      cost_breakdown: cost,
      original_choice: originalChoice,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 批量选择模型
   * @param {Array} subtasks - 子任务列表
   * @returns {Array} 模型选择结果列表
   */
  batchSelect(subtasks) {
    console.log(`[ModelSelector] 批量选择 ${subtasks.length} 个任务的模型...`);
    return subtasks.map(subtask => this.select(subtask));
  }

  /**
   * 记录任务完成反馈（用于学习型选择）
   * @param {string} taskId - 任务 ID
   * @param {string} modelId - 使用的模型 ID
   * @param {number} qualityScore - 质量评分 (0-10)
   * @param {Object} additionalMetrics - 额外指标
   */
  recordFeedback(taskId, modelId, qualityScore, additionalMetrics = {}) {
    if (!this.learningEngine) {
      console.warn('[ModelSelector] 学习功能未启用，无法记录反馈');
      return;
    }

    // 确定任务类型，如果没有提供则使用默认值
    const taskType = (additionalMetrics && additionalMetrics.subtask && additionalMetrics.subtask.type) || 'general';

    this.learningEngine.recordFeedback(taskId, taskType, modelId, qualityScore, additionalMetrics);

    console.log(`[ModelSelector] 已记录任务 ${taskId} 的反馈：模型 ${modelId}, 评分 ${qualityScore}`);
  }

  /**
   * 更新预算
   * @param {number} newBudget - 新预算金额
   */
  updateBudget(newBudget) {
    this.costController.resetBudget(newBudget);
  }

  /**
   * 获取当前预算状态
   * @returns {Object} 预算状态
   */
  getBudgetStatus() {
    return this.costController.getStatistics();
  }

  /**
   * 获取模型状态
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型状态
   */
  getModelStatus(modelId) {
    return this.statusMonitor.getModelStatus(modelId);
  }

  /**
   * 更新模型状态
   * @param {string} modelId - 模型 ID
   * @param {Object} statusUpdate - 状态更新
   */
  updateModelStatus(modelId, statusUpdate) {
    this.statusMonitor.updateStatus(modelId, statusUpdate);
  }

  /**
   * 记录请求结果（用于性能跟踪）
   * @param {string} modelId - 模型 ID
   * @param {boolean} success - 是否成功
   * @param {number} latencyMs - 延迟（毫秒）
   */
  recordRequestResult(modelId, success, latencyMs = 0) {
    this.statusMonitor.recordRequest(modelId, success, latencyMs);
  }

  /**
   * 获取所有可用模型
   * @returns {Array} 可用模型列表
   */
  getAvailableModels() {
    const staticAvailable = this.modelRegistry.getAvailableModels();
    return staticAvailable.filter(model => {
      const usability = this.statusMonitor.isModelUsable(
        model.id,
        this.configManager.getFallbackStrategy()
      );
      return usability.usable;
    });
  }

  /**
   * 获取模型详情
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型详情
   */
  getModelInfo(modelId) {
    return this.modelRegistry.getModel(modelId);
  }

  /**
   * 获取成本统计
   * @returns {Object} 成本统计
   */
  getCostStatistics() {
    return this.costController.getStatistics();
  }

  /**
   * 获取学习报告（如果启用了学习功能）
   * @returns {Object|null} 学习报告
   */
  getLearningReport() {
    if (!this.learningEngine) {
      return null;
    }
    return this.learningEngine.exportReport();
  }

  /**
   * 获取系统状态报告
   * @returns {Object} 系统状态报告
   */
  getStatusReport() {
    return {
      timestamp: new Date().toISOString(),
      budget: this.costController.getStatistics(),
      models: {
        total: this.modelRegistry.getAllModels().length,
        available: this.modelRegistry.getAvailableModels().length
      },
      learning: this.learningEngine ? this.learningEngine.exportReport() : null,
      modelStatuses: this.statusMonitor.exportReport()
    };
  }

  /**
   * 启用/禁用学习功能
   * @param {boolean} enabled - 是否启用
   */
  setLearningEnabled(enabled) {
    if (this.learningEngine) {
      this.learningEngine.setEnabled(enabled);
    }
  }

  /**
   * 清除学习数据
   * @param {string} modelId - 模型 ID（可选）
   * @param {string} taskType - 任务类型（可选）
   */
  clearLearningData(modelId = null, taskType = null) {
    if (this.learningEngine) {
      this.learningEngine.clearData(modelId, taskType);
    }
  }
}

module.exports = ModelSelector;