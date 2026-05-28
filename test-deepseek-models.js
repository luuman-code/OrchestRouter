/**
 * DeepSeek API 测试脚本
 * 使用 Anthropic 兼容格式调用 deepseek-v4-flash 和 deepseek-v4-pro 模型
 */

const https = require('https');

// DeepSeek API 配置
const API_URL = 'api.deepseek.com';
const API_PATH = '/anthropic/v1/messages';
const API_KEY = process.env.DEEPSEEK_API_KEY;

const models = ['deepseek-v4-flash', 'deepseek-v4-pro'];

async function callDeepseekAPI(model, maxTokens = 100) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: 'Hello, respond with just "OK" to confirm the API is working.'
        }
      ]
    });

    const options = {
      hostname: API_URL,
      port: 443,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(postData),
        'anthropic-version': '2023-06-01'
      }
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing model: ${model}`);
    console.log(`URL: https://${API_URL}${API_PATH}`);
    console.log('='.repeat(60));

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);

        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Error: ${e.message}`);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('DeepSeek API Test');
  console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT FOUND'}`);
  console.log(`API URL: https://${API_URL}${API_PATH}`);

  for (const model of models) {
    try {
      const result = await callDeepseekAPI(model);
      console.log(`\nResult for ${model}:`, JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`Failed to call ${model}:`, error.message);
    }
  }
}

main();
