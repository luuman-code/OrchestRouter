/**
 * 策略组合器实现
 * 实现规则与学习结果的合并逻辑
 */
const IStrategyCombiner = require('../interfaces/IStrategyCombiner');
const ContextAnalyzer = require('./ContextAnalyzer');

class StrategyCombiner extends IStrategyCombiner {
  constructor(modelRegistry, learningSelector = null) {
    super();
    this.modelRegistry = modelRegistry;
    this.learningSelector = learningSelector;
    this.contextAnalyzer = new ContextAnalyzer();
  }

  /**
   * 设置学习选择器引用
   */
  setLearningSelector(learningSelector) {
    this.learningSelector = learningSelector;
  }

  /**
   * 根据融合策略合并规则和学习结果
   */
  merge(ruleEval, learningRec, subtask, integrationConfig) {
    const strategy = integrationConfig.strategy || 'hybrid';

    switch(strategy) {
      case 'rule_priority':
        // 规则优先：如果有规则评估结果，优先使用规则
        return ruleEval || this.createLearningBasedResult(learningRec);

      case 'learning_priority':
        // 学习优先：如果有高置信度学习推荐，优先使用学习
        if (learningRec && this.getConfidence(integrationConfig, learningRec.modelId, subtask?.type) > 0.7) {
          return this.createLearningBasedResult(learningRec, ruleEval);
        }
        return ruleEval;

      case 'contextual':
        // 上下文切换：根据任务特征选择策略
        return this.handleContextualStrategy(ruleEval, learningRec, subtask, integrationConfig);

      case 'hybrid':
      default:
        // 混合策略：综合考虑规则权重和学习置信度
        return this.handleHybridStrategy(ruleEval, learningRec, integrationConfig);
    }
  }

  /**
   * 处理上下文切换策略
   */
  handleContextualStrategy(ruleEval, learningRec, subtask, integrationConfig) {
    if (integrationConfig.contextual_switching?.enabled) {
      const context = this.analyzeContext(subtask);

      // 在某些上下文中优先使用规则
      if (
        (context.securityCritical && integrationConfig.contextual_switching.conditions?.security_critical) ||
        (context.highUncertainty && integrationConfig.contextual_switching.conditions?.high_uncertainty_tasks)
      ) {
        return ruleEval;
      }

      // 在某些上下文中优先使用学习
      if (
        (context.repetitiveTask && integrationConfig.contextual_switching.conditions?.repetitive_tasks) ||
        (context.performanceSensitive && integrationConfig.contextual_switching.conditions?.performance_sensitive)
      ) {
        if (learningRec && this.getConfidence(integrationConfig, learningRec.modelId, subtask?.type) > 0.7) {
          return this.createLearningBasedResult(learningRec, ruleEval);
        }
      }
    }

    // 如果没有匹配的上下文条件，使用混合策略
    return this.handleHybridStrategy(ruleEval, learningRec, integrationConfig);
  }

  /**
   * 处理混合策略
   */
  handleHybridStrategy(ruleEval, learningRec, integrationConfig) {
    const ruleWeight = integrationConfig.rule_weight || 0.6;
    const learningWeight = integrationConfig.learning_weight || 0.4;

    // 如果没有学习推荐，直接返回规则结果
    if (!learningRec) {
      return ruleEval;
    }

    // 如果没有规则结果，返回学习推荐
    if (!ruleEval || !ruleEval.modelId) {
      return this.createLearningBasedResult(learningRec, ruleEval);
    }

    // 如果规则和学习推荐是同一个模型，直接返回
    if (ruleEval.modelId === learningRec.modelId) {
      return ruleEval;
    }

    // 计算综合评分，偏向规则结果但受学习影响
    const ruleScore = ruleEval.score || 0;
    const learningConfidence = this.getConfidence(integrationConfig, learningRec.modelId, subtask?.type);

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
    return ruleEval;
  }

  /**
   * 创建基于学习的结果
   */
  createLearningBasedResult(learningRec, ruleEval = null) {
    if (!learningRec) {
      return ruleEval;
    }

    const model = this.modelRegistry.getModel(learningRec.modelId);
    const baseResult = {
      modelId: learningRec.modelId,
      model: model,
      reason: `学习推荐：${ruleEval?.reason || '基于历史表现'}`,
      cost: ruleEval?.cost || this.estimateCostForModel(learningRec.modelId),
      score: learningRec.score || learningRec.adjustedAvgScore || 0.7
    };

    if (ruleEval) {
      Object.assign(baseResult, ruleEval);
      baseResult.modelId = learningRec.modelId;
      baseResult.model = model;
      baseResult.reason = `学习推荐：${ruleEval.reason}`;
    }

    return baseResult;
  }

  /**
   * 分析任务上下文
   */
  analyzeContext(subtask) {
    return this.contextAnalyzer.analyzeContext(subtask);
  }

  /**
   * 获取模型置信度
   * @param {Object} integrationConfig - 融合配置
   * @param {string} modelId - 模型ID
   * @param {string} taskType - 任务类型（可选）
   * @returns {number} 置信度值 (0-1)
   */
  getConfidence(integrationConfig, modelId, taskType = 'general') {
    // 如果有学习选择器，尝试获取真实置信度
    if (this.learningSelector) {
      try {
        // 从 performanceWindows 获取该模型在该任务类型上的置信度
        const key = `${taskType}-${modelId}`;
        const window = this.learningSelector.performanceWindows?.get(key);
        if (window && window.length > 0) {
          // 使用最近的统计信息的置信度
          const latestStats = window[window.length - 1];
          if (latestStats && latestStats.confidence !== undefined) {
            return latestStats.confidence;
          }
        }
      } catch (error) {
        // 如果获取失败，使用默认置信度
        console.warn(`[StrategyCombiner] 获取置信度失败: ${error.message}`);
      }
    }

    // 回退到配置的最小置信度阈值
    return integrationConfig.min_learning_confidence || 0.7;
  }

  /**
   * 为指定模型估算成本
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
}

module.exports = StrategyCombiner;