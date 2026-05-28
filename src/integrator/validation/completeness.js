/**
 * @fileoverview CompletenessValidator - 完整性校验器
 *
 * 验证整合后的代码库是否完整
 * 从 subtask.integrationHints 提取预期文件列表
 */

const fs = require('fs');
const path = require('path');

/**
 * ExpectedFileSource - 预期文件来源
 *
 * @typedef {Object} ExpectedFileSource
 * @property {'decomposer'|'taskRequirements'|'userConfig'|'inferred'} source - 来源
 * @property {Object} data - 数据
 */

/**
 * ValidationResult - 验证结果
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} success - 是否成功
 * @property {string[]} missingFiles - 缺失的文件列表
 * @property {string[]} extraFiles - 多余的文件列表
 * @property {string} message - 消息
 * @property {string[]} [warnings] - 警告信息
 * @property {Object} [expectedFileSources] - 预期文件来源详情
 * @property {string[]} [expectedFileSources.fromDecomposer] - 来自 decomposer
 * @property {string[]} [expectedFileSources.fromRequirements] - 来自任务需求
 * @property {string[]} [expectedFileSources.fromUserConfig] - 来自用户配置
 * @property {string[]} [expectedFileSources.inferred] - 推断的文件
 */

/**
 * CompletenessValidator - 完整性校验器
 *
 * 验证文件完整性，支持多来源预期文件合并
 */
class CompletenessValidator {
  /**
   * 创建完整性校验器
   *
   * @param {ExpectedFileSource[]} [sources] - 预期文件来源
   * @param {Object} [logger] - 日志记录器
   * @param {string[]} [configPaths] - 【新增】配置文件路径列表
   */
  constructor(sources, logger, configPaths) {
    /** @type {ExpectedFileSource[]} */
    this.expectedFileSources = sources || [];
    /** @type {Object} */
    this.logger = logger || console;
    /** @type {string[]} */
    this.configPaths = configPaths || [
      './claude-config.json',
      './.claude/config.json',
      './config.json'
    ];
  }

  /**
   * 验证文件完整性（主入口）- 改进版
   *
   * @param {Object[]} subtasks - 子任务列表
   * @param {Map<string, CodeFile>} actualFiles - 实际文件列表
   * @returns {ValidationResult} 验证结果
   */
  validate(subtasks, actualFiles) {
    // 从各个来源提取预期文件
    const fromDecomposer = CompletenessValidator.extractExpectedFilesFromSubtasks(
      subtasks
    );
    const fromRequirements = CompletenessValidator.extractExpectedFilesFromRequirements(
      subtasks.map((s) => s.description).join('\n')
    );
    const fromUserConfig = this.extractExpectedFilesFromUserConfig();
    const fromInference = this.inferExpectedFiles(actualFiles);

    // 按照优先级合并预期文件，并记录警告
    const { mergedFiles, warnings } = this.mergeExpectedFilesByPriority(
      fromDecomposer,
      fromRequirements,
      fromUserConfig,
      fromInference
    );

    // 执行实际验证
    const { missingFiles, extraFiles } = this.validateInternal(
      mergedFiles,
      actualFiles
    );

    // 构建验证结果
    return {
      success: missingFiles.length === 0 && extraFiles.length === 0,
      missingFiles,
      extraFiles,
      message: `验证完成：${missingFiles.length} 个缺失，${extraFiles.length} 个多余`,
      warnings,
      expectedFileSources: {
        fromDecomposer,
        fromRequirements,
        fromUserConfig,
        inferred: fromInference
      }
    };
  }

  /**
   * 合并来自不同来源的预期文件，应用优先级规则
   *
   * @private
   * @param {string[]} fromDecomposer - 来自 Decomposer
   * @param {string[]} fromRequirements - 来自任务需求
   * @param {string[]} fromUserConfig - 来自用户配置
   * @param {string[]} fromInference - 来自推断
   * @returns {{mergedFiles: string[], warnings: string[]}} 合并结果
   */
  mergeExpectedFilesByPriority(
    fromDecomposer,
    fromRequirements,
    fromUserConfig,
    fromInference
  ) {
    const warnings = [];
    const mergedFilesSet = new Set();

    // P0: 从 Decomposer 的 integrationHints - 最高优先级
    for (const file of fromDecomposer) {
      mergedFilesSet.add(file);
    }

    // 检查并警告来自任务需求的文件被忽略
    if (fromRequirements.length > 0 && fromDecomposer.length > 0) {
      const ignoredRequirements = fromRequirements.filter(
        (f) => !mergedFilesSet.has(f)
      );
      if (ignoredRequirements.length > 0) {
        warnings.push(
          `警告：由于来自 Decomposer 的 integrationHints 存在更高优先级文件，忽略了来自任务需求的以下文件：${ignoredRequirements.join(
            ', '
          )}`
        );
      }
    }

    // P1: 任务需求解析 - 次高优先级（仅在 P0 为空时使用或作为补充）
    for (const file of fromRequirements) {
      if (!mergedFilesSet.has(file)) {
        mergedFilesSet.add(file);
      }
    }

    // 检查并警告来自用户配置的文件被忽略
    if (
      fromUserConfig.length > 0 &&
      (fromDecomposer.length > 0 || fromRequirements.length > 0)
    ) {
      const ignoredConfig = fromUserConfig.filter(
        (f) => !mergedFilesSet.has(f)
      );
      if (ignoredConfig.length > 0) {
        warnings.push(
          `警告：由于存在更高优先级的文件来源，忽略了来自用户配置的以下文件：${ignoredConfig.join(
            ', '
          )}`
        );
      }
    }

    // P1: 用户配置 - 次高优先级（补充）
    for (const file of fromUserConfig) {
      if (!mergedFilesSet.has(file)) {
        mergedFilesSet.add(file);
      }
    }

    // 检查并警告推断的文件被忽略
    if (
      fromInference.length > 0 &&
      (fromDecomposer.length > 0 ||
        fromRequirements.length > 0 ||
        fromUserConfig.length > 0)
    ) {
      const ignoredInferred = fromInference.filter(
        (f) => !mergedFilesSet.has(f)
      );
      if (ignoredInferred.length > 0) {
        warnings.push(
          `警告：由于存在更高优先级的文件来源，忽略了推断的以下文件：${ignoredInferred.join(
            ', '
          )}`
        );
      }
    }

    // P2: 推断 - 最低优先级（补充）
    for (const file of fromInference) {
      if (!mergedFilesSet.has(file)) {
        mergedFilesSet.add(file);
      }
    }

    return {
      mergedFiles: Array.from(mergedFilesSet),
      warnings
    };
  }

