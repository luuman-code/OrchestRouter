import React, { useState, useCallback, useEffect } from 'react';
import { useFlowSSE } from '../../hooks/useFlowSSE';
import type { FlowEvent, FlowOrchestration } from '../../hooks/useFlowSSE';

interface PhaseInfo {
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: Record<string, StepInfo>;
}

interface StepInfo {
  status: 'started' | 'running' | 'completed' | 'failed';
  timestamp: number;
  duration?: number;
  data?: Record<string, any>;
}

interface OrchestrationDetail {
  id: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  totalDuration?: number;
  phases: Record<string, PhaseInfo>;
}

const PHASE_ORDER = ['decomposition', 'model_selection', 'execution', 'integration'];
const PHASE_LABELS: Record<string, string> = {
  decomposition: '任务分解',
  model_selection: '模型选择',
  execution: '并发执行',
  integration: '结果整合'
};

const getStatusStyle = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-600 border-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-600 border-rose-200';
    case 'running':
      return 'bg-indigo-50 border-indigo-200';
    default:
      return 'bg-slate-100 text-slate-400 border-slate-200';
  }
};

const getStatusIcon = (status: string): React.ReactNode => {
  switch (status) {
    case 'completed':
      return (
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'running':
      return (
        <svg className="w-4 h-4 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    default:
      return null;
  }
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const timeStr = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${timeStr}.${ms}`;
};

interface LogEntry {
  id: string;
  timestamp: number;
  module: string;
  step: string;
  message: string;
  status: string;
}

const MODULE_LABELS: Record<string, string> = {
  orchestration: '编排器',
  decomposition: '分解器',
  model_selection: '模型选择器',
  execution: '执行器',
  integration: '整合器'
};

const FlowMonitor: React.FC = () => {
  const [activeOrchestrations, setActiveOrchestrations] = useState<FlowOrchestration[]>([]);
  const [selectedOrchestration, setSelectedOrchestration] = useState<string | null>(null);
  const [orchestrationDetails, setOrchestrationDetails] = useState<Record<string, OrchestrationDetail>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'logs' | 'details'>('logs');

  const handleEvent = useCallback((event: FlowEvent) => {
    const { orchestrationId, phase, step, status, data, timestamp, duration } = event;

    // 添加日志条目
    const logMessage = data?.message || step;
    const moduleLabel = MODULE_LABELS[phase] || phase;
    const newLog: LogEntry = {
      id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      module: moduleLabel,
      step: step,
      message: logMessage,
      status
    };

    setLogs((prev) => {
      const updated = [...prev, newLog];
      // 保持最多 500 条日志
      return updated.slice(-500);
    });

    setActiveOrchestrations((prev) => {
      const exists = prev.some((o) => o.id === orchestrationId);
      if (!exists && status !== 'completed' && status !== 'failed') {
        return [...prev, { id: orchestrationId, startTime: timestamp, status: 'running', phases: [phase], currentPhase: phase }];
      }
      return prev.map((o) =>
        o.id === orchestrationId
          ? { ...o, phases: o.phases.includes(phase) ? o.phases : [...o.phases, phase], currentPhase: phase }
          : o
      );
    });

    setOrchestrationDetails((prev) => {
      const existing = prev[orchestrationId] || {
        id: orchestrationId,
        startTime: timestamp,
        status: 'running' as const,
        phases: {}
      };

      const phaseData = existing.phases[phase] || { startTime: null, endTime: null, duration: null, status: 'pending' as const, steps: {} };

      if (status === 'started' || status === 'running') {
        phaseData.startTime = phaseData.startTime || timestamp;
        phaseData.status = 'running';
      } else if (status === 'completed' || status === 'failed') {
        phaseData.endTime = timestamp;
        phaseData.duration = duration || (phaseData.startTime ? timestamp - phaseData.startTime : null);
        phaseData.status = status === 'completed' ? 'completed' : 'failed';
      }

      phaseData.steps[step] = { status, timestamp, duration, data };

      if (status === 'completed' || status === 'failed') {
        existing.status = 'completed';
        existing.endTime = timestamp;
        existing.totalDuration = timestamp - existing.startTime;
      }

      return { ...prev, [orchestrationId]: { ...existing, phases: { ...existing.phases, [phase]: phaseData } } };
    });
  }, []);

  const { isConnected, events } = useFlowSSE(handleEvent, {
    url: 'http://localhost:3458/v1/flow/subscribe'
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('http://localhost:3458/v1/flow/status');
        const data = await response.json();
        if (data.activeOrchestrations) {
          setActiveOrchestrations(data.activeOrchestrations);
        }
      } catch (err) {
        console.error('Failed to fetch flow status:', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // 当选中编排时，从 API 获取完整的流程历史和日志
  useEffect(() => {
    if (!selectedOrchestration) return;

    const abortController = new AbortController();

    const fetchOrchestrationDetails = async () => {
      try {
        const response = await fetch(`http://localhost:3458/v1/flow/${selectedOrchestration}`, {
          signal: abortController.signal
        });
        if (!response.ok) {
          console.error('Failed to fetch orchestration details:', response.status);
          return;
        }
        const history = await response.json();

        // 将获取的历史数据更新到 orchestrationDetails
        setOrchestrationDetails((prev) => ({
          ...prev,
          [selectedOrchestration]: {
            id: history.id || selectedOrchestration,
            startTime: history.startTime || 0,
            endTime: history.endTime,
            status: history.status || 'running',
            totalDuration: history.totalDuration,
            phases: history.phases || {}
          }
        }));

        // 将历史事件转换为日志并更新日志列表
        if (history.events && Array.isArray(history.events)) {
          const historicalLogs: LogEntry[] = history.events.map((event: any, index: number) => {
            const logMessage = event.data?.message || event.step || '';
            const moduleLabel = MODULE_LABELS[event.phase] || event.phase || 'unknown';
            return {
              id: `history-${event.timestamp}-${index}`,
              timestamp: event.timestamp || 0,
              module: moduleLabel,
              step: event.step || '',
              message: logMessage,
              status: event.status || 'unknown'
            };
          });

          // 合并历史日志和实时日志，保留最新的
          setLogs((prevLogs) => {
            const existingIds = new Set(prevLogs.map(l => l.id));
            const newLogs = historicalLogs.filter(l => !existingIds.has(l.id));
            // 按时间排序
            const combined = [...prevLogs, ...newLogs].sort((a, b) => a.timestamp - b.timestamp);
            return combined.slice(-500); // 保留最多 500 条
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch orchestration details:', err);
      }
    };

    fetchOrchestrationDetails();

    return () => abortController.abort();
  }, [selectedOrchestration]);

  const selectedDetail = selectedOrchestration ? orchestrationDetails[selectedOrchestration] : null;

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel - Active Orchestrations */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">活跃编排</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-xs text-slate-500">{isConnected ? '已连接' : '未连接'}</span>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">{activeOrchestrations.length} 个活跃编排</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {activeOrchestrations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm">暂无活跃编排</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeOrchestrations.map((orch) => (
                <button
                  key={orch.id}
                  onClick={() => setSelectedOrchestration(orch.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedOrchestration === orch.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 truncate">{orch.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      orch.status === 'running' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {orch.status === 'running' ? '运行中' : orch.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {PHASE_ORDER.map((phase) => {
                      const isActive = orch.phases.includes(phase);
                      const isCurrent = orch.currentPhase === phase && orch.status === 'running';
                      return (
                        <div
                          key={phase}
                          className={`flex-1 h-1.5 rounded-full ${
                            isActive
                              ? isCurrent
                                ? 'bg-indigo-500'
                                : 'bg-emerald-400'
                              : 'bg-slate-200'
                          }`}
                          title={PHASE_LABELS[phase]}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatTimestamp(orch.startTime)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Event Counter */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>收到事件</span>
            <span className="font-mono bg-slate-200 px-2 py-0.5 rounded">{events.length}</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Timeline or Logs */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Tab Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setRightPanelTab('logs')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  rightPanelTab === 'logs'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                日志
              </button>
              <button
                onClick={() => setRightPanelTab('details')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  rightPanelTab === 'details'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                编排详情
              </button>
            </div>
            {rightPanelTab === 'logs' && (
              <span className="text-xs text-slate-500">{logs.length} 条</span>
            )}
            {rightPanelTab === 'details' && selectedDetail && (
              <p className={`text-sm font-medium ${
                selectedDetail.status === 'completed' ? 'text-emerald-600' :
                selectedDetail.status === 'failed' ? 'text-rose-600' : 'text-indigo-600'
              }`}>
                {selectedDetail.status === 'completed' ? '已完成' :
                 selectedDetail.status === 'failed' ? '失败' : '运行中'}
              </p>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {rightPanelTab === 'logs' ? (
            <div className="h-full overflow-y-auto p-2 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">暂无日志</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded border text-xs ${
                        log.status === 'completed'
                          ? 'bg-emerald-50 border-emerald-200'
                          : log.status === 'failed'
                          ? 'bg-rose-50 border-rose-200'
                          : log.status === 'running'
                          ? 'bg-indigo-50 border-indigo-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-400">{formatTimestamp(log.timestamp)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          log.status === 'completed'
                            ? 'bg-emerald-200 text-emerald-700'
                            : log.status === 'failed'
                            ? 'bg-rose-200 text-rose-700'
                            : log.status === 'running'
                            ? 'bg-indigo-200 text-indigo-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {log.module} &gt; {log.step}
                        </span>
                      </div>
                      <p className="text-slate-700 break-words">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            selectedDetail ? (
              <div className="h-full overflow-y-auto p-4">
                {/* Detail Header */}
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">编排详情</h2>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{selectedDetail.id}</p>
                  {selectedDetail.totalDuration && (
                    <p className="text-xs text-slate-500">耗时: {formatDuration(selectedDetail.totalDuration)}</p>
                  )}
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {PHASE_ORDER.map((phase, phaseIndex) => {
                    const phaseData = selectedDetail.phases[phase] || {
                      startTime: null,
                      endTime: null,
                      duration: null,
                      status: 'pending',
                      steps: {}
                    };
                    const isActive = phaseData.status !== 'pending';
                    const isCurrent = phaseData.status === 'running';

                    return (
                      <div key={phase} className="relative">
                        {/* Timeline Line */}
                        {phaseIndex < PHASE_ORDER.length - 1 && (
                          <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-slate-200" />
                        )}

                        {/* Phase Card */}
                        <div className={`relative flex gap-4 p-4 rounded-xl border transition-all ${
                          getStatusStyle(phaseData.status)
                        } ${isCurrent ? 'ring-2 ring-indigo-200' : ''}`}>
                          {/* Status Icon */}
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                            isActive ? 'bg-white border-2' : 'bg-slate-100 border-2 border-slate-200'
                          } ${isCurrent ? 'border-indigo-500' : isActive ? 'border-emerald-500' : 'border-slate-300'}`}>
                            {getStatusIcon(phaseData.status)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium text-slate-800">{PHASE_LABELS[phase]}</h3>
                              {phaseData.duration && (
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  {formatDuration(phaseData.duration)}
                                </span>
                              )}
                            </div>

                            {/* Timestamps */}
                            <div className="flex gap-4 mt-1 text-xs text-slate-500">
                              {phaseData.startTime && (
                                <span>开始: {formatTimestamp(phaseData.startTime)}</span>
                              )}
                              {phaseData.endTime && (
                                <span>结束: {formatTimestamp(phaseData.endTime)}</span>
                              )}
                            </div>

                            {/* Steps */}
                            {Object.entries(phaseData.steps).length > 0 && (
                              <div className="mt-3 space-y-1">
                                {Object.entries(phaseData.steps).map(([stepName, stepInfo]) => (
                                  <div key={stepName} className="flex items-center gap-2 text-xs">
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      stepInfo.status === 'completed' ? 'bg-emerald-500' :
                                      stepInfo.status === 'failed' ? 'bg-rose-500' :
                                      stepInfo.status === 'running' ? 'bg-indigo-500 animate-pulse' :
                                      'bg-slate-300'
                                    }`} />
                                    <span className="text-slate-600">{stepName}</span>
                                    {stepInfo.duration && (
                                      <span className="text-slate-400">({formatDuration(stepInfo.duration)})</span>
                                    )}
                                    {stepInfo.data && Object.keys(stepInfo.data).length > 0 && (
                                      <span className="text-slate-400 ml-auto">
                                        {JSON.stringify(stepInfo.data).slice(0, 50)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">选择一个编排查看详情</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default FlowMonitor;
