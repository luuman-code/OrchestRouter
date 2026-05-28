/**
 * 分解器增强组件
 *
 * 增强分解器能力，解决任务粒度、复杂度预估等问题
 */

class DecomposerEnhancer {
  constructor(config = {}) {
    this.config = {
      complexityThresholds: {
        simple: 1000,    // 简单任务token数阈值
        medium: 3000,    // 中等任务token数阈值
        complex: 6000    // 复杂任务token数阈值
      },
      maxSubtaskSize: config.maxSubtaskSize || 2000, // 每个子任务的最大预估大小
      ...config
    };
  }

  /**
   * 增强任务分解
   */
  async decomposeWithEnhancements(userRequest) {
    // 1. 首先细化任务描述
    const refinedRequest = await this.refineTaskDescription(userRequest);

    // 2. 预估任务复杂度
    const complexityEstimate = this.estimateComplexity(refinedRequest);

    // 3. 如果任务过于复杂，进一步细分
    if (complexityEstimate.score > this.config.complexityThresholds.medium) {
      refinedRequest.subtasks = await this.furtherDecompose(refinedRequest);
    }

    // 4. 为每个子任务预估所需资源
    const enhancedSubtasks = await this.enhanceSubtasks(refinedRequest.subtasks || []);

    return {
      ...refinedRequest,
      subtasks: enhancedSubtasks,
      complexity: complexityEstimate,
      estimatedTokens: complexityEstimate.score
    };
  }

  /**
   * 细化任务描述
   */
  async refineTaskDescription(userRequest) {
    const refinedRequest = { ...userRequest };

    // 检查任务描述是否过于笼统
    if (this.isVagueDescription(refinedRequest.description || refinedRequest.messages?.[0]?.content || '')) {
      refinedRequest.description = await this.elaborateVagueDescription(refinedRequest.description);
    }

    // 检查是否包含复合组件描述
    if (refinedRequest.description && refinedRequest.description.includes('（') && refinedRequest.description.includes('）')) {
      // 将复合组件拆分为独立组件
      refinedRequest.subtasks = this.splitCompositeComponents(refinedRequest.description);
    }

    return refinedRequest;
  }

  /**
   * 检查任务描述是否过于笼统
   */
  isVagueDescription(description) {
    const vaguePatterns = [
      /组件/,
      /模块/,
      /系统/,
      /功能/,
      /页面/,
      /服务/
    ];

    // 检查是否只包含模糊术语而没有具体细节
    const hasSpecificTerms = /login|signup|dashboard|profile|list|form|table|api|auth|user|product|order|payment/i.test(description);
    const hasVagueTerms = vaguePatterns.some(pattern => pattern.test(description));

    // 如果包含模糊术语但缺少具体细节，则认为描述过于笼统
    return hasVagueTerms && !hasSpecificTerms;
  }

  /**
   * 详细阐述模糊描述
   */
  async elaborateVagueDescription(description) {
    // 根据模糊描述推断可能的具体内容
    if (description.toLowerCase().includes('组件')) {
      if (description.toLowerCase().includes('用户') || description.toLowerCase().includes('user')) {
        return '用户登录组件，包含用户名密码输入框、登录按钮和错误提示';
      } else if (description.toLowerCase().includes('产品') || description.toLowerCase().includes('product')) {
        return '产品列表组件，显示产品卡片、图片、名称、价格和添加购物车按钮';
      } else {
        return '通用UI组件，包含基本样式、交互逻辑和事件处理';
      }
    }

    if (description.toLowerCase().includes('模块')) {
      if (description.toLowerCase().includes('认证') || description.toLowerCase().includes('auth')) {
        return '用户认证模块，包含注册、登录、登出、密码重置功能';
      } else {
        return '功能模块，包含数据处理、业务逻辑和错误处理';
      }
    }

    return description; // 返回原描述，如果无法细化
  }

  /**
   * 将复合组件拆分为独立组件
   */
  splitCompositeComponents(description) {
    const subtasks = [];

    // 检查是否包含括号中的组件列表
    const parentheticalMatch = description.match(/(.+?)（(.+?)）/);
    if (parentheticalMatch) {
      const baseDescription = parentheticalMatch[1].trim();
      const componentsStr = parentheticalMatch[2].trim();

      // 分割组件列表
      const components = componentsStr.split(/[，,]/).map(c => c.trim());

      for (const component of components) {
        let detailedDesc = component;

        // 根据组件类型提供更详细的描述
        if (component.includes('表单') || component.includes('form')) {
          detailedDesc = `${component} - 包含输入字段验证、提交处理和错误提示`;
        } else if (component.includes('列表') || component.includes('list')) {
          detailedDesc = `${component} - 显示数据列表、分页、筛选和排序功能`;
        } else if (component.includes('视图') || component.includes('view')) {
          detailedDesc = `${component} - 展示数据、交互界面和响应式布局`;
        }

        subtasks.push({
          id: this.generateTaskId(detailedDesc),
          description: detailedDesc,
          type: 'component',
          priority: 'MEDIUM'
        });
      }
    }

    return subtasks;
  }

