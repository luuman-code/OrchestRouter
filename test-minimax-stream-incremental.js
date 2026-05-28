/**
 * 测试 MiniMax 流式响应 - 增量累积逻辑
 *
 * 假设 MiniMax 流式响应中 delta.tool_calls 的 arguments 是增量片段
 * 使用累积逻辑：existing.arguments += tc.function.arguments
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

// MiniMax API 配置 - 使用配置文件中的设置
const API_KEY = process.env.MINIMAX_API_KEY;
const MODEL = 'MiniMax-M2.7';
const BASE_URL = 'https://api.minimaxi.com/anthropic';

if (!API_KEY) {
  console.error('错误: MINIMAX_API_KEY 未设置');
  process.exit(1);
}

async function makeRequest(url, method, headers, body, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = url.startsWith('https://');
    const httpModule = isHttps ? https : http;

    const options = {
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

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

async function streamRequest(url, method, headers, body, options = {}, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = url.startsWith('https://');
    const httpModule = isHttps ? https : http;

    const options = {
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
    let streamEnded = false;

    const req = httpModule.request(options, (res) => {
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        data += chunkStr;

        // 处理 SSE 格式
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr === '[DONE]' || jsonStr === '') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (options.onChunk) {
                options.onChunk(parsed);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      res.on('end', () => {
        streamEnded = true;
        if (options.onComplete) {
          options.onComplete();
        }
        resolve({ data, streamEnded });
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

async function testIncrementalArguments() {
  console.log('='.repeat(60));
  console.log('测试 MiniMax 流式响应 - 增量累积逻辑');
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

  // 使用累积逻辑的 tool_call 解析器
  const toolCallAccumulator = new Map();
  const finalToolCalls = [];

  console.log('发送流式请求...\n');

  await streamRequest(
    `${BASE_URL}/v1/messages`,
    'POST',
    {},
    body,
    {
      onChunk: (chunk) => {
        // 处理 chat.completion.chunk 格式
        if (chunk.object === 'chat.completion.chunk' && chunk.choices) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const tcId = tc.id || `tool_call_index_${tc.index}`;
              const func = tc.function || {};

              if (toolCallAccumulator.has(tcId)) {
                // 增量累积 arguments
                const existing = toolCallAccumulator.get(tcId);
                if (func.arguments) {
                  existing.arguments += func.arguments;
                  console.log(`[增量累积] tcId=${tcId}, arguments 现在: ${existing.arguments}`);
                }
                if (func.name) {
                  existing.name = func.name;
                }
              } else {
                // 创建新的 tool_call
                const toolCall = {
                  id: tcId,
                  type: 'function',
                  name: func.name || '',
                  arguments: func.arguments || '{}'
                };
                toolCallAccumulator.set(tcId, toolCall);
                console.log(`[新建 tool_call] tcId=${tcId}, name=${toolCall.name}, arguments=${toolCall.arguments}`);
              }
            }
          }
        }
      },
      onComplete: () => {
        console.log('\n' + '='.repeat(60));
        console.log('流式响应完成');
        console.log('='.repeat(60));

        // 提取累积的 tool_calls
        for (const [tcId, tc] of toolCallAccumulator) {
          finalToolCalls.push(tc);
          console.log(`\n[最终 tool_call]`);
          console.log(`  ID: ${tc.id}`);
          console.log(`  Name: ${tc.name}`);
          console.log(`  Arguments: ${tc.arguments}`);

          // 尝试解析 arguments
          try {
            const parsed = JSON.parse(tc.arguments);
            console.log(`  解析结果:`, parsed);
          } catch (e) {
            console.log(`  解析失败: ${e.message}`);
          }
        }

        if (finalToolCalls.length === 0) {
          console.log('\n未提取到任何 tool_call！');
        }
      }
    }
  );
}

testIncrementalArguments().catch(console.error);
