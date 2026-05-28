/**
 * @fileoverview ResponsePostProcessor - 响应后处理器
 *
 * 对编排器的最终响应进行后处理
 * 统一清理和格式化输出内容，确保高质量的响应交付
 */

/**
 * ResponsePostProcessor - 响应后处理器
 *
 * 处理编排器的最终响应，包括清理、格式化和验证
 */
class ResponsePostProcessor {
  /**
   * 处理响应内容
   *
   * @param {Object} response - 原始响应对象
   * @param {Object} [options] - 处理选项
   * @returns {Object} 处理后的响应对象
   */
  static process(response, options = {}) {
    if (!response) {
      return response;
    }

    const processedResponse = { ...response };

    // 根据响应类型进行不同的处理
    if (processedResponse.content && Array.isArray(processedResponse.content)) {
      // 处理工具调用格式的内容
      processedResponse.content = processedResponse.content.map(item => {
        if (item.type === 'tool_use' && item.input) {
          return this.processToolCall(item, options);
        }
        return item;
      });
    } else if (processedResponse.content) {
      // 处理其他格式的内容
      processedResponse.content = this.processContent(processedResponse.content, options);
    }

    // 如果有其他响应属性需要处理，也可以在这里添加
    if (processedResponse.text) {
      processedResponse.text = this.processContent(processedResponse.text, options);
    }

    return processedResponse;
  }

  /**
   * 处理工具调用
   *
   * @private
   * @param {Object} toolCall - 工具调用对象
   * @param {Object} options - 处理选项
   * @returns {Object} 处理后的工具调用对象
   */
  static processToolCall(toolCall, options = {}) {
    if (!toolCall || !toolCall.input) {
      return toolCall;
    }

    const processedCall = { ...toolCall };
    const input = { ...processedCall.input };

    // 根据工具名称进行特定处理
    switch (processedCall.name) {
      case 'write_file':
        if (input.content) {
          input.content = this.processFileContent(input.content, {
            language: input.language,
            ...options
          });
        }
        break;

      case 'edit_file':
        if (input.old_string) {
          input.old_string = this.processFileContent(input.old_string, {
            language: input.language,
            ...options
          });
        }
        if (input.new_string) {
          input.new_string = this.processFileContent(input.new_string, {
            language: input.language,
            ...options
          });
        }
        break;

      case 'bash':
        if (input.command) {
          // 清理命令内容
          input.command = this.processContent(input.command, options);
        }
        break;

      default:
        // 对于其他工具调用，进行基本的内容处理
        Object.keys(input).forEach(key => {
          if (typeof input[key] === 'string') {
            input[key] = this.processContent(input[key], options);
          }
        });
        break;
    }

    processedCall.input = input;
    return processedCall;
  }

  /**
   * 处理文件内容
   *
   * @private
   * @param {string} content - 文件内容
   * @param {Object} options - 处理选项
   * @returns {string} 处理后的内容
   */
  static processFileContent(content, options = {}) {
    if (typeof content !== 'string') {
      return content;
    }

    // 现代模型直接输出代码，不需要 MarkdownCodeCleaner 清理
    let processedContent = content;

    // 额外的处理步骤
    processedContent = this.removeExcessiveComments(processedContent, options);
    processedContent = this.normalizeLineEndings(processedContent);
    processedContent = this.ensureProperTermination(processedContent, options.language || '');

    return processedContent;
  }

  /**
   * 处理通用内容
   *
   * @private
   * @param {string|Object} content - 内容
   * @param {Object} options - 处理选项
   * @returns {string|Object} 处理后的内容
   */
  static processContent(content, options = {}) {
    if (typeof content !== 'string') {
      return content;
    }

    // 现代模型直接输出代码，不需要 MarkdownCodeCleaner 清理
    let processedContent = content;

    // 额外的清理步骤
    processedContent = this.normalizeLineEndings(processedContent);
    processedContent = this.removeExcessiveWhitespace(processedContent);

    return processedContent;
  }

  /**
   * 移除过度的注释
   *
   * @private
   * @param {string} content - 文件内容
   * @param {Object} options - 处理选项
   * @returns {string} 处理后的内容
   */
  static removeExcessiveComments(content, options = {}) {
    if (!options.removeExcessiveComments !== false) { // 默认移除
      // 移除重复或无意义的注释
      let processedContent = content;

      // 移除重复的代码块标记注释
      processedContent = processedContent.replace(/\/\*\s*```[^\*]*\*\/\s*/g, '');
      processedContent = processedContent.replace(/\/\/\s*```[^\n]*\n/g, '');

      // 移除单独的 Markdown 标记注释
      processedContent = processedContent.replace(/^\/\/\s*[`~]{3}.*$/gm, '');
      processedContent = processedContent.replace(/^\/\*\s*[`~]{3}.*\*\/$/gm, '');

      return processedContent;
    }

    return content;
  }

