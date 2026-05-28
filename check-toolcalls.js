const fs = require('fs');
const r = JSON.parse(fs.readFileSync('ecommerce-platform-response-new.json','utf-8'));
const toolCalls = r.content;

console.log('Total tool_calls:', toolCalls.length);
console.log('\nAll file paths in tool_calls:');
for (const tc of toolCalls) {
  const path = tc.input?.file_path || tc.input?.filePath || 'unknown';
  const contentLen = tc.input?.content?.length || 0;
  console.log(`  ${path} (${contentLen} chars)`);
}
