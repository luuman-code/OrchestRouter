/**
 * EnhancedAsyncRequester - 增强版异步请求器
 *
 * 添加了详细API响应日志功能，用于调试和监控
 * 记录完整的请求/响应数据，同时保持原有功能
 *
 * 继承自 AsyncRequester，添加日志功能
 */

const fs = require('fs');
const path = require('path');
const AsyncRequester = require('./AsyncRequester');

// 创建日志目录
const LOG_DIR = path.join(process.cwd(), 'detailed-api-logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class EnhancedAsyncRequester extends AsyncRequester {
  /**
   * 创建增强版异步请求器
   * @param {Object} config - 配置选项
   * @param {number} config.maxSockets - 最大连接池大小
   * @param {number} config.timeout - 请求超时时间（毫秒）
   * @param {number} config.keepAliveTimeout - 连接保持活跃超时时间
   * @param {boolean} config.enableDetailedLogging - 是否启用详细日志记录
   * @param {string} config.logDirectory - 日志目录路径
   */
  constructor(config = {}) {
    super(config);

    this.config = {
      ...this.config,
      enableDetailedLogging: config.enableDetailedLogging || false,
      logDirectory: config.logDirectory || LOG_DIR,
    };

    // 日志文件路径
    this.logFilePath = path.join(this.config.logDirectory, `api-detailed-log-${new Date().toISOString().slice(0, 10)}.json`);
  }

  /**
   * 记录详细的API请求和响应
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {Object} headers - 请求头
   * @param {Object} body - 请求体
   * @param {Object} response - 响应对象
   * @param {number} duration - 请求耗时
   */
  logDetailedApiCall(url, method, headers, body, response, duration) {
    if (!this.config.enableDetailedLogging) return;

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        request: {
          url,
          method,
          headers: this.sanitizeHeaders(headers), // 移除敏感信息
          body: this.truncateBody(body) // 截断大请求体
        },
        response: {
          status: response.status,
          headers: response.headers,
          data: this.truncateBody(response.data) // 截断大响应体
        },
        duration_ms: duration,
        success: response.ok
      };

      // 将日志追加到文件
      fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry, null, 2) + '\n', { flag: 'a' });

      // 同时输出到控制台（仅在调试模式）
      if (process.env.DEBUG_MODE) {
        console.log('[DETAILED-API-LOG]', JSON.stringify(logEntry, null, 2));
      }
    } catch (error) {
      console.warn(`[EnhancedAsyncRequester] 日志记录失败: ${error.message}`);
    }
  }

  /**
   * 清理请求头，移除敏感信息
   * @param {Object} headers - 原始请求头
   * @returns {Object} 清理后的请求头
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };

    // 移除敏感头部信息
    const sensitiveKeys = ['authorization', 'api-key', 'x-api-key', 'x-auth-token'];
    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * 截断过大的请求/响应体
   * @param {Object|string} body - 原始内容
   * @param {number} maxLength - 最大长度，默认1000字符
   * @returns {Object|string} 截断后的内容
   */
  truncateBody(body, maxLength = 1000) {
    if (!body) return body;

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

    if (bodyString.length <= maxLength) {
      return body;
    }

    return {
      __truncated__: true,
      original_length: bodyString.length,
      content: bodyString.substring(0, maxLength) + '... [TRUNCATED]'
    };
  }

  /**
   * 发起异步 HTTP 请求（覆盖父类方法，添加日志）
   * @param {string} url - 请求 URL
   * @param {string} method - HTTP 方法
   * @param {Object} headers - 请求头
   * @param {Object} body - 请求体
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<Object>} 响应对象
   */
  async request(url, method = 'POST', headers = {}, body = null, timeout = null) {
    // 如果没有传入 timeout，使用构造函数中配置的超时值
    if (timeout === null || timeout === undefined) {
      timeout = this.config.timeout;
    }
    const startTime = Date.now();
    const isHttps = url.startsWith('https://');
    const agent = isHttps ? this.client.httpsAgent : this.client.agent;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        agent,
        timeout
      };

      let data = '';

      const req = (isHttps ? require('https') : require('http')).request(options, (res) => {
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const duration = Date.now() - startTime;
          const response = {
            status: res.statusCode,
            headers: res.headers,
            data: this.parseResponse(data, res.headers['content-type']),
            duration,
            ok: res.statusCode >= 200 && res.statusCode < 300
          };

          // 记录详细的API调用信息
          this.logDetailedApiCall(url, method, headers, body, response, duration);

          resolve(response);
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        const response = {
          status: 0,
          headers: {},
          data: { error: error.message },
          duration,
          ok: false
        };

        // 记录错误情况下的API调用信息
        this.logDetailedApiCall(url, method, headers, body, response, duration);

        reject(new Error(`请求失败：${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        const duration = Date.now() - startTime;
        const response = {
          status: 408,
          headers: {},
          data: { error: `请求超时：${timeout}ms` },
          duration,
          ok: false
        };

        // 记录超时情况下的API调用信息
        this.logDetailedApiCall(url, method, headers, body, response, duration);

        // 创建一个包含部分数据的错误对象，供调用者分析或重试
        const err = new Error(`请求超时：${timeout}ms`);
        err.partialData = data;
        err.partialDataSize = data.length;
        err.timeoutStage = data ? 'response' : 'connect';
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}

module.exports = EnhancedAsyncRequester;
