const fs = require('fs');
const path = require('path');

const responsePath = 'C:/Users/LWB/OrchestRouter/ecommerce-platform-response-new.json';
const targetDir = 'C:/Users/LWB/Desktop/E-commerce platform-v2';

// Read response file
const responseContent = fs.readFileSync(responsePath, 'utf-8');
const response = JSON.parse(responseContent);

// Response is an object with content array of tool_use objects
const toolCalls = response.content;

console.log(`Found ${toolCalls.length} tool calls`);

// Build global toolCallFilesMap (改进后的逻辑)
const globalToolCallFilesMap = new Map();
const emptyFiles = [];

for (const toolCall of toolCalls) {
  if (toolCall.type === 'tool_use' && toolCall.name === 'write_file') {
    const { file_path, content } = toolCall.input;

    if (file_path) {
      const normalizedPath = file_path.replace(/\\/g, '/').toLowerCase();
      if (content && content.trim()) {
        globalToolCallFilesMap.set(normalizedPath, { originalPath: file_path, content });
        console.log(`Mapped: ${normalizedPath}`);
      } else {
        emptyFiles.push(file_path);
        console.log(`Empty file: ${file_path}`);
      }
    }
  }
}

console.log(`\nTotal mapped files: ${globalToolCallFilesMap.size}`);
console.log(`Empty files: ${emptyFiles.length}`);

// Create target directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Write files
let successCount = 0;
let errorCount = 0;

for (const [normalizedPath, fileData] of globalToolCallFilesMap.entries()) {
  const fullPath = path.join(targetDir, fileData.originalPath);
  const dir = path.dirname(fullPath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, fileData.content, 'utf-8');
    console.log(`Created: ${fullPath} (${fileData.content.length} chars)`);
    successCount++;
  } catch (err) {
    console.error(`Error creating ${fullPath}:`, err.message);
    errorCount++;
  }
}

console.log(`\nSummary: ${successCount} files created, ${errorCount} errors`);
