/**
 * 编排器详细测试和分析脚本
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

// 修复直接分解测试 - 使用正确的任务格式
async function runFixedDecompositionTest() {
  console.log('🔧 修复后的直接分解测试...');

  // 使用正确的任务格式
  const taskInput = {
    title: 'Chat Room Feature',
    description: 'Implement a chat room feature with user authentication, message sending/receiving, and room management capabilities.',
    deliverables: [
      { description: 'User authentication system', type: 'api' },
      { description: 'Message sending/receiving functionality', type: 'api' },
      { description: 'Room management system', type: 'api' },
      { description: 'Frontend chat interface', type: 'ui' },
      { description: 'User presence indicators', type: 'logic' }
    ]
  };

  const requestBody = {
    task: taskInput
  };

  try {
    const response = await makeRequest('/v1/decompose', 'POST', requestBody);
    console.log('✅ 修复后的直接分解测试完成');
    console.log(`状态码: ${response.statusCode}`);
    if (response.body.subtasks) {
      console.log(`生成子任务数: ${response.body.subtasks.length}`);
      console.log(`处理时间: ${response.body.metadata?.processingTime}ms`);

      // 输出部分子任务示例
      if (response.body.subtasks.length > 0) {
        console.log('前3个子任务示例:');
        response.body.subtasks.slice(0, 3).forEach((st, idx) => {
          console.log(`  ${idx + 1}. [${st.type}] ${st.description.substring(0, 60)}...`);
        });
      }
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 修复后的直接分解测试失败:', error.message);
    return null;
  }
}

// 更复杂的任务测试
async function runComplexDecompositionTest() {
  console.log('🔍 复杂任务分解测试...');

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: '创建一个博客系统，需要包含用户注册登录、文章发布编辑、评论系统、标签分类、搜索功能、响应式设计、数据统计分析等特性'
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log('✅ 复杂任务分解测试完成');
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

        // 分析子任务
        console.log(`\n子任务详情:`);
        response.body.subtasks.forEach((st, idx) => {
          console.log(`  ${idx + 1}. [${st.type}] ${st.description.substring(0, 100)}...`);
          if (st.integrationHints) {
            console.log(`     整合提示: 文件=${st.integrationHints.targetFile || 'N/A'}, 区域=${st.integrationHints.region || 'N/A'}`);
          }
        });
      }
      if (response.body.metadata?.groupingInfo) {
        console.log(`\n语义分组信息:`);
        console.log(`  分组数: ${response.body.metadata.groupingInfo.groupsCount}`);
        console.log(`  原始交付物数: ${response.body.metadata.groupingInfo.originalDeliverablesCount}`);
      }
      if (response.body.metadata?.integrationMetadata) {
        console.log(`\n整合元数据:`);
        console.log(`  文件映射: ${Object.keys(response.body.metadata.integrationMetadata.fileMappings || {}).length}`);
        console.log(`  合并组: ${Object.keys(response.body.metadata.integrationMetadata.mergeGroups || {}).length}`);
        console.log(`  依赖图: ${response.body.metadata.integrationMetadata.dependencyGraph?.length || 0}`);
      }
    }
    console.log('');
    return response;
  } catch (error) {
    console.error('❌ 复杂任务分解测试失败:', error.message);
    return null;
  }
}

// 问题识别测试：尝试识别可能存在的问题
async function runProblemIdentificationTest() {
  console.log('🔍 问题识别测试...');

  console.log('测试1: 空内容请求');
  try {
    const response1 = await makeRequest('/v1/orchestrate', 'POST', { messages: [] });
    console.log(`空内容请求状态: ${response1.statusCode}`);
  } catch (error) {
    console.error('空内容请求失败:', error.message);
  }

  console.log('\n测试2: 长内容请求');
  try {
    const longContent = '创建一个非常复杂的系统，包含用户管理、角色权限、数据模型、API接口、前端页面、数据库设计、安全认证、日志记录、缓存机制、消息队列、文件上传下载、定时任务、邮件服务、短信服务、第三方集成、单元测试、集成测试、性能优化、监控报警、数据备份恢复、负载均衡、集群部署、容器化、微服务架构、API网关、服务发现、配置中心、链路追踪、分布式事务、消息中间件、搜索引擎、大数据处理、人工智能功能等等等等，这是一个非常长的需求描述，用于测试系统对长文本的处理能力。';
    const requestBody = {
      messages: [{ role: 'user', content: longContent }]
    };

    const response2 = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log(`长内容请求状态: ${response2.statusCode}`);
    console.log(`生成子任务数: ${response2.body.subtasks?.length || 0}`);
  } catch (error) {
    console.error('长内容请求失败:', error.message);
  }

  console.log('\n测试3: 冲突路径检测');
  try {
    const conflictContent = '实现登录功能，包括登录页面src/pages/Login.jsx，登录样式src/pages/Login.jsx，登录逻辑src/pages/Login.jsx，还有API调用src/api/auth.js';
    const requestBody = {
      messages: [{ role: 'user', content: conflictContent }]
    };

    const response3 = await makeRequest('/v1/orchestrate', 'POST', requestBody);
    console.log(`冲突路径请求状态: ${response3.statusCode}`);
    console.log(`生成子任务数: ${response3.body.subtasks?.length || 0}`);
    if (response3.body.metadata?.integrationMetadata?.fileMappings) {
      console.log(`检测到文件映射:`, Object.keys(response3.body.metadata.integrationMetadata.fileMappings));
    }
  } catch (error) {
    console.error('冲突路径请求失败:', error.message);
  }

  console.log('');
}

// 综合分析函数
async function runAnalysis() {
  console.log('🔬 编排器综合分析测试\n');

  // 修复后的分解测试
  await runFixedDecompositionTest();

  // 复杂任务测试
  await runComplexDecompositionTest();

  // 问题识别测试
  await runProblemIdentificationTest();

  console.log('✅ 分析测试完成！');
}

// 如果直接运行此文件，则执行所有测试
if (require.main === module) {
  runAnalysis().catch(console.error);
}

module.exports = {
  runAnalysis,
  runFixedDecompositionTest,
  runComplexDecompositionTest,
  runProblemIdentificationTest,
  makeRequest
};