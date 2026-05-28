/**
 * EnhancedConcurrentExecutor - 增强的并发执行器
 *
 * Implements enhanced execution with structured execution information collection
 * Uses composition rather than direct inheritance to avoid circular dependencies
 */
const ExecutionInfoCollector = require('./ExecutionInfoCollector');

class EnhancedConcurrentExecutor {
  /**
   * Create enhanced concurrent executor
   * @param {Object} options - Options
   */
  constructor(options = {}) {
    // Dynamically load ConcurrentExecutor to prevent circular dependency
    const { ConcurrentExecutor } = require('../index');

    // Create an instance of ConcurrentExecutor to delegate to
    this.concurrentExecutor = new ConcurrentExecutor(options);

    // Copy properties from the base executor
    Object.assign(this, this.concurrentExecutor);

    // Initialize execution info collector
    this.executionInfoCollector = new ExecutionInfoCollector();

    // Save original execution info (if any)
    this.originalExecutionInfo = options.originalExecutionInfo || null;
  }

  /**
   * Execute a single task (with execution info collection)
   * @param {Object} executionRequest - Execution request
   * @returns {Promise<Object>} Execution result
   */
  async execute(executionRequest) {
    // Use execution info collector to track execution process
    this.executionInfoCollector.recordExecutionPhase('execution', 'execute_called', 'Task execution initiated');

    // Call the actual execute method on the underlying executor
    const result = await this.concurrentExecutor.execute(executionRequest);

    // Ensure result includes complete execution information
    if (!result.execution_info) {
      result.execution_info = this.executionInfoCollector.getExecutionInfo();
    } else {
      // Merge execution info
      Object.assign(result.execution_info, this.executionInfoCollector.getExecutionInfo());
    }

    return result;
  }

  /**
   * Calculate retry delay
   * @param {number} attempt - Attempt number
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt) {
    const config = this.concurrentExecutor.config || {};

    const baseDelay = config?.retry?.baseDelay || 1000;
    const exponentialBase = config?.retry?.exponentialBase || 2.0;
    const jitter = config?.retry?.jitter !== false; // Default to enabled

    let delay = baseDelay * Math.pow(exponentialBase, attempt - 1);

    // Apply maximum delay limit
    const maxDelay = config?.retry?.maxDelay || 60000;
    delay = Math.min(delay, maxDelay);

    // Apply jitter to avoid thundering herd problem
    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Process API response
   * @param {Object} response - API response
   * @param {string} modelId - Model ID
   * @returns {Object} Processed result
   */
  processApiResponse(response, modelId) {
    try {
      // Use the underlying executor's method for processing
      // 【改进】(2026-04-02): 优先从 ModelRegistry 获取提供商信息
      const provider = this.concurrentExecutor.tokenUsageParser?.getProvider(
        modelId,
        this.concurrentExecutor.modelRegistry
      );
      const result = this.concurrentExecutor.processApiResponse(response, modelId, provider);

      // Record API response processing info
      this.executionInfoCollector.recordExecutionPhase(
        'api_response',
        'processed',
        `API response processed for model ${modelId}`
      );

      return result;
    } catch (error) {
      // Record API response processing error
      this.executionInfoCollector.recordExecutionPhase(
        'api_response',
        'processing_error',
        `Error processing API response: ${error.message}`
      );

      throw error;
    }
  }

  /**
   * Execute batch of tasks (with batch statistics recording)
   * @param {Array} batchRequests - Batch requests
   * @returns {Promise<Array>} Execution results array
   */
  async executeBatch(batchRequests) {
    // Record batch processing start
    this.executionInfoCollector.recordExecutionPhase(
      'batch_execution',
      'batch_start',
      `Starting batch execution of ${batchRequests.length} requests`
    );

    // Execute the batch using the underlying executor
    const results = await this.concurrentExecutor.executeBatch(batchRequests);

    // Record batch processing completion
    this.executionInfoCollector.recordExecutionPhase(
      'batch_execution',
      'batch_complete',
      `Completed batch execution of ${batchRequests.length} requests`
    );

    // Add execution info to each result (if not present)
    results.forEach((result, index) => {
      if (!result.execution_info) {
        result.execution_info = this.executionInfoCollector.getExecutionInfo();
      }
    });

    return results;
  }

  /**
   * Get execution info collector
   * @returns {ExecutionInfoCollector} Execution info collector instance
   */
  getExecutionInfoCollector() {
    return this.executionInfoCollector;
  }

  /**
   * Get execution statistics
   * @returns {Object} Statistics
   */
  getExecutionStatistics() {
    return this.executionInfoCollector.getSummary();
  }

  /**
   * Reset execution info collector
   */
  resetExecutionInfoCollector() {
    this.executionInfoCollector.reset();
  }

  /**
   * Add execution phase record convenience method
   * @param {string} phase - Execution phase
   * @param {string} action - Execution action
   * @param {string} reason - Execution reason
   */
  addExecutionPhase(phase, action, reason) {
    this.executionInfoCollector.recordExecutionPhase(phase, action, reason);
  }

  /**
   * Add wait time record convenience method
   * @param {string} type - Wait type
   * @param {number} duration - Duration
   */
  addWaitTime(type, duration) {
    this.executionInfoCollector.recordWaitTime(type, duration);
  }

  /**
   * Add retry record convenience method
   * @param {number} attempt - Attempt number
   * @param {Error} error - Error object
   * @param {number} delay - Delay time
   */
  addRetryRecord(attempt, error, delay) {
    this.executionInfoCollector.recordRetry(attempt, error, delay);
  }

  /**
   * Add cost record convenience method
   * @param {number} estimated - Estimated cost
   * @param {number} actual - Actual cost
   */
  addCostRecord(estimated, actual) {
    this.executionInfoCollector.recordCost(estimated, actual);
  }

  /**
   * Delegate all other method calls to the underlying ConcurrentExecutor
   */
  async initialize() {
    return await this.concurrentExecutor.initialize();
  }

  async cleanup() {
    return await this.concurrentExecutor.cleanup();
  }

  getStatistics() {
    return this.concurrentExecutor.getStatistics();
  }

  resetStatistics() {
    return this.concurrentExecutor.resetStatistics();
  }

  validateExecutionRequest(request) {
    return this.concurrentExecutor.validateExecutionRequest(request);
  }

  getConfig() {
    return this.concurrentExecutor.getConfig();
  }

  async reloadConfig(newConfig) {
    return await this.concurrentExecutor.reloadConfig(newConfig);
  }

  async executeWithUpstreamIntegration(subtask, selection, options = {}) {
    return await this.concurrentExecutor.executeWithUpstreamIntegration(subtask, selection, options);
  }

  async executeBatchWithUpstreamIntegration(decomposerResults, selectorResults, options = {}) {
    return await this.concurrentExecutor.executeBatchWithUpstreamIntegration(decomposerResults, selectorResults, options);
  }

  async destroy() {
    return await this.concurrentExecutor.destroy();
  }
}

module.exports = EnhancedConcurrentExecutor;