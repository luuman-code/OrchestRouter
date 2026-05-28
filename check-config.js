#!/usr/bin/env node

/**
 * 检查编排器的实际配置和行为
 */

const http = require('http');

const ORCHESTRATOR_URL = 'http://127.0.0.1:3458';

async function checkOrchestratorConfig() {
  console.log('🔍 检查编排器实际配置...');

  // 检查服务器状态
  try {
    const statusResponse = await makeRequest('GET', '/v1/status');
    console.log('📊 服务器状态响应:', JSON.stringify(statusResponse.data, null, 2));
  } catch (error) {
    console.log('❌ 无法获取服务器状态:', error.message);

    // 尝试健康检查端点
    try {
      const healthResponse = await makeRequest('GET', '/health');
      console.log('🏥 健康检查响应:', JSON.stringify(healthResponse.data, null, 2));
    } catch (healthError) {
      console.log('❌ 健康检查也失败:', healthError.message);
      return;
    }
  }

  // 检查可用端点
  console.log('\n🔍 检查可用端点...');
  try {
    const optionsResponse = await makeRequest('OPTIONS', '/');
    console.log('🌐 OPTIONS 响应:', JSON.stringify(optionsResponse.data, null, 2));
  } catch (error) {
    console.log('❌ OPTIONS 请求失败:', error.message);
  }

  // 尝试获取配置信息
  console.log('\n🔧 尝试获取配置信息...');
  try {
    const configResponse = await makeRequest('GET', '/v1/config');
    console.log('⚙️  配置响应:', JSON.stringify(configResponse.data, null, 2));
  } catch (error) {
    console.log('❌ 无法获取配置:', error.message);
  }

  // 尝试获取编排器信息
  console.log('\n📋 尝试获取编排器信息...');
  try {
    const infoResponse = await makeRequest('GET', '/v1/info');
    console.log('ℹ️  信息响应:', JSON.stringify(infoResponse.data, null, 2));
  } catch (error) {
    console.log('❌ 无法获取信息:', error.message);
  }

  console.log('\n🎯 关键测试：发送编排请求并分析响应...');

  const testTask = {
    task: {
      title: "Test Complexity Analysis",
      requirement: "This is a test task to verify complexity analysis works properly. We need to create multiple deliverables including UI components, API endpoints, data models, and configuration files.",
      deliverables: [
        { id: "test-ui", description: "Test UI Component", type: "ui", filePath: "test/ui.jsx" },
        { id: "test-api", description: "Test API Endpoint", type: "api", filePath: "test/api.js" },
        { id: "test-model", description: "Test Data Model", type: "model", filePath: "test/model.js" }
      ]
    }
  };

  try {
    const orchResponse = await makeRequest('POST', '/v1/orchestrate', testTask);
    console.log('🔄 编排端点响应:');
    console.log('   状态码:', orchResponse.status);
    console.log('   响应数据预览:', JSON.stringify(orchResponse.data, null, 2).substring(0, 300) + '...');

    // 分析响应特征
    const hasOrchestrated = orchResponse.data.orchestrated !== undefined;
    const hasSubtasks = Array.isArray(orchResponse.data.subtasks);
    const hasClaudeContent = !!orchResponse.data.content && !!orchResponse.data.model;
    const hasStandardFields = orchResponse.data.id && orchResponse.data.type && orchResponse.data.role;
    const hasSessionId = !!orchResponse.data.session_id;

    console.log('\n🔍 响应特征分析:');
    console.log('   - orchestrated 字段:', hasOrchestrated ? '✅ 有' : '❌ 无');
    console.log('   - subtasks 字段:', hasSubtasks ? '✅ 有' : '❌ 无');
    console.log('   - Claude API 字段:', hasClaudeContent ? '✅ 有' : '❌ 无');
    console.log('   - 标准 Anthropic 格式:', hasStandardFields ? '✅ 是' : '❌ 否');
    console.log('   - session_id 字段:', hasSessionId ? '✅ 有' : '❌ 无');

    if (hasClaudeContent || hasStandardFields) {
      console.log('   📌 结论: 请求被转发到 CCR Router');
    } else if (hasOrchestrated || hasSessionId || hasSubtasks) {
      console.log('   📌 结论: 编排流程已执行');
    } else {
      console.log('   📌 结论: 响应格式未知');
    }
  } catch (error) {
    console.log('❌ 编排请求失败:', error.message);
  }
}

// 发起 HTTP 请求的辅助函数
function makeRequest(method, path, data = null) {
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
      res.on('data', chunk => { body += chunk; });
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
            data: body // 如果不是JSON，返回原始内容
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

// 运行检查
checkOrchestratorConfig().catch(console.error);