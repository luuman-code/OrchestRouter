/**
 * @fileoverview 模块 A: 文件处理模块单元测试
 *
 * 测试覆盖:
 * - A1: CodeFile 接口定义
 * - A2: FileOrganizer 实现
 * - A3: normalizePath() 实现
 * - A4: writeToDisk() 实现
 * - A5: getFile()/hasFile()/removeFile() 实现
 * - A6: addFile() 合并策略实现
 * - A7: ConflictDetector 实现
 * - A8: ConflictType 枚举定义
 *
 * @requires FileOrganizer
 * @requires ConflictDetector
 */

const path = require('path');
const fs = require('fs').promises;
const { FileOrganizer } = require('../file/organizer');
const { ConflictDetector, ConflictType } = require('../file/conflict');

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
 * 断言对象结构
 */
function assertHasProperties(obj, properties, testName) {
  const hasAll = properties.every(prop => obj.hasOwnProperty(prop));
  assert(hasAll, `${testName} (缺少属性：${properties.filter(p => !obj.hasOwnProperty(p)).join(', ')})`);
}

// ==================== 模块 A 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 A: 文件处理模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // A1: CodeFile 接口定义测试
  console.log('A1: CodeFile 接口定义测试');
  testCodeFileInterface();
  console.log();

  // A2: FileOrganizer 基本功能测试
  console.log('A2: FileOrganizer 基本功能测试');
  testFileOrganizerBasic();
  console.log();

  // A3: normalizePath() 测试
  console.log('A3: normalizePath() 测试');
  testNormalizePath();
  console.log();

  // A4: writeToDisk() 测试
  console.log('A4: writeToDisk() 测试');
  await testWriteToDisk();
  console.log();

  // A5: getFile()/hasFile()/removeFile() 测试
  console.log('A5: getFile()/hasFile()/removeFile() 测试');
  testFileOperations();
  console.log();

  // A6: addFile() 合并策略测试
  console.log('A6: addFile() 合并策略测试');
  testAddFileMergeStrategies();
  console.log();

  // A7: ConflictDetector 测试
  console.log('A7: ConflictDetector 测试');
  testConflictDetector();
  console.log();

  // A8: ConflictType 枚举定义测试
  console.log('A8: ConflictType 枚举定义测试');
  testConflictTypeEnum();
  console.log();

  // 输出测试结果
  console.log('='.repeat(60));
  console.log(`测试结果: ${passed} 通过，${failed} 失败`);
  if (failures.length > 0) {
    console.log('失败的测试:');
    failures.forEach(f => console.error(`  - ${f}`));
  }
  console.log('='.repeat(60));

  // 清理测试文件
  await cleanupTestFiles();
}

// ==================== A1: CodeFile 接口定义测试 ====================

function testCodeFileInterface() {
  // CodeFile 结构通过 JSDoc 定义，这里测试 FileOrganizer 是否能正确处理 CodeFile 对象
  const codeFile = {
    path: 'components/LoginForm.jsx',
    content: 'export default function LoginForm() { return <form>Login</form>; }',
    sourceTaskId: 'task-001',
    modelUsed: 'claude-sonnet-4-5-20250929',
    language: 'javascript',
    integrationHints: {
      targetFile: 'components/LoginForm.jsx',
      mergeStrategy: 'overwrite'
    }
  };

  assertHasProperties(codeFile,
    ['path', 'content', 'sourceTaskId', 'modelUsed', 'language'],
    'CodeFile 基本属性');

  assert(typeof codeFile.path === 'string', 'path 应为字符串');
  assert(typeof codeFile.content === 'string', 'content 应为字符串');
  assert(typeof codeFile.sourceTaskId === 'string', 'sourceTaskId 应为字符串');
}

// ==================== A2: FileOrganizer 基本功能测试 ====================

function testFileOrganizerBasic() {
  const organizer = new FileOrganizer('test-output');

  assert(organizer instanceof FileOrganizer, '应能创建 FileOrganizer 实例');
  assertEqual(organizer.rootDir, 'test-output', 'rootDir 应正确设置');
  assert(organizer.getAllFiles() instanceof Map, 'getAllFiles() 应返回 Map');
  assertEqual(organizer.getAllFiles().size, 0, '初始 files 应为空');

  // 测试添加文件
  const codeFile = {
    path: 'test.js',
    content: 'console.log("hello");',
    sourceTaskId: 'task-001',
    modelUsed: 'claude-sonnet'
  };
  organizer.addFile(codeFile);
  assertEqual(organizer.getAllFiles().size, 1, '添加文件后 size 应为 1');
}

// ==================== A3: normalizePath() 测试 ====================

