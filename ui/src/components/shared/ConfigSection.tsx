import React from 'react';

interface ConfigSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  color?: 'indigo' | 'emerald' | 'purple' | 'cyan' | 'yellow' | 'blue';
  className?: string;
}

const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  description,
  children,
  color = 'indigo',
  className = ''
}) => {
  const colorClasses = {
    indigo: 'border-indigo-500',
    emerald: 'border-emerald-500',
    purple: 'border-purple-500',
    cyan: 'border-cyan-500',
    yellow: 'border-yellow-500',
    blue: 'border-blue-500'
  };

  return (
    <div className={`mb-6 ${className}`}>
      <h3 className={`text-base font-bold text-slate-800 flex items-center border-l-4 ${colorClasses[color]} pl-3`}>
        {title}
      </h3>
      {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      <div className="mt-3">
        {children}
      </div>
    </div>
  );
};

export default ConfigSection;