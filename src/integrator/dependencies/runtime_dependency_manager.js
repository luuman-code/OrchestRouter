/**
 * @fileoverview RuntimeDependencyManager - 运行时依赖管理器
 *
 * 检测代码中的外部包依赖
 * 分析 import/require 语句，区分外部包、内部模块和内置模块
 * 生成依赖报告并可选择性更新 package.json
 */

const fs = require('fs');
const path = require('path');

/**
 * DependencyInfo - 依赖信息
 *
 * @typedef {Object} DependencyInfo
 * @property {string} name - 依赖名称
 * @property {'external'|'internal'|'builtin'} type - 依赖类型
 * @property {string[]} importedSymbols - 导入的符号列表
 * @property {string[]} sourceFiles - 源文件列表
 * @property {string} [recommendedVersion] - 推荐版本
 */

/**
 * DependencyReport - 依赖报告
 *
 * @typedef {Object} DependencyReport
 * @property {DependencyInfo[]} external - 外部包依赖
 * @property {DependencyInfo[]} internal - 内部模块依赖
 * @property {DependencyInfo[]} builtin - 内置模块依赖
 * @property {string[]} missingPackages - 缺失的包
 * @property {Object} [packageJsonUpdates] - package.json 更新建议
 */

/**
 * NodeJS 内置模块列表
 */
const BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

/**
 * 常用包的最新版本映射（简化版，实际应从 npm 获取）
 */
const PACKAGE_VERSIONS = {
  'react': '^18.2.0',
  'react-dom': '^18.2.0',
  'lodash': '^4.17.21',
  'axios': '^1.6.0',
  'express': '^4.18.2',
  'typescript': '^5.3.0',
  '@types/react': '^18.2.0',
  '@types/node': '^20.0.0'
};

/**
 * RuntimeDependencyManager - 运行时依赖管理器
 *
 * 分析项目依赖，生成依赖报告
 */
class RuntimeDependencyManager {
  /**
   * 创建运行时依赖管理器
   *
   * @param {Object} [config] - 配置
   */
  constructor(config = {}) {
    /** @type {Object} */
    this.config = {
      packageJsonPath: config.packageJsonPath || './package.json',
      autoDetectExternalPackages: config.autoDetectExternalPackages !== false,
      autoUpdatePackageJson: config.autoUpdatePackageJson || false,
      outputDependencyList: config.outputDependencyList !== false,
      ...config
    };

    /** @type {Map<string, DependencyInfo>} */
    this.dependenciesCache = new Map();
  }

  /**
   * 分析项目依赖（主入口）
   *
   * @param {Map<string, Object>} files - 文件列表
   * @returns {Promise<DependencyReport>} 依赖报告
   */
  async analyzeProjectDependencies(files) {
    const report = {
      external: [],
      internal: [],
      builtin: [],
      missingPackages: [],
      packageJsonUpdates: null
    };

    const depsMap = new Map();

    // 分析每个文件
    for (const [filePath, file] of files.entries()) {
      const fileDeps = await this.analyzeFileDependencies(file.content, filePath);

      for (const dep of fileDeps) {
        if (!depsMap.has(dep.name)) {
          depsMap.set(dep.name, { ...dep, sourceFiles: [] });
        }
        const existing = depsMap.get(dep.name);
        existing.sourceFiles.push(filePath);
        existing.importedSymbols = [...new Set([...existing.importedSymbols, ...dep.importedSymbols])];
      }
    }

    // 分类依赖
    for (const [name, info] of depsMap.entries()) {
      if (info.type === 'external') {
        report.external.push(info);
      } else if (info.type === 'internal') {
        report.internal.push(info);
      } else if (info.type === 'builtin') {
        report.builtin.push(info);
      }
    }

    // 检测缺失的包
    report.missingPackages = await this.detectMissingPackages(report.external);

    // 生成 package.json 更新建议
    if (this.config.autoUpdatePackageJson || this.config.outputDependencyList) {
      report.packageJsonUpdates = await this.generatePackageJsonUpdates(report.external);
    }

    // 缓存结果
    this.dependenciesCache = depsMap;

    return report;
  }

  /**
   * 分析单个文件的依赖
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @returns {Promise<DependencyInfo[]>} 依赖列表
   */
  async analyzeFileDependencies(content, filePath) {
    const dependencies = [];

    // 使用 AST 分析（如果可用）或正则表达式
    try {
      const parser = this.getParser();
      if (parser) {
        return this.analyzeWithAST(content, filePath, parser);
      }
    } catch (error) {
      // 降级到正则表达式
    }

    // 正则表达式分析
    return this.analyzeWithRegex(content, filePath);
  }

