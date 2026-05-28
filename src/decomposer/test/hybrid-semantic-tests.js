/**
 * 混合语义分析器测试
 *
 * 测试边界case检测和LLM增强功能
 * 包含多种场景的可靠性与稳定性测试
 */

const HybridSemanticAnalyzer = require('../analyzers/HybridSemanticAnalyzer');

// 测试辅助函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

let testCount = 0;

// ========== 基础功能测试 ==========

// 纯算法模式测试
async function testAlgorithmOnly() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 纯算法模式 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户登录API实现', type: 'api', filePath: '/src/api/auth.js' },
    { id: 2, description: '用户登录页面', type: 'ui', filePath: '/src/pages/login.vue' },
    { id: 3, description: '订单管理API', type: 'api', filePath: '/src/api/order.js' },
    { id: 4, description: '订单列表页面', type: 'ui', filePath: '/src/pages/orders.vue' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  输入: ${deliverables.length} 个deliverables`);
  console.log(`  输出: ${groups.length} 个分组`);

  assert(groups.length >= 1, '应至少有一个分组');
  console.log('  ✓ 纯算法模式测试通过\n');
}

// 边界case检测测试
async function testBoundaryCaseDetection() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 边界case检测 ===`);

  const analyzer = new HybridSemanticAnalyzer({
    llmEnabled: false,
    llmThreshold: 0.3
  });

  const deliverables = [
    { id: 1, description: '用户登录API', type: 'api' },
    { id: 2, description: '用户登录页面', type: 'ui' },
    { id: 3, description: '订单API', type: 'api' }
  ];

  const initialGroups = analyzer.algorithmAnalyzer.groupDeliverables(deliverables);
  const normalizedGroups = initialGroups.map((g, i) => ({
    id: `group_${i}`,
    deliverables: Array.isArray(g) ? g : g.deliverables || [g],
    indices: []
  }));

  const boundaryCases = analyzer.detectBoundaryCases(normalizedGroups, deliverables);
  console.log(`  检测到 ${boundaryCases.length} 个边界case`);

  assert(Array.isArray(boundaryCases), '应返回边界case数组');
  console.log('  ✓ 边界case检测测试通过\n');
}

// ========== 边界情况测试 ==========

// 空输入测试
async function testEmptyInput() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 空输入处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const groups1 = await analyzer.groupDeliverables([]);
  assert(Array.isArray(groups1), '空输入应返回空数组');
  assert(groups1.length === 0, '空输入应返回0个分组');
  console.log('  ✓ 空输入处理正常');

  const groups2 = await analyzer.groupDeliverables(null);
  assert(Array.isArray(groups2), 'null输入应返回空数组');
  console.log('  ✓ null输入处理正常\n');
}

// 单项输入测试
async function testSingleItem() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 单项输入处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [{ id: 1, description: '唯一任务', type: 'api' }];
  const groups = await analyzer.groupDeliverables(deliverables);

  assert(groups.length === 1, '单项输入应返回1个分组');
  assert(groups[0].deliverables.length === 1, '分组应包含1个deliverable');
  console.log('  ✓ 单项输入处理正常\n');
}

// 完全相同项测试
async function testIdenticalItems() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 完全相同项处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户组件', type: 'component' },
    { id: 2, description: '用户组件', type: 'component' },
    { id: 3, description: '用户组件', type: 'component' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  完全相同的3项被分为 ${groups.length} 组`);

  // 相同项应该被合并为一组
  assert(groups.length === 1, '完全相同的项应合并为一组');
  assert(groups[0].deliverables.length === 3, '组内应包含3个deliverable');
  console.log('  ✓ 完全相同项正确合并\n');
}

// 完全不同项测试
async function testDifferentItems() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 完全不同项处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户登录API', type: 'api' },
    { id: 2, description: '产品列表页面', type: 'ui' },
    { id: 3, description: '订单数据库', type: 'database' },
    { id: 4, description: '服务器配置', type: 'config' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  4个不同项被分为 ${groups.length} 组`);

  // 不同项应该各自独立
  assert(groups.length >= 3, '不同项应分为多个组');
  console.log('  ✓ 不同项正确分组\n');
}

