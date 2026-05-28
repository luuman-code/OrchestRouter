/**
 * MiniMax 模型并发测试脚本
 *
 * 测试 MiniMax-M2.7 和 MiniMax-M2.7-highspeed 在高并发情况下是否仍能正确返回工具调用
 */

const https = require('https');
const http = require('http');

// 从配置文件加载的 MiniMax 配置
const MINIMAX_CONFIG = {
  api_base_url: 'https://api.minimaxi.com/anthropic',
  api_key: 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw',
  models: {
    'MiniMax-M2.7': {
      api_model_id: 'MiniMax-M2.7',
      max_output_tokens: 100000
    },
    'MiniMax-M2.7-highspeed': {
      api_model_id: 'MiniMax-M2.7-highspeed',
      max_output_tokens: 100000
    }
  }
};

// 系统提示词（与编排器一致）
// write_file 工具定义（与编排器一致）
const WRITE_FILE_TOOL = {
  name: 'write_file',
  description: '写入文件内容',
  input_schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' }
    },
    required: ['file_path', 'content']
  }
};

const SYSTEM_PROMPT = `You are a code generation assistant.

Generate the files listed in the user message. Use the write_file tool for EACH file listed.
Return ALL tool calls in ONE single response.
Do not return any text or comments.

IMPORTANT: If type definitions or other reference content appear in the prompt, they are for YOUR REFERENCE ONLY to ensure consistency. You MUST still generate ALL listed files using the write_file tool. Do NOT skip any file even if some content appears to be provided.`;

// 用户提示词
const USER_PROMPT = `# Test Task

## Requirement
生成 deliverables 列表中指定的文件

## Tech Stack
React, TypeScript, Node.js

## Files to Generate
1. [logic] Test API service -> FILE: src/services/test-api.ts
2. [ui] Test App component -> FILE: src/App.tsx
3. [logic] Test utility -> FILE: src/utils/test.ts`;

/**
 * 发送流式请求到 MiniMax API - 使用 SSE 解析
 */
function streamRequest(modelId, apiUrl, apiKey, messages, tools) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl);

    const postData = JSON.stringify({
      model: modelId,
      messages: messages,
      max_tokens: 100000,
      temperature: 0.5,
      stream: true,
      tools: tools || []
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    let fullResponse = '';
    let thinkingContent = '';
    let textContent = '';
    const toolCalls = [];
    let currentToolCallId = null;
    let currentToolCallName = null;
    let currentToolCallArgs = '';
    let currentEventType = null;
    let parsingToolCall = false;

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        fullResponse += chunkStr;

        // 处理 SSE 格式: event: xxx\ndata: {...}\n\n
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(jsonStr);
                processSSEEvent(currentEventType, parsed);
              } catch (e) {
                // 忽略解析错误
              }
            }
            currentEventType = null;
          }
        }
      });

      res.on('end', () => {
        // 如果有正在解析的工具调用，添加到列表
        if (parsingToolCall && currentToolCallName && currentToolCallArgs) {
          try {
            const parsedArgs = JSON.parse(currentToolCallArgs);
            toolCalls.push({
              name: currentToolCallName,
              arguments: parsedArgs
            });
          } catch (e) {
            // JSON 解析失败，使用原始字符串
            toolCalls.push({
              name: currentToolCallName,
              arguments: currentToolCallArgs
            });
          }
        }

        resolve({
          fullResponse,
          thinking: thinkingContent,
          text: textContent,
          toolCalls
        });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();

    /**
     * 处理 SSE 事件
     */
    function processSSEEvent(eventType, data) {
      switch (eventType) {
        case 'message_start':
          // 消息开始
          break;

        case 'content_block_start':
          // 内容块开始
          if (data.content_block) {
            if (data.content_block.type === 'thinking') {
              // 思考块开始
            } else if (data.content_block.type === 'tool_use') {
              // 工具调用块开始
              currentToolCallId = data.content_block.id;
              currentToolCallName = data.content_block.name;
              currentToolCallArgs = '';
              parsingToolCall = true;
            }
          }
          break;

        case 'content_block_delta':
          // 内容块增量
          if (data.delta) {
            if (data.delta.type === 'thinking_delta') {
              // 思考增量
              thinkingContent += data.delta.thinking || '';
            } else if (data.delta.type === 'text_delta') {
              // 文本增量
              textContent += data.delta.text || '';
            } else if (data.delta.type === 'input_json_delta') {
              // 工具参数增量
              currentToolCallArgs += data.delta.partial_json || '';
            }
          }
          break;

        case 'content_block_stop':
          // 内容块结束
          if (parsingToolCall && currentToolCallName) {
            try {
              const parsedArgs = JSON.parse(currentToolCallArgs);
              toolCalls.push({
                id: currentToolCallId,
                name: currentToolCallName,
                arguments: parsedArgs
              });
            } catch (e) {
              // JSON 解析失败，添加到列表使用原始字符串
              toolCalls.push({
                id: currentToolCallId,
                name: currentToolCallName,
                arguments: currentToolCallArgs
              });
            }
            parsingToolCall = false;
            currentToolCallId = null;
            currentToolCallName = null;
            currentToolCallArgs = '';
          }
          break;

        case 'message_delta':
          // 消息增量
          break;

        case 'message_stop':
          // 消息结束
          break;

        case 'ping':
          // Ping 心跳
          break;
      }
    }
  });
}

