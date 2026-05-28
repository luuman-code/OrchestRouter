/**
 * ConfigurableTypeMatcher - 多标签类型匹配器
 * 支持多类型标注、置信度计算和多种匹配策略
 */

const TaskTypeDefinition = require('./TaskTypeDefinition');

class ConfigurableTypeMatcher {
  constructor(config = {}) {
    this.typeDefinition = new TaskTypeDefinition(config.configPath);
    this.matchingConfig = this.typeDefinition.getMatchingConfig();
    this.minConfidence = this.matchingConfig.minConfidence || 0.3;
    this.strategy = this.matchingConfig.combinationStrategy || 'weighted';
  }

  /**
   * 对单个 deliverable 进行多标签标注
   * @param {Object} deliverable - 要标注的交付物
   * @returns {Array} 多类型标注结果 [{type, confidence, source}]
   */
  annotateDeliverable(deliverable) {
    const results = [];
    const description = (deliverable.description || '').toLowerCase();
    const filePath = deliverable.filePath || '';
    const fileName = path.basename(filePath).toLowerCase();

    // 遍历所有任务类型进行检查
    for (const [type, meta] of Object.entries(this.typeDefinition.taskTypes)) {
      let confidence = 0;
      let source = null;

      // 1. 关键词匹配
      const keywordScore = this._matchKeywords(description, meta.keywords || []);
      if (keywordScore > 0) {
        confidence = Math.max(confidence, keywordScore * 0.7); // 关键词权重0.7
        source = source || 'keyword';
      }

      // 2. 正则匹配
      const regexScore = this._matchRegexPatterns(filePath, description, meta.regexPatterns || []);
      if (regexScore > 0) {
        confidence = Math.max(confidence, regexScore * 0.8); // 正则权重0.8
        source = source || 'regex';
      }

      // 3. 文件路径扩展名匹配
      const extScore = this._matchExtension(filePath, type);
      if (extScore > 0) {
        confidence = Math.max(confidence, extScore * 0.6);
        source = source || 'extension';
      }

      // 应用类型权重
      if (confidence > 0) {
        confidence = confidence * (meta.weight || 0.8);
      }

      // 只有超过最小置信度的才添加
      if (confidence >= this.minConfidence) {
        results.push({
          type,
          confidence: Math.min(confidence, 1.0), // 最高1.0
          source,
          label: meta.label
        });
      }
    }

    // 按置信度排序
    results.sort((a, b) => b.confidence - a.confidence);

    // 限制返回数量，最多5个类型
    return results.slice(0, 5);
  }

  /**
   * 关键词匹配
   * @param {string} text - 要匹配的文本
   * @param {Array} keywords - 关键词列表
   */
  _matchKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) return 0;

    let matchCount = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount === 0) return 0;
    return Math.min(matchCount / keywords.length + 0.3, 1.0); // 归一化
  }

  /**
   * 正则匹配
   * @param {string} filePath - 文件路径
   * @param {string} description - 描述
   * @param {Array} patterns - 正则表达式列表
   */
  _matchRegexPatterns(filePath, description, patterns) {
    if (!patterns || patterns.length === 0) return 0;

    let matchCount = 0;
    const combinedText = `${filePath} ${description}`;

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(combinedText)) {
          matchCount++;
        }
      } catch (e) {
        // 忽略无效正则
      }
    }

    if (matchCount === 0) return 0;
    return Math.min(matchCount / patterns.length + 0.3, 1.0);
  }

  /**
   * 文件扩展名匹配
   * @param {string} filePath - 文件路径
   * @param {string} type - 任务类型
   */
  _matchExtension(filePath, type) {
    // 改进的扩展名和文件名匹配
    // 只根据明确的文件名模式匹配，避免误报
    const fileNameMatchMap = {
      ui: [
        // 明确的UI文件模式
        /component\//i, /components\//i, /page\//i, /pages\//i,
        /view\//i, /views\//i, /screen\//i,
        /\.tsx$/i, /\.jsx$/i, /\.vue$/i, /\.svelte$/i
      ],
      api: [
        // API相关文件
        /router\//i, /route\//i, /api\//i,
        /controller\//i, /endpoint\//i
      ],
      logic: [
        // 业务逻辑
        /service\//i, /utils\//i, /helper\//i, /lib\//i
      ],
      model: [
        // 数据模型
        /model\//i, /entity\//i, /schema\//i, /type\//i, /types\//i
      ],
      test: [
        // 测试文件
        /\.test\./i, /\.spec\./i, /__tests__\//i, /test\//i
      ],
      style: [
        // 样式文件
        /\.css$/i, /\.scss$/i, /\.less$/i, /\.sass$/i, /style\//i
      ],
      config: [
        // 配置文件
        /\.json$/i, /\.yaml$/i, /\.yml$/i, /\.env$/i, /config\//i
      ],
      form: [
        // 表单相关 - 需要明确包含form关键词
        /form\//i, /input\//i
      ],
      auth: [
        // 认证相关 - 需要明确包含auth关键词
        /auth\//i, /login\//i, /session\//i, /oauth\//i
      ],
      database: [
        // 数据库相关
        /database\//i, /db\//i, /repository\//i, /\.sql$/i
      ],
      state: [
        // 状态管理
        /store\//i, /state\//i, /redux\//i, /zustand\//i
      ],
      i18n: [
        // 国际化
        /i18n\//i, /locale\//i, /lang\//i
      ],
      security: [
        // 安全相关
        /security\//i, /permission\//i, /role\//i
      ],
      performance: [
        // 性能优化
        /performance\//i, /optimize\//i
      ],
      devops: [
        // 运维相关
        /docker\//i, /\.dockerfile$/i, /ci\//i, /cd\//i
      ],
      docs: [
        // 文档
        /\.md$/i, /doc\//i, /docs\//
      ]
    };

    const patterns = fileNameMatchMap[type] || [];
    if (patterns.length === 0) return 0;

    const filePathLower = filePath.toLowerCase();
    for (const pattern of patterns) {
      if (pattern.test(filePathLower)) {
        return 0.8;
      }
    }

    return 0;
  }

  /**
   * 批量标注多个 deliverables
   * @param {Array} deliverables - 交付物数组
   * @returns {Array} 标注后的结果
   */
  annotateMultiple(deliverables) {
    return deliverables.map((deliverable, index) => ({
      index,
      ...deliverable,
      types: this.annotateDeliverable(deliverable)
    }));
  }

  /**
   * 计算两个类型数组的相似度
   * @param {Array} types1 - 类型数组1
   * @param {Array} types2 - 类型数组2
   */
  calculateSimilarity(types1, types2) {
    if (!types1 || types1.length === 0 || !types2 || types2.length === 0) {
      return 0;
    }

    // 转换为集合
    const set1 = new Set(types1.map(t => t.type));
    const set2 = new Set(types2.map(t => t.type));

    // Jaccard 相似度
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 根据类型获取所需能力
   * @param {Array} types - 类型数组
   */
  getRequiredCapabilities(types) {
    return this.typeDefinition.mergeTypeCapabilities(types);
  }

  /**
   * 获取匹配配置
   */
  getConfig() {
    return this.matchingConfig;
  }
}

// 引入 path 模块
const path = require('path');

module.exports = ConfigurableTypeMatcher;
