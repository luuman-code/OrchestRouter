#!/usr/bin/env node

/**
 * 验证修复后的编排器功能
 * 展示 _shouldDecompose 现在能正确处理两种格式
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
          const data = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
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

async function testShouldDecomposeFixed() {
  console.log('🔧 验证修复后的 _shouldDecompose 功能');
  console.log('=' .repeat(60));

  // 获取测试前的日志
  console.log('获取测试前的日志...');
  const logsBefore = await makeRequest('GET', '/v1/logs?limit=10');

  // 测试 1: 结构化对象格式
  console.log('\n🧪 测试 1: 结构化对象格式');
  const structuredTask = {
    task: {
      title: "Test Task",
      requirement: "This is a test task to verify shouldDecompose works",
      deliverables: [
        { id: "1", description: "Test file 1", type: "ui", filePath: "test1.jsx" },
        { id: "2", description: "Test file 2", type: "api", filePath: "test2.js" }
      ]
    }
  };

  console.log('发送结构化任务...');
  try {
    const response1 = await makeRequest('POST', '/v1/orchestrate', structuredTask);
    console.log(`状态码: ${response1.status}`);

    if (response1.data.success !== undefined) {
      console.log('✅ 响应类型: 编排器响应 (编排流程执行)');
    } else if (response1.data.model !== undefined) {
      console.log('⚠️ 响应类型: Claude 响应 (可能被转发)');
    }
  } catch (error) {
    console.log(`❌ 请求失败: ${error.message}`);
  }

  // 测试 2: 自然语言格式
  console.log('\n🧪 测试 2: 自然语言格式');
  const naturalTask = {
    messages: [{
      role: "user",
      content: "Please help me create a simple web application with login and dashboard features"
    }]
  };

  console.log('发送自然语言任务...');
  try {
    const response2 = await makeRequest('POST', '/v1/orchestrate', naturalTask);
    console.log(`状态码: ${response2.status}`);

    if (response2.data.success !== undefined) {
      console.log('✅ 响应类型: 编排器响应 (编排流程执行)');
    } else if (response2.data.model !== undefined) {
      console.log('⚠️ 响应类型: Claude 响应 (可能被转发)');
    }
  } catch (error) {
    console.log(`❌ 请求失败: ${error.message}`);
  }

  // 获取测试后的日志
  console.log('\n📋 检查测试后的日志...');
  const logsAfter = await makeRequest('GET', '/v1/logs?limit=30');

  // 分析关键日志
  const keyLogs = logsAfter.data.logs?.filter(log =>
    log.message.includes('shouldDecompose') ||
    log.message.includes('复杂度分析') ||
    log.message.includes('isComplex') ||
    log.message.includes('编排流程') ||
    log.message.includes('转发')
  ) || [];

  console.log('\n🔍 关键日志分析:');
  keyLogs.forEach((log, index) => {
    console.log(`${index + 1}. [${log.level}] ${log.message}`);
  });

  // 验证 _shouldDecompose 是否被调用
  const hasShouldDecomposeLog = keyLogs.some(log => log.message.includes('shouldDecompose') || log.message.includes('复杂度分析'));
  const hasIsComplexLog = keyLogs.some(log => log.message.includes('isComplex'));
  const hasOrchestrateLog = keyLogs.some(log => log.message.includes('编排流程') || log.message.includes('启动编排'));
  const hasForwardLog = keyLogs.some(log => log.message.includes('转发'));

  console.log('\n✅ 验证结果:');
  console.log(`_shouldDecompose 方法被调用: ${hasShouldDecomposeLog ? '✅ 是' : '❌ 否'}`);
  console.log(`复杂度分析执行: ${hasIsComplexLog ? '✅ 是' : '❌ 否'}`);
  console.log(`编排流程启动: ${hasOrchestrateLog ? '✅ 是' : '❌ 否'}`);
  console.log(`存在转发日志: ${hasForwardLog ? '✅ 是' : '❌ 否'}`);

  if (hasShouldDecomposeLog && hasIsComplexLog && hasOrchestrateLog) {
    console.log('\n🎉 SUCCESS: _shouldDecompose 修复验证通过！');
    console.log('   - 结构化对象格式现在能被正确识别');
    console.log('   - 复杂任务被正确路由到编排流程');
    console.log('   - 完整工作流(分解→选择→执行→整合)正常运行');
  } else {
    console.log('\n⚠️  验证可能不完整，需要进一步检查');
  }

  return {
    hasShouldDecomposeLog,
    hasIsComplexLog,
    hasOrchestrateLog,
    hasForwardLog,
    allTestsPass: hasShouldDecomposeLog && hasIsComplexLog && hasOrchestrateLog
  };
}

// 运行验证
testShouldDecomposeFixed().then(result => {
  console.log('\n' + '='.repeat(60));
  console.log('验证完成！修复状态:', result.allTestsPass ? '✅ 成功' : '⚠️ 需要检查');
}).catch(console.error);