/**
 * DeepSeek 多工具调用测试脚本
 * 测试 DeepSeek 模型是否支持返回 12 个工具调用格式
 */

const https = require('https');

// DeepSeek API 配置
const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = 'api.deepseek.com';
const MODEL = 'deepseek-chat';

function makeRequest(messages, systemPrompt, tools) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: MODEL,
      messages: messages,
      system: systemPrompt,
      max_tokens: 32000,
      temperature: 1.0,
      tools: tools,
      tool_choice: { type: "auto" }
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

    console.log('Sending request to', options.hostname + options.path);
    const req = https.request(options, (res) => {
      console.log('Response status:', res.statusCode);
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('Raw response length:', data.length);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 500)}`));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(180000); // 3分钟超时
    req.write(postData);
    req.end();
  });
}

// 定义工具
const tools = [
  {
    name: "write_file",
    description: "写入文件内容到指定路径",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "文件路径" },
        content: { type: "string", description: "文件内容" },
        language: { type: "string", description: "语言类型(可选)" }
      },
      required: ["file_path", "content"]
    }
  }
];

// 测试提示：要求生成 12 个文件
const testPrompt = `请为电商平台项目生成以下 12 个文件，每个文件都必须使用 write_file 工具单独生成：

1. src/types/index.ts - TypeScript 类型定义（User, Product, CartItem, Order 接口）
2. src/services/api.ts - API 服务层（封装 fetch 调用后端 API）
3. src/components/Header.tsx - 页头导航组件（Logo, 导航链接, 用户菜单）
4. src/components/ProductCard.tsx - 商品卡片组件（图片, 名称, 价格, 添加购物车按钮）
5. src/components/CartItem.tsx - 购物车项组件（商品信息, 数量调整, 删除按钮）
6. src/components/Button.tsx - 按钮组件（primary, secondary, danger 样式）
7. src/components/Input.tsx - 输入框组件（label, error, placeholder）
8. src/pages/Home.tsx - 首页（商品列表展示）
9. src/pages/Login.tsx - 登录页面（邮箱, 密码表单）
10. src/pages/Register.tsx - 注册页面（用户名, 邮箱, 密码表单）
11. src/pages/ProductList.tsx - 商品列表页（分类筛选, 搜索, 分页）
12. src/pages/Cart.tsx - 购物车页面（购物车列表, 总价计算, 结算按钮）

重要要求：
- 必须一次性返回全部 12 个 write_file 工具调用
- 每个文件内容必须完整，不能是占位符或 TODO
- 文件路径必须准确匹配上述要求`;

const systemPrompt = `你是一个代码生成助手。你必须使用 write_file 工具来生成代码文件。

重要规则：
1. 当需要生成文件时，必须使用 write_file 工具调用
2. 必须一次性返回 ALL 工具调用，不要分批
3. 每个工具调用必须生成完整的文件内容，不能省略任何代码
4. 不要在响应中包含任何解释性文本，只返回工具调用
5. 确保返回的 tool_use 数量与请求的文件数量一致

格式要求：
- 每个文件都是独立的工具调用
- 工具调用的 input 必须包含 file_path 和 content
- content 必须是完整的、可运行的代码`;

async function runTest() {
  console.log('=== DeepSeek 多工具调用测试 (12 个文件) ===\n');
  console.log('请求格式: Anthropic 格式 + tool_choice: {"type": "auto"}\n');
  console.log('期望: 返回 12 个 write_file 工具调用\n');

  try {
    const response = await makeRequest(
      [{ role: "user", content: testPrompt }],
      systemPrompt,
      tools
    );

    if (response.error) {
      console.log('\n错误:', response.error);
      return;
    }

    console.log('\n响应 usage:', response.usage);
    console.log('\n返回的 content 数量:', response.content.length);
    console.log('\n内容详情:');

    for (let i = 0; i < response.content.length; i++) {
      const item = response.content[i];
      console.log(`\n--- Content[${i}] ---`);
      console.log(`Type: ${item.type}`);

      if (item.type === 'tool_use') {
        console.log(`Tool: ${item.name}`);
        console.log(`File: ${item.input?.file_path || 'N/A'}`);
        console.log(`Content length: ${item.input?.content?.length || 0} chars`);
      } else if (item.type === 'text') {
        console.log(`Text: ${item.text?.substring(0, 200)}...`);
      } else if (item.type === 'thinking') {
        console.log(`Thinking: ${item.thinking?.substring(0, 100)}...`);
      }
    }

    // 分析结果
    const toolCalls = response.content.filter(c => c.type === 'tool_use');
    const filePaths = toolCalls.map(c => c.input?.file_path).filter(Boolean);

    console.log('\n=== 测试结果 ===');
    console.log(`工具调用数量: ${toolCalls.length}`);
    console.log(`期望数量: 12`);
    console.log(`\n生成的文件:`);
    filePaths.forEach((path, i) => console.log(`  ${i + 1}. ${path}`));

    if (toolCalls.length >= 12) {
      console.log('\n✅ 测试通过: 返回了 >= 12 个工具调用');
    } else if (toolCalls.length > 0) {
      console.log(`\n⚠️ 部分成功: 返回了 ${toolCalls.length} 个工具调用，缺少 ${12 - toolCalls.length} 个`);
    } else {
      console.log('\n❌ 测试失败: 没有返回工具调用');
    }
  } catch (error) {
    console.error('请求失败:', error.message);
  }
}

runTest();
