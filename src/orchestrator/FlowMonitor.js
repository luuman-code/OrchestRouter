/**
 * 流程监控器 - 管理编排流程的 SSE 实时推送
 *
 * 提供流程事件的发射、存储和订阅功能
 */

class FlowMonitor {
  constructor(config = {}) {
    // SSE 客户端回调列表
    this.sseClients = new Set();

    // 编排流程历史 (in-memory) - 【修复】添加限制防止内存泄漏
    this.flowHistory = new Map();
    this.maxHistorySize = config.maxHistorySize || 500;  // 最多保留500条历史
    this.historyTtlMs = config.historyTtlMs || 3600000; // 保留1小时

    // 活跃编排及其当前阶段
    this.activeOrchestrations = new Map();

    // 事件 ID 计数器
    this.eventCounter = 0;

    this._log('FlowMonitor 初始化完成');
  }

  /**
   * 清理过期的流程历史记录
   * @private
   */
  _cleanupHistory() {
    if (this.flowHistory.size === 0) return;

    const now = Date.now();

    // 1. 清理过期记录
    for (const [id, record] of this.flowHistory.entries()) {
      const recordTime = record.endTime || record.startTime;
      if (recordTime && (now - recordTime > this.historyTtlMs)) {
        this.flowHistory.delete(id);
      }
    }

    // 2. 如果仍然超过最大限制，删除最旧的已完成记录
    if (this.flowHistory.size > this.maxHistorySize) {
      const sortedEntries = [...this.flowHistory.entries()]
        .filter(([_, record]) => record.status === 'completed')  // 只删除已完成的
        .sort((a, b) => {
          const timeA = a[1].endTime || a[1].startTime;
          const timeB = b[1].endTime || b[1].startTime;
          return timeA - timeB;
        });

      const toDelete = this.flowHistory.size - this.maxHistorySize;
      for (let i = 0; i < Math.min(toDelete, sortedEntries.length); i++) {
        this.flowHistory.delete(sortedEntries[i][0]);
      }
    }
  }

