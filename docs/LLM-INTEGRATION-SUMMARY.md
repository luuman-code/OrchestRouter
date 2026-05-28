# LLM 集成更新总结

## 概述

已将分解器的模拟 LLM 调用替换为真实的本地 LLM (qwen2.5:3b) 调用，通过 Ollama 服务进行交互。

## 修改的文件

### 1. 新建文件

#### `src/decomposer/llm/LLMClient.js`
- 新建的 LLM 客户端类
- 支持与 Ollama 服务交互
- 提供 `chat()`, `chatStream()`, `createMessage()` 等方法
- 支持健康检查和模型列表获取
- 内置重试机制和超时控制

#### `src/decomposer/llm/README.md`
- LLM 客户端配置指南
- 包含安装、配置、使用示例和故障排除

#### `tests/llm-integration-test.js`
- LLM 集成测试脚本
- 测试 LLMClient 基础功能
- 测试 TypeAnnotator 集成
- 测试批量推理功能

#### `examples/llm-decomposer-example.js`
- 使用本地 LLM 的分解器示例
- 展示如何配置和使用 LLM 进行任务分解

### 2. 修改的文件

#### `src/decomposer/utils/ConcurrentLLMInferencer.js`
**修改内容**:
- 移除模拟 LLM 调用
- 添加真实 LLMClient 集成
- 支持从配置自动创建 LLMClient 实例
- 添加 `parseLLMResponse()` 方法解析 LLM 响应
- 默认模型从 `claude-3-haiku-20240307` 改为 `qwen2.5:3b`

**新增功能**:
```javascript
// 自动创建 LLMClient
if (config.llmClient || config.llmBaseUrl) {
  const LLMClient = require('../llm/LLMClient');
  this.llmClient = new LLMClient({
    baseUrl: config.llmBaseUrl || 'http://localhost:11434',
    model: config.model || 'qwen2.5:3b',
    // ...
  });
}
```

#### `src/decomposer/utils/BatchLLMTypeInferencer.js`
**修改内容**:
- 移除模拟 LLM 调用
- 添加真实 LLMClient 集成
- 支持从配置自动创建 LLMClient 实例
- 添加 `parseSingleResponse()` 和 `parseBatchResponse()` 方法
- 改进批量处理逻辑，逐个处理交付物

#### `src/decomposer/types/TypeAnnotator.js`
**修改内容**:
- 支持 `llmBaseUrl` 配置参数
- 即使没有插件管理器也能使用 LLM
- 改进 LLM 辅助推理的回退逻辑

**新增功能**:
```javascript
// 即使没有插件管理器，也可以创建 LLM 推理器
if (config.llmClient || config.llmBaseUrl) {
  // 创建 LLM 推理器...
}
```

#### `src/decomposer/config/default-config.yaml`
**修改内容**:
- 添加 LLM 配置部分
```yaml
llm:
  enabled: true
  base_url: "http://localhost:11434"
  model: "qwen2.5:3b"
  timeout: 60000
  retry_attempts: 2
  temperature: 0.1
  max_concurrency: 3
  max_batch_size: 10
```

#### `src/decomposer/config/ConfigManager.js`
**修改内容**:
- 在 `getBuiltInDefaultConfig()` 中添加默认 LLM 配置

#### `src/decomposer/index.js`
**修改内容**:
- 从配置文件自动加载 LLM 设置
- 将 LLM 配置传递给 TypeAnnotator

```javascript
const llmConfig = {};
if (this.config.llm && this.config.llm.enabled) {
  llmConfig.llmBaseUrl = this.config.llm.base_url;
  llmConfig.model = this.config.llm.model;
  // ...
}
```

## 使用方法

### 1. 安装和启动 Ollama

```bash
# 安装 Ollama (如果尚未安装)
# 访问 https://ollama.com 下载

# 拉取 qwen2.5:3b 模型
ollama pull qwen2.5:3b

# 启动 Ollama 服务
ollama serve
```

### 2. 使用分解器

#### 方式 A: 使用配置文件
```javascript
const ElasticDecomposer = require('./src/decomposer');

const decomposer = new ElasticDecomposer({
  // 配置将从 default-config.yaml 自动加载
  debug: true
});

const result = await decomposer.decompose(task);
```

#### 方式 B: 直接传入配置
```javascript
const ElasticDecomposer = require('./src/decomposer');

const decomposer = new ElasticDecomposer({
  llmBaseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  timeout: 60000,
  retryAttempts: 2,
  temperature: 0.1,
  maxConcurrency: 3
});

const result = await decomposer.decompose(task);
```

#### 方式 C: 运行示例
```bash
node examples/llm-decomposer-example.js
```

### 3. 运行测试

```bash
node tests/llm-integration-test.js
```

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `llmBaseUrl` | `http://localhost:11434` | Ollama 服务地址 |
| `model` | `qwen2.5:3b` | 使用的模型 |
| `timeout` | `60000` | 请求超时时间 (毫秒) |
| `retryAttempts` | `2` | 重试次数 |
| `temperature` | `0.1` | 温度参数 (0-1) |
| `maxConcurrency` | `3` | 最大并发请求数 |
| `maxBatchSize` | `10` | 批量处理最大数量 |

## 工作原理

1. **规则优先**: 类型标注首先使用配置化的规则进行匹配（文件路径、关键词、正则表达式）

2. **LLM 辅助**: 当规则匹配置信度低于阈值 (0.6) 时，自动使用 LLM 进行推理

3. **并发控制**: 使用信号量控制并发请求数，避免 LLM 服务过载

4. **重试机制**: 请求失败时自动重试，使用指数退避策略

5. **响应解析**: 智能解析 LLM 返回的 JSON 响应，支持多种格式

## 注意事项

1. **性能考虑**:
   - 本地 LLM 推理速度比模拟调用慢
   - 建议设置合适的 `maxConcurrency` (2-5)
   - 对于大量交付物，批量处理可能更高效

2. **准确性**:
   - qwen2.5:3b 是一个较小的模型，可能在复杂任务上表现不如大模型
   - 可以通过调整 `temperature` 参数影响输出的确定性
   - 规则匹配仍然优先，LLM 仅作为辅助手段

3. **资源占用**:
   - qwen2.5:3b 模型约需要 2-4GB 内存
   - 推理时会占用一定的 CPU/GPU 资源

## 故障排除

### Ollama 服务未响应
```bash
# 检查服务状态
ollama serve

# 检查模型列表
ollama list
```

### 模型未找到
```bash
# 重新下载模型
ollama pull qwen2.5:3b
```

### 请求超时
- 增加 `timeout` 配置
- 减少 `maxConcurrency` 配置
- 检查系统资源是否充足

### 响应解析失败
- 检查 LLM 返回的格式是否正确
- 调整 `temperature` 参数（降低以获得更确定的输出）
- 在调试模式下查看详细日志

## 后续改进方向

1. 支持更多 LLM 后端（如 vLLM、Text Generation Inference）
2. 添加响应缓存机制，提高重复请求的效率
3. 支持流式处理，减少长任务的等待时间
4. 添加更详细的性能指标和监控
