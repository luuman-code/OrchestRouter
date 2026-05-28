/**
 * ModelSelector - 模型选择器主类
 *
 * 整合所有功能块，提供统一的模型选择接口
 * 功能块：
 *   A: ModelRegistry - 模型注册与管理层
 *   B: SelectionConfigManager - 配置与策略层
 *   C: ModelEvaluator - 模型评估与选择层
 *   D: CostController - 成本控制与监控层
 *   E: ModelStatusMonitor - 状态监控与降级层
 *   F: LearningSelector - 历史反馈与学习层（可选）
 *   G: MultiLabelMatcher - 多标签能力匹配层
 */

const ModelRegistry = require('./registry/ModelRegistry');
const SelectionConfigManager = require('./config/SelectionConfigManager');
const ModelEvaluator = require('./core/ModelEvaluator');
const CostController = require('./core/CostController');
const ModelStatusMonitor = require('./monitor/ModelStatusMonitor');
const LearningSelector = require('./core/LearningSelector');
const AsyncSelectionLogger = require('./utils/AsyncSelectionLogger');
const MultiLabelMatcher = require('./matching/MultiLabelMatcher');
const MultiDimensionModelRanker = require('./core/MultiDimensionModelRanker');

class ModelSelector {
  constructor(config = {}) {
    console.log('[ModelSelector] 初始化模型选择器...');

    // 功能块 B: 配置与策略层
    this.configManager = new SelectionConfigManager(config);

    // 功能块 A: 模型注册与管理层
    this.modelRegistry = new ModelRegistry(config);

    // 功能块 C: 模型评估与选择层
    this.modelEvaluator = new ModelEvaluator(
      this.modelRegistry,
      this.configManager
    );

    // 功能块 D: 成本控制与监控层
    const initialBudget = this.configManager.getConstraint('dailyBudget', 10.00);
    // 获取成本控制配置（支持保守预估和实时反馈）
    const costControlConfig = this.configManager.getConstraint('costControl', {});
    this.costController = new CostController(initialBudget, {
      conservativeEstimation: costControlConfig.conservativeEstimation ?? true, // 默认启用保守预估
      safetyMargin: costControlConfig.safetyMargin ?? 0.2, // 默认 20% 安全边际
      pendingConfirmTimeout: costControlConfig.pendingConfirmTimeout ?? 30000,
      realTimeFeedbackEnabled: costControlConfig.realTimeFeedbackEnabled ?? true
    });

    // 功能块 E: 状态监控与降级层
    this.statusMonitor = new ModelStatusMonitor({
      errorRateThreshold: this.configManager.getFallbackStrategy('errorRateThreshold'),
      latencyThresholdMs: this.configManager.getFallbackStrategy('latencyThresholdMs'),
      rateLimitThreshold: this.configManager.getFallbackStrategy('rateLimitThreshold')
    });

    // 功能块 F: 历史反馈与学习层（可选）
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

      this.learningSelector = new LearningSelector(persistenceConfig);
      console.log('[ModelSelector] 学习型选择器已启用，持久化类型：' + persistenceConfig.persistenceType);
    }

    // 初始化异步选择日志处理器
    const loggingConfig = this.configManager.getMonitoringConfig('logging', {});
    this.asyncLogger = new AsyncSelectionLogger({
      processingDelay: loggingConfig.asyncDelay || 0,
      batchSize: loggingConfig.batchSize || 1,
      logger: console
    });

    // 模型状态广播器（用于接收健康检查后的状态更新）
    this.modelStatusBroadcaster = config.modelStatusBroadcaster || null;
    this.availableModels = [];

    // 功能块 G: 多标签能力匹配层
    this.multiLabelMatcher = new MultiLabelMatcher({
      configPath: config.configPath
    });