  /**
   * 日志方法
   */
  _log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [FlowMonitor] [${level}] ${message}`);
  }

  /**
   * 生成唯一事件 ID
   */
  _generateEventId() {
    return `evt_${++this.eventCounter}_${Date.now()}`;
  }

  /**
   * 开始新的编排流程
   */
  startOrchestration(orchestrationId, initialData = {}) {
    const orchestration = {
      id: orchestrationId,
      startTime: Date.now(),
      status: 'running',
      phases: {},
      initialData,
      events: []
    };

    this.activeOrchestrations.set(orchestrationId, orchestration);
    this.flowHistory.set(orchestrationId, orchestration);

    this._log(`编排流程开始: ${orchestrationId}`);
  }

  /**
   * 发射阶段事件
   */
  emitPhaseEvent(orchestrationId, phase, step, status, data = {}) {
    const event = {
      id: this._generateEventId(),
      orchestrationId,
      phase,
      step,
      status,
      data,
      timestamp: Date.now()
    };

    // 更新活跃编排的当前状态
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (orchestration) {
      // 初始化阶段
      if (!orchestration.phases[phase]) {
        orchestration.phases[phase] = {
          startTime: null,
          endTime: null,
          steps: {}
        };
      }

      const phaseData = orchestration.phases[phase];

      // 记录阶段时间
      if (status === 'started' || status === 'running') {
        phaseData.startTime = phaseData.startTime || Date.now();
      } else if (status === 'completed' || status === 'failed') {
        phaseData.endTime = Date.now();
        if (phaseData.startTime) {
          event.duration = phaseData.endTime - phaseData.startTime;
        }
      }

      // 记录步骤
      phaseData.steps[step] = {
        status,
        timestamp: event.timestamp,
        duration: event.duration,
        data
      };
    }

    // 存储事件
    orchestration?.events.push(event);

    // 限制历史事件数量
    if (orchestration && orchestration.events.length > 1000) {
      orchestration.events = orchestration.events.slice(-500);
    }

    // 广播到所有 SSE 客户端
    this._broadcast(event);

    this._log(`流程事件: ${orchestrationId} [${phase}] ${step} -> ${status}`);

    return event;
  }

  /**
   * 完成编排流程
   */
  completeOrchestration(orchestrationId, finalData = {}) {
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (orchestration) {
      orchestration.endTime = Date.now();
      orchestration.status = 'completed';
      orchestration.finalData = finalData;

      // 计算总耗时
      if (orchestration.startTime) {
        orchestration.totalDuration = orchestration.endTime - orchestration.startTime;
      }

      // 发射完成事件
      this.emitPhaseEvent(orchestrationId, 'orchestration', 'complete', 'completed', {
        totalDuration: orchestration.totalDuration,
        ...finalData
      });

      // 从活跃列表移除
      this.activeOrchestrations.delete(orchestrationId);

      // 【修复】清理过期的流程历史
      this._cleanupHistory();

      this._log(`编排流程完成: ${orchestrationId}, 耗时: ${orchestration.totalDuration}ms`);
    }
  }

  /**
   * 失败编排流程
   */
  failOrchestration(orchestrationId, error) {
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (orchestration) {
      orchestration.endTime = Date.now();
      orchestration.status = 'failed';
      orchestration.error = error;

      if (orchestration.startTime) {
        orchestration.totalDuration = orchestration.endTime - orchestration.startTime;
      }

      this.emitPhaseEvent(orchestrationId, 'orchestration', 'fail', 'failed', {
        totalDuration: orchestration.totalDuration,
        error: error.message || String(error)
      });

      this.activeOrchestrations.delete(orchestrationId);

      this._log(`编排流程失败: ${orchestrationId}, 错误: ${error.message || error}`, 'error');
    }
  }

  /**
   * 订阅 SSE
   */
  subscribeSSE(clientCallback) {
    this.sseClients.add(clientCallback);
    this._log(`SSE 客户端订阅, 当前订阅数: ${this.sseClients.size}`);

    // 返回取消订阅函数
    return () => {
      this.sseClients.delete(clientCallback);
      this._log(`SSE 客户端取消订阅, 当前订阅数: ${this.sseClients.size}`);
    };
  }

  /**
   * 广播事件到所有 SSE 客户端
   */
  _broadcast(event) {
    const message = this._formatSSEMessage(event);
    // 【修复】复制 Set 以避免迭代时修改导致的竞态条件
    const clients = [...this.sseClients];
    const failedClients = [];

    for (const client of clients) {
      try {
        client(message);
      } catch (err) {
        this._log(`SSE 广播错误: ${err.message}`, 'error');
        failedClients.push(client);
      }
    }

    // 移除失败的客户端
    for (const client of failedClients) {
      this.sseClients.delete(client);
    }
  }

  /**
   * 格式化 SSE 消息
   */
  _formatSSEMessage(event) {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * 获取流程历史
   */
  getFlowHistory(orchestrationId) {
    const orchestration = this.flowHistory.get(orchestrationId);
    if (!orchestration) {
      return null;
    }

    return {
      ...orchestration,
      // 计算每个阶段的耗时
      phases: Object.entries(orchestration.phases || {}).reduce((acc, [phaseName, phaseData]) => {
        acc[phaseName] = {
          ...phaseData,
          duration: phaseData.endTime && phaseData.startTime
            ? phaseData.endTime - phaseData.startTime
            : null
        };
        return acc;
      }, {}),
      // 返回历史事件（日志）
      events: orchestration.events || []
    };
  }

  /**
   * 获取所有活跃编排列表
   */
  getActiveOrchestrations() {
    return Array.from(this.activeOrchestrations.values()).map(orch => ({
      id: orch.id,
      startTime: orch.startTime,
      status: orch.status,
      phases: Object.keys(orch.phases || {}),
      currentPhase: this._getCurrentPhase(orch)
    }));
  }

  /**
   * 获取当前活跃阶段
   */
  _getCurrentPhase(orchestration) {
    const phases = ['decomposition', 'model_selection', 'execution', 'integration'];
    for (const phase of phases) {
      const phaseData = orchestration.phases?.[phase];
      if (phaseData && !phaseData.endTime) {
        return phase;
      }
    }
    return 'orchestration';
  }

  /**
   * 获取订阅者数量（用于健康检查）
   */
  getSubscriberCount() {
    return this.sseClients.size;
  }

  /**
   * 发射工具调用进度事件
   * 用于流式响应中实时推送工具调用进度
   * @param {string} orchestrationId - 编排ID
   * @param {Object} toolCall - 工具调用对象
   * @param {string} status - 状态 (started|completed|error)
   * @param {Object} data - 额外数据
   */
  emitToolCallProgress(orchestrationId, toolCall, status, data = {}) {
    const event = {
      id: this._generateEventId(),
      orchestrationId,
      type: 'tool_call_progress',
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments
      },
      status, // 'started' | 'completed' | 'error'
      timestamp: Date.now(),
      ...data
    };

    // 广播到所有 SSE 客户端
    this._broadcast(event);

    this._log(`工具调用进度: ${orchestrationId} [${toolCall.name}] ${status}`);

    return event;
  }

  /**
   * 发射思考过程进度事件
   * 用于流式响应中实时推送思考过程
   * @param {string} orchestrationId - 编排ID
   * @param {string} thinkingContent - 思考内容增量
   * @param {string} phase - 思考阶段 (reasoning|planning|analyzing)
   * @param {Object} data - 额外数据
   */
  emitThinkingProgress(orchestrationId, thinkingContent, phase = 'reasoning', data = {}) {
    const event = {
      id: this._generateEventId(),
      orchestrationId,
      type: 'thinking_progress',
      phase, // 'reasoning' | 'planning' | 'analyzing'
      content: thinkingContent,
      timestamp: Date.now(),
      ...data
    };

    // 广播到所有 SSE 客户端
    this._broadcast(event);

    return event;
  }

  /**
   * 发射文本块进度事件
   * 用于流式响应中实时推送文本输出
   * @param {string} orchestrationId - 编排ID
   * @param {string} textDelta - 文本增量
   * @param {string} targetId - 目标ID（任务ID或子任务ID）
   * @param {Object} data - 额外数据
   */
  emitTextDelta(orchestrationId, textDelta, targetId = null, data = {}) {
    const event = {
      id: this._generateEventId(),
      orchestrationId,
      type: 'text_delta',
      delta: textDelta,
      targetId,
      timestamp: Date.now(),
      ...data
    };

    // 广播到所有 SSE 客户端
    this._broadcast(event);

    return event;
  }
}

module.exports = FlowMonitor;
