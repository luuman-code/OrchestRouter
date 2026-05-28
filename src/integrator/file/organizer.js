/**
 * @fileoverview FileOrganizer - 文件组织器
 *
 * 负责将子任务生成的代码按文件路径组织，处理文件级合并
 * 支持跨平台路径标准化和多种合并策略
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * CodeFile - 代码文件结构
 *
 * @typedef {Object} CodeFile
 * @property {string} path - 文件路径（如 "components/LoginForm.jsx"）
 * @property {string} content - 文件内容
 * @property {string} sourceTaskId - 来源子任务 ID（来自 executionResult.task_id）
 * @property {string} modelUsed - 生成该文件的模型
 * @property {string} language - 编程语言/框架
 * @property {Object} [integrationHints] - 来自 Decomposer 的整合提示
 * @property {string} [integrationHints.targetFile] - 明确输出文件路径
 * @property {string} [integrationHints.region] - 目标代码区域
 * @property {string[]} [integrationHints.dependsOn] - 依赖的其他子任务 ID
 * @property {string} [integrationHints.mergeGroupId] - 合并组 ID
 * @property {'overwrite'|'append'|'merge'|'partition'|'rename'} [integrationHints.mergeStrategy] - 合并策略
 * @property {Object} [integrationHints.regionConstraints] - 代码区域约束
 * @property {string} [integrationHints.regionConstraints.startMarker] - 起始标记
 * @property {string} [integrationHints.regionConstraints.endMarker] - 结束标记
 * @property {string[]} [integrationHints.regionConstraints.allowedContentTypes] - 允许的内容类型
 * @property {Object} [integrationHints.originalTask] - 原始任务对象
 * @property {string} [integrationHints.originalFilePath] - 原始文件路径
 * @property {string} [integrationHints.groupId] - 分组 ID
 */

/**
 * FileOrganizer - 文件组织器
 *
 * 管理代码文件的存储、合并和写入磁盘
 */
class FileOrganizer {
  /**
   * 创建文件组织器
   * @param {string} [rootDir="output"] - 根目录
   */
  constructor(rootDir = 'output') {
    /** @private @type {Map<string, CodeFile>} */
    this.files = new Map();
    /** @private @type {string} */
    this.rootDir = rootDir;
  }

  /**
   * 添加或更新文件
   * 根据 integrationHints 中的合并策略处理冲突
   *
   * @param {CodeFile} codeFile - 代码文件
   */
  addFile(codeFile) {
    // 使用原始路径（保留大小写）作为key
    const originalPath = codeFile.path.replace(/\\/g, '/');
    // 使用大小写不敏感的key用于检测重复
    const caseInsensitiveKey = originalPath.toLowerCase();

    // 检查是否已存在相同路径的文件（忽略大小写）
    let existingKey = null;
    for (const [key] of this.files) {
      if (key.toLowerCase().replace(/\\/g, '/') === caseInsensitiveKey) {
        existingKey = key;
        break;
      }
    }

    if (existingKey) {
      const existingFile = this.files.get(existingKey);

      // 如果新文件已经是从多个任务合并而来的（通过 mergedFrom 或 sourceTaskId 包含多个 ID 标识）
      // 则直接覆盖，不再重复合并
      if (codeFile.mergedFrom || (codeFile.sourceTaskId && codeFile.sourceTaskId.includes(','))) {
        // 这是已经合并好的文件，直接覆盖，但保留原始路径
        this.files.delete(existingKey);
        this.files.set(originalPath, codeFile);
        return;
      }

      // 如果存在，根据合并策略处理
      if (existingFile.integrationHints?.mergeStrategy || codeFile.integrationHints?.mergeStrategy) {
        // 优先使用新的文件的合并策略
        const strategy = codeFile.integrationHints?.mergeStrategy || existingFile.integrationHints?.mergeStrategy;
        const constraints = codeFile.integrationHints?.regionConstraints || existingFile.integrationHints?.regionConstraints;

        const mergedFile = this.mergeByStrategy(
          existingFile,
          codeFile,
          strategy,
          constraints
        );
        this.files.delete(existingKey);
        this.files.set(originalPath, mergedFile);
      } else {
        // 如果两个都没有指定策略，采用追加策略以保留所有内容
        const mergedFile = this.mergeByStrategy(
          existingFile,
          codeFile,
          'append'
        );
        this.files.delete(existingKey);
        this.files.set(originalPath, mergedFile);
      }
    } else {
      this.files.set(originalPath, codeFile);
    }
  }

