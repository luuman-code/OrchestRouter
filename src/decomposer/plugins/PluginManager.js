/**
 * PluginManager - 插件管理器（增强版）
 *
 * 功能块 B：配置与插件层
 * 管理分解器的各种插件，包括类型插件、处理器插件等
 * 支持插件自动发现、注册、启用/禁用和执行
 */

const fs = require('fs');
const path = require('path');
const BasePlugin = require('./BasePlugin');

class PluginManager {
  constructor(config = {}) {
    this.plugins = new Map(); // 存储已注册的插件
    this.pluginPaths = config.paths || ['./plugins', './src/decomposer/plugins/built-in'];
    this.enabledPlugins = config.enabled || [];
    this.config = config;
    this.typeMappings = config.typeMappings || {};
    this.initialized = false;
  }

  /**
   * 初始化插件管理器
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log('初始化插件管理器...');

    // 加载内置插件
    await this.loadBuiltInPlugins();

    // 从配置路径加载插件
    for (const pluginPath of this.pluginPaths) {
      await this.loadPluginsFromPath(pluginPath);
    }

    // 启用配置的插件
    for (const pluginName of this.enabledPlugins) {
      this.enablePlugin(pluginName);
    }

    this.initialized = true;
    console.log(`插件管理器初始化完成，已加载 ${this.plugins.size} 个插件`);
  }

  /**
   * 加载内置插件
   */
  async loadBuiltInPlugins() {
    const builtInPath = path.join(__dirname, 'built-in');

    if (fs.existsSync(builtInPath)) {
      const files = fs.readdirSync(builtInPath);

      for (const file of files) {
        if (file.endsWith('.js') && file !== 'BasePlugin.js') {
          try {
            const pluginPath = path.join(builtInPath, file);
            await this.loadPluginFile(pluginPath);
          } catch (error) {
            console.warn(`加载内置插件 ${file} 失败：`, error.message);
          }
        }
      }
    }
  }

