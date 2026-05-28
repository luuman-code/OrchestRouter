/**
 * ContractGenerator - 契约生成器
 *
 * 根据任务和实现计划生成 OpenAPI 3.0 规范
 * 支持契约优先开发流程
 */

class ContractGenerator {
  /**
   * 创建契约生成器
   * @param {Object} config - 配置选项
   */
  constructor(config = {}) {
    this.config = {
      defaultVersion: '3.0.0',
      defaultTitle: 'API Contract',
      ...config
    };

    this.openapiSpec = null;
  }

  /**
   * 生成 OpenAPI 契约
   * @param {Object} task - 任务对象
   * @param {Object} implementationPlan - 实现计划
   * @returns {Promise<Object>} OpenAPI 规范对象
   */
  async generateContract(task, implementationPlan) {
    console.log('[ContractGenerator] 开始生成 OpenAPI 契约...');

    const title = implementationPlan?.title || task?.title || this.config.defaultTitle;
    const version = implementationPlan?.version || '1.0.0';

    // 调试日志：检查 api_endpoints 是否存在
    const apiEndpointsCount = implementationPlan?.api_endpoints?.length || 0;
    console.log(`[ContractGenerator] api_endpoints 数量: ${apiEndpointsCount}`);
    if (apiEndpointsCount > 0) {
      console.log(`[ContractGenerator] 第一个端点: ${JSON.stringify(implementationPlan.api_endpoints[0])}`);
    }

    this.openapiSpec = {
      openapi: this.config.defaultVersion,
      info: {
        title,
        version,
        description: implementationPlan?.description || `API contract for ${title}`
      },
      servers: this._generateServers(implementationPlan),
      paths: {},
      components: {
        schemas: {}
      }
    };

    // 从实现计划中提取 API 端点
    if (implementationPlan?.api_endpoints && implementationPlan.api_endpoints.length > 0) {
      console.log('[ContractGenerator] 开始处理 API 端点...');
      this._processApiEndpoints(implementationPlan.api_endpoints);
      console.log(`[ContractGenerator] 处理完成后 paths 数量: ${Object.keys(this.openapiSpec.paths).length}`);
    } else {
      console.log('[ContractGenerator] api_endpoints 不存在或为空，跳过');
    }

    // 从 shared_context 中提取类型定义
    if (implementationPlan?.shared_context?.types) {
      console.log('[ContractGenerator] 处理 shared_context.types...');
      this._processTypes(implementationPlan.shared_context.types);
    }

    // 如果有任务描述，从中提取更多 API 信息
    if (task?.requirement) {
      this._extractFromRequirement(task.requirement);
    }

    console.log('[ContractGenerator] OpenAPI 契约生成完成');
    return this.openapiSpec;
  }

  /**
   * 生成服务器信息
   * @private
   */
  _generateServers(implementationPlan) {
    const servers = [];

    if (implementationPlan?.shared_context?.api_config?.baseURL) {
      servers.push({
        url: implementationPlan.shared_context.api_config.baseURL,
        description: 'API Server'
      });
    } else if (implementationPlan?.api_base_url) {
      servers.push({
        url: implementationPlan.api_base_url,
        description: 'API Server'
      });
    } else {
      servers.push({
        url: 'http://localhost:3000/api',
        description: 'Development Server'
      });
    }

    return servers;
  }

  /**
   * 处理 API 端点
   * @private
   */
  _processApiEndpoints(apiEndpoints) {
    console.log(`[_processApiEndpoints] 开始处理 ${apiEndpoints.length} 个端点`);
    for (const endpoint of apiEndpoints) {
      const { method, path, description, auth, params, body, response } = endpoint;
      console.log(`[_processApiEndpoints] 处理端点: ${method} ${path}`);

      if (!this.openapiSpec.paths[path]) {
        this.openapiSpec.paths[path] = {};
      }

      this.openapiSpec.paths[path][method.toLowerCase()] = {
        summary: description || `${method} ${path}`,
        description: description || '',
        operationId: this._generateOperationId(method, path),
        parameters: this._processParameters(params),
        requestBody: body ? this._processRequestBody(body) : undefined,
        responses: this._processResponse(response),
        security: auth ? [{ bearerAuth: [] }] : []
      };
    }
    console.log(`[_processApiEndpoints] 处理完成，当前 paths: ${JSON.stringify(Object.keys(this.openapiSpec.paths))}`);
  }

  /**
   * 处理类型定义
   * @private
   */
  _processTypes(types) {
    for (const [typeName, typeDef] of Object.entries(types)) {
      this.openapiSpec.components.schemas[typeName] = this._convertToOpenAPISchema(typeDef);
    }
  }

