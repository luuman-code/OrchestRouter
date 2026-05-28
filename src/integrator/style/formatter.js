/**
 * @fileoverview CodeFormatter - 代码格式化器
 *
 * 确保合并后的代码风格一致
 * 集成 Prettier (JavaScript/TypeScript)、Black (Python) 等格式化工具
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * FormatterConfig - 格式化器配置
 *
 * @typedef {Object} FormatterConfig
 * @property {string} [prettierPath] - Prettier 可执行文件路径
 * @property {string} [blackPath] - Black 可执行文件路径
 * @property {boolean} [fallbackEnabled] - 是否启用降级处理
 * @property {boolean} [backupEnabled] - 是否启用格式化前备份
 * @property {Object} [prettierOptions] - Prettier 配置选项
 * @property {Object} [blackOptions] - Black 配置选项
 */

/**
 * FormatResult - 格式化结果
 *
 * @typedef {Object} FormatResult
 * @property {boolean} success - 是否成功
 * @property {string} formattedContent - 格式化后的内容
 * @property {string} [error] - 错误信息
 * @property {'prettier'|'black'|'fallback'|'none'} [toolUsed] - 使用的工具
 * @property {string[]} warnings - 警告信息
 */

/**
 * FormattedResult - 格式化结果（扩展）
 *
 * @typedef {FormatResult & {
 *   originalFilePath: string,
 *   backupFilePath?: string
 * }} FormattedResult
 */

/**
 * CodeFormatter - 代码格式化器
 *
 * 确保合并后的代码风格一致
 */
class CodeFormatter {
  /**
   * 创建代码格式化器
   *
   * @param {FormatterConfig} config - 配置
   * @param {Object} [logger] - 日志记录器
   */
  constructor(config, logger) {
    /** @type {FormatterConfig} */
    this.config = { ...config };
    /** @type {Object} */
    this.logger = logger || console;
  }

