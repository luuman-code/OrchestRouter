const fs = require('fs');
const path = require('path');

const response = JSON.parse(fs.readFileSync('C:/Users/LWB/OrchestRouter/ecommerce-platform-response.json', 'utf8'));
const content = response.content || [];

const outputDir = 'C:/Users/LWB/Desktop/E-commerce platform';

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Extract and write files
let filesWritten = 0;

for (const item of content) {
  if (item.name === 'write_file' && item.input) {
    const filePath = item.input.file_path;
    let fileContent = item.input.content;

    // Skip error placeholders
    if (fileContent && fileContent.includes('Execution failed')) {
      console.log(`Skipping failed file: ${filePath}`);
      continue;
    }

    // If content is nested JSON string, parse it
    if (typeof fileContent === 'string') {
      try {
        const parsed = JSON.parse(fileContent);
        if (parsed.content) {
          fileContent = parsed.content;
        }
      } catch (e) {
        // Not JSON, use as is
      }
    }

    // Handle nested write_file arrays
    if (typeof fileContent === 'string' && fileContent.includes('"write_file"')) {
      try {
        const nested = JSON.parse(fileContent);
        if (nested.write_file && Array.isArray(nested.write_file)) {
          for (const nestedFile of nested.write_file) {
            const nestedPath = nestedFile.file_path;
            let nestedContent = nestedFile.content;

            // Skip error placeholders
            if (nestedContent && nestedContent.includes('Execution failed')) {
              console.log(`Skipping failed file: ${nestedPath}`);
              continue;
            }

            const fullPath = path.join(outputDir, nestedPath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, nestedContent);
            console.log(`Created: ${nestedPath}`);
            filesWritten++;
          }
          continue;
        }
      } catch (e) {
        // Not nested JSON
      }
    }

    // Direct file content
    if (fileContent && !fileContent.includes('Execution failed')) {
      const fullPath = path.join(outputDir, filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, fileContent);
      console.log(`Created: ${filePath}`);
      filesWritten++;
    }
  }
}

console.log(`\nTotal files written: ${filesWritten}`);
