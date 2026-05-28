const fs = require('fs');
const path = require('path');

const response = JSON.parse(fs.readFileSync('C:/Users/LWB/OrchestRouter/ecommerce-platform-response-new.json', 'utf8'));
const content = response.content || [];

const outputDir = 'C:/Users/LWB/Desktop/E-commerce platform new';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

let filesWritten = 0;

for (const item of content) {
  if (item.name === 'write_file' && item.input) {
    const filePath = item.input.file_path;
    let fileContent = item.input.content;

    if (fileContent && !fileContent.includes('Execution failed')) {
      const fullPath = path.join(outputDir, filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, fileContent);
      console.log('Created:', filePath);
      filesWritten++;
    }
  }
}

console.log('\nTotal files written:', filesWritten);
