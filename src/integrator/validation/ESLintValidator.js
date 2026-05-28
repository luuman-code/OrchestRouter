const { ESLint } = require('eslint');
const eslintJs = require('@eslint/js');
const CodeValidatorInterface = require('./CodeValidatorInterface');

/**
 * ESLint-based code validator (flat config format for ESLint v9)
 */
class ESLintValidator extends CodeValidatorInterface {
  constructor(configPath = null) {
    super();
    this.configPath = configPath;
    // Set up ESLint options based on version
    const eslintOptions = {
      overrideConfigFile: configPath || true, // true = only use programmatic config, ignore external files
      fix: false, // We don't want to automatically fix
      cache: false, // Disable cache for consistent results
      errorOnUnmatchedPattern: false // Don't error if no matching files
    };

    // Only add overrideConfig if configPath is not provided (flat config format)
    if (!configPath) {
      eslintOptions.overrideConfig = [
        {
          languageOptions: {
            globals: {
              console: 'readonly',
              process: 'readonly',
              setTimeout: 'readonly',
              setInterval: 'readonly',
              clearTimeout: 'readonly',
              clearInterval: 'readonly',
              Buffer: 'readonly',
              require: 'readonly',
              module: 'readonly',
              __dirname: 'readonly',
              __filename: 'readonly',
              global: 'readonly'
            }
          }
        },
        {
          rules: {
            'no-console': 'off', // Allow console usage
            'no-unused-vars': 'warn', // Warn about unused vars
            'semi': ['error', 'always'], // Require semicolons
            'quotes': ['error', 'single'] // Require single quotes
          }
        },
        eslintJs.configs.recommended // Apply recommended rules
      ];
    }

    this.eslint = new ESLint(eslintOptions);
  }

  async validate(code, options = {}) {
    try {
      // Create a temporary file-like structure for linting
      const dummyFilename = options.filename || 'temp-file.js';

      // Use the lintText method to validate code directly
      const results = await this.eslint.lintText(code, { filePath: dummyFilename });

      const errors = [];
      let hasErrors = false;

      for (const result of results) {
        for (const message of result.messages) {
          const error = {
            ruleId: message.ruleId,
            severity: message.severity,
            message: message.message,
            line: message.line,
            column: message.column,
            endLine: message.endLine,
            endColumn: message.endColumn,
            source: message.source
          };

          // Consider warnings (severity 1) and errors (severity 2)
          if (message.severity >= 1) {
            errors.push(error);
            if (message.severity === 2) {
              hasErrors = true;
            }
          }
        }
      }

      return {
        success: errors.length === 0 && !hasErrors,
        errors: errors,
        warnings: errors.filter(err => err.severity === 1),
        violations: errors.filter(err => err.severity === 2),
        suggestions: this.generateSuggestions(errors),
        type: this.getType()
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          ruleId: 'eslint-error',
          severity: 2,
          message: `ESLint validation failed: ${error.message}`,
          line: 0,
          column: 0
        }],
        warnings: [],
        violations: [],
        suggestions: [],
        type: this.getType()
      };
    }
  }

  getType() {
    return 'eslint';
  }

  generateSuggestions(errors) {
    const suggestions = [];

    for (const error of errors) {
      if (error.ruleId) {
        suggestions.push(`Consider reviewing the "${error.ruleId}" rule in your ESLint configuration`);
      }
    }

    return suggestions;
  }
}

module.exports = ESLintValidator;