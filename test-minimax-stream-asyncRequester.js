/**
 * 使用 AsyncRequester 测试 MiniMax 流式响应解析
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
const StreamToolCallParser = require('./src/executor/core/StreamToolCallParser');

console.log('='.repeat(60));
console.log('测试 AsyncRequester 处理 MiniMax Anthropic SSE 格式');
console.log('='.repeat(60));
console.log();

const asyncRequester = new AsyncRequester({ timeout: 120000 });

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
  }
];

const messages = [
  { role: 'user', content: 'How\'s the weather in San Francisco?' }
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
const thinkingChunks = [];
const textChunks = [];

console.log('发送流式请求...\n');

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
      thinkingChunks.push(thinking);
    },
    onTextDelta: (text) => {
      textChunks.push(text);
    },
    onToolCall: (toolCall) => {
      console.log('[onToolCall]', JSON.stringify(toolCall));
      toolCalls.push(toolCall);
    },
    onComplete: (result) => {
      console.log('\n' + '='.repeat(60));
      console.log('流式响应完成');
      console.log('='.repeat(60));

      console.log(`\n思考内容块数: ${thinkingChunks.length}`);
      console.log(`文本内容块数: ${textChunks.length}`);
      console.log(`工具调用数: ${toolCalls.length}`);

      if (toolCalls.length > 0) {
        console.log('\n提取到的 tool_calls:');
        for (const tc of toolCalls) {
          console.log(`\n[tool_call]`);
          console.log(`  id: ${tc.id}`);
          console.log(`  name: ${tc.name}`);
          console.log(`  arguments: ${tc.arguments}`);
          try {
            const parsed = JSON.parse(tc.arguments);
            console.log(`  解析结果:`, parsed);
          } catch (e) {
            console.log(`  解析失败: ${e.message}`);
          }
        }
      } else {
        console.log('\n未提取到任何 tool_call！');
      }

      console.log('\n测试结果:', toolCalls.length > 0 ? '✅ 成功' : '❌ 失败');
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
