const http = require('http');

async function closeServer() {
  const baseUrl = 'http://localhost:3458';

  console.log('📴 正在关闭编排器服务器...\n');

  try {
    // 尝试发送关闭请求
    const response = await fetch(`${baseUrl}/shutdown`, {
      method: 'POST'
    }).catch(() => null);

    if (response && response.ok) {
      console.log('✅ 服务器已关闭');
    } else {
      console.log('⚠️ 服务器没有 shutdown 端点，尝试其他方式...');

      // 使用 node 发送请求来关闭服务器
      const closeRequest = async () => {
        return new Promise((resolve, reject) => {
          const req = http.request(`${baseUrl}/shutdown`, {
            method: 'POST',
            timeout: 5000
          }, (res) => {
            if (res.statusCode === 200) {
              console.log('✅ 服务器已关闭');
              resolve();
            } else {
              reject(new Error(`Status: ${res.statusCode}`));
            }
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
          req.end();
        });
      };

      await closeRequest().catch(() => {
        console.log('⚠️ 无法通过 API 关闭服务器');
        console.log('\n请使用以下方式手动关闭:');
        console.log('  1. 在运行编排器的终端按 Ctrl+C');
        console.log('  2. 或者使用任务管理器结束 node 进程');
      });
    }
  } catch (error) {
    console.log('❌ 关闭失败:', error.message);
    console.log('\n请使用以下方式手动关闭:');
    console.log('  1. 在运行编排器的终端按 Ctrl+C');
    console.log('  2. 或者在任务管理器中结束 node 进程');
  }
}

closeServer();
