/**
 * 测试 ConcurrentExecutor 流式响应处理流程
 *
 * 模拟 ConcurrentExecutor 调用 requestStream 并处理响应的完整流程
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
console.log('测试 ConcurrentExecutor 流式响应处理流程');
console.log('='.repeat(60));
console.log();

const asyncRequester = new AsyncRequester({ timeout: 180000 });

// 模拟 ConcurrentExecutor 的配置
const requestConfig = {
  url: 'https://api.minimaxi.com/anthropic/v1/messages',
  method: 'POST',
  headers: {
    'x-api-key': process.env.MINIMAX_API_KEY,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  },
  body: {
    model: 'MiniMax-M2.7',
    messages: [
      { role: 'user', content: `Please create a simple project with:
1. src/index.ts - Main entry file
2. src/utils/helper.ts - Helper functions
3. package.json - Project config` }
    ],
    tools: [
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
    ],
    stream: true,
    max_tokens: 8192,
    temperature: 0.1
  }
};

const streamingConfig = {
  enabled: true,
  defaultTimeout: 180000
};

// 模拟 ConcurrentExecutor 的累积变量
const accumulatedContent = '';
const accumulatedThinking = '';
const accumulatedTools = [];

// 流式请求 - 模拟 ConcurrentExecutor 的调用方式
console.log('开始流式请求...\n');

asyncRequester.requestStream(
  requestConfig.url,
  requestConfig.method,
  requestConfig.headers,
  requestConfig.body,
  {
    // 模拟 ConcurrentExecutor 的回调
    onThinkingDelta: (thinking) => {
      // 模拟 flowMonitor.emitThinkingProgress
      // console.log('[Thinking]', thinking.substring(0, 50) + '...');
    },
    onTextDelta: (text) => {
      // 模拟 flowMonitor.emitTextDelta
      // console.log('[Text]', text);
    },
    onToolCallDelta: (toolCall) => {
      // 模拟 ConcurrentExecutor 的处理逻辑
      // toolCall 是完整的工具调用对象 {id, type, name, arguments}
      // 直接添加到累积的 tools 数组
      accumulatedTools.push(toolCall);

      let parsedArgs = null;
      let filePath = 'unknown';
      try {
        parsedArgs = JSON.parse(toolCall.arguments);
        filePath = parsedArgs.file_path || 'unknown';
      } catch (e) {
        filePath = '解析失败';
      }

      console.log(`[工具调用] ${toolCall.name} -> ${filePath}`);
    },
    onComplete: (finalData) => {
      console.log(`\n[流式执行] 流式响应完成`);
    },
    onError: (error) => {
      console.error(`[流式执行] 流式响应错误: ${error.message}`);
    }
  },
  streamingConfig.defaultTimeout
).then((response) => {
  console.log('\n' + '='.repeat(60));
  console.log('流式响应处理完成');
  console.log('='.repeat(60));

  console.log(`\n累积的工具调用数: ${accumulatedTools.length}`);

  if (accumulatedTools.length > 0) {
    console.log('\n提取到的工具调用详情:');

    // 模拟 ConcurrentExecutor 的 mockResponseData 构建逻辑
    const mockResponseData = {
      id: `stream_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: 'MiniMax-M2.7',
      content: []
    };

    for (const tool of accumulatedTools) {
      try {
        const parsedInput = JSON.parse(tool.arguments || '{}');

        mockResponseData.content.push({
          type: 'tool_use',
          name: tool.name,
          input: parsedInput
        });

        console.log(`\n[${tool.name}]`);
        console.log(`  ID: ${tool.id}`);
        console.log(`  Arguments: ✓ JSON 解析成功`);
        console.log(`  file_path: ${parsedInput.file_path || 'N/A'}`);
        if (parsedInput.content) {
          const contentPreview = parsedInput.content.substring(0, 80).replace(/\n/g, '\\n');
          console.log(`  content: ${contentPreview}${parsedInput.content.length > 80 ? '...' : ''}`);
        }
      } catch (e) {
        console.log(`\n[${tool.name}]`);
        console.log(`  ID: ${tool.id}`);
        console.log(`  Arguments: ✗ JSON 解析失败 - ${e.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('ConcurrentExecutor 流式处理测试结果:');
    console.log('='.repeat(60));

    const allParsed = accumulatedTools.every(tool => {
      try {
        JSON.parse(tool.arguments);
        return true;
      } catch (e) {
        return false;
      }
    });

    console.log(`  工具调用数: ${accumulatedTools.length}`);
    console.log(`  解析成功率: ${allParsed ? '100% ✅' : '部分失败 ❌'}`);
    console.log(`  流程状态: ${allParsed && accumulatedTools.length > 0 ? '✅ 正常' : '❌ 异常'}`);

    if (allParsed && accumulatedTools.length >= 3) {
      console.log('\n✅ ConcurrentExecutor 流式响应处理流程测试通过！');
    } else if (allParsed) {
      console.log('\n⚠️ 测试通过，但工具调用数量少于预期');
    } else {
      console.log('\n❌ 测试失败');
    }
  } else {
    console.log('\n❌ 未提取到任何工具调用');
  }

  process.exit(0);
}).catch((error) => {
  console.error('\n请求失败:', error.message);
  process.exit(1);
});
