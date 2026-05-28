/**
 * 语义相似度分析器
 *
 * 基于 TF-IDF + 余弦相似度算法进行 Deliverables 的依赖判断和分组
 * 权重：内容 50% + 类型 30% + 上下文 20%
 */

const { preprocessText, jaccardSimilarity, ngramSimilarity } = require('../utils/helpers');
const { TfidfCalculator } = require('../utils/tfidf');
const DependencyDetector = require('./DependencyDetector');
const StrongCouplingDetector = require('./StrongCouplingDetector');

// =====================================================
// 类型兼容组定义 - 只有同组类型才能基于路径依赖合并
// =====================================================
const COMPATIBLE_MERGE_TYPES = {
  'ui': ['ui', 'style', 'component'],
  'style': ['ui', 'style', 'component'],
  'component': ['ui', 'style', 'component'],
  'api': ['api', 'logic', 'backend'],
  'logic': ['logic', 'api', 'model', 'database', 'backend'],
  'model': ['model', 'logic', 'database'],
  'database': ['database', 'model'],
  'backend': ['backend', 'logic', 'api', 'database'],
  'config': ['config'],
  'routing': ['routing', 'ui', 'logic'],
  'middleware': ['middleware', 'api', 'backend', 'logic'],
  'test': ['test'],
  'documentation': ['documentation']
};

/**
 * 检查两个类型是否兼容基于路径依赖的合并
 */
const isTypeCompatibleForMerge = (type1, type2) => {
  const compatible1 = COMPATIBLE_MERGE_TYPES[type1] || [type1];
  const compatible2 = COMPATIBLE_MERGE_TYPES[type2] || [type2];
  return compatible1.includes(type2) || compatible2.includes(type1);
};

// =====================================================
// 层级模式定义 - 绝对不允许跨层合并
// =====================================================
const TIER_PATTERNS = {
  frontend: /^src\//,
  backend: /^server\//,
  config: /^(package\.json|tsconfig| vite|jest|\.eslint|\.prettier)/i
};

/**
 * 检测文件所属层级
 */
const detectTier = (filePath) => {
  if (!filePath) return 'unknown';
  for (const [tier, pattern] of Object.entries(TIER_PATTERNS)) {
    if (pattern.test(filePath)) return tier;
  }
  return 'unknown';
};

/**
 * 检查两个文件是否在同一层级
 */
const sameTier = (filePath1, filePath2) => {
  const tier1 = detectTier(filePath1);
  const tier2 = detectTier(filePath2);
  return tier1 === tier2 && tier1 !== 'unknown';
};

/**
 * SemanticSimilarityAnalyzer - 语义相似度分析器
 */
class SemanticSimilarityAnalyzer {
  constructor(config = {}) {
    this.threshold = config.mergeThreshold || 0.35;
    this.dependencyThreshold = config.dependencyThreshold || 0.2;
    this.algorithm = config.algorithm || 'tfidf_cosine';
    this.weights = config.weights || { content: 0.75, type: 0.15, context: 0.1 };
    this.stopWords = new Set([
      '的', '了', '是', '在', '和', '与', '及', '等',
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      ...(config.stopWords || [])
    ]);

    // 初始化 TF-IDF 计算器
    this.tfidfCalculator = new TfidfCalculator();

    // 词汇表和文档频率统计
    this.vocabulary = new Map();
    this.docFreq = new Map();
    // 原子计数器，确保 ID 唯一性
    this._idCounter = 0;

    // 初始化依赖检测器
    this.dependencyDetector = new DependencyDetector(config);

    // 初始化强耦合检测器
    this.strongCouplingDetector = new StrongCouplingDetector(config);
  }

  /**
   * 重置分析器状态，清理词汇表和文档频率统计
   */
  reset() {
    this.vocabulary.clear();
    this.docFreq.clear();
    this.tfidfCalculator.clear();
    this._idCounter = 0;
  }

