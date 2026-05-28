/**
 * MiniMax Multi-Tool Call 测试 - OpenAI 兼容格式
 *
 * 测试 RequestBuilder 实际使用的 OpenAI 兼容格式
 */

const https = require('https');

// API 配置
const API_KEY = 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const API_URL = 'api.minimaxi.com';
const API_PATH = '/v1/chat/completions';
const MODEL = 'MiniMax-M2.5';

// 测试用的工具定义（OpenAI 格式）
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file at the specified path',
      parameters: {
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
            description: 'The programming language'
          }
        },
        required: ['file_path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
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
  }
];

// 系统提示
const SYSTEM_PROMPT = `You are an expert code generator. You must use the provided tools to generate files.`;

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
function sendRequest(url, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://${url}${path}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        ...headers
      }
    };

    console.log(`\n========== 发送请求到 ${url}${path} ==========`);
    console.log(`Method: ${method}`);

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
 * 构建 OpenAI 兼容格式的请求体（模拟 RequestBuilder）
 */
function buildOpenAIRequest(model, systemPrompt, userPrompt, tools, toolChoice = 'auto') {
  return {
    model: model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    tools: tools,
    tool_choice: toolChoice,  // 测试不同的 tool_choice 值
    temperature: 0.7,
    max_tokens: 4096
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
  if (!response || !response.choices || response.choices.length === 0) {
    return { total: 0, write_file: 0, read_file: 0 };
  }

  const message = response.choices[0]?.message;
  if (!message) {
    return { total: 0, write_file: 0, read_file: 0 };
  }

  const toolCalls = message.tool_calls || [];
  const counts = {
    total: toolCalls.length,
    write_file: 0,
    read_file: 0
  };

  toolCalls.forEach(tc => {
    if (tc.function?.name === 'write_file') {
      counts.write_file++;
    } else if (tc.function?.name === 'read_file') {
      counts.read_file++;
    }
  });

  return counts;
}

/**
 * 运行测试
 */
async function runTest(toolChoice = 'auto') {
  console.log('========================================');
  console.log(`MiniMax Multi-Tool Call 测试 - tool_choice: ${toolChoice}`);
  console.log('========================================');
  console.log(`Model: ${MODEL}`);
  console.log(`API URL: ${API_URL}${API_PATH}`);

  // 构建请求
  const requestBody = buildOpenAIRequest(
    MODEL,
    SYSTEM_PROMPT,
    USER_PROMPT,
    TOOLS,
    toolChoice
  );

  console.log('\n---------- 请求体 ----------');
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    // 发送请求
    const response = await sendRequest(
      API_URL,
      API_PATH,
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
    const counts = countToolCalls(parsedResponse);
    console.log('\n========================================');
    console.log('工具调用统计:');
    console.log(`  tool_choice = ${toolChoice}`);
    console.log(`  tool_calls 总数: ${counts.total}`);
    console.log(`  write_file 调用: ${counts.write_file}`);
    console.log(`  read_file 调用: ${counts.read_file}`);
    console.log('========================================');

    // 显示具体的工具调用
    if (parsedResponse.choices?.[0]?.message?.tool_calls) {
      console.log('\n---------- 工具调用详情 ----------');
      parsedResponse.choices[0].message.tool_calls.forEach((tc, index) => {
        console.log(`\n[${index + 1}] Tool: ${tc.function?.name}`);
        try {
          const args = JSON.parse(tc.function?.arguments || '{}');
          console.log(`    file_path: ${args.file_path || 'N/A'}`);
          console.log(`    content 长度: ${args.content?.length || 0}`);
        } catch (e) {
          console.log(`    arguments: ${tc.function?.arguments}`);
        }
      });
    }

    // 显示 usage
    if (parsedResponse.usage) {
      console.log('\n---------- 使用量 ----------');
      console.log(JSON.stringify(parsedResponse.usage, null, 2));
    }

    // 显示 finish_reason
    if (parsedResponse.choices?.[0]?.finish_reason) {
      console.log(`\nfinish_reason: ${parsedResponse.choices[0].finish_reason}`);
    }

    return counts;

  } catch (error) {
    console.error('\n========== 请求错误 ==========');
    console.error(error.message);
    return { total: 0, write_file: 0, read_file: 0, error: true };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n');
  console.log('################################################');
  console.log('# 测试 1: tool_choice = "auto"');
  console.log('################################################');
  const result1 = await runTest('auto');

  console.log('\n\n');
  console.log('################################################');
  console.log('# 测试 2: tool_choice = "required"');
  console.log('################################################');
  const result2 = await runTest('required');

  console.log('\n\n');
  console.log('################################################');
  console.log('# 测试结果对比');
  console.log('################################################');
  console.log(`tool_choice="auto":     write_file 调用 = ${result1.write_file}`);
  console.log(`tool_choice="required": write_file 调用 = ${result2.write_file}`);

  if (result1.write_file >= 3 && result2.write_file >= 3) {
    console.log('\n✅ 两个配置都能返回多个工具调用');
  } else if (result1.write_file < 3 && result2.write_file >= 3) {
    console.log('\n⚠️ 建议将 tool_choice 改为 "required"');
  } else {
    console.log('\n❌ 两个配置都无法返回多个工具调用');
  }
}

main();
