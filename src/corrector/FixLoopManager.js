/**
 * 修复循环管理器模块
 * 管理代码修复循环流程，控制重试次数，决定何时切换到云端API修复
 */

class FixLoopManager {
  constructor(options = {}) {
    this.options = {
      maxLocalRepairAttempts: options.maxLocalRepairAttempts || 3,
      maxCloudRepairAttempts: options.maxCloudRepairAttempts || 2,
      repairTimeout: options.repairTimeout || 30000,
      localRepairDelay: options.localRepairDelay || 1000, // 修复尝试间的延迟
      cloudRepairDelay: options.cloudRepairDelay || 3000,
      ...options
    };

    this.repairHistory = [];
  }

  /**
   * 执行修复循环
   * @param {string} code - 需要修复的代码
   * @param {Function} validator - 验证函数
   * @param {Function} localFixer - 本地修复函数
   * @param {Function} cloudFixer - 云端修复函数
   * @param {Object} context - 修复上下文
   * @returns {Promise<Object>} 修复结果
   */
  async executeFixLoop(code, validator, localFixer, cloudFixer, context = {}) {
    const startTime = Date.now();
    let currentCode = code;
    let attemptCount = 0;
    let localAttemptCount = 0;
    let cloudAttemptCount = 0;

    const historyEntry = {
      originalCode: code,
      startTime,
      attempts: [],
      success: false,
      finalCode: null,
      reason: null
    };

    try {
      // 首先验证初始代码
      const initialValidation = await validator(currentCode);

      if (initialValidation.valid) {
        // 如果代码已经有效，直接返回
        historyEntry.success = true;
        historyEntry.finalCode = currentCode;
        historyEntry.reason = 'code_already_valid';
        this.repairHistory.push(historyEntry);
        return {
          success: true,
          code: currentCode,
          validation: initialValidation,
          attempts: 0,
          repairNeeded: false
        };
      }

      // 主修复循环
      while (attemptCount < (this.options.maxLocalRepairAttempts + this.options.maxCloudRepairAttempts)) {
        const attemptStartTime = Date.now();
        const attemptNum = attemptCount + 1;

        // 检查是否超过总时间限制
        if (Date.now() - startTime > this.options.repairTimeout) {
          historyEntry.reason = 'timeout_exceeded';
          break;
        }

        // 决定使用哪种修复方式
        let repairResult;
        let repairType;

        if (localAttemptCount < this.options.maxLocalRepairAttempts) {
          // 优先尝试本地修复
          repairType = 'local';
          repairResult = await this._attemptLocalFix(currentCode, localFixer, validator, context);

          if (repairResult.success) {
            localAttemptCount++;
            attemptCount++;

            const attemptRecord = {
              attempt: attemptNum,
              type: 'local',
              success: repairResult.success,
              timeTaken: Date.now() - attemptStartTime,
              originalCode: currentCode,
              fixedCode: repairResult.code,
              validation: repairResult.validation,
              error: repairResult.error || null
            };

            historyEntry.attempts.push(attemptRecord);

            if (repairResult.validation.valid) {
              // 修复成功
              historyEntry.success = true;
              historyEntry.finalCode = repairResult.code;
              historyEntry.reason = 'local_repair_successful';
              this.repairHistory.push(historyEntry);

              return {
                success: true,
                code: repairResult.code,
                validation: repairResult.validation,
                attempts: attemptCount,
                repairNeeded: true,
                finalRepairType: 'local'
              };
            } else {
              // 修复后仍有错误，继续循环
              currentCode = repairResult.code;
            }
          } else {
            // 本地修复失败，切换到云端修复
            localAttemptCount++; // 即使失败也算作一次尝试
            attemptCount++;
          }
        }

        // 如果本地修复达到最大尝试次数或者需要云端修复
        if (localAttemptCount >= this.options.maxLocalRepairAttempts ||
            (repairType === 'local' && !repairResult.requiresCloudFix && localAttemptCount < this.options.maxLocalRepairAttempts)) {

          // 如果本地修复失败或需要云端修复，尝试云端修复
          if (cloudFixer && cloudAttemptCount < this.options.maxCloudRepairAttempts) {
            repairType = 'cloud';
            repairResult = await this._attemptCloudFix(currentCode, cloudFixer, validator, context);

            cloudAttemptCount++;
            attemptCount++;

            const attemptRecord = {
              attempt: attemptNum,
              type: 'cloud',
              success: repairResult.success,
              timeTaken: Date.now() - attemptStartTime,
              originalCode: currentCode,
              fixedCode: repairResult.code || currentCode,
              validation: repairResult.validation,
              error: repairResult.error || null
            };

            historyEntry.attempts.push(attemptRecord);

            if (repairResult.success && repairResult.validation && repairResult.validation.valid) {
              // 云端修复成功
              historyEntry.success = true;
              historyEntry.finalCode = repairResult.code;
              historyEntry.reason = 'cloud_repair_successful';
              this.repairHistory.push(historyEntry);

              return {
                success: true,
                code: repairResult.code,
                validation: repairResult.validation,
                attempts: attemptCount,
                repairNeeded: true,
                finalRepairType: 'cloud'
              };
            } else {
              // 云端修复失败，继续循环
              if (repairResult.code) {
                currentCode = repairResult.code;
              }
            }
          } else if (cloudAttemptCount >= this.options.maxCloudRepairAttempts) {
            // 达到云端修复最大尝试次数
            historyEntry.reason = 'max_cloud_attempts_exceeded';
            break;
          }
        }

        // 短暂延迟以避免过于频繁的尝试
        if (repairType === 'local' && this.options.localRepairDelay > 0) {
          await this._delay(this.options.localRepairDelay);
        } else if (repairType === 'cloud' && this.options.cloudRepairDelay > 0) {
          await this._delay(this.options.cloudRepairDelay);
        }
      }

      // 所有修复尝试都失败了
      historyEntry.reason = 'all_attempts_failed';
      historyEntry.finalCode = currentCode;
      this.repairHistory.push(historyEntry);

      return {
        success: false,
        code: currentCode,
        validation: await validator(currentCode),
        attempts: attemptCount,
        repairNeeded: true,
        maxAttemptsReached: true
      };

    } catch (error) {
      historyEntry.reason = 'exception_during_repair';
      historyEntry.error = error.message;
      historyEntry.finalCode = currentCode;
      this.repairHistory.push(historyEntry);

      return {
        success: false,
        code: currentCode,
        error: error.message,
        attempts: attemptCount,
        repairNeeded: true,
        exception: true
      };
    }
  }