    // 功能块 H: 多维度模型排序层
    // 【调试】检查 config.model_task_matrix 是否正确传递
    console.log('[ModelSelector] [调试] config.model_task_matrix:', JSON.stringify(config.model_task_matrix, null, 2));
    const matrixConfig = config.model_task_matrix || {
      dimensionWeights: { category: 0.9, complexity: 0.85, priority: 0.7, quality: 0.9, cost: 0.6 },
      dimensionValues: {
        category: ['frontend', 'backend', 'infrastructure', 'security', 'quality', 'general'],
        complexity: ['low', 'medium', 'high'],
        priority: [0, 1, 2, 3, 4, 5],
        quality: ['low', 'medium', 'high'],
        cost: ['low', 'medium', 'high']
      },
      suitabilityMatrix: {}
    };
    console.log('[ModelSelector] [调试] matrixConfig.suitabilityMatrix keys:', matrixConfig.suitabilityMatrix ? Object.keys(matrixConfig.suitabilityMatrix) : 'N/A');
    this.ranker = new MultiDimensionModelRanker(matrixConfig);

    // 注册到广播器
    if (this.modelStatusBroadcaster) {
      this.modelStatusBroadcaster.register('ModelSelector', (statusMap) => {
        this.onBroadcastModelStatusUpdate(statusMap);
      });
    }

