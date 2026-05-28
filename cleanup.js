/**
 * 关闭编排器服务器
 */

console.log('🔄 正在关闭编排器服务器...');

// 向进程发送终止信号
process.kill(process.pid, 'SIGTERM');

setTimeout(() => {
  console.log('✅ 服务器已关闭');
  process.exit(0);
}, 1000);