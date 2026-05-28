/**
 * FilePathExtractor - 文件路径提取器
 *
 * 目标: 解决简单正则表达式导致的贪婪匹配问题，提高路径提取准确性
 */
class FilePathExtractor {
  constructor() {
    // 常见文件扩展名白名单
    this.validExtensions = [
      // 前端文件
      'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'htm',
      'css', 'scss', 'sass', 'less', 'styl',
      // 后端文件
      'py', 'rb', 'php', 'java', 'cpp', 'c', 'h', 'hpp',
      'go', 'rs', 'swift', 'kt', 'scala',
      // 配置文件
      'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'env',
      // 文档文件
      'md', 'txt', 'csv', 'log', 'sql', 'graphql'
    ];
    this.extensionPattern = `(?:${this.validExtensions.join('|')})`;
  }

  /**
   * 从单行文本中提取文件路径
   */
  extract(line) {
    // 格式 1: [: filename.ext] - 结构化格式（最高优先级）
    const structuredMatch = line.match(
      new RegExp(`:\\s*\\[([A-Za-z0-9._\\-\\/\\\\]+?\\.${this.extensionPattern})\\]`, 'i')
    );
    if (structuredMatch) return structuredMatch[1].trim();

    // 格式 2: [filename.ext] - 方括号格式
    const bracketMatch = line.match(
      new RegExp(`\\[([A-Za-z0-9._\\-\\/\\\\]+?\\.${this.extensionPattern})\\]`, 'i')
    );
    if (bracketMatch) return bracketMatch[1].trim();

    // 格式 3: : path/to/file.ext - 冒号后跟路径（非贪婪）
    const colonMatch = line.match(
      new RegExp(
        `:\\s*([A-Za-z0-9._\\-\\/\\\\]+?\\.${this.extensionPattern})` +
        `(?:\\s|$|[\\-\\u4e00-\\u9fa5\\[\\]\\(\\)])`,
        'i'
      )
    );
    if (colonMatch) return colonMatch[1].trim();

    // 格式 4: 直接文件路径（支持 Windows 和 Unix）
    const directMatch = line.match(
      new RegExp(
        `([A-Za-z]:[\\\\\\/]|\\/)[A-Za-z0-9._\\-\\/\\\\]+\\.${this.extensionPattern}`,
        'i'
      )
    );
    if (directMatch) return directMatch[0].trim();

    return null;
  }

  /**
   * 验证文件路径的有效性
   */
  validate(filePath) {
    if (!filePath) return false;
    const extMatch = filePath.match(/\.(.+)$/);
    if (!extMatch) return false;
    return this.validExtensions.includes(extMatch[1].toLowerCase());
  }

