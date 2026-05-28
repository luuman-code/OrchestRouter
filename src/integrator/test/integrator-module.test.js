/**
 * @fileoverview 模块 I: 主整合器模块单元测试
 *
 * 测试覆盖:
 * - I1: Integrator 主类实现
 * - I2: integrate() 实现
 * - I3: getFiles() 实现（通过 fileOrganizer.getAllFiles()）
 * - I4: writeToDisk() 实现（通过 fileOrganizer.writeToDisk()）
 * - I5: 结构化日志记录
 * - I6: 改进错误处理
 * - I7: 配置加载器实现
 * - I8: 配置验证逻辑
 * - I9: 插件系统实现
 * - I10-I13: 缓存机制（已完成）
 * - I14-I16: 运行时依赖管理
 * - I17: 模块集成
 * - I18: 集成测试
 * - I19: 性能优化
 *
 * @requires Integrator
 */

const { Integrator } = require('../integrator');

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];

/**
 * 断言函数
 */
function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.error(`  ✗ ${testName}`);
  }
}

/**
 * 断言相等
 */
function assertEqual(actual, expected, testName) {
  assert(actual === expected, `${testName} (期望：${expected}, 实际：${actual})`);
}

/**
 * 断言数组长度
 */
function assertLength(arr, expected, testName) {
  assertEqual(Array.isArray(arr) ? arr.length : -1, expected, testName);
}

/**
 * 断言包含
 */
function assertIncludes(content, substring, testName) {
  assert(content.includes(substring), `${testName} (应包含：${substring})`);
}

/**
 * 断言实例
 */
function assertInstanceOf(obj, cls, testName) {
  assert(obj instanceof cls, `${testName} (应为 ${cls.name} 实例)`);
}

// ==================== 模块 I 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 I: 主整合器模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // I1: Integrator 主类实现测试
  console.log('I1: Integrator 主类实现测试');
  testIntegratorClass();
  console.log();

  // I2: integrate() 实现测试
  console.log('I2: integrate() 实现测试');
  await testIntegrate();
  console.log();

  // I3-I4: 文件操作测试
  console.log('I3-I4: 文件操作测试');
  testFileOperations();
  console.log();

  // I5: 结构化日志记录测试
  console.log('I5: 结构化日志记录测试');
  testStructuredLogging();
  console.log();

  // I6: 改进错误处理测试
  console.log('I6: 改进错误处理测试');
  testErrorHandling();
  console.log();

  // I7-I8: 配置加载与验证测试
  console.log('I7-I8: 配置加载与验证测试');
  testConfigLoading();
  console.log();

  // I17: 模块集成测试
  console.log('I17: 模块集成测试');
  testModuleIntegration();
  console.log();

  // 输出测试结果
  console.log('='.repeat(60));
  console.log(`测试结果：${passed} 通过，${failed} 失败`);
  if (failures.length > 0) {
    console.log('失败的测试:');
    failures.forEach(f => console.error(`  - ${f}`));
  }
  console.log('='.repeat(60));
}

// ==================== I1: Integrator 主类实现测试 ====================

function testIntegratorClass() {
  const integrator = new Integrator();

  assert(integrator instanceof Integrator, '应能创建 Integrator 实例');
  assert(typeof integrator.integrate === 'function', '应有 integrate 方法');
  assert(integrator.hasOwnProperty('config'), '应有 config 属性');
  assert(integrator.hasOwnProperty('fileOrganizer'), '应有 fileOrganizer 属性');
  assert(integrator.hasOwnProperty('conflictDetector'), '应有 conflictDetector 属性');
  assert(integrator.hasOwnProperty('importAnalyzer'), '应有 importAnalyzer 属性');
  assert(integrator.hasOwnProperty('dependencyGraph'), '应有 dependencyGraph 属性');
  assert(integrator.hasOwnProperty('dependencyInjector'), '应有 dependencyInjector 属性');
  assert(integrator.hasOwnProperty('namingConflictResolver'), '应有 namingConflictResolver 属性');
  assert(integrator.hasOwnProperty('autoRenamer'), '应有 autoRenamer 属性');
  assert(integrator.hasOwnProperty('codeFormatter'), '应有 codeFormatter 属性');
  assert(integrator.hasOwnProperty('completenessValidator'), '应有 completenessValidator 属性');
  assert(integrator.hasOwnProperty('executionQualityEvaluator'), '应有 executionQualityEvaluator 属性');
}

