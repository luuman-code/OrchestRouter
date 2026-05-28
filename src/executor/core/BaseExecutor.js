/**
 * BaseExecutor - 抽象基类执行器
 *
 * 定义执行器的基本接口和通用功能
 */
class BaseExecutor {
  /**
   * 创建基础执行器
   * @param {Object} options - 选项
   */
  constructor(options = {}) {
    this.options = options;
    this.initialized = false;
    this.name = options.name || this.constructor.name;

    // 执行器配置
    this.config = {
      ...options.config,
      enable_validation: options.enableValidation !== false,
      enable_batch_processing: options.enableBatchProcessing !== false,
      max_batch_size: options.maxBatchSize || 100
    };
  }

  /**
   * 初始化执行器
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log(`[${this.name}] 初始化...`);
    this.initialized = true;
    console.log(`[${this.name}] 初始化完成`);
  }

  /**
   * 执行单个任务（抽象方法，子类必须实现）
   * @param {Object} executionRequest - 执行请求
   * @returns {Promise<Object>} 执行结果
   */
  async execute(executionRequest) {
    throw new Error('execute method must be implemented by subclass');
  }

  /**
   * 批量执行任务
   * @param {Array} batchRequests - 批量请求
   * @returns {Promise<Array>} 执行结果数组
   */
  async executeBatch(batchRequests) {
    if (!this.config.enable_batch_processing) {
      throw new Error('Batch processing is disabled for this executor');
    }

    if (batchRequests.length > this.config.max_batch_size) {
      throw new Error(`Batch size exceeds maximum allowed size of ${this.config.max_batch_size}`);
    }

    const results = [];
    for (const request of batchRequests) {
      try {
        const result = await this.execute(request);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          task_id: request.task?.id || Date.now().toString()
        });
      }
    }

    return results;
  }

  /**
   * 清理执行器资源
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log(`[${this.name}] 执行器清理...`);
    this.initialized = false;
    console.log(`[${this.name}] 清理完成`);
  }

  /**
   * 验证执行请求
   * @param {Object} request - 请求对象
   * @returns {boolean} 是否有效
   */
  validateExecutionRequest(request) {
    if (!this.config.enable_validation) {
      return true;
    }

    if (!request) {
      console.warn('[BaseExecutor] 请求对象不能为空');
      return false;
    }

    if (!request.task && !request.modelId) {
      console.warn('[BaseExecutor] 请求必须包含任务或模型ID');
      return false;
    }

    return true;
  }

  /**
   * 检查执行器是否已初始化
   * @returns {boolean} 是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * 获取执行器名称
   * @returns {string} 执行器名称
   */
  getName() {
    return this.name;
  }

  /**
   * 获取执行器配置
   * @returns {Object} 配置对象
   */
  getConfig() {
    return this.config;
  }

  /**
   * 更新执行器配置
   * @param {Object} newConfig - 新配置
   * @returns {void}
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = BaseExecutor;