/**
 * 高难度测试集 - 验证分解器在复杂场景下的表现
 */

const ElasticDecomposer = require('../index');

// 测试用例1: 非常复杂的全栈任务
const complexFullStackTask = {
  title: "Build E-commerce Platform v2",
  context: {
    techStack: ["Next.js", "Node.js", "MongoDB", "Redis", "Stripe", "TailwindCSS"],
    deployment: "Vercel + AWS",
    authentication: "JWT + OAuth2",
    features: ["shopping cart", "user profiles", "admin panel", "payment processing", "email notifications"]
  },
  requirement: "Create a complete e-commerce platform with all core features",
  deliverables: [
    { description: "User authentication system", type: "api", filePath: "src/backend/auth/index.js" },
    { description: "Product catalog API", type: "api", filePath: "src/backend/products/index.js" },
    { description: "Shopping cart functionality", type: "logic", filePath: "src/backend/cart/index.js" },
    { description: "Payment processing API", type: "api", filePath: "src/backend/payments/index.js" },
    { description: "Database models", type: "database", filePath: "src/backend/models/index.js" },
    { description: "Frontend layout", type: "ui", filePath: "src/frontend/layouts/MainLayout.jsx" },
    { description: "Product listing page", type: "ui", filePath: "src/frontend/pages/Products.jsx" },
    { description: "Product detail page", type: "ui", filePath: "src/frontend/pages/ProductDetail.jsx" },
    { description: "Shopping cart page", type: "ui", filePath: "src/frontend/pages/Cart.jsx" },
    { description: "Checkout page", type: "ui", filePath: "src/frontend/pages/Checkout.jsx" },
    { description: "Admin dashboard", type: "ui", filePath: "src/frontend/pages/admin/Dashboard.jsx" },
    { description: "User profile page", type: "ui", filePath: "src/frontend/pages/UserProfile.jsx" },
    { description: "Email service", type: "backend", filePath: "src/backend/services/emailService.js" },
    { description: "Image upload service", type: "backend", filePath: "src/backend/services/imageUpload.js" },
    { description: "Search functionality", type: "logic", filePath: "src/backend/services/searchService.js" },
    { description: "Analytics service", type: "backend", filePath: "src/backend/services/analyticsService.js" },
    { description: "Frontend global styles", type: "style", filePath: "src/frontend/styles/global.css" },
    { description: "Component library", type: "ui", filePath: "src/frontend/components/index.js" },
    { description: "API middleware", type: "backend", filePath: "src/backend/middleware/index.js" },
    { description: "Validation schemas", type: "logic", filePath: "src/shared/validation/schemas.js" }
  ],
  priority: "critical",
  constraints: "High performance, security compliance, SEO optimization, mobile responsive",
  deadline: "2024-12-31"
};

// 测试用例2: 极具歧义的模糊任务
const ambiguousTask = `
# Task: Improve the App

## Context
Project is complex and growing rapidly. We need better code.

## Requirement
Make everything better, faster, stronger. Users complain but we're not sure what about.

## Deliverables
- [ ] Fix the thing - [type: unknown]: somewhere/in/code.js
- [ ] Optimize performance - [type: unknown]: performance/file.js
- [ ] Update UI - [type: unknown]: components/unknown.jsx
- [ ] Handle user complaints - [type: unknown]: handlers/complaints.js
- [ ] Add missing features - [type: unknown]: features/new.js
- [ ] Update docs - [type: documentation]: docs/missing.md
- [ ] Add tests - [type: test]: tests/random.test.js
- [ ] Secure the application - [type: security]: security/config.js

## Constraints
Don't break existing functionality, please.

## Priority: urgent
`;

