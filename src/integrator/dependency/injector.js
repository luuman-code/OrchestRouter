/**
 * @fileoverview DependencyInjector - 依赖注入器
 *
 * 负责为文件注入必要的导入语句
 * 支持导入语句去重和正确位置插入
 */

/**
 * ResolvedImport - 已解析的导入
 *
 * @typedef {Object} ResolvedImport
 * @property {string} originalSpecifier - 原始导入说明符
 * @property {string} resolvedPath - 解析后的路径
 * @property {string} importedName - 要导入的名称
 * @property {string} localName - 本地使用的名称
 * @property {'default'|'named'|'namespace'|'type'} type - 导入类型
 */

/**
 * CategorizedImports - 分类的导入
 *
 * @typedef {Object} CategorizedImports
 * @property {ResolvedImport[]} defaultImports - 默认导入
 * @property {ResolvedImport[]} namedImports - 命名导入
 * @property {ResolvedImport[]} namespaceImports - 命名空间导入
 * @property {ResolvedImport[]} typeImports - 类型导入
 */

/**
 * DependencyInjector - 依赖注入器
 *
 * 为文件注入必要的导入语句
 */
class DependencyInjector {
  /**
   * 创建依赖注入器
   *
   * @param {Object} graph - 依赖图
   */
  constructor(graph) {
    /** @private @type {Object} */
    this.graph = graph;
  }

  /**
   * 为文件注入必要的导入语句
   *
   * @param {CodeFile} codeFile - 代码文件
   * @param {Map<string, CodeFile>} availableFiles - 可用文件列表
   * @returns {string} 注入导入语句后的内容
   */
  injectImports(codeFile, availableFiles) {
    // 分析当前文件的依赖需求
    const requiredImports = this.determineRequiredImports(codeFile, availableFiles);

    // 获取当前文件现有的导入语句
    const existingImports = this.getExistingImports(codeFile.content, codeFile.language);

    // 合并现有导入和所需导入，去除重复
    const mergedImports = this.mergeAndDeduplicateImports(
      existingImports,
      requiredImports,
      codeFile.path
    );

    // 生成最终的导入语句
    const importStatements = this.generateImportStatements(
      mergedImports,
      codeFile.language,
      codeFile.path
    );

    // 将导入语句插入到合适的位置
    return this.insertImportsAtCorrectPosition(codeFile.content, importStatements, codeFile.language);
  }

