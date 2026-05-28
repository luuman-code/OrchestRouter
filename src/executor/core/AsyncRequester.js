/**
 * AsyncRequester - 异步请求器
 *
 * 负责发起 HTTP 请求，封装通用请求逻辑
 * 管理 HTTP 客户端、连接池、请求封装和响应解析
 *
 * @class AsyncRequester
 */
const https = require('https');
const http = require('http');

class AsyncRequester {
  /**
   * 创建异步请求器
   * @param {Object} config - 配置选项
   * @param {number} config.maxSockets - 最大连接池大小
   * @param {number} config.timeout - 请求超时时间（毫秒）
   * @param {number} config.keepAliveTimeout - 连接保持活跃超时时间
   */
  constructor(config = {}) {
    // 统一超时配置：优先使用传入的 timeout，否则使用配置的 default_timeout，否则默认 180 秒
    const unifiedTimeout = config.timeout || config.defaultTimeout || 180000;
    this.config = {
      maxSockets: config.maxSockets || 100,
      timeout: unifiedTimeout,
      keepAliveTimeout: config.keepAliveTimeout || 60000,
      ...config,
      timeout: unifiedTimeout // 确保使用统一超时
    };

    this.client = this.createHttpClient();
    this.connectionPool = new ConnectionPool(this.config.maxSockets);

    console.log(`[AsyncRequester] 初始化完成，使用超时配置: ${this.config.timeout}ms`);
  }

