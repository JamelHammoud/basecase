import React from 'react';
import { ChevronRightIcon } from './glyphs';

export interface BrowseRowProps {
  title: string;
  meta: string;
  thumb?: React.ReactNode;
  active?: boolean;
  onOpen: () => void;
}

export const BrowseRow: React.FC<BrowseRowProps> = ({ title, meta, thumb, active, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`group w-full flex items-center gap-3 h-[52px] ${thumb ? 'px-1.5' : 'px-2.5'} rounded-xl text-left cursor-default ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'} active:scale-[0.99] transition-[background-color,transform] duration-150`}
  >
    {thumb}
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-medium text-white/90 truncate">{title}</div>
      <div className="text-[12px] text-white/50 truncate">{meta}</div>
    </div>
    <ChevronRightIcon
      className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-white/50' : 'text-white/25 group-hover:text-white/50'}`}
    />
  </button>
);
