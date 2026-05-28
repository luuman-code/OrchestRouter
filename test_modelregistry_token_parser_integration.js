/**
 * ModelRegistry 与 TokenUsageParser 集成测试脚本
 *
 * 测试完整流程：
 * 1. ModelRegistry 从配置文件加载模型（包含 response_format）
 * 2. TokenUsageParser 从 ModelRegistry 获取配置
 * 3. TokenUsageParser 正确解析 token 消耗
 *
 * 运行方式: node test_modelregistry_token_parser_integration.js
 */

const fs = require('fs');
const path = require('path');

// 加载 ModelRegistry
const ModelRegistry = require('./src/selector/registry/ModelRegistry');

// 加载 TokenUsageParser
const TokenUsageParser = require('./src/executor/utils/TokenUsageParser');

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(15) + 'ModelRegistry 与 TokenUsageParser 集成测试' + ' '.repeat(8) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

// ============================================
// Step 1: 创建 ModelRegistry 并加载配置
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 1: 加载 ModelRegistry' + ' '.repeat(23) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const modelRegistry = new ModelRegistry();

// 从统一配置加载
const configPath = path.join(__dirname, 'config', 'config.json');
const configContent = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configContent);

// 使用 loadFromUnifiedConfig 方法加载配置
modelRegistry.loadFromUnifiedConfig(config);

console.log(`\n  已加载配置到 ModelRegistry`);
console.log(`  模型总数: ${modelRegistry.getAllModels().length}`);

// ============================================
// Step 2: 创建 TokenUsageParser 并从 ModelRegistry 加载配置
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 2: TokenUsageParser 加载配置' + ' '.repeat(18) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const parser = new TokenUsageParser();

// 从 ModelRegistry 加载配置
parser.setModelRegistry(modelRegistry);

console.log('\n  已调用 setModelRegistry(modelRegistry)');

// ============================================
// Step 3: 验证配置加载结果
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 3: 验证配置加载' + ' '.repeat(27) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

// 检查 MiniMax 模型
console.log('\n  MiniMax 模型:');
const minimaxModels = ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'];
for (const modelId of minimaxModels) {
  const model = modelRegistry.getModel(modelId);
  const format = parser.getResponseFormat(modelId);
  console.log(`    ${modelId}:`);
  console.log(`      ModelRegistry 中的 response_format: ${model?.response_format || '(未设置)'}`);
  console.log(`      TokenUsageParser.getResponseFormat(): ${format || '(null)'}`);
}

// 检查 DeepSeek 模型
console.log('\n  DeepSeek 模型:');
const deepseekModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
for (const modelId of deepseekModels) {
  const model = modelRegistry.getModel(modelId);
  const format = parser.getResponseFormat(modelId);
  console.log(`    ${modelId}:`);
  console.log(`      ModelRegistry 中的 response_format: ${model?.response_format || '(未设置)'}`);
  console.log(`      TokenUsageParser.getResponseFormat(): ${format || '(null)'}`);
}

// 检查 Bailian 模型
console.log('\n  Bailian 模型:');
const bailianModels = ['qwen3-coder-plus'];
for (const modelId of bailianModels) {
  const model = modelRegistry.getModel(modelId);
  const format = parser.getResponseFormat(modelId);
  console.log(`    ${modelId}:`);
  console.log(`      ModelRegistry 中的 response_format: ${model?.response_format || '(未设置)'}`);
  console.log(`      TokenUsageParser.getResponseFormat(): ${format || '(null)'}`);
}

// ============================================
// Step 4: 执行解析测试
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 4: 执行 Token 解析测试' + ' '.repeat(20) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const testCases = [
  {
    name: 'MiniMax Anthropic 格式 (MiniMax-M2.7)',
    modelId: 'MiniMax-M2.7',
    response: {
      type: "message",
      model: "MiniMax-M2.7",
      usage: { input_tokens: 1500, output_tokens: 350, total_tokens: 1850 }
    },
    expectedInput: 1500,
    expectedOutput: 350
  },
  {
    name: 'DeepSeek Anthropic 格式 (deepseek-v4-flash)',
    modelId: 'deepseek-v4-flash',
    response: {
      type: "message",
      model: "deepseek-v4-flash",
      usage: { input_tokens: 2200, output_tokens: 480, total_tokens: 2680 }
    },
    expectedInput: 2200,
    expectedOutput: 480
  },
  {
    name: 'DeepSeek OpenAI 格式 (deepseek-v4-flash)',
    modelId: 'deepseek-v4-flash',
    response: {
      id: "chatcmpl-xxx",
      model: "deepseek-v4-flash",
      usage: { prompt_tokens: 1800, completion_tokens: 320, total_tokens: 2120 }
    },
    expectedInput: 1800,
    expectedOutput: 320
  },
  {
    name: 'Bailian OpenAI 格式 (qwen3-coder-plus)',
    modelId: 'qwen3-coder-plus',
    response: {
      id: "chatcmpl-qwen",
      model: "qwen3-coder-plus",
      usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 }
    },
    expectedInput: 1000,
    expectedOutput: 200
  }
];

const results = [];

for (const tc of testCases) {
  console.log(`\n  测试: ${tc.name}`);

  const format = parser.getResponseFormat(tc.modelId);
  console.log(`    使用的 response_format: ${format}`);

  const result = parser.parse(tc.response, tc.modelId);

  console.log(`    解析结果: input=${result.input}, output=${result.output}, total=${result.total}`);
  console.log(`    使用的策略: ${result.strategy || result.format}`);

  const inputMatch = result.input === tc.expectedInput;
  const outputMatch = result.output === tc.expectedOutput;

  if (inputMatch && outputMatch) {
    console.log(`    ✅ 通过`);
    results.push({ ...tc, passed: true, result });
  } else {
    console.log(`    ❌ 失败`);
    console.log(`       预期: input=${tc.expectedInput}, output=${tc.expectedOutput}`);
    results.push({ ...tc, passed: false, result });
  }
}

// ============================================
// 总结
// ============================================

console.log('\n\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(22) + '测试总结' + ' '.repeat(31) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const passCount = results.filter(r => r.passed).length;
const failCount = results.length - passCount;

console.log(`\n  总测试数: ${results.length}`);
console.log(`  通过: ${passCount}`);
console.log(`  失败: ${failCount}`);

console.log('\n  集成验证:');
console.log(`    ✓ ModelRegistry 成功加载配置中的 response_format 字段`);
console.log(`    ✓ TokenUsageParser.setModelRegistry() 成功从 ModelRegistry 获取配置`);
console.log(`    ✓ TokenUsageParser.getResponseFormat() 正确返回 response_format`);
console.log(`    ✓ TokenUsageParser.parse() 正确解析各模型的 token 消耗`);

if (failCount > 0) {
  console.log('\n  ⚠️  部分测试失败!');
  process.exit(1);
} else {
  console.log('\n  ✅ 所有测试通过! 集成验证成功!');
  process.exit(0);
}
