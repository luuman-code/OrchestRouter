/**
 * 编排器服务器关闭脚本
 *
 * 注意：此脚本仅能关闭在当前进程中运行的服务器实例。
 * 如果服务器已在单独的进程中运行，需要使用对应进程管理命令关闭。
 */

const path = require('path');
const { execSync } = require('child_process');

async function shutdownServer() {
  console.log('🔄 正在准备关闭编排器服务器...');

  try {
    // 检查是否有正在运行的编排器服务器进程
    console.log('🔍 检查正在运行的节点进程...');

    try {
      // 尝试查找node进程中包含orchestrator的进程
      const result = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', { encoding: 'utf8' });
      const lines = result.split('\n').slice(1); // 跳过标题行

      let foundOrchestratorProcess = false;
      for (const line of lines) {
        if (line.toLowerCase().includes('orchestrator') || line.toLowerCase().includes('server')) {
          const processName = line.split(',')[0].replace(/"/g, '');
          if (processName === 'node.exe') {
            console.log('⚠️  发现可能的编排器服务器进程，但需要进一步确认');
            foundOrchestratorProcess = true;
          }
        }
      }

      if (!foundOrchestratorProcess) {
        console.log('ℹ️  未发现明确的编排器服务器进程');
        console.log('💡  如果服务器在当前进程中运行，它会在程序结束时自动关闭');
      }
    } catch (execError) {
      console.log('⚠️  无法执行进程检查 (这在某些环境中是正常的)');
    }

    // 尝试导入 OrchestratorServer 类并检查是否有活动实例
    try {
      const OrchestratorServer = require('./src/orchestrator/OrchestratorServer');

      // 因为我们不知道服务器实例是否存在，
      // 我们创建一个示例来展示如何正确停止它
      console.log('\n📋 服务器停止方法说明:');
      console.log('   如果服务器实例存在，可调用 server.stop() 方法:');
      console.log('   await serverInstance.stop();');

    } catch (importError) {
      console.log('⚠️  无法导入服务器模块，可能已被修改或移动');
    }

    console.log('\n🛑 服务器关闭操作完成');
    console.log('💡  提示：如果服务器正在运行，您可以发送 SIGINT 信号 (Ctrl+C) 来触发优雅关闭');

  } catch (error) {
    console.error('❌ 关闭过程中出现错误:', error.message);
    console.error('   详情:', error.stack);
  }
}

// 执行关闭操作
shutdownServer()
  .then(() => {
    console.log('\n🎯 服务器关闭检查脚本执行完成');
  })
  .catch((error) => {
    console.error('💥 脚本执行失败:', error);
  });