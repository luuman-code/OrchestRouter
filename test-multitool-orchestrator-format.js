/**
 * MiniMax Multi-Tool Call 测试脚本 - 编排器格式
 *
 * 使用与编排器完全相同的 prompt 格式测试 MiniMax-M2.5
 */

const https = require('https');

// API 配置
const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const API_URL = 'api.minimaxi.com';
const API_PATH = '/anthropic/v1/messages';
const MODEL = 'MiniMax-M2.5';

// 测试用的工具定义（与 PromptGenerator.js 中的 CODE_GENERATION_TOOLS 一致）
const TOOLS = [
  {
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
  }
];

// System Prompt - 极简版
const SYSTEM_PROMPT = `You are a code generation assistant.

Generate the files listed in the user message. Use the write_file tool for EACH file listed.
Return ALL tool calls in ONE single response.
Do not return any text or comments.`;

// User Prompt - 重建 path_affinity 任务的完整 prompt
const USER_PROMPT = `# Task: 电商平台完整开发

## Requirement
前后端分离架构的电商平台。前端使用 React 18 + TypeScript + Vite + Tailwind CSS，后端使用 Node.js + Express + SQLite。

功能需求：
1. 用户认证：注册、登录（JWT token）
2. 商品浏览：商品列表、详情、分类
3. 购物车：添加、删除、修改数量
4. 订单管理：下单、订单列表、订单详情

技术栈：
- 前端：React 18 + TypeScript + Vite + Tailwind CSS
- 后端：Node.js + Express + SQLite
- 认证：JWT

## Files to Generate
1. [config] 项目构建配置 - package.json -> FILE: package.json
2. [config] Vite 配置 -> FILE: vite.config.js
3. [config] Tailwind CSS 配置 -> FILE: tailwind.config.js
4. [config] PostCSS 配置 -> FILE: postcss.config.js
5. [config] TypeScript 配置 -> FILE: tsconfig.json
6. [style] 全局样式文件 -> FILE: src/index.css

## Type Source
All types MUST be imported from: src/types/index.ts
Do NOT define types like User, Product in any other file.

### Type Source
All types MUST be imported from: src/types/index.ts
Do NOT define types like User, Product in any other file.

## Implementation Plan
tech_stack: React 18, TypeScript, Node.js, Express, SQLite, Vite, Tailwind CSS
architecture_patterns: 前后端分离, RESTful API, 分层架构, BFF模式

## Output
IMPORTANT: Return write_file tool calls for ALL files in ONE single response.
- Do NOT return files one by one
- Do NOT split the response
- Return ALL write_file calls together in a SINGLE response

After generating all files, you MUST also generate an issue checklist at:
.orchestrator/issues/001_问题清单.json

This checklist helps identify: (1) potential conflicts with other models' files, (2) dependency issues, (3) self-optimization opportunities in the generated code.`;

/**
 * 发送 HTTP 请求
 */
function sendRequest(url, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://${url}${path}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
        ...headers
      }
    };

    console.log(`\n========== 发送请求到 ${url}${path} ==========`);
    console.log(`Method: ${method}`);
    console.log(`Model: ${MODEL}`);
    console.log(`System prompt length: ${SYSTEM_PROMPT.length}`);
    console.log(`User prompt length: ${USER_PROMPT.length}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Response Status: ${res.statusCode}`);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(300000); // 5分钟超时

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 构建 Anthropic 格式的请求体
 */
function buildAnthropicRequest(model, systemPrompt, userPrompt, tools) {
  return {
    model: model,
    max_tokens: 32768,
    temperature: 0.7,  // 使用较低温度减少随机性
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userPrompt }]
      }
    ],
    tools: tools
  };
}

/**
 * 解析响应
 */
function parseResponse(responseData) {
  try {
    const parsed = JSON.parse(responseData);
    return parsed;
  } catch (e) {
    console.error('Failed to parse response:', e.message);
    return null;
  }
}

/**
 * 统计工具调用
 */
