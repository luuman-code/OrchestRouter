/**
 * 测试 MiniMax 流式响应 - Anthropic 格式处理
 *
 * MiniMax 使用 Anthropic SSE 格式:
 * - content_block_start (tool_use)
 * - content_block_delta (input_json_delta)
 * - content_block_stop
 */

const https = require('https');
const http = require('http');
const fs = require('fs');

// 加载 .env 文件
const envPath = require('path').join(__dirname, '.env');
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

const API_KEY = process.env.MINIMAX_API_KEY;
const MODEL = 'MiniMax-M2.7';
const BASE_URL = 'https://api.minimaxi.com/anthropic';

async function streamRequestAnthropic(url, method, headers, body, options = {}, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = url.startsWith('https://');
    const httpModule = isHttps ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...headers
      },
      timeout
    };

    let data = '';
    let eventType = null;
    let jsonData = null;

    const req = httpModule.request(reqOptions, (res) => {
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        data += chunkStr;

        // 处理 SSE 格式
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr === '[DONE]' || jsonStr === '') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              parsed._eventType = eventType; // 附加事件类型
              if (options.onChunk) {
                options.onChunk(parsed);
              }
            } catch (e) {
              // 忽略解析错误
            }
          } else {
            eventType = null;
          }
        }
      });

      res.on('end', () => {
        if (options.onComplete) {
          options.onComplete();
        }
        resolve({ data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Stream timeout'));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

async function testAnthropicFormat() {
  console.log('='.repeat(60));
  console.log('测试 MiniMax 流式响应 - Anthropic 格式处理');
  console.log('='.repeat(60));
  console.log();

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
    model: MODEL,
    messages: messages,
    tools: tools,
    stream: true,
    max_tokens: 4096,
    temperature: 0.1
  };

  // 模拟 StreamToolCallParser 的处理逻辑
  let currentToolCallId = null;
  let currentToolCallName = null;
  let currentArgumentsBuffer = '';
  let state = 'idle';
  const toolCallAccumulator = new Map();

  console.log('发送流式请求...\n');

  await streamRequestAnthropic(
    `${BASE_URL}/v1/messages`,
    'POST',
    {},
    body,
    {
      onChunk: (chunk) => {
        const eventType = chunk._eventType;

        // content_block_start - 工具调用块开始
        if (chunk.type === 'content_block_start' && chunk.content_block) {
          const cb = chunk.content_block;
          if (cb.type === 'tool_use') {
            currentToolCallId = cb.id;
            currentToolCallName = cb.name;
            currentArgumentsBuffer = '';
            state = 'parsing_arguments';
            console.log(`[content_block_start] tool_use: id=${currentToolCallId}, name=${currentToolCallName}`);
          }
        }

        // content_block_delta - 内容增量
        if (chunk.type === 'content_block_delta' && chunk.delta) {
          const delta = chunk.delta;

          // input_json_delta - 工具参数增量
          if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
            currentArgumentsBuffer += delta.partial_json;
            console.log(`[input_json_delta] partial_json: "${delta.partial_json}"`);
            console.log(`[input_json_delta] currentArgumentsBuffer: "${currentArgumentsBuffer}"`);

            // 尝试解析累积的缓冲区
            if (currentArgumentsBuffer) {
              try {
                const parsed = JSON.parse(currentArgumentsBuffer);
                console.log(`[input_json_delta] 解析成功:`, parsed);

                // 创建 tool_call
                const toolCall = {
                  id: currentToolCallId,
                  type: 'function',
                  name: currentToolCallName,
                  arguments: JSON.stringify(parsed)
                };

                // 存储到累积器
                if (currentToolCallId) {
                  toolCallAccumulator.set(currentToolCallId, toolCall);
                }

                console.log(`[input_json_delta] 创建 tool_call:`, toolCall);
              } catch (e) {
                console.log(`[input_json_delta] 解析失败: ${e.message}`);
              }
            }
          }
        }

        // content_block_stop - 内容块结束
        if (chunk.type === 'content_block_stop') {
          console.log(`[content_block_stop] index=${chunk.index}`);
          // 重置状态
          currentToolCallId = null;
          currentToolCallName = null;
          currentArgumentsBuffer = '';
          state = 'idle';
        }
      },
      onComplete: () => {
        console.log('\n' + '='.repeat(60));
        console.log('流式响应完成');
        console.log('='.repeat(60));

        // 输出累积的 tool_calls
        console.log('\n累积的 tool_calls:');
        for (const [id, tc] of toolCallAccumulator) {
          console.log(`\n[tool_call] id=${tc.id}, name=${tc.name}`);
          console.log(`  arguments: ${tc.arguments}`);
          try {
            const parsed = JSON.parse(tc.arguments);
            console.log(`  解析结果:`, parsed);
          } catch (e) {
            console.log(`  解析失败: ${e.message}`);
          }
        }

        if (toolCallAccumulator.size === 0) {
          console.log('\n未提取到任何 tool_call！');
        }
      }
    }
  );
}

testAnthropicFormat().catch(console.error);