// ========== 中文处理测试 ==========

// 纯中文测试
async function testPureChinese() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 纯中文文本处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户登录接口', type: 'api' },
    { id: 2, description: '用户登录页面', type: 'ui' },
    { id: 3, description: '产品详情接口', type: 'api' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  纯中文输入被分为 ${groups.length} 组`);

  // 用户登录相关应该被合并
  const userLoginGroup = groups.find(g =>
    g.deliverables.some(d => d.description.includes('用户登录'))
  );

  assert(userLoginGroup !== undefined, '应存在用户登录相关分组');
  console.log('  ✓ 纯中文处理正常\n');
}

// 中英混合测试
async function testMixedChineseEnglish() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 中英混合文本处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: 'User API接口', type: 'api' },
    { id: 2, description: '用户登录页面', type: 'ui' },
    { id: 3, description: 'Product Controller', type: 'api' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  中英混合输入被分为 ${groups.length} 组`);
  assert(groups.length >= 1, '应返回有效分组');
  console.log('  ✓ 中英混合处理正常\n');
}

// 中文歧义检测测试
async function testChineseAmbiguity() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 中文歧义检测 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  // 相同描述，不同路径
  const deliverables = [
    { id: 1, description: '用户组件', type: 'component', filePath: '/src/components/User.js' },
    { id: 2, description: '用户组件', type: 'component', filePath: '/src/admin/User.js' },
    { id: 3, description: '用户组件', type: 'component', filePath: '/mobile/User.js' }
  ];

  const hasAmbiguity = analyzer.checkDescriptionAmbiguity(deliverables);

  console.log(`  检测到歧义: ${hasAmbiguity}`);
  assert(hasAmbiguity === true, '相同描述不同路径应检测为歧义');
  console.log('  ✓ 中文歧义检测正常\n');
}

// ========== 依赖关系测试 ==========

// 隐式依赖检测测试
async function testImplicitDependency() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 隐式依赖检测 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const group1 = { deliverables: [{ description: '用户Schema定义' }] };
  const group2 = { deliverables: [{ description: '用户数据库表' }] };
  const group3 = { deliverables: [{ description: '产品API' }] };

  const hasImplicit1 = analyzer.hasImplicitDependency(group1, group2);
  const hasImplicit2 = analyzer.hasImplicitDependency(group1, group3);

  console.log(`  Schema与表: ${hasImplicit1}, Schema与API: ${hasImplicit2}`);

  assert(hasImplicit1 === true, 'Schema与数据库表应检测为隐式依赖');
  console.log('  ✓ 隐式依赖检测正常\n');
}

