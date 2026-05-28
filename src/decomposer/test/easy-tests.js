/**
 * 简单测试集 - 验证分解器的基础功能
 */

const ElasticDecomposer = require('../index');

// 测试用例1: 简单的单一任务
const simpleTask = {
  title: "创建登录页面",
  context: {
    techStack: ["React", "CSS"]
  },
  requirement: "实现一个基本的登录页面",
  deliverables: [
    { description: "创建 Login 组件", type: "ui", filePath: "src/components/Login.jsx" },
    { description: "添加样式文件", type: "style", filePath: "src/components/Login.css" }
  ],
  priority: "high"
};

// 测试用例2: 结构化任务格式
const structuredTask = `
# Task: Add User Profile Page

## Context
- Project Type: frontend
- Tech Stack: React, TailwindCSS
- Authentication: JWT-based

## Requirement
Create a user profile page with view and edit capabilities

## Deliverables
- [ ] Create UserProfile component - [type: ui]: src/pages/UserProfile.jsx
- [ ] Implement edit functionality - [type: logic]: src/services/userService.js
- [ ] Add styling - [type: style]: src/pages/UserProfile.css

## Constraints
Must follow existing code patterns

## Priority: high
`;

async function runEasyTests() {
  console.log("🧪 Running Easy Tests...\n");

  const decomposer = new ElasticDecomposer();

  try {
    console.log("📝 Test 1: Simple Task Decomposition");
    const result1 = await decomposer.decompose(simpleTask);
    console.log(`✅ Generated ${result1.subtasks.length} subtasks`);
    console.log(`⏱️  Processing time: ${result1.metadata.processingTime}ms\n`);

    console.log("📝 Test 2: Structured Task Decomposition");
    const result2 = await decomposer.decompose(structuredTask);
    console.log(`✅ Generated ${result2.subtasks.length} subtasks`);
    console.log(`⏱️  Processing time: ${result2.metadata.processingTime}ms\n`);

    console.log("📊 Test Results Summary:");
    console.log(`- Simple task: ${result1.subtasks.length} subtasks in ${result1.metadata.processingTime}ms`);
    console.log(`- Structured task: ${result2.subtasks.length} subtasks in ${result2.metadata.processingTime}ms`);
    console.log("\n✅ Easy tests completed successfully!\n");

  } catch (error) {
    console.error("❌ Easy test failed:", error);
  }
}

if (require.main === module) {
  runEasyTests();
}

module.exports = { runEasyTests, simpleTask, structuredTask };