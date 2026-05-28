#!/usr/bin/env node

/**
 * 编排器服务器启动脚本
 *
 * 用于启动编排器代理服务器，接收来自 Claude Code 的请求
 * 并将其传递给分解器进行处理
 */

const fs = require('fs');
const path = require('path');
const OrchestratorServer = require('./src/orchestrator/OrchestratorServer');

// 日志文件配置
const LOG_FILE = path.join(__dirname, 'orchestrator_test.log');

// 清空日志文件
fs.writeFileSync(LOG_FILE, '');

// 创建一个写入流
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// 原始 console 方法
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// 重定向 console 方法到日志文件
console.log = (...args) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] [INFO] ${message}\n`);
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] [ERROR] ${message}\n`);
  originalError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] [WARN] ${message}\n`);
  originalWarn.apply(console, args);
};

// 监听未捕获的异常
process.on('uncaughtException', (error) => {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] [FATAL] Uncaught Exception: ${error.stack || error.message}\n`);
  originalError('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] [FATAL] Unhandled Rejection: ${reason}\n`);
  originalError('未处理的 Promise 拒绝:', reason);
});

// 从命令行参数或环境变量获取配置
const port = parseInt(process.argv[2]) || process.env.ORCHESTRATOR_PORT || 3458;
const ccrUrl = process.env.CCR_ROUTER_URL || 'http://127.0.0.1:3456';
const debug = process.env.DEBUG === 'true' || false;

console.log('🚀 启动弹性编排器服务器...\n');

// 创建服务器实例
const server = new OrchestratorServer({
  port: port,
  ccrRouterUrl: ccrUrl,
  debug: debug,
  autoOrchestrate: true,
  maxConcurrency: 5,
  timeout: 300000
});

// 启动服务器
server.start()
  .then(() => {
    console.log('\n✅ 编排器服务器启动成功!');
    console.log(`🔗 监听地址: http://localhost:${port}`);
    console.log('📋 功能:');
    console.log('   - 接收 Claude Code 请求');
    console.log('   - 智能判断任务复杂度');
    console.log('   - 调用分解器处理复杂任务');
    console.log('   - 转发简单任务到 CCR Router');
    console.log('\n💡 提示: 服务器现在正在运行，等待来自 Claude Code 的请求...');
  })
  .catch(err => {
    console.error('❌ 服务器启动失败:', err.message);
    process.exit(1);
  });

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🛑 正在关闭编排器服务器...');
  try {
    await server.stop();
    console.log('✅ 编排器服务器已安全关闭');
  } catch (err) {
    console.error('❌ 关闭服务器时出错:', err.message);
  }
  logStream.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 正在终止编排器服务器...');
  try {
    await server.stop();
  } catch (err) {
    console.error('❌ 终止服务器时出错:', err.message);
  }
  logStream.end();
  process.exit(0);
});