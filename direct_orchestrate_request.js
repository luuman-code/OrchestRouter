/**
 * 直接使用orchestrate端点测试
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

async function directOrchestrateRequest() {
  console.log('📤 直接使用orchestrate端点发送请求...');

  try {
    // 读取请求数据
    const requestData = JSON.parse(await fs.readFile('C:\\Users\\LWB\\OrchestRouter\\multi_file_todo_request.json', 'utf8'));

    const postData = JSON.stringify(requestData);

    // 使用普通的 orchestrate 端点
    const options = {
      hostname: 'localhost',
      port: 3458,
      path: '/orchestrate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('📡 发送直接编排请求...');

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

    console.log('📥 收到响应:', response.statusCode);

    // 保存响应
    const outputDir = 'C:\\Users\\LWB\\OrchestRouter\\tests\\test-output\\inprove-test';
    const directResponseFile = path.join(outputDir, 'direct_orchestrate_response.json');

    await fs.writeFile(directResponseFile, response.data);
    console.log('💾 直接编排响应已保存到:', directResponseFile);

    // 解析并处理响应
    let responseData;
    try {
      responseData = JSON.parse(response.data);
    } catch (parseError) {
      console.log('⚠️  响应不是有效的JSON');
      responseData = response.data;
    }

    // 检查响应结构
    if (typeof responseData === 'object') {
      console.log('📋 响应结构分析:');
      console.log('   成功状态:', responseData.success);
      console.log('   总结信息:', responseData.summary);

      // 检查是否有工具调用内容
      if (responseData.content) {
        console.log('   包含内容字段，类型:', Array.isArray(responseData.content) ? `数组(${responseData.content.length}项)` : typeof responseData.content);

        if (Array.isArray(responseData.content)) {
          console.log('   内容详情:');
          for (let i = 0; i < responseData.content.length; i++) {
            const item = responseData.content[i];
            console.log(`     项 ${i + 1}: 类型=${item.type}`);

            if (item.type === 'tool_use') {
              console.log(`       工具名称: ${item.name}`);
              console.log(`       工具ID: ${item.id}`);

              if (item.name === 'write_file' && item.input) {
                console.log(`       文件路径: ${item.input.file_path}`);

                // 保存文件
                const fileName = path.basename(item.input.file_path);
                const filePath = path.join(outputDir, fileName);

                try {
                  await fs.writeFile(filePath, item.input.content);
                  console.log(`       已保存文件:`, filePath);

                  // 显示内容大小和预览
                  const stats = await fs.stat(filePath);
                  console.log(`       文件大小: ${stats.size} bytes`);
                } catch (saveError) {
                  console.log(`       保存文件失败:`, saveError.message);
                }
              }
            }
          }
        }
      } else {
        console.log('   未发现内容字段');
      }
    }

    console.log('✅ 直接编排请求处理完成');

  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

directOrchestrateRequest();