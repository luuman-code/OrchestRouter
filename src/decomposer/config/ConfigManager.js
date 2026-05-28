/**
 * ConfigManager - 配置管理器
 *
 * 功能块 B：配置与插件层
 * 负责加载、验证和管理分解器的所有配置
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigManager {
  constructor(options = {}) {
    this.configs = new Map();
    this.userConfig = options;
    this.defaultConfigPath = path.join(__dirname, 'default-config.yaml');
    this.configPaths = options.configPaths || [this.defaultConfigPath];

    // 配置缓存
    this.configCache = null;
    this.cacheEnabled = options.cacheEnabled !== false;
  }

  /**
   * 加载所有配置
   */
  loadConfig() {
    if (this.cacheEnabled && this.configCache) {
      return this.configCache;
    }

    let mergedConfig = this.getDefaultConfig();

    // 加载用户配置文件
    for (const configPath of this.configPaths) {
      if (configPath !== this.defaultConfigPath && fs.existsSync(configPath)) {
        const userConfig = this.loadConfigFile(configPath);
        mergedConfig = this.mergeConfigs(mergedConfig, userConfig);
      }
    }

    // 合并构造函数中传入的配置
    mergedConfig = this.mergeConfigs(mergedConfig, this.userConfig);

    // 验证配置
    this.validateConfig(mergedConfig);

    // 缓存配置
    if (this.cacheEnabled) {
      this.configCache = mergedConfig;
    }

    return mergedConfig;
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    try {
      return this.loadConfigFile(this.defaultConfigPath);
    } catch (error) {
      console.warn('无法加载默认配置文件，使用内置默认配置');
      return this.getBuiltInDefaultConfig();
    }
  }

  /**
   * 内置默认配置（当配置文件不存在时使用）
   */
  getBuiltInDefaultConfig() {
    return {
      llm: {
        enabled: true,
        base_url: "http://localhost:11434",
        model: "qwen2.5:3b",
        timeout: 60000,
        retry_attempts: 2,
        temperature: 0.1,
        max_concurrency: 3,
        max_batch_size: 10
      },
      task_types: {
        built_in: {
          ui: {
            display_name: "用户界面",
            description: "UI 组件、页面、视图相关任务",
            category: "frontend",
            priority: 3,
            metadata: {
              typical_file_extensions: [".jsx", ".tsx", ".vue", ".svelte"]
            }
          },
          style: {
            display_name: "样式设计",
            description: "CSS、SCSS 等样式相关任务",
            category: "frontend",
            priority: 2,
            metadata: {
              typical_file_extensions: [".css", ".scss", ".sass", ".less", ".styl"]
            }
          },
          logic: {
            display_name: "业务逻辑",
            description: "业务逻辑、算法、工作流相关任务",
            category: "backend",
            priority: 5,
            metadata: {
              typical_file_extensions: [".js", ".ts", ".py", ".java", ".go", ".rs"]
            }
          },
          api: {
            display_name: "API 接口",
            description: "API 设计、实现、集成相关任务",
            category: "backend",
            priority: 4,
            metadata: {
              typical_file_extensions: [".js", ".ts", ".py", ".java", ".go"]
            }
          },
          test: {
            display_name: "测试",
            description: "单元测试、集成测试、E2E 测试",
            category: "quality",
            priority: 1,
            metadata: {
              typical_file_extensions: [".test.js", ".spec.js", ".test.ts", ".spec.ts"]
            }
          },
          model: {
            display_name: "数据模型",
            description: "数据模型、实体定义、ORM 相关任务",
            category: "backend",
            priority: 4,
            metadata: {
              typical_file_extensions: [".js", ".ts", ".py", ".sql", ".prisma"]
            }
          },
          general: {
            display_name: "通用任务",
            description: "无法明确分类的通用任务",
            category: "general",
            priority: 2
          }
        },
        custom: {}
      },
      matching_rules: {
        keyword_rules: [],
        file_path_rules: [],
        regex_rules: []
      },
      plugins: {
        paths: ['./plugins'],
        enabled: [],
        configs: {}
      },
      semantic_analysis: {
        merge_threshold: 0.7,
        dependency_threshold: 0.3,
        weights: {
          content: 0.5,
          type: 0.3,
          context: 0.2
        },
        algorithm: 'tfidf_cosine',
        stop_words: []
      },
      debug: {
        enabled: false,
        log_level: 'info',
        max_history: 100,
        performance_tracking: true
      },
      conflict_resolution: {
        default_strategy: 'rename',
        strategy_priority: ['merge', 'partition', 'rename'],
        file_type_strategies: {}
      }
    };
  }

  /**
   * 加载配置文件
   */
  loadConfigFile(configPath) {
    const content = fs.readFileSync(configPath, 'utf8');
    const ext = path.extname(configPath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return yaml.load(content);
    } else if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.js') {
      const module = require(configPath);
      return module.default || module;
    }

    throw new Error(`不支持的配置文件格式：${ext}`);
  }

  /**
   * 合并配置
   */
  mergeConfigs(target, source) {
    if (!source) return target;

    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (this.isObject(sourceValue) && this.isObject(targetValue)) {
        // 递归合并对象
        result[key] = this.mergeConfigs(targetValue, sourceValue);
      } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        // 合并数组（去重）
        result[key] = [...new Set([...targetValue, ...sourceValue])];
      } else {
        // 覆盖值
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * 检查是否是普通对象
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 验证配置
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // 验证任务类型配置
    if (config.task_types) {
      this.validateTaskTypes(config.task_types, errors, warnings);
    }

    // 验证匹配规则配置
    if (config.matching_rules) {
      this.validateMatchingRules(config.matching_rules, errors, warnings);
    }

    // 验证插件配置
    if (config.plugins) {
      this.validatePluginConfig(config.plugins, errors, warnings);
    }

    // 验证语义分析配置
    if (config.semantic_analysis) {
      this.validateSemanticAnalysisConfig(config.semantic_analysis, errors, warnings);
    }

    // 输出警告
    warnings.forEach(warning => console.warn(`配置警告：${warning}`));

    // 抛出错误
    if (errors.length > 0) {
      throw new Error(`配置验证失败:\n${errors.join('\n')}`);
    }
  }

  /**
   * 验证任务类型配置
   */
  validateTaskTypes(taskTypes, errors, warnings) {
    const builtIn = taskTypes.built_in || {};
    const custom = taskTypes.custom || {};

    // 检查内置类型
    for (const [typeName, typeDef] of Object.entries(builtIn)) {
      if (!typeDef.display_name) {
        warnings.push(`内置类型 "${typeName}" 缺少 display_name`);
      }
      if (!typeDef.category) {
        warnings.push(`内置类型 "${typeName}" 缺少 category`);
      }
    }

    // 检查自定义类型
    for (const [typeName, typeDef] of Object.entries(custom)) {
      if (!typeDef.display_name) {
        errors.push(`自定义类型 "${typeName}" 必须包含 display_name`);
      }
      if (!typeDef.description) {
        warnings.push(`自定义类型 "${typeName}" 建议包含 description`);
      }
    }

    // 检查类型名称冲突
    const allTypeNames = [...Object.keys(builtIn), ...Object.keys(custom)];
    const duplicates = allTypeNames.filter((name, index) => allTypeNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`存在重复的类型名称：${[...new Set(duplicates)].join(', ')}`);
    }
  }

  /**
   * 验证匹配规则配置
   */
  validateMatchingRules(rules, errors, warnings) {
    // 验证关键词规则
    if (rules.keyword_rules) {
      rules.keyword_rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`关键词规则 [${index}] 缺少必需的 id 字段`);
        }
        if (!rule.type) {
          errors.push(`关键词规则 [${index}] 缺少必需的 type 字段`);
        }
        if (!rule.keywords || !Array.isArray(rule.keywords)) {
          errors.push(`关键词规则 [${index}] 缺少必需的 keywords 数组`);
        }
      });
    }

    // 验证文件路径规则
    if (rules.file_path_rules) {
      rules.file_path_rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`文件路径规则 [${index}] 缺少必需的 id 字段`);
        }
        if (!rule.type) {
          errors.push(`文件路径规则 [${index}] 缺少必需的 type 字段`);
        }
        if (!rule.patterns || !Array.isArray(rule.patterns)) {
          errors.push(`文件路径规则 [${index}] 缺少必需的 patterns 数组`);
        }
      });
    }

    // 验证正则规则
    if (rules.regex_rules) {
      rules.regex_rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`正则规则 [${index}] 缺少必需的 id 字段`);
        }
        if (!rule.type) {
          errors.push(`正则规则 [${index}] 缺少必需的 type 字段`);
        }
        if (!rule.patterns || !Array.isArray(rule.patterns)) {
          errors.push(`正则规则 [${index}] 缺少必需的 patterns 数组`);
        }
      });
    }
  }

  /**
   * 验证插件配置
   */
  validatePluginConfig(plugins, errors, warnings) {
    if (plugins.paths && !Array.isArray(plugins.paths)) {
      errors.push('插件路径必须是数组格式');
    }

    if (plugins.enabled && !Array.isArray(plugins.enabled)) {
      errors.push('启用的插件列表必须是数组格式');
    }
  }

  /**
   * 验证语义分析配置
   */
  validateSemanticAnalysisConfig(semanticAnalysis, errors, warnings) {
    if (semanticAnalysis.merge_threshold !== undefined) {
      if (semanticAnalysis.merge_threshold < 0 || semanticAnalysis.merge_threshold > 1) {
        errors.push('merge_threshold 必须在 0-1 之间');
      }
    }

    if (semanticAnalysis.dependency_threshold !== undefined) {
      if (semanticAnalysis.dependency_threshold < 0 || semanticAnalysis.dependency_threshold > 1) {
        errors.push('dependency_threshold 必须在 0-1 之间');
      }
    }

    if (semanticAnalysis.weights) {
      const totalWeight = Object.values(semanticAnalysis.weights).reduce((sum, w) => sum + w, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        warnings.push(`权重总和为 ${totalWeight}，建议总和为 1.0`);
      }
    }
  }

  /**
   * 获取特定配置项
   */
  getConfig(path, defaultValue = undefined) {
    const config = this.loadConfig();
    const keys = path.split('.');
    let value = config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * 清除配置缓存
   */
  clearCache() {
    this.configCache = null;
  }

  /**
   * 重新加载配置
   */
  reloadConfig() {
    this.clearCache();
    return this.loadConfig();
  }

  /**
   * 导出当前配置
   */
  exportConfig(format = 'yaml') {
    const config = this.loadConfig();

    if (format === 'yaml') {
      return yaml.dump(config);
    } else if (format === 'json') {
      return JSON.stringify(config, null, 2);
    }

    throw new Error(`不支持的导出格式：${format}`);
  }

  /**
   * 保存配置到文件
   */
  saveConfig(configPath, config = null) {
    const configToSave = config || this.loadConfig();
    const ext = path.extname(configPath).toLowerCase();

    let content;
    if (ext === '.yaml' || ext === '.yml') {
      content = yaml.dump(configToSave);
    } else if (ext === '.json') {
      content = JSON.stringify(configToSave, null, 2);
    } else {
      throw new Error(`不支持的配置文件格式：${ext}`);
    }

    // 确保目录存在
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, content, 'utf8');
  }
}

module.exports = ConfigManager;