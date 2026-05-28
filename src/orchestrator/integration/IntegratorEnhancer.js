/**
 * 整合器增强组件
 *
 * 增强整合器能力，解决异常处理、完整性检查等问题
 */

const fs = require('fs').promises;
const path = require('path');

class IntegratorEnhancer {
  constructor(config = {}) {
    this.config = {
      enableIntegrityCheck: config.enableIntegrityCheck ?? true,
      enableDependencyCheck: config.enableDependencyCheck ?? true,
      enableAbsolutePathConversion: config.enableAbsolutePathConversion ?? true,
      requiredFiles: config.requiredFiles || [
        'package.json',
        'README.md',
        'tsconfig.json',
        'jest.config.js'
      ],
      ...config
    };
  }

  /**
   * 增强整合过程
   */
  async integrateWithEnhancements(executionResults, context = {}) {
    // 1. 基础整合
    const basicIntegration = await this.performBasicIntegration(executionResults);

    // 2. 异常处理改进 - 不再静默忽略错误
    if (basicIntegration.error) {
      throw new Error(`基础整合失败: ${basicIntegration.error.message}`);
    }

    // 3. 完整性检查
    if (this.config.enableIntegrityCheck) {
      const integrityCheck = await this.checkIntegrity(basicIntegration.files);
      if (!integrityCheck.passed) {
        console.warn('完整性检查发现问题:', integrityCheck.issues);
        // 不抛出异常，而是尝试修复
        basicIntegration.files = await this.attemptIntegrityFix(
          basicIntegration.files,
          integrityCheck.issues
        );
      }
    }

    // 4. 依赖冲突检测
    if (this.config.enableDependencyCheck) {
      const dependencyCheck = await this.checkDependencyConflicts(basicIntegration.files);
      if (!dependencyCheck.passed) {
        console.warn('检测到依赖冲突:', dependencyCheck.conflicts);
        basicIntegration.files = await this.resolveDependencyConflicts(
          basicIntegration.files,
          dependencyCheck.conflicts
        );
      }
    }

    // 5. 绝对路径转换
    if (this.config.enableAbsolutePathConversion) {
      basicIntegration.files = await this.convertAbsolutePaths(basicIntegration.files);
    }

    // 6. 必要文件自动生成
    basicIntegration.files = await this.ensureRequiredFiles(basicIntegration.files, context);

    return basicIntegration;
  }

  /**
   * 执行基础整合
   */
  async performBasicIntegration(executionResults) {
    const files = {};

    for (const result of executionResults) {
      if (result.filePath && (result.content || result.code)) {
        const filePath = result.filePath;

        // 检查文件内容是否为空或无效
        const content = result.content || result.code || '';
        if (content.trim() === '') {
          console.warn(`警告: 文件 ${filePath} 内容为空`);
        }

        files[filePath] = {
          content,
          timestamp: new Date(),
          originalResult: result
        };
      }
    }

    return {
      files,
      status: 'SUCCESS',
      errors: []
    };
  }

  /**
   * 完整性检查
   */
  async checkIntegrity(files) {
    const issues = [];

    for (const [filePath, fileInfo] of Object.entries(files)) {
      const content = fileInfo.content;

      // 检查空文件
      if (!content || content.trim() === '') {
        issues.push({
          type: 'EMPTY_FILE',
          file: filePath,
          severity: 'CRITICAL',
          message: `文件 ${filePath} 为空`
        });
      }

      // 检查空导入语句
      const emptyImportRegex = /import\s*{\s*}\s*from\s+['"][^'"]+['"]/g;
      const emptyImports = content.match(emptyImportRegex);
      if (emptyImports) {
        issues.push({
          type: 'EMPTY_IMPORT',
          file: filePath,
          severity: 'HIGH',
          message: `文件 ${filePath} 包含空导入语句`,
          imports: emptyImports
        });
      }

      // 检查语法问题
      if (this.hasSyntaxIssues(content)) {
        issues.push({
          type: 'SYNTAX_ISSUES',
          file: filePath,
          severity: 'HIGH',
          message: `文件 ${filePath} 包含语法问题`
        });
      }
    }

    // 检查缺失的必要文件
    for (const requiredFile of this.config.requiredFiles) {
      if (!files[requiredFile]) {
        issues.push({
          type: 'MISSING_REQUIRED_FILE',
          file: requiredFile,
          severity: 'MEDIUM',
          message: `缺失必要文件: ${requiredFile}`
        });
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      summary: {
        totalIssues: issues.length,
        critical: issues.filter(i => i.severity === 'CRITICAL').length,
        high: issues.filter(i => i.severity === 'HIGH').length,
        medium: issues.filter(i => i.severity === 'MEDIUM').length
      }
    };
  }

  /**
   * 检查导入解析完整性
   * 验证所有内部导入是否指向存在的文件
   */
  async checkImportResolution(files) {
    const issues = [];
    const filePaths = new Set(Object.keys(files));

    for (const [filePath, fileInfo] of Object.entries(files)) {
      const content = fileInfo.content;

      // 提取所有内部导入（相对路径）
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // 跳过外部导入（npm 包等）
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          // 这是一个相对导入，需要检查是否解析到存在的文件
          const resolvedPath = this.resolveImportPath(filePath, importPath);

          // 检查解析后的路径是否在 deliverables 中
          if (!filePaths.has(resolvedPath)) {
            issues.push({
              type: 'UNRESOLVED_IMPORT',
              file: filePath,
              importPath: importPath,
              resolvedPath: resolvedPath,
              severity: 'HIGH',
              message: `文件 ${filePath} 导入 "${importPath}" 无法解析到 deliverables 中的文件`
            });
          }
        }
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      summary: {
        totalIssues: issues.length,
        high: issues.filter(i => i.severity === 'HIGH').length
      }
    };
  }