  /**
   * 确定文件需要的导入
   *
   * @private
   * @param {CodeFile} codeFile - 代码文件
   * @param {Map<string, CodeFile>} availableFiles - 可用文件列表
   * @returns {ResolvedImport[]} 需要的导入列表
   */
  determineRequiredImports(codeFile, availableFiles) {
    const requiredImports = [];

    // 如果依赖图可用，使用它来确定依赖
    if (this.graph && this.graph.nodes) {
      const fileAnalysis = this.graph.nodes.get(codeFile.path);
      // 优先使用 importDetails 获取完整的导入信息
      if (fileAnalysis && fileAnalysis.importDetails && fileAnalysis.importDetails.length > 0) {
        for (const importDetail of fileAnalysis.importDetails) {
          const importSpec = importDetail.specifier;
          if (!importSpec || typeof importSpec !== 'string') {
            continue;
          }

          // 检查导入是否指向可用的文件
          for (const [filePath, file] of availableFiles.entries()) {
            if (filePath.endsWith(importSpec.replace(/^['"]|['"]$/g, ''))) {
              // 使用 importDetail.imported 获取实际的导入名称
              const importedNames = importDetail.imported || [];
              const importType = importDetail.type || 'named';

              if (importedNames.length > 0) {
                // 命名导入 - 为每个导入的名称创建单独的导入项
                for (const importedName of importedNames) {
                  if (importedName && typeof importedName === 'string') {
                    requiredImports.push({
                      originalSpecifier: importSpec,
                      resolvedPath: filePath,
                      importedName: importedName,
                      localName: importedName,
                      type: importType
                    });
                  }
                }
              } else {
                // 纯副作用导入（没有具体名称）
                requiredImports.push({
                  originalSpecifier: importSpec,
                  resolvedPath: filePath,
                  importedName: '',
                  localName: '',
                  type: 'sideEffect'
                });
              }
            }
          }
        }
      } else if (fileAnalysis && fileAnalysis.imports) {
        // 降级：使用旧的 imports 数组（仅路径）
        for (const importSpec of fileAnalysis.imports) {
          if (!importSpec || typeof importSpec !== 'string') {
            continue;
          }

          for (const [filePath, file] of availableFiles.entries()) {
            if (filePath.endsWith(importSpec.replace(/^['"]|['"]$/g, ''))) {
              requiredImports.push({
                originalSpecifier: importSpec,
                resolvedPath: filePath,
                importedName: '',
                localName: '',
                type: 'named'
              });
            }
          }
        }
      }
    }

    return requiredImports;
  }

  /**
   * 获取现有导入
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string} language - 语言
   * @returns {Array} 现有导入列表
   */
  getExistingImports(content, language) {
    // 这里可以复用 ImportAnalyzer 的逻辑
    // 为简单起见，使用基本的正则表达式提取
    const imports = [];

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language?.toLowerCase())) {
      // import ... from '...'
      const importPattern = /import\s+(?:([\w*{},\s]+)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;

      while ((match = importPattern.exec(content)) !== null) {
        // 确保 specifier 字段始终存在
        if (match[2]) {
          imports.push({
            specifier: match[2],
            imported: match[1] ? match[1].split(',').map((s) => s.trim()) : [],
            type: 'named'
          });
        }
      }
    }

    return imports;
  }

  /**
   * 合并并去重导入
   *
   * @private
   * @param {Array} existing - 现有导入
   * @param {ResolvedImport[]} required - 需要的导入
   * @param {string} currentFile - 当前文件路径
   * @returns {ResolvedImport[]} 合并后的导入
   */
  mergeAndDeduplicateImports(existing, required, currentFile) {
    // 创建现有导入的映射（只包含有效的导入）
    const existingMap = new Map();
    for (const imp of existing) {
      // 验证导入对象是否有 specifier 字段
      if (imp && imp.specifier) {
        existingMap.set(imp.specifier, imp);
      }
    }

    // 过滤掉已存在的导入
    const newImports = required.filter(
      (req) => req && req.originalSpecifier && !existingMap.has(req.originalSpecifier)
    );

    // 合并
    const allImports = [];

    // 添加现有导入（带验证）
    for (const existingImp of existingMap.values()) {
      allImports.push({
        originalSpecifier: existingImp.specifier,
        resolvedPath:
          (existingImp.specifier && this.graph?.pathResolver?.resolve(existingImp.specifier, currentFile)) ||
          existingImp.specifier,
        importedName: '',
        localName: '',
        type: existingImp.type || 'named'
      });
    }

    // 添加新导入
    allImports.push(...newImports);

    return allImports;
  }

  /**
   * 生成导入语句，确保不重复
   *
   * @private
   * @param {ResolvedImport[]} imports - 导入列表
   * @param {string} language - 语言
   * @param {string} currentFile - 当前文件路径
   * @returns {string[]} 导入语句列表
   */
  generateImportStatements(imports, language, currentFile) {
    // 按导入类型分类
    const categorized = this.categorizeImports(imports);

    const statements = [];

    // 生成各类导入语句
    if (categorized.defaultImports.length > 0) {
      for (const imp of categorized.defaultImports) {
        statements.push(`import ${imp.localName || 'Default'} from '${imp.resolvedPath}';`);
      }
    }

    if (categorized.namedImports.length > 0) {
      // 按路径分组，合并相同的路径
      const groupedByName = this.groupByPath(categorized.namedImports);
      for (const [path, importsForPath] of Object.entries(groupedByName)) {
        // 过滤掉空的导入名称
        const validImports = importsForPath.filter((i) => i.importedName && i.importedName.trim() !== '');
        if (validImports.length === 0) {
          continue; // 跳过没有有效导入的路径
        }
        const namedImports = validImports.map((i) => i.importedName).join(', ');
        statements.push(`import { ${namedImports} } from '${path}';`);
      }
    }

    if (categorized.namespaceImports.length > 0) {
      for (const imp of categorized.namespaceImports) {
        statements.push(`import * as ${imp.localName} from '${imp.resolvedPath}';`);
      }
    }

    if (categorized.typeImports.length > 0) {
      const groupedByTypePath = this.groupByPath(categorized.typeImports);
      for (const [path, importsForPath] of Object.entries(groupedByTypePath)) {
        // 过滤掉空的导入名称
        const validTypeImports = importsForPath.filter((i) => i.importedName && i.importedName.trim() !== '');
        if (validTypeImports.length === 0) {
          continue;
        }
        const typeImports = validTypeImports.map((i) => i.importedName).join(', ');
        statements.push(`import type { ${typeImports} } from '${path}';`);
      }
    }

    return statements;
  }

  /**
   * 插入导入语句到正确位置
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string[]} importStatements - 导入语句列表
   * @param {string} language - 语言
   * @returns {string} 插入后的内容
   */
  insertImportsAtCorrectPosition(content, importStatements, language) {
    if (importStatements.length === 0) {
      return content;
    }

    const lang = language?.toLowerCase();

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(lang)) {
      return this.insertJSImportPosition(content, importStatements);
    }

    if (lang === 'python') {
      return this.insertPythonImportPosition(content, importStatements);
    }

    // 默认在文件开头插入
    const importsText = importStatements.join('\n') + '\n\n';
    return importsText + content;
  }

  /**
   * 在 JavaScript 文件中插入导入语句
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string[]} importStatements - 导入语句列表
   * @returns {string} 插入后的内容
   */
  insertJSImportPosition(content, importStatements) {
    const lines = content.split('\n');
    let insertIndex = 0;

    // 跳过注释和空行
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (
        line.startsWith('import ') ||
        line.startsWith('export ') ||
        line.startsWith('//') ||
        line.startsWith('/*') ||
        line.startsWith('*') ||
        line === ''
      ) {
        continue;
      }

      insertIndex = i;
      break;
    }

    const beforeImports = lines.slice(0, insertIndex).join('\n');
    const afterImports = lines.slice(insertIndex).join('\n');

    const importsText = importStatements.join('\n');

    if (beforeImports.trim() === '') {
      return importsText + '\n' + afterImports;
    } else {
      return beforeImports + '\n\n' + importsText + '\n\n' + afterImports;
    }
  }

  /**
   * 在 Python 文件中插入导入语句
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string[]} importStatements - 导入语句列表
   * @returns {string} 插入后的内容
   */
  insertPythonImportPosition(content, importStatements) {
    const lines = content.split('\n');
    let insertIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (
        line.startsWith('#') ||
        line.startsWith('"""') ||
        line.startsWith("'''") ||
        (i === 0 && (line.startsWith('"') || line.startsWith("'"))) ||
        line.startsWith('import ') ||
        line.startsWith('from ')
      ) {
        continue;
      }

      insertIndex = i;
      break;
    }

    const beforeImports = lines.slice(0, insertIndex).join('\n');
    const afterImports = lines.slice(insertIndex).join('\n');

    const importsText = importStatements.join('\n');

    if (beforeImports.trim() === '') {
      return importsText + '\n' + afterImports;
    } else {
      return beforeImports + '\n\n' + importsText + '\n\n' + afterImports;
    }
  }

  /**
   * 按类型分类导入
   *
   * @private
   * @param {ResolvedImport[]} imports - 导入列表
   * @returns {CategorizedImports} 分类结果
   */
  categorizeImports(imports) {
    const result = {
      defaultImports: [],
      namedImports: [],
      namespaceImports: [],
      typeImports: []
    };

    for (const imp of imports) {
      switch (imp.type) {
        case 'default':
          result.defaultImports.push(imp);
          break;
        case 'named':
          result.namedImports.push(imp);
          break;
        case 'namespace':
          result.namespaceImports.push(imp);
          break;
        case 'type':
          result.typeImports.push(imp);
          break;
        case 'sideEffect':
          // 副作用导入不添加到任何分类，让 generateImportStatements 处理
          break;
      }
    }

    return result;
  }

  /**
   * 按路径分组导入
   *
   * @private
   * @param {ResolvedImport[]} imports - 导入列表
   * @returns {Record<string, ResolvedImport[]>} 分组结果
   */
  groupByPath(imports) {
    const grouped = {};
    for (const imp of imports) {
      if (!grouped[imp.resolvedPath]) {
        grouped[imp.resolvedPath] = [];
      }
      grouped[imp.resolvedPath].push(imp);
    }
    return grouped;
  }
}

module.exports = { DependencyInjector };
