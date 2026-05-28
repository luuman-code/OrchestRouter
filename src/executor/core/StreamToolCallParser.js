/**
 * StreamToolCallParser - 流式工具调用解析器
 *
 * 增量解析流式响应中的工具调用，支持 OpenAI、MiniMax、DeepSeek 等格式
 * 在流式响应过程中实时检测和提取工具调用
 *
 * @class StreamToolCallParser
 */
class StreamToolCallParser {
  constructor() {
    // 当前累积的工具调用
    this.currentToolCalls = [];
    // 正在解析的工具调用ID
    this.currentToolCallId = null;
    // 当前工具调用的名称
    this.currentToolCallName = null;
    // 当前工具调用的参数缓冲区
    this.currentArgumentsBuffer = '';
    // 是否正在解析工具调用参数
    this.isParsingArguments = false;
    // 解析状态
    this.state = 'idle'; // idle | tool_call_start | parsing_arguments | tool_call_end

    // 工具调用ID计数器
    this.toolCallIndex = 0;

    // 【新增】用于累积 OpenAI 格式的 tool_calls（因为 arguments 是增量传输的）
    this.toolCallAccumulator = new Map();

    // 重置状态
    this.reset();
  }

  /**
   * 重置解析器状态
   */
  reset() {
    this.currentToolCalls = [];
    this.currentToolCallId = null;
    this.currentToolCallName = null;
    this.currentArgumentsBuffer = '';
    this.isParsingArguments = false;
    this.state = 'idle';
    // 重置累积器
    this.toolCallAccumulator = new Map();
  }

