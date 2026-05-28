/**
 * 适配器加载器 - 加载和管理 API 格式适配器配置
 */
const fs = require('fs');
const path = require('path');

class AdapterLoader {
  constructor(configPath) {
    this.configPath = configPath;
    this.adapters = {};
    this.providerMapping = {};
    this.defaultAdapter = 'openai-compatible';
    this.initialized = false;
  }

  /**
   * 初始化加载适配器配置
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // 加载适配器索引配置
      const indexPath = path.join(this.configPath, 'adapters', 'index.json');
      const indexConfig = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

      this.defaultAdapter = indexConfig.defaultAdapter || 'openai-compatible';
      this.providerMapping = indexConfig.providerMapping || {};

      // 加载各个适配器配置
      const adapters = indexConfig.adapters || {};
      for (const [name, file] of Object.entries(adapters)) {
        const adapterPath = path.join(this.configPath, 'adapters', file);
        if (fs.existsSync(adapterPath)) {
          this.adapters[name] = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('[AdapterLoader] 初始化失败:', error.message);
      // 使用空适配器作为后备
      this.adapters = {};
    }
  }

  /**
   * 加载自定义适配器配置
   * @param {string} transformerName - 自定义适配器名称（transformer 字段）
   * @returns {object|null} 适配器配置
   */
  loadCustomAdapter(transformerName) {
    if (!transformerName) return null;

    try {
      // transformer 可以是：
      // 1. 相对于 adapters 目录的文件名（如 "custom-adapter.json"）
      // 2. 或者绝对路径
      let adapterPath;

      // 先尝试作为预定义的适配器名称（可能用户配置的就是预定义名称）
      if (this.adapters[transformerName]) {
        return this.adapters[transformerName];
      }

      // 尝试作为 adapters 目录下的文件
      adapterPath = path.join(this.configPath, 'adapters', transformerName);
      if (fs.existsSync(adapterPath)) {
        return JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
      }

      // 尝试添加 .json 后缀
      adapterPath = path.join(this.configPath, 'adapters', `${transformerName}.json`);
      if (fs.existsSync(adapterPath)) {
        return JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
      }

      // 尝试绝对路径
      if (path.isAbsolute(transformerName) && fs.existsSync(transformerName)) {
        return JSON.parse(fs.readFileSync(transformerName, 'utf8'));
      }

      console.warn(`[AdapterLoader] 自定义适配器未找到: ${transformerName}`);
      return null;
    } catch (error) {
      console.error(`[AdapterLoader] 加载自定义适配器失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 根据 provider 名称和配置获取适配器配置
   * @param {string} providerName - provider 名称
   * @param {object} providerConfig - 提供商配置（包含 transformer 和 adapter 字段）
   * @returns {object} 适配器配置
   */
  getAdapter(providerName, providerConfig = {}) {
    if (!this.initialized) {
      this.initialize();
    }

    // 优先使用 transformer（自定义配置）
    if (providerConfig.transformer) {
      const customAdapter = this.loadCustomAdapter(providerConfig.transformer);
      if (customAdapter) {
        return customAdapter;
      }
    }

    // 其次使用 providerConfig.adapter（显式指定的适配器）
    if (providerConfig.adapter) {
      const adapter = this.adapters[providerConfig.adapter];
      if (adapter) {
        return adapter;
      }
    }

    // 再检查 providerMapping
    const adapterName = this.providerMapping[providerName];
    if (adapterName && this.adapters[adapterName]) {
      return this.adapters[adapterName];
    }

    // 返回默认适配器
    return this.adapters[this.defaultAdapter] || null;
  }

  /**
   * 获取适配器的请求配置
   * @param {string} providerName - provider 名称
   * @param {object} providerConfig - 提供商配置
   * @returns {object} 请求配置
   */
  getRequestConfig(providerName, providerConfig) {
    const adapter = this.getAdapter(providerName, providerConfig);
    return adapter ? adapter.request : null;
  }

  /**
   * 获取适配器的响应配置
   * @param {string} providerName - provider 名称
   * @param {object} providerConfig - 提供商配置
   * @returns {object} 响应配置
   */
  getResponseConfig(providerName, providerConfig) {
    const adapter = this.getAdapter(providerName, providerConfig);
    return adapter ? adapter.response : null;
  }

  /**
   * 获取适配器名称
   * @param {string} providerName - provider 名称
   * @param {object} providerConfig - 提供商配置
   * @returns {string} 适配器名称
   */
  getAdapterName(providerName, providerConfig = {}) {
    if (!this.initialized) {
      this.initialize();
    }

    if (providerConfig.transformer) {
      return providerConfig.transformer;
    }
    if (providerConfig.adapter) {
      return providerConfig.adapter;
    }
    return this.providerMapping[providerName] || this.defaultAdapter;
  }

  /**
   * 重新加载适配器配置
   */
  reload() {
    this.initialized = false;
    this.adapters = {};
    this.providerMapping = {};
    this.initialize();
  }

  /**
   * 获取所有已加载的适配器名称（包括预设和自定义）
   * @returns {string[]} 适配器名称列表
   */
  getAdapterNames() {
    if (!this.initialized) {
      this.initialize();
    }
    return Object.keys(this.adapters);
  }

  /**
   * 获取所有适配器的详细信息
   * @returns {Array} 适配器信息列表
   */
  getAllAdapters() {
    if (!this.initialized) {
      this.initialize();
    }

    const adapters = [];
    for (const [name, config] of Object.entries(this.adapters)) {
      adapters.push({
        name,
        displayName: config.name || name,
        format: config.request?.format || 'unknown',
        isCustom: !['openai-compatible', 'anthropic-compatible', 'gemini', 'ollama'].includes(name)
      });
    }
    return adapters;
  }
}

module.exports = AdapterLoader;
