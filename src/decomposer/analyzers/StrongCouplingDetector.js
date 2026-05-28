/**
 * StrongCouplingDetector - 强耦合检测器
 *
 * 使用 Tarjan SCC 算法检测循环依赖的文件组
 * 强耦合文件必须同组，否则会导致循环依赖错误
 */

class StrongCouplingDetector {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * 检测强耦合组（循环依赖）
   * @param {Array} deliverables - 待检测的 deliverables 列表
   * @returns {Array} 强耦合组数组，每个组包含文件路径数组
   */
  detectStrongCouplingGroups(deliverables) {
    // 构建依赖图
    const depGraph = this._buildDepGraph(deliverables);

    // Tarjan SCC 算法
    const sccs = this._tarjanSCC(depGraph);

    // 只返回大小 > 1 的 SCC（单文件不是强耦合组）
    return sccs.filter(scc => scc.length > 1);
  }

  /**
   * 构建依赖图（只包含 deliverables 之间的依赖）
   * @param {Array} deliverables - 待检测的 deliverables 列表
   * @returns {Map} 文件路径 → 依赖路径集合 的映射
   * @private
   */
  _buildDepGraph(deliverables) {
    const depGraph = new Map();
    const pathSet = new Set();

    // 初始化：所有文件作为节点，初始化空依赖集
    for (const d of deliverables) {
      const path = this._normalizePath(d.filePath);
      depGraph.set(path, new Set());
      pathSet.add(path);
    }

    // 检测显式依赖 (integrationHints.dependsOn)
    for (const d of deliverables) {
      const path = this._normalizePath(d.filePath);
      const hints = d.integrationHints || {};
      const dependsOn = hints.dependsOn || [];

      for (const dep of dependsOn) {
        const depPath = this._normalizePath(dep);
        // 只添加对 deliverables 中存在的文件的依赖
        if (pathSet.has(depPath)) {
          depGraph.get(path).add(depPath);
        }
      }
    }

    // 检测内容中的导入依赖
    for (const d of deliverables) {
      const path = this._normalizePath(d.filePath);
      const content = d.content || d.description || '';

      // 提取所有导入的文件路径
      const importedPaths = this._extractImportPaths(content, path);

      for (const importedPath of importedPaths) {
        // 只添加对 deliverables 中存在的文件的依赖
        if (pathSet.has(importedPath)) {
          depGraph.get(path).add(importedPath);
        }
      }
    }

    return depGraph;
  }

  /**
   * 从内容中提取导入路径
   * @param {string} content - 文件内容
   * @param {string} currentPath - 当前文件路径
   * @returns {Array} 导入路径数组
   * @private
   */
  _extractImportPaths(content, currentPath) {
    const paths = [];

    // 提取 directory base（用于解析相对路径）
    const dirBase = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // 检测 import 语句: import x from 'path' 或 import 'path'
    const importRegex = /import\s+(?:{[^}]+}|\w+|\* as \w+)?\s*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolvedPath = this._resolveImportPath(importPath, dirBase);
      paths.push(resolvedPath);
    }

    // 检测 require 语句: require('path')
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolvedPath = this._resolveImportPath(importPath, dirBase);
      paths.push(resolvedPath);
    }

    return paths;
  }

  /**
   * 解析导入路径为标准化文件路径
   * @param {string} importPath - 导入路径
   * @param {string} dirBase - 当前文件所在目录
   * @returns {string} 标准化后的路径
   * @private
   */
  _resolveImportPath(importPath, dirBase) {
    // 跳过包导入（跳过 node_modules 等）
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
      // 包导入，假设是包名，尝试映射到 src 目录
      // types/index -> src/types/index
      if (importPath.startsWith('types')) {
        return importPath.replace(/^types/, 'src/types');
      }
      if (importPath.startsWith('@/')) {
        return 'src' + importPath.substring(1);
      }
      return importPath;
    }

    // 解析相对路径
    let resolved = dirBase + importPath;

    // 解析 . 和 ..
    const parts = resolved.split('/');
    const normalizedParts = [];
    for (const part of parts) {
      if (part === '..') {
        normalizedParts.pop();
      } else if (part !== '.' && part !== '') {
        normalizedParts.push(part);
      }
    }

    return normalizedParts.join('/');
  }

  /**
   * Tarjan SCC 算法
   * @param {Map} depGraph - 依赖图
   * @returns {Array} SCC 数组，每个 SCC 是一个文件路径数组
   * @private
   */
  _tarjanSCC(depGraph) {
    const nodes = Array.from(depGraph.keys());
    const indices = new Map();
    const lowlinks = new Map();
    const onStack = new Set();
    const stack = [];
    const sccs = [];
    let currentIndex = 0;

    const strongConnect = (node) => {
      indices.set(node, currentIndex);
      lowlinks.set(node, currentIndex);
      currentIndex++;
      stack.push(node);
      onStack.add(node);

      const neighbors = depGraph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!indices.has(neighbor)) {
          strongConnect(neighbor);
          lowlinks.set(node, Math.min(lowlinks.get(node), lowlinks.get(neighbor)));
        } else if (onStack.has(neighbor)) {
          lowlinks.set(node, Math.min(lowlinks.get(node), indices.get(neighbor)));
        }
      }

      if (lowlinks.get(node) === indices.get(node)) {
        const scc = [];
        let w;
        do {
          w = stack.pop();
          onStack.delete(w);
          scc.push(w);
        } while (w !== node);
        sccs.push(scc);
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return sccs;
  }

  /**
   * 规范化文件路径
   * @param {string} path - 文件路径
   * @returns {string} 标准化后的路径
   * @private
   */
  _normalizePath(path) {
    if (!path) return '';
    return path.replace(/\\/g, '/').toLowerCase();
  }
}

module.exports = StrongCouplingDetector;
