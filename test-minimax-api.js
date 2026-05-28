/**
 * 测试 MiniMax API (使用 MiniMaxLLMClient)
 */

// 加载 .env
const fs = require('fs');
let envContent = fs.readFileSync('.env', 'utf-8');
if (envContent.charCodeAt(0) === 0xFEFF) {
  envContent = envContent.substring(1);
}
envContent = envContent.replace(/\r/g, '');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

const MiniMaxLLMClient = require('./src/orchestrator/MiniMaxLLMClient');

console.log('=== 测试 MiniMax API ===\n');

console.log('配置:');
console.log('  MINIMAX_API_KEY:', process.env.MINIMAX_API_KEY ? process.env.MINIMAX_API_KEY.substring(0, 15) + '...' : 'undefined');
console.log('');

const client = new MiniMaxLLMClient({
  model: 'MiniMax-M2.7',
  apiKey: process.env.MINIMAX_API_KEY
});

console.log('客户端配置:');
console.log('  baseUrl:', client.baseUrl);
console.log('  model:', client.model);
console.log('  apiKey:', client.apiKey ? client.apiKey.substring(0, 15) + '...' : 'undefined');
console.log('');

async function test() {
  try {
    console.log('发送请求...\n');

    const response = await client.createMessage([
      { role: 'user', content: '请用 write_file 工具生成一个简单的 hello.ts 文件，内容是: console.log("Hello World")' }
    ], {
      tools: [
        {
          type: 'function',
          function: {
            name: 'write_file',
            description: '写入文件到指定路径',
            parameters: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: '文件路径' },
                content: { type: 'string', description: '文件内容' }
              },
              required: ['file_path', 'content']
            }
          }
        }
      ]
    });

    console.log('响应:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('错误:', error.message);
  }
}

test();
