/**
 * 编排器测试脚本 - 测试不同难度级别
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

// 测试函数
async function runEasyTest() {
  console.log('🧪 开始简单测试...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '创建一个简单的登录页面，包含用户名和密码输入框以及登录按钮'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log('✅ 简单测试完成');
    console.log(`状态码: ${response.statusCode}`);
    if (response.body.decomposition) {
      console.log(`生成子任务数: ${response.body.subtasks?.length || 0}`);
      if (response.body.subtasks) {
        console.log('子任务类型分布:');
        const typeCounts = {};
        response.body.subtasks.forEach(st => {
          typeCounts[st.type] = (typeCounts[st.type] || 0) + 1;
        });
        console.log(typeCounts);
      }
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 简单测试失败:', error.message);
    return null;
  }
}

async function runMediumTest() {
  console.log('🧪 开始中等难度测试...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '开发一个用户管理系统，包含用户注册、登录、个人信息编辑功能，需要创建数据库表、API接口和前端页面'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log('✅ 中等难度测试完成');
    console.log(`状态码: ${response.statusCode}`);
    if (response.body.decomposition) {
      console.log(`生成子任务数: ${response.body.subtasks?.length || 0}`);
      if (response.body.subtasks) {
        console.log('子任务类型分布:');
        const typeCounts = {};
        response.body.subtasks.forEach(st => {
          typeCounts[st.type] = (typeCounts[st.type] || 0) + 1;
        });
        console.log(typeCounts);
      }
      if (response.body.metadata?.groupingInfo) {
        console.log(`语义分组数: ${response.body.metadata.groupingInfo.groupsCount}`);
      }
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 中等难度测试失败:', error.message);
    return null;
  }
}

async function runHardTest() {
  console.log('🧪 开始高难度测试...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '构建一个完整的电商平台，包含用户管理、商品管理、订单管理、支付集成、库存管理等功能模块，需要数据库设计、后端API、管理后台和前端商城页面'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log('✅ 高难度测试完成');
    console.log(`状态码: ${response.statusCode}`);
    if (response.body.decomposition) {
      console.log(`生成子任务数: ${response.body.subtasks?.length || 0}`);
      if (response.body.subtasks) {
        console.log('子任务类型分布:');
        const typeCounts = {};
        response.body.subtasks.forEach(st => {
          typeCounts[st.type] = (typeCounts[st.type] || 0) + 1;
        });
        console.log(typeCounts);
      }
      if (response.body.metadata?.groupingInfo) {
        console.log(`语义分组数: ${response.body.metadata.groupingInfo.groupsCount}`);
      }
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 高难度测试失败:', error.message);
    return null;
  }
}

// 直接分解测试
async function runDecompositionTest() {
  console.log('🔧 直接分解测试...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '实现一个聊天室功能，包含用户认证、消息发送接收、房间管理等特性'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/decompose', 'POST', requestBody);
    console.log('✅ 直接分解测试完成');
    console.log(`状态码: ${response.statusCode}`);
    if (response.body.subtasks) {
      console.log(`生成子任务数: ${response.body.subtasks.length}`);
      console.log(`处理时间: ${response.body.metadata?.processingTime}ms`);
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 直接分解测试失败:', error.message);
    return null;
  }
}

// 服务器健康检查
async function healthCheck() {
  console.log('🏥 健康检查...');

  try {
    const response = await makeRequest('/health', 'GET');
    console.log('✅ 健康检查完成');
    console.log(`状态码: ${response.statusCode}`);
    console.log(`响应:`, response.body);
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 开始编排器全面测试...\n');

  // 运行健康检查
  await healthCheck();

  // 运行分解测试
  await runDecompositionTest();

  // 运行难度递增的测试
  await runEasyTest();
  await runMediumTest();
  await runHardTest();

  console.log('🎉 所有测试完成！');
}

// 如果直接运行此文件，则执行所有测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  runEasyTest,
  runMediumTest,
  runHardTest,
  healthCheck,
  makeRequest
};