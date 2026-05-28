/**
 * SelectionConfigManager - 选择配置管理器
 *
 * 功能块 B：配置与策略层
 * 负责管理模型选择策略、预算配置和约束条件
 */

const fs = require('fs');
const path = require('path');

class SelectionConfigManager {
  constructor(config = {}) {
    this.selectionRules = [];
    this.constraints = {};
    this.fallbackStrategies = {};
    this.monitoringConfig = {};
    this.strategyConfig = {};
    this.loadConfig(config);
  }

  /**
   * 加载配置
   */
  loadConfig(userConfig) {
    // 1. 加载默认配置
    this.loadDefaultConfig();

    // 2. 从 YAML 配置文件加载
    this.loadConfigFromFile();

    // 3. 合并用户配置
    this.mergeUserConfig(userConfig);

    // 4. 特别处理来自外部配置（如ModelSelector直接传递的配置）的策略配置
    if (userConfig && userConfig.strategy) {
      // 如果userConfig中有strategy字段（来自ModelSelector的配置格式），则合并
      if (userConfig.strategy.learning_integration) {
        this.strategyConfig.learning_integration = {
          ...this.strategyConfig.learning_integration,
          ...userConfig.strategy.learning_integration
        };
      }
      // 合并其他strategy字段
      if (userConfig.strategy.enable_learning !== undefined) {
        this.strategyConfig.enableLearning = userConfig.strategy.enable_learning;
      }
      if (userConfig.strategy.learning_window !== undefined) {
        this.strategyConfig.learningWindow = userConfig.strategy.learning_window;
      }
      if (userConfig.strategy.qualityWeight !== undefined) {
        this.strategyConfig.qualityWeight = userConfig.strategy.qualityWeight;
      }
      if (userConfig.strategy.costWeight !== undefined) {
        this.strategyConfig.costWeight = userConfig.strategy.costWeight;
      }
      if (userConfig.strategy.speedWeight !== undefined) {
        this.strategyConfig.speedWeight = userConfig.strategy.speedWeight;
      }
    }
  }

  /**
   * 从统一配置加载规则和模型
   */
  loadFromUnifiedConfig(unifiedConfig) {
    if (unifiedConfig?.selector?.selectionRules) {
      // 用用户规则替换同名默认规则
      for (const userRule of unifiedConfig.selector.selectionRules) {
        // 查找相同任务类型的现有规则
        const existingIndex = this.selectionRules.findIndex(
          rule => rule.taskTypes.some(taskType => userRule.taskTypes.includes(taskType))
        );

        if (existingIndex >= 0) {
          // 替换现有规则
          this.selectionRules[existingIndex] = { ...this.selectionRules[existingIndex], ...userRule };
        } else {
          // 添加新规则
          this.selectionRules.push(userRule);
        }
      }
    }

    if (unifiedConfig?.defaultModels) {
      // 通知 ModelRegistry 加载默认模型（这里只是预留接口，实际调用应在外部）
      console.log(`[SelectionConfigManager] 从统一配置加载了 ${unifiedConfig.defaultModels.length} 个默认模型配置`);
    }
  }

  /**
   * 获取所有选择规则
   */
  getAllRules() {
    return [...this.selectionRules];
  }

  /**
   * 添加选择规则
   */
  addRule(rule) {
    // 验证规则
    if (!rule.taskTypes || !Array.isArray(rule.taskTypes)) {
      throw new Error('规则必须包含 taskTypes 数组');
    }
    if (!rule.preferredModels || !Array.isArray(rule.preferredModels)) {
      throw new Error('规则必须包含 preferredModels 数组');
    }

    // 检查是否存在相同任务类型的规则
    const existingIndex = this.selectionRules.findIndex(
      r => r.taskTypes.some(taskType => rule.taskTypes.includes(taskType))
    );

    if (existingIndex >= 0) {
      // 替换现有规则
      this.selectionRules[existingIndex] = { ...this.selectionRules[existingIndex], ...rule };
    } else {
      // 添加新规则
      this.selectionRules.push(rule);
    }
  }

  /**
   * 更新选择规则
   */
  updateRule(taskType, rule) {
    const index = this.selectionRules.findIndex(
      r => r.taskTypes.includes(taskType)
    );

    if (index >= 0) {
      this.selectionRules[index] = { ...this.selectionRules[index], ...rule };
      return true;
    }
    return false;
  }

