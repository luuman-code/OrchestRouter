/**
 * @fileoverview IntegrationInterfaceProcessor - 整合器接口处理器
 *
 * 实现与 Decomposer V4 定义的整合器接口规范完全兼容
 * 处理 integrationHints 字段提供的结构化元数据
 */

/**
 * IntegrationInterfaceProcessor - 整合器接口处理器
 *
 * 处理来自 Decomposer V4 的 integrationHints
 */
class IntegrationInterfaceProcessor {
  /**
   * 处理子任务以供整合
   *
   * @static
   * @param {Object[]} subtasks - 子任务列表
   * @returns {Object} 整合数据
   */
  static processForIntegration(subtasks) {
    const integrationData = {
      filesToProcess: new Map(), // 文件路径 -> [subtasks]
      dependencies: new Map(), // subtask.id -> [dependsOn]
      mergeGroups: new Map(), // mergeGroupId -> [subtasks]
      regionSpecs: new Map() // subtask.id -> regionSpecs
    };

    for (const subtask of subtasks) {
      try {
        // 验证子任务结构
        this.validateSubtaskStructure(subtask);

        const hints = subtask.integrationHints || {};

        // 处理文件映射 - 支持 targetFile 和 targetFiles
        if (hints.targetFiles && Array.isArray(hints.targetFiles)) {
          // targetFiles 是数组，处理多个文件
          for (const file of hints.targetFiles) {
            if (!integrationData.filesToProcess.has(file)) {
              integrationData.filesToProcess.set(file, []);
            }
            integrationData.filesToProcess.get(file).push(subtask);
          }
        } else if (hints.targetFile) {
          // targetFile 是单个文件
          if (!integrationData.filesToProcess.has(hints.targetFile)) {
            integrationData.filesToProcess.set(hints.targetFile, []);
          }
          integrationData.filesToProcess.get(hints.targetFile).push(subtask);
        }

        // 处理依赖关系
        if (hints.dependsOn && Array.isArray(hints.dependsOn) && hints.dependsOn.length > 0) {
          integrationData.dependencies.set(subtask.id, hints.dependsOn);
        }

        // 处理合并组
        if (hints.mergeGroupId) {
          if (!integrationData.mergeGroups.has(hints.mergeGroupId)) {
            integrationData.mergeGroups.set(hints.mergeGroupId, []);
          }
          integrationData.mergeGroups.get(hints.mergeGroupId).push(subtask);
        }

        // 处理区域规格
        if (hints.region) {
          integrationData.regionSpecs.set(subtask.id, hints);
        }
      } catch (error) {
        console.error(`Failed to process subtask ${subtask.id}: ${error.message}`);
        // 【Bug修复】当 integrationHints 缺失或无效时，尝试使用 subtask 自身的属性恢复
        // 而不是直接跳过，这样文件仍能被处理
        // 首先尝试从 subtask 自身属性恢复文件列表
        const filePaths = [];

        // 1. 尝试从 subtask.filePath 恢复（单个文件）
        if (subtask.filePath) {
          filePaths.push(subtask.filePath);
        }

        // 2. 尝试从 subtask.integrationHints.targetFiles 恢复（多个文件）
        if (subtask.integrationHints?.targetFiles && Array.isArray(subtask.integrationHints.targetFiles)) {
          filePaths.push(...subtask.integrationHints.targetFiles);
        }

        // 3. 尝试从 subtask.path 恢复
        if (subtask.path && !filePaths.includes(subtask.path)) {
          filePaths.push(subtask.path);
        }

        if (filePaths.length > 0) {
          console.warn(`[processForIntegration] 为 subtask ${subtask.id} 尝试恢复 ${filePaths.length} 个文件: ${filePaths.join(', ')}`);
          for (const filePath of filePaths) {
            if (!integrationData.filesToProcess.has(filePath)) {
              integrationData.filesToProcess.set(filePath, []);
            }
            integrationData.filesToProcess.get(filePath).push(subtask);
          }
        } else {
          // 记录错误但继续处理其他子任务
          console.error(`[processForIntegration] 无法为 subtask ${subtask.id} 恢复文件路径，跳过`);
          continue;
        }
      }
    }

    return integrationData;
  }

