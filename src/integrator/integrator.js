/**
 * @fileoverview Integrator - 主整合器
 *
 * 负责将多个子任务的执行结果合并为一个完整的、可运行的代码库
 * 整合所有子模块：文件合并、依赖注入、冲突解决、代码风格统一等
 */

const { FileOrganizer } = require('./file/organizer');
const { ConflictDetector } = require('./file/conflict');
const { ImportAnalyzer } = require('./dependency/analyzer');
const { DependencyGraph } = require('./dependency/graph');
const { DependencyInjector } = require('./dependency/injector');
const { NamingConflictResolver } = require('./conflict/detector');
const { AutoRenamer } = require('./conflict/renamer');
const { LLMConflictResolver } = require('./conflict/llm_resolver');
const { CodeFormatter } = require('./style/formatter');
const { CompletenessValidator } = require('./validation/completeness');
const { ExecutionQualityEvaluator } = require('./execution/quality_evaluator');
const { QualityFeedbackProcessor } = require('./execution/quality_feedback_processor');
const { IntegrationInterfaceProcessor } = require('./interface/processor');
const { MergeStrategyHandler } = require('./interface/merge_handler');
const { OutputFormatter, OutputFormat } = require('./output/formatter');
const { PluginManager } = require('./plugins/plugin_manager');
const { RuntimeDependencyManager } = require('./dependencies/runtime_dependency_manager');
const { CacheManager } = require('./cache/cache_manager');
const { MarkdownCodeCleaner } = require('./utils/MarkdownCodeCleaner');

/**
 * IntegrationResult - 整合结果
 *
 * @typedef {Object} IntegrationResult
 * @property {boolean} success - 是否成功
 * @property {Map<string, CodeFile>} files - 整合后的文件
 * @property {Object[]} logs - 日志列表
 * @property {string[]} warnings - 警告列表
 * @property {Object} [qualityReport] - 质量报告
 * @property {Object} [validationReport] - 验证报告
 */

/**
 * IntegratorConfig - 整合器配置
 *
 * @typedef {Object} IntegratorConfig
 * @property {Object} [formatting] - 格式化配置
 * @property {Object} [execution] - 执行配置
 * @property {number} [execution.quality_threshold] - 质量阈值
 * @property {number} [execution.critical_quality_threshold] - 严重质量阈值
 * @property {Object} [conflict] - 冲突解决配置
 * @property {Object} [dependency] - 依赖处理配置
 * @property {Object} [plugins] - 插件配置
 * @property {Object} [cache] - 缓存配置
 * @property {boolean} [cache.enabled] - 是否启用缓存
 * @property {boolean} [cache.persistenceEnabled] - 是否启用持久化缓存
 * @property {Object} [runtimeDependencies] - 运行时依赖配置
 * @property {boolean} [runtimeDependencies.enabled] - 是否启用运行时依赖检测
 * @property {boolean} [runtimeDependencies.outputReport] - 是否输出依赖报告
 */

/**
 * Integrator - 主整合器
 *
 * 将多个子任务的执行结果合并为完整的代码库
 */
class Integrator {
  /**
   * 创建整合器
   *
   * @param {IntegratorConfig} [config] - 配置
   */
  constructor(config = {}) {
    /** @type {IntegratorConfig} */
    this.config = {
      plugins: {},
      cache: {
        enabled: true,
        persistenceEnabled: true
      },
      runtimeDependencies: {
        enabled: true,
        outputReport: true
      },
      ...config
    };

    /** @type {FileOrganizer} */
    this.fileOrganizer = new FileOrganizer();

    /** @type {ConflictDetector} */
    this.conflictDetector = new ConflictDetector();

    /** @type {ImportAnalyzer} */
    this.importAnalyzer = new ImportAnalyzer();

    /** @type {DependencyGraph} */
    this.dependencyGraph = new DependencyGraph(config?.dependency);

    /** @type {DependencyInjector} */
    this.dependencyInjector = new DependencyInjector(this.dependencyGraph);

    /** @type {NamingConflictResolver} */
    this.namingConflictResolver = new NamingConflictResolver();

    /** @type {AutoRenamer} */
    this.autoRenamer = new AutoRenamer();

    /** @type {CodeFormatter} */
    this.codeFormatter = new CodeFormatter(config?.formatting || {});

    /** @type {CompletenessValidator} */
    this.completenessValidator = new CompletenessValidator();

    /** @type {ExecutionQualityEvaluator} */
    this.executionQualityEvaluator = new ExecutionQualityEvaluator();

    /** @type {PluginManager} */
    this.pluginManager = new PluginManager(config?.plugins);

    /** @type {RuntimeDependencyManager} */
    this.runtimeDependencyManager = new RuntimeDependencyManager(config?.runtimeDependencies);

    /** @type {CacheManager} */
    this.cacheManager = config?.cache?.enabled !== false
      ? new CacheManager(config?.cache)
      : null;

    /** @type {OutputFormatter} */
    this.outputFormatter = new OutputFormatter();

    /** @type {Object} */
    this.logger = config?.logger || console;

    /** @type {Array} 缺失文件恢复队列 */
    this.recoveryQueue = [];

    /** @type {Array} 提取的问题清单列表 */
    this.extractedIssueChecklists = [];
  }

  /**
   * 重置整合器的所有状态
   * 用于在每次编排开始前清理上一次的状态，防止跨请求污染
   *
   * @returns {void}
   */
  resetState() {
    // 重置文件组织器
    this.fileOrganizer.reset();

    // 清空恢复队列
    this.recoveryQueue = [];

    // 清空问题清单列表
    this.extractedIssueChecklists = [];

    // 清空依赖图
    if (this.dependencyGraph && typeof this.dependencyGraph.clear === 'function') {
      this.dependencyGraph.clear();
    }

    this.logger.info('[Integrator] 状态已重置');
  }

  /**
   * 从 toolCalls 中提取问题清单
   * @private
   */
  _extractIssueChecklistFromToolCalls(toolCalls) {
    if (!toolCalls || !Array.isArray(toolCalls)) {
      console.log('[_extractIssueChecklistFromToolCalls] toolCalls 为空或非数组');
      return null;
    }

    console.log(`[_extractIssueChecklistFromToolCalls] 开始检查 ${toolCalls.length} 个 toolCalls`);

    for (const toolCall of toolCalls) {
      const toolName = toolCall.name || toolCall.function?.name || '';
      const toolInput = toolCall.input || toolCall.function?.arguments || '{}';

      if (toolName === 'write_file' || toolName === 'Write') {
        try {
          const parsed = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
          const filePathInTool = parsed.file_path || parsed.filePath || parsed.path || '';

          console.log(`[_extractIssueChecklistFromToolCalls] 检查 write_file: ${filePathInTool}`);

          if (filePathInTool.includes('.orchestrator/issues/') &&
              filePathInTool.includes('问题清单')) {
            console.log('[_extractIssueChecklistFromToolCalls] 找到问题清单文件!');
            const content = parsed.content || '';
            if (content) {
              try {
                const checklist = JSON.parse(content);
                console.log(`[_extractIssueChecklistFromToolCalls] 问题清单解析成功: ${JSON.stringify(checklist).substring(0, 200)}`);
                return checklist;
              } catch (e) {
                console.warn(`[_extractIssueChecklistFromToolCalls] 问题清单 JSON 解析失败: ${e.message}`);
              }
            }
          }
        } catch (e) { /* ignore */ }
      }
    }
    console.log('[_extractIssueChecklistFromToolCalls] 未找到问题清单');
    return null;
  }

