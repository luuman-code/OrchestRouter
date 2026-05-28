const fs = require('fs');
const path = require('path');

const responsePath = 'C:/Users/LWB/OrchestRouter/responses/e-commerce-response.json';
const outputBaseDir = 'C:/Users/LWB/Desktop/E-commerce platform';

const content = fs.readFileSync(responsePath, 'utf-8');
const response = JSON.parse(content);
const toolUses = response.content;

console.log(`找到 ${toolUses.length} 个工具调用\n`);

let successCount = 0;
let failCount = 0;

for (const tool of toolUses) {
  if (tool.type === 'tool_use' && tool.name === 'write_file') {
    const { file_path, content } = tool.input;
    const fullPath = path.join(outputBaseDir, file_path);
    const dir = path.dirname(fullPath);
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`✓ ${file_path}`);
      successCount++;
    } catch (err) {
      console.log(`✗ ${file_path}: ${err.message}`);
      failCount++;
    }
  }
}

console.log(`\n完成: 成功 ${successCount}, 失败 ${failCount}`);
