import React from 'react';

export interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon, action, badge, className = '' }) => (
  <div
    className={`flex items-center justify-between h-8 px-1 text-[12.5px] font-medium text-white/45 select-none ${className}`}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      {icon && <span className="shrink-0 flex">{icon}</span>}
      <span className="truncate">{title}</span>
      {badge}
    </div>
    {action && <div className="shrink-0 flex items-center">{action}</div>}
  </div>
);
