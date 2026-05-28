/**
 * 测试并发执行脚本
 * 发送一个包含多个子任务的大任务，测试并发执行
 */
const http = require('http');

const TEST_REQUEST = {
  "task": {
    "title": "Concurrent Test - Multiple File Creation",
    "description": "Create 10 different configuration files simultaneously to test concurrent execution",
    "deliverables": [
      { "id": "file1", "description": "Create config.yaml", "type": "api", "filePath": "config1.yaml" },
      { "id": "file2", "description": "Create settings.json", "type": "api", "filePath": "settings.json" },
      { "id": "file3", "description": "Create database.conf", "type": "api", "filePath": "database.conf" },
      { "id": "file4", "description": "Create cache.ini", "type": "api", "filePath": "cache.ini" },
      { "id": "file5", "description": "Create logging.xml", "type": "api", "filePath": "logging.xml" },
      { "id": "file6", "description": "Create security.yaml", "type": "api", "filePath": "security.yaml" },
      { "id": "file7", "description": "Create redis.conf", "type": "api", "filePath": "redis.conf" },
      { "id": "file8", "description": "Create nginx.conf", "type": "api", "filePath": "nginx.conf" },
      { "id": "file9", "description": "Create api_config.yaml", "type": "api", "filePath": "api_config.yaml" },
      { "id": "file10", "description": "Create app_config.json", "type": "api", "filePath": "app_config.json" }
    ]
  },
  "options": {
    "enableDecomposition": true,
    "enableModelSelection": true,
    "enableExecution": true
  },
  "outputFormat": "tool_call"
};

function sendRequest(requestData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(requestData);

    const options = {
      hostname: 'localhost',
      port: 3458,
      path: '/v1/orchestrate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== 并发执行测试开始 ===');
  console.log(`发送时间: ${new Date().toISOString()}`);
  console.log(`任务数量: ${TEST_REQUEST.task.deliverables.length}`);
  console.log('');

  try {
    console.log('正在发送请求到编排器...');
    const result = await sendRequest(TEST_REQUEST);
    console.log(`响应状态: ${result.status}`);
    console.log('响应数据:');
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

main();
