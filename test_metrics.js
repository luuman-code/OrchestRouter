#!/usr/bin/env node

/**
 * 测试指标系统 - 执行一个真实的编排任务
 */

const axios = require('axios');

async function testOrchestrationWithMetrics() {
  console.log('开始测试指标系统...\n');

  try {
    // 测试编排端点
    console.log('发送编排请求...');
    const response = await axios.post('http://localhost:3458/v1/orchestrate', {
      messages: [
        {
          role: "user",
          content: "请帮我创建一个简单的待办事项应用，需要有添加任务、标记完成和删除任务的功能。"
        }
      ],
      model: "gpt-4"
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('编排请求响应成功:', response.status);

    // 等待片刻确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 查询指标
    console.log('\n获取当前指标...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    console.log('指标响应:', metricsResponse.status);
    console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);
    console.log('今日总成本:', metricsResponse.data.data.today.totalCost);
    console.log('今日总token数:', metricsResponse.data.data.today.totalTokens.total);

    // 查询会话指标
    console.log('\n获取会话指标...');
    const sessionsResponse = await axios.get('http://localhost:3458/api/metrics');
    console.log('当前会话数:', metricsResponse.data.data.currentSessions.length);

    console.log('\n✅ 指标系统测试完成！');
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应内容:', error.response.data);
    }
  }
}

// 运行测试
testOrchestrationWithMetrics();