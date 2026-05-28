/**
 * 契约生成优化测试脚本
 *
 * 测试不同的优化策略对契约生成耗时和质量的影响
 *
 * 运行方式:
 *   node test-contract-generation-optimization.js [策略编号]
 *
 * 策略:
 *   0 - 原始配置 (thinking: true, effort: high, maxTokens: 393000)
 *   1 - 关闭思考模式 (thinking: false)
 *   2 - 降低思考强度 (thinking: true, effort: low)
 *   3 - 减少 maxTokens (thinking: true, effort: high, maxTokens: 50000)
 *   4 - 并行生成 (两个独立请求)
 *   5 - 综合优化 (thinking: true, effort: low, maxTokens: 100000)
 */

const DeepSeekLLMClient = require('./src/decomposer/llm/DeepSeekLLMClient');
const fs = require('fs');
const path = require('path');

// 测试用的电商平台请求
const testRequest = {
  task: {
    title: "电商平台开发",
    requirement: "生成 deliverables 列表中指定的文件"
  },
  implementation_plan: {
    tech_stack: ["React 18", "TypeScript", "Vite", "Tailwind CSS", "Node.js", "Express", "SQLite"],
    contract_first: true,
    shared_context: {
      description: "完整电商系统 - 包含用户认证、商品浏览、购物车、订单管理",
      type_source: "src/types/index.ts",
      api_config: {
        baseURL: "http://localhost:3001/api",
        port: 3001
      },
      api_endpoints: [
        { path: "/api/auth/register", method: "POST", description: "用户注册", auth: false },
        { path: "/api/auth/login", method: "POST", description: "用户登录", auth: false },
        { path: "/api/products", method: "GET", description: "获取商品列表", auth: false },
        { path: "/api/cart", method: "GET", description: "获取购物车", auth: true },
        { path: "/api/orders", method: "GET", description: "获取订单列表", auth: true }
      ]
    },
    conflict_sensitive_groups: [
      {
        description: "共享类型定义",
        strategy: "strong_coupling",
        priority: 100,
        mergeMode: "selected_only",
        files: ["types/index.ts"]
      },
      {
        description: "项目构建配置",
        strategy: "path_affinity",
        priority: 90,
        files: ["package.json", "vite.config.js", "tailwind.config.js"]
      }
    ]
  },
  task_details: {
    deliverables: [
      { filePath: "server/database/db.ts", type: "logic", description: "数据库初始化" },
      { filePath: "server/index.ts", type: "logic", description: "后端入口" },
      { filePath: "server/routes/auth.ts", type: "api", description: "认证路由" },
      { filePath: "server/routes/products.ts", type: "api", description: "商品路由" },
      { filePath: "server/routes/cart.ts", type: "api", description: "购物车路由" },
      { filePath: "server/routes/orders.ts", type: "api", description: "订单路由" },
      { filePath: "src/App.tsx", type: "ui", description: "React App 组件" },
      { filePath: "src/main.tsx", type: "ui", description: "React 主入口" },
      { filePath: "src/services/api.ts", type: "logic", description: "API 服务层" },
      { filePath: "src/pages/Home.tsx", type: "ui", description: "首页" },
      { filePath: "src/pages/Login.tsx", type: "ui", description: "登录页" },
      { filePath: "src/pages/Register.tsx", type: "ui", description: "注册页" },
      { filePath: "src/pages/ProductList.tsx", type: "ui", description: "商品列表页" },
      { filePath: "src/pages/ProductDetail.tsx", type: "ui", description: "商品详情页" },
      { filePath: "src/pages/Cart.tsx", type: "ui", description: "购物车页" },
      { filePath: "src/pages/OrderList.tsx", type: "ui", description: "订单列表页" },
      { filePath: "src/components/Header.tsx", type: "ui", description: "页头组件" },
      { filePath: "src/components/ProductCard.tsx", type: "ui", description: "商品卡片组件" },
      { filePath: "src/components/CartItem.tsx", type: "ui", description: "购物车项组件" },
      { filePath: "src/components/Button.tsx", type: "ui", description: "按钮组件" },
      { filePath: "src/components/Input.tsx", type: "ui", description: "输入框组件" }
    ]
  }
};

