import React, { useState } from 'react';
import ConfigSection from '../shared/ConfigSection';

interface LearningEngineConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const LearningEngineConfig: React.FC<LearningEngineConfigProps> = ({ config, onUpdate }) => {
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
    const snakeSection = toSnakeCase(section);
    onUpdate({
      ...config,
      [snakeSection]: {
        ...(config[snakeSection] || {}),
        [snakeField]: value
      }
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">学习引擎配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置模型性能学习、效果评估和自适应优化参数。</p>
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
            activeTab === 'persistence' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('persistence')}
        >
          持久化配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'performance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('performance')}
        >
          性能配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'features' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('features')}
        >
          特征权重
        </button>
      </div>

      {/* Basic Configuration */}
      {activeTab === 'basic' && (
        <div className="space-y-6">
          <ConfigSection title="基础学习引擎配置" color="indigo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.enabled !== false}
                    onChange={(e) => updateSimpleNestedConfig('learning_engine', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用学习引擎
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">性能窗口大小</label>
                  <input
                    type="number"
                    value={mergedConfig.performance_window || 100}
                    onChange={(e) => updateSimpleNestedConfig('learning_engine', 'performance_window', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">清理间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.cleanup_interval || 3600000}
                    onChange={(e) => updateSimpleNestedConfig('learning_engine', 'cleanup_interval', parseInt(e.target.value) || 3600000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Persistence Configuration */}
      {activeTab === 'persistence' && (
        <div className="space-y-6">
          <ConfigSection title="持久化配置" color="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.persistence?.enabled !== false}
                    onChange={(e) => updateNestedConfig('learning_engine', 'persistence', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用持久化
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">持久化路径</label>
                  <input
                    type="text"
                    value={mergedConfig.persistence?.path || './data/learning-data.json'}
                    onChange={(e) => updateNestedConfig('learning_engine', 'persistence', 'path', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">自动保存间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.persistence?.auto_save_interval || 300000}
                    onChange={(e) => updateNestedConfig('learning_engine', 'persistence', 'auto_save_interval', parseInt(e.target.value) || 300000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Performance Configuration */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          <ConfigSection title="性能监控配置" color="purple">
            <div className="space-y-4">
              <p className="text-sm text-slate-500">性能监控配置参数</p>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Feature Weights Configuration */}
      {activeTab === 'features' && (
        <div className="space-y-6">
          <ConfigSection title="特征权重配置" color="cyan">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">特征权重配置</label>
                <textarea
                  value={JSON.stringify(mergedConfig.feature_weights || {
                    "model_performance": 0.3,
                    "cost_efficiency": 0.2,
                    "response_time": 0.3,
                    "task_complexity": 0.2
                  }, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateSimpleNestedConfig('learning_engine', 'feature_weights', parsed);
                    } catch (err) {
                      // Handle invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none font-mono"
                  rows={8}
                  placeholder="特征权重配置，JSON格式。例如：{&quot;model_performance&quot;: 0.3, &quot;cost_efficiency&quot;: 0.2}"
                />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="学习算法配置" color="yellow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">学习率</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    max="1"
                    value={mergedConfig.learning_rate || 0.1}
                    onChange={(e) => updateSimpleNestedConfig('learning_engine', 'learning_rate', parseFloat(e.target.value) || 0.1)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}
    </div>
  );
};

export default LearningEngineConfig;