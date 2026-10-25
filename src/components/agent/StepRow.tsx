import React, { createElement } from 'react';
import { DisclosureChevron } from './Disclosure';
import { SHIMMER_TEXT } from './shimmer';
import { ToolIcon } from './toolRules';

const tone = (failed: boolean) =>
  failed ? 'text-red-400/80 enabled:hover:text-red-400' : 'text-white/45 enabled:hover:text-white/80';

export const StepRow: React.FC<{
  icon: ToolIcon;
  title: string;
  detail?: string;
  running: boolean;
  failed: boolean;
  expandable: boolean;
  open: boolean;
  onToggle: () => void;
}> = ({ icon, title, detail, running, failed, expandable, open, onToggle }) => (
  <button
    type="button"
    disabled={!expandable}
    onClick={onToggle}
    aria-expanded={expandable ? open : undefined}
    className={`group/tool max-w-[calc(100%+4px)] -ml-1 pl-1 pr-2 py-[5px] flex items-start gap-2 text-left text-[13px] leading-[18px] rounded-md cursor-default transition-colors enabled:hover:bg-white/[0.04] ${tone(failed)}`}
  >
    <span className="h-[18px] flex items-center shrink-0">{createElement(icon, { className: 'w-4 h-4' })}</span>
    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
      <span className={running ? SHIMMER_TEXT : undefined}>{title}</span>
      {detail && <span className="ml-[10px] opacity-60">{detail}</span>}
    </span>
    {expandable && (
      <span className="h-[18px] flex items-center shrink-0">
        <DisclosureChevron open={open} group="tool" />
      </span>
    )}
  </button>
);
