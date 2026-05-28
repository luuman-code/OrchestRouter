/**
 * DatabasePlugin - 数据库类型插件示例
 *
 * 演示如何创建一个自定义类型插件，为分解器添加数据库相关的类型识别能力
 */

const BasePlugin = require('../BasePlugin');

class DatabasePlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
    this.name = 'DatabasePlugin';
    this.version = '1.0.0';
    this.description = '数据库相关任务类型识别插件';
    this.author = 'Decomposer Team';

    // 定义数据库相关的类型
    this.typeDefinitions = {
      migration: {
        display_name: '数据库迁移',
        description: '数据库迁移脚本、版本控制相关任务',
        category: 'backend',
        priority: 4,
        metadata: {
          typical_file_extensions: ['.migration.js', '.sql', '.prisma']
        }
      },
      schema: {
        display_name: '数据模式',
        description: '数据库模式定义、表结构设计相关任务',
        category: 'backend',
        priority: 4,
        metadata: {
          typical_file_extensions: ['.schema.sql', '.prisma', '.graphql']
        }
      },
      query: {
        display_name: '查询优化',
        description: 'SQL 查询编写、优化相关任务',
        category: 'backend',
        priority: 3,
        metadata: {
          typical_file_extensions: ['.sql']
        }
      }
    };

    // 定义匹配规则
    this.matchingRules = [
      {
        id: 'db-kw-migration-001',
        type: 'migration',
        keywords: ['迁移', 'migration', '版本控制', 'version', 'schema change'],
        weight: 0.85,
        match_mode: 'any'
      },
      {
        id: 'db-kw-schema-001',
        type: 'schema',
        keywords: ['模式', 'schema', '表结构', 'table structure', 'entity definition'],
        weight: 0.85,
        match_mode: 'any'
      },
      {
        id: 'db-kw-query-001',
        type: 'query',
        keywords: ['查询', 'query', 'sql', 'optimize', '索引', 'index'],
        weight: 0.8,
        match_mode: 'any'
      },
      {
        id: 'db-fp-001',
        type: 'migration',
        patterns: ['**/migrations/**/*', '**/*.migration.js'],
        weight: 0.95
      },
      {
        id: 'db-fp-002',
        type: 'schema',
        patterns: ['**/schemas/**/*', '**/*.schema.sql'],
        weight: 0.95
      }
    ];
  }

  /**
   * 插件初始化
   */
  async initialize() {
    this.log('数据库插件初始化完成');
    return Promise.resolve();
  }

  /**
   * 执行插件功能
   * @param {Object} context - 执行上下文
   */
  async execute(context) {
    this.log(`执行数据库类型识别：${context.deliverable?.description || 'unknown'}`);

    // 这里是示例实现，实际匹配由 ConfigurableTypeMatcher 处理
    return {
      pluginName: this.name,
      executed: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 插件卸载
   */
  async dispose() {
    this.log('数据库插件已卸载');
    return Promise.resolve();
  }

  /**
   * 获取插件支持的类型列表
   */
  getSupportedTypes() {
    return Object.keys(this.typeDefinitions);
  }

  /**
   * 检查是否支持指定的类型
   */
  supportsType(typeName) {
    return typeName in this.typeDefinitions;
  }
}

module.exports = DatabasePlugin;