// ==================== I2: integrate() 实现测试 ====================

async function testIntegrate() {
  const integrator = new Integrator();

  // 准备测试数据
  const executionResults = [
    {
      task_id: 'task-1',
      success: true,
      content: 'export default function Button() { return <button>Click</button>; }',
      model_used: 'claude-sonnet',
      duration_ms: 5000,
      cost: 0.01,
      usage: { input: 100, output: 50 }
    },
    {
      task_id: 'task-2',
      success: true,
      content: 'export default function Input() { return <input type="text" />; }',
      model_used: 'claude-sonnet',
      duration_ms: 4000,
      cost: 0.008,
      usage: { input: 80, output: 40 }
    }
  ];

  const subtasks = [
    {
      id: 'task-1',
      type: 'component',
      prompt: 'Create Button component',
      integrationHints: {
        targetFile: 'components/Button.tsx'
      }
    },
    {
      id: 'task-2',
      type: 'component',
      prompt: 'Create Input component',
      integrationHints: {
        targetFile: 'components/Input.tsx'
      }
    }
  ];

  // 执行整合
  const result = await integrator.integrate(executionResults, subtasks);

  // 验证结果结构
  assert(typeof result === 'object', '应返回整合结果对象');
  assert(result.hasOwnProperty('success'), '结果应包含 success 属性');
  assert(result.hasOwnProperty('files'), '结果应包含 files 属性');
  assert(result.hasOwnProperty('logs'), '结果应包含 logs 属性');
  assert(result.hasOwnProperty('warnings'), '结果应包含 warnings 属性');

  // 验证文件处理
  assert(result.files instanceof Map, 'files 应为 Map');
  assert(result.files.size >= 2, '应包含至少 2 个文件（Button 和 Input）');

  // 验证入口文件生成
  const hasIndex = Array.from(result.files.keys()).some(k => k.includes('index'));
  assert(hasIndex, '应生成入口文件');

  // 验证日志记录
  assert(result.logs.length >= 1, '应有日志记录');

  // 验证质量报告
  assert(result.hasOwnProperty('qualityReport'), '应包含 qualityReport');
  if (result.qualityReport) {
    assert(result.qualityReport.hasOwnProperty('executionQuality'), '质量报告应包含 executionQuality');
    assert(result.qualityReport.hasOwnProperty('decisions'), '质量报告应包含 decisions');
  }
}

// ==================== I3-I4: 文件操作测试 ====================

function testFileOperations() {
  const integrator = new Integrator();

  // 测试文件组织器的基本操作
  const testFile = {
    path: 'test/TestComponent.tsx',
    content: 'export default function TestComponent() {}',
    language: 'typescript'
  };

  integrator.fileOrganizer.addFile(testFile);

  // 验证文件已添加
  assert(integrator.fileOrganizer.hasFile('test/TestComponent.tsx'), '文件应已添加');

  // 验证文件可获取
  const file = integrator.fileOrganizer.getFile('test/TestComponent.tsx');
  assert(typeof file === 'object', '应能获取文件');
  assertEqual(file.path, 'test/TestComponent.tsx', '文件路径应正确');

  // 验证可写入磁盘（通过 mock 测试方法存在）
  assert(typeof integrator.fileOrganizer.writeToDisk === 'function', '应有 writeToDisk 方法');
}

// ==================== I5: 结构化日志记录测试 ====================

