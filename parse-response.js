const fs = require('fs');
const content = fs.readFileSync('C:/Users/LWB/.claude/projects/C--Users-LWB/9ed4df50-e4d7-44e2-ace7-a47945f1f271/tool-results/bac7u8bj1.txt', 'utf-8');

// Find the start of the JSON array
const start = content.indexOf('[{"type":"tool_use"');
if (start === -1) {
  console.log('No tool_use array found');
  process.exit(1);
}

// Extract just the array portion
let jsonStr = content.substring(start);

// Find the matching bracket using a stack
let depth = 0;
let end = 0;
let inString = false;
let escape = false;
for (let i = 0; i < jsonStr.length; i++) {
  const c = jsonStr[i];
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
  if (inString) continue;
  if (c === '[') { depth++; }
  else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
}

let truncated = jsonStr.substring(0, end);

// Clean control characters
truncated = truncated.replace(/[\x00-\x1F\x7F]/g, '');

try {
  const data = JSON.parse(truncated);
  console.log('Found ' + data.length + ' tool_use calls');
  for (const item of data) {
    if (item.name === 'write_file') {
      const path = item.input.file_path;
      const content = item.input.content || '';
      console.log(path + ': ' + content.substring(0, 60).replace(/\n/g, ' ') + '...');
    }
  }
} catch (e) {
  console.log('Parse error: ' + e.message);
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
  console.log('Around error:', truncated.substring(Math.max(0, pos-50), pos+50));
}
