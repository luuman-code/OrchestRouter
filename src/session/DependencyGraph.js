/**
 * 依赖图类
 * 用于管理文件和子任务之间的依赖关系
 */
class DependencyGraph {
  constructor() {
    // 存储依赖关系图：key为源节点，value为依赖的目标节点集合
    this.graph = new Map();
    // 存储反向依赖图：key为目标节点，value为依赖于它的源节点集合
    this.reverseGraph = new Map();
    // 节点元数据
    this.nodeMetadata = new Map();
    // 图的统计信息
    this.stats = {
      totalNodes: 0,
      totalEdges: 0,
      circularDependencies: 0
    };
  }

  /**
   * 添加节点及其元数据
   * @param {string} nodeId - 节点ID
   * @param {Object} metadata - 节点元数据
   */
  addNode(nodeId, metadata = {}) {
    if (!this.graph.has(nodeId)) {
      this.graph.set(nodeId, new Set());
      this.reverseGraph.set(nodeId, new Set());
      this.stats.totalNodes++;
    }

    this.nodeMetadata.set(nodeId, {
      ...this.nodeMetadata.get(nodeId) || {},
      ...metadata,
      lastUpdated: new Date()
    });
  }

  /**
   * 添加依赖关系
   * @param {string} fromNode - 源节点（依赖方）
   * @param {string} toNode - 目标节点（被依赖方）
   * @param {Object} edgeMetadata - 边的元数据
   */
  addDependency(fromNode, toNode, edgeMetadata = {}) {
    // 添加节点（如果尚不存在）
    this.addNode(fromNode);
    this.addNode(toNode);

    // 添加正向依赖
    this.graph.get(fromNode).add(toNode);
    // 添加反向依赖
    this.reverseGraph.get(toNode).add(fromNode);

    // 存储边的元数据
    const edgeKey = `${fromNode}=>${toNode}`;
    this.nodeMetadata.set(edgeKey, {
      ...this.nodeMetadata.get(edgeKey) || {},
      ...edgeMetadata,
      lastUpdated: new Date()
    });

    this.stats.totalEdges++;
  }

  /**
   * 移除依赖关系
   * @param {string} fromNode - 源节点
   * @param {string} toNode - 目标节点
   */
  removeDependency(fromNode, toNode) {
    if (this.graph.has(fromNode)) {
      if (this.graph.get(fromNode).delete(toNode)) {
        this.stats.totalEdges--;
      }
    }

    if (this.reverseGraph.has(toNode)) {
      this.reverseGraph.get(toNode).delete(fromNode);
    }

    // 删除边的元数据
    const edgeKey = `${fromNode}=>${toNode}`;
    this.nodeMetadata.delete(edgeKey);
  }

  /**
   * 获取节点的直接依赖（被节点所依赖的节点）
   * @param {string} nodeId - 节点ID
   * @returns {Set} 直接依赖的节点集合
   */
  getDependencies(nodeId) {
    return this.graph.get(nodeId) || new Set();
  }

  /**
   * 获取节点的依赖者（依赖该节点的节点）
   * @param {string} nodeId - 节点ID
   * @returns {Set} 依赖该节点的节点集合
   */
  getDependents(nodeId) {
    return this.reverseGraph.get(nodeId) || new Set();
  }

  /**
   * 获取所有节点
   * @returns {Array} 所有节点ID的数组
   */
  getAllNodes() {
    return Array.from(this.graph.keys());
  }

  /**
   * 获取所有边
   * @returns {Array} 所有边的数组，每项格式为 {from, to}
   */
  getAllEdges() {
    const edges = [];
    for (const [fromNode, toNodes] of this.graph) {
      for (const toNode of toNodes) {
        edges.push({ from: fromNode, to: toNode });
      }
    }
    return edges;
  }

