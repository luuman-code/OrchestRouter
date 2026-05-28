/**
 * @fileoverview 模块 H: 整合器接口模块单元测试
 *
 * 测试覆盖:
 * - H1: IntegrationInterfaceProcessor 实现
 * - H2: processForIntegration() 实现
 * - H3: validateSubtaskStructure() 实现
 * - H4: validateExecutionResult() 实现
 * - H5: associateResultsWithSubtasks() 实现
 * - H6: 支持直接 integrationHints 传递
 * - H7: 优化的映射索引实现
 * - H8: MergeStrategyHandler 实现
 * - H9: mergeByStrategy() 实现
 * - H10: 单元测试
 *
 * @requires IntegrationInterfaceProcessor
 * @requires MergeStrategyHandler
 */

const { IntegrationInterfaceProcessor } = require('../interface/processor');
const { MergeStrategyHandler } = require('../interface/merge_handler');

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
 * 断言抛出异常
 */
function assertThrows(fn, testName) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  assert(threw, testName);
}

// ==================== 模块 H 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 H: 整合器接口模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // H1-H2: IntegrationInterfaceProcessor 基本功能测试
  console.log('H1-H2: IntegrationInterfaceProcessor 基本功能测试');
  testIntegrationInterfaceProcessor();
  console.log();

  // H3: validateSubtaskStructure 测试
  console.log('H3: validateSubtaskStructure 测试');
  testValidateSubtaskStructure();
  console.log();

  // H5: 关联执行结果与子任务测试
  console.log('H5: 关联执行结果与子任务测试');
  testAssociateResults();
  console.log();

  // H6: integrationHints 传递测试
  console.log('H6: integrationHints 传递测试');
  testIntegrationHints();
  console.log();

  // H7: 优化的映射索引测试
  console.log('H7: 优化的映射索引测试');
  testOptimizedMapping();
  console.log();

  // H8-H9: MergeStrategyHandler 测试
  console.log('H8-H9: MergeStrategyHandler 测试');
  testMergeStrategyHandler();
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

// ==================== H1-H2: IntegrationInterfaceProcessor 测试 ====================

function testIntegrationInterfaceProcessor() {
  assert(
    typeof IntegrationInterfaceProcessor.processForIntegration === 'function',
    'IntegrationInterfaceProcessor 应有 processForIntegration 方法'
  );
  assert(
    typeof IntegrationInterfaceProcessor.processForIntegration === 'function',
    '应有 processForIntegration 方法'
  );
  assert(
    typeof IntegrationInterfaceProcessor.validateSubtaskStructure === 'function',
    '应有 validateSubtaskStructure 方法'
  );
  assert(
    typeof IntegrationInterfaceProcessor.getTasksForFile === 'function',
    '应有 getTasksForFile 方法'
  );
  assert(
    typeof IntegrationInterfaceProcessor.getMergeStrategyForFile === 'function',
    '应有 getMergeStrategyForFile 方法'
  );
  assert(
    typeof IntegrationInterfaceProcessor.buildIntegrationPlan === 'function',
    '应有 buildIntegrationPlan 方法'
  );

  // 测试 processForIntegration
  const subtasks = [
    {
      id: 'task-1',
      type: 'component',
      prompt: 'Create Button',
      integrationHints: {
        targetFile: 'components/Button.tsx'
      }
    },
    {
      id: 'task-2',
      type: 'component',
      prompt: 'Create Input',
      integrationHints: {
        targetFile: 'components/Input.tsx'
      }
    }
  ];

  const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);
  assert(integrationData.hasOwnProperty('filesToProcess'), '应包含 filesToProcess');
  assert(integrationData.hasOwnProperty('dependencies'), '应包含 dependencies');
  assert(integrationData.hasOwnProperty('mergeGroups'), '应包含 mergeGroups');
  assert(integrationData.hasOwnProperty('regionSpecs'), '应包含 regionSpecs');
  assert(integrationData.filesToProcess instanceof Map, 'filesToProcess 应为 Map');
}

// ==================== H3: validateSubtaskStructure 测试 ====================

