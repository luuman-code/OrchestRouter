/**
 * 测试 MiniMax Anthropic 格式 (input_json_delta)
 */

const StreamToolCallParser = require('./src/executor/core/StreamToolCallParser');

console.log('=== 测试 MiniMax Anthropic 格式 (input_json_delta) ===\n');

// 测试不同的 JSON 格式
const testCases = [
  // 简单 JSON
  '{"file_path": "test.ts", "content": "hello"}',
  // 包含特殊字符的 JSON
  '{"file_path": "test.ts", "content": "console.log(\\"Hello World\\")"}',
];

for (const testJson of testCases) {
  console.log('\n========== 测试 JSON ==========');
  console.log('JSON:', testJson);

  // 直接测试 JSON.parse
  console.log('\n--- 直接测试 JSON.parse ---');
  try {
    const parsed = JSON.parse(testJson);
    console.log('JSON.parse 成功:', parsed);
  } catch (e) {
    console.log('JSON.parse 失败:', e.message);
  }

  // 测试 processInputJsonDelta
  console.log('\n--- 测试 processInputJsonDelta ---');
  const parser = new StreamToolCallParser();
  parser.currentToolCallId = 'tool_call_001';
  parser.currentToolCallName = 'write_file';
  parser.state = 'parsing_arguments';

  const result = parser.processInputJsonDelta(testJson);

  if (result.toolCalls.length > 0) {
    console.log('找到 toolCall:');
    for (const tc of result.toolCalls) {
      console.log('  name:', tc.name);
      console.log('  arguments:', tc.arguments);
    }
  } else {
    console.log('未找到 toolCall，state:', parser.state);
    console.log('currentArgumentsBuffer:', parser.currentArgumentsBuffer);
  }
}
