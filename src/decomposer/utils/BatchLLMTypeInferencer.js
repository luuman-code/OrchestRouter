/**
 * BatchLLMTypeInferencer - 批量 LLM 处理器
 * 用于批量处理大量交付物的 LLM 推理
 * 支持本地 LLM(如 Ollama/qwen2.5:3b)
 */
class BatchLLMTypeInferencer {
  constructor(config) {
    // 如果传入的是 llmClient，直接使用；否则从配置创建
    if (config.llmClient && typeof config.llmClient.chat === 'function') {
      this.llmClient = config.llmClient;
    } else {
      const LLMClient = require('../llm/LLMClient');
      this.llmClient = new LLMClient({
        baseUrl: config.llmBaseUrl || 'http://localhost:11434',
        model: config.model || 'qwen2.5:3b',
        timeout: config.timeout || 60000,
        maxRetries: config.retryAttempts || 2,
        temperature: config.temperature || 0.1
      });
    }

    this.maxBatchSize = config.maxBatchSize || 10;
    this.timeout = config.timeout || 60000;
    this.retryAttempts = config.retryAttempts || 2;
    this.model = config.model || 'qwen2.5:3b';
    this.predefinedTypes = config.predefinedTypes || [
      'ui', 'style', 'logic', 'api', 'test', 'config',
      'database', 'routing', 'documentation', 'model', 'general'
    ];
  }

  /**
   * 批量推理类型
   */
  async inferTypes(deliverables) {
    if (deliverables.length === 0) return [];

    const batches = this.createBatches(deliverables, this.maxBatchSize);
    const allResults = [];

    for (const batch of batches) {
      try {
        const batchResults = await this.processBatch(batch);
        allResults.push(...batchResults);
      } catch (error) {
        console.error(`Batch processing failed: ${error.message}`);
        const fallbackResults = await this.processBatchWithFallback(batch);
        allResults.push(...fallbackResults);
      }
    }

    return allResults;
  }

  /**
   * 创建批次
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 处理批次
   */
  async processBatch(batch) {
    // 为每个交付物创建独立的推理任务
    const results = [];

    for (let i = 0; i < batch.length; i++) {
      const deliverable = batch[i];
      const index = i;

      for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
        try {
          // 构建单个提示
          const prompt = this.buildSinglePrompt(deliverable, index);

          // 调用真实 LLM
          const response = await this.llmClient.chat(prompt, {
            timeout: this.timeout,
            temperature: 0.1,
            maxTokens: 512
          });

          // 解析响应
          const parsedResult = this.parseSingleResponse(response, index);

          if (parsedResult && this.predefinedTypes.includes(parsedResult.type)) {
            results.push({
              ...deliverable,
              type: parsedResult.type,
              confidence: parsedResult.confidence,
              tagSource: 'batch_llm',
              index
            });
          } else {
            throw new Error(`Invalid type from LLM: ${parsedResult?.type}`);
          }

          break; // 成功则跳出重试循环
        } catch (error) {
          if (attempt === this.retryAttempts) {
            console.warn(`LLM inference failed for deliverable ${index}: ${error.message}`);
            // 使用回退方法
            results.push({
              ...deliverable,
              type: this.fallbackTypeMatching(deliverable.description || deliverable.content),
              confidence: 0.4,
              tagSource: 'fallback_batch',
              index
            });
          } else {
            console.warn(`Batch attempt ${attempt + 1} for item ${index} failed, retrying...`);
            await this.delay(1000 * Math.pow(2, attempt));
          }
        }
      }
    }

    return results;
  }

  /**
   * 使用回退方法处理批次
   */
  async processBatchWithFallback(batch) {
    const results = [];
    for (const deliverable of batch) {
      const fallbackType = this.fallbackTypeMatching(deliverable.description || deliverable.content);
      results.push({
        ...deliverable,
        type: fallbackType,
        confidence: 0.4,
        tagSource: 'fallback_batch'
      });
    }
    return results;
  }

  /**
   * 构建单个提示
   */
  buildSinglePrompt(deliverable, index) {
    return `请判断以下任务描述的类型。从以下选项中选择最合适的类型：${this.predefinedTypes.join(', ')}。
任务描述：${deliverable.description || deliverable.content || 'No description'}
请严格按照以下 JSON 格式返回结果：{"type": "具体的类型", "confidence": 0.0-1.0 之间的置信度}
只返回 JSON，不要任何其他解释。`;
  }

  /**
   * 构建批量提示
   */
  buildBatchPrompt(batch) {
    const tasks = batch.map((deliverable, index) =>
      `${index + 1}. ${deliverable.description || deliverable.content || 'No description'}`
    ).join('\n');

    return `请为以下任务列表确定各自的类型。类型选项：${this.predefinedTypes.join(', ')}

任务列表：
${tasks}

请按照以下 JSON 格式返回结果：
{
  "results": [
    {"index": 0, "type": "具体的类型", "confidence": 0.0-1.0 之间的置信度},
    {"index": 1, "type": "具体的类型", "confidence": 0.0-1.0 之间的置信度},
    ...
  ]
}

只需要返回 JSON，不要其他文字。`;
  }

  /**
   * 解析单个响应
   */
  parseSingleResponse(responseText, index) {
    if (!responseText) return null;

    try {
      // 尝试直接解析 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return {
          type: parsed.type,
          confidence: parsed.confidence || 0.7,
          index
        };
      }

      // 尝试从文本中提取类型
      const typeMatch = responseText.match(/"type"\s*:\s*"([^"]+)"/);
      if (typeMatch) {
        return {
          type: typeMatch[1],
          confidence: 0.7,
          index
        };
      }

      // 尝试提取纯文本类型
      for (const type of this.predefinedTypes) {
        if (responseText.toLowerCase().includes(type.toLowerCase())) {
          return { type, confidence: 0.6, index };
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to parse LLM response: ${error.message}`);
      return null;
    }
  }

  /**
   * 解析批量响应
   */
  parseBatchResponse(responseText) {
    if (!responseText) return [];

    try {
      // 尝试直接解析 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        if (parsed.results && Array.isArray(parsed.results)) {
          return parsed.results;
        }
      }

      // 尝试提取 JSON 数组
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }

      return [];
    } catch (error) {
      console.warn(`Failed to parse batch LLM response: ${error.message}`);
      return [];
    }
  }

  /**
   * 回退类型匹配
   */
  fallbackTypeMatching(content) {
    if (!content) return 'general';

    const contentLower = content.toLowerCase();

    if (contentLower.includes('api') || contentLower.includes('接口') || contentLower.includes('endpoint')) {
      return 'api';
    } else if (contentLower.includes('ui') || contentLower.includes('页面') || contentLower.includes('组件') || contentLower.includes('界面')) {
      return 'ui';
    } else if (contentLower.includes('style') || contentLower.includes('css') || contentLower.includes('样式')) {
      return 'style';
    } else if (contentLower.includes('test') || contentLower.includes('测试')) {
      return 'test';
    } else if (contentLower.includes('database') || contentLower.includes('数据库') || contentLower.includes('schema')) {
      return 'database';
    } else if (contentLower.includes('logic') || contentLower.includes('业务') || contentLower.includes('algorithm')) {
      return 'logic';
    } else {
      return 'general';
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BatchLLMTypeInferencer;
