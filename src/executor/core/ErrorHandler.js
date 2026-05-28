/**
 * ErrorHandler - 错误处理器
 *
 * 统一处理各类错误，提供错误分类和处理策略
 *
 * @class ErrorHandler
 */
class ErrorHandler {
  /**
   * 对错误进行分类
   * @param {Error} error - 错误对象
   * @returns {string} 错误类别
   */
  static categorizeError(error) {
    if (!error) {
      return 'UNKNOWN';
    }

    // 检查错误状态码
    if (error.status === 429) {
      return 'RATE_LIMIT';
    } else if (error.status >= 500) {
      return 'SERVER_ERROR';
    } else if (error.status >= 400 && error.status < 500) {
      return 'CLIENT_ERROR'; // 不重试
    }

    // 检查错误代码
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return 'TIMEOUT';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
               error.code === 'ECONNRESET' || error.code === 'EAI_AGAIN' ||
               error.message.includes('network') || error.message.includes('connection')) {
      return 'NETWORK_ERROR';
    } else if (error.message.includes('validation failed') ||
               error.message.includes('Invalid ') ||
               error.message.includes('response validation') ||
               error.message.includes('validation')) {
      return 'VALIDATION_ERROR'; // 验证错误，不应重试
    } else if (error.message.includes('circuit breaker') || error.code === 'CIRCUIT_BREAKER_OPEN') {
      return 'CIRCUIT_BREAKER_ERROR'; // 熔断错误
    }

    return 'UNKNOWN';
  }

  /**
   * 判断错误是否应该重试（通用判断）
   * @param {string} errorCategory - 错误类别
   * @returns {boolean} 是否应该重试
   */
  static shouldRetry(errorCategory) {
    // VALIDATION_ERROR 表示响应格式错误，重试通常不会解决问题，因此不应重试
    // CLIENT_ERROR 通常表示客户端错误（如无效请求参数），不应重试
    return ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'RATE_LIMIT', 'CIRCUIT_BREAKER_ERROR'].includes(errorCategory);
  }

  /**
   * 明确判断错误类型是否可重试，特别处理验证错误
   * @param {string} errorCategory - 错误类别
   * @returns {boolean} 是否可重试
   */
  static isRetriableError(errorCategory) {
    if (errorCategory === 'VALIDATION_ERROR') {
      // 验证错误通常表示响应格式错误，重试无法解决根本问题
      // 如 API 返回了意外格式或模型输出不符合预期结构
      return false;
    }

    if (errorCategory === 'CLIENT_ERROR') {
      // 客户端错误通常表示请求参数错误，重试不会解决问题
      return false;
    }

    if (errorCategory === 'CIRCUIT_BREAKER_ERROR') {
      // 熔断错误不应该重试，需要等待熔断器恢复
      return false;
    }

    // 其他错误类型按通用规则判断
    return ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'RATE_LIMIT'].includes(errorCategory);
  }

  /**
   * 获取错误重试延迟时间
   * @param {string} errorCategory - 错误类别
   * @param {number} attempt - 尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  static getRetryDelay(errorCategory, attempt) {
    const baseDelays = {
      'TIMEOUT': 1000,
      'NETWORK_ERROR': 1000,
      'SERVER_ERROR': 2000,
      'RATE_LIMIT': 5000,
      'CIRCUIT_BREAKER_ERROR': 10000 // 熔断错误需要更长时间等待恢复
    };

    const baseDelay = baseDelays[errorCategory] || 1000;
    return baseDelay * Math.pow(2, attempt);
  }

  /**
   * 根据错误类型获取基础延迟时间
   * @param {string} errorCategory - 错误类别
   * @returns {number} 基础延迟时间（毫秒）
   */
  static getBaseDelayByErrorType(errorCategory) {
    const baseDelays = {
      'TIMEOUT': 1000,
      'NETWORK_ERROR': 1000,
      'SERVER_ERROR': 2000,
      'RATE_LIMIT': 5000,  // 更长延迟，因为需要等待限流窗口恢复
      'VALIDATION_ERROR': 0, // 验证错误不重试，延迟为0
      'CIRCUIT_BREAKER_ERROR': 10000, // 熔断错误，需要等待较长时间
      'CLIENT_ERROR': 0, // 客户端错误不重试
      'UNKNOWN': 1000 // 默认延迟
    };

    return baseDelays[errorCategory] || baseDelays.UNKNOWN;
  }

  /**
   * 创建标准化错误对象
   * @param {Error|string} error - 原始错误
   * @param {string} context - 错误上下文
   * @returns {Object} 标准化错误对象
   */
  static createStandardizedError(error, context = '') {
    if (typeof error === 'string') {
      error = new Error(error);
    }

    const errorCategory = this.categorizeError(error);
    const isRetriable = this.isRetriableError(errorCategory);

    return {
      originalError: error,
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: error.code,
      status: error.status,
      category: errorCategory,
      isRetriable,
      context,
      timestamp: Date.now(),
      details: {
        name: error.name,
        code: error.code,
        status: error.status,
        url: error.url, // 如果有请求URL
        method: error.method // 如果有请求方法
      }
    };
  }

  /**
   * 检查错误是否表示永久性失败
   * @param {string} errorCategory - 错误类别
   * @returns {boolean} 是否为永久性失败
   */
  static isPermanentFailure(errorCategory) {
    // 验证错误和客户端错误通常表示永久性问题
    return ['VALIDATION_ERROR', 'CLIENT_ERROR'].includes(errorCategory);
  }

  /**
   * 获取错误处理建议
   * @param {string} errorCategory - 错误类别
   * @returns {string} 处理建议
   */
  static getHandlingRecommendation(errorCategory) {
    const recommendations = {
      'TIMEOUT': '检查网络连接或增加超时时间',
      'NETWORK_ERROR': '检查网络连接和目标服务器状态',
      'SERVER_ERROR': '服务暂时不可用，请稍后再试',
      'RATE_LIMIT': '超出速率限制，请稍后再试',
      'VALIDATION_ERROR': '响应格式错误，请联系开发者',
      'CLIENT_ERROR': '请求参数错误，请修正后重试',
      'CIRCUIT_BREAKER_ERROR': '服务被熔断，请等待恢复',
      'UNKNOWN': '发生未知错误'
    };

    return recommendations[errorCategory] || recommendations.UNKNOWN;
  }

  /**
   * 格式化错误输出
   * @param {Object} standardizedError - 标准化错误对象
   * @returns {string} 格式化的错误字符串
   */
  static formatError(standardizedError) {
    const { message, category, isRetriable, context, timestamp } = standardizedError;
    const timestampStr = new Date(timestamp).toISOString();

    return `[${timestampStr}] ${context ? context + ': ' : ''}${message} (Category: ${category}, Retriable: ${isRetriable})`;
  }
}

module.exports = ErrorHandler;