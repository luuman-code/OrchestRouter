/**
 * 契约生成优化测试脚本 - 测试并行生成策略
 *
 * 运行方式:
 *   node test-contract-generation-direct.js [策略编号]
 *
 * 策略:
 *   0 - 原始配置 (thinking: enabled, effort: high, 串行)
 *   1 - 禁用思考模式, 并行生成
 *   2 - 禁用思考模式, 串行生成 (基准对比)
 *   3 - 中等思考强度, 并行生成
 *   4 - 中等思考强度, 串行生成 (基准对比)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// API 配置
const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = 'https://api.deepseek.com';

// 测试请求
const testRequest = {
  task: {
    title: "电商平台开发",
    requirement: "生成 deliverables 列表中指定的文件"
  },
  implementation_plan: {
    tech_stack: ["React 18", "TypeScript", "Vite", "Tailwind CSS", "Node.js", "Express", "SQLite"],
    contract_first: true,
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

// 构建契约文件 Prompt
function buildContractPrompt(task, deliverables) {
  const techStack = task.implementation_plan.tech_stack?.join(', ') || '未指定';
  const requirements = task.task.requirement || task.task.title || '未指定需求';

  const fileList = deliverables.map(d => {
    return `- ${d.filePath}: ${d.description}`;
  }).join('\n');

  return `你是架构师，负责为以下需求生成 API 契约文档。

## 技术栈
${techStack}

## 需求描述
${requirements}

## 待生成文件
${fileList}

## 输出要求

调用 write_file 工具生成契约文件:

- file_path: "contracts/api.txt"
- content: API 契约文档，使用 ## [COMMON] 和 ## [FILE: <path>] 分组格式

## 契约格式示例

\`\`\`
## [COMMON]
shared schemas:
- ApiError: { code: string, message: string }
- SuccessResponse: { success: true, message: string }

## [FILE: server/routes/auth.ts]
// - POST /auth/register - 用户注册

## [FILE: server/routes/products.ts]
// - GET /products - 获取商品列表
\`\`\`

## 【关键要求】
1. 必须为所有文件生成分组
2. 不要遗漏任何文件
3. 提供详细的API端点描述

请立即生成契约文件。`;
}

// 构建类型文件 Prompt
function buildTypesPrompt(task, deliverables) {
  const techStack = task.implementation_plan.tech_stack?.join(', ') || '未指定';
  const requirements = task.task.requirement || task.task.title || '未指定需求';

  const tsFiles = deliverables
    .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
    .map(d => d.filePath);

  return `你是架构师，负责为以下需求生成 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}

## 【重要】必须为以下所有 TypeScript 文件生成分组
${tsFiles.join('\n')}

## 输出要求

调用 write_file 工具生成类型定义文件:

- file_path: "types/index.ts"
- content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 类型格式示例

\`\`\`typescript
// [COMMON]
export interface ApiError { code: string; message: string; }
export interface SuccessResponse { success: true; message: string; }

// [FILE: src/pages/Home.tsx]
export interface HomePageData { featuredProducts: Product[]; }
\`\`\`

## 【关键要求】
1. 必须为所有文件生成分组
2. 不要遗漏任何文件
3. 使用正确的 TypeScript 语法

请立即生成类型定义文件。`;
}

// 构建合并的 Prompt (串行生成两个文件)
function buildCombinedPrompt(task, deliverables) {
  const techStack = task.implementation_plan.tech_stack?.join(', ') || '未指定';
  const requirements = task.task.requirement || task.task.title || '未指定需求';

  const fileList = deliverables.map(d => {
    return `- [${d.type}] ${d.filePath}: ${d.description}`;
  }).join('\n');

  const tsFiles = deliverables
    .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
    .map(d => d.filePath);

  return `你是架构师，负责为以下需求生成 API 契约和 TypeScript 类型定义。

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

1. write_file 工具调用 #1 - 契约文件 (contracts/api.txt)
2. write_file 工具调用 #2 - 类型定义文件 (types/index.ts)

## 类型定义格式示例

\`\`\`typescript
// [COMMON]
export interface ApiError { code: string; message: string; }

// [FILE: src/pages/Home.tsx]
export interface HomePageData { featuredProducts: Product[]; }
\`\`\`

## 契约格式示例

\`\`\`
## [COMMON]
shared schemas:
- ApiError: { code: string, message: string }

// [FILE: server/routes/auth.ts]
// - POST /auth/register - 用户注册
\`\`\`

## 【关键要求】
1. 必须为所有文件生成分组
2. 不要遗漏任何文件

请立即生成这两个文件。`;
}

// 直接调用 DeepSeek API
function callDeepSeekAPI(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = {
      model: options.model || 'deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: options.maxTokens || 393000,
      tools: [{
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
      }]
    };

    // 添加思考模式配置
    if (options.thinking !== undefined) {
      if (options.thinking === 'disabled') {
        payload.thinking = { type: 'disabled' };
      } else if (options.thinking === 'enabled') {
        payload.thinking = {
          type: 'enabled',
          reasoning_effort: options.reasoningEffort || 'high'
        };
      }
    }

    const payloadStr = JSON.stringify(payload);

    const url = new URL('/v1/chat/completions', BASE_URL);
    const options_http = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
        'Authorization': `Bearer ${API_KEY}`
      },
      timeout: options.timeout || 300000
    };

    console.log(`[API] thinking=${JSON.stringify(payload.thinking)}, max_tokens=${payload.max_tokens}`);

    const req = https.request(options_http, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.write(payloadStr);
    req.end();
  });
}

// 提取工具调用
function extractToolCalls(response) {
  const result = { contract: null, types: null, toolCalls: [] };

  const message = response.choices?.[0]?.message;
  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      const name = tc.function?.name || tc.name;
      let args = tc.function?.arguments || tc.arguments;

      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch (e) { continue; }
      }

      if (name === 'write_file' && args?.file_path && args?.content) {
        const fp = args.file_path;
        result.toolCalls.push({ filePath: fp, content: args.content });

        if (fp.includes('contracts/api.txt')) {
          result.contract = args.content;
        } else if (fp.includes('types/index.ts')) {
          result.types = args.content;
        }
      }
    }
  }

  return result;
}

// 验证结果
function validateResult(result) {
  const validations = [];
  let isValid = true;

  if (result.contract) {
    const hasCommon = result.contract.includes('[COMMON]') || result.contract.includes('// [COMMON]');
    const fileMarkers = (result.contract.match(/\/\/ \[FILE:|## \[FILE:/g) || []).length;
    validations.push({ name: '契约格式', passed: hasCommon && fileMarkers > 0, details: `Common:${hasCommon}, Files:${fileMarkers}` });
    if (!hasCommon || fileMarkers === 0) isValid = false;
  } else {
    validations.push({ name: '契约内容', passed: false, details: '未生成' });
    isValid = false;
  }

  if (result.types) {
    const hasCommon = result.types.includes('[COMMON]') || result.types.includes('// [COMMON]');
    const fileMarkers = (result.types.match(/\/\/ \[FILE:/g) || []).length;
    const hasExport = result.types.includes('export interface') || result.types.includes('export type');
    validations.push({ name: '类型格式', passed: hasCommon && fileMarkers > 0 && hasExport, details: `Common:${hasCommon}, Files:${fileMarkers}, Export:${hasExport}` });
    if (!hasCommon || fileMarkers === 0 || !hasExport) isValid = false;
  } else {
    validations.push({ name: '类型内容', passed: false, details: '未生成' });
    isValid = false;
  }

  return { isValid, validations };
}

// 主测试
async function runTests() {
  const { task, task_details } = testRequest;
  const deliverables = task_details.deliverables;

  console.log('='.repeat(80));
  console.log('并行生成策略测试');
  console.log('='.repeat(80));
  console.log(`\nDeliverables 数量: ${deliverables.length}`);

  const results = {};
  const strategyArg = process.argv[2] !== undefined ? parseInt(process.argv[2]) : -1;

  // 策略0: 原始配置 (串行, thinking: enabled, effort: high)
  if (strategyArg === 0 || strategyArg === -1) {
    console.log('\n========== 策略0: 原始(串行, enabled, high) ==========');
    const start = Date.now();
    try {
      const prompt = buildCombinedPrompt(testRequest, deliverables);
      const response = await callDeepSeekAPI(prompt, { thinking: 'enabled', reasoningEffort: 'high', maxTokens: 393000 });
      const extracted = extractToolCalls(response);
      results.strategy0 = { duration: Date.now() - start, ...extracted, finishReason: response.choices?.[0]?.finish_reason };
    } catch (e) {
      results.strategy0 = { error: e.message, duration: Date.now() - start };
      console.log(`  错误: ${e.message}`);
    }
  }

  // 策略1: 禁用思考模式, 并行生成
  if (strategyArg === 1 || strategyArg === -1) {
    console.log('\n========== 策略1: 禁用思考模式, 并行生成 ==========');
    const start = Date.now();
    try {
      const [contractResponse, typesResponse] = await Promise.all([
        callDeepSeekAPI(buildContractPrompt(testRequest, deliverables), { thinking: 'disabled', maxTokens: 50000 }),
        callDeepSeekAPI(buildTypesPrompt(testRequest, deliverables), { thinking: 'disabled', maxTokens: 80000 })
      ]);

      const contractResult = extractToolCalls(contractResponse);
      const typesResult = extractToolCalls(typesResponse);

      results.strategy1 = {
        duration: Date.now() - start,
        contract: contractResult.contract,
        types: typesResult.types,
        toolCalls: [...contractResult.toolCalls, ...typesResult.toolCalls],
        finishReason: `${contractResponse.choices?.[0]?.finish_reason}, ${typesResponse.choices?.[0]?.finish_reason}`
      };
    } catch (e) {
      results.strategy1 = { error: e.message, duration: Date.now() - start };
      console.log(`  错误: ${e.message}`);
    }
  }

  // 策略2: 禁用思考模式, 串行生成 (基准对比)
  if (strategyArg === 2 || strategyArg === -1) {
    console.log('\n========== 策略2: 禁用思考模式, 串行生成 ==========');
    const start = Date.now();
    try {
      const prompt = buildCombinedPrompt(testRequest, deliverables);
      const response = await callDeepSeekAPI(prompt, { thinking: 'disabled', maxTokens: 100000 });
      const extracted = extractToolCalls(response);
      results.strategy2 = { duration: Date.now() - start, ...extracted, finishReason: response.choices?.[0]?.finish_reason };
    } catch (e) {
      results.strategy2 = { error: e.message, duration: Date.now() - start };
      console.log(`  错误: ${e.message}`);
    }
  }

  // 策略3: 中等思考强度, 并行生成
  if (strategyArg === 3 || strategyArg === -1) {
    console.log('\n========== 策略3: 中等思考强度, 并行生成 ==========');
    const start = Date.now();
    try {
      const [contractResponse, typesResponse] = await Promise.all([
        callDeepSeekAPI(buildContractPrompt(testRequest, deliverables), { thinking: 'enabled', reasoningEffort: 'medium', maxTokens: 50000 }),
        callDeepSeekAPI(buildTypesPrompt(testRequest, deliverables), { thinking: 'enabled', reasoningEffort: 'medium', maxTokens: 80000 })
      ]);

      const contractResult = extractToolCalls(contractResponse);
      const typesResult = extractToolCalls(typesResponse);

      results.strategy3 = {
        duration: Date.now() - start,
        contract: contractResult.contract,
        types: typesResult.types,
        toolCalls: [...contractResult.toolCalls, ...typesResult.toolCalls],
        finishReason: `${contractResponse.choices?.[0]?.finish_reason}, ${typesResponse.choices?.[0]?.finish_reason}`
      };
    } catch (e) {
      results.strategy3 = { error: e.message, duration: Date.now() - start };
      console.log(`  错误: ${e.message}`);
    }
  }

  // 策略4: 中等思考强度, 串行生成 (基准对比)
  if (strategyArg === 4 || strategyArg === -1) {
    console.log('\n========== 策略4: 中等思考强度, 串行生成 ==========');
    const start = Date.now();
    try {
      const prompt = buildCombinedPrompt(testRequest, deliverables);
      const response = await callDeepSeekAPI(prompt, { thinking: 'enabled', reasoningEffort: 'medium', maxTokens: 100000 });
      const extracted = extractToolCalls(response);
      results.strategy4 = { duration: Date.now() - start, ...extracted, finishReason: response.choices?.[0]?.finish_reason };
    } catch (e) {
      results.strategy4 = { error: e.message, duration: Date.now() - start };
      console.log(`  错误: ${e.message}`);
    }
  }

  // 输出结果
  console.log('\n' + '='.repeat(80));
  console.log('测试结果对比');
  console.log('='.repeat(80));

  const names = [
    '策略0: 原始(串行, enabled, high)',
    '策略1: 禁用思考+并行生成',
    '策略2: 禁用思考+串行生成',
    '策略3: 中等思考+并行生成',
    '策略4: 中等思考+串行生成'
  ];

  const baselineDisabledSerial = results.strategy2?.duration || 1;
  const baselineMediumSerial = results.strategy4?.duration || 1;

  for (let i = 0; i <= 4; i++) {
    const r = results[`strategy${i}`];
    console.log(`\n${names[i]}:`);
    if (!r || r.error) {
      console.log(`  错误: ${r?.error || '未知'}`);
      continue;
    }

    let comparison = '';
    if (i === 1 || i === 2) {
      comparison = `(基准禁用串行: ${(baselineDisabledSerial/1000).toFixed(2)}s)`;
      if (baselineDisabledSerial > 0 && r.duration > 0) {
        const speedup = (baselineDisabledSerial / r.duration).toFixed(2);
        const saved = ((baselineDisabledSerial - r.duration) / 1000).toFixed(2);
        comparison += `, 加速: ${speedup}x, 节省: ${saved}s`;
      }
    } else if (i === 3 || i === 4) {
      comparison = `(基准中等串行: ${(baselineMediumSerial/1000).toFixed(2)}s)`;
      if (baselineMediumSerial > 0 && r.duration > 0) {
        const speedup = (baselineMediumSerial / r.duration).toFixed(2);
        const saved = ((baselineMediumSerial - r.duration) / 1000).toFixed(2);
        comparison += `, 加速: ${speedup}x, 节省: ${saved}s`;
      }
    }

    console.log(`  耗时: ${(r.duration/1000).toFixed(2)}s ${comparison}`);
    console.log(`  契约: ${r.contract?.length || 0}字符, 类型: ${r.types?.length || 0}字符`);

    const v = validateResult(r);
    console.log(`  验证: ${v.isValid ? '通过' : '失败'}`);
    for (const item of v.validations) {
      console.log(`    - ${item.name}: ${item.passed ? '✅' : '❌'} (${item.details})`);
    }
  }

  // 保存结果
  const outPath = path.join(__dirname, 'test-results', `contract-parallel-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n结果已保存: ${outPath}`);
}

runTests().catch(console.error);
