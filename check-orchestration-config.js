#!/usr/bin/env node

/**
 * 检查编排器配置和状态
 */

const axios = require('axios');

const ORCHESTRATOR_URL = 'http://127.0.0.1:3458';

async function checkOrchestrationConfig() {
  console.log('🔍 检查编排器配置和状态...\n');

  try {
    // 1. 检查健康状态
    console.log('1. 检查服务器健康状态...');
    const healthResponse = await axios.get(`${ORCHESTRATOR_URL}/health`);
    console.log(`   ✅ 健康状态：${healthResponse.data.status}`);

    // 2. 检查编排器状态
    console.log('\n2. 检查编排器状态...');
    try {
      const statusResponse = await axios.get(`${ORCHESTRATOR_URL}/v1/status`);
      console.log(`   编排器状态：${JSON.stringify(statusResponse.data, null, 2)}`);
    } catch (error) {
      console.log(`   ❌ 编排器状态端点不可用: ${error.message}`);
    }

    // 3. 检查模型选择器状态
    console.log('\n3. 检查模型选择器状态...');
    try {
      const modelStatusResponse = await axios.get(`${ORCHESTRATOR_URL}/v1/model-selector-status`);
      console.log(`   模型选择器状态：${JSON.stringify(modelStatusResponse.data, null, 2)}`);
    } catch (error) {
      console.log(`   ❌ 模型选择器状态端点不可用: ${error.message}`);
    }

    // 4. 检查整合器状态
    console.log('\n4. 检查整合器状态...');
    try {
      const integratorStatusResponse = await axios.get(`${ORCHESTRATOR_URL}/v1/integrator-status`);
      console.log(`   整合器状态：${JSON.stringify(integratorStatusResponse.data, null, 2)}`);
    } catch (error) {
      console.log(`   ❌ 整合器状态端点不可用: ${error.message}`);
    }

    // 5. 尝试调用分解器端点直接测试
    console.log('\n5. 直接测试分解器端点...');
    const testTask = {
      title: "Create configuration file generator project",
      deliverables: "# Task: Create a configuration file generator project\n\n## Deliverables\n- [ ] Create .env template file with common environment variables - [type: config]\n- [ ] Implement config.js module for loading and validating configurations - [type: logic]\n- [ ] Write validate-config.sh script for validating config files - [type: logic]\n- [ ] Document usage in README.md with examples - [type: documentation]\n\n## Priority: medium"
    };

    try {
      const decompResponse = await axios.post(`${ORCHESTRATOR_URL}/v1/decompose`, {
        task: testTask
      });

      console.log(`   ✅ 分解器测试成功，状态码：${decompResponse.status}`);
      console.log(`   ✅ 子任务数量：${decompResponse.data.subtasks?.length || 0}`);
      console.log(`   ✅ 类型注解修复验证：${decompResponse.data.subtasks?.every(st => st.type !== 'unknown') ? '通过' : '失败'}`);

      // 显示一些子任务类型
      if (decompResponse.data.subtasks) {
        console.log('   子任务类型：', decompResponse.data.subtasks.map(st => `[${st.type}]`).join(', '));
      }
    } catch (error) {
      console.log(`   ❌ 分解器测试失败: ${error.message}`);
    }

    // 6. 尝试强制编排模式 - 通过直接指定复杂度分析器的结果
    console.log('\n6. 尝试发送带复杂任务标识的请求...');
    const complexTask = {
      messages: [{
        role: "user",
        content: "# Complex Task: Build a full-stack application\n\n## Requirements\n- [ ] Create Express.js backend with CRUD operations - [type: logic]\n- [ ] Build React.js frontend with user interface - [type: ui]\n- [ ] Design MongoDB schema - [type: database]\n- [ ] Implement JWT authentication - [type: security]\n- [ ] Write unit tests - [type: test]\n- [ ] Document API with Swagger - [type: documentation]\n- [ ] Create Docker configuration - [type: devops]\n\nThis is a complex task that requires multiple components and technologies."
      }]
    };

    try {
      const complexResponse = await axios.post(`${ORCHESTRATOR_URL}/v1/orchestrate`, complexTask, {
        timeout: 120000
      });

      console.log(`   ✅ 复杂任务请求成功，状态码：${complexResponse.status}`);

      // 检查响应格式
      const isOrchestrated = complexResponse.data.orchestrated !== undefined;
      const hasSubtasks = Array.isArray(complexResponse.data.subtasks);
      const hasClaudeResponse = !!complexResponse.data.model && !!complexResponse.data.content;

      console.log(`   响应类型：${isOrchestrated ? '编排结果' : hasClaudeResponse ? '直接AI响应' : '其他'}`);
      console.log(`   包含子任务：${hasSubtasks ? '是' : '否'}`);
      console.log(`   包含AI内容：${hasClaudeResponse ? '是' : '否'}`);

      if (!isOrchestrated && hasClaudeResponse) {
        console.log('   ⚠️  请求被转发到CCR Router，编排流程未执行');
      } else if (isOrchestrated) {
        console.log('   ✅ 编排流程已执行');
      }
    } catch (error) {
      console.log(`   ❌ 复杂任务请求失败: ${error.message}`);
    }

    console.log('\n🎯 检查完成');

  } catch (error) {
    console.error(`❌ 检查过程中发生错误: ${error.message}`);
  }
}

checkOrchestrationConfig().catch(console.error);