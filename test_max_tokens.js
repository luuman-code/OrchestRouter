/**
 * 测试不同 max_tokens 对工具调用数量的影响
 */
const https = require('https');

const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';

const filesToGenerate = [
  { filePath: 'src/components/Header.tsx', description: '页头组件' },
  { filePath: 'src/components/ProductCard.tsx', description: '商品卡片组件' },
  { filePath: 'src/components/CartItem.tsx', description: '购物车项组件' },
  { filePath: 'src/components/Button.tsx', description: '按钮组件' },
  { filePath: 'src/components/Input.tsx', description: '输入框组件' },
  { filePath: 'src/pages/Home.tsx', description: '首页' },
  { filePath: 'src/pages/Login.tsx', description: '登录页' },
  { filePath: 'src/pages/Register.tsx', description: '注册页' },
  { filePath: 'src/pages/Cart.tsx', description: '购物车页' },
];

const systemPrompt = `## Output Rules
CRITICAL: Use write_file tool for EACH file listed below.
1. Generate complete code for ALL listed files using write_file tool
2. Import only from files in deliverables (no external deps, no separate CSS files)
3. No text output, comments, TODOs, or placeholders

## Type Source (MANDATORY)
All types MUST be imported from: src/types/index.ts
Do NOT define types like User, Product in any other file.

## IMPORTANT Rules:
1. You MUST return a write_file tool call for EVERY file listed below
2. Do NOT combine multiple files into one tool call
3. Each tool_call must have the correct file_path matching the Files to Generate list
4. Return ALL tool calls in a single response
5. The content must be complete, runnable code - no placeholders or TODOs`;

const deliverableList = filesToGenerate.map((d, idx) => {
  return `${idx + 1}. ${d.description} -> FILE: ${d.filePath}`;
}).join('\n');

const userPrompt = `## CRITICAL: MULTIPLE FILES TASK - ${filesToGenerate.length} files to generate
You MUST use the write_file tool to generate ALL ${filesToGenerate.length} files listed below.

## Files to Generate:
${deliverableList}

## Output Format - MUST USE write_file TOOL:
You MUST return a separate write_file tool call for EACH file in the list above.

Example format (for 2 files):
tool_call: {"name": "write_file", "input": {"file_path": "src/pages/Home.tsx", "content": "export default function Home() { ... }"}}
tool_call: {"name": "write_file", "input": {"file_path": "src/pages/Login.tsx", "content": "export default function Login() { ... }"}}

## IMPORTANT Rules:
1. You MUST return a write_file tool call for EVERY file listed above
2. Do NOT combine multiple files into one tool call
3. Each tool_call must have the correct file_path matching the Files to Generate list
4. Return ALL tool calls in a single response
5. The content must be complete, runnable code - no placeholders or TODOs`;

const tools = [
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The path to the file to write' },
        content: { type: 'string', description: 'The content to write to the file' }
      },
      required: ['file_path', 'content']
    }
  }
];

async function testMaxTokens(maxTokens) {
  return new Promise((resolve, reject) => {
    const requestBody = {
      model: 'MiniMax-M2.5-highspeed',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: tools,
      tool_choice: { type: 'auto' }
    };

    const data = JSON.stringify(requestBody);

    const options = {
      hostname: 'api.minimaxi.com',
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Testing max_tokens effect on tool call count ===\n');

  const maxTokensList = [4096, 8192, 12000, 16000];

  for (const maxTokens of maxTokensList) {
    console.log(`\nTesting max_tokens = ${maxTokens}...`);
    try {
      const response = await testMaxTokens(maxTokens);
      const contentItems = response.content || [];
      const toolUses = contentItems.filter(item => item.type === 'tool_use');
      console.log(`  Tool calls returned: ${toolUses.length}`);

      if (response.usage) {
        console.log(`  Usage: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
