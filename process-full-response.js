const fs = require('fs');
const path = require('path');

// 使用超时请求的完整响应
const content = fs.readFileSync('C:/Users/LWB/OrchestRouter/ecom-tool-calls-result.json', 'utf8');
const data = JSON.parse(content);
const baseDir = 'C:/Users/LWB/Desktop/E-commerce platform';

// 确保目录存在
const dirs = new Set();
dirs.add(baseDir);

data.content.forEach(item => {
  if (item.type === 'tool_use' && item.name === 'write_file') {
    const input = item.input;
    if (input && input.file_path) {
      const filePath = input.file_path;
      const parts = filePath.replace(/\\/g, '/').split('/');
      parts.pop();
      const dir = baseDir + '/' + parts.join('/');
      dirs.add(dir);
    }
  }
});

// 创建所有目录
dirs.forEach(dir => {
  if (dir && dir !== baseDir) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created dir:', dir);
  }
});

// 写入所有文件
let count = 0;
const errors = [];

data.content.forEach(item => {
  if (item.type === 'tool_use' && item.name === 'write_file') {
    const input = item.input;
    if (input && input.file_path && input.content) {
      const filePath = baseDir + '/' + input.file_path.replace(/\\/g, '/');
      try {
        fs.writeFileSync(filePath, input.content, 'utf8');
        count++;
        console.log('Created file:', filePath);
      } catch (err) {
        errors.push({ path: filePath, error: err.message });
      }
    }
  }
});

console.log('');
console.log('Total files created:', count);
if (errors.length > 0) {
  console.log('Errors:', errors.length);
  errors.forEach(e => console.log('  -', e.path, ':', e.error));
}
