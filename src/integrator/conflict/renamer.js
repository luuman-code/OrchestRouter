/**
 * @fileoverview AutoRenamer - 自动重命名器
 *
 * 负责在代码中重命名符号以解决命名冲突
 * 使用 AST 进行精确符号替换，更新全局引用
 */

const { ImportAnalyzer } = require('../dependency/analyzer');

/**
 * RenameResult - 重命名结果
 *
 * @typedef {Object} RenameResult
 * @property {CodeFile} originalFile - 更新后的原始文件
 * @property {Map<string, CodeFile>} referencedFiles - 更新后的引用文件
 * @property {Object} changes - 变更摘要
 * @property {{from: string, to: string}} changes.renamedSymbol - 重命名的符号
 * @property {string[]} changes.affectedFiles - 受影响的文件路径列表
 */

/**
 * GlobalSymbolReferenceMap - 全局符号引用映射
 *
 * @typedef {Object} GlobalSymbolReferenceMap
 * @property {Map<string, string>} symbolToFile - 符号到定义文件的映射
 * @property {Map<string, string[]>} fileToReferences - 文件到其引用符号的映射
 * @property {Map<string, string[]>} referenceToFile - 引用符号到被引用文件的映射
 */

/**
 * AutoRenamer - 自动重命名器
 *
 * 在内容中重命名符号，并更新所有相关引用
 */
class AutoRenamer {
  /**
   * 创建自动重命名器
   *
   * @param {GlobalSymbolReferenceMap} [globalSymbolMap] - 全局符号引用映射
   * @param {Object} [pathResolver] - 路径解析器
   */
  constructor(globalSymbolMap, pathResolver) {
    /** @type {GlobalSymbolReferenceMap} */
    this.globalSymbolMap = globalSymbolMap || {
      symbolToFile: new Map(),
      fileToReferences: new Map(),
      referenceToFile: new Map()
    };
    /** @type {Object|null} */
    this.pathResolver = pathResolver || null;
    /** @type {Set<string>} */
    this.usedNames = new Set();
  }

  /**
   * 生成唯一名称，考虑上下文
   *
   * @param {string} baseName - 基础名称
   * @param {string} [context] - 上下文
   * @returns {string} 唯一名称
   */
  generateUniqueName(baseName, context) {
    let candidate = baseName;
    let counter = 1;

    // 考虑上下文生成更有意义的名称
    if (context) {
      const contextualName = `${baseName}_${context.toLowerCase().replace(/\s+/g, '_')}`;
      candidate = contextualName;
    }

    // 确保名称唯一
    while (this.usedNames.has(candidate)) {
      candidate = `${baseName}_${counter}`;
      counter++;
    }

    this.usedNames.add(candidate);
    return candidate;
  }

  /**
   * 在内容中重命名符号，并更新所有相关引用
   *
   * @param {string} content - 内容
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {string} language - 语言
   * @param {string} filePath - 文件路径
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Promise<RenameResult>} 重命名结果
   */
  async renameInContent(content, oldName, newName, language, filePath, allFiles) {
    // 1. 首先检查新名称是否存在冲突
    const checkedNewName = await this.checkAndGenerateUniqueName(
      newName,
      content,
      allFiles,
      filePath
    );

    // 2. 更新当前文件中的符号
    const updatedContent = this.renameInSingleFile(
      content,
      oldName,
      checkedNewName,
      language
    );

    // 3. 找到所有引用此符号的文件并更新
    const filesToUpdate = this.findReferencingFiles(oldName, filePath, allFiles);

    // 4. 特别处理命名空间导入的引用情况
    const namespaceUpdates = this.handleNamespaceReferences(
      oldName,
      checkedNewName,
      filePath,
      allFiles
    );

    // 5. 更新所有引用文件中的符号引用
    const updatedFiles = new Map();

    for (const [refPath, refFile] of filesToUpdate.entries()) {
      const updatedRefContent = this.updateReferencesInFile(
        refFile.content,
        oldName,
        checkedNewName,
        language,
        filePath
      );

      updatedFiles.set(refPath, {
        ...refFile,
        content: updatedRefContent
      });
    }

    // 6. 更新命名空间引用
    for (const [refPath, refFile] of namespaceUpdates.entries()) {
      if (!updatedFiles.has(refPath)) {
        updatedFiles.set(refPath, refFile);
      }
    }

    // 7. 重命名后重新运行冲突检测
    await this.postRenameConflictCheck(
      filePath,
      checkedNewName,
      updatedContent,
      allFiles,
      updatedFiles
    );

    return {
      originalFile: {
        ...allFiles.get(filePath),
        content: updatedContent
      },
      referencedFiles: updatedFiles,
      changes: {
        renamedSymbol: { from: oldName, to: checkedNewName },
        affectedFiles: [filePath, ...Array.from(updatedFiles.keys())]
      }
    };
  }

