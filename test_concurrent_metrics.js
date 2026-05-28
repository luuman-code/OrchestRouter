#!/usr/bin/env node

/**
 * 测试并发指标记录 - 发送多个并发请求验证并发写入修复
 */

const axios = require('axios');

async function testConcurrentMetrics() {
  console.log('开始测试并发指标记录...\n');

  try {
    // 准备多个并发请求
    const requests = [
      {
        subtasks: [
          {
            id: "concurrent_test_1_" + Date.now(),
            description: "第一个并发测试子任务",
            selected_model: "qwen3-coder-plus"
          }
        ]
      },
      {
        subtasks: [
          {
            id: "concurrent_test_2_" + Date.now(),
            description: "第二个并发测试子任务",
            selected_model: "qwen3-coder-plus"
          }
        ]
      },
      {
        subtasks: [
          {
            id: "concurrent_test_3_" + Date.now(),
            description: "第三个并发测试子任务",
            selected_model: "qwen3-coder-plus"
          }
        ]
      }
    ];

    console.log('发送3个并发执行子任务请求...');

    // 并发发送请求
    const promises = requests.map((req, index) =>
      axios.post('http://localhost:3458/v1/execute-subtasks', req, {
        headers: { 'Content-Type': 'application/json' }
      }).then(response => {
        console.log(`请求 ${index + 1} 响应成功: ${response.status}`);
        return response;
      }).catch(error => {
        console.error(`请求 ${index + 1} 失败:`, error.message);
        throw error;
      })
    );

    const responses = await Promise.all(promises);
    console.log('\n所有并发请求成功完成');

    // 等待片刻确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 查询指标
    console.log('\n获取最新指标...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    console.log('指标响应状态:', metricsResponse.status);
    console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);
    console.log('今日总成本:', metricsResponse.data.data.today.totalCost);
    console.log('今日总 token 数:', metricsResponse.data.data.today.totalTokens.total);

    // 显示最近的几个任务详情
    console.log('\n最近的任务详情:');
    const recentTasks = metricsResponse.data.data.today.tasks.slice(-5); // 最近5个任务
    recentTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. Task ID: ${task.taskId}, Model: ${task.modelId}, Tokens: ${task.tokenUsage.total}, Cost: ${task.cost}, Time: ${task.executionTime}ms`);
    });

    console.log('\n✅ 并发指标记录测试完成！');
    console.log('验证：检查 metrics/daily/2026-04-07.json 文件是否仍为有效JSON格式');

    // 验证文件完整性
    const fs = require('fs');
    const path = require('path');
    const metricsPath = path.join(__dirname, 'metrics', 'daily', '2026-04-07.json');
    const fileContent = fs.readFileSync(metricsPath, 'utf8');

    // 尝试解析JSON以验证格式
    const parsed = JSON.parse(fileContent);
    console.log('✅ JSON 文件格式验证成功！任务总数:', parsed.tasks.length);

  } catch (error) {
    console.error('❌ 并发测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应内容:', error.response.data);
    }
  }
}

// 运行测试
testConcurrentMetrics();