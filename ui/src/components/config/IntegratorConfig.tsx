import React from 'react';

interface IntegratorConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const IntegratorConfig: React.FC<IntegratorConfigProps> = ({ config, onUpdate }) => {
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

  const handleNestedChange = (parent: string, field: string, value: any) => {
    const snakeParent = toSnakeCase(parent);
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeParent]: {
        ...config[snakeParent],
        [snakeField]: value
      }
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">整合器配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置代码整合器的各项参数，包括缓存、依赖检查、冲突解决等。</p>
      </div>

      {/* 缓存配置 */}
      <div className="space-y-6 mb-8">
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">缓存配置</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">启用缓存</label>
            <select
              value={mergedConfig.cache?.enabled !== undefined ? mergedConfig.cache.enabled : true}
              onChange={(e) => handleNestedChange('cache', 'enabled', e.target.value === 'true')}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <p className="text-xs text-slate-500">是否启用整合结果缓存</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">启用持久化</label>
            <select
              value={mergedConfig.cache?.persistenceEnabled !== undefined ? mergedConfig.cache.persistenceEnabled : true}
              onChange={(e) => handleNestedChange('cache', 'persistenceEnabled', e.target.value === 'true')}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <p className="text-xs text-slate-500">是否将缓存持久化到磁盘</p>
          </div>
        </div>
      </div>

      {/* 运行时依赖配置 */}
      <div className="space-y-6 mb-8">
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">运行时依赖</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">启用运行时依赖检查</label>
            <select
              value={mergedConfig.runtimeDependencies?.enabled !== undefined ? mergedConfig.runtimeDependencies.enabled : true}
              onChange={(e) => handleNestedChange('runtimeDependencies', 'enabled', e.target.value === 'true')}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <p className="text-xs text-slate-500">是否检查运行时依赖</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">输出依赖报告</label>
            <select
              value={mergedConfig.runtimeDependencies?.outputReport !== undefined ? mergedConfig.runtimeDependencies.outputReport : true}
              onChange={(e) => handleNestedChange('runtimeDependencies', 'outputReport', e.target.value === 'true')}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <p className="text-xs text-slate-500">是否生成依赖分析报告</p>
          </div>
        </div>
      </div>

      {/* 入口点配置 */}
      <div className="space-y-6 mb-8">
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">入口点配置</h3>

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-700">启用入口点检测</label>
          <select
            value={mergedConfig.entryPoint?.enabled !== undefined ? mergedConfig.entryPoint.enabled : true}
            onChange={(e) => handleNestedChange('entryPoint', 'enabled', e.target.value === 'true')}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
          >
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
          <p className="text-xs text-slate-500">是否自动检测项目入口点</p>
        </div>
      </div>

      {/* 执行质量配置 */}
      <div className="space-y-6 mb-8">
        <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">执行质量配置</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">质量阈值</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={mergedConfig.execution?.quality_threshold || 0.7}
              onChange={(e) => handleNestedChange('execution', 'quality_threshold', parseFloat(e.target.value) || 0.7)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              placeholder="0.7"
            />
            <p className="text-xs text-slate-500">执行通过所需的最低质量分数 (0-1)</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">关键质量阈值</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={mergedConfig.execution?.critical_quality_threshold || 0.5}
              onChange={(e) => handleNestedChange('execution', 'critical_quality_threshold', parseFloat(e.target.value) || 0.5)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              placeholder="0.5"
            />
            <p className="text-xs text-slate-500">关键任务所需的最低质量分数 (0-1)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegratorConfig;
