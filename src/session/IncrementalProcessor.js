const Session = require('./Session');
const Corrector = require('../corrector/Corrector');
const path = require('path');
const PromptGenerator = require('../decomposer/utils/PromptGenerator');

class IncrementalProcessor {
  constructor(sessionManager, corrector = null) {
    this.sessionManager = sessionManager;
    this.corrector = corrector || new Corrector();
    // 初始化执行器引用
    this.executor = null;
    this.orchestratorServer = null;
  }

  // 添加设置 orchestratorServer 的方法
  setOrchestratorServer(orchestratorServer) {
    this.orchestratorServer = orchestratorServer;
  }

  // 添加设置 executor 的方法
  setExecutor(executor) {
    this.executor = executor;
  }

  /**
   * 处理冲突修复请求
   * @param {string} sessionId - 会话ID
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 处理结果
   */
  async handleConflictFix(sessionId, requestDescription) {
    // 加载会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 分析冲突报告
    const conflictReport = session.conflictReport;
    if (!conflictReport) {
      throw new Error(`No conflict report found in session ${sessionId}`);
    }

    // 识别受冲突影响的文件
    const affectedFiles = this.identifyAffectedFilesFromConflicts(conflictReport, requestDescription);

    // 分析受影响文件的依赖关系
    const dependencyImpact = this.analyzeDependencyImpact(session, affectedFiles);

    // 使用矫正器处理冲突
    const conflictResolutions = {};

    for (const filePath of affectedFiles) {
      const fileInSession = session.fileTree.get(filePath);
      if (fileInSession) {
        // 获取原始版本、当前版本和冲突版本
        const conflictData = {
          original: fileInSession.originalContent || fileInSession.content || '', // 原始内容
          current: fileInSession.content || '', // 当前内容
          incoming: fileInSession.conflictContent || fileInSession.content || '', // 冲突内容
          filePath: filePath,
          dependencies: {
            required: Array.from(session.dependencyGraph.getRequiredNodes(filePath)),
            affected: Array.from(session.dependencyGraph.getAffectedNodes(filePath))
          }
        };

        // 使用智能合并功能处理冲突
        const mergedContent = await this.smartMerge(
          conflictData,
          this.analyzeConflictResolution(conflictReport, requestDescription)
        );

        const resolution = {
          success: true,
          resolvedCode: mergedContent,
          originalConflict: conflictData,
          resolutionStrategy: this.analyzeConflictResolution(conflictReport, requestDescription)
        };

        if (resolution.success) {
          conflictResolutions[filePath] = resolution;

          // 更新文件内容
          fileInSession.content = resolution.resolvedCode;
          fileInSession.lastModified = new Date().toISOString();
          // 更新会话的文件树
          session.fileTree.set(filePath, fileInSession);

          // 更新依赖图中的哈希
          const newHash = session.calculateHash(resolution.resolvedCode);
          session.dependencyGraph.updateNodeHash(filePath, newHash);
        } else {
          throw new Error(`Failed to resolve conflict in ${filePath}: ${resolution.error}`);
        }
      }
    }

    // 更新会话中的文件
    for (const [filePath, resolution] of Object.entries(conflictResolutions)) {
      if (resolution.success) {
        const fileInSession = session.fileTree.get(filePath);
        if (fileInSession) {
          fileInSession.content = resolution.resolvedCode;
          fileInSession.lastModified = new Date().toISOString();
          // 更新会话的文件树
          session.fileTree.set(filePath, fileInSession);
        }
      }
    }

    // 构建增量处理结果
    const incrementalResult = {
      action: 'conflict_fix',
      affectedFiles: affectedFiles,
      dependencyImpact: dependencyImpact,
      fileChanges: conflictResolutions,
      conflictResolution: this.analyzeConflictResolution(conflictReport, requestDescription),
      requiresFullReintegration: false
    };

    return incrementalResult;
  }

  /**
   * 处理功能添加请求
   * @param {string} sessionId - 会话ID
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 处理结果
   */
  async handleFeatureAdd(sessionId, requestDescription) {
    // 加载会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 识别新增功能相关的文件和依赖
    const { newFiles, modifiedFiles, dependencyChanges } = await this.analyzeFeatureAddition(
      session,
      requestDescription
    );

    // 分析依赖影响
    const allAffectedFiles = [...newFiles, ...modifiedFiles];
    const dependencyImpact = this.analyzeDependencyImpact(session, allAffectedFiles);

    // 更新依赖图
    await this.updateDependencyGraph(session, allAffectedFiles);

    // 构建增量处理结果
    const incrementalResult = {
      action: 'feature_add',
      newFiles: newFiles,
      modifiedFiles: modifiedFiles,
      dependencyChanges: dependencyChanges,
      dependencyImpact: dependencyImpact,
      affectedSubtasks: this.findAffectedSubtasks(session, allAffectedFiles),
      requiresFullReintegration: false
    };

    return incrementalResult;
  }

  /**
   * 处理代码修改请求
   * @param {string} sessionId - 会话ID
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 处理结果
   */
  async handleCodeModify(sessionId, requestDescription) {
    // 加载会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 识别需要修改的文件
    const { modifiedFiles, impactedFiles } = await this.analyzeCodeModification(
      session,
      requestDescription
    );

    // 分析依赖影响
    const dependencyImpact = this.analyzeDependencyImpact(session, modifiedFiles);

    // 更新依赖图
    await this.updateDependencyGraph(session, modifiedFiles);

    // 构建增量处理结果
    const incrementalResult = {
      action: 'code_modify',
      modifiedFiles: modifiedFiles,
      impactedFiles: impactedFiles,
      dependencyImpact: dependencyImpact,
      affectedSubtasks: this.findAffectedSubtasks(session, [...modifiedFiles, ...impactedFiles]),
      requiresFullReintegration: false
    };

    return incrementalResult;
  }