  /**
   * 根据合并策略处理文件内容合并
   *
   * @private
   * @param {CodeFile} file1 - 文件 1
   * @param {CodeFile} file2 - 文件 2
   * @param {string} [strategy] - 合并策略
   * @param {Object} [constraints] - 约束条件
   * @returns {CodeFile} 合并后的文件
   */
  mergeByStrategy(file1, file2, strategy, constraints) {
    const mergeStrategy = strategy || 'overwrite';

    switch (mergeStrategy) {
      case 'overwrite':
        // 后面的内容覆盖前面的内容
        return file2;

      case 'append':
        // 在原有内容后追加
        return {
          ...file1,
          content: file1.content + file2.content,
          sourceTaskId: `${file1.sourceTaskId},${file2.sourceTaskId}`
        };

      case 'merge':
        // 智能合并：根据区域约束或使用 LLM 辅助
        if (constraints && (constraints.startMarker || constraints.endMarker || constraints.region)) {
          return this.mergeByRegion(file1, file2, constraints);
        } else {
          // 默认使用追加策略
          console.warn('LLM-assisted merge not implemented, falling back to append strategy');
          return this.mergeByStrategy(file1, file2, 'append');
        }

      case 'partition':
        // 分区合并：根据约束条件进行分区
        return this.partitionAndMerge(file1, file2, constraints);

      case 'rename':
        // 重命名策略：生成新的唯一文件名
        const newPath = this.generateUniquePath(file2.path);
        return {
          ...file2,
          path: newPath
        };

      default:
        // 默认行为：覆盖
        return file2;
    }
  }

  /**
   * 根据区域约束进行合并
   *
   * @private
   * @param {CodeFile} file1 - 文件 1
   * @param {CodeFile} file2 - 文件 2
   * @param {Object} constraints - 约束条件
   * @returns {CodeFile} 合并后的文件
   */
  mergeByRegion(file1, file2, constraints) {
    let content1 = file1.content;
    const content2 = file2.content;

    if (constraints.region) {
      // 使用区域标记进行合并
      const regionPattern = new RegExp(
        `(<!--\\s*${constraints.region}\\s*-->|\\/\\/\\s*${constraints.region}|#\\s*${constraints.region}|\\/\\*\\s*${constraints.region}\\s*\\*\\/)([\\s\\S]*?)(?=<!--|\\/\\/|#|\\/\\*|$)`,
        'gi'
      );

      const match = content1.match(regionPattern);

      if (match) {
        // 替换匹配区域的内容
        content1 = content1.replace(regionPattern, `$1\n${content2}\n`);
      } else {
        // 如果没有找到区域标记，则根据约束在合适的位置插入
        if (constraints.startMarker && constraints.endMarker) {
          content1 += `\n${constraints.startMarker}\n${content2}\n${constraints.endMarker}`;
        } else if (constraints.startMarker) {
          content1 += `\n${constraints.startMarker}\n${content2}`;
        } else {
          content1 += `\n/* Region: ${constraints.region} */\n${content2}`;
        }
      }
    } else if (constraints.startMarker && constraints.endMarker) {
      // 使用起始和结束标记进行查找替换
      const escapedStart = constraints.startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedEnd = constraints.endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regionPattern = new RegExp(
        `(${escapedStart})([\\s\\S]*?)(${escapedEnd})`,
        'gi'
      );

      const match = content1.match(regionPattern);
      if (match) {
        content1 = content1.replace(regionPattern, `$1\n${content2}\n$3`);
      } else {
        content1 += `\n${constraints.startMarker}\n${content2}\n${constraints.endMarker}`;
      }
    }

    return {
      ...file1,
      content: content1
    };
  }

  /**
   * 分区合并：根据约束条件进行分区
   *
   * @private
   * @param {CodeFile} file1 - 文件 1
   * @param {CodeFile} file2 - 文件 2
   * @param {Object} [constraints] - 约束条件
   * @returns {CodeFile} 合并后的文件
   */
  partitionAndMerge(file1, file2, constraints) {
    if (!constraints) return this.mergeByStrategy(file1, file2, 'append');

    if (constraints.allowedContentTypes) {
      const file1Type = this.determineContentType(file1.content);
      const file2Type = this.determineContentType(file2.content);

      if (constraints.allowedContentTypes.includes(file1Type) &&
          constraints.allowedContentTypes.includes(file2Type)) {
        return this.mergeByStrategy(file1, file2, 'append', constraints);
      } else {
        return this.mergeByStrategy(file1, file2, 'rename', constraints);
      }
    }

    return this.mergeByStrategy(file1, file2, 'append', constraints);
  }

