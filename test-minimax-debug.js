/**
 * MiniMax 模型并发测试脚本 - 调试版本
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
 * 发送流式请求到 MiniMax API
 */
function streamRequest(modelId, apiUrl, apiKey, messages) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl);

    const postData = JSON.stringify({
      model: modelId,
      messages: messages,
      max_tokens: 100000,
      temperature: 0.5,
      stream: true
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
    let responseCount = 0;
    let chunkTypes = new Set();
    let sampleChunks = [];

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        fullResponse += chunkStr;
        responseCount++;

        // 处理 SSE 格式
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(jsonStr);
                chunkTypes.add(parsed.type || 'unknown');

                // 保存前5个chunk的样本
                if (sampleChunks.length < 5) {
                  sampleChunks.push({
                    type: parsed.type,
                    hasContent: Array.isArray(parsed.content),
                    contentTypes: Array.isArray(parsed.content) ? parsed.content.map(c => c.type) : null,
                    keys: Object.keys(parsed)
                  });
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      });

      res.on('end', () => {
        resolve({
          fullResponse,
          responseCount,
          chunkTypes: Array.from(chunkTypes),
          sampleChunks
        });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
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
    const result = await streamRequest(modelId, apiUrl, apiKey, messages);
    const duration = Date.now() - startTime;

    return {
      taskId,
      modelId,
      duration,
      responseCount: result.responseCount,
      chunkTypes: result.chunkTypes,
      sampleChunks: result.sampleChunks,
      fullResponseLength: result.fullResponse.length,
      fullResponsePreview: result.fullResponse.substring(0, 2000)
    };
  } catch (error) {
    return {
      taskId,
      modelId,
      success: false,
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
  for (const result of results) {
    console.log(`${result.taskId} | duration: ${result.duration}ms | responses: ${result.responseCount}`);
    console.log(`  Chunk types: ${result.chunkTypes.join(', ')}`);
    console.log(`  Sample chunks:`);
    for (const sample of result.sampleChunks) {
      console.log(`    - type: ${sample.type}, hasContent: ${sample.hasContent}, contentTypes: ${JSON.stringify(sample.contentTypes)}`);
    }

    console.log(`  Full response preview (first 500 chars):`);
    console.log(`    ${result.fullResponsePreview.substring(0, 500).replace(/\n/g, '\\n')}`);
    console.log('');
  }

  console.log(`${'-'.repeat(60)}`);
  console.log(`Total test duration: ${totalDuration}ms`);
  console.log(`\n${'='.repeat(60)}\n`);

  return results;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const modelId = args[0] || 'MiniMax-M2.7';

  // 测试指定的模型
  await runConcurrentTest(modelId, 1);

  // 如果测试的是 MiniMax-M2.7，再测试 MiniMax-M2.7-highspeed 进行对比
  if (modelId === 'MiniMax-M2.7') {
    console.log('\n\n');
    await runConcurrentTest('MiniMax-M2.7-highspeed', 1);
  }
}

main().catch(console.error);
