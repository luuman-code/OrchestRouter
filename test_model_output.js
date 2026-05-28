/**
 * 测试模型是否正确返回了9个工具调用格式
 * 使用 MiniMax-M2.5-highspeed 模型
 */
const https = require('https');
const fs = require('fs');

const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const API_BASE = 'https://api.minimaxi.com/anthropic/v1/messages';

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

function callModel() {
  return new Promise((resolve, reject) => {
    // MiniMax 使用 Anthropic 兼容格式
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

    const requestBody = {
      model: 'MiniMax-M2.5-highspeed',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
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
  console.log('=== Testing Model Output ===\n');
  console.log(`Model: MiniMax-M2.5-highspeed`);
  console.log(`Sending request to generate ${filesToGenerate.length} files...\n`);

  const response = await callModel();

  if (response.error) {
    console.log('API Error:', response.error);
    return;
  }

  // MiniMax 返回格式: { type: "message", content: [{ type: "tool_use", ... }, ...] }
  const contentItems = response.content || [];
  const toolUses = contentItems.filter(item => item.type === 'tool_use');

  console.log(`=== Tool Use Count ===`);
  console.log(`Found ${toolUses.length} tool_use blocks`);

  // Extract file paths
  const uniquePaths = new Set();
  console.log('\n=== File Paths Found ===');
  toolUses.forEach((tool, i) => {
    if (tool.input && tool.input.file_path) {
      uniquePaths.add(tool.input.file_path);
      console.log(`${i + 1}. ${tool.input.file_path}`);
    }
  });

  console.log(`\nTotal unique files: ${uniquePaths.size}`);
  console.log(`Expected files: ${filesToGenerate.length}`);

  if (uniquePaths.size !== filesToGenerate.length) {
    console.log('\n*** WARNING: Number of generated files does not match expected! ***');
    if (uniquePaths.size < filesToGenerate.length) {
      const missing = filesToGenerate.filter(f => !uniquePaths.has(f.filePath));
      console.log('Missing files:');
      missing.forEach(f => console.log(`  - ${f.filePath}`));
    }
  }

  // Save full response
  fs.writeFileSync('C:/Users/LWB/OrchestRouter/test_model_response.json', JSON.stringify(response, null, 2), 'utf8');
  console.log('\nFull response saved to test_model_response.json');
}

main().catch(console.error);
