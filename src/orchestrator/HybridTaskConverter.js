#!/usr/bin/env node

/**
 * 混合任务转换器
 *
 * 结合规则匹配和 LLM 的优势：
 * - 规则匹配：快速，适用于简单明确的任务
 * - LLM：准确，适用于复杂模糊的任务
 *
 * 策略：
 * 1. 首先使用规则匹配（快速）
 * 2. 计算置信度
 * 3. 根据置信度决定：直接返回 / LLM 增强 / 完全使用 LLM
 */

class HybridTaskConverter {
  constructor(options = {}) {
    this.llmClient = options.llmClient;
    this.logLevel = options.logLevel || 'warn';

    // 模型状态广播器
    this.modelStatusBroadcaster = options.modelStatusBroadcaster || null;
    this.availableModels = [];

    // 注册到广播器
    if (this.modelStatusBroadcaster) {
      this.modelStatusBroadcaster.register('HybridTaskConverter', (statusMap) => {
        this.updateModelStatus(statusMap);
      });
    }
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
    console.log(`[HybridTaskConverter] 可用模型已更新: ${available.length} 个`);
  }

  /**
   * 主转换方法 - 自动选择最佳策略
   */
  async convert(description) {
    // 步骤 1: 规则匹配（快速）
    const ruleResult = this._convertRuleBased(description);
    const confidence = this._calculateConfidence(ruleResult);

    // 步骤 2: 根据置信度决定策略
    if (confidence >= 0.8) {
      // 高置信度：直接使用规则结果
      this._log(`规则匹配置信度：${confidence}，使用规则匹配`, 'debug');
      return {
        ...ruleResult,
        source: 'rule_based',
        confidence: confidence
      };
    }

    if (confidence >= 0.5) {
      // 中等置信度：LLM 增强
      this._log(`规则匹配置信度：${confidence}，使用 LLM 增强`, 'debug');
      return await this._enhanceWithLLM(description, ruleResult, confidence);
    }

    // 低置信度：完全使用 LLM
    this._log(`规则匹配置信度：${confidence}，使用 LLM 转换`, 'debug');
    return await this._convertWithLLM(description);
  }

  /**
   * 基于规则的转换（快速）
   */
  _convertRuleBased(description) {
    const deliverables = [];
    // 使用 Unicode 转义确保正确匹配中文标点
    // \uFF0C=， (全角逗号), \u3001=、 (顿号), \u002C=, (半角逗号), \u003B=; (半角分号), \uFF1B=； (全角分号)
    const parts = description.split(/[\uFF0C\u3001\u002C\u003B\uFF1B]|包含 | 包括 | 需要/g);

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      if (!part) continue;

      // 去除开头的"包含"等词（使用 Unicode 转义确保匹配）
      // \u5305\u542b = 包含，\u5305\u62ec = 包括，\u9700\u8981 = 需要
      part = part.replace(/^[\u5305\u542b\u5305\u62ec\u9700\u8981]+/, '').trim();
      if (!part) continue;

      const typeScores = this._scoreType(part);
      const bestType = this._getBestType(typeScores);

      if (bestType.score > 0) {
        deliverables.push({
          id: `deliverable-${Date.now()}-${i}`,
          description: part,
          type: bestType.type,
          priority: 'medium',
          ruleScore: bestType.score
        });
      } else {
        // 即使没有匹配到类型，也保留为 general
        deliverables.push({
          id: `deliverable-${Date.now()}-${i}`,
          description: part,
          type: 'general',
          priority: 'medium',
          ruleScore: 0
        });
      }
    }

    if (deliverables.length === 0) {
      deliverables.push({
        id: `deliverable-${Date.now()}`,
        description: description,
        type: 'general',
        priority: 'medium'
      });
    }

