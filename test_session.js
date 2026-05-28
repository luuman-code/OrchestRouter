/**
 * 测试 x-session-id 是否会影响响应
 * 向有问题的 session ID 发送请求，看是否还会返回错误内容
 */
const https = require('https');

const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const BASE_URL = 'api.minimaxi.com';

const PROMPT = `# 项目: 电商平台

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
- NO EMPTY IMPORTS: 禁止空的导入语句
- USE RELATIVE PATHS: 必须使用相对路径

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

async function sendRequest(sessionId = null) {
  return new Promise((resolve, reject) => {
    const body = {
      model: 'MiniMax-M2.5-highspeed',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: PROMPT }]
      }],
      max_tokens: 8192,
      temperature: 1.0,
      system: SYSTEM_PROMPT
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'anthropic-version': '2023-06-01'
    };

    // 如果传入了 session ID，添加到请求头
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: headers
    };

    console.log('=== 发送请求 ===');
    console.log('Session ID:', sessionId || '(无)');
    console.log('Headers:', JSON.stringify(headers, null, 2));

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const responseSessionId = res.headers['x-session-id'];
          console.log('\n=== 响应 ===');
          console.log('Response x-session-id:', responseSessionId);
          console.log('Status:', res.statusCode);

          if (parsed.content && Array.isArray(parsed.content)) {
            parsed.content.forEach((item, idx) => {
              if (item.type === 'thinking') {
                console.log(`\n[Thinking ${idx}]:`, item.thinking.substring(0, 200) + '...');
              } else if (item.type === 'text') {
                const textPreview = item.text.substring(0, 300);
                console.log(`\n[Text ${idx}]:`, textPreview + '...');

                // 检查是否包含关键词
                const hasNBA = item.text.includes('NBA') || item.text.includes('选秀');
                const hasEcommerce = item.text.includes('电商') || item.text.includes('购物车');
                console.log(`\n关键词检测:`);
                console.log(`  - NBA/选秀: ${hasNBA ? '❌ 有' : '✅ 无'}`);
                console.log(`  - 电商/购物车: ${hasEcommerce ? '✅ 有' : '❌ 无'}`);
              }
            });
          }

          resolve({
            sessionId: responseSessionId,
            data: parsed
          });
        } catch (e) {
          console.error('解析失败:', e.message);
          console.log('原始响应:', data.substring(0, 500));
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

async function main() {
  const problemSessionId = '45fa0517cde5a58b84ec451381158704';

  console.log('========== 测试1: 不传递 session ID ==========\n');
  const result1 = await sendRequest(null);

  console.log('\n\n========== 测试2: 传递有问题的 session ID ==========\n');
  const result2 = await sendRequest(problemSessionId);

  console.log('\n\n========== 对比结果 ==========');
  console.log('测试1 Session ID:', result1.sessionId);
  console.log('测试2 Session ID (传递):', problemSessionId);
  console.log('测试2 Session ID (响应):', result2.sessionId);
}

main().catch(console.error);
