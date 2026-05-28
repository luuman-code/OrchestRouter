/**
 * 测试 DeepSeek 多工具调用流式响应解析
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
console.log('测试 DeepSeek 多工具调用流式响应解析');
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
  },
  {
    name: 'get_weather',
    description: 'Get weather of a location',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string' }
      },
      required: ['location']
    }
  }
];

const messages = [
  { role: 'user', content: `Please:
1. Write a hello.ts file with console.log("Hello World")
2. Write a config.json file
3. Check the weather in Tokyo` }
];

const body = {
  model: 'deepseek-v4-pro',
  messages: messages,
  tools: tools,
  stream: true,
  max_tokens: 4096,
  temperature: 0.1
};

const accumulatedTools = [];

console.log('发送 DeepSeek 多工具调用请求...\n');

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
      // 思考过程省略
    },
    onTextDelta: (text) => {
      // 文本内容省略
    },
    onToolCallDelta: (toolCall) => {
      accumulatedTools.push(toolCall);

      let filePath = 'unknown';
      let parsedArgs = null;
      try {
        parsedArgs = JSON.parse(toolCall.arguments);
        filePath = parsedArgs.file_path || parsedArgs.location || 'unknown';
      } catch (e) {}

      console.log(`[工具调用] ${toolCall.name} -> ${filePath}`);
    },
    onComplete: (finalData) => {
      console.log('\n' + '='.repeat(60));
      console.log('DeepSeek 多工具调用响应完成');
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
            if (parsed.file_path) console.log(`    file_path: ${parsed.file_path}`);
            if (parsed.location) console.log(`    location: ${parsed.location}`);
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
        console.log(`工具调用数: ${accumulatedTools.length}`);
        console.log(`解析成功率: ${allParsed ? '100% ✅' : '部分失败 ❌'}`);
        console.log(`测试结果: ${allParsed && accumulatedTools.length >= 2 ? '✅ DeepSeek 多工具调用解析成功' : '⚠️ 工具调用数量少于预期'}`);
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