  /**
   * 在单个文件中重命名符号（使用 AST 确保准确性）
   *
   * @private
   * @param {string} content - 内容
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {string} language - 语言
   * @returns {string} 更新后的内容
   */
  renameInSingleFile(content, oldName, newName, language) {
    const parser = this.getParserForLanguage(language);

    if (parser) {
      try {
        const ast = parser.parse(content);
        let updatedContent = content;

        // 收集需要替换的位置（从后往前排序，避免索引偏移）
        const replacements = [];

        this.traverseAST(ast, (node) => {
          if (
            node.type === 'Identifier' &&
            node.name === oldName &&
            this.shouldRenameIdentifier(node, oldName)
          ) {
            replacements.push({
              start: node.start,
              end: node.end,
              name: newName
            });
          }
        });

        // 从后往前替换，避免索引偏移
        replacements.sort((a, b) => b.start - a.start);
        for (const replacement of replacements) {
          updatedContent =
            updatedContent.substring(0, replacement.start) +
            replacement.name +
            updatedContent.substring(replacement.end);
        }

        return updatedContent;
      } catch (error) {
        console.warn(`AST renaming failed, using regex fallback: ${error.message}`);
      }
    }

    // 降级到正则表达式替换
    return this.renameWithRegex(content, oldName, newName);
  }

  /**
   * 使用正则表达式重命名（降级策略）
   *
   * @private
   * @param {string} content - 内容
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @returns {string} 更新后的内容
   */
  renameWithRegex(content, oldName, newName) {
    // 使用单词边界确保只替换完整的标识符
    const pattern = new RegExp(`\\b${oldName}\\b`, 'g');
    return content.replace(pattern, newName);
  }

  /**
   * 查找引用指定符号的所有文件
   *
   * @private
   * @param {string} symbolName - 符号名称
   * @param {string} originalFilePath - 原始文件路径
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Map<string, CodeFile>} 引用文件列表
   */
  findReferencingFiles(symbolName, originalFilePath, allFiles) {
    const referencingFiles = new Map();

    for (const [filePath, file] of allFiles.entries()) {
      // 跳过原始文件
      if (filePath === originalFilePath) continue;

      // 检查文件是否引用了该符号
      if (this.fileReferencesSymbol(file, symbolName, originalFilePath)) {
        referencingFiles.set(filePath, file);
      }
    }

    return referencingFiles;
  }

  /**
   * 判断文件是否引用了指定符号
   *
   * @private
   * @param {CodeFile} file - 文件
   * @param {string} symbolName - 符号名称
   * @param {string} originalFilePath - 原始文件路径
   * @returns {boolean} 是否引用
   */
  fileReferencesSymbol(file, symbolName, originalFilePath) {
    const importAnalyzer = new ImportAnalyzer();
    const analysis = importAnalyzer.analyzeFile(file);

    // 如果导入了原始文件且使用了其中的符号，则认为有引用
    return (
      analysis.imports.some((importPath) =>
        this.resolvesToFilePath(importPath, originalFilePath, file.path)
      ) && this.containsSymbolUsage(file.content, symbolName)
    );
  }

  /**
   * 判断导入路径是否解析到特定文件
   *
   * @private
   * @param {string} importPath - 导入路径
   * @param {string} originalFilePath - 原始文件路径
   * @param {string} currentFilePath - 当前文件路径
   * @returns {boolean} 是否解析到目标文件
   */
  resolvesToFilePath(importPath, originalFilePath, currentFilePath) {
    if (this.pathResolver) {
      const resolvedPath = this.pathResolver.resolve(importPath, currentFilePath);
      return resolvedPath === originalFilePath;
    }

    // 简化检查
    return importPath.includes(originalFilePath.replace(/\.[^.]+$/, ''));
  }

