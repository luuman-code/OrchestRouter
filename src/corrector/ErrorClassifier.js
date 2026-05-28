/**
 * 错误分类器模块
 * 用于分析验证错误并将它们分类为简单、中等或复杂错误
 */
class ErrorClassifier {
  constructor(options = {}) {
    this.options = {
      // 简单错误定义（可以直接通过正则或AST转换修复）
      simpleErrorPatterns: [
        /missing.*brace/,
        /missing.*parenthes/i,
        /missing.*semicolon/,
        /unexpected token.*}/,
        /unexpected token.*\)/,
        /unexpected token.*;/,
        /Unexpected end of input/,
        /Unterminated string literal/,
        /Invalid regular expression/,
        /Unexpected identifier/,
      ],

      // 中等错误定义（需要理解上下文，但Corrector可以尝试修复）
      moderateErrorPatterns: [
        /Cannot find name/,
        /Property.*does not exist on type/,
        /Argument of type.*is not assignable to parameter of type/,
        /Type.*is not assignable to type/,
        /Cannot resolve.*import/,
        /Module.*was resolved to an untyped directory/,
        /Cannot use import statement outside a module/,
        /Unexpected import declaration in runtime/,
      ],

      // 复杂错误定义（需要AI模型重新生成代码）
      complexErrorPatterns: [
        /Maximum call stack size exceeded/,
        /Out of memory/,
        /Time limit exceeded/,
        /Algorithm complexity too high/,
        /Performance issue detected/,
        /Potential infinite loop/,
        /Deadlock detected/,
        /Race condition detected/,
      ],

