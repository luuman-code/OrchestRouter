const fs = require('fs');
const path = require('path');

const responsePath = 'C:/Users/LWB/OrchestRouter/ecommerce-platform-response-new.json';
const targetDir = 'C:/Users/LWB/Desktop/E-commerce platform-v3';

// Read response file
const responseContent = fs.readFileSync(responsePath, 'utf-8');
const response = JSON.parse(responseContent);

// Response is an object with content array of tool_use objects
const toolCalls = response.content;

console.log(`Found ${toolCalls.length} tool calls`);

// Build global toolCallFilesMap - 收集所有文件，包括空的
const globalToolCallFilesMap = new Map();
const emptyFiles = [];

for (const toolCall of toolCalls) {
  if (toolCall.type === 'tool_use' && toolCall.name === 'write_file') {
    const { file_path, content } = toolCall.input;

    if (file_path) {
      const normalizedPath = file_path.replace(/\\/g, '/').toLowerCase();
      if (content && content.trim() && !content.includes('/* Empty result for task:')) {
        globalToolCallFilesMap.set(normalizedPath, { originalPath: file_path, content, isEmpty: false });
        console.log(`Mapped: ${normalizedPath} (${content.length} chars)`);
      } else {
        emptyFiles.push({ path: file_path, normalizedPath, content: content || '' });
        console.log(`Empty/Placeholder: ${normalizedPath}`);
      }
    }
  }
}

console.log(`\nTotal mapped files: ${globalToolCallFilesMap.size}`);
console.log(`Empty/Placeholder files: ${emptyFiles.length}`);

// Create target directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Write files
let successCount = 0;
let errorCount = 0;

// Write non-empty files
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

// Write placeholder files (标记为空)
for (const file of emptyFiles) {
  const fullPath = path.join(targetDir, file.path);
  const dir = path.dirname(fullPath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content || `/* Empty placeholder */\n`, 'utf-8');
    console.log(`Created (placeholder): ${fullPath}`);
    successCount++;
  } catch (err) {
    console.error(`Error creating ${fullPath}:`, err.message);
    errorCount++;
  }
}

console.log(`\nSummary: ${successCount} files created, ${errorCount} errors`);

// Compare with deliverables
console.log('\n=== Deliverables vs Generated ===');
const deliverables = [
  'src/types/index.ts',
  'server/database/db.ts',
  'server/index.ts',
  'server/routes/auth.ts',
  'server/routes/products.ts',
  'server/routes/cart.ts',
  'server/routes/orders.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/services/api.ts',
  'src/pages/Home.tsx',
  'src/pages/Login.tsx',
  'src/pages/Register.tsx',
  'src/pages/ProductList.tsx',
  'src/pages/ProductDetail.tsx',
  'src/pages/Cart.tsx',
  'src/pages/OrderList.tsx',
  'src/components/Header.tsx',
  'src/components/ProductCard.tsx',
  'src/components/CartItem.tsx',
  'src/components/Button.tsx',
  'src/components/Input.tsx',
];

const generatedPaths = new Set([...globalToolCallFilesMap.keys(), ...emptyFiles.map(f => f.normalizedPath)]);
let matched = 0;
let missing = [];

for (const d of deliverables) {
  const normalizedD = d.replace(/\\/g, '/').toLowerCase();
  if (generatedPaths.has(normalizedD)) {
    matched++;
  } else {
    missing.push(d);
  }
}

console.log(`Deliverables: ${deliverables.length}`);
console.log(`Generated: ${generatedPaths.size}`);
console.log(`Matched: ${matched}`);
console.log(`Missing: ${missing.length}`);
if (missing.length > 0) {
  console.log('Missing files:', missing);
}
