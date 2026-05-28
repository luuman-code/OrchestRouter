/**
 * @fileoverview LLMConflictResolver - LLM 辅助冲突解决器
 *
 * 使用 LLM 解决复杂的命名冲突
 * 构建包含全局上下文的 prompt，解析 LLM 返回的解决方案
 */

/**
 * ResolutionResult - 解决结果
 *
 * @typedef {Object} ResolutionResult
 * @property {boolean} success - 是否成功
 * @property {Map<string, CodeFile>|string} [resolvedContent] - 解决后的内容
 * @property {string} [explanation] - 解释说明
 * @property {string} [error] - 错误信息
 * @property {Object} [appliedSolution] - 应用的解决方案详情
 */

/**
 * SymbolReferenceContext - 符号引用上下文
 *
 * @typedef {Object} SymbolReferenceContext
 * @property {string} conflictSymbol - 冲突的符号名称
 * @property {string[]} conflictedFiles - 有冲突的文件
 * @property {Record<string, SymbolReferenceInfo>} referenceMap - 引用信息映射
 * @property {Object} impactAnalysis - 影响分析
 */

/**
 * SymbolReferenceInfo - 符号引用信息
 *
 * @typedef {Object} SymbolReferenceInfo
 * @property {string[]} importedFrom - 从哪些文件导入了符号
 * @property {string[]} exportedTo - 导出符号到哪些文件
 * @property {string[]} internalUsage - 内部使用了哪些符号
 * @property {string[]} externalReferences - 引用了哪些外部符号
 */

/**
 * ImpactAnalysis - 影响分析
 *
 * @typedef {Object} ImpactAnalysis
 * @property {number} affectedFilesCount - 受影响文件数量
 * @property {'low'|'medium'|'high'} cascadingRisk - 连锁反应风险
 * @property {string} suggestion - 建议
 */

/**
 * LLMConflictResolver - LLM 辅助冲突解决器
 *
 * 使用 LLM 解决复杂的命名冲突
 */
class LLMConflictResolver {
  /**
   * 创建 LLM 冲突解决器
   *
   * @param {Object} llmClient - LLM 客户端
   * @param {Object} [symbolReferenceAnalyzer] - 符号引用分析器
   */
  constructor(llmClient, symbolReferenceAnalyzer) {
    /** @type {Object} */
    this.llmClient = llmClient;
    /** @type {Object} */
    this.symbolReferenceAnalyzer = symbolReferenceAnalyzer;
  }

  /**
   * 使用包含全局上下文的 LLM 解决复杂冲突
   *
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Promise<ResolutionResult>} 解决结果
   */
  async resolveConflict(conflict, allFiles) {
    // 1. 首先尝试基于规则的解决方法（更经济高效）
    const ruleBasedResult = await this.tryRuleBasedResolution(conflict, allFiles);
    if (ruleBasedResult.success) {
      return ruleBasedResult;
    }

    // 2. 规则无法解决时，才使用 LLM
    // 分析冲突涉及的符号引用网络
    const referenceContext = await this.analyzeSymbolReferences(
      conflict,
      allFiles
    );

    // 3. 构建包含丰富上下文的 prompt（控制大小）
    const prompt = this.buildResolvePromptWithContext(
      conflict,
      allFiles,
      referenceContext
    );

    // 4. 请求 LLM 解决冲突
    const response = await this.llmClient.generate(prompt);

    // 5. 解析并应用 LLM 的解决方案
    return this.parseAndApplySolution(response, conflict, allFiles, referenceContext);
  }

  /**
   * 尝试基于规则的冲突解决（更经济高效）
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Promise<ResolutionResult>} 解决结果
   */
  async tryRuleBasedResolution(conflict, allFiles) {
    // 检查冲突类型，对某些简单的冲突类型尝试自动解决
    if (
      conflict.severity === 'low' ||
      conflict.type === 'duplicate_declaration'
    ) {
      // 尝试自动重命名解决冲突
      const autoRenameResult = await this.attemptAutoRename(conflict, allFiles);
      if (autoRenameResult.success) {
        return autoRenameResult;
      }
    }

    // 对于其他类型的冲突，暂时返回失败，让 LLM 处理
    return {
      success: false,
      explanation: '基于规则的解决方法无法处理此冲突类型，需要 LLM 介入'
    };
  }

  /**
   * 尝试自动重命名解决冲突
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Promise<ResolutionResult>} 解决结果
   */
  async attemptAutoRename(conflict, allFiles) {
    try {
      // 遍历冲突的所有出现位置，为其中一个生成唯一名称
      for (const occurrence of conflict.occurrences) {
        const filePath = occurrence.file;
        const file = allFiles.get(filePath);

        if (file) {
          // 生成新的唯一名称
          const newName = this.generateContextualName(
            conflict.symbolName,
            filePath,
            allFiles
          );

          // 检查新名称是否在目标文件中已存在
          if (!this.symbolExistsInFile(file.content, newName)) {
            // 执行重命名操作
            const updatedFile = this.performRenameInFile(
              file,
              conflict.symbolName,
              newName,
              allFiles
            );

            // 更新所有引用此符号的文件
            const updatedFiles = new Map(allFiles);
            updatedFiles.set(filePath, updatedFile);

            // 找到所有引用此符号的文件并更新
            const referencingFiles = this.findReferencingFiles(
              conflict.symbolName,
              filePath,
              allFiles
            );
            for (const [refPath, refFile] of referencingFiles.entries()) {
              const updatedRefFile = this.performRenameInFile(
                refFile,
                conflict.symbolName,
                newName,
                allFiles
              );
              updatedFiles.set(refPath, updatedRefFile);
            }

            return {
              success: true,
              resolvedContent: updatedFiles,
              explanation: `通过自动重命名解决了冲突，将 "${conflict.symbolName}" 重命名为 "${newName}"`
            };
          }
        }
      }

      return {
        success: false,
        explanation: '无法找到合适的自动重命名方案'
      };
    } catch (error) {
      return {
        success: false,
        explanation: `自动重命名过程中出现错误：${error.message}`
      };
    }
  }

  /**
   * 根据上下文生成合适的名称
   *
   * @private
   * @param {string} baseName - 基础名称
   * @param {string} filePath - 文件路径
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {string} 生成的名称
   */
  generateContextualName(baseName, filePath, allFiles) {
    // 从文件路径中提取上下文信息来生成更合适的名称
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const fileName = pathParts[pathParts.length - 1].split('.')[0];

    // 创建带上下文的名称
    let contextualName = `${baseName}_${fileName}`;

    // 检查名称是否唯一，如果不唯一则添加数字后缀
    let counter = 1;
    let candidate = contextualName;
    while (this.existsInAnyFile(candidate, allFiles, filePath)) {
      counter++;
      candidate = `${contextualName}_${counter}`;
    }

    return candidate;
  }

  /**
   * 构建包含全局上下文的解决 prompt，控制其大小
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {SymbolReferenceContext} referenceContext - 引用上下文
   * @returns {string} Prompt
   */
  buildResolvePromptWithContext(conflict, allFiles, referenceContext) {
    // 控制上下文大小的参数
    const MAX_CONTEXT_SIZE = 20000;
    const MAX_FILE_SNIPPET_LENGTH = 500;

    // 构建精简的上下文信息
    const conflictingFilesInfo = this.extractConflictingFileInfo(
      conflict,
      allFiles,
      MAX_FILE_SNIPPET_LENGTH
    );
    const referencingFilesInfo = this.extractReferencingFilesInfo(
      referenceContext,
      allFiles,
      MAX_FILE_SNIPPET_LENGTH
    );
    const usagePatterns = this.analyzeUsagePatterns(referenceContext, allFiles);

    // 创建初始 prompt
    const basePrompt = `
你是一个专业的代码冲突解决助手。请解决以下命名冲突：

## 冲突详情
- 冲突符号：${conflict.symbolName}
- 冲突严重程度：${conflict.severity}
- 冲突发生位置：${conflict.occurrences.map((o) => o.file).join(', ')}

## 冲突文件详情
${conflictingFilesInfo}

## 相关引用文件
${referencingFilesInfo}

## 符号使用模式
${usagePatterns}

## 任务
请提供一个解决方案来解决上述命名冲突。解决方案应该包括:
1. 为冲突符号建议新的名称（如果需要重命名）
2. 说明为什么这个解决方案是合适的
3. 指明需要更新哪些文件中的引用
4. 如果有多种解决方式，请优先考虑对代码库影响最小的方式

## 约束条件
- 保持代码功能不变
- 遵循语言的命名约定
- 尽量减少对现有代码的影响
- 确保重命名后的符号在所有引用处都得到更新

请以 JSON 格式返回你的解决方案：
{
  "recommendedAction": "rename|keep|other",
  "newName": "string (if renaming)",
  "affectedFiles": "string[]",
  "explanation": "string",
  "implementationSteps": "string[]"
}
    `;

    // 检查 prompt 大小，如果过大则采取保守策略
    if (basePrompt.length > MAX_CONTEXT_SIZE) {
      // 返回精简版 prompt
      return `
你是一个专业的代码冲突解决助手。当前遇到命名冲突，但由于上下文过大，只提供核心信息：

## 冲突详情
- 冲突符号：${conflict.symbolName}
- 冲突严重程度：${conflict.severity}
- 冲突发生位置：${conflict.occurrences.map((o) => o.file).join(', ')}

## 冲突概要
由于上下文过大，这里仅提供核心冲突信息。建议优先使用自动重命名策略解决此冲突。

## 任务
推荐使用重命名策略解决此冲突，生成一个新的、唯一的符号名称以避免冲突。
1. 为冲突符号建议一个新的、有意义的名称
2. 说明为什么这个解决方案是合适的
3. 指明需要更新哪些文件中的引用

## 约束条件
- 保持代码功能不变
- 遵循语言的命名约定
- 尽量减少对现有代码的影响

请以 JSON 格式返回你的解决方案：
{
  "recommendedAction": "rename",
  "newName": "string (new unique name)",
  "affectedFiles": "string[] (list files containing the symbol)",
  "explanation": "string",
  "implementationSteps": "string[]"
}
      `;
    }

    return basePrompt;
  }

  /**
   * 分析符号引用网络
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {Promise<SymbolReferenceContext>} 引用上下文
   */
  async analyzeSymbolReferences(conflict, allFiles) {
    const referenceMap = {};

    for (const occurrence of conflict.occurrences) {
      const filePath = occurrence.file;
      const file = allFiles.get(filePath);

      if (file) {
        // 分析该文件中的符号以及对外部符号的引用
        const refs = await this.symbolReferenceAnalyzer.analyzeFileReferences(
          file,
          allFiles
        );
        referenceMap[filePath] = refs;
      }
    }

    return {
      conflictSymbol: conflict.symbolName,
      conflictedFiles: conflict.occurrences.map((o) => o.file),
      referenceMap,
      impactAnalysis: this.analyzeImpact(conflict, referenceMap)
    };
  }

  /**
   * 解析并应用 LLM 的解决方案
   *
   * @private
   * @param {string} response - LLM 响应
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {SymbolReferenceContext} referenceContext - 引用上下文
   * @returns {ResolutionResult} 解决结果
   */
  parseAndApplySolution(response, conflict, allFiles, referenceContext) {
    try {
      // 尝试解析 LLM 返回的 JSON
      const solution = JSON.parse(response);

      // 根据解决方案更新文件
      const updatedFiles = new Map(allFiles);
      let explanation = solution.explanation || '';

      if (solution.recommendedAction === 'rename' && solution.newName) {
        // 执行重命名操作
        for (const fileToUpdate of solution.affectedFiles) {
          const file = updatedFiles.get(fileToUpdate);
          if (file) {
            const renamedFile = this.performRenameInFile(
              file,
              conflict.symbolName,
              solution.newName,
              allFiles
            );
            updatedFiles.set(fileToUpdate, renamedFile);
          }
        }
        explanation += `\n已将符号 "${conflict.symbolName}" 重命名为 "${solution.newName}" 并更新了所有引用。`;
      }

      return {
        success: true,
        resolvedContent: updatedFiles,
        explanation,
        appliedSolution: solution
      };
    } catch (error) {
      // 如果解析失败，返回错误信息
      return {
        success: false,
        explanation: `LLM 返回的解决方案格式不正确：${response}`,
        error: error.message
      };
    }
  }

  /**
   * 执行单个文件的重命名
   *
   * @private
   * @param {CodeFile} file - 文件
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {CodeFile} 更新后的文件
   */
  performRenameInFile(file, oldName, newName, allFiles) {
    // 使用 AST 进行精确替换，确保不误替非符号的文本
    const updatedContent = this.renameInFileUsingAST(
      file.content,
      oldName,
      newName,
      file.language
    );
    return { ...file, content: updatedContent };
  }