  /**
   * 规范化行终止符
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 规范化后的内容
   */
  static normalizeLineEndings(content) {
    // 统一使用 \n 作为行终止符
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * 确保适当的终止
   *
   * @private
   * @param {string} content - 内容
   * @param {string} language - 语言类型
   * @returns {string} 处理后的内容
   */
  static ensureProperTermination(content, language) {
    // 根据语言类型确保适当的文件终止
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
        // JavaScript/TypeScript 文件通常不需要特殊的终止符
        break;

      case 'python':
      case 'py':
        // Python 文件也不需要特殊处理
        break;

      case 'json':
        // 确保 JSON 是有效的
        try {
          JSON.parse(content);
        } catch (e) {
          // 如果 JSON 无效，不做特殊处理
        }
        break;

      default:
        // 其他语言的基本处理
        break;
    }

    return content;
  }

  /**
   * 移除过度的空白字符
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 处理后的内容
   */
  static removeExcessiveWhitespace(content) {
    // 移除每行末尾的空白字符
    let processedContent = content.replace(/[ \t]+$/gm, '');

    // 将连续的空行限制为最多2行
    processedContent = processedContent.replace(/\n{3,}/g, '\n\n\n');

    // 移除整个内容末尾的多余空行
    processedContent = processedContent.replace(/\n+$/, '\n');

    return processedContent;
  }

  /**
   * 验证处理后的响应
   *
   * @param {Object} response - 处理后的响应
   * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
   */
  static validateProcessedResponse(response) {
    const errors = [];

    if (response.content && Array.isArray(response.content)) {
      // 验证工具调用数组
      for (let i = 0; i < response.content.length; i++) {
        const item = response.content[i];

        if (item.type === 'tool_use') {
          if (!item.name) {
            errors.push(`Tool call at index ${i} missing name`);
          }

          if (!item.input) {
            errors.push(`Tool call at index ${i} missing input`);
          } else {
            // 根据工具类型验证特定字段
            switch (item.name) {
              case 'write_file':
                if (!item.input.file_path) {
                  errors.push(`write_file call at index ${i} missing file_path`);
                }
                if (typeof item.input.content !== 'string') {
                  errors.push(`write_file call at index ${i} content is not a string`);
                }
                break;

              case 'edit_file':
                if (!item.input.file_path) {
                  errors.push(`edit_file call at index ${i} missing file_path`);
                }
                if (typeof item.input.old_string !== 'string') {
                  errors.push(`edit_file call at index ${i} old_string is not a string`);
                }
                if (typeof item.input.new_string !== 'string') {
                  errors.push(`edit_file call at index ${i} new_string is not a string`);
                }
                break;

              default:
                // 其他工具类型的基本验证
                break;
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取处理统计信息
   *
   * @param {Object} originalResponse - 原始响应
   * @param {Object} processedResponse - 处理后响应
   * @returns {Object} 处理统计信息
   */
  static getProcessingStats(originalResponse, processedResponse) {
    const stats = {
      originalSize: this.getContentSize(originalResponse),
      processedSize: this.getContentSize(processedResponse),
      sizeChange: 0,
      toolCallsCount: 0,
      filesProcessed: 0
    };

    stats.sizeChange = stats.processedSize - stats.originalSize;

    // 计算工具调用数量
    if (processedResponse.content && Array.isArray(processedResponse.content)) {
      stats.toolCallsCount = processedResponse.content.filter(item =>
        item.type === 'tool_use'
      ).length;

      // 计算处理的文件数量
      stats.filesProcessed = processedResponse.content.filter(item =>
        item.type === 'tool_use' &&
        (item.name === 'write_file' || item.name === 'edit_file')
      ).length;
    }

    return stats;
  }

  /**
   * 获取内容大小
   *
   * @private
   * @param {Object} response - 响应对象
   * @returns {number} 内容大小（字节）
   */
  static getContentSize(response) {
    if (!response) return 0;

    const str = JSON.stringify(response);
    return Buffer.byteLength(str, 'utf8');
  }
}

module.exports = { ResponsePostProcessor };