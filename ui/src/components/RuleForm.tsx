import React, { useState, useEffect } from 'react';

interface RuleFormProps {
  rule?: any; // 传入编辑的规则，如果是新建则为 undefined
  onSave: (rule: any) => void;
  onCancel: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ rule, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    taskTypes: '',
    preferredModels: '',
    fallbackModels: '',
    reason: '',
    weight: 1.0,
  });

  // 当 rule prop 变化时更新表单数据
  useEffect(() => {
    setFormData({
      taskTypes: rule?.taskTypes?.join(',') || '',
      preferredModels: rule?.preferredModels?.join(',') || '',
      fallbackModels: rule?.fallbackModels?.join(',') || '',
      reason: rule?.reason || '',
      weight: rule?.weight != null ? rule.weight : 1.0,
    });
  }, [rule]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 构建规则对象
    const weightValue = parseFloat(formData.weight.toString());
    const newRule = {
      taskTypes: formData.taskTypes.split(',').map(t => t.trim()).filter(t => t),
      preferredModels: formData.preferredModels.split(',').map(m => m.trim()).filter(m => m),
      fallbackModels: formData.fallbackModels.split(',').map(m => m.trim()).filter(m => m),
      reason: formData.reason,
      weight: isNaN(weightValue) ? 1.0 : weightValue
    };

    onSave(newRule);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {rule ? '编辑选择规则' : '添加选择规则'}
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  任务类型 *
                </label>
                <input
                  type="text"
                  name="taskTypes"
                  value={formData.taskTypes}
                  onChange={handleChange}
                  required
                  placeholder="例如: ui,style"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">多个任务类型请用逗号分隔</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  首选模型 *
                </label>
                <input
                  type="text"
                  name="preferredModels"
                  value={formData.preferredModels}
                  onChange={handleChange}
                  required
                  placeholder="例如: gemini-2.0-flash,claude-opus-4-6"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">多个模型请用逗号分隔</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  备选模型
                </label>
                <input
                  type="text"
                  name="fallbackModels"
                  value={formData.fallbackModels}
                  onChange={handleChange}
                  placeholder="例如: gpt-4o-mini,claude-sonnet-4-6"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">多个模型请用逗号分隔（可选）</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  权重
                </label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500">权重范围 0-2，默认 1.0</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  说明
                </label>
                <textarea
                  name="reason"
                  value={formData.reason}
                  onChange={handleChange}
                  rows={3}
                  placeholder="请输入规则说明..."
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                ></textarea>
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

export default RuleForm;