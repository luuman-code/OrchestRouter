/**
 * DeepSeek 多工具调用测试 - 简化 Prompt 版 v2
 *
 * 增强版：明确要求模型在一个响应中返回多个 write_file 调用
 *
 * 运行方式: node test-deepseek-simplified-prompt.js
 */

const https = require('https');

// 测试配置
const CONFIG = {
  apiBaseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-pro',
  maxTokens: 32768
};

// 工具定义
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

// =====================================================
// 简化版 System Prompt (增强多工具调用指令)
// =====================================================
const SIMPLE_SYSTEM_PROMPT = `You are a code generation assistant.

## Output Rules
CRITICAL: You MUST use write_file tool for EACH file listed below.
1. Generate complete code for ALL files using write_file tool
2. Return ALL write_file calls in a SINGLE response (not one by one)
3. No text output, comments, TODOs, or placeholders

## Issue Checklist (MANDATORY)
After generating all files, generate:
.orchestrator/issues/001_问题清单.json`;

// =====================================================
// 简化版 User Prompt (增强多文件要求)
// =====================================================
const SIMPLE_USER_PROMPT = `# Task: 电商平台系统

## Requirement
创建数据库初始化模块和后端服务入口

## Files to Generate
You MUST generate ALL files below using write_file tool and return them ALL in one response:

1. FILE: server/database/db.ts
   - Description: 数据库初始化和连接模块
   - Include: SQLite 数据库连接, 初始化表结构

2. FILE: server/index.ts
   - Description: 后端服务入口，启动 Express 服务器
   - Include: Express 服务器配置, 路由注册, 端口监听

## Implementation Plan
- Tech Stack: Node.js, Express, SQLite, better-sqlite3
- Port: 3001

## Output Format
Return write_file tool calls for BOTH files in a SINGLE response:
- First: write_file for server/database/db.ts
- Second: write_file for server/index.ts
- Third: write_file for .orchestrator/issues/001_问题清单.json

IMPORTANT: Do NOT return files one by one. Return ALL file tool calls in ONE response.`;

// =====================================================
// 完整版 System Prompt (对比测试)
// =====================================================
const FULL_SYSTEM_PROMPT = `You are a code generation assistant.

## Output Rules
CRITICAL: Use write_file tool for EACH file listed below.
1. Generate complete code for ALL listed files using write_file tool
2. Import only from files in deliverables (no external deps, no separate CSS files)
3. No text output, comments, TODOs, or placeholders
4. Return ALL write_file calls in ONE response

## Implementation Plan
### Tech Stack: React 18, TypeScript, Vite, Tailwind CSS, Node.js, Express, SQLite, better-sqlite3, JWT, bcrypt

### Architecture Patterns: 前后端分离, RESTful API, 分层架构

### Code Completeness Rules:
- Complete imports/exports for every file
- No undeclared variables, functions, classes, or interfaces

### Naming Consistency Rules:
- Same concept must use same name across all files

### Module/Import Rules:
- Directory modules need entry files (index.ts for JS/TS, __init__.py for Python)
- Entry files must export all public APIs

### SHARED CONTEXT (GLOBAL CONSTRAINTS - CRITICAL)

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
Generate .orchestrator/issues/001_问题清单.json using write_file tool.
Check: 1) API path match 2) Response format 3) Auth token 4) Type import consistency`;

// 完整版 User Prompt
const FULL_USER_PROMPT = `# Task: 电商平台系统

## Requirement

### 1. 用户认证模块
- 用户注册（name, email, password）
- 用户登录（email, password）
- 获取当前用户信息
- JWT token 认证

### 2. 商品管理模块
- 商品列表查询（支持分类筛选、搜索、分页）
- 商品详情查看

### 3. 购物车模块
- 获取购物车列表
- 添加商品到购物车
- 修改商品数量
- 删除购物车商品
- 清空购物车

### 4. 订单模块
- 创建订单（从购物车）
- 订单列表查询
- 订单详情查看
- 订单状态更新（管理员）

### 5. 数据初始化
- 数据库初始化脚本
- 预置商品数据

## 技术要求
- 后端：Node.js + Express + better-sqlite3 + JWT + bcrypt
- 前端：React 18 + TypeScript + Vite + Tailwind CSS
- 端口：后端 3001，前端 5173
- 前后端分离，通过 RESTful API 通信

## Files to Generate
You MUST return write_file calls for ALL files in ONE response:

1. FILE: server/database/db.ts
   - 数据库初始化和连接模块

2. FILE: server/index.ts
   - 后端服务入口，启动 Express 服务器

## Output
After generating all files, generate:
.orchestrator/issues/001_问题清单.json

IMPORTANT: Return ALL write_file tool calls in ONE response.`;

// =====================================================
// 极简测试 (仅测试多工具调用)
// =====================================================
const MINIMAL_SYSTEM_PROMPT = `You are a code generation assistant.
Use write_file tool to create files.`;

