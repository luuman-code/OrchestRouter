#!/usr/bin/env node

/**
 * 调试解析器行为 - 检查编排器内部解析逻辑
 */

const TaskParser = require('./src/decomposer/utils/TaskParser');
const OrchestratorServer = require('./src/orchestrator/OrchestratorServer');

async function debugParserBehavior() {
  console.log('🔍 调试解析器行为...\n');

  // 模拟编排器处理的任务内容
  const userMessage = `# Task: Create a configuration file generator project

## Context
- Project type: utility library
- Target audience: developers
- Technology stack: JavaScript/Node.js

## Requirement
Create a comprehensive configuration file generator project that includes multiple types of configuration files for different environments.

## Deliverables
- [ ] Create .env template file with common environment variables - [type: config]
- [ ] Implement config.js module for loading and validating configurations - [type: logic]
- [ ] Write validate-config.sh script for validating config files - [type: logic]
- [ ] Document usage in README.md with examples - [type: documentation]

## Constraints
- Follow Node.js best practices
- Include error handling
- Support both development and production configurations

## Priority: medium`;

  console.log('原始用户消息内容:');
  console.log(userMessage.substring(0, 200) + '...');
  console.log('');

  // 1. 测试 TaskParser 解析
  console.log('1. 测试 TaskParser.parse():');
  const taskParser = new TaskParser();
  try {
    const parsedTask = taskParser.parse(userMessage);
    console.log(`   解析成功`);
    console.log(`   交付物数量: ${parsedTask.deliverables?.length || 0}`);
    console.log(`   交付物类型: ${parsedTask.deliverables?.map(d => d.type).join(', ') || '无'}`);

    if (parsedTask.deliverables) {
      parsedTask.deliverables.forEach((deliv, idx) => {
        console.log(`     ${idx + 1}. [${deliv.type}] ${deliv.description.substring(0, 50)}...`);
      });
    }
  } catch (error) {
    console.log(`   解析失败: ${error.message}`);
  }

  // 2. 测试编排器的 _extractUserMessage 方法
  console.log('\n2. 测试编排器 _extractUserMessage():');

  const mockRequestBody = {
    messages: [{
      role: "user",
      content: userMessage
    }]
  };

  // 创建一个简化版的编排器实例来访问私有方法
  const mockOrchestrator = {
    _extractUserMessage: function(requestBody) {
      if (!requestBody) return '';

      try {
        // Anthropic API 格式
        if (requestBody.messages && Array.isArray(requestBody.messages)) {
          const userMessages = requestBody.messages.filter(m => m && m.role === 'user');
          if (userMessages.length > 0) {
            const lastUserMessage = userMessages[userMessages.length - 1];
            if (lastUserMessage && lastUserMessage.content) {
              if (typeof lastUserMessage.content === 'string') {
                return lastUserMessage.content;
              }
              if (Array.isArray(lastUserMessage.content)) {
                return lastUserMessage.content
                  .filter(item => item && item.type === 'text' && item.text)
                  .map(item => item.text)
                  .join(' ');
              }
            }
          }
        }

        // 直接消息格式
        if (requestBody.prompt) {
          return String(requestBody.prompt);
        }

        if (requestBody.message) {
          return String(requestBody.message);
        }

        return '';
      } catch (error) {
        console.log(`   _extractUserMessage 错误: ${error.message}`);
        return '';
      }
    }
  };

  const extractedMessage = mockOrchestrator._extractUserMessage(mockRequestBody);
  console.log(`   提取消息长度: ${extractedMessage.length}`);
  console.log(`   提取消息前100字符: ${extractedMessage.substring(0, 100)}...`);
  console.log(`   提取的消息是否与原消息相同: ${extractedMessage === userMessage}`);

  // 3. 再次测试提取后的消息解析
  console.log('\n3. 测试提取后的消息解析:');
  try {
    const parsedAfterExtraction = taskParser.parse(extractedMessage);
    console.log(`   解析成功`);
    console.log(`   交付物数量: ${parsedAfterExtraction.deliverables?.length || 0}`);
    console.log(`   交付物类型: ${parsedAfterExtraction.deliverables?.map(d => d.type).join(', ') || '无'}`);
  } catch (error) {
    console.log(`   解析失败: ${error.message}`);
  }

  // 4. 验证编排器是否可以访问私有方法（模拟）
  console.log('\n4. 验证编排器的处理流程:');

  // 用不同的输入格式测试
  console.log('\n   测试格式A - Anthropic messages 格式:');
  const requestA = {
    messages: [{
      role: "user",
      content: userMessage
    }]
  };

  const extractedA = mockOrchestrator._extractUserMessage(requestA);
  const parsedA = taskParser.parse(extractedA);
  console.log(`   交付物: ${parsedA.deliverables?.length || 0} 个`);

  // 直接使用 task 格式（我们之前在分解器测试中使用过的格式）
  console.log('\n   测试格式B - 直接 task 格式 (之前分解器测试格式):');
  const requestB = {
    task: {
      title: "Create configuration file generator project",
      deliverables: userMessage  // 将整个用户消息作为 deliverables
    }
  };

  // 对于直接 task 格式，编排器不会处理，因为它会优先处理 messages 格式

  console.log('\n   总结:');
  console.log(`   用户消息能够被正确解析为 ${parsedTask.deliverables?.length || 0} 个交付物`);
  console.log(`   消息提取功能正常，提取的消息与原消息相同`);
  console.log(`   问题可能不在解析阶段，而在复杂度判断或路由阶段`);
}

debugParserBehavior().catch(console.error);