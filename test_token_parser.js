/**
 * TokenUsageParser 测试脚本
 *
 * 测试 TokenUsageParser 能否正确解析 MiniMax 和 DeepSeek 模型响应中的 token 消耗
 *
 * 运行方式: node test_token_parser.js
 */

const TokenUsageParser = require('./src/executor/utils/TokenUsageParser');

// ============================================
// 测试响应数据
// ============================================

// MiniMax Anthropic 格式响应
const minimaxAnthropicResponse = {
  type: "message",
  id: "msg_123456",
  role: "assistant",
  content: [
    {
      type: "text",
      text: "这是 MiniMax 模型的响应内容。"
    }
  ],
  model: "MiniMax-M2.7",
  usage: {
    input_tokens: 1500,
    output_tokens: 350,
    total_tokens: 1850
  },
  stop_reason: "end_turn"
};

// DeepSeek Anthropic 格式响应
const deepseekAnthropicResponse = {
  type: "message",
  id: "msg_789012",
  role: "assistant",
  content: [
    {
      type: "text",
      text: "这是 DeepSeek 模型的响应内容。"
    }
  ],
  model: "deepseek-v4-flash",
  usage: {
    input_tokens: 2200,
    output_tokens: 480,
    total_tokens: 2680
  },
  stop_reason: "end_turn"
};

// DeepSeek OpenAI 格式响应
const deepseekOpenAIResponse = {
  id: "chatcmpl-abc123",
  object: "chat.completion",
  created: 1677858242,
  model: "deepseek-v4-flash",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "这是 DeepSeek 的 OpenAI 格式响应。"
      },
      finish_reason: "stop"
    }
  ],
  usage: {
    prompt_tokens: 2200,
    completion_tokens: 480,
    total_tokens: 2680
  }
};

// Bailian (Qwen) OpenAI 格式响应
const bailianOpenAIResponse = {
  id: "chatcmpl-qwen123",
  object: "chat.completion",
  created: 1677858242,
  model: "qwen3-coder-plus",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "这是 Bailian (Qwen) 的响应内容。"
      },
      finish_reason: "stop"
    }
  ],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200
  }
};

// ============================================
// 构建模型配置（模拟 config.json 中的 Providers 配置）
// ============================================

const providersConfig = {
  // MiniMax 模型
  'MiniMax-M2.7': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2.7-highspeed': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2.5': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2.5-highspeed': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2.1': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2.1-highspeed': { response_format: 'anthropic', provider: 'minimax' },
  'MiniMax-M2': { response_format: 'anthropic', provider: 'minimax' },

  // DeepSeek 模型
  'deepseek-v4-flash': { response_format: 'anthropic', provider: 'deepseek' },
  'deepseek-v4-pro': { response_format: 'anthropic', provider: 'deepseek' },

  // Bailian 模型
  'qwen3-coder-plus': { response_format: 'openai', provider: 'bailian' },
  'qwen3-coder-next': { response_format: 'openai', provider: 'bailian' },
  'qwen3.5-plus': { response_format: 'openai', provider: 'bailian' },
  'qwen3-max-2026-01-23': { response_format: 'openai', provider: 'bailian' },

  // Kimi 模型
  'kimi-k2.5': { response_format: 'openai', provider: 'bailian' },

  // GLM 模型
  'glm-5': { response_format: 'openai', provider: 'bailian' },
  'glm-4.7': { response_format: 'openai', provider: 'bailian' }
};

// ============================================
// 测试函数
// ============================================