  /**
   * 从指定路径加载插件
   */
  async loadPluginsFromPath(dirPath) {
    // 支持相对路径和绝对路径
    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(process.cwd(), dirPath);

    if (!fs.existsSync(absolutePath)) {
      console.log(`插件路径不存在：${absolutePath}`);
      return;
    }

    try {
      const files = fs.readdirSync(absolutePath);

      for (const file of files) {
        if (file.endsWith('.js') && file !== 'BasePlugin.js') {
          try {
            const pluginPath = path.join(absolutePath, file);
            await this.loadPluginFile(pluginPath);
          } catch (error) {
            console.warn(`加载插件 ${file} 失败：`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`扫描插件目录 ${absolutePath} 失败：`, error.message);
    }
  }

  /**
   * 加载单个插件文件
   */
  async loadPluginFile(pluginPath) {
    try {
      const pluginModule = require(pluginPath);
      const PluginClass = pluginModule.default || pluginModule;

      // 检查是否是有效的插件类
      if (typeof PluginClass !== 'function') {
        return;
      }

      // 创建插件实例
      const plugin = new PluginClass(this.config);

      // 检查是否是 BasePlugin 的子类
      if (!(plugin instanceof BasePlugin)) {
        console.warn(`插件 ${plugin.name || pluginPath} 不是 BasePlugin 的子类，已跳过`);
        return;
      }

      // 初始化插件
      await plugin.initialize();

      // 注册插件
      this.registerPlugin(plugin.name || path.basename(pluginPath, '.js'), plugin);

    } catch (error) {
      console.warn(`加载插件文件 ${pluginPath} 失败:`, error.message);
    }
  }

  /**
   * 注册插件
   */
  registerPlugin(name, plugin) {
    if (typeof plugin !== 'object' || typeof plugin.execute !== 'function') {
      throw new Error(`Invalid plugin ${name}. Plugin must have an 'execute' method.`);
    }

    // 检查是否已存在同名插件
    if (this.plugins.has(name)) {
      console.warn(`插件 ${name} 已存在，将被覆盖`);
    }

    this.plugins.set(name, {
      instance: plugin,
      name: name,
      enabled: this.enabledPlugins.includes(name) || plugin.enabled,
      metadata: plugin.metadata || {},
      typeDefinitions: plugin.getTypeDefinitions ? plugin.getTypeDefinitions() : {},
      matchingRules: plugin.getMatchingRules ? plugin.getMatchingRules() : []
    });

    console.log(`插件 ${name} 已注册`);
  }

  /**
   * 加载单个插件（通过路径）
   */
  async loadPlugin(pluginPath) {
    await this.loadPluginFile(pluginPath);
  }

  /**
   * 加载所有可用插件（已废弃，使用 initialize 代替）
   */
  async loadAllPlugins() {
    console.warn('loadAllPlugins 已废弃，请使用 initialize() 方法');
    await this.initialize();
  }

  /**
   * 启用插件
   */
  enablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      plugin.instance.enable();
      console.log(`插件 ${name} 已启用`);

      // 添加插件的类型映射
      if (plugin.typeDefinitions) {
        this.addPluginTypeMappings(plugin.typeDefinitions);
      }

      return true;
    } else {
      console.warn(`插件 ${name} 未找到`);
      return false;
    }
  }

  /**
   * 禁用插件
   */
  disablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      plugin.instance.disable();
      console.log(`插件 ${name} 已禁用`);
      return true;
    } else {
      console.warn(`插件 ${name} 未找到`);
      return false;
    }
  }

  /**
   * 执行插件
   */
  async executePlugin(name, context) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`插件 ${name} 不存在`);
    }

    if (!plugin.enabled) {
      throw new Error(`插件 ${name} 未启用`);
    }

    try {
      return await plugin.instance.execute(context);
    } catch (error) {
      console.error(`执行插件 ${name} 时出错:`, error.message);
      throw error;
    }
  }

  /**
   * 执行所有启用的插件
   */
  async executeAllPlugins(context) {
    const results = [];

    for (const [name, plugin] of this.plugins) {
      if (plugin.enabled) {
        try {
          const result = await plugin.instance.execute(context);
          results.push({ pluginName: name, result, success: true });
        } catch (error) {
          results.push({ pluginName: name, error: error.message, success: false });
        }
      }
    }

    return results;
  }

  /**
   * 获取所有插件列表
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取已启用的插件
   */
  getEnabledPlugins() {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  /**
   * 获取已禁用的插件
   */
  getDisabledPlugins() {
    return Array.from(this.plugins.values()).filter(p => !p.enabled);
  }

  /**
   * 获取指定插件
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * 检查插件是否存在
   */
  hasPlugin(name) {
    return this.plugins.has(name);
  }

  /**
   * 获取所有插件的类型定义
   */
  getAllTypeDefinitions() {
    const allTypes = {};

    for (const [name, plugin] of this.plugins) {
      if (plugin.enabled && plugin.typeDefinitions) {
        Object.assign(allTypes, plugin.typeDefinitions);
      }
    }

    return allTypes;
  }

  /**
   * 获取所有插件的匹配规则
   */
  getAllMatchingRules() {
    const allRules = [];

    for (const [name, plugin] of this.plugins) {
      if (plugin.enabled && plugin.matchingRules) {
        allRules.push(...plugin.matchingRules.map(rule => ({
          ...rule,
          pluginName: name
        })));
      }
    }

    return allRules;
  }

  /**
   * 添加插件类型映射
   */
  addPluginTypeMappings(typeDefinitions) {
    for (const [type, typeDef] of Object.entries(typeDefinitions)) {
      if (!this.typeMappings[type]) {
        this.typeMappings[type] = [];
      }

      // 添加类型定义中的关键词
      if (typeDef.keywords && Array.isArray(typeDef.keywords)) {
        // 关键词映射由 TypeAnnotator 处理
      }
    }
  }

  /**
   * 添加自定义类型映射（供类型标注器使用）
   */
  addCustomTypeMapping(type, keywords) {
    if (!this.typeMappings[type]) {
      this.typeMappings[type] = keywords;
    } else {
      this.typeMappings[type] = [...new Set([...this.typeMappings[type], ...keywords])];
    }

    // 同步到启用的插件
    for (const [name, plugin] of this.plugins) {
      if (plugin.enabled && plugin.instance.addTypeMapping) {
        plugin.instance.addTypeMapping(type, keywords);
      }
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      try {
        await plugin.instance.dispose();
      } catch (error) {
        console.error(`卸载插件 ${name} 时出错:`, error.message);
      }

      this.plugins.delete(name);
      console.log(`插件 ${name} 已卸载`);
      return true;
    }

    return false;
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(name) {
    await this.unloadPlugin(name);

    // 从已知的插件路径重新加载
    for (const pluginPath of this.pluginPaths) {
      const absolutePath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.join(process.cwd(), pluginPath);

      if (fs.existsSync(absolutePath)) {
        const files = fs.readdirSync(absolutePath);
        for (const file of files) {
          if (file.toLowerCase().includes(name.toLowerCase()) && file.endsWith('.js')) {
            const pluginFilePath = path.join(absolutePath, file);
            await this.loadPluginFile(pluginFilePath);
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 获取插件统计信息
   */
  getPluginStats() {
    const allPlugins = this.getAllPlugins();
    const enabledPlugins = this.getEnabledPlugins();

    return {
      total: allPlugins.length,
      enabled: enabledPlugins.length,
      disabled: allPlugins.length - enabledPlugins.length,
      pluginNames: allPlugins.map(p => p.name),
      enabledPluginNames: enabledPlugins.map(p => p.name)
    };
  }

  /**
   * 导出插件配置
   */
  exportPluginConfig() {
    const config = {
      paths: this.pluginPaths,
      enabled: this.getEnabledPlugins().map(p => p.name),
      plugins: {}
    };

    for (const [name, plugin] of this.plugins) {
      config.plugins[name] = {
        version: plugin.metadata.version,
        description: plugin.metadata.description,
        author: plugin.metadata.author,
        enabled: plugin.enabled
      };
    }

    return config;
  }
}

module.exports = PluginManager;