  /**
   * 检查内容是否包含符号使用
   *
   * @private
   * @param {string} content - 内容
   * @param {string} symbolName - 符号名称
   * @returns {boolean} 是否包含
   */
  containsSymbolUsage(content, symbolName) {
    const pattern = new RegExp(`\\b${symbolName}\\b`, 'g');
    return pattern.test(content);
  }

  /**
   * 更新引用文件中的符号引用
   *
   * @private
   * @param {string} content - 内容
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {string} language - 语言
   * @param {string} originalFilePath - 原始文件路径
   * @returns {string} 更新后的内容
   */
  updateReferencesInFile(content, oldName, newName, language, originalFilePath) {
    const parser = this.getParserForLanguage(language);

    if (parser) {
      try {
        const ast = parser.parse(content);
        let updatedContent = content;
        const replacements = [];

        this.traverseAST(ast, (node) => {
          if (
            node.type === 'Identifier' &&
            node.name === oldName &&
            this.isReferenceToOriginalSymbol(node, oldName, originalFilePath, content)
          ) {
            replacements.push({
              start: node.start,
              end: node.end,
              name: newName
            });
          }
        });

        replacements.sort((a, b) => b.start - a.start);
        for (const replacement of replacements) {
          updatedContent =
            updatedContent.substring(0, replacement.start) +
            replacement.name +
            updatedContent.substring(replacement.end);
        }

        return updatedContent;
      } catch (error) {
        console.warn(`AST reference update failed, using regex fallback: ${error.message}`);
      }
    }

    return this.renameWithRegex(content, oldName, newName);
  }

  /**
   * 判断标识符是否应该被重命名
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} symbolName - 符号名称
   * @returns {boolean} 是否应该重命名
   */
  shouldRenameIdentifier(node, symbolName) {
    const parentNode = node.parent;

    // 检查父节点类型以判断当前节点的角色
    if (parentNode) {
      // 变量声明
      if (parentNode.type === 'VariableDeclarator' && parentNode.id === node) {
        return true;
      }
      // 函数声明
      if (parentNode.type === 'FunctionDeclaration' && parentNode.id === node) {
        return true;
      }
      // 类声明
      if (parentNode.type === 'ClassDeclaration' && parentNode.id === node) {
        return true;
      }
      // 参数
      if (
        parentNode.type === 'Identifier' &&
        parentNode.params &&
        parentNode.params.includes(node)
      ) {
        return true;
      }
      // 对象属性的键
      if (parentNode.type === 'Property' && parentNode.key === node) {
        return true;
      }
      // 导入声明
      if (
        [
          'ImportSpecifier',
          'ImportDefaultSpecifier',
          'ImportNamespaceSpecifier'
        ].includes(parentNode.type)
      ) {
        return true;
      }
      // 导出声明
      if (
        parentNode.type === 'ExportSpecifier' ||
        (parentNode.type === 'ExportNamedDeclaration' &&
          parentNode.declaration &&
          (parentNode.declaration.id === node ||
            (parentNode.declaration.declarations &&
              parentNode.declaration.declarations.some((d) => d.id === node))))
      ) {
        return true;
      }
    }

    // 一般情况下，所有引用节点都需要重命名以保持一致性
    return true;
  }

