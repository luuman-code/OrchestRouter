/**
 * DeepSeek 多工具调用对比测试
 *
 * 对比简化 prompt 和完整 OrchestRouter prompt 的效果差异
 */

const https = require('https');

const CONFIG = {
  apiBaseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-pro',
  maxTokens: 32768
};

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

function callDeepSeekAPI(messages, tools, maxTokens, thinking = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-4ae354108bc04a97bc3dd197f0e6cc00';

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

    if (systemPrompt) {
      body.system = systemPrompt;
    }

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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        } else {
          reject(new Error(`API Error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (e) => { reject(new Error(`Request error: ${e.message}`)); });
    req.write(bodyString);
    req.end();
  });
}

function extractToolCalls(response) {
  const toolCalls = [];
  if (response.content && Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({ name: block.name, input: block.input, id: block.id });
      }
    }
  }
  return toolCalls;
}

// 简化的 system prompt
const SIMPLE_SYSTEM_PROMPT = `你是一个代码生成助手。你必须使用提供的工具来完成任务。

当需要生成多个文件时，你应该在一个响应中返回多个 write_file 工具调用。`;

// 简化的 user prompt
const SIMPLE_USER_PROMPT = `请为以下项目结构生成代码：

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

// 完整的 OrchestRouter system prompt (截取关键部分)
const ORCHESTRATOR_SYSTEM_PROMPT = `## Output Rules
CRITICAL: Use write_file tool for EACH file listed below.
1. Generate complete code for ALL listed files using write_file tool
2. Import only from files in deliverables (no external deps, no separate CSS files)
3. No text output, comments, TODOs, or placeholders

## SHARED CONTEXT (GLOBAL CONSTRAINTS - CRITICAL)
**Description**: 电商平台全局约束 - 所有子任务必须严格遵循

**TYPE DEFINITIONS** (MUST use these exact types, do NOT define custom versions):
\`User\`: {"id": "number", "name": "string", "email": "string", "password": "string"}
\`Product\`: {"id": "number", "name": "string", "price": "number"}
\`CartItem\`: {"id": "number", "userId": "number", "productId": "number", "quantity": "number"}
\`Order\`: {"id": "number", "userId": "number", "total": "number", "status": "string"}

**API Configuration**:
- Base URL: \`http://localhost:3001/api\`
- Port: \`3001\`

### API Endpoints Contract (CRITICAL):
**POST /api/auth/register** - 用户注册
**POST /api/auth/login** - 用户登录
**GET /api/auth/me** - 获取当前用户信息
**GET /api/products** - 获取商品列表
**GET /api/cart** - 获取购物车
**POST /api/orders** - 创建订单

### Best Practices (MANDATORY):
- 只生成 deliverables 指定的文件，不要生成其他文件
- 不要生成测试文件
- 返回完整代码，不要返回占位符或 TODO
- 组件导入名称必须与文件名完全匹配
- 使用 JWT 进行用户认证，token 放在 Authorization header 中
- 密码必须使用 bcrypt 加密存储

### Type Source (MANDATORY)
All types MUST be imported from: src/types/index.ts
Do NOT define types like User, Product in any other file.

## Issue Checklist (MANDATORY)
Generate .orchestrator/issues/001_问题清单.json using write_file tool.`;

// Orchestrator user prompt (简化版)
const ORCHESTRATOR_USER_PROMPT = `# Task: 电商平台系统

## Files to Generate
1. [database] 数据库初始化和连接模块 -> FILE: server/database/db.ts
2. [logic] 后端服务入口，启动 Express 服务器 -> FILE: server/index.ts

## Output
Use write_file tool for EACH file above. After all files, generate:
.orchestrator/issues/001_问题清单.json`;

async function runTest(name, systemPrompt, userPrompt, thinking = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${name}]`);
  console.log('='.repeat(60));
  console.log(`System prompt 长度: ${systemPrompt.length}`);
  console.log(`User prompt 长度: ${userPrompt.length}`);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await callDeepSeekAPI(messages, TOOLS, CONFIG.maxTokens, thinking);
    const toolCalls = extractToolCalls(response);

    console.log(`\n工具调用数量: ${toolCalls.length}`);
    for (const tc of toolCalls) {
      const path = tc.input.path || tc.input.file_path || 'unknown';
      console.log(`  - ${tc.name}: ${path}`);
    }

    if (response.usage) {
      console.log(`\nToken 使用: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
    }

    if (toolCalls.length > 1) {
      console.log('\n[PASS]');
    } else if (toolCalls.length === 1) {
      console.log('\n[PARTIAL] 只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 没有返回工具调用');
    }

    return toolCalls.length;

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    return -1;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('DeepSeek 多工具调用对比测试');
  console.log('='.repeat(60));

  // 测试1: 简化 prompt
  await runTest(
    '测试1: 简化 prompt (无思考模式)',
    SIMPLE_SYSTEM_PROMPT,
    SIMPLE_USER_PROMPT,
    null
  );

  // 测试2: 简化 prompt + 思考模式
  await runTest(
    '测试2: 简化 prompt (有思考模式)',
    SIMPLE_SYSTEM_PROMPT,
    SIMPLE_USER_PROMPT,
    { type: 'enabled', reasoning_effort: 'high' }
  );

  // 测试3: Orchestrator 完整 prompt
  await runTest(
    '测试3: Orchestrator 完整 prompt (无思考模式)',
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_USER_PROMPT,
    null
  );

  // 测试4: Orchestrator 完整 prompt + 思考模式
  await runTest(
    '测试4: Orchestrator 完整 prompt (有思考模式)',
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_USER_PROMPT,
    { type: 'enabled', reasoning_effort: 'high' }
  );

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

main().catch(console.error);
