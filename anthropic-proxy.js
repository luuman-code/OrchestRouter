/**
 * Anthropic 格式转接口服务
 *
 * 将 OpenAI 兼容格式的 API 响应转换为 Anthropic 格式
 * 使用方式：将目标 API 地址配置为本服务地址
 *
 * 用法：
 *   node anthropic-proxy.js
 *
 * 环境变量：
 *   TARGET_API_URL - 目标 API 地址（默认：https://api.minimaxi.com/v1）
 *   TARGET_API_KEY - 目标 API 密钥
 *   PROXY_PORT - 代理服务端口（默认：3459）
 *
 * 示例：
 *   TARGET_API_URL=https://api.minimaxi.com/v1 TARGET_API_KEY=your_key node anthropic-proxy.js
 */

const http = require('http');
const https = require('https');

const TARGET_API_URL = process.env.TARGET_API_URL || 'https://api.minimaxi.com/v1';
const TARGET_API_KEY = process.env.TARGET_API_KEY || '';
const PROXY_PORT = process.env.PROXY_PORT || 3459;

// 提取 thinking 内容的函数
function extractThinkingContent(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const patterns = [
    /<thinking>([\s\S]*?)<\/thinking>/gi,
    /<think>([\s\S]*?)</think>/gi,
    /<reasoning>([\s\S]*?)<\/reasoning>/gi,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1] ? match[1].trim() : '';
    }
  }

  return null;
}

// 将 OpenAI 响应转换为 Anthropic 格式
function convertToAnthropicFormat(data) {
  // 如果已经是 Anthropic 格式，直接返回
  if (data.content && Array.isArray(data.content)) {
    return data;
  }

  // 从 OpenAI 格式提取 content
  let content = '';
  if (data.choices && data.choices[0]) {
    content = data.choices[0].message?.content || data.choices[0].delta?.content || '';
  }

  if (!content) {
    content = data.response || data.message?.content || '';
  }

  // 提取 thinking 内容
  const thinkingContent = extractThinkingContent(content);

  // 构建 Anthropic 格式的响应
  const anthropicResponse = {
    id: data.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [],
    model: data.model || 'unknown',
    stop_reason: data.choices?.[0]?.finish_reason || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0
    }
  };

  // 添加 thinking 块（如果有）
  if (thinkingContent) {
    anthropicResponse.content.push({
      type: 'thinking',
      thinking: thinkingContent
    });

    // 添加 text 块（去掉 thinking 标签后的内容）
    const textContent = content
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<think>[\s\S]*?</think>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .trim();

    if (textContent) {
      anthropicResponse.content.push({
        type: 'text',
        text: textContent
      });
    }
  } else {
    // 没有 thinking，直接添加 text 块
    anthropicResponse.content.push({
      type: 'text',
      text: content
    });
  }

  return anthropicResponse;
}

// 转发请求的函数
function proxyRequest(req, res) {
  const url = new URL(TARGET_API_URL);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + (req.url || ''),
    method: req.method,
    headers: {
      ...req.headers,
      'host': url.host,
      'Authorization': `Bearer ${TARGET_API_KEY}`
    }
  };

  const proxyReq = httpModule.request(options, (proxyRes) => {
    let data = '';

    proxyRes.on('data', (chunk) => {
      data += chunk;
    });

    proxyRes.on('end', () => {
      try {
        // 解析响应
        const jsonData = JSON.parse(data);

        // 转换为 Anthropic 格式
        const anthropicData = convertToAnthropicFormat(jsonData);

        // 返回转换后的响应
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end(JSON.stringify(anthropicData));
      } catch (e) {
        // 如果不是 JSON，直接返回原始响应
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json'
        });
        res.end(data);
      }
    });
  });

  proxyReq.on('error', (e) => {
    console.error('代理请求错误:', e.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: e.message }));
  });

  // 转发请求体
  req.on('data', (chunk) => {
    proxyReq.write(chunk);
  });

  req.on('end', () => {
    proxyReq.end();
  });
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // 只处理 POST 请求
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  proxyRequest(req, res);
});

server.listen(PROXY_PORT, () => {
  console.log(`
==============================================
  Anthropic 格式转接口服务已启动
==============================================
  监听端口: ${PROXY_PORT}
  目标 API: ${TARGET_API_URL}
  API 密钥: ${TARGET_API_KEY ? '已配置' : '未配置'}

  使用示例（配置到 config.json）:
  {
    "name": "minimax-proxy",
    "api_base_url": "http://localhost:${PROXY_PORT}",
    "api_key_env": "MINIMAX_API_KEY",
    "use_anthropic_format": true
  }

  或直接使用:
  curl -X POST http://localhost:${PROXY_PORT}/v1/chat/completions \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Hello"}]}'
==============================================
  `);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PROXY_PORT} 已被占用，请使用其他端口`);
    process.exit(1);
  }
  throw e;
});
