#!/usr/bin/env node

/**
 * 测试指标系统 - 使用配置文件中定义的模型
 */

const axios = require('axios');

async function testExecuteSubtasksWithMetrics() {
  console.log('开始测试指标系统（使用配置文件中的模型）...\n');

  try {
    // 测试执行子任务端点 - 使用配置文件中存在的模型
    console.log('发送执行子任务请求（使用 qwen3-coder-plus 模型）...');
    const response = await axios.post('http://localhost:3458/v1/execute-subtasks', {
      subtasks: [
        {
          id: "test_subtask_" + Date.now(),
          description: "这是一个测试子任务，使用阿里云百炼平台的 Qwen 模型",
          selected_model: "qwen3-coder-plus"  // 使用配置文件中定义的模型
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json'
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

    // 显示任务详情
    console.log('任务详情:');
    metricsResponse.data.data.today.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. Task ID: ${task.taskId}, Model: ${task.modelId}, Tokens: ${task.tokenUsage.total}, Cost: ${task.cost}`);
    });

    console.log('\n✅ 子任务执行和指标记录测试完成！');
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应内容:', error.response.data);
    }
  }
}

// 运行测试
testExecuteSubtasksWithMetrics();