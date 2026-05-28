/**
 * 冲突解决器
 *
 * 功能块 F：检测并解决文件路径冲突
 * 确保多个子任务不会同时修改同一文件的同一区域
 *
 * 包含：
 * - FilePathConflictDetector: 文件路径冲突检测器
 * - MergeStrategy: 合并策略
 * - PartitionStrategy: 分区策略
 * - RenameStrategy: 重命名策略
 * - ComprehensiveConflictResolver: 综合冲突解决器
 */

const { EnhancedSubtask } = require('./PromptGenerator');

/**
 * FilePathConflictDetector - 文件路径冲突检测器
 */
class FilePathConflictDetector {
  constructor() {
    this.conflictStrategies = ['merge', 'partition', 'rename', 'error'];
  }

  /**
   * 检测冲突
   * @param {Array} subtasks - 子任务列表
   * @returns {Object} 冲突检测结果
   */
  detectConflicts(subtasks) {
    const filePathMap = new Map();
    const conflicts = [];

    subtasks.forEach((task, index) => {
      const paths = this.extractFilePaths(task);
      paths.forEach(path => {
        if (!filePathMap.has(path)) {
          filePathMap.set(path, []);
        }
        filePathMap.get(path).push({
          taskIndex: index,
          taskId: task.id,
          task: task
        });
      });
    });

    for (const [path, tasks] of filePathMap) {
      if (tasks.length > 1) {
        conflicts.push({
          path: path,
          conflictingTasks: tasks,
          severity: this.assessSeverity(tasks),
          suggestedStrategy: this.getSuggestedStrategy(path, tasks)
        });
      }
    }

    return {
      conflicts,
      hasConflicts: conflicts.length > 0,
      resolutionSuggestions: this.generateResolutionSuggestions(conflicts)
    };
  }

  /**
   * 提取文件路径
   * 注意：只从明确指定的字段提取，不从 prompt/description 内容中提取
   * 因为 prompt 中会包含对其他文件的引用，导致误判为路径冲突
   */
  extractFilePaths(task) {
    const paths = [];

    // 只从明确指定的字段提取路径
    if (task.filePath) paths.push(task.filePath);
    if (task.filePathHint) paths.push(task.filePathHint);
    if (task.context && task.context.files) paths.push(...task.context.files);
    if (task.integrationHints && task.integrationHints.targetFile) {
      paths.push(task.integrationHints.targetFile);
    }
    // 额外检查：如果是合并后的任务，从 mergedHints.targetFiles 中提取
    if (task.integrationHints && task.integrationHints.targetFiles) {
      paths.push(...task.integrationHints.targetFiles);
    }

    return [...new Set(paths)];
  }

  /**
   * 评估冲突严重程度
   */
  assessSeverity(tasks) {
    const fileTypes = tasks.map(t => this.getFileExtension(t.task));
    const uniqueTypes = new Set(fileTypes);

    // 如果所有任务都是同一文件类型，严重程度高
    if (uniqueTypes.size === 1) return 'high';

    // 如果有明确路径提示，严重程度中等
    const hasExplicitPaths = tasks.some(t => t.task.filePathHint || t.task.filePath);
    return hasExplicitPaths ? 'medium' : 'low';
  }

  /**
   * 获取建议的解决策略
   */
  getSuggestedStrategy(path, tasks) {
    const fileExt = this.getFileExtension(path);
    // 使用 types 数组，提取每个任务的主类型
    const taskTypes = tasks.map(t => {
      const types = t.task.types || [];
      return types.length > 0 ? types[0].type : 'unknown';
    });

    // 对于组件文件，多种类型修改建议合并
    if (['.jsx', '.tsx', '.vue', '.svelte'].includes(fileExt) && new Set(taskTypes).size > 1) {
      return 'merge';
    }

    // 对于代码文件，建议分区
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs'].includes(fileExt) && tasks.length > 1) {
      return 'partition';
    }

