const fs = require('fs');
const path = require('path');

const inputFile = 'C:/Users/LWB/.claude/projects/C--Users-LWB/3b1ab772-04ed-472a-92f1-013dc02afe1b/tool-results/bbf7kmitj.txt';
const outputDir = 'C:/Users/LWB/Desktop/E-commerce platform';

const content = fs.readFileSync(inputFile, 'utf8');
const jsonStart = content.indexOf('[{');
const jsonEnd = content.lastIndexOf('}]');

if (jsonStart === -1 || jsonEnd === -1) {
  console.error('No JSON array found');
  process.exit(1);
}

const jsonStr = content.substring(jsonStart, jsonEnd + 2);
let data;
try {
  data = JSON.parse(jsonStr);
} catch (e) {
  console.error('JSON parse error:', e.message);
  process.exit(1);
}

console.log('Total tool_calls:', data.length);

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Process each tool call
let successCount = 0;
let errorCount = 0;

for (const item of data) {
  if (item.name !== 'write_file') continue;

  const { file_path, content } = item.input || {};
  if (!file_path || !content) continue;

  const fullPath = path.join(outputDir, file_path);
  const dir = path.dirname(fullPath);

  try {
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if content is just a placeholder
    if (content.includes("I'll start by reading") || content.includes("I'll generate")) {
      console.log(`SKIP (placeholder): ${file_path}`);
      continue;
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`CREATED: ${file_path}`);
    successCount++;
  } catch (e) {
    console.error(`ERROR creating ${file_path}: ${e.message}`);
    errorCount++;
  }
}

console.log(`\nDone! Created: ${successCount}, Errors: ${errorCount}`);