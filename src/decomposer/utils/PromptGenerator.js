/**
 * Prompt 生成器
 *
 * 将分解后的任务转换为适合模型处理的 prompt 格式
 * 根据实现计划 V4 - 功能块 E
 */

const { PathNormalizer } = require('../../orchestrator/utils/PathNormalizer');
const TypeAnnotator = require('../types/TypeAnnotator');
const MockGenerator = require('../mocks/MockGenerator');

// 类型到类别的映射（与 ConfigManager.js 保持一致）
const TYPE_CATEGORY_MAP = {
  // frontend 类型
  'ui': 'frontend',
  'style': 'frontend',
  'component': 'frontend',
  // backend 类型
  'api': 'backend',
  'logic': 'backend',
  'model': 'backend',
  'database': 'backend',
  // quality 类型
  'test': 'quality',
  'quality': 'quality',
  // config 类型
  'config': 'config',
  'general': 'general'
};

// 代码生成任务只需要 write_file 工具（已移除 read_file，避免模型选择读取而非直接生成）
const CODE_GENERATION_TOOLS = [
  {
    name: 'write_file',
    description: '写入文件内容',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['file_path', 'content']
    }
  }
];

// =====================================================
// 输出格式常量 - 已移至 buildMergedPrompt 函数内部
// =====================================================

/**
 * EnhancedSubtask - 增强子任务结构
 *
 * 提供整合器接口，支持目标文件路径、依赖关系、合并组等高级功能
 */
class EnhancedSubtask {
  constructor(baseSubtask, integrationHints = {}) {
    this.id = baseSubtask.id || this.generateId();
    // 使用 types 数组替代单一的 type 字段
    this.types = baseSubtask.types || [];
    this.description = baseSubtask.description;
    this.prompt = baseSubtask.prompt;
    this.systemPrompt = baseSubtask.systemPrompt || null; // 添加 systemPrompt 字段

    // 初始化路径标准化器
    this.pathNormalizer = new PathNormalizer();

    // 新增的整合器接口字段
    this.integrationHints = {
      // 明确的目标文件路径（经过冲突解决后可能已变更）
      targetFile: integrationHints.targetFile || baseSubtask.filePath || null,

      // 若共享文件，标明目标代码区域
      region: integrationHints.region || null,

      // 依赖的其他子任务 ID
      dependsOn: integrationHints.dependsOn || [],

      // 合并组 ID（如果与其它子任务合并到同一文件）
      mergeGroupId: integrationHints.mergeGroupId || null,

      // 合并策略
      mergeStrategy: integrationHints.mergeStrategy || null,

      // 代码区域约束
      regionConstraints: integrationHints.regionConstraints || null,

      // 原始信息（用于追溯）
      originalTask: baseSubtask,
      originalFilePath: baseSubtask.filePath,
      groupId: baseSubtask.groupId || null
    };

    // 保留其他原有字段
    this.confidence = baseSubtask.confidence || 0;
    this.tagSource = baseSubtask.tagSource;
    this.filePath = baseSubtask.filePath;
    this.pathConfidence = baseSubtask.pathConfidence || 0;
    // 保留 tools 字段（用于 API 请求）
    this.tools = baseSubtask.tools || null;
  }

