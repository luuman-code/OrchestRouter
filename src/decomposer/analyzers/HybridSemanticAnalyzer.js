/**
 * HybridSemanticAnalyzer - 混合语义分析器
 *
 * 结合算法分析器（TF-IDF + Jaccard + N-gram）和LLM增强
 * 用于处理语义分析的边界case，提高分组准确性
 */

const SemanticSimilarityAnalyzer = require('./semantic-similarity-analyzer');
const LLMClient = require('../llm/LLMClient');

class HybridSemanticAnalyzer {
  constructor(config = {}) {
    // 复用现有算法分析器
    this.algorithmAnalyzer = new SemanticSimilarityAnalyzer(config);

    // LLM配置（可选）
    this.llmClient = null;
    this.llmEnabled = config.llmEnabled || false;
    this.llmThreshold = config.llmThreshold || 0.3; // 低于此值才触发LLM
    this.maxLlmCalls = config.maxLlmCalls || 10;
    this.llmTimeout = config.llmTimeout || 5000;

    // 初始化LLM客户端
    if (this.llmEnabled) {
      if (!config.llmConfig) {
        // 有llmEnabled但无配置，应禁用
        this.llmEnabled = false;
        this.llmClient = null;
      } else {
        try {
          this.llmClient = new LLMClient({
            baseUrl: config.llmConfig.base_url,
            model: config.llmConfig.model,
            timeout: config.llmConfig.timeout
          });
        } catch (error) {
          console.warn('Failed to initialize LLM client:', error.message);
          this.llmClient = null;
          this.llmEnabled = false;
        }
      }
    }

    // 边界case缓存，避免重复LLM调用
    this.enhancementCache = new Map();

    // LLM调用计数器
    this.llmCallCount = 0;

    // 组ID计数器
    this._groupIdCounter = 0;
  }

  /**
   * 对Deliverables进行分组（主入口）
   * @param {Array} deliverables - 待分组的deliverables
   * @returns {Promise<Array>} 分组后的结果
   */
  async groupDeliverables(deliverables) {
    // 空输入保护
    if (!deliverables || !Array.isArray(deliverables) || deliverables.length === 0) {
      return [];
    }

    console.log(`[HybridSemantic] 输入 ${deliverables.length} 个 deliverables`);

    // Step 1: 算法快速分组
    const initialGroups = this.algorithmAnalyzer.groupDeliverables(deliverables);
    console.log(`[HybridSemantic] 算法分组得到 ${initialGroups.length} 个组`);

    // 转换为统一格式
    const normalizedGroups = this._normalizeGroups(initialGroups);

    // Step 2: 检测需要增强的边界case
    const boundaryCases = this.detectBoundaryCases(normalizedGroups, deliverables);
    console.log(`[HybridSemantic] 检测到 ${boundaryCases.length} 个边界case:`, boundaryCases.map(c => c.type));

    // Step 3: 仅为边界case调用LLM
    if (boundaryCases.length > 0 && this.llmEnabled && this.llmClient && this.llmCallCount < this.maxLlmCalls) {
      console.log(`[HybridSemantic] 触发 LLM 增强，共 ${boundaryCases.length} 个边界case需要处理`);
      const enhancedGroups = await this.enhanceWithLLM(normalizedGroups, boundaryCases, deliverables);
      console.log(`[HybridSemantic] LLM 增强完成，最终 ${enhancedGroups.length} 个分组`);
      return enhancedGroups;
    }

    console.log(`[HybridSemantic] 无边界case，返回 ${normalizedGroups.length} 个分组`);

    // ========== 调试日志：打印 semantic grouping 结果 ==========
    console.log('========== Semantic Grouping 调试信息 ==========');
    console.log(`[DEBUG] 总文件数: ${deliverables.length}, 总组数: ${normalizedGroups.length}`);
    for (const g of normalizedGroups) {
      const groupDeliverables = g.deliverables || [];
      console.log(`[DEBUG] 组 ${g.id}: ${groupDeliverables.length} 个文件`);
      for (const d of groupDeliverables) {
        console.log(`  - ${d.filePath || d.description || 'unknown'}`);
      }
    }
    console.log('================================================');

    return normalizedGroups;
  }

