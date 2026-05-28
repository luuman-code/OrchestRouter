/**
 * 任务复杂度分析器
 *
 * 实现混合式任务复杂度判断机制，结合关键词匹配和LLM语义分析
 */
class TaskComplexityAnalyzer {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      useLLM: true,
      confidenceThresholds: {
        high: 0.8,
        medium: 0.5
      },
      llmConfig: {
        base_url: 'http://localhost:11434',
        model: 'qwen2.5:3b',
        timeout: 30000,
        temperature: 0.1,
        maxTokens: 1024
      },
      fallback: {
        onLLMError: 'rule_based',
        cacheEnabled: true,
        cacheExpiration: 3600000 // 1 hour
      },
      ...config
    };

    // 初始化 LLM 客户端
    this.llmClient = config.llmClient || null;

    // 模型状态广播器
    this.modelStatusBroadcaster = config.modelStatusBroadcaster || null;
    this.availableModels = [];

    // 注册到广播器
    if (this.modelStatusBroadcaster) {
      this.modelStatusBroadcaster.register('TaskComplexityAnalyzer', (statusMap) => {
        this.updateModelStatus(statusMap);
      });
    }

    // 简单任务关键词
    this.simpleKeywords = [
      '解释', 'explain', '翻译', 'translate', '总结', 'summarize',
      '分析', 'analyze', '为什么', 'why', '是什么', 'what', '怎么', 'how',
      '改错', '修复', 'debug', 'bug', '错误', '问题', 'error', 'issue',
      '什么是', '介绍一下', '简单说明', 'tell me', 'what is', 'how to',
      'help', 'please', '请', '你好', 'hello', 'hi'
    ];

    // 复杂任务关键词
    this.complexKeywords = [
      '开发', 'create', 'build', 'implement', '实现', '功能', 'feature',
      '模块', 'module', '系统', 'system', '应用', 'app', 'application',
      '页面', 'page', '组件', 'component', '界面', 'interface',
      '多个', 'multiple', '一系列', 'series of', '完整', 'complete',
      '完整功能', '一套', '一套功能', '项目', 'project', '架构', 'architecture',
      '包含', '包括', '博客', '电商', '管理系统', '平台', '网站', '后端', '前端',
      'API', 'api', '服务', '服务', '服务端', '客户端', '用户', '用户',
      '评论', '登录', '注册', '认证', '权限', '数据库', '数据库'
    ];

    // 简单问题模式（正则表达式）
    this.simplePatterns = [
      /^什么是/,           // "什么是 XXX"
      /^请解释/,           // "请解释 XXX"
      /^介绍一下/,         // "介绍一下 XXX"
      /^怎么使用/,         // "怎么使用 XXX"
      /^如何使用/,         // "如何使用 XXX"
      /.* 是什么意思/,      // "XXX 是什么意思"
      /^翻译/,             // "翻译 XXX"
      /.* 翻译成/,          // "把 XXX 翻译成 YYY"
      /^分析/,             // "分析 XXX"
      /.* 有什么用/,        // "XXX 有什么用"
      /.* 怎么做/,          // "XXX 怎么做"
      /.* 是什么/,          // "XXX 是什么"
    ];

    // 缓存存储
    this.cache = new Map();

    // LLM 分析提示词模板
    this.COMPLEXITY_ANALYSIS_PROMPT = `请分析以下用户请求的任务复杂度。

任务描述：{userMessage}

请判断这是一个简单任务还是复杂任务，并说明理由。

简单任务的特征：
- 问答类问题（如"什么是 XXX"、"为什么 XXX"）
- 解释说明类请求
- 翻译、总结、分析类请求
- 简单的代码修复或调试

复杂任务的特征：
- 需要创建多个组件或文件
- 涉及多个功能模块
- 需要系统设计或架构规划
- 包含多个子任务的综合性需求

请只返回以下 JSON 格式：
{
  "isComplex": true/false,
  "confidence": 0.0-1.0,
  "reason": "判断理由",
  "suggestedAction": "decompose/forward"
}`;
  }

  /**
   * 主分析方法
   */
  async analyze(userMessage) {
    // 检查缓存
    const cacheKey = this._generateCacheKey(userMessage);
    if (this.config.fallback.cacheEnabled) {
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult && Date.now() - cachedResult.timestamp < this.config.fallback.cacheExpiration) {
        return cachedResult.data;
      }
    }

    // 1. 快速规则过滤
    const ruleResult = this._ruleBasedAnalysis(userMessage);

    // 2. 置信度评估
    const confidence = this._calculateConfidence(ruleResult);

    // 3. 根据置信度决定策略
    let finalResult;
    if (confidence >= this.config.confidenceThresholds.high) {
      finalResult = {
        ...ruleResult,
        confidence,
        method: 'rule_based',
        reason: ruleResult.reason || '基于高置信度规则匹配'
      };
    } else if (confidence >= this.config.confidenceThresholds.medium) {
      // 中等置信度 - 使用轻量 LLM 验证
      finalResult = await this._enhanceWithLLM(userMessage, ruleResult, confidence);
    } else {
      // 低置信度 - 使用完整 LLM 分析
      finalResult = await this._fullLLMAnalysis(userMessage);
    }

    // 存储到缓存
    if (this.config.fallback.cacheEnabled) {
      this.cache.set(cacheKey, {
        data: finalResult,
        timestamp: Date.now()
      });
    }

    return finalResult;
  }

  /**
   * 基于规则的分析
   */
  _ruleBasedAnalysis(userMessage) {
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return {
        isComplex: false,
        confidence: 1.0,
        reason: '空输入或无效输入',
        method: 'rule_based_empty_check'
      };
    }

    // 检查是否是复杂任务
    const isComplex = this.complexKeywords.some(kw =>
      userMessage.toLowerCase().includes(kw.toLowerCase())
    );

    const isSimple = this.simpleKeywords.some(kw =>
      userMessage.toLowerCase().includes(kw.toLowerCase())
    );

    // 检查是否匹配简单问题模式
    const matchesSimplePattern = this.simplePatterns.some(pattern => pattern.test(userMessage));

    // 如果是简单问题或匹配简单模式，不需要分解
    if ((isSimple && !isComplex) || matchesSimplePattern) {
      return {
        isComplex: false,
        confidence: isSimple && !isComplex ? 0.9 : 0.85,
        reason: `检测到简单任务模式 (simple=${isSimple}, pattern=${matchesSimplePattern})`,
        method: 'rule_based_simple_detection'
      };
    }

    // 如果包含多个功能点（如"，"和"、"字符出现多次），则认为是复杂任务
    const separatorCount = (userMessage.match(/[，,、]/g) || []).length;
    if (separatorCount >= 2) {  // 如果有至少两个分隔符，认为包含多个功能点
      return {
        isComplex: true,
        confidence: Math.min(0.8, 0.5 + (separatorCount * 0.1)), // 置信度随分隔符数量增加
        reason: `检测到 ${separatorCount} 个分隔符，认为包含多个功能点`,
        method: 'rule_based_separator_count'
      };
    }

    // 如果请求体很大（上下文长），可能需要分解
    if (userMessage.length > 1000) {
      return {
        isComplex: true,
        confidence: 0.7,
        reason: '长文本内容，可能需要分解',
        method: 'rule_based_long_text'
      };
    }

    // 最终判断
    if (isComplex) {
      return {
        isComplex: true,
        confidence: 0.75,
        reason: '检测到复杂任务关键词',
        method: 'rule_based_keyword_match'
      };
    } else {
      return {
        isComplex: false,
        confidence: 0.6,
        reason: '未检测到复杂任务关键词，默认为简单任务',
        method: 'rule_based_default_fallback'
      };
    }
  }

  /**
   * 置信度计算
   */
  _calculateConfidence(ruleResult) {
    // 如果置信度已经在结果中，则直接返回
    if (typeof ruleResult.confidence === 'number') {
      return ruleResult.confidence;
    }

    // 基于方法类型估算置信度
    const method = ruleResult.method || '';
    if (method.includes('empty_check') || method.includes('simple_detection')) {
      return 0.9; // 高置信度
    } else if (method.includes('separator_count') || method.includes('long_text')) {
      return 0.7; // 中等置信度
    } else {
      return 0.5; // 低置信度（默认情况）
    }
  }

  /**
   * LLM 增强分析（中等置信度）
   */
  async _enhanceWithLLM(userMessage, ruleResult, baseConfidence) {
    if (!this.config.useLLM || !this.llmClient) {
      // 如果 LLM 不可用，返回规则结果
      return {
        ...ruleResult,
        confidence: baseConfidence,
        method: 'llm_enhanced_rule_fallback'
      };
    }

    try {
      // 调用 LLM 进行增强分析
      const llmPrompt = `请判断以下任务是简单任务还是复杂任务：\n\n任务: ${userMessage}\n\n原始判断: ${ruleResult.isComplex ? '复杂' : '简单'}\n请确认或修正这个判断。`;

      const llmResponse = await this._callLLM(llmPrompt);

      // 解析 LLM 响应
      let parsedResponse = null;

      try {
        // 尝试解析 JSON 响应
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          // 如果没有找到 JSON，抛出错误进入 catch 块
          throw new Error('No JSON found in LLM response');
        }
      } catch (e) {
        // 如果无法解析 JSON，尝试从文本中提取关键信息（支持中英文）
        const responseLower = llmResponse.toLowerCase();

        // 复杂任务关键词（中英文）
        const complexKeywords = [
          'complex', 'true', '需要分解', '复杂任务', '这是一个复杂',
          '多模块', '多文件', '系统设计', '架构'
        ];

        // 简单任务关键词（中英文）
        const simpleKeywords = [
          'simple', 'false', '简单任务', '这是一个简单',
          '问答', '解释', '说明', '翻译', '总结'
        ];

        const hasComplexKeyword = complexKeywords.some(kw => responseLower.includes(kw.toLowerCase()));
        const hasSimpleKeyword = simpleKeywords.some(kw => responseLower.includes(kw.toLowerCase()));

        // 优先使用关键词判断，如果都没有则根据原始判断
        let isComplex;
        if (hasSimpleKeyword && !hasComplexKeyword) {
          isComplex = false;
        } else if (hasComplexKeyword && !hasSimpleKeyword) {
          isComplex = true;
        } else {
          // 如果都有或都没有，保持原始判断
          isComplex = ruleResult.isComplex;
        }

        parsedResponse = {
          isComplex,
          confidence: 0.75,
          reason: `LLM 文本分析：${llmResponse.substring(0, 80)}...`
        };
      }

      if (parsedResponse) {
        // 融合 LLM 和规则的结果
        const llmConfidence = parsedResponse.confidence || 0.7;
        const finalConfidence = (baseConfidence + llmConfidence) / 2;

        return {
          isComplex: parsedResponse.isComplex,
          confidence: finalConfidence,
          reason: parsedResponse.reason || `LLM 验证: ${ruleResult.reason}`,
          method: 'llm_enhanced'
        };
      } else {
        // LLM 无法提供明确结果，返回规则结果
        return {
          ...ruleResult,
          confidence: baseConfidence,
          method: 'llm_enhanced_no_response'
        };
      }
    } catch (error) {
      console.warn('LLM 增强分析失败，回退到规则方法:', error.message);
      return {
        ...ruleResult,
        confidence: baseConfidence,
        method: 'llm_enhanced_error_fallback'
      };
    }
  }

  /**
   * 完整 LLM 分析（低置信度）
   */
  async _fullLLMAnalysis(userMessage) {
    if (!this.config.useLLM || !this.llmClient) {
      // 如果 LLM 不可用，根据规则默认判断
      return {
        isComplex: false,
        confidence: 0.3,
        reason: 'LLM 不可用，使用保守判断',
        method: 'llm_full_fallback'
      };
    }

    try {
      // 使用完整的提示词进行分析
      const prompt = this.COMPLEXITY_ANALYSIS_PROMPT.replace('{userMessage}', userMessage);

      const llmResponse = await this._callLLM(prompt);

      // 尝试解析 JSON 响应
      let parsedResponse = null;
      try {
        // 查找 JSON 部分
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // 如果无法解析 JSON，使用默认解析（支持中英文）
        const responseLower = llmResponse.toLowerCase();

        // 复杂任务关键词（中英文）
        const complexKeywords = [
          'complex', 'true', '需要分解', '复杂任务', '这是一个复杂',
          '多模块', '多文件', '系统设计', '架构', '分解'
        ];

        // 简单任务关键词（中英文）
        const simpleKeywords = [
          'simple', 'false', '简单任务', '这是一个简单',
          '问答', '解释', '说明', '翻译', '总结'
        ];

        const hasComplexKeyword = complexKeywords.some(kw => responseLower.includes(kw.toLowerCase()));
        const hasSimpleKeyword = simpleKeywords.some(kw => responseLower.includes(kw.toLowerCase()));

        // 优先使用关键词判断
        let isComplex;
        if (hasSimpleKeyword && !hasComplexKeyword) {
          isComplex = false;
        } else if (hasComplexKeyword && !hasSimpleKeyword) {
          isComplex = true;
        } else {
          // 如果都有或都没有，默认为简单任务
          isComplex = false;
        }

        parsedResponse = {
          isComplex,
          confidence: 0.6,
          reason: `LLM 完整分析: ${llmResponse.substring(0, 100)}...`,
          suggestedAction: isComplex ? 'decompose' : 'forward'
        };
      }

      if (parsedResponse) {
        return {
          isComplex: parsedResponse.isComplex,
          confidence: parsedResponse.confidence || 0.6,
          reason: parsedResponse.reason || 'LLM 完整分析结果',
          method: 'llm_full_analysis',
          suggestedAction: parsedResponse.suggestedAction || (parsedResponse.isComplex ? 'decompose' : 'forward')
        };
      } else {
        return {
          isComplex: false, // 保守起见，默认为简单任务
          confidence: 0.4,
          reason: 'LLM 未能提供明确分析结果',
          method: 'llm_full_no_clear_result'
        };
      }
    } catch (error) {
      console.warn('完整 LLM 分析失败，使用回退策略:', error.message);

      // 根据配置决定回退策略
      if (this.config.fallback.onLLMError === 'rule_based') {
        const ruleResult = this._ruleBasedAnalysis(userMessage);
        return {
          ...ruleResult,
          method: 'llm_full_error_fallback_to_rules'
        };
      } else {
        return {
          isComplex: false,
          confidence: 0.3,
          reason: `LLM 分析失败，使用默认简单任务判断: ${error.message}`,
          method: 'llm_full_error_default'
        };
      }
    }
  }

  /**
   * 调用 LLM
   */
  async _callLLM(prompt) {
    if (!this.llmClient) {
      throw new Error('LLM 客户端未初始化');
    }

    // LLMClient.chat 方法接受 (prompt 字符串，options 对象) 参数
    // 参考 LLMClient.js:32-63
    const response = await this.llmClient.chat(prompt, {
      model: this.config.llmConfig.model,
      temperature: this.config.llmConfig.temperature,
      maxTokens: this.config.llmConfig.maxTokens
    });

    return response || '';
  }

  /**
   * 生成缓存键
   */
  _generateCacheKey(userMessage) {
    // 简单的哈希生成，实际项目中可能需要更复杂的缓存键生成策略
    let hash = 0;
    for (let i = 0; i < userMessage.length; i++) {
      const char = userMessage.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // 转换为32位整数
    }
    return `${hash}_${userMessage.length}`;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 更新模型状态
   */
  updateModelStatus(statusMap) {
    if (!statusMap) {
      this.availableModels = [];
      return;
    }
    const available = Object.entries(statusMap)
      .filter(([modelId, status]) => status.available)
      .map(([modelId]) => modelId);
    this.availableModels = available;
    console.log(`[TaskComplexityAnalyzer] 可用模型已更新: ${available.length} 个`);
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.config.fallback.cacheEnabled
    };
  }
}

module.exports = TaskComplexityAnalyzer;