// 获取 DeepSeek 配置
function getDeepSeekConfig() {
  // 从环境变量或配置中获取
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com'
  };
}

// 构建契约生成 Prompt
function buildContractPrompt(task, implementationPlan, deliverables) {
  const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
  const requirements = task.requirement || task.title || '未提供需求描述';

  const fileList = deliverables.map(d => {
    const filePath = d.filePath || 'unknown';
    const description = d.description || '无描述';
    const type = d.type || 'general';
    return `- [${type}] ${filePath}: ${description}`;
  }).join('\n');

  const tsFiles = deliverables
    .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
    .map(d => d.filePath);

  return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}

## 待生成文件列表
${fileList}

## 【重要】必须为以下所有 TypeScript 文件生成类型定义分组
${tsFiles.join('\n')}

## 输出要求

【关键】你必须一次性调用 write_file 工具两次，同时生成以下两个文件：

1. write_file 工具调用 #1 - 契约文件 (分组文本):
   - file_path: "contracts/api.txt"
   - content: API 契约分组文本，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

2. write_file 工具调用 #2 - 类型定义文件:
   - file_path: "types/index.ts"
   - content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 类型定义格式示例

\`\`\`typescript
// [COMMON]
export interface ApiError {
  code: string;
  message: string;
}
export interface SuccessResponse {
  success: true;
  message: string;
}

// [FILE: src/stores/userStore.ts]
export interface User {
  id: string;
  name: string;
  email: string;
}

// [FILE: src/pages/Home.tsx]
export interface HomePageData {
  featuredProducts: Product[];
  categories: Category[];
}
\`\`\`

## 契约分组格式示例

\`\`\`typescript
// [COMMON]
shared schemas:
- ApiError: { code: string, message: string }
- SuccessResponse: { success: true, message: string }

// [FILE: server/routes/auth.ts]
// - POST /auth/register - 用户注册
// - POST /auth/login - 用户登录

// [FILE: server/routes/products.ts]
// - GET /products - 获取产品列表
// - GET /products/:id - 获取产品详情
\`\`\`

## 【关键要求】

1. 必须为所有文件生成分组 - 包括所有 TypeScript 文件
2. // [FILE: <path>] 中的 <path> 必须与待生成文件列表中的路径完全一致
3. 不要遗漏任何文件

## 示例响应格式

tool_calls: [
  {
    "name": "write_file",
    "arguments": {"file_path": "contracts/api.txt", "content": "// [COMMON]\n..."}
  },
  {
    "name": "write_file",
    "arguments": {"file_path": "types/index.ts", "content": "// [COMMON]\n..."}
  }
]

请立即生成这两个文件，确保为所有文件都生成了类型定义分组和契约分组，不要遗漏任何文件。`;
}

// 构建类型文件单独生成的 Prompt
function buildTypesOnlyPrompt(task, implementationPlan, deliverables) {
  const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
  const requirements = task.requirement || task.title || '未提供需求描述';

  const tsFiles = deliverables
    .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
    .map(d => d.filePath);

  return `你是架构师，负责为以下需求生成 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}

## 【重要】必须为以下所有 TypeScript 文件生成类型定义分组
${tsFiles.join('\n')}

## 输出要求

调用 write_file 工具生成类型定义文件:

- file_path: "types/index.ts"
- content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 类型定义格式示例

\`\`\`typescript
// [COMMON]
export interface ApiError {
  code: string;
  message: string;
}
export interface SuccessResponse {
  success: true;
  message: string;
}

// [FILE: src/stores/userStore.ts]
export interface User {
  id: string;
  name: string;
  email: string;
}

// [FILE: src/pages/Home.tsx]
export interface HomePageData {
  featuredProducts: Product[];
  categories: Category[];
}
\`\`\`

## 【关键要求】

1. 必须为所有文件生成分组 - 包括所有 TypeScript 文件
2. // [FILE: <path>] 中的 <path> 必须与上述列表中的路径完全一致
3. 不要遗漏任何文件

请立即生成类型定义文件。`;
}