  /**
   * 计算两个 Deliverables 的语义相似度 (0-1)
   */
  calculateSimilarity(deliverable1, deliverable2) {
    const contentSimilarity = this.contentSimilarity(deliverable1, deliverable2);
    const typeSimilarity = this.typeSimilarity(deliverable1.type, deliverable2.type);
    const contextSimilarity = this.contextSimilarity(deliverable1, deliverable2);

    const score = contentSimilarity * this.weights.content +
                  typeSimilarity * this.weights.type +
                  contextSimilarity * this.weights.context;

    return Math.min(score, 1.0);
  }

  /**
   * 内容相似度计算 - 使用 TF-IDF + 余弦相似度 + N-gram
   */
  contentSimilarity(deliverable1, deliverable2) {
    const keywords1 = this.extractKeywords(deliverable1.content || deliverable1.description || '');
    const keywords2 = this.extractKeywords(deliverable2.content || deliverable2.description || '');

    // 根据配置选择算法
    if (this.algorithm === 'tfidf_cosine') {
      const tfidfSim = this.tfidfCalculator.calculateSimilarity(keywords1, keywords2);

      // 如果 TF-IDF 相似度较低但 Jaccard 较高，取较高值
      const jaccardSim = jaccardSimilarity(keywords1, keywords2);

      // 添加 N-gram 相似度，检测短语匹配
      const ngramSim = ngramSimilarity(keywords1, keywords2, 2);

      // 综合三种相似度计算结果
      return Math.max(tfidfSim, jaccardSim, ngramSim);
    } else {
      return jaccardSimilarity(keywords1, keywords2);
    }
  }

  /**
   * 类型相似度计算 - 包含完整的类型关系网络
   */
  typeSimilarity(type1, type2) {
    // 类型关系定义
    const typeRelationships = {
      'ui': ['style', 'component'],
      'style': ['ui', 'component'],
      'logic': ['api', 'backend'],
      'api': ['logic', 'backend'],
      'test': ['all'],
      'database': ['api', 'logic', 'backend'],
      'routing': ['ui', 'logic'],
      'documentation': ['all'],
      'component': ['ui', 'style'],
      'backend': ['logic', 'api', 'database'],
      'frontend': ['ui', 'component', 'style'],
      'config': ['all'],
      'middleware': ['api', 'backend', 'logic']
    };

    if (!type1 || !type2) return 0.2;
    if (type1 === type2) return 1.0;

    // 检查是否存在类型关系
    if (typeRelationships[type1]?.includes(type2) || typeRelationships[type2]?.includes(type1)) {
      return 0.6;
    }

    // test 和 documentation 类型与所有类型都有一定的相似度
    if (type1 === 'test' || type2 === 'test' || type1 === 'documentation' || type2 === 'documentation') {
      return 0.3;
    }

    // config 类型与所有类型都有一定的相似度
    if (type1 === 'config' || type2 === 'config') {
      return 0.3;
    }

    return 0.2;
  }

  /**
   * 上下文相似度计算 - 包含路径和技术栈分析
   */
  contextSimilarity(deliverable1, deliverable2) {
    let similarity = 0;
    let factors = 0;

    // 1. 文件路径相似度分析（增强版）
    if (deliverable1.filePath && deliverable2.filePath) {
      const path1 = deliverable1.filePath.toLowerCase();
      const path2 = deliverable2.filePath.toLowerCase();

      // 如果路径互相包含，返回高相似度
      if (path1.includes(path2) || path2.includes(path1)) {
        similarity += 0.9;
      } else {
        // 计算路径共同前缀
        const pathParts1 = path1.split(/[\\/]/);
        const pathParts2 = path2.split(/[\\/]/);
        const commonPrefix = this.getCommonPathPrefix(path1, path2);

        if (commonPrefix.length > 0) {
          // 共同目录层数越多，相似度越高
          const commonDepth = commonPrefix.split(/[\\/]/).length;
          const maxDepth = Math.max(pathParts1.length, pathParts2.length);

          // 增强：3层及以上目录共有给予高权重
          if (commonDepth >= 3) {
            // 3层: 0.7, 4层: 0.8, 5层+: 0.9
            similarity += Math.min(0.9, 0.5 + commonDepth * 0.1);
          } else if (commonDepth >= 2) {
            similarity += 0.5;
          } else {
            similarity += 0.3 * (commonDepth / Math.max(maxDepth, 1));
          }
        }
      }
      factors++;
    }

    // 2. 技术栈相似度分析
    const stack1 = deliverable1.context?.techStack || [];
    const stack2 = deliverable2.context?.techStack || [];
    if (stack1.length > 0 && stack2.length > 0) {
      const commonStack = stack1.filter(s => stack2.includes(s));
      const techSimilarity = commonStack.length / Math.max(stack1.length, stack2.length);
      similarity += techSimilarity;
      factors++;
    }

    // 3. 依赖关系相似度分析
    const deps1 = deliverable1.dependencies || [];
    const deps2 = deliverable2.dependencies || [];
    if (deps1.length > 0 && deps2.length > 0) {
      const commonDeps = deps1.filter(dep => deps2.includes(dep));
      const depSimilarity = commonDeps.length / Math.max(deps1.length, deps2.length);
      similarity += depSimilarity;
      factors++;
    }

    // 如果没有足够的上下文因素，返回基础相似度
    if (factors === 0) return 0.2;

    return similarity / factors;
  }