    console.log('[ModelSelector] 初始化完成');
  }

  /**
   * 更新模型状态（接收广播的状态更新）
   */
  onBroadcastModelStatusUpdate(statusMap) {
    if (!statusMap) {
      this.availableModels = [];
      return;
    }
    const available = Object.entries(statusMap)
      .filter(([modelId, status]) => status.available)
      .map(([modelId]) => modelId);
    this.availableModels = available;
    console.log(`[ModelSelector] 可用模型已更新: ${available.length} 个 - ${available.join(', ')}`);
  }

  /**
   * 为单个子任务选择模型
   * @param {Object} subtask - 子任务对象
   * @param {Object} additionalConstraints - 额外约束条件
   * @returns {Object} 模型选择结果
   */
  select(subtask, additionalConstraints = {}) {
    // 【重构】只使用多维度排序机制选择模型
    const types = subtask.types || [];
    const taskId = subtask.id || `task_${Date.now()}`;

    // 解析多维度类型信息用于调试日志
    const typeDebugInfo = types.map(t => `${t.dimension}=${t.value}(w=${t.weight})`).join(', ');
    console.log(`[ModelSelector] ========== 模型选择开始 ==========`);
    console.log(`[ModelSelector] 任务ID: ${taskId}`);
    console.log(`[ModelSelector] 多维度类型: [${typeDebugInfo}]`);

    // ========== 步骤 1: 获取所有模型 ==========
    const allModels = this.modelRegistry.getAllModels();
    console.log(`[ModelSelector] [调试] 原始模型数量: ${allModels.length}`);
    console.log(`[ModelSelector] [调试] 原始模型列表: ${allModels.map(m => m.id).join(', ')}`);

    // ========== 步骤 2: 过滤可用模型 ==========
    const fallbackStrategy = this.configManager.getFallbackStrategy();
    const usableModels = allModels.filter(m => {
      const usability = this.statusMonitor.isModelUsable(m.id, fallbackStrategy);
      return usability.usable;
    });
    const usableModelIds = usableModels.map(m => m.id);

    console.log(`[ModelSelector] [调试] 可用模型数量: ${usableModels.length} / ${allModels.length}`);
    console.log(`[ModelSelector] [调试] 可用模型列表: ${usableModelIds.join(', ')}`);

    if (usableModelIds.length === 0) {
      console.error(`[ModelSelector] [错误] 没有通过健康检查的可用模型`);
      return {
        task_id: taskId,
        selected_model: null,
        success: false,
        error: 'No available model',
        alternatives: []
      };
    }

    // ========== 步骤 3: 多维度排序 ==========
    console.log(`[ModelSelector] [调试] 开始多维度排序...`);
    console.log(`[ModelSelector] [调试] 维度权重:`, this.ranker.dimensionWeights);
    console.log(`[ModelSelector] [调试] 输入types:`, JSON.stringify(types, null, 2));

    const rankedResult = this.ranker.rankModels(usableModelIds, types);

    if (!rankedResult || !rankedResult.rankedModels || rankedResult.rankedModels.length === 0) {
      console.error(`[ModelSelector] [错误] 多维度排序返回空结果`);
      return {
        task_id: taskId,
        selected_model: null,
        success: false,
        error: 'Ranking returned empty result',
        alternatives: []
      };
    }

    // ========== 步骤 4: 构建排序详情日志 ==========
    console.log(`[ModelSelector] [调试] 多维度排序完成:`);
    console.log(`[ModelSelector] [调试] 排序理由: ${rankedResult.reason}`);
    console.log(`[ModelSelector] [调试] 排序结果 (前10):`);

    rankedResult.rankedModels.slice(0, 10).forEach((rm, idx) => {
      console.log(`[ModelSelector] [调试]   ${idx + 1}. ${rm.modelId}: score=${rm.score.toFixed(4)}`);
      // 打印各维度分项得分
      if (rm.dimensionScores) {
        for (const [key, val] of Object.entries(rm.dimensionScores)) {
          console.log(`[ModelSelector] [调试]      ${key}: dimWeight=${val.dimensionWeight}, typeWeight=${val.typeWeight}, suit=${val.suitability}, weighted=${val.weightedScore.toFixed(4)}`);
        }
      }
    });

    // ========== 步骤 5: 构建 alternatives ==========
    const rankedAlternatives = rankedResult.rankedModels.map((rm, index) => {
      const model = allModels.find(m => m.id === rm.modelId);
      return {
        modelId: rm.modelId,
        model: model,
        score: rm.score,
        rank: index + 1,
        dimensionScores: rm.dimensionScores,
        cost: this.estimateCostForModel(rm.modelId)  // 添加成本信息，用于 findCheaperAlternatives
      };
    });

    // ========== 步骤 6: 选择首位模型 ==========
    const topModel = rankedAlternatives[0];
    const selectedModelId = topModel.modelId;
    const selectedScore = topModel.score;

    console.log(`[ModelSelector] [调试] 首选模型: ${selectedModelId}`);
    console.log(`[ModelSelector] [调试] 首选分数: ${selectedScore.toFixed(4)}`);
    console.log(`[ModelSelector] [调试] 维度分项得分:`);
    if (topModel.dimensionScores) {
      for (const [key, val] of Object.entries(topModel.dimensionScores)) {
        console.log(`[ModelSelector] [调试]   ${key}: 适合度=${val.suitability}, 加权分数=${val.weightedScore.toFixed(4)}`);
      }
    }

    // ========== 步骤 7: 成本验证（仅检查，不影响选择结果）==========
    const topModelData = allModels.find(m => m.id === selectedModelId);
    const cost = topModelData ? this.estimateCostForModel(selectedModelId) : { total: 0, input: 0, output: 0 };

    console.log(`[ModelSelector] [调试] 估算成本: $${cost.total.toFixed(6)}`);

    if (!this.costController.canAllocate(cost)) {
      console.warn(`[ModelSelector] [警告] 预算可能不足，但不影响模型选择结果`);
      console.warn(`[ModelSelector] [警告] 估算成本: $${cost.total.toFixed(6)}, 预算状态: ${JSON.stringify(this.costController.getStatistics())}`);
      // 注意：成本验证只起警告作用，不影响模型选择结果
    }

    // ========== 步骤 8: 最终选择日志 ==========
    console.log(`[ModelSelector] ========== 模型选择完成 ==========`);
    console.log(`[ModelSelector] 最终选择: ${selectedModelId}`);
    console.log(`[ModelSelector] 选择原因: 多维度排序首位 (${rankedResult.reason})`);
    console.log(`[ModelSelector] 匹配分数: ${selectedScore.toFixed(4)}`);
    console.log(`[ModelSelector] 备选模型数: ${rankedAlternatives.length}`);
    console.log(`==============================================`);

    return this.createSelectionResult(
      taskId,
      selectedModelId,
      `多维度排序首位: ${rankedResult.reason}`,
      cost,
      5000,
      rankedAlternatives,
      null
    );
  }

  /**
   * 根据融合策略合并规则和学习结果
   * @private
   */
  mergeRuleAndLearning(ruleEval, learningRec, subtask) {
    const integrationConfig = this.configManager.getStrategyConfig().learning_integration || {};
    const strategy = integrationConfig.strategy || 'hybrid';

    console.log(`[ModelSelector] 使用融合策略: ${strategy}, 规则模型: ${ruleEval.modelId}, 学习推荐: ${learningRec ? learningRec.modelId : 'none'}`);

    switch(strategy) {
      case 'rule_priority':
        // 规则优先：如果有规则评估结果，优先使用规则
        return ruleEval || { modelId: learningRec?.modelId, model: this.modelRegistry.getModel(learningRec?.modelId) };

      case 'learning_priority':
        // 学习优先：如果有高置信度学习推荐，优先使用学习
        if (learningRec && learningRec.confidence > 0.7) {
          console.log(`[ModelSelector] 学习优先策略：使用学习推荐 ${learningRec.modelId}`);
          return {
            ...ruleEval,
            modelId: learningRec.modelId,
            model: this.modelRegistry.getModel(learningRec.modelId),
            reason: `学习推荐：${ruleEval.reason}`
          };
        }
        return ruleEval;

      case 'contextual':
        // 上下文切换：根据任务特征选择策略
        if (integrationConfig.contextual_switching?.enabled) {
          const context = this.analyzeTaskContext(subtask);

          // 在某些上下文中优先使用规则
          if (
            (context.securityCritical && integrationConfig.contextual_switching.conditions?.security_critical) ||
            (context.highUncertainty && integrationConfig.contextual_switching.conditions?.high_uncertainty_tasks)
          ) {
            console.log('[ModelSelector] 上下文切换：在安全或高不确定性任务中优先使用规则');
            return ruleEval;
          }

          // 在某些上下文中优先使用学习
          if (
            (context.repetitiveTask && integrationConfig.contextual_switching.conditions?.repetitive_tasks) ||
            (context.performanceSensitive && integrationConfig.contextual_switching.conditions?.performance_sensitive)
          ) {
            if (learningRec && learningRec.confidence > 0.7) {
              console.log(`[ModelSelector] 上下文切换：在性能敏感任务中使用学习推荐 ${learningRec.modelId}`);
              return {
                ...ruleEval,
                modelId: learningRec.modelId,
                model: this.modelRegistry.getModel(learningRec.modelId),
                reason: `学习推荐：${ruleEval.reason}`
              };
            }
          }
        }
        // 如果没有匹配的上下文条件，使用混合策略
        return this.hybridMerge(ruleEval, learningRec, integrationConfig);

      case 'hybrid':
      default:
        // 混合策略：综合考虑规则权重和学习置信度
        return this.hybridMerge(ruleEval, learningRec, integrationConfig);
    }
  }

  /**
   * 分析任务上下文
   * @private
   */
  analyzeTaskContext(subtask) {
    const description = subtask.description || '';
    // 使用 types 数组获取主类型
    const types = subtask.types || [];
    const taskType = types.length > 0 ? types[0].type : '';

    return {
      securityCritical: this.containsSecurityKeywords(description),
      highUncertainty: (subtask.confidence && subtask.confidence < 0.6) || this.containsUncertaintyKeywords(description),
      repetitiveTask: this.containsRepetitiveKeywords(description),
      performanceSensitive: this.containsPerformanceKeywords(description)
    };
  }

  /**
   * 检查是否包含安全关键词
   * @private
   */
  containsSecurityKeywords(description) {
    const securityKeywords = ['security', 'secure', 'authentication', 'authorization', 'crypto', 'encryption', 'password', 'auth', 'oauth', '安全', '认证', '授权', '加密', '密码'];
    return securityKeywords.some(keyword => description.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 检查是否包含不确定性关键词
   * @private
   */
  containsUncertaintyKeywords(description) {
    const uncertaintyKeywords = ['uncertain', 'experimental', 'prototype', 'research', 'test', 'experiment', '尝试', '实验', '原型', '研究', '测试'];
    return uncertaintyKeywords.some(keyword => description.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 检查是否包含重复性关键词
   * @private
   */
  containsRepetitiveKeywords(description) {
    const repetitiveKeywords = ['repeat', 'routine', 'regular', 'maintenance', 'update', 'maintenance', 'routine', '重复', '常规', '例行', '维护', '更新', '日常'];
    return repetitiveKeywords.some(keyword => description.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 检查是否包含性能关键词
   * @private
   */
  containsPerformanceKeywords(description) {
    const performanceKeywords = ['performance', 'optimize', 'efficiency', 'speed', 'fast', 'quick', 'latency', 'throughput', '性能', '优化', '效率', '速度', '快速', '延迟', '吞吐量'];
    return performanceKeywords.some(keyword => description.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 混合合并规则和学习结果
   * @private
   */
  hybridMerge(ruleEval, learningRec, integrationConfig) {
    const ruleWeight = integrationConfig.rule_weight || 0.6;
    const learningWeight = integrationConfig.learning_weight || 0.4;

    // 如果没有学习推荐，直接返回规则结果
    if (!learningRec) {
      return ruleEval;
    }

    // 如果没有规则结果，返回学习推荐
    if (!ruleEval || !ruleEval.modelId) {
      return {
        ...ruleEval,
        modelId: learningRec.modelId,
        model: this.modelRegistry.getModel(learningRec.modelId),
        reason: `学习推荐：${ruleEval?.reason || '基于历史表现'}`,
        cost: ruleEval?.cost || this.estimateCostForModel(learningRec.modelId)
      };
    }

    // 如果规则和学习推荐是同一个模型，直接返回
    if (ruleEval.modelId === learningRec.modelId) {
      return ruleEval;
    }

    // 计算综合评分，偏向规则结果但受学习影响
    const ruleScore = ruleEval.score || 0;
    const learningConfidence = learningRec.confidence || 0;

    // 加权综合评分
    const combinedScore = (ruleScore * ruleWeight) + (learningConfidence * learningWeight);

    // 决定最终选择
    // 如果学习器对某个模型有很高的信心，且该模型不在规则首选中，但在备选中，则考虑切换
    if (learningConfidence > 0.8) {
      // 检查学习推荐是否比规则结果更好
      const ruleEvalModel = this.modelRegistry.getModel(ruleEval.modelId);
      const learningRecModel = this.modelRegistry.getModel(learningRec.modelId);

      // 如果学习推荐的模型在质量上有显著优势，或规则结果置信度不高，可以考虑切换
      if (learningRecModel && learningRecModel.qualityScore > ruleEvalModel.qualityScore * 1.1) {
        console.log(`[ModelSelector] 混合策略：学习推荐 ${learningRec.modelId} 在质量上有优势，覆盖规则结果`);
        return {
          ...ruleEval,
          modelId: learningRec.modelId,
          model: learningRecModel,
          reason: `学习推荐覆盖规则结果：${ruleEval.reason}`,
          score: combinedScore
        };
      }
    }

    // 默认返回规则结果
    console.log(`[ModelSelector] 混合策略：保持规则结果 ${ruleEval.modelId}`);
    return ruleEval;
  }

  /**
   * 为指定模型估算成本
   * @private
   */
  estimateCostForModel(modelId) {
    const model = this.modelRegistry.getModel(modelId);
    if (!model) {
      return { total: Infinity, input: 0, output: 0 };
    }

    // 使用默认token估算
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
   * 寻找成本更低的替代模型
   * @private
   */
  findCheaperAlternatives(currentModelId, alternatives, maxCost) {
    return alternatives
      .filter(alt => alt.cost.total < maxCost)
      .sort((a, b) => a.cost.total - b.cost.total);
  }

  /**
   * 寻找可用的替代模型
   * @private
   * @param {Array} alternatives - 备选模型列表
   * @param {boolean} requiresMultiToolCall - 是否需要 multi_tool_call 能力
   * @param {string} originalModelId - 原始选择的模型 ID（用于检查 multi_tool_call 能力）
   */
  findAvailableAlternatives(alternatives, requiresMultiToolCall = false, originalModelId = null) {
    // 检查原始模型是否支持 multi_tool_call
    let originalSupportsMultiToolCall = false;
    if (originalModelId) {
      const originalModel = this.modelRegistry.getModel(originalModelId);
      if (originalModel) {
        originalSupportsMultiToolCall = originalModel.multi_tool_call === true;
      }
    }

    // 如果原始模型支持 multi_tool_call 或明确要求 multi_tool_call，过滤时必须保留支持该能力的模型
    const mustSupportMultiTool = requiresMultiToolCall || originalSupportsMultiToolCall;

    if (mustSupportMultiTool) {
      console.log(`[ModelSelector] Fallback 过滤：需要支持 multi_tool_call 的模型，originalModel=${originalModelId}, supports=${originalSupportsMultiToolCall}`);
    }

    const usableModels = alternatives
      .map(alt => {
        const usability = this.statusMonitor.isModelUsable(
          alt.modelId,
          this.configManager.getFallbackStrategy()
        );

        // 检查模型的 multi_tool_call 能力
        const model = this.modelRegistry.getModel(alt.modelId);
        const supportsMultiToolCall = model && model.multi_tool_call === true;

        return {
          ...alt,
          usable: usability.usable,
          reason: usability.reason,
          supportsMultiToolCall: supportsMultiToolCall
        };
      })
      .filter(alt => {
        // 首先检查是否可用
        if (!alt.usable) return false;

        // 如果必须支持 multi_tool_call，则过滤掉不支持的模型
        if (mustSupportMultiTool && !alt.supportsMultiToolCall) {
          console.log(`[ModelSelector] 排除不支持 multi_tool_call 的模型: ${alt.modelId}`);
          return false;
        }

        return true;
      });

    // 如果过滤后没有可用模型，但原始模型支持 multi_tool_call，发出警告
    if (mustSupportMultiTool && usableModels.length === 0) {
      console.warn(`[ModelSelector] 警告：没有支持 multi_tool_call 的备选模型，原始模型 ${originalModelId} 支持该能力`);
    }

    // 【修复】按 multi_tool_call 支持和评分排序
    return usableModels.sort((a, b) => {
      // 首先按 multi_tool_call 支持排序（支持的在前面）
      if (a.supportsMultiToolCall !== b.supportsMultiToolCall) {
        return a.supportsMultiToolCall ? -1 : 1;
      }

      // 然后按评分排序（高评分优先）
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // 高分在前
      }

      // 评分相同时，按排名排序
      const rankA = a.rank ?? 99;
      const rankB = b.rank ?? 99;

      if (rankA !== rankB) {
        return rankA - rankB; // 排名靠前在前
      }

      // 最后按负载排序（低负载优先）
      const loadScoreA = a.currentLoad ?? a.loadScore ?? 1;
      const loadScoreB = b.currentLoad ?? b.loadScore ?? 1;

      return loadScoreA - loadScoreB;
    });
  }

  /**
   * 计算 Fallback 用的综合评分（延迟低、错误率低优先）
   * @private
   */
  calculateFallbackScore(status) {
    const latencyWeight = 0.6;
    const errorRateWeight = 0.4;

    // 延迟分数：归一化到 0-1，延迟越低越好
    const latencyScore = Math.min(1, (status.currentLatencyMs || 0) / 10000);

    // 错误率分数：直接使用 0-1 的值
    const errorScore = status.errorRate || 0;

    return latencyScore * latencyWeight + errorScore * errorRateWeight;
  }

  /**
   * 获取全局可用模型列表（按 multi_tool_call 支持和评分排序）
   * @private
   * @param {string} excludeModelId - 排除的模型 ID
   * @param {boolean} requiresMultiToolCall - 是否需要 multi_tool_call 能力
   */
  getGlobalAvailableModels(excludeModelId = null, requiresMultiToolCall = false) {
    const allModels = this.modelRegistry.getAllModels();

    return allModels
      .filter(model => {
        // 排除指定模型
        if (excludeModelId && model.id === excludeModelId) {
          return false;
        }

        // 如果需要 multi_tool_call 能力，排除不支持的模型
        if (requiresMultiToolCall && model.multi_tool_call !== true) {
          console.log(`[ModelSelector] getGlobalAvailableModels 排除不支持 multi_tool_call 的模型: ${model.id}`);
          return false;
        }

        const usability = this.statusMonitor.isModelUsable(
          model.id,
          this.configManager.getFallbackStrategy()
        );
        return usability.usable;
      })
      .map(model => {
        const status = this.statusMonitor.getModelStatus(model.id);
        // 使用模型的 qualityScore 作为评分，如果没有则默认 7.0
        const qualityScore = model.qualityScore || 7.0;
        return {
          modelId: model.id,
          model: model,
          cost: model.cost || { total: 0 },
          status: status,
          usable: true,
          supportsMultiToolCall: model.multi_tool_call === true,
          score: qualityScore,  // 使用模型的 qualityScore
          rank: 99   // 默认排名
        };
      })
      .sort((a, b) => {
        // 【修复】首先按 multi_tool_call 支持排序（支持的在前面）
        if (requiresMultiToolCall) {
          if (a.supportsMultiToolCall !== b.supportsMultiToolCall) {
            return a.supportsMultiToolCall ? -1 : 1;
          }
        }
        // 【修复】然后按评分排序（高评分优先）
        const scoreA = a.score ?? 0;
        const scoreB = b.score ?? 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        // 最后按负载排序（低负载优先）
        const loadScoreA = a.currentLoad ?? a.loadScore ?? 1;
        const loadScoreB = b.currentLoad ?? b.loadScore ?? 1;
        return loadScoreA - loadScoreB;
      });
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
    if (!this.learningSelector) {
      console.warn('[ModelSelector] 学习功能未启用，无法记录反馈');
      return;
    }

    // 确定任务类型，使用 types 数组获取主类型
    const subtask = additionalMetrics?.subtask;
    const types = subtask?.types || [];
    const taskType = types.length > 0 ? types[0].type : 'general';

    this.learningSelector.recordFeedback(taskId, taskType, modelId, qualityScore, additionalMetrics);

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
   * 获取用于 Fallback 的备选模型列表（通过健康检查的、能力均衡的模型）
   * 当模型选择失败时调用此方法获取 fallback alternatives
   *
   * @param {Array} types - 任务类型列表（可选）
   * @returns {Array} 通过健康检查的模型列表，格式与 select() 返回的 alternatives 一致
   */
  /**
   * 获取用于 Fallback 的备选模型列表（通过健康检查的模型，随机排序）
   * 当模型选择失败时调用此方法获取 fallback alternatives
   *
   * 注意：直接随机打乱通过健康检查的模型列表，不再进行排序，
   * 因为选择失败可能是排序逻辑问题导致的，随机选择更稳妥
   *
   * @returns {Array} 通过健康检查的模型列表，格式与 select() 返回的 alternatives 一致
   */
  getFallbackAlternatives() {
    const allModels = this.modelRegistry.getAllModels();
    const fallbackStrategy = this.configManager.getFallbackStrategy();

    // 过滤通过健康检查的模型
    const usableModels = allModels.filter(m => {
      const usability = this.statusMonitor.isModelUsable(m.id, fallbackStrategy);
      return usability.usable;
    });

    if (usableModels.length === 0) {
      console.warn(`[ModelSelector] 没有通过健康检查的模型可用于 fallback`);
      return [];
    }

    // Fisher-Yates 洗牌算法打乱顺序
    const shuffled = [...usableModels];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 构建 alternatives 列表
    const alternatives = shuffled.map((model, index) => ({
      modelId: model.id,
      model: model,
      score: 0,
      rank: index + 1,
      dimensionScores: {}
    }));

    console.log(`[ModelSelector] Fallback alternatives (随机顺序): ${alternatives.map(a => a.modelId).join(', ')}`);
    return alternatives;
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
    if (!this.learningSelector) {
      return null;
    }
    return this.learningSelector.exportReport();
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
      learning: this.learningSelector ? this.learningSelector.exportReport() : null,
      modelStatuses: this.statusMonitor.exportReport()
    };
  }

  /**
   * 启用/禁用学习功能
   * @param {boolean} enabled - 是否启用
   */
  setLearningEnabled(enabled) {
    if (this.learningSelector) {
      this.learningSelector.setEnabled(enabled);
    }
  }

  /**
   * 清除学习数据
   * @param {string} modelId - 模型 ID（可选）
   * @param {string} taskType - 任务类型（可选）
   */
  clearLearningData(modelId = null, taskType = null) {
    if (this.learningSelector) {
      this.learningSelector.clearData(modelId, taskType);
    }
  }
}

module.exports = ModelSelector;
