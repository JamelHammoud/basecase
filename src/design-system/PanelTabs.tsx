import React from 'react';
import { AGENT_COLOR } from './theme';

export interface PanelTab<T extends string> {
  value: T;
  label: string;
  /** Shown before the label, e.g. the agent spinner while it works */
  indicator?: React.ReactNode;
}

export interface PanelTabsProps<T extends string> {
  tabs: PanelTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the tab list for screen readers */
  label: string;
}

/**
 * A card's view switcher (Layers · Parts · Library, Inspect · Agent), in the same voice as the
 * scene tabs: quiet labels, the current one on a soft pill. Content-sized and left-aligned.
 */
export function PanelTabs<T extends string>({ tabs, value, onChange, label }: PanelTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-0.5 select-none">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`h-[28px] px-[10px] rounded-[8px] flex items-center gap-1.5 text-[13px] font-medium cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
              selected
                ? 'bg-white/[0.08] text-white/90'
                : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
            }`}
          >
            {tab.indicator}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Claude's coral ring, spinning while an agent works (scene tabs, the Agent tab) */
export const AgentSpinner: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg
    viewBox="0 0 16 16"
    className={`${className} shrink-0 motion-safe:animate-spin [animation-duration:900ms]`}
    aria-label="Agent working"
  >
    <circle cx="8" cy="8" r="6" fill="none" stroke={AGENT_COLOR} strokeOpacity="0.3" strokeWidth="2.25" />
    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={AGENT_COLOR} strokeWidth="2.25" strokeLinecap="round" />
  </svg>
);
