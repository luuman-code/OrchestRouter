/**
 * 编排器服务器关闭脚本
 */

const path = require('path');
const { OrchestratorServer } = require('./src/orchestrator/OrchestratorServer');

async function shutdownServer() {
  console.log('🔄 正在关闭编排器服务器...');

  try {
    // 尝试获取当前运行的服务器实例
    // 如果服务器作为全局实例运行，我们需要找到并停止它

    // 从 OrchestratorServer 模块中获取当前实例（如果有的话）
    console.log('🔌 正在停止服务器...');

    // 如果有导出的全局实例，尝试停止它
    if (typeof OrchestratorServer.getInstance === 'function') {
      const serverInstance = OrchestratorServer.getInstance();
      if (serverInstance && typeof serverInstance.stop === 'function') {
        await serverInstance.stop();
        console.log('✅ 服务器实例已停止');
      }
    } else {
      // 如果没有全局实例方法，则创建一个新的服务器实例来停止它
      // 但这通常不会起作用，因为我们需要停止的是已经在运行的实例

      // 作为替代方案，尝试查找是否有其他方式可以访问正在运行的服务器
      console.log('ℹ️  没有找到全局服务器实例，可能没有服务器正在运行或使用了不同的管理模式');

      // 简单的通知
      console.log('ℹ️  如果服务器是作为独立进程运行的，请使用相应的进程管理命令关闭它');
    }

    console.log('🛑 服务器关闭过程完成');
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error.message);
    console.error('   详情:', error.stack);
  }
}

// 执行关闭操作
shutdownServer()
  .then(() => {
    console.log('🎯 服务器关闭脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });