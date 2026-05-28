# Executor Configuration Guide

## 概述

执行器配置系统提供了灵活、可扩展的配置管理方案，支持 YAML 和 JSON 格式，以及环境特定的配置。

## 配置文件位置

配置文件位于 `config/` 目录：

```
config/
├── executor.yaml        # 主配置文件（YAML 格式）
├── executor.json        # 主配置文件（JSON 格式）
├── development.yaml     # 开发环境配置
├── production.yaml      # 生产环境配置
└── test.yaml           # 测试环境配置
```

## 快速开始

### 1. 使用工厂创建执行器（推荐）

```javascript
const { ExecutorFactory } = require('./src/executor');

// 使用默认配置
const executor = await ExecutorFactory.createExecutor('./config/executor.yaml');

// 使用开发环境配置
const devExecutor = await ExecutorFactory.createDevelopmentExecutor();

// 使用生产环境配置
const prodExecutor = await ExecutorFactory.createProductionExecutor();

// 使用测试环境配置
const testExecutor = await ExecutorFactory.createTestExecutor();
```

### 2. 手动加载配置

```javascript
const { ExecutorConfigLoader, ExecutorConfig, ExecutorFactory } = require('./src/executor');

// 创建配置加载器
const configLoader = new ExecutorConfigLoader('./config/executor.yaml');

// 加载配置
const rawConfig = await configLoader.loadConfig();

// 创建配置对象
const config = new ExecutorConfig(rawConfig);

// 验证配置
config.validate();

// 使用配置创建执行器
const executor = await ExecutorFactory.createExecutor('./config/executor.yaml');
```

### 3. 直接传递配置

```javascript
const ConcurrentExecutor = require('./src/executor/ConcurrentExecutor');

const executor = new ConcurrentExecutor({
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000
  },
  tracingConfig: {
    enabled: true,
    maxTraces: 10000
  },
  modelRegistry: myModelRegistry
});
```

## 配置选项

### general - 通用配置

```yaml
executor:
  general:
    default_max_concurrency: 10     # 默认最大并发数
    default_timeout: 60000          # 默认超时时间（毫秒）
    enable_tracing: true            # 启用请求追踪
    enable_monitoring: true         # 启用监控
    log_level: "info"               # 日志级别
```

### concurrency - 并发配置

```yaml
executor:
  concurrency:
    max_concurrent: 50              # 全局最大并发数
    adaptive: true                  # 启用自适应并发
    timeout_ms: 30000               # 槽位获取超时时间
    enable_priority_queue: true     # 启用优先级队列
```

### retry - 重试配置

```yaml
executor:
  retry:
    max_retries: 3                  # 最大重试次数
    base_delay: 1000                # 基础延迟（毫秒）
    max_delay: 60000                # 最大延迟（毫秒）
    exponential_base: 2.0           # 指数退避基数
    jitter: true                    # 启用抖动
    retryable_errors:               # 可重试的错误类型
      - "TimeoutError"
      - "NetworkError"
      - "RateLimitError"
      - "ServerError"
      - "ConnectionError"
```

### rate_limit - 限流配置

```yaml
executor:
  rate_limit:
    default_rps: 10                 # 默认每秒请求数
    burst_capacity: 30              # 突发容量
    enable_coordination: true       # 启用限流协调
    health_check_factor: 0.1        # 健康检查限流系数

    # 按模型配置限流
    per_model:
      gemini-2.0-flash:
        requests_per_minute: 60
        burst: 10
      claude-sonnet-4-6:
        requests_per_minute: 100
        burst: 15
```

### cost_control - 成本控制配置

```yaml
executor:
  cost_control:
    default_budget: 100.00          # 默认预算（美元）
    safety_margin: 0.2              # 安全边际（20%）
    conservative_estimation: true   # 保守估算
    enable_real_time_tracking: true # 实时跟踪
```

### tracing - 追踪配置

```yaml
executor:
  tracing:
    enabled: true                   # 启用追踪
    log_level: "info"               # 日志级别
    include_sensitive_data: false   # 包含敏感数据
    sampling_rate: 1.0              # 采样率（1.0=100%）
    max_traces: 10000               # 最大追踪数
```

### monitoring - 监控配置

```yaml
executor:
  monitoring:
    enabled: true                   # 启用监控
    metrics_collection: true        # 指标收集
    performance_logging: true       # 性能日志

    # 告警阈值
    alert_thresholds:
      error_rate: 0.05              # 错误率阈值（5%）
      response_time: 5000           # 响应时间阈值（5 秒）
      resource_usage: 0.8           # 资源使用率阈值（80%）
```

