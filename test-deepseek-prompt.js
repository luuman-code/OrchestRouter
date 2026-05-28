/**
 * DeepSeek 多工具调用测试脚本 - 基于 OrchestRouter 实际 Prompt
 *
 * 使用日志中记录的完整 system prompt 和 user prompt 来测试 DeepSeek 模型
 *
 * 运行方式: node test-deepseek-prompt.js
 */

const https = require('https');

// 测试配置
const CONFIG = {
  apiBaseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-pro',
  maxTokens: 32768  // 使用较大的 max_tokens
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

// SYSTEM PROMPT - 从日志中提取的完整内容
const SYSTEM_PROMPT = `## Output Rules
CRITICAL: Use write_file tool for EACH file listed below.
1. Generate complete code for ALL listed files using write_file tool
2. Import only from files in deliverables (no external deps, no separate CSS files)
3. No text output, comments, TODOs, or placeholders

## IMPLEMENTATION PLAN

### Tech Stack: React 18, TypeScript, Vite, Tailwind CSS, Node.js, Express, SQLite, better-sqlite3, JWT, bcrypt

### Architecture Patterns: 前后端分离, RESTful API, 分层架构, 依赖注入

### Code Completeness Rules:
- Complete imports/exports for every file
- No undeclared variables, functions, classes, or interfaces

### Naming Consistency Rules:
- Same concept must use same name across all files

### Module/Import Rules:
- Directory modules need entry files (index.ts for JS/TS, __init__.py for Python)
- Entry files must export all public APIs

### Frontend-Backend API Consistency:
- 前端调用 API 时使用的路径必须与后端路由注册路径完全一致
- 建议前后端使用统一的 API 路径约定（如 /api/resource/:id）
- 在生成前端代码前，确保后端路由已定义或使用与后端一致的路径

### SHARED CONTEXT (GLOBAL CONSTRAINTS - CRITICAL)

**Description**: 电商平台全局约束 - 所有子任务必须严格遵循

**TYPE DEFINITIONS** (MUST use these exact types, do NOT define custom versions):

\`User\`: {
  "description": "用户实体",
  "properties": {
    "id": "number",
    "name": "string",
    "email": "string",
    "password": "string"
  },
  "required": ["id", "email", "password"]
}

\`Product\`: {
  "description": "商品实体",
  "properties": {
    "id": "number",
    "name": "string",
    "description": "string",
    "price": "number",
    "category": "string",
    "imageUrl": "string"
  },
  "required": ["id", "name", "price"]
}

\`CartItem\`: {
  "description": "购物车项实体",
  "properties": {
    "id": "number",
    "userId": "number",
    "productId": "number",
    "quantity": "number"
  },
  "required": ["id", "userId", "productId", "quantity"]
}

\`Order\`: {
  "description": "订单实体",
  "properties": {
    "id": "number",
    "userId": "number",
    "items": "CartItem[]",
    "total": "number",
    "status": "string",
    "createdAt": "string"
  },
  "required": ["id", "userId", "total", "status"]
}

**API Configuration**:
- Base URL: \`http://localhost:3001/api\`
- Port: \`3001\`

### API Endpoints Contract (CRITICAL):
以下 API 端点契约定义了前端必须调用的路径和方法，后端必须实现这些路径：

**POST /api/auth/register**
- 用户注册
- 请求体: name: required, email: required, password: required

**POST /api/auth/login**
- 用户登录
- 请求体: email: required, password: required

**GET /api/auth/me**
- 获取当前用户信息
- 需要认证 (需要携带 token)

**GET /api/products**
- 获取商品列表（支持分类筛选）

**GET /api/products/:id**
- 获取商品详情
- URL 参数: id: from_url_params

**GET /api/cart**
- 获取用户购物车
- 需要认证 (需要携带 token)

**POST /api/cart**
- 添加商品到购物车
- 需要认证 (需要携带 token)
- 请求体: productId: required, quantity: optional_default_1

**PUT /api/cart/:productId**
- 更新购物车商品数量
- 需要认证 (需要携带 token)
- URL 参数: productId: from_url_params
- 请求体: quantity: required

**DELETE /api/cart/:productId**
- 从购物车删除商品
- 需要认证 (需要携带 token)
- URL 参数: productId: from_url_params

**DELETE /api/cart**
- 清空购物车
- 需要认证 (需要携带 token)

**GET /api/orders**
- 获取用户订单列表
- 需要认证 (需要携带 token)

**GET /api/orders/:id**
- 获取订单详情
- 需要认证 (需要携带 token)
- URL 参数: id: from_url_params

**POST /api/orders**
- 创建订单（从购物车）
- 需要认证 (需要携带 token)

**PATCH /api/orders/:id/status**
- 更新订单状态（管理员）
- 需要认证 (需要携带 token)
- URL 参数: id: from_url_params
- 请求体: status: required


### API Response Format Conventions (CRITICAL):
前端调用 API 时期望的返回格式约定：

**GET /api/products**: 直接返回 Product[] 数组，不是 { products: [...] }
**GET /api/orders**: 直接返回 Order[] 数组，不是 { orders: [...] }
**POST /api/orders**: 返回 { orderId: number, total: number }
**GET /api/cart**: 返回 { items: CartItem[], total: number }
**POST /api/auth/login**: 返回 { token: string, user: Omit<User, 'password'> }
**POST /api/auth/register**: 返回 { token: string, user: Omit<User, 'password'> }

**File Naming Constraints**:
- **FORBIDDEN files** (do NOT create these):
  - \`UserService.ts\` ⚠️
  - \`ProductService.ts\` ⚠️
  - \`CartService.ts\` ⚠️
  - \`OrderService.ts\` ⚠️
  - \`AuthService.ts\` ⚠️
  - \`DatabaseService.ts\` ⚠️
  - \`Utils.ts\` ⚠️
  - \`Helpers.ts\` ⚠️
  - \`Common.ts\` ⚠️

**TYPE SOURCE (MANDATORY)**:
- All types MUST be imported from: \`src/types/index.ts\`
- Do NOT define types locally in components
- Do NOT create duplicate type definitions

### MANDATORY RULES from Shared Context:
- ⚠️ 所有类型必须从 \`src/types/index.ts\` 导入
- ⚠️ 使用 shared_context.types 中定义的类型，禁止自定义重复类型
- ⚠️ 禁止创建以下文件: UserService.ts, ProductService.ts, CartService.ts, OrderService.ts, AuthService.ts, DatabaseService.ts, Utils.ts, Helpers.ts, Common.ts
- ⚠️ API Base URL: \`http://localhost:3001/api\`

### Best Practices (MANDATORY):
- 只生成 deliverables 指定的文件，不要生成其他文件
- 不要生成测试文件（*.test.js, *.spec.js）
- 不要生成示例文件或文档文件
- 返回完整代码，不要返回占位符或 TODO
- 类型定义必须从 shared_context.type_source 指向的文件导入
- 必须生成独立的页面组件文件（pages/ 目录下）
- App.tsx 只做路由分发和状态管理，不能包含具体页面JSX逻辑
- 每个页面组件必须单独一个文件，不能合并到 App.tsx 中
- 组件导入名称必须与文件名完全匹配（如 OrderList.tsx 必须导出为 OrderList）
- 禁止在 deliverables 之外生成组件或创建文件
- 禁止生成未在 deliverables 中定义的路由、上下文、工具函数或样式文件
- API 调用必须严格遵循 shared_context.api_endpoints 中定义的契约
- Node.js/Express 后端 .ts 文件使用 ES Module 时，必须使用 import.meta.url 获取 __dirname
- React 组件必须使用 props 接收数据，不自行从 localStorage/Context 读取
- 服务端启动文件（如 server/index.ts）必须确保依赖目录存在后再启动
- 必须根据 tech_stack 生成完整的构建配置文件（package.json, vite.config.js 等）
- 构建配置文件必须集中在 conflict_sensitive_groups 的同一个组中
- 使用 JWT 进行用户认证，token 放在 Authorization header 中
- 密码必须使用 bcrypt 加密存储


### Type Source (MANDATORY)
All types MUST be imported from: src/types/index.ts
Do NOT define types like User, Product in any other file.

### Files Generated by Other Groups (Reference Only)
Other groups will generate 31 files:
  - src/pages/Home.tsx
  - src/pages/Login.tsx
  - src/pages/Register.tsx
  - src/pages/ProductList.tsx
  - src/pages/ProductDetail.tsx
  - src/pages/Cart.tsx
  - src/pages/OrderList.tsx
  - src/pages/OrderDetail.tsx
  - src/components/Header.tsx
  - src/components/ProductCard.tsx
  - src/components/CartItem.tsx
  - src/components/Button.tsx
  - src/components/Input.tsx
  - src/components/Loading.tsx
  - src/components/Modal.tsx
  - server/middleware/auth.ts
  - server/routes/auth.ts
  - server/routes/cart.ts
  - server/routes/orders.ts
  - server/routes/products.ts
  ... and 11 more files

### Cross-Group Reference (CRITICAL)
- Files in this group can import each other
- For imports from OTHER groups, use correct relative paths
- If a file is needed but NOT in deliverables, DO NOT create it - skip that import or use empty implementation
## Issue Checklist (MANDATORY)
Generate .orchestrator/issues/001_问题清单.json using write_file tool.
Check: 1) API path match 2) Response format 3) Auth token 4) Type import consistency`;

// USER PROMPT - 从日志中提取的完整内容
const USER_PROMPT = `# Task: 电商平台系统

## Requirement
## 功能需求

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
1. [database] 数据库初始化和连接模块 -> FILE: server/database/db.ts
2. [logic] 后端服务入口，启动 Express 服务器 -> FILE: server/index.ts

## Output
Use write_file tool for EACH file above. After all files, generate:
.orchestrator/issues/001_问题清单.json`;

function callDeepSeekAPI(messages, tools, maxTokens, thinking = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;

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

    console.log('\n========== 发送的请求体 ==========');
    console.log(`model: ${body.model}`);
    console.log(`max_tokens: ${body.max_tokens}`);
    console.log(`system prompt 长度: ${systemPrompt.length}`);
    console.log(`messages 数量: ${body.messages.length}`);
    console.log(`thinking: ${JSON.stringify(thinking)}`);
    console.log('===================================\n');

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
  console.log('DeepSeek 多工具调用测试 - 基于 OrchestRouter 实际 Prompt');
  console.log('='.repeat(60));
  console.log(`模型: ${CONFIG.model}`);
  console.log(`API: ${CONFIG.apiBaseUrl}`);
  console.log(`最大Token: ${CONFIG.maxTokens}`);
  console.log(`System Prompt 长度: ${SYSTEM_PROMPT.length}`);
  console.log(`User Prompt 长度: ${USER_PROMPT.length}`);
  console.log('='.repeat(60));

  // 测试1: 不带思考模式
  console.log('\n[测试1] 不带思考模式 - 使用完整 OrchestRouter prompt\n');

  const messages1 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT }
  ];

  try {
    const response1 = await callDeepSeekAPI(messages1, TOOLS, CONFIG.maxTokens);
    const toolCalls1 = extractToolCalls(response1);

    console.log(`\n工具调用数量: ${toolCalls1.length}`);
    console.log('\n调用的工具:');
    for (const tc of toolCalls1) {
      const path = tc.input.path || tc.input.file_path || 'unknown';
      console.log(`  - ${tc.name}: ${path}`);
    }

    if (toolCalls1.length > 1) {
      console.log('\n[PASS] 测试1通过！返回了多个工具调用');
    } else if (toolCalls1.length === 1) {
      console.log('\n[PARTIAL] 测试1部分通过：只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 测试1失败：没有返回工具调用');
      console.log('\n文本响应内容:');
      console.log(extractTextContent(response1).substring(0, 1000));
    }

    // 显示 usage 信息
    if (response1.usage) {
      console.log('\n--- Token 使用情况 ---');
      console.log(`input_tokens: ${response1.usage.input_tokens}`);
      console.log(`output_tokens: ${response1.usage.output_tokens}`);
      console.log('---------------------\n');
    }

  } catch (error) {
    console.error(`[ERROR] 测试1出错: ${error.message}`);
  }

  // 测试2: 带思考模式
  console.log('='.repeat(60));
  console.log('[测试2] 带思考模式 (reasoning_effort: high) - 使用完整 OrchestRouter prompt\n');

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

    console.log(`\n工具调用数量: ${toolCalls2.length}`);
    console.log('\n调用的工具:');
    for (const tc of toolCalls2) {
      const path = tc.input.path || tc.input.file_path || 'unknown';
      console.log(`  - ${tc.name}: ${path}`);
    }

    if (toolCalls2.length > 1) {
      console.log('\n[PASS] 测试2通过！返回了多个工具调用');
    } else if (toolCalls2.length === 1) {
      console.log('\n[PARTIAL] 测试2部分通过：只返回了1个工具调用');
    } else {
      console.log('\n[FAIL] 测试2失败：没有返回工具调用');
      console.log('\n文本响应内容:');
      console.log(extractTextContent(response2).substring(0, 1000));
    }

    // 显示 usage 信息
    if (response2.usage) {
      console.log('\n--- Token 使用情况 ---');
      console.log(`input_tokens: ${response2.usage.input_tokens}`);
      console.log(`output_tokens: ${response2.usage.output_tokens}`);
      console.log('---------------------\n');
    }

  } catch (error) {
    console.error(`[ERROR] 测试2出错: ${error.message}`);
  }

  console.log('='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTest().catch(console.error);