  /**
   * 转换类型定义为 OpenAPI Schema
   * @private
   */
  _convertToOpenAPISchema(typeDef) {
    if (typeof typeDef === 'string') {
      // 简单的类型字符串
      const typeMap = {
        'string': { type: 'string' },
        'number': { type: 'number' },
        'integer': { type: 'integer' },
        'boolean': { type: 'boolean' },
        'array': { type: 'array' },
        'object': { type: 'object' }
      };
      return typeMap[typeDef] || { type: 'string' };
    }

    if (typeof typeDef === 'object') {
      // 如果是完整的 OpenAPI schema，直接返回
      if (typeDef.type || typeDef.properties || typeDef.items) {
        return typeDef;
      }

      // 否则假设是类型定义
      const schema = {
        type: 'object',
        properties: {}
      };

      for (const [key, value] of Object.entries(typeDef)) {
        schema.properties[key] = this._convertToOpenAPISchema(value);
      }

      return schema;
    }

    return { type: 'string' };
  }

  /**
   * 处理参数
   * @private
   */
  _processParameters(params) {
    if (!params) return [];

    const parameters = [];
    for (const [name, type] of Object.entries(params)) {
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: this._convertToOpenAPISchema(type),
        description: `Parameter: ${name}`
      });
    }

    return parameters;
  }

  /**
   * 处理请求体
   * @private
   */
  _processRequestBody(body) {
    return {
      required: true,
      content: {
        'application/json': {
          schema: this._convertToOpenAPISchema(body)
        }
      }
    };
  }

  /**
   * 处理响应
   * @private
   */
  _processResponse(response) {
    const responses = {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: this._convertToOpenAPISchema(response || {})
          }
        }
      }
    };

    return responses;
  }

  /**
   * 从需求描述中提取 API 信息
   * @private
   */
  _extractFromRequirement(requirement) {
    // 简单的启发式提取
    // 查找 "API", "endpoint", "GET", "POST" 等关键词
    const apiPatterns = [
      /(?:GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\/\-{}]+)/gi,
      /(?:api|endpoint)\s+(\/[\w\/\-{}]+)/gi
    ];

    for (const pattern of apiPatterns) {
      const matches = requirement.match(pattern);
      if (matches) {
        console.log('[ContractGenerator] 从需求中提取到 API 路径:', matches);
      }
    }
  }

  /**
   * 生成操作 ID
   * @private
   */
  _generateOperationId(method, path) {
    const cleanPath = path.replace(/[^a-zA-Z0-9]/g, '_');
    return `${method.toLowerCase()}_${cleanPath}`.replace(/^_+/, '');
  }

  /**
   * 生成 TypeScript 类型定义
   * @param {Object} openapiSpec - OpenAPI 规范
   * @param {Array} deliverables - 交付物数组（可选，用于按文件分组类型）
   * @returns {string} TypeScript 类型定义代码（带分组标记）
   */
  generateTypeScriptContracts(openapiSpec, deliverables = []) {
    const spec = openapiSpec || this.openapiSpec;
    if (!spec) {
      throw new Error('No OpenAPI spec available. Call generateContract() first.');
    }

    const lines = [];
    lines.push('/**');
    lines.push(' * TypeScript 类型定义');
    lines.push(' * 由 ContractGenerator 自动生成');
    lines.push(' * 基于 OpenAPI 契约');
    lines.push(' * 分组格式：// [COMMON] 通用类型，// [FILE: <path>] 文件特定类型');
    lines.push(' */');
    lines.push('');

    // 定义通用类型（几乎所有文件都可能用到）
    const commonTypeNames = ['ApiError', 'SuccessResponse', 'PaginationMeta', 'ApiAuth'];

    // 1. 输出 COMMON 标记部分
    lines.push('// [COMMON]');
    lines.push('');

    // 生成通用 Schema 类型
    if (spec.components?.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        if (commonTypeNames.includes(name)) {
          lines.push(this._generateInterface(name, schema));
          lines.push('');
        }
      }
    }

    // 生成 API 响应类型（通用）
    const commonResponseTypes = this._generateResponseTypes(spec, commonTypeNames);
    if (commonResponseTypes.trim()) {
      lines.push('// API Response Types (Common)');
      lines.push(commonResponseTypes);
      lines.push('');
    }

    // 2. 按 deliverable 文件分组生成类型
    if (deliverables && deliverables.length > 0) {
      // 收集所有已输出的类型名称（避免重复）
      const outputTypes = new Set(commonTypeNames);

      // 为每个 deliverable 生成文件特定类型
      for (const deliverable of deliverables) {
        const filePath = deliverable.filePath || deliverable.description || 'unknown';
        lines.push(`// [FILE: ${filePath}]`);
        lines.push('');

        if (spec.components?.schemas) {
          // 根据文件路径相关性选择类型
          const relevantTypes = this._getTypesForFilePath(spec.components.schemas, filePath, deliverables);

          for (const typeName of relevantTypes) {
            if (!outputTypes.has(typeName)) {
              const schema = spec.components.schemas[typeName];
              if (schema) {
                lines.push(this._generateInterface(typeName, schema));
                lines.push('');
                outputTypes.add(typeName);
              }
            }
          }
        }
      }
    } else {
      // 如果没有 deliverables，将所有非通用类型输出为 COMMON
      lines.push('// [COMMON] Other Types');
      lines.push('');

      if (spec.components?.schemas) {
        for (const [name, schema] of Object.entries(spec.components.schemas)) {
          if (!commonTypeNames.includes(name)) {
            lines.push(this._generateInterface(name, schema));
            lines.push('');
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 根据文件路径获取相关的类型名称
   * @param {Object} schemas - OpenAPI schemas 对象
   * @param {string} filePath - 文件路径
   * @param {Array} deliverables - 交付物数组
   * @returns {string[]} 相关的类型名称数组
   * @private
   */
  _getTypesForFilePath(schemas, filePath, deliverables) {
    const schemaNames = Object.keys(schemas);
    const filePathLower = filePath.toLowerCase();

    // 提取文件路径特征词
    const features = new Set();
    const pathParts = filePathLower.split(/[\/\\,._-]/);
    pathParts.forEach(part => {
      if (part.length > 2) features.add(part);
    });

    // 计算每个 schema 与文件路径的相关性得分
    const scoredSchemas = schemaNames.map(name => {
      const nameLower = name.toLowerCase();
      let score = 0;

      // 跳过通用类型
      if (['apierror', 'successresponse', 'paginationmeta', 'apiauth'].includes(nameLower)) {
        return { name, score: 0 };
      }

      // 1. 文件名包含 schema 名称
      if (filePathLower.includes(nameLower)) {
        score += 50;
      }

      // 2. schema 名称与文件路径特征匹配
      for (const feature of features) {
        if (nameLower.includes(feature) || feature.includes(nameLower)) {
          score += 20;
        }
      }

      // 3. 常见业务类型匹配
      const businessMappings = {
        'user': ['user', 'auth', 'login', 'register', 'profile'],
        'product': ['product', 'item', 'goods'],
        'order': ['order', 'purchase'],
        'cart': ['cart', 'cartitem'],
        'category': ['category', 'catalog']
      };

      for (const [key, keywords] of Object.entries(businessMappings)) {
        if (keywords.some(k => filePathLower.includes(k))) {
          if (nameLower.includes(key)) {
            score += 30;
          }
        }
      }

      return { name, score };
    });

    // 按得分排序，取最高分且得分 > 0 的 schema
    scoredSchemas.sort((a, b) => b.score - a.score);

    const matchedTypes = scoredSchemas.filter(s => s.score > 0).map(s => s.name);

    // 如果没有匹配，返回空数组（让该文件使用通用类型）
    return matchedTypes;
  }

  /**
   * 生成接口定义
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
   * 将 Schema 转换为 TypeScript 类型字符串
   * @private
   */
  _schemaToTypeScript(schema) {
    if (schema.$ref) {
      // 引用类型
      const refName = schema.$ref.split('/').pop();
      return refName;
    }

    if (schema.type === 'array' && schema.items) {
      return `${this._schemaToTypeScript(schema.items)}[]`;
    }

    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties)
        .map(([k, v]) => `${k}: ${this._schemaToTypeScript(v)}`)
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
   * 生成响应类型
   * @param {Object} spec - OpenAPI 规范
   * @param {string[]} [commonTypeNames] - 通用类型名称数组（可选，用于过滤）
   * @returns {string} 响应类型代码
   * @private
   */
  _generateResponseTypes(spec, commonTypeNames = []) {
    const lines = [];

    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;

        const operationId = operation.operationId || this._generateOperationId(method, path);
        const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;

        if (responseSchema) {
          const typeName = `${operationId}Response`;

          // 如果指定了 commonTypeNames，则检查响应类型是否包含通用类型
          // 通用响应类型直接输出，不做过滤
          const isCommonResponse = commonTypeNames.length === 0 ||
            typeName.toLowerCase().includes('api') ||
            typeName.toLowerCase().includes('success') ||
            typeName.toLowerCase().includes('pagination');

          // 只在有 commonTypeNames 且不是通用响应时跳过
          if (commonTypeNames.length > 0 && !isCommonResponse) {
            continue;
          }

          lines.push(`export type ${typeName} = ${this._schemaToTypeScript(responseSchema)};`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取生成的 OpenAPI 规范
   * @returns {Object} OpenAPI 规范对象
   */
  getSpec() {
    return this.openapiSpec;
  }

  /**
   * 将规范导出为 JSON
   * @returns {string} JSON 格式的 OpenAPI 规范
   */
  toJSON() {
    return JSON.stringify(this.openapiSpec, null, 2);
  }
}

module.exports = ContractGenerator;
