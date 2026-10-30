import React from 'react';
import { AcpPlanEntry } from '../../types/robotics';
import { THEME_COLORS, CircleIcon, SpinnerIcon, TickIcon } from '../../design-system';

type PlanStatus = AcpPlanEntry['status'];

const STATUS_ICON: Record<PlanStatus, React.ReactNode> = {
  completed: <TickIcon className="w-3.5 h-3.5 text-white/40" strokeWidth={2.5} />,
  in_progress: <SpinnerIcon className="w-3.5 h-3.5 animate-spin" style={{ color: THEME_COLORS.textPrimary }} />,
  pending: <CircleIcon className="w-3 h-3 text-white/25" />,
};

const STATUS_TEXT: Record<PlanStatus, string> = {
  completed: 'text-white/45',
  in_progress: 'text-white',
  pending: 'text-white/70',
};

export const PlanCard: React.FC<{ entries: AcpPlanEntry[] }> = ({ entries }) => {
  const done = entries.filter((e) => e.status === 'completed').length;

  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-white/70">Plan</span>
        <span className="text-[12px] text-white/40 tabular">
          {done}/{entries.length}
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
            <span className="mt-[3px] w-3.5 h-3.5 shrink-0 flex items-center justify-center">
              {STATUS_ICON[e.status] ?? STATUS_ICON.pending}
            </span>
            <span className={`min-w-0 break-words ${STATUS_TEXT[e.status] ?? STATUS_TEXT.pending}`}>{e.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
