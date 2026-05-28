import React, { useEffect, useRef } from 'react';

interface ThinkingPanelProps {
  thinking: string;
  isStreaming?: boolean;
}

const ThinkingPanel: React.FC<ThinkingPanelProps> = ({ thinking, isStreaming = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when thinking updates
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [thinking]);

  // Parse thinking content to handle markdown-like formatting
  const renderThinking = (content: string) => {
    if (!content) return null;

    // Simple markdown-like parsing for thinking content
    // Handle common patterns like **bold**, *italic*, `code`, etc.
    const lines = content.split('\n');

    return lines.map((line, lineIndex) => {
      // Handle numbered lists
      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={lineIndex} className="pl-4 mb-1">
            <span className="text-indigo-400 mr-2">{line.match(/^(\d+\.)/)?.[1]}</span>
            <span className="text-slate-300">{line.replace(/^\d+\.\s/, '')}</span>
          </div>
        );
      }

      // Handle bullet lists
      if (/^[-*]\s/.test(line)) {
        return (
          <div key={lineIndex} className="pl-4 mb-1 flex items-start">
            <span className="text-indigo-400 mr-2">•</span>
            <span className="text-slate-300">{line.replace(/^[-*]\s/, '')}</span>
          </div>
        );
      }

      // Handle headers
      if (/^#{1,3}\s/.test(line)) {
        const level = line.match(/^(#{1,3})/)?.[1].length || 1;
        const text = line.replace(/^#{1,3}\s/, '');
        const sizeClass = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
        return (
          <div key={lineIndex} className={`font-semibold text-indigo-300 ${sizeClass} mb-2 mt-3`}>
            {text}
          </div>
        );
      }

      // Handle code blocks (simple inline code)
      if (line.includes('`')) {
        const parts = line.split(/`/);
        return (
          <div key={lineIndex} className="mb-1 font-mono text-sm">
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <code key={i} className="bg-slate-700 text-emerald-300 px-1.5 py-0.5 rounded text-xs">
                  {part}
                </code>
              ) : (
                <span key={i} className="text-slate-300">{part}</span>
              )
            )}
          </div>
        );
      }

      // Handle bold text
      if (line.includes('**')) {
        const parts = line.split(/\*\*/);
        return (
          <div key={lineIndex} className="mb-1">
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <span key={i} className="font-semibold text-white">{part}</span>
              ) : (
                <span key={i} className="text-slate-300">{part}</span>
              )
            )}
          </div>
        );
      }

      // Regular text
      return line.trim() ? (
        <div key={lineIndex} className="mb-1 text-slate-300">
          {line}
          {isStreaming && lineIndex === lines.length - 1 && (
            <span className="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse" />
          )}
        </div>
      ) : (
        <div key={lineIndex} className="h-2" />
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm font-medium text-slate-200">思考过程</span>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs text-slate-400">思考中...</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 bg-slate-900/50 font-mono text-sm leading-relaxed"
        style={{ maxHeight: '300px' }}
      >
        {thinking ? (
          renderThinking(thinking)
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-xs">等待模型思考...</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {thinking && (
        <div className="px-4 py-2 bg-slate-800/50 border-t border-slate-700">
          <span className="text-xs text-slate-500">
            {thinking.length} 字符
          </span>
        </div>
      )}
    </div>
  );
};

export default ThinkingPanel;
