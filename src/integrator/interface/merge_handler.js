/**
 * @fileoverview MergeStrategyHandler - 合并策略处理器
 *
 * 实现多种合并策略：overwrite、append、merge、partition、rename
 */

/**
 * MergeStrategyHandler - 合并策略处理器
 *
 * 根据策略合并内容
 */
class MergeStrategyHandler {
  /**
   * 根据策略合并内容
   *
   * @static
   * @param {string} content1 - 内容 1
   * @param {string} content2 - 内容 2
   * @param {string} strategy - 策略
   * @param {Object} [constraints] - 约束条件
   * @returns {string} 合并后的内容
   */
  static mergeByStrategy(content1, content2, strategy, constraints) {
    switch (strategy) {
      case 'overwrite':
        return content2;
      case 'append':
        return content1 + content2;
      case 'merge':
        return this.mergeByRegion(content1, content2, constraints?.region);
      case 'partition':
        return this.partitionAndMerge(content1, content2, constraints?.regionConstraints);
      case 'rename':
        // 在不同文件中保存
        return content1; // 原内容
      default:
        return content1 + content2; // 默认追加
    }
  }

  /**
   * 按区域合并
   *
   * @static
   * @param {string} content1 - 内容 1
   * @param {string} content2 - 内容 2
   * @param {string} [region] - 区域
   * @param {Object} [regionConstraints] - 区域约束
   * @returns {string} 合并后的内容
   */
  static mergeByRegion(content1, content2, region, regionConstraints) {
    // 优先使用 regionConstraints 进行更精细的区域控制
    if (regionConstraints) {
      const { startMarker, endMarker, allowedContentTypes } = regionConstraints;

      if (startMarker && endMarker) {
        // 使用起始和结束标记进行查找替换
        // 增强容错性：支持多种标记格式变体
        const variants = this._getMarkerVariants(startMarker, endMarker);

        for (const { escapedStart, escapedEnd } of variants) {
          const regionPattern = new RegExp(
            `(${escapedStart})([\\s\\S]*?)(${escapedEnd})`,
            'gi'
          );

          const match = content1.match(regionPattern);
          if (match) {
            return content1.replace(regionPattern, `$1\n${content2}\n$3`);
          }
        }

        // 如果没有找到标记区域，则在文件末尾添加
        return content1 + `\n${startMarker}\n${content2}\n${endMarker}`;
      } else if (startMarker) {
        // 只有起始标记
        const variants = this._getSingleMarkerVariants(startMarker);

        for (const { escapedStart } of variants) {
          const regionPattern = new RegExp(
            `(${escapedStart})([\\s\\S]*?)(?=\\n[\\S]|$)`,
            'gi'
          );

          const match = content1.match(regionPattern);
          if (match) {
            return content1.replace(regionPattern, `$1\n${content2}\n`);
          }
        }

        // 如果没有找到标记，则在文件末尾添加
        return content1 + `\n${startMarker}\n${content2}`;
      }
    }

    // 回退到基于 region 名称的合并
    if (region) {
      // 支持多种注释格式：HTML、JS/TS、Python、CSS 等
      // 增强容错性：支持 MARKER:region 和 MARKER region 等多种格式
      const regionPattern = new RegExp(
        `(<!--\\s*${region}\\s*-->|\\/\\/\\s*${region}|\\/\\/\\s*MARKER:\\s*${region}|#\\s*${region}|\\/\\*\\s*${region}\\s*\\*\\/)([\\s\\S]*?)(?=<!--|\\/\\/|#|\\/\\*|$)`,
        'gi'
      );
      const match = content1.match(regionPattern);

      if (match) {
        // 替换匹配区域的内容
        return content1.replace(regionPattern, `$1\n${content2}\n`);
      } else {
        // 如果没有找到区域标记，则根据语言特性添加适当的区域标记
        const lang = this.detectLanguage(content1);
        switch (lang) {
          case 'javascript':
          case 'typescript':
            return content1 + `\n// ${region}\n${content2}\n// end ${region}`;
          case 'python':
            return content1 + `\n# ${region}\n${content2}\n# end ${region}`;
          case 'html':
          case 'xml':
            return content1 + `\n<!-- ${region} -->\n${content2}\n<!-- end ${region} -->`;
          case 'css':
            return content1 + `\n/* ${region} */\n${content2}\n/* end ${region} */`;
          default:
            return content1 + `\n/* ${region} */\n${content2}\n/* end ${region} */`;
        }
      }
    }

    // 如果都没有，则回退到简单追加
    return content1 + content2;
  }

