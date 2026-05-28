import React, { useState, useCallback } from 'react';
import { useModelResponseSSE, type TaskResponse } from '../../hooks/useModelResponseSSE';
import TaskResponseCard from './TaskResponseCard';

const ModelResponseMonitor: React.FC = () => {
  const {
    isConnected,
    tasks,
    activeTasks,
    completedTasks,
    clearCompletedTasks,
    clearAllTasks,
    cancelTask,
    endSession
  } = useModelResponseSSE();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'active' | 'completed'>('all');

  const handleContinue = useCallback((taskId: string, message: string) => {
    // Send continue request to backend
    fetch('http://localhost:3458/v1/model/response/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, message })
    }).catch((err) => {
      console.error('Failed to send continue request:', err);
    });
  }, []);

  const handleCancel = useCallback((taskId: string) => {
    cancelTask(taskId);
  }, [cancelTask]);

  // Filter tasks based on view mode
  const filteredTasks = tasks.filter((task) => {
    if (viewMode === 'active') return task.status === 'streaming' || task.status === 'pending';
    if (viewMode === 'completed') return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
    return true;
  });

  // Get selected task
  const selectedTask = selectedTaskId ? tasks.find((t) => t.taskId === selectedTaskId) : null;

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel - Task List */}
      <div className="w-96 flex-shrink-0 flex flex-col bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-200">模型响应</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-xs text-slate-500">
                {isConnected ? '已连接' : '未连接'}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-indigo-400">{activeTasks.length}</p>
              <p className="text-xs text-slate-500">进行中</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-emerald-400">{completedTasks.filter((t) => t.status === 'completed').length}</p>
              <p className="text-xs text-slate-500">已完成</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-slate-400">{tasks.length}</p>
              <p className="text-xs text-slate-500">总计</p>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex gap-1 p-1 bg-slate-900/50 rounded-lg">
            <button
              onClick={() => setViewMode('all')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setViewMode('active')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'active'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              进行中
            </button>
            <button
              onClick={() => setViewMode('completed')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'completed'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              已完成
            </button>
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-sm text-slate-500">
                {viewMode === 'active'
                  ? '暂无进行中的任务'
                  : viewMode === 'completed'
                  ? '暂无已完成的任务'
                  : '暂无任务'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskResponseCard
                key={task.taskId}
                task={task}
                isSelected={selectedTaskId === task.taskId}
                onSelect={setSelectedTaskId}
                onCancel={handleCancel}
                onContinue={handleContinue}
              />
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-700 bg-slate-900/50">
          <div className="flex gap-2">
            <button
              onClick={clearCompletedTasks}
              className="flex-1 px-3 py-2 bg-slate-700 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              清理已完成
            </button>
            <button
              onClick={clearAllTasks}
              className="flex-1 px-3 py-2 bg-slate-700 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              清理全部
            </button>
            <button
              onClick={endSession}
              className="flex-1 px-3 py-2 bg-red-900/30 text-red-400 text-xs font-medium rounded-lg hover:bg-red-900/50 transition-colors border border-red-800/50"
            >
              结束会话
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Detail View */}
      <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
        {selectedTask ? (
          <>
            {/* Detail Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">任务详情</h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{selectedTask.taskId}</p>
                </div>
                <button
                  onClick={() => setSelectedTaskId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Query */}
              {selectedTask.query && (
                <div className="mt-3 p-3 bg-slate-900/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">查询</p>
                  <p className="text-sm text-slate-200">{selectedTask.query}</p>
                </div>
              )}
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Full Thinking */}
              {selectedTask.thinking && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    思考过程
                  </h4>
                  <pre className="p-4 bg-slate-900 rounded-lg border border-slate-700 text-sm text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                    {selectedTask.thinking}
                  </pre>
                </div>
              )}

              {/* Tool Calls */}
              {selectedTask.toolCalls.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    工具调用 ({selectedTask.toolCalls.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedTask.toolCalls.map((call, i) => (
                      <div key={i} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-indigo-300">{call.toolName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            call.toolResult
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : 'bg-slate-700 text-slate-400'
                          }`}>
                            {call.toolResult ? '已完成' : '执行中'}
                          </span>
                        </div>
                        {call.toolArgs && Object.keys(call.toolArgs).length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs text-slate-500 mb-1">参数:</p>
                            <pre className="p-2 bg-slate-800 rounded text-xs text-slate-400 overflow-x-auto">
                              {JSON.stringify(call.toolArgs, null, 2)}
                            </pre>
                          </div>
                        )}
                        {call.toolResult && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">结果:</p>
                            <pre className="p-2 bg-slate-800 rounded text-xs text-emerald-400/80 overflow-x-auto max-h-32">
                              {typeof call.toolResult === 'string'
                                ? call.toolResult
                                : JSON.stringify(call.toolResult, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Response */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  响应
                  {selectedTask.status === 'streaming' && (
                    <span className="flex items-center gap-1.5 text-xs text-indigo-400">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                      生成中
                    </span>
                  )}
                </h4>
                <pre className="p-4 bg-slate-900 rounded-lg border border-slate-700 text-sm text-slate-200 whitespace-pre-wrap overflow-x-auto min-h-[100px] max-h-96 overflow-y-auto">
                  {selectedTask.response || '等待响应...'}
                </pre>
              </div>
            </div>

            {/* Continue Button */}
            {selectedTask.status === 'completed' && (
              <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                <button
                  onClick={() => handleContinue(selectedTask.taskId, '')}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  继续对话
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">选择一个任务查看详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelResponseMonitor;
