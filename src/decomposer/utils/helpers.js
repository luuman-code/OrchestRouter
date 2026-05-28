/**
 * 通用辅助函数
 */

/**
 * 文本预处理 - 移除停用词和特殊字符
 * 支持中英文混合文本分词
 * @param {string} text - 输入文本
 * @param {Array} stopWords - 停用词列表
 * @returns {Array} 处理后的词语数组
 */
function preprocessText(text, stopWords = []) {
  if (!text) return [];

  const result = [];
  const stopSet = new Set(stopWords.map(w => w.toLowerCase()));

  // 检测文本是否包含中文
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  if (hasChinese) {
    // 混合中英文处理策略
    // 1. 先按英文标点分割
    const segments = text.toLowerCase().split(/[\s,\.\!\?\;\:]+/);

    for (const segment of segments) {
      if (!segment) continue;

      if (/[\u4e00-\u9fa5]/.test(segment)) {
        // 中文片段：提取 2-3 字符的滑动窗口（中文词通常 2-4 个字符）
        const chineseWords = extractChineseNgrams(segment, stopSet);
        result.push(...chineseWords);
      } else if (/[a-zA-Z]/.test(segment)) {
        // 英文/拼音片段
        const englishWords = segment.split(/[_-]/).filter(w => w.length > 0);
        for (const word of englishWords) {
          if (!stopSet.has(word) && word.length > 0) {
            result.push(word);
          }
        }
      }
    }
  } else {
    // 纯英文处理
    const words = text.toLowerCase()
      .split(/[\s,\.\!\?\;\:]+/)
      .filter(word => word.length > 0);

    for (const word of words) {
      // 进一步分割连字符词
      const subWords = word.split(/[_-]/);
      for (const subWord of subWords) {
        if (!stopSet.has(subWord) && subWord.length > 0) {
          result.push(subWord);
        }
      }
    }
  }

  return result;
}

/**
 * 从中文文本中提取 n-gram 词组
 * 使用滑动窗口提取 2-4 字符的组合
 * @private
 */
function extractChineseNgrams(text, stopSet) {
  const result = [];
  const cleanText = text.replace(/[^\u4e00-\u9fa5]/g, '');

  if (cleanText.length < 2) return [];

  // 提取 2-4 字符的组合（中文词通常 2-4 个字符）
  for (let len = 2; len <= 4 && len <= cleanText.length; len++) {
    for (let i = 0; i <= cleanText.length - len; i++) {
      const ngram = cleanText.substring(i, i + len);
      if (!stopSet.has(ngram) && !isCommonChineseStop(ngram)) {
        result.push(ngram);
      }
    }
  }

  return result;
}

/**
 * 检查是否为常见中文停用词/单字
 * @private
 */
function isCommonChineseStop(str) {
  const commonStops = new Set([
    '的', '了', '是', '在', '和', '与', '及', '等', '为', '与', '或',
    '一', '不', '也', '就', '都', '而', '及', '着', '或', '一个',
    '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '如何'
  ]);
  return commonStops.has(str);
}

/**
 * 计算两个数组的交集
 * @param {Array} arr1 - 数组1
 * @param {Array} arr2 - 数组2
 * @returns {Array} 交集数组
 */
function intersection(arr1, arr2) {
  return arr1.filter(value => arr2.includes(value));
}

/**
 * 计算两个数组的并集
 * @param {Array} arr1 - 数组1
 * @param {Array} arr2 - 数组2
 * @returns {Array} 并集数组
 */
function union(arr1, arr2) {
  return [...new Set([...arr1, ...arr2])];
}

/**
 * 计算Jaccard相似度
 * @param {Array} arr1 - 数组1
 * @param {Array} arr2 - 数组2
 * @returns {number} 相似度 (0-1)
 */
function jaccardSimilarity(arr1, arr2) {
  const intersect = intersection(arr1, arr2);
  const unionArr = union(arr1, arr2);

  if (unionArr.length === 0) return 0;

  return intersect.length / unionArr.length;
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 提取文本中的 n-gram 短语（连续关键词组合）
 * 支持中英文混合
 * @param {string} text - 输入文本
 * @param {number} n - n-gram 大小（默认2，检测双词组合）
 * @returns {Array} n-gram 短语数组
 */
function extractNgrams(text, n = 2) {
  if (!text) return [];

  const words = preprocessText(text, []);
  if (words.length < n) return [];

  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }

  return ngrams;
}

/**
 * 计算 n-gram 相似度（检测连续短语匹配）
 * @param {Array} keywords1 - 关键词数组1
 * @param {Array} keywords2 - 关键词数组2
 * @param {number} n - n-gram 大小
 * @returns {number} 相似度 (0-1)
 */
function ngramSimilarity(keywords1, keywords2, n = 2) {
  // 生成 n-gram
  const ngrams1 = extractNgrams(keywords1.join(' '), n);
  const ngrams2 = extractNgrams(keywords2.join(' '), n);

  if (ngrams1.length === 0 || ngrams2.length === 0) return 0;

  const intersect = intersection(ngrams1, ngrams2);
  const unionArr = union(ngrams1, ngrams2);

  return intersect.length / unionArr.length;
}

module.exports = {
  preprocessText,
  intersection,
  union,
  jaccardSimilarity,
  generateId,
  extractNgrams,
  ngramSimilarity
};