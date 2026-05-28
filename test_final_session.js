#!/usr/bin/env node

/**
 * 最终测试：验证服务器修复是否有效
 */

const axios = require('axios');

async function testFinalSession() {
  console.log('最终测试：验证服务器端的会话ID记录...\n');

  try {
    // 创建一个唯一的会话ID
    const sessionId = `final-test-session-${Date.now()}`;

    console.log(`使用会话ID: ${sessionId}`);

    // 发送带会话ID的请求
    console.log('发送执行子任务请求（带会话ID）...');
    const response = await axios.post('http://localhost:3458/v1/execute-subtasks', {
      subtasks: [
        {
          id: "final_test_subtask_" + Date.now(),
          description: "最终测试：验证会话ID是否正确记录",
          selected_model: "qwen3-coder-plus"
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      }
    });

    console.log('请求成功:', response.status);

    // 等待确保指标已记录
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 获取最新的指标
    console.log('\n获取最新的指标数据...');
    const metricsResponse = await axios.get('http://localhost:3458/api/metrics');

    // 检查最新的任务是否有sessionId
    const latestTask = metricsResponse.data.data.today.tasks[metricsResponse.data.data.today.tasks.length - 1];

    console.log('\n最新任务详情:');
    console.log(JSON.stringify(latestTask, null, 2));

    if (latestTask.sessionId === sessionId) {
      console.log(`\n✅ 成功！任务正确记录了会话ID: ${latestTask.sessionId}`);
    } else {
      console.log(`\n⚠️  任务的会话ID: ${latestTask.sessionId || 'undefined'}, 预期: ${sessionId}`);

      // 检查是否有其他任务包含了正确的会话ID
      const tasksWithOurSession = metricsResponse.data.data.today.tasks.filter(task =>
        task.sessionId === sessionId
      );

      if (tasksWithOurSession.length > 0) {
        console.log(`\n🔍 找到 ${tasksWithOurSession.length} 个带有正确会话ID的任务:`);
        tasksWithOurSession.forEach((task, idx) => {
          console.log(`  ${idx + 1}. Task ID: ${task.taskId}`);
        });
      } else {
        console.log('\n🔍 没有找到任何包含此会话ID的任务');
      }
    }

    console.log('\n✅ 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

testFinalSession();