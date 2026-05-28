/**
 * ResponseConverter - 响应格式转换器
 *
 * 将 OpenAI 格式的响应转换为 Anthropic 格式
 * 提取 <thinking>...</thinking> 标签内容作为独立的 thinking 块
 */

class ResponseConverter {
  /**
   * 将 OpenAI 格式响应转换为 Anthropic 格式
   * @param {Object} data - 原始响应数据
   * @param {string} provider - 提供商名称
   * @returns {Object} Anthropic 格式的响应
   */
  static convertToAnthropicFormat(data, provider) {
    // 如果已经是 Anthropic 格式，直接返回
    if (data.content && Array.isArray(data.content)) {
      return data;
    }

    // 从 OpenAI 格式提取 content
    let content = '';
    if (data.choices && data.choices[0]) {
      content = data.choices[0].message?.content || data.choices[0].delta?.content || '';
    }

    if (!content) {
      // 尝试其他格式
      content = data.response || data.message?.content || '';
    }

    // 提取 thinking 内容
    const thinkingContent = ResponseConverter.extractThinkingContent(content);

    // 构建 Anthropic 格式的响应
    const anthropicResponse = {
      id: data.id || 'msg_' + Date.now(),
      type: 'message',
      role: 'assistant',
      content: [],
      model: data.model || 'unknown',
      stop_reason: data.choices ? data.choices[0].finish_reason : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.usage ? (data.usage.prompt_tokens || 0) : 0,
        output_tokens: data.usage ? (data.usage.completion_tokens || 0) : 0,
        total_tokens: data.usage ? (data.usage.total_tokens || 0) : 0
      }
    };

    // 添加 thinking 块（如果有）
    if (thinkingContent) {
      anthropicResponse.content.push({
        type: 'thinking',
        thinking: thinkingContent
      });
    }

    // 添加 text 块
    let textContent = content;
    if (thinkingContent) {
      textContent = content
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .trim();
    }

    if (textContent) {
      anthropicResponse.content.push({
        type: 'text',
        text: textContent
      });
    }

    return anthropicResponse;
  }

  /**
   * 从内容中提取 thinking 标签中的内容
   * @param {string} content - 原始内容
   * @returns {string|null} thinking 内容
   */
  static extractThinkingContent(content) {
    if (!content || typeof content !== 'string') {
      return null;
    }

    // 匹配多种 thinking 标签格式
    const patterns = [
      /<thinking>([\s\S]*?)<\/thinking>/gi,
      /<think>([\s\S]*?)<\/think>/gi,
      /<reasoning>([\s\S]*?)<\/reasoning>/gi,
      /<thought>([\s\S]*?)<\/thought>/gi,
      /<analysis>([\s\S]*?)<\/analysis>/gi
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = content.match(pattern);
      if (match) {
        return match[1] ? match[1].trim() : '';
      }
    }

    return null;
  }

  /**
   * 检查响应是否包含 thinking 内容
   * @param {Object} data - 响应数据
   * @returns {boolean}
   */
  static hasThinkingContent(data) {
    let content = '';

    if (data.choices && data.choices[0]) {
      content = data.choices[0].message?.content || '';
    } else if (data.content && typeof data.content === 'string') {
      content = data.content;
    }

    return ResponseConverter.extractThinkingContent(content) !== null;
  }
}

module.exports = { ResponseConverter };
