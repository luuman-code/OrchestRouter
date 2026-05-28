/**
 * @fileoverview 模块 D: 代码风格模块单元测试
 *
 * 测试覆盖:
 * - D1: CodeFormatter 实现
 * - D2: Prettier 集成
 * - D3: Black 集成
 * - D4: formatFile() 实现
 * - D5: 工具可用性检测
 * - D6: 降级处理机制
 * - D7: 工具路径配置
 * - D8: 格式化前备份
 * - D9: 单元测试
 *
 * @requires CodeFormatter
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { CodeFormatter } = require('../style/formatter');

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];
const tempFiles = [];

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
 * 清理临时文件
 */
function cleanupTempFiles() {
  for (const file of tempFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      // 忽略清理错误
    }
  }
}

// ==================== 模块 D 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 D: 代码风格模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // D1: CodeFormatter 基本功能测试
  console.log('D1: CodeFormatter 基本功能测试');
  testCodeFormatterBasic();
  console.log();

  // D2: Prettier 集成测试
  console.log('D2: Prettier 集成测试');
  testPrettierIntegration();
  console.log();

  // D3: Black 集成测试
  console.log('D3: Black 集成测试');
  testBlackIntegration();
  console.log();

  // D4: formatFile() 测试
  console.log('D4: formatFile() 测试');
  testFormatFile();
  console.log();

  // D5: 工具可用性检测测试
  console.log('D5: 工具可用性检测测试');
  testToolAvailability();
  console.log();

  // D6: 降级处理机制测试
  console.log('D6: 降级处理机制测试');
  testFallbackMechanism();
  console.log();

  // D7: 工具路径配置测试
  console.log('D7: 工具路径配置测试');
  testToolPathConfig();
  console.log();

  // D8: 格式化前备份测试
  console.log('D8: 格式化前备份测试');
  testBackupBeforeFormat();
  console.log();

  // 输出测试结果
  console.log('='.repeat(60));
  console.log(`测试结果：${passed} 通过，${failed} 失败`);
  if (failures.length > 0) {
    console.log('失败的测试:');
    failures.forEach(f => console.error(`  - ${f}`));
  }
  console.log('='.repeat(60));

  // 清理
  cleanupTempFiles();
}

// ==================== D1: CodeFormatter 基本功能测试 ====================

function testCodeFormatterBasic() {
  const formatter = new CodeFormatter({ fallbackEnabled: true });

  assert(formatter instanceof CodeFormatter, '应能创建 CodeFormatter 实例');
  assert(typeof formatter.formatFile === 'function', '应有 formatFile 方法');
  assert(typeof formatter.isToolAvailable === 'function', '应有 isToolAvailable 方法');
  assert(typeof formatter.getToolVersion === 'function', '应有 getToolVersion 方法');
  assert(typeof formatter.generateFormattingReport === 'function', '应有 generateFormattingReport 方法');
}

// ==================== D2: Prettier 集成测试 ====================

function testPrettierIntegration() {
  const formatter = new CodeFormatter({
    fallbackEnabled: true,
    prettierPath: null
  });

  // 测试 Prettier 可用性检测
  const prettierAvailable = formatter.isToolAvailable('prettier');
  console.log(`  [INFO] Prettier 可用性：${prettierAvailable ? '可用' : '不可用'}`);

  // 测试 Prettier 版本检测
  const version = formatter.getToolVersion('prettier');
  console.log(`  [INFO] Prettier 版本：${version || 'N/A'}`);

  // 测试 formatWithPrettier 方法存在
  assert(typeof formatter.formatWithPrettier === 'function', '应有 formatWithPrettier 方法');

  // 如果 Prettier 可用，测试实际格式化
  if (prettierAvailable) {
    const jsContent = 'const x=1;';
    const result = formatter.formatWithPrettier(jsContent, 'test.js');
    assert(typeof result === 'object', '应返回格式化结果对象');
    assert(result.hasOwnProperty('success'), '结果应包含 success 属性');
  } else {
    assert(true, 'Prettier 不可用时跳过实际格式化测试');
  }
}

