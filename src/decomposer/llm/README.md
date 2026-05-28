# LLM 客户端配置指南

## 概述

分解器现在支持使用本地 LLM（如 Ollama/qwen2.5:3b）进行类型推理。

## 快速开始

### 1. 安装 Ollama

如果尚未安装 Ollama，请访问 [https://ollama.com](https://ollama.com) 下载并安装。

### 2. 拉取模型

```bash
ollama pull qwen2.5:3b
```

### 3. 启动 Ollama 服务

```bash
ollama serve
```

默认情况下，Ollama 服务运行在 `http://localhost:11434`。

### 4. 配置分解器

在使用分解器时，传入 LLM 配置：

```javascript
const ElasticDecomposer = require('./src/decomposer');

const decomposer = new ElasticDecomposer({
  // LLM 配置
  llmBaseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  timeout: 60000,
  retryAttempts: 2,
  temperature: 0.1,

  // 其他配置
  debug: true,
  maxConcurrency: 5
});

// 使用分解器
const result = await decomposer.decompose(task);
```

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `llmBaseUrl` | `http://localhost:11434` | LLM 服务的基础 URL |
| `model` | `qwen2.5:3b` | 使用的模型名称 |
| `timeout` | `60000` | 请求超时时间（毫秒） |
| `retryAttempts` | `2` | 重试次数 |
| `temperature` | `0.1` | 温度参数（0-1，越低越确定） |
| `maxConcurrency` | `5` | 最大并发请求数 |
| `maxBatchSize` | `10` | 批量处理的最大数量 |

## 直接使用 LLMClient

你也可以直接使用 LLMClient：

```javascript
const LLMClient = require('./src/decomposer/llm/LLMClient');

const llmClient = new LLMClient({
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  timeout: 60000
});

// 发送消息
const response = await llmClient.chat('你好，请帮我分析这个任务...');
console.log(response);

// 健康检查
const isHealthy = await llmClient.healthCheck();

// 获取模型列表
const models = await llmClient.listModels();
```

## 类型推理

TypeAnnotator 会自动使用配置的 LLM 进行类型推理：

```javascript
const TypeAnnotator = require('./src/decomposer/types/TypeAnnotator');

const annotator = new TypeAnnotator({
  llmBaseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  pluginManager: pluginManager // 如果有插件管理器
});

// 标注单个交付物
const result = await annotator.annotateSingle({
  description: '创建登录页面组件'
});

// 标注多个交付物
const results = await annotator.annotateMultiple(deliverables);
```

## 故障排除

### Ollama 服务未运行

如果看到连接错误，请确保 Ollama 服务正在运行：

```bash
ollama serve
```

### 模型未下载

如果看到模型错误，请确保已下载模型：

```bash
ollama pull qwen2.5:3b
```

### 超时问题

如果请求超时，可以增加超时时间或减少并发数：

```javascript
{
  timeout: 120000,  // 增加到 2 分钟
  maxConcurrency: 2  // 减少并发数
}
```

## API 参考

### LLMClient

- `chat(prompt, options)` - 发送消息并获取响应
- `chatStream(prompt, onChunk, options)` - 流式获取响应
- `createMessage(messages, options)` - 使用 Anthropic 兼容格式
- `healthCheck()` - 检查服务是否可用
- `listModels()` - 获取可用模型列表

### ConcurrentLLMInferencer

- `inferTypesConcurrently(deliverables)` - 并发推理多个交付物的类型
- `inferSingleType(deliverable)` - 推理单个交付物的类型

### BatchLLMTypeInferencer

- `inferTypes(deliverables)` - 批量推理多个交付物的类型
- `processBatch(batch)` - 处理单个批次