  /**
   * 从用户配置提取预期文件
   *
   * @private
   * @returns {string[]} 预期文件列表
   */
  extractExpectedFilesFromUserConfig() {
    const config = this.loadUserConfig();
    return config.expectedFiles || [];
  }

  /**
   * 加载用户配置
   *
   * @private
   * @returns {{expectedFiles?: string[]}} 用户配置
   */
  loadUserConfig() {
    try {
      // 【修复】使用构造函数传入的配置文件路径
      for (const configPath of this.configPaths) {
        if (fs.existsSync(configPath)) {
          return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      }

      // 如果没有找到配置文件，返回空配置
      return {};
    } catch (error) {
      this.logger.warn(`无法加载用户配置：${error.message}`);
      return {};
    }
  }

  /**
   * 从 subtask.integrationHints 提取预期文件列表
   *
   * @static
   * @param {Object[]} subtasks - 子任务列表
   * @returns {string[]} 预期文件列表
   */
  static extractExpectedFilesFromSubtasks(subtasks) {
    const files = [];

    for (const subtask of subtasks) {
      if (subtask.integrationHints) {
        const hints = subtask.integrationHints;

        // 【修复】处理 targetFiles (复数) - 支持合并任务中的多文件场景
        if (hints.targetFiles && Array.isArray(hints.targetFiles)) {
          files.push(...hints.targetFiles);
        }

        // 原有逻辑：处理 targetFile (单数)
        if (hints.targetFile) {
          if (Array.isArray(hints.targetFile)) {
            files.push(...hints.targetFile);
          } else {
            files.push(hints.targetFile);
          }
        }
      }
    }

    // 去重
    return [...new Set(files)];
  }

  /**
   * 从任务需求中提取预期文件（解析 prompt 或 requirements）
   *
   * @static
   * @param {string} requirements - 需求描述
   * @returns {string[]} 预期文件列表
   */
  static extractExpectedFilesFromRequirements(requirements) {
    // 使用正则表达式匹配可能的文件路径模式
    const filePattern = /(?:\b|\[["'])((?:\.{1,2}\/|\/)?[\w\-./]+\.(?:js|ts|jsx|tsx|py|json|css|html|md)) (?:["'\]]|\b)/g;
    const matches = requirements.match(filePattern) || [];

    // 清理匹配结果，只保留路径部分
    const files = matches
      .map((match) => {
        return match.replace(/^['"]|['"]$/g, '').trim();
      })
      .filter((path) => path.length > 0);

    // 去重
    return [...new Set(files)];
  }

  /**
   * 验证文件完整性（内部方法）
   *
   * @private
   * @param {string[]} expectedFiles - 预期文件列表
   * @param {Map<string, CodeFile>} actualFiles - 实际文件列表
   * @returns {{missingFiles: string[], extraFiles: string[]}} 验证结果
   */
  validateInternal(expectedFiles, actualFiles) {
    const expectedSet = new Set(expectedFiles);
    const actualSet = new Set(actualFiles.keys());

    const missingFiles = Array.from(expectedSet).filter(
      (file) => !actualSet.has(file)
    );
    const extraFiles = Array.from(actualSet).filter(
      (file) => !expectedSet.has(file)
    );

    return { missingFiles, extraFiles };
  }

  /**
   * 生成验证报告
   *
   * @param {string[]} missing - 缺失文件列表
   * @param {string[]} extra - 多余文件列表
   * @returns {string} 验证报告
   */
  generateReport(missing, extra) {
    const reportParts = ['=== 完整性验证报告 ===', ''];

    if (missing.length === 0 && extra.length === 0) {
      reportParts.push(
        '✅ 代码库完整性验证通过，没有缺失或多余的文件。'
      );
    } else {
      if (missing.length > 0) {
        reportParts.push(`⚠️  发现 ${missing.length} 个缺失的文件:`);
        for (const file of missing) {
          reportParts.push(`  - ${file}`);
        }
        reportParts.push('');
      }

      if (extra.length > 0) {
        reportParts.push(`💡 发现 ${extra.length} 个多余的文件:`);
        for (const file of extra) {
          reportParts.push(`  - ${file}`);
        }
        reportParts.push('');
      }
    }

    return reportParts.join('\n');
  }

  /**
   * 推断预期文件（基于文件结构和依赖关系）
   *
   * @private
   * @param {Map<string, CodeFile>} files - 文件列表
   * @returns {string[]} 推断的预期文件
   */
  inferExpectedFiles(files) {
    const inferredFiles = [];

    // 基于现有文件和它们之间的依赖关系来推断应该存在的文件
    // 例如：如果有 index.js 引用了 ./components/Header，可能需要推断 Header.js 文件的存在

    // 这里可以实现更复杂的推断逻辑
    // 比如分析文件中的导入语句来推断依赖的文件

    return inferredFiles;
  }
}

module.exports = { CompletenessValidator };
