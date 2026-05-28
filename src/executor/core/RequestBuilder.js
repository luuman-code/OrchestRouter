/**
 * RequestBuilder - 请求构建器
 *
 * 根据不同模型 API 构建相应的请求格式
 * 支持 OpenAI、Anthropic、Gemini、Ollama 等主流提供商
 * 以及阿里云、MiniMax、MoonShot、ZhiPu 等使用共享 API 密钥的提供商
 *
 * @class RequestBuilder
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class RequestBuilder {
  /**
   * 创建请求构建器
   * @param {Object} options - 选项
   * @param {ModelRegistry} options.modelRegistry - 模型注册表实例（可选）
   */
  constructor(options = {}) {
    this.modelRegistry = options.modelRegistry || null;

    // 添加 setModelRegistry 方法以支持后期设置
    this.setModelRegistry = (modelRegistry) => {
      this.modelRegistry = modelRegistry;
    };

    // 加载配置文件
    this.config = this._loadConfig();

    // 提供商到 API 端点的映射
    this.providerEndpoints = {
      'openai': 'https://api.openai.com/v1',
      'anthropic': 'https://api.anthropic.com/v1',
      'gemini': 'https://generativelanguage.googleapis.com/v1beta',
      'ollama': 'http://localhost:11434/api',
      'deepseek': 'https://api.deepseek.com/v1',
      // 阿里云 Coding Plan（共享 API 密钥）
      'aliyun': 'https://coding.dashscope.aliyuncs.com/v1',
      'minimax': 'https://coding.dashscope.aliyuncs.com/v1',
      'moonshot': 'https://coding.dashscope.aliyuncs.com/v1',
      'zhipu': 'https://coding.dashscope.aliyuncs.com/v1'
    };

    // 合并配置文件中的端点
    if (this.config && this.config.endpoints) {
      Object.assign(this.providerEndpoints, this.config.endpoints);
    }

    // API 密钥到提供商的映射（支持共享密钥）
    this.apiKeyProviders = {
      'DASHSCOPE_API_KEY': ['aliyun', 'minimax', 'moonshot', 'zhipu'],
      'OPENAI_API_KEY': ['openai'],
      'ANTHROPIC_API_KEY': ['anthropic'],
      'GEMINI_API_KEY': ['google', 'gemini'],
      'GOOGLE_API_KEY': ['google', 'gemini'],
      'DEEPSEEK_API_KEY': ['deepseek']
    };

    // 合并配置文件中的 API 密钥映射
    if (this.config && this.config.apiKeys) {
      for (const [envVar, providers] of Object.entries(this.config.apiKeys)) {
        if (Array.isArray(providers)) {
          this.apiKeyProviders[envVar] = providers;
        }
      }
    }

    // 模型 ID 映射
    this.modelMappings = this.config?.modelMappings || {};

    this.apiBuilders = {
      'openai': new OpenAIRequestBuilder(),
      'anthropic': new AnthropicRequestBuilder(),
      'gemini': new GeminiRequestBuilder(),
      'ollama': new OllamaRequestBuilder(),
      'deepseek': new DeepSeekRequestBuilder(),
      // 使用 OpenAI 兼容格式的提供商
      'aliyun': new OpenAICompatibleRequestBuilder(this.providerEndpoints.aliyun, 'DASHSCOPE_API_KEY', this.modelMappings),
      'bailian': new OpenAICompatibleRequestBuilder(this.providerEndpoints.aliyun, 'DASHSCOPE_API_KEY', this.modelMappings), // CCR Router 格式
      'minimax': new OpenAICompatibleRequestBuilder(this.providerEndpoints.minimax, 'DASHSCOPE_API_KEY', this.modelMappings),
      'moonshot': new OpenAICompatibleRequestBuilder(this.providerEndpoints.moonshot, 'DASHSCOPE_API_KEY', this.modelMappings),
      'zhipu': new OpenAICompatibleRequestBuilder(this.providerEndpoints.zhipu, 'DASHSCOPE_API_KEY', this.modelMappings)
    };
  }

  /**
   * 加载配置文件
   * @returns {Object|null} 配置对象
   */
  _loadConfig() {
    // 1. 优先尝试加载统一配置文件（类似 CCR Router 格式）
    const unifiedConfig = this._tryLoadUnifiedConfig();
    if (unifiedConfig) {
      return unifiedConfig;
    }

    // 2. 回退到 YAML 配置文件
    try {
      const configPath = path.join(__dirname, '../config/provider-endpoints.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        return yaml.load(content);
      }
    } catch (error) {
      console.warn('[RequestBuilder] 加载配置文件失败:', error.message);
    }
    return null;
  }

  /**
   * 尝试加载统一配置文件
   * @returns {Object|null} 配置对象
   * @private
   */
  _tryLoadUnifiedConfig() {
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'config', 'config.json'),
      path.join(__dirname, '..', '..', 'config', 'unified-config.json'),
      path.join(__dirname, '..', '..', '..', 'config.json'),
      path.join(process.cwd(), 'config.json')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);

          // 检查是否是统一配置格式（包含 Providers 数组）
          if (config.Providers && Array.isArray(config.Providers)) {
            console.log(`[RequestBuilder] 从统一配置文件加载：${configPath}`);
            return this._convertUnifiedToProviderConfig(config);
          }
        } catch (error) {
          console.warn(`解析统一配置文件失败 ${configPath}: ${error.message}`);
        }
      }
    }

    return null;
  }

  /**
   * 将统一配置转换为 RequestBuilder 需要的格式
   * @param {Object} config - 统一配置对象
   * @returns {Object} 转换后的配置
   * @private
   */
  _convertUnifiedToProviderConfig(config) {
    const endpoints = {};
    const apiKeys = {};
    const modelMappings = {};

    for (const provider of config.Providers) {
      const providerName = provider.name;

      // 提取端点
      if (provider.api_base_url) {
        endpoints[providerName] = provider.api_base_url;
      }

      // 提取 API 密钥环境变量
      if (provider.api_key_env) {
        apiKeys[providerName] = provider.api_key_env;
      }

      // 提取模型映射
      if (provider.models && Array.isArray(provider.models)) {
        for (const model of provider.models) {
          if (model.api_model_id && model.api_model_id !== model.id) {
            modelMappings[model.id] = model.api_model_id;
          }
        }
      }
    }

    return { endpoints, apiKeys, modelMappings };
  }

  /**
   * 构建请求
   * @param {string} modelId - 模型 ID
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格（可选）
   * @returns {Object} 请求配置对象 { url, method, headers, body }
   */
  buildRequest(modelId, subtask, modelSpec = null) {
    // 优先从 ModelRegistry 获取提供商信息
    let provider = null;

    // 1. 如果传入了 modelSpec 且有 provider 字段，直接使用
    if (modelSpec && modelSpec.provider) {
      provider = modelSpec.provider;
    }
    // 2. 否则尝试从 modelRegistry 获取
    else if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model && model.provider) {
        provider = model.provider;
        // 如果没有传入 modelSpec，使用从 registry 获取的模型信息
        if (!modelSpec) {
          modelSpec = model;
        }
      }
    }
    // 3. 最后回退到关键字匹配
    if (!provider) {
      provider = this.extractProviderFromModelId(modelId);
    }

    // 检查是否应该使用 Anthropic 格式（优先于 provider 类型）
    const useAnthropicFormat = modelSpec?.use_anthropic_format === true;

    // 如果配置了使用 Anthropic 格式，优先使用 AnthropicRequestBuilder
    if (useAnthropicFormat && this.apiBuilders['anthropic']) {
      console.log(`[RequestBuilder] 使用 Anthropic 格式调用模型: ${modelId}`);
      return this.apiBuilders['anthropic'].build(subtask, modelSpec, modelId);
    }

    if (this.apiBuilders[provider]) {
      return this.apiBuilders[provider].build(subtask, modelSpec, modelId);
    }

    throw new Error(`Unsupported model provider: ${provider}`);
  }

  /**
   * 从模型 ID 中提取提供商名称
   * @param {string} modelId - 模型 ID
   * @returns {string} 提供商名称
   */
  extractProviderFromModelId(modelId) {
    if (typeof modelId !== 'string') {
      throw new Error('modelId must be a string');
    }

    // 检查是否为 provider,model 格式 (例如: bailian,MiniMax-M2.5)
    if (modelId.includes(',')) {
      const [provider] = modelId.split(',');
      const normalizedProvider = provider.toLowerCase().trim();

      // 检查是否是已知的提供商
      const knownProviders = ['openai', 'anthropic', 'gemini', 'ollama', 'deepseek',
                             'aliyun', 'bailian', 'minimax', 'moonshot', 'zhipu'];
      if (knownProviders.includes(normalizedProvider)) {
        return normalizedProvider;
      }
    }

    if (modelId.includes('gpt') || modelId.toLowerCase().includes('openai')) return 'openai';
    if (modelId.includes('claude') || modelId.toLowerCase().includes('anthropic')) return 'anthropic';
    if (modelId.includes('gemini') || modelId.toLowerCase().includes('google')) return 'gemini';
    if (modelId.includes('ollama')) return 'ollama';
    if (modelId.includes('deepseek')) return 'deepseek';
    if (modelId.includes('bailian')) return 'bailian';
    if (modelId.includes('aliyun')) return 'aliyun';
    if (modelId.includes('minimax')) return 'minimax';
    if (modelId.includes('moonshot')) return 'moonshot';
    if (modelId.includes('zhipu') || modelId.includes('glm')) return 'zhipu';

    // 默认处理 - 尝试从模型ID中识别特征
    const lowerModelId = modelId.toLowerCase();
    if (lowerModelId.includes('gpt') ||
        lowerModelId.includes('davinci') ||
        lowerModelId.includes('turbo') ||
        lowerModelId.includes('o1')) {
      return 'openai';
    }

    if (lowerModelId.includes('claude')) {
      return 'anthropic';
    }

    if (lowerModelId.includes('gemini')) {
      return 'gemini';
    }

    if (lowerModelId.includes('qwen')) {
      return 'aliyun';
    }

    if (lowerModelId.includes('minimax')) {
      return 'minimax';
    }

    if (lowerModelId.includes('moonshot') || lowerModelId.includes('kimi')) {
      return 'moonshot';
    }

    if (lowerModelId.includes('zhipu') || lowerModelId.includes('glm')) {
      return 'zhipu';
    }

    if (lowerModelId.includes('llama') ||
        lowerModelId.includes('mistral') ||
        lowerModelId.includes('phi') ||
        lowerModelId.includes('hermes')) {
      return 'ollama';
    }

    // 默认返回 openai，因为它是最常用的格式
    return 'openai';
  }
}

