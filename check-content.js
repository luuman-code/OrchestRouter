const fs = require('fs');
const r = JSON.parse(fs.readFileSync('ecommerce-platform-response-new.json','utf-8'));

// content 就是 tool_calls
const toolCalls = r.content;
console.log('content is array:', Array.isArray(toolCalls));
console.log('Total items:', toolCalls.length);

// 检查这些 tool_calls 是来自哪个任务
// 提取 task_id
for (const tc of toolCalls) {
  const content = tc.input?.content || '';
  const taskIdMatch = content.match(/group_[\w]+/);
  console.log(`Path: ${tc.input?.file_path}, TaskID: ${taskIdMatch ? taskIdMatch[0] : 'N/A'}`);
}
