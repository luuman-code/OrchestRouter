/**
 * 打印编排器发送的完整 prompt
 */
const https = require('https');

const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const BASE_URL = 'api.minimaxi.com';

// 从 orchestrator_test.log 中提取的完整 prompt (1225 chars)
const USER_PROMPT = `# 项目: 电商平台

## 需求描述
实现一个电商平台，包含商品展示和购物车功能

## 当前任务
## 🎯 GENERATE THIS FILE

File Path: index.html
Description: HTML入口文件
Type: unknown

Please generate the complete code for the file above.

## IMPLEMENTATION PLAN

### Tech Stack: React, TypeScript, Vite

### Architecture Patterns: SPA

### Code Standards: no_empty_imports, use_relative_paths
### Code Standards (IMPORTANT):
- NO EMPTY IMPORTS: 禁止空的导入语句，如 \`import { } from "module"\` 或只有路径没有导入任何内容
- USE RELATIVE PATHS: 必须使用相对路径，如 \`./components/Button\` 或 \`../utils/helper\`，禁止使用绝对路径

### Path Conventions: files: kebab-case, components: PascalCase, functions: camelCase

### Best Practices (MUST FOLLOW):
- ⚠️ 只生成 deliverables 指定的文件，不要生成其他文件
- 不要生成测试文件
- 返回完整代码，不要返回占位符或 TODO


## 所有项目文件 (仅参考)
总计: 2 个文件

⚠️ 重要: 你只需要生成标记为 [当前任务] 的文件

1. 👉 [当前任务 - 生成此文件]
   文件: index.html
   描述: HTML入口文件

2. ⏭️ [跳过 - 其他子任务]
   文件: src/main.tsx
   描述: React应用主入口

---
👉 以上是你的任务: 只生成标记为 [当前任务] 的文件

# 优先级: medium`;

async function sendRequest() {
  return new Promise((resolve, reject) => {
    const body = {
      model: 'MiniMax-M2.5-highspeed',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: USER_PROMPT }]
      }],
      max_tokens: 8192,
      temperature: 1.0,
      system: `## 输出规则
- 只生成指定的文件: index.html
- 不生成其他文件
- 输出完整可运行的代码
- 不要占位符或 TODO
- 不要空导入
- 使用相对路径

### Code Standards:
- NO EMPTY IMPORTS: 禁止空的导入语句
- USE RELATIVE PATHS: 必须使用相对路径

### Best Practices:
- 只生成 deliverables 指定的文件，不要生成其他文件
- 不要生成测试文件
- 返回完整代码，不要返回占位符或 TODO`
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    };

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: headers
    };

    console.log('=== 发送请求 (编排器完整版) ===');
    console.log('User prompt length:', USER_PROMPT.length);
    console.log('\n=== 完整 User Prompt ===');
    console.log(USER_PROMPT);
    console.log('\n=== 完整 System Prompt ===');
    console.log(body.system);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.content && Array.isArray(parsed.content)) {
            parsed.content.forEach((item, idx) => {
              if (item.type === 'thinking') {
                console.log(`\n=== Thinking ${idx} ===`);
                console.log(item.thinking.substring(0, 500) + '...');
              } else if (item.type === 'text') {
                console.log(`\n=== Text ${idx} ===`);
                console.log(item.text.substring(0, 300) + '...');

                const hasNBA = item.text.includes('NBA') || item.text.includes('选秀') || item.text.includes('wizard') || item.text.includes('form');
                const hasEcommerce = item.text.includes('电商') || item.text.includes('购物车') || item.text.includes('e-commerce') || item.text.includes('product');
                console.log(`\n关键词检测:`);
                console.log(`  - NBA/选秀/wizard/form: ${hasNBA ? '❌ 有' : '✅ 无'}`);
                console.log(`  - 电商/购物车/e-commerce/product: ${hasEcommerce ? '✅ 有' : '❌ 无'}`);
              }
            });
          }

          resolve(parsed);
        } catch (e) {
          console.error('解析失败:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('请求失败:', e.message);
      reject(e);
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

sendRequest().catch(console.error);
