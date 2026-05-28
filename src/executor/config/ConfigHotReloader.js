/**
 * ConfigHotReloader - 配置热加载器
 *
 * 支持运行时动态重新加载配置，无需重启服务
 * 配置文件变化时自动检测并重新加载
 *
 * @class ConfigHotReloader
 */
const fs = require('fs');
const path = require('path');
const { ExecutorConfigLoader } = require('./ExecutorConfigLoader');
const { ExecutorConfig } = require('./ExecutorConfig');

class ConfigHotReloader {
  /**
   * 创建配置热加载器
   * @param {Object} options - 选项
   * @param {string} options.configPath - 配置文件路径
   * @param {boolean} options.autoReload - 是否自动重新加载
   * @param {number} options.pollInterval - 轮询间隔（毫秒）
   */
  constructor(options = {}) {
    this.configPath = options.configPath || './config/executor.yaml';
    this.autoReload = options.autoReload ?? false;
    this.pollInterval = options.pollInterval || 5000;

    this.configLoader = new ExecutorConfigLoader(this.configPath);
    this.currentConfig = null;
    this.currentConfigHash = null;
    this.watchTimer = null;
    this.listeners = [];
    this.isReloading = false;
  }

  /**
   * 初始化配置热加载器
   * @returns {Promise<void>}
   */
  async initialize() {
    // 加载初始配置
    await this.loadConfig();

    // 如果启用自动重新加载，启动轮询
    if (this.autoReload) {
      this.startWatching();
    }
  }

  /**
   * 计算文件内容的哈希值
   * @param {string} content - 文件内容
   * @returns {string} 哈希值
   */
  calculateHash(content) {
    // 简单的哈希计算
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 加载配置
   * @returns {Promise<ExecutorConfig>} 配置对象
   */
  async loadConfig() {
    try {
      const rawConfig = await this.configLoader.loadConfig();
      const config = new ExecutorConfig(rawConfig);
      config.validate();

      // 计算配置哈希
      const content = fs.readFileSync(
        path.isAbsolute(this.configPath) ? this.configPath : path.resolve(process.cwd(), this.configPath),
        'utf8'
      );
      const newHash = this.calculateHash(content);

      // 检测配置是否发生变化
      if (this.currentConfigHash && newHash !== this.currentConfigHash) {
        console.log('[ConfigHotReloader] 配置发生变化');
        const oldConfig = this.currentConfig;
        this.currentConfig = config;
        this.currentConfigHash = newHash;

        // 通知监听器
        await this.notifyListeners(oldConfig, config);
      } else {
        this.currentConfig = config;
        this.currentConfigHash = newHash;
      }

      return config;
    } catch (error) {
      console.error('[ConfigHotReloader] 加载配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 启动配置监控
   */
  startWatching() {
    if (this.watchTimer) {
      return;
    }

    console.log('[ConfigHotReloader] 启动配置监控，轮询间隔：' + this.pollInterval + 'ms');

    this.watchTimer = setInterval(async () => {
      if (this.isReloading) {
        return;
      }

      try {
        await this.reloadConfig();
      } catch (error) {
        console.error('[ConfigHotReloader] 配置重新加载失败:', error.message);
      }
    }, this.pollInterval);
  }

  /**
   * 停止配置监控
   */
  stopWatching() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
      console.log('[ConfigHotReloader] 配置监控已停止');
    }
  }

  /**
   * 手动重新加载配置
   * @returns {Promise<ExecutorConfig>} 配置对象
   */
  async reloadConfig() {
    if (this.isReloading) {
      console.log('[ConfigHotReloader] 配置正在重新加载中，跳过本次轮询');
      return this.currentConfig;
    }

    this.isReloading = true;

    try {
      // 检查文件是否发生变化
      const absolutePath = path.isAbsolute(this.configPath)
        ? this.configPath
        : path.resolve(process.cwd(), this.configPath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`配置文件不存在：${absolutePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      const newHash = this.calculateHash(content);

      if (newHash === this.currentConfigHash) {
        // 配置未发生变化
        return this.currentConfig;
      }

      console.log('[ConfigHotReloader] 检测到配置变化，开始重新加载...');

      // 重新加载配置
      const config = await this.loadConfig();

      console.log('[ConfigHotReloader] 配置重新加载成功');

      return config;
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * 添加配置变化监听器
   * @param {Function} listener - 监听器函数
   * @param {string} listener.name - 监听器名称（用于日志）
   * @returns {void}
   */
  addListener(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }

    this.listeners.push(listener);
    console.log(`[ConfigHotReloader] 添加监听器：${listener.name || 'anonymous'}`);
  }

  /**
   * 移除配置变化监听器
   * @param {Function} listener - 监听器函数
   * @returns {boolean} 是否移除成功
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
      console.log(`[ConfigHotReloader] 移除监听器：${listener.name || 'anonymous'}`);
      return true;
    }
    return false;
  }

  /**
   * 通知所有监听器配置已变化
   * @param {ExecutorConfig} oldConfig - 旧配置
   * @param {ExecutorConfig} newConfig - 新配置
   * @returns {Promise<void>}
   */
  async notifyListeners(oldConfig, newConfig) {
    console.log(`[ConfigHotReloader] 通知 ${this.listeners.length} 个监听器配置变化`);

    for (const listener of this.listeners) {
      try {
        await listener(oldConfig, newConfig);
      } catch (error) {
        console.error(`[ConfigHotReloader] 监听器 ${listener.name || 'anonymous'} 执行失败:`, error.message);
      }
    }
  }

  /**
   * 获取当前配置
   * @returns {ExecutorConfig} 当前配置对象
   */
  getCurrentConfig() {
    return this.currentConfig;
  }

  /**
   * 获取配置哈希值
   * @returns {string} 配置哈希值
   */
  getConfigHash() {
    return this.currentConfigHash;
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopWatching();
    this.listeners = [];
    console.log('[ConfigHotReloader] 资源已清理');
  }
}

module.exports = { ConfigHotReloader };