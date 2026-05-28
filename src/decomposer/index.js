/**
 * 弹性分解器主类
 *
 * 根据 V4 实现计划，这是分解器的主要入口点
 * 负责协调所有功能块的工作流程
 */

const TaskParser = require('./utils/TaskParser');
const TypeAnnotator = require('./types/TypeAnnotator');
const SemanticSimilarityAnalyzer = require('./analyzers/semantic-similarity-analyzer');
const { SimilarityBasedGrouper } = require('./analyzers/semantic-similarity-analyzer');
const HybridSemanticAnalyzer = require('./analyzers/HybridSemanticAnalyzer');
const PluginManager = require('./plugins/PluginManager');
const PromptGenerator = require('./utils/PromptGenerator');
const ConflictResolver = require('./utils/ConflictResolver');
const DebugInfoManager = require('./utils/DebugInfoManager');
const config = require('./config');

class ElasticDecomposer {
  constructor(userConfig = {}) {
    // 合并用户配置和默认配置
    this.config = {
      ...config,
      ...userConfig
    };

    // 初始化各功能块实例
    this.taskParser = new TaskParser();

    // 功能块 B: 配置与插件层 - 为类型标注器提供插件管理器
    this.pluginManager = new PluginManager(this.config);

    // 从配置中获取 LLM 设置
    const llmConfig = {};
    if (this.config.llm && this.config.llm.enabled) {
      llmConfig.llmBaseUrl = this.config.llm.base_url;
      llmConfig.model = this.config.llm.model;
      llmConfig.timeout = this.config.llm.timeout;
      llmConfig.retryAttempts = this.config.llm.retry_attempts;
      llmConfig.temperature = this.config.llm.temperature;
      llmConfig.maxConcurrency = this.config.llm.max_concurrency;
    }

    this.typeAnnotator = new TypeAnnotator({
      ...this.config,
      ...llmConfig,
      pluginManager: this.pluginManager
    });

    this.semanticAnalyzer = new SemanticSimilarityAnalyzer(this.config);
    this.semanticGrouper = new SimilarityBasedGrouper(this.semanticAnalyzer, this.config);

    // 混合语义分析器（可选，用于边界case增强）
    const hybridConfig = this.config.hybrid_semantic || {};
    this.hybridSemanticAnalyzer = null;
    if (hybridConfig.enabled) {
      this.hybridSemanticAnalyzer = new HybridSemanticAnalyzer({
        ...this.config,
        llmEnabled: this.config.llm?.enabled && hybridConfig.llm_enabled !== false,
        llmThreshold: hybridConfig.llm_threshold || 0.3,
        maxLlmCalls: hybridConfig.max_llm_calls || 10,
        llmConfig: this.config.llm,
        llmTimeout: this.config.llm?.timeout || 5000
      });
    }

    this.promptGenerator = new PromptGenerator(this.config);
    this.conflictResolver = new ConflictResolver(this.config);

    // 功能块 G: 调试与监控层
    this.debugManager = new DebugInfoManager(this.config);

    this.initialize();
  }

  initialize() {
    // 初始化各功能模块
    console.log('初始化弹性分解器...');
  }