  /**
   * 检测代码语言以便选择适当的注释格式
   *
   * @static
   * @param {string} content - 内容
   * @returns {string} 语言
   */
  static detectLanguage(content) {
    if (content.includes('</') && content.includes('>')) return 'html';
    if (content.includes('import ') && content.includes('from')) return 'javascript';
    if (content.includes('def ') || content.includes('#')) return 'python';
    if (content.includes('{') && content.includes('}')) return 'css';
    if (content.includes('function') || content.includes('=>')) return 'javascript';

    // 基于文件内容特征判断
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('//')) return 'javascript';
      if (line.trim().startsWith('#')) return 'python';
      if (line.trim().startsWith('/*')) return 'css';
      if (line.trim().startsWith('import') || line.trim().startsWith('export')) return 'javascript';
      if (line.trim().startsWith('def ') || line.trim().startsWith('class ')) return 'python';
    }

    return 'unknown';
  }

  /**
   * 获取标记变体（支持多种格式）
   * 增强标记匹配的容错性
   *
   * @static
   * @param {string} startMarker - 起始标记
   * @param {string} endMarker - 结束标记
   * @returns {Array} 标记变体数组
   * @private
   */
  static _getMarkerVariants(startMarker, endMarker) {
    const variants = [];

    // 原始标记
    variants.push({
      escapedStart: startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      escapedEnd: endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    });

    // 支持 MARKER:xxx 格式变体
    const startColoned = startMarker.replace(/MARKER:\s*/, 'MARKER:');
    const endColoned = endMarker.replace(/MARKER:\s*/, 'MARKER:');
    if (startColoned !== startMarker || endColoned !== endMarker) {
      variants.push({
        escapedStart: startColoned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        escapedEnd: endColoned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    // 支持 MARKER xxx 格式变体（无冒号）
    const startNoColon = startMarker.replace(/MARKER:\s*/, 'MARKER ');
    const endNoColon = endMarker.replace(/MARKER:\s*/, 'MARKER ');
    if (startNoColon !== startMarker || endNoColon !== endMarker) {
      variants.push({
        escapedStart: startNoColon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        escapedEnd: endNoColon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    // 支持 // MARKER:xxx 格式（添加 // 前缀）
    if (!startMarker.trim().startsWith('//') && !startMarker.trim().startsWith('/*')) {
      const startWithSlash = '// ' + startMarker.trim();
      const endWithSlash = '// ' + endMarker.trim();
      variants.push({
        escapedStart: startWithSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        escapedEnd: endWithSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    // 支持 /* MARKER:xxx */ 格式（添加 /* */ 包裹）
    if (!startMarker.trim().startsWith('//') && !startMarker.trim().startsWith('/*')) {
      const startWithBlock = '/* ' + startMarker.trim() + ' */';
      const endWithBlock = '/* ' + endMarker.trim() + ' */';
      variants.push({
        escapedStart: startWithBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        escapedEnd: endWithBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    return variants;
  }

  /**
   * 获取单标记变体（只有起始标记时）
   *
   * @static
   * @param {string} startMarker - 起始标记
   * @returns {Array} 标记变体数组
   * @private
   */
  static _getSingleMarkerVariants(startMarker) {
    const variants = [];

    // 原始标记
    variants.push({
      escapedStart: startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    });

    // 支持 MARKER:xxx 格式变体
    const startColoned = startMarker.replace(/MARKER:\s*/, 'MARKER:');
    if (startColoned !== startMarker) {
      variants.push({
        escapedStart: startColoned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    // 支持 MARKER xxx 格式变体（无冒号）
    const startNoColon = startMarker.replace(/MARKER:\s*/, 'MARKER ');
    if (startNoColon !== startMarker) {
      variants.push({
        escapedStart: startNoColon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    // 支持 // MARKER:xxx 格式
    if (!startMarker.trim().startsWith('//')) {
      const startWithSlash = '// ' + startMarker.trim();
      variants.push({
        escapedStart: startWithSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      });
    }

    return variants;
  }

  /**
   * 分区合并
   *
   * @static
   * @param {string} content1 - 内容 1
   * @param {string} content2 - 内容 2
   * @param {Object} [constraints] - 约束条件
   * @returns {string} 合并后的内容
   */
  static partitionAndMerge(content1, content2, constraints) {
    // 根据约束条件分区合并
    if (!constraints) return content1 + content2;

    // 检查内容是否满足约束条件
    if (constraints.allowedContentTypes) {
      // 验证内容类型
      const type1 = this.determineContentType(content1);
      const type2 = this.determineContentType(content2);

      if (
        constraints.allowedContentTypes.includes(type1) &&
        constraints.allowedContentTypes.includes(type2)
      ) {
        // 如果都允许，则按普通方式合并
        return content1 + content2;
      } else {
        // 否则返回 content1，表示 content2 不应该合并到此分区
        return content1;
      }
    }

    // 分区合并逻辑
    return content1 + content2;
  }

  /**
   * 确定内容类型
   *
   * @static
   * @param {string} content - 内容
   * @returns {string} 内容类型
   */
  static determineContentType(content) {
    if (content.includes('function') || content.includes('class')) {
      return 'function';
    } else if (content.includes('<') && content.includes('>')) {
      return 'markup';
    } else if (content.includes('import') || content.includes('export')) {
      return 'module';
    } else if (content.includes('{') && content.includes('}')) {
      return 'object';
    }
    return 'unknown';
  }

  /**
   * 处理多个内容的合并（用于 mergeGroupId）
   *
   * @static
   * @param {Object[]} contents - 内容列表（每个包含 {content, strategy, constraints}）
   * @returns {string} 合并后的内容
   */
  static mergeMultiple(contents) {
    if (contents.length === 0) return '';
    if (contents.length === 1) return contents[0].content;

    let result = contents[0].content;

    for (let i = 1; i < contents.length; i++) {
      const { content, strategy = 'overwrite', constraints } = contents[i];
      result = this.mergeByStrategy(result, content, strategy, constraints);
    }

    return result;
  }
}

module.exports = { MergeStrategyHandler };
