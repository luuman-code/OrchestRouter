/**
 * 从编排器响应中提取 write_file 工具调用并在指定位置创建文件
 * 用法: node extract-tool-calls-v2.js <response_file> <output_dir>
 *
 * 功能:
 * 1. 读取原始响应文件
 * 2. 提取所有 write_file 工具调用
 * 3. 解析 JSON 内容（处理转义字符）
 * 4. 根据 file_path 创建目录结构
 * 5. 写入文件内容
 */

const fs = require('fs');
const path = require('path');

const RAW_FILE = process.argv[2] || '/tmp/orchestrator_response.json';
const OUTPUT_DIR = process.argv[3] || 'C:/Users/LWB/Desktop/E-commerce platform';

console.log('=== 编排器工具调用提取器 v2 ===');
console.log('输入文件:', RAW_FILE);
console.log('输出目录:', OUTPUT_DIR);
console.log('');

if (!fs.existsSync(RAW_FILE)) {
  console.error('错误: 输入文件不存在:', RAW_FILE);
  console.error('用法: node extract-tool-calls-v2.js <response_file> <output_dir>');
  process.exit(1);
}

const raw = fs.readFileSync(RAW_FILE, 'utf8');
console.log('文件大小:', raw.length, '字节');

// 检查是否有错误信息
if (raw.includes('"error"') || raw.includes('"failure"')) {
  console.log('警告: 响应中包含错误信息');
  const errorMatch = raw.match(/"error"\s*:\s*"([^"]+)"/);
  if (errorMatch) {
    console.error('错误:', errorMatch[1]);
  }
}

// 查找工具调用数组的起始位置
let arrayStart = raw.indexOf('[{"type":"tool_use"}]');
if (arrayStart === -1) {
  arrayStart = raw.indexOf('[{"type":"tool_use"');
}
console.log('工具调用数组起始位置:', arrayStart);

if (arrayStart === -1) {
  console.error('错误: 未找到工具调用数组');
  // 保存前1000字符以便调试
  console.error('响应前1000字符:', raw.substring(0, 1000));
  process.exit(1);
}

// 提取工具调用数组（找到完整的结束括号）
let arrayEnd = arrayStart;
let depth = 0;
let inString = false;
let escape = false;

for (let i = arrayStart; i < raw.length; i++) {
  const c = raw[i];

  if (escape) {
    escape = false;
    continue;
  }

  if (c === '\\') {
    escape = true;
    continue;
  }

  if (c === '"') {
    inString = !inString;
    continue;
  }

  if (!inString) {
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
}

const toolCallsStr = raw.substring(arrayStart, arrayEnd);
console.log('工具调用数组长度:', toolCallsStr.length, '字节');

// 解析工具调用数组
let toolCalls;
try {
  toolCalls = JSON.parse(toolCallsStr);
} catch (e) {
  console.error('解析工具调用数组失败:', e.message);
  console.error('尝试修复JSON...');

  // 尝试修复常见的JSON问题
  let fixed = toolCallsStr
    // 修复没有引号的键
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
    // 修复尾部逗号
    .replace(/,\s*]/g, ']')
    // 移除控制字符
    .replace(/[\x00-\x1F\x7F]/g, '');

  try {
    toolCalls = JSON.parse(fixed);
    console.log('JSON修复成功');
  } catch (e2) {
    console.error('修复后仍然失败:', e2.message);
    // 保存修复后的内容以便调试
    fs.writeFileSync('/tmp/fixed_json_debug.txt', fixed);
    console.error('修复后的JSON已保存到 /tmp/fixed_json_debug.txt');
    process.exit(1);
  }
}

console.log('解析到工具调用数量:', toolCalls.length);
console.log('');

// 过滤出 write_file 调用
const writeFileCalls = toolCalls.filter(call =>
  call.type === 'tool_use' &&
  call.name === 'write_file' &&
  call.input &&
  call.input.file_path
);

console.log('write_file 调用数量:', writeFileCalls.length);
console.log('');

// 检查是否有空结果或错误标记
const emptyCalls = writeFileCalls.filter(call =>
  !call.input.content ||
  call.input.content.includes('Execution failed') ||
  call.input.content.includes('/* Empty result')
);

if (emptyCalls.length > 0) {
  console.log('警告: 发现', emptyCalls.length, '个可能的错误/空结果文件:');
  emptyCalls.forEach(call => {
    console.log(' -', call.input.file_path, ':', call.input.content?.substring(0, 80));
  });
  console.log('');
}

// 清理输出目录
if (fs.existsSync(OUTPUT_DIR)) {
  console.log('清理输出目录...');
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
console.log('输出目录已创建');
console.log('');

// 写入文件
let successCount = 0;
let failCount = 0;
let emptyCount = 0;

for (const call of writeFileCalls) {
  const { file_path, content } = call.input;
  const fullPath = path.join(OUTPUT_DIR, file_path);
  const dir = path.dirname(fullPath);

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 检查内容是否为空或错误
  if (!content || content.includes('Execution failed') || content.includes('/* Empty result')) {
    emptyCount++;
    console.log(`[EMPTY] ${file_path}`);
    continue;
  }

  try {
    fs.writeFileSync(fullPath, content, 'utf8');
    successCount++;
    const sizeKB = (content.length / 1024).toFixed(1);
    console.log(`[OK] ${file_path} (${sizeKB} KB)`);
  } catch (e) {
    failCount++;
    console.error(`[FAIL] ${file_path}: ${e.message}`);
  }
}

console.log('');
console.log('=== 完成 ===');
console.log('成功:', successCount);
console.log('空/错误:', emptyCount);
console.log('失败:', failCount);
console.log('输出目录:', OUTPUT_DIR);
console.log('');

// 列出输出目录结构
console.log('输出目录结构:');
function listDir(dir, indent = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      console.log(indent + item + '/');
      listDir(fullPath, indent + '  ');
    } else {
      const sizeKB = (stat.size / 1024).toFixed(1);
      console.log(indent + item + ` (${sizeKB} KB)`);
    }
  }
}
listDir(OUTPUT_DIR);
