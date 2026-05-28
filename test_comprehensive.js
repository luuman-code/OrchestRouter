#!/usr/bin/env node

/**
 * 更全面的指标系统测试 - 包含不同场景的测试
 */

const axios = require('axios');

async function testScenarios() {
  console.log('开始更全面的指标系统测试...\n');

  try {
    // 测试1: 尝试使用一个默认可用的模型
    console.log('测试1: 使用默认模型执行子任务...');
    const response = await axios.post('http://localhost:3458/v1/execute-subtasks', {
      subtasks: [
        {
          id: "test_default_model_" + Date.now(),
          description: "这是一个使用默认模型的测试子任务"
          // 不指定模型，让系统使用默认模型
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('响应状态:', response.status);
    console.log('成功执行数:', response.data.successful_executions);
    console.log('失败执行数:', response.data.failed_executions);

    // 等待片刻确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 查询指标
    console.log('\n获取最新指标...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    console.log('指标响应状态:', metricsResponse.status);
    console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);

    // 显示任务详情
    console.log('任务详情:');
    metricsResponse.data.data.today.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. Task ID: ${task.taskId}, Model: ${task.modelId}, Tokens: ${task.tokenUsage.total}, Cost: ${task.cost}`);
    });

    console.log('\n✅ 测试完成！');
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
testScenarios();