/**
 * 调试完整编排流程
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

async function debugFullFlow() {
  console.log('🔍 调试完整编排流程...');

  try {
    // 读取请求数据
    const requestData = JSON.parse(await fs.readFile('C:\\Users\\LWB\\OrchestRouter\\full_test_request.json', 'utf8'));

    // 1. 首先测试分解端点
    console.log('\n📌 步骤 1: 测试分解端点');
    const decomposeResult = await sendRequest('/v1/decompose', requestData);
    console.log('   分解结果:', JSON.stringify(decomposeResult, null, 2).substring(0, 500) + '...');

    if (decomposeResult.subtasks && decomposeResult.subtasks.length > 0) {
      console.log(`   ✅ 分解器生成了 ${decomposeResult.subtasks.length} 个子任务`);

      for (let i = 0; i < decomposeResult.subtasks.length; i++) {
        const subtask = decomposeResult.subtasks[i];
        console.log(`     子任务 ${i + 1}: ${subtask.type} - ${subtask.integrationHints?.targetFile || subtask.filePath}`);
      }
    } else {
      console.log('   ❌ 分解器未生成任何子任务');
    }

    // 2. 测试编排端点
    console.log('\n📌 步骤 2: 测试编排端点');
    const orchestrateResult = await sendRequest('/v1/orchestrate-tool-calls', requestData);

    if (orchestrateResult.content && Array.isArray(orchestrateResult.content)) {
      console.log(`   收到 ${orchestrateResult.content.length} 个工具调用`);

      for (let i = 0; i < orchestrateResult.content.length; i++) {
        const item = orchestrateResult.content[i];
        if (item.type === 'tool_use' && item.name === 'write_file') {
          console.log(`     文件：${item.input.file_path} (${item.input.content.length} bytes)`);
        }
      }
    }

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  }
}

async function sendRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: 'localhost',
      port: 3458,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

debugFullFlow();