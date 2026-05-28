#!/usr/bin/env node

/**
 * 编排器 API 服务器
 *
 * 作为 Claude Code 和 CCR Router 之间的代理层
 * 所有请求先经过编排器，由编排器决定如何处理
 *
 * 工作流程：
 * 1. 接收 Claude Code 的请求
 * 2. 判断是否需要任务分解
 * 3. 如果需要：分解任务 → 选择模型 → 并发执行 → 整合结果 → 返回
 * 4. 如果不需要：转发给 CCR Router
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const ElasticDecomposer = require('../decomposer');
const HybridTaskConverter = require('./HybridTaskConverter');
const { ModelSelector } = require('../selector');
const OrchestratorExecutorIntegration = require('./OrchestratorExecutorIntegration');
const ModelHealthChecker = require('./utils/ModelHealthChecker');
const ModelStatusBroadcaster = require('./utils/ModelStatusBroadcaster');
const TaskComplexityAnalyzer = require('./utils/TaskComplexityAnalyzer');
const ConfigService = require('../../config/ConfigService');
const { Integrator } = require('../integrator');
const { OutputFormatter, OutputFormat } = require('../integrator/output/formatter');
const { OrchestratorCacheManager } = require('./utils/OrchestratorCacheManager');
const { ProgressTracker } = require('./utils/ProgressTracker');
const MetricsAPI = require('../api/metrics-api');
const { MetricsCollector } = require('../metrics/MetricsCollector');
const FlowMonitor = require('./FlowMonitor');
const ContractGenerator = require('../decomposer/contract/ContractGenerator');
const DeepSeekLLMClient = require('../decomposer/llm/DeepSeekLLMClient');
const express = require('express');

// 会话管理相关模块 (conditional loading)
let SessionManager, RequestClassifier, IncrementalProcessor, Corrector, SessionRequestRouter, DependencyGraph;

// 步骤名映射：从英文到中文
const STEP_LABELS = {
  // 编排阶段
  'start': '开始编排',
  'request_received': '接收请求',
  'task_formatting': '格式化任务',
  'orchestration_complete': '编排完成',

  // 分解阶段
  'decomposer_init': '初始化分解器',
  'task_analysis': '分析任务',
  'task_parsing': '解析任务',
  'subtask_generation': '生成子任务',
  'dependency_analysis': '分析依赖',
  'quality_check': '质量检查',
  'decomposition_complete': '分解完成',

  // 模型选择阶段
  'receiving_tasks': '接收子任务',
  'analyzing_subtasks': '分析子任务',
  'model_matching': '匹配模型',
  'cost_estimation': '估算成本',
  'model_selection_complete': '选择完成',

  // 执行阶段
  'prompt_generation': '生成提示词',
  'resource_allocation': '分配资源',
  'concurrent_execution': '并发执行',
  'result_aggregation': '聚合结果',
  'execution_complete': '执行完成',

  // 整合阶段
  'integration_start': '开始整合',
  'result_merging': '合并结果',
  'conflict_resolution': '解决冲突',
  'format_conversion': '格式转换',
  'quality_validation': '质量验证',
  'integration_complete': '整合完成',

  // 通用
  'complete': '完成',
  'fail': '失败'
};

class OrchestratorServer {
  constructor(config = {}) {
    // 添加日志缓冲区 - 必须在调用其他可能产生日志的方法之前初始化
    this.logBuffer = [];
    this.maxLogEntries = 1000;  // 限制最大日志条数防止内存溢出

    // 使用 ConfigService 从统一配置文件读取配置
    const path = require('path');
    const configPath = 'C:/Users/LWB/OrchestRouter/config/config.json';
    const configService = new ConfigService(configPath);
    const fullConfig = configService.getConfig();

    // 【调试】验证 model_task_matrix 是否被正确读取
    console.log(`[OrchestratorServer] configPath: ${configPath}`);
    console.log(`[OrchestratorServer] fullConfig.model_task_matrix exists: ${!!fullConfig.model_task_matrix}`);
    console.log(`[OrchestratorServer] fullConfig.model_task_matrix keys: ${fullConfig.model_task_matrix ? Object.keys(fullConfig.model_task_matrix) : 'N/A'}`);
    if (fullConfig.model_task_matrix && fullConfig.model_task_matrix.suitabilityMatrix) {
      console.log(`[OrchestratorServer] suitabilityMatrix models: ${Object.keys(fullConfig.model_task_matrix.suitabilityMatrix).join(', ')}`);
    }

    const orchestratorConfig = fullConfig.orchestrator || {};
    const systemConfig = fullConfig.system || {};

    // 配置优先级：命令行/环境变量参数 > orchestrator 节点 > system 节点 > 默认值
    this.config = {
      port: config.port || orchestratorConfig.port || systemConfig.port || 3458,
      ccrRouterUrl: config.ccrRouterUrl || orchestratorConfig.ccrRouterUrl || systemConfig.ccrRouterUrl || 'http://127.0.0.1:3456',
      debug: config.debug ?? orchestratorConfig.debug ?? systemConfig.debug ?? false,
      autoOrchestrate: config.autoOrchestrate !== false && orchestratorConfig.autoOrchestrate !== false,
      orchestrationThreshold: config.orchestrationThreshold || orchestratorConfig.orchestrationThreshold || 0.7,
      maxConcurrency: config.maxConcurrency || orchestratorConfig.maxConcurrency || systemConfig.maxConcurrency || 5,
      timeout: config.timeout || orchestratorConfig.timeout || 300000,
      tokenLimit: config.tokenLimit || systemConfig.tokenLimit || 50000, // 默认 50000 token，支持更复杂的任务

      // 新增会话管理配置
      enableSessionSupport: config.enableSessionSupport ?? systemConfig.enableSessionSupport ?? false,
      sessionStoreType: config.sessionStoreType || systemConfig.sessionStoreType || 'memory',
      sessionTtl: config.sessionTtl || systemConfig.sessionTtl || 3600000, // 1小时默认
      sessionMaxSize: config.sessionMaxSize || systemConfig.sessionMaxSize || 50 * 1024 * 1024, // 50MB默认

      // 完整配置对象（用于 UI 配置管理）
      system: { ...systemConfig, ...config.system },
      Providers: fullConfig.Providers || [],
      selector: fullConfig.selector || {},
      costControl: fullConfig.costControl || {},
      executor: fullConfig.executor || {},
      decomposer: fullConfig.decomposer || {},

      // 【修复】多维度模型选择矩阵配置
      model_task_matrix: fullConfig.model_task_matrix || {},

      // 扩展模块配置（从 orchestrator_extensions 节点读取）
      extensions: fullConfig.orchestrator_extensions || {},

      // 流式配置
      streaming: fullConfig.streaming || {}
    };

    // 保存 ConfigService 实例供后续使用
    this.configService = configService;

    this.server = null;
    this.decomposer = null;
    this.hybridConverter = null;
    this.modelSelector = null;
    this.executorIntegration = null;
    this.integrator = null;
    this.complexityAnalyzer = null;
    this.modelStatusBroadcaster = null; // 模型状态广播器
    this.outputFormatter = new OutputFormatter(); // 初始化输出格式化器

    // 响应备份配置 - 当 agent 无法接收响应时自动保存到磁盘
    this.responseBackup = {
      enabled: this.config.responseBackup?.enabled ?? true,  // 默认启用
      path: this.config.responseBackup?.path || 'responses',    // 保存目录
      maxFiles: this.config.responseBackup?.maxFiles || 1000,   // 最大文件数
      saveOnError: this.config.responseBackup?.saveOnError ?? true, // 即使成功也保存
      includeTimestamp: true // 文件名包含时间戳
    };

    // 从 extensions 配置读取缓存配置
    const cacheConfig = this.config.extensions?.cache || {};
    // 初始化编排器缓存管理器（默认禁用缓存）
    this.cacheManager = new OrchestratorCacheManager({
      enabled: cacheConfig.enabled ?? this.config.cache?.enabled ?? false,
      defaultTTL: cacheConfig.defaultTTL || this.config.cache?.ttl || 3600000, // 1 hour default
      maxEntries: cacheConfig.maxEntries || this.config.cache?.maxEntries || 1000,
      persistenceEnabled: cacheConfig.persistenceEnabled ?? this.config.cache?.persistenceEnabled ?? true,
      llm: cacheConfig.llm || {}
    });

    // 初始化进度追踪器
    this.progressTracker = new ProgressTracker();

    // 初始化流程监控器
    this.flowMonitor = new FlowMonitor();

    // 初始化任务中断控制器
    const TaskAbortController = require('./TaskAbortController');
    this.taskAbortController = TaskAbortController.getInstance();

    // 初始化多轮对话管理器
    const MultiTurnConversationManager = require('./MultiTurnConversationManager');
    const streamingConfig = this.config.streaming || {};
    this.conversationManager = MultiTurnConversationManager.getInstance({
      heartbeatInterval: streamingConfig.heartbeatInterval || 30000,
      maxIdleTime: streamingConfig.idleTimeout || 1800000
    });

    // 初始化整合器配置
    this.integratorConfig = {
      debug: this.config.debug,
      cache: {
        enabled: this.config.integrator?.cache?.enabled ?? true,
        persistenceEnabled: this.config.integrator?.cache?.persistenceEnabled ?? true
      },
      runtimeDependencies: {
        enabled: this.config.integrator?.runtimeDependencies?.enabled ?? true,
        outputReport: this.config.integrator?.runtimeDependencies?.outputReport ?? true
      },
      entryPoint: {
        enabled: this.config.integrator?.entryPoint?.enabled ?? true
      },
      formatting: this.config.integrator?.formatting || {},
      execution: this.config.integrator?.execution || {},
      conflict: this.config.integrator?.conflict || {},
      dependency: this.config.integrator?.dependency || {},
      plugins: this.config.integrator?.plugins || {},
      logger: console
    };

    // 初始化会话组件（如果启用会话支持）
    if (this.config.enableSessionSupport) {
      this._initSessionManagement();
    }

    this._log('编排器服务器初始化完成');
    if (Object.keys(fullConfig).length > 0) {
      this._log('已从配置文件加载配置');
    }
    if (this.config.integrator) {
      this._log('整合器配置已加载');
    }
  }

  /**
   * 从文件加载配置
   */
  _loadConfigFromFile() {
    const fs = require('fs');
    const path = require('path');

    const possiblePaths = [
      path.join(__dirname, '../../config/config.json'),
      path.join(__dirname, '../../config/unified-config.json'),
      path.join(process.cwd(), 'config/config.json')
    ];

    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);
          if (config.Providers && Array.isArray(config.Providers)) {
            this._log(`已从 ${configPath} 加载配置`);
            return config;
          }
        }
      } catch (error) {
        this._log(`读取配置文件失败 ${configPath}: ${error.message}`, 'warn');
      }
    }

    return {};
  }

  /**
   * 日志方法 - 同时输出到控制台和缓冲区
   */
  _log(message, level = 'info', module = 'Orchestrator') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, module };

    // 输出到控制台（保持原有行为）
    console.log(`[${timestamp}] [${module}] [${level}] ${message}`);

    // 添加到内存缓冲区
    this._addToLogBuffer(logEntry);
  }

  /**
   * 添加日志到缓冲区（带容量控制）
   */
  _addToLogBuffer(logEntry) {
    this.logBuffer.push(logEntry);

    // 如果超过最大容量，移除最旧的日志
    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer = this.logBuffer.slice(-this.maxLogEntries);
    }
  }

  /**
   * Get default model from configuration or environment
   */
  _getDefaultModel() {
    // Check environment variable first
    const envDefaultModel = process.env.DEFAULT_MODEL;
    if (envDefaultModel) {
      return envDefaultModel;
    }

    // Check configuration for default model
    if (this.config && this.config.selector && this.config.selector.default) {
      // Extract model from selector configuration (format: "provider,modelId")
      const selectorParts = this.config.selector.default.split(',');
      if (selectorParts.length >= 2) {
        return selectorParts[1].trim();
      }
    }

    // Look through providers for a suitable default
    if (this.config && this.config.Providers && Array.isArray(this.config.Providers)) {
      for (const provider of this.config.Providers) {
        if (provider.models && Array.isArray(provider.models)) {
          // Try to find a reasonable default model (prioritizing common ones)
          const preferredModels = provider.models.filter(model =>
            model.id.includes('gpt') ||
            model.id.includes('qwen') ||
            model.id.includes('MiniMax')
          );

          if (preferredModels.length > 0) {
            return preferredModels[0].id;
          }

          // If no preferred model found, return the first available
          if (provider.models.length > 0) {
            return provider.models[0].id;
          }
        }
      }
    }

    // Final fallback to a standard model
    return 'MiniMax-M2.5';
  }

  /**
   * 更新配置
   */
  _updateConfig(newConfig) {
    const fs = require('fs');
    const path = require('path');

    // 使用 ConfigService 统一保存配置，确保两个配置源同步
    const success = this.configService.saveConfig(newConfig);

    if (success) {
      // 同步更新 OrchestratorServer 的配置为 ConfigService 的配置
      this.config = this.configService.getConfig();
      this._log('配置已更新并同步到 ConfigService');
    } else {
      // 回退到直接保存
      this.config = {
        ...this.config,
        ...newConfig,
        system: { ...this.config.system, ...newConfig.system },
        selector: { ...this.config.selector, ...newConfig.selector },
        costControl: { ...this.config.costControl, ...newConfig.costControl },
        executor: { ...this.config.executor, ...newConfig.executor },
        decomposer: { ...this.config.decomposer, ...newConfig.decomposer }
      };

      const configPath = path.join(__dirname, '../../config/config.json');
      try {
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
        this._log('配置已保存到文件：' + configPath);
      } catch (error) {
        this._log('保存配置文件失败：' + error.message, 'error');
      }
    }

    // 如果更新了系统配置，可能需要重启服务（此处仅记录日志）
    if (newConfig.system?.port || newConfig.system?.debug) {
      this._log('系统配置已更新，部分更改可能需要重启服务才能生效', 'warn');
    }
  }

  /**
   * 判断请求是否需要任务分解
   * 使用混合式任务复杂度分析器（规则 + LLM 语义理解）
   */
  async _shouldDecompose(requestBody, saveAnalysis = false) {
    const userMessage = this._extractUserMessage(requestBody);

    if (!userMessage ||
        (typeof userMessage === 'string' && userMessage.trim().length === 0) ||
        (typeof userMessage === 'object' && Object.keys(userMessage).length === 0)) {
      return false;
    }

    // 确保复杂度分析器已初始化
    if (!this.complexityAnalyzer) {
      // 尝试获取 LLM 客户端
      let llmClient = null;

      // 首先尝试从 decomposer 获取
      if (this.decomposer && this.decomposer.typeAnnotator && this.decomposer.typeAnnotator.concurrentLLMInferencer) {
        llmClient = this.decomposer.typeAnnotator.concurrentLLMInferencer.llmClient;
      }

      // 如果没有，尝试从构造函数路径获取
      if (!llmClient && this.decomposer) {
        llmClient = this.decomposer.typeAnnotator?.concurrentLLMInferencer?.llmClient;
      }

      this._log(`初始化任务复杂度分析器，LLM客户端存在: ${!!llmClient}`, 'debug');

      this.complexityAnalyzer = new TaskComplexityAnalyzer({
        llmClient: llmClient,
        config: this.config.orchestrator?.taskComplexityAnalysis
      });
    }

    try {
      // Convert object input to string representation for complexity analysis
      let analysisInput = userMessage;
      if (typeof userMessage === 'object') {
        analysisInput = JSON.stringify(userMessage, null, 2);
      }

      const analysisResult = await this.complexityAnalyzer.analyze(analysisInput);

      this._log(`任务复杂度分析结果：isComplex=${analysisResult.isComplex}, ` +
                `confidence=${analysisResult.confidence}, method=${analysisResult.method}`, 'debug');

      // 如果需要保存分析结果（用于后续的模型选择）
      if (saveAnalysis) {
        this.lastComplexityAnalysis = {
          isComplex: analysisResult.isComplex,
          confidence: analysisResult.confidence,
          method: analysisResult.method,
          reason: analysisResult.reason,
          suggestedAction: analysisResult.suggestedAction,
          timestamp: Date.now()
        };
        this._log(`复杂度分析结果已保存：${JSON.stringify(this.lastComplexityAnalysis)}`, 'debug');
      }

      return analysisResult.isComplex;
    } catch (error) {
      this._log(`任务复杂度分析时出错: ${error.message}`, 'error');

      // 如果分析失败，回退到原来的简单规则判断
      let separatorCount = 0;
      if (typeof userMessage === 'string') {
        separatorCount = (userMessage.match(/[，,、]/g) || []).length;
        if (separatorCount >= 2) {
          this._log(`回退：检测到 ${separatorCount} 个分隔符，认为是复杂任务`, 'debug');
          return true;
        }
      }

      return false; // 安全起见，不分解
    }
  }

  /**
   * 获取任务的复杂度分析结果（不执行分析，只返回之前保存的结果）
   * @returns {Object|null} 复杂度分析结果，如果没有则返回 null
   */
  _getComplexityAnalysis() {
    return this.lastComplexityAnalysis || null;
  }

  /**
   * 执行复杂度分析并返回完整结果（用于模型选择）
   * @param {Object} requestBody - 请求体
   * @returns {Object} 复杂度分析结果
   */
  async _analyzeComplexity(requestBody) {
    const userMessage = this._extractUserMessage(requestBody);

    if (!userMessage ||
        (typeof userMessage === 'string' && userMessage.trim().length === 0) ||
        (typeof userMessage === 'object' && Object.keys(userMessage).length === 0)) {
      return { isComplex: false, confidence: 1.0, method: 'empty_input' };
    }

    // 确保复杂度分析器已初始化
    if (!this.complexityAnalyzer) {
      let llmClient = null;
      if (this.decomposer && this.decomposer.typeAnnotator && this.decomposer.typeAnnotator.concurrentLLMInferencer) {
        llmClient = this.decomposer.typeAnnotator.concurrentLLMInferencer.llmClient;
      }
      if (!llmClient && this.decomposer) {
        llmClient = this.decomposer.typeAnnotator?.concurrentLLMInferencer?.llmClient;
      }

      this.complexityAnalyzer = new TaskComplexityAnalyzer({
        llmClient: llmClient,
        config: this.config.orchestrator?.taskComplexityAnalysis
      });
    }

    // 使用缓存包装复杂度分析
    const analyzeFn = async () => {
      try {
        let analysisInput = userMessage;
        if (typeof userMessage === 'object') {
          analysisInput = JSON.stringify(userMessage, null, 2);
        }

        const analysisResult = await this.complexityAnalyzer.analyze(analysisInput);

        // 保存结果供后续使用
        this.lastComplexityAnalysis = {
          isComplex: analysisResult.isComplex,
          confidence: analysisResult.confidence,
          method: analysisResult.method,
          reason: analysisResult.reason,
          suggestedAction: analysisResult.suggestedAction,
          timestamp: Date.now()
        };

        return this.lastComplexityAnalysis;
      } catch (error) {
        this._log(`复杂度分析失败: ${error.message}`, 'error');
        return { isComplex: false, confidence: 0.3, method: 'error_fallback' };
      }
    };

    // 使用缓存管理器
    if (this.cacheManager && this.cacheManager.withComplexityCache) {
      return await this.cacheManager.withComplexityCache(requestBody, analyzeFn, {
        ttl: 1800000 // 30分钟缓存
      });
    }

    // 如果没有缓存管理器，直接执行
    return await analyzeFn();
  }

  /**
   * 从请求体中提取用户消息
   */
  _extractUserMessage(requestBody) {
    if (!requestBody) return '';

    try {
      // 优先检查结构化任务对象
      if (requestBody.task && typeof requestBody.task === 'object') {
        return requestBody.task;  // 直接返回结构化任务对象
      }

      // Anthropic API 格式
      if (requestBody.messages && Array.isArray(requestBody.messages)) {
        const userMessages = requestBody.messages.filter(m => m && m.role === 'user');
        if (userMessages.length > 0) {
          const lastUserMessage = userMessages[userMessages.length - 1];
          if (lastUserMessage && lastUserMessage.content) {
            if (typeof lastUserMessage.content === 'string') {
              return lastUserMessage.content;
            }
            if (Array.isArray(lastUserMessage.content)) {
              return lastUserMessage.content
                .filter(item => item && item.type === 'text' && item.text)
                .map(item => item.text)
                .join(' ');
            }
          }
        }
      }

      // 直接消息格式
      if (requestBody.prompt) {
        return String(requestBody.prompt);
      }

      if (requestBody.message) {
        return String(requestBody.message);
      }
    } catch (error) {
      this._log(`提取用户消息时出错: ${error.message}`, 'error');
    }

    return '';
  }

  /**
   * 将自然语言任务描述转换为结构化任务
   * 使用混合转换器（规则 + LLM）
   */
  async _convertToStructuredTask(description) {
    if (this.hybridConverter) {
      return await this.hybridConverter.convert(description);
    }
    // 回退到规则匹配
    return this._convertToStructuredTaskRuleBased(description);
  }

  /**
   * 基于规则的结构化任务转换（回退方法）
   */
  _convertToStructuredTaskRuleBased(description) {
    const deliverables = [];
    const parts = description.split(/[,;,;]|\band\b|\bor\b|\bwith\b|\b 包含\b|\b 包括\b|\b 需要\b/g);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      const typeScores = {
        'ui': 0, 'api': 0, 'model': 0, 'style': 0,
        'test': 0, 'config': 0, 'logic': 0, 'database': 0, 'general': 0
      };

      if (/(页面 | 界面|view|page|component|ui|frontend|前端 | 渲染 | 显示 | 布局 | 导航 | 菜单 | 表单 | 按钮 | 组件 | 仪表盘|dashboard|图表|chart)/i.test(part)) typeScores.ui++;
      if (/(api|接口|endpoint|route|backend|后端 | 服务 | 请求|response|rest|graphql|微服务 | 网关)/i.test(part)) typeScores.api++;
      if (/(模型|model|schema|entity|数据 | 结构 |orm|实体 | 存储 | 持久化)/i.test(part)) typeScores.model++;
      if (/(样式|style|css|scss|design|主题|theme|颜色|font|响应式 | 动画)/i.test(part)) typeScores.style++;
      if (/(测试|test|spec|unit|integration|e2e|自动化|mock|assert|验证)/i.test(part)) typeScores.test++;
      if (/(配置|config|setting|环境|env|部署|deploy|参数 | 变量)/i.test(part)) typeScores.config++;
      if (/(逻辑|logic|algorithm|function|业务 | 算法 | 计算 | 规则|rule|工作流|状态)/i.test(part)) typeScores.logic++;
      if (/(数据库|database|migration|query|sql|index|transaction|crud|存储过程)/i.test(part)) typeScores.database++;

      let maxType = 'general';
      let maxScore = 0;
      for (const [type, score] of Object.entries(typeScores)) {
        if (score > maxScore) { maxScore = score; maxType = type; }
      }

      if (maxScore > 0) {
        deliverables.push({
          id: `deliverable-${Date.now()}-${i}`,
          description: part,
          type: maxType,
          priority: 'medium',
          ruleScore: maxScore
        });
      }
    }

    if (deliverables.length === 0) {
      deliverables.push({
        id: `deliverable-${Date.now()}`,
        description: description,
        type: 'general',
        priority: 'medium'
      });
    }

    return {
      title: description.substring(0, 50) + (description.length > 50 ? '...' : ''),
      description: description,
      deliverables: deliverables,
      source: 'rule_based'
    };
  }

  /**
   * 解析 HTTP 请求体
   */
  _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 从自然语言中提取背景信息
   * @param {string} naturalLanguageInput - 自然语言输入
   * @returns {Object} 包含 context 和 requirement 的对象
   */
  _extractBackgroundInfoFromNaturalLanguage(naturalLanguageInput) {
    const result = {
      context: {},
      requirement: naturalLanguageInput
    };

    const lowerCaseInput = naturalLanguageInput.toLowerCase();
    const lines = naturalLanguageInput.split('\n').map(line => line.trim());

    // 提取项目类型
    if (lowerCaseInput.includes('网站') || lowerCaseInput.includes('web') || lowerCaseInput.includes('frontend')) {
      result.context.projectType = 'web';
    } else if (lowerCaseInput.includes('app') || lowerCaseInput.includes('mobile')) {
      result.context.projectType = 'mobile';
    } else if (lowerCaseInput.includes('api') || lowerCaseInput.includes('backend') || lowerCaseInput.includes('server')) {
      result.context.projectType = 'backend';
    } else {
      result.context.projectType = 'fullstack';
    }

    // 提取技术栈
    const techStack = [];
    if (lowerCaseInput.includes('react') || lowerCaseInput.includes('jsx')) techStack.push('React');
    if (lowerCaseInput.includes('vue') || lowerCaseInput.includes('vuejs')) techStack.push('Vue.js');
    if (lowerCaseInput.includes('angular')) techStack.push('Angular');
    if (lowerCaseInput.includes('typescript') || lowerCaseInput.includes('ts')) techStack.push('TypeScript');
    if (lowerCaseInput.includes('javascript') || lowerCaseInput.includes('js')) techStack.push('JavaScript');
    if (lowerCaseInput.includes('python')) techStack.push('Python');
    if (lowerCaseInput.includes('django')) techStack.push('Django');
    if (lowerCaseInput.includes('flask')) techStack.push('Flask');
    if (lowerCaseInput.includes('node') && lowerCaseInput.includes('js')) techStack.push('Node.js');
    if (lowerCaseInput.includes('express')) techStack.push('Express.js');
    if (lowerCaseInput.includes('java')) techStack.push('Java');
    if (lowerCaseInput.includes('spring')) techStack.push('Spring');
    if (lowerCaseInput.includes('go') || lowerCaseInput.includes('golang')) techStack.push('Go');
    if (lowerCaseInput.includes('postgresql') || lowerCaseInput.includes('postgres')) techStack.push('PostgreSQL');
    if (lowerCaseInput.includes('mysql')) techStack.push('MySQL');
    if (lowerCaseInput.includes('mongodb')) techStack.push('MongoDB');
    if (lowerCaseInput.includes('redis')) techStack.push('Redis');

    result.context.techStack = techStack.length > 0 ? techStack : ['Unknown'];

    // 尝试提取主要需求描述
    // 查找包含关键词的句子
    const sentences = naturalLanguageInput.split(/[.!?。！？]+/).map(s => s.trim());
    const requirementParts = [];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (
        lowerSentence.includes('开发') || lowerSentence.includes('创建') ||
        lowerSentence.includes('实现') || lowerSentence.includes('构建') ||
        lowerSentence.includes('制作') || lowerSentence.includes('设计') ||
        lowerSentence.includes('需要') || lowerSentence.includes('要求') ||
        lowerSentence.includes('做一个') || lowerSentence.includes('一个')
      ) {
        if (sentence.length > 10) { // 避免过于简单的句子
          requirementParts.push(sentence);
        }
      }
    }

    if (requirementParts.length > 0) {
      result.requirement = requirementParts.join('. ') + '.';
    }

    // 添加项目描述
    result.context.description = naturalLanguageInput.substring(0, 200) + (naturalLanguageInput.length > 200 ? '...' : '');

    // 检测是否包含特殊要求
    if (lowerCaseInput.includes('认证') || lowerCaseInput.includes('auth') || lowerCaseInput.includes('login') || lowerCaseInput.includes('register')) {
      result.context.hasAuthentication = true;
    }
    if (lowerCaseInput.includes('数据库') || lowerCaseInput.includes('data') || lowerCaseInput.includes('存储')) {
      result.context.hasDatabase = true;
    }
    if (lowerCaseInput.includes('api') || lowerCaseInput.includes('接口')) {
      result.context.hasAPI = true;
    }
    if (lowerCaseInput.includes('ui') || lowerCaseInput.includes('界面') || lowerCaseInput.includes('页面') || lowerCaseInput.includes('前端')) {
      result.context.hasFrontend = true;
    }

    return result;
  }

  /**
   * 发送 JSON 响应
   */
  _sendJSON(res, statusCode, data) {
    // 后备机制：将响应保存到磁盘
    this._saveResponseToDisk(data, statusCode);

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  }

  /**
   * 将响应保存到磁盘作为后备机制
   * @param {Object} data - 响应数据
   * @param {number} statusCode - HTTP 状态码
   */
  _saveResponseToDisk(data, statusCode) {
    if (!this.responseBackup?.enabled) {
      return;
    }

    try {
      const fs = require('fs');
      const path = require('path');

      // 确保响应包含有效的 content（tool_calls 格式）
      if (!data || !data.content || !Array.isArray(data.content)) {
        return;
      }

      // 创建带时间戳的文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `response_${timestamp}_${statusCode}.json`;
      const filepath = path.resolve(this.responseBackup.path, filename);

      // 确保目录存在
      fs.mkdirSync(this.responseBackup.path, { recursive: true });

      // 保存响应
      const saveData = {
        savedAt: new Date().toISOString(),
        statusCode,
        contentCount: data.content?.length || 0,
        files: data.content?.map(item => ({
          type: item.type,
          name: item.name,
          file_path: item.input?.file_path || null,
          content_length: item.input?.content?.length || 0
        })) || [],
        fullResponse: data
      };

      fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2), 'utf8');
      this._log(`[响应备份] 已保存响应到: ${filepath}`, 'debug');

      // 清理旧文件，保持文件数量在限制内
      this._cleanupOldResponseFiles();
    } catch (error) {
      // 保存失败不影响正常响应发送
      this._log(`[响应备份] 保存失败: ${error.message}`, 'warn');
    }
  }

  /**
   * 清理旧的响应备份文件
   */
  _cleanupOldResponseFiles() {
    try {
      const fs = require('fs');
      const path = require('path');

      const dir = this.responseBackup.path;
      if (!fs.existsSync(dir)) return;

      // 读取目录中的所有文件
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('response_') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // 按时间倒序

      // 删除超出限制的旧文件
      if (files.length > this.responseBackup.maxFiles) {
        const toDelete = files.slice(this.responseBackup.maxFiles);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
          this._log(`[响应备份] 已删除旧文件: ${file.name}`, 'debug');
        }
      }
    } catch (error) {
      this._log(`[响应备份] 清理失败: ${error.message}`, 'warn');
    }
  }

  /**
   * 处理 SSE 流程事件订阅
   * @param {Object} req - HTTP 请求
   * @param {Object} res - HTTP 响应
   * @param {string} sessionId - 可选的会话ID，用于过滤特定会话的事件
   */
  _handleFlowSubscribe(req, res, sessionId = null) {
    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // 发送初始连接成功消息
    const connectedMsg = {
      type: 'connected',
      timestamp: Date.now(),
      sessionId
    };
    res.write(`data: ${JSON.stringify(connectedMsg)}\n\n`);

    // 订阅 FlowMonitor
    const unsubscribe = this.flowMonitor.subscribeSSE((message) => {
      // 如果指定了 sessionId，过滤只发送该会话的事件
      if (sessionId) {
        try {
          const event = JSON.parse(message.replace(/^data: /, ''));
          // 检查事件是否属于指定的会话
          if (event.orchestrationId && event.orchestrationId !== sessionId) {
            return; // 跳过不匹配的事件
          }
        } catch (e) {
          // 解析失败，发送原始消息
        }
      }
      res.write(message);
    });

    // 处理客户端断开连接
    req.on('close', () => {
      unsubscribe();
      this._log(`SSE 客户端断开连接${sessionId ? ` (session: ${sessionId})` : ''}`);
    });

    req.on('error', () => {
      unsubscribe();
    });

    this._log(`SSE 客户端已连接${sessionId ? ` (session: ${sessionId})` : ''}`);
  }

  /**
   * 处理模型响应 SSE 订阅（与 UI useModelResponseSSE hook 兼容）
   * @param {Object} req - HTTP 请求
   * @param {Object} res - HTTP 响应
   * @param {string} sessionId - 可选的会话ID
   */
  _handleModelResponseSubscribe(req, res, sessionId = null) {
    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // 生成会话ID
    const actualSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 发送初始连接成功消息
    const connectedMsg = {
      type: 'connected',
      timestamp: Date.now(),
      sessionId: actualSessionId
    };
    res.write(`data: ${JSON.stringify(connectedMsg)}\n\n`);

    // 订阅 FlowMonitor 并转换事件格式
    const unsubscribe = this.flowMonitor.subscribeSSE((message) => {
      try {
        const event = JSON.parse(message.replace(/^data: /, ''));

        // 如果指定了 sessionId，过滤只发送该会话的事件
        if (sessionId && event.orchestrationId && event.orchestrationId !== sessionId) {
          return;
        }

        // 转换事件格式为 UI 期望的格式
        let transformedEvent = null;

        if (event.event === 'thinking_progress' || event.type === 'thinking_progress') {
          transformedEvent = {
            type: 'thinking',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `thinking_${Date.now()}`,
            content: event.content || event.thinking || '',
            timestamp: event.timestamp || Date.now()
          };
        } else if (event.event === 'tool_call_progress' || event.type === 'tool_call_progress') {
          transformedEvent = {
            type: 'tool_call',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `tool_${Date.now()}`,
            toolName: event.toolCall?.name || event.tool_name || '',
            toolArgs: event.toolCall?.arguments || event.tool_arguments || {},
            content: JSON.stringify(event.toolCall || {}),
            timestamp: event.timestamp || Date.now()
          };
        } else if (event.event === 'tool_result' || event.type === 'tool_result') {
          transformedEvent = {
            type: 'tool_result',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `result_${Date.now()}`,
            toolName: event.toolName || '',
            toolResult: event.result || event.toolResult || '',
            content: JSON.stringify(event.result || {}),
            timestamp: event.timestamp || Date.now()
          };
        } else if (event.event === 'text_delta' || event.type === 'text_delta') {
          transformedEvent = {
            type: 'response',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `text_${Date.now()}`,
            content: event.content || event.text || '',
            timestamp: event.timestamp || Date.now()
          };
        } else if (event.event === 'execution_complete' || event.type === 'execution_complete' || event.event === 'orchestration_complete') {
          transformedEvent = {
            type: 'complete',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `complete_${Date.now()}`,
            content: '',
            duration: event.duration || 0,
            timestamp: event.timestamp || Date.now()
          };
        } else if (event.event === 'error' || event.type === 'error') {
          transformedEvent = {
            type: 'error',
            taskId: event.orchestrationId || event.taskId || actualSessionId,
            id: event.id || `error_${Date.now()}`,
            content: event.error || event.message || 'Unknown error',
            timestamp: event.timestamp || Date.now()
          };
        }

        if (transformedEvent) {
          res.write(`data: ${JSON.stringify(transformedEvent)}\n\n`);
        }
      } catch (e) {
        // 解析失败，发送原始消息
        res.write(message);
      }
    });

    // 处理客户端断开连接
    req.on('close', () => {
      unsubscribe();
      this._log(`[ModelResponse] SSE 客户端断开连接${sessionId ? ` (session: ${sessionId})` : ''}`);
    });

    req.on('error', () => {
      unsubscribe();
    });

    this._log(`[ModelResponse] SSE 客户端已连接${sessionId ? ` (session: ${sessionId})` : ''}`);
  }

  /**
   * 转发请求到 CCR Router
   */
  _forwardToCCR(requestBody, originalHeaders) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.config.ccrRouterUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        // 确保请求体是有效的，否则使用默认值
        let validRequestBody = requestBody;
        if (!requestBody || typeof requestBody !== 'object') {
          validRequestBody = {
            messages: [{ role: 'user', content: 'Hello' }]
          };
          this._log('使用默认请求体，因为原请求体无效', 'warn');
        }

        // 确保消息格式正确
        if (!validRequestBody.messages || !Array.isArray(validRequestBody.messages) || validRequestBody.messages.length === 0) {
          validRequestBody = {
            messages: [{ role: 'user', content: typeof requestBody === 'string' ? requestBody : 'Hello' }]
          };
          this._log('修正请求体的消息格式', 'warn');
        }

        // 确保每个消息都有正确的格式
        validRequestBody.messages = validRequestBody.messages.map(msg => {
          if (!msg.role || !msg.content) {
            return {
              role: msg.role || 'user',
              content: msg.content || 'Hello'
            };
          }
          return msg;
        });

        const payload = JSON.stringify(validRequestBody);

        // 安全地构建headers，避免undefined值
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Accept': 'application/json'
        };

        // 只有当值存在时才添加到headers中
        if (originalHeaders) {
          const authHeader = originalHeaders.authorization || originalHeaders.Authorization;
          if (authHeader) {
            headers['Authorization'] = authHeader;
          }

          const apiKeyHeader = originalHeaders['x-api-key'] || originalHeaders['X-Api-Key'];
          if (apiKeyHeader) {
            headers['x-api-key'] = apiKeyHeader;
          }
        }

        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: '/v1/messages',  // 使用 Anthropic API 标准路径
          method: 'POST',
          headers: headers,
          timeout: this.config.timeout || 300000  // 使用配置的超时时间，默认 5 分钟
        };

        this._log(`转发请求到 CCR Router: ${this.config.ccrRouterUrl}/v1/messages`);
        this._log(`转发内容: ${payload.substring(0, 200)}...`, 'debug');

        const req = httpModule.request(options, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: JSON.parse(data)
              });
            } catch (e) {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
              });
            }
          });
        });

        req.on('error', (err) => {
          this._log(`CCR Router 连接错误: ${err.message}`, 'error');
          reject(err);
        });

        req.on('timeout', () => {
          this._log('CCR Router 请求超时', 'error');
          req.destroy();
          reject(new Error('CCR Router timeout'));
        });

        req.write(payload);
        req.end();
      } catch (error) {
        this._log(`转发到 CCR Router 时出错: ${error.message}`, 'error');
        reject(error);
      }
    });
  }

  /**
   * 执行任务分解
   * @param {Object} requestBody - 请求体
   * @param {Object} complexityAnalysis - 复杂度分析结果（可选）
   */
  async _decomposeTask(requestBody, complexityAnalysis = null) {
    this._log('开始任务分解流程');

    // 提取实现计划
    const implementationPlan = requestBody.implementation_plan || null;

    // 初始化分解器和混合转换器
    if (!this.decomposer) {
      this.decomposer = new ElasticDecomposer({
        debug: this.config.debug,
        logLevel: this.config.debug ? 'debug' : 'info',
        ...this.config.decomposer
      });

      // 初始化混合转换器
      const llmClient = this.decomposer.typeAnnotator?.concurrentLLMInferencer?.llmClient;
      this.hybridConverter = new HybridTaskConverter({
        llmClient: llmClient,
        logLevel: this.config.debug ? 'debug' : 'warn'
      });
    }

    // 初始化模型选择器（如果尚未初始化）
    if (!this.modelSelector) {
      this.modelSelector = new ModelSelector({
        debug: this.config.debug,
        models: this.config.Providers || [],
        selector: this.config.selector || {},
        model_task_matrix: this.config.model_task_matrix || {}
      });
      this._log('模型选择器已初始化');
    }

    const userMessage = this._extractUserMessage(requestBody);
    this._log(`从 Claude Code 接收的任务描述：${typeof userMessage === 'string' ? userMessage.substring(0, 100) + '...' : '结构化对象格式'}`, 'debug');

    // 核心分解逻辑（用于缓存）
    const doDecompose = async () => {
      // 使用混合转换器进行结构化转换
      let task;
      try {
        // 首先尝试解析为结构化任务
        const parsedTask = this.decomposer.taskParser.parse(userMessage);

        // 如果解析出的 deliverables 为空，并且输入是字符串格式，则使用混合转换器
        if (!parsedTask.deliverables || parsedTask.deliverables.length === 0) {
          // 检查 task_details.deliverables（来自请求文件的结构化 deliverables）
          const taskDetailsDeliverables = requestBody.task_details?.deliverables;
          if (taskDetailsDeliverables && taskDetailsDeliverables.length > 0) {
            this._log(`从 task_details.deliverables 获取 ${taskDetailsDeliverables.length} 个交付物`, 'debug');
            task = {
              ...parsedTask,
              deliverables: taskDetailsDeliverables,
              source: 'task_details'
            };
          } else if (typeof userMessage === 'string') {
            this._log('解析出的交付物为空，使用混合转换器进行结构化', 'debug');
            const structuredResult = await this._convertToStructuredTask(userMessage);

            // 从自然语言中提取更多背景信息
            const extractedInfo = this._extractBackgroundInfoFromNaturalLanguage(userMessage);

            task = {
              title: structuredResult.title,
              description: userMessage,
              context: extractedInfo.context || { description: userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : '') },
              requirement: extractedInfo.requirement || userMessage,
              deliverables: structuredResult.deliverables,
              source: structuredResult.source,
              confidence: structuredResult.confidence
            };
          } else {
            // 如果输入已经是结构化对象且解析后 deliverables 为空，则直接使用原对象
            this._log('输入为结构化对象但解析后交付物为空，使用原始结构化对象', 'debug');
            task = parsedTask;
          }
        } else {
          this._log(`从结构化解析获得 ${parsedTask.deliverables.length} 个交付物`, 'debug');
          task = parsedTask;
        }
      } catch (parseError) {
        this._log(`结构化解析失败：${parseError.message}，使用混合转换器`, 'debug');
        if (typeof userMessage === 'string') {
          const structuredResult = await this._convertToStructuredTask(userMessage);

          // 从自然语言中提取更多背景信息
          const extractedInfo = this._extractBackgroundInfoFromNaturalLanguage(userMessage);

          task = {
            title: structuredResult.title,
            description: userMessage,
            context: extractedInfo.context || { description: userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : '') },
            requirement: extractedInfo.requirement || userMessage,
            deliverables: structuredResult.deliverables,
            source: structuredResult.source,
            confidence: structuredResult.confidence
          };
        } else {
          // 对于结构化对象，如果解析失败则直接使用解析器的默认处理
          this._log(`结构化对象解析失败，使用默认结构`, 'debug');
          task = this.decomposer.taskParser.parse(userMessage);
        }
      }

      // 将实现计划附加到任务上下文中
      if (implementationPlan) {
        // 确保实现计划信息被传递给任务分解器
        task.backgroundInfo = {
          ...task.backgroundInfo,
          implementationPlan: implementationPlan,
          constraints: this._extractConstraintsFromPlan(implementationPlan),
          guidelines: this._extractGuidelinesFromPlan(implementationPlan)
        };
      }

      this._log(`向分解器传递任务：${task.title}`);
      this._log(`任务包含 ${task.deliverables?.length || 0} 个交付物 (来源：${task.source})`, 'debug');

      const decomposeResult = await this.decomposer.decompose(task);

      // 安全检查分解结果
      const subtasks = decomposeResult.subtasks || [];
      const subtaskCount = subtasks.length || 0;

      this._log(`任务分解完成，生成 ${subtaskCount} 个子任务`);

      return { decomposeResult, subtasks, subtaskCount };
    };

    // 使用缓存管理器包装分解逻辑
    let decomposeResult, subtasks, subtaskCount;
    if (this.cacheManager && this.cacheManager.withDecompositionCache) {
      const cachedResult = await this.cacheManager.withDecompositionCache(
        requestBody,
        doDecompose,
        { ttl: 3600000 } // 1小时缓存
      );

      if (cachedResult.fromCache) {
        this._log('使用缓存的分解结果', 'debug');
        decomposeResult = cachedResult.decomposition || cachedResult;
        subtasks = cachedResult.subtasks || [];
        subtaskCount = subtasks.length;
      } else {
        // 【BUG修复】缓存未命中时，withDecompositionCache 内部已经执行了分解，
        // cachedResult 已经包含完整结果，不需要再次调用 doDecompose()
        this._log('缓存未命中，使用 withDecompositionCache 返回的新结果', 'debug');
        decomposeResult = cachedResult.decomposition || cachedResult;
        subtasks = cachedResult.subtasks || [];
        subtaskCount = subtasks.length;
      }
    } else {
      // 如果没有缓存管理器，直接执行
      const result = await doDecompose();
      decomposeResult = result.decomposeResult;
      subtasks = result.subtasks;
      subtaskCount = result.subtaskCount;
    }

    // 如果有复杂度分析结果，将复杂度信息附加到每个子任务上
    let enrichedSubtasks = subtasks;
    if (complexityAnalysis) {
      this._log(`为子任务附加复杂度信息：isComplex=${complexityAnalysis.isComplex}`, 'debug');
      enrichedSubtasks = subtasks.map(subtask => ({
        ...subtask,
        complexity: {
          isComplex: complexityAnalysis.isComplex,
          confidence: complexityAnalysis.confidence,
          method: complexityAnalysis.method,
          reason: complexityAnalysis.reason,
          parentAnalysis: true // 标记为继承自父任务
        }
      }));
    }

    return {
      orchestrated: true,
      decomposition: decomposeResult,
      subtasks: enrichedSubtasks,
      metadata: {
        processingTime: decomposeResult.metadata?.processingTime,
        subtaskCount: subtaskCount,
        complexityAnalysis: complexityAnalysis
      }
    };
  }

  /**
   * 生成 OpenAPI 契约
   * 当启用 contract_first 时，在分解后执行
   * 使用架构师模型（DeepSeek V4 Pro）生成契约
   *
   * @param {Object} requestBody - 请求体
   * @param {Object} decomposition - 分解结果
   * @param {string} sessionId - 会话 ID（用于指标记录，可选）
   * @returns {Promise<Object>} 包含 openapiSpec、usage、duration_ms 的结果对象
   */
  async _generateContract(requestBody, decomposition, sessionId = null) {
    const startTime = Date.now();

    // 默认返回值
    const defaultResult = {
      openapiSpec: null,
      usage: { input: 0, output: 0, total: 0 },
      duration_ms: 0
    };

    try {
      // 正确提取 requirement：优先从 task.requirement 获取，其次从 task.description 获取
      const extractedTask = requestBody.task;
      const task = {
        title: requestBody.title || requestBody.implementation_plan?.title || requestBody.backgroundInfo?.implementationPlan?.title || 'API Contract',
        requirement: extractedTask?.requirement || extractedTask?.description || this._extractUserMessage(requestBody),
        backgroundInfo: requestBody.backgroundInfo
      };

      const implementationPlan = requestBody.implementation_plan || requestBody.backgroundInfo?.implementationPlan || {};

      // 【新增】提取 deliverables 列表用于契约生成
      const deliverables = extractedTask?.deliverables || [];

      // 获取架构师模型配置
      const architectModel = this._getArchitectModel();
      this._log(`使用架构师模型生成契约: ${architectModel}`);

      // 创建契约生成器实例
      const contractGenerator = new ContractGenerator({
        defaultTitle: implementationPlan.title || task.title,
        defaultVersion: implementationPlan.version || '1.0.0'
      });

      // LLM 调用结果
      let llmResult = { usage: { input: 0, output: 0, total: 0 }, duration_ms: 0 };

      // 使用 DeepSeek 架构师模型生成更智能的契约
      // 获取 DeepSeek 提供商配置
      const deepseekConfig = this._getDeepSeekConfig();
      const apiKey = deepseekConfig.apiKey;
      const baseUrl = deepseekConfig.baseUrl;

      if (apiKey) {
        this._log('使用 DeepSeek 架构师模型生成 OpenAPI 契约（思考模式: 禁用）...');
        const deepseekClient = new DeepSeekLLMClient({
          apiKey: apiKey,
          baseUrl: baseUrl,
          model: architectModel,
          timeout: 300000, // 禁用思考模式后超时时间可缩短 (300s)
          maxRetries: 3,
          thinking: false, // 禁用思考模式 - 测试验证可节省约74%时间
          reasoningEffort: 'low', // 不影响（thinking: false时不生效）
          maxTokens: 100000 // 足够生成契约和类型文件
        });
        llmResult = await this._generateContractWithLLM(task, implementationPlan, deliverables, architectModel, deepseekClient);
      } else {
        this._log('未配置 DeepSeek API Key，跳过 LLM 契约生成', 'warn');
      }

      // 如果 LLM 生成失败或没有 LLM，且 _contractDeliverableContent 和 _typesDeliverableContent 都为空，回退
      if (!implementationPlan._contractDeliverableContent && !implementationPlan._typesDeliverableContent) {
        this._log('回退到基于已有信息的契约生成...');
        implementationPlan._contractDeliverableContent = '';
        implementationPlan._typesDeliverableContent = '';
      }

      // 生成 TypeScript 类型定义（传入 deliverables 以便按文件分组）
      // 注意：如果 _typesDeliverableContent 已存在（由 LLM 通过 chatWithTools 设置），则不再自动生成
      let openapiSpec = null;
      if (!implementationPlan._typesDeliverableContent) {
        openapiSpec = contractGenerator.generateContract(task, implementationPlan);
        const typescriptCode = contractGenerator.generateTypeScriptContracts(openapiSpec, deliverables);
        implementationPlan._typesDeliverableContent = typescriptCode;
        implementationPlan.openapi_spec = openapiSpec;
      }

      // 如果 _contractDeliverableContent 已存在（由 LLM 通过 chatWithTools 设置），保留它
      if (!implementationPlan._contractDeliverableContent) {
        openapiSpec = openapiSpec || contractGenerator.generateContract(task, implementationPlan);
        implementationPlan._contractDeliverableContent = typeof openapiSpec === 'string'
          ? openapiSpec
          : JSON.stringify(openapiSpec, null, 2);
        implementationPlan.openapi_spec = openapiSpec;
      }

      this._log('契约生成成功，_contractDeliverableContent=' + (implementationPlan._contractDeliverableContent?.length || 0) +
                 ' 字符, _typesDeliverableContent=' + (implementationPlan._typesDeliverableContent?.length || 0) + ' 字符');

      // 生成 Mock 模块（当启用 mock_service_layer 时）
      if (implementationPlan.mock_service_layer) {
        console.log('[OrchestratorServer] 生成 Mock 模块...');
        try {
          const MockGenerator = require('../decomposer/mocks/MockGenerator');
          const mockGen = new MockGenerator();
          const mockModule = mockGen.generateMockModule(openapiSpec, {
            basePath: implementationPlan.shared_context?.api_config?.baseURL || '/api',
            outputDir: 'src/mocks'
          });
          implementationPlan.generated_mocks = {
            apiClient: mockModule.apiClient,
            data: mockModule.data,
            handlers: mockModule.handlers
          };
          console.log('[OrchestratorServer] Mock 模块已生成');
        } catch (mockErr) {
          console.error('[OrchestratorServer] Mock 模块生成失败:', mockErr.message);
        }
      }

      // 计算总执行时间（如果 LLM 没有返回时间，则使用实际经过的时间）
      const totalDuration_ms = llmResult.duration_ms > 0
        ? llmResult.duration_ms
        : (Date.now() - startTime);

      // 如果 LLM usage 为空但有实际 LLM 调用（duration > 0），使用总执行时间作为参考
      // 注意：这种情况下 usage 仍然为 0，这是由于 API 不返回 usage 导致的限制
      if (llmResult.usage.total === 0 && totalDuration_ms > 0) {
        this._log(`[契约生成] LLM 调用耗时 ${totalDuration_ms}ms，但 usage 为 0（可能是 API 未返回 usage 信息）`, 'warn');
      }

      this._log(`[契约生成] 总执行时间: ${totalDuration_ms}ms, Token 使用: input=${llmResult.usage.input}, output=${llmResult.usage.output}, total=${llmResult.usage.total}`);

      return {
        openapiSpec,
        usage: llmResult.usage,
        duration_ms: totalDuration_ms
      };
    } catch (error) {
      this._log('契约生成失败: ' + error.message, 'error');
      console.error('[OrchestratorServer] 契约生成错误:', error);
      return defaultResult;
    }
  }

  /**
   * 获取架构师模型配置
   * @returns {string} 架构师模型 ID
   * @private
   */
  _getArchitectModel() {
    // 从 selector 配置中获取架构师模型（支持多模型逗号分隔）
    const selectorConfig = this.config.selector || {};
    let architectModels = selectorConfig.architect || 'deepseek-v4-pro';

    // 取第一个模型作为主模型
    let primaryModel = architectModels.split(',')[0].trim();

    // [DEBUG] 打印模型选择详情
    console.log('[OrchestratorServer] _getArchitectModel() 原始配置:', architectModels);
    console.log('[OrchestratorServer] 选择的模型:', primaryModel);

    // 如果返回的是提供商名称而不是模型名称，则尝试从 Providers 配置中获取正确的模型 ID
    // 检查是否是提供商名称
    const providers = this.config.Providers || [];
    const matchingProvider = providers.find(p => p.name === primaryModel || p.name === primaryModel.split('-')[0]);

    if (matchingProvider && matchingProvider.models && matchingProvider.models.length > 0) {
      // 返回提供商配置中的第一个模型
      const firstModelConfig = matchingProvider.models[0];
      primaryModel = firstModelConfig.id || firstModelConfig.api_model_id || primaryModel;
      console.log('[OrchestratorServer] 从提供商配置获取的实际模型 ID:', primaryModel);
    }

    return primaryModel;
  }

  /**
   * 获取 DeepSeek 提供商配置
   * @returns {Object} DeepSeek 提供商配置
   * @private
   */
  _getDeepSeekConfig() {
    // 从 Providers 数组中查找 deepseek 提供商
    const providers = this.config.Providers || [];
    const deepseekProvider = providers.find(p => p.name === 'deepseek');

    if (deepseekProvider) {
      return {
        apiKey: deepseekProvider.api_key || process.env[deepseekProvider.api_key_env] || '',
        baseUrl: deepseekProvider.api_base_url || 'https://api.deepseek.com',
        models: deepseekProvider.models || []
      };
    }

    // 回退到默认配置
    return {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: 'https://api.deepseek.com',
      models: []
    };
  }

  /**
   * 使用 LLM 生成 OpenAPI 契约
   * @param {Object} task - 任务对象
   * @param {Object} implementationPlan - 实现计划
   * @param {string} modelId - 模型 ID
   * @param {Object} llmClient - LLM 客户端
   * @returns {Promise<Object>} 包含 usage 和 duration_ms 的结果对象
   * @private
   */
  async _generateContractWithLLM(task, implementationPlan, deliverables, modelId, llmClient) {
    const prompt = this._buildContractGenerationPrompt(task, implementationPlan, deliverables);
    const startTime = Date.now();

    // 定义 write_file 工具（OpenAI 兼容格式）
    const writeFileTool = {
      type: 'function',
      function: {
        name: 'write_file',
        description: '写入文件内容到指定路径',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['file_path', 'content']
        }
      }
    };

    // 默认返回值
    const defaultResult = {
      usage: { input: 0, output: 0, total: 0 },
      duration_ms: 0
    };

    try {
      // 检查是否支持 chatWithTools
      if (typeof llmClient.chatWithTools === 'function') {
        this._log('使用 chatWithTools 生成契约');

        const result = await llmClient.chatWithTools(prompt, {
          model: modelId,
          temperature: 0.5, // 降低温度增加稳定性
          maxTokens: 100000, // 禁用思考模式后 100K 足够生成契约和类型
          tools: [writeFileTool]
        });

        // 计算执行时间
        const duration_ms = Date.now() - startTime;

        // 使用 TokenUsageParser 解析 token 使用量（与 ConcurrentExecutor 相同的机制）
        let usage = { input: 0, output: 0, total: 0 };
        if (result.rawResponse) {
          // 确保 TokenUsageParser 可用
          if (!this._tokenUsageParser) {
            const TokenUsageParser = require('../executor/utils/TokenUsageParser');
            this._tokenUsageParser = new TokenUsageParser();
            // 如果 modelSelector 有 modelRegistry，设置给它
            if (this.modelSelector?.modelRegistry) {
              this._tokenUsageParser.setModelRegistry(this.modelSelector.modelRegistry);
            }
          }
          const parsed = this._tokenUsageParser.parse(result.rawResponse, modelId);
          usage = {
            input: parsed.input || 0,
            output: parsed.output || 0,
            total: parsed.total || 0
          };
          this._log(`[契约生成] Token 使用量: input=${usage.input}, output=${usage.output}, total=${usage.total}, format=${parsed.format}`);
        } else {
          this._log(`[契约生成] 未从响应中提取到 usage 信息`, 'warn');
        }

        // 检查响应是否被截断
        const isTruncated = result.finishReason === 'length';
        if (isTruncated) {
          this._log(`LLM 响应被截断 (finish_reason=length)，尝试从部分内容恢复...`, 'warn');
        }

        // 从工具调用中提取契约和类型
        let openapiSpec = null;
        let typesContent = null;

        this._log(`[契约提取] 收到 ${result.toolCalls?.length || 0} 个工具调用`);

        for (const toolCall of result.toolCalls) {
          const { name, arguments: args } = toolCall;
          this._log(`[契约提取] 处理工具调用: name=${name}, args类型=${typeof args}`);

          let input;
          try {
            input = typeof args === 'string' ? JSON.parse(args) : args;
            this._log(`[契约提取] 解析后的 input: file_path=${input?.file_path}, content长度=${input?.content?.length || 0}`);
          } catch (e) {
            this._log(`解析工具参数失败: ${e.message}`, 'warn');
            // 尝试从原始响应中提取
            if (result.rawResponse?.choices?.[0]?.message?.content) {
              const rawContent = result.rawResponse.choices[0].message.content;
              this._log(`尝试从原始响应内容恢复 JSON，长度: ${rawContent.length}`);
              const extracted = this._extractJsonFromText(rawContent);
              if (extracted) {
                try {
                  input = JSON.parse(extracted);
                  this._log('从原始响应中成功恢复 JSON');
                } catch (e2) {
                  this._log(`恢复的 JSON 解析也失败: ${e2.message}`, 'warn');
                }
              }
            }
            continue;
          }

          if (name === 'write_file' && input?.file_path && input?.content) {
            const filePath = input.file_path;
            this._log(`[契约提取] write_file 调用: file_path="${filePath}"`);

            if (filePath.includes('contracts/api.txt')) {
              // 捕获分组格式的契约文本内容（用于按需注入）
              this._log(`[契约提取] 识别为分组格式契约文件，内容长度=${input.content.length}`);
              implementationPlan._contractDeliverableContent = input.content;
            } else if (filePath.includes('types/index.ts') ||
                       filePath.includes('types/index.tsx')) {
              typesContent = input.content;
              this._log(`[契约提取] 识别为类型文件，内容长度=${input.content.length}`);
            } else {
              this._log(`[契约提取] 文件路径不匹配任何已知类型: ${filePath}`);
            }
          } else {
            this._log(`[契约提取] 跳过: name=${name}, input.file_path=${input?.file_path}, input.content存在=${!!input?.content}`);
          }
        }

        this._log(`[契约提取] 完成: contractContent=${!!implementationPlan._contractDeliverableContent}, typesContent=${!!typesContent}`);

        // 存储到 implementationPlan
        if (typesContent) {
          implementationPlan._typesDeliverableContent = typesContent;
        }

        this._log(`[契约生成] LLM 契约生成完成，耗时: ${duration_ms}ms`);

        return { usage, duration_ms };  // 返回 usage 和 duration 信息
      } else {
        // 回退到文本格式
        this._log('chatWithTools 不可用，回退到文本格式');
        return await this._generateContractWithLLMTextOnly(task, modelId, llmClient, prompt);
      }
    } catch (error) {
      this._log(`LLM 契约生成失败: ${error.message}`, 'error');
      // 回退到文本格式
      try {
        const fallbackResult = await this._generateContractWithLLMTextOnly(task, modelId, llmClient, prompt);
        return fallbackResult || defaultResult;
      } catch (fallbackError) {
        this._log(`文本格式回退也失败: ${fallbackError.message}`, 'error');
        return defaultResult;
      }
    }
  }

  /**
   * 健壮的 JSON 解析
   * @param {string} content - JSON 字符串
   * @param {boolean} isTruncated - 是否被截断
   * @returns {Object|null} 解析后的对象
   * @private
   */
  _robustJsonParse(content, isTruncated = false) {
    if (!content || typeof content !== 'string') {
      return null;
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      if (!isTruncated) {
        // 没有被截断但解析失败，返回 null
        return null;
      }

      // 被截断，尝试修复
      this._log(`JSON 解析失败，尝试修复截断的 JSON (长度: ${content.length})`, 'warn');

      // 尝试找到最后一个完整的 JSON 对象
      // 策略：找到最后一个 '}' 的位置
      let lastValidPos = -1;
      let braceCount = 0;

      for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') braceCount--;

        if (braceCount === 0 && content[i] === '}') {
          lastValidPos = i;
        }
      }

      if (lastValidPos > 0) {
        const truncatedContent = content.substring(0, lastValidPos + 1);
        this._log(`找到有效的 JSON 结尾，尝试解析 (长度: ${truncatedContent.length})`);

        try {
          const parsed = JSON.parse(truncatedContent);
          this._log(`成功修复截断的 JSON (原始: ${content.length}, 修复后: ${truncatedContent.length})`);
          return parsed;
        } catch (e2) {
          this._log(`修复后的 JSON 仍然解析失败: ${e2.message}`, 'warn');
        }
      }

      return null;
    }
  }

  /**
   * 从文本中提取 JSON 对象
   * @param {string} text - 原始文本
   * @returns {string|null} 提取的 JSON 字符串
   * @private
   */
  _extractJsonFromText(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    // 移除 markdown 代码块标记
    const jsonBlockPattern = /```(?:json)?\s*([\s\S]*?)```/g;
    let match;
    while ((match = jsonBlockPattern.exec(text)) !== null) {
      const block = match[1].trim();
      if (this._isValidJson(block)) {
        return block;
      }
    }

    // 如果没有代码块，尝试找到 JSON 对象
    // 查找 {...} 模式
    const jsonObjectPattern = /\{[\s\S]*\}/g;
    let lastValid = null;
    while ((match = jsonObjectPattern.exec(text)) !== null) {
      const potential = match[0];
      if (this._isValidJson(potential)) {
        lastValid = potential;
      }
    }

    if (lastValid) {
      return lastValid;
    }

    // 如果都失败了，返回原始文本（供进一步处理）
    return text.trim();
  }

  /**
   * 检查字符串是否是有效的 JSON
   * @param {string} str - 待检查的字符串
   * @returns {boolean} 是否有效
   * @private
   */
  _isValidJson(str) {
    if (!str || typeof str !== 'string') {
      return false;
    }

    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 使用纯文本格式生成契约（回退方法）
   * @param {Object} task - 任务对象
   * @param {string} modelId - 模型 ID
   * @param {Object} llmClient - LLM 客户端
   * @param {string} prompt - 预先构建的 prompt
   * @returns {Promise<Object>} 包含 usage、duration_ms 和 openapiSpec 的结果对象
   * @private
   */
  async _generateContractWithLLMTextOnly(task, modelId, llmClient, prompt) {
    const startTime = Date.now();

    // 由于 llmClient.chat() 不返回 usage 信息，记录时间但 usage 为空
    const contractText = await llmClient.chat(prompt, {
      model: modelId,
      temperature: 0.5, // 降低温度增加稳定性
      maxTokens: 8192
    });

    // 计算执行时间
    const duration_ms = Date.now() - startTime;

    // 记录原始返回内容（用于调试）
    this._log(`LLM 返回内容长度: ${contractText.length}, 前200字符: ${contractText.substring(0, 200)}`);

    // 尝试提取 JSON 部分 - 改进的正则表达式
    const jsonPatterns = [
      /```(?:json)?\s*([\s\S]*?)```/g,  // 标准 markdown 代码块
      /\{[\s\S]*\}/g,                    // JSON 对象（可能是截断的）
    ];

    let openapiSpec = null;
    for (const pattern of jsonPatterns) {
      const matches = contractText.match(pattern);
      if (matches) {
        for (const match of matches) {
          try {
            // 尝试找到有效的 JSON 对象
            const jsonStart = match.indexOf('{');
            if (jsonStart !== -1) {
              const potentialJson = match.substring(jsonStart);
              const parsed = JSON.parse(potentialJson);
              if (parsed.openapi || parsed.openapiVersion) {
                this._log('成功从 LLM 返回中提取 OpenAPI JSON');
                openapiSpec = parsed;
                break;
              }
            }
          } catch (e) {
            // 继续尝试下一个匹配
          }
        }
        if (openapiSpec) break;
      }
    }

    // 尝试直接解析为 JSON
    if (!openapiSpec) {
      try {
        openapiSpec = JSON.parse(contractText);
      } catch {
        // 返回 null，让调用方回退到基于已有信息的生成
        this._log('LLM 返回的契约无法解析为 JSON', 'warn');
      }
    }

    // 注意：由于 chat() 方法不返回 usage 信息，这里只能记录时间
    // usage 信息需要通过其他方式获取，或者在 chatWithTools 中记录
    const usage = { input: 0, output: 0, total: 0 };

    return {
      usage,
      duration_ms,
      openapiSpec  // 返回解析后的 OpenAPI 规范
    };
  }

  /**
   * 构建契约生成的 Prompt
   * @param {Object} task - 任务对象
   * @param {Object} implementationPlan - 实现计划
   * @param {Array} deliverables - 交付物列表
   * @returns {string} 生成的 Prompt
   * @private
   */
  _buildContractGenerationPrompt(task, implementationPlan, deliverables = []) {
    const techStack = implementationPlan.tech_stack?.join(', ') || '未指定';
    const requirements = task.requirement || task.title || '未提供需求描述';

    // 格式化 deliverables 列表
    let deliverablesSection = '';
    if (deliverables && deliverables.length > 0) {
      const fileList = deliverables.map(d => {
        const filePath = d.filePath || 'unknown';
        const description = d.description || '无描述';
        const type = d.type || 'general';
        return `- [${type}] ${filePath}: ${description}`;
      }).join('\n');

      deliverablesSection = `
## 待生成文件列表
${fileList}`;
    }

    // 【优化】生成完整的 TypeScript 文件路径列表
    let allFilePathsSection = '';
    if (deliverables && deliverables.length > 0) {
      const tsFiles = deliverables
        .filter(d => d.filePath.endsWith('.ts') || d.filePath.endsWith('.tsx'))
        .map(d => d.filePath);
      if (tsFiles.length > 0) {
        allFilePathsSection = `

## 【重要】必须为以下所有 TypeScript 文件生成类型定义分组

你必须为以下每一个 TypeScript 文件生成对应的类型定义分组，**一个都不能遗漏**：

${tsFiles.join('\n')}`;
      }
    }

    return `你是架构师，负责为以下需求生成 OpenAPI 3.0 规范和 TypeScript 类型定义。

## 技术栈
${techStack}

## 需求描述
${requirements}
${deliverablesSection}
${allFilePathsSection}

## 输出要求

【关键】你必须一次性调用 write_file 工具两次，同时生成以下两个文件：

1. write_file 工具调用 #1 - 契约文件 (分组文本):
   - file_path: "contracts/api.txt"
   - content: API 契约分组文本，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

2. write_file 工具调用 #2 - 类型定义文件:
   - file_path: "types/index.ts"
   - content: TypeScript 类型定义，使用 // [COMMON] 和 // [FILE: <path>] 分组格式

## 类型定义格式示例

\`\`\`typescript
// ============================================================
// 电商平台 - TypeScript 类型定义
// ============================================================

// [COMMON]
export interface ApiError {
  code: string;
  message: string;
}
export interface SuccessResponse {
  success: true;
  message: string;
}

// [FILE: src/stores/userStore.ts]
export interface User {
  id: string;
  name: string;
  email: string;
}

// [FILE: src/pages/Home.tsx]
export interface HomePageData {
  featuredProducts: Product[];
  categories: Category[];
}

// [FILE: src/pages/Cart.tsx]
export interface Cart {
  items: CartItem[];
  total: number;
}
\`\`\`

## 契约分组格式示例

\`\`\`typescript
// ============================================================
// 电商平台 - API 契约分组
// ============================================================

// [COMMON]
// 通用 API 描述和认证信息
// - Base URL: /api/v1
// - Authentication: Bearer Token (JWT)
// - 通用错误码: 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Server Error)

shared schemas:
- ApiError: { code: string, message: string }
- SuccessResponse: { success: true, message: string }

// [FILE: server/routes/auth.ts]
// 认证相关 API
// - POST /auth/register - 用户注册
// - POST /auth/login - 用户登录
// - POST /auth/logout - 用户登出
// - GET /auth/me - 获取当前用户信息

// [FILE: server/routes/products.ts]
// 产品相关 API
// - GET /products - 获取产品列表
// - GET /products/:id - 获取产品详情
// - POST /products - 创建产品
// - PUT /products/:id - 更新产品
// - DELETE /products/:id - 删除产品

// [FILE: server/routes/cart.ts]
// 购物车相关 API
// - GET /cart - 获取购物车内容
// - POST /cart/items - 添加商品到购物车
// - PUT /cart/items/:id - 更新购物车商品
// - DELETE /cart/items/:id - 删除购物车商品
\`\`\`

## 【关键要求】

1. **必须为所有文件生成分组** - 包括但不限于：
   - server/database/db.ts
   - server/index.ts
   - server/routes/auth.ts
   - server/routes/products.ts
   - server/routes/cart.ts
   - server/routes/orders.ts
   - src/App.tsx
   - src/main.tsx
   - src/services/api.ts
   - 所有 src/pages/*.tsx 文件
   - 所有 src/components/*.tsx 文件

2. **// [FILE: <path>] 中的 <path> 必须与待生成文件列表中的路径完全一致**

3. **不要遗漏任何文件** - 每个 TypeScript 文件都必须有对应的分组

## 示例响应格式

你的响应中应包含三个 tool_call，例如：

tool_calls: [
  {
    "name": "write_file",
    "arguments": {"file_path": "contracts/api.txt", "content": "// [COMMON]\n// Common API descriptions...\n\n// [FILE: server/routes/auth.ts]\n// API endpoints for auth.ts...\n\n// [FILE: server/routes/products.ts]\n// API endpoints for products.ts..."}
  },
  {
    "name": "write_file",
    "arguments": {"file_path": "types/index.ts", "content": "// [COMMON]\nexport interface ApiError {...}\n\n// [FILE: server/database/db.ts]\nexport interface DbUser {...}\n\n// [FILE: server/routes/auth.ts]\nexport interface JwtPayload {...}"}
  }
]

请立即生成这两个文件，确保为所有文件都生成了类型定义分组和契约分组，不要遗漏任何文件。`;
  }

  /**
   * 为子任务列表选择合适的模型
   * @param {Array} subtasks - 子任务列表
   * @param {Object} parentComplexity - 父任务的复杂度信息（可选）
   */
  async _selectModelsForSubtasks(subtasks, parentComplexity = null) {
    if (!this.modelSelector) {
      // 【调试】验证 model_task_matrix 是否传递到 ModelSelector
      console.log(`[_selectModelsForSubtasks] this.config.model_task_matrix exists: ${!!this.config.model_task_matrix}`);
      if (this.config.model_task_matrix) {
        console.log(`[_selectModelsForSubtasks] model_task_matrix keys: ${Object.keys(this.config.model_task_matrix)}`);
        console.log(`[_selectModelsForSubtasks] suitabilityMatrix models: ${this.config.model_task_matrix.suitabilityMatrix ? Object.keys(this.config.model_task_matrix.suitabilityMatrix).join(', ') : 'N/A'}`);
      }

      // 如果模型选择器未初始化，则初始化它
      this.modelSelector = new ModelSelector({
        debug: this.config.debug,
        models: this.config.Providers || [],
        selector: this.config.selector || {},
        model_task_matrix: this.config.model_task_matrix || {}  // 【修复】传递多维度矩阵配置
      });
      this._log('模型选择器已初始化');
    }

    // 安全检查 subtasks 参数
    const tasks = subtasks || [];
    const taskCount = tasks.length || 0;

    this._log(`开始为 ${taskCount} 个子任务选择模型`);

    // 如果有父任务复杂度信息，记录日志
    if (parentComplexity) {
      this._log(`使用父任务复杂度信息：isComplex=${parentComplexity.isComplex}, confidence=${parentComplexity.confidence}`, 'debug');
    }

    // 核心模型选择逻辑（用于缓存）
    const doSelect = async () => {
      return await Promise.all(subtasks.map(async (subtask) => {
        try {
          // 将复杂度信息添加到子任务中，供模型选择器使用
          const enhancedSubtask = {
            ...subtask,
            // 如果子任务没有自己的复杂度信息，则使用父任务的
            complexity: subtask.complexity || parentComplexity || { isComplex: false, confidence: 0.5, method: 'inherited' }
          };

          // 使用模型选择器为子任务选择模型
          const selectionResult = this.modelSelector.select(enhancedSubtask);

          // 将选择结果合并到子任务中，同时保留type字段用于兼容性
          const types = subtask.types || [];
          const primaryType = types.length > 0 ? types[0].type : 'unknown';
          return {
            ...subtask,
            type: primaryType, // 保留type字段用于兼容性
            selected_model: selectionResult.selected_model,
            selection_reason: selectionResult.reason,
            estimated_cost: selectionResult.estimated_cost,
            estimated_tokens: selectionResult.estimated_tokens,
            selection_metadata: {
              alternatives: selectionResult.alternatives,
              cost_breakdown: selectionResult.cost_breakdown,
              timestamp: selectionResult.timestamp
            }
          };
        } catch (error) {
          this._log(`为子任务 ${subtask.id} 选择模型时出错: ${error.message}`, 'error');

          // 获取用于 fallback 的 alternatives（通过健康检查的模型，随机顺序）
          const fallbackAlternatives = this.modelSelector.getFallbackAlternatives();

          // 选择第一个可用模型作为默认模型
          const fallbackModel = fallbackAlternatives.length > 0 ? fallbackAlternatives[0].modelId : 'unknown';

          this._log(`模型选择失败，使用 fallback 模型: ${fallbackModel}, 可用模型数: ${fallbackAlternatives.length}`, 'warn');

          return {
            ...subtask,
            selected_model: fallbackModel,
            selection_reason: `模型选择失败，使用fallback模型: ${error.message}`,
            estimated_cost: 0.03, // 默认估计成本
            selection_metadata: {
              alternatives: fallbackAlternatives,  // 使用能力均衡的模型列表
              fallback_used: true
            }
          };
        }
      }));
    };

    // 使用缓存管理器包装模型选择逻辑
    let subtasksWithModels;
    if (this.cacheManager && this.cacheManager.withModelSelectionCache) {
      subtasksWithModels = await this.cacheManager.withModelSelectionCache(
        subtasks,
        parentComplexity,
        doSelect,
        { ttl: 1800000 } // 30分钟缓存
      );
    } else {
      // 如果没有缓存管理器，直接执行
      subtasksWithModels = await doSelect();
    }

    this._log(`完成 ${subtasks.length} 个子任务的模型选择`);
    return subtasksWithModels;
  }

  /**
   * 执行任务编排（分解 + 模型选择 + 执行 + 整合）
   */
  async _orchestrate(requestBody, session = null, incrementalResult = null) {
    // 【关键修复】在开始编排前重置整合器状态，防止跨请求污染
    if (this.integrator) {
      this.integrator.resetState();
    }

    // 从请求中提取配置并更新整合器配置
    if (requestBody.config) {
      if (requestBody.config.integrator) {
        this.integratorConfig = {
          ...this.integratorConfig,
          ...requestBody.config.integrator
        };
        // 如果入口文件生成被禁用，重新创建整合器实例
        if (this.integratorConfig.entryPoint?.enabled === false && this.integrator) {
          const { Integrator } = require('../integrator/integrator');
          this.integrator = new Integrator(this.integratorConfig);
          this._log('整合器已重新初始化（入口文件生成已禁用）');
        }
      }
    }

    // 记录编排开始时间
    const startTime = Date.now();

    // 生成编排流程 ID
    const orchestrationId = `orch_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

    // 【关键修复】确定统一的 sessionId：优先使用 session?.sessionId，否则使用 orchestrationId
    // 这样可以确保契约生成和 deliverable 执行使用相同的 sessionId
    const unifiedSessionId = session?.sessionId || orchestrationId;

    // 开始流程监控
    this.flowMonitor.startOrchestration(orchestrationId, {
      sessionId: unifiedSessionId,
      hasIncrementalResult: !!incrementalResult
    });

    // 发射编排开始事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'orchestration', 'start', 'started', {
      message: '开始任务编排流程'
    });

    // 步骤级日志: 请求接收
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'orchestration', 'request_received', 'completed', {
      message: '收到编排请求'
    });

    // 步骤级日志: 任务格式化
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'orchestration', 'task_formatting', 'running', {
      message: '正在格式化任务内容'
    });

    this._log(`开始任务编排流程 [${orchestrationId}]`);

    // 根据是否有增量结果来调整处理流程
    let decomposition;
    let decomposeStartTime = Date.now();

    // 发射分解阶段开始事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'start', 'started', {});

    // 步骤级日志: 分解器开始工作
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'decomposer_init', 'completed', {
      message: '分解器已初始化'
    });

    // 步骤级日志: 任务分析
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'task_analysis', 'running', {
      message: '正在分析任务内容'
    });

    // 步骤级日志: 开始任务解析
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'task_parsing', 'running', {
      message: '正在解析任务内容'
    });

    // 执行复杂度分析并保存结果，供后续模型选择使用
    const complexityAnalysis = await this._analyzeComplexity(requestBody);
    this._log(`编排流程中的复杂度分析：isComplex=${complexityAnalysis.isComplex}, confidence=${complexityAnalysis.confidence}`, 'debug');

    // ===== Phase 3.5: 契约生成（当启用 contract_first 时） - 在分解前生成 =====
    const implementationPlan = requestBody.implementation_plan || requestBody.backgroundInfo?.implementationPlan || {};
    let contractSpec = null;
    let contractGenerationResult = null;  // 存储契约生成结果（包含 usage 和 duration_ms）
    if (implementationPlan?.contract_first) {
      this._log('启用契约优先模式，正在生成 OpenAPI 契约...');
      // 创建临时的 decomposition 对象用于契约生成
      const tempDecomposition = { subtasks: [] };
      // 传递 sessionId 以便记录契约生成的 token 消耗
      contractGenerationResult = await this._generateContract(requestBody, tempDecomposition, session?.sessionId);
      contractSpec = contractGenerationResult?.openapiSpec;
      this._log('OpenAPI 契约生成完成');
      // _generateContract 已经将 _typesDeliverableContent 和 generated_mocks 存入 implementationPlan

      // 【新增】记录契约生成的 token 消耗、成本消耗、时间消耗
      if (contractGenerationResult && this.metricsCollector) {
        const { usage, duration_ms } = contractGenerationResult;
        const architectModel = this._getArchitectModel();

        // 计算成本（使用与 ConcurrentExecutor 相同的机制：从 modelRegistry 获取定价）
        let costValue = 0;
        const modelRegistry = this.modelSelector?.modelRegistry;
        if (modelRegistry) {
          const model = modelRegistry.getModel(architectModel);
          if (model?.pricing) {
            // 定价单位是 每百万 token，需要转换为每 token
            const inputCost = (usage.input / 1000000) * model.pricing.input;
            const outputCost = (usage.output / 1000000) * model.pricing.output;
            costValue = inputCost + outputCost;
            this._log(`[契约生成] 从 modelRegistry 获取定价: input=${model.pricing.input}/M, output=${model.pricing.output}/M`);
          } else {
            this._log(`[契约生成] modelRegistry 中未找到模型 ${architectModel} 的定价，使用默认定价`, 'warn');
            // 使用默认定价（每百万 token $15 输入, $30 输出）
            costValue = (usage.input / 1000000) * 0.015 + (usage.output / 1000000) * 0.03;
          }
        } else {
          this._log(`[契约生成] modelSelector.modelRegistry 不可用，使用默认定价`, 'warn');
          // 使用默认定价
          costValue = (usage.input / 1000000) * 0.015 + (usage.output / 1000000) * 0.03;
        }

        try {
          this._log(`[契约生成] 记录指标: sessionId=${unifiedSessionId}, model=${architectModel}, usage=${JSON.stringify(usage)}, duration=${duration_ms}ms, cost=${costValue}`);
          await this.metricsCollector.recordTask(
            unifiedSessionId,
            'contract-generation',  // taskId 标识这是契约生成任务
            architectModel,
            usage,
            duration_ms,
            {
              cost: costValue,
              sessionId: unifiedSessionId,
              taskType: 'contract-generation',
              taskCategory: 'pre-execution',  // 区分任务类别：pre-execution, execution, post-execution
              provider: 'deepseek',
              isPreTask: true  // 标记为前置任务，时间需要累加而非取 max
            }
          );
          this._log(`[契约生成] 指标记录完成`);
        } catch (err) {
          console.warn('[OrchestratorServer] 记录契约生成指标失败:', err.message);
        }
      } else if (!this.metricsCollector) {
        this._log('[契约生成] metricsCollector 未初始化，跳过指标记录', 'warn');
      }
    }

    if (incrementalResult && incrementalResult.decomposition) {
      // 如果提供了增量结果，则复用部分分解结果
      decomposition = incrementalResult.decomposition;
      this._log('使用增量处理提供的分解结果');
    } else {
      // 否则按常规流程分解任务
      decomposition = await this._decomposeTask(requestBody, complexityAnalysis);
    }

    // 步骤级日志: 任务解析完成
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'task_parsing', 'completed', {
      message: '任务解析完成',
      subtaskCount: decomposition.subtasks?.length || 0
    });

    // 步骤级日志: 生成子任务
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'subtask_generation', 'running', {
      message: '正在生成子任务'
    });

    // 步骤级日志: 依赖分析
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'dependency_analysis', 'running', {
      message: '正在分析任务依赖'
    });

    // 步骤级日志: 质量检查
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'quality_check', 'running', {
      message: '正在进行质量检查'
    });

    // 发射分解阶段完成事件
    const decomposeDuration = Date.now() - decomposeStartTime;
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'decomposition', 'decomposition_complete', 'completed', {
      subtaskCount: decomposition.subtasks?.length || 0,
      processingTime: decomposeDuration
    });

    // ===== Phase 4: 契约信息注入 =====
    // contractSpec 已在前面生成，此处仅注入到 shared_context
    // implementationPlan 已在前面声明
    if (implementationPlan?.contract_first && contractSpec) {
      this._log('将契约信息注入到 shared_context...');

      // 将契约信息注入到 decomposition 的 shared_context 中
      if (!decomposition.sharedContext) {
        decomposition.sharedContext = {};
      }
      if (!decomposition.sharedContext.types) {
        decomposition.sharedContext.types = {};
      }

      // 从契约中提取类型定义
      if (contractSpec?.components?.schemas) {
        decomposition.sharedContext.types = {
          ...decomposition.sharedContext.types,
          ...contractSpec.components.schemas
        };
      }

      // 注入 API 端点信息
      if (contractSpec?.paths) {
        decomposition.sharedContext.api_endpoints = Object.entries(contractSpec.paths)
          .flatMap(([path, methods]) =>
            Object.entries(methods)
              .filter(([m]) => ['get', 'post', 'put', 'delete', 'patch'].includes(m))
              .map(([method, op]) => ({
                method: method.toUpperCase(),
                path,
                description: op.summary || op.description || '',
                operationId: op.operationId
              }))
          );
      }
    }

    // 2. 安全检查分解结果并为子任务选择合适的模型
    const subtasks = decomposition.subtasks || [];
    const subtaskCount = subtasks.length || 0;

    if (subtaskCount === 0) {
      this._log('任务分解未生成任何子任务，跳过模型选择和执行');

      // 发射编排完成事件（无子任务）
      this.flowMonitor.completeOrchestration(orchestrationId, {
        message: '任务分解未生成子任务',
        subtaskCount: 0
      });

      return {
        orchestrated: true,
        decomposition: decomposition,
        subtasks: [],
        execution_results: [],
        integration_result: null,
        validation_result: decomposition?.validationResult || null,
        message: '任务分解未生成子任务'
      };
    }

    // 发射模型选择阶段开始事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'start', 'started', {
      subtaskCount: subtasks.length
    });

    // 步骤级日志: 接收子任务
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'receiving_tasks', 'completed', {
      message: `模型选择器接收 ${subtasks.length} 个子任务`
    });

    // 步骤级日志: 分析子任务
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'analyzing_subtasks', 'running', {
      message: '正在分析子任务需求'
    });

    let subtasksWithModels;
    if (incrementalResult && incrementalResult.subtasksWithModels) {
      // 如果提供了增量结果，则复用部分子任务模型选择
      subtasksWithModels = incrementalResult.subtasksWithModels;
      this._log('使用增量处理提供的子任务模型选择');
    } else {
      // 传递复杂度分析结果给模型选择器
      subtasksWithModels = await this._selectModelsForSubtasks(subtasks, complexityAnalysis);
    }

    // 步骤级日志: 模型匹配
    const selectedModels = [...new Set(subtasksWithModels.map(st => st.selected_model))];
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'model_matching', 'running', {
      message: '正在匹配模型'
    });

    // 步骤级日志: 成本估算
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'cost_estimation', 'running', {
      message: '正在估算执行成本'
    });

    // 步骤级日志: 模型选择完成
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'model_matching', 'completed', {
      message: '模型选择完成',
      selectedModels: selectedModels
    });

    // 发射模型选择阶段完成事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'model_selection', 'model_selection_complete', 'completed', {
      selectedModels: [...new Set(subtasksWithModels.map(st => st.selected_model))]
    });

    // 3. 初始化执行器集成模块
    if (!this.executorIntegration) {
      this.executorIntegration = new OrchestratorExecutorIntegration({
        debug: this.config.debug,
        modelSelector: this.modelSelector,
        modelRegistry: this.modelSelector?.modelRegistry,
        metricsCollector: this.metricsCollector,
        flowMonitor: this.flowMonitor,
        orchestrationId,

        // 从统一配置读取执行器配置
        executor: this.config.executor || {},
        extensions: this.config.extensions || {},
        streaming: this.config.streaming || {}
      });

      this._log('执行器集成模块已初始化');
    }

    // 发射执行阶段开始事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'start', 'started', {
      subtaskCount: subtasksWithModels.length
    });

    // 步骤级日志: 生成提示词
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'prompt_generation', 'running', {
      message: '正在为子任务生成提示词'
    });

    // 步骤级日志: 资源分配
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'resource_allocation', 'running', {
      message: '正在分配执行资源'
    });

    // 步骤级日志: 开始并发执行
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'concurrent_execution', 'running', {
      message: `开始执行 ${subtasksWithModels.length} 个子任务`
    });

    // 4. 执行子任务（并发执行）
    this._log(`开始执行 ${subtasksWithModels.length} 个子任务`);

    // 【关键修复】为每个子任务设置 unifiedSessionId，确保与契约生成使用相同的 sessionId
    const subtasksWithSession = subtasksWithModels.map((subtask, index) => ({
      ...subtask,
      sessionId: subtask.sessionId || unifiedSessionId
    }));

    let executionResult;
    if (incrementalResult && incrementalResult.executionResult) {
      // 如果提供了增量结果，则复用部分执行结果
      executionResult = incrementalResult.executionResult;
      this._log('使用增量处理提供的执行结果');
    } else {
      executionResult = await this.executorIntegration.executeSubtasks(subtasksWithSession, orchestrationId);
    }

    // 步骤级日志: 聚合结果
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'result_aggregation', 'running', {
      message: '正在聚合执行结果'
    });

    // 发射执行阶段完成事件
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'execution', 'execution_complete', 'completed', {
      totalExecuted: executionResult.total_executed,
      successful: executionResult.successful_executions,
      failed: executionResult.failed_executions
    });

    // 5. 初始化整合器（如果尚未初始化）
    if (!this.integrator) {
      this.integrator = new Integrator(this.integratorConfig);
      this._log('整合器已初始化');
    }

    // 6. 使用整合器整合执行结果
    let integrationResult = null;
    const executionResults = executionResult.execution_results || executionResult.results || [];

    if (executionResults.length > 0) {
      // 发射整合阶段开始事件
      this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'start', 'started', {
        resultCount: executionResults.length
      });

      // 步骤级日志: 开始整合
      this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'integration_start', 'running', {
        message: `开始整合 ${executionResults.length} 个执行结果`
      });

      // 步骤级日志: 合并结果
      this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'result_merging', 'running', {
        message: '正在合并执行结果'
      });

      // 步骤级日志: 解决冲突
      this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'conflict_resolution', 'running', {
        message: '正在检测并解决冲突'
      });

      // 步骤级日志: 格式转换
      this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'format_conversion', 'running', {
        message: '正在转换输出格式'
      });

      this._log(`开始整合 ${executionResults.length} 个执行结果`);
      try {
        // 如果是会话上下文，考虑依赖关系
        if (session && session.dependencyGraph) {
          // 在会话上下文中应用依赖图逻辑
          integrationResult = await this.integrator.integrate(executionResults, subtasksWithModels, {
            dependencyGraph: session.dependencyGraph,
            conflictResolver: this.corrector
          });
        } else {
          integrationResult = await this.integrator.integrate(executionResults, subtasksWithModels);
        }

        // 步骤级日志: 质量验证
        this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'quality_validation', 'running', {
          message: '正在进行质量验证'
        });

        // 步骤级日志: 整合完成
        const filesCount = integrationResult.files?.size || 0;
        this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'integration_complete', 'completed', {
          message: integrationResult.success ? `整合成功` : `整合完成但存在警告`,
          filesCount: filesCount
        });

        if (integrationResult.success) {
          this._log(`整合成功：生成 ${filesCount} 个文件`);

          // ===== Phase 3 & 4: 整合后处理钩子 =====

          // 1. 契约验证（当启用 contract_first 时）
          if (implementationPlan?.contract_first) {
            this._log('执行契约验证...');
            const sharedContext = decomposition?.sharedContext || {};
            const typeValidation = this.integrator.validateTypeContract(
              integrationResult.files,
              sharedContext
            );

            if (!typeValidation.valid) {
              this._log(`契约验证失败: ${typeValidation.errors.join(', ')}`, 'error');
              integrationResult.warnings = integrationResult.warnings || [];
              integrationResult.warnings.push(`契约验证失败: ${typeValidation.errors.join(', ')}`);
              integrationResult.success = false;

              // 标记需要重做
              integrationResult.contractValidationFailed = true;
            }

            if (typeValidation.warnings.length > 0) {
              this._log(`契约验证警告: ${typeValidation.warnings.join(', ')}`, 'warn');
              integrationResult.warnings = integrationResult.warnings || [];
              integrationResult.warnings.push(...typeValidation.warnings);
            }
          }

          // 2. Mock 替换为真实 API（当启用 mock_service_layer 时）
          // [DEBUG] Mock 服务层调试
          this._log(`[DEBUG] mock_service_layer 检查: ${implementationPlan?.mock_service_layer || false}`);
          if (implementationPlan?.mock_service_layer) {
            this._log('[DEBUG] Mock 服务层已启用，执行 Mock 到真实 API 的替换...');
            const mockOptions = {
              mockModule: './mocks/api',
              realApiModule: implementationPlan.real_api_module || null,
              apiBaseUrl: implementationPlan.api_base_url ||
                         implementationPlan.shared_context?.api_config?.baseURL ||
                         null
            };

            integrationResult.files = this.integrator.replaceMockWithRealAPI(
              integrationResult.files,
              mockOptions
            );
            this._log('Mock 替换完成');
          }
        } else {
          this._log(`整合完成但存在警告：${integrationResult.warnings?.join(', ') || '未知警告'}`, 'warn');
        }

        // 发射整合阶段完成事件
        this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'integration_complete', 'completed', {
          filesCount: integrationResult.files?.size || 0,
          warningsCount: integrationResult.warnings?.length || 0,
          success: integrationResult.success
        });
      } catch (integrationError) {
        this._log(`整合失败：${integrationError.message}`, 'error');
        integrationResult = {
          success: false,
          files: new Map(),
          logs: [],
          warnings: [`整合器异常：${integrationError.message}`],
          error: integrationError.message
        };

        // 发射整合阶段失败事件
        this.flowMonitor.emitPhaseEvent(orchestrationId, 'integration', 'fail', 'failed', {
          error: integrationError.message
        });
      }
    } else {
      this._log('没有执行结果需要整合', 'warn');
    }

    // 【新增】如果是契约优先模式，将架构师生成的契约文件和类型文件注入到 integrationResult.files
    // 确保这些文件能够通过 tool_calls 格式返回，而不是被分配给执行模型重新生成
    if (implementationPlan?.contract_first && integrationResult?.files instanceof Map) {
      this._log('注入架构师生成的契约文件和类型文件到整合结果');

      // 创建新的 Map 以避免修改原始数据
      const updatedFiles = new Map(integrationResult.files);

      // 注入契约文件 (txt 格式)
      if (implementationPlan._contractDeliverableContent) {
        updatedFiles.set('contracts/api.txt', {
          content: implementationPlan._contractDeliverableContent,
          source: 'architect',
          language: 'text'
        });
        this._log('已注入 contracts/api.txt 到整合结果');
      }

      // 注入类型文件
      if (implementationPlan._typesDeliverableContent) {
        updatedFiles.set('types/index.ts', {
          content: implementationPlan._typesDeliverableContent,
          source: 'architect',
          language: 'typescript'
        });
        this._log('已注入 types/index.ts 到整合结果');
      }

      // 更新 integrationResult.files
      integrationResult.files = updatedFiles;
    }

    // 7. 整合所有结果
    // 如果是契约优先模式，将 openapi_spec 和 typesContent 添加到 integration_result 中
    const integrationResultWithSpec = implementationPlan?.contract_first
      ? {
          ...integrationResult,
          openapi_spec: implementationPlan.openapi_spec,
          typesContent: implementationPlan._typesDeliverableContent
        }
      : integrationResult;

    const result = {
      ...decomposition,
      subtasks: subtasksWithModels,
      modelSelections: subtasksWithModels.map(st => ({
        taskId: st.id,
        selectedModel: st.selected_model,
        reason: st.selection_reason,
        estimatedCost: st.estimated_cost
      })),
      execution_results: executionResult,
      integration_result: integrationResultWithSpec,
      validation_result: decomposition?.validationResult || null,
      metadata: {
        ...decomposition.metadata,
        modelSelectionCompleted: true,
        executionCompleted: true,
        integrationCompleted: integrationResult !== null,
        selectedModels: [...new Set(subtasksWithModels.map(st => st.selected_model))],
        execution_summary: executionResult.execution_summary,
        integration_summary: integrationResult ? {
          filesCount: integrationResult.files?.size || 0,
          warningsCount: integrationResult.warnings?.length || 0,
          success: integrationResult.success
        } : null
      }
    };

    // 如果在会话上下文中，更新会话状态
    if (session) {
      result.sessionId = session.sessionId;
    }

    // 完成编排流程监控
    this.flowMonitor.completeOrchestration(orchestrationId, {
      subtaskCount: subtasksWithModels.length,
      successfulExecutions: executionResult.successful_executions,
      failedExecutions: executionResult.failed_executions,
      integrationSuccess: integrationResult?.success
    });

    // 步骤级日志: 编排完成
    const totalDuration = Date.now() - startTime;
    this.flowMonitor.emitPhaseEvent(orchestrationId, 'orchestration', 'orchestration_complete', 'completed', {
      message: `编排流程完成，总耗时: ${totalDuration}ms`,
      totalDuration: totalDuration,
      subtaskCount: subtasksWithModels.length
    });

    // 将编排 ID 添加到结果中
    result.orchestrationId = orchestrationId;

    this._log(`为 ${subtasksWithModels.length} 个子任务选择了模型并完成执行与整合`);
    return result;
  }

  /**
   * 处理 HTTP 请求
   */
  async _handleRequest(req, res) {
    // 使用实际监听的端口或默认端口，避免 undefined 导致 URL 解析失败
    const listenPort = this.config?.port || this._serverPort || 3458;
    const url = new URL(req.url, `http://localhost:${listenPort}`);
    const pathname = url.pathname;

    // 设置 CORS 头 - 必须在任何响应之前设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 小时预检缓存

    // CORS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 健康检查端点
      if (pathname === '/health' && req.method === 'GET') {
        return this._sendJSON(res, 200, {
          status: 'ok',
          service: 'orchestrator',
          timestamp: new Date().toISOString()
        });
      }

      // SSE 流程监控端点 - 订阅实时流程事件
      if (pathname === '/v1/flow/subscribe' && req.method === 'GET') {
        return this._handleFlowSubscribe(req, res);
      }

      // SSE 流程监控端点 - 订阅特定会话的实时流程事件
      if (pathname.match(/^\/v1\/flow\/subscribe\/[^/]+$/) && req.method === 'GET') {
        const sessionId = pathname.split('/')[4]; // /v1/flow/subscribe/:sessionId
        return this._handleFlowSubscribe(req, res, sessionId);
      }

      // SSE 模型响应订阅端点 - 与 UI useModelResponseSSE hook 兼容
      if ((pathname === '/v1/model/response/subscribe' || pathname.match(/^\/v1\/model\/response\/subscribe\/[^/]+$/)) && req.method === 'GET') {
        let sessionId = null;
        if (pathname.match(/^\/v1\/model\/response\/subscribe\/[^/]+$/)) {
          sessionId = pathname.split('/')[4];
        } else {
          const urlParams = new URL(req.url, 'http://localhost').searchParams;
          sessionId = urlParams.get('session_id');
        }
        return this._handleModelResponseSubscribe(req, res, sessionId);
      }

      // 获取活跃编排列表
      if (pathname === '/v1/flow/status' && req.method === 'GET') {
        return this._sendJSON(res, 200, {
          activeOrchestrations: this.flowMonitor.getActiveOrchestrations(),
          subscriberCount: this.flowMonitor.getSubscriberCount()
        });
      }

      // 获取特定编排的流程历史
      if (pathname.startsWith('/v1/flow/') && req.method === 'GET') {
        const orchestrationId = pathname.replace('/v1/flow/', '');
        if (!orchestrationId || orchestrationId === 'status') {
          return this._sendJSON(res, 400, { error: 'Orchestration ID is required' });
        }
        const history = this.flowMonitor.getFlowHistory(orchestrationId);
        if (!history) {
          return this._sendJSON(res, 404, { error: 'Orchestration not found' });
        }
        return this._sendJSON(res, 200, history);
      }

      // 配置管理端点
      if (pathname === '/config') {
        if (req.method === 'GET') {
          // 返回 ConfigService 的配置（确保与 /api/config/* 端点一致）
          return this._sendJSON(res, 200, this.configService.getConfig());
        }
        if (req.method === 'POST') {
          // 保存新配置
          const newConfig = await this._parseBody(req);
          this._updateConfig(newConfig);
          return this._sendJSON(res, 200, { success: true, message: '配置已保存' });
        }
      }

      // 模板配置备份端点
      if (pathname === '/config/backup' && req.method === 'GET') {
        const fs = require('fs');
        const path = require('path');
        const backupPath = path.join(__dirname, '../../config/config_backup.json');
        try {
          if (fs.existsSync(backupPath)) {
            const backupConfig = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            return this._sendJSON(res, 200, backupConfig);
          } else {
            return this._sendJSON(res, 404, { error: '模板配置文件不存在' });
          }
        } catch (error) {
          return this._sendJSON(res, 500, { error: '读取模板配置失败: ' + error.message });
        }
      }

      // 选择规则配置端点
      if (pathname.startsWith('/api/config/selection-rules')) {
        if (req.method === 'GET') {
          // 获取所有选择规则
          const rules = this.configService.getSelectionRules();
          return this._sendJSON(res, 200, rules);
        }
        if (req.method === 'POST') {
          // 添加新规则
          const rule = await this._parseBody(req);
          const success = this.configService.addRule(rule);
          return this._sendJSON(res, success ? 200 : 400, {
            success,
            message: success ? '规则已添加' : '添加规则失败'
          });
        }

        // 处理带任务类型的路径（PUT/DELETE）
        const taskTypeMatch = pathname.match(/\/api\/config\/selection-rules\/(.+)/);
        if (taskTypeMatch) {
          const taskType = decodeURIComponent(taskTypeMatch[1]);

          if (req.method === 'PUT') {
            // 更新规则
            const rule = await this._parseBody(req);
            const success = this.configService.updateRule(taskType, rule);
            return this._sendJSON(res, success ? 200 : 404, {
              success,
              message: success ? '规则已更新' : '找不到规则'
            });
          }

          if (req.method === 'DELETE') {
            // 删除规则
            const success = this.configService.removeRule(taskType);
            return this._sendJSON(res, success ? 200 : 404, {
              success,
              message: success ? '规则已删除' : '找不到规则'
            });
          }
        }
      }

      // 模型配置端点
      if (pathname.startsWith('/api/config/models')) {
        if (req.method === 'GET') {
          // 获取所有模型
          const models = this.configService.getModels();
          return this._sendJSON(res, 200, models);
        }
        if (req.method === 'POST') {
          // 添加新模型
          const model = await this._parseBody(req);
          const success = this.configService.addModel(model);
          return this._sendJSON(res, success ? 200 : 400, {
            success,
            message: success ? '模型已添加' : '添加模型失败'
          });
        }

        // 处理带模型ID的路径（PUT/DELETE）
        const modelIdMatch = pathname.match(/\/api\/config\/models\/(.+)/);
        if (modelIdMatch) {
          const modelId = decodeURIComponent(modelIdMatch[1]);

          if (req.method === 'PUT') {
            // 更新模型
            const model = await this._parseBody(req);
            const success = this.configService.updateModel(modelId, model);
            return this._sendJSON(res, success ? 200 : 404, {
              success,
              message: success ? '模型已更新' : '找不到模型'
            });
          }

          if (req.method === 'DELETE') {
            // 删除模型
            const success = this.configService.removeModel(modelId);
            return this._sendJSON(res, success ? 200 : 404, {
              success,
              message: success ? '模型已删除' : '找不到模型'
            });
          }
        }
      }

      // 适配器配置端点
      if (pathname === '/api/config/adapters') {
        if (req.method === 'GET') {
          // 获取适配器配置
          const adapterConfig = this.configService.getAdapterConfig();
          const adapters = this.configService.getAvailableAdapters();
          return this._sendJSON(res, 200, {
            adapterConfig,
            adapters
          });
        }
        if (req.method === 'PUT') {
          // 保存适配器配置
          const config = await this._parseBody(req);
          const success = this.configService.saveAdapterConfig(config);
          return this._sendJSON(res, success ? 200 : 500, {
            success,
            message: success ? '适配器配置已保存' : '保存失败'
          });
        }
      }

      // 创建自定义适配器端点
      if (pathname === '/api/config/adapters/custom' && req.method === 'POST') {
        const { name, config } = await this._parseBody(req);
        const success = this.configService.createCustomAdapter(name, config);
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? '自定义适配器已创建' : '创建失败'
        });
      }

      // 删除自定义适配器端点
      const deleteAdapterMatch = pathname.match(/\/api\/config\/adapters\/custom\/(.+)/);
      if (deleteAdapterMatch && req.method === 'DELETE') {
        const adapterName = decodeURIComponent(deleteAdapterMatch[1]);
        const success = this.configService.deleteCustomAdapter(adapterName);
        return this._sendJSON(res, success ? 200 : 404, {
          success,
          message: success ? '自定义适配器已删除' : '删除失败或不允许删除预定义适配器'
        });
      }

      // 提供商适配器更新端点
      const providerAdapterMatch = pathname.match(/\/api\/config\/providers\/(.+)\/adapter/);
      if (providerAdapterMatch) {
        const providerName = decodeURIComponent(providerAdapterMatch[1]);
        if (req.method === 'PUT') {
          const { adapter } = await this._parseBody(req);
          const success = this.configService.updateProviderAdapter(providerName, adapter);
          return this._sendJSON(res, success ? 200 : 500, {
            success,
            message: success ? '提供商适配器已更新' : '更新失败'
          });
        }
      }

      // 模型任务矩阵配置端点
      if (pathname === '/api/config/model-task-matrix') {
        // 获取模型任务矩阵
        if (req.method === 'GET') {
          const matrix = this.configService.getModelTaskMatrix();
          return this._sendJSON(res, 200, matrix);
        }
      }

      // 更新 suitability 矩阵
      if (pathname === '/api/config/model-task-matrix/suitability' && req.method === 'PUT') {
        const matrix = await this._parseBody(req);
        const success = this.configService.updateSuitabilityMatrix(matrix);
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? 'Suitability 矩阵已保存' : '保存失败'
        });
      }

      // 更新维度权重
      if (pathname === '/api/config/model-task-matrix/weights' && req.method === 'PUT') {
        const weights = await this._parseBody(req);
        const success = this.configService.updateDimensionWeights(weights);
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? '维度权重已保存' : '保存失败'
        });
      }

      // 重置配置端点
      if (pathname === '/api/config/reset' && req.method === 'POST') {
        const success = this.configService.resetToDefaults();
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? '配置已重置为默认值' : '重置失败'
        });
      }

      // 保存配置端点
      if (pathname === '/api/config/save' && req.method === 'POST') {
        const newConfig = await this._parseBody(req);
        const success = this.configService.saveConfig(newConfig);
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? '配置已保存' : '保存失败'
        });
      }

      // 编排端点 - 接收 Claude Code 的请求
      if (pathname === '/v1/orchestrate' || pathname === '/orchestrate') {
        if (req.method !== 'POST') {
          return this._sendJSON(res, 405, { error: 'Method not allowed' });
        }

        const requestBody = await this._parseBody(req);
        this._log(`收到 Claude Code 请求，消息长度：${JSON.stringify(requestBody).length}`);

        // 如果启用了会话支持，则使用会话处理逻辑
        if (this.config.enableSessionSupport) {
          // 优先从请求头/查询参数提取 session_id，如果不存在则从请求体中提取
          let sessionId = this._extractSessionId(req);

          // 如果请求头/查询参数中没有 session_id，尝试从请求体中获取
          if (!sessionId && requestBody.session_id !== undefined) {
            sessionId = requestBody.session_id;
          }

          // 如果 session_id 为 null、空字符串或不存在，自动创建新会话
          let sessionCreated = false;
          if (!sessionId) {
            this._log('未提供 session_id，自动创建新会话', 'info');
            const newSession = await this.sessionManager.createSession(
              requestBody.task?.title || requestBody.prompt || 'Untitled task',
              requestBody.userId || null,
              requestBody.projectId || null
            );
            sessionId = newSession.sessionId;
            sessionCreated = true;  // 标记为新创建的会话
            this._log(`新会话已创建：${sessionId}`, 'info');

            // 【关键修复】将新 sessionId 添加到请求的 context 中，确保缓存 key 包含 sessionId
            if (!requestBody.context) {
              requestBody.context = {};
            }
            requestBody.context.sessionId = sessionId;
          }

          // 使用会话处理逻辑（session_id 存在或已创建）
          // 如果是新创建的会话，跳过缓存以避免返回旧数据
          const result = await this._handleSessionAwareOrchestration(requestBody, sessionId, { skipCache: sessionCreated });

          // 在响应中返回 session_id
          if (result && typeof result === 'object') {
            result.session_id = sessionId;
            result.session_created = !this._extractSessionId(req) && requestBody.session_id === null;
          }

          return this._sendJSON(res, 200, result);
        }

        // 判断是否需要任务分解
        if (this.config.autoOrchestrate && await this._shouldDecompose(requestBody)) {
          this._log('检测到复杂任务，启动编排流程');

          try {
            // 使用缓存包装编排调用
            const orchestrateResult = await this.cacheManager.withCache(
              requestBody,
              async (request) => {
                return await this._orchestrate(request);
              },
              {
                ttl: this.config.cache?.resultTTL || 3600000, // Default 1 hour
                skipCacheFor: (result) => {
                  // Don't cache results with errors or failures
                  return result.error || result.integration_result?.success === false;
                }
              }
            );

            // 格式化编排结果
            let formattedResult = this._formatOrchestrationResult(orchestrateResult, requestBody);

            // 检查是否需要流式响应（通过查询参数或请求体指定）
            const urlObj = new URL(req.url, `http://localhost:${this.config.port}`);
            const streamEnabled = urlObj.searchParams.get('stream') === 'true' || requestBody.stream === true;
            const files = formattedResult.files || new Map();

            if (streamEnabled && files.size > 5) {
              this._log(`启用流式响应，文件数量：${files.size}`, 'debug');
              await this._streamResponse(formattedResult, res);
              return;
            }

            // 应用 Token 限制处理
            const maxTokens = this.config.tokenLimit || 16000;
            formattedResult = this._handleTokenLimit(formattedResult, maxTokens);

            // 使用 OutputFormatter 格式化输出
            const outputFormat = requestBody.outputFormat || 'json';
            const finalOutput = this._formatResponseForClaudeCode(orchestrateResult, requestBody, outputFormat);

            return this._sendJSON(res, 200, finalOutput);

          } catch (error) {
            this._log(`编排流程失败：${error.message}`, 'error');
            return this._sendJSON(res, 500, {
              error: '编排流程失败',
              message: error.message,
              stack: this.config.debug ? error.stack : undefined
            });
          }
        } else {
          this._log('普通任务，转发给 CCR Router');

          // 转发给 CCR Router
          const ccrResult = await this._forwardToCCR(requestBody, req.headers);

          return this._sendJSON(res, ccrResult.statusCode, ccrResult.body);
        }
      }

      // 新增工具调用格式编排端点 - 为 Claude Code 生成可执行的工具调用格式
      if (pathname === '/v1/orchestrate-tool-calls' || pathname === '/orchestrate-tool-calls') {
        if (req.method !== 'POST') {
          return this._sendJSON(res, 405, { error: 'Method not allowed' });
        }

        const requestBody = await this._parseBody(req);
        this._log(`收到 Claude Code 工具调用格式请求，消息长度：${JSON.stringify(requestBody).length}`);

        try {
          // 【关键修复】优先处理 session，支持 session_id: null 时自动创建新会话
          if (this.config.enableSessionSupport) {
            let sessionId = this._extractSessionId(req);

            // 如果请求头/查询参数中没有 session_id，尝试从请求体中获取
            if (!sessionId && requestBody.session_id !== undefined) {
              sessionId = requestBody.session_id;
            }

            // 如果 session_id 为 null、空字符串或不存在，自动创建新会话
            if (!sessionId) {
              this._log('未提供 session_id，自动创建新会话', 'info');
              const newSession = await this.sessionManager.createSession(
                requestBody.task?.title || requestBody.prompt || 'Untitled task',
                requestBody.userId || null,
                requestBody.projectId || null
              );
              sessionId = newSession.sessionId;
              this._log(`新会话已创建：${sessionId}`, 'info');

              // 将新 sessionId 添加到请求的 context 中，确保缓存 key 包含 sessionId
              if (!requestBody.context) {
                requestBody.context = {};
              }
              requestBody.context.sessionId = sessionId;
            }

            // 使用会话处理逻辑
            const result = await this._handleSessionAwareOrchestration(requestBody, sessionId);

            // 在响应中返回 session_id
            if (result && typeof result === 'object') {
              result.session_id = sessionId;
              result.session_created = !this._extractSessionId(req) && requestBody.session_id === null;
            }

            return this._sendJSON(res, 200, result);
          }

          // 判断是否需要任务分解
          if (this.config.autoOrchestrate && await this._shouldDecompose(requestBody)) {
            this._log('检测到复杂任务，启动编排流程');

            // 使用缓存包装编排调用
            const orchestrateResult = await this.cacheManager.withCache(
              requestBody,
              async (request) => {
                return await this._orchestrate(request);
              },
              {
                ttl: this.config.cache?.resultTTL || 3600000, // Default 1 hour
                skipCacheFor: (result) => {
                  // Don't cache results with errors or failures
                  return result.error || result.integration_result?.success === false;
                }
              }
            );

            // 格式化编排结果
            let formattedResult = this._formatOrchestrationResult(orchestrateResult, requestBody);

            // 应用 Token 限制处理
            const maxTokens = this.config.tokenLimit || 16000;
            formattedResult = this._handleTokenLimit(formattedResult, maxTokens);

            // 格式化为工具调用格式
            const finalOutput = this._formatResponseForClaudeCode(orchestrateResult, requestBody, 'tool_call');

            return this._sendJSON(res, 200, finalOutput);

          } else {
            this._log('普通任务，转发给 CCR Router');

            // 转发给 CCR Router
            const ccrResult = await this._forwardToCCR(requestBody, req.headers);

            return this._sendJSON(res, ccrResult.statusCode, ccrResult.body);
          }
        } catch (error) {
          this._log(`编排流程失败：${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            error: '编排流程失败',
            message: error.message,
            stack: this.config.debug ? error.stack : undefined
          });
        }
      }

      // 新增会话相关端点（仅在启用会话支持时）
      if (this.config.enableSessionSupport) {
        // 获取会话状态
        if (pathname === '/v1/session-status' && req.method === 'GET') {
          const stats = await this.sessionManager.getStatistics();
          return this._sendJSON(res, 200, stats);
        }

        // 获取实时日志（会话相关）
        if (pathname === '/v1/logs' && req.method === 'GET') {
          const urlParams = new URLSearchParams(url.search);
          const level = urlParams.get('level') || null;
          const limit = parseInt(urlParams.get('limit')) || 100;
          const module = urlParams.get('module') || null;
          const search = urlParams.get('search') || null;

          const filters = {};
          if (level) filters.level = level;
          if (module) filters.module = module;
          if (search) filters.search = search;

          // 返回日志缓冲区的内容
          const logs = this._getRecentLogs(limit, filters);

          return this._sendJSON(res, 200, {
            logs: logs,
            total: logs.length,
            retrieved: logs.length
          });
        }

        // 清除日志缓冲区（会话相关）
        if (pathname === '/v1/logs/clear' && req.method === 'POST') {
          this.logBuffer = [];
          return this._sendJSON(res, 200, { message: '日志已清除' });
        }

        // 删除会话
        if (pathname === '/v1/sessions' && req.method === 'DELETE') {
          const sessionId = this._extractSessionId(req);
          if (!sessionId) {
            return this._sendJSON(res, 400, { error: 'Session ID is required' });
          }
          try {
            const deleted = await this.sessionManager.deleteSession(sessionId);
            if (deleted) {
              return this._sendJSON(res, 200, { message: 'Session deleted', sessionId });
            } else {
              return this._sendJSON(res, 404, { error: 'Session not found' });
            }
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }

        // 获取用户的所有会话
        if (pathname === '/v1/sessions/user' && req.method === 'GET') {
          const urlParams = new URLSearchParams(url.search);
          const userId = urlParams.get('userId');
          if (!userId) {
            return this._sendJSON(res, 400, { error: 'userId is required' });
          }
          try {
            const sessions = await this.sessionManager.getUserSessions(userId);
            return this._sendJSON(res, 200, { sessions, total: sessions.length });
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }

        // 获取项目的所有会话
        if (pathname === '/v1/sessions/project' && req.method === 'GET') {
          const urlParams = new URLSearchParams(url.search);
          const projectId = urlParams.get('projectId');
          if (!projectId) {
            return this._sendJSON(res, 400, { error: 'projectId is required' });
          }
          try {
            const sessions = await this.sessionManager.getProjectSessions(projectId);
            return this._sendJSON(res, 200, { sessions, total: sessions.length });
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }

        // 导出会话数据
        if (pathname === '/v1/sessions/export' && req.method === 'GET') {
          const sessionId = this._extractSessionId(req);
          if (!sessionId) {
            return this._sendJSON(res, 400, { error: 'Session ID is required' });
          }
          try {
            const exportedData = await this.sessionManager.exportSession(sessionId);
            return this._sendJSON(res, 200, { sessionId, data: exportedData });
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }

        // 导入会话数据
        if (pathname === '/v1/sessions/import' && req.method === 'POST') {
          const requestBody = await this._parseBody(req);
          if (!requestBody.data) {
            return this._sendJSON(res, 400, { error: 'Session data is required' });
          }
          try {
            const newSessionId = await this.sessionManager.importSession(requestBody.data);
            return this._sendJSON(res, 200, { sessionId: newSessionId, message: 'Session imported' });
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }

        // 获取单个会话详情
        if (pathname === '/v1/sessions' && req.method === 'GET') {
          const sessionId = this._extractSessionId(req);
          if (!sessionId) {
            return this._sendJSON(res, 400, { error: 'Session ID is required' });
          }
          try {
            const session = await this.sessionManager.getSession(sessionId);
            if (!session) {
              return this._sendJSON(res, 404, { error: 'Session not found' });
            }
            return this._sendJSON(res, 200, { session });
          } catch (error) {
            return this._sendJSON(res, 500, { error: error.message });
          }
        }
      }

      // 进度追踪端点 - 获取特定任务的进度
      if (pathname.startsWith('/v1/progress/') && req.method === 'GET') {
        const taskId = pathname.replace('/v1/progress/', '');
        if (!taskId) {
          return this._sendJSON(res, 400, { error: 'Task ID is required' });
        }

        try {
          const progress = this.progressTracker.getProgress(taskId);
          if (!progress) {
            return this._sendJSON(res, 404, { error: 'Task not found or progress not tracked' });
          }

          return this._sendJSON(res, 200, {
            taskId,
            progress,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return this._sendJSON(res, 500, { error: error.message });
        }
      }

      // 进度追踪端点 - 获取所有活跃任务进度
      if (pathname === '/v1/progress' && req.method === 'GET') {
        try {
          const activeTasks = this.progressTracker.getActiveTasks();
          const progressInfo = {};

          for (const taskId of activeTasks) {
            progressInfo[taskId] = this.progressTracker.getProgress(taskId);
          }

          return this._sendJSON(res, 200, {
            activeTasks,
            progressInfo,
            totalActive: activeTasks.length,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return this._sendJSON(res, 500, { error: error.message });
        }
      }

      // 进度追踪端点 - 获取最近的进度事件
      if (pathname === '/v1/progress/events' && req.method === 'GET') {
        const urlParams = new URLSearchParams(url.search);
        const limit = parseInt(urlParams.get('limit')) || 10;
        const taskId = urlParams.get('taskId') || null;

        try {
          const events = this.progressTracker.getRecentEvents(taskId, limit);

          return this._sendJSON(res, 200, {
            events,
            limit,
            taskId,
            total: events.length,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return this._sendJSON(res, 500, { error: error.message });
        }
      }

      // 分解端点 - 直接调用分解器（测试用）
      if (pathname === '/v1/decompose' && req.method === 'POST') {
        const requestBody = await this._parseBody(req);

        if (!this.decomposer) {
          this.decomposer = new ElasticDecomposer({
            debug: this.config.debug,
            logLevel: this.config.debug ? 'debug' : 'info',
            ...this.config.decomposer
          });
        }

        const userMessage = this._extractUserMessage(requestBody);
        const task = requestBody.task || {
          title: '分解测试任务',
          description: userMessage
        };

        this._log(`直接调用分解器，任务内容：${task.title}`);

        const result = await this.decomposer.decompose(task);
        return this._sendJSON(res, 200, result);
      }

      // 模型选择端点 - 直接调用模型选择器（测试用）
      if (pathname === '/v1/select-model' && req.method === 'POST') {
        const requestBody = await this._parseBody(req);

        if (!this.modelSelector) {
          this.modelSelector = new ModelSelector({
            debug: this.config.debug,
            models: this.config.Providers || [],
            selector: this.config.selector || {},
            model_task_matrix: this.config.model_task_matrix || {}
          });
        }

        const subtask = requestBody.subtask || {
          id: 'direct-test-' + Date.now(),
          type: 'general',
          description: this._extractUserMessage(requestBody) || '直接测试任务'
        };

        this._log(`直接调用模型选择器，子任务：${subtask.description.substring(0, 50)}...`);

        try {
          const result = this.modelSelector.select(subtask);
          return this._sendJSON(res, 200, result);
        } catch (error) {
          this._log(`模型选择失败: ${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            error: '模型选择失败',
            message: error.message
          });
        }
      }

      // 获取模型选择器状态
      if (pathname === '/v1/model-selector-status' && req.method === 'GET') {
        if (!this.modelSelector) {
          return this._sendJSON(res, 200, {
            initialized: false,
            availableModels: [],
            budgetStatus: null
          });
        }

        return this._sendJSON(res, 200, {
          initialized: true,
          availableModels: this.modelSelector.getAvailableModels().map(m => m.id),
          budgetStatus: this.modelSelector.getBudgetStatus(),
          learningReport: this.modelSelector.getLearningReport(),
          modelStatuses: this.modelSelector.getStatusReport()
        });
      }

      // 模型健康状态端点 - 显示启动时的健康检查结果
      if (pathname === '/v1/model-health-status' && req.method === 'GET') {
        return this._sendJSON(res, 200, {
          healthCheckPerformed: !!this.healthResults,
          healthResults: this.healthResults || null,
          timestamp: this.healthResults?.timestamp || new Date().toISOString()
        });
      }

      // 重新执行模型健康检查
      if (pathname === '/v1/model-health-check/refresh' && req.method === 'POST') {
        this._log('开始重新执行模型健康检查...');
        try {
          const ModelHealthChecker = require('./utils/ModelHealthChecker');
          const healthChecker = new ModelHealthChecker(this.modelSelector);
          const healthResults = await healthChecker.checkAllModels();
          this.healthResults = healthResults;

          // 更新所有模型的状态
          for (const [modelId, result] of Object.entries(healthResults.models)) {
            const available = result.available;
            const reason = result.reason;
            if (this.modelSelector?.statusMonitor?.updateStatusFromHealthCheck) {
              this.modelSelector.statusMonitor.updateStatusFromHealthCheck(modelId, available, reason);
            }
          }

          this._log(`模型健康检查完成：${healthResults.availableModels}/${healthResults.totalModels} 可用`);

          return this._sendJSON(res, 200, {
            success: true,
            healthResults: healthResults
          });
        } catch (error) {
          this._log(`健康检查失败: ${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            success: false,
            error: error.message
          });
        }
      }

      // 执行器集成状态
      if (pathname === '/v1/executor-integration-status' && req.method === 'GET') {
        return this._sendJSON(res, 200, {
          initialized: !!this.executorIntegration,
          executorReady: !!(this.executorIntegration && this.executorIntegration.executor),
          modelRegistryConnected: !!(this.modelSelector && this.executorIntegration),
          availableEndpoints: [
            'POST /v1/orchestrate',
            'POST /v1/decompose',
            'POST /v1/select-model',
            'POST /v1/integrate',
            'POST /v1/correct',
            'POST /v1/execute-subtasks',
            'GET /v1/model-selector-status',
            'GET /v1/executor-integration-status',
            'GET /v1/integrator-status'
          ]
        });
      }

      // 整合器状态
      if (pathname === '/v1/integrator-status' && req.method === 'GET') {
        return this._sendJSON(res, 200, {
          initialized: !!this.integrator,
          integratorReady: !!(this.integrator),
          config: this.integratorConfig,
          cacheStats: this.integrator?.cacheManager?.getStats() || null,
          availableEndpoints: [
            'POST /v1/orchestrate',
            'POST /v1/integrate',
            'GET /v1/integrator-status'
          ]
        });
      }

      // 直接调用整合器（测试用）
      if (pathname === '/v1/integrate' && req.method === 'POST') {
        if (!this.integrator) {
          this.integrator = new Integrator(this.integratorConfig);
        }

        const requestBody = await this._parseBody(req);

        try {
          const executionResults = requestBody.executionResults || requestBody.results || [];
          const subtasks = requestBody.subtasks || [];

          if (executionResults.length === 0) {
            return this._sendJSON(res, 400, {
              error: '缺少执行结果',
              message: '请提供 executionResults 或 results 数组'
            });
          }

          this._log(`直接调用整合器，整合 ${executionResults.length} 个结果`);
          const result = await this.integrator.integrate(executionResults, subtasks);

          return this._sendJSON(res, 200, {
            success: result.success,
            filesCount: result.files?.size || 0,
            warnings: result.warnings || [],
            logs: this.config.debug ? result.logs : undefined,
            qualityReport: this.config.debug ? result.qualityReport : undefined,
            validationReport: result.validationReport,
            cacheStats: result.cacheStats
          });
        } catch (error) {
          this._log(`直接整合失败：${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            error: '整合失败',
            message: error.message
          });
        }
      }

      // 直接调用 Corrector（测试用）
      if (pathname === '/v1/correct' && req.method === 'POST') {
        const requestBody = await this._parseBody(req);
        const { action, code, filePath, ...params } = requestBody;

        if (!action) {
          return this._sendJSON(res, 400, {
            error: '缺少 action 参数',
            message: '请提供 action 参数：validate|fix-conflict|analyze-and-fix|fix-specific-error|classify-errors|can-fix-locally|generate-fix-prompt'
          });
        }

        try {
          let result;
          switch (action) {
            case 'validate':
              result = await this.corrector.validateCode(code, filePath);
              break;
            case 'fix-conflict':
              result = await this.corrector.fixConflict(params.conflictData, params.conflictResolution);
              break;
            case 'analyze-and-fix':
              result = await this.corrector.analyzeAndFix(code, params.validationResults);
              break;
            case 'fix-specific-error':
              result = await this.corrector.fixSpecificError(code, params.errorType, params.context || {});
              break;
            case 'classify-errors':
              result = this.corrector.errorClassifier.classifyErrors(params.validationResults);
              break;
            case 'can-fix-locally':
              result = this.corrector.canFixLocally(params.errors);
              break;
            case 'generate-fix-prompt':
              result = this.corrector.generateFixPrompt(code, params.errors, params.context || {});
              break;
            default:
              return this._sendJSON(res, 400, {
                error: `Unknown action: ${action}`,
                message: '支持的 action：validate|fix-conflict|analyze-and-fix|fix-specific-error|classify-errors|can-fix-locally|generate-fix-prompt'
              });
          }

          return this._sendJSON(res, 200, {
            success: true,
            action,
            result
          });
        } catch (error) {
          this._log(`Corrector 操作失败：${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            error: 'Corrector 操作失败',
            message: error.message
          });
        }
      }

      // 直接执行子任务（测试用）
      if (pathname === '/v1/execute-subtasks' && req.method === 'POST') {
        if (!this.executorIntegration) {
          this.executorIntegration = new OrchestratorExecutorIntegration({
            debug: this.config.debug,
            modelSelector: this.modelSelector,
            modelRegistry: this.modelSelector?.modelRegistry,
            metricsCollector: this.metricsCollector,

            // 从统一配置读取执行器配置
            executor: this.config.executor || {},
            extensions: this.config.extensions || {},
            streaming: this.config.streaming || {}
          });
        }

        const requestBody = await this._parseBody(req);
        // 提取会话 ID
        const sessionId = req.headers['x-session-id'] || null;
        this._log(`[execute-subtasks] 提取的会话 ID: ${sessionId || 'null'}`, 'debug');

        try {
          // 修复：支持 subtasksWithModels 和 subtasks 两种格式
          let subtasksWithModels;

          if (requestBody.subtasksWithModels && Array.isArray(requestBody.subtasksWithModels)) {
            // 新格式：直接使用 subtasksWithModels
            subtasksWithModels = requestBody.subtasksWithModels;
          } else if (requestBody.subtasks && Array.isArray(requestBody.subtasks)) {
            // 旧格式：从 subtasks 构建，添加 sessionId
            subtasksWithModels = requestBody.subtasks.map(subtask => ({
              id: subtask.id || 'subtask-' + Date.now(),
              description: subtask.description || subtask.task || '执行任务',
              type: subtask.type || 'general',
              selected_model: subtask.selected_model || requestBody.model || this._getDefaultModel(),
              estimated_cost: subtask.estimated_cost || 0.03,
              sessionId: sessionId || subtask.sessionId,  // 添加会话 ID
              selection_metadata: subtask.selection_metadata || {},
              // 【修复】不要在有 alternatives 时自动启用 fallback，这会导致每个任务被重复执行多次
              // fallback 应该在明确需要时使用，而不是自动启用
              useFallback: subtask.useFallback === true,
              // 保留原始字段以支持工具调用
              prompt: subtask.prompt || subtask.description || '',
              tools: subtask.tools || null,
              systemPrompt: subtask.systemPrompt || null
            }));
          } else {
            // 默认格式：创建单个任务
            // 支持顶层字段 alternatives 和 model_id（兼容旧格式）
            const alternatives = requestBody.alternatives || requestBody.selection_metadata?.alternatives || [];
            subtasksWithModels = [{
              id: requestBody.task_id || 'direct-exec-' + Date.now(),
              description: this._extractUserMessage(requestBody) || '直接执行测试任务',
              type: requestBody.type || 'general',
              selected_model: requestBody.selected_model || requestBody.model_id || requestBody.model || this._getDefaultModel(),
              estimated_cost: requestBody.estimated_cost || 0.03,
              sessionId: sessionId,  // 添加会话 ID
              selection_metadata: {
                ...(requestBody.selection_metadata || {}),
                alternatives: alternatives  // 确保 alternatives 在 selection_metadata 中
              },
              alternatives: alternatives,  // 同时保留顶层 alternatives 以便直接访问
              // 【修复】不要在有 alternatives 时自动启用 fallback
              useFallback: requestBody.useFallback === true
            }];
          }

          this._log(`直接执行 ${subtasksWithModels.length} 个子任务`);

          const result = await this.executorIntegration.executeSubtasks(subtasksWithModels);
          return this._sendJSON(res, 200, result);
        } catch (error) {
          this._log(`直接执行子任务失败: ${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            error: '子任务执行失败',
            message: error.message
          });
        }
      }

      // 日志端点
      if (pathname === '/v1/logs' && req.method === 'GET') {
        const urlParams = new URLSearchParams(url.search);
        const level = urlParams.get('level') || null;
        const limit = parseInt(urlParams.get('limit')) || 100;
        const since = urlParams.get('since') || null;

        // 过滤日志
        let filteredLogs = this.logBuffer;

        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }

        if (since) {
          filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) > new Date(since));
        }

        // 限制返回数量
        const resultLogs = filteredLogs.slice(-Math.min(limit, filteredLogs.length));

        return this._sendJSON(res, 200, {
          logs: resultLogs,
          total: filteredLogs.length,
          retrieved: resultLogs.length
        });
      }

      // 运行时配置管理端点
      if (pathname === '/v1/config' && req.method === 'POST') {
        if (!this.configService) {
          this.configService = new ConfigService();
        }

        const newConfig = await this._parseBody(req);
        const success = this.configService.saveConfig(newConfig);
        return this._sendJSON(res, success ? 200 : 500, {
          success,
          message: success ? '运行时配置已更新' : '配置更新失败'
        });
      }

      // 分解器测试端点
      if (pathname === '/api/components/decomposer/test' && req.method === 'POST') {
        return this._handleDecomposerTest(req, res);
      }

      // 模型选择器测试端点
      if (pathname === '/api/components/selector/test' && req.method === 'POST') {
        return this._handleSelectorTest(req, res);
      }

      // 并发执行器测试端点
      if (pathname === '/api/components/executor/test' && req.method === 'POST') {
        return this._handleExecutorTest(req, res);
      }

      // 整合器测试端点
      if (pathname === '/api/components/integrator/test' && req.method === 'POST') {
        return this._handleIntegratorTest(req, res);
      }

      // 会话存储器测试端点
      if (pathname.startsWith('/api/components/session')) {
        return this._handleSessionTest(req, res, pathname);
      }

      // 服务器状态检查端点
      if (pathname === '/v1/status' && req.method === 'GET') {
        const status = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage ? process.cpuUsage() : null,
          activeConnections: this.server ? this.server.connections || 0 : 0,
          config: {
            port: this.config.port,
            enableSessionSupport: this.config.enableSessionSupport,
            sessionStoreType: this.config.enableSessionSupport ? this.config.sessionStoreType : undefined,
            debug: this.config.debug,
            autoOrchestrate: this.config.autoOrchestrate
          },
          components: {
            decomposer: !!this.decomposer,
            modelSelector: !!this.modelSelector,
            executorIntegration: !!this.executorIntegration,
            integrator: !!this.integrator,
            sessionManager: this.config.enableSessionSupport ? !!this.sessionManager : undefined,
            requestClassifier: this.config.enableSessionSupport ? !!this.requestClassifier : undefined
          },
          sessionInfo: this.config.enableSessionSupport ? await this._getSessionStatistics() : undefined,
          timestamp: new Date().toISOString()
        };

        return this._sendJSON(res, 200, status);
      }

      // 日志清理端点
      if (pathname === '/v1/logs/clear' && req.method === 'POST') {
        this.logBuffer = [];
        return this._sendJSON(res, 200, { message: '日志已清除' });
      }

      // 指标API端点
      if (pathname === '/api/metrics' && req.method === 'GET') {
        const today = new Date().toISOString().split('T')[0];
        const dailyMetrics = await this.metricsCollector.getDailyMetrics(today);

        // 获取上周的汇总数据用于对比
        const lastWeekStart = new Date();
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date();
        const weeklyMetrics = await this.metricsCollector.getWeeklyMetrics(
          lastWeekStart.toISOString().split('T')[0],
          lastWeekEnd.toISOString().split('T')[0]
        );

        return this._sendJSON(res, 200, {
          success: true,
          data: {
            today: dailyMetrics,
            weeklySummary: weeklyMetrics,
            currentSessions: this.metricsCollector.getAllSessions()
          }
        });
      }

      // 获取指定会话的指标
      if (pathname.startsWith('/api/metrics/sessions/') && req.method === 'GET') {
        const sessionId = pathname.split('/')[4]; // /api/metrics/sessions/:sessionId
        const sessionMetrics = this.metricsCollector.getSessionMetrics(sessionId);

        if (sessionMetrics) {
          return this._sendJSON(res, 200, {
            success: true,
            data: sessionMetrics
          });
        } else {
          return this._sendJSON(res, 404, {
            success: false,
            error: 'Session not found'
          });
        }
      }

      // 获取定价配置
      if (pathname === '/api/metrics/pricing' && req.method === 'GET') {
        const pricingConfig = {};
        for (const [modelId, pricing] of this.metricsCollector.modelPricing.entries()) {
          pricingConfig[modelId] = pricing;
        }

        return this._sendJSON(res, 200, {
          success: true,
          data: pricingConfig
        });
      }

      // 更新定价配置
      if (pathname === '/api/metrics/pricing' && req.method === 'PUT') {
        const pricingConfig = await this._parseBody(req);
        const result = await this.metricsCollector.updatePricingConfig(pricingConfig);

        return this._sendJSON(res, 200, result);
      }

      // 清除所有指标数据
      if (pathname === '/api/metrics/clear' && req.method === 'POST') {
        try {
          const result = await this.metricsCollector.clearAllMetrics();
          return this._sendJSON(res, 200, {
            success: true,
            message: 'All metrics cleared'
          });
        } catch (error) {
          this._log(`Clear metrics failed: ${error.message}`, 'error');
          return this._sendJSON(res, 500, {
            success: false,
            error: error.message
          });
        }
      }

      // 获取历史指标（按时间范围）
      if (pathname === '/api/metrics/history' && req.method === 'GET') {
        const urlObj = new URL(req.url, `http://localhost:${this.config.port}`);
        const { startDate, endDate, granularity = 'daily' } = urlObj.searchParams;

        try {
          if (granularity === 'weekly') {
            const weeklyMetrics = await this.metricsCollector.getWeeklyMetrics(startDate, endDate);
            return this._sendJSON(res, 200, {
              success: true,
              data: weeklyMetrics
            });
          } else if (granularity === 'monthly') {
            // 从startDate解析年月
            const date = new Date(startDate);
            const year = date.getFullYear();
            const month = date.getMonth() + 1; // getMonth()返回0-11，需要加1

            const monthlyMetrics = await this.metricsCollector.getMonthlyMetrics(year, month);
            return this._sendJSON(res, 200, {
              success: true,
              data: monthlyMetrics
            });
          } else {
            // 日度聚合
            const dailyMetrics = [];
            const start = new Date(startDate);
            const end = new Date(endDate);

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0];
              const dailyData = await this.metricsCollector.getDailyMetrics(dateStr);
              dailyMetrics.push(dailyData);
            }

            return this._sendJSON(res, 200, {
              success: true,
              data: dailyMetrics
            });
          }
        } catch (error) {
          console.error('[OrchestratorServer] Error getting historical metrics:', error);
          return this._sendJSON(res, 500, {
            success: false,
            error: error.message
          });
        }
      }

      // ============================================================
      // 任务中断 API
      // ============================================================

      // POST /v1/task/abort/:taskId - 中断任务
      if (pathname.match(/^\/v1\/task\/abort\/.+$/) && req.method === 'POST') {
        const taskId = pathname.split('/').pop();
        const requestBody = await this._parseBody(req).catch(() => ({}));
        const reason = requestBody.reason || 'User requested abort';

        const success = this.taskAbortController.abortTask(taskId, reason);

        return this._sendJSON(res, success ? 200 : 404, {
          success,
          taskId,
          message: success ? `Task ${taskId} aborted` : `Task ${taskId} not found or already aborted`
        });
      }

      // GET /v1/task/abort/:taskId - 获取任务中断状态
      if (pathname.match(/^\/v1\/task\/abort\/.+$/) && req.method === 'GET') {
        const taskId = pathname.split('/').pop();
        const isAborted = this.taskAbortController.isAborted(taskId);
        const abortInfo = this.taskAbortController.getAbortedTaskInfo(taskId);

        return this._sendJSON(res, 200, {
          taskId,
          aborted: isAborted,
          abortInfo
        });
      }

      // ============================================================
      // 多轮对话 API
      // ============================================================

      // POST /v1/conversation/:taskId/continue - 继续对话
      if (pathname.match(/^\/v1\/conversation\/.+\/continue$/) && req.method === 'POST') {
        const taskId = pathname.split('/')[2];
        const requestBody = await this._parseBody(req).catch(() => ({}));
        const continueInfo = requestBody.continueInfo || {};

        const success = this.conversationManager.continueConversation(taskId, continueInfo);

        if (success) {
          // 启动心跳
          this.conversationManager.startHeartbeat(taskId);
        }

        return this._sendJSON(res, success ? 200 : 400, {
          success,
          taskId,
          message: success ? `Conversation ${taskId} continued` : `Conversation ${taskId} cannot be continued`
        });
      }

      // POST /v1/conversation/:taskId/end - 结束对话
      if (pathname.match(/^\/v1\/conversation\/.+\/end$/) && req.method === 'POST') {
        const taskId = pathname.split('/')[2];
        const requestBody = await this._parseBody(req).catch(() => ({}));
        const endInfo = requestBody.endInfo || {};

        const context = this.conversationManager.getContext(taskId);
        if (!context) {
          return this._sendJSON(res, 404, {
            success: false,
            taskId,
            message: `Conversation ${taskId} not found`
          });
        }

        this.conversationManager.endConversation(taskId, endInfo);

        return this._sendJSON(res, 200, {
          success: true,
          taskId,
          message: `Conversation ${taskId} ended`
        });
      }

      // POST /v1/conversation/:taskId/heartbeat - 心跳保活
      if (pathname.match(/^\/v1\/conversation\/.+\/heartbeat$/) && req.method === 'POST') {
        const taskId = pathname.split('/')[2];

        const success = this.conversationManager.heartbeat(taskId);

        return this._sendJSON(res, success ? 200 : 404, {
          success,
          taskId,
          message: success ? 'Heartbeat received' : `Conversation ${taskId} not found`
        });
      }

      // GET /v1/conversation/:taskId - 获取对话状态
      if (pathname.match(/^\/v1\/conversation\/.+$/) && !pathname.includes('/continue') && !pathname.includes('/end') && !pathname.includes('/heartbeat') && req.method === 'GET') {
        const taskId = pathname.split('/')[2];

        const context = this.conversationManager.getContext(taskId);
        if (!context) {
          return this._sendJSON(res, 404, {
            success: false,
            taskId,
            message: `Conversation ${taskId} not found`
          });
        }

        return this._sendJSON(res, 200, {
          success: true,
          taskId,
          status: context.status,
          messageCount: context.messages.length,
          lastActiveAt: context.lastActiveAt,
          createdAt: context.createdAt
        });
      }

      // GET /v1/conversations - 获取所有活跃对话
      if (pathname === '/v1/conversations' && req.method === 'GET') {
        const activeConversations = this.conversationManager.getActiveConversations();
        const stats = this.conversationManager.getStats();

        return this._sendJSON(res, 200, {
          success: true,
          activeConversations,
          stats
        });
      }

      // 404
      this._sendJSON(res, 404, {
        error: 'Not Found',
        available_endpoints: {
          'GET /health': '健康检查',
          'POST /orchestrate': '编排端点（主端点）',
          'POST /v1/orchestrate': '编排端点（兼容路径）',
          'POST /v1/decompose': '直接分解测试',
          'POST /v1/select-model': '直接模型选择测试',
          'POST /v1/integrate': '直接整合测试',
          'POST /v1/correct': 'Corrector 模块测试',
          'GET /v1/model-selector-status': '模型选择器状态',
          'GET /v1/logs': '获取实时日志',
          'POST /v1/logs/clear': '清除日志缓冲区',
          'GET /v1/progress/:taskId': '获取特定任务进度',
          'GET /v1/progress': '获取所有活跃任务进度',
          'GET /v1/progress/events': '获取进度事件',
          'GET /v1/flow/subscribe': 'SSE 流订阅（所有事件）',
          'GET /v1/flow/subscribe/:sessionId': 'SSE 流订阅（特定会话）',
          'GET /v1/model/response/subscribe': 'SSE 模型响应订阅（UI监控）',
          'POST /v1/task/abort/:taskId': '中断任务',
          'GET /v1/task/abort/:taskId': '获取任务中断状态',
          'POST /v1/conversation/:taskId/continue': '继续对话',
          'POST /v1/conversation/:taskId/end': '结束对话',
          'POST /v1/conversation/:taskId/heartbeat': '对话心跳',
          'GET /v1/conversation/:taskId': '获取对话状态',
          'GET /v1/conversations': '获取所有活跃对话'
        }
      });

    } catch (error) {
      this._log(`请求处理错误：${error.message}`, 'error');
      this._sendJSON(res, 500, {
        error: error.message,
        stack: this.config.debug ? error.stack : undefined
      });
    }
  }

  // ============================================================
  // 全局异常处理器设置（在构造函数末尾）
  // ============================================================
  _setupGlobalExceptionHandlers() {
    // 处理未捕获的同步异常
    process.on('uncaughtException', (error) => {
      const errorMsg = `未捕获的同步异常: ${error.message}`;
      console.error(errorMsg);
      if (this._log) {
        this._log(errorMsg, 'error');
      }
      // 记录详细错误信息
      if (this.config.debug && error.stack) {
        console.error(error.stack);
      }
    });

    // 处理未捕获的异步异常
    process.on('unhandledRejection', (reason, promise) => {
      const errorMsg = reason instanceof Error
        ? `未捕获的异步异常: ${reason.message}`
        : `未处理的 Promise 拒绝: ${reason}`;
      console.error(errorMsg);
      if (this._log) {
        this._log(errorMsg, 'error');
      }
      // 记录详细错误信息
      if (this.config.debug) {
        if (reason instanceof Error && reason.stack) {
          console.error(reason.stack);
        }
        console.error('Promise:', promise);
      }
    });

    this._log('全局异常处理器已设置');
  }

  /**
   * 启动服务器
   */
  async start() {
    // 在启动前设置全局异常处理器
    this._setupGlobalExceptionHandlers();

    // 0. 首先初始化模型状态广播器（必须在所有组件之前创建）
    if (!this.modelStatusBroadcaster) {
      this.modelStatusBroadcaster = new ModelStatusBroadcaster();
      this._log('模型状态广播器已初始化');
    }

    // 1. 初始化模型选择器（传入 Providers 配置和广播器）
    if (!this.modelSelector) {
      this.modelSelector = new ModelSelector({
        debug: this.config.debug,
        models: this.config.Providers || [],  // 传入 Providers 配置
        selector: this.config.selector || {},  // 传入选择器配置
        model_task_matrix: this.config.model_task_matrix || {},
        modelStatusBroadcaster: this.modelStatusBroadcaster  // 传入广播器
      });
      this._log('模型选择器已初始化');
    }

    // 2. 初始化分解器
    if (!this.decomposer) {
      this.decomposer = new ElasticDecomposer({
        debug: this.config.debug,
        logLevel: this.config.debug ? 'debug' : 'info',
        ...this.config.decomposer
      });

      // 初始化混合转换器（传入广播器）
      const llmClient = this.decomposer.typeAnnotator?.concurrentLLMInferencer?.llmClient;
      this.hybridConverter = new HybridTaskConverter({
        llmClient: llmClient,
        logLevel: this.config.debug ? 'debug' : 'warn',
        modelStatusBroadcaster: this.modelStatusBroadcaster  // 传入广播器
      });
    }

    // 3. 初始化指标收集器（必须在执行器之前初始化）
    if (!this.metricsCollector) {
      this.metricsCollector = new MetricsCollector();
      this._log('指标收集器已初始化');
    }

    // 4. 初始化执行器（传入广播器）
    if (!this.executorIntegration) {
      // 添加调试日志
      console.log(`[OrchestratorServer] 在初始化执行器时 metricsCollector 存在: ${!!this.metricsCollector}`);

      this.executorIntegration = new OrchestratorExecutorIntegration({
        debug: this.config.debug,
        maxConcurrency: this.config.maxConcurrency,
        timeout: this.config.timeout,
        modelSelector: this.modelSelector,
        modelRegistry: this.modelSelector?.modelRegistry,
        metricsCollector: this.metricsCollector,
        modelStatusBroadcaster: this.modelStatusBroadcaster,  // 传入广播器

        // 从统一配置读取执行器配置
        executor: this.config.executor || {},
        extensions: this.config.extensions || {},
        streaming: this.config.streaming || {}
      });

      this._log('执行器集成已初始化，指标收集器已连接');
    }

    // 5. 初始化任务复杂度分析器（传入广播器）
    if (!this.complexityAnalyzer) {
      // 确保分解器已初始化，这样我们可以获取LLM客户端
      if (!this.decomposer) {
        this.decomposer = new ElasticDecomposer({
          debug: this.config.debug,
          logLevel: this.config.debug ? 'debug' : 'info',
          ...this.config.decomposer
        });

        // 初始化混合转换器
        const llmClient = this.decomposer.typeAnnotator?.concurrentLLMInferencer?.llmClient;
        this.hybridConverter = new HybridTaskConverter({
          llmClient: llmClient,
          logLevel: this.config.debug ? 'debug' : 'warn',
          modelStatusBroadcaster: this.modelStatusBroadcaster
        });
      }

      // 获取 LLM 客户端，如果获取不到就创建一个新的
      let llmClient = this.decomposer?.typeAnnotator?.concurrentLLMInferencer?.llmClient;

      if (!llmClient) {
        // 如果分解器中的LLM客户端不可用，创建一个新的
        try {
          const LLMClient = require('./decomposer/llm/LLMClient');
          llmClient = new LLMClient({
            baseURL: this.config.orchestrator?.decomposer?.llm?.base_url || 'http://localhost:11434',
            model: this.config.orchestrator?.decomposer?.llm?.model || 'qwen2.5:3b',
            timeout: this.config.orchestrator?.decomposer?.llm?.timeout || 30000
          });
          this._log('为复杂度分析器创建了新的LLM客户端', 'debug');
        } catch (error) {
          this._log(`无法创建LLM客户端: ${error.message}`, 'warn');
          llmClient = null; // 仍然创建分析器，但不使用LLM功能
        }
      }

      this.complexityAnalyzer = new TaskComplexityAnalyzer({
        llmClient: llmClient,
        config: this.config.orchestrator?.taskComplexityAnalysis,
        modelStatusBroadcaster: this.modelStatusBroadcaster  // 传入广播器
      });
      this._log('任务复杂度分析器已初始化');
    }

    // 6. 初始化整合器
    if (!this.integrator) {
      this.integrator = new Integrator(this.integratorConfig);
      this._log('整合器已初始化');
    }

    // 7. 执行模型健康检查（启动时检查 API 密钥和端点）
    this._log('正在执行模型健康检查...');
    const healthChecker = new ModelHealthChecker(this.modelSelector);
    const healthResults = await healthChecker.checkAllModels();

    this._log(`模型健康检查完成：${healthResults.availableModels}/${healthResults.totalModels} 可用`);

    // 显示本地 Ollama 模型状态
    if (healthResults.localModels?.ollama) {
      const ollamaStatus = healthResults.localModels.ollama;
      if (ollamaStatus.available) {
        this._log(`本地 Ollama 模型：✅ 可用 (${ollamaStatus.models.length} 个模型)`);
        for (const model of ollamaStatus.models) {
          this._log(`  - ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)} GB)`, 'info', 'Ollama');
        }
      } else {
        this._log(`本地 Ollama 模型：❌ 不可用 - ${ollamaStatus.reason}`, 'warn');
      }
    }

    // 7.5 广播模型状态到所有已注册的组件
    if (this.modelStatusBroadcaster && healthResults.models) {
      this.modelStatusBroadcaster.broadcast(healthResults.models);
      this._log(`模型状态已广播到 ${this.modelStatusBroadcaster.getRegisteredComponents().length} 个组件`);
    }

    // 8. 初始化API（指标收集器已在前面初始化）
    if (!this.metricsAPI) {
      this.metricsAPI = new MetricsAPI(this.metricsCollector, this.configService);
    }

    // 6. 启动 HTTP 服务器
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this._handleRequest.bind(this));

      this.server.listen(this.config.port, '0.0.0.0', () => {
        // 保存实际监听的端口
        const address = this.server.address();
        this._serverPort = address?.port || this.config.port;

        this._log(`==========================================`);
        this._log(`  编排器服务器已启动`);
        this._log(`  监听端口：http://0.0.0.0:${this.config.port}`);
        this._log(``);
        this._log(`  模型状态:`);
        this._log(`    可用模型：${healthResults.availableModels}/${healthResults.totalModels}`);
        this._log(`    不可用模型：${healthResults.unavailableModels}`);
        this._log(``);
        this._log(`  可用端点:`);
        this._log(`    GET  /health                           - 健康检查`);
        this._log(`    POST /orchestrate                      - 编排端点（主端点）`);
        this._log(`    POST /v1/orchestrate                   - 编排端点（兼容路径）`);
        this._log(`    POST /v1/orchestrate-tool-calls        - 编排端点（工具调用格式）`);
        this._log(`    POST /orchestrate-tool-calls           - 编排端点（工具调用格式，兼容路径）`);
        this._log(`    POST /v1/decompose                     - 直接分解测试`);
        this._log(`    POST /v1/select-model                  - 直接模型选择测试`);
        this._log(`    POST /v1/integrate                    - 直接整合测试`);
        this._log(`    POST /v1/correct                      - Corrector 模块测试`);
        this._log(`    POST /v1/execute-subtasks              - 直接执行子任务`);
        this._log(`    GET  /v1/model-selector-status         - 模型选择器状态`);
        this._log(`    GET  /v1/executor-integration-status   - 执行器集成状态`);
        this._log(`    GET  /v1/integrator-status             - 整合器状态（新增）`);
        this._log(`    GET  /v1/model-health-status           - 模型健康状态`);
        this._log(`    GET  /v1/session-status                - 会话管理状态`);
        this._log(`    GET  /v1/sessions                      - 获取单个会话详情 (需 session_id)`);
        this._log(`    DELETE /v1/sessions                    - 删除会话 (需 session_id)`);
        this._log(`    GET  /v1/sessions/user                 - 获取用户的所有会话`);
        this._log(`    GET  /v1/sessions/project              - 获取项目的所有会话`);
        this._log(`    GET  /v1/sessions/export               - 导出会话数据 (需 session_id)`);
        this._log(`    POST /v1/sessions/import               - 导入会话数据`);
        this._log(`    GET  /v1/logs                          - 获取实时日志`);
        this._log(`    POST /v1/logs/clear                    - 清除日志缓冲区`);
        this._log(`    POST /v1/config                        - 运行时配置管理`);
        this._log(`    GET  /v1/status                        - 服务器状态检查`);
        this._log(`    GET  /api/metrics                      - 获取指标汇总`);
        this._log(`    GET  /api/metrics/sessions/:id       - 获取会话指标`);
        this._log(`    GET  /api/metrics/pricing            - 获取定价配置`);
        this._log(`    PUT  /api/metrics/pricing            - 更新定价配置`);
        this._log(`    GET  /api/metrics/history            - 获取历史指标`);
        this._log(`    GET  /api/config/model-task-matrix    - 获取模型任务矩阵配置`);
        this._log(`    PUT  /api/config/model-task-matrix    - 更新模型任务矩阵配置`);
        this._log(`    PUT  /api/config/model-task-matrix/weights - 更新维度权重`);
        this._log(`    PUT  /api/config/model-task-matrix/suitability - 更新适合度矩阵`);
        this._log(`    GET  /v1/progress/:taskId              - 获取特定任务进度`);
        this._log(`    GET  /v1/progress                      - 获取所有活跃任务进度`);
        this._log(`    GET  /v1/progress/events               - 获取进度事件`);
        this._log(`    GET  /v1/flow/subscribe                - SSE 流程事件订阅 (实时推送)`);
        this._log(`    GET  /v1/model/response/subscribe     - SSE 模型响应订阅 (UI监控)`);
        this._log(`    GET  /v1/flow/status                   - 获取活跃编排列表`);
        this._log(`    GET  /v1/flow/:orchestrationId        - 获取特定编排的流程历史`);
        this._log(``);
        this._log(`  CCR Router 地址：${this.config.ccrRouterUrl}`);
        this._log(`  调试模式：${this.config.debug ? '开启' : '关闭'}`);
        this._log(`  自动编排：${this.config.autoOrchestrate ? '开启' : '关闭'}`);
        this._log(`  混合转换：启用（规则+LLM）`);
        this._log(`  模型选择：已集成（为分解任务选择合适模型）`);
        this._log(`==========================================`);

        // 存储健康检查结果供后续使用
        this.healthResults = healthResults;

        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * 格式化编排结果为整合器兼容格式
   *
   * @param {Object} orchestrateResult - 编排结果
   * @param {Object} requestBody - 请求体
   * @returns {Object} 格式化后的结果
   */
  _formatOrchestrationResult(orchestrateResult, requestBody) {
    // execution_results 可能是整个执行结果对象，也可能是直接的数组
    const executionResults = orchestrateResult.execution_results?.execution_results ||
                             orchestrateResult.execution_results?.results ||
                             orchestrateResult.execution_results || [];
    const subtasks = orchestrateResult.subtasks || [];
    const integrationResult = orchestrateResult.integration_result;

    // 如果整合器已经返回了 files，直接使用
    if (integrationResult?.files && integrationResult.files instanceof Map) {
      const files = integrationResult.files;

      const result = {
        success: integrationResult.success,
        files,
        logs: integrationResult.logs || [],
        warnings: integrationResult.warnings || [],
        qualityReport: integrationResult.qualityReport,
        validationReport: integrationResult.validationReport,
        predictedIssues: integrationResult.predictedIssues,
        // 契约优先模式：包含 openapi_spec 和 typesContent
        openapi_spec: integrationResult.openapi_spec,
        typesContent: integrationResult.typesContent,
        orchestrationMetadata: {
          modelSelections: orchestrateResult.modelSelections,
          decomposition: orchestrateResult.decomposition,
          executionSummary: orchestrateResult.execution_results?.execution_summary,
          selectedModels: orchestrateResult.metadata?.selectedModels || []
        },
        integrationMetadata: {
          cacheStats: integrationResult.cacheStats,
          plugins: integrationResult.plugins,
          dependencyReport: integrationResult.dependencyReport
        }
      };

      return result;
    }

    // 回退：如果没有整合器结果，手动构建 files Map
    const files = new Map();

    // 引入整合器的多文件解析方法
    const { IntegrationInterfaceProcessor } = require('../integrator/interface/processor');

    if (Array.isArray(executionResults)) {
      for (const result of executionResults) {
        const taskId = result.task_id || result.id || 'unknown';
        const content = result.content || result.response || '';

        // 获取对应的子任务信息
        const subtask = subtasks.find(st => st.id === taskId);
        const integrationHints = result.integrationHints || subtask?.integrationHints || {};

        // 检查是否有多文件解析需求
        const targetFiles = integrationHints.targetFiles;
        const hasMultipleFiles = targetFiles && Array.isArray(targetFiles) && targetFiles.length > 1;

        if (hasMultipleFiles) {
          // 有多文件需求，调用 parseMultiFileContent 解析
          const parsedFiles = IntegrationInterfaceProcessor.parseMultiFileContent
            ? IntegrationInterfaceProcessor.parseMultiFileContent(content, targetFiles)
            : this._parseMultiFileContentFallback(content, targetFiles);

          // 为每个解析出的文件创建条目
          for (const parsedFile of parsedFiles) {
            const filePath = parsedFile.filePath;
            const fileContent = parsedFile.content;

            // 推断语言
            const ext = filePath.split('.').pop()?.toLowerCase();
            const extToLang = {
              js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
              py: 'python', json: 'json', css: 'css', scss: 'scss',
              less: 'less', html: 'html', md: 'markdown', yaml: 'yaml', yml: 'yaml'
            };
            const language = extToLang[ext] || 'javascript';

            files.set(filePath, {
              path: filePath,
              content: fileContent,
              sourceTaskId: taskId,
              modelUsed: result.model_used || result.selected_model || 'unknown',
              language,
              integrationHints
            });
          }
        } else {
          // 单文件情况，使用原有逻辑
          let filePath = result.targetFile || subtask?.targetFile || `generated/${taskId}.js`;

          // 推断语言
          const ext = filePath.split('.').pop()?.toLowerCase();
          const extToLang = {
            js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
            py: 'python', json: 'json', css: 'css', scss: 'scss',
            less: 'less', html: 'html', md: 'markdown', yaml: 'yaml', yml: 'yaml'
          };
          const language = extToLang[ext] || 'javascript';

          files.set(filePath, {
            path: filePath,
            content,
            sourceTaskId: taskId,
            modelUsed: result.model_used || result.selected_model || 'unknown',
            language,
            integrationHints
          });
        }
      }
    }

    // 构建整合器格式的结果
    const integrationStyleResult = {
      success: orchestrateResult.orchestrated || executionResults.length > 0,
      files,
      logs: [],
      warnings: [],
      qualityReport: null,
      validationReport: {
        success: true,
        message: '编排完成'
      },
      predictedIssues: integrationResult?.predictedIssues || null
    };

    // 添加编排元数据
    if (orchestrateResult.metadata) {
      integrationStyleResult.orchestrationMetadata = {
        modelSelections: orchestrateResult.modelSelections,
        decomposition: orchestrateResult.decomposition,
        executionSummary: orchestrateResult.execution_results?.execution_summary,
        selectedModels: orchestrateResult.metadata?.selectedModels || []
      };
    }

    return integrationStyleResult;
  }

  /**
   * 回退用的多文件内容解析方法
   * 当整合器不可用时，使用此方法解析多文件内容
   *
   * @param {string} content - 原始内容
   * @param {string[]} targetFiles - 目标文件路径列表
   * @returns {Array<{filePath: string, content: string}>} 解析后的文件列表
   */
  _parseMultiFileContentFallback(content, targetFiles) {
    const results = [];

    // 尝试使用 [FILE:N]...[BEGIN:N]...[END:N] 格式解析
    const parsedFiles = this._parseIndexedFormat(content);

    if (parsedFiles.size > 0) {
      for (const targetFile of targetFiles) {
        if (parsedFiles.has(targetFile)) {
          results.push({
            filePath: targetFile,
            content: parsedFiles.get(targetFile)
          });
        } else {
          // 尝试模糊匹配
          const matched = Array.from(parsedFiles.keys()).find(k =>
            k.endsWith(targetFile) || targetFile.endsWith(k)
          );
          if (matched) {
            results.push({
              filePath: targetFile,
              content: parsedFiles.get(matched)
            });
          } else {
            results.push({
              filePath: targetFile,
              content: `// ERROR: Content for ${targetFile} was not generated`
            });
          }
        }
      }
    } else {
      // 无法解析，返回原始内容作为第一个文件
      results.push({
        filePath: targetFiles[0],
        content: content
      });
    }

    return results;
  }

  /**
   * 解析索引格式的多文件内容 [FILE:N]...[BEGIN:N]...[END:N]
   *
   * @param {string} content - 模型返回的内容
   * @returns {Map<string, string>} 文件路径到内容的映射
   */
  _parseIndexedFormat(content) {
    const parsedFiles = new Map();

    // 匹配 [FILE:N]FILE_PATH 格式
    const fileMarkerRegex = /\[FILE:(\d+)\]([^\n]+)/g;
    // 匹配 [BEGIN:N] 格式
    const beginMarkerRegex = /\[BEGIN:(\d+)\]/g;
    // 匹配 [END:N] 格式
    const endMarkerRegex = /\[END:(\d+)\]/g;

    const fileMarkers = [];
    let match;

    while ((match = fileMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      const filePath = match[2].trim();
      fileMarkers.push({ index, filePath, position: match.index });
    }

    const beginMarkers = [];
    while ((match = beginMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      beginMarkers.push({ index, position: match.index });
    }

    const endMarkers = [];
    while ((match = endMarkerRegex.exec(content)) !== null) {
      const index = parseInt(match[1]);
      endMarkers.push({ index, position: match.index });
    }

    for (const fileMarker of fileMarkers) {
      const index = fileMarker.index;
      const filePath = fileMarker.filePath;

      const begin = beginMarkers.find(b => b.index === index);
      const end = endMarkers.find(e => e.index === index);

      if (begin && end && begin.position > fileMarker.position && end.position > begin.position) {
        const contentStart = begin.position + begin[0].length;
        const contentEnd = end.position;
        let fileContent = content.substring(contentStart, contentEnd).trim();

        // 清洗残留的标记
        fileContent = fileContent.replace(/^\`\`\`file:[^\n]+\n?/, '');
        fileContent = fileContent.replace(/^\`\`\`\w*\n?/, '');
        fileContent = fileContent.replace(/\n?\`\`\`\s*$/, '');

        if (fileContent && !parsedFiles.has(filePath)) {
          parsedFiles.set(filePath, fileContent);
        }
      }
    }

    return parsedFiles;
  }

  /**
   * 格式化编排结果并返回适合 Claude Code 的响应
   *
   * @param {Object} orchestrateResult - 编排结果
   * @param {Object} requestBody - 请求体
   * @param {string} [format='json'] - 输出格式
   * @returns {Object} 格式化后的响应
   */
  _formatResponseForClaudeCode(orchestrateResult, requestBody, format = 'json') {
    const formattedResult = this._formatOrchestrationResult(orchestrateResult, requestBody);

    // 使用 OutputFormatter 格式化输出
    let outputFormat = OutputFormat.JSON;
    if (format === 'claude_code') {
      outputFormat = OutputFormat.CLAUDE_CODE;
    } else if (format === 'markdown') {
      outputFormat = OutputFormat.MARKDOWN;
    } else if (format === 'text') {
      outputFormat = OutputFormat.TEXT;
    } else if (format === 'tool_call') {
      outputFormat = OutputFormat.TOOL_CALL;
    }

    const formattedOutput = this.outputFormatter.format(formattedResult, outputFormat, {
      includeLogs: this.config.debug,
      includeWarnings: true,
      includeQualityReport: false,
      includeValidationReport: true,
      includeFileContent: true
    });

    // 如果是 JSON 格式，解析后返回对象
    if (outputFormat === OutputFormat.JSON) {
      return JSON.parse(formattedOutput);
    }

    // 如果是工具调用格式，直接返回格式化的输出
    if (outputFormat === OutputFormat.TOOL_CALL) {
      return formattedOutput;
    }

    // 在返回结果中添加自动检测建议
    let returnResult;

    // 如果是 JSON 格式，解析后返回对象
    if (outputFormat === OutputFormat.JSON) {
      returnResult = JSON.parse(formattedOutput);
    }
    // 如果是工具调用格式，直接返回格式化的输出
    else if (outputFormat === OutputFormat.TOOL_CALL) {
      returnResult = formattedOutput;
    }
    // 否则返回包含格式化字符串的对象
    else {
      returnResult = {
        ...formattedResult,
        formattedOutput,
        outputFormat
      };
    }

    // 添加后续操作建议，特别是自动检测建议
    if (!returnResult.nextSteps) {
      returnResult.nextSteps = [];
    }

    // 添加文件创建后的自动检测步骤
    returnResult.nextSteps.push(
      {
        step: "automated_check",
        description: "执行自动化代码质量检查",
        actions: [
          "检查新创建/修改的文件是否存在语法错误",
          "验证代码风格一致性",
          "检测潜在的变量名冲突",
          "检查依赖关系完整性",
          "运行基本的语法验证工具"
        ],
        tools: ["read", "grep", "bash"]
      },
      {
        step: "bug_detection",
        description: "主动检测代码中的潜在bug",
        actions: [
          "审查逻辑实现是否正确",
          "检查边界条件处理",
          "验证API调用和参数传递",
          "确认错误处理机制是否完善"
        ],
        tools: ["read", "grep", "bash"]
      },
      {
        step: "integration_check",
        description: "验证各组件集成是否存在问题",
        actions: [
          "检查文件间的导入导出关系",
          "验证接口定义与实现的一致性",
          "确认数据流是否正确",
          "测试组件间的通信"
        ],
        tools: ["read", "grep", "bash"]
      }
    );

    return returnResult;
  }

  /**
   * 检查响应大小是否超过 Token 限制
   * 如果超过，则执行截断策略
   *
   * @param {Object} result - 响应结果
   * @param {number} maxTokens - 最大 Token 数（默认 8000，约 6000 中文字符）
   * @returns {Object} 处理后的结果
   */
  _handleTokenLimit(result, maxTokens = 16000) {
    // 完整的 token 限制处理逻辑，包含更精确的 token 估算和优化策略
    if (!result.files) {
      return result;
    }

    // 检查文件内容长度并根据需要优化
    const optimizedResult = { ...result };
    optimizedResult.files = new Map(optimizedResult.files);

    // 首先计算总 token 数
    let totalTokens = 0;
    const fileTokens = new Map();

    for (const [filePath, fileData] of optimizedResult.files.entries()) {
      const content = fileData.content || '';
      const tokenCount = this._estimateTokens(content);
      fileTokens.set(filePath, tokenCount);
      totalTokens += tokenCount;
    }

    // 如果超过限制，执行优化策略
    if (totalTokens > maxTokens) {
      this._log(`检测到 token 超限：${totalTokens}/${maxTokens}`);

      // 策略 1: 删除临时文件和测试文件
      const tempFiles = [];
      for (const [filePath,] of optimizedResult.files.entries()) {
        if (filePath.endsWith('.tmp') || filePath.includes('test') || filePath.includes('temp') ||
            filePath.includes('__pycache__') || filePath.includes('node_modules')) {
          tempFiles.push(filePath);
        }
      }

      for (const filePath of tempFiles) {
        const tokensToRemove = fileTokens.get(filePath) || 0;
        optimizedResult.files.delete(filePath);
        totalTokens -= tokensToRemove;
        if (totalTokens <= maxTokens) break;
      }

      // 策略 2: 如果仍然超限，压缩大型文件内容
      if (totalTokens > maxTokens) {
        const sortedFiles = Array.from(optimizedResult.files.entries()).sort((a, b) =>
          fileTokens.get(b[0]) - fileTokens.get(a[0])
        );

        for (const [filePath, fileData] of sortedFiles) {
          if (totalTokens <= maxTokens) break;

          const originalTokens = fileTokens.get(filePath);
          // 尝试截断大型文件的注释部分
          const optimizedContent = this._optimizeFileContent(fileData.content);
          const newTokens = this._estimateTokens(optimizedContent);

          if (newTokens < originalTokens) {
            fileData.content = optimizedContent;
            optimizedResult.files.set(filePath, fileData);
            totalTokens -= (originalTokens - newTokens);
          }
        }
      }

      // 策略 3: 如果仍然超限，考虑内容摘要
      if (totalTokens > maxTokens) {
        this._log(`警告：仍存在 token 超限 (${totalTokens}/${maxTokens})，考虑使用内容摘要`);
      }
    }

    if (totalTokens > maxTokens * 0.9) {  // 如果接近限制的 90%
      this._log(`警告：token 使用接近限制 (${totalTokens}/${maxTokens})`);
    }

    // 添加 token 使用信息
    optimizedResult.tokenUsage = {
      estimated: totalTokens,
      limit: maxTokens,
      truncated: totalTokens > maxTokens,
      optimized: true
    };

    return optimizedResult;
  }

  /**
   * 生成截断后的摘要信息
   *
   * @private
   * @param {Object} result - 原始结果
   * @returns {Object} 摘要信息
   */
  _generateTruncatedSummary(result) {
    let files = result.files || {};
    let fileEntries;

    // 支持 Map 和普通对象两种格式
    if (files instanceof Map) {
      fileEntries = Array.from(files.entries());
    } else {
      fileEntries = Object.entries(files);
    }

    const fileList = fileEntries.map(([path, file]) => ({
      path,
      size: file.content?.length || 0,
      language: file.language || 'unknown'
    }));

    return {
      totalFiles: files instanceof Map ? files.size : fileEntries.length,
      files: fileList,
      warningsCount: (result.warnings || []).length,
      orchestrationMetadata: result.orchestrationMetadata ? {
        modelSelections: result.orchestrationMetadata.modelSelections,
        selectedModels: result.orchestrationMetadata.selectedModels
      } : null
    };
  }

  /**
   * 流式响应支持 - 将大结果集分批返回
   *
   * @param {Object} result - 响应结果
   * @param {Object} res - HTTP 响应对象
   * @param {number} batchSize - 每批大小
   * @returns {Promise<void>}
   */
  async _streamResponse(result, res, batchSize = 5) {
    const files = result.files || new Map();
    const fileEntries = Array.from(files.entries());
    const totalBatches = Math.ceil(fileEntries.length / batchSize);

    // 设置流式响应头
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked'
    });

    // 发送开始标记
    res.write(JSON.stringify({
      type: 'start',
      totalFiles: fileEntries.length,
      totalBatches,
      timestamp: new Date().toISOString()
    }) + '\n');

    // 分批发送文件
    for (let i = 0; i < totalBatches; i++) {
      const batchFiles = fileEntries.slice(i * batchSize, (i + 1) * batchSize);
      const batchData = {
        type: 'batch',
        batchNumber: i + 1,
        totalBatches,
        files: batchFiles.map(([filePath, file]) => ({
          path: filePath,
          content: file.content,
          language: file.language,
          sourceTaskId: file.sourceTaskId
        }))
      };

      res.write(JSON.stringify(batchData) + '\n');

      // 等待一小段时间再发送下一批
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 发送结束标记
    const endData = {
      type: 'end',
      summary: this._generateTruncatedSummary(result),
      warnings: result.warnings || [],
      timestamp: new Date().toISOString()
    };

    res.write(JSON.stringify(endData) + '\n');
    res.end();
  }

  /**
   * 停止服务器
   */
  async stop() {
    return new Promise(async (resolve) => {
      this._log('开始关闭服务器...');

      // 【新增】清理日志缓冲区
      if (this.logBuffer) {
        this.logBuffer = [];
        this._log('日志缓冲区已清理');
      }

      // 【新增】清理缓存管理器
      if (this.cacheManager) {
        try {
          if (typeof this.cacheManager.cleanup === 'function') {
            await this.cacheManager.cleanup();
          }
          this._log('缓存管理器已清理');
        } catch (error) {
          this._log(`清理缓存管理器时出错：${error.message}`, 'warn');
        }
      }

      // 【新增】清理流程监控器
      if (this.flowMonitor) {
        this.flowMonitor = null;
        this._log('流程监控器已清理');
      }

      // 【新增】清理进度跟踪器
      if (this.progressTracker) {
        this.progressTracker = null;
        this._log('进度跟踪器已清理');
      }

      // 【新增】清理模型选择器
      if (this.modelSelector) {
        if (typeof this.modelSelector.destroy === 'function') {
          await this.modelSelector.destroy();
        }
        this.modelSelector = null;
        this._log('模型选择器已清理');
      }

      // 【新增】清理执行器集成
      if (this.executorIntegration) {
        if (typeof this.executorIntegration.destroy === 'function') {
          await this.executorIntegration.destroy();
        }
        this.executorIntegration = null;
        this._log('执行器集成已清理');
      }

      // 清理 HTTP 服务器
      if (this.server) {
        this.server.close(() => {
          this._log('HTTP 服务器已关闭');

          // 清理会话存储资源（如果启用了会话支持）
          if (this.config.enableSessionSupport && this.sessionManager && this.sessionManager.store) {
            try {
              this.sessionManager.store.close();
              this._log('会话存储已关闭');
            } catch (error) {
              this._log(`关闭会话存储时出错：${error.message}`, 'warn');
            }
          }

          resolve();
        });
      } else {
        // 即使服务器未启动，也要清理会话存储
        if (this.config.enableSessionSupport && this.sessionManager && this.sessionManager.store) {
          try {
            this.sessionManager.store.close();
            this._log('会话存储已关闭');
          } catch (error) {
            this._log(`关闭会话存储时出错：${error.message}`, 'warn');
          }
        }
        resolve();
      }
    });
  }

  // 初始化会话管理组件
  _initSessionManagement() {
    try {
      // 动态导入会话管理模块
      SessionManager = require('../session/SessionManager');
      RequestClassifier = require('../session/RequestClassifier');
      IncrementalProcessor = require('../session/IncrementalProcessor');
      Corrector = require('../corrector/Corrector');
      SessionRequestRouter = require('../session/SessionRequestRouter');
      DependencyGraph = require('../session/DependencyGraph');

      // 创建相应的存储实例
      let storeInstance;
      switch (this.config.sessionStoreType) {
        case 'file':
          const FileStore = require('../session/stores/FileStore');
          storeInstance = new FileStore({
            ttl: this.config.sessionTtl,
            maxSessionSize: this.config.sessionMaxSize
          });
          break;
        case 'redis':
          const RedisStore = require('../session/stores/RedisStore');
          storeInstance = new RedisStore({
            ttl: this.config.sessionTtl,
            maxSessionSize: this.config.sessionMaxSize
          });
          break;
        case 'hybrid':
          const HybridStore = require('../session/stores/HybridStore');
          storeInstance = new HybridStore({
            ttl: this.config.sessionTtl,
            maxSessionSize: this.config.sessionMaxSize,
            storageStrategy: 'memory-first',
            syncMode: 'async',
            failoverEnabled: true,
            memoryOptions: {
              maxSessions: 100,
              ttl: 300000 // 5 分钟
            },
            fileOptions: {
              basePath: './sessions',
              ttl: this.config.sessionTtl
            },
            redisEnabled: false // 默认禁用 Redis，需要时可启用
          });
          break;
        case 'memory':
        default:
          const MemoryStore = require('../session/stores/MemoryStore');
          storeInstance = new MemoryStore({
            ttl: this.config.sessionTtl,
            maxSessionSize: this.config.sessionMaxSize
          });
          break;
      }

      // 初始化会话管理器
      this.sessionManager = new SessionManager(storeInstance);

      // 初始化其他会话组件
      this.requestClassifier = new RequestClassifier();
      this.corrector = new Corrector();
      this.sessionRequestRouter = new SessionRequestRouter(
        this.sessionManager,
        this.requestClassifier
      );
      this.incrementalProcessor = new IncrementalProcessor(this.sessionManager, this.corrector);
      this.incrementalProcessor.setOrchestratorServer(this);
      this.incrementalProcessor.setExecutor(this.executor); // 设置执行器引用
      this.dependencyGraph = new DependencyGraph();

      this._log(`会话管理已初始化，存储类型: ${this.config.sessionStoreType}`);
    } catch (error) {
      this._log(`初始化会话管理失败: ${error.message}`, 'warn');
      this._log('回退到无会话模式');
      this.config.enableSessionSupport = false;
    }
  }

  // 提取会话ID的方法
  _extractSessionId(req) {
    // 从请求头中提取 x-session-id
    if (req.headers['x-session-id']) {
      return req.headers['x-session-id'].trim();
    }

    // 从查询参数中提取 session_id
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionIdParam = url.searchParams.get('session_id');
    if (sessionIdParam) {
      return sessionIdParam.trim();
    }

    return null;
  }

  // 处理会话感知的编排请求
  async _handleSessionAwareOrchestration(requestData, sessionId) {
    try {
      // 获取或创建会话
      let session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        session = await this.sessionManager.createSession(
          requestData.originalTask || requestData.prompt || 'Untitled task',
          requestData.userId || null,
          requestData.projectId || null
        );
      }

      // 分类请求类型 - 如果有 action 字段，优先使用 action 确定类型
      let classification;
      if (requestData.action === 'fix' || requestData.action === 'fix_report_file') {
        // 显式的修复动作，使用 CODE_MODIFY 类型（现在支持带代码生成的修复）
        this._log(`检测到修复请求 action=${requestData.action}, 使用 CODE_MODIFY 类型`, 'debug');
        classification = {
          type: this.requestClassifier.REQUEST_TYPES.CODE_MODIFY,
          confidence: 1.0,
          reason: 'Explicit fix action in request'
        };
      } else if (requestData.action === 'add') {
        this._log(`检测到添加请求 action=${requestData.action}, 使用 FEATURE_ADD 类型`, 'debug');
        classification = {
          type: this.requestClassifier.REQUEST_TYPES.FEATURE_ADD,
          confidence: 1.0,
          reason: 'Explicit add action in request'
        };
      } else if (requestData.action === 'modify') {
        this._log(`检测到修改请求 action=${requestData.action}, 使用 CODE_MODIFY 类型`, 'debug');
        classification = {
          type: this.requestClassifier.REQUEST_TYPES.CODE_MODIFY,
          confidence: 1.0,
          reason: 'Explicit modify action in request'
        };
      } else {
        // 使用关键词分类
        const textToClassify = requestData.prompt || requestData.task || '';
        classification = this.requestClassifier.classifyRequest(textToClassify);
        this._log(`请求分类结果：${classification.type}, 置信度：${classification.confidence}`, 'debug');
      }

      // 【已禁用复杂度分析】直接进入完整编排流程
      this._log('跳过复杂度分析，直接使用完整编排流程', 'info');

      // 使用完整的编排流程
      const orchestrateResult = await this._orchestrate(requestData, session);

      // 格式化为工具调用格式
      const finalOutput = this._formatResponseForClaudeCode(orchestrateResult, requestData, 'tool_call');

      return {
        ...finalOutput,
        sessionId: session.sessionId,
        session_id: session.sessionId,
        requestType: classification?.type || 'NEW_TASK',
        confidence: classification?.confidence || 1.0
      };
    } catch (error) {
      console.error('Error in session-aware orchestration:', error);
      throw error;
    }
  }

  // 在会话上下文中执行编排
  async _orchestrateWithSession(requestData, session) {
    // 使用会话中的历史数据来优化处理过程
    const enhancedRequestData = {
      ...requestData,
      // 可以在这里添加基于会话历史的上下文信息
      sessionContext: {
        previousTasks: session.decompositionResult ? [session.decompositionResult] : [],
        // 处理 executionResults 可能是 Map 或普通对象的情况
        previousResults: session.executionResults instanceof Map
          ? Array.from(session.executionResults.values())
          : (session.executionResults ? Object.values(session.executionResults) : []),
        currentFileTree: session.fileTree instanceof Map
          ? Object.fromEntries(session.fileTree)
          : (session.fileTree || {})
      }
    };

    // 执行传统的编排逻辑
    return await this._orchestrate(enhancedRequestData);
  }

  // 执行增量处理
  async _processIncrementally(requestBody, session, incrementalResult) {
    this._log('执行增量处理');

    // 更新会话数据
    let updatedSession = { ...session };

    // 执行带有会话和增量结果的编排
    const result = await this._orchestrate(requestBody, updatedSession, incrementalResult);

    // 更新会话状态
    updatedSession.decompositionResult = result.decomposition;
    updatedSession.executionResults = new Map(Object.entries(result.execution_results?.results || {}));
    updatedSession.conflictReport = result.integration_result?.validationReport?.conflicts || null;

    // 保存更新的会话
    await this.sessionManager.updateSession(updatedSession.sessionId, updatedSession);

    return result;
  }

  // 获取会话统计信息
  async _getSessionStatistics() {
    if (this.sessionManager && typeof this.sessionManager.getStatistics === 'function') {
      try {
        return await this.sessionManager.getStatistics();
      } catch (error) {
        this._log(`获取会话统计信息失败: ${error.message}`, 'error');
        return { error: error.message };
      }
    }
    return { error: 'Session manager not initialized or getStatistics method not available' };
  }

  // 获取最近日志的方法
  _getRecentLogs(limit, filters) {
    // 简单的日志过滤实现
    let filteredLogs = [...this.logBuffer].reverse().slice(0, limit);

    if (filters.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filters.level);
    }

    if (filters.module) {
      filteredLogs = filteredLogs.filter(log => log.module === filters.module);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log =>
        (log.message && log.message.toLowerCase().includes(searchTerm)) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm))
      );
    }

    return filteredLogs;
  }

  /**
   * 处理会话相关的编排请求（SessionAwareOrchestratorServer 版本）
   * @private
   */
  async _handleSessionOrchestrate(requestBody, sessionId) {
    // 尝试加载现有会话
    let session = await this.sessionManager.getSession(sessionId);

    if (!session) {
      // 如果会话不存在，创建新会话
      const originalTask = requestBody.messages?.[requestBody.messages?.length - 1]?.content || 'Unknown task';
      session = await this.sessionManager.createSession(originalTask);
      this._log(`Created new session: ${session.sessionId}`);
    } else {
      this._log(`Loaded existing session: ${session.sessionId}`);
    }

    // 分类请求类型
    const classification = this.requestClassifier.classifyRequest(
      requestBody.messages?.[requestBody.messages?.length - 1]?.content || ''
    );

    this._log(`Request classified as: ${classification.type} (confidence: ${classification.confidence})`);

    // 如果是冲突修复请求或类似情况，执行增量处理
    if (classification.type === 'CONFLICT_FIX' || session.conflictReport) {
      this._log('Processing incrementally due to conflict or explicit incremental request');

      // 使用增量处理器
      const incrementalResult = await this.incrementalProcessor.processIncrementally(
        session.sessionId,
        requestBody.messages?.[requestBody.messages?.length - 1]?.content || '',
        classification.type
      );

      // 根据增量结果决定是否需要完全重新整合
      if (incrementalResult.requiresFullReintegration) {
        // 执行完整流程
        return await this._orchestrate(requestBody, session);
      } else {
        // 执行增量流程
        return await this._processIncrementally(requestBody, session, incrementalResult);
      }
    } else {
      // 执行完整编排流程
      const result = await this._orchestrate(requestBody, session);

      // 更新会话状态
      session.decompositionResult = result.decomposition;
      session.executionResults = new Map(Object.entries(result.execution_results?.results || {}));
      session.conflictReport = result.integration_result?.validationReport?.conflicts || null;

      await this.sessionManager.updateSession(session.sessionId, session);

      return result;
    }
  }

  /**
   * 估算文本中的 token 数量
   * @private
   */
  _estimateTokens(text) {
    if (!text) return 0;

    // 改进的 token 估算（实际实现可能更复杂，考虑使用专门的 tokenizer 库）
    // 英文：~4 个字符 = 1 个 token
    // 中文：~1.5-2 个字符 = 1 个 token
    let englishChars = 0;
    let chineseChars = 0;
    let otherChars = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 32) {
        englishChars++;
      } else if (code >= 0x4e00 && code <= 0x9fff) { // 中文字符范围
        chineseChars++;
      } else {
        otherChars++;
      }
    }

    // 估算 token 数量
    const englishTokens = Math.ceil(englishChars / 4);
    const chineseTokens = Math.ceil(chineseChars / 1.6);
    const otherTokens = Math.ceil(otherChars / 3);

    return englishTokens + chineseTokens + otherTokens;
  }

  /**
   * 优化文件内容以减少 token 使用
   * @private
   */
  _optimizeFileContent(content) {
    if (!content) return content;

    // 移除多余的注释（保留关键注释）
    const lines = content.split('\n');
    const optimizedLines = [];

    for (const line of lines) {
      // 保留重要注释（如版权、作者、TODO、FIXME 等）
      if (/^(\/\/|#)\s*(TODO|FIXME|HACK|NOTE|@author|@license|@copyright|Copyright)/i.test(line)) {
        optimizedLines.push(line);
      } else if (!/^(\s*\/\/|\s*#|\s*\/\*|\s*\*|\/\/\/)/.test(line)) {
        // 保留非注释行
        optimizedLines.push(line);
      } else {
        // 对于普通注释，可以选择性保留
        const commentText = line.replace(/^(\/\/|#|\s*\/\*|\s*\*|\/\/\/)/, '').trim();
        if (commentText.length > 20) {  // 保留较长的注释，可能是重要说明
          optimizedLines.push(line);
        }
      }
    }

    return optimizedLines.join('\n');
  }

  /**
   * 打印启动信息
   * @private
   */
  _printStartupInfo() {
    this._log(``);
    this._log(`🚀 SessionAwareOrchestratorServer 已启动`);
    this._log(``);
    this._log(`  服务器:`);
    this._log(`    地址：http://localhost:${this.config.port}`);
    this._log(`    状态：运行中`);
    this._log(``);
    this._log(`  组件:`);
    this._log(`    分解器：${this.decomposer ? '已初始化' : '未初始化'}`);
    this._log(`    模型选择器：${this.modelSelector ? '已初始化' : '未初始化'}`);
    this._log(`    执行器集成：${this.executorIntegration ? '已初始化' : '未初始化'}`);
    this._log(`    整合器：${this.integrator ? '已初始化' : '未初始化'}`);
    this._log(`    会话管理器：${this.sessionManager ? '已初始化' : '未初始化'}`);
    this._log(`    会话存储：${this.config.sessionStoreType}`);
    this._log(``);
    this._log(`  配置:`);
    this._log(`    自动编排：${this.config.autoOrchestrate}`);
    this._log(`    编排阈值：${this.config.orchestrationThreshold}`);
    this._log(`    Token 限制：${this.config.tokenLimit}`);
    this._log(`    调试模式：${this.config.debug}`);
    this._log(``);
    this._log(`  可用端点:`);
    this._log(`    GET  /health                           - 健康检查`);
    this._log(`    POST /orchestrate                      - 编排端点（主端点）`);
    this._log(`    POST /v1/orchestrate                   - 编排端点（兼容路径）`);
    this._log(`    POST /v1/orchestrate-tool-calls        - 编排端点（工具调用格式）`);
    this._log(`    POST /orchestrate-tool-calls           - 编排端点（工具调用格式，兼容路径）`);
    this._log(`    POST /v1/decompose                     - 直接分解测试`);
    this._log(`    POST /v1/select-model                  - 直接模型选择测试`);
    this._log(`    POST /v1/execute-subtasks              - 直接执行子任务`);
    this._log(`    GET  /v1/model-selector-status        - 模型选择器状态`);
    this._log(`    GET  /v1/executor-integration-status  - 执行器集成状态`);
    this._log(`    GET  /v1/integrator-status            - 整合器状态（新增）`);
    this._log(`    GET  /v1/session-status               - 会话管理器状态`);
    this._log(`    GET  /v1/sessions                     - 获取单个会话详情 (需 session_id)`);
    this._log(`    DELETE /v1/sessions                   - 删除会话 (需 session_id)`);
    this._log(`    GET  /v1/sessions/user                - 获取用户的所有会话`);
    this._log(`    GET  /v1/sessions/project             - 获取项目的所有会话`);
    this._log(`    GET  /v1/sessions/export              - 导出会话数据 (需 session_id)`);
    this._log(`    POST /v1/sessions/import              - 导入会话数据`);
    this._log(`    GET  /v1/model-health-status          - 模型健康状态`);
    this._log(`    GET  /v1/logs                          - 获取实时日志`);
    this._log(`    POST /v1/logs/clear                   - 清除日志缓冲区`);
    this._log(`    POST /v1/config                        - 运行时配置管理`);
    this._log(`    GET  /v1/progress/:taskId              - 获取特定任务进度`);
    this._log(`    GET  /v1/progress                      - 获取所有活跃任务进度`);
    this._log(`    GET  /v1/progress/events               - 获取进度事件`);
    this._log(`    GET  /api/metrics                      - 获取指标汇总`);
    this._log(`    GET  /api/metrics/sessions/:id       - 获取会话指标`);
    this._log(`    GET  /api/metrics/pricing            - 获取定价配置`);
    this._log(`    PUT  /api/metrics/pricing            - 更新定价配置`);
    this._log(`    GET  /api/metrics/history            - 获取历史指标`);
    this._log(`    POST /api/components/decomposer/test  - 分解器测试端点`);
    this._log(`    POST /api/components/selector/test     - 模型选择器测试端点`);
    this._log(`    POST /api/components/executor/test     - 并发执行器测试端点`);
    this._log(`    POST /api/components/integrator/test   - 整合器测试端点`);
    this._log(`    GET  /api/components/session/:id      - 获取会话详情 (需 session_id)`);
    this._log(`    POST /api/components/session/test     - 创建测试会话`);
    this._log(`    PUT  /api/components/session/:id      - 更新会话数据 (需 session_id)`);
    this._log(`    DELETE /api/components/session/:id    - 删除会话 (需 session_id)`);
    this._log(``);
    this._log(`✨ 服务器已准备就绪！`);
    this._log(``);
  }

  /**
   * 初始化组件（SessionAwareOrchestratorServer 版本）
   * @private
   */
  _initializeComponents() {
    // 初始化会话管理组件
    this._initSessionManagement();

    // 初始化原有组件
    this.decomposer = new ElasticDecomposer(this.config.decomposer || {});
    this.hybridTaskConverter = new HybridTaskConverter();
    this.modelSelector = new ModelSelector({
      debug: this.config.debug,
      models: this.config.Providers || [],
      selector: this.config.selector || {},
      model_task_matrix: this.config.model_task_matrix || {}
    });
    this.taskComplexityAnalyzer = new TaskComplexityAnalyzer();

    // 初始化指标收集器
    this.metricsCollector = new MetricsCollector();

    // 初始化执行器集成 - 传递 metricsCollector
    this.executorIntegration = new OrchestratorExecutorIntegration({
      modelSelector: this.modelSelector,
      metricsCollector: this.metricsCollector,

      // 从统一配置读取执行器配置
      executor: this.config.executor || {},
      extensions: this.config.extensions || {},
      streaming: this.config.streaming || {}
    });

    // 初始化指标API
    this.metricsAPI = new MetricsAPI(this.metricsCollector, this.configService);

    // 初始化整合器
    this.integratorConfig = {
      autoMerge: true,
      conflictResolutionStrategy: 'prefer-user-changes',
      backupOnConflict: true,
      entryPoint: {
        enabled: this.config.integrator?.entryPoint?.enabled ?? true
      }
    };
    this.integrator = new Integrator(this.integratorConfig);

    // 初始化健康检查器
    this.modelHealthChecker = new ModelHealthChecker({
      modelSelector: this.modelSelector
    });
  }

  // 分解器测试端点处理方法
  async _handleDecomposerTest(req, res) {
    try {
      const requestBody = await this._parseBody(req);

      // 验证请求参数
      if (!requestBody.task) {
        return this._sendJSON(res, 400, {
          success: false,
          error: 'Missing task in request body'
        });
      }

      // 构建分解器配置，优先使用API请求中的配置，然后使用服务器配置，最后使用默认值
      const config = {
        // 基础配置
        debug: this.config.debug,
        logLevel: this.config.debug ? 'debug' : 'info',

        // 使用统一配置中的 decompressor 配置
        ...(this.config.decomposer || {}),

        // API提供的配置优先级最高
        ...(requestBody.config || {})
      };

      // 确保分解器已初始化
      if (!this.decomposer) {
        const ConfigManager = require('../decomposer/config/ConfigManager');
        const configManager = new ConfigManager(config);
        const finalConfig = configManager.loadConfig();

        const ElasticDecomposer = require('../decomposer');
        this.decomposer = new ElasticDecomposer(finalConfig);
      } else {
        // 如果分解器已存在，更新其配置
        const ConfigManager = require('../decomposer/config/ConfigManager');
        const configManager = new ConfigManager(config);
        const finalConfig = configManager.loadConfig();

        // 更新分解器配置
        this.decomposer.config = finalConfig;
        this.decomposer.configManager = configManager;
      }

      this._log(`测试分解器，任务内容：${requestBody.task.title || 'Untitled'}`);

      // 使用提供的选项或默认值
      const options = requestBody.options || {};
      const debug = options.debug || false;
      const logLevel = options.logLevel || 'info';

      // 根据选项调整分解器配置
      if (debug || logLevel === 'debug') {
        this.decomposer.config.debug = true;
        this.decomposer.config.logLevel = 'debug';
      }

      // 调用分解器
      const result = await this.decomposer.decompose(requestBody.task);

      // 返回标准化响应
      return this._sendJSON(res, 200, {
        success: true,
        data: result
      });
    } catch (error) {
      this._log(`分解器测试失败: ${error.message}`, 'error');
      return this._sendJSON(res, 500, {
        success: false,
        error: '分解器测试失败',
        message: error.message
      });
    }
  }

  // 模型选择器测试端点处理方法
  async _handleSelectorTest(req, res) {
    try {
      const requestBody = await this._parseBody(req);

      // 验证请求参数
      if (!requestBody.subtask) {
        return this._sendJSON(res, 400, {
          success: false,
          error: 'Missing subtask in request body'
        });
      }

      // 构建模型选择器配置，优先使用API请求中的配置，然后使用服务器配置
      const config = {
        debug: this.config.debug,
        models: this.config.Providers || [],
        selector: this.config.selector || {},

        // API提供的配置优先级最高
        ...(requestBody.config || {})
      };

      // 确保模型选择器已初始化
      if (!this.modelSelector) {
        const ModelSelector = require('../selector/ModelSelector');
        this.modelSelector = new ModelSelector(config);
      } else {
        // 如果模型选择器已存在，我们可以根据需要更新配置
        // 但由于ModelSelector构造后配置是固定的，我们创建一个新的实例
        // 或者我们可以调用选择器的配置更新方法，如果有的话
        const ModelSelector = require('../selector/ModelSelector');
        this.modelSelector = new ModelSelector(config);
      }

      this._log(`测试模型选择器，子任务：${requestBody.subtask.title || requestBody.subtask.description || 'Untitled'}`);

      // 准备约束条件
      const constraints = requestBody.constraints || {};

      // 获取选项
      const options = requestBody.options || {};
      const includeAlternatives = options.include_alternatives || false;
      const forceRefresh = options.force_refresh || false;

      // 调用模型选择器
      const result = this.modelSelector.select(requestBody.subtask, constraints);

      // 如果需要包含替代方案但未返回，则手动获取
      if (includeAlternatives && (!result.alternatives || result.alternatives.length === 0)) {
        // 模型选择器内部应该已经包含了备选方案
      }

      // 返回标准化响应
      return this._sendJSON(res, 200, {
        success: true,
        data: result
      });
    } catch (error) {
      this._log(`模型选择器测试失败: ${error.message}`, 'error');
      return this._sendJSON(res, 500, {
        success: false,
        error: '模型选择器测试失败',
        message: error.message
      });
    }
  }

  // 并发执行器测试端点处理方法
  async _handleExecutorTest(req, res) {
    try {
      const requestBody = await this._parseBody(req);

      // 验证请求参数
      if (!requestBody.requests || !Array.isArray(requestBody.requests)) {
        return this._sendJSON(res, 400, {
          success: false,
          error: 'Missing requests array in request body'
        });
      }

      // 确保模型注册表已初始化
      if (!this.modelRegistry) {
        const ModelRegistry = require('../selector/registry/ModelRegistry');
        this.modelRegistry = new ModelRegistry();
      }
      // 构建执行器配置，优先使用 API 请求中的配置，然后使用服务器配置
      const config = {
        debug: this.config.debug,
        modelSelector: this.modelSelector,
        modelRegistry: this.modelRegistry,

        // API提供的配置优先级最高
        ...(requestBody.config || {})
      };

      // 确保执行器集成已初始化
      if (!this.executorIntegration) {
        const OrchestratorExecutorIntegration = require('./OrchestratorExecutorIntegration');
        this.executorIntegration = new OrchestratorExecutorIntegration({
          ...config,
          metricsCollector: this.metricsCollector,
          streaming: this.config.streaming || {}
        });
      } else {
        // 如果执行器集成已存在，我们可以根据需要更新配置
        // 但由于OrchestratorExecutorIntegration构造后配置是固定的，我们创建一个新的实例
        const OrchestratorExecutorIntegration = require('./OrchestratorExecutorIntegration');
        this.executorIntegration = new OrchestratorExecutorIntegration({
          ...config,
          metricsCollector: this.metricsCollector,
          streaming: this.config.streaming || {}
        });
      }

      this._log(`测试并发执行器，请求数量：${requestBody.requests.length}`);

      // 准备执行选项
      const executionOptions = requestBody.execution_options || {};
      const concurrency = executionOptions.concurrency || 1;
      const timeout = executionOptions.timeout || 30000;
      const retryCount = executionOptions.retry_count || 3;

      // 获取选项
      const options = requestBody.options || {};
      const collectMetrics = options.collect_metrics !== false; // 默认为true
      const simulateFailure = options.simulate_failure || false;

      // 构建执行任务
      const executionTasks = requestBody.requests.map((request, index) => ({
        id: `exec-${Date.now()}-${index}`,
        selected_model: request.model,  // 使用 selected_model 字段
        description: request.messages?.[0]?.content || '执行任务',  // 提取用户消息作为描述
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 8192
      }));

      // 执行任务
      const result = await this.executorIntegration.executeSubtasks(executionTasks);

      // 返回标准化响应 - 使用 executeSubtasks 返回的正确字段名
      return this._sendJSON(res, 200, {
        success: true,
        data: {
          results: result.execution_results || [],
          summary: result.execution_summary || {},
          metrics: {
            total_executed: result.total_executed || 0,
            successful_executions: result.successful_executions || 0,
            failed_executions: result.failed_executions || 0
          }
        }
      });
    } catch (error) {
      this._log(`并发执行器测试失败: ${error.message}`, 'error');
      return this._sendJSON(res, 500, {
        success: false,
        error: '并发执行器测试失败',
        message: error.message
      });
    }
  }

  // 整合器测试端点处理方法
  async _handleIntegratorTest(req, res) {
    try {
      const requestBody = await this._parseBody(req);

      // 验证请求参数
      if (!requestBody.results || !Array.isArray(requestBody.results)) {
        return this._sendJSON(res, 400, {
          success: false,
          error: 'Missing results array in request body'
        });
      }

      // 构建整合器配置，优先使用API请求中的配置
      const config = {
        // 默认配置
        autoMerge: true,
        conflictResolutionStrategy: 'prefer-user-changes',
        backupOnConflict: true,
        entryPoint: {
          enabled: requestBody.config?.entryPoint?.enabled ?? true
        },

        // API提供的配置优先级最高
        ...(requestBody.config || {})
      };

      // 确保整合器已初始化
      if (!this.integrator) {
        const { Integrator } = require('../integrator/integrator');
        this.integrator = new Integrator(config);
      } else {
        // 如果整合器已存在，创建新的实例以使用新配置
        const { Integrator } = require('../integrator/integrator');
        this.integrator = new Integrator(config);
      }

      this._log(`测试整合器，结果数量：${requestBody.results.length}`);

      // 准备整合选项
      const integrationOptions = requestBody.integration_options || {};
      const fileStructure = integrationOptions.file_structure || 'auto';
      const conflictResolution = integrationOptions.conflict_resolution || 'auto';
      const validateDependencies = integrationOptions.validate_dependencies !== false; // 默认为true

      const subtasks = requestBody.subtasks || [];

      // 获取选项
      const options = requestBody.options || {};
      const generateEntryPoint = options.generate_entry_point !== false; // 默认为true
      const formatCode = options.format_code !== false; // 默认为true

      // 调用整合器
      const result = await this.integrator.integrate(requestBody.results, subtasks);

      // 返回标准化响应
      return this._sendJSON(res, 200, {
        success: true,
        data: {
          integrated_content: {
            files: Object.fromEntries(result.files || new Map()),
            entry_points: result.entryPoints || [],
            dependencies: result.dependencies || {}
          },
          conflicts: result.validationReport?.conflicts || {
            detected: false,
            resolved: false,
            details: []
          },
          validation_results: result.validationReport || {
            completeness_score: 0,
            missing_dependencies: [],
            valid: true
          },
          integration_metadata: result.metadata || {
            processed_files: 0,
            generated_files: 0,
            conflicts_resolved: 0
          }
        }
      });
    } catch (error) {
      this._log(`整合器测试失败: ${error.message}`, 'error');
      return this._sendJSON(res, 500, {
        success: false,
        error: '整合器测试失败',
        message: error.message
      });
    }
  }

  // 会话存储器测试端点处理方法
  async _handleSessionTest(req, res, pathname) {
    // 提取会话ID（如果存在）
    const sessionIdMatch = pathname.match(/\/api\/components\/session\/([^\/]+)$/);
    const sessionIdFromPath = sessionIdMatch ? sessionIdMatch[1] : null;

    // 从请求中提取会话ID
    const sessionIdFromHeader = this._extractSessionId(req);
    const url = new URL(req.url, `http://localhost:${this.config.port || 3458}`);
    const sessionIdFromQuery = url.searchParams.get('session_id');
    const sessionId = sessionIdFromPath || sessionIdFromHeader || sessionIdFromQuery;

    try {
      if (req.method === 'GET' && sessionId) {
        // 获取会话详情
        if (!this.sessionManager) {
          // 初始化会话管理器（如果尚未初始化）
          this._initSessionManagement();
        }

        if (!this.sessionManager) {
          return this._sendJSON(res, 500, {
            success: false,
            error: 'Session manager not available'
          });
        }

        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
          return this._sendJSON(res, 404, {
            success: false,
            error: 'Session not found'
          });
        }

        return this._sendJSON(res, 200, {
          success: true,
          data: {
            sessionId: session.sessionId,
            originalTask: session.originalTask,
            userId: session.userId,
            projectId: session.projectId,
            state: session.state,
            progress: session.progress,
            results: session.results,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            metadata: session.metadata
          }
        });
      } else if (req.method === 'POST' && pathname === '/api/components/session/test') {
        // 创建测试会话
        const requestBody = await this._parseBody(req);

        // 根据API提供的配置来初始化会话管理器
        if (!this.sessionManager) {
          // 如果API提供了配置，使用这些配置来初始化会话管理器
          if (requestBody.config) {
            // 动态导入会话管理模块
            const SessionManager = require('../session/SessionManager');

            // 确定要使用的存储类型
            let storeInstance;
            const storeConfig = requestBody.config.store || {};

            switch (storeConfig.type || 'memory') {
              case 'file':
                const FileStore = require('../session/stores/FileStore');
                storeInstance = new FileStore(storeConfig.options || {});
                break;
              case 'redis':
                const RedisStore = require('../session/stores/RedisStore');
                storeInstance = new RedisStore(storeConfig.options || {});
                break;
              case 'database':
                try {
                  const DatabaseStore = require('../session/stores/DatabaseStore');
                  storeInstance = new DatabaseStore(storeConfig.options || {});
                } catch (e) {
                  // DatabaseStore may not exist, fall back to memory store
                  const MemoryStore = require('../session/stores/MemoryStore');
                  storeInstance = new MemoryStore(storeConfig.options || {});
                }
                break;
              case 'memory':
              default:
                const MemoryStore = require('../session/stores/MemoryStore');
                storeInstance = new MemoryStore(storeConfig.options || {});
                break;
            }

            // 初始化会话管理器
            this.sessionManager = new SessionManager(storeInstance, requestBody.config.migration || {});
          } else {
            // 使用服务器默认配置
            this._initSessionManagement();
          }
        }

        if (!this.sessionManager) {
          return this._sendJSON(res, 500, {
            success: false,
            error: 'Session manager not available'
          });
        }

        // 创建新会话
        const session = await this.sessionManager.createSession(
          requestBody.originalTask || 'Test session',
          requestBody.userId,
          requestBody.projectId
        );

        // 如果提供了初始状态，更新会话
        if (requestBody.initialState) {
          await this.sessionManager.updateSession(session.sessionId, {
            state: requestBody.initialState
          });
        }

        return this._sendJSON(res, 200, {
          success: true,
          data: {
            sessionId: session.sessionId,
            originalTask: session.originalTask,
            userId: session.userId,
            projectId: session.projectId,
            state: session.state,
            progress: session.progress,
            results: session.results,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            metadata: session.metadata
          }
        });
      } else if (req.method === 'PUT' && sessionId) {
        // 更新会话数据
        const requestBody = await this._parseBody(req);

        if (!this.sessionManager) {
          // 初始化会话管理器（如果尚未初始化）
          this._initSessionManagement();
        }

        if (!this.sessionManager) {
          return this._sendJSON(res, 500, {
            success: false,
            error: 'Session manager not available'
          });
        }

        const session = await this.sessionManager.updateSession(sessionId, requestBody.data || {});

        return this._sendJSON(res, 200, {
          success: true,
          data: {
            sessionId: session.sessionId,
            originalTask: session.originalTask,
            userId: session.userId,
            projectId: session.projectId,
            state: session.state,
            progress: session.progress,
            results: session.results,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            metadata: session.metadata
          }
        });
      } else if (req.method === 'DELETE' && sessionId) {
        // 删除会话
        if (!this.sessionManager) {
          // 初始化会话管理器（如果尚未初始化）
          this._initSessionManagement();
        }

        if (!this.sessionManager) {
          return this._sendJSON(res, 500, {
            success: false,
            error: 'Session manager not available'
          });
        }

        const deleted = await this.sessionManager.deleteSession(sessionId);

        return this._sendJSON(res, 200, {
          success: deleted,
          data: {
            sessionId: sessionId,
            deleted: deleted
          }
        });
      }

      return this._sendJSON(res, 400, {
        success: false,
        error: 'Invalid method or endpoint. Supported: GET /session/:id, POST /session/test, PUT /session/:id, DELETE /session/:id'
      });
    } catch (error) {
      this._log(`会话存储器测试失败: ${error.message}`, 'error');
      return this._sendJSON(res, 500, {
        success: false,
        error: '会话存储器测试失败',
        message: error.message
      });
    }
  }

  /**
   * 从实现计划中提取约束信息
   */
  _extractConstraintsFromPlan(implementationPlan) {
    if (!implementationPlan) return [];

    const constraints = [];

    // 提取技术栈相关信息
    if (implementationPlan.tech_stack) {
      constraints.push(`Tech Stack: ${implementationPlan.tech_stack.join(', ')}`);
    }

    // 提取架构模式
    if (implementationPlan.architecture_patterns) {
      constraints.push(`Architecture Patterns: ${implementationPlan.architecture_patterns.join(', ')}`);
    }

    // 提取编码标准
    if (implementationPlan.code_standards) {
      constraints.push(`Code Standards: ${implementationPlan.code_standards.join(', ')}`);
    }

    // 提取路径约定 - 支持数组和对象两种格式
    if (implementationPlan.path_conventions) {
      let pathStr = '';
      if (Array.isArray(implementationPlan.path_conventions)) {
        pathStr = implementationPlan.path_conventions.join(', ');
      } else if (typeof implementationPlan.path_conventions === 'object') {
        pathStr = Object.entries(implementationPlan.path_conventions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
      }
      if (pathStr) {
        constraints.push(`Path Conventions: ${pathStr}`);
      }
    }

    // 提取依赖管理
    if (implementationPlan.dependency_management) {
      constraints.push(`Dependencies: ${implementationPlan.dependency_management.join(', ')}`);
    }

    // 提取 API 约定
    if (implementationPlan.api_conventions) {
      if (implementationPlan.api_conventions.prefix) {
        constraints.push(`API Prefix: ${implementationPlan.api_conventions.prefix}`);
      }
      if (implementationPlan.api_conventions.endpoints) {
        const endpointNames = Object.keys(implementationPlan.api_conventions.endpoints);
        constraints.push(`API Endpoints: ${endpointNames.join(', ')}`);
      }
    }

    // 提取共享模块
    if (implementationPlan.shared_modules) {
      constraints.push(`Shared Modules: ${implementationPlan.shared_modules.join(', ')}`);
    }

    // 提取全局上下文约束
    if (implementationPlan.shared_context) {
      const sc = implementationPlan.shared_context;
      if (sc.type_source) {
        constraints.push(`Type Source: ${sc.type_source}`);
      }
      if (sc.api_config) {
        if (sc.api_config.baseURL) {
          constraints.push(`API BaseURL: ${sc.api_config.baseURL}`);
        }
        if (sc.api_config.port) {
          constraints.push(`API Port: ${sc.api_config.port}`);
        }
      }
      if (sc.file_naming) {
        if (sc.file_naming.forbidden_files && sc.file_naming.forbidden_files.length > 0) {
          constraints.push(`Forbidden Files: ${sc.file_naming.forbidden_files.join(', ')}`);
        }
      }
    }

    return constraints;
  }

  /**
   * 从实现计划中提取指导原则
   */
  _extractGuidelinesFromPlan(implementationPlan) {
    if (!implementationPlan) return [];

    const guidelines = [];

    // 提取最佳实践
    if (implementationPlan.best_practices) {
      guidelines.push(...implementationPlan.best_practices);
    }

    // 提取注意事项
    if (implementationPlan.considerations) {
      guidelines.push(...implementationPlan.considerations);
    }

    // 提取设计原则
    if (implementationPlan.design_principles) {
      guidelines.push(...implementationPlan.design_principles);
    }

    return guidelines;
  }

  /**
   * 将实现计划信息格式化为Prompt可用的格式
   */
  _formatPlanForPrompt(implementationPlan) {
    if (!implementationPlan) return '';

    const parts = [];

    parts.push('## IMPLEMENTATION PLAN');
    parts.push('');

    if (implementationPlan.tech_stack) {
      parts.push(`### Tech Stack: ${implementationPlan.tech_stack.join(', ')}`);
      parts.push('');
    }

    if (implementationPlan.architecture_patterns) {
      parts.push(`### Architecture Patterns: ${implementationPlan.architecture_patterns.join(', ')}`);
      parts.push('');
    }

    if (implementationPlan.code_standards) {
      parts.push(`### Code Standards: ${implementationPlan.code_standards.join(', ')}`);
      parts.push('');
    }

    if (implementationPlan.path_conventions) {
      parts.push(`### Path Conventions: ${implementationPlan.path_conventions.join(', ')}`);
      parts.push('');
    }

    if (implementationPlan.dependencies) {
      parts.push(`### Dependencies: ${implementationPlan.dependencies.join(', ')}`);
      parts.push('');
    }

    if (implementationPlan.best_practices) {
      parts.push('### Best Practices:');
      implementationPlan.best_practices.forEach(practice => {
        parts.push(`- ${practice}`);
      });
      parts.push('');
    }

    if (implementationPlan.considerations) {
      parts.push('### Considerations:');
      implementationPlan.considerations.forEach(consideration => {
        parts.push(`- ${consideration}`);
      });
      parts.push('');
    }

    // API 约定
    if (implementationPlan.api_conventions) {
      if (implementationPlan.api_conventions.prefix) {
        parts.push(`### API Prefix: \`${implementationPlan.api_conventions.prefix}\``);
        parts.push('');
      }
      if (implementationPlan.api_conventions.endpoints) {
        parts.push('### API Endpoints:');
        for (const [name, path] of Object.entries(implementationPlan.api_conventions.endpoints)) {
          parts.push(`- ${name}: \`${path}\``);
        }
        parts.push('');
      }
    }

    // 共享模块
    if (implementationPlan.shared_modules && Array.isArray(implementationPlan.shared_modules)) {
      parts.push('### Shared Modules:');
      implementationPlan.shared_modules.forEach(module => {
        parts.push(`- \`${module}\``);
      });
      parts.push('');
    }

    // 全局上下文约束 (shared_context)
    if (implementationPlan.shared_context) {
      const sc = implementationPlan.shared_context;
      parts.push('### Shared Context (Global Constraints):');
      parts.push('');

      if (sc.description) {
        parts.push(`**Description**: ${sc.description}`);
        parts.push('');
      }

      // 类型定义
      if (sc.types) {
        parts.push('**Type Definitions** (MUST use these exact types, do NOT define custom versions):');
        for (const [typeName, typeDef] of Object.entries(sc.types)) {
          parts.push(`- \`${typeName}\`: ${JSON.stringify(typeDef, null, 0).replace(/[{}"]/g, '')}`);
        }
        parts.push('');
      }

      // API 配置
      if (sc.api_config) {
        parts.push('**API Configuration**:');
        if (sc.api_config.baseURL) {
          parts.push(`- Base URL: \`${sc.api_config.baseURL}\``);
        }
        if (sc.api_config.port) {
          parts.push(`- Port: \`${sc.api_config.port}\``);
        }
        parts.push('');
      }

      // 文件命名约束
      if (sc.file_naming) {
        parts.push('**File Naming Constraints**:');
        for (const [category, pattern] of Object.entries(sc.file_naming)) {
          if (category === 'forbidden_files' && Array.isArray(pattern)) {
            parts.push(`- **FORBIDDEN files** (do NOT create these):`);
            pattern.forEach(f => parts.push(`  - \`${f}\``));
          } else {
            parts.push(`- ${category}: ${pattern}`);
          }
        }
        parts.push('');
      }

      // 类型来源
      if (sc.type_source) {
        parts.push(`**Type Source**: All types MUST be imported from \`${sc.type_source}\``);
        parts.push('');
      }

      // 类型扩展规则
      if (sc.type_extension_rule) {
        parts.push(`**Type Extension Rule**: ${sc.type_extension_rule}`);
        parts.push('');
      }

      parts.push('');
    }

    if (parts.length <= 2) { // Only has header and empty line
      return '';
    }

    return parts.join('\n');
  }

  /**
   * 将实现计划注入到子任务Prompt中
   */
  _injectImplementationPlanIntoPrompt(originalPrompt, implementationPlan) {
    if (!implementationPlan) return originalPrompt;

    const planSummary = this._formatPlanForPrompt(implementationPlan);
    if (!planSummary.trim()) return originalPrompt;

    return `${planSummary}\n\nORIGINAL TASK INSTRUCTIONS:\n${originalPrompt}`;
  }
}

// 命令行运行
if (require.main === module) {
  const server = new OrchestratorServer({
    port: process.env.ORCHESTRATOR_PORT || 3458,
    ccrRouterUrl: process.env.CCR_ROUTER_URL || 'http://127.0.0.1:3456',
    debug: process.env.DEBUG === 'true',
    autoOrchestrate: process.env.AUTO_ORCHESTRATE !== 'false'
  });

  server.start().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\n[Orchestrator] 正在关闭服务器...');
    await server.stop();
    process.exit(0);
  });
}

module.exports = OrchestratorServer;
