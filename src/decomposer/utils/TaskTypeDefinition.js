/**
 * TaskTypeDefinition - 任务类型定义工具类
 * 提供任务类型元数据、能力映射等核心定义
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

class TaskTypeDefinition {
  constructor(configPath = null) {
    this.config = this._loadConfig(configPath);
    this.taskTypes = this.config.taskTypes || {};
    this.typeToCapabilities = this.config.typeToCapabilities || {};
    this.modelCapabilities = this.config.modelCapabilities || {};
    this.matching = this.config.matching || {};
  }

  /**
   * 加载配置文件
   * @param {string|null} configPath - 配置文件路径
   */
  _loadConfig(configPath) {
    const defaultPath = path.join(__dirname, '../config/default-config.yaml');

    let configFile = configPath || defaultPath;

    // 尝试多个可能的路径
    const possiblePaths = [
      configFile,
      path.join(__dirname, configFile),
      path.join(process.cwd(), configFile),
      path.join(process.cwd(), 'src/decomposer/config/default-config.yaml')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          return yaml.load(content);
        } catch (e) {
          console.warn(`Failed to load config from ${p}:`, e.message);
        }
      }
    }

    // 返回默认配置
    return this._getDefaultConfig();
  }

  /**
   * 获取默认配置
   */
  _getDefaultConfig() {
    return {
      taskTypes: {
        ui: { label: '用户界面', keywords: [], regexPatterns: [], weight: 0.9 },
        api: { label: 'API接口', keywords: [], regexPatterns: [], weight: 0.9 },
        logic: { label: '业务逻辑', keywords: [], regexPatterns: [], weight: 0.85 },
        model: { label: '数据模型', keywords: [], regexPatterns: [], weight: 0.85 },
        test: { label: '测试', keywords: [], regexPatterns: [], weight: 0.8 },
        style: { label: '样式', keywords: [], regexPatterns: [], weight: 0.8 },
        config: { label: '配置', keywords: [], regexPatterns: [], weight: 0.7 },
        form: { label: '表单处理', keywords: [], regexPatterns: [], weight: 0.75 },
        auth: { label: '认证授权', keywords: [], regexPatterns: [], weight: 0.8 },
        database: { label: '数据库', keywords: [], regexPatterns: [], weight: 0.85 },
        state: { label: '状态管理', keywords: [], regexPatterns: [], weight: 0.8 },
        i18n: { label: '国际化', keywords: [], regexPatterns: [], weight: 0.7 },
        security: { label: '安全相关', keywords: [], regexPatterns: [], weight: 0.85 },
        performance: { label: '性能优化', keywords: [], regexPatterns: [], weight: 0.75 },
        devops: { label: '部署运维', keywords: [], regexPatterns: [], weight: 0.7 },
        docs: { label: '文档', keywords: [], regexPatterns: [], weight: 0.6 }
      },
      typeToCapabilities: {},
      modelCapabilities: {},
      matching: {
        minConfidence: 0.3,
        combinationStrategy: 'weighted'
      }
    };
  }

  /**
   * 获取所有任务类型
   */
  getAllTaskTypes() {
    return Object.entries(this.taskTypes).map(([type, meta]) => ({
      type,
      ...meta
    }));
  }

  /**
   * 获取任务类型元数据
   * @param {string} type - 任务类型
   */
  getTaskTypeMeta(type) {
    return this.taskTypes[type] || null;
  }

  /**
   * 获取类型到能力的映射
   * @param {string} type - 任务类型
   */
  getCapabilitiesForType(type) {
    return this.typeToCapabilities[type] || null;
  }

  /**
   * 获取模型能力定义
   * @param {string} modelId - 模型ID
   */
  getModelCapabilities(modelId) {
    return this.modelCapabilities[modelId] || null;
  }

  /**
   * 获取所有模型能力定义
   */
  getAllModelCapabilities() {
    return this.modelCapabilities;
  }

  /**
   * 获取匹配配置
   */
  getMatchingConfig() {
    return this.matching;
  }

  /**
   * 获取类型列表
   */
  getTypeList() {
    return Object.keys(this.taskTypes);
  }

  /**
   * 检查类型是否存在
   * @param {string} type - 任务类型
   */
  hasType(type) {
    return type in this.taskTypes;
  }

  /**
   * 检查模型是否存在
   * @param {string} modelId - 模型ID
   */
  hasModel(modelId) {
    return modelId in this.modelCapabilities;
  }

  /**
   * 合并多个任务的类型到能力映射
   * @param {Array} types - 任务类型数组 [{type, confidence}]
   */
  mergeTypeCapabilities(types) {
    const merged = {};

    for (const taskType of types) {
      const typeName = taskType.type;
      const confidence = taskType.confidence || 1.0;
      const caps = this.typeToCapabilities[typeName];

      if (!caps) continue;

      for (const [cap, weight] of Object.entries(caps)) {
        if (!merged[cap]) {
          merged[cap] = 0;
        }
        // 加权累加
        merged[cap] += weight * confidence;
      }
    }

    // 归一化
    const totalConfidence = types.reduce((sum, t) => sum + (t.confidence || 1.0), 0);
    if (totalConfidence > 0) {
      for (const cap of Object.keys(merged)) {
        merged[cap] /= totalConfidence;
      }
    }

    return merged;
  }
}

module.exports = TaskTypeDefinition;
