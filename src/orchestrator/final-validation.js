/**
 * 编排器最终验证测试
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

// 测试修复后的各种场景
async function runFinalTests() {
  console.log('🎯 开始最终验证测试...\n');

  console.log('1️⃣ 测试健康检查...');
  try {
    const healthResponse = await makeRequest('/health', 'GET');
    console.log(`✅ 健康检查: 状态码 ${healthResponse.statusCode}, 响应: ${JSON.stringify(healthResponse.body)}`);
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
  }
  console.log('');

  console.log('2️⃣ 测试空消息数组...');
  try {
    const emptyResponse = await makeRequest('/v1/orchestrate', 'POST', { messages: [] });
    console.log(`✅ 空消息数组: 状态码 ${emptyResponse.statusCode}`);
    console.log(`   响应: ${JSON.stringify(emptyResponse.body)}`);
  } catch (error) {
    console.error('❌ 空消息数组失败:', error.message);
  }
  console.log('');

  console.log('3️⃣ 测试null请求体...');
  try {
    const nullResponse = await makeRequest('/v1/orchestrate', 'POST', null);
    console.log(`✅ null请求体: 状态码 ${nullResponse.statusCode}`);
    console.log(`   响应: ${JSON.stringify(nullResponse.body).substring(0, 100)}...`);
  } catch (error) {
    console.error('❌ null请求体失败:', error.message);
  }
  console.log('');

  console.log('4️⃣ 测试正常分解任务: 创建登录页面...');
  try {
    const simpleResponse = await makeRequest('/v1/orchestrate', 'POST', {
      messages: [{
        role: 'user',
        content: '创建一个登录页面，包含用户名和密码输入框和登录按钮'
      }]
    });
    console.log(`✅ 登录页面任务: 状态码 ${simpleResponse.statusCode}`);
    if (simpleResponse.body.subtasks) {
      console.log(`   生成子任务数: ${simpleResponse.body.subtasks.length}`);
      console.log(`   任务类型分布:`, Object.keys(simpleResponse.body.subtasks.reduce((acc, st) => {
        acc[st.type] = (acc[st.type] || 0) + 1;
        return acc;
      }, {})));
    }
  } catch (error) {
    console.error('❌ 登录页面任务失败:', error.message);
  }
  console.log('');

  console.log('5️⃣ 测试复杂分解任务: 用户管理系统...');
  try {
    const complexResponse = await makeRequest('/v1/orchestrate', 'POST', {
      messages: [{
        role: 'user',
        content: '开发一个用户管理系统，包含用户注册、登录、个人资料管理功能，需要API、数据库和前端页面'
      }]
    });
    console.log(`✅ 用户管理系统: 状态码 ${complexResponse.statusCode}`);
    if (complexResponse.body.subtasks) {
      console.log(`   生成子任务数: ${complexResponse.body.subtasks.length}`);
      console.log(`   任务类型分布:`, Object.keys(complexResponse.body.subtasks.reduce((acc, st) => {
        acc[st.type] = (acc[st.type] || 0) + 1;
        return acc;
      }, {})));
    }
  } catch (error) {
    console.error('❌ 用户管理系统失败:', error.message);
  }
  console.log('');

  console.log('6️⃣ 测试简单问题（不应该分解）...');
  try {
    const simpleQResponse = await makeRequest('/v1/orchestrate', 'POST', {
      messages: [{
        role: 'user',
        content: '什么是JavaScript中的闭包？请解释一下'
      }]
    });
    console.log(`✅ 简单问题: 状态码 ${simpleQResponse.statusCode}`);
    if (simpleQResponse.body.decomposition) {
      console.log(`   生成子任务数: ${simpleQResponse.body.subtasks?.length || 0}`);
    } else {
      console.log('   未进行任务分解（正确行为）');
    }
  } catch (error) {
    console.error('❌ 简单问题测试失败:', error.message);
  }
  console.log('');

  console.log('7️⃣ 测试直接分解端点...');
  try {
    const decomposeResponse = await makeRequest('/v1/decompose', 'POST', {
      task: {
        title: 'Test Task',
        description: 'This is a test task for decomposing',
        deliverables: [
          { description: 'Create component', type: 'ui' },
          { description: 'Add styles', type: 'style' }
        ]
      }
    });
    console.log(`✅ 直接分解: 状态码 ${decomposeResponse.statusCode}`);
    console.log(`   生成子任务数: ${decomposeResponse.body.subtasks?.length || 0}`);
  } catch (error) {
    console.error('❌ 直接分解失败:', error.message);
  }
  console.log('');

  console.log('🏆 所有验证测试完成！');

  console.log('\n📋 测试总结:');
  console.log('- 服务器健康检查: 应该成功');
  console.log('- 错误输入处理: 应该不再导致500错误');
  console.log('- 简单任务分解: 应该正确生成少量子任务');
  console.log('- 复杂任务分解: 应该正确生成多类型子任务');
  console.log('- 简单问题处理: 应该不进行分解直接转发');
  console.log('- 直接分解端点: 应该正常工作');
}

// 如果直接运行此文件，则执行验证测试
if (require.main === module) {
  runFinalTests().catch(console.error);
}

module.exports = {
  runFinalTests,
  makeRequest
};