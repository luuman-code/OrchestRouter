/**
 * ExecutorConfigLoader - 配置加载器
 *
 * 负责加载和验证执行器的所有配置
 * 支持 YAML 和 JSON 格式配置文件
 *
 * @class ExecutorConfigLoader
 */
const fs = require('fs');
const path = require('path');

class ExecutorConfigLoader {
  /**
   * 创建配置加载器
   * @param {string} configPath - 配置文件路径
   */
  constructor(configPath = './config/executor.yaml') {
    this.configPath = configPath;
    this.config = null;
  }

  /**
   * 加载配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadConfig() {
    try {
      // 从文件系统加载配置
      if (this.configPath.endsWith('.yaml') || this.configPath.endsWith('.yml')) {
        this.config = await this.loadYamlConfig(this.configPath);
      } else if (this.configPath.endsWith('.json')) {
        this.config = await this.loadJsonConfig(this.configPath);
      } else {
        throw new Error(`Unsupported config file format: ${this.configPath}`);
      }

      // 验证配置结构
      this.validateConfigStructure(this.config);

      // 应用默认值
      this.config = this.applyDefaults(this.config);

      console.log('[ExecutorConfigLoader] 配置加载成功');
      return this.config;
    } catch (error) {
      console.error('[ExecutorConfigLoader] 加载配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载 YAML 配置
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 配置对象
   */
  async loadYamlConfig(filePath) {
    const yaml = require('js-yaml');
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    return yaml.load(fileContent);
  }

  /**
   * 加载 JSON 配置
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 配置对象
   */
  async loadJsonConfig(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    const content = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 验证配置结构
   * @param {Object} config - 配置对象
   */
  validateConfigStructure(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be a valid object');
    }

    if (!config.executor) {
      throw new Error('Configuration must contain "executor" section');
    }

    // 验证必需的配置项
    const requiredSections = ['concurrency', 'retry', 'rate_limit'];
    for (const section of requiredSections) {
      if (!config.executor[section]) {
        console.warn(`[ExecutorConfigLoader] Configuration missing optional section: executor.${section}`);
      }
    }
  }

  /**
   * 应用默认配置值
   * @param {Object} config - 配置对象
   * @returns {Object} 应用默认值后的配置
   */
  applyDefaults(config) {
    const defaultConfig = {
      executor: {
        general: {
          default_max_concurrency: 10,
          default_timeout: 60000,
          enable_tracing: true,
          enable_monitoring: true,
          log_level: 'info'
        },
        concurrency: {
          max_concurrent: 50,
          adaptive: true,
          timeout_ms: 30000,
          enable_priority_queue: false
        },
        retry: {
          max_retries: 3,
          base_delay: 1000,
          exponential_base: 2.0,
          jitter: true
        },
        rate_limit: {
          default_rps: 10,
          burst_capacity: 30,
          enable_coordination: true,
          health_check_factor: 0.1
        },
        cost_control: {
          default_budget: 100.00,
          safety_margin: 0.2,
          conservative_estimation: true,
          enable_real_time_tracking: true
        },
        tracing: {
          enabled: true,
          log_level: 'info',
          include_sensitive_data: false,
          sampling_rate: 1.0,
          max_traces: 10000
        },
        monitoring: {
          enabled: true,
          metrics_collection: true,
          performance_logging: true,
          alert_thresholds: {
            error_rate: 0.05,
            response_time: 5000,
            resource_usage: 0.8
          }
        }
      }
    };

    // 深度合并配置
    return this.deepMerge(defaultConfig, config);
  }

  /**
   * 深度合并两个对象
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 获取配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    return this.config;
  }

  /**
   * 保存配置到文件
   * @param {string} outputPath - 输出文件路径
   * @param {Object} config - 配置对象（可选，默认使用当前配置）
   */
  saveConfig(outputPath, config = null) {
    const configToSave = config || this.config;
    const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);

    if (outputPath.endsWith('.json')) {
      fs.writeFileSync(absolutePath, JSON.stringify(configToSave, null, 2));
    } else if (outputPath.endsWith('.yaml') || outputPath.endsWith('.yml')) {
      const yaml = require('js-yaml');
      fs.writeFileSync(absolutePath, yaml.dump(configToSave));
    } else {
      throw new Error(`Unsupported config file format: ${outputPath}`);
    }

    console.log(`[ExecutorConfigLoader] 配置已保存到：${absolutePath}`);
  }
}

module.exports = { ExecutorConfigLoader };
