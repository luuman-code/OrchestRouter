import React, { useState, useEffect } from 'react';
import { getAdapterConfig, updateProviderAdapter } from '../../config/api';

interface Provider {
  name: string;
  adapter?: string;
}

interface AdapterConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

interface AdapterInfo {
  name: string;
  file: string;
  displayName: string;
  format: string;
}

interface AdapterIndexConfig {
  enabled: boolean;
  defaultAdapter: string;
  adapters: Record<string, string>;
  providerMapping: Record<string, string>;
}

const AdapterConfig: React.FC<AdapterConfigProps> = ({ config, onUpdate }) => {
  const [adapterConfig, setAdapterConfig] = useState<AdapterIndexConfig | null>(null);
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 加载适配器配置
  const loadAdapterConfig = async () => {
    try {
      setLoading(true);
      const data = await getAdapterConfig();
      setAdapterConfig(data.adapterConfig);
      setAdapters(data.adapters || []);
      // 从主配置中获取提供商列表
      if (config?.Providers) {
        setProviders(config.Providers.map((p: Provider) => ({
          name: p.name,
          adapter: p.adapter || data.adapterConfig?.providerMapping?.[p.name] || data.adapterConfig?.defaultAdapter
        })));
      }
    } catch (error) {
      console.error('加载适配器配置失败:', error);
      setMessage({ type: 'error', text: '加载适配器配置失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdapterConfig();
  }, []);

  // 更新提供商的适配器
  const handleAdapterChange = async (providerName: string, newAdapter: string) => {
    try {
      setSaving(true);
      await updateProviderAdapter(providerName, newAdapter);
      setMessage({ type: 'success', text: `${providerName} 的适配器已更新为 ${newAdapter}` });

      // 更新本地状态
      setProviders(prev => prev.map(p =>
        p.name === providerName ? { ...p, adapter: newAdapter } : p
      ));

      // 同时更新主配置的 provider
      onUpdate({
        ...config,
        Providers: config?.Providers?.map((p: Provider) =>
          p.name === providerName ? { ...p, adapter: newAdapter } : p
        ) || []
      });
    } catch (error) {
      console.error('更新适配器失败:', error);
      setMessage({ type: 'error', text: '更新适配器失败' });
    } finally {
      setSaving(false);
    }
  };

  // 获取提供商当前使用的适配器
  const getProviderAdapter = (providerName: string): string => {
    const provider = providers.find(p => p.name === providerName);
    if (provider?.adapter) return provider.adapter;
    if (adapterConfig?.providerMapping?.[providerName]) return adapterConfig.providerMapping[providerName];
    return adapterConfig?.defaultAdapter || 'openai-compatible';
  };

  // 获取适配器格式说明
  const getAdapterFormat = (adapterName: string): string => {
    const adapter = adapters.find(a => a.name === adapterName);
    if (!adapter) return '';

    const formatLabels: Record<string, string> = {
      'openai': 'OpenAI 兼容格式 (/v1/chat/completions)',
      'anthropic': 'Anthropic 兼容格式 (/v1/messages)',
      'gemini': 'Google Gemini 格式 (/v1beta/models/...:generateContent)',
      'ollama': 'Ollama 本地格式 (/api/chat)'
    };

    return formatLabels[adapter.format] || adapter.format;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">转接口配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置各个模型提供商的 API 请求格式适配器。</p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl border flex justify-between items-center animate-in fade-in slide-in-from-top-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span className="font-medium text-sm">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
        </div>
      )}

      {/* 可用适配器列表 */}
      <div className="mb-8">
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3 mb-4">
          可用适配器
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {adapters.map(adapter => (
            <div key={adapter.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="font-semibold text-slate-800">{adapter.displayName}</div>
              <div className="text-xs text-slate-500 mt-1">{adapter.name}</div>
              <div className="text-xs text-indigo-600 mt-2">{getAdapterFormat(adapter.name)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 提供商适配器配置 */}
      <div>
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3 mb-4">
          提供商适配器配置
        </h3>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  提供商
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  当前适配器
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  切换适配器
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {providers.map(provider => {
                const currentAdapter = getProviderAdapter(provider.name);
                return (
                  <tr key={provider.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{provider.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {currentAdapter}
                      </span>
                      <div className="text-xs text-slate-500 mt-1">{getAdapterFormat(currentAdapter)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={currentAdapter}
                        onChange={(e) => handleAdapterChange(provider.name, e.target.value)}
                        disabled={saving}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800 disabled:opacity-50"
                      >
                        {adapters.map(adapter => (
                          <option key={adapter.name} value={adapter.name}>
                            {adapter.displayName} ({adapter.format})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 帮助信息 */}
      <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-200">
        <h4 className="font-semibold text-amber-800 mb-2">配置说明</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• <strong>openai-compatible</strong>: 兼容 OpenAI API 格式，使用 /v1/chat/completions 端点</li>
          <li>• <strong>anthropic-compatible</strong>: 兼容 Anthropic API 格式，使用 /v1/messages 端点</li>
          <li>• <strong>gemini</strong>: Google Gemini 专用格式</li>
          <li>• <strong>ollama</strong>: Ollama 本地模型格式</li>
        </ul>
        <p className="text-sm text-amber-700 mt-3">
          如果您的提供商使用 OpenAI 兼容接口，请选择 <strong>openai-compatible</strong>；
          如果使用 Anthropic 兼容接口（如 MiniMax），请选择 <strong>anthropic-compatible</strong>。
        </p>
      </div>
    </div>
  );
};

export default AdapterConfig;
