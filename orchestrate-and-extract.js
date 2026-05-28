/**
 * 发送编排请求并提取工具调用结果
 * 用法: node orchestrate-and-extract.js <request_file> <output_dir>
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REQUEST_FILE = process.argv[2] || 'C:/Users/LWB/OrchestRouter/requests/request_ecommerce.json';
const OUTPUT_DIR = process.argv[3] || 'C:/Users/LWB/Desktop/E-commerce platform';
const ORCHESTRATOR_URL = 'http://localhost:3458/v1/orchestrate-tool-calls';

console.log('=== 编排器请求并提取工具调用 ===');
console.log('请求文件:', REQUEST_FILE);
console.log('输出目录:', OUTPUT_DIR);
console.log('');

// 读取请求文件
const requestData = JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf8'));
console.log('请求标题:', requestData.task?.title || '未定义');
console.log('');

console.log('发送请求到编排器...');
console.log('(这可能需要几分钟时间)');
console.log('');

// 发送HTTP请求
const postData = JSON.stringify(requestData);

const url = new URL(ORCHESTRATOR_URL);
const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 600000
};

const chunks = [];

function makeRequest() {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      console.log('收到响应状态:', res.statusCode);

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const raw = chunks.join('');
        resolve(raw);
      });

      res.on('error', (e) => {
        reject(e);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

makeRequest()
  .then(raw => {
    console.log('响应长度:', raw.length, '字节');
    console.log('');

    // 查找工具调用数组
    let arrayStart = raw.indexOf('[{"type":"tool_use"');
    if (arrayStart === -1) {
      arrayStart = raw.indexOf('[{"type":"tool_use"');
    }

    if (arrayStart === -1) {
      console.error('错误: 未找到工具调用数组');
      // 保存原始响应以便调试
      fs.writeFileSync('/tmp/raw_response_debug.txt', raw);
      console.error('原始响应已保存到 /tmp/raw_response_debug.txt');
      process.exit(1);
    }

    console.log('工具调用数组起始位置:', arrayStart);

    // 找到数组结束
    let depth = 0, inString = false, escape = false;
    let arrayEnd = arrayStart;

    for (let i = arrayStart; i < raw.length; i++) {
      const c = raw[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (!inString) {
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) { arrayEnd = i + 1; break; } }
      }
    }

    const toolCallsStr = raw.substring(arrayStart, arrayEnd);
    console.log('工具调用数组长度:', toolCallsStr.length, '字节');

    // 解析工具调用
    let toolCalls;
    try {
      toolCalls = JSON.parse(toolCallsStr);
    } catch (e) {
      console.error('JSON解析失败:', e.message);
      // 尝试修复
      const fixed = toolCallsStr
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        .replace(/,\s*]/g, ']');
      try {
        toolCalls = JSON.parse(fixed);
        console.log('JSON修复成功');
      } catch (e2) {
        console.error('修复失败:', e2.message);
        process.exit(1);
      }
    }

    console.log('解析到工具调用:', toolCalls.length);
    console.log('');

    // 过滤 write_file 调用
    const writeFileCalls = toolCalls.filter(call =>
      call.type === 'tool_use' &&
      call.name === 'write_file' &&
      call.input
    );

    console.log('write_file 调用数量:', writeFileCalls.length);
    console.log('');

    // 清理并创建输出目录
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 写入文件
    let successCount = 0;
    let failCount = 0;

    for (const call of writeFileCalls) {
      const { file_path, content } = call.input;
      if (!file_path || content === undefined) continue;

      const fullPath = path.join(OUTPUT_DIR, file_path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      try {
        let fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        fs.writeFileSync(fullPath, fileContent, 'utf8');
        successCount++;
        const sizeKB = (fileContent.length / 1024).toFixed(1);
        console.log(`[OK] ${file_path} (${sizeKB} KB)`);
      } catch (e) {
        failCount++;
        console.error(`[FAIL] ${file_path}: ${e.message}`);
      }
    }

    console.log('');
    console.log('=== 完成 ===');
    console.log('成功:', successCount);
    console.log('失败:', failCount);
    console.log('输出目录:', OUTPUT_DIR);
  })
  .catch(e => {
    console.error('请求失败:', e.message);
    process.exit(1);
  });
