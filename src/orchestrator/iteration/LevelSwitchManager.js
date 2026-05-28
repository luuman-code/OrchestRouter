/**
 * 层级切换管理器
 *
 * 管理 L1/L2/L3 之间的切换逻辑
 */

class LevelSwitchManager {
  constructor(config = {}) {
    this.config = {
      // L1到L2的切换阈值
      l1ToL2Threshold: config.l1ToL2Threshold || 0.4, // 提高到0.4，避免过早升级
      // L2到L3的切换阈值
      l2ToL3Threshold: config.l2ToL3Threshold || 0.3, // 提高到0.3，更谨慎地升级到L3
      // L3到L2的切换阈值
      l3ToL2Threshold: config.l3ToL2Threshold || 0.75, // 稍微提高，确保质量
      // L2到L1的切换阈值
      l2ToL1Threshold: config.l2ToL1Threshold || 0.85, // 稍微提高，确保稳定后再降级

      // 切换条件
      maxL1FailuresBeforeUpgrade: config.maxL1FailuresBeforeUpgrade || 3,
      maxL2IterationsBeforeUpgrade: config.maxL2IterationsBeforeUpgrade || 5,
      minL3QualityBeforeDowngrade: config.minL3QualityBeforeDowngrade || 0.9,

      // 时间阈值
      l1TimeoutMs: config.l1TimeoutMs || 60000, // 1分钟
      l2TimeoutMs: config.l2TimeoutMs || 300000, // 5分钟
      l3TimeoutMs: config.l3TimeoutMs || 600000, // 10分钟

      // 稳定性阈值
      stabilityWindow: config.stabilityWindow || 3, // 检查最近3次迭代的稳定性

      ...config
    };

    // 跟踪切换历史
    this.switchHistory = new Map();
  }

  /**
   * 决定下一个迭代层级
   */
  async determineNextLevel(currentLevel, iterationResult, context = {}) {
    const decision = {
      currentLevel,
      nextLevel: currentLevel,
      confidence: 0.5,
      reason: 'no_change',
      shouldSwitch: false,
      switchType: 'none'
    };

    switch (currentLevel) {
      case 'L1':
        return this.decideL1ToNext(iterationResult, context, decision);
      case 'L2':
        return this.decideL2ToNext(iterationResult, context, decision);
      case 'L3':
        return this.decideL3ToNext(iterationResult, context, decision);
      default:
        return decision;
    }
  }

