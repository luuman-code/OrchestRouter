/**
 * 流式响应测试脚本
 *
 * 用于查看模型返回的原始流式响应格式，并测试解析机制
 */

const https = require('https');

// 读取 .env 文件
const fs = require('fs');
let envContent = fs.readFileSync('C:/Users/LWB/OrchestRouter/.env', 'utf-8');
// 移除 BOM
if (envContent.charCodeAt(0) === 0xFEFF) {
  envContent = envContent.substring(1);
}
// 移除 \\r (Windows 行尾符)
envContent = envContent.replace(/\r/g, '');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

// 使用 DeepSeek API
const API_KEY = envVars.DEEPSEEK_API_KEY || '';
const MODEL = 'deepseek-chat';

const requestBody = {
  model: MODEL,
  messages: [
    {
      role: 'user',
      content: '请用 write_file 工具生成一个简单的 hello.ts 文件，内容是: console.log("Hello World")'
    }
  ],
  stream: true,
  tools: [
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: '写入文件到指定路径',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: '文件路径'
            },
            content: {
              type: 'string',
              description: '文件内容'
            }
          },
          required: ['file_path', 'content']
        }
      }
    }
  ]
};

const requestData = JSON.stringify(requestBody);

const options = {
  hostname: 'api.deepseek.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Length': Buffer.byteLength(requestData)
  }
};

console.log('=== 开始测试流式响应 ===');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`Model: ${MODEL}\n`);

let chunkCount = 0;
let accumulatedResponse = '';

const req = https.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log(`Content-Type: ${res.headers['content-type']}\n`);

  res.on('data', (chunk) => {
    chunkCount++;
    const chunkStr = chunk.toString();
    accumulatedResponse += chunkStr;

    console.log(`--- Chunk ${chunkCount} (${chunkStr.length} bytes) ---`);
    // 只打印前200字符避免太长
    const preview = chunkStr.length > 200 ? chunkStr.substring(0, 200) + '...' : chunkStr;
    console.log(preview);
    console.log('\n');
  });

  res.on('end', () => {
    console.log('\n========== 流式响应结束 ==========');
    console.log(`总 chunk 数: ${chunkCount}`);
    console.log(`总响应长度: ${accumulatedResponse.length} bytes`);

    // 分析累积的响应
    console.log('\n========== 累积响应分析 ==========\n');

    // 尝试解析 SSE 格式
    const lines = accumulatedResponse.split('\n');
    let parsedChunks = [];
    let errorChunks = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.substring(6);
        if (jsonStr.trim() === '[DONE]') {
          console.log('收到 [DONE] 标记');
        } else {
          try {
            const parsed = JSON.parse(jsonStr);
            parsedChunks.push(parsed);

            // 打印 delta 内容
            const delta = parsed.choices?.[0]?.delta;
            if (delta) {
              console.log('\n--- delta ---');
              if (delta.content) {
                console.log(`content delta: "${delta.content.substring(0, 100)}..."`);
              }
              if (delta.tool_calls) {
                console.log('tool_calls delta:');
                console.log(JSON.stringify(delta.tool_calls, null, 2).substring(0, 500));
              }
            }
          } catch (e) {
            errorChunks.push({ line: jsonStr.substring(0, 200), error: e.message });
          }
        }
      }
    }

    console.log(`\n成功解析的 chunks: ${parsedChunks.length}`);
    console.log(`解析失败的 chunks: ${errorChunks.length}`);

    // 测试 StreamToolCallParser
    console.log('\n\n========== 测试 StreamToolCallParser ==========\n');
    testStreamToolCallParser(accumulatedResponse);
  });
});

req.on('error', (e) => {
  console.error(`请求错误: ${e.message}`);
});

req.write(requestData);
req.end();

/**
 * 测试 StreamToolCallParser
 */
