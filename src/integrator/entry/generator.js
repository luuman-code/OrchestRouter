/**
 * @fileoverview EntryPointGenerator - 入口文件生成器
 *
 * 生成统一的入口文件，导出所有组件
 * 支持多种模块系统（ES6、CommonJS 等）
 */

const path = require('path');
const fs = require('fs');

/**
 * EntryPointConfig - 入口文件配置
 *
 * @typedef {Object} EntryPointConfig
 * @property {'filename'|'dirname'|'filepath'|Function} [exportNamingStrategy] - 导出命名策略
 * @property {'es6'|'commonjs'|'auto'} [moduleSystem] - 模块系统
 * @property {boolean} [autoDetectModuleSystem] - 是否自动检测模块系统
 * @property {Function} [customExportMapper] - 自定义导出映射器
 * @property {boolean} [includeDefaultExport] - 是否包含默认导出
 * @property {string} [basePath] - 基础路径
 * @property {'es6'|'commonjs'} [defaultModuleSystem] - 默认模块系统
 */

/**
 * ExportInfo - 导出信息
 *
 * @typedef {Object} ExportInfo
 * @property {string} exportName - 导出名称
 * @property {string} importPath - 导入路径
 * @property {boolean} [isDefault] - 是否为默认导出
 * @property {boolean} [isNamespace] - 是否为命名空间导出
 * @property {boolean} [hasNamedExports] - 是否有命名导出
 */

/**
 * ExportNamingStrategy - 导出命名策略
 *
 * @typedef {Object} ExportNamingStrategy
 * @property {string} name - 策略名称
 * @property {string} description - 策略描述
 * @property {Function} apply - 应用函数
 */

/**
 * EntryPointGenerator - 入口文件生成器
 *
 * 生成统一的入口文件，导出所有组件
 */
class EntryPointGenerator {
  /**
   * 创建入口文件生成器
   *
   * @param {EntryPointConfig} [config] - 配置
   */
  constructor(config) {
    // 如果用户显式指定了模块系统，直接使用用户的配置
    this.config = {
      moduleSystem: 'auto', // 默认为自动检测
      autoDetectModuleSystem: true,
      ...config
    };
  }

  /**
   * 生成入口文件（支持多种模块系统）
   *
   * @param {Map<string, CodeFile>} files - 文件列表
   * @param {'component'|'default'} [entryType] - 入口类型
   * @returns {CodeFile} 生成的入口文件
   */
  generateIndex(files, entryType) {
    // 设置全局变量供检测方法使用
    globalThis.allProjectFiles = files;

    // 使用改进的模块系统检测方法
    const moduleSystem = this.detectModuleSystem();

    // 根据检测到的模块系统生成相应的导出
    let exportStatements = [];
    for (const [filePath, file] of files.entries()) {
      const exportName = this.inferExportName(filePath, file);
      exportStatements.push({
        exportName,
        importPath: this.getRelativeImportPath(filePath),
        isDefault: file.hasDefaultExport
      });
    }

    let content;
    if (moduleSystem === 'es6') {
      content = this.generateES6Exports(exportStatements);
    } else {
      content = this.generateCommonJSExports(exportStatements);
    }

    return {
      path: entryType === 'component' ? './components/index.ts' : './index.ts',
      content,
      language: 'typescript',
      status: 'generated'
    };
  }

