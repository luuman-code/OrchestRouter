/**
 * CCR Router 转发功能测试 - 简化版本
 */

const http = require('http');

function makeRequest(host, port, endpoint, method, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: endpoint,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000  // 10 秒超时
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log('🔄 CCR Router 转发功能测试\n');

  // 测试 1: 直接测试 CCR Router
  console.log('1️⃣ 直接测试 CCR Router (127.0.0.1:3456)');
  try {
    const res = await makeRequest('127.0.0.1', 3456, '/v1/messages', 'POST', {
      model: 'test',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    console.log(`   CCR Router 状态：${res.statusCode}`);
    console.log(`   响应：${JSON.stringify(res.body).substring(0, 150)}...`);
  } catch (e) {
    console.log(`   ❌ CCR Router 错误：${e.message}`);
  }
  console.log('');

  // 测试 2: 测试编排器的健康检查
  console.log('2️⃣ 测试编排器健康检查 (127.0.0.1:3458)');
  try {
    const res = await makeRequest('127.0.0.1', 3458, '/health', 'GET', null);
    console.log(`   编排器状态：${res.statusCode}`);
    console.log(`   响应：${JSON.stringify(res.body)}`);
  } catch (e) {
    console.log(`   ❌ 编排器错误：${e.message}`);
  }
  console.log('');

  // 测试 3: 简单问题（应该转发）
  console.log('3️⃣ 简单问题测试（应该转发到 CCR Router）');
  console.log('   请求："什么是 JavaScript？"');
  try {
    const res = await makeRequest('127.0.0.1', 3458, '/v1/orchestrate', 'POST', {
      messages: [{ role: 'user', content: '什么是 JavaScript？' }]
    });
    console.log(`   状态码：${res.statusCode}`);
    if (res.statusCode === 200) {
      if (res.body.orchestrated) {
        console.log(`   ⚠️  请求被编排器分解了（可能关键词判断有误）`);
      } else {
        console.log(`   ✅ 请求被转发到 CCR Router`);
      }
    } else {
      console.log(`   ❌ 请求失败：${JSON.stringify(res.body).substring(0, 100)}...`);
    }
  } catch (e) {
    console.log(`   ❌ 错误：${e.message}`);
  }
  console.log('');

  // 测试 4: 翻译请求（应该转发）
  console.log('4️⃣ 翻译请求测试（应该转发到 CCR Router）');
  console.log('   请求："翻译这句话：你好"');
  try {
    const res = await makeRequest('127.0.0.1', 3458, '/v1/orchestrate', 'POST', {
      messages: [{ role: 'user', content: '翻译：你好' }]
    });
    console.log(`   状态码：${res.statusCode}`);
    if (res.statusCode === 200) {
      if (res.body.orchestrated) {
        console.log(`   ⚠️  请求被编排器分解了`);
      } else {
        console.log(`   ✅ 请求被转发到 CCR Router`);
      }
    } else {
      console.log(`   ❌ 请求失败：${JSON.stringify(res.body).substring(0, 100)}...`);
    }
  } catch (e) {
    console.log(`   ❌ 错误：${e.message}`);
  }
  console.log('');

  // 测试 5: 复杂任务（应该分解）
  console.log('5️⃣ 复杂任务测试（应该被编排器分解）');
  console.log('   请求："创建一个登录页面，包含用户名密码输入和登录功能"');
  try {
    const res = await makeRequest('127.0.0.1', 3458, '/v1/orchestrate', 'POST', {
      messages: [{ role: 'user', content: '创建一个登录页面，包含用户名密码输入和登录功能' }]
    });
    console.log(`   状态码：${res.statusCode}`);
    if (res.statusCode === 200) {
      if (res.body.orchestrated && res.body.subtasks) {
        console.log(`   ✅ 请求被编排器分解，生成 ${res.body.subtasks.length} 个子任务`);
      } else {
        console.log(`   ⚠️  请求被转发到 CCR Router（可能关键词判断有误）`);
      }
    } else {
      console.log(`   ❌ 请求失败：${JSON.stringify(res.body).substring(0, 100)}...`);
    }
  } catch (e) {
    console.log(`   ❌ 错误：${e.message}`);
  }
  console.log('');

  console.log('📊 测试完成');
}

test().catch(console.error);