  /**
   * 移除选择规则
   */
  removeRule(taskType) {
    const index = this.selectionRules.findIndex(
      rule => rule.taskTypes.includes(taskType)
    );
    if (index >= 0) {
      this.selectionRules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 加载默认配置
   */
  loadDefaultConfig() {
    // 默认选择规则（适配 config.json 中的实际模型）
    this.selectionRules = [
      // Agent 智能体任务 - 使用 MiniMax M2.7 (Agentic Model)
      {
        taskTypes: ['agent', 'tool-use'],
        preferredModels: ['MiniMax-M2.7-highspeed', 'MiniMax-M2.7'],
        fallbackModels: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.5'],
        reason: 'MiniMax M2.7 是 Agentic Model，优秀的工具使用能力',
        weight: 1.0
      },
      // 复杂任务 - 使用高性能模型
      {
        taskTypes: ['complex-tasks', 'reasoning', 'logic'],
        preferredModels: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'qwen3-max-2026-01-23'],
        fallbackModels: ['deepseek-reasoner', 'MiniMax-M2.5'],
        reason: '复杂任务和推理需要高质量模型',
        weight: 1.0
      },
      // 代码生成任务 - MiniMax M2.1/M2 有强大编程能力
      {
        taskTypes: ['code', 'coding', 'programming'],
        preferredModels: ['MiniMax-M2.1-highspeed', 'MiniMax-M2.1', 'qwen3-coder-plus'],
        fallbackModels: ['MiniMax-M2.5-highspeed', 'deepseek-chat'],
        reason: 'MiniMax M2.1 有强大多语言编程能力',
        weight: 1.0
      },
      // API 调用任务 - 使用性价比高的模型
      {
        taskTypes: ['api'],
        preferredModels: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.5', 'deepseek-chat'],
        fallbackModels: ['qwen3-coder-plus', 'glm-4.7'],
        reason: 'API 任务相对标准化，使用性价比高的 MiniMax M2.5',
        weight: 1.0
      },
      // 测试代码 - 使用性价比高且能力足够的模型
      {
        taskTypes: ['test'],
        preferredModels: ['MiniMax-M2.5-highspeed', 'deepseek-chat', 'glm-4.7'],
        fallbackModels: ['MiniMax-M2.1-highspeed', 'MiniMax-M2'],
        reason: '测试代码模式固定，使用 MiniMax 高性价比模型',
        weight: 1.0
      },
      // UI/样式任务 - 使用平衡型模型
      {
        taskTypes: ['ui', 'style'],
        preferredModels: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7-highspeed'],
        fallbackModels: ['MiniMax-M2.5', 'MiniMax-M2.7'],
        reason: 'UI/样式任务使用高速平衡型模型',
        weight: 1.0
      },
      // 数据模型 - 使用理解复杂结构能力强的模型
      {
        taskTypes: ['model'],
        preferredModels: ['MiniMax-M2.7', 'qwen3-coder-plus', 'qwen3-coder-next'],
        fallbackModels: ['deepseek-chat', 'MiniMax-M2.5'],
        reason: '数据模型需要理解复杂的数据结构和关系',
        weight: 1.0
      },
      // 配置文件 - 使用经济型模型
      {
        taskTypes: ['config'],
        preferredModels: ['MiniMax-M2', 'MiniMax-M2.1', 'glm-4.7'],
        fallbackModels: ['MiniMax-M2.1-highspeed'],
        reason: '配置文件模式化，使用 MiniMax M2 入门级成本模型',
        weight: 0.8
      },
      // 角色扮演/对话任务 - 使用 M2-her
      {
        taskTypes: ['roleplay', 'chat', 'dialogue', 'multi-turn'],
        preferredModels: ['M2-her'],
        fallbackModels: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7-highspeed'],
        reason: 'M2-her 专为多角色沉浸扮演和长轮次复杂场景设计',
        weight: 1.0
      },
      // 通用任务 - 使用平衡型高速模型
      {
        taskTypes: ['general'],
        preferredModels: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7-highspeed'],
        fallbackModels: ['MiniMax-M2.5', 'deepseek-chat'],
        reason: '通用任务使用 MiniMax 平衡型高速模型',
        weight: 0.8
      },
      // 高速任务
      {
        taskTypes: ['highspeed'],
        preferredModels: ['MiniMax-M2.7-highspeed', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1-highspeed'],
        fallbackModels: ['MiniMax-M2.7', 'glm-4.7'],
        reason: '高速任务需要响应快的 MiniMax highspeed 模型',
        weight: 1.0
      },
      // 长上下文任务
      {
        taskTypes: ['long-context', 'max-context'],
        preferredModels: ['qwen3.5-plus', 'kimi-k2.5', 'MiniMax-M2.7'],
        fallbackModels: ['qwen3-max-2026-01-23', 'MiniMax-M2.5'],
        reason: '长上下文任务需要大上下文支持的模型',
        weight: 1.0
      },
      // 高效/入门级任务
      {
        taskTypes: ['efficient', 'simple', 'basic'],
        preferredModels: ['MiniMax-M2', 'MiniMax-M2.1', 'glm-4.7'],
        fallbackModels: ['MiniMax-M2.1-highspeed'],
        reason: '简单任务使用入门级 MiniMax M2 成本最优',
        weight: 0.7
      }
    ];

    // 默认约束条件
    this.constraints = {
      maxCostPerTask: 0.50,      // 单任务最大成本 $0.5
      dailyBudget: 10.00,        // 日预算 $10
      preferredProviders: ['minimax', 'deepseek', 'bailian', 'anthropic', 'google', 'openai'],
      maxTokensPerTask: 1000000,  // 单任务最大 token 数 (MiniMax 支持 1M)
      qualityFirst: false,       // 是否质量优先（false = 成本优先）
      costControl: {             // 成本控制配置（保守预估 + 实时反馈）
        conservativeEstimation: true,  // 启用保守预估
        safetyMargin: 0.2,             // 20% 安全边际
        pendingConfirmTimeout: 30000,  // 待确认超时 30 秒
        realTimeFeedbackEnabled: true  // 启用实时反馈
      }
    };

    // 默认降级策略
    this.fallbackStrategies = {
      maxFallbackDepth: 2,         // 最多降级 2 层
      errorRateThreshold: 0.3,     // 错误率超过 30% 触发降级
      latencyThresholdMs: 5000,    // 延迟超过 5 秒触发降级
      rateLimitThreshold: 10       // 剩余配额低于 10 触发降级
    };

    // 默认监控配置
    this.monitoringConfig = {
      enabled: true,
      statusCheckInterval: 60000,    // 每 60 秒检查一次模型状态
      logSelectionReason: true,      // 记录选择原因
      trackPerformance: true,        // 跟踪性能指标
      maxHistorySize: 1000,          // 最大历史记录数
      logging: {                     // selectionReason日志配置
        level: 'info',               // 日志级别 ('debug', 'info', 'warn', 'error')
        includeSelectionReason: true, // 是否包含selectionReason
        selectionReasonFields: null,  // 指定要包含的字段（null表示全部）
        maxSizeLimit: 10240          // selectionReason最大大小限制（字节）
      }
    };

    // 默认策略配置
    this.strategyConfig = {
      enableLearning: true,          // 启用学习型选择
      learningWindow: 100,           // 学习窗口大小（最近 100 次任务）
      qualityWeight: 0.4,            // 质量权重
      costWeight: 0.4,               // 成本权重
      speedWeight: 0.2,              // 速度权重
      learning_integration: {        // 规则与学习器融合策略
        strategy: 'hybrid',          // 融合策略: 'rule_priority', 'learning_priority', 'hybrid', 'contextual'
        rule_weight: 0.6,            // 规则权重 (0-1)
        learning_weight: 0.4,        // 学习权重 (0-1)，与规则权重互补
        min_learning_confidence: 0.7, // 学习器推荐的最小置信度阈值
        contextual_switching: {
          enabled: true,
          conditions: {
            high_uncertainty_tasks: true, // 高不确定性任务优先规则
            security_critical: true,      // 安全关键任务优先规则
            repetitive_tasks: true,       // 重复性任务使用学习
            performance_sensitive: true   // 性能敏感任务使用学习
          }
        }
      }
    };
  }

  /**
   * 从配置文件加载
   */
  loadConfigFromFile() {
    const configPaths = [
      path.join(__dirname, 'selector-config.yaml'),
      path.join(__dirname, '..', '..', 'config', 'selector', 'selector-config.yaml'),
      path.join(__dirname, '..', 'config', 'selector-config.yaml')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const yaml = require('js-yaml');
          const content = fs.readFileSync(configPath, 'utf8');
          const config = yaml.load(content);

          if (config && config.selector) {
            this.applyConfigObject(config.selector);
          }
          break;
        } catch (error) {
          console.warn(`加载配置文件失败 ${configPath}: ${error.message}`);
        }
      }
    }
  }