  /**
   * 合并多个子任务的问题清单
   * @private
   */
  _mergeIssueChecklists(checklists) {
    const validChecklists = checklists.filter(c => c && (c.files_created || c.file_issues));
    if (validChecklists.length === 0) return null;

    const merged = {
      task: validChecklists[0]?.task || 'unknown',
      timestamp: new Date().toISOString(),
      files_created: [],
      file_issues: {}
    };

    // 生成问题唯一标识 (issue_type + description)
    const getIssueKey = (issue) => `${issue.issue_type}:${issue.description}`;

    for (const checklist of validChecklists) {
      if (checklist.files_created) {
        for (const file of checklist.files_created) {
          if (!merged.files_created.includes(file)) {
            merged.files_created.push(file);
          }
        }
      }
      if (checklist.file_issues) {
        for (const [file, issues] of Object.entries(checklist.file_issues)) {
          if (!merged.file_issues[file]) {
            merged.file_issues[file] = [];
          }
          // 每个文件独立去重
          const seenIssueKeys = new Set();
          if (Array.isArray(issues)) {
            for (const issue of issues) {
              const issueKey = getIssueKey(issue);
              // 去重：相同 issue_type + description 组合在同一文件中只添加一次
              if (!seenIssueKeys.has(issueKey)) {
                seenIssueKeys.add(issueKey);
                merged.file_issues[file].push(issue);
              }
            }
          }
        }
      }
    }
    return merged;
  }

