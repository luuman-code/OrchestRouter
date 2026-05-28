/**
 * 直接调用 MiniMax API 测试 prompt
 */
const https = require('https');
const fs = require('fs');

// MiniMax API 配置 - 从 config.json 读取
const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const BASE_URL = 'api.minimaxi.com';
const MODEL = 'MiniMax-M2.5-highspeed';

// 完整的 prompt（从日志中提取的发送给模型的真正内容）
const FULL_PROMPT = `# 项目: 电商平台

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

const SYSTEM_PROMPT = `## 输出规则
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
- 返回完整代码，不要返回占位符或 TODO`;

async function callMiniMaxAPI() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: FULL_PROMPT }]
        }
      ],
      max_tokens: 8192,
      temperature: 1.0,
      system: SYSTEM_PROMPT
    });

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('=== 直接 API 调用测试 ===\n');
    console.log('URL:', `https://${BASE_URL}/anthropic/v1/messages`);
    console.log('Model:', MODEL);
    console.log('Prompt 长度:', FULL_PROMPT.length);
    console.log('System Prompt 长度:', SYSTEM_PROMPT.length);
    console.log('\n');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('响应状态:', res.statusCode);
          console.log('\n=== 原始响应 ===');

          if (parsed.content && Array.isArray(parsed.content)) {
            parsed.content.forEach((item, idx) => {
              if (item.type === 'thinking') {
                console.log(`\n[Thinking ${idx}]:`);
                console.log(item.thinking);
              } else if (item.type === 'text') {
                console.log(`\n[Text ${idx}]:`);
                console.log(item.text);
              }
            });

            // 保存完整响应
            fs.writeFileSync('C:/Users/LWB/OrchestRouter/direct_api_response.json', JSON.stringify(parsed, null, 2));
            console.log('\n\n完整响应已保存到 direct_api_response.json');
          } else {
            console.log(JSON.stringify(parsed, null, 2).substring(0, 1000));
          }

          resolve(parsed);
        } catch (e) {
          console.error('解析响应失败:', e.message);
          console.log('原始响应:', data.substring(0, 2000));
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('请求失败:', e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

callMiniMaxAPI().then(() => {
  console.log('\n=== 测试完成 ===');
}).catch(err => {
  console.error('测试失败:', err);
});
