/**
 * TF-IDF (Term Frequency-Inverse Document Frequency) 实现
 * 用于计算文档间的相似度
 */

/**
 * 计算词频 (Term Frequency)
 * @param {Array<string>} terms - 文档中的词项数组
 * @returns {Map<string, number>} 词频映射
 */
function computeTermFrequency(terms) {
  const tf = new Map();
  const len = terms.length;

  for (const term of terms) {
    tf.set(term, (tf.get(term) || 0) + 1);
  }

  // 归一化词频
  for (const [term, count] of tf) {
    tf.set(term, count / len);
  }

  return tf;
}

/**
 * 计算逆文档频率 (Inverse Document Frequency)
 * @param {Array<Array<string>>} documents - 文档集合
 * @returns {Map<string, number>} IDF映射
 */
function computeInverseDocumentFrequency(documents) {
  const idf = new Map();
  const numDocuments = documents.length;

  // 统计包含每个词项的文档数量
  const termDocCount = new Map();

  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of uniqueTerms) {
      termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
    }
  }

  // 计算IDF值
  for (const [term, count] of termDocCount) {
    // 添加平滑处理避免 log(1)=0 的情况
    idf.set(term, Math.log((numDocuments + 1) / (count + 1)) + 0.1);
  }

  return idf;
}

/**
 * 计算TF-IDF向量
 * @param {Array<string>} terms - 文档中的词项数组
 * @param {Map<string, number>} idfMap - IDF映射
 * @returns {Map<string, number>} TF-IDF向量
 */
function computeTfIdfVector(terms, idfMap) {
  const tf = computeTermFrequency(terms);
  const tfidf = new Map();

  for (const [term, tfValue] of tf) {
    const idfValue = idfMap.get(term) || 0;
    tfidf.set(term, tfValue * idfValue);
  }

  return tfidf;
}

/**
 * 计算两个TF-IDF向量的余弦相似度
 * @param {Map<string, number>} vec1 - 第一个TF-IDF向量
 * @param {Map<string, number>} vec2 - 第二个TF-IDF向量
 * @returns {number} 余弦相似度 (0-1)
 */
function cosineSimilarity(vec1, vec2) {
  const terms1 = Array.from(vec1.keys());
  const terms2 = Array.from(vec2.keys());
  const allTerms = new Set([...terms1, ...terms2]);

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const term of allTerms) {
    const val1 = vec1.get(term) || 0;
    const val2 = vec2.get(term) || 0;

    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 完整的TF-IDF相似度计算类
 */
class TfidfCalculator {
  constructor() {
    this.documents = [];
    this.idfMap = new Map();
    this.vocabulary = new Set();
  }

  /**
   * 添加文档到语料库
   * @param {Array<string>} terms - 文档的词项数组
   * @param {string|number} docId - 文档标识符
   */
  addDocument(terms, docId) {
    this.documents.push({ terms, docId });

    // 更新词汇表
    for (const term of terms) {
      this.vocabulary.add(term);
    }
  }

  /**
   * 重新计算IDF值
   */
  recalculateIdf() {
    if (this.documents.length === 0) {
      this.idfMap = new Map();
      return;
    }

    this.idfMap = computeInverseDocumentFrequency(
      this.documents.map(doc => doc.terms)
    );
  }

  /**
   * 计算两个文档之间的相似度
   * @param {Array<string>} terms1 - 第一个文档的词项数组
   * @param {Array<string>} terms2 - 第二个文档的词项数组
   * @returns {number} 相似度分数 (0-1)
   */
  calculateSimilarity(terms1, terms2) {
    // 如果还没有计算IDF或语料库为空，使用简化的计算方式
    if (this.idfMap.size === 0 || this.documents.length === 0) {
      // 临时计算IDF用于当前比较
      const tempDocs = [terms1, terms2];
      const tempIdf = computeInverseDocumentFrequency(tempDocs);

      const vec1 = computeTfIdfVector(terms1, tempIdf);
      const vec2 = computeTfIdfVector(terms2, tempIdf);

      return cosineSimilarity(vec1, vec2);
    }

    // 使用全局IDF计算向量
    const vec1 = computeTfIdfVector(terms1, this.idfMap);
    const vec2 = computeTfIdfVector(terms2, this.idfMap);

    return cosineSimilarity(vec1, vec2);
  }

  /**
   * 批量计算相似度矩阵
   * @param {Array<Array<string>>} allTerms - 所有文档的词项数组
   * @returns {Array<Array<number>>} 相似度矩阵
   */
  calculateSimilarityMatrix(allTerms) {
    const matrix = [];

    for (let i = 0; i < allTerms.length; i++) {
      const row = [];
      for (let j = 0; j < allTerms.length; j++) {
        if (i === j) {
          row.push(1.0); // 自己与自己的相似度为1
        } else {
          const similarity = this.calculateSimilarity(allTerms[i], allTerms[j]);
          row.push(similarity);
        }
      }
      matrix.push(row);
    }

    return matrix;
  }

  /**
   * 获取文档向量
   * @param {Array<string>} terms - 文档的词项数组
   * @returns {Map<string, number>} TF-IDF向量
   */
  getDocumentVector(terms) {
    return computeTfIdfVector(terms, this.idfMap);
  }

  /**
   * 清空语料库
   */
  clear() {
    this.documents = [];
    this.idfMap = new Map();
    this.vocabulary = new Set();
  }
}

module.exports = {
  computeTermFrequency,
  computeInverseDocumentFrequency,
  computeTfIdfVector,
  cosineSimilarity,
  TfidfCalculator
};