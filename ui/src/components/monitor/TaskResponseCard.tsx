import React, { useState, useEffect, useRef } from 'react';
import ThinkingPanel from './ThinkingPanel';
import ToolCallList from './ToolCallList';
import ContinueConversationPanel from './ContinueConversationPanel';
import type { TaskResponse, ModelResponseEvent } from '../../hooks/useModelResponseSSE';

interface TaskResponseCardProps {
  task: TaskResponse;
  onCancel?: (taskId: string) => void;
  onContinue?: (taskId: string, message: string) => void;
  isSelected?: boolean;
  onSelect?: (taskId: string) => void;
}

const TaskResponseCard: React.FC<TaskResponseCardProps> = ({
  task,
  onCancel,
  onContinue,
  isSelected = false,
  onSelect
}) => {
  const [showContinuePanel, setShowContinuePanel] = useState(false);
  const [responseText, setResponseText] = useState('');
  const responseRef = useRef<HTMLDivElement>(null);

  // Update response text from task
  useEffect(() => {
    setResponseText(task.response);
  }, [task.response]);

  // Auto-scroll response
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [responseText]);

  const isStreaming = task.status === 'streaming';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isCancelled = task.status === 'cancelled';

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  // Format timestamp
  const formatTime = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get status badge
  const getStatusBadge = () => {
    if (isStreaming) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-900/50 text-indigo-300 text-xs font-medium rounded-full">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
          生成中
        </span>
      );
    }
    if (isCompleted) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-900/50 text-emerald-300 text-xs font-medium rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          已完成
        </span>
      );
    }
    if (isFailed) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-900/50 text-red-300 text-xs font-medium rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          失败
        </span>
      );
    }
    if (isCancelled) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 text-slate-400 text-xs font-medium rounded-full">
          已取消
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 bg-slate-700/50 text-slate-400 text-xs font-medium rounded-full">
        等待中
      </span>
    );
  };

  // Build conversation history for continue panel
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (task.query) {
    conversationHistory.push({ role: 'user', content: task.query });
  }
  if (task.response) {
    conversationHistory.push({ role: 'assistant', content: task.response });
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all cursor-pointer ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
          : 'border-slate-700 hover:border-slate-600 bg-slate-800/50 hover:bg-slate-800/70'
      }`}
      onClick={() => onSelect?.(task.taskId)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-3">
          {/* Task ID */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500">Task</span>
            <span className="text-xs font-mono text-indigo-400">{task.taskId.slice(0, 8)}</span>
          </div>
          {/* Status */}
          {getStatusBadge()}
          {/* Time */}
          <span className="text-xs text-slate-500">
            {formatTime(task.startTime)}
          </span>
          {/* Duration */}
          {task.duration && (
            <span className="text-xs text-slate-500">
              {formatDuration(task.duration)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isStreaming && onCancel && (
            <button
              onClick={() => onCancel(task.taskId)}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
              title="取消任务"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {isCompleted && onContinue && (
            <button
              onClick={() => setShowContinuePanel(!showContinuePanel)}
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-900/20 rounded-lg transition-colors"
              title="继续对话"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Query */}
      {task.query && (
        <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700/50">
          <p className="text-xs text-slate-500 mb-1">查询</p>
          <p className="text-sm text-slate-200 line-clamp-2">{task.query}</p>
        </div>
      )}

      {/* Error Message */}
      {isFailed && task.error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800/50">
          <p className="text-xs text-red-400 font-medium mb-1">错误</p>
          <p className="text-sm text-red-300">{task.error}</p>
        </div>
      )}

      {/* Content Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
            !showContinuePanel
              ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/30'
              : 'text-slate-500 hover:text-slate-400'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setShowContinuePanel(false);
          }}
        >
          响应内容
        </button>
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
            showContinuePanel
              ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/30'
              : 'text-slate-500 hover:text-slate-400'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (isCompleted) setShowContinuePanel(true);
          }}
          disabled={!isCompleted}
        >
          继续对话
        </button>
      </div>

      {/* Continue Panel */}
      {showContinuePanel && isCompleted && onContinue && (
        <ContinueConversationPanel
          taskId={task.taskId}
          conversationHistory={conversationHistory}
          onContinue={onContinue}
          onClose={() => setShowContinuePanel(false)}
        />
      )}

      {/* Main Content (Response) */}
      {!showContinuePanel && (
        <div className="p-4 space-y-4">
          {/* Thinking Panel */}
          {task.thinking && (
            <ThinkingPanel thinking={task.thinking} isStreaming={isStreaming} />
          )}

          {/* Tool Calls */}
          {task.toolCalls.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-slate-300">工具调用</span>
                <span className="text-xs text-slate-500">({task.toolCalls.length})</span>
              </div>
              <ToolCallList toolCalls={task.toolCalls} isStreaming={isStreaming} />
            </div>
          )}

          {/* Response */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span className="text-sm font-medium text-slate-300">响应</span>
              {isStreaming && (
                <span className="flex items-center gap-1.5 text-xs text-indigo-400">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                  生成中
                </span>
              )}
            </div>
            <div
              ref={responseRef}
              className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 min-h-[100px] max-h-[300px] overflow-y-auto"
            >
              {responseText ? (
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {responseText}
                  {isStreaming && (
                    <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse" />
                  )}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">等待响应...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskResponseCard;
