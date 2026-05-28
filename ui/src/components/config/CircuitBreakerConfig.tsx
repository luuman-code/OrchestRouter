import React from 'react';

interface CircuitBreakerConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const CircuitBreakerConfig: React.FC<CircuitBreakerConfigProps> = ({ config, onUpdate }) => {
  // Support both snake_case (config.json) and camelCase (legacy) for reading
  const getValue = (field: string, defaultValue: any) => {
    if (config[field] !== undefined) return config[field];
    // camelCase to snake_case mapping for backward compatibility
    const snakeMap: Record<string, string> = {
      'failureThreshold': 'failure_threshold',
      'timeout': 'timeout',
      'resetTimeout': 'reset_timeout',
      'successThreshold': 'success_threshold',
      'halfOpenInterval': 'half_open_interval'
    };
    const snakeField = snakeMap[field];
    return snakeField && config[snakeField] !== undefined ? config[snakeField] : defaultValue;
  };

  const handleChange = (field: string, value: any) => {
    // Convert camelCase to snake_case
    const snakeMap: Record<string, string> = {
      'failureThreshold': 'failure_threshold',
      'timeout': 'timeout',
      'resetTimeout': 'reset_timeout',
      'successThreshold': 'success_threshold',
      'halfOpenInterval': 'half_open_interval'
    };
    const snakeField = snakeMap[field] || field;
    onUpdate({
      ...config,
      [snakeField]: value
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">熔断器配置</h2>
        <p className="text-sm text-slate-500 mt-2">配置熔断器参数以防止系统过载和级联失败。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">基本熔断配置</h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">失败阈值</label>
              <input
                type="number"
                value={getValue('failureThreshold', 5)}
                onChange={(e) => handleChange('failureThreshold', parseInt(e.target.value) || 5)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                placeholder="触发熔断的失败次数"
              />
              <p className="text-xs text-slate-500">连续失败次数达到此值时，熔断器将打开</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">熔断超时时间 (毫秒)</label>
              <input
                type="number"
                value={getValue('timeout', 60000)}
                onChange={(e) => handleChange('timeout', parseInt(e.target.value) || 60000)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                placeholder="熔断后保持开启状态的时间"
              />
              <p className="text-xs text-slate-500">熔断器在开启状态下保持的时间，之后进入半开状态</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">恢复配置</h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">恢复等待时间 (毫秒)</label>
              <input
                type="number"
                value={getValue('resetTimeout', 30000)}
                onChange={(e) => handleChange('resetTimeout', parseInt(e.target.value) || 30000)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                placeholder="恢复后等待重新测试的时间"
              />
              <p className="text-xs text-slate-500">熔断器从开启状态恢复到半开状态后，等待多久才允许第一次请求通过</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">成功恢复阈值</label>
              <input
                type="number"
                value={getValue('successThreshold', 1)}
                onChange={(e) => handleChange('successThreshold', parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                placeholder="半开状态需要的成功次数"
              />
              <p className="text-xs text-slate-500">在半开状态下，需要多少次连续成功才能将熔断器关闭</p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6 pt-6 border-t border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center border-l-4 border-indigo-500 pl-3">探测配置</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">半开状态探测间隔 (毫秒)</label>
              <input
                type="number"
                value={getValue('halfOpenInterval', 1000)}
                onChange={(e) => handleChange('halfOpenInterval', parseInt(e.target.value) || 1000)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                placeholder="半开状态下探测间隔"
              />
              <p className="text-xs text-slate-500">在半开状态下，允许探测请求的间隔时间</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CircuitBreakerConfig;