  /**
   * 确定内容类型
   *
   * @private
   * @param {string} content - 内容
   * @returns {string} 内容类型
   */
  determineContentType(content) {
    if (content.includes('function') || content.includes('class')) {
      return 'function';
    } else if (content.includes('<') && content.includes('>')) {
      return 'markup';
    } else if (content.includes('import') || content.includes('export')) {
      return 'module';
    } else if (content.includes('{') && content.includes('}')) {
      return 'object';
    }
    return 'unknown';
  }

  /**
   * 生成唯一的文件路径
   *
   * @private
   * @param {string} originalPath - 原始路径
   * @returns {string} 唯一路径
   */
  generateUniquePath(originalPath) {
    const parts = originalPath.split('.');
    const extension = parts.pop();
    const baseName = parts.join('.');
    const timestamp = Date.now();
    return `${baseName}_${timestamp}.${extension}`;
  }

  /**
   * 路径标准化：统一斜杠、大小写处理（跨平台兼容）
   *
   * @param {string} pathStr - 路径字符串
   * @param {boolean} [caseSensitive] - 是否大小写敏感（可选，覆盖默认行为）
   * @returns {string} 标准化后的路径
   */
  normalizePath(pathStr, caseSensitive) {
    // 统一斜杠为正斜杠
    let normalized = pathStr.replace(/\\/g, '/');

    // 注意：不再将路径转换为小写
    // 路径应该保留原始大小写，只是在内部存储时使用不区分大小写的key来查找
    // 如果需要不区分大小写的查找，应该使用单独的 case-insensitive key，而不是修改原始路径

    return normalized;
  }

  /**
   * 检测当前文件系统是否大小写敏感
   *
   * @private
   * @returns {boolean} true 表示大小写敏感（Linux），false 表示大小写不敏感（Windows/macOS）
   */
  isFileSystemCaseSensitive() {
    if (typeof process !== 'undefined' && process.platform) {
      if (process.platform === 'win32') {
        return false;
      }
      if (process.platform === 'darwin') {
        return false;
      }
      if (process.platform === 'linux') {
        return true;
      }
    }
    return true;
  }

  /**
   * 获取所有文件
   *
   * @returns {Map<string, CodeFile>} 所有文件
   */
  getAllFiles() {
    return this.files;
  }

  /**
   * 获取特定路径的文件
   *
   * @param {string} pathStr - 路径
   * @returns {CodeFile|undefined} 文件
   */
  getFile(pathStr) {
    const originalPath = pathStr.replace(/\\/g, '/');
    const caseInsensitiveKey = originalPath.toLowerCase();

    // 大小写不敏感查找
    for (const [key, value] of this.files) {
      if (key.toLowerCase().replace(/\\/g, '/') === caseInsensitiveKey) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * 检查是否存在指定路径的文件
   *
   * @param {string} pathStr - 路径
   * @returns {boolean} 是否存在
   */
  hasFile(pathStr) {
    const originalPath = pathStr.replace(/\\/g, '/');
    const caseInsensitiveKey = originalPath.toLowerCase();

    // 大小写不敏感查找
    for (const [key] of this.files) {
      if (key.toLowerCase().replace(/\\/g, '/') === caseInsensitiveKey) {
        return true;
      }
    }
    return false;
  }

  /**
   * 移除指定路径的文件
   *
   * @param {string} pathStr - 路径
   * @returns {boolean} 是否成功移除
   */
  removeFile(pathStr) {
    const originalPath = pathStr.replace(/\\/g, '/');
    const caseInsensitiveKey = originalPath.toLowerCase();

    // 大小写不敏感查找并删除
    for (const [key] of this.files) {
      if (key.toLowerCase().replace(/\\/g, '/') === caseInsensitiveKey) {
        return this.files.delete(key);
      }
    }
    return false;
  }

  /**
   * 写入磁盘
   *
   * @param {string} [outputDir] - 输出目录
   * @returns {Promise<void>}
   */
  async writeToDisk(outputDir) {
    const targetDir = outputDir || this.rootDir;

    // 确保输出目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 将所有文件写入磁盘
    for (const [relativePath, file] of this.files.entries()) {
      const fullPath = path.resolve(targetDir, relativePath);

      // 确保文件的父目录存在
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件内容
      await fs.writeFile(fullPath, file.content, 'utf8');
    }
  }

  /**
   * 重置文件组织器的所有状态
   * 用于在每次编排开始前清理上一次的状态，防止跨请求污染
   *
   * @returns {void}
   */
  reset() {
    this.files = new Map();
    this.rootDir = 'output';
  }
}

module.exports = { FileOrganizer };