/**
 * 执行单个测试任务
 */
async function runSingleTask(taskId, modelId, apiUrl, apiKey) {
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: USER_PROMPT }
      ]
    }
  ];

  const startTime = Date.now();

  try {
    const result = await streamRequest(modelId, apiUrl, apiKey, messages, [WRITE_FILE_TOOL]);
    const duration = Date.now() - startTime;

    return {
      taskId,
      modelId,
      success: result.toolCalls.length > 0,
      thinkingLength: result.thinking.length,
      textLength: result.text.length,
      toolCallCount: result.toolCalls.length,
      toolCalls: result.toolCalls,
      duration,
      error: result.toolCalls.length === 0 ? 'No tool calls returned' : null
    };
  } catch (error) {
    return {
      taskId,
      modelId,
      success: false,
      thinkingLength: 0,
      textLength: 0,
      toolCallCount: 0,
      toolCalls: [],
      duration: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * 运行并发测试
 */
async function runConcurrentTest(modelId, concurrency) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${modelId} with concurrency: ${concurrency}`);
  console.log(`${'='.repeat(60)}\n`);

  const apiUrl = `${MINIMAX_CONFIG.api_base_url}/v1/messages`;
  const actualModelId = MINIMAX_CONFIG.models[modelId]?.api_model_id || modelId;

  console.log(`API URL: ${apiUrl}`);
  console.log(`Model ID: ${actualModelId}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`\n${'-'.repeat(60)}\n`);

  const startTime = Date.now();

  // 创建并发任务
  const tasks = [];
  for (let i = 0; i < concurrency; i++) {
    tasks.push(runSingleTask(`task_${i + 1}`, actualModelId, apiUrl, MINIMAX_CONFIG.api_key));
  }

  // 并发执行
  const results = await Promise.all(tasks);

  const totalDuration = Date.now() - startTime;

  // 输出结果
  let successCount = 0;
  let failCount = 0;
  let totalThinkingLength = 0;
  let totalToolCalls = 0;

  for (const result of results) {
    totalThinkingLength += result.thinkingLength;
    totalToolCalls += result.toolCallCount;

    const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
    console.log(`${status} | ${result.taskId} | thinking: ${result.thinkingLength} chars | text: ${result.textLength} chars | tools: ${result.toolCallCount} | duration: ${result.duration}ms`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        const argsStr = typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments);
        console.log(`    - ${tc.name}: ${argsStr.substring(0, 80)}...`);
      }
    }

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n${'-'.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Total tasks: ${concurrency}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total thinking: ${totalThinkingLength} chars`);
  console.log(`  Total tool calls: ${totalToolCalls}`);
  console.log(`  Average thinking per task: ${Math.round(totalThinkingLength / concurrency)} chars`);
  console.log(`  Total test duration: ${totalDuration}ms`);
  console.log(`\n${'='.repeat(60)}\n`);

  return { successCount, failCount, results };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const modelId = args[0] || 'MiniMax-M2.7';
  const concurrency = parseInt(args[1]) || 3;

  // 测试指定的模型
  await runConcurrentTest(modelId, concurrency);

  // 如果测试的是 MiniMax-M2.7，再测试 MiniMax-M2.7-highspeed 进行对比
  if (modelId === 'MiniMax-M2.7') {
    console.log('\n\n');
    await runConcurrentTest('MiniMax-M2.7-highspeed', concurrency);
  }
}

main().catch(console.error);
