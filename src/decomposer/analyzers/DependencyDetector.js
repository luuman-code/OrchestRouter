/**
 * DependencyDetector - 依赖关系检测器
 *
 * 自动检测 deliverables 之间的依赖关系，用于智能语义分组
 * 检测规则：
 * 1. 路径依赖：同目录文件相互依赖
 * 2. 显式依赖：integrationHints.dependsOn 中声明的文件
 * 3. 类型依赖：引用 types/index.ts 的文件
 */
class DependencyDetector {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * 检测所有 deliverables 之间的依赖关系
   * @param {Array} deliverables - 待检测的 deliverables 列表
   * @returns {Map<string, Set<string>>} 文件路径 → 依赖路径集合 的映射
   */
  detectDependencies(deliverables) {
    const dependencyMap = new Map();

    // 初始化依赖集合
    for (const d of deliverables) {
      const path = this._normalizePath(d.filePath);
      dependencyMap.set(path, new Set());
    }

    // 应用三种检测规则
    this._detectPathDependencies(deliverables, dependencyMap);
    this._detectExplicitDependencies(deliverables, dependencyMap);
    this._detectTypeDependencies(deliverables, dependencyMap);

    return dependencyMap;
  }

  /**
   * 检测基于路径的依赖（同目录文件）
   */
  _detectPathDependencies(deliverables, dependencyMap) {
    const dirGroups = {};
    for (const d of deliverables) {
      const dir = this._getParentDir(d.filePath);
      if (!dirGroups[dir]) dirGroups[dir] = [];
      dirGroups[dir].push(d);
    }

    for (const [dir, files] of Object.entries(dirGroups)) {
      if (files.length > 1) {
        for (const f of files) {
          const fp = this._normalizePath(f.filePath);
          for (const other of files) {
            if (other !== f) {
              dependencyMap.get(fp).add(this._normalizePath(other.filePath));
            }
          }
        }
      }
    }
  }

  /**
   * 检测显式依赖（integrationHints.dependsOn）
   */
  _detectExplicitDependencies(deliverables, dependencyMap) {
    for (const d of deliverables) {
      const hints = d.integrationHints || {};
      const dependsOn = hints.dependsOn || [];
      const fp = this._normalizePath(d.filePath);

      for (const dep of dependsOn) {
        dependencyMap.get(fp).add(this._normalizePath(dep));
      }
    }
  }

  /**
   * 检测类型依赖（引用 types/index.ts）
   */
  _detectTypeDependencies(deliverables, dependencyMap) {
    const typeFiles = deliverables.filter(d =>
      d.filePath && d.filePath.includes('types/index.ts')
    );

    if (typeFiles.length === 0) return;

    for (const d of deliverables) {
      if (typeFiles.includes(d)) continue;

      const content = d.content || d.description || '';
      if (/import.*from.*types|interface|type\s+\w+/.test(content)) {
        const fp = this._normalizePath(d.filePath);
        for (const tf of typeFiles) {
          dependencyMap.get(fp).add(this._normalizePath(tf.filePath));
        }
      }
    }
  }

  _normalizePath(path) {
    if (!path) return '';
    return path.replace(/\\/g, '/').toLowerCase();
  }

  _getParentDir(filePath) {
    if (!filePath) return '';
    const normalized = this._normalizePath(filePath);
    const parts = normalized.split('/');
    parts.pop();
    return parts.join('/');
  }

  /**
   * 检测可被多个组共享的文件
   * 这些文件（如 types/index.ts）可能被前后端共享，但不能出现在多个 conflict_sensitive_groups 中
   * @param {Array} deliverables - 待检测的 deliverables 列表
   * @returns {Array} 共享文件数组
   */
  detectSharedFiles(deliverables) {
    // 共享文件的路径模式
    const sharedPatterns = [
      /types\/index\.ts$/,
      /shared\/types\/.*\.ts$/,
      /@types\/.*\.ts$/,
      /types\/shared\/.*\.ts$/,
      /common\/types\/.*\.ts$/,
      /interfaces\/index\.ts$/,
      /\/types\.ts$/
    ];

    return deliverables.filter(d =>
      sharedPatterns.some(pattern => pattern.test(d.filePath))
    );
  }

  /**
   * 检测给定文件是否可共享
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否可共享
   */
  isSharedFile(filePath) {
    const sharedPatterns = [
      /types\/index\.ts$/,
      /shared\/types\/.*\.ts$/,
      /@types\/.*\.ts$/,
      /types\/shared\/.*\.ts$/,
      /common\/types\/.*\.ts$/,
      /interfaces\/index\.ts$/,
      /\/types\.ts$/
    ];

    return sharedPatterns.some(pattern => pattern.test(filePath));
  }
}

module.exports = DependencyDetector;