  /**
   * 使用 AST 在文件中重命名（更安全）
   *
   * @private
   * @param {string} content - 内容
   * @param {string} oldName - 旧名称
   * @param {string} newName - 新名称
   * @param {string} language - 语言
   * @returns {string} 更新后的内容
   */
  renameInFileUsingAST(content, oldName, newName, language) {
    const parser = this.getParserForLanguage(language);

    if (parser) {
      const ast = parser.parse(content);
      let updatedContent = content;
      const replacements = [];

      this.traverseAST(ast, (node) => {
        if (
          node.type === 'Identifier' &&
          node.name === oldName &&
          this.isSymbolIdentifier(node)
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
    }

    // 降级到正则表达式替换
    const pattern = new RegExp(`\\b${oldName}\\b`, 'g');
    return content.replace(pattern, newName);
  }

  /**
   * 检查标识符是否为符号标识符
   *
   * @private
   * @param {Object} node - AST 节点
   * @returns {boolean} 是否为符号标识符
   */
  isSymbolIdentifier(node) {
    // 检查节点是否在声明或引用位置
    const parent = node.parent;
    if (!parent) return true;

    // 排除字符串字面量中的标识符
    if (
      parent.type === 'StringLiteral' ||
      parent.type === 'TemplateElement'
    ) {
      return false;
    }

    // 排除注释中的标识符
    if (
      parent.type === 'CommentLine' ||
      parent.type === 'CommentBlock'
    ) {
      return false;
    }

    return true;
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
   * 检查符号是否存在于文件中
   *
   * @private
   * @param {string} content - 内容
   * @param {string} symbolName - 符号名称
   * @returns {boolean} 是否存在
   */
  symbolExistsInFile(content, symbolName) {
    return this.symbolExistsInContent(content, symbolName);
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
      if (filePath === originalFilePath) continue;

      if (this.symbolExistsInContent(file.content, symbolName)) {
        referencingFiles.set(filePath, file);
      }
    }

    return referencingFiles;
  }

  /**
   * 提取冲突文件信息
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {number} maxLength - 最大长度
   * @returns {string} 文件信息
   */
  extractConflictingFileInfo(conflict, allFiles, maxLength) {
    const lines = [];

    for (const occurrence of conflict.occurrences) {
      const file = allFiles.get(occurrence.file);
      if (file) {
        const snippet = file.content.substring(0, maxLength);
        lines.push(`### ${occurrence.file}\n\`\`\`\n${snippet}\n...\n\`\`\``);
      }
    }

    return lines.join('\n\n');
  }

  /**
   * 提取引用文件信息
   *
   * @private
   * @param {SymbolReferenceContext} referenceContext - 引用上下文
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @param {number} maxLength - 最大长度
   * @returns {string} 引用文件信息
   */
  extractReferencingFilesInfo(referenceContext, allFiles, maxLength) {
    const lines = [];

    for (const [filePath, info] of Object.entries(referenceContext.referenceMap)) {
      lines.push(`### ${filePath}`);
      lines.push(`引用：${info.importedFrom?.join(', ') || '无'}`);
      lines.push(`被引用：${info.exportedTo?.join(', ') || '无'}`);

      const file = allFiles.get(filePath);
      if (file) {
        const snippet = file.content.substring(0, maxLength);
        lines.push(`\`\`\`\n${snippet}\n...\n\`\`\``);
      }
    }

    return lines.join('\n\n');
  }

  /**
   * 分析使用模式
   *
   * @private
   * @param {SymbolReferenceContext} referenceContext - 引用上下文
   * @param {Map<string, CodeFile>} allFiles - 所有文件
   * @returns {string} 使用模式描述
   */
  analyzeUsagePatterns(referenceContext, allFiles) {
    const patterns = [];

    for (const [filePath, info] of Object.entries(referenceContext.referenceMap)) {
      if (info.internalUsage && info.internalUsage.length > 0) {
        patterns.push(
          `- ${filePath} 内部使用：${info.internalUsage.join(', ')}`
        );
      }
      if (info.externalReferences && info.externalReferences.length > 0) {
        patterns.push(
          `- ${filePath} 外部引用：${info.externalReferences.join(', ')}`
        );
      }
    }

    return patterns.join('\n') || '无明显使用模式';
  }

  /**
   * 分析影响
   *
   * @private
   * @param {Object} conflict - 冲突信息
   * @param {Record<string, SymbolReferenceInfo>} referenceMap - 引用映射
   * @returns {ImpactAnalysis} 影响分析
   */
  analyzeImpact(conflict, referenceMap) {
    const affectedFilesCount = Object.keys(referenceMap).length;

    let cascadingRisk = 'low';
    if (affectedFilesCount > 5) {
      cascadingRisk = 'high';
    } else if (affectedFilesCount > 2) {
      cascadingRisk = 'medium';
    }

    return {
      affectedFilesCount,
      cascadingRisk,
      suggestion:
        cascadingRisk === 'high'
          ? '建议谨慎处理，可能需要人工审核'
          : '可以自动处理此冲突'
    };
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

module.exports = { LLMConflictResolver };
