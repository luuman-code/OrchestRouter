const fs = require('fs');
const path = require('path');

const RAW_FILE = 'C:/Users/LWB/AppData/Local/Temp/orchestrator_response.json';
const OUTPUT_DIR = 'C:/Users/LWB/Desktop/E-commerce platform';

const raw = fs.readFileSync(RAW_FILE, 'utf8');

const arrayStart = raw.indexOf('[{"type":"tool_use"');
console.log('Array start position:', arrayStart);

if (arrayStart === -1) {
  console.error('Could not find tool_calls array');
  process.exit(1);
}

const toolUseMarker = '"name":"write_file"';
let searchPos = arrayStart;
const results = [];

while (true) {
  const markerPos = raw.indexOf(toolUseMarker, searchPos);
  if (markerPos === -1) break;

  let objStart = markerPos;
  while (objStart > 0 && raw[objStart - 1] !== '{') objStart--;

  let depth = 0, inString = false, escape = false, i = objStart, foundEnd = false;
  while (i < raw.length) {
    const c = raw[i];
    if (escape) { escape = false; i++; continue; }
    if (c === '\\') { escape = true; i++; continue; }
    if (c === '"') { inString = !inString; i++; continue; }
    if (!inString) { if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { foundEnd = true; i++; break; } } }
    i++;
  }

  if (!foundEnd) break;

  const toolUseStr = raw.substring(objStart, i);
  searchPos = i;

  const filePathMatch = toolUseStr.match(/"file_path":"([^"]+)"/);
  if (!filePathMatch) continue;
  const filePath = filePathMatch[1];

  const contentMatch = toolUseStr.match(/"content":"([\s\S]*?)"(?=,"language")/);
  if (!contentMatch) continue;

  let rawContent = contentMatch[1];

  // Clean embedded curl output
  let cleanedContent = rawContent.replace(/\r?\n?100 \d+.*?\r?\n?/g, '').replace(/\r?\n?\d+ \d+.*?\r?\n?/g, '');

  try {
    const content = JSON.parse('"' + cleanedContent + '"');
    results.push({ file_path: filePath, content, success: true });
  } catch (e) {
    // Fallback: try to find corruption point
    const corruptionPos = rawContent.search(/\r?\n\d+ \d+/);
    if (corruptionPos !== -1) {
      const cleaned = rawContent.substring(0, corruptionPos);
      try {
        const content = JSON.parse('"' + cleaned + '"');
        console.log('[RECOVERY]', filePath, ': Recovered', content.length, 'chars');
        results.push({ file_path: filePath, content, success: true });
        continue;
      } catch (e2) {}
    }
    results.push({ file_path: filePath, content: rawContent, success: false, error: e.message });
  }
}

console.log('Total:', results.length);
console.log('Success:', results.filter(r => r.success).length);
console.log('Failed:', results.filter(r => !r.success).length);

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
    const status = result.success ? '' : ' [PARSE FAILED]';
    console.log('[WRITTEN]', result.file_path, '(', result.content.length, 'chars)', status);
  } catch (e) {
    console.error('[ERROR]', result.filePath, ':', e.message);
  }
}

console.log('\nFiles written:', writeCount);