      ...options
    };
  }

  /**
   * 分析验证结果并分类错误
   * @param {Object} validationResults - 验证结果对象
   * @returns {Array} 分类后的错误数组，每个错误包含type和severity
   */
  classifyErrors(validationResults) {
    if (!validationResults || !validationResults.errors) {
      return [];
    }

    return validationResults.errors.map(error => {
      const errorString = typeof error === 'string' ? error :
                         (error.message || error.description || JSON.stringify(error));

      const classification = this._classifySingleError(errorString, error);

      return {
        ...error,
        message: errorString,
        classification: classification.type,
        severity: classification.severity,
        canFixLocally: classification.canFixLocally,
        suggestedFix: classification.suggestedFix
      };
    });
  }

  /**
   * 分类单个错误
   * @private
   */
  _classifySingleError(errorString, errorObj = {}) {
    // 检查简单错误模式
    for (const pattern of this.options.simpleErrorPatterns) {
      if (pattern.test(errorString)) {
        return {
          type: 'simple',
          severity: 'low',
          canFixLocally: true,
          suggestedFix: this._getSimpleFix(errorString, errorObj)
        };
      }
    }

    // 检查中等错误模式
    for (const pattern of this.options.moderateErrorPatterns) {
      if (pattern.test(errorString)) {
        return {
          type: 'moderate',
          severity: 'medium',
          canFixLocally: true, // Corrector可以尝试修复，但如果失败则需要云端
          suggestedFix: this._getModerateFix(errorString, errorObj)
        };
      }
    }

    // 检查复杂错误模式
    for (const pattern of this.options.complexErrorPatterns) {
      if (pattern.test(errorString)) {
        return {
          type: 'complex',
          severity: 'high',
          canFixLocally: false, // 需要云端AI模型修复
          suggestedFix: this._getComplexFix(errorString, errorObj)
        };
      }
    }

    // 如果没有匹配到特定模式，根据错误来源判断
    if (errorObj.validator) {
      switch (errorObj.validator) {
        case 'eslint':
          // ESLint通常报告语法和风格问题（相对容易修复）
          return {
            type: 'moderate',
            severity: 'medium',
            canFixLocally: true,
            suggestedFix: this._getESLintFix(errorString, errorObj)
          };

        case 'typescript':
          // TypeScript错误可能涉及类型问题（中等到复杂）
          if (this._isSimpleTypeError(errorString)) {
            return {
              type: 'moderate',
              severity: 'medium',
              canFixLocally: true,
              suggestedFix: this._getTypeFix(errorString, errorObj)
            };
          } else {
            return {
              type: 'complex',
              severity: 'high',
              canFixLocally: false,
              suggestedFix: this._getTypeFix(errorString, errorObj)
            };
          }

        case 'runtime':
          // 运行时错误可能是复杂问题
          if (this._isSimpleRuntimeError(errorString)) {
            return {
              type: 'moderate',
              severity: 'medium',
              canFixLocally: true,
              suggestedFix: this._getRuntimeFix(errorString, errorObj)
            };
          } else {
            return {
              type: 'complex',
              severity: 'high',
              canFixLocally: false,
              suggestedFix: this._getRuntimeFix(errorString, errorObj)
            };
          }

        default:
          // 默认情况下假设是中等复杂度
          return {
            type: 'moderate',
            severity: 'medium',
            canFixLocally: true,
            suggestedFix: this._getDefaultFix(errorString, errorObj)
          };
      }
    }

    // 默认分类
    return {
      type: 'moderate',
      severity: 'medium',
      canFixLocally: true,
      suggestedFix: this._getDefaultFix(errorString, errorObj)
    };
  }

  /**
   * 获取简单错误的修复建议
   */
  _getSimpleFix(errorString, errorObj) {
    if (errorString.toLowerCase().includes('missing') && errorString.toLowerCase().includes('brace')) {
      return {
        type: 'syntax_fix',
        description: 'Missing closing brace - try to add the missing brace',
        priority: 'high'
      };
    }

    if (errorString.toLowerCase().includes('missing') && errorString.toLowerCase().includes('parenthes')) {
      return {
        type: 'syntax_fix',
        description: 'Missing parenthesis - try to add the missing parenthesis',
        priority: 'high'
      };
    }

    if (errorString.toLowerCase().includes('missing') && errorString.toLowerCase().includes('semicolon')) {
      return {
        type: 'syntax_fix',
        description: 'Missing semicolon - add semicolon at the end of the statement',
        priority: 'medium'
      };
    }

    if (errorString.includes('Unexpected end of input')) {
      return {
        type: 'syntax_fix',
        description: 'Unexpected end of input - check for unclosed brackets or parentheses',
        priority: 'high'
      };
    }

    return {
      type: 'general_fix',
      description: 'Syntax error detected - check for common syntax issues',
      priority: 'medium'
    };
  }

  /**
   * 获取中等错误的修复建议
   */
  _getModerateFix(errorString, errorObj) {
    if (errorString.includes('Cannot find name')) {
      return {
        type: 'import_fix',
        description: 'Variable or function not defined - check if it needs to be imported or declared',
        priority: 'high'
      };
    }

    if (errorString.includes('does not exist on type') || errorString.includes('is not assignable')) {
      return {
        type: 'type_fix',
        description: 'Type mismatch or property not found - check type definitions and interfaces',
        priority: 'medium'
      };
    }

    if (errorString.includes('Cannot resolve') && errorString.includes('import')) {
      return {
        type: 'import_path_fix',
        description: 'Import path not resolved - check import statement path',
        priority: 'high'
      };
    }

    return {
      type: 'contextual_fix',
      description: 'Context-dependent error - requires understanding of code structure',
      priority: 'medium'
    };
  }

  /**
   * 获取复杂错误的修复建议
   */
  _getComplexFix(errorString, errorObj) {
    return {
      type: 'algorithmic_fix',
      description: 'Complex algorithmic or performance issue - requires AI model to rewrite code',
      priority: 'critical',
      requiresCloudFix: true
    };
  }

  /**
   * 获取ESLint错误的修复建议
   */
  _getESLintFix(errorString, errorObj) {
    return {
      type: 'style_fix',
      description: 'Code style or minor syntax issue reported by ESLint',
      priority: 'low'
    };
  }

  /**
   * 获取TypeScript错误的修复建议
   */
  _getTypeFix(errorString, errorObj) {
    return {
      type: 'type_fix',
      description: 'TypeScript type checking error',
      priority: 'medium'
    };
  }

  /**
   * 获取运行时错误的修复建议
   */
  _getRuntimeFix(errorString, errorObj) {
    return {
      type: 'runtime_fix',
      description: 'Runtime execution error',
      priority: 'high'
    };
  }

  /**
   * 获取默认修复建议
   */
  _getDefaultFix(errorString, errorObj) {
    return {
      type: 'unknown_fix',
      description: 'Unknown error type - general investigation needed',
      priority: 'medium'
    };
  }

  /**
   * 检查是否为简单类型错误
   */
  _isSimpleTypeError(errorString) {
    return errorString.includes('is not assignable to type') &&
           errorString.includes('string') &&
           errorString.includes('number');
  }

  /**
   * 检查是否为简单运行时错误
   */
  _isSimpleRuntimeError(errorString) {
    return errorString.includes('ReferenceError') ||
           errorString.includes('TypeError') ||
           errorString.includes('not defined');
  }

  /**
   * 判断是否可以本地修复
   */
  canFixLocally(errors) {
    const classifiedErrors = Array.isArray(errors) ? errors : [errors];

    // 检查是否有复杂错误需要云端修复
    const hasComplexErrors = classifiedErrors.some(error =>
      error.classification === 'complex' || !error.canFixLocally
    );

    return !hasComplexErrors;
  }

  /**
   * 获取错误摘要
   */
  getErrorSummary(classifiedErrors) {
    const summary = {
      totalErrors: classifiedErrors.length,
      simpleErrors: 0,
      moderateErrors: 0,
      complexErrors: 0,
      canFixLocally: true,
      highestSeverity: 'low'
    };

    classifiedErrors.forEach(error => {
      switch (error.classification) {
        case 'simple':
          summary.simpleErrors++;
          break;
        case 'moderate':
          summary.moderateErrors++;
          break;
        case 'complex':
          summary.complexErrors++;
          summary.canFixLocally = false;
          break;
      }

      if (error.severity === 'high' && summary.highestSeverity !== 'critical') {
        summary.highestSeverity = 'high';
      } else if (error.severity === 'critical') {
        summary.highestSeverity = 'critical';
      }
    });

    return summary;
  }
}

module.exports = ErrorClassifier;