  /**
   * 主分解方法
   * @param {Object} task - 待分解的任务对象
   * @returns {Object} 包含分解后的子任务列表和元数据的完整结果对象
   */
  async decompose(task) {
    // 实现任务分解的核心流程
    console.log('开始任务分解:', task.title);

    // 提取实现计划信息
    const implementationPlan = task.backgroundInfo?.implementationPlan || null;

    // 初始化结果对象
    const result = {
      originalContent: task,
      implementationPlan: implementationPlan, // Store the implementation plan in result
      subtasks: [],
      metadata: {
        processingTime: 0,
        errorCount: 0,
        warnings: [],
        debugInfo: {},
        groupingInfo: null,
        integrationMetadata: {
          fileMappings: {},
          mergeGroups: {},
          dependencyGraph: [],
          regionSpecs: {}
        }
      }
    };

    // 开始性能计时
    const startTime = Date.now();
    this.debugManager.startTiming();

    try {
      // 步骤 1: 解析任务 (功能块 A: 任务解析层)
      const step1Start = Date.now();
      const parsedTask = this.parseTask(task);
      const parsingTime = Date.now() - step1Start;
      this.debugManager.recordPerformance('taskParsing', parsingTime, { step: 'step1' });

      // 记录解析任务的详细信息
      if (this.debugManager.enabled) {
        this.debugManager.record({
          type: 'taskParsed',
          originalTask: task,
          parsedTask: parsedTask,
          duration: parsingTime
        }, { stage: 'parsing' });
      }

      // 步骤 1.5: 注入预生成的内容（类型、Mock 等）
      // implementationPlan 通过 task.backgroundInfo.implementationPlan 传递
      const implementationPlan = task.backgroundInfo?.implementationPlan || null;
      if (implementationPlan) {
        parsedTask.deliverables = this._injectGeneratedContent(
          implementationPlan,
          parsedTask.deliverables
        );
      }

      // 步骤 2: 加载插件 (功能块 B: 配置与插件层)
      const step2Start = Date.now();
      await this.loadPlugins();
      const pluginLoadTime = Date.now() - step2Start;
      this.debugManager.recordPerformance('pluginLoading', pluginLoadTime, { step: 'step2' });

      // 步骤 3: 类型标注 (功能块 C: 类型标注层)
      const step3Start = Date.now();
      const annotatedDeliverables = await this.annotateTypes(parsedTask.deliverables);
      const annotationTime = Date.now() - step3Start;
      this.debugManager.recordPerformance('typeAnnotation', annotationTime, { step: 'step3', count: annotatedDeliverables.length });

      // 记录类型检测信息
      if (this.debugManager.enabled) {
        annotatedDeliverables.forEach(item => {
          // 使用 types 数组，提取主类型
          const types = item.types || [];
          const primaryType = types.length > 0 ? types[0].type : 'unknown';
          const primaryConfidence = types.length > 0 ? types[0].confidence : 0;
          this.debugManager.recordTypeDetection(
            item.description || item.content,
            primaryType,
            primaryConfidence,
            [{ type: 'rule_based', rule: 'keyword_matching' }]
          );
        });
      }

      // 步骤 4: 语义分组 (功能块 D: 语义分组层)
      const step4Start = Date.now();
      const groupedDeliverables = await this.groupSemantically(annotatedDeliverables);
      const groupingTime = Date.now() - step4Start;
      this.debugManager.recordPerformance('semanticGrouping', groupingTime, { step: 'step4', originalCount: annotatedDeliverables.length, groupedCount: groupedDeliverables.length });

      // 步骤 4.5: 冲突敏感文件合并 (功能块 D.5: 强制合并冲突敏感文件)
      // 根据 implementation_plan.conflict_sensitive_groups，强制将指定的文件合并到同一个子任务
      const step45Start = Date.now();
      const mergedGroupedDeliverables = this.mergeConflictSensitiveGroups(groupedDeliverables, implementationPlan);
      const mergeConflictTime = Date.now() - step45Start;
      if (mergedGroupedDeliverables !== groupedDeliverables) {
        console.log(`[冲突敏感文件合并] 合并后组数: ${mergedGroupedDeliverables.length} (原: ${groupedDeliverables.length})`);
        this.debugManager.recordPerformance('conflictSensitiveMerge', mergeConflictTime, {
          step: 'step4.5',
          originalGroupCount: groupedDeliverables.length,
          mergedGroupCount: mergedGroupedDeliverables.length
        });
      }

      // 记录语义分析信息
      if (this.debugManager.enabled) {
        // 处理 groupedDeliverables 可能是对象数组 ({id, deliverables, ...}) 或数组的数组
        const groupsInfo = groupedDeliverables.map((group, idx) => {
          // 如果是对象且有 deliverables 属性
          if (group && group.deliverables && Array.isArray(group.deliverables)) {
            // 提取所有 types 数组中的主类型
            const allTypes = group.deliverables.flatMap(item => {
              const types = item.types || [];
              return types.length > 0 ? types.map(t => t.type) : [];
            });
            return {
              id: group.id || idx,
              size: group.deliverables.length,
              types: [...new Set(allTypes)]
            };
          }
          // 如果直接是数组
          if (Array.isArray(group)) {
            const allTypes = group.flatMap(item => {
              const types = item.types || [];
              return types.length > 0 ? types.map(t => t.type) : [];
            });
            return {
              id: idx,
              size: group.length,
              types: [...new Set(allTypes)]
            };
          }
          // 默认情况
          return {
            id: idx,
            size: 1,
            types: [group?.type || 'unknown']
          };
        });

        this.debugManager.record({
          type: 'semanticGroupingResult',
          originalCount: annotatedDeliverables.length,
          groupCount: groupsInfo.length,
          groups: groupsInfo,
          duration: groupingTime
        }, { stage: 'semanticGrouping' });

        result.metadata.groupingInfo = {
          groupsCount: groupsInfo.length,
          originalDeliverablesCount: annotatedDeliverables.length,
          groups: groupsInfo
        };
      }

      // 步骤 5: Prompt 生成 (功能块 E: Prompt 生成层)
      const step5Start = Date.now();
      const subTasks = this.generatePrompts(mergedGroupedDeliverables, parsedTask, implementationPlan);
      const promptGenTime = Date.now() - step5Start;
      this.debugManager.recordPerformance('promptGeneration', promptGenTime, { step: 'step5', count: subTasks.length });

      // 记录模板使用统计
      if (this.debugManager.enabled) {
        subTasks.forEach(task => {
          if (task.templateUsed) {
            this.debugManager.incrementStat('templatesUsed', { [task.templateUsed]: 1 });
          }
        });

        this.debugManager.record({
          type: 'promptGenerationResult',
          taskCount: subTasks.length,
          duration: promptGenTime
        }, { stage: 'promptGeneration' });
      }

      // 步骤 6: 冲突解决 (功能块 F: 冲突解决层) - 使用增强版本
      const step6Start = Date.now();
      const conflictResult = this.resolveConflictsWithHints(subTasks);
      const resolvedTasks = conflictResult.finalSubtasks;

      // 保留多标签类型信息 - 将annotatedDeliverables的types字段复制到resolvedTasks
      if (annotatedDeliverables && resolvedTasks) {
        const typeMap = new Map();
        annotatedDeliverables.forEach((item) => {
          if (item.types) {
            // 使用 description 或 filePath 作为 key，保持与 resolvedTasks 查询一致
            const key = item.description || item.filePath;
            if (key) {
              typeMap.set(key, item.types);
            }
          }
        });
        // 将types字段添加到resolvedTasks中
        resolvedTasks.forEach(task => {
          const key = task.description || task.filePath;
          if (key && typeMap.has(key)) {
            task.types = typeMap.get(key);
          }
        });
      }

      const conflictResTime = Date.now() - step6Start;

      this.debugManager.recordPerformance('conflictResolution', conflictResTime, {
        step: 'step6',
        originalCount: subTasks.length,
        resolvedCount: resolvedTasks.length,
        conflictsResolved: conflictResult.conflictsResolved
      });
      this.debugManager.incrementStat('conflictsResolved', conflictResult.conflictsResolved || 0);

      // 更新整合器元数据
      result.metadata.integrationMetadata = conflictResult.integrationMetadata || result.metadata.integrationMetadata;

      // 记录冲突解决信息
      if (this.debugManager.enabled) {
        if (conflictResult.conflictsResolved > 0) {
          result.metadata.warnings.push({
            type: 'conflicts_resolved',
            count: conflictResult.conflictsResolved,
            strategies: Array.isArray(conflictResult.strategyUsed) ? conflictResult.strategyUsed : [conflictResult.strategyUsed],
            message: `Resolved ${conflictResult.conflictsResolved} file path conflicts`
          });
          this.debugManager.recordConflictResolution(
            { originalCount: subTasks.length, resolvedCount: resolvedTasks.length },
            { strategyApplied: conflictResult.strategyUsed, finalCount: resolvedTasks.length }
          );
        }
      }

      // 步骤 7: 调试与监控 (功能块 G: 调试与监控层)
      this.logDebugInfo(resolvedTasks);

      // 记录完整任务处理流程
      if (this.debugManager.enabled) {
        this.debugManager.recordTaskProcessing(task, resolvedTasks, {
          processingTime: Date.now() - startTime,
          stagesTiming: {
            parsing: parsingTime,
            pluginLoading: pluginLoadTime,
            annotation: annotationTime,
            grouping: groupingTime,
            promptGen: promptGenTime,
            conflictRes: conflictResTime
          },
          integrationMetadata: result.metadata.integrationMetadata
        });
      }

      // 在成功处理后设置最终结果
      result.subtasks = resolvedTasks;
    } catch (error) {
      result.metadata.errorCount++;
      result.metadata.warnings.push({
        type: 'decomposition_error',
        error: error.message,
        stage: 'overall'
      });
      console.error('分解过程中发生错误:', error);
    }

    // 结束性能计时
    const totalTime = Date.now() - startTime;
    result.metadata.processingTime = totalTime;
    this.debugManager.recordPerformance('totalExecution', totalTime, { tasksGenerated: result.subtasks.length });

    return result;
  }

  parseTask(task) {
    // 功能块 A: 任务解析层的实现
    console.log('执行任务解析...');
    return this.taskParser.parse(task);
  }

