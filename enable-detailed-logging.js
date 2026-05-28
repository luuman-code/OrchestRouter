#!/usr/bin/env node

/**
 * 临时启动脚本，启用详细API日志记录
 */

const fs = require('fs');
const path = require('path');

// 为OrchestratorServer设置详细日志配置
const configPath = path.join(__dirname, 'config', 'config.json');
const configDir = path.dirname(configPath);

// 确保配置目录存在
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 创建或更新配置
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.log('配置文件格式错误，创建新的配置文件');
  }
}

// 添加详细的API日志配置
config.executor = {
  ...config.executor,
  enableDetailedLogging: true,
  debugMode: true
};

config.system = {
  ...config.system,
  port: 3458,
  debug: true,
  detailedApiLogging: true
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('✅ 详细API日志记录已启用');
console.log('📋 配置文件已更新:', configPath);
console.log('🔧 配置项:');
console.log('   - executor.enableDetailedLogging: true');
console.log('   - system.detailedApiLogging: true');

// 同时设置环境变量
process.env.DETAILED_API_LOGGING = 'true';
process.env.DEBUG_MODE = 'true';

console.log('\n💡 要使用详细日志，请使用以下命令启动服务器:');
console.log('   node start-orchestrator.js');
console.log('\n📊 详细的API日志将保存在 ./detailed-api-logs/ 目录中');