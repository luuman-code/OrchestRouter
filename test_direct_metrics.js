#!/usr/bin/env node

/**
 * 直接测试指标收集器
 */

const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function directTest() {
  console.log('直接测试 MetricsCollector 中的会话ID处理...\n');

  const collector = new MetricsCollector();

  // 等待初始化
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 模拟记录一个带会话ID的任务
  console.log('记录一个带会话ID的模拟任务...');
  const sessionId = 'test-session-direct-' + Date.now();
  const taskId = 'direct-test-task-' + Date.now();
  const modelId = 'qwen3-coder-plus';

  const tokenUsage = {
    input: 20,
    output: 40,
    total: 60,
    provider: 'openai',
    details: {
      promptTokens: 20,
      completionTokens: 40
    }
  };

  const executionTime = 1500;
  const cost = 0.0005;

  await collector.recordTask(
    sessionId,  // 会话ID参数
    taskId,
    modelId,
    tokenUsage,
    executionTime,
    {
      cost: cost,
      sessionId: sessionId  // 试图在附加信息中包含会话ID
    }
  );

  console.log('✓ 任务记录成功');

  // 立即读取今天的指标
  console.log('\n读取今天的指标...');
  const today = new Date().toISOString().split('T')[0];
  const dailyMetrics = await collector.getDailyMetrics(today);

  console.log('今日指标:');
  console.log(JSON.stringify(dailyMetrics, null, 2));

  // 检查最新任务是否包含sessionId
  const latestTask = dailyMetrics.tasks[dailyMetrics.tasks.length - 1];
  console.log('\n最新任务详情:');
  console.log(JSON.stringify(latestTask, null, 2));

  if (latestTask.sessionId) {
    console.log('\n✅ 任务中成功包含了sessionId:', latestTask.sessionId);
  } else {
    console.log('\n❌ 任务中未找到sessionId字段');
  }

  // 检查内存中的会话指标
  console.log('\n内存中的会话指标:');
  const sessionMetrics = collector.getSessionMetrics(sessionId);
  console.log(JSON.stringify(sessionMetrics, null, 2));

  // 关闭收集器
  // 注意：由于 MetricsCollector 没有 close 方法，跳过此步骤
}

directTest().catch(console.error);