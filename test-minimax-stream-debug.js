/**
 * 测试 MiniMax 流式响应 - 调试版本
 * 查看实际的流式响应格式
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

async function streamRequestDebug(url, method, headers, body, timeout = 120000) {
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
    let chunkCount = 0;

    const req = httpModule.request(reqOptions, (res) => {
      console.log(`\n响应状态: ${res.statusCode}`);
      console.log('响应头:', JSON.stringify(res.headers, null, 2));

      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        data += chunkStr;
        chunkCount++;

        console.log(`\n--- Chunk ${chunkCount} ---`);
        console.log(`原始数据: ${chunkStr.substring(0, 500)}${chunkStr.length > 500 ? '...' : ''}`);

        // 尝试解析
        try {
          const parsed = JSON.parse(chunkStr);
          console.log(`解析后的 JSON:`, JSON.stringify(parsed).substring(0, 500));
        } catch (e) {
          // 不是完整的 JSON，尝试按行分割处理
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.substring(5).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  const parsed = JSON.parse(jsonStr);
                  console.log(`SSE data 行解析结果:`, JSON.stringify(parsed).substring(0, 300));
                } catch (e2) {
                  console.log(`SSE data 行解析失败: ${jsonStr.substring(0, 200)}`);
                }
              }
            } else if (line.startsWith('event:')) {
              console.log(`SSE event: ${line.substring(6).trim()}`);
            }
          }
        }
      });

      res.on('end', () => {
        console.log(`\n=== 流结束，共 ${chunkCount} 个 chunks ===`);
        console.log('完整响应长度:', data.length);
        resolve({ data, chunkCount });
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

async function test() {
  console.log('='.repeat(60));
  console.log('测试 MiniMax 流式响应 - 调试版本');
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

  console.log('发送流式请求...\n');

  try {
    const result = await streamRequestDebug(
      `${BASE_URL}/v1/messages`,
      'POST',
      {},
      body
    );
    console.log('\n\n调试完成');
  } catch (error) {
    console.error('\n请求失败:', error.message);
  }
}

test();
