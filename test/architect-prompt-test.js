/**
 * 架构师模型 Prompt 测试脚本
 *
 * 使用实际请求数据测试架构师模型，并模拟编排器的结构化解析机制
 *
 * 修改内容：
 * - max_tokens: 320000 -> 480000
 * - temperature: 0.3 -> 0.5
 * - 优化 Prompt，强调必须为所有文件生成分组
 */

const fs = require('fs');
const path = require('path');

// 加载 DeepSeekLLMClient
const DeepSeekLLMClient = require('../src/decomposer/llm/DeepSeekLLMClient');

// ============================================================
// 配置加载 - 从 config.json 读取
// ============================================================

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const REQUEST_FILE = path.join(__dirname, '..', 'requests', 'ecommerce-platform-request.json');

let CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-pro',
  thinking: true,
  reasoningEffort: 'high',
  maxTokens: 393000,  // API 最大限制 393216
  temperature: 0.5,   // 降低温度增加稳定性
  timeout: 600000
};

try {
  const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const deepseekProvider = configData.Providers.find(p => p.name === 'deepseek');
  if (deepseekProvider) {
    CONFIG.apiKey = deepseekProvider.api_key || process.env.DEEPSEEK_API_KEY || '';
    CONFIG.baseUrl = deepseekProvider.api_base_url || CONFIG.baseUrl;
    const architectModel = deepseekProvider.models.find(m => m.id === 'deepseek-v4-pro');
    if (architectModel) {
      CONFIG.model = architectModel.id;
    }
    console.log('[配置加载] DeepSeek 配置:');
    console.log(`  API URL: ${CONFIG.baseUrl}`);
    console.log(`  Model: ${CONFIG.model}`);
  }
} catch (error) {
  console.warn('[配置加载] 读取配置文件失败:', error.message);
}

CONFIG.apiKey = process.env.DEEPSEEK_API_KEY || CONFIG.apiKey;
if (process.env.DEEPSEEK_BASE_URL) CONFIG.baseUrl = process.env.DEEPSEEK_BASE_URL;
if (process.env.DEEPSEEK_MODEL) CONFIG.model = process.env.DEEPSEEK_MODEL;

// ============================================================
// 加载实际请求数据
// ============================================================

let requestData;
try {
  requestData = JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf-8'));
  console.log('[请求数据] 加载自:', REQUEST_FILE);
} catch (error) {
  console.error('[错误] 无法加载请求文件:', error.message);
  process.exit(1);
}

const implementationPlan = requestData.implementation_plan;
const task = requestData.task;
const deliverables = task.deliverables;

console.log(`[请求数据] 技术栈: ${implementationPlan.tech_stack?.join(', ')}`);
console.log(`[请求数据] 任务: ${task.title}`);
console.log(`[请求数据] Deliverables 数量: ${deliverables.length}`);

// ============================================================
// Prompt 构建 - 优化版
// ============================================================

function buildContractGenerationPrompt(task, implementationPlan, deliverables = []) {
  const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
  const requirements = task.requirement || task.title || '未提供需求描述';

  // 格式化 deliverables 列表
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

  // 【优化】生成完整的文件路径列表
  const allFilePaths = deliverables
    .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
    .map(d => d.filePath)
    .join('\n');

  return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}
${deliverablesSection}

## 【重要】必须为以下所有文件生成类型定义分组

你必须为以下每一个 TypeScript 文件生成对应的类型定义分组，**一个都不能遗漏**：

${allFilePaths}

## 输出要求

【关键】你必须一次性调用 write_file 工具两次，同时生成以下两个文件：

1. write_file 工具调用 #1 - 契约文件:
   - file_path: "contracts/api.json"
   - content: 完整的 OpenAPI 3.0 JSON 规范，包含所有 API 端点和 schema 定义

