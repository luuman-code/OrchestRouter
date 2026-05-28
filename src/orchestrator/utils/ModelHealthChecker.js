/**
 * ModelHealthChecker - 模型健康检查器
 *
 * 在编排器服务器启动时检查所有已配置模型的 API 密钥和网络连通性
 * 将检查结果返回给模型选择器，更新模型的可用状态
 */

const axios = require('axios');

class ModelHealthChecker {
  constructor(modelSelector) {
    this.modelSelector = modelSelector;
    this.modelRegistry = modelSelector?.modelRegistry;
    this.statusMonitor = modelSelector?.statusMonitor;

    // 从 ModelRegistry 动态获取已配置的提供商列表
    this.configuredProviders = this._getConfiguredProviders();

    // API 密钥到提供商的映射（支持共享密钥）
    this.apiKeyProviders = {
      'DASHSCOPE_API_KEY': ['bailian', 'aliyun', 'minimax', 'moonshot', 'zhipu'],
      'OPENAI_API_KEY': ['openai'],
      'ANTHROPIC_API_KEY': ['anthropic'],
      'GEMINI_API_KEY': ['google', 'gemini'],
      'GOOGLE_API_KEY': ['google', 'gemini'],
      'DEEPSEEK_API_KEY': ['deepseek']
    };

    // 提供商的 API 端点
    this.providerEndpoints = {
      'bailian': 'https://coding.dashscope.aliyuncs.com/v1',
      'aliyun': 'https://coding.dashscope.aliyuncs.com/v1',
      'minimax': 'https://api.minimaxi.com/v1',
      'moonshot': 'https://coding.dashscope.aliyuncs.com/v1',
      'zhipu': 'https://coding.dashscope.aliyuncs.com/v1',
      'openai': 'https://api.openai.com/v1/models',
      'anthropic': 'https://api.anthropic.com/v1/messages',
      'google': 'https://generativelanguage.googleapis.com/v1beta/models',
      'deepseek': 'https://api.deepseek.com/v1/models'
    };
  }

  /**
   * 从 ModelRegistry 获取已配置的提供商列表
   * @returns {string[]} 提供商名称列表
   * @private
   */
  _getConfiguredProviders() {
    if (!this.modelRegistry) return [];

    const models = this.modelRegistry.getAllModels();
    const providers = new Set();

    for (const model of models) {
      if (model.provider && model.api_key && model.api_key.length > 10) {
        providers.add(model.provider);
      }
    }

    return Array.from(providers);
  }