  /**
   * 计算路径匹配置信度 (0-100)
   */
  calculateConfidence(filePath, context = '') {
    let score = 0;
    if (this.validate(filePath)) score += 30;

    if (context) {
      const pathIndex = context.indexOf(filePath);
      if (pathIndex !== -1) {
        const before = context.substring(Math.max(0, pathIndex - 20), pathIndex);
        const after = context.substring(pathIndex + filePath.length, pathIndex + filePath.length + 20);
        if (before.toLowerCase().match(/(:|路径|文件|创建|修改|更新|实现|添加|删除|重构)/)) {
          score += 20;
        }
        if (after.match(/^(\s|$|\[|\(|-|\.)/)) {
          score += 15;
        }
      }
    }
    if (filePath.match(/[A-Za-z0-9._\-\/]+\./)) score += 10;

    return Math.min(score, 100);
  }
}

/**
 * RobustStructuredTaskParser - 健壮的结构化任务解析器
 *
 * 目标: 提供分层错误处理，在解析失败时优雅降级
 */
class RobustStructuredTaskParser {
  constructor(options = {}) {
    this.filePathExtractor = new FilePathExtractor();
    this.defaultFallbackTask = {
      task: "Unknown Task",
      context: {},
      requirement: "Process the provided content",
      deliverables: [{ description: "Unknown deliverable", type: "unknown", filePath: null }],
      constraints: "",
      priority: "normal"
    };
  }

  /**
   * 解析结构化任务（带错误处理）
   */
  parse(taskContent) {
    try {
      return this.parseStructured(taskContent);
    } catch (parseError) {
      console.warn(`Structured parsing failed: ${parseError.message}`);
      try {
        return this.parseSimplified(taskContent);
      } catch (simpleParseError) {
        console.warn(`Simplified parsing failed: ${simpleParseError.message}`);
        return {
          ...this.defaultFallbackTask,
          rawContent: taskContent,
          warnings: [`Parsing failed, using fallback structure: ${parseError.message}`]
        };
      }
    }
  }

  /**
   * 完整的结构化解析
   */
  parseStructured(content) {
    const result = {};

    const taskMatch = content.match(/# Task: ([^\n]+)/i);
    result.task = taskMatch ? taskMatch[1].trim() : 'Unknown Task';

    const contextMatch = content.match(/## Context[\s\S]*?(?=## |$)/);
    result.context = contextMatch ? this.parseContext(contextMatch[0]) : {};

    const requirementMatch = content.match(/## Requirement[\s\S]*?(?=## |$)/);
    result.requirement = requirementMatch
      ? requirementMatch[0].replace('## Requirement', '').trim()
      : '';

    const deliverablesMatch = content.match(/## Deliverables[\s\S]*?(?=## |$)/);
    result.deliverables = deliverablesMatch
      ? this.parseDeliverables(deliverablesMatch[0])
      : [];

    const constraintsMatch = content.match(/## Constraints[\s\S]*?(?=## |$)/);
    result.constraints = constraintsMatch
      ? constraintsMatch[0].replace('## Constraints', '').trim()
      : '';

    const priorityMatch = content.match(/## Priority:\s*(\w+)/i);
    result.priority = priorityMatch ? priorityMatch[1].trim() : 'normal';

    return result;
  }

  /**
   * 简化解析（降级策略）
   */
  parseSimplified(content) {
    const lines = content.split('\n');
    const deliverables = [];

    for (const line of lines) {
      if (line.trim().startsWith('- [ ]')) {
        deliverables.push({
          description: line.replace(/^- \[ \]\s*/, '').trim(),
          filePath: this.filePathExtractor.extract(line),
          type: 'unknown'
        });
      }
    }

    return {
      task: content.match(/# Task: ([^\n]+)/i)?.[1]?.trim() ||
            content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      context: { raw_content_length: content.length, partial_parse: true },
      requirement: content,
      deliverables: deliverables.length > 0 ? deliverables : [{
        description: content,
        filePath: null,
        type: 'unknown'
      }],
      priority: 'normal',
      warnings: ['Using simplified parsing due to structure issues']
    };
  }

  parseContext(contextText) {
    const context = {};
    const lines = contextText.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('- ')) {
        const parts = line.substring(2).split(': ');
        if (parts.length >= 2) {
          context[parts[0].trim()] = parts.slice(1).join(': ').trim();
        }
      }
    }
    return context;
  }

  parseDeliverables(sectionText) {
    const lines = sectionText.split('\n');
    const items = [];
    for (const line of lines) {
      if (line.trim().startsWith('- [ ]')) {
        const filePath = this.filePathExtractor.extract(line);
        items.push({
          description: this.extractDescription(line),
          filePath: filePath,
          type: this.extractType(line),
          pathConfidence: filePath
            ? this.filePathExtractor.calculateConfidence(filePath, line)
            : 0
        });
      }
    }
    return items;
  }

  extractDescription(line) {
    const match = line.match(/- \[ \] (.+?)(?: - \[type:|:|$)/);
    return match ? match[1].replace(/:.*$/, '').trim() : '';
  }

  extractType(line) {
    const match = line.match(/\[type: (\w+)\]/);
    return match ? match[1] : null;
  }
}

/**
 * TaskParser - 主任务解析器类（与现有接口兼容）
 */
class TaskParser {
  constructor() {
    this.parser = new RobustStructuredTaskParser();
  }

  /**
   * 解析任务
   * @param {Object|string} task - 待解析的任务，可能是对象或字符串
   * @returns {Object} 解析后的标准化任务对象
   */
  parse(task) {
    if (typeof task === 'string') {
      return this.parseFromString(task);
    } else if (typeof task === 'object') {
      return this.parseFromObject(task);
    } else {
      throw new Error('Unsupported task format. Expected string or object.');
    }
  }

  /**
   * 从对象解析任务
   */
  parseFromObject(taskObj) {
    const parsedTask = {};

    // 提取标题
    parsedTask.title = taskObj.title || 'Untitled Task';

    // 提取上下文
    parsedTask.context = taskObj.context || {};

    // 提取需求
    parsedTask.requirement = taskObj.requirement || '';

    // 提取交付物，如果是字符串格式需进一步解析
    if (Array.isArray(taskObj.deliverables)) {
      parsedTask.deliverables = taskObj.deliverables.map((item, index) => {
        // 安全地获取描述，避免 [object Object] 问题
        let description;
        if (typeof item.description === 'string') {
          description = item.description;
        } else if (typeof item.content === 'string') {
          description = item.content;
        } else {
          // 非字符串类型（对象、数字等）使用默认值
          description = 'No description';
        }

        return {
          id: item.id || `deliverable-${index}`,
          description: description,
          type: item.type || 'unknown',
          // 【修复】保留 types 数组（多维度格式）
          types: item.types !== undefined ? item.types : null,
          priority: item.priority || taskObj.priority || 'medium',
          dependencies: item.dependencies || [],
          filePath: item.filePath || null,
          pathConfidence: item.pathConfidence || 0,
          // 保留原始 deliverable 的 integrationHints
          integrationHints: item.integrationHints || null
        };
      });
    } else if (typeof taskObj.deliverables === 'string') {
      parsedTask.deliverables = this.parseDeliverablesString(taskObj.deliverables);
    } else {
      parsedTask.deliverables = [];
    }

    // 提取优先级
    parsedTask.priority = taskObj.priority || 'medium';

    // 提取截止日期
    parsedTask.deadline = taskObj.deadline || null;

    // 提取依赖关系
    parsedTask.dependencies = taskObj.dependencies || [];

    // 【修复】提取背景信息（包含 implementation_plan 等）
    if (taskObj.backgroundInfo) {
      parsedTask.backgroundInfo = taskObj.backgroundInfo;
    }

    // 提取其他上下文信息
    parsedTask.metadata = {
      createdAt: taskObj.createdAt || new Date().toISOString(),
      source: taskObj.source || 'direct_input',
      original: taskObj
    };

    return parsedTask;
  }

  /**
   * 从字符串解析任务（支持Markdown格式）
   */
  parseFromString(taskStr) {
    // 使用健壮的结构化解析器
    const parsedResult = this.parser.parse(taskStr);

    // 将解析结果转换为标准格式
    const result = {
      title: parsedResult.task || parsedResult.title || 'Unknown Task',
      context: parsedResult.context || {},
      requirement: parsedResult.requirement || parsedResult.description || '',
      deliverables: parsedResult.deliverables || [],
      priority: parsedResult.priority || 'medium',
      deadline: parsedResult.deadline || null,
      dependencies: parsedResult.dependencies || [],
      constraints: parsedResult.constraints || '',
      metadata: {
        createdAt: new Date().toISOString(),
        source: 'string_input',
        original: taskStr,
        warnings: parsedResult.warnings || []
      }
    };

    // 确保交付物格式一致
    if (Array.isArray(result.deliverables)) {
      result.deliverables = result.deliverables.map((item, index) => ({
        id: item.id || `deliverable-${index}`,
        description: item.description || String(item),
        type: item.type || 'unknown',
        filePath: item.filePath || item.targetFile || null,
        pathConfidence: item.pathConfidence || 0,
        priority: item.priority || result.priority
      }));
    }

    return result;
  }

  /**
   * 解析交付物字符串
   */
  parseDeliverablesString(deliverablesStr) {
    const lines = deliverablesStr.split('\n');
    const deliverables = [];

    const parser = new RobustStructuredTaskParser();

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('- [ ]')) {
        const filePath = parser.filePathExtractor.extract(line);
        deliverables.push({
          id: `deliverable-${index}`,
          description: parser.extractDescription(line),
          type: parser.extractType(line) || 'unknown',
          filePath: filePath,
          pathConfidence: filePath
            ? parser.filePathExtractor.calculateConfidence(filePath, line)
            : 0
        });
      }
    });

    return deliverables;
  }
}

module.exports = TaskParser;
module.exports.FilePathExtractor = FilePathExtractor;
module.exports.RobustStructuredTaskParser = RobustStructuredTaskParser;