/**
 * OpenAIRequestBuilder - OpenAI 请求构建器
 */
class OpenAIRequestBuilder {
  /**
   * 构建 OpenAI 格式的请求
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    // 从模型规格或默认值中获取 baseUrl 和 API 密钥
    const baseUrl = (modelSpec && modelSpec.baseUrl) || 'https://api.openai.com/v1';

    // 优先从配置文件中的 modelSpec 获取 API 密钥，如果不存在则从环境变量获取
    let apiKey = null;

    // 检查 modelSpec 中是否包含 API 密钥
    if (modelSpec && modelSpec.api_key) {
      apiKey = modelSpec.api_key;
    } else {
      // 从环境变量获取 API 密钥
      apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
      throw new Error(`Missing OpenAI API key for model ${modelId}`);
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // 构建消息数组
    const messages = [];

    // 添加系统提示（如果有）
    if (subtask.systemPrompt) {
      // [DEBUG] 记录 systemPrompt 用于调试问题清单功能
      console.log('[OpenAIRequestBuilder.build] subtask.systemPrompt length:', subtask.systemPrompt.length);
      console.log('[OpenAIRequestBuilder.build] Contains "Issue Prediction":', subtask.systemPrompt.includes('Issue Prediction'));
      console.log('[OpenAIRequestBuilder.build] Contains "问题清单":', subtask.systemPrompt.includes('问题清单'));
      console.log('[OpenAIRequestBuilder.build] Contains ".orchestrator/issues/":', subtask.systemPrompt.includes('.orchestrator/issues/'));

      messages.push({
        role: 'system',
        content: subtask.systemPrompt
      });
    }

    // 添加用户消息
    const userContent = subtask.prompt || subtask.description || subtask.content || subtask.query;
    if (userContent) {
      messages.push({
        role: 'user',
        content: userContent
      });
    } else if (subtask.messages && Array.isArray(subtask.messages)) {
      // 如果任务提供了完整的消息数组
      messages.push(...subtask.messages);
    } else {
      throw new Error('No content provided in subtask');
    }

    // 构建请求体
    const body = {
      model: modelSpec?.apiModelId || modelId,
      messages: messages,
      temperature: subtask.temperature !== undefined ? subtask.temperature : 0.5,
      max_tokens: subtask.maxTokens || subtask.max_tokens || modelSpec?.max_output_tokens || 48000,
    };

    // 添加可选参数
    if (subtask.top_p !== undefined) body.top_p = subtask.top_p;
    if (subtask.frequency_penalty !== undefined) body.frequency_penalty = subtask.frequency_penalty;
    if (subtask.presence_penalty !== undefined) body.presence_penalty = subtask.presence_penalty;
    if (subtask.stop !== undefined) body.stop = subtask.stop;
    if (subtask.stream !== undefined) body.stream = subtask.stream;
    if (subtask.response_format) body.response_format = subtask.response_format;
    if (subtask.tools) body.tools = subtask.tools;
    if (subtask.tool_choice) body.tool_choice = subtask.tool_choice;

    return {
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      headers,
      body
    };
  }
}

/**
 * AnthropicRequestBuilder - Anthropic 请求构建器
 * 支持标准 Anthropic API 和 MiniMax Anthropic 兼容格式
 */
class AnthropicRequestBuilder {
  /**
   * 构建 Anthropic 格式的请求
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    // 检查是否为 MiniMax 兼容模式（使用 minimax 的 API 端点）
    const isMiniMax = modelSpec?.api_base_url?.includes('minimaxi.com') ||
                       modelSpec?.baseUrl?.includes('minimaxi.com');

    // 从模型规格或默认值中获取 baseUrl 和 API 密钥
    const baseUrl = (modelSpec && (modelSpec.baseUrl || modelSpec.api_base_url)) || 'https://api.anthropic.com/v1';

    // 优先从配置文件中的 modelSpec 获取 API 密钥，如果不存在则从环境变量获取
    let apiKey = null;

    // 检查 modelSpec 中是否包含 API 密钥
    if (modelSpec && modelSpec.api_key) {
      apiKey = modelSpec.api_key;
    } else if (modelSpec && modelSpec.api_key_env) {
      // 从指定的环境变量获取 API 密钥
      apiKey = process.env[modelSpec.api_key_env];
    } else {
      // 从环境变量获取 API 密钥
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!apiKey) {
      throw new Error(`Missing Anthropic API key for model ${modelId}`);
    }

    const headers = {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15' // 启用新版消息API
    };

    // 构建消息数组
    let messages = [];

    // 如果有消息数组，处理消息格式转换
    if (subtask.messages && Array.isArray(subtask.messages)) {
      messages = subtask.messages.map(msg => {
        // MiniMax 格式：content 需要是数组格式 [{ type: "text", text: "xxx" }]
        if (isMiniMax) {
          let textContent = '';
          if (typeof msg.content === 'string') {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            textContent = msg.content.map(c => c.text || c).join('');
          } else {
            textContent = String(msg.content || '');
          }
          return {
            role: msg.role,
            content: [{ type: 'text', text: textContent }]
          };
        }
        // 标准 Anthropic 格式：content 可以是字符串
        if (typeof msg.content === 'string') {
          return msg;
        }
        // 如果是数组，提取 text
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role,
            content: msg.content.map(c => c.text || c).join('')
          };
        }
        return msg;
      });
    } else {
      // 从任务中提取内容构建消息
      const content = subtask.prompt || subtask.description || subtask.content || subtask.query;

      if (!content) {
        throw new Error('No content provided in subtask');
      }

      // MiniMax 格式：content 需要是数组格式
      if (isMiniMax) {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: content }]
        });
      } else {
        // 标准 Anthropic 格式：content 是字符串
        messages.push({
          role: 'user',
          content: content
        });
      }
    }

    // 构建请求体
    const body = {
      model: modelSpec?.apiModelId || modelSpec?.api_model_id || modelId,
      messages: messages,
      max_tokens: subtask.maxTokens || subtask.max_tokens || modelSpec?.max_output_tokens || 48000,
      // MiniMax 推荐使用 0.5，标准 Anthropic 默认 0.7
      temperature: subtask.temperature !== undefined ? subtask.temperature : (isMiniMax ? 0.5 : 0.5),
    };

    // 添加系统提示 - MiniMax 和 DeepSeek 使用独立的 system 参数
    // 注意：DeepSeek 的 Anthropic 兼容端点不支持 role: 'system'，必须使用 body.system
    const isDeepSeek = modelSpec?.api_base_url?.includes('deepseek.com') ||
                       modelSpec?.baseUrl?.includes('deepseek.com');
    if (subtask.systemPrompt) {
      // [DEBUG] 记录 systemPrompt 用于调试问题清单功能
      console.log('[AnthropicRequestBuilder.build] subtask.systemPrompt length:', subtask.systemPrompt.length);
      console.log('[AnthropicRequestBuilder.build] Contains "Issue Prediction":', subtask.systemPrompt.includes('Issue Prediction'));
      console.log('[AnthropicRequestBuilder.build] Contains "问题清单":', subtask.systemPrompt.includes('问题清单'));
      console.log('[AnthropicRequestBuilder.build] Contains ".orchestrator/issues/":', subtask.systemPrompt.includes('.orchestrator/issues/'));

      if (isMiniMax || isDeepSeek) {
        body.system = subtask.systemPrompt;
      } else {
        // 标准 Anthropic：system 作为第一条消息
        messages.unshift({
          role: 'system',
          content: subtask.systemPrompt
        });
      }
    }

    // 添加可选参数
    if (subtask.top_p !== undefined) body.top_p = subtask.top_p;
    // MiniMax 会忽略 top_k 和 stop_sequences，但保留以兼容标准 Anthropic
    if (!isMiniMax && subtask.top_k !== undefined) body.top_k = subtask.top_k;
    if (!isMiniMax && subtask.stop_sequences) body.stop_sequences = subtask.stop_sequences;
    if (subtask.tools) body.tools = subtask.tools;
    if (subtask.tool_choice) body.tool_choice = subtask.tool_choice;

    // DeepSeek 思考模式控制：默认启用思考模式，提升代码生成质量
    // 思考模式帮助模型更好地理解任务需求，生成更准确的代码
    console.log('[AnthropicRequestBuilder.build] isDeepSeek:', isDeepSeek);
    console.log('[AnthropicRequestBuilder.build] subtask.thinkingEnabled:', subtask.thinkingEnabled);
    if (isDeepSeek) {
      // 如果 subtask 明确要求禁用思考模式，则禁用
      if (subtask.thinkingEnabled === false) {
        body.thinking = {
          type: 'disabled'
        };
        console.log('[AnthropicRequestBuilder.build] DeepSeek 思考模式: 已禁用 (thinkingEnabled === false)');
      } else {
        // 默认启用思考模式，帮助模型进行复杂推理
        body.thinking = {
          type: 'enabled',
          reasoning_effort: subtask.reasoningEffort || 'high'
        };
        console.log('[AnthropicRequestBuilder.build] DeepSeek 思考模式: 已启用 (type:', body.thinking.type, ', reasoning_effort:', body.thinking.reasoning_effort, ')');
      }
    } else {
      console.log('[AnthropicRequestBuilder.build] 非 DeepSeek 模型，跳过思考模式配置');
    }

    return {
      url: `${baseUrl}/v1/messages`,
      method: 'POST',
      headers,
      body
    };
  }
}

/**
 * GeminiRequestBuilder - Google Gemini 请求构建器
 */
class GeminiRequestBuilder {
  /**
   * 构建 Google Gemini 格式的请求
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    // Gemini 通常通过查询参数传递API密钥
    // 从模型规格或默认值中获取 baseUrl 和 API 密钥
    const baseUrl = (modelSpec && modelSpec.baseUrl) || 'https://generativelanguage.googleapis.com/v1beta';

    // 优先从配置文件中的 modelSpec 获取 API 密钥，如果不存在则从环境变量获取
    let apiKey = null;

    // 检查 modelSpec 中是否包含 API 密钥
    if (modelSpec && modelSpec.api_key) {
      apiKey = modelSpec.api_key;
    } else {
      // 从环境变量获取 API 密钥
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      throw new Error(`Missing Gemini API key for model ${modelId}`);
    }

    // 构建内容 - Gemini需要特殊的格式
    let contents = [];

    if (subtask.messages && Array.isArray(subtask.messages)) {
      // 将标准消息格式转换为Gemini格式
      contents = subtask.messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Gemini中助手角色是'model'
        parts: [{
          text: msg.content
        }]
      }));
    } else {
      // 从任务内容构建
      const content = subtask.prompt || subtask.description || subtask.content || subtask.query;

      if (!content) {
        throw new Error('No content provided in subtask');
      }

      contents = [{
        role: 'user',
        parts: [{
          text: content
        }]
      }];
    }

    // 构建请求体
    const body = {
      contents: contents
    };

    // 添加系统指令（Gemini 使用 system_instruction 字段）
    if (subtask.systemPrompt) {
      body.system_instruction = {
        parts: [{
          text: subtask.systemPrompt
        }]
      };
    }

    // 添加配置参数
    const generationConfig = {};
    if (subtask.temperature !== undefined) generationConfig.temperature = subtask.temperature;
    if (subtask.maxTokens || subtask.max_tokens) generationConfig.maxOutputTokens = subtask.maxTokens || subtask.max_tokens;
    if (subtask.top_p !== undefined) generationConfig.topP = subtask.top_p;
    if (subtask.top_k !== undefined) generationConfig.topK = subtask.top_k;

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // 添加安全设置（可选）
    if (subtask.safetySettings) {
      body.safetySettings = subtask.safetySettings;
    }

    // 构建URL - Gemini的API路径略有不同
    const modelName = modelSpec?.apiModelId || modelId.replace('gemini-', '');
    const url = `${baseUrl}/models/${modelName}:generateContent?key=${apiKey}`;

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    };
  }
}

/**
 * OllamaRequestBuilder - Ollama 请求构建器
 */
class OllamaRequestBuilder {
  /**
   * 构建 Ollama 格式的请求
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    const { baseUrl = 'http://localhost:11434/api' } = modelSpec || {};

    let messages = [];

    // 添加系统提示（如果有）
    if (subtask.systemPrompt) {
      messages.push({
        role: 'system',
        content: subtask.systemPrompt
      });
    }

    if (subtask.messages && Array.isArray(subtask.messages)) {
      messages.push(...subtask.messages);
    } else {
      // 从任务内容构建消息
      const content = subtask.prompt || subtask.description || subtask.content || subtask.query;

      if (!content) {
        throw new Error('No content provided in subtask');
      }

      messages.push({
        role: 'user',
        content: content
      });
    }

    // 构建请求体
    const body = {
      model: modelSpec?.apiModelId || modelId.replace('ollama/', ''),
      messages: messages,
      options: {}
    };

    // 添加参数到options对象
    if (subtask.temperature !== undefined) body.options.temperature = subtask.temperature;
    if (subtask.maxTokens || subtask.max_tokens) body.options.num_predict = subtask.maxTokens || subtask.max_tokens;
    if (subtask.top_p !== undefined) body.options.top_p = subtask.top_p;
    if (subtask.top_k !== undefined) body.options.top_k = subtask.top_k;
    if (subtask.frequency_penalty !== undefined) body.options.frequency_penalty = subtask.frequency_penalty;
    if (subtask.presence_penalty !== undefined) body.options.presence_penalty = subtask.presence_penalty;

    // 添加其他可能的选项
    if (subtask.seed !== undefined) body.options.seed = subtask.seed;
    if (subtask.num_ctx !== undefined) body.options.num_ctx = subtask.num_ctx;
    if (subtask.num_batch !== undefined) body.options.num_batch = subtask.num_batch;
    if (subtask.tfs_z !== undefined) body.options.tfs_z = subtask.tfs_z;
    if (subtask.typical_p !== undefined) body.options.typical_p = subtask.typical_p;
    if (subtask.repeat_last_n !== undefined) body.options.repeat_last_n = subtask.repeat_last_n;
    if (subtask.repeat_penalty !== undefined) body.options.repeat_penalty = subtask.repeat_penalty;
    if (subtask.penalty_threshold !== undefined) body.options.penalty_threshold = subtask.penalty_threshold;

    if (subtask.stream !== undefined) body.stream = subtask.stream;

    return {
      url: `${baseUrl}/chat`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    };
  }
}

/**
 * DeepSeekRequestBuilder - DeepSeek 请求构建器
 */
class DeepSeekRequestBuilder {
  /**
   * 构建 DeepSeek 格式的请求（类似OpenAI格式）
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    // 检查是否使用 Anthropic 格式
    const useAnthropicFormat = modelSpec?.use_anthropic_format === true;

    // 从模型规格或默认值中获取 baseUrl 和 API 密钥
    const baseUrl = (modelSpec && modelSpec.baseUrl) || 'https://api.deepseek.com/v1';

    // 优先从配置文件中的 modelSpec 获取 API 密钥，如果不存在则从环境变量获取
    let apiKey = null;

    // 检查 modelSpec 中是否包含 API 密钥
    if (modelSpec && modelSpec.api_key) {
      apiKey = modelSpec.api_key;
    } else {
      // 从环境变量获取 API 密钥
      apiKey = process.env.DEEPSEEK_API_KEY;
    }

    if (!apiKey) {
      throw new Error(`Missing DeepSeek API key for model ${modelId}`);
    }

    // 如果使用 Anthropic 格式
    if (useAnthropicFormat) {
      const headers = {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      };

      // DeepSeek Anthropic 格式使用特殊的 baseUrl
      const anthropicBaseUrl = 'https://api.deepseek.com/anthropic';

      // 构建消息数组 - Anthropic 格式
      let messages = [];
      if (subtask.messages && Array.isArray(subtask.messages)) {
        messages = subtask.messages.map(msg => {
          if (typeof msg.content === 'string') {
            return { role: msg.role, content: [{ type: 'text', text: msg.content }] };
          }
          return { role: msg.role, content: msg.content };
        });
      } else {
        const userContent = subtask.prompt || subtask.description || subtask.content || subtask.query || '';
        messages = [{ role: 'user', content: [{ type: 'text', text: userContent }] }];
      }

      const body = {
        model: modelSpec?.apiModelId || modelSpec?.api_model_id || modelId,
        messages: messages,
        max_tokens: subtask.maxTokens || subtask.max_tokens || 32000,
        temperature: subtask.temperature !== undefined ? subtask.temperature : 0.5
      };

      // 添加系统提示
      if (subtask.systemPrompt) {
        body.system = subtask.systemPrompt;
      }

      // 添加 tools 和 tool_choice（DeepSeek Anthropic 格式支持多工具调用）
      if (subtask.tools && Array.isArray(subtask.tools)) {
        body.tools = subtask.tools;
        body.tool_choice = { type: "auto" };
      }

      return {
        url: `${anthropicBaseUrl}/v1/messages`,
        method: 'POST',
        headers,
        body
      };
    }

    // OpenAI 格式（原有逻辑）
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // 构建消息数组
    const messages = [];

    // 添加系统提示（如果有）
    if (subtask.systemPrompt) {
      messages.push({
        role: 'system',
        content: subtask.systemPrompt
      });
    }

    // 添加用户消息
    const userContent = subtask.prompt || subtask.description || subtask.content || subtask.query;
    if (userContent) {
      messages.push({
        role: 'user',
        content: userContent
      });
    } else if (subtask.messages && Array.isArray(subtask.messages)) {
      // 如果任务提供了完整的消息数组
      messages.push(...subtask.messages);
    } else {
      throw new Error('No content provided in subtask');
    }

    // 构建请求体
    const body = {
      model: modelSpec?.apiModelId || modelId,
      messages: messages,
      temperature: subtask.temperature !== undefined ? subtask.temperature : 0.5,
      max_tokens: subtask.maxTokens || subtask.max_tokens || modelSpec?.max_output_tokens || 48000,
    };

    // 添加可选参数
    if (subtask.top_p !== undefined) body.top_p = subtask.top_p;
    if (subtask.frequency_penalty !== undefined) body.frequency_penalty = subtask.frequency_penalty;
    if (subtask.presence_penalty !== undefined) body.presence_penalty = subtask.presence_penalty;
    if (subtask.stop !== undefined) body.stop = subtask.stop;
    if (subtask.stream !== undefined) body.stream = subtask.stream;

    // 添加 tools（DeepSeek 使用 OpenAI 格式，需要转换）
    if (subtask.tools && Array.isArray(subtask.tools)) {
      body.tools = subtask.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }));
      // 强制模型使用工具
      body.tool_choice = "auto";
    }

    return {
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      headers,
      body
    };
  }
}

/**
 * OpenAICompatibleRequestBuilder - OpenAI 兼容请求构建器
 * 用于阿里云、MiniMax、MoonShot、ZhiPu 等使用 OpenAI 兼容格式的提供商
 */
class OpenAICompatibleRequestBuilder {
  /**
   * 创建 OpenAI 兼容请求构建器
   * @param {string} baseUrl - API 基础 URL
   * @param {string} apiKeyEnvVar - API 密钥环境变量名
   * @param {Object} modelMappings - 模型 ID 映射
   */
  constructor(baseUrl, apiKeyEnvVar, modelMappings = {}) {
    this.baseUrl = baseUrl;
    this.apiKeyEnvVar = apiKeyEnvVar;
    this.modelMappings = modelMappings;
  }