  /**
   * 检查是否为 Anthropic 兼容格式的提供商
   * @param {string} provider - 提供商名称
   * @returns {boolean}
   */
  _isAnthropicFormat(provider) {
    if (!this.modelRegistry) return false;

    const models = this.modelRegistry.getAllModels();
    const providerModels = models.filter(m => m.provider === provider);
    if (providerModels.length > 0) {
      console.log(`[ModelHealthChecker] _isAnthropicFormat: provider=${provider}, 检查了${providerModels.length}个模型, 第一个模型的use_anthropic_format=${providerModels[0].use_anthropic_format}`);
    }
    for (const model of models) {
      if (model.provider === provider && model.use_anthropic_format === true) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查所有模型的可用性
   * @returns {Promise<Object>} 检查结果
   */
  async checkAllModels() {
    const results = {
      timestamp: new Date().toISOString(),
      totalModels: 0,
      availableModels: 0,
      unavailableModels: 0,
      models: {},
      localModels: {
        ollama: {
          available: false,
          reason: '',
          models: []
        }
      }
    };

    // 1. 首先检查本地 Ollama 服务
    await this._checkLocalOllama(results);

    if (!this.modelRegistry) {
      results.error = 'ModelRegistry not available';
      return results;
    }

    const models = this.modelRegistry.getAllModels();
    results.totalModels = models.length;

    // 只检查配置文件中实际配置的提供商
    const providersToCheck = this.configuredProviders;
    console.log(`[ModelHealthChecker] 检测到 ${providersToCheck.length} 个已配置的提供商：${providersToCheck.join(', ')}`);

    // 按提供商分组检查
    const providersChecked = new Set();

    for (const provider of providersToCheck) {
      // 如果该提供商已检查过，跳过
      if (providersChecked.has(provider)) {
        continue;
      }

      // 检查提供商的 API 密钥和端点
      const providerResult = await this._checkProvider(provider);
      results.models[provider] = providerResult;
      providersChecked.add(provider);

      // 更新该提供商下所有模型的状态
      const providerModels = models.filter(m => m.provider === provider);
      for (const providerModel of providerModels) {
        if (providerResult.available) {
          results.availableModels++;
          this._updateModelStatus(providerModel.id, true, providerResult.reason);
        } else {
          results.unavailableModels++;
          this._updateModelStatus(providerModel.id, false, providerResult.reason);
        }
      }
    }

    return results;
  }

  /**
   * 检查单个提供商的可用性
   * 使用实际配置的模型进行健康检查
   * 对每个提供商检查多个模型（最多2个）来判定提供商是否可用
   * @param {string} provider - 提供商名称
   * @returns {Promise<Object>} 检查结果
   */
  async _checkProvider(provider) {
    const result = {
      provider,
      available: false,
      apiKeyConfigured: false,
      endpointReachable: false,
      apiKeyValid: false,
      reason: '',
      latency: null,
      modelsChecked: [], // 记录检查过的模型
      modelResults: {}   // 每个模型的检查结果
    };

    // 1. 检查 API 密钥配置
    const apiKey = this._getApiKeyForProvider(provider);
    if (!apiKey || apiKey.includes('your_') || apiKey.length < 10) {
      result.reason = `API key not configured for provider: ${provider}`;
      return result;
    }
    result.apiKeyConfigured = true;

    // 2. 获取该提供商下所有模型的 api_model_id 用于健康检查（最多2个）
    let modelsToCheck = [];
    if (this.modelRegistry) {
      const allProviderModels = this.modelRegistry.getAllModels().filter(m => m.provider === provider);
      // 最多取2个模型进行检查
      modelsToCheck = allProviderModels.slice(0, 2).map(m => ({
        id: m.id,
        api_model_id: m.api_model_id || m.id,
        name: m.name
      }));

      console.log(`[ModelHealthChecker] ${provider}: 将检查 ${modelsToCheck.length} 个模型: ${modelsToCheck.map(m => m.api_model_id).join(', ')}`);
    }

    // 3. 默认执行实际HTTP检查，仅在明确禁用时才跳过
    if (process.env.DISABLE_STARTUP_HTTP_HEALTH_CHECK === 'true') {
      result.available = result.apiKeyConfigured;
      result.endpointReachable = result.apiKeyConfigured;
      result.apiKeyValid = result.apiKeyConfigured;
      result.reason = result.apiKeyConfigured
        ? `API key configured for ${provider} (HTTP check disabled)`
        : `API key not configured for provider: ${provider}`;
    } else {
      // 默认：执行实际HTTP健康检查（使用多个模型）
      // 如果有模型列表，逐个检查
      if (modelsToCheck.length > 0) {
        let availableCount = 0;
        let unavailableCount = 0;
        const modelResults = [];

        for (const modelInfo of modelsToCheck) {
          const healthResult = await this._checkApiKeyValidity(provider, apiKey, modelInfo.api_model_id);
          console.log(`[ModelHealthChecker] ${provider}/${modelInfo.api_model_id}: apiKeyValid=${healthResult.apiKeyValid}, reason=${healthResult.reason}`);
          const modelAvailable = healthResult.apiKeyValid;

          result.modelResults[modelInfo.api_model_id] = {
            available: modelAvailable,
            latency: healthResult.latency,
            reason: healthResult.reason,
            endpointReachable: healthResult.endpointReachable,
            isRateLimited: healthResult.isRateLimited || false,
            isQuotaExceeded: healthResult.isQuotaExceeded || false
          };

          result.modelsChecked.push({
            modelId: modelInfo.api_model_id,
            modelName: modelInfo.name,
            available: modelAvailable,
            reason: healthResult.reason
          });

          if (modelAvailable) {
            availableCount++;
          } else {
            unavailableCount++;
          }

          // 如果是速率限制错误，等待一下再试下一个模型
          if (healthResult.isRateLimited && modelsToCheck.length > 1) {
            console.log(`[ModelHealthChecker] ${provider}: 遇到速率限制，等待1秒后继续...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // 判定提供商可用性：
        // - 如果检查了多个模型，至少有一个可用则提供商可用
        // - 如果所有模型都不可用，则提供商不可用
        // - 但如果都是速率限制/配额问题，考虑为暂时性不可用
        const hasRateLimitIssue = Object.values(result.modelResults).some(r => r.isRateLimited);
        const hasQuotaIssue = Object.values(result.modelResults).some(r => r.isQuotaExceeded);
        const allUnavailable = availableCount === 0 && unavailableCount > 0;

        if (availableCount > 0) {
          // 至少有一个模型可用
          result.available = true;
          result.endpointReachable = true;
          result.apiKeyValid = true;
          result.latency = Object.values(result.modelResults).find(r => r.available)?.latency || null;
          result.reason = `${availableCount}/${modelsToCheck.length} 模型可用: ${modelsToCheck.filter((_, i) => result.modelResults[_.api_model_id]?.available).map(m => m.api_model_id).join(', ')}`;
        } else if (hasRateLimitIssue) {
          // 所有模型都是速率限制，暂时不可用
          result.available = false;
          result.endpointReachable = true;
          result.apiKeyValid = true; // 密钥有效，只是暂时限流
          result.reason = `API rate limited (HTTP 429) - 所有模型暂时不可用`;
        } else if (hasQuotaIssue) {
          // 配额超限
          result.available = false;
          result.endpointReachable = true;
          result.apiKeyValid = false; // 配额用完，视为无效
          result.reason = `API quota exceeded - 配额已用尽`;
        } else {
          // 所有模型都不可用（密钥问题等）
          result.available = false;
          result.endpointReachable = Object.values(result.modelResults).some(r => r.endpointReachable);
          result.apiKeyValid = false;
          result.reason = `所有模型不可用: ${Object.values(result.modelResults).map(r => r.reason).join('; ')}`;
        }
      } else {
        // 没有获取到模型列表，退回单模型检查
        const modelIdForHealthCheck = modelsToCheck[0]?.api_model_id || provider;
        const healthResult = await this._checkApiKeyValidity(provider, apiKey, modelIdForHealthCheck);
        result.endpointReachable = healthResult.endpointReachable;
        result.apiKeyValid = healthResult.apiKeyValid;
        result.available = healthResult.apiKeyValid;
        result.latency = healthResult.latency;

        result.modelsChecked.push({
          modelId: modelIdForHealthCheck,
          available: healthResult.apiKeyValid,
          reason: healthResult.reason
        });
        result.modelResults[modelIdForHealthCheck] = {
          available: healthResult.apiKeyValid,
          latency: healthResult.latency,
          reason: healthResult.reason,
          endpointReachable: healthResult.endpointReachable,
          isRateLimited: healthResult.isRateLimited || false,
          isQuotaExceeded: healthResult.isQuotaExceeded || false
        };

        if (!healthResult.endpointReachable) {
          result.reason = `API endpoint unreachable: ${healthResult.reason}`;
        } else if (!healthResult.apiKeyValid) {
          result.reason = `API key invalid: ${healthResult.reason}`;
        } else {
          result.reason = `API key valid, endpoint reachable (${healthResult.latency}ms)`;
        }
      }
    }

    return result;
  }

  /**
   * 根据提供商获取 API 密钥（支持共享密钥和配置文件直接提供的密钥）
   * @param {string} provider - 提供商名称
   * @returns {string|null} API 密钥
   */
  _getApiKeyForProvider(provider) {
    // 1. 首先尝试从 ModelRegistry 获取配置文件中直接提供的 API 密钥
    if (this.modelRegistry) {
      const models = this.modelRegistry.getAllModels();
      const modelsWithKey = models.filter(m => m.api_key && m.api_key.length > 10 && !m.api_key.includes('your_'));

      for (const model of models) {
        if (model.provider === provider && model.api_key && !model.api_key.includes('your_') && model.api_key.length > 10) {
          console.log(`[ModelHealthChecker] _getApiKeyForProvider: provider=${provider}, 找到API密钥 (长度=${model.api_key.length})`);
          return model.api_key;
        }
      }
    }

    // 2. 如果配置文件中没有，尝试从环境变量读取
    for (const [envVar, providers] of Object.entries(this.apiKeyProviders)) {
      if (providers.includes(provider.toLowerCase())) {
        const apiKey = process.env[envVar];
        if (apiKey && !apiKey.includes('your_')) {
          console.log(`[ModelHealthChecker] _getApiKeyForProvider: provider=${provider}, 从环境变量 ${envVar} 获取API密钥`);
          return apiKey;
        }
      }
    }
    console.log(`[ModelHealthChecker] _getApiKeyForProvider: provider=${provider}, 未找到API密钥`);
    return null;
  }

  /**
   * 根据提供商获取 API 端点（从配置文件获取实际配置的端点）
   * @param {string} provider - 提供商名称
   * @returns {string|null} API 端点
   */
  _getEndpointForProvider(provider) {
    // 1. 首先尝试从 ModelRegistry 获取配置文件中直接提供的端点
    if (this.modelRegistry) {
      const models = this.modelRegistry.getAllModels();

      for (const model of models) {
        if (model.provider === provider && model.api_base_url) {
          return model.api_base_url;
        }
      }
    }

    // 2. 如果配置文件中没有，使用硬编码的默认端点
    return this.providerEndpoints[provider] || null;
  }

  /**
   * 验证 API 密钥有效性（发送实际测试请求）
   * 使用实际配置的模型 ID 进行测试
   * 使用 axios 发送请求，自动支持 HTTP_PROXY/HTTPS_PROXY 环境变量
   * @param {string} provider - 提供商名称
   * @param {string} apiKey - API 密钥
   * @param {string} modelId - 要测试的模型 ID（使用配置中的 api_model_id）
   * @returns {Promise<Object>} 检查结果
   */
  async _checkApiKeyValidity(provider, apiKey, modelId) {
    const config = this._getTestRequestConfig(provider, apiKey, modelId);
    if (!config) {
      return { endpointReachable: false, apiKeyValid: false, reason: 'No test config for provider', latency: null };
    }

    const startTime = Date.now();

    try {
      const response = await axios({
        method: config.method,
        url: config.endpoint,
        headers: config.headers,
        data: config.body ? JSON.parse(config.body) : undefined,
        timeout: 30000,
        // axios 会自动使用 HTTP_PROXY/HTTPS_PROXY 环境变量
        // 对于 HTTPS 请求，会自动使用 HTTPS_PROXY
        validateStatus: () => true // 不抛出错误，接受所有状态码
      });

      const latency = Date.now() - startTime;
      const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

      // 调试日志：记录所有响应
      console.log(`[ModelHealthChecker] [${provider}] _checkApiKeyValidity: HTTP ${response.status}, data=${data.substring(0, 200)}`);

      // ========== 增强错误检测 ==========

      // 1. Rate Limit 检测 (429, 431)
      const isRateLimited = response.status === 429 || response.status === 431;
      if (isRateLimited) {
        // 尝试从响应头或响应体中获取重试信息
        let retryAfter = '';
        if (response.headers && response.headers['retry-after']) {
          retryAfter = `, retry after: ${response.headers['retry-after']}s`;
        }
        return {
          endpointReachable: true,
          apiKeyValid: true, // 密钥有效，只是暂时限流
          latency,
          isRateLimited: true,
          isQuotaExceeded: false,
          reason: `Rate limited (HTTP ${response.status})${retryAfter}`
        };
      }

      // 2. 配额超限检测
      const isQuotaExceeded = this._detectQuotaExceeded(response.status, data);
      if (isQuotaExceeded) {
        return {
          endpointReachable: true,
          apiKeyValid: false, // 配额用完，视为无效
          latency,
          isRateLimited: false,
          isQuotaExceeded: true,
          reason: 'API quota exceeded'
        };
      }

      // 3. 认证错误检测 (401, 403)
      const isAuthError = response.status === 401 || response.status === 403;

      // 4. 检查响应内容中是否包含认证错误关键词（扩展模式列表）
      const errorPatterns = [
        /invalid[_\s-]*(api)?[_\s-]*key/i,
        /unauthorized/i,
        /expired[_\s-]*token/i,
        /invalid[_\s-]*token/i,
        /authentication[_\s-]*failed/i,
        /access[_\s-]*denied/i,
        /api[_\s-]*key.*invalid/i,
        /token.*expired/i,
        /invalid.*access/i,
        /invalid_api_key/i,
        /error.*code.*invalid/i,
        /invalid.*token/i,
        /access.*token.*invalid/i,
        /token.*invalid/i,
        /code.*invalid/i,
        /invalid.*access.*token/i
      ];
      const hasErrorInBody = errorPatterns.some(pattern => pattern.test(data));

      // 5. 检查响应体是否包含 error 字段（JSON 错误响应）
      let hasJsonError = false;
      let jsonErrorMessage = '';
      if (response.data && typeof response.data === 'object' && response.data.error) {
        hasJsonError = true;
        jsonErrorMessage = typeof response.data.error === 'object'
          ? JSON.stringify(response.data.error).substring(0, 100)
          : String(response.data.error);
      }

      // 6. 5xx 状态码 → 服务器错误，需要细分处理
      const isServerError = response.status >= 500 && response.status < 600;
      if (isServerError) {
        // 【修复】502/503/504 网关错误不应该简单认为 API key 有效
        // 502 Bad Gateway: 通常表示上游服务无法正确处理请求，可能原因：
        //   - API key 无效/被禁用/未授权
        //   - 请求路由失败
        //   - 上游服务配置错误
        // 503 Service Unavailable: 服务暂时不可用
        // 504 Gateway Timeout: 网关超时，可能是暂时性问题
        // 只有 500 Internal Server Error 可以认为是服务器问题，API key 可能有效
        const isGatewayError = response.status === 502 || response.status === 503 || response.status === 504;

        if (isGatewayError) {
          // 【修复】对于网关错误，保守处理：标记为 API key 可能无效
          // 因为这类错误通常表示请求无法被正确路由到上游服务
          // 常见原因是 API key 无效、额度用完、或者 key 被禁用
          return {
            endpointReachable: true,
            apiKeyValid: false,  // 【修复】网关错误通常是 API key 问题
            latency,
            isRateLimited: false,
            isQuotaExceeded: false,
            reason: `Gateway error (HTTP ${response.status}) - likely API key issue, quota exceeded, or key disabled`
          };
        }

        // 500 Internal Server Error 可以认为是服务器问题，API key 可能有效
        return {
          endpointReachable: true,
          apiKeyValid: true,  // 500 是服务器问题，不是密钥问题
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: `Server temporarily unavailable (HTTP ${response.status})`
        };
      }

      // 7. 优先检查 401/403 认证错误 - 这是最可靠的方式
      if (isAuthError) {
        return {
          endpointReachable: true,
          apiKeyValid: false,
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: hasJsonError || hasErrorInBody
            ? `API key invalid (HTTP ${response.status}): ${jsonErrorMessage || data.substring(0, 100)}`
            : `Authentication failed (HTTP ${response.status}) - API key likely invalid or expired`
        };
      }

      // 8. 4xx 其他客户端错误 - 检查是否有错误响应
      const isClientError = response.status >= 400 && response.status < 500;
      if (isClientError && (hasJsonError || hasErrorInBody)) {
        return {
          endpointReachable: true,
          apiKeyValid: false,
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: `API returned client error (HTTP ${response.status}): ${jsonErrorMessage || data.substring(0, 100)}`
        };
      }

      // 9. 2xx 成功响应 - 检查是否有错误内容
      if (response.status >= 200 && response.status < 300) {
        // 即使是 200，也要检查响应体是否包含错误信息（某些API会返回200+错误）
        if (hasJsonError || hasErrorInBody) {
          return {
            endpointReachable: true,
            apiKeyValid: false,
            latency,
            isRateLimited: false,
            isQuotaExceeded: false,
            reason: `API returned error despite HTTP 200: ${jsonErrorMessage || data.substring(0, 100)}`
          };
        }
        console.log(`[ModelHealthChecker] [${provider}] _checkApiKeyValidity: 标记为有效 (apiKeyValid=true)`);
        return {
          endpointReachable: true,
          apiKeyValid: true,
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: 'API key valid, endpoint reachable'
        };
      }

      // 其他状态码（理论上不会到达这里）
      return {
        endpointReachable: true,
        apiKeyValid: false,
        latency,
        isRateLimited: false,
        isQuotaExceeded: false,
        reason: `Unexpected HTTP status: ${response.status}`
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      // 判断是否为超时错误
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return {
          endpointReachable: false,
          apiKeyValid: false,
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: 'Request timeout'
        };
      }

      // 判断是否为连接错误（可能是代理问题）
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        return {
          endpointReachable: false,
          apiKeyValid: false,
          latency,
          isRateLimited: false,
          isQuotaExceeded: false,
          reason: `Connection error: ${error.message}`
        };
      }

      return {
        endpointReachable: false,
        apiKeyValid: false,
        latency,
        isRateLimited: false,
        isQuotaExceeded: false,
        reason: `Connection error: ${error.message}`
      };
    }
  }

  /**
   * 检测配额是否超限
   * @param {number} status - HTTP 状态码
   * @param {string} data - 响应体内容
   * @returns {boolean} 是否配额超限
   */
  _detectQuotaExceeded(status, data) {
    // 1. HTTP 状态码 402 通常表示需要支付/配额用尽
    if (status === 402) {
      return true;
    }

    // 2. 检查响应体中的配额相关错误信息
    const quotaPatterns = [
      /quota[_\s-]*exceeded/i,
      /insufficient[_\s-]*quota/i,
      /billing[_\s-]*required/i,
      /payment[_\s-]*required/i,
      /monthly[_\s-]*limit/i,
      /daily[_\s-]*limit/i,
      /usage[_\s-]*limit/i,
      /exceed.*limit/i,
      /limit.*exceed/i,
      /no.*quota/i,
      /zero.*quota/i,
      /exceeded.*quota/i,
      /insufficient.*credits/i,
      /credits.*exhausted/i,
      /not.*enough.*credits/i,
      /free.*tier.*limit/i,
      /trial.*expired/i
    ];

    return quotaPatterns.some(pattern => pattern.test(data));
  }

  /**
   * 获取各提供商的测试请求配置
   * 使用配置文件中的实际端点，而非硬编码
   * 使用实际配置的模型 ID，而非通用测试模型
   * 注意：当 use_anthropic_format 为 true 时，使用 Anthropic 格式发送请求
   * @param {string} provider - 提供商名称
   * @param {string} apiKey - API 密钥
   * @param {string} modelId - 要测试的模型 ID（使用配置中的 api_model_id）
   * @returns {Object|null} 测试请求配置
   */
  _getTestRequestConfig(provider, apiKey, modelId) {
    // 从配置文件动态获取端点
    const baseUrl = this._getEndpointForProvider(provider);
    if (!baseUrl) {
      console.log(`[ModelHealthChecker] _getTestRequestConfig: provider=${provider}, baseUrl为空，未找到端点配置`);
      return null;
    }

    // 检查是否使用 Anthropic 兼容格式
    const useAnthropicFormat = this._isAnthropicFormat(provider);

    // OpenAI 兼容格式（chat completions）
    const openAICompatibleProviders = ['openai', 'deepseek', 'bailian', 'aliyun', 'moonshot', 'zhipu'];

    // Anthropic 格式
    const anthropicProviders = ['anthropic'];

    // Google Gemini 格式
    const googleProviders = ['google', 'gemini'];

    // 即使提供商在 openAICompatibleProviders 列表中，如果配置了 use_anthropic_format，仍然使用 Anthropic 格式
    if (useAnthropicFormat) {
      // Anthropic 兼容格式：baseUrl + /v1/messages (MiniMax 要求 /v1 前缀)
      const endpoint = `${baseUrl}/v1/messages`;
      const requestBody = {
        model: modelId || provider,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10
      };
      console.log(`[ModelHealthChecker] ${provider} 使用 Anthropic 格式: endpoint=${endpoint}, model=${requestBody.model}`);
      return {
        endpoint,
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };
    }

    // 对于明确标记为 Anthropic 的提供商
    if (anthropicProviders.includes(provider)) {
      // Anthropic 格式：baseUrl + /v1/messages
      return {
        endpoint: `${baseUrl}/v1/messages`,
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10
        })
      };
    }

    if (openAICompatibleProviders.includes(provider)) {
      // OpenAI 兼容格式：baseUrl + /chat/completions
      // 使用实际配置的模型 ID，不再使用通用测试模型
      const actualModelId = modelId || provider;

      return {
        endpoint: `${baseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: actualModelId,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        })
      };
    }

    if (googleProviders.includes(provider)) {
      // Google Gemini 格式：baseUrl + /models/{model}:generateContent
      return {
        endpoint: `${baseUrl}/models/gemini-1.5-flash:generateContent`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      };
    }

    // 默认返回 null（未知的提供商）
    return null;
  }

  /**
   * 更新模型状态
   * @param {string} modelId - 模型 ID
   * @param {boolean} available - 是否可用
   * @param {string} reason - 原因
   */
  _updateModelStatus(modelId, available, reason) {
    // 1. 更新 ModelStatusMonitor
    if (this.statusMonitor && this.statusMonitor.updateStatusFromHealthCheck) {
      this.statusMonitor.updateStatusFromHealthCheck(modelId, available, reason);
    } else if (this.statusMonitor) {
      this.statusMonitor.updateStatus(modelId, {
        isAvailable: available,
        healthCheckReason: reason,
        lastHealthCheck: new Date().toISOString()
      });
    }

    // 2. 【修复】同时更新 ModelRegistry 中的 model.available 属性
    // 这样 ModelSelector.getAvailableModels() 才能正确过滤不可用的模型
    if (this.modelRegistry) {
      const model = this.modelRegistry.getModel(modelId);
      if (model) {
        const oldAvailable = model.available;
        model.available = available;
        if (oldAvailable !== available) {
          console.log(`[ModelHealthChecker] 模型注册表更新: ${modelId} available: ${oldAvailable} -> ${available}`);
        }
      }
    }

    console.log(`[ModelHealthChecker] ${modelId}: ${available ? '✅ 可用' : '❌ 不可用'} - ${reason}`);
  }

  /**
   * 检查本地 Ollama 服务的可用性
   * @param {Object} results - 结果对象
   */
  async _checkLocalOllama(results) {
    const ollamaConfig = {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      timeout: 5000
    };

    try {
      const response = await axios({
        method: 'GET',
        url: `${ollamaConfig.baseUrl}/api/tags`,
        timeout: ollamaConfig.timeout,
        validateStatus: () => true
      });

      if (response.status === 200 && response.data.models) {
        results.localModels.ollama.available = true;
        results.localModels.ollama.reason = 'Ollama service is running';
        results.localModels.ollama.models = response.data.models.map(m => ({
          name: m.name,
          size: m.size,
          modified: m.modified_at
        }));

        console.log(`[ModelHealthChecker] Ollama: ✅ 可用 - ${response.data.models.length} 个模型`);
      } else {
        results.localModels.ollama.reason = `Ollama returned status ${response.status}`;
        console.log(`[ModelHealthChecker] Ollama: ❌ 不可用 - ${response.status}`);
      }
    } catch (error) {
      results.localModels.ollama.available = false;
      results.localModels.ollama.reason = `Ollama service error: ${error.message}`;
      console.log(`[ModelHealthChecker] Ollama: ❌ 不可用 - ${error.message}`);
    }
  }
}

module.exports = ModelHealthChecker;