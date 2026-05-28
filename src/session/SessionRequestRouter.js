/**
 * 会话请求路由器
 * 根据请求类型将请求路由到不同的处理策略
 */
class SessionRequestRouter {
  constructor(sessionManager, requestClassifier) {
    this.sessionManager = sessionManager;
    this.requestClassifier = requestClassifier;

    // 注册处理策略
    this.handlers = new Map();
    this.defaultHandler = null;
  }

  /**
   * 注册处理程序
   * @param {string} requestType - 请求类型
   * @param {Function} handler - 处理函数
   */
  registerHandler(requestType, handler) {
    this.handlers.set(requestType, handler);
  }

  /**
   * 设置默认处理程序
   * @param {Function} handler - 处理函数
   */
  setDefaultHandler(handler) {
    this.defaultHandler = handler;
  }

  /**
   * 路由请求到适当的处理程序
   * @param {string} sessionId - 会话ID
   * @param {string} requestText - 请求文本
   * @param {Object} additionalParams - 额外参数
   * @returns {Promise<any>} 处理结果
   */
  async routeRequest(sessionId, requestText, additionalParams = {}) {
    // 首先分类请求
    const classification = this.requestClassifier.classifyRequest(requestText);

    // 获取对应类型的处理程序
    const handler = this.handlers.get(classification.type) || this.defaultHandler;

    if (!handler) {
      throw new Error(`No handler registered for request type: ${classification.type}`);
    }

    // 调用处理程序
    return await handler(sessionId, requestText, {
      ...additionalParams,
      classification,
      sessionManager: this.sessionManager
    });
  }

  /**
   * 检查是否有处理器注册
   * @param {string} requestType - 请求类型
   * @returns {boolean} 是否存在处理器
   */
  hasHandler(requestType) {
    return this.handlers.has(requestType);
  }

  /**
   * 获取所有注册的处理器
   * @returns {Map} 处理器映射
   */
  getHandlers() {
    return new Map(this.handlers);
  }
}

module.exports = SessionRequestRouter;