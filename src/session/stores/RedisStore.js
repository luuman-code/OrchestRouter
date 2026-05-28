const redis = require('redis');
const SessionStore = require('../SessionStore');

class RedisStore extends SessionStore {
  constructor(options = {}) {
    super(options);
    this.client = null;
    this.redisUrl = options.redisUrl || 'redis://localhost:6379';
    this.ttl = options.ttl || 3600000; // 默认 1 小时过期
    this.maxSessionSize = options.maxSessionSize || 50 * 1024 * 1024; // 默认单个会话最大50MB
    this.namespace = options.namespace || 'sessions';

    // 初始化Redis客户端
    this.initializeClient();
  }

  initializeClient() {
    try {
      this.client = redis.createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries === 0) return 5000; // 第一次重连等待5秒
            if (retries < 10) return 10000; // 前10次重连等待10秒
            return 30000; // 后续重连等待30秒
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
      });

      this.client.on('reconnecting', () => {
        console.log('Redis Client Reconnecting...');
      });

      this.connect();
    } catch (error) {
      console.error(`Failed to initialize Redis client: ${error.message}`);
      throw error;
    }
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async ensureConnected() {
    if (!this.client || !this.client.isOpen) {
      await this.connect();
    }
  }

  // 生成带有命名空间的键
  generateKey(sessionId) {
    return `${this.namespace}:${sessionId}`;
  }

  // 生成用户会话列表键
  generateUserSessionsKey(userId) {
    return `${this.namespace}:user:${userId}`;
  }

  // 生成项目会话列表键
  generateProjectSessionsKey(projectId) {
    return `${this.namespace}:project:${projectId}`;
  }

  // 按用户隔离获取会话
  async getUserSessions(userId) {
    await this.ensureConnected();

    try {
      const sessionIds = await this.client.sMembers(this.generateUserSessionsKey(userId));
      const sessions = [];

      for (const sessionId of sessionIds) {
        const session = await this.get(sessionId.replace(`${this.namespace}:`, ''));
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      console.error(`Error getting user sessions for user ${userId}: ${error.message}`);
      return [];
    }
  }

  // 按项目隔离获取会话
  async getProjectSessions(projectId) {
    await this.ensureConnected();

    try {
      const sessionIds = await this.client.sMembers(this.generateProjectSessionsKey(projectId));
      const sessions = [];

      for (const sessionId of sessionIds) {
        const session = await this.get(sessionId.replace(`${this.namespace}:`, ''));
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      console.error(`Error getting project sessions for project ${projectId}: ${error.message}`);
      return [];
    }
  }

  async set(sessionId, session) {
    await this.ensureConnected();

    // 检查单个会话大小限制
    const sessionSize = session.calculateStorageSize();
    if (sessionSize > this.maxSessionSize) {
      throw new Error(`Session size ${sessionSize} exceeds maximum allowed size ${this.maxSessionSize}`);
    }

    // 准备会话数据
    const sessionData = {
      ...session,
      updatedAt: new Date(session.updatedAt).toISOString(),
      createdAt: new Date(session.createdAt).toISOString()
    };

    const sessionKey = this.generateKey(sessionId);

    try {
      // 序列化会话数据
      const serializedData = JSON.stringify(sessionData, (key, value) => {
        // 特殊处理Map对象
        if (value instanceof Map) {
          return {
            dataType: 'Map',
            value: Array.from(value.entries())
          };
        }
        // 特殊处理Date对象
        if (value instanceof Date) {
          return {
            dataType: 'Date',
            value: value.toISOString()
          };
        }
        return value;
      });

      // 设置会话数据到Redis
      await this.client.setEx(sessionKey, Math.floor(this.ttl / 1000), serializedData);

      // 将会话ID添加到用户或项目索引中
      if (session.userId) {
        await this.client.sAdd(this.generateUserSessionsKey(session.userId), sessionKey);
      }
      if (session.projectId) {
        await this.client.sAdd(this.generateProjectSessionsKey(session.projectId), sessionKey);
      }

      console.log(`Session ${sessionId} saved to Redis with TTL ${this.ttl}ms`);
    } catch (error) {
      console.error(`Error saving session ${sessionId} to Redis: ${error.message}`);
      throw error;
    }
  }

  async get(sessionId) {
    if (!sessionId) {
      return null;
    }

    await this.ensureConnected();

    const sessionKey = this.generateKey(sessionId);

    try {
      const serializedData = await this.client.get(sessionKey);

      if (!serializedData) {
        return null;
      }

      // 反序列化会话数据
      const sessionData = JSON.parse(serializedData, (key, value) => {
        if (value && typeof value === 'object' && value.dataType === 'Map') {
          return new Map(value.value);
        }
        if (value && typeof value === 'object' && value.dataType === 'Date') {
          return new Date(value.value);
        }
        return value;
      });

      // 动态导入Session类以避免循环依赖
      const Session = require('../Session');

      // 创建Session实例并复制属性
      const session = new Session(
        sessionData.sessionId,
        sessionData.originalTask,
        sessionData.userId,
        sessionData.projectId
      );

      Object.assign(session, sessionData);

      // 如果数据被压缩，解压后再返回
      if (session.storageStats && session.storageStats.compressed) {
        await session.decompressData();
      }

      // 延长TTL（更新最后访问时间）
      await this.client.expire(sessionKey, Math.floor(this.ttl / 1000));

      return session;
    } catch (error) {
      console.error(`Error retrieving session ${sessionId} from Redis: ${error.message}`);
      return null;
    }
  }

  async delete(sessionId) {
    if (!sessionId) {
      return false;
    }

    await this.ensureConnected();

    const sessionKey = this.generateKey(sessionId);

    try {
      // 获取会话数据以从中删除用户/项目索引
      const session = await this.get(sessionId);

      if (session) {
        // 从用户索引中删除
        if (session.userId) {
          await this.client.sRem(this.generateUserSessionsKey(session.userId), sessionKey);
        }
        // 从项目索引中删除
        if (session.projectId) {
          await this.client.sRem(this.generateProjectSessionsKey(session.projectId), sessionKey);
        }
      }

      // 删除会话数据
      const result = await this.client.del(sessionKey);
      return result > 0;
    } catch (error) {
      console.error(`Error deleting session ${sessionId} from Redis: ${error.message}`);
      return false;
    }
  }

  async cleanupExpired() {
    // Redis本身会在键过期时自动清理，所以我们只需要返回0
    // 这个方法主要是为了保持与其他存储实现的接口一致性
    return 0;
  }

  // 关闭存储，清理连接
  async close() {
    if (this.client && this.client.isOpen) {
      try {
        await this.client.quit();
        console.log('Redis connection closed');
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      }
    }
  }

  // 获取统计信息
  async getStatistics() {
    await this.ensureConnected();

    try {
      const info = await this.client.info('keyspace');
      const dbSize = await this.client.dbSize();

      return {
        totalSessions: dbSize,
        redisUrl: this.redisUrl,
        ttl: this.ttl,
        maxSessionSize: this.maxSessionSize,
        namespace: this.namespace,
        connected: this.client.isOpen,
        info: info
      };
    } catch (error) {
      console.error(`Error getting Redis statistics: ${error.message}`);
      return {
        totalSessions: 0,
        redisUrl: this.redisUrl,
        ttl: this.ttl,
        maxSessionSize: this.maxSessionSize,
        namespace: this.namespace,
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = RedisStore;