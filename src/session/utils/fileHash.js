const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * 计算文件内容的哈希值
 * @param {string} content - 文件内容
 * @param {string} algorithm - 哈希算法，默认为 'sha256'
 * @returns {string} 文件内容的哈希值
 */
function computeFileHash(content, algorithm = 'sha256') {
  if (typeof content !== 'string') {
    content = String(content);
  }
  return crypto.createHash(algorithm).update(content, 'utf8').digest('hex');
}

/**
 * 计算文件的增量哈希（适用于大文件）
 * @param {string} content - 文件内容
 * @returns {string} 文件内容的增量哈希值
 */
function computeIncrementalHash(content) {
  if (typeof content !== 'string') {
    content = String(content);
  }

  // 对于小文件，直接计算完整哈希
  if (content.length < 1024) {  // 1KB以下
    return computeFileHash(content);
  }

  // 对于大文件，使用多个部分的哈希组合
  const chunkSize = Math.max(1024, Math.floor(content.length / 10)); // 至少1KB，最多整个文件的1/10
  let hashParts = [];

  // 取开头、中间和结尾部分
  if (content.length <= chunkSize * 3) {
    // 如果文件不够大，直接使用完整哈希
    return computeFileHash(content);
  }

  // 开头部分
  hashParts.push(crypto.createHash('sha256').update(content.substring(0, chunkSize)).digest('hex'));

  // 中间部分
  const middleStart = Math.floor(content.length / 2) - Math.floor(chunkSize / 2);
  hashParts.push(crypto.createHash('sha256').update(content.substring(middleStart, middleStart + chunkSize)).digest('hex'));

  // 结尾部分
  hashParts.push(crypto.createHash('sha256').update(content.substring(content.length - chunkSize)).digest('hex'));

  // 将三个部分的哈希组合起来再做一次哈希
  return crypto.createHash('sha256').update(hashParts.join('|')).digest('hex');
}

/**
 * 带 mtime 优化的文件哈希计算
 * @param {string} content - 文件内容
 * @param {number} mtime - 文件修改时间戳
 * @returns {Object} 包含内容哈希和修改时间的对象
 */
function computeFileHashWithMtime(content, mtime) {
  const contentHash = computeIncrementalHash(content);
  const mtimeHash = crypto.createHash('sha256').update(mtime.toString()).digest('hex');

  return {
    contentHash,
    mtime,
    combinedHash: crypto.createHash('sha256').update(contentHash + mtime.toString()).digest('hex')
  };
}

/**
 * 比较两个文件哈希
 * @param {Object} hash1 - 第一个文件哈希对象
 * @param {Object} hash2 - 第二个文件哈希对象
 * @returns {boolean} 如果文件相同则返回 true
 */
function compareFileHashes(hash1, hash2) {
  if (!hash1 || !hash2) {
    return false;
  }

  // 优先比较组合哈希
  if (hash1.combinedHash && hash2.combinedHash) {
    return hash1.combinedHash === hash2.combinedHash;
  }

  // 如果有 mtime，同时比较内容哈希和 mtime
  if (hash1.mtime && hash2.mtime) {
    return hash1.contentHash === hash2.contentHash && hash1.mtime === hash2.mtime;
  }

  // 仅比较内容哈希
  return hash1.contentHash === hash2.contentHash;
}

/**
 * 批量原子写入文件
 * @param {Object} files - 文件路径和内容的对象 {filePath: content}
 * @returns {Promise<boolean>} 成功返回 true，失败返回 false
 */
async function atomicWriteFiles(files) {
  const tempFiles = [];
  const rollbackActions = [];

  try {
    // 1. 为每个文件创建临时文件
    for (const [filePath, content] of Object.entries(files)) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true }); // 确保目录存在

      // 创建临时文件
      const tempPath = `${filePath}.${Date.now()}.tmp`;
      await fs.writeFile(tempPath, content, 'utf8');
      tempFiles.push({ filePath, tempPath });
    }

    // 2. 对每个临时文件执行 fsync 以确保数据落盘（如果系统支持）
    for (const { tempPath } of tempFiles) {
      const fd = await fs.open(tempPath, 'r+');
      try {
        await fd.sync(); // 执行 fsync
      } catch (syncError) {
        // 某些系统（如Windows）可能不支持fsync，记录警告但不中断流程
        console.warn(`Warning: Failed to sync file ${tempPath}:`, syncError.message);
      } finally {
        await fd.close();
      }
    }

    // 3. 将临时文件重命名为目标文件（原子操作）
    for (const { filePath, tempPath } of tempFiles) {
      await fs.rename(tempPath, filePath);
      rollbackActions.push(() => fs.rename(filePath, tempPath)); // 回滚操作：重命名回来
    }

    // 4. 执行父目录的 fsync 以确保目录更改落盘（如果系统支持）
    for (const { filePath } of tempFiles) {
      const dir = path.dirname(filePath);
      const dirFd = await fs.open(dir, 'r');
      try {
        await dirFd.sync();
      } catch (syncError) {
        // 某些系统（如Windows）可能不支持fsync，记录警告但不中断流程
        console.warn(`Warning: Failed to sync directory ${dir}:`, syncError.message);
      } finally {
        await dirFd.close();
      }
    }

    return true;
  } catch (error) {
    console.error('Atomic write failed, attempting rollback:', error);

    // 执行回滚操作
    for (const rollbackAction of rollbackActions) {
      try {
        await rollbackAction();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    // 删除临时文件
    for (const { tempPath } of tempFiles) {
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        console.error('Failed to remove temp file:', unlinkError);
      }
    }

    throw error;
  }
}

/**
 * 清理陈旧的临时文件
 * @param {string} directory - 要清理的目录
 * @param {number} maxAge - 临时文件的最大年龄（毫秒），默认 24 小时
 * @returns {Promise<number>} 清理的文件数量
 */
async function cleanupStaleTempFiles(directory, maxAge = 24 * 60 * 60 * 1000) {
  let cleanedCount = 0;

  try {
    const files = await fs.readdir(directory, { withFileTypes: true });

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.tmp')) {
        const filePath = path.join(directory, file.name);
        const stat = await fs.stat(filePath);

        const age = Date.now() - stat.mtime.getTime();
        if (age > maxAge) {
          await fs.unlink(filePath);
          cleanedCount++;
          console.log(`Cleaned up stale temp file: ${filePath}`);
        }
      } else if (file.isDirectory()) {
        // 递归清理子目录
        const subDirCleaned = await cleanupStaleTempFiles(path.join(directory, file.name), maxAge);
        cleanedCount += subDirCleaned;
      }
    }
  } catch (error) {
    console.error('Error during temp file cleanup:', error);
  }

  return cleanedCount;
}

/**
 * 使用 fs.access() 检查文件是否存在（避免 fs.exists() 的竞态条件问题）
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 文件存在返回 true，否则返回 false
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  computeFileHash,
  computeIncrementalHash,
  computeFileHashWithMtime,
  compareFileHashes,
  atomicWriteFiles,
  cleanupStaleTempFiles,
  fileExists
};