  async loadPlugins() {
    // 功能块 B: 配置与插件层的实现
    console.log('加载插件...');
    await this.pluginManager.initialize();
  }

  async annotateTypes(deliverables) {
    // 功能块 C: 类型标注层的实现
    console.log('执行类型标注...');
    return await this.typeAnnotator.annotateMultiple(deliverables);
  }

  groupSemantically(deliverables) {
    // 功能块 D: 语义分组层的实现 - 使用 SimilarityBasedGrouper
    console.log('执行语义分组...');

    // 如果启用了混合语义分析器，使用它处理边界case
    if (this.hybridSemanticAnalyzer) {
      console.log('使用混合语义分析器增强边界case处理...');
      return this.hybridSemanticAnalyzer.groupDeliverables(deliverables).then(groups => {
        // 混合分析器已返回分组结果，转换为标准格式
        return groups.map(group => ({
          id: group.id,
          deliverables: group.deliverables,
          indices: group.indices || group.deliverables.map((_, i) => i)
        }));
      });
    }

    return this.semanticGrouper.groupDeliverables(deliverables);
  }

  /**
   * 注入预生成的内容到 deliverables
   * 将契约、类型、Mock 的 content 注入到对应的 deliverable
   * @param {Object} implementationPlan - 实现计划
   * @param {Array} deliverables - 交付物数组
   * @returns {Array} 注入后的 deliverables
   */
  _injectGeneratedContent(implementationPlan, deliverables) {
    console.log('[Decomposer] _injectGeneratedContent 被调用');
    console.log('[Decomposer] implementationPlan 存在:', !!implementationPlan);
    console.log('[Decomposer] implementationPlan._typesDeliverableContent 存在:', !!(implementationPlan?._typesDeliverableContent));
    console.log('[Decomposer] implementationPlan.generated_mocks 存在:', !!(implementationPlan?.generated_mocks));
    console.log('[Decomposer] deliverables 是数组:', Array.isArray(deliverables));
    console.log('[Decomposer] deliverables 长度:', Array.isArray(deliverables) ? deliverables.length : 'N/A');

    if (!implementationPlan || !Array.isArray(deliverables)) {
      return deliverables;
    }

    console.log('[Decomposer] 开始注入预生成内容到 deliverables');

    const result = deliverables.map(d => {
      // 跳过没有 filePath 的 deliverable
      if (!d.filePath) return d;

      const normalizedPath = d.filePath.replace(/\\/g, '/');

      // 注意：契约文件（contracts/api.json）不再通过这里注入，
      // 而是通过 formatForToolCalls 的 result.openapi_spec 处理

      // 1. 注入类型文件 content
      // 注意：如果 types/index.ts 在 deliverables 中，注入的 content 会被执行器用作 prompt
      // 契约优先模式下，types 应通过 formatForToolCalls 的 result.typesContent 处理
      if (normalizedPath.endsWith('types/index.ts') || normalizedPath.endsWith('types/index.tsx')) {
        const content = implementationPlan._typesDeliverableContent ||
                        implementationPlan.generated_types ||
                        implementationPlan.auto_generated_types ||
                        implementationPlan.shared_context?.type_source_content;
        if (content) {
          console.log('[Decomposer] 注入类型 content 到:', d.filePath);
          return { ...d, content, type: d.type || 'types' };
        }
      }

      // 2. 注入 Mock 文件 content
      if (implementationPlan.mock_service_layer && implementationPlan.generated_mocks) {
        if (normalizedPath.endsWith('mocks/api.ts')) {
          return { ...d, content: implementationPlan.generated_mocks.apiClient, type: 'mock' };
        }
        if (normalizedPath.endsWith('mocks/data.ts')) {
          return { ...d, content: implementationPlan.generated_mocks.data, type: 'mock' };
        }
        if (normalizedPath.endsWith('mocks/handlers.ts')) {
          return { ...d, content: implementationPlan.generated_mocks.handlers, type: 'mock' };
        }
      }

      return d;
    });

    return result;
  }