2. write_file 工具调用 #2 - 类型定义文件:
   - file_path: "types/index.ts"
   - content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 类型定义格式示例

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
\`\`\`

## 【关键要求】

1. **必须为所有文件生成分组** - 包括但不限于：
   - server/database/db.ts
   - server/index.ts
   - server/routes/auth.ts
   - server/routes/products.ts
   - server/routes/cart.ts
   - server/routes/orders.ts
   - src/App.tsx
   - src/main.tsx
   - src/services/api.ts
   - 所有 src/pages/*.tsx 文件
   - 所有 src/components/*.tsx 文件

2. **// [FILE: <path>] 中的 <path> 必须与待生成文件列表中的路径完全一致**

3. **不要遗漏任何文件** - 每个 TypeScript 文件都必须有对应的分组

## 示例响应格式

你的响应中应包含两个 tool_call，例如：

tool_calls: [
  {
    "name": "write_file",
    "arguments": {"file_path": "contracts/api.json", "content": "{\"openapi\": \"3.0.0\", ...}"}
  },
  {
    "name": "write_file",
    "arguments": {"file_path": "types/index.ts", "content": "// [COMMON]\nexport interface ApiError {...}\n\n// [FILE: server/database/db.ts]\nexport interface DbUser {...}\n\n// [FILE: server/routes/auth.ts]\nexport interface JwtPayload {...}"}
  }
]

请立即生成这两个文件，确保为所有文件都生成了类型定义分组，不要遗漏任何文件。`;
}

// ============================================================
// 辅助函数 - 与编排器中的 PromptGenerator 完全一致
// ============================================================

function parseGroupedTypesContent(typesContent) {
  if (!typesContent || typeof typesContent !== 'string') {
    return { commonTypes: '', fileTypesMap: {} };
  }

  const result = {
    commonTypes: '',
    fileTypesMap: {}
  };

  const lines = typesContent.split('\n');
  let currentSection = 'commonTypes';
  let currentContent = [];
  let currentFilePath = null;

  for (const line of lines) {
    const fileMatch = line.match(/^\/\/\s*\[FILE:\s*([^\]]+)\]/);
    const commonMatch = line.match(/^\/\/\s*\[COMMON\]/);

    if (fileMatch) {
      if (currentFilePath) {
        result.fileTypesMap[currentFilePath] = currentContent.join('\n');
      }
      currentFilePath = fileMatch[1].trim();
      currentContent = [];
    } else if (commonMatch) {
      if (currentFilePath) {
        result.fileTypesMap[currentFilePath] = currentContent.join('\n');
      }
      currentSection = 'commonTypes';
      currentFilePath = null;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentFilePath) {
    result.fileTypesMap[currentFilePath] = currentContent.join('\n');
  } else if (currentContent.length > 0) {
    result.commonTypes = currentContent.join('\n');
  }

  return result;
}

function getTypesForFile(typesContent, filePath) {
  const { commonTypes, fileTypesMap } = parseGroupedTypesContent(typesContent);

  if (fileTypesMap[filePath]) {
    return commonTypes + (commonTypes ? '\n\n' : '') + fileTypesMap[filePath];
  }

  const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
  for (const [key, value] of Object.entries(fileTypesMap)) {
    if (key.replace(/\.(ts|tsx)$/, '') === normalizedFilePath) {
      return commonTypes + (commonTypes ? '\n\n' : '') + value;
    }
  }

  return commonTypes;
}

function extractTypeNames(typesCode) {
  if (!typesCode) return [];
  const names = [];
  const interfaceMatches = typesCode.matchAll(/export\s+interface\s+(\w+)/g);
  for (const match of interfaceMatches) {
    names.push(match[1]);
  }
  const typeMatches = typesCode.matchAll(/export\s+type\s+(\w+)/g);
  for (const match of typeMatches) {
    names.push(match[1]);
  }
  return names;
}

