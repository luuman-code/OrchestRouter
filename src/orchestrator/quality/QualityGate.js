/**
 * 质量门控
 *
 * 多维度质量评估
 */

class QualityGate {
  constructor(config = {}) {
    this.config = {
      thresholds: {
        qualityScore: config.thresholds?.qualityScore || 0.7,
        testPassRate: config.thresholds?.testPassRate || 0.8,
        codeCoverage: config.thresholds?.codeCoverage || 0.7,
        securityScore: config.thresholds?.securityScore || 0.8,
        performanceScore: config.thresholds?.performanceScore || 0.7
      },
      weights: {
        functionality: config.weights?.functionality || 0.25, // 稍微降低，但仍最重要
        reliability: config.weights?.reliability || 0.3,      // 提高可靠性权重
        usability: config.weights?.usability || 0.15,         // 保持不变
        efficiency: config.weights?.efficiency || 0.15,       // 保持不变
        maintainability: config.weights?.maintainability || 0.15, // 提高可维护性权重
        portability: config.weights?.portability || 0.05      // 保持较低权重
      },
      ...config
    };
  }

  /**
   * 评估输出质量
   */
  async evaluate(output, context = {}) {
    const evaluation = {
      overallScore: 0,
      details: {},
      passed: false,
      recommendations: [],
      failedDimensions: [],
      criticalIssues: []
    };

    // 1. 功能性评估
    evaluation.details.functionality = await this.evaluateFunctionality(output, context);

    // 2. 可靠性评估
    evaluation.details.reliability = await this.evaluateReliability(output, context);

    // 3. 可用性评估
    evaluation.details.usability = await this.evaluateUsability(output, context);

    // 4. 效率评估
    evaluation.details.efficiency = await this.evaluateEfficiency(output, context);

    // 5. 可维护性评估
    evaluation.details.maintainability = await this.evaluateMaintainability(output, context);

    // 6. 可移植性评估
    evaluation.details.portability = await this.evaluatePortability(output, context);

    // 计算整体质量得分
    evaluation.overallScore = this.calculateOverallScore(evaluation.details);

    // 识别关键问题
    evaluation.criticalIssues = this.identifyCriticalIssues(evaluation.details);

    // 生成建议
    evaluation.recommendations = this.generateRecommendations(evaluation);

    // 检查是否通过质量门控
    evaluation.passed = evaluation.overallScore >= this.config.thresholds.qualityScore;

    if (!evaluation.passed) {
      evaluation.failedDimensions = this.getFailedDimensions(evaluation.details);
    }

    return evaluation;
  }