  /**
   * 合并冲突敏感的文件组
   * 根据 implementation_plan.conflict_sensitive_groups，将指定的文件强制合并到同一个子任务
   *
   * @param {Array} groupedDeliverables - 语义分组后的 deliverables
   * @param {Object} implementationPlan - 实现计划
   * @returns {Array} 合并后的分组
   */
  mergeConflictSensitiveGroups(groupedDeliverables, implementationPlan) {
    // 【默认单文件任务】只有明确启用合并策略时才进行文件合并
    // 配置优先级：implementationPlan > this.config
    // 注意：this.config 在 OrchestratorServer 中已经包含了展开的 decomposer 配置
    const enableMergeStrategy =
      implementationPlan?.enable_merge_strategy ||
      implementationPlan?.decomposer?.enable_merge_strategy ||
      this.config?.enable_merge_strategy;

    // 【调试日志】检查配置传递
    console.log('[mergeConflictSensitiveGroups] 配置检查:');
    console.log('  - implementationPlan.enable_merge_strategy:', implementationPlan?.enable_merge_strategy);
    console.log('  - this.config.enable_merge_strategy:', this.config?.enable_merge_strategy);
    console.log('  - 最终 enableMergeStrategy:', enableMergeStrategy);

    // 【默认行为】如果不启用合并策略，每个 deliverable 单独生成一个子任务
    if (!enableMergeStrategy) {
      console.log('[mergeConflictSensitiveGroups] 默认单文件任务模式：每个 deliverable 单独生成一个子任务');

      // 将分组标准化为对象数组格式
      const normalizedGroups = this._normalizeGroups(groupedDeliverables);

      // 将每个 deliverable 转换为一个独立的组
      const singleFileGroups = [];
      for (const group of normalizedGroups) {
        for (const deliverable of (group.deliverables || [])) {
          singleFileGroups.push({
            id: `single_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            deliverables: [deliverable],
            description: `单文件组: ${deliverable.filePath || deliverable.description || 'unnamed'}`,
            priority: 0,
            forceSingleFile: true
          });
        }
      }

      console.log(`[mergeConflictSensitiveGroups] 单文件模式：${singleFileGroups.length} 个独立组（原: ${normalizedGroups.length} 个语义组）`);
      return singleFileGroups;
    }

    // 【启用合并策略】只有明确配置 enable_merge_strategy: true 时才执行合并逻辑
    // 检查是否配置了冲突敏感文件组
    if (!implementationPlan || !implementationPlan.conflict_sensitive_groups || !Array.isArray(implementationPlan.conflict_sensitive_groups)) {
      console.log('[mergeConflictSensitiveGroups] 启用了合并策略但未配置 conflict_sensitive_groups，返回语义分组');
      return groupedDeliverables;
    }

    const conflictGroups = implementationPlan.conflict_sensitive_groups;
    if (conflictGroups.length === 0) {
      return groupedDeliverables;
    }

    // 【模型能力检测】检查当前模型是否支持多 tool_call
    const modelCapabilities =
      this.config?.model_capabilities ||
      this.config?.modelCapabilities ||
      {};
    const defaultModelId = this._getDefaultModelId();
    const modelCapability = modelCapabilities[defaultModelId] || {};
    const supportsMultiToolCall = modelCapability.multi_tool_call !== false;

    if (!supportsMultiToolCall) {
      console.log(`[mergeConflictSensitiveGroups] 模型 ${defaultModelId} 不支持 multi_tool_call，跳过冲突敏感文件合并`);
      return groupedDeliverables;
    }

    console.log(`[mergeConflictSensitiveGroups] 检测到 ${conflictGroups.length} 个冲突敏感文件组配置`);

    // 验证：检查同一文件是否出现在多个 conflict_sensitive_groups 中（配置错误）
    const fileToGroup = new Map();
    for (const [groupIdx, cg] of conflictGroups.entries()) {
      for (const f of (cg.files || [])) {
        const normalized = this._normalizeFilePath(f);
        if (fileToGroup.has(normalized)) {
          console.warn(`[mergeConflictSensitiveGroups] 文件 ${f} 出现在多个 conflict_sensitive_groups 中！`);
          console.warn(`[mergeConflictSensitiveGroups] 保留在第一个组: ${fileToGroup.get(normalized).description}`);
        } else {
          fileToGroup.set(normalized, { groupIdx, description: cg.description || `组${groupIdx}` });
        }
      }
    }

    // 将分组转换为标准格式（对象数组）
    let normalizedGroups = this._normalizeGroups(groupedDeliverables);

    // 记录初始文件总数（用于最终验证）
    const initialFileCount = new Set();
    for (const g of normalizedGroups) {
      for (const d of (g.deliverables || [])) {
        initialFileCount.add(this._normalizeFilePath(d.filePath));
      }
    }
    console.log(`[mergeConflictSensitiveGroups] 初始文件总数: ${initialFileCount.size}`);
    console.log(`[mergeConflictSensitiveGroups] 处理 ${conflictGroups.length} 个分组...`);

    // 按策略分组处理
    const strongCouplingGroups = []; // strategy: strong_coupling
    const sharedGroups = [];         // strategy: shared
    const pathAffinityGroups = [];   // strategy: path_affinity
    const typeBasedGroups = [];      // strategy: type_based

    for (const cg of conflictGroups) {
      const strategy = cg.strategy || 'strong_coupling'; // 默认为 strong_coupling

      switch (strategy) {
        case 'shared':
          sharedGroups.push(cg);
          break;
        case 'path_affinity':
          pathAffinityGroups.push(cg);
          break;
        case 'type_based':
          typeBasedGroups.push(cg);
          break;
        case 'strong_coupling':
        default:
          strongCouplingGroups.push(cg);
          break;
      }
    }

    // 【Phase1】按 priority 排序分组（数字越大越先执行）
    const sortByPriority = (groups) => {
      return [...groups].sort((a, b) => {
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        return priorityB - priorityA; // 降序排列
      });
    };

    const sortedStrongCouplingGroups = sortByPriority(strongCouplingGroups);
    const sortedSharedGroups = sortByPriority(sharedGroups);
    const sortedPathAffinityGroups = sortByPriority(pathAffinityGroups);
    const sortedTypeBasedGroups = sortByPriority(typeBasedGroups);

    // 打印优先级顺序（调试用）
    if (sortedStrongCouplingGroups.length > 0) {
      console.log(`[mergeConflictSensitiveGroups] strong_coupling 优先级顺序: ${sortedStrongCouplingGroups.map(g => `${g.description || '未命名'}(${g.priority || 0})`).join(' -> ')}`);
    }
    if (sortedPathAffinityGroups.length > 0) {
      console.log(`[mergeConflictSensitiveGroups] path_affinity 优先级顺序: ${sortedPathAffinityGroups.map(g => `${g.description || '未命名'}(${g.priority || 0})`).join(' -> ')}`);
    }

    // 处理 strong_coupling 策略（强制同组，检测传递依赖）
    normalizedGroups = this._processStrongCouplingGroups(normalizedGroups, sortedStrongCouplingGroups);

    // 处理 shared 策略（保持单一实例）
    normalizedGroups = this._processSharedGroups(normalizedGroups, sortedSharedGroups);

    // 处理 path_affinity 策略（按路径分组）
    normalizedGroups = this._processPathAffinityGroups(normalizedGroups, sortedPathAffinityGroups);

    // 处理 type_based 策略（按类型分组）
    normalizedGroups = this._processTypeBasedGroups(normalizedGroups, sortedTypeBasedGroups);

    console.log(`[mergeConflictSensitiveGroups] 最终组数: ${normalizedGroups.length}`);

    // 最终验证：所有原始文件仍然存在
    const finalFileCount = new Set();
    for (const g of normalizedGroups) {
      for (const d of (g.deliverables || [])) {
        finalFileCount.add(this._normalizeFilePath(d.filePath));
      }
    }

    console.log(`[mergeConflictSensitiveGroups] 最终文件总数: ${finalFileCount.size} (期望: ${initialFileCount.size})`);
    if (finalFileCount.size !== initialFileCount.size) {
      console.error(`[mergeConflictSensitiveGroups] BUG: 文件丢失！期望 ${initialFileCount.size} 个文件，实际 ${finalFileCount.size} 个文件`);
    }

    // 检测文件重复（使用原始路径，避免大小写导致误判）
    const fileCountMap = new Map();
    for (const g of normalizedGroups) {
      for (const d of (g.deliverables || [])) {
        const originalPath = d.filePath;  // 使用原始路径，不做大小写转换
        fileCountMap.set(originalPath, (fileCountMap.get(originalPath) || 0) + 1);
      }
    }

    const duplicatedFiles = [];
    for (const [file, count] of fileCountMap) {
      if (count > 1) {
        duplicatedFiles.push(file);
      }
    }

    if (duplicatedFiles.length > 0) {
      console.error(`[mergeConflictSensitiveGroups] BUG: ${duplicatedFiles.length} 个文件重复出现！`);
      console.error(`[mergeConflictSensitiveGroups] 重复文件: ${duplicatedFiles.slice(0, 10).join(', ')}`);
    } else {
      console.log(`[mergeConflictSensitiveGroups] 重复文件检测: 0 个重复`);
    }

    return normalizedGroups;
  }

  /**
   * 处理 strong_coupling 策略（强制同组，检测传递依赖）
   * @param {Array} normalizedGroups - 当前分组
   * @param {Array} strongCouplingGroups - 强耦合配置组
   * @returns {Array} 处理后的分组
   * @private
   */
  _processStrongCouplingGroups(normalizedGroups, strongCouplingGroups) {
    if (strongCouplingGroups.length === 0) {
      return normalizedGroups;
    }

    const groupsToAdd = [];

    for (const cg of strongCouplingGroups) {
      const conflictFiles = new Set();
      if (cg.files && Array.isArray(cg.files)) {
        for (const f of cg.files) {
          conflictFiles.add(this._normalizeFilePath(f));
        }
      }

      if (conflictFiles.size === 0) {
        continue;
      }

      // 找出语义组中包含这些冲突文件的组
      const groupsContainingFiles = [];
      for (const group of normalizedGroups) {
        const groupFilePaths = new Set((group.deliverables || []).map(d => this._normalizeFilePath(d.filePath)));
        const intersection = [...conflictFiles].filter(f => groupFilePaths.has(f));
        if (intersection.length > 0) {
          groupsContainingFiles.push({ group, intersection });
        }
      }

      const groupCount = groupsContainingFiles.length;
      console.log(`[mergeConflictSensitiveGroups] 组 "${cg.description || '未命名'}" (strong_coupling): ${conflictFiles.size} 个冲突文件，分布在 ${groupCount} 个语义组中`);

      if (groupCount === 1) {
        // 【修复】当 groupCount=1 时，文件已经在同一个语义组中，不需要额外处理
        // 保留原样即可，不需要收集到孤立合并组（否则会导致文件重复）
        console.log(`[mergeConflictSensitiveGroups]   -> groupCount=1，文件已在同一语义组中，保留原样`);
        continue;
      }

      if (groupCount === 0) {
        // 【修复】当 groupCount=0 时，文件不在任何语义组中
        // 需要从原始的 conflictFiles 集合中找出这些文件对应的 deliverable，创建一个新组
        console.log(`[mergeConflictSensitiveGroups]   -> groupCount=0，创建新组包含冲突文件`);
        // 从所有 normalizedGroups 中找出这些文件
        const orphanDeliverables = [];
        const allDeliverables = normalizedGroups.flatMap(g => g.deliverables || []);
        const seenPaths = new Set();
        for (const d of allDeliverables) {
          const normalizedPath = this._normalizeFilePath(d.filePath);
          if (conflictFiles.has(normalizedPath) && !seenPaths.has(normalizedPath)) {
            orphanDeliverables.push(d);
            seenPaths.add(normalizedPath);
          }
        }
        if (orphanDeliverables.length > 0) {
          const mergedGroup = {
            id: `conflict_merge_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            deliverables: orphanDeliverables,
            conflictSensitive: true,
            conflictDescription: cg.description || '未命名组',
            sourceGroups: [],
            strategy: 'strong_coupling',
            isOrphanGroup: true
          };
          groupsToAdd.push({
            mergedGroup,
            sourceGroupIds: []
          });
          console.log(`[mergeConflictSensitiveGroups]   -> 创建孤立组，包含 ${orphanDeliverables.length} 个文件`);
        }
        continue;
      }

      // 文件分布在多个语义组中 -> 需要合并这些组
      console.log(`[mergeConflictSensitiveGroups]   -> 需要合并 ${groupCount} 个语义组`);

      // 【Phase2】根据 mergeMode 决定合并策略
      const mergeMode = cg.mergeMode || 'full_merge';
      console.log(`[mergeConflictSensitiveGroups]   -> mergeMode: ${mergeMode}`);

      // 使用原始路径检测重复，避免大小写导致误判
      const seenFiles = new Set();
      const mergedDeliverables = [];
      const sourceGroupIds = [];

      // 【修复】selected_only/full_merge 合并时，非冲突文件也应保留
      // 否则当一个语义组被合并时，其中的非冲突文件会丢失
      for (const { group } of groupsContainingFiles) {
        sourceGroupIds.push(group.id);
        for (const d of (group.deliverables || [])) {
          const originalPath = d.filePath;  // 使用原始路径，不做大小写转换
          const normalizedPath = this._normalizeFilePath(d.filePath);
          const isConflictFile = conflictFiles.has(normalizedPath);

          // 无论是否是冲突文件，只要没重复就添加
          if (!seenFiles.has(originalPath)) {
            seenFiles.add(originalPath);
            mergedDeliverables.push(d);
          }
        }
      }

      const mergedGroup = {
        id: `conflict_merge_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        deliverables: mergedDeliverables,
        conflictSensitive: true,
        conflictDescription: cg.description || '未命名组',
        sourceGroups: sourceGroupIds,
        strategy: 'strong_coupling'
      };

      groupsToAdd.push({
        mergedGroup,
        sourceGroupIds
      });

      console.log(`[mergeConflictSensitiveGroups]   -> 合并完成，${mergedDeliverables.length} 个文件`);
    }

    // 构建新的组列表
    const sourceGroupIdsToRemove = new Set();
    for (const { sourceGroupIds } of groupsToAdd) {
      for (const id of sourceGroupIds) {
        sourceGroupIdsToRemove.add(id);
      }
    }

    const remainingGroups = normalizedGroups.filter(g => !sourceGroupIdsToRemove.has(g.id));
    const newGroups = groupsToAdd.map(g => g.mergedGroup);

    return [...remainingGroups, ...newGroups];
  }

  /**
   * 处理 shared 策略（保持单一实例）
   * shared 文件应该在所有引用它的组中作为单一实例存在
   * @param {Array} normalizedGroups - 当前分组
   * @param {Array} sharedGroups - shared 配置组
   * @returns {Array} 处理后的分组
   * @private
   */
  _processSharedGroups(normalizedGroups, sharedGroups) {
    if (sharedGroups.length === 0) {
      return normalizedGroups;
    }

    for (const cg of sharedGroups) {
      const sharedFiles = new Set();
      if (cg.files && Array.isArray(cg.files)) {
        for (const f of cg.files) {
          sharedFiles.add(this._normalizeFilePath(f));
        }
      }

      console.log(`[mergeConflictSensitiveGroups] 组 "${cg.description || '未命名'}" (shared): ${sharedFiles.size} 个共享文件`);

      // 标记共享文件
      for (const group of normalizedGroups) {
        for (const d of (group.deliverables || [])) {
          if (sharedFiles.has(this._normalizeFilePath(d.filePath))) {
            d.isShared = true;
            d.sharedGroupDescription = cg.description || '共享文件';
            console.log(`[mergeConflictSensitiveGroups]   -> 标记共享文件: ${d.filePath}`);
          }
        }
      }
    }

    return normalizedGroups;
  }

  /**
   * 处理 path_affinity 策略（按路径分组，不跨层）
   * @param {Array} normalizedGroups - 当前分组
   * @param {Array} pathAffinityGroups - path_affinity 配置组
   * @returns {Array} 处理后的分组
   * @private
   */
  _processPathAffinityGroups(normalizedGroups, pathAffinityGroups) {
    if (pathAffinityGroups.length === 0) {
      return normalizedGroups;
    }

    const groupsToAdd = [];
    // 【修复】收集 groupCount <= 1 时被跳过的文件，最后合并成一个组
    const skippedDeliverables = [];
    const skippedGroupDescriptions = [];

    for (const cg of pathAffinityGroups) {
      const affinityFiles = new Set();
      if (cg.files && Array.isArray(cg.files)) {
        for (const f of cg.files) {
          affinityFiles.add(this._normalizeFilePath(f));
        }
      }

      if (affinityFiles.size === 0) {
        continue;
      }

      // 找出语义组中包含这些文件的组
      const groupsContainingFiles = [];
      for (const group of normalizedGroups) {
        const groupFilePaths = new Set((group.deliverables || []).map(d => this._normalizeFilePath(d.filePath)));
        const intersection = [...affinityFiles].filter(f => groupFilePaths.has(f));
        if (intersection.length > 0) {
          groupsContainingFiles.push({ group, intersection });
        }
      }

      const groupCount = groupsContainingFiles.length;
      console.log(`[mergeConflictSensitiveGroups] 组 "${cg.description || '未命名'}" (path_affinity): ${affinityFiles.size} 个路径亲和文件，分布在 ${groupCount} 个语义组中`);

      if (groupCount <= 1) {
        // 【修复】当 groupCount=1 时，文件已经在同一个语义组中，不需要额外处理
        // 当 groupCount=0 时，文件不在任何语义组中，应该收集到孤立合并组
        if (groupCount === 1) {
          console.log(`[mergeConflictSensitiveGroups]   -> groupCount=1，文件已在同一语义组中，保留原样`);
          continue;
        }
        // groupCount === 0，收集不在任何语义组中的文件
        // 【Bug修复】必须从 normalizedGroups 中查找，而不是空的 groupsContainingFiles
        console.log(`[mergeConflictSensitiveGroups]   -> groupCount=0，收集不在任何语义组中的文件`);
        const allDeliverables = normalizedGroups.flatMap(g => g.deliverables || []);
        const seenPaths = new Set();
        for (const d of allDeliverables) {
          const normalizedPath = this._normalizeFilePath(d.filePath);
          if (affinityFiles.has(normalizedPath) && !seenPaths.has(normalizedPath)) {
            skippedDeliverables.push(d);
            seenPaths.add(normalizedPath);
            if (!skippedGroupDescriptions.includes(cg.description)) {
              skippedGroupDescriptions.push(cg.description || '未命名组');
            }
          }
        }
        continue;
      }

      // 找出共同路径前缀，按前缀分组
      // 【Phase3】支持 maxDepth 限制前缀深度
      const maxDepth = cg.maxDepth != null ? cg.maxDepth : null;
      const pathPrefixes = this._extractCommonPrefixes([...affinityFiles], maxDepth);

      for (const prefix of pathPrefixes) {
        const filesWithPrefix = [...affinityFiles].filter(f => f.startsWith(prefix));

        // 找出这些文件分布在哪些组
        const groupsWithPrefix = [];
        for (const { group } of groupsContainingFiles) {
          const groupFilePaths = new Set((group.deliverables || []).map(d => this._normalizeFilePath(d.filePath)));
          const hasFiles = filesWithPrefix.some(f => groupFilePaths.has(f));
          if (hasFiles) {
            groupsWithPrefix.push(group);
          }
        }

        if (groupsWithPrefix.length > 1) {
          // 合并这些组
          // 【修复】使用原始路径检测重复，避免大小写导致误判
          const seenFiles = new Set();
          const mergedDeliverables = [];
          const sourceGroupIds = [];

          for (const group of groupsWithPrefix) {
            sourceGroupIds.push(group.id);
            for (const d of (group.deliverables || [])) {
              const originalPath = d.filePath;  // 使用原始路径，不做大小写转换
              if (!seenFiles.has(originalPath)) {
                seenFiles.add(originalPath);
                mergedDeliverables.push(d);
              }
            }
          }

          const mergedGroup = {
            id: `path_affinity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            deliverables: mergedDeliverables,
            conflictSensitive: true,
            conflictDescription: `${cg.description || '未命名'} (${prefix})`,
            sourceGroups: sourceGroupIds,
            strategy: 'path_affinity',
            pathPrefix: prefix
          };

          groupsToAdd.push({
            mergedGroup,
            sourceGroupIds
          });
        }
      }
    }

