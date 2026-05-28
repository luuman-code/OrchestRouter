/**
 * ConcurrentLLMInferencer - 并发 LLM 推理器
 * 用于在规则匹配失败时进行 LLM 推理，具有并发控制和重试机制
 * 支持本地 LLM(如 Ollama/qwen2.5:3b)
 */
class ConcurrentLLMInferencer {
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

    this.maxConcurrency = config.maxConcurrency || 5;
    this.timeout = config.timeout || 30000;
    this.retryAttempts = config.retryAttempts || 2;
    this.model = config.model || 'qwen2.5:3b';
    this.semaphore = new (require('./ConcurrencyController').Semaphore)(this.maxConcurrency);
    this.predefinedTypes = config.predefinedTypes || [
      'ui', 'style', 'logic', 'api', 'test', 'config',
      'database', 'routing', 'documentation', 'model', 'general'
    ];
  }

  /**
   * 并发推理类型
   */
  async inferTypesConcurrently(deliverables) {
    if (deliverables.length === 0) return [];

    const tasks = deliverables.map((deliverable, index) => async () => {
      try {
        const result = await this.inferSingleType(deliverable);
        return {
          ...deliverable,
          type: result.type,
          confidence: result.confidence,
          tagSource: 'concurrent_llm',
          index
        };
      } catch (error) {
        console.error(`LLM inference failed for deliverable ${index}: ${error.message}`);
        return {
          ...deliverable,
          type: this.fallbackTypeMatching(deliverable.description || deliverable.content),
          confidence: 0.3,
          tagSource: 'fallback_keyword',
          error: error.message,
          index
        };
      }
    });

    const promises = tasks.map(task => this.semaphore.execute(task));
    const results = await Promise.all(promises);

    // 按原始索引排序
    return results.sort((a, b) => a.index - b.index);
  }

  /**
   * 推理单个类型
   */
  async inferSingleType(deliverable) {
    const prompt = this.buildInferencePrompt(deliverable.description || deliverable.content || '');

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        // 调用真实 LLM（超时通过 LLMClient 内部处理）
        const response = await this.llmClient.chat(prompt, {
          timeout: this.timeout,
          temperature: 0.1,
          maxTokens: 512
        });

        // 解析 LLM 响应
        const result = this.parseLLMResponse(response);

        if (result && this.predefinedTypes.includes(result.type)) {
          return { type: result.type, confidence: result.confidence || 0.7 };
        } else {
          console.warn(`Invalid type from LLM: ${result?.type}, using keyword match`);
          return {
            type: this.fallbackTypeMatching(deliverable.description || deliverable.content),
            confidence: 0.5
          };
        }
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw new Error(`LLM inference failed after ${this.retryAttempts} attempts: ${error.message}`);
        }
        console.warn(`Attempt ${attempt + 1} failed, retrying...`);
        await this.delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 解析 LLM 响应
   */
  parseLLMResponse(responseText) {
    if (!responseText) return null;

    try {
      // 尝试直接解析 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return {
          type: parsed.type,
          confidence: parsed.confidence || 0.7
        };
      }

      // 尝试从文本中提取类型
      const typeMatch = responseText.match(/"type"\s*:\s*"([^"]+)"/);
      if (typeMatch) {
        return {
          type: typeMatch[1],
          confidence: 0.7
        };
      }

      // 尝试提取纯文本类型
      for (const type of this.predefinedTypes) {
        if (responseText.toLowerCase().includes(type.toLowerCase())) {
          return { type, confidence: 0.6 };
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to parse LLM response: ${error.message}`);
      return null;
    }
  }

  /**
   * 构建推理提示
   */
  buildInferencePrompt(content) {
    return `请判断以下任务描述的类型。从以下选项中选择最合适的类型：${this.predefinedTypes.join(', ')}。
任务描述：${content}
请严格按照以下 JSON 格式返回结果：{"type": "具体的类型", "confidence": 0.0-1.0 之间的置信度}
只返回 JSON，不要任何其他解释。`;
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

module.exports = ConcurrentLLMInferencer;
