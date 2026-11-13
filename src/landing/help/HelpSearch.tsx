import React from 'react';
import { SearchIcon } from '../../design-system/toolIcons';
import { HELP_SEARCH_IDS } from './helpSearchIds';

export const HelpSearch: React.FC<{ className?: string }> = ({ className }) => (
  <form role="search" action="/help" method="get" data-help-search="" className={`relative ${className ?? ''}`}>
    <label htmlFor={HELP_SEARCH_IDS.input} className="sr-only">
      Search help
    </label>
    <SearchIcon className="absolute left-[14px] top-[13px] w-[18px] h-[18px] text-white/50 pointer-events-none" />
    <input
      id={HELP_SEARCH_IDS.input}
      type="search"
      name="q"
      placeholder="Search help"
      autoComplete="off"
      spellCheck={false}
      role="combobox"
      aria-expanded="false"
      aria-controls={HELP_SEARCH_IDS.results}
      aria-autocomplete="list"
      className="w-full h-[44px] pl-[42px] pr-[48px] rounded-[8px] bg-white/[0.06] text-[15px] text-white/90 placeholder:text-white/50 outline-none transition-colors duration-150 hover:bg-white/[0.08] focus:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#0d99ff] [&::-webkit-search-cancel-button]:appearance-none"
    />
    <kbd className="hidden sm:flex absolute right-[12px] top-[11px] min-w-[22px] h-[22px] px-[6px] items-center justify-center rounded-[6px] bg-white/[0.08] font-sans text-[13px] font-medium leading-none text-white/50 pointer-events-none">
      /
    </kbd>
    <div
      id={HELP_SEARCH_IDS.results}
      role="listbox"
      aria-label="Search results"
      hidden
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 max-h-[min(480px,70vh)] overflow-y-auto p-[6px] rounded-[14px] bg-[#282828] shadow-[0_0_0_0.5px_rgba(0,0,0,0.6),0_16px_40px_-8px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.25)]"
    />
  </form>
);
