/**
 * @fileoverview PathResolver - 路径解析器
 *
 * 负责解析导入路径到实际文件路径
 * 支持相对路径、绝对路径、路径别名等
 */

const fs = require('fs');
const path = require('path');

/**
 * PathResolver - 路径解析器
 *
 * 解析导入规范到实际文件路径
 */
class PathResolver {
  /**
   * 创建路径解析器
   *
   * @param {Record<string, string>} [aliases] - 路径别名映射
   * @param {string} [baseUrl] - 基础路径
   */
  constructor(aliases = {}, baseUrl = '.') {
    /** @private @type {Record<string, string>} */
    this.aliases = { ...aliases };
    /** @private @type {string} */
    this.baseUrl = baseUrl;

    // 记录解析失败的路径
    /** @private @type {Array<{specifier: string, fromFile: string, timestamp: Date}>} */
    this.failedResolutions = [];
  }

  /**
   * 解析导入规范到实际文件路径
   *
   * @param {string} importSpecifier - 导入规范
   * @param {string} fromFilePath - 源文件路径
   * @returns {string|null} 解析后的文件路径
   */
  resolve(importSpecifier, fromFilePath) {
    // 参数验证：确保输入是有效的字符串
    if (typeof importSpecifier !== 'string' || !importSpecifier) {
      console.warn(`PathResolver.resolve() called with invalid importSpecifier:`, importSpecifier);
      return null;
    }

    if (typeof fromFilePath !== 'string' || !fromFilePath) {
      console.warn(`PathResolver.resolve() called with invalid fromFilePath:`, fromFilePath);
      return null;
    }

    // 1. 如果是相对路径（./ ../）
    if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
      return this.resolveRelativePath(importSpecifier, fromFilePath);
    }

    // 2. 如果是绝对路径或别名
    for (const [alias, aliasPath] of Object.entries(this.aliases)) {
      if (importSpecifier === alias || importSpecifier.startsWith(alias + '/')) {
        const resolved = importSpecifier.replace(alias, aliasPath);
        const normalizedPath = this.normalizePath(resolved);

        // 检查解析的路径是否存在，若不存在则尝试回退策略
        if (this.fileExists(normalizedPath)) {
          return normalizedPath;
        } else {
          console.warn(`Resolved path does not exist: ${normalizedPath}, trying fallback strategies`);
        }
      }
    }

    // 3. 模糊匹配回退策略
    const fuzzyMatchResult = this.fuzzyResolve(importSpecifier, fromFilePath);
    if (fuzzyMatchResult) {
      return fuzzyMatchResult;
    }

    // 4. 记录解析失败的路径
    this.recordFailedResolution(importSpecifier, fromFilePath);