  /**
   * 决定从L1到下一层级
   */
  decideL1ToNext(iterationResult, context, decision) {
    decision.nextLevel = 'L1'; // 默认保持当前层级

    // 检查L1连续失败次数
    const l1FailureCount = context.l1FailureCount || 0;
    if (l1FailureCount >= this.config.maxL1FailuresBeforeUpgrade) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = `L1连续失败${l1FailureCount}次，达到阈值${this.config.maxL1FailuresBeforeUpgrade}`;
      decision.confidence = 0.9;
    }
    // 检查质量分数 - 需要考虑趋势而非仅当前分数
    else if (iterationResult.qualityScore !== undefined && iterationResult.qualityScore < this.config.l1ToL2Threshold) {
      // 检查质量趋势，如果持续下降则更倾向于升级
      const qualityTrend = this.calculateQualityTrend(context);
      if (qualityTrend < -0.05) { // 质量分数显著下降
        decision.nextLevel = 'L2';
        decision.shouldSwitch = true;
        decision.switchType = 'upgrade';
        decision.reason = `质量分数(${iterationResult.qualityScore.toFixed(2)})低于L1-L2阈值(${this.config.l1ToL2Threshold})且呈显著下降趋势`;
        decision.confidence = 0.9;
      } else {
        decision.nextLevel = 'L2';
        decision.shouldSwitch = true;
        decision.switchType = 'upgrade';
        decision.reason = `质量分数(${iterationResult.qualityScore.toFixed(2)})低于L1-L2阈值(${this.config.l1ToL2Threshold})`;
        decision.confidence = 0.8;
      }
    }
    // 检查错误率
    else if (iterationResult.errorRate !== undefined && iterationResult.errorRate > 0.3) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = `错误率(${iterationResult.errorRate.toFixed(2)})过高`;
      decision.confidence = 0.7;
    }
    // 检查是否遇到复杂问题
    else if (iterationResult.requiresDeepChanges) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = '检测到需要深度修改的问题';
      decision.confidence = 0.85;
    }
    // 如果质量分数在中间区域，检查稳定性
    else if (iterationResult.qualityScore !== undefined &&
             iterationResult.qualityScore >= this.config.l1ToL2Threshold &&
             iterationResult.qualityScore < this.config.l2ToL1Threshold) {
      // 质量分数在中间区域，考虑稳定性
      const isStable = this.isStable({ ...iterationResult, qualityScore: iterationResult.qualityScore }, context);
      if (isStable && iterationResult.qualityScore > 0.6) {
        decision.nextLevel = 'L1';
        decision.shouldSwitch = false;
        decision.reason = '质量分数虽未达降级阈值但趋于稳定';
        decision.confidence = 0.75;
      } else {
        decision.nextLevel = 'L1'; // 保持当前层级，让迭代继续观察
        decision.shouldSwitch = false;
        decision.reason = '质量分数处于中间区域，继续观察';
        decision.confidence = 0.6;
      }
    }
    // 如果一切顺利且质量很高，考虑保持L1
    else if (iterationResult.qualityScore !== undefined && iterationResult.qualityScore > this.config.l2ToL1Threshold) {
      decision.nextLevel = 'L1';
      decision.shouldSwitch = false;
      decision.reason = '质量表现优秀，继续保持L1';
      decision.confidence = 0.95;
    }

    return decision;
  }

  /**
   * 决定从L2到下一层级
   */
  decideL2ToNext(iterationResult, context, decision) {
    decision.nextLevel = 'L2'; // 默认保持当前层级

    // 检查L2迭代次数
    const l2IterationCount = context.l2IterationCount || 0;
    if (l2IterationCount >= this.config.maxL2IterationsBeforeUpgrade) {
      decision.nextLevel = 'L3';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = `L2迭代次数(${l2IterationCount})达到阈值${this.config.maxL2IterationsBeforeUpgrade}`;
      decision.confidence = 0.8;
    }
    // 检查质量分数是否需要升级到L3
    else if (iterationResult.qualityScore !== undefined && iterationResult.qualityScore < this.config.l2ToL3Threshold) {
      decision.nextLevel = 'L3';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = `质量分数(${iterationResult.qualityScore.toFixed(2)})低于L2-L3阈值(${this.config.l2ToL3Threshold})`;
      decision.confidence = 0.75;
    }
    // 检查是否遇到架构问题
    else if (iterationResult.architectureIssues) {
      decision.nextLevel = 'L3';
      decision.shouldSwitch = true;
      decision.switchType = 'upgrade';
      decision.reason = '检测到架构问题，需要L3完整迭代';
      decision.confidence = 0.9;
    }
    // 检查质量是否足够好，可以降级到L1
    else if (iterationResult.qualityScore !== undefined && iterationResult.qualityScore > this.config.l2ToL1Threshold) {
      decision.nextLevel = 'L1';
      decision.shouldSwitch = true;
      decision.switchType = 'downgrade';
      decision.reason = `质量分数(${iterationResult.qualityScore.toFixed(2)})高于L2-L1阈值(${this.config.l2ToL1Threshold})，可降级`;
      decision.confidence = 0.7;
    }
    // 检查是否稳定
    else if (this.isStable(iterationResult, context)) {
      decision.nextLevel = 'L1';
      decision.shouldSwitch = true;
      decision.switchType = 'downgrade';
      decision.reason = '迭代已稳定，可降级到高效L1';
      decision.confidence = 0.65;
    }

    return decision;
  }

  /**
   * 决定从L3到下一层级
   */
  decideL3ToNext(iterationResult, context, decision) {
    decision.nextLevel = 'L3'; // 默认保持当前层级

    // 检查质量分数是否足够好，可以降级到L2
    if (iterationResult.qualityScore !== undefined && iterationResult.qualityScore > this.config.l3ToL2Threshold) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'downgrade';
      decision.reason = `质量分数(${iterationResult.qualityScore.toFixed(2)})高于L3-L2阈值(${this.config.l3ToL2Threshold})`;
      decision.confidence = 0.75;
    }
    // 检查是否还有架构问题
    else if (!iterationResult.architectureIssuesResolved) {
      decision.nextLevel = 'L3';
      decision.shouldSwitch = false;
      decision.reason = '架构问题未完全解决，需要继续L3';
      decision.confidence = 0.8;
    }
    // 检查是否达到了L3的目标
    else if (iterationResult.targetAchieved) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'downgrade';
      decision.reason = 'L3目标已达成，降级到L2进行精细调整';
      decision.confidence = 0.85;
    }
    // 如果L3已稳定且质量良好
    else if (this.isStable(iterationResult, context) &&
             iterationResult.qualityScore !== undefined &&
             iterationResult.qualityScore > this.config.minL3QualityBeforeDowngrade) {
      decision.nextLevel = 'L2';
      decision.shouldSwitch = true;
      decision.switchType = 'downgrade';
      decision.reason = 'L3已稳定且质量达标，可降级到L2';
      decision.confidence = 0.8;
    }

    return decision;
  }

  /**
   * 计算质量分数趋势
   */
  calculateQualityTrend(context) {
    const recentQualityScores = context.recentQualityScores || [];
    if (recentQualityScores.length < 2) {
      return 0; // 不足以判断趋势
    }

    // 使用最后几个分数来计算趋势
    const windowSize = Math.min(5, recentQualityScores.length);
    const recentScores = recentQualityScores.slice(-windowSize);

    // 计算斜率作为趋势
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < recentScores.length; i++) {
      sumX += i;
      sumY += recentScores[i];
      sumXY += i * recentScores[i];
      sumXX += i * i;
    }

    const n = recentScores.length;
    if (n === 1) return 0;

    // 简单线性回归斜率
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * 检查迭代是否稳定
   */
  isStable(iterationResult, context) {
    // 获取最近几次的迭代质量分数
    const recentQualityScores = context.recentQualityScores || [];
    if (recentQualityScores.length < this.config.stabilityWindow) {
      return false; // 不足以判断稳定性
    }

    // 获取窗口内的分数
    const windowScores = recentQualityScores.slice(-this.config.stabilityWindow);

    // 检查分数变化是否很小（稳定）
    const maxScore = Math.max(...windowScores);
    const minScore = Math.min(...windowScores);
    const scoreVariation = maxScore - minScore;

    // 如果分数变化小于5%，认为稳定
    return scoreVariation < 0.05;
  }

  /**
   * 评估切换的合理性
   */
  async evaluateSwitchReasonableness(fromLevel, toLevel, context = {}) {
    const evaluation = {
      fromLevel,
      toLevel,
      reasonable: false,
      reasons: [],
      riskLevel: 'medium',
      recommended: false
    };

    switch (fromLevel + '_to_' + toLevel) {
      case 'L1_to_L2':
        // 从L1升级到L2通常很合理
        evaluation.reasonable = true;
        evaluation.riskLevel = 'low';
        evaluation.reasons.push('L1无法满足质量要求');
        evaluation.recommended = true;
        break;

      case 'L2_to_L1':
        // 从L2降级到L1，需要确保稳定性
        evaluation.reasonable = context.stable && context.highQuality;
        evaluation.riskLevel = evaluation.reasonable ? 'low' : 'high';
        evaluation.reasons.push(evaluation.reasonable ? '质量稳定且高效' : '可能存在风险');
        evaluation.recommended = evaluation.reasonable;
        break;

      case 'L2_to_L3':
        // 从L2升级到L3，通常是解决架构问题
        evaluation.reasonable = true;
        evaluation.riskLevel = 'medium';
        evaluation.reasons.push('需要解决架构或设计问题');
        evaluation.recommended = true;
        break;

      case 'L3_to_L2':
        // 从L3降级到L2，通常在完成重大重构后
        evaluation.reasonable = context.qualityAchieved && context.architectureFixed;
        evaluation.riskLevel = 'low';
        evaluation.reasons.push('架构问题已解决，可精细化调整');
        evaluation.recommended = evaluation.reasonable;
        break;

      case 'L3_to_L1':
        // 从L3直接降到L1很少见
        evaluation.reasonable = false;
        evaluation.riskLevel = 'high';
        evaluation.reasons.push('通常不建议从L3直接降到L1');
        evaluation.recommended = false;
        break;

      default:
        evaluation.reasonable = fromLevel === toLevel; // 相同层级总是合理的
        evaluation.riskLevel = 'low';
        evaluation.reasons.push('保持当前层级');
        evaluation.recommended = evaluation.reasonable;
    }

    return evaluation;
  }

  /**
   * 记录切换历史
   */
  recordSwitch(sessionId, switchDecision) {
    if (!this.switchHistory.has(sessionId)) {
      this.switchHistory.set(sessionId, []);
    }

    const switchRecord = {
      timestamp: new Date().toISOString(),
      ...switchDecision,
      switchId: this.generateSwitchId()
    };

    const history = this.switchHistory.get(sessionId);
    history.push(switchRecord);

    // 限制历史记录大小
    if (history.length > 100) {
      this.switchHistory.set(sessionId, history.slice(-100));
    }

    return switchRecord;
  }

  /**
   * 获取切换历史
   */
  getSwitchHistory(sessionId, limit = 10) {
    const history = this.switchHistory.get(sessionId) || [];
    return history.slice(-limit).reverse(); // 返回最新的在前面
  }

  /**
   * 获取切换统计
   */
  getSwitchStatistics(sessionId) {
    const history = this.switchHistory.get(sessionId) || [];
    if (history.length === 0) {
      return {
        totalSwitches: 0,
        upgradeSwitches: 0,
        downgradeSwitches: 0,
        avgConfidence: 0
      };
    }

    const stats = {
      totalSwitches: history.length,
      upgradeSwitches: history.filter(h => h.switchType === 'upgrade').length,
      downgradeSwitches: history.filter(h => h.switchType === 'downgrade').length,
      avgConfidence: history.reduce((sum, h) => sum + h.confidence, 0) / history.length
    };

    return stats;
  }

  /**
   * 基于历史数据预测下一次切换可能性
   */
  predictNextSwitch(sessionId) {
    const history = this.switchHistory.get(sessionId) || [];
    if (history.length < 2) {
      return {
        prediction: 'insufficient_data',
        confidence: 0,
        recommendedLevel: null
      };
    }

    // 简单的趋势分析
    const recent = history.slice(-3);
    const levelChanges = recent.map(r => r.nextLevel).filter((level, i) =>
      i > 0 && recent[i-1].currentLevel !== level
    ).length;

    if (levelChanges >= 2) {
      // 最近频繁切换，可能处于不稳定状态
      return {
        prediction: 'frequent_switching_detected',
        confidence: 0.7,
        recommendedLevel: history[history.length - 1].currentLevel,
        reason: '检测到频繁层级切换，建议稳定在当前层级'
      };
    } else {
      // 相对稳定，根据最新决策给出建议
      const lastDecision = history[history.length - 1];
      return {
        prediction: 'stable_trend',
        confidence: 0.8,
        recommendedLevel: lastDecision.nextLevel,
        reason: '趋势稳定，按上次决策执行'
      };
    }
  }

  /**
   * 获取层级切换规则
   */
  getSwitchRules() {
    return {
      l1Rules: {
        upgradeThreshold: this.config.l1ToL2Threshold,
        maxFailures: this.config.maxL1FailuresBeforeUpgrade,
        timeout: this.config.l1TimeoutMs
      },
      l2Rules: {
        upgradeThreshold: this.config.l2ToL3Threshold,
        downgradeThreshold: this.config.l2ToL1Threshold,
        maxIterations: this.config.maxL2IterationsBeforeUpgrade,
        timeout: this.config.l2TimeoutMs
      },
      l3Rules: {
        downgradeThreshold: this.config.l3ToL2Threshold,
        minQualityForDowngrade: this.config.minL3QualityBeforeDowngrade,
        timeout: this.config.l3TimeoutMs
      },
      general: {
        stabilityWindow: this.config.stabilityWindow
      }
    };
  }

  /**
   * 更新切换规则
   */
  updateRules(newRules) {
    const updatedRules = { ...this.config };

    if (newRules.l1ToL2Threshold !== undefined) {
      updatedRules.l1ToL2Threshold = newRules.l1ToL2Threshold;
    }
    if (newRules.l2ToL3Threshold !== undefined) {
      updatedRules.l2ToL3Threshold = newRules.l2ToL3Threshold;
    }
    if (newRules.l3ToL2Threshold !== undefined) {
      updatedRules.l3ToL2Threshold = newRules.l3ToL2Threshold;
    }
    if (newRules.l2ToL1Threshold !== undefined) {
      updatedRules.l2ToL1Threshold = newRules.l2ToL1Threshold;
    }

    this.config = updatedRules;

    return { success: true, updatedRules };
  }

  /**
   * 生成切换ID
   */
  generateSwitchId() {
    return `switch_${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * 重置会话的切换历史
   */
  resetSessionHistory(sessionId) {
    if (this.switchHistory.has(sessionId)) {
      this.switchHistory.delete(sessionId);
      return { success: true, message: `Reset history for session ${sessionId}` };
    }
    return { success: false, message: `No history found for session ${sessionId}` };
  }
}

module.exports = LevelSwitchManager;