### model_specific - 模型特定配置

```yaml
executor:
  model_specific:
    gpt-4-turbo:
      max_concurrency: 20
      timeout: 60000
      rate_limit:
        requests_per_second: 10
        burst_capacity: 30
      retry_attempts: 3
      preferred: true

    claude-3-opus:
      max_concurrency: 15
      timeout: 120000
      rate_limit:
        requests_per_second: 8
        burst_capacity: 25
      retry_attempts: 3
      preferred: true
```

### fallback_strategy - 降级策略

```yaml
executor:
  fallback_strategy:
    timeout:
      enabled: true
      max_attempts: 3
      timeout_per_attempt: 30000
      backoff_multiplier: 1.5

    budget:
      enabled: true
      max_cost_reduction: 0.5       # 最多降低 50% 成本
      alternative_search_depth: 5   # 查找 5 个替代模型

    availability:
      enabled: true
      retry_on_unavailability: true
      max_fallback_models: 3

    global:
      max_total_fallbacks: 5        # 最多 5 次降级尝试
      enable_chained_fallbacks: true
      log_level: "info"
```

## 环境特定配置

### 开发环境 (development.yaml)

- 更长的超时时间（120 秒）
- 较少的重试次数（1 次）
- 调试级别日志
- 较低的并发限制

### 生产环境 (production.yaml)

- 更高的并发限制（100）
- 更多的重试次数（5 次）
- 警告级别日志
- 更严格的监控阈值
- 10% 采样率（减少开销）

### 测试环境 (test.yaml)

- 快速失败（0 次重试）
- 较短的超时（30 秒）
- 很低的限流
- 禁用健康检查

## 配置访问方法

### 通过 ExecutorConfig 访问

```javascript
const config = await ExecutorFactory.createConfig('./config/executor.yaml');

// 获取各种配置
const concurrencyConfig = config.getConcurrencyConfig();
const retryConfig = config.getRetryConfig();
const rateLimitConfig = config.getRateLimitConfig();
const tracingConfig = config.getTracingConfig();
const monitoringConfig = config.getMonitoringConfig();
const costControlConfig = config.getCostControlConfig();
const fallbackStrategyConfig = config.getFallbackStrategyConfig();
const healthCheckConfig = config.getHealthCheckConfig();
const httpConfig = config.getHttpConfig();

// 获取模型特定配置
const gpt4Config = config.getModelConfig('gpt-4-turbo');
const claudeConfig = config.getModelConfig('claude-3-opus');
```

### 通过执行器访问

```javascript
const executor = await ExecutorFactory.createExecutor();

// 获取配置
const config = executor.getConfig();

// 获取模型特定配置
const modelConfig = executor.getModelSpecificConfig('gpt-4-turbo');

// 获取配置加载器
const configLoader = executor.getConfigLoader();
```

## 配置热重载

```javascript
const executor = await ExecutorFactory.createExecutor('./config/executor.yaml');

// 重新加载配置（从文件）
const configLoader = executor.getConfigLoader();
const newRawConfig = await configLoader.loadConfig();
await executor.reloadConfig(newRawConfig);

// 热加载配置（不影响正在运行的任务）
await executor.hotReloadConfig({
  executor: {
    general: {
      default_max_concurrency: 30
    },
    concurrency: {
      max_concurrent: 30
    }
  }
});
```

## 配置验证

配置系统在加载时自动验证以下内容：

- 并发数必须 >= 1
- 超时时间必须 >= 1000ms
- 重试次数必须 >= 0
- 指数退避基数必须 > 1
- 限流速率必须 >= 0
- 采样率必须在 0-1 之间
- 错误率阈值必须在 0-1 之间

## 最佳实践

1. **开发环境**：使用较长的超时和详细的日志，便于调试
2. **生产环境**：使用较高的并发限制和更严格的监控
3. **测试环境**：使用快速失败模式，加快测试速度
4. **成本敏感场景**：增加安全边际，启用保守估算
5. **高可用场景**：增加重试次数，启用降级策略

## 故障排查

### 配置加载失败

检查配置文件路径是否正确，格式是否有效：

```javascript
try {
  const configLoader = new ExecutorConfigLoader('./config/executor.yaml');
  await configLoader.loadConfig();
} catch (error) {
  console.error('配置加载失败:', error.message);
}
```

### 配置验证失败

查看验证错误信息，修正配置值：

```javascript
try {
  config.validate();
} catch (error) {
  console.error('配置验证失败:', error.message);
}
```