  /**
   * 整合子任务执行结果
   *
   * @param {Object[]} executionResults - 执行结果列表
   * @param {Object[]} subtasks - 子任务列表
   * @returns {Promise<IntegrationResult>} 整合结果
   */
  async integrate(executionResults, subtasks) {
    const logs = [];
    const warnings = [];

    try {
      // 1. 处理整合器接口
      this.logger.info('Processing integration interface');
      const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);

      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Integration interface processed',
        context: {
          filesCount: integrationData.filesToProcess.size,
          groupsCount: integrationData.mergeGroups.size
        }
      });

      // 2. 将执行结果转换为 CodeFile 对象
      this.logger.info('Converting execution results to CodeFile objects');
      // 不直接转换，而是先按接口处理器的逻辑进行排序
      const codeFiles = this.processExecutionResultsWithDependencies(executionResults, subtasks);

      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Converted execution results to CodeFile objects with dependency order',
        context: {
          codeFilesCount: codeFiles.length
        }
      });

      // 3. 添加文件到组织器（已按依赖顺序处理，同一路径的文件会自动合并）
      this.logger.info('Adding files to organizer (files already sorted by dependencies)');
      for (const file of codeFiles) {
        this.fileOrganizer.addFile(file);
      }

      // 4. 检测文件冲突（只检测真正的路径冲突，同一路径多版本已在 addFile 中处理）
      this.logger.info('Detecting file conflicts');
      const conflicts = this.conflictDetector.detectFileConflicts(codeFiles);

      // 过滤掉同一路径多版本的情况（这些已经在 addFile 中通过合并策略处理了）
      const realConflicts = conflicts.filter(conflict => {
        // 如果是同一路径多版本且有 mergeStrategy，则不是真正的冲突
        if (conflict.type === 'file_content_mismatch' || conflict.type === 'merge_strategy_conflict') {
          const versions = conflict.versions || [];
          const hasMergeStrategy = versions.some(
            v => v.integrationHints?.mergeStrategy || v.integrationHints?.dependsOn
          );
          if (hasMergeStrategy) {
            return false; // 这不是真正的冲突，是预期的合并场景
          }
        }
        return true;
      });

      if (realConflicts.length > 0) {
        warnings.push(`Detected ${realConflicts.length} real file conflicts`);
        logs.push({
          timestamp: new Date(),
          level: 'warning',
          message: `Detected ${realConflicts.length} real file conflicts`,
          context: {
            conflicts: realConflicts
          }
        });

        // 处理真正的冲突
        await this.resolveConflicts(realConflicts, codeFiles);
      } else {
        logs.push({
          timestamp: new Date(),
          level: 'info',
          message: 'No real conflicts detected (same-path multi-version files are merged automatically)',
          context: {}
        });
      }

      // 4.5 检测模型是否遵循任务要求（语义相关性检测）- 已禁用
      // this.logger.info('Checking model compliance with task requirements');
      // const complianceResults = this.checkModelCompliance(executionResults, subtasks);

      // for (const compliance of complianceResults) {
      //   if (!compliance.compliant) {
      //     const warning = `模型可能忽略任务要求 [${compliance.taskId}]: ${compliance.reason}`;
      //     warnings.push(warning);
      //     logs.push({
      //       timestamp: new Date(),
      //       level: 'warning',
      //       message: warning,
      //       context: {
      //         taskId: compliance.taskId,
      //         expected: compliance.expectedKeywords,
      //         actual: compliance.detectedKeywords,
      //         thinking: compliance.thinking ? compliance.thinking.substring(0, 500) : null
      //       }
      //     });
      //   }
      // }

      // 5. 执行质量评估
      this.logger.info('Evaluating execution quality');
      const executionQuality = new Map();

      for (const result of executionResults) {
        try {
          const quality = await this.executionQualityEvaluator.evaluate(result);
          executionQuality.set(result.task_id, quality);

          logs.push({
            timestamp: new Date(),
            level: 'info',
            message: `Quality evaluation completed for task ${result.task_id}`,
            context: {
              taskId: result.task_id,
              qualityScore: quality.score,
              issuesCount: quality.issues.length
            }
          });
        } catch (error) {
          const warning = `Failed to evaluate quality for task ${result.task_id}: ${error.message}`;
          warnings.push(warning);

          logs.push({
            timestamp: new Date(),
            level: 'warning',
            message: warning,
            context: {
              taskId: result.task_id,
              error: error.message
            }
          });
        }
      }

      // 6. 应用质量驱动的整合决策
      this.logger.info('Applying quality-driven integration decisions');
      const associatedResults = executionResults.map((result) => ({
        task_id: result.task_id,
        subtask: subtasks.find((s) => s.id === result.task_id)
      }));

      const qualityDecisions = QualityFeedbackProcessor.applyQualityBasedDecisions(
        associatedResults,
        executionQuality,
        this.config
      );

      // 生成质量审核报告
      const auditReport = QualityFeedbackProcessor.generateQualityAuditReport(
        qualityDecisions,
        associatedResults,
        executionQuality
      );

      if (auditReport.includes('需要人工审核')) {
        warnings.push('存在需要人工审核的低质量结果，请查看质量审核报告');
        this.logger.warn('Low quality results require manual review', { report: auditReport });
      }

      // 6.5 应用插件处理（如果配置了插件）
      if (this.pluginManager.getLoadedPlugins().length > 0) {
        this.logger.info('Applying plugin processing');
        for (const [filePath, file] of this.fileOrganizer.getAllFiles().entries()) {
          const processedFile = this.pluginManager.processFile(file);
          if (processedFile !== file) {
            this.fileOrganizer.addFile(processedFile);
          }
        }
        logs.push({
          timestamp: new Date(),
          level: 'info',
          message: 'Plugin processing completed',
          context: {
            pluginsCount: this.pluginManager.getLoadedPlugins().length
          }
        });
      }

      // 7. 构建依赖图（使用缓存）
      this.logger.info('Building dependency graph');
      const organizedFiles = this.fileOrganizer.getAllFiles();

      // 使用增量处理和缓存
      if (this.cacheManager) {
        const cacheResult = await this.cacheManager.processIncremental(
          organizedFiles,
          async (file) => this.importAnalyzer.analyzeFile(file)
        );

        for (const [filePath, analysis] of cacheResult.results.entries()) {
          this.dependencyGraph.addFile(analysis);
        }

        // 处理未变更的文件（从缓存获取）
        for (const filePath of cacheResult.unchangedFiles) {
          const file = organizedFiles.get(filePath);
          if (file) {
            const cachedAnalysis = this.cacheManager.symbolCache.get(filePath, file.content);
            if (cachedAnalysis) {
              this.dependencyGraph.addFile(cachedAnalysis);
            } else {
              const analysis = this.importAnalyzer.analyzeFile(file);
              this.dependencyGraph.addFile(analysis);
              this.cacheManager.symbolCache.set(filePath, file.content, analysis);
            }
          }
        }
      } else {
        // 无缓存，直接分析
        for (const [filePath, file] of organizedFiles.entries()) {
          const analysis = this.importAnalyzer.analyzeFile(file);
          this.dependencyGraph.addFile(analysis);
        }
      }

      this.dependencyGraph.buildEdges();

      // 检测循环依赖
      const cycles = this.dependencyGraph.detectCircularDeps();
      if (cycles.length > 0) {
        warnings.push(`Detected ${cycles.length} circular dependencies`);
        this.dependencyGraph.handleCircularDeps(cycles, 'warn');
      }

      // 8. 注入依赖
      this.logger.info('Injecting dependencies');
      const updatedFiles = new Map();
      for (const [filePath, file] of organizedFiles.entries()) {
        const updatedContent = this.dependencyInjector.injectImports(
          file,
          organizedFiles
        );

        const updatedFile = {
          ...file,
          content: updatedContent
        };

        // 添加更新后的文件到新的 map，而不是重新添加到组织器中，这会导致覆盖
        updatedFiles.set(filePath, updatedFile);
      }

      // 9. 格式化代码
      this.logger.info('Formatting code');
      const formatResults = [];
      const formattedFiles = new Map();

      for (const [filePath, file] of updatedFiles.entries()) {
        const formatResult = this.codeFormatter.formatFile(file);
        formatResults.push(formatResult);

        formattedFiles.set(filePath, {
          ...file,
          content: formatResult.formattedContent
        });
      }

      // 记录格式化报告
      const formattingReport = this.codeFormatter.generateFormattingReport(formatResults);
      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Code formatting completed',
        context: {
          report: formattingReport
        }
      });

      // 10.5 运行时依赖检测（如果启用）
      if (this.config.runtimeDependencies?.enabled) {
        this.logger.info('Analyzing runtime dependencies');
        try {
          const dependencyReport = await this.runtimeDependencyManager.analyzeProjectDependencies(formattedFiles);

          logs.push({
            timestamp: new Date(),
            level: 'info',
            message: 'Runtime dependency analysis completed',
            context: {
              externalDepsCount: dependencyReport.external.length,
              internalDepsCount: dependencyReport.internal.length,
              builtinDepsCount: dependencyReport.builtin.length,
              missingPackagesCount: dependencyReport.missingPackages.length
            }
          });

          // 生成依赖报告
          if (this.config.runtimeDependencies?.outputReport) {
            const reportText = this.runtimeDependencyManager.generateDependencyReport(dependencyReport);
            logs.push({
              timestamp: new Date(),
              level: 'info',
              message: 'Dependency report generated',
              context: {
                report: reportText
              }
            });

            // 如果有缺失的包，添加警告
            if (dependencyReport.missingPackages.length > 0) {
              warnings.push(`Missing packages detected: ${dependencyReport.missingPackages.join(', ')}`);
            }
          }

          // 存储依赖报告到结果
          this.lastDependencyReport = dependencyReport;
        } catch (error) {
          const warning = `Failed to analyze runtime dependencies: ${error.message}`;
          warnings.push(warning);
          logs.push({
            timestamp: new Date(),
            level: 'warning',
            message: warning,
            context: { error: error.message }
          });
        }
      }

      // 11. 验证完整性
      this.logger.info('Validating completeness');
      const validationResult = this.completenessValidator.validate(subtasks, formattedFiles);

      // 检测错误占位符文件（AI 模型未能生成的文件）
      const errorPlaceholderFiles = [];
      for (const [filePath, codeFile] of formattedFiles) {
        if (codeFile.content && codeFile.content.startsWith('// ERROR: Content for')) {
          errorPlaceholderFiles.push(filePath);
        }
      }

      if (!validationResult.success || errorPlaceholderFiles.length > 0) {
        // 添加缺失文件到警告
        if (validationResult.missingFiles && validationResult.missingFiles.length > 0) {
          warnings.push(`缺失 ${validationResult.missingFiles.length} 个文件: ${validationResult.missingFiles.join(', ')}`);
        }
        if (errorPlaceholderFiles.length > 0) {
          warnings.push(`AI 模型未能生成 ${errorPlaceholderFiles.length} 个文件: ${errorPlaceholderFiles.join(', ')}`);
        }
        const failureMsg = !validationResult.success
          ? `Completeness validation failed: ${validationResult.message}`
          : `发现 ${errorPlaceholderFiles.length} 个文件内容为空（AI 模型未能生成）`;
        this.logger.warn(failureMsg);
      }

      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Completeness validation completed',
        context: validationResult
      });

      // 12. 返回整合结果
      // 如果验证失败（缺失文件），则整合失败
      const integrationSuccess = validationResult.success && warnings.length === 0;
      const result = {
        success: integrationSuccess,
        files: formattedFiles,
        logs,
        warnings,
        errorPlaceholderFiles,
        qualityReport: {
          executionQuality: Object.fromEntries(executionQuality),
          decisions: qualityDecisions,
          auditReport
        },
        validationReport: validationResult
      };

      // 添加依赖报告（如果有）
      if (this.lastDependencyReport) {
        result.dependencyReport = this.lastDependencyReport;
      }

      // 添加缓存统计（如果启用了缓存）
      if (this.cacheManager) {
        result.cacheStats = this.cacheManager.getStats();
      }

      // 添加插件信息（如果有插件）
      if (this.pluginManager.getLoadedPlugins().length > 0) {
        result.plugins = {
          loaded: this.pluginManager.getLoadedPlugins().map(p => p.name),
          dependencyResolvers: this.pluginManager.getDependencyResolvers().map(r => r.name),
          conflictStrategies: this.pluginManager.getConflictStrategies().map(s => s.name),
          fileProcessors: this.pluginManager.getFileProcessors().map(p => p.name)
        };
      }

      // 添加问题清单预测（如果有）
      // [DEBUG] 问题清单调试日志
      console.log('[integrate] this.extractedIssueChecklists:', this.extractedIssueChecklists ? '存在' : '不存在');
      if (this.extractedIssueChecklists) {
        console.log('[integrate] extractedIssueChecklists.length:', this.extractedIssueChecklists.length);
      }
      if (this.extractedIssueChecklists && this.extractedIssueChecklists.length > 0) {
        console.log('[integrate] 准备合并问题清单，调用 _mergeIssueChecklists');
        result.predictedIssues = this._mergeIssueChecklists(this.extractedIssueChecklists);
        console.log('[integrate] 合并后 predictedIssues:', result.predictedIssues ? '存在' : '不存在');
      }

      return result;
    } catch (error) {
      this.logger.error('Integration failed', { error: error.message });

      logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Integration failed: ${error.message}`,
        context: {
          error: error.stack
        }
      });

      return {
        success: false,
        files: new Map(),
        logs,
        warnings: [...warnings, error.message]
      };
    }
  }

  /**
   * 将执行结果转换为 CodeFile 对象
   *
   * @private
   * @param {Object[]} executionResults - 执行结果列表
   * @param {Object[]} subtasks - 子任务列表
   * @returns {CodeFile[]} CodeFile 对象列表
   */
  convertToCodeFiles(executionResults, subtasks) {
    // 按文件路径分组任务结果
    const filesMap = new Map();

    // 构建任务映射和依赖图
    const taskMap = new Map();
    const dependsOnMap = new Map(); // taskId -> [依赖它的任务ids]

    for (const result of executionResults) {
      const subtask = subtasks.find((s) => s.id === result.task_id);

      if (!subtask) {
        console.warn(`No subtask found for result ${result.task_id}, skipping`);
        continue;
      }

      // 获取 integrationHints（优先使用 result 中的，其次使用 subtask 中的）
      const integrationHints = result.integrationHints || subtask.integrationHints || {};

      // 检查是否是合并的多文件任务
      const targetFiles = integrationHints.targetFiles;
      const mergedDeliverables = integrationHints.mergedDeliverables;

      // 【关键修复】从 result 中提取内容（优先从 toolCalls，其次从 content）
      let extractedContent = '';

      // 优先从 toolCalls 提取代码
      if (result.toolCalls && Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
        console.log(`[processExecutionResults] 检测到 toolCalls，数量: ${result.toolCalls.length}`);
        for (const toolCall of result.toolCalls) {
          const toolName = toolCall.name || toolCall.function?.name || '';
          const toolInput = toolCall.input || toolCall.function?.arguments || '{}';
          if (toolName === 'write_file' || toolName === 'Write') {
            try {
              const parsed = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
              extractedContent = parsed.content || '';
              if (extractedContent.trim()) break;
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 如果没有从 toolCalls 提取到内容，使用 result.content
      if (!extractedContent || extractedContent.trim() === '') {
        extractedContent = result.content || '';
      }

      if (targetFiles && targetFiles.length > 1 && extractedContent) {
        // 解析多文件输出
        const parsedFiles = this.parseMultiFileContent(extractedContent, targetFiles);

        for (const parsedFile of parsedFiles) {
          const filePath = parsedFile.filePath;
          const language = this.inferLanguage(filePath, parsedFile.content);

          const codeFile = {
            path: filePath,
            content: parsedFile.content,
            sourceTaskId: result.task_id,
            modelUsed: result.model_used || 'unknown',
            language,
            integrationHints: integrationHints
          };

          if (!filesMap.has(filePath)) {
            filesMap.set(filePath, []);
          }
          filesMap.get(filePath).push(codeFile);

          taskMap.set(`${result.task_id}_${filePath}`, {
            result: result,
            subtask: subtask,
            file: codeFile,
            filePath: filePath
          });
        }
      } else {
        // 单文件任务（原有逻辑）
        let filePath = integrationHints.targetFile;

        if (!filePath) {
          filePath = `generated/${result.task_id}.js`;
        }

        const language = this.inferLanguage(filePath, extractedContent);

        const codeFile = {
          path: filePath,
          content: extractedContent,
          sourceTaskId: result.task_id,
          modelUsed: result.model_used || 'unknown',
          language,
          integrationHints: integrationHints
        };

        if (!filesMap.has(filePath)) {
          filesMap.set(filePath, []);
        }
        filesMap.get(filePath).push(codeFile);

        taskMap.set(result.task_id, {
          result: result,
          subtask: subtask,
          file: codeFile,
          filePath: filePath
        });
      }

      // 记录依赖关系
      if (integrationHints.dependsOn && Array.isArray(integrationHints.dependsOn)) {
        for (const depId of integrationHints.dependsOn) {
          if (!dependsOnMap.has(depId)) {
            dependsOnMap.set(depId, []);
          }
          dependsOnMap.get(depId).push(result.task_id);
        }
      }
    }

    // 对每个文件路径中的任务按依赖顺序排序
    const codeFiles = [];
    for (const [filePath, files] of filesMap) {
      if (files.length === 1) {
        // 如果只有一个文件，直接添加
        codeFiles.push(files[0]);
      } else {
        // 如果有多个文件，根据依赖关系排序后添加
        const sortedFiles = this.sortFilesByDependencies(files, taskMap, dependsOnMap);
        codeFiles.push(...sortedFiles);
      }
    }

    return codeFiles;
  }

  /**
   * 按依赖关系对文件进行排序
   * @private
   * @param {Array} files - 文件列表
   * @param {Map} taskMap - 任务映射
   * @param {Map} dependsOnMap - 依赖映射
   * @returns {Array} 排序后的文件列表
   */
  sortFilesByDependencies(files, taskMap, dependsOnMap) {
    // 构建该文件组内的依赖图
    const fileIds = files.map(f => f.sourceTaskId);
    const localTaskMap = new Map();
    const localDependencies = new Map();

    for (const file of files) {
      const taskInfo = taskMap.get(file.sourceTaskId);
      if (taskInfo && taskInfo.file.filePath === file.path) {
        localTaskMap.set(file.sourceTaskId, file);

        // 获取该任务的依赖
        const subtask = taskInfo.subtask;
        const integrationHints = taskInfo.result.integrationHints || subtask.integrationHints;
        if (integrationHints?.dependsOn && Array.isArray(integrationHints.dependsOn)) {
          localDependencies.set(file.sourceTaskId, integrationHints.dependsOn);
        } else {
          localDependencies.set(file.sourceTaskId, []);
        }
      }
    }

    // 执行拓扑排序
    const sortedFiles = [];
    const visited = new Set();
    const tempVisited = new Set();

    const visit = (taskId) => {
      if (tempVisited.has(taskId)) {
        throw new Error(`Circular dependency detected for task ${taskId}`);
      }
      if (visited.has(taskId)) {
        return;
      }

      tempVisited.add(taskId);

      const deps = localDependencies.get(taskId) || [];
      for (const depId of deps) {
        // 只处理同一文件内的依赖
        if (localTaskMap.has(depId)) {
          visit(depId);
        }
      }

      tempVisited.delete(taskId);
      visited.add(taskId);

      const file = localTaskMap.get(taskId);
      if (file) {
        sortedFiles.push(file);
      }
    };

    // 遍历所有任务
    for (const taskId of localTaskMap.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }

    return sortedFiles;
  }

  /**
   * 解析索引格式的多文件内容 [FILE:N]...[BEGIN:N]...[END:N]
   *
   * @private
   * @param {string} content - 模型返回的内容
   * @returns {Map<string, string>} 文件路径到内容的映射
   */
  parseIndexedFormat(content) {
    const parsedFiles = new Map();

    // 匹配 [FILE:N]FILE_PATH 格式
    const fileMarkerRegex = /\[FILE:(\d+)\]([^\n]+)/g;
    // 匹配 [BEGIN:N] 格式
    const beginMarkerRegex = /\[BEGIN:(\d+)\]/g;
    // 匹配 [END:N] 格式
    const endMarkerRegex = /\[END:(\d+)\]/g;

    // 收集所有文件标记及其位置
    const fileMarkers = [];
    let match;

    while ((match = fileMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      const filePath = match[2].trim();
      fileMarkers.push({ index, filePath, position: match.index });
    }

    // 收集所有 BEGIN 标记及其位置
    // 需要保存完整 match 对象，因为后面需要用 begin[0].length 获取标记长度
    const beginMarkers = [];
    while ((match = beginMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      beginMarkers.push({ index, position: match.index, matched: match[0] });
    }

    // 收集所有 END 标记及其位置
    // 需要保存完整 match 对象，因为后面需要用 end[0].length 获取标记长度
    const endMarkers = [];
    while ((match = endMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      endMarkers.push({ index, position: match.index, matched: match[0] });
    }

    // 按文件索引匹配 BEGIN 和 END
    for (const fileMarker of fileMarkers) {
      const index = fileMarker.index;
      const filePath = fileMarker.filePath;

      // 找到对应的 BEGIN
      const begin = beginMarkers.find(b => b.index === index);
      // 找到对应的 END
      const end = endMarkers.find(e => e.index === index);

      if (begin && end && begin.position > fileMarker.position && end.position > begin.position) {
        // 提取内容：FILE -> BEGIN -> content -> END
        // 内容从 BEGIN 之后到 END 之前
        // begin.matched 是 [BEGIN:N] 字符串，end.matched 是 [END:N] 字符串
        const contentStart = begin.position + begin.matched.length;
        const contentEnd = end.position;
        let fileContent = content.substring(contentStart, contentEnd).trim();

        // 清洗残留的标记
        fileContent = this.cleanMarkdownResiduals(fileContent);

        if (fileContent && !parsedFiles.has(filePath)) {
          parsedFiles.set(filePath, fileContent);
        }
      }
    }

    return parsedFiles;
  }

  /**
   * 清洗 markdown 格式残留
   * 处理模型返回时可能残留的 ```file:xxx 和 ```language 等标记
   *
   * @private
   * @param {string} content - 文件内容
   * @returns {string} 清洗后的内容
   */
  cleanMarkdownResiduals(content) {
    if (!content) return content;

    let cleaned = content;

    // 移除开头的 ```file:xxx\n```language\n 格式残留
    cleaned = cleaned.replace(/^```file:[^\n]+\n```\w*\n?/, '');

    // 移除开头的 ```language 残留
    cleaned = cleaned.replace(/^```\w+\n?/, '');

    // 移除末尾的 ``` 残留
    cleaned = cleaned.replace(/\n?```\s*$/, '');

    // 移除可能残留在代码开头的 ``` 标记
    const lines = cleaned.split('\n');
    const filteredLines = [];
    let skipLeadingBackticks = true;

    for (const line of lines) {
      // 如果整行只是 ``` 标记且我们还在跳过阶段，则跳过
      if (skipLeadingBackticks && line.trim() === '```') {
        continue;
      }
      // 一旦遇到非 ``` 的内容，就停止跳过
      if (!line.trim().startsWith('```')) {
        skipLeadingBackticks = false;
      }
      filteredLines.push(line);
    }

    cleaned = filteredLines.join('\n').trim();

    return cleaned;
  }

  /**
   * 推断文件语言
   *
   * @private
   * @param {string} filePath - 文件路径
   * 解析多文件输出内容
   * 从大模型返回的混合内容中提取各个文件的代码
   * @param {string} content - 大模型返回的混合内容
   * @param {string[]} targetFiles - 目标文件路径列表
   * @returns {Array<{filePath: string, content: string}>} 解析后的文件列表
   */
  parseMultiFileContent(content, targetFiles) {
    const results = [];

    // 首先清洗 markdown 格式残留（文件开头可能有 ```file:xxx 和 ```language 残留）
    content = this.cleanMarkdownResiduals(content);

    // 方法1：优先使用 [FILE:N]...[BEGIN:N]...[END:N] 格式解析
    const parsedFiles = this.parseIndexedFormat(content);

    // 方法2：如果方法1失败，尝试使用 ```file:path 格式解析
    if (parsedFiles.size === 0) {
      // 变体1：标准格式 ```file:path\n```language\ncode\n```
      const patterns = [
        /```file:([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g,
        // 变体2：没有语言标记 ```file:path\n```\ncode\n```
        /```file:([^\n]+)\n```\n([\s\S]*?)```/g,
        // 变体3：language 标记和 ``` 在同一行 ```file:path ```language\ncode\n```
        /```file:([^\n]+) ```(\w+)\n([\s\S]*?)```/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const filePath = match[1].trim();
          const fileContent = match[3].trim();
          if (filePath && fileContent && !parsedFiles.has(filePath)) {
            parsedFiles.set(filePath, fileContent);
          }
        }
        if (parsedFiles.size > 0) break;
      }
    }

    // 方法3：如果方法2失败，使用行级别解析
    if (parsedFiles.size === 0) {
      const lines = content.split('\n');
      let currentFile = null;
      let currentContent = [];
      let inCodeBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 检测文件标记开始
        const fileMarkerMatch = line.match(/^```file:(.+)$/);
        if (fileMarkerMatch) {
          // 保存上一个文件
          if (currentFile && currentContent.length > 0) {
            const contentStr = currentContent.join('\n').trim();
            if (contentStr) {
              parsedFiles.set(currentFile, this.cleanMarkdownResiduals(contentStr));
            }
          }
          // 开始新文件
          currentFile = fileMarkerMatch[1].trim();
          currentContent = [];
          inCodeBlock = false;
          continue;
        }

        // 检测代码块开始（``` 单独一行或 ```language 格式）
        if (line.match(/^```\w*$/)) {
          if (!inCodeBlock) {
            inCodeBlock = true;
          } else {
            // 代码块结束
            inCodeBlock = false;
          }
          continue;
        }

        // 如果在代码块内，收集内容
        if (inCodeBlock && currentFile) {
          currentContent.push(line);
        }
      }

      // 保存最后一个文件
      if (currentFile && currentContent.length > 0) {
        const contentStr = currentContent.join('\n').trim();
        if (contentStr) {
          parsedFiles.set(currentFile, this.cleanMarkdownResiduals(contentStr));
        }
      }
    }

    // 如果解析成功，为每个目标文件创建结果
    if (parsedFiles.size > 0) {
      for (const targetFile of targetFiles) {
        if (parsedFiles.has(targetFile)) {
          results.push({
            filePath: targetFile,
            content: parsedFiles.get(targetFile)
          });
        } else {
          // 尝试模糊匹配
          const matched = Array.from(parsedFiles.keys()).find(k =>
            k.endsWith(targetFile) || targetFile.endsWith(k)
          );
          if (matched) {
            results.push({
              filePath: targetFile,
              content: parsedFiles.get(matched)
            });
          } else {
            // 文件未找到，标记为失败
            console.warn(`File not found in response: ${targetFile}`);
            results.push({
              filePath: targetFile,
              content: `// ERROR: Content for ${targetFile} was not generated`
            });
          }
        }
      }
    } else {
      // 如果无法解析，按原样返回第一个文件
      console.warn('Could not parse multi-file output, falling back to single file');
      results.push({
        filePath: targetFiles[0],
        content: content
      });
    }

    return results;
  }

  /**
   * 根据文件路径和内容推断编程语言
   * @param {string} filePath - 文件路径
   * @param {string} content - 内容
   * @returns {string} 语言
   */
  inferLanguage(filePath, content) {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const extToLang = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      json: 'json',
      css: 'css',
      scss: 'scss',
      less: 'less',
      html: 'html',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml'
    };

    if (ext && extToLang[ext]) {
      return extToLang[ext];
    }

    // 根据内容推断
    if (content.includes('import ') || content.includes('export ')) {
      return 'javascript';
    }
    if (content.includes('def ') || content.includes('import ')) {
      return 'python';
    }

    return 'javascript'; // 默认
  }

  /**
   * 检查两个路径是否匹配（支持路径分隔符差异）
   * @private
   * @param {string} path1 - 路径1
   * @param {string} path2 - 路径2
   * @returns {boolean} 是否匹配
   */
  isPathMatch(path1, path2) {
    if (!path1 || !path2) return false;

    // 规范化路径：将反斜杠替换为正斜杠
    const normalizePath = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/');

    const normalized1 = normalizePath(path1);
    const normalized2 = normalizePath(path2);

    // 完全匹配
    if (normalized1 === normalized2) return true;

    // 检查文件名是否相同（最后一部分）
    const name1 = normalized1.split('/').pop();
    const name2 = normalized2.split('/').pop();
    return name1 === name2 && name1.length > 0;
  }

  /**
   * 使用依赖关系处理执行结果
   * @private
   * @param {Object[]} executionResults - 执行结果列表
   * @param {Object[]} subtasks - 子任务列表
   * @returns {CodeFile[]} 按依赖顺序排列的代码文件列表（同一路径已合并）
   */
  processExecutionResultsWithDependencies(executionResults, subtasks) {
    // 使用 IntegrationInterfaceProcessor 处理依赖关系
    const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);

    // 创建结果映射
    const resultMap = new Map();
    for (const result of executionResults) {
      resultMap.set(result.task_id, result);
    }

    // 【改进】先构建全局 toolCallFilesMap - 收集所有 executionResults 中的 toolCalls
    // 这样可以避免按顺序匹配导致的文件丢失问题
    const globalToolCallFilesMap = new Map();
    const globalToolCallEmptyFiles = new Set(); // 记录内容为空的文件

    for (const result of executionResults) {
      if (!result.toolCalls || !Array.isArray(result.toolCalls)) continue;

      // 提取问题清单
      if (!this.extractedIssueChecklists) this.extractedIssueChecklists = [];
      const checklist = this._extractIssueChecklistFromToolCalls(result.toolCalls);
      if (checklist) {
        this.extractedIssueChecklists.push(checklist);
        console.log(`[processExecutionResultsWithDependencies] 提取到问题清单: ${checklist.task}`);
      }

      // 遍历所有 toolCalls，提取 filePath -> content 映射
      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.name || toolCall.function?.name || '';
        const toolInput = toolCall.input || toolCall.function?.arguments || '{}';

        if (toolName === 'write_file' || toolName === 'Write') {
          try {
            const parsed = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
            const filePathInTool = parsed.file_path || parsed.filePath || parsed.path || '';
            const fileContent = parsed.content || '';

            if (filePathInTool) {
              const normalizedPath = filePathInTool.replace(/\\/g, '/').toLowerCase();

              if (fileContent) {
                // 内容非空，存储到 map
                globalToolCallFilesMap.set(normalizedPath, {
                  originalPath: filePathInTool,
                  content: fileContent,
                  fromTaskId: result.task_id
                });
              } else {
                // 内容为空，记录到空文件集合
                globalToolCallEmptyFiles.add(normalizedPath);
                globalToolCallFilesMap.set(normalizedPath, {
                  originalPath: filePathInTool,
                  content: null,
                  isEmpty: true,
                  fromTaskId: result.task_id
                });
              }
            }
          } catch (e) {
            console.warn(`[processExecutionResultsWithDependencies] 解析 toolCall JSON 失败:`, e.message);
          }
        }
      }
    }

    console.log(`[processExecutionResultsWithDependencies] 全局 toolCallFilesMap 构建完成，共 ${globalToolCallFilesMap.size} 个文件`);

    // 【新增】记录所有 deliverables 文件，用于后续缺失检测
    const allDeliverableFiles = new Set();
    for (const [filePath, tasks] of integrationData.filesToProcess.entries()) {
      const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
      allDeliverableFiles.add(normalizedPath);
    }

    // 构建按文件分组的有序任务
    const codeFiles = [];

    // 处理每个文件的有序任务
    for (const [filePath, tasks] of integrationData.filesToProcess.entries()) {
      const orderedTasks = IntegrationInterfaceProcessor.getOrderedTasks(integrationData, filePath);

      // 收集该文件路径的所有内容（按依赖顺序）
      const fileContents = [];
      let lastTask = null;

      for (const task of orderedTasks) {
        const result = resultMap.get(task.id);
        if (result) {
          // 清理大模型响应中的 thinking 标签内容
          let content = '';

          // 【改进后的逻辑】直接使用全局 globalToolCallFilesMap 进行匹配
          // 不再按顺序依赖，而是根据 filePath 直接映射
          const normalizedTargetPath = filePath.replace(/\\/g, '/').toLowerCase();

          // 第一步：尝试从全局 map 精确匹配
          if (globalToolCallFilesMap.has(normalizedTargetPath)) {
            const fileData = globalToolCallFilesMap.get(normalizedTargetPath);
            if (fileData.isEmpty) {
              console.log(`[processExecutionResultsWithDependencies] 文件存在但内容为空: ${filePath}`);
            } else {
              content = fileData.content;
              console.log(`[processExecutionResultsWithDependencies] 从全局 toolCalls 精确匹配: ${filePath} (来自 ${fileData.fromTaskId})`);
            }
          } else {
            // 第二步：尝试路径相似匹配
            let foundSimilar = false;
            for (const [storedPath, fileData] of globalToolCallFilesMap.entries()) {
              if (this.isPathMatch(filePath, fileData.originalPath)) {
                content = fileData.content;
                console.log(`[processExecutionResultsWithDependencies] 从全局 toolCalls 相似匹配: ${filePath} <- ${fileData.originalPath} (来自 ${fileData.fromTaskId})`);
                foundSimilar = true;
                break;
              }
            }

            // 第三步：如果仍未找到，不再使用后备内容，直接标记缺失
            if (!foundSimilar && !content) {
              console.log(`[processExecutionResultsWithDependencies] 警告: 文件 ${filePath} 在全局 toolCalls 中未找到对应内容`);
            }
          }

          // 如果没有从全局 toolCalls 提取到内容，则使用 result.content
          if (!content || content.trim() === '') {
            if (result.content) {
              content = MarkdownCodeCleaner.removeThinkingContent(result.content);
            } else if (result.success === false) {
              // 保留错误信息便于调试
              content = `/* Execution failed: ${result.error || 'Unknown error'} */\n`;
            }
          }

          // 最终保底
          if (!content || content.trim() === '') {
            content = `/* Empty result for task: ${task.id} */\n`;
          }

          // 【关键修复】检查内容是否包含 [FILE:N] 格式的多文件输出
          // 如果是，需要解析出当前 filePath 对应的内容，而不是使用整个 result.content
          if (content.includes('[FILE:') && content.includes('[BEGIN:') && content.includes('[END:')) {
            // 获取该任务的 targetFiles（如果有的话）
            const integrationHints = result.integrationHints || task.integrationHints || {};
            const targetFiles = integrationHints.targetFiles || [filePath];

            // 解析多文件内容 - parseMultiFileContent 返回 Array<{filePath, content}>
            const parsedFiles = this.parseMultiFileContent(content, targetFiles);

            // 如果解析成功且当前 filePath 有对应内容，则使用解析后的内容
            const found = parsedFiles.find(p => p.filePath === filePath);
            if (found) {
              content = found.content;
              this.logger.info(`[processExecutionResultsWithDependencies] 解析 [FILE:N] 格式成功: ${filePath}`);
            } else {
              // 解析失败或找不到对应文件，使用清理后的原始内容
              this.logger.warn(`[processExecutionResultsWithDependencies] 解析 [FILE:N] 格式失败或未找到文件: ${filePath}`);
            }
          }

          fileContents.push(content);
          lastTask = task;
        }
      }

      // 合并同一路径的所有内容
      const mergedContent = fileContents.join('\n\n'); // 使用双换行符分隔不同任务内容
      const firstTask = orderedTasks[0];
      const firstResult = resultMap.get(firstTask?.id);

      // 获取最后一个任务的 integrationHints（包含合并策略等信息）
      const lastTaskResult = resultMap.get(orderedTasks[orderedTasks.length - 1]?.id);
      const integrationHints = lastTaskResult?.integrationHints || lastTask?.integrationHints || {};

      // 推断语言
      const language = this.inferLanguage(filePath, mergedContent);

      // 创建合并后的文件对象
      codeFiles.push({
        path: filePath,
        content: mergedContent,
        sourceTaskId: orderedTasks.map(t => t.id).join(','),
        modelUsed: firstResult?.model_used || 'unknown',
        language,
        integrationHints,
        mergedFrom: orderedTasks.map(t => ({
          taskId: t.id,
          content: resultMap.get(t.id)?.content || ''
        })).filter(item => item.content) // 过滤掉空内容
      });
    }

    // 【单 tool_call 检测】检查是否发生了"只生成了第一个文件"的问题
    this._detectSingleToolCallIssue(resultMap, integrationData);

    // 【新增】缺失检测：检查哪些 deliverables 文件在 toolCalls 中没有对应内容
    const matchedFiles = new Set();
    for (const codeFile of codeFiles) {
      const normalizedPath = codeFile.path.replace(/\\/g, '/').toLowerCase();
      // 只有非空文件才算匹配成功
      if (codeFile.content && !codeFile.content.includes('/* Empty result for task:') &&
          !codeFile.content.includes('/* Execution failed:')) {
        matchedFiles.add(normalizedPath);
      }
    }

    // 检查所有 deliverables 文件
    const missingFiles = [];
    for (const expectedPath of allDeliverableFiles) {
      if (!matchedFiles.has(expectedPath)) {
        missingFiles.push(expectedPath);
      }
    }

    if (missingFiles.length > 0) {
      console.warn(`[processExecutionResultsWithDependencies] 检测到 ${missingFiles.length} 个文件缺失或为空:`);
      for (const mf of missingFiles) {
        console.warn(`  - ${mf}`);
      }
    } else {
      console.log(`[processExecutionResultsWithDependencies] 所有 deliverables 文件都已匹配成功`);
    }

    return codeFiles;
  }

  /**
   * 检测单 tool_call 问题
   * 当模型不支持 multi_tool_call 时，可能只生成第一个文件
   * @private
   * @param {Map} resultMap - task_id -> result 的映射
   * @param {Object} integrationData - 整合数据
   */
  _detectSingleToolCallIssue(resultMap, integrationData) {
    for (const [taskId, result] of resultMap.entries()) {
      if (!result.toolCalls || !Array.isArray(result.toolCalls)) continue;

      // 获取该任务预期的文件数
      const task = Array.from(integrationData.filesToProcess.values())
        .flat()
        .find(t => t.id === taskId);

      if (!task) continue;

      const hints = task.integrationHints || {};
      const targetFiles = hints.targetFiles || (hints.targetFile ? [hints.targetFile] : []);
      const expectedFileCount = targetFiles.length;

      // 计算实际的 write_file 调用数量
      const actualToolCallCount = result.toolCalls.filter(
        tc => (tc.name === 'write_file' || tc.function?.name === 'write_file')
      ).length;

      // 如果预期多个文件但实际只有 1 个 tool_call，发出警告并添加到恢复队列
      if (expectedFileCount > 1 && actualToolCallCount === 1) {
        this.logger.warn(`[单 tool_call 检测] 任务 ${taskId} 预期生成 ${expectedFileCount} 个文件，但只返回了 1 个 tool_call`);
        this.logger.warn(`[单 tool_call 检测] 这可能是模型不支持 multi_tool_call 导致的文件缺失`);

        // 将缺失文件添加到恢复队列
        const missingFiles = targetFiles.slice(1); // 除第一个外的所有文件
        for (const filePath of missingFiles) {
          this.recoveryQueue.push({
            filePath,
            originalTaskId: taskId,
            reason: 'single_tool_call_recovery',
            modelUsed: result.model_used || 'unknown'
          });
          this.logger.info(`[恢复队列] 添加缺失文件: ${filePath}`);
        }

        // 级联检查前端文件的 CSS 依赖
        this._cascadeCssCheck(targetFiles);

        this.logger.warn(`[单 tool_call 检测] 建议：对于模型 ${result.model_used || 'unknown'}，不使用 conflict_sensitive_groups 合并策略`);
      }
    }
  }

  /**
   * 级联检查前端文件的 CSS 依赖
   * 当检测到前端 .tsx/.jsx 文件缺失时，检查其对应的 CSS 文件
   * @private
   * @param {string[]} targetFiles - 目标文件列表
   */
  _cascadeCssCheck(targetFiles) {
    for (const filePath of targetFiles) {
      // 检查是否是前端页面文件
      if (filePath.startsWith('src/pages/') || filePath.startsWith('src/components/')) {
        // 尝试对应的 CSS 文件路径
        let cssFile = filePath;
        if (filePath.endsWith('.tsx')) {
          cssFile = filePath.replace('.tsx', '.css');
        } else if (filePath.endsWith('.jsx')) {
          cssFile = filePath.replace('.jsx', '.css');
        }

        // 如果 CSS 文件也在目标列表中但不在恢复队列中，添加到恢复队列
        if (targetFiles.includes(cssFile)) {
          const alreadyQueued = this.recoveryQueue.some(
            item => item.filePath === cssFile && item.reason === 'cascade_css_recovery'
          );
          if (!alreadyQueued) {
            this.recoveryQueue.push({
              filePath: cssFile,
              reason: 'cascade_css_recovery',
              relatedFile: filePath
            });
            this.logger.info(`[恢复队列] 添加级联 CSS 文件: ${cssFile}`);
          }
        }
      }
    }
  }

  /**
   * 获取恢复队列中的文件列表
   * @returns {Array} 恢复队列
   */
  getRecoveryQueue() {
    return this.recoveryQueue;
  }

  /**
   * 清空恢复队列
   */
  clearRecoveryQueue() {
    this.recoveryQueue = [];
  }

  /**
   * 解决冲突
   *
   * @private
   * @param {Object[]} conflicts - 冲突列表
   * @param {CodeFile[]} codeFiles - 文件列表
   * @returns {Promise<void>}
   */
  async resolveConflicts(conflicts, codeFiles) {
    const filesMap = new Map(codeFiles.map((f) => [f.path, f]));

    for (const conflict of conflicts) {
      if (conflict.type === 'file_content_mismatch') {
        // 文件内容冲突，尝试自动重命名解决
        const renamer = this.autoRenamer;

        for (const version of conflict.versions.slice(1)) {
          const newName = renamer.generateUniqueName(
            conflict.path.split('/').pop()?.split('.')[0] || 'conflicted',
            version.sourceTaskId
          );

          await renamer.renameInContent(
            version.content,
            conflict.path,
            newName,
            version.language,
            version.path,
            filesMap
          );
        }
      } else if (conflict.type === 'merge_strategy_conflict') {
        // 合并策略冲突，使用默认策略
        console.warn(`Using default strategy for merge strategy conflict: ${conflict.path}`);
      }
    }
  }

  /**
   * 格式化整合结果
   *
   * @param {Object} result - 整合结果
   * @param {string} format - 输出格式
   * @param {Object} options - 格式化选项
   * @returns {string} 格式化后的输出
   */
  formatOutput(result, format = OutputFormat.JSON, options = {}) {
    return this.outputFormatter.format(result, format, options);
  }

  /**
   * 检测模型是否遵循任务要求
   * 通过对比任务的期望关键词与模型 thinking 内容来检测模型是否忽略任务
   *
   * @private
   * @param {Object[]} executionResults - 执行结果列表
   * @param {Object[]} subtasks - 子任务列表
   * @returns {Array<{taskId: string, compliant: boolean, reason: string, expectedKeywords: string[], detectedKeywords: string[], thinking: string}>}
   */
  checkModelCompliance(executionResults, subtasks) {
    const results = [];

    // 定义常见任务类型及其期望关键词
    const taskTypeKeywords = {
      'ecommerce': ['电商', '购物', '商品', '订单', '购物车', 'e-commerce', 'shopping', 'product', 'cart', 'order'],
      '3d': ['three', '3d', 'webgl', 'drei', 'fiber', 'globe', 'earth', '球体', '3维'],
      'blog': ['博客', '文章', 'post', 'blog', 'markdown', '评论', 'comment'],
      'dashboard': ['仪表盘', 'dashboard', '图表', 'chart', '统计', 'analytics'],
      'social': ['社交', 'social', 'feed', '好友', 'friend', 'post', 'timeline']
    };

    for (const result of executionResults) {
      const subtask = subtasks.find(s => s.id === result.task_id);
      if (!subtask) continue;

      // 获取 thinking 内容（可能来自 result.thinking 或 raw_response）
      let thinking = result.thinking || '';
      if (!thinking && result.raw_response?.content) {
        const thinkingItem = result.raw_response.content.find(item => item.type === 'thinking');
        if (thinkingItem?.thinking) {
          thinking = thinkingItem.thinking;
        }
      }

      // 【关键修复】获取生成的代码内容（优先从 toolCalls，其次从 content）
      let generatedContent = '';

      // 优先从 toolCalls 提取代码
      if (result.toolCalls && Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
        for (const toolCall of result.toolCalls) {
          const toolName = toolCall.name || toolCall.function?.name || '';
          const toolInput = toolCall.input || toolCall.function?.arguments || '{}';
          if (toolName === 'write_file' || toolName === 'Write') {
            try {
              const parsed = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
              generatedContent = parsed.content || '';
              if (generatedContent.trim()) break;
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 如果没有从 toolCalls 提取到内容，使用 result.content
      if (!generatedContent || generatedContent.trim() === '') {
        generatedContent = result.content || '';
      }

      // 获取任务描述和需求
      const description = subtask.description || '';
      const requirement = subtask.requirement || '';
      const combinedText = `${description} ${requirement}`.toLowerCase();

      // 检测期望的关键词类型
      let detectedType = null;
      let expectedKeywords = [];

      for (const [type, keywords] of Object.entries(taskTypeKeywords)) {
        const foundInTask = keywords.filter(kw => combinedText.includes(kw.toLowerCase()));
        if (foundInTask.length > 0) {
          detectedType = type;
          expectedKeywords = foundInTask;
          break;
        }
      }

      // 如果没有识别到特定类型，跳过检测
      if (!detectedType || expectedKeywords.length === 0) {
        results.push({
          taskId: result.task_id,
          compliant: true,
          reason: 'No specific task type detected',
          expectedKeywords: [],
          detectedKeywords: [],
          thinking: thinking?.substring(0, 200)
        });
        continue;
      }

      // 检测 thinking 中是否包含期望的关键词
      const thinkingLower = thinking.toLowerCase();
      const foundInThinking = expectedKeywords.filter(kw => thinkingLower.includes(kw.toLowerCase()));

      // 检测生成的代码中是否包含期望的关键词
      const generatedLower = generatedContent.toLowerCase();
      const foundInGenerated = expectedKeywords.filter(kw => generatedLower.includes(kw.toLowerCase()));

      // 检测是否有不期望的关键词（如电商任务但代码提到 three.js, drei 等）
      const unexpectedKeywords = [];
      const conflictingKeywords = {
        'ecommerce': ['three', 'drei', '@react-three', 'webgl', 'globe', 'earth', 'sphere', 'stars'],
        '3d': ['shopping', 'cart', 'product', 'order', '电商', '购物车']
      };

      if (conflictingKeywords[detectedType]) {
        for (const kw of conflictingKeywords[detectedType]) {
          if (generatedLower.includes(kw.toLowerCase())) {
            unexpectedKeywords.push(kw);
          }
        }
      }

      // 判断是否遵循任务要求
      const compliant = unexpectedKeywords.length === 0;

      let reason = '';
      if (!compliant) {
        reason = `任务要求 ${detectedType} 但生成的代码包含不相关的 ${unexpectedKeywords.join(', ')}`;
      }

      results.push({
        taskId: result.task_id,
        compliant,
        reason,
        expectedKeywords,
        detectedKeywords: foundInGenerated,
        thinking: thinking?.substring(0, 500)
      });
    }

    return results;
  }

  /**
   * 验证类型契约
   * TypeScript 语法验证和字段类型与 shared_context.types 的一致性检查
   *
   * @param {Map<string, CodeFile>} files - 文件映射
   * @param {Object} sharedContext - 共享上下文（包含 types 定义）
   * @returns {Object} 验证结果 { valid: boolean, errors: string[], warnings: string[] }
   */
  validateTypeContract(files, sharedContext = {}) {
    const errors = [];
    const warnings = [];

    // 如果没有 sharedContext.types，直接返回通过
    if (!sharedContext.types || Object.keys(sharedContext.types).length === 0) {
      return { valid: true, errors: [], warnings: [] };
    }

    // 找出所有类型文件
    const typeFiles = [];
    for (const [path, file] of files) {
      if (path.includes('types/') || path.includes('/types') ||
          path.endsWith('.d.ts') || path.includes('@types/')) {
        typeFiles.push({ path, content: file.content });
      }
    }

    // 验证每个类型文件
    for (const { path, content } of typeFiles) {
      // 检查是否有语法错误（基本的括号匹配检查）
      const syntaxErrors = this._checkTypeScriptSyntax(content);
      if (syntaxErrors.length > 0) {
        errors.push(`类型文件 ${path} 存在语法错误: ${syntaxErrors.join(', ')}`);
      }

      // 检查字段类型一致性
      const typeInconsistencies = this._checkFieldTypeConsistency(content, sharedContext.types);
      if (typeInconsistencies.length > 0) {
        warnings.push(`类型文件 ${path} 存在类型不一致: ${typeInconsistencies.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 检查 TypeScript 语法（基本检查）
   * @private
   */
  _checkTypeScriptSyntax(content) {
    const errors = [];

    // 检查括号匹配
    const brackets = { '{': '}', '[': ']', '(': ')' };
    const stack = [];

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '{' || char === '[' || char === '(') {
        stack.push(char);
      } else if (char === '}' || char === ']' || char === ')') {
        const last = stack.pop();
        if (last && brackets[last] !== char) {
          errors.push(`第 ${i + 1} 行: 括号不匹配，期望 '${brackets[last]}' 但得到 '${char}'`);
        }
      }
    }

    if (stack.length > 0) {
      errors.push(`未闭合的括号: '${stack.pop()}'`);
    }

    // 检查 interface 声明是否完整
    const interfaceRegex = /interface\s+\w+\s*\{/g;
    const interfaceCloses = (content.match(/interface\s+\w+\s*\{[^}]*\}/g) || []).length;
    const interfaceOpens = (content.match(interfaceRegex) || []).length;
    if (interfaceOpens !== interfaceCloses) {
      errors.push(`interface 声明不完整: ${interfaceOpens} 个开始，${interfaceCloses} 个完整定义`);
    }

    // 检查 type 声明是否完整
    const typeRegex = /type\s+\w+\s*=/g;
    const typeDefines = (content.match(/type\s+\w+\s*=\s*[^;]+;/g) || []).length;
    const typeOpens = (content.match(typeRegex) || []).length;
    if (typeOpens !== typeDefines) {
      errors.push(`type 声明不完整: ${typeOpens} 个开始，${typeDefines} 个完整定义`);
    }

    return errors;
  }

  /**
   * 检查字段类型与 shared_context.types 的一致性
   * @private
   */
  _checkFieldTypeConsistency(content, definedTypes) {
    const inconsistencies = [];

    for (const [typeName, typeDef] of Object.entries(definedTypes)) {
      // 查找 content 中对该类型的定义
      const interfaceMatch = content.match(new RegExp(`interface\\s+${typeName}\\s*\\{([^}]*)\\}`, 'g'));

      if (interfaceMatch) {
        const fields = interfaceMatch[0];
        // 检查类型定义的字段
        if (typeDef.properties) {
          for (const [fieldName, fieldType] of Object.entries(typeDef.properties)) {
            // 检查字段是否存在
            if (!fields.includes(fieldName)) {
              inconsistencies.push(`类型 ${typeName} 缺少字段: ${fieldName}`);
            }
          }
        }
      }
    }

    return inconsistencies;
  }

  /**
   * 将 Mock import 替换为真实 API
   * 整合阶段将 Mock import 替换为真实 API 调用
   *
   * @param {Map<string, CodeFile>} files - 文件映射
   * @param {Object} options - 配置选项
   * @param {string} options.mockModule - Mock 模块路径 (默认: './mocks/api')
   * @param {string} options.realApiModule - 真实 API 模块路径
   * @param {string} options.apiBaseUrl - API 基础 URL
   * @returns {Map<string, CodeFile>} 替换后的文件映射
   */
  replaceMockWithRealAPI(files, options = {}) {
    const {
      mockModule = './mocks/api',
      realApiModule = null,
      apiBaseUrl = null
    } = options;

    const result = new Map();

    for (const [path, file] of files) {
      let content = file.content;

      // 替换 Mock import 为真实 API
      if (realApiModule) {
        content = content.replace(
          new RegExp(`import\\s+\\{[^}]*apiClient[^}]*\\}\\s+from\\s+['"]${mockModule}['"]`, 'g'),
          `import { apiClient } from '${realApiModule}'`
        );
      }

      // 如果提供了 API Base URL，替换配置
      if (apiBaseUrl) {
        // 替换 ApiClient 构造函数中的 baseUrl
        content = content.replace(
          /new\s+ApiClient\s*\([^)]*\)/g,
          `new ApiClient('${apiBaseUrl}')`
        );
      }

      result.set(path, { ...file, content });
    }

    return result;
  }
}

module.exports = { Integrator };