// 构建契约文件单独生成的 Prompt
function buildContractOnlyPrompt(task, implementationPlan, deliverables) {
  const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
  const requirements = task.requirement || task.title || '未提供需求描述';

  const fileList = deliverables.map(d => {
    const filePath = d.filePath || 'unknown';
    const description = d.description || '无描述';
    return `- ${filePath}: ${description}`;
  }).join('\n');

  return `你是架构师，负责为以下需求生成 API 契约文本。

## 技术栈
${techStack}

## 需求描述
${requirements}

## 待生成文件
${fileList}

## 输出要求

调用 write_file 工具生成契约文件:

- file_path: "contracts/api.txt"
- content: API 契约分组文本，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 契约分组格式示例

\`\`\`typescript
// [COMMON]
shared schemas:
- ApiError: { code: string, message: string }
- SuccessResponse: { success: true, message: string }

// [FILE: server/routes/auth.ts]
// - POST /auth/register - 用户注册
// - POST /auth/login - 用户登录

// [FILE: server/routes/products.ts]
// - GET /products - 获取产品列表
// - GET /products/:id - 获取产品详情
\`\`\`

## 【关键要求】

1. 必须为所有文件生成分组
2. // [FILE: <path>] 中的 <path> 必须与待生成文件列表中的路径完全一致
3. 不要遗漏任何文件

请立即生成契约文件。`;
}

// 提取工具调用
function extractToolCalls(result) {
  const openapiContent = null;
  const typesContent = null;

  if (result.toolCalls && Array.isArray(result.toolCalls)) {
    for (const toolCall of result.toolCalls) {
      const name = toolCall.name || toolCall.function?.name;
      let args = toolCall.arguments || toolCall.function?.arguments;

      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch (e) {
          continue;
        }
      }

      if (name === 'write_file' && args?.file_path && args?.content) {
        const filePath = args.file_path;
        if (filePath.includes('contracts/api.txt')) {
          return { contract: args.content, types: openapiContent, filePath };
        } else if (filePath.includes('types/index.ts')) {
          return { contract: openapiContent, types: args.content, filePath };
        }
      }
    }
  }

  return { contract: null, types: null };
}

// 验证生成结果
function validateResult(result, strategyName) {
  const validations = [];
  let isValid = true;

  // 检查契约内容
  if (result.contract) {
    const hasCommon = result.contract.includes('// [COMMON]') || result.contract.includes('[COMMON]');
    const hasFileMarkers = (result.contract.match(/\/\/ \[FILE:/g) || []).length;
    validations.push({
      name: '契约分组格式',
      passed: hasCommon && hasFileMarkers > 0,
      details: `Common: ${hasCommon}, File标记: ${hasFileMarkers}个`
    });
    if (!hasCommon || hasFileMarkers === 0) isValid = false;
  } else {
    validations.push({ name: '契约内容', passed: false, details: '未生成契约' });
    isValid = false;
  }

  // 检查类型内容
  if (result.types) {
    const hasCommon = result.types.includes('// [COMMON]') || result.types.includes('[COMMON]');
    const hasFileMarkers = (result.types.match(/\/\/ \[FILE:/g) || []).length;
    const hasExport = result.types.includes('export interface') || result.types.includes('export type');
    validations.push({
      name: '类型定义格式',
      passed: hasCommon && hasFileMarkers > 0 && hasExport,
      details: `Common: ${hasCommon}, File标记: ${hasFileMarkers}个, Export: ${hasExport}`
    });
    if (!hasCommon || hasFileMarkers === 0 || !hasExport) isValid = false;
  } else {
    validations.push({ name: '类型内容', passed: false, details: '未生成类型' });
    isValid = false;
  }

  // 检查关键类型是否生成
  if (result.types) {
    const keyTypes = ['ApiError', 'SuccessResponse'];
    for (const type of keyTypes) {
      const has = result.types.includes(`interface ${type}`) || result.types.includes(`type ${type}`);
      validations.push({ name: `类型-${type}`, passed: has, details: has ? '已生成' : '未找到' });
      if (!has) isValid = false;
    }
  }

  return { isValid, validations };
}

// 策略0: 原始配置
async function strategyOriginal(client, prompt) {
  console.log('\n========== 策略0: 原始配置 (thinking: true, effort: high, maxTokens: 393000) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const result = await client.chatWithTools(prompt, {
    model: 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: 393000,
    thinking: true,
    reasoningEffort: 'high',
    tools: [writeFileTool]
  });

  const duration = Date.now() - startTime;
  const extracted = extractToolCalls(result);

  return { duration, result, ...extracted };
}

// 策略1: 关闭思考模式
async function strategyNoThinking(client, prompt) {
  console.log('\n========== 策略1: 关闭思考模式 (thinking: false) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const result = await client.chatWithTools(prompt, {
    model: 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: 100000,
    thinking: false,
    tools: [writeFileTool]
  });

  const duration = Date.now() - startTime;
  const extracted = extractToolCalls(result);

  return { duration, result, ...extracted };
}