  /**
   * 处理增量文本块
   * @param {string} textChunk - 文本增量块
   * @returns {Object} 解析结果 { complete: boolean, toolCalls: Array, textDelta: string }
   */
  processChunk(textChunk) {
    const result = {
      complete: false,
      toolCalls: [],
      textDelta: ''
    };

    if (!textChunk || typeof textChunk !== 'string') {
      return result;
    }

    // 根据当前状态处理文本
    let remaining = textChunk;

    while (remaining.length > 0) {
      if (this.state === 'idle') {
        // 查找工具调用开始标记
        const toolStartMatch = remaining.match(/(?:tool_calls|tool_call|tools|tool_use)[\[":]?\s*$/i);

        if (toolStartMatch) {
          // 找到工具调用开始
          const beforeTool = remaining.substring(0, toolStartMatch.index);
          result.textDelta += beforeTool;
          remaining = remaining.substring(toolStartMatch.index + toolStartMatch[0].length);

          this.state = 'tool_call_start';
          this.toolCallIndex++;
          this.currentToolCallId = `tool_call_${this.toolCallIndex}`;
        } else {
          // 没有工具调用，整个文本都是普通文本
          result.textDelta += remaining;
          remaining = '';
        }
      } else if (this.state === 'tool_call_start') {
        // 跳过空白字符
        const wsMatch = remaining.match(/^(\s*)/);
        if (wsMatch) {
          remaining = remaining.substring(wsMatch[1].length);
        }

        if (remaining.startsWith('[')) {
          // OpenAI 格式: [{"id": "call_xxx", "type": "function", ...}]
          remaining = remaining.substring(1);
          this.state = 'parsing_arguments';
        } else if (remaining.startsWith('{')) {
          // 单个工具调用格式: {"id": "call_xxx", ...}
          remaining = remaining.substring(1);
          this.state = 'parsing_arguments';
        } else if (remaining.match(/^\d+\s*:/)) {
          // DeepSeek 思考链格式中的步骤编号，忽略
          remaining = remaining.replace(/^\d+\s*:\s*/, '');
        } else if (remaining.length > 0) {
          // 可能是文本内容结束
          result.textDelta += remaining.charAt(0);
          remaining = remaining.substring(1);
          this.state = 'idle';
        } else {
          remaining = '';
        }
      } else if (this.state === 'parsing_arguments') {
        // 解析工具调用参数
        const parseResult = this._parseArguments(remaining);
        remaining = parseResult.remaining;

        if (parseResult.toolCall) {
          this.currentToolCalls.push(parseResult.toolCall);
          result.toolCalls.push(parseResult.toolCall);
        }

        if (parseResult.complete) {
          this.state = 'idle';
          this.currentToolCallId = null;
          this.currentToolCallName = null;
          this.currentArgumentsBuffer = '';
          this.isParsingArguments = false;
        }
      }
    }

    // 检查是否完成（流结束或检测到完成标记）
    result.complete = this.state === 'idle';

    return result;
  }

  /**
   * 解析工具调用参数
   * @private
   * @param {string} input - 输入文本
   * @returns {Object} { remaining, toolCall, complete }
   */
  _parseArguments(input) {
    const result = {
      remaining: input,
      toolCall: null,
      complete: false
    };

    this.currentArgumentsBuffer += input;

    // 尝试提取工具调用信息
    let buffer = this.currentArgumentsBuffer;

    // 提取名称 (name)
    if (!this.currentToolCallName) {
      const nameMatch = buffer.match(/"name"\s*:\s*"([^"]+)"/);
      if (nameMatch) {
        this.currentToolCallName = nameMatch[1];
        buffer = buffer.substring(nameMatch.index + nameMatch[0].length);
      }
    }

    // 提取参数 (arguments)
    if (this.currentToolCallName) {
      const argsMatch = buffer.match(/"arguments"\s*:\s*("([^"]*)"|({[^}]*}))/)
        || buffer.match(/"args"\s*:\s*("([^"]*)"|({[^}]*}))/)
        || buffer.match(/:\s*({[\s\S]*?})(?=\s*[,}])/);

      if (argsMatch) {
        let argsStr = argsMatch[1] || argsMatch[2] || argsMatch[3] || '{}';

        // 处理转义的 JSON 字符串
        if (argsStr.startsWith('"')) {
          argsStr = JSON.parse(argsStr);
        }

        try {
          // 尝试解析为对象
          const parsed = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
          result.toolCall = {
            id: this.currentToolCallId,
            type: 'function',
            name: this.currentToolCallName,
            arguments: typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
          };
        } catch {
          // 参数还没完整，继续累积
          result.toolCall = {
            id: this.currentToolCallId,
            type: 'function',
            name: this.currentToolCallName,
            arguments: argsStr
          };
        }
      }

      // 检查是否完成（遇到 ] 或 } 表示可能结束）
      if (buffer.includes('}]') || buffer.endsWith('"}') || buffer.endsWith('}')) {
        // 尝试确定是否真的结束了
        const afterToolCall = buffer.split('}]').pop() || buffer.split('"}').pop() || buffer.split('}').pop();
        if (afterToolCall && !afterToolCall.includes('{') && !afterToolCall.includes('"')) {
          result.complete = true;
          this.currentArgumentsBuffer = '';
        }
      }
    }

    // 如果遇到明显的结束标记，标记为完成
    if (buffer.includes(']') && !buffer.includes('"arguments"') && !buffer.includes('"args"')) {
      const afterBracket = buffer.split(']')[1] || '';
      if (!afterBracket.includes('{') && afterBracket.trim() === '') {
        result.complete = true;
        this.currentArgumentsBuffer = '';
      }
    }

    result.remaining = '';
    return result;
  }

  /**
   * 从累积的缓冲区中提取完整的工具调用
   * 流结束时调用，尝试从缓冲区中提取任何残留的工具调用
   * @returns {Array} 工具调用数组
   */
  extractCompleteToolCalls() {
    const toolCalls = [...this.currentToolCalls];

    // 如果缓冲区中有残留的数据，尝试提取工具调用
    if (this.currentArgumentsBuffer && this.currentArgumentsBuffer.length > 0) {
      // 尝试从残留缓冲区中提取工具调用
      const partialToolCall = this._extractPartialToolCall(this.currentArgumentsBuffer);
      if (partialToolCall) {
        // 检查是否已经存在于 toolCalls 中（避免重复）
        const exists = toolCalls.some(tc =>
          tc.name === partialToolCall.name &&
          tc.arguments === partialToolCall.arguments
        );
        if (!exists) {
          toolCalls.push(partialToolCall);
        }
      } else if (this.currentToolCallName) {
        // 没有提取到工具调用，但有残留数据和工具名称
        // 尝试将残留数据作为 arguments 处理
        try {
          // 尝试解析残留数据作为 JSON
          const parsed = JSON.parse(this.currentArgumentsBuffer);
          const toolCall = {
            id: this.currentToolCallId || `tool_call_${this.toolCallIndex}`,
            type: 'function',
            name: this.currentToolCallName,
            arguments: JSON.stringify(parsed)
          };
          const exists = toolCalls.some(tc =>
            tc.name === toolCall.name &&
            tc.arguments === toolCall.arguments
          );
          if (!exists) {
            toolCalls.push(toolCall);
          }
        } catch (e) {
          // JSON 解析失败，使用原始字符串作为 arguments
          // 这是一个 fallback，确保即使数据不完整也能获取到工具调用
          const toolCall = {
            id: this.currentToolCallId || `tool_call_${this.toolCallIndex}`,
            type: 'function',
            name: this.currentToolCallName,
            arguments: this.currentArgumentsBuffer
          };
          const exists = toolCalls.some(tc =>
            tc.name === toolCall.name &&
            tc.arguments === toolCall.arguments
          );
          if (!exists) {
            toolCalls.push(toolCall);
          }
        }
      }
    }

    return toolCalls;
  }

  /**
   * 检查是否有正在进行的工具调用
   * @returns {boolean}
   */
  hasPendingToolCall() {
    return this.state !== 'idle';
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * 处理 input_json_delta 类型的工具调用参数增量
   * 用于 Anthropic/MiniMax 流式格式
   * @param {string} partialJson - JSON 片段
   * @returns {Object} { toolCalls: Array }
   */
  processInputJsonDelta(partialJson) {
    const result = {
      toolCalls: []
    };

    if (!partialJson || typeof partialJson !== 'string') {
      return result;
    }

    // 累积到参数缓冲区
    this.currentArgumentsBuffer += partialJson;

    const buffer = this.currentArgumentsBuffer;

    // 尝试解析累积的缓冲区
    // 移除只有以 } 结尾才尝试解析的限制，因为 content 字段可能包含 }
    try {
      const parsedArgs = JSON.parse(buffer);
      // 成功解析，说明参数完整了

      // 只有在有工具名称时才创建工具调用
      if (this.currentToolCallName) {
        const toolCall = {
          id: this.currentToolCallId || `tool_call_${this.toolCallIndex}`,
          type: 'function',
          name: this.currentToolCallName,
          arguments: JSON.stringify(parsedArgs)
        };

        this.currentToolCalls.push(toolCall);
        result.toolCalls.push(toolCall);

        // 重置状态
        this.currentToolCallId = null;
        this.currentToolCallName = null;
        this.currentArgumentsBuffer = '';
        this.state = 'idle';
      }
    } catch (e) {
      // JSON 解析失败，继续累积
      // 检查是否看起来像是完整的 JSON（用于处理 content 字段包含 } 的情况）
      if (this._looksLikeCompleteJson(buffer)) {
        // JSON 看起来完整但解析失败，尝试提取并修复
        const extractedToolCall = this._extractPartialToolCall(buffer);
        if (extractedToolCall) {
          this.currentToolCalls.push(extractedToolCall);
          result.toolCalls.push(extractedToolCall);
          // 重置状态
          this.currentToolCallId = null;
          this.currentToolCallName = null;
          this.currentArgumentsBuffer = '';
          this.state = 'idle';
        }
      }
    }

    return result;
  }

  /**
   * 检查缓冲区是否看起来像完整的 JSON
   * 用于处理 content 字段包含 } 的情况
   * @param {string} buffer - 缓冲区内容
   * @returns {boolean}
   * @private
   */
  _looksLikeCompleteJson(buffer) {
    if (!buffer || buffer.length === 0) {
      return false;
    }

    // 统计括号和引号的数量
    const openBraces = (buffer.match(/{/g) || []).length;
    const closeBraces = (buffer.match(/}/g) || []).length;
    const openBrackets = (buffer.match(/\[/g) || []).length;
    const closeBrackets = (buffer.match(/\]/g) || []).length;
    const quotes = (buffer.match(/"/g) || []).length;

    // 括号应该配对
    if (openBraces !== closeBraces) return false;
    if (openBrackets !== closeBrackets) return false;

    // 引号数量应该是偶数（每对引号需要2个）
    if (quotes % 2 !== 0) return false;

    // 检查是否有必需的字段
    if (!buffer.includes('"file_path"') && !buffer.includes('"name"')) {
      return false;
    }

    // 检查是否以 } 或 ] 结尾（可能是完整的对象或数组）
    const trimmed = buffer.trim();
    return trimmed.endsWith('}') || trimmed.endsWith(']');
  }

  /**
   * 尝试从可能不完整但看起来完整的 JSON 中提取工具调用
   * 用于处理 content 字段包含 } 导致 JSON.parse 失败的情况
   * @param {string} buffer - 缓冲区内容
   * @returns {Object|null} 工具调用对象或 null
   * @private
   */
  _extractPartialToolCall(buffer) {
    if (!buffer || !this.currentToolCallName) {
      return null;
    }

    // 尝试找到 arguments 字段的值
    // 格式可能是 {"file_path": "...", "content": "..."} 或 {"file_path": "...", "args": "..."}
    const argsMatch = buffer.match(/"arguments"\s*:\s*(\{[\s\S]*\})/);
    const argsMatch2 = buffer.match(/"args"\s*:\s*(\{[\s\S]*\})/);

    let argsStr = null;
    if (argsMatch) {
      argsStr = argsMatch[1];
    } else if (argsMatch2) {
      argsStr = argsMatch2[1];
    }

    if (!argsStr) {
      return null;
    }

    // 尝试解析 arguments
    try {
      const parsedArgs = JSON.parse(argsStr);
      return {
        id: this.currentToolCallId || `tool_call_${this.toolCallIndex}`,
        type: 'function',
        name: this.currentToolCallName,
        arguments: JSON.stringify(parsedArgs)
      };
    } catch (e) {
      // arguments 解析也失败，尝试更宽松的解析
      try {
        // 尝试修复常见的 JSON 问题
        const fixedArgs = this._tryFixJson(argsStr);
        if (fixedArgs) {
          return {
            id: this.currentToolCallId || `tool_call_${this.toolCallIndex}`,
            type: 'function',
            name: this.currentToolCallName,
            arguments: fixedArgs
          };
        }
      } catch (e2) {
        // 无法修复
      }
    }

    return null;
  }

  /**
   * 尝试修复不完整的 JSON 字符串
   * @param {string} jsonStr - 可能不完整的 JSON 字符串
   * @returns {string|null} 修复后的 JSON 字符串或 null
   * @private
   */
  _tryFixJson(jsonStr) {
    if (!jsonStr) return null;

    // 尝试找到有效的 JSON 对象
    // 查找 { 开始的位置
    const startIdx = jsonStr.indexOf('{');
    if (startIdx === -1) return null;

    // 从结尾反向查找 }
    let endIdx = jsonStr.lastIndexOf('}');
    if (endIdx === -1 || endIdx < startIdx) {
      // 尝试补全 }
      endIdx = jsonStr.length;
    }

    // 提取可能的 JSON 对象
    let potentialJson = jsonStr.substring(startIdx, endIdx + 1);

    // 尝试解析
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) {
      // 尝试补全缺失的引号或括号
      // 常见问题：content 字段中的 } 没有正确转义
      // 简单策略：找到最后一个完整的键值对
      const lastComma = potentialJson.lastIndexOf(',');
      if (lastComma > 0) {
        const truncated = potentialJson.substring(0, lastComma) + '}';
        try {
          JSON.parse(truncated);
          return truncated;
        } catch (e2) {
          // 尝试补全缺失的引号
          const fixed = potentialJson.replace(/([^"])\s*}/g, '$1"}').replace(/}\s*}/g, '}}');
          try {
            JSON.parse(fixed);
            return fixed;
          } catch (e3) {
            // 无法修复
          }
        }
      }
    }

    return null;
  }

  /**
   * 静态方法：从流式文本中提取工具调用（一次性解析）
   * @param {string} text - 完整文本
   * @returns {Array} 工具调用数组
   */
  static extractToolCalls(text) {
    const parser = new StreamToolCallParser();
    const toolCalls = [];

    // 尝试解析 OpenAI 格式: "tool_calls":[{"id":"call_xxx","type":"function","function":{"name":"xxx","arguments":"{}"}}]
    const openaiMatch = text.match(/tool_calls\s*\[\s*({[\s\S]*?})\s*\]/i);
    if (openaiMatch) {
      try {
        const parsed = JSON.parse(openaiMatch[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach((tc, idx) => {
            toolCalls.push({
              id: tc.id || `tool_call_${idx}`,
              type: 'function',
              name: tc.function?.name || tc.name || '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || tc.arguments || {})
            });
          });
        } else if (parsed.function) {
          toolCalls.push({
            id: parsed.id || 'tool_call_0',
            type: 'function',
            name: parsed.function.name || '',
            arguments: typeof parsed.function.arguments === 'string'
              ? parsed.function.arguments
              : JSON.stringify(parsed.function.arguments || {})
          });
        }
      } catch (e) {
        // JSON 解析失败，尝试其他方式
      }
    }

    // 尝试解析 DeepSeek Anthropic 格式
    if (toolCalls.length === 0) {
      const deepseekMatch = text.match(/"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*({[^}]+}|"[^"]*")/);
      if (deepseekMatch) {
        try {
          const name = deepseekMatch[1];
          const argsStr = deepseekMatch[2];
          const args = argsStr.startsWith('{') ? JSON.parse(argsStr) : JSON.parse(`"${argsStr}"`);
          toolCalls.push({
            id: 'tool_call_0',
            type: 'function',
            name: name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args)
          });
        } catch (e) {
          // 解析失败
        }
      }
    }

    return toolCalls;
  }

  /**
   * 从 thinking 内容中提取 tool_use JSON 数组
   * 用于处理部分模型将 tool_use 嵌入在 thinking 文本中的情况
   * @param {string} thinkingContent - thinking 文本内容
   * @returns {Object} { toolCalls: Array }
   */
  parseThinkingForToolCalls(thinkingContent) {
    const result = {
      toolCalls: []
    };

    if (!thinkingContent || typeof thinkingContent !== 'string') {
      return result;
    }

    // 尝试匹配 JSON 数组格式: [{"type": "tool_use", ...}]
    const jsonArrayMatch = thinkingContent.match(/(\[\s*\{\s*"type"\s*:\s*"tool_use"[\s\S]*?\])\s*$/);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.type === 'tool_use' && (item.name === 'write_file' || item.name === 'Write')) {
              result.toolCalls.push({
                id: item.id || `tool_call_${result.toolCalls.length}`,
                type: 'function',
                name: item.name || '',
                arguments: typeof item.input === 'string' ? item.input : JSON.stringify(item.input || {})
              });
            }
          }
          if (result.toolCalls.length > 0) {
            console.log(`[parseThinkingForToolCalls] 从 thinking 中提取到 ${result.toolCalls.length} 个 tool_use`);
          }
        }
      } catch (e) {
        // JSON 解析失败，尝试其他方式
      }
    }

    // 如果没找到数组，尝试匹配单个 tool_use 对象
    if (result.toolCalls.length === 0) {
      const singleToolUseMatch = thinkingContent.match(/\{\s*"type"\s*:\s*"tool_use"\s*,\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"input"\s*:\s*(\{[\s\S]*?\})\s*\}/);
      if (singleToolUseMatch) {
        try {
          const name = singleToolUseMatch[1];
          const inputStr = singleToolUseMatch[2];
          const input = JSON.parse(inputStr);
          result.toolCalls.push({
            id: `tool_call_0`,
            type: 'function',
            name: name,
            arguments: JSON.stringify(input)
          });
          console.log(`[parseThinkingForToolCalls] 从 thinking 中提取到单个 tool_use: ${name}`);
        } catch (e) {
          // 解析失败
        }
      }
    }

    return result;
  }
}

module.exports = StreamToolCallParser;