  /**
   * 验证子任务结构是否符合整合器接口规范
   *
   * @static
   * @param {Object} subtask - 子任务
   * @returns {boolean} 是否有效
   */
  static validateSubtaskStructure(subtask) {
    const requiredFields = ['id', 'type', 'prompt', 'integrationHints'];

    const missingFields = requiredFields.filter((field) => !(field in subtask));

    // 【Bug修复】当 integrationHints 缺失时，不抛出错误，而是返回 false 让调用者处理
    // 这样 processForIntegration 可以使用 fallback 逻辑恢复
    if (missingFields.includes('integrationHints')) {
      return false;
    }

    // 验证 integrationHints - 必须包含 targetFile 或 targetFiles 之一
    if (subtask.integrationHints) {
      const hasTargetFile = 'targetFile' in subtask.integrationHints;
      const hasTargetFiles = 'targetFiles' in subtask.integrationHints && Array.isArray(subtask.integrationHints.targetFiles);

      if (!hasTargetFile && !hasTargetFiles) {
        missingFields.push('targetFile or targetFiles');
      }

      if (missingFields.length > 0) {
        throw new Error(
          `Invalid subtask structure. Missing: ${missingFields.join(', ')}`
        );
      }
    }

    return true;
  }

  /**
   * 获取文件的目标处理列表
   *
   * @static
   * @param {Object} integrationData - 整合数据
   * @param {string} filePath - 文件路径
   * @returns {Object[]} 子任务列表
   */
  static getTasksForFile(integrationData, filePath) {
    return integrationData.filesToProcess.get(filePath) || [];
  }

  /**
   * 获取文件的合并策略
   *
   * @static
   * @param {Object[]} tasks - 子任务列表
   * @returns {string} 合并策略
   */
  static getMergeStrategyForFile(tasks) {
    // 优先级：明确的 mergeStrategy > 默认策略
    for (const task of tasks) {
      if (task.integrationHints?.mergeStrategy) {
        return task.integrationHints.mergeStrategy;
      }
    }
    return 'overwrite'; // 默认策略
  }

  /**
   * 获取文件的依赖顺序
   *
   * @static
   * @param {Object} integrationData - 整合数据
   * @param {string} filePath - 文件路径
   * @returns {Object[]} 排序后的子任务列表
   */
  static getOrderedTasks(integrationData, filePath) {
    const tasks = this.getTasksForFile(integrationData, filePath);

    if (tasks.length <= 1) {
      return tasks;
    }

    // 根据依赖关系排序
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const ordered = [];
    const visited = new Set();

    const visit = (taskId) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task) return;

      // 先处理依赖
      const deps = integrationData.dependencies.get(taskId) || [];
      for (const depId of deps) {
        visit(depId);
      }

      ordered.push(task);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return ordered;
  }

  /**
   * 获取合并组信息
   *
   * @static
   * @param {Object} integrationData - 整合数据
   * @returns {Map<string, Object[]>} 合并组
   */
  static getMergeGroups(integrationData) {
    return integrationData.mergeGroups;
  }

  /**
   * 获取区域规格
   *
   * @static
   * @param {Object} integrationData - 整合数据
   * @param {string} taskId - 任务 ID
   * @returns {Object} 区域规格
   */
  static getRegionSpec(integrationData, taskId) {
    return integrationData.regionSpecs.get(taskId);
  }

  /**
   * 构建整合计划
   *
   * @static
   * @param {Object} integrationData - 整合数据
   * @returns {Object} 整合计划
   */
  static buildIntegrationPlan(integrationData) {
    const plan = {
      files: [],
      groups: [],
      dependencies: []
    };

    // 处理每个文件
    for (const [filePath, tasks] of integrationData.filesToProcess.entries()) {
      const strategy = this.getMergeStrategyForFile(tasks);
      const orderedTasks = this.getOrderedTasks(integrationData, filePath);

      plan.files.push({
        path: filePath,
        tasks: orderedTasks.map((t) => t.id),
        strategy,
        regionSpecs: orderedTasks
          .map((t) => this.getRegionSpec(integrationData, t.id))
          .filter(Boolean)
      });
    }

    // 处理合并组
    for (const [groupId, tasks] of integrationData.mergeGroups.entries()) {
      plan.groups.push({
        id: groupId,
        tasks: tasks.map((t) => t.id),
        files: [...new Set(tasks.map((t) => t.integrationHints?.targetFile).filter(Boolean))]
      });
    }

    // 处理依赖
    for (const [taskId, deps] of integrationData.dependencies.entries()) {
      plan.dependencies.push({
        taskId,
        dependsOn: deps
      });
    }

    return plan;
  }
}

module.exports = { IntegrationInterfaceProcessor };