  /**
   * 检查是否存在路径（从fromNode到toNode）
   * @param {string} fromNode - 起始节点
   * @param {string} toNode - 结束节点
   * @returns {boolean} 是否存在路径
   */
  hasPath(fromNode, toNode) {
    if (fromNode === toNode) return true;

    const visited = new Set();
    const queue = [fromNode];

    while (queue.length > 0) {
      const currentNode = queue.shift();

      if (currentNode === toNode) {
        return true;
      }

      if (visited.has(currentNode)) {
        continue;
      }

      visited.add(currentNode);

      const neighbors = this.getDependencies(currentNode);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return false;
  }

  /**
   * 获取受特定节点影响的所有节点（传递依赖者）
   * @param {string} nodeId - 源节点
   * @returns {Set} 受影响的所有节点集合
   */
  getAffectedNodes(nodeId) {
    const affected = new Set();
    const queue = [nodeId];
    const visited = new Set();

    while (queue.length > 0) {
      const currentNode = queue.shift();

      if (visited.has(currentNode)) {
        continue;
      }

      visited.add(currentNode);

      // 当前节点也加入受影响集合（如果是起始节点之外的）
      if (currentNode !== nodeId) {
        affected.add(currentNode);
      }

      // 获取依赖当前节点的节点（反向依赖）
      const dependents = this.getDependents(currentNode);
      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          queue.push(dependent);
        }
      }
    }