  /**
   * 评估功能性
   */
  async evaluateFunctionality(output, context) {
    let score = 0;
    let issues = [];

    // 检查是否实现了请求的主要功能
    const requestedFeatures = context.requestedFeatures || [];
    const implementedFeatures = this.extractImplementedFeatures(output);

    if (requestedFeatures.length > 0) {
      const implementedCount = requestedFeatures.filter(feature =>
        implementedFeatures.some(impl => impl.toLowerCase().includes(feature.toLowerCase()))
      ).length;

      score = implementedCount / requestedFeatures.length;
    } else {
      // 如果没有明确的请求特征，检查输出的基本完整性
      score = this.checkOutputCompleteness(output);
    }

    // 检查功能正确性
    const correctnessIssues = this.checkFunctionalCorrectness(output);
    if (correctnessIssues.length > 0) {
      issues.push(...correctnessIssues);
      // 根据问题严重性降低分数
      const severityFactor = this.calculateSeverityFactor(correctnessIssues);
      score = score * severityFactor;
    }

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 评估可靠性
   */
  async evaluateReliability(output, context) {
    let score = 1.0; // 假设初始可靠
    const issues = [];

    // 检查错误处理
    const errorHandlingScore = this.checkErrorHandling(output);
    if (errorHandlingScore < 0.5) {
      issues.push({
        type: 'POOR_ERROR_HANDLING',
        severity: 'HIGH',
        description: '错误处理机制不足'
      });
    }
    score = Math.min(score, errorHandlingScore);

    // 检查异常情况处理
    const exceptionHandlingScore = this.checkExceptionHandling(output);
    if (exceptionHandlingScore < 0.5) {
      issues.push({
        type: 'POOR_EXCEPTION_HANDLING',
        severity: 'HIGH',
        description: '异常处理机制不足'
      });
    }
    score = Math.min(score, exceptionHandlingScore);

    // 检查边界条件处理
    const boundaryChecksScore = this.checkBoundaryConditions(output);
    if (boundaryChecksScore < 0.5) {
      issues.push({
        type: 'MISSING_BOUNDARY_CHECKS',
        severity: 'MEDIUM',
        description: '缺少边界条件检查'
      });
    }
    score = Math.min(score, boundaryChecksScore);

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 评估可用性
   */
  async evaluateUsability(output, context) {
    let score = 0.5; // 默认中等可用性
    const issues = [];

    // 检查代码可读性
    const readabilityScore = this.checkCodeReadability(output);
    score = Math.max(score, readabilityScore);

    // 检查注释质量
    const commentQualityScore = this.checkCommentQuality(output);
    score = Math.min(score, commentQualityScore);

    // 检查API易用性
    const apiUsabilityScore = this.checkApiUsability(output);
    score = Math.min(score, apiUsabilityScore);

    // 检查用户界面友好性（如果是前端）
    const uiFriendlinessScore = this.checkUiFriendliness(output);
    score = Math.min(score, uiFriendlinessScore);

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 评估效率
   */
  async evaluateEfficiency(output, context) {
    let score = 0.5;
    const issues = [];

    // 检查算法效率
    const algorithmEfficiencyScore = this.checkAlgorithmEfficiency(output);
    score = Math.min(score, algorithmEfficiencyScore);

    // 检查资源使用
    const resourceUsageScore = this.checkResourceUsage(output);
    score = Math.min(score, resourceUsageScore);

    // 检查性能优化
    const optimizationScore = this.checkPerformanceOptimization(output);
    score = Math.min(score, optimizationScore);

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 评估可维护性
   */
  async evaluateMaintainability(output, context) {
    let score = 0.5;
    const issues = [];

    // 检查代码结构
    const codeStructureScore = this.checkCodeStructure(output);
    score = Math.min(score, codeStructureScore);

    // 检查模块化程度
    const modularityScore = this.checkModularity(output);
    score = Math.min(score, modularityScore);

    // 检查命名规范
    const namingConventionScore = this.checkNamingConventions(output);
    score = Math.min(score, namingConventionScore);

    // 检查代码重复
    const duplicationScore = this.checkCodeDuplication(output);
    score = Math.min(score, duplicationScore);

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 评估可移植性
   */
  async evaluatePortability(output, context) {
    let score = 0.5;
    const issues = [];

    // 检查平台依赖
    const platformDependencyScore = this.checkPlatformDependencies(output);
    score = Math.min(score, platformDependencyScore);

    // 检查环境配置
    const envConfigScore = this.checkEnvironmentConfiguration(output);
    score = Math.min(score, envConfigScore);

    // 检查外部依赖管理
    const dependencyManagementScore = this.checkDependencyManagement(output);
    score = Math.min(score, dependencyManagementScore);

    return {
      score,
      issues,
      passed: score >= 0.7
    };
  }

  /**
   * 提取已实现的功能
   */
  extractImplementedFeatures(output) {
    const features = [];

    if (typeof output === 'object') {
      // 遍历输出中的文件和内容
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'object'
            ? JSON.stringify(fileInfo.content)
            : fileInfo.content.toString();

          // 查找常见的功能标识
          const functionMatches = content.match(/function\s+(\w+)/g);
          if (functionMatches) {
            functionMatches.forEach(match => {
              const funcName = match.replace('function ', '');
              features.push(funcName);
            });
          }

          // 查找类定义
          const classMatches = content.match(/class\s+(\w+)/g);
          if (classMatches) {
            classMatches.forEach(match => {
              const className = match.replace('class ', '');
              features.push(className);
            });
          }

          // 查找方法定义
          const methodMatches = content.match(/\w+\s*\([^)]*\)\s*{/g);
          if (methodMatches) {
            features.push(...methodMatches.slice(0, 10)); // 限制数量
          }
        }
      }
    }

    return [...new Set(features)]; // 去重
  }

  /**
   * 检查输出完整性
   */
  checkOutputCompleteness(output) {
    if (!output) return 0;

    if (typeof output === 'string') {
      return output.trim().length > 0 ? 1.0 : 0;
    }

    if (typeof output === 'object') {
      const entries = Object.entries(output);
      if (entries.length === 0) return 0;

      // 检查是否有有意义的内容
      let contentCount = 0;
      for (const [, value] of entries) {
        if (value && ((typeof value === 'string' && value.trim().length > 0) ||
                     (typeof value === 'object' && Object.keys(value).length > 0))) {
          contentCount++;
        }
      }

      return contentCount / entries.length;
    }

    return 0.5; // 其他类型给中等分数
  }

  /**
   * 检查功能正确性
   */
  checkFunctionalCorrectness(output) {
    const issues = [];

    if (typeof output === 'object') {
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查常见的不完整标记
          if (content.includes('// TODO:') || content.includes('// FIXME:') ||
              content.includes('// TO DO') || content.includes('XXX')) {
            issues.push({
              type: 'INCOMPLETE_IMPLEMENTATION',
              severity: 'MEDIUM',
              location: filePath,
              description: '发现未完成的实现标记'
            });
          }

          // 检查空函数体
          const emptyFunctions = content.match(/function\s+\w+\s*\([^)]*\)\s*{\s*}/g);
          if (emptyFunctions && emptyFunctions.length > 2) { // 如果超过2个空函数
            issues.push({
              type: 'EMPTY_FUNCTIONS',
              severity: 'HIGH',
              location: filePath,
              description: `发现 ${emptyFunctions.length} 个空函数实现`
            });
          }

          // 检查错误处理不足
          if (!content.toLowerCase().includes('try') && !content.toLowerCase().includes('catch') &&
              !content.toLowerCase().includes('error') && !content.toLowerCase().includes('throw')) {
            issues.push({
              type: 'MISSING_ERROR_HANDLING',
              severity: 'MEDIUM',
              location: filePath,
              description: '缺少错误处理机制'
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 计算严重性因子
   */
  calculateSeverityFactor(issues) {
    if (issues.length === 0) return 1.0;

    let totalImpact = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'CRITICAL':
          totalImpact += 0.8;
          break;
        case 'HIGH':
          totalImpact += 0.5;
          break;
        case 'MEDIUM':
          totalImpact += 0.2;
          break;
        case 'LOW':
          totalImpact += 0.05;
          break;
      }
    }

    // 最大影响为1.0，减少基础分数
    const avgImpact = totalImpact / issues.length;
    return Math.max(0, 1 - avgImpact);
  }

  /**
   * 检查错误处理
   */
  checkErrorHandling(output) {
    let foundErrorHandling = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          if (content.toLowerCase().includes('try') &&
              (content.toLowerCase().includes('catch') || content.toLowerCase().includes('finally'))) {
            foundErrorHandling = true;
            break;
          }

          if (content.toLowerCase().includes('error') || content.toLowerCase().includes('exception')) {
            foundErrorHandling = true;
            break;
          }
        }
      }
    }

    return foundErrorHandling ? 0.9 : 0.3;
  }

  /**
   * 检查异常处理
   */
  checkExceptionHandling(output) {
    let foundExceptionHandling = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          if (content.toLowerCase().includes('throw') || content.toLowerCase().includes('throws')) {
            foundExceptionHandling = true;
            break;
          }
        }
      }
    }

