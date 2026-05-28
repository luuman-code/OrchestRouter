const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const SessionStore = require('../SessionStore');

class FileStore extends SessionStore {
  constructor(options = {}) {
    super(options);
    // 设置会话数据存储目录
    this.basePath = options.basePath || './sessions';
    this.ttl = options.ttl || 3600000; // 默认 1 小时过期
    this.maxSessionSize = options.maxSessionSize || 50 * 1024 * 1024; // 默认单个会话最大50MB

    // 确保基础路径存在
    this.ensureBasePath();

    // 启动定期清理任务
    this.cleanupInterval = options.cleanupInterval || 300000; // 默认每5分钟清理一次
    this.startCleanupTimer();
  }

  async ensureBasePath() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error(`Failed to create session storage directory: ${error.message}`);
      throw error;
    }
  }

  startCleanupTimer() {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpired();
    }, this.cleanupInterval);
  }

  // 按用户/项目隔离获取会话
  async getUserSessions(userId) {
    const allSessions = await this.getAllSessions();
    return allSessions.filter(session => session.userId === userId);
  }

  // 按项目隔离获取会话
  async getProjectSessions(projectId) {
    const allSessions = await this.getAllSessions();
    return allSessions.filter(session => session.projectId === projectId);
  }

  // 获取所有会话（内部方法）
  async getAllSessions() {
    const sessions = [];
    try {
      const files = await fs.readdir(this.basePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionPath = path.join(this.basePath, file);
          const sessionData = await this.readSessionFile(sessionPath);

          if (sessionData) {
            // 检查是否过期
            if (!this.isExpired(sessionData)) {
              sessions.push(sessionData);
            } else {
              // 如果过期，删除文件
              await fs.unlink(sessionPath);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error reading session files: ${error.message}`);
    }

    return sessions;
  }

  // 读取会话文件
  async readSessionFile(sessionPath) {
    try {
      const fileContent = await fs.readFile(sessionPath, 'utf8');
      const sessionData = JSON.parse(fileContent);

      // 动态导入Session类和DependencyGraph以避免循环依赖
      const Session = require('../Session');
      const DependencyGraph = require('../DependencyGraph');

      // 将JSON数据转换为Session实例
      const session = new Session(
        sessionData.sessionId,
        sessionData.originalTask,
        sessionData.userId,
        sessionData.projectId
      );

      // 复制所有属性
      Object.assign(session, sessionData);

      // 重建DependencyGraph实例（如果存在）
      if (sessionData.dependencyGraph && sessionData.dependencyGraph.nodes) {
        const dependencyGraph = new DependencyGraph();
        dependencyGraph.import(sessionData.dependencyGraph);
        session.dependencyGraph = dependencyGraph;
      }

      return session;
    } catch (error) {
      console.error(`Error reading session file ${sessionPath}: ${error.message}`);
      return null;
    }
  }

  async set(sessionId, session) {
    // 检查单个会话大小限制
    const sessionSize = session.calculateStorageSize();
    if (sessionSize > this.maxSessionSize) {
      throw new Error(`Session size ${sessionSize} exceeds maximum allowed size ${this.maxSessionSize}`);
    }

    // 准备会话数据
    const sessionData = {
      ...session,
      updatedAt: new Date(session.updatedAt),
      createdAt: new Date(session.createdAt)
    };

    // 创建会话文件路径
    const sessionPath = path.join(this.basePath, `${sessionId}.json`);

    // 写入文件
    try {
      // 序列化时保留函数和特殊对象
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
      }, 2);

      await fs.writeFile(sessionPath, serializedData, 'utf8');
    } catch (error) {
      console.error(`Error saving session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async get(sessionId) {
    if (!sessionId) {
      return null;
    }

    const sessionPath = path.join(this.basePath, `${sessionId}.json`);

    try {
      // 检查文件是否存在
      await fs.access(sessionPath);

      // 读取文件内容
      const sessionData = await this.readSessionFile(sessionPath);

      if (!sessionData) {
        return null;
      }

      // 检查是否过期
      if (this.isExpired(sessionData)) {
        // 删除过期的会话文件
        await fs.unlink(sessionPath);
        return null;
      }

      // 更新最后访问时间
      sessionData.lastAccessed = Date.now();

      // 如果数据被压缩，解压后再返回
      if (sessionData.storageStats && sessionData.storageStats.compressed) {
        await sessionData.decompressData();
      }

      return sessionData;
    } catch (error) {
      // 文件不存在或其他错误
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error(`Error retrieving session ${sessionId}: ${error.message}`);
      return null;
    }
  }

  async delete(sessionId) {
    if (!sessionId) {
      return false;
    }

    const sessionPath = path.join(this.basePath, `${sessionId}.json`);

    try {
      await fs.access(sessionPath);
      await fs.unlink(sessionPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，认为已经删除
        return true;
      }
      console.error(`Error deleting session ${sessionId}: ${error.message}`);
      return false;
    }
  }

  // 检查会话是否过期
  isExpired(sessionData) {
    const now = Date.now();
    const lastAccessed = new Date(sessionData.updatedAt).getTime();
    return (now - lastAccessed) > this.ttl;
  }

  async cleanupExpired() {
    let cleanedCount = 0;
    try {
      const files = await fs.readdir(this.basePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionPath = path.join(this.basePath, file);
          const sessionId = file.replace('.json', '');

          // 获取会话但不更新访问时间
          const sessionPathFull = path.join(this.basePath, file);
          try {
            const stat = await fs.stat(sessionPathFull);
            const sessionDataStr = await fs.readFile(sessionPathFull, 'utf8');
            const sessionData = JSON.parse(sessionDataStr);

            const lastModified = stat.mtime.getTime();
            const now = Date.now();

            if ((now - lastModified) > this.ttl) {
              await fs.unlink(sessionPathFull);
              cleanedCount++;
            }
          } catch (error) {
            // 如果文件损坏，也删除它
            try {
              await fs.unlink(sessionPathFull);
              cleanedCount++;
            } catch (delError) {
              console.error(`Could not delete corrupted session file ${sessionPathFull}: ${delError.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error during expired session cleanup: ${error.message}`);
    }

    return cleanedCount;
  }

  // 关闭存储，清理定时器
  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // 获取统计信息
  async getStatistics() {
    try {
      const files = await fs.readdir(this.basePath);
      const sessionFiles = files.filter(f => f.endsWith('.json'));

      return {
        totalSessions: sessionFiles.length,
        basePath: this.basePath,
        ttl: this.ttl,
        maxSessionSize: this.maxSessionSize
      };
    } catch (error) {
      console.error(`Error getting statistics: ${error.message}`);
      return {
        totalSessions: 0,
        basePath: this.basePath,
        ttl: this.ttl,
        maxSessionSize: this.maxSessionSize
      };
    }
  }
}

module.exports = FileStore;