/**
 * @fileoverview 模块 E: 入口生成模块单元测试
 *
 * 测试覆盖:
 * - E1: EntryPointGenerator 实现
 * - E2: generateIndex() 实现
 * - E3: inferExportName() 实现
 * - E4: 可配置导出命名策略
 * - E5: 模块系统自动检测
 * - E6: 多模块系统支持
 * - E7: 生成 ES6 导出语句
 * - E8: 生成 CommonJS 导出语句
 * - E9: 单元测试
 *
 * @requires EntryPointGenerator
 */

const { EntryPointGenerator, ExportNamingStrategies } = require('../entry/generator');

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
function assertIncludes(content, substring, testName) {
  assert(content.includes(substring), `${testName} (应包含：${substring})`);
}

// ==================== 模块 E 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 E: 入口生成模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // E1: EntryPointGenerator 基本功能测试
  console.log('E1: EntryPointGenerator 基本功能测试');
  testEntryPointGeneratorBasic();
  console.log();

  // E2: generateIndex() 测试
  console.log('E2: generateIndex() 测试');
  testGenerateIndex();
  console.log();

  // E3: inferExportName() 测试
  console.log('E3: inferExportName() 测试');
  testInferExportName();
  console.log();

  // E4: 可配置导出命名策略测试
  console.log('E4: 可配置导出命名策略测试');
  testExportNamingStrategies();
  console.log();

  // E5: 模块系统自动检测测试
  console.log('E5: 模块系统自动检测测试');
  testModuleSystemDetection();
  console.log();

  // E6-E8: 多模块系统支持测试
  console.log('E6-E8: 多模块系统支持测试');
  testMultiModuleSystemSupport();
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

// ==================== E1: EntryPointGenerator 基本功能测试 ====================

function testEntryPointGeneratorBasic() {
  const generator = new EntryPointGenerator();

  assert(generator instanceof EntryPointGenerator, '应能创建 EntryPointGenerator 实例');
  assert(typeof generator.generateIndex === 'function', '应有 generateIndex 方法');
  assert(typeof generator.inferExportName === 'function', '应有 inferExportName 方法');
  assert(typeof generator.detectModuleSystem === 'function', '应有 detectModuleSystem 方法');
  assert(typeof generator.generateES6Exports === 'function', '应有 generateES6Exports 方法');
  assert(typeof generator.generateCommonJSExports === 'function', '应有 generateCommonJSExports 方法');
}

// ==================== E2: generateIndex() 测试 ====================

function testGenerateIndex() {
  const generator = new EntryPointGenerator();

  // 准备测试文件
  const testFiles = new Map([
    ['button.tsx', {
      path: 'button.tsx',
      content: 'export default function Button() {}',
      language: 'typescript',
      hasDefaultExport: true
    }],
    ['input.tsx', {
      path: 'input.tsx',
      content: 'export function Input() {}',
      language: 'typescript',
      hasDefaultExport: false
    }]
  ]);

  // 测试生成组件入口
  const componentIndex = generator.generateIndex(testFiles, 'component');
  assert(typeof componentIndex === 'object', '应返回入口文件对象');
  assert(componentIndex.hasOwnProperty('path'), '结果应包含 path 属性');
  assert(componentIndex.hasOwnProperty('content'), '结果应包含 content 属性');
  assert(componentIndex.hasOwnProperty('language'), '结果应包含 language 属性');
  assertEqual(componentIndex.language, 'typescript', 'language 应为 typescript');

  // 测试生成主入口
  const mainIndex = generator.generateIndex(testFiles, 'main');
  assert(typeof mainIndex === 'object', '主入口应返回对象');
  assertIncludes(mainIndex.path, 'index', '主入口路径应包含 index');
}

// ==================== E3: inferExportName() 测试 ====================

function testInferExportName() {
  const generator = new EntryPointGenerator();

  // 测试文件名推断
  const name1 = generator.inferExportName('components/Button.tsx', {
    path: 'components/Button.tsx'
  });
  assertEqual(name1, 'Button', '应从文件名推断出 Button');

  // 测试带连字符的文件名
  const name2 = generator.inferExportName('ui/form-input.tsx', {
    path: 'ui/form-input.tsx'
  });
  assertEqual(name2, 'FormInput', '连字符文件名应转换为 PascalCase');

  // 测试带下划线的文件名
  const name3 = generator.inferExportName('utils/helper_function.js', {
    path: 'utils/helper_function.js'
  });
  assertEqual(name3, 'HelperFunction', '下划线文件名应转换为 PascalCase');

  // 测试自定义命名策略
  const customStrategy = (filePath) => {
    return 'CustomName';
  };
  const customGenerator = new EntryPointGenerator({
    exportNamingStrategy: customStrategy
  });
  const customName = customGenerator.inferExportName('any/path.js', {});
  assertEqual(customName, 'CustomName', '自定义策略应返回 CustomName');
}