  /**
   * 处理代码修复请求 - 带代码生成功能
   * 调用模型执行器生成修复后的完整代码内容
   * @param {string} sessionId - 会话 ID
   * @param {Object} requestData - 请求数据，包含 targetFiles, conflicts, changes 等
   * @returns {Promise<Object>} 处理结果，包含工具调用格式的修复内容
   */
  async handleCodeFixWithGeneration(sessionId, requestData) {
    // 加载会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 识别需要修复的文件
    const targetFiles = requestData.targetFiles || await this.identifyTargetFiles(session, requestData.description);
    const conflicts = requestData.conflicts || [];
    const changes = requestData.changes || [];

    // 初始化 Prompt 生成器
    const promptGenerator = new PromptGenerator();

    // 为每个目标文件生成修复
    const fixResults = [];
    const toolCalls = [];

    for (const filePath of targetFiles) {
      try {
        // 获取文件当前内容
        const fileInSession = session.fileTree?.get(filePath);
        const currentContent = fileInSession?.content || '';

        // 构建修复任务的 deliverable 对象
        const deliverable = {
          filePath: filePath,
          description: `Fix issues in ${filePath}`,
          type: this.inferFileType(filePath),
          confidence: 0.9
        };

        // 构建修复 prompt，注入当前文件内容
        const fixPrompt = promptGenerator.buildPromptForFix(
          {
            title: `Fix for ${filePath}`,
            description: requestData.description || 'Fix the identified issues',
            conflicts: conflicts.filter(c => c.files?.includes(filePath)),
            changes: changes,
            context: session.decompositionResult?.originalContent?.context || {}
          },
          deliverable,
          currentContent
        );

        // 调用模型执行器生成修复代码
        const executionResult = await this.executeFixTask(fixPrompt, filePath, session);

        if (executionResult.success && executionResult.content) {
          // 解析模型返回的代码内容
          const fixedContent = this.extractCodeFromModelResponse(executionResult.content);

          if (fixedContent) {
            // 构建工具调用格式的结果
            const toolCall = {
              type: 'tool_use',
              id: `edit_file_${Date.now()}_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
              name: 'edit_file',
              input: {
                file_path: filePath,
                old_string: currentContent,
                new_string: fixedContent
              }
            };
            toolCalls.push(toolCall);

            // 记录修复结果
            fixResults.push({
              filePath,
              success: true,
              originalContent: currentContent,
              newContent: fixedContent,
              modelUsed: executionResult.model_used || 'unknown',
              toolCall
            });

            // 更新会话中的文件内容
            if (fileInSession) {
              fileInSession.content = fixedContent;
              fileInSession.lastModified = new Date().toISOString();
              fileInSession.originalContent = currentContent; // 保存原始内容用于回溯
              session.fileTree.set(filePath, fileInSession);

              // 更新依赖图中的哈希
              const newHash = session.calculateHash(fixedContent);
              session.dependencyGraph.updateNodeHash(filePath, newHash);
            }
          } else {
            fixResults.push({
              filePath,
              success: false,
              error: 'Failed to extract valid code from model response'
            });
          }
        } else {
          fixResults.push({
            filePath,
            success: false,
            error: executionResult.error || 'Model execution failed'
          });
        }
      } catch (error) {
        console.error(`Error fixing file ${filePath}:`, error);
        fixResults.push({
          filePath,
          success: false,
          error: error.message
        });
      }
    }

    // 保存更新后的会话
    await this.sessionManager.updateSession(sessionId, {
      ...session,
      updatedAt: new Date(),
      metadata: {
        ...session.metadata,
        lastAction: 'code_fix_with_generation',
        iterationCount: (session.metadata?.iterationCount || 0) + 1
      }
    });

    // 构建返回结果
    const successfulFixes = fixResults.filter(r => r.success);
    const failedFixes = fixResults.filter(r => !r.success);

    // 即使所有修复都失败，也要返回基本结构
    const hasSomeSuccess = successfulFixes.length > 0;
    const overallSuccess = hasSomeSuccess && failedFixes.length === 0;

    return {
      success: hasSomeSuccess, // 只要有成功修复的文件就返回 true
      content: toolCalls, // Claude Code 工具调用格式
      action: 'code_fix_with_generation',
      fixResults: {
        successful: successfulFixes,
        failed: failedFixes,
        total: fixResults.length
      },
      affectedFiles: targetFiles,
      requiresFullReintegration: false,
      sessionId: sessionId
    };
  }

  /**
   * 调用模型执行器执行修复任务
   * @param {string} prompt - 生成的 prompt
   * @param {string} filePath - 文件路径
   * @param {Session} session - 会话对象
   * @returns {Promise<Object>} 执行结果
   */
  async executeFixTask(prompt, filePath, session) {
    try {
      // 检查是否有 orchestratorServer 和 executorIntegration 可用
      if (this.orchestratorServer && this.orchestratorServer.executorIntegration) {
        // 构建子任务格式的请求
        const subtask = {
          id: `fix_${Date.now()}_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
          type: 'code_fix',
          description: `Fix issues in ${filePath}`,
          prompt: prompt,
          filePath: filePath,
          selected_model: session.selectedModel || 'qwen3.5-plus'
        };

        // 调用 executorIntegration.executeSubtasks 方法
        const result = await this.orchestratorServer.executorIntegration.executeSubtasks([subtask]);

        if (result && result.execution_results && result.execution_results.length > 0) {
          const execResult = result.execution_results[0];
          return {
            success: execResult.success !== false,
            content: execResult.content || '',
            model_used: execResult.model_used || session.selectedModel || 'qwen3.5-plus'
          };
        } else {
          return {
            success: false,
            error: 'Empty execution result'
          };
        }
      }

      // 检查是否有执行器可用
      if (!this.executor && session.executor) {
        this.executor = session.executor;
      }

      // 构建执行请求
      const executionRequest = {
        task: {
          id: `fix_${Date.now()}_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
          type: 'code_fix',
          description: `Fix issues in ${filePath}`,
          prompt: prompt,
          filePath: filePath
        },
        model: session.selectedModel || 'qwen3.5-plus',
        max_tokens: 8192,
        temperature: 0.3 // 较低的 temperature 以确保代码准确性
      };

      // 如果有执行器，直接调用
      if (this.executor && typeof this.executor.execute === 'function') {
        const result = await this.executor.execute(executionRequest);
        return {
          success: result.success !== false,
          content: result.content || result.output || '',
          model_used: result.model_used || executionRequest.model
        };
      }

      // 如果以上都失败，返回错误
      return {
        success: false,
        error: 'No execution methods available'
      };
    } catch (error) {
      console.error('Error executing fix task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 使用内置模型执行器作为备选方案
   * @param {Object} task - 任务对象
   * @param {string} modelId - 模型ID
   * @returns {Promise<Object>} 执行结果
   */
  async fallbackExecuteFixTask(task, modelId) {
    // 如果有编排器实例，通过 OrchestratorServer 调用
    if (this.orchestratorServer && this.orchestratorServer.modelExecutor) {
      try {
        const result = await this.orchestratorServer.modelExecutor.execute({
          task: task,
          model: modelId,
          max_tokens: 8192,
          temperature: 0.3
        });
        return {
          success: result.success !== false,
          content: result.content || result.output || '',
          model_used: result.model_used || modelId
        };
      } catch (error) {
        console.error('Fallback execution failed:', error);
      }
    }

    // 如果以上都失败，返回错误
    return {
      success: false,
      error: 'No execution methods available'
    };
  }

  /**
   * 从模型响应中提取代码内容
   * @param {string} response - 模型响应文本
   * @returns {string|null} 提取的代码内容
   */
  extractCodeFromModelResponse(response) {
    if (!response) return null;

    // 尝试匹配代码块
    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      // 返回最后一个代码块（通常是主要的修复内容）
      return matches[matches.length - 1][1].trim();
    }

    // 如果没有代码块标记，尝试检测是否包含有效代码
    const lines = response.split('\n');
    const codeLines = lines.filter(line => {
      // 过滤掉明显的说明性文本
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') && trimmed.length < 50) return false; // 标题
      if (trimmed.startsWith('## ') && trimmed.length < 60) return false; // 二级标题
      if (trimmed.startsWith('- ') && trimmed.length < 100) return false; // 列表项
      if (trimmed.startsWith('**') && trimmed.includes('**')) return false; // 粗体文本
      return true;
    });

    if (codeLines.length > lines.length * 0.5) {
      // 如果超过一半的内容看起来像代码，返回整个响应
      return response.trim();
    }

    // 否则返回 null
    return null;
  }

  /**
   * 根据文件扩展名推断文件类型
   * @param {string} filePath - 文件路径
   * @returns {string} 文件类型
   */
  inferFileType(filePath) {
    if (!filePath) return 'general';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const extToTypeMap = {
      'js': 'javascript',
      'jsx': 'react',
      'ts': 'typescript',
      'tsx': 'react',
      'py': 'python',
      'json': 'json',
      'css': 'css',
      'scss': 'css',
      'less': 'css',
      'html': 'html',
      'md': 'markdown',
      'yaml': 'config',
      'yml': 'config'
    };

    return extToTypeMap[ext] || 'general';
  }

  /**
   * 从模型响应中提取代码内容
   * @param {string} response - 模型响应文本
   * @returns {string|null} 提取的代码内容
   */
  extractCodeFromModelResponse(response) {
    if (!response) return null;

    // 尝试匹配代码块
    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      // 返回第一个代码块（通常是最主要的修复内容）
      return matches[0][1].trim();
    }

    // 如果没有代码块标记，返回整个响应
    // 这种情况通常发生在模型直接返回代码而不是封装在代码块中的时候
    if (response.trim().includes('{') || response.trim().includes('function') ||
        response.trim().includes('class') || response.trim().includes('import') ||
        response.trim().includes('export') || response.trim().includes('const') ||
        response.trim().includes('var') || response.trim().includes('let')) {
      // 看起来像代码的内容
      return response.trim();
    }

    // 否则返回 null
    return null;
  }

  /**
   * 根据请求描述识别目标文件
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Array<string>>} 目标文件列表
   */
  async identifyTargetFiles(session, requestDescription) {
    const targetFiles = new Set();

    // 从请求描述中提取文件路径模式
    const filePattern = /(?:\w+\/)*\w+\.(?:js|ts|jsx|tsx|py|java|cpp|html|css|json|md|txt|xml)/gi;
    const matches = requestDescription?.match(filePattern) || [];
    matches.forEach(f => targetFiles.add(f));

    // 如果没有显式提到文件，查找会话中相关的文件
    if (targetFiles.size === 0 && session.fileTree) {
      for (const [filePath, fileData] of session.fileTree) {
        if (this.isFileReferencedInRequest(filePath, requestDescription)) {
          targetFiles.add(filePath);
        }
      }
    }

    return Array.from(targetFiles);
  }

  /**
   * 检查文件路径是否在请求中被引用
   * @param {string} filePath - 文件路径
   * @param {string} requestDescription - 请求描述
   * @returns {boolean} 是否被引用
   */
  isFileReferencedInRequest(filePath, requestDescription) {
    if (!requestDescription) return false;

    const fileName = filePath.split('/').pop().split('.')[0];
    const lowerRequest = requestDescription.toLowerCase();
    const lowerFilePath = filePath.toLowerCase();

    return lowerRequest.includes(fileName) || lowerRequest.includes(lowerFilePath);
  }

  /**
   * 从冲突报告中识别受影响的文件
   * @param {Object} conflictReport - 冲突报告
   * @param {string} requestDescription - 请求描述
   * @returns {Array<string>} 受影响的文件路径数组
   */
  identifyAffectedFilesFromConflicts(conflictReport, requestDescription) {
    const affectedFiles = new Set();

    // 如果冲突报告包含具体文件列表
    if (conflictReport.files && Array.isArray(conflictReport.files)) {
      for (const file of conflictReport.files) {
        affectedFiles.add(file.path || file.filePath || file);
      }
    }

    // 如果冲突报告是更复杂的结构
    if (conflictReport.conflicts && Array.isArray(conflictReport.conflicts)) {
      for (const conflict of conflictReport.conflicts) {
        if (conflict.filePath) {
          affectedFiles.add(conflict.filePath);
        } else if (conflict.file) {
          affectedFiles.add(conflict.file);
        }
      }
    }

    return Array.from(affectedFiles);
  }

  /**
   * 分析冲突解决方案
   * @param {Object} conflictReport - 冲突报告
   * @param {string} requestDescription - 请求描述
   * @returns {Object} 冲突解决方案分析
   */
  analyzeConflictResolution(conflictReport, requestDescription) {
    // 简单分析：根据请求描述确定冲突解决策略
    const resolutionStrategy = {
      type: 'merge_preference', // 或 'overwrite_original', 'overwrite_new', 'manual_merge'
      description: requestDescription,
      priority: 'user_request' // 用户请求优先级最高
    };

    // 进一步分析可以包括：
    // - 冲突的具体位置
    // - 提供的解决建议
    // - 自动解决可能性评估

    return resolutionStrategy;
  }

  /**
   * 分析功能添加的影响范围
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 影响分析结果
   */
  async analyzeFeatureAddition(session, requestDescription) {
    // 完整的功能添加分析
    // 深入分析依赖关系和影响范围

    // 识别可能的新文件（基于请求描述）
    const newFiles = this.extractPotentialNewFiles(requestDescription);

    // 识别可能被修改的现有文件
    const modifiedFiles = this.identifyPotentiallyModifiedFiles(session, requestDescription);

    // 分析依赖变化
    const dependencyChanges = this.analyzeDependencyChanges(session, newFiles, modifiedFiles);

    // 扩展分析：评估功能添加的复杂性和潜在冲突
    const complexityAnalysis = this.analyzeFeatureComplexity(session, requestDescription, [...newFiles, ...modifiedFiles]);

    // 检查可能存在的命名冲突
    const namingConflicts = this.checkNamingConflicts(session, requestDescription, [...newFiles, ...modifiedFiles]);

    // 评估与现有功能的集成难度
    const integrationDifficulty = this.assessIntegrationDifficulty(session, requestDescription, [...newFiles, ...modifiedFiles]);

    return {
      newFiles,
      modifiedFiles,
      dependencyChanges,
      complexityAnalysis,
      namingConflicts,
      integrationDifficulty,
      riskLevel: this.assessRiskLevel(complexityAnalysis, dependencyChanges, namingConflicts)
    };
  }

  /**
   * 分析代码修改的影响范围
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 影响分析结果
   */
  async analyzeCodeModification(session, requestDescription) {
    // 识别需要修改的文件
    const modifiedFiles = this.identifyPotentiallyModifiedFiles(session, requestDescription);

    // 分析修改对其他文件的影响
    const impactedFiles = await this.analyzeImpactOnOtherFiles(session, modifiedFiles);

    return {
      modifiedFiles,
      impactedFiles
    };
  }

  /**
   * 从请求描述中提取潜在的新文件名
   * @param {string} requestDescription - 请求描述
   * @returns {Array<string>} 潜在的新文件路径数组
   */
  extractPotentialNewFiles(requestDescription) {
    // 使用正则表达式匹配可能的文件路径模式
    const filePattern = /(?:\w+\/)*\w+\.(?:js|ts|jsx|tsx|py|java|cpp|html|css|json|md|txt|xml)/gi;
    const matches = requestDescription.match(filePattern) || [];

    return [...new Set(matches)]; // 去重
  }

  /**
   * 识别可能被修改的现有文件
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @returns {Array<string>} 可能被修改的文件路径数组
   */
  identifyPotentiallyModifiedFiles(session, requestDescription) {
    const potentialFiles = new Set();

    // 遍历现有的文件树，根据请求描述查找匹配的文件
    for (const [filePath, fileData] of session.fileTree) {
      // 检查文件路径是否与请求描述中的关键词匹配
      if (this.isFileReferencedInRequest(filePath, requestDescription)) {
        potentialFiles.add(filePath);
      }

      // 检查文件内容是否与请求描述相关（如果内容不过大）
      if (fileData.content && fileData.content.length < 10000) { // 限制内容检查大小
        if (this.isContentRelatedToRequest(fileData.content, requestDescription)) {
          potentialFiles.add(filePath);
        }
      }
    }

    return Array.from(potentialFiles);
  }

  /**
   * 检查文件路径是否在请求中被引用
   * @param {string} filePath - 文件路径
   * @param {string} requestDescription - 请求描述
   * @returns {boolean} 是否被引用
   */
  isFileReferencedInRequest(filePath, requestDescription) {
    const fileName = filePath.split('/').pop().split('.')[0]; // 获取不带扩展名的文件名
    const lowerRequest = requestDescription.toLowerCase();
    const lowerFilePath = filePath.toLowerCase();

    // 检查文件名或路径是否出现在请求中
    return lowerRequest.includes(fileName) || lowerRequest.includes(lowerFilePath);
  }

  /**
   * 检查文件内容是否与请求相关
   * @param {string} content - 文件内容
   * @param {string} requestDescription - 请求描述
   * @returns {boolean} 是否相关
   */
  isContentRelatedToRequest(content, requestDescription) {
    // 简单的关键词匹配
    const requestWords = requestDescription.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const contentLower = content.toLowerCase();

    return requestWords.some(word => contentLower.includes(word));
  }

  /**
   * 分析依赖变化
   * @param {Session} session - 会话对象
   * @param {Array<string>} newFiles - 新增文件
   * @param {Array<string>} modifiedFiles - 修改文件
   * @returns {Object} 依赖变化分析
   */
  analyzeDependencyChanges(session, newFiles, modifiedFiles) {
    const newDependencies = [];
    const removedDependencies = [];
    const modifiedDependencies = [];

    // 分析新增文件中的依赖
    for (const filePath of newFiles) {
      const fileData = session.fileTree.get(filePath);
      if (fileData && fileData.content) {
        const fileDependencies = this.extractDependenciesFromFile(fileData.content, filePath);
        newDependencies.push(...fileDependencies);
      }
    }

    // 分析修改文件中的依赖变化
    for (const filePath of modifiedFiles) {
      const fileData = session.fileTree.get(filePath);
      if (fileData && fileData.content) {
        const fileDependencies = this.extractDependenciesFromFile(fileData.content, filePath);
        modifiedDependencies.push(...fileDependencies);
      }
    }

    // 根据依赖关系推断受影响的文件
    const affectedByNewDeps = this.findFilesAffectedByDependencies(session, newDependencies);
    const affectedByModifiedDeps = this.findFilesAffectedByDependencies(session, modifiedDependencies);

    return {
      newDependencies,
      removedDependencies,
      modifiedDependencies,
      affectedFiles: [...new Set([...affectedByNewDeps, ...affectedByModifiedDeps])]
    };
  }

  /**
   * 从文件内容中提取依赖
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @returns {Array<string>} 依赖列表
   */
  extractDependenciesFromFile(content, filePath) {
    const dependencies = [];
    const ext = filePath.split('.').pop().toLowerCase();

    // 根据文件扩展名使用不同的解析规则
    switch(ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        // JavaScript/TypeScript import/export 语句
        const importRegex = /(import\s+|from\s+|require\(\s*)["'](.*?\.(js|ts|jsx|tsx|json|mjs|cjs))?["']/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          dependencies.push(match[2]);
        }
        break;
      case 'py':
        // Python import 语句
        const pythonImportRegex = /(import|from)\s+([a-zA-Z0-9_.]+)/g;
        while ((match = pythonImportRegex.exec(content)) !== null) {
          dependencies.push(match[2]);
        }
        break;
      case 'java':
        // Java import 语句
        const javaImportRegex = /import\s+([a-zA-Z0-9_.]+);/g;
        while ((match = javaImportRegex.exec(content)) !== null) {
          dependencies.push(match[1]);
        }
        break;
      case 'html':
        // HTML script/link 标签
        const htmlImportRegex = /(src|href)=["'](.*?\.(js|css|html))?["']/g;
        while ((match = htmlImportRegex.exec(content)) !== null) {
          dependencies.push(match[2]);
        }
        break;
    }

    return dependencies;
  }

  /**
   * 根据依赖找出受影响的文件
   * @param {Session} session - 会话对象
   * @param {Array<string>} dependencies - 依赖列表
   * @returns {Array<string>} 受影响的文件路径
   */
  findFilesAffectedByDependencies(session, dependencies) {
    const affectedFiles = new Set();

    // 完整实现：使用依赖图分析找出受影响的文件
    for (const dep of dependencies) {
      // 使用依赖图找出依赖此依赖的文件
      const dependents = session.dependencyGraph.getDependents(dep);
      for (const dependent of dependents) {
        affectedFiles.add(dependent);
      }

      // 同时检查内容中的依赖引用（备用方案）
      for (const [filePath, fileData] of session.fileTree) {
        if (fileData && fileData.content) {
          // 使用多种模式检查依赖引用
          const isReferenced = this.isDependencyReferenced(fileData.content, dep, filePath);
          if (isReferenced) {
            affectedFiles.add(filePath);
          }
        }
      }
    }

    return Array.from(affectedFiles);
  }

  /**
   * 分析修改对其他文件的影响
   * @param {Session} session - 会话对象
   * @param {Array<string>} modifiedFiles - 修改的文件
   * @returns {Promise<Array<string>>} 受影响的其他文件
   */
  async analyzeImpactOnOtherFiles(session, modifiedFiles) {
    const impactedFiles = new Set();

    // 分析依赖图来找出受影响的文件
    for (const modifiedFile of modifiedFiles) {
      // 找出哪些文件依赖于被修改的文件
      for (const [filePath, fileData] of session.fileTree) {
        if (filePath === modifiedFile) continue; // 跳过自身

        if (fileData && fileData.content) {
          // 检查当前文件是否引用了被修改的文件
          const isReferenced = this.isFileReferenced(fileData.content, modifiedFile);

          if (isReferenced) {
            impactedFiles.add(filePath);
          }
        }
      }
    }

    // 添加传递依赖：如果A依赖B，B依赖C，当C被修改时，A也会受到影响
    const transitiveImpacts = await this.analyzeTransitiveImpacts(session, Array.from(impactedFiles));
    for (const file of transitiveImpacts) {
      impactedFiles.add(file);
    }

    return Array.from(impactedFiles);
  }

  /**
   * 检查一个文件是否引用了另一个文件
   * @param {string} content - 引用文件的内容
   * @param {string} referencedFile - 被引用的文件路径
   * @returns {boolean} 是否引用
   */
  isFileReferenced(content, referencedFile) {
    const fileName = path.basename(referencedFile, path.extname(referencedFile));
    const filePathWithoutExt = referencedFile.replace(path.extname(referencedFile), '');

    // 检查内容中是否包含对引用文件的引用
    const patterns = [
      new RegExp(`['"][^'"]*${fileName}[^'"]*['"]`, 'i'), // 字符串中的文件名
      new RegExp(`['"][^'"]*${referencedFile.replace(/\\/g, '/')}[^'"]*['"]`, 'i'), // 完整路径（Unix风格）
      new RegExp(`['"][^'"]*${referencedFile.replace(/\//g, '\\')}[^'"]*['"]`, 'i')  // 完整路径（Windows风格）
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 分析依赖影响
   * @param {Session} session - 会话对象
   * @param {Array<string>} affectedFiles - 受影响的文件
   * @returns {Object} 依赖影响分析结果
   */
  analyzeDependencyImpact(session, affectedFiles) {
    // 使用会话中的依赖图进行分析
    const dependencyGraph = session.dependencyGraph;

    // 分析每个受影响文件的影响
    const allAffected = new Set();

    for (const file of affectedFiles) {
      allAffected.add(file);

      // 获取依赖于该文件的其他文件（传递影响）
      const dependents = dependencyGraph.getAffectedNodes(file);
      for (const dependent of dependents) {
        allAffected.add(dependent);
      }
    }

    // 使用依赖图的内置影响分析功能
    const impactAnalysis = dependencyGraph.analyzeImpact(affectedFiles);

    return {
      directChanges: Array.from(impactAnalysis.directChanges),
      affectedByChanges: Array.from(impactAnalysis.affectedByChanges),
      transitivelyAffected: Array.from(impactAnalysis.transitivelyAffected),
      totalAffected: Array.from(impactAnalysis.totalAffected),
      stats: impactAnalysis.stats,
      dependencyCycles: dependencyGraph.detectCycles()
    };
  }

  /**
   * 更新会话中的依赖图
   * @param {Session} session - 会话对象
   * @param {Array<string>} modifiedFiles - 修改的文件列表
   */
  async updateDependencyGraph(session, modifiedFiles) {
    const dependencyGraph = session.dependencyGraph;

    // 重新分析修改文件的依赖关系
    for (const filePath of modifiedFiles) {
      const fileData = session.fileTree.get(filePath);
      if (fileData && fileData.content) {
        // 清除旧的依赖关系
        // 实际上我们应该更精确地更新，而不是清空整个节点
        // 获取文件的新依赖
        const newDependencies = this.extractDependenciesFromFile(fileData.content, filePath);

        // 更新依赖图 - 先移除旧的依赖关系，再添加新的
        const existingDeps = dependencyGraph.getDependencies(filePath);
        for (const existingDep of existingDeps) {
          dependencyGraph.removeDependency(filePath, existingDep);
        }

        // 添加新的依赖关系
        for (const dep of newDependencies) {
          // 确保依赖目标也存在于图中
          dependencyGraph.addNode(dep, { type: 'file', path: dep });
          dependencyGraph.addDependency(filePath, dep, {
            type: 'import',
            fileType: path.extname(filePath),
            dependencyType: this.getDependencyType(dep)
          });
        }

        // 更新节点哈希
        const fileHash = session.calculateHash(fileData.content);
        dependencyGraph.updateNodeHash(filePath, fileHash);
      }
    }
  }

  /**
   * 获取依赖类型
   * @param {string} dependencyPath - 依赖路径
   * @returns {string} 依赖类型
   */
  getDependencyType(dependencyPath) {
    const ext = path.extname(dependencyPath).toLowerCase();
    if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
      return 'module';
    } else if (ext === '.css' || ext === '.scss' || ext === '.less') {
      return 'stylesheet';
    } else if (ext === '.json') {
      return 'configuration';
    } else if (ext === '.html') {
      return 'template';
    } else {
      return 'resource';
    }
  }

  /**
   * 分析传递影响
   * @param {Session} session - 会话对象
   * @param {Array<string>} initialAffectedFiles - 初始受影响文件
   * @returns {Promise<Array<string>>} 传递影响的文件
   */
  async analyzeTransitiveImpacts(session, initialAffectedFiles) {
    const transitiveImpacts = new Set();
    const visited = new Set();

    // 使用广度优先搜索找到所有传递影响的文件
    const queue = [...initialAffectedFiles];

    while (queue.length > 0) {
      const currentFile = queue.shift();

      if (visited.has(currentFile)) {
        continue;
      }

      visited.add(currentFile);

      // 查找引用当前文件的其他文件
      for (const [filePath, fileData] of session.fileTree) {
        if (filePath === currentFile || visited.has(filePath) || initialAffectedFiles.includes(filePath)) {
          continue;
        }

        if (fileData && fileData.content && this.isFileReferenced(fileData.content, currentFile)) {
          transitiveImpacts.add(filePath);
          queue.push(filePath);
        }
      }
    }

    return Array.from(transitiveImpacts);
  }

  /**
   * 查找受影响的子任务
   * @param {Session} session - 会话对象
   * @param {Array<string>} affectedFiles - 受影响的文件
   * @returns {Array} 受影响的子任务
   */
  findAffectedSubtasks(session, affectedFiles) {
    const affectedSubtasks = [];

    // 使用会话中的分解结果来查找实际受影响的子任务
    if (session.decompositionResult && session.decompositionResult.subtasks) {
      for (const subtask of session.decompositionResult.subtasks) {
        // 检查子任务的上下文文件是否在受影响的文件列表中
        if (subtask.context && subtask.context.related_files) {
          const intersectingFiles = subtask.context.related_files.filter(file =>
            affectedFiles.includes(file)
          );

          if (intersectingFiles.length > 0) {
            affectedSubtasks.push({
              id: subtask.id,
              description: subtask.description,
              relatedFiles: intersectingFiles,
              originalPriority: subtask.priority,
              impactLevel: intersectingFiles.length > 3 ? 'high' : intersectingFiles.length > 1 ? 'medium' : 'low'
            });
          }
        }

        // 如果子任务没有上下文文件信息，尝试通过任务描述进行模糊匹配
        if (affectedSubtasks.length === 0 && subtask.description) {
          for (const affectedFile of affectedFiles) {
            const fileName = path.basename(affectedFile, path.extname(affectedFile));
            if (subtask.description.toLowerCase().includes(fileName.toLowerCase())) {
              affectedSubtasks.push({
                id: subtask.id,
                description: subtask.description,
                relatedFiles: [affectedFile],
                originalPriority: subtask.priority,
                impactLevel: 'low',
                matchType: 'fuzzy_description'
              });
              break;
            }
          }
        }
      }
    }

    // 如果仍然没有找到关联的子任务，创建基于文件的虚拟子任务
    if (affectedSubtasks.length === 0) {
      for (const affectedFile of affectedFiles) {
        affectedSubtasks.push({
          id: `virtual_subtask_for_${affectedFile.replace(/[\/\\]/g, '_')}`,
          description: `Virtual subtask for changes in ${affectedFile}`,
          relatedFiles: [affectedFile],
          originalPriority: 'normal',
          impactLevel: 'medium',
          isVirtual: true
        });
      }
    }

    return affectedSubtasks;
  }

  /**
   * 执行完整的增量处理
   * @param {string} sessionId - 会话ID
   * @param {string} requestDescription - 请求描述
   * @param {string} requestType - 请求类型
   * @returns {Promise<Object>} 增量处理结果
   */
  /**
   * 处理增量请求
   * @param {string} sessionId - 会话 ID
   * @param {string|Object} requestDescription - 请求描述或请求对象
   * @param {string} requestType - 请求类型
   * @returns {Promise<Object>} 处理结果
   */
  async processIncrementally(sessionId, requestDescription, requestType) {
    // 如果请求是对象格式，提取相关字段
    const requestData = typeof requestDescription === 'object'
      ? requestDescription
      : { description: requestDescription };

    switch (requestType) {
      case 'CONFLICT_FIX':
        return await this.handleConflictFix(sessionId, requestDescription);
      case 'FEATURE_ADD':
        return await this.handleFeatureAdd(sessionId, requestDescription);
      case 'CODE_MODIFY':
        // 如果有 targetFiles 和 changes，使用带代码生成的修复
        if (requestData.targetFiles && requestData.targetFiles.length > 0) {
          return await this.handleCodeFixWithGeneration(sessionId, requestData);
        }
        return await this.handleCodeModify(sessionId, requestDescription);
      case 'CODE_FIX_WITH_GENERATION':
        return await this.handleCodeFixWithGeneration(sessionId, requestData);
      case 'CONTEXT_AWARE_DECOMPOSE':
        return await this.handleContextAwareDecompose(sessionId, requestDescription);
      default:
        throw new Error(`Unsupported request type: ${requestType}`);
    }
  }

  /**
   * 处理上下文感知分解
   * @param {string} sessionId - 会话ID
   * @param {string} requestDescription - 请求描述
   * @returns {Promise<Object>} 处理结果
   */
  async handleContextAwareDecompose(sessionId, requestDescription) {
    // 加载会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 分析请求，确定需要分解的内容
    const analysis = this.analyzeRequestForDecomposition(requestDescription, session);

    // 使用会话上下文进行智能分解
    const contextAwareDecomposition = await this.performContextAwareDecomposition(
      requestDescription,
      session,
      analysis
    );

    // 更新会话中的分解结果
    session.decompositionResult = contextAwareDecomposition;

    // 分析新分解对现有依赖图的影响
    const impactedFiles = this.identifyFilesAffectedByDecomposition(contextAwareDecomposition);
    const dependencyImpact = this.analyzeDependencyImpact(session, impactedFiles);

    // 如果有新的子任务，更新依赖关系
    await this.updateSubtaskDependencies(session, contextAwareDecomposition);

    // 构建处理结果
    const result = {
      action: 'context_aware_decompose',
      decomposition: contextAwareDecomposition,
      affectedFiles: impactedFiles,
      dependencyImpact: dependencyImpact,
      requiresFullReintegration: false
    };

    return result;
  }

  /**
   * 分析请求以确定分解需求
   * @param {string} requestDescription - 请求描述
   * @param {Session} session - 会话对象
   * @returns {Object} 分析结果
   */
  analyzeRequestForDecomposition(requestDescription, session) {
    // 分析请求中提到的文件和功能
    const requestedFeatures = this.extractRequestedFeatures(requestDescription);
    const mentionedFiles = this.extractMentionedFiles(requestDescription);

    // 检查现有文件中与请求相关的内容
    const relatedFiles = this.findRelatedFiles(session.fileTree, requestDescription);

    return {
      requestedFeatures,
      mentionedFiles,
      relatedFiles,
      existingCapabilities: this.analyzeExistingCapabilities(session)
    };
  }

  /**
   * 执行上下文感知分解
   * @param {string} requestDescription - 请求描述
   * @param {Session} session - 会话对象
   * @param {Object} analysis - 请求分析结果
   * @returns {Object} 分解结果
   */
  async performContextAwareDecomposition(requestDescription, session, analysis) {
    // 此处应该是与 Decomposer 模块的集成点
    // 在实际实现中，这里会调用上下文感知的分解逻辑

    // 模拟上下文感知分解的结果
    const decomposition = {
      original_task: requestDescription,
      subtasks: [],
      metadata: {
        context_used: true,
        existing_files_referenced: analysis.mentionedFiles,
        related_capabilities: analysis.existingCapabilities.topCapabilities,
        dependencies_considered: true
      }
    };

    // 根据请求和上下文创建子任务
    const newSubtasks = this.createContextualSubtasks(
      requestDescription,
      session,
      analysis
    );

    decomposition.subtasks = newSubtasks;

    return decomposition;
  }

  /**
   * 从请求中提取所需功能
   * @param {string} requestDescription - 请求描述
   * @returns {Array} 所需功能列表
   */
  extractRequestedFeatures(requestDescription) {
    // 使用关键词提取所需功能
    const featurePatterns = [
      /add\s+(.+?)\s+(feature|functionality|capability)/gi,
      /implement\s+(.+?)\s+(feature|functionality|capability)/gi,
      /create\s+(.+?)\s+(function|method|class|module)/gi,
      /new\s+(.+?)\s+(feature|functionality|capability|component)/gi,
      /enhance\s+(.+?)\s+with/gi
    ];

    const features = [];
    for (const pattern of featurePatterns) {
      let match;
      while ((match = pattern.exec(requestDescription)) !== null) {
        features.push(match[1].trim());
      }
    }

    return [...new Set(features)]; // 去重
  }

  /**
   * 从请求中提取提及的文件
   * @param {string} requestDescription - 请求描述
   * @returns {Array} 文件路径列表
   */
  extractMentionedFiles(requestDescription) {
    const filePattern = /(?:\w+\/)*\w+\.(?:js|ts|jsx|tsx|py|java|cpp|html|css|json|md|txt|xml)/gi;
    const matches = requestDescription.match(filePattern) || [];
    return [...new Set(matches)]; // 去重
  }

  /**
   * 查找与请求相关的文件
   * @param {Map} fileTree - 文件树
   * @param {string} requestDescription - 请求描述
   * @returns {Array} 相关文件列表
   */
  findRelatedFiles(fileTree, requestDescription) {
    const relatedFiles = [];
    const requestLower = requestDescription.toLowerCase();

    for (const [filePath, fileData] of fileTree) {
      // 检查文件路径是否与请求相关
      if (filePath.toLowerCase().includes(requestLower.split(/\s+/)[0])) {
        relatedFiles.push({
          path: filePath,
          relevance: 'high_path_match'
        });
      } else if (fileData.content && fileData.content.toLowerCase().includes(requestLower.substring(0, 50))) {
        // 检查文件内容是否与请求相关（仅检查前50个字符避免性能问题）
        relatedFiles.push({
          path: filePath,
          relevance: 'medium_content_match'
        });
      }
    }

    return relatedFiles;
  }

  /**
   * 分析现有能力
   * @param {Session} session - 会话对象
   * @returns {Object} 现有能力分析
   */
  analyzeExistingCapabilities(session) {
    // 分析现有子任务和功能
    const capabilities = [];

    if (session.decompositionResult && session.decompositionResult.subtasks) {
      for (const subtask of session.decompositionResult.subtasks) {
        capabilities.push({
          id: subtask.id,
          description: subtask.description,
          type: subtask.type || 'generic',
          priority: subtask.priority || 'normal'
        });
      }
    }

    // 按优先级和类型分组
    const groupedCapabilities = {
      highPriority: capabilities.filter(c => c.priority === 'high'),
      mediumPriority: capabilities.filter(c => c.priority === 'medium'),
      lowPriority: capabilities.filter(c => c.priority === 'low'),
      types: {}
    };

    for (const cap of capabilities) {
      if (!groupedCapabilities.types[cap.type]) {
        groupedCapabilities.types[cap.type] = [];
      }
      groupedCapabilities.types[cap.type].push(cap);
    }

    groupedCapabilities.topCapabilities = [
      ...groupedCapabilities.highPriority,
      ...groupedCapabilities.mediumPriority
    ];

    return groupedCapabilities;
  }

  /**
   * 创建上下文感知的子任务
   * @param {string} requestDescription - 请求描述
   * @param {Session} session - 会话对象
   * @param {Object} analysis - 分析结果
   * @returns {Array} 子任务列表
   */
  createContextualSubtasks(requestDescription, session, analysis) {
    const subtasks = [];

    // 基于请求创建子任务
    if (analysis.requestedFeatures.length > 0) {
      for (let i = 0; i < analysis.requestedFeatures.length; i++) {
        const feature = analysis.requestedFeatures[i];

        // 确定相关的现有文件
        const relatedExistingFiles = analysis.relatedFiles.map(f => f.path);

        subtasks.push({
          id: `subtask_${Date.now()}_${i}`,
          description: `Implement ${feature} as requested`,
          type: 'feature_implementation',
          priority: 'high',
          estimated_complexity: 'medium',
          estimated_time: 'medium',
          dependencies: [],
          related_files: relatedExistingFiles,
          context: {
            existing_implementation: analysis.existingCapabilities.topCapabilities,
            related_files: relatedExistingFiles
          }
        });
      }
    }

    // 如果没有明确的特性请求，创建通用处理任务
    if (subtasks.length === 0) {
      subtasks.push({
        id: `subtask_generic_${Date.now()}`,
        description: requestDescription,
        type: 'general_processing',
        priority: 'normal',
        estimated_complexity: 'low',
        estimated_time: 'short',
        dependencies: [],
        related_files: analysis.mentionedFiles,
        context: {
          existing_implementation: analysis.existingCapabilities.topCapabilities,
          related_files: analysis.mentionedFiles
        }
      });
    }

    return subtasks;
  }

  /**
   * 识别分解影响的文件
   * @param {Object} decomposition - 分解结果
   * @returns {Array} 受影响的文件列表
   */
  identifyFilesAffectedByDecomposition(decomposition) {
    const affectedFiles = new Set();

    // 从子任务中提取相关文件
    if (decomposition.subtasks) {
      for (const subtask of decomposition.subtasks) {
        if (subtask.related_files) {
          for (const file of subtask.related_files) {
            affectedFiles.add(file);
          }
        }
      }
    }

    return Array.from(affectedFiles);
  }

  /**
   * 更新子任务依赖关系
   * @param {Session} session - 会话对象
   * @param {Object} decomposition - 分解结果
   */
  async updateSubtaskDependencies(session, decomposition) {
    if (!decomposition.subtasks) return;

    const dependencyGraph = session.dependencyGraph;

    // 分析子任务之间的依赖关系
    for (const subtask of decomposition.subtasks) {
      if (subtask.context && subtask.context.related_files) {
        // 将子任务与其相关的文件关联起来
        for (const file of subtask.context.related_files) {
          dependencyGraph.addNode(file, {
            type: 'file',
            path: file,
            subtaskId: subtask.id
          });

          // 如果文件已经在图中，可能存在依赖关系
          // 这里可以进一步分析文件间的依赖关系
        }
      }
    }

    // 分析子任务之间的依赖关系
    this.analyzeSubtaskDependencies(decomposition.subtasks, dependencyGraph);
  }

  /**
   * 分析子任务依赖关系
   * @param {Array} subtasks - 子任务列表
   * @param {DependencyGraph} dependencyGraph - 依赖图
   */
  analyzeSubtaskDependencies(subtasks, dependencyGraph) {
    // 分析子任务间的依赖关系
    // 在实际实现中，这里会使用更复杂的分析算法
    for (let i = 0; i < subtasks.length; i++) {
      for (let j = 0; j < subtasks.length; j++) {
        if (i !== j) {
          // 简单的依赖分析：如果子任务j的功能被子任务i的需求所依赖
          if (this.tasksHaveDependency(subtasks[i], subtasks[j])) {
            dependencyGraph.addDependency(
              subtasks[i].id,
              subtasks[j].id,
              { type: 'functional_dependency' }
            );
          }
        }
      }
    }
  }

  /**
   * 检查两个任务间是否存在依赖关系
   * @param {Object} taskA - 任务A
   * @param {Object} taskB - 任务B
   * @returns {boolean} 是否存在依赖关系
   */
  /**
   * 检查依赖是否在内容中被引用
   * @param {string} content - 文件内容
   * @param {string} dependency - 依赖名称
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否被引用
   */
  isDependencyReferenced(content, dependency, filePath) {
    // 根据文件类型使用不同的检测策略
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        // JavaScript/TypeScript 检测策略
        const jsPatterns = [
          new RegExp(`from\\s+['"](${dependency})['"]`, 'i'),
          new RegExp(`import\\s+.*?['"](${dependency})['"]`, 'i'),
          new RegExp(`require\\(\\s*['"](${dependency})['"]\\s*\\)`, 'i'),
          new RegExp(`from\\s+['"][^'"]*[/\\\\]${dependency}['"]`, 'i')
        ];
        return jsPatterns.some(pattern => pattern.test(content));

      case '.py':
        // Python 检测策略
        const pyPatterns = [
          new RegExp(`from\\s+(${dependency})\\s+import`, 'i'),
          new RegExp(`import\\s+(${dependency})`, 'i'),
          new RegExp(`from\\s+[\\.\\.\\.]*${dependency}\\s+import`, 'i')
        ];
        return pyPatterns.some(pattern => pattern.test(content));

      case '.java':
        // Java 检测策略
        const javaPatterns = [
          new RegExp(`import\\s+.*?(${dependency})`, 'i'),
          new RegExp(`${dependency}\\s*\\.`, 'i')  // 使用该包下的类
        ];
        return javaPatterns.some(pattern => pattern.test(content));

      case '.html':
        // HTML 检测策略
        const htmlPatterns = [
          new RegExp(`src=['"][^'"]*${dependency}[^'"]*['"]`, 'i'),
          new RegExp(`href=['"][^'"]*${dependency}[^'"]*['"]`, 'i'),
          new RegExp(`data-src=['"][^'"]*${dependency}[^'"]*['"]`, 'i')
        ];
        return htmlPatterns.some(pattern => pattern.test(content));

      default:
        // 通用检测策略
        const generalPattern = new RegExp(`\\b${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return generalPattern.test(content);
    }
  }

  /**
   * 分析功能复杂性
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @param {Array<string>} affectedFiles - 受影响文件
   * @returns {Object} 复杂性分析
   */
  analyzeFeatureComplexity(session, requestDescription, affectedFiles) {
    const complexityMetrics = {
      fileCount: affectedFiles.length,
      totalLines: 0,
      dependencyDepth: 0,
      integrationPoints: 0
    };

    // 分析受影响文件的复杂度
    for (const filePath of affectedFiles) {
      const fileData = session.fileTree.get(filePath);
      if (fileData && fileData.content) {
        const lines = fileData.content.split('\n').length;
        complexityMetrics.totalLines += lines;
      }
    }

    // 评估依赖图深度
    if (session.dependencyGraph) {
      complexityMetrics.dependencyDepth = session.dependencyGraph.getMaxDepth();
    }

    // 评估集成点数量
    complexityMetrics.integrationPoints = affectedFiles.length;

    return complexityMetrics;
  }

  /**
   * 检查命名冲突
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @param {Array<string>} affectedFiles - 受影响文件
   * @returns {Array} 命名冲突列表
   */
  checkNamingConflicts(session, requestDescription, affectedFiles) {
    const conflicts = [];

    // 在实际实现中，这里会检查类名、函数名、变量名等可能的冲突
    // 完整的实现：检查多种类型的命名冲突
    for (const filePath of affectedFiles) {
      if (session.fileTree.has(filePath)) {
        conflicts.push({
          type: 'file_exists',
          location: filePath,
          severity: 'warning',
          message: `File ${filePath} already exists in session`
        });
      }

      // 检查类名/函数名/变量名冲突
      const fileData = session.fileTree.get(filePath);
      if (fileData && fileData.content) {
        // 使用正则表达式检测常见的命名实体
        const classNameMatches = fileData.content.match(/class\s+(\w+)/g);
        const functionNameMatches = fileData.content.match(/(?:function|def|const|let|var)\s+(\w+)/g);

        if (classNameMatches) {
          for (const match of classNameMatches) {
            const className = match.split(' ')[1];
            for (const [existingPath, existingData] of session.fileTree) {
              if (existingPath !== filePath && existingData.content &&
                  existingData.content.includes(`class ${className}`)) {
                conflicts.push({
                  type: 'class_name_collision',
                  location: filePath,
                  entity: className,
                  severity: 'error',
                  message: `Class name "${className}" already exists in ${existingPath}`
                });
              }
            }
          }
        }

        if (functionNameMatches) {
          for (const match of functionNameMatches) {
            const parts = match.split(' ');
            if (parts.length >= 2) {
              const functionName = parts[1];
              // 检查函数名冲突
              for (const [existingPath, existingData] of session.fileTree) {
                if (existingPath !== filePath && existingData.content &&
                    existingData.content.includes(`${functionName}(`)) {
                  conflicts.push({
                    type: 'function_name_collision',
                    location: filePath,
                    entity: functionName,
                    severity: 'warning',
                    message: `Function name "${functionName}" already exists in ${existingPath}`
                  });
                }
              }
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * 评估集成难度
   * @param {Session} session - 会话对象
   * @param {string} requestDescription - 请求描述
   * @param {Array<string>} affectedFiles - 受影响文件
   * @returns {Object} 集成难度评估
   */
  assessIntegrationDifficulty(session, requestDescription, affectedFiles) {
    let difficulty = 0;
    let factors = [];

    // 分析各种影响因素
    if (affectedFiles.length > 5) {
      difficulty += 20;
      factors.push('many_files_affected');
    }

    if (requestDescription.toLowerCase().includes('refactor') ||
        requestDescription.toLowerCase().includes('重构')) {
      difficulty += 30;
      factors.push('refactoring_involved');
    }

    // 检查是否涉及核心功能
    for (const filePath of affectedFiles) {
      if (filePath.toLowerCase().includes('core') ||
          filePath.toLowerCase().includes('main') ||
          filePath.toLowerCase().includes('index')) {
        difficulty += 15;
        factors.push('core_module_affected');
        break;
      }
    }

    return {
      score: difficulty,
      factors: factors,
      level: difficulty > 50 ? 'high' : difficulty > 25 ? 'medium' : 'low'
    };
  }

  /**
   * 评估风险等级
   * @param {Object} complexity - 复杂性分析
   * @param {Object} dependencies - 依赖变化
   * @param {Array} conflicts - 冲突列表
   * @returns {string} 风险等级
   */
  assessRiskLevel(complexity, dependencies, conflicts) {
    let riskScore = 0;

    // 基于复杂性评估风险
    if (complexity.fileCount > 5) riskScore += 20;
    if (complexity.totalLines > 1000) riskScore += 15;
    if (complexity.dependencyDepth > 3) riskScore += 10;

    // 基于依赖变化评估风险
    if (dependencies.affectedFiles.length > 10) riskScore += 25;

    // 基于冲突评估风险
    if (conflicts.length > 0) riskScore += 30;

    // 返回风险等级
    if (riskScore >= 70) return 'high';
    if (riskScore >= 40) return 'medium';
    return 'low';
  }

  tasksHaveDependency(taskA, taskB) {
    // 更全面的依赖检测逻辑
    // 分析任务描述、相关文件和功能需求
    if (!taskA.context || !taskB.context) return false;

    // 检查相关文件是否有交集
    const aRelatedFiles = taskA.context.related_files || [];
    const bRelatedFiles = taskB.context.related_files || [];

    const fileOverlap = aRelatedFiles.some(file => bRelatedFiles.includes(file));
    if (fileOverlap) return true;

    // 检查功能依赖（如A需要B完成才能开始）
    // 这里可以根据任务类型、描述等进一步细化
    return false;
  }

  /**
   * 智能合并函数，根据不同文件类型采用不同的合并策略
   * @param {Object} conflictData - 冲突数据
   * @param {Object} resolutionStrategy - 解决策略
   * @returns {Promise<Object>} 合并结果
   */
  async smartMerge(conflictData, resolutionStrategy) {
    const { original, current, incoming, filePath, dependencies } = conflictData;

    if (!filePath) {
      // 如果没有文件路径，默认使用通用合并
      return this.lineBasedMerge(original, current, incoming);
    }

    const ext = path.extname(filePath).toLowerCase();

    // 根据文件扩展名选择适当的合并策略
    switch (ext) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        return await this.smartMergeJavaScript(original, current, incoming, dependencies);
      case '.py':
        return await this.smartMergePython(original, current, incoming, dependencies);
      case '.json':
        return await this.smartMergeJSON(original, current, incoming);
      case '.html':
        return await this.smartMergeHTML(original, current, incoming);
      case '.css':
        return await this.smartMergeCSS(original, current, incoming);
      default:
        // 对于其他类型的文件，使用行级别合并
        return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * JavaScript/TypeScript智能合并
   * @param {string} original - 原始版本
   * @param {string} current - 当前版本
   * @param {string} incoming - 传入版本
   * @param {Object} dependencies - 依赖信息
   * @returns {Promise<string>} 合并后的代码
   */
  async smartMergeJavaScript(original, current, incoming, dependencies) {
    try {
      // 解析代码元素（函数、类、变量声明等）
      const originalElements = this.extractCodeElements(original);
      const currentElements = this.extractCodeElements(current);
      const incomingElements = this.extractCodeElements(incoming);

      // 基于元素级别的合并
      const mergedElements = this.mergeCodeElements(originalElements, currentElements, incomingElements);

      // 重建代码
      return this.rebuildJavaScriptCode(mergedElements);
    } catch (error) {
      // 如果解析失败，退回到行级别合并
      console.warn(`JavaScript merge failed, falling back to line-based merge: ${error.message}`);
      return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * Python智能合并
   * @param {string} original - 原始版本
   * @param {string} current - 当前版本
   * @param {string} incoming - 传入版本
   * @param {Object} dependencies - 依赖信息
   * @returns {Promise<string>} 合并后的代码
   */
  async smartMergePython(original, current, incoming, dependencies) {
    try {
      // 解析Python代码元素（函数、类、导入等）
      const originalImports = this.extractPythonImports(original);
      const originalFunctions = this.extractPythonFunctions(original);
      const originalClasses = this.extractPythonClasses(original);

      const currentImports = this.extractPythonImports(current);
      const currentFunctions = this.extractPythonFunctions(current);
      const currentClasses = this.extractPythonClasses(current);

      const incomingImports = this.extractPythonImports(incoming);
      const incomingFunctions = this.extractPythonFunctions(incoming);
      const incomingClasses = this.extractPythonClasses(incoming);

      // 分别合并不同类型的元素
      const mergedImports = this.mergeLists(originalImports, currentImports, incomingImports);
      const mergedFunctions = this.mergePythonFunctions(originalFunctions, currentFunctions, incomingFunctions);
      const mergedClasses = this.mergePythonClasses(originalClasses, currentClasses, incomingClasses);

      // 重建Python代码
      return this.rebuildPythonCode(mergedImports, mergedFunctions, mergedClasses);
    } catch (error) {
      // 如果解析失败，退回到行级别合并
      console.warn(`Python merge failed, falling back to line-based merge: ${error.message}`);
      return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * JSON智能合并
   * @param {string} original - 原始版本
   * @param {string} current - 当前版本
   * @param {string} incoming - 传入版本
   * @returns {Promise<string>} 合并后的JSON
   */
  async smartMergeJSON(original, current, incoming) {
    try {
      // 解析JSON对象
      const originalObj = JSON.parse(original || '{}');
      const currentObj = JSON.parse(current || '{}');
      const incomingObj = JSON.parse(incoming || '{}');

      // 深度合并对象
      const mergedObj = this.deepMergeObjects(originalObj, currentObj, incomingObj);

      // 返回格式化的JSON
      return JSON.stringify(mergedObj, null, 2);
    } catch (error) {
      // 如果JSON解析失败，退回到行级别合并
      console.warn(`JSON merge failed, falling back to line-based merge: ${error.message}`);
      return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * HTML智能合并
   * @param {string} original - 原始版本
   * @param {string} current - 当前版本
   * @param {string} incoming - 传入版本
   * @returns {Promise<string>} 合并后的HTML
   */
  async smartMergeHTML(original, current, incoming) {
    try {
      // 解析HTML结构，分离head和body
      const originalParsed = this.parseHtml(original);
      const currentParsed = this.parseHtml(current);
      const incomingParsed = this.parseHtml(incoming);

      // 合并head部分
      const mergedHead = this.mergeHtmlHead(originalParsed.head, currentParsed.head, incomingParsed.head);

      // 合并body部分
      const mergedBody = this.mergeHtmlBody(originalParsed.body, currentParsed.body, incomingParsed.body);

      // 重建HTML
      return this.rebuildHtml(mergedHead, mergedBody);
    } catch (error) {
      // 如果HTML解析失败，退回到行级别合并
      console.warn(`HTML merge failed, falling back to line-based merge: ${error.message}`);
      return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * CSS智能合并
   * @param {string} original - 原始版本
   * @param {string} current - 当前版本
   * @param {string} incoming - 传入版本
   * @returns {Promise<string>} 合并后的CSS
   */
  async smartMergeCSS(original, current, incoming) {
    try {
      // 解析CSS规则
      const originalRules = this.parseCss(original);
      const currentRules = this.parseCss(current);
      const incomingRules = this.parseCss(incoming);

      // 合并CSS规则（按选择器）
      const mergedRules = this.mergeCssRules(originalRules, currentRules, incomingRules);

      // 重建CSS
      return this.rebuildCss(mergedRules);
    } catch (error) {
      // 如果CSS解析失败，退回到行级别合并
      console.warn(`CSS merge failed, falling back to line-based merge: ${error.message}`);
      return this.lineBasedMerge(original, current, incoming);
    }
  }

  /**
   * 提取JavaScript代码元素
   * @param {string} code - JavaScript代码
   * @returns {Array} 代码元素数组
   */
  extractCodeElements(code) {
    const elements = [];

    // 提取函数定义
    const functionRegex = /(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      elements.push({
        type: 'function',
        name: match[2] || match[4],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    // 提取类定义
    const classRegex = /class\s+(\w+)\s+[^{]*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;
    while ((match = classRegex.exec(code)) !== null) {
      elements.push({
        type: 'class',
        name: match[1],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    // 提取变量声明
    const varRegex = /(const|let|var)\s+(\w+)\s*=[^;]*;/g;
    while ((match = varRegex.exec(code)) !== null) {
      elements.push({
        type: 'variable',
        name: match[2],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return elements;
  }

  /**
   * 合并代码元素
   * @param {Array} original - 原始元素
   * @param {Array} current - 当前元素
   * @param {Array} incoming - 传入元素
   * @returns {Array} 合并后的元素
   */
  mergeCodeElements(original, current, incoming) {
    // 创建基于名称的映射
    const originalMap = new Map(original.map(el => [el.name, el]));
    const currentMap = new Map(current.map(el => [el.name, el]));
    const incomingMap = new Map(incoming.map(el => [el.name, el]));

    // 获取所有唯一元素名称
    const allNames = new Set([
      ...original.map(el => el.name),
      ...current.map(el => el.name),
      ...incoming.map(el => el.name)
    ]);

    const mergedElements = [];
    for (const name of allNames) {
      const origEl = originalMap.get(name);
      const currEl = currentMap.get(name);
      const incEl = incomingMap.get(name);

      if (!currEl && !incEl) {
        // 元素未在当前或传入版本中修改，保持原始
        if (origEl) mergedElements.push(origEl);
      } else if (!origEl && incEl) {
        // 新增元素
        mergedElements.push(incEl);
      } else if (!origEl && currEl) {
        // 新增元素（已在当前版本中）
        mergedElements.push(currEl);
      } else if (origEl && currEl && incEl) {
        // 三方合并
        if (currEl.content === origEl.content && incEl.content !== origEl.content) {
          // 只有incoming改变了，采用incoming
          mergedElements.push(incEl);
        } else if (incEl.content === origEl.content && currEl.content !== origEl.content) {
          // 只有current改变了，采用current
          mergedElements.push(currEl);
        } else if (currEl.content !== origEl.content && incEl.content !== origEl.content) {
          // 两者都改变了，尝试合并内容
          const mergedContent = this.mergeFunctionContent(origEl.content, currEl.content, incEl.content);
          mergedElements.push({...currEl, content: mergedContent});
        } else {
          // 没有变化，采用current
          mergedElements.push(currEl);
        }
      } else if (origEl && currEl && !incEl) {
        // incoming删除了元素
        // 根据策略决定是否保留
        mergedElements.push(currEl); // 保持当前状态
      } else if (origEl && !currEl && incEl) {
        // current删除了元素
        // 根据策略决定是否保留
        mergedElements.push(incEl); // 采用incoming状态
      } else {
        // 处理其他边界情况
        if (currEl) mergedElements.push(currEl);
        else if (incEl) mergedElements.push(incEl);
        else if (origEl) mergedElements.push(origEl);
      }
    }

    return mergedElements;
  }

  /**
   * 合并函数内容
   * @param {string} original - 原始内容
   * @param {string} current - 当前内容
   * @param {string} incoming - 传入内容
   * @returns {string} 合并后的内容
   */
  mergeFunctionContent(original, current, incoming) {
    // 对于复杂的内容合并，我们暂时使用行级别合并
    // 在实际应用中，这里可以使用更高级的AST级别的合并
    return this.lineBasedMerge(original, current, incoming);
  }

  /**
   * 重建JavaScript代码
   * @param {Array} elements - 代码元素
   * @returns {string} 重建的代码
   */
  rebuildJavaScriptCode(elements) {
    // 按原始顺序重新组装代码
    // 在这里可以按逻辑组织元素（如先导入，再类，再函数等）
    return elements.map(el => el.content).join('\n\n');
  }

  /**
   * 提取Python导入语句
   * @param {string} code - Python代码
   * @returns {Array} 导入语句数组
   */
  extractPythonImports(code) {
    const importRegex = /^(import\s+.+|from\s+.+\s+import\s+.+)/gm;
    const imports = [];
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.push({
        line: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    return imports;
  }

  /**
   * 提取Python函数
   * @param {string} code - Python代码
   * @returns {Array} 函数数组
   */
  extractPythonFunctions(code) {
    const funcRegex = /def\s+(\w+)\s*\([^)]*\)\s*:[\s\S]*?(?=\n\S|\n\s*def\s+|\n\s*class\s+|$)/g;
    const functions = [];
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      functions.push({
        name: match[1],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    return functions;
  }

  /**
   * 提取Python类
   * @param {string} code - Python代码
   * @returns {Array} 类数组
   */
  extractPythonClasses(code) {
    const classRegex = /class\s+(\w+)[\s\S]*?(?=\n\S|\n\s*def\s+|\n\s*class\s+|$)/g;
    const classes = [];
    let match;
    while ((match = classRegex.exec(code)) !== null) {
      classes.push({
        name: match[1],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    return classes;
  }

  /**
   * 合并Python函数
   * @param {Array} original - 原始函数
   * @param {Array} current - 当前函数
   * @param {Array} incoming - 传入函数
   * @returns {Array} 合并后的函数
   */
  mergePythonFunctions(original, current, incoming) {
    return this.mergeLists(original, current, incoming);
  }

  /**
   * 合并Python类
   * @param {Array} original - 原始类
   * @param {Array} current - 当前类
   * @param {Array} incoming - 传入类
   * @returns {Array} 合并后的类
   */
  mergePythonClasses(original, current, incoming) {
    return this.mergeLists(original, current, incoming);
  }

  /**
   * 重建Python代码
   * @param {Array} imports - 导入语句
   * @param {Array} functions - 函数
   * @param {Array} classes - 类
   * @returns {string} 重建的代码
   */
  rebuildPythonCode(imports, functions, classes) {
    const parts = [];

    if (imports.length > 0) {
      parts.push(imports.map(imp => imp.line).join('\n'));
    }

    if (functions.length > 0) {
      parts.push(functions.map(func => func.content).join('\n\n'));
    }

    if (classes.length > 0) {
      parts.push(classes.map(cls => cls.content).join('\n\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * 解析HTML
   * @param {string} html - HTML字符串
   * @returns {Object} 解析后的HTML对象
   */
  parseHtml(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    return {
      head: headMatch ? headMatch[1] : '',
      body: bodyMatch ? bodyMatch[1] : ''
    };
  }

  /**
   * 合并HTML head部分
   * @param {string} original - 原始head
   * @param {string} current - 当前head
   * @param {string} incoming - 传入head
   * @returns {string} 合并后的head
   */
  mergeHtmlHead(original, current, incoming) {
    // 合并meta标签、link标签、script标签等
    return this.lineBasedMerge(original, current, incoming);
  }

  /**
   * 合并HTML body部分
   * @param {string} original - 原始body
   * @param {string} current - 当前body
   * @param {string} incoming - 传入body
   * @returns {string} 合并后的body
   */
  mergeHtmlBody(original, current, incoming) {
    // 合并body内容
    return this.lineBasedMerge(original, current, incoming);
  }

  /**
   * 重建HTML
   * @param {string} head - head部分
   * @param {string} body - body部分
   * @returns {string} 重建的HTML
   */
  rebuildHtml(head, body) {
    return `<!DOCTYPE html>
<html>
<head>
${head}
</head>
<body>
${body}
</body>
</html>`;
  }

  /**
   * 解析CSS
   * @param {string} css - CSS字符串
   * @returns {Array} CSS规则数组
   */
  parseCss(css) {
    // 简单的CSS规则解析器
    const ruleRegex = /([^{]+)\{([^}]*)\}/g;
    const rules = [];
    let match;
    while ((match = ruleRegex.exec(css)) !== null) {
      const selectors = match[1].trim().split(',').map(s => s.trim());
      const properties = this.parseCssProperties(match[2]);

      for (const selector of selectors) {
        rules.push({
          selector: selector,
          properties: properties,
          originalRule: match[0]
        });
      }
    }
    return rules;
  }

  /**
   * 解析CSS属性
   * @param {string} propString - 属性字符串
   * @returns {Object} 属性对象
   */
  parseCssProperties(propString) {
    const props = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
    let match;
    while ((match = propRegex.exec(propString)) !== null) {
      props[match[1].trim()] = match[2].trim();
    }
    return props;
  }

  /**
   * 合并CSS规则
   * @param {Array} original - 原始规则
   * @param {Array} current - 当前规则
   * @param {Array} incoming - 传入规则
   * @returns {Array} 合并后的规则
   */
  mergeCssRules(original, current, incoming) {
    // 创建基于选择器的映射
    const currentMap = new Map(current.map(rule => [rule.selector, rule]));
    const incomingMap = new Map(incoming.map(rule => [rule.selector, rule]));

    // 合并规则
    const mergedRules = [...current]; // 从当前规则开始

    for (const [selector, incRule] of incomingMap) {
      if (currentMap.has(selector)) {
        // 如果选择器存在，合并属性
        const currentRule = currentMap.get(selector);
        const mergedProps = this.deepMergeObjects(currentRule.properties, incRule.properties);
        currentRule.properties = mergedProps;
      } else {
        // 如果是新选择器，添加到结果中
        mergedRules.push(incRule);
      }
    }

    return mergedRules;
  }

  /**
   * 重建CSS
   * @param {Array} rules - CSS规则
   * @returns {string} 重建的CSS
   */
  rebuildCss(rules) {
    return rules.map(rule => {
      const props = Object.entries(rule.properties)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `${rule.selector} {\n${props}\n}`;
    }).join('\n\n');
  }

  /**
   * 深度合并对象
   * @param {Object} original - 原始对象
   * @param {Object} current - 当前对象
   * @param {Object} incoming - 传入对象
   * @returns {Object} 合并后的对象
   */
  deepMergeObjects(original = {}, current = {}, incoming = {}) {
    // 这是一个三路深度合并函数
    const result = { ...current }; // 从当前值开始

    // 合并incoming到result
    for (const [key, value] of Object.entries(incoming)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
          typeof current[key] === 'object' && current[key] !== null && !Array.isArray(current[key]) &&
          typeof original[key] === 'object' && original[key] !== null && !Array.isArray(original[key])) {
        // 递归合并嵌套对象
        result[key] = this.deepMergeObjects(original[key], current[key], value);
      } else if (original[key] !== undefined && current[key] !== original[key] && value === original[key]) {
        // incoming和original相同，current已更改，保留current
        result[key] = current[key];
      } else if (original[key] !== undefined && value !== original[key] && current[key] === original[key]) {
        // current和original相同，incoming已更改，采用incoming
        result[key] = value;
      } else if (original[key] !== undefined && current[key] !== original[key] && value !== original[key]) {
        // 两个都改变了，采用incoming（也可以抛出冲突）
        result[key] = value;
      } else if (original[key] === undefined && current[key] === undefined) {
        // 两个都是新增的
        result[key] = value;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 列表合并
   * @param {Array} original - 原始列表
   * @param {Array} current - 当前列表
   * @param {Array} incoming - 传入列表
   * @returns {Array} 合并后的列表
   */
  mergeLists(original, current, incoming) {
    // 简单的列表合并，去重并保留所有项
    const allItems = new Set([...current, ...incoming]);
    return Array.from(allItems);
  }

  /**
   * 行级别合并（基础合并方法）
   * @param {string} original - 原始文本
   * @param {string} current - 当前文本
   * @param {string} incoming - 传入文本
   * @returns {string} 合并后的文本
   */
  lineBasedMerge(original, current, incoming) {
    // 完整的三路合并算法实现
    const origLines = original.split('\n');
    const currLines = current.split('\n');
    const incLines = incoming.split('\n');

    // 使用标准的三路合并算法
    return this._threeWayMerge(origLines, currLines, incLines);
  }

  /**
   * 三路合并算法
   * @param {Array<string>} origLines - 原始行数组
   * @param {Array<string>} currLines - 当前行数组
   * @param {Array<string>} incLines - 传入行数组
   * @returns {string} 合并后的文本
   */
  _threeWayMerge(origLines, currLines, incLines) {
    // 实现标准的三路合并算法
    // 找出公共子序列并合并差异
    const commonBase = origLines;
    const ours = currLines;
    const theirs = incLines;

    // 实现标准的三路合并算法，结合多种启发式策略
    const result = [];
    let oIdx = 0, tIdx = 0, ourIdx = 0;

    while (oIdx < commonBase.length || ourIdx < ours.length || tIdx < theirs.length) {
      // 寻找匹配的块
      const commonChunkOurs = this._findCommonSequence(commonBase, oIdx, ours, ourIdx);
      const commonChunkTheirs = this._findCommonSequence(commonBase, oIdx, theirs, tIdx);

      if (commonChunkOurs.length > 0 && commonChunkTheirs.length > 0) {
        // 如果两个分支都包含相同的公共序列
        const minLen = Math.min(commonChunkOurs.length, commonChunkTheirs.length);
        const commonSeq = commonChunkOurs.slice(0, minLen);

        // 添加公共部分
        result.push(...commonSeq);

        // 更新索引
        oIdx += minLen;
        ourIdx += minLen;
        tIdx += minLen;
      } else {
        // 检查是否有冲突（我们的更改和他们的更改）
        const ourChange = this._getNextChange(commonBase, oIdx, ours, ourIdx);
        const theirChange = this._getNextChange(commonBase, oIdx, theirs, tIdx);

        if (ourChange && theirChange) {
          // 冲突：双方都做了更改
          // 尝试合并这些更改
          const mergedChanges = this._resolveSimpleConflict(ourChange.content, theirChange.content);
          result.push(...mergedChanges);

          // 更新索引
          oIdx = ourChange.endOrigIdx;
          ourIdx = ourChange.endOurIdx;
          tIdx = theirChange.endTheirIdx;
        } else if (ourChange) {
          // 只有我们做了更改
          result.push(...ourChange.content);
          oIdx = ourChange.endOrigIdx;
          ourIdx = ourChange.endOurIdx;
        } else if (theirChange) {
          // 只有他们做了更改
          result.push(...theirChange.content);
          oIdx = theirChange.endOrigIdx;
          tIdx = theirChange.endTheirIdx;
        } else {
          // 添加剩余行
          if (oIdx < commonBase.length) result.push(commonBase[oIdx++]);
          else if (ourIdx < ours.length) result.push(ours[ourIdx++]);
          else if (tIdx < theirs.length) result.push(theirs[tIdx++]);
        }
      }
    }

    return result.join('\n');
  }

  /**
   * 查找公共序列
   * @private
   */
  _findCommonSequence(arr1, idx1, arr2, idx2) {
    const common = [];
    while (idx1 < arr1.length && idx2 < arr2.length && arr1[idx1] === arr2[idx2]) {
      common.push(arr1[idx1]);
      idx1++;
      idx2++;
    }
    return common;
  }

  /**
   * 获取下一个更改
   * @private
   */
  _getNextChange(common, commonIdx, other, otherIdx) {
    if (commonIdx >= common.length || otherIdx >= other.length) {
      // 处理数组到达末尾的情况
      if (commonIdx >= common.length && otherIdx < other.length) {
        return {
          content: other.slice(otherIdx),
          endOrigIdx: common.length,
          endOurIdx: other.length
        };
      }
      return null;
    }

    if (common[commonIdx] === other[otherIdx]) {
      // 相同内容，继续前进
      return this._getNextChange(common, commonIdx + 1, other, otherIdx + 1);
    } else {
      // 发现差异，收集更改内容直到再次同步
      const startOtherIdx = otherIdx;
      let foundSync = false;

      // 尝试找到同步点
      for (let i = commonIdx; i < common.length; i++) {
        for (let j = otherIdx; j < other.length; j++) {
          if (common[i] === other[j]) {
            // 找到同步点
            return {
              content: other.slice(otherIdx, j),
              endOrigIdx: i,
              endOurIdx: j
            };
          }
        }
      }

      // 如果找不到同步点，返回剩余的所有内容
      return {
        content: other.slice(otherIdx),
        endOrigIdx: common.length,
        endOurIdx: other.length
      };
    }
  }

  /**
   * 解决简单冲突
   * @private
   */
  _resolveSimpleConflict(ourContent, theirContent) {
    // 简单的冲突解决策略：合并两个更改
    // 在实际应用中，这可能是更复杂的逻辑或用户交互

    // 尝试找出两个版本的不同之处并合并
    const merged = [];

    // 如果内容完全不同，简单合并
    if (JSON.stringify(ourContent) !== JSON.stringify(theirContent)) {
      // 检查是否是添加了不同的内容
      const ourAdded = ourContent.filter(item => !theirContent.includes(item));
      const theirAdded = theirContent.filter(item => !ourContent.includes(item));

      // 添加共同的内容
      const common = ourContent.filter(item => theirContent.includes(item));
      merged.push(...common);

      // 添加各自独有的内容
      merged.push(...ourAdded);
      merged.push(...theirAdded);
    } else {
      // 内容相同，直接返回
      merged.push(...ourContent);
    }

    return merged;
  }
}

module.exports = IncrementalProcessor;