  /**
   * 尝试本地修复
   * @private
   */
  async _attemptLocalFix(code, localFixer, validator, context) {
    try {
      // 调用本地修复器
      const fixResult = await localFixer(code, context);

      if (!fixResult) {
        return {
          success: false,
          code: code,
          error: 'Local fixer returned null or undefined'
        };
      }

      // 验证修复后的代码
      const validation = await validator(fixResult.fixedCode || fixResult.code || code);

      return {
        success: true,
        code: fixResult.fixedCode || fixResult.code || code,
        validation: validation,
        requiresCloudFix: fixResult.requiresCloudFix || false
      };
    } catch (error) {
      return {
        success: false,
        code: code,
        error: error.message
      };
    }
  }

  /**
   * 尝试云端修复
   * @private
   */
  async _attemptCloudFix(code, cloudFixer, validator, context) {
    try {
      // 调用云端修复器
      const fixResult = await cloudFixer(code, context);

      if (!fixResult) {
        return {
          success: false,
          code: code,
          error: 'Cloud fixer returned null or undefined'
        };
      }

      // 获取修复后的代码
      const fixedCode = fixResult.fixedCode || fixResult.code || code;

      // 验证修复后的代码
      const validation = await validator(fixedCode);

      return {
        success: true,
        code: fixedCode,
        validation: validation
      };
    } catch (error) {
      return {
        success: false,
        code: code,
        error: error.message
      };
    }
  }

  /**
   * 延迟函数
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取修复历史
   */
  getRepairHistory() {
    return this.repairHistory;
  }

  /**
   * 清除修复历史
   */
  clearHistory() {
    this.repairHistory = [];
  }

  /**
   * 获取修复统计信息
   */
  getStatistics() {
    const totalAttempts = this.repairHistory.reduce((sum, entry) => sum + entry.attempts.length, 0);
    const successfulRepairs = this.repairHistory.filter(entry => entry.success).length;
    const failedRepairs = this.repairHistory.filter(entry => !entry.success).length;

    return {
      totalRepairSessions: this.repairHistory.length,
      successfulRepairs,
      failedRepairs,
      totalAttempts,
      successRate: this.repairHistory.length > 0 ? successfulRepairs / this.repairHistory.length : 0,
      averageAttemptsPerSession: this.repairHistory.length > 0 ? totalAttempts / this.repairHistory.length : 0
    };
  }

  /**
   * 配置修复管理器
   */
  configure(options) {
    this.options = {
      ...this.options,
      ...options
    };
  }
}

module.exports = FixLoopManager;