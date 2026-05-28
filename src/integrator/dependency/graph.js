/**
 * @fileoverview DependencyGraph - 依赖图
 *
 * 构建和管理文件间的依赖关系
 * 支持拓扑排序和循环依赖检测
 */

const { PathResolver } = require('./path-resolver');

/**
 * CircularDepInfo - 循环依赖信息
 *
 * @typedef {Object} CircularDepInfo
 * @property {string[]} cycle - 循环依赖的路径数组
 * @property {'low'|'medium'|'high'} severity - 严重程度
 */

/**
 * DependencyGraphConfig - 依赖图配置
 *
 * @typedef {Object} DependencyGraphConfig
 * @property {Record<string, string>} [pathAliases] - 路径别名映射
 * @property {string} [baseUrl] - 基础路径
 * @property {string} [tsConfigPath] - TypeScript 配置文件路径
 * @property {string} [packageJsonPath] - package.json 路径
 */

/**
 * DependencyGraph - 依赖图
 *
 * 管理文件节点和依赖边，支持拓扑排序和循环依赖检测
 */
class DependencyGraph {
  /**
   * 创建依赖图
   * @param {DependencyGraphConfig} [config] - 配置
   */
  constructor(config) {
    /** @type {Map<string, Object>} */
    this.nodes = new Map();
    /** @type {Map<string, Set<string>>} */
    this.edges = new Map(); // from -> to
    /** @type {PathResolver} */
    this.pathResolver = new PathResolver(config?.pathAliases || {}, config?.baseUrl || '.');

    // 从配置文件加载路径别名
    if (config?.tsConfigPath || config?.packageJsonPath) {
      this.pathResolver.loadConfigAliases(config);
    }
  }

  /**
   * 添加文件节点
   *
   * @param {Object} analysis - 文件分析结果
   */
  addFile(analysis) {
    this.nodes.set(analysis.path, analysis);
  }

  /**
   * 构建依赖边
   */
  buildEdges() {
    for (const [filePath, analysis] of this.nodes.entries()) {
      if (!analysis || !Array.isArray(analysis.imports)) {
        continue; // 跳过无效节点
      }

      for (const importSpec of analysis.imports) {
        // 跳过无效的导入规范
        if (!importSpec || typeof importSpec !== 'string') {
          console.warn(`Skipping invalid import specification in ${filePath}:`, importSpec);
          continue;
        }

        try {
          // 使用路径解析器将导入规范解析为实际文件路径
          const resolvedPath = this.pathResolver.resolve(importSpec, filePath);
          if (resolvedPath && this.nodes.has(resolvedPath)) {
            // 添加依赖边：当前文件 -> 被导入的文件
            if (!this.edges.has(filePath)) {
              this.edges.set(filePath, new Set());
            }
            this.edges.get(filePath).add(resolvedPath);
          }
        } catch (error) {
          // 判断是否为外部依赖
          const isExternalDependency = !importSpec.startsWith('./') &&
                                        !importSpec.startsWith('../');

          // 仅对内部依赖解析失败输出警告
          if (!isExternalDependency) {
            console.warn(`Failed to resolve internal import ${importSpec} from ${filePath}:`, error.message);
          }
          // 外部依赖 silently ignored - 它们将在目标项目中被正确解析
        }
      }
    }
  }

  /**
   * 获取导入顺序（拓扑排序）
   *
   * @returns {string[]} 拓扑排序结果
   */
  getImportOrder() {
    const visited = new Set();
    const result = [];

    // Kahn's algorithm for topological sort
    const inDegree = new Map();

    // 初始化入度
    for (const node of this.nodes.keys()) {
      inDegree.set(node, 0);
    }

    // 【优化】预构建反向边（从依赖到依赖者），避免每次遍历所有边
    const reverseEdges = new Map();
    for (const [node, dependencies] of this.edges.entries()) {
      for (const dep of dependencies) {
        if (inDegree.has(dep)) {
          inDegree.set(dep, inDegree.get(dep) + 1);
        }
        // 构建反向边
        if (!reverseEdges.has(dep)) {
          reverseEdges.set(dep, new Set());
        }
        reverseEdges.get(dep).add(node);
      }
    }

    // 找到所有入度为 0 的节点
    const queue = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    // 处理队列
    while (queue.length > 0) {
      const current = queue.shift();
      result.push(current);
      visited.add(current);

      // 【优化】使用反向边直接获取依赖当前节点的节点
      const dependents = reverseEdges.get(current);
      if (dependents) {
        for (const node of dependents) {
          const newDegree = inDegree.get(node) - 1;
          inDegree.set(node, newDegree);
          if (newDegree === 0) {
            queue.push(node);
          }
        }
      }
    }

    // 如果还有未访问的节点，说明存在循环依赖
    if (result.length !== this.nodes.size) {
      const cycles = this.detectCircularDeps();
      console.warn(`Circular dependencies detected. Topological order may be incomplete. Cycles: ${JSON.stringify(cycles)}`);
    }

    return result;
  }

