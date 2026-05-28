/**
 * @fileoverview PluginManager - 插件管理器
 *
 * 支持自定义依赖解析器、冲突解决策略和文件处理器
 * 提供插件注册、加载和执行的完整机制
 */

/**
 * 自定义依赖解析器接口
 *
 * @typedef {Object} CustomDependencyResolver
 * @property {string} name - 解析器名称
 * @property {function(string, string): boolean} match - 匹配函数
 * @property {function(string, string): string[]} resolve - 解析函数
 */

/**
 * 自定义冲突解决策略接口
 *
 * @typedef {Object} CustomConflictStrategy
 * @property {string} name - 策略名称
 * @property {function(Object, Object): boolean} match - 匹配函数
 * @property {function(Object, Object): Object} resolve - 解决函数
 */

/**
 * 自定义文件处理器接口
 *
 * @typedef {Object} CustomFileProcessor
 * @property {string} name - 处理器名称
 * @property {function(Object): boolean} match - 匹配函数
 * @property {function(Object): Object} process - 处理函数
 */

/**
 * PluginConfig - 插件配置
 *
 * @typedef {Object} PluginConfig
 * @property {CustomDependencyResolver[]} [customDependencyResolvers] - 自定义依赖解析器
 * @property {CustomConflictStrategy[]} [customConflictStrategies] - 自定义冲突解决策略
 * @property {CustomFileProcessor[]} [customFileProcessors] - 自定义文件处理器
 */

/**
 * PluginManager - 插件管理器
 *
 * 管理插件的注册、加载和执行
 */
class PluginManager {
  /**
   * 创建插件管理器
   *
   * @param {PluginConfig} [config] - 插件配置
   */
  constructor(config = {}) {
    /** @type {CustomDependencyResolver[]} */
    this.customDependencyResolvers = config.customDependencyResolvers || [];

    /** @type {CustomConflictStrategy[]} */
    this.customConflictStrategies = config.customConflictStrategies || [];

    /** @type {CustomFileProcessor[]} */
    this.customFileProcessors = config.customFileProcessors || [];

    /** @type {Object[]} */
    this.loadedPlugins = [];
  }