// API与实现依赖测试
async function testApiImplementationDependency() {
  testCount++;
  console.log(`\n=== 测试${testCount}: API与实现依赖 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const groupAPI = { deliverables: [{ description: 'Order API endpoint' }] };
  const groupImpl = { deliverables: [{ description: 'Order Service implementation' }] };

  const hasDep = analyzer.hasImplicitDependency(groupAPI, groupImpl);

  console.log(`  API与实现存在隐式依赖: ${hasDep}`);
  assert(hasDep === true, 'API与实现应检测为隐式依赖');
  console.log('  ✓ API与实现依赖检测正常\n');
}

// ========== 相似度计算测试 ==========

// 组相似度计算测试
async function testGroupSimilarity() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 组间相似度计算 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { description: '用户登录API', content: '用户登录API实现' },
    { description: '用户登录页面', content: '用户登录页面组件' }
  ];

  analyzer.algorithmAnalyzer.groupDeliverables(deliverables);

  const groupA = { deliverables: [deliverables[0]] };
  const groupB = { deliverables: [deliverables[1]] };

  const similarity = analyzer.calculateGroupSimilarity(groupA, groupB);

  console.log(`  相似度: ${similarity.toFixed(3)}`);
  assert(similarity > 0 && similarity <= 1, '相似度应在0-1之间');
  console.log('  ✓ 组间相似度计算正常\n');
}

// 相似度边界值测试
async function testSimilarityBoundary() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 相似度边界值测试 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  // 完全相同的项
  const sim1 = analyzer.calculateSimilarity(
    { description: '测试' },
    { description: '测试' }
  );

  // 完全不同
  const sim2 = analyzer.calculateSimilarity(
    { description: '测试API' },
    { description: '产品页面' }
  );

  console.log(`  相同项相似度: ${sim1.toFixed(3)}, 不同项相似度: ${sim2.toFixed(3)}`);

  assert(sim1 >= sim2, '相同项相似度应大于等于不同项');
  console.log('  ✓ 相似度边界值正常\n');
}

// ========== 配置与降级测试 ==========

// LLM配置测试
async function testLLMConfiguration() {
  testCount++;
  console.log(`\n=== 测试${testCount}: LLM配置与降级 ===`);

  // 无配置时降级
  const analyzer1 = new HybridSemanticAnalyzer({ llmEnabled: true, llmConfig: null });
  assert(analyzer1.llmEnabled === false, '无配置时应禁用LLM');
  console.log('  ✓ 无配置时正确降级');

  // 未启用时LLM禁用
  const analyzer2 = new HybridSemanticAnalyzer({ llmEnabled: false });
  assert(analyzer2.llmEnabled === false, '未启用时LLM应为禁用状态');
  console.log('  ✓ 未启用时LLM正确禁用');

  // 统计功能
  const stats = analyzer2.getStats();
  assert(stats.llmCallCount === 0, '初始调用计数应为0');
  assert(stats.maxLlmCalls === 10, '默认最大调用次数应为10');
  console.log('  ✓ 统计功能正常\n');
}

// ========== 状态管理测试 ==========

// 缓存测试
async function testCache() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 缓存功能 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  analyzer.enhancementCache.set('test_key', { action: 'merge', result: true });

  assert(analyzer.enhancementCache.has('test_key'), '缓存应包含测试数据');
  console.log('  ✓ 缓存写入正常');

  analyzer.reset();
  assert(analyzer.enhancementCache.size === 0, '重置后缓存应为空');
  assert(analyzer.llmCallCount === 0, '重置后调用计数应为0');
  console.log('  ✓ 重置功能正常\n');
}

// ========== 向后兼容性测试 ==========

async function testBackwardCompatibility() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 向后兼容性 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户API', type: 'api' },
    { id: 2, description: '用户组件', type: 'component' }
  ];

  // calculateSimilarity
  const sim = analyzer.calculateSimilarity(deliverables[0], deliverables[1]);
  assert(typeof sim === 'number', 'calculateSimilarity应返回数字');
  console.log('  ✓ calculateSimilarity接口正常');

  // detectDependencies
  const deps = analyzer.detectDependencies(deliverables);
  assert(Array.isArray(deps), 'detectDependencies应返回数组');
  console.log('  ✓ detectDependencies接口正常\n');
}

// ========== 异常数据测试 ==========

// 缺少字段测试
async function testMissingFields() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 缺少字段处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1 },  // 只有id
    { description: '完整描述' },  // 只有描述
    {},  // 空对象
    { type: 'api' }  // 只有类型
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  不完整数据被分为 ${groups.length} 组`);
  assert(groups.length >= 1, '应返回有效分组');
  console.log('  ✓ 缺少字段处理正常\n');
}

