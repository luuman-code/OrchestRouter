/**
 * 配置管理器 - 主配置文件
 *
 * 提供统一的配置加载和管理功能
 * 支持 YAML、JSON 和 JS 格式的配置
 */

const ConfigManager = require('./config/ConfigManager');

// 创建配置管理器实例
const configManager = new ConfigManager();

// 加载配置
const config = configManager.loadConfig();

// 导出配置对象
module.exports = config;
module.exports.ConfigManager = ConfigManager;
module.exports.configManager = configManager;