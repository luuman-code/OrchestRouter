/**
 * 语义分析与子任务合并测试
 *
 * 测试分解器的语义相似度计算和子任务合并能力
 */

const ElasticDecomposer = require('../index');

/**
 * 测试1: 高相似度内容合并
 * 预期：多个描述相近的 deliverables 应被合并为一个子任务
 */
const testTask1 = {
  title: "User Profile Module",
  context: {
    techStack: ["React", "Node.js"]
  },
  requirement: "Build user profile management module",
  deliverables: [
    // 这4个 deliverable 语义高度相似，应该被合并
    { description: "User profile display component", type: "ui", filePath: "client/src/components/UserProfile.jsx" },
    { description: "User profile editing component", type: "ui", filePath: "client/src/components/ProfileEditor.jsx" },
    { description: "User profile page", type: "ui", filePath: "client/src/pages/ProfilePage.jsx" },
    { description: "User avatar upload component", type: "ui", filePath: "client/src/components/AvatarUpload.jsx" },
    // 独立的 API，不应被合并
    { description: "User profile API", type: "api", filePath: "server/routes/profile.js" },
    { description: "User database model", type: "database", filePath: "server/models/User.js" }
  ],
  priority: "high"
};

/**
 * 测试2: 类型相似度分组
 * 预期：类型相关的 deliverables (如 component + style) 应被分到同一组
 */
const testTask2 = {
  title: "E-commerce Product Display",
  context: {
    techStack: ["Vue.js", "Express", "MySQL"]
  },
  requirement: "Create product display and management system",
  deliverables: [
    // UI 组件组 - 应该合并
    { description: "Product card component", type: "ui", filePath: "client/src/components/ProductCard.vue" },
    { description: "Product list component", type: "ui", filePath: "client/src/components/ProductList.vue" },
    { description: "Product detail page", type: "ui", filePath: "client/src/pages/ProductDetail.vue" },
    // 样式组 - 应该与 UI 组件组合并（类型相似度 0.6）
    { description: "Product card styles", type: "style", filePath: "client/src/styles/product-card.css" },
    { description: "Product list styles", type: "style", filePath: "client/src/styles/product-list.css" },
    // API 组 - 应该合并
    { description: "Product API endpoint", type: "api", filePath: "server/routes/products.js" },
    { description: "Product search API", type: "api", filePath: "server/routes/search.js" },
    // 独立的
    { description: "Product database model", type: "database", filePath: "server/models/Product.js" }
  ],
  priority: "medium"
};

/**
 * 测试3: 路径相似度测试
 * 预期：同一目录下的文件应被分到同一组
 */
const testTask3 = {
  title: "Admin Dashboard",
  context: {
    techStack: ["React", "Node.js", "MongoDB"]
  },
  requirement: "Build admin dashboard with analytics",
  deliverables: [
    // 同一目录下的组件
    { description: "Dashboard main page", type: "ui", filePath: "client/src/admin/Dashboard.jsx" },
    { description: "Dashboard sidebar", type: "ui", filePath: "client/src/admin/components/Sidebar.jsx" },
    { description: "Dashboard header", type: "ui", filePath: "client/src/admin/components/Header.jsx" },
    { description: "Dashboard charts", type: "ui", filePath: "client/src/admin/components/Charts.jsx" },
    // 另一个目录下的组件
    { description: "User management page", type: "ui", filePath: "client/src/users/Users.jsx" },
    { description: "User list component", type: "ui", filePath: "client/src/users/components/UserList.jsx" },
    { description: "User edit form", type: "ui", filePath: "client/src/users/components/UserEdit.jsx" },
    // 后端 API（独立）
    { description: "Admin API", type: "api", filePath: "server/routes/admin.js" }
  ],
  priority: "high"
};

/**
 * 测试4: 依赖关系检测
 * 预期：检测出存在依赖但不应合并的 deliverables
 */
const testTask4 = {
  title: "API Documentation System",
  context: {
    techStack: ["Express", "Swagger", "React"]
  },
  requirement: "Create API documentation with interactive testing",
  deliverables: [
    // 接口定义 - 应该在前
    { description: "API schema definition", type: "api", filePath: "server/docs/schema.js" },
    { description: "API interface specification", type: "api", filePath: "server/docs/api-spec.yaml" },
    // 依赖接口的实现
    { description: "Users API implementation", type: "api", filePath: "server/routes/users.js" },
    { description: "Products API implementation", type: "api", filePath: "server/routes/products.js" },
    // 依赖实现的测试
    { description: "Users API tests", type: "test", filePath: "tests/api/users.test.js" },
    { description: "Products API tests", type: "test", filePath: "tests/api/products.test.js" },
    // 文档（与其他类型相似度低）
    { description: "API documentation", type: "documentation", filePath: "docs/api.md" }
  ],
  priority: "medium"
};

/**
 * 测试5: 大量 deliverables 的动态阈值
 * 预期：交付物数量 > 10 时，阈值自动降低，允许更多分组
 */