  generateId() {
    return `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * SubtaskPromptGenerator - 子任务 Prompt 生成器
 */
class PromptGenerator {
  constructor(config = {}) {
    this.config = config;
    this.templateRegistry = new Map();

    // 初始化路径标准化器
    try {
      this.pathNormalizer = new PathNormalizer();
    } catch (error) {
      console.warn('无法初始化路径标准化器:', error.message);
      this.pathNormalizer = null;
    }

    // 初始化类型标注器（用于聚合 types）
    try {
      this.typeAnnotator = new TypeAnnotator();
    } catch (error) {
      console.warn('无法初始化类型标注器:', error.message);
      this.typeAnnotator = null;
    }

    // 注册默认模板
    this.registerDefaultTemplates();
  }

  /**
   * 注册默认的 prompt 模板
   */
  registerDefaultTemplates() {
    // 通用模板
    this.registerTemplate('general', {
      name: '通用任务模板',
      template: `# Task: {{taskTitle}}

## Context
{{context}}

## Requirement
{{requirement}}

## Current Subtask
{{deliverable}}

## Constraints
{{constraints}}

# Priority: {{priority}}`
    });

    // 前端 UI 组件模板
    this.registerTemplate('ui', {
      name: 'UI 组件模板',
      template: `# Task: {{taskTitle}}

## Context
- Project Type: frontend
- Tech Stack: {{techStack}}

## Requirement
{{requirement}}

## Current Subtask
{{deliverable}}

# Priority: {{priority}}`
    });

    // 样式文件模板
    this.registerTemplate('style', {
      name: '样式模板',
      template: `# Task: {{taskTitle}}

## Context
- Tech Stack: {{techStack}}

## Requirement
{{requirement}}

## Current Subtask
{{deliverable}}

# Priority: {{priority}}`
    });

    // API 开发模板
    this.registerTemplate('api', {
      name: 'API 开发模板',
      template: `# Task: {{taskTitle}}

## Context
- Tech Stack: {{techStack}}

## Requirement
{{requirement}}

## Current Subtask
{{deliverable}}

# Priority: {{priority}}`
    });

    // 测试模板
    this.registerTemplate('test', {
      name: '测试模板',
      template: `# Task: {{taskTitle}}

## Context
- Tech Stack: {{techStack}}

## Requirement
{{requirement}}

## Current Subtask
{{deliverable}}

# Priority: {{priority}}`
    });
  }

  /**
   * 注册新的 prompt 模板
   */
  registerTemplate(name, templateConfig) {
    this.templateRegistry.set(name, templateConfig);
  }

  /**
   * 主生成方法 - 生成基础子任务列表
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Array} taggedDeliverables - 已标注类型的交付物列表
   * @param {Object} implementationPlan - 实现计划
   * @returns {Array} 子任务列表
   */
  generate(parsedTask, taggedDeliverables, implementationPlan = null) {
    const subtasks = [];
    for (const item of taggedDeliverables) {
      const promptResult = this.buildPrompt(parsedTask, item, implementationPlan, taggedDeliverables); // Pass all deliverables as reference
      // 使用 types 数组
      const types = item.types || [];
      const primaryType = types.length > 0 ? types[0].type : (item.type || 'unknown');
      subtasks.push({
        type: primaryType, // 保留 type 字段用于兼容性
        types: types,
        description: item.description,
        filePath: item.filePath,
        pathConfidence: item.pathConfidence || 0,
        prompt: promptResult.prompt,
        systemPrompt: promptResult.systemPrompt, // 添加 systemPrompt 字段
        tagSource: item.tagSource,
        debugInfo: item.debugInfo || {},
        confidence: types.length > 0 ? types[0].confidence : 0,
        // 保留原始 deliverable 的 integrationHints
        integrationHints: item.integrationHints || null,
        // 添加 tools 定义，使模型能够返回 tool_call 格式
        tools: CODE_GENERATION_TOOLS
      });
    }
    return subtasks;
  }

  /**
   * 增强生成方法 - 支持分组和依赖图的子任务生成
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Array} groupedDeliverables - 已分组的交付物列表
   * @param {Array} groups - 分组信息
   * @param {Array} dependencyGraph - 依赖关系图
   * @param {Object} implementationPlan - 实现计划
   * @returns {Array} 增强子任务列表
   */
  generateEnhanced(parsedTask, groupedDeliverables, groups, dependencyGraph, implementationPlan = null) {
    const subtasks = [];

    for (const item of groupedDeliverables) {
      // 构建集成提示
      const integrationHints = this.buildIntegrationHints(item, groups, dependencyGraph);

      // 使用 types 数组
      const types = item.types || [];

      const promptResult = this.buildPrompt(parsedTask, item, implementationPlan, groupedDeliverables); // Pass all deliverables as reference

      const enhancedSubtask = new EnhancedSubtask({
        types: types,
        description: item.description,
        filePath: item.filePath,
        pathConfidence: item.pathConfidence || 0,
        prompt: promptResult.prompt,
        systemPrompt: promptResult.systemPrompt, // 添加 systemPrompt 字段
        tagSource: item.tagSource,
        debugInfo: item.debugInfo || {},
        confidence: types.length > 0 ? types[0].confidence : 0,
        id: item.id || this.generateSubtaskId(),
        tools: CODE_GENERATION_TOOLS // 添加 tools 定义，使模型能够返回 tool_call 格式
      }, integrationHints);

      subtasks.push(enhancedSubtask);
    }

    return subtasks;
  }

  /**
   * 根据分组生成子任务 - 每个分组生成一个子任务（而不是每个deliverable）
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Array} groups - 分组信息，每个元素包含 deliverables 数组
   * @param {Array} dependencyGraph - 依赖关系图
   * @param {Object} implementationPlan - 实现计划
   * @returns {Array} 子任务列表，每个分组一个子任务
   */
  generateFromGroups(parsedTask, groups, dependencyGraph, implementationPlan = null) {
    const subtasks = [];

    // 收集所有 deliverables 作为参考
    const allGroupDeliverables = groups.flatMap(g => g.deliverables || []);

    for (const group of groups) {
      const groupDeliverables = group.deliverables || [];

      // 如果分组只有一个deliverable，使用原有逻辑
      if (groupDeliverables.length === 1) {
        const item = groupDeliverables[0];
        const promptResult = this.buildPrompt(parsedTask, item, implementationPlan, allGroupDeliverables); // Pass all deliverables as reference
        // 使用 types 数组
        const types = item.types || [];
        const primaryType = types.length > 0 ? types[0].type : (item.type || 'general');

        // 【Bug修复】正确构建 integrationHints，确保包含 targetFile
        // 必须调用 buildIntegrationHints 而不是直接使用 item.integrationHints
        const integrationHints = this.buildIntegrationHints(item, groups, dependencyGraph);
        // 如果 item 有原始的 integrationHints，合并之
        if (item.integrationHints) {
          integrationHints.region = item.integrationHints.region || integrationHints.region;
          integrationHints.mergeStrategy = item.integrationHints.mergeStrategy || integrationHints.mergeStrategy;
          integrationHints.regionConstraints = item.integrationHints.regionConstraints || integrationHints.regionConstraints;
        }

        subtasks.push({
          type: primaryType, // 保留 type 字段用于兼容性
          types: types,
          description: item.description,
          filePath: item.filePath,
          pathConfidence: item.pathConfidence || 0,
          prompt: promptResult.prompt,
          systemPrompt: promptResult.systemPrompt, // 添加 systemPrompt 字段
          tagSource: item.tagSource,
          debugInfo: item.debugInfo || {},
          confidence: types.length > 0 ? types[0].confidence : 0,
          id: item.id || this.generateSubtaskId(),
          // 添加分组信息
          mergeGroupId: group.id || null,
          groupSize: 1,
          // 使用正确构建的 integrationHints
          integrationHints,
          // 添加 tools 定义，使模型能够返回 tool_call 格式
          tools: CODE_GENERATION_TOOLS
        });
      } else {
        // 分组有多个deliverables，合并成一个子任务
        const mergedDescription = groupDeliverables.map(d => d.description).join('; ');
        const mergedFilePaths = groupDeliverables.map(d => d.filePath).filter(f => f);

        // 收集所有 types 并聚合
        const allTypes = groupDeliverables.flatMap(d => d.types || []);
        const aggregatedTypes = this.typeAnnotator ? this.typeAnnotator._aggregateTypes(allTypes) : allTypes.slice(0, 5);
        const primaryType = aggregatedTypes.length > 0 ? aggregatedTypes[0].type : 'general';

        // 构建合并的 prompt
        const mergedPromptResult = this.buildMergedPrompt(parsedTask, groupDeliverables, implementationPlan, allGroupDeliverables);

        // 收集所有 deliverables 的 integrationHints，合并成一个包含所有文件信息的列表
        const allIntegrationHints = groupDeliverables.map(d => ({
          targetFile: d.filePath,
          description: d.description,
          integrationHints: d.integrationHints || null
        }));

        // 保留所有文件的 targetFile 列表（用于整合器正确处理）
        const mergedHints = {
          targetFile: mergedFilePaths[0] || null, // 保留第一个作为主要目标
          targetFiles: mergedFilePaths, // 添加所有文件路径列表
          mergedDeliverables: allIntegrationHints, // 完整的 deliverables 信息
          mergeGroupId: group.id || null,
          mergeStrategy: 'separate' // 明确告知应该分别生成文件
        };

        subtasks.push({
          type: primaryType, // 保留 type 字段用于兼容性
          types: aggregatedTypes,
          description: mergedDescription,
          filePath: mergedFilePaths[0] || null, // 使用第一个文件的路径
          pathConfidence: 0,
          prompt: mergedPromptResult.prompt,
          systemPrompt: mergedPromptResult.systemPrompt, // 添加 systemPrompt 字段
          tagSource: 'semantic_grouping',
          debugInfo: { grouped: true, groupSize: groupDeliverables.length },
          confidence: aggregatedTypes.length > 0 ? aggregatedTypes[0].confidence : 0.8,
          id: group.id || this.generateSubtaskId(),
          // 添加分组信息
          mergeGroupId: group.id || null,
          groupSize: groupDeliverables.length,
          mergedDeliverables: groupDeliverables.map(d => d.description),
          // 使用合并后的 integrationHints
          integrationHints: mergedHints,
          // 添加 tools 定义，使模型能够返回 tool_call 格式
          tools: CODE_GENERATION_TOOLS
        });
      }
    }

    return subtasks;
  }

  /**
   * 构建合并的 Prompt - 用于分组内有多个deliverables的情况
   * 明确告知大模型需要为每个文件单独生成代码
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Array} deliverables - 当前分组的 deliverables
   * @param {Object} implementationPlan - 实现计划
   * @param {Array} allDeliverables - 所有分组的 deliverables（用于显示跨组文件）
   */
  buildMergedPrompt(parsedTask, deliverables, implementationPlan = null, allDeliverables = null) {
    const taskTitle = parsedTask.title || 'Untitled Task';
    const requirement = parsedTask.requirement || '';

    // 精简的文件列表
    const deliverableList = deliverables.map((d, idx) => {
      const types = d.types || [];
      const typeStr = types.length > 0 ? types.map(t => t.type).join(', ') : (d.type || 'general');
      return `${idx + 1}. [${typeStr}] ${d.description} -> FILE: ${d.filePath || 'N/A'}`;
    }).join('\n');

    // System Prompt - 极简版
    const systemPrompt = `You are a code generation assistant.

Generate the files listed in the user message. Use the write_file tool for EACH file listed.
Return ALL tool calls in ONE single response.
Do not return any text or comments.

IMPORTANT: If type definitions or other reference content appear in the prompt, they are for YOUR REFERENCE ONLY to ensure consistency. You MUST still generate ALL listed files using the write_file tool. Do NOT skip any file even if some content appears to be provided.

## Output Format Example
Each tool call must be in this exact format:
{
  "type": "tool_use",
  "name": "write_file",
  "input": {
    "file_path": "example/path/file.ts",
    "content": "file content here"
  }
}

For multiple files, return an array of tool_use blocks:
[
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "file1.ts",
      "content": "content 1"
    }
  },
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "file2.ts",
      "content": "content 2"
    }
  }
]`;

    // [DEBUG]
    const tsDeliverables = deliverables.filter(d => {
      const fp = d.filePath || '';
      return fp.endsWith('.ts') || fp.endsWith('.tsx');
    });
    console.log(`[PromptGenerator] buildMergedPrompt called: ${deliverables.length} 个 deliverables (其中 ${tsDeliverables.length} 个 TS/TSX 文件)`);

    // =====================================================
    // User Prompt - 精简版
    // =====================================================
    const promptParts = [];

    // 1. 任务标题
    promptParts.push(`# ${taskTitle}`);
    promptParts.push('');

    // 2. 需求描述
    if (requirement) {
      promptParts.push('## Requirement');
      promptParts.push(requirement);
      promptParts.push('');
    }

    // 3. 技术栈
    if (implementationPlan?.tech_stack) {
      promptParts.push('## Tech Stack');
      promptParts.push(implementationPlan.tech_stack.join(', '));
      promptParts.push('');
    }

    // 4. 文件列表
    promptParts.push('## Files to Generate');
    promptParts.push(deliverableList);
    promptParts.push('');

    // 5. 注入类型 content（统一 commonTypes + 按需 fileTypes）
    // 【重构】收集所有文件的类型，一次性注入，commonTypes 只注入一次
    const typesContent = implementationPlan?._typesDeliverableContent ||
                         implementationPlan?.generated_types ||
                         implementationPlan?.auto_generated_types;

    if (typesContent && implementationPlan?.contract_first) {
      // 检查是否有 TypeScript 文件
      const hasTsFiles = deliverables.some(d => {
        const fp = d.filePath || '';
        return fp.endsWith('.ts') || fp.endsWith('.tsx');
      });

      if (hasTsFiles) {
        const { commonTypes, fileTypesMap } = this.parseGroupedTypesContent(typesContent);

        // 收集所有 deliverables 对应的 fileTypes
        const collectedFileTypes = [];
        const skippedFiles = []; // 记录跳过的文件（无对应类型）
        for (const deliverable of deliverables) {
          const filePath = deliverable?.filePath || '';
          if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
            continue; // 跳过非 TypeScript 文件
          }

          let fileTypes = fileTypesMap[filePath];

          // 精确匹配失败时，尝试路径规范化匹配
          if (!fileTypes) {
            const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
            for (const [key, value] of Object.entries(fileTypesMap)) {
              const normalizedKey = key.replace(/\.(ts|tsx)$/, '');
              if (normalizedKey === normalizedFilePath) {
                fileTypes = value;
                break;
              }
            }
          }

          if (fileTypes && fileTypes.trim()) {
            collectedFileTypes.push({ filePath, content: fileTypes });
          } else {
            // 文件没有对应的类型分组
            skippedFiles.push(filePath);
          }
        }

        // 记录类型收集详情
        if (skippedFiles.length > 0) {
          console.log(`[PromptGenerator] 跳过类型注入 (文件无对应类型): ${skippedFiles.join(', ')}`);
        }
        console.log(`[PromptGenerator] 收集到 ${collectedFileTypes.length} 个文件的类型定义`);

        // 只有当有类型内容时才注入
        if (commonTypes.trim() || collectedFileTypes.length > 0) {
          // 构建类型内容：commonTypes 一次 + 所有文件的 fileTypes
          const typeDefinitionParts = [];

          // 提取所有类型名称用于 import 语句
          const allTypeNames = [];
          if (commonTypes.trim()) {
            const commonNames = this._extractTypeNames(commonTypes);
            allTypeNames.push(...commonNames);
          }
          for (const ft of collectedFileTypes) {
            const fileNames = this._extractTypeNames(ft.content);
            allTypeNames.push(...fileNames);
          }
          const uniqueTypeNames = [...new Set(allTypeNames)];

          // 构建类型内容部分
          if (commonTypes.trim()) {
            typeDefinitionParts.push('// [COMMON]');
            typeDefinitionParts.push(commonTypes.trim());
          }

          for (const ft of collectedFileTypes) {
            typeDefinitionParts.push(`// [FILE: ${ft.filePath}]`);
            typeDefinitionParts.push(ft.content.trim());
          }

          const finalTypesContent = typeDefinitionParts.join('\n');

          // 生成 import 语句
          const importStatement = uniqueTypeNames.length > 0
            ? `import type { ${uniqueTypeNames.join(', ')} } from '../types';`
            : '';

          const importSection = importStatement
            ? [
                '',
                '**Important:** Import types from the generated file:',
                '```typescript',
                importStatement,
                '```',
                ''
              ].join('\n')
            : '';

          promptParts.push([
            '### TypeScript Interfaces (On-Demand)',
            '```typescript',
            finalTypesContent,
            '```',
            importSection
          ].join('\n'));

          console.log(`[PromptGenerator] 按需注入类型: commonTypes + ${collectedFileTypes.length} 个文件的类型`);
        }
      }
    }

    // 6. 契约生成的类型定义（仅当没有通过 buildTypeContent 输出时）【已整合到上方】

    // 【删除】7. Mock 数据（前端任务）- mock_service_layer 已禁用
    // 此功能已移除，不再生成额外的 mock 文件

    const prompt = promptParts.join('\n');

    return {
      systemPrompt: systemPrompt,
      prompt: prompt
    };
  }

  /**
   * 构建集成提示
   * @param {Object} item - 交付物
   * @param {Array} groups - 分组信息
   * @param {Array} dependencyGraph - 依赖关系图
   * @returns {Object} 集成提示信息
   */
  buildIntegrationHints(item, groups, dependencyGraph) {
    const hints = {
      targetFile: item.filePath || null,
      region: item.region || null,
      dependsOn: [],
      mergeGroupId: item.groupId || null,
      mergeStrategy: item.mergeStrategy || null,
      regionConstraints: item.regionConstraints || null
    };

    // 如果项目在组中，添加组相关的依赖信息
    if (item.groupId) {
      const groupDepIds = dependencyGraph
        .filter(dep => dep.from === item.groupId)
        .map(dep => dep.to);
      hints.dependsOn = groupDepIds;
    }

    // 如果有区域信息，添加区域约束
    if (item.targetRegion) {
      hints.region = item.targetRegion.type;
      hints.regionConstraints = item.targetRegion.constraints;
    }

    return hints;
  }

  /**
   * 生成 Prompt（供旧接口调用）
   */
  generatePrompts(deliverables, baseTask) {
    return deliverables.map((deliverable) => {
      const templateName = this.selectTemplate(deliverable);
      return this.generatePrompt(deliverable, baseTask, templateName);
    });
  }

  /**
   * 生成单个 Prompt
   */
  generatePrompt(deliverable, baseTask, templateName = 'general') {
    const template = this.templateRegistry.get(templateName) || this.templateRegistry.get('general');

    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // 准备替换变量
    const variables = {
      taskTitle: baseTask.title || 'Untitled Task',
      context: this.formatContext(baseTask.context),
      requirement: baseTask.requirement || '',
      subtaskDescription: deliverable.description || deliverable.content || 'Unknown subtask',
      deliverable: this.formatDeliverable(deliverable),
      constraints: baseTask.constraints || 'None',
      priority: deliverable.priority || baseTask.priority || 'medium',
      techStack: (baseTask.context && baseTask.context.techStack)
        ? baseTask.context.techStack.join(', ')
        : 'Not specified'
    };

    // 替换模板中的变量
    let prompt = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      prompt = prompt.replace(placeholder, value);
    }

    // 使用 types 数组替代单一的 type 字段
    const types = deliverable.types || [];
    const primaryType = types.length > 0 ? types[0].type : (deliverable.type || 'general');

    return {
      id: deliverable.id || this.generateSubtaskId(),
      type: primaryType, // 保留 type 字段用于兼容性
      types: types, // 使用 types 数组
      description: deliverable.description,
      filePath: deliverable.filePath,
      pathConfidence: deliverable.pathConfidence || 0,
      prompt: prompt,
      tagSource: deliverable.tagSource || 'rule_matching',
      confidence: types.length > 0 ? types[0].confidence : (deliverable.confidence || 0),
      debugInfo: deliverable.debugInfo || {}
    };
  }

  /**
   * 构建 Prompt（符合计划要求的方法）
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Object} deliverable - 交付物信息
   * @param {Object} implementationPlan - 实现计划
   */
  /**
   * 构建 Prompt
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Object} deliverable - 当前要处理的交付物
   * @param {Object} implementationPlan - 实现计划
   * @param {Array} allDeliverables - 所有交付物列表（作为参考，不要求全部生成）
   * @returns {string} 生成的 prompt
   */
  buildPrompt(parsedTask, deliverable, implementationPlan = null, allDeliverables = null) {
    // =====================================================
    // System Prompt - 极简版，仅包含身份和输出格式
    // =====================================================
    // 【优化】检测是否是单文件任务，简化 System Prompt
    // 注意：由于是按 deliverable 逐个调用，每个 deliverable 本身就是单文件任务
    // 所以 allDeliverables 参数在这里的语义是"参考上下文"，不需要用它来判断
    const isSingleFileTask = true; // 每个 buildPrompt 调用都是单文件任务

    const systemPrompt = isSingleFileTask
      ? `You are a code generation assistant.

Generate the single file listed in the user message. Use the write_file tool.
Return the tool call in your response.
Do not return any text or comments.

## Output Format
{
  "type": "tool_use",
  "name": "write_file",
  "input": {
    "file_path": "your/file/path.ts",
    "content": "your code here"
  }
}`
      : `You are a code generation assistant.

Generate the files listed in the user message. Use the write_file tool for EACH file listed.
Return ALL tool calls in ONE single response.
Do not return any text or comments.

## Output Format Example
Each tool call must be in this exact format:
{
  "type": "tool_use",
  "name": "write_file",
  "input": {
    "file_path": "example/path/file.ts",
    "content": "file content here"
  }
}

For multiple files, return an array of tool_use blocks:
[
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "file1.ts",
      "content": "content 1"
    }
  },
  {
    "type": "tool_use",
    "name": "write_file",
    "input": {
      "file_path": "file2.ts",
      "content": "content 2"
    }
  }
]`;

    // =====================================================
    // User Prompt - 精简版
    // =====================================================
    const promptParts = [];

    // 1. 项目标题
    promptParts.push('# ' + (parsedTask.title || parsedTask.task || 'Code Generation Task'));
    promptParts.push('');

    // 2. 需求描述
    if (parsedTask.requirement) {
      promptParts.push('## Requirement');
      promptParts.push(parsedTask.requirement);
      promptParts.push('');
    }

    // 3. Implementation Plan（精简版：仅技术栈）
    if (implementationPlan?.tech_stack) {
      promptParts.push('## Tech Stack');
      promptParts.push(implementationPlan.tech_stack.join(', '));
      promptParts.push('');
    }

    // 4. 当前任务
    promptParts.push('## Current Task');
    promptParts.push(this.formatDeliverable(deliverable));
    promptParts.push('');

    // 5. 注入类型 content（如果 deliverable 有预生成的内容）
    const typeContent = this.buildTypeContent(deliverable, implementationPlan);
    if (typeContent) {
      promptParts.push(typeContent);
    }

    // 6. 契约生成的类型定义（仅当没有通过 buildTypeContent 输出时）
    // 避免重复输出相同的类型内容
    // 【修复】仅当存在 TypeScript 代码文件且 buildTypeContent 返回空时才注入
    const hasTypeContent = !!typeContent;
    if (!hasTypeContent && implementationPlan?.contract_first) {
      const fp = deliverable.filePath || '';
      const isTsFile = fp.endsWith('.ts') || fp.endsWith('.tsx');
      // 【修改】只有 TS/TSX 文件才注入契约类型，配置文件不需要
      if (isTsFile) {
        const contractTypesSection = this.buildTypeContent(null, implementationPlan);
        if (contractTypesSection) {
          promptParts.push(contractTypesSection);
        }
      }
    }

    // 7. 所有项目文件列表（精简版）
    // 【优化】单文件任务时隐藏其他文件列表，避免干扰
    if (!isSingleFileTask && allDeliverables && Array.isArray(allDeliverables) && allDeliverables.length > 1) {
      promptParts.push('## Other Project Files');
      promptParts.push(`(${allDeliverables.length} files total, you generate only CURRENT TASK)`);
      promptParts.push('');
    }

    const prompt = promptParts.join('\n');

    return {
      systemPrompt: systemPrompt,
      prompt: prompt
    };
  }

  /**
   * 构建修复专用的 Prompt - 支持代码上下文注入和明确输出格式
   * @param {Object} parsedTask - 解析后的任务对象
   * @param {Object} deliverable - 交付物信息
   * @param {string} currentFileContent - 当前文件内容
   * @param {Object} options - 修复选项
   * @returns {string} 生成的修复 Prompt
   */
  buildPromptForFix(parsedTask, deliverable, currentFileContent = '', options = {}) {
    const parts = [];

    // 修复任务标题
    parts.push(`# Fix Request: ${parsedTask.title || 'Code Fix'}`);
    parts.push('');

    // 修复描述
    if (parsedTask.description) {
      parts.push('## Fix Description');
      parts.push(parsedTask.description);
      parts.push('');
    }

    // 冲突信息（如果有）
    if (parsedTask.conflicts && Array.isArray(parsedTask.conflicts)) {
      parts.push('## Conflicts to Fix');
      for (const conflict of parsedTask.conflicts) {
        parts.push(`- [${conflict.severity || 'MEDIUM'}] ${conflict.type}: ${conflict.suggestion || conflict.details?.error_message || 'No details'}`);
      }
      parts.push('');
    }

    // 当前文件内容（代码上下文注入）
    parts.push('## Current File Content');
    parts.push(`**File Path:** ${deliverable.filePath || 'unknown'}`);
    parts.push('');
    parts.push('```' + this.inferLanguageFromFile(deliverable.filePath));
    parts.push(currentFileContent || '// No existing content available');
    parts.push('```');
    parts.push('');

    // 修复要求
    parts.push('## Fix Requirements');
    if (parsedTask.changes && Array.isArray(parsedTask.changes)) {
      parts.push('Make the following changes:');
      for (const change of parsedTask.changes) {
        parts.push(`- ${change}`);
      }
      parts.push('');
    }

    // Use the standard output format section method (overriding the general one with fix-specific requirements)
    parts.push('## Output Format Requirements');
    parts.push('**IMPORTANT:** You MUST output the complete fixed file content in the following format ONLY:');
    parts.push('');
    parts.push('```' + this.inferLanguageFromFile(deliverable.filePath));
    parts.push('// Your complete fixed code here - the entire file content after applying fixes');
    parts.push('```');
    parts.push('');
    parts.push('### Critical Requirements:');
    parts.push('1. Output the **COMPLETE** fixed file content in a SINGLE code block, not just the changed parts');
    parts.push('2. Preserve all existing functionality that is not being fixed');
    parts.push('3. Keep existing code style, formatting, and comments where possible');
    parts.push('4. Only make the necessary changes to fix the described issues');
    parts.push('5. Ensure the fixed code is syntactically correct and ready to use');
    parts.push('6. **DO NOT include any thinking, reasoning, or analysis content** (如 <think> 或</think>)');
    parts.push('7. **DO NOT include any explanatory text** outside the code block');
    parts.push('8. **DO NOT use thinking tags** like <think>,</think>,<thinking> or similar');
    parts.push('9. Output ONLY the final code - no preambles, no explanations, no analysis');
    parts.push('');

    // 上下文信息（如果有）
    if (parsedTask.context && Object.keys(parsedTask.context).length > 0) {
      parts.push('## Context');
      for (const [key, value] of Object.entries(parsedTask.context)) {
        if (typeof value === 'object') {
          parts.push(`- ${key}: ${JSON.stringify(value)}`);
        } else {
          parts.push(`- ${key}: ${value}`);
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * 根据文件扩展名推断语言
   * @param {string} filePath - 文件路径
   * @returns {string} 语言标识符
   */
  inferLanguageFromFile(filePath) {
    if (!filePath) return 'typescript';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'json': 'json',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'html': 'html',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'sh': 'bash',
      'sql': 'sql'
    };

    return langMap[ext] || 'typescript';
  }

  /**
   * 构建输出格式要求部分（简化版）
   * @param {string} filePath - 文件路径
   * @returns {string} 输出格式要求文本
   */
  buildOutputFormatSection(filePath) {
    // 根据文件类型返回适当的格式指导
    const ext = filePath?.split('.').pop()?.toLowerCase() || '';

    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      return `## Output Format

Generate complete code. Must:
1. Include all necessary import statements
2. Include all necessary export statements
3. No placeholders, TODOs, or explanatory text
4. Code syntax must be correct
5. Output ONLY the code, no descriptions like "I will generate..." or "I'll create..."`;
    }

    if (['vue', 'svelte'].includes(ext)) {
      return `## Output Format

Generate complete code. Must:
1. Include <template>, <script>, and <style> sections
2. Use appropriate syntax (Vue3 composition API or Svelte)
3. No placeholders, TODOs, or explanatory text
4. Output ONLY the code, no descriptions`;
    }

    return '';
  }

  /**
   * 格式化交付物信息
   * 生成明确的代码生成指令
   */
  formatDeliverable(item) {
    // 使用 types 数组获取主类型
    const types = item.types || [];
    const primaryType = types.length > 0 ? types[0].type : 'unknown';

    // 生成明确的文件生成指令
    const filePath = item.filePath || 'unknown';
    const description = item.description || 'No description';

    // 根据文件扩展名推断语言
    const ext = filePath.split('.').pop()?.toLowerCase();

    let output = `## GENERATE THIS FILE

File Path: ${filePath}
Description: ${description}
Type: ${primaryType}
`;

    // 为 UI/组件文件添加样式关联提醒
    if (['ui', 'component', 'frontend', 'style'].includes(primaryType?.toLowerCase())) {
      output += `
### Style/Resource Files:
- If this file imports style files (e.g., .css, .scss, .less), ensure the corresponding style file exists or inline styles in this file
- If this is a Web component, may need accompanying shadow DOM styles or external CSS files
`;
    }

    // 为后端/API 文件添加模型/数据库关联提醒
    if (['api', 'backend', 'logic', 'service'].includes(primaryType?.toLowerCase())) {
      output += `
### Data Model Dependencies:
- If this file uses data models (e.g., User, Product), those models must be defined in the deliverables type definition file or model file
- If this file needs database connection/initialization, ensure the related db module file exists
`;
    }

    output += `
Please generate the complete code for the file above.`;

    return output;
  }

  /**
   * 根据交付物类型选择合适的模板
   */
  selectTemplate(deliverable) {
    // 使用 types 数组获取主类型
    const types = deliverable.types || [];
    const type = types.length > 0 ? types[0].type : (deliverable.type || 'general');

    // 根据类型映射到适当的模板
    switch (type.toLowerCase()) {
      case 'ui':
      case 'component':
      case 'frontend':
        return 'ui';
      case 'style':
      case 'css':
      case 'scss':
        return 'style';
      case 'api':
      case 'endpoint':
      case 'backend':
        return 'api';
      case 'test':
      case 'testing':
        return 'test';
      default:
        return 'general';
    }
  }

  /**
   * 格式化上下文信息
   */
  formatContext(context) {
    if (!context) return 'None';

    const lines = [];
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'object' && Array.isArray(value)) {
        lines.push(`- ${key}: ${value.join(', ')}`);
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`- ${key}: ${value}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : 'None';
  }

  /**
   * 生成子任务 ID
   */
  generateSubtaskId() {
    return `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 标准化子任务中的文件路径
   *
   * @param {Object} subtask - 子任务对象
   * @returns {Promise<Object>} 标准化后的子任务对象
   */
  async normalizeSubtaskPaths(subtask) {
    if (!this.pathNormalizer || !subtask) {
      return subtask;
    }

    const normalizedSubtask = { ...subtask };

    // 标准化主要文件路径
    if (subtask.filePath) {
      try {
        const pathResult = await this.pathNormalizer.normalize(subtask.filePath, {
          validateExistence: false,
          normalizeSeparators: true,
          normalizeCase: true
        });
        normalizedSubtask.filePath = pathResult.normalizedPath;
      } catch (error) {
        console.warn(`标准化子任务路径失败: ${error.message}`, { filePath: subtask.filePath });
      }
    }

    // 标准化整合提示中的目标文件路径
    if (subtask.integrationHints && subtask.integrationHints.targetFile) {
      try {
        const pathResult = await this.pathNormalizer.normalize(subtask.integrationHints.targetFile, {
          validateExistence: false,
          normalizeSeparators: true,
          normalizeCase: true
        });
        if (!normalizedSubtask.integrationHints) {
          normalizedSubtask.integrationHints = {};
        }
        normalizedSubtask.integrationHints.targetFile = pathResult.normalizedPath;
      } catch (error) {
        console.warn(`标准化整合目标路径失败: ${error.message}`, { targetFile: subtask.integrationHints.targetFile });
      }
    }

    return normalizedSubtask;
  }

  /**
   * 批量标准化子任务中的文件路径
   *
   * @param {Array} subtasks - 子任务数组
   * @returns {Promise<Array>} 标准化后的子任务数组
   */
  async normalizeSubtaskPathsBatch(subtasks) {
    if (!Array.isArray(subtasks)) {
      return subtasks;
    }

    const normalizedSubtasks = [];
    for (const subtask of subtasks) {
      normalizedSubtasks.push(await this.normalizeSubtaskPaths(subtask));
    }

    return normalizedSubtasks;
  }

  /**
   * 格式化实现计划以供 Prompt 使用
   * @param {Object} implementationPlan - 实现计划对象
   * @param {Object} [deliverable] - 可选的交付物对象，用于区分前后端任务
   * @returns {string} 格式化后的实现计划字符串
   */
  formatImplementationPlanForPrompt(implementationPlan, deliverable = null) {
    if (!implementationPlan) return '';

    const parts = [];

    // 仅保留最关键的技术信息
    if (implementationPlan.tech_stack) {
      parts.push(`- Tech Stack: ${implementationPlan.tech_stack.join(', ')}`);
    }

    if (implementationPlan.architecture_patterns) {
      parts.push(`- Architecture: ${implementationPlan.architecture_patterns.join(', ')}`);
    }

    if (implementationPlan.dependencies) {
      parts.push(`- Dependencies: ${implementationPlan.dependencies.join(', ')}`);
    }

    // 共享上下文信息（仅在 user prompt 中显示，不在 system prompt 中）
    if (implementationPlan.shared_context) {
      const sc = implementationPlan.shared_context;

      // API 配置
      if (sc.api_config) {
        if (sc.api_config.baseURL) {
          parts.push(`- API Base URL: ${sc.api_config.baseURL}`);
        }
        if (sc.api_config.port) {
          parts.push(`- Port: ${sc.api_config.port}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 构建 Mock 数据部分（用于前端任务）
   * 当启用 mock_service_layer 时为此任务注入 Mock 数据引用
   * @param {Object} implementationPlan - 实现计划对象
   * @param {Object} deliverable - 当前交付物
   * @returns {string} 格式化后的 Mock 数据部分
   */
  buildMockDataSection(implementationPlan, deliverable = {}) {
    // 【修复】强制禁用 Mock 服务层
    return '';
    // 原有实现已不再使用
  }

  /**
   * 构建类型引用部分
   * 当 deliverable 有 content 时，输出完整类型定义
   * @param {Object} deliverable - 当前交付物
   * @param {Object} implementationPlan - 实现计划
   * @returns {string} 类型引用文本
   */
  buildTypeContent(deliverable, implementationPlan) {
    // 如果 deliverable 有 content 且是类型定义文件，直接输出
    if (deliverable?.content && (deliverable.type === 'types' || deliverable.filePath?.includes('types/index'))) {
      console.log('[PromptGenerator] 检测到类型文件有预生成 content，直接输出');
      return [
        '### Type Definition File - Output Complete Content',
        '',
        '**This is the Type Definition file - output the EXACT content below using write_file:**',
        '',
        '```typescript',
        deliverable.content,
        '```',
        ''
      ].join('\n');
    }

    const filePath = deliverable?.filePath || '';

    // 【修改】按需注入：优先使用结构化解析
    const typesContent = implementationPlan?._typesDeliverableContent ||
                         implementationPlan?.generated_types ||
                         implementationPlan?.auto_generated_types;

    if (typesContent) {
      // 尝试使用结构化解析（按 FILE 标记分组）
      const { commonTypes, fileTypesMap } = this.parseGroupedTypesContent(typesContent);

      // 【关键】检查结构化解析是否成功：typesContent 有内容且解析后有分组
      const parsingSucceeded = typesContent.trim().length > 0 &&
                               (commonTypes.trim().length > 0 || Object.keys(fileTypesMap).length > 0);

      if (parsingSucceeded) {
        // 结构化解析成功，进行按需匹配

        // 使用路径规范化进行匹配（与 getTypesForFile 保持一致）
        const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
        let fileTypes = fileTypesMap[filePath];

        // 如果精确匹配失败，尝试路径规范化匹配
        if (!fileTypes) {
          for (const [key, value] of Object.entries(fileTypesMap)) {
            const normalizedKey = key.replace(/\.(ts|tsx)$/, '');
            if (normalizedKey === normalizedFilePath) {
              fileTypes = value;
              break;
            }
          }
        }

        // 【优化】只注入文件专属类型，COMMON 不再注入（如果契约生成正确，文件类型应自包含）
        // 优先级：
        // 1. 如果有文件专属类型 fileTypes → 只注入 fileTypes
        // 2. 如果没有 fileTypes 但有 commonTypes → 注入 commonTypes（兜底）
        // 3. 如果都没有，返回空
        if (fileTypes) {
          // 文件有专属类型，只注入专属类型（契约生成时已按需分配，应自包含）
          console.log(`[PromptGenerator] 按需注入类型 for ${filePath}: 包含文件专属类型`);

          const typeNames = this._extractTypeNames(fileTypes);
          const importStatement = typeNames.length > 0
            ? `import type { ${typeNames.join(', ')} } from '../types';`
            : '';

          const importSection = importStatement
            ? [
                '',
                '**Important:** Import types from the generated file:',
                '```typescript',
                importStatement,
                '```',
                ''
              ].join('\n')
            : '';

          // 契约注入
          const contractSection = this._buildContractSection(filePath, implementationPlan);

          return [
            '### TypeScript Interfaces (On-Demand)',
            '```typescript',
            fileTypes,
            '```',
            importSection,
            contractSection
          ].join('\n');

        } else if (commonTypes.trim()) {
          // 没有文件专属类型，但有 COMMON 类型 → 作为兜底注入
          console.log(`[PromptGenerator] 按需注入类型 for ${filePath}: 无文件专属类型，注入COMMON类型`);

          const typeNames = this._extractTypeNames(commonTypes);
          const importStatement = typeNames.length > 0
            ? `import type { ${typeNames.join(', ')} } from '../types';`
            : '';

          const importSection = importStatement
            ? [
                '',
                '**Important:** Import types from the generated file:',
                '```typescript',
                importStatement,
                '```',
                ''
              ].join('\n')
            : '';

          // 契约注入
          const contractSection = this._buildContractSection(filePath, implementationPlan);

          return [
            '### TypeScript Interfaces (On-Demand)',
            '```typescript',
            commonTypes,
            '```',
            importSection,
            contractSection
          ].join('\n');
        }

        // 文件没有对应的类型分组且没有 COMMON 类型，返回空
        console.log(`[PromptPrompt] 跳过类型注入 for ${filePath}: 文件无对应类型分组`);
        return '';
      }

      // 结构化解析本身失败（typesContent 为空或解析错误），返回空（节省资源）
      console.log('[PromptGenerator] 结构化解析失败，返回空');
      return '';
    }

    return '';
  }

  /**
   * 从类型代码中提取类型名称
   * @private
   * @param {string} typesCode - TypeScript 类型代码
   * @returns {string[]} 类型名称数组
   */
  _extractTypeNames(typesCode) {
    if (!typesCode) return [];

    const names = [];
    // 匹配 export interface Xxx 和 export type Xxx
    const interfaceMatches = typesCode.matchAll(/export\s+interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      names.push(match[1]);
    }
    const typeMatches = typesCode.matchAll(/export\s+type\s+(\w+)/g);
    for (const match of typeMatches) {
      names.push(match[1]);
    }
    return names;
  }

  /**
   * 构建契约内容 section（按需注入）
   * @private
   * @param {string} filePath - 文件路径
   * @param {Object} implementationPlan - 实现计划
   * @returns {string} 契约内容 section
   */
  _buildContractSection(filePath, implementationPlan) {
    const contractContent = implementationPlan?._contractDeliverableContent;
    if (!contractContent) {
      return '';
    }

    // 契约文件可能使用不同的分组格式：
    // 类型文件: "// [COMMON]" 和 "// [FILE: path]"
    // 契约文件: "## [COMMON]" 和 "## [FILE: path]"
    // 尝试两种格式解析
    let { commonTypes: commonAPIs, fileTypesMap: fileAPIMap } =
      this.parseGroupedTypesContent(contractContent);

    // 如果解析失败（没有 COMMON 和 FILE 标记），尝试使用契约文件专用解析
    if (!commonAPIs.trim() && Object.keys(fileAPIMap).length === 0) {
      // 尝试使用 ## 格式解析契约
      const parsed = this._parseContractContent(contractContent);
      if (parsed) {
        commonAPIs = parsed.commonAPIs || '';
        fileAPIMap = parsed.fileAPIMap || {};
      }
    }

    const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
    let fileAPIs = fileAPIMap[filePath];

    if (!fileAPIs) {
      for (const [key, value] of Object.entries(fileAPIMap)) {
        const normalizedKey = key.replace(/\.(ts|tsx)$/, '');
        if (normalizedKey === normalizedFilePath) {
          fileAPIs = value;
          break;
        }
      }
    }

    // 【优化】只注入文件专属契约，COMMON 不再注入（如果契约生成正确，文件契约应自包含）
    // 优先级：
    // 1. 如果有文件专属契约 fileAPIs → 只注入 fileAPIs
    // 2. 如果没有 fileAPIs 但有 commonAPIs → 注入 commonAPIs（兜底）
    // 3. 如果都没有，返回空
    if (fileAPIs) {
      // 文件有专属契约，只注入专属契约
      console.log(`[PromptGenerator] 按需注入契约 for ${filePath}: 包含文件专属契约`);
      return [
        '### API Contract (On-Demand)',
        '```',
        fileAPIs,
        '```',
        ''
      ].join('\n');

    } else if (commonAPIs.trim()) {
      // 没有文件专属契约，但有 COMMON 契约 → 作为兜底注入
      console.log(`[PromptGenerator] 按需注入契约 for ${filePath}: 无文件专属契约，注入COMMON契约`);
      return [
        '### API Contract (On-Demand)',
        '```',
        commonAPIs,
        '```',
        ''
      ].join('\n');
    }

    return '';
  }

  /**
   * 解析契约文件内容（支持 ## 标记格式）
   * @private
   */
  _parseContractContent(contractContent) {
    if (!contractContent || typeof contractContent !== 'string') {
      return null;
    }

    const result = {
      commonAPIs: '',
      fileAPIMap: {}
    };

    const lines = contractContent.split('\n');

    let currentSection = 'common';
    let currentFilePath = null;
    let currentContent = [];

    for (const line of lines) {
      // 检测契约文件标记（## 格式）
      const fileMatch = line.match(/^##\s*\[FILE:\s*([^\]]+)\]/);
      const commonMatch = line.match(/^##\s*\[COMMON\]/);

      if (fileMatch) {
        // 保存上一个内容
        if (currentFilePath) {
          result.fileAPIMap[currentFilePath] = currentContent.join('\n');
        } else if (currentContent.length > 0) {
          result.commonAPIs = currentContent.join('\n');
        }
        // 开始新文件
        currentFilePath = fileMatch[1].trim();
        currentContent = [];
        currentSection = 'file';
      } else if (commonMatch) {
        // 保存上一个内容
        if (currentFilePath) {
          result.fileAPIMap[currentFilePath] = currentContent.join('\n');
        } else if (currentContent.length > 0) {
          result.commonAPIs = currentContent.join('\n');
        }
        // 开始 COMMON 部分
        currentFilePath = null;
        currentContent = [];
        currentSection = 'common';
      } else {
        currentContent.push(line);
      }
    }

    // 保存最后一个内容块
    if (currentFilePath) {
      result.fileAPIMap[currentFilePath] = currentContent.join('\n');
    } else if (currentContent.length > 0) {
      result.commonAPIs = currentContent.join('\n');
    }

    return (result.commonAPIs.trim() || Object.keys(result.fileAPIMap).length > 0) ? result : null;
  }

  /**
   * 将 JSON Schema 转换为 TypeScript 类型
   * @private
   */
  _schemaToTypeScript(schema) {
    if (schema.type === 'array' && schema.items) {
      return `${this._schemaToTypeScript(schema.items)}[]`;
    }
    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties)
        .map(([k, v]) => `  ${k}: ${this._schemaToTypeScript(v)}`)
        .join('; ');
      return `{ ${props} }`;
    }
    switch (schema.type) {
      case 'string': return 'string';
      case 'integer':
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'array': return 'unknown[]';
      case 'object': return 'Record<string, unknown>';
      default: return 'unknown';
    }
  }

  /**
   * 根据文件路径过滤相关的 Schema
   * 实现按需注入类型定义的核心逻辑
   * @private
   * @param {Object} openapiSpec - OpenAPI 规范对象
   * @param {string} filePath - 文件路径
   * @returns {string[]} 相关的 schema 名称数组
   */
  _filterSchemasByFilePath(openapiSpec, filePath) {
    if (!openapiSpec?.components?.schemas) {
      return [];
    }

    const schemas = openapiSpec.components.schemas;
    const schemaNames = Object.keys(schemas);
    const filePathLower = filePath.toLowerCase();

    // 文件路径特征词提取
    const features = new Set();
    const pathParts = filePathLower.split(/[\/\\,._-]/);
    pathParts.forEach(part => {
      if (part.length > 2) features.add(part);
    });

    // 计算每个 schema 与文件路径的相关性得分
    const scoredSchemas = schemaNames.map(name => {
      const nameLower = name.toLowerCase();
      let score = 0;

      // 1. 完全匹配（最高优先级）
      if (nameLower === pathParts[pathParts.length - 1]?.toLowerCase()) {
        score += 100;
      }

      // 2. 文件路径中包含 schema 名称
      if (features.has(nameLower)) {
        score += 50;
      }

      // 3. schema 名称在文件路径中
      for (const feature of features) {
        if (nameLower.includes(feature) || feature.includes(nameLower)) {
          score += 10;
        }
      }

      // 4. 常见类型（几乎所有文件都可能用到）
      if (['user', 'product', 'order', 'cart', 'api'].some(t => nameLower.includes(t))) {
        // 这些类型额外加分
        if (features.has(t)) {
          score += 20;
        }
      }

      // 5. 通用响应类型（ApiError, SuccessResponse, PaginationMeta）
      if (['apierror', 'successresponse', 'paginationmeta', 'apiauth'].some(t => nameLower === t)) {
        score += 5; // 通用类型低优先级
      }

      return { name, score };
    });

    // 按得分排序，取最高分且得分>0的 schema
    scoredSchemas.sort((a, b) => b.score - a.score);

    // 如果没有匹配的，返回通用类型
    const matchedSchemas = scoredSchemas.filter(s => s.score > 0).map(s => s.name);
    if (matchedSchemas.length === 0) {
      // 返回通用类型作为后备
      const fallbackSchemas = schemaNames.filter(name =>
        ['apierror', 'successresponse', 'paginationmeta'].includes(name.toLowerCase())
      );
      return fallbackSchemas;
    }

    // 限制返回数量，最多返回 10 个相关的 schema
    return matchedSchemas.slice(0, 10);
  }

  /**
   * 从 schema 集合生成 TypeScript 类型定义（仅包含指定的 schemas）
   * @private
   * @param {Object} openapiSpec - OpenAPI 规范对象
   * @param {string[]} schemaNames - 要包含的 schema 名称数组
   * @returns {string} TypeScript 类型定义代码
   */
  _generateFilteredTypeDefinitions(openapiSpec, schemaNames) {
    if (!openapiSpec?.components?.schemas || !schemaNames.length) {
      return '';
    }

    const schemas = openapiSpec.components.schemas;
    const lines = [];

    lines.push('/**');
    lines.push(' * TypeScript 类型定义（按需生成）');
    lines.push(' * 基于 OpenAPI 契约自动生成');
    lines.push(' */');
    lines.push('');

    // 添加直接匹配的 schema
    for (const name of schemaNames) {
      const schema = schemas[name];
      if (schema) {
        lines.push(this._generateInterface(name, schema));
        lines.push('');
      }
    }

    // 检查是否有引用的类型需要一起添加
    const allTypes = new Set(schemaNames);
    for (const name of schemaNames) {
      const schema = schemas[name];
      if (schema?.properties) {
        for (const [, propSchema] of Object.entries(schema.properties)) {
          if (propSchema.$ref) {
            const refName = propSchema.$ref.split('/').pop();
            if (!allTypes.has(refName)) {
              allTypes.add(refName);
              const refSchema = schemas[refName];
              if (refSchema) {
                lines.push(this._generateInterface(refName, refSchema));
                lines.push('');
              }
            }
          }
          // 处理数组类型
          if (propSchema.type === 'array' && propSchema.items?.$ref) {
            const refName = propSchema.items.$ref.split('/').pop();
            if (!allTypes.has(refName)) {
              allTypes.add(refName);
              const refSchema = schemas[refName];
              if (refSchema) {
                lines.push(this._generateInterface(refName, refSchema));
                lines.push('');
              }
            }
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成单个接口的 TypeScript 代码
   * @private
   */
  _generateInterface(name, schema) {
    const lines = [];

    if (schema.type === 'object' && schema.properties) {
      lines.push(`export interface ${name} {`);
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const optional = schema.required?.includes(propName) ? '' : '?';
        const typeStr = this._schemaToTypeScript(propSchema);
        const description = propSchema.description ? ` // ${propSchema.description}` : '';
        lines.push(`  ${propName}${optional}: ${typeStr};${description}`);
      }
      lines.push('}');
    } else {
      lines.push(`export type ${name} = ${this._schemaToTypeScript(schema)};`);
    }

    return lines.join('\n');
  }

  /**
   * 解析分组格式的类型定义
   * 从架构师模型返回的 types/index.ts 内容中提取每个文件关联的类型
   * @param {string} typesContent - 类型定义文件内容
   * @returns {Object} { commonTypes: string, fileTypesMap: { filePath: typesCode } }
   */
  parseGroupedTypesContent(typesContent) {
    if (!typesContent || typeof typesContent !== 'string') {
      return { commonTypes: '', fileTypesMap: {} };
    }

    const result = {
      commonTypes: '',
      fileTypesMap: {}
    };

    // 分割内容为行
    const lines = typesContent.split('\n');

    let commonContent = [];  // 用于收集 COMMON 区域的内容
    let fileContentMap = new Map();  // 用于按文件收集内容
    let currentFilePath = null;

    for (const line of lines) {
      // 检测文件标记
      // 支持带有尾部注释的标记，如 "// [FILE: server/routes/auth.ts] - 认证路由"
      const fileMatch = line.match(/^\/\/\s*\[FILE:\s*([^\]]+)\]/);
      // 支持带有尾部注释的标记，如 "// [COMMON] 通用类型 - 被多个文件共享"
      const commonMatch = line.match(/^\/\/\s*\[COMMON\]/);

      if (fileMatch) {
        // 保存上一个文件的内容
        if (currentFilePath) {
          fileContentMap.set(currentFilePath, fileContentMap.get(currentFilePath) || []);
        }
        // 开始新文件
        currentFilePath = fileMatch[1].trim();
        fileContentMap.set(currentFilePath, []);
      } else if (commonMatch) {
        // 保存上一个文件的内容
        if (currentFilePath) {
          fileContentMap.set(currentFilePath, fileContentMap.get(currentFilePath) || []);
        }
        // 开始 COMMON 部分
        currentFilePath = null;
        commonContent = [];
      } else {
        // 根据当前所在 section 决定加入哪里
        if (currentFilePath) {
          const content = fileContentMap.get(currentFilePath) || [];
          content.push(line);
          fileContentMap.set(currentFilePath, content);
        } else {
          // 在 COMMON 区域
          commonContent.push(line);
        }
      }
    }

    // 保存最后一个内容块
    if (currentFilePath) {
      fileContentMap.set(currentFilePath, fileContentMap.get(currentFilePath) || []);
    }

    // 转换 Map 为普通对象
    for (const [path, content] of fileContentMap.entries()) {
      if (content.length > 0) {
        result.fileTypesMap[path] = content.join('\n');
      }
    }

    // 保存 COMMON 内容
    if (commonContent.length > 0) {
      result.commonTypes = commonContent.join('\n');
    }

    return result;
  }

  /**
   * 根据文件路径获取对应的类型定义
   * 解析分组格式并提取指定文件的类型代码
   * @param {string} typesContent - 完整的类型定义内容
   * @param {string} filePath - 要查询的文件路径
   * @returns {string} 对应的类型定义代码
   */
  getTypesForFile(typesContent, filePath) {
    const { commonTypes, fileTypesMap } = this.parseGroupedTypesContent(typesContent);

    // 精确匹配
    if (fileTypesMap[filePath]) {
      return commonTypes + (commonTypes ? '\n\n' : '') + fileTypesMap[filePath];
    }

    // 尝试路径匹配（如 "src/pages/Home.tsx" 可能匹配 "src/pages/Home")
    const normalizedFilePath = filePath.replace(/\.(ts|tsx)$/, '');
    for (const [key, value] of Object.entries(fileTypesMap)) {
      if (key.replace(/\.(ts|tsx)$/, '') === normalizedFilePath) {
        return commonTypes + (commonTypes ? '\n\n' : '') + value;
      }
    }

    // 如果没有匹配，返回通用类型
    return commonTypes;
  }

  /**
   * 构建后端路由骨架（由 ContractGenerator 自动生成）
   * 当启用 contract_first 时为后端子任务注入路由模板和验证规则
   * @param {Object} implementationPlan - 实现计划对象
   * @param {Object} deliverable - 当前交付物
   * @returns {string} 格式化后的后端路由骨架
   */
  buildBackendRouteSkeleton(implementationPlan, deliverable = {}) {
    if (!implementationPlan?.contract_first) {
      return '';
    }

    // 仅对后端任务注入路由骨架
    if (!this._isBackendTask(deliverable, implementationPlan)) {
      return '';
    }

    const parts = [];
    parts.push('### Backend Route Skeleton (Auto-Generated from Contract)');
    parts.push('');
    parts.push('Use this route skeleton to implement your API endpoints. DO NOT modify the paths or method signatures.');
    parts.push('');

    // 从 openapi_spec 中提取路径信息
    const openapiSpec = implementationPlan.openapi_spec;
    if (openapiSpec?.paths) {
      const routeTemplates = [];

      for (const [path, methods] of Object.entries(openapiSpec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
            continue;
          }

          const operationId = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
          const summary = operation.summary || operation.description || '';
          const requestBodySchema = operation.requestBody?.content?.['application/json']?.schema;
          const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;

          routeTemplates.push({
            method: method.toUpperCase(),
            path,
            operationId,
            summary,
            requestBodySchema,
            responseSchema
          });
        }
      }

      // 根据文件路径筛选相关路由
      const deliverablePath = deliverable.filePath || '';
      const relevantRoutes = routeTemplates.filter(r => {
        // 简单的路径匹配启发式
        return deliverablePath.includes('routes') ||
               deliverablePath.includes('api') ||
               r.path.includes(deliverablePath.split('/').pop()?.replace('.ts', ''));
      });

      if (relevantRoutes.length > 0) {
        parts.push('```typescript');
        for (const route of relevantRoutes) {
          parts.push(`// ${route.summary}`);
          parts.push(`router.${route.method.toLowerCase()}('${route.path}', async (req, res) => {`);

          // 添加请求体验证
          if (route.requestBodySchema) {
            parts.push(`  // Request body validation`);
            parts.push(`  const body = req.body;`);
            parts.push(`  if (!validateBody(body, '${JSON.stringify(route.requestBodySchema)}')) {`);
            parts.push(`    return res.status(400).json({ error: 'Invalid request body' });`);
            parts.push(`  }`);
          }

          // 添加响应格式
          if (route.responseSchema) {
            parts.push(`  // Response: ${this._schemaToTypeScript(route.responseSchema)}`);
            parts.push(`  const response: ${this._schemaToTypeScript(route.responseSchema)}`);
          }

          parts.push(`  // TODO: Implement ${route.operationId}`);
          parts.push(`  res.status(501).json({ error: 'Not implemented' });`);
          parts.push(`});`);
          parts.push('');
        }
        parts.push('```');
      } else {
        parts.push('```typescript');
        parts.push('// Implement your routes here based on the API contract');
        parts.push('// Route paths are defined in the OpenAPI specification');
        parts.push('```');
      }
    } else {
      parts.push('```typescript');
      parts.push('// Implement your routes here');
      parts.push('// Routes will be validated against the API contract');
      parts.push('```');
    }

    parts.push('');
    parts.push('**Validation Rules:**');
    parts.push('- Response body MUST match the schema defined in the contract');
    parts.push('- HTTP status codes: 200 for success, 400 for bad request, 401 for unauthorized, 404 for not found, 500 for server error');
    parts.push('- DO NOT change the path or method signature');
    parts.push('');

    return parts.join('\n');
  }

  /**
   * 获取任务的类别（frontend/backend/quality）
   * @param {Object} deliverable - 交付物对象
   * @returns {string|null} 类别
   * @private
   */
  _getTaskCategory(deliverable) {
    if (!deliverable) return null;

    // 1. 首先检查 types 数组（经过 TypeAnnotator 标注的）
    // types 数组元素格式：{ type: 'ui', confidence: 0.9, source: 'keyword', label: '...' }
    if (deliverable.types && Array.isArray(deliverable.types) && deliverable.types.length > 0) {
      // 取置信度最高的类型
      const topType = deliverable.types[0];
      if (topType && topType.type) {
        const category = TYPE_CATEGORY_MAP[topType.type];
        if (category) return category;
      }
    }

    // 2. 检查 deliverable.type（原始请求中的类型）
    if (deliverable.type) {
      const category = TYPE_CATEGORY_MAP[deliverable.type];
      if (category) return category;
    }

    // 3. 检查 tags
    if (deliverable.tags && Array.isArray(deliverable.tags)) {
      for (const tag of deliverable.tags) {
        if (tag === 'frontend' || tag === 'backend' || tag === 'quality') {
          return tag;
        }
        const category = TYPE_CATEGORY_MAP[tag];
        if (category) return category;
      }
    }

    // 4. 检查文件路径作为后备判断
    const filePath = deliverable.filePath || '';
    if (filePath.includes('src/pages/') || filePath.includes('src/components/') || filePath.includes('src/App')) {
      return 'frontend';
    }
    if (filePath.includes('server/') || filePath.includes('routes/') || filePath.includes('controllers/')) {
      return 'backend';
    }

    return null;
  }

  /**
   * 检测是否为后端子任务
   * @private
   */
  _isBackendTask(deliverable, implementationPlan) {
    if (!deliverable) return false;

    const category = this._getTaskCategory(deliverable);
    if (category === 'backend') return true;

    // 后备：检查文件路径
    const filePath = deliverable.filePath || '';
    return filePath.includes('server/') ||
           filePath.includes('routes/') ||
           filePath.includes('api/') ||
           filePath.includes('controllers/') ||
           filePath.includes('handlers/');
  }

  /**
   * 检测是否为前端子任务
   * @private
   */
  _isFrontendTask(deliverable, implementationPlan) {
    if (!deliverable) return false;

    const category = this._getTaskCategory(deliverable);
    if (category === 'frontend') return true;

    // 后备：检查文件路径
    const filePath = deliverable.filePath || '';
    return filePath.includes('src/pages/') ||
           filePath.includes('src/components/') ||
           filePath.includes('src/App');

  }

  /**
   * 构建增量修改 Prompt（用于已有文件的精准修改）
   * 当 deliverable.isIncremental === true 时使用
   * @param {Object} deliverable - 交付物对象
   * @param {string} existingContent - 现有文件内容
   * @returns {string} 增量修改的 Prompt 指令
   */
  buildIncrementalPrompt(deliverable, existingContent) {
    if (!deliverable?.isIncremental) {
      return '';
    }

    const parts = [];
    parts.push('### Incremental Modification Rules');
    parts.push('');
    parts.push('**This is an INCREMENTAL modification to an existing file.**');
    parts.push('');
    parts.push('**Rules:**');
    parts.push('1. For existing files with region markers, generate ONLY between:');
    parts.push('   `// MARKER: {region}` ... `// END {region}`');
    parts.push('2. Keep all existing code outside markers UNCHANGED');
    parts.push('3. If no markers exist in the file, add new content at the appropriate location');
    parts.push('4. DO NOT rewrite the entire file');
    parts.push('');

    // 如果提供了现有内容，显示文件结构
    if (existingContent) {
      parts.push('**Current File Content:**');
      parts.push('```');
      parts.push(existingContent.substring(0, 2000)); // 限制显示长度
      if (existingContent.length > 2000) {
        parts.push('... (truncated)');
      }
      parts.push('```');
      parts.push('');
    }

    // 如果指定了 region，显示目标 region
    if (deliverable.region) {
      parts.push(`**Target Region:** \`// MARKER: ${deliverable.region}\` ... \`// END ${deliverable.region}\``);
      parts.push('');
    }

    return parts.join('\n');
  }
}

module.exports = PromptGenerator;
module.exports.EnhancedSubtask = EnhancedSubtask;