  /**
   * 构建请求
   * @param {Object} subtask - 子任务对象
   * @param {Object} modelSpec - 模型规格
   * @param {string} modelId - 模型 ID
   * @returns {Object} 请求配置对象
   */
  build(subtask, modelSpec, modelId) {
    // 优先从配置文件中的 modelSpec 获取 API 密钥，如果不存在则从环境变量获取
    let apiKey = null;

    // 检查 modelSpec 中是否包含 API 密钥
    if (modelSpec && modelSpec.api_key) {
      apiKey = modelSpec.api_key;
    } else {
      // 从环境变量获取 API 密钥
      apiKey = process.env[this.apiKeyEnvVar];
    }

    if (!apiKey) {
      throw new Error(`Missing API key: ${this.apiKeyEnvVar} for model ${modelId}`);
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // 对于 ali(dashscope) 提供商，添加 Coding Agent 标识
    if (this.baseUrl.includes('dashscope.aliyuncs.com')) {
      // 添加阿里云 Coding Agent 标识头
      headers['X-DashScope-Plugin'] = 'code-agent';
      headers['User-Agent'] = 'Claude-Code-Router-Coding-Agent/1.0';
    }

    // 处理 provider,model 格式（例如：bailian,MiniMax-M2.5）
    // 提取实际的模型名称用于 API 调用
    let actualModelId = modelId;
    if (modelId.includes(',')) {
      const parts = modelId.split(',');
      actualModelId = parts[1] || parts[0]; // 取第二部分，如果没有则取第一部分
    }

    // 获取 API 中使用的实际模型 ID
    // 注意：配置文件中的 modelSpec.id 是服务商支持的模型名称
    // 优先使用 modelSpec.id，而不是 apiModelId（因为 api_model_id 可能已过时或不正确）
    const apiModelId = modelSpec?.id || this.modelMappings[actualModelId] || this.modelMappings[modelId] || actualModelId;

    // 构建消息数组
    const messages = [];

    // 添加系统提示（如果有）
    if (subtask.systemPrompt) {
      messages.push({
        role: 'system',
        content: subtask.systemPrompt
      });
    }

    // 添加用户消息
    const userContent = subtask.prompt || subtask.description || subtask.content || subtask.query;
    if (userContent) {
      messages.push({
        role: 'user',
        content: userContent
      });
    } else if (subtask.messages && Array.isArray(subtask.messages)) {
      messages.push(...subtask.messages);
    } else {
      throw new Error('No content provided in subtask');
    }

    // 构建请求体
    const body = {
      model: apiModelId,
      messages: messages,
      temperature: subtask.temperature !== undefined ? subtask.temperature : 0.5,
      max_tokens: subtask.maxTokens || subtask.max_tokens || modelSpec?.max_output_tokens || 48000,
    };

    // 添加可选参数
    if (subtask.top_p !== undefined) body.top_p = subtask.top_p;
    if (subtask.frequency_penalty !== undefined) body.frequency_penalty = subtask.frequency_penalty;
    if (subtask.presence_penalty !== undefined) body.presence_penalty = subtask.presence_penalty;
    if (subtask.stop !== undefined) body.stop = subtask.stop;
    if (subtask.stream !== undefined) body.stream = subtask.stream;

    // 添加 tools（OpenAI 兼容格式，需要转换）
    if (subtask.tools && Array.isArray(subtask.tools)) {
      body.tools = subtask.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }));
      // 强制模型使用工具
      body.tool_choice = "auto";
    }

    return {
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers,
      body
    };
  }
}

module.exports = {
  RequestBuilder,
  OpenAICompatibleRequestBuilder,
  AnthropicRequestBuilder
};