const testTask5 = {
  title: "Full-stack LMS Platform",
  context: {
    techStack: ["Next.js", "Prisma", "PostgreSQL"]
  },
  requirement: "Build complete learning management system",
  deliverables: [
    // Course 模块
    { description: "Course listing page", type: "ui", filePath: "client/src/courses/List.jsx" },
    { description: "Course detail page", type: "ui", filePath: "client/src/courses/Detail.jsx" },
    { description: "Course creation form", type: "ui", filePath: "client/src/courses/Create.jsx" },
    { description: "Course API", type: "api", filePath: "server/routes/courses.js" },
    { description: "Course model", type: "database", filePath: "server/models/Course.js" },
    // Lesson 模块
    { description: "Lesson player component", type: "ui", filePath: "client/src/lessons/Player.jsx" },
    { description: "Lesson list component", type: "ui", filePath: "client/src/lessons/List.jsx" },
    { description: "Lesson API", type: "api", filePath: "server/routes/lessons.js" },
    { description: "Lesson model", type: "database", filePath: "server/models/Lesson.js" },
    // User 模块
    { description: "User profile page", type: "ui", filePath: "client/src/users/Profile.jsx" },
    { description: "User dashboard", type: "ui", filePath: "client/src/users/Dashboard.jsx" },
    { description: "User API", type: "api", filePath: "server/routes/users.js" },
    { description: "User model", type: "database", filePath: "server/models/User.js" },
    // Progress 模块
    { description: "Progress tracker", type: "ui", filePath: "client/src/progress/Tracker.jsx" },
    { description: "Progress API", type: "api", filePath: "server/routes/progress.js" },
    // 共享样式
    { description: "Course styles", type: "style", filePath: "client/src/styles/course.css" },
    { description: "Lesson styles", type: "style", filePath: "client/src/styles/lesson.css" },
    // 测试
    { description: "Course tests", type: "test", filePath: "tests/course.test.js" },
    { description: "Lesson tests", type: "test", filePath: "tests/lesson.test.js" }
  ],
  priority: "critical"
};

/**
 * 测试6: 边界情况 - 全部低相似度
 * 预期：每个 deliverable 都被分成独立的组
 */
const testTask6 = {
  title: "Microservices System",
  context: {
    techStack: ["Node.js", "Docker", "Kubernetes"]
  },
  requirement: "Build microservices-based system",
  deliverables: [
    { description: "User service API", type: "api", filePath: "services/user/api.js" },
    { description: "Order service API", type: "api", filePath: "services/order/api.js" },
    { description: "Payment service API", type: "api", filePath: "services/payment/api.js" },
    { description: "Notification service API", type: "api", filePath: "services/notification/api.js" },
    { description: "User service database", type: "database", filePath: "services/user/db.js" },
    { description: "Order service database", type: "database", filePath: "services/order/db.js" },
    { description: "Frontend React app", type: "frontend", filePath: "web/client/index.js" },
    { description: "Backend Express server", type: "backend", filePath: "api/server/index.js" },
    { description: "Nginx config", type: "config", filePath: "deploy/nginx.conf" },
    { description: "Docker compose file", type: "config", filePath: "deploy/docker-compose.yml" }
  ],
  priority: "high"
};

// 运行测试的函数
async function runSemanticMergeTests() {
  console.log("=" .repeat(60));
  console.log("🔬 语义分析与子任务合并测试");
  console.log("=" .repeat(60));

  const decomposer = new ElasticDecomposer();

  const tests = [
    { name: "高相似度内容合并", task: testTask1 },
    { name: "类型相似度分组", task: testTask2 },
    { name: "路径相似度测试", task: testTask3 },
    { name: "依赖关系检测", task: testTask4 },
    { name: "大量 deliverables 动态阈值", task: testTask5 },
    { name: "边界情况 - 全部低相似度", task: testTask6 }
  ];

  for (const test of tests) {
    console.log(`\n📋 测试: ${test.name}`);
    console.log("-".repeat(40));

    try {
      const result = await decomposer.decompose(test.task);

      console.log(`输入 deliverables 数量: ${test.task.deliverables.length}`);
      console.log(`输出子任务数量: ${result.subtasks.length}`);
      console.log(`合并比率: ${(1 - result.subtasks.length / test.task.deliverables.length).toFixed(2)}`);

      // 显示分组信息
      if (result.metadata.groupingInfo) {
        console.log(`\n📊 分组详情:`);
        console.log(`  - 分组数量: ${result.metadata.groupingInfo.groupsCount}`);
        result.metadata.groupingInfo.groups.forEach((group, idx) => {
          console.log(`  组 ${idx + 1}: ${group.size} 个 deliverables, 类型: ${group.types.join(', ')}`);
        });
      }

      // 显示子任务摘要
      console.log(`\n📝 子任务摘要:`);
      result.subtasks.slice(0, 5).forEach((subtask, idx) => {
        const desc = subtask.description?.substring(0, 50) || subtask.prompt?.substring(0, 50) || 'N/A';
        console.log(`  ${idx + 1}. [${subtask.type}] ${desc}...`);
      });
      if (result.subtasks.length > 5) {
        console.log(`  ... 还有 ${result.subtasks.length - 5} 个子任务`);
      }

    } catch (error) {
      console.error(`❌ 测试失败: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ 所有测试完成");
  console.log("=".repeat(60));
}

// 导出测试用例供外部使用
module.exports = {
  testTask1,
  testTask2,
  testTask3,
  testTask4,
  testTask5,
  testTask6,
  runSemanticMergeTests
};

// 如果直接运行
if (require.main === module) {
  runSemanticMergeTests().catch(console.error);
}
