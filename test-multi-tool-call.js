/**
 * DeepSeek 多工具调用测试脚本
 *
 * 测试 DeepSeek 模型是否能够支持在单个响应中返回多个工具调用
 *
 * 运行方式: node test-multi-tool-call.js
 */

const https = require('https');

// 测试配置
const CONFIG = {
  apiBaseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-pro',
  maxTokens: 4096
};

// 工具定义 - 与 OrchestRouter 中使用的 CODE_GENERATION_TOOLS 一致
const TOOLS = [
  {
    name: 'write_file',
    description: '写入文件内容到指定路径',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['path', 'content']
    }
  }
];

// 系统提示
const SYSTEM_PROMPT = `你是一个代码生成助手。你必须使用提供的工具来完成任务。

当需要生成多个文件时，你应该在一个响应中返回多个 write_file 工具调用。

返回格式示例：
[TOOL_CALL]
{"name": "write_file", "input": {"path": "file1.ts", "content": "..."}}
{"name": "write_file", "input": {"path": "file2.ts", "content": "..."}}
[/TOOL_CALL]

IMPORTANT: 请在单个响应中返回尽可能多的工具调用，不要拆分。`;

// 测试请求
const USER_PROMPT = `请为以下项目结构生成代码：

1. 创建 src/utils/helpers.ts，包含：
   - function add(a: number, b: number): number
   - function subtract(a: number, b: number): number

2. 创建 src/utils/validators.ts，包含：
   - function isEmail(email: string): boolean
   - function isUrl(url: string): boolean

3. 创建 src/constants.ts，包含：
   - const APP_NAME = "TestApp"
   - const VERSION = "1.0.0"

请在单个响应中返回所有三个文件的 write_file 调用。`;

function callDeepSeekAPI(messages, tools, maxTokens, thinking = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-4ae354108bc04a97bc3dd197f0e6cc00';

    // DeepSeek 使用 body.system 而不是 messages 中的 system role
    let systemPrompt = '';
    const filteredMessages = messages.filter(msg => {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
        return false;
      }
      return true;
    });

    const body = {
      model: CONFIG.model,
      messages: filteredMessages,
      max_tokens: maxTokens,
      tools: tools
    };

    // DeepSeek 使用 body.system
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // 添加思考模式配置
    if (thinking) {
      body.thinking = thinking;
    }

    const bodyString = JSON.stringify(body);

    const url = new URL(`${CONFIG.apiBaseUrl}/v1/messages`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyString)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}, data: ${data.substring(0, 500)}`));
          }
        } else {
          reject(new Error(`API Error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });

    req.write(bodyString);
    req.end();
  });
}

function extractToolCalls(response) {
  const toolCalls = [];

  if (response.content && Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          input: block.input,
          id: block.id
        });
      }
    }
  }

  return toolCalls;
}

function extractTextContent(response) {
  const texts = [];

  if (response.content && Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === 'text') {
        texts.push(block.text);
      }
    }
  }

  return texts.join('\n');
}

async function runTest() {
  console.log('='.repeat(60));
  console.log('DeepSeek 多工具调用测试');
  console.log('='.repeat(60));
  console.log(`模型: ${CONFIG.model}`);
  console.log(`API: ${CONFIG.apiBaseUrl}`);
  console.log(`最大Token: ${CONFIG.maxTokens}`);
  console.log('='.repeat(60));

  // 测试1: 不带思考模式
  console.log('\n[测试1] 不带思考模式 - 多工具调用测试\n');

  const messages1 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT }
  ];

  try {
    const response1 = await callDeepSeekAPI(messages1, TOOLS, CONFIG.maxTokens);
    const toolCalls1 = extractToolCalls(response1);

    console.log(`工具调用数量: ${toolCalls1.length}`);
    console.log('\n调用的工具:');
    for (const tc of toolCalls1) {
      console.log(`  - ${tc.name}: ${JSON.stringify(tc.input.path || tc.input)}`);
    }

    if (toolCalls1.length > 1) {
      console.log('\n[PASS] 测试1通过！返回了多个工具调用');
    } else if (toolCalls1.length === 1) {
      console.log('\n[PARTIAL] 测试1部分通过：只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 测试1失败：没有返回工具调用');
      console.log('\n文本响应内容:');
      console.log(extractTextContent(response1));
    }

    // 显示完整响应用于调试
    console.log('\n--- 完整响应 ---');
    console.log(JSON.stringify(response1, null, 2).substring(0, 3000));
    console.log('----------------\n');

  } catch (error) {
    console.error(`[ERROR] 测试1出错: ${error.message}`);
  }

  // 测试2: 带思考模式
  console.log('='.repeat(60));
  console.log('[测试2] 带思考模式 (reasoning_effort: high) - 多工具调用测试\n');

  const messages2 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT }
  ];

  try {
    const response2 = await callDeepSeekAPI(
      messages2,
      TOOLS,
      CONFIG.maxTokens,
      { type: 'enabled', reasoning_effort: 'high' }
    );

    const toolCalls2 = extractToolCalls(response2);

    console.log(`工具调用数量: ${toolCalls2.length}`);
    console.log('\n调用的工具:');
    for (const tc of toolCalls2) {
      console.log(`  - ${tc.name}: ${JSON.stringify(tc.input.path || tc.input)}`);
    }

    if (toolCalls2.length > 1) {
      console.log('\n[PASS] 测试2通过！返回了多个工具调用');
    } else if (toolCalls2.length === 1) {
      console.log('\n[PARTIAL] 测试2部分通过：只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 测试2失败：没有返回工具调用');
      console.log('\n文本响应内容:');
      console.log(extractTextContent(response2));
    }

    // 显示完整响应用于调试
    console.log('\n--- 完整响应 ---');
    console.log(JSON.stringify(response2, null, 2).substring(0, 3000));
    console.log('----------------\n');

  } catch (error) {
    console.error(`[ERROR] 测试2出错: ${error.message}`);
  }

  // 测试3: 高 max_tokens 测试
  console.log('='.repeat(60));
  console.log('[测试3] 高 max_tokens (32768) - 多工具调用测试\n');

  const messages3 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT }
  ];

  try {
    const response3 = await callDeepSeekAPI(messages3, TOOLS, 32768);

    const toolCalls3 = extractToolCalls(response3);

    console.log(`工具调用数量: ${toolCalls3.length}`);
    console.log('\n调用的工具:');
    for (const tc of toolCalls3) {
      console.log(`  - ${tc.name}: ${JSON.stringify(tc.input.path || tc.input)}`);
    }

    if (toolCalls3.length > 1) {
      console.log('\n[PASS] 测试3通过！返回了多个工具调用');
    } else if (toolCalls3.length === 1) {
      console.log('\n[PARTIAL] 测试3部分通过：只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 测试3失败：没有返回工具调用');
    }

  } catch (error) {
    console.error(`[ERROR] 测试3出错: ${error.message}`);
  }

  console.log('='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTest().catch(console.error);