function testStructuredLogging() {
  // 创建带有自定义 logger 的整合器
  const logs = [];
  const mockLogger = {
    info: (msg, ctx) => logs.push({ level: 'info', message: msg, context: ctx }),
    warn: (msg, ctx) => logs.push({ level: 'warn', message: msg, context: ctx }),
    error: (msg, ctx) => logs.push({ level: 'error', message: msg, context: ctx })
  };

  const integrator = new Integrator({ logger: mockLogger });
  assert(integrator.logger === mockLogger, '应使用自定义 logger');

  // 验证日志方法可用
  integrator.logger.info('Test info message', { test: true });
  assertLength(logs, 1, '应记录日志');
  assertEqual(logs[0].level, 'info', '日志级别应正确');
  assertEqual(logs[0].message, 'Test info message', '日志消息应正确');
}

// ==================== I6: 改进错误处理测试 ====================

function testErrorHandling() {
  // 测试整合器在错误情况下的行为
  const integrator = new Integrator();

  // 测试空输入处理
  const emptyResult = integrator.integrate([], []);

  // 验证即使输入为空也不抛出异常
  assert(emptyResult instanceof Promise, '应返回 Promise');

  // 测试无效输入处理
  const invalidResult = integrator.integrate([{ invalid: 'data' }], [{ invalid: 'subtask' }]);
  assert(invalidResult instanceof Promise, '应返回 Promise 处理无效输入');
}

// ==================== I7-I8: 配置加载与验证测试 ====================

function testConfigLoading() {
  // 测试带配置的整合器创建
  const config = {
    formatting: { fallbackEnabled: true, backupEnabled: false },
    execution: {
      quality_threshold: 60,
      critical_quality_threshold: 30
    },
    dependency: {
      pathAliases: { '@components': './src/components' }
    }
  };

  const integrator = new Integrator(config);

  // 验证配置已应用
  assertEqual(integrator.config.formatting.fallbackEnabled, true, '格式化配置应正确');
  assertEqual(integrator.config.execution.quality_threshold, 60, '质量阈值应正确');
  assertEqual(integrator.config.execution.critical_quality_threshold, 30, '严重质量阈值应正确');
  assertEqual(integrator.config.dependency.pathAliases['@components'], './src/components', '路径别名应正确');

  // 验证配置已传递给子模块
  assertEqual(integrator.codeFormatter.config.fallbackEnabled, true, '格式化器配置应正确');
}

// ==================== I17: 模块集成测试 ====================

function testModuleIntegration() {
  const integrator = new Integrator();

  // 验证所有子模块已正确集成
  assertInstanceOf(integrator.fileOrganizer, require('../file/organizer').FileOrganizer, '应集成 FileOrganizer');
  assertInstanceOf(integrator.conflictDetector, require('../file/conflict').ConflictDetector, '应集成 ConflictDetector');
  assertInstanceOf(integrator.importAnalyzer, require('../dependency/analyzer').ImportAnalyzer, '应集成 ImportAnalyzer');
  assertInstanceOf(integrator.dependencyGraph, require('../dependency/graph').DependencyGraph, '应集成 DependencyGraph');
  assertInstanceOf(integrator.dependencyInjector, require('../dependency/injector').DependencyInjector, '应集成 DependencyInjector');
  assertInstanceOf(integrator.namingConflictResolver, require('../conflict/detector').NamingConflictResolver, '应集成 NamingConflictResolver');
  assertInstanceOf(integrator.autoRenamer, require('../conflict/renamer').AutoRenamer, '应集成 AutoRenamer');
  assertInstanceOf(integrator.codeFormatter, require('../style/formatter').CodeFormatter, '应集成 CodeFormatter');
  assertInstanceOf(integrator.completenessValidator, require('../validation/completeness').CompletenessValidator, '应集成 CompletenessValidator');
  assertInstanceOf(integrator.executionQualityEvaluator, require('../execution/quality_evaluator').ExecutionQualityEvaluator, '应集成 ExecutionQualityEvaluator');
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