// 特殊字符测试
async function testSpecialCharacters() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 特殊字符处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: 'API v2.0 测试', type: 'api' },
    { id: 2, description: 'API v2.0 文档', type: 'doc' },
    { id: 3, description: 'Test-Case-001', type: 'test' },
    { id: 4, description: 'Test Case 002', type: 'test' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  特殊字符数据被分为 ${groups.length} 组`);

  // v2.0 应该被识别为相关
  const apiGroup = groups.find(g =>
    g.deliverables.some(d => d.description.includes('API'))
  );

  assert(apiGroup !== undefined, '应存在API相关分组');
  console.log('  ✓ 特殊字符处理正常\n');
}

// Unicode字符测试
async function testUnicodeCharacters() {
  testCount++;
  console.log(`\n=== 测试${testCount}: Unicode字符处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '用户你好👋', type: 'ui' },
    { id: 2, description: '用户再见', type: 'ui' },
    { id: 3, description: '产品⭐⭐⭐', type: 'api' }
  ];

  const groups = await analyzer.groupDeliverables(deliverables);

  console.log(`  Unicode数据被分为 ${groups.length} 组`);
  assert(groups.length >= 1, '应返回有效分组');
  console.log('  ✓ Unicode字符处理正常\n');
}

// ========== 性能与稳定性测试 ==========

// 大量数据测试
async function testLargeDataset() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 大量数据处理 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  // 生成50个deliverables
  const deliverables = [];
  const types = ['api', 'ui', 'component', 'test', 'config'];
  for (let i = 0; i < 50; i++) {
    deliverables.push({
      id: i,
      description: `任务${Math.floor(i / 5)}类型${types[i % 5]}`,
      type: types[i % 5]
    });
  }

  const startTime = Date.now();
  const groups = await analyzer.groupDeliverables(deliverables);
  const duration = Date.now() - startTime;

  console.log(`  50项数据处理耗时: ${duration}ms`);
  console.log(`  被分为 ${groups.length} 组`);

  assert(duration < 1000, '50项数据处理应在1秒内完成');
  console.log('  ✓ 大量数据处理正常\n');
}

// 重复调用稳定性测试
async function testRepeatedCalls() {
  testCount++;
  console.log(`\n=== 测试${testCount}: 重复调用稳定性 ===`);

  const analyzer = new HybridSemanticAnalyzer({ llmEnabled: false });

  const deliverables = [
    { id: 1, description: '测试API', type: 'api' },
    { id: 2, description: '测试UI', type: 'ui' }
  ];

  // 连续调用10次
  const results = [];
  for (let i = 0; i < 10; i++) {
    const groups = await analyzer.groupDeliverables(deliverables);
    results.push(groups.length);
  }

  console.log(`  10次调用结果: ${results.join(', ')}`);

  // 所有结果应该一致
  const uniqueResults = [...new Set(results)];
  assert(uniqueResults.length === 1, '重复调用应返回一致结果');
  console.log('  ✓ 重复调用稳定性正常\n');
}

// 运行所有测试
async function runAllTests() {
  console.log('========================================');
  console.log('   混合语义分析器可靠性与稳定性测试');
  console.log('========================================');
  console.log('  测试项: 基础功能、边界情况、中文处理、');
  console.log('          依赖关系、相似度计算、配置降级、');
  console.log('          状态管理、异常数据、性能稳定性');
  console.log('========================================');

  try {
    // 基础功能
    await testAlgorithmOnly();
    await testBoundaryCaseDetection();

    // 边界情况
    await testEmptyInput();
    await testSingleItem();
    await testIdenticalItems();
    await testDifferentItems();

    // 中文处理
    await testPureChinese();
    await testMixedChineseEnglish();
    await testChineseAmbiguity();

    // 依赖关系
    await testImplicitDependency();
    await testApiImplementationDependency();

    // 相似度计算
    await testGroupSimilarity();
    await testSimilarityBoundary();

    // 配置与降级
    await testLLMConfiguration();

    // 状态管理
    await testCache();

    // 向后兼容
    await testBackwardCompatibility();

    // 异常数据
    await testMissingFields();
    await testSpecialCharacters();
    await testUnicodeCharacters();

    // 性能与稳定性
    await testLargeDataset();
    await testRepeatedCalls();

    console.log('========================================');
    console.log(`   ✅ 全部 ${testCount} 项测试通过!`);
    console.log('========================================\n');
  } catch (error) {
    console.error(`\n❌ 测试${testCount} 失败:`, error.message);
    process.exit(1);
  }
}

// 执行测试
runAllTests();
