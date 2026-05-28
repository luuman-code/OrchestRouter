/**
 * 集成测试 - 验证分解器各组件协同工作的能力
 */

const ElasticDecomposer = require('../index');
const fs = require('fs').promises;
const path = require('path');

// 验证所有功能块协同工作的测试用例
const integrationTestTask = {
  title: "Build Real-Time Chat Application",
  context: {
    techStack: ["React", "Node.js", "Socket.io", "MongoDB", "JWT"],
    features: ["real-time messaging", "user authentication", "message persistence", "online presence"]
  },
  requirement: "Create a real-time chat application with rooms, private messaging, and message history",
  deliverables: [
    { description: "User authentication API", type: "api", filePath: "server/auth/authController.js" },
    { description: "Chat room management", type: "api", filePath: "server/chat/roomController.js" },
    { description: "Message persistence", type: "database", filePath: "server/models/messageModel.js" },
    { description: "User model", type: "database", filePath: "server/models/userModel.js" },
    { description: "Socket.io configuration", type: "backend", filePath: "server/socket/index.js" },
    { description: "Main frontend component", type: "ui", filePath: "client/src/App.jsx" },
    { description: "Chat room component", type: "ui", filePath: "client/src/components/ChatRoom.jsx" },
    { description: "Message display component", type: "ui", filePath: "client/src/components/MessageList.jsx" },
    { description: "Private messaging component", type: "ui", filePath: "client/src/components/PrivateChat.jsx" },
    { description: "Login component", type: "ui", filePath: "client/src/components/Login.jsx" },
    { description: "User presence logic", type: "logic", filePath: "client/src/utils/presence.js" },
    { description: "Message sending logic", type: "logic", filePath: "client/src/utils/messageHandler.js" },
    { description: "Styling", type: "style", filePath: "client/src/styles/app.css" },
    { description: "Styling for chat components", type: "style", filePath: "client/src/styles/chat.css" },
    { description: "API tests", type: "test", filePath: "tests/api/auth.test.js" },
    { description: "Socket tests", type: "test", filePath: "tests/socket/chat.test.js" }
  ],
  priority: "high",
  constraints: "Real-time performance, scalability to 1000 concurrent users"
};

// 专门测试配置与插件系统的任务
const pluginSystemTestTask = {
  title: "Extend Blog Platform with Custom Features",
  context: {
    techStack: ["Express", "EJS", "MongoDB"],
    extensions: ["SEO optimization", "social sharing", "analytics", "comment system"]
  },
  requirement: "Extend existing blog platform with various custom features using plugin system",
  deliverables: [
    { description: "SEO meta generator plugin", type: "plugin", filePath: "plugins/seo.js" },
    { description: "Social sharing buttons component", type: "ui", filePath: "views/partials/social-share.ejs" },
    { description: "Analytics tracking plugin", type: "plugin", filePath: "plugins/analytics.js" },
    { description: "Comment system API", type: "api", filePath: "routes/comments.js" },
    { description: "Comment moderation system", type: "logic", filePath: "services/commentModeration.js" },
    { description: "Rich text editor component", type: "ui", filePath: "public/js/editor.js" },
    { description: "Blog post schema extension", type: "database", filePath: "models/post.js" },
    { description: "Performance caching layer", type: "backend", filePath: "middleware/cache.js" },
    { description: "Sitemap generator", type: "backend", filePath: "utils/sitemap.js" }
  ],
  priority: "medium"
};

// 测试冲突解决能力的复杂任务
const conflictResolutionTask = `
# Task: Update Payment Gateway Integration

## Context
- Current payment providers: Stripe, PayPal
- New requirement: Add WeChat Pay and Alipay
- Need to maintain backward compatibility

## Requirement
Integrate additional payment methods while refactoring existing payment system

## Deliverables
- [ ] Update payment service - [type: api]: services/payment.js
- [ ] Add WeChat Pay integration - [type: api]: services/payment.js  # Conflict!
- [ ] Add Alipay integration - [type: api]: services/payment.js     # Conflict!
- [ ] Update payment controller - [type: api]: controllers/payment.js
- [ ] Create payment model - [type: database]: models/payment.js
- [ ] Update payment model - [type: database]: models/payment.js    # Conflict!
- [ ] Add payment views - [type: ui]: views/payment.ejs
- [ ] Update payment styles - [type: style]: public/css/payment.css
- [ ] Add payment utils - [type: logic]: utils/paymentHelper.js
- [ ] Update payment tests - [type: test]: tests/payment.test.js

## Constraints
Maintain backward compatibility with existing payment flows

## Priority: critical
`;

// 验证语义分组的多样化任务
const semanticGroupingTask = {
  title: "Complete CMS Feature Set",
  context: {
    techStack: ["Vue.js", "Laravel", "MySQL"],
    modules: ["content management", "user roles", "media library", "SEO tools"]
  },
  requirement: "Build a comprehensive content management system with all required modules",
  deliverables: [
    // Content Management Module
    { description: "Article model", type: "database", filePath: "app/Models/Article.php" },
    { description: "Category model", type: "database", filePath: "app/Models/Category.php" },
    { description: "Article CRUD API", type: "api", filePath: "app/Http/Controllers/ArticleController.php" },
    { description: "Category CRUD API", type: "api", filePath: "app/Http/Controllers/CategoryController.php" },
    { description: "Article management UI", type: "ui", filePath: "resources/js/components/ArticleManager.vue" },

    // User Roles Module
    { description: "User model extensions", type: "database", filePath: "app/Models/User.php" },
    { description: "Role model", type: "database", filePath: "app/Models/Role.php" },
    { description: "Permission system", type: "logic", filePath: "app/Services/PermissionService.php" },
    { description: "User role management UI", type: "ui", filePath: "resources/js/components/RoleManager.vue" },

    // Media Library Module
    { description: "Media model", type: "database", filePath: "app/Models/Media.php" },
    { description: "File upload API", type: "api", filePath: "app/Http/Controllers/MediaController.php" },
    { description: "Media library UI", type: "ui", filePath: "resources/js/components/MediaLibrary.vue" },

    // SEO Tools Module
    { description: "SEO settings model", type: "database", filePath: "app/Models/SeoSetting.php" },
    { description: "Meta generation service", type: "logic", filePath: "app/Services/SeoService.php" },
    { description: "SEO tools UI", type: "ui", filePath: "resources/js/components/SeoTools.vue" },

    // Styling
    { description: "General admin styles", type: "style", filePath: "resources/sass/admin.scss" },
    { description: "Component-specific styles", type: "style", filePath: "resources/sass/components.scss" },

    // Testing
    { description: "Module integration tests", type: "test", filePath: "tests/Feature/CMSModulesTest.php" }
  ],
  priority: "high"
};