function runTest(testName, response, modelId, providersConfig, expectedInput, expectedOutput) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${testName}`);
  console.log(`${'='.repeat(60)}`);

  console.log(`\n模型 ID: ${modelId}`);
  console.log(`响应中的 usage 字段:`);
  console.log(JSON.stringify(response.usage || response.usageMetadata, null, 2));

  // 创建 TokenUsageParser 并设置配置
  const parser = new TokenUsageParser();
  parser.setProvidersConfig(providersConfig);

  try {
    const result = parser.parse(response, modelId);

    console.log(`\n解析结果:`);
    console.log(JSON.stringify(result, null, 2));

    // 验证解析结果
    const inputMatch = result.input === expectedInput;
    const outputMatch = result.output === expectedOutput;

    console.log(`\n验证结果:`);
    console.log(`  Input Token: 预期=${expectedInput}, 实际=${result.input}, ${inputMatch ? '✓ 通过' : '✗ 失败'}`);
    console.log(`  Output Token: 预期=${expectedOutput}, 实际=${result.output}, ${outputMatch ? '✓ 通过' : '✗ 失败'}`);
    console.log(`  Format Used: ${result.format}`);

    if (inputMatch && outputMatch) {
      console.log(`\n  ✅ 测试通过!`);
      return true;
    } else {
      console.log(`\n  ❌ 测试失败!`);
      return false;
    }
  } catch (error) {
    console.log(`\n  ❌ 解析出错: ${error.message}`);
    return false;
  }
}

// ============================================
// 执行测试
// ============================================

console.log('\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(12) + 'TokenUsageParser 修复验证测试' + ' '.repeat(13) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

const results = [];

// 测试 1: MiniMax Anthropic 格式
results.push(runTest(
  'MiniMax Anthropic 格式',
  minimaxAnthropicResponse,
  'MiniMax-M2.7',
  providersConfig,
  1500,   // 预期 input_tokens
  350     // 预期 output_tokens
));

// 测试 2: DeepSeek Anthropic 格式
results.push(runTest(
  'DeepSeek Anthropic 格式',
  deepseekAnthropicResponse,
  'deepseek-v4-flash',
  providersConfig,
  2200,   // 预期 input_tokens
  480     // 预期 output_tokens
));

// 测试 3: DeepSeek OpenAI 格式
results.push(runTest(
  'DeepSeek OpenAI 格式',
  deepseekOpenAIResponse,
  'deepseek-v4-flash',
  providersConfig,
  2200,   // 预期 prompt_tokens
  480     // 预期 completion_tokens
));

// 测试 4: Bailian OpenAI 格式
results.push(runTest(
  'Bailian (Qwen) OpenAI 格式',
  bailianOpenAIResponse,
  'qwen3-coder-plus',
  providersConfig,
  1000,   // 预期 prompt_tokens
  200     // 预期 completion_tokens
));

// 测试 5: 直接指定 format（绕过配置）
console.log('\n\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(15) + '直接指定 Format 测试' + ' '.repeat(20) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

{
  const parser = new TokenUsageParser();
  parser.setProvidersConfig(providersConfig);

  // 直接指定 format
  const result = parser.parse(minimaxAnthropicResponse, 'MiniMax-M2.7', { format: 'anthropic' });
  const pass = result.input === 1500 && result.output === 350;
  console.log(`\n  直接指定 format='anthropic': ${pass ? '✓ 通过' : '✗ 失败'}`);
  console.log(`    Input: ${result.input}, Output: ${result.output}`);
  results.push(pass);
}

// 测试 6: 自定义解析策略
console.log('\n\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(13) + '自定义解析策略测试' + ' '.repeat(22) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

{
  const parser = new TokenUsageParser();

  // 注册自定义策略
  parser.registerStrategy('custom-format', {
    inputField: 'data.input_tokens',
    outputField: 'data.output_tokens',
    totalField: 'data.total_tokens'
  });

  // 注册完全自定义解析函数
  parser.registerStrategy('weird-format', {
    parse: (response, strategy) => {
      return {
        input: response.weird?.input || 0,
        output: response.weird?.output || 0,
        total: (response.weird?.input || 0) + (response.weird?.output || 0)
      };
    }
  });

  // 测试字段定义方式
  const customResponse1 = {
    data: {
      input_tokens: 999,
      output_tokens: 111,
      total_tokens: 1110
    }
  };
  const result1 = parser.parse(customResponse1, 'some-model', { format: 'custom-format' });
  const pass1 = result1.input === 999 && result1.output === 111;
  console.log(`\n  自定义策略 (字段定义): ${pass1 ? '✓ 通过' : '✗ 失败'}`);
  console.log(`    Input: ${result1.input}, Output: ${result1.output}, Format: ${result1.format}`);

  // 测试函数方式
  const customResponse2 = {
    weird: {
      input: 777,
      output: 333
    }
  };
  const result2 = parser.parse(customResponse2, 'some-model', { format: 'weird-format' });
  const pass2 = result2.input === 777 && result2.output === 333;
  console.log(`\n  自定义策略 (函数定义): ${pass2 ? '✓ 通过' : '✗ 失败'}`);
  console.log(`    Input: ${result2.input}, Output: ${result2.output}, Format: ${result2.format}`);

  results.push(pass1 && pass2);
}

// 测试 7: loadCustomStrategies 方法
console.log('\n\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(10) + 'loadCustomStrategies 测试' + ' '.repeat(21) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

{
  const parser = new TokenUsageParser();

  const customConfigs = {
    'my-provider': {
      inputField: 'custom.input',
      outputField: 'custom.output',
      totalField: 'custom.total'
    }
  };

  parser.loadCustomStrategies(customConfigs);

  const customResponse = {
    custom: {
      input: 500,
      output: 100,
      total: 600
    }
  };

  const result = parser.parse(customResponse, 'my-model', { format: 'my-provider' });
  const pass = result.input === 500 && result.output === 100;
  console.log(`\n  loadCustomStrategies: ${pass ? '✓ 通过' : '✗ 失败'}`);
  console.log(`    Input: ${result.input}, Output: ${result.output}, Format: ${result.format}`);

  results.push(pass);
}

// ============================================
// 总结
// ============================================

console.log('\n\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(20) + '测试总结' + ' '.repeat(24) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

const passCount = results.filter(r => r).length;
const failCount = results.length - passCount;

console.log(`\n  总测试数: ${results.length}`);
console.log(`  通过: ${passCount}`);
console.log(`  失败: ${failCount}`);

if (failCount > 0) {
  console.log('\n  ⚠️  部分测试失败!');
  process.exit(1);
} else {
  console.log('\n  ✅ 所有测试通过!');
  process.exit(0);
}