  /**
   * 应用配置对象
   */
  applyConfigObject(config) {
    // 应用选择规则
    if (config.selection_rules && config.selection_rules.custom) {
      this.selectionRules = [...this.selectionRules, ...config.selection_rules.custom];
    }

    // 应用约束条件
    if (config.max_cost_per_task !== undefined) {
      this.constraints.maxCostPerTask = config.max_cost_per_task;
    }
    if (config.daily_budget !== undefined) {
      this.constraints.dailyBudget = config.daily_budget;
    }
    if (config.preferred_providers) {
      this.constraints.preferredProviders = config.preferred_providers;
    }
    if (config.quality_first !== undefined) {
      this.constraints.qualityFirst = config.quality_first;
    }

    // 应用降级策略
    if (config.fallback) {
      if (config.fallback.max_fallback_depth !== undefined) {
        this.fallbackStrategies.maxFallbackDepth = config.fallback.max_fallback_depth;
      }
      if (config.fallback.error_rate_threshold !== undefined) {
        this.fallbackStrategies.errorRateThreshold = config.fallback.error_rate_threshold;
      }
      if (config.fallback.latency_threshold_ms !== undefined) {
        this.fallbackStrategies.latencyThresholdMs = config.fallback.latency_threshold_ms;
      }
    }

    // 应用监控配置
    if (config.monitoring) {
      if (config.monitoring.enabled !== undefined) {
        this.monitoringConfig.enabled = config.monitoring.enabled;
      }
      if (config.monitoring.status_check_interval !== undefined) {
        this.monitoringConfig.statusCheckInterval = config.monitoring.status_check_interval;
      }
      if (config.monitoring.log_selection_reason !== undefined) {
        this.monitoringConfig.logSelectionReason = config.monitoring.log_selection_reason;
      }
    }

    // 应用策略配置
    if (config.strategy) {
      if (config.strategy.enable_learning !== undefined) {
        this.strategyConfig.enableLearning = config.strategy.enable_learning;
      }
      if (config.strategy.learning_window !== undefined) {
        this.strategyConfig.learningWindow = config.strategy.learning_window;
      }
      if (config.strategy.quality_weight !== undefined) {
        this.strategyConfig.qualityWeight = config.strategy.quality_weight;
      }
      if (config.strategy.cost_weight !== undefined) {
        this.strategyConfig.costWeight = config.strategy.cost_weight;
      }
      if (config.strategy.speed_weight !== undefined) {
        this.strategyConfig.speedWeight = config.strategy.speed_weight;
      }
      // 应用学习集成配置
      if (config.strategy.learning_integration) {
        this.strategyConfig.learning_integration = {
          ...this.strategyConfig.learning_integration,
          ...config.strategy.learning_integration
        };
      }
    }
  }

