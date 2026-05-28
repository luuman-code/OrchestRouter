/**
 * @fileoverview Integrator - 整合器模块入口
 *
 * 负责将多个子任务的执行结果合并为一个完整的、可运行的代码库
 */

const { Integrator } = require('./integrator');
const { FileOrganizer } = require('./file/organizer');
const { ConflictDetector } = require('./file/conflict');
const { ImportAnalyzer } = require('./dependency/analyzer');
const { DependencyGraph } = require('./dependency/graph');
const { PathResolver } = require('./dependency/path-resolver');
const { DependencyInjector } = require('./dependency/injector');
const { NamingConflictResolver } = require('./conflict/detector');
const { AutoRenamer } = require('./conflict/renamer');
const { LLMConflictResolver } = require('./conflict/llm_resolver');
const { CodeFormatter } = require('./style/formatter');
const { EntryPointGenerator, ExportNamingStrategies } = require('./entry/generator');
const { CompletenessValidator } = require('./validation/completeness');
const { ExecutionQualityEvaluator } = require('./execution/quality_evaluator');
const { QualityFeedbackProcessor } = require('./execution/quality_feedback_processor');
const { IntegrationInterfaceProcessor } = require('./interface/processor');
const { MergeStrategyHandler } = require('./interface/merge_handler');
const { OutputFormatter, OutputFormat } = require('./output/formatter');
const { PluginManager } = require('./plugins/plugin_manager');
const { RuntimeDependencyManager, BUILTIN_MODULES } = require('./dependencies/runtime_dependency_manager');
const { CacheManager, SimpleCache, PersistentDependencyGraphCache, SymbolExtractionCache } = require('./cache/cache_manager');

module.exports = {
  // 主整合器
  Integrator,

  // 文件处理模块
  FileOrganizer,
  ConflictDetector,

  // 依赖处理模块
  ImportAnalyzer,
  DependencyGraph,
  PathResolver,
  DependencyInjector,

  // 冲突解决模块
  NamingConflictResolver,
  AutoRenamer,
  LLMConflictResolver,

  // 代码风格模块
  CodeFormatter,

  // 入口生成模块
  EntryPointGenerator,
  ExportNamingStrategies,

  // 完整性校验模块
  CompletenessValidator,

  // 执行质量模块
  ExecutionQualityEvaluator,
  QualityFeedbackProcessor,

  // 整合器接口模块
  IntegrationInterfaceProcessor,
  MergeStrategyHandler,

  // 输出格式化模块
  OutputFormatter,
  OutputFormat,

  // 插件系统
  PluginManager,

  // 运行时依赖管理
  RuntimeDependencyManager,
  BUILTIN_MODULES,

  // 缓存管理
  CacheManager,
  SimpleCache,
  PersistentDependencyGraphCache,
  SymbolExtractionCache
};
