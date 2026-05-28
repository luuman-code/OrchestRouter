/**
 * 模拟 _tryFixJson 的问题
 */

function _tryFixJson(jsonStr) {
  if (!jsonStr) return null;

  const startIdx = jsonStr.indexOf('{');
  if (startIdx === -1) return null;

  let endIdx = jsonStr.lastIndexOf('}');
  if (endIdx === -1 || endIdx < startIdx) {
    endIdx = jsonStr.length;
  }

  let potentialJson = jsonStr.substring(startIdx, endIdx + 1);

  try {
    JSON.parse(potentialJson);
    return potentialJson;
  } catch (e) {
    // 尝试补全缺失的引号或括号
    // 简单策略：找到最后一个完整的键值对
    const lastComma = potentialJson.lastIndexOf(',');
    if (lastComma > 0) {
      const truncated = potentialJson.substring(0, lastComma) + '}';
      try {
        JSON.parse(truncated);
        return truncated;
      } catch (e2) {
        // 尝试补全缺失的引号
        const fixed = potentialJson.replace(/([^"])\s*}/g, '$1"}').replace(/}\s*}/g, '}}');
        try {
          JSON.parse(fixed);
          return fixed;
        } catch (e3) {
          // 无法修复
        }
      }
    }
  }

  return null;
}

// 测试用例：模拟 MiniMax 返回的不完整 JSON
// 假设 content 字段包含特殊字符导致解析失败

const testCases = [
  // 正常情况
  '{"file_path":"src/services/api.ts","content":"import axios from \'axios\';\n\nconst API_BASE_URL = process.env.REACT_APP_API_URL;"}',

  // content 中包含未转义的 } 导致解析失败
  '{"file_path":"src/services/api.ts","content":"function test() { return 1; }"}',

  // content 中包含多行代码和特殊字符
  '{"file_path":"src/App.tsx","content":"import React from \'react\';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n  return <div>{count}</div>;\n}"}',
];

console.log('测试 _tryFixJson 修复策略：\n');

for (const testCase of testCases) {
  console.log('原始 JSON:', testCase.substring(0, 80) + '...');
  const fixed = _tryFixJson(testCase);
  console.log('修复后:', fixed);
  console.log('---');
}