  /**
   * 合并用户配置
   */
  mergeUserConfig(userConfig) {
    if (!userConfig || typeof userConfig !== 'object') {
      return;
    }

    // 合并选择规则
    if (userConfig.selectionRules && Array.isArray(userConfig.selectionRules)) {
      // 移除相同 taskTypes 的默认规则，用用户规则替换
      for (const userRule of userConfig.selectionRules) {
        const existingIndex = this.selectionRules.findIndex(
          rule => rule.taskTypes[0] === userRule.taskTypes[0]
        );
        if (existingIndex >= 0) {
          this.selectionRules[existingIndex] = { ...this.selectionRules[existingIndex], ...userRule };
        } else {
          this.selectionRules.push(userRule);
        }
      }
    }

    // 合并约束条件
    if (userConfig.constraints) {
      this.constraints = { ...this.constraints, ...userConfig.constraints };
    }

    // 【修复】支持顶层 costControl 配置（从统一配置文件读取）
    // 统一配置文件中 costControl 是顶层字段，需要合并到 constraints
    if (userConfig.costControl) {
      if (userConfig.costControl.dailyBudget !== undefined) {
        this.constraints.dailyBudget = userConfig.costControl.dailyBudget;
      }
      if (userConfig.costControl.maxCostPerTask !== undefined) {
        this.constraints.maxCostPerTask = userConfig.costControl.maxCostPerTask;
      }
      if (userConfig.costControl.qualityFirst !== undefined) {
        this.constraints.qualityFirst = userConfig.costControl.qualityFirst;
      }
      // 合并成本控制配置到 constraints.costControl
      this.constraints.costControl = {
        ...this.constraints.costControl,
        ...userConfig.costControl
      };
    }

    // 合并降级策略
    if (userConfig.fallbackStrategies) {
      this.fallbackStrategies = { ...this.fallbackStrategies, ...userConfig.fallbackStrategies };
    }

    // 合并监控配置
    if (userConfig.monitoringConfig) {
      this.monitoringConfig = { ...this.monitoringConfig, ...userConfig.monitoringConfig };
    }

    // 合并策略配置
    if (userConfig.strategyConfig) {
      // 如果有学习集成配置，需要深合并
      if (userConfig.strategyConfig.learning_integration) {
        this.strategyConfig.learning_integration = {
          ...this.strategyConfig.learning_integration,
          ...userConfig.strategyConfig.learning_integration
        };
      }
      this.strategyConfig = { ...this.strategyConfig, ...userConfig.strategyConfig };
    }
  }

  /**
   * 根据任务类型获取规则
   */
  getRulesForTaskType(taskType) {
    return this.selectionRules.filter(rule =>
      rule.taskTypes.includes(taskType)
    );
  }

  /**
   * 获取所有选择规则
   */
  getAllRules() {
    return [...this.selectionRules];
  }


  /**
   * 获取约束条件
   */
  getConstraint(key, defaultValue) {
    if (key === undefined) {
      return { ...this.constraints };
    }
    return this.constraints[key] !== undefined ? this.constraints[key] : defaultValue;
  }

  /**
   * 更新约束条件
   */
  updateConstraint(key, value) {
    if (this.constraints.hasOwnProperty(key)) {
      this.constraints[key] = value;
      return true;
    }
    return false;
  }

  /**
   * 获取降级策略
   */
  getFallbackStrategy(key, defaultValue) {
    if (key === undefined) {
      return { ...this.fallbackStrategies };
    }
    return this.fallbackStrategies[key] !== undefined ? this.fallbackStrategies[key] : defaultValue;
  }

  /**
   * 获取监控配置
   */
  getMonitoringConfig(key, defaultValue) {
    if (key === undefined) {
      return { ...this.monitoringConfig };
    }
    return this.monitoringConfig[key] !== undefined ? this.monitoringConfig[key] : defaultValue;
  }

  /**
   * 获取策略配置
   */
  getStrategyConfig(key, defaultValue) {
    if (key === undefined) {
      return { ...this.strategyConfig };
    }
    return this.strategyConfig[key] !== undefined ? this.strategyConfig[key] : defaultValue;
  }

  /**
   * 导出配置
   */
  exportConfig(format = 'yaml') {
    const config = {
      selection_rules: this.selectionRules,
      constraints: this.constraints,
      fallback: this.fallbackStrategies,
      monitoring: this.monitoringConfig,
      strategy: this.strategyConfig
    };

    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    } else if (format === 'yaml') {
      const yaml = require('js-yaml');
      return yaml.dump(config);
    }

    throw new Error(`不支持的导出格式：${format}`);
  }

  /**
   * 保存配置到文件
   */
  saveConfig(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let content;

    if (ext === '.yaml' || ext === '.yml') {
      const yaml = require('js-yaml');
      content = yaml.dump(this.exportConfig('yaml'));
    } else if (ext === '.json') {
      content = this.exportConfig('json');
    } else {
      throw new Error(`不支持的配置文件格式：${ext}`);
    }

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[SelectionConfigManager] 配置已保存到：${filePath}`);
  }
}

module.exports = SelectionConfigManager;