// 策略2: 降低思考强度
async function strategyLowEffort(client, prompt) {
  console.log('\n========== 策略2: 降低思考强度 (thinking: true, effort: low) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const result = await client.chatWithTools(prompt, {
    model: 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: 100000,
    thinking: true,
    reasoningEffort: 'low',
    tools: [writeFileTool]
  });

  const duration = Date.now() - startTime;
  const extracted = extractToolCalls(result);

  return { duration, result, ...extracted };
}

// 策略3: 减少 maxTokens
async function strategyReducedTokens(client, prompt) {
  console.log('\n========== 策略3: 减少 maxTokens (thinking: true, effort: high, maxTokens: 50000) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const result = await client.chatWithTools(prompt, {
    model: 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: 50000,
    thinking: true,
    reasoningEffort: 'high',
    tools: [writeFileTool]
  });

  const duration = Date.now() - startTime;
  const extracted = extractToolCalls(result);

  return { duration, result, ...extracted };
}

// 策略4: 并行生成
async function strategyParallel(client, task, implementationPlan, deliverables) {
  console.log('\n========== 策略4: 并行生成 (两个独立请求) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const typesPrompt = buildTypesOnlyPrompt(task, implementationPlan, deliverables);
  const contractPrompt = buildContractOnlyPrompt(task, implementationPlan, deliverables);

  // 并行执行两个请求
  const [typesResult, contractResult] = await Promise.all([
    client.chatWithTools(typesPrompt, {
      model: 'deepseek-v4-flash',
      temperature: 0.5,
      maxTokens: 80000,
      thinking: true,
      reasoningEffort: 'medium',
      tools: [writeFileTool]
    }),
    client.chatWithTools(contractPrompt, {
      model: 'deepseek-v4-flash',
      temperature: 0.5,
      maxTokens: 50000,
      thinking: true,
      reasoningEffort: 'medium',
      tools: [writeFileTool]
    })
  ]);

  const duration = Date.now() - startTime;

  // 提取结果
  let typesContent = null;
  let contractContent = null;

  for (const toolCall of (typesResult.toolCalls || [])) {
    const name = toolCall.name || toolCall.function?.name;
    let args = toolCall.arguments || toolCall.function?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { continue; }
    }
    if (name === 'write_file' && args?.file_path && args?.content) {
      if (args.file_path.includes('types/index.ts')) {
        typesContent = args.content;
      }
    }
  }

  for (const toolCall of (contractResult.toolCalls || [])) {
    const name = toolCall.name || toolCall.function?.name;
    let args = toolCall.arguments || toolCall.function?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { continue; }
    }
    if (name === 'write_file' && args?.file_path && args?.content) {
      if (args.file_path.includes('contracts/api.txt')) {
        contractContent = args.content;
      }
    }
  }

  return { duration, contract: contractContent, types: typesContent };
}

// 策略5: 综合优化
async function strategyCombined(client, prompt) {
  console.log('\n========== 策略5: 综合优化 (thinking: true, effort: medium, maxTokens: 80000) ==========');
  const startTime = Date.now();

  const writeFileTool = {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容到指定路径',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['file_path', 'content']
      }
    }
  };

  const result = await client.chatWithTools(prompt, {
    model: 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: 80000,
    thinking: true,
    reasoningEffort: 'medium',
    tools: [writeFileTool]
  });

  const duration = Date.now() - startTime;
  const extracted = extractToolCalls(result);

  return { duration, result, ...extracted };
}

