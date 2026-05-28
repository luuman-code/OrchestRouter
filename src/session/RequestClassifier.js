class RequestClassifier {
  constructor() {
    // 定义请求类型枚举
    this.REQUEST_TYPES = {
      NEW_TASK: 'NEW_TASK',           // 新任务
      FEATURE_ADD: 'FEATURE_ADD',     // 功能添加
      BUG_FIX: 'BUG_FIX',             // Bug修复
      CODE_MODIFY: 'CODE_MODIFY',     // 代码修改
      CONFLICT_FIX: 'CONFLICT_FIX',   // 冲突修复
      OPTIMIZATION: 'OPTIMIZATION',   // 优化
      QUERY: 'QUERY',                 // 查询
      UNKNOWN: 'UNKNOWN'              // 未知类型
    };

    // 定义关键词映射，用于判断请求类型
    this.KEYWORD_MAP = {
      [this.REQUEST_TYPES.NEW_TASK]: [
        'create', 'build', 'develop', 'implement', 'make', 'design', 'setup',
        'new', 'initial', 'from scratch', 'start', 'begin'
      ],
      [this.REQUEST_TYPES.FEATURE_ADD]: [
        'add', 'enhance', 'extend', 'improve', 'feature', 'functionality',
        'capability', 'support for', 'integrate', 'include', 'enable'
      ],
      [this.REQUEST_TYPES.BUG_FIX]: [
        'fix', 'bug', 'error', 'issue', 'problem', 'resolve', 'correct',
        'patch', 'repair', 'troubleshoot', 'debug', 'broken', 'fail'
      ],
      [this.REQUEST_TYPES.CODE_MODIFY]: [
        'modify', 'change', 'update', 'refactor', 'rewrite', 'adjust',
        'tweak', 'alter', 'redesign', 'revise', 'edit', 'optimize'
      ],
      [this.REQUEST_TYPES.CONFLICT_FIX]: [
        'conflict', 'merge conflict', 'overwritten', 'lost', 'missing',
        'restore', 'recover', 'reconcile', 'discrepancy', 'inconsistency',
        'revert', 'rollback', 'undo', 'duplicate', 'overwrite'
      ],
      [this.REQUEST_TYPES.OPTIMIZATION]: [
        'optimize', 'performance', 'speed', 'efficiency', 'memory',
        'reduce', 'improve speed', 'faster', 'better', 'clean up',
        'refine', 'polish', 'streamline', 'enhance performance'
      ],
      [this.REQUEST_TYPES.QUERY]: [
        'what', 'how', 'explain', 'describe', 'tell me', 'show', 'find',
        'search', 'information', 'details', 'query', 'lookup', 'check'
      ]
    };
  }

  /**
   * 分类请求类型
   * @param {string} requestText - 请求文本内容
   * @returns {Object} 包含请求类型和置信度的对象
   */
  classifyRequest(requestText) {
    if (!requestText || typeof requestText !== 'string') {
      return {
        type: this.REQUEST_TYPES.UNKNOWN,
        confidence: 0,
        reason: 'Invalid or empty request text'
      };
    }

    // 转换为小写以便匹配
    const lowerText = requestText.toLowerCase().trim();

    // 统计每种类型的匹配次数
    const matches = {};
    let totalMatches = 0;

    for (const [type, keywords] of Object.entries(this.KEYWORD_MAP)) {
      let typeMatches = 0;

      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          typeMatches++;
        }
      }

      if (typeMatches > 0) {
        matches[type] = typeMatches;
        totalMatches += typeMatches;
      }
    }

    // 如果没有任何匹配，返回未知类型
    if (totalMatches === 0) {
      return {
        type: this.REQUEST_TYPES.UNKNOWN,
        confidence: 0,
        reason: 'No matching keywords found',
        matches: {}
      };
    }

    // 找到匹配最多的类型
    let dominantType = this.REQUEST_TYPES.UNKNOWN;
    let maxMatches = 0;

    for (const [type, count] of Object.entries(matches)) {
      if (count > maxMatches) {
        maxMatches = count;
        dominantType = type;
      }
    }

    // 计算置信度（匹配数占总数的比例）
    const confidence = totalMatches > 0 ? maxMatches / totalMatches : 0;

    return {
      type: dominantType,
      confidence: parseFloat(confidence.toFixed(2)),
      reason: `Matched ${maxMatches} keywords for ${dominantType}`,
      matches: matches
    };
  }

  /**
   * 判断请求是否为冲突修复类型
   * @param {string} requestText - 请求文本内容
   * @returns {boolean} 是否为冲突修复请求
   */
  isConflictFixRequest(requestText) {
    const classification = this.classifyRequest(requestText);
    return classification.type === this.REQUEST_TYPES.CONFLICT_FIX;
  }

  /**
   * 获取所有请求类型
   * @returns {Array} 所有请求类型数组
   */
  getRequestTypes() {
    return Object.values(this.REQUEST_TYPES);
  }

  /**
   * 解析请求内容，提取相关信息
   * @param {string} requestText - 请求文本内容
   * @returns {Object} 解析出的相关信息
   */
  parseRequestDetails(requestText) {
    if (!requestText || typeof requestText !== 'string') {
      return {
        entities: [],
        actions: [],
        targets: [],
        constraints: []
      };
    }

    // 简单的实体抽取（文件名、模块名等）
    const filePattern = /(?:\w+\/)*\w+\.(?:js|ts|jsx|tsx|py|java|cpp|html|css|json|md)/gi;
    const entityPattern = /(class|function|method|variable|module|component)\s+(\w+)/gi;
    const actionPattern = /(add|remove|modify|create|delete|update|fix|change|implement|improve)\s+(.+?)(?:\s|$)/gi;

    const files = requestText.match(filePattern) || [];
    const entities = [];
    let match;

    // 抽取实体
    while ((match = entityPattern.exec(requestText)) !== null) {
      entities.push({
        type: match[1],
        name: match[2]
      });
    }

    // 抽取动作
    const actions = [];
    const actionTypes = ['add', 'remove', 'modify', 'create', 'delete', 'update', 'fix', 'change', 'implement', 'improve'];
    const words = requestText.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      if (actionTypes.includes(words[i])) {
        const action = {
          verb: words[i],
          target: words[i + 1] || ''
        };
        actions.push(action);
      }
    }

    return {
      entities: entities,
      actions: actions,
      targets: files,
      constraints: [] // 暂时空，可以进一步扩展以识别约束条件
    };
  }
}

module.exports = RequestClassifier;