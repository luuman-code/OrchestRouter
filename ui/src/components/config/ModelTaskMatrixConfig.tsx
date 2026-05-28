import React, { useState, useEffect, useCallback } from 'react';
import { getModelTaskMatrix, updateSuitabilityMatrix } from '../../config/api';

// 类型定义
interface ModelTaskMatrixConfigProps {
  onMatrixUpdate?: (matrix: any) => void;
}

interface SuitabilityMatrix {
  models: string[];
  dimensions: {
    category: Record<string, Record<string, number>>;
    complexity: Record<string, Record<string, number>>;
    priority: Record<string, Record<string, number>>;
    quality: Record<string, Record<string, number>>;
    cost: Record<string, Record<string, number>>;
  };
  dimensionValues?: {
    category?: string[];
    complexity?: string[];
    priority?: string[];
    quality?: string[];
    cost?: string[];
  };
}

type DimensionType = 'category' | 'complexity' | 'priority' | 'quality' | 'cost';

const DIMENSION_LABELS: Record<DimensionType, string> = {
  category: '任务类别 (Category)',
  complexity: '复杂度 (Complexity)',
  priority: '优先级 (Priority)',
  quality: '质量要求 (Quality)',
  cost: '成本控制 (Cost)',
};

const DEFAULT_CATEGORIES = ['chat', 'coding', 'reasoning', 'image', 'websearch'];
const DEFAULT_COMPLEXITY = ['simple', 'moderate', 'complex', 'expert'];
const DEFAULT_PRIORITY = ['low', 'normal', 'high', 'critical'];
const DEFAULT_QUALITY = ['fast', 'balanced', 'high', 'premium'];
const DEFAULT_COST = ['budget', 'economy', 'standard', 'premium'];