    return {
      title: description.substring(0, 50) + (description.length > 50 ? '...' : ''),
      description: description,
      deliverables: deliverables
    };
  }

  /**
   * 为文本片段评分
   */
  _scoreType(text) {
    // 扩展关键词匹配，使用 Unicode 转义确保编码一致性
    return {
      // UI 类型：界面、页面、组件、用户交互相关
      ui: this._matchKeywords(text, /(\u9875\u9762|\u754c\u9762|view|page|component|ui|frontend|\u524d\u7aef|\u6e32\u67d3|\u663e\u793a|\u5e03\u5c40|\u5bfc\u822a|\u83dc\u5355|\u8868\u5355|\u6309\u94ae|\u7ec4\u4ef6|\u4eea\u8868\u76d8|dashboard|\u56fe\u8868|chart|\u5217\u8868|\u641c\u7d22|\u6dfb\u52a0|\u7f16\u8f91|\u5220\u9664|\u7528\u6237\u7ba1\u7406|\u6587\u7ae0\u7ba1\u7406|\u5546\u54c1|\u8d2d\u7269\u8f66|\u8ba2\u5355|\u8bc4\u8bba|\u8ba4\u8bc1|\u767b\u5f55|\u6ce8\u518c|\u7ba1\u7406|\u8bc1|\u529f\u80fd)/i) ? 1 : 0,
      // API 类型：接口、后端、服务相关
      api: this._matchKeywords(text, /(api|\u63a5\u53e3|endpoint|route|backend|\u540e\u7aef|\u670d\u52a1|\u8bf7\u6c42|response|rest|graphql|\u5fae\u670d\u52a1|\u7f51\u5173|\u7cfb\u7edf)/i) ? 1 : 0,
      // Model 类型：数据模型、实体相关
      model: this._matchKeywords(text, /(\u6a21\u578b|model|schema|entity|\u6570\u636e|\u7ed3\u6784|orm|\u5b9e\u4f53|\u5b58\u50a8|\u6301\u4e45\u5316|\u6587\u7ae0|\u7528\u6237|\u5546\u54c1|\u8ba2\u5355|\u8bc4\u8bba)/i) ? 1 : 0,
      // Style 类型：样式、CSS 相关
      style: this._matchKeywords(text, /(\u6837\u5f0f|style|css|scss|design|\u4e3b\u9898|theme|\u989c\u8272|font|\u54cd\u5e94\u5f0f|\u52a8\u753b)/i) ? 1 : 0,
      // Test 类型：测试相关
      test: this._matchKeywords(text, /(\u6d4b\u8bd5|test|spec|unit|integration|e2e|\u81ea\u52a8\u5316|mock|assert|\u9a8c\u8bc1)/i) ? 1 : 0,
      // Config 类型：配置相关
      config: this._matchKeywords(text, /(\u914d\u7f6e|config|setting|\u73af\u5883|env|\u90e8\u7f72|deploy|\u53c2\u6570|\u53d8\u91cf)/i) ? 1 : 0,
      // Logic 类型：业务逻辑相关
      logic: this._matchKeywords(text, /(\u903b\u8f91|logic|algorithm|function|\u4e1a\u52a1|\u7b97\u6cd5|\u8ba1\u7b97|\u89c4\u5219|rule|\u5de5\u4f5c\u6d41|\u72b6\u6001)/i) ? 1 : 0,
      // Database 类型：数据库相关
      database: this._matchKeywords(text, /(\u6570\u636e\u5e93|database|migration|query|sql|index|transaction|crud|\u5b58\u50a8\u8fc7\u7a0b)/i) ? 1 : 0
    };
  }

  _matchKeywords(text, pattern) {
    return pattern.test(text);
  }

  _getBestType(typeScores) {
    let bestType = 'general';
    let bestScore = 0;
    for (const [type, score] of Object.entries(typeScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    return { type: bestType, score: bestScore };
  }

  /**
   * 计算置信度
   */
  _calculateConfidence(result) {
    const deliverables = result.deliverables || [];

    // 因素 1: 交付物数量
    const countScore = deliverables.length > 0 ? Math.min(deliverables.length * 0.2, 0.4) : 0;

    // 因素 2: 平均规则分数
    const avgRuleScore = deliverables.length > 0
      ? deliverables.reduce((sum, d) => sum + (d.ruleScore || 0), 0) / deliverables.length
      : 0;
    const ruleScoreFactor = Math.min(avgRuleScore * 0.15, 0.4);

    // 因素 3: 类型多样性
    const uniqueTypes = new Set(deliverables.map(d => d.type)).size;
    const diversityScore = uniqueTypes > 1 ? 0.2 : 0;

    // 因素 4: 描述长度
    const lengthScore = result.description.length > 20 ? 0.2 : 0.1;

    return Math.min(countScore + ruleScoreFactor + diversityScore + lengthScore, 1.0);
  }

  /**
   * LLM 增强
   */
  async _enhanceWithLLM(description, ruleResult, ruleConfidence) {
    try {
      const llmResult = await this._convertWithLLM(description);

      // 合并结果
      const mergedDeliverables = this._mergeDeliverables(ruleResult.deliverables, llmResult.deliverables);

      return {
        title: description.substring(0, 50) + (description.length > 50 ? '...' : ''),
        description: description,
        deliverables: mergedDeliverables,
        source: 'hybrid',
        ruleConfidence: ruleConfidence,
        llmEnhanced: true
      };
    } catch (error) {
      this._log(`LLM 增强失败，使用规则匹配：${error.message}`, 'warn');
      return {
        ...ruleResult,
        source: 'rule_based_fallback',
        confidence: this._calculateConfidence(ruleResult)
      };
    }
  }

  /**
   * 完全使用 LLM 转换
   */
  async _convertWithLLM(description) {
    if (!this.llmClient) {
      this._log('LLM 客户端不可用，使用规则匹配', 'debug');
      return this._convertRuleBased(description);
    }

    const prompt = `请将以下任务描述分解为具体的交付物列表。
每个交付物应包含：
- description: 交付物描述
- type: 类型（从以下选择：ui, api, model, style, test, config, logic, database, general）

任务描述：${description}

请只返回 JSON 数组格式，不要其他解释：
[{"description": "...", "type": "..."}]`;

    try {
      const response = await this.llmClient.chat(prompt, {
        temperature: 0.1,
        maxTokens: 2048
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('无法解析 LLM 响应为 JSON');
      }

      const llmDeliverables = JSON.parse(jsonMatch[0]);

      const deliverables = llmDeliverables.map((d, i) => ({
        id: `deliverable-${Date.now()}-llm-${i}`,
        description: d.description || d.desc || d.content || '未知交付物',
        type: this._normalizeType(d.type),
        priority: 'medium',
        confidence: 0.8,
        source: 'llm'
      }));

      return {
        title: description.substring(0, 50) + (description.length > 50 ? '...' : ''),
        description: description,
        deliverables: deliverables,
        source: 'llm'
      };
    } catch (error) {
      this._log(`LLM 转换失败：${error.message}，回退到规则匹配`, 'warn');
      return this._convertRuleBased(description);
    }
  }

  /**
   * 合并交付物
   */
  _mergeDeliverables(ruleDeliverables, llmDeliverables) {
    const merged = [];
    const usedDescriptions = new Set();

    // 优先使用 LLM 结果
    for (const llmDeliv of llmDeliverables) {
      merged.push({
        ...llmDeliv,
        id: `deliverable-${Date.now()}-${merged.length}`,
        confidence: llmDeliv.confidence || 0.8,
        source: 'llm'
      });
      usedDescriptions.add(llmDeliv.description.toLowerCase());
    }

    // 添加规则独有的交付物
    for (const ruleDeliv of ruleDeliverables) {
      const descLower = ruleDeliv.description.toLowerCase();
      if (!usedDescriptions.has(descLower)) {
        merged.push({
          ...ruleDeliv,
          id: `deliverable-${Date.now()}-${merged.length}`,
          confidence: (ruleDeliv.ruleScore || 0) * 0.2,
          source: 'rule'
        });
        usedDescriptions.add(descLower);
      }
    }

    return merged;
  }

  /**
   * 标准化类型
   */
  _normalizeType(type) {
    if (!type) return 'general';
    const normalized = type.toLowerCase().trim();
    const validTypes = ['ui', 'api', 'model', 'style', 'test', 'config', 'logic', 'database', 'general'];
    return validTypes.includes(normalized) ? normalized : 'general';
  }

  _log(message, level = 'info') {
    if (level === 'debug' && this.logLevel !== 'debug') return;
    if (level === 'warn' && this.logLevel === 'error') return;
    console.log(`[HybridConverter] [${level}] ${message}`);
  }
}

module.exports = HybridTaskConverter;
