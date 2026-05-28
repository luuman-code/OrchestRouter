/**
 * ModelEvaluator - 模型评估器
 *
 * 功能块 C：模型评估与选择层
 * 基于任务特征、规则和成本等因素选择最优模型
 */

class ModelEvaluator {
  constructor(modelRegistry, configManager, statusMonitor = null) {
    this.modelRegistry = modelRegistry;
    this.configManager = configManager;
    this.statusMonitor = statusMonitor; // 状态监控器引用，用于获取并发负载信息

    // 初始化多标签匹配器 - 从 config.json 加载 model_matching 配置
    try {
      const MultiLabelMatcher = require('../matching/MultiLabelMatcher');
      // 直接从 config.json 文件读取，确保能够获取到配置
      let matchingConfig = {};
      const fs = require('fs');
      const path = require('path');
      // 优先从 OrchestRouter/config 目录读取
      const possiblePaths = [
        path.join(process.cwd(), 'OrchestRouter', 'config', 'config.json'),
        path.join(process.cwd(), 'config', 'config.json'),
        path.join(__dirname, '../../../config/config.json'),
        'C:/Users/LWB/OrchestRouter/config/config.json'
      ];

      let configPath = '';
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          configPath = p;
          break;
        }
      }

      if (configPath && fs.existsSync(configPath)) {
        const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // 优先从 orchestrator_extensions.model_matching 获取
        matchingConfig = configJson.orchestrator_extensions?.model_matching || {};
      }