  /**
   * 检测工具可用性
   *
   * @param {'prettier'|'black'} tool - 工具名称
   * @returns {boolean} 是否可用
   */
  isToolAvailable(tool) {
    try {
      if (tool === 'prettier') {
        if (this.config.prettierPath) {
          return fs.existsSync(this.config.prettierPath);
        } else {
          require.resolve('prettier');
          return true;
        }
      } else if (tool === 'black') {
        execSync('black --version', { stdio: 'pipe' });
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  /**
   * 获取工具版本信息
   *
   * @param {'prettier'|'black'} tool - 工具名称
   * @returns {string|null} 版本号
   */
  getToolVersion(tool) {
    try {
      if (tool === 'prettier') {
        if (this.config.prettierPath) {
          const prettier = require(this.config.prettierPath);
          return prettier.version || 'unknown';
        } else {
          const prettier = require('prettier');
          return prettier.version || 'unknown';
        }
      } else if (tool === 'black') {
        const versionOutput = execSync('black --version', { encoding: 'utf8' });
        const match = versionOutput.match(/black,\s*version\s*([\d.]+)/i);
        return match ? match[1] : 'unknown';
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  /**
   * 格式化单个文件（主入口）
   *
   * @param {CodeFile} codeFile - 代码文件
   * @returns {FormattedResult} 格式化结果
   */
  formatFile(codeFile) {
    const warnings = [];

    // 检查是否启用了格式化
    if (!this.config || !this.config.fallbackEnabled) {
      return {
        success: true,
        formattedContent: codeFile.content,
        toolUsed: 'none',
        warnings: ['格式化被禁用'],
        originalFilePath: codeFile.path
      };
    }

    // 创建备份（如果启用）
    let backupFilePath;
    if (this.config.backupEnabled) {
      backupFilePath = this.backupBeforeFormat(codeFile.content, codeFile.path);
    }

    // 根据文件类型选择格式化工具
    const fileExt = codeFile.path.split('.').pop()?.toLowerCase();

    if (
      [
        'js',
        'jsx',
        'ts',
        'tsx',
        'json',
        'css',
        'scss',
        'less',
        'graphql',
        'yaml',
        'markdown',
        'md'
      ].includes(fileExt || '')
    ) {
      if (this.isToolAvailable('prettier')) {
        const result = this.formatWithPrettier(codeFile.content, codeFile.path);
        return {
          ...result,
          originalFilePath: codeFile.path,
          backupFilePath
        };
      } else {
        // 记录工具不可用的信息
        const version = this.getToolVersion('prettier');
        warnings.push(`Prettier 不可用 (版本：${version || 'N/A'})，使用降级策略`);

        const result = {
          success: true,
          formattedContent: this.applyFallbackFormatting(
            codeFile.content,
            codeFile.language
          ),
          toolUsed: 'fallback',
          warnings,
          originalFilePath: codeFile.path,
          backupFilePath
        };

        warnings.push(
          `文件 ${codeFile.path} 因 Prettier 不可用而使用内置降级格式化`
        );
        result.warnings = warnings;

        return result;
      }
    } else if (['py'].includes(fileExt || '')) {
      if (this.isToolAvailable('black')) {
        const result = this.formatWithBlack(codeFile.content);
        return {
          ...result,
          originalFilePath: codeFile.path,
          backupFilePath
        };
      } else {
        const version = this.getToolVersion('black');
        warnings.push(`Black 不可用 (版本：${version || 'N/A'})，使用降级策略`);

        const result = {
          success: true,
          formattedContent: this.applyFallbackFormatting(
            codeFile.content,
            codeFile.language
          ),
          toolUsed: 'fallback',
          warnings,
          originalFilePath: codeFile.path,
          backupFilePath
        };

        warnings.push(
          `文件 ${codeFile.path} 因 Black 不可用而使用内置降级格式化`
        );
        result.warnings = warnings;

        return result;
      }
    } else {
      // 对于不支持格式化的语言，直接返回原内容
      warnings.push(`不支持的文件类型，跳过格式化：${codeFile.path}`);
      return {
        success: true,
        formattedContent: codeFile.content,
        toolUsed: 'none',
        warnings,
        originalFilePath: codeFile.path,
        backupFilePath
      };
    }
  }

  /**
   * 使用 Prettier 格式化
   *
   * @private
   * @param {string} content - 内容
   * @param {string} filePath - 文件路径
   * @returns {FormatResult} 格式化结果
   */
  formatWithPrettier(content, filePath) {
    try {
      let prettier;
      if (this.config.prettierPath) {
        prettier = require(this.config.prettierPath);
      } else {
        prettier = require('prettier');
      }

      const options = {
        filepath: filePath,
        ...(this.config.prettierOptions || {})
      };

      const formatted = prettier.format(content, options);

      return {
        success: true,
        formattedContent: formatted,
        toolUsed: 'prettier',
        warnings: []
      };
    } catch (error) {
      const errorMessage = `Prettier 格式化失败：${error.message}`;
      console.warn(errorMessage);

      return {
        success: false,
        formattedContent: content,
        error: errorMessage,
        toolUsed: 'prettier',
        warnings: [`Prettier 格式化失败，将使用降级策略：${filePath}`]
      };
    }
  }

  /**
   * 使用 Black 格式化
   *
   * @private
   * @param {string} content - 内容
   * @returns {FormatResult} 格式化结果
   */
  formatWithBlack(content) {
    try {
      // 创建临时文件来保存内容
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp_${Date.now()}.py`);
      fs.writeFileSync(tempFile, content, 'utf8');

      // 执行 black 格式化
      execSync(`black --quiet "${tempFile}"`, { encoding: 'utf8' });
      const formattedContent = fs.readFileSync(tempFile, 'utf8');

      // 删除临时文件
      fs.unlinkSync(tempFile);

      return {
        success: true,
        formattedContent,
        toolUsed: 'black',
        warnings: []
      };
    } catch (error) {
      const errorMessage = `Black 格式化失败：${error.message}`;
      console.warn(errorMessage);

      return {
        success: false,
        formattedContent: content,
        error: errorMessage,
        toolUsed: 'black',
        warnings: ['Black 格式化失败，将使用降级策略']
      };
    }
  }

  /**
   * 格式化前创建备份
   *
   * @private
   * @param {string} content - 内容
   * @param {string} filePath - 文件路径
   * @returns {string} 备份文件路径
   */
  backupBeforeFormat(content, filePath) {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const baseName = fileName.slice(0, -fileExt.length);

    const backupPath = path.join(dir, `${baseName}.backup${fileExt}`);

    fs.writeFileSync(backupPath, content, 'utf8');

    return backupPath;
  }

  /**
   * 生成格式化状态报告，提高透明度
   *
   * @param {FormattedResult[]} results - 格式化结果列表
   * @returns {string} 格式化报告
   */
  generateFormattingReport(results) {
    const reportLines = ['=== 代码格式化报告 ===\n'];

    const formattedWithPrettier = results.filter(
      (r) => r.toolUsed === 'prettier'
    ).length;
    const formattedWithBlack = results.filter(
      (r) => r.toolUsed === 'black'
    ).length;
    const formattedWithFallback = results.filter(
      (r) => r.toolUsed === 'fallback'
    ).length;
    const skipped = results.filter((r) => r.toolUsed === 'none').length;

    reportLines.push(`总共处理文件：${results.length}`);
    reportLines.push(`使用 Prettier 格式化：${formattedWithPrettier} 个文件`);
    reportLines.push(`使用 Black 格式化：${formattedWithBlack} 个文件`);
    reportLines.push(`使用降级格式化：${formattedWithFallback} 个文件`);
    reportLines.push(`跳过格式化：${skipped} 个文件`);

    // 列出使用降级策略的文件
    if (formattedWithFallback > 0) {
      reportLines.push('\n使用降级格式化的文件:');
      results
        .filter((r) => r.toolUsed === 'fallback')
        .forEach((r) => {
          const warnings = r.warnings.filter(
            (w) =>
              w.includes('因') && w.includes('而使用内置降级格式化')
          );
          if (warnings.length > 0) {
            reportLines.push(`  - ${r.originalFilePath}: ${warnings[0]}`);
          }
        });

      reportLines.push('\n建议安装相应格式化工具以获得更好的格式化效果:');
      reportLines.push(
        '- JavaScript/TypeScript: 安装 prettier (npm install -g prettier)'
      );
      reportLines.push('- Python: 安装 black (pip install black)');
    }

    // 列出跳过的文件
    if (skipped > 0) {
      reportLines.push('\n跳过格式化的文件:');
      results
        .filter((r) => r.toolUsed === 'none')
        .forEach((r) => {
          reportLines.push(`  - ${r.originalFilePath}: ${r.warnings.join(', ')}`);
        });
    }

    reportLines.push('\n=====================');

    return reportLines.join('\n');
  }

  /**
   * 应用降级策略（当工具不可用时）
   *
   * @private
   * @param {string} content - 内容
   * @param {string} language - 语言
   * @returns {string} 格式化后的内容
   */
  applyFallbackFormatting(content, language) {
    const lang = language?.toLowerCase();

    switch (lang) {
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        return this.applyJavaScriptFallback(content);
      case 'python':
        return this.applyPythonFallback(content);
      case 'json':
        return this.applyJsonFallback(content);
      default:
        return this.applyGenericFallback(content);
    }
  }

  /**
   * JavaScript/TypeScript 降级格式化
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 格式化后的内容
   */
  applyJavaScriptFallback(content) {
    let formatted = content;

    // 修复基本缩进问题
    formatted = formatted.replace(/^\s+/gm, (match) => {
      // 将混合的制表符和空格统一为两个空格的倍数
      const normalized = match.replace(/\t/g, '  ');
      const spaceCount = normalized.length;
      const indentLevel = Math.floor(spaceCount / 2);
      return '  '.repeat(indentLevel);
    });

    // 确保在代码块周围有适当的空白行
    formatted = formatted.replace(/{\s*\n/g, '{\n');
    formatted = formatted.replace(/\n\s*}/g, '\n}');

    // 在运算符周围添加空格（简单处理）
    formatted = formatted.replace(
      /\s*([<>!=]=|[+\-*/%=<>!&|])\s*/g,
      (match, operator) => {
        return ` ${operator} `;
      }
    );

    // 清理多余的空白行
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
  }

  /**
   * Python 降级格式化
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 格式化后的内容
   */
  applyPythonFallback(content) {
    let formatted = content;

    // 确保函数和类之间有适当的空行
    formatted = formatted.replace(/(\n\s*)def\s+/g, '\n\n  def ');
    formatted = formatted.replace(/(\n\s*)class\s+/g, '\n\n  class ');

    // 确保 import 语句周围有适当的空行
    formatted = formatted.replace(/^import\s+/gm, '\n$&');
    formatted = formatted.replace(/^from\s+.+import\s+/gm, '\n$&');

    // 清理多余的空白行
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
  }

  /**
   * JSON 降级格式化
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 格式化后的内容
   */
  applyJsonFallback(content) {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return this.applyGenericFallback(content);
    }
  }

  /**
   * 通用降级格式化
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 格式化后的内容
   */
  applyGenericFallback(content) {
    let formatted = content;

    // 统一缩进（转换制表符为 2 个空格）
    formatted = formatted.replace(/^\s+/gm, (match) => {
      return match.replace(/\t/g, '  ');
    });

    // 清理行尾空格
    formatted = formatted.replace(/[ \t]+$/gm, '');

    // 清理多余的空白行
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // 确保文件末尾有换行符
    if (!formatted.endsWith('\n')) {
      formatted += '\n';
    }

    return formatted;
  }
}

// 修复 Python 格式化中的 bug
CodeFormatter.prototype.applyPythonFallback = function(content) {
  let formatted = content;

  // 确保函数和类之间有适当的空行
  formatted = formatted.replace(/(\n\s*)def\s+/g, '\n\n  def ');
  formatted = formatted.replace(/(\n\s*)class\s+/g, '\n\n  class ');

  // 确保 import 语句周围有适当的空行
  formatted = formatted.replace(/^import\s+/gm, '\n$&');
  formatted = formatted.replace(/^from\s+.+import\s+/gm, '\n$&');

  // 清理多余的空白行
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted;
};

module.exports = { CodeFormatter };