    // 其他情况建议重命名
    return 'rename';
  }

  /**
   * 获取文件扩展名
   */
  getFileExtension(path) {
    if (typeof path !== 'string') return '';
    const matches = path.match(/\.[A-Za-z0-9]+$/);
    return matches ? matches[0].toLowerCase() : '';
  }

  /**
   * 生成解决建议
   */
  generateResolutionSuggestions(conflicts) {
    return conflicts.map(conflict => ({
      path: conflict.path,
      strategy: conflict.suggestedStrategy,
      severity: conflict.severity,
      affectedTasks: conflict.conflictingTasks.map(t => t.taskId),
      description: this.getStrategyDescription(conflict.suggestedStrategy, conflict.path)
    }));
  }

  /**
   * 获取策略描述
   */
  getStrategyDescription(strategy, path) {
    switch (strategy) {
      case 'merge':
        return `将多个任务合并到 ${path}，在不同代码区域进行修改`;
      case 'partition':
        return `将任务分区到 ${path} 的不同部分，按顺序执行`;
      case 'rename':
        return `重命名部分任务的目标文件，避免路径冲突`;
      default:
        return `需要手动解决 ${path} 的冲突`;
    }
  }
}

/**
 * MergeStrategy - 合并策略
 * 适用于同一组件文件的多类型修改（ui + style + logic）
 */
class MergeStrategy {
  /**
   * 合并冲突任务
   */
  mergeConflictingTasks(conflictGroup) {
    // 从第一个冲突任务中提取 prompt 和 systemPrompt
    const firstTask = conflictGroup.conflictingTasks[0]?.task;
    const mergedTask = {
      id: this.generateCompositeId(conflictGroup),
      type: 'composite_file_task',
      primaryType: this.determinePrimaryType(conflictGroup),
      deliverables: [],
      targetPath: conflictGroup.path,
      regions: this.identifyTargetRegions(conflictGroup),
      dependencies: this.mergeDependencies(conflictGroup.conflictingTasks),
      priority: this.calculateCompositePriority(conflictGroup.conflictingTasks),
      content: `Composite task for ${conflictGroup.path} with multiple modifications`,
      prompt: firstTask?.prompt || null,
      systemPrompt: firstTask?.systemPrompt || null,
      debugInfo: {
        originalTasks: conflictGroup.conflictingTasks.map(t => t.taskId),
        mergeStrategy: true
      }
    };

    conflictGroup.conflictingTasks.forEach(taskInfo => {
      mergedTask.deliverables.push({
        originalTaskId: taskInfo.taskId,
        content: taskInfo.task.description || taskInfo.task.content,
        types: taskInfo.task.types || [],
        region: this.identifyRegion(taskInfo.task, conflictGroup.path)
      });
    });

    return mergedTask;
  }