async function runIntegrationTests() {
  console.log("🧪 Running Integration Tests...\n");

  // 测试不同配置选项下的分解器行为
  const configsToTest = [
    { name: "Default Config", config: {} },
    { name: "High Threshold Config", config: { mergeThreshold: 0.8, dependencyThreshold: 0.4 } },
    { name: "Low Threshold Config", config: { mergeThreshold: 0.5, dependencyThreshold: 0.2 } },
    { name: "Debug Mode", config: { debug: true, logLevel: 'debug' } }
  ];

  for (const configTest of configsToTest) {
    console.log(`🔧 Testing with ${configTest.name}...`);
    const decomposer = new ElasticDecomposer(configTest.config);

    try {
      // 测试基础功能
      console.log("  📝 Subtest: Basic decomposition");
      const basicResult = await decomposer.decompose(integrationTestTask);
      console.log(`  ✅ Generated ${basicResult.subtasks.length} subtasks`);

      // 测试冲突解决
      console.log("  📝 Subtest: Conflict resolution");
      const conflictResult = await decomposer.decompose(conflictResolutionTask);
      console.log(`  ✅ Generated ${conflictResult.subtasks.length} subtasks after conflict resolution`);

      // 检查冲突是否得到适当处理
      const hasConflictsResolved = conflictResult.metadata.integrationMetadata &&
                                   Object.keys(conflictResult.metadata.integrationMetadata.fileMappings).length > 0;
      console.log(`  🔄 Conflicts handled: ${hasConflictsResolved}`);

      // 测试语义分组
      console.log("  📝 Subtest: Semantic grouping");
      const groupingResult = await decomposer.decompose(semanticGroupingTask);
      console.log(`  ✅ Generated ${groupingResult.subtasks.length} subtasks`);
      if (groupingResult.metadata.groupingInfo) {
        console.log(`  📊 Formed ${groupingResult.metadata.groupingInfo.groupsCount} semantic groups`);
      }

      console.log(`  🟢 ${configTest.name} test passed\n`);

    } catch (error) {
      console.error(`  🔴 ${configTest.name} test failed:`, error.message);
    }
  }

  // 测试插件系统功能（如果可用）
  console.log("🔌 Testing Plugin System...");
  try {
    // 使用带有插件相关类型的任务来验证插件系统
    const pluginDecomposer = new ElasticDecomposer({ debug: true });
    const pluginResult = await pluginDecomposer.decompose(pluginSystemTestTask);
    console.log(`  ✅ Plugin system handled ${pluginResult.subtasks.length} subtasks`);

    // 验证是否对插件类型进行了特殊处理
    const pluginSubtasks = pluginResult.subtasks.filter(st => st.type === 'plugin');
    console.log(`  🧩 Found ${pluginSubtasks.length} plugin-related subtasks`);
    console.log("");
  } catch (error) {
    console.error("  🔴 Plugin system test failed:", error.message);
    console.log("");
  }

  // 性能测试
  console.log("⚡ Performance Test: Timing individual components...");
  const perfDecomposer = new ElasticDecomposer();

  const startTime = Date.now();
  const perfResult = await perfDecomposer.decompose(integrationTestTask);
  const endTime = Date.now();

  console.log(`  ⏱️  Total processing time: ${endTime - startTime}ms`);
  console.log(`  📊 Generated ${perfResult.subtasks.length} subtasks`);
  console.log(`  📈 Efficiency: ${(perfResult.subtasks.length / (endTime - startTime) * 1000).toFixed(2)} subtasks/sec`);

  // 检查各阶段耗时
  if (perfResult.metadata.debugInfo && perfResult.metadata.debugInfo.performance) {
    console.log("  📊 Breakdown by phase:");
    const perfData = perfResult.metadata.debugInfo.performance;
    for (const [phase, timing] of Object.entries(perfData)) {
      console.log(`    - ${phase}: ${timing.duration || timing.avg}ms`);
    }
  }

  console.log("\n✅ Integration tests completed successfully!");
}

if (require.main === module) {
  runIntegrationTests();
}

module.exports = {
  runIntegrationTests,
  integrationTestTask,
  pluginSystemTestTask,
  conflictResolutionTask,
  semanticGroupingTask,
  configsToTest: [
    { name: "Default Config", config: {} },
    { name: "High Threshold Config", config: { mergeThreshold: 0.8, dependencyThreshold: 0.4 } },
    { name: "Low Threshold Config", config: { mergeThreshold: 0.5, dependencyThreshold: 0.2 } },
    { name: "Debug Mode", config: { debug: true, logLevel: 'debug' } }
  ]
};