import React, { useState } from 'react';

interface DecomposerConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const DecomposerConfig: React.FC<DecomposerConfigProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('llm');

  const handleLLMChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      llm: {
        ...config.llm,
        [field]: value
      }
    });
  };

  const handleTaskTypeChange = (builtin: string, field: string, value: any) => {
    onUpdate({
      ...config,
      task_types: {
        ...config.task_types,
        built_in: {
          ...config.task_types.built_in,
          [builtin]: {
            ...config.task_types.built_in[builtin],
            [field]: value
          }
        }
      }
    });
  };

  const handleSemanticAnalysisChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      semantic_analysis: {
        ...config.semantic_analysis,
        [field]: value
      }
    });
  };

  const handleDebugChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      debug: {
        ...config.debug,
        [field]: value
      }
    });
  };

  const handleConflictResolutionChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      conflict_resolution: {
        ...config.conflict_resolution,
        [field]: value
      }
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">分解器配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置任务分解、类型识别、语义分析等功能。</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-xl">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'llm' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('llm')}
        >
          LLM 配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'task' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('task')}
        >
          任务类型
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'semantic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('semantic')}
        >
          语义分析
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'debug' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('debug')}
        >
          调试配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'conflict' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('conflict')}
        >
          冲突解决
        </button>
      </div>

      {/* LLM Configuration */}
      {activeTab === 'llm' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">LLM 服务配置</h3>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">服务地址</label>
                <input
                  type="text"
                  value={config.llm?.base_url || ''}
                  onChange={(e) => handleLLMChange('base_url', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">模型名称</label>
                <input
                  type="text"
                  value={config.llm?.model || ''}
                  onChange={(e) => handleLLMChange('model', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">超时时间 (毫秒)</label>
                <input
                  type="number"
                  value={config.llm?.timeout || 60000}
                  onChange={(e) => handleLLMChange('timeout', parseInt(e.target.value) || 60000)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">重试次数</label>
                <input
                  type="number"
                  value={config.llm?.retry_attempts || 2}
                  onChange={(e) => handleLLMChange('retry_attempts', parseInt(e.target.value) || 2)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">高级配置</h3>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">温度参数 (0-1)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={config.llm?.temperature || 0.1}
                  onChange={(e) => handleLLMChange('temperature', parseFloat(e.target.value) || 0.1)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">最大并发数</label>
                <input
                  type="number"
                  value={config.llm?.max_concurrency || 3}
                  onChange={(e) => handleLLMChange('max_concurrency', parseInt(e.target.value) || 3)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">最大批量大小</label>
                <input
                  type="number"
                  value={config.llm?.max_batch_size || 10}
                  onChange={(e) => handleLLMChange('max_batch_size', parseInt(e.target.value) || 10)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="flex items-center pt-4">
                <input
                  type="checkbox"
                  id="llm-enabled"
                  checked={config.llm?.enabled || false}
                  onChange={(e) => handleLLMChange('enabled', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="llm-enabled" className="ml-2 text-sm font-semibold text-slate-700">
                  启用 LLM 服务
                </label>
                <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Type Configuration */}
      {activeTab === 'task' && (
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">内置任务类型配置</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.keys(config.task_types?.built_in || {}).map((typeKey) => {
              const typeConfig = config.task_types.built_in[typeKey];
              return (
                <div key={typeKey} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-800 mb-3 capitalize">{typeConfig.display_name || typeKey}</h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">显示名称</label>
                      <input
                        type="text"
                        value={typeConfig.display_name || ''}
                        onChange={(e) => handleTaskTypeChange(typeKey, 'display_name', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">描述</label>
                      <textarea
                        value={typeConfig.description || ''}
                        onChange={(e) => handleTaskTypeChange(typeKey, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 resize-none"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">类别</label>
                      <input
                        type="text"
                        value={typeConfig.category || ''}
                        onChange={(e) => handleTaskTypeChange(typeKey, 'category', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">优先级</label>
                      <input
                        type="number"
                        value={typeConfig.priority || 0}
                        onChange={(e) => handleTaskTypeChange(typeKey, 'priority', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Semantic Analysis Configuration */}
      {activeTab === 'semantic' && (
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">语义分析配置</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">合并阈值 (0-1)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={config.semantic_analysis?.merge_threshold || 0.7}
                  onChange={(e) => handleSemanticAnalysisChange('merge_threshold', parseFloat(e.target.value) || 0.7)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">依赖阈值 (0-1)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={config.semantic_analysis?.dependency_threshold || 0.3}
                  onChange={(e) => handleSemanticAnalysisChange('dependency_threshold', parseFloat(e.target.value) || 0.3)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">权重配置</label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">内容权重</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={config.semantic_analysis?.weights?.content || 0.5}
                        onChange={(e) => handleSemanticAnalysisChange('weights', {
                          ...(config.semantic_analysis?.weights || {}),
                          content: parseFloat(e.target.value) || 0.5
                        })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">类型权重</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={config.semantic_analysis?.weights?.type || 0.3}
                        onChange={(e) => handleSemanticAnalysisChange('weights', {
                          ...(config.semantic_analysis?.weights || {}),
                          type: parseFloat(e.target.value) || 0.3
                        })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">上下文权重</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={config.semantic_analysis?.weights?.context || 0.2}
                      onChange={(e) => handleSemanticAnalysisChange('weights', {
                        ...(config.semantic_analysis?.weights || {}),
                        context: parseFloat(e.target.value) || 0.2
                      })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">算法选择</label>
                <select
                  value={config.semantic_analysis?.algorithm || 'tfidf_cosine'}
                  onChange={(e) => handleSemanticAnalysisChange('algorithm', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="tfidf_cosine">TF-IDF 余弦相似度</option>
                  <option value="word2vec">Word2Vec</option>
                  <option value="sentence_transformer">Sentence Transformer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">停用词列表</label>
                <textarea
                  value={Array.isArray(config.semantic_analysis?.stop_words) ? config.semantic_analysis.stop_words.join(', ') : ''}
                  onChange={(e) => handleSemanticAnalysisChange('stop_words', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                  rows={4}
                  placeholder="输入停用词，用逗号分隔"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Configuration */}
      {activeTab === 'debug' && (
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">调试配置</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="debug-enabled"
                  checked={config.debug?.enabled || false}
                  onChange={(e) => handleDebugChange('enabled', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="debug-enabled" className="ml-2 text-sm font-semibold text-slate-700">
                  启用调试模式
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">日志级别</label>
                <select
                  value={config.debug?.log_level || 'info'}
                  onChange={(e) => handleDebugChange('log_level', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="debug">DEBUG</option>
                  <option value="info">INFO</option>
                  <option value="warn">WARN</option>
                  <option value="error">ERROR</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">最大历史记录数</label>
                <input
                  type="number"
                  value={config.debug?.max_history || 100}
                  onChange={(e) => handleDebugChange('max_history', parseInt(e.target.value) || 100)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.debug?.performance_tracking || false}
                  onChange={(e) => handleDebugChange('performance_tracking', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label className="ml-2 text-sm font-semibold text-slate-700">
                  性能追踪
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.debug?.memory_tracking || false}
                  onChange={(e) => handleDebugChange('memory_tracking', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label className="ml-2 text-sm font-semibold text-slate-700">
                  内存追踪
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolution Configuration */}
      {activeTab === 'conflict' && (
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">冲突解决配置</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">默认策略</label>
                <select
                  value={config.conflict_resolution?.default_strategy || 'rename'}
                  onChange={(e) => handleConflictResolutionChange('default_strategy', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="rename">重命名</option>
                  <option value="merge">合并</option>
                  <option value="partition">分割</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">策略优先级</label>
                <textarea
                  value={Array.isArray(config.conflict_resolution?.strategy_priority) ? config.conflict_resolution.strategy_priority.join(', ') : ''}
                  onChange={(e) => handleConflictResolutionChange('strategy_priority', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                  rows={3}
                  placeholder="输入策略名称，用逗号分隔，按优先级排序"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">文件类型策略</label>
              <textarea
                value={Object.entries(config.conflict_resolution?.file_type_strategies || {})
                  .map(([ext, strategy]) => `${ext}:${strategy}`)
                  .join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n');
                  const strategies: Record<string, string> = {};
                  lines.forEach(line => {
                    if (line.includes(':')) {
                      const [ext, strategy] = line.split(':');
                      strategies[ext.trim()] = strategy.trim();
                    }
                  });
                  handleConflictResolutionChange('file_type_strategies', strategies);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                rows={6}
                placeholder="每行一个策略，格式：*.jsx:merge"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DecomposerConfig;