// 测试用例3: 大规模重构任务
const massiveRefactoringTask = {
  title: "Legacy System Modernization",
  context: {
    techStack: ["AngularJS", "jQuery", "PHP", "MySQL"],
    targetStack: ["React", "Node.js", "PostgreSQL", "Redis"],
    migrationStrategy: "gradual replacement",
    timeline: "6 months"
  },
  requirement: "Modernize legacy system while maintaining availability. Replace all components gradually.",
  deliverables: [
    { description: "Setup React frontend foundation", type: "frontend", filePath: "src/modern/App.jsx" },
    { description: "Migrate user authentication", type: "api", filePath: "src/modern/auth/migration.js" },
    { description: "Create API gateway", type: "backend", filePath: "src/gateway/index.js" },
    { description: "Database schema modernization", type: "database", filePath: "db/migrations/001_users.js" },
    { description: "Data import/export tools", type: "backend", filePath: "src/tools/dataMigration.js" },
    { description: "Legacy component wrappers", type: "frontend", filePath: "src/wrappers/LegacyAdapter.jsx" },
    { description: "Real-time communication layer", type: "backend", filePath: "src/realtime/socketHandlers.js" },
    { description: "Performance monitoring", type: "backend", filePath: "src/monitoring/performance.js" },
    { description: "Security enhancements", type: "security", filePath: "src/security/enhancements.js" },
    { description: "Testing suite for migrated components", type: "test", filePath: "tests/migratedComponents.test.js" },
    { description: "Documentation for new architecture", type: "documentation", filePath: "docs/architecture.md" },
    { description: "CI/CD pipeline update", type: "devops", filePath: ".github/workflows/deploy.yml" },
    { description: "Migration dashboard", type: "ui", filePath: "src/admin/MigrationDashboard.jsx" },
    { description: "Error tracking integration", type: "backend", filePath: "src/errorTracking/index.js" },
    { description: "Feature flags system", type: "backend", filePath: "src/features/flags.js" },
    { description: "Caching layer implementation", type: "backend", filePath: "src/cache/manager.js" },
    { description: "Logging system upgrade", type: "backend", filePath: "src/logging/winstonConfig.js" },
    { description: "Configuration management", type: "config", filePath: "src/config/environment.js" },
    { description: "Internationalization support", type: "frontend", filePath: "src/i18n/locales.js" },
    { description: "Accessibility improvements", type: "frontend", filePath: "src/accessibility/checklist.js" }
  ],
  priority: "critical",
  constraints: "Zero downtime, gradual rollout, maintain backward compatibility during transition"
};

async function runHardTests() {
  console.log("🧪 Running Hard Difficulty Tests...\n");

  const decomposer = new ElasticDecomposer();

  try {
    console.log("📝 Test 1: Complex Full-Stack Task");
    console.time("Full-Stack Task");
    const result1 = await decomposer.decompose(complexFullStackTask);
    console.timeEnd("Full-Stack Task");
    console.log(`✅ Generated ${result1.subtasks.length} subtasks`);
    if (result1.metadata.groupingInfo) {
      console.log(`📊 Groups formed: ${result1.metadata.groupingInfo.groupsCount}`);
    }
    if (result1.metadata.integrationMetadata) {
      const mappings = Object.keys(result1.metadata.integrationMetadata.fileMappings || {}).length;
      const merges = Object.keys(result1.metadata.integrationMetadata.mergeGroups || {}).length;
      console.log(`🔄 Conflict resolutions: ${mappings}, Merges: ${merges}`);
    }
    console.log("");

    console.log("📝 Test 2: Ambiguous Task Handling");
    console.time("Ambiguous Task");
    const result2 = await decomposer.decompose(ambiguousTask);
    console.timeEnd("Ambiguous Task");
    console.log(`✅ Generated ${result2.subtasks.length} subtasks from ambiguous input`);
    if (result2.metadata.warnings && result2.metadata.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${result2.metadata.warnings.length}`);
    }
    console.log("");

    console.log("📝 Test 3: Massive Refactoring Task");
    console.time("Refactoring Task");
    const result3 = await decomposer.decompose(massiveRefactoringTask);
    console.timeEnd("Refactoring Task");
    console.log(`✅ Generated ${result3.subtasks.length} subtasks for refactoring`);
    if (result3.metadata.groupingInfo) {
      console.log(`📊 Groups formed: ${result3.metadata.groupingInfo.groupsCount}`);
    }
    if (result3.metadata.integrationMetadata && result3.metadata.integrationMetadata.dependencyGraph) {
      console.log(`🔗 Dependencies detected: ${result3.metadata.integrationMetadata.dependencyGraph.length}`);
    }
    console.log("");

    console.log("📊 Hard Tests Summary:");
    console.log(`- Full-stack task: ${result1.subtasks.length} subtasks`);
    console.log(`- Ambiguous task: ${result2.subtasks.length} subtasks with warnings: ${(result2.metadata.warnings || []).length}`);
    console.log(`- Refactoring task: ${result3.subtasks.length} subtasks`);
    console.log("\n✅ Hard difficulty tests completed successfully!\n");

  } catch (error) {
    console.error("❌ Hard test failed:", error);
  }
}

if (require.main === module) {
  runHardTests();
}

module.exports = { runHardTests, complexFullStackTask, ambiguousTask, massiveRefactoringTask };