/**
 * HealthChecker - 模型健康检查器
 *
 * 用于执行针对特定模型的健康检查
 */
class HealthChecker {
  constructor(modelId, requester = null) {
    this.modelId = modelId;
    this.requester = requester || require('./AsyncRequester').AsyncRequester;
  }

  async checkHealth() {
    try {
      // 根据模型类型执行相应的健康检查
      const modelType = this.getModelType(this.modelId);

      let healthResult;
      switch (modelType) {
        case 'openai':
          healthResult = await this.checkOpenAIHealth();
          break;
        case 'anthropic':
          healthResult = await this.checkAnthropicHealth();
          break;
        case 'gemini':
          healthResult = await this.checkGeminiHealth();
          break;
        case 'ollama':
          healthResult = await this.checkOllamaHealth();
          break;
        default:
          healthResult = await this.checkGenericHealth();
          break;
      }

      return {
        available: true,
        reason: 'Healthy',
        lastChecked: new Date(),
        latency: healthResult.latency,
        details: healthResult.details
      };
    } catch (error) {
      return {
        available: false,
        reason: error.message,
        lastChecked: new Date(),
        latency: -1,
        error: error
      };
    }
  }

  getModelType(modelId) {
    if (modelId.includes('gpt')) return 'openai';
    if (modelId.includes('claude')) return 'anthropic';
    if (modelId.includes('gemini')) return 'gemini';
    if (modelId.includes('ollama') || modelId.includes('llama')) return 'ollama';
    return 'generic';
  }

  async checkOpenAIHealth() {
    const startTime = Date.now();

    try {
      // 发送一个简单的请求来测试模型是否可用
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'fake-key'}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10秒超时
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          latency,
          details: { models_endpoint_accessible: true }
        };
      } else {
        throw new Error(`OpenAI API responded with status: ${response.status}`);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      throw new Error(`OpenAI health check failed: ${error.message}`);
    }
  }

  async checkAnthropicHealth() {
    const startTime = Date.now();

    try {
      // 发送一个简单的请求来测试模型是否可用
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || 'fake-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hello' }]
        }),
        timeout: 10000 // 10秒超时
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          latency,
          details: { messages_endpoint_accessible: true }
        };
      } else {
        throw new Error(`Anthropic API responded with status: ${response.status}`);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      throw new Error(`Anthropic health check failed: ${error.message}`);
    }
  }

  async checkGeminiHealth() {
    const startTime = Date.now();

    try {
      const apiKey = process.env.GEMINI_API_KEY || 'fake-key';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}?key=${apiKey}`, {
        method: 'GET',
        timeout: 10000 // 10秒超时
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          latency,
          details: { model_info_retrievable: true }
        };
      } else {
        throw new Error(`Gemini API responded with status: ${response.status}`);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      throw new Error(`Gemini health check failed: ${error.message}`);
    }
  }

  async checkOllamaHealth() {
    const startTime = Date.now();

    try {
      // 检查Ollama服务器是否运行
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        timeout: 10000 // 10秒超时
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const modelExists = data.models.some(model => model.name === this.modelId);

        if (modelExists) {
          return {
            latency,
            details: { server_running: true, model_available: true }
          };
        } else {
          throw new Error(`Ollama model '${this.modelId}' not found`);
        }
      } else {
        throw new Error(`Ollama API responded with status: ${response.status}`);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      throw new Error(`Ollama health check failed: ${error.message}`);
    }
  }

  async checkGenericHealth() {
    // 对于未知类型的模型，返回基本的健康状态
    const latency = 0;
    return {
      latency,
      details: { model_type_unknown: true, assuming_healthy: true }
    };
  }
}

module.exports = { HealthChecker };