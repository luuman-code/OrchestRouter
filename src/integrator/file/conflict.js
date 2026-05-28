/**
 * @fileoverview ConflictDetector - 冲突检测器
 *
 * 检测文件合并时可能出现的冲突
 * 支持跨平台路径标准化和多种合并策略
 */

const { FileOrganizer } = require('./organizer');

/**
 * ConflictType - 冲突类型枚举
 *
 * @enum {string}
 */
const ConflictType = {
  FILE_CONTENT_MISMATCH: 'file_content_mismatch',
  PATH_COLLISION: 'path_collision',
  DEPENDENCY_MISSING: 'dependency_missing',
  MERGE_STRATEGY_CONFLICT: 'merge_strategy_conflict',
  REGION_MERGE_ERROR: 'region_merge_error'
};

/**
 * Conflict - 冲突信息
 *
 * @typedef {Object} Conflict
 * @property {string} path - 文件路径
 * @property {ConflictType} type - 冲突类型
 * @property {string} description - 冲突描述
 * @property {CodeFile[]} versions - 冲突的文件版本
 * @property {'error'|'warning'|'info'} severity - 严重程度
 * @property {Object} [resolution] - 解决方案
 * @property {'overwrite'|'append'|'merge'|'partition'|'rename'|'manual'} resolution.strategy - 解决策略
 * @property {string} [resolution.details] - 解决详情
 */

/**
 * ConflictDetector - 冲突检测器
 *
 * 检测文件合并时的各种冲突情况
 */
class ConflictDetector extends FileOrganizer {
  /**
   * 检测文件冲突
   * 支持跨平台路径标准化和多种合并策略
   *
   * @param {CodeFile[]} files - 文件列表
   * @returns {Conflict[]} 冲突列表
   */
  detectFileConflicts(files) {
    const conflicts = [];
    const normalizedFiles = new Map();
    const originalPathMap = new Map();

    // 1. 路径标准化：统一斜杠、大小写处理（跨平台兼容）
    for (const file of files) {
      const normalizedPath = this.normalizePath(file.path);

      if (!normalizedFiles.has(normalizedPath)) {
        normalizedFiles.set(normalizedPath, []);
        originalPathMap.set(normalizedPath, []);
      }
      normalizedFiles.get(normalizedPath).push(file);
      originalPathMap.get(normalizedPath).push(file.path);
    }

    // 2. 在大小写敏感系统上，检查是否存在仅大小写不同的路径
    if (this.isFileSystemCaseSensitive()) {
      for (const [normalizedPath, originalPaths] of originalPathMap.entries()) {
        if (originalPaths.length > 1) {
          // 检查是否有不同的原始路径（仅大小写不同）
          const uniquePaths = new Set(originalPaths);
          if (uniquePaths.size > 1) {
            console.warn(
              `Potential path collision detected: ${Array.from(uniquePaths).join(', ')} all normalize to ${normalizedPath}`
            );
            // 在大小写敏感系统上，这些实际上是不同的文件，不应被视为冲突
            // 将每个原始路径视为独立的文件
            for (const uniquePath of uniquePaths) {
              const uniqueNormalized = this.normalizePath(uniquePath, true);
              if (!normalizedFiles.has(uniqueNormalized)) {
                normalizedFiles.set(uniqueNormalized, []);
              }
            }
            // 移除可能错误的合并
            normalizedFiles.delete(normalizedPath);
          }
        }
      }
    }

    // 3. 检测同路径多版本冲突
    for (const [normalizedPath, fileList] of normalizedFiles.entries()) {
      if (fileList.length > 1) {
        // 检查是否有明确的合并策略
        const hasMergeStrategy = fileList.some(
          (file) =>
            file.integrationHints?.mergeStrategy &&
            file.integrationHints.mergeStrategy !== 'overwrite'
        );

        if (hasMergeStrategy) {
          // 如果有合并策略，则检查策略冲突
          const strategies = [
            ...new Set(
              fileList.map((f) => f.integrationHints?.mergeStrategy || 'overwrite')
            )
          ];

          if (strategies.length > 1) {
            conflicts.push({
              path: normalizedPath,
              type: ConflictType.MERGE_STRATEGY_CONFLICT,
              description: `Multiple merge strategies detected: ${strategies.join(', ')}`,
              versions: fileList,
              severity: 'warning',
              resolution: {
                strategy: 'manual',
                details: 'Different merge strategies conflict, requires manual resolution'
              }
            });
          }
        } else {
          // 检查内容差异
          const hasContentDifferences = this.hasContentDifferences(fileList);

          if (hasContentDifferences) {
            conflicts.push({
              path: normalizedPath,
              type: ConflictType.FILE_CONTENT_MISMATCH,
              description: 'Multiple versions of file with different content',
              versions: fileList,
              severity: 'warning',
              resolution: {
                strategy: 'overwrite',
                details: 'Default to overwrite strategy when no merge strategy specified'
              }
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * 检查文件列表是否有内容差异
   *
   * @private
   * @param {CodeFile[]} fileList - 文件列表
   * @returns {boolean} 是否有内容差异
   */
  hasContentDifferences(fileList) {
    if (fileList.length < 2) return false;

    const firstContent = fileList[0].content;
    for (let i = 1; i < fileList.length; i++) {
      if (fileList[i].content !== firstContent) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检测依赖缺失冲突
   *
   * @param {CodeFile[]} files - 文件列表
   * @param {Map<string, string>} dependencyGraph - 依赖图（文件->依赖的文件列表）
   * @returns {Conflict[]} 冲突列表
   */
  detectDependencyConflicts(files, dependencyGraph) {
    const conflicts = [];
    const filePaths = new Set(files.map((f) => this.normalizePath(f.path)));

    for (const [filePath, dependencies] of dependencyGraph.entries()) {
      if (!filePaths.has(this.normalizePath(filePath))) {
        continue;
      }

      for (const dep of dependencies) {
        if (!filePaths.has(this.normalizePath(dep))) {
          const file = files.find((f) => this.normalizePath(f.path) === this.normalizePath(filePath));
          conflicts.push({
            path: filePath,
            type: ConflictType.DEPENDENCY_MISSING,
            description: `Missing dependency: ${dep}`,
            versions: file ? [file] : [],
            severity: 'error',
            resolution: {
              strategy: 'manual',
              details: `The file ${filePath} depends on ${dep} which is not present in the output`
            }
          });
        }
      }
    }

    return conflicts;
  }
}

module.exports = { ConflictDetector, ConflictType };
