const fs = require('fs');
const path = require('path');

const responsePath = 'C:/Users/LWB/OrchestRouter/ecommerce-platform-response.json';
const targetDir = 'C:/Users/LWB/Desktop/E-commerce platform';

// Read response file
const responseContent = fs.readFileSync(responsePath, 'utf-8');
const response = JSON.parse(responseContent);

// Response is an object with content array of tool_use objects
const toolCalls = response.content;

console.log(`Found ${toolCalls.length} tool calls`);

let successCount = 0;
let errorCount = 0;

for (const toolCall of toolCalls) {
  if (toolCall.type === 'tool_use' && toolCall.name === 'write_file') {
    const { file_path, content } = toolCall.input;

    // Resolve the full path
    const fullPath = path.join(targetDir, file_path);
    const dir = path.dirname(fullPath);

    try {
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }

      // Write file
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`Created file: ${fullPath} (${content.length} chars)`);
      successCount++;
    } catch (err) {
      console.error(`Error creating file ${fullPath}:`, err.message);
      errorCount++;
    }
  } else {
    console.log(`Skipping tool: ${toolCall.name || 'unknown'}`);
  }
}

console.log(`\nSummary: ${successCount} files created, ${errorCount} errors`);
