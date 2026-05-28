#!/usr/bin/env node

/**
 * 测试服务器内部组件状态
 */

const axios = require('axios');

async function testServerInternals() {
  console.log('测试服务器内部组件状态...\n');

  try {
    // 获取服务器状态
    console.log('获取服务器状态...');
    const statusResponse = await axios.get('http://localhost:3458/v1/status');

    console.log('服务器状态:', JSON.stringify(statusResponse.data, null, 2));

    // 获取执行器集成状态
    console.log('\n获取执行器集成状态...');
    const executorStatusResponse = await axios.get('http://localhost:3458/v1/executor-integration-status');

    console.log('执行器集成状态:', JSON.stringify(executorStatusResponse.data, null, 2));

    // 获取模型选择器状态
    console.log('\n获取模型选择器状态...');
    const modelSelectorStatusResponse = await axios.get('http://localhost:3458/v1/model-selector-status');

    console.log('模型选择器状态:', JSON.stringify(modelSelectorStatusResponse.data, null, 2));

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

testServerInternals();