  /**
   * 使用 AST 分析依赖
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Object} parser - 解析器
   * @returns {DependencyInfo[]} 依赖列表
   */
  analyzeWithAST(content, filePath, parser) {
    const dependencies = [];

    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        plugins: ['typescript', 'jsx']
      });

      // 遍历 AST 节点
      this.traverseAST(ast, (node) => {
        if (node.type === 'ImportDeclaration') {
          const importInfo = this.extractImportFromNode(node, content);
          if (importInfo) {
            dependencies.push(importInfo);
          }
        } else if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'StringLiteral'
        ) {
          const importInfo = this.extractRequireFromNode(node, content);
          if (importInfo) {
            dependencies.push(importInfo);
          }
        }
      });
    } catch (error) {
      console.warn(`AST 分析失败 (${filePath}): ${error.message}`);
    }

    return dependencies;
  }

  /**
   * 使用正则表达式分析依赖
   *
   * @private
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @returns {DependencyInfo[]} 依赖列表
   */
  analyzeWithRegex(content, filePath) {
    const dependencies = [];

    // 匹配 ES6 import 语句
    const importPattern = /import\s+(?:[\w\s{},*]*\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      const importInfo = this.categorizeImport(importPath, filePath);
      if (importInfo) {
        dependencies.push(importInfo);
      }
    }

    // 匹配 CommonJS require
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requirePattern.exec(content)) !== null) {
      const requirePath = match[1];
      const importInfo = this.categorizeImport(requirePath, filePath);
      if (importInfo) {
        dependencies.push(importInfo);
      }
    }

    return dependencies;
  }

  /**
   * 从 ImportDeclaration 节点提取依赖信息
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} content - 文件内容
   * @returns {DependencyInfo|null} 依赖信息
   */
  extractImportFromNode(node, content) {
    try {
      const importPath = node.source.value;
      const importedSymbols = [];

      // 提取导入的符号
      if (node.specifiers) {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            importedSymbols.push(spec.imported.name || spec.local.name);
          } else if (spec.type === 'ImportDefaultSpecifier') {
            importedSymbols.push('default');
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            importedSymbols.push('*');
          }
        }
      }

      return this.categorizeImport(importPath, importedSymbols);
    } catch (error) {
      return null;
    }
  }

  /**
   * 从 require 调用节点提取依赖信息
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {string} content - 文件内容
   * @returns {DependencyInfo|null} 依赖信息
   */
  extractRequireFromNode(node, content) {
    try {
      const requirePath = node.arguments[0].value;
      const varName = node.parent && node.parent.type === 'VariableDeclarator'
        ? node.parent.id.name
        : 'unknown';

      return this.categorizeImport(requirePath, [varName]);
    } catch (error) {
      return null;
    }
  }

  /**
   * 分类导入（外部包/内部模块/内置模块）
   *
   * @private
   * @param {string} importPath - 导入路径
   * @param {string[]} [importedSymbols] - 导入的符号
   * @returns {DependencyInfo} 依赖信息
   */
  categorizeImport(importPath, importedSymbols = []) {
    let type = 'external';
    let packageName = importPath;

    // 检查是否为内置模块
    const baseName = importPath.split('/')[0];
    if (BUILTIN_MODULES.has(baseName)) {
      type = 'builtin';
      packageName = baseName;
    }
    // 检查是否为内部模块（相对路径或别名）
    else if (importPath.startsWith('.') || importPath.startsWith('/')) {
      type = 'internal';
      packageName = importPath;
    }
    // 处理 scoped packages (@org/package)
    else if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        packageName = `${parts[0]}/${parts[1]}`;
      }
    }
    // 普通包名，取第一个 / 之前的部分
    else {
      packageName = importPath.split('/')[0];
    }

    return {
      name: packageName,
      type,
      importedSymbols,
      sourceFiles: [],
      recommendedVersion: PACKAGE_VERSIONS[packageName] || null
    };
  }

  /**
   * 检测缺失的包
   *
   * @private
   * @param {DependencyInfo[]} externalDeps - 外部包依赖列表
   * @returns {Promise<string[]>} 缺失的包列表
   */
  async detectMissingPackages(externalDeps) {
    const missing = [];

    try {
      // 读取当前 package.json
      const packageJson = await this.readPackageJson();
      const allDeps = {
        ...(packageJson?.dependencies || {}),
        ...(packageJson?.devDependencies || {}),
        ...(packageJson?.peerDependencies || {})
      };

      for (const dep of externalDeps) {
        if (!allDeps[dep.name]) {
          missing.push(dep.name);
        }
      }
    } catch (error) {
      // package.json 不存在或解析失败
      return externalDeps.map(d => d.name);
    }

    return missing;
  }

  /**
   * 生成 package.json 更新建议
   *
   * @private
   * @param {DependencyInfo[]} externalDeps - 外部包依赖列表
   * @returns {Promise<Object>} 更新建议
   */
  async generatePackageJsonUpdates(externalDeps) {
    const updates = {
      dependencies: {},
      devDependencies: {}
    };

    for (const dep of externalDeps) {
      const version = dep.recommendedVersion || this.getRecommendedVersion(dep.name) || '^1.0.0';

      // 根据包类型判断放入 dependencies 还是 devDependencies
      if (this.isDevDependency(dep.name)) {
        updates.devDependencies[dep.name] = version;
      } else {
        updates.dependencies[dep.name] = version;
      }
    }

    return updates;
  }

  /**
   * 读取 package.json
   *
   * @private
   * @returns {Promise<Object|null>} package.json 内容
   */
  async readPackageJson() {
    try {
      const packageJsonPath = this.config.packageJsonPath || './package.json';
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`读取 package.json 失败：${error.message}`);
    }
    return null;
  }

  /**
   * 获取推荐版本
   *
   * @private
   * @param {string} packageName - 包名
   * @returns {string|null} 版本号
   */
  getRecommendedVersion(packageName) {
    return PACKAGE_VERSIONS[packageName] || null;
  }

  /**
   * 判断是否为开发依赖
   *
   * @private
   * @param {string} packageName - 包名
   * @returns {boolean} 是否为开发依赖
   */
  isDevDependency(packageName) {
    const devPatterns = [
      '@types/',
      'typescript',
      'eslint',
      'prettier',
      'jest',
      'mocha',
      'vitest',
      'vite',
      'webpack',
      'rollup',
      'babel',
      '@babel/',
      'ts-node',
      'nodemon'
    ];

    return devPatterns.some(pattern => packageName.includes(pattern) || packageName.startsWith(pattern));
  }

  /**
   * 获取解析器
   *
   * @private
   * @returns {Object|null} 解析器
   */
  getParser() {
    try {
      const parser = require('@babel/parser');
      return parser;
    } catch (e) {
      return null;
    }
  }

  /**
   * 遍历 AST
   *
   * @private
   * @param {Object} node - AST 节点
   * @param {Function} callback - 回调函数
   */
  traverseAST(node, callback) {
    if (!node || typeof node !== 'object') return;

    callback(node);

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          this.traverseAST(item, callback);
        }
      } else if (typeof value === 'object' && value !== null) {
        this.traverseAST(value, callback);
      }
    }
  }

  /**
   * 生成依赖报告（文本格式）
   *
   * @param {DependencyReport} report - 依赖报告
   * @returns {string} 文本报告
   */
  generateDependencyReport(report) {
    const lines = [
      '=== 依赖分析报告 ===',
      '',
      `外部包依赖 (${report.external.length}):`,
      ...report.external.map(d => `  - ${d.name} (${d.importedSymbols.join(', ')})`),
      '',
      `内部模块依赖 (${report.internal.length}):`,
      ...report.internal.map(d => `  - ${d.name}`),
      '',
      `内置模块依赖 (${report.builtin.length}):`,
      ...report.builtin.map(d => `  - ${d.name}`),
      '',
      `缺失的包 (${report.missingPackages.length}):`,
      ...(report.missingPackages.length > 0
        ? report.missingPackages.map(p => `  - ${p}`)
        : ['  无']),
      ''
    ];

    if (report.packageJsonUpdates) {
      lines.push('package.json 更新建议:');
      lines.push('  dependencies:');
      for (const [name, version] of Object.entries(report.packageJsonUpdates.dependencies || {})) {
        lines.push(`    "${name}": "${version}"`);
      }
      lines.push('  devDependencies:');
      for (const [name, version] of Object.entries(report.packageJsonUpdates.devDependencies || {})) {
        lines.push(`    "${name}": "${version}"`);
      }
    }

    lines.push('====================');

    return lines.join('\n');
  }
}

module.exports = { RuntimeDependencyManager, BUILTIN_MODULES };
