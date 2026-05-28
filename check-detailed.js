const fs = require('fs');
const r = JSON.parse(fs.readFileSync('ecommerce-platform-response-new.json','utf-8'));

const toolCalls = r.content;

for (const tc of toolCalls) {
  const path = tc.input?.file_path;
  const content = tc.input?.content || '';
  const contentLen = content.length;

  // 判断是否是有效内容
  let status = '';
  if (content.includes('/* Empty result for task:')) {
    status = 'EMPTY_PLACEHOLDER';
  } else if (contentLen > 100) {
    status = 'VALID';
  } else {
    status = 'SHORT';
  }

  console.log(`${status.padEnd(20)} | ${path.padEnd(40)} | ${contentLen} chars`);
}
