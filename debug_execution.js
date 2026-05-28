#!/usr/bin/env node

/**
 * 调试执行结果 - 了解执行器返回的数据结构
 */

const OrchestratorExecutorIntegration = require('./src/orchestrator/OrchestratorExecutorIntegration');
const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function debugExecution() {
  console.log('调试执行结果结构...\n');

  // 创建带调试日志的指标收集器
  const metricsCollector = new MetricsCollector();

  // 创建集成实例
  const executorIntegration = new OrchestratorExecutorIntegration({
    metricsCollector: metricsCollector
  });

  // 准备测试子任务
  const subtasksWithModels = [
    {
      id: "debug_task_" + Date.now(),
      description: "这是一个调试任务",
      selected_model: "gpt-4"
    }
  ];

  try {
    console.log('开始执行子任务...');

    // 我们不直接调用executeSubtasks，而是查看其内部逻辑
    // 先初始化执行器
    await executorIntegration.initializeExecutor();

    console.log('执行器初始化完成');

    // 准备执行请求
    const executionRequests = subtasksWithModels.map((subtask, index) => ({
      task: subtask,
      modelId: executorIntegration._resolveModelId(subtask),
      prompt: subtask.description || subtask.task || subtask.content,
      traceId: `exec_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      taskId: subtask.id || `subtask_${index}`,
      estimatedCost: subtask.estimated_cost,
      alternatives: subtask.selection_metadata?.alternatives || [],
      useFallback: subtask.useFallback !== undefined ? subtask.useFallback : false
    }));

    console.log('执行请求准备完成:', executionRequests);

    // 批量执行任务
    console.log('开始批量执行...');
    const startTime = Date.now();
    const results = await executorIntegration.executor.executeBatch(executionRequests);
    const executionDuration = Date.now() - startTime;

    console.log('执行完成，结果:', JSON.stringify(results, null, 2));
    console.log('执行时长:', executionDuration, 'ms');

    // 现在手动检查结果结构以理解为何没有记录指标
    console.log('\n--- 分析结果以理解指标记录逻辑 ---');
    results.forEach((result, index) => {
      console.log(`\n结果 ${index + 1}:`);
      console.log('  success:', result.success);
      console.log('  usage:', result.usage);
      console.log('  cost:', result.cost);
      console.log('  model_used:', result.model_used);

      // 检查是否符合我们的指标记录条件
      const meetsCondition = result.success; // 我们的修改去掉了 usage 检查
      console.log('  符合指标记录条件 (success only):', meetsCondition);
    });

    // 检查当前指标
    const today = new Date().toISOString().split('T')[0];
    const dailyMetrics = await metricsCollector.getDailyMetrics(today);
    console.log('\n当前指标:', JSON.stringify(dailyMetrics, null, 2));

  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error(error.stack);
  }
}

debugExecution();