function testNormalizePath() {
  const organizer = new FileOrganizer();

  // 测试统一斜杠
  assertEqual(
    organizer.normalizePath('foo\\bar\\baz'),
    'foo/bar/baz',
    'Windows 路径应转换为正斜杠'
  );

  assertEqual(
    organizer.normalizePath('foo/bar/baz'),
    'foo/bar/baz',
    'Unix 路径应保持不变'
  );

  // 测试混合斜杠
  assertEqual(
    organizer.normalizePath('foo\\bar/baz\\qux'),
    'foo/bar/baz/qux',
    '混合斜杠应统一为正斜杠'
  );

  // 测试大小写处理 (Windows 默认不敏感)
  const lowerPath = organizer.normalizePath('Foo/Bar.BAZ');
  assert(lowerPath === 'foo/bar.baz' || lowerPath === 'Foo/Bar.BAZ',
    '路径应根据系统进行大小写处理');
}

// ==================== A4: writeToDisk() 测试 ====================

async function testWriteToDisk() {
  const testOutputDir = path.join(__dirname, 'test-output-write');
  const organizer = new FileOrganizer(testOutputDir);

  // 添加测试文件
  organizer.addFile({
    path: 'nested/deep/test.js',
    content: '// Test content for writeToDisk',
    sourceTaskId: 'task-write-test',
    modelUsed: 'test-model'
  });

  try {
    // 写入磁盘
    await organizer.writeToDisk(testOutputDir);

    // 验证文件是否存在
    const writtenPath = path.join(testOutputDir, 'nested', 'deep', 'test.js');
    const content = await fs.readFile(writtenPath, 'utf8');

    assertEqual(content, '// Test content for writeToDisk', '写入的文件内容应正确');

    // 清理
    await fs.rm(testOutputDir, { recursive: true, force: true });
  } catch (error) {
    assert(false, `writeToDisk() 不应抛出错误: ${error.message}`);
  }
}

// ==================== A5: getFile()/hasFile()/removeFile() 测试 ====================

function testFileOperations() {
  const organizer = new FileOrganizer();

  // 添加测试文件
  const testFile = {
    path: 'test/file.js',
    content: 'test content',
    sourceTaskId: 'task-op-test',
    modelUsed: 'test'
  };
  organizer.addFile(testFile);

  // 测试 hasFile
  assert(organizer.hasFile('test/file.js'), 'hasFile 应返回 true');
  assert(!organizer.hasFile('nonexistent.js'), 'hasFile 对不存在的文件应返回 false');

  // 测试 getFile
  const retrieved = organizer.getFile('test/file.js');
  assertEqual(retrieved.content, 'test content', 'getFile 应返回正确的内容');
  assertEqual(retrieved.path, 'test/file.js', 'getFile 应返回正确的路径');

  // 测试 removeFile
  const removed = organizer.removeFile('test/file.js');
  assert(removed, 'removeFile 应返回 true');
  assert(!organizer.hasFile('test/file.js'), 'removeFile 后文件应不存在');
  assertEqual(organizer.getAllFiles().size, 0, 'removeFile 后 size 应为 0');
}

// ==================== A6: addFile() 合并策略测试 ====================

function testAddFileMergeStrategies() {
  const organizer = new FileOrganizer();

  // 测试 overwrite 策略
  organizer.addFile({
    path: 'merge-test.js',
    content: 'original content',
    sourceTaskId: 'task-1',
    modelUsed: 'model-1',
    integrationHints: { mergeStrategy: 'overwrite' }
  });
  organizer.addFile({
    path: 'merge-test.js',
    content: 'new content',
    sourceTaskId: 'task-2',
    modelUsed: 'model-2',
    integrationHints: { mergeStrategy: 'overwrite' }
  });
  const overwritten = organizer.getFile('merge-test.js');
  assertEqual(overwritten.content, 'new content', 'overwrite 策略应使用新内容覆盖');

  // 测试 append 策略
  organizer.addFile({
    path: 'append-test.js',
    content: 'first part ',
    sourceTaskId: 'task-3',
    modelUsed: 'model-3',
    integrationHints: { mergeStrategy: 'append' }
  });
  organizer.addFile({
    path: 'append-test.js',
    content: 'second part',
    sourceTaskId: 'task-4',
    modelUsed: 'model-4',
    integrationHints: { mergeStrategy: 'append' }
  });
  const appended = organizer.getFile('append-test.js');
  assertEqual(appended.content, 'first part second part', 'append 策略应追加内容');

  // 测试 rename 策略
  organizer.addFile({
    path: 'rename-test.js',
    content: 'content 1',
    sourceTaskId: 'task-5',
    modelUsed: 'model-5',
    integrationHints: { mergeStrategy: 'rename' }
  });
  organizer.addFile({
    path: 'rename-test.js',
    content: 'content 2',
    sourceTaskId: 'task-6',
    modelUsed: 'model-6',
    integrationHints: { mergeStrategy: 'rename' }
  });
  // rename 策略会生成新路径，所以原路径应该只有一个文件
  const renamedExists = organizer.hasFile('rename-test.js');
  assert(renamedExists, 'rename 策略后原路径应仍存在文件');

  // 测试 partition 策略
  organizer.addFile({
    path: 'partition-test.js',
    content: 'function foo() {}',
    sourceTaskId: 'task-7',
    modelUsed: 'model-7',
    integrationHints: {
      mergeStrategy: 'partition',
      allowedContentTypes: ['function']
    }
  });
  organizer.addFile({
    path: 'partition-test.js',
    content: 'function bar() {}',
    sourceTaskId: 'task-8',
    modelUsed: 'model-8',
    integrationHints: {
      mergeStrategy: 'partition',
      allowedContentTypes: ['function']
    }
  });
  const partitioned = organizer.getFile('partition-test.js');
  assert(
    partitioned.content.includes('foo') && partitioned.content.includes('bar'),
    'partition 策略应合并两个函数'
  );
}