    // 5. 默认处理（node_modules 等）
    return this.resolveDefault(importSpecifier);
  }

  /**
   * 检查文件是否存在
   *
   * @private
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否存在
   */
  fileExists(filePath) {
    try {
      return fs.statSync(filePath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * 解析相对路径
   *
   * @private
   * @param {string} specifier - 导入规范
   * @param {string} fromFile - 源文件路径
   * @returns {string} 解析后的路径
   */
  resolveRelativePath(specifier, fromFile) {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, specifier);
    return this.normalizePath(resolved);
  }

  /**
   * 标准化路径
   *
   * @private
   * @param {string} p - 路径
   * @returns {string} 标准化后的路径
   */
  normalizePath(p) {
    return path.posix.normalize(p).replace(/\\/g, '/');
  }

  /**
   * 模糊解析策略
   *
   * @private
   * @param {string} importSpecifier - 导入规范
   * @param {string} fromFilePath - 源文件路径
   * @returns {string|null} 解析后的路径
   */
  fuzzyResolve(importSpecifier, fromFilePath) {
    try {
      // 策略 1: 尝试添加常见的文件扩展名
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

      for (const ext of extensions) {
        const candidate = importSpecifier + ext;
        const resolvedCandidate = this.resolveRelativePath(candidate, fromFilePath);

        if (this.fileExists(resolvedCandidate)) {
          console.log(`Fuzzy matched import: ${importSpecifier} -> ${resolvedCandidate}`);
          return resolvedCandidate;
        }
      }

      // 策略 2: 查找具有 index.js/tsx/index.ts 等默认导出的目录
      const dirCandidate = importSpecifier;
      const indexPaths = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs'];

      for (const indexPath of indexPaths) {
        const potentialPath = path.join(dirCandidate, indexPath);
        const resolvedPath = this.resolveRelativePath(potentialPath, fromFilePath);

        if (this.fileExists(resolvedPath)) {
          console.log(`Fuzzy matched directory import: ${importSpecifier} -> ${resolvedPath}`);
          return resolvedPath;
        }
      }
    } catch (error) {
      console.warn(`Fuzzy resolution failed: ${error.message}`);
    }

    return null;
  }

  /**
   * 记录解析失败的路径
   *
   * @private
   * @param {string} importSpecifier - 导入规范
   * @param {string} fromFilePath - 源文件路径
   */
  recordFailedResolution(importSpecifier, fromFilePath) {
    this.failedResolutions.push({
      specifier: importSpecifier,
      fromFile: fromFilePath,
      timestamp: new Date()
    });

    // 判断是否为外部依赖（不包含 ./ 或 ../ 的相对路径）
    const isExternalDependency = !importSpecifier.startsWith('./') &&
                                  !importSpecifier.startsWith('../');

    // 外部依赖（如 react, axios 等）是预期的，仅记录调试信息
    // 内部依赖解析失败才输出警告
    if (isExternalDependency) {
      // 外部依赖 - 静默处理，不输出警告
      // 这些依赖将在目标项目中被正确解析
    } else {
      // 内部依赖 - 记录警告
      console.warn(`Failed to resolve internal import: ${importSpecifier} from ${fromFilePath}`);
    }

    // 限制记录数量以防止内存泄漏
    if (this.failedResolutions.length > 100) {
      this.failedResolutions.shift();
    }
  }

  /**
   * 获取失败解析记录
   *
   * @returns {Array<{specifier: string, fromFile: string, timestamp: Date}>} 失败记录副本
   */
  getFailedResolutions() {
    return [...this.failedResolutions];
  }

  /**
   * 清除失败解析记录
   */
  clearFailedResolutions() {
    this.failedResolutions = [];
  }

  /**
   * 从配置文件加载路径别名
   *
   * @param {Object} [config] - 配置
   */
  loadConfigAliases(config = {}) {
    this.loadTsConfigAliases(config.tsConfigPath);
    this.loadJsConfigAliases(config.jsConfigPath);
    this.loadPackageJsonExports(config.packageJsonPath);
  }

  /**
   * 从 tsconfig.json 加载路径别名
   *
   * @private
   * @param {string} [explicitPath] - 显式指定的配置文件路径
   */
  loadTsConfigAliases(explicitPath) {
    try {
      const tsConfigPath = explicitPath || this.findConfigFile(['tsconfig.json']);
      if (tsConfigPath) {
        const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
        if (tsConfig.compilerOptions && tsConfig.compilerOptions.paths) {
          const paths = tsConfig.compilerOptions.paths;
          const baseUrl = tsConfig.compilerOptions.baseUrl || '.';

          for (const [aliasPattern, aliasPaths] of Object.entries(paths)) {
            const aliasKey = aliasPattern.replace('/*', '');
            if (Array.isArray(aliasPaths) && aliasPaths.length > 0) {
              const aliasPath = aliasPaths[0].replace('/*', '');
              this.aliases[aliasKey] = path.resolve(
                path.dirname(tsConfigPath),
                baseUrl,
                aliasPath
              );
            } else if (typeof aliasPaths === 'string') {
              const aliasPath = aliasPaths.replace('/*', '');
              this.aliases[aliasKey] = path.resolve(
                path.dirname(tsConfigPath),
                baseUrl,
                aliasPath
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load tsconfig.json aliases: ${error.message}`);
    }
  }

  /**
   * 从 jsconfig.json 加载路径别名
   *
   * @private
   * @param {string} [explicitPath] - 显式指定的配置文件路径
   */
  loadJsConfigAliases(explicitPath) {
    try {
      const jsConfigPath = explicitPath || this.findConfigFile(['jsconfig.json']);
      if (jsConfigPath) {
        const jsConfig = JSON.parse(fs.readFileSync(jsConfigPath, 'utf8'));
        if (jsConfig.compilerOptions && jsConfig.compilerOptions.paths) {
          const paths = jsConfig.compilerOptions.paths;
          const baseUrl = jsConfig.compilerOptions.baseUrl || '.';

          for (const [aliasPattern, aliasPaths] of Object.entries(paths)) {
            const aliasKey = aliasPattern.replace('/*', '');
            if (Array.isArray(aliasPaths) && aliasPaths.length > 0) {
              const aliasPath = aliasPaths[0].replace('/*', '');
              this.aliases[aliasKey] = path.resolve(
                path.dirname(jsConfigPath),
                baseUrl,
                aliasPath
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load jsconfig.json aliases: ${error.message}`);
    }
  }

  /**
   * 从 package.json 加载导出/导入字段
   *
   * @private
   * @param {string} [explicitPath] - 显式指定的配置文件路径
   */
  loadPackageJsonExports(explicitPath) {
    try {
      const pkgPath = explicitPath || this.findConfigFile(['package.json']);
      if (pkgPath) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        // 处理 package.json 中的 exports 字段
        if (pkg.exports) {
          if (typeof pkg.exports === 'string') {
            this.aliases['.'] = path.resolve(path.dirname(pkgPath), pkg.exports);
          } else if (typeof pkg.exports === 'object') {
            for (const [key, value] of Object.entries(pkg.exports)) {
              if (key !== '.') {
                this.aliases[key] = path.resolve(path.dirname(pkgPath), value);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load package.json exports: ${error.message}`);
    }
  }

  /**
   * 查找配置文件
   *
   * @private
   * @param {string[]} names - 文件名列表
   * @returns {string|null} 配置文件路径
   */
  findConfigFile(names) {
    let currentDir = process.cwd();

    while (currentDir !== path.dirname(currentDir)) {
      for (const name of names) {
        const fullPath = path.join(currentDir, name);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * 默认解析逻辑
   *
   * @private
   * @param {string} specifier - 导入规范
   * @returns {string|null} 解析后的路径
   */
  resolveDefault(specifier) {
    // 默认返回原始规格符
    // 这可能是 node_modules 中的包或无法解析的模块
    return specifier;
  }

  /**
   * 获取所有路径别名
   *
   * @returns {Record<string, string>} 路径别名
   */
  getAliases() {
    return { ...this.aliases };
  }
}

module.exports = { PathResolver };
