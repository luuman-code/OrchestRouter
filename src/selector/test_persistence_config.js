/**
 * 学习型选择器数据持久化配置测试
 */

// 引入必要的模块
const LearningSelector = require('./core/LearningSelector');

async function testPersistenceConfiguration() {
  console.log("=== 学习型选择器数据持久化配置测试 ===\n");

  console.log("1. 测试文件存储配置...");
  const fileSelector = new LearningSelector({
    persistenceType: 'file',
    persistencePath: './test-learning-data.json'
  });
  console.log("   - 文件存储配置创建成功");

  console.log("\n2. 测试内存数据操作...");
  // 添加一些测试数据
  fileSelector.recordFeedback(
    'test-task-1',
    'coding',
    'gpt-4',
    { overallScore: 0.9, codeQualityScore: 0.85, performanceScore: 0.92, accuracyScore: 0.88, taskComplexity: 0.7 }
  );

  fileSelector.recordFeedback(
    'test-task-2',
    'coding',
    'claude-3',
    { overallScore: 0.85, codeQualityScore: 0.82, performanceScore: 0.89, accuracyScore: 0.86, taskComplexity: 0.6 }
  );

  console.log(`   - 添加了2条反馈记录，当前总数: ${fileSelector.feedbackHistory.length}`);

  console.log("\n3. 测试数据保存...");
  await fileSelector.savePersistentData();
  console.log("   - 数据保存完成");

  console.log("\n4. 测试Redis存储配置（模拟）...");
  const redisSelector = new LearningSelector({
    persistenceType: 'redis',
    redisConfig: {
      host: 'localhost',
      port: 6379,
      lazyConnect: true  // 避免在没有Redis服务器时出错
    }
  });
  console.log("   - Redis存储配置创建成功（即使服务器不可用也会降级到文件）");

  console.log("\n5. 测试数据库存储配置（模拟）...");
  const dbSelector = new LearningSelector({
    persistenceType: 'database',
    dbConfig: {
      url: 'mongodb://localhost:27017',
      databaseName: 'test_db',
      collectionName: 'test_collection'
    }
  });
  console.log("   - 数据库存储配置创建成功（即使服务器不可用也会降级到文件）");

  console.log("\n6. 测试默认配置...");
  const defaultSelector = new LearningSelector();
  console.log("   - 默认配置创建成功");

  console.log("\n7. 测试学习报告导出...");
  const report = defaultSelector.exportReport();
  console.log(`   - 报告导出成功，反馈总数: ${report.totalFeedback}`);
  console.log(`   - 模型类型数: ${report.totalModelTypes}`);

  console.log("\n8. 测试配置选项...");
  console.log(`   - 默认选择器持久化类型: ${defaultSelector.config.persistenceType}`);
  console.log(`   - 文件选择器路径: ${fileSelector.config.persistencePath}`);
  console.log(`   - Redis配置存在: ${!!fileSelector.config.redisConfig}`);
  console.log(`   - 数据库配置存在: ${!!fileSelector.config.dbConfig}`);

  console.log("\n=== 持久化配置测试完成 ===");

  // 清理测试文件（可选）
  try {
    const fs = require('fs').promises;
    await fs.unlink('./test-learning-data.json');
    console.log("已清理测试文件");
  } catch (e) {
    // 如果文件不存在，忽略错误
  }
}

// 运行测试
testPersistenceConfiguration().catch(console.error);