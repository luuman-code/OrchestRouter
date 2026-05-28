/**
 * @fileoverview ImportAnalyzer - 导入分析器
 *
 * 负责从代码中提取导入/导出语句
 * 支持多种语言导入语法（JavaScript、TypeScript、Python 等）
 */

/**
 * ImportStatement - 导入语句
 *
 * @typedef {Object} ImportStatement
 * @property {string} specifier - 导入路径（如 './Button'）
 * @property {string[]} imported - 导入的符号（如 ['Button', 'Props']）
 * @property {'named'|'default'|'namespace'|'dynamic'} type - 导入类型
 * @property {boolean} isTypeOnly - 是否仅为类型导入（TS 特有）
 * @property {number} start - 在源码中的起始位置
 * @property {number} end - 在源码中的结束位置
 * @property {string} original - 原始导入语句
 */

/**
 * ExportSymbol - 导出符号
 *
 * @typedef {Object} ExportSymbol
 * @property {string} name - 导出符号名称
 * @property {'variable'|'function'|'class'|'type'|'interface'|'default'} type - 导出类型
 * @property {boolean} isTypeOnly - 是否仅为类型导出（TS 特有）
 * @property {number} start - 在源码中的起始位置
 * @property {number} end - 在源码中的结束位置
 * @property {string} original - 原始导出语句
 */

/**
 * FileAnalysis - 文件分析结果
 *
 * @typedef {Object} FileAnalysis
 * @property {string} path - 文件路径
 * @property {string[]} imports - 导入路径列表
 * @property {string[]} exports - 导出符号列表
 * @property {string[]} provides - 推断该文件提供的符号
 * @property {ImportStatement[]} importDetails - 完整的导入详情
 * @property {ExportSymbol[]} exportDetails - 完整的导出详情
 */

/**
 * ImportAnalyzer - 导入分析器
 *
 * 使用专业解析器或正则表达式提取导入/导出语句
 */
class ImportAnalyzer {
  /**
   * 支持的解析器库
   */
  static get PARSER_LIBRARIES() {
    return {
      javascript: '@babel/parser',
      typescript: '@babel/parser',
      jsx: '@babel/parser',
      tsx: '@babel/parser',
      python: 'ast'
    };
  }

  /**
   * 从代码中提取导入语句
   *
   * @param {string} content - 代码内容
   * @param {string} language - 编程语言
   * @returns {ImportStatement[]} 导入语句列表
   */
  extractImports(content, language) {
    const normalizedLang = this.normalizeLanguage(language);

    // 尝试使用专业解析器
    const parser = this.getParser(normalizedLang);
    if (parser) {
      try {
        return this.extractImportsWithParser(content, parser, normalizedLang);
      } catch (error) {
        console.warn(`AST parser failed for ${language}, using regex fallback: ${error.message}`);
      }
    }

    // 降级到正则表达式提取
    return this.extractImportsWithRegex(content, normalizedLang);
  }

  /**
   * 从代码中提取导出语句
   *
   * @param {string} content - 代码内容
   * @param {string} language - 编程语言
   * @returns {ExportSymbol[]} 导出符号列表
   */
  extractExports(content, language) {
    const normalizedLang = this.normalizeLanguage(language);

    // 尝试使用专业解析器
    const parser = this.getParser(normalizedLang);
    if (parser) {
      try {
        return this.extractExportsWithParser(content, parser, normalizedLang);
      } catch (error) {
        console.warn(`AST parser failed for ${language}, using regex fallback: ${error.message}`);
      }
    }

    // 降级到正则表达式提取
    return this.extractExportsWithRegex(content, normalizedLang);
  }

  /**
   * 分析文件
   *
   * @param {CodeFile} codeFile - 代码文件
   * @returns {FileAnalysis} 文件分析结果
   */
  analyzeFile(codeFile) {
    const imports = this.extractImports(codeFile.content, codeFile.language);
    const exports = this.extractExports(codeFile.content, codeFile.language);

    return {
      path: codeFile.path,
      imports: imports.map((i) => i.specifier),
      exports: exports.map((e) => e.name),
      provides: exports.map((e) => e.name),
      importDetails: imports,
      exportDetails: exports
    };
  }

  /**
   * 标准化语言标识符
   *
   * @private
   * @param {string} language - 语言
   * @returns {string} 标准化后的语言
   */
  normalizeLanguage(language) {
    if (!language) return 'unknown';

    const normalized = language.toLowerCase().trim();

    const langMap = {
      javascript: 'javascript',
      js: 'javascript',
      ecmascript: 'javascript',
      typescript: 'typescript',
      ts: 'typescript',
      jsx: 'jsx',
      tsx: 'tsx',
      python: 'python',
      py: 'python'
    };

    return langMap[normalized] || normalized;
  }