      // 打印加载结果
      if (matchingConfig && Object.keys(matchingConfig).length > 0 && matchingConfig.model_capabilities) {
        console.log('[ModelEvaluator] 成功加载 model_matching 配置，模型数量:', Object.keys(matchingConfig.model_capabilities || {}).length);
      }
      this.multiLabelMatcher = new MultiLabelMatcher({ config: matchingConfig });
    } catch (e) {
      console.error('[ModelEvaluator] 初始化 MultiLabelMatcher 失败:', e.message);
      this.multiLabelMatcher = null;
    }
  }

  /**
   * 获取模型当前负载分数（0-1，越低表示负载越低）
   */
  get_model_load(modelId) {
    if (!this.statusMonitor) {
      return 0; // 默认负载为 0
    }
    return this.statusMonitor.getModelLoadScore(modelId) || 0;
  }

  /**
   * 检查模型是否有可用并发槽位
   */
  has_available_concurrency(modelId) {
    if (!this.statusMonitor) {
      return true; // 默认有可用槽位
    }
    return this.statusMonitor.hasAvailableConcurrency(modelId) || true;
  }

  /**
   * 为子任务选择最佳模型
   * @param {Object} subtask - 子任务对象
   * @returns {Object} 模型选择结果
   */
  selectBestModel(subtask) {
    // 使用 types 数组获取主类型
    const types = subtask.types || [];
    const taskType = types.length > 0 ? types[0].type : 'general';
    const taskDescription = subtask.description || '';
    const confidence = types.length > 0 ? types[0].confidence : 1.0; // 使用 types 中的置信度
    const matchedRule = subtask.matchedRule || {}; // 匹配规则详情
    const complexity = subtask.complexity || null; // 复杂度分析结果

    // 调试日志：记录types数组
    console.log(`[ModelEvaluator] 开始为任务类型 "${taskType}" 选择模型...`);
    console.log(`[ModelEvaluator] types数组: ${JSON.stringify(types)}`);
    console.log(`[ModelEvaluator] types.length: ${types.length}, 多标签匹配条件: ${types.length > 1}`);

    // 如果有复杂度信息，记录日志
    if (complexity) {
      console.log(`[ModelEvaluator] 复杂度分析：isComplex=${complexity.isComplex}, confidence=${complexity.confidence}, method=${complexity.method}`);
    }

    // 1. 根据任务类型获取候选模型
    let candidates = this.getCandidateModels(taskType);

    // 2. 应用选择规则进行过滤和排序
    candidates = this.applySelectionRules(candidates, taskType, confidence, matchedRule, subtask);

    // 3. 估算任务token消耗
    const tokenEstimate = this.estimateTokens(subtask);

    // 4. 计算各候选模型的成本（使用资源感知成本计算）
    const candidateScores = candidates.map(candidate => {
      const model = this.modelRegistry.getModel(candidate.modelId);
      const cost = this.calculateCostWithResourceFactor(model, tokenEstimate);

      // 5. 根据复杂度分析结果调整分数
      let adjustedScore = candidate.score;
      if (complexity && complexity.isComplex !== undefined) {
        // 简单任务：倾向于选择较小/较便宜的模型
        // 复杂任务：倾向于选择较强/高质量的模型
        const qualityScore = model.qualityScore || 5;

        if (!complexity.isComplex) {
          // 简单任务：降低高质量模型的分数偏好，倾向于选择成本低的模型
          // 调整幅度：质量分数 * (1 - confidence) * 0.5
          const adjustment = qualityScore * (1 - (complexity.confidence || 0.5)) * 0.3;
          adjustedScore = candidate.score - adjustment;
          console.log(`[ModelEvaluator] 简单任务调整分数：${candidate.modelId} 原始=${candidate.score.toFixed(2)}, 调整后=${adjustedScore.toFixed(2)}, 调整量=-${adjustment.toFixed(2)}`);
        } else {
          // 复杂任务：提升高质量模型的分数偏好
          // 调整幅度：质量分数 * confidence * 0.3
          const adjustment = qualityScore * (complexity.confidence || 0.5) * 0.3;
          adjustedScore = candidate.score + adjustment;
          console.log(`[ModelEvaluator] 复杂任务调整分数：${candidate.modelId} 原始=${candidate.score.toFixed(2)}, 调整后=${adjustedScore.toFixed(2)}, 调整量=+${adjustment.toFixed(2)}`);
        }
      }

      // 5.5 如果有多标签匹配器且任务有多个类型，计算多标签能力匹配分数并加入调整
      if (this.multiLabelMatcher && types && types.length > 1) {
        const multiLabelMatch = this.multiLabelMatcher.calculateMatchScore(types, candidate.modelId);
        if (multiLabelMatch && multiLabelMatch.score > 0) {
          // 多标签匹配权重：0.3（占30%比重）
          const multiLabelWeight = 0.3;
          const multiLabelAdjustment = multiLabelMatch.score * multiLabelWeight;
          adjustedScore = adjustedScore + multiLabelAdjustment;
          console.log(`[ModelEvaluator] 多标签能力匹配调整：${candidate.modelId} 多标签分数=${multiLabelMatch.score.toFixed(3)}, 调整量=+${multiLabelAdjustment.toFixed(2)}, 调整后=${adjustedScore.toFixed(2)}`);
        }
      }

      return {
        modelId: candidate.modelId,
        model: model,
        cost: cost,
        score: adjustedScore,
        originalScore: candidate.score, // 保留原始分数
        reason: candidate.reason,
        matchedRule: candidate.matchedRule, // 保留匹配的规则信息
        complexityAdjustment: complexity ? { isComplex: complexity.isComplex, confidence: complexity.confidence } : null
      };
    });

    // 6. 根据成本、质量、模型类型和当前负载进行排序
    console.log(`[ModelEvaluator] 开始排序前的 candidates: ${candidateScores.map(c => `${c.modelId}(${c.score.toFixed(2)})`).join(', ')}`);
    candidateScores.sort((a, b) => {
      // 首先按分数排序（质量优先）
      if (b.score !== a.score) {
        const result = b.score - a.score;
        console.log(`[ModelEvaluator] 排序: ${a.modelId}(${a.score.toFixed(2)}) vs ${b.modelId}(${b.score.toFixed(2)}) => ${result > 0 ? 'b在前' : 'a在前'}`);
        return result;
      }

      // 考虑当前并发负载（负载低的优先级更高）
      const loadA = this.get_model_load(a.modelId);
      const loadB = this.get_model_load(b.modelId);

      // 对于本地模型，同时考虑资源成本因子
      if (a.cost.resourceCostFactor && b.cost.resourceCostFactor) {
        // 如果两个都是本地模型且都有资源成本因子
        const effectiveCostA = a.cost.total * a.cost.resourceCostFactor;
        const effectiveCostB = b.cost.total * b.cost.resourceCostFactor;

        // 综合考虑负载和资源成本
        const combinedScoreA = (1 - loadA) * b.score + (1 / (effectiveCostA + 0.0001));
        const combinedScoreB = (1 - loadB) * a.score + (1 / (effectiveCostB + 0.0001));

        if (combinedScoreA !== combinedScoreB) {
          return combinedScoreB - combinedScoreA;
        }
      } else if (a.cost.resourceCostFactor) {
        // 如果只有a是本地模型且有资源成本因子
        const effectiveCostA = a.cost.total * a.cost.resourceCostFactor;
        const combinedScoreA = (1 - loadA) * b.score + (1 / (effectiveCostA + 0.0001));
        const combinedScoreB = (1 - loadB) * a.score + (1 / (b.cost.total + 0.0001));
        return combinedScoreB - combinedScoreA;
      } else if (b.cost.resourceCostFactor) {
        // 如果只有b是本地模型且有资源成本因子
        const effectiveCostB = b.cost.total * b.cost.resourceCostFactor;
        const combinedScoreA = (1 - loadA) * b.score + (1 / (a.cost.total + 0.0001));
        const combinedScoreB = (1 - loadB) * a.score + (1 / (effectiveCostB + 0.0001));
        return combinedScoreB - combinedScoreA;
      } else {
        // 两个都不是本地模型或都没有资源成本因子，使用传统方法
        // 如果分数相同，优先考虑本地模型（成本低、隐私好）
        if (a.cost.isLocal && !b.cost.isLocal) {
          return -1; // a 是本地模型，优先级更高
        }
        if (!a.cost.isLocal && b.cost.isLocal) {
          return 1; // b 是本地模型，优先级更高
        }

        // 考虑负载差异
        if (Math.abs(loadA - loadB) > 0.2) { // 负载差异超过 20% 时优先考虑
          return loadA - loadB; // 负载低的优先级更高
        }

        // 对于相同类型的模型，按成本排序（成本次优）
        return a.cost.total - b.cost.total;
      }
    });
    console.log(`[ModelEvaluator] 排序后的 candidates: ${candidateScores.map((c, i) => `${i}:${c.modelId}(${c.score.toFixed(2)})`).join(', ')}`);

    // 6. 返回最佳选择（带结构化理由和负载信息）
    if (candidateScores.length > 0) {
      const best = candidateScores[0];
      const loadStatus = this.statusMonitor ? this.statusMonitor.getModelLoadStatus(best.modelId) : null;

      console.log(`[ModelEvaluator] 选择模型：${best.modelId} (score: ${best.score.toFixed(2)}, cost: $${best.cost.total.toFixed(6)}, load: ${loadStatus?.loadScore?.toFixed(2) || 'N/A'})`);

      return {
        modelId: best.modelId,
        model: best.model,
        cost: best.cost,
        reason: best.reason, // 向后兼容：保留文本理由
        selectionReason: this.buildStructuredReason(best, candidateScores, subtask), // 结构化理由
        load_info: loadStatus, // 负载信息：供执行器参考
        alternatives: (() => {
          // 保留前5名作为备选模型（可配置化）
          const maxAlternatives = this.configManager?.getMaxAlternatives?.() || 5;
          const sliced = candidateScores.slice(1, maxAlternatives + 1);
          console.log(`[ModelEvaluator] slice(1, ${maxAlternatives + 1})后的 alternatives: ${sliced.map((c, i) => `${i}:${c.modelId}(${c.score.toFixed(2)})`).join(', ')}`);
          return sliced.map((c, index) => ({
            modelId: c.modelId,
            cost: c.cost,
            score: c.score, // 添加评分信息，用于备选模型排序
            rank: index + 2, // 排名：第2名、第3名...
            reason: c.reason,
            load_info: this.statusMonitor ? this.statusMonitor.getModelLoadStatus(c.modelId) : null
          }));
        })(),
        tokenEstimate: tokenEstimate,
        // 添加规则评估的完整结果，用于后续学习器融合
        ruleBasedResult: {
          score: best.score,
          reason: best.reason,
          matchedRule: best.matchedRule
        }
      };
    }

    // 如果没有找到合适的模型，返回默认模型（使用配置文件中存在的模型）
    // 优先使用 MiniMax-M2.5，如果不存在则使用第一个可用模型
    const fallbackModelId = 'MiniMax-M2.5';
    let defaultModel = this.modelRegistry.getModel(fallbackModelId);
    let actualFallbackModelId = fallbackModelId;

    // 如果配置的默认模型不存在，使用第一个可用模型
    if (!defaultModel) {
      const availableModels = this.modelRegistry.getAvailableModels();
      if (availableModels.length > 0) {
        defaultModel = availableModels[0];
        actualFallbackModelId = defaultModel.id;
      }
    }

    // 如果仍然没有可用模型，抛出错误
    if (!defaultModel) {
      console.error('[ModelEvaluator] 严重错误：模型注册表中没有任何可用模型');
      throw new Error('No available models in registry');
    }

    console.warn(`[ModelEvaluator] 未找到匹配模型，使用默认模型 ${actualFallbackModelId}`);

    return {
      modelId: actualFallbackModelId,
      model: defaultModel,
      cost: { input: 0, output: 0, total: 0 },
      reason: `未找到匹配模型，使用默认模型 ${actualFallbackModelId}`,
      selectionReason: {
        decisionType: 'default-fallback',
        primaryReason: 'no_matching_models',
        description: `未找到匹配模型，使用默认模型 ${actualFallbackModelId}`,
        factors: {},
        timestamp: new Date().toISOString()
      },
      alternatives: [],
      tokenEstimate: tokenEstimate,
      ruleBasedResult: {
        score: 0,
        reason: '未找到匹配模型',
        matchedRule: null
      }
    };
  }

  /**
   * 构建结构化选择理由
   */
  buildStructuredReason(best, allCandidates, subtask) {
    const factors = {};
    const decisionFactors = [];

    // 1. 记录匹配的规则
    if (best.matchedRule) {
      factors.matchedRule = {
        ruleId: best.matchedRule.id || best.matchedRule.taskTypes?.join('-') || 'unknown',
        ruleType: best.matchedRule.type || 'default',
        priority: best.matchedRule.priority || best.score || 0,
        weight: best.matchedRule.weight || 1.0
      };
      decisionFactors.push({
        factor: 'rule_match',
        description: `匹配规则: ${best.matchedRule.reason || best.matchedRule.taskTypes?.join(', ')}`,
        impact: 'high',
        weight: best.matchedRule.weight || 1.0
      });
    }

    // 2. 记录成本因素
    factors.cost = {
      estimatedCost: best.cost.total,
      effectiveTotal: best.cost.effectiveTotal || best.cost.total,
      resourceCostFactor: best.cost.resourceCostFactor || 1.0,
      isLowestCost: allCandidates.every(c => (c.cost.effectiveTotal || c.cost.total) >= (best.cost.effectiveTotal || best.cost.total)),
      costRank: allCandidates
        .slice()  // 创建副本，避免修改原数组
        .sort((a, b) => (a.cost.effectiveTotal || a.cost.total) - (b.cost.effectiveTotal || b.cost.total))
        .findIndex(c => c.modelId === best.modelId) + 1,
      totalCandidates: allCandidates.length
    };

    // 如果是本地模型且有资源成本因子，特别记录
    if (best.cost.resourceCostFactor && best.cost.resourceCostFactor > 1.0) {
      factors.resourceCost = {
        factor: best.cost.resourceCostFactor,
        breakdown: best.cost.resourceBreakdown
      };
      decisionFactors.push({
        factor: 'resource_aware_cost',
        description: `本地模型资源成本因子: ${best.cost.resourceCostFactor.toFixed(2)}`,
        impact: 'medium',
        weight: 0.3
      });
    }

    if (factors.cost.isLowestCost) {
      decisionFactors.push({
        factor: 'cost_optimization',
        description: '选择了成本最低的模型',
        impact: 'medium',
        weight: 0.5
      });
    }

    // 3. 记录模型类型因素（本地/云端）
    if (best.cost.isLocal) {
      factors.modelType = 'local';
      decisionFactors.push({
        factor: 'local_model_preference',
        description: '优先选择本地模型（零成本、隐私保护）',
        impact: 'medium',
        weight: 0.3
      });
    }

    // 4. 记录负载因素
    const loadScore = this.get_model_load(best.modelId);
    factors.load = {
      loadScore: loadScore,
      isLowLoad: loadScore < 0.5
    };
    if (loadScore < 0.3) {
      decisionFactors.push({
        factor: 'low_load',
        description: `模型负载较低 (${(loadScore * 100).toFixed(1)}%)`,
        impact: 'low',
        weight: 0.2
      });
    }

    // 5. 记录任务类型 - 使用 types 数组
    const types = subtask.types || [];
    factors.taskInfo = {
      taskType: types.length > 0 ? types[0].type : 'general',
      taskSubtype: subtask.subtype || null,
      confidence: types.length > 0 ? types[0].confidence : 1.0,
      complexity: subtask.complexity || 0.5
    };

    // 6. 计算各因素的综合得分
    const compositeScore = this.calculateCompositeScore(best, factors);

    const fullReason = {
      decisionType: 'model-selection',
      selectedModel: best.modelId,
      primaryReason: this.determinePrimaryReason(decisionFactors),
      factors: factors,
      decisionFactors: decisionFactors,
      compositeScore: compositeScore,
      alternativesConsidered: allCandidates.length - 1,
      skippedModels: allCandidates
        .filter(c => c.modelId !== best.modelId)
        .map(c => ({
          modelId: c.modelId,
          skippedReason: this.getSkipReason(c, best),
          score: c.score,
          cost: c.cost.total
        })),
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    // 根据配置裁剪selectionReason
    return this.trimSelectionReason(fullReason);
  }

  /**
   * 根据配置裁剪selectionReason的大小
   */
  trimSelectionReason(reason) {
    if (!this.configManager) {
      return reason; // 如果没有配置管理器，返回完整原因
    }

    const loggingConfig = this.configManager.getMonitoringConfig('logging', {});

    // 检查是否需要包含selectionReason
    if (loggingConfig.includeSelectionReason === false) {
      return undefined;
    }

    // 如果指定了字段列表，则只保留指定字段
    if (Array.isArray(loggingConfig.selectionReasonFields)) {
      const trimmed = {};
      for (const field of loggingConfig.selectionReasonFields) {
        if (reason.hasOwnProperty(field)) {
          trimmed[field] = reason[field];
        }
      }
      return trimmed;
    }

    // 如果设置了大小限制，对超大的reason对象进行裁剪
    const jsonString = JSON.stringify(reason);
    if (loggingConfig.maxSizeLimit && jsonString.length > loggingConfig.maxSizeLimit) {
      // 只保留核心字段
      return {
        decisionType: reason.decisionType,
        selectedModel: reason.selectedModel,
        primaryReason: reason.primaryReason,
        factors: {
          matchedRule: reason.factors?.matchedRule,
          cost: reason.factors?.cost,
          taskInfo: reason.factors?.taskInfo
        },
        timestamp: reason.timestamp,
        version: reason.version,
        truncated: true // 标记已被截断
      };
    }

    return reason;
  }

  /**
   * 计算综合得分
   */
  calculateCompositeScore(best, factors) {
    let score = best.score || 0;

    // 成本调整
    if (factors.cost?.isLowestCost) {
      score += 0.1;
    }

    // 本地模型奖励
    if (factors.modelType === 'local') {
      score += 0.05;
    }

    // 低负载奖励
    if (factors.load?.isLowLoad) {
      score += 0.05;
    }

    return Math.min(1.0, score);
  }

  /**
   * 确定主要原因
   */
  determinePrimaryReason(decisionFactors) {
    if (decisionFactors.length === 0) {
      return 'default-selection';
    }

    // 按权重排序，返回影响最大的因素
    const sortedFactors = decisionFactors.sort((a, b) => b.weight - a.weight);
    return sortedFactors[0].factor;
  }

  /**
   * 获取跳过某模型的原因
   */
  getSkipReason(candidate, best) {
    if (candidate.score < best.score) {
      return 'lower_quality_score';
    }
    if (candidate.cost.total > best.cost.total) {
      return 'higher_cost';
    }
    const candidateLoad = this.get_model_load(candidate.modelId);
    const bestLoad = this.get_model_load(best.modelId);
    if (candidateLoad > bestLoad + 0.2) {
      return 'higher_load';
    }
    return 'not-optimal-combination';
  }

  /**
   * 获取候选模型
   * @param {string} taskType - 任务类型
   * @returns {Array} 候选模型列表
   */
  getCandidateModels(taskType) {
    const models = this.modelRegistry.getModelsByTaskType(taskType);

    if (models.length === 0) {
      console.warn(`[ModelEvaluator] 任务类型 "${taskType}" 没有专用模型，使用通用模型`);
      // 如果没有专用模型，返回所有可用模型
      return this.modelRegistry.getAvailableModels()
        .map(model => ({
          modelId: model.id,
          model: model,
          score: model.qualityScore * 0.1,
          reason: '通用候选模型'
        }));
    }

    return models.map(model => ({
      modelId: model.id,
      model: model,
      score: 0,  // 初始分数为 0，将在 applySelectionRules 中计算
      reason: '候选模型'
    }));
  }

  /**
   * 应用选择规则
   * @param {Array} candidates - 候选模型列表
   * @param {string} taskType - 任务类型
   * @param {number} confidence - 置信度
   * @param {Object} matchedRule - 匹配的规则
   * @param {Object} subtask - 子任务对象
   * @returns {Array} 评分后的候选模型列表
   */
  applySelectionRules(candidates, taskType, confidence, matchedRule, subtask) {
    const rules = this.configManager.getRulesForTaskType(taskType);
    const strategyConfig = this.configManager.getStrategyConfig();

    // 应用规则进行加权评分
    return candidates.map(candidate => {
      let score = candidate.model.qualityScore * 0.1; // 基础分数
      let reason = "基于模型基础质量评分";

      // 检查是否有匹配的规则
      for (const rule of rules) {
        if (rule.preferredModels.includes(candidate.modelId)) {
          score += rule.weight * 10; // 首选模型加分
          reason = rule.reason;
          break;
        } else if (rule.fallbackModels.includes(candidate.modelId)) {
          score += rule.weight * 5; // 备选模型加少量分
        }
      }

      // 基于置信度调整分数 - 当置信度较低时，提升高质量模型的权重
      if (confidence < 0.8) {
        // 低置信度场景下，优先选择高质量模型
        const qualityBoost = (1.0 - confidence) * 5;
        score += (candidate.model.qualityScore / 10) * qualityBoost;
        reason += `，因置信度较低(${confidence.toFixed(2)})提升质量权重`;
      }

      // 基于匹配规则的特殊处理
      if (matchedRule && matchedRule.keywords) {
        // 某些关键词可能暗示特定的模型偏好
        const highPriorityKeywords = ['安全', '加密', 'auth', 'security', 'validation'];
        const hasHighPriorityKeyword = matchedRule.keywords && matchedRule.keywords.some(keyword =>
          highPriorityKeywords.some(priority =>
            keyword.toLowerCase().includes(priority.toLowerCase())
          )
        );

        if (hasHighPriorityKeyword) {
          // 对于安全相关任务，提升高质量模型的权重
          score += candidate.model.qualityScore * 0.2;
          reason += '，检测到安全相关关键词，优先选择高质量模型';
        }
      }

      // 增加对任务复杂度的评估
      const complexityAdjustment = this.evaluateComplexity(candidate.model, subtask);
      score += complexityAdjustment.adjustment;
      reason += complexityAdjustment.reason;

      // 增加对更细粒度任务类型的评估
      const subtaskType = subtask.subtype || subtask.subtaskType;
      if (subtaskType) {
        const subtypeAdjustment = this.evaluateSubtaskType(subtaskType, candidate.modelId);
        score += subtypeAdjustment.adjustment;
        reason += subtypeAdjustment.reason;
      }

      return {
        ...candidate,
        score: score,
        reason: reason,
        matchedRule: matchedRule // 保留匹配的规则信息
      };
    });
  }

  /**
   * 评估任务复杂度
   */
  evaluateComplexity(model, subtask) {
    let adjustment = 0;
    let reason = '';

    // 分析任务描述中的复杂度指示词
    const description = subtask.description || '';
    const complexityIndicators = {
      '复杂': 0.3,
      '高性能': 0.4,
      '算法': 0.3,
      '优化': 0.2,
      '重构': 0.25,
      '调试': 0.2,
      '多线程': 0.4,
      '并发': 0.35,
      '分布式': 0.5,
      '大规模': 0.3,
      '大量数据': 0.35,
      '机器学习': 0.45,
      '深度学习': 0.5,
      '人工智能': 0.4,
      '图形处理': 0.3,
      '加密': 0.35,
      '区块链': 0.4,
      '安全': 0.3
    };

    for (const [indicator, weight] of Object.entries(complexityIndicators)) {
      if (description.toLowerCase().includes(indicator.toLowerCase())) {
        adjustment += weight * 5; // 转换为评分系统
        if (!reason.includes(indicator)) {
          reason += `，检测到复杂度关键词"${indicator}"`;
        }
      }
    }

    // 基于预期代码量估算复杂度
    if (subtask.expectedSize) {
      if (subtask.expectedSize > 500) { // 500+ 行代码
        adjustment += 0.5 * 5; // 很复杂的任务
        reason += '，预计代码量较大';
      } else if (subtask.expectedSize > 200) { // 200-500 行代码
        adjustment += 0.3 * 5; // 相对复杂的任务
        reason += '，预计代码量中等';
      }
    }

    // 检查依赖复杂度
    if (subtask.dependencies && subtask.dependencies.length > 5) {
      adjustment += 0.2 * 5; // 多依赖项增加复杂度
      reason += '，依赖关系较多';
    }

    // 检查技术栈复杂度
    if (subtask.technologies && subtask.technologies.some(tech =>
      ['webassembly', 'kernel', 'driver', 'compiler', 'protocol'].includes(tech.toLowerCase()))) {
      adjustment += 0.4 * 5; // 底层技术通常更复杂
      reason += '，涉及底层或专业技术栈';
    }

    return { adjustment, reason };
  }

  /**
   * 评估细粒度子任务类型
   */
  evaluateSubtaskType(subtaskType, modelId) {
    let adjustment = 0;
    let reason = '';

    // 定义子任务类型与模型匹配规则
    const subtypeRules = {
      'component': { preferred: ['claude-sonnet-4-6', 'gpt-4o-mini'], reason: ', 组件开发优先选用逻辑清晰的模型' },
      'page': { preferred: ['gemini-2.0-flash', 'gpt-4o-mini'], reason: ', 页面开发优先选用UI能力强的模型' },
      'layout': { preferred: ['gemini-2.0-flash', 'claude-sonnet-4-6'], reason: ', 布局开发优先选用UI和逻辑兼备的模型' },
      'api': { preferred: ['claude-sonnet-4-6', 'deepseek-coder'], reason: ', API开发优先选用逻辑推理强的模型' },
      'database': { preferred: ['claude-sonnet-4-6', 'gpt-4o-mini'], reason: ', 数据库相关任务优先选用逻辑清晰的模型' },
      'authentication': { preferred: ['claude-sonnet-4-6', 'claude-opus-4-6'], reason: ', 认证任务优先选用高质量模型' },
      'security': { preferred: ['claude-sonnet-4-6', 'claude-opus-4-6'], reason: ', 安全相关任务优先选用高质量模型' },
      'algorithm': { preferred: ['claude-sonnet-4-6', 'deepseek-coder'], reason: ', 算法实现优先选用逻辑推理强的模型' },
      'performance': { preferred: ['claude-sonnet-4-6', 'gpt-4o'], reason: ', 性能优化优先选用高级模型' },
      'testing': { preferred: ['deepseek-coder', 'gpt-4o-mini'], reason: ', 测试任务可使用性价比较高的模型' },
      'debugging': { preferred: ['claude-sonnet-4-6', 'claude-opus-4-6'], reason: ', 调试任务优先选用高质量模型' },
      'refactoring': { preferred: ['claude-sonnet-4-6', 'claude-opus-4-6'], reason: ', 重构任务优先选用高质量模型' }
    };

    if (subtypeRules[subtaskType]) {
      const rule = subtypeRules[subtaskType];
      if (rule.preferred.includes(modelId)) {
        adjustment += 0.5 * 5; // 适合该子任务类型的模型加分
        reason = rule.reason;
      } else {
        // 如果模型不是首选但可以胜任，给予中等加分
        const taskTypeBase = subtaskType.split('-')[0] || subtaskType.substring(0, 3);
        const capableModels = this.modelRegistry.getModelsByTaskType(taskTypeBase);
        if (capableModels.some(m => m.id === modelId)) {
          adjustment += 0.2 * 5; // 能胜任但非首选的模型中等加分
        }
      }
    }

    return { adjustment, reason };
  }

  /**
   * 估算 Token 消耗
   * @param {Object} subtask - 子任务对象
   * @returns {Object} Token 估算结果
   */
  estimateTokens(subtask) {
    // 使用 types 数组获取主类型
    const types = subtask.types || [];
    const taskType = types.length > 0 ? types[0].type : 'general';
    const description = subtask.description || '';

    // 基于任务类型的基础估算
    const baseEstimates = {
      'ui': { input: 500, output: 2000 },
      'style': { input: 400, output: 1500 },
      'logic': { input: 600, output: 1800 },
      'api': { input: 400, output: 1000 },
      'test': { input: 500, output: 1500 },
      'model': { input: 500, output: 1200 },
      'config': { input: 300, output: 500 },
      'general': { input: 450, output: 1200 }
    };

    const base = baseEstimates[taskType] || baseEstimates.general;

    // 根据描述长度调整估算
    const lengthFactor = Math.max(0.5, Math.min(2.0, description.length / 100));

    // 计算基础估算
    let inputEstimate = Math.round(base.input * lengthFactor);

    // 检查是否提供了额外的上下文信息
    if (subtask.contextInfo) {
      // 从Decomposer获取的完整提示词内容
      if (subtask.contextInfo.fullPrompt) {
        // 估算完整提示词的token数量 (粗略估算：字符数/4 ≈ token数)
        const promptTokenEstimate = Math.floor(subtask.contextInfo.fullPrompt.length / 4);
        inputEstimate = Math.max(inputEstimate, promptTokenEstimate);
      }

      // 或者通过结构化上下文估算
      if (subtask.contextInfo.context || subtask.contextInfo.requirements || subtask.contextInfo.constraints) {
        // 计算各种上下文部分的长度
        const contextLength = (subtask.contextInfo.context || '').length +
                              (subtask.contextInfo.requirements || '').length +
                              (subtask.contextInfo.constraints || '').length +
                              (subtask.contextInfo.files || []).reduce((sum, file) => sum + (file.content || '').length, 0);

        // 将上下文长度转换为token估算
        const contextTokenEstimate = Math.floor(contextLength / 4);
        inputEstimate += contextTokenEstimate;
      }

      // 考虑额外的安全余量以防止上下文溢出
      if (subtask.contextInfo.safetyMargin) {
        inputEstimate = Math.floor(inputEstimate * subtask.contextInfo.safetyMargin);
      } else {
        // 默认增加20%的安全余量
        inputEstimate = Math.floor(inputEstimate * 1.2);
      }
    } else {
      // 如果没有额外上下文信息，则添加一个小的安全余量
      inputEstimate = Math.floor(inputEstimate * 1.1);
    }

    return {
      input: inputEstimate,
      output: Math.round(base.output * lengthFactor)
    };
  }

  /**
   * 计算成本（带资源成本因子）
   * 对于本地模型，虽然基础成本为0，但要考虑硬件资源占用（如GPU内存、CPU时间）对整体吞吐量的影响
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {Object} 成本计算结果
   */
  calculateCostWithResourceFactor(model, tokenEstimate) {
    const basicCost = this.calculateCost(model, tokenEstimate);

    // 对于本地模型，计算资源成本因子
    if (model.type === 'local') {
      const resourceFactor = this.calculateResourceCostFactor(model, tokenEstimate);

      // 计算包含资源成本的有效成本
      const effectiveTotal = basicCost.total * resourceFactor;

      // 计算各项资源成本分摊
      const effectiveInputCost = basicCost.input * resourceFactor;
      const effectiveOutputCost = basicCost.output * resourceFactor;

      return {
        input: basicCost.input,
        output: basicCost.output,
        total: basicCost.total,
        effectiveTotal: effectiveTotal, // 包含资源成本的有效总成本
        resourceCostFactor: resourceFactor, // 资源成本因子
        isLocal: true, // 标记是否为本地模型
        resourceBreakdown: this.getResourceBreakdown(model, tokenEstimate, resourceFactor) // 资源成本分解
      };
    }

    // 对于云模型，返回原始成本
    return basicCost;
  }

  /**
   * 计算本地模型的资源成本因子
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {number} 资源成本因子（>= 1.0）
   */
  calculateResourceCostFactor(model, tokenEstimate) {
    // GPU显存压力因子
    const gpuMemoryFactor = this.calculateGpuMemoryFactor(model, tokenEstimate);

    // CPU利用率因子
    const cpuFactor = this.calculateCpuFactor(model, tokenEstimate);

    // 模型大小/计算复杂度因子
    const modelSizeFactor = this.calculateModelSizeFactor(model, tokenEstimate);

    // 计算综合资源成本因子（取平均值并确保不低于1.0）
    const combinedFactor = (gpuMemoryFactor + cpuFactor + modelSizeFactor) / 3.0;

    // 返回至少为1.0的资源成本因子（1.0表示无额外资源成本，>1.0表示有额外资源成本）
    return Math.max(1.0, combinedFactor);
  }

  /**
   * 计算GPU显存压力因子
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {number} GPU显存压力因子
   */
  calculateGpuMemoryFactor(model, tokenEstimate) {
    // 如果模型有硬件规格信息
    if (model.hardwareSpecs && model.hardwareSpecs.gpu) {
      const { memoryGB } = model.hardwareSpecs.gpu;

      // 基于输入输出token数量估算显存需求增长
      const tokenPressure = Math.min(1.0, (tokenEstimate.input + tokenEstimate.output) / 100000); // 假设100k tokens为高压力基准

      // 模型显存占用系数（基于模型大小）
      const modelMemoryPressure = model.size && typeof model.size === 'number' ?
        Math.min(1.0, model.size / 32) : 0.3; // 假设32B为最大模型参考

      // 显存压力因子：基础压力 + token相关压力
      const basePressure = 0.5; // 基础资源开销
      const memoryFactor = basePressure + (0.3 * modelMemoryPressure) + (0.2 * tokenPressure);

      return Math.max(1.0, memoryFactor);
    }

    // 如果没有GPU规格信息，默认返回较低的资源成本
    return 1.1; // 略高于1，表示有基础资源成本
  }

  /**
   * 计算CPU利用率因子
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {number} CPU利用率因子
   */
  calculateCpuFactor(model, tokenEstimate) {
    // 基于token数量估算CPU负载
    const tokenCount = tokenEstimate.input + tokenEstimate.output;

    // CPU负载因子（随token数量增加而增加）
    const cpuLoadFactor = Math.min(0.8, 0.1 + (tokenCount / 200000)); // 200k tokens为高CPU负载参考

    // 模型计算复杂度（如果模型有复杂度指标）
    const computeIntensity = model.computeIntensity || 0.5; // 默认中等复杂度

    // CPU因子：基础成本 + 负载相关成本
    const baseCpuCost = 0.3; // 基础CPU资源开销
    const cpuFactor = baseCpuCost + (cpuLoadFactor * 0.4) + (computeIntensity * 0.3);

    return Math.max(1.0, cpuFactor);
  }

  /**
   * 计算模型大小/计算复杂度因子
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {number} 模型复杂度因子
   */
  calculateModelSizeFactor(model, tokenEstimate) {
    // 模型参数量或大小对资源的影响
    const sizeFactor = model.size && typeof model.size === 'number' ?
      Math.min(1.5, 0.5 + (model.size / 16)) : 0.8; // 基于模型大小（假设16B为参考点）

    // 基于任务预期响应时间的因子
    const responseTimeFactor = model.responseTime ?
      Math.min(1.3, 0.7 + (model.responseTime / 10000)) : 0.8; // 响应时间越长，资源成本越高

    // 综合模型复杂度因子
    const modelComplexityFactor = (sizeFactor + responseTimeFactor) / 2;

    return Math.max(1.0, modelComplexityFactor);
  }

  /**
   * 获取资源成本分解
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @param {number} resourceFactor - 资源成本因子
   * @returns {Object} 资源成本分解
   */
  getResourceBreakdown(model, tokenEstimate, resourceFactor) {
    return {
      gpuMemoryFactor: this.calculateGpuMemoryFactor(model, tokenEstimate),
      cpuFactor: this.calculateCpuFactor(model, tokenEstimate),
      modelSizeFactor: this.calculateModelSizeFactor(model, tokenEstimate),
      totalResourceFactor: resourceFactor,
      estimatedTokenLoad: tokenEstimate.input + tokenEstimate.output,
      baseCost: this.calculateCost(model, tokenEstimate).total
    };
  }

  /**
   * 计算成本（原有方法，保持向后兼容）
   * 对于本地模型，成本为0，但我们仍然需要考虑其他因素（如硬件资源限制）
   * @param {Object} model - 模型对象
   * @param {Object} tokenEstimate - Token 估算结果
   * @returns {Object} 成本计算结果
   */
  calculateCost(model, tokenEstimate) {
    const inputCost = (tokenEstimate.input / 1000) * model.pricing.input;
    const outputCost = (tokenEstimate.output / 1000) * model.pricing.output;
    const total = inputCost + outputCost;

    // 对于本地模型，我们添加一些虚拟成本，以便在排序时可以与其他因素平衡
    // 但保持总成本为0或接近0
    let effectiveTotal = total;
    if (model.type === 'local') {
      // 本地模型虽然成本为0，但要考虑其他资源使用
      // 在某些排序场景中，我们可以使用虚拟成本来平衡其他因素
      effectiveTotal = total; // 实际成本仍然为0
    }

    return {
      input: inputCost,
      output: outputCost,
      total: total,
      effectiveTotal: effectiveTotal, // 有效成本，可用于排序
      isLocal: model.type === 'local' // 标记是否为本地模型
    };
  }

  /**
   * 批量评估模型
   * @param {Array} subtasks - 子任务列表
   * @returns {Array} 模型选择结果列表
   */
  batchSelect(subtasks) {
    console.log(`[ModelEvaluator] 批量评估 ${subtasks.length} 个任务...`);
    return subtasks.map(subtask => this.selectBestModel(subtask));
  }
}

module.exports = ModelEvaluator;