  /**
   * 从路径推断导出名称（支持多种推断策略）
   *
   * @param {string} path - 路径
   * @param {CodeFile} file - 文件
   * @returns {string} 导出的名称
   */
  inferExportName(filePath, file) {
    if (
      this.config.exportNamingStrategy &&
      typeof this.config.exportNamingStrategy === 'function'
    ) {
      return this.config.exportNamingStrategy(filePath, file);
    }

    // 默认使用文件名策略
    const basename = path.basename(filePath, path.extname(filePath));

    // 转换为 PascalCase
    return basename
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * 根据项目配置自动检测模块系统 - 改进版
   *
   * @param {string} [projectRoot] - 项目根目录
   * @returns {'es6'|'commonjs'} 模块系统
   */
  detectModuleSystem(projectRoot) {
    // 1. 首先检查用户是否在配置中显式指定了模块系统
    if (
      this.config.moduleSystem &&
      this.config.moduleSystem !== 'auto'
    ) {
      return this.config.moduleSystem;
    }

    // 2. 检查项目根目录是否有 package.json 并查看其 type 字段
    const packageJsonPath = projectRoot
      ? path.join(projectRoot, 'package.json')
      : './package.json';

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        );

        // 如果 package.json 中有 type 字段，则根据其值返回模块系统
        if (packageJson.type === 'module') {
          return 'es6';
        } else if (packageJson.type === 'commonjs') {
          return 'commonjs';
        }
        // 如果没有 type 字段，继续尝试其他检测方法
      } catch (error) {
        console.warn(`无法解析 package.json 文件：${error.message}`);
        // 继续尝试其他检测方法
      }
    }

    // 3. 增加备选检测方法：分析现有文件中的导入语句风格
    if (this.config.autoDetectModuleSystem) {
      return this.inferModuleSystemFromContent(
        globalThis.allProjectFiles || new Map()
      );
    }

    // 4. 检查项目中是否包含特定的配置文件来推断模块系统
    const configBasedResult = this.inferModuleSystemFromConfig(projectRoot);
    if (configBasedResult) {
      return configBasedResult;
    }

    // 5. 默认返回 CommonJS（更广泛兼容）或者根据配置选择默认值
    return this.getDefaultModuleSystem();
  }

  /**
   * 根据配置返回默认模块系统
   *
   * @private
   * @returns {'es6'|'commonjs'} 默认模块系统
   */
  getDefaultModuleSystem() {
    // 如果配置中有默认模块系统，使用它
    if (this.config.defaultModuleSystem) {
      return this.config.defaultModuleSystem;
    }
    // 否则，默认为 CommonJS（更兼容）
    return 'commonjs';
  }

  /**
   * 分析项目中现有文件的导入语句风格以推断模块系统
   *
   * @private
   * @param {Map<string, CodeFile>} files - 文件列表
   * @returns {'es6'|'commonjs'} 模块系统
   */
  inferModuleSystemFromContent(files) {
    if (files.size === 0) {
      return this.getDefaultModuleSystem();
    }

    const es6Indicators = ['import ', ' from ', 'export '];
    const cjsIndicators = ['require(', 'module.exports', 'exports.'];

    let es6Score = 0;
    let cjsScore = 0;

    for (const [, file] of files.entries()) {
      const content = file.content.toLowerCase();

      for (const indicator of es6Indicators) {
        if (content.includes(indicator)) {
          es6Score++;
        }
      }

      for (const indicator of cjsIndicators) {
        if (content.includes(indicator)) {
          cjsScore++;
        }
      }
    }

    if (es6Score > cjsScore) {
      return 'es6';
    } else if (cjsScore > es6Score) {
      return 'commonjs';
    }

    // 如果分数相等，返回默认值
    return this.getDefaultModuleSystem();
  }

  /**
   * 检查特定配置文件以推断模块系统
   *
   * @private
   * @param {string} [projectRoot] - 项目根目录
   * @returns {'es6'|'commonjs'|null} 模块系统
   */
  inferModuleSystemFromConfig(projectRoot) {
    const fs = require('fs');

    const configFileChecks = [
      {
        file: 'tsconfig.json',
        condition: (content) =>
          content.includes('"module": "ES2020"') ||
          content.includes('"module": "ESNext"'),
        result: 'es6'
      },
      {
        file: 'babel.config.js',
        condition: (content) => content.includes('modules: false'),
        result: 'es6'
      },
      {
        file: '.babelrc',
        condition: (content) => content.includes('modules: false'),
        result: 'es6'
      },
      {
        file: 'webpack.config.js',
        condition: (content) => content.includes('target: "node"'),
        result: 'commonjs'
      }
    ];

    const checkDir = projectRoot || process.cwd();
    for (const check of configFileChecks) {
      const configPath = path.join(checkDir, check.file);
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, 'utf8');
          if (check.condition(configContent)) {
            return check.result;
          }
        } catch (error) {
          // 忽略配置文件读取错误
        }
      }
    }

    return null; // 没有从配置文件中得出结论
  }

  /**
   * 获取相对于入口文件的导入路径
   *
   * @private
   * @param {string} filePath - 文件路径
   * @returns {string} 相对导入路径
   */
  getRelativeImportPath(filePath) {
    // 确保路径格式正确
    let normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.startsWith('./')) {
      normalizedPath = normalizedPath.substring(2);
    }

    // 移除文件扩展名（保留给编译器处理）
    const ext = path.extname(normalizedPath);
    if (ext) {
      normalizedPath = normalizedPath.substring(0, normalizedPath.length - ext.length);
    }

    return `./${normalizedPath}`;
  }

  /**
   * 生成 ES6 导出语句
   *
   * @param {ExportInfo[]} exports - 导出信息列表
   * @returns {string} 导出语句
   */
  generateES6Exports(exports) {
    const statements = [];

    for (const exp of exports) {
      if (exp.isDefault) {
        statements.push(
          `export { default as ${exp.exportName} } from '${exp.importPath}';`
        );
      } else {
        statements.push(`export * from '${exp.importPath}';`);
        // 如果需要命名导出，可以使用下面的方式
        // statements.push(`export { ${exp.exportName} } from '${exp.importPath}';`);
      }
    }

    return statements.join('\n');
  }

  /**
   * 生成 CommonJS 导出语句
   *
   * @param {ExportInfo[]} exports - 导出信息列表
   * @returns {string} 导出语句
   */
  generateCommonJSExports(exports) {
    const statements = [];
    statements.push('const exportsMap = {};');

    for (const exp of exports) {
      if (exp.isDefault) {
        statements.push(
          `exportsMap['${exp.exportName}'] = require('${exp.importPath}').default;`
        );
      } else {
        statements.push(
          `Object.assign(exportsMap, require('${exp.importPath}'));`
        );
      }
    }

    statements.push('module.exports = exportsMap;');
    return statements.join('\n');
  }

  /**
   * 生成 UMD 导出语句
   *
   * @param {ExportInfo[]} exports - 导出信息列表
   * @returns {string} 导出语句
   */
  generateUMDExports(exports) {
    return `
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(${JSON.stringify(exports.map((e) => e.importPath))}, factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(${exports
      .map((e) => `require('${e.importPath}')`)
      .join(', ')});
  } else {
    root.returnExports = factory(${exports
      .map(() => 'root...' + (exports[0]?.exportName || ''))
      .join(', ')});
  }
}(typeof self !== 'undefined' ? self : this, function (${exports
      .map((e) => e.exportName)
      .join(', ')}) {
  return { ${exports.map((e) => e.exportName).join(', ')} };
}));
    `;
  }
}

// 预设的导出命名策略
const ExportNamingStrategies = {
  filename: {
    name: 'filename',
    description: '使用文件名作为导出名（去除扩展名）',
    apply: function (path, file) {
      const basename = require('path').basename(
        path,
        require('path').extname(path)
      );
      return this.pascalCase(basename);
    }
  },
  dirname: {
    name: 'dirname',
    description: '使用文件所在目录名作为导出名',
    apply: function (filePath, file) {
      const dirname = require('path').basename(
        require('path').dirname(filePath)
      );
      return this.pascalCase(dirname);
    }
  },
  filepath: {
    name: 'filepath',
    description: '使用完整路径（除扩展名外）作为导出名',
    apply: function (filePath, file) {
      const normalizedPath = filePath.replace(/\//g, '_').replace(/-/g, '_');
      return this.pascalCase(normalizedPath);
    }
  }
};

/**
 * 转换为 PascalCase
 *
 * @param {string} str - 字符串
 * @returns {string} PascalCase 字符串
 */
function pascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// 添加 pascalCase 方法到策略对象
for (const strategy of Object.values(ExportNamingStrategies)) {
  strategy.pascalCase = pascalCase;
}

module.exports = { EntryPointGenerator, ExportNamingStrategies };
