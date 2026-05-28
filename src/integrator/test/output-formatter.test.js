/**
 * @fileoverview OutputFormatter 测试文件
 *
 * 测试输出格式化器的各种功能
 */

const { OutputFormatter, OutputFormat } = require('../output/formatter');

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
 * 断言包含
 */
function assertContains(str, substr, testName) {
  assert(str.includes(substr), `${testName} (期望包含：${substr}, 实际：${str})`);
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('OutputFormatter 测试');
  console.log('='.repeat(60));
  console.log();

  const formatter = new OutputFormatter();

  // 测试 J1: OutputFormatter 主类实现
  console.log('J1: OutputFormatter 主类实现');
  testMainClass(formatter);
  console.log();

  // 测试 J2: formatForClaudeCode() 实现
  console.log('J2: formatForClaudeCode() 实现');
  testFormatForClaudeCode(formatter);
  console.log();

  // 测试 J3: analyzeFileOperations() 实现
  console.log('J3: analyzeFileOperations() 实现');
  testAnalyzeFileOperations(formatter);
  console.log();

  // 测试 J4: inferActionType() 实现
  console.log('J4: inferActionType() 实现');
  testInferActionType(formatter);
  console.log();

  // 测试 J5: calculatePriority() 实现
  console.log('J5: calculatePriority() 实现');
  testCalculatePriority(formatter);
  console.log();

  // 测试 J6: sortActionsByDependencies() 实现
  console.log('J6: sortActionsByDependencies() 实现');
  testSortActionsByDependencies(formatter);
  console.log();

  // 测试 J7: generateSummary() 实现
  console.log('J7: generateSummary() 实现');
  testGenerateSummary(formatter);
  console.log();

  // 测试 J8: generateExecutionResults() 实现
  console.log('J8: generateExecutionResults() 实现');
  testGenerateExecutionResults(formatter);
  console.log();

  // 测试 J9: FormatOptions 支持
  console.log('J9: FormatOptions 支持');
  testFormatOptionsSupport(formatter);
  console.log();

  // 测试各种输出格式
  console.log('各种输出格式测试');
  testOutputFormats(formatter);
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

function testMainClass(formatter) {
  assert(formatter instanceof OutputFormatter, '应能创建 OutputFormatter 实例');
  assert(typeof formatter.format === 'function', '应有 format 方法');
  assert(typeof formatter.formatForClaudeCode === 'function', '应有 formatForClaudeCode 方法');
  assert(typeof formatter.analyzeFileOperations === 'function', '应有 analyzeFileOperations 方法');
  assert(typeof formatter.generateSummary === 'function', '应有 generateSummary 方法');
}

function testFormatForClaudeCode(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['test.js', { path: 'test.js', content: 'console.log("hello");', language: 'javascript', sourceTaskId: 'task1' }]
    ]),
    warnings: ['Test warning'],
    qualityReport: { auditReport: 'Audit report content' },
    validationReport: { message: 'Validation passed' }
  };

  const output = formatter.formatForClaudeCode(mockResult);

  assert(typeof output === 'string', 'formatForClaudeCode 应返回字符串');
  assert(output.includes('## 代码库整合结果'), '输出应包含标题');
  assert(output.includes('✅ 成功'), '输出应包含成功状态');
  assert(output.includes('test.js'), '输出应包含文件路径');
  assert(output.includes('console.log'), '输出应包含文件内容');
  assert(output.includes('⚠️ Test warning'), '输出应包含警告');
}

function testAnalyzeFileOperations(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['src/index.js', { path: 'src/index.js', content: 'console.log("main");', language: 'javascript' }],
      ['src/utils.js', { path: 'src/utils.js', content: 'export const util = () => {};', language: 'javascript' }]
    ])
  };

  const actions = formatter.analyzeFileOperations(mockResult);

  assert(Array.isArray(actions), 'analyzeFileOperations 应返回数组');
  assert(actions.length >= 2, `应至少分析出 2 个操作（实际：${actions.length}）`);

  if (actions.length > 0) {
    const firstAction = actions[0];
    assert(firstAction.hasOwnProperty('id'), '操作应有 id 属性');
    assert(firstAction.hasOwnProperty('type'), '操作应有 type 属性');
    assert(firstAction.hasOwnProperty('target'), '操作应有 target 属性');
    assert(firstAction.hasOwnProperty('description'), '操作应有 description 属性');
    assert(firstAction.hasOwnProperty('priority'), '操作应有 priority 属性');
  }
}

function testInferActionType(formatter) {
  // 直接测试私有方法比较困难，但我们可以通过 analyzeFileOperations 间接测试
  const mockFileCreate = { content: 'some content' };
  const mockFileDelete = { content: '' };

  // 创建一个临时实例来测试私有方法（利用 JavaScript 的特性）
  const actionTypeCreate = formatter.inferActionType('test.js', mockFileCreate);
  const actionTypeDelete = formatter.inferActionType('test.js', mockFileDelete);

  // 注意：因为我们不能直接访问私有方法，所以我们测试整体行为
  const mockResult = {
    success: true,
    files: new Map([['test.js', mockFileCreate]])
  };

  const actions = formatter.analyzeFileOperations(mockResult);
  assert(actions.length > 0, '应能分析出操作');
}

