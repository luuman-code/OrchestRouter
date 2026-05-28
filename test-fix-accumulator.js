/**
 * 测试 tool_call 增量累积修复
 *
 * 直接测试 StreamToolCallParser 的累积功能
 */

const StreamToolCallParser = require('./src/executor/core/StreamToolCallParser');

console.log('=== 测试 tool_call 增量累积 ===\n');

// 创建解析器
const parser = new StreamToolCallParser();

// 模拟 DeepSeek OpenAI 格式的增量 tool_calls
const chunks = [
  // 第一个 chunk：包含完整的 tool_call 头
  { index: 0, id: 'call_001', type: 'function', function: { name: 'write_file', arguments: '' } },
  // 后续 chunks：只有 arguments 增量
  { index: 0, function: { arguments: '{' } },
  { index: 0, function: { arguments: '"file_path"' } },
  { index: 0, function: { arguments: ': ' } },
  { index: 0, function: { arguments: '"hello.ts"' } },
  { index: 0, function: { arguments: ', ' } },
  { index: 0, function: { arguments: '"content"' } },
  { index: 0, function: { arguments: ': ' } },
  { index: 0, function: { arguments: '"console.log(\\"Hello World\\")"' } },
  { index: 0, function: { arguments: '}' } },
];

console.log('模拟的增量 chunks:\n');
chunks.forEach((tc, i) => {
  console.log(`Chunk ${i}: arguments = "${tc.function.arguments}"`);
});

console.log('\n--- 使用修复后的代码处理 ---\n');

// 修复后的处理逻辑（模拟）
const result = { toolCalls: [] };

for (const tc of chunks) {
  // DeepSeek 响应中，只有第一个 chunk 有 id，后续的 chunk 只有 index
  // 所以用 index 作为累积的 key（因为没有 id）
  const tcId = tc.id || `tool_call_index_${tc.index}`;

  // 使用 parser.toolCallAccumulator 累积
  if (parser.toolCallAccumulator.has(tcId)) {
    // 累积 arguments 值
    const existing = parser.toolCallAccumulator.get(tcId);
    if (tc.function?.arguments) {
      existing.arguments += tc.function.arguments;
    }
    if (tc.function?.name) {
      existing.name = tc.function.name;
    }
    console.log(`累积 Chunk: arguments 现在 = "${existing.arguments}"`);
  } else {
    // 创建新的 tool_call
    const toolCall = {
      id: tcId,
      type: 'function',
      name: tc.function?.name || '',
      arguments: tc.function?.arguments || '{}'
    };
    parser.toolCallAccumulator.set(tcId, toolCall);
    result.toolCalls.push(toolCall);
    console.log(`新建 Chunk: id=${tcId}, name=${toolCall.name}, arguments="${toolCall.arguments}"`);
  }
}

console.log('\n--- 最终结果 ---\n');
console.log(`tool_calls 数量: ${result.toolCalls.length}`);
console.log('完整累积的 arguments:');
for (const tc of result.toolCalls) {
  console.log(`  ${tc.name}: ${tc.arguments}`);
}

// 尝试解析 arguments 为 JSON
console.log('\n--- 尝试解析 arguments 为 JSON ---');
for (const tc of result.toolCalls) {
  try {
    const parsed = JSON.parse(tc.arguments);
    console.log(`${tc.name} 解析成功:`, parsed);
  } catch (e) {
    console.log(`${tc.name} 解析失败: ${e.message}`);
  }
}