  /**
   * 获取对应语言的解析器
   *
   * @private
   * @param {string} language - 语言
   * @returns {Object|null} 解析器
   */
  getParser(language) {
    switch (language) {
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        try {
          const parser = require('@babel/parser');
          return {
            parse: (code) =>
              parser.parse(code, {
                sourceType: 'module',
                allowImportExportEverywhere: false,
                allowReturnOutsideFunction: true,
                plugins: [
                  'typescript',
                  'jsx',
                  'decorators-legacy',
                  'classProperties',
                  'optionalChaining',
                  'nullishCoalescingOperator'
                ]
              })
          };
        } catch (e) {
          return null;
        }

      case 'python':
        // Python AST 解析器在 Node.js 环境中可能需要特殊处理
        return null;

      default:
        return null;
    }
  }

  /**
   * 使用解析器提取导入语句
   *
   * @private
   * @param {string} content - 代码内容
   * @param {Object} parser - 解析器
   * @param {string} language - 语言
   * @returns {ImportStatement[]} 导入语句列表
   */
  extractImportsWithParser(content, parser, language) {
    const ast = parser.parse(content);
    const imports = [];

    // 遍历 AST 提取导入语句
    this.traverseAST(ast, (node) => {
      if (node.type === 'ImportDeclaration') {
        const specifier = node.source.value;
        const imported = node.specifiers.map((spec) => {
          if (spec.type === 'ImportDefaultSpecifier') {
            return { name: spec.local.name, type: 'default' };
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            return { name: spec.local.name, type: 'namespace' };
          } else if (spec.type === 'ImportSpecifier') {
            return {
              name: spec.imported.name || spec.local.name,
              type: 'named'
            };
          }
          return null;
        }).filter(Boolean);

        imports.push({
          specifier,
          imported: imported.map((i) => i.name),
          type: this.determineImportType(imported),
          isTypeOnly: node.importKind === 'type',
          start: node.start,
          end: node.end,
          original: content.slice(node.start, node.end)
        });
      }
    });

    return imports;
  }

  /**
   * 使用正则表达式提取导入语句（降级策略）
   *
   * @private
   * @param {string} content - 代码内容
   * @param {string} language - 语言
   * @returns {ImportStatement[]} 导入语句列表
   */
  extractImportsWithRegex(content, language) {
    const imports = [];

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
      // ES6 import 语句
      const importPatterns = [
        // 默认导入：import React from 'react'
        /import\s+(\w+)\s+from\s+['"](.*?)['"]/g,
        // 命名导入：import { foo, bar } from './module'
        /import\s*{([^}]+)}\s*from\s+['"](.*?)['"]/g,
        // 命名空间导入：import * as utils from './utils'
        /import\s*\*\s*as\s+(\w+)\s+from\s+['"](.*?)['"]/g,
        // 纯副作用导入：import './styles.css'
        /import\s+['"](.*?)['"]/g
      ];

      for (const pattern of importPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (pattern.source.includes('*')) {
            // 命名空间导入
            imports.push({
              specifier: match[2],
              imported: [match[1]],
              type: 'namespace',
              isTypeOnly: false,
              start: match.index,
              end: match.index + match[0].length,
              original: match[0]
            });
          } else if (pattern.source.includes('{')) {
            // 命名导入
            const names = match[1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            imports.push({
              specifier: match[2],
              imported: names,
              type: 'named',
              isTypeOnly: false,
              start: match.index,
              end: match.index + match[0].length,
              original: match[0]
            });
          } else if (!match[0].includes('from')) {
            // 纯副作用导入
            imports.push({
              specifier: match[1],
              imported: [],
              type: 'dynamic',
              isTypeOnly: false,
              start: match.index,
              end: match.index + match[0].length,
              original: match[0]
            });
          } else {
            // 默认导入
            imports.push({
              specifier: match[2],
              imported: [match[1]],
              type: 'default',
              isTypeOnly: false,
              start: match.index,
              end: match.index + match[0].length,
              original: match[0]
            });
          }
        }
      }

      // CommonJS require
      const requirePattern = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"](.*?)['"]\)/g;
      let requireMatch;
      while ((requireMatch = requirePattern.exec(content)) !== null) {
        imports.push({
          specifier: requireMatch[2],
          imported: [requireMatch[1]],
          type: 'default',
          isTypeOnly: false,
          start: requireMatch.index,
          end: requireMatch.index + requireMatch[0].length,
          original: requireMatch[0]
        });
      }
    } else if (language === 'python') {
      // Python import 语句
      const importPatterns = [
        // import module
        /^import\s+(\w+)/gm,
        // from module import ...
        /^from\s+([\w.]+)\s+import\s+(.+)/gm
      ];

      for (const pattern of importPatterns) {
        let pyMatch;
        while ((pyMatch = pattern.exec(content)) !== null) {
          if (pattern.source.includes('from')) {
            const names = pyMatch[2]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            imports.push({
              specifier: pyMatch[1],
              imported: names,
              type: 'named',
              isTypeOnly: false,
              start: pyMatch.index,
              end: pyMatch.index + pyMatch[0].length,
              original: pyMatch[0]
            });
          } else {
            imports.push({
              specifier: pyMatch[1],
              imported: [],
              type: 'default',
              isTypeOnly: false,
              start: pyMatch.index,
              end: pyMatch.index + pyMatch[0].length,
              original: pyMatch[0]
            });
          }
        }
      }
    }

    return imports;
  }

