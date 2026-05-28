/**
 * 契约生成优化测试脚本 - 与编排器实现完全对齐
 *
 * 运行方式:
 *   node test-contract-generation-aligned.js [策略编号]
 *
 * 策略:
 *   0 - 原始配置 (thinking: true, effort: high, maxTokens: 393000) - 模拟编排器
 *   1 - 关闭思考模式 (thinking: false)
 *   2 - 降低思考强度 (thinking: true, effort: low)
 *   3 - 减少 maxTokens (thinking: true, effort: high, maxTokens: 80000)
 *   4 - 综合优化 (thinking: true, effort: low, maxTokens: 80000)
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
      description: "完整电商系统",
      type_source: "src/types/index.ts",
      api_config: {
        baseURL: "http://localhost:3001/api",
        port: 3001
      }
    }
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

// 构建契约生成 Prompt - 与 OrchestratorServer._buildContractGenerationPrompt 完全一致
function buildContractPrompt(task, implementationPlan, deliverables = []) {
  const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
  const requirements = task.requirement || task.title || '未指定需求';

  let deliverablesSection = '';
  if (deliverables && deliverables.length > 0) {
    const fileList = deliverables.map(d => {
      const filePath = d.filePath || 'unknown';
      const description = d.description || '无描述';
      const type = d.type || 'general';
      return `- [${type}] ${filePath}: ${description}`;
    }).join('\n');
    deliverablesSection = `\n## 待生成文件列表\n${fileList}`;
  }

  let allFilePathsSection = '';
  if (deliverables && deliverables.length > 0) {
    const tsFiles = deliverables
      .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
      .map(d => d.filePath);
    if (tsFiles.length > 0) {
      allFilePathsSection = `\n\n## 【重要】必须为以下所有 TypeScript 文件生成类型定义分组\n\n${tsFiles.join('\n')}`;
    }
  }

  return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}
${deliverablesSection}
${allFilePathsSection}

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

请立即生成这两个文件。`;
}

// 与 OrchestratorServer._generateContractWithLLM 完全一致的提取逻辑
function extractContractAndTypes(result, implementationPlan) {
  let typesContent = null;

  console.log(`[extractContractAndTypes] 收到 ${result.toolCalls?.length || 0} 个工具调用`);

  for (const toolCall of result.toolCalls) {
    const { name, arguments: args } = toolCall;

    let input;
    try {
      input = typeof args === 'string' ? JSON.parse(args) : args;
    } catch (e) {
      console.log(`[extractContractAndTypes] 解析工具参数失败: ${e.message}`);
      // 尝试从原始响应恢复
      if (result.rawResponse?.choices?.[0]?.message?.content) {
        const rawContent = result.rawResponse.choices[0].message.content;
        const extracted = extractJsonFromText(rawContent);
        if (extracted) {
          try {
            input = JSON.parse(extracted);
          } catch (e2) {
            console.log(`[extractContractAndTypes] 恢复的 JSON 解析也失败: ${e2.message}`);
          }
        }
      }
      continue;
    }

    if (name === 'write_file' && input?.file_path && input?.content) {
      const filePath = input.file_path;
      console.log(`[extractContractAndTypes] write_file: ${filePath}, content长度: ${input.content?.length || 0}`);

      if (filePath.includes('contracts/api.txt')) {
        implementationPlan._contractDeliverableContent = input.content;
        console.log(`[extractContractAndTypes] 识别为契约文件`);
      } else if (filePath.includes('types/index.ts') || filePath.includes('types/index.tsx')) {
        typesContent = input.content;
        console.log(`[extractContractAndTypes] 识别为类型文件`);
      } else {
        console.log(`[extractContractAndTypes] 文件路径不匹配: ${filePath}`);
      }
    }
  }

  console.log(`[extractContractAndTypes] 完成: contractContent=${!!implementationPlan._contractDeliverableContent}, typesContent=${!!typesContent}`);

  if (typesContent) {
    implementationPlan._typesDeliverableContent = typesContent;
  }

  return { contract: implementationPlan._contractDeliverableContent, types: typesContent };
}

// 从文本中提取 JSON
function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // 移除 markdown 代码块标记
  const jsonBlockPattern = /```(?:json)?\s*([\s\S]*?)```/g;
  let match;
  while ((match = jsonBlockPattern.exec(text)) !== null) {
    const block = match[1].trim();
    try {
      JSON.parse(block);
      return block;
    } catch (e) {
      // 继续尝试
    }
  }

  // 查找 JSON 对象
  const jsonObjectPattern = /\{[\s\S]*\}/g;
  let lastValid = null;
  while ((match = jsonObjectPattern.exec(text)) !== null) {
    const potential = match[0];
    try {
      JSON.parse(potential);
      lastValid = potential;
    } catch (e) {
      // 继续尝试
    }
  }

  return lastValid || text.trim();
}

// 验证生成结果
function validateResult(result) {
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

  // 检查关键类型
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

// 创建与 OrchestratorServer 一致的 DeepSeekLLMClient 调用
async function generateContractWithLLM(client, prompt, options = {}) {
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
    model: options.model || 'deepseek-v4-flash',
    temperature: 0.5,
    maxTokens: options.maxTokens || 393000,
    tools: [writeFileTool]
    // 注意：thinking 和 reasoningEffort 应该在创建 client 实例时设置
    // 不在这里传递，因为 chatWithTools 方法是从 this.thinking 读取的
  });

  return result;
}

// 主测试函数
async function runTests() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  const { task, implementation_plan } = testRequest;
  const { deliverables } = testRequest.task_details;
  const prompt = buildContractPrompt(task, implementation_plan, deliverables);

  console.log('='.repeat(80));
  console.log('契约生成优化测试 (与编排器实现对齐)');
  console.log('='.repeat(80));
  console.log(`\n测试请求: ${task.title}`);
  console.log(`Deliverables 数量: ${deliverables.length}`);
  console.log(`Prompt 长度: ${prompt.length} 字符\n`);

  const results = {};
  const strategyArg = process.argv[2] ? parseInt(process.argv[2]) : -1;

  // 策略0: 原始配置 (thinking: true, effort: high) - 与编排器一致
  if (strategyArg === 0 || strategyArg === -1) {
    console.log('\n========== 策略0: 原始配置 (thinking: true, effort: high, maxTokens: 393000) ==========');
    const startTime = Date.now();

    // 与 OrchestratorServer 创建 client 的方式完全一致
    const client = new DeepSeekLLMClient({
      apiKey: apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeout: 420000,
      maxRetries: 3,
      thinking: true,           // 启用思考模式
      reasoningEffort: 'high', // 思考强度 high
      maxTokens: 393000
    });

    try {
      const implPlan = {};
      const result = await generateContractWithLLM(client, prompt, { maxTokens: 393000 });
      const extracted = extractContractAndTypes(result, implPlan);
      const duration = Date.now() - startTime;
      results.strategy0 = { duration, ...extracted, toolCallsCount: result.toolCalls?.length || 0 };
    } catch (e) {
      results.strategy0 = { error: e.message, duration: 0 };
    }
  }

  // 策略1: 关闭思考模式 (thinking: false)
  if (strategyArg === 1 || strategyArg === -1) {
    console.log('\n========== 策略1: 关闭思考模式 (thinking: false) ==========');
    const startTime = Date.now();

    const client = new DeepSeekLLMClient({
      apiKey: apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeout: 300000,
      maxRetries: 3,
      thinking: false,  // 关闭思考模式
      maxTokens: 100000
    });

    try {
      const implPlan = {};
      const result = await generateContractWithLLM(client, prompt, { maxTokens: 100000 });
      const extracted = extractContractAndTypes(result, implPlan);
      const duration = Date.now() - startTime;
      results.strategy1 = { duration, ...extracted, toolCallsCount: result.toolCalls?.length || 0 };
    } catch (e) {
      results.strategy1 = { error: e.message, duration: 0 };
    }
  }

  // 策略2: 降低思考强度 (thinking: true, effort: low)
  if (strategyArg === 2 || strategyArg === -1) {
    console.log('\n========== 策略2: 降低思考强度 (thinking: true, effort: low) ==========');
    const startTime = Date.now();

    const client = new DeepSeekLLMClient({
      apiKey: apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeout: 300000,
      maxRetries: 3,
      thinking: true,
      reasoningEffort: 'low',  // 从 high 改为 low
      maxTokens: 100000
    });

    try {
      const implPlan = {};
      const result = await generateContractWithLLM(client, prompt, { maxTokens: 100000 });
      const extracted = extractContractAndTypes(result, implPlan);
      const duration = Date.now() - startTime;
      results.strategy2 = { duration, ...extracted, toolCallsCount: result.toolCalls?.length || 0 };
    } catch (e) {
      results.strategy2 = { error: e.message, duration: 0 };
    }
  }

  // 策略3: 减少 maxTokens (thinking: true, effort: high, maxTokens: 80000)
  if (strategyArg === 3 || strategyArg === -1) {
    console.log('\n========== 策略3: 减少 maxTokens (thinking: true, effort: high, maxTokens: 80000) ==========');
    const startTime = Date.now();

    const client = new DeepSeekLLMClient({
      apiKey: apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeout: 300000,
      maxRetries: 3,
      thinking: true,
      reasoningEffort: 'high',
      maxTokens: 80000  // 从 393000 减少到 80000
    });

    try {
      const implPlan = {};
      const result = await generateContractWithLLM(client, prompt, { maxTokens: 80000 });
      const extracted = extractContractAndTypes(result, implPlan);
      const duration = Date.now() - startTime;
      results.strategy3 = { duration, ...extracted, toolCallsCount: result.toolCalls?.length || 0 };
    } catch (e) {
      results.strategy3 = { error: e.message, duration: 0 };
    }
  }

  // 策略4: 综合优化 (thinking: true, effort: low, maxTokens: 80000)
  if (strategyArg === 4 || strategyArg === -1) {
    console.log('\n========== 策略4: 综合优化 (thinking: true, effort: low, maxTokens: 80000) ==========');
    const startTime = Date.now();

    const client = new DeepSeekLLMClient({
      apiKey: apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeout: 300000,
      maxRetries: 3,
      thinking: true,
      reasoningEffort: 'low',  // 降低思考强度
      maxTokens: 80000         // 减少 maxTokens
    });

    try {
      const implPlan = {};
      const result = await generateContractWithLLM(client, prompt, { maxTokens: 80000 });
      const extracted = extractContractAndTypes(result, implPlan);
      const duration = Date.now() - startTime;
      results.strategy4 = { duration, ...extracted, toolCallsCount: result.toolCalls?.length || 0 };
    } catch (e) {
      results.strategy4 = { error: e.message, duration: 0 };
    }
  }

  // 输出结果对比
  console.log('\n' + '='.repeat(80));
  console.log('测试结果对比');
  console.log('='.repeat(80));

  const strategyNames = [
    '策略0: 原始配置 (thinking:true, effort:high, maxTokens:393000)',
    '策略1: 关闭思考模式 (thinking:false)',
    '策略2: 降低思考强度 (thinking:true, effort:low)',
    '策略3: 减少maxTokens (thinking:true, effort:high, maxTokens:80000)',
    '策略4: 综合优化 (thinking:true, effort:low, maxTokens:80000)'
  ];

  const baselineDuration = results.strategy0?.duration || 1;

  for (let i = 0; i <= 4; i++) {
    const key = `strategy${i}`;
    const result = results[key];

    console.log(`\n${strategyNames[i]}:`);
    if (!result || result.error) {
      console.log(`  错误: ${result?.error || '未知错误'}`);
      continue;
    }

    const durationSec = (result.duration / 1000).toFixed(2);
    const speedup = result.duration > 0 ? (baselineDuration / result.duration).toFixed(2) : '0.00';
    const timeSaved = ((baselineDuration - result.duration) / 1000).toFixed(2);

    console.log(`  耗时: ${durationSec}秒 (基准: ${(baselineDuration/1000).toFixed(2)}秒, 加速: ${speedup}x, 节省: ${timeSaved}秒)`);
    console.log(`  工具调用数: ${result.toolCallsCount}`);
    console.log(`  契约长度: ${result.contract?.length || 0} 字符`);
    console.log(`  类型长度: ${result.types?.length || 0} 字符`);

    const validation = validateResult(result);
    console.log(`  验证: ${validation.isValid ? '通过' : '失败'}`);
    for (const v of validation.validations) {
      console.log(`    - ${v.name}: ${v.passed ? '通过' : '失败'} (${v.details})`);
    }
  }

  // 保存结果
  const outputPath = path.join(__dirname, 'test-results', `contract-aligned-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    testRequest: { title: task.title, deliverablesCount: deliverables.length },
    results
  }, null, 2));
  console.log(`\n详细结果已保存到: ${outputPath}`);
}

runTests().catch(console.error);
