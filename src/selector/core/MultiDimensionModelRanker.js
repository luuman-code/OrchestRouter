/**
 * MultiDimensionModelRanker - Core model ranking engine for multi-dimension weighted model selection
 */
class MultiDimensionModelRanker {
  constructor(config) {
    const { dimensionWeights, dimensionValues, suitabilityMatrix } = config;

    if (!dimensionWeights || !suitabilityMatrix) {
      throw new Error('MultiDimensionModelRanker requires dimensionWeights and suitabilityMatrix in config');
    }

    this.dimensionWeights = dimensionWeights;
    this.dimensionValues = dimensionValues || {};
    this.suitabilityMatrix = suitabilityMatrix;
  }

  /**
   * Calculate single dimension score
   * @param {string} modelId - Model identifier
   * @param {string} dimension - Dimension name (category, complexity, priority, quality, cost)
   * @param {string|number} value - Dimension value
   * @returns {number} - Score between 0-1
   */
  calculateDimensionScore(modelId, dimension, value) {
    const modelMatrix = this.suitabilityMatrix[modelId];

    if (!modelMatrix) {
      return 0;
    }

    const dimensionMatrix = modelMatrix[dimension];

    if (!dimensionMatrix) {
      return 0;
    }

    // Handle priority dimension: values are stored as strings "0", "1", "2", "3", "4", "5"
    let lookupValue = value;
    if (dimension === 'priority') {
      lookupValue = String(value);
    }

    const score = dimensionMatrix[lookupValue];

    if (score === undefined || score === null) {
      return 0;
    }

    return score;
  }

  /**
   * Calculate overall weighted score for a model
   * @param {string} modelId - Model identifier
   * @param {Array} taskTypes - Array of {dimension, value, weight} objects
   * @returns {number} - Weighted score between 0-1
   *
   * Formula: Score(M, T) = Σ(dimensionWeight_d * typeWeight_t * modelSuitability_dtv) / Σ(dimensionWeight_d * typeWeight_t)
   */
  calculateOverallScore(modelId, taskTypes) {
    if (!taskTypes || taskTypes.length === 0) {
      console.log(`[Ranker] taskTypes is empty or null`);
      return 0;
    }

    // 检查 modelId 是否在 suitabilityMatrix 中
    if (!this.suitabilityMatrix[modelId]) {
      console.log(`[Ranker] modelId "${modelId}" not found in suitabilityMatrix. Available: ${Object.keys(this.suitabilityMatrix).join(', ')}`);
    }

    let weightedSum = 0;
    let weightSum = 0;

    for (const taskType of taskTypes) {
      const { dimension, value, weight: typeWeight } = taskType;

      const dimensionWeight = this.dimensionWeights[dimension] || 0;
      const suitability = this.calculateDimensionScore(modelId, dimension, value);

      console.log(`[Ranker] modelId=${modelId}, dim=${dimension}, value=${value}, dimWeight=${dimensionWeight}, typeWeight=${typeWeight}, suitability=${suitability}`);

      const combinedWeight = dimensionWeight * typeWeight;

      weightedSum += combinedWeight * suitability;
      weightSum += combinedWeight;
    }

    if (weightSum === 0) {
      console.log(`[Ranker] modelId=${modelId}, weightSum=0, returning 0`);
      return 0;
    }

    const score = weightedSum / weightSum;
    console.log(`[Ranker] modelId=${modelId}, weightedSum=${weightedSum}, weightSum=${weightSum}, score=${score}`);
    return score;
  }

  /**
   * Rank available models for given task types
   * @param {Array} availableModels - Array of model IDs
   * @param {Array} taskTypes - Array of {dimension, value, weight} objects
   * @returns {Object} - Object with rankedModels array sorted by score descending
   */
  rankModels(availableModels, taskTypes) {
    if (!availableModels || availableModels.length === 0) {
      return { rankedModels: [], reason: 'No available models' };
    }

    const scoredModels = availableModels.map(modelId => {
      const score = this.calculateOverallScore(modelId, taskTypes);
      // 计算各维度的分项得分，便于调试
      const dimensionScores = {};
      for (const taskType of taskTypes) {
        const { dimension, value, weight: typeWeight } = taskType;
        const dimScore = this.calculateDimensionScore(modelId, dimension, value);
        dimensionScores[`${dimension}:${value}`] = {
          dimensionWeight: this.dimensionWeights[dimension] || 0,
          typeWeight: typeWeight,
          suitability: dimScore,
          weightedScore: dimScore * (this.dimensionWeights[dimension] || 0) * typeWeight
        };
      }
      return {
        modelId,
        score,
        dimensionScores
      };
    });

    // Sort by score descending
    scoredModels.sort((a, b) => b.score - a.score);

    // Assign ranks
    const rankedModels = scoredModels.map((item, index) => ({
      modelId: item.modelId,
      score: item.score,
      rank: index + 1,
      dimensionScores: item.dimensionScores
    }));

    return { rankedModels, reason: 'Based on multi-dimension weighted evaluation' };
  }
}

module.exports = MultiDimensionModelRanker;
