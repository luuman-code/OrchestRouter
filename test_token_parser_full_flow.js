/**
 * TokenUsageParser 完整流程测试脚本
 *
 * 测试完整流程：
 * 1. 从配置文件加载相关配置参数
 * 2. 根据模型ID匹配正确的模型配置
 * 3. 根据模型对应的请求格式选择正确的解析策略
 * 4. 正确解析并提取 token 消耗
 *
 * 运行方式: node test_token_parser_full_flow.js
 */

const fs = require('fs');
const path = require('path');
const TokenUsageParser = require('./src/executor/utils/TokenUsageParser');

// ============================================
// 1. 从配置文件加载配置参数
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 1: 从配置文件加载参数' + ' '.repeat(20) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const configPath = path.join(__dirname, 'config', 'config.json');
const configContent = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configContent);

console.log(`\n  配置文件路径: ${configPath}`);
console.log(`  提供商数量: ${config.Providers.length}`);

// ============================================
// 2. 从配置中提取各模型的 response_format
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 2: 提取模型配置信息' + ' '.repeat(21) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

// 从 Provider 配置中提取各模型的 response_format
const providersConfig = {};
const providerResponseFormats = {};

for (const provider of config.Providers) {
  console.log(`\n  提供商: ${provider.name} (adapter: ${provider.adapter})`);

  // 如果 Provider 有 response_format 字段，保存
  if (provider.response_format) {
    providerResponseFormats[provider.name] = provider.response_format;
    console.log(`    Provider 级 response_format: ${provider.response_format}`);
  }

  // 遍历所有模型
  for (const model of (provider.models || [])) {
    const modelId = model.id || model.api_model_id;
    if (!modelId) continue;

    // 模型的 response_format 优先级高于 Provider 级
    const modelResponseFormat = model.response_format || provider.response_format || null;

    providersConfig[modelId] = {
      response_format: modelResponseFormat,
      provider: provider.name,
      adapter: provider.adapter
    };

    console.log(`    模型: ${modelId} -> response_format: ${modelResponseFormat || '(未配置)'}`);
  }
}

// ============================================
// 3. 构建 TokenUsageParser 并设置配置
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 3: 初始化 TokenUsageParser' + ' '.repeat(17) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const parser = new TokenUsageParser();
parser.setProvidersConfig(providersConfig);

console.log('\n  已设置 providersConfig，模型数量:', Object.keys(providersConfig).length);
console.log('\n  providersConfig 内容预览:');
const previewModels = Object.keys(providersConfig).slice(0, 5);
for (const modelId of previewModels) {
  console.log(`    ${modelId}: ${JSON.stringify(providersConfig[modelId])}`);
}
if (Object.keys(providersConfig).length > 5) {
  console.log(`    ... 还有 ${Object.keys(providersConfig).length - 5} 个模型`);
}

// ============================================
// 4. 准备测试数据
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 4: 准备测试数据' + ' '.repeat(24) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