  /**
   * 加载插件
   *
   * @param {Object} plugin - 插件对象
   * @returns {boolean} 是否加载成功
   */
  loadPlugin(plugin) {
    try {
      // 验证插件结构
      if (!plugin.name || typeof plugin.name !== 'string') {
        throw new Error('插件必须有 name 属性且为字符串');
      }

      // 检查插件是否已加载
      if (this.loadedPlugins.some(p => p.name === plugin.name)) {
        console.warn(`插件 ${plugin.name} 已加载，跳过`);
        return false;
      }

      // 注册插件提供的功能
      if (plugin.dependencyResolvers) {
        for (const resolver of plugin.dependencyResolvers) {
          this.registerDependencyResolver(resolver);
        }
      }

      if (plugin.conflictStrategies) {
        for (const strategy of plugin.conflictStrategies) {
          this.registerConflictStrategy(strategy);
        }
      }

      if (plugin.fileProcessors) {
        for (const processor of plugin.fileProcessors) {
          this.registerFileProcessor(processor);
        }
      }

      // 调用插件的初始化钩子
      if (typeof plugin.init === 'function') {
        plugin.init(this);
      }

      this.loadedPlugins.push(plugin);
      console.log(`插件 ${plugin.name} 加载成功`);
      return true;
    } catch (error) {
      console.error(`加载插件 ${plugin.name} 失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 从文件加载插件
   *
   * @param {string} pluginPath - 插件文件路径
   * @returns {boolean} 是否加载成功
   */
  loadPluginFromFile(pluginPath) {
    try {
      const plugin = require(pluginPath);
      return this.loadPlugin(plugin);
    } catch (error) {
      console.error(`从文件加载插件 ${pluginPath} 失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 从目录加载所有插件
   *
   * @param {string} pluginsDir - 插件目录路径
   * @returns {number} 成功加载的插件数量
   */
  loadPluginsFromDirectory(pluginsDir) {
    const fs = require('fs');
    const path = require('path');
    let loadedCount = 0;

    try {
      if (!fs.existsSync(pluginsDir)) {
        console.warn(`插件目录不存在：${pluginsDir}`);
        return 0;
      }

      const files = fs.readdirSync(pluginsDir);
      for (const file of files) {
        if (file.endsWith('.js') && !file.startsWith('.')) {
          const pluginPath = path.join(pluginsDir, file);
          if (this.loadPluginFromFile(pluginPath)) {
            loadedCount++;
          }
        }
      }

      console.log(`从目录 ${pluginsDir} 加载了 ${loadedCount} 个插件`);
    } catch (error) {
      console.error(`加载插件目录失败：${error.message}`);
    }

    return loadedCount;
  }

  /**
   * 注册自定义依赖解析器
   *
   * @param {CustomDependencyResolver} resolver - 依赖解析器
   */
  registerDependencyResolver(resolver) {
    if (!resolver.name || !resolver.match || !resolver.resolve) {
      throw new Error('依赖解析器必须包含 name、match 和 resolve 方法');
    }
    this.customDependencyResolvers.push(resolver);
    console.log(`注册依赖解析器：${resolver.name}`);
  }

  /**
   * 注册自定义冲突解决策略
   *
   * @param {CustomConflictStrategy} strategy - 冲突解决策略
   */
  registerConflictStrategy(strategy) {
    if (!strategy.name || !strategy.match || !strategy.resolve) {
      throw new Error('冲突解决策略必须包含 name、match 和 resolve 方法');
    }
    this.customConflictStrategies.push(strategy);
    console.log(`注册冲突解决策略：${strategy.name}`);
  }

  /**
   * 注册自定义文件处理器
   *
   * @param {CustomFileProcessor} processor - 文件处理器
   */
  registerFileProcessor(processor) {
    if (!processor.name || !processor.match || !processor.process) {
      throw new Error('文件处理器必须包含 name、match 和 process 方法');
    }
    this.customFileProcessors.push(processor);
    console.log(`注册文件处理器：${processor.name}`);
  }

  /**
   * 解析依赖（使用自定义解析器）
   *
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {string[]} defaultDeps - 默认依赖列表
   * @returns {string[]} 依赖列表
   */
  resolveDependencies(filePath, content, defaultDeps = []) {
    // 尝试使用自定义解析器
    for (const resolver of this.customDependencyResolvers) {
      if (resolver.match(filePath, content)) {
        try {
          const customDeps = resolver.resolve(filePath, content);
          return customDeps;
        } catch (error) {
          console.warn(`自定义依赖解析器 ${resolver.name} 执行失败：${error.message}`);
        }
      }
    }

    // 返回默认依赖
    return defaultDeps;
  }

  /**
   * 解决冲突（使用自定义策略）
   *
   * @param {Object} file1 - 文件 1
   * @param {Object} file2 - 文件 2
   * @returns {Object|null} 解决结果
   */
  resolveConflict(file1, file2) {
    // 尝试使用自定义策略
    for (const strategy of this.customConflictStrategies) {
      if (strategy.match(file1, file2)) {
        try {
          const result = strategy.resolve(file1, file2);
          console.log(`使用自定义策略 ${strategy.name} 解决冲突`);
          return result;
        } catch (error) {
          console.warn(`自定义冲突策略 ${strategy.name} 执行失败：${error.message}`);
        }
      }
    }

    // 没有匹配的策略
    return null;
  }

  /**
   * 处理文件（使用自定义处理器）
   *
   * @param {Object} file - 文件对象
   * @returns {Object} 处理后的文件
   */
  processFile(file) {
    let processedFile = file;

    // 应用所有匹配的文件处理器
    for (const processor of this.customFileProcessors) {
      if (processor.match(processedFile)) {
        try {
          processedFile = processor.process(processedFile);
          console.log(`使用文件处理器 ${processor.name} 处理文件`);
        } catch (error) {
          console.warn(`文件处理器 ${processor.name} 执行失败：${error.message}`);
        }
      }
    }

    return processedFile;
  }

  /**
   * 获取已加载的插件列表
   *
   * @returns {Object[]} 插件列表
   */
  getLoadedPlugins() {
    return [...this.loadedPlugins];
  }

  /**
   * 获取自定义依赖解析器列表
   *
   * @returns {CustomDependencyResolver[]} 解析器列表
   */
  getDependencyResolvers() {
    return [...this.customDependencyResolvers];
  }

  /**
   * 获取自定义冲突解决策略列表
   *
   * @returns {CustomConflictStrategy[]} 策略列表
   */
  getConflictStrategies() {
    return [...this.customConflictStrategies];
  }

  /**
   * 获取自定义文件处理器列表
   *
   * @returns {CustomFileProcessor[]} 处理器列表
   */
  getFileProcessors() {
    return [...this.customFileProcessors];
  }

  /**
   * 卸载插件
   *
   * @param {string} pluginName - 插件名称
   * @returns {boolean} 是否卸载成功
   */
  unloadPlugin(pluginName) {
    const pluginIndex = this.loadedPlugins.findIndex(p => p.name === pluginName);
    if (pluginIndex === -1) {
      console.warn(`插件 ${pluginName} 未加载`);
      return false;
    }

    const plugin = this.loadedPlugins[pluginIndex];

    // 调用插件的卸载钩子
    if (typeof plugin.destroy === 'function') {
      try {
        plugin.destroy();
      } catch (error) {
        console.error(`卸载插件 ${pluginName} 时出错：${error.message}`);
      }
    }

    // 移除插件注册的内容
    if (plugin.dependencyResolvers) {
      this.customDependencyResolvers = this.customDependencyResolvers.filter(
        r => !plugin.dependencyResolvers.includes(r)
      );
    }

    if (plugin.conflictStrategies) {
      this.customConflictStrategies = this.customConflictStrategies.filter(
        s => !plugin.conflictStrategies.includes(s)
      );
    }

    if (plugin.fileProcessors) {
      this.customFileProcessors = this.customFileProcessors.filter(
        p => !plugin.fileProcessors.includes(p)
      );
    }

    this.loadedPlugins.splice(pluginIndex, 1);
    console.log(`插件 ${pluginName} 卸载成功`);
    return true;
  }

  /**
   * 清空所有插件
   */
  clearAllPlugins() {
    // 调用所有插件的卸载钩子
    for (const plugin of this.loadedPlugins) {
      if (typeof plugin.destroy === 'function') {
        try {
          plugin.destroy();
        } catch (e) {
          // 忽略错误
        }
      }
    }

    this.loadedPlugins = [];
    this.customDependencyResolvers = [];
    this.customConflictStrategies = [];
    this.customFileProcessors = [];

    console.log('所有插件已清空');
  }
}

module.exports = { PluginManager };
