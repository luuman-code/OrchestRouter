const SessionStore = require('../SessionStore');
const crypto = require('crypto');

class EncryptedSessionStore extends SessionStore {
  constructor(wrappedStore, options = {}) {
    super(options);
    this.wrappedStore = wrappedStore; // 被包装的实际存储
    this.encryptionAlgorithm = options.algorithm || 'aes-256-gcm';
    this.keyManagementStrategy = options.keyManagementStrategy || 'env_first';
    this.keyRotationInterval = options.keyRotationInterval || 24 * 60 * 60 * 1000; // 24 小时
    this.keyHistory = []; // 历史密钥用于解密旧数据
    this.key = null;
    this.ivLength = 16;

    // 初始化密钥
    this.initializeKey();

    // 设置密钥轮换定时器
    if (this.keyRotationInterval > 0) {
      this.scheduleKeyRotation();
    }
  }

  /**
   * 初始化加密密钥，支持多种获取方式
   */
  async initializeKey() {
    switch (this.keyManagementStrategy) {
      case 'env_first':
        this.key = await this.getKeyFromEnvironment() ||
                   await this.getKeyFromFile() ||
                   await this.generateAndStoreKey();
        break;
      case 'kms':
        this.key = await this.getKeyFromKMS();
        break;
      case 'file_based':
        this.key = await this.getKeyFromFile();
        break;
      case 'external_service':
        this.key = await this.getKeyFromExternalService();
        break;
      default:
        this.key = await this.getKeyFromEnvironment() ||
                   await this.generateAndStoreKey();
    }

    if (!this.key) {
      throw new Error('Failed to initialize encryption key');
    }
  }

  /**
   * 从环境变量获取密钥
   */
  async getKeyFromEnvironment() {
    return process.env.SESSION_ENCRYPTION_KEY || null;
  }

  /**
   * 从文件获取密钥
   */
  async getKeyFromFile() {
    const fs = require('fs').promises;
    const keyFilePath = process.env.ENCRYPTION_KEY_FILE || './encryption.key';

    try {
      const keyData = await fs.readFile(keyFilePath, 'utf8');
      return keyData.trim();
    } catch (error) {
      console.warn(`Could not read encryption key from file: ${error.message}`);
      return null;
    }
  }

  /**
   * 从KMS服务获取密钥
   */
  async getKeyFromKMS() {
    // 模拟KMS服务调用
    console.warn('KMS integration not fully implemented in this example');
    return process.env.KMS_ENCRYPTION_KEY || null;
  }

  /**
   * 从外部服务获取密钥
   */
  async getKeyFromExternalService() {
    // 模拟外部服务调用
    console.warn('External key service integration not fully implemented in this example');
    return process.env.EXTERNAL_ENCRYPTION_KEY || null;
  }

  /**
   * 生成并存储新密钥
   */
  async generateAndStoreKey() {
    // 生成新的32字节(256位)密钥
    const newKey = crypto.randomBytes(32).toString('hex');

    // 添加到密钥历史
    this.keyHistory.unshift({
      key: this.key, // 保存当前密钥到历史
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.keyRotationInterval)
    });

    // 限制历史记录大小
    if (this.keyHistory.length > 10) {
      this.keyHistory = this.keyHistory.slice(0, 10);
    }

    return newKey;
  }

  /**
   * 加密数据
   */
  async encryptData(data) {
    if (!this.key) {
      throw new Error('Encryption key not initialized');
    }

    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.encryptionAlgorithm, this.key);
    cipher.setAAD(Buffer.from('session_data'));

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted: true,
      data: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.encryptionAlgorithm
    };
  }

  /**
   * 解密数据
   */
  async decryptData(encryptedData) {
    if (!encryptedData.encrypted) {
      return encryptedData;
    }

    if (!encryptedData.iv || !encryptedData.authTag) {
      throw new Error('Missing IV or auth tag for decryption');
    }

    // 尝试使用当前密钥解密
    try {
      return await this.decryptWithKey(encryptedData, this.key);
    } catch (error) {
      // 如果当前密钥失败，尝试使用历史密钥
      for (const historyItem of this.keyHistory) {
        try {
          return await this.decryptWithKey(encryptedData, historyItem.key);
        } catch (historyError) {
          continue; // 继续尝试下一个历史密钥
        }
      }

      // 所有密钥都失败
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * 使用指定密钥解密
   */
  async decryptWithKey(encryptedData, key) {
    if (!key) {
      throw new Error('No key available for decryption');
    }

    const decipher = crypto.createDecipher(this.encryptionAlgorithm, key);
    decipher.setAAD(Buffer.from('session_data'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * 设置会话数据（加密存储）
   */
  async set(sessionId, session) {
    const encryptedSession = await this.encryptData(session);
    return await this.wrappedStore.set(sessionId, encryptedSession);
  }

  /**
   * 获取会话数据（解密读取）
   */
  async get(sessionId) {
    const encryptedSession = await this.wrappedStore.get(sessionId);
    if (!encryptedSession) {
      return null;
    }

    // 如果数据不是加密格式，直接返回（向后兼容）
    if (!encryptedSession.encrypted) {
      return encryptedSession;
    }

    return await this.decryptData(encryptedSession);
  }

  /**
   * 删除会话数据
   */
  async delete(sessionId) {
    return await this.wrappedStore.delete(sessionId);
  }

  /**
   * 获取用户的所有会话
   */
  async getUserSessions(userId) {
    // 获取所有会话，然后筛选特定用户
    // 注意：这里由于加密，我们不能直接查询加密数据中的userId
    // 这里我们只是简单地委托给底层存储
    return await this.wrappedStore.getUserSessions(userId);
  }

  /**
   * 获取项目的所有会话
   */
  async getProjectSessions(projectId) {
    // 与getUserSessions类似，由于加密原因，我们需要底层存储支持索引
    return await this.wrappedStore.getProjectSessions(projectId);
  }

  /**
   * 清理过期的会话
   */
  async cleanupExpired() {
    return await this.wrappedStore.cleanupExpired();
  }

  /**
   * 获取存储统计信息
   */
  async getStatistics() {
    const stats = await this.wrappedStore.getStatistics();
    stats.encrypted = true;
    stats.encryptionAlgorithm = this.encryptionAlgorithm;
    return stats;
  }

  /**
   * 轮换加密密钥
   */
  scheduleKeyRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        await this.rotateKey();
        console.log('Successfully rotated encryption key');
      } catch (error) {
        console.error('Failed to rotate encryption key:', error.message);
      }
    }, this.keyRotationInterval);
  }

  /**
   * 执行密钥轮换
   */
  async rotateKey() {
    const oldKey = this.key;
    this.key = await this.generateAndStoreKey();

    // 注意：在实际应用中，您可能需要重新加密现有数据
    // 这里我们只是保存旧密钥用于解密历史数据
    console.log('Key rotation completed. Old key retained for decrypting existing data.');
  }

  /**
   * 关闭存储连接并释放资源
   */
  async close() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.wrappedStore && typeof this.wrappedStore.close === 'function') {
      await this.wrappedStore.close();
    }
  }
}

module.exports = EncryptedSessionStore;