  /**
   * 标准化分组格式
   * @private
   */
  _normalizeGroups(initialGroups) {
    return initialGroups.map((group, idx) => {
      if (group && group.deliverables && Array.isArray(group.deliverables)) {
        // 已经是对象格式
        return {
          id: group.id || this._generateGroupId(),
          deliverables: group.deliverables,
          indices: group.indices || group.deliverables.map((_, i) => i)
        };
      } else if (Array.isArray(group)) {
        // 数组格式
        return {
          id: this._generateGroupId(),
          deliverables: group,
          indices: group.map((_, i) => i)
        };
      } else {
        // 单个元素
        return {
          id: this._generateGroupId(),
          deliverables: [group],
          indices: [0]
        };
      }
    });
  }

  /**
   * 生成组ID
   * @private
   */
  _generateGroupId() {
    return `hybrid_group_${Date.now()}_${++this._groupIdCounter}`;
  }

  /**
   * 检测边界case
   * @param {Array} groups - 分组结果
   * @param {Array} deliverables - 原始deliverables
   * @returns {Array} 边界case列表
   */
  detectBoundaryCases(groups, deliverables) {
    const cases = [];

    // 收集所有组间相似度用于调试
    const allSimilarities = [];

    // 场景1: 跨组相似度接近阈值 (调整区间以覆盖边界)
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const similarity = this.calculateGroupSimilarity(groups[i], groups[j]);
        allSimilarities.push({ i, j, similarity });

        // 扩展边界区间: [0.1, 0.5] 区间内都可能需要LLM判断
        // 低于0.35但高于0.1的边界区域是重点关注对象
        if (similarity >= 0.05 && similarity < 0.5) {
          const cacheKey = `merge_${i}_${j}`;
          if (!this.enhancementCache.has(cacheKey)) {
            cases.push({ type: 'merge_candidate', groupA: i, groupB: j, similarity, cacheKey });
          }
        }
      }
    }

    // 输出组间相似度调试信息
    if (allSimilarities.length > 0) {
      const sortedSims = allSimilarities.sort((a, b) => b.similarity - a.similarity);
      console.log(`[HybridSemantic] 组间相似度 (Top 5):`);
      sortedSims.slice(0, 5).forEach(s => {
        console.log(`[HybridSemantic]   组${s.i} vs 组${s.j}: ${s.similarity.toFixed(3)}`);
      });
    }

    // 场景2: 同组内描述歧义（相似名称但不同模块）
    groups.forEach((group, idx) => {
      if (group.deliverables.length > 1) {
        const hasAmbiguity = this.checkDescriptionAmbiguity(group.deliverables);
        if (hasAmbiguity) {
          const cacheKey = `split_${idx}`;
          if (!this.enhancementCache.has(cacheKey)) {
            cases.push({ type: 'split_candidate', groupIndex: idx, cacheKey });
          }
        }
      }
    });

    // 场景3: 隐式依赖候选（跨组低相似度但可能有关联）
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const similarity = this.calculateGroupSimilarity(groups[i], groups[j]);
        // 隐式依赖检测：相似度低于阈值但有关联
        if (similarity < 0.5 && similarity >= 0.05) {
          if (this.hasImplicitDependency(groups[i], groups[j])) {
            const cacheKey = `dep_${i}_${j}`;
            if (!this.enhancementCache.has(cacheKey)) {
              cases.push({ type: 'implicit_dependency', groupA: i, groupB: j, similarity, cacheKey });
            }
          }
        }
      }
    }

    return cases;
  }

  /**
   * 计算两组之间的相似度
   */
  calculateGroupSimilarity(group1, group2) {
    const keywords1 = this._extractCombinedKeywords(group1.deliverables);
    const keywords2 = this._extractCombinedKeywords(group2.deliverables);

    // 使用算法分析器的内容相似度
    if (keywords1.length > 0 && keywords2.length > 0) {
      // 直接使用Jaccard相似度，避免TF-IDF语料库未建立的问题
      const allKeywords1 = new Set(keywords1);
      const allKeywords2 = new Set(keywords2);
      const intersection = new Set([...allKeywords1].filter(x => allKeywords2.has(x)));
      const union = new Set([...allKeywords1, ...allKeywords2]);

      return intersection.size / union.size;
    }

    return 0;
  }

  /**
   * 提取组合关键词
   * @private
   */
  _extractCombinedKeywords(deliverables) {
    const allKeywords = [];
    deliverables.forEach(d => {
      const content = d.content || d.description || '';
      allKeywords.push(...this.algorithmAnalyzer.extractKeywords(content));
    });
    return [...new Set(allKeywords)];
  }

  /**
   * 检查描述歧义
   * 检测同组内是否存在相似名称但不同模块的情况
   */
  checkDescriptionAmbiguity(deliverables) {
    if (deliverables.length < 2) return false;

    // 检查是否有相似的名称但不同的路径
    const names = deliverables.map(d => this._normalizeDescription(d.content || d.description || ''));
    const paths = deliverables.map(d => d.filePath || '');

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        // 名称相似（简单词匹配）
        const nameSimilarity = this._simpleNameSimilarity(names[i], names[j]);
        // 路径不同
        const pathDifferent = !this._pathsOverlap(paths[i], paths[j]);

        if (nameSimilarity > 0.6 && pathDifferent) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 简单名称相似度
   * @private
   */
  _simpleNameSimilarity(name1, name2) {
    const words1 = new Set(name1.toLowerCase().split(/\s+/));
    const words2 = new Set(name2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  /**
   * 规范化描述
   * @private
   */
  _normalizeDescription(desc) {
    return desc.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ').trim();
  }

  /**
   * 检查路径是否有重叠
   * @private
   */
  _pathsOverlap(path1, path2) {
    if (!path1 || !path2) return false;
    const parts1 = path1.toLowerCase().split(/[\\/]/);
    const parts2 = path2.toLowerCase().split(/[\\/]/);

    // 排除最后一个元素（文件名）
    const dirs1 = parts1.slice(0, -1);
    const dirs2 = parts2.slice(0, -1);

    // 找到共同目录
    for (const p1 of dirs1) {
      if (dirs2.includes(p1) && p1.length > 2) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否存在隐式依赖
   */
  hasImplicitDependency(group1, group2) {
    const keywords1 = this._extractCombinedKeywords(group1.deliverables);
    const keywords2 = this._extractCombinedKeywords(group2.deliverables);

    // 隐式依赖模式检测
    const implicitPatterns = [
      // API与实现
      { pre: ['api', '接口', 'endpoint', 'route'], post: ['实现', 'logic', 'service', 'controller'] },
      // Schema与Model
      { pre: ['schema', 'interface', '定义', 'type'], post: ['model', 'entity', '数据库', 'table'] },
      // 配置与使用
      { pre: ['config', '配置', 'env', '环境'], post: ['使用', 'use', 'import', 'require'] },
      // 测试与被测
      { pre: ['test', '测试', 'spec', 'mock'], post: ['component', 'service', 'controller', 'api'] }
    ];

    const allKeywords = [...keywords1, ...keywords2];

    for (const pattern of implicitPatterns) {
      const hasPre = allKeywords.some(k => pattern.pre.some(p => k.toLowerCase().includes(p)));
      const hasPost = allKeywords.some(k => pattern.post.some(p => k.toLowerCase().includes(p)));
      if (hasPre && hasPost) {
        return true;
      }
    }

    return false;
  }

  /**
   * LLM增强推理
   * @private
   */
  async enhanceWithLLM(groups, boundaryCases, deliverables) {
    const enhancedGroups = [...groups];

    // 限制处理数量
    const casesToProcess = boundaryCases.slice(0, this.maxLlmCalls - this.llmCallCount);

    for (const caseItem of casesToProcess) {
      if (this.llmCallCount >= this.maxLlmCalls) break;

      try {
        if (caseItem.type === 'merge_candidate') {
          // 请求LLM判断是否应该合并
          console.log(`[HybridSemantic] 处理 merge_candidate: 组${caseItem.groupA} vs 组${caseItem.groupB}, 相似度=${caseItem.similarity.toFixed(3)}`);
          const shouldMerge = await this.llmJudgeMerge(
            enhancedGroups[caseItem.groupA],
            enhancedGroups[caseItem.groupB]
          );
          console.log(`[HybridSemantic] LLM判断合并: ${shouldMerge.shouldMerge}, 原因: ${shouldMerge.reason}`);

          this.enhancementCache.set(caseItem.cacheKey, { action: 'merge', result: shouldMerge });

          if (shouldMerge.shouldMerge) {
            // 执行合并
            const merged = this._mergeGroups(
              enhancedGroups[caseItem.groupA],
              enhancedGroups[caseItem.groupB],
              shouldMerge.mergedDescription
            );
            enhancedGroups[caseItem.groupA] = merged;
            enhancedGroups.splice(caseItem.groupB, 1);
            console.log(`[HybridSemantic] 已执行合并，新组包含 ${merged.deliverables.length} 个 deliverables`);
          }
        } else if (caseItem.type === 'split_candidate') {
          // 请求LLM判断是否应该拆分
          console.log(`[HybridSemantic] 处理 split_candidate: 组${caseItem.groupIndex}, 包含 ${enhancedGroups[caseItem.groupIndex].deliverables.length} 个 deliverables`);
          const splitResult = await this.llmJudgeSplit(
            enhancedGroups[caseItem.groupIndex]
          );
          console.log(`[HybridSemantic] LLM判断拆分: ${splitResult.shouldSplit}, 原因: ${splitResult.reason}`);

          this.enhancementCache.set(caseItem.cacheKey, { action: 'split', result: splitResult });

          if (splitResult.shouldSplit) {
            // 执行拆分
            const newGroups = this._splitGroup(
              enhancedGroups[caseItem.groupIndex],
              splitResult.splitGroups
            );
            enhancedGroups.splice(caseItem.groupIndex, 1, ...newGroups);
            console.log(`[HybridSemantic] 已执行拆分，生成 ${newGroups.length} 个新分组`);
          }
        } else if (caseItem.type === 'implicit_dependency') {
          // 记录隐式依赖（不需要修改分组结构）
          console.log(`[HybridSemantic] 处理 implicit_dependency: 组${caseItem.groupA} vs 组${caseItem.groupB}, 相似度=${caseItem.similarity.toFixed(3)}`);
          const depResult = await this.llmJudgeDependency(
            enhancedGroups[caseItem.groupA],
            enhancedGroups[caseItem.groupB]
          );
          console.log(`[HybridSemantic] LLM判断依赖: ${depResult.hasDependency}, 类型: ${depResult.dependencyType}`);

          this.enhancementCache.set(caseItem.cacheKey, { action: 'dependency', result: depResult });
        }
      } catch (error) {
        console.warn('LLM enhancement failed for case:', caseItem.type, error.message);
      }
    }

    return enhancedGroups;
  }

  /**
   * LLM判断是否应该合并
   * @private
   */
  async llmJudgeMerge(groupA, groupB) {
    const prompt = this._buildMergePrompt(groupA, groupB);
    const response = await this._callLLM(prompt);
    return this._parseMergeResponse(response);
  }

  /**
   * 构建合并判断Prompt
   * @private
   */
  _buildMergePrompt(groupA, groupB) {
    const descA = groupA.deliverables.map(d => d.description || d.content || '').join('; ');
    const descB = groupB.deliverables.map(d => d.description || d.content || '').join('; ');

    return `你是一个任务分解专家。判断以下两组任务是否应该合并为一组。

组A: ${descA}
组B: ${descB}

判断标准：
1. 功能相关性：两组是否属于同一模块/功能
2. 依赖关系：是否存在依赖
3. 开发效率：合并后是否便于同一人员开发

请返回JSON格式（仅返回JSON，不要其他内容）：
{"shouldMerge": true/false, "reason": "原因说明", "mergedDescription": "合并后的描述"}`;
  }

  /**
   * LLM判断是否应该拆分
   * @private
   */
  async llmJudgeSplit(group) {
    const prompt = this._buildSplitPrompt(group);
    const response = await this._callLLM(prompt);
    return this._parseSplitResponse(response);
  }

  /**
   * 构建拆分判断Prompt
   * @private
   */
  _buildSplitPrompt(group) {
    const descs = group.deliverables.map(d => d.description || d.content || '').join('; ');

    return `你是一个任务分解专家。判断以下任务组是否应该拆分为多个组。

任务组: ${descs}

判断标准：
1. 功能差异：是否包含多个独立功能
2. 模块差异：是否属于不同业务模块
3. 依赖差异：内部是否存在复杂依赖

请返回JSON格式（仅返回JSON，不要其他内容）：
{"shouldSplit": true/false, "reason": "原因说明", "splitGroups": [{"description": "组1描述", "items": [item indices]}, ...]}`;
  }

  /**
   * LLM判断隐式依赖
   * @private
   */
  async llmJudgeDependency(groupA, groupB) {
    const prompt = this._buildDependencyPrompt(groupA, groupB);
    const response = await this._callLLM(prompt);
    return this._parseDependencyResponse(response);
  }

  /**
   * 构建依赖判断Prompt
   * @private
   */
  _buildDependencyPrompt(groupA, groupB) {
    const descA = groupA.deliverables.map(d => d.description || d.content || '').join('; ');
    const descB = groupB.deliverables.map(d => d.description || d.content || '').join('; ');

    return `你是一个任务分解专家。判断以下两组任务之间是否存在依赖关系。

组A: ${descA}
组B: ${descB}

请返回JSON格式（仅返回JSON，不要其他内容）：
{"hasDependency": true/false, "dependencyType": "sequential|parallel|optional", "reason": "原因说明", "dependentGroup": "A|B"}`;
  }

  /**
   * 调用LLM
   * @private
   */
  async _callLLM(prompt) {
    if (!this.llmClient) {
      throw new Error('LLM client not initialized');
    }

    this.llmCallCount++;

    try {
      const response = await Promise.race([
        this.llmClient.chat(prompt, { timeout: this.llmTimeout }),
        this._timeoutPromise(this.llmTimeout)
      ]);
      return response;
    } catch (error) {
      this.llmCallCount--;
      throw error;
    }
  }

  /**
   * 超时Promise
   * @private
   */
  _timeoutPromise(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM request timeout')), ms)
    );
  }

  /**
   * 解析合并响应
   * @private
   */
  _parseMergeResponse(response) {
    try {
      // 尝试提取JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Failed to parse merge response:', error.message);
    }
    // 默认不合并
    return { shouldMerge: false, reason: 'Parse failed', mergedDescription: '' };
  }

  /**
   * 解析拆分响应
   * @private
   */
  _parseSplitResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Failed to parse split response:', error.message);
    }
    return { shouldSplit: false, reason: 'Parse failed', splitGroups: [] };
  }

  /**
   * 解析依赖响应
   * @private
   */
  _parseDependencyResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Failed to parse dependency response:', error.message);
    }
    return { hasDependency: false, dependencyType: 'none', reason: 'Parse failed' };
  }

  /**
   * 合并组
   * @private
   */
  _mergeGroups(groupA, groupB, mergedDescription = '') {
    const combinedDeliverables = [...groupA.deliverables, ...groupB.deliverables];
    const combinedIndices = [...groupA.indices, ...groupB.indices];

    return {
      id: groupA.id,
      deliverables: combinedDeliverables,
      indices: combinedIndices,
      mergedDescription: mergedDescription || groupA.deliverables.map(d => d.description).join('; ') + ' | ' + groupB.deliverables.map(d => d.description).join('; ')
    };
  }

  /**
   * 拆分组
   * @private
   */
  _splitGroup(group, splitGroups) {
    if (!splitGroups || splitGroups.length === 0) {
      return [group];
    }

    return splitGroups.map((sg, idx) => ({
      id: this._generateGroupId(),
      deliverables: sg.items ? group.deliverables.filter((_, i) => sg.items.includes(i)) : group.deliverables,
      indices: sg.items || group.indices,
      description: sg.description
    }));
  }

  /**
   * 获取LLM调用统计
   */
  getStats() {
    return {
      llmCallCount: this.llmCallCount,
      cacheSize: this.enhancementCache.size,
      maxLlmCalls: this.maxLlmCalls
    };
  }

  /**
   * 重置分析器状态
   */
  reset() {
    this.llmCallCount = 0;
    this.enhancementCache.clear();
    this.algorithmAnalyzer.reset();
  }

  /**
   * 检测依赖关系（兼容原有接口）
   */
  detectDependencies(deliverables) {
    return this.algorithmAnalyzer.detectDependencies(deliverables);
  }

  /**
   * 计算相似度（兼容原有接口）
   */
  calculateSimilarity(deliverable1, deliverable2) {
    return this.algorithmAnalyzer.calculateSimilarity(deliverable1, deliverable2);
  }
}

module.exports = HybridSemanticAnalyzer;