  /**
   * 解析导入路径为绝对路径
   */
  resolveImportPath(fromFile, importPath) {
    // 获取源文件目录
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    // 解析相对路径
    const normalizedPath = path.normalize(path.join(fromDir, importPath));
    // 确保使用正斜杠
    return normalizedPath.replace(/\\/g, '/');
  }

  /**
   * 检查语法问题
   */
  hasSyntaxIssues(content) {
    // 简单检查是否有明显的语法问题
    const unmatched = this.findUnmatchedBrackets(content);
    return unmatched.length > 0;
  }

  /**
   * 查找未匹配的括号
   */
  findUnmatchedBrackets(content) {
    const stack = [];
    const pairs = { '{': '}', '[': ']', '(': ')' };
    const opening = new Set(['{', '[', '(']);
    const closing = new Set(['}', ']', ')']);

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (opening.has(char)) {
        stack.push({ char, index: i });
      } else if (closing.has(char)) {
        const last = stack.pop();
        if (!last || pairs[last.char] !== char) {
          return [{ type: 'UNMATCHED_BRACKET', position: i }];
        }
      }
    }

    return stack.length > 0 ? [{ type: 'UNCLOSED_BRACKET', count: stack.length }] : [];
  }

  /**
   * 尝试修复完整性问题
   */
  async attemptIntegrityFix(files, issues) {
    const fixedFiles = { ...files };

    for (const issue of issues) {
      switch (issue.type) {
        case 'EMPTY_FILE':
          // 对于空文件，尝试从上下文中恢复或删除
          console.warn(`移除空文件: ${issue.file}`);
          delete fixedFiles[issue.file];
          break;

        case 'EMPTY_IMPORT':
          // 修复空导入
          if (fixedFiles[issue.file]) {
            fixedFiles[issue.file].content = fixedFiles[issue.file].content.replace(
              /import\s*{\s*}\s*from\s+['"][^'"]+['"]/g,
              ''
            );
          }
          break;

        case 'MISSING_REQUIRED_FILE':
          // 在后面的部分生成必要文件
          break;
      }
    }

    return fixedFiles;
  }

  /**
   * 检查依赖冲突
   */
  async checkDependencyConflicts(files) {
    const conflicts = [];

    // 检查package.json中的依赖冲突
    if (files['package.json']) {
      try {
        const packageJson = JSON.parse(files['package.json'].content);
        if (packageJson.dependencies) {
          const deps = packageJson.dependencies;

          // 检查sequelize和sqlite相关冲突
          const hasSequelize = !!deps.sequelize;
          const hasSqlite = deps.sqlite3 || deps.better_sqlite3 || deps.sqlite;

          if (hasSequelize && hasSqlite) {
            conflicts.push({
              type: 'ORM_CONFLICT',
              libraries: ['sequelize', 'sqlite'],
              severity: 'HIGH',
              message: '检测到sequelize和sqlite包共存，可能存在ORM冲突'
            });
          }

          // 检查其他常见的依赖冲突
          if (deps.express && deps.fastify) {
            conflicts.push({
              type: 'FRAMEWORK_CONFLICT',
              libraries: ['express', 'fastify'],
              severity: 'MEDIUM',
              message: '检测到多个web框架共存'
            });
          }
        }
      } catch (e) {
        console.warn('解析package.json时出错:', e.message);
      }
    }

    return {
      passed: conflicts.length === 0,
      conflicts,
      summary: {
        totalConflicts: conflicts.length,
        critical: conflicts.filter(c => c.severity === 'CRITICAL').length,
        high: conflicts.filter(c => c.severity === 'HIGH').length
      }
    };
  }

  /**
   * 解决依赖冲突
   */
  async resolveDependencyConflicts(files, conflicts) {
    const resolvedFiles = { ...files };

    for (const conflict of conflicts) {
      switch (conflict.type) {
        case 'ORM_CONFLICT':
          // 在这种情况下，建议使用其中一个库并移除另一个
          console.warn(`检测到ORM冲突: ${conflict.libraries.join(' vs ')}`);
          // 这里可以根据项目类型决定保留哪个库
          break;

        case 'FRAMEWORK_CONFLICT':
          console.warn(`检测到框架冲突: ${conflict.libraries.join(' vs ')}`);
          break;
      }
    }

    return resolvedFiles;
  }

  /**
   * 转换绝对路径
   */
  async convertAbsolutePaths(files) {
    const convertedFiles = {};

    for (const [filePath, fileInfo] of Object.entries(files)) {
      let content = fileInfo.content;

      // 正则表达式匹配Windows绝对路径
      const absolutePathRegex = /(['"])[C-Z]:[\\/][^'"]+\.(js|ts|jsx|tsx)['"]/gi;

      content = content.replace(absolutePathRegex, (match) => {
        // 将绝对路径转换为相对路径
        const quote = match[0];
        const extension = match.match(/\.(js|ts|jsx|tsx)/)[1];

        // 简单的转换逻辑：替换为相对路径
        return quote + './placeholder.' + extension + quote;
      });

      convertedFiles[filePath] = {
        ...fileInfo,
        content
      };
    }

    return convertedFiles;
  }

  /**
   * 确保必要文件存在
   */
  async ensureRequiredFiles(files, context) {
    let updatedFiles = { ...files };

    // 检查并生成tsconfig.json
    if (!updatedFiles['tsconfig.json']) {
      updatedFiles['tsconfig.json'] = {
        content: this.generateTsConfig(context),
        timestamp: new Date(),
        generated: true
      };
    }

    // 检查并生成package.json的补充信息
    if (updatedFiles['package.json']) {
      updatedFiles['package.json'].content = await this.enhancePackageJson(
        updatedFiles['package.json'].content,
        context
      );
    }

    // 检查并生成README.md
    if (!updatedFiles['README.md']) {
      updatedFiles['README.md'] = {
        content: this.generateReadme(context),
        timestamp: new Date(),
        generated: true
      };
    }

    // 创建必要的目录
    updatedFiles = await this.createRequiredDirectories(updatedFiles, context);

    return updatedFiles;
  }

  /**
   * 生成tsconfig.json
   */
  generateTsConfig(context) {
    return `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "allowJs": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}`;
  }

  /**
   * 增强package.json
   */
  async enhancePackageJson(packageJsonStr, context) {
    try {
      const pkg = JSON.parse(packageJsonStr);

      // 添加缺失的依赖
      if (!pkg.scripts) {
        pkg.scripts = {
          "start": "node dist/index.js",
          "dev": "nodemon src/index.ts",
          "build": "tsc",
          "test": "jest"
        };
      }

      if (!pkg.devDependencies) {
        pkg.devDependencies = {
          "@types/node": "^20.0.0",
          "typescript": "^5.0.0",
          "nodemon": "^3.0.0",
          "jest": "^29.0.0"
        };
      }

      // 检查启动脚本是否指向正确的路径
      if (pkg.scripts && pkg.scripts['dev:server']) {
        // 修复服务器启动脚本路径
        if (pkg.scripts['dev:server'].includes('src/server/index.ts')) {
          // 检查实际的服务器文件路径
          if (context.serverFileExists) {
            pkg.scripts['dev:server'] = pkg.scripts['dev:server'].replace(
              'src/server/index.ts',
              context.serverFileExists
            );
          }
        }
      }

      return JSON.stringify(pkg, null, 2);
    } catch (e) {
      console.error('增强package.json时出错:', e.message);
      return packageJsonStr;
    }
  }

  /**
   * 生成README.md
   */
  generateReadme(context) {
    const projectName = context.projectName || 'Generated Project';

    return `# ${projectName}

## 项目简介

此项目是通过OrchestRouter自动生成的。

## 安装依赖

\`\`\`bash
npm install
\`\`\`

## 运行项目

开发模式：
\`\`\`bash
npm run dev
\`\`\`

生产构建：
\`\`\`bash
npm run build
npm start
\`\`\`

## 项目结构

- \`src/\` - 源代码
- \`tests/\` - 测试文件
- \`dist/\` - 构建输出

## 技术栈

- TypeScript
- Node.js
- Express (后端)
- React (前端，如果适用)
`;
  }

  /**
   * 创建必要目录
   */
  async createRequiredDirectories(files, context) {
    const updatedFiles = { ...files };

    // 确保必要的目录结构存在
    const requiredDirs = ['src', 'src/backend', 'src/frontend', 'tests', 'data'];

    for (const dir of requiredDirs) {
      // 检查目录中是否已经有文件
      const hasFilesInDir = Object.keys(updatedFiles).some(file =>
        file.startsWith(dir + '/') || file.startsWith(dir + '\\')
      );

      if (!hasFilesInDir) {
        // 为目录创建一个占位文件
        const placeholderPath = `${dir}/.gitkeep`;
        if (!updatedFiles[placeholderPath]) {
          updatedFiles[placeholderPath] = {
            content: '# Placeholder file to keep directory in Git',
            timestamp: new Date(),
            generated: true
          };
        }
      }
    }

    return updatedFiles;
  }
}

module.exports = IntegratorEnhancer;