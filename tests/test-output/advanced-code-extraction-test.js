/**
 * Advanced Code Extraction Test
 *
 * Tests the extraction of code specifically from markdown content
 */

const { MarkdownCodeCleaner } = require('../../src/integrator/utils/MarkdownCodeCleaner');

console.log('🧪 Running Advanced Code Extraction Tests...\n');

// Test extraction of main code block specifically
console.log('Test: Extract specific code block from mixed content');
const mixedContent = `## Explanation

This is some explanatory text that shouldn't be included.

\`\`\`javascript
// This is the main code block
function mainFunction() {
  console.log("This is the actual code");
  return true;
}
\`\`\`

Additional explanation after the code.`;

const extracted = MarkdownCodeCleaner.extractMainCodeBlock(mixedContent, 'javascript');
console.log('Original content length:', mixedContent.length);
console.log('Extracted content length:', extracted.length);
console.log('Extracted content:');
console.log(extracted);
console.log('');

const hasCorrectFunction = extracted.includes('mainFunction') && extracted.includes('console.log("This is the actual code")');
const noExplanationText = !extracted.includes('Explanation') && !extracted.includes('explanatory');

console.log('✅ Contains main function:', hasCorrectFunction);
console.log('✅ No explanation text included:', noExplanationText);
console.log('✅ Extraction successful:', hasCorrectFunction && noExplanationText);

console.log('\n🎉 Advanced tests completed!');