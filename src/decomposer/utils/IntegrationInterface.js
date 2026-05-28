/**
 * IntegrationInterface - 整合器接口规范实现
 *
 * 实现分解器与整合器之间的接口协议，确保子任务包含结构化元数据
 * 以支持高效整合操作，避免整合器重复解析信息
 */

class IntegrationInterface {
  /**
   * 验证子任务结构是否符合整合器接口规范
   * @param {Object} subtask - 子任务对象
   * @returns {boolean} 验证结果
   */
  static validateSubtaskStructure(subtask) {
    const requiredFields = ['id', 'type', 'prompt', 'integrationHints'];
    const requiredHints = ['targetFile'];

    const missingFields = requiredFields.filter(field => !(field in subtask));
    const missingHints = requiredHints.filter(hint => !(hint in (subtask.integrationHints || {})));

    if (missingFields.length > 0 || missingHints.length > 0) {
      throw new Error(`Invalid subtask structure. Missing: ${[...missingFields, ...missingHints].join(', ')}`);
    }

    return true;
  }

  /**
   * 处理子任务以支持整合操作
   * @param {Array} subtasks - 子任务列表
   * @returns {Object} 包含整合所需数据的对象
   */
  static processForIntegration(subtasks) {
    const integrationData = {
      filesToProcess: new Map(),
      dependencies: new Map(),
      mergeGroups: new Map(),
      regionSpecs: new Map()
    };

    subtasks.forEach(subtask => {
      this.validateSubtaskStructure(subtask);

      const hints = subtask.integrationHints;

      // 处理文件映射
      if (hints.targetFile) {
        if (!integrationData.filesToProcess.has(hints.targetFile)) {
          integrationData.filesToProcess.set(hints.targetFile, []);
        }
        integrationData.filesToProcess.get(hints.targetFile).push(subtask);
      }

      // 处理依赖关系
      if (hints.dependsOn && hints.dependsOn.length > 0) {
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
    });

    return integrationData;
  }

  /**
   * 检查子任务是否包含有效的整合器接口信息
   * @param {Object} subtask - 子任务对象
   * @returns {boolean} 是否有效
   */
  static hasValidIntegrationHints(subtask) {
    try {
      return this.validateSubtaskStructure(subtask);
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成整合报告
   * @param {Array} subtasks - 子任务列表
   * @returns {Object} 整合报告
   */
  static generateIntegrationReport(subtasks) {
    const integrationData = this.processForIntegration(subtasks);

    return {
      summary: {
        totalTasks: subtasks.length,
        uniqueFiles: integrationData.filesToProcess.size,
        totalDependencies: integrationData.dependencies.size,
        mergeGroups: integrationData.mergeGroups.size,
        tasksWithRegions: integrationData.regionSpecs.size
      },
      filesToProcess: Array.from(integrationData.filesToProcess.entries()).map(([file, tasks]) => ({
        file,
        taskCount: tasks.length,
        taskIds: tasks.map(t => t.id)
      })),
      dependencies: Array.from(integrationData.dependencies.entries()),
      mergeGroups: Array.from(integrationData.mergeGroups.entries()).map(([groupId, tasks]) => ({
        groupId,
        taskCount: tasks.length,
        taskIds: tasks.map(t => t.id)
      })),
      regionSpecifications: Array.from(integrationData.regionSpecs.entries())
    };
  }

  /**
   * 应用整合变换
   * @param {Array} subtasks - 子任务列表
   * @param {Function} transformFn - 变换函数
   * @returns {Array} 变换后的子任务列表
   */
  static applyIntegrationTransform(subtasks, transformFn) {
    return subtasks.map(subtask => {
      if (this.hasValidIntegrationHints(subtask)) {
        return transformFn(subtask);
      }
      return subtask;
    });
  }
}

module.exports = IntegrationInterface;