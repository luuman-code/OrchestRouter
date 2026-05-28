#!/usr/bin/env node

/**
 * 调试分解器输出为空的问题
 */

const axios = require('axios');

const ORCHESTRATOR_URL = 'http://127.0.0.1:3458';

// 测试用例 1: 使用 description 字段（当前格式，会产生空结果）
const TEST_TASK_1 = {
  task: {
    title: "Create configuration file generator project",
    description: `# Task: Create a configuration file generator project

## Deliverables
- [ ] Create .env template file with common environment variables - [type: config]
- [ ] Implement config.js module for loading and validating configurations - [type: code]
- [ ] Write validate-config.sh script for validating config files - [type: script]
- [ ] Document usage in README.md with examples - [type: documentation]`
  }
};

// 测试用例 2: 使用 deliverables 数组字段（应该能正常工作）
const TEST_TASK_2 = {
  task: {
    title: "Create configuration file generator project",
    deliverables: [
      {
        description: "Create .env template file with common environment variables",
        type: "config"
      },
      {
        description: "Implement config.js module for loading and validating configurations",
        type: "code"
      },
      {
        description: "Write validate-config.sh script for validating config files",
        type: "script"
      },
      {
        description: "Document usage in README.md with examples",
        type: "documentation"
      }
    ]
  }
};

// 测试用例 3: 使用 deliverables 字符串（应该能正常工作）
const TEST_TASK_3 = {
  task: {
    title: "Create configuration file generator project",
    deliverables: `- [ ] Create .env template file with common environment variables - [type: config]
- [ ] Implement config.js module for loading and validating configurations - [type: code]
- [ ] Write validate-config.sh script for validating config files - [type: script]
- [ ] Document usage in README.md with examples - [type: documentation]`
  }
};

async function runTest(testName, testData) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试：${testName}`);
  console.log('='.repeat(60));

  try {
    const response = await axios.post(`${ORCHESTRATOR_URL}/v1/decompose`, testData, {
      timeout: 30000
    });

    const result = response.data;
    console.log(`状态码：${response.status}`);
    console.log(`子任务数量：${result.subtasks?.length || 0}`);

    if (result.subtasks && result.subtasks.length > 0) {
      console.log('\n子任务详情:');
      result.subtasks.forEach((task, idx) => {
        console.log(`  ${idx + 1}. [${task.type}] ${task.description?.substring(0, 60)}...`);
        console.log(`     文件路径：${task.filePath || '未指定'}`);
      });
    } else {
      console.log('⚠️  警告：子任务数组为空！');
      console.log('metadata:', JSON.stringify(result.metadata, null, 2));
    }

    return { success: true, result };
  } catch (error) {
    console.error(`测试失败：${error.message}`);
    if (error.response) {
      console.error(`响应状态：${error.response.status}`);
      console.error(`响应数据：${JSON.stringify(error.response.data)}`);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🔍 开始调试分解器输出为空的问题...\n');

  // 先检查服务器是否运行
  try {
    await axios.get(`${ORCHESTRATOR_URL}/health`);
    console.log('✅ 服务器正在运行');
  } catch (error) {
    console.error('❌ 服务器未运行，请先启动服务器：node start-orchestrator.js');
    return;
  }

  // 运行三个测试用例
  const result1 = await runTest('测试 1: 使用 description 字段 (当前测试脚本格式)', TEST_TASK_1);
  const result2 = await runTest('测试 2: 使用 deliverables 数组', TEST_TASK_2);
  const result3 = await runTest('测试 3: 使用 deliverables 字符串', TEST_TASK_3);

  // 总结
  console.log(`\n${'='.repeat(60)}`);
  console.log('测试总结');
  console.log('='.repeat(60));
  console.log(`测试 1 (description 字段): ${result1.result.subtasks?.length || 0} 个子任务`);
  console.log(`测试 2 (deliverables 数组): ${result2.result.subtasks?.length || 0} 个子任务`);
  console.log(`测试 3 (deliverables 字符串): ${result3.result.subtasks?.length || 0} 个子任务`);

  console.log('\n📊 分析结果:');
  if (result1.result.subtasks?.length === 0 && (result2.result.subtasks?.length > 0 || result3.result.subtasks?.length > 0)) {
    console.log('✅ 问题已确认：TaskParser.parseFromObject 不会从 description 字段解析 deliverables');
    console.log('💡 解决方案：修改测试脚本，使用 deliverables 字段而不是 description 字段');
  } else if (result1.result.subtasks?.length > 0) {
    console.log('✅ description 字段也能正常工作，问题可能在其他地方');
  } else {
    console.log('⚠️  所有测试都返回空结果，可能是分解器本身的问题');
  }
}

main().catch(console.error);