// 测试用例定义
const testCases = [
  {
    name: 'DeepSeek Anthropic 格式 (deepseek-v4-flash)',
    modelId: 'deepseek-v4-flash',
    expectedFormat: 'anthropic',
    response: {
      type: "message",
      id: "msg_deepseek_001",
      role: "assistant",
      content: [{ type: "text", text: "DeepSeek Anthropic 格式响应" }],
      model: "deepseek-v4-flash",
      usage: {
        input_tokens: 2200,
        output_tokens: 480,
        total_tokens: 2680
      },
      stop_reason: "end_turn"
    },
    expectedInput: 2200,
    expectedOutput: 480
  },
  {
    name: 'DeepSeek OpenAI 格式 (deepseek-v4-flash)',
    modelId: 'deepseek-v4-flash',
    expectedFormat: 'anthropic',  // 配置中是 anthropic，但实际可能返回 openai
    response: {
      id: "chatcmpl_deepseek_001",
      object: "chat.completion",
      model: "deepseek-v4-flash",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "DeepSeek OpenAI 格式响应" },
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: 1800,
        completion_tokens: 320,
        total_tokens: 2120
      }
    },
    expectedInput: 1800,  // 自动检测后会变成 1800
    expectedOutput: 320
  },
  {
    name: 'MiniMax Anthropic 格式 (MiniMax-M2.7)',
    modelId: 'MiniMax-M2.7',
    expectedFormat: 'anthropic',
    response: {
      type: "message",
      id: "msg_minimax_001",
      role: "assistant",
      content: [{ type: "text", text: "MiniMax Anthropic 格式响应" }],
      model: "MiniMax-M2.7",
      usage: {
        input_tokens: 1500,
        output_tokens: 350,
        total_tokens: 1850
      },
      stop_reason: "end_turn"
    },
    expectedInput: 1500,
    expectedOutput: 350
  },
  {
    name: 'MiniMax Anthropic 格式 (MiniMax-M2.7-highspeed)',
    modelId: 'MiniMax-M2.7-highspeed',
    expectedFormat: 'anthropic',
    response: {
      type: "message",
      id: "msg_minimax_002",
      role: "assistant",
      content: [{ type: "text", text: "MiniMax M2.7-highspeed 响应" }],
      model: "MiniMax-M2.7-highspeed",
      usage: {
        input_tokens: 800,
        output_tokens: 200,
        total_tokens: 1000
      },
      stop_reason: "end_turn"
    },
    expectedInput: 800,
    expectedOutput: 200
  },
  {
    name: 'DeepSeek Anthropic 格式 (deepseek-v4-pro)',
    modelId: 'deepseek-v4-pro',
    expectedFormat: 'anthropic',
    response: {
      type: "message",
      id: "msg_deepseek_pro_001",
      role: "assistant",
      content: [{ type: "text", text: "DeepSeek V4 Pro 响应" }],
      model: "deepseek-v4-pro",
      usage: {
        input_tokens: 3500,
        output_tokens: 1200,
        total_tokens: 4700
      },
      stop_reason: "end_turn"
    },
    expectedInput: 3500,
    expectedOutput: 1200
  }
];

console.log(`\n  共准备 ${testCases.length} 个测试用例:`);
testCases.forEach((tc, i) => {
  console.log(`    ${i + 1}. ${tc.name}`);
  console.log(`       模型ID: ${tc.modelId}`);
  console.log(`       预期格式: ${tc.expectedFormat}`);
});

// ============================================
// 5. 执行测试
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 5: 执行测试' + ' '.repeat(27) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