  /**
   * 检测循环依赖
   *
   * @returns {CircularDepInfo[]} 循环依赖信息列表
   */
  detectCircularDeps() {
    const visited = new Set();
    const recStack = new Set();
    const cycles = [];

    for (const node of this.nodes.keys()) {
      if (!visited.has(node)) {
        this.detectCycleDFS(node, visited, recStack, cycles, []);
      }
    }

    return cycles;
  }

  /**
   * 使用深度优先搜索检测循环依赖
   *
   * @private
   * @param {string} node - 当前节点
   * @param {Set<string>} visited - 已访问节点
   * @param {Set<string>} recStack - 递归栈
   * @param {CircularDepInfo[]} cycles - 循环依赖列表
   * @param {string[]} path - 当前路径
   */
  detectCycleDFS(node, visited, recStack, cycles, path) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = this.edges.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.detectCycleDFS(neighbor, visited, recStack, cycles, [...path]);
      } else if (recStack.has(neighbor)) {
        // 发现循环依赖
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push({
          cycle: [...cycle, neighbor],
          severity: this.determineCycleSeverity(cycle)
        });
      }
    }

    recStack.delete(node);
  }

  /**
   * 确定循环依赖的严重程度
   *
   * @private
   * @param {string[]} cycle - 循环路径
   * @returns {'low'|'medium'|'high'} 严重程度
   */
  determineCycleSeverity(cycle) {
    const length = cycle.length;
    if (length <= 2) {
      return 'high';
    } else if (length <= 4) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * 处理循环依赖
   *
   * @param {CircularDepInfo[]} cycles - 循环依赖列表
   * @param {'warn'|'break'|'error'} [strategy] - 处理策略
   */
  handleCircularDeps(cycles, strategy = 'warn') {
    for (const cycle of cycles) {
      switch (strategy) {
        case 'warn':
          console.warn(`Circular dependency detected: ${cycle.cycle.join(' -> ')}`);
          // 保持原有依赖关系，仅输出警告
          break;

        case 'break':
          // 尝试通过自动提取公共模块来打破循环
          this.attemptBreakCycle(cycle);
          break;

        case 'error':
          throw new Error(`Circular dependency detected: ${cycle.cycle.join(' -> ')}`);
      }
    }
  }

  /**
   * 尝试打破循环依赖
   *
   * @private
   * @param {CircularDepInfo} cycleInfo - 循环依赖信息
   */
  attemptBreakCycle(cycleInfo) {
    // 实现自动提取公共依赖模块的逻辑
    // 或移除某些非必要依赖
    console.warn(`Attempting to break cycle: ${cycleInfo.cycle.join(' -> ')}`);

    // 这里可以实现更复杂的逻辑来自动打破循环
    // 例如：提取公共模块、重构依赖关系等
  }

  /**
   * 获取文件的依赖列表
   *
   * @param {string} filePath - 文件路径
   * @returns {string[]} 依赖文件列表
   */
  getDependencies(filePath) {
    const deps = this.edges.get(filePath);
    return deps ? Array.from(deps) : [];
  }

  /**
   * 获取引用指定文件的所有文件
   *
   * @param {string} filePath - 文件路径
   * @returns {string[]} 引用者列表
   */
  getDependents(filePath) {
    const dependents = [];
    for (const [node, deps] of this.edges.entries()) {
      if (deps.has(filePath)) {
        dependents.push(node);
      }
    }
    return dependents;
  }

  /**
   * 获取依赖图的节点数量
   *
   * @returns {number} 节点数量
   */
  get size() {
    return this.nodes.size;
  }

  /**
   * 清空依赖图
   */
  clear() {
    this.nodes.clear();
    this.edges.clear();
  }
}

module.exports = { DependencyGraph };
