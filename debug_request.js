/**
 * 调试编排器请求以获取完整的工具调用结果
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

async function debugRequest() {
  console.log('🔍 调试编排器请求 - 获取完整响应...');

  try {
    // 读取请求数据
    const requestData = JSON.parse(await fs.readFile('C:\\Users\\LWB\\OrchestRouter\\tests\\test-output\\inprove-test\\todo_app_request.json', 'utf8'));

    const postData = JSON.stringify(requestData);

    const options = {
      hostname: 'localhost',
      port: 3458,
      path: '/v1/orchestrate-tool-calls',  // 尝试使用工具调用格式端点
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('📡 发送请求到工具调用端点...');

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

    console.log('📥 收到工具调用响应:', response.statusCode);

    // 保存完整响应
    const outputDir = 'C:\\Users\\LWB\\OrchestRouter\\tests\\test-output\\inprove-test';
    const debugResponseFile = path.join(outputDir, 'debug_response.json');

    await fs.writeFile(debugResponseFile, response.data);
    console.log('💾 完整调试响应已保存到:', debugResponseFile);

    // 解析响应
    let responseData;
    try {
      responseData = JSON.parse(response.data);
    } catch (parseError) {
      console.log('⚠️  响应不是有效的JSON');
      responseData = response.data;
    }

    if (typeof responseData === 'object') {
      console.log('📋 响应摘要:');
      console.log('   成功:', responseData.success);
      console.log('   总结:', responseData.summary);

      // 检查是否包含内容
      if (responseData.content) {
        console.log('   内容类型:', Array.isArray(responseData.content) ? `数组(${responseData.content.length}项)` : typeof responseData.content);

        // 如果是数组，检查其中的工具调用
        if (Array.isArray(responseData.content)) {
          for (let i = 0; i < responseData.content.length; i++) {
            const item = responseData.content[i];
            if (item.type === 'tool_use') {
              console.log(`   工具调用 ${i + 1}:`, item.name);

              if (item.name === 'write_file' && item.input) {
                console.log(`     文件路径:`, item.input.file_path);

                // 尝试保存文件内容
                const fileName = path.basename(item.input.file_path);
                const filePath = path.join(outputDir, fileName);

                try {
                  await fs.writeFile(filePath, item.input.content);
                  console.log(`     文件已保存到:`, filePath);
                } catch (saveError) {
                  console.log(`     保存文件失败:`, saveError.message);
                }
              }
            }
          }
        }
      }
    }

    console.log('✅ 调试请求完成');

  } catch (error) {
    console.error('❌ 调试请求失败:', error.message);
  }
}

debugRequest();