  /**
   * 生成复合 ID
   */
  generateCompositeId(conflictGroup) {
    return `composite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 确定主要类型 - 使用 types 数组
   */
  determinePrimaryType(conflictGroup) {
    const typeCounts = {};
    conflictGroup.conflictingTasks.forEach(taskInfo => {
      const types = taskInfo.task.types || [];
      const primaryType = types.length > 0 ? types[0].type : 'unknown';
      typeCounts[primaryType] = (typeCounts[primaryType] || 0) + 1;
    });
    return Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b);
  }

  /**
   * 识别目标区域
   */
  identifyTargetRegions(conflictGroup) {
    const regions = [];
    conflictGroup.conflictingTasks.forEach(taskInfo => {
      const task = taskInfo.task;
      const region = this.inferCodeRegion(task);
      if (region) {
        regions.push({
          taskId: taskInfo.taskId,
          region: region,
          description: task.description || task.content
        });
      }
    });
    return regions;
  }

  /**
   * 合并依赖
   */
  mergeDependencies(conflictingTasks) {
    const allDependencies = [];
    conflictingTasks.forEach(taskInfo => {
      if (taskInfo.task.dependencies) {
        allDependencies.push(...taskInfo.task.dependencies);
      }
    });
    return [...new Set(allDependencies)];
  }

  /**
   * 计算复合优先级
   */
  calculateCompositePriority(conflictingTasks) {
    const priorityValues = { high: 3, critical: 4, medium: 2, normal: 2, low: 1 };
    return conflictingTasks.reduce((max, taskInfo) => {
      const priority = taskInfo.task.priority || 'normal';
      return priorityValues[priority] > priorityValues[max] ? priority : max;
    }, 'low');
  }

  /**
   * 推断代码区域
   */
  inferCodeRegion(task) {
    // 安全地访问属性，防止 undefined 错误
    const taskObj = task.task || task;
    const content = (taskObj.description || taskObj.content || taskObj.prompt || '').toLowerCase();

    if (content.includes('组件') || content.includes('component')) return 'component_definition';
    if (content.includes('样式') || content.includes('style')) return 'style_section';
    if (content.includes('逻辑') || content.includes('logic')) return 'business_logic';
    if (content.includes('渲染') || content.includes('render')) return 'render_method';
    if (content.includes('状态') || content.includes('state')) return 'state_management';
    if (content.includes('导入') || content.includes('import')) return 'imports_section';
    if (content.includes('导出') || content.includes('export')) return 'exports_section';

    return 'general';
  }

  /**
   * 识别区域
   */
  identifyRegion(task, targetPath) {
    return this.inferCodeRegion(task);
  }
}

/**
 * PartitionStrategy - 分区策略
 * 适用于大型代码文件的不同区域修改
 */
class PartitionStrategy {
  /**
   * 分区任务
   */
  partitionTasks(conflictGroup) {
    const partitionedTasks = [];

    conflictGroup.conflictingTasks.forEach((taskInfo, index) => {
      const partitionedTask = { ...taskInfo.task };
      partitionedTask.targetRegion = this.assignRegion(taskInfo.task, index, conflictGroup);
      partitionedTask.partition = {
        order: index,
        total: conflictGroup.conflictingTasks.length,
        description: partitionedTask.targetRegion.description
      };
      partitionedTask.enhancedPrompt = this.enhancePromptWithRegion(
        partitionedTask,
        conflictGroup.path,
        partitionedTask.targetRegion
      );
      partitionedTasks.push(partitionedTask);
    });

    return partitionedTasks;
  }

  /**
   * 分配区域
   */
  assignRegion(task, order, conflictGroup) {
    return {
      type: this.determineRegionType(task),
      description: this.describeRegion(order, conflictGroup.conflictingTasks.length),
      constraints: this.getRegionConstraints(task)
    };
  }

  /**
   * 确定区域类型 - 使用 types 数组
   */
  determineRegionType(task) {
    const types = task.types || [];
    // 取第一个类型（置信度最高的）
    const primaryType = types.length > 0 ? types[0].type : null;

    if (primaryType === 'style') return 'style_block';
    if (primaryType === 'ui') return 'component_structure';
    if (primaryType === 'logic') return 'function_body';
    return 'general_region';
  }

  /**
   * 描述区域
   */
  describeRegion(order, total) {
    const regionDescriptions = [
      '文件头部/导入声明部分',
      '组件定义/类定义部分',
      '样式定义部分',
      '主要逻辑函数',
      '事件处理器',
      '辅助函数',
      '文件尾部/导出部分'
    ];
    return regionDescriptions[order % regionDescriptions.length] || `第 ${order + 1} 个区域`;
  }

  /**
   * 获取区域约束 - 使用 types 数组
   */
  getRegionConstraints(task) {
    const types = task.types || [];
    const primaryType = types.length > 0 ? types[0].type : null;

    switch (primaryType) {
      case 'style':
        return { maxLines: 50, cssSpecific: true };
      case 'ui':
        return { componentStructure: true, jsxSpecific: true };
      case 'logic':
        return { businessLogic: true, functionScope: true };
      default:
        return { general: true };
    }
  }

  /**
   * 增强 Prompt 添加区域信息
   */
  enhancePromptWithRegion(task, targetPath, region) {
    const basePrompt = task.prompt || task.description || '';
    return `${basePrompt}\n\n注意事项：\n- 仅修改 ${targetPath} 文件中的 "${region.description}" 部分\n- 遵循该区域的编码规范\n- 保持与其他区域的兼容性\n- 避免不必要的代码重构\n`;
  }
}

/**
 * RenameStrategy - 重命名策略
 * 当合并和分区都不适用时，重命名部分任务的目标文件
 */
class RenameStrategy {
  /**
   * 重命名冲突任务（计划中的方法名：renameConflictingFiles）
   */
  renameConflictingFiles(conflictGroup) {
    return this.renameTasks(conflictGroup);
  }

  /**
   * 重命名冲突任务
   */
  renameTasks(conflictGroup) {
    const renamedTasks = [];
    conflictGroup.conflictingTasks.forEach((taskInfo, index) => {
      const originalPath = conflictGroup.path;
      // 使用 types 数组获取主类型
      const types = taskInfo.task.types || [];
      const primaryType = types.length > 0 ? types[0].type : null;
      const newPath = this.generateUniquePath(originalPath, index, primaryType);
      const renamedTask = { ...taskInfo.task };
      renamedTask.targetPath = newPath;
      renamedTask.renameReason = 'path_conflict_resolution';
      renamedTask.originalPath = originalPath;
      renamedTasks.push(renamedTask);
    });
    return renamedTasks;
  }

  /**
   * 生成唯一路径（计划中的方法名：generateUniquePath）
   */
  generateUniquePath(originalPath, index, taskType) {
    const pathParts = originalPath.split('.');
    const extension = pathParts.pop();
    const baseName = pathParts.join('.');
    const typeSuffix = this.getTypeSuffix(taskType);
    const uniqueName = `${baseName}_${index + 1}${typeSuffix ? '.' + typeSuffix : ''}.${extension}`;
    return uniqueName;
  }

  /**
   * 生成新路径（别名，保持向后兼容）
   */
  generateNewPath(originalPath, index, conflictGroup) {
    const types = conflictGroup.conflictingTasks[index]?.task.types || [];
    const primaryType = types.length > 0 ? types[0].type : null;
    return this.generateUniquePath(originalPath, index, primaryType);
  }

  /**
   * 获取类型后缀
   */
  getTypeSuffix(taskType) {
    const suffixMap = {
      'ui': 'ui',
      'style': 'style',
      'logic': 'logic',
      'api': 'api',
      'test': 'test',
      'config': 'config'
    };
    return suffixMap[taskType] || taskType;
  }
}

/**
 * ComprehensiveConflictResolver - 综合冲突解决器
 * 整合所有检测和解决策略，提供完整的冲突解决功能和元数据返回
 */
class ComprehensiveConflictResolver {
  constructor(config = {}) {
    this.config = config;
    this.detector = new FilePathConflictDetector();
    this.mergeStrategy = new MergeStrategy();
    this.partitionStrategy = new PartitionStrategy();
    this.renameStrategy = new RenameStrategy();

    // 冲突解决策略映射
    this.strategyMap = {
      merge: this.mergeStrategy.mergeConflictingTasks.bind(this.mergeStrategy),
      partition: this.partitionStrategy.partitionTasks.bind(this.partitionStrategy),
      rename: this.renameStrategy.renameTasks.bind(this.renameStrategy)
    };
  }

  /**
   * 解决冲突（基础版本）
   * @param {Array} subtasks - 子任务列表
   * @returns {Object} 包含 finalSubtasks 和 integrationMetadata 的结果对象
   */
  resolveConflicts(subtasks) {
    const detectionResult = this.detector.detectConflicts(subtasks);

    if (!detectionResult.hasConflicts) {
      return {
        finalSubtasks: subtasks,
        conflictsResolved: 0,
        strategyUsed: 'none',
        integrationMetadata: {
          fileMappings: {},
          mergeGroups: {},
          dependencyGraph: [],
          regionSpecs: {}
        }
      };
    }

    let remainingTasks = [...subtasks];
    const resolvedTasks = [];
    const integrationMetadata = {
      fileMappings: {},
      mergeGroups: {},
      dependencyGraph: [],
      regionSpecs: {}
    };

    detectionResult.conflicts.forEach(conflict => {
      const strategy = this.selectBestStrategy(conflict);

      // 记录文件映射
      conflict.conflictingTasks.forEach(taskInfo => {
        if (taskInfo.task.filePath) {
          integrationMetadata.fileMappings[taskInfo.task.filePath] = {
            original: taskInfo.task.filePath,
            strategy: strategy,
            conflictResolved: true
          };
        }
      });

      switch (strategy) {
        case 'merge':
          const mergedTask = this.mergeStrategy.mergeConflictingTasks(conflict);
          resolvedTasks.push(new EnhancedSubtask(mergedTask, {
            targetFile: mergedTask.targetPath,
            mergeGroupId: mergedTask.id,
            mergeStrategy: 'merge',
            region: 'composite'
          }));
          integrationMetadata.mergeGroups[mergedTask.id] = {
            originalTasks: conflict.conflictingTasks.map(t => t.taskId),
            targetPath: mergedTask.targetPath,
            regions: mergedTask.regions
          };
          // 注意：合并任务已包含所有冲突任务的内容，无需再推送原始任务
          break;

        case 'partition':
          const partitionedTasks = this.partitionStrategy.partitionTasks(conflict);
          partitionedTasks.forEach((task, idx) => {
            resolvedTasks.push(new EnhancedSubtask(task, {
              targetFile: conflict.path,
              region: task.targetRegion.type,
              regionConstraints: task.targetRegion.constraints
            }));
            integrationMetadata.regionSpecs[task.id || `partition_${idx}`] = {
              filePath: conflict.path,
              region: task.targetRegion,
              order: idx
            };
          });
          break;

        case 'rename':
          const renamedTasks = this.renameStrategy.renameTasks(conflict);
          renamedTasks.forEach(task => {
            resolvedTasks.push(new EnhancedSubtask(task, {
              targetFile: task.targetPath,
              originalFile: task.originalPath
            }));
            integrationMetadata.fileMappings[task.originalPath] = {
              original: task.originalPath,
              renamed: task.targetPath,
              strategy: 'rename'
            };
          });
          break;

        default:
          // 未知策略，保留原始任务
          conflict.conflictingTasks.forEach(t => resolvedTasks.push(t.task));
      }
    });

    // 构建依赖图
    integrationMetadata.dependencyGraph = this.buildDependencyGraph(resolvedTasks);

    return {
      finalSubtasks: resolvedTasks,
      conflictsResolved: detectionResult.conflicts.length,
      strategyUsed: detectionResult.conflicts.map(c => c.suggestedStrategy),
      integrationMetadata
    };
  }

  /**
   * 解决冲突（增强版本，带提示信息）
   * @param {Array} subtasks - 子任务列表
   * @returns {Object} 包含 finalSubtasks 和完整 integrationMetadata 的结果对象
   */
  resolveConflictsWithHints(subtasks) {
    const detectionResult = this.detector.detectConflicts(subtasks);

    if (!detectionResult.hasConflicts) {
      return {
        finalSubtasks: subtasks,
        conflictsResolved: 0,
        strategyUsed: 'none',
        integrationMetadata: {
          fileMappings: {},
          mergeGroups: {},
          dependencyGraph: [],
          regionSpecs: {}
        }
      };
    }

    let remainingTasks = [...subtasks];
    const resolvedTasks = [];
    const integrationMetadata = {
      fileMappings: {},
      mergeGroups: {},
      dependencyGraph: [],
      regionSpecs: {}
    };

    detectionResult.conflicts.forEach(conflict => {
      const strategy = this.selectBestStrategy(conflict);

      // 记录文件映射
      conflict.conflictingTasks.forEach(taskInfo => {
        if (taskInfo.task.filePath) {
          integrationMetadata.fileMappings[taskInfo.task.filePath] = {
            original: taskInfo.task.filePath,
            strategy: strategy,
            conflictResolved: true
          };
        }
      });

      switch (strategy) {
        case 'merge':
          const mergedTask = this.mergeStrategy.mergeConflictingTasks(conflict);
          resolvedTasks.push(new EnhancedSubtask(mergedTask, {
            targetFile: mergedTask.targetPath,
            mergeGroupId: mergedTask.id,
            mergeStrategy: 'merge',
            region: 'composite'
          }));
          integrationMetadata.mergeGroups[mergedTask.id] = {
            originalTasks: conflict.conflictingTasks.map(t => t.taskId),
            targetPath: mergedTask.targetPath,
            regions: mergedTask.regions,
            primaryType: mergedTask.primaryType,
            dependencies: mergedTask.dependencies
          };
          break;

        case 'partition':
          const partitionedTasks = this.partitionStrategy.partitionTasks(conflict);
          partitionedTasks.forEach((task, idx) => {
            const enhancedTask = new EnhancedSubtask(task, {
              targetFile: conflict.path,
              region: task.targetRegion.type,
              regionConstraints: task.targetRegion.constraints,
              dependsOn: idx > 0 ? [partitionedTasks[idx - 1].id || `partition_${idx - 1}`] : []
            });
            resolvedTasks.push(enhancedTask);
            integrationMetadata.regionSpecs[enhancedTask.id] = {
              filePath: conflict.path,
              region: task.targetRegion,
              order: idx,
              partition: task.partition
            };
          });
          break;

        case 'rename':
          const renamedTasks = this.renameStrategy.renameTasks(conflict);
          renamedTasks.forEach(task => {
            const enhancedTask = new EnhancedSubtask(task, {
              targetFile: task.targetPath,
              originalFile: task.originalPath
            });
            resolvedTasks.push(enhancedTask);
            integrationMetadata.fileMappings[task.originalPath] = {
              original: task.originalPath,
              renamed: task.targetPath,
              strategy: 'rename',
              reason: task.renameReason
            };
          });
          break;

        default:
          // 未知策略，保留原始任务
          conflict.conflictingTasks.forEach(t => resolvedTasks.push(t.task));
      }
    });

    // 构建依赖图
    integrationMetadata.dependencyGraph = this.buildDependencyGraph(resolvedTasks);

    return {
      finalSubtasks: resolvedTasks,
      conflictsResolved: detectionResult.conflicts.length,
      strategyUsed: detectionResult.conflicts.map(c => c.suggestedStrategy),
      integrationMetadata
    };
  }

  /**
   * 选择最佳解决策略
   * @param {Object} conflict - 冲突对象
   * @returns {string} 最佳策略
   */
  selectBestStrategy(conflict) {
    // 如果是组件相关冲突，使用合并策略
    if (this.isComponentRelatedConflict(conflict)) {
      return 'merge';
    }
    // 如果是大型文件多区域冲突，使用分区策略
    if (this.isLargeFileMultiSectionConflict(conflict)) {
      return 'partition';
    }
    // 默认使用重命名策略
    return 'rename';
  }

  /**
   * 判断是否是组件相关冲突
   */
  isComponentRelatedConflict(conflict) {
    const fileExt = this.getFileExtension(conflict.path);
    const componentExtensions = ['.jsx', '.tsx', '.vue', '.svelte'];

    if (componentExtensions.includes(fileExt)) {
      // 使用 types 数组获取主类型
      const taskTypes = conflict.conflictingTasks.map(t => {
        const types = t.task.types || [];
        return types.length > 0 ? types[0].type : 'unknown';
      });
      const uniqueTypes = new Set(taskTypes);
      return uniqueTypes.size > 1 && [...uniqueTypes].some(t => ['ui', 'style', 'logic'].includes(t));
    }
    return false;
  }

  /**
   * 判断是否是大型文件多区域冲突
   */
  isLargeFileMultiSectionConflict(conflict) {
    const fileExt = this.getFileExtension(conflict.path);
    const largeFileExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs'];
    return largeFileExtensions.includes(fileExt) && conflict.conflictingTasks.length > 1;
  }

  /**
   * 获取文件扩展名
   */
  getFileExtension(path) {
    if (typeof path !== 'string') return '';
    const matches = path.match(/\.[A-Za-z0-9]+$/);
    return matches ? matches[0].toLowerCase() : '';
  }

  /**
   * 构建依赖图
   */
  buildDependencyGraph(subtasks) {
    const dependencyGraph = [];

    subtasks.forEach(task => {
      if (task.integrationHints && task.integrationHints.dependsOn) {
        task.integrationHints.dependsOn.forEach(depId => {
          dependencyGraph.push({
            from: task.id,
            to: depId,
            type: 'integration_hint'
          });
        });
      }
      if (task.dependencies) {
        task.dependencies.forEach(dep => {
          dependencyGraph.push({
            from: task.id,
            to: dep,
            type: 'task_dependency'
          });
        });
      }
      if (task.partition && task.partition.order > 0) {
        dependencyGraph.push({
          from: task.id,
          to: `partition_${task.partition.order - 1}`,
          type: 'partition_order'
        });
      }
    });

    return dependencyGraph;
  }
}

// 导出旧的 ConflictResolver 类（保持向后兼容）
class ConflictResolver {
  constructor(config = {}) {
    this.config = config;
    this.detector = new FilePathConflictDetector();
    this.mergeStrategy = new MergeStrategy();
    this.partitionStrategy = new PartitionStrategy();
    this.renameStrategy = new RenameStrategy();
    this.comprehensiveResolver = new ComprehensiveConflictResolver(config);

    // 冲突解决策略映射
    this.strategyMap = {
      merge: this.mergeStrategy.mergeConflictingTasks.bind(this.mergeStrategy),
      partition: this.partitionStrategy.partitionTasks.bind(this.partitionStrategy),
      rename: this.renameStrategy.renameTasks.bind(this.renameStrategy)
    };
  }

  /**
   * 解决冲突（旧版本，返回数组）
   * @param {Array} tasks - 待解决的子任务列表
   * @returns {Array} 解决冲突后的子任务列表
   */
  resolveConflicts(tasks) {
    // 使用综合解决器获取完整结果
    const result = this.comprehensiveResolver.resolveConflictsWithHints(tasks);
    return result.finalSubtasks;
  }

  /**
   * 解决冲突（新版本，返回完整结果对象）
   * @param {Array} tasks - 待解决的子任务列表
   * @returns {Object} 包含 finalSubtasks 和 integrationMetadata 的结果对象
   */
  resolveConflictsWithMetadata(tasks) {
    return this.comprehensiveResolver.resolveConflictsWithHints(tasks);
  }
}

module.exports = ConflictResolver;
module.exports.ComprehensiveConflictResolver = ComprehensiveConflictResolver;
module.exports.FilePathConflictDetector = FilePathConflictDetector;
module.exports.MergeStrategy = MergeStrategy;
module.exports.PartitionStrategy = PartitionStrategy;
module.exports.RenameStrategy = RenameStrategy;
