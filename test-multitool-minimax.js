/**
 * MiniMax Multi-Tool Call 测试脚本
 *
 * 直接调用 MiniMax API 测试模型是否能够返回多个工具调用
 */

const https = require('https');
const http = require('http');

// API 配置
const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const API_URL = 'api.minimaxi.com';
const API_PATH = '/anthropic/v1/messages';
const MODEL = 'MiniMax-M2.5';

// 测试用的工具定义
const TOOLS = [
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to write'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        },
        language: {
          type: 'string',
          description: 'The programming language for syntax highlighting'
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to read'
        }
      },
      required: ['file_path']
    }
  }
];

// 系统提示
const SYSTEM_PROMPT = `You are an expert code generator. You must use the provided tools to generate files. Always respond with tool calls using the write_file tool.`;

// 测试用的用户提示 - 要求生成多个文件
const USER_PROMPT = `Generate the following 3 files:

1. Create a file at "package.json" with this content:
{"name": "test-project", "version": "1.0.0"}

2. Create a file at "vite.config.js" with this content:
export default { name: 'vite-config' };

3. Create a file at "src/index.js" with this content:
console.log('Hello World');

Use the write_file tool for each file.`;

/**
 * 发送 HTTP 请求
 */
function sendRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://${url}${API_PATH}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: API_PATH,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
        ...headers
      }
    };

    console.log(`\n========== 发送请求到 ${url} ==========`);
    console.log(`Method: ${method}`);
    console.log(`Headers:`, JSON.stringify(options.headers, null, 2));

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Response Status: ${res.statusCode}`);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 构建 Anthropic 格式的请求体
 */
function buildAnthropicRequest(model, systemPrompt, userPrompt, tools) {
  return {
    model: model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }))
  };
}

/**
 * 解析响应
 */
function parseResponse(responseData) {
  try {
    const parsed = JSON.parse(responseData);
    return parsed;
  } catch (e) {
    console.error('Failed to parse response:', e.message);
    return null;
  }
}

/**
 * 统计工具调用
 */
function countToolCalls(response) {
  if (!response || !response.content) {
    return { total: 0, write_file: 0, read_file: 0, text: 0 };
  }

  const content = response.content;
  const counts = {
    total: content.length,
    write_file: 0,
    read_file: 0,
    text: 0
  };

  content.forEach(item => {
    if (item.type === 'tool_use') {
      if (item.name === 'write_file') counts.write_file++;
      else if (item.name === 'read_file') counts.read_file++;
    } else if (item.type === 'text') {
      counts.text++;
    }
  });

  return counts;
}

/**
 * 运行测试
 */
async function runTest() {
  console.log('========================================');
  console.log('MiniMax Multi-Tool Call 测试');
  console.log('========================================');
  console.log(`Model: ${MODEL}`);
  console.log(`API URL: ${API_URL}${API_PATH}`);

  // 构建请求
  const requestBody = buildAnthropicRequest(
    MODEL,
    SYSTEM_PROMPT,
    USER_PROMPT,
    TOOLS
  );

  console.log('\n---------- 请求体 ----------');
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    // 发送请求
    const response = await sendRequest(
      API_URL,
      'POST',
      {},
      requestBody
    );

    console.log('\n---------- 响应 ----------');
    console.log(`Status: ${response.status}`);

    const parsedResponse = parseResponse(response.data);
    if (!parsedResponse) {
      console.log('Raw Response:', response.data.substring(0, 2000));
      return;
    }

    console.log('\n---------- 响应内容 ----------');
    console.log(JSON.stringify(parsedResponse, null, 2).substring(0, 3000));

    // 分析工具调用
    if (parsedResponse.content) {
      const counts = countToolCalls(parsedResponse);
      console.log('\n========================================');
      console.log('工具调用统计:');
      console.log(`  总 content 块数: ${counts.total}`);
      console.log(`  write_file 调用: ${counts.write_file}`);
      console.log(`  read_file 调用: ${counts.read_file}`);
      console.log(`  text 块: ${counts.text}`);
      console.log('========================================');

      if (counts.write_file >= 3) {
        console.log('\n✅ 测试通过: 模型返回了 3 个 write_file 调用');
      } else if (counts.write_file === 0 && counts.text > 0) {
        console.log('\n❌ 测试失败: 模型没有返回工具调用，只返回了文本');
        console.log('模型可能不支持 multi_tool_call 或选择不使用工具');
      } else {
        console.log(`\n⚠️ 部分成功: 模型返回了 ${counts.write_file} 个 write_file 调用，预期 3 个`);
      }

      // 显示具体的工具调用
      console.log('\n---------- 工具调用详情 ----------');
      parsedResponse.content.forEach((item, index) => {
        if (item.type === 'tool_use') {
          console.log(`\n[${index + 1}] Tool: ${item.name}`);
          if (item.input) {
            const input = typeof item.input === 'string' ? JSON.parse(item.input) : item.input;
            console.log(`    file_path: ${input.file_path || 'N/A'}`);
            console.log(`    content 长度: ${input.content?.length || 0}`);
          }
        } else if (item.type === 'text') {
          console.log(`\n[${index + 1}] Text: ${item.text?.substring(0, 200)}...`);
        }
      });
    }

    // 检查错误
    if (parsedResponse.error) {
      console.error('\n---------- API 错误 ----------');
      console.error(JSON.stringify(parsedResponse.error, null, 2));
    }

    // 显示 usage
    if (parsedResponse.usage) {
      console.log('\n---------- 使用量 ----------');
      console.log(JSON.stringify(parsedResponse.usage, null, 2));
    }

  } catch (error) {
    console.error('\n========== 请求错误 ==========');
    console.error(error.message);
    console.error(error.stack);
  }
}

// 运行测试
runTest();