// ==================== E4: 可配置导出命名策略测试 ====================

function testExportNamingStrategies() {
  // 验证预设策略存在
  assert(ExportNamingStrategies.hasOwnProperty('filename'), '应有 filename 策略');
  assert(ExportNamingStrategies.hasOwnProperty('dirname'), '应有 dirname 策略');
  assert(ExportNamingStrategies.hasOwnProperty('filepath'), '应有 filepath 策略');

  // 测试 filename 策略
  const filenameStrategy = ExportNamingStrategies.filename;
  assert(typeof filenameStrategy.apply === 'function', 'filename 策略应有 apply 方法');
  const filenameResult = filenameStrategy.apply('components/Button.tsx', {});
  assertEqual(filenameResult, 'Button', 'filename 策略应返回 Button');

  // 测试 dirname 策略
  const dirnameStrategy = ExportNamingStrategies.dirname;
  const dirnameResult = dirnameStrategy.apply('components/Button.tsx', {});
  assertEqual(dirnameResult, 'Components', 'dirname 策略应返回 Components');

  // 测试 filepath 策略
  const filepathStrategy = ExportNamingStrategies.filepath;
  const filepathResult = filepathStrategy.apply('components/button.tsx', {});
  assert(filepathResult.length > 0, 'filepath 策略应返回非空字符串');
}

// ==================== E5: 模块系统自动检测测试 ====================

function testModuleSystemDetection() {
  const generator = new EntryPointGenerator();

  // 测试默认检测（无项目文件时应返回 commonjs）
  const detectedSystem = generator.detectModuleSystem();
  assert(['es6', 'commonjs'].includes(detectedSystem), '应返回有效的模块系统');

  // 测试显式指定模块系统
  const es6Generator = new EntryPointGenerator({
    moduleSystem: 'es6'
  });
  assertEqual(es6Generator.detectModuleSystem(), 'es6', '显式指定 es6 应返回 es6');

  const cjsGenerator = new EntryPointGenerator({
    moduleSystem: 'commonjs'
  });
  assertEqual(cjsGenerator.detectModuleSystem(), 'commonjs', '显式指定 commonjs 应返回 commonjs');

  // 测试基于内容的检测
  const contentGenerator = new EntryPointGenerator({
    autoDetectModuleSystem: true
  });

  // 模拟 ES6 内容
  globalThis.allProjectFiles = new Map([
    ['file1.js', {
      content: 'import React from "react"; export default function App() {}'
    }],
    ['file2.js', {
      content: 'export const foo = 1; import { bar } from "./bar";'
    }]
  ]);

  const detectedFromES6Content = contentGenerator.detectModuleSystem();
  // ES6 内容应该被检测到
  console.log(`  [INFO] ES6 内容检测结果：${detectedFromES6Content}`);

  // 模拟 CommonJS 内容
  globalThis.allProjectFiles = new Map([
    ['file1.js', {
      content: 'const React = require("react"); module.exports = function App() {}'
    }],
    ['file2.js', {
      content: 'exports.foo = 1; const bar = require("./bar");'
    }]
  ]);

  const detectedFromCJSContent = contentGenerator.detectModuleSystem();
  console.log(`  [INFO] CommonJS 内容检测结果：${detectedFromCJSContent}`);
}

// ==================== E6-E8: 多模块系统支持测试 ====================

function testMultiModuleSystemSupport() {
  const generator = new EntryPointGenerator();

  // 准备测试导出信息
  const testExports = [
    { exportName: 'Button', importPath: './components/Button', isDefault: true },
    { exportName: 'Input', importPath: './components/Input', isDefault: false }
  ];

  // E7: 测试 ES6 导出语句生成
  const es6Output = generator.generateES6Exports(testExports);
  assert(typeof es6Output === 'string', 'ES6 导出应返回字符串');
  assertIncludes(es6Output, 'export', 'ES6 导出应包含 export 关键字');
  assertIncludes(es6Output, 'from', 'ES6 导出应包含 from 关键字');
  assertIncludes(es6Output, './components/Button', 'ES6 导出应包含正确的导入路径');

  // E8: 测试 CommonJS 导出语句生成
  const cjsOutput = generator.generateCommonJSExports(testExports);
  assert(typeof cjsOutput === 'string', 'CommonJS 导出应返回字符串');
  assertIncludes(cjsOutput, 'require', 'CommonJS 导出应包含 require');
  assertIncludes(cjsOutput, 'module.exports', 'CommonJS 导出应包含 module.exports');

  // 测试 UMD 导出（额外功能）
  const umdOutput = generator.generateUMDExports(testExports);
  assert(typeof umdOutput === 'string', 'UMD 导出应返回字符串');
  assertIncludes(umdOutput, 'define', 'UMD 导出应包含 define (AMD)');
  assertIncludes(umdOutput, 'module.exports', 'UMD 导出应包含 module.exports (CommonJS)');
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
