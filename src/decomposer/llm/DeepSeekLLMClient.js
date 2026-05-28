/**
 * DeepSeek LLM 客户端
 *
 * 提供与 DeepSeek API 的交互接口
 * 支持 deepseek-v4-pro 等模型
 */

const https = require('https');
const http = require('http');

class DeepSeekLLMClient {
  /**
   * 创建 DeepSeek LLM 客户端
   * @param {Object} config - 配置选项
   * @param {string} config.apiKey - DeepSeek API Key
   * @param {string} config.baseUrl - API 基础地址（默认: https://api.deepseek.com）
   * @param {string} config.model - 模型名称（默认: deepseek-v4-pro）
   * @param {number} config.timeout - 超时时间（毫秒）
   * @param {number} config.maxRetries - 最大重试次数
   * @param {number} config.temperature - 温度参数
   * @param {number} config.maxTokens - 最大 token 数
   * @param {boolean} config.thinking - 是否启用思考模式（默认: false）
   * @param {string} config.reasoningEffort - 思考强度 high/max（默认: high）
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.deepseek.com';
    this.model = config.model || 'deepseek-v4-pro';
    this.timeout = config.timeout || 120000; // DeepSeek 可能需要更长的响应时间
    this.maxRetries = config.maxRetries || 3;
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 4096;
    this.thinking = config.thinking || false;
    this.reasoningEffort = config.reasoningEffort || 'high';

    if (!this.apiKey) {
      console.warn('[DeepSeekLLMClient] API Key 未设置，请设置 DEEPSEEK_API_KEY 环境变量或在配置中指定');
    }
  }

  /**
   * 发送聊天请求到 DeepSeek API
   * @param {string} prompt - 提示词
   * @param {Object} options - 额外选项
   * @param {boolean} options.thinking - 是否启用思考模式
   * @param {string} options.reasoningEffort - 思考强度 high/max
   * @returns {Promise<string>} LLM 响应内容
   */
  async chat(prompt, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries,
      thinking = this.thinking,
      reasoningEffort = this.reasoningEffort
    } = options;

    const messages = [
      { role: 'user', content: prompt }
    ];

