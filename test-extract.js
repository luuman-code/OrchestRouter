// 测试 _extractFieldsFromPartialJson 逻辑

function _extractFieldsFromPartialJson(partialJson) {
  if (!partialJson || typeof partialJson !== 'string') {
    return {};
  }

  const result = {};

  // 提取 file_path 字段
  const filePathMatch = partialJson.match(/"file_path"\s*:\s*"([^"]+)"/);
  if (filePathMatch) {
    result.file_path = filePathMatch[1];
  }

  // 提取 content 字段（可能是多行字符串）
  const contentMatch = partialJson.match(/"content"\s*:\s*"([\s\S]*?)"(?=\s*[,}])/);
  if (contentMatch) {
    result.content = contentMatch[1];
  }

  // 提取 language 字段
  const languageMatch = partialJson.match(/"language"\s*:\s*"([^"]+)"/);
  if (languageMatch) {
    result.language = languageMatch[1];
  }

  // 尝试提取其他字符串字段
  const otherFields = partialJson.matchAll(/"(\w+)"\s*:\s*"([^"]*)"/g);
  for (const match of otherFields) {
    const [, key, value] = match;
    if (!result[key] && value) {
      result[key] = value;
    }
  }

  return result;
}

// 测试用例
const testCases = [
  ', "file_path": "server/database/db.ts"}...',
  '{"file_path": "test.ts", "content": "some code"}',
  ', "file_path": "server/index.ts", "content": "import express"}',
  ', "file_path": "src/types/index.ts", "content": "/* Empty result for task: xxx */\\n"}'
];

for (const test of testCases) {
  const result = _extractFieldsFromPartialJson(test);
  console.log('Input:', test.substring(0, 60));
  console.log('Output:', JSON.stringify(result));
  console.log('---');
}