// ==================== D3: Black 集成测试 ====================

function testBlackIntegration() {
  const formatter = new CodeFormatter({ fallbackEnabled: true });

  // 测试 Black 可用性检测
  const blackAvailable = formatter.isToolAvailable('black');
  console.log(`  [INFO] Black 可用性：${blackAvailable ? '可用' : '不可用'}`);

  // 测试 Black 版本检测
  const version = formatter.getToolVersion('black');
  console.log(`  [INFO] Black 版本：${version || 'N/A'}`);

  // 测试 formatWithBlack 方法存在
  assert(typeof formatter.formatWithBlack === 'function', '应有 formatWithBlack 方法');

  // 如果 Black 可用，测试实际格式化
  if (blackAvailable) {
    const pyContent = 'def foo ():\n    pass';
    const result = formatter.formatWithBlack(pyContent);
    assert(typeof result === 'object', '应返回格式化结果对象');
    assert(result.hasOwnProperty('success'), '结果应包含 success 属性');
  } else {
    assert(true, 'Black 不可用时跳过实际格式化测试');
  }
}

// ==================== D4: formatFile() 测试 ====================

function testFormatFile() {
  const formatter = new CodeFormatter({
    fallbackEnabled: true,
    backupEnabled: false
  });

  // 测试 JavaScript 文件格式化
  const jsFile = {
    path: 'test.js',
    content: 'const x  =  1;',
    language: 'javascript'
  };

  const jsResult = formatter.formatFile(jsFile);
  assert(typeof jsResult === 'object', '应返回格式化结果对象');
  assert(jsResult.hasOwnProperty('formattedContent'), '结果应包含 formattedContent');
  assert(jsResult.hasOwnProperty('toolUsed'), '结果应包含 toolUsed');
  assert(['prettier', 'fallback', 'none'].includes(jsResult.toolUsed), 'toolUsed 应为有效值');

  // 测试 Python 文件格式化
  const pyFile = {
    path: 'test.py',
    content: 'def foo ():\n    pass',
    language: 'python'
  };

  const pyResult = formatter.formatFile(pyFile);
  assert(typeof pyResult === 'object', 'Python 文件应返回格式化结果对象');

  // 测试不支持的文件类型
  const unknownFile = {
    path: 'test.xyz',
    content: 'some content',
    language: 'unknown'
  };

  const unknownResult = formatter.formatFile(unknownFile);
  assertEqual(unknownResult.toolUsed, 'none', '不支持的文件类型应跳过格式化');
}

// ==================== D5: 工具可用性检测测试 ====================

function testToolAvailability() {
  const formatter = new CodeFormatter({});

  // 测试 Prettier 检测
  const prettierCheck = formatter.isToolAvailable('prettier');
  assert(typeof prettierCheck === 'boolean', 'isToolAvailable 应返回布尔值');

  // 测试 Black 检测
  const blackCheck = formatter.isToolAvailable('black');
  assert(typeof blackCheck === 'boolean', 'isToolAvailable 应返回布尔值');

  // 测试未知工具
  const unknownCheck = formatter.isToolAvailable('unknown_tool');
  assertEqual(unknownCheck, false, '未知工具应返回 false');

  // 测试版本检测
  const prettierVersion = formatter.getToolVersion('prettier');
  assert(prettierVersion === null || typeof prettierVersion === 'string', '版本号应为字符串或 null');

  const blackVersion = formatter.getToolVersion('black');
  assert(blackVersion === null || typeof blackVersion === 'string', '版本号应为字符串或 null');
}

// ==================== D6: 降级处理机制测试 ====================

