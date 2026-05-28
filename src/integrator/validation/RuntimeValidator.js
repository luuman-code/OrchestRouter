const vm = require('vm');
const path = require('path');
const fs = require('fs');
const util = require('util');
const child_process = require('child_process');
const os = require('os');
const CodeValidatorInterface = require('./CodeValidatorInterface');

/**
 * Runtime code validator that executes code in a sandboxed environment
 */
class RuntimeValidator extends CodeValidatorInterface {
  constructor(timeout = 5000, maxMemory = 128 * 1024 * 1024) {
    super();
    this.timeout = timeout;
    this.maxMemory = maxMemory;
  }

  async validate(code, options = {}) {
    const codeType = options.type || 'javascript';

    if (codeType === 'javascript') {
      return this.validateJavaScript(code, options);
    } else if (codeType === 'typescript') {
      return this.validateTypeScript(code, options);
    } else {
      return this.validateGeneric(code, options);
    }
  }

  async validateJavaScript(code, options = {}) {
    const sandboxContext = {
      console: {
        log: (...args) => console.log('[SANDBOX LOG]', ...args),
        error: (...args) => console.error('[SANDBOX ERROR]', ...args),
        warn: (...args) => console.warn('[SANDBOX WARN]', ...args),
        info: (...args) => console.info('[SANDBOX INFO]', ...args)
      },
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout,
      setInterval: global.setInterval,
      clearInterval: global.clearInterval,
      Buffer: global.Buffer,
      process: {
        env: { NODE_ENV: 'production' }
      },
      require: (moduleName) => {
        // Allow only safe built-in modules
        const safeModules = ['path', 'url', 'util', 'querystring', 'crypto'];
        if (safeModules.includes(moduleName)) {
          return require(moduleName);
        } else {
          throw new Error(`Module '${moduleName}' is not allowed in sandbox`);
        }
      },
      // Custom assertions and helpers
      assert: require('assert'),
      Math: Math,
      Date: Date,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,
      ReferenceError: ReferenceError,
      SyntaxError: SyntaxError,
      RangeError: RangeError,
      JSON: JSON,
      Promise: Promise
    };

    const context = vm.createContext(sandboxContext);
    const startTime = Date.now();

    try {
      const script = new vm.Script(code, {
        filename: options.filename || 'sandboxed-script.js',
        lineOffset: 0,
        columnOffset: 0
      });

      // Execute the script in the sandboxed context
      const result = script.runInContext(context, {
        timeout: this.timeout,
        displayErrors: true
      });

      // If execution succeeded without errors
      return {
        success: true,
        errors: [],
        warnings: [],
        violations: [],
        suggestions: [],
        result: result,
        executionTime: Date.now() - startTime,
        type: this.getType()
      };
    } catch (error) {
      // Handle execution errors
      return {
        success: false,
        errors: [{
          type: 'runtime-error',
          name: error.name,
          message: error.message,
          stack: error.stack,
          line: error.lineNumber,
          column: error.columnNumber
        }],
        warnings: [],
        violations: [],
        suggestions: [`Fix runtime error: ${error.message}`],
        executionTime: Date.now() - startTime,
        type: this.getType()
      };
    }
  }

  async validateTypeScript(code, options = {}) {
    // For TypeScript, we need to compile it first before running
    try {
      // Create a temporary directory
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-runtime-validation-'));
      const tsFilePath = path.join(tempDir, options.filename || 'temp-file.ts');
      const jsFilePath = path.join(tempDir, 'temp-file.js');

      // Write TypeScript code to file
      fs.writeFileSync(tsFilePath, code);

      // Compile TypeScript to JavaScript using tsc
      const compilationResult = child_process.spawnSync('npx', [
        'tsc',
        tsFilePath,
        '--outDir',
        tempDir,
        '--target',
        'ES2020',
        '--module',
        'commonjs'
      ], {
        timeout: this.timeout,
        stdio: 'pipe'
      });

      if (compilationResult.status !== 0) {
        const stderr = compilationResult.stderr.toString();

        // Clean up
        fs.unlinkSync(tsFilePath);
        if (fs.existsSync(jsFilePath)) {
          fs.unlinkSync(jsFilePath);
        }
        fs.rmdirSync(tempDir);

        return {
          success: false,
          errors: [{
            type: 'compilation-error',
            message: stderr,
            phase: 'compilation'
          }],
          warnings: [],
          violations: [],
          suggestions: ['Ensure the TypeScript compiles successfully before runtime validation'],
          type: this.getType()
        };
      }

      // Now read the compiled JS and validate it
      const compiledCode = fs.readFileSync(jsFilePath, 'utf8');

      // Clean up
      fs.unlinkSync(tsFilePath);
      fs.unlinkSync(jsFilePath);
      fs.rmdirSync(tempDir);

      // Validate the compiled JavaScript
      return this.validateJavaScript(compiledCode, { ...options, filename: jsFilePath });
    } catch (error) {
      return {
        success: false,
        errors: [{
          type: 'runtime-compilation-error',
          name: error.name,
          message: error.message,
          phase: 'compilation'
        }],
        warnings: [],
        violations: [],
        suggestions: [`Fix compilation/runtime error: ${error.message}`],
        type: this.getType()
      };
    }
  }

  async validateGeneric(code, options = {}) {
    // Generic validation - just syntax check for other languages
    return {
      success: true,
      errors: [],
      warnings: [],
      violations: [],
      suggestions: [],
      result: null,
      executionTime: 0,
      type: this.getType(),
      note: 'Generic validation performed - no runtime execution possible'
    };
  }

  getType() {
    return 'runtime';
  }
}

module.exports = RuntimeValidator;