const MINIMAL_USER_PROMPT = `Create these 3 files in ONE response:
1. FILE: src/utils/helpers.ts - add function add(a,b) and subtract(a,b)
2. FILE: src/utils/validators.ts - add function isEmail(email) and isUrl(url)
3. FILE: src/constants.ts - APP_NAME="TestApp", VERSION="1.0.0"

Return write_file tool calls for ALL 3 files in ONE response. Do not split them.`;

// =====================================================
// 多文件输出格式示例
// =====================================================
const FORMAT_EXAMPLE_SYSTEM = `You are a code generation assistant.

## CRITICAL: Multi-File Output Rule
When the user asks for multiple files, you MUST return write_file tool calls for ALL files in ONE single response.

Example correct output:
[TOOL_CALL]
{"name": "write_file", "input": {"path": "file1.ts", "content": "..."}}
{"name": "write_file", "input": {"path": "file2.ts", "content": "..."}}
[/TOOL_CALL]

Do NOT output files one by one. Output ALL files in ONE response.`;

const FORMAT_EXAMPLE_USER = `Create 2 files:
1. src/utils/math.ts - function multiply(a,b)
2. src/utils/string.ts - function capitalize(str)

Return write_file tool calls for BOTH files in ONE response.`;

// =====================================================
// 超级简单测试
// =====================================================
const SUPER_SIMPLE_USER = `Create files:
1. src/utils/helpers.ts with function add(a: number, b: number): number { return a + b; }
2. src/utils/validators.ts with function isEmail(email: string): boolean { return email.includes('@'); }

Use write_file tool for both files in one response.`;

function callDeepSeekAPI(messages, tools, maxTokens, thinking = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;

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

    console.log('\n========== 请求信息 ==========');
    console.log(`System prompt 长度: ${systemPrompt.length}`);
    console.log(`User prompt 长度: ${filteredMessages[0]?.content?.length || 0}`);
    console.log('==============================\n');

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
          reject(new Error(`API Error: ${res.statusCode} - ${data.substring(0, 500)}`));
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

async function runTest(name, systemPrompt, userPrompt, thinking = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${name}]`);
  console.log('='.repeat(60));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await callDeepSeekAPI(messages, TOOLS, CONFIG.maxTokens, thinking);
    const toolCalls = extractToolCalls(response);

    console.log(`工具调用数量: ${toolCalls.length}`);
    for (const tc of toolCalls) {
      const path = tc.input.path || tc.input.file_path || 'unknown';
      console.log(`  - ${tc.name}: ${path}`);
    }

    if (response.usage) {
      console.log(`Token: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
    }

    if (toolCalls.length > 1) {
      console.log('\n[PASS] 返回了多个工具调用');
    } else if (toolCalls.length === 1) {
      console.log('\n[PARTIAL] 只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 没有返回工具调用');
      const text = extractTextContent(response);
      if (text) console.log('文本响应:', text.substring(0, 300));
    }

    return toolCalls.length;

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    return -1;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('DeepSeek 多工具调用测试 - 简化 Prompt 版 v2');
  console.log('='.repeat(60));
  console.log(`模型: ${CONFIG.model}`);

  const results = [];

  // 测试1: 极简 prompt (无思考模式)
  results.push(await runTest(
    '测试1: 极简 Prompt',
    MINIMAL_SYSTEM_PROMPT,
    MINIMAL_USER_PROMPT,
    null
  ));

  // 测试2: 极简 prompt (有思考模式)
  results.push(await runTest(
    '测试2: 极简 Prompt + 思考模式',
    MINIMAL_SYSTEM_PROMPT,
    MINIMAL_USER_PROMPT,
    { type: 'enabled', reasoning_effort: 'high' }
  ));

  // 测试3: 格式示例 prompt (无思考模式)
  results.push(await runTest(
    '测试3: 格式示例 Prompt',
    FORMAT_EXAMPLE_SYSTEM,
    FORMAT_EXAMPLE_USER,
    null
  ));

  // 测试4: 格式示例 prompt (有思考模式)
  results.push(await runTest(
    '测试4: 格式示例 Prompt + 思考模式',
    FORMAT_EXAMPLE_SYSTEM,
    FORMAT_EXAMPLE_USER,
    { type: 'enabled', reasoning_effort: 'high' }
  ));

  // 测试5: 超级简单测试
  results.push(await runTest(
    '测试5: 超级简单测试',
    SIMPLE_SYSTEM_PROMPT,
    SUPER_SIMPLE_USER,
    null
  ));

  // 测试6: 超级简单测试 + 思考模式
  results.push(await runTest(
    '测试6: 超级简单测试 + 思考模式',
    SIMPLE_SYSTEM_PROMPT,
    SUPER_SIMPLE_USER,
    { type: 'enabled', reasoning_effort: 'high' }
  ));

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));

  const passCount = results.filter(r => r > 1).length;
  console.log(`\n通过数: ${passCount}/${results.length}`);

  if (passCount === 0) {
    console.log('\n结论: DeepSeek 模型在当前测试中未能返回多个工具调用');
    console.log('可能原因:');
    console.log('1. 模型默认行为是逐个返回工具调用');
    console.log('2. 需要特定的多工具调用格式或前缀');
    console.log('3. 需要配置 max_tokens 或其他参数');
  }
}

main().catch(console.error);
