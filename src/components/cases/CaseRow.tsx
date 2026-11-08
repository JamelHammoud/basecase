import React from 'react';

interface CaseRowProps {
  name: string;
  brief: string;
  selected?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const CaseRow: React.FC<CaseRowProps> = ({ name, brief, selected, icon, onClick, onContextMenu }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    onContextMenu={onContextMenu}
    className={`w-full min-h-[52px] px-[8px] py-2 rounded-[8px] flex items-start gap-2 text-left cursor-default transition-colors ${
      selected ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
    }`}
  >
    {icon && <span className="mt-0.5 shrink-0 text-white/55">{icon}</span>}
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-medium text-white/90 truncate">{name}</span>
      <span className="block text-[12px] text-white/45 leading-snug">{brief}</span>
    </span>
  </button>
);