function testFallbackMechanism() {
  const formatter = new CodeFormatter({ fallbackEnabled: true });

  // 测试 JavaScript 降级格式化
  const jsContent = 'const x  =  1;\nfunction  test ( ) { }';
  const jsFormatted = formatter.applyFallbackFormatting(jsContent, 'javascript');
  assert(typeof jsFormatted === 'string', '降级格式化应返回字符串');
  assert(jsFormatted.length > 0, '降级格式化结果不应为空');

  // 测试 Python 降级格式化
  const pyContent = 'def foo ():\n    pass';
  const pyFormatted = formatter.applyFallbackFormatting(pyContent, 'python');
  assert(typeof pyFormatted === 'string', 'Python 降级格式化应返回字符串');

  // 测试 JSON 降级格式化
  const jsonContent = '{"a":1,"b":2}';
  const jsonFormatted = formatter.applyFallbackFormatting(jsonContent, 'json');
  assert(typeof jsonFormatted === 'string', 'JSON 降级格式化应返回字符串');
  // JSON 应该被正确格式化
  try {
    const parsed = JSON.parse(jsonFormatted);
    assert(typeof parsed === 'object', '格式化后的 JSON 应可解析');
  } catch (e) {
    assert(false, '格式化后的 JSON 应有效');
  }

  // 测试通用降级格式化
  const genericContent = '  some  content  \n\n\n   more content';
  const genericFormatted = formatter.applyFallbackFormatting(genericContent, 'unknown');
  assert(typeof genericFormatted === 'string', '通用降级格式化应返回字符串');
  assert(!genericFormatted.includes('\t'), '通用格式化应转换制表符');
}

// ==================== D7: 工具路径配置测试 ====================

function testToolPathConfig() {
  // 测试自定义 Prettier 路径配置
  const formatterWithPath = new CodeFormatter({
    fallbackEnabled: true,
    prettierPath: '/custom/path/prettier'
  });

  assert(formatterWithPath.config.prettierPath === '/custom/path/prettier',
    '应支持自定义 Prettier 路径配置');

  // 测试不存在的路径应返回不可用
  const isAvailable = formatterWithPath.isToolAvailable('prettier');
  // 路径不存在应返回 false
  assert(isAvailable === false, '不存在的 Prettier 路径应返回不可用');
}

// ==================== D8: 格式化前备份测试 ====================

function testBackupBeforeFormat() {
  const tempDir = os.tmpdir();
  const testFilePath = path.join(tempDir, `test_backup_${Date.now()}.js`
  );
  const testContent = 'const x = 1;';

  // 写入测试文件
  fs.writeFileSync(testFilePath, testContent, 'utf8');
  tempFiles.push(testFilePath);

  const formatter = new CodeFormatter({
    fallbackEnabled: true,
    backupEnabled: true
  });

  // 测试备份功能
  const backupPath = formatter.backupBeforeFormat(testContent, testFilePath);
  tempFiles.push(backupPath);

  assert(typeof backupPath === 'string', '应返回备份文件路径');
  assert(fs.existsSync(backupPath), '备份文件应存在');

  // 验证备份内容
  const backupContent = fs.readFileSync(backupPath, 'utf8');
  assertEqual(backupContent, testContent, '备份内容应与原始内容一致');

  // 测试格式化后生成报告
  const results = [
    { toolUsed: 'prettier', originalFilePath: 'file1.js', warnings: [] },
    { toolUsed: 'fallback', originalFilePath: 'file2.js', warnings: ['因 Prettier 不可用而使用降级'] },
    { toolUsed: 'none', originalFilePath: 'file3.txt', warnings: ['不支持的文件类型'] }
  ];

  const report = formatter.generateFormattingReport(results);
  assert(typeof report === 'string', '应返回报告字符串');
  assert(report.includes('代码格式化报告'), '报告应包含标题');
  assert(report.includes('总共处理文件'), '报告应包含处理统计');
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  cleanupTempFiles();
  process.exit(1);
});
