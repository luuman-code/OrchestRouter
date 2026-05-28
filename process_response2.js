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

// Find each write_file entry by looking for the pattern
const regex = /\{"type":"tool_use","id":"write_file_[^}]+\}/g;
let match;
let results = [];
let lastIndex = jsonStart;

while ((match = regex.exec(content)) !== null) {
  // Find the full object starting from this match
  const startIdx = content.indexOf('{', match.index);
  // Find matching closing brace
  let braceCount = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }

  try {
    const objStr = content.substring(startIdx, endIdx + 1);
    const obj = JSON.parse(objStr);
    if (obj.name === 'write_file' && obj.input) {
      results.push(obj.input);
    }
  } catch (e) {
    // Skip malformed objects
  }
}

console.log('Found write_file entries:', results.length);

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Process each entry
let successCount = 0;
let skipCount = 0;
let errorCount = 0;

for (const { file_path, content } of results) {
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
      skipCount++;
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

console.log(`\nDone! Created: ${successCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);