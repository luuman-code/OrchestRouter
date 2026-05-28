/**
 * ErrorClasses - 自定义错误类集合
 *
 * 定义执行器相关的自定义错误类型
 */

/**
 * ModelUnavailableError - 模型不可用错误
 * 当指定的模型暂时不可用时抛出
 */
class ModelUnavailableError extends Error {
  constructor(message, modelId, cause = null) {
    super(message || `Model ${modelId} is currently unavailable`);
    this.name = 'ModelUnavailableError';
    this.modelId = modelId;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModelUnavailableError);
    }
  }
}

/**
 * ExecutionError - 执行错误
 * 当任务执行过程中发生一般性错误时抛出
 */
class ExecutionError extends Error {
  constructor(message, taskId = null, modelId = null, cause = null) {
    super(message || 'An error occurred during task execution');
    this.name = 'ExecutionError';
    this.taskId = taskId;
    this.modelId = modelId;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExecutionError);
    }
  }
}

/**
 * FallbackError - 降级错误
 * 当所有降级选项都失败时抛出
 */
class FallbackError extends Error {
  constructor(message, originalModelId, fallbackModels = [], cause = null) {
    super(message || `All fallback models failed for original model ${originalModelId}`);
    this.name = 'FallbackError';
    this.originalModelId = originalModelId;
    this.fallbackModels = fallbackModels;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FallbackError);
    }
  }
}

/**
 * ConfigurationError - 配置错误
 * 当执行器配置无效时抛出
 */
class ConfigurationError extends Error {
  constructor(message, configKey = null, cause = null) {
    super(message || 'Invalid configuration provided to executor');
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigurationError);
    }
  }
}

/**
 * BudgetExceededError - 预算超出错误
 * 当成本预算不足时抛出
 */
class BudgetExceededError extends Error {
  constructor(message, currentBudget, requiredAmount, cause = null) {
    super(message || `Budget exceeded: required ${requiredAmount}, available ${currentBudget}`);
    this.name = 'BudgetExceededError';
    this.currentBudget = currentBudget;
    this.requiredAmount = requiredAmount;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BudgetExceededError);
    }
  }
}

/**
 * ConcurrencyLimitExceededError - 并发限制超出错误
 * 当达到并发限制时抛出
 */
class ConcurrencyLimitExceededError extends Error {
  constructor(message, modelId, currentLimit, cause = null) {
    super(message || `Concurrency limit exceeded for model ${modelId}`);
    this.name = 'ConcurrencyLimitExceededError';
    this.modelId = modelId;
    this.currentLimit = currentLimit;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConcurrencyLimitExceededError);
    }
  }
}

/**
 * RateLimitExceededError - 速率限制超出错误
 * 当达到速率限制时抛出
 */
class RateLimitExceededError extends Error {
  constructor(message, modelId, rateLimit, cause = null) {
    super(message || `Rate limit exceeded for model ${modelId}`);
    this.name = 'RateLimitExceededError';
    this.modelId = modelId;
    this.rateLimit = rateLimit;
    this.cause = cause;

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitExceededError);
    }
  }
}

/**
 * EmptyResponseError - 空响应错误
 * 当模型返回空内容时抛出
 */
class EmptyResponseError extends Error {
  constructor(message = 'Model returned empty content') {
    super(message);
    this.name = 'EmptyResponseError';
    this.code = 'EMPTY_RESPONSE';

    // 维护堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmptyResponseError);
    }
  }
}

module.exports = {
  ModelUnavailableError,
  ExecutionError,
  FallbackError,
  ConfigurationError,
  BudgetExceededError,
  ConcurrencyLimitExceededError,
  RateLimitExceededError,
  EmptyResponseError
};