/**
 * BasePlugin - 插件基类
 *
 * 所有插件都应继承此类并实现相应的方法
 */

class BasePlugin {
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
    this.version = '1.0.0';
    this.description = '';
    this.author = '';
    this.enabled = true;
    this.dependencies = [];
    this.typeDefinitions = {};
    this.matchingRules = [];
  }

  /**
   * 获取插件元数据
   */
  get metadata() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author,
      dependencies: this.dependencies,
      config: this.config
    };
  }

  /**
   * 插件初始化（生命周期钩子）
   * 子类可以重写此方法进行初始化
   */
  async initialize() {
    // 默认实现，子类可以重写
    return Promise.resolve();
  }

  /**
   * 插件卸载（生命周期钩子）
   * 子类可以重写此方法进行清理
   */
  async dispose() {
    // 默认实现，子类可以重写
    return Promise.resolve();
  }

  /**
   * 执行插件功能（必须实现）
   * @param {Object} context - 执行上下文
   * @returns {Promise<any>} 执行结果
   */
  async execute(context) {
    throw new Error(`Plugin "${this.name}" must implement the execute() method`);
  }

  /**
   * 添加类型定义（供类型标注器使用）
   * @param {string} type - 类型名称
   * @param {Object} typeDef - 类型定义
   */
  addTypeMapping(type, typeDef) {
    this.typeDefinitions[type] = typeDef;
  }

  /**
   * 添加匹配规则（供类型标注器使用）
   * @param {Object} rule - 匹配规则
   */
  addMatchingRule(rule) {
    this.matchingRules.push(rule);
  }

  /**
   * 获取类型定义
   */
  getTypeDefinitions() {
    return this.typeDefinitions;
  }

  /**
   * 获取匹配规则
   */
  getMatchingRules() {
    return this.matchingRules;
  }

  /**
   * 检查插件是否可用
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * 启用插件
   */
  enable() {
    this.enabled = true;
    return this;
  }

  /**
   * 禁用插件
   */
  disable() {
    this.enabled = false;
    return this;
  }

  /**
   * 检查依赖是否满足
   */
  checkDependencies() {
    const missing = [];
    for (const dep of this.dependencies) {
      if (!this.satisfiesDependency(dep)) {
        missing.push(dep);
      }
    }
    return {
      satisfied: missing.length === 0,
      missing
    };
  }

  /**
   * 检查单个依赖（子类可以重写）
   */
  satisfiesDependency(dep) {
    // 默认实现，子类可以根据实际情况重写
    return true;
  }

  /**
   * 记录日志
   */
  log(message, level = 'info') {
    const prefix = `[${this.name}]`;
    switch (level) {
      case 'error':
        console.error(`${prefix} [ERROR] ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} [WARN] ${message}`);
        break;
      case 'debug':
        console.debug(`${prefix} [DEBUG] ${message}`);
        break;
      default:
        console.log(`${prefix} [INFO] ${message}`);
    }
  }
}

module.exports = BasePlugin;