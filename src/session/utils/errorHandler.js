// 错误处理策略和恢复机制
// 包含各种错误处理策略和备份恢复功能

class BackupStrategy {
  constructor(options = {}) {
    this.backupLocation = options.backupLocation || './backups';
    this.maxBackups = options.maxBackups || 10;
  }

  async createBackup(data, context) {
    // 创建备份的逻辑
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const backup = {
      id: backupId,
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)), // 深拷贝
      context: { ...context },
      type: 'session_backup'
    };

    // 在实际实现中，这里会保存到持久化存储
    console.log(`Created backup: ${backup.id}`);
    return backup;
  }

  async restoreFromBackup(backupId, context) {
    // 从备份恢复的逻辑
    console.log(`Restoring from backup: ${backupId}`);
    // 在实际实现中，这里会从持久化存储加载备份
    return null;
  }
}

class RecoveryStrategy {
  constructor(options = {}) {
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  async executeWithRecovery(operation, context) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`Recovery attempt ${attempt}/${this.retryAttempts}`);
        const result = await operation(context);
        return { success: true, result, attempt };
      } catch (error) {
        lastError = error;
        console.error(`Recovery attempt ${attempt} failed:`, error.message);

        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt); // 递增延迟
        }
      }
    }

    return { success: false, error: lastError, attempts: this.retryAttempts };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class SessionManagerWithErrorHandling {
  constructor(options = {}) {
    this.storage = options.storage;
    this.backupStrategy = options.backupStrategy || new BackupStrategy();
    this.recoveryStrategy = options.recoveryStrategy || new RecoveryStrategy();
    this.fallbackStrategies = options.fallbackStrategies || [];
    this.errorLog = [];
  }

  async executeWithErrorHandler(operation, context) {
    try {
      return await operation(context);
    } catch (error) {
      console.error('Session operation failed:', error);
      this.logError(error, context);
      return await this.handleSessionError(error, context);
    }
  }

  logError(error, context) {
    this.errorLog.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context: { ...context }
    });
  }

  async handleSessionError(error, context) {
    if (this.isStorageError(error)) {
      return await this.handleStorageError(error, context);
    } else if (this.isNetworkError(error)) {
      return await this.handleNetworkError(error, context);
    } else if (this.isValidationError(error)) {
      return await this.handleValidationError(error, context);
    } else {
      return await this.handleGenericError(error, context);
    }
  }

  isStorageError(error) {
    return error.message.toLowerCase().includes('storage') ||
           error.message.toLowerCase().includes('disk') ||
           error.message.toLowerCase().includes('file') ||
           error.code === 'EACCES' || error.code === 'EIO' || error.code === 'ENOSPC';
  }

  isNetworkError(error) {
    return error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('connection') ||
           error.message.toLowerCase().includes('timeout') ||
           error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND';
  }

  isValidationError(error) {
    return error.message.toLowerCase().includes('validation') ||
           error.message.toLowerCase().includes('invalid');
  }

  async handleStorageError(error, context) {
    console.warn('Handling storage error:', error.message);

    if (this.fallbackStrategies.length > 0) {
      for (const strategy of this.fallbackStrategies) {
        try {
          console.log(`Trying fallback storage: ${strategy.name}`);
          return await strategy.execute(context);
        } catch (fallbackError) {
          console.error(`Fallback strategy ${strategy.name} failed:`, fallbackError);
          continue;
        }
      }
    }

    try {
      console.log('Attempting to recover from backup...');
      const backupResult = await this.attemptRecoveryFromBackup(context);
      if (backupResult) {
        return backupResult;
      }
    } catch (backupError) {
      console.error('Backup recovery failed:', backupError);
    }

    // 如果所有恢复尝试都失败，抛出原始错误
    throw error;
  }

  async handleNetworkError(error, context) {
    console.warn('Handling network error:', error.message);

    // 对于网络错误，尝试重试操作
    const recoveryResult = await this.recoveryStrategy.executeWithRecovery(
      async (ctx) => await ctx.operation(ctx.params),
      { operation: context.operation, params: context.params }
    );

    if (recoveryResult.success) {
      return recoveryResult.result;
    }

    // 如果重试也失败，尝试使用缓存或其他降级方案
    if (context.useCacheOnError) {
      try {
        console.log('Falling back to cached data');
        return await context.fetchFromCache();
      } catch (cacheError) {
        console.error('Cache fallback failed:', cacheError);
      }
    }

    throw error;
  }

  async handleValidationError(error, context) {
    console.warn('Handling validation error:', error.message);

    // 记录无效输入并可能尝试修复
    const correctedContext = this.attemptInputCorrection(context, error);

    if (correctedContext) {
      try {
        // 使用修正后的上下文重试
        return await context.operation(correctedContext);
      } catch (retryError) {
        console.error('Retrying with corrected input failed:', retryError);
      }
    }

    throw error;
  }

  async handleGenericError(error, context) {
    console.error('Handling generic error:', error.message);

    // 对于通用错误，使用通用恢复策略
    const recoveryResult = await this.recoveryStrategy.executeWithRecovery(
      async (ctx) => await ctx.operation(ctx.params),
      { operation: context.operation, params: context.params }
    );

    if (recoveryResult.success) {
      return recoveryResult.result;
    }

    // 最后的手段：尝试从备份恢复
    try {
      console.log('Attempting last resort backup recovery...');
      return await this.attemptRecoveryFromBackup(context);
    } catch (backupError) {
      console.error('Last resort backup recovery failed:', backupError);
    }

    throw error;
  }

  attemptInputCorrection(context, error) {
    // 尝试修正输入数据的逻辑
    // 这里只是一个示例，实际实现会根据具体错误类型进行不同的修正
    if (context.input && typeof context.input === 'object') {
      const corrected = { ...context.input };
      let modified = false;

      // 例如，移除无效字段或设置默认值
      for (const [key, value] of Object.entries(corrected)) {
        if (value === undefined || value === null) {
          delete corrected[key];
          modified = true;
        }
      }

      if (modified) {
        return { ...context, input: corrected };
      }
    }

    return null;
  }

  async attemptRecoveryFromBackup(context) {
    // 尝试从备份恢复的逻辑
    // 在实际实现中，这里会调用备份策略
    console.log('No actual backup recovery implemented in this simulation');
    return null;
  }

  getErrorLog(limit = 10) {
    return this.errorLog.slice(-limit);
  }

  getErrorStats() {
    const totalErrors = this.errorLog.length;
    const storageErrors = this.errorLog.filter(e => this.isStorageError(new Error(e.error))).length;
    const networkErrors = this.errorLog.filter(e => this.isNetworkError(new Error(e.error))).length;
    const validationErrors = this.errorLog.filter(e => this.isValidationError(new Error(e.error))).length;

    return {
      totalErrors,
      storageErrors,
      networkErrors,
      validationErrors,
      recentErrors: this.getErrorLog()
    };
  }
}

// 错误处理工具函数
const errorHandler = {
  async withErrorHandling(operation, options = {}) {
    const handler = new SessionManagerWithErrorHandling(options);
    return await handler.executeWithErrorHandler(operation, options.context || {});
  },

  async retryOperation(operation, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const delay = options.delay || 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }

    throw lastError;
  },

  createSafeWrapper(fn, fallbackValue = null) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        console.error('Safe wrapper caught error:', error.message);
        return fallbackValue;
      }
    };
  }
};

module.exports = {
  BackupStrategy,
  RecoveryStrategy,
  SessionManagerWithErrorHandling,
  errorHandler
};