  /**
   * 使用解析器提取导出语句
   *
   * @private
   * @param {string} content - 代码内容
   * @param {Object} parser - 解析器
   * @param {string} language - 语言
   * @returns {ExportSymbol[]} 导出符号列表
   */
  extractExportsWithParser(content, parser, language) {
    const ast = parser.parse(content);
    const exports = [];

    this.traverseAST(ast, (node) => {
      if (node.type === 'ExportDefaultDeclaration') {
        exports.push({
          name: 'default',
          type: this.determineExportType(node.declaration),
          isTypeOnly: node.exportKind === 'type',
          start: node.start,
          end: node.end,
          original: content.slice(node.start, node.end)
        });
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            exports.push({
              name: spec.exported.name,
              type: 'named',
              isTypeOnly: node.exportKind === 'type',
              start: node.start,
              end: node.end,
              original: content.slice(node.start, node.end)
            });
          }
        } else if (node.declaration) {
          exports.push({
            name: this.getDeclarationName(node.declaration),
            type: this.determineExportType(node.declaration),
            isTypeOnly: node.exportKind === 'type',
            start: node.start,
            end: node.end,
            original: content.slice(node.start, node.end)
          });
        }
      }
    });

    return exports;
  }

  /**
   * 使用正则表达式提取导出语句（降级策略）
   *
   * @private
   * @param {string} content - 代码内容
   * @param {string} language - 语言
   * @returns {ExportSymbol[]} 导出符号列表
   */
  extractExportsWithRegex(content, language) {
    const exports = [];

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
      // export default
      const defaultExportPattern = /export\s+default\s+/g;
      let defaultMatch;
      while ((defaultMatch = defaultExportPattern.exec(content)) !== null) {
        exports.push({
          name: 'default',
          type: 'default',
          isTypeOnly: false,
          start: defaultMatch.index,
          end: defaultMatch.index + defaultMatch[0].length,
          original: defaultMatch[0]
        });
      }

      // export { foo, bar }
      const namedExportPattern = /export\s*{([^}]+)}\s*(?:from\s+['"](.*?)[''])?/g;
      let namedMatch;
      while ((namedMatch = namedExportPattern.exec(content)) !== null) {
        const names = namedMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          exports.push({
            name: name.split(/\s+as\s+/)[0].trim(),
            type: 'named',
            isTypeOnly: false,
            start: namedMatch.index,
            end: namedMatch.index + namedMatch[0].length,
            original: namedMatch[0]
          });
        }
      }

      // export const/function/class
      const declarationExportPatterns = [
        { pattern: /export\s+(?:const|let|var)\s+(\w+)/g, type: 'variable' },
        { pattern: /export\s+(?:async\s+)?function\s+(\w+)/g, type: 'function' },
        { pattern: /export\s+class\s+(\w+)/g, type: 'class' },
        { pattern: /export\s+interface\s+(\w+)/g, type: 'interface' },
        { pattern: /export\s+type\s+(\w+)/g, type: 'type' }
      ];

      for (const { pattern, type } of declarationExportPatterns) {
        let declMatch;
        while ((declMatch = pattern.exec(content)) !== null) {
          exports.push({
            name: declMatch[1],
            type,
            isTypeOnly: type === 'type',
            start: declMatch.index,
            end: declMatch.index + declMatch[0].length,
            original: declMatch[0]
          });
        }
      }
    }

    return exports;
  }

  /**
   * 遍历 AST
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {Function} callback - 回调函数
   */
  traverseAST(node, callback) {
    if (!node || typeof node !== 'object') return;

    callback(node);

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          this.traverseAST(item, callback);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.traverseAST(value, callback);
      }
    }
  }

  /**
   * 确定导入类型
   *
   * @private
   * @param {Array} imported - 导入的符号列表
   * @returns {'named'|'default'|'namespace'} 导入类型
   */
  determineImportType(imported) {
    if (imported.length === 0) return 'dynamic';
    if (imported.some((i) => i.type === 'namespace')) return 'namespace';
    if (imported.some((i) => i.type === 'default')) return 'default';
    return 'named';
  }

  /**
   * 确定导出类型
   *
   * @private
   * @param {Object} declaration - 导出声明
   * @returns {string} 导出类型
   */
  determineExportType(declaration) {
    if (!declaration) return 'named';

    switch (declaration.type) {
      case 'FunctionDeclaration':
        return 'function';
      case 'ClassDeclaration':
        return 'class';
      case 'VariableDeclaration':
        return 'variable';
      case 'TSInterfaceDeclaration':
        return 'interface';
      case 'TSTypeAliasDeclaration':
        return 'type';
      default:
        return 'named';
    }
  }

  /**
   * 获取声明名称
   *
   * @private
   * @param {Object} declaration - 声明节点
   * @returns {string} 名称
   */
  getDeclarationName(declaration) {
    if (declaration.id && declaration.id.name) {
      return declaration.id.name;
    }
    return 'anonymous';
  }
}

module.exports = { ImportAnalyzer };
