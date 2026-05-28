/**
 * @fileoverview PathNormalizer - 路径标准化器
 *
 * 与现有的路径解析器集成，统一文件路径格式
 * 验证路径存在性，自动修正大小写问题
 */

const path = require('path');
const fs = require('fs');
const { PathResolver } = require('../../integrator/dependency/path-resolver');

/**
 * PathNormalizationOptions - 路径标准化选项
 *
 * @typedef {Object} PathNormalizationOptions
 * @property {boolean} [validateExistence] - 是否验证路径存在性
 * @property {boolean} [caseSensitive] - 是否区分大小写
 * @property {string} [basePath] - 基础路径
 * @property {boolean} [normalizeSeparators] - 是否标准化分隔符
 * @property {boolean} [normalizeCase] - 是否标准化大小写
 * @property {boolean} [resolveSymlinks] - 是否解析符号链接
 */

/**
 * NormalizationResult - 标准化结果
 *
 * @typedef {Object} NormalizationResult
 * @property {string} normalizedPath - 标准化后的路径
 * @property {boolean} exists - 路径是否存在
 * @property {string} [originalPath] - 原始路径
 * @property {string} [error] - 错误信息
 * @property {Object} [stats] - 文件统计信息
 */

/**
 * PathNormalizer - 路径标准化器
 *
 * 标准化文件路径格式并验证路径
 */
class PathNormalizer {
  /**
   * 创建路径标准化器
   */
  constructor() {
    // 集成现有的 PathResolver
    this.pathResolver = new PathResolver();
  }

  /**
   * 标准化路径
   *
   * @param {string} inputPath - 输入路径
   * @param {PathNormalizationOptions} [options] - 标准化选项
   * @returns {Promise<NormalizationResult>} 标准化结果
   */
  async normalize(inputPath, options = {}) {
    if (!inputPath || typeof inputPath !== 'string') {
      return {
        normalizedPath: '',
        exists: false,
        originalPath: inputPath,
        error: 'Invalid path: path must be a non-empty string'
      };
    }

    const opts = {
      validateExistence: options.validateExistence !== false, // 默认验证存在性
      caseSensitive: options.caseSensitive ?? process.platform !== 'win32', // Windows 默认不区分大小写
      basePath: options.basePath || process.cwd(),
      normalizeSeparators: options.normalizeSeparators !== false, // 默认标准化分隔符
      normalizeCase: options.normalizeCase !== false, // 默认标准化大小写
      resolveSymlinks: options.resolveSymlinks !== false, // 默认解析符号链接
      ...options
    };

    try {
      // 1. 清理路径字符串
      let cleanedPath = this._cleanPath(inputPath);

      // 2. 标准化分隔符
      if (opts.normalizeSeparators) {
        cleanedPath = this._normalizeSeparators(cleanedPath);
      }

      // 3. 解析相对路径
      if (this._isRelativePath(cleanedPath)) {
        cleanedPath = path.resolve(opts.basePath, cleanedPath);
      }

      // 4. 规范化路径
      let normalizedPath = path.normalize(cleanedPath);

      // 5. 解析符号链接
      if (opts.resolveSymlinks) {
        try {
          normalizedPath = await this._resolveRealPath(normalizedPath);
        } catch (e) {
          // 如果解析符号链接失败，使用原路径
          this._log(`无法解析符号链接: ${e.message}`, 'warn');
        }
      }

      // 6. 标准化大小写（根据平台）
      if (opts.normalizeCase) {
        normalizedPath = this._normalizeCase(normalizedPath, opts.caseSensitive);
      }

      // 7. 验证路径存在性
      const exists = opts.validateExistence ? await this._pathExists(normalizedPath) : true;
      const stats = exists ? await this._getPathStats(normalizedPath) : null;

      return {
        normalizedPath,
        exists,
        originalPath: inputPath,
        stats,
        error: exists ? undefined : 'Path does not exist'
      };
    } catch (error) {
      return {
        normalizedPath: '',
        exists: false,
        originalPath: inputPath,
        error: error.message
      };
    }
  }

  /**
   * 批量标准化路径
   *
   * @param {string[]} inputPaths - 输入路径数组
   * @param {PathNormalizationOptions} [options] - 标准化选项
   * @returns {Promise<NormalizationResult[]>} 标准化结果数组
   */
  async normalizeBatch(inputPaths, options = {}) {
    if (!Array.isArray(inputPaths)) {
      throw new Error('Input paths must be an array');
    }

    const results = [];
    for (const inputPath of inputPaths) {
      results.push(await this.normalize(inputPath, options));
    }

    return results;
  }

  /**
   * 解析导入路径
   *
   * @param {string} importSpecifier - 导入规范
   * @param {string} fromFilePath - 源文件路径
   * @param {PathNormalizationOptions} [options] - 标准化选项
   * @returns {Promise<NormalizationResult>} 解析结果
   */
  async resolveImport(importSpecifier, fromFilePath, options = {}) {
    try {
      // 使用现有的 PathResolver 解析导入路径
      const resolvedPath = this.pathResolver.resolve(importSpecifier, fromFilePath);

      if (!resolvedPath) {
        return {
          normalizedPath: '',
          exists: false,
          originalPath: importSpecifier,
          error: 'Could not resolve import specifier'
        };
      }

      // 对解析后的路径进行标准化
      return await this.normalize(resolvedPath, options);
    } catch (error) {
      return {
        normalizedPath: '',
        exists: false,
        originalPath: importSpecifier,
        error: error.message
      };
    }
  }

