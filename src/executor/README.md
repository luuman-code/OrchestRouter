# Concurrent Executor Module - 并发执行器模块

## 概述

并发执行器是一个高并发模型调用管理系统，接收来自 ModelSelector 的模型选择结果，同时向多个模型发起 API 请求执行子任务。

## 目录结构

```
src/executor/
├── ConcurrentExecutor.js      # 主执行器类
├── index.js                   # 模块导出
├── test.js                    # 测试文件
├── managers/
│   └── SharedConcurrencyManager.js  # 共享并发管理器（单例）
├── core/
│   ├── ConcurrencyController.js     # 并发控制器（代理）
│   ├── TaskScheduler.js             # 任务调度器
│   ├── AsyncRequester.js            # 异步请求器
│   ├── RequestBuilder.js            # 请求构建器
│   ├── RetryManager.js              # 重试管理器
│   ├── CircuitBreaker.js            # 熔断器
│   ├── ErrorHandler.js              # 错误处理器
│   └── RateLimiter.js               # 限流器
└── utils/
    └── TokenUsageParser.js          # Token 使用解析器
```

## 主要组件

### 1. ConcurrentExecutor（主执行器）

整合所有组件，提供统一的任务执行接口。

```javascript
const { ConcurrentExecutor } = require('./src/executor');

const executor = new ConcurrentExecutor({
  retryConfig: { maxRetries: 3, baseDelay: 1000 },
  rateLimitConfig: { defaultRps: 10 },
  modelRegistry: modelRegistry
});

const result = await executor.execute(selectionResult, task);
```

### 2. SharedConcurrencyManager（共享并发管理器）

单例模式，与 ModelSelector 共享并发状态。

```javascript
const { SharedConcurrencyManager } = require('./src/executor');

const manager = SharedConcurrencyManager.getInstance();
await manager.registerModel('gpt-4o', 10);

const acquired = await manager.tryAcquireSlot('gpt-4o');
await manager.releaseSlot('gpt-4o');
```

### 3. ConcurrencyController（并发控制器）

作为 SharedConcurrencyManager 的代理，简化调用。

```javascript
const controller = new ConcurrencyController(sharedManager, modelRegistry);

const loadInfo = await controller.getLoadInfo('gpt-4o');
const slot = await controller.acquireSlotWithAtomicCheck('gpt-4o', loadInfo);
```

### 4. TaskScheduler（任务调度器）

负责调度任务的执行顺序和并发控制。

```javascript
const scheduler = new TaskScheduler(concurrencyController);

await scheduler.scheduleTaskWithLoadAwareness(
  'gpt-4o',
  async () => { /* 任务逻辑 */ },
  {
    alternatives: ['claude-sonnet-4', 'gemini-2.0-flash'],
    fallbackStrategy: 'fallback'
  }
);
```

### 5. RequestBuilder（请求构建器）

根据不同模型 API 构建相应的请求格式，支持 OpenAI、Anthropic、Gemini、Ollama 等主流提供商。

```javascript
const requestBuilder = new RequestBuilder();

const requestConfig = requestBuilder.buildRequest(
  'gpt-4o',
  {
    prompt: 'Hello, world!',
    maxTokens: 100,
    temperature: 0.7
  },
  {
    apiKey: 'your-api-key',
    baseUrl: 'https://api.openai.com/v1',
    apiModelId: 'gpt-4o'
  }
);
// 返回：{ url, method, headers, body }
```

### 6. AsyncRequester（异步请求器）

管理 HTTP 客户端、连接池、请求封装。

```javascript
const requester = new AsyncRequester({
  maxSockets: 100,
  timeout: 30000
});

const response = await requester.request(
  'https://api.openai.com/v1/chat/completions',
  'POST',
  { 'Authorization': 'Bearer xxx' },
  { model: 'gpt-4o', messages: [...] }
);
```

### 7. RetryManager（重试管理器）

处理请求重试、超时处理、错误隔离。

```javascript
const retryManager = new RetryManager({
  maxRetries: 3,
  baseDelay: 1000,
  useJitter: true
});

const result = await retryManager.executeWithRetry(
  async () => { /* 可能失败的操作 */ },
  { context: 'API 调用' }
);
```

### 8. RateLimiter（限流器）