  /**
   * 预估任务复杂度
   */
  estimateComplexity(request) {
    const description = request.description || request.messages?.[0]?.content || '';

    // 基础复杂度分数
    let score = 1000;

    // 根据关键词调整复杂度
    if (description.toLowerCase().includes('复杂') || description.toLowerCase().includes('advanced')) {
      score += 2000;
    }

    if (description.toLowerCase().includes('简单') || description.toLowerCase().includes('basic')) {
      score -= 500;
    }

    // 根据描述长度调整
    score += description.length * 2;

    // 根据技术栈关键词调整
    const techKeywords = ['authentication', 'authorization', 'database', 'api', 'payment', 'real-time'];
    for (const keyword of techKeywords) {
      if (description.toLowerCase().includes(keyword)) {
        score += 800;
      }
    }

    // 根据复杂度分数确定等级
    let level = 'SIMPLE';
    if (score > this.config.complexityThresholds.complex) {
      level = 'COMPLEX';
    } else if (score > this.config.complexityThresholds.medium) {
      level = 'MEDIUM';
    }

    return {
      score,
      level,
      description: `复杂度评分为 ${score}，属于 ${level} 级别`
    };
  }

  /**
   * 进一步分解复杂任务
   */
  async furtherDecompose(request) {
    const description = request.description || '';
    const subtasks = [];

    // 根据任务类型进一步分解
    if (description.toLowerCase().includes('电商') || description.toLowerCase().includes('shop')) {
      subtasks.push(
        { id: 'ecommerce-auth', description: '用户认证模块 - 注册、登录、登出功能', priority: 'HIGH' },
        { id: 'ecommerce-product', description: '产品管理模块 - 产品展示、搜索、详情页', priority: 'HIGH' },
        { id: 'ecommerce-cart', description: '购物车模块 - 添加、删除、修改商品数量', priority: 'HIGH' },
        { id: 'ecommerce-order', description: '订单处理模块 - 下单、支付、订单跟踪', priority: 'HIGH' },
        { id: 'ecommerce-payment', description: '支付集成 - 安全支付处理和回调处理', priority: 'HIGH' }
      );
    } else if (description.toLowerCase().includes('博客') || description.toLowerCase().includes('blog')) {
      subtasks.push(
        { id: 'blog-auth', description: '用户系统 - 作者注册、登录、权限管理', priority: 'HIGH' },
        { id: 'blog-posts', description: '文章管理 - 发布、编辑、删除文章功能', priority: 'HIGH' },
        { id: 'blog-comments', description: '评论系统 - 用户评论、回复、审核功能', priority: 'MEDIUM' },
        { id: 'blog-theme', description: '主题设计 - 响应式布局、美观界面', priority: 'MEDIUM' },
        { id: 'blog-search', description: '搜索功能 - 按标题、标签、内容搜索', priority: 'LOW' }
      );
    } else {
      // 对于其他类型的任务，按前后端分离的方式分解
      subtasks.push(
        { id: 'frontend', description: '前端实现 - UI组件、页面布局、用户交互', priority: 'HIGH' },
        { id: 'backend', description: '后端实现 - API接口、数据处理、业务逻辑', priority: 'HIGH' },
        { id: 'database', description: '数据库设计 - 数据模型、关系、索引', priority: 'MEDIUM' },
        { id: 'testing', description: '测试用例 - 单元测试、集成测试', priority: 'MEDIUM' }
      );
    }

    return subtasks;
  }

  /**
   * 增强子任务
   */
  async enhanceSubtasks(subtasks) {
    const enhancedTasks = [];

    for (const task of subtasks) {
      // 为每个任务预估所需tokens
      const estimatedTokens = this.estimateTokensForComponent(task.description);

      enhancedTasks.push({
        ...task,
        id: task.id || this.generateTaskId(task.description),
        estimatedTokens,
        detailedRequirements: this.extractRequirements(task.description)
      });
    }

    return enhancedTasks;
  }

  /**
   * 预估组件所需tokens
   */
  estimateTokensForComponent(description) {
    // 基础token数
    let tokens = 1000;

    // 根据复杂度关键词调整
    if (description.toLowerCase().includes('复杂') || description.toLowerCase().includes('advanced')) {
      tokens *= 2.5;
    } else if (description.toLowerCase().includes('中等') || description.toLowerCase().includes('moderate')) {
      tokens *= 1.8;
    } else if (description.toLowerCase().includes('简单') || description.toLowerCase().includes('basic')) {
      tokens *= 0.8;
    }

    // 根据功能关键词调整
    const functionalKeywords = ['authentication', 'database', 'api', 'real-time', 'interactive'];
    for (const keyword of functionalKeywords) {
      if (description.toLowerCase().includes(keyword)) {
        tokens *= 1.3;
      }
    }

    // 根据UI关键词调整
    const uiKeywords = ['responsive', 'animation', 'interactive', 'design'];
    for (const keyword of uiKeywords) {
      if (description.toLowerCase().includes(keyword)) {
        tokens *= 1.2;
      }
    }

    // 确保在合理范围内
    return Math.min(Math.max(tokens, 500), 8000);
  }

  /**
   * 提取任务需求
   */
  extractRequirements(description) {
    const requirements = [];

    if (description.toLowerCase().includes('响应式') || description.toLowerCase().includes('mobile')) {
      requirements.push('必须适配移动端设备');
    }

    if (description.toLowerCase().includes('安全') || description.toLowerCase().includes('secure')) {
      requirements.push('需要实现安全措施');
    }

    if (description.toLowerCase().includes('测试') || description.toLowerCase().includes('test')) {
      requirements.push('需要包含单元测试');
    }

    if (description.toLowerCase().includes('性能') || description.toLowerCase().includes('performance')) {
      requirements.push('需要优化性能');
    }

    return requirements.length > 0 ? requirements : ['实现基本功能'];
  }

  /**
   * 生成任务ID
   */
  generateTaskId(description) {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 30);
  }
}

module.exports = DecomposerEnhancer;