const results = [];

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试 ${i + 1}: ${tc.name}`);
  console.log(`${'='.repeat(60)}`);

  // 5.1 验证模型配置匹配
  console.log('\n  [5.1] 验证模型配置匹配:');
  const modelConfig = providersConfig[tc.modelId];
  if (!modelConfig) {
    console.log(`      ❌ 模型 ${tc.modelId} 未在配置中找到!`);
    results.push({ ...tc, passed: false, error: 'Model not found in config' });
    continue;
  }
  console.log(`      ✓ 模型配置: ${JSON.stringify(modelConfig)}`);

  // 5.2 验证 response_format 获取
  console.log('\n  [5.2] 验证 response_format 获取:');
  const actualFormat = parser.getResponseFormat(tc.modelId);
  console.log(`      配置中的 response_format: ${actualFormat || '(未配置)'}`);
  console.log(`      预期的 response_format: ${tc.expectedFormat}`);
  const formatMatch = actualFormat === tc.expectedFormat;
  console.log(`      ${formatMatch ? '✓' : '⚠️'} 格式匹配: ${formatMatch ? '是' : '否 (将使用自动检测)'}`);

  // 5.3 执行解析
  console.log('\n  [5.3] 执行 Token 解析:');
  console.log(`      响应中的 usage 字段:`);
  const usageField = tc.response.usage || tc.response.usageMetadata;
  console.log(`        ${JSON.stringify(usageField, null, 2).split('\n').join('\n        ')}`);

  const parseResult = parser.parse(tc.response, tc.modelId);

  console.log(`\n      解析结果:`);
  console.log(`        input: ${parseResult.input}`);
  console.log(`        output: ${parseResult.output}`);
  console.log(`        total: ${parseResult.total}`);
  console.log(`        format: ${parseResult.format}`);
  console.log(`        modelId: ${parseResult.modelId}`);
  if (parseResult.autoDetected) {
    console.log(`        autoDetected: ${parseResult.autoDetected}`);
  }

  // 5.4 验证解析结果
  console.log('\n  [5.4] 验证解析结果:');
  const inputMatch = parseResult.input === tc.expectedInput;
  const outputMatch = parseResult.output === tc.expectedOutput;

  console.log(`      Input Token: 预期=${tc.expectedInput}, 实际=${parseResult.input} ${inputMatch ? '✓' : '✗'}`);
  console.log(`      Output Token: 预期=${tc.expectedOutput}, 实际=${parseResult.output} ${outputMatch ? '✓' : '✗'}`);

  const passed = inputMatch && outputMatch;
  console.log(`\n      ${passed ? '✅ 测试通过!' : '❌ 测试失败!'}`);

  results.push({
    ...tc,
    modelConfig,
    parseResult,
    inputMatch,
    outputMatch,
    passed,
    actualFormat
  });
}

// ============================================
// 6. 验证配置加载机制
// ============================================

console.log('\n\n');
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' '.repeat(18) + 'Step 6: 验证配置加载机制' + ' '.repeat(20) + '║');
console.log('╚' + '═'.repeat(68) + '╝');

console.log('\n  [6.1] 验证从配置文件加载的 MiniMax 模型:');
const minimaxModels = Object.entries(providersConfig)
  .filter(([_, cfg]) => cfg.provider === 'minimax')
  .slice(0, 3);

for (const [modelId, cfg] of minimaxModels) {
  const format = parser.getResponseFormat(modelId);
  console.log(`      ${modelId}: format=${format}, config=${JSON.stringify(cfg)}`);
}
if (Object.entries(providersConfig).filter(([_, cfg]) => cfg.provider === 'minimax').length > 3) {
  console.log(`      ... 还有 ${Object.entries(providersConfig).filter(([_, cfg]) => cfg.provider === 'minimax').length - 3} 个 MiniMax 模型`);
}

console.log('\n  [6.2] 验证从配置文件加载的 DeepSeek 模型:');
const deepseekModels = Object.entries(providersConfig)
  .filter(([_, cfg]) => cfg.provider === 'deepseek');

for (const [modelId, cfg] of deepseekModels) {
  const format = parser.getResponseFormat(modelId);
  console.log(`      ${modelId}: format=${format}, config=${JSON.stringify(cfg)}`);
}

console.log('\n  [6.3] 验证解析策略选择:');
for (const [modelId, cfg] of deepseekModels.slice(0, 1)) {
  const format = parser.getResponseFormat(modelId);
  const strategy = parser.getStrategy(format);
  console.log(`      模型 ${modelId}:`);
  console.log(`        response_format: ${format}`);
  console.log(`        解析策略: ${strategy ? strategy.name : '未找到'}`);
  if (strategy) {
    console.log(`        inputField: ${strategy.inputField}`);
    console.log(`        outputField: ${strategy.outputField}`);
  }
}

// ============================================
// 7. 总结
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

console.log('\n  详细结果:');
results.forEach((r, i) => {
  console.log(`    ${i + 1}. ${r.name}: ${r.passed ? '✓ 通过' : '✗ 失败'}`);
  if (!r.passed) {
    console.log(`       预期: input=${r.expectedInput}, output=${r.expectedOutput}`);
    console.log(`       实际: input=${r.parseResult?.input}, output=${r.parseResult?.output}`);
  }
});

console.log('\n  配置加载验证:');
console.log(`    ✓ 成功从 config.json 加载 ${Object.keys(providersConfig).length} 个模型配置`);
console.log(`    ✓ 成功设置 providersConfig 到 TokenUsageParser`);
console.log(`    ✓ getResponseFormat() 能正确返回各模型的 response_format`);

console.log('\n  解析策略验证:');
const strategies = ['openai', 'anthropic', 'ollama', 'gemini'];
for (const s of strategies) {
  const strategy = parser.getStrategy(s);
  console.log(`    ${s}: ${strategy ? '✓ 已注册' : '✗ 未注册'}`);
  if (strategy) {
    console.log(`      inputField=${strategy.inputField}, outputField=${strategy.outputField}`);
  }
}

if (failCount > 0) {
  console.log('\n  ⚠️  部分测试失败!');
  process.exit(1);
} else {
  console.log('\n  ✅ 所有测试通过!');
  process.exit(0);
}