  /**
   * 判断节点是否是对原始符号的引用
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} symbolName - 符号名称
   * @param {string} originalFilePath - 原始文件路径
   * @param {string} fileContent - 文件内容
   * @returns {boolean} 是否是对原始符号的引用
   */
  isReferenceToOriginalSymbol(node, symbolName, originalFilePath, fileContent) {
    let currentNode = node;
    while (currentNode.parent) {
      const parent = currentNode.parent;

      // 检查是否在导入语句中
      if (
        [
          'ImportSpecifier',
          'ImportDefaultSpecifier',
          'ImportNamespaceSpecifier'
        ].includes(parent.type)
      ) {
        if (
          parent.parent &&
          parent.parent.source &&
          this.resolvesToFile(parent.parent.source.value, originalFilePath)
        ) {
          return true;
        }
      }

      // 检查是否是命名空间访问
      if (
        parent.type === 'MemberExpression' &&
        parent.property === currentNode
      ) {
        if (parent.object && parent.object.type === 'Identifier') {
          const namespaceIdentifier = parent.object.name;
          if (
            this.hasNamespaceImportFromPath(
              namespaceIdentifier,
              originalFilePath,
              fileContent
            )
          ) {
            return true;
          }
        }
      }

      // 如果是声明而非引用
      if (
        (parent.type === 'FunctionDeclaration' && parent.id === currentNode) ||
        (parent.type === 'VariableDeclarator' && parent.id === currentNode)
      ) {
        return false;
      }

      currentNode = parent;
    }

    return true;
  }

  /**
   * 检查是否从特定路径有命名空间导入
   *
   * @private
   * @param {string} namespaceAlias - 命名空间别名
   * @param {string} originalFilePath - 原始文件路径
   * @param {string} fileContent - 文件内容
   * @returns {boolean} 是否有命名空间导入
   */
  hasNamespaceImportFromPath(namespaceAlias, originalFilePath, fileContent) {
    const fileName = this.extractFileName(originalFilePath);
    const namespaceImportRegex = new RegExp(
      `import\\s*\\*\\s*as\\s+${namespaceAlias}\\s+from\\s+['"][^'"]*${fileName}['"]`,
      'g'
    );
    return namespaceImportRegex.test(fileContent);
  }

  /**
   * 从文件路径提取文件名
   *
   * @private
   * @param {string} filePath - 文件路径
   * @returns {string} 文件名
   */
  extractFileName(filePath) {
    return filePath.split(/[\\/]/).pop()?.split('.')[0] || '';
  }

  /**
   * 判断导入路径是否解析到特定文件
   *
   * @private
   * @param {string} importPath - 导入路径
   * @param {string} originalFilePath - 原始文件路径
   * @returns {boolean} 是否解析到
   */
  resolvesToFile(importPath, originalFilePath) {
    if (this.pathResolver) {
      const resolvedPath = this.pathResolver.resolve(importPath, originalFilePath);
      return resolvedPath === originalFilePath;
    }
    return importPath.includes(originalFilePath.replace(/\.[^.]+$/, ''));
  }

  /**
   * 检查新名称是否已存在，如果存在则生成唯一名称
   *
   * @private
   * @param {string} proposedName - 建议的名称
   * @param {string} currentContent - 当前内容
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {string} currentFilePath - 当前文件路径
   * @returns {Promise<string>} 唯一名称
   */
  async checkAndGenerateUniqueName(
    proposedName,
    currentContent,
    allFiles,
    currentFilePath
  ) {
    let candidate = proposedName;
    let counter = 1;

    // 检查当前文件中是否已有相同名称
    if (this.symbolExistsInContent(currentContent, candidate)) {
      let tempCandidate = `${candidate}_${counter}`;
      while (this.symbolExistsInContent(currentContent, tempCandidate)) {
        counter++;
        tempCandidate = `${candidate}_${counter}`;
      }
      candidate = tempCandidate;
    }

    // 检查其他文件中是否已存在相同名称
    for (const [filePath, file] of allFiles.entries()) {
      if (filePath === currentFilePath) continue;

      if (this.symbolExistsInContent(file.content, candidate)) {
        counter++;
        let tempCandidate = `${proposedName}_${counter}`;
        while (this.existsInAnyFile(tempCandidate, allFiles, currentFilePath)) {
          counter++;
          tempCandidate = `${proposedName}_${counter}`;
        }
        candidate = tempCandidate;
      }
    }

    return candidate;
  }

  /**
   * 检查符号是否存在于内容中
   *
   * @private
   * @param {string} content - 内容
   * @param {string} symbolName - 符号名称
   * @returns {boolean} 是否存在
   */
  symbolExistsInContent(content, symbolName) {
    const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
    return regex.test(content);
  }

