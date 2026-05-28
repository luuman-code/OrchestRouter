import React, { useState, useEffect, useCallback } from 'react';
import { getModelTaskMatrix, updateDimensionWeights } from '../../config/api';

// 类型定义
interface DimensionWeightsConfigProps {
  onWeightsUpdate?: (weights: DimensionWeights) => void;
}

interface DimensionWeights {
  category: number;
  complexity: number;
  priority: number;
  quality: number;
  cost: number;
}

type DimensionType = 'category' | 'complexity' | 'priority' | 'quality' | 'cost';

const DIMENSION_CONFIG: Record<DimensionType, { label: string; description: string; icon: string }> = {
  category: {
    label: '任务类别 (Category)',
    description: '任务类型与模型能力的匹配度，如 coding、reasoning、chat 等',
    icon: '🏷️',
  },
  complexity: {
    label: '复杂度 (Complexity)',
    description: '任务复杂度与模型处理能力的匹配度',
    icon: '🧩',
  },
  priority: {
    label: '优先级 (Priority)',
    description: '任务优先级与模型响应速度/质量的匹配度',
    icon: '⚡',
  },
  quality: {
    label: '质量要求 (Quality)',
    description: '任务所需质量水平与模型输出质量的匹配度',
    icon: '💎',
  },
  cost: {
    label: '成本控制 (Cost)',
    description: '任务成本预算与模型使用成本的匹配度',
    icon: '💰',
  },
};

const DimensionWeightsConfig: React.FC<DimensionWeightsConfigProps> = ({ onWeightsUpdate }) => {
  const [weights, setWeights] = useState<DimensionWeights>({
    category: 0.3,
    complexity: 0.25,
    priority: 0.2,
    quality: 0.15,
    cost: 0.1,
  });
  const [originalWeights, setOriginalWeights] = useState<DimensionWeights>({
    category: 0.3,
    complexity: 0.25,
    priority: 0.2,
    quality: 0.15,
    cost: 0.1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载权重数据
  const loadWeights = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getModelTaskMatrix();
      if (data.weights) {
        setWeights(data.weights);
        setOriginalWeights(data.weights);
      }
    } catch (error) {
      console.error('加载权重失败:', error);
      setMessage({ type: 'error', text: '加载维度权重失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeights();
  }, [loadWeights]);

  // 处理权重变化
  const handleWeightChange = (dimension: DimensionType, value: number) => {
    const newWeight = Math.max(0, Math.min(1, value));
    setWeights((prev) => {
      const newWeights = { ...prev, [dimension]: newWeight };
      onWeightsUpdate?.(newWeights);
      return newWeights;
    });
    setHasChanges(true);
  };

  // 保存权重
  const handleSave = async () => {
    try {
      setSaving(true);
      await updateDimensionWeights(weights);
      setOriginalWeights(weights);
      setHasChanges(false);
      setMessage({ type: 'success', text: '维度权重已保存' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('保存权重失败:', error);
      setMessage({ type: 'error', text: '保存维度权重失败' });
    } finally {
      setSaving(false);
    }
  };

  // 重置为默认值
  const handleReset = () => {
    const defaultWeights: DimensionWeights = {
      category: 0.3,
      complexity: 0.25,
      priority: 0.2,
      quality: 0.15,
      cost: 0.1,
    };
    setWeights(defaultWeights);
    onWeightsUpdate?.(defaultWeights);
    setHasChanges(true);
  };

  // 归一化显示百分比
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const getPercentage = (value: number): string => {
    return `${((value / Math.max(totalWeight, 0.01)) * 100).toFixed(1)}%`;
  };

  // 获取权重等级
  const getWeightLevel = (value: number): { label: string; color: string } => {
    if (value >= 0.8) return { label: '极高', color: 'text-emerald-600' };
    if (value >= 0.5) return { label: '高', color: 'text-emerald-500' };
    if (value >= 0.3) return { label: '中', color: 'text-amber-500' };
    if (value >= 0.1) return { label: '低', color: 'text-rose-500' };
    return { label: '极低', color: 'text-rose-600' };
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
        <h2 className="text-2xl font-bold text-slate-800">维度权重配置</h2>
        <p className="text-sm text-slate-500 mt-2">
          配置各维度在模型选择决策中的相对重要性 (0-1 范围)。所有权重会自动归一化处理。
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl border flex justify-between items-center ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="font-medium text-sm">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">
            ✕
          </button>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          {saving ? '保存中...' : '保存权重'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-semibold"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重置为默认
        </button>
        {hasChanges && (
          <span className="text-sm text-amber-600 font-medium ml-2">
            (有未保存的更改)
          </span>
        )}
      </div>

      {/* 权重滑块卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(Object.keys(DIMENSION_CONFIG) as DimensionType[]).map((dimension) => {
          const config = DIMENSION_CONFIG[dimension];
          const weight = weights[dimension];
          const level = getWeightLevel(weight);

          return (
            <div
              key={dimension}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{config.icon}</span>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{config.label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-600">{weight.toFixed(2)}</div>
                  <div className={`text-xs font-semibold ${level.color}`}>{level.label}</div>
                </div>
              </div>

              {/* 滑块 */}
              <div className="space-y-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weight}
                  onChange={(e) => handleWeightChange(dimension, parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>0 (不重要)</span>
                  <span>1 (至关重要)</span>
                </div>
              </div>

              {/* 归一化百分比 */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">归一化权重</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {getPercentage(weight)}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: getPercentage(weight) }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 实时预览 */}
      <div className="mt-8 p-6 bg-gradient-to-br from-slate-50 to-indigo-50 rounded-xl border border-slate-200">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          实时权重分布预览
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {(Object.keys(DIMENSION_CONFIG) as DimensionType[]).map((dimension) => {
            const config = DIMENSION_CONFIG[dimension];
            const weight = weights[dimension];
            const percentage = getPercentage(weight);

            return (
              <div key={dimension} className="text-center">
                <div className="text-2xl mb-1">{config.icon}</div>
                <div className="h-24 bg-white rounded-lg border border-slate-200 flex items-end justify-center p-1">
                  <div
                    className="w-full bg-gradient-to-t from-indigo-500 to-purple-500 rounded-lg transition-all duration-300"
                    style={{ height: percentage }}
                  />
                </div>
                <div className="text-sm font-semibold text-slate-700 mt-2">{percentage}</div>
                <div className="text-xs text-slate-500 truncate">{config.label.split(' ')[0]}</div>
              </div>
            );
          })}
        </div>

        {/* 权重总和 */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-sm text-slate-600">权重总和</span>
          <span className={`text-lg font-bold ${Math.abs(totalWeight - 1) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {totalWeight.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {Math.abs(totalWeight - 1) < 0.01
            ? '权重配置合理，系统将自动归一化处理'
            : '权重总和不为 1，系统将自动归一化处理'}
        </p>
      </div>

      {/* 说明 */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">配置说明:</h4>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>• 权重值表示该维度在模型选择决策中的相对重要性</li>
          <li>• 所有权重会自动归一化，确保总和为 1</li>
          <li>• 权重越高，该维度对最终模型选择结果的影响越大</li>
          <li>• 建议主要维度 (category, complexity) 设置较高权重</li>
        </ul>
      </div>
    </div>
  );
};

export default DimensionWeightsConfig;
