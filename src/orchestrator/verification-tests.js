/**
 * 编排器修复验证测试
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3458';

// 辅助函数：发送HTTP请求
function makeRequest(endpoint, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SERVER_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
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

// 测试修复后的空内容请求
async function testEmptyRequest() {
  console.log('🔧 测试修复后的空内容请求...');

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', { messages: [] });
    console.log(`✅ 状态码: ${response.statusCode}`);
    console.log(`✅ 响应:`, response.body);
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 空内容请求仍然失败:', error.message);
    return null;
  }
}

// 测试修复后的无效内容请求
async function testInvalidRequest() {
  console.log('🔧 测试修复后的无效内容请求...');

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', null);
    console.log(`✅ 状态码: ${response.statusCode}`);
    console.log(`✅ 响应:`, response.body);
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 无效内容请求失败:', error.message);
    return null;
  }
}

// 测试正常复杂请求
async function testNormalRequest() {
  console.log('🔧 测试正常复杂请求...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '开发一个待办事项应用，包含添加任务、删除任务、标记完成、过滤任务等功能'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log(`✅ 状态码: ${response.statusCode}`);
    console.log(`✅ 生成子任务数: ${response.body.subtasks?.length || 0}`);
    if (response.body.subtasks && response.body.subtasks.length > 0) {
      console.log('子任务示例:');
      response.body.subtasks.slice(0, 3).forEach((st, idx) => {
        console.log(`  ${idx + 1}. [${st.type}] ${st.description.substring(0, 80)}...`);
      });
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 正常复杂请求失败:', error.message);
    return null;
  }
}

// 综合验证测试
async function runVerificationTests() {
  console.log('🧪 开始验证修复后的编排器...\n');

  await testEmptyRequest();
  await testInvalidRequest();
  await testNormalRequest();

  console.log('✅ 修复验证测试完成！');
}

// 如果直接运行此文件，则执行验证测试
if (require.main === module) {
  runVerificationTests().catch(console.error);
}

module.exports = {
  runVerificationTests,
  testEmptyRequest,
  testInvalidRequest,
  testNormalRequest,
  makeRequest
};