  /**
   * 检查符号是否存在于任何文件中
   *
   * @private
   * @param {string} symbolName - 符号名称
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {string} excludeFilePath - 排除的文件路径
   * @returns {boolean} 是否存在
   */
  existsInAnyFile(symbolName, allFiles, excludeFilePath) {
    for (const [filePath, file] of allFiles.entries()) {
      if (filePath === excludeFilePath) continue;
      if (this.symbolExistsInContent(file.content, symbolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 处理命名空间引用
   *
   * @private
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {string} originalFilePath - 原始文件路径
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Map<string, CodeFile>} 更新后的文件
   */
  handleNamespaceReferences(oldName, newName, originalFilePath, allFiles) {
    const updatedFiles = new Map();

    for (const [filePath, file] of allFiles.entries()) {
      if (filePath === originalFilePath) continue;

      const namespaceImports = this.findNamespaceImports(
        file.content,
        originalFilePath,
        filePath
      );

      if (namespaceImports.length > 0) {
        let updatedContent = file.content;

        for (const nsImport of namespaceImports) {
          const oldPattern = new RegExp(`${nsImport}\\.${oldName}\\b`, 'g');
          updatedContent = updatedContent.replace(
            oldPattern,
            `${nsImport}.${newName}`
          );
        }

        if (updatedContent !== file.content) {
          updatedFiles.set(filePath, {
            ...file,
            content: updatedContent
          });
        }
      }
    }

    return updatedFiles;
  }

  /**
   * 查找命名空间导入
   *
   * @private
   * @param {string} content - 内容
   * @param {string} importedFromPath - 被导入的文件路径
   * @param {string} importingFilePath - 导入文件路径
   * @returns {string[]} 命名空间别名列表
   */
  findNamespaceImports(content, importedFromPath, importingFilePath) {
    const namespaceImports = [];
    const namespaceImportRegex =
      /import\s*\*\s*as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = namespaceImportRegex.exec(content)) !== null) {
      const namespaceAlias = match[1];
      const importPath = match[2];

      // 简化处理：假设路径匹配即为相关导入
      if (importPath.includes(importedFromPath.replace(/\.[^.]+$/, ''))) {
        namespaceImports.push(namespaceAlias);
      }
    }

    return namespaceImports;
  }

  /**
   * 重命名后的冲突检查
   *
   * @private
   * @param {string} filePath - 文件路径
   * @param {string} newName - 新名称
   * @param {string} updatedContent - 更新后的内容
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {Map<string, CodeFile>} updatedFiles - 更新后的文件
   * @returns {Promise<void>}
   */
  async postRenameConflictCheck(
    filePath,
    newName,
    updatedContent,
    allFiles,
    updatedFiles
  ) {
    // 合并更新后的文件
    const combinedFiles = new Map(allFiles);
    for (const [path, file] of updatedFiles.entries()) {
      combinedFiles.set(path, file);
    }

    // 检查重命名后是否引入了新冲突
    const conflictDetector = new NamingConflictResolver();
    const newConflicts = await conflictDetector.detectNamingConflicts(combinedFiles);

    if (newConflicts.length > 0) {
      console.warn(
        `Potential new conflicts introduced by renaming in file ${filePath}:`,
        newConflicts
      );
    }
  }

  /**
   * 遍历 AST
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {Function} callback - 回调函数
   * @param {Object|null} parent - 父节点
   */
  traverseAST(node, callback, parent = null) {
    if (!node || typeof node !== 'object') return;

    node.parent = parent;
    callback(node);

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          this.traverseAST(item, callback, node);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.traverseAST(value, callback, node);
      }
    }
  }

  /**
   * 获取对应语言的解析器
   *
   * @private
   * @param {string} language - 语言
   * @returns {Object|null} 解析器
   */
  getParserForLanguage(language) {
    if (!language) return null;

    const normalizedLang = language.toLowerCase().trim();

    if (
      ['javascript', 'typescript', 'jsx', 'tsx'].includes(normalizedLang)
    ) {
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
                'classProperties'
              ]
            })
        };
      } catch (e) {
        return null;
      }
    }

    return null;
  }
}

module.exports = { AutoRenamer };
