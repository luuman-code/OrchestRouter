import React, { useState } from 'react';
import ConfigSection from '../shared/ConfigSection';

interface RateLimiterConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const RateLimiterConfig: React.FC<RateLimiterConfigProps> = ({ config, onUpdate }) => {
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

  // Since config IS the rate_limiter section, write directly without nesting
  const updateNestedConfig = (section: string, subsection: string, field: string, value: any) => {
    const snakeSubsection = toSnakeCase(subsection);
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeSubsection]: {
        ...(config[snakeSubsection] || config[subsection] || {}),
        [snakeField]: value
      }
    });
  };

  const updateSimpleNestedConfig = (section: string, field: string, value: any) => {
    // Skip the section parameter since config IS the section
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">速率限制配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置API调用频率限制、突发处理和分布式协调参数。</p>
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
            activeTab === 'advanced' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('advanced')}
        >
          高级配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'permodel' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('permodel')}
        >
          按模型配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'requesttype' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('requesttype')}
        >
          按请求类型配置
        </button>
      </div>

      {/* Basic Configuration */}
      {activeTab === 'basic' && (
        <div className="space-y-6">
          <ConfigSection title="基础速率限制配置" color="indigo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">
                    默认RPS (每秒请求数)
                    <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                  </label>
                  <input
                    type="number"
                    value={mergedConfig.default_rps || mergedConfig.defaultRps || 10}
                    onChange={(e) => updateSimpleNestedConfig('rate_limiter', 'default_rps', parseInt(e.target.value) || 10)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">突发容量 (Burst)</label>
                  <input
                    type="number"
                    value={mergedConfig.burst_capacity || mergedConfig.burstCapacity || 30}
                    onChange={(e) => updateSimpleNestedConfig('rate_limiter', 'burst_capacity', parseInt(e.target.value) || 30)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.enable_coordination !== false}
                    onChange={(e) => updateSimpleNestedConfig('rate_limiter', 'enable_coordination', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用分布式协调
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">健康检查因子</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={mergedConfig.health_check_factor || 0.1}
                    onChange={(e) => updateSimpleNestedConfig('rate_limiter', 'health_check_factor', parseFloat(e.target.value) || 0.1)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Advanced Configuration */}
      {activeTab === 'advanced' && (
        <div className="space-y-6">
          <ConfigSection title="高级速率限制配置" color="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">按模型限流配置</label>
                  <textarea
                    value={JSON.stringify(mergedConfig.per_model_limits || mergedConfig.perModel || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateSimpleNestedConfig('rate_limiter', 'per_model_limits', parsed);
                      } catch (err) {
                        // Handle invalid JSON
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                    rows={8}
                    placeholder="按模型配置速率限制参数，JSON格式"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-500">高级配置参数</p>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Per Model Configuration */}
      {activeTab === 'permodel' && (
        <div className="space-y-6">
          <ConfigSection title="按模型速率限制配置" color="purple">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">模型特定速率限制</label>
                <textarea
                  value={JSON.stringify(mergedConfig.per_model_limits || mergedConfig.perModel || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('rate_limiter', 'per_model_limits', parsed);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={12}
                  placeholder="按模型配置速率限制参数，JSON格式。例如：{&quot;gpt-4&quot;: {&quot;rps&quot;: 10, &quot;burst&quot;: 20}, &quot;claude&quot;: {&quot;rps&quot;: 5, &quot;burst&quot;: 10}}"
                />
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Request Type Configuration */}
      {activeTab === 'requesttype' && (
        <div className="space-y-6">
          <ConfigSection title="按请求类型速率限制配置" color="cyan">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">请求类型特定速率限制</label>
                <textarea
                  value={JSON.stringify(mergedConfig.request_type_limits || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('rate_limiter', 'request_type_limits', parsed);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={12}
                  placeholder="按请求类型配置速率限制参数，JSON格式。例如：{&quot;chat&quot;: {&quot;rps&quot;: 10, &quot;burst&quot;: 20}, &quot;embedding&quot;: {&quot;rps&quot;: 50, &quot;burst&quot;: 100}}"
                />
              </div>
            </div>
          </ConfigSection>
        </div>
      )}
    </div>
  );
};

export default RateLimiterConfig;