    return foundExceptionHandling ? 0.8 : 0.4;
  }

  /**
   * 检查边界条件
   */
  checkBoundaryConditions(output) {
    let foundBoundaryChecks = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          if (content.includes('< 0') || content.includes('>= 0') ||
              content.includes('=== null') || content.includes('=== undefined') ||
              content.includes('.length') || content.includes('size')) {
            foundBoundaryChecks = true;
            break;
          }
        }
      }
    }

    return foundBoundaryChecks ? 0.7 : 0.3;
  }

  /**
   * 检查代码可读性
   */
  checkCodeReadability(output) {
    let totalScore = 0;
    let fileCount = 0;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 简单的可读性检查
          let score = 0.5; // 基础分数

          // 检查缩进一致性
          const lines = content.split('\n');
          const indentedLines = lines.filter(line => line.match(/^\s+\S/)).length;
          if (indentedLines / lines.length > 0.5) {
            score += 0.2;
          }

          // 检查行长度（过长的行会影响可读性）
          const longLines = lines.filter(line => line.length > 120).length;
          if (longLines / lines.length < 0.1) { // 少于10%的行过长
            score += 0.1;
          }

          // 检查空白行使用
          const blankLines = lines.filter(line => line.trim() === '').length;
          if (blankLines > 0 && blankLines / lines.length < 0.3) { // 合理的空白行使用
            score += 0.1;
          }

          totalScore += Math.min(score, 1.0);
          fileCount++;
        }
      }
    }

    return fileCount > 0 ? totalScore / fileCount : 0.5;
  }

  /**
   * 检查注释质量
   */
  checkCommentQuality(output) {
    let totalScore = 0;
    let fileCount = 0;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          const commentRatio = this.calculateCommentRatio(content);

          // 评分标准：10-30%注释比例为理想范围
          if (commentRatio >= 0.1 && commentRatio <= 0.3) {
            totalScore += 0.9;
          } else if (commentRatio > 0.3 && commentRatio <= 0.5) {
            totalScore += 0.7; // 注释过多也影响可读性
          } else if (commentRatio > 0 && commentRatio < 0.1) {
            totalScore += 0.5; // 注释太少
          } else {
            totalScore += 0.2; // 几乎无注释
          }

          fileCount++;
        }
      }
    }

    return fileCount > 0 ? totalScore / fileCount : 0.2;
  }

  /**
   * 计算注释比例
   */
  calculateCommentRatio(content) {
    const lines = content.split('\n');
    const commentLines = lines.filter(line =>
      line.trim().startsWith('//') ||
      line.trim().startsWith('/*') ||
      line.trim().startsWith('*') ||
      line.trim().startsWith('*/')
    ).length;

    return lines.length > 0 ? commentLines / lines.length : 0;
  }

  /**
   * 检查API易用性
   */
  checkApiUsability(output) {
    // 检查是否有清晰的API接口定义
    let hasClearApis = false;

    if (typeof output === 'object') {
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (fileInfo.content && (filePath.endsWith('.js') || filePath.endsWith('.ts'))) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查是否有导出声明
          if (content.includes('export') || content.includes('module.exports')) {
            hasClearApis = true;
            break;
          }

          // 检查是否有函数/方法定义
          if (content.match(/function\s+\w+\s*\(/) || content.match(/\w+\s*=\s*\(/)) {
            hasClearApis = true;
            break;
          }
        }
      }
    }

    return hasClearApis ? 0.8 : 0.4;
  }

  /**
   * 检查用户界面友好性
   */
  checkUiFriendliness(output) {
    // 检查前端界面元素
    let hasUiElements = false;

    if (typeof output === 'object') {
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (fileInfo.content && (filePath.endsWith('.html') || filePath.endsWith('.jsx') || filePath.endsWith('.tsx'))) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查是否有UI相关的标签或组件
          if (content.match(/<(div|button|input|form|section|header|nav|footer)/) ||
              content.match(/className|style|props/)) {
            hasUiElements = true;
            break;
          }
        }
      }
    }

    return hasUiElements ? 0.7 : 0.5;
  }

  /**
   * 检查算法效率
   */
  checkAlgorithmEfficiency(output) {
    let efficiencyIndicators = 0;
    let totalChecks = 0;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查循环优化相关关键字
          totalChecks++;
          if (content.toLowerCase().includes('optimization') ||
              content.toLowerCase().includes('efficient') ||
              content.includes('O(')) { // 大O表示法
            efficiencyIndicators++;
          }
        }
      }
    }

    return totalChecks > 0 ? efficiencyIndicators / totalChecks : 0.3;
  }

  /**
   * 检查资源使用
   */
  checkResourceUsage(output) {
    let hasResourceManagement = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查资源管理相关关键字
          if (content.toLowerCase().includes('close') ||
              content.toLowerCase().includes('dispose') ||
              content.toLowerCase().includes('cleanup') ||
              content.toLowerCase().includes('memory') ||
              content.toLowerCase().includes('resource')) {
            hasResourceManagement = true;
            break;
          }
        }
      }
    }

    return hasResourceManagement ? 0.7 : 0.4;
  }

  /**
   * 检查性能优化
   */
  checkPerformanceOptimization(output) {
    let hasOptimization = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查性能优化相关关键字
          if (content.toLowerCase().includes('cache') ||
              content.toLowerCase().includes('memoiz') || // memoize/memoization
              content.toLowerCase().includes('debounc') || // debounce/debouncing
              content.toLowerCase().includes('throttle') ||
              content.toLowerCase().includes('optimize')) {
            hasOptimization = true;
            break;
          }
        }
      }
    }

    return hasOptimization ? 0.8 : 0.3;
  }

  /**
   * 检查代码结构
   */
  checkCodeStructure(output) {
    let hasGoodStructure = false;

    if (typeof output === 'object') {
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (fileInfo.content && (filePath.endsWith('.js') || filePath.endsWith('.ts'))) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查代码组织结构
          const importCount = (content.match(/^import\s+|require\(/gm) || []).length;
          const functionCount = (content.match(/function\s+\w+/g) || []).length;
          const classCount = (content.match(/class\s+\w+/g) || []).length;

          // 如果有适当的模块导入和清晰的函数/类定义，则认为结构良好
          if (importCount > 0 && (functionCount > 0 || classCount > 0)) {
            hasGoodStructure = true;
            break;
          }
        }
      }
    }

    return hasGoodStructure ? 0.8 : 0.5;
  }

  /**
   * 检查模块化程度
   */
  checkModularity(output) {
    let moduleCount = 0;

    if (typeof output === 'object') {
      // 检查文件结构是否模块化
      const fileExtensions = {};
      for (const filePath of Object.keys(output)) {
        const ext = filePath.split('.').pop();
        if (ext) {
          fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
        }
      }

      // 检查是否有多样化的文件类型（表明模块化）
      moduleCount = Object.keys(fileExtensions).length;
    }

    // 模块化程度评分
    if (moduleCount >= 5) return 0.9; // 多种不同类型的文件
    if (moduleCount >= 3) return 0.7; // 中等多样性
    if (moduleCount >= 1) return 0.5; // 至少有一种文件类型
    return 0.2; // 没有文件
  }

  /**
   * 检查命名规范
   */
  checkNamingConventions(output) {
    let compliantNames = 0;
    let totalNames = 0;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 提取变量、函数名
          const nameMatches = content.match(/\b(var|let|const|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g);
          if (nameMatches) {
            for (const match of nameMatches) {
              const name = match.split(' ')[1]; // 获取名称部分

              // 检查是否符合驼峰命名或下划线命名规范
              if (/^[a-z][a-zA-Z0-9]*$/.test(name) || // camelCase
                  /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(name) || // camelCase with capital
                  /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) { // 或者snake_case
                compliantNames++;
              }
              totalNames++;
            }
          }
        }
      }
    }

    return totalNames > 0 ? compliantNames / totalNames : 0.4;
  }

  /**
   * 检查代码重复
   */
  checkCodeDuplication(output) {
    const allContent = [];

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);
          allContent.push(content);
        }
      }
    }

    // 简单的重复检测：查找相似的代码块
    const contentStr = allContent.join('\n');
    const lines = contentStr.split('\n');

    // 统计重复行
    const lineCounts = {};
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 10) { // 忽略太短的行
        lineCounts[trimmedLine] = (lineCounts[trimmedLine] || 0) + 1;
      }
    }

    // 计算重复率
    let repeatedLines = 0;
    for (const [line, count] of Object.entries(lineCounts)) {
      if (count > 2) { // 出现3次或以上视为重复
        repeatedLines += count;
      }
    }

    const duplicationRatio = repeatedLines / lines.length;

    // 重复率越低，分数越高
    return Math.max(0.2, 1 - duplicationRatio);
  }

  /**
   * 检查平台依赖
   */
  checkPlatformDependencies(output) {
    let platformDependent = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查平台特定的依赖
          if (content.toLowerCase().includes('windows') ||
              content.toLowerCase().includes('c:\\\\') ||
              content.toLowerCase().includes('platform-specific')) {
            platformDependent = true;
            break;
          }
        }
      }
    }

    return platformDependent ? 0.4 : 0.9; // 有平台依赖则分数较低
  }

  /**
   * 检查环境配置
   */
  checkEnvironmentConfiguration(output) {
    let hasEnvConfig = false;

    if (typeof output === 'object') {
      for (const [, fileInfo] of Object.entries(output)) {
        if (fileInfo.content) {
          const content = typeof fileInfo.content === 'string'
            ? fileInfo.content
            : JSON.stringify(fileInfo.content);

          // 检查环境配置相关
          if (content.toLowerCase().includes('env') ||
              content.toLowerCase().includes('process.env') ||
              content.toLowerCase().includes('.env') ||
              content.toLowerCase().includes('configuration') ||
              content.toLowerCase().includes('config')) {
            hasEnvConfig = true;
            break;
          }
        }
      }
    }

    return hasEnvConfig ? 0.8 : 0.5;
  }

  /**
   * 检查依赖管理
   */
  checkDependencyManagement(output) {
    let hasDependencyManagement = false;

    if (typeof output === 'object') {
      for (const [filePath, fileInfo] of Object.entries(output)) {
        if (filePath === 'package.json' && fileInfo.content) {
          // 如果有package.json文件，检查其内容
          try {
            const packageJson = typeof fileInfo.content === 'string'
              ? JSON.parse(fileInfo.content)
              : fileInfo.content;

            if (packageJson.dependencies || packageJson.devDependencies) {
              hasDependencyManagement = true;
              break;
            }
          } catch (e) {
            // 如果解析JSON失败，检查文本内容
            const content = typeof fileInfo.content === 'string'
              ? fileInfo.content
              : JSON.stringify(fileInfo.content);

            if (content.includes('dependencies') || content.includes('devDependencies')) {
              hasDependencyManagement = true;
              break;
            }
          }
        }
      }
    }

    return hasDependencyManagement ? 0.9 : 0.6;
  }

  /**
   * 计算整体分数
   */
  calculateOverallScore(details) {
    const {
      functionality,
      reliability,
      usability,
      efficiency,
      maintainability,
      portability
    } = details;

    // 使用加权平均计算整体分数
    const weightedSum =
      functionality.score * this.config.weights.functionality +
      reliability.score * this.config.weights.reliability +
      usability.score * this.config.weights.usability +
      efficiency.score * this.config.weights.efficiency +
      maintainability.score * this.config.weights.maintainability +
      portability.score * this.config.weights.portability;

    return weightedSum;
  }

  /**
   * 识别关键问题
   */
  identifyCriticalIssues(details) {
    const criticalIssues = [];

    // 检查各个维度的问题
    for (const [dimension, result] of Object.entries(details)) {
      if (result.issues) {
        for (const issue of result.issues) {
          if (issue.severity === 'CRITICAL') {
            criticalIssues.push({
              dimension,
              ...issue
            });
          }
        }
      }
    }

    return criticalIssues;
  }

  /**
   * 生成建议
   */
  generateRecommendations(evaluation) {
    const recommendations = [];

    // 根据评估结果生成具体建议
    if (evaluation.overallScore < this.config.thresholds.qualityScore) {
      recommendations.push({
        priority: 'HIGH',
        category: 'OVERALL',
        description: `整体质量分数(${evaluation.overallScore.toFixed(2)})低于阈值(${this.config.thresholds.qualityScore})，需要改进`,
        suggestions: ['进行全面审查', '实施质量改进措施']
      });
    }

    // 针对未通过的维度提供建议
    if (!evaluation.details.functionality.passed) {
      recommendations.push({
        priority: 'HIGH',
        category: 'FUNCTIONALITY',
        description: `功能性分数(${evaluation.details.functionality.score.toFixed(2)})较低`,
        suggestions: ['完善功能实现', '确保满足需求']
      });
    }

    if (!evaluation.details.reliability.passed) {
      recommendations.push({
        priority: 'HIGH',
        category: 'RELIABILITY',
        description: `可靠性分数(${evaluation.details.reliability.score.toFixed(2)})较低`,
        suggestions: ['增加错误处理', '完善异常处理机制']
      });
    }

    // 针对具体问题提供建议
    if (evaluation.criticalIssues.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'ISSUES',
        description: `发现 ${evaluation.criticalIssues.length} 个关键问题`,
        suggestions: evaluation.criticalIssues.map(issue => issue.description)
      });
    }

    return recommendations;
  }

  /**
   * 获取未通过的维度
   */
  getFailedDimensions(details) {
    const failed = [];

    for (const [dimension, result] of Object.entries(details)) {
      if (!result.passed) {
        failed.push({
          dimension,
          score: result.score,
          issues: result.issues
        });
      }
    }

    return failed;
  }
}

module.exports = QualityGate;