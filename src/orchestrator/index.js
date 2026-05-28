#!/usr/bin/env node

/**
 * 编排器主入口
 *
 * 用于启动编排器服务器并处理配置
 */

// 加载环境变量
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('警告：无法加载 .env 文件，将使用系统环境变量');
} else {
  console.log(`已加载环境变量：${envPath}`);
}

const OrchestratorServer = require('./OrchestratorServer');

// 引入 ConfigService，从统一配置文件读取配置
const ConfigService = require('../../config/ConfigService');
const configService = new ConfigService();
const fullConfig = configService.getConfig();

// 从 orchestrator 节点获取配置，system 节点作为回退
const orchestratorConfig = fullConfig.orchestrator || {};
const systemConfig = fullConfig.system || {};

// 配置优先级：环境变量 > orchestrator 节点 > system 节点 > 默认值
const config = {
  port: parseInt(process.env.ORCHESTRATOR_PORT) || orchestratorConfig.port || systemConfig.port || 3458,
  ccrRouterUrl: process.env.CCR_ROUTER_URL || orchestratorConfig.ccrRouterUrl || systemConfig.ccrRouterUrl || 'http://127.0.0.1:3456',
  debug: process.env.DEBUG === 'true' || orchestratorConfig.debug || systemConfig.debug || false,
  autoOrchestrate: process.env.AUTO_ORCHESTRATE !== 'false' && (orchestratorConfig.autoOrchestrate !== false),
  orchestrationThreshold: parseFloat(process.env.ORCHESTRATION_THRESHOLD) || orchestratorConfig.orchestrationThreshold || 0.7,
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY) || orchestratorConfig.maxConcurrency || systemConfig.maxConcurrency || 5,
  timeout: parseInt(process.env.ORCHESTRATOR_TIMEOUT) || orchestratorConfig.timeout || 300000
};

// 创建服务器实例
const server = new OrchestratorServer(config);

console.log('===========================================');
console.log('  弹性编排器 V1.0');
console.log('  正在启动中...');
console.log('  配置信息:');
console.log(`    端口: ${config.port}`);
console.log(`    CCR路由地址: ${config.ccrRouterUrl}`);
console.log(`    调试模式: ${config.debug ? '开启' : '关闭'}`);
console.log(`    自动编排: ${config.autoOrchestrate ? '开启' : '关闭'}`);
console.log(`    最大并发: ${config.maxConcurrency}`);
console.log('===========================================');

// 启动服务器
server.start()
  .then(() => {
    console.log(`编排器服务器已在端口 ${config.port} 上启动`);
  })
  .catch(err => {
    console.error('服务器启动失败:', err);
    process.exit(1);
  });

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭编排器服务器...');
  try {
    await server.stop();
    console.log('编排器服务器已安全关闭');
  } catch (err) {
    console.error('关闭服务器时出错:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在终止编排器服务器...');
  try {
    await server.stop();
  } catch (err) {
    console.error('终止服务器时出错:', err);
  }
  process.exit(0);
});