function testValidateSubtaskStructure() {
  // 测试有效的子任务
  const validSubtask = {
    id: 'task-1',
    type: 'component',
    prompt: 'Create Button',
    integrationHints: {
      targetFile: 'components/Button.tsx'
    }
  };

  const validResult = IntegrationInterfaceProcessor.validateSubtaskStructure(validSubtask);
  assert(validResult === true, '有效的子任务应返回 true');

  // 测试缺少必需字段的子任务
  const invalidSubtask = {
    id: 'task-1',
    type: 'component'
    // 缺少 prompt 和 integrationHints
  };

  assertThrows(
    () => IntegrationInterfaceProcessor.validateSubtaskStructure(invalidSubtask),
    '缺少必需字段应抛出异常'
  );

  // 测试缺少 targetFile 的子任务
  const missingTargetSubtask = {
    id: 'task-1',
    type: 'component',
    prompt: 'Create Button',
    integrationHints: {}
  };

  assertThrows(
    () => IntegrationInterfaceProcessor.validateSubtaskStructure(missingTargetSubtask),
    '缺少 targetFile 应抛出异常'
  );
}

// ==================== H5: 关联执行结果与子任务测试 ====================

function testAssociateResults() {
  const subtasks = [
    {
      id: 'task-1',
      type: 'component',
      prompt: 'Create Button',
      integrationHints: {
        targetFile: 'components/Button.tsx',
        dependsOn: []
      }
    },
    {
      id: 'task-2',
      type: 'component',
      prompt: 'Create Form',
      integrationHints: {
        targetFile: 'components/Form.tsx',
        dependsOn: ['task-1']
      }
    }
  ];

  const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);

  // 测试 getTasksForFile
  const tasksForButton = IntegrationInterfaceProcessor.getTasksForFile(
    integrationData,
    'components/Button.tsx'
  );
  assertLength(tasksForButton, 1, 'Button.tsx 应有 1 个任务');
  assertEqual(tasksForButton[0].id, 'task-1', '任务 ID 应为 task-1');

  // 测试 getOrderedTasks（有依赖关系）
  const orderedTasks = IntegrationInterfaceProcessor.getOrderedTasks(
    integrationData,
    'components/Form.tsx'
  );
  assert(orderedTasks.length >= 1, '应返回排序后的任务');
}

// ==================== H6: integrationHints 传递测试 ====================

function testIntegrationHints() {
  const subtasks = [
    {
      id: 'task-1',
      type: 'component',
      prompt: 'Create Button',
      integrationHints: {
        targetFile: 'components/Button.tsx',
        mergeStrategy: 'merge',
        region: 'button-styles',
        regionConstraints: {
          startMarker: '/* ButtonStyles */',
          endMarker: '/* end ButtonStyles */'
        }
      }
    }
  ];

  const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);

  // 测试 getMergeStrategyForFile
  const tasks = IntegrationInterfaceProcessor.getTasksForFile(
    integrationData,
    'components/Button.tsx'
  );
  const strategy = IntegrationInterfaceProcessor.getMergeStrategyForFile(tasks);
  assertEqual(strategy, 'merge', '应返回指定的 merge 策略');

  // 测试 getRegionSpec
  const regionSpec = IntegrationInterfaceProcessor.getRegionSpec(integrationData, 'task-1');
  assert(typeof regionSpec === 'object', '应返回区域规格对象');
  assertEqual(regionSpec.region, 'button-styles', '区域名称应正确');
}

// ==================== H7: 优化的映射索引测试 ====================

function testOptimizedMapping() {
  const subtasks = [
    { id: 't1', type: 'c', prompt: 'p1', integrationHints: { targetFile: 'a.tsx' } },
    { id: 't2', type: 'c', prompt: 'p2', integrationHints: { targetFile: 'a.tsx' } },
    { id: 't3', type: 'c', prompt: 'p3', integrationHints: { targetFile: 'b.tsx' } },
    { id: 't4', type: 'c', prompt: 'p4', integrationHints: { targetFile: 'c.tsx' } },
    { id: 't5', type: 'c', prompt: 'p5', integrationHints: { targetFile: 'a.tsx' } }
  ];

  const integrationData = IntegrationInterfaceProcessor.processForIntegration(subtasks);

  // 测试 Map 索引效率
  const tasksForA = IntegrationInterfaceProcessor.getTasksForFile(
    integrationData,
    'a.tsx'
  );
  assertLength(tasksForA, 3, 'a.tsx 应有 3 个任务');

  // 测试 buildIntegrationPlan
  const plan = IntegrationInterfaceProcessor.buildIntegrationPlan(integrationData);
  assert(typeof plan === 'object', '应返回计划对象');
  assert(plan.hasOwnProperty('files'), '计划应包含 files');
  assert(plan.hasOwnProperty('groups'), '计划应包含 groups');
  assert(plan.hasOwnProperty('dependencies'), '计划应包含 dependencies');
  assertLength(plan.files, 3, '应有 3 个文件计划');
}

