import React, { useState, useEffect } from 'react';
import { getSelectionRules, deleteSelectionRule } from '../config/api';

interface SelectionRule {
  taskTypes: string[];
  preferredModels: string[];
  fallbackModels: string[];
  reason: string;
  weight: number;
}

interface RuleTableProps {
  onEdit: (rule: SelectionRule) => void;
  refreshKey?: number;
}

const RuleTable: React.FC<RuleTableProps> = ({ onEdit, refreshKey }) => {
  const [rules, setRules] = useState<SelectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const data = await getSelectionRules();
        setRules(data);
        setError(null);
      } catch (err) {
        setError('获取规则失败');
        console.error('Error fetching rules:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [refreshKey]);

  const handleDelete = async (taskType: string) => {
    if (window.confirm(`确定要删除任务类型 "${taskType}" 的规则吗？`)) {
      try {
        setError(null);
        await deleteSelectionRule(taskType);
        // 刷新规则列表
        const data = await getSelectionRules();
        setRules(data);
      } catch (err) {
        setError('删除规则失败：' + (err instanceof Error ? err.message : '未知错误'));
        console.error('Error deleting rule:', err);
      }
    }
  };

  if (loading) return <div className="text-center py-4">加载中...</div>;
  if (error) return <div className="text-center py-4 text-red-500">{error}</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              任务类型
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              首选模型
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              备选模型
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              权重
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              说明
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {rules.map((rule) => {
            const ruleKey = rule.taskTypes.join(',');
            return (
              <tr key={ruleKey} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-900">
                    {rule.taskTypes.join(', ')}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-900">
                    {rule.preferredModels.join(', ')}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-900">
                    {rule.fallbackModels && rule.fallbackModels.length > 0 ? rule.fallbackModels.join(', ') : '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-900">
                    {rule.weight}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-900 max-w-xs truncate" title={rule.reason}>
                    {rule.reason}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => onEdit(rule)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(rule.taskTypes[0])}
                    className="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rules.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          暂无规则，请点击上方"添加规则"按钮添加新规则
        </div>
      )}
    </div>
  );
};

export default RuleTable;