    return affected;
  }

  /**
   * 获取节点所依赖的所有节点（传递依赖）
   * @param {string} nodeId - 源节点
   * @returns {Set} 被依赖的所有节点集合
   */
  getRequiredNodes(nodeId) {
    const required = new Set();
    const queue = [nodeId];
    const visited = new Set();

    while (queue.length > 0) {
      const currentNode = queue.shift();

      if (visited.has(currentNode)) {
        continue;
      }

      visited.add(currentNode);

      // 当前节点也加入所需集合（如果是起始节点之外的）
      if (currentNode !== nodeId) {
        required.add(currentNode);
      }

      // 获取当前节点所依赖的节点
      const dependencies = this.getDependencies(currentNode);
      for (const dependency of dependencies) {
        if (!visited.has(dependency)) {
          queue.push(dependency);
        }
      }
    }

    return required;
  }

  /**
   * 检测环形依赖
   * @returns {Array} 环形依赖的路径数组
   */
  detectCycles() {
    const cycles = [];
    const unvisited = new Set(this.getAllNodes());
    const visiting = new Set();
    const visited = new Set();

    while (unvisited.size > 0) {
      const startNode = unvisited.values().next().value;
      const cycle = this._dfsForCycleDetection(startNode, visiting, visited, []);

      if (cycle) {
        cycles.push(cycle);
      }
    }

    return cycles;
  }

  /**
   * DFS辅助函数用于环形依赖检测
   * @private
   */
  _dfsForCycleDetection(node, visiting, visited, path) {
    if (visited.has(node)) return null;
    if (visiting.has(node)) {
      // 发现环形依赖
      const cycleStartIndex = path.indexOf(node);
      if (cycleStartIndex !== -1) {
        return path.slice(cycleStartIndex).concat([node]);
      }
      return [node];
    }

    visiting.add(node);
    path.push(node);

    const dependencies = this.getDependencies(node);
    for (const dependency of dependencies) {
      const cycle = this._dfsForCycleDetection(dependency, visiting, visited, path);
      if (cycle) {
        return cycle;
      }
    }

    visiting.delete(node);
    visited.add(node);
    path.pop();

    return null;
  }

  /**
   * 进行拓扑排序
   * @returns {Array} 拓扑排序后的节点数组
   */
  topologicalSort() {
    const sorted = [];
    const visited = new Set();
    const temp = new Set(); // 临时标记，用于检测环

    const visit = (node) => {
      if (temp.has(node)) {
        throw new Error("Graph has at least one cycle");
      }
      if (visited.has(node)) return;

      temp.add(node);

      const dependencies = this.getDependencies(node);
      for (const dependency of dependencies) {
        visit(dependency);
      }

      temp.delete(node);
      visited.add(node);
      sorted.unshift(node); // 前置添加以获得正确顺序
    };

    for (const node of this.getAllNodes()) {
      if (!visited.has(node)) {
        visit(node);
      }
    }

    return sorted;
  }

  /**
   * 更新节点内容哈希，用于增量检测
   * @param {string} nodeId - 节点ID
   * @param {string} hash - 内容哈希
   */
  updateNodeHash(nodeId, hash) {
    const metadata = this.nodeMetadata.get(nodeId) || {};
    metadata.hash = hash;
    metadata.lastHashUpdate = new Date();
    this.nodeMetadata.set(nodeId, metadata);
  }

  /**
   * 获取节点内容哈希
   * @param {string} nodeId - 节点ID
   * @returns {string} 内容哈希
   */
  getNodeHash(nodeId) {
    const metadata = this.nodeMetadata.get(nodeId) || {};
    return metadata.hash;
  }

  /**
   * 分析受影响的范围
   * @param {Array<string>} changedNodes - 发生变化的节点
   * @returns {Object} 影响分析结果
   */
  analyzeImpact(changedNodes) {
    const impactAnalysis = {
      directChanges: new Set(changedNodes),
      affectedByChanges: new Set(),  // 受变化直接影响的节点
      transitivelyAffected: new Set(),  // 传递受影响的节点
      totalAffected: new Set()  // 所有受影响的节点
    };

    for (const nodeId of changedNodes) {
      // 获取直接受此节点影响的节点
      const directAffected = this.getDependents(nodeId);
      impactAnalysis.affectedByChanges = new Set([
        ...impactAnalysis.affectedByChanges,
        ...directAffected
      ]);

      // 获取传递受影响的节点
      const transitiveAffected = this.getAffectedNodes(nodeId);
      impactAnalysis.transitivelyAffected = new Set([
        ...impactAnalysis.transitivelyAffected,
        ...transitiveAffected
      ]);
    }

    // 合并所有受影响的节点
    impactAnalysis.totalAffected = new Set([
      ...impactAnalysis.directChanges,
      ...impactAnalysis.affectedByChanges,
      ...impactAnalysis.transitivelyAffected
    ]);

    return {
      ...impactAnalysis,
      stats: {
        directChangesCount: impactAnalysis.directChanges.size,
        affectedByChangesCount: impactAnalysis.affectedByChanges.size,
        transitivelyAffectedCount: impactAnalysis.transitivelyAffected.size,
        totalAffectedCount: impactAnalysis.totalAffected.size
      }
    };
  }

  /**
   * 获取图的摘要信息
   * @returns {Object} 图的统计信息
   */
  getSummary() {
    const cycles = this.detectCycles();

    return {
      ...this.stats,
      totalNodes: this.graph.size,
      totalEdges: this.stats.totalEdges,
      hasCycles: cycles.length > 0,
      cycleCount: cycles.length,
      avgDependencies: this.graph.size > 0 ?
        this.stats.totalEdges / this.graph.size : 0,
      density: this.graph.size > 0 ?
        this.stats.totalEdges / (this.graph.size * (this.graph.size - 1)) : 0
    };
  }

  /**
   * 导出图数据
   * @returns {Object} 图的序列化数据
   */
  export() {
    return {
      nodes: Object.fromEntries(this.graph.entries()),
      reverseNodes: Object.fromEntries(this.reverseGraph.entries()),
      metadata: Object.fromEntries(this.nodeMetadata.entries()),
      stats: this.stats,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 从数据导入图
   * @param {Object} data - 图的序列化数据
   */
  import(data) {
    // 清空当前图
    this.graph.clear();
    this.reverseGraph.clear();
    this.nodeMetadata.clear();

    // 验证 data 和 data.nodes 是否有效
    if (!data || typeof data !== 'object') {
      console.warn('DependencyGraph.import: Invalid data argument');
      return;
    }

    // 导入节点和边
    if (data.nodes && typeof data.nodes === 'object') {
      for (const [nodeId, dependencies] of Object.entries(data.nodes)) {
        this.addNode(nodeId);
        if (dependencies && typeof dependencies === 'object') {
          for (const dep of dependencies) {
            this.addDependency(nodeId, dep);
          }
        }
      }
    }

    // 导入元数据
    if (data.metadata && typeof data.metadata === 'object') {
      for (const [key, value] of Object.entries(data.metadata)) {
        this.nodeMetadata.set(key, value);
      }
    }

    // 导入统计信息
    if (data.stats) {
      this.stats = data.stats;
    }
  }
}

module.exports = DependencyGraph;