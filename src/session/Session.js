const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const DependencyGraph = require('./DependencyGraph');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class Session {
  constructor(sessionId, originalTask, userId = null, projectId = null) {
    this.sessionId = sessionId;
    this.originalTask = originalTask;
    this.userId = userId;        // 会话归属用户标识
    this.projectId = projectId;  // 会话归属项目标识
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.version = 1;

    // 存储统计信息
    this.storageStats = {
      compressed: false,  // 是否已压缩存储
      rawSize: 0,         // 原始大小
      compressedSize: 0,  // 压缩后大小
      storageLimit: 50 * 1024 * 1024  // 50MB存储限制
    };

    // 状态数据
    this.decompositionResult = null;  // 分解结果
    this.executionResults = new Map(); // 执行结果
    this.fileTree = new Map();         // 文件树
    this.dependencyGraph = new DependencyGraph();       // 依赖图
    this.conflictReport = null;        // 冲突报告
    this.metadata = {
      totalTokens: 0,
      totalCost: 0,
      iterationCount: 0,
      lastAction: null,
      storageUsed: 0  // 已使用存储空间
    };
  }

  // 更新会话
  update(data) {
    Object.assign(this, data);
    this.updatedAt = new Date();
    this.version++;
  }

  // 计算会话总大小（用于存储限制检查）
  calculateStorageSize() {
    const serialized = JSON.stringify(this);
    this.storageStats.rawSize = Buffer.byteLength(serialized, 'utf8');
    this.metadata.storageUsed = this.storageStats.rawSize;
    return this.storageStats.rawSize;
  }

  // 检查是否超出存储限制
  isStorageExceeded() {
    return this.storageStats.rawSize > this.storageStats.storageLimit;
  }

  // 获取文件内容哈希（用于增量检测）
  getFileHash(filePath) {
    const file = this.fileTree.get(filePath);
    if (!file) return null;

    // 对大文件使用增量哈希
    if (file.content && file.content.length > 1024 * 1024) { // 超过1MB
      return this.calculateLargeFileHash(file.content);
    }
    return this.calculateHash(file.content);
  }

  calculateHash(content) {
    // 使用 SHA-256 替代 MD5 以提高安全性
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 为大文件计算增量哈希
  calculateLargeFileHash(content) {
    // 对于大文件，只计算内容的开头、中间和结尾部分的哈希
    const chunkSize = Math.min(content.length, 1024 * 100); // 最大100KB块

    let startChunk = content.substring(0, chunkSize);
    let middleChunk = '';
    let endChunk = '';

    if (content.length > chunkSize * 2) {
      const middleIndex = Math.floor(content.length / 2);
      middleChunk = content.substring(middleIndex, middleIndex + chunkSize);
      endChunk = content.substring(content.length - chunkSize);
    } else {
      endChunk = content.substring(content.length - chunkSize);
    }

    const combinedChunks = startChunk + middleChunk + endChunk;
    return crypto.createHash('sha256').update(combinedChunks).digest('hex');
  }

  // 压缩会话数据以节省存储空间
  async compressData() {
    if (this.isStorageExceeded()) {
      // 仅压缩 fileTree 部分，因为这是占用空间最大的部分
      const compressedFileTree = new Map();

      for (const [filePath, fileData] of this.fileTree) {
        if (typeof fileData.content === 'string' && fileData.content.length > 1024) {
          // 对较大的文件内容进行压缩
          const compressedContent = await gzip(Buffer.from(fileData.content, 'utf8'));
          compressedFileTree.set(filePath, {
            ...fileData,
            content: compressedContent.toString('base64'), // 转换为base64字符串存储
            compressed: true
          });
        } else {
          compressedFileTree.set(filePath, fileData);
        }
      }

      this.fileTree = compressedFileTree;
      this.storageStats.compressed = true;

      // 更新存储统计
      this.calculateStorageSize();
    }
  }

  // 解压会话数据
  async decompressData() {
    if (this.storageStats.compressed) {
      const decompressedFileTree = new Map();

      for (const [filePath, fileData] of this.fileTree) {
        if (fileData.compressed && typeof fileData.content === 'string') {
          // 解压文件内容
          const compressedBuffer = Buffer.from(fileData.content, 'base64');
          const decompressedContent = await gunzip(compressedBuffer);
          decompressedFileTree.set(filePath, {
            ...fileData,
            content: decompressedContent.toString('utf8'),
            compressed: false
          });
        } else {
          decompressedFileTree.set(filePath, fileData);
        }
      }

      this.fileTree = decompressedFileTree;
      this.storageStats.compressed = false;

      // 也要处理依赖图的压缩状态
      if (this.dependencyGraph && typeof this.dependencyGraph.export === 'function') {
        // 如果依赖图被序列化为普通对象，需要重建
        if (this.dependencyGraph.nodes && this.dependencyGraph.reverseNodes) {
          const tempGraphData = this.dependencyGraph;
          this.dependencyGraph = new DependencyGraph();
          this.dependencyGraph.import(tempGraphData);
        }
      }
    }
  }

  // 自定义序列化方法以正确处理Map对象和DependencyGraph
  toJSON() {
    const serialized = { ...this };

    // 序列化Map对象
    if (this.fileTree instanceof Map) {
      serialized.fileTree = Object.fromEntries(this.fileTree);
    }

    if (this.executionResults instanceof Map) {
      serialized.executionResults = Object.fromEntries(this.executionResults);
    }

    // 序列化DependencyGraph
    if (this.dependencyGraph && typeof this.dependencyGraph.export === 'function') {
      serialized.dependencyGraph = this.dependencyGraph.export();
    }

    // 序列化日期对象
    if (this.createdAt instanceof Date) {
      serialized.createdAt = this.createdAt.toISOString();
    }

    if (this.updatedAt instanceof Date) {
      serialized.updatedAt = this.updatedAt.toISOString();
    }

    return serialized;
  }
}

module.exports = Session;