function buildTypeContent(deliverable, implementationPlan) {
  const filePath = deliverable?.filePath || '';
  const typesContent = implementationPlan?._typesDeliverableContent ||
                       implementationPlan?.generated_types ||
                       implementationPlan?.auto_generated_types;

  if (!typesContent) {
    return '';
  }

  const { commonTypes, fileTypesMap } = parseGroupedTypesContent(typesContent);

  const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
  let fileTypes = fileTypesMap[filePath];

  if (!fileTypes) {
    for (const [key, value] of Object.entries(fileTypesMap)) {
      const normalizedKey = key.replace(/\.(ts|tsx)$/, '');
      if (normalizedKey === normalizedFilePath) {
        fileTypes = value;
        break;
      }
    }
  }

  if (fileTypes || commonTypes) {
    const relevantTypes = fileTypes || '';
    const finalTypes = commonTypes + (commonTypes && relevantTypes ? '\n\n' : '') + relevantTypes;

    if (finalTypes.trim()) {
      console.log(`[PromptGenerator] 按需注入类型 for ${filePath}: ${fileTypes ? '包含文件类型' : '仅通用类型'}`);

      const typeNames = extractTypeNames(relevantTypes);
      const commonTypeNames = extractTypeNames(commonTypes);
      const allTypeNames = [...new Set([...commonTypeNames, ...typeNames])];

      const importStatement = allTypeNames.length > 0
        ? `import type { ${allTypeNames.join(', ')} } from '../types';`
        : '';

      return {
        finalTypes,
        importStatement,
        hasFileTypes: !!fileTypes,
        hasCommonTypes: !!commonTypes
      };
    }
  }

  console.log('[PromptGenerator] 结构化解析失败，使用完整类型定义');
  const fallbackTypeNames = extractTypeNames(typesContent);
  const fallbackImport = fallbackTypeNames.length > 0
    ? `import type { ${fallbackTypeNames.join(', ')} } from '../types';`
    : '';

  return {
    finalTypes: typesContent,
    importStatement: fallbackImport,
    hasFileTypes: false,
    hasCommonTypes: false,
    fallback: true
  };
}

// ============================================================
// 主测试函数
// ============================================================

