/**
 * Concurrent Executor Module - 并发执行器模块
 *
 * 高并发模型调用管理系统，与 ModelSelector 协同工作
 *
 * 主要组件：
 * - BaseExecutor: 基础执行器抽象类
 * - ConcurrentExecutor: 主执行器类
 * - EnhancedConcurrentExecutor: 增强的并发执行器类
 * - ModelAwareConcurrentExecutor: 模型感知的并发执行器类
 * - FullyEnhancedConcurrentExecutor: 全面增强的并发执行器类
 * - TracedExecutor: 追踪执行器类
 * - SharedConcurrencyManager: 共享并发管理器（单例）
 * - ConcurrencyController: 并发控制器（代理）
 * - TaskScheduler: 任务调度器
 * - AsyncRequester: 异步请求器
 * - RetryManager: 重试管理器
 * - RateLimiter: 限流器
 * - RequestTracer: 请求追踪器（功能块 F）
 * - PerformanceMonitor: 性能监控器（功能块 F）
 * - TokenUsageParser: Token 解析器
 *
 * 配置模块：
 * - ExecutorConfigLoader: 配置加载器
 * - ExecutorConfig: 配置封装对象
 * - ExecutorFactory: 执行器工厂
 */

const BaseExecutor = require('./core/BaseExecutor');
const ConcurrentExecutor = require('./ConcurrentExecutor');
const EnhancedConcurrentExecutor = require('./core/EnhancedConcurrentExecutor');
const ModelAwareConcurrentExecutor = require('./core/ModelAwareConcurrentExecutor');
const FullyEnhancedConcurrentExecutor = require('./core/FullyEnhancedConcurrentExecutor');
const { TracedExecutor } = require('./ConcurrentExecutor'); // TracedExecutor is defined in ConcurrentExecutor.js
const SharedConcurrencyManager = require('./managers/SharedConcurrencyManager');
const ConcurrencyController = require('./core/ConcurrencyController');
const TaskScheduler = require('./core/TaskScheduler');
const AsyncRequester = require('./core/AsyncRequester');
const RequestBuilder = require('./core/RequestBuilder');
const RetryManager = require('./core/RetryManager');
const RateLimiter = require('./core/RateLimiter');
const TokenUsageParser = require('./utils/TokenUsageParser');
const { CostTracker } = require('./core/CostTracker');
const { BudgetMonitor } = require('./core/BudgetMonitor');
const { CoordinatorRateLimiter } = require('./core/CoordinatorRateLimiter');
const { LimitConfigurationManager } = require('./core/LimitConfigurationManager');
const CircuitBreaker = require('./core/CircuitBreaker');
const ErrorHandler = require('./core/ErrorHandler');
// 功能块 F: 请求追踪与监控层
const RequestTracer = require('./core/RequestTracer');
const PerformanceMonitor = require('./core/PerformanceMonitor');
const ExecutionInfoCollector = require('./core/ExecutionInfoCollector');
const { ModelUnavailableError, ExecutionError, FallbackError, ConfigurationError, BudgetExceededError, ConcurrencyLimitExceededError, RateLimitExceededError } = require('./core/ErrorClasses');

// 配置模块
const { ExecutorConfigLoader, ExecutorConfig, ExecutorFactory } = require('./config');

module.exports = {
  // 抽象基类
  BaseExecutor,

  // 主执行器类
  ConcurrentExecutor,
  EnhancedConcurrentExecutor,
  ModelAwareConcurrentExecutor,
  FullyEnhancedConcurrentExecutor,
  TracedExecutor,

  // 管理器
  SharedConcurrencyManager,

  // 核心组件
  ConcurrencyController,
  TaskScheduler,
  AsyncRequester,
  RequestBuilder,
  RetryManager,
  RateLimiter,

  // 成本跟踪组件
  CostTracker,
  BudgetMonitor,

  // 限流组件
  CoordinatorRateLimiter,
  LimitConfigurationManager,

  // 容错组件
  CircuitBreaker,
  ErrorHandler,

  // 功能块 F: 请求追踪与监控层
  RequestTracer,
  PerformanceMonitor,

  // 工具
  TokenUsageParser,
  ExecutionInfoCollector,

  // 错误类
  ModelUnavailableError,
  ExecutionError,
  FallbackError,
  ConfigurationError,
  BudgetExceededError,
  ConcurrencyLimitExceededError,
  RateLimitExceededError,

  // 配置模块
  ExecutorConfigLoader,
  ExecutorConfig,
  ExecutorFactory
};
