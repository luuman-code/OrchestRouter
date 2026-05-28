/**
 * CCR Router 转发功能 - 最终测试
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
      timeout: 30000  // 30 秒超时
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

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout after 30s'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log('🔄 CCR Router 转发功能 - 最终验证测试\n');

  // 测试用例列表
  const tests = [
    { name: '简单问候', input: '你好', expectForward: true },
    { name: '翻译请求', input: '翻译：Hello', expectForward: true },
    { name: '解释概念', input: '请解释什么是人工智能', expectForward: true },
    { name: '是什么问题', input: 'JavaScript 是什么', expectForward: true },
    { name: '怎么用', input: '怎么使用 Python', expectForward: true },
    { name: '创建页面', input: '创建一个登录页面', expectForward: false },
    { name: '开发系统', input: '开发一个用户管理系统', expectForward: false },
    { name: '实现功能', input: '实现一个购物车功能', expectForward: false }
  ];

  for (const test of tests) {
    console.log(`📝 测试：${test.name} - "${test.input}"`);
    console.log(`   预期：${test.expectForward ? '转发到 CCR Router' : '被编排器分解'}`);

    try {
      const res = await makeRequest('127.0.0.1', 3458, '/v1/orchestrate', 'POST', {
        messages: [{ role: 'user', content: test.input }]
      });

      console.log(`   状态码：${res.statusCode}`);

      if (res.statusCode === 200) {
        if (res.body.orchestrated && res.body.subtasks) {
          console.log(`   结果：被编排器分解，生成 ${res.body.subtasks.length} 个子任务`);
          if (test.expectForward) {
            console.log(`   ⚠️  预期转发但被分解了`);
          } else {
            console.log(`   ✅ 正确`);
          }
        } else {
          console.log(`   结果：被转发到 CCR Router`);
          if (!test.expectForward) {
            console.log(`   ⚠️  预期分解但被转发了`);
          } else {
            console.log(`   ✅ 正确`);
          }
        }
      } else {
        console.log(`   ❌ 请求失败：${JSON.stringify(res.body).substring(0, 100)}...`);
      }
    } catch (e) {
      console.log(`   ❌ 错误：${e.message}`);
    }
    console.log('');
  }

  console.log('📊 测试完成');
}

test().catch(console.error);