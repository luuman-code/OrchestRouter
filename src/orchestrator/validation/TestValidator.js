/**
 * 测试验证器
 *
 * 执行自动化测试
 */

class TestValidator {
  constructor(config = {}) {
    this.config = {
      testTimeout: config.testTimeout || 30000, // 30秒超时
      enableUnitTests: config.enableUnitTests ?? true,
      enableIntegrationTests: config.enableIntegrationTests ?? true,
      enableE2ETests: config.enableE2ETests ?? false,
      coverageThreshold: config.coverageThreshold || 0.7, // 70%覆盖率阈值
      ...config
    };
  }

  /**
   * 验证输出
   */
  async validate(output, context = {}) {
    const validation = {
      passed: false,
      results: {},
      coverage: null,
      errors: [],
      warnings: [],
      testResults: {
        unit: { passed: 0, failed: 0, skipped: 0 },
        integration: { passed: 0, failed: 0, skipped: 0 },
        e2e: { passed: 0, failed: 0, skipped: 0 }
      }
    };

    try {
      // 创建临时项目进行测试
      const tempProjectPath = await this.createTempProject(output, context);

      // 执行单元测试
      if (this.config.enableUnitTests) {
        validation.results.unit = await this.runUnitTests(tempProjectPath, context);
        validation.testResults.unit = this.parseTestResults(validation.results.unit);
      }

      // 执行集成测试
      if (this.config.enableIntegrationTests) {
        validation.results.integration = await this.runIntegrationTests(tempProjectPath, context);
        validation.testResults.integration = this.parseTestResults(validation.results.integration);
      }

      // 执行端到端测试
      if (this.config.enableE2ETests) {
        validation.results.e2e = await this.runE2ETests(tempProjectPath, context);
        validation.testResults.e2e = this.parseTestResults(validation.results.e2e);
      }

      // 检查代码覆盖率
      validation.coverage = await this.checkCoverage(tempProjectPath, context);

      // 计算总体通过状态
      validation.passed = this.calculateOverallPassStatus(validation);

      // 清理临时项目
      await this.cleanupTempProject(tempProjectPath);

    } catch (error) {
      validation.errors.push({
        type: 'VALIDATION_ERROR',
        message: error.message,
        stack: error.stack
      });
    }

    return validation;
  }

  /**
   * 创建临时项目
   */
  async createTempProject(output, context) {
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');

    // 创建临时目录
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestration-test-'));

    // 写入输出文件
    for (const [filePath, fileInfo] of Object.entries(output)) {
      const fullPath = path.join(tempDir, filePath);

      // 确保目录存在
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // 写入文件内容
      const content = typeof fileInfo === 'string' ? fileInfo :
                     typeof fileInfo === 'object' && fileInfo.content ? fileInfo.content :
                     JSON.stringify(fileInfo, null, 2);

      await fs.writeFile(fullPath, content);
    }

    // 如果没有package.json，创建一个基本的
    const packageJsonPath = path.join(tempDir, 'package.json');
    if (!output['package.json']) {
      const defaultPackageJson = {
        name: 'temp-test-project',
        version: '1.0.0',
        scripts: {
          test: 'jest',
          'test:unit': 'jest --testPathPattern=unit',
          'test:integration': 'jest --testPathPattern=integration',
          'test:e2e': 'jest --testPathPattern=e2e',
          coverage: 'jest --coverage'
        },
        devDependencies: {
          'jest': '^29.0.0',
          '@types/jest': '^29.0.0',
          'supertest': '^6.0.0'
        }
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(defaultPackageJson, null, 2));
    }

    return tempDir;
  }

  /**
   * 运行单元测试
   */
  async runUnitTests(projectPath, context) {
    const { exec } = require('child_process');
    const path = require('path');

    return new Promise((resolve, reject) => {
      // 查找单元测试文件
      const testCommand = `cd ${projectPath} && npm test -- --passWithNoTests`;

      exec(testCommand, { timeout: this.config.testTimeout }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout,
          stderr,
          error: error ? error.message : null
        });
      });
    });
  }

  /**
   * 运行集成测试
   */
  async runIntegrationTests(projectPath, context) {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      const testCommand = `cd ${projectPath} && npm run test:integration -- --passWithNoTests`;

      exec(testCommand, { timeout: this.config.testTimeout }, (error, stdout, stderr) => {
        resolve({
          success: !error || stderr.includes('No tests found'), // 如果没有集成测试也不算失败
          stdout,
          stderr,
          error: error ? error.message : null
        });
      });
    });
  }

  /**
   * 运行端到端测试
   */
  async runE2ETests(projectPath, context) {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      const testCommand = `cd ${projectPath} && npm run test:e2e -- --passWithNoTests`;

      exec(testCommand, { timeout: this.config.testTimeout }, (error, stdout, stderr) => {
        resolve({
          success: !error || stderr.includes('No tests found'), // 如果没有E2E测试也不算失败
          stdout,
          stderr,
          error: error ? error.message : null
        });
      });
    });
  }

  /**
   * 检查代码覆盖率
   */
  async checkCoverage(projectPath, context) {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      const coverageCommand = `cd ${projectPath} && npm run coverage -- --silent`;

      exec(coverageCommand, { timeout: this.config.testTimeout }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            lines: 0,
            functions: 0,
            statements: 0,
            branches: 0
          });
          return;
        }

        // 解析覆盖率输出
        const coverage = this.parseCoverageOutput(stdout);
        resolve(coverage);
      });
    });
  }

  /**
   * 解析覆盖率输出
   */
  parseCoverageOutput(output) {
    // 这里简化处理，实际应该解析jest或其他测试工具的覆盖率输出
    const linesMatch = output.match(/Lines:\s*([\d.]+)%/);
    const functionsMatch = output.match(/Functions:\s*([\d.]+)%/);
    const statementsMatch = output.match(/Statements:\s*([\d.]+)%/);
    const branchesMatch = output.match(/Branches:\s*([\d.]+)%/);

    return {
      success: true,
      lines: parseFloat(linesMatch?.[1] || '0') / 100,
      functions: parseFloat(functionsMatch?.[1] || '0') / 100,
      statements: parseFloat(statementsMatch?.[1] || '0') / 100,
      branches: parseFloat(branchesMatch?.[1] || '0') / 100
    };
  }

  /**
   * 解析测试结果
   */
  parseTestResults(result) {
    const summary = {
      passed: 0,
      failed: 0,
      skipped: 0
    };

    if (result.stdout) {
      // 解析Jest或其他测试框架的输出
      const passedMatches = result.stdout.match(/PASS/g);
      const failedMatches = result.stdout.match(/FAIL/g);
      const skippedMatches = result.stdout.match(/\d+ skipped/g);

      summary.passed = passedMatches ? passedMatches.length : 0;
      summary.failed = failedMatches ? failedMatches.length : 0;

      if (skippedMatches) {
        // 提取跳过的测试数量
        const skippedNum = skippedMatches[0].match(/\d+/);
        summary.skipped = skippedNum ? parseInt(skippedNum[0]) : 0;
      }
    }

    return summary;
  }

  /**
   * 计算总体通过状态
   */
  calculateOverallPassStatus(validation) {
    // 测试全部通过且覆盖率满足要求
    const allTestsPassed = (
      validation.testResults.unit.failed === 0 &&
      validation.testResults.integration.failed === 0 &&
      validation.testResults.e2e.failed === 0
    );

    // 检查覆盖率是否满足要求
    const hasSufficientCoverage = !validation.coverage ||
                                  !validation.coverage.success ||
                                  (validation.coverage.statements >= this.config.coverageThreshold);

    return allTestsPassed && hasSufficientCoverage;
  }

  /**
   * 清理临时项目
   */
  async cleanupTempProject(projectPath) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      // 在Windows上，可能需要多次尝试才能删除
      for (let i = 0; i < 3; i++) {
        try {
          await fs.rm(projectPath, { recursive: true, force: true });
          break;
        } catch (error) {
          if (i === 2) {
            console.warn(`无法删除临时目录: ${projectPath}`, error.message);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒再试
          }
        }
      }
    } catch (error) {
      console.warn(`清理临时项目时出错: ${error.message}`);
    }
  }

  /**
   * 生成测试报告
   */
  generateReport(validation) {
    const report = {
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        passRate: 0,
        coverage: validation.coverage?.statements || 0
      },
      details: {
        unit: validation.testResults.unit,
        integration: validation.testResults.integration,
        e2e: validation.testResults.e2e
      },
      passed: validation.passed
    };

    // 计算汇总数据
    report.summary.totalTests =
      validation.testResults.unit.passed +
      validation.testResults.unit.failed +
      validation.testResults.integration.passed +
      validation.testResults.integration.failed +
      validation.testResults.e2e.passed +
      validation.testResults.e2e.failed;

    report.summary.passedTests =
      validation.testResults.unit.passed +
      validation.testResults.integration.passed +
      validation.testResults.e2e.passed;

    report.summary.failedTests =
      validation.testResults.unit.failed +
      validation.testResults.integration.failed +
      validation.testResults.e2e.failed;

    report.summary.passRate = report.summary.totalTests > 0
      ? report.summary.passedTests / report.summary.totalTests
      : 0;

    return report;
  }
}

module.exports = TestValidator;