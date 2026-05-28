import React from 'react';

interface CostControlConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const CostControlConfig: React.FC<CostControlConfigProps> = ({ config, onUpdate }) => {
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

  const handleChange = (field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  const handleAdvancedChange = (field: string, value: any) => {
    const snakeField = toSnakeCase(field);
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">成本控制</h2>
        <p className="text-sm text-slate-500 mt-2">管理每日预算、单任务成本限制及成本优化策略。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">基础预算设置</h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">每日预算 ($)</label>
              <input
                type="number"
                step="0.01"
                value={mergedConfig.dailyBudget || mergedConfig.costControl?.dailyBudget || 10.00}
                onChange={(e) => handleChange('dailyBudget', parseFloat(e.target.value) || 10.00)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">单任务成本上限 ($)</label>
              <input
                type="number"
                step="0.01"
                value={mergedConfig.maxCostPerTask || mergedConfig.costControl?.maxCostPerTask || 0.50}
                onChange={(e) => handleChange('maxCostPerTask', parseFloat(e.target.value) || 0.50)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-emerald-500 pl-3">预算策略</h3>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="quality-first"
                checked={mergedConfig.qualityFirst || mergedConfig.costControl?.qualityFirst || false}
                onChange={(e) => handleChange('qualityFirst', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="quality-first" className="ml-2 text-sm font-semibold text-slate-700">
                优先考虑质量 (Quality First)
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="conservative-estimation"
                checked={(mergedConfig.conservativeEstimation ?? mergedConfig.costControl?.conservativeEstimation) !== false}
                onChange={(e) => handleChange('conservativeEstimation', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="conservative-estimation" className="ml-2 text-sm font-semibold text-slate-700">
                保守成本估算
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="cost-control-enabled"
                checked={mergedConfig.enabled || mergedConfig.costControl?.enabled || false}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="cost-control-enabled" className="ml-2 text-sm font-semibold text-slate-700">
                启用成本控制
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-purple-500 pl-3">高级成本控制</h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">安全边际 (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={mergedConfig.safetyMargin || mergedConfig.costControl?.safetyMargin || 0.2}
                onChange={(e) => handleChange('safetyMargin', parseFloat(e.target.value) || 0.2)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">成本优先阈值</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={mergedConfig.costControl?.costThreshold ?? 0.8}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  handleAdvancedChange('costThreshold', isNaN(val) ? 0.8 : Math.max(0, Math.min(1, val)));
                }}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              />
              <p className="text-xs text-slate-500">当预算使用率超过此值时启用成本优先策略</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-cyan-500 pl-3">实时反馈控制</h3>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="real-time-feedback"
                checked={mergedConfig.costControl?.realTimeFeedbackEnabled !== false}
                onChange={(e) => handleAdvancedChange('realTimeFeedbackEnabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="real-time-feedback" className="ml-2 text-sm font-semibold text-slate-700">
                启用实时反馈
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">待确认超时 (ms)</label>
              <input
                type="number"
                value={mergedConfig.costControl?.pendingConfirmTimeout || 30000}
                onChange={(e) => handleAdvancedChange('pendingConfirmTimeout', parseInt(e.target.value) || 30000)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
              />
              <p className="text-xs text-slate-500">任务确认超时时间，超过此时间未确认则释放预算预留</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-100">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center border-l-4 border-yellow-500 pl-3">预算使用情况</h3>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                ${(mergedConfig.costControl?.dailyBudget || 10.00).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">总预算</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                ${(mergedConfig.costControl?.spent || 0.00).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">已花费</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                ${(mergedConfig.costControl?.availableBudget || (mergedConfig.costControl?.dailyBudget || 10.00)).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">可用预算</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                {Math.round(((mergedConfig.costControl?.spent || 0) / Math.max(mergedConfig.costControl?.dailyBudget || 10.00, 0.01)) * 100)}%
              </div>
              <div className="text-xs text-slate-500">使用率</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostControlConfig;