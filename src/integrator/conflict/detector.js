/**
 * @fileoverview NamingConflictResolver - 命名冲突解决器
 *
 * 检测并解决代码合并时的命名冲突
 * 使用多语言 AST 解析器进行符号提取，考虑作用域
 */

/**
 * SymbolInfo - 符号信息
 *
 * @typedef {Object} SymbolInfo
 * @property {string} name - 符号名称
 * @property {string} type - 符号类型（function, class, variable 等）
 * @property {string} scope - 作用域（global, module, function, block 等）
 * @property {{start: number, end: number}} location - 在源码中的位置
 * @property {boolean} isExported - 是否被导出
 */

/**
 * NamingConflict - 命名冲突
 *
 * @typedef {Object} NamingConflict
 * @property {string} symbolName - 冲突符号名称
 * @property {Array<{file: string, type: string}>} occurrences - 冲突出现位置
 * @property {'warning'|'error'} severity - 严重程度
 * @property {Object} conflictingScopes - 作用域分析
 */

/**
 * ScopeAnalysis - 作用域分析
 *
 * @typedef {Object} ScopeAnalysis
 * @property {string[]} files - 文件列表
 * @property {string[]} scopes - 作用域列表
 * @property {boolean} isTrulyConflicting - 是否构成真正的冲突
 */

/**
 * NamingConflictResolver - 命名冲突解决器
 *
 * 检测命名冲突，仅关注全局/模块级别的符号
 */
class NamingConflictResolver {
  /**
   * 检测命名冲突
   *
   * @param {Map<string, CodeFile>} files - 文件列表
   * @returns {NamingConflict[]} 冲突列表
   */
  detectNamingConflicts(files) {
    const allSymbols = new Map();

    // 为每个文件提取符号
    for (const [filePath, file] of files.entries()) {
      const symbols = this.extractScopedSymbols(file.content, file.language);
      allSymbols.set(filePath, symbols);
    }

    // 只检测全局/模块级别的重要符号冲突
    const conflicts = [];
    const globalSymbols = this.collectGlobalSymbols(allSymbols);

    // 检测重复的全局符号
    for (const [symbolName, occurrences] of Object.entries(globalSymbols)) {
      if (occurrences.length > 1) {
        conflicts.push({
          symbolName,
          occurrences,
          severity: this.determineConflictSeverity(symbolName, occurrences),
          conflictingScopes: this.analyzeScopes(occurrences)
        });
      }
    }

    return conflicts;
  }

  /**
   * 使用 AST 提取带有作用域信息的符号
   *
   * @private
   * @param {string} content - 代码内容
   * @param {string} language - 语言
   * @returns {SymbolInfo[]} 符号列表
   */
  extractScopedSymbols(content, language) {
    const parser = this.getParserForLanguage(language);
    const symbols = [];

    if (parser) {
      try {
        const ast = parser.parse(content);

        // 遍历 AST 节点，识别符号及其作用域
        this.traverseAST(ast, (node, parentScope = 'global') => {
          if (this.isGlobalDeclaration(node)) {
            symbols.push({
              name: this.getNodeName(node),
              type: this.getNodeType(node),
              scope: 'global',
              location: this.getNodeLocation(node),
              isExported: this.isNodeExported(node, content)
            });
          } else if (this.isLocalDeclaration(node)) {
            symbols.push({
              name: this.getNodeName(node),
              type: this.getNodeType(node),
              scope: this.getNodeScope(node, parentScope),
              location: this.getNodeLocation(node),
              isExported: false
            });
          }
        });
      } catch (error) {
        console.warn(`AST parsing failed for ${language}, using fallback: ${error.message}`);
        // 降级到基于正则的符号提取
        return this.extractBasicSymbols(content, language);
      }
    } else {
      // 使用降级策略
      return this.extractBasicSymbols(content, language);
    }

    return symbols;
  }

  /**
   * 收集全局符号
   *
   * @private
   * @param {Map<string, SymbolInfo[]>} allSymbols - 所有符号
   * @returns {Record<string, Array<{file: string, type: string, scope: string}>>} 全局符号映射
   */
  collectGlobalSymbols(allSymbols) {
    const globalSymbols = {};

    for (const [filePath, symbols] of allSymbols.entries()) {
      for (const symbol of symbols) {
        // 只考虑全局/模块级别且被导出的符号
        if (
          symbol.scope === 'global' ||
          symbol.scope === 'module' ||
          symbol.isExported
        ) {
          if (!globalSymbols[symbol.name]) {
            globalSymbols[symbol.name] = [];
          }
          globalSymbols[symbol.name].push({
            file: filePath,
            type: symbol.type,
            scope: symbol.scope
          });
        }
      }
    }

    return globalSymbols;
  }

  /**
   * 分析冲突符号的作用域
   *
   * @private
   * @param {Array<{file: string, type: string, scope: string}>} occurrences - 出现位置
   * @returns {ScopeAnalysis} 作用域分析结果
   */
  analyzeScopes(occurrences) {
    return {
      files: occurrences.map((o) => o.file),
      scopes: occurrences.map((o) => o.scope),
      isTrulyConflicting: this.areScopesActuallyConflicting(occurrences)
    };
  }

  /**
   * 判断是否构成真正的冲突
   *
   * @private
   * @param {Array<{file: string, type: string, scope: string}>} occurrences - 出现位置
   * @returns {boolean} 是否构成真正的冲突
   */
  areScopesActuallyConflicting(occurrences) {
    // 即使在同一模块中有同名符号，如果它们在不同的函数作用域中，
    // 那么可能不会构成真正的冲突
    // 但如果它们都是全局/导出符号，则构成真正的冲突
    const globalOccurrences = occurrences.filter(
      (o) =>
        o.scope === 'global' ||
        o.scope === 'module' ||
        o.type.includes('export')
    );
    return globalOccurrences.length > 1;
  }

