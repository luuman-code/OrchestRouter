/**
 * MiniMaxLLMClient - MiniMax/DashScope API 客户端
 *
 * 用于调用 MiniMax 系列模型（通过 DashScope API）
 */

const https = require('https');
const http = require('http');

class MiniMaxLLMClient {
  constructor(config = {}) {
    // MiniMax 使用 Anthropic 兼容格式
    this.baseUrl = config.baseUrl || 'https://api.minimaxi.com/anthropic';
    this.model = config.model || 'MiniMax-M2.5';
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY;
    this.timeout = config.timeout || 120000;
    this.maxRetries = config.maxRetries || 3;
    this.temperature = config.temperature || 0.1;
    this.maxTokens = config.maxTokens || 4096;

    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY is required');
    }
  }

  /**
   * 发送消息到 LLM (Anthropic 兼容格式)
   * @param {Array} messages - 消息数组 [{role: 'user'|'assistant'|'system', content: string}]
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 响应对象 {content: [{type: 'text', text: string}]}
   */
  async createMessage(messages, options = {}) {
    const {
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout,
      retries = this.maxRetries
    } = options;

    // Anthropic 格式
    const payload = {
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature,
      max_tokens: maxTokens
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._makeRequest('/v1/messages', payload, timeout);
        return this._parseResponse(response);
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`MiniMax LLM failed after ${retries} attempts: ${error.message}`);
        }
        console.warn(`MiniMax attempt ${attempt + 1} failed, retrying...`);
        await this._delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  /**
   * 发送消息（简单版本）
   * @param {string} prompt - 提示词
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} 响应文本
   */
  async chat(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    const response = await this.createMessage(messages, options);
    return response.content?.[0]?.text || '';
  }

  /**
   * 发送 HTTP 请求
   * @private
   */
  _makeRequest(path, payload, timeout) {
    return new Promise((resolve, reject) => {
      // 正确的 URL 拼接方式
      const fullUrl = this.baseUrl.endsWith('/') ? this.baseUrl + path.slice(1) : this.baseUrl + path;
      const url = new URL(fullUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const payloadStr = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payloadStr)
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
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payloadStr);
      req.end();
    });
  }

  /**
   * 解析 Anthropic 格式的响应
   * @private
   */
  _parseResponse(response) {
    // Anthropic 格式: { content: [{ type: 'text', text: '...' }] }
    if (!response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid Anthropic response format');
    }

    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content: [{
        type: 'text',
        text: textContent
      }]
    };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MiniMaxLLMClient;
