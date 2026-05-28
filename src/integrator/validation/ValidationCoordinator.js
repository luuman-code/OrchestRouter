const ESLintValidator = require('./ESLintValidator');
const TSCompilerValidator = require('./TSCompilerValidator');
const RuntimeValidator = require('./RuntimeValidator');

/**
 * Coordinates multiple validators and aggregates their results
 */
class ValidationCoordinator {
  constructor(options = {}) {
    this.validators = new Map();
    this.enabledValidators = new Set(['eslint', 'typescript', 'runtime']);

    // Initialize validators with optional configurations
    this.eslintValidator = new ESLintValidator(options.eslintConfigPath);
    this.tsCompilerValidator = new TSCompilerValidator(options.tsConfigPath);
    this.runtimeValidator = new RuntimeValidator(
      options.timeout || 5000,
      options.maxMemory || 128 * 1024 * 1024
    );

    // Register validators
    this.registerValidator('eslint', this.eslintValidator);
    this.registerValidator('typescript', this.tsCompilerValidator);
    this.registerValidator('runtime', this.runtimeValidator);
  }

  registerValidator(type, validator) {
    this.validators.set(type, validator);
  }

  setEnabledValidators(validatorTypes) {
    this.enabledValidators = new Set(validatorTypes);
  }

  async validate(code, options = {}) {
    const results = {};
    const errors = [];
    const warnings = [];
    const allSuggestions = [];

    // Determine code type if not specified
    const codeType = options.type || this.inferCodeType(code, options.filename);

    // Set code type in options for individual validators
    const validationOptions = { ...options, type: codeType };

    for (const [type, validator] of this.validators) {
      if (!this.enabledValidators.has(type)) {
        continue;
      }

      try {
        const validatorResult = await validator.validate(code, validationOptions);
        results[type] = validatorResult;

        if (!validatorResult.success) {
          errors.push(...validatorResult.errors);
        }

        warnings.push(...validatorResult.warnings);
        allSuggestions.push(...validatorResult.suggestions);
      } catch (error) {
        const errorResult = {
          success: false,
          errors: [{
            type: 'validation-error',
            validator: type,
            message: `Validator ${type} failed: ${error.message}`,
            error: error
          }],
          warnings: [],
          violations: [],
          suggestions: [],
          type: type
        };

        results[type] = errorResult;
        errors.push(...errorResult.errors);
      }
    }

    // Aggregate results
    const aggregatedResult = {
      success: errors.length === 0,
      results: results,
      errors: errors,
      warnings: warnings,
      suggestions: allSuggestions,
      summary: {
        totalValidators: this.enabledValidators.size,
        successfulValidators: Object.values(results).filter(r => r.success).length,
        failedValidators: Object.values(results).filter(r => !r.success).length,
        errorCount: errors.length,
        warningCount: warnings.length
      }
    };

    return aggregatedResult;
  }

  inferCodeType(code, filename) {
    if (filename) {
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        return 'typescript';
      } else if (filename.endsWith('.js') || filename.endsWith('.jsx')) {
        return 'javascript';
      }
    }

    // Try to infer from code content
    if (code.includes('import type') || code.includes('export type') ||
        code.includes(': ') || code.includes('interface ') || code.includes('enum ')) {
      return 'typescript';
    }

    return 'javascript';
  }

  /**
   * Generates a human-readable report of validation results
   */
  generateReport(validationResult) {
    const report = {
      header: 'Code Validation Report',
      timestamp: new Date().toISOString(),
      summary: validationResult.summary,
      details: {}
    };

    for (const [validatorType, result] of Object.entries(validationResult.results)) {
      report.details[validatorType] = {
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
        suggestions: result.suggestions
      };
    }

    return report;
  }
}

module.exports = ValidationCoordinator;