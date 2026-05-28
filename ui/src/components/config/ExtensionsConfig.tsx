import React, { useState } from 'react';

interface ExtensionsConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const ExtensionsConfig: React.FC<ExtensionsConfigProps> = ({ config, onUpdate }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('iteration');

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

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleChange = (section: string, field: string, value: any) => {
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

  const handleNestedChange = (section: string, parent: string, field: string, value: any) => {
    const snakeSection = toSnakeCase(section);
    const snakeParent = toSnakeCase(parent);
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeSection]: {
        ...(config[snakeSection] || config[section] || {}),
        [snakeParent]: {
          ...(config[snakeSection]?.[snakeParent] || config[snakeSection]?.[parent] || config[section]?.[snakeParent] || config[section]?.[parent] || {}),
          [snakeField]: value
        }
      }
    });
  };

  const sections = [
    { id: 'iteration', name: '迭代控制', icon: '🔄' },
    { id: 'classification', name: '问题分类', icon: '🏷️' },
    { id: 'replanning', name: '重新规划', icon: '📋' },
    { id: 'quality', name: '质量门控', icon: '✅' },
    { id: 'feedback', name: '反馈分析', icon: '💬' }
  ];

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">编排器扩展配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置编排器各扩展模块的参数，包括迭代控制、质量门控等。</p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.id} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection(section.id)}
              className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                expandedSection === section.id
                  ? 'bg-indigo-50 border-b border-indigo-100'
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold text-slate-800">{section.icon} {section.name}</span>
              <span className={`transform transition-transform ${expandedSection === section.id ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {expandedSection === section.id && (
              <div className="p-6 bg-white border-t border-slate-100">
                {/* Iteration Controls */}
                {section.id === 'iteration' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">最大迭代次数</label>
                      <input
                        type="number"
                        value={mergedConfig.iteration?.maxIterations || 8}
                        onChange={(e) => handleChange('iteration', 'maxIterations', parseInt(e.target.value) || 8)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">最小质量分数</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mergedConfig.iteration?.minQualityScore || 0.75}
                        onChange={(e) => handleChange('iteration', 'minQualityScore', parseFloat(e.target.value) || 0.75)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">最大时间 (毫秒)</label>
                      <input
                        type="number"
                        value={mergedConfig.iteration?.maxTimeMs || 1200000}
                        onChange={(e) => handleChange('iteration', 'maxTimeMs', parseInt(e.target.value) || 1200000)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">
                        启用混合迭代
                        <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
                      </label>
                      <select
                        value={mergedConfig.iteration?.enableHybridIteration !== undefined ? mergedConfig.iteration.enableHybridIteration : true}
                        onChange={(e) => handleChange('iteration', 'enableHybridIteration', e.target.value === 'true')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      >
                        <option value="true">启用</option>
                        <option value="false">禁用</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">L1 最大重试</label>
                      <input
                        type="number"
                        value={mergedConfig.iteration?.l1MaxRetries || 2}
                        onChange={(e) => handleChange('iteration', 'l1MaxRetries', parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">L2 最大迭代</label>
                      <input
                        type="number"
                        value={mergedConfig.iteration?.l2MaxIterations || 3}
                        onChange={(e) => handleChange('iteration', 'l2MaxIterations', parseInt(e.target.value) || 3)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">L3 最大迭代</label>
                      <input
                        type="number"
                        value={mergedConfig.iteration?.l3MaxIterations || 2}
                        onChange={(e) => handleChange('iteration', 'l3MaxIterations', parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">层级切换阈值</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mergedConfig.iteration?.levelSwitchThreshold || 0.5}
                        onChange={(e) => handleChange('iteration', 'levelSwitchThreshold', parseFloat(e.target.value) || 0.5)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">启用提前终止</label>
                      <select
                        value={mergedConfig.iteration?.earlyTerminationEnabled !== undefined ? mergedConfig.iteration.earlyTerminationEnabled : true}
                        onChange={(e) => handleChange('iteration', 'earlyTerminationEnabled', e.target.value === 'true')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      >
                        <option value="true">启用</option>
                        <option value="false">禁用</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Classification */}
                {section.id === 'classification' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">简单错误阈值</label>
                      <input
                        type="number"
                        value={mergedConfig.classification?.simpleErrorThreshold || 3}
                        onChange={(e) => handleChange('classification', 'simpleErrorThreshold', parseInt(e.target.value) || 3)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">模块问题阈值</label>
                      <input
                        type="number"
                        value={mergedConfig.classification?.moduleIssueThreshold || 10}
                        onChange={(e) => handleChange('classification', 'moduleIssueThreshold', parseInt(e.target.value) || 10)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">严重程度阈值</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mergedConfig.classification?.severityThreshold || 0.7}
                        onChange={(e) => handleChange('classification', 'severityThreshold', parseFloat(e.target.value) || 0.7)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Replanning */}
                {section.id === 'replanning' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">启用智能优化</label>
                      <select
                        value={mergedConfig.replanning?.enableSmartRefinement !== undefined ? mergedConfig.replanning.enableSmartRefinement : true}
                        onChange={(e) => handleChange('replanning', 'enableSmartRefinement', e.target.value === 'true')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      >
                        <option value="true">启用</option>
                        <option value="false">禁用</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">最大优化轮次</label>
                      <input
                        type="number"
                        value={mergedConfig.replanning?.maxRefinementRounds || 5}
                        onChange={(e) => handleChange('replanning', 'maxRefinementRounds', parseInt(e.target.value) || 5)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">优先级调整因子</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mergedConfig.replanning?.priorityAdjustmentFactor || 0.2}
                        onChange={(e) => handleChange('replanning', 'priorityAdjustmentFactor', parseFloat(e.target.value) || 0.2)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Quality */}
                {section.id === 'quality' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">质量阈值</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">质量分数</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.thresholds?.qualityScore || 0.7}
                            onChange={(e) => handleNestedChange('quality', 'thresholds', 'qualityScore', parseFloat(e.target.value) || 0.7)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">测试通过率</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.thresholds?.testPassRate || 0.8}
                            onChange={(e) => handleNestedChange('quality', 'thresholds', 'testPassRate', parseFloat(e.target.value) || 0.8)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">代码覆盖率</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.thresholds?.codeCoverage || 0.7}
                            onChange={(e) => handleNestedChange('quality', 'thresholds', 'codeCoverage', parseFloat(e.target.value) || 0.7)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">安全分数</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.thresholds?.securityScore || 0.8}
                            onChange={(e) => handleNestedChange('quality', 'thresholds', 'securityScore', parseFloat(e.target.value) || 0.8)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">性能分数</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.thresholds?.performanceScore || 0.7}
                            onChange={(e) => handleNestedChange('quality', 'thresholds', 'performanceScore', parseFloat(e.target.value) || 0.7)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">质量权重</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">功能性</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.functionality || 0.3}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'functionality', parseFloat(e.target.value) || 0.3)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">可靠性</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.reliability || 0.2}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'reliability', parseFloat(e.target.value) || 0.2)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">可用性</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.usability || 0.15}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'usability', parseFloat(e.target.value) || 0.15)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">效率</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.efficiency || 0.2}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'efficiency', parseFloat(e.target.value) || 0.2)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">可维护性</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.maintainability || 0.1}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'maintainability', parseFloat(e.target.value) || 0.1)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs text-slate-600">可移植性</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={mergedConfig.quality?.weights?.portability || 0.05}
                            onChange={(e) => handleNestedChange('quality', 'weights', 'portability', parseFloat(e.target.value) || 0.05)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback */}
                {section.id === 'feedback' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">最小反馈质量</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mergedConfig.feedback?.minFeedbackQuality || 0.5}
                        onChange={(e) => handleChange('feedback', 'minFeedbackQuality', parseFloat(e.target.value) || 0.5)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">启用根因分析</label>
                      <select
                        value={mergedConfig.feedback?.enableRootCauseAnalysis !== undefined ? mergedConfig.feedback.enableRootCauseAnalysis : true}
                        onChange={(e) => handleChange('feedback', 'enableRootCauseAnalysis', e.target.value === 'true')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      >
                        <option value="true">启用</option>
                        <option value="false">禁用</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700">启用模式识别</label>
                      <select
                        value={mergedConfig.feedback?.enablePatternRecognition !== undefined ? mergedConfig.feedback.enablePatternRecognition : true}
                        onChange={(e) => handleChange('feedback', 'enablePatternRecognition', e.target.value === 'true')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      >
                        <option value="true">启用</option>
                        <option value="false">禁用</option>
                      </select>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtensionsConfig;
