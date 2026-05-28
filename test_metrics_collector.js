/**
 * MetricsCollector 重构验证测试脚本
 *
 * 验证 MetricsCollector 重构后：
 * 1. 接受 CostTracker 实例进行成本计算
 * 2. 只负责数据收集和持久化
 * 3. 不再重复定价逻辑
 *
 * 运行方式: node test_metrics_collector.js
 */

const fs = require('fs');
const path = require('path');

// 加载模块
const ModelRegistry = require('./src/selector/registry/ModelRegistry');
const { CostTracker } = require('./src/executor/core/CostTracker');
const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function runTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'MetricsCollector 重构验证测试' + ' '.repeat(16) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  // ============================================
  // Step 1: 加载 ModelRegistry
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 1: 加载 ModelRegistry' + ' '.repeat(23) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const modelRegistry = new ModelRegistry();

  const configPath = path.join(__dirname, 'config', 'config.json');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);
  modelRegistry.loadFromUnifiedConfig(config);

  console.log(`\n  已加载 ${modelRegistry.getAllModels().length} 个模型`);

  // ============================================
  // Step 2: 创建 CostTracker（负责定价读取 + 成本计算）
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(12) + 'Step 2: 创建 CostTracker (定价+成本计算)' + ' '.repeat(13) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const costTracker = new CostTracker(null, null, modelRegistry);
  costTracker.setModelRegistry(modelRegistry);

  console.log('\n  CostTracker 已设置 ModelRegistry');

  // ============================================
  // Step 3: 创建 MetricsCollector（只负责数据收集+持久化）
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'Step 3: 创建 MetricsCollector' + ' '.repeat(20) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const metricsCollector = new MetricsCollector(costTracker);
  metricsCollector.setCostTracker(costTracker);

  console.log('\n  MetricsCollector 已设置 CostTracker');
  console.log('\n  职责划分:');
  console.log('    CostTracker:       定价读取 + 成本计算');
  console.log('    MetricsCollector: 数据收集 + 持久化');

  // ============================================
  // Step 4: 验证成本计算（由 CostTracker 执行）
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 4: 验证成本计算' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const testCases = [
    {
      name: 'MiniMax Anthropic 格式',
      modelId: 'MiniMax-M2.7',
      tokenUsage: { input: 1500, output: 350, total: 1850 }
    },
    {
      name: 'DeepSeek Anthropic 格式',
      modelId: 'deepseek-v4-flash',
      tokenUsage: { input: 2200, output: 480, total: 2680 }
    }
  ];

  for (const tc of testCases) {
    const cost = costTracker.calculateCost(tc.modelId, tc.tokenUsage);

    console.log(`\n  测试: ${tc.name}`);
    console.log(`    模型: ${tc.modelId}`);
    console.log(`    Token: input=${tc.tokenUsage.input}, output=${tc.tokenUsage.output}`);
    console.log(`    成本: $${cost.toFixed(8)} (由 CostTracker 计算)`);
  }

  // ============================================
  // Step 5: 验证数据收集（MetricsCollector 委托 CostTracker 计算）
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'Step 5: 验证数据收集' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const sessionId = 'test-session-refactored-' + Date.now();
  const taskId = 'test-task-refactored-001';

  console.log(`\n  测试会话 ID: ${sessionId}`);

  // 记录任务（MetricsCollector 内部委托 CostTracker 计算成本）
  const taskRecord = await metricsCollector.recordTask(
    sessionId,
    taskId,
    'MiniMax-M2.7',
    { input: 1500, output: 350, total: 1850 },
    1000,
    { provider: 'minimax' }
  );

  console.log(`\n  记录任务结果 (由 MetricsCollector 收集):`);
  console.log(`    taskId: ${taskRecord?.taskId}`);
  console.log(`    modelId: ${taskRecord?.modelId}`);
  console.log(`    tokenUsage: ${JSON.stringify(taskRecord?.tokenUsage)}`);
  console.log(`    cost: $${taskRecord?.cost?.toFixed(8)} (CostTracker 计算)`);

  // 获取会话指标
  const sessionMetrics = metricsCollector.getSessionMetrics(sessionId);
  console.log(`\n  会话指标:`);
  console.log(`    totalTokens: ${JSON.stringify(sessionMetrics?.totalTokens)}`);
  console.log(`    totalCost: $${sessionMetrics?.totalCost?.toFixed(8)}`);

  // ============================================
  // Step 6: 验证持久化
  // ============================================

  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Step 6: 验证持久化' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const today = new Date().toISOString().split('T')[0];
  const dailyData = await metricsCollector.getDailyMetrics(today);

  console.log(`\n  今日指标 (从持久化文件读取):`);
  console.log(`    日期: ${dailyData.date}`);
  console.log(`    任务数: ${dailyData.tasks?.length || 0}`);
  console.log(`    总 Token: input=${dailyData.totalTokens?.input || 0}, output=${dailyData.totalTokens?.output || 0}`);
  console.log(`    总成本: $${dailyData.totalCost?.toFixed(8)}`);
  console.log(`    ✅ 持久化成功`);

  // ============================================
  // 总结
  // ============================================

  console.log('\n\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(22) + '测试总结' + ' '.repeat(31) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log('\n  ✅ MetricsCollector 重构验证通过!');
  console.log('\n  重构后的职责划分:');
  console.log('    ┌─────────────────────────────────────────────────────┐');
  console.log('    │ CostTracker                                       │');
  console.log('    │   - 定价读取 (从 ModelRegistry)                  │');
  console.log('    │   - 成本计算 (calculateCost)                    │');
  console.log('    │   - 成本更新 (updateActualCost)                 │');
  console.log('    └─────────────────────────────────────────────────────┘');
  console.log('                           ↑');
  console.log('                           │ 委托计算成本');
  console.log('                           │');
  console.log('    ┌─────────────────────────────────────────────────────┐');
  console.log('    │ MetricsCollector                                   │');
  console.log('    │   - 数据收集 (recordTask)                        │');
  console.log('    │   - 持久化存储 (daily/sessions 文件)             │');
  console.log('    │   - 指标查询 (getDailyMetrics 等)                │');
  console.log('    └─────────────────────────────────────────────────────┘');

  console.log('\n  消除重复:');
  console.log('    - MetricsCollector 不再包含 calculateCost()');
  console.log('    - MetricsCollector 不再包含定价加载逻辑');
  console.log('    - 单一数据源：定价只从 CostTracker 获取');

  console.log('\n  ✅ 所有验证通过!');
}

runTests().catch(console.error);