    // 【修复】将收集到的被跳过文件合并成一个组
    if (skippedDeliverables.length > 0) {
      // 去重
      const seenFiles = new Set();
      const uniqueDeliverables = [];
      for (const d of skippedDeliverables) {
        const originalPath = d.filePath;
        if (!seenFiles.has(originalPath)) {
          seenFiles.add(originalPath);
          uniqueDeliverables.push(d);
        }
      }

      const mergedGroup = {
        id: `path_affinity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        deliverables: uniqueDeliverables,
        conflictSensitive: true,
        conflictDescription: `孤立路径亲和文件合并组: ${skippedGroupDescriptions.join(', ')}`,
        sourceGroups: [],
        strategy: 'path_affinity',
        isOrphanMerge: true  // 标记为孤立文件合并
      };

      groupsToAdd.push({
        mergedGroup,
        sourceGroupIds: []
      });

      console.log(`[_processPathAffinityGroups]   -> 合并孤立路径亲和文件 ${uniqueDeliverables.length} 个到一个组`);
    }

    // 应用合并
    if (groupsToAdd.length > 0) {
      const sourceGroupIdsToRemove = new Set();
      for (const { sourceGroupIds } of groupsToAdd) {
        for (const id of sourceGroupIds) {
          sourceGroupIdsToRemove.add(id);
        }
      }

      console.log(`[_processPathAffinityGroups] 移除 ${sourceGroupIdsToRemove.size} 个源组: ${[...sourceGroupIdsToRemove].join(', ')}`);
      console.log(`[_processPathAffinityGroups] 合并前: ${normalizedGroups.length} 个组`);
      for (const g of normalizedGroups) {
        console.log(`[_processPathAffinityGroups]   组 ${g.id}: ${g.deliverables?.length || 0} 个文件`);
      }

      const remainingGroups = normalizedGroups.filter(g => !sourceGroupIdsToRemove.has(g.id));
      const newGroups = groupsToAdd.map(g => g.mergedGroup);
      normalizedGroups = [...remainingGroups, ...newGroups];

      console.log(`[_processPathAffinityGroups] 合并后: ${normalizedGroups.length} 个组`);
      for (const g of normalizedGroups) {
        console.log(`[_processPathAffinityGroups]   组 ${g.id}: ${g.deliverables?.length || 0} 个文件 - ${g.conflictDescription || ''}`);
      }
    }

    return normalizedGroups;
  }

  /**
   * 处理 type_based 策略（按类型兼容性分组）
   * @param {Array} normalizedGroups - 当前分组
   * @param {Array} typeBasedGroups - type_based 配置组
   * @returns {Array} 处理后的分组
   * @private
   */
  _processTypeBasedGroups(normalizedGroups, typeBasedGroups) {
    if (typeBasedGroups.length === 0) {
      return normalizedGroups;
    }

    // 类型兼容性映射
    const TYPE_COMPATIBILITY = {
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

    const groupsToAdd = [];

    for (const cg of typeBasedGroups) {
      const typeFiles = new Set();
      if (cg.files && Array.isArray(cg.files)) {
        for (const f of cg.files) {
          typeFiles.add(this._normalizeFilePath(f));
        }
      }

      console.log(`[mergeConflictSensitiveGroups] 组 "${cg.description || '未命名'}" (type_based): ${typeFiles.size} 个类型亲和文件`);

      // 按类型分组
      const typeGroups = new Map();
      for (const group of normalizedGroups) {
        for (const d of (group.deliverables || [])) {
          const normalizedPath = this._normalizeFilePath(d.filePath);
          if (typeFiles.has(normalizedPath)) {
            const type = d.type || 'unknown';
            if (!typeGroups.has(type)) {
              typeGroups.set(type, []);
            }
            typeGroups.get(type).push(group);
          }
        }
      }

      // 合并同类型的组
      for (const [type, groups] of typeGroups) {
        if (groups.length > 1) {
          const seenFiles = new Set();
          const mergedDeliverables = [];
          const sourceGroupIds = [];

          for (const group of groups) {
            sourceGroupIds.push(group.id);
            for (const d of (group.deliverables || [])) {
              const normalizedPath = this._normalizeFilePath(d.filePath);
              if (!seenFiles.has(normalizedPath)) {
                seenFiles.add(normalizedPath);
                mergedDeliverables.push(d);
              }
            }
          }

          const mergedGroup = {
            id: `type_based_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            deliverables: mergedDeliverables,
            conflictSensitive: true,
            conflictDescription: `${cg.description || '未命名'} (${type})`,
            sourceGroups: sourceGroupIds,
            strategy: 'type_based',
            primaryType: type
          };

          groupsToAdd.push({
            mergedGroup,
            sourceGroupIds
          });
        }
      }
    }

    // 应用合并
    if (groupsToAdd.length > 0) {
      const sourceGroupIdsToRemove = new Set();
      for (const { sourceGroupIds } of groupsToAdd) {
        for (const id of sourceGroupIds) {
          sourceGroupIdsToRemove.add(id);
        }
      }

      const remainingGroups = normalizedGroups.filter(g => !sourceGroupIdsToRemove.has(g.id));
      const newGroups = groupsToAdd.map(g => g.mergedGroup);
      normalizedGroups = [...remainingGroups, ...newGroups];
    }

    return normalizedGroups;
  }

  /**
   * 提取共同路径前缀
   * @param {Array} paths - 路径数组
   * @param {number|null} maxDepth - 最大深度限制（可选）
   * @returns {Array} 共同前缀数组
   * @private
   */
  _extractCommonPrefixes(paths, maxDepth = null) {
    if (paths.length === 0) return [];
    if (paths.length === 1) return [paths[0]];

    const sortedPaths = [...paths].sort();

    let currentPrefix = '';
    const firstPath = sortedPaths[0];
    const lastPath = sortedPaths[sortedPaths.length - 1];

    // 找到最长的共同前缀
    for (let i = 0; i < firstPath.length; i++) {
      if (firstPath[i] === lastPath[i]) {
        currentPrefix += firstPath[i];
      } else {
        break;
      }
    }

    // 只返回最长的共同前缀（去除末尾的 / 和更短的路径）
    // 例如：如果共同前缀是 "src/components/"，只返回 "src/components/"
    if (currentPrefix.length > 0) {
      // 确保前缀以 / 结尾，便于按目录分组
      if (!currentPrefix.endsWith('/')) {
        // 如果不以 / 结尾，说明所有路径都是同一个文件
        const lastSlash = currentPrefix.lastIndexOf('/');
        if (lastSlash > 0) {
          currentPrefix = currentPrefix.substring(0, lastSlash + 1);
        }
      }

      // 【Phase3】应用 maxDepth 限制
      if (maxDepth !== null && maxDepth > 0) {
        const segments = currentPrefix.split('/').filter(s => s.length > 0);
        if (segments.length > maxDepth) {
          currentPrefix = segments.slice(0, maxDepth).join('/') + '/';
          console.log(`[_extractCommonPrefixes] maxDepth=${maxDepth} 限制，前缀从 "${segments.join('/')}/" 截断为 "${currentPrefix}"`);
        }
      }

      return [currentPrefix];
    }
    return [''];
  }

  /**
   * 规范化文件路径（用于比较）
   * @private
   */
  _normalizeFilePath(filePath) {
    if (!filePath) return '';
    // 统一使用正斜杠，转小写，去除多余斜杠
    return filePath.replace(/\\/g, '/').toLowerCase().replace(/\/+/g, '/');
  }

  /**
   * 基于 integrationHints.dependsOn 计算传递闭包
   * 如果 A 依赖 B，B 依赖 C，则 A 和 C 也必须在同一组
   * @param {Array} groupedDeliverables - 分组后的 deliverables
   * @param {Array} conflictGroups - 冲突敏感文件组
   * @returns {Array} 扩展后的冲突敏感文件组
   */
  expandConflictGroupsWithTransitiveDeps(groupedDeliverables, conflictGroups) {
    if (!conflictGroups || conflictGroups.length === 0) {
      return conflictGroups;
    }

    // 【修复Phase2】深拷贝 conflictGroups，避免修改原始配置
    const conflictGroupsCopy = conflictGroups.map(cg => ({
      ...cg,
      files: [...(cg.files || [])]  // 拷贝 files 数组
    }));

    // 构建 dependencyMap (使用 DependencyDetector)
    const dependencyDetector = this.semanticAnalyzer?.dependencyDetector;
    if (!dependencyDetector) {
      console.log('[expandConflictGroupsWithTransitiveDeps] 没有 dependencyDetector，跳过传递依赖扩展');
      return conflictGroupsCopy;
    }

    const dependencyMap = dependencyDetector.detectDependencies
      ? dependencyDetector.detectDependencies(groupedDeliverables.flatMap(g => g.deliverables || []))
      : new Map();

    // 对拷贝进行处理
    for (const conflictGroup of conflictGroupsCopy) {
      const expandedFiles = new Set(conflictGroup.files);

      for (const file of conflictGroup.files) {
        const transitiveDeps = this._getTransitiveDependencies(file, dependencyMap);
        transitiveDeps.forEach(dep => expandedFiles.add(dep));
      }

      conflictGroup.files = Array.from(expandedFiles);
      console.log(`[expandConflictGroupsWithTransitiveDeps] 组 "${conflictGroup.description}" 扩展后文件数: ${conflictGroup.files.length}`);
    }

    // 返回拷贝，不修改原始
    return conflictGroupsCopy;
  }

  /**
   * 计算传递依赖闭包
   * @param {string} filePath - 文件路径
   * @param {Map} dependencyMap - 依赖关系映射
   * @returns {Set} 传递依赖的文件路径集合
   * @private
   */
  _getTransitiveDependencies(filePath, dependencyMap) {
    const result = new Set();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.shift();
      const deps = dependencyMap.get(this._normalizeFilePath(current)) || new Set();

      for (const dep of deps) {
        if (!result.has(dep)) {
          result.add(dep);
          queue.push(dep);
        }
      }
    }

    return result;
  }

  /**
   * 获取默认模型ID
   * @private
   * @returns {string} 模型ID
   */
  _getDefaultModelId() {
    const selector = this.config?.selector || {};
    const defaultSelector = selector.default || '';

    // 格式是 "provider,model"（如 "deepseek,deepseek-chat"）
    // 需要提取模型名（第二部分），而不是提供商名（第一部分）
    if (defaultSelector) {
      const parts = defaultSelector.split(',');
      // 如果有多个部分，取第二部分作为模型ID
      const modelId = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      if (modelId) {
        console.log(`[_getDefaultModelId] 从 selector.default "${defaultSelector}" 提取模型ID: "${modelId}"`);
        return modelId;
      }
    }

    return 'MiniMax-M2.7';
  }

  /**
   * 将分组转换为标准格式（对象数组）
   * @private
   */
  _normalizeGroups(groupedDeliverables) {
    if (!groupedDeliverables || !Array.isArray(groupedDeliverables)) {
      return [];
    }

    // 检查第一个元素是否是对象且有 deliverables 属性
    if (groupedDeliverables.length > 0 && groupedDeliverables[0]?.deliverables && Array.isArray(groupedDeliverables[0]?.deliverables)) {
      // 已经是对象数组格式
      return groupedDeliverables.map(g => ({
        id: g.id || `group_${Math.random().toString(36).substr(2, 6)}`,
        deliverables: g.deliverables || [],
        ...g
      }));
    }

    // 数组的数组格式，需要转换
    return groupedDeliverables.map((deliverables, idx) => ({
      id: `group_${idx}`,
      deliverables: deliverables || []
    }));
  }

  generatePrompts(groups, baseTask, implementationPlan = null) {
    // 功能块 E: Prompt 生成层的实现
    console.log('生成 Prompt...');

    // 确保 groups 是数组，如果不是则初始化为空数组
    const validatedGroups = Array.isArray(groups) ? groups : [];

    // 处理分组结构：可能是对象数组 ({id, deliverables, ...}) 或数组的数组
    let flattenedDeliverables = [];
    let normalizedGroups = [];

    if (validatedGroups && validatedGroups.length > 0) {
      // 检查第一个元素是否是对象且有 deliverables 属性
      const isObjectGroup = validatedGroups[0] && validatedGroups[0].deliverables && Array.isArray(validatedGroups[0].deliverables);

      if (isObjectGroup) {
        // 对象数组格式
        normalizedGroups = validatedGroups;
        flattenedDeliverables = validatedGroups.flatMap(group => group.deliverables || []);
      } else if (Array.isArray(validatedGroups[0])) {
        // 数组的数组格式
        normalizedGroups = validatedGroups.map((deliverables, idx) => ({
          id: `group_${idx}`,
          deliverables,
          indices: deliverables.map((_, i) => i)
        }));
        flattenedDeliverables = validatedGroups.flat();
      } else {
        // 直接是单个 deliverables 数组
        flattenedDeliverables = Array.isArray(validatedGroups) ? validatedGroups : [];
        normalizedGroups = [{
          id: 'group_0',
          deliverables: flattenedDeliverables,
          indices: flattenedDeliverables.map((_, i) => i)
        }];
      }
    }

    // 根据配置决定是否使用增强生成
    if (normalizedGroups.length > 0 && this.shouldUseEnhancedGeneration(normalizedGroups)) {
      // 使用增强生成方法，根据分组生成子任务（每个分组生成一个子任务，而不是每个deliverable）
      return this.promptGenerator.generateFromGroups(
        baseTask,
        normalizedGroups,
        this.getDependencyGraph(flattenedDeliverables),
        implementationPlan  // Pass implementation plan to prompt generator
      );
    } else {
      return this.promptGenerator.generate(baseTask, flattenedDeliverables, implementationPlan); // Pass implementation plan
    }
  }

  /**
   * 确定是否使用增强生成
   */
  shouldUseEnhancedGeneration(groups) {
    // 如果有分组信息，使用增强生成
    return groups && groups.length > 0;
  }

  /**
   * 获取依赖图 - 使用语义分析器的依赖检测功能
   */
  getDependencyGraph(deliverables) {
    // 使用语义分析器检测依赖关系
    return this.semanticAnalyzer.detectDependencies(deliverables);
  }

  resolveConflicts(tasks) {
    // 功能块 F: 冲突解决层的实现（基础版本，返回数组）
    console.log('解决冲突...');
    const result = this.conflictResolver.resolveConflictsWithHints(tasks);
    return result.finalSubtasks;
  }

  resolveConflictsWithHints(tasks) {
    // 功能块 F: 冲突解决层的增强版本，返回完整结果对象
    console.log('解决冲突（增强版本）...');
    return this.conflictResolver.resolveConflictsWithMetadata(tasks);
  }

  logDebugInfo(tasks) {
    // 功能块 G: 调试与监控层的实现
    if (this.config.logLevel === 'debug' || this.config.debug) {
      console.log('记录调试信息:', tasks.length, '个子任务');

      // 记录到调试管理器
      this.debugManager.incrementStat('tasksProcessed', tasks.length);

      // 记录任务统计
      const typeCounts = {};
      tasks.forEach(task => {
        const type = task.type || 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        // 如果是增强子任务，记录更多细节
        if (task.integrationHints) {
          this.debugManager.incrementStat('tasksWithIntegrationHints', 1);
        }
      });

      Object.entries(typeCounts).forEach(([type, count]) => {
        this.debugManager.incrementStat('typesDetected', { [type]: count });
      });

      if (this.config.logLevel === 'debug') {
        console.log('详细任务信息:', JSON.stringify(tasks, null, 2));
      }

      // 输出调试摘要
      console.log(this.debugManager.getLogSummary());
    }
  }
}

module.exports = ElasticDecomposer;
