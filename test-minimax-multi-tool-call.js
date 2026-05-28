/**
 * 测试 MiniMax 流式响应 - 多工具调用场景
 */

const fs = require('fs');
const path = require('path');

// 加载 .env 文件
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf-8');
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
}

const AsyncRequester = require('./src/executor/core/AsyncRequester');

console.log('='.repeat(60));
console.log('测试 MiniMax 流式响应 - 多工具调用场景');
console.log('='.repeat(60));
console.log();

const asyncRequester = new AsyncRequester({ timeout: 120000 });

// 定义多个工具
const tools = [
  {
    name: 'get_weather',
    description: 'Get weather of a location',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, US'
        }
      },
      required: ['location']
    }
  },
  {
    name: 'get_time',
    description: 'Get current time of a location',
    input_schema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone, e.g. America/Los_Angeles'
        }
      },
      required: ['timezone']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file'
        },
        content: {
          type: 'string',
          description: 'Content to write'
        }
      },
      required: ['file_path', 'content']
    }
  }
];

// 构建一个可能触发多个工具调用的提示
const messages = [
  { role: 'user', content: `Please help me with the following tasks:
1. Check the weather in Tokyo
2. Tell me the current time in Tokyo
3. Write a hello world program to hello.ts` }
];

const body = {
  model: 'MiniMax-M2.7',
  messages: messages,
  tools: tools,
  stream: true,
  max_tokens: 4096,
  temperature: 0.1
};

const toolCalls = [];
let callCount = 0;

console.log('发送流式请求...\n');
console.log('请求内容:');
console.log(messages[0].content);
console.log();

asyncRequester.requestStream(
  'https://api.minimaxi.com/anthropic/v1/messages',
  'POST',
  {
    'x-api-key': process.env.MINIMAX_API_KEY,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  },
  body,
  {
    onThinkingDelta: (thinking) => {
      // 思考内容省略
    },
    onTextDelta: (text) => {
      process.stdout.write(text);
    },
    onToolCall: (toolCall) => {
      callCount++;
      console.log(`\n\n[工具调用 #${callCount}]`);
      console.log(`  ID: ${toolCall.id}`);
      console.log(`  Name: ${toolCall.name}`);
      console.log(`  Arguments: ${toolCall.arguments}`);
      try {
        const parsed = JSON.parse(toolCall.arguments);
        console.log(`  解析结果:`, parsed);
      } catch (e) {
        console.log(`  解析失败: ${e.message}`);
      }
      toolCalls.push(toolCall);
    },
    onComplete: (result) => {
      console.log('\n\n' + '='.repeat(60));
      console.log('流式响应完成');
      console.log('='.repeat(60));

      console.log(`\n共提取到 ${toolCalls.length} 个工具调用`);

      if (toolCalls.length > 0) {
        console.log('\n所有工具调用:');
        toolCalls.forEach((tc, idx) => {
          console.log(`\n[${idx + 1}] ${tc.name}`);
          console.log(`    ID: ${tc.id}`);
          console.log(`    Arguments: ${tc.arguments}`);
          try {
            const parsed = JSON.parse(tc.arguments);
            console.log(`    解析结果:`, parsed);
          } catch (e) {
            console.log(`    解析失败: ${e.message}`);
          }
        });

        // 验证
        const allValid = toolCalls.every(tc => {
          try {
            JSON.parse(tc.arguments);
            return true;
          } catch (e) {
            return false;
          }
        });

        console.log(`\n测试结果: ${allValid ? '✅ 所有工具调用解析成功' : '❌ 部分工具调用解析失败'}`);
      } else {
        console.log('\n测试结果: ❌ 未提取到任何工具调用');
      }

      process.exit(0);
    },
    onError: (error) => {
      console.error('\n错误:', error.message);
      process.exit(1);
    }
  },
  120000
).catch((error) => {
  console.error('请求失败:', error.message);
  process.exit(1);
});
