#!/usr/bin/env node

/**
 * 分析编排器实际执行过程，查看API调用结果
 */

const http = require('http');

const ORCHESTRATOR_URL = 'http://localhost:3458';

async function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = `${ORCHESTRATOR_URL}${path}`;
    const parsedUrl = new URL(url);

    const options = {
      method: method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testDirectExecutor() {
  console.log('🔍 直接测试执行器API调用');
  console.log('=========================');

  // 直接测试执行器端点
  const subtasks = {
    subtasks: [
      {
        id: "test-task-1",
        prompt: "Create a simple hello world function in JavaScript",
        model: "MiniMax-M2.5"
      }
    ]
  };

  try {
    const response = await makeRequest('POST', '/v1/execute-subtasks', subtasks);
    console.log('执行器API响应状态:', response.status);
    console.log('执行器API响应内容:');
    console.log(JSON.stringify(response.data, null, 2));

    // 检查响应中是否包含实际的API调用结果
    if (response.data.execution_results) {
      console.log('\n执行结果详情:');
      response.data.execution_results.forEach((result, index) => {
        console.log(`${index + 1}. 任务ID: ${result.task_id}`);
        console.log(`   成功: ${result.success}`);
        console.log(`   错误: ${result.error || 'None'}`);
        console.log(`   模型: ${result.model_used}`);
        console.log(`   执行顺序: ${result.execution_order}`);
      });
    } else {
      console.log('响应中没有找到执行结果');
    }
  } catch (error) {
    console.log('执行器API调用失败:', error.message);
  }
}

async function analyzeExistingTest() {
  console.log('\n🔍 分析现有测试的实际结果');
  console.log('===========================');

  console.log('根据之前测试的输出，我们有以下发现:');
  console.log('');
  console.log('1. 大多数文件大小为0字节，这意味着执行器调用API后没有返回有用的代码内容');
  console.log('2. 只有少数几个文件有实际内容 (如test/api.js, src/api/transactions.js等)');
  console.log('3. 这表明执行器API调用可能失败或返回了空结果');
  console.log('');
  console.log('实际API调用结果应包含:');
  console.log('- 生成的代码内容');
  console.log('- token使用量统计');
  console.log('- 模型响应时间');
  console.log('- 实际执行的代码');
  console.log('');
  console.log('但我们在最终输出中看到的大多是空文件或格式不正确的结果');
}

async function runRealisticAnalysis() {
  console.log('🎯 现实情况分析');
  console.log('================');

  await testDirectExecutor();
  await analyzeExistingTest();

  console.log('\n❌ 结论: 执行器API调用并没有成功返回预期结果');
  console.log('   - 大多数生成的文件为空');
  console.log('   - 没有看到真正的API调用结果被整合');
  console.log('   - 整合器只是处理了空内容或失败的结果');
  console.log('   - 这表明执行器调用模型API时可能遇到了问题');
}

runRealisticAnalysis().catch(console.error);