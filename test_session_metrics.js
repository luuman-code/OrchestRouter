#!/usr/bin/env node

/**
 * 测试带会话ID的指标记录
 */

const axios = require('axios');

async function testSessionBasedMetrics() {
  console.log('开始测试带会话ID的指标记录...\n');

  try {
    // 创建一个唯一的会话ID
    const sessionId = `test-session-${Date.now()}`;

    console.log(`使用会话ID: ${sessionId}`);

    // 测试执行子任务端点 - 使用会话ID
    console.log('发送执行子任务请求（带会话ID）...');
    const response = await axios.post('http://localhost:3458/v1/execute-subtasks', {
      subtasks: [
        {
          id: "session_test_subtask_" + Date.now(),
          description: "这是一个带会话ID的测试子任务",
          selected_model: "qwen3-coder-plus"
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId  // 添加会话ID头
      }
    });

    console.log('执行子任务请求响应成功:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));

    // 等待片刻确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 查询指标
    console.log('\n获取最新指标...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    console.log('指标响应状态:', metricsResponse.status);
    console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);
    console.log('今日总成本:', metricsResponse.data.data.today.totalCost);
    console.log('今日总 token 数:', metricsResponse.data.data.today.totalTokens.total);

    // 显示最近的任务详情
    console.log('\n最近的任务详情:');
    const recentTasks = metricsResponse.data.data.today.tasks.slice(-5); // 最近5个任务
    recentTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. Task ID: ${task.taskId}, Model: ${task.modelId}, Tokens: ${task.tokenUsage.total}, Cost: ${task.cost}, Execution Time: ${task.executionTime}ms`);
    });

    // 查询特定会话的指标
    console.log('\n查询特定会话指标...');
    const sessionMetricsResponse = await axios.get(`http://localhost:3458/api/metrics/sessions/${sessionId}`);

    if (sessionMetricsResponse.data.success) {
      console.log('会话指标查询成功!');
      console.log('会话ID:', sessionMetricsResponse.data.data.sessionId);
      console.log('任务数量:', sessionMetricsResponse.data.data.tasks.length);
      console.log('总成本:', sessionMetricsResponse.data.data.totalCost);
      console.log('总时间:', sessionMetricsResponse.data.data.totalTime);
    } else {
      console.log('会话指标查询结果:', sessionMetricsResponse.data);
    }

    console.log('\n✅ 带会话ID的指标记录测试完成！');
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      if (error.response.data) {
        console.error('响应内容:', error.response.data);
      }
    }
  }
}

// 运行测试
testSessionBasedMetrics();