function testStreamToolCallParser(responseText) {
  const StreamToolCallParser = require('./src/executor/core/StreamToolCallParser');
  const parser = new StreamToolCallParser();

  // 解析 SSE 格式
  const lines = responseText.split('\n');
  let toolCallsFound = [];
  let parseErrors = [];

  console.log('开始逐 chunk 解析...\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.substring(6);
    if (jsonStr.trim() === '[DONE]') {
      console.log('收到 [DONE]\n');
      continue;
    }

    try {
      const chunk = JSON.parse(jsonStr);
      const delta = chunk.choices?.[0]?.delta;

      // ========== OpenAI 格式处理 ==========
      if (delta?.content) {
        const result = parser.processChunk(delta.content);
        if (result.toolCalls.length > 0) {
          console.log('>>> 从 content 解析到 tool_calls:');
          for (const tc of result.toolCalls) {
            console.log(`  name: ${tc.name}`);
            console.log(`  arguments: ${JSON.stringify(tc.arguments).substring(0, 100)}...`);
          }
          toolCallsFound.push(...result.toolCalls);
        }
      }

      // ========== MiniMax tool_calls 格式 ==========
      if (delta?.tool_calls) {
        console.log('\n>>> MiniMax tool_calls 格式:');
        for (const tc of delta.tool_calls) {
          console.log(JSON.stringify(tc, null, 2).substring(0, 300));
          toolCallsFound.push(tc);
        }
      }

      // ========== DeepSeek Anthropic 格式 ==========
      if (chunk.type === 'content_block_start') {
        if (chunk.content_block?.type === 'tool_use') {
          console.log('\n>>> DeepSeek: content_block_start (tool_use)');
          console.log(`  id: ${chunk.content_block.id}`);
          console.log(`  name: ${chunk.content_block.name}`);
          parser.currentToolCallId = chunk.content_block.id;
          parser.currentToolCallName = chunk.content_block.name;
          parser.state = 'parsing_arguments';
        }
      }

      if (chunk.type === 'content_block_delta') {
        if (chunk.delta?.type === 'input_json_delta') {
          console.log('\n>>> DeepSeek: input_json_delta');
          const partial = chunk.delta.partial_json || '';
          console.log(`  partial_json: "${partial.substring(0, 80)}..."`);
          const result = parser.processInputJsonDelta(chunk.delta.partial_json);
          if (result.toolCalls.length > 0) {
            console.log('  解析到 tool_calls:');
            console.log(JSON.stringify(result.toolCalls, null, 2).substring(0, 300));
            toolCallsFound.push(...result.toolCalls);
          }
        }
      }

      if (chunk.type === 'content_block_stop') {
        console.log('\n>>> DeepSeek: content_block_stop');
        const result = parser.extractCompleteToolCalls();
        if (result.length > 0) {
          console.log('  提取到完整 tool_calls:');
          for (const tc of result) {
            console.log(`  name: ${tc.name}`);
            console.log(`  arguments: ${JSON.stringify(tc.arguments).substring(0, 100)}...`);
          }
          toolCallsFound.push(...result);
        }
        parser.reset();
      }

      // ========== 完成检测 ==========
      if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
        console.log('\n>>> finish_reason = tool_calls');
        console.log('  尝试提取完整的 tool_calls...');
        const result = parser.extractCompleteToolCalls();
        if (result.length > 0) {
          console.log(`  提取到 ${result.length} 个 tool_calls`);
          for (const tc of result) {
            console.log(`  - ${tc.name}: ${JSON.stringify(tc.arguments).substring(0, 80)}...`);
          }
          toolCallsFound.push(...result);
        }
      }

    } catch (e) {
      parseErrors.push({ error: e.message, chunk: jsonStr.substring(0, 100) });
    }
  }

  console.log(`\n========== 解析结果统计 ==========`);
  console.log(`总共找到 tool_calls: ${toolCallsFound.length}`);
  console.log(`解析错误: ${parseErrors.length}`);
  if (parseErrors.length > 0) {
    console.log('\n解析错误详情:');
    for (const err of parseErrors) {
      console.log(`  - ${err.error}: ${err.chunk}...`);
    }
  }
}