  /**
   * 创建 HTTP 客户端
   * @returns {Object} HTTP 客户端配置
   */
  createHttpClient() {
    // 创建全局 HTTP Agent，配置连接池
    const agent = new http.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      timeout: this.config.timeout
    });

    // 创建 HTTPS Agent
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      timeout: this.config.timeout,
      rejectUnauthorized: true
    });

    return { agent, httpsAgent };
  }

  /**
   * 发起异步 HTTP 请求
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

    // 添加请求追踪日志
    const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    console.log(`[AsyncRequester] [${requestId}] 发送请求: ${method} ${url}, timeout=${timeout}ms, bodySize=${body ? JSON.stringify(body).length : 0} bytes`);

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

      // 在 response callback 外部声明 data，以便 timeout handler 可以访问
      let data = '';
      let responseHeaders = null;
      let responseStatus = null;

      const req = (isHttps ? https : http).request(options, (res) => {
        responseHeaders = res.headers;
        responseStatus = res.statusCode;

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const duration = Date.now() - startTime;
          console.log(`[AsyncRequester] [${requestId}] 响应完成: status=${res.statusCode}, duration=${duration}ms`);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: this.parseResponse(data, res.headers['content-type']),
            duration,
            ok: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.error(`[AsyncRequester] [${requestId}] 请求失败: ${error.message}, duration=${duration}ms`);
        reject(new Error(`请求失败：${error.message}`));
      });

      req.on('timeout', () => {
        const duration = Date.now() - startTime;
        console.error(`[AsyncRequester] [${requestId}] 请求超时: ${timeout}ms, duration=${duration}ms, partialDataSize=${data.length}`);
        req.destroy();
        // 创建一个包含部分数据的错误对象，供调用者分析或重试
        const err = new Error(`请求超时：${timeout}ms`);
        err.code = 'ETIMEDOUT';
        err.partialData = data;
        err.partialDataSize = data.length;
        err.timeoutStage = data ? 'response' : 'connect';
        err.errorCategory = 'TIMEOUT';  // 确保被正确分类为超时错误
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * 发起流式 HTTP 请求
   * @param {string} url - 请求 URL
   * @param {string} method - HTTP 方法
   * @param {Object} headers - 请求头
   * @param {Object} body - 请求体
   * @param {Object} options - 选项
   * @param {Function} options.onChunk - 接收文本块的回调
   * @param {Function} options.onToolCall - 接收工具调用的回调
   * @param {Function} options.onComplete - 完成回调
   * @param {Function} options.onError - 错误回调
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<Object>} 最终响应对象
   */
  async requestStream(url, method = 'POST', headers = {}, body = null, options = {}, timeout = null) {
    // 如果没有传入 timeout，使用构造函数中配置的超时值
    if (timeout === null || timeout === undefined) {
      timeout = this.config.timeout;
    }

    const { onChunk, onToolCall, onComplete, onError } = options;
    const startTime = Date.now();
    const isHttps = url.startsWith('https://');
    const agent = isHttps ? this.client.httpsAgent : this.client.agent;

    // 添加请求追踪日志
    const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    console.log(`[AsyncRequester] [${requestId}] 发起流式请求: ${method} ${url}, timeout=${timeout}ms`);

    // 流式解析器
    const StreamToolCallParser = require('./StreamToolCallParser');
    const toolCallParser = new StreamToolCallParser();

    // 创建专门的回调处理器
    // 优先使用 onToolCallDelta，如果不存在则使用 onToolCall
    const handleThinkingDelta = options.onThinkingDelta || (() => {});
    const handleTextDelta = options.onTextDelta || (() => {});
    const handleToolCallDelta = options.onToolCallDelta || options.onToolCall || (() => {});

    // 包装函数：将 onChunk 调用分派到正确的专门回调
    const onChunkWrapper = (content, type) => {
      if (type === 'thinking') {
        handleThinkingDelta(content);
      } else if (type === 'tool_args') {
        // 工具参数增量由 handleToolCallDelta 处理
      } else {
        handleTextDelta(content);
      }
    };

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
      let responseHeaders = null;
      let responseStatus = null;
      let streamEnded = false;

      const req = (isHttps ? https : http).request(options, (res) => {
        responseHeaders = res.headers;
        responseStatus = res.statusCode;

        res.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          data += chunkStr;

          // 处理流式数据 - 支持三种格式：
          // 1. SSE 格式 (data:): data: {"choices":[...]}
          // 2. Anthropic SSE 格式 (event:): event: content_block_delta\\ndata: {...}
          // 3. 原始 JSON 格式: {"id":"...","content":[...]}

          // 尝试解析为 JSON（处理原始 JSON 格式）
          try {
            const parsed = JSON.parse(chunkStr.trim());
            // 如果成功解析为 JSON，说明是原始 JSON 格式
            if (parsed && typeof parsed === 'object') {
              // 注意：_processStreamChunk 内部已经会调用 onToolCall 回调
              // 这里不需要再次触发，避免重复
              this._processStreamChunk(parsed, toolCallParser, onChunkWrapper, handleToolCallDelta);
            }
          } catch (e) {
            // 不是原始 JSON 格式，尝试 SSE 格式解析
            const lines = chunkStr.split('\n');
            let eventType = null;
            let jsonData = null;

            for (const line of lines) {
              if (line.startsWith('event:')) {
                // 记录事件类型
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                const jsonStr = line.substring(5).trim();

                // SSE 结束标记
                if (jsonStr === '[DONE]' || jsonStr === '') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(jsonStr);
                  // 设置事件类型（来自 event: 行）
                  if (eventType) {
                    parsed.type = eventType;
                  }
                  // 注意：_processStreamChunk 内部已经会调用 onToolCall 回调
                  // 这里不需要再次触发，避免重复
                  this._processStreamChunk(parsed, toolCallParser, onChunkWrapper, handleToolCallDelta);
                } catch (e) {
                  // 如果不是 JSON，可能是纯文本
                  if (jsonStr && onChunk) {
                    onChunk(jsonStr, null);
                  }
                }
                // 重置事件类型
                eventType = null;
              } else if (line.trim() && !line.startsWith('#')) {
                // 非 SSE 行，可能是纯文本块
                if (onChunk) {
                  onChunk(line, null);
                }
              }
            }
          }
        });

        res.on('end', () => {
          const duration = Date.now() - startTime;
          console.log(`[AsyncRequester] [${requestId}] 流式响应完成: status=${res.statusCode}, duration=${duration}ms`);

          streamEnded = true;

          // 提取最终工具调用
          const completeToolCalls = toolCallParser.extractCompleteToolCalls();

          if (onComplete) {
            onComplete({
              status: res.statusCode,
              headers: res.headers,
              data: data,
              duration,
              toolCalls: completeToolCalls,
              ok: res.statusCode >= 200 && res.statusCode < 300
            });
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: this.parseResponse(data, res.headers['content-type']),
            duration,
            toolCalls: completeToolCalls,
            ok: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.error(`[AsyncRequester] [${requestId}] 流式请求失败: ${error.message}, duration=${duration}ms`);

        if (onError) {
          onError(error);
        }
        reject(new Error(`流式请求失败：${error.message}`));
      });

      req.on('timeout', () => {
        const duration = Date.now() - startTime;
        console.error(`[AsyncRequester] [${requestId}] 流式请求超时: ${timeout}ms, duration=${duration}ms`);

        req.destroy();

        const err = new Error(`流式请求超时：${timeout}ms`);
        err.code = 'ETIMEDOUT';
        err.partialData = data;
        err.errorCategory = 'TIMEOUT';

        if (onError) {
          onError(err);
        }
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * 处理流式数据块
   * @param {Object} chunk - 解析后的 JSON 对象
   * @param {StreamToolCallParser} parser - 工具调用解析器
   * @param {Function} onChunk - 文本块回调
   * @param {Function} onToolCall - 工具调用回调
   * @returns {Object} { textDelta: string, toolCalls: Array }
   */
  _processStreamChunk(chunk, parser, onChunk, onToolCall) {
    const result = {
      textDelta: '',
      toolCalls: []
    };

    // MiniMax 完整响应格式（非流式，content 是数组）
    // 格式: {"type":"message","content":[{"thinking":"..."},{"text":"..."},{"tool_use":{...}}]}
    if (chunk.type === 'message' && Array.isArray(chunk.content)) {
      for (const item of chunk.content) {
        if (item.thinking) {
          // 思考内容
          const thinkingContent = typeof item.thinking === 'string' ? item.thinking : JSON.stringify(item.thinking);
          result.textDelta = thinkingContent;
          if (onChunk) {
            onChunk(thinkingContent, 'thinking');
          }
        } else if (item.text) {
          // 文本内容
          const textContent = typeof item.text === 'string' ? item.text : JSON.stringify(item.text);
          result.textDelta = textContent;
          if (onChunk) {
            onChunk(textContent, null);
          }
          // 增量解析工具调用
          const parseResult = parser.processChunk(textContent);
          if (parseResult.toolCalls.length > 0) {
            result.toolCalls.push(...parseResult.toolCalls);
          }
        } else if (item.tool_use) {
          // 工具调用
          const toolUse = item.tool_use;
          const toolCall = {
            id: toolUse.id || `tool_call_${result.toolCalls.length}`,
            type: 'function',
            name: toolUse.name || '',
            arguments: typeof toolUse.arguments === 'string' ? toolUse.arguments : JSON.stringify(toolUse.arguments || {})
          };
          result.toolCalls.push(toolCall);
          if (onToolCall) {
            onToolCall(toolCall);
          }
        }
      }
      return result;
    }

    // MiniMax Anthropic SSE 流式格式
    // 格式: event: content_block_start\ndata: {"type":"content_block_start",...}
    //       event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"..."}}
    //       event: content_block_stop\ndata: {"type":"content_block_stop",...}

    // 【修复】Anthropic SSE 格式处理：content_block_start
    if (chunk.type === 'content_block_start' && chunk.content_block) {
      if (chunk.content_block.type === 'tool_use') {
        // 记录工具调用的 id、名称，并初始化参数缓冲区
        parser.currentToolCallId = chunk.content_block.id || null;
        parser.currentToolCallName = chunk.content_block.name || null;
        parser.currentArgumentsBuffer = '';
        parser.state = 'parsing_arguments';

        // 同时在累积器中创建一个占位符
        if (parser.toolCallAccumulator && parser.currentToolCallId) {
          const placeholder = {
            id: parser.currentToolCallId,
            type: 'function',
            name: parser.currentToolCallName || '',
            arguments: ''
          };
          parser.toolCallAccumulator.set(parser.currentToolCallId, placeholder);
        }
      }
      return result;
    }

    // 【修复】Anthropic SSE 格式处理：content_block_delta
    if (chunk.type === 'content_block_delta' && chunk.delta) {
      const delta = chunk.delta;

      // 思考内容 (thinking_delta)
      if (delta.type === 'thinking_delta' && delta.thinking) {
        const thinkingContent = delta.thinking;
        result.textDelta = thinkingContent;
        if (onChunk) {
          onChunk(thinkingContent, 'thinking');
        }
        // 【新增】从 thinking 内容中尝试提取 tool_use JSON 数组
        // 部分模型（如 deepseek）可能将 tool_use 嵌入在 thinking 文本中
        const thinkingParseResult = parser.parseThinkingForToolCalls(thinkingContent);
        if (thinkingParseResult.toolCalls.length > 0) {
          result.toolCalls.push(...thinkingParseResult.toolCalls);
        }
      }
      // 文本内容 (text_delta)
      else if (delta.type === 'text_delta' && delta.text) {
        const textContent = delta.text;
        result.textDelta = textContent;
        if (onChunk) {
          onChunk(textContent, null);
        }
        // 增量解析工具调用
        const parseResult = parser.processChunk(textContent);
        if (parseResult.toolCalls.length > 0) {
          result.toolCalls.push(...parseResult.toolCalls);
        }
      }
      // 工具调用参数 (input_json_delta)
      // 【修复】MiniMax 模型：只累积参数，不实时解析，等待 content_block_stop 时一次性解析
      else if (delta.type === 'input_json_delta') {
        const partialJson = delta.partial_json || '';
        // 累积到参数缓冲区（不尝试解析）
        parser.currentArgumentsBuffer += partialJson;
      }

      return result;
    }

    // 【修复】Anthropic SSE 格式处理：content_block_stop
    // 【修复】MiniMax 模型：当工具调用结束时，一次性解析完整的 arguments
    if (chunk.type === 'content_block_stop') {
      if (parser.currentToolCallId && parser.currentToolCallName) {
        let finalArguments = parser.currentArgumentsBuffer;

        // 尝试将累积的字符串解析为 JSON
        try {
          const parsedArgs = JSON.parse(parser.currentArgumentsBuffer);
          finalArguments = JSON.stringify(parsedArgs);
        } catch (e) {
          // JSON 解析失败，尝试修复
          try {
            // 使用 StreamToolCallParser 的 _tryFixJson 策略
            const fixedJson = this._tryFixJson(parser.currentArgumentsBuffer);
            if (fixedJson) {
              // 验证修复后的 JSON
              JSON.parse(fixedJson);
              finalArguments = fixedJson;
            }
          } catch (e2) {
            // 无法修复，使用原始字符串
            finalArguments = parser.currentArgumentsBuffer;
          }
        }

        // 构建完整的 tool_call
        const toolCall = {
          id: parser.currentToolCallId,
          type: 'function',
          name: parser.currentToolCallName,
          arguments: finalArguments
        };

        // 更新累积器中的 tool_call
        if (parser.toolCallAccumulator) {
          parser.toolCallAccumulator.set(parser.currentToolCallId, toolCall);
        }

        result.toolCalls.push(toolCall);
        if (onToolCall) {
          onToolCall(toolCall);
        }
      }

      // 重置状态
      parser.currentToolCallId = null;
      parser.currentToolCallName = null;
      parser.currentArgumentsBuffer = '';
      parser.state = 'idle';

      return result;
    }

    // MiniMax SSE 格式
    if (chunk.choices && chunk.choices[0]) {
      const delta = chunk.choices[0].delta;

      if (delta) {
        // 文本内容
        if (delta.content) {
          const textDelta = typeof delta.content === 'string' ? delta.content : JSON.stringify(delta.content);
          result.textDelta = textDelta;

          if (onChunk) {
            onChunk(textDelta, null);
          }

          // 增量解析工具调用
          const parseResult = parser.processChunk(textDelta);
          if (parseResult.toolCalls.length > 0) {
            result.toolCalls = parseResult.toolCalls;
          }
        }

        // MiniMax 可能直接在 delta 中包含 tool_calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const toolCall = {
              id: tc.id || `tool_call_${result.toolCalls.length}`,
              type: 'function',
              name: tc.function?.name || tc.name || '',
              arguments: tc.function?.arguments || tc.arguments || '{}'
            };
            result.toolCalls.push(toolCall);

            if (onToolCall) {
              onToolCall(toolCall);
            }
          }
        }
      }

      // 检查 finish_reason
      const finishReason = chunk.choices[0].finish_reason;
      if (finishReason === 'tool_calls' || finishReason === 'function_calls') {
        // 工具调用完成
        const completeToolCalls = parser.extractCompleteToolCalls();
        result.toolCalls = completeToolCalls;
      }
    }

    // DeepSeek 思考链格式
    if (chunk.reasoning) {
      const reasoningDelta = typeof chunk.reasoning === 'string' ? chunk.reasoning : JSON.stringify(chunk.reasoning);
      result.textDelta = reasoningDelta;

      if (onChunk) {
        onChunk(reasoningDelta, 'thinking');
      }
    }

    // OpenAI 格式 delta
    if (chunk.object === 'chat.completion.chunk' && chunk.choices) {
      const delta = chunk.choices[0]?.delta;

      if (delta) {
        if (delta.content) {
          const textDelta = delta.content;
          result.textDelta = textDelta;

          if (onChunk) {
            onChunk(textDelta, null);
          }

          // 增量解析
          const parseResult = parser.processChunk(textDelta);
          if (parseResult.toolCalls.length > 0) {
            // 【修复】使用 push 追加而不是覆盖，确保之前累积的 toolCalls 不会丢失
            result.toolCalls.push(...parseResult.toolCalls);
          }
        }

        if (delta.tool_calls) {
          // 【修复】使用 parser.toolCallAccumulator 累积同一 ID 的 tool_call 的 arguments
          // DeepSeek/OpenAI 格式中，只有第一个 chunk 有完整 id，后续只有 index
          for (const tc of delta.tool_calls) {
            // 优先使用 id，如果 id 不存在则使用 index 来追踪同一 tool_call
            const tcId = tc.id || (tc.index !== undefined ? `tool_call_index_${tc.index}` : `tool_call_${result.toolCalls.length}`);

            // 检查是否已经存在这个 ID 的 tool_call
            if (parser.toolCallAccumulator && parser.toolCallAccumulator.has(tcId)) {
              // 累积 arguments 值
              const existing = parser.toolCallAccumulator.get(tcId);
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
              }
              // 更新 name（如果新值不为空）
              if (tc.function?.name) {
                existing.name = tc.function.name;
              }
              // 仍然触发回调，但传更新后的对象
              if (onToolCall) {
                onToolCall(existing);
              }
            } else {
              // 创建新的 tool_call
              const toolCall = {
                id: tcId,
                type: 'function',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '{}'
              };
              if (parser.toolCallAccumulator) {
                parser.toolCallAccumulator.set(tcId, toolCall);
              }
              result.toolCalls.push(toolCall);
              if (onToolCall) {
                onToolCall(toolCall);
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 尝试修复不完整的 JSON 字符串（用于 MiniMax 流式响应解析）
   * 在 content_block_stop 时，如果累积的 arguments JSON 不完整，尝试修复
   * @param {string} jsonStr - 可能不完整的 JSON 字符串
   * @returns {string|null} 修复后的 JSON 字符串或 null
   * @private
   */
  _tryFixJson(jsonStr) {
    if (!jsonStr) return null;

    // 尝试直接解析
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch (e) {
      // 忽略解析错误
    }

    // 尝试找到有效的 JSON 对象
    const startIdx = jsonStr.indexOf('{');
    if (startIdx === -1) return null;

    // 从结尾反向查找 }
    let endIdx = jsonStr.lastIndexOf('}');
    if (endIdx === -1 || endIdx < startIdx) {
      endIdx = jsonStr.length;
    }

    // 提取可能的 JSON 对象
    let potentialJson = jsonStr.substring(startIdx, endIdx + 1);

    // 尝试解析
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) {
      // 忽略解析错误
    }

    // 尝试修复：找到最后一个完整的键值对后截断
    // 策略：找到最后一个逗号，然后尝试补全
    const lastComma = potentialJson.lastIndexOf(',');
    if (lastComma > 0) {
      // 尝试在最后一个逗号处截断并补全
      const truncated = potentialJson.substring(0, lastComma) + '}';
      try {
        JSON.parse(truncated);
        return truncated;
      } catch (e2) {
        // 尝试另一种修复策略
      }
    }

    // 尝试补全缺失的引号
    const fixed = potentialJson
      .replace(/([^"])\s*}/g, '$1"}')
      .replace(/}\s*}/g, '}}');
    try {
      JSON.parse(fixed);
      return fixed;
    } catch (e3) {
      // 无法修复
    }

    return null;
  }

  /**
   * 解析响应
   * @param {string} data - 响应数据
   * @param {string} contentType - 内容类型
   * @returns {any} 解析后的数据
   */
  parseResponse(data, contentType) {
    if (!contentType) {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(data);
      } catch (e) {
        throw new Error(`JSON 解析失败：${e.message}`);
      }
    }

    return data;
  }

  /**
   * 创建连接
   * @param {string} modelId - 模型 ID
   * @returns {Promise<Object>} 连接对象
   */
  async createConnection(modelId) {
    return await this.connectionPool.getConnection(modelId);
  }

  /**
   * 释放连接
   * @param {string} modelId - 模型 ID
   * @param {Object} connection - 连接对象
   */
  releaseConnection(modelId, connection) {
    this.connectionPool.releaseConnection(modelId, connection);
  }

  /**
   * 关闭所有连接
   */
  async destroy() {
    await this.connectionPool.destroy();
    if (this.client.agent) {
      this.client.agent.destroy();
    }
    if (this.client.httpsAgent) {
      this.client.httpsAgent.destroy();
    }
  }
}

/**
 * ConnectionPool - 连接池管理器
 *
 * 管理到不同模型 API 的连接，复用连接提高性能
 */
class ConnectionPool {
  /**
   * 创建连接池
   * @param {number} maxConnections - 最大连接数
   */
  constructor(maxConnections = 100) {
    this.maxConnections = maxConnections;
    this.pools = new Map(); // 按模型分组的连接池
    this.globalSemaphore = new Semaphore(maxConnections);
  }

  /**
   * 获取连接
   * @param {string} modelId - 模型 ID
   * @returns {Promise<Object>} 连接对象
   */
  async getConnection(modelId) {
    await this.globalSemaphore.acquire();

    if (!this.pools.has(modelId)) {
      this.pools.set(modelId, this.createPoolForModel(modelId));
    }

    const pool = this.pools.get(modelId);
    return await pool.acquire();
  }

  /**
   * 释放连接
   * @param {string} modelId - 模型 ID
   * @param {Object} connection - 连接对象
   */
  releaseConnection(modelId, connection) {
    if (this.pools.has(modelId)) {
      this.pools.get(modelId).release(connection);
    }
    this.globalSemaphore.release();
  }

  /**
   * 为特定模型创建连接池
   * @param {string} modelId - 模型 ID
   * @returns {Object} 连接池对象
   */
  createPoolForModel(modelId) {
    const pool = {
      connections: [],
      maxConnections: 10, // 可根据模型配置调整
      pendingAcquires: [], // 等待获取连接的请求队列

      /**
       * 获取连接
       * @returns {Promise<Object>} 连接对象
       */
      acquire: async function() {
        // 如果有空闲连接，立即返回
        if (this.connections.length > 0) {
          return this.connections.pop();
        }

        // 如果未达到最大连接数，创建新连接
        if (this.connections.length + this.pendingAcquires.length < this.maxConnections) {
          const connection = this.createConnection(modelId);
          return connection;
        }

        // 否则加入等待队列
        return new Promise((resolve) => {
          this.pendingAcquires.push(resolve);
        });
      },

      /**
       * 释放连接
       * @param {Object} connection - 连接对象
       */
      release: function(connection) {
        // 如果有待处理的请求，将连接分配给它们
        if (this.pendingAcquires.length > 0) {
          const resolve = this.pendingAcquires.shift();
          resolve(connection);
        } else {
          // 否则将连接放回池中
          if (this.connections.length < this.maxConnections) {
            this.connections.push(connection);
          } else {
            // 如果池已满，关闭连接
            this.closeConnection(connection);
          }
        }
      },

      /**
       * 创建新连接
       * @param {string} modelId - 模型 ID
       * @returns {Object} 连接对象
       */
      createConnection: function(modelId) {
        // 在HTTP Agent级别，我们主要通过复用Agent来实现连接复用
        // 实际的连接由Node.js的Agent管理
        return {
          id: `${modelId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          modelId: modelId,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          isActive: true,

          // 检查连接是否仍然有效
          isValid: function() {
            // 简单的有效性检查 - 连接存在且未超过最大使用时间
            return this.isActive && (Date.now() - this.createdAt < 300000); // 5分钟有效期
          },

          // 关闭连接
          close: function() {
            this.isActive = false;
          }
        };
      },

      /**
       * 关闭连接
       * @param {Object} connection - 连接对象
       */
      closeConnection: function(connection) {
        if (connection && typeof connection.close === 'function') {
          connection.close();
        }
      }
    };

    return pool;
  }

  /**
   * 销毁连接池
   */
  async destroy() {
    for (const [, pool] of this.pools.entries()) {
      // 清空所有连接
      for (const connection of pool.connections) {
        if (connection && typeof connection.close === 'function') {
          connection.close();
        }
      }
      pool.connections = [];

      // 解决所有等待的请求（返回空连接，让请求使用Agent）
      while (pool.pendingAcquires.length > 0) {
        const resolve = pool.pendingAcquires.shift();
        resolve(null); // 使用null表示不使用特定连接，而是使用全局Agent
      }
    }
    this.pools.clear();
  }
}

/**
 * Semaphore - 信号量实现
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits;
    this.queue = [];
  }

  async acquire() {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.permits++;
    if (this.queue.length > 0 && this.permits > 0) {
      this.permits--;
      const resolve = this.queue.shift();
      resolve();
    }
  }
}

module.exports = AsyncRequester;
