import React, { useState, useEffect, useRef } from 'react';

interface ContinueConversationPanelProps {
  taskId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  onContinue: (taskId: string, message: string) => void;
  onClose: () => void;
}

const ContinueConversationPanel: React.FC<ContinueConversationPanelProps> = ({
  taskId,
  conversationHistory,
  onContinue,
  onClose
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onContinue(taskId, message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-slate-700 bg-slate-800/50 p-4">
      {/* Conversation History Preview */}
      {conversationHistory.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-slate-500 mb-2">对话历史 ({conversationHistory.length} 条)</p>
          <div className="max-h-32 overflow-y-auto bg-slate-900/50 rounded-lg p-2 space-y-2">
            {conversationHistory.slice(-3).map((msg, i) => (
              <div key={i} className={`text-xs ${msg.role === 'user' ? 'text-indigo-300' : 'text-slate-400'}`}>
                <span className="font-semibold">{msg.role === 'user' ? '用户: ' : '助手: '}</span>
                <span className="truncate">{msg.content}</span>
              </div>
            ))}
            {conversationHistory.length > 3 && (
              <p className="text-xs text-slate-600 text-center">...还有 {conversationHistory.length - 3} 条</p>
            )}
          </div>
        </div>
      )}

      {/* Continue Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入继续对话的内容..."
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={2}
        />
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            继续
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            关闭
          </button>
        </div>
      </form>

      {/* Hint */}
      <p className="text-xs text-slate-500 mt-2">
        按 Enter 发送，Shift+Enter 换行
      </p>
    </div>
  );
};

export default ContinueConversationPanel;