  /**
   * 获取两个路径的共同前缀
   */
  getCommonPathPrefix(path1, path2) {
    const parts1 = path1.split(/[\\/]/);
    const parts2 = path2.split(/[\\/]/);
    const commonParts = [];

    for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
      if (parts1[i] === parts2[i]) {
        commonParts.push(parts1[i]);
      } else {
        break;
      }
    }

    return commonParts.join('/');
  }

  /**
   * 从文本中提取关键词
   */
  extractKeywords(text) {
    if (!text) return [];

    // 预处理文本，移除停用词
    const words = preprocessText(text, Array.from(this.stopWords));

    // 统计词频并添加到词汇表
    words.forEach(word => {
      if (this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.vocabulary.get(word) + 1);
      } else {
        this.vocabulary.set(word, 1);
      }

      if (this.docFreq.has(word)) {
        this.docFreq.set(word, this.docFreq.get(word) + 1);
      } else {
        this.docFreq.set(word, 1);
      }
    });

    return words;
  }

  /**
   * 对 Deliverables 进行分组
   *
   * 新的分组策略：基于路径和类型的稳定分组
   * 1. 检测强耦合组（SCC - 循环依赖）
   * 2. 检测共享文件
   * 3. 按路径和类型分组
   * 4. 合并强耦合组
   * 5. 标记共享文件
   */
  groupDeliverables(deliverables) {
    // Step 1: 检测强耦合组（SCC）
    const strongCouplingGroups = this.strongCouplingDetector.detectStrongCouplingGroups(deliverables);

    // Step 2: 检测共享文件
    const sharedFiles = this.dependencyDetector.detectSharedFiles(deliverables);
    const sharedFilePaths = new Set(sharedFiles.map(f => this._normalizePath(f.filePath)));

    // Step 3: 按路径和类型分组
    const groups = this._groupByPathAndType(deliverables, sharedFilePaths);

    // Step 4: 合并强耦合组
    const mergedGroups = this._mergeStrongCouplingGroups(groups, strongCouplingGroups);

    // Step 5: 标记共享文件
    this._markSharedFiles(mergedGroups, sharedFilePaths);

    // ========== 调试日志：打印 semantic grouping 结果 ==========
    console.log('========== Semantic Grouping 调试信息 ==========');
    console.log(`[DEBUG-Semantic] 总文件数: ${deliverables.length}, 总组数: ${mergedGroups.length}`);
    for (const g of mergedGroups) {
      const groupDeliverables = g || [];
      console.log(`[DEBUG-Semantic] 组 (${groupDeliverables.length} 个文件):`);
      for (const d of groupDeliverables) {
        console.log(`  - ${d.filePath || d.description || 'unknown'}`);
      }
    }
    console.log('================================================');

    return mergedGroups;
  }

  /**
   * 按路径和类型分组
   * @param {Array} deliverables - 待分组的 deliverables
   * @param {Set} sharedFilePaths - 共享文件路径集合
   * @returns {Array} 分组数组
   * @private
   */
  _groupByPathAndType(deliverables, sharedFilePaths) {
    // 获取依赖关系映射
    const depMap = this.dependencyDetector.detectDependencies(deliverables);

    const groups = [];
    const processed = new Set();

    for (let i = 0; i < deliverables.length; i++) {
      if (processed.has(i)) continue;

      const currentGroup = [deliverables[i]];
      processed.add(i);

      // 获取当前文件的层级和类型
      const currentTier = detectTier(deliverables[i].filePath);
      const currentType = deliverables[i].type || 'unknown';

      for (let j = i + 1; j < deliverables.length; j++) {
        if (processed.has(j)) continue;

        const filePath = deliverables[j].filePath;
        const targetTier = detectTier(filePath);
        const targetType = deliverables[j].type || 'unknown';

        // 规则1：跨层不合并（frontend vs backend）
        if (currentTier !== targetTier && currentTier !== 'unknown' && targetTier !== 'unknown') {
          continue;
        }

        // 规则2：类型不兼容不合并
        if (!isTypeCompatibleForMerge(currentType, targetType)) {
          // 但如果有依赖关系，且同层，可以合并
          const hasDependency = this._checkDependency(deliverables[i], deliverables[j], depMap);
          if (!hasDependency) {
            continue;
          }
          // 有依赖但跨类型，使用更低权重
        }

        // 规则3：路径相似度（同目录优先）
        const pathSimilarity = this._calculatePathSimilarity(
          deliverables[i].filePath,
          filePath
        );

        if (pathSimilarity >= 0.5) {
          currentGroup.push(deliverables[j]);
          processed.add(j);
        }
      }

      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 计算路径相似度
   * @param {string} path1 - 路径1
   * @param {string} path2 - 路径2
   * @returns {number} 相似度 0-1
   * @private
   */
  _calculatePathSimilarity(path1, path2) {
    if (!path1 || !path2) return 0;

    const p1 = this._normalizePath(path1);
    const p2 = this._normalizePath(path2);

    // 完全相同
    if (p1 === p2) return 1;

    // 共同前缀长度
    const prefix = this.getCommonPathPrefix(p1, p2);
    if (prefix.length === 0) return 0;

    // 相似度 = 共同前缀长度 / max(路径长度)
    const maxLen = Math.max(p1.length, p2.length);
    return prefix.length / maxLen;
  }

  /**
   * 合并强耦合组
   * @param {Array} groups - 当前分组
   * @param {Array} strongCouplingGroups - 强耦合组（SCC）
   * @returns {Array} 合并后的分组
   * @private
   */
  _mergeStrongCouplingGroups(groups, strongCouplingGroups) {
    if (strongCouplingGroups.length === 0) {
      return groups;
    }

    // 将强耦合组转换为 Set 以便快速查找
    const sccSets = strongCouplingGroups.map(scc => new Set(scc));

    // 对每个 SCC，找到它们在当前分组中的位置，并合并这些组
    for (const sccSet of sccSets) {
      const groupsToMerge = [];
      const groupsToRemove = [];

      for (let i = 0; i < groups.length; i++) {
        const groupFilePaths = new Set(
          (groups[i] || []).map(d => this._normalizePath(d.filePath))
        );

        // 检查是否有交集
        const intersection = [...sccSet].filter(p => groupFilePaths.has(p));
        if (intersection.length > 0) {
          groupsToMerge.push(...(groups[i] || []));
          groupsToRemove.push(i);
        }
      }

      // 移除被合并的组（从后往前避免索引问题）
      for (let i = groupsToRemove.length - 1; i >= 0; i--) {
        groups.splice(groupsToRemove[i], 1);
      }

      // 添加合并后的新组
      if (groupsToMerge.length > 0) {
        groups.push(groupsToMerge);
      }
    }

    return groups;
  }

  /**
   * 标记共享文件
   * @param {Array} groups - 分组
   * @param {Set} sharedFilePaths - 共享文件路径集合
   * @private
   */
  _markSharedFiles(groups, sharedFilePaths) {
    for (const group of groups) {
      for (const d of group) {
        if (sharedFilePaths.has(this._normalizePath(d.filePath))) {
          d.isShared = true;
        }
      }
    }
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

  /**
   * 检测依赖关系
   */
  detectDependencies(deliverables) {
    return this.dependencyDetector.detectDependencies(deliverables);
  }

  /**
   * 检查两个 deliverable 之间是否存在依赖关系
   */
  _checkDependency(deliverable1, deliverable2, depMap) {
    const path1 = this.dependencyDetector._normalizePath(deliverable1.filePath);
    const path2 = this.dependencyDetector._normalizePath(deliverable2.filePath);

    const deps1 = depMap.get(path1) || new Set();
    const deps2 = depMap.get(path2) || new Set();

    // 检查是否存在直接或反向依赖
    return deps1.has(path2) || deps2.has(path1);
  }
}

/**
 * SimilarityBasedGrouper - 基于相似度的分组器
 */
class SimilarityBasedGrouper {
  constructor(similarityAnalyzer, config = {}) {
    this.analyzer = similarityAnalyzer;
    this.mergeThreshold = config.mergeThreshold || 0.35;
    this.dependencyThreshold = config.dependencyThreshold || 0.2;
    this.maxGroups = config.maxGroups || 20;
    // 原子计数器，确保 ID 唯一性
    this._groupIdCounter = 0;
    // 初始化依赖检测器
    this.dependencyDetector = new DependencyDetector(config);
    // 组件消费关系映射（componentName -> [userFiles]）
    this.componentConsumption = new Map();
  }

  /**
   * 检测组件消费关系（JSX 组件使用）
   * 例如：<Header />, <ProductCard />, <CartItem />
   * @param {Array} deliverables - 待检测的 deliverables
   */
  detectComponentConsumption(deliverables) {
    this.componentConsumption = new Map();

    for (const d of deliverables) {
      const content = d.content || '';
      // 检测 JSX 组件使用：<Header />, <ProductCard />, etc.
      // 匹配模式：<ComponentName .../> 或 <ComponentName ...>
      const jsxMatches = content.match(/<([A-Z][a-zA-Z]*)\s*[^>]*>/g) || [];

      for (const match of jsxMatches) {
        // 提取组件名（去掉 < 和 > 以及属性部分）
        const componentName = match.replace(/^</, '').replace(/\s*[^>]*>$/, '').trim();
        if (!componentName) continue;

        if (!this.componentConsumption.has(componentName)) {
          this.componentConsumption.set(componentName, []);
        }
        this.componentConsumption.get(componentName).push(d.filePath);
      }
    }

    // 调试：输出检测到的组件使用关系
    if (this.componentConsumption.size > 0) {
      console.log(`[detectComponentConsumption] 检测到 ${this.componentConsumption.size} 个组件被使用`);
      for (const [component, users] of this.componentConsumption) {
        console.log(`  ${component}: ${users.length} 个文件使用`);
      }
    }
  }

  /**
   * 对已标注类型的 Deliverables 进行分组
   */
  groupDeliverables(taggedDeliverables) {
    const groups = [];
    const processed = new Set();
    const thresholds = this.getDynamicThresholds(taggedDeliverables.length);

    // 检测组件消费关系（JSX 组件使用）
    this.detectComponentConsumption(taggedDeliverables);

    // 获取依赖关系映射
    const depMap = this.dependencyDetector ?
      this.dependencyDetector.detectDependencies(taggedDeliverables) : new Map();

    for (let i = 0; i < taggedDeliverables.length; i++) {
      if (processed.has(i)) continue;

      const group = {
        id: this.generateGroupId(),
        deliverables: [taggedDeliverables[i]],
        indices: [i],
        centroid: taggedDeliverables[i].content || taggedDeliverables[i].description
      };

      for (let j = i + 1; j < taggedDeliverables.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.analyzer.calculateSimilarity(taggedDeliverables[i], taggedDeliverables[j]);
        const hasDependency = this._checkDependency(taggedDeliverables[i], taggedDeliverables[j], depMap);

        // 使用类型兼容和层级隔离的智能合并策略
        if (this.shouldMerge(taggedDeliverables[i], taggedDeliverables[j], similarity, hasDependency, thresholds)) {
          group.deliverables.push(taggedDeliverables[j]);
          group.indices.push(j);
          group.centroid = this.updateCentroid(group.deliverables);
          processed.add(j);
        }
      }

      groups.push(group);
      processed.add(i);

      if (groups.length >= this.maxGroups) break;
    }

    return groups;
  }

  /**
   * 检查两个 deliverable 之间是否存在依赖关系
   */
  _checkDependency(deliverable1, deliverable2, depMap) {
    const path1 = this.dependencyDetector._normalizePath(deliverable1.filePath);
    const path2 = this.dependencyDetector._normalizePath(deliverable2.filePath);

    const deps1 = depMap.get(path1) || new Set();
    const deps2 = depMap.get(path2) || new Set();

    // 检查是否存在直接或反向依赖
    return deps1.has(path2) || deps2.has(path1);
  }

  /**
   * 智能合并判断 - 基于类型兼容和层级隔离
   *
   * 合并规则：
   * 1. 相似度足够高，直接合并
   * 2. 有依赖但类型不兼容，不合并
   * 3. 有依赖但跨层级，不合并
   * 4. 有依赖、类型兼容且同层，合并
   */
  shouldMerge(item1, item2, similarity, hasDependency, thresholds) {
    // 规则1: 相似度足够高，直接合并
    if (similarity >= thresholds.merge) {
      return true;
    }

    // 规则X: 如果有明确的 dependsOn 声明，优先合并（同层兼容）
    if (this._hasExplicitDependency(item1, item2)) {
      const path1 = item1.filePath || '';
      const path2 = item2.filePath || '';
      if (sameTier(path1, path2) && isTypeCompatibleForMerge(item1.type || 'unknown', item2.type || 'unknown')) {
        return true;
      }
    }

    // 规则2: 组件消费关系检测 - 如果 item1 使用 item2 提供的组件，必须合并
    if (this.componentConsumption && this.componentConsumption.size > 0) {
      if (this._checkComponentConsumption(item1, item2)) {
        return true;
      }
    }

    // 如果没有依赖，基于相似度判断（但使用更高阈值）
    if (!hasDependency) {
      return false;
    }

    // 获取文件路径
    const path1 = item1.filePath || '';
    const path2 = item2.filePath || '';

    // 规则3: 跨层级依赖不合并（即使是同目录）
    if (!sameTier(path1, path2)) {
      return false;
    }

    // 获取类型
    const type1 = item1.type || 'unknown';
    const type2 = item2.type || 'unknown';

    // 规则4: 类型不兼容不合并
    if (!isTypeCompatibleForMerge(type1, type2)) {
      return false;
    }

    // 规则5: 满足所有条件，合并
    return true;
  }

  /**
   * 检查是否有显式的 dependsOn 依赖
   * @param {Object} item1 - 交付物1
   * @param {Object} item2 - 交付物2
   * @returns {boolean} 是否有显式依赖
   * @private
   */
  _hasExplicitDependency(item1, item2) {
    const deps1 = item1.integrationHints?.dependsOn || [];
    const deps2 = item2.integrationHints?.dependsOn || [];

    const path1 = this.dependencyDetector?._normalizePath(item1.filePath) || '';
    const path2 = this.dependencyDetector?._normalizePath(item2.filePath) || '';

    const normalizePath = (p) => p.replace(/\\/g, '/').toLowerCase();

    return deps1.some(d => normalizePath(d) === path2) ||
           deps2.some(d => normalizePath(d) === path1);
  }

  /**
   * 检查组件消费关系
   * 如果 item1 使用了 item2 提供的组件，或者相反，必须合并
   * @param {Object} item1 - 交付物1
   * @param {Object} item2 - 交付物2
   * @returns {boolean} 是否存在组件消费关系
   * @private
   */
  _checkComponentConsumption(item1, item2) {
    const path1 = item1.filePath || '';
    const path2 = item2.filePath || '';

    // 从文件路径提取组件名（如 Header.tsx -> Header）
    const extractComponentName = (filePath) => {
      if (!filePath) return null;
      const match = filePath.match(/([A-Z][a-zA-Z]*)\.(tsx|jsx|ts|js)$/);
      return match ? match[1] : null;
    };

    const component1 = extractComponentName(path1);
    const component2 = extractComponentName(path2);

    // 检查 item1 是否使用 item2 提供的组件
    if (component2) {
      const usersOf2 = this.componentConsumption.get(component2) || [];
      if (usersOf2.includes(path1)) {
        console.log(`[_checkComponentConsumption] ${path1} 使用了 ${component2} 组件（由 ${path2} 提供），需要合并`);
        return true;
      }
    }

    // 检查 item2 是否使用 item1 提供的组件
    if (component1) {
      const usersOf1 = this.componentConsumption.get(component1) || [];
      if (usersOf1.includes(path2)) {
        console.log(`[_checkComponentConsumption] ${path2} 使用了 ${component1} 组件（由 ${path1} 提供），需要合并`);
        return true;
      }
    }

    return false;
  }

  /**
   * 构建组间依赖关系
   */
  buildDependencies(groups) {
    const dependencies = [];

    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups.length; j++) {
        if (i === j) continue;

        const similarity = this.calculateGroupSimilarity(groups[i], groups[j]);

        if (similarity < this.dependencyThreshold) {
          // 低相似度但可能存在概念依赖
          if (this.hasConceptualDependency(groups[i], groups[j])) {
            dependencies.push({
              from: groups[j].id,
              to: groups[i].id,
              strength: 1 - similarity,
              type: 'conceptual'
            });
          }
        } else if (similarity >= this.dependencyThreshold && similarity < this.mergeThreshold) {
          // 中等相似度可能存在弱依赖
          if (this.hasWeakDependency(groups[i], groups[j])) {
            dependencies.push({
              from: groups[j].id,
              to: groups[i].id,
              strength: similarity,
              type: 'weak'
            });
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * 检查概念依赖
   */
  hasConceptualDependency(group1, group2) {
    const group1Keywords = this.extractCombinedKeywords(group1.deliverables);
    const group2Keywords = this.extractCombinedKeywords(group2.deliverables);

    // API/后端 与 接口定义/schema
    if (group1Keywords.some(k => /api|后端|backend/.test(k)) &&
        group2Keywords.some(k => /接口定义|interface|schema/.test(k))) return true;

    // 组件 与 样式
    if (group1Keywords.some(k => /组件|component/.test(k)) &&
        group2Keywords.some(k => /样式|style|css/.test(k))) return true;

    // 逻辑/业务 与 API/接口
    if (group1Keywords.some(k => /逻辑|logic|业务/.test(k)) &&
        group2Keywords.some(k => /api|接口|后端/.test(k))) return true;

    // 测试 与其他所有
    if (group1Keywords.some(k => /测试|test|spec/.test(k))) return true;
    if (group2Keywords.some(k => /测试|test|spec/.test(k))) return true;

    return false;
  }

  /**
   * 检查弱依赖
   */
  hasWeakDependency(group1, group2) {
    const group1Types = new Set(group1.deliverables.map(d => d.type));
    const group2Types = new Set(group2.deliverables.map(d => d.type));

    // 如果任一组包含测试类型，则存在弱依赖
    if (group1Types.has('test') || group2Types.has('test')) return true;

    return false;
  }

  /**
   * 提取组合关键词
   */
  extractCombinedKeywords(deliverables) {
    const allKeywords = [];
    deliverables.forEach(d => {
      const content = d.content || d.description || '';
      allKeywords.push(...this.analyzer.extractKeywords(content));
    });
    return [...new Set(allKeywords)];
  }

  /**
   * 计算组间相似度
   */
  calculateGroupSimilarity(group1, group2) {
    const keywords1 = this.extractCombinedKeywords(group1.deliverables);
    const keywords2 = this.extractCombinedKeywords(group2.deliverables);
    const commonKeywords = keywords1.filter(k => keywords2.includes(k));
    const totalKeywords = [...new Set([...keywords1, ...keywords2])];

    if (totalKeywords.length === 0) return 0;

    return commonKeywords.length / totalKeywords.length;
  }

  /**
   * 更新组中心
   */
  updateCentroid(deliverables) {
    return deliverables.map(d => d.content || d.description).join(' ');
  }

  /**
   * 生成组 ID - 使用原子计数器确保唯一性
   */
  generateGroupId() {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${++this._groupIdCounter}`;
  }

  /**
   * 获取动态阈值
   */
  getDynamicThresholds(count) {
    // 根据交付物数量动态调整阈值
    if (count > 15) {
      // 大量交付物时降低阈值，允许更多分组
      return {
        merge: this.mergeThreshold - 0.05,
        dependency: this.dependencyThreshold - 0.05
      };
    }
    // 始终使用基础阈值，避免阈值过高导致的合并困难
    return {
      merge: this.mergeThreshold,
      dependency: this.dependencyThreshold
    };
  }
}

/**
 * SemanticMergedSubtask - 语义合并的子任务结构
 */
class SemanticMergedSubtask {
  constructor(group, dependencies = []) {
    this.id = group.id;
    this.deliverables = group.deliverables;
    this.primaryType = this.selectPrimaryType(group.deliverables);
    this.internalOrder = this.calculateInternalOrder(group.deliverables);
    this.dependencies = dependencies;
    this.canParallel = dependencies.length === 0;
  }

  /**
   * 选择主类型 - 基于类型优先级和数量
   */
  selectPrimaryType(deliverables) {
    const typePriority = {
      'api': 5,
      'logic': 4,
      'ui': 3,
      'style': 2,
      'test': 1,
      'config': 0,
      'database': 4,
      'routing': 3,
      'documentation': 1,
      'component': 3,
      'backend': 4,
      'frontend': 3,
      'middleware': 4
    };

    const typeCounts = {};
    deliverables.forEach(d => {
      const type = d.type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    let maxCount = 0;
    let primaryType = 'unknown';

    Object.entries(typeCounts).forEach(([type, count]) => {
      const priority = typePriority[type] || 0;
      const primaryPriority = typePriority[primaryType] || 0;

      if (count > maxCount || (count === maxCount && priority > primaryPriority)) {
        maxCount = count;
        primaryType = type;
      }
    });

    return primaryType;
  }

  /**
   * 计算内部顺序 - 基于概念依赖关系
   */
  calculateInternalOrder(deliverables) {
    const ordered = [];
    const processed = new Set();

    // 1. 接口定义优先（schema、interface）
    const interfaces = deliverables.filter(d =>
      /接口定义|interface|schema|type|definition/.test(d.content || d.description)
    );
    ordered.push(...interfaces);
    interfaces.forEach(d => processed.add(d));

    // 2. 样式文件（CSS、SCSS）
    const styles = deliverables.filter(d =>
      !processed.has(d) && /样式|style|css|scss|less/.test(d.content || d.description)
    );
    ordered.push(...styles);
    styles.forEach(d => processed.add(d));

    // 3. 组件（component、页面）
    const components = deliverables.filter(d =>
      !processed.has(d) && /组件|component|页面|view|ui/.test(d.content || d.description)
    );
    ordered.push(...components);
    components.forEach(d => processed.add(d));

    // 4. 实现逻辑（logic、api、业务）
    const implementations = deliverables.filter(d =>
      !processed.has(d) && /实现|逻辑|logic|api|业务|business|service/.test(d.content || d.description)
    );
    ordered.push(...implementations);
    implementations.forEach(d => processed.add(d));

    // 5. 测试文件
    const tests = deliverables.filter(d =>
      !processed.has(d) && /测试|test|spec|mock/.test(d.content || d.description)
    );
    ordered.push(...tests);
    tests.forEach(d => processed.add(d));

    // 6. 配置和文档
    const others = deliverables.filter(d => !processed.has(d));
    ordered.push(...others);

    return ordered;
  }

  /**
   * 获取合并后的描述
   */
  getMergedDescription() {
    return this.deliverables.map(d => d.description).join('; ');
  }

  /**
   * 获取所有依赖 ID
   */
  getDependencyIds() {
    return this.dependencies.map(d => d.id || d);
  }
}

module.exports = SemanticSimilarityAnalyzer;
module.exports.SimilarityBasedGrouper = SimilarityBasedGrouper;
module.exports.SemanticMergedSubtask = SemanticMergedSubtask;
