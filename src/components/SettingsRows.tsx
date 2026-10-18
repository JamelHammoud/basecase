import React from 'react';
import { Kbd } from '../design-system';

/**
 * A titled group of Settings rows: a sentence-case label above a rounded inset card, with
 * full-width hairlines between rows. The label, the card and the pane title share one left
 * edge; row content sits 16px inside the card.
 */
export const SettingsGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-[24px] last:mb-0">
    <h4 className="mb-[8px] text-[12.5px] font-medium text-white/45">{title}</h4>
    <div className="rounded-[12px] bg-white/[0.035] divide-y divide-white/[0.06]">{children}</div>
  </section>
);

/** One Settings row: label (+ shortcut) and an optional hint on the left, the control on the right. */
export const SettingsRow: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  shortcut?: string;
  /** Stacks the control under the label, full width (text fields) */
  stacked?: boolean;
  children?: React.ReactNode;
}> = ({ label, hint, shortcut, stacked = false, children }) => (
  <div
    className={`px-[16px] py-[10px] min-h-[52px] ${
      stacked ? 'flex flex-col gap-[10px]' : 'flex items-center justify-between gap-[24px]'
    }`}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-[8px] text-[13.5px] text-white/90">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </div>
      {hint && !stacked && <Hint>{hint}</Hint>}
    </div>
    {children && <div className={stacked ? 'min-w-0' : 'shrink-0 flex items-center'}>{children}</div>}
    {/* Stacked rows put the hint under the field (e.g. connection status) */}
    {hint && stacked && <Hint className="-mt-[4px]">{hint}</Hint>}
  </div>
);

const Hint: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = 'mt-[2px]', children }) => (
  <div className={`text-[12.5px] leading-[1.4] text-white/45 ${className}`}>{children}</div>
);
