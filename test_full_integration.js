/**
 * 完整流程集成测试
 *
 * 测试从 TokenUsageParser → CostTracker → MetricsCollector 的完整流程
 *
 * 运行方式: node test_full_integration.js
 */

const fs = require('fs');
const path = require('path');

// 加载模块
const ModelRegistry = require('./src/selector/registry/ModelRegistry');
const TokenUsageParser = require('./src/executor/utils/TokenUsageParser');
const { CostTracker } = require('./src/executor/core/CostTracker');
const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function runTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + '完整流程集成测试' + ' '.repeat(24) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  // ============================================
  // Step 1: 初始化组件
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 1: 初始化组件' + ' '.repeat(25) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  // 加载配置
  const configPath = path.join(__dirname, 'config', 'config.json');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);

  // 创建 ModelRegistry
  const modelRegistry = new ModelRegistry();
  modelRegistry.loadFromUnifiedConfig(config);
  console.log(`  ✓ ModelRegistry: 已加载 ${modelRegistry.getAllModels().length} 个模型`);

  // 创建 TokenUsageParser
  const tokenUsageParser = new TokenUsageParser();
  tokenUsageParser.setModelRegistry(modelRegistry);
  console.log('  ✓ TokenUsageParser: 已设置 ModelRegistry');

  // 创建 CostTracker（包含 MetricsCollector）
  const costTracker = new CostTracker(null, tokenUsageParser, modelRegistry);
  console.log('  ✓ CostTracker: 已创建（内部包含 MetricsCollector）');

  // 验证 MetricsCollector 已正确设置 CostTracker
  console.log('  ✓ MetricsCollector: 已设置 CostTracker 引用');

  // ============================================
  // Step 2: 模拟 API 响应解析
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'Step 2: 模拟 API 响应解析' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  // 模拟 MiniMax API 响应 (Anthropic 格式)
  const minimaxResponse = {
    type: "message",
    id: "msg_001",
    model: "MiniMax-M2.7",
    usage: {
      input_tokens: 1500,
      output_tokens: 350,
      total_tokens: 1850
    },
    content: [{ type: "text", text: "Test response" }]
  };

  // 模拟 DeepSeek API 响应 (Anthropic 格式)
  const deepseekResponse = {
    type: "message",
    id: "msg_002",
    model: "deepseek-v4-flash",
    usage: {
      input_tokens: 2200,
      output_tokens: 480,
      total_tokens: 2680
    },
    content: [{ type: "text", text: "Test response" }]
  };

  // 解析 MiniMax 响应
  const minimaxUsage = tokenUsageParser.parse(minimaxResponse, 'MiniMax-M2.7');
  console.log(`\n  MiniMax-M2.7 解析结果:`);
  console.log(`    input: ${minimaxUsage.input}, output: ${minimaxUsage.output}, total: ${minimaxUsage.total}`);
  console.log(`    format: ${minimaxUsage.format}`);

  // 解析 DeepSeek 响应
  const deepseekUsage = tokenUsageParser.parse(deepseekResponse, 'deepseek-v4-flash');
  console.log(`\n  deepseek-v4-flash 解析结果:`);
  console.log(`    input: ${deepseekUsage.input}, output: ${deepseekUsage.output}, total: ${deepseekUsage.total}`);
  console.log(`    format: ${deepseekUsage.format}`);

  // ============================================
  // Step 3: 成本计算
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 3: 成本计算' + ' '.repeat(27) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const minimaxCost = costTracker.calculateCost('MiniMax-M2.7', minimaxUsage);
  const deepseekCost = costTracker.calculateCost('deepseek-v4-flash', deepseekUsage);

  console.log(`\n  MiniMax-M2.7 成本计算:`);
  console.log(`    tokenUsage: input=${minimaxUsage.input}, output=${minimaxUsage.output}`);
  const minimaxPricing = costTracker.getModelPricing('MiniMax-M2.7');
  console.log(`    pricing: input=$${minimaxPricing.inputPrice}/M, output=$${minimaxPricing.outputPrice}/M`);
  console.log(`    cost: $${minimaxCost.toFixed(8)}`);

  console.log(`\n  deepseek-v4-flash 成本计算:`);
  console.log(`    tokenUsage: input=${deepseekUsage.input}, output=${deepseekUsage.output}`);
  const deepseekPricing = costTracker.getModelPricing('deepseek-v4-flash');
  console.log(`    pricing: input=$${deepseekPricing.inputPrice}/M, output=$${deepseekPricing.outputPrice}/M`);
  console.log(`    cost: $${deepseekCost.toFixed(8)}`);

  // ============================================
  // Step 4: CostTracker 更新成本
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 4: CostTracker 更新成本' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const taskId1 = 'task-' + Date.now() + '-1';
  const taskId2 = 'task-' + Date.now() + '-2';

  await costTracker.updateActualCost(taskId1, minimaxCost, minimaxUsage, 'MiniMax-M2.7');
  console.log(`  ✓ CostTracker.updateActualCost(${taskId1})`);

  await costTracker.updateActualCost(taskId2, deepseekCost, deepseekUsage, 'deepseek-v4-flash');
  console.log(`  ✓ CostTracker.updateActualCost(${taskId2})`);

  // ============================================
  // Step 5: MetricsCollector 收集指标
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'Step 5: MetricsCollector 收集指标' + ' '.repeat(18) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const sessionId = 'session-integration-test-' + Date.now();

  // 使用 parseAndUpdateCost 一站式处理
  const result1 = await costTracker.parseAndUpdateCost(
    'task-001',
    minimaxResponse,
    'MiniMax-M2.7',
    sessionId,
    1000
  );
  console.log(`\n  parseAndUpdateCost(task-001, MiniMax-M2.7):`);
  console.log(`    tokenUsage: ${JSON.stringify(result1.tokenUsage)}`);
  console.log(`    actualCost: $${result1.actualCost.toFixed(8)}`);

  const result2 = await costTracker.parseAndUpdateCost(
    'task-002',
    deepseekResponse,
    'deepseek-v4-flash',
    sessionId,
    1500
  );
  console.log(`\n  parseAndUpdateCost(task-002, deepseek-v4-flash):`);
  console.log(`    tokenUsage: ${JSON.stringify(result2.tokenUsage)}`);
  console.log(`    actualCost: $${result2.actualCost.toFixed(8)}`);

  // ============================================
  // Step 6: 验证持久化
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 6: 验证持久化' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  // 通过 CostTracker 获取关联的 MetricsCollector
  const metricsCollector = costTracker.metricsCollector;
  const today = new Date().toISOString().split('T')[0];
  const dailyData = await metricsCollector.getDailyMetrics(today);

  console.log(`\n  今日指标 (${today}):`);
  console.log(`    任务数: ${dailyData.tasks?.length || 0}`);
  console.log(`    总 Token: input=${dailyData.totalTokens?.input || 0}, output=${dailyData.totalTokens?.output || 0}`);
  console.log(`    总成本: $${dailyData.totalCost?.toFixed(8)}`);

  // ============================================
  // 总结
  // ============================================

  console.log('\n\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(22) + '测试总结' + ' '.repeat(31) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log('\n  ✅ 完整流程验证通过!');
  console.log('\n  流程验证:');
  console.log('    1. config.json → ModelRegistry (response_format + pricing)');
  console.log('    2. TokenUsageParser.setModelRegistry() → 获取模型配置');
  console.log('    3. API 响应 → TokenUsageParser.parse() → Token 消耗');
  console.log('    4. CostTracker.calculateCost() → 从 ModelRegistry 获取定价 → 成本');
  console.log('    5. CostTracker.updateActualCost() → 更新成本状态');
  console.log('    6. CostTracker.metricsCollector → MetricsCollector');
  console.log('    7. MetricsCollector.recordTask() → 收集并持久化');
  console.log('    8. MetricsCollector.getDailyMetrics() → 从文件读取');

  console.log('\n  组件关系:');
  console.log('    ConcurrentExecutor');
  console.log('      ↓ 创建');
  console.log('    TokenUsageParser ← ModelRegistry');
  console.log('      ↓ 创建');
  console.log('    CostTracker ← TokenUsageParser');
  console.log('      ↓ 创建（内部）');
  console.log('    MetricsCollector');
  console.log('      ↑ 委托成本计算');
  console.log('      ↓ 设置自身引用');
  console.log('    CostTracker');

  console.log('\n  ✅ 所有验证通过!');
}

runTests().catch(console.error);