// ==================== H8-H9: MergeStrategyHandler 测试 ====================

function testMergeStrategyHandler() {
  assert(
    typeof MergeStrategyHandler.mergeByStrategy === 'function',
    'MergeStrategyHandler 应有 mergeByStrategy 方法'
  );
  assert(
    typeof MergeStrategyHandler.mergeByStrategy === 'function',
    '应有 mergeByStrategy 方法'
  );
  assert(
    typeof MergeStrategyHandler.mergeByRegion === 'function',
    '应有 mergeByRegion 方法'
  );
  assert(
    typeof MergeStrategyHandler.partitionAndMerge === 'function',
    '应有 partitionAndMerge 方法'
  );
  assert(
    typeof MergeStrategyHandler.mergeMultiple === 'function',
    '应有 mergeMultiple 方法'
  );

  // 测试 overwrite 策略
  const overwriteResult = MergeStrategyHandler.mergeByStrategy(
    'content1',
    'content2',
    'overwrite'
  );
  assertEqual(overwriteResult, 'content2', 'overwrite 策略应返回 content2');

  // 测试 append 策略
  const appendResult = MergeStrategyHandler.mergeByStrategy(
    'content1',
    'content2',
    'append'
  );
  assertEqual(appendResult, 'content1content2', 'append 策略应返回拼接内容');

  // 测试 merge 策略（带区域）
  const mergeContent1 = '// Header\n// content1\n// Footer';
  const mergeContent2 = '// merged content';
  const mergeResult = MergeStrategyHandler.mergeByStrategy(
    mergeContent1,
    mergeContent2,
    'merge',
    { region: 'content' }
  );
  assert(typeof mergeResult === 'string', 'merge 策略应返回字符串');

  // 测试 rename 策略
  const renameResult = MergeStrategyHandler.mergeByStrategy(
    'content1',
    'content2',
    'rename'
  );
  assertEqual(renameResult, 'content1', 'rename 策略应返回原内容');

  // 测试默认策略
  const defaultResult = MergeStrategyHandler.mergeByStrategy(
    'content1',
    'content2',
    'unknown'
  );
  assertEqual(defaultResult, 'content1content2', '未知策略应使用默认追加');
}

// 测试区域合并
function testRegionMerge() {
  const content1 = `
/* Header */
// Existing code
/* Footer */
`;
  const content2 = '// New content';

  const result = MergeStrategyHandler.mergeByRegion(
    content1,
    content2,
    null,
    {
      startMarker: '/* Header */',
      endMarker: '/* Footer */'
    }
  );

  assert(typeof result === 'string', '应返回字符串');
  assertIncludes(result, '/* Header */', '应包含起始标记');
  assertIncludes(result, '/* Footer */', '应包含结束标记');
  assertIncludes(result, '// New content', '应包含新内容');
}

// 测试多内容合并
function testMultipleMerge() {
  const contents = [
    { content: 'first', strategy: 'overwrite' },
    { content: 'second', strategy: 'append' },
    { content: 'third', strategy: 'append' }
  ];

  const result = MergeStrategyHandler.mergeMultiple(contents);
  assertEqual(result, 'firstsecondthird', '应按顺序合并多个内容');
}

// 运行附加测试
function runAdditionalTests() {
  testRegionMerge();
  testMultipleMerge();
}

// ==================== 运行测试 ====================

runTests();
runAdditionalTests();

// 输出最终结果
console.log('='.repeat(60));
console.log(`测试结果：${passed} 通过，${failed} 失败`);
if (failures.length > 0) {
  console.log('失败的测试:');
  failures.forEach(f => console.error(`  - ${f}`));
}
console.log('='.repeat(60));
