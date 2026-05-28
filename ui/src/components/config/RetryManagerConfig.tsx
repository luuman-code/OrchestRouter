import React, { useState } from 'react';
import ConfigSection from '../shared/ConfigSection';

interface RetryManagerConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const RetryManagerConfig: React.FC<RetryManagerConfigProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('basic');

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

  // Update functions that convert to snake_case
  const updateNestedConfig = (section: string, subsection: string, field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    const snakeSubsection = toSnakeCase(subsection);
    onUpdate({
      ...config,
      [snakeSubsection]: {
        ...(config[snakeSubsection] || config[subsection] || {}),
        [snakeField]: value
      }
    });
  };

  const updateSimpleNestedConfig = (section: string, field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">重试管理器配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置API调用重试策略、错误处理和任务类型特定参数。</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-xl">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'basic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('basic')}
        >
          基础配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'errors' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('errors')}
        >
          错误处理配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'tasktypes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('tasktypes')}
        >
          任务类型配置
        </button>
      </div>

      {/* Basic Configuration */}
      {activeTab === 'basic' && (
        <div className="space-y-6">
          <ConfigSection title="基础重试配置" color="indigo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大重试次数</label>
                  <input
                    type="number"
                    value={mergedConfig.max_retries || 3}
                    onChange={(e) => updateSimpleNestedConfig('retry_manager', 'max_retries', parseInt(e.target.value) || 3)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">基础延迟 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.base_delay || 1000}
                    onChange={(e) => updateSimpleNestedConfig('retry_manager', 'base_delay', parseInt(e.target.value) || 1000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">指数退避乘数</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.1"
                    value={mergedConfig.exponential_base || 2.0}
                    onChange={(e) => updateSimpleNestedConfig('retry_manager', 'exponential_base', parseFloat(e.target.value) || 2.0)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.jitter !== false}
                    onChange={(e) => updateSimpleNestedConfig('retry_manager', 'jitter', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用随机抖动 (Jitter)
                  </label>
                </div>
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="可重试错误类型" color="emerald">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">可重试的错误类型</label>
                <textarea
                  value={Array.isArray(mergedConfig.retryable_errors) ? mergedConfig.retryable_errors.join(', ') : 'TimeoutError, NetworkError, RateLimitError, ServerError, ConnectionError'}
                  onChange={(e) => {
                    const errors = e.target.value.split(',').map(error => error.trim()).filter(error => error);
                    updateSimpleNestedConfig('retry_manager', 'retryable_errors', errors);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                  rows={3}
                  placeholder="输入可重试的错误类型，用逗号分隔"
                />
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Error-Based Delays Configuration */}
      {activeTab === 'errors' && (
        <div className="space-y-6">
          <ConfigSection title="错误类型特定延迟配置" color="purple">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">按错误类型的延迟配置</label>
                <textarea
                  value={JSON.stringify(mergedConfig.error_based_delays || {
                    "TimeoutError": {
                      "base_delay": 2000,
                      "max_delay": 10000
                    },
                    "RateLimitError": {
                      "base_delay": 5000,
                      "max_delay": 30000
                    },
                    "ServerError": {
                      "base_delay": 1000,
                      "max_delay": 5000
                    }
                  }, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('retry_manager', 'error_based_delays', parsed);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={10}
                  placeholder="按错误类型配置延迟参数，JSON格式。例如：{&quot;TimeoutError&quot;: {&quot;base_delay&quot;: 2000, &quot;max_delay&quot;: 10000}}"
                />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="最大延迟配置" color="cyan">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大延迟时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.max_delay || 60000}
                    onChange={(e) => updateSimpleNestedConfig('retry_manager', 'max_delay', parseInt(e.target.value) || 60000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Task Type Configurations */}
      {activeTab === 'tasktypes' && (
        <div className="space-y-6">
          <ConfigSection title="任务类型特定配置" color="yellow">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">按任务类型的重试配置</label>
                <textarea
                  value={JSON.stringify(mergedConfig.task_type_configs || {
                    "high_priority": {
                      "max_retries": 1,
                      "base_delay": 500
                    },
                    "low_priority": {
                      "max_retries": 5,
                      "base_delay": 2000
                    }
                  }, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('retry_manager', 'task_type_configs', parsed);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={10}
                  placeholder="按任务类型配置重试参数，JSON格式。例如：{&quot;high_priority&quot;: {&quot;max_retries&quot;: 1, &quot;base_delay&quot;: 500}}"
                />
              </div>
            </div>
          </ConfigSection>

        </div>
      )}
    </div>
  );
};

export default RetryManagerConfig;