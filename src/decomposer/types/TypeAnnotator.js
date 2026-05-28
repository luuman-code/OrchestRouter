/**
 * TypeAnnotator - 类型标注器
 * 支持多标签类型标注，提供多种标注策略
 */

const ConfigurableTypeMatcher = require('../utils/ConfigurableTypeMatcher');

class TypeAnnotator {
  constructor(config = {}) {
    this.matcher = new ConfigurableTypeMatcher({
      configPath: config.configPath
    });
    this.config = config;
    this.enableLLM = config.enableLLM || false;
  }

  /**
   * 标注单个 deliverable
   * @param {Object} deliverable - 要标注的交付物
   * @returns {Object} 标注结果
   */
  annotate(deliverable) {
    // 【修复】如果 deliverable 已有 types 数组，直接透传，不使用 ConfigurableTypeMatcher 覆盖
    if (deliverable.types && Array.isArray(deliverable.types) && deliverable.types.length > 0) {
      // 检查 types 是否为多维度格式 {dimension, value, weight}
      const firstType = deliverable.types[0];
      if (firstType && firstType.dimension && firstType.value) {
        // 多维度格式，直接透传
        return {
          ...deliverable,
          types: deliverable.types
        };
      }
    }

    // 只有当没有 types 时才使用自动标注（向后兼容）
    const types = this.matcher.annotateDeliverable(deliverable);

    return {
      ...deliverable,
      types
      // 不再保留单一的 type 字段，只使用 types 数组
    };
  }

  /**
   * 批量标注 deliverables
   * @param {Array} deliverables - 交付物数组
   * @returns {Array} 标注结果数组
   */
  annotateMultiple(deliverables) {
    return deliverables.map(deliverable => this.annotate(deliverable));
  }

  /**
   * 标注任务（包含多个 deliverables）
   * @param {Object} task - 任务对象
   * @returns {Object} 标注后的任务
   */
  annotateTask(task) {
    const deliverables = task.deliverables || [];
    const annotatedDeliverables = this.annotateMultiple(deliverables);

    // 汇总任务的类型
    const allTypes = annotatedDeliverables.flatMap(d => d.types || []);
    const aggregatedTypes = this._aggregateTypes(allTypes);

    return {
      ...task,
      deliverables: annotatedDeliverables,
      // 聚合的任务类型（多标签）
      types: aggregatedTypes
      // 不再保留单一的 type 字段，只使用 types 数组
    };
  }

  /**
   * 聚合多个 deliverable 的类型
   * @param {Array} types - 类型数组
   * @returns {Array} 聚合后的类型数组
   */
  _aggregateTypes(types) {
    if (!types || types.length === 0) return [];

    // 按类型分组，合并置信度
    const typeMap = new Map();

    for (const t of types) {
      if (!typeMap.has(t.type)) {
        typeMap.set(t.type, {
          type: t.type,
          confidence: 0,
          sources: new Set(),
          count: 0
        });
      }

      const entry = typeMap.get(t.type);
      entry.confidence += t.confidence;
      if (t.source) entry.sources.add(t.source);
      entry.count++;
    }

    // 计算平均置信度并转换为数组
    const result = Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      confidence: data.confidence / data.count,
      source: Array.from(data.sources)[0] || 'combined',
      count: data.count
    }));

    // 按置信度排序
    result.sort((a, b) => b.confidence - a.confidence);

    return result.slice(0, 5); // 最多返回5个类型
  }

  /**
   * 获取类型所需的模型能力
   * @param {Object} task - 任务对象
   * @returns {Object} 所需能力
   */
  getRequiredCapabilities(task) {
    const types = task.types || [];
    return this.matcher.getRequiredCapabilities(types);
  }

  /**
   * 获取所有可用类型
   * @returns {Array} 类型列表
   */
  getAvailableTypes() {
    return this.matcher.typeDefinition.getTypeList();
  }

  /**
   * 检查类型是否存在
   * @param {string} type - 类型名称
   * @returns {boolean}
   */
  hasType(type) {
    return this.matcher.typeDefinition.hasType(type);
  }
}

module.exports = TypeAnnotator;
