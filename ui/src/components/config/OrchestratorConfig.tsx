import React, { useState } from 'react';

interface OrchestratorConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const OrchestratorConfig: React.FC<OrchestratorConfigProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('service');

  const handleServiceChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      [field]: value
    });
  };

  const handleSessionChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      session: {
        ...config.session,
        [field]: value
      }
    });
  };

  const handleSessionConfigChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      session: {
        ...config.session,
        sessionConfig: {
          ...config.session.sessionConfig,
          [field]: value
        }
      }
    });
  };

  const handleToolCallChange = (field: string, value: any) => {
    onUpdate({
      ...config,
      toolCallFormat: {
        ...config.toolCallFormat,
        [field]: value
      }
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">编排器配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置编排器核心服务、会话管理、工具调用等功能。</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-xl">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'service' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('service')}
        >
          服务配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'session' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('session')}
        >
          会话管理
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'toolcall' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('toolcall')}
        >
          工具调用
        </button>
      </div>

      {/* Service Configuration */}
      {activeTab === 'service' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">服务基本配置</h3>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">服务端口</label>
                <input
                  type="number"
                  value={config.port || 3458}
                  onChange={(e) => handleServiceChange('port', parseInt(e.target.value) || 3458)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">CCR 路由地址</label>
                <input
                  type="text"
                  value={config.ccrRouterUrl || 'http://127.0.0.1:3456'}
                  onChange={(e) => handleServiceChange('ccrRouterUrl', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  编排阈值
                  <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={config.orchestrationThreshold || 0.7}
                  onChange={(e) => handleServiceChange('orchestrationThreshold', parseFloat(e.target.value) || 0.7)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">高级配置</h3>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">最大并发数</label>
                <input
                  type="number"
                  value={config.maxConcurrency || 5}
                  onChange={(e) => handleServiceChange('maxConcurrency', parseInt(e.target.value) || 5)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">超时时间 (毫秒)</label>
                <input
                  type="number"
                  value={config.timeout || 300000}
                  onChange={(e) => handleServiceChange('timeout', parseInt(e.target.value) || 300000)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="flex items-center pt-4">
                <input
                  type="checkbox"
                  id="orchestrator-debug"
                  checked={config.debug || false}
                  onChange={(e) => handleServiceChange('debug', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="orchestrator-debug" className="ml-2 text-sm font-semibold text-slate-700">
                  调试模式
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto-orchestrate"
                  checked={config.autoOrchestrate || false}
                  onChange={(e) => handleServiceChange('autoOrchestrate', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="auto-orchestrate" className="ml-2 text-sm font-semibold text-slate-700">
                  自动编排
                </label>
                <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Management Configuration */}
      {activeTab === 'session' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">会话基本配置</h3>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="session-enable"
                  checked={config.session?.enableSession || false}
                  onChange={(e) => handleSessionChange('enableSession', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="session-enable" className="ml-2 text-sm font-semibold text-slate-700">
                  启用会话管理
                </label>
                <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⚠️ 关键</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">存储类型</label>
                <select
                  value={config.session?.storeType || 'hybrid'}
                  onChange={(e) => handleSessionChange('storeType', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="memory">内存存储</option>
                  <option value="file">文件存储</option>
                  <option value="redis">Redis 存储</option>
                  <option value="hybrid">混合存储</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">会话生命周期配置</h3>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">会话生存时间 (毫秒)</label>
                <input
                  type="number"
                  value={config.session?.sessionConfig?.ttl || 3600000}
                  onChange={(e) => handleSessionConfigChange('ttl', parseInt(e.target.value) || 3600000)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="flex items-center pt-2">
                <input
                  type="checkbox"
                  id="auto-extend"
                  checked={config.session?.sessionConfig?.autoExtend || false}
                  onChange={(e) => handleSessionConfigChange('autoExtend', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="auto-extend" className="ml-2 text-sm font-semibold text-slate-700">
                  自动延期
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool Call Configuration */}
      {activeTab === 'toolcall' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">工具调用配置</h3>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="tool-call-enabled"
                  checked={config.toolCallFormat?.enabled || false}
                  onChange={(e) => handleToolCallChange('enabled', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="tool-call-enabled" className="ml-2 text-sm font-semibold text-slate-700">
                  启用工具调用格式化
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">默认格式</label>
                <select
                  value={config.toolCallFormat?.defaultFormat || 'json'}
                  onChange={(e) => handleToolCallChange('defaultFormat', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="json">JSON</option>
                  <option value="function">Function Call</option>
                  <option value="xml">XML</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">支持的工具</label>
              <textarea
                value={Array.isArray(config.toolCallFormat?.supportedTools) ? config.toolCallFormat.supportedTools.join(', ') : ''}
                onChange={(e) => {
                  const tools = e.target.value.split(',').map(tool => tool.trim()).filter(tool => tool);
                  handleToolCallChange('supportedTools', tools);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                rows={4}
                placeholder="输入支持的工具名称，用逗号分隔"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrchestratorConfig;