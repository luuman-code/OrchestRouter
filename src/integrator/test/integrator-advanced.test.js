/**
 * @fileoverview 模块 I: 主整合器模块高级功能测试
 *
 * 测试覆盖:
 * - I9: 插件系统 (PluginManager)
 * - I14-I16: 运行时依赖管理 (RuntimeDependencyManager)
 * - I19: 性能优化 (CacheManager)
 */

const { PluginManager } = require('../plugins/plugin_manager');
const { RuntimeDependencyManager, BUILTIN_MODULES } = require('../dependencies/runtime_dependency_manager');
const { CacheManager, SimpleCache } = require('../cache/cache_manager');

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

// ==================== 模块 I 高级功能测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 I: 主整合器模块高级功能测试');
  console.log('='.repeat(60));
  console.log();

  // I9: 插件系统测试
  console.log('I9: 插件系统 (PluginManager) 测试');
  testPluginManager();
  console.log();

  // I14-I16: 运行时依赖管理测试
  console.log('I14-I16: 运行时依赖管理 (RuntimeDependencyManager) 测试');
  await testRuntimeDependencyManager();
  console.log();

  // I19: 性能优化测试（缓存管理）
  console.log('I19: 性能优化 (CacheManager) 测试');
  await testCacheManager();
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

// ==================== I9: 插件系统测试 ====================

function testPluginManager() {
  const pluginManager = new PluginManager();

  assert(pluginManager instanceof PluginManager, '应能创建 PluginManager 实例');
  assert(typeof pluginManager.loadPlugin === 'function', '应有 loadPlugin 方法');
  assert(typeof pluginManager.registerDependencyResolver === 'function', '应有 registerDependencyResolver 方法');
  assert(typeof pluginManager.registerConflictStrategy === 'function', '应有 registerConflictStrategy 方法');
  assert(typeof pluginManager.registerFileProcessor === 'function', '应有 registerFileProcessor 方法');

  // 测试自定义依赖解析器
  const customResolver = {
    name: 'CustomResolver',
    match: (filePath, content) => filePath.endsWith('.custom.js'),
    resolve: (filePath, content) => ['custom-dep']
  };
  pluginManager.registerDependencyResolver(customResolver);
  const resolvers = pluginManager.getDependencyResolvers();
  assertLength(resolvers, 1, '应注册 1 个依赖解析器');
  assertEqual(resolvers[0].name, 'CustomResolver', '解析器名称应正确');

  // 测试自定义冲突解决策略
  const customStrategy = {
    name: 'CustomStrategy',
    match: (file1, file2) => true,
    resolve: (file1, file2) => file1
  };
  pluginManager.registerConflictStrategy(customStrategy);
  const strategies = pluginManager.getConflictStrategies();
  assertLength(strategies, 1, '应注册 1 个冲突解决策略');

  // 测试自定义文件处理器
  const customProcessor = {
    name: 'CustomProcessor',
    match: (file) => true,
    process: (file) => ({ ...file, processed: true })
  };
  pluginManager.registerFileProcessor(customProcessor);
  const processors = pluginManager.getFileProcessors();
  assertLength(processors, 1, '应注册 1 个文件处理器');

  // 测试依赖解析
  const deps = pluginManager.resolveDependencies('test.custom.js', 'content', ['default-dep']);
  assert(deps.includes('custom-dep'), '应使用自定义解析器解析依赖');

  // 测试冲突解决
  const conflictResult = pluginManager.resolveConflict({ path: 'a.js' }, { path: 'b.js' });
  assert(conflictResult !== null, '应返回冲突解决结果');

  // 测试文件处理
  const processedFile = pluginManager.processFile({ path: 'test.js', content: 'test' });
  assert(processedFile.processed === true, '文件应被处理');

  // 测试获取已加载插件
  const loadedPlugins = pluginManager.getLoadedPlugins();
  assertLength(loadedPlugins, 0, '应返回已加载插件列表');

  // 测试卸载插件（虽然没加载）
  const unloaded = pluginManager.unloadPlugin('nonexistent');
  assert(unloaded === false, '卸载不存在的插件应返回 false');

  // 测试清空所有插件
  pluginManager.clearAllPlugins();
  assertLength(pluginManager.getDependencyResolvers(), 0, '清空后解析器应为空');
  assertLength(pluginManager.getConflictStrategies(), 0, '清空后策略应为空');
  assertLength(pluginManager.getFileProcessors(), 0, '清空后处理器应为空');
}

// ==================== I14-I16: 运行时依赖管理测试 ====================

async function testRuntimeDependencyManager() {
  const depManager = new RuntimeDependencyManager({
    autoDetectExternalPackages: true,
    outputDependencyList: true
  });

  assert(depManager instanceof RuntimeDependencyManager, '应能创建 RuntimeDependencyManager 实例');
  assert(typeof depManager.analyzeProjectDependencies === 'function', '应有 analyzeProjectDependencies 方法');
  assert(typeof depManager.analyzeFileDependencies === 'function', '应有 analyzeFileDependencies 方法');
  assert(typeof depManager.generateDependencyReport === 'function', '应有 generateDependencyReport 方法');

  // 测试内置模块检测
  const hasFs = BUILTIN_MODULES.has('fs');
  assert(hasFs === true, 'fs 应为内置模块');
  const hasReact = BUILTIN_MODULES.has('react');
  assert(hasReact === false, 'react 不应为内置模块');

  // 测试文件依赖分析
  const testContent = `
    import React from 'react';
    import { useState } from 'react';
    import lodash from 'lodash';
    import fs from 'fs';
    import path from 'path';
    import { utils } from './utils';
    import { helper } from '../helpers/helper';
    const axios = require('axios');
  `;

  const deps = await depManager.analyzeFileDependencies(testContent, 'test.js');
  assert(deps.length > 0, '应分析出依赖');

  // 验证依赖分类
  const external = deps.filter(d => d.type === 'external');
  const internal = deps.filter(d => d.type === 'internal');
  const builtin = deps.filter(d => d.type === 'builtin');

  assert(external.length >= 3, `应至少有 3 个外部包依赖（实际：${external.length}）`);
  assert(internal.length >= 2, `应至少有 2 个内部模块依赖（实际：${internal.length}）`);
  assert(builtin.length >= 2, `应至少有 2 个内置模块依赖（实际：${builtin.length}）`);

  // 验证具体依赖
  const hasReactDep = external.some(d => d.name === 'react');
  assert(hasReactDep, '应检测到 react 依赖');

  const hasLodash = external.some(d => d.name === 'lodash');
  assert(hasLodash, '应检测到 lodash 依赖');

  // 测试项目依赖分析
  const testFiles = new Map([
    ['file1.js', {
      path: 'file1.js',
      content: "import React from 'react'; export default function App() {}"
    }],
    ['file2.js', {
      path: 'file2.js',
      content: "import { utils } from './utils'; export function helper() {}"
    }],
    ['file3.js', {
      path: 'file3.js',
      content: "const fs = require('fs'); module.exports = {};"
    }]
  ]);

  const report = await depManager.analyzeProjectDependencies(testFiles);
  assert(typeof report === 'object', '应返回依赖报告对象');
  assert(report.hasOwnProperty('external'), '报告应包含 external');
  assert(report.hasOwnProperty('internal'), '报告应包含 internal');
  assert(report.hasOwnProperty('builtin'), '报告应包含 builtin');
  assert(report.hasOwnProperty('missingPackages'), '报告应包含 missingPackages');

  // 测试依赖报告生成
  const reportText = depManager.generateDependencyReport(report);
  assert(typeof reportText === 'string', '应返回字符串报告');
  assert(reportText.includes('依赖分析报告'), '报告应包含标题');
  assert(reportText.includes('外部包依赖'), '报告应包含外部包依赖部分');
}

