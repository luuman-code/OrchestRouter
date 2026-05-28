/**
 * LLMClient - LLM 客户端
 *
 * 提供与本地 LLM(如 Ollama/qwen2.5:3b) 的交互接口
 * 支持流式和非流式调用
 */

const https = require('https');
const http = require('http');

class LLMClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434'; // Ollama 默认地址
    this.model = config.model || 'qwen2.5:3b';
    this.timeout = config.timeout || 60000;
    this.maxRetries = config.maxRetries || 3;
    this.temperature = config.temperature || 0.1;
    this.maxTokens = config.maxTokens || 4096;

    // 验证配置
    if (!this.baseUrl) {
      throw new Error('LLM baseUrl is required');
    }
  }

  /**
   * 发送消息到 LLM（非流式）
   * @param {string} prompt - 提示词
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} LLM 响应内容
   */
  async chat(prompt, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries
    } = options;

    const payload = {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: temperature,
        num_predict: maxTokens
      }
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/api/generate', payload, timeout);
        return response.response || '';
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`LLM chat failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`LLM attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 发送消息到 LLM（流式）
   * @param {string} prompt - 提示词
   * @param {Function} onChunk - 每个响应块的回调
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} 完整的响应内容
   */
  async chatStream(prompt, onChunk, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout
    } = options;

    const payload = {
      model: model,
      prompt: prompt,
      stream: true,
      options: {
        temperature: temperature,
        num_predict: maxTokens
      }
    };

    return await this._makeStreamRequest('/api/generate', payload, onChunk, timeout);
  }

  /**
   * 使用 Anthropic 兼容的 API 发送消息
   * 适用于支持 Anthropic 格式的本地 LLM
   * @param {Array} messages - 消息数组 [{role: 'user'|'assistant', content: string}]
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 响应对象 {content: [{type: 'text', text: string}]}
   */
  async createMessage(messages, options = {}) {
    const {
      model = this.model,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries
    } = options;

    // 将 Anthropic 格式转换为 Ollama 格式
    const prompt = this._formatMessagesToPrompt(messages);

    const payload = {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: temperature,
        num_predict: maxTokens
      }
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/api/generate', payload, timeout);
        return {
          content: [{
            type: 'text',
            text: response.response || ''
          }]
        };
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`LLM createMessage failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`LLM createMessage attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 将消息格式化为提示词
   * @private
   */
  _formatMessagesToPrompt(messages) {
    return messages.map(msg => {
      if (msg.role === 'user') {
        return `User: ${msg.content}`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}`;
      }
      return msg.content;
    }).join('\n\n');
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

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadStr),
          'Accept': 'application/json'
        },
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
          } else {
            reject(new Error(`HTTP error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
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

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadStr),
          'Accept': 'application/json'
        },
        timeout: timeout
      };

      const req = httpModule.request(options, (res) => {
        let fullResponse = '';

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP error: ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk) => {
          try {
            const data = JSON.parse(chunk.toString());
            if (data.response) {
              fullResponse += data.response;
              if (onChunk) {
                onChunk(data.response, data);
              }
            }
            if (data.done) {
              resolve(fullResponse);
            }
          } catch (e) {
            // 忽略解析错误，继续处理
          }
        });

        res.on('end', () => {
          resolve(fullResponse);
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
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
   * 延迟函数
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查 LLM 服务是否可用
   * @returns {Promise<boolean>} 服务是否可用
   */
  async healthCheck() {
    try {
      const response = await this._getRequest('/api/tags', 5000);
      return true;
    } catch (error) {
      console.warn(`LLM health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取可用的模型列表
   * @returns {Promise<Array>} 模型列表
   */
  async listModels() {
    try {
      const response = await this._getRequest('/api/tags', 5000);
      return response.models?.map(m => m.name) || [];
    } catch (error) {
      console.warn(`Failed to list models: ${error.message}`);
      return [];
    }
  }

  /**
   * 发送 HTTP GET 请求
   * @private
   */
  _getRequest(path, timeout) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
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
          } else {
            reject(new Error(`HTTP error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      req.end();
    });
  }
}

module.exports = LLMClient;
