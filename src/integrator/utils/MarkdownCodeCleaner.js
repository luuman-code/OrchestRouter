/**
 * @fileoverview MarkdownCodeCleaner - Markdown代码清理器
 *
 * 专门用于清理生成代码中的 Markdown 格式标记
 * 解决 29.4% 的文件语法验证失败问题
 */

/**
 * 代码清理选项
 *
 * @typedef {Object} CleanupOptions
 * @property {boolean} [preserveComments] - 是否保留注释
 * @property {string} [language] - 代码语言
 * @property {boolean} [removeMarkdownTags] - 是否移除 Markdown 标记
 * @property {boolean} [normalizeIndentation] - 是否规范化缩进
 */

/**
 * MarkdownCodeCleaner - Markdown代码清理器
 *
 * 提供多种清理方法来移除 Markdown 格式标记并提取纯代码内容
 */
class MarkdownCodeCleaner {
  /**
   * 清理代码中的 Markdown 格式标记
   *
   * @param {string} code - 原始代码内容
   * @param {CleanupOptions} [options] - 清理选项
   * @returns {string} 清理后的代码内容
   */
  static clean(code, options = {}) {
    if (typeof code !== 'string') {
      return '';
    }

    let cleanedCode = code;

    // 默认选项
    const opts = {
      preserveComments: options.preserveComments !== false, // 默认保留注释
      language: options.language || null,
      removeMarkdownTags: options.removeMarkdownTags !== false, // 默认移除 Markdown 标记
      normalizeIndentation: options.normalizeIndentation !== false, // 默认规范化缩进
      ...options
    };

    // 0. 首先移除思考/推理内容（必须在其他处理之前执行）
    cleanedCode = this.removeThinkingContent(cleanedCode);

    // 1. 移除代码块标记
    cleanedCode = this.removeCodeBlockMarkers(cleanedCode, opts);

    // 2. 清理行内代码标记
    cleanedCode = this.removeInlineCodeMarkers(cleanedCode, opts.language);

    // 3. 移除 Markdown 强制换行和特殊格式
    cleanedCode = this.removeMarkdownFormatting(cleanedCode, opts.language);

    // 4. 规范化缩进
    if (opts.normalizeIndentation) {
      cleanedCode = this.normalizeIndentation(cleanedCode);
    }

    // 5. 清理多余的空白行
    cleanedCode = this.cleanupWhitespace(cleanedCode);

    return cleanedCode.trim();
  }

  /**
   * 移除代码块标记
   *
   * @private
   * @param {string} code - 原始代码
   * @param {CleanupOptions} options - 选项
   * @returns {string} 移除代码块标记后的代码
   */
  static removeCodeBlockMarkers(code, options) {
    if (!options.removeMarkdownTags) {
      return code;
    }

    // 处理常见的代码块标记
    // ```language 或 ``` 标记
    const codeBlockRegex = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/gm;

    // 替换代码块标记并提取内部内容
    let cleanedCode = code.replace(codeBlockRegex, (match, codeContent) => {
      // 如果指定了特定语言且匹配，或者没有指定特定语言，则移除代码块标记
      if (!options.language || match.toLowerCase().startsWith('```' + options.language.toLowerCase())) {
        return codeContent || '';
      }
      return match; // 不匹配指定语言时保留原样
    });

    // 处理不完整的代码块（只有开始标记或结束标记）
    cleanedCode = cleanedCode.replace(/^```\s*[a-zA-Z0-9_-]*\s*\n/, ''); // 移除开头的代码块标记
    cleanedCode = cleanedCode.replace(/\n```\s*$/, ''); // 移除结尾的代码块标记

    return cleanedCode;
  }

