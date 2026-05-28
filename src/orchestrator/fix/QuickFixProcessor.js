/**
 * 快速修复处理器
 *
 * 处理 L1 层级的快速修复，直接调用 Claude Code 进行修复
 */

class QuickFixProcessor {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 2,
      timeout: config.timeout || 30000,
      claudeCodePath: config.claudeCodePath || 'claude',
      ...config
    };

    this.fixHistory = new Map();
  }

  /**
   * 执行快速修复
   */
  async executeFix(problem, context) {
    const fixRequest = this.buildFixRequest(problem, context);

    try {
      // 1. 调用 Claude Code
      const result = await this.callClaudeCode(fixRequest);

      // 2. 解析修复结果
      const parsedResult = this.parseFixResult(result);

      // 3. 应用修复
      const appliedResult = await this.applyFix(parsedResult, context);

      // 4. 验证修复
      const validation = await this.validateFix(appliedResult, problem);

      // 5. 记录历史
      this.recordFixHistory(problem, validation);

      return {
        success: validation.passed,
        appliedFix: appliedResult,
        validation,
        retries: 0
      };

    } catch (error) {
      // 重试逻辑
      return await this.retryFix(problem, context, error);
    }
  }

  /**
   * 构建修复请求
   */
  buildFixRequest(problem, context) {
    return {
      type: 'QUICK_FIX',
      instruction: this.generateFixInstruction(problem),
      files: context.affectedFiles,
      errorContext: {
        message: problem.message,
        stack: problem.stack,
        type: problem.type
      },
      constraints: {
        preserveExistingBehavior: true,
        minimalChanges: true,
        addComments: false
      }
    };
  }

  /**
   * 生成修复指令
   */
  generateFixInstruction(problem) {
    return `
请快速修复以下错误：

错误类型：${problem.type}
错误信息：${problem.message}
${problem.stack ? `堆栈信息：${problem.stack.split('\n').slice(0, 3).join('\n')}` : ''}
${problem.affectedFiles ? `影响文件：${problem.affectedFiles.join(', ')}` : ''}

要求：
1. 只修复导致该错误的具体代码
2. 保持其他代码不变
3. 修复后简要说明更改内容
`;
  }

  /**
   * 调用 Claude Code
   */
  async callClaudeCode(request) {
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    return new Promise((resolve, reject) => {
      // 创建临时文件保存请求
      const tempFile = path.join('/tmp', `fix_request_${Date.now()}.md`);
      fs.writeFileSync(tempFile, request.instruction);

      const command = `${this.config.claudeCodePath} --prompt "${request.instruction}"`;

      exec(command, {
        timeout: this.config.timeout,
        cwd: context.workingDirectory
      }, (error, stdout, stderr) => {
        // 清理临时文件
        fs.unlinkSync(tempFile);

        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * 解析修复结果
   */
  parseFixResult(result) {
    const output = result.stdout || '';

    // 提取代码更改
    const codeBlockMatch = output.match(/```(\w+)?\n([\s\S]*?)```/g);
    const changes = codeBlockMatch ? codeBlockMatch.map(block => {
      const lang = block.match(/```(\w+)/)?.[1];
      const code = block.replace(/```\w*\n/, '').replace(/```$/, '');
      return { lang, code };
    }) : [];

    // 提取修复说明
    const explanationMatch = output.match(/(修复说明 | 更改内容 | 说明)[:：]([\s\S]*)/i);
    const explanation = explanationMatch ? explanationMatch[2].trim() : '';

    return { changes, explanation, rawOutput: output };
  }

  /**
   * 应用修复
   */
  async applyFix(parsedResult, context) {
    const appliedFiles = [];

    for (const change of parsedResult.changes) {
      // 根据上下文确定目标文件
      const targetFile = this.determineTargetFile(change, context);

      if (targetFile) {
        // 应用更改
        const fs = require('fs').promises;
        await fs.writeFile(targetFile, change.code);
        appliedFiles.push(targetFile);
      }
    }

    return {
      appliedFiles,
      explanation: parsedResult.explanation,
      timestamp: new Date()
    };
  }

  /**
   * 验证修复
   */
  async validateFix(appliedResult, originalProblem) {
    // 运行相关测试验证修复
    const testResult = await this.runTargetedTests(appliedResult.appliedFiles);

    return {
      passed: testResult.success,
      testResults: testResult,
      message: testResult.success ? '修复验证通过' : '修复验证失败'
    };
  }

  /**
   * 运行针对性测试
   */
  async runTargetedTests(files) {
    const { exec } = require('child_process');

    // 找到相关的测试文件
    const testFiles = files.map(f => {
      const base = f.replace(/\.(js|ts)$/, '');
      return `${base}.test.js`;
    });

    return new Promise((resolve) => {
      exec(`npm test -- ${testFiles.join(' ')}`, {
        timeout: 10000
      }, (error, stdout) => {
        resolve({
          success: !error,
          output: stdout
        });
      });
    });
  }

  /**
   * 重试修复
   */
  async retryFix(problem, context, error) {
    let lastError = error;

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        // 调整请求后重试
        const adjustedProblem = {
          ...problem,
          retryCount: i + 1,
          previousAttemptError: error.message
        };

        return await this.executeFix(adjustedProblem, context);
      } catch (retryError) {
        lastError = retryError;
      }
    }

    return {
      success: false,
      error: lastError.message,
      retries: this.config.maxRetries
    };
  }

  /**
   * 记录修复历史
   */
  recordFixHistory(problem, result) {
    const key = `${problem.type}_${Date.now()}`;
    this.fixHistory.set(key, {
      problem,
      result,
      timestamp: new Date()
    });

    // 限制历史记录大小
    if (this.fixHistory.size > 100) {
      const firstKey = this.fixHistory.keys().next().value;
      this.fixHistory.delete(firstKey);
    }
  }

  /**
   * 获取修复统计
   */
  getFixStatistics() {
    let successCount = 0;
    const typeStats = {};

    for (const [, record] of this.fixHistory.entries()) {
      if (record.result.success) {
        successCount++;
      }

      const type = record.problem.type || 'UNKNOWN';
      if (!typeStats[type]) {
        typeStats[type] = { total: 0, success: 0 };
      }
      typeStats[type].total++;
      if (record.result.success) {
        typeStats[type].success++;
      }
    }

    return {
      totalFixes: this.fixHistory.size,
      successCount,
      successRate: this.fixHistory.size > 0
        ? successCount / this.fixHistory.size
        : 0,
      typeStats
    };
  }
}

module.exports = QuickFixProcessor;