// 主测试函数
async function runTests() {
  const config = getDeepSeekConfig();

  if (!config.apiKey) {
    console.error('错误: 请设置 DEEPSEEK_API_KEY 环境变量');
    console.log('示例: DEEPSEEK_API_KEY=your_api_key node test-contract-generation-optimization.js');
    process.exit(1);
  }

  const client = new DeepSeekLLMClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: 'deepseek-v4-flash',
    timeout: 300000
  });

  const { task, implementation_plan } = testRequest;
  const { deliverables } = testRequest.task_details;
  const prompt = buildContractPrompt(task, implementation_plan, deliverables);

  console.log('='.repeat(80));
  console.log('契约生成优化测试');
  console.log('='.repeat(80));
  console.log(`\n测试请求: ${task.title}`);
  console.log(`Deliverables 数量: ${deliverables.length}`);
  console.log(`Prompt 长度: ${prompt.length} 字符`);

  const results = {};

  // 运行选定的策略或全部策略
  const strategyArg = process.argv[2] ? parseInt(process.argv[2]) : -1;

  if (strategyArg === 0 || strategyArg === -1) {
    try {
      results.strategy0 = await strategyOriginal(client, prompt);
    } catch (e) {
      results.strategy0 = { error: e.message, duration: 0 };
    }
  }

  if (strategyArg === 1 || strategyArg === -1) {
    try {
      results.strategy1 = await strategyNoThinking(client, prompt);
    } catch (e) {
      results.strategy1 = { error: e.message, duration: 0 };
    }
  }

  if (strategyArg === 2 || strategyArg === -1) {
    try {
      results.strategy2 = await strategyLowEffort(client, prompt);
    } catch (e) {
      results.strategy2 = { error: e.message, duration: 0 };
    }
  }

  if (strategyArg === 3 || strategyArg === -1) {
    try {
      results.strategy3 = await strategyReducedTokens(client, prompt);
    } catch (e) {
      results.strategy3 = { error: e.message, duration: 0 };
    }
  }

  if (strategyArg === 4 || strategyArg === -1) {
    try {
      results.strategy4 = await strategyParallel(client, task, implementation_plan, deliverables);
    } catch (e) {
      results.strategy4 = { error: e.message, duration: 0 };
    }
  }

  if (strategyArg === 5 || strategyArg === -1) {
    try {
      results.strategy5 = await strategyCombined(client, prompt);
    } catch (e) {
      results.strategy5 = { error: e.message, duration: 0 };
    }
  }

  // 输出结果对比
  console.log('\n' + '='.repeat(80));
  console.log('测试结果对比');
  console.log('='.repeat(80));

  const strategyNames = [
    '策略0: 原始配置',
    '策略1: 关闭思考模式',
    '策略2: 降低思考强度',
    '策略3: 减少maxTokens',
    '策略4: 并行生成',
    '策略5: 综合优化'
  ];

  const baselineDuration = results.strategy0?.duration || 1;
  const baselineTypesLength = (results.strategy0?.types?.length || 1);
  const baselineContractLength = (results.strategy0?.contract?.length || 1);

  for (let i = 0; i <= 5; i++) {
    const key = `strategy${i}`;
    const result = results[key];

    console.log(`\n${strategyNames[i]}:`);
    if (!result || result.error) {
      console.log(`  ❌ 错误: ${result?.error || '未知错误'}`);
      continue;
    }

    const durationSec = (result.duration / 1000).toFixed(2);
    const speedup = (baselineDuration / result.duration).toFixed(2);
    const timeSaved = ((baselineDuration - result.duration) / 1000).toFixed(2);

    console.log(`  ⏱️  耗时: ${durationSec}秒 (加速 ${speedup}x, 节省 ${timeSaved}秒)`);
    console.log(`  📄 契约长度: ${result.contract?.length || 0} 字符`);
    console.log(`  📄 类型长度: ${result.types?.length || 0} 字符`);

    const validation = validateResult(result, strategyNames[i]);
    console.log(`  ✓ 验证结果: ${validation.isValid ? '通过' : '失败'}`);
    for (const v of validation.validations) {
      console.log(`    - ${v.name}: ${v.passed ? '✅' : '❌'} ${v.details}`);
    }
  }

  // 保存详细结果到文件
  const outputPath = path.join(__dirname, 'test-results', `contract-optimization-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    testRequest: {
      title: task.title,
      deliverablesCount: deliverables.length
    },
    results
  }, null, 2));
  console.log(`\n详细结果已保存到: ${outputPath}`);
}

// 运行测试
runTests().catch(console.error);