  /**
   * 移除行内代码标记
   *
   * 注意：对于代码文件（JS/TS/JSX等），不应移除反引号，因为它们是模板字符串的一部分
   *
   * @private
   * @param {string} code - 原始代码
   * @param {string} [language] - 代码语言
   * @returns {string} 移除行内代码标记后的代码
   */
  static removeInlineCodeMarkers(code, language = '') {
    // 代码文件类型列表 - 这些文件可能包含模板字符串，不应移除反引号
    const codeLanguages = ['javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'vue', 'svelte', 'python', 'py', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'java', 'c', 'cpp', 'csharp', 'csharp', 'php', 'scala', 'shell', 'bash', 'sh'];

    const lang = (language || '').toLowerCase();

    // 如果是代码文件类型，不移除反引号（保留模板字符串）
    if (codeLanguages.includes(lang) || lang.startsWith('js') || lang.startsWith('ts')) {
      return code;
    }

    // 行内代码标记：`code`
    const inlineCodeRegex = /`([^`]+)`/g;
    return code.replace(inlineCodeRegex, '$1');
  }

  /**
   * 移除 Markdown 格式标记
   *
   * 注意：对于代码文件，不应该移除这些标记，因为 * 和 _ 可能是代码的一部分
   *
   * @private
   * @param {string} code - 原始代码
   * @param {string} [language] - 代码语言
   * @returns {string} 移除 Markdown 格式后的代码
   */
  static removeMarkdownFormatting(code, language = '') {
    // 代码文件类型列表 - 这些文件的 * 和 _ 是代码的一部分，不应该移除
    const codeLanguages = ['javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'css', 'scss', 'less', 'html', 'vue', 'svelte', 'python', 'py', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'java', 'c', 'cpp', 'csharp', 'php', 'scala', 'shell', 'bash', 'sh'];

    const lang = (language || '').toLowerCase();

    // 如果是代码文件，不移除 Markdown 格式标记（保留 * 和 _ 作为代码的一部分）
    if (codeLanguages.includes(lang) || lang.startsWith('js') || lang.startsWith('ts') || lang.startsWith('css') || lang.startsWith('html')) {
      return code;
    }

    let cleanedCode = code;

    // 移除粗体和斜体标记
    cleanedCode = cleanedCode.replace(/\*\*(.*?)\*\*/g, '$1'); // **text**
    cleanedCode = cleanedCode.replace(/\*(.*?)\*/g, '$1');     // *text*
    cleanedCode = cleanedCode.replace(/__(.*?)__/g, '$1');     // __text__
    cleanedCode = cleanedCode.replace(/_(.*?)_/g, '$1');       // _text_

    // 移除标题标记（只在行首）
    cleanedCode = cleanedCode.replace(/^\s*#+\s+/gm, '');

    // 移除链接和图片标记
    cleanedCode = cleanedCode.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [text](url)
    cleanedCode = cleanedCode.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');   // ![alt](url)

    // 移除引用标记
    cleanedCode = cleanedCode.replace(/^\s*>\s*/gm, '');

    // 移除列表标记
    cleanedCode = cleanedCode.replace(/^\s*[*+-]\s+/gm, ''); // 无序列表
    cleanedCode = cleanedCode.replace(/^\s*\d+\.\s+/gm, ''); // 有序列表

    // 移除水平线
    cleanedCode = cleanedCode.replace(/^\s*[-*_]{3,}\s*$/gm, '');

    // 移除表格标记（简化处理）
    cleanedCode = cleanedCode.replace(/^\s*\|.*\|\s*$/gm, '');

    return cleanedCode;
  }

  /**
   * 规范化缩进
   *
   * @private
   * @param {string} code - 原始代码
   * @returns {string} 规范化缩进后的代码
   */
  static normalizeIndentation(code) {
    const lines = code.split('\n');
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // 如果是只包含空白字符的行，替换成空行
      if (/^\s*$/.test(line)) {
        processedLines.push('');
        continue;
      }

      // 移除行首的空格和制表符，保持相对缩进
      const leadingWhitespace = line.match(/^\s*/)[0];
      const content = line.substring(leadingWhitespace.length);

      // 标准化缩进（使用2个空格）
      const indentLevel = this.calculateIndentLevel(leadingWhitespace);
      const normalizedIndent = '  '.repeat(indentLevel); // 使用2个空格的缩进

      processedLines.push(normalizedIndent + content);
    }

    return processedLines.join('\n');
  }

  /**
   * 计算缩进级别
   *
   * @private
   * @param {string} whitespace - 前导空白字符
   * @returns {number} 缩进级别
   */
  static calculateIndentLevel(whitespace) {
    let spaces = 0;
    for (let char of whitespace) {
      if (char === ' ') {
        spaces++;
      } else if (char === '\t') {
        spaces += 2; // 将制表符视为2个空格
      }
    }
    return Math.floor(spaces / 2); // 每2个空格为一个缩进级别
  }

  /**
   * 清理多余的空白字符
   *
   * @private
   * @param {string} code - 原始代码
   * @returns {string} 清理后的代码
   */
  static cleanupWhitespace(code) {
    // 移除行尾空白字符
    let cleanedCode = code.replace(/[ \t]+$/gm, '');

    // 将多个连续空行替换为最多2个空行
    cleanedCode = cleanedCode.replace(/\n{3,}/g, '\n\n\n');

    // 移除文件末尾的多余空行
    cleanedCode = cleanedCode.replace(/\n+$/, '\n');

    return cleanedCode;
  }

  /**
   * 移除思考/推理内容
   *
   * 移除模型输出中的思考标签和推理内容，如：
   * - <think> ...</think>
   * - <thinking>...</thinking>
   * - <reasoning>...</reasoning>
   *
   * @private
   * @param {string} code - 原始代码
   * @returns {string} 移除思考内容后的代码
   */
  static removeThinkingContent(code) {
    let cleanedCode = code;

    // 移除 <think> ...</think> 标签对
    cleanedCode = cleanedCode.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleanedCode = cleanedCode.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    cleanedCode = cleanedCode.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

    // 移除 XML 风格的思考标签
    cleanedCode = cleanedCode.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    cleanedCode = cleanedCode.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

    // 移除多行注释形式的思考内容（以 <think> 开头）
    cleanedCode = cleanedCode.replace(/\/\*\*<[\s\S]*?>\*\*\//g, '');

    // 移除单行注释形式的思考标记
    cleanedCode = cleanedCode.replace(/^\s*\/\/\s*\(.*?\)\s*$/gm, '');

    return cleanedCode;
  }

  /**
   * 智能清理 - 基于代码语言的特殊处理
   *
   * @param {string} code - 原始代码
   * @param {string} language - 代码语言
   * @returns {string} 清理后的代码
   */
  static smartClean(code, language = '') {
    let cleanedCode = this.clean(code);

    // 首先确保移除思考内容（这应该在语言特定处理之前完成）
    cleanedCode = this.removeThinkingContent(cleanedCode);

    // 根据语言进行特殊处理
    switch ((language || '').toLowerCase()) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
      case 'tsx':
      case 'jsx':
        // 对于 JS/TS/JSX 代码，不应该移除注释，因为注释是合法的代码组成部分
        // 移除 Markdown 格式的代码块标记即可
        break;

      case 'python':
      case 'py':
        // 对于 Python 代码，确保没有 Markdown 注释残留
        cleanedCode = cleanedCode.replace(/^#\s*```.*$/gm, ''); // 移除行首的 # ```
        break;

      case 'html':
        // 对于 HTML，确保标签闭合
        cleanedCode = cleanedCode.replace(/<!--.*?-->/gs, ''); // 移除 HTML 注释
        break;

      case 'css':
        // 对于 CSS，不应该移除注释，因为 CSS 注释 /* */ 是合法的
        // 移除 Markdown 格式的代码块标记即可
        break;

      default:
        // 其他语言的一般处理
        break;
    }

    return cleanedCode;
  }

  /**
   * 提取主要代码块
   *
   * 如果输入包含多个代码块，提取最可能的主要代码块
   *
   * @param {string} text - 包含代码的文本
   * @param {string} [language] - 期望的语言
   * @returns {string} 主要代码块内容
   */
  static extractMainCodeBlock(text, language = '') {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // 尝试找到带有指定语言的代码块
    if (language) {
      const langRegex = new RegExp('```' + language + '\\s*\\n([\\s\\S]*?)\\n```', 'i');
      const match = text.match(langRegex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 如果没有指定语言或找不到指定语言的代码块，尝试找到第一个代码块
    const codeBlockRegex = /```\s*[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/g;
    const matches = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }

    // 返回最长的代码块，这通常是主要内容
    if (matches.length > 0) {
      return matches.reduce((longest, current) =>
        current.length > longest.length ? current : longest
      ).trim();
    }

    // 如果没有找到完整的代码块，尝试移除 Markdown 格式后返回
    return this.clean(text);
  }
}

module.exports = { MarkdownCodeCleaner };