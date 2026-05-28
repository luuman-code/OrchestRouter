#!/usr/bin/env node

/**
 * 模拟测试 - 验证指标系统能否记录成功执行的任务
 */

const axios = require('axios');

async function testWithMockModel() {
  console.log('开始使用模拟模型测试指标系统...\n');

  try {
    // 尝试使用模拟模型（如果有的话）
    console.log('发送执行子任务请求（使用默认模型）...');
    const response = await axios.post('http://localhost:3458/v1/execute-subtasks', {
      subtasks: [
        {
          id: "mock_subtask_" + Date.now(),
          description: "这是一个测试子任务，使用默认模型",
          // 不指定模型，让系统使用默认模型
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('执行子任务请求响应成功:', response.status);
    console.log('成功执行数:', response.data.successful_executions);
    console.log('失败执行数:', response.data.failed_executions);

    // 等待片刻确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 查询指标
    console.log('\n获取最新指标...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    console.log('指标响应状态:', metricsResponse.status);
    console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);
    console.log('今日总成本:', metricsResponse.data.data.today.totalCost);
    console.log('今日总token数:', metricsResponse.data.data.today.totalTokens.total);

    // 显示任务详情
    console.log('任务详情:');
    metricsResponse.data.data.today.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. Task ID: ${task.taskId}, Model: ${task.modelId}, Tokens: ${task.tokenUsage.total}, Cost: ${task.cost}`);
    });

    // 特别检查今天的任务
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n获取今天(${today})的具体指标...`);
    const dailyMetricsResponse = await axios.get(`http://localhost:3458/api/metrics/history?startDate=${today}&endDate=${today}`);
    console.log('具体响应:', dailyMetricsResponse.data);

    console.log('\n✅ 模拟测试完成！');
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应内容:', error.response.data);
    }
  }
}

// 运行测试
testWithMockModel();