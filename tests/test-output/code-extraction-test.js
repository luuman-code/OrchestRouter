/**
 * Code Extraction Test
 *
 * Tests to verify the code extraction improvements are working correctly
 */

const { MarkdownCodeCleaner } = require('../../src/integrator/utils/MarkdownCodeCleaner');
const PromptGenerator = require('../../src/decomposer/utils/PromptGenerator');

console.log('🧪 Running Code Extraction Tests...\n');

// Test 1: Test MarkdownCodeCleaner functionality
console.log('Test 1: MarkdownCodeCleaner.extractMainCodeBlock');
const sampleTextWithCode = `Here is some explanation text.

\`\`\`javascript
function helloWorld() {
  console.log("Hello, World!");
}
\`\`\`

More explanation text.`;

const extractedCode = MarkdownCodeCleaner.extractMainCodeBlock(sampleTextWithCode, 'javascript');
console.log('Input:', sampleTextWithCode);
console.log('Extracted:', extractedCode);
console.log('✅ Extracted correctly:', extractedCode.includes('function helloWorld'));
console.log('');

// Test 2: Test PromptGenerator output format
console.log('Test 2: PromptGenerator.buildOutputFormatSection');
const promptGen = new PromptGenerator();
const outputFormat = promptGen.buildOutputFormatSection('test.js');
console.log('Output format section:', outputFormat);
console.log('✅ Contains required format elements:',
  outputFormat.includes('Output Format Requirements') &&
  outputFormat.includes('fenced code block') &&
  outputFormat.includes('javascript')
);
console.log('');

// Test 3: Test smartClean functionality
console.log('Test 3: MarkdownCodeCleaner.smartClean');
const textWithMarkdown = `# Header\n\nSome text\n\n\`\`\`js\nconsole.log("test");\n\`\`\`\n\nMore text`;
const cleaned = MarkdownCodeCleaner.smartClean(textWithMarkdown, 'javascript');
console.log('Input:', textWithMarkdown);
console.log('Cleaned:', cleaned);
console.log('✅ Cleaned correctly (only code remains):', cleaned.trim() === 'console.log("test");');
console.log('');

console.log('🎉 All tests completed!');