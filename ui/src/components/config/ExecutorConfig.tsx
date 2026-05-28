import React, { useState } from 'react';

interface ExecutorConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const ExecutorConfig: React.FC<ExecutorConfigProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('general');

  // Convert camelCase to snake_case
  const toSnakeCase = (str: string): string => {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  };

  // Deep merge helper that adds camelCase aliases for snake_case keys
  const addAliases = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    const result: any = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      result[key] = addAliases(obj[key]);
      if (key.includes('_')) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (camelKey !== key) {
          result[camelKey] = result[key];
        }
      }
    }
    return result;
  };

  const mergedConfig = addAliases(config);

  // Update nested configuration values
  const updateNestedConfig = (section: string, subsection: string, field: string, value: any) => {
    const snakeSection = toSnakeCase(section);
    const snakeSubsection = toSnakeCase(subsection);
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeSection]: {
        ...(config[snakeSection] || config[section] || {}),
        [snakeSubsection]: {
          ...(config[snakeSection]?.[snakeSubsection] || config[snakeSection]?.[subsection] || config[section]?.[snakeSubsection] || config[section]?.[subsection] || {}),
          [snakeField]: value
        }
      }
    });
  };

  const updateGeneralConfig = (field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  const updateSimpleNestedConfig = (section: string, field: string, value: any) => {
    const snakeSection = toSnakeCase(section);
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeSection]: {
        ...(config[snakeSection] || config[section] || {}),
        [snakeField]: value
      }
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">执行器策略</h2>
        <p className="text-sm text-slate-500 mt-2">配置任务并发、速率限制以及网络重试机制。</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-xl">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'general' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('general')}
        >
          基础配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'retry' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('retry')}
        >
          重试策略
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'ratelimit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('ratelimit')}
        >
          限流配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'monitoring' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('monitoring')}
        >
          监控告警
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'fallback' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('fallback')}
        >
          降级策略
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'health' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('health')}
        >
          健康检查
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'coordinator' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('coordinator')}
        >
          系统协调
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'modelspecific' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('modelspecific')}
        >
          模型特定
        </button>
      </div>

      {/* General Configuration */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
          <div className="space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">基础执行器设置</h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">默认最大并发任务数</label>
                <input
                  type="number"
                  value={mergedConfig.defaultMaxConcurrency || mergedConfig.general?.default_max_concurrency || 10}
                  onChange={(e) => updateGeneralConfig('defaultMaxConcurrency', parseInt(e.target.value) || 10)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">任务超时时间 (ms)</label>
                <input
                  type="number"
                  value={mergedConfig.defaultTimeout || mergedConfig.general?.default_timeout || 60000}
                  onChange={(e) => updateGeneralConfig('defaultTimeout', parseInt(e.target.value) || 60000)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">日志级别</label>
                <select
                  value={mergedConfig.general?.log_level || 'info'}
                  onChange={(e) => updateNestedConfig('general', 'log_level', 'log_level', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="debug">DEBUG</option>
                  <option value="info">INFO</option>
                  <option value="warn">WARN</option>
                  <option value="error">ERROR</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">功能开关</h3>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enable-tracing"
                  checked={mergedConfig.enableTracing !== false && mergedConfig.general?.enable_tracing !== false}
                  onChange={(e) => updateGeneralConfig('enableTracing', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="enable-tracing" className="ml-2 text-sm font-semibold text-slate-700">
                  启用链路追踪 (Tracing)
                </label>
                <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enable-monitoring"
                  checked={mergedConfig.enableMonitoring !== false && mergedConfig.general?.enable_monitoring !== false}
                  onChange={(e) => updateGeneralConfig('enableMonitoring', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="enable-monitoring" className="ml-2 text-sm font-semibold text-slate-700">
                  启用实时监控 (Monitoring)
                </label>
                <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enable-detailed-logging"
                  checked={mergedConfig.enableDetailedLogging !== false}
                  onChange={(e) => updateGeneralConfig('enableDetailedLogging', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="enable-detailed-logging" className="ml-2 text-sm font-semibold text-slate-700">
                  启用详细日志
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="debug-mode"
                  checked={mergedConfig.debugMode !== false}
                  onChange={(e) => updateGeneralConfig('debugMode', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="debug-mode" className="ml-2 text-sm font-semibold text-slate-700">
                  调试模式
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Retry Configuration */}
      {activeTab === 'retry' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">重试策略</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">最大重试次数</label>
                    <input
                      type="number"
                      value={mergedConfig.retry?.max_retries || 3}
                      onChange={(e) => updateNestedConfig('retry', 'max_retries', 'max_retries', parseInt(e.target.value) || 3)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">基础延迟 (ms)</label>
                    <input
                      type="number"
                      value={mergedConfig.retry?.base_delay || 1000}
                      onChange={(e) => updateNestedConfig('retry', 'base_delay', 'base_delay', parseInt(e.target.value) || 1000)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大延迟 (ms)</label>
                  <input
                    type="number"
                    value={mergedConfig.retry?.max_delay || 60000}
                    onChange={(e) => updateNestedConfig('retry', 'max_delay', 'max_delay', parseInt(e.target.value) || 60000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">指数退避乘数</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mergedConfig.retry?.exponential_base || 2.0}
                    onChange={(e) => updateNestedConfig('retry', 'exponential_base', 'exponential_base', parseFloat(e.target.value) || 2.0)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">重试行为</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="jitter"
                    checked={mergedConfig.retry?.jitter !== false}
                    onChange={(e) => updateNestedConfig('retry', 'jitter', 'jitter', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="jitter" className="ml-2 text-sm font-semibold text-slate-700">
                    启用随机抖动 (Jitter)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">可重试错误类型</label>
                  <textarea
                    value={Array.isArray(mergedConfig.retry?.retryable_errors) ? mergedConfig.retry.retryable_errors.join(', ') : ''}
                    onChange={(e) => {
                      const errors = e.target.value.split(',').map(error => error.trim()).filter(error => error);
                      updateNestedConfig('retry', 'retryable_errors', 'retryable_errors', errors);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                    rows={4}
                    placeholder="输入可重试的错误类型，用逗号分隔"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rate Limit Configuration */}
      {activeTab === 'ratelimit' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">基础限流配置</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">默认 RPS</label>
                    <input
                      type="number"
                      value={mergedConfig.rateLimit?.default_rps || mergedConfig.rateLimit?.defaultRps || 10}
                      onChange={(e) => updateSimpleNestedConfig('rateLimit', 'default_rps', parseInt(e.target.value) || 10)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">突发容量 (Burst)</label>
                    <input
                      type="number"
                      value={mergedConfig.rateLimit?.burst_capacity || mergedConfig.rateLimit?.burstCapacity || 30}
                      onChange={(e) => updateSimpleNestedConfig('rateLimit', 'burst_capacity', parseInt(e.target.value) || 30)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">健康检查因子</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mergedConfig.rateLimit?.health_check_factor || 0.1}
                    onChange={(e) => updateSimpleNestedConfig('rateLimit', 'health_check_factor', parseFloat(e.target.value) || 0.1)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">高级限流</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="coordination"
                    checked={mergedConfig.rateLimit?.enable_coordination !== false}
                    onChange={(e) => updateSimpleNestedConfig('rateLimit', 'enable_coordination', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="coordination" className="ml-2 text-sm font-semibold text-slate-700">
                    启用分布式协调
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">按模型限流</label>
                  <textarea
                    value={JSON.stringify(mergedConfig.rateLimit?.per_model || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const perModel = JSON.parse(e.target.value);
                        updateSimpleNestedConfig('rateLimit', 'per_model', perModel);
                      } catch (err) {
                        // Handle invalid JSON
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                    rows={6}
                    placeholder="按模型配置限流参数，JSON格式"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monitoring Configuration */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">监控配置</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="metrics-collection"
                    checked={mergedConfig.monitoring?.metrics_collection !== false}
                    onChange={(e) => updateNestedConfig('monitoring', 'metrics_collection', 'metrics_collection', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="metrics-collection" className="ml-2 text-sm font-semibold text-slate-700">
                    启用指标收集
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="performance-logging"
                    checked={mergedConfig.monitoring?.performance_logging !== false}
                    onChange={(e) => updateNestedConfig('monitoring', 'performance_logging', 'performance_logging', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="performance-logging" className="ml-2 text-sm font-semibold text-slate-700">
                    启用性能日志
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">告警阈值</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">错误率告警阈值</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={mergedConfig.monitoring?.alert_thresholds?.error_rate || 0.05}
                    onChange={(e) => updateNestedConfig('monitoring', 'alert_thresholds', 'error_rate', parseFloat(e.target.value) || 0.05)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                  <p className="text-xs text-slate-500">当错误率超过此值时触发告警</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">响应时间告警阈值 (ms)</label>
                  <input
                    type="number"
                    value={mergedConfig.monitoring?.alert_thresholds?.response_time || 5000}
                    onChange={(e) => updateNestedConfig('monitoring', 'alert_thresholds', 'response_time', parseInt(e.target.value) || 5000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                  <p className="text-xs text-slate-500">当平均响应时间超过此值时触发告警</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">资源使用率告警阈值</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={mergedConfig.monitoring?.alert_thresholds?.resource_usage || 0.8}
                    onChange={(e) => updateNestedConfig('monitoring', 'alert_thresholds', 'resource_usage', parseFloat(e.target.value) || 0.8)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                  <p className="text-xs text-slate-500">当系统资源使用率超过此值时触发告警</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fallback Strategy Configuration */}
      {activeTab === 'fallback' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">超时降级配置</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="timeout-fallback"
                    checked={mergedConfig.fallback_strategy?.timeout?.enabled !== false}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'timeout', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="timeout-fallback" className="ml-2 text-sm font-semibold text-slate-700">
                    启用超时降级
                  </label>
                  <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大降级尝试次数</label>
                  <input
                    type="number"
                    value={mergedConfig.fallback_strategy?.timeout?.max_attempts || 3}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'timeout', 'max_attempts', parseInt(e.target.value) || 3)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">每次尝试超时时间 (ms)</label>
                  <input
                    type="number"
                    value={mergedConfig.fallback_strategy?.timeout?.timeout_per_attempt || 30000}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'timeout', 'timeout_per_attempt', parseInt(e.target.value) || 30000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">退避乘数</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mergedConfig.fallback_strategy?.timeout?.backoff_multiplier || 1.5}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'timeout', 'backoff_multiplier', parseFloat(e.target.value) || 1.5)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">预算降级配置</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="budget-fallback"
                    checked={mergedConfig.fallback_strategy?.budget?.enabled !== false}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'budget', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="budget-fallback" className="ml-2 text-sm font-semibold text-slate-700">
                    启用预算降级
                  </label>
                  <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大成本降低比例</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.fallback_strategy?.budget?.max_cost_reduction || 0.5}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'budget', 'max_cost_reduction', parseFloat(e.target.value) || 0.5)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">替代搜索深度</label>
                  <input
                    type="number"
                    value={mergedConfig.fallback_strategy?.budget?.alternative_search_depth || 5}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'budget', 'alternative_search_depth', parseInt(e.target.value) || 5)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6 md:col-span-2">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-purple-500 pl-3">可用性降级配置</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="availability-fallback"
                      checked={mergedConfig.fallback_strategy?.availability?.enabled !== false}
                      onChange={(e) => updateNestedConfig('fallback_strategy', 'availability', 'enabled', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                    />
                    <label htmlFor="availability-fallback" className="ml-2 text-sm font-semibold text-slate-700">
                      启用可用性降级
                    </label>
                    <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={mergedConfig.fallback_strategy?.availability?.retry_on_unavailability !== false}
                      onChange={(e) => updateNestedConfig('fallback_strategy', 'availability', 'retry_on_unavailability', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                    />
                    <label className="ml-2 text-sm font-semibold text-slate-700">
                      不可用时重试
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大降级模型数</label>
                  <input
                    type="number"
                    value={mergedConfig.fallback_strategy?.availability?.max_fallback_models || 3}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'availability', 'max_fallback_models', parseInt(e.target.value) || 3)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">全局最大降级数</label>
                  <input
                    type="number"
                    value={mergedConfig.fallback_strategy?.global?.max_total_fallbacks || 5}
                    onChange={(e) => updateNestedConfig('fallback_strategy', 'global', 'max_total_fallbacks', parseInt(e.target.value) || 5)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={mergedConfig.fallback_strategy?.global?.enable_chained_fallbacks !== false}
                  onChange={(e) => updateNestedConfig('fallback_strategy', 'global', 'enable_chained_fallbacks', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label className="ml-2 text-sm font-semibold text-slate-700">
                  启用链式降级
                </label>
                <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Health Check Configuration */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">健康检查配置</h3>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="health-check-enabled"
                    checked={mergedConfig.health_check?.enabled !== false}
                    onChange={(e) => updateSimpleNestedConfig('health_check', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label htmlFor="health-check-enabled" className="ml-2 text-sm font-semibold text-slate-700">
                    启用健康检查
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">检查间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.health_check?.interval || 60000}
                    onChange={(e) => updateSimpleNestedConfig('health_check', 'interval', parseInt(e.target.value) || 60000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">超时时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.health_check?.timeout || 5000}
                    onChange={(e) => updateSimpleNestedConfig('health_check', 'timeout', parseInt(e.target.value) || 5000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">健康指标</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">CPU 阈值 (高)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.cpu_threshold_high || 0.7}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'cpu_threshold_high', 'cpu_threshold_high', parseFloat(e.target.value) || 0.7)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">CPU 阈值 (危险)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.cpu_threshold_critical || 0.9}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'cpu_threshold_critical', 'cpu_threshold_critical', parseFloat(e.target.value) || 0.9)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">内存阈值 (高)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.memory_threshold_high || 0.7}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'memory_threshold_high', 'memory_threshold_high', parseFloat(e.target.value) || 0.7)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">内存阈值 (危险)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.memory_threshold_critical || 0.9}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'memory_threshold_critical', 'memory_threshold_critical', parseFloat(e.target.value) || 0.9)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Coordinator Configuration */}
      {activeTab === 'coordinator' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">系统协调器配置</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">检查间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.system_coordinator?.check_interval || 10000}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'check_interval', 'check_interval', parseInt(e.target.value) || 10000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">CPU 阈值 (高)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.cpu_threshold_high || 0.7}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'cpu_threshold_high', 'cpu_threshold_high', parseFloat(e.target.value) || 0.7)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">CPU 阈值 (危险)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.cpu_threshold_critical || 0.9}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'cpu_threshold_critical', 'cpu_threshold_critical', parseFloat(e.target.value) || 0.9)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">内存协调配置</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">内存阈值 (高)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.memory_threshold_high || 0.7}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'memory_threshold_high', 'memory_threshold_high', parseFloat(e.target.value) || 0.7)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">内存阈值 (危险)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.system_coordinator?.memory_threshold_critical || 0.9}
                    onChange={(e) => updateNestedConfig('system_coordinator', 'memory_threshold_critical', 'memory_threshold_critical', parseFloat(e.target.value) || 0.9)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model-Specific Configuration */}
      {activeTab === 'modelspecific' && (
        <div className="space-y-6">
          <div className="space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">模型特定配置</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">按模型配置参数</label>
                <textarea
                  value={JSON.stringify(mergedConfig.model_specific || mergedConfig.modelSpecific || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const modelSpecific = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('model_specific', modelSpecific);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={12}
                  placeholder="按模型配置特定参数，JSON格式"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutorConfig;