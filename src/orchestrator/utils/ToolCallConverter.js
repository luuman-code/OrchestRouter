/**
 * ToolCallConverter - 工具调用转换器
 *
 * 将编排器的整合结果转换为 Claude Code 可执行的 Anthropic 工具调用格式
 */

class ToolCallConverter {
  /**
   * 将整合结果转换为 Anthropic 工具调用格式
   * @param {Object} integrationResult - 整合结果
   * @returns {Object} 工具调用格式的对象
   */
  convertToIntegratedToolCalls(integrationResult) {
    const toolCalls = [];

    // 处理文件创建/写入操作
    if (integrationResult.files && integrationResult.files instanceof Map) {
      for (const [filePath, fileData] of integrationResult.files.entries()) {
        toolCalls.push({
          type: "tool_use",
          id: `write_file_${this.generateId()}`,
          name: "write_file",
          input: {
            file_path: filePath,
            content: fileData.content || '',
            language: fileData.language || 'text'
          }
        });
      }
    }

    // 处理文件编辑操作
    if (integrationResult.edits && Array.isArray(integrationResult.edits)) {
      for (const edit of integrationResult.edits) {
        toolCalls.push({
          type: "tool_use",
          id: `edit_file_${this.generateId()}`,
          name: "edit_file",
          input: {
            file_path: edit.file_path,
            old_string: edit.old_string,
            new_string: edit.new_string,
            replace_all: edit.replace_all || false
          }
        });
      }
    }

    // 处理 Bash 命令操作
    if (integrationResult.commands && Array.isArray(integrationResult.commands)) {
      for (const cmd of integrationResult.commands) {
        toolCalls.push({
          type: "tool_use",
          id: `bash_${this.generateId()}`,
          name: "bash",
          input: {
            command: cmd.command,
            description: cmd.description || 'Executed by orchestrator'
          }
        });
      }
    }

    return {
      content: toolCalls
    };
  }

  /**
   * 生成唯一的 ID 用于工具调用
   * @returns {string} 唯一标识符
   */
  generateId() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
}

module.exports = ToolCallConverter;