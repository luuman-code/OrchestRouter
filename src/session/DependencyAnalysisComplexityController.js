// 依赖分析复杂度控制器
// 实现最大深度限制、最大文件数限制、单文件最大依赖数限制、分析超时保护等功能

class DependencyAnalysisComplexityController {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 10;
    this.maxFiles = options.maxFiles || 1000;
    this.maxDependenciesPerFile = options.maxDependenciesPerFile || 50;
    this.timeoutMs = options.timeoutMs || 30000;
    this.cacheSize = options.cacheSize || 1000;

    this.metrics = {
      totalAnalyses: 0,
      timeoutCount: 0,
      averageTime: 0,
      maxTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // 简单的LRU缓存实现
    this.analysisCache = new Map();
  }

  async analyzeWithComplexityControl(fileTree, targetFile, context = {}) {
    const startTime = Date.now();
    this.metrics.totalAnalyses++;

    // 快速检查文件数量
    const totalFiles = this.countFiles(fileTree);
    if (totalFiles > this.maxFiles) {
      throw new Error(
        `Project too large for dependency analysis (${totalFiles} > ${this.maxFiles}). ` +
        'Consider splitting the project or using sampling analysis.'
      );
    }

    // 检查缓存
    const cacheKey = `${targetFile}_${JSON.stringify(context)}`;
    if (this.analysisCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      const cachedResult = this.analysisCache.get(cacheKey);
      return { ...cachedResult, cached: true };
    }

    this.metrics.cacheMisses++;

    const complexityMetrics = {
      depth: 0,
      visitedFiles: new Set(),
      analyzedDependencies: [],
      analysisTime: 0,
      warnings: []
    };

    let result;
    try {
      result = await this.analyzeRecursive(
        fileTree,
        targetFile,
        context,
        complexityMetrics,
        startTime
      );
    } catch (error) {
      if (error.message.includes('timed out')) {
        this.metrics.timeoutCount++;
      }
      throw error;
    }

    complexityMetrics.analysisTime = Date.now() - startTime;
    this.updateMetrics(complexityMetrics.analysisTime);

    if (complexityMetrics.analysisTime > this.timeoutMs) {
      complexityMetrics.warnings.push(
        `Dependency analysis exceeded timeout: ${complexityMetrics.analysisTime}ms > ${this.timeoutMs}ms`
      );
    }

    // 缓存结果（如果不超过缓存大小限制）
    if (this.analysisCache.size >= this.cacheSize) {
      // 简单地删除第一个元素（不是真正的LRU，但足够简单）
      const firstKey = this.analysisCache.keys().next().value;
      this.analysisCache.delete(firstKey);
    }
    this.analysisCache.set(cacheKey, { ...result, complexityMetrics });

    return { ...result, complexityMetrics };
  }

  async analyzeRecursive(fileTree, currentFile, context, metrics, startTime) {
    // 检查时间限制
    if (Date.now() - startTime > this.timeoutMs) {
      throw new Error(`Dependency analysis timed out after ${this.timeoutMs}ms`);
    }

    // 检查深度限制
    if (metrics.depth > this.maxDepth) {
      return {
        dependencies: [currentFile],
        warning: `Max depth reached (${this.maxDepth})`,
        truncated: true
      };
    }

    // 检查循环依赖
    if (metrics.visitedFiles.has(currentFile)) {
      return {
        dependencies: [currentFile],
        warning: `Circular dependency detected at ${currentFile}`,
        circular: true
      };
    }

    metrics.visitedFiles.add(currentFile);
    metrics.depth++;

    const dependencies = await this.analyzeFile(fileTree, currentFile, context);

    // 限制单文件的依赖数量
    if (dependencies.length > this.maxDependenciesPerFile) {
      dependencies.splice(this.maxDependenciesPerFile);
      metrics.warnings.push(
        `Truncated dependencies for ${currentFile}: ${dependencies.length} > ${this.maxDependenciesPerFile}`
      );
    }

    const allDependencies = [currentFile];
    for (const dep of dependencies) {
      if (!metrics.visitedFiles.has(dep)) {
        const subResult = await this.analyzeRecursive(
          fileTree,
          dep,
          context,
          { ...metrics }, // 复制对象以保持正确的深度计数
          startTime
        );
        allDependencies.push(...subResult.dependencies);
        if (subResult.warning) {
          metrics.warnings.push(subResult.warning);
        }
      }
    }

    metrics.depth--;

    return {
      dependencies: [...new Set(allDependencies)],
      metrics: {
        depth: metrics.depth,
        filesAnalyzed: metrics.visitedFiles.size,
        warnings: metrics.warnings
      }
    };
  }

  // 模拟分析单个文件的依赖关系
  async analyzeFile(fileTree, fileName, context) {
    // 这是一个模拟实现
    // 在真实场景中，这将解析文件内容并提取依赖关系
    if (!fileTree.has(fileName)) {
      return [];
    }

    const fileContent = fileTree.get(fileName).content || '';

    // 简单的正则表达式匹配依赖关系（对于不同语言的导入语句）
    const importPatterns = [
      /from\s+['"]([^'"]+)['"]/g,  // ES6 imports: import {x} from 'module'
      /require\s*\(['"]([^'"]+)['"]\)/g,  // Node.js requires: require('module')
      /import\s+['"]([^'"]+)['"]/g,  // Simple imports: import 'module'
      /include\s+['"]([^'"]+)['"]/g, // C/C++ includes
      /#include\s+['"]([^'"]+)['"]/g // C/C++ includes alternative
    ];

    const dependencies = new Set();

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(fileContent)) !== null) {
        const dep = match[1];
        dependencies.add(dep);
      }
    }

    return Array.from(dependencies);
  }

  countFiles(fileTree) {
    if (fileTree instanceof Map) {
      return fileTree.size;
    }
    return Object.keys(fileTree).length;
  }

  updateMetrics(analysisTime) {
    this.metrics.averageTime = (this.metrics.averageTime + analysisTime) / 2;
    if (analysisTime > this.metrics.maxTime) {
      this.metrics.maxTime = analysisTime;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  clearCache() {
    this.analysisCache.clear();
  }
}

module.exports = DependencyAnalysisComplexityController;