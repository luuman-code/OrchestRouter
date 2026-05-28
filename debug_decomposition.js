/**
 * 调试分解器输出
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

async function debugDecomposition() {
  console.log('🔍 调试分解器输出...');

  try {
    // 读取请求数据
    const requestData = JSON.parse(await fs.readFile('C:\\Users\\LWB\\OrchestRouter\\multi_file_todo_request.json', 'utf8'));

    const postData = JSON.stringify(requestData);

    // 直接发送到分解端点
    const options = {
      hostname: 'localhost',
      port: 3458,
      path: '/v1/decompose',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('📡 发送请求到分解端点...');

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });

    console.log('📥 收到分解响应:', response.statusCode);

    // 保存响应
    const outputDir = 'C:\\Users\\LWB\\OrchestRouter\\tests\\test-output\\inprove-test';
    const decomposeResponseFile = path.join(outputDir, 'decompose_response.json');

    await fs.writeFile(decomposeResponseFile, response.data);
    console.log('💾 分解响应已保存到:', decomposeResponseFile);

    // 解析并分析响应
    let responseData;
    try {
      responseData = JSON.parse(response.data);
    } catch (parseError) {
      console.log('⚠️  响应不是有效的 JSON');
      return;
    }

    // 分析分解结果
    console.log('📋 分解结果分析:');

    if (responseData.subtasks) {
      console.log(`   子任务数量：${responseData.subtasks.length}`);

      for (let i = 0; i < responseData.subtasks.length; i++) {
        const subtask = responseData.subtasks[i];
        console.log(`\n   子任务 ${i + 1}:`);
        console.log(`     ID: ${subtask.id}`);
        console.log(`     类型：${subtask.type}`);
        console.log(`     描述：${subtask.description?.substring(0, 50)}...`);
        console.log(`     文件路径：${subtask.filePath || subtask.integrationHints?.targetFile || 'N/A'}`);

        if (subtask.integrationHints) {
          console.log(`     整合提示:`);
          console.log(`       目标文件：${subtask.integrationHints.targetFile || 'N/A'}`);
          console.log(`       依赖：${subtask.integrationHints.dependsOn?.join(', ') || '无'}`);
          console.log(`       合并策略：${subtask.integrationHints.mergeStrategy || 'N/A'}`);
        }
      }
    } else {
      console.log('   未发现 subtasks 字段');
    }

    console.log('\n✅ 分解器调试完成');

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  }
}

debugDecomposition();