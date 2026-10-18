import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center text-center px-6 py-10 select-none ${className}`}>
    {icon && (
      <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/45 mb-3">
        {icon}
      </div>
    )}
    <div className="text-[14px] font-medium text-white/80">{title}</div>
    {description && <p className="text-[13px] text-white/45 mt-1 leading-relaxed max-w-56">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);