const ModelTaskMatrixConfig: React.FC<ModelTaskMatrixConfigProps> = ({ onMatrixUpdate }) => {
  const [matrix, setMatrix] = useState<SuitabilityMatrix>({
    models: [],
    dimensions: {
      category: {},
      complexity: {},
      priority: {},
      quality: {},
      cost: {},
    },
  });
  const [activeDimension, setActiveDimension] = useState<DimensionType>('category');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // API 返回的维度值映射
  const [apiDimensionValues, setApiDimensionValues] = useState<Record<DimensionType, string[]>>({
    category: DEFAULT_CATEGORIES,
    complexity: DEFAULT_COMPLEXITY,
    priority: DEFAULT_PRIORITY,
    quality: DEFAULT_QUALITY,
    cost: DEFAULT_COST,
  });

  // 获取维度值列表（优先使用 API 返回的值）
  const getDimensionValues = (dimension: DimensionType): string[] => {
    // 优先使用 API 返回的维度值
    if (apiDimensionValues[dimension] && apiDimensionValues[dimension].length > 0) {
      return apiDimensionValues[dimension];
    }
    // 兜底使用硬编码默认值
    switch (dimension) {
      case 'category':
        return DEFAULT_CATEGORIES;
      case 'complexity':
        return DEFAULT_COMPLEXITY;
      case 'priority':
        return DEFAULT_PRIORITY;
      case 'quality':
        return DEFAULT_QUALITY;
      case 'cost':
        return DEFAULT_COST;
      default:
        return [];
    }
  };

  // 加载矩阵数据
  const loadMatrix = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getModelTaskMatrix();
      setMatrix(data);
      // 更新维度值列表（使用 API 返回的值）
      if (data.dimensionValues) {
        setApiDimensionValues({
          category: data.dimensionValues.category || DEFAULT_CATEGORIES,
          complexity: data.dimensionValues.complexity || DEFAULT_COMPLEXITY,
          priority: data.dimensionValues.priority || DEFAULT_PRIORITY,
          quality: data.dimensionValues.quality || DEFAULT_QUALITY,
          cost: data.dimensionValues.cost || DEFAULT_COST,
        });
      }
    } catch (error) {
      console.error('加载矩阵失败:', error);
      setMessage({ type: 'error', text: '加载矩阵配置失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  // 处理单元格值变化
  const handleCellChange = (
    modelId: string,
    dimension: DimensionType,
    dimensionValue: string,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 1) {
      return; // 忽略无效值
    }

    setMatrix((prev) => {
      const newMatrix = {
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimension]: {
            ...prev.dimensions[dimension],
            [modelId]: {
              ...prev.dimensions[dimension][modelId],
              [dimensionValue]: numValue,
            },
          },
        },
      };
      onMatrixUpdate?.(newMatrix);
      return newMatrix;
    });
  };

  // 添加模型
  const handleAddModel = () => {
    const newModelId = `model-${Date.now()}`;
    const newModelName = prompt('请输入新模型名称:');
    if (!newModelName) return;

    setMatrix((prev) => {
      const newMatrix = {
        ...prev,
        models: [...prev.models, newModelId],
        dimensions: {
          ...prev.dimensions,
          category: { ...prev.dimensions.category, [newModelId]: {} },
          complexity: { ...prev.dimensions.complexity, [newModelId]: {} },
          priority: { ...prev.dimensions.priority, [newModelId]: {} },
          quality: { ...prev.dimensions.quality, [newModelId]: {} },
          cost: { ...prev.dimensions.cost, [newModelId]: {} },
        },
      };
      // 初始化默认值
      const dimensionValues = getDimensionValues(activeDimension);
      dimensionValues.forEach((dimVal) => {
        newMatrix.dimensions[activeDimension][newModelId][dimVal] = 0.5;
      });
      onMatrixUpdate?.(newMatrix);
      return newMatrix;
    });
  };

  // 移除模型
  const handleRemoveModel = (modelId: string) => {
    if (!confirm('确定要移除此模型吗？')) return;

    setMatrix((prev) => {
      const newModels = prev.models.filter((m) => m !== modelId);
      const newDimensions = {
        category: { ...prev.dimensions.category },
        complexity: { ...prev.dimensions.complexity },
        priority: { ...prev.dimensions.priority },
        quality: { ...prev.dimensions.quality },
        cost: { ...prev.dimensions.cost },
      };
      delete newDimensions.category[modelId];
      delete newDimensions.complexity[modelId];
      delete newDimensions.priority[modelId];
      delete newDimensions.quality[modelId];
      delete newDimensions.cost[modelId];

      const newMatrix = {
        models: newModels,
        dimensions: newDimensions,
      };
      onMatrixUpdate?.(newMatrix);
      return newMatrix;
    });
  };

  // 添加维度值
  const handleAddDimensionValue = () => {
    const newValue = prompt(`请输入新的 ${DIMENSION_LABELS[activeDimension]} 值:`);
    if (!newValue) return;

    setMatrix((prev) => {
      const newDimensions = { ...prev.dimensions };
      // 为所有模型添加新值
      prev.models.forEach((modelId) => {
        if (!newDimensions[activeDimension][modelId]) {
          newDimensions[activeDimension][modelId] = {};
        }
        newDimensions[activeDimension][modelId][newValue] = 0.5;
      });

      const newMatrix = {
        ...prev,
        dimensions: newDimensions,
      };
      onMatrixUpdate?.(newMatrix);
      return newMatrix;
    });
  };

  // 移除维度值
  const handleRemoveDimensionValue = (dimensionValue: string) => {
    if (!confirm(`确定要移除 "${dimensionValue}" 吗？`)) return;

    setMatrix((prev) => {
      const newDimensions = { ...prev.dimensions };
      prev.models.forEach((modelId) => {
        if (newDimensions[activeDimension][modelId]) {
          delete newDimensions[activeDimension][modelId][dimensionValue];
        }
      });

      const newMatrix = {
        ...prev,
        dimensions: newDimensions,
      };
      onMatrixUpdate?.(newMatrix);
      return newMatrix;
    });
  };

  // 保存矩阵
  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSuitabilityMatrix(matrix);
      setMessage({ type: 'success', text: '矩阵配置已保存' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('保存矩阵失败:', error);
      setMessage({ type: 'error', text: '保存矩阵配置失败' });
    } finally {
      setSaving(false);
    }
  };

  // 获取单元格值
  const getCellValue = (modelId: string, dimension: DimensionType, dimensionValue: string): number => {
    return matrix.dimensions[dimension]?.[modelId]?.[dimensionValue] ?? 0.5;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  const dimensionValues = getDimensionValues(activeDimension);

  return (
    <div className="p-8">
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-bold text-slate-800">模型-任务矩阵配置</h2>
        <p className="text-sm text-slate-500 mt-2">
          配置各模型对不同任务维度的 suitability 评分 (0-1 范围)。
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

      {/* 维度选择标签 */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {(Object.keys(DIMENSION_LABELS) as DimensionType[]).map((dim) => (
          <button
            key={dim}
            onClick={() => setActiveDimension(dim)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeDimension === dim
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {DIMENSION_LABELS[dim]}
          </button>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handleAddModel}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-md shadow-indigo-200"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          添加模型
        </button>
        <button
          onClick={handleAddDimensionValue}
          className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-md shadow-emerald-200"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          添加维度值
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-semibold shadow-md shadow-slate-300 disabled:opacity-70"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 矩阵表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                模型 / {DIMENSION_LABELS[activeDimension]}
              </th>
              {dimensionValues.map((value) => (
                <th
                  key={value}
                  className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 min-w-[100px]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>{value}</span>
                    <button
                      onClick={() => handleRemoveDimensionValue(value)}
                      className="text-rose-400 hover:text-rose-600 transition-colors"
                      title="移除此维度值"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 w-16">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {matrix.models.length === 0 ? (
              <tr>
                <td colSpan={dimensionValues.length + 2} className="px-4 py-8 text-center text-slate-500">
                  暂无模型，请点击"添加模型"按钮添加
                </td>
              </tr>
            ) : (
              matrix.models.map((modelId) => (
                <tr key={modelId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                    {modelId}
                  </td>
                  {dimensionValues.map((value) => (
                    <td key={value} className="px-2 py-2 border-l border-slate-100">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={getCellValue(modelId, activeDimension, value)}
                        onChange={(e) =>
                          handleCellChange(modelId, activeDimension, value, e.target.value)
                        }
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-center text-slate-800"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center border-l border-slate-100">
                    <button
                      onClick={() => handleRemoveModel(modelId)}
                      className="text-rose-500 hover:text-rose-700 transition-colors"
                      title="移除此模型"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 图例 */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">评分说明:</h4>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>• 0.0 - 0.3: 不适合 (Unsuitable)</li>
          <li>• 0.4 - 0.5: 一般 (Average)</li>
          <li>• 0.6 - 0.7: 良好 (Good)</li>
          <li>• 0.8 - 0.9: 优秀 (Excellent)</li>
          <li>• 1.0: 最佳 (Optimal)</li>
        </ul>
      </div>
    </div>
  );
};

export default ModelTaskMatrixConfig;
