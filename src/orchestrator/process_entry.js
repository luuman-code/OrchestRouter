#!/usr/bin/env node

/**
 * OrchestratorAgent 进程入口点
 *
 * 用于 AgentPool 进程池管理
 * - 从 stdin 读取消息
 * - 通过 AgentProtocol 解析
 * - 调用 OrchestratorAgent
 * - 通过 stdout 返回响应
 *
 * 通信协议（JSON）：
 * - 初始化请求: {"type": "init", "config": {...}}
 * - 任务请求: {"type": "task", "message": {...}}
 * - 心跳: {"type": "heartbeat"}
 * - 停止: {"type": "stop"}
 *
 * 响应格式：
 * - {"type": "response", "id": "...", "data": {...}}
 * - {"type": "error", "id": "...", "error": "..."}
 * - {"type": "log", "level": "...", "message": "..."}
 */

const { OrchestratorAgent, AgentState } = require('./OrchestratorAgent');
const readline = require('readline');

// 全局 Agent 实例
let agent = null;
let isShuttingDown = false;

/**
 * 创建 readline 接口
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
}

/**
 * 发送响应到 stdout
 */
function sendResponse(type, id, data) {
  const response = JSON.stringify({ type, id, data, timestamp: Date.now() });
  console.log(response);
}

/**
 * 发送错误到 stdout
 */
function sendError(id, error) {
  const response = JSON.stringify({
    type: 'error',
    id,
    error: error.toString(),
    timestamp: Date.now()
  });
  console.log(response);
}

/**
 * 发送日志到 stdout
 */
function sendLog(level, message) {
  const response = JSON.stringify({
    type: 'log',
    level,
    message,
    timestamp: Date.now()
  });
  console.log(response);
}

/**
 * 初始化 Agent
 */
async function handleInit(id, config) {
  try {
    sendLog('info', '正在初始化 OrchestratorAgent...');

    agent = new OrchestratorAgent({
      llmConfig: config.llmConfig,
      agentConfig: config.agentConfig || { maxIterations: 10, verbose: true },
      orchestratorConfig: config.orchestratorConfig || {},
      memoryHooks: {
        recall: config.memoryHooks?.recall || (() => []),
        memorize: config.memoryHooks?.memorize || (() => {}),
        afterExecute: config.memoryHooks?.afterExecute || (() => {})
      }
    });

    await agent.initialize();

    sendResponse('initialized', id, {
      success: true,
      status: agent.getStatus()
    });

    sendLog('info', 'OrchestratorAgent 初始化完成');

  } catch (error) {
    sendLog('error', `初始化失败: ${error.message}`);
    sendError(id, error);
  }
}

/**
 * 处理任务消息
 */
async function handleTask(id, message) {
  if (!agent) {
    sendError(id, new Error('Agent 未初始化'));
    return;
  }

  if (agent.state === AgentState.ERROR) {
    sendError(id, new Error('Agent 处于错误状态'));
    return;
  }

  try {
    sendLog('info', `收到任务: ${message.content?.substring(0, 100)}...`);

    // 监听 agent 日志
    const logHandler = ({ level, message }) => {
      sendLog(level, `[Agent] ${message}`);
    };
    agent.on('log', logHandler);

    // 调用 agent
    const result = await agent.receive_message(message);

    // 移除日志监听
    agent.off('log', logHandler);

    sendResponse('response', id, {
      success: result.success,
      content: result.content,
      iterations: result.iterations,
      error: result.error,
      status: agent.getStatus()
    });

    sendLog('info', `任务完成: success=${result.success}, iterations=${result.iterations}`);

  } catch (error) {
    sendLog('error', `任务执行失败: ${error.message}`);
    sendError(id, error);
  }
}

/**
 * 处理心跳
 */
function handleHeartbeat(id) {
  const status = agent?.getStatus() || { state: 'not_initialized' };
  sendResponse('heartbeat', id, {
    alive: true,
    status
  });
}

/**
 * 处理停止请求
 */
async function handleStop(id) {
  isShuttingDown = true;

  if (agent) {
    try {
      await agent.stop();
      sendLog('info', 'OrchestratorAgent 已停止');
    } catch (error) {
      sendLog('error', `停止 Agent 时出错: ${error.message}`);
    }
  }

  sendResponse('stopped', id, { success: true });
  process.exit(0);
}

/**
 * 解析并处理消息
 */
async function processMessage(line) {
  if (!line || line.trim() === '') {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    sendError('unknown', new Error(`无效的 JSON: ${error.message}`));
    return;
  }

  const { type, id, config, message: taskMessage } = message;

  switch (type) {
    case 'init':
      await handleInit(id, config || {});
      break;

    case 'task':
      await handleTask(id, taskMessage);
      break;

    case 'heartbeat':
      handleHeartbeat(id);
      break;

    case 'stop':
      await handleStop(id);
      break;

    default:
      sendError(id || 'unknown', new Error(`未知消息类型: ${type}`));
  }
}

/**
 * 主函数
 */
async function main() {
  console.error = (...args) => {
    // 重定向 console.error 到 stderr
    process.stderr.write(args.join(' ') + '\n');
  };

  sendLog('info', 'OrchestratorAgent 进程启动');

  const rl = createInterface();

  rl.on('line', async (line) => {
    try {
      await processMessage(line);
    } catch (error) {
      sendError('unknown', error);
    }
  });

  rl.on('close', () => {
    if (!isShuttingDown) {
      sendLog('warn', 'stdin 关闭，进程将退出');
      process.exit(0);
    }
  });

  // 处理进程信号
  process.on('SIGINT', async () => {
    sendLog('info', '收到 SIGINT 信号');
    if (agent) {
      await agent.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    sendLog('info', '收到 SIGTERM 信号');
    if (agent) {
      await agent.stop();
    }
    process.exit(0);
  });

  // 错误处理
  process.on('uncaughtException', (error) => {
    sendLog('error', `未捕获的异常: ${error.message}`);
    sendError('unknown', error);
  });

  process.on('unhandledRejection', (reason) => {
    sendLog('error', `未处理的 Promise 拒绝: ${reason}`);
  });
}

// 运行
main().catch((error) => {
  console.error(`进程启动失败: ${error.message}`);
  process.exit(1);
});
