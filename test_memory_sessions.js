#!/usr/bin/env node

/**
 * 测试内存中的会话指标
 */

const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function testMemorySessions() {
  console.log('测试内存中的会话指标...\n');

  // 获取默认的 MetricsCollector 实例
  // 注意：这里我们无法直接访问服务器实例中的 MetricsCollector
  // 因为它是服务器内部的一个实例

  console.log('注意：要检查内存中的会话，我们需要使用服务器的指标API');
  console.log('会话应该已经在处理请求时被添加到内存中');

  // 我们可以通过API间接测试会话功能
  const axios = require('axios');

  try {
    // 获取所有会话
    console.log('获取所有活动会话...');
    const allSessionsResponse = await axios.get('http://localhost:3458/api/sessions');

    console.log('会话列表响应:', allSessionsResponse.status);
    console.log('响应数据:', JSON.stringify(allSessionsResponse.data, null, 2));
  } catch (error) {
    console.log('获取会话列表失败（可能是端点不存在）:', error.message);

    // 尝试获取会话信息的另一种方式
    try {
      console.log('\n尝试获取指标API中的会话信息...');
      const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

      console.log('指标API响应:', metricsResponse.status);

      // 输出会话相关信息
      if (metricsResponse.data && metricsResponse.data.data) {
        console.log('今日任务数:', metricsResponse.data.data.today.tasks.length);

        // 查找是否有包含sessionId的任务
        const tasksWithSession = metricsResponse.data.data.today.tasks.filter(task =>
          task.sessionId && task.sessionId !== 'unknown-session'
        );

        console.log(`找到 ${tasksWithSession.length} 个带有明确会话ID的任务`);
        if (tasksWithSession.length > 0) {
          console.log('带有会话ID的任务示例:');
          tasksWithSession.slice(0, 3).forEach((task, index) => {
            console.log(`  ${index + 1}. Task: ${task.taskId}, Session: ${task.sessionId}`);
          });
        }
      }
    } catch (innerError) {
      console.log('也无法从指标API获取会话信息:', innerError.message);
    }
  }
}

testMemorySessions();