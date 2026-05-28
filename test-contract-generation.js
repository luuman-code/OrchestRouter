/**
 * 测试脚本：验证架构师模型生成契约和类型定义的能力
 *
 * 运行方式：node test-contract-generation.js
 */

const DeepSeekLLMClient = require('./src/decomposer/llm/DeepSeekLLMClient');
const ContractGenerator = require('./src/decomposer/contract/ContractGenerator');

// 从配置文件读取 API Key
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const configPath = path.join(__dirname, 'config', 'config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // 查找 deepseek 提供商
    const deepseekProvider = config.Providers?.find(p => p.name === 'deepseek');
    if (deepseekProvider) {
      return {
        apiKey: deepseekProvider.api_key || process.env.DEEPSEEK_API_KEY,
        baseUrl: deepseekProvider.api_base_url || 'https://api.deepseek.com'
      };
    }
  }
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.deepseek.com'
  };
}

// 测试用 deliverables（简化版）
const testDeliverables = [
  { filePath: 'src/types/index.ts', type: 'types', description: '类型定义文件' },
  { filePath: 'src/pages/Home.tsx', type: 'ui', description: '首页' },
  { filePath: 'src/pages/ProductDetail.tsx', type: 'ui', description: '商品详情页' },
  { filePath: 'server/routes/auth.ts', type: 'api', description: '认证路由' },
  { filePath: 'server/routes/products.ts', type: 'api', description: '商品路由' },
  { filePath: 'server/database/db.ts', type: 'database', description: '数据库配置' },
];

// 架构师 prompt（从 _buildContractGenerationPrompt 复制 - 已更新）
function buildContractGenerationPrompt(task, implementationPlan, deliverables = []) {
  const techStack = implementationPlan.tech_stack?.join(', ') || 'React, TypeScript, Node.js, Express';
  const requirements = task.requirement || task.title || '电商平台前后端完整实现';

  let deliverablesSection = '';
  if (deliverables && deliverables.length > 0) {
    const fileList = deliverables.map(d => {
      const filePath = d.filePath || 'unknown';
      const description = d.description || '无描述';
      const type = d.type || 'general';
      return `- [${type}] ${filePath}: ${description}`;
    }).join('\n');

    deliverablesSection = `
## 待生成文件列表（必须全部生成）
${fileList}`;
  }

  return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}
${deliverablesSection}

## 输出要求

【重要】你必须按照以下步骤，**分别调用 write_file 工具两次**，生成两个独立的文件：

**第一步：调用 write_file 生成契约文件**
- 工具调用参数：file_path = "contracts/api.json"
- 文件内容：完整的 OpenAPI 3.0 JSON 规范
- 包含所有 API 端点（路径、方法、参数、请求体、响应体）
- 包含 schema 定义

**第二步：调用 write_file 生成类型定义文件**
- 工具调用参数：file_path = "types/index.ts"
- 文件内容：TypeScript 类型定义
- **【重要】必须使用分组格式输出类型定义**
- 格式规范：每个文件关联的类型必须用 \`// [FILE: <filePath>]\` 注释标记
- 通用类型（如 ApiError, SuccessResponse, PaginationMeta）用 \`// [COMMON]\` 标记
- 示例格式：
\`\`\`typescript
// ============================================================
// 电商平台 - TypeScript 类型定义
// ============================================================

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

// [FILE: src/pages/Cart.tsx]
export interface Cart {
  items: CartItem[];
  total: number;
}
export interface CartItem {
  productId: string;
  quantity: number;
}
\`\`\`

**请严格按照上述顺序，先调用 write_file 生成 contracts/api.json，再调用 write_file 生成 types/index.ts。两个工具调用都必须执行，缺一不可。**`;
}

async function runTest() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error('❌ 未找到 DeepSeek API Key，请检查配置文件或环境变量');
    return;
  }

  console.log('='.repeat(60));
  console.log('架构师模型契约生成测试');
  console.log('='.repeat(60));

  // 创建 LLM 客户端
  const deepseekClient = new DeepSeekLLMClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: 'deepseek-v4-flash', // 使用 flash 版本测试
    timeout: 300000,
    maxRetries: 2,
    thinking: true,
    reasoningEffort: 'high'
  });

  // 定义 write_file 工具
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

  const task = {
    title: '电商平台前后端完整实现',
    requirement: '开发一个包含用户认证、商品展示、购物车、订单管理的完整电商平台'
  };

  const implementationPlan = {
    tech_stack: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'Node.js', 'Express', 'SQLite']
  };

  const prompt = buildContractGenerationPrompt(task, implementationPlan, testDeliverables);

  console.log('\n📋 Prompt 长度:', prompt.length, '字符');
  console.log('\n📡 发送请求到 DeepSeek API...');

  // 测试1: 使用较小的 maxTokens (当前有问题的配置)
  console.log('\n' + '-'.repeat(60));
  console.log('测试 1: maxTokens = 32768 + 思考模式');
  console.log('-'.repeat(60));

  try {
    // 手动构建 payload 并添加调试日志
    const messages = [{ role: 'user', content: prompt }];
    const payload = {
      model: 'deepseek-v4-flash',
      messages: messages,
      temperature: 0.3,
      max_tokens: 32768,
      stream: false,
      tools: [writeFileTool],
      thinking: {
        type: 'enabled',
        reasoning_effort: 'high'
      }
    };

    console.log('\n📤 实际发送的 payload 结构:');
    console.log('  model:', payload.model);
    console.log('  messages[0].role:', payload.messages[0].role);
    console.log('  messages[0].content.length:', payload.messages[0].content.length);
    console.log('  temperature:', payload.temperature);
    console.log('  max_tokens:', payload.max_tokens);
    console.log('  tools数量:', payload.tools?.length);
    console.log('  tools[0].type:', payload.tools?.[0]?.type);
    console.log('  tools[0].function.name:', payload.tools?.[0]?.function?.name);
    console.log('  thinking:', JSON.stringify(payload.thinking));

    const result1 = await deepseekClient.chatWithTools(prompt, {
      model: 'deepseek-v4-flash',
      temperature: 0.3,
      maxTokens: 32768,
      tools: [writeFileTool],
      thinking: true,
      reasoningEffort: 'high'
    });

    console.log('\n✅ 请求成功');
    console.log('finishReason:', result1.finishReason);
    console.log('toolCalls 数量:', result1.toolCalls?.length || 0);

    const hasContractsFile = result1.toolCalls?.some(tc =>
      tc.name === 'write_file' &&
      (tc.arguments?.file_path?.includes('contracts/api.json') ||
       tc.arguments?.file_path?.includes('openapi.json'))
    );
    const hasTypesFile = result1.toolCalls?.some(tc =>
      tc.name === 'write_file' &&
      tc.arguments?.file_path?.includes('types/index.ts')
    );

    console.log('\n文件检查:');
    console.log('  - contracts/api.json:', hasContractsFile ? '✅ 存在' : '❌ 缺失');
    console.log('  - types/index.ts:', hasTypesFile ? '✅ 存在' : '❌ 缺失');

    if (result1.finishReason === 'length') {
      console.log('\n⚠️ 警告: 响应被截断 (finish_reason=length)');
    }

    if (result1.toolCalls) {
      console.log('\n工具调用详情:');
      for (const tc of result1.toolCalls) {
        // arguments 可能是 string，需要解析
        let parsedArgs = tc.arguments;
        if (typeof parsedArgs === 'string') {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch (e) {
            console.log(`  - ${tc.name}: 解析 arguments 失败`);
            continue;
          }
        }
        const contentLen = parsedArgs?.content?.length || 0;
        console.log(`  - ${tc.name}: ${parsedArgs?.file_path} (${contentLen} 字符)`);
      }
    }

    // 检查原始响应结构
    console.log('\n原始响应检查:');
    if (result1.rawResponse?.choices?.[0]?.message) {
      const msg = result1.rawResponse.choices[0].message;
      console.log('  finish_reason:', result1.rawResponse.choices[0].finish_reason);
      console.log('  has content:', !!msg.content);
      console.log('  has tool_calls:', !!msg.tool_calls);
      console.log('  content length:', msg.content?.length || 0);
      console.log('  content (first 500 chars):', msg.content?.substring(0, 500));

      // 检查思考内容（thinking 或 reasoning_content）
      if (msg.thinking) {
        console.log('  has thinking:', true);
        console.log('  thinking length:', msg.thinking?.length || 0);
        console.log('  thinking (first 1000 chars):', msg.thinking?.substring(0, 1000));
      }
      if (msg.reasoning_content) {
        console.log('  has reasoning_content:', true);
        console.log('  reasoning_content length:', msg.reasoning_content?.length || 0);
        console.log('  reasoning_content (first 1000 chars):', msg.reasoning_content?.substring(0, 1000));
      }

      if (msg.tool_calls) {
        console.log('  tool_calls 数量:', msg.tool_calls.length);
        for (let i = 0; i < msg.tool_calls.length; i++) {
          const tc = msg.tool_calls[i];
          console.log(`    [${i}] tool_call id:`, tc.id);
          console.log(`    [${i}] tool_call function.name:`, tc.function?.name);
          console.log(`    [${i}] tool_call arguments length:`, tc.function?.arguments?.length || 0);
          // 尝试解析 arguments
          if (typeof tc.function?.arguments === 'string') {
            try {
              const parsed = JSON.parse(tc.function.arguments);
              console.log(`    [${i}] parsed.file_path:`, parsed.file_path);
              console.log(`    [${i}] parsed.content length:`, parsed.content?.length || 0);
            } catch (e) {
              console.log(`    [${i}] arguments 解析失败:`, e.message);
            }
          }
        }
      }
    }

    // 打印完整原始响应（JSON格式）
    console.log('\n完整原始响应 (JSON):');
    console.log(JSON.stringify(result1.rawResponse, null, 2)?.substring(0, 5000));

  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }

  // 测试2: 使用较大的 maxTokens + 不使用思考模式
  console.log('\n' + '-'.repeat(60));
  console.log('测试 2: maxTokens = 320000 + 无思考模式');
  console.log('-'.repeat(60));

  try {
    const result2 = await deepseekClient.chatWithTools(prompt, {
      model: 'deepseek-v4-flash',
      temperature: 0.3,
      maxTokens: 320000,
      tools: [writeFileTool],
      thinking: false
    });

    console.log('\n✅ 请求成功');
    console.log('finishReason:', result2.finishReason);
    console.log('toolCalls 数量:', result2.toolCalls?.length || 0);

    const hasContractsFile = result2.toolCalls?.some(tc =>
      tc.name === 'write_file' &&
      (tc.arguments?.file_path?.includes('contracts/api.json') ||
       tc.arguments?.file_path?.includes('openapi.json'))
    );
    const hasTypesFile = result2.toolCalls?.some(tc =>
      tc.name === 'write_file' &&
      tc.arguments?.file_path?.includes('types/index.ts')
    );

    console.log('\n文件检查:');
    console.log('  - contracts/api.json:', hasContractsFile ? '✅ 存在' : '❌ 缺失');
    console.log('  - types/index.ts:', hasTypesFile ? '✅ 存在' : '❌ 缺失');

    if (result2.finishReason === 'length') {
      console.log('\n⚠️ 警告: 响应被截断 (finish_reason=length)');
    }

    if (result2.toolCalls) {
      console.log('\n工具调用详情:');
      for (const tc of result2.toolCalls) {
        // arguments 可能是 string，需要解析
        let parsedArgs = tc.arguments;
        if (typeof parsedArgs === 'string') {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch (e) {
            console.log(`  - ${tc.name}: 解析 arguments 失败`);
            continue;
          }
        }
        const contentLen = parsedArgs?.content?.length || 0;
        console.log(`  - ${tc.name}: ${parsedArgs?.file_path} (${contentLen} 字符)`);
      }
    }

    // 检查原始响应结构
    console.log('\n原始响应检查:');
    if (result2.rawResponse?.choices?.[0]?.message) {
      const msg = result2.rawResponse.choices[0].message;
      console.log('  finish_reason:', result2.rawResponse.choices[0].finish_reason);
      console.log('  has content:', !!msg.content);
      console.log('  has tool_calls:', !!msg.tool_calls);
      console.log('  content length:', msg.content?.length || 0);
      console.log('  content (first 500 chars):', msg.content?.substring(0, 500));

      // 检查思考内容（thinking 或 reasoning_content）
      if (msg.thinking) {
        console.log('  has thinking:', true);
        console.log('  thinking length:', msg.thinking?.length || 0);
        console.log('  thinking (first 1000 chars):', msg.thinking?.substring(0, 1000));
      }
      if (msg.reasoning_content) {
        console.log('  has reasoning_content:', true);
        console.log('  reasoning_content length:', msg.reasoning_content?.length || 0);
        console.log('  reasoning_content (first 1000 chars):', msg.reasoning_content?.substring(0, 1000));
      }

      if (msg.tool_calls) {
        console.log('  tool_calls 数量:', msg.tool_calls.length);
        for (let i = 0; i < msg.tool_calls.length; i++) {
          const tc = msg.tool_calls[i];
          console.log(`    [${i}] tool_call id:`, tc.id);
          console.log(`    [${i}] tool_call function.name:`, tc.function?.name);
          console.log(`    [${i}] tool_call arguments length:`, tc.function?.arguments?.length || 0);
          // 尝试解析 arguments
          if (typeof tc.function?.arguments === 'string') {
            try {
              const parsed = JSON.parse(tc.function.arguments);
              console.log(`    [${i}] parsed.file_path:`, parsed.file_path);
              console.log(`    [${i}] parsed.content length:`, parsed.content?.length || 0);
            } catch (e) {
              console.log(`    [${i}] arguments 解析失败:`, e.message);
            }
          }
        }
      }
    }

    // 打印完整原始响应（JSON格式）
    console.log('\n完整原始响应 (JSON):');
    console.log(JSON.stringify(result2.rawResponse, null, 2)?.substring(0, 5000));

  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTest().catch(console.error);