function countToolCalls(response) {
  if (!response || !response.content) {
    return { total: 0, write_file: 0 };
  }

  const content = response.content;
  const counts = {
    total: content.length,
    write_file: 0
  };

  content.forEach(item => {
    if (item.type === 'tool_use') {
      if (item.name === 'write_file') counts.write_file++;
    }
  });

  return counts;
}

/**
 * 运行测试
 */
async function runTest() {
  console.log('========================================');
  console.log('MiniMax Multi-Tool Call 测试 - 编排器格式');
  console.log('========================================');
  console.log(`Model: ${MODEL}`);
  console.log(`API URL: ${API_URL}${API_PATH}`);

  // 构建请求
  const requestBody = buildAnthropicRequest(
    MODEL,
    SYSTEM_PROMPT,
    USER_PROMPT,
    TOOLS
  );

  console.log('\n---------- 请求体预览 ----------');
  console.log(`max_tokens: ${requestBody.max_tokens}`);
  console.log(`messages 数量: ${requestBody.messages.length}`);
  console.log(`tools 数量: ${requestBody.tools.length}`);
  console.log('\n--- User Prompt 内容预览 ---');
  console.log(USER_PROMPT.substring(0, 500) + '...');

  try {
    // 发送请求
    const response = await sendRequest(
      API_URL,
      API_PATH,
      'POST',
      {},
      requestBody
    );

    console.log('\n---------- 响应 ----------');
    console.log(`Status: ${response.status}`);

    const parsedResponse = parseResponse(response.data);
    if (!parsedResponse) {
      console.log('Raw Response:', response.data.substring(0, 2000));
      return;
    }

    console.log('\n---------- 响应内容 ----------');
    console.log(JSON.stringify(parsedResponse, null, 2).substring(0, 3000));

    // 分析工具调用
    if (parsedResponse.content) {
      const counts = countToolCalls(parsedResponse);
      console.log('\n========================================');
      console.log('工具调用统计:');
      console.log(`  总 content 块数: ${counts.total}`);
      console.log(`  write_file 调用: ${counts.write_file}`);
      console.log('========================================');

      if (counts.write_file >= 6) {
        console.log('\n✅ 测试通过: 模型返回了 6 个 write_file 调用');
      } else if (counts.write_file === 0) {
        console.log('\n❌ 测试失败: 模型没有返回工具调用');
      } else {
        console.log(`\n⚠️ 部分成功: 模型返回了 ${counts.write_file} 个 write_file 调用，预期 6 个`);
      }

      // 显示具体的工具调用
      console.log('\n---------- 工具调用详情 ----------');
      parsedResponse.content.forEach((item, index) => {
        if (item.type === 'tool_use') {
          console.log(`\n[${index + 1}] Tool: ${item.name}`);
          if (item.input) {
            const input = typeof item.input === 'string' ? JSON.parse(item.input) : item.input;
            console.log(`    file_path: ${input.file_path || 'N/A'}`);
            console.log(`    content 长度: ${input.content?.length || 0}`);
          }
        } else if (item.type === 'text') {
          console.log(`\n[${index + 1}] Text: ${item.text?.substring(0, 200)}...`);
        }
      });
    }

    // 显示 usage
    if (parsedResponse.usage) {
      console.log('\n---------- 使用量 ----------');
      console.log(JSON.stringify(parsedResponse.usage, null, 2));
    }

    // 显示 finish_reason
    if (parsedResponse.choices?.[0]?.finish_reason) {
      console.log(`\nfinish_reason: ${parsedResponse.choices[0].finish_reason}`);
    }

    // 显示思考内容
    parsedResponse.content.forEach((item, index) => {
      if (item.type === 'thinking') {
        console.log('\n========== 思考内容 ==========');
        console.log(item.thinking);
        console.log('========== 思考内容结束 ==========\n');
      }
    });

  } catch (error) {
    console.error('\n========== 请求错误 ==========');
    console.error(error.message);
  }
}

// 运行测试
runTest();