  /**
   * 根据严重程度判断冲突类型
   *
   * @private
   * @param {string} symbolName - 符号名称
   * @param {Array} occurrences - 出现位置
   * @returns {'warning'|'error'} 严重程度
   */
  determineConflictSeverity(symbolName, occurrences) {
    // 如果都是导出符号，则是错误
    const allExported = occurrences.every((o) =>
      o.type.includes('export')
    );
    if (allExported) {
      return 'error';
    }

    // 如果有超过 2 个冲突，则是错误
    if (occurrences.length > 2) {
      return 'error';
    }

    return 'warning';
  }

  /**
   * 获取对应语言的解析器
   *
   * @private
   * @param {string} language - 语言
   * @returns {Object|null} 解析器
   */
  getParserForLanguage(language) {
    const normalizedLang = this.normalizeLanguage(language);

    switch (normalizedLang) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
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
          console.warn(
            `@babel/parser not available for ${language}, using fallback`
          );
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
   * 判断是否为全局声明
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {boolean} 是否为全局声明
   */
  isGlobalDeclaration(node) {
    return (
      node.type === 'FunctionDeclaration' ||
      node.type === 'ClassDeclaration' ||
      node.type === 'VariableDeclaration' ||
      node.type === 'TSInterfaceDeclaration' ||
      node.type === 'TSTypeAliasDeclaration'
    );
  }

  /**
   * 判断是否为局部声明
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {boolean} 是否为局部声明
   */
  isLocalDeclaration(node) {
    return (
      node.type === 'VariableDeclarator' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    );
  }

  /**
   * 获取节点名称
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {string} 名称
   */
  getNodeName(node) {
    if (node.id && node.id.name) {
      return node.id.name;
    }
    if (node.declarations && node.declarations.length > 0) {
      return node.declarations[0].id.name || 'anonymous';
    }
    return 'anonymous';
  }

  /**
   * 获取节点类型
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {string} 类型
   */
  getNodeType(node) {
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
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
        return 'unknown';
    }
  }

  /**
   * 获取节点位置
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {{start: number, end: number}} 位置
   */
  getNodeLocation(node) {
    return {
      start: node.start || 0,
      end: node.end || 0
    };
  }

  /**
   * 判断节点是否被导出
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} content - 代码内容
   * @returns {boolean} 是否被导出
   */
  isNodeExported(node, content) {
    if (!node.loc) return false;

    const start = node.start || 0;
    const checkRange = 50; // 检查节点前 50 个字符
    const checkStart = Math.max(0, start - checkRange);
    const precedingText = content.slice(checkStart, start);

    return (
      precedingText.includes('export ') ||
      precedingText.includes('export\n')
    );
  }

  /**
   * 获取节点作用域
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} parentScope - 父作用域
   * @returns {string} 作用域
   */
  getNodeScope(node, parentScope) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      return 'module';
    }
    return parentScope || 'block';
  }

  /**
   * 遍历 AST
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {Function} callback - 回调函数
   * @param {string} parentScope - 父作用域
   */
  traverseAST(node, callback, parentScope = 'global') {
    if (!node || typeof node !== 'object') return;

    callback(node, parentScope);

    // 更新作用域
    let currentScope = parentScope;
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      currentScope = 'function';
    } else if (node.type === 'BlockStatement') {
      currentScope = 'block';
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          this.traverseAST(item, callback, currentScope);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.traverseAST(value, callback, currentScope);
      }
    }
  }

  /**
   * 基于正则表达式的基本符号提取（降级策略）
   *
   * @private
   * @param {string} content - 代码内容
   * @param {string} language - 语言
   * @returns {SymbolInfo[]} 符号列表
   */
  extractBasicSymbols(content, language) {
    const symbols = [];
    const lang = this.normalizeLanguage(language);

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(lang)) {
      const jsPatterns = [
        { pattern: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g, type: 'variable' },
        { pattern: /(?:export\s+)?function\s+(\w+)/g, type: 'function' },
        { pattern: /(?:export\s+)?class\s+(\w+)/g, type: 'class' },
        { pattern: /(?:export\s+)enum\s+(\w+)/g, type: 'enum' },
        { pattern: /(?:export\s+)?interface\s+(\w+)/g, type: 'interface' },
        { pattern: /(?:export\s+)?type\s+(\w+)\s*=/g, type: 'type' }
      ];

      for (const { pattern, type } of jsPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          symbols.push({
            type,
            name: match[1],
            scope: pattern.toString().includes('export') ? 'global' : 'module',
            location: { start: match.index, end: match.index + match[0].length },
            isExported: pattern.toString().includes('export')
          });
        }
      }
    } else if (lang === 'python') {
      const pyPatterns = [
        { pattern: /def\s+(\w+)/g, type: 'function' },
        { pattern: /class\s+(\w+)/g, type: 'class' },
        { pattern: /^(\w+)\s*=/gm, type: 'variable' }
      ];

      for (const { pattern, type } of pyPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          symbols.push({
            type,
            name: match[1],
            scope: 'module',
            location: { start: match.index, end: match.index + match[0].length },
            isExported: false
          });
        }
      }
    }

    return symbols;
  }
}

module.exports = { NamingConflictResolver };
