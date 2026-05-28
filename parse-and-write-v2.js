const fs = require('fs');
const path = require('path');

const responseFile = 'C:/Users/LWB/OrchestRouter/shared-context-response.json';
const baseDir = 'C:/Users/LWB/Desktop/E-commerce-platform-v2';

// Read and parse the response
const content = fs.readFileSync(responseFile, 'utf8');
const data = JSON.parse(content);

console.log('Session ID:', data.session_id);
console.log('Total tool calls:', data.content.length);

// Extract session_id for potential follow-up
fs.writeFileSync(path.join(baseDir, '.session_id'), data.session_id || '');

let successCount = 0;
let errorCount = 0;
let skippedCount = 0;

data.content.forEach((tool, i) => {
  if (tool.name === 'write_file' && tool.input) {
    const relativePath = tool.input.file_path;
    const filePath = path.join(baseDir, relativePath);

    // Create directory if not exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file - remove markdown code block syntax if present
    let fileContent = tool.input.content;
    if (fileContent.startsWith('```')) {
      // Remove ```tsx or ```ts or ```css etc. at start and ``` at end
      const lines = fileContent.split('\n');
      if (lines[0].startsWith('```')) {
        lines.shift(); // Remove first line
      }
      if (lines[lines.length - 1] === '```') {
        lines.pop(); // Remove last line
      }
      fileContent = lines.join('\n');
    }

    try {
      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`[${i + 1}] Created: ${relativePath}`);
      successCount++;
    } catch (err) {
      console.error(`[${i + 1}] Error creating ${relativePath}:`, err.message);
      errorCount++;
    }
  } else if (tool.name === 'read_file') {
    console.log(`[${i + 1}] Read: ${tool.input?.file_path || 'N/A'}`);
    skippedCount++;
  } else {
    console.log(`[${i + 1}] Other tool: ${tool.name}`);
    skippedCount++;
  }
});

console.log('\n--- Summary ---');
console.log(`Total tool calls: ${data.content.length}`);
console.log(`Files created: ${successCount}`);
console.log(`Skipped: ${skippedCount}`);
console.log(`Errors: ${errorCount}`);
console.log(`Session ID saved: ${data.session_id || 'none'}`);