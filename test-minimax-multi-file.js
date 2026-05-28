/**
 * 测试 MiniMax 流式响应 - 多文件生成场景
 *
 * 让模型生成多个文件（组件、样式、配置等），验证工具调用提取的完整性
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
console.log('测试 MiniMax 流式响应 - 多文件生成场景');
console.log('='.repeat(60));
console.log();

// write_file 工具定义
const tools = [
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to write (e.g., src/App.tsx)'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        }
      },
      required: ['file_path', 'content']
    }
  }
];

// 请求模型生成一个简单的项目结构
const prompt = `Please create a simple React counter component with the following file structure:

1. src/App.tsx - Main App component with counter logic
2. src/components/Counter.tsx - Counter component
3. src/components/Counter.css - Styles for the counter
4. src/types/index.ts - TypeScript type definitions
5. package.json - Project configuration

Use the write_file tool to create each file.`;

const messages = [
  { role: 'user', content: prompt }
];

const body = {
  model: 'MiniMax-M2.7',
  messages: messages,
  tools: tools,
  stream: true,
  max_tokens: 8192,
  temperature: 0.1
};

const asyncRequester = new AsyncRequester({ timeout: 180000 });
const toolCalls = [];
const filePathSet = new Set(); // 用于追踪已记录的文件路径
let expectedFiles = [
  'src/App.tsx',
  'src/components/Counter.tsx',
  'src/components/Counter.css',
  'src/types/index.ts',
  'package.json'
];

console.log('请求内容:');
console.log(prompt);
console.log();
console.log('预期生成文件:', expectedFiles);
console.log();
console.log('开始流式请求...\n');

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
      // 思考过程不输出
    },
    onTextDelta: (text) => {
      // 文本内容不输出，避免干扰
    },
    onToolCall: (toolCall) => {
      // 检查是否是新的工具调用（避免重复）
      if (!filePathSet.has(toolCall.id)) {
        filePathSet.add(toolCall.id);
        toolCalls.push(toolCall);

        let parsedArgs = null;
        let filePath = 'unknown';
        try {
          parsedArgs = JSON.parse(toolCall.arguments);
          filePath = parsedArgs.file_path || 'unknown';
        } catch (e) {
          filePath = '解析失败';
        }

        console.log(`[文件写入] #${toolCalls.length}: ${filePath}`);
      }
    },
    onComplete: (result) => {
      console.log('\n' + '='.repeat(60));
      console.log('流式响应完成');
      console.log('='.repeat(60));

      console.log(`\n共提取到 ${toolCalls.length} 个工具调用\n`);

      // 详细输出每个工具调用
      console.log('详细结果:');
      console.log('-'.repeat(60));

      let successCount = 0;
      let failCount = 0;

      toolCalls.forEach((tc, idx) => {
        console.log(`\n[${idx + 1}] 工具调用`);
        console.log(`    ID: ${tc.id}`);
        console.log(`    Name: ${tc.name}`);

        let parsedArgs = null;
        try {
          parsedArgs = JSON.parse(tc.arguments);
          console.log(`    Arguments: ✓ JSON 解析成功`);
          console.log(`      file_path: ${parsedArgs.file_path || 'N/A'}`);
          if (parsedArgs.content) {
            const contentPreview = parsedArgs.content.substring(0, 100).replace(/\n/g, '\\n');
            console.log(`      content: ${contentPreview}${parsedArgs.content.length > 100 ? '...' : ''}`);
          }
          successCount++;
        } catch (e) {
          console.log(`    Arguments: ✗ JSON 解析失败`);
          console.log(`    原始值: ${tc.arguments}`);
          failCount++;
        }
      });

      console.log('\n' + '='.repeat(60));
      console.log('测试结果汇总');
      console.log('='.repeat(60));
      console.log(`  总工具调用数: ${toolCalls.length}`);
      console.log(`  解析成功: ${successCount}`);
      console.log(`  解析失败: ${failCount}`);

      // 检查是否包含预期文件
      console.log('\n预期文件检查:');
      const extractedFiles = toolCalls.map(tc => {
        try {
          const args = JSON.parse(tc.arguments);
          return args.file_path;
        } catch {
          return null;
        }
      }).filter(Boolean);

      for (const expectedFile of expectedFiles) {
        const found = extractedFiles.some(f => f && f.includes(expectedFile.split('/').pop()));
        console.log(`  ${found ? '✓' : '✗'} ${expectedFile}`);
      }

      console.log('\n提取到的文件路径:');
      extractedFiles.forEach(f => console.log(`  - ${f}`));

      // 最终结论
      const allParsed = failCount === 0;
      const hasMultipleFiles = toolCalls.length >= 3;

      console.log('\n' + '='.repeat(60));
      if (allParsed && hasMultipleFiles) {
        console.log('测试结果: ✅ 多文件工具调用解析成功');
      } else if (allParsed) {
        console.log('测试结果: ⚠️ 解析成功但文件数量少于预期');
      } else {
        console.log('测试结果: ❌ 存在解析失败的工具调用');
      }
      console.log('='.repeat(60));

      process.exit(0);
    },
    onError: (error) => {
      console.error('\n错误:', error.message);
      process.exit(1);
    }
  },
  180000
).catch((error) => {
  console.error('请求失败:', error.message);
  process.exit(1);
});
