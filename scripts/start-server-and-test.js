#!/usr/bin/env node

/**
 * 启动编排器服务器并运行测试
 *
 * 用法：node start-server-and-test.js
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const CONFIG = {
  orchestratorPort: 3458,
  startupDelay: 4000, // 4 秒启动延迟
  healthCheckRetries: 5,
  healthCheckInterval: 1000
};

/**
 * 检查服务器健康状态
 */
async function checkHealth() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CONFIG.orchestratorPort}/health`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.status === 'ok');
        } catch (e) {
          reject(new Error('健康检查响应解析失败'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * 等待服务器就绪
 */
async function waitForServer() {
  console.log('等待服务器启动...');

  for (let i = 0; i < CONFIG.healthCheckRetries; i++) {
    try {
      const isHealthy = await checkHealth();
      if (isHealthy) {
        console.log('✅ 服务器已就绪');
        return true;
      }
    } catch (error) {
      console.log(`  尝试 ${i + 1}/${CONFIG.healthCheckRetries}: 服务器尚未就绪...`);
    }
    await new Promise(resolve => setTimeout(resolve, CONFIG.healthCheckInterval));
  }

  throw new Error('服务器启动超时');
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🧪 编排器服务器启动和测试');
  console.log('='.repeat(60));
  console.log('');

  // 1. 启动编排器服务器
  console.log('[1/3] 启动编排器服务器...');

  const serverProcess = spawn('node', ['src/orchestrator/index.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  let serverStarted = false;

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (!serverStarted) {
      console.log(output);
      if (output.includes('编排器服务器已启动') || output.includes('监听端口')) {
        serverStarted = true;
      }
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[服务器错误] ${data}`);
  });

  serverProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`服务器意外退出，退出码：${code}`);
      process.exit(1);
    }
  });

  // 等待服务器启动
  await new Promise(resolve => setTimeout(resolve, CONFIG.startupDelay));

  try {
    await waitForServer();
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    serverProcess.kill();
    process.exit(1);
  }

  console.log('');

  // 2. 运行测试
  console.log('[2/3] 运行完整工作流程测试...');
  console.log('');

  const testProcess = spawn('node', ['tests/full-orchestrator-workflow-test.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  // 3. 等待测试完成
  await new Promise((resolve) => {
    testProcess.on('close', (code) => {
      console.log('');
      console.log('[3/3] 测试完成');
      console.log('');
      console.log('服务器仍在后台运行，如需停止请按 Ctrl+C');
      resolve();
    });
  });
}

// 运行主函数
main().catch(error => {
  console.error('执行失败:', error.message);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭...');
  process.exit(0);
});
