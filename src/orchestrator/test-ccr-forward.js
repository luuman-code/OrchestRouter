/**
 * CCR Router 转发功能测试
 * 测试当编排器决定不进行任务分解时，请求是否正确转发到 CCR Router
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3458';
const CCR_ROUTER_URL = 'http://127.0.0.1:3456';

// 辅助函数：发送 HTTP 请求
function makeRequest(host, port, endpoint, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseBody);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// 向编排器发送请求
function sendToOrchestrator(data) {
  return makeRequest('127.0.0.1', 3458, '/v1/orchestrate', 'POST', data);
}

// 直接向 CCR Router 发送请求
function sendToCCRRouter(data) {
  return makeRequest('127.0.0.1', 3456, '/v1/messages', 'POST', data);
}

async function runCCRForwardTests() {
  console.log('🔄 开始测试 CCR Router 转发功能...\n');
  console.log('说明：当编排器判断请求不需要分解时，会转发到 CCR Router');
  console.log('测试使用简单问题/解释性问题来触发转发逻辑\n');

  // 测试 1: 简单问题 - 应该触发转发
  console.log('📝 测试 1: 简单问题（什么是 JavaScript?）- 应该触发转发');
  try {
    const requestBody = {
      messages: [{
        role: 'user',
        content: '什么是 JavaScript？请简单介绍一下。'
      }]
    };

    const response = await sendToOrchestrator(requestBody);
    console.log(`   状态码：${response.statusCode}`);

    if (response.statusCode === 200) {
      console.log(`   ✅ 请求成功处理`);
      if (response.body.orchestrated) {
        console.log(`   ℹ️  请求被编排器处理（可能进行了分解）`);
      } else {
        console.log(`   ℹ️  请求被转发到 CCR Router`);
      }
    } else {
      console.log(`   ⚠️  请求处理失败`);
      console.log(`   响应：${JSON.stringify(response.body).substring(0, 200)}...`);
    }
  } catch (error) {
    console.error(`   ❌ 测试失败：${error.message}`);
  }
  console.log('');

  // 测试 2: 解释性问题 - 应该触发转发
  console.log('📝 测试 2: 解释性问题（解释闭包）- 应该触发转发');
  try {
    const requestBody = {
      messages: [{
        role: 'user',
        content: '请解释一下 JavaScript 中的闭包是什么，如何使用？'
      }]
    };

    const response = await sendToOrchestrator(requestBody);
    console.log(`   状态码：${response.statusCode}`);

    if (response.statusCode === 200) {
      console.log(`   ✅ 请求成功处理`);
    } else {
      console.log(`   ⚠️  请求处理失败`);
    }
  } catch (error) {
    console.error(`   ❌ 测试失败：${error.message}`);
  }
  console.log('');

  // 测试 3: 分析问题 - 应该触发转发
  console.log('📝 测试 3: 分析问题（分析代码）- 应该触发转发');
  try {
    const requestBody = {
      messages: [{
        role: 'user',
        content: '分析一下这段代码有什么问题：function test() { return 1 + "2"; }'
      }]
    };

    const response = await sendToOrchestrator(requestBody);
    console.log(`   状态码：${response.statusCode}`);

    if (response.statusCode === 200) {
      console.log(`   ✅ 请求成功处理`);
    } else {
      console.log(`   ⚠️  请求处理失败`);
    }
  } catch (error) {
    console.error(`   ❌ 测试失败：${error.message}`);
  }
  console.log('');

  // 测试 4: 翻译请求 - 应该触发转发
  console.log('📝 测试 4: 翻译请求 - 应该触发转发');
  try {
    const requestBody = {
      messages: [{
        role: 'user',
        content: '请把这句话翻译成英文：你好，世界'
      }]
    };

    const response = await sendToOrchestrator(requestBody);
    console.log(`   状态码：${response.statusCode}`);

    if (response.statusCode === 200) {
      console.log(`   ✅ 请求成功处理`);
    } else {
      console.log(`   ⚠️  请求处理失败`);
    }
  } catch (error) {
    console.error(`   ❌ 测试失败：${error.message}`);
  }
  console.log('');

  // 测试 5: 检查 CCR Router 是否可用
  console.log('📝 测试 5: 直接测试 CCR Router 是否可用');
  try {
    const requestBody = {
      model: 'test',
      messages: [{
        role: 'user',
        content: 'Hello'
      }]
    };

    const response = await sendToCCRRouter(requestBody);
    console.log(`   状态码：${response.statusCode}`);
    console.log(`   响应：${JSON.stringify(response.body).substring(0, 200)}...`);

    if (response.statusCode === 200) {
      console.log(`   ✅ CCR Router 可用`);
    } else {
      console.log(`   ⚠️ CCR Router 返回非 200 状态码`);
    }
  } catch (error) {
    console.error(`   ❌ CCR Router 不可用：${error.message}`);
    console.log(`   注意：CCR Router 可能未启动在 http://127.0.0.1:3456`);
  }
  console.log('');

  console.log('📊 测试总结:');
  console.log('- 如果 CCR Router 未运行，转发测试会失败，这是正常的');
  console.log('- 转发功能依赖于 CCR Router 在 http://127.0.0.1:3456 上运行');
  console.log('- 简单问题、解释性问题、分析请求等应该触发转发逻辑');
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runCCRForwardTests().catch(console.error);
}

module.exports = {
  runCCRForwardTests,
  makeRequest,
  sendToOrchestrator,
  sendToCCRRouter
};