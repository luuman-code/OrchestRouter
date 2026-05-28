/**
 * 测试 DeepSeek 流式响应解析
 * 验证 OpenAI SSE 格式的 tool_calls 增量累积
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
console.log('测试 DeepSeek 流式响应解析');
console.log('='.repeat(60));
console.log();

const asyncRequester = new AsyncRequester({ timeout: 120000 });

const tools = [
  {
    name: 'write_file',
    description: 'Write content to a file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['file_path', 'content']
    }
  }
];

const messages = [
  { role: 'user', content: 'Create a simple hello.ts file that prints "Hello World"' }
];

const body = {
  model: 'deepseek-v4-pro',
  messages: messages,
  tools: tools,
  stream: true,
  max_tokens: 2048,
  temperature: 0.1
};

const accumulatedTools = [];

console.log('发送 DeepSeek 流式请求...\n');

asyncRequester.requestStream(
  'https://api.deepseek.com/anthropic/v1/messages',
  'POST',
  {
    'x-api-key': process.env.DEEPSEEK_API_KEY,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  },
  body,
  {
    onThinkingDelta: (thinking) => {
      // console.log('[Thinking]', thinking.substring(0, 80) + '...');
    },
    onTextDelta: (text) => {
      // console.log('[Text]', text);
    },
    onToolCallDelta: (toolCall) => {
      accumulatedTools.push(toolCall);

      let filePath = 'unknown';
      try {
        const args = JSON.parse(toolCall.arguments);
        filePath = args.file_path || 'unknown';
      } catch (e) {}

      console.log(`[工具调用] ${toolCall.name} -> ${filePath}`);
    },
    onComplete: (finalData) => {
      console.log('\n' + '='.repeat(60));
      console.log('DeepSeek 流式响应完成');
      console.log('='.repeat(60));

      console.log(`\n工具调用数: ${accumulatedTools.length}`);

      if (accumulatedTools.length > 0) {
        console.log('\n工具调用详情:');
        for (const tc of accumulatedTools) {
          console.log(`\n[${tc.name}]`);
          console.log(`  ID: ${tc.id}`);
          console.log(`  Arguments: ${tc.arguments}`);
          try {
            const parsed = JSON.parse(tc.arguments);
            console.log(`  解析结果: ✓`);
            console.log(`    file_path: ${parsed.file_path || 'N/A'}`);
            if (parsed.content) {
              const preview = parsed.content.substring(0, 60).replace(/\n/g, '\\n');
              console.log(`    content: ${preview}${parsed.content.length > 60 ? '...' : ''}`);
            }
          } catch (e) {
            console.log(`  解析结果: ✗ ${e.message}`);
          }
        }

        const allParsed = accumulatedTools.every(tc => {
          try { JSON.parse(tc.arguments); return true; } catch { return false; }
        });

        console.log('\n' + '='.repeat(60));
        console.log(`解析成功率: ${allParsed ? '100% ✅' : '部分失败 ❌'}`);
        console.log(`测试结果: ${allParsed && accumulatedTools.length > 0 ? '✅ DeepSeek 流式响应解析成功' : '❌ 测试失败'}`);
      } else {
        console.log('\n❌ 未提取到工具调用');
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