    const payload = {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    // 添加思考模式参数
    if (thinking) {
      payload.thinking = {
        type: 'enabled',
        reasoning_effort: reasoningEffort
      };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/v1/chat/completions', payload, timeout);
        return response.choices?.[0]?.message?.content || '';
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`DeepSeek chat failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`DeepSeek attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 发送消息（Anthropic 兼容格式）
   * @param {Array} messages - 消息数组 [{role: 'user'|'assistant', content: string}]
   * @param {Object} options - 额外选项
   * @param {boolean} options.thinking - 是否启用思考模式
   * @param {string} options.reasoningEffort - 思考强度 high/max
   * @returns {Promise<Object>} 响应对象 {content: [{type: 'text', text: string}]}
   */
  async createMessage(messages, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries,
      thinking = this.thinking,
      reasoningEffort = this.reasoningEffort
    } = options;

    // 将消息格式转换为 DeepSeek 格式
    const deepseekMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    const payload = {
      model: model,
      messages: deepseekMessages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    // 添加思考模式参数
    if (thinking) {
      payload.thinking = {
        type: 'enabled',
        reasoning_effort: reasoningEffort
      };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/v1/chat/completions', payload, timeout);
        const content = response.choices?.[0]?.message?.content || '';
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`DeepSeek createMessage failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`DeepSeek createMessage attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 发送流式聊天请求
   * @param {string} prompt - 提示词
   * @param {Function} onChunk - 每个响应块的回调
   * @param {Object} options - 额外选项
   * @param {boolean} options.thinking - 是否启用思考模式
   * @param {string} options.reasoningEffort - 思考强度 high/max
   * @returns {Promise<string>} 完整的响应内容
   */
  async chatStream(prompt, onChunk, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      thinking = this.thinking,
      reasoningEffort = this.reasoningEffort
    } = options;

    const messages = [
      { role: 'user', content: prompt }
    ];

    const payload = {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: true
    };

    // 添加思考模式参数
    if (thinking) {
      payload.thinking = {
        type: 'enabled',
        reasoning_effort: reasoningEffort
      };
    }

    return await this._makeStreamRequest('/v1/chat/completions', payload, onChunk, timeout);
  }

  /**
   * 发送带工具定义的聊天请求
   * @param {string} prompt - 提示词
   * @param {Object} options - 额外选项
   * @param {Array} options.tools - 工具定义数组
   * @param {boolean} options.thinking - 是否启用思考模式
   * @param {string} options.reasoningEffort - 思考强度 high/max
   * @returns {Promise<Object>} { content: string, toolCalls: Array }
   */
  async chatWithTools(prompt, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries,
      thinking = this.thinking,
      reasoningEffort = this.reasoningEffort,
      tools = []
    } = options;

    const messages = [
      { role: 'user', content: prompt }
    ];

    const payload = {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    // 添加工具定义
    if (tools.length > 0) {
      payload.tools = tools;
    }

    // 添加思考模式参数
    if (thinking) {
      payload.thinking = {
        type: 'enabled',
        reasoning_effort: reasoningEffort
      };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/v1/chat/completions', payload, timeout);

        // 提取文本内容
        const content = response.choices?.[0]?.message?.content || '';

        // 提取工具调用
        const toolCalls = this._extractToolCallsFromResponse(response);

        // 提取 finish_reason（用于判断是否被截断）
        const finishReason = response.choices?.[0]?.finish_reason || null;

        return { content, toolCalls, finishReason, rawResponse: response };
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`DeepSeek chatWithTools failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`DeepSeek chatWithTools attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 从响应中提取工具调用
   * @param {Object} response - API 响应对象
   * @returns {Array} 工具调用数组
   * @private
   */
  _extractToolCallsFromResponse(response) {
    const toolCalls = [];

    // 检查是否有工具调用 (OpenAI compatible format)
    const message = response.choices?.[0]?.message;
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        toolCalls.push({
          id: toolCall.id,
          name: toolCall.function?.name || toolCall.name,
          arguments: toolCall.function?.arguments || toolCall.input
        });
      }
    }

    return toolCalls;
  }

  /**
   * 发送 HTTP 请求
   * @private
   */
  _makeRequest(path, payload, timeout) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const payloadStr = JSON.stringify(payload);

      // [DEBUG] DeepSeek API 调用调试
      console.log('[DeepSeekLLMClient] API URL:', url.toString());
      console.log('[DeepSeekLLMClient] Model:', payload.model);
      console.log('[DeepSeekLLMClient] API Key length:', this.apiKey ? this.apiKey.length : 0);
      console.log('[DeepSeekLLMClient] Temperature:', payload.temperature);
      console.log('[DeepSeekLLMClient] Max tokens:', payload.max_tokens);
      console.log('[DeepSeekLLMClient] Messages count:', payload.messages?.length);
      console.log('[DeepSeekLLMClient] Tools count:', payload.tools?.length);
      if (payload.thinking) {
        console.log('[DeepSeekLLMClient] Thinking enabled, effort:', payload.thinking.reasoning_effort);
      }
      if (payload.tools?.length > 0) {
        console.log('[DeepSeekLLMClient] Tool definitions:');
        for (const tool of payload.tools) {
          console.log(`  - type: ${tool.type}, function.name: ${tool.function?.name}`);
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: headers,
        timeout: timeout
      };

      const req = httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse JSON response: ${e.message}`));
            }
          } else if (res.statusCode === 401) {
            reject(new Error(`DeepSeek API认证失败，请检查 API Key 是否正确`));
          } else if (res.statusCode === 429) {
            reject(new Error(`DeepSeek API 请求频率超限，请稍后重试`));
          } else {
            // [DEBUG] 记录详细的错误响应
            console.log('[DeepSeekLLMClient] Error response status:', res.statusCode);
            console.log('[DeepSeekLLMClient] Error response data:', data);
            reject(new Error(`HTTP error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      req.write(payloadStr);
      req.end();
    });
  }

  /**
   * 发送流式 HTTP 请求
   * @private
   */
  _makeStreamRequest(path, payload, onChunk, timeout) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const payloadStr = JSON.stringify(payload);

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${this.apiKey}`
      };

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: headers,
        timeout: timeout
      };

      let fullContent = '';

      const req = httpModule.request(options, (res) => {
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  if (onChunk) {
                    onChunk(content);
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        res.on('end', () => {
          resolve(fullContent);
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Stream request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Stream request timeout after ${timeout}ms`));
      });

      req.write(payloadStr);
      req.end();
    });
  }

  /**
   * 延迟
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DeepSeekLLMClient;
