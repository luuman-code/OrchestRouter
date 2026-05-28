const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('C:/Users/LWB/OrchestRouter/ecom-tool-calls-result.json', 'utf8'));

// 响应可能是数组或对象
const toolCalls = Array.isArray(data) ? data : (data.content || data.tool_calls || []);

console.log('Total items found:', toolCalls.length);

// 提取 write_file 工具调用
const writeFiles = toolCalls.filter(tc => tc.name === 'write_file' || tc.name === 'create_file');
console.log('write_file calls:', writeFiles.length);

// 显示文件路径
writeFiles.forEach((tf, i) => {
  const filePath = tf.input?.file_path || tf.input?.path;
  console.log(i+1 + '. ' + filePath);
});

// 创建输出目录
const outputDir = 'C:/Users/LWB/Desktop/E-commerce platform';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 写入文件
let successCount = 0;
let errorCount = 0;

writeFiles.forEach((tf, i) => {
  const filePath = tf.input?.file_path || tf.input?.path;
  const content = tf.input?.content || '';

  if (!filePath) {
    console.log('Skipping ' + i + ': no file_path');
    return;
  }

  // 构建完整路径
  const fullPath = path.join(outputDir, filePath);
  const dir = path.dirname(fullPath);

  try {
    // 创建目录
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 写入文件
    fs.writeFileSync(fullPath, content, 'utf8');
    successCount++;
    console.log('Written: ' + filePath);
  } catch (err) {
    errorCount++;
    console.error('Error writing ' + filePath + ': ' + err.message);
  }
});

console.log('\nSummary: ' + successCount + ' files written, ' + errorCount + ' errors');
