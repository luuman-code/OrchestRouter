/**
 * 中等难度测试集 - 验证分解器的高级功能
 */

const ElasticDecomposer = require('../index');

// 测试用例1: 多类型任务，需要语义分组
const mediumComplexTask = {
  title: "实现商品详情页",
  context: {
    techStack: ["Vue.js", "SCSS", "Node.js"],
    apiUrl: "/api/products"
  },
  requirement: "创建一个完整的商品详情页面，包括展示商品信息、用户评论和购买功能",
  deliverables: [
    { description: "商品信息展示组件", type: "ui", filePath: "src/components/ProductDetail.vue" },
    { description: "样式文件", type: "style", filePath: "src/components/ProductDetail.scss" },
    { description: "商品数据获取服务", type: "api", filePath: "src/services/productService.js" },
    { description: "评论组件", type: "ui", filePath: "src/components/Review.vue" },
    { description: "评论提交逻辑", type: "logic", filePath: "src/utils/reviewHandler.js" },
    { description: "购物车添加功能", type: "logic", filePath: "src/utils/cartHandler.js" },
    { description: "价格计算逻辑", type: "logic", filePath: "src/utils/priceCalculator.js" },
    { description: "API 接口", type: "api", filePath: "src/api/products.js" }
  ],
  priority: "high",
  constraints: "必须遵循现有的代码结构和样式指南"
};

// 测试用例2: 包含路径冲突的任务
const conflictProneTask = {
  title: "优化登录模块",
  context: {
    techStack: ["React", "Redux", "SASS"]
  },
  requirement: "重构登录模块，提升性能和用户体验",
  deliverables: [
    { description: "登录组件重构", type: "ui", filePath: "src/components/Login.jsx" },
    { description: "登录样式更新", type: "style", filePath: "src/components/Login.jsx" }, // 冲突路径
    { description: "登录逻辑优化", type: "logic", filePath: "src/components/Login.jsx" }, // 冲突路径
    { description: "认证服务改进", type: "api", filePath: "src/services/auth.js" },
    { description: "验证逻辑分离", type: "logic", filePath: "src/utils/validation.js" }
  ],
  priority: "critical"
};

// 测试用例3: 多依赖任务
const dependencyTask = `
# Task: Add Dashboard Analytics

## Context
- Backend: Node.js + Express
- Frontend: React + Chart.js
- Database: MongoDB

## Requirement
Implement analytics dashboard with multiple chart types

## Deliverables
- [ ] Create database schema for metrics - [type: database]: models/metrics.js
- [ ] Implement API endpoints - [type: api]: routes/analytics.js
- [ ] Create data fetching service - [type: api]: services/analyticsService.js
- [ ] Create Dashboard component - [type: ui]: components/Dashboard.jsx
- [ ] Implement chart components - [type: ui]: components/charts/BarChart.jsx
- [ ] Add styling - [type: style]: styles/dashboard.css
- [ ] Add test files - [type: test]: tests/analytics.test.js

## Constraints
All components must be reusable

## Priority: medium
`;

async function runMediumTests() {
  console.log("🧪 Running Medium Difficulty Tests...\n");

  const decomposer = new ElasticDecomposer();

  try {
    console.log("📝 Test 1: Multi-Type Task with Semantic Grouping");
    const result1 = await decomposer.decompose(mediumComplexTask);
    console.log(`✅ Generated ${result1.subtasks.length} subtasks`);
    console.log(`⏱️  Processing time: ${result1.metadata.processingTime}ms`);
    if (result1.metadata.groupingInfo) {
      console.log(`📊 Groups formed: ${result1.metadata.groupingInfo.groupsCount}`);
    }
    console.log("");

    console.log("📝 Test 2: Conflict Resolution Test");
    const result2 = await decomposer.decompose(conflictProneTask);
    console.log(`✅ Generated ${result2.subtasks.length} subtasks after conflict resolution`);
    console.log(`⏱️  Processing time: ${result2.metadata.processingTime}ms`);
    if (result2.metadata.integrationMetadata && result2.metadata.integrationMetadata.fileMappings) {
      console.log(`🔄 Files with conflict resolution: ${Object.keys(result2.metadata.integrationMetadata.fileMappings).length}`);
    }
    console.log("");

    console.log("📝 Test 3: Dependency-Rich Task");
    const result3 = await decomposer.decompose(dependencyTask);
    console.log(`✅ Generated ${result3.subtasks.length} subtasks`);
    console.log(`⏱️  Processing time: ${result3.metadata.processingTime}ms`);
    if (result3.metadata.integrationMetadata && result3.metadata.integrationMetadata.dependencyGraph) {
      console.log(`🔗 Dependencies detected: ${result3.metadata.integrationMetadata.dependencyGraph.length}`);
    }
    console.log("");

    console.log("📊 Medium Tests Summary:");
    console.log(`- Multi-type task: ${result1.subtasks.length} subtasks, ${result1.metadata.processingTime}ms`);
    console.log(`- Conflict task: ${result2.subtasks.length} subtasks, ${result2.metadata.processingTime}ms`);
    console.log(`- Dependency task: ${result3.subtasks.length} subtasks, ${result3.metadata.processingTime}ms`);
    console.log("\n✅ Medium difficulty tests completed successfully!\n");

  } catch (error) {
    console.error("❌ Medium test failed:", error);
  }
}

if (require.main === module) {
  runMediumTests();
}

module.exports = { runMediumTests, mediumComplexTask, conflictProneTask, dependencyTask };