// ==================== A7: ConflictDetector 测试 ====================

function testConflictDetector() {
  const detector = new ConflictDetector();

  // 测试无冲突情况
  const noConflictFiles = [
    {
      path: 'file1.js',
      content: 'content 1',
      sourceTaskId: 'task-a',
      modelUsed: 'model-a'
    },
    {
      path: 'file2.js',
      content: 'content 2',
      sourceTaskId: 'task-b',
      modelUsed: 'model-b'
    }
  ];
  const noConflicts = detector.detectFileConflicts(noConflictFiles);
  assertEqual(noConflicts.length, 0, '不同路径的文件不应有冲突');

  // 测试相同内容无冲突
  const sameContentFiles = [
    {
      path: 'same.js',
      content: 'identical content',
      sourceTaskId: 'task-c',
      modelUsed: 'model-c'
    },
    {
      path: 'same.js',
      content: 'identical content',
      sourceTaskId: 'task-d',
      modelUsed: 'model-d'
    }
  ];
  const sameConflicts = detector.detectFileConflicts(sameContentFiles);
  assertEqual(sameConflicts.length, 0, '相同内容的文件不应有冲突');

  // 测试不同内容有冲突
  const diffContentFiles = [
    {
      path: 'conflict.js',
      content: 'version 1',
      sourceTaskId: 'task-e',
      modelUsed: 'model-e'
    },
    {
      path: 'conflict.js',
      content: 'version 2',
      sourceTaskId: 'task-f',
      modelUsed: 'model-f'
    }
  ];
  const diffConflicts = detector.detectFileConflicts(diffContentFiles);
  assert(diffConflicts.length > 0, '不同内容的文件应有冲突');
  assertEqual(diffConflicts[0].type, ConflictType.FILE_CONTENT_MISMATCH, '冲突类型应为 FILE_CONTENT_MISMATCH');

  // 测试依赖缺失检测
  const files = [
    {
      path: 'main.js',
      content: 'import "./utils.js";',
      sourceTaskId: 'task-main',
      modelUsed: 'model-main'
    }
  ];
  const dependencyGraph = new Map([['main.js', ['utils.js', 'missing.js']]]);
  const depConflicts = detector.detectDependencyConflicts(files, dependencyGraph);
  assert(depConflicts.length > 0, '应检测到缺失的依赖');
  assertEqual(depConflicts[0].type, ConflictType.DEPENDENCY_MISSING, '冲突类型应为 DEPENDENCY_MISSING');
}

// ==================== A8: ConflictType 枚举定义测试 ====================

function testConflictTypeEnum() {
  // 验证所有定义的冲突类型
  assertEqual(
    ConflictType.FILE_CONTENT_MISMATCH,
    'file_content_mismatch',
    'FILE_CONTENT_MISMATCH 值应正确'
  );
  assertEqual(
    ConflictType.PATH_COLLISION,
    'path_collision',
    'PATH_COLLISION 值应正确'
  );
  assertEqual(
    ConflictType.DEPENDENCY_MISSING,
    'dependency_missing',
    'DEPENDENCY_MISSING 值应正确'
  );
  assertEqual(
    ConflictType.MERGE_STRATEGY_CONFLICT,
    'merge_strategy_conflict',
    'MERGE_STRATEGY_CONFLICT 值应正确'
  );
  assertEqual(
    ConflictType.REGION_MERGE_ERROR,
    'region_merge_error',
    'REGION_MERGE_ERROR 值应正确'
  );

  // 验证所有类型都是字符串
  assert(
    Object.values(ConflictType).every(v => typeof v === 'string'),
    '所有 ConflictType 值都应为字符串'
  );
}

// ==================== 清理函数 ====================

async function cleanupTestFiles() {
  const testDirs = [
    path.join(__dirname, 'test-output-write'),
    path.join(__dirname, 'output')
  ];

  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (e) {
      // 忽略清理错误
    }
  }
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