async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('架构师模型 Prompt 测试 (优化版)');
  console.log('='.repeat(60));
  console.log('\n配置变更:');
  console.log(`  max_tokens: 320000 -> ${CONFIG.maxTokens}`);
  console.log(`  temperature: 0.3 -> ${CONFIG.temperature}`);
  console.log('  Prompt: 优化强调为所有文件生成分组');

  if (!CONFIG.apiKey) {
    console.error('\n错误: DeepSeek API Key 未设置');
    process.exit(1);
  }

  const prompt = buildContractGenerationPrompt(task, implementationPlan, deliverables);

  const promptFile = path.join(__dirname, 'architect-prompt-optimized.txt');
  fs.writeFileSync(promptFile, prompt, 'utf-8');
  console.log(`\nPrompt 已保存到: ${promptFile}`);
  console.log(`Prompt 长度: ${prompt.length} 字符`);

  const llmClient = new DeepSeekLLMClient({
    apiKey: CONFIG.apiKey,
    baseUrl: CONFIG.baseUrl,
    model: CONFIG.model,
    timeout: CONFIG.timeout,
    maxRetries: 3,
    thinking: CONFIG.thinking,
    reasoningEffort: CONFIG.reasoningEffort,
    maxTokens: CONFIG.maxTokens
  });

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

  try {
    console.log('\n开始调用架构师模型...');
    console.log('(启用思考模式，这可能需要较长时间)\n');

    const startTime = Date.now();
    const result = await llmClient.chatWithTools(prompt, {
      model: CONFIG.model,
      temperature: CONFIG.temperature,
      maxTokens: CONFIG.maxTokens,
      timeout: CONFIG.timeout,
      thinking: CONFIG.thinking,
      reasoningEffort: CONFIG.reasoningEffort,
      tools: [writeFileTool]
    });
    const elapsedTime = Date.now() - startTime;

    console.log(`\n请求完成，耗时: ${(elapsedTime / 1000).toFixed(1)}s`);
    console.log(`finish_reason: ${result.finishReason}`);

    // ============================================================
    // 1. 工具调用
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('模型返回的工具调用');
    console.log('='.repeat(60));

    let typesContent = '';
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log(`\n工具调用数量: ${result.toolCalls.length}`);

      for (let i = 0; i < result.toolCalls.length; i++) {
        const toolCall = result.toolCalls[i];
        console.log(`\n--- 工具调用 #${i + 1} ---`);

        let args;
        try {
          args = typeof toolCall.arguments === 'string'
            ? JSON.parse(toolCall.arguments)
            : toolCall.arguments;
        } catch (e) {
          args = { raw: toolCall.arguments };
        }

        console.log(`文件路径: ${args.file_path || 'N/A'}`);

        if (args.content) {
          const fileName = (args.file_path || `unknown_${i}`).replace(/[\/\\]/g, '_');
          const outputFile = path.join(__dirname, `architect-optimized_${fileName}`);
          fs.writeFileSync(outputFile, args.content, 'utf-8');
          console.log(`内容长度: ${args.content.length} 字符`);
          console.log(`内容已保存到: ${outputFile}`);

          if (args.file_path === 'types/index.ts' || args.file_path === 'src/types/index.ts') {
            typesContent = args.content;
          }
        }
      }
    } else {
      console.log('\n没有返回工具调用');
      console.log('finish_reason:', result.finishReason);
    }

    // ============================================================
    // 2. 结构化解析测试
    // ============================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('结构化解析验证');
    console.log('='.repeat(60));

    if (typesContent) {
      console.log(`\n类型定义内容长度: ${typesContent.length} 字符`);

      const { commonTypes, fileTypesMap } = parseGroupedTypesContent(typesContent);

      console.log('\n--- 分组解析结果 ---');
      console.log(`commonTypes 长度: ${commonTypes.length} 字符`);
      console.log(`fileTypesMap 文件数: ${Object.keys(fileTypesMap).length}`);

      console.log('\n--- 分组详情 ---');
      for (const [filePath, content] of Object.entries(fileTypesMap)) {
        const trimmed = content.trim();
        const status = trimmed.length === 0 ? ' [空内容！]' : '';
        console.log(`  ${filePath}: ${trimmed.length} 字符${status}`);
      }

      // ============================================================
      // 3. 文件覆盖率检查
      // ============================================================
      console.log('\n\n' + '='.repeat(60));
      console.log('文件覆盖率检查');
      console.log('='.repeat(60));

      const tsDeliverables = deliverables.filter(d =>
        d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx')
      );

      const matched = [];
      const missing = [];

      for (const deliverable of tsDeliverables) {
        const fp = deliverable.filePath;
        const normalized = fp.replace(/\.(ts|tsx)$/, '');
        let found = false;

        for (const key of Object.keys(fileTypesMap)) {
          if (key === fp || key.replace(/\.(ts|tsx)$/, '') === normalized) {
            found = true;
            break;
          }
        }

        if (found) {
          matched.push(fp);
        } else {
          missing.push(fp);
        }
      }

      console.log(`\n覆盖率: ${matched.length}/${tsDeliverables.length}`);
      if (matched.length > 0) {
        console.log('\n已匹配:');
        matched.forEach(m => console.log(`  ✅ ${m}`));
      }
      if (missing.length > 0) {
        console.log('\n缺失:');
        missing.forEach(m => console.log(`  ❌ ${m}`));
      }

      // ============================================================
      // 4. 按需注入测试
      // ============================================================
      console.log('\n\n' + '='.repeat(60));
      console.log('按需注入测试');
      console.log('='.repeat(60));

      implementationPlan._typesDeliverableContent = typesContent;

      let successCount = 0;
      let fallbackCount = 0;

      for (const deliverable of tsDeliverables) {
        const result = buildTypeContent(deliverable, implementationPlan);
        if (!result) continue;

        if (result.fallback || result.finalTypes.trim().length === 0) {
          fallbackCount++;
        } else {
          successCount++;
        }
      }

      console.log(`\n成功: ${successCount}, 回退: ${fallbackCount}`);

    } else {
      console.log('\n未找到类型定义文件');
    }

    // ============================================================
    // 5. 总结
    // ============================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('测试总结');
    console.log('='.repeat(60));

    console.log(`  工具调用: ${result.toolCalls?.length || 0} 个`);
    console.log(`  类型内容: ${typesContent.length} 字符`);
    console.log(`  分组数量: ${Object.keys(parseGroupedTypesContent(typesContent).fileTypesMap).length}`);
    console.log(`  总耗时: ${(elapsedTime / 1000).toFixed(1)}s`);
    console.log('\n测试完成！\n');

  } catch (error) {
    console.error('\n错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest();