实现令牌桶算法，控制 API 请求速率。

```javascript
const limiter = new RateLimiter({
  defaultRps: 10,
  defaultBurst: 20,
  modelLimits: {
    'gpt-4o': { rps: 5, burst: 10 }
  }
});

await limiter.execute('gpt-4o', async () => {
  // 执行 API 调用
});
```

### 9. CircuitBreaker（熔断器）

防止对持续失败的服务进行无效调用，提高系统容错能力。

```javascript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,  // 失败阈值
  timeout: 60000,       // 熔断后保持OPEN状态的时间（毫秒）
  resetTimeout: 30000   // 熔断恢复后等待的试探时间（毫秒）
});

// 执行带熔断保护的操作
try {
  const result = await circuitBreaker.execute(async () => {
    // 可能失败的操作
    return await apiCall();
  });
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    // 熔断器处于打开状态，快速失败
    console.log('服务当前不可用，已熔断');
  }
}
```

### 10. ErrorHandler（错误处理器）

统一处理各类错误，提供错误分类和处理策略。

```javascript
const errorCategory = ErrorHandler.categorizeError(error);
console.log(`错误类别: ${errorCategory}`); // 例如: 'TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR'

// 判断错误是否可重试
const isRetriable = ErrorHandler.isRetriableError(errorCategory);
console.log(`错误可重试: ${isRetriable}`);

// 标准化错误对象
const standardizedError = ErrorHandler.createStandardizedError(error, 'API调用');
console.log(standardizedError);

// 格式化错误输出
const formattedError = ErrorHandler.formatError(standardizedError);
console.log(formattedError);
```

### 11. TokenUsageParser（Token 解析器）

统一解析不同提供商的 token 使用信息。

```javascript
const parser = new TokenUsageParser();

const usage = parser.parse(response, 'openai');
// 返回：{ input: 100, output: 50, total: 150, provider: 'openai' }

const autoUsage = parser.parseAuto(response, 'claude-sonnet-4');
```

## 配置示例

```json
{
  "executor": {
    "retryConfig": {
      "maxRetries": 3,
      "baseDelay": 1000,
      "maxDelay": 30000,
      "timeout": 60000,
      "useJitter": true
    },
    "rateLimitConfig": {
      "defaultRps": 10,
      "defaultBurst": 20,
      "modelLimits": {
        "gpt-4o": { "rps": 5, "burst": 10 },
        "claude-sonnet-4": { "rps": 8, "burst": 15 }
      }
    },
    "requestConfig": {
      "maxSockets": 100,
      "timeout": 30000,
      "keepAliveTimeout": 60000
    }
  }
}
```

## 运行测试

```bash
node src/executor/test.js
```

## 与 ModelSelector 集成

```javascript
const ModelSelector = require('./src/selector/optimized/ModelSelector');
const ConcurrentExecutor = require('./src/executor/ConcurrentExecutor');
const ModelRegistry = require('./src/selector/registry/ModelRegistry');

// 初始化共享组件
const modelRegistry = new ModelRegistry();
const sharedConcurrencyManager = SharedConcurrencyManager.getInstance();
sharedConcurrencyManager.setModelRegistry(modelRegistry);

// 创建 ModelSelector
const modelSelector = new ModelSelector({ modelRegistry });

// 创建 ConcurrentExecutor
const executor = new ConcurrentExecutor({
  modelRegistry,
  retryConfig: { maxRetries: 3 },
  rateLimitConfig: { defaultRps: 10 }
});

// 使用流程
const selectionResult = modelSelector.select(subtask);
const executionResult = await executor.execute(selectionResult, subtask);
```

## 特性

- **单例模式**: SharedConcurrencyManager 确保选择器和执行器共享同一并发状态
- **负载感知**: 调度任务时考虑模型当前负载
- **备选模型切换**: 主选模型不可用时自动切换到备选模型
- **重试机制**: 指数退避 + Jitter 的智能重试
- **限流控制**: 令牌桶算法控制请求速率
- **Token 解析**: 统一解析不同提供商的 token 使用信息
- **成本跟踪**: 实时统计执行成本

## 设计文档

详细设计文档请参阅：
- `plans/concurrent-executor-plan/04-concurrent-executor-plan-part1-core.md`
