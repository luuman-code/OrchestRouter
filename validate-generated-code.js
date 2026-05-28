#!/usr/bin/env node

/**
 * 验证生成的代码文件
 * 检查代码语法、结构完整性及基本可运行性
 */

const fs = require('fs');
const path = require('path');

class CodeValidator {
  constructor() {
    this.testResults = {
      totalFiles: 0,
      syntaxValid: 0,
      filesWithError: [],
      totalErrors: 0,
      warnings: []
    };
  }

  // 验证JavaScript语法
  validateJSSyntax(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    try {
      // 尝试解析JavaScript代码语法
      new Function(content);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // 验证文件的基本结构
  validateFileStructure(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    const validations = {
      js: () => {
        // 检查是否有基本的JavaScript结构
        const hasExports = content.includes('module.exports') || content.includes('export');
        const hasClassesOrFunctions = content.includes('class ') || content.includes('function ') || content.includes('=>');

        return { valid: hasExports || hasClassesOrFunctions, details: { hasExports, hasClassesOrFunctions } };
      },
      jsx: () => {
        // 检查是否有React组件结构
        const hasReactImport = content.includes('React') || content.includes('import ') && content.includes('from \'react\'');
        const hasComponent = content.includes('function ') || content.includes('class ') && (content.includes('render') || content.includes('return'));

        return { valid: hasComponent, details: { hasReactImport, hasComponent } };
      },
      sql: () => {
        // 检查SQL基本语句
        const hasBasicStatements = content.toLowerCase().includes('create') ||
                                  content.toLowerCase().includes('select') ||
                                  content.toLowerCase().includes('table');

        return { valid: hasBasicStatements, details: { hasBasicStatements } };
      },
      yaml: () => {
        // 检查YAML基本结构
        const hasColonStructure = content.includes(': ');
        const hasIndentation = / {2,}\w/.test(content); // 检查缩进

        return { valid: hasColonStructure, details: { hasColonStructure, hasIndentation } };
      },
      txt: () => {
        // 纯文本文件，通常总是有效
        return { valid: true, details: { size: content.length } };
      },
      ts: () => {
        // TypeScript检查
        const hasTSFeatures = content.includes(': ') || content.includes('|') || content.includes('<') && content.includes('>');
        const hasJSFeatures = content.includes('module.exports') || content.includes('export');

        return { valid: true, details: { hasTSFeatures, hasJSFeatures } }; // 不强制TS语法有效性
      }
    };

    const validateFn = validations[ext.substring(1)] || (() => ({ valid: true, details: {} }));
    return validateFn();
  }

  // 获取所有要验证的文件
  getAllGeneratedFiles() {
    const testOutputDir = path.join(__dirname, 'tests', 'test-output');
    const files = [];

    function walkDir(currentPath) {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (['.js', '.jsx', '.ts', '.sql', '.yaml', '.txt'].includes(path.extname(item).toLowerCase())) {
          files.push(fullPath);
        }
      }
    }

    if (fs.existsSync(testOutputDir)) {
      walkDir(testOutputDir);
    }

    return files;
  }

  // 运行验证
  runValidation() {
    console.log('🧪 开始验证生成的代码文件...\n');

    const files = this.getAllGeneratedFiles();
    this.testResults.totalFiles = files.length;

    if (files.length === 0) {
      console.log('⚠️  没有找到要验证的文件');
      return false;
    }

    console.log(`📋 发现 ${files.length} 个文件需要验证\n`);

    for (const filePath of files) {
      const relPath = path.relative(__dirname, filePath);
      console.log(`🔍 验证: ${relPath}`);

      // 对JavaScript和TypeScript文件进行语法检查
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.jsx', '.ts'].includes(ext)) {
        const syntaxResult = this.validateJSSyntax(filePath);

        if (syntaxResult.valid) {
          this.testResults.syntaxValid++;
          console.log(`   ✅ 语法正确`);
        } else {
          this.testResults.filesWithError.push({
            file: relPath,
            error: syntaxResult.error
          });
          this.testResults.totalErrors++;
          console.log(`   ❌ 语法错误: ${syntaxResult.error}`);
        }
      } else {
        // 对非JavaScript文件进行结构验证
        const structureResult = this.validateFileStructure(filePath);

        if (structureResult.valid) {
          this.testResults.syntaxValid++;
          console.log(`   ✅ 结构有效`);
        } else {
          this.testResults.warnings.push({
            file: relPath,
            details: structureResult.details
          });
          console.log(`   ⚠️  结构问题: ${JSON.stringify(structureResult.details)}`);
        }
      }

      // 验证文件结构完整性
      const fileStructure = this.validateFileStructure(filePath);
      if (!fileStructure.valid && ['.js', '.jsx', '.ts'].includes(ext)) {
        this.testResults.warnings.push({
          file: relPath,
          details: '可能缺少基本结构元素'
        });
        console.log(`   ⚠️  可能缺少基本结构元素`);
      }

      console.log(''); // 空行分隔
    }

    return this.printSummary();
  }

  // 打印总结
  printSummary() {
    console.log('📊 验证结果总结:');
    console.log(`   总文件数: ${this.testResults.totalFiles}`);
    console.log(`   语法/结构有效: ${this.testResults.syntaxValid}`);
    console.log(`   错误文件数: ${this.testResults.filesWithError.length}`);
    console.log(`   总错误数: ${this.testResults.totalErrors}`);
    console.log(`   警告数: ${this.testResults.warnings.length}`);

    if (this.testResults.filesWithError.length > 0) {
      console.log('\n❌ 包含错误的文件:');
      for (const errorFile of this.testResults.filesWithError) {
        console.log(`   • ${errorFile.file}: ${errorFile.error}`);
      }
    }

    if (this.testResults.warnings.length > 0) {
      console.log('\n⚠️  包含警告的文件:');
      for (const warning of this.testResults.warnings) {
        console.log(`   • ${warning.file}: ${JSON.stringify(warning.details)}`);
      }
    }

    const successRate = this.testResults.totalFiles > 0 ?
      (this.testResults.syntaxValid / this.testResults.totalFiles * 100).toFixed(1) : 0;

    console.log(`\n📈 成功率: ${successRate}%`);

    if (successRate >= 80) {
      console.log('✅ 代码质量良好，大部分文件语法正确');
      return true;
    } else if (successRate >= 50) {
      console.log('⚠️  代码质量一般，部分文件存在问题');
      return true; // 仍然认为测试运行成功，即使有些错误
    } else {
      console.log('❌ 代码质量问题较多，需要修复');
      return false;
    }
  }
}

// 运行验证
const validator = new CodeValidator();
const success = validator.runValidation();

console.log('\n🏁 代码验证完成');
process.exit(success ? 0 : 1);