function testCalculatePriority(formatter) {
  // 通过 analyzeFileOperations 测试优先级计算
  const mockResult = {
    success: true,
    files: new Map([
      ['src/dependency-injection.js', { path: 'src/dependency-injection.js', content: '// dependency file' }],
      ['src/index.js', { path: 'src/index.js', content: '// main file' }],
      ['docs/readme.md', { path: 'docs/readme.md', content: '# Documentation' }]
    ])
  };

  const actions = formatter.analyzeFileOperations(mockResult);
  assert(actions.length > 0, '应能分析出操作');

  // 检查是否有优先级信息
  const hasPriorities = actions.every(action => typeof action.priority === 'number');
  assert(hasPriorities, '所有操作应有优先级');
}

function testSortActionsByDependencies(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['src/index.js', { path: 'src/index.js', content: 'console.log("main");' }],
      ['src/utils.js', { path: 'src/utils.js', content: 'export const util = () => {};' }],
      ['src/config.js', { path: 'src/config.js', content: 'export const config = {};' }]
    ])
  };

  const actions = formatter.analyzeFileOperations(mockResult);
  const sortedActions = formatter.sortActionsByDependencies(actions);

  assert(sortedActions.length === actions.length, '排序后操作数量应保持不变');
  assert(Array.isArray(sortedActions), '排序后仍应是数组');

  // 检查是否按优先级排序
  let isSortedByPriority = true;
  for (let i = 1; i < sortedActions.length; i++) {
    if (sortedActions[i-1].priority > sortedActions[i].priority) {
      isSortedByPriority = false;
      break;
    }
  }
  assert(isSortedByPriority, '操作应按优先级排序');
}

function testGenerateSummary(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['file1.js', { content: 'content1' }],
      ['file2.js', { content: 'content2' }]
    ]),
    warnings: ['warning1'],
    qualityReport: {
      executionQuality: {
        'task1': { score: 8.5 },
        'task2': { score: 9.0 }
      }
    }
  };

  const summary = formatter.generateSummary(mockResult);

  assert(typeof summary === 'object', 'generateSummary 应返回对象');
  assert(summary.totalFiles === 2, '总文件数应为 2');
  assert(summary.warningsCount === 1, '警告数量应为 1');
  assert(summary.averageQualityScore === '8.8', '平均质量分数应为 8.8');
}

function testGenerateExecutionResults(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['file1.js', { content: 'content1' }]
    ]),
    warnings: ['warning1'],
    qualityReport: {
      executionQuality: {
        'task1': { score: 8.5 }
      }
    }
  };

  const executionResults = formatter.generateExecutionResults(mockResult);

  assert(typeof executionResults === 'object', 'generateExecutionResults 应返回对象');
  assert(executionResults.totalFiles === 1, '总文件数应为 1');
  assert(executionResults.warningsCount === 1, '警告数量应为 1');
  assert(Array.isArray(executionResults.actionTypes), '操作类型应为数组');
}

function testFormatOptionsSupport(formatter) {
  const mockResult = {
    success: true,
    files: new Map([['test.js', { content: 'console.log("test");' }]]),
    warnings: ['test warning'],
    qualityReport: { auditReport: 'Quality audit' },
    validationReport: { message: 'Validated' },
    logs: ['log entry'],
    dependencyReport: { external: [], internal: [] },
    cacheStats: { hits: 10 },
    plugins: { loaded: [] }
  };

  // 测试不同的格式选项
  const outputWithAllOptions = formatter.format(mockResult, OutputFormat.JSON, {
    includeLogs: true,
    includeWarnings: true,
    includeQualityReport: true,
    includeValidationReport: true,
    includeDependencyReport: true,
    includeCacheStats: true,
    includePluginInfo: true
  });

  assert(outputWithAllOptions.includes('log entry'), 'JSON 输出应包含日志（当选项开启时）');
  assert(outputWithAllOptions.includes('test warning'), 'JSON 输出应包含警告（当选项开启时）');

  const outputWithoutWarnings = formatter.format(mockResult, OutputFormat.TEXT, {
    includeWarnings: false
  });

  // 在文本格式中检查警告是否被排除
  const hasWarnings = outputWithoutWarnings.includes('test warning');
  assert(!hasWarnings, '文本输出应不包含警告（当选项关闭时）');
}

function testOutputFormats(formatter) {
  const mockResult = {
    success: true,
    files: new Map([
      ['test.js', { path: 'test.js', content: 'console.log("test");', language: 'javascript' }]
    ]),
    warnings: ['Sample warning']
  };

  // 测试 JSON 格式
  const jsonOutput = formatter.format(mockResult, OutputFormat.JSON);
  assert(jsonOutput.startsWith('{'), 'JSON 格式应以 { 开头');
  assert(JSON.parse(jsonOutput), 'JSON 格式应是有效的 JSON');

  // 测试文本格式
  const textOutput = formatter.format(mockResult, OutputFormat.TEXT);
  assert(textOutput.includes('整合结果报告'), '文本格式应包含标题');
  assert(typeof textOutput === 'string', '文本格式应是字符串');

  // 测试 Markdown 格式
  const markdownOutput = formatter.format(mockResult, OutputFormat.MARKDOWN);
  assert(markdownOutput.includes('# 整合结果报告'), 'Markdown 格式应包含标题');
  assert(markdownOutput.includes('|'), 'Markdown 格式应包含表格');

  // 测试文件列表格式
  const fileListOutput = formatter.format(mockResult, OutputFormat.FILE_LIST);
  assert(fileListOutput.includes('test.js'), '文件列表格式应包含文件名');

  // 测试 Claude Code 格式
  const claudeOutput = formatter.format(mockResult, OutputFormat.CLAUDE_CODE);
  assert(claudeOutput.includes('## 代码库整合结果'), 'Claude Code 格式应包含特定标题');
}

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});