import React, { useState } from 'react';
import type { ModelResponseEvent } from '../../hooks/useModelResponseSSE';

interface ToolCallListProps {
  toolCalls: ModelResponseEvent[];
  isStreaming?: boolean;
}

interface ToolCallItemProps {
  toolCall: ModelResponseEvent;
  isLast: boolean;
  isStreaming: boolean;
}

const ToolCallItem: React.FC<ToolCallItemProps> = ({ toolCall, isLast, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasResult = !!toolCall.toolResult;
  const isPending = !hasResult && toolCall.type === 'tool_call';

  // Format tool arguments for display
  const formatArgs = (args: Record<string, any> | undefined): string => {
    if (!args) return '{}';
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  // Format tool result for display
  const formatResult = (result: any): string => {
    if (!result) return 'null';
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return result.length > 500 ? result.substring(0, 500) + '...' : result;
      }
    }
    return JSON.stringify(result, null, 2);
  };

  // Truncate long content
  const truncate = (str: string, maxLen: number): string => {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  };

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-0 w-px bg-slate-600" />
      )}

      <div className={`flex gap-3 p-3 rounded-lg border transition-all ${
        isPending
          ? 'bg-slate-800/50 border-slate-600'
          : hasResult
          ? 'bg-emerald-900/20 border-emerald-700/50'
          : 'bg-slate-800 border-slate-700'
      }`}>
        {/* Status indicator */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 border-slate-600 bg-slate-900">
          {isPending ? (
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : hasResult ? (
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Tool name and status */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-300">
                {toolCall.toolName || 'unknown_tool'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isPending
                  ? 'bg-indigo-900/50 text-indigo-300'
                  : hasResult
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : 'bg-slate-700 text-slate-300'
              }`}>
                {isPending ? '执行中' : hasResult ? '已完成' : '等待中'}
              </span>
            </div>
            {isLast && isStreaming && isPending && (
              <span className="text-xs text-indigo-400 animate-pulse">执行中...</span>
            )}
          </div>

          {/* Arguments */}
          {toolCall.toolArgs && Object.keys(toolCall.toolArgs).length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>参数</span>
              </button>
              {isExpanded ? (
                <pre className="mt-2 p-3 bg-slate-900 rounded border border-slate-700 text-xs text-slate-300 font-mono overflow-x-auto">
                  {formatArgs(toolCall.toolArgs)}
                </pre>
              ) : (
                <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                  {truncate(formatArgs(toolCall.toolArgs), 100)}
                </p>
              )}
            </div>
          )}

          {/* Result */}
          {toolCall.toolResult && (
            <div className="mt-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>结果</span>
              </button>
              {isExpanded ? (
                <pre className="mt-2 p-3 bg-slate-900 rounded border border-emerald-800/50 text-xs text-emerald-300 font-mono overflow-x-auto max-h-64">
                  {formatResult(toolCall.toolResult)}
                </pre>
              ) : (
                <p className="mt-1 text-xs text-emerald-400/70 font-mono truncate">
                  {truncate(formatResult(toolCall.toolResult), 100)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ToolCallList: React.FC<ToolCallListProps> = ({ toolCalls, isStreaming = false }) => {
  if (toolCalls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-center py-8">
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-slate-500">暂无工具调用</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto max-h-96 p-1">
      {toolCalls.map((toolCall, index) => (
        <ToolCallItem
          key={`${toolCall.id}-${index}`}
          toolCall={toolCall}
          isLast={index === toolCalls.length - 1}
          isStreaming={isStreaming && index === toolCalls.length - 1}
        />
      ))}
    </div>
  );
};

export default ToolCallList;
