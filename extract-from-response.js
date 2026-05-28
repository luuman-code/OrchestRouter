const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'C:/Users/LWB/OrchestRouter/requests/response_contract_mock_test.json';
const OUTPUT_DIR = 'C:/Users/LWB/Desktop/E-commerce platform';

const content = fs.readFileSync(INPUT_FILE, 'utf8');

// Find all write_file entries
const toolUseMarker = '"name":"write_file"';
let searchPos = 0;
let count = 0;
const results = [];

while (true) {
  const markerPos = content.indexOf(toolUseMarker, searchPos);
  if (markerPos === -1) break;

  // Find the start of this object
  let objStart = markerPos;
  while (objStart > 0 && content[objStart - 1] !== '{') objStart--;

  // Find the end by counting braces
  let depth = 0, inString = false, escape = false, i = objStart, foundEnd = false;
  while (i < content.length) {
    const c = content[i];
    if (escape) { escape = false; i++; continue; }
    if (c === '\\') { escape = true; i++; continue; }
    if (c === '"') { inString = !inString; i++; continue; }
    if (!inString) { if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { foundEnd = true; i++; break; } } }
    i++;
  }

  if (!foundEnd) break;

  const toolUseStr = content.substring(objStart, i);
  const filePathMatch = toolUseStr.match(/"file_path":"([^"]+)"/);
  if (!filePathMatch) { searchPos = i; continue; }
  const filePath = filePathMatch[1];

  // Extract content - it's in "content":"..." format
  const contentMatch = toolUseStr.match(/"content":"([\s\S]*?)"(?=,"language"|,"file_path"|\s*}$)/);
  if (!contentMatch) { searchPos = i; continue; }

  let rawContent = contentMatch[1];
  // Unescape the content
  rawContent = rawContent.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  results.push({ file_path: filePath, content: rawContent });
  count++;
  searchPos = i;
}

console.log(`Total write_file entries found: ${count}`);

// Create output directory
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let writeCount = 0;
for (const result of results) {
  const fullPath = path.join(OUTPUT_DIR, result.file_path);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    fs.writeFileSync(fullPath, result.content, 'utf8');
    writeCount++;
    console.log(`[WRITTEN] ${result.file_path} (${result.content.length} chars)`);
  } catch (e) {
    console.error(`[WRITE ERROR] ${result.file_path}: ${e.message}`);
  }
}

console.log(`\nFiles written: ${writeCount}/${count}`);