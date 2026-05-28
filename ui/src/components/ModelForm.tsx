import React, { useState, useEffect } from 'react';

interface ModelFormProps {
  model?: any; // 传入编辑的模型，如果是新建则为 undefined
  targetProvider?: string | null; // 传入目标提供商名称，用于新增模型
  onSave: (model: any) => void;
  onCancel: () => void;
}

const ModelForm: React.FC<ModelFormProps> = ({ model, targetProvider, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    provider: '',
    type: 'cloud',
    capabilities: '',
    strengths: '',
    pricing_input: 0,
    pricing_output: 0,
    context_limit: 32768,
    quality_score: 7.0,
    speed: 'medium',
    max_concurrency: 10,
    response_time: 5000,
  });

  // 当 model 或 targetProvider prop 变化时更新表单数据
  useEffect(() => {
    const providerValue = model?.provider || targetProvider || '';
    setFormData({
      id: model?.id || '',
      name: model?.name || '',
      provider: providerValue,
      type: model?.type || 'cloud',
      capabilities: model?.capabilities?.join(',') || '',
      strengths: model?.strengths?.join(',') || '',
      pricing_input: model?.pricing?.input || 0,
      pricing_output: model?.pricing?.output || 0,
      context_limit: model?.context_limit || 32768,
      quality_score: model?.quality_score || 7.0,
      speed: model?.speed || 'medium',
      max_concurrency: model?.max_concurrency || 10,
      response_time: model?.response_time || 5000,
    });
  }, [model, targetProvider]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('_input') || name.includes('_output') || name === 'context_limit' || name === 'quality_score' || name === 'max_concurrency' || name === 'response_time'
        ? (() => {
            const num = Number(value);
            return isNaN(num) ? prev[name as keyof typeof prev] : num;
          })()
        : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 构建模型对象
    const newModel = {
      id: formData.id,
      name: formData.name,
      provider: model?.provider || formData.provider, // 编辑现有模型时，保留原始提供商；新建时使用表单中的提供商
      type: formData.type,
      capabilities: formData.capabilities.split(',').map(c => c.trim()).filter(c => c),
      strengths: formData.strengths.split(',').map(s => s.trim()).filter(s => s),
      pricing: {
        input: formData.pricing_input,
        output: formData.pricing_output
      },
      context_limit: formData.context_limit,
      quality_score: formData.quality_score,
      speed: formData.speed,
      max_concurrency: formData.max_concurrency,
      response_time: formData.response_time,
    };

    onSave(newModel);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {model ? '编辑模型' : '添加模型'}
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  模型ID *
                </label>
                <input
                  type="text"
                  name="id"
                  value={formData.id}
                  onChange={handleChange}
                  required
                  placeholder="例如: gpt-4o-mini"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  模型名称 *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="例如: GPT-4o Mini"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  提供商 *
                </label>
                <input
                  type="text"
                  name="provider"
                  value={formData.provider}
                  onChange={handleChange}
                  required
                  placeholder="例如: openai"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  模型类型
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="cloud">云端</option>
                  <option value="local">本地</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  价格 (输入)
                </label>
                <input
                  type="number"
                  name="pricing_input"
                  value={formData.pricing_input}
                  onChange={handleChange}
                  step="0.000001"
                  min="0"
                  placeholder="每千token价格"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  价格 (输出)
                </label>
                <input
                  type="number"
                  name="pricing_output"
                  value={formData.pricing_output}
                  onChange={handleChange}
                  step="0.000001"
                  min="0"
                  placeholder="每千token价格"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  上下文限制
                </label>
                <input
                  type="number"
                  name="context_limit"
                  value={formData.context_limit}
                  onChange={handleChange}
                  min="1000"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  质量评分
                </label>
                <input
                  type="number"
                  name="quality_score"
                  value={formData.quality_score}
                  onChange={handleChange}
                  min="0"
                  max="10"
                  step="0.1"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  速度等级
                </label>
                <select
                  name="speed"
                  value={formData.speed}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                >
                  <option value="slow">慢</option>
                  <option value="medium">中</option>
                  <option value="fast">快</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  最大并发数
                </label>
                <input
                  type="number"
                  name="max_concurrency"
                  value={formData.max_concurrency}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  功能
                </label>
                <input
                  type="text"
                  name="capabilities"
                  value={formData.capabilities}
                  onChange={handleChange}
                  placeholder="例如: chat,coding,reasoning"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">多个功能请用逗号分隔</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  优势
                </label>
                <input
                  type="text"
                  name="strengths"
                  value={formData.strengths}
                  onChange={handleChange}
                  placeholder="例如: 通用任务,代码生成"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">多个优势请用逗号分隔</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  响应时间 (ms)
                </label>
                <input
                  type="number"
                  name="response_time"
                  value={formData.response_time}
                  onChange={handleChange}
                  min="100"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 border border-transparent rounded-lg text-white font-semibold hover:bg-indigo-700 transition-colors"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ModelForm;