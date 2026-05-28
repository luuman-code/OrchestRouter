/**
 * 会话默认配置
 */

module.exports = {
  // 会话ID生成配置
  idGeneration: {
    strategy: 'uuid-v4',  // 'uuid-v4', 'timestamp-hash', 'composite'
    prefix: 'sess',       // 会话ID前缀
    minLength: 32,        // 最小长度
    entropySource: 'crypto', // 随机熵源：'crypto', 'timestamp', 'pid'
    validateOnCreate: true // 创建时验证ID格式
  },

  // 存储配置
  storage: {
    // 默认存储类型
    defaultStore: 'memory', // 'memory', 'file', 'redis', 'hybrid'

    // 内存存储配置
    memory: {
      maxSessions: 1000,
      ttl: 3600000, // 1小时过期
      maxSessionSize: 50 * 1024 * 1024, // 50MB
      cleanupInterval: 300000 // 5分钟清理一次
    },

    // 文件存储配置
    file: {
      basePath: './sessions',
      ttl: 3600000, // 1小时过期
      maxSessionSize: 50 * 1024 * 1024, // 50MB
      cleanupInterval: 300000, // 5分钟清理一次
      compression: {
        enabled: true,
        threshold: 10 * 1024 * 1024 // 10MB以上启用压缩
      }
    },

    // Redis存储配置
    redis: {
      redisUrl: 'redis://localhost:6379',
      ttl: 3600000, // 1小时过期
      maxSessionSize: 50 * 1024 * 1024, // 50MB
      namespace: 'sessions',
      clusterSafe: false
    },

    // 混合存储配置
    hybrid: {
      storageStrategy: 'memory-first', // 'memory-first', 'redis-first', 'file-first'
      syncMode: 'async', // 'sync', 'async', 'eventual'
      failoverEnabled: true,
      memoryOptions: {
        maxSessions: 100,
        ttl: 300000 // 5分钟
      },
      fileOptions: {
        basePath: './sessions',
        ttl: 3600000
      },
      redisOptions: {
        redisUrl: 'redis://localhost:6379',
        ttl: 3600000
      },
      redisEnabled: true
    }
  },

  // 会话生命周期配置
  lifecycle: {
    maxDuration: 24 * 3600000, // 最大会话持续时间 24小时
    heartbeatInterval: 60000, // 心跳间隔 1分钟
    idleTimeout: 1800000, // 空闲超时 30分钟
    autoSaveInterval: 30000 // 自动保存间隔 30秒
  },

  // 安全配置
  security: {
    encryption: {
      enabled: false,
      algorithm: 'aes-256-gcm',
      keyRotationInterval: 24 * 3600000 // 24小时轮换
    },
    rateLimiting: {
      enabled: true,
      maxRequests: 100, // 每分钟最大请求数
      windowMs: 60000 // 时间窗口 1分钟
    }
  },

  // 性能配置
  performance: {
    cache: {
      enabled: true,
      max: 100, // 最大缓存条目
      ttl: 300000 // 5分钟过期
    },
    compression: {
      enabled: true,
      threshold: 1024 * 1024 // 1MB以上启用压缩
    },
    batchProcessing: {
      enabled: true,
      batchSize: 10,
      batchTimeout: 1000 // 1秒批处理超时
    }
  },

  // 调试配置
  debug: {
    enabled: false,
    logLevel: 'info', // 'error', 'warn', 'info', 'debug'
    performanceLogging: false
  }
};