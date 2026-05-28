#!/usr/bin/env node

/**
 * 调试指标记录 - 直接测试 MetricsCollector
 */

const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function debugMetricsRecording() {
  console.log('直接测试 MetricsCollector...\n');

  const collector = new MetricsCollector();

  // 等待初始化
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 模拟记录一个任务
  console.log('记录一个模拟任务...');
  const sessionId = 'test-session-' + Date.now();
  const taskId = 'test-task-' + Date.now();
  const modelId = 'qwen3-coder-plus';

  const tokenUsage = {
    input: 25,
    output: 54,
    total: 79,
    provider: 'openai',
    details: {
      promptTokens: 25,
      completionTokens: 54
    }
  };

  const executionTime = 1703;
  const cost = 0.0008975;

  await collector.recordTask(
    sessionId,
    taskId,
    modelId,
    tokenUsage,
    executionTime,
    { cost: cost }
  );

  console.log('✓ 任务记录成功');

  // 立即读取今天的指标
  console.log('\n读取今天的指标...');
  const today = new Date().toISOString().split('T')[0];
  const dailyMetrics = await collector.getDailyMetrics(today);

  console.log('今日指标:');
  console.log(JSON.stringify(dailyMetrics, null, 2));

  // 检查文件内容
  const fs = require('fs');
  const path = require('path');
  const metricsPath = path.join(__dirname, 'metrics', 'daily', `${today}.json`);

  if (fs.existsSync(metricsPath)) {
    const fileContent = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    console.log('\n文件内容:');
    console.log(JSON.stringify(fileContent, null, 2));
  } else {
    console.log('\n指标文件不存在:', metricsPath);
  }

  // 关闭收集器
  await collector.close();
}

debugMetricsRecording().catch(console.error);