  /**
   * 验证路径格式
   *
   * @param {string} inputPath - 输入路径
   * @returns {boolean} 是否为有效路径格式
   */
  static isValidPathFormat(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      return false;
    }

    // 检查是否包含非法字符
    const illegalChars = /[<>:"|?*]/;
    if (illegalChars.test(inputPath)) {
      return false;
    }

    // 检查路径长度
    if (inputPath.length > 4096) { // 大多数系统的路径长度限制
      return false;
    }

    // 检查路径是否包含路径遍历
    if (inputPath.includes('../') || inputPath.includes('..\\')) {
      return false;
    }

    return true;
  }

  /**
   * 生成路径的安全版本
   *
   * @param {string} inputPath - 输入路径
   * @param {Object} [options] - 选项
   * @param {boolean} [options.allowSpaces] - 是否允许空格
   * @param {boolean} [options.allowSpecialChars] - 是否允许特殊字符
   * @returns {string} 安全的路径版本
   */
  static makePathSafe(inputPath, options = {}) {
    if (!inputPath || typeof inputPath !== 'string') {
      return '';
    }

    let safePath = inputPath;

    // 移除或替换非法字符
    safePath = safePath.replace(/[<>:"|?*]/g, '_');

    // 处理文件名开头或结尾的特殊字符
    safePath = safePath.replace(/[\s.]+$/, ''); // 移除结尾的空格和点

    // 处理 Windows 特殊文件名
    const windowsReservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$/i;
    const pathSegments = safePath.split(/[\/\\]/);
    const processedSegments = pathSegments.map(segment => {
      if (windowsReservedNames.test(segment)) {
        return '_' + segment; // 添加前缀以避免冲突
      }
      return segment;
    });

    safePath = processedSegments.join('/');

    return safePath;
  }

  /**
   * 清理路径字符串
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {string} 清理后的路径
   */
  _cleanPath(inputPath) {
    // 移除首尾空白字符
    let cleaned = inputPath.trim();

    // 标准化连续的分隔符
    cleaned = cleaned.replace(/[\/\\]+/g, '/');

    return cleaned;
  }

  /**
   * 标准化路径分隔符
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {string} 标准化后的路径
   */
  _normalizeSeparators(inputPath) {
    // 统一使用 POSIX 分隔符
    return inputPath.replace(/[\/\\]+/g, path.posix.sep);
  }

  /**
   * 标准化路径大小写
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @param {boolean} caseSensitive - 是否区分大小写
   * @returns {string} 标准化后的路径
   */
  _normalizeCase(inputPath, caseSensitive) {
    if (caseSensitive) {
      return inputPath;
    }

    // 对于不区分大小写的系统，可以尝试查找实际存在的路径
    const segments = inputPath.split(path.sep);
    let resolvedPath = segments[0]; // 第一个片段通常是盘符或根目录

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue; // 跳过空段

      const parentPath = resolvedPath;
      try {
        const items = fs.readdirSync(parentPath);
        const matchedItem = items.find(item =>
          item.toLowerCase() === segment.toLowerCase()
        );

        if (matchedItem) {
          resolvedPath = path.join(resolvedPath, matchedItem);
        } else {
          // 如果找不到匹配项，使用原始名称
          resolvedPath = path.join(resolvedPath, segment);
        }
      } catch (e) {
        // 如果无法读取目录，使用原始名称
        resolvedPath = path.join(resolvedPath, segment);
      }
    }

    return resolvedPath;
  }

  /**
   * 检查是否为相对路径
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {boolean} 是否为相对路径
   */
  _isRelativePath(inputPath) {
    return !path.isAbsolute(inputPath) && !inputPath.startsWith('/');
  }

  /**
   * 检查路径是否存在
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {Promise<boolean>} 是否存在
   */
  async _pathExists(inputPath) {
    try {
      await fs.promises.access(inputPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取路径统计信息
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {Promise<Object>} 路径统计信息
   */
  async _getPathStats(inputPath) {
    try {
      const stats = await fs.promises.stat(inputPath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.ctime,
        atime: stats.atime,
        mode: stats.mode
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 解析真实路径（处理符号链接）
   *
   * @private
   * @param {string} inputPath - 输入路径
   * @returns {Promise<string>} 真实路径
   */
  async _resolveRealPath(inputPath) {
    try {
      return await fs.promises.realpath(inputPath);
    } catch (error) {
      // 如果无法解析，返回原始路径
      return inputPath;
    }
  }

  /**
   * 获取路径的扩展名（不区分大小写）
   *
   * @param {string} inputPath - 输入路径
   * @returns {string} 扩展名
   */
  static getExtension(inputPath) {
    if (!inputPath) return '';

    const parsed = path.parse(inputPath);
    return parsed.ext.toLowerCase();
  }

  /**
   * 获取路径的目录部分
   *
   * @param {string} inputPath - 输入路径
   * @returns {string} 目录路径
   */
  static getDirectory(inputPath) {
    if (!inputPath) return '';

    return path.dirname(inputPath);
  }

  /**
   * 获取路径的文件名部分
   *
   * @param {string} inputPath - 输入路径
   * @param {boolean} [withExtension=true] - 是否包含扩展名
   * @returns {string} 文件名
   */
  static getFilename(inputPath, withExtension = true) {
    if (!inputPath) return '';

    const parsed = path.parse(inputPath);
    return withExtension ? parsed.base : parsed.name;
  }

  /**
   * 标准化日志方法
   *
   * @private
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别
   */
  _log(message, level = 'info') {
    console.log(`[PathNormalizer] [${level.toUpperCase()}] ${message}`);
  }
}

module.exports = { PathNormalizer };