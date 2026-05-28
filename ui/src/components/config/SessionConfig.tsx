import React, { useState } from 'react';
import ConfigSection from '../shared/ConfigSection';

interface SessionConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const SessionConfig: React.FC<SessionConfigProps> = ({ config, onUpdate }) => {
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
      // Add camelCase alias if key contains underscore
      if (key.includes('_')) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (camelKey !== key) {
          result[camelKey] = result[key];
        }
      }
    }
    return result;
  };

  // Merged config with both naming conventions for reading
  const mergedConfig = addAliases(config);

  // Update functions that always write snake_case
  const updateNestedConfig = (section: string, subsection: string, field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    const snakeSubsection = toSnakeCase(subsection);
    const snakeSection = toSnakeCase(section);
    onUpdate({
      ...config,
      [snakeSection]: {
        ...(config[snakeSection] || config[section] || {}),
        [snakeSubsection]: {
          ...(config[snakeSection]?.[snakeSubsection] || config[section]?.[snakeSubsection] || config[snakeSection]?.[subsection] || config[section]?.[subsection] || {}),
          [snakeField]: value
        }
      }
    });
  };

  const updateSimpleNestedConfig = (section: string, field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    const snakeSection = toSnakeCase(section);
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
        <h2 className="text-2xl font-bold text-slate-800">会话管理配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置会话ID生成、存储、生命周期、安全性和性能参数。</p>
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
            activeTab === 'storage' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('storage')}
        >
          存储配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'lifecycle' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('lifecycle')}
        >
          生命周期
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'security' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('security')}
        >
          安全配置
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'performance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('performance')}
        >
          性能配置
        </button>
      </div>

      {/* General Configuration */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <ConfigSection title="会话ID生成配置" color="indigo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">生成策略</label>
                  <select
                    value={mergedConfig.idGeneration?.strategy || 'uuid-v4'}
                    onChange={(e) => updateNestedConfig('idGeneration', 'id_generation', 'strategy', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  >
                    <option value="uuid-v4">UUID v4</option>
                    <option value="timestamp-hash">时间戳哈希</option>
                    <option value="composite">组合策略</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">ID前缀</label>
                  <input
                    type="text"
                    value={mergedConfig.idGeneration?.prefix || 'sess'}
                    onChange={(e) => updateNestedConfig('idGeneration', 'id_generation', 'prefix', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最小长度</label>
                  <input
                    type="number"
                    value={mergedConfig.idGeneration?.minLength || 32}
                    onChange={(e) => updateNestedConfig('idGeneration', 'id_generation', 'minLength', parseInt(e.target.value) || 32)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">随机熵源</label>
                  <select
                    value={mergedConfig.idGeneration?.entropySource || 'crypto'}
                    onChange={(e) => updateNestedConfig('idGeneration', 'id_generation', 'entropySource', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  >
                    <option value="crypto">Crypto</option>
                    <option value="timestamp">时间戳</option>
                    <option value="pid">进程ID</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.idGeneration?.validateOnCreate !== false}
                    onChange={(e) => updateNestedConfig('idGeneration', 'id_generation', 'validateOnCreate', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    创建时验证ID格式
                  </label>
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Storage Configuration */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          <ConfigSection title="存储配置" color="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">默认存储类型</label>
                  <select
                    value={mergedConfig.storage?.defaultStore || 'memory'}
                    onChange={(e) => updateSimpleNestedConfig('storage', 'defaultStore', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  >
                    <option value="memory">内存存储</option>
                    <option value="file">文件存储</option>
                    <option value="redis">Redis存储</option>
                    <option value="hybrid">混合存储</option>
                  </select>
                </div>
              </div>
            </div>
          </ConfigSection>

          {/* Memory Store Config */}
          <ConfigSection title="内存存储配置" color="purple">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大会话数</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.memory?.maxSessions || 1000}
                    onChange={(e) => updateNestedConfig('storage', 'memory', 'maxSessions', parseInt(e.target.value) || 1000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">过期时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.memory?.ttl || 3600000}
                    onChange={(e) => updateNestedConfig('storage', 'memory', 'ttl', parseInt(e.target.value) || 3600000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大会话大小 (字节)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.memory?.maxSessionSize || 52428800}
                    onChange={(e) => updateNestedConfig('storage', 'memory', 'maxSessionSize', parseInt(e.target.value) || 52428800)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">清理间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.memory?.cleanupInterval || 300000}
                    onChange={(e) => updateNestedConfig('storage', 'memory', 'cleanupInterval', parseInt(e.target.value) || 300000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>

          {/* File Store Config */}
          <ConfigSection title="文件存储配置" color="cyan">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">基础路径</label>
                  <input
                    type="text"
                    value={mergedConfig.storage?.file?.basePath || './sessions'}
                    onChange={(e) => updateNestedConfig('storage', 'file', 'basePath', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">过期时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.file?.ttl || 3600000}
                    onChange={(e) => updateNestedConfig('storage', 'file', 'ttl', parseInt(e.target.value) || 3600000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大会话大小 (字节)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.file?.maxSessionSize || 52428800}
                    onChange={(e) => updateNestedConfig('storage', 'file', 'maxSessionSize', parseInt(e.target.value) || 52428800)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">清理间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.storage?.file?.cleanupInterval || 300000}
                    onChange={(e) => updateNestedConfig('storage', 'file', 'cleanupInterval', parseInt(e.target.value) || 300000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.storage?.file?.compression?.enabled !== false}
                    onChange={(e) => updateNestedConfig('storage', 'file', 'compression', {
                      ...(mergedConfig.storage?.file?.compression || {}),
                      enabled: e.target.checked
                    })}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用压缩
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Lifecycle Configuration */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-6">
          <ConfigSection title="会话生命周期配置" color="yellow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大持续时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.lifecycle?.maxDuration || 86400000}
                    onChange={(e) => updateSimpleNestedConfig('lifecycle', 'maxDuration', parseInt(e.target.value) || 86400000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">心跳间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.lifecycle?.heartbeatInterval || 60000}
                    onChange={(e) => updateSimpleNestedConfig('lifecycle', 'heartbeatInterval', parseInt(e.target.value) || 60000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">空闲超时 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.lifecycle?.idleTimeout || 1800000}
                    onChange={(e) => updateSimpleNestedConfig('lifecycle', 'idleTimeout', parseInt(e.target.value) || 1800000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">自动保存间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.lifecycle?.autoSaveInterval || 30000}
                    onChange={(e) => updateSimpleNestedConfig('lifecycle', 'autoSaveInterval', parseInt(e.target.value) || 30000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>
        </div>
      )}

      {/* Security Configuration */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <ConfigSection title="加密配置" color="indigo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.security?.encryption?.enabled || false}
                    onChange={(e) => updateNestedConfig('security', 'encryption', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用加密
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">加密算法</label>
                  <select
                    value={mergedConfig.security?.encryption?.algorithm || 'aes-256-gcm'}
                    onChange={(e) => updateNestedConfig('security', 'encryption', 'algorithm', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  >
                    <option value="aes-256-gcm">AES-256-GCM</option>
                    <option value="aes-192-gcm">AES-192-GCM</option>
                    <option value="aes-128-gcm">AES-128-GCM</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">密钥轮换间隔 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.security?.encryption?.keyRotationInterval || 86400000}
                    onChange={(e) => updateNestedConfig('security', 'encryption', 'keyRotationInterval', parseInt(e.target.value) || 86400000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="速率限制配置" color="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.security?.rateLimiting?.enabled !== false}
                    onChange={(e) => updateNestedConfig('security', 'rateLimiting', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用速率限制
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大请求数</label>
                  <input
                    type="number"
                    value={mergedConfig.security?.rateLimiting?.maxRequests || 100}
                    onChange={(e) => updateNestedConfig('security', 'rateLimiting', 'maxRequests', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">时间窗口 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.security?.rateLimiting?.windowMs || 60000}
                    onChange={(e) => updateNestedConfig('security', 'rateLimiting', 'windowMs', parseInt(e.target.value) || 60000)}
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
          <ConfigSection title="缓存配置" color="purple">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.performance?.cache?.enabled !== false}
                    onChange={(e) => updateNestedConfig('performance', 'cache', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用缓存
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.performance?.cache?.persistenceEnabled !== false}
                    onChange={(e) => updateNestedConfig('performance', 'cache', 'persistenceEnabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用持久化
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">最大缓存条目</label>
                  <input
                    type="number"
                    value={mergedConfig.performance?.cache?.max || mergedConfig.performance?.cache?.maxEntries || 100}
                    onChange={(e) => updateNestedConfig('performance', 'cache', 'max', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">缓存过期时间 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.performance?.cache?.ttl || mergedConfig.performance?.cache?.defaultTTL || 300000}
                    onChange={(e) => updateNestedConfig('performance', 'cache', 'ttl', parseInt(e.target.value) || 300000)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="压缩配置" color="cyan">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.performance?.compression?.enabled !== false}
                    onChange={(e) => updateNestedConfig('performance', 'compression', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用压缩
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">压缩阈值 (字节)</label>
                  <input
                    type="number"
                    value={mergedConfig.performance?.compression?.threshold || 1048576}
                    onChange={(e) => updateNestedConfig('performance', 'compression', 'threshold', parseInt(e.target.value) || 1048576)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="批处理配置" color="yellow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mergedConfig.performance?.batchProcessing?.enabled !== false}
                    onChange={(e) => updateNestedConfig('performance', 'batchProcessing', 'enabled', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label className="ml-2 text-sm font-semibold text-slate-700">
                    启用批处理
                  </label>
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ℹ️ 可选</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">批次大小</label>
                  <input
                    type="number"
                    value={mergedConfig.performance?.batchProcessing?.batchSize || 10}
                    onChange={(e) => updateNestedConfig('performance', 'batchProcessing', 'batchSize', parseInt(e.target.value) || 10)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">批处理超时 (毫秒)</label>
                  <input
                    type="number"
                    value={mergedConfig.performance?.batchProcessing?.batchTimeout || 1000}
                    onChange={(e) => updateNestedConfig('performance', 'batchProcessing', 'batchTimeout', parseInt(e.target.value) || 1000)}
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

export default SessionConfig;