// ==================== I19: 缓存管理测试 ====================

async function testCacheManager() {
  // 测试简单缓存
  const cache = new SimpleCache({ maxEntries: 10, ttl: 60000 });

  assert(cache instanceof SimpleCache, '应能创建 SimpleCache 实例');
  assert(typeof cache.get === 'function', '应有 get 方法');
  assert(typeof cache.set === 'function', '应有 set 方法');
  assert(typeof cache.delete === 'function', '应有 delete 方法');
  assert(typeof cache.has === 'function', '应有 has 方法');
  assert(typeof cache.clear === 'function', '应有 clear 方法');

  // 测试缓存设置和获取
  cache.set('key1', 'value1');
  const value1 = cache.get('key1');
  assertEqual(value1, 'value1', '应能获取缓存值');

  // 测试缓存不存在
  const nonExistent = cache.get('nonexistent');
  assert(nonExistent === null, '获取不存在的缓存应返回 null');

  // 测试缓存删除
  cache.delete('key1');
  const deleted = cache.get('key1');
  assert(deleted === null, '删除后应返回 null');

  // 测试缓存最大值限制
  for (let i = 0; i < 15; i++) {
    cache.set(`key${i}`, `value${i}`);
  }
  assert(cache.size <= 10, '缓存大小不应超过最大值');

  // 测试缓存统计
  const stats = cache.getStats();
  assert(typeof stats === 'object', '应返回统计对象');
  assert(stats.hasOwnProperty('total'), '统计应包含 total');
  assert(stats.hasOwnProperty('valid'), '统计应包含 valid');

  // 测试缓存管理器
  const cacheManager = new CacheManager({
    enabled: true,
    persistenceEnabled: false,
    maxEntries: 100
  });

  assert(cacheManager instanceof CacheManager, '应能创建 CacheManager 实例');
  assert(cacheManager.generalCache instanceof SimpleCache, '应有 generalCache');
  assert(cacheManager.dependencyGraphCache, '应有 dependencyGraphCache');
  assert(cacheManager.symbolCache, '应有 symbolCache');

  // 测试文件哈希计算
  const hash1 = cacheManager.computeFileHash('test content');
  const hash2 = cacheManager.computeFileHash('test content');
  const hash3 = cacheManager.computeFileHash('different content');

  assertEqual(hash1, hash2, '相同内容应有相同哈希');
  assert(hash1 !== hash3, '不同内容应有不同哈希');

  // 测试文件变更检测
  const hasChanged = cacheManager.symbolCache.hasFileChanged('test.js', 'new content');
  assert(hasChanged === true, '新文件应被检测为变更');

  // 测试缓存统计
  const managerStats = cacheManager.getStats();
  assert(typeof managerStats === 'object', '应返回管理器统计');
  assert(managerStats.hasOwnProperty('generalCache'), '统计应包含 generalCache');
  assert(managerStats.hasOwnProperty('symbolCache'), '统计应包含 symbolCache');

  // 测试清空缓存
  cacheManager.clearAll();
  assert(cacheManager.generalCache.size === 0, '清空后 generalCache 应为空');

  // 测试增量处理
  const files = new Map([
    ['file1.js', { path: 'file1.js', content: 'content1' }],
    ['file2.js', { path: 'file2.js', content: 'content2' }]
  ]);

  const processor = async (file) => ({ processed: true, path: file.path });
  const result = await cacheManager.processIncremental(files, processor);

  assert(typeof result === 'object', '应返回增量处理结果');
  assert(result.hasOwnProperty('results'), '结果应包含 results');
  assert(result.hasOwnProperty('changedFiles'), '结果应包含 changedFiles');
  assert(result.hasOwnProperty('unchangedFiles'), '结果应包含 unchangedFiles');
  assertLength(result.changedFiles, 2, '首次处理应全部为变更文件');
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
