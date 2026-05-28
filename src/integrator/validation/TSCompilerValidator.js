const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CodeValidatorInterface = require('./CodeValidatorInterface');

/**
 * TypeScript compiler-based validator
 */
class TSCompilerValidator extends CodeValidatorInterface {
  constructor(tsConfigPath = null) {
    super();
    this.tsConfigPath = tsConfigPath;
  }

  async validate(code, options = {}) {
    try {
      // Prepare TypeScript configuration
      const tsConfig = await this.loadTSConfig();

      // Create a temporary file to hold the code for compilation
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-validation-'));
      const filename = options.filename || 'temp-file.ts';
      const filepath = path.join(tempDir, filename);

      // Write the code to a temporary file
      fs.writeFileSync(filepath, code);

      // Create TypeScript program
      const host = ts.createCompilerHost(tsConfig.options);

      // Override getSourceFile to use our temporary file content
      const originalGetSourceFile = host.getSourceFile;
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        if (fileName.includes(filename)) {
          const sourceText = fs.readFileSync(fileName, 'utf8');
          return ts.createSourceFile(fileName, sourceText, languageVersion, true);
        }
        return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      };

      // Create the program
      const program = ts.createProgram([filepath], tsConfig.options, host);

      // Get diagnostics
      const allDiagnostics = ts.getPreEmitDiagnostics(program);

      const errors = allDiagnostics.map(diagnostic => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

        let line, character;
        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line: l, character: ch } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          line = l + 1; // Convert to 1-based line numbers
          character = ch + 1; // Convert to 1-based column numbers
        }

        return {
          category: diagnostic.category, // 0: Warning, 1: Error, 2: Suggestion, 3: Message
          code: diagnostic.code,
          message: message,
          line: line,
          character: character,
          fileName: diagnostic.file ? path.basename(diagnostic.file.fileName) : filename
        };
      });

      // Clean up temporary file
      fs.unlinkSync(filepath);
      fs.rmdirSync(tempDir);

      const hasErrors = errors.some(error => error.category === 1); // Category 1 is error

      return {
        success: !hasErrors,
        errors: errors,
        warnings: errors.filter(err => err.category === 0),
        violations: errors.filter(err => err.category === 1),
        suggestions: this.generateSuggestions(errors),
        type: this.getType()
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          category: 1, // Error category
          code: 'compilation-error',
          message: `TypeScript compilation failed: ${error.message}`,
          line: 0,
          character: 0,
          fileName: options.filename || 'unknown'
        }],
        warnings: [],
        violations: [],
        suggestions: [],
        type: this.getType()
      };
    }
  }

  async loadTSConfig() {
    let compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      noImplicitAny: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true
    };

    if (this.tsConfigPath && fs.existsSync(this.tsConfigPath)) {
      try {
        const tsConfigContent = fs.readFileSync(this.tsConfigPath, 'utf8');
        const parsedConfig = ts.parseConfigFileTextToJson(this.tsConfigPath, tsConfigContent);

        if (parsedConfig.error) {
          console.warn(`Failed to parse tsconfig.json: ${parsedConfig.error.messageText}`);
        } else {
          const extendedConfig = ts.parseJsonConfigFileContent(
            parsedConfig.config,
            ts.sys,
            path.dirname(this.tsConfigPath)
          );

          if (!extendedConfig.errors || extendedConfig.errors.length === 0) {
            compilerOptions = extendedConfig.options;
          } else {
            console.warn(`TS config errors: ${extendedConfig.errors.map(e => e.messageText).join(', ')}`);
          }
        }
      } catch (err) {
        console.warn(`Could not load tsconfig from ${this.tsConfigPath}: ${err.message}`);
      }
    }

    return {
      options: compilerOptions,
      fileNames: []
    };
  }

  getType() {
    return 'typescript';
  }

  generateSuggestions(errors) {
    const suggestions = [];

    for (const error of errors) {
      if (error.code) {
        suggestions.push(`Review TypeScript compiler error TS${error.code} for "${error.message}"`);
      }
    }

    return suggestions;
  }
}

module.exports = TSCompilerValidator;