#!/usr/bin/env node

/**
 * 获取并发执行器API调用结果的专用测试
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 创建测试目录
const testOutputDir = 'tests/test-output/completed-full-flow-test';
if (!fs.existsSync(testOutputDir)) {
  fs.mkdirSync(testOutputDir, { recursive: true });
}

const executorResultsDir = path.join(testOutputDir, 'executor-raw-results');
if (!fs.existsSync(executorResultsDir)) {
  fs.mkdirSync(executorResultsDir, { recursive: true });
}

async function makeDetailedRequest() {
  console.log('🔄 开始执行详细API调用测试...');

  const testRequest = {
    task: {
      title: "API调用结果测试",
      requirement: "专门测试并发执行器的API调用结果",
      deliverables: [
        {
          id: "api-call-test",
          description: "测试文件，用于获取API调用结果",
          type: "test",
          filePath: "api-test-result.js"
        }
      ]
    },
    options: {
      enableDecomposition: true,
      enableModelSelection: true,
      enableExecution: true
    }
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(testRequest);

    const req = http.request({
      hostname: 'localhost',
      port: 3458,
      path: '/v1/orchestrate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', async () => {
        try {
          const response = JSON.parse(body);

          console.log(`✅ 响应状态: ${res.statusCode}`);
          console.log(`✅ 成功生成 ${response.files?.length || 0} 个文件`);

          // 提取并保存API调用结果
          const apiCallResults = extractAPICallResults(response);

          // 保存详细结果
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const apiResultsFile = path.join(executorResultsDir, `executor-api-results-${timestamp}.json`);

          fs.writeFileSync(apiResultsFile, JSON.stringify({
            timestamp: new Date().toISOString(),
            status_code: res.statusCode,
            headers: res.headers,
            api_call_results: apiCallResults,
            full_response: response
          }, null, 2));

          console.log(`✅ API调用结果已保存至: ${apiResultsFile}`);

          // 也保存原始响应
          const rawResponseFile = path.join(executorResultsDir, `raw-response-${timestamp}.json`);
          fs.writeFileSync(rawResponseFile, JSON.stringify({
            timestamp: new Date().toISOString(),
            status_code: res.statusCode,
            headers: res.headers,
            response_body: response
          }, null, 2));

          console.log(`✅ 原始响应已保存至: ${rawResponseFile}`);

          resolve(response);
        } catch (e) {
          console.error('❌ 解析响应失败:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ 请求失败:', e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

function extractAPICallResults(response) {
  // 从响应中提取API调用相关的数据
  const results = {
    execution_logs: [],
    model_usage: {},
    api_calls: []
  };

  // 从响应中的日志提取信息
  if (response.logs && Array.isArray(response.logs)) {
    response.logs.forEach(log => {
      if (log.message && (log.message.toLowerCase().includes('api') ||
                         log.message.toLowerCase().includes('request') ||
                         log.message.toLowerCase().includes('model'))) {
        results.execution_logs.push(log);
      }
    });
  }

  // 统计模型使用情况
  if (response.files && Array.isArray(response.files)) {
    response.files.forEach(file => {
      const modelUsed = extractModelInfoFromFilePath(file.path);
      if (modelUsed) {
        results.model_usage[modelUsed] = (results.model_usage[modelUsed] || 0) + 1;
      }
    });
  }

  return results;
}

function extractModelInfoFromFilePath(filePath) {
  // 从文件路径中提取可能的模型信息
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes('gpt') || lowerPath.includes('openai')) return 'openai';
  if (lowerPath.includes('claude') || lowerPath.includes('anthropic')) return 'anthropic';
  if (lowerPath.includes('deepseek')) return 'deepseek';
  if (lowerPath.includes('qwen')) return 'qwen';
  return 'unknown';
}

async function runTest() {
  try {
    console.log('🚀 启动并发执行器API调用结果测试');
    console.log('📋 测试目标: 捕获执行器真实API调用结果并保存到文件');

    await makeDetailedRequest();

    console.log('');
    console.log('🎉 测试完成！');
    console.log('📁 所有API调用结果已保存至: tests/test-output/completed-full-flow-test/executor-raw-results/');

  } catch (error) {
    console.error('💥 测试失败:', error);
  }
}

// 如果此脚本被直接运行
if (require.main === module) {
  runTest();
}

module.exports = { makeDetailedRequest, extractAPICallResults };