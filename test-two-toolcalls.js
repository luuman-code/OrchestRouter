/**
 * 测试脚本：验证模型能否一次性生成两个 tool_call
 *
 * 运行方式：node test-two-toolcalls.js
 */

const DeepSeekLLMClient = require('./src/decomposer/llm/DeepSeekLLMClient');

// 从配置文件读取 API Key
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const configPath = path.join(__dirname, 'config', 'config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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

// 测试用 deliverables
const testDeliverables = [
  { filePath: 'src/types/index.ts', type: 'types', description: '类型定义文件' },
  { filePath: 'src/pages/Home.tsx', type: 'ui', description: '首页' },
  { filePath: 'server/routes/auth.ts', type: 'api', description: '认证路由' },
];

// 修改后的 prompt - 要求一次性生成两个 tool_call
function buildTwoToolCallsPrompt(task, implementationPlan, deliverables = []) {
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
## 待生成文件列表
${fileList}`;
  }

  return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}
${deliverablesSection}

## 输出要求

【关键】你必须一次性调用 write_file 工具两次，同时生成以下两个文件：

1. write_file 工具调用 #1 - 契约文件:
   - file_path: "contracts/api.json"
   - content: 完整的 OpenAPI 3.0 JSON 规范，包含所有 API 端点和 schema 定义

2. write_file 工具调用 #2 - 类型定义文件:
   - file_path: "types/index.ts"
   - content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 示例

你应该在响应中包含两个 tool_call，例如：

tool_calls: [
  {
    "name": "write_file",
    "arguments": {"file_path": "contracts/api.json", "content": "{\"openapi\": \"3.0.0\", ...}"}
  },
  {
    "name": "write_file",
    "arguments": {"file_path": "types/index.ts", "content": "// [COMMON]\nexport interface ApiError {...}"}
  }
]

请立即生成这两个文件，不要先做其他事情。`;
}

async function runTest() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error('❌ 未找到 DeepSeek API Key');
    return;
  }

  console.log('='.repeat(60));
  console.log('测试：一次性生成两个 tool_call');
  console.log('='.repeat(60));

  const deepseekClient = new DeepSeekLLMClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: 'deepseek-v4-flash',
    timeout: 300000,
    maxRetries: 2
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
    title: '电商平台',
    requirement: '开发一个包含用户认证、商品展示、购物车的电商平台'
  };

  const implementationPlan = {
    tech_stack: ['React', 'TypeScript', 'Node.js', 'Express']
  };

  const prompt = buildTwoToolCallsPrompt(task, implementationPlan, testDeliverables);

  console.log('\n📋 Prompt 长度:', prompt.length, '字符');
  console.log('\n📡 发送请求...\n');

  try {
    const result = await deepseekClient.chatWithTools(prompt, {
      model: 'deepseek-v4-flash',
      temperature: 0.3,
      maxTokens: 320000,
      tools: [writeFileTool]
    });

    console.log('✅ 请求成功');
    console.log('finishReason:', result.finishReason);
    console.log('toolCalls 数量:', result.toolCalls?.length || 0);

    // 检查文件
    let hasContractsFile = false;
    let hasTypesFile = false;

    if (result.toolCalls) {
      for (const tc of result.toolCalls) {
        let parsedArgs = tc.arguments;
        if (typeof parsedArgs === 'string') {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch (e) {
            continue;
          }
        }

        const filePath = parsedArgs?.file_path || '';
        const contentLen = parsedArgs?.content?.length || 0;

        console.log(`  - ${tc.name}: ${filePath} (${contentLen} 字符)`);

        if (filePath.includes('contracts/api.json') || filePath.includes('openapi.json')) {
          hasContractsFile = true;
        }
        if (filePath.includes('types/index.ts')) {
          hasTypesFile = true;
        }
      }
    }

    console.log('\n文件检查:');
    console.log('  - contracts/api.json:', hasContractsFile ? '✅ 存在' : '❌ 缺失');
    console.log('  - types/index.ts:', hasTypesFile ? '✅ 存在' : '❌ 缺失');

    // 分析原始响应
    console.log('\n原始响应分析:');
    const rawMsg = result.rawResponse?.choices?.[0]?.message;
    console.log('  finish_reason:', result.rawResponse?.choices?.[0]?.finish_reason);
    console.log('  tool_calls in response:', rawMsg?.tool_calls?.length || 0);

    if (rawMsg?.tool_calls?.length > 1) {
      console.log('  ✅ 模型生成了多个 tool_call!');
    } else if (rawMsg?.tool_calls?.length === 1) {
      console.log('  ⚠️ 模型只生成了 1 个 tool_call');
    }

    // 检查 reasoning_content
    if (rawMsg?.reasoning_content) {
      console.log('\n思考内容 (reasoning_content):');
      console.log('  长度:', rawMsg.reasoning_content.length, '字符');
      console.log('  内容 (前 500 字):');
      console.log(rawMsg.reasoning_content.substring(0, 500));
    }

    // 打印原始响应结构
    console.log('\n完整响应结构:');
    console.log(JSON.stringify(result.rawResponse, null, 2)?.substring(0, 3000));

  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTest().catch(console.error);
